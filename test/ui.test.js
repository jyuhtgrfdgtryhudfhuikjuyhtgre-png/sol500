'use strict';
// The interface (src/ui.js) in a small fake DOM: the Display dialog, solo play's exploring hooks (the rules run on the spot,
// and the save every 2 s), the dangers in the Expedition panel and the round report's flare line. ui.js is a browser script
// whose only export is SolUI { store, render }, so it runs in a vm sandbox with the globals the page gives it, and a stub
// SolSurface keeps the hooks the surface is mounted with and the data of its last update. The looks are checked in the browser.
// The charts of the debrief draw into the same fake elements (createElementNS), so the debrief renders too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const I = require('../src/i18n.js');

const T = 64;
const SOURCES = ['data.js', 'engine.js', 'i18n.js', 'art.js', 'charts.js', 'worldgen.js', 'fog.js', 'expedition.js', 'goals.js', 'dangers.js', 'saves.js', 'ui.js']
  .map(f => [f, fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')]);
const en = (k, p) => I.t('en', k, p);
const plain = v => JSON.parse(JSON.stringify(v));
const at = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });

// Just enough of a DOM for ui.js to render into: an element keeps its children, attributes and listeners.
class El {
  constructor(tag) { Object.assign(this, { tagName: String(tag).toUpperCase(), children: [], attrs: {}, listeners: {}, style: {}, dataset: {}, className: '', innerHTML: '', text: '' }); }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  replaceChildren(...cs) { this.children = []; this.append(...cs); }
  createTHead() { return this.appendChild(new El('thead')); } // the charts' data tables
  createTBody() { return this.appendChild(new El('tbody')); }
  insertRow() { return this.appendChild(new El('tr')); }
  insertCell() { return this.appendChild(new El('td')); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  querySelector() { return null; }
  focus() {}
  get content() { return { firstElementChild: new El('svg') }; } // a <template>'s, for the SVG pictures
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.text = String(v); this.children = []; }
}
const walk = (n, out) => { out.push(n); for (const c of n.children) if (c instanceof El) walk(c, out); return out; };
const click = n => { for (const fn of n.listeners.click) fn({ target: n, currentTarget: n }); };

// ui.js booted on a device whose localStorage holds `stored` (keys without the "sol500." prefix), with `globals` added to its
// window (a stub SolNet). Timers wait for flush().
function page(stored, globals) {
  const ls = {}, timers = [], app = new El('div'), surface = { hooks: null, data: null };
  for (const [k, v] of Object.entries(stored || {})) ls['sol500.' + k] = JSON.stringify(v);
  const win = {
    document: {
      createElement: tag => new El(tag), createElementNS: (ns, tag) => new El(tag), createTextNode: text => ({ textContent: text }), getElementById: id => (id === 'app' ? app : null),
      addEventListener() {}, head: new El('head'), documentElement: new El('html'), activeElement: null, querySelector: () => null,
    },
    localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
    navigator: { language: 'en-US' }, location: { search: '', hostname: 'localhost', protocol: 'http:' },
    addEventListener() {}, scrollTo() {}, Intl, console, setTimeout: fn => timers.push(fn), clearTimeout() {},
    SolSurface: { mount: hooks => { surface.hooks = hooks; return new El('div'); }, update: data => { surface.data = data; }, isMounted: () => false },
  };
  win.window = win.self = win;
  Object.assign(win, globals);
  win.Node = El;
  vm.createContext(win);
  for (const [f, code] of SOURCES) vm.runInContext(code, win, { filename: f });
  const UI = win.SolUI, E = win.SolEngine;
  const all = () => walk(app, []);
  return {
    win, UI, E, X: win.SolExpedition, G: win.SolGoals, I: win.SolI18n, ls, surface, all,
    byKey: k => all().find(n => n.attrs['data-k'] === k),
    dialog: () => all().find(n => n.attrs.role === 'dialog') || null,
    flush() { while (timers.length) timers.shift()(); },
    // A solo mission on the operations screen's surface tab, as after a launch.
    play(m) { Object.assign(UI.store, { mission: m, plan: E.defaultPlan(m), screen: 'ops', opsView: 'surface', modal: null }); UI.render(); },
    mission: o => E.createMission(Object.assign({ seed: 'UI-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' }, o)),
  };
}

// ---------- the Display settings ----------

test('the Display dialog opens from the top bar and from the operations header; a choice is saved at once, and the surface gets it', () => {
  const pg = page();
  const pressed = () => pg.all().filter(n => /^(gfx|fpsCap|showFps):/.test(n.attrs['data-k']) && n.attrs['aria-pressed'] === 'true').map(n => n.attrs['data-k']);
  click(pg.all().find(n => n.tagName === 'BUTTON' && n.textContent === en('nav.display'))); // the title screen's top bar
  assert.equal(pg.dialog().attrs['aria-label'], en('display.title'));
  assert.deepEqual(pressed(), ['gfx:best', 'fpsCap:0', 'showFps:false'], 'the defaults: Best, Max, no readout');
  for (const k of ['display.gfx', 'display.gfx.best.hint', 'display.fpsCap', 'display.fpsCap.hint', 'display.showFps']) assert.ok(pg.dialog().textContent.includes(en(k)), k);
  click(pg.byKey('gfx:fast'));
  click(pg.byKey('fpsCap:30'));
  click(pg.byKey('showFps:true'));
  assert.deepEqual(pressed(), ['gfx:fast', 'fpsCap:30', 'showFps:true']);
  assert.ok(pg.dialog().textContent.includes(en('display.gfx.fast.hint')), "the hint follows the chosen level");
  const saved = JSON.parse(pg.ls['sol500.settings']);
  assert.deepEqual([saved.gfx, saved.fpsCap, saved.showFps], ['fast', 30, true], 'saved at once: there is no OK button');
  click(pg.byKey('modal-close'));
  assert.equal(pg.dialog(), null);
  pg.play(pg.mission());
  assert.deepEqual(plain(pg.surface.data.gfx), { quality: 'fast', fpsCap: 30, showFps: true }, 'the surface draws with them');
  click(pg.all().find(n => n.tagName === 'BUTTON' && n.attrs['aria-label'] === en('nav.display'))); // the operations header's gear
  click(pg.byKey('fpsCap:60'));
  assert.equal(pg.surface.data.gfx.fpsCap, 60, 'and follows a change on the re-render');
});

test('a stored Display setting outside its set reads as the default; a valid one is kept, and so are the other settings', () => {
  const pick = s => [s.gfx, s.fpsCap, s.showFps];
  const junk = page({ settings: { gfx: 'ultra', fpsCap: 45, showFps: 'yes', difficulty: 'veteran' } });
  assert.deepEqual(pick(junk.UI.store.settings), ['best', 0, false]);
  assert.equal(junk.UI.store.settings.difficulty, 'veteran');
  assert.deepEqual(pick(page({ settings: { gfx: 'fast', fpsCap: 60, showFps: true } }).UI.store.settings), ['fast', 60, true]);
});

// ---------- solo play's exploring hooks ----------

test('solo: the exploring hook runs the rules on the spot for the pilot; the flare starts on the round clock and its end judges where you are, with no slack', async () => {
  const pg = page(), m = pg.mission({ seed: 'UI-FLARE' });
  m.schedule[m.turn].spe = true;
  pg.play(m);
  const exp = pg.surface.hooks.exp;
  assert.deepEqual(plain(await exp('flareStart', { t: 5 }, at(6, 4))), { ok: true, flare: { warn: 35, end: 95, over: false, hit: [] } });
  // One tile outside the base zone: a co-op server covers it with its 1.5 tiles of slack; solo judges where you are.
  assert.deepEqual(plain(await exp('flareEnd', { t: 95 }, at(3, 1))), { ok: true, hit: ['minh'] });
  assert.deepEqual(plain(m.expedition.incidents), [{ crewId: 'minh', kind: 'flare' }]);
  assert.deepEqual(plain(await exp('fly', {}, at(3, 1))), { error: 'badAction' }, 'an action the rules do not have');
  pg.flush();
  assert.deepEqual(JSON.parse(pg.ls['sol500.save']).mission.expedition.incidents, [{ crewId: 'minh', kind: 'flare' }], 'and the mission is saved');
});

test("solo: every 2 s the surface's report is kept with the mission: the suit, the rover's distance, the round clock (it only goes up) and where you stand", async () => {
  const pg = page(), m = pg.mission({ seed: 'UI-SAVE', loadout: Object.assign(pg.E.referenceKit('commander', 4), { rover: 1, waterwall: 0 }) });
  pg.play(m);
  const suit = pg.surface.hooks.suit;
  suit({ suit: 90.5, driven: null, clock: 12.5, at: { x: 640, y: 200 } });
  assert.equal(m.expedition.suits.minh, 90.5);
  assert.equal(m.expedition.clock, 12.5);
  assert.deepEqual(plain(m.expedition.where.minh), { x: 640, y: 200 });
  assert.equal((await pg.surface.hooks.exp('board', {}, pg.X.bay(m))).ok, true, 'in the rover');
  suit({ suit: 80, driven: 12, clock: 3, at: { x: 700.4, y: 210 } });
  assert.equal(m.expedition.roverDriven, 12, "the driver's rover distance");
  assert.equal(m.expedition.clock, 12.5, 'a clock that went back is ignored');
  pg.UI.render();
  assert.deepEqual(plain(pg.surface.data.lastPos), { x: 700, y: 210 }, 'the next look puts you back where you stood');
  assert.equal(pg.surface.data.clock, null, 'solo play runs its own round clock');
  pg.flush();
  const saved = JSON.parse(pg.ls['sol500.save']).mission.expedition;
  assert.deepEqual([saved.suits.minh, saved.clock, saved.where.minh], [80, 12.5, { x: 700, y: 210 }], 'and the save has them');
});

// ---------- the dangers in the Expedition panel and the round report ----------

test('the Expedition panel lists what waits outside, in order: the solar flare as it stands, dust devils, a dust storm, an O₂ leak', () => {
  const pg = page(), m = pg.mission({ seed: 'UI-COND' });
  Object.assign(m.schedule[m.turn], { spe: true, devil: true, weather: 'regional' });
  m.events = [{ type: 'o2_rupture', options: ['hide', 'salvage'], emergency: true }];
  const rows = () => {
    pg.UI.render();
    const panel = pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('eva.title'));
    const list = walk(panel, []).find(n => n.tagName === 'UL');
    return panel.textContent.includes(en('eva.cond.title')) ? list.children.map(li => li.textContent) : [];
  };
  pg.play(m);
  assert.deepEqual(rows(), [
    en('eva.cond.flare', { d: 15, w: 30, c: 60 }), en('eva.cond.devils', { n: 2, s: 10 }), en('eva.cond.storm', { n: 5 }), en('eva.cond.rupture', { kg: require('../src/data.js').EXPEDITION.canister.o2 }),
  ]);
  m.expedition.flare = { warn: 35, end: 95, over: false, hit: [] };
  assert.equal(rows()[0], en('eva.cond.flareOn'));
  m.expedition.flare = { warn: 35, end: 95, over: true, hit: ['minh', 'lena'] };
  assert.equal(rows()[0], en('eva.cond.flareHit', { names: en('name.minh') + ', ' + en('name.lena'), d: 15 }));
  m.expedition.flare.hit = [];
  assert.equal(rows()[0], en('eva.cond.flareSafe'));
  pg.play(pg.mission({ seed: 'UI-QUIET' }));
  assert.deepEqual(rows(), [], 'a quiet round lists nothing');
});

test("the round report says whom the solar flare caught (+15 mSv) and who collapsed", () => {
  const pg = page(), m = pg.mission({ seed: 'UI-REP' });
  m.expedition.incidents.push({ crewId: 'minh', kind: 'flare' }, { crewId: 'lena', kind: 'collapse' });
  const { state, report } = pg.E.resolveTurn(m, pg.E.defaultPlan(m));
  pg.play(state);
  Object.assign(pg.UI.store, { report, modal: 'report' });
  pg.UI.render();
  const lines = walk(pg.dialog(), []).filter(n => n.tagName === 'LI').map(n => n.textContent);
  assert.ok(lines.includes(en('rep.flare', { name: en('name.minh'), d: 15 })), lines.join(' | '));
  assert.ok(lines.includes(en('rep.collapse', { name: en('name.lena'), h: 20, m: 3 })));
});

