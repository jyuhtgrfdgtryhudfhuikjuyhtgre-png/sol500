'use strict';
// The exploring rules (src/expedition.js, spec §3): collecting, carrying, delivering, the suit, collapses and the rover.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');
const F = require('../src/fog.js');

const T = 64;
const KIT = { solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, spares: 3, materials: 1, food: 6, o2: 3, water: 3 };
const ROVER_KIT = Object.assign({}, KIT, { rover: 1, reactor: 0, solar: 6 });
const solo = (seed, kit) => E.createMission({ seed: seed || 'EXP-1', loadout: kit || KIT, events: false, pilot: 'minh' });
const coop = seed => E.createMission({ seed: seed || 'EXP-1', loadout: KIT, events: false, coop: true });
const snap = m => JSON.stringify(m.expedition);
// The centre of a tile, in world pixels: where you stand to work on a find.
const at = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });
const HOME = at(0, 1);

// The first find of a kind (and optional test) near the base, with its id and how many loads it starts with.
function first(m, kind, ok) {
  for (let r = 1; r < 6; r++) for (let cy = -r; cy < r; cy++) for (let cx = -r; cx < r; cx++) {
    for (const f of X.findsIn(m, cx, cy)) {
      if (f.kind !== kind || (ok && !ok(f))) continue;
      return X.findById(m, cx + ',' + cy + ':' + f.n);
    }
  }
  throw new Error('no ' + kind + ' near the base');
}

test('the rover passes the mass budget in the kit these tests use', () => {
  assert.ok(E.validateLoadout(ROVER_KIT, 'commander', 4).ok);
});

test('collecting takes one load into your backpack and leaves one less at the find', () => {
  const m = solo();
  const f = first(m, 'ice');
  assert.equal(f.left, D.FINDS.ice.loads[f.ring]);
  const r = X.collect(m, 'minh', f.id, at(f.x, f.y));
  assert.equal(r.ok, true);
  assert.deepEqual(r.item, { kind: 'ice', id: f.id, region: f.region, res: 'water', amount: 40 });
  assert.deepEqual(m.expedition.carried.minh, [r.item]);
  assert.equal(m.expedition.sites[f.id], f.left - 1);
  assert.equal(X.findById(m, f.id).left, f.left - 1);
  assert.deepEqual(m.expedition.stats.minh, { finds: { ice: 1 } });
});

test('you have to stand by the find: 1.5 tiles of slack, no more', () => {
  const m = solo(), f = first(m, 'metal');
  assert.equal(X.collect(m, 'minh', f.id, { x: (f.x + 0.5) * T + 1.4 * T, y: (f.y + 0.5) * T }).ok, true);
  const before = snap(m);
  assert.equal(X.collect(m, 'minh', f.id, { x: (f.x + 0.5) * T + 1.6 * T, y: (f.y + 0.5) * T }).error, 'tooFar');
  assert.equal(snap(m), before, 'a refused action changes nothing');
});

test('a find has exactly one id: odd spellings, made-up finds and bad positions are refused without changes', () => {
  const m = solo(), f = first(m, 'metal');
  const before = snap(m);
  const [cx, cy] = [f.cx, f.cy];
  for (const id of ['0' + cx + ',' + cy + ':' + f.n, cx + ',' + cy + ':0' + f.n, cx + ',' + cy + ':99', 'x', '', null, '1,2,3:0']) {
    assert.equal(X.collect(m, 'minh', id, at(f.x, f.y)).error, 'noFind', String(id));
  }
  if (cx === 0) assert.equal(X.collect(m, 'minh', '-0,' + cy + ':' + f.n, at(f.x, f.y)).error, 'noFind');
  assert.equal(X.collect(m, 'minh', f.id, { x: NaN, y: 0 }).error, 'badPos');
  assert.equal(X.collect(m, 'minh', f.id, null).error, 'badPos');
  assert.equal(X.collect(m, 'nobody', f.id, at(f.x, f.y)).error, 'noCrew');
  assert.equal(snap(m), before);
});

test('a find id from another chunk than the one you stand in is refused before that chunk is built', () => {
  const m = solo(), f = first(m, 'metal'), before = snap(m);
  const real = W.chunk;
  let built = 0;
  W.chunk = (...args) => { built++; return real(...args); };
  try {
    for (const id of ['4000,4000:0', '-3999,17:2', (f.cx + 1) + ',' + f.cy + ':0']) {
      assert.equal(X.collect(m, 'minh', id, at(f.x, f.y)).error, 'tooFar', id);
    }
  } finally { W.chunk = real; }
  assert.equal(built, 0, 'no chunk was built for them');
  assert.equal(snap(m), before);
});

test('nobody can change the shared world cache: the chunk, its finds and its caves are frozen', () => {
  const m = solo(), f = first(m, 'metal');
  const finds = X.findsIn(m, f.cx, f.cy);
  assert.ok(Object.isFrozen(finds) && finds.every(Object.isFrozen));
  assert.throws(() => { finds[0].x = 99; }, TypeError);
  assert.throws(() => { finds.push({}); }, TypeError);
  assert.ok(Object.isFrozen(X.cavesIn(m, f.cx, f.cy)));
  assert.ok(Object.isFrozen(X.chunkAt(m, f.cx, f.cy)), 'nobody can swap a list for another');
});

test('a find runs out, and the backpack holds 3 loads on foot', () => {
  const m = solo(), f = first(m, 'ice', g => D.FINDS.ice.loads[g.ring] >= 4);
  for (let i = 0; i < 3; i++) assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).ok, true);
  assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).error, 'full');
  assert.equal(X.capacity(m, 'minh'), 3);
  m.expedition.carried.minh = [];
  while (X.findById(m, f.id).left > 0) X.collect(m, 'minh', f.id, at(f.x, f.y)), m.expedition.carried.minh = [];
  assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).error, 'empty');
});

test('a survey gives science by distance, half again in the Crater Field and half again for the scientist', () => {
  const m = solo('EXP-SCI');
  const f = first(m, 'science');
  const base = D.FINDS.science.science[f.ring] * (W.REGIONS[f.region] === 'craters' ? 1.5 : 1);
  assert.equal(X.itemFor(m, f, 0, 'biologist').amount, Math.round(base));
  assert.equal(X.itemFor(m, f, 0, 'scientist').amount, Math.round(base * 1.5));
  assert.equal(X.itemFor(m, f, 0, 'biologist').sub, f.sub);
  // Also test Crater Field bonus: find a Crater Field science and verify ×1.5 for biologist, ×2.25 for scientist
  const craterF = first(m, 'science', g => W.REGIONS[g.region] === 'craters');
  const craterBase = D.FINDS.science.science[craterF.ring];
  assert.equal(X.itemFor(m, craterF, 0, 'biologist').amount, Math.round(craterBase * 1.5));
  assert.equal(X.itemFor(m, craterF, 0, 'scientist').amount, Math.round(craterBase * 1.5 * 1.5));
});

test("a cargo pod's loads are fixed by the mission code, whoever opens it, and include all three kinds", () => {
  const kinds = new Set();
  for (let s = 0; s < 6; s++) {
    const a = solo('POD-' + s), b = solo('POD-' + s);
    const f = first(a, 'pod');
    const got = (m, crew) => { const out = []; for (let i = 0; i < 3; i++) { out.push(X.collect(m, crew, f.id, at(f.x, f.y)).item.res); } return out; };
    const ra = got(a, 'minh'), rb = got(b, 'lena');
    assert.deepEqual(ra, rb);
    ra.forEach(k => kinds.add(k));
  }
  assert.deepEqual([...kinds].sort(), ['food', 'o2', 'spares']);
});

