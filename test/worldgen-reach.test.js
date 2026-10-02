'use strict';
// Spec §1.3 and §2.3: on 300 seeds, every open tile within 128 tiles of the base can be reached on foot from the base.
// Slow (it builds 30,000 chunks), so it has its own file and runs alongside the rest of the suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/worldgen.js');

const BUILD = 160; // build tiles −160..159: a 32-tile margin, more than the 24 tiles between canyon ramps
const CHECK = 128; // check tiles −128..127 (256×256)

test('on 300 seeds every open tile within 128 tiles of the base can be reached from the base', () => {
  const size = BUILD * 2;
  const blocked = new Uint8Array(size * size), seen = new Uint8Array(size * size), queue = new Int32Array(size * size);
  for (let n = 0; n < 300; n++) {
    const seed = W.seedOf('REACH-' + n);
    for (let cy = -BUILD / 32; cy < BUILD / 32; cy++) for (let cx = -BUILD / 32; cx < BUILD / 32; cx++) {
      const c = W.chunk(seed, cx, cy);
      for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
        blocked[(cy * 32 + ly + BUILD) * size + cx * 32 + lx + BUILD] = W.BLOCKING[c.tiles[ly * 32 + lx]];
      }
    }
    seen.fill(0);
    let head = 0, tail = 0;
    const start = BUILD * size + BUILD;
    seen[start] = 1;
    queue[tail++] = start;
    const visit = i => { if (!seen[i] && !blocked[i]) { seen[i] = 1; queue[tail++] = i; } };
    while (head < tail) {
      const i = queue[head++], x = i % size, y = (i - x) / size;
      if (x > 0) visit(i - 1);
      if (x < size - 1) visit(i + 1);
      if (y > 0) visit(i - size);
      if (y < size - 1) visit(i + size);
    }
    let lost = 0, example = null;
    for (let y = BUILD - CHECK; y < BUILD + CHECK; y++) for (let x = BUILD - CHECK; x < BUILD + CHECK; x++) {
      const i = y * size + x;
      if (!blocked[i] && !seen[i]) { lost++; if (!example) example = (x - BUILD) + ',' + (y - BUILD); }
    }
    assert.equal(lost, 0, `seed REACH-${n}: ${lost} open tiles are cut off, e.g. tile ${example}`);
  }
});
