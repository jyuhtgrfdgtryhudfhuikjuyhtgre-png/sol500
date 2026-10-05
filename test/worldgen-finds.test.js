'use strict';
// Finds in the endless world (src/worldgen.js, spec §2.4): where they stand, what kind they are, and that they never change.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/worldgen.js');

const T = W.TILE;
const ICY_GROUND = [T.CRATER_FLOOR, T.CANYON_FLOOR, T.ICE];
const REGION = Object.fromEntries(W.REGIONS.map((r, i) => [r, i]));
// The flat zone round the HQ, where nothing is placed (worldgen's own inFlat is private).
const inFlat = (x, y) => x * x + y * y <= (W.FLAT_RADIUS + 1) * (W.FLAT_RADIUS + 1);

// Every chunk in a square of chunks around the base, for a few mission codes.
function* chunksAround(codes, half) {
  for (const code of codes) {
    const seed = W.seedOf(code);
    for (let cy = -half; cy < half; cy++) for (let cx = -half; cx < half; cx++) yield { seed, c: W.chunk(seed, cx, cy) };
  }
}
const CODES = ['FIND-1', 'FIND-2', 'FIND-3', 'FIND-4', 'FIND-5', 'FIND-6'];

test('the same chunk always has the same finds, whatever was built before it', () => {
  const seed = W.seedOf('FIND-ORDER');
  const first = JSON.stringify(W.chunk(seed, 3, -2).finds);
  for (let i = 0; i < 40; i++) W.chunk(seed, i - 20, 7);
  assert.equal(JSON.stringify(W.chunk(seed, 3, -2).finds), first);
  assert.ok(JSON.parse(first).length > 0, 'this chunk has finds to compare');
});

test('every find stands on open ground inside its chunk, outside the flat zone, with an id that is its index', () => {
  let n = 0;
  for (const { c } of chunksAround(CODES, 4)) {
    c.finds.forEach((f, i) => {
      n++;
      assert.equal(f.n, i, 'n is the index');
      const lx = f.x - c.cx * 32, ly = f.y - c.cy * 32;
      assert.ok(lx >= 3 && ly >= 3 && lx <= 28 && ly <= 28, `find ${c.cx},${c.cy}:${i} is 3 tiles inside its chunk`);
      const code = W.tileOf(c, lx, ly);
      assert.equal(W.BLOCKING[code], 0, 'on open ground');
      assert.notEqual(code, T.BASE);
      assert.ok(!inFlat(f.x, f.y), 'outside the flat zone');
      assert.equal(f.region, W.regionOf(c, lx, ly), 'its region is the region of its tile');
      assert.equal(f.ring, W.ringOf(f.x, f.y));
    });
  }
  assert.ok(n > 300, 'enough finds to test: ' + n);
  // The six seeds above can miss a dart that lands in the flat zone. Without the guard that turns such darts away, 24 of the 100
  // seeds below put a find there, so look at the four chunks that hold the zone on all of them.
  for (let s = 0; s < 100; s++) {
    const seed = W.seedOf('FLAT-' + s);
    for (let cy = -1; cy < 1; cy++) for (let cx = -1; cx < 1; cx++) {
      for (const f of W.chunk(seed, cx, cy).finds) assert.ok(!inFlat(f.x, f.y), `FLAT-${s}: find ${cx},${cy}:${f.n} stands in the flat zone`);
    }
  }
});

test('finds in a chunk keep at least 5 tiles apart', () => {
  for (const { c } of chunksAround(CODES, 4)) {
    for (const a of c.finds) for (const b of c.finds) {
      if (a !== b) assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) >= 5, `${c.cx},${c.cy}: ${a.n} and ${b.n} are too close`);
    }
  }
});

test('ice lies in crater floors, canyons and the Icy Plains; pods only in the Plains and the Dune Sea; surveys have a subject', () => {
  const seen = {};
  for (const { c } of chunksAround(CODES, 4)) {
    for (const f of c.finds) {
      const code = W.tileOf(c, f.x - c.cx * 32, f.y - c.cy * 32);
      seen[f.kind] = (seen[f.kind] || 0) + 1;
      assert.ok(W.FIND_KINDS.includes(f.kind));
      if (f.kind === 'ice') assert.ok(f.region === REGION.icy || ICY_GROUND.includes(code), 'ice on ' + code + ' in ' + W.REGIONS[f.region]);
      if (f.kind === 'pod') assert.ok(f.region === REGION.plains || f.region === REGION.dunes, 'pod in ' + W.REGIONS[f.region]);
      if (f.kind === 'science') assert.ok(['delta', 'vent', 'meteorite', 'layered'].includes(f.sub), 'science subject ' + f.sub);
      else assert.equal(f.sub, undefined);
    }
  }
  for (const k of W.FIND_KINDS) assert.ok(seen[k] > 10, 'some ' + k + ': ' + seen[k]);
});

test('every crater centre a chunk owns holds an ice deposit', () => {
  let craters = 0;
  for (const { seed, c } of chunksAround(CODES, 4)) {
    const x0 = c.cx * 32, y0 = c.cy * 32;
    for (const k of W.featuresNear(seed, x0, y0, x0 + 31, y0 + 31).craters) {
      const lx = k.x - x0, ly = k.y - y0;
      if (lx < 3 || ly < 3 || lx > 28 || ly > 28 || k.x * k.x + k.y * k.y <= 13 * 13) continue;
      craters++;
      assert.ok(c.finds.some(f => f.kind === 'ice' && f.x === k.x && f.y === k.y), `crater at ${k.x},${k.y} has ice`);
    }
  }
  assert.ok(craters > 5, 'craters checked: ' + craters);
});

