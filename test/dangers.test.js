'use strict';
// Dangers outside (src/dangers.js, spec §3.4, M4b): how far you see in a dust storm, what covers you from a solar flare,
// the flare's warning and its hit, the solo round clock, and the dust devils every screen draws alike.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/data.js');
const E = require('../src/engine.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');
const Z = require('../src/dangers.js');

const T = 64;
const KIT = { solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, spares: 3, materials: 1, food: 6, o2: 3, water: 3 };
const solo = (seed, round) => {
  const m = E.createMission({ seed: seed || 'DNG-1', loadout: KIT, events: false, pilot: 'minh' });
  Object.assign(m.schedule[m.turn], round || {});
  return m;
};
const at = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });
const FL = D.DANGERS.flare, DV = D.DANGERS.devils;

// The cave whose mouth is nearest the HQ for a mission code.
function nearestCave(m) {
  let best = null;
  for (let cy = -4; cy < 4; cy++) for (let cx = -4; cx < 4; cx++) for (const k of X.cavesIn(m, cx, cy)) {
    if (!best || k.x * k.x + k.y * k.y < best.x * best.x + best.y * best.y) best = k;
  }
  return best;
}

test('you see 8 tiles around you in clear weather (10 in the rover), 5 in a regional dust storm and 3 in a global one', () => {
  const m = solo();
  assert.equal(Z.viewTiles(m, false), 8);
  assert.equal(Z.viewTiles(m, true), 10);
  m.schedule[m.turn].weather = 'regional';
  assert.equal(Z.viewTiles(m, false), 5);
  assert.equal(Z.viewTiles(m, true), 5, 'the rover sees no further in a storm');
  m.schedule[m.turn].weather = 'global';
  assert.equal(Z.viewTiles(m, false), 3);
  assert.equal(Z.viewTiles(m, true), 3);
  assert.equal(Z.viewTiles(null, false), 8, 'no mission: clear');
});

test("cover from a flare: the base zone, a cave's mouth and the storm shelter once it is built; nowhere else", () => {
  const m = solo('DNG-CAVE');
  const k = nearestCave(m);
  assert.ok(k, 'a cave near the base');
  assert.equal(Z.shelterAt(m, at(0, 1)), 'base');
  assert.equal(Z.shelterAt(m, at(k.x, k.y)), 'cave', 'standing in its mouth');
  assert.equal(Z.shelterAt(m, { x: (k.x + 0.5) * T, y: (k.y + 0.5 + 0.85) * T }), 'cave', '0.85 tiles out of the middle of the mouth');
  assert.equal(Z.shelterAt(m, { x: (k.x + 0.5) * T, y: (k.y + 0.5 + 0.95) * T }), null, '0.95 tiles out is in the open');
  assert.equal(Z.shelterAt(m, { x: (k.x + 0.5) * T, y: (k.y + 0.5 + 2) * T }, 1.5), 'cave', 'with 1.5 tiles of slack for a position sent a moment ago');
  assert.equal(Z.shelterAt(m, at(30, 30)) === 'cave', Z.cavesNear(m, 30.5, 30.5, D.DANGERS.shelter).length > 0);
  for (const junk of [null, {}, { x: NaN, y: 0 }, { x: 'a', y: 1 }]) assert.equal(Z.shelterAt(m, junk), null);
});

test('the storm shelter covers you once it is built, also outside the base zone: the build grid reaches 4 tiles from the HQ', () => {
  const m = solo('DNG-SHELTER');
  const pos = at(4, 0); // grid (8, 2) is world tile (4, 0): outside the 5×5 base zone
  assert.equal(X.inBaseZone(pos), false);
  m.projects.push({ type: 'shelter', x: 8, y: 2, progress: 0, work: 1.5 });
  assert.equal(Z.shelterAt(m, pos), null, 'a project is not a shelter yet');
  m.projects = [];
  m.layout = m.layout.filter(k => !(k.x === 8 && k.y === 2));
  m.layout.push({ type: 'shelter', x: 8, y: 2 });
  m.modules.shelter.count = 1;
  assert.equal(Z.shelterAt(m, pos), 'shelter');
  assert.equal(Z.shelterAt(m, { x: (4.5 + 0.85) * T, y: pos.y }), 'shelter', '0.85 tiles from its middle');
  assert.equal(Z.shelterAt(m, at(5, 0)), null, 'a whole tile away is in the open');
  m.modules.shelter.count = 0;
  assert.equal(Z.shelterAt(m, pos), null, 'no shelter without the module');
});

