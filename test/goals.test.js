'use strict';
// Expedition goals (src/goals.js, spec §3.9, M4d): what each round asks of the crew outside, judged from the mission state
// against what it was when the goal was picked (ruling R3), and paid out at the advance (R4) in solo and co-op alike.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/data.js');
const E = require('../src/engine.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');
const G = require('../src/goals.js');
const { createRooms } = require('../lib/rooms.js');

const KIND_ORDER = Object.keys(D.GOALS.kinds);
const R = D.GOALS.reach;
// A mission in round `round` (1 = the first), with no goals picked yet.
function fresh(seed, round, opts) {
  const m = E.createMission(Object.assign({ seed: seed || 'GOAL-1', loadout: E.referenceKit('commander', 4), difficulty: 'commander', crewSize: 4, events: false }, opts));
  m.turn = (round || 1) - 1;
  return m;
}
const out = p => Math.sqrt(p.x * p.x + p.y * p.y);
const withGoal = (m, kind) => { m.expedition.goals = [Object.assign(G.make(m, kind), { id: 'G' + m.turn + ':0' })]; return m.expedition.goals[0]; };
// The science sites within reach of the HQ, read from the world here (the test's own reading): [{ id, d }].
function scienceNear(m) {
  const list = [], seed = W.seedOf(m.seed), lo = Math.floor(-R / W.CHUNK), hi = Math.floor(R / W.CHUNK);
  const add = (id, f) => { if (f.kind === 'science' && out(f) <= R) list.push({ id, d: out(f) }); };
  for (let cy = lo; cy <= hi; cy++) for (let cx = lo; cx <= hi; cx++) {
    for (const f of X.findsIn(m, cx, cy)) add(cx + ',' + cy + ':' + f.n, f);
    for (const k of X.chunkAt(m, cx, cy).formations) k.sites.forEach((f, n) => add(k.id + ':' + n, f));
  }
  for (const l of W.landmarksNear(seed, -R, -R, R, R)) l.sites.forEach((f, n) => add(l.id + ':' + n, f));
  return list;
}
const repairsNear = m => W.structuresNear(W.seedOf(m.seed), -R, -R, R, R).filter(s => ['wreck', 'array', 'weather', 'mast'].includes(s.kind) && out(s) <= R);
const landmarksNear = m => W.landmarksNear(W.seedOf(m.seed), -R, -R, R, R).filter(l => out(l) <= R);
function seedWith(has) {
  for (let i = 0; i < 200; i++) if (has(fresh('GOAL-' + i))) return 'GOAL-' + i;
  throw new Error('no such seed');
}

// ---------- picking ----------

test('one goal a round in rounds 1-4 and two from round 5, the same ones for the same mission code, round and state', () => {
  for (let round = 1; round <= D.TURNS; round++) {
    const goals = G.pick(fresh('GOAL-1', round));
    assert.equal(goals.length, round < 5 ? 1 : 2, 'round ' + round);
    assert.equal(new Set(goals.map(g => g.kind)).size, goals.length, 'two different kinds');
    goals.forEach((g, n) => assert.equal(g.id, 'G' + (round - 1) + ':' + n));
    assert.deepEqual(G.pick(fresh('GOAL-1', round)), goals, 'deterministic');
  }
  const kinds = new Set();
  for (let i = 0; i < 30; i++) for (let round = 1; round <= D.TURNS; round++) for (const g of G.pick(fresh('GOAL-' + i, round))) kinds.add(g.kind);
  assert.deepEqual([...kinds].sort(), KIND_ORDER.filter(k => k !== 'beacon').sort(), 'every kind comes up (a beacon needs a kit at the base)');
  const m = fresh();
  const first = G.pick(m);
  m.expedition.sites['0,3:0'] = 0;
  assert.equal(G.pick(m), first, 'picked once: a second call keeps the round\'s goals and their baselines');
  const over = fresh();
  over.status = 'success';
  assert.deepEqual(G.pick(over), [], 'a finished mission has no next round');
});

