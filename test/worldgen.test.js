'use strict';
// The endless world (src/worldgen.js): determinism, the base and flat zone, regions, ground, boulders and features.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/worldgen.js');

const T = W.TILE;

// A small seeded random source for picking test coordinates (the world itself never uses one).
function lcg(seed) {
  let a = seed >>> 0;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
}
function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function fnv(parts) {
  let h = 2166136261;
  for (const b of parts) for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
function tileAt(seed, x, y, cache) {
  const cx = Math.floor(x / 32), cy = Math.floor(y / 32), k = cx + ',' + cy;
  let c = cache.get(k);
  if (!c) { c = W.chunk(seed, cx, cy); cache.set(k, c); }
  return W.tileOf(c, x - cx * 32, y - cy * 32);
}

test('the same mission code gives the same world, whatever order the chunks are built in', () => {
  const seed = W.seedOf('ARES-1234');
  const r = lcg(1);
  const coords = Array.from({ length: 1000 }, () => [Math.floor(r() * 400) - 200, Math.floor(r() * 400) - 200]);
  const inOrder = coords.map(([x, y]) => W.chunk(seed, x, y));
  const order = shuffle(coords.map((_, i) => i), r);
  const later = new Array(coords.length);
  for (const i of order) later[i] = W.chunk(seed, coords[i][0], coords[i][1]);
  for (let i = 0; i < coords.length; i++) {
    assert.deepEqual(later[i].tiles, inOrder[i].tiles, 'tiles of chunk ' + coords[i]);
    assert.deepEqual(later[i].regions, inOrder[i].regions, 'regions of chunk ' + coords[i]);
  }
});

test('different mission codes give different worlds', () => {
  assert.notEqual(W.seedOf('ARES-1234'), W.seedOf('ARES-1235'));
  const a = W.chunk(W.seedOf('ARES-1234'), 5, 5), b = W.chunk(W.seedOf('ARES-1235'), 5, 5);
  assert.notDeepEqual(a.tiles, b.tiles);
});

test('chunks are 32×32 tiles with a region for every tile, west and north of the base too', () => {
  const seed = W.seedOf('NEG-1');
  const c = W.chunk(seed, -3, -5);
  assert.equal(c.cx, -3);
  assert.equal(c.cy, -5);
  assert.equal(c.tiles.length, 1024);
  assert.equal(c.regions.length, 512);
  for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
    assert.ok(W.tileOf(c, lx, ly) <= T.BASE);
    assert.equal(W.regionOf(c, lx, ly), W.regionAt(seed, -3 * 32 + lx, -5 * 32 + ly));
  }
});

test('the HQ pad sits at (−4, −2) and nothing blocks within 12 tiles of the HQ', () => {
  for (let n = 0; n < 50; n++) {
    const seed = W.seedOf('BASE-' + n);
    const cache = new Map();
    for (let y = -14; y <= 14; y++) for (let x = -14; x <= 14; x++) {
      const t = tileAt(seed, x, y, cache);
      const inPad = x >= -4 && x <= 4 && y >= -2 && y <= 2;
      assert.equal(t === T.BASE, inPad, `seed ${n}: tile ${x},${y} is ${t}`);
      if (x * x + y * y <= 144) assert.equal(W.BLOCKING[t], 0, `seed ${n}: tile ${x},${y} blocks inside the flat zone`);
    }
  }
});

test('the base is always on the Plains, and every region type turns up about equally', () => {
  for (let n = 0; n < 100; n++) assert.equal(W.regionAt(W.seedOf('HOME-' + n), 0, 0), 0);
  const counts = new Array(6).fill(0);
  let total = 0;
  for (let n = 0; n < 4; n++) {
    const seed = W.seedOf('MIX-' + n), r = lcg(n + 10);
    for (let i = 0; i < 2000; i++) { counts[W.regionAt(seed, Math.floor(r() * 40000) - 20000, Math.floor(r() * 40000) - 20000)]++; total++; }
  }
  counts.forEach((c, i) => assert.ok(c / total > 0.09 && c / total < 0.25, `${W.REGIONS[i]}: ${(c / total * 100).toFixed(1)} %`));
});

test('regionAt agrees with the regions stored in chunks', () => {
  const seed = W.seedOf('AGREE-1'), r = lcg(3);
  for (let i = 0; i < 30; i++) {
    const cx = Math.floor(r() * 200) - 100, cy = Math.floor(r() * 200) - 100;
    const c = W.chunk(seed, cx, cy);
    for (let k = 0; k < 20; k++) {
      const lx = Math.floor(r() * 32), ly = Math.floor(r() * 32);
      assert.equal(W.regionOf(c, lx, ly), W.regionAt(seed, cx * 32 + lx, cy * 32 + ly));
    }
  }
});