// ---------- points of interest (M4c) ----------
// Seed PAINT-QA-1 has every kind of point of interest near the HQ (the painter's QA seed). Until the words branch is
// merged its names, facts and logs read as their keys, which en() gives back too.
const QA = { weather: at(13, 48), cache: at(-25, 47) };
const cardOf = pg => pg.all().find(n => /(^| )region-card( |$)/.test(n.className)) || null;
const panelText = pg => { pg.UI.render(); return pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('eva.title')).textContent; };

test("solo: a Kestrel structure's story log opens over the surface once a mission, tagged as a fictional log, with no source", () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  pg.play(m);
  pg.surface.hooks.card({ type: 'log', id: 'S0,0', kind: 'weather' });
  pg.UI.render();
  const card = cardOf(pg);
  assert.match(card.className, /(^| )log( |$)/);
  const [head, title, body, ...rest] = card.children;
  assert.equal(head.children[0].textContent, en('ks.label'), 'the tag');
  assert.equal(title.textContent, en('ks.weather.name'));
  assert.equal(body.textContent, en('ks.weather.log'));
  assert.deepEqual(rest, [], 'no source line: the Kestrel Survey is fiction');
  click(pg.byKey('region-close'));
  pg.UI.render();
  assert.equal(cardOf(pg), null, 'closed');
  pg.surface.hooks.card({ type: 'log', id: 'S0,0', kind: 'weather' });
  pg.UI.render();
  assert.equal(cardOf(pg), null, 'the same structure never opens it again in this mission');
});

test("solo: a repaired weather station's fog reaches the surface at once; its science and a cache's loads are report lines named after them", async () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  pg.play(m);
  const r = await pg.surface.hooks.exp('interact', { structure: 'S0,0' }, QA.weather);
  assert.equal(r.done, 'repaired');
  assert.ok(Object.keys(r.fog).length > 0);
  for (const k of Object.keys(r.fog)) assert.ok(pg.surface.data.fog[k], 'the surface has the fog of chunk ' + k);
  assert.ok(panelText(pg).includes(en('find.weather')), 'the weather station line');
  assert.equal((await pg.surface.hooks.exp('interact', { structure: 'S-1,0' }, QA.cache)).ok, true);
  assert.equal((await pg.surface.hooks.exp('deliver', {}, at(0, 0))).ok, true);
  assert.ok(panelText(pg).includes(en('find.cache')), 'the supply cache line');
});

test("solo: a landmark's discovery card shows its name, the reward and who found it, its real fact and its source", () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  if (!pg.I.LANDMARK_SOURCES) pg.I.LANDMARK_SOURCES = { delta: 'jezero' }; // a stand-in until the words branch brings the real map
  pg.play(m);
  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: 120 });
  pg.UI.render();
  const card = cardOf(pg);
  assert.match(card.className, /(^| )disc( |$)/);
  const src = pg.I.SOURCES[pg.I.LANDMARK_SOURCES.delta];
  assert.deepEqual(card.children.slice(1).map(n => n.textContent), [
    en('lm.delta.name'), en('haul.science', { n: 120 }) + ' · ' + en('disc.by', { name: en('name.minh') }), en('lm.delta.fact'), en('region.source') + ': ' + src.label,
  ]);
  assert.equal(card.children[0].children[0].textContent, en('disc.new'));
  assert.equal(walk(card, []).find(n => n.tagName === 'A').attrs.href, src.url);
});

test("the discoverer's own tab hears of a discovery twice, in either order: the second adds the reward the first did not have, and opens nothing new", () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  pg.play(m);
  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: null });
  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: 120 });
  assert.equal(pg.UI.store.card.science, 120);
  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: null });
  assert.equal(pg.UI.store.card.science, 120, 'a later copy without it changes nothing');
});

test("co-op: a crewmate's discovery from the server opens its card on this tab, the landmark's kind read from the world; an unknown landmark opens none", async () => {
  const net = { info: () => Promise.resolve({ lan: true }), restore: () => ({ code: 'ABCD', playerId: 'p1', token: 't' }), connect: (...h) => { net.h = h; } };
  const pg = page(null, { SolNet: net });
  await new Promise(r => setImmediate(r)); // the boot asks the server for its info, then connects
  const onEvent = net.h[4];
  pg.UI.store.room = { mission: pg.mission({ seed: 'PAINT-QA-1', coop: true }), players: [], settings: { names: {} } };
  onEvent({ kind: 'discover', landmark: 'L1,1', by: 'diego' });
  assert.equal(pg.UI.store.card, null, 'no landmark in that cell of this world');
  onEvent({ kind: 'discover', landmark: 'L0,1', by: 'diego' });
  assert.deepEqual(plain(pg.UI.store.card), { type: 'landmark', id: 'L0,1', kind: 'delta', by: 'diego', science: null });
  onEvent({ kind: 'discover', landmark: 'L0,1', by: 'diego', science: 132 });
  assert.equal(pg.UI.store.card.science, 132, "the reward, when the server's event carries it");
});

// ---------- M4d eva: the surface's hooks and the net handlers it needs (pings, a teammate whose tab is gone) ----------
// A page whose net connects at boot and whose surface is up, recording what ui.js hands it.
function surfacePage() {
  const got = { hooks: null, remote: [], pings: [] }, sent = [];
  const net = { info: () => Promise.resolve({ lan: true }), restore: () => ({ code: 'ABCD', playerId: 'p1', token: 't' }), connect: (...h) => { net.h = h; }, sendPing: (x, y) => { sent.push([x, y]); return true; } };
  const SolSurface = { mount: hooks => { got.hooks = hooks; return new El('div'); }, update() {}, isMounted: () => true, setRemote: l => got.remote.push(l), ping: d => got.pings.push(d) };
  return { got, sent, net, pg: page(null, { SolNet: net, SolSurface }) };
}

test("a ping: solo sends nothing (the surface shows it itself); co-op sends it to the server, and the server's pings reach the surface", async () => {
  const { got, sent, net, pg } = surfacePage();
  pg.play(pg.mission());
  assert.equal(got.hooks.ping(640, -320), false, 'solo: not sent');
  assert.deepEqual(sent, []);
  await new Promise(r => setImmediate(r)); // the boot asks the server for its info, then connects
  pg.UI.store.room = { mission: pg.mission({ coop: true }), players: [], settings: { names: {} } };
  assert.equal(got.hooks.ping(640, -320), true, 'co-op: sent');
  assert.deepEqual(sent, [[640, -320]]);
  net.h[5]({ x: 640, y: -320, by: 'diego' });
  assert.deepEqual(plain(got.pings), [{ x: 640, y: -320, by: 'diego' }]);
});

test("co-op: a teammate whose tab is gone reaches the surface marked away, so they count for nobody's aura or route line", async () => {
  const { got, net, pg } = surfacePage();
  await new Promise(r => setImmediate(r));
  pg.UI.store.room = { mission: pg.mission({ coop: true }), players: [{ crewId: 'minh', connected: true }, { crewId: 'kai', connected: false }, { crewId: null, connected: true }], settings: { names: {} } };
  net.h[2]([{ crewId: 'minh', x: 0, y: 0 }, { crewId: 'kai', x: 640, y: 0 }]);
  assert.deepEqual(plain(got.remote), [[{ crewId: 'minh', x: 0, y: 0, away: false }, { crewId: 'kai', x: 640, y: 0, away: true }]]);
});

test("solo: the surface's walking samples add the tiles walked to the pilot's stats; co-op leaves them to the server", async () => {
  const { got, pg } = surfacePage(), m = pg.mission();
  pg.play(m);
  got.hooks.walk({ x: 0, y: 0, rover: false }, { x: 128, y: 0, rover: false }, 0.5);
  assert.equal(m.expedition.stats.minh.distance, 2);
  await new Promise(r => setImmediate(r));
  const room = { mission: pg.mission({ coop: true }), players: [], settings: { names: {} } };
  pg.UI.store.room = room;
  got.hooks.walk({ x: 0, y: 0, rover: false }, { x: 128, y: 0, rover: false }, 0.5);
  assert.equal(room.mission.expedition.stats.minh, undefined, 'co-op: not here');
  assert.equal(m.expedition.stats.minh.distance, 2);
});

test("solo: a formation's survey opens its real fact with its source, once per formation", () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  if (!pg.I.FORMATION_SOURCES) pg.I.FORMATION_SOURCES = { ventifact: 'bagnold' }; // a stand-in until the words branch brings the real map
  pg.play(m);
  pg.surface.hooks.card({ type: 'formation', id: 'F1,0', kind: 'ventifact' });
  pg.UI.render();
  const card = cardOf(pg), src = pg.I.SOURCES[pg.I.FORMATION_SOURCES.ventifact];
  assert.equal(card.children[0].children[0].textContent, en('disc.formation'));
  assert.deepEqual(card.children.slice(1).map(n => n.textContent), [en('fm.ventifact.name'), en('fm.ventifact.fact'), en('region.source') + ': ' + src.label]);
  click(pg.byKey('region-close'));
  pg.surface.hooks.card({ type: 'formation', id: 'F1,0', kind: 'ventifact' });
  pg.UI.render();
  assert.equal(cardOf(pg), null, 'the same formation, surveyed again in this mission, opens nothing');
});

test("while a repaired weather station forecasts, the top bar also shows next round's weather, in that weather's colours", () => {
  const pg = page(), m = pg.mission({ seed: 'UI-FORECAST' });
  m.schedule[m.turn + 1].weather = 'global';
  const chip = () => { pg.UI.render(); return pg.all().find(n => n.tagName === 'SPAN' && /(^| )fc( |$)/.test(n.className)) || null; };
  pg.play(m);
  assert.equal(chip(), null, 'no station repaired: no forecast');
  m.expedition.forecastUntil = m.turn + 3; // repaired this round (X.interact)
  const c = chip();
  assert.ok(c, 'the forecast chip');
  assert.equal(c.textContent, en('eva.forecast', { w: en('weather.global') }));
  assert.match(c.className, /(^| )crit( |$)/);
  assert.equal(c.attrs.title, en('eva.forecastBy'));
  const pair = pg.all().find(n => n.className === 'wxs'); // stacked: the top bar stays one row at 1280 px in any weather
  assert.deepEqual(pair && pair.children.map(n => n.textContent), [en('weather.' + m.schedule[m.turn].weather), c.textContent],
    "the forecast sits under this round's weather, in one column");
  m.expedition.forecastUntil = m.turn - 1;
  assert.equal(chip(), null, 'the forecast has run out');
});

test('a landmark discovered in a new mission under a code played before opens its card again; a story log read under that code does not', () => {
  const pg = page({ regionsSeen: { key: 'PAINT-QA-1|solo', list: ['L0,1', 'S0,0'] } }), m = pg.mission({ seed: 'PAINT-QA-1' });
  pg.play(m);
  pg.surface.hooks.card({ type: 'log', id: 'S0,0', kind: 'weather' });
  assert.equal(pg.UI.store.card, null, 'the log was read under this code');
  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: 120 });
  assert.equal(pg.UI.store.card && pg.UI.store.card.id, 'L0,1', "the discovery is this mission's");
});

