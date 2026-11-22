// Background service worker: every OpenAlex call happens here, results are cached per
// Scholar user ID. The content script talks to it through a port named 'selfless'
// (analysis with progress) and one-shot messages (row matching, cache reset).

import { matchRows, summarize } from '../lib/compute.js';
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

function respond(result, rows) {
  return {
    type: 'result',
    result,
    summary: summarize(result.works),
    matches: matchRows(rows, result.works),
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
      send(respond(result, msg.profile.rows));
    } catch (e) {
      send({ type: 'error', message: e.message, code: e.code || 'unknown' });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'match') {
    getSettings()
      .then((s) => getCached(msg.scholarId, s.overrides[msg.scholarId] || null, msg.sinceYear))
      .then((r) => sendResponse(r ? { matches: matchRows(msg.rows, r.works) } : { matches: null }));
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