test('each region has its own ground: dunes, polygon ice ground, lava rock, rust regolith', () => {
  const seed = W.seedOf('GROUND-1'), r = lcg(5);
  const by = W.REGIONS.map(() => new Map());
  for (let i = 0; i < 400; i++) {
    const c = W.chunk(seed, Math.floor(r() * 200) - 100, Math.floor(r() * 200) - 100);
    for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
      const reg = W.regionOf(c, lx, ly), t = W.tileOf(c, lx, ly);
      by[reg].set(t, (by[reg].get(t) || 0) + 1);
    }
  }
  const share = (reg, codes) => { const m = by[reg]; let all = 0, hit = 0; for (const [k, v] of m) { all += v; if (codes.includes(k)) hit += v; } return hit / all; };
  assert.ok(share(1, [T.DUNE]) > 0.5, 'Dune Sea mostly dunes');
  assert.ok(share(1, [T.DUNE, T.SAND]) > 0.9, 'Dune Sea is sand');
  assert.ok(share(4, [T.POLYGON, T.ICE]) > 0.85, 'Icy Plains: polygon ground and ice');
  assert.ok(share(4, [T.ICE]) > 0.05, 'Icy Plains have exposed ice');
  assert.ok(share(5, [T.LAVA]) > 0.6, 'Volcanic Flanks: lava rock');
  assert.ok(share(0, [T.REGOLITH, T.SAND]) > 0.85, 'Plains: regolith');
});

test('boulders always stand alone, so they can never close off a pocket of ground', () => {
  const seed = W.seedOf('ROCKS-1'), r = lcg(9);
  let boulders = 0;
  for (let i = 0; i < 60; i++) {
    const c = W.chunk(seed, Math.floor(r() * 300) - 150, Math.floor(r() * 300) - 150);
    for (let ly = 1; ly < 31; ly++) for (let lx = 1; lx < 31; lx++) {
      if (W.tileOf(c, lx, ly) !== T.BOULDER) continue;
      boulders++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy) assert.equal(W.BLOCKING[W.tileOf(c, lx + dx, ly + dy)], 0, `boulder at ${lx},${ly} touches a blocking tile`);
      }
    }
  }
  assert.ok(boulders > 100, 'some boulders exist (' + boulders + ')');
});

function blockedExtent(seed, f, code, cache) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = f.box[1]; y <= f.box[3]; y++) for (let x = f.box[0]; x <= f.box[2]; x++) {
    if (tileAt(seed, x, y, cache) !== code) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const grow = (b, p) => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
const touch = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
function distToOrigin(b) {
  const dx = Math.max(b[0], 0, -b[2]), dy = Math.max(b[1], 0, -b[3]);
  return Math.sqrt(dx * dx + dy * dy);
}

test('every blocking feature fits its size bounds', () => {
  const kinds = { mesa: 0, crater: 0, canyon: 0 };
  for (let n = 0; n < 10; n++) {
    const seed = W.seedOf('SIZE-' + n), cache = new Map();
    const f = W.featuresNear(seed, -512, -512, 511, 511);
    // A landmark overrides the features its box overlaps (spec §2.3), so only the ones clear of every landmark are measured.
    const lms = W.landmarksNear(seed, -512, -512, 511, 511), clear = g => !lms.some(l => touch(l.box, g.box));
    for (const m of f.mesas.filter(clear)) {
      kinds.mesa++;
      const e = blockedExtent(seed, m, T.CLIFF, cache);
      assert.ok(e.w >= 4 && e.w <= 14 && e.h >= 4 && e.h <= 14, `mesa at ${m.x},${m.y} is ${e.w}×${e.h}`);
    }
    for (const c of f.craters.filter(clear)) {
      kinds.crater++;
      assert.ok(c.r >= 4 && c.r <= 12, 'crater radius ' + c.r);
      assert.ok(c.gaps.length === 2 || c.gaps.length === 3, 'crater gaps ' + c.gaps.length);
      for (let y = c.box[1]; y <= c.box[3]; y++) for (let x = c.box[0]; x <= c.box[2]; x++) {
        if (tileAt(seed, x, y, cache) === T.RIM) assert.ok(Math.sqrt((x - c.x) * (x - c.x) + (y - c.y) * (y - c.y)) <= c.r + 1);
      }
    }
    for (const k of f.canyons) {
      kinds.canyon++;
      assert.ok(k.len >= 40 && k.len <= 110, 'canyon length ' + k.len);
      assert.ok(k.hw * 2 >= 3 && k.hw * 2 <= 5, 'canyon floor width ' + k.hw * 2);
    }
  }
  assert.ok(kinds.mesa > 50 && kinds.crater > 50 && kinds.canyon > 3, JSON.stringify(kinds));
});

test('boulders stand alone across chunk seams too', () => {
  const seed = W.seedOf('SEAMS-1'), cache = new Map();
  let boulders = 0;
  for (let y = 200; y < 328; y++) for (let x = 200; x < 328; x++) {
    if (tileAt(seed, x, y, cache) !== T.BOULDER) continue;
    boulders++;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (dx || dy) assert.equal(W.BLOCKING[tileAt(seed, x + dx, y + dy, cache)], 0, `boulder at ${x},${y}`);
  }
  assert.ok(boulders > 100);
});

test('features keep their distance from the base and from each other', () => {
  for (let n = 0; n < 20; n++) {
    const seed = W.seedOf('GAP-' + n);
    const f = W.featuresNear(seed, -600, -600, 599, 599);
    const all = [...f.canyons, ...f.craters, ...f.mesas];
    for (const a of all) assert.ok(distToOrigin(grow(a.box, 3)) > W.FLAT_RADIUS, `${a.kind} at ${a.box} is too close to the base`);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.kind === b.kind) continue; // same-kind features are spaced by their own cells
      assert.ok(!touch(grow(a.box, 3), b.box), `${a.kind} ${a.box} touches ${b.kind} ${b.box}`);
    }
  }
});

