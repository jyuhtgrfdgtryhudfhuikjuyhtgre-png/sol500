'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseChecklist, parseTap, parseGitLog, lineCount } = require('../tools/progress.js');

test('the spec checklist becomes milestones and features', () => {
  const md = ['# Spec', '## 11. Milestones', '- [ ] not this one', '## 12. Feature checklist', '', '### M1 — App + online',
    '- [x] Desktop app', '- [X] Installer builds', '### M2 — Admin panel', '- [ ] History tab with totals, charts, table, CSV', '',
    '## 13. Refinements', '- [ ] not this either'].join('\r\n');
  assert.deepEqual(parseChecklist(md), {
    milestones: [{ id: 'M1', title: 'App + online' }, { id: 'M2', title: 'Admin panel' }],
    features: [
      { milestone: 'M1', text: 'Desktop app', done: true }, { milestone: 'M1', text: 'Installer builds', done: true },
      { milestone: 'M2', text: 'History tab with totals, charts, table, CSV', done: false },
    ],
  });
});

test('the real spec has a checklist for every milestone and M1 is all done', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', 'docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md'), 'utf8');
  const { milestones, features } = parseChecklist(md);
  assert.deepEqual(milestones.map(m => m.id), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
  assert.ok(features.filter(f => f.milestone === 'M1').every(f => f.done));
  assert.ok(features.length >= 30);
});

test('test counts come from the TAP summary', () => {
  const tap = 'TAP version 13\n# Subtest: a\nok 1 - a\n1..120\n# tests 120\n# suites 0\n# pass 118\n# fail 2\n# cancelled 0\n';
  assert.deepEqual(parseTap(tap), { total: 120, pass: 118, fail: 2 });
  assert.deepEqual(parseTap(''), { total: null, pass: null, fail: null }, 'tests that could not run read n/a, not 0');
});

test('commits keep tabs inside their subject', () => {
  assert.deepEqual(parseGitLog('abc1234\t2026-10-01\tfeat: admin\tpanel\n\n'), [{ hash: 'abc1234', date: '2026-10-01', subject: 'feat: admin\tpanel' }]);
});

test('line counts ignore a final newline', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-progress-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'a.js'), 'a\nb\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'a\nb');
  assert.equal(lineCount(path.join(dir, 'a.js')), 2);
  assert.equal(lineCount(path.join(dir, 'b.js')), 2);
  assert.equal(lineCount(path.join(dir, 'missing.js')), 0);
});
