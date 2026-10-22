'use strict';
// Spec §1.3 and §2.3: on 300 seeds, every open tile within 128 tiles of the base can be reached on foot from the base,
// and so can every find, every landmark's site, every structure's door and every cave (they only ever stand on open
// ground). A find or a cave under a footprint is hidden, never shown, so it is left out.
// Slow (it builds 30,000 chunks), so it has its own file and runs alongside the rest of the suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/worldgen.js');

const BUILD = 160; // build tiles −160..159: a 32-tile margin, more than the 24 tiles between canyon ramps
const CHECK = 128; // check tiles −128..127 (256×256)

test("on 300 seeds every open tile, find, landmark site, structure door and cave within 128 tiles of the base can be reached from the base", () => {
  const size = BUILD * 2;
  const blocked = new Uint8Array(size * size), seen = new Uint8Array(size * size), queue = new Int32Array(size * size);
  let total = 0, totalSites = 0, totalDoors = 0;
  for (let n = 0; n < 300; n++) {
    const seed = W.seedOf('REACH-' + n);
    const finds = [], caves = [], sites = new Map(), doors = new Map(); // listed by every chunk they touch: count them once
    for (let cy = -BUILD / 32; cy < BUILD / 32; cy++) for (let cx = -BUILD / 32; cx < BUILD / 32; cx++) {
      const c = W.chunk(seed, cx, cy);
      const near = p => Math.abs(p.x) < CHECK && Math.abs(p.y) < CHECK;
      for (const f of c.finds) if (near(f) && !c.hidden.finds.includes(f.n)) finds.push(f);
      for (const k of c.caves) if (near(k) && !c.hidden.caves.includes(k.n)) caves.push(k);
      for (const l of c.landmarks) for (const f of l.sites) if (near(f)) sites.set(l.id + ':' + f.n, f);
      for (const s of c.structures) if (near(s)) doors.set(s.id, s);
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
    for (const f of [...finds, ...sites.values()]) assert.equal(seen[(f.y + BUILD) * size + f.x + BUILD], 1, `seed REACH-${n}: the ${f.kind} at ${f.x},${f.y} can't be reached`);
    for (const s of doors.values()) assert.equal(seen[(s.y + BUILD) * size + s.x + BUILD], 1, `seed REACH-${n}: the door of the ${s.kind} at ${s.x},${s.y} can't be reached`);
    for (const k of caves) assert.equal(seen[(k.y + BUILD) * size + k.x + BUILD], 1, `seed REACH-${n}: the cave at ${k.x},${k.y} can't be reached`);
    total += caves.length;
    totalSites += sites.size;
    totalDoors += doors.size;
  }
  assert.ok(total > 300, "caves checked: " + total);
  assert.ok(totalSites > 300, "landmark sites checked: " + totalSites);
  assert.ok(totalDoors > 1500, "structure doors checked: " + totalDoors);
});
