// Injected UI, styled to sit inside Scholar's page:
// - a link row under Scholar's stats table to pick the filter, plus status and footnote;
// - while a filter is on, the stats table values are swapped in place, each marked with
//   an asterisk and the footnote gives the coverage they are based on (constraint 3);
// - a gray second line in each row's "Cited by" cell;
// - the paper breakdown panel at the end of the papers list.
// Turning the filter off restores Scholar's numbers exactly. All text goes through
// textContent; titles from OpenAlex are never parsed as HTML.

const SelflessUI = (() => {
  const FILTERS = [
    ['off', 'none'],
    ['self', 'self'],
    ['paper', 'paper-level'],
    ['coauthor', 'co-author'],
  ];
  const EXCLUDING = {
    self: 'Excluding self-citations',
    paper: 'Excluding paper-level self-citations',
    coauthor: 'Excluding co-author citations',
  };
  const REMOVED = { self: 'Self-citations', paper: 'Paper-level self-citations', coauthor: 'Co-author citations' };
  const LOW_COVERAGE = 0.5;

  const fmt = (n) => (n == null ? '?' : n.toLocaleString('en-US'));
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '?');
  const kept = (c, f) => (f === 'off' ? c.all : c.all - c[f]);

  function el(tag, props = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  // A link-looking control, as Scholar uses for its own toggles.
  const action = (label, onClick, extra = {}) =>
    el('a', { href: '#', role: 'button', ...extra, on: { click: (e) => { e.preventDefault(); onClick(); } } }, label);

  // ---- Controls under the stats table ---------------------------------------------

  function createControls(statsTable, { onFilter, onTogglePanel, onRefresh }) {
    const links = FILTERS.map(([f, label]) =>
      action(label, () => onFilter(f), { class: 'selfless-opt', 'data-filter': f }),
    );
    const box = el(
      'div',
      { id: 'selfless-controls', class: 'selfless-controls' },
      el('div', { class: 'selfless-filters' }, el('span', { class: 'gs_gray' }, 'Exclude:'), links),
      el('div', { class: 'selfless-status gs_gray', 'aria-live': 'polite' }),
      el('div', { class: 'selfless-foot gs_gray' }),
      el(
        'div',
        { class: 'selfless-actions', hidden: '' },
        action('Paper breakdown', onTogglePanel),
        action('Refresh', onRefresh, { title: 'Recompute from OpenAlex' }),
      ),
    );
    statsTable.after(box);
    return box;
  }

  function setStatus(box, text, isError = false) {
    const s = box.querySelector('.selfless-status');
    s.textContent = text || '';
    s.classList.toggle('selfless-error', isError);
  }

  function renderControls(box, { filter, data, scholar }) {
    for (const a of box.querySelectorAll('.selfless-opt')) {
      const on = a.dataset.filter === filter;
      a.classList.toggle('selfless-current', on);
      a.setAttribute('aria-pressed', String(on));
    }
    const foot = box.querySelector('.selfless-foot');
    foot.replaceChildren();
    if (!data) return;
    box.querySelector('.selfless-actions').hidden = false;
    const s = data.summary;
    const verified = s.off.citations;
    const base = `${fmt(verified)} of ${fmt(scholar.citations)} citations verified in OpenAlex (${pct(verified, scholar.citations)})`;
    if (filter === 'off') {
      foot.append(el('div', {}, `${base}. Of these: self ${pct(s.self.removed, verified)}, paper-level ${pct(s.paper.removed, verified)}, co-author ${pct(s.coauthor.removed, verified)}.`));
    } else {
      foot.append(
        el('div', {}, el('span', { class: 'selfless-mark' }, '*'), ` ${EXCLUDING[filter]}, computed on the ${base}.`),
        el('div', {}, `${REMOVED[filter]}: ${fmt(s[filter].removed)} (${pct(s[filter].removed, verified)} of verified). The chart shows Scholar's unfiltered counts.`),
      );
    }
    if (data.result.truncated) {
      foot.append(el('div', { class: 'selfless-warn' }, 'Some citing works were not loaded (OpenAlex 10,000 result cap without an API key). Counts are lower bounds.'));
    }
  }

  // ---- Stats table swap -----------------------------------------------------------

  function swapStats(cells, filter, summary) {
    if (!cells) return;
    for (const [key, [all, since]] of Object.entries(cells)) {
      for (const [td, scope] of [[all, 'all'], [since, 'since']]) {
        if (!td) continue;
        if (td.dataset.selflessOrig === undefined) td.dataset.selflessOrig = td.textContent;
        if (filter === 'off' || !summary) {
          td.textContent = td.dataset.selflessOrig;
          td.classList.remove('selfless-swapped');
          td.removeAttribute('title');
          continue;
        }
        const pick = (f) => (scope === 'all' ? summary[f][key] : summary[f].since[key]);
        td.replaceChildren(fmt(pick(filter)), el('span', { class: 'selfless-mark' }, '*'));
        td.classList.add('selfless-swapped');
        td.title = `Scholar: ${td.dataset.selflessOrig}. Verified in OpenAlex: ${fmt(pick('off'))}. ${EXCLUDING[filter]}: ${fmt(pick(filter))}.`;
      }
    }
  }

  // ---- Paper rows -----------------------------------------------------------------

  // rows: [{tr, scholarCount, workId}]
  function renderRows(filter, rows, worksById) {
    for (const r of rows) {
      const cell = r.tr.querySelector('td.gsc_a_c');
      if (!cell) continue;
      cell.querySelector('.selfless-row')?.remove();
      if (filter === 'off') continue;
      const w = r.workId && worksById.get(r.workId);
      if (!w) {
        cell.append(el('div', { class: 'selfless-row gs_gray', title: 'This paper was not found in OpenAlex.' }, 'n/a'));
        continue;
      }
      const c = w.counts;
      const low = r.scholarCount > 0 && c.all / r.scholarCount < LOW_COVERAGE;
      const title =
        `Verified in OpenAlex: ${c.all} of ${r.scholarCount} Scholar citations.\n` +
        `Excluding self: ${kept(c, 'self')}. Excluding paper-level: ${kept(c, 'paper')}. Excluding co-author: ${kept(c, 'coauthor')}.` +
        (low ? '\nLow coverage: under half of the Scholar citations were found.' : '');
      cell.append(
        el(
          'div',
          { class: 'selfless-row gs_gray', title },
          `${fmt(kept(c, filter))} of ${fmt(c.all)}`,
          low ? el('div', { class: 'selfless-low' }, 'low') : null,
        ),
      );
    }
  }

  // ---- Paper breakdown panel ------------------------------------------------------

  function renderPanel(container, data, matchedIds, scholar) {
    let panel = document.getElementById('selfless-panel');
    if (!panel) {
      panel = el('section', { id: 'selfless-panel', class: 'selfless-panel', hidden: '' });
      container.append(panel);
    }
    const works = [...data.result.works].sort((a, b) => b.counts.all - a.counts.all);
    const notOnPage = works.filter((w) => !matchedIds.has(w.id)).length;
    const r = data.result;
    const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
    const authorLinks = r.ownerIds.map((id, i) => [i ? ', ' : '', link(`https://openalex.org/authors/${id}`, id)]);

    panel.replaceChildren(
      el('h3', { class: 'selfless-panel-title' }, 'Paper breakdown (Selfless, from OpenAlex)'),
      el(
        'div',
        { class: 'gs_gray selfless-panel-note' },
        `OpenAlex author ${r.ownerIds.length > 1 ? 'IDs' : 'ID'} `,
        authorLinks,
        r.overridden ? ' (set in options)' : ' (matched automatically; set it in options if wrong)',
        `. ${works.length} works, ${fmt(r.coauthorCount)} co-authors, ${fmt(data.summary.off.citations)} verified citations of ${fmt(scholar.citations)} on Scholar. `,
        `Computed ${new Date(r.computedAt).toLocaleDateString()}.`,
      ),
      notOnPage
        ? el('div', { class: 'gs_gray selfless-panel-note' }, `${notOnPage} works are not matched to a row on this page (highlighted). Scholar may list them further down (use Show more), merge them with another version, or not list them at all.`)
        : null,
      el(
        'table',
        { class: 'selfless-panel-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            ['Title', 'Year', 'Verified', 'Excl. self', 'Excl. paper-level', 'Excl. co-author'].map((h) => el('th', { scope: 'col' }, h)),
          ),
        ),
        el(
          'tbody',
          {},
          works.map((w) =>
            el(
              'tr',
              { class: matchedIds.has(w.id) ? '' : 'selfless-unmatched', title: matchedIds.has(w.id) ? null : 'Not matched to a row on this page' },
              el('td', {}, link(`https://openalex.org/works/${w.id}`, w.title || w.id)),
              el('td', {}, w.year ?? ''),
              el('td', {}, fmt(w.counts.all)),
              el('td', {}, fmt(kept(w.counts, 'self'))),
              el('td', {}, fmt(kept(w.counts, 'paper'))),
              el('td', {}, fmt(kept(w.counts, 'coauthor'))),
            ),
          ),
        ),
      ),
    );
    return panel;
  }

  return { createControls, renderControls, setStatus, swapStats, renderRows, renderPanel };
})();
