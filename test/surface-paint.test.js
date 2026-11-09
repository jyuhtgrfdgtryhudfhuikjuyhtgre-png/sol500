'use strict';
// The painter's cache rules (src/surface-paint.js), run against a fake canvas: what is queued, kept, deleted and capped.
// What the pixels look like is checked in the browser (Task 11), including that a repainted chunk hashes the same.
const test = require('node:test');
const assert = require('node:assert/strict');
const SW = require('../src/surface-world.js');
const P = require('../src/surface-paint.js');

// A 2D context that accepts every call; create* and measureText return what callers expect.
function fakeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (p === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const canvas = (w, h) => { const ctx = fakeCtx(); return { width: w, height: h, getContext: () => ctx }; };
const painter = (seed, opts) => {
  const world = SW.create(seed);
  return { world, p: P.createPainter(world, Object.assign({ canvas, now: () => 0 }, opts)) };
};

test('the view plus a one-chunk margin is queued, nearest the middle first', () => {
  const { p } = painter('PAINT-1');
  p.retainView(0, 0, 1024, 512);             // image chunks 0..4 × 0..2 on screen
  assert.equal(p.stats().queue, 7 * 5);      // −1..5 × −1..3 with the margin
  assert.deepEqual(p.pending()[0], [2, 1]);
});

test('painted chunks two outside the view are deleted; one outside are kept', () => {
  const { p } = painter('PAINT-2');
  p.retainView(0, 0, 1024, 512);
  p.work(Infinity);
  assert.equal(p.stats().images, 35);
  p.retainView(3 * 256, 0, 3 * 256 + 1024, 512); // move three chunks east
  assert.ok(p.has(1, 0), 'kept: one outside the new margin');
  assert.ok(!p.has(0, 0) && !p.has(-1, 0), 'deleted: two or more outside');
});

test('never more than the cap, but never a chunk on screen, even when the view needs more than the cap', () => {
  const { p } = painter('PAINT-3', { cap: 10 });
  p.retainView(0, 0, 2560, 1280);            // a 4K-wide view: needs 13 × 8 = 104 chunks
  p.work(Infinity);
  assert.equal(p.stats().images, 104);
  assert.equal(p.stats().cap, 104);
  p.retainView(0, 0, 256, 256);              // back to a small view: 4 × 4 = 16 needed
  p.work(Infinity);
  assert.ok(p.stats().images <= 16, 'trimmed to ' + p.stats().images);
  for (let iy = -1; iy <= 2; iy++) for (let ix = -1; ix <= 2; ix++) assert.ok(p.has(ix, iy), 'on screen ' + ix + ',' + iy);
});

test('work stops at the deadline but always paints at least what it is asked to', () => {
  let clock = 0;
  const world = SW.create('PAINT-4');
  const p = P.createPainter(world, { canvas, now: () => (clock += 1) });
  p.retainView(0, 0, 1024, 512);
  const n = p.work(clock + 5);
  assert.ok(n >= 1 && n < 35, 'painted ' + n);
  assert.equal(p.work(0, 1), 1, 'atLeast forces one even past the deadline');
});

test('decor is seeded by its chunk: the same list every time, each piece small enough to touch only its neighbours', () => {
  const { world } = painter('PAINT-5');
  for (const [ix, iy] of [[0, 0], [-3, 7], [40, -12]]) {
    const a = P.decorFor(world, ix, iy), b = P.decorFor(world, ix, iy);
    assert.deepEqual(a, b);
    for (const d of a) {
      assert.ok(d.x >= ix * 256 && d.x < ix * 256 + 256 && d.y >= iy * 256 && d.y < iy * 256 + 256);
      assert.ok(d.s <= 35, 'size ' + d.s);
    }
  }
});

test('mini images exist only for explored chunks and are redrawn when their fog changes', () => {
  const { world, p } = painter('PAINT-6');
  assert.equal(p.mini(0, 0), null, 'nothing seen yet');
  world.get(0, 0);
  world.reveal(5, 5, 3);
  const c = p.mini(0, 0);
  assert.ok(c);
  const renders = p.stats().renders;
  assert.equal(p.mini(0, 0), c, 'cached');
  assert.equal(p.stats().renders, renders);
  world.reveal(20, 20, 2);
  p.mini(0, 0);
  assert.equal(p.stats().renders, renders + 1, 'redrawn after the fog changed');
});

test("a far explored chunk's mini image is queued, and building it never pushes out the player's chunks", () => {
  const world = SW.create('PAINT-7', { cap: 8 });
  const p = P.createPainter(world, { canvas, now: () => 0 });
  for (let i = 0; i < 8; i++) world.get(i, 0);
  world.reveal(300, 300, 2);
  assert.equal(p.mini(9, 9), null);
  assert.equal(p.stats().miniQueue, 1);
  assert.equal(p.workMinis(Infinity), 1);
  assert.ok(p.mini(9, 9));
  assert.deepEqual(world.liveKeys().sort(), ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0', '7,0']);
});

test('a mini drawn this frame is never evicted: past 512 explored chunks the map does not rebuild them every frame', () => {
  const world = SW.create('PAINT-MINI', { cap: 700 });
  const p = P.createPainter(world, { canvas, now: () => 0 });
  const keys = [];
  for (let i = 0; i < 540; i++) { const cx = i % 30, cy = Math.floor(i / 30); world.get(cx, cy); world.reveal(cx * 32 + 5, cy * 32 + 5, 3); keys.push([cx, cy]); }
  const frame = () => { p.workMinis(Infinity); for (const [cx, cy] of keys) p.mini(cx, cy); };
  frame();
  frame();
  const renders = p.stats().renders;
  frame();
  assert.equal(p.stats().renders, renders, 'a third frame of the same view builds nothing');
  assert.ok(p.stats().minis >= 540, 'all of the frame stays cached: ' + p.stats().minis);
});

// A context that records every call, in order, as [name, ...args].
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, p) { if (p in t) return t[p]; return (...a) => { calls.push([p, ...a]); }; },
    set(t, p, v) { t[p] = v; return true; },
  });
  return { ctx, calls };
}
// The two crack strokes on an ice tile whose top-left corner is (X, Y) in world pixels.
const cracks = (X, Y) => [
  ['beginPath'], ['moveTo', X + 8, Y + 20], ['lineTo', X + 22, Y + 26], ['lineTo', X + 32, Y + 17], ['lineTo', X + 46, Y + 28], ['stroke'],
  ['beginPath'], ['moveTo', X + 12, Y + 44], ['lineTo', X + 24, Y + 40], ['lineTo', X + 33, Y + 48], ['lineTo', X + 48, Y + 43], ['stroke'],
];

