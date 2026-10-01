'use strict';
// Shared by the history and admin tests: a real mission played to the end with the engine's default plan.
const E = require('../../src/engine.js');

function finishedMission(seed = 'TEST-1', difficulty = 'commander', crewSize = 4) {
  let s = E.createMission({ seed, loadout: E.referenceKit(difficulty, crewSize), difficulty, crewSize });
  let plan = E.defaultPlan(s);
  while (s.status === 'active') {
    const r = E.resolveTurn(s, plan);
    s = r.state;
    plan = E.nextPlan(s, plan);
  }
  return s;
}

module.exports = { finishedMission };