// ---------- the lost card: a card that comes while a log or fact opened less than 8 s ago is still up waits (M4d hud) ----------
// The M4c final review: a hab pod's log was gone when a crewmate discovered a landmark, a formation's fact when a new region came
// into view. The page's timers run on a fake clock here (the page's own ignore the delay), so 7.999 s and 8 s can be told apart.
function clockOf() {
  let now = 0, n = 0;
  const pending = new Map();
  return {
    globals: { setTimeout: (fn, ms) => { pending.set(++n, { at: now + ms, fn }); return n; }, clearTimeout: id => { pending.delete(id); } },
    advance(ms) {
      const end = now + ms;
      for (;;) { // the earliest timer due by then, first set first
        let next = null;
        for (const [id, e] of pending) if (e.at <= end && (!next || e.at < next[1].at)) next = [id, e];
        if (!next) break;
        pending.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
}
const DELTA = (science, by) => ({ type: 'landmark', id: 'L0,1', kind: 'delta', by: by || 'diego', science });
const POD = { type: 'log', id: 'S4,-1', kind: 'pod' }, VENT = { type: 'formation', id: 'F1,0', kind: 'ventifact' };

test("a card that arrives while a log or fact opened less than 8 s ago is still up waits, and opens when the 8 s are over; after that the next one opens at once", () => {
  const clock = clockOf(), pg = page(null, clock.globals);
  pg.play(pg.mission({ seed: 'PAINT-QA-1' }));
  const hooks = pg.surface.hooks, up = () => (pg.UI.store.card ? pg.UI.store.card.id : null);
  hooks.card(POD);
  assert.equal(up(), 'S4,-1', 'nothing up: it opens');
  clock.advance(7999);
  hooks.card(DELTA(null));
  assert.equal(up(), 'S4,-1', "a discovery 7.999 s after the log: the log is not cut short");
  clock.advance(1);
  assert.equal(up(), 'L0,1', 'and at 8 s it opens');
  clock.advance(8000);
  hooks.card(VENT);
  assert.equal(up(), 'F1,0', "the discovery has had its 8 s: a card that comes now opens at once");
  clock.advance(15000);
  assert.equal(up(), null, 'and a card nobody replaces goes after 15 s, as before');
});

test("held cards open in the order they came, each after the one before had its 8 s; a new region's card is held too, and a discovery heard twice while it waits is one card with its reward", () => {
  const clock = clockOf(), pg = page(null, clock.globals), m = pg.mission({ seed: 'PAINT-QA-1' });
  pg.play(m);
  const hooks = pg.surface.hooks, up = () => (pg.UI.store.card ? pg.UI.store.card.id : null);
  hooks.card(POD);
  clock.advance(2000);
  hooks.card(DELTA(null));
  hooks.enterRegion('icy');
  hooks.card(DELTA(120));
  hooks.card(VENT);
  hooks.card(POD);
  hooks.enterRegion('icy');
  assert.deepEqual([up(), plain(pg.UI.store.regionsSeen.list)], ['S4,-1', ['S4,-1', 'icy', 'F1,0']], 'the log is up; the others wait, each marked read when it came, the log and the region only once');
  assert.deepEqual(plain(m.expedition.regions), ['icy'], 'a region you walked into is recorded at once, whatever the card does');
  clock.advance(6000);
  assert.equal(up(), 'L0,1', 'first the discovery');
  assert.equal(pg.UI.store.card.science, 120, 'with the reward the second copy brought');
  clock.advance(8000);
  assert.deepEqual([up(), pg.UI.store.card.type], ['icy', 'region']);
  clock.advance(8000);
  assert.equal(up(), 'F1,0');
  clock.advance(15000);
  assert.equal(up(), null);
});

test("closing the card up opens the one that waits at once; a card the player asks for again replaces the one up, and starts its own 8 s", () => {
  const clock = clockOf(), pg = page(null, clock.globals);
  pg.play(pg.mission({ seed: 'PAINT-QA-1' }));
  const hooks = pg.surface.hooks, up = () => (pg.UI.store.card ? pg.UI.store.card.id : null);
  const close = () => { pg.UI.render(); click(pg.byKey('region-close')); }; // the card's × button, as drawn now
  hooks.card(POD);
  hooks.card(DELTA(null));
  hooks.card(VENT);
  clock.advance(3000);
  close();
  assert.equal(up(), 'L0,1', 'the log was put away at 3 s: the discovery comes now, not at 8 s');
  close();
  assert.equal(up(), 'F1,0', 'and so on');
  close();
  assert.equal(up(), null, 'nothing waits: nothing opens');
  hooks.card({ type: 'log', id: 'S0,0', kind: 'weather' });
  assert.equal(up(), 'S0,0', 'and nothing keeps a new card from opening');
  clock.advance(1000);
  hooks.reopenRegion('plains');
  assert.deepEqual([up(), pg.UI.store.card.again], ['plains', true], 'the region name was selected: the card it asked for replaces the log at once');
  clock.advance(8000);
  hooks.reopenRegion('dunes');
  hooks.card(DELTA(null));
  assert.equal(up(), 'dunes', 'a card the player asked for is a card of its own to read: a discovery waits for it');
  clock.advance(8000);
  assert.equal(up(), 'L0,1');
});

test("a card is not replaced while the player is reading it, the mouse on it or the focus in it; and what waited for a mission that is over is dropped", () => {
  const clock = clockOf(), pg = page(null, clock.globals);
  pg.play(pg.mission({ seed: 'PAINT-QA-1' }));
  const hooks = pg.surface.hooks, up = () => (pg.UI.store.card ? pg.UI.store.card.id : null);
  let hover = true;
  pg.win.matchMedia = () => ({ matches: true });
  pg.win.document.querySelector = sel => (sel === '.region-card' ? { matches: q => q === ':hover' && hover, contains: () => false } : null);
  hooks.card(POD);
  hooks.card(DELTA(null));
  clock.advance(30000);
  assert.equal(up(), 'S4,-1', 'the mouse is on the log: it stays, and so does the one that waits');
  hover = false;
  clock.advance(8000);
  assert.equal(up(), 'L0,1', 'the mouse moved off: the discovery opens when the next 8 s are over');
  hooks.card(VENT);
  Object.assign(pg.UI.store, { mission: null, screen: 'title' }); // the mission is over before the 8 s are
  clock.advance(8000);
  assert.notEqual(up(), 'F1,0', "a card of a mission that is over does not open in the next");
});

// ---------- expedition goals (src/goals.js, M4d) ----------

test("solo: a new mission starts with round 1's goal; the advance judges the goals from the mission, pays the done ones and picks the next round's", () => {
  const pg = page();
  Object.assign(pg.UI.store, { loadout: pg.E.referenceKit('commander', 4), seed: 'UI-GOALS', screen: 'pilot' });
  pg.UI.render();
  click(pg.byKey('pilot:minh'));
  const m = pg.UI.store.mission;
  assert.equal(m.expedition.goals.length, 1, "round 1's goal, picked as the mission starts");
  assert.deepEqual(plain(m.expedition.goals), plain(pg.G.pick(pg.mission({ seed: 'UI-GOALS' }))), 'the goal the rules pick for this mission code');
  m.expedition.goals = [Object.assign(pg.G.make(m, 'landmark'), { id: 'G0:0' })];
  m.expedition.landmarks['L1,0'] = { by: 'minh', round: 0 }; // discovered: nobody has judged the goal yet
  pg.play(m);
  const science = m.science;
  pg.surface.hooks.advance();
  const s = pg.UI.store.mission;
  assert.deepEqual(plain(pg.UI.store.report.expedition.goals), [{ id: 'G0:0', kind: 'landmark', params: {}, reward: { science: 25 } }]);
  assert.ok(s.science >= science + 25, 'its science is paid');
  assert.deepEqual(plain(s.expedition.goalsDone), [{ id: 'G0:0', kind: 'landmark', round: 0, params: {} }]);
  assert.deepEqual(plain(s.expedition.goals.map(g => g.id)), ['G1:0'], "round 2's goal");
  pg.flush();
  assert.deepEqual(JSON.parse(pg.ls['sol500.save']).mission.expedition.goals.map(g => g.id), ['G1:0'], 'and the save has it');
});

// ---------- goals in the HUD and the console (M4d hud) ----------
const expPanel = pg => pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('eva.title'));
const goalRows = pg => { pg.UI.render(); return walk(expPanel(pg), []).filter(n => n.tagName === 'LI' && /(^| )goal( |$)/.test(n.className)); };
const withGoals = (pg, m, kinds) => { m.expedition.goals = kinds.map((k, i) => Object.assign(pg.G.make(m, k), { id: 'G0:' + i })); return m; };

test("the surface's goals hook lists this round's goals as { text, done, frac }; solo play brings their progress up to date first", () => {
  const pg = page(), m = withGoals(pg, pg.mission({ seed: 'UI-GOALHUD' }), ['chunks', 'landmark']);
  pg.play(m);
  const goals = () => plain(pg.surface.hooks.goals());
  assert.deepEqual(goals(), [
    { text: en('goal.withProgress', { goal: en('goal.chunks', { n: 4 }), p: 0, n: 4 }), done: false, frac: 0 },
    { text: en('goal.landmark'), done: false, frac: 0 },
  ]);
  m.expedition.landmarks['L1,0'] = { by: 'minh', round: 0 }; // discovered since the pick: nobody has judged the goal yet
  assert.deepEqual(goals()[1], { text: en('goal.landmark'), done: true, frac: 1 }, 'the hook asks the rules for the progress');
  m.status = 'lost';
  assert.deepEqual(goals(), [], 'no goals once the mission is over');
});

test("co-op: the goals come from the room's frame as the server judged them; a tab never runs the progress itself", () => {
  const pg = page(), m = withGoals(pg, pg.mission({ seed: 'UI-GOALCOOP', coop: true }), ['chunks']);
  m.expedition.goals[0].progress = 3; // the server saw three new chunks; this tab's own fog map is empty and would say 0
  pg.play(pg.mission({ seed: 'UI-GOALCOOP' })); // the surface mounts, and its hooks are the ones to ask
  Object.assign(pg.UI.store, { lan: { code: 'ABCD' }, room: { mission: m, players: [], settings: { names: {} } } });
  assert.deepEqual(plain(pg.surface.hooks.goals()), [{ text: en('goal.withProgress', { goal: en('goal.chunks', { n: 4 }), p: 3, n: 4 }), done: false, frac: 0.75 }]);
  assert.equal(m.expedition.goals[0].progress, 3, 'and the number is left as the server sent it');
});

test('the Expedition panel names a beacon kit in a backpack as it names a load, never by its key', () => {
  const pg = page(), m = pg.mission({ seed: 'UI-KITPACK' });
  m.expedition.carried = { minh: [pg.E.kitItem(), { kind: 'metal', id: 'x', region: 0, res: 'materials', amount: 40 }] };
  pg.play(m);
  const text = expPanel(pg).textContent;
  assert.ok(!text.includes('haul.kit'), text);
  assert.ok(text.includes('+1 relay beacon kit' + ', ' + en('haul.materials', { n: 40 })), text);
});

test("the Expedition panel lists this round's goals with their progress and reward, and ticks the done ones", () => {
  const pg = page(), m = withGoals(pg, pg.mission({ seed: 'UI-GOALPANEL' }), ['chunks', 'landmark', 'haul']);
  pg.play(m);
  let rows = goalRows(pg);
  assert.equal(rows.length, 3);
  assert.ok(expPanel(pg).textContent.includes(en('goal.title')));
  assert.ok(rows[0].textContent.includes(en('goal.chunks', { n: 4 })) && rows[0].textContent.includes(en('goal.progress', { p: 0, n: 4 })), rows[0].textContent);
  assert.ok(rows[0].textContent.includes(en('goal.reward', { list: en('haul.science', { n: 15 }) })), 'what it pays');
  assert.ok(rows[1].textContent.includes(en('goal.reward', { list: en('haul.science', { n: 25 }) })));
  assert.ok(rows[2].textContent.includes(en('goal.haul', { n: 4 })) && rows[2].textContent.includes(en('goal.rewardHaul', { pct: 25 })), 'a haul pays a share of what its loads give: nothing hauled yet');
  assert.ok(rows.every(r => !/(^| )done( |$)/.test(r.className)));
  m.expedition.landmarks['L1,0'] = { by: 'minh', round: 0 };
  m.expedition.banked.lines.push({ crewId: 'minh', kind: 'ice', res: 'water', region: 0, amount: 160, loads: 4, late: false }); // 4 loads of ice delivered this round
  rows = goalRows(pg);
  assert.match(rows[1].className, /(^| )done( |$)/, 'a landmark found');
  assert.ok(rows[1].textContent.includes(en('goal.done')));
  assert.match(rows[2].className, /(^| )done( |$)/, 'four loads hauled');
  assert.ok(rows[2].textContent.includes(en('goal.reward', { list: en('haul.water', { n: 40 }) })), 'a quarter of the 160 kg');
  assert.doesNotMatch(rows[0].className, /(^| )done( |$)/);
});

test("solo: the Expedition panel's goals follow progress that comes with no action, new ground in the fog or a region walked into, at the HUD's next look, and are redrawn only when it moved", () => {
  const pg = page(), m = withGoals(pg, pg.mission({ seed: 'UI-GOALFOLLOW' }), ['chunks', 'region']);
  pg.play(m);
  const F = pg.win.SolFog, W = pg.win.SolWorldgen, bits = F.empty();
  F.set(bits, 3, 3);
  const fog = F.encode(bits), hq = W.REGIONS[W.regionAt(W.seedOf(m.seed), 0, 0)];
  const fresh = W.REGIONS.find(r => r !== hq && !m.expedition.regions.includes(r));
  const rows = () => walk(expPanel(pg), []).filter(n => n.tagName === 'LI' && /(^| )goal( |$)/.test(n.className)); // as drawn: no render() here
  const look = () => pg.surface.hooks.goals(); // the HUD asks twice a second
  assert.ok(rows()[0].textContent.includes(en('goal.progress', { p: 0, n: 4 })), rows()[0].textContent);
  const drawn = rows()[0];
  look();
  assert.equal(rows()[0], drawn, 'nothing moved: the list is not drawn again');
  pg.surface.hooks.reveal({ '5,5': fog, '6,5': fog, '7,5': fog, '8,5': fog }); // the walk opens four new areas: no action, no render
  look();
  assert.ok(rows()[0].textContent.includes(en('goal.progress', { p: 4, n: 4 })), rows()[0].textContent);
  assert.match(rows()[0].className, /(^| )done( |$)/);
  assert.ok(rows()[0].textContent.includes(en('goal.done')), 'it pays out when the round advances');
  assert.doesNotMatch(rows()[1].className, /(^| )done( |$)/);
  pg.surface.hooks.enterRegion(fresh);
  look();
  assert.match(rows()[1].className, /(^| )done( |$)/, 'a kind of region the crew had not been in');
  assert.ok(rows()[1].textContent.includes(en('goal.done')));
});

test('a goal is told in plain words for every kind, in both languages, with its numbers', () => {
  const kinds = Object.keys(require('../src/data.js').GOALS.kinds);
  for (const lang of ['en', 'vi']) {
    for (const k of kinds) assert.ok(I.STR[lang]['goal.' + k], lang + ' goal.' + k);
  }
  assert.match(I.STR.vi['goal.survey'], /\{tiles\}/);
  assert.match(I.STR.vi['goal.beacon'], /\{tiles\}/);
  assert.match(I.STR.vi['goal.chunks'], /\{n\}/);
  assert.match(I.STR.vi['goal.haul'], /\{n\}/);
});

// ---------- the round report: goals, beacon kits, the last backpack (M4d hud) ----------
const reportLines = (pg, report) => {
  Object.assign(pg.UI.store, { report, modal: 'report' });
  pg.UI.render();
  return walk(pg.dialog(), []).filter(n => n.tagName === 'LI').map(n => n.textContent);
};

test('the round report lists each goal that paid out with its reward, and says when beacon kits wait at the base', () => {
  const pg = page(), m = withGoals(pg, pg.mission({ seed: 'UI-REPGOAL' }), ['landmark', 'beacon']);
  m.expedition.landmarks['L1,0'] = { by: 'minh', round: 0 };
  m.expedition.beacons.push({ x: 40, y: 0, by: 'minh', round: 0 }); // 40 tiles out: past the 35 that round 1's beacon goal asks
  const { state, report } = pg.G.advance(m, pg.E.defaultPlan(m));
  pg.play(state);
  const lines = reportLines(pg, report);
  assert.ok(lines.includes(en('rep.goal', { goal: en('goal.landmark'), reward: en('haul.science', { n: 25 }) })), lines.join(' | '));
  assert.ok(lines.includes(en('rep.goal', { goal: en('goal.beacon', { tiles: 35 }), reward: en('goal.kits', { n: 1 }) })));
  assert.ok(lines.includes(en('rep.kits', { n: 1 })), 'the goal paid a kit: it waits at the base');
});

test('the round report names a beacon kit that was started and finished, and the kits waiting; a round with no kit and no goal has no such line', () => {
  const pg = page(), m = pg.mission({ seed: 'UI-REPKIT' }), plan = pg.E.defaultPlan(m);
  plan.jobs.lena = 'construction'; // the engineer's 1.5 points finish a kit in the round
  plan.builds = [{ type: 'kit' }];
  let { state, report } = pg.G.advance(m, plan);
  pg.play(state);
  let lines = reportLines(pg, report);
  assert.ok(lines.includes(en('rep.started', { list: en('mod.kit') })), lines.join(' | '));
  assert.ok(lines.includes(en('rep.completed', { list: en('mod.kit') })));
  assert.ok(lines.includes(en('rep.kits', { n: 1 })));
  ({ state, report } = pg.G.advance(state, pg.E.nextPlan(state, plan)));
  pg.play(state);
  lines = reportLines(pg, report);
  assert.ok(!lines.some(l => l === en('rep.kits', { n: 1 })), 'nothing new this round');
});

test("the last round's backpack is banked at the final advance, and the report lists it in the banked lines' words", () => {
  const pg = page(), m = Object.assign(pg.mission({ seed: 'UI-LAST' }), { turn: 19, sol: 475 });
  m.expedition.carried = { lena: [{ kind: 'ice', id: 'x', region: 4, res: 'water', amount: 40 }, pg.E.kitItem()] };
  const { state, report } = pg.G.advance(m, pg.E.defaultPlan(m));
  assert.equal(state.status, 'success');
  pg.play(state);
  const lines = reportLines(pg, report);
  assert.ok(lines.includes(en('rep.haulLate', { amount: en('haul.water', { n: 40 }), what: en('find.ice'), region: en('region.icy'), name: en('name.lena') })), lines.join(' | '));
  assert.ok(!lines.some(l => l === en('rep.kits', { n: 1 })), 'a kit carried home at the end is no news');
});

// ---------- the build panel's relay beacon kit (M4d hud) ----------
const consoleOf = (pg, m) => { Object.assign(pg.UI.store, { mission: m, plan: pg.E.defaultPlan(m), screen: 'ops', opsView: 'console', modal: null }); pg.UI.render(); };

test("the build panel has a button of its own for the relay beacon kit: its cost, what a beacon does, the Mars Relay Network line, and how many are placed, waiting and out", () => {
  const pg = page(), m = pg.mission({ seed: 'UI-KIT' }), B = require('../src/data.js').EXPEDITION.beacon;
  Object.assign(m.expedition, { beacons: [{ x: 20, y: 0, by: 'lena', round: 0 }], kits: 2, carried: { minh: [pg.E.kitItem()] } });
  consoleOf(pg, m);
  const btn = pg.byKey('bld:kit');
  assert.ok(btn, 'the kit has a button (it is not in BUILD_ORDER, so the palette does not make one)');
  assert.ok(btn.textContent.includes(en('mod.kit')) && btn.textContent.includes(en('bld.cost', { kg: 50, w: 1.5 })), btn.textContent);
  assert.equal(btn.attrs.disabled, undefined, 'there are materials and room for one more');
  assert.equal(btn.attrs.title, [en('bld.kit', B), en('bld.kitReal')].join('\n'), 'what a beacon does, then the real network (sources.md B), word for word');
  assert.equal(en('bld.kitReal'), 'Real Mars rovers send most of their data to Earth through orbiters overhead, called the Mars Relay Network; the ground beacons in this game are fictional.');
  const panel = pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('panel.build'));
  assert.ok(panel.textContent.includes(en('bld.kitStatus', { placed: 1, max: 6, kits: 2, out: 1 })), '1 of 6 placed, 2 at the base, 1 in a backpack');
  click(btn);
  assert.deepEqual(plain(pg.UI.store.plan.builds).map(b => b.type), ['kit'], 'it is queued as the shield is, with no tile to pick');
  assert.equal(pg.UI.store.buildType, null);
  const queue = pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('panel.build')).textContent;
  assert.ok(queue.includes(en('bld.queue')) && queue.includes(en('mod.kit') + ' −50 kg'), 'in the queue under its name and cost');
});

