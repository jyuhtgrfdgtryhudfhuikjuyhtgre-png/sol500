'use strict';
// Caves in the endless world (src/worldgen.js, spec §3.1 and §3.4, M4b): where their mouths open, how many there are in
// each region, and that adding them moved nothing else.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/worldgen.js');

const T = W.TILE;
const REGION = Object.fromEntries(W.REGIONS.map((r, i) => [r, i]));
const inFlat = (x, y) => x * x + y * y <= (W.FLAT_RADIUS + 1) * (W.FLAT_RADIUS + 1);

test('a cave opens in the south face of a mesa or a canyon wall: its mouth is the open tile below the wall, inside its chunk', () => {
  let n = 0;
  for (const code of ['CAVE-1', 'CAVE-2', 'CAVE-3', 'CAVE-4']) {
    const seed = W.seedOf(code);
    for (let cy = -5; cy < 5; cy++) for (let cx = -5; cx < 5; cx++) {
      const c = W.chunk(seed, cx, cy);
      c.caves.forEach((k, i) => {
        n++;
        assert.equal(k.n, i, 'n is the index');
        const lx = k.x - cx * 32, ly = k.y - cy * 32;
        assert.ok(lx >= 0 && lx < 32 && ly >= 1 && ly < 32, `cave ${cx},${cy}:${i} has its mouth and its wall in its chunk`);
        const mouth = W.tileOf(c, lx, ly), wall = W.tileOf(c, lx, ly - 1);
        // A cave under a point of interest is hidden, never shown: the footprint drew its own tiles over it.
        if (!c.hidden.caves.includes(i)) {
          assert.equal(W.BLOCKING[mouth], 0, 'the mouth is open ground');
          assert.notEqual(mouth, T.BASE);
          assert.ok(wall === T.CLIFF || wall === T.CANYON_WALL, 'the wall is a mesa cliff or a canyon wall, not ' + wall);
        }
        assert.equal(k.region, W.regionOf(c, lx, ly), "its region is its mouth's");
        assert.ok(!inFlat(k.x, k.y), 'never in the flat zone round the base');
      });
    }
  }
  assert.ok(n > 40, 'caves to check: ' + n);
});

test('the same chunk always has the same caves, whatever was built before it', () => {
  const seed = W.seedOf('CAVE-ORDER');
  let pick = null;
  for (let i = 0; i < 200 && !pick; i++) if (W.chunk(seed, i - 100, 9).caves.length) pick = [i - 100, 9];
  assert.ok(pick, 'a chunk with caves to compare');
  const first = JSON.stringify(W.chunk(seed, pick[0], pick[1]).caves);
  for (let i = 0; i < 40; i++) W.chunk(seed, i - 20, -7);
  assert.equal(JSON.stringify(W.chunk(seed, pick[0], pick[1]).caves), first);
});

test('caves keep apart: 6 tiles either way, 2 in the Volcanic Flanks, which have about three times as many', () => {
  const caves = [0, 0, 0, 0, 0, 0], tiles = [0, 0, 0, 0, 0, 0];
  for (let s = 0; s < 20; s++) {
    const seed = W.seedOf('CFAR-' + s);
    for (let i = 0; i < 400; i++) {
      const c = W.chunk(seed, (i % 20) * 9 - 90, Math.floor(i / 20) * 9 - 90);
      for (let j = 0; j < 1024; j++) tiles[W.regionOf(c, j % 32, j >> 5)]++;
      for (const a of c.caves) {
        caves[a.region]++;
        for (const b of c.caves) {
          if (a === b) continue;
          const gap = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
          assert.ok(gap >= 2, 'caves ' + a.n + ' and ' + b.n + ' are ' + gap + ' tiles apart');
          if (a.region !== REGION.volcanic && b.region !== REGION.volcanic) assert.ok(gap >= 6, 'outside the Volcanic Flanks caves keep 6 tiles apart');
        }
      }
    }
  }
  const per = r => caves[r] / tiles[r] * 1024;
  // Measured: 0.80 caves a chunk in the Volcanic Flanks, 0.25 in the Plains and 0.74 in the Canyon Lands, whose walls run
  // for many tiles; the Dune Sea, the Crater Field and the Icy Plains have few walls (0.08–0.11).
  const k = per(REGION.volcanic) / per(REGION.plains);
  assert.ok(k > 2.4 && k < 4.5, 'the Volcanic Flanks have ' + k.toFixed(2) + ' times the caves of the Plains');
  assert.ok(per(REGION.canyons) > per(REGION.plains), 'canyon walls hold more caves than the Plains');
});

// FNV-1a over a JSON string.
function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

test('the caves in 400 far chunks match their pinned hash', () => {
  const seed = W.seedOf('PIN-CAVES');
  const parts = [];
  for (let cy = -10; cy < 10; cy++) for (let cx = -10; cx < 10; cx++) parts.push(W.chunk(seed, cx * 7, cy * 5).caves);
  assert.ok(parts.some(p => p.length), 'there are caves in the sample');
  const got = fnv(JSON.stringify(parts));
  // Change it only when you mean to move the caves, and say so in the commit message.
  const PINNED = 'c656b50b';
  assert.equal(got, PINNED, 'caves hash is ' + got);
});
