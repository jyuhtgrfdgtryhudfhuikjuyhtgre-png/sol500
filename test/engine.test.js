'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');

// A small, legal loadout used across tests.
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

function allJobs(state, job) {
  const plan = E.defaultPlan(state);
  for (const c of state.crew) plan.jobs[c.id] = job;
  return plan;
}

function advance(state, planFn, turns) {
  let s = state;
  for (let i = 0; i < turns && s.status === 'active'; i++) s = E.resolveTurn(s, planFn(s)).state;
  return s;
}

// ---------- manifest ----------

test('loadout mass is the fixed habitat plus every packed item', () => {
  const s = E.summarizeLoadout(kit());
  let expected = D.HAB.mass;
  for (const [id, n] of Object.entries(kit())) expected += n * D.ITEMS[id].mass;
  assert.equal(Math.round(s.mass * 100), Math.round(expected * 100));
  assert.equal(s.over, false);
});

test('loadout over the mass budget is rejected', () => {
  const v = E.validateLoadout(kit({ reactor: 2, food: 12, o2: 8, water: 8 }));
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('over_budget'));
});

test('the reference kit fits the mass budget', () => {
  assert.equal(E.validateLoadout(D.RECOMMENDED).ok, true);
});

test('cadets get a bigger mass budget than veterans', () => {
  const heavy = kit({ food: 8, water: 4 }); // about 31.3 t
  assert.equal(E.validateLoadout(heavy, 'cadet').ok, true);
  assert.equal(E.validateLoadout(heavy, 'commander').ok, false);
  assert.equal(E.validateLoadout(kit(), 'veteran').ok, false);
});

test('difficulty is stored on the mission and sets the Earth drops', () => {
  const v = E.createMission({ seed: 'DIFF', loadout: kit({ food: 4, water: 2, o2: 2 }), difficulty: 'veteran' });
  assert.equal(v.difficulty, 'veteran');
  assert.equal(v.depot.drops, D.DIFFICULTY.veteran.drops);
  const c = E.createMission({ seed: 'DIFF', loadout: kit() });
  assert.equal(c.difficulty, 'commander');
});

test('a five-person crew adds a commander and a bigger lander', () => {
  const st = E.createMission({ seed: 'FIVE', loadout: kit({ food: 7, o2: 4 }), crewSize: 5, events: false });
  assert.equal(st.crew.length, 5);
  assert.equal(st.crew[4].role, 'commander');
  assert.equal(E.validateLoadout(kit({ food: 7, o2: 4 }), 'commander', 5).ok, true);
  assert.equal(E.validateLoadout(kit({ food: 7, o2: 4 }), 'commander', 4).ok, false);
  const f = E.forecast(st, E.defaultPlan(st));
  assert.equal(Math.round(f.consumption.o2), Math.round(0.84 * 5 * 25));
});

test('an active commander makes everyone else work faster and lifts morale', () => {
  const st = E.createMission({ seed: 'FIVE', loadout: kit({ food: 7, o2: 4 }), crewSize: 5, events: false });
  const plan = allJobs(st, 'science');
  const led = E.forecast(st, plan);
  const alone = E.createMission({ seed: 'FIVE', loadout: kit({ food: 7, o2: 4 }), crewSize: 5, events: false });
  alone.crew[4].status = 'down';
  const unled = E.forecast(alone, allJobs(alone, 'science'));
  assert.ok(led.points.science > unled.points.science + 4 * 0.05);
  assert.ok(led.moraleDelta > unled.moraleDelta);
});

test('the reference kits fit every difficulty and crew size', () => {
  for (const level of Object.keys(D.DIFFICULTY)) {
    for (const size of [4, 5]) {
      assert.equal(E.validateLoadout(E.referenceKit(level, size), level, size).ok, true, level + ' ' + size);
    }
  }
});

test('new mission converts pallets into starting stocks', () => {
  const st = calm();
  assert.equal(st.resources.food, 6 * D.ITEMS.food.kg);
  assert.equal(st.resources.o2, 3 * D.ITEMS.o2.kg);
  assert.equal(st.resources.water, 3 * D.ITEMS.water.kg);
  assert.equal(st.resources.materials, 1 * D.ITEMS.materials.kg);
  assert.equal(st.resources.spares, 4);
  assert.equal(st.wallWater, 1 * D.ITEMS.waterwall.kg);
  assert.equal(st.crew.length, 4);
  assert.deepEqual(st.crew.map(c => c.role), ['engineer', 'biologist', 'scientist', 'medic']);
  assert.equal(st.status, 'active');
});

// ---------- map ----------

test('delivered modules are placed on the base grid around the HQ', () => {
  const st = calm();
  const placed = st.layout.filter(t => t.type === 'solar').length;
  assert.equal(placed, 4);
  const hq = st.layout.find(t => t.type === 'hab');
  assert.deepEqual([hq.x, hq.y], D.GRID.hq);
  const keys = st.layout.map(t => t.x + ',' + t.y);
  assert.equal(new Set(keys).size, keys.length, 'no two structures share a tile');
});

test('the map has ice and rock tiles and the same code gives the same map', () => {
  const a = calm({}, 'MAP-9');
  const b = calm({ lab: 0 }, 'MAP-9');
  assert.equal(a.terrain.ice.length, D.GRID.ice);
  assert.equal(a.terrain.rock.length, D.GRID.rock);
  assert.deepEqual(a.terrain, b.terrain);
});

test('a delivered reactor sits at least two tiles from the HQ', () => {
  const st = calm({ reactor: 1 });
  const r = st.layout.find(t => t.type === 'reactor');
  const [hx, hy] = D.GRID.hq;
  assert.ok(Math.max(Math.abs(r.x - hx), Math.abs(r.y - hy)) >= 2);
});

// ---------- events ----------

test('the same mission code always produces the same event schedule', () => {
  const a = E.createMission({ seed: 'ARES-777', loadout: kit() });
  const b = E.createMission({ seed: 'ARES-777', loadout: kit({ lab: 0 }) });
  assert.deepEqual(a.schedule, b.schedule);
});

test('different mission codes produce different schedules', () => {
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(JSON.stringify(E.createMission({ seed: 'S' + i, loadout: kit() }).schedule));
  assert.ok(seen.size > 15);
});

test('every mission has at least one solar particle event and a conjunction', () => {
  for (let i = 0; i < 50; i++) {
    const st = E.createMission({ seed: 'SPE' + i, loadout: kit() });
    assert.ok(st.schedule.some(t => t.spe), 'seed ' + i + ' has no SPE');
    assert.equal(st.schedule[D.CONJUNCTION_TURN].conjunction, true);
  }
});

// ---------- life support ----------

test('crew breathe 0.84 kg O2 each per sol', () => {
  const st = calm({ oxygen: 0, greenhouse: 0 });
  const f = E.forecast(st, E.defaultPlan(st));
  assert.equal(f.delta.o2, -(0.84 * 4 * 25));
});