test('the kit button is off, with the reason and still the network line, when materials are short or all six beacons are accounted for', () => {
  const pg = page(), m = pg.mission({ seed: 'UI-KIT2' });
  m.resources.materials = 10;
  consoleOf(pg, m);
  assert.equal(pg.byKey('bld:kit').attrs.disabled, '', 'not enough materials');
  assert.equal(pg.byKey('bld:kit').attrs.title, [en('bld.why.materials'), en('bld.kitReal')].join('\n'));
  m.resources.materials = 900;
  m.expedition.kits = 6;
  consoleOf(pg, m);
  assert.equal(pg.byKey('bld:kit').attrs.disabled, '', 'all six');
  assert.equal(pg.byKey('bld:kit').attrs.title, [en('bld.why.maxKit', { max: 6 }), en('bld.kitReal')].join('\n'));
});

test('a kit under construction shows in the projects list by its name', () => {
  const pg = page(), m = pg.mission({ seed: 'UI-KIT3' });
  m.projects.push({ type: 'kit', x: null, y: null, progress: 0.5, work: 1.5 });
  consoleOf(pg, m);
  const text = pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('panel.build')).textContent;
  assert.ok(text.includes(en('bld.projects')) && text.includes(en('mod.kit')) && text.includes(en('bld.progress', { p: '0.5', w: '1.5' })), text);
});

test('the kit and its lines have strings in both languages, and the English one repeats the research agent\'s line exactly', () => {
  for (const lang of ['en', 'vi']) {
    for (const k of ['mod.kit', 'bld.kit', 'bld.kitReal', 'bld.kitStatus', 'bld.why.maxKit', 'rep.goal', 'rep.kits']) assert.ok(I.STR[lang][k], lang + ' ' + k);
    assert.match(I.STR[lang]['bld.kitStatus'], /\{placed\}.*\{max\}.*\{kits\}.*\{out\}/, lang);
  }
  assert.notEqual(I.STR.vi['bld.kitReal'], I.STR.en['bld.kitReal'], 'translated');
});

// ---------- the debrief's Expedition section (M4d hud) ----------
const { finishedMission } = require('./helpers/missions.js');
const debrief = (pg, m) => { Object.assign(pg.UI.store, { mission: m, plan: null, screen: 'debrief', modal: null, report: null }); pg.UI.render(); return pg; };
const expSection = pg => pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('deb.expedition')) || null;
const explored = () => {
  const m = finishedMission('DEB-X');
  Object.assign(m.expedition, {
    regions: ['plains', 'icy', 'dunes'], landmarks: { 'L0,1': { by: 'lena', round: 2 } }, structures: { 'S0,0': 'repaired', 'S-1,0': 'used' },
    beacons: [{ x: 14, y: 0, by: 'minh', round: 1 }, { x: 30, y: 5, by: 'lena', round: 3 }],
    goalsDone: [{ id: 'G0:0', kind: 'haul', round: 0, params: { loads: 4 } }],
    stats: {
      lena: { finds: { ice: 3, science: 2 }, distance: 412.6, flareCover: 2 },
      minh: { finds: { metal: 1 }, distance: 88.2, flareHit: 1, flareCover: 1 },
    },
    bestFind: { crewId: 'lena', kind: 'landmark', res: 'science', amount: 132, region: 0 },
  });
  return m;
};

test('a mission that never explored has no Expedition section in its debrief', () => {
  const pg = debrief(page(), finishedMission('DEB-0'));
  assert.equal(expSection(pg), null);
  assert.ok(pg.all().some(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('deb.crew')), 'the rest of the debrief is there');
  const around = finishedMission('DEB-1');
  around.expedition.regions = ['plains']; // standing in the HQ\'s own region is not exploring
  assert.equal(expSection(debrief(page(), around)), null);
});

