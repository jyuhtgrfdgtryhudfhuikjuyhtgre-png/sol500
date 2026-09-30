#!/usr/bin/env node
// Plays many seeded missions with scripted strategies and prints success rates,
// abort causes and scores. Usage: node tools/balance.js [runs]
'use strict';
const E = require('../src/engine.js');
const D = require('../src/data.js');

const RUNS = Number(process.argv[2]) || 1000;

const LOADOUTS = {
  naive: { solar: 5, battery: 1, recycler: 1, lab: 1, rover: 1, food: 8, o2: 6, water: 4 },
  recommended: D.RECOMMENDED,
  solarOnly: { solar: 7, battery: 4, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, lab: 1, spares: 4, food: 6, o2: 3, water: 3 },
  fortress: { solar: 2, battery: 1, reactor: 2, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, spares: 3, food: 6, o2: 3, water: 2 },
};

function remainingTurns(s) { return D.TURNS - s.turn; }

// Careless: all science, never maintain, ignore warnings.
function naivePlan(s) {
  const p = E.defaultPlan(s);
  for (const c of s.crew) p.jobs[c.id] = c.role === 'geologist' ? 'eva' : 'science';
  p.choices.spe = 'work';
  p.choices.leak = 'ignore';
  return p;
}

// Thoughtful: reads the forecast and manages margins.
function smartPlan(s) {
  const p = E.defaultPlan(s);
  const byRole = r => s.crew.find(c => c.role === r);
  p.jobs[byRole('engineer').id] = 'maintenance';
  p.jobs[byRole('botanist').id] = s.modules.greenhouse.count ? 'farming' : 'construction';
  const geo = byRole('geologist');
  p.jobs[geo.id] = s.berm < 0.2 ? 'construction' : 'eva';
  p.jobs[byRole('physician').id] = 'science';
  p.choices.spe = 'shelter';
  p.choices.leak = s.resources.spares > 1 ? 'patch' : 'ignore';
  p.choices.perchlorate = 'wash';
  p.choices.conflict = 'meeting';
  p.choices.discovery = 'traverse';

  // Protect anyone whose dose is on track to exceed the budget.
  let f = E.forecast(s, p);
  for (const c of s.crew) {
    const rc = f.crew.find(x => x.id === c.id);
    const projected = c.dose + rc.doseDelta * remainingTurns(s);
    if (projected > D.DOSE_LIMIT * 0.95 && D.JOBS[p.jobs[c.id]].outdoor > 0) p.jobs[c.id] = 'science';
    if (c.health < 40) p.jobs[c.id] = 'rest';
  }
  const geoProj = geo.dose + (f.crew.find(x => x.id === geo.id).doseDelta + D.DISCOVERY.dose) * remainingTurns(s);
  if (geoProj > D.DOSE_LIMIT * 0.9) p.choices.discovery = 'log';
  const criticalBroken = ['hab', 'recycler', 'oxygen', 'reactor'].some(t => s.modules[t].broken > 0);
  if (criticalBroken && s.resources.spares === 0) {
    const victim = ['rover', 'lab', 'icedrill', 'solar'].find(t => s.modules[t].count > 0);
    if (victim) p.scrap = [victim];
  }
  f = E.forecast(s, p);
  if (f.power.habShort) p.habMode = 'austerity';
  if (f.runway.food < remainingTurns(s) * D.TURN_SOLS) p.rations = 'reduced';
  return p;
}

// Decent but imperfect: good job split, shelters from flares, but never builds
// shielding, never scraps parts and never changes power mode or rations.
function sloppyPlan(s) {
  const p = E.defaultPlan(s);
  const byRole = r => s.crew.find(c => c.role === r);
  p.jobs[byRole('engineer').id] = 'maintenance';
  p.jobs[byRole('botanist').id] = s.modules.greenhouse.count ? 'farming' : 'science';
  p.jobs[byRole('geologist').id] = 'eva';
  p.jobs[byRole('physician').id] = 'science';
  p.choices.spe = 'shelter';
  p.choices.discovery = 'traverse';
  // Reacts only when a dose bar turns red.
  for (const c of s.crew) {
    if (c.dose > D.DOSE_LIMIT * 0.85 && D.JOBS[p.jobs[c.id]].outdoor > 0) p.jobs[c.id] = 'science';
  }
  if (s.crew.some(c => c.dose > D.DOSE_LIMIT * 0.85)) p.choices.discovery = 'log';
  return p;
}

function play(loadoutName, planner, seed) {
  let s = E.createMission({ seed, loadout: LOADOUTS[loadoutName] });
  while (s.status === 'active') s = E.resolveTurn(s, planner(s)).state;
  return s;
}

function run(label, loadoutName, planner) {
  const v = E.validateLoadout(LOADOUTS[loadoutName]);
  if (!v.ok) throw new Error(label + ': ' + v.errors.join(','));
  let wins = 0, score = 0, sci = 0;
  const causes = {}, grades = {};
  let globalWins = 0, globalRuns = 0;
  for (let i = 0; i < RUNS; i++) {
    const s = play(loadoutName, planner, 'BAL-' + i);
    const sc = E.scoreMission(s);
    const hadGlobal = s.schedule.some(t => t.weather === 'global');
    if (hadGlobal) globalRuns++;
    if (s.status === 'success') { wins++; if (hadGlobal) globalWins++; }
    else {
      const k = s.abortCause.type + (s.abortCause.reason ? ':' + s.abortCause.reason : '');
      causes[k] = (causes[k] || 0) + 1;
    }
    grades[sc.grade] = (grades[sc.grade] || 0) + 1;
    score += sc.total;
    sci += s.science;
  }
  const pct = x => (100 * x / RUNS).toFixed(1) + '%';
  console.log(`\n${label}  [${loadoutName}, ${v.mass} t]`);
  console.log(`  success ${pct(wins)}   global-storm missions won ${globalWins}/${globalRuns}`);
  console.log(`  avg score ${(score / RUNS).toFixed(0)}   avg science ${(sci / RUNS).toFixed(0)}`);
  console.log('  grades', JSON.stringify(grades));
  console.log('  aborts', JSON.stringify(causes));
  return wins / RUNS;
}

run('Careless player', 'naive', naivePlan);
run('Thoughtful player, recommended kit', 'recommended', smartPlan);
run('Thoughtful player, solar-only base', 'solarOnly', smartPlan);
run('Thoughtful player, reactor fortress', 'fortress', smartPlan);
run('Careless play, recommended kit', 'recommended', naivePlan);
run('Sloppy player, recommended kit', 'recommended', sloppyPlan);