test('O2 plant adds 1.8 kg per sol when powered', () => {
  const st = calm({ oxygen: 1, greenhouse: 0 });
  const f = E.forecast(st, E.defaultPlan(st));
  assert.equal(Math.round(f.delta.o2 * 10) / 10, Math.round((1.8 * 25 - 0.84 * 4 * 25) * 10) / 10);
});

test('water recycler recovers 93 % of used water', () => {
  const st = calm({ greenhouse: 0, icedrill: 0 });
  const f = E.forecast(st, E.defaultPlan(st));
  assert.equal(Math.round(f.delta.water), -Math.round(7 * 4 * 25 * (1 - 0.93)));
});

test('switching the recycler off loses all used water', () => {
  const st = calm({ greenhouse: 0, icedrill: 0 });
  const plan = E.defaultPlan(st);
  plan.modulesOn.recycler = false;
  const f = E.forecast(st, plan);
  assert.equal(Math.round(f.delta.water), -(7 * 4 * 25));
});

test('reduced rations stretch food but cost health', () => {
  const st = calm({ greenhouse: 0 });
  const plan = E.defaultPlan(st);
  plan.rations = 'reduced';
  const f = E.forecast(st, plan);
  assert.equal(f.delta.food, -(1.8 * 4 * 25 * 0.75));
  const full = E.forecast(st, E.defaultPlan(st));
  assert.ok(f.crew[0].healthDelta < full.crew[0].healthDelta);
});

// ---------- power ----------

test('solar arrays without battery cover deliver half their power', () => {
  const withBatt = calm({ solar: 4, battery: 2, reactor: 0 });
  const noBatt = calm({ solar: 4, battery: 0, reactor: 0 });
  const a = E.forecast(withBatt, E.defaultPlan(withBatt)).power.solarKw;
  const b = E.forecast(noBatt, E.defaultPlan(noBatt)).power.solarKw;
  assert.ok(a > 0);
  assert.equal(Math.round(b * 1000), Math.round(a * 500));
});

test('a power shortfall sheds the lab before life support', () => {
  const st = calm({ solar: 2, battery: 1, reactor: 0 });
  const f = E.forecast(st, E.defaultPlan(st));
  assert.ok(f.power.shed.lab >= 1, 'lab should be shed');
  assert.equal(f.power.shed.recycler || 0, 0, 'recycler should keep running');
});

test('if even the habitat cannot be powered the crew gets cold', () => {
  const st = calm({ solar: 1, battery: 0, reactor: 0 });
  const f = E.forecast(st, E.defaultPlan(st));
  assert.equal(f.power.habShort, true);
  assert.ok(f.crew.every(c => c.healthDelta < 0));
});

// ---------- radiation ----------

test('indoor crew absorb 25 sols x 0.64 mSv reduced by habitat shielding', () => {
  const st = calm({ waterwall: 0 });
  const f = E.forecast(st, allJobs(st, 'science'));
  for (const c of f.crew) assert.equal(Math.round(c.doseDelta * 100) / 100, Math.round(25 * 0.64 * (1 - D.HAB.shielding) * 100) / 100);
});

test('EVA crew absorb more radiation than indoor crew', () => {
  const st = calm();
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[2].id] = 'eva';
  const f = E.forecast(st, plan);
  assert.ok(f.crew[2].doseDelta > f.crew[0].doseDelta);
});

test('a water wall adds shielding and draining half of it removes half', () => {
  const st = calm({ waterwall: 1 });
  assert.equal(Math.round(E.shielding(st) * 1000), Math.round((D.HAB.shielding + D.ITEMS.waterwall.shielding) * 1000));
  const plan = E.defaultPlan(st);
  plan.drainWall = 1000;
  const { state: next } = E.resolveTurn(st, plan);
  assert.equal(Math.round(E.shielding(next) * 1000), Math.round((D.HAB.shielding + D.ITEMS.waterwall.shielding / 2) * 1000));
});

test('sheltering from a solar particle event keeps doses low', () => {
  const st = calm();
  st.events = [{ type: 'spe', options: ['shelter', 'work'] }];
  const shelter = E.defaultPlan(st); shelter.choices.spe = 'shelter';
  const work = E.defaultPlan(st); work.choices.spe = 'work';
  const a = E.forecast(st, shelter);
  const b = E.forecast(st, work);
  assert.ok(b.crew[0].doseDelta - a.crew[0].doseDelta > 20);
});

test('crew over the dose budget are grounded and cannot work outside', () => {
  const st = calm();
  st.crew[2].dose = 299;
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[2].id] = 'eva';
  const { state: next } = E.resolveTurn(st, plan);
  assert.equal(next.status, 'active');
  assert.equal(next.crew[2].grounded, true);
  const again = E.defaultPlan(next);
  again.jobs[next.crew[2].id] = 'eva';
  const f = E.forecast(next, again);
  assert.equal(f.crew[2].job, 'science');
});

// ---------- building ----------

test('building a shield layer costs materials and raises shielding when finished', () => {
  const st = calm();
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[0].id] = 'construction';
  plan.builds = [{ type: 'shield' }];
  const f = E.forecast(st, plan);
  assert.equal(f.delta.materials, -D.BUILDS.shield.materials + f.regolith);
  const { state: next } = E.resolveTurn(st, plan);
  assert.equal(next.modules.shield.count, 1);
  assert.ok(E.shielding(next) > E.shielding(st));
});

test('a new structure must touch the base', () => {
  const st = calm();
  const far = E.buildSpots(st, 'solar').some(([x, y]) => x === 0 && y === 0 && !E.touchesBase(st, 0, 0));
  assert.equal(far, false);
  for (const [x, y] of E.buildSpots(st, 'solar')) assert.ok(E.touchesBase(st, x, y));
});

test('water extractors can only be built on ice', () => {
  const st = calm();
  st.resources.materials = 2000;
  const ice = new Set(st.terrain.ice.map(([x, y]) => x + ',' + y));
  for (const [x, y] of E.buildSpots(st, 'icedrill')) assert.ok(ice.has(x + ',' + y));
  for (const [x, y] of E.buildSpots(st, 'solar')) assert.ok(!ice.has(x + ',' + y));
});

test('big projects take several turns of construction work', () => {
  const st = calm();
  st.resources.materials = 1000;
  const [x, y] = E.buildSpots(st, 'habitat')[0];
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[1].id] = 'construction';
  plan.builds = [{ type: 'habitat', x, y }];
  const { state: t1 } = E.resolveTurn(st, plan);
  assert.equal(t1.modules.habitat.count, 0);
  assert.equal(t1.projects.length, 1);
  const keep = s => { const p = allJobs(s, 'science'); p.jobs[s.crew[1].id] = 'construction'; return p; };
  const t3 = advance(t1, keep, 2);
  assert.equal(t3.modules.habitat.count, 1);
  assert.ok(t3.layout.some(t => t.type === 'habitat' && t.x === x && t.y === y));
});