test('the ice cracks are one shared drawing, with the exact strokes the two earlier copies made', () => {
  const { ctx, calls } = recorder();
  P.sprites.drawIceCracks(ctx, 640, -128);
  assert.deepEqual(calls, cracks(640, -128));
});

test('an ice tile of the ground is painted with those cracks at its corner', () => {
  const W = require('../src/worldgen.js');
  const world = SW.create('PAINT-ICE');
  let tile = null;
  for (let y = -3000; y <= 3000 && !tile; y += 32) {
    for (let x = -3000; x <= 3000 && !tile; x += 32) {
      if (W.regionAt(world.seed, x, y) !== 4) continue; // the Icy Plains
      for (let dy = 0; dy < 32 && !tile; dy++) for (let dx = 0; dx < 32 && !tile; dx++) if (world.tile(x + dx, y + dy) === W.TILE.ICE) tile = [x + dx, y + dy];
    }
  }
  assert.ok(tile, 'an ice tile somewhere in the Icy Plains');
  const rec = recorder();
  const p = P.createPainter(world, { canvas: (w, h) => ({ width: w, height: h, getContext: () => rec.ctx }), now: () => 0 });
  const [ix, iy] = [Math.floor(tile[0] / 4), Math.floor(tile[1] / 4)];
  p.retainView(ix * 256, iy * 256, ix * 256 + 255, iy * 256 + 255);
  p.work(Infinity);
  const want = JSON.stringify(cracks(tile[0] * 64, tile[1] * 64));
  const at = rec.calls.findIndex((c, i) => c[0] === 'beginPath' && JSON.stringify(rec.calls.slice(i, i + 12)) === want);
  assert.ok(at >= 0, 'the cracks were drawn at the ice tile');
});

