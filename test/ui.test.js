'use strict';
// The interface (src/ui.js) in a small fake DOM: the Display dialog, solo play's exploring hooks (the rules run on the spot,
// and the save every 2 s), the dangers in the Expedition panel and the round report's flare line. ui.js is a browser script
// whose only export is SolUI { store, render }, so it runs in a vm sandbox with the globals the page gives it, and a stub
// SolSurface keeps the hooks the surface is mounted with and the data of its last update. The looks are checked in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const I = require('../src/i18n.js');

const T = 64;
const SOURCES = ['data.js', 'engine.js', 'i18n.js', 'art.js', 'charts.js', 'worldgen.js', 'fog.js', 'expedition.js', 'goals.js', 'dangers.js', 'ui.js']
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
      createElement: tag => new El(tag), createTextNode: text => ({ textContent: text }), getElementById: id => (id === 'app' ? app : null),
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
    UI, E, X: win.SolExpedition, G: win.SolGoals, I: win.SolI18n, ls, surface, all,
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
    en('eva.cond.flare', { d: 15, w: 30, c: 60 }), en('eva.cond.devils', { n: 2, s: 10 }), en('eva.cond.storm', { n: 5 }), en('eva.cond.rupture', { kg: 30 }),
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