test('a build without enough materials is refused', () => {
  const st = calm({ materials: 0 });
  const plan = allJobs(st, 'construction');
  plan.builds = [{ type: 'shield' }];
  const f = E.forecast(st, plan);
  assert.equal(f.started.length, 0);
});

test('construction work with nothing to build turns regolith into materials', () => {
  const st = calm();
  const { state: next } = E.resolveTurn(st, allJobs(st, 'construction'));
  assert.ok(next.resources.materials > st.resources.materials);
});

// Relay beacon kits (spec §3.8, M4d): built through construction, they wait at the base in the expedition.
const KIT_ITEM = { kind: 'kit', res: 'kit', amount: 1 };

test('a relay beacon kit is a build of 50 kg and 1.5 work points; finished, it waits at the base and the report lists it', () => {
  assert.deepEqual(D.BUILDS.kit, { materials: 50, work: 1.5 });
  const st = calm();
  const plan = allJobs(st, 'science');
  plan.jobs.lena = 'construction'; // the engineer's 1.5 points finish it in the round
  plan.builds = [{ type: 'kit' }];
  assert.deepEqual(E.canBuild(st, 'kit', []), { ok: true }, 'it needs no spot on the build grid');
  const f = E.forecast(st, plan);
  assert.equal(f.delta.materials, -D.BUILDS.kit.materials + f.regolith);
  const { state: next, report } = E.resolveTurn(st, plan);
  assert.deepEqual([report.started, report.completed], [['kit'], ['kit']], 'started and completed, as any build');
  assert.equal(next.expedition.kits, 1);
  assert.deepEqual(next.projects, []);
  assert.deepEqual(next.layout, st.layout, 'nothing stands on the build grid');
  assert.equal(next.totals.built, 1, 'a construction project like any other');
});

test('kits stop at the 6 beacons a mission places: those placed, at the base, in a backpack, being built and queued all count', () => {
  const st = calm();
  st.resources.materials = 2000;
  Object.assign(st.expedition, { beacons: [{ x: 20, y: 0, by: 'lena', round: 0 }], kits: 2, carried: { minh: [KIT_ITEM], diego: 'junk' } });
  st.projects.push({ type: 'kit', x: null, y: null, progress: 0, work: 1.5 });
  assert.deepEqual(E.canBuild(st, 'kit', []), { ok: true }, '1 placed, 2 at the base, 1 carried, 1 being built: room for one more');
  assert.deepEqual(E.canBuild(st, 'kit', [{ type: 'kit' }]), { ok: false, reason: 'max' }, 'and one queued fills it');
  const plan = allJobs(st, 'construction');
  plan.builds = [{ type: 'kit' }, { type: 'kit' }];
  assert.deepEqual(E.forecast(st, plan).started, ['kit'], 'only the first of two starts');
  const poor = calm({ materials: 0 });
  poor.resources.materials = 49;
  assert.deepEqual(E.canBuild(poor, 'kit', []), { ok: false, reason: 'materials' });
});

test("a build or a scrap named like a property every object has ('__proto__', 'toString') is unknown: nothing starts or is scrapped, and nothing reaches Object.prototype", () => {
  const st = calm(), plan = allJobs(st, 'maintenance'); // a co-op player's plan may name any type
  plan.jobs.lena = 'construction';
  const plain = E.resolveTurn(st, plan).state;
  for (const type of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
    assert.deepEqual(E.canBuild(st, type, []), { ok: false, reason: 'unknown' }, type);
    const { state, report } = E.resolveTurn(st, Object.assign({}, plan, { builds: [{ type }], scrap: [type] }));
    assert.deepEqual([report.started, report.scrapped], [[], []], type);
    assert.deepEqual(state.resources, plain.resources, type + ': no NaN materials and no free spare');
  }
  assert.equal(({}).count, undefined, 'Object.prototype is untouched');
});

// ---------- repairs ----------

test('repairs need a maintenance crew and use one spare kit each', () => {
  const st = calm();
  st.modules.recycler.broken = 1;
  const noMaint = E.forecast(st, allJobs(st, 'science'));
  assert.equal(noMaint.repairs.length, 0);
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[1].id] = 'maintenance';
  const f = E.forecast(st, plan);
  assert.equal(f.repairs.length, 1);
  assert.equal(f.delta.spares, -1);
});

test('with no spare kits the engineer can jury-rig one repair from materials', () => {
  const st = calm({ spares: 0, materials: 1 });
  st.modules.recycler.broken = 1;
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[0].id] = 'maintenance';
  const f = E.forecast(st, plan);
  assert.deepEqual(f.repairs, ['recycler']);
  assert.ok(f.delta.materials <= -D.REPAIR_MATERIALS);
});

test('scrapping a module for parts lets the crew repair something more critical', () => {
  const st = calm({ spares: 0, lab: 1, materials: 0 });
  st.modules.recycler.broken = 1;
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[1].id] = 'maintenance';
  plan.scrap = ['lab'];
  const { state: next, report } = E.resolveTurn(st, plan);
  assert.deepEqual(report.repairs, ['recycler']);
  assert.deepEqual(report.scrapped, ['lab']);
  assert.equal(next.modules.lab.count, 0);
  assert.equal(next.modules.recycler.broken, 0);
});

test('scrapping needs a maintenance crew', () => {
  const st = calm({ spares: 0, lab: 1 });
  const plan = allJobs(st, 'science');
  plan.scrap = ['lab'];
  const f = E.forecast(st, plan);
  assert.deepEqual(f.scrapped, []);
});

// ---------- greenhouses ----------

test('a greenhouse needs one full crop cycle before the first harvest', () => {
  const st = calm({ greenhouse: 1 });
  const plan = E.defaultPlan(st);
  const first = E.forecast(st, plan);
  assert.equal(first.production.food, 0);
  const { state: next } = E.resolveTurn(st, plan);
  const second = E.forecast(next, E.defaultPlan(next));
  assert.ok(second.production.food > 0);
});

test('switching a greenhouse off kills the crop', () => {
  const st = calm({ greenhouse: 1 });
  const { state: grown } = E.resolveTurn(st, E.defaultPlan(st));
  const plan = E.defaultPlan(grown);
  plan.modulesOn.greenhouse = false;
  const { state: dead } = E.resolveTurn(grown, plan);
  const f = E.forecast(dead, E.defaultPlan(dead));
  assert.equal(f.production.food, 0);
});

// ---------- crew: down, revive, death ----------