test('the role skills shorten holding E', () => {
  assert.equal(X.holdSeconds('ice', 'engineer'), 3);
  assert.equal(X.holdSeconds('ice', 'biologist'), 1.5);
  assert.equal(X.holdSeconds('metal', 'engineer'), 1.5);
  assert.equal(X.holdSeconds('pod', 'engineer'), 1.5);
  assert.equal(X.holdSeconds('science', 'medic'), 5);
  assert.equal(X.holdSeconds('science', 'scientist'), 2.5);
  assert.equal(X.holdSeconds('revive', 'commander'), 4);
  assert.equal(X.holdSeconds('revive', 'medic'), 2);
  assert.equal(X.holdSeconds('pickup', 'engineer'), 3);
});

test('delivering at the base banks your whole backpack; it only works in the base zone', () => {
  const m = solo(), f = first(m, 'metal');
  X.collect(m, 'minh', f.id, at(f.x, f.y));
  X.collect(m, 'minh', f.id, at(f.x, f.y));
  assert.equal(X.deliver(m, 'minh', at(5, 0)).error, 'notAtBase');
  assert.equal(X.deliver(m, 'minh', at(3, 0)).ok, true, '2 tiles from the HQ, plus 1.5 tiles of slack');
  assert.deepEqual(m.expedition.carried.minh, []);
  assert.equal(m.expedition.banked.materials, 80);
  assert.deepEqual(m.expedition.banked.lines, [{ crewId: 'minh', kind: 'metal', res: 'materials', region: f.region, amount: 80, loads: 2, late: false }]);
  assert.equal(X.deliver(m, 'minh', HOME).error, 'empty');
  assert.equal(X.inBaseZone(at(2, -2)), true);
  assert.equal(X.inBaseZone(at(3, 0)), false);
  assert.equal(X.inBaseZone(at(-3, 0), 1.5), true);
});

test('an O₂ canister gives 45 s of suit, only outside the base and only when the suit has room for all of it', () => {
  const m = solo(), out = at(20, 4);
  const CAN = { kind: 'pod', res: 'o2', amount: 30, canister: true, id: '1,1:0', region: 0 };
  m.expedition.carried.minh = [Object.assign({}, CAN), { kind: 'pod', res: 'food', amount: 60, id: '1,1:0', region: 0 }];
  m.expedition.suits.minh = 20;
  assert.deepEqual(X.useCanister(m, 'minh', out), { ok: true, suit: 65 });
  assert.equal(m.expedition.carried.minh.length, 1);
  assert.equal(X.useCanister(m, 'minh', out).error, 'noCanister');
  m.expedition.carried.minh.push(Object.assign({}, CAN));
  const before = JSON.stringify(m.expedition.carried);
  m.expedition.suits.minh = 106;
  assert.equal(X.useCanister(m, 'minh', out).error, 'suitFull', 'more than 105 s left: 45 s would not all fit');
  assert.equal(X.useCanister(m, 'minh', HOME, 20).error, 'atBase', 'the suit pauses at the base: no need');
  assert.equal(X.useCanister(m, 'minh', null, 20).error, 'badPos');
  assert.equal(JSON.stringify(m.expedition.carried), before, 'the canister stays in the backpack each time');
  // The suit level the game has now counts, not the one it reported up to 2 s ago.
  m.expedition.suits.minh = 106;
  assert.deepEqual(X.useCanister(m, 'minh', out, 104.6), { ok: true, suit: 149.6 });
  m.expedition.carried.minh.push(Object.assign({}, CAN));
  m.expedition.suits.minh = 100;
  assert.equal(X.useCanister(m, 'minh', out, 'lots').suit, 145, 'a live level that is not a number is ignored');
});

test('the base zone is tiles −2 to 2 either way: world pixels −128 up to 191, and 1.5 tiles more with slack', () => {
  assert.equal(X.inBaseZone({ x: -128, y: 0 }), true);
  assert.equal(X.inBaseZone({ x: 191.9, y: 191.9 }), true);
  assert.equal(X.inBaseZone({ x: 192, y: 0 }), false, 'x = 192 is tile 3');
  assert.equal(X.inBaseZone({ x: 0, y: 192 }), false);
  assert.equal(X.inBaseZone({ x: -128.1, y: 0 }), false);
  assert.equal(X.inBaseZone({ x: 287.9, y: 0 }, 1.5), true);
  assert.equal(X.inBaseZone({ x: 288, y: 0 }, 1.5), false);
  assert.equal(X.inBaseZone({ x: -224, y: 0 }, 1.5), true);
  assert.equal(X.inBaseZone({ x: NaN, y: 0 }), false);
});

test('solo: an empty suit counts as a collapse at once, the load stays where you fell and you sit out the round', () => {
  const m = solo(), f = first(m, 'metal');
  X.collect(m, 'minh', f.id, at(f.x, f.y));
  const load = m.expedition.carried.minh[0];
  assert.equal(X.collapse(m, 'minh', HOME).error, 'atBase', 'the suit never runs out at the base');
  const spot = at(f.x, f.y);
  assert.deepEqual(X.collapse(m, 'minh', spot), { ok: true, benched: true });
  const x = m.expedition;
  assert.deepEqual(x.incidents, [{ crewId: 'minh', kind: 'collapse' }]);
  assert.deepEqual(x.drops, [{ id: '0:minh', x: Math.round(spot.x), y: Math.round(spot.y), items: [load] }]);
  assert.deepEqual(x.carried.minh, []);
  assert.deepEqual(x.benched, ['minh']);
  assert.equal(X.suitOf(m, 'minh'), 0);
  assert.equal(X.collect(m, 'minh', f.id, spot).error, 'benched');
  assert.equal(X.collapse(m, 'minh', spot).error, 'benched', 'only once');
  // Test maxDrops cap: with 40 drops, a new collapse should remove the oldest
  const m2 = solo();
  m2.expedition.drops = Array.from({ length: 40 }, (_, i) => ({
    id: i + ':crew',
    x: 100 + i,
    y: 200 + i,
    items: [{ kind: 'metal', res: 'materials', amount: 40, id: '0,0:' + i, region: 0 }]
  }));
  const oldest = m2.expedition.drops[0];
  X.collect(m2, 'minh', first(m2, 'metal').id, at(first(m2, 'metal').x, first(m2, 'metal').y));
  X.collapse(m2, 'minh', at(500, 500));
  assert.equal(m2.expedition.drops.length, 40, 'still at maxDrops');
  assert.notDeepEqual(m2.expedition.drops[0], oldest, 'oldest drop was removed');
  assert.deepEqual(m2.expedition.drops[39].id.endsWith(':minh'), true, 'newest drop is last');
});

