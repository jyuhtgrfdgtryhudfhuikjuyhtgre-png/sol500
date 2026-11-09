'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../src/engine.js');
const { createHistory, summarize, validMission, toCSV, CAUSES } = require('../lib/history.js');
const { finishedMission } = require('./helpers/missions.js');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-history-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a finished mission becomes a history record scored by the engine', () => {
  const m = finishedMission();
  const r = summarize(m, { mode: 'lan', players: [{ name: 'Nguyễn Thị Ánh', crewId: 'lena' }, { name: '<b>x</b>', crewId: 'nobody' }] });
  assert.match(r.id, /^[0-9a-f]{12}$/);
  assert.ok(!Number.isNaN(Date.parse(r.endedAt)));
  assert.equal(r.mode, 'lan');
  assert.equal(r.missionCode, 'TEST-1');
  assert.equal(r.difficulty, 'commander');
  assert.equal(r.crewSize, 4);
  assert.equal(r.outcome, m.status);
  assert.equal(r.score, E.scoreMission(m).total);
  assert.equal(r.grade, E.scoreMission(m).grade);
  assert.equal(r.sols, m.sol);
  assert.deepEqual(r.achievements, E.achievements(m));
  assert.deepEqual(r.players, [{ name: 'Nguyễn Thị Ánh', crewId: 'lena', role: 'engineer' }, { name: 'bx/b', crewId: null, role: null }]);
  if (m.status === 'lost') assert.ok(CAUSES.includes(r.cause)); else assert.equal(r.cause, null);
  assert.deepEqual(r.explore, { regions: 0, landmarks: 0, structures: 0, beacons: 0, goals: 0 });
  assert.equal(summarize(m, { mode: 'party' }).mode, 'solo', 'unknown modes count as solo');
});

test('a record carries what the crew found, how far each walked and what they explored, all read from the expedition state (M4d)', () => {
  const m = finishedMission('HIST-X');
  Object.assign(m.expedition, {
    regions: ['plains', 'icy'], landmarks: { 'L0,1': { by: 'lena', round: 3 } }, structures: { 'S0,0': 'repaired', 'S-1,0': 'used' },
    beacons: [{ x: 14, y: 3, by: 'lena', round: 4 }],
    goalsDone: [{ id: 'G0:0', kind: 'haul', round: 0, params: {} }, { id: 'G1:0', kind: 'chunks', round: 1, params: {} }],
    stats: { lena: { finds: { ice: 3, science: 2 }, distance: 412.6, landmarks: 1 }, minh: { finds: { metal: 1 } } },
  });
  const r = summarize(m, {});
  assert.deepEqual(r.finds, { lena: { ice: 3, science: 2 }, minh: { metal: 1 } }, 'loads by kind, for each astronaut who found any');
  assert.deepEqual(r.distance, { lena: 413 }, 'tiles, rounded (the game has no metre scale)');
  assert.deepEqual(r.explore, { regions: 2, landmarks: 1, structures: 2, beacons: 1, goals: 2 });
  const total = Object.values(r.finds).reduce((a, f) => a + Object.values(f).reduce((x, y) => x + y, 0), 0);
  assert.equal(total, 6, "the admin's Finds total sums these nested numbers");
});

test('a mission posted by a browser cannot put junk into the record: only its own crew, the game\'s kinds and whole positive numbers get in', () => {
  const m = finishedMission('HIST-Y');
  m.expedition.stats = {
    stranger: { finds: { ice: 9 }, distance: 50 },
    lena: { finds: { ice: -2, gold: 7, science: 'many', metal: 2.6, pod: Infinity }, distance: NaN },
    minh: 'far', diego: { finds: [1, 2], distance: 1e12 },
  };
  Object.assign(m.expedition, { regions: ['plains'], landmarks: ['x'], structures: null, beacons: 7, goalsDone: { a: 1 } });
  const r = summarize(m, {});
  assert.deepEqual(r.finds, { lena: { metal: 3 } });
  assert.ok(r.distance.diego <= 1e6 && Object.keys(r.distance).join() === 'diego', 'a huge distance is capped, a NaN one is dropped');
  assert.deepEqual(r.explore, { regions: 1, landmarks: 0, structures: 0, beacons: 0, goals: 0 }, 'a list is counted only if it is a list, a map only if it is a map');
  for (const expedition of [undefined, null, 'x', [], 5]) {
    const old = Object.assign({}, m, { expedition });
    assert.deepEqual([summarize(old, {}).finds, summarize(old, {}).distance, summarize(old, {}).explore], [{}, {}, { regions: 0, landmarks: 0, structures: 0, beacons: 0, goals: 0 }], String(expedition));
  }
});