// ---------- the points of interest's tiles (M4c) ----------

const POI_TILES = ['SEDIMENT', 'SCARP', 'CREST', 'TUBE_FLOOR', 'TUBE_WALL', 'SKYLIGHT', 'STRUCT_FLOOR', 'STRUCT_WALL'];
// Paints the image chunk (0, 0) of a fake world whose every tile is `code` in `region`, and returns its calls in order, each
// fillRect with the fill style it was made in.
function paintAll(code, region) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, p) { if (p in t) return t[p]; return (...a) => { calls.push(p === 'fillRect' ? [p, t.fillStyle, ...a] : [p, ...a]); }; },
    set(t, p, v) { t[p] = v; return true; },
  });
  const world = { seed: 7, tile: () => code, region: () => region };
  const p = P.createPainter(world, { canvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }), now: () => 0 });
  p.retainView(0, 0, 255, 255);
  p.work(-Infinity, 1); // the chunk in the middle only
  return calls;
}

test("the points of interest's eight tiles have colours of their own: none of them falls back to the region's ground", () => {
  const W = require('../src/worldgen.js');
  const colours = new Set();
  for (const k of POI_TILES) {
    for (let r = 0; r < W.REGIONS.length; r++) assert.notDeepEqual(P.tileRGB(W.TILE[k], r), P.tileRGB(W.TILE.REGOLITH, r), `${k} in ${W.REGIONS[r]}`);
    colours.add(String(P.tileRGB(W.TILE[k], 0)));
  }
  assert.equal(colours.size, POI_TILES.length, 'eight different colours');
});

test("an ice scarp and a lava tube's wall stand up as cliffs do, painted over the decor; the other six lie flat under it", () => {
  const W = require('../src/worldgen.js');
  for (const k of POI_TILES) {
    const calls = paintAll(W.TILE[k], 0), fill = calls.findIndex(c => c[0] === 'fillRect'), decor = calls.findIndex(c => c[0] === 'clip');
    assert.equal(fill > decor, k === 'SCARP' || k === 'TUBE_WALL', k);
  }
});

test("a Kestrel structure's footprint with nothing but footprint round it is painted as its region's usual ground", () => {
  const W = require('../src/worldgen.js');
  const UNDER = [W.TILE.REGOLITH, W.TILE.DUNE, W.TILE.REGOLITH, W.TILE.REGOLITH, W.TILE.POLYGON, W.TILE.LAVA];
  const ground = calls => calls.slice(0, calls.findIndex(c => c[0] === 'save')); // the tiles, before the decor
  W.REGIONS.forEach((id, r) => assert.deepEqual(ground(paintAll(W.TILE.STRUCT_WALL, r)), ground(paintAll(UNDER[r], r)), id));
});