test("a solar flare comes in a round whose schedule has one: the warning 30 s after the first step outside, the hit 60 s later", () => {
  const quiet = solo();
  assert.equal(Z.flareDue(quiet), false);
  assert.equal(Z.flareStart(quiet, 12).error, 'noFlare');
  assert.equal(quiet.expedition.flare, null);
  const m = solo('DNG-SPE', { spe: true });
  assert.equal(Z.flareDue(m), true);
  for (const bad of [undefined, NaN, -1, '12']) assert.equal(Z.flareStart(m, bad).error, 'badTime');
  assert.deepEqual(Z.flareStart(m, 12.5), { ok: true, flare: { warn: 12.5 + FL.delay, end: 12.5 + FL.delay + FL.countdown, over: false, hit: [] } });
  assert.equal(Z.flareStart(m, 40).error, 'started', 'one flare a round');
  assert.equal(m.expedition.flare.end, 102.5);
  m.status = 'failed';
  assert.equal(Z.flareEnd(m, {}, 0, 200).error, 'badPhase');
});

test('the flare hits whoever is out in the open when it ends, once; whoever has cover, or is not out, is safe', () => {
  const m = solo('DNG-CAVE', { spe: true });
  const k = nearestCave(m);
  Z.flareStart(m, 0);
  const spots = { minh: at(40, 0), lena: at(k.x, k.y), diego: at(0, 0), nobody: at(50, 50), ana: null };
  assert.equal(Z.flareEnd(m, spots, 0, FL.delay + FL.countdown - 1).error, 'early');
  assert.equal(m.expedition.flare.over, false);
  assert.deepEqual(Z.flareEnd(m, spots, 0, FL.delay + FL.countdown), { ok: true, hit: ['minh'] });
  assert.deepEqual(m.expedition.incidents, [{ crewId: 'minh', kind: 'flare' }]);
  assert.deepEqual(m.expedition.flare.hit, ['minh']);
  assert.equal(m.expedition.flare.over, true);
  assert.equal(Z.flareEnd(m, spots, 0, 200).error, 'noFlare', 'it hits once');
  assert.equal(m.expedition.incidents.length, 1);
  const n = solo('DNG-DEAD', { spe: true });
  n.crew.find(c => c.id === 'lena').status = 'dead';
  Z.flareStart(n, 0);
  assert.deepEqual(Z.flareEnd(n, JSON.parse('{"lena":{"x":2600,"y":32},"__proto__":{"x":2600,"y":32}}'), 0, 90).hit, [], 'the dead and made-up crew are not hit');
  const c = solo('DNG-SLACK', { spe: true });
  Z.flareStart(c, 0);
  assert.deepEqual(Z.flareEnd(c, { minh: at(3, 0) }, D.EXPEDITION.reach, 90).hit, [], "co-op's slack: a step from the base zone counts as in it");
});

test('a solo pilot who collapsed sits out the round at the base: the flare never hits them, wherever their game last saw them', () => {
  const m = solo('DNG-BENCH', { spe: true });
  Z.flareStart(m, 0);
  m.expedition.benched.push('minh');
  assert.deepEqual(Z.flareEnd(m, { minh: at(40, 0) }, 0, FL.delay + FL.countdown), { ok: true, hit: [] });
  assert.deepEqual(m.expedition.incidents, []);
});

