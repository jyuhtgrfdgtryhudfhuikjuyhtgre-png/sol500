'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { clampSize } = require('../app/size.js');
const I = require('../src/i18n.js');

test('the saved window size is clamped to at least 960 x 600', () => {
  assert.deepEqual(clampSize({ width: 300, height: 200 }), { width: 960, height: 600 });
  assert.deepEqual(clampSize({ width: 1400, height: 900 }), { width: 1400, height: 900 });
  for (const bad of [null, undefined, {}, { width: 'x', height: NaN }, 'junk']) {
    assert.deepEqual(clampSize(bad), { width: 1280, height: 800 }, String(bad));
  }
  assert.deepEqual(clampSize({ width: Infinity, height: -5 }), { width: 1280, height: 600 });
  assert.deepEqual(clampSize({ width: 100000, height: 100000 }), { width: 8192, height: 8192 }, 'and not absurdly large');
});

test('the app has no menu, so Ctrl+R and Ctrl+Shift+I do nothing, and the build names its icon, publisher and copyright', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'app', 'main.js'), 'utf8');
  assert.match(main, /Menu\.setApplicationMenu\(null\)/);
  const pkg = require('../package.json');
  assert.equal(pkg.build.win.icon, 'icons/icon.ico');
  assert.equal(pkg.build.win.publisherName, pkg.author);
  assert.ok(pkg.build.copyright.includes(pkg.author));
  const ico = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'an .ico');
  const sizes = [];
  for (let i = 0; i < ico.readUInt16LE(4); i++) sizes.push(ico[6 + i * 16] || 256);
  assert.deepEqual(sizes, [16, 32, 48, 64, 128, 256]);
});

test('the start-failure box has words in both languages', () => {
  for (const lang of ['en', 'vi']) assert.match(I.t(lang, 'app.startFail', { why: 'X' }), /X/);
  assert.notEqual(I.t('en', 'app.startFail', { why: 'X' }), I.t('vi', 'app.startFail', { why: 'X' }));
});

test('a failed checksum and a failed copy have their own words in both languages', () => {
  for (const lang of ['en', 'vi']) {
    for (const k of ['online.errorHash', 'online.copyFailed']) assert.ok(I.has(lang, k), lang + ' ' + k);
    assert.notEqual(I.t(lang, 'online.errorHash'), I.t(lang, 'online.error'));
  }
});

test('help names SmartScreen, the Firewall prompt and the install folder in both languages', () => {
  for (const lang of ['en', 'vi']) {
    const s = I.t(lang, 'help.win');
    assert.match(s, /SmartScreen/);
    assert.match(s, /Firewall/);
    assert.ok(s.includes('%LOCALAPPDATA%\\Programs\\sol500'), lang);
  }
  assert.match(I.t('en', 'help.win'), /Run anyway/);
});