test('a boulder or a footprint is painted as the ground round it (the most of its eight neighbours), never as a square of another ground', () => {
  const TL = require('../src/worldgen.js').TILE;
  // The colour tile (1, 1) is filled with in chunk (0, 0) of a fake world laid out by tile(tx, ty), in region `region`.
  const fillAt = (tile, region) => {
    const calls = [];
    const ctx = new Proxy({}, {
      get(t, p) { if (p in t) return t[p]; return (...a) => { if (p === 'fillRect') calls.push([t.fillStyle, ...a]); }; },
      set(t, p, v) { t[p] = v; return true; },
    });
    const p = P.createPainter({ seed: 7, tile, region: () => region }, { canvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }), now: () => 0 });
    p.retainView(0, 0, 255, 255);
    p.work(-Infinity, 1);
    return calls.find(c => c[1] === 64 && c[2] === 64 && c[3] === 64)[0];
  };
  const at11 = (inner, outer) => (tx, ty) => (tx === 1 && ty === 1 ? inner : outer(tx, ty));
  const sand = fillAt(() => TL.SAND, 0);
  assert.equal(fillAt(at11(TL.BOULDER, () => TL.SAND), 0), sand, 'a boulder on a sand patch of the Plains');
  assert.equal(fillAt(at11(TL.STRUCT_WALL, () => TL.SAND), 0), sand, 'a footprint on sand');
  const two = (tx, ty) => (ty === 1 && tx !== 1 ? TL.SAND : TL.CRATER_FLOOR); // six crater floor, two sand
  assert.equal(fillAt(at11(TL.BOULDER, two), 2), fillAt(() => TL.CRATER_FLOOR, 2), 'the most of its neighbours');
  const rocks = (tx, ty) => (tx === 1 || ty === 1 ? TL.BOULDER : TL.CLIFF); // only boulders and cliffs round it
  assert.equal(fillAt(at11(TL.BOULDER, rocks), 1), fillAt(() => TL.DUNE, 1), "none: the Dune Sea's usual ground");
});

// ---------- the graphics level: chunk images painted at a scale (the Display settings) ----------

// A painter whose canvases are kept, each with a recording 2D context: the tests see their size and what was drawn on them.
function scaled(seed, opts) {
  const made = [];
  const canvas = (w, h) => { const rec = recorder(); const c = { width: w, height: h, calls: rec.calls, getContext: () => rec.ctx }; made.push(c); return c; };
  return { made, p: P.createPainter(SW.create(seed), Object.assign({ canvas, now: () => 0 }, opts)) };
}
// The drawImage that drawGround makes for the painted image chunk (ix, iy).
function drawnImage(p, ix, iy) {
  const out = recorder();
  p.drawGround(out.ctx, ix * 256, iy * 256, ix * 256 + 255, iy * 256 + 255);
  return out.calls.find(c => c[0] === 'drawImage');
}

test('a chunk image is k·PX square at scale k (1 when none is given): painted through a transform that scales, drawn from a k·PX source rect', () => {
  for (const [opts, k] of [[undefined, 1], [{ scale: 2 }, 2]]) {
    const { p, made } = scaled('PAINT-S' + k, opts);
    p.retainView(256, 512, 511, 767);          // image chunk (1, 2) and its margin; the middle one is painted first
    p.work(Infinity);
    assert.equal(made.length, 9);
    assert.ok(made.every(c => c.width === 256 * k && c.height === 256 * k), 'scale ' + k + ': every chunk image is ' + 256 * k + ' px square');
    // paintChunk sets its own transform (world pixels, the chunk's corner at the origin), so the scale has to be part of it.
    assert.deepEqual(made[0].calls.find(c => c[0] === 'setTransform'), ['setTransform', k, 0, 0, k, -256 * k, -512 * k]);
    const draw = drawnImage(p, 1, 2);
    assert.equal(draw[1], made[0]);
    assert.deepEqual(draw.slice(2), [0, 0, 256 * k, 256 * k, 256, 512, 257, 257], 'a ' + 256 * k + ' source rect, into the same world pixels (PX + 1)');
  }
});

test('setScale drops every chunk image and queues the view again at the new scale; flat colours cover the ground until a chunk is repainted', () => {
  const { p, made } = scaled('PAINT-S3', { scale: 2 });
  p.retainView(256, 512, 511, 767);
  p.work(Infinity);
  assert.equal(p.stats().images, 9);
  p.setScale(1);
  assert.equal(p.stats().images, 0, 'every image is dropped');
  assert.equal(p.stats().queue, 9, 'and the view is queued again');
  const holes = recorder();
  p.drawGround(holes.ctx, 256, 512, 511, 767);
  assert.deepEqual([holes.calls.filter(c => c[0] === 'drawImage').length, holes.calls.filter(c => c[0] === 'fillRect').length], [0, 16], 'no hole: the chunk is its 16 flat tiles');
  const before = made.length;
  p.work(Infinity);
  assert.equal(made.length - before, 9);
  assert.ok(made.slice(before).every(c => c.width === 256 && c.height === 256), 'the next paint makes PX canvases');
  assert.deepEqual(drawnImage(p, 1, 2).slice(4, 6), [256, 256], 'and they are drawn from a PX source rect');
  p.setScale(1);
  assert.equal(p.stats().images, 9, 'the scale it already has changes nothing');
});