test('co-op: a collapsed crew member waits; a crewmate standing by revives them with 30 s of suit', () => {
  const m = coop(), spot = at(30, 4);
  m.expedition.carried.diego = [{ kind: 'ice', res: 'water', amount: 40, id: '0,0:0', region: 0 }];
  assert.deepEqual(X.collapse(m, 'diego', spot), { ok: true, waiting: true });
  assert.deepEqual(m.expedition.collapsed.diego, { x: Math.round(spot.x), y: Math.round(spot.y) });
  assert.deepEqual(m.expedition.incidents, [], 'nothing recorded yet');
  assert.equal(m.expedition.carried.diego.length, 1, 'still carrying it');
  assert.equal(X.revive(m, 'lena', 'diego', at(33, 4)).error, 'tooFar');
  assert.equal(X.revive(m, 'diego', 'diego', spot).error, 'collapsed');
  assert.equal(X.revive(m, 'lena', 'minh', spot).error, 'notCollapsed');
  // Test revive guard at __proto__: should not crash and should return notCollapsed
  const beforeProto = JSON.stringify(m.expedition);
  assert.equal(X.revive(m, 'lena', '__proto__', spot).error, 'notCollapsed');
  assert.equal(JSON.stringify(m.expedition), beforeProto, 'revive at __proto__ leaves expedition unchanged');
  assert.deepEqual(X.revive(m, 'lena', 'diego', at(31, 4)), { ok: true });
  assert.deepEqual(m.expedition.collapsed, {});
  assert.equal(X.suitOf(m, 'diego'), 30);
  assert.equal(X.revive(solo(), 'lena', 'minh', spot).error, 'solo');
});

test('a dropped load can be picked up again, as much as fits', () => {
  const m = solo();
  const items = [1, 2, 3, 4].map(i => ({ kind: 'metal', res: 'materials', amount: 40, id: '2,0:' + i, region: 0 }));
  m.expedition.drops = [{ id: '3:lena', x: 2000, y: 640, items }];
  m.expedition.carried.minh = [items[0]];
  assert.equal(X.pickUp(m, 'minh', '3:lena', { x: 2200, y: 640 }).error, 'tooFar');
  assert.equal(X.pickUp(m, 'minh', 'nope', { x: 2000, y: 640 }).error, 'noDrop');
  const r = X.pickUp(m, 'minh', '3:lena', { x: 2010, y: 650 });
  assert.equal(r.items.length, 2);
  assert.equal(r.left, 2);
  assert.equal(m.expedition.carried.minh.length, 3);
  // Test pickUp full error: with full backpack, pickUp fails
  assert.equal(X.pickUp(m, 'minh', '3:lena', { x: 2000, y: 640 }).error, 'full');
  m.expedition.carried.minh = [];
  X.pickUp(m, 'minh', '3:lena', { x: 2000, y: 640 });
  assert.deepEqual(m.expedition.drops, [], 'an emptied drop is gone');
});

test('the rover: one driver at a time, 8 loads, parked where you get out or back in its bay at the outpost', () => {
  const m = solo('EXP-ROVER', ROVER_KIT);
  const bay = X.bay(m);
  assert.ok(bay, 'the rover has a bay');
  assert.equal(X.board(m, 'minh', { x: bay.x + 3 * T, y: bay.y }).error, 'tooFar');
  // Test 2-tile reach: 1.9 tiles succeeds, 2.1 tiles fails
  assert.deepEqual(X.board(m, 'minh', { x: bay.x + 1.9 * T, y: bay.y }), { ok: true });
  X.park(m, 'minh', { x: 0, y: 0 }); // park to test boarding again
  assert.equal(X.board(m, 'minh', { x: bay.x + 2.1 * T, y: bay.y }).error, 'tooFar');
  // Re-board by current driver
  assert.deepEqual(X.board(m, 'minh', bay), { ok: true });
  assert.equal(X.board(m, 'lena', bay).error, 'taken');
  // Test JSON round trip: serialize and deserialize mission
  const mRoundtrip = JSON.parse(JSON.stringify(m));
  assert.deepEqual(X.board(mRoundtrip, 'minh', bay), { ok: true }, 'driver can re-board after JSON round trip');
  assert.equal(X.board(mRoundtrip, 'lena', bay).error, 'taken', 'other crew gets taken after JSON round trip');
  // Continue with original mission
  assert.equal(X.capacity(m, 'minh'), 8);
  assert.equal(X.park(m, 'lena', bay).error, 'notDriving');
  assert.deepEqual(X.park(m, 'minh', at(40, -12)), { ok: true, home: false });
  assert.deepEqual(m.expedition.rover, { x: Math.round(at(40, -12).x), y: Math.round(at(40, -12).y) });
  assert.equal(X.capacity(m, 'minh'), 3);
  assert.equal(X.board(m, 'lena', bay).error, 'tooFar', 'it is not in its bay any more');
  assert.deepEqual(X.board(m, 'lena', at(40, -11)), { ok: true });
  assert.deepEqual(X.park(m, 'lena', at(2, 3)), { ok: true, home: true });
  assert.equal(m.expedition.rover, null);
  m.modules.rover.broken = 1;
  assert.equal(X.board(m, 'minh', bay).error, 'noRover');
  assert.equal(X.board(solo(), 'minh', HOME).error, 'noRover', 'no rover in the kit');
});

test('collapsing while driving leaves the rover where you fell', () => {
  const m = solo('EXP-ROVER', ROVER_KIT);
  X.board(m, 'minh', X.bay(m));
  X.collapse(m, 'minh', at(50, 50));
  assert.deepEqual(m.expedition.rover, { x: Math.round(at(50, 50).x), y: Math.round(at(50, 50).y) });
});

test('the suit level a game reports is kept between empty and full, and ignored while collapsed', () => {
  const m = coop();
  X.setSuit(m, 'lena', 87.5);
  assert.equal(X.suitOf(m, 'lena'), 87.5);
  X.setSuit(m, 'lena', 900);
  assert.equal(X.suitOf(m, 'lena'), D.EXPEDITION.suit);
  X.setSuit(m, 'lena', -4);
  assert.equal(X.suitOf(m, 'lena'), 0);
  // Test junk input: set non-zero value first, then junk, verify it's ignored
  X.setSuit(m, 'lena', 50);
  assert.equal(X.suitOf(m, 'lena'), 50);
  for (const junk of ['abc', '', false, [], null, undefined, '80', NaN, Infinity]) {
    X.setSuit(m, 'lena', junk);
    assert.equal(X.suitOf(m, 'lena'), 50, 'junk input ' + JSON.stringify(junk) + ' is ignored and keeps the level');
  }
  X.setSuit(m, 'nobody', 5);
  assert.equal(m.expedition.suits.nobody, undefined);
  X.collapse(m, 'minh', at(30, 0));
  X.setSuit(m, 'minh', 100);
  assert.equal(X.suitOf(m, 'minh'), 0);
  assert.equal(X.suitOf(m, 'amara'), D.EXPEDITION.suit, 'a full suit when nothing was reported');
});

test('nobody acts once the mission is over or while down', () => {
  const m = solo(), f = first(m, 'metal');
  m.crew[1].status = 'down';
  assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).error, 'notActive');
  m.crew[1].status = 'active';
  m.status = 'lost';
  assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).error, 'badPhase');
});

