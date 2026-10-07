'use strict';
// The walkable surface (src/surface.js) in a fake DOM, frame by frame: where your astronaut stands and what E does when
// exploring changes under them (a new mission, the rover, a collapse, a reload, a revive). The file is a browser script,
// so it runs in a vm sandbox with the globals the page gives it. The painter is a stub and the 2D context accepts every
// call: what it draws is checked in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/data.js');
const E = require('../src/engine.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');
const SW = require('../src/surface-world.js');
const P = require('../src/surface-paint.js');
const I = require('../src/i18n.js');

const T = 64;
const SOURCES = ['art.js', 'surface-map.js', 'surface-eva.js', 'surface.js'].map(f => [f, fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')]);
const plain = v => JSON.parse(JSON.stringify(v));
const flush = () => new Promise(r => setImmediate(r));
const ROVER_KIT = Object.assign({}, E.referenceKit('commander', 4), { rover: 1, waterwall: 0 });
const mission = o => E.createMission(Object.assign({ loadout: ROVER_KIT, events: false, pilot: 'minh' }, o));
const LOAD = { kind: 'metal', res: 'materials', amount: 40, id: '0,0:9', region: 0 };
const loads = n => Array.from({ length: n }, () => Object.assign({}, LOAD));
// The metal find nearest the HQ: its id and tile.
function metalFind(m) {
  let best = null;
  for (let cy = -2; cy <= 1; cy++) for (let cx = -2; cx <= 1; cx++) for (const f of X.findsIn(m, cx, cy)) {
    if (f.kind === 'metal' && (!best || f.x * f.x + f.y * f.y < best.x * best.x + best.y * best.y)) best = { id: cx + ',' + cy + ':' + f.n, x: f.x, y: f.y };
  }
  return best;
}

const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 40 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const painter = new Proxy({}, { get: (t, k) => (k === 'stats' ? () => ({ paintMedian: 0 }) : () => {}) });
function element(tag) {
  const n = { tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, listeners: {}, hidden: false, className: '', textContent: '', innerHTML: '', isConnected: true, clientWidth: 160, clientHeight: 160 };
  n.append = (...cs) => { n.children.push(...cs); };
  n.appendChild = c => { n.children.push(c); return c; };
  n.addEventListener = (type, fn) => { (n.listeners[type] = n.listeners[type] || []).push(fn); };
  n.setAttribute = () => {};
  n.classList = { add() {}, remove() {} };
  n.focus = () => {};
  n.getContext = () => ctx;
  n.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 640 });
  return n;
}

// A page showing mission `m` as crew member `me`. Exploring actions run the real rules on the mission the page was last
// shown, then show it again: ui.js renders the same mission after a solo action, and a co-op room broadcasts a new copy
// (a JSON copy here). sent: the positions teammates are sent; calls: the exploring actions asked for.
function page(m, me) {
  let raf = null, clock = 0, cur = m;
  const on = {}, sent = [], calls = [];
  const win = {
    SolData: D, SolEngine: E, SolWorldgen: W, SolExpedition: X, SolWorld: SW, SolPaint: Object.assign({}, P, { createPainter: () => painter }),
    document: { createElement: element, createTextNode: text => ({ text }), querySelector: () => null, hidden: false },
    location: { search: '?debug=chunks' }, performance: { now: () => clock }, devicePixelRatio: 1, Image: function () {},
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, fn) => { (on[type] = on[type] || []).push(fn); },
    requestAnimationFrame: fn => { raf = fn; },
  };
  win.window = win.self = win;
  vm.createContext(win);
  for (const [f, code] of SOURCES) vm.runInContext(code, win, { filename: f });
  const S = win.SolSurface;
  const show = next => {
    cur = next;
    const shown = cur.coop ? plain(cur) : cur, plan = E.defaultPlan(shown);
    S.update({ mission: shown, plan, forecast: E.forecast(shown, plan), controlId: me, canControl: () => true, crewName: id => id, t: (k, p) => I.t('en', k, p), lang: 'en', fog: null });
  };
  const hooks = {
    exp: (type, payload, pos) => {
      calls.push(type);
      const p = payload || {};
      const run = {
        collect: () => X.collect(cur, me, p.find, pos), deliver: () => X.deliver(cur, me, pos), canister: () => X.useCanister(cur, me),
        pickup: () => X.pickUp(cur, me, p.drop, pos), collapse: () => X.collapse(cur, me, pos), revive: () => X.revive(cur, me, p.target, pos),
        board: () => X.board(cur, me, pos), park: () => X.park(cur, me, pos),
      }[type];
      const r = run ? run() : { error: 'badAction' };
      if (!r.error) show(cur);
      return Promise.resolve(r);
    },
    suit: (seconds, driven) => { if (!cur.coop) { X.setSuit(cur, me, seconds); if (driven != null) X.setRoverDriven(cur, me, driven); } },
    sendPos: pos => sent.push(plain(pos)),
  };
  const root = S.mount(hooks), canvas = root.children[0];
  show(m);
  return {
    sent, calls, show, qa: S.qa, probe: () => S.probe(), reset: () => S.reset(),
    step(secs) { for (let i = 0; i < Math.round(secs * 20); i++) { clock += 50; raf(clock); } },
    key(code, down) { for (const fn of on[down === false ? 'keyup' : 'keydown'] || []) fn({ code, repeat: false, target: {}, preventDefault() {} }); },
    // A tap on the ground at tile (tx, ty): click-to-walk.
    tap(tx, ty) {
      const [clientX, clientY] = S.probe().toScreen((tx + 0.5) * T, (ty + 0.5) * T);
      for (const fn of canvas.listeners.pointerdown) fn({ clientX, clientY, pointerId: 1 });
    },
  };
}

