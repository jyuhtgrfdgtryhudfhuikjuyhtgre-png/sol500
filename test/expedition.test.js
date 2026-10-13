'use strict';
// The exploring rules (src/expedition.js, spec §3): collecting, carrying, delivering, the suit, collapses and the rover.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');

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
