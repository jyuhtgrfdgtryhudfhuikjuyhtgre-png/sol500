'use strict';
// Exploring on the surface (src/surface-eva.js) in a fake DOM: the suit, collapsing, delivering, holding E and moving.
// The file is a browser script, so it runs in a vm sandbox with the same globals the page gives it. What it draws is
// checked in the browser.
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

const T = 64;
function element() {
  const n = { children: [], style: {}, hidden: false, className: '', textContent: '', innerHTML: '', title: '', attrs: {} };
  n.appendChild = c => { n.children.push(c); return c; };
  n.append = (...cs) => { n.children.push(...cs); };
  n.addEventListener = () => {};
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.classList = { add: c => { n.className += ' ' + c; } };
  return n;
}
const ART = fs.readFileSync(path.join(__dirname, '..', 'src', 'art.js'), 'utf8');
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'surface-eva.js'), 'utf8');

// A surface layer for a mission; hooks run the real rules on it (as ui.js does in solo play) and record every call.
function setup(opts) {
  const o = opts || {};
  const sandbox = { SolData: D, SolWorldgen: W, SolExpedition: X, SolPaint: P, SolWorld: SW, document: { createElement: element } };
  vm.runInNewContext(ART, sandbox);
  vm.runInNewContext(SOURCE, sandbox);
  const m = o.mission || E.createMission({ seed: 'EVA-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  const calls = [], home = [];
  const hooks = {
    exp: (type, payload, pos) => {
      calls.push({ type, payload, pos });
      const run = { collect: () => X.collect(m, 'minh', payload.find, pos), deliver: () => X.deliver(m, 'minh', pos), collapse: () => X.collapse(m, 'minh', pos) }[type];
      return Promise.resolve(run ? run() : { ok: true });
    },
    suit: () => {},
  };
  const eva = sandbox.SolEva.create({ t: k => k, hooks: () => hooks, crewName: id => id, player: () => null, home: () => home.push(1), drawRover: () => {} });
  const data = { mission: m, controlId: 'minh', lang: 'en' };
  eva.sync(data);
  const world = SW.create(m.seed);
  return { eva, m, calls, home, data, world };
}
const outside = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T, moving: false, sprinting: false, inRover: false });
const tick = (s, p, secs, focus) => { for (let i = 0; i < secs * 10; i++) s.eva.step(0.1, p, s.world, 0, focus || null); };
const flush = () => new Promise(r => setImmediate(r));
// Objects made inside the sandbox have the sandbox's prototypes, so they are compared as plain JSON.
const plain = v => JSON.parse(JSON.stringify(v));

test('the suit drains one second a second outside, pauses at the base, and twice as fast when sprinting', () => {
  const s = setup();
  tick(s, outside(0, 1), 10);
  assert.equal(s.eva.state().suit, D.EXPEDITION.suit, 'paused in the base zone');
  tick(s, outside(20, 1), 10);
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 10)) < 1e-6);
  tick(s, Object.assign(outside(20, 1), { sprinting: true }), 5);
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 20)) < 1e-6);
});

test('in the rover the suit drains at half the rate, but not while you step out to work on a find', () => {
  const s = setup();
  tick(s, Object.assign(outside(20, 1), { inRover: true }), 10);
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 5)) < 1e-6);
});

test('an empty suit outside asks for a collapse once; a solo collapse sends you home', async () => {
  const s = setup();
  const p = outside(30, 4);
  tick(s, p, D.EXPEDITION.suit + 2);
  await flush();
  const asked = s.calls.filter(c => c.type === 'collapse');
  assert.equal(asked.length, 1);
  assert.deepEqual(plain(asked[0].pos), { x: Math.round(p.x), y: Math.round(p.y) });
  assert.equal(s.home.length, 1, 'back to the base');
  s.eva.sync(s.data);
  assert.equal(s.eva.state().benched, true);
  assert.equal(s.eva.canMove(outside(0, 0), 3 * T + 40, 32), false, 'you cannot leave the base zone until the next round');
  assert.equal(s.eva.canMove(outside(0, 0), 1 * T, 32), true, 'but you can walk about inside it');

  // Co-op: a crewmate revives you. The down→up step adopts the revived suit; it guards against a stale heartbeat
  // that set the server's suit to 0 while you were down.
  const coop = E.createMission({ seed: 'EVA-2', loadout: E.referenceKit('commander', 4), events: false, coop: true, pilot: 'minh' });
  const s2 = setup({ mission: coop });
  const collapsePos = { x: 30 * T + 32, y: 4 * T + 32 };
  X.collapse(s2.m, 'minh', collapsePos);
  s2.eva.sync({ mission: s2.m, controlId: 'minh', lang: 'en' });
  assert.equal(s2.eva.state().collapsed, true, 'minh is down');
  assert.equal(s2.eva.state().suit, 0, 'with an empty suit');
  const downSnap = plain(s2.m);
  X.revive(s2.m, 'diego', 'minh', collapsePos);
  s2.eva.sync({ mission: s2.m, controlId: 'minh', lang: 'en' });
  assert.equal(s2.eva.state().collapsed, false, 'diego revived minh');
  assert.equal(s2.eva.state().suit, D.EXPEDITION.reviveSuit, 'minh breathes the revive suit');

  // A reload in the middle of a co-op EVA: the page builds a new layer, and each snapshot from the server is a new
  // object. The collapse survives the reload, and a revive that arrives in a later snapshot is seen.
  const s3 = setup({ mission: downSnap });
  assert.equal(s3.eva.state().collapsed, true, 'a reload keeps the collapse');
  assert.equal(s3.eva.state().suit, 0, 'and the empty suit');
  const upSnap = plain(downSnap);
  X.revive(upSnap, 'diego', 'minh', collapsePos);
  s3.eva.sync({ mission: upSnap, controlId: 'minh', lang: 'en' });
  assert.equal(s3.eva.state().collapsed, false, 'the revive arrives in a new snapshot and is seen');
  assert.equal(s3.eva.state().suit, D.EXPEDITION.reviveSuit, 'with the revive suit');
});

