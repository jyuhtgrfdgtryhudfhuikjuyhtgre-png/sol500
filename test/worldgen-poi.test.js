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
// Every landmark (or structure) in the half × half cells either side of the base, for each mission code.
function* landmarks(list, half, at = W.landmarkAt) {
  for (const code of list) {
    const seed = W.seedOf(code);
    for (let j = -half; j < half; j++) for (let i = -half; i < half; i++) { const l = at(seed, i, j); if (l) yield { seed, l }; }
  }
}
const structures = (list, half) => landmarks(list, half, W.structureAt);
// The finds and caves a chunk must hide, by index: the ones under a landmark's box or a structure's footprint (a cave by
// its mouth or its wall). The lists are as they were, so every saved find id still names the same find.
function hiddenOf(c) {
  const under = (x, y) => c.landmarks.some(k => inBox(k.box, x, y)) || c.structures.some(s => inBox(s.box, x, y));
  return { finds: c.finds.filter(f => under(f.x, f.y)).map(f => f.n), caves: c.caves.filter(k => under(k.x, k.y) || under(k.x, k.y - 1)).map(k => k.n) };
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
      assert.deepEqual(sky[0].slice(0, 2), l.skylight, `${l.id}: where it says its skylight is`);
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
      assert.deepEqual(c.hidden, hiddenOf(c), `chunk ${cx},${cy}: hidden finds and caves`);
      assert.ok(Object.isFrozen(c.hidden) && Object.isFrozen(c.hidden.finds) && Object.isFrozen(c.landmarks));
      finds += c.hidden.finds.length;
      caves += c.hidden.caves.length;
      shown += c.finds.length - c.hidden.finds.length;
    }
  }
  assert.ok(finds > 20 && caves > 5 && shown > finds, `hidden finds ${finds}, hidden caves ${caves}, shown finds ${shown}`);
});

const ST = D.STRUCTURES;
const GROUND = [T.REGOLITH, T.SAND, T.DUNE, T.ICE, T.POLYGON, T.LAVA]; // a region's own ground: no feature, no boulder
const apronOf = b => [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1];

test("structures: one in a 64-tile cell at its region's chance, inside the cell, 20 tiles from the base, clear of landmarks and features", () => {
  const cells = W.REGIONS.map(() => 0), placed = W.REGIONS.map(() => 0), kinds = {};
  for (const code of codes('ST', 6)) {
    const seed = W.seedOf(code);
    for (let j = -12; j < 12; j++) for (let i = -12; i < 12; i++) {
      const r = W.regionAt(seed, i * ST.cell + 32, j * ST.cell + 32), s = W.structureAt(seed, i, j);
      cells[r]++;
      if (!s) continue;
      placed[r]++;
      kinds[s.kind] = (kinds[s.kind] || 0) + 1;
      const b = s.box, a = apronOf(b), x0 = i * ST.cell, y0 = j * ST.cell;
      assert.equal(s.id, 'S' + i + ',' + j);
      assert.deepEqual([b[2] - b[0] + 1, b[3] - b[1] + 1], ST.kinds[s.kind].size, `${s.id}: a ${s.kind}'s size`);
      // Its apron 2 tiles inside the cell, so two structures never touch and a chunk (inside one cell) looks up only its own.
      assert.ok(a[0] >= x0 + 2 && a[1] >= y0 + 2 && a[2] <= x0 + ST.cell - 3 && a[3] <= y0 + ST.cell - 3, `${s.id}: box ${b}`);
      const dx = Math.max(b[0], 0, -b[2]), dy = Math.max(b[1], 0, -b[3]);
      assert.ok(dx * dx + dy * dy >= ST.clear * ST.clear, `${s.id}: box ${b} comes within 20 tiles of the HQ`);
      assert.equal(W.landmarksNear(seed, ...a).length, 0, `${s.id}: on a landmark`);
      const f = W.featuresNear(seed, ...a);
      assert.equal(f.canyons.length + f.craters.length + f.mesas.length, 0, `${s.id}: on a feature`);
      assert.equal(s.region, W.regionAt(seed, s.x, s.y), `${s.id}: its region is its door's`);
      assert.ok(Object.isFrozen(s) && Object.isFrozen(s.box), 'frozen');
    }
  }
  assert.deepEqual(Object.keys(kinds).sort(), Object.keys(ST.kinds).sort(), JSON.stringify(kinds));
  // By the region at the cell's centre: flat ground is rarer where the features are, so a few chances fall short.
  W.REGIONS.forEach((r, k) => {
    const rate = placed[k] / cells[k];
    assert.ok(rate > ST.chance[r] - 0.1 && rate < ST.chance[r] + 0.05, `${r}: structures in ${(100 * rate).toFixed(1)} % of its cells`);
  });
});