test('the shared world cache never holds more than 256 chunks', () => {
  const m = solo('EXP-CACHE');
  for (let i = 0; i < 300; i++) X.findsIn(m, i, -i);
  assert.ok(X.cacheSize() <= 256);
  // Verify cache key includes world seed: same chunk from same mission should match world chunk
  const cx = 5, cy = -3;
  const cached = X.findsIn(m, cx, cy);
  const worldChunk = W.chunk(W.seedOf(m.seed), cx, cy);
  assert.deepEqual(cached, worldChunk.finds, 'cache returns same finds as world chunk');
  // Different seed should have different finds for the same coordinates
  const mDiff = solo('DIFFERENT-SEED');
  const cachedDiff = X.findsIn(mDiff, cx, cy);
  const worldDiffChunk = W.chunk(W.seedOf(mDiff.seed), cx, cy);
  assert.deepEqual(cachedDiff, worldDiffChunk.finds, 'different seed has different chunk');
  assert.notDeepEqual(cached, cachedDiff, 'chunks from different seeds are not equal');
});

test("the rover's battery drives 400 tiles a round; it only counts up, and a flat rover can't be boarded", () => {
  const m = solo('EXP-ROVER', ROVER_KIT);
  const bay = X.bay(m);
  assert.equal(X.roverLeft(m), D.EXPEDITION.roverRange);
  X.setRoverDriven(m, 'minh', 50);
  assert.equal(m.expedition.roverDriven, 0, 'only the driver reports it');
  X.board(m, 'minh', bay);
  X.setRoverDriven(m, 'minh', 120.5);
  assert.equal(X.roverLeft(m), D.EXPEDITION.roverRange - 120.5);
  X.setRoverDriven(m, 'minh', 30);
  assert.equal(m.expedition.roverDriven, 120.5, 'never goes down');
  X.setRoverDriven(m, 'minh', 9999);
  assert.equal(X.roverLeft(m), 0);
  X.park(m, 'minh', bay);
  assert.equal(X.board(m, 'lena', bay).error, 'flat');
  const next = E.resolveTurn(m, E.defaultPlan(m)).state;
  assert.equal(next.expedition.roverDriven, 0, 'recharged overnight');
  assert.deepEqual(X.board(next, 'lena', X.bay(next)), { ok: true });
});

test('nobody without a crew id drives, and the rover is not parked once the mission is over', () => {
  const m = solo('EXP-ROVER', ROVER_KIT);
  assert.deepEqual(X.board(m, 'minh', X.bay(m)), { ok: true });
  X.setRoverDriven(m, undefined, 399);
  assert.equal(m.expedition.roverDriven, 0, 'an undefined crew id is not the driver');
  assert.equal(X.park(m, undefined, at(40, 0)).error, 'notDriving');
  assert.equal(X.capacity(m, undefined), D.EXPEDITION.pack);
  m.status = 'success';
  assert.equal(X.park(m, 'minh', at(40, 0)).error, 'badPhase', 'a stray park after the mission ends moves nothing');
  assert.deepEqual(m.expedition.rover, { driver: 'minh' });
});

test("getting out of the rover, or collapsing in it, records how far it went: the last seconds of driving count", () => {
  const m = solo('EXP-ROVER', ROVER_KIT);
  X.board(m, 'minh', X.bay(m));
  X.setRoverDriven(m, 'minh', 15);
  assert.deepEqual(X.park(m, 'minh', at(30, 0), 24.4), { ok: true, home: false });
  assert.equal(m.expedition.roverDriven, 24.4, 'the distance comes with getting out');
  X.board(m, 'minh', at(30, 0));
  X.park(m, 'minh', at(30, 0), 'far');
  assert.equal(m.expedition.roverDriven, 24.4, 'a distance that is not a number is ignored');
  X.board(m, 'minh', at(30, 0));
  assert.deepEqual(X.collapse(m, 'minh', at(31, 0), 30.2), { ok: true, benched: true });
  assert.equal(m.expedition.roverDriven, 30.2, 'and with a collapse');
  const c = coop('EXP-ROVER-C');
  c.modules.rover.count = 1;
  c.layout.push({ type: 'rover', x: 0, y: 0 });
  X.board(c, 'lena', X.bay(c));
  X.collapse(c, 'lena', at(40, 0), 12);
  assert.equal(c.expedition.roverDriven, 12, 'in co-op too');
});

test('solo play remembers where you stand (whole pixels), for a reload; junk and made-up crew are ignored', () => {
  const m = solo();
  assert.equal(X.whereOf(m, 'minh'), null, 'nowhere yet');
  X.setWhere(m, 'minh', { x: 2600.4, y: -95.6 });
  assert.deepEqual(X.whereOf(m, 'minh'), { x: 2600, y: -96 });
  for (const junk of [null, {}, { x: NaN, y: 1 }, { x: '5', y: 1 }]) X.setWhere(m, 'minh', junk);
  assert.deepEqual(X.whereOf(m, 'minh'), { x: 2600, y: -96 }, 'junk is ignored');
  X.setWhere(m, 'nobody', { x: 1, y: 1 });
  assert.equal(m.expedition.where.nobody, undefined);
  assert.equal(X.whereOf(m, '__proto__'), null);
  m.expedition.where.lena = { x: 'a', y: 2 };
  assert.equal(X.whereOf(m, 'lena'), null, 'a broken spot reads as nowhere');
  const next = E.resolveTurn(m, E.defaultPlan(m)).state;
  assert.equal(X.whereOf(next, 'minh'), null, 'a new round starts at the base');
});

// The first chunk under a landmark near the base, on mission codes tried in turn, that hides a find (or a cave).
function hiding(what) {
  for (let s = 0; s < 40; s++) {
    const m = solo('HIDE-' + s), seed = W.seedOf(m.seed);
    for (let j = -2; j < 2; j++) for (let i = -2; i < 2; i++) {
      const b = (W.landmarkAt(seed, i, j) || {}).box;
      if (!b) continue;
      for (let cy = Math.floor(b[1] / 32); cy <= Math.floor(b[3] / 32); cy++) for (let cx = Math.floor(b[0] / 32); cx <= Math.floor(b[2] / 32); cx++) {
        const c = X.chunkAt(m, cx, cy);
        if (c.hidden[what].length) return { m, c, cx, cy };
      }
    }
  }
  throw new Error('no chunk near the base hides one of its ' + what);
}

test('a find or a cave under a footprint is left out: findsIn, cavesIn and findById skip it, and collect refuses it', () => {
  const { m, c, cx, cy } = hiding('finds'), n = c.hidden.finds[0], f = c.finds[n], id = cx + ',' + cy + ':' + n;
  const finds = X.findsIn(m, cx, cy);
  assert.ok(!finds.some(g => g.n === n), 'findsIn leaves it out');
  assert.equal(finds.length, c.finds.length - c.hidden.finds.length);
  assert.ok(Object.isFrozen(finds));
  assert.equal(X.findById(m, id), null);
  const before = snap(m);
  assert.equal(X.collect(m, 'minh', id, at(f.x, f.y)).error, 'noFind');
  assert.equal(snap(m), before, 'a refused action changes nothing');
  // The others keep their ids: a find's id is its index in the whole list.
  for (const g of finds) assert.equal(X.findById(m, cx + ',' + cy + ':' + g.n).x, g.x);
  const k = hiding('caves'), caves = X.cavesIn(k.m, k.cx, k.cy);
  assert.deepEqual(caves.map(v => v.n), k.c.caves.map(v => v.n).filter(v => !k.c.hidden.caves.includes(v)));
  assert.ok(Object.isFrozen(caves));
});

