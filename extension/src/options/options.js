import { DEFAULT_SETTINGS, getSettings } from '../background/store.js';

const $ = (id) => document.getElementById(id);
const ID_RE = /^A\d+$/;

function parseOverrides(text) {
  const out = {};
  const errors = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const [user, ids] = t.split('=').map((s) => (s || '').trim());
    const list = (ids || '')
      .split(',')
      .map((s) => s.trim().replace(/^https?:\/\/openalex\.org\/(authors\/)?/i, '').toUpperCase())
      .filter(Boolean);
    if (!user || !list.length || !list.every((x) => ID_RE.test(x))) errors.push(`Line ${i + 1} is not "SCHOLAR_ID = A123, A456".`);
    else out[user] = list;
  });
  return { out, errors };
}

const formatOverrides = (o) =>
  Object.entries(o)
    .map(([user, ids]) => `${user} = ${ids.join(', ')}`)
    .join('\n');

async function load() {
  const s = await getSettings();
  $('apiKey').value = s.apiKey;
  $('defaultFilter').value = s.defaultFilter;
  $('overrides').value = formatOverrides(s.overrides);
}

async function save() {
  const { out, errors } = parseOverrides($('overrides').value);
  $('overrideStatus').textContent = errors.join(' ');
  if (errors.length) return;
  const settings = {
    ...DEFAULT_SETTINGS,
    apiKey: $('apiKey').value.trim(),
    defaultFilter: $('defaultFilter').value,
    overrides: out,
  };
  await chrome.storage.local.set({ settings });
  $('saveStatus').textContent = 'Saved.';
  setTimeout(() => ($('saveStatus').textContent = ''), 2000);
}

async function testKey() {
  const key = $('apiKey').value.trim();
  if (!key) {
    $('keyStatus').textContent = 'No key entered. Selfless will use the shared keyless budget.';
    return;
  }
  $('keyStatus').textContent = 'Testing...';
  try {
    // Cursor paging is refused without a valid key, so it doubles as a key check.
    const res = await fetch(
      `https://api.openalex.org/works?select=id&per_page=1&cursor=*&api_key=${encodeURIComponent(key)}`,
      { credentials: 'omit', referrerPolicy: 'no-referrer' },
    );
    $('keyStatus').textContent = res.ok ? 'Key accepted by OpenAlex.' : `OpenAlex refused the key (HTTP ${res.status}).`;
  } catch (e) {
    $('keyStatus').textContent = `Could not reach OpenAlex: ${e.message}`;
  }
}

$('toggleKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('toggleKey').textContent = show ? 'Hide' : 'Show';
});
$('testKey').addEventListener('click', testKey);
$('save').addEventListener('click', save);
$('clearCache').addEventListener('click', async () => {
  const { cleared } = await chrome.runtime.sendMessage({ type: 'clearCache' });
  $('cacheStatus').textContent = `Cleared ${cleared} cached ${cleared === 1 ? 'profile' : 'profiles'}.`;
});

load();
