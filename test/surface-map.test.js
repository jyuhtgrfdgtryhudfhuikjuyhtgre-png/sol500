'use strict';
// The minimap and the full map (src/surface-map.js) in a fake DOM: its keys, what the minimap builds, and the legend's colours.
// The file is a browser script (no exports), so it runs in a vm sandbox that has the same globals the page gives it.
// What the pixels look like on a real canvas is checked in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = require('../src/worldgen.js');
const SW = require('../src/surface-world.js');
const P = require('../src/surface-paint.js');

// A 2D context that accepts every call; the last image put on it is kept in sink.img.
function fakeCtx(sink) {
  return new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (p === 'putImageData') return img => { if (sink) sink.img = img; };
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const canvas = (w, h) => { const sink = {}; const ctx = fakeCtx(sink); return { width: w, height: h, sink, getContext: () => ctx }; };

function element() {
  const n = { children: [], style: {}, hidden: false, className: '', textContent: '', clientWidth: 160, clientHeight: 160, width: 0, height: 0 };
  n.appendChild = c => { n.children.push(c); return c; };
  n.append = (...cs) => { n.children.push(...cs); };
  n.addEventListener = () => {};
  n.setAttribute = () => {};
  n.focus = () => {};
  n.setPointerCapture = () => {};
  const ctx = fakeCtx();
  n.getContext = () => ctx;
  return n;
}

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'surface-map.js'), 'utf8');
function setup(seed) {
  const sandbox = { SolWorldgen: W, SolPaint: P, document: { createElement: element, createTextNode: text => ({ text }) } };
  vm.runInNewContext(SOURCE, sandbox);
  const world = SW.create(seed);
  const painter = P.createPainter(world, { canvas, now: () => 0 });
  const map = sandbox.SolMap.create({ t: k => k });
  map.attach(world, painter);
  return { world, painter, map };
}

test('holding M does not close the full map again; a fresh M press or Escape does', () => {
  const { map } = setup('MAP-KEYS');
  map.open({ px: 0, py: 0, crew: [] });
  assert.equal(map.isOpen(), true);
  map.key({ code: 'KeyM', repeat: true }); // a held key repeats keydown about every 30 ms after half a second
  map.key({ code: 'KeyM', repeat: true });
  assert.equal(map.isOpen(), true, 'still open while M is held');
  assert.equal(map.key({ code: 'KeyM', repeat: false }), true);
  assert.equal(map.isOpen(), false, 'a new press closes it');
  map.open({ px: 0, py: 0, crew: [] });
  assert.equal(map.key({ code: 'Escape' }), true);
  assert.equal(map.isOpen(), false);
});

test('the minimap builds the explored chunks at its edge that have no live data, without the full map being opened', () => {
  const { world, painter, map } = setup('MAP-EDGE');
  world.reveal(-3 * 32 + 5, 5, 2); // fog from a teammate, three chunks west of the base: past the two chunks that stay live
  assert.equal(painter.mini(-3, 0), null, 'not built yet');
  map.drawMini({ px: 0, py: 0, crew: [] }, 1000);
  assert.ok(painter.mini(-3, 0), 'drawn by the minimap itself');
  assert.equal(painter.stats().miniQueue, 0);
});

// The usual ground of each region, as worldgen.ground() lays it out: what covers most of the region on the map.
const MAIN = [W.TILE.REGOLITH, W.TILE.DUNE, W.TILE.REGOLITH, W.TILE.REGOLITH, W.TILE.POLYGON, W.TILE.LAVA];

