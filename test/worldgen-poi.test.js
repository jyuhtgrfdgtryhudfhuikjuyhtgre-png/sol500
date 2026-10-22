'use strict';
// Points of interest in the endless world (spec §2.3, §3.6, §3.7, M4c): landmarks, Kestrel structures and natural formations.
// Where they stand, what they are made of, and that the finds and caves under them are hidden, never moved.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/data.js');
const W = require('../src/worldgen.js');

test("the points of interest follow the spec's tables: kinds, regions, sizes, hold times, rewards and text keys", () => {
  const L = D.LANDMARKS, S = D.STRUCTURES, F = D.FORMATIONS;
  assert.deepEqual(Object.keys(L.kinds), ['delta', 'tube', 'crater', 'methane', 'scarp', 'stardune']);
  assert.deepEqual(Object.keys(S.kinds), ['cache', 'wreck', 'weather', 'mast', 'pod', 'array']);
  assert.deepEqual(Object.keys(F.kinds), ['arch', 'yardang', 'hoodoo', 'balanced', 'ventifact', 'layered', 'deviltracks']);
  // §3.6: one per 256×256 cell, 60 %, never within 60 tiles of the base, up to 40×40, science 80–150 on discovery.
  assert.deepEqual([L.cell, L.chance, L.clear, L.size, L.science], [256, 0.6, 60, 40, [80, 150]]);
  const regions = k => L.kinds[k].regions.slice().sort();
  assert.deepEqual(regions('delta'), ['craters', 'plains']);
  assert.deepEqual(regions('tube'), ['volcanic']);
  assert.deepEqual(regions('crater'), ['craters']);
  assert.deepEqual(regions('methane'), ['canyons', 'plains']);
  assert.deepEqual(regions('scarp'), ['icy']);
  assert.deepEqual(regions('stardune'), ['dunes']);
  assert.equal(L.kinds.delta.sites.filter(s => s === 'science').length, 3, 'the delta: 3 rich science sites');
  assert.deepEqual(L.kinds.tube.sites.slice().sort(), ['ice', 'metal'], 'the lava tube: ice and rare metal inside');
  assert.ok(L.kinds.crater.sites.includes('ice') && L.kinds.crater.sites.includes('science'), 'the crater: floor ice and a peak survey');
  assert.deepEqual(L.kinds.methane.sites, ['science'], 'the vent: one survey');
  assert.ok(L.kinds.scarp.sites.filter(s => s === 'ice').length >= 3, 'the scarp: many ice loads');
  assert.equal(L.kinds.crater.radius * 2, 20, 'a rim 20 tiles across');
  // §3.7: one per 64×64 cell, 25–45 % by region, at least 20 tiles from the base, 2×2 to 5×5.
  assert.deepEqual([S.cell, S.clear], [64, 20]);
  assert.deepEqual(Object.keys(S.chance).sort(), W.REGIONS.slice().sort());
  for (const r of W.REGIONS) assert.ok(S.chance[r] >= 0.25 && S.chance[r] <= 0.45, r + ': ' + S.chance[r]);
  for (const [id, k] of Object.entries(S.kinds)) assert.ok(k.size.every(n => n >= 2 && n <= 5), id + ' is ' + k.size.join('×'));
  const holds = Object.fromEntries(Object.entries(S.kinds).map(([id, k]) => [id, [k.hold, k.engineer]]));
  assert.deepEqual(holds, { cache: [3, undefined], wreck: [6, 3], weather: [6, 3], mast: [6, 3], pod: [undefined, undefined], array: [5, undefined] });
  assert.deepEqual(S.kinds.cache.loads, [1, 2]);
  assert.deepEqual([S.kinds.wreck.metal, S.kinds.wreck.spares], [[2, 3], 1]);
  assert.deepEqual([S.kinds.weather.reveal, S.kinds.weather.science, S.kinds.weather.forecast], [24, 20, 3]);
  assert.equal(S.kinds.mast.marks, 96);
  assert.equal(S.kinds.pod.refills, 1);
  assert.equal(S.kinds.array.materials, 2);
  // About 1 in 3 formations is a science site; every region has landmarks and formations of its own.
  assert.equal(F.science, 1 / 3);
  for (const r of W.REGIONS) {
    assert.ok(Object.values(L.kinds).some(k => k.regions.includes(r)), 'a landmark kind for ' + r);
    assert.ok(Object.values(F.kinds).some(k => k.regions.includes(r)), 'a formation kind for ' + r);
  }
  // The keys of the facts and the Kestrel story logs that i18n.js holds.
  for (const [id, k] of Object.entries(L.kinds)) assert.equal(k.fact, 'lm.' + id);
  for (const [id, k] of Object.entries(F.kinds)) assert.equal(k.fact, 'fm.' + id);
  for (const [id, k] of Object.entries(S.kinds)) assert.equal(k.log, 'ks.' + id);
});