test('a new mission (SolSurface.reset) starts with a full suit and battery, even with the same astronaut in the same round', async () => {
  const a = mission({ seed: 'SURF-A' });
  a.expedition.roverDriven = D.EXPEDITION.roverRange; // mission A's rover battery is flat
  const pg = page(a, 'minh');
  pg.qa.teleport(30, 4);
  pg.qa.suit(0);
  pg.step(0.3);
  await flush();
  assert.deepEqual(plain(a.expedition.benched), ['minh'], 'mission A: minh collapsed in round 1');
  // Back to the title, then mission B with the same astronaut: ui.js resets the surface, then shows the new mission.
  const b = mission({ seed: 'SURF-B' });
  pg.reset();
  pg.show(b);
  pg.step(0.2);
  assert.equal(pg.probe().eva.suit, D.EXPEDITION.suit, 'mission B: a full suit');
  assert.equal(pg.probe().eva.driven, 0, 'mission B: a full rover battery');
  pg.qa.teleport(0, 4);
  assert.equal(X.inBaseZone(pg.probe().player), false, 'one step outside the base zone');
  pg.step(4);
  await flush();
  assert.equal(pg.calls.filter(c => c === 'collapse').length, 1, 'only mission A asked for a collapse');
  assert.deepEqual(plain(b.expedition.incidents), [], 'mission B: no collapse');
  assert.ok(Math.abs(pg.probe().eva.suit - (D.EXPEDITION.suit - 4)) < 0.2, 'mission B: the suit drains from full: ' + pg.probe().eva.suit);
  assert.ok(b.expedition.suits.minh > 140, "mission B's saved suit is its own: " + b.expedition.suits.minh);
});

test('in the rover E gets you out, unless a crewmate to revive or a find your backpack has room for is right there', async () => {
  const m = mission({ seed: 'STUCK-1' });
  assert.equal(X.board(m, 'minh', X.bay(m)).ok, true);
  m.expedition.roverDriven = D.EXPEDITION.roverRange; // the battery is flat: the rover can't move
  m.expedition.carried.minh = loads(D.EXPEDITION.packRover - 1);
  const f = metalFind(m);
  const pg = page(m, 'minh');
  assert.equal(pg.probe().player.inRover, true, 'in the seat');
  pg.qa.teleport(f.x, f.y - 1); // facing the find, just below you
  pg.step(0.5);
  assert.equal(pg.probe().focusKey, 'f:' + f.id, 'room for one more load: E works on the find');
  m.expedition.carried.minh.push(Object.assign({}, LOAD));
  pg.step(0.1);
  assert.equal(pg.probe().focusKey, 'rover-exit', 'the backpack is full: E gets you out');
  assert.deepEqual(pg.calls, [], 'nothing asked yet');
  pg.key('KeyE');
  pg.key('KeyE', false);
  await flush();
  assert.equal(pg.probe().player.inRover, false, 'out on foot');
  assert.deepEqual(pg.calls, ['park'], 'the rover is parked');
  assert.ok(!(m.expedition.rover && m.expedition.rover.driver), 'nobody drives it');

  // Co-op: a crewmate down right in front of the rover comes first, even with a full backpack.
  const c = mission({ seed: 'STUCK-2', coop: true });
  assert.equal(X.board(c, 'minh', X.bay(c)).ok, true);
  c.expedition.roverDriven = D.EXPEDITION.roverRange;
  c.expedition.carried.minh = loads(D.EXPEDITION.packRover);
  assert.equal(X.collapse(c, 'diego', { x: 30 * T + 32, y: 5 * T + 32 }).ok, true);
  const pg2 = page(c, 'minh');
  pg2.qa.teleport(30, 4); // diego lies one tile below
  pg2.step(0.5);
  assert.equal(pg2.probe().focusKey, 'v:diego', 'E revives diego');
});
