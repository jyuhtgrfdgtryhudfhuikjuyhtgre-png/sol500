#!/usr/bin/env node
// Plays many seeded missions with scripted strategies and prints success rates,
// end causes and scores, each without and with exploring (tools/explorer.js).
// Usage: node tools/balance.js [runs]   (LEVELS=commander to run one difficulty)
'use strict';
const E = require('../src/engine.js');
const D = require('../src/data.js');
const { haulRound } = require('./explorer.js');

const RUNS = Number(process.argv[2]) || 1000;

const LOADOUTS = {
  naive: { solar: 5, battery: 1, recycler: 1, lab: 1, rover: 1, food: 8, o2: 6, water: 4 },
  recommended: D.RECOMMENDED,
  solarOnly: { solar: 7, battery: 4, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, lab: 1, spares: 2, materials: 1, food: 6, o2: 3, water: 3 },
  fortress: { solar: 2, battery: 1, reactor: 2, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, spares: 3, food: 6, o2: 3, water: 2 },
  roverKit: Object.assign({}, D.REFERENCE_KITS.commander, { rover: 1, waterwall: 0 }), // a rover instead of the water wall
};

const remainingTurns = s => D.TURNS - s.turn;
const byRole = (s, r) => s.crew.find(c => c.role === r);

// Careless: all science, never maintain, never build, ignores warnings.
function naivePlan(s) {
  const p = E.defaultPlan(s);
  for (const c of s.crew) p.jobs[c.id] = c.role === 'scientist' ? 'eva' : 'science';
  p.choices.spe = 'work';
  p.choices.water_leak = 'ignore';
  return p;
}

// Thoughtful: builds shielding early, reads the forecast, manages margins, uses Earth support.
function smartPlan(s) {
  const p = E.defaultPlan(s);
  const eng = byRole(s, 'engineer'), bio = byRole(s, 'biologist'), sci = byRole(s, 'scientist'), med = byRole(s, 'medic');
  const wantShield = s.modules.shield.count + s.projects.filter(x => x.type === 'shield').length < 6;
  const somethingBroken = D.MODULE_TYPES.some(t => s.modules[t].broken > 0);
  if (wantShield && !somethingBroken && s.resources.materials >= D.BUILDS.shield.materials) {
    p.jobs[eng.id] = 'construction';
    p.builds = [{ type: 'shield' }];
  } else {
    p.jobs[eng.id] = 'maintenance';
  }
  p.jobs[bio.id] = s.modules.greenhouse.count ? 'farming' : 'construction';
  p.jobs[sci.id] = 'eva';
  const someoneHurt = s.crew.some(c => c.status === 'down' || (c.status === 'active' && c.health < 60));
  p.jobs[med.id] = someoneHurt ? 'medical' : 'science';
  p.choices.spe = 'shelter';
  p.choices.water_leak = s.resources.spares > 1 ? 'patch' : 'ignore';
  p.choices.perchlorate = 'wash';
  p.choices.conflict = 'meeting';
  p.choices.discovery = 'investigate';

  let f = E.forecast(s, p);
  p.choices.o2_rupture = f.runway.o2 < remainingTurns(s) * D.TURN_SOLS ? 'salvage' : 'hide';
  for (const c of s.crew) {
    if (c.status !== 'active') continue;
    const rc = f.crew.find(x => x.id === c.id);
    const projected = c.dose + rc.doseDelta * remainingTurns(s);
    if (projected > D.DOSE_LIMIT * 0.95 && D.JOBS[p.jobs[c.id]].outdoor > 0) p.jobs[c.id] = 'science';
    if (c.health < 40) p.jobs[c.id] = 'medical';
  }
  const sciProj = sci.dose + (f.crew.find(x => x.id === sci.id).doseDelta + D.DISCOVERY.dose) * remainingTurns(s);
  if (sciProj > D.DOSE_LIMIT * 0.9) p.choices.discovery = 'log';

  const criticalBroken = ['hab', 'recycler', 'oxygen', 'reactor'].some(t => s.modules[t].broken > 0);
  if (criticalBroken && s.resources.spares === 0 && s.resources.materials < D.REPAIR_MATERIALS) {
    const victim = ['rover', 'lab', 'icedrill', 'solar'].find(t => s.modules[t].count > 0);
    if (victim) p.scrap = [victim];
    if (p.jobs[eng.id] !== 'maintenance') p.jobs[eng.id] = 'maintenance';
  }
  f = E.forecast(s, p);
  if (f.power.habShort) p.habMode = 'austerity';
  const need = remainingTurns(s) * D.TURN_SOLS;
  if (E.canRequest(s)) {
    if (f.runway.water < need) p.request = 'water';
    else if (f.runway.food < need) p.request = 'food';
    else if (s.resources.spares === 0 && s.resources.materials < 300) p.request = 'materials';
  }
  if (f.runway.food < need && !p.request) p.rations = 'reduced';
  return p;
}