test('a landmark and a structure are read by id from inside their cell, frozen; other spellings and cells get null, and nothing is looked up', () => {
  const m = solo('POI-1'), seed = W.seedOf(m.seed);
  let l = null, s = null;
  for (let j = -3; j < 3 && !l; j++) for (let i = -3; i < 3 && !l; i++) l = W.landmarkAt(seed, i, j);
  for (let j = -6; j < 6 && !s; j++) for (let i = -6; i < 6 && !s; i++) s = W.structureAt(seed, i, j);
  const lp = at(l.x, l.y), sp = at(s.x, s.y);
  assert.deepEqual(X.landmarkById(m, l.id, lp), l);
  assert.deepEqual(X.structureById(m, s.id, sp), s);
  assert.ok(Object.isFrozen(X.landmarkById(m, l.id, lp).sites) && Object.isFrozen(X.structureById(m, s.id, sp).box));
  // The chunks round them list them, frozen.
  const lc = [Math.floor(l.x / 32), Math.floor(l.y / 32)], sc = [Math.floor(s.x / 32), Math.floor(s.y / 32)];
  assert.ok(X.landmarksIn(m, ...lc).some(k => k.id === l.id) && Object.isFrozen(X.landmarksIn(m, ...lc)));
  assert.ok(X.structuresIn(m, ...sc).some(k => k.id === s.id) && Object.isFrozen(X.structuresIn(m, ...sc)));
  const real = { L: W.landmarkAt, S: W.structureAt };
  let looked = 0;
  W.landmarkAt = (...a) => { looked++; return real.L(...a); };
  W.structureAt = (...a) => { looked++; return real.S(...a); };
  try {
    for (const id of [l.id + ':0', 'l' + l.i + ',' + l.j, 'L0' + l.i + ',' + l.j, 'L' + l.i + ', ' + l.j, 'S' + l.i + ',' + l.j, '', null, 'L4000,4000']) {
      assert.equal(X.landmarkById(m, id, lp), null, String(id));
    }
    for (const id of [s.id + ':0', 's' + s.i + ',' + s.j, 'S0' + s.i + ',' + s.j, 'L' + s.i + ',' + s.j, 'S-4000,9']) {
      assert.equal(X.structureById(m, id, sp), null, String(id));
    }
    assert.equal(X.landmarkById(m, l.id, { x: lp.x + 256 * T, y: lp.y }), null, 'from the next cell');
    assert.equal(X.structureById(m, s.id, { x: sp.x, y: sp.y - 64 * T }), null, 'from the next cell');
    assert.equal(X.landmarkById(m, l.id, null), null);
    assert.equal(X.structureById(m, s.id, { x: NaN, y: 0 }), null);
  } finally { W.landmarkAt = real.L; W.structureAt = real.S; }
  assert.equal(looked, 0, 'nothing was looked up for them');
});

test("a landmark's site is collected like a find: a load by its kind and ring, its loads left kept under its id, the backpack's rules too", () => {
  const m = solo('EXP-1'), l = X.landmarkById(m, 'L0,-1', at(134, -46)); // a giant crater: floor ice and a peak survey
  const s = l.sites[0], id = 'L0,-1:0', here = at(s.x, s.y);
  assert.equal(s.kind, 'ice');
  const r = X.collect(m, 'minh', id, here);
  assert.equal(r.ok, true);
  assert.deepEqual(r.item, { kind: 'ice', id, region: s.region, res: 'water', amount: 40 });
  assert.equal(r.left, D.FINDS.ice.loads[s.ring] - 1);
  assert.equal(m.expedition.sites[id], r.left);
  assert.deepEqual(m.expedition.stats.minh, { finds: { ice: 1 } });
  assert.equal(X.collect(m, 'minh', id, { x: here.x + 1.6 * T, y: here.y }).error, 'tooFar', '1.5 tiles of slack, no more');
  X.collect(m, 'minh', id, here);
  X.collect(m, 'minh', id, here);
  assert.equal(X.collect(m, 'minh', id, here).error, 'full', 'the backpack holds 3 loads on foot');
  for (let i = 3; i < D.FINDS.ice.loads[s.ring]; i++) m.expedition.carried.minh = [], X.collect(m, 'minh', id, here);
  m.expedition.carried.minh = [];
  assert.equal(X.collect(m, 'minh', id, here).error, 'empty');
  assert.equal(X.collect(m, 'minh', 'L0,-1:1', at(l.sites[1].x, l.sites[1].y)).ok, true, 'each site has its own loads');
});

test("a survey at a landmark or a formation gives science by its ring (half again in the Crater Field and for the Scientist), its subject the landmark's or the formation's", () => {
  const m = solo('EXP-1'), s = X.landmarkById(m, 'L0,-1', at(134, -46)).sites[2], id = 'L0,-1:2';
  const crater = W.REGIONS[s.region] === 'craters' ? 1.5 : 1;
  const r = X.collect(m, 'diego', id, at(s.x, s.y));
  assert.deepEqual(r.item, { kind: 'science', id, region: s.region, res: 'science', amount: Math.round(D.FINDS.science.science[s.ring] * crater * 1.5), sub: 'crater' });
  assert.equal(X.collect(m, 'diego', id, at(s.x, s.y)).error, 'empty', 'a survey is one load');
  const p = solo('POI-1'), f = X.chunkAt(p, 0, 0).formations[0], g = f.sites[0], fid = 'F0,0:0';
  assert.equal(f.id + ':0', fid);
  const q = X.collect(p, 'minh', fid, at(g.x, g.y));
  assert.deepEqual(q.item, { kind: 'science', id: fid, region: g.region, res: 'science', amount: D.FINDS.science.science[g.ring], sub: f.kind });
  assert.equal(p.expedition.sites[fid], 0);
});

test("a site from outside its landmark's cell or its formation's chunk is refused before anything is looked up or built; odd spellings are no site", () => {
  const m = solo('EXP-1'), s = X.landmarkById(m, 'L0,-1', at(134, -46)).sites[0], here = at(s.x, s.y), before = snap(m);
  const real = { L: W.landmarkAt, C: W.chunk };
  let looked = 0;
  W.landmarkAt = (...a) => { looked++; return real.L(...a); };
  W.chunk = (...a) => { looked++; return real.C(...a); };
  try {
    for (const id of ['L1,-1:0', 'L-4000,4000:0', 'F4000,4000:0', 'F5,-2:0']) assert.equal(X.collect(m, 'minh', id, here).error, 'tooFar', id);
  } finally { W.landmarkAt = real.L; W.chunk = real.C; }
  assert.equal(looked, 0, 'nothing was looked up for them');
  for (const id of ['L0,-1:9', 'L0,-1:', 'L0,-1', 'L00,-1:0', 'L0,-1:00', 'l0,-1:0', 'F4,-2:1', 'F4,-2', 'S0,-1:0']) {
    assert.equal(X.collect(m, 'minh', id, here).error, 'noFind', id);
  }
  assert.equal(X.collect(m, 'minh', 'F4,-2:0', here).error, 'noFind', 'a chunk with no formation has no survey');
  const p = solo('POI-1'), f = X.chunkAt(p, -2, -1).formations[0];
  assert.equal(f.sites.length, 0);
  assert.equal(X.collect(p, 'minh', 'F-2,-1:0', at(f.x, f.y)).error, 'noFind', 'nor has a formation that is only scenery');
  // A survey's spot can lie 1.5 tiles from its chunk's south edge (worldgen's placeFormation): a longer reach would let a
  // player stand in reach but outside the chunk, and be refused after a full hold.
  assert.ok(D.EXPEDITION.reach <= 1.5, "the reach stays inside a formation survey's chunk");
  assert.equal(snap(m), before);
});

