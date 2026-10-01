'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/i18n.js');

test('every English string has a Vietnamese twin and the other way round', () => {
  const en = Object.keys(I.STR.en);
  const vi = Object.keys(I.STR.vi);
  assert.deepEqual(en.filter(k => !(k in I.STR.vi)), [], 'missing in Vietnamese');
  assert.deepEqual(vi.filter(k => !(k in I.STR.en)), [], 'missing in English');
});