test('walking into the base zone with a load delivers it, once', async () => {
  const s = setup();
  s.m.expedition.carried.minh = [{ kind: 'metal', res: 'materials', amount: 40, id: '0,0:1', region: 0 }];
  tick(s, outside(1, 1), 3);
  await flush();
  assert.equal(s.calls.filter(c => c.type === 'deliver').length, 1);
  assert.equal(s.m.expedition.banked.materials, 40);
});

test('holding E for the hold time collects the find you face; moving or looking away lets go', async () => {
  const s = setup();
  let f = null;
  for (let cy = -2; cy < 2 && !f; cy++) for (let cx = -2; cx < 2 && !f; cx++) for (const g of X.findsIn(s.m, cx, cy)) if (g.kind === 'metal' && !f) f = Object.assign({ cx, cy }, g);
  s.world.get(f.cx, f.cy); // the surface keeps the chunks around you built
  const p = outside(f.x, f.y - 1);
  const focus = s.eva.focusAt((f.x + 0.5) * T, (f.y + 0.5) * T, p, s.world);
  assert.equal(focus.kind, 'find');
  assert.equal(focus.id, f.cx + ',' + f.cy + ':' + f.n);
  assert.equal(s.eva.start(focus), true);
  tick(s, p, 1, focus);
  tick(s, Object.assign({}, p, { moving: true }), 0.2, focus);
  assert.equal(s.eva.state().hold, null, 'moving lets go');
  s.eva.start(focus);
  tick(s, p, 1, null);
  assert.equal(s.eva.state().hold, null, 'looking away lets go');
  s.eva.start(focus);
  tick(s, p, X.holdSeconds('metal', 'biologist') + 0.2, focus);
  await flush();
  const asked = s.calls.filter(c => c.type === 'collect');
  assert.equal(asked.length, 1);
  assert.deepEqual(plain(asked[0].payload), { find: focus.id });
  assert.equal(s.m.expedition.carried.minh.length, 1);
});

test('a new round means a full suit again, and says so', () => {
  const s = setup();
  tick(s, outside(20, 1), 30);
  const next = E.resolveTurn(s.m, E.defaultPlan(s.m)).state;
  const look = s.eva.sync({ mission: next, controlId: 'minh', lang: 'en' });
  assert.equal(look.round, true);
  assert.equal(s.eva.state().suit, D.EXPEDITION.suit);

  // A reload in the middle of an EVA: the page builds a new layer on the saved mission (a JSON copy, as the save
  // is), and it picks the suit level and the rover's distance back up.
  next.expedition.suits.minh = 40;
  next.expedition.roverDriven = 100;
  const reload = setup({ mission: plain(next) });
  assert.equal(reload.eva.state().suit, 40, 'a reload keeps the suit level');
  assert.equal(reload.eva.report().driven, 100, 'and the rover distance');

  // A solo collapse benches you with an empty suit, and a reload keeps both.
  X.collapse(next, 'minh', { x: 30 * T + 32, y: 4 * T + 32 });
  s.eva.sync({ mission: next, controlId: 'minh', lang: 'en' });
  assert.equal(s.eva.state().benched, true, 'a solo collapse benches you');
  assert.equal(s.eva.state().suit, 0, 'with an empty suit');
  const reloadBenched = setup({ mission: plain(next) });
  assert.equal(reloadBenched.eva.state().benched, true, 'a reload keeps you benched');
  assert.equal(reloadBenched.eva.state().suit, 0, 'with an empty suit');
});

test('nobody moves on an empty suit or a flat rover battery', () => {
  const s = setup();
  const p = outside(20, 1);
  s.eva.qaSuit(0);
  assert.equal(s.eva.canMove(p, p.x + 5, p.y), false);
  s.eva.qaSuit(50);
  assert.equal(s.eva.canMove(p, p.x + 5, p.y), true);
  s.m.expedition.roverDriven = D.EXPEDITION.roverRange;
  s.eva.sync(s.data);
  assert.equal(s.eva.canMove(Object.assign({}, p, { inRover: true }), p.x + 5, p.y), false);
});