test('a goal is made with its target, its reward and the baseline it is judged against', () => {
  const m = fresh('GOAL-1', 3);
  m.expedition.regions.push('dunes');
  const tiles = Math.min(120, 30 + 5 * 3);
  const g = kind => G.make(m, kind);
  assert.deepEqual(g('survey'), { id: '', kind: 'survey', params: { tiles }, need: 1, base: 0, progress: 0, done: false, reward: { science: 20 + Math.round(20 * (tiles - 35) / 85) } });
  assert.deepEqual(g('haul'), { id: '', kind: 'haul', params: { loads: 4 }, need: 4, base: 0, progress: 0, done: false, reward: { water: 0, materials: 0 } });
  assert.deepEqual(g('region'), { id: '', kind: 'region', params: {}, need: 1, base: 1, progress: 0, done: false, reward: { morale: 2, science: 15 } });
  assert.deepEqual(g('landmark').reward, { science: 25 });
  assert.deepEqual(g('structure').reward, { materials: 40 });
  assert.deepEqual([g('beacon').params, g('beacon').reward], [{ tiles }, { kits: 1 }]);
  assert.deepEqual([g('chunks').params, g('chunks').need, g('chunks').reward], [{ count: 4 }, 4, { science: 15 }]);
  assert.equal(G.make(fresh('GOAL-1', 1), 'survey').reward.science, 20, 'the first round asks 35 tiles out for 20 science');
  assert.deepEqual([G.make(fresh('GOAL-1', 20), 'survey').params.tiles, G.make(fresh('GOAL-1', 20), 'survey').reward.science], [120, 40], 'the farthest: 120 tiles for 40');
});

test('only kinds that can be done this round are offered', () => {
  const m = fresh('GOAL-1');
  const x = m.expedition;
  assert.ok(['haul', 'chunks'].every(k => G.offered(m).includes(k)), 'there is always ice or metal to haul and new ground to see');
  assert.equal(G.offered(m).includes('beacon'), false, 'no beacon kit at the base');
  x.kits = 1;
  assert.ok(G.offered(m).includes('beacon'));
  x.beacons = Array.from({ length: 6 }, (_, i) => ({ x: 20 + 12 * i, y: 0, by: 'lena', round: 0 }));
  assert.equal(G.offered(m).includes('beacon'), false, 'six beacons is the most a mission places');

  assert.ok(G.offered(m).includes('region'));
  x.regions = W.REGIONS.slice();
  assert.equal(G.offered(m).includes('region'), false, 'every region within reach has been visited');

  assert.ok(G.offered(m).includes('survey'));
  for (const s of scienceNear(m)) if (s.d >= 35) x.sites[s.id] = 0;
  assert.equal(G.offered(m).includes('survey'), false, 'every science site 35 tiles out or more within reach is surveyed');
  const late = fresh('GOAL-1', 20);
  for (const s of scienceNear(late)) if (s.d < 120) late.expedition.sites[s.id] = 0;
  assert.ok(G.offered(late).includes('survey'), 'the ones nearer than round 20 asks for do not count');

  assert.ok(repairsNear(m).length && G.offered(m).includes('structure'));
  for (const s of repairsNear(m)) x.structures[s.id] = 'used';
  assert.equal(G.offered(m).includes('structure'), false, 'every structure within reach that can be repaired or salvaged is done');

  const seed = seedWith(k => landmarksNear(k).length > 0);
  const lm = fresh(seed);
  assert.ok(G.offered(lm).includes('landmark'));
  for (const l of landmarksNear(lm)) lm.expedition.landmarks[l.id] = { by: 'lena', round: 0 };
  assert.equal(G.offered(lm).includes('landmark'), false, 'every landmark within reach is discovered');
  assert.equal(G.offered(fresh(seedWith(k => !landmarksNear(k).length))).includes('landmark'), false, 'none within reach');
});

// ---------- progress ----------

