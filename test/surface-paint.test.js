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
