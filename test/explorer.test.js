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
    assert.ok(mean(loads.slice(15)) <= 0.7 * mean(loads.slice(0, 5)), seed + ': the last rounds bring less than the first: ' + loads.join(' '));
    assert.ok(mean(loads) >= 2, seed + ': exploring brings something home: ' + loads.join(' '));
  }
});

test('in a solar-flare round the explorer, who never runs for cover, is hit when the flare ends while it is out, and safe when it is home first', () => {
  // The verdict of one flare round, checked against the incident the rules recorded and the dose at the advance.
  const flareRound = s => {
    s.schedule[s.turn].spe = true;
    const got = haulRound(s, 'diego');
    const caught = s.expedition.incidents.filter(k => k.kind === 'flare').map(k => k.crewId);
    assert.ok(s.expedition.flare && s.expedition.flare.over, 'the flare came and went');
    const before = s.crew.find(c => c.id === 'diego').dose;
    const after = E.resolveTurn(s, E.defaultPlan(s)).state.crew.find(c => c.id === 'diego').dose;
    if (got.flare === 'hit') {
      assert.deepEqual(caught, ['diego']);
      assert.ok(after >= before + D.DANGERS.flare.dose, '+15 mSv at the advance');
    } else {
      assert.equal(got.flare, 'safe');
      assert.deepEqual(caught, []);
      assert.ok(after < before + D.DANGERS.flare.dose, 'no flare dose');
    }
    return got.flare;
  };
  const count = (verdicts, v) => verdicts.filter(k => k === v).length;
  // In round 1 the finds are near and it stays out on most of its suit, past the flare's end (90 s after it steps out).
  const first = [], late = [];
  for (let i = 0; i < 12; i++) first.push(flareRound(E.createMission({ seed: 'FLARE-BOT-' + i, loadout: KIT, events: false, pilot: 'diego' })));
  assert.ok(count(first, 'hit') >= 10, 'out for most of its suit, it is usually caught: ' + first);
  // After 12 calm rounds less is in reach, its trips are shorter and it is often home before the flare ends.
  for (let i = 0; i < 12; i++) {
    let s = E.createMission({ seed: 'FLARE-BOT-' + i, loadout: KIT, events: false, pilot: 'diego' });
    while (s.turn < 12) { haulRound(s, 'diego'); s = E.resolveTurn(s, E.defaultPlan(s)).state; }
    late.push(flareRound(s));
  }
  assert.ok(count(late, 'safe') >= 2 && count(late, 'hit') >= 2, 'both verdicts late in the mission: ' + late);
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

test('the explorer reports its time outside on the round\'s clock (for the run length): on foot its suit pays that and the devils\' toll', () => {
  for (const [seed, devil] of [['FARM-1', false], ['FARM-2', true]]) {
    const s = E.createMission({ seed, loadout: KIT, events: false, pilot: 'diego' });
    s.schedule[s.turn].devil = devil;
    const got = haulRound(s, 'diego'), toll = (devil ? DEVIL_HITS.round : DEVIL_HITS.quiet) * D.DANGERS.devils.suit;
    assert.ok(got.time > 60, seed + ': ' + got.time + ' s outside');
    assert.ok(Math.abs(got.seconds - got.time * (1 + toll)) < 1e-6, seed + ': ' + got.seconds + ' s of suit for ' + got.time + ' s outside');
  }
});

test('the explorer counts only what the rules banked: a refused delivery brings nothing home', () => {
  const X = require('../src/expedition.js'), deliver = X.deliver;
  const s = E.createMission({ seed: 'FARM-1', loadout: KIT, events: false, pilot: 'diego' });
  X.deliver = () => ({ error: 'notAtBase' });
  try {
    assert.equal(haulRound(s, 'diego').loads, 0);
  } finally {
    X.deliver = deliver;
  }
  assert.ok(s.expedition.carried.diego.length > 0, 'what it carried is still in its backpack');
});

test("in the rover the battery caps the haul, and it never grows", () => {
  for (const seed of ['FARM-5', 'FARM-6']) {
    const loads = rounds(seed, ROVER_KIT);
    assert.ok(Math.max(...loads) <= 30, seed + ': at most 30 loads a round in the rover, got ' + Math.max(...loads));
    assert.ok(Math.max(...loads) > 15, seed + ': more than one suit on foot carries, so it drove: ' + loads.join(' '));
    assert.ok(mean(loads.slice(15)) <= 0.75 * mean(loads.slice(0, 5)), seed + ': ' + loads.join(' '));
  }
});

const W = require('../src/worldgen.js');
const F = require('../src/fog.js');
test('as it walks, the explorer explores what a player would see and visits the regions it walks into, as the surface does', () => {
  const s = E.createMission({ seed: 'FARM-1', loadout: KIT, events: false, pilot: 'diego' }), x = s.expedition;
  haulRound(s, 'diego');
  const seed = W.seedOf(s.seed), hq = W.REGIONS[W.regionAt(seed, 0, 0)];
  assert.ok(x.regions.includes(hq), 'it starts in the HQ region: ' + x.regions);
  assert.ok(x.regions.every(r => W.REGIONS.includes(r)) && new Set(x.regions).size === x.regions.length, JSON.stringify(x.regions));
  const keys = Object.keys(x.revealed);
  assert.ok(keys.length > 4, 'more than the four chunks round the HQ: ' + keys);
  for (const k of keys) assert.ok(F.KEY.test(k) && F.count(F.decode(x.revealed[k])) > 0, k);
  // It can't collect what it hasn't seen: every find it touched lies in a chunk it explored.
  const touched = Object.keys(x.sites);
  assert.ok(touched.length > 0);
  for (const id of touched) assert.ok(keys.includes(id.split(':')[0]), id + ' in ' + keys);
});

const G = require('../src/goals.js');
test('played thoughtfully, the explorer goes after the round\'s goal when it can get there and back; a careless one only meets it by chance', () => {
  // One goal of each kind a player goes after on foot, in round 5 of a calm mission, on seeds where it is offered. Not a
  // region: the base's plains reach 84 tiles or more out on every seed (200 measured), a whole suit there and back. A
  // landmark lies 60 tiles out or more, so it goes for those within about 80 and leaves the rest.
  let met = 0, all = 0;
  for (const kind of ['survey', 'landmark', 'structure', 'chunks']) {
    let keen = 0, plain = 0, tried = 0;
    for (let i = 0; i < 30 && tried < 8; i++) {
      const fresh = () => {
        const s = E.createMission({ seed: 'GOAL-BOT-' + i, loadout: KIT, events: false, pilot: 'diego' });
        s.turn = 4;
        return s;
      };
      if (!G.offered(fresh()).includes(kind)) continue;
      tried++;
      for (const poi of [true, false]) {
        const s = fresh();
        s.expedition.goals = [Object.assign(G.make(s, kind), { id: 'G4:0' })];
        haulRound(s, 'diego', poi);
        if (G.update(s)[0].done) { if (poi) keen++; else plain++; }
      }
    }
    assert.ok(tried >= 5, kind + ': offered on ' + tried + ' seeds');
    assert.ok(keen >= 3 && keen > plain, kind + ': thoughtful ' + keen + ', careless ' + plain + ' of ' + tried);
    met += keen;
    all += tried;
  }
  assert.ok(met >= all * 0.7, 'thoughtful, it meets ' + met + ' of ' + all);
});

const B = require('../tools/balance.js');
test('a balance mission that explores has goals picked each round and paid through the real advance; one that stays home has none', () => {
  let paid = 0;
  const kinds = new Set();
  for (const seed of ['GOALS-BAL-1', 'GOALS-BAL-2']) {
    const s = B.play('reference', B.smartPlan, seed, true, null, 'commander');
    assert.equal(s.turn, D.TURNS);
    paid += s.expedition.goalsDone.length;
    for (const g of s.expedition.goalsDone) kinds.add(g.kind);
    assert.deepEqual(B.play('reference', B.smartPlan, seed, false, null, 'commander').expedition.goalsDone, []);
  }
  assert.ok(paid >= 4, paid + ' goals paid in 2 missions');
  assert.ok(kinds.has('chunks') || kinds.has('region'), 'walking out explores and visits: ' + [...kinds]);
});

test('played thoughtfully, the explorer has beacon kits built, takes one out a round, places it and refills its suit there; its haul per round stays capped by its suits and levels off', () => {
  let first = 0, second = 0;
  for (const seed of ['BEACON-BOT-1', 'BEACON-BOT-2']) {
    let s = E.createMission({ seed, loadout: KIT, difficulty: 'commander', pilot: 'diego' }), refills = 0, built = 0;
    G.pick(s);
    while (s.status === 'active') {
      const got = haulRound(s, 'diego', true), suits = 1 + (s.expedition.refills.diego || []).length;
      refills += (s.expedition.refills.diego || []).filter(id => id[0] === 'B').length;
      // Spec §1.4, an endless map can't be farmed: a round's suit and each refill (a hab pod or a beacon, once a round each)
      // carry no more than one suit on foot does (15 loads, the first test), and the beacons added don't make it grow.
      assert.ok(got.loads <= 15 * suits, seed + ', round ' + (s.turn + 1) + ': ' + got.loads + ' loads on ' + suits + ' suits');
      if (s.turn < D.TURNS / 2) first += got.loads; else second += got.loads;
      const r = G.advance(s, B.smartPlan(s, true));
      built += r.report.completed.filter(t => t === 'kit').length;
      s = r.state;
    }
    const x = s.expedition, B0 = D.EXPEDITION.beacon;
    assert.ok(built >= 3 && x.beacons.length >= 3, seed + ': ' + built + ' kits built, ' + x.beacons.length + ' beacons placed');
    for (const b of x.beacons) assert.ok(Math.hypot(b.x, b.y) >= B0.base && b.by === 'diego', JSON.stringify(b));
    assert.ok(refills >= x.beacons.length, seed + ': ' + refills + ' refills at beacons');
    // Played without exploring, the plan builds none.
    const home = B.play('reference', B.smartPlan, seed, false, null, 'commander');
    assert.ok(!home.log.some(l => l.started.includes('kit')) && home.expedition.kits === 0, seed);
  }
  // Both missions: 135 loads in rounds 1-10 and 136 in 11-20 today (1,000 commander runs: rounds 16-20 bring 0.88 of 1-5).
  assert.ok(second <= 1.25 * first, 'the haul per round levels off: ' + first + ' loads in rounds 1-10, ' + second + ' in 11-20');
});

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
  // The structures and landmarks are counted over three seeds (6 and 3 of them today), so one lost event doesn't fail it.
  let structures = 0, landmarks = 0;
  for (const seed of ['FARM-1', 'FARM-3', 'FARM-16']) {
    const plain = mission(seed, KIT, false), keen = mission(seed, KIT, true), x = keen.s.expedition;
    assert.deepEqual([plain.s.expedition.structures, plain.s.expedition.landmarks, sites(plain.s.expedition), plain.refills], [{}, {}, 0, 0], seed + ': a careless explorer leaves them');
    assert.ok(Object.values(x.structures).every(v => v === 'used' || v === 'repaired'), seed + ': ' + JSON.stringify(x.structures));
    assert.ok(sites(x) >= 1, seed + ': it collects the sites of landmarks and formations');
    assert.ok(keen.refills >= 5, seed + ': ' + keen.refills + ' refills');
    assert.ok(keen.loads > plain.loads, seed + ': ' + keen.loads + ' loads, careless ' + plain.loads);
    structures += Object.keys(x.structures).length;
    landmarks += Object.keys(x.landmarks).length;
  }
  assert.ok(structures >= 4, 'it uses the structures near the base: ' + structures);
  assert.ok(landmarks >= 2, 'it discovers the landmarks it comes near: ' + landmarks);
  // BAL-2 has a comms mast 62 tiles from the base, nearer than most of what it uses.
  const used = mission('BAL-2', KIT, true).s.expedition.structures;
  const kinds = Object.keys(used).map(id => W.structureAt(W.seedOf('BAL-2'), ...id.slice(1).split(',').map(Number)).kind);
  assert.ok(kinds.length >= 1 && !kinds.includes('mast'), 'it leaves the comms masts, it knows the map: ' + kinds);
});
