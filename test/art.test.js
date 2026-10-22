'use strict';
// The sprites of the map's points of interest (src/art.js): the Kestrel Survey's structures, the natural formations and the
// landmark props. The file is a browser script, so it runs in a vm sandbox. What they look like is checked in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'art.js'), 'utf8'), sandbox);
const A = sandbox.SolArt;

const KESTREL = ['cache', 'wreck', 'weather', 'mast', 'pod', 'array'];
const FORMATIONS = ['arch', 'yardang', 'hoodoo', 'balanced', 'ventifact', 'layered', 'deviltracks'];
const PROPS = ['skylight', 'vent'];

// One <svg> with a square viewBox and aria-hidden, every attribute quoted, every tag closed in order, no text,
// nothing like NaN or undefined leaking out of a computed number, and small: under 3 KB.
function wellFormed(svg, size) {
  assert.match(svg, new RegExp(`^<svg width="${size}" height="${size}" viewBox="0 0 (\\d+) \\1" aria-hidden="true">`));
  assert.ok(svg.endsWith('</svg>'));
  assert.doesNotMatch(svg, /NaN|undefined|null|Infinity|\[object/);
  const open = [];
  for (const [tag, close, name, attrs, self] of svg.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    assert.match(attrs, /^(\s+[a-zA-Z:-]+="[^"<>]*")*\s*$/, 'the attributes of ' + tag);
    if (close) assert.equal(open.pop(), name, 'closes ' + name);
    else if (!self) open.push(name);
  }
  assert.deepEqual(open, [], 'every tag is closed');
  assert.equal(svg.replace(/<[^>]*>/g, '').trim(), '', 'no text');
  assert.ok(svg.length < 3072, `${svg.length} characters: under 3 KB`);
}
const distinct = list => new Set(list).size === list.length;

test('every Kestrel structure in both states, and both layers of the hab pod, is a well-formed square SVG under 3 KB', () => {
  for (const id of KESTREL) for (const done of [false, true]) wellFormed(A.kestrel(id, 128, { done }), 128);
  for (const inside of [false, true]) wellFormed(A.kestrel('pod', 96, { inside }), 96);
});

test('each state has its own look: used or repaired differs from before, and the pod\'s floor differs from its roof', () => {
  for (const id of KESTREL.filter(k => k !== 'pod')) assert.notEqual(A.kestrel(id, 64, { done: true }), A.kestrel(id, 64), id);
  assert.notEqual(A.kestrel('pod', 64, { inside: true }), A.kestrel('pod', 64));
});

test('every formation and prop is a well-formed square SVG under 3 KB, and so is the vent\'s puff at any phase', () => {
  for (const id of FORMATIONS) wellFormed(A.formation(id, 128), 128);
  for (const id of PROPS) wellFormed(A.prop(id, 192), 192);
  for (const phase of [0, 0.25, 0.5, 1, -3, 7, NaN, undefined]) wellFormed(A.ventPuff(phase, 64), 64);
});

test('the dust-devil tracks lie flat on the ground, and each track ends inside its square, so none is cut off at the edge', () => {
  const svg = A.formation('deviltracks', 64);
  assert.doesNotMatch(svg, /<ellipse/, 'no drop shadow: nothing stands up');
  const tracks = [...svg.matchAll(/<path d="([^"]*)" stroke-width="([\d.]+)"\/>/g)];
  assert.ok(tracks.length > 0 && tracks.length === svg.split('<path').length - 1, 'every path is a track with its own width');
  for (const [, d, width] of tracks) {
    // only absolute moves and curves, so every number is a point the track runs through or bends towards, and the track
    // stays among them: points half its width and a pixel from the edge keep the whole track inside
    assert.match(d, /^M[\d. ]+(C[\d. ]+)+$/, d);
    const m = Number(width) / 2 + 1;
    for (const n of d.match(/[\d.]+/g).map(Number)) assert.ok(n >= m && n <= 64 - m, `${d}: ${n} is within ${m} of the edge`);
  }
});

test('the vent\'s puff moves with the phase and comes back to the same drawing every whole turn, so its loop never jumps', () => {
  assert.notEqual(A.ventPuff(0.2, 64), A.ventPuff(0.7, 64));
  assert.equal(A.ventPuff(1, 64), A.ventPuff(0, 64));
  assert.equal(A.ventPuff(2.25, 64), A.ventPuff(0.25, 64));
  assert.equal(A.ventPuff(-0.25, 64), A.ventPuff(0.75, 64), 'a phase below 0 counts back from the end of the turn');
  // a wisp is born and dies unseen, so just before a turn ends you see what phase 0 shows
  const seen = svg => svg.match(/<circle[^>]*opacity="0\.(0[1-9]|[1-9]\d)"\/>/g);
  assert.deepEqual(seen(A.ventPuff(0.99999, 64)), seen(A.ventPuff(0, 64)), 'the wisps you see just before a whole turn');
});

test('every id has a drawing of its own, and an unknown id falls back to a known one, as moduleInner does', () => {
  assert.ok(distinct(KESTREL.map(id => A.kestrel(id, 64))), 'structures');
  assert.ok(distinct(FORMATIONS.map(id => A.formation(id, 64))), 'formations');
  assert.ok(distinct(PROPS.map(id => A.prop(id, 64))), 'props');
  for (const id of ['<b>nope</b>', 'constructor', '__proto__']) {
    assert.equal(A.kestrel(id, 64), A.kestrel('cache', 64), id);
    assert.equal(A.formation(id, 64), A.formation('ventifact', 64), id);
    assert.equal(A.prop(id, 64), A.prop('vent', 64), id);
  }
});

test('only numbers reach the markup: a size that is not a number gives the default size', () => {
  for (const svg of [A.kestrel('cache', '"><script>x</script>'), A.kestrel('pod', {}, { inside: true }), A.formation('arch', '"/>'),
    A.prop('vent', {}), A.ventPuff(0.5, 'x')]) {
    assert.doesNotMatch(svg, /script/);
    wellFormed(svg, 64);
  }
});