const T = W.TILE, LM = D.LANDMARKS;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const codes = (name, n) => Array.from({ length: n }, (_, k) => name + '-' + k);
// The tile at (x, y), from a cache of chunks.
function tileAt(seed, x, y, cache) {
  const cx = Math.floor(x / 32), cy = Math.floor(y / 32), k = cx + ',' + cy;
  let c = cache.get(k);
  if (!c) { c = W.chunk(seed, cx, cy); cache.set(k, c); }
  return W.tileOf(c, x - cx * 32, y - cy * 32);
}
// The tiles of a box, row by row, as [x, y, code].
function boxTiles(seed, b, cache) {
  const out = [];
  for (let y = b[1]; y <= b[3]; y++) for (let x = b[0]; x <= b[2]; x++) out.push([x, y, tileAt(seed, x, y, cache)]);
  return out;
}
// The cells of a w-wide grid that a flood fill over the `open` ones reaches from `starts`.
function flood(open, w, starts) {
  const seen = new Uint8Array(open.length), queue = [];
  for (const i of starts) if (open[i] && !seen[i]) { seen[i] = 1; queue.push(i); }
  while (queue.length) {
    const i = queue.pop(), x = i % w;
    for (const m of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (m >= 0 && m < open.length && open[m] && !seen[m]) { seen[m] = 1; queue.push(m); }
    }
  }
  return seen;
}
// Every landmark in the half × half cells either side of the base, for each mission code.
function* landmarks(list, half) {
  for (const code of list) {
    const seed = W.seedOf(code);
    for (let j = -half; j < half; j++) for (let i = -half; i < half; i++) { const l = W.landmarkAt(seed, i, j); if (l) yield { seed, l }; }
  }
}

test('landmarks: one in 60 % of the 256-tile cells, inside its cell, at most 40×40, never within 60 tiles of the base', () => {
  let n = 0;
  for (const { l } of landmarks(codes('LM', 20), 6)) {
    n++;
    const b = l.box, x0 = l.i * LM.cell, y0 = l.j * LM.cell;
    assert.equal(l.id, 'L' + l.i + ',' + l.j);
    // 3 tiles inside its cell, so two landmarks never touch and a chunk only looks up the cells it touches.
    assert.ok(b[0] >= x0 + 3 && b[1] >= y0 + 3 && b[2] <= x0 + LM.cell - 4 && b[3] <= y0 + LM.cell - 4, `${l.id}: box ${b}`);
    assert.ok(b[2] - b[0] < LM.size && b[3] - b[1] < LM.size, `${l.id}: box ${b} is more than 40×40`);
    const dx = Math.max(b[0], 0, -b[2]), dy = Math.max(b[1], 0, -b[3]);
    assert.ok(dx * dx + dy * dy >= LM.clear * LM.clear, `${l.id}: box ${b} comes within 60 tiles of the HQ`);
    assert.ok(inBox(b, l.x, l.y), `${l.id}: its centre is in its box`);
    assert.ok(Object.isFrozen(l) && Object.isFrozen(l.box) && Object.isFrozen(l.sites) && l.sites.every(Object.isFrozen), 'frozen');
  }
  const share = n / (20 * 144);
  assert.ok(share > 0.55 && share < 0.65, 'landmarks in ' + (100 * share).toFixed(1) + ' % of the cells');
});

test("a landmark's kind is one of the kinds of the region at its centre, and every region gets each of its kinds", () => {
  const seen = new Set();
  for (const { seed, l } of landmarks(codes('LM', 20), 6)) {
    const r = W.regionAt(seed, l.x, l.y);
    assert.equal(l.region, r);
    assert.ok(LM.kinds[l.kind].regions.includes(W.REGIONS[r]), `${l.id} is a ${l.kind} in the ${W.REGIONS[r]}`);
    seen.add(l.kind + ' in the ' + W.REGIONS[r]);
  }
  for (const [kind, k] of Object.entries(LM.kinds)) for (const r of k.regions) assert.ok(seen.has(kind + ' in the ' + r), 'no ' + kind + ' in the ' + r);
});