test('records are kept newest first, capped, and survive a restart', t => {
  const dir = tmp(t);
  const h = createHistory({ dataDir: dir, cap: 3 });
  for (const id of ['a', 'b', 'c', 'd']) h.add({ id });
  assert.deepEqual(h.list().map(r => r.id), ['d', 'c', 'b']);
  const again = createHistory({ dataDir: dir, cap: 3 });
  assert.deepEqual(again.list().map(r => r.id), ['d', 'c', 'b']);
  assert.equal(again.remove('c'), true);
  assert.equal(again.remove('zzz'), false);
  assert.deepEqual(createHistory({ dataDir: dir }).list().map(r => r.id), ['d', 'b']);
  again.clear();
  assert.deepEqual(createHistory({ dataDir: dir }).list(), []);
  assert.deepEqual(fs.readdirSync(dir), ['history.json'], 'no temp files left behind');
});

test('a corrupt history file is set aside and a fresh one started', t => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'history.json'), '{ not json');
  const h = createHistory({ dataDir: dir });
  assert.deepEqual(h.list(), []);
  assert.ok(fs.readdirSync(dir).some(f => /^history\.corrupt-\d+\.json$/.test(f)));
  h.add({ id: 'x' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8')).map(r => r.id), ['x']);
});

test('when Windows blocks the rename, the history is copied over instead', t => {
  const dir = tmp(t);
  const locked = Object.assign({}, fs, { renameSync() { throw Object.assign(new Error('locked'), { code: 'EPERM' }); } });
  createHistory({ dataDir: dir, fsImpl: locked }).add({ id: 'a' });
  assert.deepEqual(createHistory({ dataDir: dir }).list().map(r => r.id), ['a']);
  assert.deepEqual(fs.readdirSync(dir), ['history.json']);
});

test('a data folder that cannot be written never breaks the game: the record stays in memory', t => {
  const dir = tmp(t);
  const readOnly = Object.assign({}, fs, { writeFileSync() { throw Object.assign(new Error('no'), { code: 'EACCES' }); } });
  const h = createHistory({ dataDir: dir, fsImpl: readOnly });
  const errors = [];
  t.mock.method(console, 'error', m => errors.push(m));
  assert.doesNotThrow(() => h.add({ id: 'a' }));
  assert.deepEqual(h.list().map(r => r.id), ['a']);
  assert.equal(errors.length, 1);
});

test('without a data folder the history lives in memory only', () => {
  const h = createHistory();
  h.add({ id: 'a' });
  assert.deepEqual(h.list().map(r => r.id), ['a']);
});

test('only a real finished mission passes the solo check', () => {
  const m = finishedMission();
  assert.equal(validMission(m), true);
  const one = patch => Object.assign({}, m, patch);
  const bad = [null, 'x', {}, one({ version: 1 }), one({ status: 'active' }), one({ seed: 'X'.repeat(25) }), one({ seed: '' }),
    one({ science: 'lots' }), one({ crew: m.crew.slice(1) }), one({ turn: 99 }), one({ difficulty: 'god' }), one({ modules: {} }),
    one({ crew: m.crew.map((c, i) => (i ? c : Object.assign({}, c, { status: 'zombie' }))) }),
    one({ crew: m.crew.map((c, i) => (i ? c : Object.assign({}, c, { id: 'stranger' }))) })];
  bad.forEach((b, i) => assert.equal(validMission(b), false, 'bad case ' + i));
});