test("each structure is stamped on flat ground: a solid footprint, or a hab pod's walls round a 3×3 floor with its door in the south wall, in a ring of open ground", () => {
  let pods = 0;
  for (const { seed, l: s } of structures(codes('STS', 4), 8)) {
    const cache = new Map(), b = s.box, w = b[2] - b[0] + 1;
    for (const [x, y, t] of boxTiles(seed, apronOf(b), cache)) {
      if (!inBox(b, x, y)) assert.ok(GROUND.includes(t), `${s.id}: its apron at ${x},${y} is tile ${t}`);
      else if (s.kind !== 'pod') assert.equal(t, T.STRUCT_WALL, `${s.id}: the ${s.kind} at ${x},${y}`);
      else {
        const edge = x === b[0] || x === b[2] || y === b[1] || y === b[3];
        assert.equal(t, edge && !(x === s.x && y === s.y) ? T.STRUCT_WALL : T.STRUCT_FLOOR, `${s.id}: the pod at ${x},${y}`);
      }
    }
    // The door: the gap in a pod's south wall, or the open tile just south of the middle of the others' south face.
    assert.deepEqual([s.x, s.y], [b[0] + (w >> 1), s.kind === 'pod' ? b[3] : b[3] + 1], s.id);
    if (s.kind === 'pod') pods++;
  }
  assert.ok(pods > 10, 'pods checked: ' + pods);
});

test("every structure's door can be reached from the border of the 96×96 window round it (§2.3), and reachesOut says so", () => {
  let n = 0;
  for (const { seed, l: s } of structures(codes('STR', 2), 6)) {
    n++;
    // A flood fill of the stamped world from the window's border reaches the door.
    const x0 = s.x - 48, y0 = s.y - 48, tiles = boxTiles(seed, [x0, y0, x0 + 95, y0 + 95], new Map());
    const open = Uint8Array.from(tiles, t => (W.BLOCKING[t[2]] ? 0 : 1)), border = [];
    for (let k = 0; k < 96; k++) border.push(k, 95 * 96 + k, k * 96, k * 96 + 95);
    assert.equal(flood(open, 96, border)[48 * 96 + 48], 1, `${s.id}: its door at ${s.x},${s.y} is cut off`);
    assert.ok(W.reachesOut(seed, s.x, s.box[3] + 1, s.box), s.id);
  }
  assert.ok(n > 50, 'structures checked: ' + n);
  // And it says no from a closed pocket: the middle of a mesa, walled in by its cliff.
  const seed = W.seedOf('STR-0'), m = W.featuresNear(seed, -600, -600, 599, 599).mesas[0];
  assert.equal(W.reachesOut(seed, m.x, m.y), false, `the middle of the mesa at ${m.x},${m.y}`);
  assert.equal(W.reachesOut(seed, m.box[0] - 2, m.y), true, 'beside it');
});

test('a chunk lists the structures whose footprint or apron touches it, and hides the finds and caves under their footprints', () => {
  let n = 0, finds = 0;
  for (const { seed, l: s } of structures(codes('STH', 6), 12)) {
    const a = apronOf(s.box);
    for (let cy = Math.floor(a[1] / 32); cy <= Math.floor(a[3] / 32); cy++) for (let cx = Math.floor(a[0] / 32); cx <= Math.floor(a[2] / 32); cx++) {
      const c = W.chunk(seed, cx, cy), x0 = cx * 32, y0 = cy * 32;
      n++;
      assert.deepEqual(c.structures.find(k => k.id === s.id), s, `chunk ${cx},${cy} lists ${s.id}`);
      assert.deepEqual(c.structures.map(k => k.id), W.structuresNear(seed, x0, y0, x0 + 31, y0 + 31).map(k => k.id));
      assert.deepEqual(c.hidden, hiddenOf(c), `chunk ${cx},${cy}: hidden finds and caves`);
      assert.ok(Object.isFrozen(c.structures));
      finds += c.finds.filter(f => inBox(s.box, f.x, f.y)).length;
    }
  }
  assert.ok(n > 1000 && finds > 5, `chunks checked ${n}, finds under a footprint ${finds}`);
});