test('a survey counts a science site surveyed far enough out since the pick, even after the save is reloaded', () => {
  const m = fresh('GOAL-1', 3);
  const sites = scienceNear(m), far = sites.filter(s => s.d >= 45), nearer = sites.find(s => s.d < 45);
  let ice = null;
  for (let cx = 1; !ice; cx++) { const f = X.findsIn(m, cx, 0).find(k => k.kind === 'ice' || k.kind === 'metal'); if (f) ice = cx + ',0:' + f.n; }
  m.expedition.sites[far[0].id] = 0; // surveyed before the goal was picked
  const g = withGoal(m, 'survey');
  assert.equal(g.params.tiles, 45);
  assert.ok(nearer && far.length >= 2);
  m.expedition.sites[ice] = 2; // a load from a find that is not a science site
  m.expedition.sites[nearer.id] = 0;
  assert.equal(G.update(m)[0].done, false, 'nothing far enough out since the pick');
  const again = JSON.parse(JSON.stringify(m)); // a reload: the baseline is the order the sites were first touched in
  again.expedition.sites[far[1].id] = 0;
  const [h] = G.update(again);
  assert.deepEqual([h.progress, h.done], [1, true]);
});

test('a haul counts the ice and metal brought home this round, and its bonus is a quarter of what its loads gave', () => {
  const m = fresh();
  const g = withGoal(m, 'haul');
  const ice = { kind: 'ice', res: 'water', amount: 40, id: '3,1:0', region: 4 }, metal = { kind: 'metal', res: 'materials', amount: 40, id: '2,2:1', region: 0 };
  E.bankItem(m.expedition.banked, 'lena', ice, true); // last round's backpack: not brought home this round
  E.bankItem(m.expedition.banked, 'lena', { kind: 'science', res: 'science', amount: 35, id: '2,2:2', region: 0 });
  for (let i = 0; i < 3; i++) E.bankItem(m.expedition.banked, 'minh', ice);
  assert.deepEqual([G.update(m)[0].progress, g.done], [3, false]);
  E.bankItem(m.expedition.banked, 'diego', { kind: 'wreck', res: 'materials', amount: 40, id: 'S2,1', region: 0 }); // a wreck's metal
  assert.deepEqual([g.progress, g.done, g.reward], [3, false, { water: 30, materials: 0 }], 'until the next update');
  G.update(m);
  assert.deepEqual([g.progress, g.done, g.reward], [4, true, { water: 30, materials: 10 }]);
  E.bankItem(m.expedition.banked, 'minh', ice);
  E.bankItem(m.expedition.banked, 'minh', metal);
  G.update(m);
  assert.deepEqual([g.progress, g.reward], [4, { water: Math.round(160 * 0.25 * 4 / 6), materials: Math.round(80 * 0.25 * 4 / 6) }], 'more loads than asked: the bonus covers four');
});

test("a region counts once someone enters a kind of region the crew hadn't been in when it was picked", () => {
  const m = fresh();
  m.expedition.regions.push('dunes');
  const g = withGoal(m, 'region');
  m.expedition.regions.push('plains');
  assert.equal(G.update(m)[0].done, false, "the base's own region does not count");
  m.expedition.regions.push('icy');
  assert.deepEqual([G.update(m)[0].progress, g.done], [1, true]);
});

