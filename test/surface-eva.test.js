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
const Z = require('../src/dangers.js');

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

// A surface layer for a mission; hooks run the real rules on it (as ui.js does in solo play) and record every call, every
// 2-second report and every dust-devil push. `clock.now` is the wall clock the layer reads (co-op's round clock runs on it).
function setup(opts) {
  const o = opts || {};
  const sandbox = { SolData: D, SolWorldgen: W, SolExpedition: X, SolDangers: Z, SolPaint: P, SolWorld: SW, document: { createElement: element } };
  vm.runInNewContext(ART, sandbox);
  vm.runInNewContext(SOURCE, sandbox);
  const m = o.mission || E.createMission({ seed: 'EVA-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  const me = o.me || 'minh';
  const calls = [], home = [], reports = [], pushes = [], clock = { now: 0 }, player = { p: null };
  const hooks = {
    exp: (type, payload, pos) => {
      calls.push({ type, payload, pos });
      const p = payload || {};
      const run = {
        collect: () => X.collect(m, me, p.find, pos), deliver: () => X.deliver(m, me, pos), collapse: () => X.collapse(m, me, pos, p.driven),
        canister: () => X.useCanister(m, me, pos, p.suit), pickup: () => X.pickUp(m, me, p.drop, pos), revive: () => X.revive(m, me, p.target, pos),
        flareStart: () => Z.flareStart(m, p.t), flareEnd: () => Z.flareEnd(m, { [me]: pos }, 0, p.t),
      }[type];
      return Promise.resolve(run ? run() : { ok: true });
    },
    suit: r => reports.push(JSON.parse(JSON.stringify(r))),
  };
  const eva = sandbox.SolEva.create({
    t: o.t || (k => k), hooks: () => hooks, crewName: id => id, player: () => player.p, home: () => home.push(1), drawRover: () => {},
    now: () => clock.now, push: (dx, dy) => pushes.push([dx, dy]),
  });
  const data = { mission: m, controlId: me, lang: 'en', clock: o.clock || null };
  eva.sync(data);
  const world = SW.create(m.seed);
  return { eva, m, calls, home, data, world, reports, pushes, clock, player };
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
  tick(s, outside(9, 1), 10); // outside the base zone, but within 16 tiles of the HQ, where no dust devil comes
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 10)) < 1e-6);
  tick(s, Object.assign(outside(9, 1), { sprinting: true }), 5);
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 20)) < 1e-6);
});

test('in the rover the suit drains at half the rate, but not while you step out to work on a find', () => {
  const s = setup();
  tick(s, Object.assign(outside(20, 1), { inRover: true }), 10);
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 5)) < 1e-6);
});

test('an empty suit outside asks for a collapse once: solo sends you home; in co-op a revive, also one after a reload, gives the revive suit', async () => {
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

  // Co-op: a crewmate revives you. The server ignores suit reports from a collapsed crew member (X.setSuit), so the hazard
  // is this game's own stale 0, sent again after the revive: the down→up step adopts the revived suit (and while you are
  // down your suit is not reported at all).
  const coop = E.createMission({ seed: 'EVA-2', loadout: E.referenceKit('commander', 4), events: false, coop: true, pilot: 'minh' });
  const s2 = setup({ mission: coop });
  const collapsePos = { x: 30 * T + 32, y: 4 * T + 32 };
  X.collapse(s2.m, 'minh', collapsePos);
  s2.eva.sync({ mission: s2.m, controlId: 'minh', lang: 'en' });
  assert.equal(s2.eva.state().collapsed, true, 'minh is down');
  assert.equal(s2.eva.state().suit, 0, 'down with an empty suit');
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
  tick(s, p, X.holdSeconds('metal', s.m.crew.find(c => c.id === 'minh').role) + 0.2, focus);
  await flush();
  const asked = s.calls.filter(c => c.type === 'collect');
  assert.equal(asked.length, 1);
  assert.deepEqual(plain(asked[0].payload), { find: focus.id });
  assert.equal(s.m.expedition.carried.minh.length, 1);
});

