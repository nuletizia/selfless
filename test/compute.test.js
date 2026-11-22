import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attributeCitations,
  countCitations,
  hIndex,
  i10Index,
  matchRows,
  pickOwnerIds,
  sameName,
  summarize,
  titleKey,
} from '../extension/src/lib/compute.js';

const A = (id, name = id) => ({ author: { id: `https://openalex.org/${id}`, display_name: name } });
const W = (id, authors, refs = [], extra = {}) => ({
  id: `https://openalex.org/${id}`,
  authorships: authors.map((a) => A(a)),
  referenced_works: refs.map((r) => `https://openalex.org/${r}`),
  ...extra,
});

test('titleKey normalizes like the spike', () => {
  assert.equal(titleKey('State-of-the-Art in <i>Power Line</i> Communications'), 'stateoftheartinpower');
  assert.equal(titleKey('Café: Über'), 'cafeuber');
});

test('three filters are nested and use IDs', () => {
  // Owner O wrote P1 with C1, P2 with C2.
  const works = [W('P1', ['O', 'C1']), W('P2', ['O', 'C2'])];
  const citing = [
    W('X1', ['O', 'Z'], ['P1']), // self
    W('X2', ['C1'], ['P1']), // paper-level for P1
    W('X3', ['C2'], ['P1']), // co-author (C2 is not on P1)
    W('X4', ['Z'], ['P1', 'P2']), // outsider, cites both
    W('X5', ['Y'], ['Q9']), // cites nothing of ours
  ];
  const cites = attributeCitations(new Set(['P1', 'P2']), citing);
  const { perWork, coauthorCount } = countCitations(['O'], works, cites);
  assert.deepEqual(perWork.get('P1').counts, { all: 4, self: 1, paper: 2, coauthor: 3 });
  assert.deepEqual(perWork.get('P2').counts, { all: 1, self: 0, paper: 0, coauthor: 0 });
  assert.equal(coauthorCount, 2);
});

test('since counts only citing works from that year on', () => {
  const works = [W('P1', ['O', 'C1'])];
  const citing = [
    W('X1', ['O'], ['P1'], { publication_year: 2019 }),
    W('X2', ['O'], ['P1'], { publication_year: 2022 }),
    W('X3', ['Z'], ['P1'], { publication_year: 2021 }),
    W('X4', ['C1'], ['P1']), // unknown year: counted in all, not in since
  ];
  const cites = attributeCitations(new Set(['P1']), citing);
  const { perWork } = countCitations(['O'], works, cites, 2021);
  assert.deepEqual(perWork.get('P1').counts, { all: 4, self: 2, paper: 3, coauthor: 3 });
  assert.deepEqual(perWork.get('P1').since, { all: 2, self: 1, paper: 1, coauthor: 1 });
});

test('byYear groups citations by citing year across works', () => {
  const works = [W('P1', ['O']), W('P2', ['O'])];
  const citing = [
    W('X1', ['O'], ['P1', 'P2'], { publication_year: 2022 }), // counts once per cited paper
    W('X2', ['Z'], ['P1'], { publication_year: 2022 }),
    W('X3', ['Z'], ['P2'], { publication_year: 2023 }),
    W('X4', ['Z'], ['P2']), // no year: not in the chart
  ];
  const cites = attributeCitations(new Set(['P1', 'P2']), citing);
  const { byYear } = countCitations(['O'], works, cites, 2021);
  assert.deepEqual(byYear, {
    2022: { all: 3, self: 2, paper: 2, coauthor: 2 },
    2023: { all: 1, self: 0, paper: 0, coauthor: 0 },
  });
});

test('split owner IDs all count as self', () => {
  const works = [W('P1', ['O1']), W('P2', ['O2'])];
  const cites = attributeCitations(new Set(['P1', 'P2']), [W('X', ['O2'], ['P1'])]);
  const { perWork } = countCitations(['O1', 'O2'], works, cites);
  assert.deepEqual(perWork.get('P1').counts, { all: 1, self: 1, paper: 1, coauthor: 1 });
});

test('h-index and i10', () => {
  assert.equal(hIndex([10, 8, 5, 4, 3]), 4);
  assert.equal(hIndex([0, 0]), 0);
  assert.equal(hIndex([100]), 1);
  assert.equal(i10Index([10, 9, 25]), 2);
});

test('summarize computes kept totals per filter', () => {
  const s = summarize([
    { counts: { all: 12, self: 2, paper: 3, coauthor: 5 }, since: { all: 11, self: 0, paper: 0, coauthor: 2 } },
    { counts: { all: 1, self: 1, paper: 1, coauthor: 1 }, since: { all: 0, self: 0, paper: 0, coauthor: 0 } },
  ]);
  const since = (citations, h, i10) => ({ citations, h, i10 });
  assert.deepEqual(s.off, { citations: 13, h: 1, i10: 1, since: since(11, 1, 1) });
  assert.deepEqual(s.self, { citations: 10, h: 1, i10: 1, removed: 3, since: since(11, 1, 1) });
  assert.deepEqual(s.coauthor, { citations: 7, h: 1, i10: 0, removed: 6, since: since(9, 1, 0) });
});

test('matchRows: prefix + year within 1, each work used once, unmatched is null', () => {
  const works = [
    { id: 'W1', key: titleKey('Deep learning for PLC channels'), year: 2020, counts: { all: 5 } },
    { id: 'W2', key: titleKey('Deep learning for PLC channels, extended'), year: 2021, counts: { all: 9 } },
    { id: 'W3', key: titleKey('A book'), year: 2010, counts: { all: 1 } },
  ];
  const rows = [
    { title: 'Deep learning for PLC channels', year: 2021 },
    { title: 'Deep Learning for PLC Channels', year: 2020 },
    { title: 'A book', year: 2015 },
    { title: 'Missing', year: 2020 },
  ];
  assert.deepEqual(matchRows(rows, works), ['W2', 'W1', null, null]);
});

test('owner resolution picks the name-compatible author on most probes', () => {
  assert.ok(sameName('Maria G. Rossi', 'Maria Grazia Rossi'));
  assert.ok(!sameName('Maria G. Rossi', 'Paolo Bianchi'));
  const probe = (authors) => ({ authorships: authors.map(([id, n]) => A(id, n)) });
  const probes = [
    probe([['A1', 'Paolo Bianchi'], ['A2', 'Maria Grazia Rossi']]),
    probe([['A1', 'Paolo Bianchi'], ['A2', 'Maria Grazia Rossi']]),
    probe([['A1', 'Paolo Bianchi'], ['A3', 'M. G. Rossi']]),
    probe([['A3', 'M. G. Rossi']]),
    probe([['A4', 'Mario Rossi']]),
  ];
  // A1 is on more probes but has the wrong name; A2 and A3 both qualify (split profile);
  // A4 appears once, so it is left out.
  assert.deepEqual(pickOwnerIds('Maria G. Rossi', probes), ['A2', 'A3']);
});
