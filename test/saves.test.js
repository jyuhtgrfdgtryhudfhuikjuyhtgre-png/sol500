'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/saves.js');

// A fake of ui.js's { get, set, del } over a plain object.
const fakeLS = raw => ({ raw, get: (k, d) => (k in raw ? raw[k] : d), set: (k, v) => { raw[k] = JSON.parse(JSON.stringify(v)); }, del: k => { delete raw[k]; } });
const FULL = { mission: { status: 'active', version: 2, sol: 120 }, plan: { jobs: {} } };
const QUICK = { mission: { status: 'active', version: 2, sol: 40, quick: true }, plan: { jobs: {} } };

test('slotOf: a quick mission uses saveQuick, anything else save', () => {
  assert.equal(S.slotOf({ quick: true }), 'saveQuick');
  assert.equal(S.slotOf({}), 'save');
  assert.equal(S.slotOf({ quick: false }), 'save');
  assert.equal(S.slotOf(null), 'save');
});

test('load reads a save, repairs it and writes it back', () => {
  const ls = fakeLS({ saveQuick: QUICK });
  const r = S.load(ls, 'saveQuick', m => Object.assign({}, m, { repaired: true }));
  assert.equal(r.mission.repaired, true);
  assert.deepEqual(r.plan, QUICK.plan);
  assert.equal(ls.raw.saveQuick.mission.repaired, true);
});

test('a damaged quick slot is dropped and the full slot is untouched', () => {
  const ls = fakeLS({ save: FULL, saveQuick: { mission: { status: 'active', version: 2 } } });
  assert.equal(S.load(ls, 'saveQuick', () => { throw new Error('bad'); }), null);
  assert.equal(ls.raw.saveQuick, undefined);
  assert.deepEqual(ls.raw.save, FULL);
});

test('an old save with no quick field loads from the full slot', () => {
  const ls = fakeLS({ save: FULL });
  const r = S.load(ls, 'save', m => m);
  assert.equal(S.slotOf(r.mission), 'save');
  assert.equal(S.load(ls, 'saveQuick', m => m), null);
});

test('a save that is not active or not version 2 loads as null and stays', () => {
  const lost = { mission: { status: 'lost', version: 2 } }, old = { mission: { status: 'active', version: 1 } };
  const ls = fakeLS({ save: lost, saveQuick: old });
  assert.equal(S.load(ls, 'save', () => { throw new Error('not called'); }), null);
  assert.equal(S.load(ls, 'saveQuick', () => { throw new Error('not called'); }), null);
  assert.deepEqual(ls.raw, { save: lost, saveQuick: old });
});

test('summary gives each slot its sol, or null', () => {
  assert.deepEqual(S.summary(fakeLS({ save: FULL, saveQuick: QUICK })), { save: { sol: 120 }, saveQuick: { sol: 40 } });
  assert.deepEqual(S.summary(fakeLS({ saveQuick: QUICK })), { save: null, saveQuick: { sol: 40 } });
  assert.deepEqual(S.summary(fakeLS({ save: { mission: { status: 'lost', version: 2, sol: 9 } } })), { save: null, saveQuick: null });
});

test('a save with no plan gets one from the builder; a builder that throws drops that slot only', () => {
  const noPlan = { mission: { status: 'active', version: 2, sol: 40, quick: true } };
  const ls = fakeLS({ save: FULL, saveQuick: noPlan });
  assert.deepEqual(S.load(ls, 'saveQuick', m => m, () => ({ built: true })).plan, { built: true });
  const ls2 = fakeLS({ save: FULL, saveQuick: noPlan });
  assert.equal(S.load(ls2, 'saveQuick', m => m, () => { throw new Error('bad crew'); }), null);
  assert.equal(ls2.raw.saveQuick, undefined);
  assert.deepEqual(ls2.raw.save, FULL);
});

test('a mission that does not belong in its slot is damaged: it is dropped and never reaches the other slot', () => {
  const lostFlag = { mission: { status: 'active', version: 2, sol: 40 } }; // a Quick mission whose flag is gone, in saveQuick
  const ls = fakeLS({ save: FULL, saveQuick: lostFlag });
  assert.equal(S.load(ls, 'saveQuick', m => m), null);
  assert.equal(ls.raw.saveQuick, undefined);
  assert.deepEqual(ls.raw.save, FULL);
  const ls2 = fakeLS({ save: QUICK });
  assert.equal(S.load(ls2, 'save', m => m), null);
  assert.equal(ls2.raw.save, undefined);
});