test('a crew member at 0 HP goes down instead of dying', () => {
  const st = calm();
  st.crew[1].health = 5;
  st.events = [{ type: 'spe', options: ['shelter', 'work'] }];
  const plan = allJobs(st, 'science');
  plan.choices.spe = 'work';
  plan.jobs[st.crew[3].id] = 'science';
  const { state: next } = E.resolveTurn(st, plan);
  assert.equal(next.crew[1].status, 'down');
  assert.equal(next.status, 'active');
});

test('a medic on medical care revives a downed crew member', () => {
  const st = calm();
  st.crew[1].status = 'down';
  st.crew[1].health = 0;
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[3].id] = 'medical';
  const { state: next, report } = E.resolveTurn(st, plan);
  assert.equal(next.crew[1].status, 'active');
  assert.equal(next.crew[1].revives, 1);
  assert.deepEqual(report.revived, [st.crew[1].id]);
});

test('a downed crew member dies after 5 turns without a revive', () => {
  let st = calm();
  st.crew[1].status = 'down';
  st.crew[1].health = 0;
  st = advance(st, s => allJobs(s, 'science'), D.REVIVE.window);
  assert.equal(st.crew[1].status, 'dead');
});

test('going down a second time is permanent', () => {
  const st = calm();
  st.crew[1].revives = 1;
  st.crew[1].health = 5;
  st.events = [{ type: 'spe', options: ['shelter', 'work'] }];
  const plan = allJobs(st, 'science');
  plan.choices.spe = 'work';
  const { state: next } = E.resolveTurn(st, plan);
  assert.equal(next.crew[1].status, 'dead');
});

test('the dead no longer breathe or eat', () => {
  const st = calm({ oxygen: 0, greenhouse: 0 });
  st.crew[1].status = 'dead';
  const f = E.forecast(st, E.defaultPlan(st));
  assert.equal(Math.round(f.delta.o2), -Math.round(0.84 * 3 * 25));
});

test('running out of oxygen hurts the whole crew', () => {
  const st = calm({ o2: 0, oxygen: 0, greenhouse: 0 });
  const f = E.forecast(st, E.defaultPlan(st));
  assert.ok(f.crew.every(c => c.healthDelta <= -D.HEALTH.hypoxia + D.HEALTH.medic + D.HEALTH.care + D.HEALTH.rest));
  const { state: next } = E.resolveTurn(st, E.defaultPlan(st));
  assert.equal(next.resources.o2, 0);
});

test('running out of water first drains the water wall', () => {
  const st = calm({ water: 0, waterwall: 1, recycler: 0, greenhouse: 0 });
  const { state: t1 } = E.resolveTurn(st, E.defaultPlan(st));
  assert.ok(t1.wallWater < st.wallWater);
  assert.equal(t1.crew.every(c => c.health === 100), true);
});

test('the mission is lost when nobody is left standing', () => {
  const st = calm({ o2: 0, oxygen: 0, greenhouse: 0 });
  for (const c of st.crew) { c.health = 5; c.revives = 1; }
  const { state: next } = E.resolveTurn(st, E.defaultPlan(st));
  assert.equal(next.status, 'lost');
  assert.equal(next.endCause.type, 'crew');
});

// ---------- emergencies & Earth support ----------

test('salvaging oxygen in an emergency recovers more than hiding', () => {
  const st = calm();
  st.events = [{ type: 'o2_rupture', options: ['hide', 'salvage'] }];
  const hide = E.defaultPlan(st); hide.choices.o2_rupture = 'hide';
  const salvage = E.defaultPlan(st); salvage.choices.o2_rupture = 'salvage';
  const a = E.forecast(st, hide);
  const b = E.forecast(st, salvage);
  assert.ok(b.delta.o2 > a.delta.o2);
  assert.ok(Math.max(...b.crew.map(c => c.doseDelta)) > Math.max(...a.crew.map(c => c.doseDelta)));
});

test('an Earth supply drop lands two turns after it is requested', () => {
  const st = calm();
  const plan = E.defaultPlan(st);
  plan.request = 'materials';
  const { state: t1 } = E.resolveTurn(st, plan);
  assert.equal(t1.depot.drops, D.DEPOT.drops - 1);
  const t2 = advance(t1, E.defaultPlan, 1);
  const before = t2.resources.materials;
  assert.ok(t2.events.some(e => e.type === 'supply_arrived' && e.kind === 'materials') === false);
  const t3 = advance(t2, E.defaultPlan, 1);
  assert.ok(t3.events.some(e => e.type === 'supply_arrived' && e.kind === 'materials'));
  assert.ok(t3.resources.materials >= before + D.DEPOT.amounts.materials - 1);
});

test('no supply drops can be requested during solar conjunction', () => {
  let st = calm();
  st = advance(st, E.defaultPlan, D.CONJUNCTION_TURN);
  assert.equal(E.canRequest(st), false);
  const plan = E.defaultPlan(st);
  plan.request = 'food';
  const { state: next } = E.resolveTurn(st, plan);
  assert.equal(next.depot.drops, D.DEPOT.drops);
});

test('engineering advice points at the most urgent problem', () => {
  const st = calm({ solar: 1, battery: 0, reactor: 0 });
  const advice = E.advise(st, E.defaultPlan(st));
  assert.ok(advice.length >= 1);
  assert.equal(advice[0].code, 'hab_cold');
});

// ---------- whole missions ----------

test('the next round keeps standing orders and jobs but clears one-off actions', () => {
  const st = calm();
  const plan = E.defaultPlan(st);
  plan.jobs[st.crew[0].id] = 'construction';
  plan.rations = 'reduced';
  plan.modulesOn.lab = false;
  plan.builds = [{ type: 'shield' }];
  plan.request = 'food';
  plan.scrap = ['lab'];
  const { state: next } = E.resolveTurn(st, plan);
  const p2 = E.nextPlan(next, plan);
  assert.equal(p2.jobs[st.crew[0].id], 'construction');
  assert.equal(p2.rations, 'reduced');
  assert.equal(p2.modulesOn.lab, false);
  assert.deepEqual(p2.builds, []);
  assert.deepEqual(p2.scrap, []);
  assert.equal(p2.request, null);
});

test('forecast never changes the mission state', () => {
  const st = calm();
  const before = JSON.stringify(st);
  E.forecast(st, E.defaultPlan(st));
  assert.equal(JSON.stringify(st), before);
});

test('forecast matches the resolved turn for stocks', () => {
  const st = calm();
  const plan = E.defaultPlan(st);
  const f = E.forecast(st, plan);
  const { state: next } = E.resolveTurn(st, plan);
  assert.equal(Math.round(next.resources.o2 - st.resources.o2), Math.round(f.delta.o2));
  assert.equal(Math.round(next.resources.food - st.resources.food), Math.round(f.delta.food));
  assert.equal(next.sol, 25);
  assert.equal(next.turn, 1);
});

