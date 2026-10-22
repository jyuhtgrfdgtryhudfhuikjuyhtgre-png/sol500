/*
 * SOL 500 — the endless world. Every tile is a pure function of (seed, x, y), so a chunk can be built in any order,
 * on any client or on the server, and always comes out byte-identical. The world is never sent over the network.
 *
 * Determinism rules: integer hashing with Math.imul; the only floating-point maths is + − × ÷, %, Math.sqrt,
 * Math.floor/ceil/abs/min/max, which IEEE 754 makes identical in every JavaScript engine. Math.sin/cos/atan2/pow/
 * exp/hypot are never used here (engines may round them differently), and neither is Math.random.
 *
 * World tiles are integers in both directions (negative too). The base's 9×5 build grid has its top-left at
 * (−4, −2), so the HQ is at (0, 0). Nothing that blocks is ever placed within FLAT_RADIUS tiles of the HQ.
 *
 * API: seedOf(missionSeed) → uint32 · regionAt(seed, x, y) → index into REGIONS
 *      chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512), finds, caves, hidden, landmarks }
 *        (32×32, row-major)
 *        finds: [{ n, x, y, kind, ring, region, sub? }] in world tiles; a find's id is "<cx>,<cy>:<n>"
 *        caves: [{ n, x, y, region }] in world tiles: a cave's mouth, an open tile; its wall is the tile north of it
 *        hidden: { finds: [n], caves: [n] }: the ones under a point of interest's footprint. They keep their place in the
 *          lists, so every id stays stable; src/expedition.js leaves them out.
 *        landmarks: the ones whose box touches the chunk: { id: "L<i>,<j>", kind, i, j, x, y (its centre), region,
 *          box: [x0, y0, x1, y1] (its footprint, inclusive), sites: finds as above (a site's id is "<landmark id>:<n>"),
 *          and its shape (delta: dir, apex · tube: a, vert, s · crater: r, gaps · stardune: arms) }
 *      ringOf(x, y) → 0 inner · 1 middle · 2 outer · 3 far
 *      tileOf(chunk, lx, ly) · regionOf(chunk, lx, ly)
 *      featuresNear(seed, x0, y0, x1, y1) → { canyons, craters, mesas } touching that tile box (inclusive)
 *      landmarkAt(seed, i, j) → the landmark of cell (i, j) of the 256-tile grid, or null · landmarksNear(seed, x0, y0, x1, y1)
 *      hash(seed, a, b, c) → uint32 · unit(h) → [0, 1) · noise(seed, salt, x, y, size) → [0, 1]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.SolWorldgen = factory(root.SolData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const CHUNK = 32;
  // SEDIMENT is a river delta's fan, SCARP an ice scarp's cliff and CREST the ridge of a star dune (landmarks, M4c).
  const TILE = {
    REGOLITH: 0, SAND: 1, DUNE: 2, BOULDER: 3, CLIFF: 4, RIM: 5, CRATER_FLOOR: 6, CANYON_FLOOR: 7, CANYON_WALL: 8,
    RAMP: 9, ICE: 10, POLYGON: 11, LAVA: 12, TUBE_FLOOR: 13, TUBE_WALL: 14, SKYLIGHT: 15, STRUCT_FLOOR: 16,
    STRUCT_WALL: 17, BASE: 18, SEDIMENT: 19, SCARP: 20, CREST: 21,
  };
  const NONE = 255; // "no feature here" in the feature layer
  const BLOCKING = new Uint8Array(32);
  for (const k of ['BOULDER', 'CLIFF', 'RIM', 'CANYON_WALL', 'TUBE_WALL', 'STRUCT_WALL', 'SCARP']) BLOCKING[TILE[k]] = 1;
  // Walking speed on each tile (the rover ignores it). A star dune's crest is sand too.
  const SPEED = [];
  for (let i = 0; i < 32; i++) SPEED.push(1);
  SPEED[TILE.DUNE] = SPEED[TILE.CREST] = 0.7;

  const REGIONS = ['plains', 'dunes', 'craters', 'canyons', 'icy', 'volcanic'];
  const R = { PLAINS: 0, DUNES: 1, CRATERS: 2, CANYONS: 3, ICY: 4, VOLCANIC: 5 };
  const BASE_RECT = { x: -4, y: -2, w: 9, h: 5 };
  const FLAT_RADIUS = 12;
  const REGION_CELL = 224, REGION_JITTER = 72, REGION_BLEND = 6;

  // Sixteen compass directions as exact constants (no trigonometry at run time).
  const C1 = 0.9238795325112867, C2 = 0.7071067811865476, C3 = 0.3826834323650898;
  const DIRS16 = [[1, 0], [C1, C3], [C2, C2], [C3, C1], [0, 1], [-C3, C1], [-C2, C2], [-C1, C3],
    [-1, 0], [-C1, -C3], [-C2, -C2], [-C3, -C1], [0, -1], [C3, -C1], [C2, -C2], [C1, -C3]];

  // ---------- hashing and noise ----------
  function mix(h) {
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function hash(seed, a, b, c) {
    let h = mix((seed ^ Math.imul(a | 0, 0x27d4eb2d)) >>> 0);
    h = mix((h ^ Math.imul(b | 0, 0x165667b1)) >>> 0);
    return mix((h ^ Math.imul((c | 0) + 0x5bd1e995, 0x9e3779b1)) >>> 0);
  }
  const unit = h => h / 4294967296;

  function seedOf(missionSeed) {
    const s = String(missionSeed) + '|world';
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return mix(h >>> 0);
  }

  // Smooth value noise, 0..1, on a lattice `size` tiles apart.
  function noise(seed, salt, x, y, size) {
    const fx = Math.floor(x / size), fy = Math.floor(y / size);
    const tx = (x - fx * size) / size, ty = (y - fy * size) / size;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = unit(hash(seed, fx, fy, salt)), b = unit(hash(seed, fx + 1, fy, salt));
    const c = unit(hash(seed, fx, fy + 1, salt)), d = unit(hash(seed, fx + 1, fy + 1, salt));
    const top = a + (b - a) * sx, bottom = c + (d - c) * sx;
    return top + (bottom - top) * sy;
  }

  // ---------- regions: a jittered Voronoi diagram on a 224-tile grid ----------
  const siteMemo = new Map();
  function regionSite(seed, i, j) {
    const k = seed + ':' + i + ':' + j;
    let s = siteMemo.get(k);
    if (s) return s;
    if (i === 0 && j === 0) s = [0, 0, R.PLAINS]; // the base's cell: its site is the HQ and it is always Plains
    else {
      const h = hash(seed, i, j, 101), span = 2 * REGION_JITTER + 1;
      s = [i * REGION_CELL + (h % span) - REGION_JITTER, j * REGION_CELL + ((h >>> 12) % span) - REGION_JITTER, hash(seed, i, j, 102) % REGIONS.length];
    }
    if (siteMemo.size > 4096) siteMemo.clear();
    siteMemo.set(k, s);
    return s;
  }

  // Every site that can be the nearest or second-nearest to a tile inside the box (row-major, so the order is stable).
  function sitesFor(seed, x0, y0, x1, y1) {
    const out = [];
    const i0 = Math.floor(x0 / REGION_CELL + 0.5) - 1, i1 = Math.floor(x1 / REGION_CELL + 0.5) + 1;
    const j0 = Math.floor(y0 / REGION_CELL + 0.5) - 1, j1 = Math.floor(y1 / REGION_CELL + 0.5) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(regionSite(seed, i, j));
    return out;
  }

  function regionFrom(seed, sites, x, y) {
    let d1 = Infinity, d2 = Infinity, r1 = 0, r2 = 0;
    for (let n = 0; n < sites.length; n++) {
      const s = sites[n];
      const dx = x - s[0], dy = y - s[1], d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; r2 = r1; d1 = d; r1 = s[2]; } else if (d < d2) { d2 = d; r2 = s[2]; }
    }
    if (r1 === r2) return r1;
    const gap = Math.sqrt(d2) - Math.sqrt(d1);
    if (gap >= REGION_BLEND) return r1;
    // Borders are dithered over about REGION_BLEND tiles so the colours blend.
    return unit(hash(seed, x, y, 103)) < 0.5 + 0.5 * gap / REGION_BLEND ? r1 : r2;
  }

  function regionAt(seed, x, y) { return regionFrom(seed, sitesFor(seed, x, y, x, y), x, y); }

  // ---------- ground and boulders ----------
  function ground(seed, r, x, y) {
    if (r === R.DUNES) return noise(seed, 11, x, y, 7) > 0.36 ? TILE.DUNE : TILE.SAND;
    if (r === R.ICY) return noise(seed, 12, x, y, 14) > 0.66 ? TILE.ICE : TILE.POLYGON;
    if (r === R.VOLCANIC) return TILE.LAVA;
    return noise(seed, 13, x, y, 20) > 0.72 ? TILE.SAND : TILE.REGOLITH;
  }

  // Chance that a tile is a boulder candidate, before thinning. The Volcanic Flanks have boulder fields.
  const BOULDERS = [0.1, 0.03, 0.12, 0.12, 0.05, 0];
  function boulderChance(seed, r, x, y) {
    return r === R.VOLCANIC ? 0.15 + 0.5 * noise(seed, 14, x, y, 18) : BOULDERS[r];
  }

  const inFlat = (x, y) => x * x + y * y <= (FLAT_RADIUS + 1) * (FLAT_RADIUS + 1);
  const inBase = (x, y) => x >= BASE_RECT.x && y >= BASE_RECT.y && x < BASE_RECT.x + BASE_RECT.w && y < BASE_RECT.y + BASE_RECT.h;
  const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

  // A boulder stands alone: it is the strongest candidate among its eight neighbours and no feature touches it.
  // Isolated single tiles can never close off a pocket of open ground.
  function isBoulder(feat, cand, n, w) {
    const v = cand[n];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const m = n + dy * w + dx;
      if (feat[m] !== NONE || cand[m] >= v) return false;
    }
    return true;
  }

  // ---------- features: one per cell on coarse grids, bounded and spaced so open ground stays connected ----------
  const CODE = {}; // kind → (feature, x, y) → tile code or NONE
  const MESA_CELL = 48, CRATER_CELL = 64, CANYON_CELL = 128;
  const MESA_CHANCE = [0.35, 0.1, 0.2, 0.6, 0.15, 0.3];
  const CRATER_CHANCE = [0.25, 0.1, 0.8, 0.15, 0.2, 0.15];
  const CANYON_CHANCE = 0.85;      // per cell inside Canyon Lands
  const CLEAR = 3;                 // tiles always kept free between two features, and around the flat zone

  const featMemo = new Map();
  function memo(k, make) {
    if (featMemo.has(k)) return featMemo.get(k);
    const v = make();
    if (featMemo.size > 8192) featMemo.clear();
    featMemo.set(k, v);
    return v;
  }
  const grow = (b, p) => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
  const touch = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  // The squared distance from the HQ's tile to the nearest tile of a box.
  function fromHQ2(b) {
    const dx = Math.max(b[0], 0, -b[2]), dy = Math.max(b[1], 0, -b[3]);
    return dx * dx + dy * dy;
  }
  const nearBase = box => fromHQ2(grow(box, CLEAR)) <= FLAT_RADIUS * FLAT_RADIUS;
  function cellsTouching(box, size) {
    const out = [];
    for (let j = Math.floor(box[1] / size); j <= Math.floor(box[3] / size); j++) {
      for (let i = Math.floor(box[0] / size); i <= Math.floor(box[2] / size); i++) out.push([i, j]);
    }
    return out;
  }
  const regionOfCell = (seed, i, j, size) => regionAt(seed, i * size + size / 2, j * size + size / 2);

  // Canyon: in Canyon Lands, a bent segment 40–110 tiles long with a floor 3–5 wide. Both walls block, a ramp
  // crosses them every 24 tiles and the ends are open. Highest precedence of the three.
  function canyon(seed, i, j) {
    return memo('n' + seed + ':' + i + ':' + j, () => {
      if (regionOfCell(seed, i, j, CANYON_CELL) !== R.CANYONS) return null;
      if (unit(hash(seed, i, j, 201)) >= CANYON_CHANCE) return null;
      const h2 = hash(seed, i, j, 202), h3 = hash(seed, i, j, 203);
      const len = 40 + (h2 % 65);
      const hw = 1.5 + 0.5 * ((h2 >>> 8) % 3);
      const dir = DIRS16[(h2 >>> 16) % 16], dx = dir[0], dy = dir[1], nx = -dy, ny = dx;
      const b1 = (h3 % 13) - 6, b2 = ((h3 >>> 8) % 13) - 6;
      const reach = len / 2 + 6 + hw + 1;
      const room = Math.max(0, Math.floor(CANYON_CELL / 2 - 2 - reach));
      const ox = room ? ((h3 >>> 16) % (2 * room + 1)) - room : 0, oy = room ? ((h3 >>> 24) % (2 * room + 1)) - room : 0;
      const cx = i * CANYON_CELL + CANYON_CELL / 2 + ox, cy = j * CANYON_CELL + CANYON_CELL / 2 + oy;
      const pts = [
        [cx - dx * len / 2, cy - dy * len / 2],
        [cx - dx * len / 6 + nx * b1, cy - dy * len / 6 + ny * b1],
        [cx + dx * len / 6 + nx * b2, cy + dy * len / 6 + ny * b2],
        [cx + dx * len / 2, cy + dy * len / 2],
      ];
      const segs = [];
      let total = 0;
      for (let k = 0; k < 3; k++) {
        const ax = pts[k][0], ay = pts[k][1], bx = pts[k + 1][0], by = pts[k + 1][1];
        const l = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
        segs.push({ ax, ay, bx, by, l, start: total });
        total += l;
      }
      const e = hw + 1.5;
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const box = [Math.floor(Math.min(...xs) - e), Math.floor(Math.min(...ys) - e), Math.ceil(Math.max(...xs) + e), Math.ceil(Math.max(...ys) + e)];
      if (nearBase(box)) return null;
      return { kind: 'canyon', i, j, pts, segs, hw, len: total, box };
    });
  }
  CODE.canyon = function (c, x, y) {
    let best = Infinity, along = 0;
    for (let k = 0; k < 3; k++) {
      const s = c.segs[k], vx = s.bx - s.ax, vy = s.by - s.ay;
      let t = ((x - s.ax) * vx + (y - s.ay) * vy) / (s.l * s.l);
      if ((k === 0 && t < 0) || (k === 2 && t > 1)) continue; // the ends stay open
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = s.ax + vx * t - x, py = s.ay + vy * t - y, d = px * px + py * py;
      if (d < best) { best = d; along = s.start + t * s.l; }
    }
    if (best === Infinity) return NONE;
    const d = Math.sqrt(best);
    if (d <= c.hw) return TILE.CANYON_FLOOR;
    if (d > c.hw + 1) return NONE;
    return along % 24 < 3 ? TILE.RAMP : TILE.CANYON_WALL;
  };

  // Crater: radius 4–12 (6–12 in the Crater Field), a walkable floor and a blocking rim with 2–3 gaps.
  function crater(seed, i, j) {
    return memo('c' + seed + ':' + i + ':' + j, () => {
      const r0 = regionOfCell(seed, i, j, CRATER_CELL);
      if (unit(hash(seed, i, j, 301)) >= CRATER_CHANCE[r0]) return null;
      const h2 = hash(seed, i, j, 302);
      const r = r0 === R.CRATERS ? 6 + (h2 % 7) : 4 + (h2 % 6);
      const span = CRATER_CELL - 2 * (r + 3);
      const x = i * CRATER_CELL + r + 3 + ((h2 >>> 8) % span), y = j * CRATER_CELL + r + 3 + ((h2 >>> 20) % span);
      const n = 2 + ((h2 >>> 4) % 2), first = (h2 >>> 28) % 16, step = n === 2 ? 8 : 5;
      const gaps = [];
      for (let k = 0; k < n; k++) gaps.push(DIRS16[(first + k * step) % 16]);
      const box = [x - r - 1, y - r - 1, x + r + 1, y + r + 1];
      if (nearBase(box)) return null;
      for (const [a, b] of cellsTouching(grow(box, CLEAR), CANYON_CELL)) {
        const k = canyon(seed, a, b);
        if (k && touch(grow(k.box, CLEAR), box)) return null;
      }
      return { kind: 'crater', i, j, x, y, r, gaps, box };
    });
  }
  CODE.crater = function (c, x, y) {
    const dx = x - c.x, dy = y - c.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= c.r - 1) return TILE.CRATER_FLOOR;
    if (d > c.r + 0.5) return NONE;
    for (const g of c.gaps) if (dx * g[0] + dy * g[1] > 0 && Math.abs(dx * g[1] - dy * g[0]) <= 1.2) return TILE.RAMP;
    return TILE.RIM;
  };

  // Mesa: a solid star-shaped blob 4–14 tiles across, inset at least 6 tiles from its cell's edges.
  function mesa(seed, i, j) {
    return memo('m' + seed + ':' + i + ':' + j, () => {
      const r0 = regionOfCell(seed, i, j, MESA_CELL);
      if (unit(hash(seed, i, j, 401)) >= MESA_CHANCE[r0]) return null;
      const h2 = hash(seed, i, j, 402);
      const rad = 2.5 + 0.5 * (h2 % 6);
      const a1 = 0.18 * unit(hash(seed, i, j, 403)), a2 = 0.12 * unit(hash(seed, i, j, 404));
      const u1 = DIRS16[(h2 >>> 8) % 16], u2 = DIRS16[(h2 >>> 12) % 16];
      const reach = Math.ceil(rad * 1.3) + 1, lo = 6 + reach, span = MESA_CELL - 2 * lo;
      const x = i * MESA_CELL + lo + ((h2 >>> 16) % span), y = j * MESA_CELL + lo + ((h2 >>> 24) % span);
      const box = [x - reach, y - reach, x + reach, y + reach];
      if (nearBase(box)) return null;
      const g = grow(box, CLEAR);
      for (const [a, b] of cellsTouching(g, CANYON_CELL)) { const k = canyon(seed, a, b); if (k && touch(grow(k.box, CLEAR), box)) return null; }
      for (const [a, b] of cellsTouching(g, CRATER_CELL)) { const c = crater(seed, a, b); if (c && touch(grow(c.box, CLEAR), box)) return null; }
      return { kind: 'mesa', i, j, x, y, rad, a1, a2, u1, u2, box };
    });
  }
  CODE.mesa = function (m, x, y) {
    const dx = x - m.x, dy = y - m.y, d2 = dx * dx + dy * dy;
    if (d2 === 0) return TILE.CLIFF;
    const d = Math.sqrt(d2), ex = dx / d, ey = dy / d;
    const p = ex * m.u2[0] + ey * m.u2[1];
    const r = m.rad * (1 + m.a1 * (ex * m.u1[0] + ey * m.u1[1]) + m.a2 * (2 * p * p - 1));
    return d <= r ? TILE.CLIFF : NONE;
  };

  // Every feature whose box touches the tile box [x0..x1] × [y0..y1]. A box always lies inside its own cell,
  // so only the cells that touch the query box need looking at.
  function featuresNear(seed, x0, y0, x1, y1) {
    const box = [x0, y0, x1, y1];
    const pick = (size, get) => {
      const out = [];
      for (const [i, j] of cellsTouching(box, size)) { const f = get(seed, i, j); if (f && touch(f.box, box)) out.push(f); }
      return out;
    };
    return { canyons: pick(CANYON_CELL, canyon), craters: pick(CRATER_CELL, crater), mesas: pick(MESA_CELL, mesa) };
  }

  // Precedence when features overlap: canyon > crater > mesa (CLEAR keeps them apart, but the order is fixed).
  function featureAt(f, x, y) {
    for (const list of [f.canyons, f.craters, f.mesas]) {
      for (const g of list) {
        if (!inBox(g.box, x, y)) continue;
        const t = CODE[g.kind](g, x, y);
        if (t !== NONE) return t;
      }
    }
    return NONE;
  }

  // ---------- finds (spec §2.4): darts thrown inside the chunk, 3 tiles from its edges ----------
  // A chunk places its own finds without looking at its neighbours. Every find stands on open ground, and the reachability
  // test proves all open ground near the base is connected, so every find can be reached on foot.
  const RINGS = [20, 40, 80];                   // inner ≤ 20 < middle ≤ 40 < outer ≤ 80 < far, in tiles from the HQ
  const FIND_KINDS = ['ice', 'metal', 'pod', 'science'];
  const FIND_DARTS = 24, FIND_EDGE = 3, FIND_GAP = 5; // dart i hashes salts 500 + i, 540 + i and 580 + i: keep FIND_DARTS ≤ 40
  const FIND_DENSITY = [1.6, 0.8, 1.6, 1.6, 1.8, 1.6]; // finds a chunk aims for, by region (the Dune Sea has few)
  const RING_DENSITY = [0.3, 0.6, 1, 1];               // fewer finds close to the base
  const KIND_WEIGHTS = [                             // ice, metal, pod, science, by region
    [0, 1.5, 1.5, 0.5], [0, 1.2, 2.5, 0.35], [0, 1.5, 0, 0.75], [0, 1.5, 0, 0.75], [6, 0.6, 0, 0.35], [0, 2.25, 0, 0.35],
  ];
  const ICY_GROUND = new Uint8Array(32);             // ice deposits lie in crater floors and canyons in any region
  for (const k of ['CRATER_FLOOR', 'CANYON_FLOOR', 'ICE']) ICY_GROUND[TILE[k]] = 1;
  const SCIENCE_SUBS = [['delta', 'vent'], ['meteorite'], ['meteorite', 'layered'], ['layered', 'vent'], ['layered'], ['layered', 'meteorite']];

  function ringOf(x, y) {
    const d2 = x * x + y * y;
    return d2 <= RINGS[0] * RINGS[0] ? 0 : d2 <= RINGS[1] * RINGS[1] ? 1 : d2 <= RINGS[2] * RINGS[2] ? 2 : 3;
  }
  // The region of tile i (row-major) of a chunk: its regions hold two tiles to a byte, four bits each.
  const nibble = (regions, i) => (regions[i >> 1] >> ((i & 1) * 4)) & 15;
  const tooClose = (list, x, y, gap) => list.some(f => Math.abs(f.x - x) < gap && Math.abs(f.y - y) < gap);

  // Crater floors and canyon floors hold ice: the chunk that owns a crater's centre (or a canyon's middle) puts an ice
  // deposit there first. Then darts land at random spots.
  function placeFinds(seed, cx, cy, tiles, regions, feats) {
    const out = [], span = CHUNK - 2 * FIND_EDGE;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const own = (x, y) => x - x0 >= FIND_EDGE && y - y0 >= FIND_EDGE && x - x0 < CHUNK - FIND_EDGE && y - y0 < CHUNK - FIND_EDGE;
    const spots = feats.craters.map(c => [c.x, c.y])
      .concat(feats.canyons.map(k => [Math.floor((k.pts[1][0] + k.pts[2][0]) / 2), Math.floor((k.pts[1][1] + k.pts[2][1]) / 2)]));
    for (const [x, y] of spots) {
      if (!own(x, y) || inFlat(x, y)) continue;
      const n = (y - y0) * CHUNK + (x - x0);
      if (!ICY_GROUND[tiles[n]] || tooClose(out, x, y, FIND_GAP)) continue; // spaced features never trip the gap today
      out.push({ n: out.length, x, y, kind: 'ice', ring: ringOf(x, y), region: nibble(regions, n) });
    }
    for (let i = 0; i < FIND_DARTS; i++) {
      const h = hash(seed, cx, cy, 500 + i);
      const lx = FIND_EDGE + (h % span), ly = FIND_EDGE + ((h >>> 8) % span), n = ly * CHUNK + lx;
      const x = cx * CHUNK + lx, y = cy * CHUNK + ly;
      if (inFlat(x, y)) continue;
      const code = tiles[n];
      if (BLOCKING[code] || code === TILE.BASE) continue;
      const r = nibble(regions, n), ring = ringOf(x, y);
      if (unit(hash(seed, cx, cy, 540 + i)) >= FIND_DENSITY[r] * RING_DENSITY[ring] / FIND_DARTS) continue;
      if (tooClose(out, x, y, FIND_GAP)) continue;
      const w = KIND_WEIGHTS[r].slice();
      if (ICY_GROUND[code]) w[0] += 6;
      let pick = unit(hash(seed, cx, cy, 580 + i)) * (w[0] + w[1] + w[2] + w[3]), k = 0;
      while (k < 3 && pick >= w[k]) { pick -= w[k]; k++; }
      const f = { n: out.length, x, y, kind: FIND_KINDS[k], ring, region: r };
      if (k === 3) f.sub = SCIENCE_SUBS[r][(h >>> 16) % SCIENCE_SUBS[r].length];
      out.push(f);
    }
    return out;
  }

  // ---------- caves (spec §3.1, §3.4): shelter from a solar flare ----------
  // A cave opens in the south face of a mesa or a canyon wall, the face the surface draws, so its mouth can be seen. You
  // shelter by standing in the mouth: the open tile just south of the wall. A chunk places its caves from its own tiles and
  // after its finds, so the tiles, the regions and the finds (and every find id a saved mission holds) stay as they were.
  const CAVE_CHANCE = [0.3, 0.3, 0.3, 0.3, 0.3, 1]; // per south-facing wall tile, by the mouth's region
  const CAVE_GAP = [6, 6, 6, 6, 6, 2];             // tiles between two caves of a chunk, either way: the Volcanic Flanks have three times as many
  function placeCaves(seed, cx, cy, tiles, regions) {
    const out = [];
    for (let ly = 0; ly < CHUNK - 1; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const n = ly * CHUNK + lx, wall = tiles[n];
      if (wall !== TILE.CLIFF && wall !== TILE.CANYON_WALL) continue;
      const m = n + CHUNK, below = tiles[m];
      if (BLOCKING[below] || below === TILE.BASE) continue;
      const x = cx * CHUNK + lx, y = cy * CHUNK + ly + 1, r = nibble(regions, m);
      if (unit(hash(seed, x, y, 650)) >= CAVE_CHANCE[r]) continue;
      if (tooClose(out, x, y, CAVE_GAP[r])) continue;
      out.push({ n: out.length, x, y, region: r });
    }
    return out;
  }

  // ---------- landmarks (spec §3.6, M4c): one per 256×256 cell, over everything else ----------
  // A landmark's centre is jittered inside its cell and its kind is picked from the kinds of the region at the centre
  // (D.LANDMARKS). Its footprint is a box of at most 40×40 tiles lying at least 3 tiles inside the cell, so two landmarks
  // never touch and a chunk looks up only the cells it touches. Inside the box the landmark overrides every feature: each
  // tile is its shape's code, or the region's own ground. The box's outer ring is always ground and every open tile of the
  // shape connects to it, so a landmark can never cut a pocket of open ground off.
  const LM = D.LANDMARKS, LM_LO = 22; // its centre is at least 22 tiles inside the cell (half a 40-tile box plus 2)
  const LM_KINDS = REGIONS.map(r => Object.keys(LM.kinds).filter(k => LM.kinds[k].regions.includes(r)));
  const near = v => Math.floor(v + 0.5); // the nearest whole tile
  const scarpTop = (y, dx) => y - 2 + Math.floor(dx * dx / 50);
  // Each shape: make(seed, i, j, x, y) → its box, the spots of its finds (in the order of D.LANDMARKS' sites) and what
  // drawing it needs; code(seed, landmark, x, y) → the tile at (x, y) in its box, or NONE for the region's ground.
  const SHAPES = {
    // A fan of layered sediment spreading 17 tiles from its apex, up to 53° either side of its axis, with three surveys.
    delta: {
      make(seed, i, j, x, y) {
        const dir = hash(seed, i, j, 1010) % 16, u = DIRS16[dir], ax = x - u[0] * 8.5, ay = y - u[1] * 8.5;
        const spots = [dir + 14, dir, dir + 2].map(k => { const d = DIRS16[k % 16]; return [near(ax + 9 * d[0]), near(ay + 9 * d[1])]; });
        return { dir, apex: [ax, ay], box: [x - 15, y - 15, x + 15, y + 15], spots };
      },
      code(seed, l, x, y) {
        const dx = x - l.apex[0], dy = y - l.apex[1], u = DIRS16[l.dir], along = dx * u[0] + dy * u[1], d2 = dx * dx + dy * dy;
        return along > 0 && d2 <= 17 * 17 && along * along >= 0.36 * d2 ? TILE.SEDIMENT : NONE;
      },
    },
    // A lava tube: a floor 3 tiles wide and 25–35 long inside its wall, running east–west (or north–south), entered
    // through a skylight in its south (or east) wall. Ice lies near one end and rare metal near the other.
    tube: {
      make(seed, i, j, x, y) {
        const h = hash(seed, i, j, 1010), a = 12 + (h % 6), vert = (h >>> 8) % 2 === 1, s = ((h >>> 12) % (a + 1)) - (a >> 1);
        const at = (u, v) => (vert ? [x + v, y + u] : [x + u, y + v]);
        const box = vert ? [x - 3, y - a - 2, x + 3, y + a + 2] : [x - a - 2, y - 3, x + a + 2, y + 3];
        return { a, vert, s, box, spots: [at(1 - a, 0), at(a - 1, 0)] };
      },
      code(seed, l, x, y) {
        const u = l.vert ? y - l.y : x - l.x, v = l.vert ? x - l.x : y - l.y, au = Math.abs(u), av = Math.abs(v);
        if (au > l.a + 1 || av > 2) return NONE;
        if (au <= l.a && av <= 1) return TILE.TUBE_FLOOR;
        return u === l.s && v === 2 ? TILE.SKYLIGHT : TILE.TUBE_WALL;
      },
    },
    // A rim 20 tiles across (D.LANDMARKS radius 10) with three gaps, a floor patched with ice and a central peak. Ice lies
    // on the floor either side of the peak, and the peak's survey just south of it.
    crater: {
      make(seed, i, j, x, y) {
        const r = LM.kinds.crater.radius, h = hash(seed, i, j, 1010), g = DIRS16[(h >>> 8) % 16];
        const gaps = [0, 5, 10].map(k => DIRS16[(h % 16 + k) % 16]);
        const spots = [[near(x + 6 * g[0]), near(y + 6 * g[1])], [near(x - 6 * g[0]), near(y - 6 * g[1])], [x, y + 2]];
        return { r, gaps, box: [x - r - 2, y - r - 2, x + r + 2, y + r + 2], spots };
      },
      code(seed, l, x, y) {
        const dx = x - l.x, dy = y - l.y;
        if (dx * dx + dy * dy <= 2.25) return TILE.CLIFF; // the central peak: the 3×3 tiles round the middle
        const t = CODE.crater(l, x, y);
        return t === TILE.CRATER_FLOOR && noise(seed, 1020, x, y, 5) > 0.62 ? TILE.ICE : t;
      },
    },
    // A vent in the open ground: its survey is the vent itself (the surface draws the vent and its puffs there).
    methane: {
      make: (seed, i, j, x, y) => ({ box: [x - 4, y - 4, x + 4, y + 4], spots: [[x, y]] }),
      code: () => NONE,
    },
    // A cliff of clean ice 31 tiles long and 2 thick, bowed so its ends lie 4 tiles further south, with 2 rows of exposed
    // ice at its foot (its south face, the one the surface draws) and four ice deposits along the cliff.
    scarp: {
      make: (seed, i, j, x, y) => ({ box: [x - 17, y - 3, x + 17, y + 6], spots: [-11, -4, 4, 11].map(dx => [x + dx, scarpTop(y, dx) + 2]) }),
      code(seed, l, x, y) {
        const dx = x - l.x;
        if (dx < -15 || dx > 15) return NONE;
        const k = y - scarpTop(l.y, dx);
        return k === 0 || k === 1 ? TILE.SCARP : k === 2 || k === 3 ? TILE.ICE : NONE;
      },
    },
    // A star dune: 3–5 arms 11–16 tiles long round a summit. The arms' ridges and the summit are its crest, where the view
    // is wider; the dune spreads 2.5 tiles either side of the ridges and 5 round the summit.
    stardune: {
      make(seed, i, j, x, y) {
        const h = hash(seed, i, j, 1010), n = 3 + (h % 3), step = Math.floor(16 / n), first = (h >>> 4) % 16, arms = [];
        for (let k = 0; k < n; k++) arms.push([(first + k * step) % 16, 11 + (hash(seed, i, j, 1011 + k) % 6)]);
        return { arms, box: [x - 19, y - 19, x + 19, y + 19], spots: [] };
      },
      code(seed, l, x, y) {
        const dx = x - l.x, dy = y - l.y, s2 = dx * dx + dy * dy;
        let best = s2;
        for (const [k, len] of l.arms) {
          const u = DIRS16[k], t = Math.max(0, Math.min(len, dx * u[0] + dy * u[1])), px = dx - u[0] * t, py = dy - u[1] * t;
          best = Math.min(best, px * px + py * py);
        }
        // 0.75 tiles either side of a ridge, so even a diagonal one is a path of side-by-side tiles.
        if (best <= 0.5625 || s2 <= 2) return TILE.CREST;
        return best <= 6.25 || s2 <= 25 ? TILE.DUNE : NONE;
      },
    },
  };

  // A find held by a point of interest, written like a chunk's finds. A survey's subject is the landmark's (or formation's)
  // kind, but the methane vent's is 'vent', the subject the surface already labels, paints and lets the Biologist smell.
  function site(seed, n, x, y, kind, sub) {
    const f = { n, x, y, kind, ring: ringOf(x, y), region: regionAt(seed, x, y) };
    if (kind === 'science') f.sub = sub;
    return f;
  }
  // Points of interest are shared by every chunk they touch (and every mission with the seed), so they are frozen whole.
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
    return o;
  }

  // The landmark of cell (i, j) of the 256-tile grid, or null. Its id is "L<i>,<j>".
  function landmark(seed, i, j) {
    return memo('L' + seed + ':' + i + ':' + j, () => {
      if (unit(hash(seed, i, j, 1001)) >= LM.chance) return null;
      const h = hash(seed, i, j, 1002), span = LM.cell - 2 * LM_LO;
      const x = i * LM.cell + LM_LO + (h % span), y = j * LM.cell + LM_LO + ((h >>> 16) % span);
      const region = regionAt(seed, x, y), kinds = LM_KINDS[region], kind = kinds[hash(seed, i, j, 1003) % kinds.length];
      const { spots, ...shape } = SHAPES[kind].make(seed, i, j, x, y);
      if (fromHQ2(shape.box) < LM.clear * LM.clear) return null;
      const sites = spots.map(([sx, sy], n) => site(seed, n, sx, sy, LM.kinds[kind].sites[n], kind === 'methane' ? 'vent' : kind));
      return deepFreeze(Object.assign({ id: 'L' + i + ',' + j, kind, i, j, x, y, region }, shape, { sites }));
    });
  }
  // Every landmark whose box touches the tile box [x0..x1] × [y0..y1] (inclusive).
  function landmarksNear(seed, x0, y0, x1, y1) {
    const box = [x0, y0, x1, y1], out = [];
    for (const [i, j] of cellsTouching(box, LM.cell)) { const l = landmark(seed, i, j); if (l && touch(l.box, box)) out.push(l); }
    return out;
  }
  // Redraws the chunk's tiles that lie in a landmark's box: its shape, or the region's own ground.
  function stampLandmarks(seed, tiles, regions, x0, y0, lms) {
    for (const l of lms) {
      const code = SHAPES[l.kind].code, b = l.box;
      for (let y = Math.max(b[1], y0); y <= Math.min(b[3], y0 + CHUNK - 1); y++) {
        for (let x = Math.max(b[0], x0); x <= Math.min(b[2], x0 + CHUNK - 1); x++) {
          const i = (y - y0) * CHUNK + x - x0, t = code(seed, l, x, y);
          tiles[i] = t !== NONE ? t : ground(seed, nibble(regions, i), x, y);
        }
      }
    }
  }

  // ---------- chunks ----------
  // A chunk is shared (src/expedition.js keeps one cache for every mission with its seed, and on the server for every room),
  // so its lists are frozen: a reader can't change them for everyone. Typed arrays can't be frozen; tiles and regions are
  // read-only by agreement.
  const frozen = list => { for (const o of list) Object.freeze(o); return Object.freeze(list); };
  function chunk(seed, cx, cy) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, w = CHUNK + 2;
    const sites = sitesFor(seed, x0 - 1, y0 - 1, x0 + CHUNK, y0 + CHUNK);
    const feats = featuresNear(seed, x0 - 1, y0 - 1, x0 + CHUNK, y0 + CHUNK);
    // Pass 1 covers a 34×34 window (a 1-tile border) so the boulder rule can look at every neighbour.
    const reg = new Uint8Array(w * w), feat = new Uint8Array(w * w), cand = new Uint32Array(w * w);
    for (let wy = 0; wy < w; wy++) for (let wx = 0; wx < w; wx++) {
      const x = x0 + wx - 1, y = y0 + wy - 1, n = wy * w + wx;
      const r = regionFrom(seed, sites, x, y);
      reg[n] = r;
      const f = featureAt(feats, x, y);
      feat[n] = f;
      if (f === NONE && !inFlat(x, y) && unit(hash(seed, x, y, 8)) < boulderChance(seed, r, x, y)) cand[n] = (hash(seed, x, y, 7) | 1) >>> 0;
    }
    const tiles = new Uint8Array(CHUNK * CHUNK), regions = new Uint8Array(CHUNK * CHUNK / 2);
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, y = y0 + ly, n = (ly + 1) * w + lx + 1, i = ly * CHUNK + lx;
      const r = reg[n];
      regions[i >> 1] |= r << ((i & 1) * 4);
      let t;
      if (inBase(x, y)) t = TILE.BASE;
      else if (feat[n] !== NONE) t = feat[n];
      else if (cand[n] && isBoulder(feat, cand, n, w)) t = TILE.BOULDER;
      else t = ground(seed, r, x, y);
      tiles[i] = t;
    }
    const finds = frozen(placeFinds(seed, cx, cy, tiles, regions, feats)), caves = frozen(placeCaves(seed, cx, cy, tiles, regions));
    // The points of interest are stamped last, over the finished tiles. The finds and caves were placed from the tiles as
    // they were, so every find id a saved mission holds is unchanged: the ones under a footprint are listed in `hidden`
    // (src/expedition.js leaves them out), never moved. A cave is hidden when its mouth or its wall is under one.
    const landmarks = Object.freeze(landmarksNear(seed, x0, y0, x0 + CHUNK - 1, y0 + CHUNK - 1));
    stampLandmarks(seed, tiles, regions, x0, y0, landmarks);
    const under = (x, y) => landmarks.some(l => inBox(l.box, x, y));
    const hidden = Object.freeze({
      finds: Object.freeze(finds.filter(f => under(f.x, f.y)).map(f => f.n)),
      caves: Object.freeze(caves.filter(k => under(k.x, k.y) || under(k.x, k.y - 1)).map(k => k.n)),
    });
    return Object.freeze({ cx, cy, tiles, regions, finds, caves, hidden, landmarks });
  }

  const tileOf = (c, lx, ly) => c.tiles[ly * CHUNK + lx];
  const regionOf = (c, lx, ly) => nibble(c.regions, ly * CHUNK + lx);

  return {
    CHUNK, TILE, NONE, BLOCKING, SPEED, REGIONS, BASE_RECT, FLAT_RADIUS, DIRS16, RINGS, FIND_KINDS,
    seedOf, hash, unit, noise, regionAt, chunk, tileOf, regionOf, featuresNear, ringOf, landmarkAt: landmark, landmarksNear,
  };
});
