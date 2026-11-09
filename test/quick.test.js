'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../src/engine.js');
const D = require('../src/data.js');

const hash = str => crypto.createHash('sha256').update(str).digest('hex');
// Computed from the code at aba7f78 (3.6.0), before the Quick schedule existed.
const PINNED = [
  ['A', '5d04b21618c8bdf47b2752ecd0df210c4588e9e265fad490edb016bd5b8a4db4'],
  ['BAL-0', '2d15013bb8b14d58fe4e338f3de8b730cdc2cd6f7074d69d1920e715816ef3c5'],
  ['PAINT-QA-1', 'e9fb5fad725567d0f5c6ce815e98571e076aa8bff91c013301093f676d7e71f0'],
];
const quick = (seed, extra) => E.createMission(Object.assign({ seed, quick: true, loadout: E.referenceKit('commander', 4, true), difficulty: 'commander', crewSize: 4 }, extra));

test('a quick mission has 8 rounds and a full one 20', () => {
  assert.equal(E.turnsOf(quick('A')), 8);
  assert.equal(E.turnsOf(E.createMission({ seed: 'A', loadout: E.referenceKit('commander', 4), difficulty: 'commander', crewSize: 4 })), 20);
});
test('on 200 seeds, rounds 1 and 2 are calm, round 3 has the flare and round 5 the oxygen rupture', () => {
  for (let i = 0; i < 200; i++) {
    const [a, b, c, , e] = quick('S' + i).schedule;
    for (const t of [a, b]) assert.deepEqual([t.weather, t.spe, t.devil, t.flavor], ['clear', false, false, null]);
    assert.deepEqual([c.weather, c.spe, c.devil, c.flavor], ['clear', true, false, null]);
    assert.deepEqual([e.weather, e.spe, e.devil, e.flavor], ['clear', false, false, 'o2_rupture']);
  }
});
test('a quick mission has no conjunction and no global storm', () => {
  for (let i = 0; i < 200; i++) for (const t of quick('S' + i).schedule) {
    assert.equal(t.conjunction, false);
    assert.notEqual(t.weather, 'global');
  }
});
test('events stay on in a quick mission even when events: false is passed', () => assert.equal(quick('A', { events: false }).schedule[2].spe, true));
test('a quick kit must hold the rover', () => {
  const kit = Object.assign(E.referenceKit('commander', 4, true), { rover: 0 });
  assert.ok(E.validateLoadout(kit, 'commander', 4, true).errors.includes('needs_rover'));
  assert.ok(E.validateLoadout(E.referenceKit('commander', 4, true), 'commander', 4, true).ok);
  assert.ok(!E.validateLoadout(E.referenceKit('commander', 4), 'commander', 4).errors.includes('needs_rover'));
});
test('a quick mission succeeds after round 8, on sol 200', () => {
  const s = quick('A');
  s.turn = 7; s.sol = 175;
  const r = E.resolveTurn(s, E.defaultPlan(s));
  assert.equal(r.state.status, 'success');
  assert.equal(r.state.sol, 200);
});
test('the last round banks backpacks at turn 7', () => {
  const water = carried => {
    const s = quick('A');
    s.turn = 7; s.sol = 175;
    s.expedition.carried = { minh: carried };
    const r = E.resolveTurn(s, E.defaultPlan(s));
    return { left: (r.state.expedition.carried.minh || []).length, got: r.report.expedition };
  };
  const item = { kind: 'ice', res: 'water', amount: 40, id: '3,1:0', region: 4 };
  assert.equal(water([item]).left, 0);
  assert.notDeepEqual(water([item]).got, water([]).got, 'the find reaches the report');
});
test('a quick mission earns no achievements', () => {
  const s = quick('A');
  s.turn = 7; s.sol = 175;
  const r = E.resolveTurn(s, E.defaultPlan(s));
  assert.equal(r.state.status, 'success');
  assert.deepEqual(E.achievements(r.state), []);
});
test('a quick mission reads its grades from D.QUICK.grades', () => {
  const s = quick('A');
  s.turn = 7; s.sol = 175;
  const st = E.resolveTurn(s, E.defaultPlan(s)).state;
  const total = E.scoreMission(st).total;
  const saved = D.QUICK.grades;
  try {
    D.QUICK.grades = [['S', total + 1], ['A', total]]; // distinct from D.SCORE.grades
    assert.equal(E.scoreMission(st).grade, 'A');
    D.QUICK.grades = [['S', total]];
    assert.equal(E.scoreMission(st).grade, 'S');
    st.quick = false;
    assert.notEqual(E.scoreMission(st).grade, 'S', 'a full mission ignores D.QUICK.grades');
  } finally { D.QUICK.grades = saved; }
});
test('advice never warns of a storm in a quick mission', () => {
  for (let i = 0; i < 20; i++) {
    const s = quick('S' + i);
    s.resources.o2 = 0;
    assert.ok(!E.advise(s, E.defaultPlan(s)).some(a => a.code === 'storm_risk'));
  }
});
test('schedulePatch changes round 1 before it begins', () => {
  const s = quick('A', { schedulePatch: { 0: { flavor: 'o2_rupture' } } });
  assert.ok(s.events.some(e => e.type === 'o2_rupture'));
});
test('a quick mission lands with landing_quick', () => {
  assert.equal(quick('A').events[0].type, 'landing_quick');
  assert.equal(E.createMission({ seed: 'A', loadout: E.referenceKit('commander', 4), difficulty: 'commander', crewSize: 4 }).events[0].type, 'landing');
});
test('the full schedule is the same as 3.6.0', () => {
  for (const [seed, sha] of PINNED) assert.equal(hash(JSON.stringify(E.createMission({ seed, loadout: E.referenceKit('commander', 4), difficulty: 'commander', crewSize: 4 }).schedule)), sha);
});

test('every reference quick kit fits its budget and holds the rover', () => {
  for (const level of ['cadet', 'commander', 'veteran']) for (const crew of [4, 5]) {
    const v = E.validateLoadout(E.referenceKit(level, crew, true), level, crew, true);
    assert.ok(v.ok, level + ' ' + crew + ': ' + v.errors.join(','));
  }
});