test("the first to see a landmark's centre discovers it: 80–150 science by the landmark, banked once for them, the Scientist's half again", () => {
  const m = solo('EXP-1'), l = X.landmarkById(m, 'L0,-1', at(134, -46)), seen = at(l.x + 10, l.y), x = m.expedition;
  const r = X.discover(m, 'minh', l.id, seen);
  assert.equal(r.ok, true);
  assert.ok(r.science >= 80 && r.science <= 150, String(r.science));
  assert.deepEqual(r, { ok: true, landmark: l.id, science: r.science });
  assert.deepEqual(x.landmarks, { [l.id]: { by: 'minh', round: m.turn } });
  assert.equal(x.banked.science, r.science);
  assert.deepEqual(x.banked.lines, [{ crewId: 'minh', kind: 'landmark', res: 'science', region: l.region, amount: r.science, loads: 1, late: false }]);
  assert.equal(x.stats.minh.landmarks, 1);
  const before = snap(m);
  assert.equal(X.discover(m, 'diego', l.id, seen).error, 'known', 'once, whoever sees it next');
  assert.equal(snap(m), before);
  const s = solo('EXP-1');
  assert.equal(X.discover(s, 'diego', l.id, seen).science, Math.round(r.science * 1.5), 'the Scientist gets half again');
  // The reward goes by the landmark: the same in every mission of the world, and not the same for every landmark.
  const all = [];
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const k = W.landmarkAt(W.seedOf(m.seed), i, j);
    if (k) all.push(X.discover(solo('EXP-1'), 'minh', k.id, at(k.x, k.y)).science);
  }
  assert.ok(all.length >= 8 && all.every(v => v >= 80 && v <= 150), all.join(' '));
  assert.ok(new Set(all).size > all.length / 2, all.join(' '));
  assert.equal(all[all.length - 1], X.discover(solo('EXP-1'), 'minh', 'L2,2', at(605, 640)).science);
});

test("a landmark is seen from 15.5 tiles of its centre at most (the rover's 10 on a star dune's crest, 4 more, and the slack); far ids are refused before anything is looked up", () => {
  const m = solo('EXP-1'), l = X.landmarkById(m, 'L0,-1', at(134, -46)), c = at(l.x, l.y), before = snap(m);
  assert.equal(X.discover(m, 'minh', l.id, { x: c.x + 15.6 * T, y: c.y }).error, 'tooFar');
  assert.equal(snap(m), before);
  assert.equal(X.discover(m, 'minh', l.id, { x: c.x, y: c.y - 15.4 * T }).ok, true);
  const p = solo('EXP-1'), real = W.landmarkAt;
  let looked = 0;
  W.landmarkAt = (...a) => { looked++; return real(...a); };
  try {
    for (const id of ['L1,-1', 'L-4000,4000', 'L0,0']) assert.equal(X.discover(p, 'minh', id, c).error, 'tooFar', id);
  } finally { W.landmarkAt = real; }
  assert.equal(looked, 0, 'nothing was looked up for them');
  for (const id of ['L0,-1:0', 'l0,-1', 'L00,-1', 'L0, -1', 'S0,-1', '', null]) assert.equal(X.discover(p, 'minh', id, c).error, 'noLandmark', String(id));
  let none = null;
  for (let j = -3; j <= 3 && !none; j++) for (let i = -3; i <= 3 && !none; i++) if (!W.landmarkAt(W.seedOf(p.seed), i, j)) none = [i, j];
  assert.equal(X.discover(p, 'minh', 'L' + none[0] + ',' + none[1], at(none[0] * 256 + 128, none[1] * 256 + 128)).error, 'noLandmark', 'a cell without one');
  assert.equal(X.discover(p, 'minh', l.id, null).error, 'badPos');
  assert.equal(X.discover(p, 'nobody', l.id, c).error, 'noCrew');
  assert.deepEqual(p.expedition.landmarks, {});
});

// A structure of a kind near the base (EXP-1 has one of each within 5 cells); you use it from its door, (x, y).
function structure(m, kind) {
  const seed = W.seedOf(m.seed);
  for (let r = 0; r < 6; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const s = W.structureAt(seed, i, j);
    if (s && s.kind === kind) return s;
  }
  throw new Error('no ' + kind + ' near the base');
}
const loadsOf = (m, s, r) => r.items.concat(r.left ? m.expedition.drops.find(d => d.id === s.id).items : []);
// The numbers of loads the structures of a kind within r cells of EXP-1's base hold (each opened in a fresh mission).
function loadCounts(kind, r) {
  const seed = W.seedOf('EXP-1'), out = new Set();
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const s = W.structureAt(seed, i, j), q = s && s.kind === kind && X.interact(solo('EXP-1'), 'minh', s.id, at(s.x, s.y));
    if (q) out.add(q.items.length + q.left);
  }
  return [...out].sort();
}

test('a cache opens once: its 1–2 supplies, fixed by the mission code, go into your backpack and what does not fit is left at its door', () => {
  const m = solo('EXP-1'), s = structure(m, 'cache'), door = at(s.x, s.y), x = m.expedition;
  const ice = { kind: 'ice', res: 'water', amount: 40 };
  x.carried.minh = [ice, ice, ice];
  const r = X.interact(m, 'minh', s.id, door);
  assert.equal(r.ok, true);
  assert.equal(r.done, 'used');
  assert.deepEqual(x.structures, { [s.id]: 'used' });
  assert.equal(x.stats.minh.structures, 1);
  assert.deepEqual(r.items, [], 'a full backpack takes none');
  const d = x.drops.find(k => k.id === s.id);
  assert.deepEqual([d.x, d.y], [door.x, door.y], 'they wait at its door');
  assert.ok(d.items.length >= 1 && d.items.length <= 2 && r.left === d.items.length);
  for (const it of d.items) {
    assert.equal(it.kind, 'cache');
    assert.equal(it.id, s.id);
    assert.ok(['spares', 'food', 'o2'].includes(it.res), it.res);
  }
  const supplies = d.items.slice();
  x.carried.minh = [];
  assert.deepEqual(X.pickUp(m, 'minh', s.id, door).items, supplies, 'picked up as any drop');
  const again = solo('EXP-1');
  assert.deepEqual(X.interact(again, 'diego', s.id, door).items, supplies, 'the same supplies in every mission of the code, whoever opens it');
  assert.equal(X.interact(m, 'diego', s.id, door).error, 'done', 'once');
  assert.deepEqual(loadCounts('cache', 4), [1, 2], 'by the cache: some hold 1, some 2');
});

