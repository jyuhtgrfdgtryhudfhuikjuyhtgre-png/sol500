/*
 * SOL 500 — the interface: title, payload manifest, operations, debrief, LAN lobby and dialogs.
 * Renders the whole screen from state on every change; the engine does all the simulation.
 * localStorage keys (per browser): sol500.lang, sol500.settings, sol500.names, sol500.badges, sol500.save, sol500.saveQuick.
 */
(function () {
  'use strict';
  const D = window.SolData, E = window.SolEngine, SV = window.SolSaves, I = window.SolI18n, A = window.SolArt, C = window.SolCharts, N = window.SolNet, W = window.SolWorldgen, F = window.SolFog, X = window.SolExpedition, Z = window.SolDangers, G = window.SolGoals, SH = window.SolShowcase;
  const app = document.getElementById('app');

  // ---------- storage (every access guarded: private windows and previews can throw) ----------
  const LS = {
    get(k, d) {
      try { const v = localStorage.getItem('sol500.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    // A Showcase demo writes nothing of the game's: only the language and the Display settings (the presenter's own choices) reach the disk.
    set(k, v) { if (store.demo && !DEMO_KEYS.includes(k)) return; try { localStorage.setItem('sol500.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { if (store.demo && !DEMO_KEYS.includes(k)) return; try { localStorage.removeItem('sol500.' + k); } catch (e) { /* ignore */ } },
  };
  const DEMO_KEYS = ['lang', 'settings'];

  const seenList = k => { const rs = LS.get(k, null); return rs && typeof rs.key === 'string' && Array.isArray(rs.list) ? rs : { key: '', list: [] }; };

  // ---------- state ----------
  const store = {
    lang: LS.get('lang', /^vi/i.test(navigator.language || '') ? 'vi' : 'en'),
    screen: 'title',
    settings: Object.assign({ difficulty: D.DEFAULT_DIFFICULTY, crewSize: D.DEFAULT_CREW, training: false, length: 'full', gfx: 'best', fpsCap: 0, showFps: false }, LS.get('settings', {})),
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
    demo: null,           // the Showcase's demo game: null, or { id } of the card being shown
    lanInfo: null,
    lan: null,
    room: null,
    lanStatus: null,
    lanError: null,
    lanForm: { name: '', code: '', addr: '' }, // the "Play together" dialog's fields, kept across re-renders
    online: null,
    lastTurnSeen: null,
    toast: null,
    prevScreen: null,
    opsView: LS.get('opsView', 'surface'),
    regionsSeen: seenList('regionsSeen'), // the Full mission's seen-once list; the Quick slot keeps its own in regionsSeenQuick
    regionsSeenQuick: seenList('regionsSeenQuick'),
    card: null,           // the card over the surface (a region's fact, a point of interest's): see setCard
    fog: {},
    launchSeen: null, // co-op: the launch number of the mission this tab last showed (see SolFog.isNewLaunch)
  };
  // The Display settings (graphics level, FPS limit 0 = Max, readout) stay on this device. A stored value outside its set reads as the default.
  Object.assign(store.settings, { length: store.settings.length === 'quick' ? 'quick' : 'full', gfx: store.settings.gfx === 'fast' ? 'fast' : 'best', fpsCap: [30, 60].includes(store.settings.fpsCap) ? store.settings.fpsCap : 0, showFps: store.settings.showFps === true });
  // A save from before v3 gets the exploring state; its pilot is the astronaut that player last walked as.
  // A save that can't be read (damaged, or edited by hand) is dropped from its own slot, so the app still opens on its home screen.
  // The Full slot opens first; the Quick one is the one resumed when there is no Full mission.
  const loadSlot = key => {
    const r = SV.load(LS, key, m => E.upgradeMission(m, { controlId: LS.get('controlId', null) }), E.defaultPlan);
    return r && { mission: r.mission, plan: r.plan };
  };
  const bootSave = loadSlot('save') || loadSlot('saveQuick');
  if (bootSave) { store.mission = bootSave.mission; store.plan = bootSave.plan; }
  LS.del('controlId'); // replaced by mission.pilot

  // ---------- helpers ----------
  const t = (k, p) => I.t(store.lang, k, p);
  // A source link in the language of the moment (the sources table is I.SOURCES; the label has a Vietnamese form).
  const srcA = src => h('a', { href: src.url, target: '_blank', rel: 'noopener' }, I.srcLabel(store.lang, Object.keys(I.SOURCES).find(k => I.SOURCES[k] === src)));
  const locale = () => (store.lang === 'vi' ? 'vi-VN' : 'en-US');
  const nf = (n, d) => new Intl.NumberFormat(locale(), { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }).format(n);
  const signed = (n, d) => (n > 0.0001 ? '+' : n < -0.0001 ? '−' : '±') + nf(Math.abs(n), d);
  const tilesText = n => { const v = nf(n); return v + ' ' + t(v === '1' ? 'eva.tiles1' : 'eva.tiles'); }; // "1 tile", "2 tiles"
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

  function seg(key, options, value, onPick, disabled, label) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': label || null }, options.map(o =>
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

  // The admin panel: the same window in the app (its navigation guard allows this origin), a new tab in a browser.
  function openAdmin() {
    if (window.solApp) location.href = '/admin';
    else window.open('/admin', '_blank', 'noopener');
  }

  // ---------- LAN helpers ----------
  const lanOn = () => !!(store.lan && store.room);
  const me = () => (lanOn() ? store.room.players.find(p => p.id === store.lan.playerId) : null);
  const isHost = () => !lanOn() || store.room.hostId === store.lan.playerId;
  // Fog waiting to go to the server: kept until the socket takes it, sent 64 chunks per message.
  let fogOut = {}, fogSent = []; // fogSent: [{ at, part }], what went out lately, in case the socket was half open
  function flushFog() {
    const keys = Object.keys(fogOut);
    for (let i = 0; i < keys.length; i += 64) {
      const part = {};
      for (const k of keys.slice(i, i + 64)) part[k] = fogOut[k];
      if (!N.sendReveal(part)) return;
      fogSent.push({ at: Date.now(), part });
      for (const k of Object.keys(part)) delete fogOut[k];
    }
  }
  // A new mission or room starts with a fresh map: this tab's fog, the fog still waiting to be sent, and the surface's world.
  function forgetFog() {
    store.fog = {};
    fogOut = {};
    fogSent = [];
    store.launchSeen = null;
    setCard(null); // and the old mission's card
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.reset();
  }
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
    if (lanOn() || store.demo) return;
    if (!store.mission) return;
    if (store.mission.status === 'active') LS.set(SV.slotOf(store.mission), { mission: store.mission, plan: store.plan });
    else LS.del(SV.slotOf(store.mission));
  }
  function saveSettings() { LS.set('settings', store.settings); }

  // Exploring changes the mission every second, so its save is written at most every few seconds (and on leaving).
  let saveTimer = null;
  function saveSoloSoon() {
    if (saveTimer || store.demo) return;
    saveTimer = setTimeout(() => { saveTimer = null; saveSolo(); }, 4000);
  }
  // Phones and installed apps often skip pagehide when the OS kills a backgrounded page, so a hidden page flushes too.
  function flushSolo() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveSolo(); } }
  window.addEventListener('pagehide', flushSolo);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSolo(); });

  // ---------- actions ----------
  function go(screen) {
    if (store.demo && screen === 'title') { leaveDemo(); return; }
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

  const isQuick = () => !lanOn() && store.settings.length === 'quick';

  // Resume a slot from the title. The mission on screen is already saved, so leaving it for the other slot loses nothing.
  function resumeSlot(key) {
    flushSolo();
    if (!(store.mission && store.mission.status === 'active' && SV.slotOf(store.mission) === key)) {
      const r = loadSlot(key);
      if (!r) { toast(t('title.resumeDamaged')); return; } // the slot was damaged and is dropped; the title redraws without it
      unseeUnread(); // a region card closed unread is not marked seen
      setCard(null); clearTimeout(holdTimer); holdTimer = null; held = []; // the other mission's card does not stay up over this one
      store.mission = r.mission;
      store.plan = r.plan;
      store.report = null;
      store.advice = null;
      if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.reset();
    }
    go('ops');
  }

  function startManifest(training) {
    store.settings.training = !!training;
    saveSettings();
    if (!store.loadout) store.loadout = E.referenceKit(store.settings.difficulty, store.settings.crewSize, isQuick());
    go('manifest');
  }

  function launch() {
    if (lanOn()) { N.act('launch'); return; }
    go('pilot');
  }

  // Solo: the mission starts once you choose the astronaut you will walk as.
  function startMission(pilot) {
    const s = E.createMission({
      seed: (store.seed || '').trim() || E.newMissionCode(), loadout: store.loadout, difficulty: store.settings.difficulty,
      crewSize: store.settings.crewSize, events: !store.settings.training, names: store.names, pilot, quick: isQuick(),
    });
    G.pick(s); // round 1's goals; each advance picks the next round's
    held = [];
    setCard(null); // the last mission's card ("Fly again" reuses the code)
    store.mission = s;
    store.plan = E.defaultPlan(s);
    store.report = null;
    store.advice = null;
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.reset(); // "Fly again" reuses the code
    saveSolo();
    go('ops');
  }

  function pilotText(p) {
    if (!p.to) return t('pilot.none');
    const c = D.CREW.find(x => x.id === p.to);
    return t('pilot.takeover', { name: crewName(p.to), role: t('role.' + c.role) });
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
    if (store.demo) return;
    const got = E.achievements(state);
    const fresh = got.filter(b => !store.badges.has(b));
    fresh.forEach(b => store.badges.add(b));
    if (fresh.length) LS.set('badges', [...store.badges]);
    store.newBadges = fresh;
  }

  function advance() {
    if (lanOn()) return;
    const { state, report } = G.advance(store.mission, store.plan); // the round's goals judged here, as the server does (R3, R4)
    store.mission = state;
    store.plan = E.nextPlan(state, store.plan);
    store.report = report;
    store.buildType = null;
    store.advice = null;
    checkBadges(state);
    // Served by a SOL 500 server (not the offline file): the host's admin panel records the finished mission.
    if (state.status !== 'active' && store.lanInfo && N && !store.demo) N.recordSolo(state, store.lanForm.name || '');
    store.modal = 'report';
    saveSolo();
    render();
    if (report.pilot && report.pilot.to) toast(pilotText(report.pilot));
  }

  function askAdvice() {
    const s = mission();
    if (lanOn()) { N.act('advice'); return; }
    store.advice = { turn: s.turn, items: E.advise(s, store.plan) };
    render();
  }

  function flyAgain() {
    if (store.demo) { leaveDemo(); return; }
    const s = mission();
    if (lanOn()) { N.act('restart'); return; }
    store.seed = s.seed;
    store.settings.difficulty = s.difficulty;
    store.settings.crewSize = s.crewSize;
    store.settings.training = !s.eventsOn;
    store.settings.length = s.quick ? 'quick' : 'full';
    store.loadout = Object.assign({}, s.loadout);
    LS.del(SV.slotOf(s)); // the finished mission's own slot only; saveSolo no longer deletes once the mission is gone
    store.mission = null;
    store.plan = null;
    go('manifest');
  }

  function newMission() {
    if (store.demo) { leaveDemo(); return; }
    if (lanOn()) { N.act('restart'); return; }
    if (store.mission) LS.del(SV.slotOf(store.mission));
    store.mission = null;
    store.plan = null;
    store.seed = E.newMissionCode();
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
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { store.modal = 'display'; render(); } }, ico('gear'), t('nav.display')),
        langSeg()));
  }

  // ---------- title ----------
  function viewTitle() {
    const st = store.settings;
    const diffOpts = Object.keys(D.DIFFICULTY).map(k => ({ value: k, label: t('diff.' + k) }));
    const slots = lanOn() ? { save: null, saveQuick: null } : SV.summary(LS);
    const resume = ['save', 'saveQuick'].filter(k => slots[k]).map(k => h('button', {
      class: 'btn btn-lg', type: 'button', 'data-k': 'resume:' + k, onclick: () => resumeSlot(k),
    }, t(k === 'saveQuick' ? 'title.resumeQuick' : 'title.resume', { sol: slots[k].sol })));
    return [
      topbar(),
      h('section', { class: 'title-hero' },
        svgNode(A.landscape()),
        h('div', { class: 'hero-copy' },
          h('h1', { class: 'wordmark', 'aria-label': 'SOL 500' }, h('span', { class: 'sol' }, 'SOL'), h('span', { class: 'five' }, '500')),
          h('p', { class: 'hero-sub' }, t('app.sub')),
          h('p', { class: 'hero-tag' }, t('app.tagline')),
          h('button', { class: 'btn btn-primary hero-story', type: 'button', 'data-k': 'story', onclick: () => { store.modal = 'story'; store.storyPage = 0; render(); } },
            ico('rocket', 18), t('story.open')),
          h('button', { class: 'btn hero-story', type: 'button', 'data-k': 'guide', onclick: () => { store.modal = 'guide'; render(); } }, ico('science', 18), t('guide.open')))),
      h('div', { class: 'title-grid' },
        panel(t('title.start'), h('div', { class: 'setup' },
          h('div', { class: 'setup-row' },
            h('span', { class: 'label eyebrow' }, t('title.difficulty')),
            seg('diff', diffOpts, st.difficulty, v => { st.difficulty = v; store.loadout = null; saveSettings(); render(); }),
            h('p', { class: 'hint' }, t('diff.' + st.difficulty + '.hint'))),
          h('div', { class: 'setup-row' },
            h('span', { class: 'label eyebrow' }, t('title.length')),
            seg('length', [{ value: 'full', label: t('length.full') }, { value: 'quick', label: t('length.quick') }], st.length,
              v => { st.length = v; store.loadout = null; saveSettings(); render(); }),
            h('p', { class: 'hint' }, t(st.length === 'quick' ? 'length.quickHint' : 'length.fullHint'))),
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
            h('button', { class: 'btn btn-lg', type: 'button', 'data-k': 'train', onclick: () => startManifest(true), title: t('title.trainingHint'), disabled: st.length === 'quick' }, t('title.training')),
            resume,
            installButton()),
          h('p', { class: 'hint' }, t('title.trainingHint')),
          h('div', { class: 'divider' }),
          store.lanInfo
            ? h('div', { class: 'setup-row' },
              h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
                window.solApp
                  ? [
                    h('button', { class: 'btn', type: 'button', 'data-k': 'host-game', onclick: () => { store.modal = 'lan'; render(); } }, ico('users'), t('title.host')),
                    h('button', {
                      class: 'btn', type: 'button', 'data-k': 'join-game',
                      onclick: () => { store.modal = 'lan'; render(); const el = document.getElementById('lan-hostaddr'); if (el) el.focus(); },
                    }, ico('wifi'), t('title.join')),
                  ]
                  : h('button', { class: 'btn', type: 'button', 'data-k': 'lan', onclick: () => { store.modal = 'lan'; render(); } }, ico('wifi'), t('title.lan')),
                store.lanInfo.adminHere ? h('button', { class: 'btn', type: 'button', 'data-k': 'admin', onclick: openAdmin }, ico('lock'), t('title.admin')) : null),
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
    if (lanOn()) return { difficulty: store.room.settings.difficulty, crewSize: store.room.settings.crewSize, quick: false };
    return { difficulty: store.settings.difficulty, crewSize: store.settings.crewSize, quick: isQuick() };
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
    const { difficulty, crewSize, quick } = manifestSettings();
    const L = currentLoadout();
    const sum = E.summarizeLoadout(L, difficulty, crewSize, quick);
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
          h('button', { type: 'button', 'data-k': 'dec:' + id, 'aria-label': '−1 ' + t('item.' + id + '.name'), disabled: !editable || n <= (id === 'rover' && isQuick() ? 1 : 0), onclick: () => change(-1) }, '−'),
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
          return h('li', { class: crit ? 'crit' : 'warn' }, ico(crit ? 'crit' : 'warn', 16), h('span', { style: 'color:var(--fg)' }, t('mwarn.' + w, { end: sum.mission })));
        }))
        : h('p', { class: 'ok' }, ico('ok', 16), ' ', t('rev.clear')),
      h('div', { class: 'setup-actions' },
        h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'ref', disabled: !editable, onclick: () => { const ms = manifestSettings(); setLoadout(E.referenceKit(ms.difficulty, ms.crewSize, ms.quick)); } }, t('man.reference')),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'data-k': 'empty', disabled: !editable, onclick: () => setLoadout(E.normalizeLoadout(isQuick() ? { rover: 1 } : {})) }, t('man.clear'))),
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

  // ---------- choose your astronaut ----------
  function viewPilot() {
    if (!store.loadout) return viewTitle();
    const crew = D.CREW.slice(0, store.settings.crewSize);
    return [
      topbar(),
      h('section', { class: 'pilot' },
        h('span', { class: 'eyebrow' }, t('pilot.step') + ' · ' + t('diff.' + store.settings.difficulty)),
        h('h1', { style: 'font-size:var(--fs-2xl)' }, t('pilot.title')),
        h('p', { class: 'muted', style: 'max-width:70ch' }, t('pilot.lead')),
        // The source is a link, so it sits beside the picking button, not inside it (a link in a button is invalid).
        h('div', { class: 'pilot-grid' }, crew.map((c, i) => h('div', { class: 'pilot-card' },
          h('button', { type: 'button', class: 'pilot-pick', 'data-k': 'pilot:' + c.id, onclick: () => startMission(c.id) },
            h('span', { html: A.portrait(c.role, 72, { variant: i }) }),
            h('b', null, crewName(c.id)),
            h('span', { class: 'role-tag', style: 'color:' + A.ROLE[c.role] }, t('role.' + c.role)),
            h('span', { class: 'hint' }, t('role.' + c.role + '.skill')),
            c.role === 'commander' ? h('span', { class: 'hint' }, t('role.commander.seat')) : null,
            h('span', { class: 'hint role-fact' }, t('role.' + c.role + '.fact')),
            h('span', { class: 'btn btn-primary btn-sm' }, t('pilot.pick', { name: crewName(c.id) }))),
          h('p', { class: 'src' }, srcA(I.SOURCES[I.ROLE_SOURCES[c.role]]))))),
        h('div', { class: 'setup-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', 'data-k': 'pilot-back', onclick: () => go('manifest') }, t('pilot.back')))),
    ];
  }

  // ---------- the card on the surface ----------
  // One card at a time over the surface: a region's name and one real fact, with the source, the first time you walk into
  // it in a mission, and a point of interest's card the first time it is met (a landmark's discovery, a formation's fact
  // when you survey it, a Kestrel structure's story log). Facts and logs come once a mission: store.regionsSeen keeps the ids
  // shown (regions' and points of interest's), by mission code and mode. The region's name on the surface is a button that shows
  // its card again. The card stays while the mouse is on it or it has keyboard focus (WCAG 2.2.1), and goes 15 s after that.
  // A card that comes while another opened less than 8 s ago is still up waits its turn (see arrive).
  let cardTimer = null;
  // Sets the card and changes the live stage in place. The walking loop gets here, and a render() would move the surface
  // node into a new stage, which can drop a touch drag on the joystick and closes an open crew-job dropdown.
  function setCard(c) {
    store.card = c;
    if (!c) { clearTimeout(cardTimer); cardLeft = null; }
    const stage = document.querySelector('.sf-stage');
    if (!stage) return; // the surface isn't shown: the next render() takes the card from the store
    const old = stage.querySelector('.region-card'), card = surfaceCard();
    if (old && card) old.replaceWith(card);
    else if (card) stage.appendChild(card);
    else if (old) old.remove();
  }

  // The card closes 15 s from now, unless by then the mouse is on it or it has keyboard focus: it then waits another 15 s.
  // The mouse or the focus leaving the card (see surfaceCard) starts the 15 s again. Touch never holds it: :hover sticks
  // after a tap, so only a mouse (hover: hover) counts.
  const canHover = () => !!window.matchMedia && window.matchMedia('(hover: hover)').matches;
  const onConsole = () => store.screen === 'ops' && store.opsView === 'console'; // the card is on the surface: out of sight here
  function reading() {
    const card = document.querySelector('.region-card');
    return !!card && ((canHover() && card.matches(':hover')) || card.contains(document.activeElement));
  }
  // The console takes the surface out of sight: setOpsView holds the card's time left (cardLeft) and gives it back on return.
  let cardDue = 0, cardLeft = null;
  function armCardTimer(ms = 15000) {
    clearTimeout(cardTimer);
    cardLeft = null;
    if (!store.card) return;
    cardDue = Date.now() + ms;
    cardTimer = setTimeout(() => { if (reading() || onConsole()) armCardTimer(); else closeCard(); }, ms);
  }

  // A card that comes while another opened less than 8 s ago is still up waits, in order, so a hab pod's log or a formation's
  // fact is not cut short by a landmark's discovery or a new region (the M4c final review's lost card). The first waiting card
  // opens when the 8 s are over, or at once when the card up is closed; the player reading a card, as for the 15 s, keeps it.
  // The card the player asks for (the region's name) opens at once. A card that waited for a mission that is over is dropped.
  const CARD_HOLD = 8000;
  let holdTimer = null, held = []; // held: [{ c, key }]
  const missionKey = () => { const s = mission(); return s ? s.seed + '|' + (lanOn() ? 'coop' : 'solo') : ''; };
  function openCard(c) {
    setCard(c);
    armCardTimer();
    clearTimeout(holdTimer);
    holdTimer = setTimeout(nextCard, CARD_HOLD);
  }
  function nextCard() {
    holdTimer = null;
    const key = missionKey(), s = mission();
    held = s && s.status === 'active' ? held.filter(e => e.key === key) : [];
    if (held.length && (reading() || onConsole())) { holdTimer = setTimeout(nextCard, CARD_HOLD); return; }
    if (held.length) openCard(held.shift().c);
  }
  function closeCard() {
    setCard(null);
    clearTimeout(holdTimer);
    nextCard();
  }
  function arrive(c) {
    if (holdTimer || (store.card && reading())) {
      held.push({ c, key: missionKey() });
      if (!holdTimer) holdTimer = setTimeout(nextCard, CARD_HOLD);
    } else openCard(c);
  }

  // Is this the first time the card of `id` (a region, or a point of interest) comes up in this mission and mode?
  // With a `kind` (a story log's or a fact's), also only the first of its kind: there are 6 log texts and 7 facts.
  function firstTime(id, kind) {
    const key = missionKey();
    // A demo keeps its own list, in memory: the device's list is neither read nor changed.
    const slot = mission() && mission().quick ? 'regionsSeenQuick' : 'regionsSeen'; // each slot keeps its own list
    let rs = store.demo ? demoSeen : store[slot];
    if (rs.key !== key) { rs = { key, list: [] }; if (store.demo) demoSeen = rs; else store[slot] = rs; }
    const kinds = rs.kinds || (rs.kinds = []);
    const newId = !rs.list.includes(id), newKind = !kind || !kinds.includes(kind);
    if (newId) rs.list.push(id);
    if (kind && newKind) kinds.push(kind);
    if (newId || (kind && newKind)) LS.set(slot, rs);
    return newId && newKind;
  }

  // Resume drops the card up and the cards waiting, unread: their regions come up again the next time (a fact or a log keeps its mark).
  const unread = new Set(); // mission key + region id: visited, but its card was dropped unread
  function unseeUnread() {
    const slot = mission() && mission().quick ? 'regionsSeenQuick' : 'regionsSeen', rs = store.demo ? demoSeen : store[slot];
    const ids = [store.card].concat(held.map(e => e.c)).filter(c => c && c.type === 'region' && !c.again).map(c => c.id);
    ids.forEach(id => unread.add(missionKey() + id)); // solo: the mission's own record keeps the region visited
    if (!rs || rs.key !== missionKey()) return;
    rs.list = rs.list.filter(id => !ids.includes(id));
    if (!store.demo) LS.set(slot, rs);
  }

  function showRegionCard(id, soloFirst) {
    if (store.demo) return; // a scene's own card and the demo bar say what it shows; a region card would cover both
    const first = firstTime(id), again = unread.delete(missionKey() + id); // firstTime also keeps the device's list for the Science notes
    if (soloFirst == null ? first : soloFirst || again) arrive({ type: 'region', id });
  }

  // The region's name on the surface was selected: read its card again, for another 15 s.
  function reopenRegionCard(id) {
    held = held.filter(e => e.c.id !== id);
    openCard({ type: 'region', id, again: true });
  }

  // A point of interest's card, asked for by the surface (src/surface-eva.js) or a crewmate's discovery (onEvent): { type:
  // 'landmark', id, kind, by, science } (science: null when not known), { type: 'formation', id, kind } or { type: 'log', id,
  // kind } (a Kestrel structure's story log, its id the structure's). A fact or a log is reading, shown once a mission code
  // as a region's is; a discovery is this mission's event (the rules make it once), shown whenever it happens. The
  // discoverer's own tab hears of it twice, its answer and the server's event, in either order: the second only adds the
  // reward when the first had none (to the card up, or to the one that waits its turn).
  function showCard(c) {
    if (!c || !mission()) return;
    const cur = store.card;
    if (cur && cur.id === c.id) {
      if (cur.science == null && c.science != null) setCard(Object.assign({}, cur, { science: c.science }));
      return;
    }
    const waits = held.find(e => e.c.id === c.id);
    if (waits) {
      if (waits.c.science == null && c.science != null) waits.c = Object.assign({}, waits.c, { science: c.science });
      return;
    }
    if (c.type !== 'landmark' && !firstTime(c.id, c.type + ':' + c.kind)) return;
    arrive(c);
  }

  // A server event (src/net.js): a crewmate's discovery opens its card on every tab (spec §5, C6). The event names the
  // landmark by id; its kind is the world's.
  function onEvent(d) {
    const s = mission(), g = d && d.kind === 'discover' && /^L(-?\d+),(-?\d+)$/.exec(d.landmark);
    const l = s && g && W.landmarkAt(W.seedOf(s.seed), Number(g[1]), Number(g[2]));
    if (l) showCard({ type: 'landmark', id: l.id, kind: l.kind, by: d.by, science: Number.isFinite(d.science) ? d.science : null });
  }

  // What a card says, in the language of the moment: { cls, eyebrow, title, meta, body, src } (meta: a discovery's reward
  // and finder; src: a real fact's source, when the sources table has it).
  function cardText(c) {
    if (c.type === 'region') return { cls: '', eyebrow: t(c.again ? 'region.note' : 'region.new'), title: t('region.' + c.id), body: t('region.fact.' + c.id), src2: I.REGION_EXTRA_SOURCES[c.id] ? I.SOURCES[I.REGION_EXTRA_SOURCES[c.id]] : null, src: I.SOURCES[I.REGION_SOURCES[c.id]] };
    if (c.type === 'landmark') {
      const stem = D.LANDMARKS.kinds[c.kind].fact, meta = [c.science != null ? t('haul.science', { n: nf(c.science) }) : null, c.by ? t('disc.by', { name: crewName(c.by) }) : null];
      const src = I.LANDMARK_SOURCES ? I.SOURCES[I.LANDMARK_SOURCES[c.kind]] : null;
      return { cls: ' disc', eyebrow: t('disc.new'), title: t(stem + '.name'), meta: meta.filter(Boolean).join(' · '), body: t(stem + '.fact'), src };
    }
    if (c.type === 'formation') {
      const stem = D.FORMATIONS.kinds[c.kind].fact, src = I.FORMATION_SOURCES ? I.SOURCES[I.FORMATION_SOURCES[c.kind]] : null;
      return { cls: '', eyebrow: t('disc.formation'), title: t(stem + '.name'), body: t(stem + '.fact'), src };
    }
    const stem = D.STRUCTURES.kinds[c.kind].log; // a Kestrel structure's story log: fiction (ks.label says so), no source
    return { cls: ' log', eyebrow: t('ks.label'), title: t(stem + '.name'), body: t(stem + '.log'), src: null };
  }
  function surfaceCard() {
    if (!store.card) return null;
    const { cls, eyebrow, title, meta, body, src, src2 } = cardText(store.card);
    const card = h('aside', {
      class: 'region-card' + cls, role: 'status', 'aria-live': 'polite',
      onpointerleave: e => { if (e.pointerType === 'mouse') armCardTimer(); },
      onfocusout: e => { if (!card.contains(e.relatedTarget)) armCardTimer(); },
    },
      h('div', { class: 'region-card-h' },
        h('span', { class: 'eyebrow' }, eyebrow),
        h('button', { class: 'sf-x', type: 'button', 'data-k': 'region-close', 'aria-label': t('common.close'), onclick: closeCard }, '×')),
      h('h3', null, title),
      meta ? h('p', { class: 'meta' }, meta) : null,
      h('p', null, body),
      src ? h('p', { class: 'src' }, t('region.source') + ': ', srcA(src), src2 ? [' · ', srcA(src2)] : null) : null);
    return card;
  }

  // ---------- the Science note: what the mission found ----------
  // Every fact and story log the mission found, as the cards that showed them (spec §13.12): the regions visited, the landmarks
  // discovered, the formations surveyed, the Kestrel structures used and the hab pods visited (stats[].pods: no other record
  // says a pod was visited), each fact or log once however many of its kind were found, the first finder named. It reads the
  // mission's own record and not this device's cards, so a card another card replaced is not lost, and in co-op it is the whole
  // team's. What a save somebody edited by hand holds that this world does not have (an id with nothing at it, a count that is
  // no number) is skipped.
  function foundCards(s) {
    const x = s.expedition, out = [], seen = new Set();
    if (!x || typeof x !== 'object') return out;
    const seed = W.seedOf(s.seed), isMap = v => !!v && typeof v === 'object' && !Array.isArray(v), keys = v => (isMap(v) ? Object.keys(v) : []);
    const add = c => { const k = c.type + ':' + (c.kind || c.id); if (!seen.has(k)) { seen.add(k); out.push(c); } };
    const cell = (re, id) => { const g = re.exec(id); return g ? [Number(g[1]), Number(g[2])] : null; }; // an id spelled as the world spells it
    for (const id of Array.isArray(x.regions) ? x.regions : []) if (W.REGIONS.includes(id)) add({ type: 'region', id, again: true });
    for (const id of keys(x.landmarks)) {
      const g = cell(/^L(-?\d{1,7}),(-?\d{1,7})$/, id), l = g && W.landmarkAt(seed, g[0], g[1]), v = x.landmarks[id];
      if (l && l.id === id) add({ type: 'landmark', id, kind: l.kind, by: isMap(v) && s.crew.some(c => c.id === v.by) ? v.by : null });
    }
    for (const id of keys(x.sites)) { // a formation's survey is the one site with an "F" id
      const g = cell(/^F(-?\d{1,7}),(-?\d{1,7}):0$/, id), f = g && X.chunkAt(s, g[0], g[1]).formations[0];
      if (f && f.sites.length && id === f.id + ':0') add({ type: 'formation', id: f.id, kind: f.kind });
    }
    for (const id of keys(x.structures)) {
      const g = x.structures[id] && cell(/^S(-?\d{1,7}),(-?\d{1,7})$/, id), st = g && W.structureAt(seed, g[0], g[1]);
      if (st && st.id === id) add({ type: 'log', id, kind: st.kind });
    }
    if (keys(x.stats).some(id => isMap(x.stats[id]) && Number.isFinite(x.stats[id].pods) && x.stats[id].pods > 0)) add({ type: 'log', id: 'pod', kind: 'pod' });
    return out;
  }

  // The note: each entry is the card's own words (eyebrow, title, fact or log, source), so the notes and the cards cannot differ.
  // An entry is a native <details>, closed (R29): its summary is the eyebrow, title and meta, and the fact or log and its
  // source open under it, so a long mission's list stays a list of titles to open.
  const foundOpen = new Set(); // the entries the player has open: render() rebuilds the note, and co-op renders on every frame
  function foundNote(s) {
    const cards = foundCards(s);
    return h('article', { class: 'note found' }, h('h3', null, t('notes.found')),
      cards.length ? h('ul', { class: 'found-list' }, cards.map(c => {
        const { cls, eyebrow, title, meta, body, src, src2 } = cardText(c);
        const k = c.type + ':' + c.id;
        return h('li', { class: cls.trim() || null }, h('details', { open: foundOpen.has(k), ontoggle: e => { if (e.target.open) foundOpen.add(k); else foundOpen.delete(k); } },
          h('summary', { 'data-k': 'found:' + k }, h('span', { class: 'eyebrow' }, eyebrow), h('b', null, title), meta ? h('span', { class: 'meta' }, meta) : null),
          h('p', null, body),
          src ? h('div', { class: 'src' }, t('region.source') + ': ', srcA(src), src2 ? [' · ', srcA(src2)] : null) : null));
      })) : h('p', null, t('notes.foundNone')));
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

  // Which crew member the local player walks around as: your seat in co-op, mission.pilot in solo play.
  function controlId() {
    const s = mission();
    if (!s) return null;
    if (lanOn()) { const mine = me(); return mine ? mine.crewId : null; }
    return s.pilot || null;
  }

  function setOpsView(v) {
    if (store.card && v === 'console' && store.opsView !== 'console') { cardLeft = Math.max(0, cardDue - Date.now()); clearTimeout(cardTimer); }
    store.opsView = v;
    if (v !== 'console' && cardLeft != null && store.card) armCardTimer(cardLeft);
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
    reveal: diff => {
      const s = mission();
      if (!s || !s.expedition) return;
      if (lanOn()) {
        F.mergeMap(store.fog, diff, 4096);
        F.mergeMap(fogOut, diff);
        flushFog();
        return;
      }
      F.mergeMap(s.expedition.revealed, diff, 4096);
      saveSoloSoon();
    },
    enterRegion: id => {
      const s = mission();
      if (!s || !s.expedition || !W.REGIONS.includes(id)) return;
      const first = !s.expedition.regions.includes(id);
      if (first) {
        if (lanOn()) N.act('region', { region: id });
        else { s.expedition.regions.push(id); saveSoloSoon(); }
      }
      showRegionCard(id, lanOn() ? null : first); // solo: this mission's own record, not the device's slot
    },
    reopenRegion: id => { if (W.REGIONS.includes(id)) reopenRegionCard(id); },
    card: c => showCard(c),
    cardUp: () => !!store.card, // the surface says the round brief again once the card over it closes
    // This round's goals for the surface's HUD column (spec §3.9): [{ text, done, frac }], frac 0-1; empty when there are none.
    // The HUD asks twice a second, so the Expedition panel beside it follows here too (followGoals).
    goals: () => followGoals(goalsOf(mission())).map(g => ({
      text: g.need > 1 ? t('goal.withProgress', { goal: goalText(g), p: nf(g.progress), n: nf(g.need) }) : goalText(g), done: g.done === true, frac: goalFrac(g),
    })),
    // Exploring (the rules' one table, Z.act). Solo: the rules run here for your pilot on your mission, which is saved, and
    // that includes the solar flare. Co-op: the server runs them against where it last saw you, and everyone gets the new
    // room. Always resolves to { ok, ... } or { error }.
    exp: (type, payload, pos) => {
      const s = mission();
      if (!s || !s.expedition || s.status !== 'active') return Promise.resolve({ error: 'badPhase' });
      const p = payload || {};
      if (lanOn()) return N.act(type, p).then(r => (r && (!r.error || I.has(store.lang, 'eva.err.' + r.error)) ? r : { error: 'net' }), () => ({ error: 'net' }));
      const r = Z.act(s, s.pilot, type, p, pos);
      if (!r.error) { saveSoloSoon(); render(); }
      return Promise.resolve(r);
    },
    // Solo: your suit level, the rover's battery, the round's clock and where you stand are kept with the saved mission
    // (co-op sends the suit and the battery with each position; the server keeps the clock and where you stand).
    suit: r => {
      const s = mission();
      if (lanOn() || !s || !s.expedition || !s.pilot || !r) return;
      X.setSuit(s, s.pilot, r.suit);
      if (r.driven != null) X.setRoverDriven(s, s.pilot, r.driven);
      Z.setClock(s, r.clock);
      X.setWhere(s, s.pilot, r.at);
      saveSoloSoon();
    },
    // Solo: the tiles you walk (spec §3.10), from two samples of where you stood about 150 ms apart on the surface's clock; the
    // suit report above saves them. Co-op's server counts them from the positions it relays.
    walk: (from, to, dt) => {
      const s = mission();
      if (lanOn() || !s || !s.expedition || !s.pilot) return;
      X.addDistance(s, s.pilot, from, to, dt);
    },
    // A ping (spec §3.5): co-op sends it to the server, which names you and sends it on to everyone, you too (onPing). Solo has
    // nobody to send it to: false, and the surface shows it itself.
    ping: (x, y) => lanOn() && N.sendPing(x, y),
  };

  // ---------- exploring: what was delivered and what is still out there ----------
  const RES_ICON = { water: 'water', materials: 'materials', food: 'food', o2: 'o2', spares: 'spares', science: 'science' };
  // "+160 kg water — Ice deposit, Icy Plains (Minh)"
  function haulText(l) {
    return t(l.late ? 'rep.haulLate' : 'rep.haul', {
      amount: t('haul.' + l.res, { n: nf(l.amount) }), what: t('find.' + l.kind), region: t('region.' + W.REGIONS[l.region]), name: crewName(l.crewId),
    });
  }
  // This round's goals (src/goals.js, spec §3.9), with their progress brought up to date. Solo play judges them here, as the
  // server does for a co-op room; a co-op tab only reads what the server sent with the room (its frames carry the current
  // progress, and a tab has no fog of its own to judge a "new areas" goal with).
  function goalsOf(s) {
    const x = s && s.expedition;
    if (!x || s.status !== 'active' || !Array.isArray(x.goals)) return [];
    if (!lanOn()) G.update(s);
    return x.goals;
  }
  // The round's goal, or the copy the report keeps ({ id, kind, params, reward }: no `need`, which is the params' count).
  const goalText = g => t('goal.' + g.kind, { tiles: g.params && g.params.tiles, n: g.need != null ? g.need : g.params && (g.params.loads || g.params.count) });
  const goalFrac = g => (g.done ? 1 : clamp(g.need > 0 ? g.progress / g.need : 0, 0, 1));
  // "+20 science, +2 morale": what a goal pays, nothing for a zero. The kinds of reward are the five D.GOALS pays in.
  function rewardText(rw) {
    const parts = [];
    for (const [k, key] of [['science', 'haul.science'], ['materials', 'haul.materials'], ['water', 'haul.water'], ['morale', 'goal.morale'], ['kits', 'goal.kits']]) {
      if (rw && rw[k] > 0) parts.push(t(key, { n: nf(rw[k]) }));
    }
    return parts.join(', ');
  }
  // A haul pays a share of what its loads give, which nobody knows until they are in.
  function goalReward(g) {
    const list = rewardText(g.reward);
    if (list) return t('goal.reward', { list });
    return g.kind === 'haul' ? t('goal.rewardHaul', { pct: Math.round(D.GOALS.kinds.haul.bonus * 100) }) : '';
  }
  function goalRow(g) {
    return h('li', { class: 'goal' + (g.done ? ' done' : '') },
      ico(g.done ? 'ok' : 'flag', 14),
      h('div', null,
        h('div', { class: 'goal-h' },
          h('span', null, goalText(g)),
          g.need > 1 ? h('span', { class: 'faint num' }, t('goal.progress', { p: nf(g.progress), n: nf(g.need) })) : null),
        g.need > 1 ? bar(goalFrac(g), g.done ? 'ok' : 'accent') : null,
        h('span', { class: 'hint' }, goalReward(g)),
        g.done ? h('span', { class: 'hint ok' }, t('goal.done')) : null));
  }
  // The Expedition panel's goals list, and the progress it shows. In solo play progress also moves with no action and so no
  // render(): new ground in the fog (the reveal hook), a region walked into (enterRegion). The HUD's look at the goals then
  // redraws the list in place, only when a goal's progress or done flag changed; a render() would move the surface's node
  // into a new stage (see setCard). Co-op tabs render each room frame, and the server sends one when a goal moves.
  let goalsUl = null, goalsShown = '';
  const goalsKey = list => list.map(g => g.id + ':' + g.progress + ':' + g.done).join(' ');
  function goalList(goals) {
    goalsShown = goalsKey(goals);
    return (goalsUl = h('ul', { class: 'replist goals' }, goals.map(goalRow)));
  }
  function followGoals(goals) {
    if (goalsUl && goalsKey(goals) !== goalsShown) {
      goalsShown = goalsKey(goals);
      goalsUl.replaceChildren(...goals.map(goalRow));
    }
    return goals;
  }

  // What is waiting outside this round (Z.outside, spec §3.4): a solar flare, dust devils, a dust storm, an oxygen leak at the base.
  function conditions(s) {
    const on = Z.outside(s), f = s.expedition.flare, out = [];
    if (on.includes('flare')) {
      if (!f) out.push(['crit', 'warn', t('eva.cond.flare', { d: D.DANGERS.flare.dose, w: D.DANGERS.flare.delay, c: D.DANGERS.flare.countdown })]);
      else if (!f.over) out.push(['crit', 'warn', t('eva.cond.flareOn')]);
      else if (f.hit.length) out.push(['warn', 'warn', t('eva.cond.flareHit', { names: f.hit.map(crewName).join(', '), d: D.DANGERS.flare.dose })]);
      else out.push(['ok', 'ok', t('eva.cond.flareSafe')]);
    }
    if (on.includes('devils')) out.push(['warn', 'eva', t('eva.cond.devils', { n: D.DANGERS.devils.push, s: D.DANGERS.devils.suit })]);
    if (on.includes('storm')) out.push(['warn', 'warn', t('eva.cond.storm', { n: Z.viewTiles(s, false) })]);
    if (on.includes('rupture')) out.push(['', 'o2', t('eva.cond.rupture', { kg: D.EXPEDITION.canister.o2 })]);
    return out;
  }
  function expeditionPanel(s) {
    const x = s.expedition;
    goalsUl = null;
    if (!x || !x.banked) return null;
    const lines = x.banked.lines || [];
    const carrying = Object.keys(x.carried).filter(id => Array.isArray(x.carried[id]) && x.carried[id].length);
    const body = [], cond = conditions(s), goals = goalsOf(s);
    if (goals.length) {
      body.push(h('span', { class: 'eyebrow' }, t('goal.title')));
      body.push(goalList(goals));
    }
    if (cond.length) {
      body.push(h('span', { class: 'eyebrow' }, t('eva.cond.title')));
      body.push(h('ul', { class: 'replist' }, cond.map(([cls, icon, text]) => h('li', { class: cls }, ico(icon, 14), h('span', null, text)))));
    }
    if (!lines.length && !carrying.length) body.push(h('p', { class: 'muted' }, t('eva.nothing')));
    if (lines.length) {
      body.push(h('span', { class: 'eyebrow' }, t('eva.banked')));
      body.push(h('ul', { class: 'replist' }, lines.map(l => h('li', { class: 'ok' }, ico(RES_ICON[l.res], 14), h('span', null, haulText(l))))));
      body.push(h('p', { class: 'hint' }, t('eva.counts')));
    }
    if (carrying.length) {
      body.push(h('span', { class: 'eyebrow' }, t('eva.carrying')));
      body.push(h('ul', { class: 'replist' }, carrying.map(id => h('li', null, ico('eva', 14),
        h('span', null, crewName(id) + ': ' + x.carried[id].map(it => t('haul.' + it.res, { n: nf(it.amount) })).join(', '))))));
    }
    return panel(t('eva.title'), body);
  }

  function surfaceStage(s, p, f) {
    if (!window.SolSurface) return null;
    const node = window.SolSurface.mount(surfaceHooks);
    const ctl = controlId();
    window.SolSurface.update({
      mission: s, plan: p, forecast: f, controlId: ctl, canControl, crewName, t, lang: store.lang,
      fog: lanOn() ? store.fog : (s.expedition ? s.expedition.revealed : null),
      // Co-op runs the server's round clock (it moves the dust devils and times the flare); solo keeps its own.
      clock: lanOn() && Number.isFinite(store.room.clock) ? { t: store.room.clock, at: store.clockAt } : null,
      // Where your astronaut last stood this round, so a reload doesn't walk you home for free.
      lastPos: lanOn() ? (store.room.positions || []).find(q => q.crewId === ctl) || null : X.whereOf(s, ctl),
      // The Display settings of this device: the graphics level, the FPS limit and the readout.
      gfx: { quality: store.settings.gfx, fpsCap: store.settings.fpsCap, showFps: store.settings.showFps },
    });
    return h('div', { class: 'sf-stage' }, node, surfaceCard());
  }

  // Co-op: your astronaut died, or you have none: take over a free crewmate, or watch.
  function seatPanel(s) {
    if (!lanOn()) return null;
    const mine = me();
    const own = mine && mine.crewId ? s.crew.find(c => c.id === mine.crewId) : null;
    if (own && own.status !== 'dead') return null;
    const free = s.crew.filter(c => c.status === 'active' && !store.room.players.some(pl => pl.crewId === c.id && pl.connected));
    return panel(t(own ? 'seat.lost' : 'seat.none'), [
      h('p', { class: 'muted' }, t(free.length ? 'seat.pick' : 'seat.watch')),
      free.length ? h('div', { class: 'seat-list' }, free.map(c => h('button', {
        class: 'btn btn-sm btn-primary', type: 'button', 'data-k': 'seat:' + c.id, onclick: () => claimSeat(c.id),
      }, t('seat.take', { name: crewName(c.id), role: t('role.' + c.role) })))) : null,
    ]);
  }

  function surfaceSide(s, p, f) {
    const ctl = controlId();
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
      seatPanel(s),
      expeditionPanel(s),
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
    goalsOf(s); // brings the goals up to date before the forecast reads them
    const f = E.forecast(s, p);
    if (store.opsView !== 'console' && window.SolSurface) {
      return [hud(s, f), opsTabs(), h('div', { class: 'sf-layout' }, surfaceStage(s, p, f), surfaceSide(s, p, f))];
    }
    return [
      hud(s, f),
      opsTabs(),
      h('div', { class: 'ops' },
        h('div', { class: 'col col-1' }, eventsPanel(s, p), mapPanel(s, p, f), buildPanel(s, p, f)),
        h('div', { class: 'col col-2' }, seatPanel(s), crewPanel(s, p, f)),
        h('div', { class: 'col col-3' }, forecastPanel(s, p, f), systemsPanel(s, p, f), ordersPanel(s, p), earthPanel(s, p), advancePanel(s, p))),
    ];
  }

  function hud(s, f) {
    const season = E.seasonAt(s.sol);
    const weather = s.schedule[s.turn].weather;
    const next = X.forecastAhead(s); // a repaired weather station's forecast (C1): next round's weather, or null
    const wx = w => (w === 'global' ? 'crit' : w === 'regional' ? 'warn' : '');
    const turns = E.turnsOf(s);
    const remaining = (turns - s.turn) * D.TURN_SOLS;
    const track = h('div', { class: 'track', 'aria-label': t('ops.round', { n: s.turn + 1, m: turns }) },
      Array.from({ length: turns }, (_, i) => {
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
          h('span', { class: 'muted num' }, '/ ' + turns * D.TURN_SOLS),
          h('span', { class: 'muted' }, '· ' + t('ops.round', { n: s.turn + 1, m: turns }))),
        track,
        h('div', { class: 'topbar-actions' },
          h('span', { class: 'chip', title: t(seasonKey(season.ls)) }, t(seasonKey(season.ls) + '.short') + ' · Ls ' + Math.round(season.ls) + '°'),
          h('span', { class: 'wxs' }, // this round's weather, with a repaired weather station's forecast stacked under it
            h('span', { class: 'chip ' + wx(weather) }, t('weather.' + weather)),
            next ? h('span', { class: 'chip fc ' + wx(next), title: t('eva.forecastBy') }, t('eva.forecast', { w: t('weather.' + next) })) : null),
          lanOn() ? lanChip() : null,
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.help'), onclick: () => { store.modal = 'help'; render(); } }, ico('help')),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.notes'), onclick: () => { store.modal = 'notes'; render(); } }, ico('book')),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.achievements'), onclick: () => { store.modal = 'badges'; render(); } }, ico('trophy')),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.display'), onclick: () => { store.modal = 'display'; render(); } }, ico('gear')),
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
    const flareDue = s.quick === true && s.turn === D.QUICK.flareTurn; // the Quick mission's set flare: invite the player outside
    if (!decisions.length && !infos.length && !flareDue) return null;
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
        h('b', null, eventText(e, 'title')), h('span', null, eventText(e, 'body'))))) : null,
      flareDue ? h('div', { class: 'info-ev', 'data-k': 'quick-flare' }, h('span', null, t('quick.flareHint'))) : null));
  }

  // ----- outpost map -----
  const TILE = 64;
  // The base's land (M6: it grows with the rank, into negative spots, cut round to the flat ground): the view is its box,
  // each land tile drawn with its own edge, so the corners the cut leaves out stay the panel's background.
  function mapSvg(s, p, f) {
    const b = E.landOf(s), X0 = b.x0 * TILE, Y0 = b.y0 * TILE, W = (b.x1 - b.x0 + 1) * TILE, Hh = (b.y1 - b.y0 + 1) * TILE;
    const ice = new Set(s.terrain.ice.map(([x, y]) => x + ',' + y));
    const rock = new Set(s.terrain.rock.map(([x, y]) => x + ',' + y));
    const shades = ['#6c3523', '#733a25', '#7a3e27', '#683322'];
    let o = `<svg viewBox="${X0} ${Y0} ${W} ${Hh}" role="img" aria-label="${esc(t('panel.map'))}"><title>${esc(t('panel.map'))}</title>`;
    for (const [x, y] of E.landTiles(s)) {
      const k = x + ',' + y, X = x * TILE, Y = y * TILE, edge = 'stroke="#000" stroke-opacity="0.12"';
      const r = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if (ice.has(k)) {
        o += `<rect x="${X}" y="${Y}" width="${TILE}" height="${TILE}" fill="#86aebf" ${edge}/>`;
        o += `<path d="M${X + 8} ${Y + 20}l14 6 10-9 14 11M${X + 12} ${Y + 44}l12-4 9 8 15-5" stroke="#dff1f9" stroke-width="1.5" fill="none" opacity="0.8"/>`;
        o += `<path d="M${X + 40} ${Y + 30}l6 -8 6 9z" fill="#e7f6fc" opacity="0.8"/>`;
      } else {
        o += `<rect x="${X}" y="${Y}" width="${TILE}" height="${TILE}" fill="${shades[r % 4]}" ${edge}/>`;
        o += `<circle cx="${X + 10 + (r % 40)}" cy="${Y + 12 + ((r >>> 5) % 40)}" r="1.6" fill="#5b2a1c"/><circle cx="${X + 20 + ((r >>> 9) % 34)}" cy="${Y + 30 + ((r >>> 13) % 26)}" r="1.1" fill="#8e4b31"/>`;
      }
      if (rock.has(k)) {
        o += `<ellipse cx="${X + 26}" cy="${Y + 40}" rx="16" ry="11" fill="#4c3b37"/><ellipse cx="${X + 42}" cy="${Y + 30}" rx="11" ry="8" fill="#5c4944"/><ellipse cx="${X + 22}" cy="${Y + 36}" rx="6" ry="3" fill="#6b5752"/>`;
      }
    }

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
      o += `<rect x="${X0}" y="${Y0}" width="${W}" height="${Hh}" fill="${w === 'global' ? '#6b3219' : '#b5763f'}" opacity="${w === 'global' ? 0.5 : 0.22}" pointer-events="none"/>`;
      let dots = '';
      for (let i = 0; i < (w === 'global' ? 70 : 30); i++) dots += `<circle cx="${X0 + (i * 97) % W}" cy="${Y0 + (i * 53) % Hh}" r="${1 + (i % 3) * 0.6}" fill="#e7b88a" opacity="0.5"/>`;
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

  // The relay beacon kit (spec §3.8) is built through construction like a module but takes no tile, so it is not in BUILD_ORDER:
  // it has this button of its own, queued at once as the shield layer is. The tooltip says what a beacon does, then how the real
  // Mars Relay Network works (sources.md B: the game's beacons are fictional), and keeps saying so while the button is off.
  function kitButton(s, pending) {
    const chk = E.canBuild(s, 'kit', pending), spec = D.BUILDS.kit, B = D.EXPEDITION.beacon;
    const why = chk.reason === 'max' ? t('bld.why.maxKit', { max: B.max }) : t('bld.why.' + chk.reason);
    return h('button', {
      type: 'button', class: 'bld', 'data-k': 'bld:kit', disabled: !chk.ok, title: [chk.ok ? t('bld.kit', B) : why, t('bld.kitReal')].join('\n'),
      onclick: () => patchPlan({ builds: pending.concat([{ type: 'kit' }]) }),
    }, h('span', { html: A.module('kit', 36) }),
    h('span', null, h('span', { class: 't' }, t('mod.kit')), h('br'), h('span', { class: 'c' }, t('bld.cost', { kg: nf(spec.materials), w: nf(spec.work, spec.work % 1 ? 1 : 0) }))));
  }
  // Beacons placed, kits waiting at the base and kits out in backpacks: the three places a beacon can be before it stands.
  function kitStatus(x) {
    const out = Object.values(x.carried || {}).reduce((n, items) => n + (Array.isArray(items) ? items.filter(E.isKit).length : 0), 0);
    return t('bld.kitStatus', { placed: x.beacons.length, max: D.EXPEDITION.beacon.max, kits: x.kits, out });
  }

  // What a build costs after what the plan already queues (a gear line's next level, the next rank), with the water when a
  // gear level takes some; and why it can't be built, naming the building it needs.
  function costText(s, type, pending) {
    const c = E.costOf(s, type, pending), w = nf(c.work, c.work % 1 ? 1 : 0);
    return c.water > 0 ? t('bld.costWater', { kg: nf(c.materials), water: nf(c.water), w }) : t('bld.cost', { kg: nf(c.materials), w });
  }
  const whyNot = (type, chk) => (chk.reason === 'needs' ? t('bld.why.needs', { module: t('mod.' + D.BUILDS[type].needs) }) : t('bld.why.' + chk.reason));
  // M6 (spec §3): a choice shows only once the rank unlocks it, never in a Quick mission or with its tier off; a vehicle once
  // a Garage stands, a gear line once a Fabricator stands (the launch shows at Colony, saying it needs its pad).
  function listed(s, type, pending) {
    const r = E.canBuild(s, type, pending).reason, needs = D.BUILDS[type].needs;
    return r !== 'rank' && r !== 'quick' && (!needs || type === 'launch' || s.modules[needs].count > 0);
  }
  const unlocksAt = r => Object.keys(D.BUILDS).filter(ty => E.unlockRank(ty) === r).map(ty => t('mod.' + ty)).join(', ');
  // A gear line's next level as its help line says it: the suit's seconds, the loads, the hold time in % of today's.
  function gearHelp(s, line, pending) {
    const lv = D.GEAR[line].levels[(s.gear[line] || 0) + s.projects.concat(pending).filter(b => b.type === line).length];
    return lv ? t('gear.' + line + '.help', { s: nf(lv.value), n: nf(lv.value), p: nf(lv.value * 100) }) : t('bld.why.max');
  }
  // A build's button: one with a tile (a module, a vehicle) picks its tile on the map; the rest are queued at once.
  function buildRow(s, type, pending) {
    const chk = E.canBuild(s, type, pending), gear = D.GEAR[type] ? s.gear[type] || 0 : null;
    const maxed = gear != null && gear >= D.GEAR[type].levels.length;
    return h('button', {
      type: 'button', class: 'bld', 'data-k': 'bld:' + type, 'aria-pressed': String(store.buildType === type),
      disabled: !chk.ok, title: !chk.ok ? whyNot(type, chk) : gear != null ? gearHelp(s, type, pending) : t('bld.' + type),
      onclick: () => {
        if (!D.PLACED.includes(type)) { if (chk.ok) patchPlan({ builds: pending.concat([{ type }]) }); return; }
        store.buildType = store.buildType === type ? null : type;
        render();
      },
    }, h('span', { html: A.module(type === 'shield' ? 'shelter' : type, 36) }),
    h('span', null, h('span', { class: 't' }, t('mod.' + type)),
      gear != null ? [h('br'), h('span', { class: 'c' }, t('gear.level', { n: gear }))] : null,
      maxed ? null : [h('br'), h('span', { class: 'c' }, costText(s, type, pending))]));
  }
  // The rank-up (spec §3) takes no tile, like the kit: the next rank, its cost and what it unlocks. None at Colony or in Quick.
  function rankButton(s, pending) {
    const r = E.rankOf(s) + 1;
    if (s.quick === true || !D.RANKS[r]) return null;
    const chk = E.canBuild(s, 'rankup', pending), unlocks = t('rank.unlocks', { list: unlocksAt(r) });
    return h('button', {
      type: 'button', class: 'bld', 'data-k': 'bld:rankup', disabled: !chk.ok, title: chk.ok ? unlocks : whyNot('rankup', chk),
      onclick: () => { if (chk.ok) patchPlan({ builds: pending.concat([{ type: 'rankup' }]) }); },
    }, h('span', { html: A.module('rankup', 36) }),
    h('span', null, h('span', { class: 't' }, t('rank.next', { rank: t('rank.' + D.RANKS[r].id) })), h('br'),
      h('span', { class: 'c' }, costText(s, 'rankup', pending)), h('br'), h('span', { class: 'c' }, unlocks)));
  }

  function buildPanel(s, p, f) {
    const pending = p.builds || [];
    const builders = f.points.construction > 0;
    const busy = s.projects.length + pending.length > 0;
    const rows = types => types.filter(ty => listed(s, ty, pending)).map(ty => buildRow(s, ty, pending));
    const group = (name, types) => { const r = rows(types); return r.length ? [h('span', { class: 'eyebrow', style: 'grid-column:1/-1' }, t(name)), r] : null; };
    const palette = h('div', { class: 'palette' }, rows(D.BUILD_ORDER), kitButton(s, pending), rankButton(s, pending),
      group('mod.garage', ['rover', 'cabin', 'drone']), group('mod.fabricator', Object.keys(D.GEAR)), rows(['launch']));
    const sel = store.buildType;
    return panel(t('panel.build'), [
      h('p', { class: 'hint' }, t('bld.pick'), ' ', h('b', { class: 'num', style: 'color:var(--fg)' }, nf(s.resources.materials) + ' kg'), ' · ', t('hud.materials').toLowerCase()),
      busy && !builders ? h('p', { class: 'chip warn' }, ico('warn', 14), t('bld.needBuilders')) : null,
      sel ? h('p', { class: 'muted', style: 'font-size:var(--fs-sm)' }, t('bld.' + sel)) : null,
      palette,
      s.expedition ? h('p', { class: 'hint' }, kitStatus(s.expedition)) : null,
      pending.length ? h('div', { class: 'queue' }, h('span', { class: 'eyebrow' }, t('bld.queue')),
        pending.map((b, i) => h('div', { class: 'qrow' },
          h('span', { html: A.module(b.type === 'shield' ? 'shelter' : b.type, 26) }),
          h('span', null, t('mod.' + b.type), ' ', h('span', { class: 'faint num' }, '−' + nf(E.costOf(s, b.type, pending.slice(0, i)).materials) + ' kg')),
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
            sols: a.sols, name: a.crewId ? crewName(a.crewId) : '', module: a.module ? t('mod.' + a.module) : '', end: E.turnsOf(s) * D.TURN_SOLS,
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

  // What the crew explored, read from the mission's expedition state, for the debrief's Expedition section (spec §3.10) and the
  // ISRU lesson: { crew: [{ id, walked (tiles), finds: [[kind, loads]], loads, hit, cover }], counts, best }, or null when the
  // mission did not explore. Standing in the HQ's own region, the one region every mission starts in, is not exploring. A
  // save somebody edited by hand may hold anything: whatever is not a number or a known kind of find is skipped.
  function exploreOf(s) {
    const x = s.expedition;
    if (!x || typeof x !== 'object') return null;
    const num = v => (Number.isFinite(v) && v > 0 ? v : 0), isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const size = v => (Array.isArray(v) ? v.length : isMap(v) ? Object.keys(v).length : 0);
    const stats = isMap(x.stats) ? x.stats : {};
    const crew = s.crew.map(c => {
      const st = isMap(stats[c.id]) ? stats[c.id] : {}, found = isMap(st.finds) ? st.finds : {};
      const finds = Object.keys(found).filter(k => I.has(store.lang, 'find.' + k) && num(found[k])).map(k => [k, num(found[k])]);
      return { id: c.id, walked: num(st.distance), finds, loads: finds.reduce((n, f) => n + f[1], 0), hit: num(st.flareHit), cover: num(st.flareCover) };
    });
    const counts = { regions: size(x.regions), landmarks: size(x.landmarks), structures: size(x.structures), beacons: size(x.beacons), goals: size(x.goalsDone) };
    const b = x.bestFind, best = isMap(b) && num(b.amount) && I.has(store.lang, 'find.' + b.kind) ? b : null;
    const did = crew.some(c => c.walked >= 1 || c.loads > 0) || counts.regions > 1 || counts.landmarks + counts.structures + counts.beacons + counts.goals > 0;
    return did ? { crew, counts, best } : null;
  }

  // The debrief's Expedition section: who walked how far and found what, the most valuable find, what was visited, found, used,
  // placed and completed, and whom the solar flares caught. What is empty is left out.
  function expeditionSection(s) {
    const f = exploreOf(s);
    if (!f) return null;
    const rows = f.crew.filter(c => c.walked >= 1 || c.loads > 0);
    const names = (list, key) => list.map(c => crewName(c.id) + ' ×' + nf(c[key])).join(', ');
    const hit = f.crew.filter(c => c.hit > 0), cover = f.crew.filter(c => c.cover > 0);
    const flares = Math.max(0, ...f.crew.map(c => c.hit + c.cover));
    const counts = ['regions', 'landmarks', 'structures', 'beacons', 'goals'].filter(k => f.counts[k] > 0);
    return panel(t('deb.expedition'), h('div', { class: 'exp' },
      rows.length ? h('table', { class: 'score-table exp-table' },
        h('thead', null, h('tr', null, h('th', null, t('deb.crew')), h('th', null, t('deb.exp.walked')), h('th', null, t('deb.exp.found')))),
        h('tbody', null, rows.map(c => h('tr', null,
          h('td', null, crewName(c.id)), h('td', null, tilesText(c.walked)),
          h('td', null, c.loads ? nf(c.loads) + ' (' + c.finds.map(([k, n]) => t('find.' + k) + ' ×' + nf(n)).join(' · ') + ')' : '–'))))) : null,
      f.best ? h('p', null, h('b', null, t('deb.exp.best') + ': '), haulText(f.best)) : null,
      counts.length ? h('div', { class: 'exp-counts' }, counts.map(k => h('span', { class: 'chip' }, t('deb.exp.' + k, { n: nf(f.counts[k]) })))) : null,
      flares > 0 ? h('div', { class: 'exp-flares' },
        h('p', null, t('deb.exp.flares', { n: nf(flares) })),
        hit.length ? h('p', null, t('deb.exp.flareHit', { d: D.DANGERS.flare.dose, list: names(hit, 'hit') })) : null,
        cover.length ? h('p', null, t('deb.exp.flareCover', { list: names(cover, 'cover') })) : null) : null));
  }

  // The ISRU lesson's sources, in the order its sentences use them: what ISRU is (S5), MOXIE (S1, S2), water ice underground (S6),
  // and the chemistry of splitting water (S7 is lunar ice and S8 a research-fellowship project, so for the chemistry only).
  const ISRU_SOURCES = ['isru', 'moxie', 'moxieInstruments', 'iceMap', 'lroIce', 'protonCeramics'];

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
    // A mission that explored learns what ISRU is, from NASA's pages (spec §3.10, sources.md A). It always gets a place: the
    // last of the four if they are full.
    const four = out.slice(0, 4);
    if (exploreOf(s)) four.splice(Math.min(four.length, 3), four.length > 3 ? 1 : 0, ['isruMars', ISRU_SOURCES]);
    return four;
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
    const xMax = E.turnsOf(s) * D.TURN_SOLS; // the mission's own last sol (500 for a Full mission)
    C.lineChart(charts, {
      xMax, title: t('ch.stocks'), unit: 'kg', xLabel: t('ch.sol'), fmt: v => nf(v), tableLabel: t('ch.stocks'),
      series: [
        { name: t('hud.o2'), color: STOCK_COLORS.o2, points: pts('o2') },
        { name: t('hud.water'), color: STOCK_COLORS.water, points: pts('water') },
        { name: t('hud.food'), color: STOCK_COLORS.food, points: pts('food') },
      ],
    });
    C.lineChart(charts, {
      xMax, title: t('ch.dose'), unit: 'mSv', xLabel: t('ch.sol'), fmt: v => nf(v), tableLabel: t('ch.dose'),
      refLines: [{ y: D.DOSE_LIMIT, label: t('ch.limit') }],
      series: s.crew.map((c, i) => ({ name: crewName(c.id), color: CHART_ROLE[c.role], points: H.map(x => [x.sol, x.doses[i]]) })),
    });
    C.lineChart(charts, {
      xMax, title: t('ch.power'), unit: 'kW', xLabel: t('ch.sol'), fmt: v => nf(v, 1), tableLabel: t('ch.power'),
      series: [
        { name: t('ch.supply'), color: '#3987e5', points: H.filter(x => x.supply != null).map(x => [x.sol - D.TURN_SOLS, x.supply]) },
        { name: t('ch.load'), color: '#d95926', points: H.filter(x => x.load != null).map(x => [x.sol - D.TURN_SOLS, x.load]) },
      ],
    });
    const chartHead = h('div', null);
    chartHead.appendChild(h('h3', { class: 'eyebrow', style: 'margin-bottom:8px' }, t('ch.stocks') + ' · ' + t('ch.dose') + ' · ' + t('ch.power')));

    const scoreRows = ['science', 'health', 'radiation', 'crew', 'independence', 'depot', 'completion'];
    // The Science row counts the map's science at a share, up to a cap (D.SCORE.map, R24): a line under the table says so with
    // the score's own figures. A lost mission halves all its science, which the line doesn't explain, so it has none.
    const mapHint = success && sc.map.found > 0 ? h('p', { class: 'hint' }, t('sc.mapHint', {
      pct: Math.round(D.SCORE.map.share * 100), cap: nf(D.SCORE.map.cap), found: nf(sc.map.found), counted: nf(sc.map.counted),
    })) : null;
    return [
      topbar(lanOn() ? lanChip() : null),
      h('section', { class: 'deb-hero' + (success ? '' : ' lost') },
        h('div', null,
          h('span', { class: 'eyebrow' }, t('deb.code') + ' · ' + s.seed + ' · ' + t('diff.' + s.difficulty)),
          s.quick ? h('span', { class: 'chip', 'data-k': 'quick-tag' }, t('quick.tag')) : null,
          h('h1', null, success ? t('deb.success') : t('deb.lost', { sol: s.endCause ? s.endCause.sol : s.sol })),
          h('p', null, success ? t('deb.successBody', { n: alive, m: s.crew.length, end: E.turnsOf(s) * D.TURN_SOLS }) : t('cause.' + ((s.endCause && s.endCause.reason) || 'health')))),
        h('div', { class: 'grade', 'aria-label': t('deb.grade') + ' ' + sc.grade }, sc.grade, h('small', null, nf(sc.total)))),
      panel(t('deb.crew'), h('div', { class: 'deb-crew' }, s.crew.map((c, i) => h('div', { class: 'c' },
        h('div', { html: A.portrait(c.role, 44, { variant: i, status: c.status }) }),
        h('div', null, h('b', null, crewName(c.id)), h('br'),
          h('span', { class: c.status === 'dead' ? 'crit' : 'muted' }, c.status === 'dead' ? t('crew.dead') : nf(c.health) + ' HP'),
          h('span', { class: 'faint' }, ' · ' + nf(c.dose) + ' mSv')))))),
      expeditionSection(s),
      h('div', { class: 'deb-grid' },
        h('div', { class: 'col' },
          panel(t('deb.score'), [h('table', { class: 'score-table' },
            h('tbody', null,
              scoreRows.map(k => h('tr', null, h('td', null, t('sc.' + k)), h('td', null, signed(sc.parts[k])))),
              h('tr', { class: 'total' }, h('td', null, t('sc.total')), h('td', null, nf(sc.total))))), mapHint]),
          panel(t('deb.lessons'), h('div', { class: 'lessons' }, lessonsFor(s).map(([k, src]) => h('article', { class: 'lesson' },
            h('h3', null, t('lesson.' + k + '.title')),
            h('p', null, t('lesson.' + k + '.body', { end: E.turnsOf(s) * D.TURN_SOLS, tonnes: nf(D.FOOD_PER_CREW * s.crew.length * E.turnsOf(s) * D.TURN_SOLS / 1000, 1) })),
            src.map(id => srcA(I.SOURCES[id])))))),
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
  const LOG_SKIP = ['landing', 'landing_quick', 'breakdown', 'injury', 'dust_regional', 'dust_global', 'supply_arrived'];

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
    const o = store.online;
    let share = null;
    if (window.solApp && isHost() && o) {
      if (o.state === 'on') {
        share = h('button', { class: 'chip ok', type: 'button', 'data-k': 'online-chip', onclick: () => { store.modal = 'online'; render(); } },
          ico('wifi', 12), ' ', t('online.chipOn'));
      } else if (o.state === 'off' && o.error) {
        share = h('button', { class: 'chip crit', type: 'button', 'data-k': 'online-retry', onclick: () => startOnline(true) }, t('online.chipRetry'));
      }
    }
    return [h('span', { class: 'chip info' }, ico('wifi', 12), ' ', room.code), status, share];
  }

  // ---------- online share link (desktop app only) ----------
  // One body for the lobby panel and the dialog behind the topbar "Online" chip.
  function onlinePanel() { return panel(t('online.title'), onlineBody()); }

  function onlineBody() {
    const o = store.online || { state: 'off' };
    const body = [h('p', { class: 'hint' }, t('online.lead'))];
    if (o.state === 'on') {
      body.push(
        h('div', { class: 'addr', 'data-k': 'online-url' }, o.url),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('button', {
            class: 'btn btn-sm', type: 'button', 'data-k': 'online-copy',
            onclick: () => navigator.clipboard.writeText(o.url).then(() => toast(t('online.copied')), () => toast(t('online.copyFailed'))),
          }, t('online.copy')),
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'data-k': 'online-stop', onclick: () => window.solApp.stopOnline() }, t('online.stop'))),
        h('img', { src: o.qr, alt: t('online.qr'), width: 160, height: 160, style: 'border-radius:8px;background:#fff;padding:6px' }),
        h('p', { class: 'hint' }, t('online.hint', { code: store.room.code })));
    } else if (o.state === 'downloading' || o.state === 'starting') {
      body.push(
        h('p', { class: 'muted' }, t(o.state === 'downloading' ? 'online.downloading' : 'online.starting')),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'data-k': 'online-cancel', onclick: () => window.solApp.stopOnline() }, t('online.cancel')));
    } else {
      if (o.error) body.push(h('p', { class: 'crit' }, t(o.error === 'hashMismatch' ? 'online.errorHash' : 'online.error')));
      body.push(h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'online-start', onclick: () => startOnline(false) }, ico('wifi', 16), t('online.start')));
    }
    return body;
  }

  // showLink: a restart from the topbar chip opens the link dialog once the new link is up, so the host can pass it on.
  async function startOnline(showLink) {
    store.online = { state: 'starting' };
    render();
    const r = await window.solApp.hostOnline();
    if (r && r.error) store.online = { state: 'off', error: r.error === 'cancelled' ? null : r.error };
    else if (r && r.url && showLink && lanOn() && (!store.modal || store.modal === 'online')) store.modal = 'online';
    render();
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
            (store.lanInfo && store.lanInfo.addresses || []).length
              ? [h('p', { class: 'hint' }, t('lan.share')), store.lanInfo.addresses.map(a => h('div', { class: 'addr' }, a))]
              : null,
            window.solApp && host ? h('p', { class: 'hint' }, t('lan.firewall')) : null,
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
          host && window.solApp ? onlinePanel() : null,
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
              // A seat whose player has gone (closed tab, old share link) can be taken back.
              : h('button', { class: 'btn btn-sm btn-primary', type: 'button', disabled: !!(owner && owner.connected), onclick: () => claimSeat(c.id) }, t('lan.take')));
        })))),
      h('div', { class: 'deb-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: leaveRoom }, t('lan.leave'))),
    ];
  }

  function leaveRoom() {
    // A host going back to solo play should no longer be reachable from the internet.
    if (window.solApp && store.online && store.online.state !== 'off') window.solApp.stopOnline();
    N.act('leave');
    N.disconnect();
    N.clear();
    store.lan = null;
    store.room = null;
    forgetFog();
    go('title');
  }

  function onRoom(room) {
    const prevTurn = store.lastTurnSeen;
    store.room = room;
    store.clockAt = performance.now() / 1000; // the round clock in this frame was read on the server just now
    // A new co-op mission (a launch, a launch after "Fly again", or one whose restart this tab missed while offline, even
    // under the same mission code) starts with a fresh world and no fog, and none of the old fog may still be sent.
    if (F.isNewLaunch(store.launchSeen, room)) forgetFog();
    store.launchSeen = room.mission ? room.launch : null;
    if (room.mission) {
      flushFog(); // fog seen while the socket was down goes out now that this tab knows which mission the server is on
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

  function onLanStatus(status, kind) {
    if (status === 'gone') {
      store.lan = null; store.room = null; store.lanStatus = null;
      forgetFog();
      // The room is over: an app host should no longer be reachable from the internet.
      if (window.solApp && store.online && store.online.state !== 'off') window.solApp.stopOnline();
      go('title');
      if (kind === 'kicked' || kind === 'closed') toast(t('lan.gone.' + kind));
      return;
    }
    store.lanStatus = status;
    if (status === 'open') { // fog sent in the last 30 s may have gone into a dead socket: send it again (the server's merge is safe to repeat)
      for (const e of fogSent) if (Date.now() - e.at < 30000) F.mergeMap(fogOut, e.part);
      fogSent = [];
    }
    // Fog seen while the socket was down is sent by onRoom, once the first room frame says which mission the server is on:
    // sending it here could put an old mission's fog into a new mission or room.
    render();
  }

  // A seat claim the server refused says why (a dead astronaut, a seat just taken), instead of failing in silence.
  function claimSeat(crewId) {
    return N.act('claim', { crewId }).then(r => {
      if (r && r.error) toast(t(r.error === 'deadCrew' ? 'lan.deadCrew' : r.error === 'taken' ? 'lan.seatTaken' : 'eva.err.' + (I.has(store.lang, 'eva.err.' + r.error) ? r.error : 'net')));
    });
  }

  async function hostRoom(name) {
    const r = await N.create(name);
    if (r.error) { store.lanError = I.has(store.lang, 'lan.' + r.error) ? t('lan.' + r.error) : r.error; render(); return; }
    store.lan = N.session();
    store.modal = null;
    N.connect(onRoom, onLanStatus, onPos, onFog, onEvent, onPing);
  }

  async function joinRoom(code, name) {
    const r = await N.join(code, name);
    if (r.error) { store.lanError = I.has(store.lang, 'lan.' + r.error) ? t('lan.' + r.error) : r.error; render(); return; }
    store.lan = N.session();
    store.modal = null;
    N.connect(onRoom, onLanStatus, onPos, onFog, onEvent, onPing);
  }

  // Desktop app only: a friend's game on another PC opens in the normal browser (see app/join.js).
  async function openHost(addr, code) {
    const r = await window.solApp.openHost(addr, code);
    if (r && r.error) { store.lanError = I.has(store.lang, 'lan.' + r.error) ? t('lan.' + r.error) : r.error; render(); return; }
    store.lanError = null;
    toast(t('lan.opened'));
  }

  // Teammates' positions. A seat whose player's tab is gone still stands where they left (the room keeps it until the round
  // ends): marked `away`, it counts for nobody's speed aura or route line.
  function onPos(list) {
    if (!window.SolSurface || !window.SolSurface.isMounted() || !Array.isArray(list)) return;
    const on = new Set(((store.room && store.room.players) || []).filter(pl => pl.connected).map(pl => pl.crewId));
    window.SolSurface.setRemote(list.map(q => Object.assign({}, q, { away: !on.has(q.crewId) })));
  }

  // Fog a teammate revealed: kept for a rebuilt surface, and drawn straight away without a full re-render.
  function onFog(map) {
    F.mergeMap(store.fog, map, 4096);
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.mergeFog(map);
  }

  // A ping (spec §3.5), { x, y, by }: a teammate's, or your own come back from the server. The surface draws it.
  function onPing(d) {
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.ping(d);
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

  // The field guide (the project brief's item annotations): every piece of cargo, building and gear, with its name, what it
  // does in the game and a real fact with the source that states it. Cargo uses the packing screen's words, buildings the
  // build menu's, gear and the facts the build menu lacks the guide's own (guide.*).
  const GUIDE = [
    ['guide.cargo', ['solar', 'battery', 'reactor', 'recycler', 'oxygen', 'icedrill', 'greenhouse', 'waterwall', 'lab', 'rover', 'spares', 'materials', 'food', 'o2', 'water']],
    ['guide.buildings', ['hab', 'habitat', 'medbay', 'workshop', 'comms', 'shelter', 'shield', 'garage', 'fabricator', 'launchpad', 'cabin', 'drone']],
    ['guide.gear', ['suit', 'pack', 'canister', 'kit', 'tanks']],
  ];
  // Each page checked to say the fact as the game words it. An entry with none shows no fact line: lab's and spares' are
  // mottos, and no page checked says solar's 43 %, the water wall's "best shield per kilogram", baked regolith bricks or
  // water's 7 kg a day.
  const GUIDE_SOURCES = {
    battery: 'marsGlance', reactor: 'kilopower', recycler: 'water98', oxygen: 'moxie', icedrill: 'iceMap', greenhouse: 'veggie', rover: 'opportunity', food: 'bvad', o2: 'jonesKliss',
    hab: 'dra5', habitat: 'hazards', medbay: 'hazards', workshop: 'hazards', comms: 'conjunction', shelter: 'hazards', shield: 'hassler',
    suit: 'marsGlance', pack: 'percySamples', canister: 'jonesKliss', kit: 'relayJpl',
    // M6 (sources.md M6): the pressurised rover keeps DRA 5.0's line the science rover had; the Garage's says the real rover
    // it is based on is a Moon rover; the suit tanks' says MOXIE made oxygen, not that suits used it.
    garage: 'm6Pressurized', fabricator: 'm6Printing', launchpad: 'm6Samples', cabin: 'dra5', drone: 'm6Ingenuity', tanks: 'm6Moxie',
  };
  const GUIDE_ICON = { waterwall: 'water', spares: 'spares', materials: 'materials', food: 'food', o2: 'o2', water: 'water', suit: 'o2', canister: 'o2', pack: 'materials', kit: 'kit' };
  function guideEntry(id) {
    // The guide's own words (guide.<id>.*) win: a borrowed string is called here without its params (bld.kit's {base}…).
    const k = key => (I.STR.en[key] ? t(key) : null), own = part => k('guide.' + id + '.' + part), src = GUIDE_SOURCES[id] || null;
    return {
      name: own('name') || k('item.' + id + '.name') || k('mod.' + id),
      desc: own('desc') || k('item.' + id + '.desc') || k('bld.' + id),
      fact: src && (own('fact') || k('item.' + id + '.fact') || k('gear.' + id + '.fact') || (id === 'kit' ? t('bld.kitReal') : null)),
      src,
      art: GUIDE_ICON[id] ? A.icon(GUIDE_ICON[id], 28) : A.module(id === 'shield' ? 'shelter' : id, 40),
    };
  }

  function renderModal() {
    const m = store.modal;
    if (m === 'guide') {
      return modal(t('guide.title'), [
        h('p', { class: 'muted' }, t('guide.lead')),
        GUIDE.map(([head, ids]) => h('section', { class: 'guide-sec' }, h('h3', null, t(head)), h('ul', { class: 'guide-list' }, ids.map(id => {
          const e = guideEntry(id), src = e.src && I.SOURCES[e.src];
          return h('li', { class: 'guide-item', 'data-k': 'guide:' + id }, h('span', { class: 'guide-art', html: e.art }),
            h('div', null, h('b', null, e.name), h('p', { class: 'muted' }, e.desc), e.fact ? h('p', { class: 'guide-fact' }, e.fact) : null,
              src ? h('div', { class: 'src' }, t('region.source') + ': ', srcA(src)) : null));
        })))),
      ], null, true);
    }
    if (m === 'story') { // the "Why Mars?" story from the title screen, a page at a time, each with its NASA sources (I.STORY)
      const pages = I.STORY[store.lang] || I.STORY.en, n = Math.max(0, Math.min(store.storyPage || 0, pages.length - 1)), p = pages[n];
      const turn = d => { store.storyPage = n + d; render(); };
      return modal(t('story.title'), [
        h('span', { class: 'eyebrow' }, t('story.step', { n: n + 1, m: pages.length })),
        h('h3', { class: 'story-h' }, p.title),
        h('p', { class: 'story-p' }, p.body),
        h('div', { class: 'src' }, t('region.source') + ': ', p.src.map((id, i) => [i ? ' · ' : null, srcA(I.SOURCES[id])])),
      ], [
        n > 0 ? h('button', { class: 'btn', type: 'button', 'data-k': 'story-back', onclick: () => turn(-1) }, t('story.back')) : null,
        n < pages.length - 1
          ? h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'story-next', onclick: () => turn(1) }, t('story.next'))
          : h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'story-done', onclick: () => { store.modal = null; render(); } }, t('story.done')),
      ], true);
    }
    if (m === 'help') {
      return modal(t('help.title'), h('ol', { class: 'replist', style: 'list-style:decimal;padding-left:20px' },
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 'win'].map(i => h('li', { style: 'display:list-item' }, t('help.' + i, { c: D.DANGERS.flare.countdown, d: D.DANGERS.flare.dose, s: D.DANGERS.devils.suit })))));
    }
    if (m === 'notes') {
      const s = mission(), isru = { title: t('lesson.isruMars.title'), body: t('lesson.isruMars.body'), src: ISRU_SOURCES }; // the debrief's lesson, with its sources
      return modal(t('notes.title'), [
        h('p', { class: 'muted' }, t('notes.lead')),
        h('p', null, h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'notes-guide', onclick: () => { store.modal = 'guide'; render(); } }, ico('science', 14), t('guide.open'))),
        h('div', { class: 'notes-list' }, s ? foundNote(s) : null, I.NOTES[store.lang].concat([isru]).map(n => h('article', { class: 'note' },
          h('h3', null, n.title), h('p', null, n.body),
          n.src.length ? h('div', { class: 'src' }, n.src.map(id => srcA(I.SOURCES[id]))) : null))),
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
      const f = store.lanForm;
      const joinBtn = h('button', { class: 'btn', type: 'button', 'data-k': 'lan-joinbtn', onclick: () => joinRoom(f.code, f.name || 'Crew') }, t('lan.join'));
      return modal(t('lan.title'), [
        h('p', { class: 'muted' }, t('title.lanHint')),
        h('div', { class: 'field' }, h('label', { for: 'lan-me' }, t('lan.name')),
          h('input', { id: 'lan-me', class: 'input', maxlength: 24, value: f.name, oninput: e => { f.name = e.target.value; } })),
        h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'lan-host', onclick: () => hostRoom(f.name || 'Host') }, ico('users', 16), t('lan.host')),
        h('div', { class: 'divider' }),
        // In the app, "Join game" means a friend's game on another PC: it opens in the normal browser.
        window.solApp ? h('div', { class: 'field' }, h('label', { for: 'lan-hostaddr' }, t('lan.hostAddr')),
          h('input', { id: 'lan-hostaddr', class: 'input', autocomplete: 'off', spellcheck: 'false', value: f.addr, oninput: e => { f.addr = e.target.value; } }),
          h('p', { class: 'hint' }, t('lan.hostAddrHint'))) : null,
        h('div', { class: 'field' }, h('label', { for: 'lan-join' }, t('lan.room')),
          h('input', { id: 'lan-join', class: 'input num', maxlength: 6, autocomplete: 'off', value: f.code, oninput: e => { f.code = e.target.value; } })),
        window.solApp
          ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
            h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'lan-openhost', onclick: () => openHost(f.addr, f.code) }, ico('wifi', 16), t('lan.openHost')),
            joinBtn)
          : joinBtn,
        store.lanError ? h('p', { class: 'crit' }, store.lanError) : null,
      ]);
    }
    if (m === 'online' && window.solApp && lanOn() && isHost()) return modal(t('online.title'), onlineBody());
    if (m === 'report' && store.report) return reportModal(store.report);
    if (m === 'display') return displayModal();
    return null;
  }

  // Display: a choice is saved at once and the surface follows on the re-render. Per device: a co-op server never sees it.
  function displayModal() {
    const st = store.settings;
    const pick = (key, v) => { st[key] = v; saveSettings(); render(); };
    const row = (label, choice, hint) => h('div', { class: 'setup-row' }, h('span', { class: 'eyebrow' }, label), choice, hint ? h('p', { class: 'hint' }, hint) : null);
    return modal(t('display.title'), [
      row(t('display.gfx'), seg('gfx', [{ value: 'best', label: t('display.gfx.best') }, { value: 'fast', label: t('display.gfx.fast') }], st.gfx, v => pick('gfx', v), false, t('display.gfx')),
        t('display.gfx.' + st.gfx + '.hint')),
      row(t('display.fpsCap'), seg('fpsCap', [{ value: 30, label: '30' }, { value: 60, label: '60' }, { value: 0, label: t('display.fpsCap.max') }], st.fpsCap, v => pick('fpsCap', v), false, t('display.fpsCap')),
        t('display.fpsCap.hint')),
      row(t('display.showFps'), seg('showFps', [{ value: false, label: t('common.off') }, { value: true, label: t('common.on') }], st.showFps, v => pick('showFps', v), false, t('display.showFps'))),
    ]);
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
    if (r.pilot) li('users', r.pilot.to ? 'warn' : 'crit', pilotText(r.pilot));
    if (r.expedition) {
      for (const l of r.expedition.lines) li(RES_ICON[l.res], 'ok', haulText(l));
      // A goal's reward is already in the totals above (a haul's and a region's science, say), so the line only names it.
      for (const g of r.expedition.goals || []) li('flag', 'ok', t('rep.goal', { goal: goalText(g), reward: rewardText(g.reward) }));
      for (const inc of r.expedition.incidents) {
        if (inc.kind === 'flare') li('warn', 'warn', t('rep.flare', { name: crewName(inc.crewId), d: D.DANGERS.flare.dose }));
        else li('crit', 'warn', t('rep.collapse', { name: crewName(inc.crewId), h: D.EXPEDITION.collapse.health, m: D.EXPEDITION.collapse.morale }));
      }
    }
    // Beacon kits are news when one was finished this round or a goal paid one: say how many wait at the base to be carried out.
    const kitsAt = s && s.expedition ? s.expedition.kits : 0;
    if (kitsAt > 0 && (r.completed.includes('kit') || ((r.expedition && r.expedition.goals) || []).some(g => g.reward && g.reward.kits > 0))) li('construction', 'ok', t('rep.kits', { n: kitsAt }));
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
    if (store.demo && !store.modal && SH.card(store.demo.id).view === 'modal') { leaveDemo(); return; } // a dialog card ends with its dialog
    const active = document.activeElement;
    const focusKey = active && active.getAttribute ? active.getAttribute('data-k') : null;
    const focusId = active && active.id && active.tagName === 'INPUT' ? active.id : null;
    const name = screenName();
    let view;
    if (name === 'manifest') view = viewManifest();
    else if (name === 'pilot') view = viewPilot();
    else if (name === 'ops') view = mission() && mission().status === 'active' ? viewOps() : viewDebrief();
    else if (name === 'debrief') view = viewDebrief();
    else if (name === 'lobby') view = viewLobby();
    else if (name === 'showcase') view = viewShowcase();
    else view = viewTitle();
    const root = h('main', { class: store.prevScreen !== name ? 'screen-in' : '' }, view);
    const nodes = [root];
    const m = store.modal ? renderModal() : null;
    if (m) nodes.push(m);
    if (store.demo) nodes.push(demoBar());
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

  // ---------- the Showcase (spec M5 §5) ----------
  // The presenter's gallery of 12 cards, reached from the Admin page (/?showcase=1, honoured only on the host's own page).
  // Show me builds a throwaway mission on SH.CODE and swaps it for the presenter's own in memory; store.demo marks it, and while
  // it is set nothing is saved, recorded or remembered (see LS, saveSolo, checkBadges, firstTime). Leaving puts the presenter's
  // mission, plan and tab back as they were.
  let demoKeep = null, demoSeen = null, demoStep = 0;
  function viewShowcase() {
    return [
      h('header', { class: 'topbar' },
        h('div', { class: 'brand' }, h('b', null, 'SOL 500'), h('span', null, t('show.open'))),
        h('div', { class: 'topbar-actions' }, h('a', { class: 'btn btn-ghost btn-sm', href: '/admin', 'data-k': 'show-exit' }, t('show.exit')), langSeg())),
      h('section', { class: 'show' },
        h('h1', null, t('show.title')),
        h('div', { class: 'show-grid' }, SH.CARDS.map(c => h('article', { class: 'panel show-card' },
          h('h2', null, t('show.card.' + c.id + '.name')),
          h('p', null, t('show.card.' + c.id + '.why')),
          c.source ? h('div', { class: 'src' }, t('region.source') + ': ', srcA(I.SOURCES[c.source])) : null,
          h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'show:' + c.id, onclick: () => showScene(c.id) }, t('show.me')))))),
    ];
  }
  // The bar over the stage: back to the gallery, and the card's purpose on one line.
  function demoBar() {
    const why = t('show.card.' + store.demo.id + '.why'), card = SH.card(store.demo.id), steps = card.steps, extra = card.line ? card.line(t, X) : null;
    const next = () => {
      demoStep = (demoStep + 1) % steps.length;
      try { Promise.resolve(window.SolSurface.scene({ at: steps[demoStep] })).catch(() => toast(t('show.failed'))); } catch (e) { toast(t('show.failed')); }
    };
    return h('div', { class: 'show-bar' },
      h('button', { class: 'btn btn-sm', type: 'button', 'data-k': 'show-back', onclick: leaveDemo }, t('show.back')),
      steps ? h('button', { class: 'btn btn-sm btn-primary', type: 'button', 'data-k': 'show-next', onclick: next }, t('show.next')) : null,
      h('div', { class: 'show-text' },
        h('p', { class: 'show-cap', title: why }, h('b', null, t('show.why') + ': '), why),
        extra ? h('p', { class: 'show-line', 'data-k': 'show-line' }, extra) : null));
  }
  function showScene(id) {
    const c = SH.card(id);
    if (!c || lanOn() || store.demo) return;
    flushSolo(); // a save already waiting is the presenter's, and goes to disk now; the demo starts with no timer pending
    demoKeep = { mission: store.mission, plan: store.plan, report: store.report, advice: store.advice, opsView: store.opsView };
    const sc = D.SHOWCASE;
    let s;
    try {
      s = E.createMission({
        seed: SH.CODE, loadout: E.referenceKit(sc.difficulty, sc.crewSize, true), difficulty: sc.difficulty, crewSize: sc.crewSize, events: false,
        pilot: D.CREW.find(x => x.role === 'commander').id, quick: true, schedulePatch: c.schedule,
      });
      G.pick(s);
      if (c.prepare) c.prepare(s, { Z, X });
    } catch (e) { demoKeep = null; toast(t('show.failed')); return; }
    held = [];
    demoStep = 0;
    demoSeen = { key: '', list: [] };
    Object.assign(store, { demo: { id }, mission: s, plan: E.defaultPlan(s), report: null, advice: null, card: null, opsView: c.view === 'console' ? 'console' : 'surface', modal: c.view === 'modal' ? c.modal : null, storyPage: 0 });
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.reset();
    go('ops');
    if (c.view === 'surface' && (c.at || c.board || c.suit != null || c.clock != null)) setUpScene(c, 0);
  }
  // The surface builds its world on the render that mounts it; the scene waits for it (about 3 s at most), then asks once.
  function setUpScene(c, tries) {
    if (!store.demo || store.demo.id !== c.id) return;
    const SS = window.SolSurface, fail = () => { if (store.demo && store.demo.id === c.id) { leaveDemo(); toast(t('show.failed')); } };
    try {
      const p = SS && SS.probe && SS.probe();
      if (!p || !p.world) { if (tries >= D.SHOWCASE.waitTries) fail(); else setTimeout(() => setUpScene(c, tries + 1), D.SHOWCASE.waitMs); return; }
      Promise.resolve(SS.scene({ at: c.at, board: c.board, suit: c.suit, clock: c.clock })).catch(fail);
    } catch (e) { fail(); }
  }
  function leaveDemo() {
    const keep = demoKeep;
    demoKeep = demoSeen = null;
    clearTimeout(holdTimer);
    holdTimer = null;
    held = [];
    store.demo = null;
    setCard(null);
    store.modal = null;
    if (keep) Object.assign(store, keep);
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.reset();
    go('showcase');
  }

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
    // Script-inserted, so a network that drops Google traffic cannot hold up the first paint. Not asked for when offline or in
    // the single file (window.SOL_APP false): the CSS stacks fall back to the system fonts.
    if (navigator.onLine !== false && window.SOL_APP !== false) {
      const fonts = document.createElement('link');
      fonts.rel = 'stylesheet';
      fonts.href = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&family=JetBrains+Mono:wght@400;600&family=League+Spartan:wght@600;700;800&display=swap';
      document.head.appendChild(fonts);
    }
    registerServiceWorker();
    if (window.solApp) window.solApp.onOnline(s => { store.online = s; render(); });
    render();
    if (N) {
      N.info().then(info => {
        if (!info) return;
        store.lanInfo = info;
        const s = N.restore();
        // Opened from a friend's "Join game" (…/?join=CODE): go straight to the join dialog with the code filled in.
        let joinCode = null, showcase = false;
        try { joinCode = new URLSearchParams(location.search).get('join'); showcase = info.adminHere === true && new URLSearchParams(location.search).get('showcase') === '1'; } catch (e) { /* no query */ }
        const invited = !s && !!joinCode && /^[A-Za-z]{1,6}$/.test(joinCode);
        if (showcase) { store.screen = 'showcase'; render(); return; } // the host's own page only; no co-op session is resumed for it
        if (s) { store.lan = s; N.connect(onRoom, onLanStatus, onPos, onFog, onEvent, onPing); }
        else if (invited) { store.lanForm.code = joinCode.toUpperCase(); store.modal = 'lan'; }
        render();
        if (invited) { const el = document.getElementById('lan-me'); if (el) el.focus(); }
      });
    }
  }

  window.SolUI = { store, render };
  boot();
})();