const FM = D.FORMATIONS, PLAIN = [T.REGOLITH, T.SAND, T.DUNE, T.ICE, T.POLYGON, T.LAVA];

test('formations have a square of 2 or 3 tiles (the art reads at both) and decor has 4 to 6 kinds in every region', () => {
  const sizes = Object.fromEntries(Object.entries(FM.kinds).map(([id, k]) => [id, k.size]));
  assert.deepEqual(sizes, { arch: 3, yardang: 3, hoodoo: 2, balanced: 2, ventifact: 2, layered: 3, deviltracks: 3 });
  assert.ok(FM.chance > 0 && FM.chance <= 1);
  assert.deepEqual(Object.keys(D.DECOR.kinds).sort(), W.REGIONS.slice().sort());
  for (const [r, kinds] of Object.entries(D.DECOR.kinds)) {
    assert.ok(kinds.length >= 4 && kinds.length <= 6 && new Set(kinds).size === kinds.length, r + ': ' + kinds.join(', '));
  }
});

test('formations: at most one a chunk, of its region, on plain ground clear of finds, caves and footprints; about 1 in 3 a science site', () => {
  let chunks = 0, n = 0, science = 0;
  const seen = new Set();
  for (const code of codes('FM', 4)) {
    const seed = W.seedOf(code);
    for (let cy = -12; cy < 12; cy++) for (let cx = -12; cx < 12; cx++) {
      const c = W.chunk(seed, cx, cy);
      chunks++;
      assert.ok(c.formations.length <= 1 && Object.isFrozen(c.formations), `chunk ${cx},${cy}`);
      for (const f of c.formations) {
        n++;
        const b = f.box, s = FM.kinds[f.kind].size, at = (x, y) => W.tileOf(c, x - cx * 32, y - cy * 32);
        assert.equal(f.id, 'F' + cx + ',' + cy);
        assert.equal(f.region, W.regionAt(seed, f.x, f.y));
        assert.ok(FM.kinds[f.kind].regions.includes(W.REGIONS[f.region]), `${f.id}: a ${f.kind} in the ${W.REGIONS[f.region]}`);
        seen.add(f.kind + ' in the ' + W.REGIONS[f.region]);
        // Its square, s tiles a side, just north of its spot, inside the chunk.
        assert.deepEqual(b, [f.x - (s >> 1), f.y - s, f.x - (s >> 1) + s - 1, f.y - 1], f.id);
        assert.ok(b[0] >= cx * 32 && b[1] >= cy * 32 && b[2] < cx * 32 + 32 && f.y < cy * 32 + 32, `${f.id} is inside its chunk`);
        const spots = [[f.x, f.y]];
        for (let y = b[1]; y <= b[3]; y++) for (let x = b[0]; x <= b[2]; x++) spots.push([x, y]);
        for (const [x, y] of spots) {
          assert.ok(PLAIN.includes(at(x, y)), `${f.id}: plain ground at ${x},${y}, not tile ${at(x, y)}`);
          assert.ok(x * x + y * y > (W.FLAT_RADIUS + 1) * (W.FLAT_RADIUS + 1), `${f.id} is in the flat zone`);
          assert.ok(!c.finds.some(k => k.x === x && k.y === y) && !c.caves.some(k => k.x === x && k.y === y), `${f.id}: a find or a cave at ${x},${y}`);
        }
        const ring = [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1];
        assert.equal(W.landmarksNear(seed, ...ring).length, 0, `${f.id}: on a landmark`);
        assert.equal(W.structuresNear(seed, ...ring).length, 0, `${f.id}: by a structure`);
        // About 1 in 3 is also a science site, surveyed from its spot.
        if (f.sites.length) {
          science++;
          assert.deepEqual(f.sites, [{ n: 0, x: f.x, y: f.y, kind: 'science', ring: W.ringOf(f.x, f.y), region: f.region, sub: f.kind }]);
        }
      }
    }
  }
  assert.ok(n > chunks / 4, `formations in ${n} of ${chunks} chunks`);
  assert.ok(science / n > 0.28 && science / n < 0.39, `science sites: ${science} of ${n}`);
  for (const [kind, k] of Object.entries(FM.kinds)) for (const r of k.regions) assert.ok(seen.has(kind + ' in the ' + r), 'no ' + kind + ' in the ' + r);
});