test('a new round means a full suit again; a reload keeps the suit level, the rover distance and a solo collapse', () => {
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
  assert.equal(s.eva.state().suit, 0, 'benched with an empty suit');
  const reloadBenched = setup({ mission: plain(next) });
  assert.equal(reloadBenched.eva.state().benched, true, 'a reload keeps you benched');
  assert.equal(reloadBenched.eva.state().suit, 0, 'and the suit still empty after the reload');
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

test('a collapsed co-op crew member asks for nothing while down, even standing in the base zone with a load', async () => {
  const coop = E.createMission({ seed: 'EVA-3', loadout: E.referenceKit('commander', 4), events: false, coop: true, pilot: 'minh' });
  const s = setup({ mission: coop });
  s.m.expedition.carried.minh = [{ kind: 'metal', res: 'materials', amount: 40, id: '0,0:1', region: 0 }];
  X.collapse(s.m, 'minh', { x: 30 * T + 32, y: 4 * T + 32 });
  s.eva.sync(s.data);
  tick(s, outside(0, 1), 5);
  await flush();
  assert.deepEqual(s.calls.map(c => c.type), [], 'no deliver is retried while down');
});

// A 2D context that records the vertical extent and fill style of each filled path (the drawings checked with it use no
// transform).
function recorder() {
  const fills = [];
  let box = null;
  const add = (x, y) => { box = box ? { top: Math.min(box.top, y), bottom: Math.max(box.bottom, y) } : { top: y, bottom: y }; };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'beginPath') return () => { box = null; };
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => add(x, y);
      if (k === 'arcTo') return (x1, y1, x2, y2) => { add(x1, y1); add(x2, y2); };
      if (k === 'arc') return (x, y, r) => { add(x, y - r); add(x, y + r); };
      if (k === 'fill') return () => { if (box) fills.push(Object.assign({ style: t.fillStyle }, box)); };
      if (k === 'measureText') return () => ({ width: 30 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, fills };
}

test("a teammate's suit bar is drawn fully above their name tag: standing, walking, lying down and in the rover", () => {
  const s = setup();
  const x = 30 * T + 32, y = 4 * T + 32; // outside the base zone, where the bar shows
  const poses = { standing: {}, walking: { moving: true, phase: Math.PI / 2 }, 'lying down': { down: true }, 'in the rover': { rover: true } };
  for (const [pose, extra] of Object.entries(poses)) {
    const tags = [], drawn = recorder(), bar = s.eva.suitBar({ x, y, suit: 75 }); // what surface.js passes for a teammate
    P.sprites.drawAvatar(recorder().ctx, Object.assign({ x, y, dir: 'down', phase: 0, moving: false, color: '#4fd0c4', bar }, extra), 'Lena', 0.3, tags, null);
    P.sprites.drawTags(drawn.ctx, tags);
    const bars = drawn.fills.filter(f => f.style === 'rgba(20,14,16,0.8)'), tag = drawn.fills.find(f => f.style === 'rgba(20,14,16,0.78)');
    assert.equal(bars.length, 1, pose + ': a bar is drawn');
    assert.ok(bars[0].bottom < tag.top, pose + ': the bar ends ' + (y - bars[0].bottom) + ' px above the feet, the tag starts ' + (y - tag.top) + ' px above them');
  }
  assert.equal(s.eva.suitBar({ x, y, suit: 75 }), 0.5, 'half a suit, half a bar');
  assert.equal(s.eva.suitBar({ x: 32, y: 32, suit: 75 }), null, 'no bar in the base zone');
  assert.equal(s.eva.suitBar({ x, y, suit: D.EXPEDITION.suit }), null, 'no bar with a full suit');
  assert.equal(s.eva.suitBar({ x, y }), null, 'no bar without a suit level');
});

test('the suit value takes its seconds unit from the language table, the same unit paused at the base and draining outside', () => {
  const I = require('../src/i18n.js');
  const want = { en: ['Suit O₂', 'paused'], vi: ['O₂ bộ đồ', 'tạm dừng'] };
  for (const lang of ['en', 'vi']) {
    const s = setup({ t: (k, p) => I.t(lang, k, p) });
    const [label, , value] = s.eva.el.children[0].children;
    tick(s, outside(0, 1), 1);
    assert.equal(label.textContent, want[lang][0], lang + ': the label');
    assert.equal(value.textContent, D.EXPEDITION.suit + ' s · ' + want[lang][1], lang + ': paused in the base zone');
    tick(s, outside(20, 1), 4.05);
    assert.equal(value.textContent, Math.ceil(s.eva.state().suit) + ' s', lang + ': draining outside');
  }
});

// ---------- dangers (M4b) ----------
// Keys with their parameters, so a test can read what the layer meant to say.
const say = (k, p) => k + (p ? ' ' + JSON.stringify(p) : '');
const NEAR = (tx, ty) => outside(tx, ty); // within 16 tiles of the HQ no dust devil ever comes: a quiet spot to wait in
const flareMission = (seed, extra) => {
  const m = E.createMission({ seed, loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh', coop: !!(extra && extra.coop) });
  m.schedule[m.turn].spe = true;
  return m;
};
const noteOf = s => s.eva.el.children[4].textContent;
const banner = s => ({ hidden: s.eva.alert.hidden, msg: s.eva.alert.children[0].textContent, secs: s.eva.alert.children[1].textContent, cls: s.eva.alert.className });

test('solo: the first step outside in a flare round starts the flare on the round clock; 30 s later the banner counts down', async () => {
  const s = setup({ mission: flareMission('EVA-FLARE-1'), t: say });
  tick(s, NEAR(0, 1), 5);
  await flush();
  assert.equal(s.m.expedition.flare, null, 'nothing while you stay at the base');
  tick(s, NEAR(6, 4), 0.1);
  await flush();
  const starts = s.calls.filter(c => c.type === 'flareStart');
  assert.equal(starts.length, 1);
  assert.ok(Math.abs(starts[0].payload.t - 5.1) < 0.05, "on the round's clock: " + starts[0].payload.t);
  assert.ok(Math.abs(s.m.expedition.flare.warn - (starts[0].payload.t + 30)) < 1e-9);
  tick(s, NEAR(6, 4), 29.5);
  await flush();
  assert.equal(s.calls.filter(c => c.type === 'flareStart').length, 1, 'asked once');
  assert.equal(banner(s).hidden, true, 'no banner before the warning');
  tick(s, NEAR(6, 4), 0.5);
  assert.equal(banner(s).hidden, false);
  assert.equal(banner(s).msg, 'eva.flare.run', 'out in the open: run for cover');
  assert.equal(banner(s).secs, 'eva.secs {"s":60}');
  assert.match(banner(s).cls, /crit/);
  assert.match(noteOf(s), /^eva\.flare\.warned/, 'the warning is said once, in the note screen readers hear');
  assert.ok(s.eva.flareFx(NEAR(6, 4)).warn >= 0, 'the red edge is on');
  tick(s, NEAR(6, 4), 30);
  assert.equal(banner(s).secs, 'eva.secs {"s":30}');
  assert.ok(s.eva.flareFx(NEAR(6, 4)).warn > 0.45, 'and grows as the countdown runs out');
});

test("solo: when the flare's countdown ends the layer asks for the hit; out in the open it is recorded and the banner says so", async () => {
  const s = setup({ mission: flareMission('EVA-FLARE-2'), t: say });
  tick(s, NEAR(6, 4), 90.2);
  await flush();
  const ends = s.calls.filter(c => c.type === 'flareEnd');
  assert.equal(ends.length, 1, 'asked once');
  assert.deepEqual(plain(ends[0].pos), { x: Math.round(NEAR(6, 4).x), y: Math.round(NEAR(6, 4).y) }, 'with where you are');
  assert.deepEqual(plain(s.m.expedition.incidents), [{ crewId: 'minh', kind: 'flare' }]);
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(banner(s).msg, 'eva.flare.hit {"d":15}');
  assert.ok(s.eva.flareFx(NEAR(6, 4)).flash > 0, 'the flash');
  tick(s, NEAR(6, 4), 9);
  assert.equal(banner(s).hidden, true, 'the verdict goes after 8 s');
});

test('solo: under cover when the flare ends (the storm shelter here) nothing is recorded, and the banner says you are covered', async () => {
  const m = flareMission('EVA-FLARE-3');
  m.layout = m.layout.filter(k => !(k.x === 8 && k.y === 2));
  m.layout.push({ type: 'shelter', x: 8, y: 2 }); // world tile (4, 0): outside the base zone
  m.modules.shelter.count = 1;
  const s = setup({ mission: m, t: say });
  tick(s, NEAR(6, 4), 40);
  const shelter = NEAR(4, 0);
  tick(s, shelter, 1);
  assert.equal(banner(s).msg, 'eva.flare.covered');
  assert.equal(s.eva.flareFx(shelter).warn, 0, 'no red edge under cover');
  tick(s, shelter, 50);
  await flush();
  assert.deepEqual(plain(s.m.expedition.incidents), []);
  assert.equal(s.m.expedition.flare.over, true);
  tick(s, shelter, 0.1);
  assert.equal(banner(s).msg, 'eva.flare.missed {"d":15}');
});

test("co-op: the layer never times a flare itself; it runs the server's clock and shows the server's verdict", async () => {
  const m = flareMission('EVA-FLARE-4', { coop: true });
  m.expedition.flare = { warn: 35, end: 95, over: false, hit: [] };
  const s = setup({ mission: m, t: say, clock: { t: 40, at: 0 } });
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(banner(s).secs, 'eva.secs {"s":55}', '95 − 40 on the server clock');
  s.clock.now = 10; // ten seconds later on this computer
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(banner(s).secs, 'eva.secs {"s":45}');
  s.clock.now = 56;
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(banner(s).msg, 'eva.flare.now', 'its time is up; the server has not said who was caught yet');
  m.expedition.flare = { warn: 35, end: 95, over: true, hit: ['minh'] };
  s.eva.sync(s.data);
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(banner(s).msg, 'eva.flare.hit {"d":15}');
  await flush();
  assert.deepEqual(s.calls.filter(c => c.type.startsWith('flare')), [], 'nothing asked: the server times it');
  assert.equal(s.eva.clock(), 96, "the round clock is the server's");
});

test('a clock that lands exactly on the warning shows the full 60 s, never 61 from rounding noise', () => {
  const m = flareMission('EVA-FLARE-6', { coop: true });
  m.expedition.flare = { warn: 203.182, end: 263.182, over: false, hit: [] }; // QA's room: 263.182 − 203.182 is 60.00000000000003
  const s = setup({ mission: m, t: say, clock: { t: 203.182, at: 0 } });
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(banner(s).secs, 'eva.secs {"s":60}');
});

test("co-op: the banner and the red edge judge cover with the slack the server gives every checked action; solo has none", () => {
  const spot = NEAR(3, 1); // the first tile outside the base zone (tiles −2 to 2), but inside the server's 1.5 tiles of slack
  const far = NEAR(6, 1);  // past the slack as well
  const flare = { warn: 35, end: 95, over: false, hit: [] };
  const coop = flareMission('EVA-FLARE-5', { coop: true });
  coop.expedition.flare = Object.assign({}, flare);
  assert.equal(X.inBaseZone(spot), false, 'outside the base zone itself');
  assert.ok(Z.shelterAt(coop, spot, D.EXPEDITION.reach), 'but the server covers it (lib/rooms.js, the flare)');
  assert.equal(Z.shelterAt(coop, far, D.EXPEDITION.reach), null, 'and does not cover the far spot');
  const c = setup({ mission: coop, t: say, clock: { t: 40, at: 0 } });
  tick(c, spot, 0.1);
  assert.equal(banner(c).msg, 'eva.flare.covered', "the banner agrees with the server's verdict");
  assert.match(banner(c).cls, /ok/);
  assert.equal(c.eva.flareFx(spot).warn, 0, 'no red edge');
  tick(c, far, 0.1);
  assert.equal(banner(c).msg, 'eva.flare.run', 'beyond the slack: run for cover');
  assert.ok(c.eva.flareFx(far).warn > 0, 'and the red edge is on');

  // Solo judges with no slack (nothing is sent to a server), so the same spot is in the open there.
  const solo = flareMission('EVA-FLARE-5');
  solo.expedition.flare = Object.assign({}, flare);
  solo.expedition.clock = 40;
  const s = setup({ mission: solo, t: say });
  tick(s, spot, 0.1);
  assert.equal(banner(s).msg, 'eva.flare.run');
  assert.match(banner(s).cls, /crit/);
  const warn = s.eva.flareFx(spot).warn;
  assert.ok(warn > 0, 'the red edge is on');
  tick(s, spot, 10);
  assert.ok(s.eva.flareFx(spot).warn > warn, 'and grows');
});

// A dust devil, fully formed, far from the base, and the round clock when it is there.
function formedDevil(m) {
  for (let t = 30; t < 400; t += 0.5) {
    const d = Z.devils(m, 40 * T, -40 * T, 120 * T, 40 * T, t).find(k => k.a === 1);
    if (d) return { d, t };
  }
  throw new Error('no devil');
}

test('a dust devil that catches you on foot throws you 2 tiles and takes 10 s of suit, then gives 2 s of calm; the rover is immune', () => {
  const m = E.createMission({ seed: 'EVA-DEVIL', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  m.schedule[m.turn].devil = true;
  const { d, t } = formedDevil(m);
  const s = setup({ mission: m, t: say });
  s.eva.qaClock(t);
  const p = { x: d.x + 20, y: d.y, moving: false, sprinting: false, inRover: false };
  s.eva.step(0.05, p, s.world, 0, null);
  assert.equal(s.pushes.length, 1, 'thrown');
  const [dx, dy] = s.pushes[0];
  assert.ok(Math.abs(Math.hypot(dx, dy) - 2 * T) < 1e-6, '2 tiles');
  assert.ok(dx > 0, 'away from the devil');
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 10 - 0.05)) < 1e-6, '−10 s of suit (and 0.05 s of breathing)');
  assert.match(noteOf(s), /^eva\.devil/);
  for (let i = 0; i < 19; i++) s.eva.step(0.1, Object.assign({}, p, { x: d.x + 5 }), s.world, 0, null);
  assert.equal(s.pushes.length, 1, 'no second hit within 2 s');
  const r = setup({ mission: m, t: say });
  r.eva.qaClock(t);
  r.eva.step(0.05, Object.assign({}, p, { inRover: true }), r.world, 0, null);
  assert.equal(r.pushes.length, 0, 'the rover is immune');
});

test('the canister button shows only when breathing one is worth it, and breathing sends your live suit level', async () => {
  const s = setup();
  const btn = s.eva.el.children[3];
  const CAN = { kind: 'pod', res: 'o2', amount: 30, canister: true, id: '1,1:0', region: 0 };
  s.m.expedition.carried.minh = [Object.assign({}, CAN)];
  tick(s, NEAR(0, 1), 0.1);
  assert.equal(btn.hidden, true, 'at the base the suit is paused: keep it (it is delivered there, 30 kg of O₂)');
  await flush();
  s.m.expedition.carried.minh = [Object.assign({}, CAN)]; // carry another one out
  s.eva.qaSuit(120);
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(btn.hidden, true, 'above 105 s some of it would be wasted');
  s.eva.qaSuit(100);
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(btn.hidden, false);
  s.eva.canister(NEAR(6, 4));
  await flush();
  const asked = s.calls.find(c => c.type === 'canister');
  assert.equal(asked.payload.suit, 99.9, 'the level your game has now');
  assert.ok(Math.abs(s.eva.state().suit - 144.9) < 1e-6);
  const coop = E.createMission({ seed: 'EVA-CAN', loadout: E.referenceKit('commander', 4), events: false, coop: true, pilot: 'minh' });
  coop.expedition.carried.minh = [{ kind: 'pod', res: 'o2', amount: 30, canister: true, id: '1,1:0', region: 0 }];
  X.collapse(coop, 'minh', NEAR(6, 4));
  const c = setup({ mission: coop });
  tick(c, NEAR(6, 4), 0.1);
  assert.equal(c.eva.el.children[3].hidden, true, 'not while you are down');
});

test("every 2 s the layer reports the suit, the rover's distance, the round's clock and where you stand; a reload picks the clock up", () => {
  const s = setup();
  tick(s, NEAR(6, 4), 2.25);
  assert.equal(s.reports.length, 2, 'on the first frame, then every 2 s');
  const r = s.reports[1];
  assert.ok(Math.abs(r.clock - 2.2) < 0.15, 'the round clock: ' + r.clock);
  assert.ok(Math.abs(r.suit - (D.EXPEDITION.suit - r.clock)) < 1e-6, 'the suit, drained one second a second');
  assert.equal(r.driven, null, 'on foot');
  assert.deepEqual(r.at, { x: Math.round(NEAR(6, 4).x), y: Math.round(NEAR(6, 4).y) });
  s.m.expedition.clock = 77.5;
  const again = setup({ mission: plain(s.m) });
  assert.equal(again.eva.clock(), 77.5, 'a reload resumes the round clock from the save');
  const next = E.resolveTurn(s.m, E.defaultPlan(s.m)).state;
  s.eva.sync({ mission: next, controlId: 'minh', lang: 'en' });
  assert.equal(s.eva.clock(), 0, 'a new round starts its clock at 0');
});

test('while you are down your suit level is not reported, so a position in flight cannot undo a revive', () => {
  const coop = E.createMission({ seed: 'EVA-DOWN', loadout: E.referenceKit('commander', 4), events: false, coop: true, pilot: 'minh' });
  const s = setup({ mission: coop });
  assert.equal(s.eva.report().suit, D.EXPEDITION.suit);
  X.collapse(coop, 'minh', NEAR(6, 4));
  s.eva.sync(s.data);
  assert.equal(s.eva.report().suit, null);
});

test('the round brief says what is waiting outside: a solar flare, dust devils, a dust storm, an O₂ leak', () => {
  const m = E.createMission({ seed: 'EVA-BRIEF', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  Object.assign(m.schedule[m.turn], { spe: true, devil: true, weather: 'regional' });
  m.events = [{ type: 'o2_rupture', options: ['hide', 'salvage'], emergency: true }];
  const s = setup({ mission: m, t: say });
  tick(s, NEAR(0, 1), 0.1);
  assert.equal(noteOf(s), 'eva.brief {"list":"eva.brief.flare, eva.brief.devils, eva.brief.storm {\\"n\\":5}, eva.brief.rupture"}');
  const quiet = setup({ t: say });
  tick(quiet, NEAR(0, 1), 0.1);
  assert.equal(noteOf(quiet), '', 'nothing to say in a quiet round');
});

// ---------- paths no earlier test reached (M4a follow-ups) ----------

test('with E still held after a load, the next load of the same find starts at once', async () => {
  const s = setup();
  let f = null;
  for (let cy = -2; cy < 2 && !f; cy++) for (let cx = -2; cx < 2 && !f; cx++) for (const g of X.findsIn(s.m, cx, cy)) if (g.kind === 'metal' && !f) f = Object.assign({ cx, cy }, g);
  s.world.get(f.cx, f.cy);
  const p = outside(f.x, f.y - 1), focus = s.eva.focusAt((f.x + 0.5) * T, (f.y + 0.5) * T, p, s.world);
  const role = s.m.crew.find(c => c.id === 'minh').role;
  s.eva.start(focus);
  tick(s, p, X.holdSeconds('metal', role) + 0.2, focus);
  await flush();
  assert.equal(s.m.expedition.carried.minh.length, 1);
  assert.equal(s.eva.state().hold, focus.key, 'E is still held: the next load is under way');
  s.eva.stop();
  assert.equal(s.eva.state().hold, null);
});

test('holding E by a dropped load picks it up, and by a collapsed crewmate (co-op) revives them', async () => {
  const s = setup();
  s.m.expedition.drops.push({ id: '0:lena', x: 20 * T, y: 32, items: [{ kind: 'metal', res: 'materials', amount: 40, id: '1,1:0', region: 0 }] });
  const p = outside(20, -1);
  const drop = s.eva.focusAt(20 * T, 32, p, s.world);
  assert.equal(drop.kind, 'drop');
  s.eva.start(drop);
  tick(s, p, X.holdSeconds('pickup', s.m.crew.find(c => c.id === 'minh').role) + 0.2, drop);
  await flush();
  assert.equal(s.calls.filter(c => c.type === 'pickup').length, 1);
  assert.equal(s.m.expedition.carried.minh.length, 1);
  const coop = E.createMission({ seed: 'EVA-REV', loadout: E.referenceKit('commander', 4), events: false, coop: true });
  X.collapse(coop, 'lena', { x: 20 * T, y: 32 });
  const c = setup({ mission: coop });
  const down = c.eva.focusAt(20 * T, 32, p, c.world);
  assert.equal(down.kind, 'revive');
  c.eva.start(down);
  const role = coop.crew.find(k => k.id === 'minh').role;
  tick(c, p, X.holdSeconds('revive', role) + 0.2, down);
  await flush();
  assert.equal(c.calls.filter(k => k.type === 'revive').length, 1);
  assert.equal(coop.expedition.collapsed.lena, undefined, 'lena is up');
});

test('taking over another astronaut mid-round picks up their suit; a new round recharges the rover', () => {
  const s = setup();
  s.m.expedition.suits.diego = 40;
  s.eva.sync({ mission: s.m, controlId: 'diego', lang: 'en' });
  assert.equal(s.eva.state().suit, 40, "diego's suit, not minh's");
  s.m.expedition.roverDriven = 100;
  s.eva.sync({ mission: s.m, controlId: 'diego', lang: 'en' });
  assert.equal(s.eva.report().driven, 100);
  const next = E.resolveTurn(s.m, E.defaultPlan(s.m)).state;
  s.eva.sync({ mission: next, controlId: 'diego', lang: 'en' });
  assert.equal(s.eva.report().driven, 0, 'recharged overnight');
});
