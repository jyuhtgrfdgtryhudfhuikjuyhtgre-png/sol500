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
  n.on = {};
  n.addEventListener = (type, fn) => { (n.on[type] = n.on[type] || []).push(fn); };
  n.getBoundingClientRect = () => ({ left: 0, top: 0, width: n.clientWidth, height: n.clientHeight });
  n.setAttribute = () => {};
  n.focus = () => {};
  n.setPointerCapture = () => {};
  const ctx = fakeCtx();
  n.getContext = () => ctx;
  return n;
}

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'surface-map.js'), 'utf8');
function setup(seed, opts) {
  const sandbox = { SolWorldgen: W, SolPaint: P, document: { createElement: element, createTextNode: text => ({ text }) } };
  vm.runInNewContext(SOURCE, sandbox);
  const world = SW.create(seed);
  const painter = P.createPainter(world, { canvas, now: () => 0 });
  const map = sandbox.SolMap.create(Object.assign({ t: k => k }, opts));
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

// ---------- relay beacons and pings (M4d) ----------
test("the minimap draws a dashed line for each link of the route home, under the marks, and a relay beacon's mark as a little mast", () => {
  const { map } = setup('MAP-ROUTE');
  const calls = [];
  const ctx = new Proxy({}, { get(t, p) { if (p in t) return t[p]; return (...a) => { calls.push([p, ...a]); }; }, set(t, p, v) { calls.push(['set', p, v]); t[p] = v; return true; } });
  map.minimap.children[0].getContext = () => ctx;
  // you at the HQ: one CSS pixel a tile, the HQ's tile (0, 0) at minimap pixel 80.5
  map.drawMini({ px: 0, py: 0, crew: [], lines: [{ x0: 20.5 * 64, y0: 0.5 * 64, x1: 0.5 * 64, y1: 0.5 * 64, color: '#ffcf7a', dash: [3, 2] }], marks: [{ x: 20.5 * 64, y: 0.5 * 64, color: '#ffcf7a', beacon: true }] }, 1000);
  const dash = calls.findIndex(c => c[0] === 'setLineDash' && c[1].length);
  assert.ok(dash >= 0, 'a dashed line');
  assert.deepEqual(calls.slice(dash + 1).filter(c => c[0] === 'moveTo' || c[0] === 'lineTo').slice(0, 2), [['moveTo', 100.5, 80.5], ['lineTo', 80.5, 80.5]], 'from the beacon 20 tiles east to the HQ');
  const undash = calls.findIndex((c, i) => i > dash && c[0] === 'setLineDash' && !c[1].length);
  assert.ok(undash > dash, 'the dash is reset before the marks');
  const mast = calls.findIndex((c, i) => i > undash && c[0] === 'moveTo' && c[1] === 100.5 && c[2] < 80.5);
  assert.ok(mast > 0, "the beacon's mark: a little mast standing on its spot");
});

const fire = (n, type, e) => { for (const fn of n.on[type] || []) fn(Object.assign({ preventDefault() {} }, e)); };
const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

test('a tap on the minimap pings that spot in world pixels; Enter on the minimap, or its corner button, opens the full map', () => {
  const pinged = [];
  const { map } = setup('MAP-PING', { onPing: (x, y) => pinged.push([x, y]) });
  map.drawMini({ px: 0, py: 0, crew: [] }, 1000); // you at the HQ: the minimap's left edge is 80 tiles west of your tile, its top 80 north
  fire(map.minimap, 'click', { detail: 1, clientX: 100, clientY: 70 });
  assert.deepEqual(pinged, [[20 * 64, -10 * 64]], '20 tiles east of you, 10 north');
  assert.equal(map.isOpen(), false, 'a tap does not open the map');
  fire(map.minimap, 'click', { detail: 0 }); // Enter or Space on the focused minimap: a click with no pointer
  assert.equal(map.isOpen(), true);
  assert.equal(pinged.length, 1);
  map.close();
  fire(map.openBtn, 'click', { detail: 1 });
  assert.equal(map.isOpen(), true, 'the corner button opens it');
});

test('on the full map a click that does not drag pings the spot under it; a drag pans and never pings', () => {
  const pinged = [];
  const { map } = setup('MAP-PING-2', { onPing: (x, y) => pinged.push([x, y]) });
  map.open({ px: 0, py: 0, crew: [] }); // centred on you at the HQ, 3 screen pixels a tile, on a 160 × 160 map
  const fc = map.el.children[0];
  fire(fc, 'pointerdown', { pointerId: 1, clientX: 110, clientY: 50 });
  fire(fc, 'pointerup', { pointerId: 1, clientX: 110, clientY: 50 });
  assert.equal(pinged.length, 1);
  assert.ok(near(pinged[0], [10 * 64, -10 * 64]), '30 screen pixels right of the centre and 30 up: 10 tiles each way, ' + pinged[0]);
  fire(fc, 'pointerdown', { pointerId: 2, clientX: 80, clientY: 80 });
  fire(fc, 'pointermove', { pointerId: 2, clientX: 95, clientY: 80 });
  fire(fc, 'pointerup', { pointerId: 2, clientX: 95, clientY: 80 });
  assert.equal(pinged.length, 1, 'a drag of 15 px: no ping');
});

test('only the primary button pings on the full map: a right or middle click does not', () => {
  const pinged = [];
  const { map } = setup('MAP-PING-4', { onPing: (x, y) => pinged.push([x, y]) });
  map.open({ px: 0, py: 0, crew: [] });
  const fc = map.el.children[0];
  for (const button of [1, 2]) {
    fire(fc, 'pointerdown', { pointerId: 1, clientX: 110, clientY: 50, button });
    fire(fc, 'pointerup', { pointerId: 1, clientX: 110, clientY: 50, button });
  }
  assert.equal(pinged.length, 0, 'the middle and right buttons: no ping');
  fire(fc, 'pointerdown', { pointerId: 1, clientX: 110, clientY: 50, button: 0 });
  fire(fc, 'pointerup', { pointerId: 1, clientX: 110, clientY: 50, button: 0 });
  assert.equal(pinged.length, 1, 'the primary button (a pen or a finger reports 0)');
});

test("the maps draw a ping as a ring in the sender's colour with their name, and a mark's or a line's alpha as its faintness", () => {
  const { map } = setup('MAP-PING-3');
  const calls = [];
  const ctx = new Proxy({}, { get(t, p) { if (p in t) return t[p]; return (...a) => { calls.push([p, ...a]); }; }, set(t, p, v) { calls.push(['set', p, v]); t[p] = v; return true; } });
  map.minimap.children[0].getContext = () => ctx;
  map.drawMini({
    px: 0, py: 0, crew: [],
    lines: [{ x0: 0, y0: 0, x1: 640, y1: 0, color: '#d69cf0', width: 2, dash: [6, 3], alpha: 0.25 }],
    marks: [{ x: 10.5 * 64, y: 0.5 * 64, color: '#d69cf0', ping: true, label: 'kai', alpha: 0.5 }],
  }, 1000);
  const alpha = i => { for (let j = i; j >= 0; j--) if (calls[j][0] === 'set' && calls[j][1] === 'globalAlpha') return calls[j][2]; return 1; };
  const line = calls.findIndex(c => c[0] === 'stroke');
  assert.equal(alpha(line), 0.25, 'the line as faint as its alpha');
  const name = calls.findIndex(c => c[0] === 'fillText' && c[1] === 'kai');
  assert.ok(name > line, "the sender's name");
  assert.deepEqual(calls[name].slice(2), [90.5, 80.5 - 6], 'over the spot, 10 tiles east of you');
  assert.equal(alpha(name), 0.5, 'as faint as the ping');
  assert.ok(calls.some(c => c[0] === 'arc' && c[1] === 90.5 && c[2] === 80.5), 'a ring round the spot');
  const hq = calls.findIndex(c => c[0] === 'fillRect' && c[1] === 80.5 - 3.5);
  assert.ok(hq > name && alpha(hq) === 1, 'the HQ after it, at full strength');
});
