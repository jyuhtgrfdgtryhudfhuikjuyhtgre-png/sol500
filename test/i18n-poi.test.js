'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/i18n.js');
const D = require('../src/data.js');

const LM = Object.keys(D.LANDMARKS.kinds);
const FM = Object.keys(D.FORMATIONS.kinds);

test('every landmark and formation kind maps to a source, and each source has a label and a NASA/JPL url', () => {
  assert.deepEqual(Object.keys(I.LANDMARK_SOURCES).sort(), [...LM].sort());
  assert.deepEqual(Object.keys(I.FORMATION_SOURCES).sort(), [...FM].sort());
  for (const key of [...Object.values(I.LANDMARK_SOURCES), ...Object.values(I.FORMATION_SOURCES)]) {
    const s = I.SOURCES[key];
    assert.ok(s, key + ' is in SOURCES');
    assert.match(s.label, /\S/, key + ' has a label');
    assert.match(s.url, /^https:\/\/(science|www\.jpl)\.nasa\.gov\//, key + ' has a NASA url');
  }
});

test('the 13 new sources are all different from the region ones and from each other', () => {
  const keys = [...Object.values(I.LANDMARK_SOURCES), ...Object.values(I.FORMATION_SOURCES)];
  assert.equal(new Set(keys).size, 13);
  for (const key of keys) assert.ok(!Object.values(I.REGION_SOURCES).includes(key), key + ' is not a region source');
});

test('every landmark and formation has a name and a fact in English and Vietnamese', () => {
  for (const [pre, kinds] of [['lm', LM], ['fm', FM]]) {
    for (const id of kinds) {
      for (const lang of ['en', 'vi']) {
        for (const part of ['name', 'fact']) {
          const v = I.STR[lang][`${pre}.${id}.${part}`];
          assert.ok(typeof v === 'string' && v.length > 0, `${pre}.${id}.${part} (${lang})`);
        }
      }
      assert.equal(D[pre === 'lm' ? 'LANDMARKS' : 'FORMATIONS'].kinds[id].fact, `${pre}.${id}`, 'the data names the key stem');
    }
  }
});

test('facts keep the exact text of sources.md: apostrophes, quotes, diacritics and number formats', () => {
  const en = I.STR.en, vi = I.STR.vi;
  assert.ok(en['lm.tube.fact'].startsWith("Like the flanks of Arsia Mons, where a lava tube's ceiling collapsed"));
  assert.ok(en['fm.hoodoo.fact'].includes("NASA's Mars Reconnaissance Orbiter often sees river channels"));
  assert.ok(en['fm.ventifact.fact'].includes('"'), 'the ventifact fact has straight double quotes');
  assert.ok(en['fm.yardang.fact'].includes('5,000 km') && vi['fm.yardang.fact'].includes('5.000 km'));
  assert.ok(en['fm.layered.fact'].includes('3.6 m') && vi['fm.layered.fact'].includes('3,6 m'));
  assert.equal(vi['lm.delta.name'], 'Châu thổ sông cổ');
  assert.equal(vi['fm.hoodoo.name'], 'Cột đá hoodoo');
  assert.ok(vi['lm.stardune.fact'].startsWith('Cồn cát hình sao hình thành khi gió cuốn cát'));
});

test('every Kestrel structure has a name and a log in both languages, and the log label says it is fiction', () => {
  for (const [kind, def] of Object.entries(D.STRUCTURES.kinds)) {
    assert.equal(def.log, `ks.${kind}`, 'the data names the key stem');
    for (const lang of ['en', 'vi']) {
      for (const part of ['name', 'log']) {
        const v = I.STR[lang][`ks.${kind}.${part}`];
        assert.ok(typeof v === 'string' && v.length > 0, `ks.${kind}.${part} (${lang})`);
      }
      assert.match(I.STR[lang]['ks.' + kind + '.log'], /^Sol \d+\./, 'a log opens with its sol');
    }
  }
  assert.equal(I.STR.en['ks.label'], 'Kestrel Survey log · story, fictional');
  assert.equal(I.STR.vi['ks.label'], 'Nhật ký Khảo sát Kestrel · truyện hư cấu');
});

test('Kestrel logs keep their quotes, apostrophes and the subscript in O₂', () => {
  assert.ok(I.STR.en['ks.cache.log'].includes('O₂ canisters') && I.STR.vi['ks.cache.log'].includes('bình O₂'));
  assert.ok(I.STR.en['ks.cache.log'].includes('Kestrel Control: "Nice work.'));
  assert.ok(I.STR.en['ks.array.log'].includes("'"), 'the array log has an apostrophe');
  assert.ok(I.STR.en['ks.array.log'].includes('52 %') && I.STR.vi['ks.array.log'].includes('52 %'));
});

test('every survey subject the world can produce has a label in both languages', () => {
  // worldgen: region science finds (SCIENCE_SUBS), a landmark's science site (its kind, 'vent' for the methane vent)
  // and a formation's science site (its kind).
  const subs = new Set(['delta', 'vent', 'meteorite', 'layered']);
  for (const [kind, def] of Object.entries(D.LANDMARKS.kinds)) if (def.sites.includes('science')) subs.add(kind === 'methane' ? 'vent' : kind);
  for (const kind of FM) subs.add(kind);
  for (const lang of ['en', 'vi']) {
    for (const sub of subs) assert.ok(I.STR[lang]['sci.' + sub], `sci.${sub} (${lang})`);
  }
  assert.ok(subs.has('crater') && subs.has('deviltracks'), 'the new subjects are among them');
});