test('a painted chunk is hashed whole at any scale (the browser QA helper)', () => {
  let asked = null;
  const ctx = fakeCtx();
  ctx.getImageData = (...a) => { asked = a; return { data: new Uint8ClampedArray(4) }; };
  const p = P.createPainter(SW.create('PAINT-S4'), { scale: 2, canvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }), now: () => 0 });
  p.retainView(0, 0, 255, 255);
  p.work(Infinity);
  p.chunkHash(0, 0);
  assert.deepEqual(asked, [0, 0, 512, 512]);
});

// ---------- the points of interest over the ground (M4c) ----------

// A data chunk holding only the points of interest given (the fields src/worldgen.js gives every chunk).
const chunkWith = o => Object.assign({ structures: [], formations: [], landmarks: [], props: [] }, o);
const nobody = { at: [1000, 1000], done: () => false };

test('a Kestrel structure is drawn once, however many chunks list it: a square as wide as its footprint on its bottom edge, done once the rules say so', () => {
  const wreck = { id: 'S1,2', kind: 'wreck', x: 11, y: 22, box: [10, 20, 12, 21] }; // 3×2, its door south of it
  const chunks = [chunkWith({ structures: [wreck] }), chunkWith({ structures: [Object.assign({}, wreck)] })];
  assert.deepEqual(P.scenery(chunks, nobody), [{ art: 'kestrel', id: 'wreck', opts: { done: false }, x: 10, y: 19, w: 3, h: 3, depth: 22 * 64 - 6 }]);
  assert.deepEqual(P.scenery(chunks, { at: nobody.at, done: id => id === 'S1,2' })[0].opts, { done: true });
});

test('the hab pod is its room while you stand inside its box, sorted under whoever is in there; its roof otherwise', () => {
  const pod = { id: 'S0,3', kind: 'pod', x: 2, y: 4, box: [0, 0, 4, 4] };
  const at = (x, y) => P.scenery([chunkWith({ structures: [pod] })], { at: [x, y], done: () => true })[0];
  assert.deepEqual([at(2, 2).opts, at(2, 2).depth], [{ inside: true }, 0], 'inside: under everyone in it');
  assert.deepEqual([at(2, 4).opts, at(2, 4).depth], [{ inside: true }, 0], 'in its doorway');
  assert.deepEqual([at(2, 5).opts, at(2, 5).depth], [{ inside: false }, 5 * 64 - 6], 'outside, at its door: a sprite like the others');
});

test('formations fill their square, sorted at its foot; the dust-devil tracks are a decal flat on the ground', () => {
  const arch = { id: 'F0,0', kind: 'arch', x: 6, y: 8, box: [5, 5, 7, 7] }, tracks = { id: 'F1,0', kind: 'deviltracks', x: 41, y: 8, box: [40, 5, 42, 7] };
  assert.deepEqual(P.scenery([chunkWith({ formations: [arch] }), chunkWith({ formations: [tracks] })], nobody), [
    { art: 'formation', id: 'arch', opts: null, x: 5, y: 5, w: 3, h: 3, depth: 8 * 64 - 6 },
    { art: 'formation', id: 'deviltracks', opts: null, x: 40, y: 5, w: 3, h: 3, depth: null },
  ]);
});

test("the methane vent is a mound on its survey's tile, drawn once, with its puff rising from it", () => {
  const vent = chunkWith({ landmarks: [{ id: 'L1,1', kind: 'methane', x: 300, y: 310, box: [296, 306, 304, 314] }] });
  assert.deepEqual(P.scenery([vent, vent], nobody), [
    { art: 'prop', id: 'vent', opts: null, depth: null, x: 299.5, y: 309, w: 2, h: 2 },
    { art: 'puff', id: 'vent', opts: null, depth: 311 * 64 - 6, x: 299.5, y: 309, w: 2, h: 2 },
  ]);
});

