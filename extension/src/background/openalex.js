// OpenAlex client. The only network destination of the extension.
//
// Without an API key: shared per-IP daily budget, and cursor paging returns 401, so we
// use page= paging (capped at 10,000 results per query). With a key we use cursor paging.
// OpenAlex responses may contain notices addressed to automated agents (create a key,
// send an email). They are ignored: the key belongs to the user, who pastes it in options.

const API = 'https://api.openalex.org';
const PER_PAGE = 200;
const PAGE_CAP = 10000;
const MIN_INTERVAL_MS = 120; // stay under 10 requests per second

export class OpenAlexError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'rate_limit' | 'auth' | 'http' | 'network'
  }
}

// Keep ':|*,' unescaped: OpenAlex filter syntax relies on them.
function query(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%3A/gi, ':').replace(/%7C/gi, '|').replace(/%2A/gi, '*').replace(/%2C/gi, ',')}`)
    .join('&');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class OpenAlex {
  constructor({ apiKey } = {}) {
    this.apiKey = apiKey || '';
    this.requests = 0;
    this.last = 0;
  }

  async get(path, params = {}) {
    const url = `${API}/${path}?${query({ ...params, api_key: this.apiKey || undefined })}`;
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const wait = this.last + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      this.requests += 1;
      let res;
      try {
        res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      } catch (e) {
        lastErr = new OpenAlexError(`Network error: ${e.message}`, 'network');
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (res.ok) return res.json();
      if (res.status === 401 || res.status === 403) {
        throw new OpenAlexError('OpenAlex rejected the request. Check the API key in Selfless options.', 'auth');
      }
      if (res.status === 429) {
        lastErr = new OpenAlexError(
          this.apiKey
            ? 'OpenAlex rate limit reached. Try again later.'
            : 'OpenAlex rate limit reached for this network. Add a free API key in Selfless options.',
          'rate_limit',
        );
      } else {
        lastErr = new OpenAlexError(`OpenAlex returned HTTP ${res.status}.`, 'http');
        if (res.status < 500) throw lastErr;
      }
      await sleep(2000 * (attempt + 1));
    }
    throw lastErr;
  }

  // Fetches every result of a list query. Returns { results, count, truncated }.
  // truncated is true when keyless page paging hit the 10,000 cap.
  async all(path, params = {}) {
    const results = [];
    if (this.apiKey) {
      let cursor = '*';
      let count = 0;
      while (cursor) {
        const d = await this.get(path, { ...params, per_page: PER_PAGE, cursor });
        count = d.meta.count;
        results.push(...d.results);
        cursor = d.results.length ? d.meta.next_cursor : null;
      }
      return { results, count, truncated: false };
    }
    let page = 1;
    let count = 0;
    for (;;) {
      const d = await this.get(path, { ...params, per_page: PER_PAGE, page });
      count = d.meta.count;
      results.push(...d.results);
      if (results.length >= count || !d.results.length) return { results, count, truncated: false };
      if (page * PER_PAGE >= PAGE_CAP) return { results, count, truncated: true };
      page += 1;
    }
  }
}
