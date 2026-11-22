// Pure logic: no chrome.*, no fetch. Imported by the service worker and by the Node tests.
//
// Filter definitions (see CLAUDE.md). For a cited paper P on the profile of owner O, a
// citing work X is removed by:
//   self      if O is among X's authors
//   paper     if any author of P is among X's authors
//   coauthor  if any author of any of O's works (or O) is among X's authors
// Nested: self ⊆ paper ⊆ coauthor. Identity is the OpenAlex author ID, never a name.

export const FILTERS = ['self', 'paper', 'coauthor'];

export const shortId = (url) => {
  const s = String(url);
  return s.slice(s.lastIndexOf('/') + 1);
};

export function authorIds(work) {
  const out = new Set();
  for (const a of work.authorships || []) {
    if (a.author && a.author.id) out.add(shortId(a.author.id));
  }
  return out;
}

const intersects = (a, b) => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

export function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '');
}

export function normalizeTitle(s) {
  return stripTags(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Matching key: normalized title without spaces, first 20 characters (as in the spike).
export const titleKey = (s) => normalizeTitle(s).replace(/ /g, '').slice(0, 20);

// citingWorks: OpenAlex works with authorships, publication_year and referenced_works.
// Returns Map(citedId -> Map(citingId -> {authors: Set, year})).
export function attributeCitations(ownIds, citingWorks, into = new Map()) {
  for (const cw of citingWorks) {
    const entry = { authors: authorIds(cw), year: cw.publication_year || null };
    const citingId = shortId(cw.id);
    for (const ref of cw.referenced_works || []) {
      const cited = shortId(ref);
      if (!ownIds.has(cited)) continue;
      if (!into.has(cited)) into.set(cited, new Map());
      into.get(cited).set(citingId, entry);
    }
  }
  return into;
}

const emptyCounts = () => ({ all: 0, self: 0, paper: 0, coauthor: 0 });

// works: the owner's OpenAlex works (with authorships). ownerIds: one or more author IDs
// (Scholar profiles can be split across several OpenAlex IDs). sinceYear: Scholar's
// "Since" column year; citing works published in or after it also count in `since`.
// Returns { perWork: Map(id -> {counts, since, byYear}), coauthorCount }, where each
// filter value is the number of citing works that filter REMOVES. byYear groups the same
// citations by the citing work's publication year (Scholar's chart).
// The network is built from every work of the OpenAlex record, even works that
// clusterWorks later sets aside as another person's: their co-authors would only matter
// if they cited this author, which is unlikely when the two fields are unrelated.
export function countCitations(ownerIds, works, cites, sinceYear = null) {
  const owner = new Set(ownerIds);
  const network = new Set(owner);
  for (const w of works) for (const a of authorIds(w)) network.add(a);
  const perWork = new Map();
  for (const w of works) {
    const id = shortId(w.id);
    const paperAuthors = authorIds(w);
    for (const o of owner) paperAuthors.add(o);
    const counts = emptyCounts();
    const since = emptyCounts();
    const byYear = {};
    for (const { authors, year } of (cites.get(id) || new Map()).values()) {
      const targets = sinceYear && year && year >= sinceYear ? [counts, since] : [counts];
      if (year) targets.push((byYear[year] = byYear[year] || emptyCounts()));
      for (const c of targets) {
        c.all += 1;
        if (intersects(authors, owner)) c.self += 1;
        if (intersects(authors, paperAuthors)) c.paper += 1;
        if (intersects(authors, network)) c.coauthor += 1;
      }
    }
    perWork.set(id, { counts, since, byYear });
  }
  let coauthorCount = 0;
  for (const a of network) if (!owner.has(a)) coauthorCount += 1;
  return { perWork, coauthorCount };
}

export const kept = (counts, filter) =>
  filter && filter !== 'off' ? counts.all - counts[filter] : counts.all;

export function hIndex(values) {
  const v = [...values].sort((a, b) => b - a);
  let h = 0;
  while (h < v.length && v[h] >= h + 1) h += 1;
  return h;
}

export const i10Index = (values) => values.filter((x) => x >= 10).length;

function indices(vals) {
  return { citations: vals.reduce((s, x) => s + x, 0), h: hIndex(vals), i10: i10Index(vals) };
}

// works: [{counts, since, byYear}]. Returns, for 'off' and each filter,
// { citations, h, i10, since: {citations, h, i10} } plus `removed` for the filters, and
// byYear: {year: counts} summed over the works (Scholar's chart).
// Scholar's "Since" indices count only citations received since that year; same here.
export function summarize(works) {
  const out = { byYear: {} };
  for (const w of works) {
    for (const [y, c] of Object.entries(w.byYear || {})) {
      const t = (out.byYear[y] = out.byYear[y] || emptyCounts());
      for (const k of Object.keys(t)) t[k] += c[k];
    }
  }
  for (const f of ['off', ...FILTERS]) {
    out[f] = indices(works.map((w) => kept(w.counts, f)));
    out[f].since = indices(works.map((w) => (w.since ? kept(w.since, f) : 0)));
  }
  for (const f of FILTERS) out[f].removed = out.off.citations - out[f].citations;
  return out;
}

// OpenAlex sometimes merges two people with the same name into one author record. The
// works matched to Scholar rows (seeds) are certainly the profile owner's; any other work
// that shares a co-author with them, directly or through a chain of such works, is kept
// too. Co-authors exclude the owner. Works with no link (including solo works not on the
// page) are set aside. works: [{id, coauthors: [author ids]}].
// Returns the Set of kept work ids; with no seeds, every work is kept.
export function clusterWorks(works, seedIds) {
  const kept = new Set([...seedIds].filter(Boolean));
  if (!kept.size) return new Set(works.map((w) => w.id));
  const linked = new Set();
  for (const w of works) if (kept.has(w.id)) for (const a of w.coauthors || []) linked.add(a);
  let grew = true;
  while (grew) {
    grew = false;
    for (const w of works) {
      if (kept.has(w.id) || !(w.coauthors || []).some((a) => linked.has(a))) continue;
      kept.add(w.id);
      for (const a of w.coauthors) linked.add(a);
      grew = true;
    }
  }
  return kept;
}

const yearsCompatible = (a, b) => !a || !b || Math.abs(Number(a) - Number(b)) <= 1;

// rows: Scholar rows [{title, year}] in page order. works: [{id, key, year, counts}].
// Each work is used at most once; among candidates the most cited wins.
// Returns an array aligned with rows: work id or null ("not found", never zero).
export function matchRows(rows, works) {
  const byKey = new Map();
  for (const w of works) {
    if (!w.key) continue;
    if (!byKey.has(w.key)) byKey.set(w.key, []);
    byKey.get(w.key).push(w);
  }
  const used = new Set();
  return rows.map((r) => {
    const cands = (byKey.get(titleKey(r.title)) || []).filter(
      (w) => !used.has(w.id) && yearsCompatible(r.year, w.year),
    );
    if (!cands.length) return null;
    cands.sort((a, b) => b.counts.all - a.counts.all);
    used.add(cands[0].id);
    return cands[0].id;
  });
}

// Name comparison used only to choose between candidate author IDs; identity afterwards is
// always the ID. Same last name and same first initial.
function nameParts(s) {
  const t = normalizeTitle(String(s || '').replace(/[.\-]/g, ' ')).split(' ').filter(Boolean);
  return { first: (t[0] || '')[0] || '', last: t[t.length - 1] || '' };
}

export function sameName(a, b) {
  const x = nameParts(a);
  const y = nameParts(b);
  return !!x.last && x.last === y.last && x.first === y.first;
}

// probeWorks: OpenAlex works matched to visible Scholar titles. Returns the author IDs
// that look like the profile owner: name-compatible, ranked by how many probes they
// appear on. Extra IDs are kept when they appear on at least two probes (split profiles).
export function pickOwnerIds(profileName, probeWorks) {
  const seen = new Map(); // id -> {count, name}
  for (const w of probeWorks) {
    for (const a of w.authorships || []) {
      if (!a.author || !a.author.id) continue;
      const id = shortId(a.author.id);
      const e = seen.get(id) || { count: 0, name: a.author.display_name };
      e.count += 1;
      seen.set(id, e);
    }
  }
  const cands = [...seen.entries()]
    .filter(([, e]) => sameName(profileName, e.name))
    .sort((a, b) => b[1].count - a[1].count);
  if (!cands.length) return [];
  return cands.filter(([, e], i) => i === 0 || e.count >= 2).map(([id]) => id);
}