test("solo play keeps the round's clock with the mission; it only goes up within a round and junk is ignored", () => {
  const m = solo();
  assert.equal(Z.clockOf(m), 0);
  Z.setClock(m, 41.5);
  Z.setClock(m, 30);
  assert.equal(Z.clockOf(m), 41.5);
  for (const junk of ['80', null, NaN, -5, Infinity]) Z.setClock(m, junk);
  assert.equal(Z.clockOf(m), 41.5);
  m.expedition.clock = 'x';
  assert.equal(Z.clockOf(m), 0, 'a broken clock reads 0');
});

// ---------- dust devils ----------

function devilsAround(m, tx, ty, r, t) {
  return Z.devils(m, (tx - r) * T, (ty - r) * T, (tx + r) * T, (ty + r) * T, t);
}

test('every screen draws the same dust devils: the mission code, the round and the clock decide them', () => {
  const m = solo('DNG-DEVIL', { devil: true });
  const box = [90 * T, 40 * T, 140 * T, 80 * T];
  const a = JSON.stringify(Z.devils(m, ...box, 61.25));
  Z.devils(m, -50 * T, -900 * T, 30 * T, -850 * T, 3); // something else first
  assert.equal(JSON.stringify(Z.devils(m, ...box, 61.25)), a);
  assert.equal(JSON.stringify(Z.devils(JSON.parse(JSON.stringify(m)), ...box, 61.25)), a, 'a copy of the mission (a saved game, a teammate) agrees');
  assert.ok(JSON.parse(a).length > 0, 'devils to compare');
  const next = JSON.parse(JSON.stringify(m));
  next.turn += 1;
  Object.assign(next.schedule[next.turn], { devil: true, weather: 'clear' });
  assert.notEqual(JSON.stringify(Z.devils(next, ...box, 61.25)), a, 'another round, other devils');
  const d = JSON.parse(a)[0];
  assert.ok(d.a > 0 && d.a <= 1);
  assert.ok(Math.abs(Math.hypot(d.dx, d.dy) - 1) < 1e-9, 'it drifts one way');
});

test('a devil forms, drifts 6–12 tiles with the wind and dies down within 24 s', () => {
  const m = solo('DNG-DRIFT', { devil: true });
  const seen = new Map();
  for (let t = 0; t <= 200; t += 0.5) {
    for (const d of devilsAround(m, 160, 160, 100, t)) {
      const s = seen.get(d.id) || { first: t, last: t, x0: d.x, y0: d.y, x1: d.x, y1: d.y, max: 0 };
      s.last = t; s.x1 = d.x; s.y1 = d.y; s.max = Math.max(s.max, d.a);
      seen.set(d.id, s);
    }
  }
  assert.ok(seen.size > 20, 'devils seen: ' + seen.size);
  let whole = 0;
  for (const [id, s] of seen) {
    assert.ok(s.last - s.first < DV.life, id + ' lasts ' + (s.last - s.first) + ' s');
    const [cx, cy] = id.split(':')[0].split(',').map(Number);
    if (cx < 3 || cx > 6 || cy < 3 || cy > 6) continue; // a chunk near the box's edge: its devils drift in and out of view
    if (s.first < 0.5 || s.last > 199.5) continue; // cut off by the sample's start or end
    whole++;
    const moved = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) / T, seen0 = (s.last - s.first) / DV.life;
    assert.ok(moved <= DV.track[1] * seen0 + 0.01, id + ' drifted ' + moved.toFixed(2) + ' tiles');
    assert.ok(moved >= DV.track[0] * seen0 - 0.01, id + ' drifted only ' + moved.toFixed(2) + ' tiles');
    assert.equal(s.max, 1, id + ' formed fully');
  }
  assert.ok(whole > 10, 'devils seen from start to end: ' + whole);
});