test('a well-run training mission reaches sol 500, scores and earns achievements', () => {
  let st = calm();
  let guard = 0;
  while (st.status === 'active' && guard++ < 30) {
    const plan = E.defaultPlan(st);
    plan.jobs[st.crew[0].id] = st.turn < 4 ? 'construction' : 'maintenance';
    if (st.turn < 4 && st.resources.materials >= D.BUILDS.shield.materials) plan.builds = [{ type: 'shield' }];
    plan.jobs[st.crew[1].id] = 'farming';
    plan.jobs[st.crew[2].id] = 'eva';
    plan.jobs[st.crew[3].id] = 'science';
    st = E.resolveTurn(st, plan).state;
  }
  assert.equal(st.status, 'success', JSON.stringify(st.endCause));
  assert.equal(st.sol, 500);
  const sc = E.scoreMission(st);
  assert.ok(sc.total > 0);
  assert.ok(['S', 'A', 'B', 'C', 'D'].includes(sc.grade));
  assert.equal(st.history.length, 21);
  const got = E.achievements(st);
  assert.ok(got.includes('sol500'));
  assert.ok(got.includes('first_sol'));
  assert.ok(got.includes('self_reliant'));
});

test('a lost mission keeps only half of its science and no completion bonus', () => {
  const st = calm({ o2: 0, oxygen: 0, greenhouse: 0 });
  for (const c of st.crew) { c.health = 5; c.revives = 1; }
  st.science = 400;
  const { state: done } = E.resolveTurn(st, E.defaultPlan(st));
  const sc = E.scoreMission(done);
  assert.equal(sc.parts.science, Math.round(done.science / 2));
  assert.equal(sc.parts.completion, 0);
  assert.equal(sc.grade, 'D');
});

test('going over the dose budget costs far more score than staying under it', () => {
  const st = calm();
  st.status = 'success';
  const safe = E.scoreMission(st);
  st.crew[2].dose = 330;
  st.crew[2].grounded = true;
  const over = E.scoreMission(st);
  assert.ok(safe.total - over.total >= 150, `penalty only ${safe.total - over.total}`);
});

test('resolving a finished mission is refused', () => {
  const st = calm({ o2: 0, oxygen: 0, greenhouse: 0 });
  for (const c of st.crew) { c.health = 5; c.revives = 1; }
  const { state: done } = E.resolveTurn(st, E.defaultPlan(st));
  assert.throws(() => E.resolveTurn(done, E.defaultPlan(done)));
});

test("a new mission has an empty exploring state and, in solo play, the player's astronaut", () => {
  const s = E.createMission({ seed: 'PILOT-0', loadout: kit(), events: false, pilot: 'minh' });
  assert.equal(s.pilot, 'minh');
  assert.equal(s.expedition.v, 2);
  assert.deepEqual(s.expedition.revealed, {});
  assert.deepEqual(s.expedition.regions, []);
  assert.deepEqual(Object.keys(s.expedition).sort(),
    ['banked', 'beacons', 'benched', 'carried', 'clock', 'collapsed', 'drops', 'flare', 'forecastUntil', 'goals', 'incidents', 'kits', 'landmarks',
      'refills', 'regions', 'revealed', 'rover', 'roverDriven', 'sites', 'stats', 'structures', 'suits', 'v', 'where']);
  assert.equal(s.expedition.flare, null, 'no solar flare yet');
  assert.equal(s.expedition.forecastUntil, -1, 'no weather station forecast yet');
  assert.equal(s.expedition.clock, 0, "the round's clock starts at 0");
  assert.deepEqual(s.expedition.where, {});
  assert.equal(calm().pilot, null, 'no pilot unless one is chosen (co-op seats choose their own)');
  assert.throws(() => E.createMission({ seed: 'PILOT-0', loadout: kit(), events: false, pilot: 'kai' }), /pilot/, 'kai is not in a crew of 4');
  assert.throws(() => E.createMission({ seed: 'PILOT-0', loadout: kit(), events: false, pilot: 'nobody' }), /pilot/);
});

test('when your astronaut dies you take over the first active crewmate, and the report says so once', () => {
  const s = E.createMission({ seed: 'PILOT-1', loadout: kit(), events: false, pilot: 'lena' });
  s.crew[0].status = 'down';
  s.crew[0].downTurns = D.REVIVE.window - 1;
  const { state, report } = E.resolveTurn(s, allJobs(s, 'science'));
  assert.equal(state.crew[0].status, 'dead');
  assert.deepEqual(report.pilot, { from: 'lena', to: 'minh' });
  assert.equal(state.pilot, 'minh');
  const next = E.resolveTurn(state, allJobs(state, 'science'));
  assert.equal(next.report.pilot, null, 'reported only once');
  assert.equal(next.state.pilot, 'minh');
});

test('with nobody active the mission is lost: no takeover, and the pilot stays the astronaut you walked as', () => {
  const s = E.createMission({ seed: 'PILOT-2', loadout: kit(), events: false, pilot: 'lena' });
  s.crew[0].status = 'down';
  s.crew[0].downTurns = D.REVIVE.window - 1;
  for (const c of s.crew.slice(1)) { c.status = 'down'; c.downTurns = 0; }
  const { state, report } = E.resolveTurn(s, allJobs(s, 'science'));
  assert.equal(state.status, 'lost');
  assert.equal(state.crew[0].status, 'dead');
  assert.deepEqual(report.pilot, { from: 'lena', to: null }, 'nobody to take over');
  assert.equal(state.pilot, 'lena', 'the history credits the astronaut that was played');
});

test('saves from before v3 get the exploring state and a pilot when they load', () => {
  const old = E.createMission({ seed: 'OLD-1', loadout: kit(), events: false });
  delete old.expedition;
  delete old.pilot;
  const copy = () => JSON.parse(JSON.stringify(old));
  const up = E.upgradeMission(copy(), { controlId: 'diego' });
  assert.equal(up.pilot, 'diego', 'the astronaut they were walking as');
  assert.deepEqual(up.expedition, E.newExpedition());
  const dead = copy();
  dead.crew[2].status = 'dead';
  assert.equal(E.upgradeMission(dead, { controlId: 'diego' }).pilot, 'lena', 'a dead astronaut is not picked');
  assert.equal(E.upgradeMission(copy(), {}).pilot, 'lena', 'no saved choice: the first active crew member');
  const coop = copy();
  coop.coop = true;
  assert.equal(E.upgradeMission(coop, { controlId: 'diego' }).pilot, null, 'co-op seats choose their own');
  const partial = copy();
  partial.expedition = { v: 2, regions: ['dunes'] };
  partial.pilot = 'amara';
  const kept = E.upgradeMission(partial, { controlId: 'diego' });
  assert.deepEqual(kept.expedition.regions, ['dunes'], 'what is there is kept');
  assert.deepEqual(kept.expedition.revealed, {}, 'what is missing is filled in');
  assert.equal(kept.pilot, 'amara');
  assert.equal(E.upgradeMission(null), null);
  assert.equal(E.resolveTurn(up, E.defaultPlan(up)).state.status, 'active', 'an upgraded save plays on');
});

