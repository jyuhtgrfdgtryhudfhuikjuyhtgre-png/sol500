'use strict';
// The balance explorer (tools/explorer.js) and spec §1.4: an endless map can't be farmed, so the haul per round levels off.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const { haulRound } = require('../tools/explorer.js');

const KIT = D.REFERENCE_KITS.commander;
const ROVER_KIT = Object.assign({}, KIT, { rover: 1, waterwall: 0 });

// Plays 20 calm rounds with the explorer out every round; returns the loads delivered in each round.
function rounds(seed, kit) {
  let s = E.createMission({ seed, loadout: kit, events: false, pilot: 'diego' });
  const loads = [];
  while (s.status === 'active') {
    const before = s.expedition.banked.lines.reduce((n, l) => n + l.loads, 0);
    const got = haulRound(s, s.pilot);
    const banked = s.expedition.banked.lines.filter(l => !l.late).reduce((n, l) => n + l.loads, 0) - before;
    assert.equal(banked, got.loads, 'what it reports is what the real rules banked');
    loads.push(got.loads);
    s = E.resolveTurn(s, E.defaultPlan(s)).state;
  }
  return loads;
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

test('on foot the haul per round is capped by one suit charge and falls off as the finds near the base run out', () => {
  for (const seed of ['FARM-1', 'FARM-2', 'FARM-3', 'FARM-4']) {
    const loads = rounds(seed, KIT);
    assert.equal(loads.length, D.TURNS);
    assert.ok(Math.max(...loads) <= 15, seed + ': at most 15 loads a round on one suit, got ' + Math.max(...loads));
    assert.ok(mean(loads.slice(15)) <= mean(loads.slice(0, 5)), seed + ': no more in the last rounds than the first: ' + loads.join(' '));
    assert.ok(mean(loads) >= 2, seed + ': exploring brings something home: ' + loads.join(' '));
  }
});

test("in the rover the battery caps the haul, and it never grows", () => {
  for (const seed of ['FARM-5', 'FARM-6']) {
    const loads = rounds(seed, ROVER_KIT);
    assert.ok(Math.max(...loads) <= 30, seed + ': at most 30 loads a round in the rover, got ' + Math.max(...loads));
    assert.ok(mean(loads.slice(15)) <= mean(loads.slice(0, 5)), seed + ': ' + loads.join(' '));
  }
});
