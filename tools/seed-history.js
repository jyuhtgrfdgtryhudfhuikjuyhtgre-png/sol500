#!/usr/bin/env node
// Fills a data folder with finished missions so the admin panel has something to show: every record is a real game
// played by the engine (default plan, different seeds and settings), spread over the past days.
//   node tools/seed-history.js --dir data-demo [--n 40]
'use strict';
const path = require('node:path');
const D = require('../src/data.js');
const E = require('../src/engine.js');
const { createHistory, summarize } = require('../lib/history.js');

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const dir = path.resolve(arg('dir', 'data-demo'));
const n = Math.max(1, Math.min(2000, Number(arg('n', 40)) || 40));
const NAMES = ['Linh', 'Bảo', 'Nguyễn Thị Ánh', 'Diego', 'Amara', '<b>Kai</b>', 'Minh', '=SUM(A1)'];
const MODES = ['solo', 'lan', 'online'];
const history = createHistory({ dataDir: dir });
const diffs = Object.keys(D.DIFFICULTY);

for (let i = 0; i < n; i++) {
  const difficulty = diffs[i % diffs.length];
  const crewSize = D.CREW_SIZES[i % D.CREW_SIZES.length];
  let s = E.createMission({ seed: 'DEMO-' + (1000 + i), loadout: E.referenceKit(difficulty, crewSize), difficulty, crewSize });
  let plan = E.defaultPlan(s);
  while (s.status === 'active') { const r = E.resolveTurn(s, plan); s = r.state; plan = E.nextPlan(s, plan); }
  const mode = MODES[i % MODES.length];
  const seats = mode === 'solo' ? 1 : 2 + (i % 3);
  const players = s.crew.slice(0, seats).map((c, k) => ({ name: NAMES[(i + k) % NAMES.length], crewId: mode === 'solo' ? null : c.id }));
  const rec = summarize(s, { mode, players });
  rec.endedAt = new Date(Date.now() - (n - i) * 3 * 3600 * 1000).toISOString();
  history.add(rec);
}
console.log(`${n} missions written to ${path.join(dir, 'history.json')}`);
