#!/usr/bin/env node
// Launches the desktop app in check mode and prints what it saw.
//   node tools/app-smoke.js [--exe "C:\path\SOL 500.exe"] [--shot out.png] [--online] [--stay 60]
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = name => {
  const i = args.indexOf('--' + name);
  if (i < 0) return null;
  return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const out = path.join(os.tmpdir(), 'sol500-smoke-' + process.pid + '.json');
// An empty profile of its own: the app's userData holds the player's saved game and the server's data folder.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-smoke-profile-'));
const exe = opt('exe');
const env = Object.assign({}, process.env, { SOL_SMOKE: '1', SOL_SMOKE_OUT: out });
if (opt('shot')) env.SOL_SMOKE_SHOT = path.resolve(String(opt('shot')));
if (opt('online')) env.SOL_SMOKE_ONLINE = '1';
if (opt('stay')) env.SOL_SMOKE_STAY = String(opt('stay'));
console.log('SOL_SMOKE_OUT ' + out);
const child = exe
  ? spawn(String(exe), ['--user-data-dir=' + profile], { env, stdio: 'inherit' })
  : spawn(require('electron'), [path.join(__dirname, '..'), '--user-data-dir=' + profile], { env, stdio: 'inherit' });
child.on('exit', () => {
  let result = null;
  try { result = JSON.parse(fs.readFileSync(out, 'utf8')); fs.unlinkSync(out); } catch (e) { /* the app wrote nothing */ }
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch (e) { /* a helper still holds a file: left in the temp folder */ }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result && result.ok ? 0 : 1);
});
