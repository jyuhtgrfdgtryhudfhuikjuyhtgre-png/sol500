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
  const n = { children: [], style: {}, hidden: false, className: '', innerHTML: '', title: '', attrs: {} };
  let text = '';
  Object.defineProperty(n, 'textContent', { get: () => text, set: v => { text = String(v); n.children = []; } }); // as the DOM's: it replaces the children
  n.appendChild = c => { n.children.push(c); return c; };
  n.append = (...cs) => { n.children.push(...cs); };
  n.addEventListener = () => {};
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.classList = { add: c => { n.className += ' ' + c; } };
  return n;
}
const ART = fs.readFileSync(path.join(__dirname, '..', 'src', 'art.js'), 'utf8');
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'surface-eva.js'), 'utf8');

// A surface layer for a mission; hooks run the rules' one table on it (Z.act, as ui.js does in solo play and the server in
// co-op) and record every call, every 2-second report, every card asked for and every dust-devil push. `clock.now` is the wall clock the layer
// reads (co-op's round clock runs on it). `answer(type, payload)`, when it returns something, answers in the rules' place
// (a server's refusal).
function setup(opts) {
  const o = opts || {};
  // `o.paint` replaces SolPaint sprite painters (to see what is drawn).
  const paint = o.paint ? Object.assign({}, P, { sprites: Object.assign({}, P.sprites, o.paint) }) : P;
  const sandbox = { SolData: D, SolEngine: E, SolWorldgen: W, SolExpedition: X, SolDangers: Z, SolPaint: paint, SolWorld: SW, SolPhysics: require('../src/physics.js'), document: { createElement: element } };
  vm.runInNewContext(ART, sandbox);
  vm.runInNewContext(SOURCE, sandbox);
  const m = o.mission || E.createMission({ seed: 'EVA-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  const me = o.me || 'minh';
  const calls = [], home = [], reports = [], pushes = [], cards = [], clock = { now: 0 }, player = { p: null };
  const hooks = {
    exp: (type, payload, pos) => {
      calls.push({ type, payload, pos });
      return Promise.resolve((o.answer && o.answer(type, payload)) || Z.act(m, me, type, payload, pos));
    },
    suit: r => reports.push(JSON.parse(JSON.stringify(r))),
    card: c => cards.push(JSON.parse(JSON.stringify(c))),
    cardUp: () => o.cardUp ? o.cardUp() : false,
    goals: o.goals, // ui.js's goals hook (the hud branch adds it): o.goals() → [{ text, done, frac }]
  };
  const eva = sandbox.SolEva.create({
    t: o.t || (k => k), hooks: () => hooks, crewName: id => id, player: () => player.p, home: () => home.push(1), drawRover: () => {},
    now: () => clock.now, push: (dx, dy) => pushes.push([dx, dy]), team: o.team, // `o.team()`: where the crew stand
  });
  const data = { mission: m, controlId: me, lang: 'en', clock: o.clock || null };
  eva.sync(data);
  const world = SW.create(m.seed);
  return { eva, m, calls, home, data, world, reports, pushes, cards, clock, player };
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

test("the rover's battery reads 2 tiles, then 1 tile, not 1 tiles", () => {
  const I = require('../src/i18n.js'), s = setup({ t: (k, p) => I.t('en', k, p) }), p = Object.assign(outside(20, 1), { inRover: true });
  const left = () => s.eva.el.children.find(n => / batt$/.test(n.className)).children[2].textContent;
  for (const [range, want] of [[2, '2 tiles'], [1.5, '1 tile']]) {
    s.m.expedition.roverDriven = D.EXPEDITION.roverRange - range;
    s.eva.sync(s.data);
    tick(s, p, 0.1);
    assert.equal(left(), want);
  }
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

test("bunched name tags keep clear of each other's suit bars, and your own tag is laid out first", () => {
  const tags = [], drawn = recorder();
  for (const text of ['A', 'B', 'C', 'D']) tags.push({ x: 500, y: 300, text, color: '#fff', you: undefined, bar: 0.5 });
  tags.push({ x: 500, y: 300, text: 'Me', color: '#fff', you: true, bar: null });
  P.sprites.drawTags(drawn.ctx, tags);
  const mine = drawn.fills.find(f => f.style === 'rgba(140,188,236,0.92)');
  assert.equal(mine.top, 286, 'yours is first, so it stays where it was and the others move');
  const boxes = drawn.fills.filter(f => f.style === 'rgba(20,14,16,0.78)').sort((a, b) => a.top - b.top);
  const bars = drawn.fills.filter(f => f.style === 'rgba(20,14,16,0.8)').sort((a, b) => a.top - b.top);
  assert.equal(boxes.length, 4);
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i - 1].bottom < bars[i].top, 'the tag above ends above the bar below it: ' + boxes[i - 1].bottom + ' vs ' + bars[i].top);
});

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
const noteOf = s => s.eva.el.children.find(n => n.className.startsWith('sf-evanote')).textContent;
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
  assert.equal(X.inBaseZone(coop, spot), false, 'outside the base zone itself');
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

// A 2D context that keeps the middle of every ellipse drawn: the amber rings round the cover.
function ringRecorder() {
  const at = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'ellipse' ? (x, y) => at.push([x, y]) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  return { ctx, at };
}

test("while a flare's warning runs, the amber rings mark every cover the lister has in view, from the chunks the surface holds", () => {
  const m = flareMission('EVA-RINGS');
  m.layout = m.layout.filter(k => !(k.x === 8 && k.y === 2));
  m.layout.push({ type: 'shelter', x: 8, y: 2 }); // world tile (4, 0)
  m.modules.shelter.count = 1;
  m.expedition.flare = { warn: 0, end: 600, over: false, hit: [] }; // the countdown runs from the start
  const s = setup({ mission: m, t: say });
  const view = [-64, -128, 1280, 1600]; // tiles −1 to 20 across and −2 to 25 down (world px): the storm shelter and a cave
  const rings = world => { const r = ringRecorder(); s.eva.drawZone(r.ctx, ...view, world); return r.at; };
  assert.deepEqual(rings(SW.create(m.seed)), [[4.5 * T, 0.5 * T + 6]], 'a surface that holds none of the chunks rings only the storm shelter');
  for (const [cx, cy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) s.world.get(cx, cy);
  const spots = Z.coversIn(m, view[0] / T - 1, view[1] / T - 1, view[2] / T + 1, view[3] / T + 1, s.world.peek);
  assert.ok(spots.some(c => c.kind === 'cave'), 'a cave in view');
  assert.deepEqual(rings(s.world), spots.map(c => [c.x * T, c.y * T + 6]), "every one of the lister's spots, and nothing else");
  m.expedition.flare = null;
  assert.deepEqual(rings(s.world), [], 'no rings without a warning');
});

test("the banner, the red edge and the in-cave note read the chunks the surface holds: a frame never builds one, so a cave not built yet is no cover on screen", () => {
  const m = flareMission('EVA-RINGS');
  m.expedition.flare = { warn: 0, end: 600, over: false, hit: [] };
  const s = setup({ mission: m, t: say });
  let k = null; // the cave nearest the HQ
  for (let cy = -2; cy < 2; cy++) for (let cx = -2; cx < 2; cx++) for (const c of X.cavesIn(m, cx, cy)) if (!k || Math.hypot(c.x, c.y) < Math.hypot(k.x, k.y)) k = c;
  const mouth = outside(k.x, k.y);
  tick(s, NEAR(0, 1), 8.1); // the round brief's note goes after 8 s
  const blind = { peek: () => null, region: (tx, ty) => s.world.region(tx, ty) }; // a surface with no chunk built yet
  s.eva.step(0.1, mouth, blind, 0, null);
  assert.equal(banner(s).msg, 'eva.flare.run', 'in the open, as far as this screen knows');
  assert.ok(s.eva.flareFx(mouth).warn > 0, 'with the red edge');
  assert.equal(noteOf(s), '', 'and no in-cave note');
  s.world.get(SW.chunkOf(k.x), SW.chunkOf(k.y)); // the surface holds the chunk you stand in
  s.eva.step(0.1, mouth, s.world, 0, null);
  assert.equal(banner(s).msg, 'eva.flare.covered');
  assert.equal(s.eva.flareFx(mouth).warn, 0, 'no red edge');
  assert.equal(noteOf(s), 'eva.inCave');
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
  const canBtn = e => e.eva.el.children.find(n => n.className === 'sf-can'), btn = canBtn(s);
  const CAN = { kind: 'pod', res: 'o2', amount: 30, canister: true, id: '1,1:0', region: 0 };
  s.m.expedition.carried.minh = [Object.assign({}, CAN)];
  tick(s, NEAR(0, 1), 0.1);
  assert.equal(btn.hidden, true, 'at the base the suit is paused: keep it (it is delivered there, 10 kg of O₂)');
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
  assert.equal(canBtn(c).hidden, true, 'not while you are down');
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

test('the round brief shows after a seat change at an advance, too', () => {
  const s = setup({ t: say });
  tick(s, NEAR(0, 1), 9); // round 1's note is gone
  const next = E.resolveTurn(s.m, E.defaultPlan(s.m)).state;
  Object.assign(next.schedule[next.turn], { spe: true });
  const other = next.crew.find(c => c.id !== 'minh' && c.status === 'active').id;
  s.eva.sync({ mission: next, controlId: other, lang: 'en' }); // a takeover at the advance: another seat in the next round
  tick(s, NEAR(0, 1), 0.1);
  assert.match(noteOf(s), /^eva\.brief /, 'the new round is briefed');
});

test('a card over the HUD hides the round brief: it is said again when the card closes', () => {
  let up = false;
  const m = E.createMission({ seed: 'EVA-BRIEF', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  Object.assign(m.schedule[m.turn], { spe: true });
  const s = setup({ mission: m, t: say, cardUp: () => up });
  tick(s, NEAR(0, 1), 0.1);
  assert.match(noteOf(s), /^eva.brief /);
  up = true; // a region's card opens over the note
  tick(s, NEAR(0, 1), 15); // for its 15 s, longer than the note
  up = false;
  tick(s, NEAR(0, 1), 0.1);
  assert.match(noteOf(s), /^eva.brief /, 'the note comes back');
  tick(s, NEAR(0, 1), 9);
  assert.equal(noteOf(s), '', 'and goes, once, after its 8 s');
  const seen = setup({ mission: m, t: say, cardUp: () => up });
  tick(seen, NEAR(0, 1), 9); // no card over it: nothing to repeat
  up = true; up = false;
  tick(seen, NEAR(0, 1), 1);
  assert.equal(noteOf(seen), '');
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

// ---------- points of interest (M4c) ----------
// Seed PAINT-QA-1 has every kind of point of interest near the HQ (the painter's QA seed); EVA-POI has a find and a cave
// under a footprint. Places are world tiles.
const QA = { skylight: [-182, 441], crest: [393, 24], podIn: [291, -32], cache: [-25, 47], weather: [13, 48], mast: [-137, 105], array: [-40, -50] };
const poiMission = o => E.createMission(Object.assign({ seed: 'PAINT-QA-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' }, o));
const quiet = m => { Object.assign(m.schedule[m.turn], { weather: 'clear', spe: false, devil: false }); return m; };
const hold = (s, tx, ty) => s.world.get(SW.chunkOf(tx), SW.chunkOf(ty)); // the surface holds the chunk of that tile
// The same surface with every chunk's `hidden` emptied: what the layer would show if it read the lists raw.
const raw = world => ({ peek: (cx, cy) => { const c = world.peek(cx, cy); return c && Object.assign({}, c, { hidden: { finds: [], caves: [] } }); }, seen: world.seen, region: world.region });

test('a find or a cave under a point of interest is never offered, drawn or marked on the map', () => {
  const s = setup({ mission: quiet(poiMission({ seed: 'EVA-POI' })), t: say });
  const W0 = W.seedOf('EVA-POI'), fc = W.chunk(W0, -2, 5), f = fc.finds[fc.hidden.finds[0]], kc = W.chunk(W0, 9, -10), k = kc.caves[kc.hidden.caves[0]];
  for (const [x, y] of [[f.x, f.y], [k.x, k.y]]) { hold(s, x, y); s.world.reveal(x, y, 6); }
  const p = outside(f.x, f.y);
  assert.equal(s.eva.focusAt(p.x, p.y, p, raw(s.world)).id, '-2,5:' + f.n, 'read raw, the hidden find would be offered');
  const focus = s.eva.focusAt(p.x, p.y, p, s.world);
  assert.notEqual(focus && focus.id, '-2,5:' + f.n, 'it is not');
  const box = [(f.x - 1) * T, (f.y - 1) * T, (f.x + 2) * T, (f.y + 2) * T];
  s.player.p = p;
  assert.equal(s.eva.sprites(...box, raw(s.world), 0).length - s.eva.sprites(...box, s.world, 0).length, 1, 'one sprite fewer: the hidden find');
  const marks = (world, x, y) => { tick(s, NEAR(0, 1), 0.2); return s.eva.marks(world, x * T, y * T).filter(q => q.x === (f.x + 0.5) * T && q.y === (f.y + 0.5) * T || q.x === (k.x + 0.5) * T && q.y === (k.y + 0.5) * T).length; };
  assert.equal(marks(raw(s.world), f.x, f.y), 1, 'read raw, the find would be marked');
  assert.equal(marks(s.world, f.x, f.y), 0, 'it is not');
  assert.equal(marks(raw(s.world), k.x, k.y), 1, 'read raw, the cave would be marked');
  assert.equal(marks(s.world, k.x, k.y), 0, 'it is not');
});

test("the view is the headlamp's in a lava tube and the weather's plus 4 on a star dune's crest, also in a dust storm; the dust devils fade at its edge", () => {
  const m = poiMission();
  Object.assign(m.schedule[m.turn], { weather: 'global', devil: true });
  const s = setup({ mission: m, t: say });
  const at = ([x, y]) => outside(x, y), [sx, sy] = QA.skylight;
  for (const [x, y] of [QA.skylight, QA.crest]) hold(s, x, y);
  s.eva.step(0.1, at(QA.skylight), s.world, 0, null); // a frame: the layer now reads the chunks the surface holds
  assert.equal(s.eva.view(at(QA.skylight)), D.DANGERS.view.clear, "under the tube's skylight: the headlamp, whatever the storm");
  assert.equal(s.eva.view(Object.assign(at(QA.skylight), { inRover: true })), D.DANGERS.view.rover, "the rover's headlamps");
  assert.equal(s.eva.view(at(QA.crest)), D.DANGERS.view.global + D.DANGERS.view.crest, "on the dune's crest: the storm's view and 4 more");
  assert.equal(s.eva.view(at([sx, sy + 8])), D.DANGERS.view.global, 'out on open ground: the storm');
  // A formed devil 5 to 8 tiles from the skylight: inside the headlamp's 8 tiles it is drawn; the storm's 3 would hide it.
  const px = (sx + 0.5) * T, py = (sy + 0.5) * T;
  let t = 30, d = null;
  for (; t < 600 && !d; t += 0.5) d = Z.devils(m, px - 12 * T, py - 12 * T, px + 12 * T, py + 12 * T, t).find(k => k.a === 1 && Math.hypot(k.x - px, k.y - py) / T > 5 && Math.hypot(k.x - px, k.y - py) / T < 7.5);
  assert.ok(d, 'a devil near the tube');
  s.player.p = at(QA.skylight);
  s.eva.qaClock(t - 0.5);
  const devils = world => { s.eva.step(0, s.player.p, world, 0, null); return s.eva.sprites(d.x - T, d.y - T, d.x + T, d.y + T, world, 0).filter(q => q.y === d.y).length; };
  assert.equal(devils(s.world), 1, "in the tube's headlamp: the devil is drawn");
  assert.equal(devils({ peek: () => null, region: s.world.region }), 0, "on a surface that knows no tube there, the storm's view hides it");
});

test('in a lava tube or a hab pod out on the map, the note says you are in cover from a solar flare, in its own words', () => {
  const s = setup({ mission: quiet(poiMission()), t: say });
  for (const [x, y] of [QA.skylight, QA.podIn]) hold(s, x, y);
  s.eva.step(0.1, outside(...QA.skylight), s.world, 0, null);
  assert.equal(noteOf(s), 'eva.inTube');
  s.eva.step(0.1, outside(...QA.podIn), s.world, 0, null);
  assert.equal(noteOf(s), 'eva.inPod');
  s.eva.step(0.1, outside(QA.podIn[0], QA.podIn[1] + 4), s.world, 0, null);
  assert.equal(noteOf(s), '', 'out of the pod: no note');
});

// Standing on the door of a structure (world tiles), facing it: the focus the surface would get.
const atDoor = (s, [x, y]) => { hold(s, x, y); const p = outside(x, y); return { p, focus: s.eva.focusAt(p.x, p.y - 8 - 34, p, s.world) }; };
const role = (s, id) => s.m.crew.find(c => c.id === id).role;

test("at a Kestrel structure's door, holding E opens, salvages or repairs it once: the prompt names it and its seconds, the loads go into the backpack, and its story log opens", async () => {
  const s = setup({ mission: quiet(poiMission()), t: say });
  const { p, focus } = atDoor(s, QA.cache);
  assert.equal(focus.kind, 'kestrel');
  assert.equal(focus.id, 'S-1,0');
  assert.equal(s.eva.label(focus), 'eva.open ' + JSON.stringify({ what: 'ks.cache.name', s: '3' }));
  assert.equal(s.eva.start(focus), true, 'E holds');
  tick(s, p, X.holdSeconds('cache', role(s, 'minh')) + 0.2, focus);
  await flush();
  s.eva.step(0.1, p, s.world, 0, null); // the HUD shows the answer
  assert.deepEqual(s.calls.filter(c => c.type === 'interact').map(c => plain(c.payload)), [{ structure: 'S-1,0' }]);
  assert.equal(s.m.expedition.structures['S-1,0'], 'used');
  const got = s.m.expedition.carried.minh;
  assert.ok(got.length >= 1 && got.every(i => i.kind === 'cache'), 'its supplies are in the backpack');
  assert.equal(noteOf(s), got.map(i => 'haul.' + i.res + ' ' + JSON.stringify({ n: i.amount })).join(' · '), 'and the note says what');
  assert.deepEqual(s.cards, [{ type: 'log', id: 'S-1,0', kind: 'cache' }], 'its story log opens');
  const again = s.eva.focusAt(p.x, p.y - 42, p, s.world);
  assert.notEqual(again && again.kind, 'kestrel', 'a used cache has no prompt');
});

test('a structure says its own verb and seconds (the Engineer repairs faster); a repair says what it did; loads that do not fit wait at the door', async () => {
  const s = setup({ mission: quiet(poiMission()), t: say });
  const label = (id, at) => { s.eva.sync({ mission: s.m, controlId: id, lang: 'en' }); return s.eva.label(atDoor(s, at).focus); };
  assert.equal(label('minh', QA.weather), 'eva.repair ' + JSON.stringify({ what: 'ks.weather.name', s: '6' }));
  assert.equal(label('lena', QA.weather), 'eva.repair ' + JSON.stringify({ what: 'ks.weather.name', s: '3' }), "the Engineer's 3 s");
  assert.equal(label('minh', QA.mast), 'eva.repair ' + JSON.stringify({ what: 'ks.mast.name', s: '6' }));
  assert.equal(label('minh', QA.array), 'eva.salvage ' + JSON.stringify({ what: 'ks.array.name', s: '5' }));
  const use = async at => {
    const { p, focus } = atDoor(s, at);
    s.eva.start(focus);
    tick(s, p, 6.2, focus);
    await flush();
    s.eva.step(0.1, p, s.world, 0, null);
    return noteOf(s);
  };
  assert.equal(await use(QA.weather), 'eva.repairedWeather ' + JSON.stringify({ n: 20 }));
  assert.ok(Object.keys(s.m.expedition.revealed).length > 0, 'the fog round it is revealed');
  assert.equal(await use(QA.mast), 'eva.repairedMast');
  s.m.expedition.carried.minh = [{ kind: 'ice', res: 'water', amount: 40 }, { kind: 'ice', res: 'water', amount: 40 }]; // room for one more
  assert.equal(await use(QA.array), 'haul.materials ' + JSON.stringify({ n: 40 }) + ' · eva.atDoor ' + JSON.stringify({ n: 1 }));
  assert.deepEqual(s.m.expedition.drops.map(d => [d.id, d.items.length]), [['S-1,-1', 1]], 'the other load is a drop at the door');
  assert.deepEqual(s.cards.map(c => c.kind), ['weather', 'mast', 'array'], 'each story log opens');
});

test("walking into a hab pod fills your suit once a round and opens its log; staying in, or coming back the same round, asks nothing more; a 'refilled' answer is not said", async () => {
  const s = setup({ mission: quiet(poiMission()), t: say });
  const [ix, iy] = QA.podIn, out = outside(ix, iy + 3), inside = outside(ix, iy); // its door, the gap in its south wall, is iy + 2
  hold(s, ix, iy);
  s.eva.qaSuit(50);
  tick(s, outside(ix, iy + 4), 0.5);
  const refills = () => s.calls.filter(c => c.type === 'refill');
  assert.equal(refills().length, 0, 'outside the pod: nothing');
  tick(s, inside, 0.1);
  await flush();
  tick(s, inside, 0.1);
  assert.deepEqual(refills().map(c => plain(c.payload)), [{ pod: 'S4,-1' }]);
  assert.ok(s.eva.state().suit > D.EXPEDITION.suit - 1, "the suit from the rules' answer");
  assert.equal(noteOf(s), 'eva.refilled ' + JSON.stringify({ s: D.EXPEDITION.suit }));
  assert.deepEqual(s.cards, [{ type: 'log', id: 'S4,-1', kind: 'pod' }], "the pod's story log");
  tick(s, inside, 3);
  tick(s, out, 0.5);
  tick(s, inside, 3);
  await flush();
  assert.equal(refills().length, 1, 'once this round');
  assert.equal(s.cards.length, 2, 'walking in again asks for the log again (ui.js shows it once a mission)');
  assert.deepEqual(plain(await s.eva.act('refill', inside, { pod: 'S4,-1' })), { error: 'refilled' });
  tick(s, inside, 0.1);
  assert.doesNotMatch(noteOf(s), /eva\.err/, "and 'refilled' is not said");
});

test("a landmark is discovered when its centre comes into your view: asked once while the answer is out, its card opens with the reward, and it is never asked again", async () => {
  const s = setup({ mission: quiet(poiMission()), t: say });
  const [lx, ly] = [68, 462]; // the river delta L0,1's centre; clear weather: 8 tiles of view
  hold(s, lx, ly);
  tick(s, outside(lx, ly + 9), 1);
  const asked = () => s.calls.filter(c => c.type === 'discover');
  assert.equal(asked().length, 0, '9 tiles away: not in view');
  tick(s, outside(lx, ly + 8), 1); // ten frames before the answer is read
  assert.deepEqual(asked().map(c => plain(c.payload)), [{ landmark: 'L0,1' }], 'in view: asked once while the answer is out');
  await flush();
  const science = s.m.expedition.banked.lines.find(l => l.kind === 'landmark').amount;
  assert.deepEqual(s.m.expedition.landmarks['L0,1'], { by: 'minh', round: s.m.turn });
  assert.deepEqual(s.cards, [{ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science }]);
  tick(s, outside(lx, ly + 2), 5);
  await flush();
  assert.equal(asked().length, 1, 'discovered: never asked again');
  assert.deepEqual(plain(await s.eva.act('discover', outside(lx, ly), { landmark: 'L0,1' })), { error: 'known' });
  tick(s, outside(lx, ly), 0.1);
  assert.doesNotMatch(noteOf(s), /eva\.err/, "'known' (a crewmate was first) is not said");
});

test('a refused discovery is asked again 3 s later while the landmark is still in view and undiscovered, and opens no card', async () => {
  const s = setup({ mission: quiet(poiMission()), t: say, answer: type => (type === 'discover' ? { error: 'tooFar' } : null) });
  hold(s, 68, 462);
  const asked = () => s.calls.filter(c => c.type === 'discover').length;
  tick(s, outside(68, 465), 0.1);
  await flush();
  tick(s, outside(68, 465), 2.8);
  assert.equal(asked(), 1, 'not again within 3 s of the refusal');
  tick(s, outside(68, 465), 0.3);
  assert.equal(asked(), 2, 'again after 3 s');
  assert.deepEqual(s.cards, []);
});

test("the sites of landmarks and formations are offered, drawn and marked as finds by their own ids, once each; surveying a formation opens its fact", async () => {
  const s = setup({ mission: quiet(poiMission()), t: say });
  const site = [63, 466], centre = [68, 462], spot = [37, 12]; // the delta L0,1's sites 0 and 1, the ventifact F1,0's survey
  for (const [x, y] of [site, centre, spot]) { hold(s, x, y); s.world.reveal(x, y, 3); }
  for (const [cx, cy] of [[1, 13], [2, 13], [1, 14], [2, 14]]) s.world.get(cx, cy); // every chunk the delta's box touches
  const p = outside(...site), f = s.eva.focusAt(p.x, p.y, p, s.world), survey = String(X.holdSeconds('science', role(s, 'minh')));
  assert.deepEqual(f && [f.kind, f.id], ['find', 'L0,1:0'], "the delta's site, offered as a find");
  assert.equal(s.eva.label(f), 'eva.survey ' + JSON.stringify({ what: 'find.science · sci.delta', s: survey }));
  s.player.p = p;
  const box = [(site[0] - 1) * T, (site[1] - 1) * T, (site[0] + 1) * T, (site[1] + 1) * T];
  assert.equal(s.eva.sprites(...box, s.world, 0).filter(q => q.y === (site[1] + 0.5) * T + 12).length, 1, 'drawn');
  tick(s, NEAR(0, 1), 0.2);
  const at = ([x, y]) => s.eva.marks(s.world, x * T, y * T).filter(q => q.x === (x + 0.5) * T && q.y === (y + 0.5) * T).length;
  assert.equal(at(centre), 1, 'marked once, though four chunks list the delta');
  const q = outside(...spot), g = s.eva.focusAt(q.x, q.y, q, s.world);
  assert.deepEqual(g && [g.kind, g.id], ['find', 'F1,0:0'], "the ventifact's survey");
  assert.equal(s.eva.label(g), 'eva.survey ' + JSON.stringify({ what: 'find.science · sci.ventifact', s: survey }));
  s.eva.start(g);
  tick(s, q, X.holdSeconds('science', role(s, 'minh')) + 0.2, g);
  await flush();
  assert.deepEqual(s.calls.filter(c => c.type === 'collect').map(c => plain(c.payload)), [{ find: 'F1,0:0' }]);
  assert.equal(s.m.expedition.carried.minh[0].sub, 'ventifact');
  assert.deepEqual(s.cards, [{ type: 'formation', id: 'F1,0', kind: 'ventifact' }], "the formation's fact and source");
  const h = s.eva.focusAt(q.x, q.y, q, s.world);
  assert.notEqual(h && h.id, 'F1,0:0', 'surveyed: gone');
});

test("a collect's note says what it hauled, from a plain find, a landmark's site or a formation's survey, never that you revived someone", async () => {
  // Holds E on the focus until one collect is asked, lets go, and returns the note and the note the load should give.
  const collect = async (s, p, f) => {
    const asked = () => s.calls.filter(c => c.type === 'collect').length, before = asked();
    s.eva.start(f);
    for (let i = 0; i < 300 && asked() === before; i++) s.eva.step(0.1, p, s.world, 0, f);
    s.eva.stop();
    await flush();
    s.eva.step(0.1, p, s.world, 0, null); // the HUD shows the answer
    const got = s.m.expedition.carried.minh.at(-1);
    return [noteOf(s), 'haul.' + got.res + ' ' + JSON.stringify({ n: got.amount })];
  };
  const a = setup({ t: say });
  let f = null;
  for (let cy = -2; cy < 2 && !f; cy++) for (let cx = -2; cx < 2 && !f; cx++) for (const g of X.findsIn(a.m, cx, cy)) if (g.kind === 'metal' && !f) f = Object.assign({ cx, cy }, g);
  a.world.get(f.cx, f.cy);
  const p = outside(f.x, f.y - 1);
  assert.equal(...(await collect(a, p, a.eva.focusAt((f.x + 0.5) * T, (f.y + 0.5) * T, p, a.world))), 'a plain find');
  const s = setup({ mission: quiet(poiMission()), t: say });
  for (const [cx, cy] of [[1, 13], [2, 13], [1, 14], [2, 14]]) s.world.get(cx, cy); // every chunk the delta's box touches
  for (const [x, y, what] of [[63, 466, "the delta's site"], [37, 12, "the ventifact's survey"]]) {
    hold(s, x, y); s.world.reveal(x, y, 3);
    const q = outside(x, y);
    assert.equal(...(await collect(s, q, s.eva.focusAt(q.x, q.y, q, s.world))), what);
  }
});

// ---------- relay beacons, pings and the team (M4d) ----------
const ARTS = (() => { const sb = {}; vm.runInNewContext(ART, sb); return sb.SolArt; })();
const METAL = () => ({ kind: 'metal', res: 'materials', amount: 40, id: '0,0:1', region: 0 });

test("a beacon kit stays in the backpack at the base: a pack of kits only asks for no delivery; with a load, the note counts what was banked, and the kit's own button shows it stays (R30)", async () => {
  const s = setup({ t: say });
  s.m.expedition.carried.minh = [E.kitItem()];
  tick(s, outside(1, 1), 3);
  await flush();
  assert.equal(s.calls.filter(c => c.type === 'deliver').length, 0, 'nothing to deliver: no request every 1.5 s');
  s.m.expedition.carried.minh = [E.kitItem(), METAL()];
  tick(s, outside(1, 1), 0.1);
  await flush();
  tick(s, outside(1, 1), 0.1);
  assert.equal(s.calls.filter(c => c.type === 'deliver').length, 1);
  assert.equal(s.m.expedition.banked.materials, 40);
  assert.equal(noteOf(s), 'eva.delivered1 ' + JSON.stringify({ n: 1 }), 'one load, not two, and no line about the kit: the note stays two lines in the HUD column (R30)');
  assert.deepEqual(plain(s.m.expedition.carried.minh), [plain(E.kitItem())], 'the kit is still in the backpack');
  const back = s.eva.el.children.find(n => n.className.split(' ').includes('sf-kitback'));
  assert.equal(back.hidden, false, 'its "Put the beacon kit back" button is up, so the HUD shows the kit stays');
});

test('the backpack shows a carried kit with its own icon and name', () => {
  const s = setup({ t: say });
  s.m.expedition.carried.minh = [METAL(), E.kitItem()];
  tick(s, outside(9, 1), 0.1);
  const slots = s.eva.el.children.find(n => n.className === 'sf-pack').children;
  assert.equal(slots[1].innerHTML, ARTS.icon('kit', 14));
  assert.notEqual(ARTS.icon('kit', 14), ARTS.icon('info', 14), 'an icon of its own, not the fallback');
  assert.equal(slots[1].title, 'mod.kit', "the console's name for it");
  assert.equal(slots[0].innerHTML, ARTS.icon('materials', 14));
});

const button = (s, cls) => s.eva.el.children.find(n => n.className.split(' ').includes(cls));
test('at the base with a kit waiting and room in the backpack, a button (or K) takes one; carrying one there, another puts it back', async () => {
  const s = setup({ t: say });
  const base = outside(0, 1), take = () => button(s, 'sf-kit'), back = () => button(s, 'sf-kitback');
  tick(s, base, 0.1);
  assert.equal(take().hidden, true, 'no kit waiting: no button');
  assert.equal(back().hidden, true);
  s.m.expedition.kits = 2;
  tick(s, base, 0.1);
  assert.equal(take().hidden, false);
  assert.equal(take().textContent, 'eva.takeKit ' + JSON.stringify({ n: 2 }));
  s.eva.takeKit(base);
  await flush();
  tick(s, base, 0.1);
  assert.equal(s.m.expedition.kits, 1);
  assert.deepEqual(plain(s.m.expedition.carried.minh), [plain(E.kitItem())]);
  assert.equal(noteOf(s), 'eva.tookKit ' + JSON.stringify({ n: D.EXPEDITION.beacon.base }), 'the note says how far out it goes');
  assert.equal(back().hidden, false, 'carrying one at the base, it can go back');
  assert.equal(take().textContent, 'eva.takeKit ' + JSON.stringify({ n: 1 }), 'and the other can come too');
  tick(s, outside(9, 1), 0.1);
  assert.deepEqual([take().hidden, back().hidden], [true, true], 'out of the base zone: neither');
  s.eva.returnKit(base);
  await flush();
  tick(s, base, 0.1);
  assert.deepEqual([s.m.expedition.kits, s.m.expedition.carried.minh.length], [2, 0]);
  assert.equal(noteOf(s), 'eva.returnedKit');
  assert.equal(back().hidden, true);
  s.m.expedition.carried.minh = [E.kitItem(), E.kitItem(), E.kitItem()]; // loads would be delivered here at once
  tick(s, base, 0.1);
  assert.equal(take().hidden, true, 'a full backpack takes no kit');
});

// The first tile east of the HQ, `from` tiles out or more along row `ty`, where nothing else is in reach and a beacon may go
// (the surface holds its chunk). → [tx, ty]
function openSpot(s, from, ty) {
  for (let tx = from; tx < from + 60; tx++) {
    hold(s, tx, ty);
    const p = outside(tx, ty), f = s.eva.focusAt(p.x, p.y + 34, p, s.world);
    if (f && f.kind === 'beacon' && f.spot.ok) return [tx, ty];
  }
  throw new Error('no open spot');
}
const beaconName = i => say('eva.beaconName', { n: i + 1 });

test('carrying a kit on the map, the prompt says why a beacon cannot go here (the tiles still to go), or to hold E for its 4 s; the note names it', async () => {
  const s = setup({ mission: quiet(E.createMission({ seed: 'EVA-BEACON', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' })), t: say });
  const facing = p => s.eva.focusAt(p.x, p.y + 34, p, s.world);
  assert.equal(facing(outside(14, 0)), null, 'no kit: nothing to place');
  s.m.expedition.carried.minh = [E.kitItem()];
  hold(s, 6, 0);
  let f = facing(outside(6, 0));
  assert.equal(f.kind, 'beacon');
  assert.equal(s.eva.label(f), say('eva.beaconNearBase', { n: D.EXPEDITION.beacon.base - 6 }));
  // One tile short, the prompt has its own words ("1 more tile", not "1 more tiles"), on a tile of column tx or just below.
  const oneShort = (tx, ty) => {
    for (let d = 0; d < 5; d++) { hold(s, tx, ty + d); const g = facing(outside(tx, ty + d)); if (g && g.kind === 'beacon') return g; }
    throw new Error('no spot');
  };
  assert.equal(s.eva.label(oneShort(D.EXPEDITION.beacon.base - 1, 0)), say('eva.beaconNearBase1', { n: 1 }));
  assert.equal(s.eva.holdable(f), false, 'nothing to hold');
  assert.equal(s.eva.start(f), false);
  assert.equal(facing(Object.assign(outside(14, 0), { inRover: true })), null, 'in the rover, E gets you out first');
  assert.equal(facing(outside(1, 1)), null, 'in the base zone: no beacon');
  const [bx, by] = openSpot(s, D.EXPEDITION.beacon.base, 0), p = outside(bx, by);
  f = facing(p);
  assert.equal(s.eva.label(f), say('eva.placeBeacon', { s: String(X.holdSeconds('beacon', 'commander')) }));
  assert.equal(s.eva.holdable(f), true);
  assert.equal(s.eva.start(f), true);
  tick(s, p, X.holdSeconds('beacon', 'commander') + 0.2, f);
  await flush();
  s.eva.step(0.1, p, s.world, 0, null);
  assert.deepEqual(s.calls.filter(c => c.type === 'placeBeacon').map(c => plain(c.pos)), [{ x: Math.round(p.x), y: Math.round(p.y) }]);
  assert.deepEqual(plain(s.m.expedition.beacons), [{ x: bx, y: by, by: 'minh', round: 0 }]);
  assert.equal(s.m.expedition.carried.minh.length, 0, 'the kit is used up');
  assert.equal(noteOf(s), say('eva.placed', { name: beaconName(0), r: D.EXPEDITION.beacon.refill }));
  // The next kit: too close to the first beacon.
  s.m.expedition.carried.minh = [E.kitItem()];
  const q = outside(bx + 4, by);
  hold(s, bx + 4, by);
  assert.equal(s.eva.label(facing(q)), say('eva.beaconNearBeacon', { name: beaconName(0), n: D.EXPEDITION.beacon.apart - 4 }));
  assert.equal(s.eva.label(oneShort(bx + D.EXPEDITION.beacon.apart - 1, by)), say('eva.beaconNearBeacon1', { name: beaconName(0), n: 1 }));
  hold(s, bx + 4, by);
  s.m.expedition.beacons.push(...Array.from({ length: D.EXPEDITION.beacon.max - 1 }, (_, i) => ({ x: 500 + 20 * i, y: 500, by: 'minh', round: 0 })));
  assert.equal(s.eva.label(facing(q)), say('eva.beaconLimit', { n: D.EXPEDITION.beacon.max }), 'all six placed');
});

// A mission with relay beacon B0 placed by minh at an open spot 12 or more tiles east of the HQ, and the layer on it.
function withBeacon(o) {
  const drawn = [];
  const s = setup(Object.assign({ mission: quiet(E.createMission({ seed: 'EVA-BEACON', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' })), t: say, paint: { drawBeacon: (ctx, x, y, time, spent) => drawn.push({ x, y, spent }) } }, o));
  s.m.expedition.carried.minh = [E.kitItem()];
  const [bx, by] = openSpot(s, D.EXPEDITION.beacon.base, 0);
  assert.equal(X.placeBeacon(s.m, 'minh', outside(bx, by)).ok, true);
  return Object.assign(s, { bx, by, drawn });
}

test('by a relay beacon a suit low enough is filled once a round; a nearly full one is not, so the refill waits for the way home; the beacon looks spent until the next round', async () => {
  const s = withBeacon(), refills = () => s.calls.filter(c => c.type === 'refill');
  const by2 = outside(s.bx, s.by + 2); // 2 tiles from the beacon
  tick(s, by2, 0.5);
  assert.equal(refills().length, 0, 'a full suit asks for nothing');
  s.eva.qaSuit(D.EXPEDITION.suit - D.EXPEDITION.canister.suit + 1);
  tick(s, by2, 0.5);
  assert.equal(refills().length, 0, 'nor one that would gain less than a canister');
  s.eva.qaSuit(60);
  tick(s, outside(s.bx, s.by + 3), 0.5);
  assert.equal(refills().length, 0, '3 tiles away: too far');
  tick(s, by2, 0.1);
  await flush();
  tick(s, by2, 0.1);
  assert.deepEqual(refills().map(c => plain(c.payload)), [{ beacon: 'B0' }]);
  assert.equal(s.eva.state().suit > D.EXPEDITION.suit - 1, true, "the suit from the rules' answer");
  assert.equal(noteOf(s), say('eva.refilledBeacon', { name: beaconName(0), s: D.EXPEDITION.suit }));
  s.eva.qaSuit(30);
  tick(s, by2, 3);
  await flush();
  assert.equal(refills().length, 1, 'once this round');
  s.drawn.length = 0;
  s.player.p = by2;
  s.eva.sprites((s.bx - 4) * T, (s.by - 4) * T, (s.bx + 4) * T, (s.by + 4) * T, s.world, 0).forEach(q => q.draw({}));
  assert.deepEqual(s.drawn, [{ x: (s.bx + 0.5) * T, y: (s.by + 0.5) * T, spent: true }], 'drawn on its tile, its light dim');
  // The next round: the rules clear x.refills, and the beacon is lit again.
  s.m.expedition.refills = {};
  s.drawn.length = 0;
  s.eva.sprites((s.bx - 4) * T, (s.by - 4) * T, (s.bx + 4) * T, (s.by + 4) * T, s.world, 0).forEach(q => q.draw({}));
  assert.deepEqual(s.drawn.map(d => d.spent), [false]);
});

test('a suit low enough for a refill, by a beacon or in a hab pod that has already refilled it this round, is told why nothing comes, the beacon named, once each a round (R27)', async () => {
  const s = withBeacon(), by2 = outside(s.bx, s.by + 2), refills = () => s.calls.filter(c => c.type === 'refill').length;
  const used = say('eva.refillUsed', { name: beaconName(0) });
  s.eva.qaSuit(60);
  tick(s, by2, 0.1);
  await flush();
  tick(s, by2, 5); // refilled, and its note has gone
  s.eva.qaSuit(D.EXPEDITION.suit - D.EXPEDITION.canister.suit + 1);
  tick(s, by2, 0.1);
  assert.notEqual(noteOf(s), used, 'a suit the beacon would not refill yet: nothing to explain');
  s.eva.qaSuit(30);
  tick(s, by2, 0.1);
  assert.equal(noteOf(s), used, 'low again by the same beacon');
  assert.equal(refills(), 1, 'and nothing more is asked');
  tick(s, by2, 6);
  assert.equal(noteOf(s), 'eva.low', 'the note goes, and the low-suit warning is back');
  tick(s, outside(s.bx, s.by + 6), 1);
  tick(s, by2, 1);
  assert.equal(noteOf(s), 'eva.low', 'walking off and back: not said again this round');
  // The next round (the advance clears x.refills): the beacon refills the suit again, and then says so again.
  s.m.turn++;
  quiet(s.m);
  s.m.expedition.refills = {};
  s.eva.sync(s.data);
  s.eva.qaSuit(60);
  tick(s, by2, 0.1);
  await flush();
  tick(s, by2, 5);
  assert.equal(refills(), 2);
  s.eva.qaSuit(30);
  tick(s, by2, 0.1);
  assert.equal(noteOf(s), used, 'told again in a new round');

  const p = setup({ mission: quiet(poiMission()), t: say }), [ix, iy] = QA.podIn, inside = outside(ix, iy);
  hold(p, ix, iy);
  p.eva.qaSuit(50);
  tick(p, inside, 0.1);
  await flush();
  tick(p, inside, 5); // the pod refilled the suit, and its note has gone
  p.eva.qaSuit(D.EXPEDITION.suit - D.EXPEDITION.canister.suit);
  tick(p, inside, 0.1);
  assert.equal(noteOf(p), 'eva.refillUsedPod', 'still in the pod, the suit low enough');
  tick(p, inside, 6);
  tick(p, outside(ix, iy + 4), 0.5);
  tick(p, inside, 1);
  assert.notEqual(noteOf(p), 'eva.refillUsedPod', 'once a round');
  assert.equal(p.calls.filter(c => c.type === 'refill').length, 1);
});

test('co-op: while a refill that worked is still on its way back, the room frame showing it spent brings no warning, and the once-a-round note is kept for later (R27)', async () => {
  const s = withBeacon(), by2 = outside(s.bx, s.by + 2), used = say('eva.refillUsed', { name: beaconName(0) });
  s.eva.qaSuit(60);
  tick(s, by2, 0.3); // the rules have marked the refill, as the room frame does, and the answer that raises the suit has not landed
  assert.notEqual(noteOf(s), used, 'no false warning');
  await flush();
  tick(s, by2, 0.1);
  assert.equal(noteOf(s), say('eva.refilledBeacon', { name: beaconName(0), s: D.EXPEDITION.suit }));
  tick(s, by2, 5);
  s.eva.qaSuit(30);
  tick(s, by2, 0.1);
  assert.equal(noteOf(s), used, 'low again later: still told');
});

test("the maps always mark the relay beacons, fog or not, and draw the dashed route home: each beacon's link from X.routeHome, in world pixels", () => {
  const s = withBeacon();
  s.m.expedition.beacons.push({ x: s.bx + 11, y: s.by + 3, by: 'minh', round: 0 }); // B1 links to B0, its nearest
  tick(s, NEAR(0, 1), 0.2);
  const marks = s.eva.marks(s.world, 0, 0).filter(k => k.beacon);
  assert.deepEqual(plain(marks), s.m.expedition.beacons.map(b => ({ x: (b.x + 0.5) * T, y: (b.y + 0.5) * T, color: '#ffcf7a', beacon: true })));
  const px = v => (v + 0.5) * T;
  assert.deepEqual(plain(s.eva.lines()).map(l => [l.x0, l.y0, l.x1, l.y1, l.dash.length > 0]), X.routeHome(s.m).map(l => [px(l.x0), px(l.y0), px(l.x1), px(l.y1), true]));
  assert.deepEqual(X.routeHome(s.m).map(l => l.to), ['base', 'B0'], 'B0 to the HQ, B1 to B0');
});

const FIVE = o => quiet(E.createMission(Object.assign({ seed: 'EVA-TEAM', loadout: E.referenceKit('commander', 5), crewSize: 5, events: false, pilot: 'minh' }, o)));
const ROLE_COLOR = role => ARTS.ROLE[role];

test("a ping shows on the maps in its sender's colour with their name, fading out over 10 s of the wall clock", () => {
  const s = setup({ mission: FIVE(), t: say });
  const pings = () => plain(s.eva.marks(s.world, 0, 0).filter(k => k.ping));
  tick(s, NEAR(0, 1), 0.2);
  s.eva.addPing({ x: 640, y: -320, by: 'diego' });
  s.eva.addPing({ x: 'x', y: 0, by: 'diego' }); // not a spot: ignored
  assert.deepEqual(pings(), [{ x: 640, y: -320, color: ROLE_COLOR('scientist'), ping: true, label: 'diego', alpha: 1 }]);
  s.clock.now += D.TEAM.ping.life / 2;
  assert.equal(pings()[0].alpha, 0.5, 'half way: half faded');
  s.clock.now += D.TEAM.ping.life / 2;
  assert.deepEqual(pings(), [], 'gone after 10 s');
});

test("while the commander is out, his pings draw a dashed line from him to each, for everyone; nobody else's do, and a 4-crew mission has none", () => {
  const team = { list: [] };
  const s = setup({ mission: FIVE(), t: say, team: () => team.list });
  team.list = [{ crewId: 'minh', x: 0, y: 0 }, { crewId: 'kai', x: 20 * T, y: 0 }];
  s.eva.addPing({ x: 40 * T, y: 3 * T, by: 'kai' });
  s.eva.addPing({ x: 9 * T, y: 9 * T, by: 'diego' });
  const route = () => plain(s.eva.lines()).filter(l => l.x1 !== T / 2 || l.y1 !== T / 2); // not the route home
  assert.deepEqual(route().map(l => [l.x0, l.y0, l.x1, l.y1, l.color, l.dash.length > 0]), [[20 * T, 0, 40 * T, 3 * T, ROLE_COLOR('commander'), true]]);
  team.list = [{ crewId: 'minh', x: 0, y: 0 }, { crewId: 'kai', x: T, y: T }];
  assert.deepEqual(route(), [], 'at the base he is not out: no line');
  const four = setup({ mission: quiet(E.createMission({ seed: 'EVA-TEAM', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' })), t: say, team: () => [{ crewId: 'minh', x: 20 * T, y: 0 }] });
  four.eva.addPing({ x: 40 * T, y: 3 * T, by: 'minh' });
  assert.deepEqual(plain(four.eva.lines()), [], 'no commander in a crew of 4');
});

test("the commander's aura: within 5 tiles of him while he is out you move 10 % faster on foot, never in the rover, and a hint says so", () => {
  const team = { list: [] };
  const s = setup({ mission: FIVE(), t: say, team: () => team.list }), me = outside(30, 0);
  const hint = () => s.eva.el.children.find(n => n.className.split(' ').includes('sf-aura'));
  team.list = [{ crewId: 'minh', x: me.x, y: me.y }, { crewId: 'kai', x: me.x + 4 * T, y: me.y }];
  tick(s, me, 0.1);
  assert.equal(s.eva.speed(me), D.SKILLS.commander.auraSpeed);
  assert.equal(hint().hidden, false);
  assert.equal(hint().textContent, say('eva.aura', { p: 10 }));
  assert.equal(s.eva.speed(Object.assign({}, me, { inRover: true })), 1, 'the rover keeps its own speed');
  team.list[1].x = me.x + 6 * T;
  tick(s, me, 0.1);
  assert.equal(s.eva.speed(me), 1, '6 tiles away: out of reach');
  assert.equal(hint().hidden, true);
  // Kai himself, out on the map, leads: the hint says so.
  s.eva.sync({ mission: s.m, controlId: 'kai', lang: 'en' });
  team.list = [{ crewId: 'kai', x: me.x, y: me.y }];
  tick(s, me, 0.1);
  assert.equal(s.eva.speed(me), D.SKILLS.commander.auraSpeed);
  assert.equal(hint().textContent, say('eva.auraLead', { p: 10, n: D.SKILLS.commander.auraRange }));
});

test("the round's goals show in the HUD column, asked twice a second: a line each over a bar, a done one ticked; no goals or no hook, no block", () => {
  const survey = { text: 'Survey a science site at least 40 tiles from the base', done: false, frac: 0.25 };
  const haul = { text: 'Bring home 3 loads of ice or metal (1/3)', done: false, frac: 1 / 3 };
  let list = [survey, haul], asked = 0;
  const s = setup({ t: say, goals: () => { asked++; return list; } });
  const block = () => s.eva.el.children.find(n => n.className === 'sf-goals');
  const lines = () => block().children[1].children.map(li => [li.className, li.textContent, li.children[0].children[0].style.width]);
  tick(s, outside(0, 1), 0.1);
  assert.equal(block().hidden, false);
  assert.equal(block().children[0].textContent, say('goal.title'), "the console's title for the goals");
  assert.deepEqual(lines(), [['', survey.text, '25%'], ['', haul.text, '33%']]);
  tick(s, outside(0, 1), 1);
  assert.ok(asked >= 2 && asked <= 3, 'twice a second, not on each of the 11 frames: ' + asked);
  list = [survey, Object.assign({}, haul, { text: 'Bring home 3 loads of ice or metal (3/3)', done: true, frac: 1 })];
  tick(s, outside(0, 1), 0.5);
  assert.deepEqual(lines()[1], ['done', '✓ Bring home 3 loads of ice or metal (3/3)', '100%']);
  list = [];
  tick(s, outside(0, 1), 0.5);
  assert.equal(block().hidden, true, 'no goals: no block');
  const bare = setup({ t: say }); // ui.js without the goals hook
  tick(bare, outside(0, 1), 0.5);
  assert.equal(bare.eva.el.children.find(n => n.className === 'sf-goals').hidden, true);
});

test("a hold's seconds are written in the player's language: the Engineer's 1.5 in English, 1,5 in Vietnamese, and a whole 3 the same in both (R31)", () => {
  const s = setup({ t: say });
  let f = null;
  for (let cy = -2; cy < 2 && !f; cy++) for (let cx = -2; cx < 2 && !f; cx++) for (const g of X.findsIn(s.m, cx, cy)) if (g.kind === 'metal' && !f) f = Object.assign({ cx, cy }, g);
  s.world.get(f.cx, f.cy);
  const p = outside(f.x, f.y - 1), focus = s.eva.focusAt((f.x + 0.5) * T, (f.y + 0.5) * T, p, s.world);
  const secs = (id, lang) => { s.eva.sync({ mission: s.m, controlId: id, lang }); const l = s.eva.label(focus); return JSON.parse(l.slice(l.indexOf(' ') + 1)).s; };
  assert.equal(X.holdSeconds('metal', 'engineer'), 1.5);
  assert.deepEqual([secs('lena', 'en'), secs('lena', 'vi'), secs('minh', 'vi')], ['1.5', '1,5', '3']);
});

test("the rover's battery counts each tile boosted or driven over rocks twice (and both: four times), and the HUD shows the physics", () => {
  const I = require('../src/i18n.js'), s = setup({ t: (k, p) => I.t('en', k, p) });
  const p = Object.assign(outside(20, 1), { inRover: true, car: { heading: 0, speed: 390 } });
  s.eva.step(0.1, p, s.world, 10 * T, null);
  assert.equal(s.eva.report().driven, 10, 'ten tiles, plainly');
  s.eva.step(0.1, Object.assign(p, { drain: 2 }), s.world, 10 * T, null);
  assert.equal(s.eva.report().driven, 30, 'ten boosted tiles count twenty');
  s.eva.step(0.1, Object.assign(p, { drain: 4 }), s.world, 5 * T, null);
  assert.equal(s.eva.report().driven, 50, 'five boosted over rocks count twenty');
  const phys = s.eva.el.children.find(n => / batt$/.test(n.className)).children[3].textContent;
  assert.equal(phys, '22 km/h · stops in 2.8 m (on Earth: 1.1 m)', 'Mars needs 2.6 times as far to stop');
});

// ---------- M5 polish ----------
test('with a full backpack the pickup prompt says so and offers no hold', () => {
  const s = setup({ t: say });
  const drop = { kind: 'drop', key: 'd:1', id: 1, x: 0, y: 0 };
  assert.equal(s.eva.holdable(drop), true, 'room: a hold');
  assert.match(s.eva.label(drop), /^eva\.pickup/);
  s.m.expedition.carried.minh = Array.from({ length: X.capacity(s.m, 'minh') }, METAL);
  tick(s, outside(9, 1), 0.1);
  assert.equal(s.eva.holdable(drop), false, 'a full backpack: no hold');
  assert.equal(s.eva.label(drop), 'eva.err.full', 'the prompt says it is full');
  assert.equal(s.eva.start(drop), false);
});

test('a pack with a kit counts the kit apart, and a pack of only kits is not "full"', () => {
  const s = setup({ t: say });
  const cap = X.capacity(s.m, 'minh'), pack = () => s.eva.el.children.find(n => n.className === 'sf-pack');
  s.m.expedition.carried.minh = [METAL(), E.kitItem()];
  tick(s, outside(9, 1), 0.1);
  assert.equal(pack().attrs['aria-label'], 'eva.packKit ' + JSON.stringify({ n: 1, k: 1, m: cap }), 'one load and one kit, not "2 of ' + cap + ' loads"');
  s.m.expedition.carried.minh = [METAL()];
  tick(s, outside(9, 1), 0.1);
  assert.equal(pack().attrs['aria-label'], 'eva.pack ' + JSON.stringify({ n: 1, m: cap }), 'no kit: as before');
  s.m.expedition.carried.minh = Array.from({ length: cap }, E.kitItem);
  tick(s, outside(9, 1), 0.1);
  assert.notEqual(noteOf(s), 'eva.full', 'a pack of only kits is not the "bring it back" full');
  s.m.expedition.carried.minh = [E.kitItem(), ...Array.from({ length: cap - 1 }, METAL)];
  tick(s, outside(9, 1), 0.1);
  assert.equal(noteOf(s), 'eva.full', 'with loads in it, full is full');
});

test('a pack of only beacon kits, filled up, says so in the HUD: place one or put it back (not "bring it back")', () => {
  const s = setup({ t: say });
  const cap = X.capacity(s.m, 'minh');
  s.m.expedition.carried.minh = Array.from({ length: cap - 1 }, E.kitItem);
  tick(s, outside(9, 1), 0.1);
  assert.equal(noteOf(s), '', 'room left: no note');
  s.m.expedition.carried.minh = Array.from({ length: cap }, E.kitItem);
  tick(s, outside(9, 1), 0.1);
  assert.equal(noteOf(s), 'eva.fullKits');
});

test('a note set while a card is up beats the round brief repeated when the card closes', async () => {
  let up = false;
  const m = E.createMission({ seed: 'EVA-BRIEF', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  Object.assign(m.schedule[m.turn], { spe: true });
  const s = setup({ mission: m, t: say, cardUp: () => up });
  tick(s, NEAR(0, 1), 0.1);
  assert.match(noteOf(s), /^eva.brief /);
  up = true;
  tick(s, NEAR(0, 1), 1);
  m.expedition.carried.minh = [{ kind: 'pod', res: 'o2', amount: 30, canister: true, id: '1,1:0', region: 0 }];
  s.eva.qaSuit(100);
  s.eva.canister(NEAR(6, 4));
  await flush();
  up = false;
  tick(s, NEAR(6, 4), 0.1);
  assert.match(noteOf(s), /^eva.breathed/, 'the newer note stays');
});

// ---- M6 T4: Fabricator gear ----
test('bigger tanks: the suit is as big as the tanks, the canister button waits for 45 s to fit, the bar never passes 100 %', () => {
  const m = E.createMission({ seed: 'EVA-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  m.gear.tanks = 1;
  const s = setup({ mission: m });
  const btn = s.eva.el.children.find(n => n.className === 'sf-can');
  assert.equal(s.eva.state().suit, 200, 'a new suit at the new size');
  s.eva.qaSuit(999);
  assert.equal(s.eva.state().suit, 200);
  m.expedition.carried.minh = [{ kind: 'pod', res: 'o2', amount: 30, canister: true, id: '1,1:0', region: 0 }];
  s.eva.qaSuit(170);
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(btn.hidden, true, 'above 155 s some of it would be wasted');
  s.eva.qaSuit(150);
  tick(s, NEAR(6, 4), 0.1);
  assert.equal(btn.hidden, false, '45 s fit under 200');
  s.eva.qaSuit(200);
  const fills = [];
  const walk = (n) => { if (n && n.style && n.style.width) fills.push(n.style.width); (n.children || []).forEach(walk); };
  tick(s, NEAR(6, 4), 0.01); walk(s.eva.el);
  assert.ok(fills.every(w => parseFloat(w) <= 100), 'no bar past 100 %: ' + fills.join(','));
});

// ---------- the pressurised rover (M6) ----------
test('in the pressurised rover the suit does not drain outside', () => {
  const I = require('../src/i18n.js'), PH = require('../src/physics.js'), en = (k, p) => I.t('en', k, p), s = setup({ t: en });
  const p = Object.assign(outside(20, 1), { inRover: true, vehicle: 'cabin', car: { heading: 0, speed: 300 } });
  s.player.p = p;
  for (let i = 0; i < 100; i++) s.eva.step(0.1, p, s.world, 0.3 * T, null); // 10 s of driving outside the zone, 30 tiles
  assert.equal(s.eva.state().suit, D.EXPEDITION.suit, 'the suit is unchanged');
  assert.ok(Math.abs(s.eva.report().driven - 30) < 1e-6, "the pressurised rover's battery: " + s.eva.report().driven);
  const row = re => s.eva.el.children.find(n => re.test(n.className));
  const suit = row(/^sf-suit/), batt = row(/ batt$/), note = row(/^sf-evanote/);
  assert.equal(suit.children[2].textContent, en('eva.paused', { v: en('eva.secs', { s: D.EXPEDITION.suit }) }), 'the suit timer says it is paused');
  assert.equal(batt.children[0].textContent, en('eva.cabinBattery'), 'the HUD says which vehicle');
  assert.equal(batt.children[2].textContent, '770 tiles', 'of 800 a round');
  const stop = v => (Math.round(v * 10) / 10).toLocaleString('en-US');
  assert.equal(batt.children[3].textContent, en('eva.drive', { kmh: 17, m: stop(PH.stopDistance(300, PH.MARS_G, PH.CABIN)), e: stop(PH.stopDistance(300, PH.EARTH_G, PH.CABIN)) }),
    'its own stopping distance');
  assert.equal(note.textContent, en('eva.cabinAir'));
  // The rover's battery is its own: in the rover the HUD reads the rover's.
  const q = Object.assign(outside(20, 1), { inRover: true });
  s.player.p = q;
  s.eva.step(0.1, q, s.world, 0, null);
  assert.equal(batt.children[0].textContent, en('eva.battery'));
  assert.equal(batt.children[2].textContent, D.EXPEDITION.roverRange + ' tiles');
  // Stepping out of it to work on a find, you breathe your suit.
  s.player.p = p;
  const f = { kind: 'find', key: 'f:x', id: 'x', find: { kind: 'metal' }, x: p.x, y: p.y };
  s.eva.start(f);
  s.eva.step(1, p, s.world, 0, f);
  assert.ok(s.eva.state().suit < D.EXPEDITION.suit, 'out of the cabin the suit drains');
});

test("a flat pressurised rover says which battery is flat, and the rover's still drives", () => {
  const I = require('../src/i18n.js'), en = (k, p) => I.t('en', k, p), s = setup({ t: en });
  s.m.expedition.cabinDriven = D.EXPEDITION.cabin.range;
  s.eva.sync(s.data);
  const cab = Object.assign(outside(20, 1), { inRover: true, vehicle: 'cabin' }), rover = Object.assign(outside(20, 1), { inRover: true });
  const note = () => s.eva.el.children.find(n => /^sf-evanote/.test(n.className)).textContent;
  s.player.p = cab;
  tick(s, cab, 0.1);
  assert.equal(note(), en('eva.cabinFlat'));
  assert.equal(s.eva.canMove(cab, cab.x + 5, cab.y), false, 'it stops');
  assert.equal(s.eva.canMove(rover, rover.x + 5, rover.y), true, 'the rover has its own battery');
});

test("a pressurised rover that is flat or taken says so in its own words; the rover keeps its own", async () => {
  const I = require('../src/i18n.js');
  for (const k of ['eva.err.cabinFlat', 'eva.err.cabinTaken']) {
    assert.match(I.STR.en[k] || '', /pressurized rover/, 'en ' + k);
    assert.match(I.STR.vi[k] || '', /xe thám hiểm điều áp/, 'vi ' + k);
  }
  let error = 'flat';
  const s = setup({ answer: type => (type === 'board' ? { error } : null) });
  const p = outside(1, 1);
  const said = async kind => { await s.eva.act('board', p, kind ? { kind } : {}); s.eva.step(0.1, p, s.world, 0, null); return noteOf(s); };
  assert.equal(await said('cabin'), 'eva.err.cabinFlat');
  assert.equal(await said('rover'), 'eva.err.flat', "the rover's own");
  assert.equal(await said(), 'eva.err.flat', 'no kind is the rover');
  error = 'taken';
  assert.equal(await said('cabin'), 'eva.err.cabinTaken');
  assert.equal(await said('rover'), 'eva.err.taken');
  error = 'tooFar';
  assert.equal(await said('cabin'), 'eva.err.tooFar', 'any other refusal reads as before');
});

test("a flare warning in the pressurised rover says it is no cover; in the base zone you are covered", () => {
  const m = flareMission('EVA-FLARE-5');
  m.expedition.flare = { warn: 35, end: 95, over: false, hit: [] };
  m.expedition.clock = 40;
  const s = setup({ mission: m, t: say });
  const cab = tx => Object.assign(NEAR(tx, 1), { inRover: true, vehicle: 'cabin' });
  tick(s, cab(6), 0.1);
  assert.equal(banner(s).msg, 'eva.cabinFlare', 'out in the open, in it');
  assert.match(banner(s).cls, /crit/);
  tick(s, Object.assign(NEAR(6, 1), { inRover: true }), 0.1);
  assert.equal(banner(s).msg, 'eva.flare.run', "the rover's hint is as before");
  tick(s, cab(0), 0.1);
  assert.equal(banner(s).msg, 'eva.flare.covered', 'in the base zone');
  assert.match(banner(s).cls, /ok/);
});

test('a passenger in the pressurised rover sees as far as its driver', () => {
  const m = E.createMission({ seed: 'EVA-1', loadout: E.referenceKit('commander', 4), events: false, coop: true, pilot: 'minh' });
  const s = setup({ mission: m });
  const p = outside(20, 1), driver = Object.assign(outside(20, 1), { inRover: true, vehicle: 'cabin' });
  assert.equal(s.eva.view(p), D.DANGERS.view.clear, 'on foot');
  assert.equal(s.eva.view(driver), D.DANGERS.view.rover, 'driving it');
  m.expedition.riders.minh = 'cabin'; // riding along: their position still says on foot
  assert.equal(s.eva.view(p), D.DANGERS.view.rover, 'riding in it');
  delete m.expedition.riders.minh;
  assert.equal(s.eva.view(p), D.DANGERS.view.clear, 'out of it again');
});
