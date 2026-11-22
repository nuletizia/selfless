// Content script entry point on Scholar profile pages.

(async () => {
  if (!SelflessDom.isProfilePage() || document.getElementById('selfless-controls')) return;
  const statsTable = SelflessDom.statsTable();
  if (!statsTable) return;

  const scholarId = SelflessDom.scholarId();
  const sinceYear = SelflessDom.sinceYear();
  const scholar = SelflessDom.stats(); // read before any swap
  const statCells = SelflessDom.statCells();
  const histBars = SelflessDom.histBars();
  const { settings } = await chrome.storage.local.get('settings');
  const state = { filter: (settings && settings.defaultFilter) || 'off', data: null, matches: [] };

  const controls = SelflessUI.createControls(statsTable, {
    onFilter(f) {
      state.filter = f;
      render();
    },
    onRefresh() {
      start(true);
    },
    onTogglePanel() {
      const panel = document.getElementById('selfless-panel');
      if (panel) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
  });

  function render() {
    SelflessUI.renderControls(controls, { filter: state.filter, data: state.data, scholar });
    if (!state.data) return;
    SelflessUI.swapStats(statCells, state.filter, state.data.summary);
    SelflessUI.swapHistogram(histBars, state.filter, state.data.result.byYear);
    const worksById = new Map(state.data.result.works.map((w) => [w.id, w]));
    const rows = SelflessDom.rowElements().map((tr, i) => ({
      tr,
      scholarCount: SelflessDom.readRow(tr).scholarCount,
      workId: state.matches[i] || null,
    }));
    SelflessUI.renderRows(state.filter, rows, worksById);
    SelflessUI.renderPanel(SelflessDom.articles(), state.data, new Set(state.matches.filter(Boolean)), scholar);
  }

  function profile() {
    return {
      scholarId,
      sinceYear,
      name: SelflessDom.name(),
      rows: SelflessDom.rows().map(({ title, year }) => ({ title, year })),
    };
  }

  function start(force = false) {
    SelflessUI.setStatus(controls, 'Connecting to OpenAlex');
    const port = chrome.runtime.connect({ name: 'selfless' });
    port.onMessage.addListener((msg) => {
      if (msg.type === 'progress') {
        SelflessUI.setStatus(controls, msg.text);
      } else if (msg.type === 'result') {
        state.data = { result: msg.result, summary: msg.summary };
        SelflessUI.resetControls(controls);
        state.matches = msg.matches;
        SelflessUI.setStatus(controls, '');
        render();
        port.disconnect();
      } else if (msg.type === 'error') {
        SelflessUI.setStatus(controls, msg.message, true);
        port.disconnect();
      }
    });
    port.postMessage({ type: 'analyze', profile: profile(), force });
  }

  render();

  // Rows the user loads with "Show more" are annotated from the cache, no new requests.
  let timer = null;
  new MutationObserver(() => {
    if (!state.data) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const res = await chrome.runtime.sendMessage({ type: 'match', scholarId, sinceYear, rows: profile().rows });
      if (res && res.matches) {
        state.matches = res.matches;
        render();
      }
    }, 200);
  }).observe(SelflessDom.tbody(), { childList: true });

  start();
})();
