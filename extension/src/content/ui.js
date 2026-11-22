// Injected UI, styled to sit inside Scholar's page:
// - a link row under Scholar's stats table to pick the filter, plus status and footnote;
// - while a filter is on, the stats table values and the citations-per-year bars are
//   swapped in place, marked (asterisk, color) and the footnote gives the coverage they
//   are based on (constraint 3);
// - a gray second line in each row's "Cited by" cell;
// - the paper breakdown panel at the end of the papers list.
// Turning the filter off restores Scholar's numbers and bars exactly. All text goes through
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
  const TIPS = {
    off: "Scholar's own numbers, nothing excluded.",
    self: 'Leave out citations from papers the profile owner wrote.',
    paper: 'Also leave out citations from papers by any co-author of the cited paper.',
    coauthor: 'Also leave out citations from anyone the profile owner has ever published with.',
  };

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

  // The status line and the footnote of every filter are stacked in the same grid cell
  // and only the active one is visible, so the block always has the height of its
  // longest variant: switching filters never shifts the chart below it.
  function createControls(statsTable, { onFilter, onTogglePanel, onRefresh }) {
    const links = FILTERS.map(([f, label]) =>
      action(label, () => onFilter(f), { class: 'selfless-opt', 'data-filter': f, title: TIPS[f] }),
    );
    const help = createHelp();
    const helpLink = action('?', () => toggleHelp(help, helpLink), {
      class: 'selfless-help-link',
      title: 'What do these filters mean?',
      'aria-expanded': 'false',
    });
    const box = el(
      'div',
      { id: 'selfless-controls', class: 'selfless-controls' },
      el('div', { class: 'selfless-filters' }, el('span', { class: 'gs_gray' }, 'Exclude:'), links, helpLink),
      help,
      el(
        'div',
        { class: 'selfless-stack gs_gray' },
        el('div', { class: 'selfless-status', 'aria-live': 'polite' }),
        FILTERS.map(([f]) => el('div', { class: 'selfless-foot', 'data-filter': f })),
      ),
      el(
        'div',
        { class: 'selfless-actions selfless-waiting' },
        action('Paper breakdown', onTogglePanel),
        action('Refresh', onRefresh, { title: 'Recompute from OpenAlex' }),
      ),
    );
    statsTable.after(box);
    return box;
  }

  // Explanation popover. Floats over the page (absolutely positioned) so opening it
  // never moves anything.
  function createHelp() {
    const item = (term, text) => el('li', {}, el('b', {}, term), ` ${text}`);
    return el(
      'div',
      { class: 'selfless-help', role: 'dialog', 'aria-label': 'About the Selfless filters', hidden: '' },
      el('div', { class: 'selfless-help-title' }, 'Selfless: who is citing this profile?'),
      el('p', {}, 'Each filter removes the citations below, plus everything the previous one removes.'),
      el(
        'ul',
        {},
        item('self:', 'citing papers written by the profile owner.'),
        item('paper-level:', 'citing papers written by any author of the cited paper (for example a supervisor or a co-author citing the shared paper).'),
        item('co-author:', 'citing papers written by anyone the owner has ever published with.'),
      ),
      el('p', {}, 'Citations are checked in OpenAlex, an open catalogue, which does not see every citation Scholar counts. Filtered numbers are marked * and are computed only on the citations OpenAlex found.'),
      el('div', { class: 'selfless-help-title' }, 'Under each paper'),
      el(
        'ul',
        {},
        item('41 of 48:', 'citations left after the filter, out of those OpenAlex found for this paper.'),
        item('low:', 'OpenAlex found less than half of the citations Scholar counts, so this number is less reliable.'),
        item('n/a:', 'this paper was not found in OpenAlex, so it could not be checked. It means unknown, not zero.'),
      ),
    );
  }

  function toggleHelp(help, link, open = help.hidden) {
    help.hidden = !open;
    link.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !help.contains(e.target) && e.target !== link) {
        toggleHelp(help, link, false);
        document.removeEventListener('click', close, true);
        document.removeEventListener('keydown', close, true);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', close, true);
      document.addEventListener('keydown', close, true);
    });
  }

  function setStatus(box, text, isError = false) {
    const s = box.querySelector('.selfless-status');
    s.textContent = text || '';
    s.classList.toggle('selfless-error', isError);
    box.classList.toggle('selfless-has-status', !!text);
  }

  function footFor(filter, data, scholar) {
    const s = data.summary;
    const verified = s.off.citations;
    const base = `${fmt(verified)} of ${fmt(scholar.citations)} citations verified in OpenAlex (${pct(verified, scholar.citations)})`;
    const lines =
      filter === 'off'
        ? [
            el('div', {}, `${base}.`),
            el('div', {}, `Of these: self ${pct(s.self.removed, verified)}, paper-level ${pct(s.paper.removed, verified)}, co-author ${pct(s.coauthor.removed, verified)}.`),
          ]
        : [
            el('div', {}, el('span', { class: 'selfless-mark' }, '*'), ` Computed on the ${base}.`),
            el('div', {}, `${EXCLUDING[filter]}: ${fmt(s[filter].removed)} removed (${pct(s[filter].removed, verified)}).`),
          ];
    if (data.result.truncated) {
      lines.push(el('div', { class: 'selfless-warn' }, 'Some citing works were not loaded (OpenAlex 10,000 result cap without an API key). Counts are lower bounds.'));
    }
    return lines;
  }

  function renderControls(box, { filter, data, scholar }) {
    for (const a of box.querySelectorAll('.selfless-opt')) {
      const on = a.dataset.filter === filter;
      a.classList.toggle('selfless-current', on);
      a.setAttribute('aria-pressed', String(on));
    }
    for (const foot of box.querySelectorAll('.selfless-foot')) {
      if (data && !foot.dataset.ready) {
        foot.replaceChildren(...footFor(foot.dataset.filter, data, scholar));
        foot.dataset.ready = '1';
      }
      foot.classList.toggle('selfless-active', foot.dataset.filter === filter);
    }
    box.querySelector('.selfless-actions').classList.toggle('selfless-waiting', !data);
  }

  // New data (Refresh) invalidates the prepared footnotes.
  function resetControls(box) {
    for (const foot of box.querySelectorAll('.selfless-foot')) {
      foot.replaceChildren();
      delete foot.dataset.ready;
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

  // ---- Citations-per-year chart ---------------------------------------------------

  // Bars keep Scholar's scale (pixels per citation from its own tallest bar), so the
  // filtered chart shrinks visibly. Years Scholar draws no bar for are left alone.
  function swapHistogram(bars, filter, byYear) {
    if (!bars.length) return;
    for (const b of bars) {
      if (b.bar.dataset.selflessH === undefined) {
        b.bar.dataset.selflessH = b.bar.style.height;
        b.bar.dataset.selflessTop = b.bar.style.top;
        b.label.dataset.selflessOrig = b.label.textContent;
      }
    }
    const orig = bars.map((b) => ({ h: parseFloat(b.bar.dataset.selflessH) || 0, n: parseInt(b.label.dataset.selflessOrig.replace(/[^0-9]/g, ''), 10) || 0 }));
    const maxH = Math.max(...orig.map((o) => o.h));
    const maxN = Math.max(...orig.map((o) => o.n));
    const on = filter !== 'off' && byYear;
    const values = bars.map((b) => {
      const c = (on && byYear[b.year]) || null;
      return c ? kept(c, filter) : 0;
    });
    const scale = maxH / Math.max(maxN, ...values, 1);
    bars.forEach((b, i) => {
      if (!on) {
        b.bar.style.height = b.bar.dataset.selflessH;
        b.bar.style.top = b.bar.dataset.selflessTop;
        b.label.textContent = b.label.dataset.selflessOrig;
        b.bar.classList.remove('selfless-bar');
        b.bar.removeAttribute('title');
        return;
      }
      const c = byYear[b.year] || { all: 0, self: 0, paper: 0, coauthor: 0 };
      // Scholar positions bars by `top`; keep the bottom on the baseline (top + height).
      const h = Math.max(1, Math.round(values[i] * scale));
      b.bar.style.height = `${h}px`;
      if (b.bar.dataset.selflessTop) b.bar.style.top = `${parseFloat(b.bar.dataset.selflessTop) + orig[i].h - h}px`;
      b.label.textContent = fmt(values[i]);
      b.bar.classList.add('selfless-bar');
      b.bar.title = `${b.year}. Scholar: ${b.label.dataset.selflessOrig}. Verified in OpenAlex: ${fmt(c.all)}. ${EXCLUDING[filter]}: ${fmt(values[i])}.`;
    });
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
        cell.append(
          el(
            'div',
            { class: 'selfless-row gs_gray' },
            el('span', { class: 'selfless-hint', title: 'Not found in OpenAlex, so it could not be checked. Unknown, not zero.' }, 'n/a'),
          ),
        );
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
          low
            ? el('div', {}, el('span', { class: 'selfless-low selfless-hint', title: 'Low coverage: OpenAlex found less than half of the citations Scholar counts for this paper.' }, 'low'))
            : null,
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

  return { createControls, renderControls, resetControls, setStatus, swapStats, swapHistogram, renderRows, renderPanel };
})();
