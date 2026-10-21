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
const SOURCES = ['data.js', 'engine.js', 'i18n.js', 'art.js', 'charts.js', 'worldgen.js', 'fog.js', 'expedition.js', 'dangers.js', 'ui.js']
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

// ui.js booted on a device whose localStorage holds `stored` (keys without the "sol500." prefix). Timers wait for flush().
function page(stored) {
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
    SolSurface: { mount: hooks => { surface.hooks = hooks; return new El('div'); }, update: data => { surface.data = data; } },
  };
  win.window = win.self = win;
  win.Node = El;
  vm.createContext(win);
  for (const [f, code] of SOURCES) vm.runInContext(code, win, { filename: f });
  const UI = win.SolUI, E = win.SolEngine;
  const all = () => walk(app, []);
  return {
    UI, E, X: win.SolExpedition, ls, surface, all,
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