test("the debrief's Expedition section shows distance and finds for each astronaut, the most valuable find, the counts and who a flare caught", () => {
  const pg = debrief(page(), explored());
  const sec = expSection(pg), text = sec.textContent;
  const rows = walk(sec, []).filter(n => n.tagName === 'TR').map(tr => tr.children.map(td => td.textContent));
  assert.deepEqual(rows[0], [en('deb.crew'), en('deb.exp.walked'), en('deb.exp.found')], 'the header');
  assert.deepEqual(rows[1], [en('name.lena'), '413 ' + en('eva.tiles'), '5 (' + en('find.ice') + ' ×3 · ' + en('find.science') + ' ×2)']);
  assert.deepEqual(rows[2], [en('name.minh'), '88 ' + en('eva.tiles'), '1 (' + en('find.metal') + ' ×1)']);
  assert.equal(rows.length, 3, 'crew who did nothing outside have no row');
  assert.ok(text.includes(en('deb.exp.best') + ': ' + en('rep.haul', { amount: en('haul.science', { n: 132 }), what: en('find.landmark'), region: en('region.plains'), name: en('name.lena') })), text);
  for (const [k, n] of [['regions', 3], ['landmarks', 1], ['structures', 2], ['beacons', 2], ['goals', 1]]) assert.ok(text.includes(en('deb.exp.' + k, { n })), k);
  assert.ok(text.includes(en('deb.exp.flares', { n: 2 })));
  assert.ok(text.includes(en('deb.exp.flareHit', { d: 15, list: en('name.minh') + ' ×1' })), 'whom the flare caught');
  assert.ok(text.includes(en('deb.exp.flareCover', { list: en('name.lena') + ' ×2, ' + en('name.minh') + ' ×1' })), 'who was not');
});

test("the debrief's walked column says 1 tile, not 1 tiles, and 2 tiles; Vietnamese has the one word for both", () => {
  const m = explored();
  m.expedition.stats = { lena: { finds: {}, distance: 1.2 }, minh: { finds: {}, distance: 2 } };
  const rows = walk(expSection(debrief(page(), m)), []).filter(n => n.tagName === 'TR').slice(1).map(tr => tr.children.map(td => td.textContent).slice(0, 2));
  assert.deepEqual(rows.sort(), [[en('name.lena'), '1 tile'], [en('name.minh'), '2 tiles']].sort());
  assert.equal(I.STR.vi['eva.tiles1'], I.STR.vi['eva.tiles']);
});

test('the Expedition section leaves out what is empty: no table without a walk, no best find, no flare lines, no zero counts', () => {
  const m = finishedMission('DEB-2');
  m.expedition.landmarks = { 'L0,1': { by: 'lena', round: 2 } };
  m.expedition.stats = {}; // the default plan's 20 rounds counted the flares everyone was safe from; clear them
  const sec = expSection(debrief(page(), m));
  assert.ok(sec, 'one landmark is exploring');
  assert.deepEqual(walk(sec, []).filter(n => n.tagName === 'TABLE'), []);
  assert.equal(sec.textContent, en('deb.expedition') + en('deb.exp.landmarks', { n: 1 }), 'the title and the one count');
  const flat = finishedMission('DEB-3');
  flat.expedition.stats = { lena: { finds: {}, distance: 40.4, flareCover: 3 } };
  const t = expSection(debrief(page(), flat)).textContent;
  assert.ok(t.includes(en('deb.exp.flares', { n: 3 })) && t.includes(en('deb.exp.flareCover', { list: en('name.lena') + ' ×3' })));
  assert.ok(!t.includes(en('deb.exp.flareHit', { d: 15, list: '' }).split(':')[0]), 'nobody was caught: no such line');
});

test("under the score table, a mission whose map science counts says it counts a tenth of itself up to 55 points, what it found and what counted; one with none, or a lost one, says nothing (R24)", () => {
  const M = require('../src/data.js').SCORE.map;
  const m = finishedMission('DEB-SC');
  Object.assign(m, { status: 'success', science: 1121.5 });
  m.expedition.science = 444; // the browser pass's mission
  const pg = debrief(page(), m);
  const hint = () => {
    const sec = pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('deb.score'));
    return { row: walk(sec, []).find(n => n.tagName === 'TR').textContent, lines: walk(sec, []).filter(n => n.tagName === 'P').map(n => n.textContent) };
  };
  const line = (found, counted) => en('sc.mapHint', { pct: Math.round(M.share * 100), cap: M.cap, found, counted });
  assert.deepEqual(hint(), { row: en('sc.science') + '+722', lines: [line(444, 44)] }, 'the row is 677.5 of the base\'s and 44.4 of the map\'s');
  Object.assign(m, { science: 2709 });
  m.expedition.science = 2135;
  pg.UI.render();
  assert.deepEqual(hint().lines, [line('2,135', 55)], 'past the cap');
  m.expedition.science = 0;
  pg.UI.render();
  assert.deepEqual(hint().lines, [], 'no map science: no line');
  m.expedition.science = 444;
  m.status = 'lost';
  pg.UI.render();
  assert.deepEqual(hint().lines, [], 'a lost mission halves all its science: no line');
});

// Review Focus (M4d): a goal met in round 20 is paid at the final advance (G.advance → E.resolveTurn → payGoals), once.
test("solo: a goal met in the last round is paid at the final advance, once: the report lists it, goalsDone keeps it, the debrief counts it and its science reaches the score", () => {
  const Dat = require('../src/data.js'), pg = page(), m = pg.mission({ seed: 'UI-LASTGOAL' });
  Object.assign(m, { turn: Dat.TURNS - 1, sol: (Dat.TURNS - 1) * Dat.TURN_SOLS });
  m.expedition.goals = [Object.assign(pg.G.make(m, 'landmark'), { id: 'G19:0' })];
  m.expedition.landmarks['L1,0'] = { by: 'minh', round: Dat.TURNS - 1 }; // discovered in round 20: nobody has judged the goal yet
  pg.play(m);
  const twin = plain(m);
  twin.expedition.goals = [];
  const without = pg.G.advance(twin, pg.E.defaultPlan(twin)).state; // the same last round, with no goal
  pg.surface.hooks.advance();
  const s = pg.UI.store.mission;
  assert.equal(s.status, 'success');
  assert.deepEqual(plain(pg.UI.store.report.expedition.goals), [{ id: 'G19:0', kind: 'landmark', params: {}, reward: { science: 25 } }], 'paid at the final advance');
  assert.deepEqual(plain(s.expedition.goalsDone), [{ id: 'G19:0', kind: 'landmark', round: Dat.TURNS - 1, params: {} }], 'kept, once');
  assert.deepEqual([s.science - without.science, s.expedition.science - without.expedition.science], [25, 25], 'its reward, once, as science from the map');
  const sc = pg.E.scoreMission(s), sc0 = pg.E.scoreMission(without);
  assert.ok(sc.parts.science > sc0.parts.science && sc.total - sc0.total === sc.parts.science - sc0.parts.science, 'it reaches the score');
  assert.ok(expSection(pg).textContent.includes(en('deb.exp.goals', { n: 1 })), "the debrief's Goals completed");
});

test("a debrief survives an expedition state a hand-edited save left odd: junk stats, finds and best find are skipped, not drawn", () => {
  const m = finishedMission('DEB-4');
  m.expedition.stats = { lena: { finds: { gold: 5, ice: 'x', metal: 2 }, distance: 'far', flareHit: -1 }, minh: 'x', diego: { finds: [1] } };
  m.expedition.bestFind = { crewId: 'lena', kind: 'landmark', res: 'science', amount: 'lots', region: 0 };
  m.expedition.regions = 'plains';
  const sec = expSection(debrief(page(), m));
  assert.ok(sec.textContent.includes('2 (' + en('find.metal') + ' ×2)'));
  assert.ok(!sec.textContent.includes('gold') && !sec.textContent.includes(en('deb.exp.best')));
});

test('the Expedition section has its strings in both languages', () => {
  for (const lang of ['en', 'vi']) {
    for (const k of ['expedition', 'exp.walked', 'exp.found', 'exp.best', 'exp.regions', 'exp.landmarks', 'exp.structures', 'exp.beacons', 'exp.goals', 'exp.flares', 'exp.flareHit', 'exp.flareCover']) assert.ok(I.STR[lang]['deb.' + k], lang + ' deb.' + k);
    for (const k of ['exp.regions', 'exp.landmarks', 'exp.structures', 'exp.beacons', 'exp.goals', 'exp.flares']) assert.match(I.STR[lang]['deb.' + k], /\{n\}/, lang + ' ' + k);
    assert.match(I.STR[lang]['deb.exp.flareHit'], /\{d\}.*\{list\}|\{list\}.*\{d\}/, lang);
  }
});

// ---------- the ISRU lesson (M4d hud; the text is .superpowers/sdd/m4d/sources.md A, word for word) ----------
const ISRU = [
  'ISRU, or in-situ resource utilization, means making what astronauts need from local materials instead of bringing large quantities from Earth.',
  "MOXIE, an experiment on NASA's Perseverance rover, made 122 grams of oxygen from the carbon dioxide in Mars's thin air in 16 runs between 2021 and 2023.",
  'At its best it made 12 grams of oxygen an hour, at 98% purity or better.',
  "Water ice lies underground across Mars's mid-latitudes; crews could harvest it for drinking water, or split it into hydrogen and oxygen for rocket fuel and breathable air.",
  'In the game, the ice and metal you haul home are ISRU too: supplies found on Mars, not launched from Earth.',
];
const lessonCards = pg => pg.all().filter(n => n.tagName === 'ARTICLE' && /(^| )lesson( |$)/.test(n.className));
const isruCard = pg => lessonCards(pg).find(n => n.children[0].textContent === en('lesson.isruMars.title')) || null;

test("a mission that explored learns the ISRU lesson in its debrief: NASA's five sentences as researched, with the sources they rest on", () => {
  assert.equal(en('lesson.isruMars.body'), ISRU.join(' '), 'word for word');
  assert.equal(ISRU.join(' ').split(/\s+/).length, 111, 'the 111 words the research agent counted');
  const card = isruCard(debrief(page(), explored()));
  assert.ok(card, 'the lesson is there');
  assert.equal(card.children[1].textContent, ISRU.join(' '));
  assert.deepEqual(walk(card, []).filter(n => n.tagName === 'A').map(a => a.attrs.href), [
    'https://www.nasa.gov/overview-in-situ-resource-utilization/',
    'https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/',
    'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/',
    'https://www.jpl.nasa.gov/news/nasas-treasure-map-for-water-ice-on-mars',
    'https://science.nasa.gov/solar-system/moon/nasas-lro-lunar-ice-deposits-are-widespread/',
    'https://www.nasa.gov/directorates/stmd/space-tech-research-grants/producing-methane-and-oxygen-on-mars-using-proton-conducting-ceramics/',
  ]);
  assert.equal(isruCard(debrief(page(), finishedMission('DEB-5'))), null, 'a mission that never explored does not get it');
});

test('a debrief that already has four lessons gives the ISRU one the last place', () => {
  const m = explored();
  Object.assign(m, { status: 'lost', endCause: { reason: 'hypoxia', sol: 120 } });
  m.log[0].weather = 'global';
  m.log[0].solarShare = 0.9; // the solar storm lesson
  m.crew[0].dose = 600;      // radiation
  const titles = lessonCards(debrief(page(), m)).map(n => n.children[0].textContent);
  assert.equal(titles.length, 4);
  assert.ok(titles.includes(en('lesson.storm_solar.title')) && titles.includes(en('lesson.o2.title')), titles.join(' | '));
  assert.equal(titles[3], en('lesson.isruMars.title'));
});

// ---------- the Science note: every fact and story log found this mission, with its source (M4d hud) ----------
// Seed PAINT-QA-1: deltas (landmarks L0,1 and L0,2), a ventifact with a science site (F1,0), a weather station (S0,0), supply
// caches (S-1,0 and S1,3) and abandoned hab pods (S4,-1, S-3,-5) lie near the HQ; there is no landmark at L1,1, no structure at
// S5,5, no formation in chunk (9,9), and the formation in chunk (2,0) (F2,0) has no survey.
const notesOf = (pg) => { Object.assign(pg.UI.store, { modal: 'notes' }); pg.UI.render(); return pg.dialog(); };
const foundNote = d => walk(d, []).find(n => n.tagName === 'ARTICLE' && /(^| )found( |$)/.test(n.className)) || null;
const foundItems = d => walk(foundNote(d), []).filter(n => n.tagName === 'LI');
const titleOf = li => walk(li, []).find(n => n.tagName === 'B').textContent;
const linksOf = n => walk(n, []).filter(a => a.tagName === 'A').map(a => [a.attrs.href, a.textContent]);