test('CSV export opens cleanly in Excel and never runs a formula', () => {
  const csv = toCSV([{
    endedAt: '2026-10-01T10:00:00.000Z', mode: 'solo', missionCode: 'ABC', difficulty: 'cadet', crewSize: 4,
    players: [{ name: '=HYPERLINK("x")', role: 'medic' }, { name: 'Bảo "B"', role: null }],
    outcome: 'lost', cause: 'cold', score: -12, grade: 'D', sols: 250, achievements: ['first_sol', 'builder'],
  }]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'endedAt,mode,missionCode,difficulty,crewSize,players,outcome,cause,score,grade,sols,achievements');
  assert.equal(lines[1], '"2026-10-01T10:00:00.000Z","solo","ABC","cadet","4","\'=HYPERLINK(""x"") (medic); Bảo ""B""","lost","cold","-12","D","250","first_sol builder"');
  assert.equal(lines[2], '');
});

test('a solo crewId that is not a crew member of the mission is dropped', () => {
  const m = finishedMission();
  const big = summarize(m, { players: [{ name: 'A', crewId: 'x'.repeat(50000) }] });
  const obj = summarize(m, { players: [{ name: 'A', crewId: { a: 1 } }] });
  const ok = summarize(m, { players: [{ name: 'A', crewId: 'lena' }] });
  assert.equal(big.players[0].crewId, null);
  assert.equal(obj.players[0].crewId, null);
  assert.equal(ok.players[0].crewId, 'lena');
});

test('inherited object keys are not a difficulty', () => {
  const m = finishedMission();
  for (const d of ['constructor', '__proto__', 'toString']) assert.equal(validMission(Object.assign({}, m, { difficulty: d })), false, d);
});

test('a read error other than bad JSON does not move a valid history file aside', t => {
  const dir = tmp(t);
  createHistory({ dataDir: dir }).add({ id: 'a' });
  const busy = Object.assign({}, fs, { readFileSync() { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } });
  t.mock.method(console, 'error', () => {});
  assert.deepEqual(createHistory({ dataDir: dir, fsImpl: busy }).list(), []);
  assert.deepEqual(fs.readdirSync(dir), ['history.json'], 'the file stays where it is');
  assert.deepEqual(createHistory({ dataDir: dir }).list().map(r => r.id), ['a']);
});

test('a history file that is valid JSON but not a list is set aside', t => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'history.json'), '{"a":1}');
  assert.deepEqual(createHistory({ dataDir: dir }).list(), []);
  assert.ok(fs.readdirSync(dir).some(f => /^history\.corrupt-\d+\.json$/.test(f)));
});

test('a solo mission is refused when its pilot is not one of its crew', () => {
  const m = finishedMission('PILOT-H');
  assert.equal(validMission(Object.assign({}, m, { pilot: 'lena' })), true);
  assert.equal(validMission(Object.assign({}, m, { pilot: null })), true);
  for (const pilot of ['kai', 'nobody', 42, {}, '__proto__']) assert.equal(validMission(Object.assign({}, m, { pilot })), false, String(pilot));
});

const quickDone = () => {
  let s = E.createMission({ seed: 'Q1', quick: true, loadout: E.referenceKit('commander', 4, true), difficulty: 'commander', crewSize: 4 });
  let plan = E.defaultPlan(s);
  while (s.status === 'active') { s = E.resolveTurn(s, plan).state; plan = E.nextPlan(s, plan); }
  return s;
};
test('a solo mission claiming quick with 20 rounds is refused', () => {
  const m = JSON.parse(JSON.stringify(finishedMission()));
  m.quick = true;
  assert.equal(validMission(m), false);
});
test('a mission with a full flag but an 8-round schedule is refused', () => {
  const m = JSON.parse(JSON.stringify(quickDone()));
  delete m.quick;
  assert.equal(validMission(m), false);
});
test('a quick mission with turn 9 is refused', () => {
  const m = JSON.parse(JSON.stringify(quickDone()));
  m.turn = 9;
  assert.equal(validMission(m), false);
});
test('a valid quick mission is accepted and its record says quick: true', () => {
  const m = JSON.parse(JSON.stringify(quickDone()));
  assert.equal(m.status, 'success');
  assert.equal(validMission(m), true);
  assert.equal(summarize(m, { mode: 'solo', players: [] }).quick, true);
});
test('a full mission record has no quick field', () => {
  assert.equal('quick' in summarize(finishedMission(), { mode: 'solo', players: [] }), false);
});