// ---------- exploring: the bank and the advance (M4a) ----------

const ICE = { kind: 'ice', res: 'water', amount: 40, id: '3,1:0', region: 4 };
const METAL = { kind: 'metal', res: 'materials', amount: 40, id: '2,2:1', region: 0 };
const SURVEY = { kind: 'science', res: 'science', amount: 35, id: '2,2:2', region: 0, sub: 'delta' };

test('delivered finds count when the round advances, and the report lists them per crew member, find and region', () => {
  const plain = calm();
  const s = calm();
  E.bankItem(s.expedition.banked, 'minh', ICE);
  E.bankItem(s.expedition.banked, 'minh', ICE);
  E.bankItem(s.expedition.banked, 'minh', METAL);
  E.bankItem(s.expedition.banked, 'diego', SURVEY);
  E.bankItem(s.expedition.banked, 'lena', { kind: 'pod', res: 'food', amount: 60, id: '1,1:3', region: 1 });
  E.bankItem(s.expedition.banked, 'lena', { kind: 'pod', res: 'spares', amount: 1, id: '1,1:4', region: 1 });
  E.bankItem(s.expedition.banked, 'kai', { kind: 'canister', res: 'o2', amount: 30, id: '1,1:5', region: 1 });
  const a = E.resolveTurn(plain, E.defaultPlan(plain));
  const b = E.resolveTurn(s, E.defaultPlan(s));
  assert.equal(Math.round(b.state.resources.water - a.state.resources.water), 80);
  assert.equal(Math.round(b.state.resources.materials - a.state.resources.materials), 40);
  assert.equal(Math.round(b.state.resources.food - a.state.resources.food), 60);
  assert.equal(Math.round(b.state.resources.spares - a.state.resources.spares), 1);
  assert.equal(Math.round(b.state.resources.o2 - a.state.resources.o2), 30);
  assert.equal(Math.round(b.state.science - a.state.science), 35);
  assert.deepEqual(b.report.expedition.got, { water: 80, materials: 40, spares: 1, food: 60, o2: 30, science: 35, morale: 0 });
  assert.deepEqual(b.report.expedition.lines, [
    { crewId: 'minh', kind: 'ice', res: 'water', region: 4, amount: 80, loads: 2, late: false },
    { crewId: 'minh', kind: 'metal', res: 'materials', region: 0, amount: 40, loads: 1, late: false },
    { crewId: 'diego', kind: 'science', res: 'science', region: 0, amount: 35, loads: 1, late: false },
    { crewId: 'lena', kind: 'pod', res: 'food', region: 1, amount: 60, loads: 1, late: false },
    { crewId: 'lena', kind: 'pod', res: 'spares', region: 1, amount: 1, loads: 1, late: false },
    { crewId: 'kai', kind: 'canister', res: 'o2', region: 1, amount: 30, loads: 1, late: false },
  ]);
  assert.deepEqual(b.state.expedition.banked, { water: 0, materials: 0, spares: 0, food: 0, o2: 0, science: 0, morale: 0, lines: [] }, 'spent');
  assert.equal(E.resolveTurn(b.state, E.defaultPlan(b.state)).report.expedition.lines.length, 0, 'counted once');
});

test('the forecast includes the bank, so a delivery shows in the HUD before the round advances', () => {
  const s = calm();
  const before = E.forecast(s, E.defaultPlan(s)).delta.water;
  E.bankItem(s.expedition.banked, 'lena', ICE);
  assert.equal(Math.round(E.forecast(s, E.defaultPlan(s)).delta.water - before), 40);

  // Runway and food_low warning with delivery
  const s2 = calm();
  s2.resources.food = 250;
  const g = E.forecast(s2, E.defaultPlan(s2));  // without the bank delivery
  E.bankItem(s2.expedition.banked, 'lena', { kind: 'pod', res: 'food', amount: 180, id: '1,1:0', region: 1 });
  const f = E.forecast(s2, E.defaultPlan(s2));  // with the bank delivery
  assert.ok(Number.isFinite(f.runway.food));
  assert.ok(f.runway.food < 2 * D.TURN_SOLS);
  const expected = f.after.food / (-g.delta.food / D.TURN_SOLS);
  assert.ok(Math.abs(f.runway.food - expected) / expected < 1e-9);
  assert.ok(f.warnings.some(w => w.code === 'food_low'), 'food_low still warns with delivery');

  // Science with delivery
  const s3 = calm();
  const g3 = E.forecast(s3, E.defaultPlan(s3));  // without delivery
  E.bankItem(s3.expedition.banked, 'diego', { kind: 'science', res: 'science', amount: 60, id: '2,2:0', region: 0 });
  const f3 = E.forecast(s3, E.defaultPlan(s3));  // with delivery
  assert.equal(f3.science, g3.science + 60);
  assert.equal(f3.after.science, s3.science + f3.science);
});

test('a load still in a backpack is banked at the start of the next round and marked late', () => {
  const s = calm();
  s.expedition.carried = { lena: [ICE, METAL] };
  E.bankItem(s.expedition.banked, 'lena', ICE);  // on-time ice item, same crew, kind, region
  const r1 = E.resolveTurn(s, E.defaultPlan(s));
  assert.deepEqual(r1.state.expedition.carried, {});
  assert.equal(r1.report.expedition.lines.length, 1, 'only the on-time delivery is reported');
  assert.equal(r1.state.expedition.banked.water, 40);
  assert.equal(r1.state.expedition.banked.materials, 40);
  assert.ok(r1.state.expedition.banked.lines.every(l => l.late && l.crewId === 'lena'));
  // The on-time ice was delivered; check that late ice is banked separately
  const lateWaterLine = r1.state.expedition.banked.lines.find(l => l.kind === 'ice' && l.late === true);
  assert.ok(lateWaterLine, 'backpack ice is marked late');
  assert.equal(lateWaterLine.amount, 40);
  // Bank another on-time ice in the second turn to verify separate lines with different late flags
  E.bankItem(r1.state.expedition.banked, 'lena', ICE);  // on-time for next turn
  const r2 = E.resolveTurn(r1.state, E.defaultPlan(r1.state));
  // Report should have both the late ice (from bank at start of r2) and any newly-banked on-time
  const r2IceLines = r2.report.expedition.lines.filter(l => l.kind === 'ice');
  assert.equal(r2IceLines.length, 2, 'two separate lines: one late from before, one on-time delivered now');
  assert.ok(r2IceLines.some(l => l.late === true && l.amount === 40), 'late ice line exists');
  assert.ok(r2IceLines.some(l => l.late === false && l.amount === 40), 'on-time ice line exists');
});