test('an opened entry of the Science note stays open, with its focus key, when the screen redraws, as co-op does on every frame (R29)', () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  m.expedition.regions = ['plains', 'icy'];
  pg.play(m);
  const entries = d => foundItems(d).map(li => li.children[0]);
  const toggle = (n, open) => { n.open = open; n.listeners.toggle[0]({ target: n, currentTarget: n }); };
  toggle(entries(notesOf(pg))[1], true);
  pg.UI.render();
  const shown = entries(pg.dialog());
  assert.deepEqual(shown.map(n => 'open' in n.attrs), [false, true]);
  assert.equal(shown[1].children[0].attrs['data-k'], 'found:region:icy');
  toggle(shown[1], false);
  pg.UI.render();
  assert.deepEqual(entries(pg.dialog()).map(n => 'open' in n.attrs), [false, false], 'and closed stays closed');
});

test("the Science note lists every fact and story log the mission found with its source: regions, landmarks, formations surveyed, structures used, then the hab pods visited", () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  Object.assign(m.expedition, {
    regions: ['plains', 'icy'], landmarks: { 'L0,1': { by: 'minh', round: 2 } }, sites: { 'F1,0:0': 0, '4,4:0': 1 },
    structures: { 'S0,0': 'repaired', 'S-1,0': 'used' }, stats: { lena: { finds: {}, pods: 1 } },
  });
  pg.play(m);
  const d = notesOf(pg), items = foundItems(d);
  const src = key => pg.I.SOURCES[key], link = key => [[src(key).url, src(key).label]];
  assert.equal(foundNote(d).children[0].textContent, en('notes.found'));
  assert.deepEqual(items.map(titleOf), [
    en('region.plains'), en('region.icy'), en('lm.delta.name'), en('fm.ventifact.name'), en('ks.weather.name'), en('ks.cache.name'), en('ks.pod.name'),
  ], 'in the order the mission found them, hab pods last; a find that is no formation (4,4:0) is no entry');
  assert.deepEqual(linksOf(items[0]), link('jezero').concat(link('marsNames')), 'a region fact: its real place, and for the Plains the page that says what Jezero means');
  assert.deepEqual(linksOf(items[1]), link(pg.I.REGION_SOURCES.icy));
  assert.deepEqual(linksOf(items[2]), link(pg.I.LANDMARK_SOURCES.delta));
  assert.deepEqual(linksOf(items[3]), link(pg.I.FORMATION_SOURCES.ventifact));
  for (const i of [4, 5, 6]) {
    assert.deepEqual(linksOf(items[i]), [], 'a Kestrel log is fiction: no source');
    assert.ok(items[i].textContent.includes(en('ks.label')), 'and it says so');
  }
  assert.ok(items[0].textContent.includes(en('region.fact.plains')) && items[0].textContent.includes(en('region.note')), 'the fact, under a heading that says it is a note');
  assert.ok(items[2].textContent.includes(en('lm.delta.fact')) && items[2].textContent.includes(en('disc.by', { name: en('name.minh') })), 'the fact, and who found the landmark');
  assert.ok(items[3].textContent.includes(en('fm.ventifact.fact')));
  assert.ok(items[6].textContent.includes(en('ks.pod.log')), 'the log itself, to read again');
  pg.UI.store.lang = 'vi';
  pg.UI.render();
  assert.equal(foundNote(pg.dialog()).children[0].textContent, I.t('vi', 'notes.found'), 'and in Vietnamese');
  assert.ok(foundItems(pg.dialog())[6].textContent.includes(I.t('vi', 'ks.pod.log')));
});

test("each entry of the found list is a closed <details>: its summary is the card's eyebrow, title and meta, and the fact or log and its source open under it (R29)", () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  Object.assign(m.expedition, { regions: ['plains'], landmarks: { 'L0,1': { by: 'minh', round: 2 } }, structures: { 'S0,0': 'repaired' } });
  pg.play(m);
  const items = foundItems(notesOf(pg)), src = key => [[pg.I.SOURCES[key].url, pg.I.SOURCES[key].label]];
  assert.equal(items.length, 3);
  const parts = items.map(li => {
    assert.deepEqual(li.children.map(n => n.tagName), ['DETAILS'], 'one details per card');
    const details = li.children[0], [summary, ...inside] = details.children;
    assert.equal(details.getAttribute('open'), null, 'closed');
    assert.equal(summary.tagName, 'SUMMARY');
    assert.deepEqual(linksOf(summary), [], 'the summary holds no link');
    return { summary: summary.textContent, inside: inside.map(n => n.textContent).join(' '), links: linksOf({ children: inside }) };
  });
  const [region, landmark, log] = parts;
  assert.equal(region.summary, en('region.note') + en('region.plains'), 'the eyebrow and the title');
  assert.ok(region.inside.includes(en('region.fact.plains')));
  assert.deepEqual(region.links, src('jezero').concat(src('marsNames')), 'the source opens with the fact');
  assert.ok(landmark.summary.includes(en('lm.delta.name')) && landmark.summary.includes(en('disc.by', { name: en('name.minh') })), 'the title and the meta');
  assert.ok(landmark.inside.includes(en('lm.delta.fact')) && !landmark.summary.includes(en('lm.delta.fact')));
  assert.deepEqual(landmark.links, src(pg.I.LANDMARK_SOURCES.delta));
  assert.equal(log.summary, en('ks.label') + en('ks.weather.name'));
  assert.ok(log.inside.includes(en('ks.weather.log')));
  assert.deepEqual(log.links, [], 'a Kestrel log is fiction: no source');
});

test("a fact or log found twice is listed once: two deltas (the first finder named), two supply caches, a region entered twice", () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  Object.assign(m.expedition, {
    regions: ['icy', 'plains', 'icy'], landmarks: { 'L0,2': { by: 'lena', round: 1 }, 'L0,1': { by: 'minh', round: 2 } },
    structures: { 'S1,3': 'used', 'S-1,0': 'used' }, stats: { minh: { finds: {}, pods: 2 }, lena: { finds: {}, pods: 1 } },
  });
  pg.play(m);
  const items = foundItems(notesOf(pg));
  assert.deepEqual(items.map(titleOf), [en('region.icy'), en('region.plains'), en('lm.delta.name'), en('ks.cache.name'), en('ks.pod.name')]);
  assert.ok(items[2].textContent.includes(en('disc.by', { name: en('name.lena') })) && !items[2].textContent.includes(en('name.minh')));
});

test("the Science note says when nothing has been found, is not there without a mission, and the notes after it end with the ISRU note and its sources", () => {
  const pg = page();
  assert.equal(foundNote(notesOf(pg)), null, 'no mission: only the notes that are always there');
  pg.play(pg.mission({ seed: 'PAINT-QA-1' }));
  const d = notesOf(pg), notes = walk(d, []).filter(n => n.tagName === 'ARTICLE');
  assert.ok(foundNote(d).textContent.includes(en('notes.foundNone')));
  assert.deepEqual(foundItems(d), []);
  assert.equal(notes.length, 1 + pg.I.NOTES.en.length + 1, 'the found note, the notes that were always there, the ISRU note');
  const isru = notes.at(-1);
  assert.equal(isru.children[0].textContent, en('lesson.isruMars.title'));
  assert.ok(isru.textContent.includes(en('lesson.isruMars.body')));
  assert.deepEqual(linksOf(isru), ['isru', 'moxie', 'moxieInstruments', 'iceMap', 'lroIce', 'protonCeramics'].map(k => [pg.I.SOURCES[k].url, pg.I.SOURCES[k].label]), 'the lesson\'s own sources');
  pg.UI.store.lang = 'vi';
  pg.UI.render();
  assert.ok(foundNote(pg.dialog()).textContent.includes(I.t('vi', 'notes.foundNone')));
  assert.equal(walk(pg.dialog(), []).filter(n => n.tagName === 'ARTICLE').at(-1).children[0].textContent, I.t('vi', 'lesson.isruMars.title'));
});

test("a mission somebody edited by hand is skipped, not drawn: ids that are no region, landmark, formation or structure of this world, odd spellings, counts that are no numbers", () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  Object.assign(m.expedition, {
    regions: ['plains', 'nowhere', 3, null, {}],
    landmarks: { 'L1,1': { by: 'minh', round: 0 }, 'L0,1x': 1, 'L-0,0': { by: 'minh', round: 0 }, 'L99999999,0': 1, junk: 1, 'L0,1': { by: 'nobody', round: 1 } },
    sites: { 'F9,9:0': 0, 'Fx:0': 1, 'F2,0:0': 0, 'F01,0:0': 0, 'F1,0:1': 0, '__proto__:0': 0 },
    structures: { 'S5,5': 'used', 'S9999999999,0': 'used', 'S01,1': 'used', 'S-1,0': '', 'S0,0': 'repaired' },
    stats: { minh: { finds: {}, pods: 'many' }, lena: 7, diego: { finds: {}, pods: -3 }, kai: { pods: NaN }, yuki: [] },
  });
  pg.play(m);
  const items = foundItems(notesOf(pg));
  assert.deepEqual(items.map(titleOf), [en('region.plains'), en('lm.delta.name'), en('ks.weather.name')]);
  assert.ok(!items[1].textContent.includes(en('disc.by', { name: '' }).trim()), 'a finder who is no crew member is not named');
  m.expedition.stats = 5;
  m.expedition.structures = [];
  m.expedition.landmarks = 'L0,1';
  m.expedition.regions = 'plains';
  m.expedition.sites = null;
  assert.deepEqual(foundItems(notesOf(pg)), [], 'and a record that is no list or map at all');
});

test("the Science note of a mission the explorer bot really played lists the landmark, formations and structures it used and the hab pods it visited, from the shapes the rules write", () => {
  const Eng = require('../src/engine.js'), Dat = require('../src/data.js'), Wg = require('../src/worldgen.js'), { haulRound } = require('../tools/explorer.js');
  const ids = (key, re) => key.match(re).slice(1).map(Number), uniq = a => [...new Set(a)];
  for (const seed of ['FARM-1', 'FARM-3']) {
    let s = Eng.createMission({ seed, loadout: Dat.REFERENCE_KITS.commander, events: false, pilot: 'diego' });
    while (s.status === 'active') { haulRound(s, s.pilot, true); s = Eng.resolveTurn(s, Eng.defaultPlan(s)).state; }
    const x = s.expedition, w = Wg.seedOf(seed);
    assert.ok(Object.values(x.stats).some(st => st.pods > 0), seed + ': the bot refilled in hab pods');
    // What the game itself says it found, each kind once, in the order the lists keep them.
    const want = uniq([].concat(
      x.regions.map(id => 'region.' + id),
      Object.keys(x.landmarks).map(id => Dat.LANDMARKS.kinds[Wg.landmarkAt(w, ...ids(id, /^L(-?\d+),(-?\d+)$/)).kind].fact + '.name'),
      Object.keys(x.sites).filter(id => id[0] === 'F').map(id => Dat.FORMATIONS.kinds[Wg.chunk(w, ...ids(id, /^F(-?\d+),(-?\d+):0$/)).formations[0].kind].fact + '.name'),
      Object.keys(x.structures).map(id => Dat.STRUCTURES.kinds[Wg.structureAt(w, ...ids(id, /^S(-?\d+),(-?\d+)$/)).kind].log + '.name'),
      ['ks.pod.name'])).map(k => en(k));
    const pg = page();
    pg.play(s);
    assert.deepEqual(foundItems(notesOf(pg)).map(titleOf), want, seed);
  }
});