// Decent but imperfect: sensible jobs and shelters from flares, but never builds, never
// scraps and never asks Earth for help. Reacts when a dose bar turns red or someone collapses.
function sloppyPlan(s) {
  const p = E.defaultPlan(s);
  p.jobs[byRole(s, 'engineer').id] = 'maintenance';
  p.jobs[byRole(s, 'biologist').id] = s.modules.greenhouse.count ? 'farming' : 'science';
  p.jobs[byRole(s, 'scientist').id] = 'eva';
  p.jobs[byRole(s, 'medic').id] = s.crew.some(c => c.status === 'down') ? 'medical' : 'science';
  p.choices.spe = 'shelter';
  p.choices.discovery = 'investigate';
  p.choices.o2_rupture = 'hide';
  for (const c of s.crew) {
    if (c.dose > D.DOSE_LIMIT * 0.85 && D.JOBS[p.jobs[c.id]].outdoor > 0) p.jobs[c.id] = 'science';
  }
  if (s.crew.some(c => c.dose > D.DOSE_LIMIT * 0.85)) p.choices.discovery = 'log';
  return p;
}

let DIFF = 'commander';
const EXPLORER = 'diego'; // with exploring on, the scientist is the astronaut the player walks as

// `haul` collects the loads delivered in each round (sum and missions still running), for the plateau check.
function play(loadoutName, planner, seed, explore, haul) {
  let s = E.createMission({ seed, loadout: LOADOUTS[loadoutName], difficulty: DIFF, pilot: explore ? EXPLORER : undefined });
  while (s.status === 'active') {
    if (explore) {
      const got = haulRound(s, s.pilot);
      haul[s.turn] = haul[s.turn] || [0, 0];
      haul[s.turn][0] += got.loads;
      haul[s.turn][1] += 1;
    }
    s = E.resolveTurn(s, planner(s)).state;
  }
  return s;
}

function run(label, loadoutName, planner, explore) {
  const v = E.validateLoadout(LOADOUTS[loadoutName], DIFF);
  if (!v.ok) throw new Error(label + ': ' + v.errors.join(','));
  let wins = 0, score = 0, sci = 0, deaths = 0, grounded = 0;
  const causes = {}, grades = {}, badges = {};
  let globalWins = 0, globalRuns = 0;
  const haul = [];
  for (let i = 0; i < RUNS; i++) {
    const s = play(loadoutName, planner, 'BAL-' + i, explore, haul);
    const sc = E.scoreMission(s);
    const hadGlobal = s.schedule.some(t => t.weather === 'global');
    if (hadGlobal) globalRuns++;
    if (s.status === 'success') { wins++; if (hadGlobal) globalWins++; }
    else {
      const k = s.endCause.type + ':' + s.endCause.reason;
      causes[k] = (causes[k] || 0) + 1;
    }
    deaths += s.crew.filter(c => c.status === 'dead').length;
    grounded += s.crew.filter(c => c.grounded).length;
    grades[sc.grade] = (grades[sc.grade] || 0) + 1;
    for (const b of E.achievements(s)) badges[b] = (badges[b] || 0) + 1;
    score += sc.total;
    sci += s.science;
  }
  const pct = x => (100 * x / RUNS).toFixed(1) + '%';
  console.log(`\n${label}${explore ? ' + explorer' : ''}  [${DIFF} · ${loadoutName}, ${v.mass} t]`);
  console.log(`  success ${pct(wins)}   global-storm missions won ${globalWins}/${globalRuns}`);
  console.log(`  avg score ${(score / RUNS).toFixed(0)}   avg science ${(sci / RUNS).toFixed(0)}   deaths/run ${(deaths / RUNS).toFixed(2)}   grounded/run ${(grounded / RUNS).toFixed(2)}`);
  console.log('  grades', JSON.stringify(grades));
  console.log('  lost', JSON.stringify(causes));
  if (process.env.BADGES) console.log('  badges', JSON.stringify(badges));
  if (explore) console.log('  loads per round', haul.map(h => (h[0] / h[1]).toFixed(1)).join(' '));
  return wins / RUNS;
}

for (const level of (process.env.LEVELS || 'cadet,commander,veteran').split(',')) {
  DIFF = level;
  LOADOUTS.reference = D.REFERENCE_KITS[level];
  console.log('\n==================== ' + level.toUpperCase() + ' ====================');
  for (const explore of [false, true]) {
    run('Careless player', 'reference', naivePlan, explore);
    run('Sloppy player', 'reference', sloppyPlan, explore);
    run('Thoughtful player', 'reference', smartPlan, explore);
    if (level === 'commander') {
      run('Thoughtful player, solar-only base', 'solarOnly', smartPlan, explore);
      run('Thoughtful player, reactor fortress', 'fortress', smartPlan, explore);
      run('Careless player, rover kit', 'naive', naivePlan, explore);
      run('Sloppy player, rover kit', 'roverKit', sloppyPlan, explore);
      run('Thoughtful player, rover kit', 'roverKit', smartPlan, explore);
    }
  }
}
