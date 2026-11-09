#!/usr/bin/env node
// Writes progress.json for the admin panel's Project tab: the spec's feature checklist, test results, recent commits,
// code size and the science sources. `npm run progress`; `npm run app` runs it first so the app ships a snapshot.
//   node tools/progress.js [--out path/to/progress.json]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SPEC = 'docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md';
const CODE = /\.(js|css|html)$/;

// "## 12. Feature checklist": "### M2 — Admin panel" headings, then "- [ ] text" / "- [x] text" lines.
function parseChecklist(md) {
  const milestones = [];
  const features = [];
  let inList = false;
  let current = null;
  for (const line of md.split(/\r?\n/)) {
    if (/^## 12\./.test(line)) { inList = true; continue; }
    if (inList && /^## /.test(line)) break;
    if (!inList) continue;
    const head = line.match(/^### (M\d+)\s*[—-]\s*(.+)$/);
    if (head) { current = head[1]; milestones.push({ id: head[1], title: head[2].trim() }); continue; }
    const item = line.match(/^- \[( |x|X)\] (.+)$/);
    if (item && current) features.push({ milestone: current, text: item[2].trim(), done: item[1] !== ' ' });
  }
  return { milestones, features };
}

// node --test --test-reporter=tap ends with "# tests 107", "# pass 107", "# fail 0". When the tests could not run there is no
// summary, and every count is null (the Project tab reads that as "n/a", not as 0 tests).
function parseTap(text) {
  const num = k => { const m = String(text).match(new RegExp('^# ' + k + ' (\\d+)', 'm')); return m ? Number(m[1]) : null; };
  return { total: num('tests'), pass: num('pass'), fail: num('fail') };
}

// git log --format=%h%x09%cs%x09%s
function parseGitLog(text) {
  return String(text).split('\n').filter(Boolean).map(line => {
    const [hash, date, ...rest] = line.split('\t');
    return { hash, date, subject: rest.join('\t') };
  });
}

function lineCount(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return 0; }
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

// Failing tests make `node --test` exit non-zero, but its output still has the counts we want.
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: 300000 });
  return r.error ? '' : r.stdout || '';
}

function build() {
  const { milestones, features } = parseChecklist(fs.readFileSync(path.join(ROOT, SPEC), 'utf8'));
  const tests = parseTap(run(process.execPath, ['--test', '--test-reporter=tap']));
  const count = Number(run('git', ['rev-list', '--count', 'HEAD']).trim()) || 0;
  const recent = parseGitLog(run('git', ['log', '-10', '--format=%h%x09%cs%x09%s']));
  const files = run('git', ['ls-files']).split('\n').filter(f => CODE.test(f) && !f.startsWith('dist/'))
    .map(f => ({ path: f, lines: lineCount(path.join(ROOT, f)) })).sort((a, b) => b.lines - a.lines);
  const I = require('../src/i18n.js');
  return {
    generatedAt: new Date().toISOString(),
    milestones, features, tests,
    commits: { count, recent },
    code: { files, total: files.reduce((n, f) => n + f.lines, 0) },
    sources: Object.values(I.SOURCES).map(s => ({ label: s.label, url: s.url })),
  };
}

if (require.main === module) {
  const at = process.argv.indexOf('--out');
  const out = at > 0 && process.argv[at + 1] ? path.resolve(process.argv[at + 1]) : path.join(ROOT, 'progress.json');
  const p = build();
  fs.writeFileSync(out, JSON.stringify(p, null, 2));
  const done = p.features.filter(f => f.done).length;
  console.log(`progress.json: ${done}/${p.features.length} features · tests ${p.tests.pass}/${p.tests.total} · ${p.commits.count} commits · ${p.code.total} lines`);
}

module.exports = { parseChecklist, parseTap, parseGitLog, lineCount };
