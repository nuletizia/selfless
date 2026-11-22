// Settings and cache, both in chrome.storage.local. Never chrome.storage.sync: that would
// copy the API key and results to the user's Google account.

import { RESULT_VERSION } from './analyze.js';

export const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const RESULT_PREFIX = 'result:';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  defaultFilter: 'off', // 'off' | 'self' | 'paper' | 'coauthor'
  overrides: {}, // Scholar user ID -> [OpenAlex author IDs]
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

const sameIds = (a, b) => [...a].sort().join('|') === [...b].sort().join('|');

// Returns a cached result if it is fresh, matches the user's author override and was
// computed for the same Scholar "Since" year.
export async function getCached(scholarId, override, sinceYear = null) {
  const key = RESULT_PREFIX + scholarId;
  const { [key]: r } = await chrome.storage.local.get(key);
  if (!r || r.version !== RESULT_VERSION) return null;
  if (Date.now() - r.computedAt > CACHE_TTL_MS) return null;
  if (sinceYear && r.sinceYear !== sinceYear) return null;
  if (override && override.length && !sameIds(override, r.ownerIds)) return null;
  if (!(override && override.length) && r.overridden) return null;
  return r;
}

export async function putCached(result) {
  await chrome.storage.local.set({ [RESULT_PREFIX + result.scholarId]: result });
}

export async function clearCache() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(RESULT_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}
