// Reads the Scholar profile page the user loaded. Read-only: never clicks "Show more",
// never requests Scholar pages (CLAUDE.md constraint 1).
// Selectors checked against a live profile on 2026-11-22.

const SelflessDom = {
  // Profile list pages only, not single-article or co-author views.
  isProfilePage() {
    const p = new URLSearchParams(location.search);
    const view = p.get('view_op');
    return !!p.get('user') && (!view || view === 'list_works') && !!document.getElementById('gsc_a_b');
  },

  scholarId() {
    return new URLSearchParams(location.search).get('user');
  },

  name() {
    const el = document.getElementById('gsc_prf_in');
    return el ? el.textContent.trim() : '';
  },

  // Stats table cells: citations all/since, h all/since, i10 all/since.
  stats() {
    const cells = [...document.querySelectorAll('#gsc_rsb_st td.gsc_rsb_std')].map((td) =>
      parseInt(td.textContent.replace(/[^0-9]/g, ''), 10),
    );
    return { citations: cells[0] ?? null, h: cells[2] ?? null, i10: cells[4] ?? null };
  },

  // Year of Scholar's "Since 2021" column header, or null.
  sinceYear() {
    for (const th of document.querySelectorAll('#gsc_rsb_st thead th')) {
      const m = th.textContent.match(/\b(19|20)\d{2}\b/);
      if (m) return parseInt(m[0], 10);
    }
    return null;
  },

  // Value cells of the stats table as { citations: [all, since], h: [...], i10: [...] }.
  statCells() {
    const rows = [...document.querySelectorAll('#gsc_rsb_st tbody tr')].map((tr) => [
      ...tr.querySelectorAll('td.gsc_rsb_std'),
    ]);
    if (rows.length < 3) return null;
    return { citations: rows[0], h: rows[1], i10: rows[2] };
  },

  statsTable() {
    return document.getElementById('gsc_rsb_st');
  },

  rowElements() {
    return [...document.querySelectorAll('#gsc_a_b tr.gsc_a_tr')];
  },

  readRow(tr) {
    const title = tr.querySelector('a.gsc_a_at');
    const cited = tr.querySelector('a.gsc_a_ac');
    const year = tr.querySelector('.gsc_a_y .gsc_a_h');
    return {
      title: title ? title.textContent.trim() : '',
      year: year ? parseInt(year.textContent, 10) || null : null,
      scholarCount: cited ? parseInt(cited.textContent.replace(/[^0-9]/g, ''), 10) || 0 : 0,
    };
  },

  rows() {
    return this.rowElements().map((tr) => this.readRow(tr));
  },

  sidebar() {
    return document.getElementById('gsc_rsb_cit')?.parentElement || null;
  },

  articles() {
    return document.getElementById('gsc_art');
  },

  table() {
    return document.getElementById('gsc_a_t');
  },

  tbody() {
    return document.getElementById('gsc_a_b');
  },
};