// A lava tube 29 tiles long, east–west, its skylight in its south wall (src/worldgen.js SHAPES.tube, a = 13, s = 4).
const TUBE = { id: 'L2,1', kind: 'tube', x: 600, y: 310, skylight: [604, 312], box: [585, 307, 615, 313] };

test("you are inside a lava tube when you stand on its floor or its skylight, in its box; not on the open ground round it", () => {
  const W = require('../src/worldgen.js'), chunks = [chunkWith({ landmarks: [TUBE] })];
  assert.equal(P.tubeAt(chunks, [600, 310], W.TILE.TUBE_FLOOR), TUBE);
  assert.equal(P.tubeAt(chunks, [604, 312], W.TILE.SKYLIGHT), TUBE);
  assert.equal(P.tubeAt(chunks, [604, 313], W.TILE.REGOLITH), null, 'the ring of open ground in its box');
  assert.equal(P.tubeAt(chunks, [700, 310], W.TILE.TUBE_FLOOR), null, "another tube's floor");
});

test("a lava tube's roof covers its walls and floor with the skylight's pit on it while you are outside; inside, both hide", () => {
  const chunks = [chunkWith({ landmarks: [TUBE] })];
  assert.deepEqual(P.scenery(chunks, nobody), [
    { art: 'roof', id: 'L2,1', opts: null, x: 586, y: 308, w: 29, h: 5, depth: 313 * 64 - 6 },
    { art: 'prop', id: 'skylight', opts: null, x: 603.5, y: 311.5, w: 2, h: 2, depth: 313 * 64 - 5 },
  ]);
  assert.deepEqual(P.scenery(chunks, { at: [600, 310], done: () => false, tube: TUBE }), []);
});

test("the world's decor props are painted into the ground: the flat ones with the decor, a rock standing up over it", () => {
  const { ctx, calls } = recorder();
  const props = [{ x: 1, y: 1, kind: 'pit' }, { x: 2, y: 2, kind: 'rock' }];
  const world = { seed: 7, tile: () => 0, region: () => 0, get: (cx, cy) => chunkWith(cx === 0 && cy === 0 ? { props } : {}) };
  const p = P.createPainter(world, { canvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }), now: () => 0 });
  p.retainView(0, 0, 255, 255);
  p.work(-Infinity, 1); // the chunk (0, 0) only
  const clip = calls.findIndex(c => c[0] === 'clip'), restore = calls.findIndex(c => c[0] === 'restore');
  const pit = calls.findIndex(c => c[0] === 'ellipse' && c[1] === 96 && c[2] === 96);
  assert.ok(pit > clip && pit < restore, 'the pit, centred on its tile, with the decor');
  assert.ok(calls.slice(restore).some(c => c[0] === 'ellipse'), 'the rock, after the decor (the ground here has nothing else that stands up)');
});

// ---------- the ground's real NASA photos (src/ground-photos.js) ----------
const W = require('../src/worldgen.js');
const PHOTOS = require('../src/ground-photos.js');

