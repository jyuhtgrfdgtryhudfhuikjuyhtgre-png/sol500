/*
 * SOL 500 — the interface: title, payload manifest, operations, debrief, LAN lobby and dialogs.
 * Renders the whole screen from state on every change; the engine does all the simulation.
 * localStorage keys (per browser): sol500.lang, sol500.settings, sol500.names, sol500.badges, sol500.save.
 */
(function () {
  'use strict';
  const D = window.SolData, E = window.SolEngine, I = window.SolI18n, A = window.SolArt, C = window.SolCharts, N = window.SolNet;
  const app = document.getElementById('app');

  // ---------- storage (every access guarded: private windows and previews can throw) ----------
  const LS = {
    get(k, d) {
      try { const v = localStorage.getItem('sol500.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem('sol500.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem('sol500.' + k); } catch (e) { /* ignore */ } },
  };

  // ---------- state ----------
  const store = {
    lang: LS.get('lang', /^vi/i.test(navigator.language || '') ? 'vi' : 'en'),
    screen: 'title',
    settings: Object.assign({ difficulty: D.DEFAULT_DIFFICULTY, crewSize: D.DEFAULT_CREW, training: false }, LS.get('settings', {})),
    seed: E.newMissionCode(),
    names: LS.get('names', {}),
    loadout: null,
    mission: null,
    plan: null,
    buildType: null,
    report: null,
    modal: null,
    confirm: null,
    advice: null,
    badges: new Set(LS.get('badges', [])),
    newBadges: [],
    lanInfo: null,
    lan: null,
    room: null,
    lanStatus: null,
    lanError: null,
    lastTurnSeen: null,
    toast: null,
    prevScreen: null,
    opsView: LS.get('opsView', 'surface'),
    controlId: LS.get('controlId', null),
  };
  const saved = LS.get('save', null);
  if (saved && saved.mission && saved.mission.status === 'active' && saved.mission.version === 2) {
    store.mission = saved.mission;
    store.plan = saved.plan || E.defaultPlan(saved.mission);
  }

  // ---------- helpers ----------
  const t = (k, p) => I.t(store.lang, k, p);
  const locale = () => (store.lang === 'vi' ? 'vi-VN' : 'en-US');
  const nf = (n, d) => new Intl.NumberFormat(locale(), { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }).format(n);
  const signed = (n, d) => (n > 0.0001 ? '+' : n < -0.0001 ? '−' : '±') + nf(Math.abs(n), d);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function h(tag, attrs) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'html') n.innerHTML = v; // only trusted SVG strings from SolArt
        else if (k === 'text') n.textContent = v;
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
  function svgNode(str) {
    const tpl = document.createElement('template');
    tpl.innerHTML = str.trim();
    return tpl.content.firstElementChild;
  }
  const ico = (name, size) => h('span', { class: 'ico-i', html: A.icon(name, size || 16), style: 'display:inline-flex' });

  function panel(title, body, extra) {
    return h('section', { class: 'panel', 'aria-label': title },
      h('div', { class: 'panel-h' }, h('h2', { class: 'eyebrow' }, title), extra || null),
      h('div', { class: 'panel-b' }, body));
  }

  function seg(key, options, value, onPick, disabled) {
    return h('div', { class: 'seg', role: 'group' }, options.map(o =>
      h('button', {
        type: 'button', 'data-k': key + ':' + o.value, 'aria-pressed': String(o.value === value), disabled: disabled || o.disabled,
        title: o.title || null, onclick: () => onPick(o.value),
      }, o.label)));
  }

  function bar(frac, cls, tickFrac) {
    return h('div', { class: 'bar ' + (cls || '') },
      h('span', { style: 'width:' + (clamp(frac, 0, 1) * 100).toFixed(1) + '%' }),
      tickFrac != null ? h('i', { class: 'tick', style: 'left:' + (tickFrac * 100).toFixed(1) + '%' }) : null);
  }

  function toast(msg) {
    store.toast = msg;
    render();
    setTimeout(() => { if (store.toast === msg) { store.toast = null; render(); } }, 2200);
  }

  function copyText(text) {
    const done = () => toast(t('common.copied') + ': ' + text);
    try {
      navigator.clipboard.writeText(text).then(done, () => toast(text));
    } catch (e) {
      toast(text);
    }
  }

  // ---------- LAN helpers ----------
  const lanOn = () => !!(store.lan && store.room);
  const me = () => (lanOn() ? store.room.players.find(p => p.id === store.lan.playerId) : null);
  const isHost = () => !lanOn() || store.room.hostId === store.lan.playerId;
  const mission = () => (lanOn() ? store.room.mission : store.mission);
  const currentPlan = () => (lanOn() ? store.room.plan : store.plan);
  function namesMap() { return lanOn() ? (store.room.settings.names || {}) : store.names; }
  function crewName(id) {
    const n = namesMap()[id];
    return (n && String(n).trim()) || t('name.' + id);
  }
  function controllerOf(crewId) {
    if (!lanOn()) return null;
    return store.room.players.find(p => p.crewId === crewId) || null;
  }
  function canControl(crewId) {
    if (!lanOn()) return true;
    const mine = me();
    if (mine && mine.crewId === crewId) return true;
    return !controllerOf(crewId) && isHost();
  }

  // ---------- persistence ----------
  function saveSolo() {
    if (lanOn()) return;
    if (store.mission && store.mission.status === 'active') LS.set('save', { mission: store.mission, plan: store.plan });
    else LS.del('save');
  }
  function saveSettings() { LS.set('settings', store.settings); }

  // ---------- actions ----------
  function go(screen) {
    store.screen = screen;
    store.buildType = null;
    render();
    window.scrollTo(0, 0);
  }

  function setLang(l) {
    store.lang = l;
    LS.set('lang', l);
    render();
  }

  function startManifest(training) {
    store.settings.training = !!training;
    saveSettings();
    if (!store.loadout) store.loadout = E.referenceKit(store.settings.difficulty, store.settings.crewSize);
    go('manifest');
  }

  function launch() {
    const L = store.loadout;
    if (lanOn()) { N.act('launch'); return; }
    const s = E.createMission({
      seed: (store.seed || '').trim() || E.newMissionCode(), loadout: L, difficulty: store.settings.difficulty,
      crewSize: store.settings.crewSize, events: !store.settings.training, names: store.names,
    });
    store.mission = s;
    store.plan = E.defaultPlan(s);
    store.report = null;
    store.advice = null;
    saveSolo();
    go('ops');
  }

  function patchPlan(patch) {
    const p = currentPlan();
    if (!p) return;
    Object.assign(p, patch);
    if (lanOn()) N.act('plan', { patch });
    else saveSolo();
    render();
  }

  function setJob(crewId, job) {
    const p = currentPlan();
    p.jobs = Object.assign({}, p.jobs, { [crewId]: job });
    if (lanOn()) N.act('job', { crewId, job });
    else saveSolo();
    render();
  }

  function choose(type, option) {
    const p = currentPlan();
    patchPlan({ choices: Object.assign({}, p.choices, { [type]: option }), answered: Object.assign({}, p.answered || {}, { [type]: true }) });
  }

  function unanswered(s, p) {
    return (s.events || []).filter(e => e.options && !((p.answered || {})[e.type])).length;
  }

  function checkBadges(state) {
    const got = E.achievements(state);
    const fresh = got.filter(b => !store.badges.has(b));
    fresh.forEach(b => store.badges.add(b));
    if (fresh.length) LS.set('badges', [...store.badges]);
    store.newBadges = fresh;
  }

  function advance() {
    if (lanOn()) return;
    const { state, report } = E.resolveTurn(store.mission, store.plan);
    store.mission = state;
    store.plan = E.nextPlan(state, store.plan);
    store.report = report;
    store.buildType = null;
    store.advice = null;
    checkBadges(state);
    store.modal = 'report';
    saveSolo();
    render();
  }

  function askAdvice() {
    const s = mission();
    if (lanOn()) { N.act('advice'); return; }
    store.advice = { turn: s.turn, items: E.advise(s, store.plan) };
    render();
  }

  function flyAgain() {
    const s = mission();
    if (lanOn()) { N.act('restart'); return; }
    store.seed = s.seed;
    store.settings.difficulty = s.difficulty;
    store.settings.crewSize = s.crewSize;
    store.settings.training = !s.eventsOn;
    store.loadout = Object.assign({}, s.loadout);
    store.mission = null;
    store.plan = null;
    saveSolo();
    go('manifest');
  }

  function newMission() {
    if (lanOn()) { N.act('restart'); return; }
    store.mission = null;
    store.plan = null;
    store.seed = E.newMissionCode();
    saveSolo();
    go('title');
  }

  // ---------- shared chrome ----------
  function langSeg() {
    return h('div', { class: 'seg lang-seg', role: 'group', 'aria-label': t('lang.label') },
      I.LANGS.map(l => h('button', { type: 'button', 'data-k': 'lang:' + l, 'aria-pressed': String(store.lang === l), onclick: () => setLang(l) }, l.toUpperCase())));
  }

  function topbar(extra) {
    return h('header', { class: 'topbar' },
      h('button', { class: 'brand', type: 'button', onclick: () => { if (!lanOn()) go('title'); } },
        h('b', null, 'SOL 500'), h('span', null, t('app.sub'))),
      h('div', { class: 'topbar-actions' },
        extra || null,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { store.modal = 'notes'; render(); } }, ico('book'), t('nav.notes')),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { store.modal = 'help'; render(); } }, ico('help'), t('nav.help')),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { store.modal = 'badges'; render(); } }, ico('trophy'), t('nav.achievements')),
        langSeg()));
  }

  // ---------- title ----------
  function viewTitle() {
    const st = store.settings;
    const diffOpts = Object.keys(D.DIFFICULTY).map(k => ({ value: k, label: t('diff.' + k) }));
    const resume = store.mission && store.mission.status === 'active' && !lanOn();
    return [
      topbar(),
      h('section', { class: 'title-hero' },
        svgNode(A.landscape()),
        h('div', { class: 'hero-copy' },
          h('h1', { class: 'wordmark', 'aria-label': 'SOL 500' }, h('span', { class: 'sol' }, 'SOL'), h('span', { class: 'five' }, '500')),
          h('p', { class: 'hero-sub' }, t('app.sub')),
          h('p', { class: 'hero-tag' }, t('app.tagline')))),
      h('div', { class: 'title-grid' },
        panel(t('title.start'), h('div', { class: 'setup' },
          h('div', { class: 'setup-row' },
            h('span', { class: 'label eyebrow' }, t('title.difficulty')),
            seg('diff', diffOpts, st.difficulty, v => { st.difficulty = v; store.loadout = null; saveSettings(); render(); }),
            h('p', { class: 'hint' }, t('diff.' + st.difficulty + '.hint'))),
          h('div', { class: 'setup-row' },
            h('span', { class: 'label eyebrow' }, t('title.crew')),
            seg('crew', [{ value: 4, label: t('crew.four') }, { value: 5, label: t('crew.five') }], st.crewSize,
              v => { st.crewSize = v; store.loadout = null; saveSettings(); render(); }),
            st.crewSize === 5 ? h('p', { class: 'hint' }, t('crew.fiveHint')) : null),
          h('div', { class: 'setup-row' },
            h('label', { class: 'label eyebrow', for: 'code' }, t('title.code')),
            h('div', { class: 'code-row' },
              h('input', {
                id: 'code', class: 'input num', value: store.seed, maxlength: 24, autocomplete: 'off', spellcheck: 'false',
                oninput: e => { store.seed = e.target.value.toUpperCase(); },
              }),
              h('button', { class: 'btn', type: 'button', 'data-k': 'newcode', onclick: () => { store.seed = E.newMissionCode(); render(); } }, ico('refresh'), t('title.random'))),
            h('p', { class: 'hint' }, t('title.codeHint'))),
          h('div', { class: 'setup-actions' },
            h('button', { class: 'btn btn-primary btn-lg', type: 'button', 'data-k': 'start', onclick: () => startManifest(false) }, ico('rocket', 20), t('title.start')),
            h('button', { class: 'btn btn-lg', type: 'button', 'data-k': 'train', onclick: () => startManifest(true), title: t('title.trainingHint') }, t('title.training')),
            resume ? h('button', { class: 'btn btn-lg', type: 'button', 'data-k': 'resume', onclick: () => go('ops') }, t('title.resume', { sol: store.mission.sol })) : null,
            installButton()),
          h('p', { class: 'hint' }, t('title.trainingHint')),
          h('div', { class: 'divider' }),
          store.lanInfo
            ? h('div', { class: 'setup-row' },
              h('button', { class: 'btn', type: 'button', 'data-k': 'lan', onclick: () => { store.modal = 'lan'; render(); } }, ico('wifi'), t('title.lan')),
              h('p', { class: 'hint' }, t('title.lanHint')))
            : h('p', { class: 'hint' }, ico('wifi', 14), ' ', t('title.lanOff')))),
        panel(t('title.loop'), [
          h('div', { class: 'phases' },
            ['pack', 'operate', 'debrief'].map((k, i) => h('div', { class: 'phase' },
              h('span', { class: 'idx' }, '0' + (i + 1)),
              h('h3', null, t('title.' + k)),
              h('p', { class: 'muted' }, t('title.' + k + '.body'))))),
          h('div', { class: 'divider' }),
          h('span', { class: 'eyebrow' }, t('title.crewLine')),
          h('div', { class: 'lineup' }, D.CREW.map((c, i) => h('div', { class: 'who' },
            h('div', { html: A.portrait(c.role, 48, { variant: i }) }),
            h('div', null, h('b', null, crewName(c.id)), h('span', { class: 'role-tag', style: 'color:' + A.ROLE[c.role] }, t('role.' + c.role)),
              h('p', null, t('role.' + c.role + '.skill')))))),
        ])),
      h('div', { class: 'facts' },
        [['0.64', 'mSv', 'title.fact1'], ['0.84', 'kg', 'title.fact2'], ['43', '%', 'title.fact3']].map(([n, u, k]) =>
          h('div', { class: 'fact' }, h('b', null, nf(Number(n), n.includes('.') ? 2 : 0) + ' ' + u), h('span', { class: 'muted' }, t(k))))),
      h('div', { class: 'title-foot' },
        h('p', { class: 'hint' }, t('title.credit')),
        h('span', { class: 'hint' }, t('ach.progress', { n: store.badges.size, m: D.ACHIEVEMENTS.length }))),
    ];
  }

  // ---------- manifest ----------
  const GROUP_COLOR = { hq: '#8f7f78', power: '#e9a13b', life: '#7fd1a0', shield: '#6fa8ff', science: '#d69cf0', supplies: '#d9aa7a' };

  function manifestSettings() {
    if (lanOn()) return { difficulty: store.room.settings.difficulty, crewSize: store.room.settings.crewSize };
    return { difficulty: store.settings.difficulty, crewSize: store.settings.crewSize };
  }

  function currentLoadout() {
    if (lanOn()) return store.room.loadout || E.referenceKit(store.room.settings.difficulty, store.room.settings.crewSize);
    return store.loadout;
  }

  function setLoadout(L) {
    if (lanOn()) { store.room.loadout = L; N.act('loadout', { loadout: L }); render(); return; }
    store.loadout = L;
    render();
  }

  function viewManifest() {
    const { difficulty, crewSize } = manifestSettings();
    const L = currentLoadout();
    const sum = E.summarizeLoadout(L, difficulty, crewSize);
    const editable = isHost();
    const scaleMax = Math.max(sum.budget * 1.12, sum.mass);
    const segs = [['hq', D.HAB.mass]];
    for (const g of Object.keys(D.ITEM_GROUPS)) {
      const m = D.ITEM_GROUPS[g].reduce((a, id) => a + (L[id] || 0) * D.ITEMS[id].mass, 0);
      if (m > 0) segs.push([g, m]);
    }
    const over = sum.over;

    const massHead = h('div', { class: 'man-head' },
      h('span', { class: 'eyebrow' }, t('man.step') + ' · ' + t('diff.' + difficulty)),
      h('h1', { style: 'font-size:var(--fs-2xl)' }, t('man.title')),
      h('p', { class: 'muted', style: 'max-width:70ch' }, t('man.lead')),
      h('div', { class: 'mass-read' },
        h('div', null, h('span', { class: 'big' }, nf(sum.mass, 2)), h('span', { class: 'muted' }, ' / ' + nf(sum.budget, 0) + ' t · ' + t('man.mass'))),
        h('span', { class: 'chip ' + (over ? 'crit' : sum.remaining < 0.5 ? 'warn' : 'ok') },
          over ? t('man.over', { t: nf(-sum.remaining, 2) }) : t('man.left', { t: nf(sum.remaining, 2) }))),
      h('div', { class: 'massbar' + (over ? ' over' : ''), role: 'img', 'aria-label': t('man.mass') + ' ' + nf(sum.mass, 2) + ' / ' + sum.budget + ' t' },
        segs.map(([g, m]) => h('span', { class: 'seg-fill', style: `width:${(m / scaleMax) * 100}%;background:${GROUP_COLOR[g]}` })),
        h('i', { class: 'budget-mark', style: `left:${(sum.budget / scaleMax) * 100}%` })),
      h('div', { class: 'legend' },
        [['hq', 'mod.hab'], ['power', 'grp.power'], ['life', 'grp.life'], ['shield', 'grp.shield'], ['science', 'grp.science'], ['supplies', 'grp.supplies']]
          .map(([g, k]) => h('span', null, h('i', { style: 'background:' + GROUP_COLOR[g] }), t(k)))));

    const groups = h('div', { class: 'man-groups' },
      Object.keys(D.ITEM_GROUPS).map(g => panel(t('grp.' + g), h('div', { class: 'items' },
        D.ITEM_GROUPS[g].map(id => itemRow(id, L, editable, sum))))),
      crewRoster(crewSize));

    const review = h('div', { class: 'review' }, reviewPanel(sum, L, editable));
    const lanWait = lanOn() && !isHost() ? h('p', { class: 'chip info' }, t('lan.waiting')) : null;
    return [
      topbar(lanOn() ? lanChip() : null),
      massHead,
      lanWait,
      h('div', { class: 'man-grid' }, groups, review),
      h('div', { class: 'mobile-launch' },
        h('span', { class: 'num' }, nf(sum.mass, 2) + ' / ' + sum.budget + ' t'),
        launchButton(sum, editable)),
    ];
  }

  function itemRow(id, L, editable, sum) {
    const n = L[id] || 0;
    const it = D.ITEMS[id];
    const change = d => {
      const next = Object.assign({}, L, { [id]: clamp(n + d, 0, it.max) });
      setLoadout(next);
    };
    return h('div', { class: 'item' },
      h('div', { class: 'ico', html: A.itemArt(id, 46) }),
      h('div', { style: 'min-width:0' },
        h('div', { class: 'name' }, t('item.' + id + '.name')),
        h('p', { class: 'desc' }, t('item.' + id + '.desc')),
        h('p', { class: 'fact-line' }, t('item.' + id + '.fact'))),
      h('div', { class: 'qty' },
        h('div', { class: 'stepper' },
          h('button', { type: 'button', 'data-k': 'dec:' + id, 'aria-label': '−1 ' + t('item.' + id + '.name'), disabled: !editable || n <= 0, onclick: () => change(-1) }, '−'),
          h('output', { 'aria-live': 'polite' }, String(n)),
          h('button', { type: 'button', 'data-k': 'inc:' + id, 'aria-label': '+1 ' + t('item.' + id + '.name'), disabled: !editable || n >= it.max, onclick: () => change(1) }, '+')),
        h('span', { class: 'sub num' }, nf(n * it.mass, 2) + ' t · ' + t('man.each', { m: nf(it.mass, 2) }))));
  }

  function solsText(v) {
    return v === Infinity ? t('common.forever') : t('common.sols', { n: nf(Math.floor(v)) });
  }

  function reviewPanel(sum, L, editable) {
    const runway = (label, v, extra) => {
      const frac = v === Infinity ? 1 : v / sum.mission;
      const cls = v >= sum.mission ? 'ok' : v >= sum.mission * 0.6 ? 'warn' : 'crit';
      return h('div', { class: 'review-row' },
        h('div', { class: 'top' }, h('span', null, label), h('b', { class: 'num' }, solsText(v))),
        bar(frac, cls), extra ? h('span', { class: 'hint' }, extra) : null);
    };
    const p = sum.power;
    const powRow = (label, val, need, needKey) => h('div', { class: 'review-row' },
      h('div', { class: 'top' }, h('span', null, label), h('b', { class: 'num' }, nf(val, 1) + ' kW')),
      bar(val / Math.max(val, need, 1), val >= need ? 'ok' : 'crit', need / Math.max(val, need, 1)),
      h('span', { class: 'hint' }, t(needKey, { kw: nf(need, 1) })));
    const doseFrac = sum.doseIndoor / D.DOSE_LIMIT;
    return panel(t('man.review'), [
      runway(t('rev.o2'), sum.sols.o2),
      runway(t('rev.water'), sum.sols.water, L.waterwall ? t('rev.withWall', { n: solsText(sum.sols.waterWithWall) }) : null),
      runway(t('rev.food'), sum.sols.food),
      powRow(t('rev.powerClear'), p.clear, p.demand, 'rev.need'),
      powRow(t('rev.powerStorm'), p.storm, p.habKw, 'rev.habNeed'),
      h('div', { class: 'review-row' },
        h('div', { class: 'top' }, h('span', null, t('rev.dose')), h('b', { class: 'num' }, nf(sum.doseIndoor) + ' mSv')),
        bar(doseFrac, doseFrac > 0.8 ? 'crit' : doseFrac > 0.6 ? 'warn' : 'ok', 0.8),
        h('span', { class: 'hint' }, t('rev.budget', { n: D.DOSE_LIMIT }) + ' · ' + t('hud.shield') + ' ' + nf(sum.shielding * 100) + ' %')),
      h('div', { class: 'divider' }),
      sum.warnings.length
        ? h('ul', { class: 'warnlist' }, sum.warnings.map(w => {
          const crit = ['over_budget', 'power_short', 'no_recycler', 'o2_short', 'water_short'].includes(w);
          return h('li', { class: crit ? 'crit' : 'warn' }, ico(crit ? 'crit' : 'warn', 16), h('span', { style: 'color:var(--fg)' }, t('mwarn.' + w)));
        }))
        : h('p', { class: 'ok' }, ico('ok', 16), ' ', t('rev.clear')),
      h('div', { class: 'setup-actions' },
        h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'ref', disabled: !editable, onclick: () => { const ms = manifestSettings(); setLoadout(E.referenceKit(ms.difficulty, ms.crewSize)); } }, t('man.reference')),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'data-k': 'empty', disabled: !editable, onclick: () => setLoadout(E.normalizeLoadout({})) }, t('man.clear'))),
      launchButton(sum, editable),
    ]);
  }

  function launchButton(sum, editable) {
    return h('button', {
      class: 'btn btn-primary btn-lg btn-block', type: 'button', 'data-k': 'launch', disabled: sum.over || !editable,
      onclick: launch,
    }, ico('rocket', 20), sum.over ? t('man.blocked', { t: nf(-sum.remaining, 2) }) : t('man.launch'));
  }

  function crewRoster(crewSize) {
    const crew = D.CREW.slice(0, crewSize);
    return panel(t('man.crew'), [
      h('p', { class: 'hint' }, t('man.crewHint')),
      h('div', { class: 'crew-edit' }, crew.map((c, i) => h('div', { class: 'card' },
        h('div', { html: A.portrait(c.role, 56, { variant: i }) }),
        h('div', { class: 'field' },
          h('label', { for: 'name-' + c.id }, t('role.' + c.role)),
          h('input', {
            id: 'name-' + c.id, class: 'input', value: crewName(c.id), maxlength: 24, disabled: lanOn(),
            oninput: e => { store.names[c.id] = e.target.value; LS.set('names', store.names); },
          })),
        h('p', { class: 'skill' }, t('role.' + c.role + '.skill'))))),
    ]);
  }

  // ---------- operations ----------
  function seasonKey(ls) {
    if (ls < 90) return 'season.spring';
    if (ls < 180) return 'season.summer';
    if (ls < 270) return 'season.autumn';
    return 'season.winter';
  }

  function lightDelay(sol) {
    return Math.round(12.7 + 9.6 * Math.cos((2 * Math.PI * (sol - 262)) / 760));
  }

  // Which crew member the local player walks around as.
  function controlId() {
    const s = mission();
    if (!s) return null;
    if (lanOn()) { const mine = me(); return mine ? mine.crewId : null; }
    const pick = s.crew.find(c => c.id === store.controlId && c.status !== 'dead');
    return (pick || s.crew.find(c => c.status === 'active') || s.crew[0]).id;
  }

  function setOpsView(v) {
    store.opsView = v;
    LS.set('opsView', v);
    render();
  }

  const surfaceHooks = {
    queueBuild: b => { const p = currentPlan(); patchPlan({ builds: (p.builds || []).concat([b]) }); },
    cancelBuild: i => { const p = currentPlan(); patchPlan({ builds: (p.builds || []).filter((_, j) => j !== i) }); },
    toggleModule: ty => { const p = currentPlan(); patchPlan({ modulesOn: Object.assign({}, p.modulesOn, { [ty]: (p.modulesOn || {})[ty] === false }) }); },
    toggleScrap: ty => { const p = currentPlan(); const on = (p.scrap || []).includes(ty); patchPlan({ scrap: on ? p.scrap.filter(x => x !== ty) : (p.scrap || []).concat([ty]) }); },
    setJob: (id, job) => setJob(id, job),
    openConsole: () => setOpsView('console'),
    canAdvance: () => { const s = mission(); return !!s && unanswered(s, currentPlan()) === 0; },
    advance: () => {
      if (lanOn()) { const mine = me(); N.act('ready', { ready: !(mine && mine.ready) }); return; }
      if (surfaceHooks.canAdvance()) advance();
    },
    sendPos: pos => { if (lanOn() && me() && me().crewId) N.sendPos(pos); },
  };

  function surfaceStage(s, p, f) {
    if (!window.SolSurface) return null;
    const node = window.SolSurface.mount(surfaceHooks);
    window.SolSurface.update({
      mission: s, plan: p, forecast: f, controlId: controlId(), canControl, crewName, t, lang: store.lang,
    });
    return h('div', { class: 'sf-stage' }, node);
  }

  function surfaceSide(s, p, f) {
    const ctl = controlId();
    const chooser = lanOn() ? null : h('div', { class: 'playas' }, s.crew.map((c, i) => h('button', {
      type: 'button', class: 'playas-b', 'data-k': 'play:' + c.id, 'aria-pressed': String(c.id === ctl), disabled: c.status === 'dead',
      title: crewName(c.id) + ' · ' + t('role.' + c.role),
      onclick: () => { store.controlId = c.id; LS.set('controlId', c.id); render(); },
    }, h('span', { html: A.portrait(c.role, 34, { variant: i, status: c.status }) }))));
    const jobs = panel(t('sf.jobs'), h('div', { class: 'jobrows' }, s.crew.map((c, i) => {
      const allowed = canControl(c.id) && c.status === 'active';
      const job = p.jobs[c.id];
      const sel = h('select', {
        'data-k': 'jobsel:' + c.id, name: 'job-' + c.id, id: 'job-' + c.id, 'aria-label': crewName(c.id), disabled: !allowed,
        onchange: e => setJob(c.id, e.target.value),
      }, D.JOB_ORDER.map(j => h('option', { value: j, selected: j === job ? true : null, disabled: c.grounded && D.OUTDOOR_JOBS.includes(j) ? true : null },
        t('job.' + j) + (D.SPECIALTY[c.role].includes(j) ? ' ★' : ''))));
      const state = c.status === 'down' ? h('span', { class: 'chip crit' }, t('crew.down', { n: D.REVIVE.window - c.downTurns }))
        : c.status === 'dead' ? h('span', { class: 'chip' }, t('crew.dead'))
          : h('span', { class: 'faint num', style: 'font-size:var(--fs-xs)' }, Math.round(c.health) + ' HP · ' + Math.round(c.dose) + ' mSv');
      return h('div', { class: 'jobrow' + (c.id === ctl ? ' me' : '') },
        h('span', { html: A.portrait(c.role, 34, { variant: i, status: c.status }) }),
        h('div', { style: 'min-width:0' }, h('b', null, crewName(c.id)), h('br'), state),
        c.status === 'dead' ? h('span') : sel);
    })));
    return h('aside', { class: 'sf-side' },
      chooser ? panel(t('sf.playAs'), chooser) : null,
      eventsPanel(s, p),
      jobs,
      forecastPanel(s, p, f),
      advancePanel(s, p));
  }

  function opsTabs() {
    return h('div', { class: 'ops-tabs seg', role: 'tablist' },
      h('button', { type: 'button', role: 'tab', 'data-k': 'tab:surface', 'aria-pressed': String(store.opsView === 'surface'), 'aria-selected': String(store.opsView === 'surface'), onclick: () => setOpsView('surface') }, ico('eva', 16), ' ', t('sf.surface')),
      h('button', { type: 'button', role: 'tab', 'data-k': 'tab:console', 'aria-pressed': String(store.opsView === 'console'), 'aria-selected': String(store.opsView === 'console'), onclick: () => setOpsView('console') }, ico('book', 16), ' ', t('sf.consoleTab')));
  }

  function viewOps() {
    const s = mission();
    const p = currentPlan();
    if (!s || !p) return viewTitle();
    const f = E.forecast(s, p);
    if (store.opsView !== 'console' && window.SolSurface) {
      return [hud(s, f), opsTabs(), h('div', { class: 'sf-layout' }, surfaceStage(s, p, f), surfaceSide(s, p, f))];
    }
    return [
      hud(s, f),
      opsTabs(),
      h('div', { class: 'ops' },
        h('div', { class: 'col col-1' }, eventsPanel(s, p), mapPanel(s, p, f), buildPanel(s, p, f)),
        h('div', { class: 'col col-2' }, crewPanel(s, p, f)),
        h('div', { class: 'col col-3' }, forecastPanel(s, p, f), systemsPanel(s, p, f), ordersPanel(s, p), earthPanel(s, p), advancePanel(s, p))),
    ];
  }

  function hud(s, f) {
    const season = E.seasonAt(s.sol);
    const weather = s.schedule[s.turn].weather;
    const remaining = (D.TURNS - s.turn) * D.TURN_SOLS;
    const track = h('div', { class: 'track', 'aria-label': t('ops.round', { n: s.turn + 1, m: D.TURNS }) },
      Array.from({ length: D.TURNS }, (_, i) => {
        let cls = '';
        if (i < s.turn) { const w = s.history[i + 1] && s.history[i + 1].weather; cls = 'done' + (w && w !== 'clear' ? ' ' + w : ''); }
        if (i === s.turn) cls = 'now';
        return h('span', { class: cls });
      }));
    const stockMeter = (key, iconName, value, delta, runwaySols) => {
      const cls = runwaySols < D.TURN_SOLS ? 'crit' : runwaySols < remaining ? 'warn' : '';
      return h('div', { class: 'meter ' + cls },
        h('span', { class: 'k' }, ico(iconName, 14), t(key)),
        h('span', { class: 'v' }, nf(value) + ' kg'),
        h('span', { class: 'd ' + (delta < 0 ? (cls || 'faint') : 'ok') },
          signed(delta) + ' · ' + (runwaySols === Infinity ? t('hud.steady') : t('hud.runway', { n: nf(Math.floor(runwaySols)) }))));
    };
    const pw = f.power;
    const margin = pw.supply - pw.demand;
    const moraleCls = s.morale < 20 ? 'crit' : s.morale < 40 ? 'warn' : '';
    return h('div', { class: 'hud' },
      h('div', { class: 'hud-top' },
        h('div', { class: 'solclock' },
          h('button', { class: 'brand brand-mini', type: 'button', title: t('nav.home'), 'aria-label': t('nav.home'), onclick: () => { if (!lanOn()) { store.modal = 'confirm'; render(); } } }, ico('flag', 16)),
          h('b', null, t('ops.sol', { sol: s.sol })),
          h('span', { class: 'muted num' }, '/ ' + D.TURNS * D.TURN_SOLS),
          h('span', { class: 'muted' }, '· ' + t('ops.round', { n: s.turn + 1, m: D.TURNS }))),
        track,
        h('div', { class: 'topbar-actions' },
          h('span', { class: 'chip' }, t(seasonKey(season.ls)) + ' · Ls ' + Math.round(season.ls) + '°'),
          h('span', { class: 'chip ' + (weather === 'global' ? 'crit' : weather === 'regional' ? 'warn' : '') }, t('weather.' + weather)),
          lanOn() ? lanChip() : null,
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.help'), onclick: () => { store.modal = 'help'; render(); } }, ico('help')),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.notes'), onclick: () => { store.modal = 'notes'; render(); } }, ico('book')),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.achievements'), onclick: () => { store.modal = 'badges'; render(); } }, ico('trophy')),
          langSeg())),
      h('div', { class: 'meters' },
        h('div', { class: 'meter ' + (pw.habShort ? 'crit' : margin < 0 ? 'warn' : '') },
          h('span', { class: 'k' }, ico('power', 14), t('hud.power')),
          h('span', { class: 'v' }, nf(pw.supply, 1) + ' kW'),
          h('span', { class: 'd ' + (margin < 0 ? 'crit' : 'ok') }, margin >= 0 ? t('hud.spare', { kw: nf(margin, 1) }) : t('hud.short', { kw: nf(-margin, 1) }))),
        stockMeter('hud.o2', 'o2', s.resources.o2, f.delta.o2, f.runway.o2),
        stockMeter('hud.water', 'water', s.resources.water, f.delta.water, f.runway.water),
        stockMeter('hud.food', 'food', s.resources.food, f.delta.food, f.runway.food),
        h('div', { class: 'meter' },
          h('span', { class: 'k' }, ico('shield', 14), t('hud.shield')),
          h('span', { class: 'v' }, nf(E.shielding(s) * 100) + ' %'),
          h('span', { class: 'd faint' }, s.wallWater > 0 ? t('hud.wall', { kg: nf(s.wallWater) }) : s.modules.shield.count + ' / ' + D.MODULES.shield.max)),
        h('div', { class: 'meter' },
          h('span', { class: 'k' }, ico('materials', 14), t('hud.materials')),
          h('span', { class: 'v' }, nf(s.resources.materials) + ' kg'),
          h('span', { class: 'd ' + (f.delta.materials < 0 ? 'faint' : 'ok') }, signed(f.delta.materials))),
        h('div', { class: 'meter ' + (s.resources.spares === 0 ? 'warn' : '') },
          h('span', { class: 'k' }, ico('spares', 14), t('hud.spares')),
          h('span', { class: 'v' }, String(s.resources.spares)),
          h('span', { class: 'd faint' }, f.delta.spares ? signed(f.delta.spares) : '')),
        h('div', { class: 'meter ' + moraleCls },
          h('span', { class: 'k' }, ico('morale', 14), t('hud.morale')),
          h('span', { class: 'v' }, nf(s.morale)),
          h('span', { class: 'd ' + (f.moraleDelta < 0 ? 'faint' : 'ok') }, signed(f.moraleDelta))),
        h('div', { class: 'meter' },
          h('span', { class: 'k' }, ico('science', 14), t('hud.science')),
          h('span', { class: 'v' }, nf(s.science)),
          h('span', { class: 'd ok' }, signed(f.science)))));
  }

  function eventText(e, part) {
    const params = {};
    if (e.module) params.module = t('mod.' + e.module);
    if (e.crewId) params.name = crewName(e.crewId);
    if (e.kind) { params.kind = t('earth.' + e.kind).toLowerCase(); params.amount = nf(e.amount || 0); }
    return t('ev.' + e.type + '.' + part, params);
  }

  function eventsPanel(s, p) {
    const decisions = (s.events || []).filter(e => e.options);
    const infos = (s.events || []).filter(e => !e.options);
    if (!decisions.length && !infos.length) return null;
    const optionDisabled = (e, o) => (e.type === 'water_leak' && o === 'patch' && s.resources.spares < 1) ||
      (e.type === 'perchlorate' && o === 'wash' && s.resources.water < D.PERCHLORATE_WASH_WATER);
    return panel(t('panel.events'), h('div', { class: 'events' },
      decisions.map(e => h('article', { class: 'event ' + (e.emergency ? 'emergency' : 'decision') },
        h('span', { class: 'tag eyebrow ' + (e.emergency ? 'crit' : '') }, ico(e.emergency ? 'crit' : 'flag', 14), t(e.emergency ? 'ev.emergency' : 'ev.decide')),
        h('h3', null, eventText(e, 'title')),
        h('p', null, eventText(e, 'body')),
        h('div', { class: 'options' }, e.options.map(o => h('button', {
          type: 'button', class: 'option', 'data-k': 'ev:' + e.type + ':' + o,
          'aria-pressed': String(((p.answered || {})[e.type]) && p.choices[e.type] === o),
          disabled: optionDisabled(e, o),
          onclick: () => choose(e.type, o),
        }, h('b', null, t('ev.' + e.type + '.' + o)), h('span', null, t('ev.' + e.type + '.' + o + '.hint'))))))),
      infos.length ? h('div', { class: 'infos' }, infos.map(e => h('div', { class: 'info-ev' },
        h('b', null, eventText(e, 'title')), h('span', null, eventText(e, 'body'))))) : null));
  }

  // ----- outpost map -----
  const TILE = 64;
  function mapSvg(s, p, f) {
    const W = D.GRID.w * TILE, Hh = D.GRID.h * TILE;
    const ice = new Set(s.terrain.ice.map(([x, y]) => x + ',' + y));
    const rock = new Set(s.terrain.rock.map(([x, y]) => x + ',' + y));
    const shades = ['#6c3523', '#733a25', '#7a3e27', '#683322'];
    let o = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(t('panel.map'))}"><title>${esc(t('panel.map'))}</title>`;
    for (let y = 0; y < D.GRID.h; y++) {
      for (let x = 0; x < D.GRID.w; x++) {
        const k = x + ',' + y, X = x * TILE, Y = y * TILE;
        const r = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (ice.has(k)) {
          o += `<rect x="${X}" y="${Y}" width="${TILE}" height="${TILE}" fill="#86aebf"/>`;
          o += `<path d="M${X + 8} ${Y + 20}l14 6 10-9 14 11M${X + 12} ${Y + 44}l12-4 9 8 15-5" stroke="#dff1f9" stroke-width="1.5" fill="none" opacity="0.8"/>`;
          o += `<path d="M${X + 40} ${Y + 30}l6 -8 6 9z" fill="#e7f6fc" opacity="0.8"/>`;
        } else {
          o += `<rect x="${X}" y="${Y}" width="${TILE}" height="${TILE}" fill="${shades[r % 4]}"/>`;
          o += `<circle cx="${X + 10 + (r % 40)}" cy="${Y + 12 + ((r >> 5) % 40)}" r="1.6" fill="#5b2a1c"/><circle cx="${X + 20 + ((r >> 9) % 34)}" cy="${Y + 30 + ((r >> 13) % 26)}" r="1.1" fill="#8e4b31"/>`;
        }
        if (rock.has(k)) {
          o += `<ellipse cx="${X + 26}" cy="${Y + 40}" rx="16" ry="11" fill="#4c3b37"/><ellipse cx="${X + 42}" cy="${Y + 30}" rx="11" ry="8" fill="#5c4944"/><ellipse cx="${X + 22}" cy="${Y + 36}" rx="6" ry="3" fill="#6b5752"/>`;
        }
      }
    }
    for (let x = 1; x < D.GRID.w; x++) o += `<path d="M${x * TILE} 0V${Hh}" stroke="#000" stroke-opacity="0.12"/>`;
    for (let y = 1; y < D.GRID.h; y++) o += `<path d="M0 ${y * TILE}H${W}" stroke="#000" stroke-opacity="0.12"/>`;

    // regolith shield layers around the HQ
    const [hx, hy] = D.GRID.hq;
    const cx = hx * TILE + 32, cy = hy * TILE + 50;
    for (let i = s.modules.shield.count; i >= 1; i--) {
      o += `<ellipse cx="${cx}" cy="${cy}" rx="${30 + i * 5}" ry="${12 + i * 2.6}" fill="${i % 2 ? '#8e4a2c' : '#9b5433'}" stroke="#5b2a1c" stroke-opacity="0.5"/>`;
    }
    if (s.wallWater > 0) {
      o += `<ellipse cx="${cx}" cy="${cy - 18}" rx="31" ry="27" fill="none" stroke="#5fb4ff" stroke-width="2" stroke-opacity="${(0.3 + 0.6 * s.wallWater / Math.max(1, s.loadout.waterwall * D.ITEMS.waterwall.kg)).toFixed(2)}" stroke-dasharray="4 3"/>`;
    }

    // structures with status badges
    const brokenLeft = {}, offLeft = {};
    for (const type of D.MODULE_TYPES) brokenLeft[type] = s.modules[type].broken;
    const runningLeft = Object.assign({}, f.power.running);
    for (const tile of s.layout) {
      const X = tile.x * TILE, Y = tile.y * TILE;
      let badge = '';
      let dim = false;
      const name = t('mod.' + tile.type);
      let status = '';
      if (brokenLeft[tile.type] > 0) {
        brokenLeft[tile.type]--;
        badge = `<circle cx="52" cy="13" r="9" fill="#f46e5f"/><path d="M52 8v6M52 17v.4" stroke="#2a1214" stroke-width="2.6" stroke-linecap="round"/>`;
        status = ' · ' + t('sys.broken', { n: 1 });
      } else if (D.CONSUMERS.includes(tile.type)) {
        if (runningLeft[tile.type] > 0) runningLeft[tile.type]--;
        else {
          dim = true;
          offLeft[tile.type] = (offLeft[tile.type] || 0) + 1;
          badge = `<circle cx="52" cy="13" r="9" fill="#3a2e33" stroke="#9a877f"/><path d="M52 8.5v4.5M48.5 10.5a5 5 0 1 0 7 0" stroke="#f2b84f" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
          status = ' · ' + t('sys.shed', { n: 1 });
        }
      }
      o += `<g transform="translate(${X} ${Y})"${dim ? ' opacity="0.55"' : ''}><title>${esc(name + status)}</title>${A.moduleInner(tile.type, { clean: s.cleanliness })}${badge}</g>`;
    }

    // projects under construction
    for (const pr of s.projects) {
      if (pr.x == null) continue;
      const X = pr.x * TILE, Y = pr.y * TILE, frac = pr.progress / pr.work;
      o += `<g transform="translate(${X} ${Y})"><title>${esc(t('mod.' + pr.type) + ' · ' + t('bld.progress', { p: nf(pr.progress, 1), w: nf(pr.work, 1) }))}</title>${A.moduleInner('scaffold')}<g opacity="0.45">${A.moduleInner(pr.type, { clean: 1 })}</g>` +
        `<rect x="8" y="57" width="48" height="4" rx="2" fill="#140e10"/><rect x="8" y="57" width="${(48 * frac).toFixed(1)}" height="4" rx="2" fill="#8cbcec"/></g>`;
    }
    // builds queued this round
    for (const b of p.builds || []) {
      if (b.x == null) continue;
      o += `<g transform="translate(${b.x * TILE} ${b.y * TILE})"><title>${esc(t('mod.' + b.type))}</title><rect x="3" y="3" width="58" height="58" rx="6" fill="#8cbcec" fill-opacity="0.12" stroke="#8cbcec" stroke-width="2" stroke-dasharray="5 4"/>${A.moduleInner('scaffold')}</g>`;
    }
    // build mode highlights
    if (store.buildType && store.buildType !== 'shield') {
      for (const [x, y] of E.buildSpots(s, store.buildType, p.builds)) {
        o += `<g class="tile-hit" data-x="${x}" data-y="${y}" tabindex="0" role="button" aria-label="${esc(t('mod.' + store.buildType) + ' ' + (x + 1) + ',' + (y + 1))}">` +
          `<rect class="hl" x="4" y="4" width="56" height="56" rx="6" transform="translate(${x * TILE} ${y * TILE})" fill="#8cbcec" fill-opacity="0.18" stroke="#8cbcec" stroke-width="2" stroke-dasharray="6 4"/>` +
          `<path d="M${x * TILE + 32} ${y * TILE + 22}v20M${x * TILE + 22} ${y * TILE + 32}h20" stroke="#cfe4fb" stroke-width="3" stroke-linecap="round"/></g>`;
      }
    }
    // weather
    const w = s.schedule[s.turn].weather;
    if (w !== 'clear') {
      o += `<rect width="${W}" height="${Hh}" fill="${w === 'global' ? '#6b3219' : '#b5763f'}" opacity="${w === 'global' ? 0.5 : 0.22}" pointer-events="none"/>`;
      let dots = '';
      for (let i = 0; i < (w === 'global' ? 70 : 30); i++) dots += `<circle cx="${(i * 97) % W}" cy="${(i * 53) % Hh}" r="${1 + (i % 3) * 0.6}" fill="#e7b88a" opacity="0.5"/>`;
      o += `<g class="dust-drift" pointer-events="none">${dots}</g>`;
    }
    return o + '</svg>';
  }

  function mapPanel(s, p, f) {
    const node = svgNode(mapSvg(s, p, f));
    const place = target => {
      const g = target.closest && target.closest('[data-x]');
      if (!g) return;
      const x = Number(g.getAttribute('data-x')), y = Number(g.getAttribute('data-y'));
      const type = store.buildType;
      store.buildType = null;
      patchPlan({ builds: (p.builds || []).concat([{ type, x, y }]) });
    };
    node.addEventListener('click', e => place(e.target));
    node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(e.target); } });
    return panel(t('panel.map'), [
      h('div', { class: 'map-wrap' }, node),
      h('div', { class: 'map-legend' },
        h('span', null, t('map.legend')),
        store.buildType && store.buildType !== 'shield' ? h('span', { class: 'chip info' }, t('bld.placeOn') + ': ' + t('mod.' + store.buildType)) : null),
    ]);
  }

  function buildPanel(s, p, f) {
    const pending = p.builds || [];
    const builders = f.points.construction > 0;
    const busy = s.projects.length + pending.length > 0;
    const palette = h('div', { class: 'palette' }, D.BUILD_ORDER.map(type => {
      const chk = E.canBuild(s, type, pending);
      const spec = D.BUILDS[type];
      return h('button', {
        type: 'button', class: 'bld', 'data-k': 'bld:' + type, 'aria-pressed': String(store.buildType === type),
        disabled: !chk.ok, title: chk.ok ? t('bld.' + type) : t('bld.why.' + chk.reason),
        onclick: () => {
          if (type === 'shield') { patchPlan({ builds: pending.concat([{ type: 'shield' }]) }); return; }
          store.buildType = store.buildType === type ? null : type;
          render();
        },
      }, h('span', { html: A.module(type === 'shield' ? 'shelter' : type, 36) }),
      h('span', null, h('span', { class: 't' }, t('mod.' + type)), h('br'), h('span', { class: 'c' }, t('bld.cost', { kg: nf(spec.materials), w: nf(spec.work, spec.work % 1 ? 1 : 0) }))));
    }));
    const sel = store.buildType;
    return panel(t('panel.build'), [
      h('p', { class: 'hint' }, t('bld.pick'), ' ', h('b', { class: 'num', style: 'color:var(--fg)' }, nf(s.resources.materials) + ' kg'), ' · ', t('hud.materials').toLowerCase()),
      busy && !builders ? h('p', { class: 'chip warn' }, ico('warn', 14), t('bld.needBuilders')) : null,
      sel ? h('p', { class: 'muted', style: 'font-size:var(--fs-sm)' }, t('bld.' + sel)) : null,
      palette,
      pending.length ? h('div', { class: 'queue' }, h('span', { class: 'eyebrow' }, t('bld.queue')),
        pending.map((b, i) => h('div', { class: 'qrow' },
          h('span', { html: A.module(b.type === 'shield' ? 'shelter' : b.type, 26) }),
          h('span', null, t('mod.' + b.type), ' ', h('span', { class: 'faint num' }, '−' + nf(D.BUILDS[b.type].materials) + ' kg')),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-k': 'unq:' + i, onclick: () => patchPlan({ builds: pending.filter((_, j) => j !== i) }) }, t('bld.remove'))))) : null,
      s.projects.length ? h('div', { class: 'queue' }, h('span', { class: 'eyebrow' }, t('bld.projects')),
        s.projects.map(pr => h('div', { class: 'qrow' },
          h('span', { html: A.module(pr.type === 'shield' ? 'shelter' : pr.type, 26) }),
          h('div', null, h('span', null, t('mod.' + pr.type)), bar(pr.progress / pr.work, 'accent')),
          h('span', { class: 'faint num', style: 'font-size:var(--fs-xs)' }, t('bld.progress', { p: nf(pr.progress, 1), w: nf(pr.work, 1) }))))) : null,
    ]);
  }

  // ----- crew -----
  function crewPanel(s, p, f) {
    return panel(t('panel.crew'), h('div', { class: 'crew' }, s.crew.map((c, i) => crewCard(s, p, f, c, i))));
  }

  function crewCard(s, p, f, c, i) {
    const fc = f.crew.find(x => x.id === c.id) || {};
    const job = (p.jobs || {})[c.id];
    const controllable = canControl(c.id);
    const ctrl = controllerOf(c.id);
    const mine = lanOn() && me() && me().crewId === c.id;
    const chips = [];
    if (c.status === 'down') chips.push(h('span', { class: 'chip crit pulse' }, t('crew.down', { n: D.REVIVE.window - c.downTurns })));
    if (c.status === 'dead') chips.push(h('span', { class: 'chip' }, t('crew.dead')));
    if (c.grounded && c.status !== 'dead') chips.push(h('span', { class: 'chip warn' }, t('crew.grounded')));
    if (c.revives > 0 && c.status === 'active') chips.push(h('span', { class: 'chip', title: t('crew.revivedOnce') }, ico('medical', 12), '1'));
    if (mine) chips.push(h('span', { class: 'chip info' }, t('crew.you')));
    else if (ctrl) chips.push(h('span', { class: 'chip' }, t('crew.controlledBy', { name: ctrl.name })));
    const hpCls = c.health < 35 ? 'crit' : c.health < 60 ? 'warn' : 'ok';
    const doseFrac = c.dose / D.DOSE_LIMIT;
    const doseCls = doseFrac > 1 ? 'crit' : doseFrac > 0.85 ? 'warn' : 'accent';
    const jobs = h('div', { class: 'jobs', role: 'group', 'aria-label': crewName(c.id) },
      D.JOB_ORDER.map(j => {
        const spec = D.SPECIALTY[c.role].includes(j);
        const blocked = c.status !== 'active' || !controllable || (c.grounded && D.OUTDOOR_JOBS.includes(j));
        return h('button', {
          type: 'button', class: 'job', 'data-k': 'job:' + c.id + ':' + j, 'aria-pressed': String(job === j), disabled: blocked,
          title: t('job.' + j + '.hint'), onclick: () => setJob(c.id, j),
        }, ico(j, 14), t('job.' + j), spec ? h('span', { class: 'star', 'aria-label': t('crew.specialty') }, '★') : null);
      }));
    let next = null;
    if (c.status === 'active') {
      next = h('div', { class: 'crew-next' },
        h('span', null, t('crew.next', { hp: nf(clamp(c.health + (fc.healthDelta || 0), 0, 100)), dose: nf(fc.doseDelta || 0, 1) })),
        h('span', null, t('job.' + (fc.job || job) + '.hint')));
    }
    return h('article', { class: 'crew-card' + (mine ? ' mine' : '') + (c.status === 'down' ? ' down' : '') + (c.status === 'dead' ? ' dead' : '') },
      h('div', { class: 'crew-head' },
        h('div', { html: A.portrait(c.role, 52, { variant: i, status: c.status }) }),
        h('div', { style: 'min-width:0' }, h('div', { class: 'nm' }, crewName(c.id)), h('div', { class: 'rl', title: t('role.' + c.role + '.skill') }, t('role.' + c.role))),
        h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end' }, chips)),
      c.status === 'dead' ? null : h('div', { class: 'vitals' },
        h('div', { class: 'vital' }, h('div', { class: 'top' }, h('span', null, t('crew.hp')), h('b', null, nf(c.health))), bar(c.health / 100, hpCls)),
        h('div', { class: 'vital' }, h('div', { class: 'top' }, h('span', null, t('crew.dose')), h('b', null, nf(c.dose) + ' / ' + D.DOSE_LIMIT + ' mSv')), bar(doseFrac, doseCls, 0.85))),
      c.status === 'dead' ? null : jobs,
      next);
  }

  // ----- forecast -----
  function warningText(w) {
    const params = {};
    if (w.module) params.module = t('mod.' + w.module);
    if (w.crewId) params.name = crewName(w.crewId);
    if (w.turns != null) params.turns = w.turns;
    return t('w.' + w.code, params);
  }
  const CRIT_W = ['o2_out', 'water_out', 'food_out', 'hab_cold', 'death', 'down', 'dying', 'dose_over'];

  function forecastPanel(s, p, f) {
    const row = (iconName, label, delta, after, runwaySols, unit) => h('div', { class: 'fc-row' },
      ico(iconName, 16), h('span', null, label),
      h('span', { class: 'dv ' + (delta < 0 ? 'warn' : delta > 0 ? 'ok' : 'faint') }, signed(delta) + (unit || '')),
      h('span', { class: 'rw' }, runwaySols != null ? (runwaySols === Infinity ? '∞' : nf(Math.floor(runwaySols)) + ' sol') : nf(after) + (unit || '')));
    const notes = [];
    if (f.completed.length) notes.push(t('fc.completes', { list: f.completed.map(x => t('mod.' + x)).join(', ') }));
    if (f.repairs.length) notes.push(t('fc.repairs', { list: f.repairs.map(x => t('mod.' + x)).join(', ') }));
    for (const id of f.revived) notes.push(t('fc.revive', { name: crewName(id) }));
    if (f.regolith > 0) notes.push(t('fc.regolith', { kg: nf(f.regolith) }));
    return panel(t('panel.forecast'), [
      h('div', { class: 'fc-rows' },
        row('o2', t('fc.o2'), f.delta.o2, f.after.o2, f.runway.o2, ' kg'),
        row('water', t('fc.water'), f.delta.water, f.after.water, f.runway.water, ' kg'),
        row('food', t('fc.food'), f.delta.food, f.after.food, f.runway.food, ' kg'),
        row('materials', t('fc.materials'), f.delta.materials, f.after.materials, null, ' kg'),
        row('science', t('fc.science'), f.science, f.after.science, null, ''),
        row('morale', t('fc.morale'), f.moraleDelta, f.after.morale, null, '')),
      notes.length ? h('div', { class: 'notes' }, notes.map(n => h('span', null, ico('chevron', 12), ' ', n))) : null,
      f.warnings.length
        ? h('ul', { class: 'warnlist' }, f.warnings.map(w => {
          const crit = CRIT_W.includes(w.code);
          return h('li', { class: crit ? 'crit' : 'warn' }, ico(crit ? 'crit' : 'warn', 16), h('span', { style: 'color:var(--fg)' }, warningText(w)));
        }))
        : h('p', { class: 'ok', style: 'font-size:var(--fs-sm)' }, ico('ok', 14), ' ', t('fc.clear')),
    ]);
  }

  // ----- systems & power -----
  function systemsPanel(s, p, f) {
    const pw = f.power;
    const scale = Math.max(pw.supply, pw.demand, 1);
    const pct = v => (v / scale) * 100 + '%';
    const loadParts = [['hq', pw.habKw, '#8f7f78']].concat(D.CONSUMERS.map(ty => [ty, pw.running[ty] * D.MODULES[ty].kw, null]).filter(x => x[1] > 0));
    const palette = ['#6fa8ff', '#7fd1a0', '#e9a13b', '#d69cf0', '#4fd0c4', '#d9aa7a', '#f2b84f', '#9fb7d9', '#c98f5e', '#8fcf7a'];
    const maint = f.points.maintenance > 0;
    const mods = D.MODULE_TYPES.filter(ty => ty !== 'hab' && ty !== 'shield' && s.modules[ty].count > 0);
    return panel(t('panel.systems'), [
      h('div', { class: 'powerbar' },
        h('div', { class: 'pb-row' }, h('span', null, t('pow.supply')),
          h('div', { class: 'pb', title: t('pow.solar') + ' ' + nf(pw.solarKw, 1) + ' kW · ' + t('pow.reactor') + ' ' + nf(pw.reactorKw, 1) + ' kW' },
            h('span', { style: `width:${pct(pw.solarKw)};background:#e9c46a` }), h('span', { style: `width:${pct(pw.reactorKw)};background:#7fd1a0` })),
          h('span', { class: 'num' }, nf(pw.supply, 1))),
        h('div', { class: 'pb-row' }, h('span', null, t('pow.load')),
          h('div', { class: 'pb' }, loadParts.map(([ty, kw, col], i) => h('span', { title: (ty === 'hq' ? t('pow.hq') : t('mod.' + ty)) + ' ' + nf(kw, 1) + ' kW', style: `width:${pct(kw)};background:${col || palette[i % palette.length]};border-right:2px solid var(--sunk)` }))),
          h('span', { class: 'num ' + (pw.demand > pw.supply ? 'crit' : '') }, nf(pw.demand, 1))),
        h('div', { class: 'legend' },
          h('span', null, h('i', { style: 'background:#e9c46a' }), t('pow.solar') + ' ' + nf(pw.solarKw, 1)),
          h('span', null, h('i', { style: 'background:#7fd1a0' }), t('pow.reactor') + ' ' + nf(pw.reactorKw, 1)),
          h('span', null, t('pow.dust', { p: nf(s.cleanliness * 100) })))),
      mods.length ? h('div', { class: 'mods' }, mods.map(ty => {
        const m = s.modules[ty];
        const consumer = D.CONSUMERS.includes(ty);
        const on = (p.modulesOn || {})[ty] !== false;
        const running = consumer ? pw.running[ty] : Math.max(0, m.count - m.broken);
        const shed = consumer ? pw.shed[ty] : 0;
        const scrapping = (p.scrap || []).includes(ty);
        const kw = consumer ? '−' + nf(D.MODULES[ty].kw * pw.requested[ty], 1) + ' kW' :
          ty === 'solar' ? '+' + nf(pw.solarKw, 1) + ' kW' : ty === 'reactor' ? '+' + nf(pw.reactorKw, 1) + ' kW' : '';
        return h('div', { class: 'mod' },
          h('span', { html: A.module(ty, 30) }),
          h('div', { style: 'min-width:0' },
            h('div', null, t('mod.' + ty), h('span', { class: 'faint num' }, ' ×' + m.count)),
            h('div', { class: 'st' },
              running ? h('span', { class: 'chip ok' }, t('sys.running', { n: running })) : null,
              m.broken ? h('span', { class: 'chip crit' }, t('sys.broken', { n: m.broken })) : null,
              shed ? h('span', { class: 'chip warn' }, t('sys.shed', { n: shed })) : null)),
          h('span', { class: 'kw' }, kw),
          consumer ? h('button', {
            type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(on), 'data-k': 'sw:' + ty,
            'aria-label': t('mod.' + ty), onclick: () => patchPlan({ modulesOn: Object.assign({}, p.modulesOn, { [ty]: !on }) }),
          }) : h('span'),
          h('button', {
            type: 'button', class: 'iconbtn' + (scrapping ? ' on' : ''), 'data-k': 'scrap:' + ty, 'aria-pressed': String(scrapping),
            disabled: !maint && !scrapping, title: (scrapping ? t('sys.scrapQueued') : t('sys.scrap')) + (maint ? '' : ' · ' + t('sys.scrapNeed')),
            'aria-label': t('sys.scrap') + ': ' + t('mod.' + ty),
            onclick: () => patchPlan({ scrap: scrapping ? (p.scrap || []).filter(x => x !== ty) : (p.scrap || []).concat([ty]) }),
          }, ico('scrap', 15)),
          scrapping ? h('span', { class: 'chip warn scrapnote' }, t('sys.scrapQueued')) : null);
      })) : h('p', { class: 'hint' }, t('sys.none')),
    ]);
  }

  // ----- standing orders -----
  function ordersPanel(s, p) {
    const cap = s.loadout.waterwall * D.ITEMS.waterwall.kg;
    const drain = p.drainWall || 0;
    const maxDrain = s.wallWater;
    const shieldLoss = cap > 0 ? (D.ITEMS.waterwall.shielding * s.loadout.waterwall * drain / cap) * 100 : 0;
    return panel(t('panel.orders'), h('div', { class: 'orders' },
      h('div', { class: 'order' }, h('span', { class: 'label' }, t('ord.rations')),
        seg('rations', [{ value: 'full', label: t('ord.full') }, { value: 'reduced', label: t('ord.reduced') }], p.rations || 'full', v => patchPlan({ rations: v }))),
      h('div', { class: 'order' }, h('span', { class: 'label' }, t('ord.hab')),
        seg('habmode', [{ value: 'normal', label: t('ord.normal') + ' · ' + D.HAB.powerNormal + ' kW' }, { value: 'austerity', label: t('ord.austerity') + ' · ' + D.HAB.powerAusterity + ' kW' }], p.habMode || 'normal', v => patchPlan({ habMode: v }))),
      cap > 0 ? h('div', { class: 'order' },
        h('span', { class: 'label' }, t('ord.drain')),
        maxDrain > 0 ? h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' },
          h('div', { class: 'stepper' },
            h('button', { type: 'button', 'data-k': 'drain-', disabled: drain <= 0, onclick: () => patchPlan({ drainWall: Math.max(0, drain - 500) }), 'aria-label': '−500 kg' }, '−'),
            h('output', null, nf(drain / 1000, 1)),
            h('button', { type: 'button', 'data-k': 'drain+', disabled: drain + 500 > maxDrain, onclick: () => patchPlan({ drainWall: Math.min(maxDrain, drain + 500) }), 'aria-label': '+500 kg' }, '+')),
          h('span', { class: 'hint' }, 't · ', t('ord.drainHint', { kg: nf(drain), p: nf(shieldLoss, 1) })))
          : h('p', { class: 'hint' }, t('ord.drainNone'))) : null));
  }

  // ----- Earth support -----
  function earthPanel(s, p) {
    const blackout = s.schedule[s.turn].conjunction;
    const can = E.canRequest(s);
    const lead = E.activeCount(s, 'comms') > 0 ? D.DEPOT.commsLeadTurns : D.DEPOT.leadTurns;
    const etaSol = (s.turn + 1 + lead) * D.TURN_SOLS;
    const advice = lanOn() ? store.room.advice : store.advice;
    const adviceNow = advice && advice.turn === s.turn ? advice : null;
    return panel(t('panel.earth'), h('div', { class: 'earth' },
      h('p', { class: 'muted', style: 'font-size:var(--fs-sm)' }, ico('earth', 14), ' ', t('earth.drops', { n: s.depot.drops })),
      blackout ? h('p', { class: 'chip warn' }, t('earth.blackout')) : null,
      !blackout && s.depot.drops === 0 ? h('p', { class: 'hint' }, t('earth.empty')) : null,
      h('div', { class: 'drops' }, ['food', 'water', 'materials'].map(kind => h('button', {
        type: 'button', class: 'drop', 'data-k': 'drop:' + kind, 'aria-pressed': String(p.request === kind), disabled: !can,
        onclick: () => patchPlan({ request: p.request === kind ? null : kind }),
      }, h('b', null, ico(kind === 'materials' ? 'materials' : kind, 14), ' ', t('earth.' + kind)),
      h('span', null, t('earth.amount', { kg: nf(D.DEPOT.amounts[kind]) })),
      h('span', null, t('earth.eta', { sol: etaSol }))))),
      s.depot.incoming.length ? h('div', { class: 'notes' }, h('span', { class: 'eyebrow' }, t('earth.incoming')),
        s.depot.incoming.map(d => h('span', null, ico('rocket', 12), ' ', t('earth.' + d.kind), ' · ', t('earth.amount', { kg: nf(D.DEPOT.amounts[d.kind]) }), ' · ', t('earth.eta', { sol: d.eta * D.TURN_SOLS })))) : null,
      adviceNow
        ? h('div', { class: 'advice', 'aria-live': 'polite' },
          h('span', { class: 'head' }, ico('radio', 12), ' ', t('earth.adviceHead', { m: lightDelay(s.sol) })),
          h('ol', null, adviceNow.items.map(a => h('li', null, t('advice.' + a.code, {
            sols: a.sols, name: a.crewId ? crewName(a.crewId) : '', module: a.module ? t('mod.' + a.module) : '',
          })))),
          h('span', { class: 'hint' }, t('earth.adviceUsed')))
        : h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'advice', disabled: blackout, onclick: askAdvice }, ico('radio', 14), t('earth.advice'))));
  }

  // ----- advance -----
  function advancePanel(s, p) {
    const n = unanswered(s, p);
    if (lanOn()) {
      const players = store.room.players.filter(x => x.connected);
      const ready = players.filter(x => x.ready).length;
      const mine = me();
      return h('div', { class: 'advance' },
        h('p', { class: 'hint', style: 'text-align:center' }, t('lan.readyCount', { n: ready, m: players.length })),
        h('button', {
          class: 'btn btn-primary btn-lg btn-block', type: 'button', 'data-k': 'ready', disabled: n > 0,
          onclick: () => { N.act('ready', { ready: !(mine && mine.ready) }); },
        }, n > 0 ? t(n === 1 ? 'ops.answer' : 'ops.answerMany', { n }) : (mine && mine.ready ? t('lan.unready') : t('lan.ready') + ' · ' + t('ops.advance'))),
        isHost() ? h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'force', disabled: n > 0, onclick: () => N.act('advance') }, t('lan.hostAdvance')) : null);
    }
    return h('div', { class: 'advance' },
      h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', 'data-k': 'advance', disabled: n > 0, onclick: advance },
        ico('chevron', 20), n > 0 ? t(n === 1 ? 'ops.answer' : 'ops.answerMany', { n }) : t('ops.advance')));
  }

  // ---------- debrief ----------
  // Chart palettes validated for the dark panel surface (lightness band, CVD separation, 3:1 contrast).
  const STOCK_COLORS = { o2: '#199e70', water: '#3987e5', food: '#d95926' };
  const CHART_ROLE = { engineer: '#d95926', biologist: '#199e70', scientist: '#3987e5', medic: '#d55181', commander: '#c98500' };

  function lessonsFor(s) {
    const out = [];
    const push = (k, src) => { if (!out.some(x => x[0] === k)) out.push([k, src]); };
    const lost = s.status !== 'success';
    const reason = s.endCause && s.endCause.reason;
    if (s.log.some(l => l.weather === 'global' && l.solarShare > 0.5)) push('storm_solar', ['opportunity', 'fsp']);
    if (lost && reason === 'hypoxia') push('o2', ['moxie', 'bvad']);
    if (lost && reason === 'dehydration') push('water', ['water98']);
    if (lost && reason === 'starvation') push('food', ['bvad', 'veggie']);
    if (lost && (reason === 'hypoxia' || reason === 'dehydration' || reason === 'habFault')) push('spares', ['dra5']);
    if (s.crew.some(c => c.dose > D.DOSE_LIMIT * 0.85)) push('radiation', ['hassler', 'zeitlin', 'ochmo']);
    if (s.log.some(l => l.choices && l.choices.spe === 'work')) push('spe', ['hassler']);
    if (s.history.some(x => x.morale < 40)) push('morale', ['veggie']);
    if (s.totals.deaths > 0) push('death', []);
    if (s.totals.revives > 0) push('revive', []);
    if (E.independenceOf(s) >= 0.5) push('isru', ['moxie', 'water98']);
    if (!lost) push('margin', ['dra5']);
    if (out.length < 2) push('radiation', ['hassler', 'ochmo']);
    return out.slice(0, 4);
  }

  function viewDebrief() {
    const s = mission();
    if (!s) return viewTitle();
    const sc = E.scoreMission(s);
    const success = s.status === 'success';
    const alive = s.crew.filter(c => c.status !== 'dead').length;
    const earned = E.achievements(s);
    const charts = h('div', { class: 'charts' });
    const H = s.history;
    const pts = key => H.map(x => [x.sol, x[key]]);
    C.lineChart(charts, {
      title: t('ch.stocks'), unit: 'kg', xLabel: t('ch.sol'), fmt: v => nf(v), tableLabel: t('ch.stocks'),
      series: [
        { name: t('hud.o2'), color: STOCK_COLORS.o2, points: pts('o2') },
        { name: t('hud.water'), color: STOCK_COLORS.water, points: pts('water') },
        { name: t('hud.food'), color: STOCK_COLORS.food, points: pts('food') },
      ],
    });
    C.lineChart(charts, {
      title: t('ch.dose'), unit: 'mSv', xLabel: t('ch.sol'), fmt: v => nf(v), tableLabel: t('ch.dose'),
      refLines: [{ y: D.DOSE_LIMIT, label: t('ch.limit') }],
      series: s.crew.map((c, i) => ({ name: crewName(c.id), color: CHART_ROLE[c.role], points: H.map(x => [x.sol, x.doses[i]]) })),
    });
    C.lineChart(charts, {
      title: t('ch.power'), unit: 'kW', xLabel: t('ch.sol'), fmt: v => nf(v, 1), tableLabel: t('ch.power'),
      series: [
        { name: t('ch.supply'), color: '#3987e5', points: H.filter(x => x.supply != null).map(x => [x.sol - D.TURN_SOLS, x.supply]) },
        { name: t('ch.load'), color: '#d95926', points: H.filter(x => x.load != null).map(x => [x.sol - D.TURN_SOLS, x.load]) },
      ],
    });
    const chartHead = h('div', null);
    chartHead.appendChild(h('h3', { class: 'eyebrow', style: 'margin-bottom:8px' }, t('ch.stocks') + ' · ' + t('ch.dose') + ' · ' + t('ch.power')));

    const scoreRows = ['science', 'health', 'radiation', 'crew', 'independence', 'depot', 'completion'];
    return [
      topbar(lanOn() ? lanChip() : null),
      h('section', { class: 'deb-hero' + (success ? '' : ' lost') },
        h('div', null,
          h('span', { class: 'eyebrow' }, t('deb.code') + ' · ' + s.seed + ' · ' + t('diff.' + s.difficulty)),
          h('h1', null, success ? t('deb.success') : t('deb.lost', { sol: s.endCause ? s.endCause.sol : s.sol })),
          h('p', null, success ? t('deb.successBody', { n: alive, m: s.crew.length }) : t('cause.' + ((s.endCause && s.endCause.reason) || 'health')))),
        h('div', { class: 'grade', 'aria-label': t('deb.grade') + ' ' + sc.grade }, sc.grade, h('small', null, nf(sc.total)))),
      panel(t('deb.crew'), h('div', { class: 'deb-crew' }, s.crew.map((c, i) => h('div', { class: 'c' },
        h('div', { html: A.portrait(c.role, 44, { variant: i, status: c.status }) }),
        h('div', null, h('b', null, crewName(c.id)), h('br'),
          h('span', { class: c.status === 'dead' ? 'crit' : 'muted' }, c.status === 'dead' ? t('crew.dead') : nf(c.health) + ' HP'),
          h('span', { class: 'faint' }, ' · ' + nf(c.dose) + ' mSv')))))),
      h('div', { class: 'deb-grid' },
        h('div', { class: 'col' },
          panel(t('deb.score'), h('table', { class: 'score-table' },
            h('tbody', null,
              scoreRows.map(k => h('tr', null, h('td', null, t('sc.' + k)), h('td', null, signed(sc.parts[k])))),
              h('tr', { class: 'total' }, h('td', null, t('sc.total')), h('td', null, nf(sc.total)))))),
          panel(t('deb.lessons'), h('div', { class: 'lessons' }, lessonsFor(s).map(([k, src]) => h('article', { class: 'lesson' },
            h('h3', null, t('lesson.' + k + '.title')),
            h('p', null, t('lesson.' + k + '.body')),
            src.map(id => h('a', { href: I.SOURCES[id].url, target: '_blank', rel: 'noopener' }, I.SOURCES[id].label)))))),
          panel(t('deb.badges'), h('div', { class: 'badges' }, earned.length
            ? earned.map(b => badgeCard(b, true, store.newBadges.includes(b)))
            : h('p', { class: 'hint' }, t('ach.locked'))))),
        h('div', { class: 'col' }, panel(t('deb.charts'), charts))),
      panel(t('deb.log'), h('div', { class: 'tablewrap' }, logTable(s))),
      h('div', { class: 'deb-actions' },
        isHost() ? h('button', { class: 'btn btn-primary btn-lg', type: 'button', 'data-k': 'again', onclick: flyAgain }, ico('refresh', 18), t('deb.again')) : null,
        isHost() ? h('button', { class: 'btn btn-lg', type: 'button', 'data-k': 'new', onclick: newMission }, t('deb.new')) : null,
        h('button', { class: 'btn btn-lg btn-ghost', type: 'button', 'data-k': 'copy', onclick: () => copyText(s.seed) }, ico('copy', 18), t('common.copy') + ' · ' + s.seed)),
    ];
  }

  // Weather is its own column entry; breakdowns and injuries are listed as outcomes of the round before.
  const LOG_SKIP = ['landing', 'breakdown', 'injury', 'dust_regional', 'dust_global', 'supply_arrived'];

  function logTable(s) {
    const evName = type => (I.has(store.lang, 'ev.' + type + '.title') ? t('ev.' + type + '.title', { module: '', name: '' }).replace(/\s+/g, ' ').trim() : type);
    return h('table', { class: 'log' },
      h('thead', null, h('tr', null, h('th', null, 'Sol'), h('th', null, t('deb.events')), h('th', null, t('deb.outcome')))),
      h('tbody', null, s.log.map(l => {
        const bits = [];
        if (l.repairs.length) bits.push(t('rep.repaired', { list: l.repairs.map(x => t('mod.' + x)).join(', ') }));
        if (l.breakdowns.length) bits.push(t('rep.broke', { list: l.breakdowns.map(x => t('mod.' + x)).join(', ') }));
        if (l.completed.length) bits.push(t('rep.completed', { list: l.completed.map(x => t('mod.' + x)).join(', ') }));
        for (const id of l.downs) bits.push(t('rep.down', { name: crewName(id) }));
        for (const id of l.deaths) bits.push(t('rep.dead', { name: crewName(id) }));
        for (const id of l.revived) bits.push(t('rep.revived', { name: crewName(id) }));
        if (l.requested) bits.push(t('rep.requested', { kind: t('earth.' + l.requested) }));
        if (l.habShort) bits.push(t('w.hab_cold'));
        bits.push(t('rep.science', { n: nf(l.science) }));
        return h('tr', null,
          h('td', null, l.sol + '–' + (l.sol + D.TURN_SOLS)),
          h('td', null, [t('weather.' + l.weather)].concat(l.events.filter(e => !LOG_SKIP.includes(e)).map(evName)).join(' · ')),
          h('td', null, bits.join(' · ')));
      })));
  }

  function badgeCard(id, unlocked, fresh) {
    return h('div', { class: 'badge' + (unlocked ? '' : ' locked') + (fresh ? ' new' : '') },
      h('span', { html: A.icon(unlocked ? 'trophy' : 'lock', 28), style: 'color:' + (unlocked ? 'var(--dust)' : 'var(--fg-3)') }),
      h('div', null, h('b', null, t('ach.' + id + '.name')), h('span', null, t('ach.' + id + '.desc'))));
  }

  // ---------- LAN lobby ----------
  function lanChip() {
    const room = store.room;
    const status = store.lanStatus === 'error' ? h('span', { class: 'chip crit pulse' }, t('lan.lost')) : null;
    return [h('span', { class: 'chip info' }, ico('wifi', 12), ' ', room.code), status];
  }

  function viewLobby() {
    const room = store.room;
    const host = isHost();
    const mine = me();
    const size = room.settings.crewSize;
    const crew = D.CREW.slice(0, size);
    const diffOpts = Object.keys(D.DIFFICULTY).map(k => ({ value: k, label: t('diff.' + k) }));
    return [
      topbar(lanChip()),
      h('div', { class: 'lobby' },
        h('div', { class: 'col' },
          panel(t('lan.title'), [
            h('span', { class: 'eyebrow' }, t('lan.room')),
            h('div', { class: 'roomcode' }, room.code),
            h('p', { class: 'hint' }, t('lan.share')),
            (store.lanInfo && store.lanInfo.addresses || []).map(a => h('div', { class: 'addr' }, a)),
            h('div', { class: 'field' },
              h('label', { for: 'lan-name' }, t('lan.name')),
              h('input', {
                id: 'lan-name', class: 'input', maxlength: 24, value: mine ? mine.name : '',
                onchange: e => N.act('rename', { name: e.target.value }),
              })),
            h('span', { class: 'eyebrow' }, t('lan.players')),
            h('div', { class: 'players' }, room.players.map(pl => h('span', { class: 'chip ' + (pl.connected ? 'ok' : '') },
              pl.name, pl.id === room.hostId ? ' · ' + t('lan.hostTag') : ''))),
          ]),
          host ? panel(t('title.start'), [
            h('div', { class: 'setup-row' }, h('span', { class: 'eyebrow' }, t('title.difficulty')),
              seg('ldiff', diffOpts, room.settings.difficulty, v => N.act('settings', { difficulty: v })),
              h('p', { class: 'hint' }, t('diff.' + room.settings.difficulty + '.hint'))),
            h('div', { class: 'setup-row' }, h('span', { class: 'eyebrow' }, t('title.crew')),
              seg('lcrew', [{ value: 4, label: t('crew.four') }, { value: 5, label: t('crew.five') }], size, v => N.act('settings', { crewSize: v }))),
            h('div', { class: 'setup-row' }, h('label', { class: 'eyebrow', for: 'lan-code' }, t('title.code')),
              h('input', { id: 'lan-code', class: 'input num', maxlength: 24, value: room.settings.seed, onchange: e => N.act('settings', { seed: e.target.value.toUpperCase() }) })),
            h('button', { class: 'btn btn-primary btn-lg', type: 'button', 'data-k': 'pack', onclick: () => N.act('phase', { phase: 'manifest' }) }, ico('rocket', 18), t('man.title')),
          ]) : panel(t('title.start'), h('p', { class: 'muted' }, t('lan.waiting')))),
        panel(t('lan.pick'), h('div', { class: 'slots' }, crew.map((c, i) => {
          const owner = room.players.find(pl => pl.crewId === c.id);
          const mineSlot = mine && mine.crewId === c.id;
          return h('div', { class: 'slot' + (mineSlot ? ' mine' : '') },
            h('div', { html: A.portrait(c.role, 48, { variant: i }) }),
            h('div', null, h('b', null, t('role.' + c.role)), h('br'),
              h('span', { class: 'hint' }, owner ? t('lan.taken', { name: owner.name }) : t('lan.free')), h('br'),
              h('span', { class: 'faint', style: 'font-size:var(--fs-xs)' }, t('role.' + c.role + '.skill'))),
            mineSlot
              ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => N.act('claim', { crewId: null }) }, t('lan.leave'))
              : h('button', { class: 'btn btn-sm btn-primary', type: 'button', disabled: !!owner, onclick: () => N.act('claim', { crewId: c.id }) }, t('lan.take')));
        })))),
      h('div', { class: 'deb-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: leaveRoom }, t('lan.leave'))),
    ];
  }

  function leaveRoom() {
    N.act('leave');
    N.disconnect();
    N.clear();
    store.lan = null;
    store.room = null;
    go('title');
  }

  function onRoom(room) {
    const prevTurn = store.lastTurnSeen;
    store.room = room;
    if (room.mission) {
      if (prevTurn != null && room.mission.turn > prevTurn && room.lastReport) {
        store.report = room.lastReport;
        checkBadges(room.mission);
        store.modal = 'report';
        store.buildType = null;
      }
      store.lastTurnSeen = room.mission.turn;
    } else {
      store.lastTurnSeen = null;
    }
    render();
  }

  function onLanStatus(status) {
    if (status === 'gone') { store.lan = null; store.room = null; store.lanStatus = null; go('title'); return; }
    store.lanStatus = status;
    render();
  }

  async function hostRoom(name) {
    const r = await N.create(name);
    if (r.error) { store.lanError = t('lan.' + r.error) || r.error; render(); return; }
    store.lan = N.session();
    store.modal = null;
    N.connect(onRoom, onLanStatus, onPos);
  }

  async function joinRoom(code, name) {
    const r = await N.join(code, name);
    if (r.error) { store.lanError = I.has(store.lang, 'lan.' + r.error) ? t('lan.' + r.error) : r.error; render(); return; }
    store.lan = N.session();
    store.modal = null;
    N.connect(onRoom, onLanStatus, onPos);
  }

  function onPos(list) {
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.setRemote(list);
  }

  // ---------- dialogs ----------
  function modal(title, body, foot, wide, onClose) {
    const close = onClose || (() => { store.modal = null; render(); });
    return h('div', { class: 'modal-back', onclick: e => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? 'width:min(860px,100%)' : '' },
        h('div', { class: 'modal-h' }, h('h2', null, title),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-k': 'modal-close', 'aria-label': t('common.close'), onclick: close }, ico('close'))),
        h('div', { class: 'modal-b' }, body),
        foot ? h('div', { class: 'modal-f' }, foot) : null));
  }

  function renderModal() {
    const m = store.modal;
    if (m === 'help') {
      return modal(t('help.title'), h('ol', { class: 'replist', style: 'list-style:decimal;padding-left:20px' },
        [1, 2, 3, 4, 5, 6, 7, 8].map(i => h('li', { style: 'display:list-item' }, t('help.' + i)))));
    }
    if (m === 'notes') {
      return modal(t('notes.title'), [
        h('p', { class: 'muted' }, t('notes.lead')),
        h('div', { class: 'notes-list' }, I.NOTES[store.lang].map(n => h('article', { class: 'note' },
          h('h3', null, n.title), h('p', null, n.body),
          n.src.length ? h('div', { class: 'src' }, n.src.map(id => h('a', { href: I.SOURCES[id].url, target: '_blank', rel: 'noopener' }, I.SOURCES[id].label))) : null))),
      ], null, true);
    }
    if (m === 'badges') {
      return modal(t('ach.title'), [
        h('p', { class: 'muted' }, t('ach.progress', { n: store.badges.size, m: D.ACHIEVEMENTS.length })),
        h('div', { class: 'badges' }, D.ACHIEVEMENTS.map(id => badgeCard(id, store.badges.has(id), false))),
      ], null, true);
    }
    if (m === 'confirm') {
      return modal(t('nav.quit'), h('p', null, t('common.confirmQuit')), [
        h('button', { class: 'btn', type: 'button', onclick: () => { store.modal = null; render(); } }, t('common.cancel')),
        h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'confirm-yes', onclick: () => { store.modal = null; go('title'); } }, t('common.yes')),
      ]);
    }
    if (m === 'lan') {
      let nameVal = '';
      let codeVal = '';
      return modal(t('lan.title'), [
        h('p', { class: 'muted' }, t('title.lanHint')),
        h('div', { class: 'field' }, h('label', { for: 'lan-me' }, t('lan.name')),
          h('input', { id: 'lan-me', class: 'input', maxlength: 24, oninput: e => { nameVal = e.target.value; } })),
        h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'lan-host', onclick: () => hostRoom(nameVal || 'Host') }, ico('users', 16), t('lan.host')),
        h('div', { class: 'divider' }),
        h('div', { class: 'field' }, h('label', { for: 'lan-join' }, t('lan.room')),
          h('input', { id: 'lan-join', class: 'input num', maxlength: 6, autocomplete: 'off', oninput: e => { codeVal = e.target.value; } })),
        h('button', { class: 'btn', type: 'button', 'data-k': 'lan-joinbtn', onclick: () => joinRoom(codeVal, nameVal || 'Crew') }, t('lan.join')),
        store.lanError ? h('p', { class: 'crit' }, store.lanError) : null,
      ]);
    }
    if (m === 'report' && store.report) return reportModal(store.report);
    return null;
  }

  function reportModal(r) {
    const s = mission();
    const items = [];
    const li = (iconName, cls, text) => items.push(h('li', { class: cls }, ico(iconName, 16), h('span', { style: 'color:var(--fg)' }, text)));
    if (r.repairs.length) li('spares', 'ok', t('rep.repaired', { list: r.repairs.map(x => t('mod.' + x)).join(', ') }));
    if (r.completed.length) li('construction', 'ok', t('rep.completed', { list: r.completed.map(x => t('mod.' + x)).join(', ') }));
    if (r.started.length) li('construction', 'muted', t('rep.started', { list: r.started.map(x => t('mod.' + x)).join(', ') }));
    if (r.scrapped && r.scrapped.length) li('scrap', 'muted', t('rep.scrapped', { list: r.scrapped.map(x => t('mod.' + x)).join(', ') }));
    for (const id of r.revived) li('medical', 'ok', t('rep.revived', { name: crewName(id) }));
    if (r.breakdowns.length) li('warn', 'warn', t('rep.broke', { list: r.breakdowns.map(x => t('mod.' + x)).join(', ') }));
    for (const id of r.injuries) li('warn', 'warn', t('rep.injury', { name: crewName(id) }));
    for (const id of r.downs) li('crit', 'crit', t('rep.down', { name: crewName(id) }));
    for (const id of r.deaths) li('crit', 'crit', t('rep.dead', { name: crewName(id) }));
    if (r.requested) li('rocket', 'muted', t('rep.requested', { kind: t('earth.' + r.requested) }));
    if (r.hypoxia > 0) li('crit', 'crit', t('w.o2_out'));
    if (r.dehydration > 0) li('crit', 'crit', t('w.water_out'));
    if (r.power.habShort) li('crit', 'crit', t('w.hab_cold'));
    li('science', 'ok', t('rep.science', { n: nf(r.science) }));
    if (items.length === 1) li('ok', 'ok', t('rep.quiet'));
    const ended = s && s.status !== 'active';
    const closeTo = () => {
      store.modal = null;
      if (!ended) store.newBadges = [];
      if (ended && !lanOn()) go('debrief'); else render();
    };
    return modal(t('rep.title', { sol: r.sol + D.TURN_SOLS }), [
      h('ul', { class: 'replist' }, items),
      store.newBadges.length ? h('div', null, h('span', { class: 'eyebrow' }, t('rep.newBadge')),
        h('div', { class: 'badges', style: 'margin-top:8px' }, store.newBadges.map(b => badgeCard(b, true, true)))) : null,
    ], [h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'rep-next', onclick: closeTo }, ended ? t('deb.charts') : t('rep.next'))], false, closeTo);
  }

  // ---------- render ----------
  function screenName() {
    if (lanOn()) {
      const ph = store.room.phase;
      if (ph === 'lobby') return 'lobby';
      if (ph === 'manifest') return 'manifest';
      if (ph === 'ops') return 'ops';
      if (ph === 'debrief') return (store.modal === 'report') ? 'ops' : 'debrief';
    }
    if (store.screen === 'ops' && store.mission && store.mission.status !== 'active' && store.modal !== 'report') return 'debrief';
    return store.screen;
  }

  function render() {
    const active = document.activeElement;
    const focusKey = active && active.getAttribute ? active.getAttribute('data-k') : null;
    const focusId = active && active.id && active.tagName === 'INPUT' ? active.id : null;
    const name = screenName();
    let view;
    if (name === 'manifest') view = viewManifest();
    else if (name === 'ops') view = mission() && mission().status === 'active' ? viewOps() : viewDebrief();
    else if (name === 'debrief') view = viewDebrief();
    else if (name === 'lobby') view = viewLobby();
    else view = viewTitle();
    const root = h('main', { class: store.prevScreen !== name ? 'screen-in' : '' }, view);
    const nodes = [root];
    const m = store.modal ? renderModal() : null;
    if (m) nodes.push(m);
    if (store.toast) nodes.push(h('div', { class: 'toast', role: 'status' }, store.toast));
    app.replaceChildren(...nodes);
    store.prevScreen = name;
    document.documentElement.lang = store.lang;
    if (focusKey) {
      const n = app.querySelector('[data-k="' + focusKey.replace(/"/g, '\\"') + '"]');
      if (n && !n.disabled) n.focus({ preventScroll: true });
    } else if (focusId) {
      const n = document.getElementById(focusId);
      if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) { /* ignore */ } }
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && store.modal) {
      store.modal = null;
      render();
    }
  });

  // ---------- installable app ----------
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; render(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast(t('app.installed')); });
  function installButton() {
    if (!installEvt) return null;
    return h('button', {
      class: 'btn', type: 'button', 'data-k': 'install', title: t('app.installHint'),
      onclick: async () => { const e = installEvt; installEvt = null; e.prompt(); try { await e.userChoice; } catch (err) { /* dismissed */ } render(); },
    }, ico('plus', 16), t('app.install'));
  }
  function registerServiceWorker() {
    if (!window.SOL_APP || !('serviceWorker' in navigator)) return;
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (location.protocol !== 'https:' && !local) return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }

  // ---------- boot ----------
  function boot() {
    registerServiceWorker();
    render();
    if (N) {
      N.info().then(info => {
        if (!info) return;
        store.lanInfo = info;
        const s = N.restore();
        if (s) { store.lan = s; N.connect(onRoom, onLanStatus, onPos); }
        render();
      });
    }
  }

  window.SolUI = { store, render };
  boot();
})();
