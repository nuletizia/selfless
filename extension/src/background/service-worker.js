// Background service worker: every OpenAlex call happens here, results are cached per
// Scholar user ID. The content script talks to it through a port named 'selfless'
// (analysis with progress) and one-shot messages (row matching, cache reset).

import { clusterWorks, matchRows, summarize } from '../lib/compute.js';
import { analyze } from './analyze.js';
import { OpenAlex } from './openalex.js';
import { clearCache, getCached, getSettings, putCached } from './store.js';

const inFlight = new Map(); // scholarId -> { promise, listeners: Set }

async function run(profile, force, onProgress) {
  const settings = await getSettings();
  const override = settings.overrides[profile.scholarId] || null;
  if (!force) {
    const cached = await getCached(profile.scholarId, override, profile.sinceYear);
    if (cached) return cached;
  }
  let job = inFlight.get(profile.scholarId);
  if (!job) {
    job = { listeners: new Set() };
    const progress = (text) => job.listeners.forEach((l) => l(text));
    const client = new OpenAlex({ apiKey: settings.apiKey });
    job.promise = analyze(client, profile, override, progress)
      .then(async (r) => {
        await putCached(r);
        return r;
      })
      .finally(() => inFlight.delete(profile.scholarId));
    inFlight.set(profile.scholarId, job);
  }
  job.listeners.add(onProgress);
  try {
    return await job.promise;
  } finally {
    job.listeners.delete(onProgress);
  }
}

// More verified citations than Scholar counts at all means OpenAlex has merged another
// person into this author record (OpenAlex normally sees fewer citations than Scholar).
const MERGE_RATIO = 1.05;

// Matches the Scholar rows loaded so far and summarizes the works. Only when the record
// looks merged are the works restricted to those linked to the Scholar rows through
// co-authors (clusterWorks): on a clean profile that would wrongly drop solo and older
// papers not yet on the page. Cheap: runs again from the cache on "Show more".
function evaluate(result, rows, scholarTotal) {
  const matches = matchRows(rows, result.works);
  const full = summarize(result.works);
  const merged = !!scholarTotal && full.off.citations > scholarTotal * MERGE_RATIO;
  if (!merged) return { matches, merged, included: result.works.map((w) => w.id), summary: full };
  const included = clusterWorks(result.works, matches);
  return {
    matches,
    merged,
    included: [...included],
    summary: summarize(result.works.filter((w) => included.has(w.id))),
  };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'selfless') return;
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
  });
  const send = (msg) => {
    if (open) port.postMessage(msg);
  };
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'analyze') return;
    try {
      const result = await run(msg.profile, !!msg.force, (text) => send({ type: 'progress', text }));
      send({ type: 'result', result, ...evaluate(result, msg.profile.rows, msg.profile.scholarTotal) });
    } catch (e) {
      send({ type: 'error', message: e.message, code: e.code || 'unknown' });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'match') {
    getSettings()
      .then((s) => getCached(msg.scholarId, s.overrides[msg.scholarId] || null, msg.sinceYear))
      .then((r) => sendResponse(r ? evaluate(r, msg.rows, msg.scholarTotal) : { matches: null }));
    return true;
  }
  if (msg.type === 'clearCache') {
    clearCache().then((n) => sendResponse({ cleared: n }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
