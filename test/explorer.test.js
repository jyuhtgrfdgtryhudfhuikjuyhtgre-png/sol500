'use strict';
// The balance explorer (tools/explorer.js) and spec §1.4: an endless map can't be farmed, so the haul per round levels off.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const { haulRound, DEVIL_HITS } = require('../tools/explorer.js');

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

test('in a solar-flare round the explorer, who never runs for cover, is hit when the flare ends while it is out', () => {
  let hits = 0, safe = 0;
  for (let i = 0; i < 12; i++) {
    const s = E.createMission({ seed: 'FLARE-BOT-' + i, loadout: KIT, events: false, pilot: 'diego' });
    s.schedule[s.turn].spe = true;
    const got = haulRound(s, 'diego');
    const caught = s.expedition.incidents.filter(k => k.kind === 'flare').map(k => k.crewId);
    assert.ok(s.expedition.flare && s.expedition.flare.over, 'the flare came and went');
    if (got.flare === 'hit') {
      hits++;
      assert.deepEqual(caught, ['diego']);
      const before = s.crew.find(c => c.id === 'diego').dose;
      const next = E.resolveTurn(s, E.defaultPlan(s)).state;
      assert.ok(next.crew.find(c => c.id === 'diego').dose >= before + D.DANGERS.flare.dose, '+15 mSv at the advance');
    } else {
      safe++;
      assert.equal(got.flare, 'safe');
      assert.deepEqual(caught, []);
    }
  }
  assert.ok(hits >= 6, 'out for most of its suit, it is usually caught: ' + hits + ' hit, ' + safe + ' safe');
  const quiet = E.createMission({ seed: 'FLARE-BOT-Q', loadout: KIT, events: false, pilot: 'diego' });
  assert.equal(haulRound(quiet, 'diego').flare, null, 'no flare in a quiet round');
});

test('dust devils cost a walking explorer suit time, so a dust-devil round never hauls more; the rover is immune', () => {
  // What a dust-devil round adds to the toll: suit seconds lost a second exposed (DEVIL_HITS in tools/explorer.js).
  const extra = (DEVIL_HITS.round - DEVIL_HITS.quiet) * D.DANGERS.devils.suit;
  let pinned = 0;
  for (const seed of ['DEVIL-BOT-1', 'DEVIL-BOT-2', 'DEVIL-BOT-3']) {
    const go = (kit, devil) => {
      const s = E.createMission({ seed, loadout: kit, events: false, pilot: 'diego' });
      s.schedule[s.turn].devil = devil;
      return haulRound(s, 'diego');
    };
    const calm = go(KIT, false), windy = go(KIT, true);
    assert.ok(windy.loads <= calm.loads, seed + ': ' + windy.loads + ' loads with devils, ' + calm.loads + ' without');
    assert.ok(windy.loads < calm.loads || windy.seconds > calm.seconds, seed + ': on foot the devils cost suit: ' + windy.seconds + ' s vs ' + calm.seconds + ' s');
    const roverCalm = go(ROVER_KIT, false), roverWindy = go(ROVER_KIT, true);
    assert.ok(roverWindy.loads >= roverCalm.loads - 1, seed + ': the rover is immune, only work on foot pays: ' + roverWindy.loads + ' vs ' + roverCalm.loads);
    if (roverWindy.loads === roverCalm.loads) {
      // The same route: only the work on foot pays, so the extra is less than a toll on the whole round would be.
      const more = roverWindy.seconds - roverCalm.seconds;
      assert.ok(more > 0 && more < extra * roverCalm.seconds, seed + ': the rover pays only for work on foot: +' + more + ' s');
      pinned++;
    }
  }
  assert.ok(pinned >= 2, 'the rover check ran on ' + pinned + ' of 3 seeds');
});

test("in the rover the battery caps the haul, and it never grows", () => {
  for (const seed of ['FARM-5', 'FARM-6']) {
    const loads = rounds(seed, ROVER_KIT);
    assert.ok(Math.max(...loads) <= 30, seed + ': at most 30 loads a round in the rover, got ' + Math.max(...loads));
    assert.ok(mean(loads.slice(15)) <= mean(loads.slice(0, 5)), seed + ': ' + loads.join(' '));
  }
});

const W = require('../src/worldgen.js');
// Plays 20 calm rounds with the explorer out every round, thoughtfully or not; returns the mission at the end, the loads
// and the refills it took. The science of a discovery or a weather station is banked on the spot, not delivered as a load.
function mission(seed, kit, poi) {
  let s = E.createMission({ seed, loadout: kit, events: false, pilot: 'diego' }), loads = 0, refills = 0;
  const delivered = () => s.expedition.banked.lines.filter(l => !l.late && l.kind !== 'landmark' && l.kind !== 'weather').reduce((n, l) => n + l.loads, 0);
  while (s.status === 'active') {
    const before = delivered(), got = haulRound(s, s.pilot, poi);
    assert.equal(delivered() - before, got.loads, 'what it reports is what the real rules banked');
    loads += got.loads;
    refills += (s.expedition.refills.diego || []).length;
    s = E.resolveTurn(s, E.defaultPlan(s)).state;
  }
  return { s, loads, refills };
}

test('played thoughtfully, the explorer also uses the points of interest near the base, and on foot a hab pod lets it haul more', () => {
  const sites = x => Object.keys(x.sites).filter(id => /^[LF]/.test(id)).length;
  let landmarks = 0;
  for (const seed of ['FARM-1', 'FARM-3']) {
    const plain = mission(seed, KIT, false), keen = mission(seed, KIT, true), x = keen.s.expedition;
    assert.deepEqual([plain.s.expedition.structures, plain.s.expedition.landmarks, sites(plain.s.expedition), plain.refills], [{}, {}, 0, 0], seed + ': a careless explorer leaves them');
    assert.ok(Object.values(x.structures).length >= 1 && Object.values(x.structures).every(v => v === 'used' || v === 'repaired'), seed + ': ' + JSON.stringify(x.structures));
    assert.ok(sites(x) >= 1, seed + ': it collects the sites of landmarks and formations');
    assert.ok(keen.refills >= 5, seed + ': ' + keen.refills + ' refills');
    assert.ok(keen.loads > plain.loads, seed + ': ' + keen.loads + ' loads, careless ' + plain.loads);
    landmarks += Object.keys(x.landmarks).length;
  }
  assert.ok(landmarks >= 1, 'it discovers the landmarks it comes near');
  // BAL-2 has a comms mast 62 tiles from the base, nearer than most of what it uses.
  const used = mission('BAL-2', KIT, true).s.expedition.structures;
  const kinds = Object.keys(used).map(id => W.structureAt(W.seedOf('BAL-2'), ...id.slice(1).split(',').map(Number)).kind);
  assert.ok(kinds.length >= 1 && !kinds.includes('mast'), 'it leaves the comms masts, it knows the map: ' + kinds);
});