test('the title screen tells why we go to Mars, page by page: Earth, the Moon, the rovers, the astronaut, the mission, with NASA sources', () => {
  const pg = page();
  click(pg.byKey('story'));
  assert.equal(pg.dialog().attrs['aria-label'], en('story.title'));
  const titles = [];
  for (let i = 0; i < I.STORY.en.length; i++) {
    const p = I.STORY.en[i], text = pg.dialog().textContent;
    titles.push(p.title);
    assert.ok(text.includes(p.title) && text.includes(p.body), 'page ' + (i + 1));
    assert.ok(text.includes(en('story.step', { n: i + 1, m: I.STORY.en.length })), 'its number');
    for (const id of p.src) assert.ok(text.includes(I.SOURCES[id].label), 'cites ' + id);
    assert.equal(!!pg.byKey('story-back'), i > 0, 'Back from page 2 on');
    if (i < I.STORY.en.length - 1) click(pg.byKey('story-next'));
  }
  assert.ok(['Apollo 11', 'Artemis', 'Opportunity', 'Perseverance', 'climate'].every(w => I.STORY.en.some(p => (p.title + p.body + p.src.map(id => I.SOURCES[id].label).join()).includes(w))), 'the brief\'s milestones');
  click(pg.byKey('story-done'));
  assert.equal(pg.dialog(), null, 'closed');
});

test('the field guide labels every piece of cargo, building and gear and says what it does; a real fact shows only with the source that states it; in both languages', () => {
  const D = require('../src/data.js');
  for (const lang of ['en', 'vi']) {
    const pg = page({ lang });
    click(pg.byKey('guide'));
    assert.equal(pg.dialog().attrs['aria-label'], I.t(lang, 'guide.title'));
    const ids = pg.all().filter(n => /^guide:/.test(n.attrs['data-k'] || '')).map(n => n.attrs['data-k'].slice(6));
    for (const id of Object.keys(D.MODULES).concat(['waterwall', 'spares', 'materials', 'food', 'o2', 'water', 'suit', 'pack', 'canister', 'kit'])) assert.ok(ids.includes(id), 'listed: ' + id);
    const cited = {};
    for (const id of ids) {
      const item = pg.byKey('guide:' + id), [name, desc] = item.children[1].children, nodes = walk(item, []), what = lang + ' ' + id;
      const fact = nodes.find(n => n.className === 'guide-fact'), links = nodes.filter(n => n.tagName === 'A');
      assert.ok(name.textContent && desc.textContent, what + ': a name and what it does');
      for (const n of [name, desc, fact].filter(Boolean)) assert.doesNotMatch(n.textContent, /^(item|mod|bld|guide)\./, what + ': no missing words');
      assert.doesNotMatch(item.textContent, /\{\w+\}/, what + ': no unfilled {placeholder}');
      assert.equal(links.length, fact ? 1 : 0, what + ': a fact shows its source, and only a fact does');
      if (!fact) continue;
      cited[id] = Object.keys(I.SOURCES).find(s => I.SOURCES[s].url === links[0].attrs.href && I.srcLabel(lang, s) === links[0].textContent);
      assert.ok(cited[id] && /^https:\/\//.test(links[0].attrs.href), what + ': its source is in SOURCES');
    }
    // lab's and spares' lines are mottos, not facts; no page checked says solar's 43 %, the water wall's "best shield per
    // kilogram", baked regolith bricks or water's 7 kg a day as the game words them (src/ui.js GUIDE_SOURCES).
    assert.deepEqual(ids.filter(id => !cited[id]), ['solar', 'waterwall', 'lab', 'spares', 'materials', 'water'], lang + ': the entries with no fact line');
    assert.deepEqual([cited.rover, cited.suit], ['dra5', 'marsGlance'], lang + ': pressurized rovers are in DRA 5.0, the air pressure in Mars at a glance');
    click(pg.byKey('modal-close'));
    assert.equal(pg.dialog(), null);
  }
});

// ---------- the console and co-op fixes (M5) ----------
const holdPage = () => {
  const clock = clockOf(), pg = page(null, clock.globals);
  pg.play(pg.mission({ seed: 'PAINT-QA-1' }));
  return { clock, pg, hooks: pg.surface.hooks, up: () => (pg.UI.store.card ? pg.UI.store.card.id : null) };
};

test('a card arriving while you read another waits its turn, even when its 8 s are long over', () => {
  const { clock, pg, hooks, up } = holdPage();
  let hover = true;
  pg.win.matchMedia = () => ({ matches: true });
  pg.win.document.querySelector = sel => (sel === '.region-card' ? { matches: q => q === ':hover' && hover, contains: () => true } : null);
  hooks.card(POD);
  clock.advance(10000); // the 8 s are over; the player is reading
  hooks.card(DELTA(null));
  assert.equal(up(), 'S4,-1', 'the log is being read: it stays');
  hover = false;
  pg.win.document.querySelector = () => null;
  clock.advance(8000);
  assert.equal(up(), 'L0,1', 'and the discovery opens when the reading is done');
});

test('a held card is dropped when the mission ends or a new one launches', () => {
  let t = holdPage();
  t.hooks.card(POD);
  t.hooks.card(DELTA(null));
  t.pg.UI.store.mission.status = 'won';
  t.clock.advance(8000);
  assert.notEqual(t.up(), 'L0,1', 'the mission is over: nothing opens behind the debrief');
  t = holdPage();
  t.hooks.card(POD);
  t.hooks.card(DELTA(null));
  Object.assign(t.pg.UI.store, { loadout: t.pg.E.referenceKit('commander', 4), seed: 'PAINT-QA-1', screen: 'pilot' });
  t.pg.UI.render();
  click(t.pg.byKey('pilot:minh'));
  t.pg.UI.store.opsView = 'surface';
  t.clock.advance(8000);
  assert.notEqual(t.up(), 'L0,1', "a card from the old mission does not open in the new one, though its code is the same");
});

test('reopening a region card does not show its waiting first-time card again', () => {
  const { pg, hooks, up } = holdPage();
  hooks.card(POD);
  hooks.enterRegion('icy'); // its first-time card waits
  hooks.reopenRegion('icy');
  assert.equal(up(), 'icy');
  pg.UI.render();
  click(pg.byKey('region-close'));
  assert.equal(up(), null, 'closed once: it does not come a second time');
});

test('the forecast counts a goal met this render', () => {
  const pg = page(), m = withGoals(pg, pg.mission({ seed: 'UI-FCGOAL' }), ['landmark']);
  m.expedition.landmarks['L1,0'] = { by: 'minh', round: 0 }; // discovered, but nobody has judged the goal yet
  const orig = pg.E.forecast;
  let done = null;
  pg.E.forecast = (s, p) => { done = s.expedition.goals[0].done; return orig(s, p); };
  pg.play(m);
  assert.equal(done, true);
});

test('a held card does not expire while the console is showing', () => {
  const { clock, pg, hooks, up } = holdPage();
  hooks.card(POD);
  hooks.card(DELTA(null));
  pg.UI.store.opsView = 'console';
  clock.advance(60000);
  assert.equal(up(), 'S4,-1', 'nothing opened or closed unseen');
  pg.UI.store.opsView = 'surface';
  clock.advance(15000);
  assert.equal(up(), 'L0,1', 'back on the surface the held card is still there to be read');
});

test('solo reads seen regions from the mission, not the global slot', () => {
  const pg = page({ regionsSeen: { key: 'PAINT-QA-1|solo', list: ['icy'] } }), m = pg.mission({ seed: 'PAINT-QA-1' });
  pg.play(m);
  pg.surface.hooks.enterRegion('icy');
  assert.equal(pg.UI.store.card && pg.UI.store.card.id, 'icy', "this mission has not been in the region: the slot is another session's");
  click((pg.UI.render(), pg.byKey('region-close')));
  pg.surface.hooks.enterRegion('icy');
  assert.equal(pg.UI.store.card, null, 'and a region it has been in shows no first-time card again');
});

test('fog sent just before a socket drops is sent again when it reopens', async () => {
  const { got, net, pg } = surfacePage(), sent = [];
  net.sendReveal = map => { sent.push(Object.keys(map)); return true; };
  pg.win.performance = { now: () => 0 };
  pg.win.SolSurface.reset = () => {};
  await new Promise(r => setImmediate(r));
  const F = pg.win.SolFog, bits = F.empty();
  F.set(bits, 1, 1);
  const room = { mission: pg.mission({ coop: true }), players: [{ id: 'p1', crewId: 'minh', connected: true }], settings: { names: {} }, hostId: 'p1', launch: 1 };
  pg.play(room.mission);
  net.h[0](room);
  got.hooks.reveal({ '2,2': F.encode(bits) });
  assert.deepEqual(sent, [['2,2']]);
  net.h[1]('error'); // the socket dropped; the message was in a half-open one
  net.h[1]('open');
  net.h[0](room);
  assert.deepEqual(sent, [['2,2'], ['2,2']], 'sent again once the room frame names the mission');
});

// ---------- M5 task 7: the title and the lobby ----------

test('a failed host shows words, never the raw key lan.network', async () => {
  for (const lang of ['en', 'vi']) {
    const pg = page({ lang }, { SolNet: { info: () => Promise.resolve(null), restore: () => null, create: () => Promise.resolve({ error: 'network' }) } });
    pg.UI.store.modal = 'lan';
    pg.UI.render();
    click(pg.byKey('lan-host'));
    await new Promise(r => setImmediate(r));
    const err = pg.UI.store.lanError;
    assert.ok(err && !/^lan\./.test(err), lang + ': ' + err);
    assert.equal(err, I.t(lang, 'lan.network'));
  }
});

test('noRoom and slowDown have their own messages, not "No answer from the server"', async () => {
  for (const error of ['noRoom', 'slowDown']) {
    const net = { info: () => Promise.resolve(null), restore: () => null, act: () => Promise.resolve({ error }) };
    const pg = page(null, { SolNet: net });
    pg.play(pg.mission({ seed: 'UI-ERR' }));
    Object.assign(pg.UI.store, { lan: { code: 'ABCD' }, room: { mission: pg.mission({ seed: 'UI-ERR', coop: true }), players: [], settings: { names: {} } } });
    const r = await pg.surface.hooks.exp('collect', {}, at(1, 1));
    assert.equal(r.error, error);
    assert.notEqual(en('eva.err.' + error), en('eva.err.net'));
  }
});

test('a refused seat claim shows lan.deadCrew', async () => {
  const net = { info: () => Promise.resolve(null), restore: () => null, act: () => Promise.resolve({ error: 'deadCrew' }) };
  const pg = page(null, { SolNet: net });
  const m = pg.mission({ seed: 'UI-SEAT', coop: true });
  Object.assign(pg.UI.store, { lan: { code: 'ABCD', playerId: 'p1' }, room: { mission: m, plan: pg.E.defaultPlan(m), hostId: 'p1', phase: 'ops', players: [{ id: 'p1', name: 'Me', crewId: null, connected: true }], settings: { names: {} } }, mission: m, plan: pg.E.defaultPlan(m), screen: 'ops', opsView: 'surface', modal: null });
  pg.UI.render();
  const btn = pg.all().find(n => /^seat:/.test(n.attrs['data-k'] || ''));
  assert.ok(btn, 'a free seat is offered');
  click(btn);
  await new Promise(r => setImmediate(r));
  assert.equal(pg.UI.store.toast, en('lan.deadCrew'));
});

// ---------- M5 Task 10: the look and the offline start ----------

test('a story log or fact opens once a mission per kind: a second structure or formation of a kind opens nothing, a new kind does', () => {
  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
  pg.play(m);
  const show = c => { pg.surface.hooks.card(c); pg.UI.render(); };
  show({ type: 'log', id: 'S0,0', kind: 'weather' });
  assert.ok(cardOf(pg), 'the first weather station opens its log');
  click(pg.byKey('region-close'));
  show({ type: 'log', id: 'S7,7', kind: 'weather' });
  assert.equal(cardOf(pg), null, 'another station: the same text, not again');
  show({ type: 'log', id: 'S8,8', kind: 'cache' });
  assert.ok(cardOf(pg), 'a cache is a new kind');
  click(pg.byKey('region-close'));
  show({ type: 'formation', id: 'F1,0', kind: 'ventifact' });
  assert.ok(cardOf(pg));
  click(pg.byKey('region-close'));
  show({ type: 'formation', id: 'F4,4', kind: 'ventifact' });
  assert.equal(cardOf(pg), null, 'another ventifact: not again');
  pg.play(pg.mission({ seed: 'PAINT-QA-2' }));
  show({ type: 'log', id: 'S0,0', kind: 'weather' });
  assert.ok(cardOf(pg), 'a new mission shows them again');
});

test('the found-list marker is not read aloud: its + and minus carry an empty alternative text', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'style.css'), 'utf8');
  assert.match(css, /\.found-list summary::after \{[^}]*content: '\+' \/ '';/);
  assert.match(css, /\.found-list details\[open\] > summary::after \{[^}]*content: '\\2212' \/ '';/);
});