test('a wreck gives 2–3 metal loads and a spare kit, a solar array 2 loads of materials; on foot 3 loads fit and the rest is left at the door', () => {
  const m = solo('EXP-1'), w = structure(m, 'wreck'), x = m.expedition;
  const r = X.interact(m, 'lena', w.id, at(w.x, w.y)), loads = loadsOf(m, w, r);
  const metal = loads.filter(it => it.res === 'materials');
  assert.ok(metal.length >= 2 && metal.length <= 3, String(metal.length));
  assert.ok(metal.every(it => it.amount === D.FINDS.metal.kg && it.kind === 'wreck'));
  assert.deepEqual(loads.filter(it => it.res === 'spares').map(it => it.amount), [1]);
  assert.equal(loads.length, metal.length + 1);
  assert.equal(r.items.length, 3);
  assert.equal(x.carried.lena.length, 3);
  assert.deepEqual(loadCounts('wreck', 5), [3, 4], 'by the wreck: 2 or 3 metal loads, and the spare kit');
  const a = structure(m, 'array'), q = X.interact(m, 'diego', a.id, at(a.x, a.y));
  const load = { kind: 'array', id: a.id, region: a.region, res: 'materials', amount: D.FINDS.metal.kg };
  assert.deepEqual(q, { ok: true, done: 'used', items: [load, load], left: 0, fog: {} });
  assert.deepEqual(x.structures, { [w.id]: 'used', [a.id]: 'used' });
});

test('a repaired weather station reveals the fog within 24 tiles of it, banks 20 science and forecasts the weather a round ahead for 3 rounds', () => {
  const m = solo('EXP-1'), s = structure(m, 'weather'), x = m.expedition;
  assert.equal(X.forecastAhead(m), null, 'no forecast before');
  const r = X.interact(m, 'minh', s.id, at(s.x, s.y));
  assert.equal(r.done, 'repaired');
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.fog, x.revealed, 'what it revealed, for the co-op server to share');
  const seen = (tx, ty) => {
    const cx = Math.floor(tx / 32), cy = Math.floor(ty / 32), k = cx + ',' + cy, bits = x.revealed[k] && F.decode(x.revealed[k]);
    return !!bits && F.has(bits, tx - cx * 32, ty - cy * 32) === 1;
  };
  const mx = (s.box[0] + s.box[2] + 1) / 2, my = (s.box[1] + s.box[3] + 1) / 2; // the middle of its 2×2 footprint
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const tile = d => [Math.floor(mx + dx * d), Math.floor(my + dy * d)]; // the tile whose middle is d tiles out
    assert.ok(seen(...tile(23.5)), '23.5 tiles out, ' + [dx, dy]);
    assert.ok(!seen(...tile(24.5)), 'not 24.5 tiles out, ' + [dx, dy]);
  }
  assert.equal(x.banked.science, D.STRUCTURES.kinds.weather.science);
  assert.deepEqual(x.banked.lines, [{ crewId: 'minh', kind: 'weather', res: 'science', region: s.region, amount: 20, loads: 1, late: false }]);
  assert.equal(x.forecastUntil, m.turn + 3);
  const now = m.turn;
  for (let t = now; t <= now + 3; t++) {
    m.turn = t;
    assert.equal(X.forecastAhead(m), m.schedule[t + 1].weather, 'round ' + t + ' sees the next');
  }
  m.turn = now + 4;
  assert.equal(X.forecastAhead(m), null, 'then it stops');
});

test('a repaired comms mast marks the nearest landmark and every other structure within 96 tiles; the marks are read from the world, never stored', () => {
  const m = solo('EXP-1'), seed = W.seedOf(m.seed), s = W.structureAt(seed, -3, -4); // a mast with 4 structures near it
  assert.equal(s.kind, 'mast');
  assert.deepEqual(X.mastMarks(m), [], 'nothing before it is repaired');
  X.interact(m, 'lena', s.id, at(s.x, s.y));
  let near = null;
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
    const l = W.landmarkAt(seed, i, j), d = l && (l.x - s.x) * (l.x - s.x) + (l.y - s.y) * (l.y - s.y);
    if (l && (!near || d < near.d)) near = { d, mark: { id: l.id, x: l.x, y: l.y, kind: l.kind } };
  }
  const want = [near.mark];
  for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
    const k = W.structureAt(seed, i, j);
    if (k && k.id !== s.id && (k.x - s.x) * (k.x - s.x) + (k.y - s.y) * (k.y - s.y) <= 96 * 96) want.push({ id: k.id, x: k.x, y: k.y, kind: k.kind });
  }
  assert.ok(want.length >= 3, 'structures to mark: ' + (want.length - 1));
  const byId = list => list.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const marks = X.mastMarks(m);
  assert.deepEqual(byId(marks), byId(want));
  assert.ok(marks.every(k => Object.keys(k).join() === 'id,x,y,kind'), 'exactly { id, x, y, kind }');
  assert.deepEqual(m.expedition.structures, { [s.id]: 'repaired' }, 'only its state is stored');
});

test('using a structure is refused from outside its cell before anything is looked up, and for odd spellings, an empty cell, a hab pod, one already used or a door out of reach', () => {
  const m = solo('EXP-1'), s = structure(m, 'cache'), door = at(s.x, s.y), before = snap(m), real = W.structureAt;
  let looked = 0;
  W.structureAt = (...a) => { looked++; return real(...a); };
  try {
    for (const id of ['S-4000,9', 'S' + (s.i + 1) + ',' + s.j, 'S' + s.i + ',' + (s.j - 1)]) assert.equal(X.interact(m, 'minh', id, door).error, 'tooFar', id);
  } finally { W.structureAt = real; }
  assert.equal(looked, 0, 'nothing was looked up for them');
  for (const id of ['s' + s.i + ',' + s.j, 'S0' + s.i + ',' + s.j, s.id + ':0', 'L' + s.i + ',' + s.j, '', null]) {
    assert.equal(X.interact(m, 'minh', id, door).error, 'noStructure', String(id));
  }
  let none = null;
  for (let j = -4; j <= 4 && !none; j++) for (let i = -4; i <= 4 && !none; i++) if (!W.structureAt(W.seedOf(m.seed), i, j)) none = [i, j];
  assert.equal(X.interact(m, 'minh', 'S' + none[0] + ',' + none[1], at(none[0] * 64 + 32, none[1] * 64 + 32)).error, 'noStructure', 'a cell without one');
  const pod = structure(m, 'pod');
  assert.equal(X.interact(m, 'minh', pod.id, at(pod.x, pod.y)).error, 'badKind', 'a hab pod is walked into, not used');
  assert.equal(X.interact(m, 'minh', s.id, { x: door.x, y: door.y + 1.6 * T }).error, 'tooFar', '1.5 tiles of slack, no more');
  assert.equal(X.interact(m, 'minh', s.id, null).error, 'badPos');
  assert.equal(X.interact(m, 'nobody', s.id, door).error, 'noCrew');
  assert.equal(snap(m), before, 'a refused action changes nothing');
  assert.equal(X.interact(m, 'minh', s.id, { x: door.x, y: door.y + 1.4 * T }).ok, true);
  assert.equal(X.interact(m, 'minh', s.id, door).error, 'done');
});

test('holding E at a structure: 3 s for a cache, 6 s for a wreck, a weather station or a mast (the Engineer 3 s), 5 s for a solar array', () => {
  const want = { cache: [3, 3], wreck: [6, 3], weather: [6, 3], mast: [6, 3], array: [5, 5] };
  for (const kind of Object.keys(want)) {
    assert.equal(X.holdSeconds(kind, 'medic'), want[kind][0], kind);
    assert.equal(X.holdSeconds(kind, 'engineer'), want[kind][1], kind + ', the Engineer');
  }
  assert.equal(X.holdSeconds('pod', 'engineer'), 1.5, "a cargo pod's loads are still the Engineer's quick work");
  assert.equal(X.holdSeconds('pod', 'medic'), 3);
});