test('each kind of landmark has its shape: delta fan, lava tube, giant crater, methane vent, ice scarp, star dune', () => {
  const count = {};
  for (const { seed, l } of landmarks(codes('LMS', 4), 6)) {
    const cache = new Map(), at = (x, y) => tileAt(seed, x, y, cache), tiles = boxTiles(seed, l.box, cache);
    const of = code => tiles.filter(t => t[2] === code), d2 = (x, y) => (x - l.x) * (x - l.x) + (y - l.y) * (y - l.y);
    count[l.kind] = (count[l.kind] || 0) + 1;
    if (l.kind === 'delta') {
      // A fan of sediment within 17 tiles of its apex, all of it walkable.
      const fan = of(T.SEDIMENT), ax = l.apex[0], ay = l.apex[1];
      assert.ok(fan.length > 200, `${l.id}: ${fan.length} sediment tiles`);
      for (const [x, y] of fan) assert.ok((x - ax) * (x - ax) + (y - ay) * (y - ay) <= 17 * 17, `${l.id}: sediment at ${x},${y}`);
      assert.ok(tiles.every(t => !W.BLOCKING[t[2]]), `${l.id}: nothing blocks on a delta`);
    } else if (l.kind === 'tube') {
      // A floor 3 tiles wide and 25–35 long, walled all round but for one skylight in its south (or east) wall.
      const floor = of(T.TUBE_FLOOR), sky = of(T.SKYLIGHT), len = 2 * l.a + 1;
      assert.ok(len >= 25 && len <= 35, `${l.id}: ${len} long`);
      assert.equal(floor.length, 3 * len, `${l.id}: the floor`);
      assert.equal(sky.length, 1, `${l.id}: one skylight`);
      for (const [x, y] of floor) for (const [dx, dy] of N4) {
        assert.ok([T.TUBE_FLOOR, T.TUBE_WALL, T.SKYLIGHT].includes(at(x + dx, y + dy)), `${l.id}: the floor at ${x},${y} opens onto the ground`);
      }
      const [sx, sy] = sky[0], [ox, oy] = l.vert ? [1, 0] : [0, 1];
      assert.equal(at(sx - ox, sy - oy), T.TUBE_FLOOR, `${l.id}: the skylight opens onto the floor`);
      assert.equal(W.BLOCKING[at(sx + ox, sy + oy)], 0, `${l.id}: and onto open ground ${l.vert ? 'east' : 'south'} of it`);
    } else if (l.kind === 'crater') {
      // A rim 20 tiles across (radius 10) with gaps, a floor with ice on it and a peak of 3×3 cliff in the middle.
      for (const [x, y] of of(T.RIM)) assert.ok(d2(x, y) > 81 && d2(x, y) <= 110.25, `${l.id}: rim at ${x},${y}`);
      assert.ok(of(T.RAMP).length >= 3, `${l.id}: gaps in the rim`);
      assert.ok(of(T.ICE).some(([x, y]) => d2(x, y) <= 81), `${l.id}: ice on the floor`);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.equal(at(l.x + dx, l.y + dy), T.CLIFF, `${l.id}: the peak`);
    } else if (l.kind === 'methane') {
      // A vent in the open: nothing blocks round it.
      assert.ok(tiles.every(t => !W.BLOCKING[t[2]]), `${l.id}: nothing blocks round the vent`);
    } else if (l.kind === 'scarp') {
      // A cliff of ice 31 tiles long and 2 thick, its ends 4 tiles further south than its middle, with 2 rows of ice at its foot.
      const top = dx => tiles.find(t => t[0] === l.x + dx && t[2] === T.SCARP)[1];
      for (let dx = -15; dx <= 15; dx++) {
        const y = top(dx);
        assert.deepEqual([at(l.x + dx, y + 1), at(l.x + dx, y + 2), at(l.x + dx, y + 3)], [T.SCARP, T.ICE, T.ICE], `${l.id}: column ${dx}`);
        assert.equal(of(T.SCARP).filter(t => t[0] === l.x + dx).length, 2, `${l.id}: column ${dx} is 2 thick`);
      }
      assert.equal(top(15) - top(0), 4, `${l.id}: bowed`);
      assert.equal(top(-15) - top(0), 4, `${l.id}: bowed`);
      assert.equal(of(T.SCARP).length, 62, `${l.id}: 31 long`);
    } else {
      // A star dune: 3–5 arms round a summit; the crest (the summit and the arms' ridges) is one walkable path.
      assert.ok(l.arms.length >= 3 && l.arms.length <= 5, `${l.id}: ${l.arms.length} arms`);
      const crest = of(T.CREST), w = l.box[2] - l.box[0] + 1, open = Uint8Array.from(tiles, t => (t[2] === T.CREST ? 1 : 0));
      assert.equal(at(l.x, l.y), T.CREST, `${l.id}: the summit`);
      const seen = flood(open, w, [(l.y - l.box[1]) * w + l.x - l.box[0]]);
      assert.equal(seen.reduce((a, b) => a + b, 0), crest.length, `${l.id}: the crest is one path`);
      assert.ok(crest.length >= 3 * 11, `${l.id}: ${crest.length} crest tiles`);
    }
  }
  assert.deepEqual(Object.keys(count).sort(), Object.keys(LM.kinds).sort(), JSON.stringify(count));
});