test('a landmark, a repaired or salvaged structure, and a beacon far enough out each count once they happen', () => {
  const m = fresh('GOAL-1', 1);
  const lm = withGoal(m, 'landmark');
  m.expedition.landmarks['L1,0'] = { by: 'lena', round: 0 };
  assert.equal(G.update(m)[0].done, true);
  assert.equal(lm.done, true);

  const seed = W.seedOf(m.seed), all = [];
  for (let j = -4; j < 4; j++) for (let i = -4; i < 4; i++) { const s = W.structureAt(seed, i, j); if (s) all.push(s); }
  const cache = all.find(s => s.kind === 'cache'), pod = all.find(s => s.kind === 'pod'), wreck = all.find(s => ['wreck', 'array', 'weather', 'mast'].includes(s.kind));
  const st = withGoal(m, 'structure');
  m.expedition.structures[cache.id] = 'used';
  if (pod) m.expedition.structures[pod.id] = 'used';
  assert.equal(G.update(m)[0].done, false, 'a supply cache opened is not a repair or a salvage');
  m.expedition.structures[wreck.id] = wreck.kind === 'weather' || wreck.kind === 'mast' ? 'repaired' : 'used';
  assert.equal(G.update(m)[0].done, true);
  assert.equal(st.done, true);

  const b = withGoal(m, 'beacon');
  assert.equal(b.params.tiles, 35);
  m.expedition.beacons.push({ x: 20, y: 0, by: 'lena', round: 0 });
  assert.equal(G.update(m)[0].done, false, '20 tiles out is not 35');
  m.expedition.beacons.push({ x: 30, y: -20, by: 'minh', round: 0 });
  assert.equal(G.update(m)[0].done, true);
});

test('explored chunks count only new ones, spelled canonically', () => {
  const m = fresh();
  const v = 'A'.repeat(171) + '=';
  m.expedition.revealed['0,0'] = v;
  const g = withGoal(m, 'chunks');
  Object.assign(m.expedition.revealed, { '0,0': v, '1,0': v, '2,0': v, '-0,5': v, '05,5': v, '3,0': v });
  assert.deepEqual([G.update(m)[0].progress, g.done], [3, false], 'an old save may hold keys the rules no longer take: they never count');
  m.expedition.revealed['-4,-4'] = v;
  assert.deepEqual([G.update(m)[0].progress, g.done], [4, true]);
});

test("the base's own four chunks are not new ground, though its view shows them only once round 1 has begun", () => {
  assert.ok(D.EXPEDITION.baseZone + D.DANGERS.view.rover < W.CHUNK, 'from the base zone, even the rover sees only the chunks round the HQ');
  const m = fresh();
  const g = withGoal(m, 'chunks'), v = 'A'.repeat(171) + '=';
  Object.assign(m.expedition.revealed, { '0,0': v, '-1,0': v, '0,-1': v, '-1,-1': v });
  assert.deepEqual([G.update(m)[0].progress, g.done], [0, false]);
  Object.assign(m.expedition.revealed, { '1,0': v, '1,-1': v, '-2,0': v, '0,1': v });
  assert.deepEqual([G.update(m)[0].progress, g.done], [4, true]);
});

// ---------- the advance ----------

test('the advance brings progress up to date, pays the done goals once and picks the next round\'s', () => {
  const plain = fresh(), m = fresh();
  G.pick(plain);
  withGoal(m, 'landmark');
  m.expedition.landmarks['L1,0'] = { by: 'lena', round: 0 };
  assert.equal(m.expedition.goals[0].done, false, 'nobody has updated it yet');
  const a = G.advance(plain, E.defaultPlan(plain)), b = G.advance(m, E.defaultPlan(m));
  assert.deepEqual(b.report.expedition.goals, [{ id: 'G0:0', kind: 'landmark', params: {}, reward: { science: 25 } }]);
  assert.deepEqual(a.report.expedition.goals, [], 'a goal nobody worked on expires');
  assert.equal(Math.round(b.state.science - a.state.science), 25);
  assert.deepEqual(b.state.expedition.goalsDone, [{ id: 'G0:0', kind: 'landmark', round: 0, params: {} }]);
  assert.deepEqual(b.state.expedition.goals.map(g => [g.id, g.progress, g.done]), [['G1:0', 0, false]], "round 2's goal, picked from the new state");
  const c = G.advance(b.state, E.defaultPlan(b.state));
  assert.deepEqual(c.report.expedition.goals, [], 'paid once');
});