test("every ground is painted with a real NASA photo but bare ice, an ice scarp and a hab pod's deck; each region's usual ground with its own", () => {
  const bare = new Set([W.TILE.ICE, W.TILE.SCARP, W.TILE.STRUCT_FLOOR]);
  for (const [name, code] of Object.entries(W.TILE)) for (let r = 0; r < W.REGIONS.length; r++) {
    const photo = P.photoOf(code, r);
    if (bare.has(code)) assert.equal(photo, null, name);
    else assert.match(PHOTOS[photo] || '', /^data:image\/jpeg;base64,\/9j\//, name + ' in ' + W.REGIONS[r] + ' → ' + photo);
  }
  const usual = W.REGIONS.map((id, r) => P.photoOf(W.TILE.BOULDER, r)); // a boulder sits on its region's usual ground
  assert.deepEqual(usual.slice().sort(), Object.keys(PHOTOS).sort(), 'six regions, six photos: ' + usual);
});

test('a photo is made to repeat without a seam: its last column runs on into its first, and its last row into its first', () => {
  const N = 16, O = 6, S = N + O, src = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) src.set([40 + (i * 37) % 180, 30 + (i * 53) % 120, 20 + (i * 71) % 90, 255], i * 4);
  const mean = [0, 1, 2].map(k => { let s = 0; for (let i = 0; i < S * S; i++) s += src[i * 4 + k]; return s / (S * S); });
  const low = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) low.set([...mean.map(Math.round), 255], i * 4); // even light: flattening keeps the pixels
  const { col, lum } = P.tileable(src, low, N, O, 1.5);
  const px = (a, w, x, y) => [0, 1, 2].map(k => a[(y * w + x) * 4 + k]);
  const near = (a, b, what) => a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) <= 2, what + ': ' + a + ' vs ' + b));
  for (let y = O; y < N; y++) {
    near(px(col, N, N - 1, y), px(src, S, N - 1, y), 'the last column is the photo');
    near(px(col, N, 0, y), px(src, S, N, y), 'the first column is the photo pixel right of the last');
  }
  for (let x = O; x < N; x++) {
    near(px(col, N, x, N - 1), px(src, S, x, N - 1), 'the last row is the photo');
    near(px(col, N, x, 0), px(src, S, x, N), 'the first row is the photo pixel under the last');
  }
  for (let i = 0; i < N * N; i++) assert.ok(lum[i * 4] === lum[i * 4 + 1] && lum[i * 4] === lum[i * 4 + 2] && lum[i * 4 + 3] === 255, 'the detail is grey');
});

test("a photo's own lighting is taken out: a picture that is only light and shade leaves a flat detail layer", () => {
  const N = 16, O = 6, S = N + O, src = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 60 + x * 6 + y * 3; src.set([v, v, v, 255], (y * S + x) * 4); }
  const { lum } = P.tileable(src, src, N, O, 2);
  for (let i = 0; i < N * N; i++) assert.ok(Math.abs(lum[i * 4] - 128) <= 2, 'pixel ' + i + ': ' + lum[i * 4]);
});

test('when the photos arrive the painted chunks are queued again, but stay on screen until each one is repainted', () => {
  const { p } = painter('PAINT-R');
  p.retainView(0, 0, 512, 256);
  p.work(Infinity);
  const n = p.stats().images;
  assert.equal(p.stats().queue, 0);
  p.refresh();
  assert.equal(p.stats().queue, n, 'every painted chunk queued again');
  assert.equal(p.stats().images, n, 'and still drawn meanwhile');
  assert.equal(p.work(Infinity), n, 'each one repainted');
  assert.equal(p.stats().queue, 0);
});

test("a relay beacon's light flashes once every 2 s, and stays dark while your refill there is used", () => {
  // Every arc filled, with the fill style it had: the last one is the light on top of the mast.
  const lights = (time, spent) => {
    const arcs = [];
    const ctx = new Proxy({}, {
      get(t, p) { if (p in t) return t[p]; if (p === 'arc') return (x, y, r) => arcs.push({ y, r }); if (p === 'fill') return () => { if (arcs.length) arcs[arcs.length - 1].style = t.fillStyle; }; return () => {}; },
      set(t, p, v) { t[p] = v; return true; },
    });
    P.sprites.drawBeacon(ctx, 100, 200, time, spent);
    return arcs;
  };
  const lit = lights(0.5, false), dark = lights(1.5, false), spent = lights(0.5, true);
  assert.equal(lit.length, 2, 'at the top of its flash: the glow and the light');
  assert.equal(lit[1].style, '#ffcf7a');
  assert.equal(dark.length, 1, 'between flashes: the light alone');
  assert.deepEqual(spent.map(a => a.style), ['#5d5355'], 'spent: dark, and no flash');
  assert.ok(lit.every(a => a.y < 200), 'the light stands above its foot');
});

