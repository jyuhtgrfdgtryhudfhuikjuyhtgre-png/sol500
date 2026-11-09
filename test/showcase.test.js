'use strict';
// The Showcase's cards (src/showcase.js): who comes first, and that each one has its words and a real source.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/showcase.js');
const I = require('../src/i18n.js');

test('the code is the one QA mapped, and there are 12 cards, the first three flare, rover, oxygen', () => {
  assert.equal(C.CODE, 'PAINT-QA-1');
  assert.equal(C.CARDS.length, 12);
  assert.deepEqual(C.CARDS.slice(0, 3).map(c => c.id), ['flare', 'rover', 'oxygen']);
  assert.equal(new Set(C.CARDS.map(c => c.id)).size, 12);
});

test('every card has a name and a purpose in both languages', () => {
  for (const lang of ['en', 'vi']) for (const c of C.CARDS) for (const part of ['name', 'why']) {
    const k = 'show.card.' + c.id + '.' + part;
    assert.ok(I.STR[lang][k], lang + ' ' + k);
    assert.notEqual(I.t(lang, k), k);
  }
  for (const c of C.CARDS) assert.notEqual(I.STR.vi['show.card.' + c.id + '.why'], I.STR.en['show.card.' + c.id + '.why'], c.id + ' is translated');
});

test('a card that names a source names one in I.SOURCES, and a card has a view the game can open', () => {
  for (const c of C.CARDS) {
    assert.ok(c.source === null || I.SOURCES[c.source], c.id + ' source');
    assert.ok(['surface', 'console', 'modal'].includes(c.view), c.id + ' view');
    if (c.view === 'modal') assert.ok(c.modal, c.id + ' names its modal');
  }
});

test('card(id) finds a card, and nothing for an id that is not one', () => {
  assert.equal(C.card('rover').id, 'rover');
  assert.equal(C.card('nope'), undefined);
});
