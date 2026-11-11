'use strict';
// M6 base ranks (spec §3): Camp → Outpost → Station → Colony. A rank is bought with materials and crew work like any
// build, arrives at the advance, grows the land on every side (inside the world's flat disc) and the building limits, and
// unlocks the Garage, the Fabricator and the launch pad. The Quick mission has no ranks, and a 3.7.0 save resumes as a Camp.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const W = require('../src/worldgen.js');

// The same small, legal loadout as test/engine.test.js (no rover: the Garage builds one).
function kit(overrides) {
  return Object.assign({
    solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, icedrill: 0,
    greenhouse: 1, lab: 1, rover: 0, waterwall: 1, spares: 4, materials: 1,
    food: 6, o2: 3, water: 3,
  }, overrides || {});
}

// Training missions have no random events, so numbers are exact.
function calm(overrides, seed) {
  return E.createMission({ seed: seed || 'TEST-1', loadout: kit(overrides), events: false });
}

// Everyone on Build: 4.5 points of construction work a round for the four-person crew (the engineer counts 1.5).
function builders(s) {
  const plan = E.defaultPlan(s);
  for (const c of s.crew) plan.jobs[c.id] = 'construction';
  return plan;
}

const key = ([x, y]) => x + ',' + y;
const copy = o => JSON.parse(JSON.stringify(o));
const M6_MODULES = ['garage', 'fabricator', 'launchpad', 'cabin', 'drone'];
const M6_BUILDS = ['rankup', 'garage', 'fabricator', 'launchpad', 'rover', 'cabin', 'drone', 'tanks', 'backpack', 'racks', 'tools', 'launch'];

