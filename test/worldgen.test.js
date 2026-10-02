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