test('Canyon Lands have the canyons and the Crater Field has the most craters', () => {
  const perRegion = W.REGIONS.map(() => ({ cells: 0, craters: 0 }));
  let canyonsOutside = 0;
  for (let n = 0; n < 8; n++) {
    const seed = W.seedOf('KIND-' + n);
    const f = W.featuresNear(seed, -1024, -1024, 1023, 1023);
    for (let j = -16; j < 16; j++) for (let i = -16; i < 16; i++) perRegion[W.regionAt(seed, i * 64 + 32, j * 64 + 32)].cells++;
    for (const c of f.craters) perRegion[W.regionAt(seed, c.i * 64 + 32, c.j * 64 + 32)].craters++;
    for (const k of f.canyons) if (W.regionAt(seed, k.i * 128 + 64, k.j * 128 + 64) !== 3) canyonsOutside++;
  }
  const rate = r => perRegion[r].craters / Math.max(1, perRegion[r].cells);
  assert.equal(canyonsOutside, 0);
  assert.ok(rate(2) > 2 * rate(0), `Crater Field ${rate(2).toFixed(2)} vs Plains ${rate(0).toFixed(2)}`);
});

test('a chunk builds in under 4 ms (median)', () => {
  const seed = W.seedOf('SPEED-1'), r = lcg(11);
  for (let i = 0; i < 20; i++) W.chunk(seed, Math.floor(r() * 2000), Math.floor(r() * 2000));
  const times = [];
  for (let i = 0; i < 200; i++) {
    const cx = Math.floor(r() * 20000) - 10000, cy = Math.floor(r() * 20000) - 10000;
    const t0 = process.hrtime.bigint();
    W.chunk(seed, cx, cy);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  assert.ok(times[100] <= 4, 'median ' + times[100].toFixed(2) + ' ms');
});

test('a pinned hash of 1,000 chunks catches any change to the world', () => {
  const seed = W.seedOf('PIN-1'), r = lcg(7);
  const parts = [];
  for (let i = 0; i < 1000; i++) {
    const c = W.chunk(seed, Math.floor(r() * 4000) - 2000, Math.floor(r() * 4000) - 2000);
    parts.push(c.tiles, c.regions);
  }
  const got = fnv(parts);
  // The world as this plan's worldgen.js builds it. The browser QA (Task 11) checks Chrome gets the same value.
  // Change it only when you mean to change the world, and say so in the commit message.
  // M4c: the landmarks stamp their footprints (was 4f1ff5dc). Only tiles inside a footprint changed: 0 outside on 6 seeds,
  // and the regions, finds and caves are as they were (their own pinned hashes did not move).
  const PINNED = '59ba57b3';
  assert.equal(got, PINNED, 'world hash is ' + got);
});