test("a mast marks the nearest landmark, also when it stands across the border of the mast's own landmark cell", () => {
  let masts = 0, across = 0;
  for (const code of ['EXP-1', 'POI-1', 'EXP-SCI']) {
    const seed = W.seedOf(code);
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
      const s = W.structureAt(seed, i, j);
      if (!s || s.kind !== 'mast') continue;
      const m = solo(code);
      m.expedition.structures[s.id] = 'repaired';
      let near = null, nd = Infinity;
      for (let b = -5; b <= 5; b++) for (let a = -5; a <= 5; a++) {
        const l = W.landmarkAt(seed, a, b), d = l && (l.x - s.x) * (l.x - s.x) + (l.y - s.y) * (l.y - s.y);
        if (l && d < nd) { near = l; nd = d; }
      }
      assert.equal(X.mastMarks(m).filter(k => k.id[0] === 'L').map(k => k.id).join(), near.id, code + ' ' + s.id);
      masts++;
      if (Math.floor(s.x / 256) !== near.i || Math.floor(s.y / 256) !== near.j) across++;
    }
  }
  assert.ok(masts >= 10 && across >= 3, masts + ' masts, ' + across + ' with the nearest in another cell');
});

test('a hab pod refills your suit from inside it, once per pod for each crew member each round; the advance gives a new one', () => {
  const m = solo('EXP-1'), p = X.structureById(m, 'S0,-1', at(32, -53)), x = m.expedition;
  assert.equal(p.kind, 'pod');
  const floor = at((p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2);
  x.suits.minh = 40;
  assert.deepEqual(X.refill(m, 'minh', p.id, floor), { ok: true, suit: D.EXPEDITION.suit });
  assert.equal(x.suits.minh, D.EXPEDITION.suit);
  assert.deepEqual(x.refills, { minh: [p.id] });
  const before = snap(m);
  assert.equal(X.refill(m, 'minh', p.id, floor).error, 'refilled', 'once a round');
  assert.equal(snap(m), before);
  assert.equal(X.refill(m, 'diego', p.id, floor).ok, true, 'each crew member has their own');
  const { state } = E.resolveTurn(m, E.defaultPlan(m));
  assert.deepEqual(state.expedition.refills, {}, 'the advance clears them');
  assert.equal(X.refill(state, 'minh', p.id, floor).ok, true, 'and the next round it refills again');
});

test('a hab pod refills only from inside its footprint, with the 1.5 tiles of slack every action gets; nothing else refills', () => {
  const m = solo('EXP-1'), p = X.structureById(m, 'S0,-1', at(32, -53)), b = p.box, before = snap(m);
  assert.equal(X.refill(m, 'minh', p.id, at(p.x, b[3] + 2)).error, 'tooFar', 'two steps out of its door');
  assert.equal(X.refill(m, 'minh', p.id, at(b[0] - 3, (b[1] + b[3]) / 2)).error, 'tooFar', 'three steps west of its wall');
  const c = structure(m, 'cache');
  assert.equal(X.refill(m, 'minh', c.id, at(c.x, c.y)).error, 'badKind', 'a cache is no hab pod');
  const real = W.structureAt;
  let looked = 0;
  W.structureAt = (...a) => { looked++; return real(...a); };
  try {
    for (const id of ['S-4000,9', 'S1,-1', 'S0,0']) assert.equal(X.refill(m, 'minh', id, at(p.x, p.y)).error, 'tooFar', id);
  } finally { W.structureAt = real; }
  assert.equal(looked, 0, 'nothing was looked up for them');
  for (const id of ['s0,-1', 'S00,-1', 'S0,-1:0', 'L0,-1', '', null]) assert.equal(X.refill(m, 'minh', id, at(p.x, p.y)).error, 'noStructure', String(id));
  assert.equal(X.refill(m, 'minh', p.id, null).error, 'badPos');
  assert.equal(X.refill(m, 'nobody', p.id, at(p.x, p.y)).error, 'noCrew');
  assert.equal(snap(m), before, 'a refused action changes nothing');
  assert.equal(X.refill(m, 'minh', p.id, at(p.x, b[3] + 1)).ok, true, 'a step out of its door is within the slack');
});

test('a landmark or a structure is looked up through W each time, once, so the checks that nothing was looked up count something', () => {
  const m = solo('EXP-1'), l = X.landmarkById(m, 'L0,-1', at(134, -46)), c = structure(m, 'cache'), p = X.structureById(m, 'S0,-1', at(32, -53));
  const real = { L: W.landmarkAt, S: W.structureAt };
  let looked = 0;
  W.landmarkAt = (...a) => { looked++; return real.L(...a); };
  W.structureAt = (...a) => { looked++; return real.S(...a); };
  try {
    for (const [name, go] of [
      ['landmarkById', () => X.landmarkById(m, l.id, at(l.x, l.y))],
      ['structureById', () => X.structureById(m, c.id, at(c.x, c.y))],
      ['collect a landmark site', () => X.collect(m, 'minh', l.id + ':0', at(l.sites[0].x, l.sites[0].y))],
      ['discover', () => X.discover(m, 'minh', l.id, at(l.x, l.y))],
      ['interact', () => X.interact(m, 'minh', c.id, at(c.x, c.y))],
      ['refill', () => X.refill(m, 'minh', p.id, at(p.x, p.y))],
    ]) {
      looked = 0;
      const r = go();
      assert.ok(r && !r.error, name + ': ' + JSON.stringify(r));
      assert.equal(looked, 1, name + ' asks the world once');
    }
  } finally { W.landmarkAt = real.L; W.structureAt = real.S; }
});

test("a mission saved by 3.4.0 loads with the points of interest's state: no forecast running, its stats kept, and the new actions work on it", () => {
  const m = solo('EXP-1');
  delete m.expedition.forecastUntil; // what 3.4.0 saved: every field but the weather station's forecast
  m.expedition.stats = { minh: { finds: { ice: 2 } } };
  const up = E.upgradeMission(JSON.parse(JSON.stringify(m)), {}), x = up.expedition; // a save is JSON
  assert.equal(x.forecastUntil, -1);
  assert.equal(X.forecastAhead(up), null);
  assert.deepEqual(x.stats.minh, { finds: { ice: 2 } }, 'kept as it was');
  assert.equal(X.discover(up, 'minh', 'L0,-1', at(134, -46)).ok, true);
  assert.deepEqual(x.stats.minh, { finds: { ice: 2 }, landmarks: 1 });
  assert.equal(X.interact(up, 'minh', 'S3,0', at(200, 12)).done, 'repaired');
  assert.equal(x.forecastUntil, up.turn + 3);
  assert.equal(X.refill(up, 'minh', 'S0,-1', at(32, -55)).ok, true);
  for (const junk of ['3', NaN, Infinity, null, {}]) {
    const s = solo('EXP-1');
    s.expedition.forecastUntil = junk;
    assert.equal(E.upgradeMission(s, {}).expedition.forecastUntil, -1, 'a hand-edited forecast is none: ' + String(junk));
  }
});