test('a collapse outside costs that astronaut 20 health and the crew 3 morale at the advance, once', () => {
  const plain = calm(), s = calm();
  for (const m of [plain, s]) { m.crew[1].health = 70; m.morale = 60; }
  s.expedition.incidents = [{ crewId: 'minh', kind: 'collapse' }];
  const a = E.resolveTurn(plain, E.defaultPlan(plain)), b = E.resolveTurn(s, E.defaultPlan(s));
  assert.equal(Math.round(a.state.crew[1].health - b.state.crew[1].health), 20);
  assert.equal(Math.round(a.state.morale - b.state.morale), 3);
  assert.deepEqual(b.report.expedition.incidents, [{ crewId: 'minh', kind: 'collapse' }]);
  assert.deepEqual(b.state.expedition.incidents, [], 'spent');

  // Incident for inactive crew member costs nothing
  const s2 = calm();
  s2.crew[1].status = 'down';  // minh is inactive
  s2.expedition.incidents = [{ crewId: 'minh', kind: 'collapse' }];
  const plain2 = calm();
  plain2.crew[1].status = 'down';  // same setup without incident
  const a2 = E.resolveTurn(plain2, E.defaultPlan(plain2));
  const b2 = E.resolveTurn(s2, E.defaultPlan(s2));
  assert.equal(b2.state.crew[1].health, a2.state.crew[1].health, 'inactive crew health unchanged by incident');
  assert.equal(b2.state.morale, a2.state.morale, 'morale unchanged by inactive crew incident');
});

test('in co-op an astronaut still collapsed at the advance counts as a collapse and leaves the load where they fell', () => {
  const s = E.createMission({ seed: 'COOP-X', loadout: kit(), events: false, coop: true });
  s.crew[2].health = 50;
  const plain = JSON.parse(JSON.stringify(s));
  s.expedition.collapsed = { diego: { x: 900, y: -640 } };
  s.expedition.carried = { diego: [ICE, SURVEY], minh: [METAL] };
  const a = E.resolveTurn(plain, E.defaultPlan(plain)), b = E.resolveTurn(s, E.defaultPlan(s));
  assert.equal(Math.round(a.state.crew[2].health - b.state.crew[2].health), 20);
  assert.deepEqual(b.report.expedition.incidents, [{ crewId: 'diego', kind: 'collapse' }]);
  assert.deepEqual(b.state.expedition.drops, [{ id: '0:diego', x: 900, y: -640, items: [ICE, SURVEY] }]);
  assert.equal(b.state.expedition.banked.materials, 40, "minh's load is banked as usual");
  assert.equal(b.state.expedition.banked.water, 0, "diego's load is not");
  assert.deepEqual(b.state.expedition.collapsed, {});
});

test('a beacon kit still carried at the advance is back at the base, never banked; one a collapsed astronaut held waits where they fell', () => {
  const s = E.createMission({ seed: 'COOP-K', loadout: kit(), events: false, coop: true });
  Object.assign(s.expedition, { kits: 1, collapsed: { diego: { x: 900, y: -640 } }, carried: { minh: [KIT_ITEM, METAL, KIT_ITEM], diego: [KIT_ITEM] } });
  const { state, report } = E.resolveTurn(s, E.defaultPlan(s));
  const x = state.expedition;
  assert.equal(x.kits, 3, "minh's two are back at the base");
  assert.deepEqual(x.carried, {});
  assert.equal(x.banked.materials, 40, 'the metal is banked as usual');
  assert.deepEqual(x.banked.lines.map(l => l.kind), ['metal'], 'the kits are not');
  assert.deepEqual(x.drops, [{ id: '0:diego', x: 900, y: -640, items: [KIT_ITEM] }]);
  assert.deepEqual(report.expedition.lines, [], 'nothing was delivered this round');
});

test('everyone starts the next round at the base with a full suit; a driven rover comes home, a parked one stays', () => {
  const s = calm();
  Object.assign(s.expedition, { suits: { lena: 12 }, benched: ['minh'], rover: { driver: 'lena' }, roverDriven: 123, refills: { minh: 1 } });
  const next = E.resolveTurn(s, E.defaultPlan(s)).state.expedition;
  assert.deepEqual(next.suits, {});
  assert.deepEqual(next.benched, []);
  assert.equal(next.rover, null);
  assert.equal(next.roverDriven, 0, 'rover battery recharges');
  assert.deepEqual(next.refills, {}, 'refills reset');
  const p = calm();
  p.expedition.rover = { x: 3200, y: 640 };
  assert.deepEqual(E.resolveTurn(p, E.defaultPlan(p)).state.expedition.rover, { x: 3200, y: 640 });
});

test('a mission keeps at most maxDrops dropped loads, the oldest going first', () => {
  const s = E.createMission({ seed: 'DROPS', loadout: kit(), events: false, coop: true });
  s.expedition.drops = Array.from({ length: D.EXPEDITION.maxDrops }, (_, i) => ({ id: 'old' + i, x: 0, y: 0, items: [ICE] }));
  s.expedition.collapsed = { lena: { x: 64, y: 64 } };
  s.expedition.carried = { lena: [METAL] };
  const drops = E.resolveTurn(s, E.defaultPlan(s)).state.expedition.drops;
  assert.equal(drops.length, D.EXPEDITION.maxDrops);
  assert.equal(drops[0].id, 'old1');
  assert.equal(drops[drops.length - 1].id, '0:lena');
});

test('bankItem ignores unknown resources and treats a bad amount as zero', () => {
  const bank = E.newExpedition().banked;
  E.bankItem(bank, 'lena', { kind: 'ice', res: 'gold', amount: 9, region: 0 });
  E.bankItem(bank, 'lena', { kind: 'ice', res: 'morale', amount: 9, region: 0 });
  E.bankItem(bank, 'lena', { kind: 'ice', res: 'water', amount: -5, region: 0 });
  E.bankItem(bank, 'lena', null);
  assert.equal(bank.water, 0);
  assert.equal(bank.morale, 0);
  assert.equal(bank.lines.length, 1);
});

test('a saved exploring state with missing or malformed fields is repaired field by field', () => {
  const m = calm();
  m.pilot = 'nobody';
  m.expedition = {
    v: 2, revealed: [], sites: 'x', carried: null, regions: ['plains'], drops: {}, rover: 7, suits: [], kits: 'two',
    banked: { water: 'a', science: 12, lines: 5 },
  };
  const up = E.upgradeMission(m, {});
  const x = up.expedition;
  assert.deepEqual(x.revealed, {});
  assert.deepEqual(x.sites, {});
  assert.deepEqual(x.carried, {});
  assert.deepEqual(x.regions, ['plains'], 'good fields are kept');
  assert.deepEqual(x.drops, []);
  assert.equal(x.rover, null);
  assert.deepEqual(x.suits, {});
  assert.equal(x.kits, 0);
  assert.equal(x.banked.water, 0);
  assert.equal(x.banked.science, 12);
  assert.deepEqual(x.banked.lines, []);
  assert.deepEqual(x.collapsed, {}, 'fields a v3.2 save never had are added');
  assert.equal(up.pilot, 'lena', 'a pilot who is not in the crew is chosen again');
  assert.deepEqual(E.upgradeMission(calm(), {}).expedition, E.newExpedition(), 'a good one is untouched');
});

