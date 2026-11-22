// Port of spike/openalex_filters.py: author resolution, the owner's works, batched citing
// queries, the three filters. Everything is computed over the full OpenAlex work list;
// Scholar rows are only used to find the author and to annotate the page.

import {
  attributeCitations,
  authorIds,
  countCitations,
  normalizeTitle,
  pickOwnerIds,
  shortId,
  stripTags,
  titleKey,
} from '../lib/compute.js';

export const RESULT_VERSION = 4;
const PROBES = 8; // visible Scholar rows used to find the author
const BATCH = 50; // cited IDs per cites: query
const PAGE_CAP = 10000;

async function resolveOwner(client, profile, progress) {
  progress('Finding the author in OpenAlex');
  const rows = profile.rows.filter((r) => normalizeTitle(r.title).length >= 12).slice(0, PROBES);
  const probes = [];
  for (const r of rows) {
    const d = await client.get('works', {
      filter: `title.search:${normalizeTitle(r.title)}`,
      select: 'id,title,publication_year,authorships',
      per_page: 5,
    });
    const key = titleKey(r.title);
    probes.push(...d.results.filter((w) => titleKey(w.title) === key));
  }
  return pickOwnerIds(profile.name, probes);
}

// Fetches citing works for a batch of cited IDs. Keyless page paging stops at 10,000
// results, so large batches are split until they fit.
async function citingWorks(client, ids) {
  const params = { filter: `cites:${ids.join('|')}`, select: 'id,publication_year,authorships,referenced_works' };
  if (!client.apiKey && ids.length > 1) {
    const head = await client.get('works', { ...params, select: 'id', per_page: 1 });
    if (head.meta.count > PAGE_CAP) {
      const mid = Math.ceil(ids.length / 2);
      const a = await citingWorks(client, ids.slice(0, mid));
      const b = await citingWorks(client, ids.slice(mid));
      return { results: [...a.results, ...b.results], truncated: a.truncated || b.truncated };
    }
  }
  return client.all('works', params);
}

// profile: { scholarId, name, sinceYear, rows: [{title, year}] }. override: OpenAlex author IDs or null.
export async function analyze(client, profile, override, progress) {
  const ownerIds = override && override.length ? override : await resolveOwner(client, profile, progress);
  if (!ownerIds.length) {
    const e = new Error('Could not find this author in OpenAlex. You can set the OpenAlex author ID in Selfless options.');
    e.code = 'not_found';
    throw e;
  }

  progress('Loading works');
  const { results: works } = await client.all('works', {
    filter: `author.id:${ownerIds.join('|')}`,
    select: 'id,title,publication_year,cited_by_count,authorships',
  });
  const own = new Set(works.map((w) => shortId(w.id)));

  const cited = works.filter((w) => w.cited_by_count > 0).map((w) => shortId(w.id));
  const cites = new Map();
  let truncated = false;
  const batches = Math.ceil(cited.length / BATCH);
  for (let k = 0; k < cited.length; k += BATCH) {
    progress(`Loading citing works, batch ${k / BATCH + 1} of ${batches}`);
    const r = await citingWorks(client, cited.slice(k, k + BATCH));
    truncated = truncated || r.truncated;
    attributeCitations(own, r.results, cites);
  }

  const owner = new Set(ownerIds);
  const { perWork, coauthorCount } = countCitations(ownerIds, works, cites, profile.sinceYear);
  return {
    version: RESULT_VERSION,
    scholarId: profile.scholarId,
    sinceYear: profile.sinceYear || null,
    computedAt: Date.now(),
    ownerIds,
    overridden: !!(override && override.length),
    coauthorCount,
    truncated,
    requests: client.requests,
    works: works.map((w) => {
      const id = shortId(w.id);
      return {
        id,
        title: stripTags(w.title),
        year: w.publication_year,
        key: titleKey(w.title),
        counts: perWork.get(id).counts,
        since: perWork.get(id).since,
        byYear: perWork.get(id).byYear,
        coauthors: [...authorIds(w)].filter((a) => !owner.has(a)),
      };
    }),
  };
}