test('the Display rows have accessible names: each choice group is labelled with its row', () => {
  const pg = page();
  click(pg.all().find(n => n.tagName === 'BUTTON' && n.textContent === en('nav.display')));
  const groups = pg.all().filter(n => n.attrs.role === 'group' && pg.dialog().children && walk(pg.dialog(), []).includes(n));
  assert.deepEqual(groups.map(g => g.attrs['aria-label']), [en('display.gfx'), en('display.fpsCap'), en('display.showFps')]);
});

test('the page loads with no font request when offline or in the single file, and asks for the fonts otherwise', () => {
  const fonts = pg => pg.win.document.head.children.filter(n => n.tagName === 'LINK' && /fonts\.googleapis/.test(n.href));
  assert.equal(fonts(page()).length, 1, 'online in the app or on a server: the fonts');
  assert.equal(fonts(page(null, { navigator: { language: 'en-US', onLine: false } })).length, 0, 'offline');
  assert.equal(fonts(page(null, { SOL_APP: false })).length, 0, 'the single file');
});

test('the season chip in the top bar is short, with the full wording as its tooltip; the dust seasons still say so, in both languages', () => {
  const pg = page(), m = pg.mission({ seed: 'UI-SEASON' });
  pg.play(m);
  const chip = () => pg.all().find(n => n.attrs.title && / · Ls \d+°$/.test(n.textContent));
  const c = chip();
  assert.ok(c, 'the chip');
  for (const lang of ['en', 'vi']) for (const s of ['spring', 'summer', 'autumn', 'winter']) {
    const short = I.t(lang, 'season.' + s + '.short'), full = I.t(lang, 'season.' + s);
    assert.notEqual(short, 'season.' + s + '.short');
    assert.ok(short.length < full.length, lang + ' ' + s + ' is shorter');
    if (s === 'autumn' || s === 'winter') assert.match(short, lang === 'en' ? /dust season/ : /mùa bão bụi/, lang + ' ' + s + ' still says dust season');
  }
  assert.ok(c.attrs.title.length > c.textContent.length - 8, 'the tooltip carries the full wording');
});

// ---------- the Quick mission and its own save slot ----------

// Two saved missions, as a device that played both lengths would hold them (a plain copy, as localStorage keeps them).
function twoSaves() {
  const p = page();
  const full = p.mission({ seed: 'FULL-1' }), quick = p.mission({ seed: 'QUICK-1', quick: true, loadout: p.E.referenceKit('commander', 4, true) });
  const slot = m => plain({ mission: m, plan: p.E.defaultPlan(m) });
  return { save: slot(full), saveQuick: slot(quick) };
}
const stored = (pg, k) => (('sol500.' + k) in pg.ls ? JSON.parse(pg.ls['sol500.' + k]) : undefined);
const finish = (pg, status) => { pg.UI.store.mission.status = status || 'lost'; pg.UI.store.mission.endCause = { reason: 'health', sol: 40 }; };

test('starting a quick mission leaves the full save unchanged', () => {
  const saves = twoSaves();
  const pg = page({ save: saves.save, settings: { length: 'quick' } });
  assert.equal(pg.UI.store.mission.quick, undefined, 'the boot loads the full slot');
  pg.UI.store.mission = null;
  pg.UI.render();
  click(pg.byKey('start'));
  click(pg.byKey('launch'));
  click(pg.byKey('pilot:minh'));
  assert.equal(pg.UI.store.mission.quick, true);
  assert.equal(pg.UI.store.mission.schedule.length, 8);
  assert.deepEqual(stored(pg, 'save'), saves.save, 'the full save is as it was');
  assert.equal(stored(pg, 'saveQuick').mission.quick, true);
});

test('abandoning a quick mission (newMission) deletes only saveQuick', () => {
  const saves = twoSaves();
  const pg = page({ saveQuick: saves.saveQuick, save: saves.save });
  pg.UI.store.mission = pg.E.upgradeMission(saves.saveQuick.mission);
  finish(pg);
  pg.UI.store.screen = 'debrief';
  pg.UI.render();
  click(pg.byKey('new'));
  assert.equal(stored(pg, 'saveQuick'), undefined);
  assert.deepEqual(stored(pg, 'save'), saves.save);
});

test('Fly again from a finished quick mission keeps the full save, and sets the length to Quick', () => {
  const saves = twoSaves();
  const pg = page({ saveQuick: saves.saveQuick, save: saves.save });
  pg.UI.store.mission = pg.E.upgradeMission(saves.saveQuick.mission);
  finish(pg);
  pg.UI.store.screen = 'debrief';
  pg.UI.render();
  click(pg.byKey('again'));
  assert.equal(stored(pg, 'saveQuick'), undefined);
  assert.deepEqual(stored(pg, 'save'), saves.save);
  assert.equal(pg.UI.store.settings.length, 'quick');
  assert.equal(pg.UI.store.screen, 'manifest');
});

test('finishing a full mission leaves the quick save unchanged', () => {
  const saves = twoSaves();
  const pg = page({ save: saves.save, saveQuick: saves.saveQuick });
  assert.equal(pg.UI.store.mission.quick, undefined);
  finish(pg);
  pg.UI.store.screen = 'debrief';
  pg.UI.render();
  click(pg.byKey('new'));
  assert.equal(stored(pg, 'save'), undefined);
  assert.deepEqual(stored(pg, 'saveQuick'), saves.saveQuick);
});

test('the title offers a Resume for each slot that holds a mission', () => {
  const saves = twoSaves();
  assert.ok(page({ save: saves.save, saveQuick: saves.saveQuick }).byKey('resume:save') && page({ save: saves.save, saveQuick: saves.saveQuick }).byKey('resume:saveQuick'));
  const onlyQuick = page({ saveQuick: saves.saveQuick });
  assert.equal(onlyQuick.byKey('resume:save'), undefined);
  assert.ok(onlyQuick.byKey('resume:saveQuick'));
  assert.equal(onlyQuick.UI.store.mission.quick, true, 'with only a quick save, the boot loads it');
  assert.equal(page().byKey('resume:save'), undefined);
});

test('Resume on the other slot loads that mission and keeps both saved', () => {
  const saves = twoSaves();
  const pg = page({ save: saves.save, saveQuick: saves.saveQuick });
  click(pg.byKey('resume:saveQuick'));
  assert.equal(pg.UI.store.mission.quick, true);
  assert.equal(pg.UI.store.screen, 'ops');
  pg.flush();
  assert.equal(stored(pg, 'saveQuick').mission.seed, 'QUICK-1');
  assert.equal(stored(pg, 'save').mission.seed, 'FULL-1');
  pg.UI.store.screen = 'title';
  pg.UI.render();
  click(pg.byKey('resume:save'));
  assert.equal(pg.UI.store.mission.seed, 'FULL-1');
  assert.equal(stored(pg, 'saveQuick').mission.seed, 'QUICK-1');
});

test('the length row on the title: Quick drops the stored kit and disables Training; any other stored value reads as full', () => {
  const pg = page({ settings: { length: 'quick' } });
  assert.equal(pg.byKey('train').attrs.disabled, '');
  pg.UI.store.loadout = { rover: 3 };
  click(pg.byKey('length:full'));
  assert.equal(pg.UI.store.loadout, null);
  assert.equal(stored(pg, 'settings').length, 'full');
  assert.equal(pg.byKey('train').attrs.disabled, undefined);
  assert.equal(page({ settings: { length: 'bogus' } }).UI.store.settings.length, 'full');
});

test('a quick mission names its length: the sol clock and the debrief tag', () => {
  const saves = twoSaves();
  const pg = page({ saveQuick: saves.saveQuick });
  pg.UI.store.screen = 'ops';
  pg.UI.render();
  assert.ok(pg.all()[0].textContent.includes('/ 200'), 'the sol clock counts to the last sol of 8 rounds');
  finish(pg, 'success');
  pg.UI.store.screen = 'debrief';
  pg.UI.render();
  const text = walkText(pg);
  assert.ok(text.includes(en('quick.tag')));
  assert.ok(text.includes('on sol 200'), 'the lift-off is on the mission\'s last sol');
});
function walkText(pg) { return pg.all()[0].textContent; }

test('the end sol in the manifest warnings and the debrief follows the mission: sol 500 on a Full mission, sol 200 on a Quick one', () => {
  for (const [lang, k] of [['en', 'mwarn.o2_short'], ['vi', 'mwarn.o2_short']]) {
    assert.ok(I.t(lang, k, { end: 200 }).includes('200') && !I.t(lang, k, { end: 200 }).includes('500'));
    assert.ok(I.t(lang, k, { end: 500 }).includes('500'));
  }
  const pg = page({ settings: { length: 'quick' } });
  click(pg.byKey('start'));
  click(pg.byKey('empty')); // nothing packed but the rover: the supplies fall short
  const quickText = pg.all()[0].textContent;
  assert.ok(quickText.includes('before sol 200') && !/sol 500/.test(quickText), 'a Quick manifest says sol 200');
});

test("a Quick mission's round 3 says the flare is due, and no other round does", () => {
  const saves = twoSaves();
  const pg = page({ saveQuick: saves.saveQuick });
  const m = pg.UI.store.mission;
  assert.equal(m.quick, true);
  pg.UI.store.screen = 'ops';
  pg.UI.render();
  assert.equal(pg.byKey('quick-flare'), undefined, 'round 1 has no such note');
  m.turn = 2;
  pg.UI.render();
  assert.equal(pg.byKey('quick-flare').textContent, en('quick.flareHint'));
  const full = page({ save: saves.save });
  full.UI.store.mission.turn = 2;
  full.UI.store.screen = 'ops';
  full.UI.render();
  assert.equal(full.byKey('quick-flare'), undefined);
});

test('a Quick manifest keeps its rover: the minus is disabled at 1 and Clear leaves one', () => {
  const pg = page({ settings: { length: 'quick' } });
  click(pg.byKey('start'));
  assert.equal(pg.UI.store.loadout.rover, 1);
  assert.equal(pg.byKey('dec:rover').attrs.disabled, '');
  click(pg.byKey('empty'));
  assert.equal(pg.UI.store.loadout.rover, 1);
});

// ---------- fix round 1: the slots at the end of a mission, and the timer ----------
for (const [ending, other] of [['save', 'saveQuick'], ['saveQuick', 'save']]) {
  test('ending a ' + (ending === 'save' ? 'full' : 'quick') + ' mission through the advance deletes its slot and leaves the ' + (other === 'save' ? 'full' : 'quick') + ' save as it was', () => {
    const saves = twoSaves();
    const pg = page({ save: saves.save, saveQuick: saves.saveQuick });
    pg.UI.store.settings.length = ending === 'saveQuick' ? 'quick' : 'full';
    click(pg.byKey('resume:' + ending));
    const m = pg.UI.store.mission;
    m.turn = pg.E.turnsOf(m) - 1;
    pg.play(m);
    pg.surface.hooks.advance();
    assert.notEqual(pg.UI.store.mission.status, 'active', 'the mission ended');
    assert.equal(stored(pg, ending), undefined, 'its own slot is deleted');
    assert.deepEqual(stored(pg, other), saves[other], 'the other slot is untouched');
  });
}

test('after a Resume on the other slot, the 4 s save timer writes the mission to its own slot', () => {
  const saves = twoSaves();
  const pg = page({ save: saves.save, saveQuick: saves.saveQuick });
  click(pg.byKey('resume:saveQuick'));
  pg.UI.render();
  pg.surface.hooks.suit({ suit: 77, driven: null, clock: 9, at: { x: 640, y: 200 } }); // the exploring hook asks for a save a few seconds on
  pg.flush();
  assert.equal(stored(pg, 'saveQuick').mission.expedition.suits.minh, 77, 'the quick slot has the new state');
  assert.ok(stored(pg, 'saveQuick').mission.quick);
  assert.deepEqual(stored(pg, 'save'), saves.save, 'the full slot is not overwritten');
});