test('the rings end 20, 40 and 80 tiles out, finds are thinner per tile nearer the base, and the Dune Sea has the fewest', () => {
  // A ring is a straight-line distance from the HQ and includes its outer edge.
  assert.deepEqual(W.RINGS, [20, 40, 80]);
  for (const [x, y, ring] of [[20, 0, 0], [21, 0, 1], [40, 0, 1], [41, 0, 2], [80, 0, 2], [81, 0, 3], [14, 14, 0], [15, 15, 1]]) {
    assert.equal(W.ringOf(x, y), ring, `the ring of ${x},${y}`);
  }
  const perRegion = [0, 0, 0, 0, 0, 0], regionTiles = [0, 0, 0, 0, 0, 0];
  for (const { c } of chunksAround(['DENS-1', 'DENS-2', 'DENS-3', 'DENS-4', 'DENS-5', 'DENS-6', 'DENS-7', 'DENS-8'], 6)) {
    for (let i = 0; i < 1024; i++) regionTiles[W.regionOf(c, i % 32, i >> 5)]++;
    for (const f of c.finds) perRegion[f.region]++;
  }
  const per1024 = perRegion.map((n, r) => n / regionTiles[r] * 1024);
  for (let r = 0; r < 6; r++) if (r !== REGION.dunes && regionTiles[r] > 20000) assert.ok(per1024[REGION.dunes] < per1024[r], 'the Dune Sea has fewer finds than ' + W.REGIONS[r]);
  for (let r = 0; r < 6; r++) if (regionTiles[r] > 20000) assert.ok(per1024[r] > 0.5 && per1024[r] < 2.5, W.REGIONS[r] + ': ' + per1024[r].toFixed(2) + ' finds per chunk');
  // The rings' areas grow about 1 : 3 : 12, so the counts rise outwards even with no gradient at all. Compare finds per tile a find
  // can stand on (open, outside the flat zone, 3 tiles inside its chunk) instead, on the 16 chunks round the base on 40 seeds.
  const found = [0, 0, 0, 0], room = [0, 0, 0, 0];
  for (let s = 0; s < 40; s++) {
    const seed = W.seedOf('RING-' + s);
    for (let cy = -2; cy < 2; cy++) for (let cx = -2; cx < 2; cx++) {
      const c = W.chunk(seed, cx, cy);
      for (const f of c.finds) found[f.ring]++;
      for (let ly = 3; ly < 29; ly++) for (let lx = 3; lx < 29; lx++) {
        const x = cx * 32 + lx, y = cy * 32 + ly;
        if (!inFlat(x, y) && !W.BLOCKING[W.tileOf(c, lx, ly)]) room[W.ringOf(x, y)]++;
      }
    }
  }
  assert.ok(Math.min(found[0], found[1], found[2]) > 5, 'finds in rings 0, 1 and 2 to compare: ' + found.slice(0, 3));
  const dens = found.map((n, r) => n / room[r]);
  // Measured: rings 0 and 1 have 0.33 and 0.57 of ring 2's finds per tile as built, and 1.06 and 0.91 with RING_DENSITY all 1;
  // the limits sit between.
  assert.ok(dens[0] / dens[2] < 0.6, `ring 0 has ${(dens[0] / dens[2]).toFixed(2)} of ring 2's finds per tile`);
  assert.ok(dens[1] / dens[2] < 0.75, `ring 1 has ${(dens[1] / dens[2]).toFixed(2)} of ring 2's finds per tile`);
});

// FNV-1a over a JSON string.
function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

test('the finds in 400 far chunks and in 360 chunks round the base match their pinned hashes', () => {
  const seed = W.seedOf('PIN-FINDS');
  const parts = [];
  for (let cy = -10; cy < 10; cy++) for (let cx = -10; cx < 10; cx++) parts.push(W.chunk(seed, cx * 7, cy * 5).finds);
  const got = fnv(JSON.stringify(parts));
  // Change it only when you mean to move the finds, and say so in the commit message (saved missions remember finds by id).
  const PINNED = '0e84f5a1';
  assert.equal(got, PINNED, 'finds hash is ' + got);

  // Those chunks are all far out (ring 3). Players reach the 6 × 6 chunks round the HQ (tiles -96 to 95) first, so pin them too,
  // by the same rule: 10 seeds, with 4, 29, 202 and 207 finds in rings 0, 1, 2 and 3.
  const near = [];
  for (let s = 0; s < 10; s++) {
    const nearSeed = W.seedOf('PIN-NEAR-' + s);
    for (let cy = -3; cy < 3; cy++) for (let cx = -3; cx < 3; cx++) near.push(W.chunk(nearSeed, cx, cy).finds);
  }
  const gotNear = fnv(JSON.stringify(near));
  const PINNED_NEAR = '947802d7';
  assert.equal(gotNear, PINNED_NEAR, 'finds hash round the base is ' + gotNear);
});
