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
  // Short labels: the dropdown sits in the narrow first header cell of Scholar's stats
  // table. Tooltips and the help popover carry the full wording.
  const FILTERS = [
    ['off', 'No filter'],
    ['self', 'Excl. author'],
    ['paper', "Excl. paper's authors"],
    ['coauthor', 'Excl. network'],
  ];
  const EXCLUDING = {
    self: 'Excluding citations by the author',
    paper: "Excluding citations by the paper's authors",
    coauthor: "Excluding citations by the author's network",
  };
  const LOW_COVERAGE = 0.5;
  const TIPS = {
    off: "Scholar's own numbers, nothing excluded.",
    self: 'Leave out citing papers written by the profile owner.',
    paper: 'Leave out citing papers written by the owner or by anyone who co-wrote the cited paper.',
    coauthor: 'Leave out citing papers written by the owner or by anyone they have ever published with.',
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
  // The filter dropdown goes in the empty top-left header cell of Scholar's stats table,
  // right above the numbers it changes. Footnote and links go under the table.
  function createControls(statsTable, { onFilter, onTogglePanel, onRefresh }) {
    const select = el(
      'select',
      { class: 'selfless-select', 'aria-label': 'Exclude citations by', on: { change: (e) => onFilter(e.target.value) } },
      FILTERS.map(([f, label]) => el('option', { value: f, title: TIPS[f] }, label)),
    );
    const help = createHelp();
    const helpLink = action('?', () => toggleHelp(help, helpLink), {
      class: 'selfless-help-link',
      title: 'What do these filters mean?',
      'aria-expanded': 'false',
    });
    const corner = statsTable.querySelector('thead tr th');
    const picker = el('span', { class: 'selfless-picker' }, el('span', { class: 'selfless-select-wrap' }, select), helpLink);
    if (corner) corner.append(picker);
    const box = el(
      'div',
      { id: 'selfless-controls', class: 'selfless-controls' },
      corner ? null : picker,
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
      el('p', {}, 'The menu above the citation table leaves out citations by:'),
      el('p', {}, "Each choice leaves out citations from a wider group of people. The author is one of the paper's authors, and the paper's authors are part of the author's network, so each choice also removes everything the previous one removes."),
      el(
        'ul',
        {},
        item('the author:', 'citing papers written by the profile owner (classic self-citations).'),
        item("the paper's authors:", 'citing papers written by anyone who co-wrote the cited paper, the owner included. Catches, for example, a supervisor citing a paper they co-wrote.'),
        item("the author's network:", 'citing papers written by anyone the owner has ever published with, the owner included. The strictest view.'),
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

  // One short sentence per filter; the per-group shares live in the help popover and
  // in the hover text of each number.
  function footFor(filter, data, scholar) {
    const s = data.summary;
    const verified = s.off.citations;
    const pct0 = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '?');
    const base = `${fmt(verified)} of ${fmt(scholar.citations)} citations verified in OpenAlex (${pct0(verified, scholar.citations)}).`;
    const lines =
      filter === 'off'
        ? [el('div', {}, base)]
        : [el('div', { title: `${EXCLUDING[filter]}: ${fmt(s[filter].removed)} of ${fmt(verified)} verified citations removed.` },
            el('span', { class: 'selfless-mark' }, '*'), ` ${base} ${fmt(s[filter].removed)} removed (${pct0(s[filter].removed, verified)}).`)];
    if (scholar.citations && verified > scholar.citations * 1.05) {
      lines.push(el('div', { class: 'selfless-warn', title: 'OpenAlex may be mixing this author with someone else with the same name. Check Paper breakdown, or set the OpenAlex author in Selfless options.' }, 'More than Scholar: OpenAlex may mix two authors.'));
    }
    if (data.result.truncated) {
      lines.push(el('div', { class: 'selfless-warn', title: 'OpenAlex returns at most 10,000 results per query without an API key. Add one in Selfless options.' }, 'Incomplete: add an API key.'));
    }
    return lines;
  }

  function renderControls(box, { filter, data, scholar }) {
    const select = document.querySelector('.selfless-select');
    if (select) {
      select.value = filter;
      select.title = TIPS[filter];
      select.classList.toggle('selfless-on', filter !== 'off');
      select.parentElement.classList.toggle('selfless-on', filter !== 'off');
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
        `Excluding the author: ${kept(c, 'self')}. Excluding the paper's authors: ${kept(c, 'paper')}. Excluding the network: ${kept(c, 'coauthor')}.` +
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

  // Works linked to the Scholar rows are listed and counted; works OpenAlex attributes to
  // the same author record but that share no co-author with them (see clusterWorks) are
  // listed separately as probably another person with the same name, and not counted.
  function renderPanel(container, data, matchedIds, includedIds, scholar) {
    let panel = document.getElementById('selfless-panel');
    if (!panel) {
      panel = el('section', { id: 'selfless-panel', class: 'selfless-panel', hidden: '' });
      container.append(panel);
    }
    const all = [...data.result.works].sort((a, b) => b.counts.all - a.counts.all);
    const works = all.filter((w) => includedIds.has(w.id));
    const aside = all.filter((w) => !includedIds.has(w.id));
    const notOnPage = works.filter((w) => !matchedIds.has(w.id)).length;
    const r = data.result;
    const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
    const authorLinks = r.ownerIds.map((id, i) => [i ? ', ' : '', link(`https://openalex.org/authors/${id}`, id)]);
    const head = () =>
      el('thead', {}, el('tr', {}, ['Title', 'Year', 'Verified', 'Excl. author', "Excl. paper's authors", 'Excl. network'].map((h) => el('th', { scope: 'col' }, h))));
    const row = (w, cls, title) =>
      el(
        'tr',
        { class: cls, title },
        el('td', {}, link(`https://openalex.org/works/${w.id}`, w.title || w.id)),
        el('td', {}, w.year ?? ''),
        el('td', {}, fmt(w.counts.all)),
        el('td', {}, fmt(kept(w.counts, 'self'))),
        el('td', {}, fmt(kept(w.counts, 'paper'))),
        el('td', {}, fmt(kept(w.counts, 'coauthor'))),
      );

    panel.replaceChildren(
      el('h3', { class: 'selfless-panel-title' }, 'Paper breakdown (Selfless, from OpenAlex)'),
      el(
        'div',
        { class: 'gs_gray selfless-panel-note' },
        `OpenAlex author ${r.ownerIds.length > 1 ? 'IDs' : 'ID'} `,
        authorLinks,
        r.overridden ? ' (set in options)' : ' (matched automatically; set it in options if wrong)',
        `. ${works.length} works, ${fmt(data.summary.off.citations)} verified citations of ${fmt(scholar.citations)} on Scholar. `,
        `Computed ${new Date(r.computedAt).toLocaleDateString()}.`,
      ),
      notOnPage
        ? el('div', { class: 'gs_gray selfless-panel-note' }, `${notOnPage} works are not matched to a row on this page (highlighted) but share co-authors with works that are. Scholar may list them further down (use Show more), merge them with another version, or not list them at all.`)
        : null,
      el(
        'table',
        { class: 'selfless-panel-table' },
        head(),
        el('tbody', {}, works.map((w) => (matchedIds.has(w.id) ? row(w, '', null) : row(w, 'selfless-unmatched', 'Not matched to a row on this page')))),
      ),
      aside.length
        ? [
            el('h3', { class: 'selfless-panel-title selfless-aside-title' }, `Not counted: probably another author with the same name (${aside.length})`),
            el(
              'div',
              { class: 'gs_gray selfless-panel-note' },
              'OpenAlex lists these works under the same author, but they share no co-author with the papers on this Scholar profile. ' +
                'If some are really this author, click Show more on Scholar: once a work appears on the page it is counted.',
            ),
            el('table', { class: 'selfless-panel-table selfless-aside' }, head(), el('tbody', {}, aside.map((w) => row(w, '', null)))),
          ]
        : null,
    );
    return panel;
  }

  return { createControls, renderControls, resetControls, setStatus, swapStats, swapHistogram, renderRows, renderPanel };
})();