test("the legend's swatches are the colours the minimap paints for each region's usual ground", () => {
  const { world, painter, map } = setup('MAP-LEGEND');
  map.relabel();
  const head = map.el.children[1], legend = head.children[1];
  assert.equal(legend.children.length, W.REGIONS.length);
  const rgb = c => (c[0] === '#' ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).map(Number));
  // find a tile of each region's usual ground, explore it, and read the pixel the minimap's image has for it
  const spot = [];
  for (let y = -2400; y <= 2400 && spot.filter(Boolean).length < W.REGIONS.length; y += 32) {
    for (let x = -2400; x <= 2400; x += 32) {
      const r = W.regionAt(world.seed, x, y);
      if (!spot[r] && world.region(x, y) === r && world.tile(x, y) === MAIN[r]) spot[r] = [x, y];
    }
  }
  assert.equal(spot.filter(Boolean).length, W.REGIONS.length, 'every region has its usual ground somewhere near the base');
  W.REGIONS.forEach((id, r) => {
    const [x, y] = spot[r], cx = SW.chunkOf(x), cy = SW.chunkOf(y), lx = x - cx * 32, ly = y - cy * 32;
    world.get(cx, cy);
    world.reveal(x, y, 0);
    const img = painter.mini(cx, cy).sink.img.data, o = (ly * 32 + lx) * 4;
    const painted = [img[o], img[o + 1], img[o + 2]];
    assert.deepEqual(painted, rgb(legend.children[r].children[0].style.background), id + ': the swatch is the colour on the map');
  });
});

// ---------- the points of interest (M4c) ----------

test("the maps mark the landmarks discovered, the structures used or repaired, and a mast's '?' on what is not marked already", () => {
  const sandbox = { SolWorldgen: W, SolPaint: P, document: { createElement: element } };
  vm.runInNewContext(SOURCE, sandbox);
  const seed = W.seedOf('MAP-POI');
  let l = null, s = null;
  for (let j = -2; j < 2 && !l; j++) for (let i = -2; i < 2 && !l; i++) l = W.landmarkAt(seed, i, j);
  for (let j = -3; j < 3 && !s; j++) for (let i = -3; i < 3 && !s; i++) s = W.structureAt(seed, i, j);
  assert.ok(l && s, 'a landmark and a structure near the base');
  const x = { landmarks: { [l.id]: { by: 'minh', round: 3 } }, structures: { [s.id]: 'repaired' } };
  const masts = [{ id: l.id, x: l.x, y: l.y, kind: l.kind }, { id: 'S9,9', x: 600, y: 610, kind: 'cache' }];
  const b = s.box;
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.SolMap.poiMarks(seed, x, masts))), [
    { x: (l.x + 0.5) * 64, y: (l.y + 0.5) * 64, color: '#f0c35a', diamond: true, ring: '#120a0c' },
    { x: (b[0] + b[2] + 1) * 32, y: (b[1] + b[3] + 1) * 32, color: '#a9f4e4', square: true },
    { x: 600.5 * 64, y: 610.5 * 64, color: '#a9f4e4', text: '?' }, // the discovered landmark has its diamond, not a "?"
  ]);
  assert.deepEqual(sandbox.SolMap.poiMarks(seed, {}, undefined).length, 0, 'nothing before the rules have any');
});

test("the minimap draws a landmark's diamond and a mast's '?' where their marks are", () => {
  const { map } = setup('MAP-DRAW');
  const calls = [];
  const ctx = new Proxy({}, { get(t, p) { if (p in t) return t[p]; return (...a) => { calls.push([p, ...a]); }; }, set(t, p, v) { t[p] = v; return true; } });
  map.minimap.children[0].getContext = () => ctx;
  // you at the HQ: the minimap's left edge is 80 tiles west of you, its top 80 tiles north (one CSS pixel a tile)
  map.drawMini({ px: 0, py: 0, crew: [], marks: [{ x: 640, y: 0, color: '#f0c35a', diamond: true, ring: '#120a0c' }, { x: -640, y: 0, color: '#a9f4e4', text: '?' }] }, 1000);
  const at = calls.findIndex(c => c[0] === 'moveTo' && c[1] === 90 && c[2] === 76);
  assert.deepEqual(calls.slice(at, at + 6), [['moveTo', 90, 76], ['lineTo', 94, 80], ['lineTo', 90, 84], ['lineTo', 86, 80], ['closePath'], ['fill']]);
  assert.ok(calls.some(c => c[0] === 'fillText' && c[1] === '?' && c[2] === 70 && c[3] === 80), 'the "?" 10 tiles west of you');
});
