'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');

// A small, legal loadout used across tests.
function kit(overrides) {
  return Object.assign({
    solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, icedrill: 0,
    greenhouse: 1, lab: 1, rover: 0, waterwall: 1, spares: 4,
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

test('loadout mass is the fixed habitat plus every packed item', () => {
  const s = E.summarizeLoadout(kit());
  const expected = D.HAB.mass + 4 * 0.8 + 2 * 0.6 + 3.0 + 1.2 + 1.0 + 1.5 + 1.2 + 2.0 + 4 * 0.25 + 6 * 0.5 + 3 * 0.5 + 3 * 0.5;
  assert.equal(Math.round(s.mass * 100) / 100, Math.round(expected * 100) / 100);
  assert.equal(s.over, false);
});

test('loadout over the mass budget is rejected', () => {
  const v = E.validateLoadout(kit({ reactor: 2, food: 12, o2: 8, water: 8 }));
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('over_budget'));
});

test('new mission converts pallets into starting stocks', () => {
  const st = calm();
  assert.equal(st.resources.food, 6 * D.ITEMS.food.kg);
  assert.equal(st.resources.o2, 3 * D.ITEMS.o2.kg);
  assert.equal(st.resources.water, 3 * D.ITEMS.water.kg);
  assert.equal(st.resources.spares, 4);
  assert.equal(st.wallWater, 1 * D.ITEMS.waterwall.kg);
  assert.equal(st.crew.length, 4);
  assert.equal(st.status, 'active');
});

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
  assert.equal(Math.round((E.shielding(next) - next.berm) * 1000), Math.round((D.HAB.shielding + D.ITEMS.waterwall.shielding / 2) * 1000));
});

test('construction crew build a regolith berm that raises shielding', () => {
  const st = calm();
  const { state: next } = E.resolveTurn(st, allJobs(st, 'construction'));
  assert.ok(next.berm > 0);
  assert.ok(E.shielding(next) > E.shielding(st));
});

test('repairs need a maintenance crew and use one spare kit each', () => {
  const st = calm();
  st.modules.recycler.broken = 1;
  const noMaint = E.forecast(st, allJobs(st, 'science'));
  assert.equal(noMaint.repairs.length, 0);
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[0].id] = 'maintenance';
  const f = E.forecast(st, plan);
  assert.equal(f.repairs.length, 1);
  assert.equal(f.delta.spares, -1);
});

test('scrapping a module for parts lets the crew repair something more critical', () => {
  const st = calm({ spares: 0, lab: 1 });
  st.modules.recycler.broken = 1;
  const plan = allJobs(st, 'science');
  plan.jobs[st.crew[0].id] = 'maintenance';
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

test('running out of O2 aborts the mission', () => {
  const st = calm({ o2: 0, oxygen: 0, greenhouse: 0 });
  const { state: next } = E.resolveTurn(st, E.defaultPlan(st));
  assert.equal(next.status, 'aborted');
  assert.equal(next.abortCause.type, 'o2');
});

test('running out of water first drains the water wall, then aborts', () => {
  const st = calm({ water: 0, waterwall: 1, recycler: 0, greenhouse: 0 });
  const { state: t1 } = E.resolveTurn(st, E.defaultPlan(st));
  assert.equal(t1.status, 'active');
  assert.ok(t1.wallWater < st.wallWater);
  let s = t1;
  for (let i = 0; i < 5 && s.status === 'active'; i++) s = E.resolveTurn(s, E.defaultPlan(s)).state;
  assert.equal(s.status, 'aborted');
  assert.equal(s.abortCause.type, 'water');
});

test('exceeding the 300 mSv budget aborts the mission', () => {
  const st = calm();
  st.crew[1].dose = 299;
  const { state: next } = E.resolveTurn(st, E.defaultPlan(st));
  assert.equal(next.status, 'aborted');
  assert.equal(next.abortCause.type, 'radiation');
  assert.equal(next.abortCause.crewId, st.crew[1].id);
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

test('sheltering from a solar particle event keeps doses low', () => {
  const st = calm();
  st.events = [{ type: 'spe', options: ['shelter', 'work'] }];
  const shelter = E.defaultPlan(st); shelter.choices.spe = 'shelter';
  const work = E.defaultPlan(st); work.choices.spe = 'work';
  const a = E.forecast(st, shelter);
  const b = E.forecast(st, work);
  assert.ok(b.crew[0].doseDelta - a.crew[0].doseDelta > 20);
});

test('a well-run training mission reaches sol 500 and scores', () => {
  let st = calm();
  let guard = 0;
  while (st.status === 'active' && guard++ < 30) {
    const plan = E.defaultPlan(st);
    plan.jobs[st.crew[0].id] = 'maintenance';
    plan.jobs[st.crew[1].id] = 'farming';
    plan.jobs[st.crew[2].id] = st.turn < 6 ? 'construction' : 'eva';
    plan.jobs[st.crew[3].id] = 'science';
    st = E.resolveTurn(st, plan).state;
  }
  assert.equal(st.status, 'success', JSON.stringify(st.abortCause));
  assert.equal(st.sol, 500);
  const sc = E.scoreMission(st);
  assert.ok(sc.total > 0);
  assert.ok(['S', 'A', 'B', 'C', 'D'].includes(sc.grade));
  assert.equal(st.history.length, 21);
});

test('an aborted mission keeps only half of its science and no completion bonus', () => {
  const st = calm({ o2: 0, oxygen: 0, greenhouse: 0 });
  st.science = 400;
  const { state: done } = E.resolveTurn(st, E.defaultPlan(st));
  const sc = E.scoreMission(done);
  assert.equal(sc.parts.science, Math.round(done.science / 2));
  assert.equal(sc.parts.completion, 0);
  assert.equal(sc.grade, 'D');
});

test('resolving a finished mission is refused', () => {
  const st = calm({ o2: 0, oxygen: 0, greenhouse: 0 });
  const { state: done } = E.resolveTurn(st, E.defaultPlan(st));
  assert.throws(() => E.resolveTurn(done, E.defaultPlan(done)));
});