test('a solo advance and a co-op advance on the same state give the same goals and payouts', () => {
  const seed = 'GOAL-COOP';
  const Rm = createRooms();
  const { room, player: host } = Rm.create('Host');
  const say = (type, extra) => Rm.act(Object.assign({ code: room.code, player: host.id, token: host.token, type }, extra));
  say('settings', { seed });
  say('claim', { crewId: 'lena' });
  say('launch');
  const solo = E.createMission({ seed, loadout: E.referenceKit(room.settings.difficulty, room.settings.crewSize), difficulty: room.settings.difficulty, crewSize: room.settings.crewSize });
  G.pick(solo);
  assert.deepEqual(room.mission.expedition.goals, solo.expedition.goals, 'the same first goals');
  for (const m of [room.mission, solo]) m.expedition.goals = [G.make(m, 'chunks'), G.make(m, 'haul')];
  const v = 'A'.repeat(171) + '=', fog = { '1,1': v, '1,0': v, '0,1': v, '-2,-1': v };
  assert.equal(Rm.reveal(room, host, fog), null);
  Object.assign(solo.expedition.revealed, fog); // what solo play's reveal hook merges
  for (const m of [room.mission, solo]) for (let i = 0; i < 2; i++) E.bankItem(m.expedition.banked, 'lena', { kind: 'ice', res: 'water', amount: 40, id: '3,1:0', region: 4 });
  assert.equal(say('advance').status, 200);
  const report = room.lastReport, mine = G.advance(solo, E.defaultPlan(solo));
  assert.deepEqual(report.expedition, mine.report.expedition, 'the same payouts');
  assert.deepEqual(report.expedition.goals.map(g => g.kind), ['chunks']);
  assert.deepEqual(room.mission.expedition.goals, mine.state.expedition.goals, "the same next round's goals");
  assert.deepEqual(room.mission.expedition.goalsDone, mine.state.expedition.goalsDone);
  assert.equal(room.mission.science, mine.state.science);
});

test("co-op: every room frame carries the goals' progress as the server judges it, and new fog that moves an open 'explore' goal sends one", () => {
  const Rm = createRooms();
  const { room, player: host } = Rm.create('Host');
  const say = (type, extra) => Rm.act(Object.assign({ code: room.code, player: host.id, token: host.token, type }, extra));
  say('settings', { seed: 'GOAL-COOP' });
  say('claim', { crewId: 'lena' });
  say('launch');
  const got = [];
  Rm.attach(room, host, { send(type, data) { got.push({ type, data }); }, close() {} });
  room.mission.expedition.goals = [G.make(room.mission, 'chunks'), G.make(room.mission, 'region')];
  // The goals in the last room frame since the last look, or null for none.
  const frame = () => {
    const rooms = got.filter(f => f.type === 'room');
    got.length = 0;
    return rooms.length ? rooms.pop().data.mission.expedition.goals.map(g => [g.kind, g.progress, g.done]) : null;
  };
  const v = 'A'.repeat(171) + '=';
  frame();
  assert.equal(Rm.reveal(room, host, { '1,0': v }), null);
  assert.deepEqual(frame(), [['chunks', 1, false], ['region', 0, false]], 'the fog moved the goal');
  assert.equal(say('region', { region: 'icy' }).status, 200);
  assert.deepEqual(frame(), [['chunks', 1, false], ['region', 1, true]], 'judged before the frame goes out');
  Rm.reveal(room, host, { '2,0': v, '3,0': v, '4,0': v });
  assert.deepEqual(frame(), [['chunks', 4, true], ['region', 1, true]]);
  Rm.reveal(room, host, { '5,0': v });
  assert.equal(frame(), null, 'once the goal is done, fog travels in its own frames only');
});

test('a save from before M4d has no goals; it plays on and gets its goals at the next advance', () => {
  const m = fresh();
  delete m.expedition.goalsDone;
  const old = E.upgradeMission(JSON.parse(JSON.stringify(m)), {});
  assert.deepEqual(old.expedition.goals, []);
  assert.deepEqual(G.update(old), [], 'nothing to judge this round');
  const r = G.advance(old, E.defaultPlan(old));
  assert.deepEqual(r.report.expedition.goals, []);
  assert.equal(r.state.expedition.goals.length, 1, "round 2's goal is picked");
});
