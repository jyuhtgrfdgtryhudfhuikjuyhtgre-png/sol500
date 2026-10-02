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
 *      chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512) }   (32×32, row-major)
 *      tileOf(chunk, lx, ly) · regionOf(chunk, lx, ly)
 *      featuresNear(seed, x0, y0, x1, y1) → { canyons, craters, mesas } touching that tile box (inclusive)
 *      hash(seed, a, b, c) → uint32 · unit(h) → [0, 1) · noise(seed, salt, x, y, size) → [0, 1]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolWorldgen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHUNK = 32;
  const TILE = {
    REGOLITH: 0, SAND: 1, DUNE: 2, BOULDER: 3, CLIFF: 4, RIM: 5, CRATER_FLOOR: 6, CANYON_FLOOR: 7, CANYON_WALL: 8,
    RAMP: 9, ICE: 10, POLYGON: 11, LAVA: 12, TUBE_FLOOR: 13, TUBE_WALL: 14, SKYLIGHT: 15, STRUCT_FLOOR: 16,
    STRUCT_WALL: 17, BASE: 18,
  };
  const NONE = 255; // "no feature here" in the feature layer
  const BLOCKING = new Uint8Array(32);
  for (const k of ['BOULDER', 'CLIFF', 'RIM', 'CANYON_WALL', 'TUBE_WALL', 'STRUCT_WALL']) BLOCKING[TILE[k]] = 1;
  // Walking speed on each tile (the rover ignores it).
  const SPEED = [];
  for (let i = 0; i < 32; i++) SPEED.push(1);
  SPEED[TILE.DUNE] = 0.7;

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

  // ---------- features (filled in by the feature generators) ----------
  const CODE = {}; // kind → (feature, x, y) → tile code or NONE
  function featuresNear() { return { canyons: [], craters: [], mesas: [] }; }
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

  // ---------- chunks ----------
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
    return { cx, cy, tiles, regions };
  }

  const tileOf = (c, lx, ly) => c.tiles[ly * CHUNK + lx];
  function regionOf(c, lx, ly) {
    const i = ly * CHUNK + lx;
    return (c.regions[i >> 1] >> ((i & 1) * 4)) & 15;
  }

  return {
    CHUNK, TILE, NONE, BLOCKING, SPEED, REGIONS, BASE_RECT, FLAT_RADIUS, DIRS16,
    seedOf, hash, unit, noise, regionAt, chunk, tileOf, regionOf, featuresNear,
  };
});