// ---------- dangers (M4b) ----------

test('a solar flare that caught someone outside costs them 15 mSv at the advance, once, and the report says so', () => {
  const plain = calm(), s = calm();
  s.expedition.incidents = [{ crewId: 'minh', kind: 'flare' }];
  const a = E.resolveTurn(plain, E.defaultPlan(plain)), b = E.resolveTurn(s, E.defaultPlan(s));
  assert.ok(Math.abs(b.state.crew[1].dose - a.state.crew[1].dose - D.DANGERS.flare.dose) < 1e-9, 'minh: +15 mSv');
  assert.equal(b.state.crew[1].health, a.state.crew[1].health, 'a flare costs no health');
  assert.equal(b.state.morale, a.state.morale, 'and no morale');
  assert.equal(b.state.crew[0].dose, a.state.crew[0].dose, 'only the one caught outside');
  assert.deepEqual(b.report.expedition.incidents, [{ crewId: 'minh', kind: 'flare' }]);
  assert.deepEqual(b.state.expedition.incidents, [], 'spent');
  const f = E.forecast(s, E.defaultPlan(s));
  assert.ok(Math.abs(f.crew[1].dose - E.forecast(plain, E.defaultPlan(plain)).crew[1].dose - D.DANGERS.flare.dose) < 1e-9, 'the forecast shows it before the advance');
});

test("the round's end puts out this round's flare, resets its clock and forgets where everyone stood", () => {
  const s = calm();
  Object.assign(s.expedition, { flare: { warn: 40, end: 100, over: false, hit: [] }, clock: 75.5, where: { minh: { x: 2000, y: 640 } } });
  const x = E.resolveTurn(s, E.defaultPlan(s)).state.expedition;
  assert.equal(x.flare, null);
  assert.equal(x.clock, 0);
  assert.deepEqual(x.where, {});
});

test('a 3.3.0 save gets the dangers fields, and a flare with times that are not numbers is dropped', () => {
  const old = calm();
  delete old.expedition.flare; delete old.expedition.clock; delete old.expedition.where;
  const x = E.upgradeMission(old, {}).expedition;
  assert.equal(x.flare, null);
  assert.equal(x.clock, 0);
  assert.deepEqual(x.where, {});
  const bad = calm();
  Object.assign(bad.expedition, { flare: { warn: 'soon', end: 90 }, clock: 'x', where: 3 });
  const y = E.upgradeMission(bad, {}).expedition;
  assert.equal(y.flare, null, 'a flare that would never end is dropped');
  assert.equal(y.clock, 0);
  assert.deepEqual(y.where, {});
  const ok = calm();
  ok.expedition.flare = { warn: 30, end: 90, over: true };
  assert.deepEqual(E.upgradeMission(ok, {}).expedition.flare, { warn: 30, end: 90, over: true, hit: [] }, 'a good flare is kept, with an empty hit list');
});

test('a saved incident that is not { crewId, kind } is dropped, so the advance still runs', () => {
  const s = calm();
  s.expedition.incidents = [null, 'flare', 7, { kind: 'flare' }, { crewId: 'minh' }, { crewId: 'minh', kind: 'flare' }];
  const up = E.upgradeMission(s, {});
  assert.deepEqual(up.expedition.incidents, [{ crewId: 'minh', kind: 'flare' }]);
  const r = E.resolveTurn(up, E.defaultPlan(up));
  assert.deepEqual(r.report.expedition.incidents, [{ crewId: 'minh', kind: 'flare' }]);
});

test("a saved relay beacon state is repaired: a beacon that isn't { x, y, by, round } on a tile is dropped, kits are a whole number, refills are lists of ids, a carried kit is a kit item", () => {
  const s = calm(), B = { x: 12, y: 0, by: 'minh', round: 0 }, ice = { kind: 'ice', res: 'water', amount: 40 };
  Object.assign(s.expedition, {
    beacons: [null, 'B0', B, { x: '20', y: 0, by: 'minh', round: 0 }, { x: 20.5, y: 0, by: 'minh', round: 0 }, { x: 20, y: 0, round: 0 }, { x: 20, y: 0, by: 'lena' }],
    kits: 1.5,
    refills: { minh: ['B0', 3, null, 'S0,-1'], lena: 1, diego: 'B0' },
    carried: { minh: [{ kind: 'kit' }, ice, { kind: 'kit', res: 'materials', amount: 500 }], lena: 'junk' },
  });
  const up = E.upgradeMission(s, {}), x = up.expedition;
  assert.deepEqual(x.beacons, [B]);
  assert.equal(x.kits, 1, 'a whole kit');
  assert.deepEqual(x.refills, { minh: ['B0', 'S0,-1'], lena: [], diego: [] });
  assert.deepEqual(x.carried.minh, [KIT_ITEM, ice, KIT_ITEM], 'a kit is never 500 kg of materials');
  const neg = calm();
  neg.expedition.kits = -2;
  assert.equal(E.upgradeMission(neg, {}).expedition.kits, 0, 'never fewer than none');
  const next = E.resolveTurn(up, E.defaultPlan(up)).state.expedition;
  assert.equal(next.kits, 3, "the advance still runs: minh's two kits are back at the base");
  assert.equal(next.banked.water, 40, 'and the ice is banked');
});

test('an O₂ canister carried home offsets an oxygen leak: the decision card is unchanged and the 30 kg count first', () => {
  const plain = calm(), s = calm();
  for (const m of [plain, s]) m.events = [{ type: 'o2_rupture', options: ['hide', 'salvage'], emergency: true }];
  E.bankItem(s.expedition.banked, 'minh', { kind: 'pod', res: 'o2', amount: D.EXPEDITION.canister.o2, canister: true, id: '1,1:0', region: 0 }, false);
  const plan = st => Object.assign(E.defaultPlan(st), { choices: { o2_rupture: 'hide' } });
  const a = E.resolveTurn(plain, plan(plain)), b = E.resolveTurn(s, plan(s));
  assert.equal(a.report.choices.o2_rupture, 'hide');
  assert.ok(Math.abs(b.state.resources.o2 - a.state.resources.o2 - D.EXPEDITION.canister.o2) < 1e-9, '+30 kg of O₂ on top of the leak');
  assert.equal(b.report.consumption.o2Event, a.report.consumption.o2Event, 'the leak itself is the same');
});