test("every open tile in a landmark's box connects to the box's outer ring, which is all open, so a landmark cuts no ground off", () => {
  let n = 0;
  for (const { seed, l } of landmarks(codes('LMR', 6), 4)) {
    n++;
    const b = l.box, w = b[2] - b[0] + 1, h = b[3] - b[1] + 1, tiles = boxTiles(seed, b, new Map());
    const open = Uint8Array.from(tiles, t => (W.BLOCKING[t[2]] ? 0 : 1)), ring = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) ring.push(y * w + x);
    for (const i of ring) assert.equal(open[i], 1, `${l.id}: its ring at ${tiles[i][0]},${tiles[i][1]} is blocked`);
    const seen = flood(open, w, ring);
    open.forEach((o, i) => assert.ok(!o || seen[i], `${l.id} (${l.kind}): the open tile ${tiles[i][0]},${tiles[i][1]} is cut off`));
  }
  assert.ok(n > 100, 'landmarks checked: ' + n);
});

test("a landmark's sites are finds on open ground in its box, with ids ('<landmark id>:<n>') that can't be a find's", () => {
  const FIND_ID = /^-?\d+,-?\d+:\d+$/;
  const ON = { delta: [T.SEDIMENT], tube: [T.TUBE_FLOOR], crater: [T.CRATER_FLOOR, T.ICE], scarp: [T.ICE] };
  let n = 0;
  for (const { seed, l } of landmarks(codes('LMS', 4), 6)) {
    const cache = new Map();
    assert.deepEqual(l.sites.map(f => f.kind), LM.kinds[l.kind].sites, l.id);
    l.sites.forEach((f, i) => {
      n++;
      const t = tileAt(seed, f.x, f.y, cache);
      assert.equal(f.n, i);
      assert.ok(inBox(l.box, f.x, f.y), `${l.id}:${i} is in its box`);
      assert.equal(W.BLOCKING[t], 0, `${l.id}:${i} is on open ground`);
      if (ON[l.kind]) assert.ok(ON[l.kind].includes(t), `${l.id}:${i} (${l.kind}) stands on tile ${t}`);
      assert.equal(f.ring, W.ringOf(f.x, f.y));
      assert.equal(f.region, W.regionAt(seed, f.x, f.y));
      assert.equal(f.sub, f.kind !== 'science' ? undefined : l.kind === 'methane' ? 'vent' : l.kind, `${l.id}:${i}: its subject`);
      assert.doesNotMatch(l.id + ':' + i, FIND_ID);
    });
  }
  assert.ok(n > 300, 'sites checked: ' + n);
});

test('a chunk lists the landmarks that touch it, the same one (by id) in each, and hides the finds and caves under them', () => {
  let finds = 0, caves = 0, shown = 0;
  for (const { seed, l } of landmarks(codes('LMH', 4), 6)) {
    const b = l.box;
    for (let cy = Math.floor(b[1] / 32); cy <= Math.floor(b[3] / 32); cy++) for (let cx = Math.floor(b[0] / 32); cx <= Math.floor(b[2] / 32); cx++) {
      const c = W.chunk(seed, cx, cy), x0 = cx * 32, y0 = cy * 32;
      // By id: the same landmark, though not always the same object (the world's memo of features is cleared when it grows).
      assert.deepEqual(c.landmarks.find(k => k.id === l.id), l, `chunk ${cx},${cy} lists ${l.id}`);
      assert.deepEqual(c.landmarks.map(k => k.id), W.landmarksNear(seed, x0, y0, x0 + 31, y0 + 31).map(k => k.id));
      // Hidden by index: the lists are as they were, so every saved find id still names the same find.
      const under = (x, y) => c.landmarks.some(k => inBox(k.box, x, y));
      assert.deepEqual(c.hidden.finds, c.finds.filter(f => under(f.x, f.y)).map(f => f.n), `chunk ${cx},${cy}: hidden finds`);
      assert.deepEqual(c.hidden.caves, c.caves.filter(k => under(k.x, k.y) || under(k.x, k.y - 1)).map(k => k.n), `chunk ${cx},${cy}: hidden caves`);
      assert.ok(Object.isFrozen(c.hidden) && Object.isFrozen(c.hidden.finds) && Object.isFrozen(c.landmarks));
      finds += c.hidden.finds.length;
      caves += c.hidden.caves.length;
      shown += c.finds.length - c.hidden.finds.length;
    }
  }
  assert.ok(finds > 20 && caves > 5 && shown > finds, `hidden finds ${finds}, hidden caves ${caves}, shown finds ${shown}`);
});