test('a dust-devil round has 3–5 devils a chunk, other rounds 0–1, and the Dune Sea twice as many; none near the base', () => {
  const count = { plains: [0, 0], dunes: [0, 0] }, quiet = { plains: [0, 0], dunes: [0, 0] };
  for (let s = 0; s < 30; s++) {
    for (const devil of [true, false]) {
      const m = solo('DNG-N-' + s, { devil }), seed = W.seedOf(m.seed);
      for (let cy = -6; cy < 6; cy++) for (let cx = -6; cx < 6; cx++) {
        if (Math.abs(cx) < 2 && Math.abs(cy) < 2) continue;
        const reg = W.REGIONS[W.regionAt(seed, cx * 32 + 16, cy * 32 + 16)];
        if (reg !== 'plains' && reg !== 'dunes') continue;
        // the devils, formed, whose middles are in the 32×32 tiles of this chunk at one moment (some drift in from next door)
        const n = Z.devils(m, cx * 32 * T, cy * 32 * T, (cx + 1) * 32 * T - 1, (cy + 1) * 32 * T - 1, 100 + s).filter(d => d.a >= 0.5).length;
        const into = devil ? count : quiet;
        into[reg][0] += n; into[reg][1]++;
      }
    }
  }
  const per = (c, r) => c[r][0] / c[r][1];
  assert.ok(per(count, 'plains') >= 3 && per(count, 'plains') <= 5, 'devil round, Plains: ' + per(count, 'plains').toFixed(2));
  assert.ok(per(quiet, 'plains') >= 0.2 && per(quiet, 'plains') <= 1, 'other rounds, Plains: ' + per(quiet, 'plains').toFixed(2));
  const k = per(count, 'dunes') / per(count, 'plains'), q = per(quiet, 'dunes') / per(quiet, 'plains');
  assert.ok(k > 1.5 && k < 2.5, 'the Dune Sea has ' + k.toFixed(2) + ' times as many in a devil round');
  assert.ok(q > 1.3 && q < 2.7, 'and ' + q.toFixed(2) + ' times as many in other rounds');
  const m = solo('DNG-BASE', { devil: true });
  for (let t = 0; t < 300; t += 1.5) {
    for (const d of devilsAround(m, 0, 0, 30, t)) assert.ok(Math.hypot(d.x / T - 0.5, d.y / T - 0.5) > DV.clear, 'a devil ' + (Math.hypot(d.x / T - 0.5, d.y / T - 0.5)).toFixed(1) + ' tiles from the HQ');
  }
});

test('a devil hits you when its middle passes within 0.55 tiles of your feet, once it has formed', () => {
  const m = solo('DNG-HIT', { devil: true });
  let d = null, t = 0;
  for (t = 0; t < 300 && !d; t += 0.25) d = devilsAround(m, 120, 60, 40, t).find(k => k.a === 1);
  assert.ok(d, 'a formed devil');
  t -= 0.25;
  const near = { x: d.x + 0.5 * T, y: d.y }, off = { x: d.x + 0.6 * T, y: d.y };
  assert.equal(Z.devilHit(m, near, t).id, d.id);
  assert.equal(Z.devilHit(m, off, t), null, 'a little further is a near miss');
  assert.equal(Z.devilHit(m, null, t), null);
  assert.equal(Z.devils(Object.assign({}, m, { status: 'success' }), d.x - 9, d.y - 9, d.x + 9, d.y + 9, t).length, 0, 'none once the mission is over');
});

// FNV-1a over a JSON string.
function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

test('the dust devils of a sample of rounds, places and times match their pinned hash', () => {
  const parts = [];
  for (let r = 0; r < 6; r++) {
    const m = solo('PIN-DEVILS');
    m.turn = r;
    Object.assign(m.schedule[r], { devil: r % 2 === 0 });
    for (let i = 0; i < 20; i++) {
      const tx = i * 37 - 360, ty = i * 23 - 200, t = i * 13.75;
      parts.push(devilsAround(m, tx, ty, 20, t).map(d => [d.id, Math.round(d.x), Math.round(d.y), Math.round(d.a * 100)]));
    }
  }
  assert.ok(parts.some(p => p.length), 'there are devils in the sample');
  const got = fnv(JSON.stringify(parts));
  // Change it only when you mean to move the devils, and say so in the commit message.
  const PINNED = '2d741c4e';
  assert.equal(got, PINNED, 'devils hash is ' + got);
});