test("an older browser's canvas (no roundRect, no filter: Safari 15, Firefox before 112) still draws the rover", () => {
  const { ctx, calls } = recorder(), old = new Proxy(ctx, {
    get: (t, p) => (p === 'roundRect' || p === 'filter' ? undefined : /^create[A-Za-z]+Gradient$/.test(p) ? () => ({ addColorStop() {} }) : t[p]),
    set: (t, p, v) => { if (p === 'filter') throw new Error('filter is not drawn on this canvas'); t[p] = v; return true; },
  });
  P.sprites.drawAvatar(old, { x: 300, y: 400, rover: true, heading: 0.7, odo: 12, moving: true, color: '#ff0000', you: true }, 'Minh', 0, []);
  assert.ok(calls.filter(c => c[0] === 'fill').length > 10, 'the whole rover, its shadow too');
});

test("someone in the rover is drawn as the science rover from above: 2 tiles long, turned to its heading, nothing of the walker", () => {
  const rec = () => { const r = recorder(); return { calls: r.calls, ctx: new Proxy(r.ctx, { get: (t, p) => (/^create[A-Za-z]+Gradient$/.test(p) ? () => ({ addColorStop() {} }) : t[p]), set: (t, p, v) => { t[p] = v; return true; } }) }; };
  const { ctx, calls } = rec();
  P.sprites.drawAvatar(ctx, { x: 300, y: 400, rover: true, heading: 0.7, odo: 12, moving: true, color: '#ff0000', you: true }, 'Minh', 0, []);
  assert.deepEqual(calls.filter(c => c[0] === 'rotate').map(c => c[1]), [0.7, 0.7], 'its shadow and itself, turned to its heading');
  assert.equal(2 * Math.max(...calls.filter(c => c[0] === 'arcTo').map(c => c[1])), 128, '128 px long: 2 tiles');
  assert.ok(!calls.some(c => c[0] === 'ellipse'), "no walker's ring or shadow under it");
  const parked = rec();
  P.sprites.drawAvatar(parked.ctx, { x: 0, y: 0, rover: true, dir: 'down' }, '', 0, []);
  assert.equal(parked.calls.find(c => c[0] === 'rotate')[1], Math.PI / 2, 'no heading yet: it faces the way the driver faced');
});

test('a lava tube pool is dark at the new radius: a tighter pool, nearly black at 60 % of the headlamp radius and beyond', () => {
  const calls = [], stops = [];
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'createRadialGradient') return (...a) => { calls.push(a); return { addColorStop: (k, c) => stops.push([k, c]) }; };
      return () => {};
    },
    set() { return true; },
  });
  P.drawDark(ctx, 0, 0, 1280, 720, 640, 348, 512);
  const r = 512 * 0.6;
  assert.deepEqual(calls, [[640, 348, r * 0.25, 640, 348, r]]);
  assert.deepEqual(stops.at(0), [0, 'rgba(5,3,4,0)']);
  assert.deepEqual(stops.at(-1), [1, 'rgba(5,3,4,0.97)']);
});

test('loadPhotos no longer makes the images seamless synchronously: the work waits for an idle moment', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const reads = [], idle = [], imgs = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'getImageData' ? (x, y, w, h) => { reads.push(w); return { data: new Uint8ClampedArray(w * h * 4) }; } : () => ({})), set() { return true; } });
  const sandbox = {
    SolWorldgen: require('../src/worldgen.js'), SolFog: require('../src/fog.js'), SolGroundPhotos: { flagstone: 'data:x' },
    document: { createElement: () => ({ getContext: () => ctx }) },
    Image: function () { imgs.push(this); },
    requestIdleCallback: fn => idle.push(fn), setTimeout: () => 0,
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'surface-paint.js'), 'utf8'), sandbox);
  assert.equal(imgs.length, 1);
  imgs[0].onload();
  assert.deepEqual(reads, [], 'the photo loaded: nothing read, nothing made seamless yet');
  assert.equal(idle.length, 1);
  idle.shift()();
  assert.equal(reads.length, 2, 'at the idle moment the work runs');
});