test("decor: props of their region's kinds on open ground, never on a formation, and every kind turns up", () => {
  const GROUND = [...PLAIN, T.CRATER_FLOOR, T.CANYON_FLOOR], seen = new Set();
  let n = 0;
  for (const code of codes('DC', 6)) {
    const seed = W.seedOf(code);
    for (let cy = -8; cy < 8; cy++) for (let cx = -8; cx < 8; cx++) {
      const c = W.chunk(seed, cx, cy);
      assert.ok(Object.isFrozen(c.props) && c.props.length <= D.DECOR.props);
      for (const p of c.props) {
        n++;
        const lx = p.x - cx * 32, ly = p.y - cy * 32, r = W.regionOf(c, lx, ly);
        assert.ok(lx >= 0 && lx < 32 && ly >= 0 && ly < 32, 'inside its chunk');
        assert.ok(GROUND.includes(W.tileOf(c, lx, ly)), `a ${p.kind} on tile ${W.tileOf(c, lx, ly)}`);
        assert.ok(D.DECOR.kinds[W.REGIONS[r]].includes(p.kind), `a ${p.kind} in the ${W.REGIONS[r]}`);
        assert.ok(!c.formations.some(f => inBox(f.box, p.x, p.y)), `a ${p.kind} on a formation`);
        seen.add(W.REGIONS[r] + ' ' + p.kind);
      }
    }
  }
  assert.ok(n > 4000, 'props: ' + n);
  for (const [r, kinds] of Object.entries(D.DECOR.kinds)) for (const k of kinds) assert.ok(seen.has(r + ' ' + k), `no ${k} in the ${r}`);
});

test('one point of interest to a cell: no two footprints (a structure with its apron) overlap or touch', () => {
  const touch = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  let n = 0;
  for (const code of codes('ONE', 3)) {
    const seed = W.seedOf(code), all = [];
    for (let j = -4; j < 4; j++) for (let i = -4; i < 4; i++) { const l = W.landmarkAt(seed, i, j); if (l) all.push([l.id, l.box]); }
    for (let j = -16; j < 16; j++) for (let i = -16; i < 16; i++) { const s = W.structureAt(seed, i, j); if (s) all.push([s.id, apronOf(s.box)]); }
    n += all.length;
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
      assert.ok(!touch(all[a][1], all[b][1]), `${all[a][0]} ${all[a][1]} touches ${all[b][0]} ${all[b][1]}`);
    }
  }
  assert.ok(n > 900, 'footprints: ' + n);
});

test('every chunk comes out the same, points of interest and all, whatever was built before it, in a fresh copy of the world too', () => {
  // A second copy of src/worldgen.js, with memos of its own, builds the chunks backwards with others in between.
  delete require.cache[require.resolve('../src/worldgen.js')];
  const W2 = require('../src/worldgen.js'), seed = W.seedOf('ORDER-1'), coords = [], seen = { l: 0, s: 0, f: 0 };
  assert.notEqual(W2, W);
  for (let cy = -8; cy < 8; cy++) for (let cx = -8; cx < 8; cx++) coords.push([cx, cy]);
  const key = c => JSON.stringify([Array.from(c.tiles), Array.from(c.regions), c.finds, c.caves, c.hidden, c.landmarks, c.structures, c.formations, c.props]);
  const first = coords.map(([cx, cy]) => {
    const c = W.chunk(seed, cx, cy);
    seen.l += c.landmarks.length; seen.s += c.structures.length; seen.f += c.formations.length;
    return key(c);
  });
  for (let k = coords.length - 1; k >= 0; k--) {
    W2.chunk(seed, coords[k][0] + 1, coords[k][1] - 1);
    assert.equal(key(W2.chunk(seed, coords[k][0], coords[k][1])), first[k], 'chunk ' + coords[k]);
  }
  // And built again in the first copy, after all that: what it keeps between chunks never leaks into a chunk.
  coords.forEach(([cx, cy], k) => assert.equal(key(W.chunk(seed, cx, cy)), first[k], 'chunk ' + cx + ',' + cy + ' again'));
  assert.ok(seen.l > 3 && seen.s > 10 && seen.f > 20, JSON.stringify(seen));
});