test('a new mission is a Camp on the 9 × 5 land, with the ice and rock of 3.7.0', () => {
  const s = calm();
  assert.equal(E.rankOf(s), 0);
  assert.equal(s.rank, 0);
  assert.deepEqual(s.gear, { tanks: 0, backpack: 0, racks: 0, tools: 0 });
  assert.equal(s.launched, false);
  assert.equal(s.pending.rank, null);
  assert.equal(E.landTiles(s).length, 45);
  assert.deepEqual(E.landOf(s), { x0: 0, y0: 0, x1: 8, y1: 4 });
  assert.deepEqual(E.landTiles(s).slice(0, 10).map(key), ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0', '7,0', '8,0', '0,1'], 'row by row');
  assert.equal(E.zoneOf(s), D.EXPEDITION.baseZone, "the Camp's base zone is 3.7.0's");
  assert.deepEqual([D.RANKS[0].w, D.RANKS[0].h], [D.GRID.w, D.GRID.h], 'the Camp is the 3.7.0 grid');
  // Pinned from 3.7.0 (efa68ac): the same ice, rock and start layout for the same code.
  assert.deepEqual(s.terrain, { ice: [[1, 4], [7, 4], [1, 1]], rock: [[1, 0], [3, 0], [7, 1], [8, 0]] });
  assert.deepEqual(calm({}, 'MAP-9').terrain, { ice: [[0, 1], [1, 3], [0, 2]], rock: [[3, 0], [5, 0], [1, 1], [0, 4]] });
  assert.deepEqual(calm({}, 'ARES-1234').terrain, { ice: [[8, 3], [7, 4], [0, 2]], rock: [[1, 3], [6, 0], [8, 4], [2, 4]] });
  assert.deepEqual(s.layout.map(t => t.type + '@' + t.x + ',' + t.y), ['hab@4,2', 'recycler@4,1', 'oxygen@3,2', 'greenhouse@5,2', 'lab@4,3',
    'solar@4,0', 'solar@3,1', 'solar@5,1', 'solar@2,2', 'battery@6,2', 'battery@3,3', 'reactor@4,4']);
});

test('a rank-up costs its materials and crew work and arrives at the advance', () => {
  const s = calm();
  s.resources.materials = D.RANKS[1].materials + 50;
  assert.deepEqual(E.costOf(s, 'rankup'), { materials: D.RANKS[1].materials, water: 0, work: D.RANKS[1].work });
  assert.deepEqual(E.canBuild(s, 'rankup'), { ok: true });
  const plan = builders(s);
  plan.builds = [{ type: 'rankup' }];
  const { state, report } = E.resolveTurn(s, plan);
  assert.equal(E.rankOf(state), 1, 'the new rank arrives at the advance');
  assert.equal(E.rankOf(s), 0, 'the state before the advance is untouched');
  assert.deepEqual(report.started, ['rankup']);
  assert.deepEqual(report.completed, ['rankup']);
  assert.ok(report.regolith > 0, 'the work left over makes regolith');
  assert.equal(state.resources.materials, 50 + report.regolith, 'paid once, at the start');
  assert.deepEqual(state.events.filter(e => e.type === 'rank_up'), [{ type: 'rank_up', rank: 1 }], 'the next round opens with it');
  assert.equal(state.pending.rank, null, 'told once');
  assert.deepEqual(E.costOf(state, 'rankup'), { materials: D.RANKS[2].materials, water: 0, work: D.RANKS[2].work }, 'the next one costs the next rank');
  const later = E.resolveTurn(state, E.defaultPlan(state)).state;
  assert.equal(later.events.filter(e => e.type === 'rank_up').length, 0, 'and not again the round after');
  // Without the crew work it waits as a project, paid, and the rank does not come yet.
  const slow = calm();
  slow.resources.materials = D.RANKS[1].materials;
  const idle = E.defaultPlan(slow);
  idle.builds = [{ type: 'rankup' }];
  const waiting = E.resolveTurn(slow, idle);
  assert.equal(E.rankOf(waiting.state), 0);
  assert.deepEqual(waiting.state.projects.map(p => [p.type, p.work]), [['rankup', D.RANKS[1].work]]);
  assert.equal(waiting.state.resources.materials, waiting.report.regolith);
});

test('a rank-up the base cannot afford is refused, and Colony is the last rank', () => {
  const s = calm();
  s.resources.materials = D.RANKS[1].materials - 1;
  assert.deepEqual(E.canBuild(s, 'rankup'), { ok: false, reason: 'materials' });
  const plan = builders(s);
  plan.builds = [{ type: 'rankup' }];
  const { state, report } = E.resolveTurn(s, plan);
  assert.deepEqual(report.started, [], 'sent anyway, it does not start');
  assert.equal(E.rankOf(state), 0);
  for (let r = 2; r < D.RANKS.length; r++) assert.ok(D.RANKS[r].materials > D.RANKS[r - 1].materials, 'each rank costs more than the last');
  E.grantRank(s, 3);
  assert.equal(E.rankOf(s), 3);
  s.resources.materials = 1e6;
  assert.deepEqual(E.canBuild(s, 'rankup'), { ok: false, reason: 'max' }, 'Colony is the last rank');
  E.grantRank(s, 4);
  assert.equal(E.rankOf(s), 3, 'no rank past Colony');
  for (const bad of [undefined, -1, 7, 1.5, '2', null]) assert.equal(E.rankOf({ rank: bad }), 0, String(bad));
});

test('a rank-up queued twice in one round is built once and paid once', () => {
  const s = calm();
  s.resources.materials = D.RANKS[1].materials * 3;
  assert.deepEqual(E.canBuild(s, 'rankup', [{ type: 'rankup' }]), { ok: false, reason: 'max' });
  const plan = E.defaultPlan(s); // nobody on Build: the project waits
  plan.builds = [{ type: 'rankup' }, { type: 'rankup' }];
  const { state, report } = E.resolveTurn(s, plan);
  assert.deepEqual(report.started, ['rankup']);
  assert.equal(state.projects.filter(p => p.type === 'rankup').length, 1);
  assert.equal(state.resources.materials, D.RANKS[1].materials * 2 + report.regolith);
  assert.deepEqual(E.canBuild(state, 'rankup'), { ok: false, reason: 'max' }, 'one under way blocks another');
});

test('each rank grows the land on every side, inside the flat disc, and keeps every building', () => {
  assert.equal(D.LAND_R2, (W.FLAT_RADIUS + 1) ** 2, "the land is the world's flat disc round the HQ");
  const s = calm(), layout = copy(s.layout), [hx, hy] = D.GRID.hq;
  let before = E.landTiles(s);
  for (let r = 1; r < D.RANKS.length; r++) {
    E.grantRank(s, r);
    assert.equal(E.rankOf(s), r);
    assert.deepEqual(s.layout, layout, 'every building stays where it is');
    const box = E.landOf(s), tiles = E.landTiles(s), R = D.RANKS[r];
    assert.deepEqual(box, { x0: hx - Math.floor(R.w / 2), y0: hy - Math.floor(R.h / 2), x1: hx + Math.floor(R.w / 2), y1: hy + Math.floor(R.h / 2) });
    for (const [x, y] of tiles) {
      assert.ok((x - hx) ** 2 + (y - hy) ** 2 <= D.LAND_R2, x + ',' + y + ' is on the flat disc');
      assert.ok(x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1, x + ',' + y + ' is inside the bounds');
      assert.equal(E.onLand(s, x, y), true);
    }
    const sorted = tiles.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    assert.deepEqual(tiles, sorted, 'row by row');
    assert.ok(tiles.some(([x]) => x < 0) && tiles.some(([, y]) => y < 0), 'it grows on the HQ\'s far side too');
    assert.ok(tiles.some(([x]) => x > D.GRID.w - 1) && tiles.some(([, y]) => y > D.GRID.h - 1));
    assert.ok(tiles.length > before.length, 'more land than the rank before');
    const now = new Set(tiles.map(key));
    assert.ok(before.every(t => now.has(key(t))), 'the land before is all still land');
    assert.equal(E.zoneOf(s), R.zone);
    assert.ok(R.zone > D.RANKS[r - 1].zone, 'the base zone grows with the rank');
    before = tiles;
  }
  const box = E.landOf(s);
  assert.equal(E.onLand(s, box.x0, box.y0), false, "a Colony's corner is off the flat disc");
  assert.equal(E.onLand(s, box.x1 + 1, hy), false, 'outside the bounds');
  assert.equal(E.onLand(s, hx + 0.5, hy), false, 'a grid spot is whole tiles');
  assert.equal(E.landTiles(s).length, before.length);
});

test('new land gets its own ice and rock, the same for the same mission code, and the old terrain stays', () => {
  const a = calm({}, 'RANK-7'), b = calm({ lab: 0 }, 'RANK-7');
  const camp = copy(a.terrain), campLand = new Set(E.landTiles(a).map(key));
  E.grantRank(a, 1);
  const outpost = copy(a.terrain), outpostLand = new Set(E.landTiles(a).map(key));
  E.grantRank(a, 2);
  E.grantRank(b, 2); // two steps at once give what one at a time does
  const stationLand = new Set(E.landTiles(a).map(key));
  assert.deepEqual(a.terrain, b.terrain, 'the same code gives the same new ground');
  for (const k of ['ice', 'rock']) {
    assert.deepEqual(a.terrain[k].slice(0, camp[k].length), camp[k], 'the Camp ' + k + ' stays');
    assert.deepEqual(a.terrain[k].slice(0, outpost[k].length), outpost[k], 'the Outpost ' + k + ' stays');
  }
  assert.equal(a.terrain.ice.length, D.GRID.ice + D.RANKS[1].ice + D.RANKS[2].ice);
  assert.equal(a.terrain.rock.length, D.GRID.rock + D.RANKS[1].rock + D.RANKS[2].rock);
  const fresh = (k, from, to) => a.terrain[k].slice(from[k].length, to ? to[k].length : undefined);
  for (const k of ['ice', 'rock']) {
    for (const t of fresh(k, camp, outpost)) assert.ok(outpostLand.has(key(t)) && !campLand.has(key(t)), k + ' ' + key(t) + ' is new Outpost land');
    for (const t of fresh(k, outpost)) assert.ok(stationLand.has(key(t)) && !outpostLand.has(key(t)), k + ' ' + key(t) + ' is new Station land');
  }
  const [hx, hy] = D.GRID.hq;
  for (const [x, y] of a.terrain.ice) assert.ok(Math.max(Math.abs(x - hx), Math.abs(y - hy)) >= 3, 'ice at least 3 tiles out');
  const all = a.terrain.ice.concat(a.terrain.rock).map(key);
  assert.equal(new Set(all).size, all.length, 'no tile is ice or rock twice');
  const c = calm({}, 'RANK-8');
  E.grantRank(c, 2);
  assert.notDeepEqual(c.terrain.ice.slice(D.GRID.ice), a.terrain.ice.slice(D.GRID.ice), 'another code, other ground');
});

test('new ice and rock never land on a building or a project already there', () => {
  // Fill every new Outpost tile but as many as the rank's ice and rock need: those are the only ones they can take.
  const probe = calm({}, 'RANK-9'), campLand = new Set(E.landTiles(probe).map(key));
  E.grantRank(probe, 1);
  const fresh = E.landTiles(probe).filter(t => !campLand.has(key(t)));
  const need = D.RANKS[1].ice + D.RANKS[1].rock, free = fresh.slice(0, need), taken = fresh.slice(need);
  const s = calm({}, 'RANK-9');
  taken.forEach(([x, y], i) => {
    if (i % 2) s.layout.push({ type: 'solar', x, y });
    else s.projects.push({ type: 'solar', x, y, progress: 0, work: 1 });
  });
  E.grantRank(s, 1);
  const got = s.terrain.ice.slice(D.GRID.ice).concat(s.terrain.rock.slice(D.GRID.rock)).map(key).sort();
  assert.deepEqual(got, free.map(key).sort());
});

test('a rank raises the building limits', () => {
  const s = calm();
  assert.equal(E.maxOf(s, 'solar'), 12);
  s.modules.solar.count = 12;
  s.resources.materials = 5000;
  assert.deepEqual(E.canBuild(s, 'solar'), { ok: false, reason: 'max' });
  E.grantRank(s, 1);
  assert.equal(E.maxOf(s, 'solar'), 12 + D.RANKS[1].max.solar);
  assert.deepEqual(E.canBuild(s, 'solar'), { ok: true });
  E.grantRank(s, 3);
  for (const type of D.MODULE_TYPES) {
    const want = D.MODULES[type].max + D.RANKS.slice(1).reduce((n, R) => n + (R.max[type] || 0), 0);
    assert.equal(E.maxOf(s, type), want, type + ' at Colony');
  }
  assert.equal(E.maxOf(s, 'shield'), D.MODULES.shield.max, 'the shield layers stay at 8');
  for (const bad of ['nope', '__proto__', 'rankup', 'kit']) assert.equal(E.maxOf(s, bad), 0, bad);
});

test('the Garage opens at Outpost, and the Garage builds the rover, the pressurised rover and the drone', () => {
  const s = calm();
  s.resources.materials = 5000;
  assert.equal(E.unlockRank('garage'), 1);
  for (const v of ['rover', 'cabin', 'drone']) assert.equal(E.unlockRank(v), 1, v);
  assert.equal(E.maxOf(s, 'garage'), 0);
  assert.deepEqual(E.canBuild(s, 'garage'), { ok: false, reason: 'rank' });
  for (const v of ['rover', 'cabin', 'drone']) assert.deepEqual(E.canBuild(s, v), { ok: false, reason: 'rank' }, v);
  E.grantRank(s, 1);
  assert.equal(E.maxOf(s, 'garage'), 1);
  assert.deepEqual(E.canBuild(s, 'garage'), { ok: true });
  for (const v of ['rover', 'cabin', 'drone']) assert.deepEqual(E.canBuild(s, v), { ok: false, reason: 'needs' }, v + ' needs a Garage');
  assert.deepEqual(E.costOf(s, 'garage'), { materials: D.BUILDS.garage.materials, water: 0, work: D.BUILDS.garage.work });
  const [gx, gy] = E.buildSpots(s, 'garage')[0];
  assert.ok(E.touchesBase(s, gx, gy), 'next to the base');
  const plan = builders(s);
  plan.builds = [{ type: 'garage', x: gx, y: gy }];
  let { state } = E.resolveTurn(s, plan);
  assert.equal(state.modules.garage.count, 1);
  assert.ok(state.layout.some(t => t.type === 'garage' && t.x === gx && t.y === gy), 'the Garage stands on its tile');
  assert.deepEqual(E.canBuild(state, 'garage'), { ok: false, reason: 'max' });
  state.resources.materials = 5000;
  for (const v of ['rover', 'cabin', 'drone']) assert.deepEqual(E.canBuild(state, v), { ok: true }, v);
  state.modules.garage.broken = 1;
  for (const v of ['rover', 'cabin', 'drone']) assert.deepEqual(E.canBuild(state, v), { ok: false, reason: 'needs' }, v + ': a broken Garage builds nothing');
  state.modules.garage.broken = 0;
  // The rover and the pressurised rover each get a bay tile; the drone lives in the Garage.
  assert.ok(D.PLACED.includes('rover') && D.PLACED.includes('cabin') && !D.PLACED.includes('drone'));
  const [rx, ry] = E.buildSpots(state, 'rover')[0];
  const plan2 = builders(state);
  plan2.builds = [{ type: 'rover', x: rx, y: ry }, { type: 'drone' }];
  const next = E.resolveTurn(state, plan2);
  assert.deepEqual(next.report.completed, ['rover', 'drone']);
  assert.equal(next.state.modules.rover.count, 1);
  assert.equal(next.state.modules.drone.count, 1);
  assert.ok(next.state.layout.some(t => t.type === 'rover' && t.x === rx && t.y === ry));
  assert.ok(!next.state.layout.some(t => t.type === 'drone'));
  assert.equal(next.state.resources.materials, 5000 - D.BUILDS.rover.materials - D.BUILDS.drone.materials + next.report.regolith);
  assert.deepEqual(E.canBuild(next.state, 'rover'), { ok: false, reason: 'max' }, 'one rover, as today');
  assert.deepEqual(E.canBuild(next.state, 'drone'), { ok: false, reason: 'max' });
});

test('gear needs a working Fabricator, costs the next level, and stops at the last level', () => {
  const s = calm();
  s.resources.materials = 5000;
  s.resources.water = 5000;
  for (const line of ['fabricator', 'tanks', 'backpack', 'racks', 'tools']) assert.equal(E.unlockRank(line), 2, line);
  assert.deepEqual(E.canBuild(s, 'tanks'), { ok: false, reason: 'rank' });
  E.grantRank(s, 2);
  assert.deepEqual(E.canBuild(s, 'tanks'), { ok: false, reason: 'needs' });
  assert.deepEqual(E.canBuild(s, 'fabricator'), { ok: true });
  const [fx, fy] = E.buildSpots(s, 'fabricator')[0];
  s.layout.push({ type: 'fabricator', x: fx, y: fy });
  s.modules.fabricator.count = 1;
  const L = D.GEAR.tanks.levels;
  for (const line of ['tanks', 'backpack', 'racks', 'tools']) assert.deepEqual(E.canBuild(s, line), { ok: true }, line);
  assert.deepEqual(E.costOf(s, 'tanks'), { materials: L[0].materials, water: L[0].water, work: L[0].work });
  assert.equal(E.costOf(s, 'backpack').water, 0, 'a level with no water costs none');
  assert.deepEqual(E.costOf(s, 'tanks', [{ type: 'tanks' }]), { materials: L[1].materials, water: L[1].water, work: L[1].work }, 'one queued: the level after');
  assert.deepEqual(E.canBuild(s, 'tanks', [{ type: 'tanks' }, { type: 'tanks' }]), { ok: false, reason: 'max' }, 'both levels queued');
  const plan = builders(s);
  plan.builds = [{ type: 'tanks' }];
  const { state, report } = E.resolveTurn(s, plan);
  const without = E.resolveTurn(s, builders(s));
  assert.deepEqual(report.completed, ['tanks']);
  assert.equal(state.gear.tanks, 1, 'the crew has level 1');
  assert.equal(state.resources.materials, 5000 - L[0].materials + report.regolith);
  assert.equal(without.state.resources.water - state.resources.water, L[0].water, 'and paid its water');
  assert.deepEqual(E.costOf(state, 'tanks'), { materials: L[1].materials, water: L[1].water, work: L[1].work });
  state.resources.water = L[1].water - 1;
  assert.deepEqual(E.canBuild(state, 'tanks'), { ok: false, reason: 'water' });
  state.resources.water = 5000;
  state.gear.tanks = L.length;
  assert.deepEqual(E.canBuild(state, 'tanks'), { ok: false, reason: 'max' }, 'the last level');
  state.modules.fabricator.broken = 1;
  assert.deepEqual(E.canBuild(state, 'racks'), { ok: false, reason: 'needs' }, 'a broken Fabricator makes nothing');
  // Two levels in one round: the second costs the second level.
  const two = builders(s);
  two.builds = [{ type: 'racks' }, { type: 'racks' }];
  const R = D.GEAR.racks.levels, both = E.resolveTurn(s, two);
  assert.deepEqual(both.report.started, ['racks', 'racks']);
  assert.equal(both.state.gear.racks, 2);
  assert.equal(both.state.resources.materials, 5000 - R[0].materials - R[1].materials + both.report.regolith);
});

// M6 T8 (the Task 1 review's minor): the gear's water check compares the store with the level's cost, so a tanks level
// bought with the crew's last water is allowed. The forecast and Earth's advice run the plan's builds, so they say the
// water runs out before the player advances.
test('a tanks level that takes the water the crew drinks this round is warned of, red, before the advance', () => {
  const s = calm();
  E.grantRank(s, 2);
  const [fx, fy] = E.buildSpots(s, 'fabricator')[0];
  s.layout.push({ type: 'fabricator', x: fx, y: fy });
  s.modules.fabricator.count = 1;
  s.resources.materials = 5000;
  s.wallWater = 0;
  const safe = builders(s);
  s.resources.water = 5000;
  const need = -E.forecast(s, safe).delta.water;
  assert.ok(need > 0, 'the crew drinks more than the base makes');
  s.resources.water = need + D.GEAR.tanks.levels[0].water - 1; // the round's need and a level, less 1 kg
  assert.ok(!E.forecast(s, safe).warnings.some(w => w.code === 'water_out'), 'without the level the water lasts the round');
  const plan = builders(s);
  plan.builds = [{ type: 'tanks' }];
  assert.deepEqual(E.canBuild(s, 'tanks'), { ok: true }, 'the store covers the level');
  const f = E.forecast(s, plan);
  assert.ok(f.dehydration > 0);
  assert.ok(f.warnings.some(w => w.code === 'water_out'), 'the forecast says the water runs out');
  assert.ok(E.advise(s, plan).some(a => a.code === 'water_out'), 'and so does Earth');
  assert.ok(E.resolveTurn(s, plan).report.dehydration > 0, 'as it does at the advance');
});

test('the launch needs a working launch pad at Colony, and goes once a mission', () => {
  const s = calm();
  s.resources.materials = 5000;
  assert.equal(E.unlockRank('launchpad'), 3);
  assert.equal(E.unlockRank('launch'), 3);
  E.grantRank(s, 2);
  assert.deepEqual(E.canBuild(s, 'launchpad'), { ok: false, reason: 'rank' });
  E.grantRank(s, 3);
  assert.deepEqual(E.canBuild(s, 'launch'), { ok: false, reason: 'needs' });
  assert.deepEqual(E.canBuild(s, 'launchpad'), { ok: true });
  const [lx, ly] = E.buildSpots(s, 'launchpad')[0];
  s.layout.push({ type: 'launchpad', x: lx, y: ly });
  s.modules.launchpad.count = 1;
  assert.deepEqual(E.costOf(s, 'launch'), { materials: D.COLONY.launch.materials, water: 0, work: D.COLONY.launch.work });
  assert.deepEqual(E.canBuild(s, 'launch'), { ok: true });
  const plan = builders(s);
  plan.builds = [{ type: 'launch' }, { type: 'launch' }];
  const { state, report } = E.resolveTurn(s, plan);
  assert.deepEqual(report.started, ['launch']);
  assert.equal(state.launched, true);
  assert.deepEqual(E.canBuild(state, 'launch'), { ok: false, reason: 'max' }, 'once a mission');
});

test('a locked build sent anyway is refused', () => {
  const s = calm();
  s.resources.materials = 5000;
  s.resources.water = 5000;
  const [x, y] = E.buildSpots(s, 'solar')[0];
  const plan = builders(s);
  plan.builds = M6_BUILDS.filter(t => t !== 'rankup').map(type => ({ type, x, y }));
  const { state, report } = E.resolveTurn(s, plan);
  assert.deepEqual(report.started, []);
  assert.deepEqual(state.projects, []);
  assert.equal(state.resources.materials, 5000 + report.regolith, 'nothing spent');
  assert.deepEqual(state.gear, { tanks: 0, backpack: 0, racks: 0, tools: 0 });
  assert.equal(state.launched, false);
});

test('a tier switched off hides its unlocks', () => {
  const tiers = { gear: ['fabricator', 'tanks', 'backpack', 'racks', 'tools'], colony: ['launchpad', 'launch'], cabin: ['cabin'], drone: ['drone'] };
  assert.deepEqual(Object.keys(D.M6).sort(), Object.keys(tiers).sort());
  for (const [tier, types] of Object.entries(tiers)) {
    const was = D.M6[tier];
    try {
      D.M6[tier] = false;
      const s = calm();
      E.grantRank(s, 3);
      s.resources.materials = 5000;
      for (const t of ['garage', 'fabricator', 'launchpad']) s.modules[t].count = 1; // only the switch stands in the way
      for (const type of types) {
        assert.equal(E.unlockRank(type), -1, tier + ': ' + type);
        assert.equal(E.canBuild(s, type).ok, false, tier + ': ' + type);
        assert.equal(E.canBuild(s, type).reason, 'rank', tier + ': ' + type);
        if (D.MODULES[type]) assert.equal(E.maxOf(s, type), 0, tier + ': ' + type);
      }
      assert.equal(E.unlockRank('garage'), 1, tier + ': the ranks and the Garage stay');
      assert.equal(E.maxOf(s, 'solar'), 12 + D.RANKS.slice(1).reduce((n, R) => n + (R.max.solar || 0), 0), tier + ': so do the limits');
      assert.equal(E.landTiles(s).length > 45, true, tier + ': and the land');
    } finally {
      D.M6[tier] = was;
    }
  }
  assert.equal(E.unlockRank('fabricator'), 2, 'back on');
});

test('a Quick mission has no ranks', () => {
  const s = E.createMission({ seed: 'QUICK-R', quick: true, loadout: E.referenceKit('commander', 4, true) });
  s.resources.materials = 5000;
  s.resources.water = 5000;
  for (const type of M6_BUILDS) assert.deepEqual(E.canBuild(s, type), { ok: false, reason: 'quick' }, type);
  assert.equal(E.landTiles(s).length, 45);
  assert.equal(E.zoneOf(s), D.EXPEDITION.baseZone);
  for (const type of M6_MODULES) assert.equal(E.maxOf(s, type), 0, type);
  for (const type of D.MODULE_TYPES.filter(t => !M6_MODULES.includes(t))) assert.equal(E.maxOf(s, type), D.MODULES[type].max, type);
  assert.deepEqual(E.canBuild(s, 'solar'), { ok: true }, "today's builds as today");
  const [x, y] = E.buildSpots(s, 'solar')[0];
  const plan = builders(s);
  plan.builds = M6_BUILDS.map(type => ({ type, x, y }));
  const { state, report } = E.resolveTurn(s, plan);
  assert.deepEqual(report.started, []);
  assert.equal(E.rankOf(state), 0);
});

test('a 3.7.0 save resumes as a Camp', () => {
  const played = [
    E.createMission({ seed: 'OLD-1', loadout: kit() }),
    E.createMission({ seed: 'OLD-Q', quick: true, loadout: E.referenceKit('commander', 4, true) }),
  ].map(m => E.resolveTurn(m, E.defaultPlan(m)).state);
  for (const fresh of played) {
    const m = copy(fresh), what = m.quick ? 'Quick' : 'Full';
    delete m.rank;
    delete m.gear;
    delete m.launched;
    delete m.pending.rank;
    for (const t of M6_MODULES) delete m.modules[t];
    const layout = copy(m.layout), terrain = copy(m.terrain);
    assert.equal(E.upgradeMission(m, {}), m);
    assert.equal(m.rank, 0, what);
    assert.equal(E.rankOf(m), 0, what);
    assert.deepEqual(m.gear, { tanks: 0, backpack: 0, racks: 0, tools: 0 }, what);
    assert.equal(m.launched, false, what);
    assert.equal(m.pending.rank, null, what);
    for (const t of M6_MODULES) assert.deepEqual(m.modules[t], { count: 0, broken: 0 }, what + ': ' + t);
    assert.deepEqual(m.layout, layout, what + ': every building where it was');
    assert.deepEqual(m.terrain, terrain, what);
    assert.equal(E.canBuild(m, 'garage').reason, m.quick ? 'quick' : 'rank', what);
    const next = E.resolveTurn(m, E.defaultPlan(m)).state;
    assert.deepEqual(next.layout, layout, what);
    assert.equal(E.rankOf(next), 0, what);
  }
  // A hand-edited save: wrong types are replaced, good values kept.
  const bad = calm();
  Object.assign(bad, { rank: 'colony', gear: [1, 2], launched: 'yes' });
  bad.pending.rank = 'x';
  E.upgradeMission(bad, {});
  assert.deepEqual([bad.rank, bad.gear, bad.launched, bad.pending.rank], [0, { tanks: 0, backpack: 0, racks: 0, tools: 0 }, false, null]);
  const odd = calm();
  odd.gear = { tanks: 1, backpack: 9, racks: -1, tools: 'two' };
  E.upgradeMission(odd, {});
  assert.deepEqual(odd.gear, { tanks: 1, backpack: D.GEAR.backpack.levels.length, racks: 0, tools: 0 });
  const good = calm();
  E.grantRank(good, 2);
  good.gear.tanks = 1;
  good.launched = true;
  const before = copy(good);
  E.upgradeMission(good, {});
  assert.deepEqual(good, before, 'a 3.8.0 save is untouched');
});

// M6 T5: the launch sends the samples home, and a Colony makes more of its own air, water and food.
function colonyWithPad(map) {
  const s = calm();
  s.resources.materials = 5000;
  E.grantRank(s, 3);
  const [lx, ly] = E.buildSpots(s, 'launchpad')[0];
  s.layout.push({ type: 'launchpad', x: lx, y: ly });
  s.modules.launchpad.count = 1;
  s.expedition.science = map;
  return s;
}

test('the launch sends the samples home once a mission', () => {
  const s = colonyWithPad(300);
  const plan = builders(s);
  plan.builds = [{ type: 'launch' }];
  const { state, report } = E.resolveTurn(s, plan);
  const bonus = Math.round(Math.min(D.COLONY.launch.cap, 300 * D.COLONY.launch.share));
  assert.equal(bonus, 90);
  assert.equal(state.launched, true);
  assert.deepEqual(report.launch, { bonus });
  const base = colonyWithPad(300);
  const noLaunch = E.resolveTurn(base, builders(base));
  assert.equal(Math.round(state.science - noLaunch.state.science), bonus);
  assert.deepEqual(E.canBuild(state, 'launch'), { ok: false, reason: 'max' });
  assert.deepEqual(state.events.filter(e => e.type === 'sample_launch'), [{ type: 'sample_launch', bonus }]);
  const next = E.resolveTurn(state, builders(state));
  assert.deepEqual(next.state.events.filter(e => e.type === 'sample_launch'), [], 'announced once');
});

test('a launch with no map science finishes with no bonus', () => {
  const s = colonyWithPad(0);
  const plan = builders(s);
  plan.builds = [{ type: 'launch' }];
  const { state, report } = E.resolveTurn(s, plan);
  assert.equal(state.launched, true);
  assert.deepEqual(report.launch, { bonus: 0 });
});

test('the launch bonus is capped', () => {
  const s = colonyWithPad(100000);
  const plan = builders(s);
  plan.builds = [{ type: 'launch' }];
  assert.equal(E.resolveTurn(s, plan).report.launch.bonus, D.COLONY.launch.cap);
});

test('a Colony makes more of its own oxygen, water and food', () => {
  const make = rank => {
    const s = calm();
    E.grantRank(s, rank);
    s.crops.fill(D.MODULES.greenhouse.growTurns);
    return s;
  };
  const station = E.resolveTurn(make(2), E.defaultPlan(make(2)));
  const colony = E.resolveTurn(make(3), E.defaultPlan(make(3)));
  assert.equal(station.report.selfSufficient, undefined);
  assert.equal(colony.report.selfSufficient, true);
  const k = D.COLONY.selfSufficient;
  for (const f of ['o2', 'food', 'o2Plant', 'ghO2', 'iceWater']) {
    assert.ok(Math.abs(colony.report.production[f] - station.report.production[f] * k) < 1e-9, f);
  }
  // the recycler only returns water the crew used: self-sufficiency never boosts it
  assert.equal(colony.report.production.recovered, station.report.production.recovered);
  assert.ok(colony.report.production.food > 0, 'the test grows food');
  assert.ok(E.independenceOf(colony.state) >= E.independenceOf(station.state));
});

test('the score counts the launch in full and still caps the map', () => {
  const s = calm();
  s.status = 'success';
  s.expedition.science = 1000;
  s.science = 1000;
  const a = E.scoreMission(s);
  s.science += 90;
  const b = E.scoreMission(s);
  assert.equal(b.parts.science - a.parts.science, 90);
  assert.equal(a.map.counted, b.map.counted);
  assert.equal(b.map.counted, D.SCORE.map.cap);
});

test('a rank without a max table does not throw', () => {
  const saved = D.RANKS[1].max;
  delete D.RANKS[1].max;
  try {
    const s = calm();
    E.grantRank(s, 1);
    assert.doesNotThrow(() => E.maxOf(s, 'solar'));
  } finally { D.RANKS[1].max = saved; }
});

test('at Colony a closed loop with no ice drill never makes water from nothing', () => {
  const s = calm({ icedrill: 0 });
  E.grantRank(s, 3);
  s.wallWater = 0;
  const before = s.resources.water;
  const { report } = E.resolveTurn(s, E.defaultPlan(s));
  assert.ok(report.production.recovered <= report.consumption.waterGross + 1e-9, 'recovery is at most the water used');
  assert.equal(report.production.iceWater, 0);
});

test('a junk launchBonus on a save is repaired', () => {
  const s = calm();
  s.launchBonus = 'lots';
  E.upgradeMission(s, {});
  assert.equal(s.launchBonus, 0);
  s.launchBonus = 7;
  E.upgradeMission(s, {});
  assert.equal(s.launchBonus, 7, 'a good value is kept');
});
