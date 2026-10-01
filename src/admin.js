/*
 * SOL 500 — admin panel (admin.html): game history, live server control and project progress (spec §8).
 * On this PC the server writes the admin key into the page; other Wi-Fi devices log in with the host's password and
 * keep a session token for this tab. Strings come from SolI18n (admin.*), charts from SolCharts; the language follows
 * the game's (localStorage sol500.lang).
 */
(function () {
  'use strict';
  const I = window.SolI18n, A = window.SolArt, C = window.SolCharts;
  const root = document.getElementById('admin');
  const meta = n => { const m = document.querySelector('meta[name="' + n + '"]'); return (m && m.getAttribute('content')) || ''; };
  const MODE = meta('sol-admin-mode') === 'local' ? 'local' : 'lan';
  const TABS = ['history', 'live', 'project'];
  const TAB_ICON = { history: 'trophy', live: 'users', project: 'flag' };
  const CAUSES = ['hypoxia', 'dehydration', 'starvation', 'cold', 'habFault', 'radiationSickness', 'injury', 'rations', 'health'];

  // ---------- storage (every access guarded: private windows can throw) ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('sol500.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sol500.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const tokenStore = {
    get() { try { return sessionStorage.getItem('sol500.adminToken'); } catch (e) { return null; } },
    set(v) { try { if (v) sessionStorage.setItem('sol500.adminToken', v); else sessionStorage.removeItem('sol500.adminToken'); } catch (e) { /* ignore */ } },
  };

  // ---------- state ----------
  const savedLang = LS.get('lang', null);
  const S = {
    lang: I.LANGS.includes(savedLang) ? savedLang : (/^vi/i.test(navigator.language || '') ? 'vi' : 'en'),
    tab: TABS.includes(LS.get('adminTab', '')) ? LS.get('adminTab', 'history') : 'history',
    token: MODE === 'local' ? meta('sol-admin-key') : tokenStore.get(),
    problem: null,      // null | 'network' | 'stale'
    loginError: null,   // i18n key
    history: null,
    sort: { key: 'endedAt', dir: -1 },
    modal: null,        // { kind: 'detail', record } | { kind: 'confirm', body, okLabel, onOk }
  };

  // ---------- helpers ----------
  const t = (k, p) => I.t(S.lang, k, p);
  const locale = () => (S.lang === 'vi' ? 'vi-VN' : 'en-US');
  const nf = n => new Intl.NumberFormat(locale()).format(n);
  const dateTime = iso => new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
  const clock = ms => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // The same tiny DOM builder as the game (ui.js). 'html' only ever receives SVG strings from SolArt, never data.
  function h(tag, attrs) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
        else if (k === 'style') n.style.cssText = v;
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) add(n, arguments[i]);
    return n;
  }
  function add(n, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(x => add(n, x)); return; }
    n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  const ico = (name, size) => h('span', { class: 'ico-i', html: A.icon(name, size || 16), style: 'display:inline-flex', 'aria-hidden': 'true' });
  function panel(title, body, cls) {
    return h('section', { class: 'panel' + (cls ? ' ' + cls : ''), 'aria-label': title },
      h('div', { class: 'panel-h' }, h('h2', { class: 'eyebrow' }, title)),
      h('div', { class: 'panel-b' }, body));
  }
  const stat = (k, v, extra) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v), extra || null);
  const emptyPanel = (icon, text) => h('div', { class: 'panel adm-empty' }, ico(icon, 28), h('p', null, text));

  const toastEl = document.body.appendChild(h('div', { class: 'adm-toast', role: 'status', 'aria-live': 'polite' }));
  let toastTimer = null;
  function flash(msg) {
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.textContent = ''; }, 2600);
  }

  // ---------- server calls ----------
  async function whoamiStatus() {
    try { return (await fetch('/api/admin/whoami', { headers: { 'X-Admin-Key': S.token || '' }, cache: 'no-store' })).status; } catch (e) { return 0; }
  }

  // Every API call goes through here. Failures each get their own message, never a silent empty page:
  //   this PC + 401   → the server restarted with a new key: "Reload this page".
  //   Wi-Fi  + 401/404 → ask /whoami: 401 = the session ended, 404 = the host switched Wi-Fi access off → login screen.
  //                     A 404 while /whoami still answers 200 is an ordinary "not found" (e.g. kicking someone who left).
  async function api(method, path, body) {
    let r;
    try {
      r = await fetch(path, {
        method, cache: 'no-store',
        headers: Object.assign({ 'X-Admin-Key': S.token || '' }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      S.problem = 'network';
      render();
      return { error: 'network' };
    }
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (r.status === 401 && MODE === 'local') { S.problem = 'stale'; render(); return { error: 'stale' }; }
    if (MODE === 'lan' && (r.status === 401 || r.status === 404)) {
      const who = r.status === 401 ? 401 : await whoamiStatus();
      if (who === 401 || who === 404) { logout(who === 404 ? 'admin.login.off' : null); return { error: 'loggedOut' }; }
    }
    if (S.problem === 'network') S.problem = null;
    if (!r.ok) return Object.assign({ status: r.status }, j, { error: (j && j.error) || 'http' + r.status });
    return j || {};
  }

  function logout(reason) {
    S.token = null;
    tokenStore.set(null);
    S.loginError = reason;
    S.live = null;
    stopPolling();
    render();
  }

  async function login(password) {
    let r;
    try {
      r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    } catch (e) { S.loginError = 'admin.error'; render(); return; }
    if (r.ok) {
      const j = await r.json();
      S.token = j.token;
      tokenStore.set(j.token);
      S.loginError = null;
      render();
      load();
      return;
    }
    S.loginError = r.status === 429 ? 'admin.login.slow' : r.status === 404 ? 'admin.login.off' : 'admin.login.bad';
    render();
    const f = document.getElementById('adm-pw');
    if (f) f.focus();
  }

  // ---------- confirm and detail dialogs ----------
  const modalRoot = document.body.appendChild(h('div'));
  function ask(body, okLabel, onOk) { S.modal = { kind: 'confirm', body, okLabel, onOk }; renderModal(); }
  function closeModal() { S.modal = null; renderModal(); }
  function renderModal() {
    modalRoot.textContent = '';
    const m = S.modal;
    if (!m) return;
    let title, body, foot;
    if (m.kind === 'detail') {
      title = t('admin.d.title', { code: m.record.missionCode });
      body = detailBody(m.record);
      foot = [
        h('button', { class: 'btn btn-danger', type: 'button', 'data-k': 'detail-delete', onclick: () => askDelete(m.record) }, ico('close', 14), t('admin.delete')),
        h('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': true, onclick: closeModal }, t('common.close')),
      ];
    } else {
      title = t('admin.confirm');
      body = h('p', null, m.body);
      foot = [
        h('button', { class: 'btn', type: 'button', 'data-autofocus': true, onclick: closeModal }, t('common.cancel')),
        h('button', { class: 'btn btn-danger', type: 'button', 'data-k': 'confirm-ok', onclick: () => m.onOk() }, m.okLabel),
      ];
    }
    const back = h('div', { class: 'modal-back' },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'adm-modal-h' },
        h('div', { class: 'modal-h' }, h('h2', { id: 'adm-modal-h' }, title),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('common.close'), onclick: closeModal }, ico('close'))),
        h('div', { class: 'modal-b' }, body),
        h('div', { class: 'modal-f' }, foot)));
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    modalRoot.appendChild(back);
    const first = back.querySelector('[data-autofocus]');
    if (first) first.focus();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modal) closeModal(); });

  // ---------- history tab ----------
  async function loadHistory() {
    const r = await api('GET', '/api/admin/history');
    if (!r.error) { S.history = r.records || []; render(); }
  }

  const players = r => (r.players || []).map(p => p.name).join(', ');
  const outcomeChip = o => (o === 'success'
    ? h('span', { class: 'chip ok' }, ico('ok', 12), t('admin.outcome.success'))
    : h('span', { class: 'chip crit' }, ico('crit', 12), t('admin.outcome.lost')));
  const COLS = [
    { key: 'endedAt', label: 'admin.col.date', cell: r => dateTime(r.endedAt) },
    { key: 'mode', label: 'admin.col.mode', cell: r => h('span', { class: 'chip' }, t('admin.mode.' + r.mode)) },
    { key: 'missionCode', label: 'admin.col.code', cell: r => h('span', { class: 'num' }, r.missionCode), sm: true },
    { key: 'players', label: 'admin.col.players', cell: players, sortVal: players, sm: true },
    { key: 'outcome', label: 'admin.col.outcome', cell: r => outcomeChip(r.outcome) },
    { key: 'cause', label: 'admin.col.cause', cell: r => (r.cause ? t('admin.cause.' + r.cause) : '—'), sm: true },
    { key: 'score', label: 'admin.col.score', cell: r => nf(r.score), num: true },
    { key: 'grade', label: 'admin.col.grade', cell: r => r.grade },
    { key: 'sols', label: 'admin.col.sols', cell: r => nf(r.sols), num: true, sm: true },
  ];
  const colClass = c => [c.num ? 'num' : '', c.sm ? 'adm-hide-sm' : ''].join(' ').trim() || null;

  function sorted(list) {
    const c = COLS.find(x => x.key === S.sort.key) || COLS[0];
    const val = c.sortVal || (r => r[c.key]);
    return list.slice().sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * S.sort.dir; });
  }
  function setSort(c) {
    S.sort = { key: c.key, dir: S.sort.key === c.key ? -S.sort.dir : (c.num || c.key === 'endedAt' ? -1 : 1) };
    render();
  }

  // Tick spacing for "mission 1…n": about 8 ticks at 1, 2 or 5 × 10^k.
  function niceStep(n) {
    const raw = Math.max(1, n / 8);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 5, 10].map(m => m * p).find(s => s >= raw);
  }

  function historyTable(list) {
    return h('div', { class: 'tablewrap' }, h('table', { class: 'adm-table' },
      h('thead', null, h('tr', null,
        COLS.map(c => h('th', { scope: 'col', class: colClass(c), 'aria-sort': S.sort.key === c.key ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
          h('button', { type: 'button', class: 'th-sort', 'data-k': 'sort:' + c.key, onclick: () => setSort(c) },
            t(c.label), S.sort.key === c.key ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''))),
        h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, t('admin.h.details'))))),
      h('tbody', null, sorted(list).map(r => h('tr', null,
        COLS.map(c => h('td', { class: colClass(c) }, c.cell(r))),
        h('td', { class: 'row-actions' },
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'data-k': 'detail:' + r.id, onclick: () => { S.modal = { kind: 'detail', record: r }; renderModal(); } }, t('admin.h.details')),
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'data-k': 'del:' + r.id, 'aria-label': t('admin.delete') + ' ' + r.missionCode, onclick: () => askDelete(r) }, ico('close', 14))))))));
  }

  function detailBody(r) {
    const rows = [
      [t('admin.col.date'), dateTime(r.endedAt)], [t('admin.col.mode'), t('admin.mode.' + r.mode)],
      [t('admin.d.difficulty'), t('diff.' + r.difficulty)], [t('admin.d.crew'), t('admin.d.crewN', { n: r.crewSize })],
      [t('admin.col.outcome'), t('admin.outcome.' + r.outcome)], [t('admin.col.score'), nf(r.score) + ' · ' + r.grade],
      [t('admin.col.sols'), nf(r.sols)],
    ];
    const ps = r.players || [];
    const ach = r.achievements || [];
    return [
      h('table', { class: 'score-table' }, h('tbody', null, rows.map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, v))))),
      r.cause ? h('p', { class: 'adm-warn' }, ico('warn', 16), t('cause.' + r.cause)) : null,
      h('h3', { class: 'eyebrow' }, t('admin.col.players')),
      ps.length
        ? h('ul', { class: 'adm-list' }, ps.map(p => h('li', null, p.name, p.role ? h('span', { class: 'hint' }, ' · ' + t('role.' + p.role)) : null)))
        : h('p', { class: 'hint' }, t('admin.d.noPlayers')),
      h('h3', { class: 'eyebrow' }, t('admin.d.achievements')),
      ach.length
        ? h('ul', { class: 'adm-list' }, ach.map(id => h('li', null, t('ach.' + id + '.name'))))
        : h('p', { class: 'hint' }, t('admin.d.none')),
    ];
  }

  function askDelete(r) {
    ask(t('admin.h.deleteAsk', { code: r.missionCode, date: dateTime(r.endedAt) }), t('admin.delete'), async () => {
      const res = await api('POST', '/api/admin/history/delete', { id: r.id });
      closeModal();
      if (!res.error || res.status === 404) S.history = S.history.filter(x => x.id !== r.id);
      render();
    });
  }

  async function downloadCsv() {
    let r;
    try { r = await fetch('/api/admin/history.csv', { headers: { 'X-Admin-Key': S.token || '' }, cache: 'no-store' }); } catch (e) { flash(t('admin.error')); return; }
    if (!r.ok) { flash(t('admin.error')); return; }
    const url = URL.createObjectURL(await r.blob());
    const a = h('a', { href: url, download: 'sol500-history-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function viewHistory() {
    const list = S.history;
    if (!list) return h('p', { class: 'hint' }, t('admin.loading'));
    const tools = h('div', { class: 'adm-tools' },
      h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'h-refresh', onclick: loadHistory }, ico('refresh', 14), t('admin.refresh')),
      h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'h-csv', disabled: !list.length, onclick: downloadCsv }, ico('copy', 14), t('admin.h.csv')),
      h('button', {
        class: 'btn btn-sm btn-danger', type: 'button', 'data-k': 'h-clear', disabled: !list.length,
        onclick: () => ask(t('admin.h.clearAsk', { n: list.length }), t('admin.h.clear'), async () => {
          const res = await api('POST', '/api/admin/history/clear');
          closeModal();
          if (!res.error) { S.history = []; render(); }
        }),
      }, ico('close', 14), t('admin.h.clear')));
    if (!list.length) return [tools, emptyPanel('trophy', t('admin.h.empty'))];

    const wins = list.filter(r => r.outcome === 'success').length;
    const finds = list.reduce((n, r) => n + Object.values(r.finds || {}).reduce((a, f) => a + Object.values(f || {}).reduce((x, y) => x + (Number(y) || 0), 0), 0), 0);
    const chrono = list.slice().reverse();
    const scoreBox = h('div');
    const outBox = h('div');
    const causeBox = h('div');
    C.lineChart(scoreBox, {
      title: t('admin.h.scoreChart'), xLabel: t('admin.h.mission'), tableLabel: t('admin.h.table'),
      xMin: 1, xMax: Math.max(2, chrono.length), xTicks: niceStep(chrono.length), fmt: v => nf(Math.round(v)),
      series: [{ name: t('admin.h.score'), color: 'var(--viz-1)', points: chrono.map((r, i) => [i + 1, r.score]) }],
    });
    C.barChart(outBox, {
      title: t('admin.h.outcomes'), color: 'var(--viz-1)', tableLabel: t('admin.h.table'), fmt: nf,
      rows: [{ label: t('admin.outcome.success'), value: wins }, { label: t('admin.outcome.lost'), value: list.length - wins }],
    });
    const causes = CAUSES.map(c => ({ label: t('admin.cause.' + c), value: list.filter(r => r.cause === c).length }))
      .filter(r => r.value > 0).sort((a, b) => b.value - a.value);
    if (causes.length) C.barChart(causeBox, { title: t('admin.h.causes'), color: 'var(--viz-1)', tableLabel: t('admin.h.table'), fmt: nf, rows: causes });
    else causeBox.appendChild(h('p', { class: 'hint' }, t('admin.h.noLosses')));

    return [
      tools,
      h('div', { class: 'stats' },
        stat(t('admin.h.missions'), nf(list.length)),
        stat(t('admin.h.winRate'), Math.round((wins / list.length) * 100) + ' %'),
        stat(t('admin.h.best'), nf(Math.max(...list.map(r => r.score)))),
        stat(t('admin.h.finds'), nf(finds))),
      h('div', { class: 'adm-charts' },
        panel(t('admin.h.scoreChart'), scoreBox, 'wide'),
        panel(t('admin.h.outcomes'), outBox),
        panel(t('admin.h.causes'), causeBox)),
      panel(t('admin.tab.history'), historyTable(list)),
    ];
  }

  // ---------- page ----------
  const VIEWS = { history: viewHistory };
  const LOADERS = { history: loadHistory };
  let pollTimer = null;
  function stopPolling() { clearTimeout(pollTimer); pollTimer = null; }

  function langSeg() {
    return h('div', { class: 'seg lang-seg', role: 'group', 'aria-label': t('lang.label') },
      I.LANGS.map(l => h('button', {
        type: 'button', 'data-k': 'lang:' + l, 'aria-pressed': String(S.lang === l),
        onclick: () => { S.lang = l; LS.set('lang', l); render(); renderModal(); },
      }, l.toUpperCase())));
  }

  function header() {
    return h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('b', null, 'SOL 500'), h('span', null, t('admin.title'))),
      h('div', { class: 'topbar-actions' },
        h('span', { class: 'chip info' }, ico(MODE === 'local' ? 'lock' : 'wifi', 14), t(MODE === 'local' ? 'admin.modeLocal' : 'admin.modeLan')),
        h('a', { class: 'btn btn-ghost btn-sm', href: '/', 'data-k': 'admin-back' }, t('admin.back')),
        langSeg()));
  }

  function tabs() {
    const move = (e, k) => {
      const i = TABS.indexOf(k);
      const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : null;
      if (next) { e.preventDefault(); setTab(next); const b = document.getElementById('tab-' + next); if (b) b.focus(); }
    };
    return h('nav', { class: 'adm-tabs', role: 'tablist', 'aria-label': t('admin.title') }, TABS.map(k => h('button', {
      type: 'button', role: 'tab', id: 'tab-' + k, 'aria-selected': String(S.tab === k), 'aria-controls': 'adm-main',
      tabindex: S.tab === k ? '0' : '-1', 'data-k': 'tab:' + k, onclick: () => setTab(k), onkeydown: e => move(e, k),
    }, ico(TAB_ICON[k], 16), t('admin.tab.' + k))));
  }

  function banner() {
    if (S.problem === 'stale') {
      return h('div', { class: 'adm-banner', role: 'alert' }, ico('warn', 16), t('admin.stale'),
        h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'reload', onclick: () => location.reload() }, ico('refresh', 14), t('admin.reload')));
    }
    if (S.problem === 'network') return h('div', { class: 'adm-banner', role: 'alert' }, ico('warn', 16), t('admin.error'));
    return null;
  }

  function viewLogin() {
    const pw = h('input', { class: 'input', type: 'password', id: 'adm-pw', autocomplete: 'current-password', maxlength: 64, required: true });
    const form = h('form', { class: 'panel', 'data-k': 'login' },
      h('h1', { class: 'eyebrow' }, t('admin.login.title')),
      h('p', { class: 'muted' }, t('admin.login.body')),
      h('div', { class: 'field' }, h('label', { for: 'adm-pw' }, t('admin.login.password')), pw),
      S.loginError ? h('p', { class: 'adm-msg crit', role: 'alert' }, t(S.loginError)) : null,
      h('button', { class: 'btn btn-primary', type: 'submit' }, ico('lock', 16), t('admin.login.go')),
      h('a', { class: 'btn btn-ghost btn-sm', href: '/' }, t('admin.back')));
    form.addEventListener('submit', e => { e.preventDefault(); login(pw.value); });
    setTimeout(() => pw.focus(), 0);
    return h('div', { class: 'adm-login' }, form);
  }

  function render() {
    document.documentElement.lang = S.lang;
    document.title = t('admin.title') + ' · SOL 500';
    root.textContent = '';
    if (MODE === 'lan' && !S.token) { root.appendChild(viewLogin()); return; }
    add(root, [header(), tabs(), h('main', { class: 'adm-main', id: 'adm-main', role: 'tabpanel', 'aria-labelledby': 'tab-' + S.tab },
      banner(), (VIEWS[S.tab] || viewHistory)())]);
  }

  function load() { (LOADERS[S.tab] || loadHistory)(); }
  function setTab(k) {
    if (k === S.tab) return;
    stopPolling();
    S.tab = k;
    LS.set('adminTab', k);
    render();
    load();
  }

  // The live and project tabs register themselves in the next block of this file (Task 11).
  window.SolAdmin = {
    S, h, add, ico, panel, stat, emptyPanel, api, ask, closeModal, flash, render, renderModal, t, nf, dateTime, clock, VIEWS, LOADERS, MODE,
    poll: { get timer() { return pollTimer; }, set timer(v) { pollTimer = v; }, stop: stopPolling },
  };

  render();
  if (S.token && S.tab === 'history') load(); // the live and project loaders start themselves once they register
})();
