# SOL 500 M3 — Endless World + One Astronaut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small fixed pad map with an endless, deterministic Mars world. It is built in chunks around the player, deleted out of range and rebuilt identically, and has regions, terrain features, a minimap, a full map, shared fog of war and region facts with real sources. Each player controls exactly one astronaut.

**Architecture:**
- **`src/worldgen.js`** (pure, UMD, runs in Node and the browser) turns `(seed, x, y)` into tiles and regions with integer hashing, so every client and the server build the same world without sending it. `src/fog.js` (pure, UMD) holds the 128-byte "seen" bitsets that are saved in `mission.expedition.revealed` and shared in co-op.
- **The surface splits into four files.** `src/surface-world.js` is the pure, Node-tested model: live data chunks, collision, short paths, the build queue and fog. `src/surface-paint.js` paints 256-px ground images, the fog, the 1-px-per-tile minimap images and the sprites. `src/surface-map.js` draws the minimap, the full map and the debug text. `src/surface.js` keeps input, avatars, menus and the frame loop.
- **The engine** gains `mission.pilot`, `mission.expedition` (the spec §4 shape) and `upgradeMission()` for old saves, plus a pilot takeover in `resolveTurn`.
- **The server** OR-merges fog from players and fans it out every 500 ms. It keeps fog out of the `room` messages, and it records regions as they are found.

**Tech Stack:** Plain browser JavaScript (no bundler; UMD/IIFE modules on `window`), Canvas 2D, Node 24 built-in test runner (`node --test`), `ws` for WebSockets (already a dependency), Electron (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (v3.1): §1.3, §1.5, §2 (all), §4 (the `expedition` shape, `pilot`, §4.1), §5 (`fog`/`reveal`, unbounded positions), §10–§12 (M3). Follow-ups: `docs/superpowers/plans/2026-10-01-sol500-m2-followups.md` ("For the M3 plan").

**Branch:** `feat/m3-endless-world` (already created off `master` at `f0c2fea`; clean).

## Global Constraints

- **No new runtime dependencies.** The server keeps `qrcode` and `ws` only. Browser code stays plain `<script>` files loaded in order by `index.html`. A new pure module uses the UMD header that `src/engine.js` uses.
- **Worldgen determinism (spec §2.1):**
  - Integer hashing with `Math.imul` only.
  - In `src/worldgen.js` the only maths allowed is `+ − × ÷`, `%`, `Math.sqrt`, `Math.floor`, `Math.ceil`, `Math.abs`, `Math.min` and `Math.max`. Never use `Math.random`, `Math.sin`, `Math.cos`, `Math.atan2`, `Math.pow`, `**`, `Math.exp` or `Math.hypot`, because engines may round them differently.
  - No floating-point accumulation across chunks.
- **Coordinates:**
  - Tiles are 64 px.
  - The base's 9×5 build grid has its top-left at tile **(−4, −2)**, so the HQ is at **(0, 0)**. A grid cell `(gx, gy)` is world tile `(gx − 4, gy − 2)`.
  - The **flat zone** is radius **12** tiles around the HQ and never has blocking terrain.
  - The lander stands at tile **(−6, −4)**.
- **Data chunks:**
  - 32×32 tiles. They are made within **2** chunks of the player and deleted beyond **3**.
  - The 4 base chunks `(−1..0, −1..0)` are always kept.
  - There is a hard cap of **64**, dropping the least recently used first.
- **Image chunks:**
  - 4×4 tiles (256×256 px), kept for the view plus a **1**-chunk margin and deleted **2** chunks outside the view.
  - Hard cap **160**, but never smaller than what the current view needs.
- **Minimap:** 160×160 tiles at 1 px per tile.
- **View radius:** 8 tiles on foot, 10 in the rover. Storms shrinking it is M4.
- **Per frame:**
  - Build at most **1** data chunk.
  - Paint image chunks until about **4 ms** of the frame are used.
  - `requestIdleCallback`, when it exists, paints more.
- **Targets:**
  - A data chunk builds in ≤ **4 ms** median; an image chunk paints in ≤ **2 ms** median.
  - The fps median is ≥ **50** while driving the rover in a straight line for 2 minutes with 5 avatars.
  - The heap ends within **+20 MB** after 2,000 tiles out and back.
- **Fog:**
  - One bit per tile, one 128-byte set per data chunk, stored as standard base64 (172 characters) under the key `"<cx>,<cy>"`.
  - The server fans out `fog` diffs throttled to **500 ms** and accepts at most **64** chunk keys per `reveal` message.
  - Each mission holds at most **4,096** fog chunks.
- **Positions over the network** are signed integers clamped to **±64,000,000** px.
- **Text:** every player-facing string goes in `src/i18n.js` in **English and Vietnamese**. Every in-game science claim cites a source in `SOURCES` that was checked (the six region sources in Task 9 were verified on 2026-10-02).
- **Commits:**
  - One commit per task, or more, on `feat/m3-endless-world`.
  - Messages are imperative, prefixed (`feat(world):`, `feat(surface):`, `test:`…), and end with exactly this line (not your own model name):
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Before any browser check:**
  - Stop old servers on ports 5050–5070 (a stale server caused an earlier bug).
  - After app or tunnel test runs on Windows, kill leftover `electron.exe` and `cloudflared-*.exe`.
- **Tests:** `npm test` (`node --test`) must stay green after every task. Start: **167 tests pass** on `f0c2fea`.

## Review Focus

The five input classes or failure modes most likely to bite a real player that the spec implies but no feature test would naturally hit. Each has a test added to the task that owns the code.

1. **A save from v3.1.0 resumed after updating.** It has no `expedition`, no `pilot`, and an old `sol500.controlId` key. It must resume as the same astronaut with empty fog and no crash. *(Task 7: `upgradeMission` test; Task 8: browser step with a hand-made old save.)*
2. **West and north of the base (negative coordinates).** Chunk keys like `"-1,-3"`, floor division for negative tiles, fog bit indices, path boxes and the server's position clamp must all work below zero. *(Task 1: negative-chunk test; Task 4: fog and tiles across the −1/0 boundary; Task 10: negative positions over the network.)*
3. **Malformed or hostile fog messages** (bad base64, `__proto__` keys, 10,000 keys, non-objects, a value of the wrong length). They are ignored, never throw, and the caps hold. *(Task 3 and Task 10 tests.)*
4. **A very wide window** (4K or ultrawide) needing more image chunks than the cap. The chunks on screen are never evicted, so there is no repaint loop or flicker. *(Task 5 test.)*
5. **"Fly again" in co-op with the same mission code.** The new mission starts with no fog and no regions from the old one, and no stale fog frame arrives afterwards. *(Task 10 test.)*

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/worldgen.js` | create | The endless world: hashing, noise, regions, ground, boulders, mesas, craters and canyons, and the chunk API. Pure UMD (`SolWorldgen`). |
| `src/fog.js` | create | Fog bitsets: set/has, base64 encode/decode, OR-merge of `{ key: base64 }` maps with validation and a cap. Pure UMD (`SolFog`). |
| `src/surface-world.js` | create | The surface's world model: live data chunks (make/keep/cap/LRU), tile/region/collision/speed lookups, the base overlay, bounded BFS paths, the build queue and the fog store. Pure UMD (`SolWorld`) and Node-tested. |
| `src/surface-paint.js` | create | Canvas painting: ground image chunks with seamless decor, the image cache and queue, fog drawing, minimap "mini" images, and the sprites moved out of `surface.js` (avatars, tags, rocks, lander, badges). UMD (`SolPaint`); its cache logic is Node-tested with a fake canvas. |
| `src/surface-map.js` | create | The minimap element, the full-screen map (pan and zoom), and the debug overlay text. Browser-only (`SolMap`). |
| `src/surface.js` | modify | Uses the four modules above. Endless camera, streaming per frame, reveal and region hooks, map and debug keys, `mergeFog`/`reset`, and QA helpers. |
| `src/engine.js` | modify | `pilot`, `expedition`, `newExpedition()`, `upgradeMission()`, and the pilot takeover in `resolveTurn`. |
| `src/ui.js` | modify | Choose-your-astronaut screen; the "Play as" switcher removed; old-save upgrade; takeover toast and report line; co-op seat panel; region cards; reveal hooks (solo save and co-op send); fog frames into the surface. |
| `src/net.js` | modify | `sendReveal(map)` and the `fog` frame callback. |
| `src/i18n.js` | modify | EN+VI for everything new, 6 new sources, the region names and facts, `REGION_SOURCES`, and a "Regions of Mars" note. |
| `src/style.css` | modify | Styles for the pilot screen, seat panel, region card, region chip, minimap, map screen and debug box. |
| `src/admin.js` | modify | A fallback label for unknown event and phase keys (M2 follow-up). |
| `lib/rooms.js` | modify | Signed position clamp; `reveal()` with merge, validation and a 500 ms fan-out; fog stripped from `room` messages; full fog on attach; the `region` action; claiming a dead crew refused. |
| `lib/ws.js` | modify | Routes `reveal` frames. |
| `lib/history.js` | modify | `validMission` checks `pilot`. |
| `index.html`, `sw.js` | modify | Load and cache the 5 new scripts; cache `sol500-v2`. |
| `test/worldgen.test.js`, `test/worldgen-reach.test.js`, `test/fog.test.js`, `test/surface-world.test.js`, `test/surface-paint.test.js` | create | New unit tests. |
| `test/engine.test.js`, `test/history.test.js`, `test/rooms.test.js`, `test/ws.test.js`, `test/i18n.test.js` | modify | New cases. |
| `docs/superpowers/specs/...design.md` §12, `docs/superpowers/plans/2026-10-02-sol500-m3-followups.md`, `package.json` | modify/create | Tick the M3 checklist, record deferred items, version 3.2.0. |

`src/surface.js` goes from 1,165 lines to about 1,020: the old world model, ground painting and sprite drawing move out, and streaming, fog, regions and the map come in. That is still above the spec's "about 900", so moving the interaction menu into its own file is recorded as an M5 follow-up (Task 11). Every new file stays under 600 lines.

---

### Task 1: Worldgen — hashing, regions, ground, boulders and the chunk API

**Files:**
- Create: `src/worldgen.js`
- Test: `test/worldgen.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces (global `SolWorldgen` in the browser, `require('./worldgen.js')` in Node):
  - `CHUNK = 32`; `TILE` codes `{ REGOLITH:0, SAND:1, DUNE:2, BOULDER:3, CLIFF:4, RIM:5, CRATER_FLOOR:6, CANYON_FLOOR:7, CANYON_WALL:8, RAMP:9, ICE:10, POLYGON:11, LAVA:12, TUBE_FLOOR:13, TUBE_WALL:14, SKYLIGHT:15, STRUCT_FLOOR:16, STRUCT_WALL:17, BASE:18 }`; `NONE = 255`.
  - `BLOCKING`: a `Uint8Array(32)`, 1 for BOULDER, CLIFF, RIM, CANYON_WALL, TUBE_WALL and STRUCT_WALL.
  - `SPEED`: an array of 32 walking-speed factors, 0.7 for DUNE and 1 otherwise.
  - `REGIONS = ['plains','dunes','craters','canyons','icy','volcanic']`; `BASE_RECT = { x:-4, y:-2, w:9, h:5 }`; `FLAT_RADIUS = 12`; `DIRS16`.
  - `seedOf(missionSeed: string) → uint32`; `hash(seed, a, b, c) → uint32`; `unit(h) → [0,1)`; `noise(seed, salt, x, y, size) → [0,1]`.
  - `regionAt(seed, x, y) → 0..5`.
  - `chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512) }`, row-major, 4-bit regions.
  - `tileOf(chunk, lx, ly)`; `regionOf(chunk, lx, ly)`.
  - `featuresNear(seed, x0, y0, x1, y1) → { canyons: [], craters: [], mesas: [] }` (empty until Task 2).

- [ ] **Step 1: Write the failing tests**

Create `test/worldgen.test.js`:

```js
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
  const coords = Array.from({ length: 200 }, () => [Math.floor(r() * 400) - 200, Math.floor(r() * 400) - 200]);
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
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/worldgen.test.js`
Expected: FAIL with `Cannot find module '../src/worldgen.js'`.

- [ ] **Step 3: Write `src/worldgen.js`**

```js
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
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/worldgen.test.js`
Expected: PASS, 8 tests.

If "each region has its own ground" fails on one share, re-check `ground()` against the code above before changing anything. Do not loosen a test threshold.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all tests pass (167 + 8).

- [ ] **Step 6: Commit**

```bash
git add src/worldgen.js test/worldgen.test.js
git commit -m "feat(world): deterministic endless worldgen: regions, ground, lone boulders, chunk API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Worldgen — mesas, craters and canyons that never wall anything off

**Files:**
- Modify: `src/worldgen.js` (replace the block that starts at the comment `// ---------- features (filled in by the feature generators) ----------` and ends at the closing brace of `function featureAt`)
- Test: `test/worldgen.test.js` (append), `test/worldgen-reach.test.js` (create)

**Interfaces:**
- Consumes: Task 1's `hash`, `unit`, `regionAt`, `DIRS16`, `TILE`, `NONE`, `R`, `FLAT_RADIUS`, `inBox`, `chunk`.
- Produces: `featuresNear(seed, x0, y0, x1, y1)`, which returns descriptors that later tasks (the debug overlay and M4) read:
  - **mesa** `{ kind:'mesa', i, j, x, y, rad, a1, a2, u1, u2, box:[x0,y0,x1,y1] }`;
  - **crater** `{ kind:'crater', i, j, x, y, r, gaps:[[dx,dy]…], box }`;
  - **canyon** `{ kind:'canyon', i, j, pts:[[x,y]×4], segs, hw, len, box }`.

  Boxes are inclusive tile boxes, and each lies inside its own cell. Precedence is canyon > crater > mesa: a lower feature is dropped when its box comes within `CLEAR = 3` tiles of a higher one, so features never touch.

- [ ] **Step 1: Write the failing tests**

Append to `test/worldgen.test.js`:

```js
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
    for (const m of f.mesas) {
      kinds.mesa++;
      const e = blockedExtent(seed, m, T.CLIFF, cache);
      assert.ok(e.w >= 4 && e.w <= 14 && e.h >= 4 && e.h <= 14, `mesa at ${m.x},${m.y} is ${e.w}×${e.h}`);
    }
    for (const c of f.craters) {
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
  const PINNED = '4f1ff5dc';
  assert.equal(got, PINNED, 'world hash is ' + got);
});
```

Create `test/worldgen-reach.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/worldgen.test.js test/worldgen-reach.test.js`
Expected:
- FAIL: "every blocking feature fits its size bounds" (the message shows `{"mesa":0,"crater":0,"canyon":0}`) and the pinned hash (`world hash is …`, a different value).
- PASS: the rest. "Canyon Lands…" fails or passes vacuously, and the reach test passes vacuously, because there are no features yet.

- [ ] **Step 3: Replace the features block in `src/worldgen.js`**

Replace the code from `// ---------- features (filled in by the feature generators) ----------` through the closing brace of `function featureAt` with this. There must be exactly **one** `const CODE`, **one** `function featuresNear` and **one** `function featureAt` in the file afterwards.

```js
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
  function nearBase(box) {
    const b = grow(box, CLEAR);
    const dx = Math.max(b[0], 0, -b[2]), dy = Math.max(b[1], 0, -b[3]);
    return dx * dx + dy * dy <= FLAT_RADIUS * FLAT_RADIUS;
  }
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
```

- [ ] **Step 4: Run the feature tests**

Run: `node --test test/worldgen.test.js`
Expected: PASS, 13 tests. This plan's code was run while the plan was being written: the hash is `4f1ff5dc`, and the file takes about 4 s.

If the pinned hash fails, your `src/worldgen.js` differs from Task 1 Step 3 plus Task 2 Step 3. Diff it against the plan and fix the difference. Do not re-pin.

- [ ] **Step 5: Run the reachability test**

Run: `node --test test/worldgen-reach.test.js`
Expected: PASS (about 11 s when the plan was written).

If it fails, the message names the seed and a cut-off tile. Inspect that seed's features near the tile with `node -e "const W=require('./src/worldgen.js');console.log(JSON.stringify(W.featuresNear(W.seedOf('REACH-<n>'),X-20,Y-20,X+20,Y+20)))"`, then fix the generator: a feature rasterising into a closed ring is a bug in `CODE.*`. Never fix it by skipping seeds or tiles in the test.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/worldgen.js test/worldgen.test.js test/worldgen-reach.test.js
git commit -m "feat(world): mesas, craters with rim gaps and canyons with ramps; spaced so nothing is ever cut off (300-seed reachability, pinned world hash)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fog bitsets shared by the browser and the server

**Files:**
- Create: `src/fog.js`
- Test: `test/fog.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (global `SolFog`, or `require('./fog.js')`):
  - `SIZE = 32`, `BYTES = 128`, `KEY` (a RegExp for `"<cx>,<cy>"`, at most 6 digits each).
  - `empty() → Uint8Array(128)`.
  - `has(bits, lx, ly) → 0|1`; `set(bits, lx, ly) → bool` (true if the bit was new).
  - `encode(bits) → string` (172 chars, standard base64); `decode(str) → Uint8Array(128) | null`.
  - `orInto(target, bits) → bool` (changed); `count(bits) → int`.
  - `mergeMap(map, diff, limit) → { key: base64 }` holding only the keys whose value changed. It mutates `map`, skips bad keys and values, and never adds keys beyond `limit`.

- [ ] **Step 1: Write the failing tests**

Create `test/fog.test.js`:

```js
'use strict';
// Fog of war bitsets (src/fog.js): one bit per tile, one 128-byte set per 32×32 chunk, base64 on the wire.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/fog.js');

function randomBits(seed) {
  const b = F.empty();
  let a = seed;
  for (let i = 0; i < b.length; i++) { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; b[i] = a >>> 24; }
  return b;
}

test('a chunk of fog is 128 bytes and 172 characters of standard base64', () => {
  for (let s = 1; s < 20; s++) {
    const bits = randomBits(s);
    const text = F.encode(bits);
    assert.equal(text.length, 172);
    assert.equal(text, Buffer.from(bits).toString('base64'));
    assert.deepEqual(F.decode(text), bits);
  }
  assert.equal(F.encode(F.empty()), Buffer.alloc(128).toString('base64'));
});

test('bad fog text is refused, never thrown on', () => {
  const good = F.encode(randomBits(3));
  for (const bad of [null, undefined, 42, {}, '', 'abc', good.slice(1), good + 'A', good.replace(/.$/, 'A'), '!' + good.slice(1), good.slice(0, 100) + 'é' + good.slice(101)]) {
    assert.equal(F.decode(bad), null, String(bad).slice(0, 20));
  }
});

test('set marks a tile once; has reads it back, including the last tile', () => {
  const b = F.empty();
  assert.equal(F.set(b, 0, 0), true);
  assert.equal(F.set(b, 0, 0), false);
  assert.equal(F.set(b, 31, 31), true);
  assert.equal(F.has(b, 0, 0), 1);
  assert.equal(F.has(b, 31, 31), 1);
  assert.equal(F.has(b, 5, 7), 0);
  assert.equal(F.count(b), 2);
});

test('merging ORs the bits and reports only the chunks that changed', () => {
  const a = F.empty(), b = F.empty();
  F.set(a, 1, 1);
  F.set(b, 2, 2);
  const map = { '0,0': F.encode(a) };
  const changed = F.mergeMap(map, { '0,0': F.encode(b), '-3,7': F.encode(b) });
  assert.deepEqual(Object.keys(changed).sort(), ['-3,7', '0,0']);
  const merged = F.decode(map['0,0']);
  assert.equal(F.has(merged, 1, 1) + F.has(merged, 2, 2), 2);
  assert.deepEqual(F.mergeMap(map, { '0,0': F.encode(b) }), {}, 'nothing new the second time');
});

test('hostile fog is skipped: odd keys, prototype keys, wrong values, non-objects, and the chunk cap', () => {
  const v = F.encode(randomBits(5));
  const map = {};
  for (const diff of [null, 'x', 7, [v]]) assert.deepEqual(F.mergeMap(map, diff), {});
  const evil = JSON.parse('{"__proto__": "' + v + '", "constructor": "' + v + '", "1,2,3": "' + v + '", "a,b": "' + v + '", "1234567,0": "' + v + '", "0,0": "nope"}');
  assert.deepEqual(F.mergeMap(map, evil), {});
  assert.deepEqual(Object.keys(map), []);
  assert.equal(Object.getPrototypeOf(map), Object.prototype);
  const many = {};
  for (let i = 0; i < 10000; i++) many[i + ',0'] = v;
  const changed = F.mergeMap(map, many, 4096);
  assert.equal(Object.keys(changed).length, 4096);
  assert.equal(Object.keys(map).length, 4096);
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/fog.test.js`
Expected: FAIL with `Cannot find module '../src/fog.js'`.

- [ ] **Step 3: Write `src/fog.js`**

```js
/*
 * SOL 500 — fog of war bitsets. One bit per tile, one 32×32 set (128 bytes) per data chunk, saved in
 * mission.expedition.revealed and shared in co-op as standard base64 under the chunk key "<cx>,<cy>".
 * Shared by the browser and the server; every input from the network is checked, never trusted.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolFog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SIZE = 32, BYTES = SIZE * SIZE / 8, CHARS = 172;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const VAL = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) VAL[B64.charCodeAt(i)] = i;
  const KEY = /^-?\d{1,6},-?\d{1,6}$/;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  const empty = () => new Uint8Array(BYTES);
  function has(bits, lx, ly) { const i = ly * SIZE + lx; return (bits[i >> 3] >> (i & 7)) & 1; }
  function set(bits, lx, ly) {
    const i = ly * SIZE + lx, b = 1 << (i & 7);
    if (bits[i >> 3] & b) return false;
    bits[i >> 3] |= b;
    return true;
  }
  function count(bits) {
    let n = 0;
    for (let i = 0; i < BYTES; i++) { let v = bits[i]; while (v) { v &= v - 1; n++; } }
    return n;
  }

  function encode(bits) {
    let s = '';
    for (let i = 0; i < BYTES; i += 3) {
      const two = i + 1 < BYTES, three = i + 2 < BYTES;
      const n = (bits[i] << 16) | ((two ? bits[i + 1] : 0) << 8) | (three ? bits[i + 2] : 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (two ? B64[(n >> 6) & 63] : '=') + (three ? B64[n & 63] : '=');
    }
    return s;
  }

  function decode(str) {
    if (typeof str !== 'string' || str.length !== CHARS || str.charCodeAt(CHARS - 1) !== 61 /* '=' */) return null;
    const out = new Uint8Array(BYTES);
    let o = 0;
    for (let i = 0; i < CHARS; i += 4) {
      const last = i === CHARS - 4;
      let n = 0;
      for (let k = 0; k < 4; k++) {
        if (last && k === 3) { n <<= 6; continue; }
        const code = str.charCodeAt(i + k);
        const v = code < 128 ? VAL[code] : -1;
        if (v < 0) return null;
        n = (n << 6) | v;
      }
      out[o++] = (n >> 16) & 255;
      out[o++] = (n >> 8) & 255;
      if (!last) out[o++] = n & 255;
    }
    return out;
  }

  function orInto(target, bits) {
    let changed = false;
    for (let i = 0; i < BYTES; i++) {
      const v = target[i] | bits[i];
      if (v !== target[i]) { target[i] = v; changed = true; }
    }
    return changed;
  }

  // Merges a { key: base64 } diff into a { key: base64 } map in place and returns only what changed.
  // Bad keys and values are skipped; `limit` (optional) caps how many chunks the map may hold.
  function mergeMap(map, diff, limit) {
    const changed = {};
    if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return changed;
    let size = Object.keys(map).length;
    for (const k of Object.keys(diff)) {
      if (!KEY.test(k)) continue;
      const bits = decode(diff[k]);
      if (!bits) continue;
      const had = own(map, k) ? decode(map[k]) : null;
      if (had) {
        if (orInto(had, bits)) { map[k] = encode(had); changed[k] = map[k]; }
        continue;
      }
      if (!own(map, k)) {
        if (limit != null && size >= limit) continue;
        size++;
      }
      map[k] = encode(bits);
      changed[k] = map[k];
    }
    return changed;
  }

  return { SIZE, BYTES, KEY, empty, has, set, count, encode, decode, orInto, mergeMap };
});
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/fog.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test` (expected: all pass), then:

```bash
git add src/fog.js test/fog.test.js
git commit -m "feat(world): fog of war bitsets with checked base64 and capped OR-merge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: The surface's world model — live chunks, collision, paths, queue and fog

**Files:**
- Create: `src/surface-world.js`
- Test: `test/surface-world.test.js`

**Interfaces:**
- Consumes: `SolWorldgen` (Tasks 1–2): `seedOf`, `chunk`, `regionOf`, `BLOCKING`, `SPEED`, `CHUNK`. `SolFog` (Task 3): `empty`, `set`, `has`, `encode`, `decode`, `orInto`, `KEY`.
- Produces (global `SolWorld`, or `require('./surface-world.js')`): `SolWorld.create(missionSeed, { cap = 64 }) → world`, `SolWorld.chunkOf(tile)`, plus the constants `MAKE = 2`, `KEEP = 3`, `CAP = 64` and `PATH_HALF = 32`. A `world` has:

  | Group | Members |
  |---|---|
  | Identity | `seed` (uint32) |
  | Chunks | `get(cx, cy) → chunk` (builds and keeps); `peek(cx, cy) → chunk \| null`; `dataFor(cx, cy) → chunk` (the live one, or a fresh one that is **not** kept) |
  | Tile lookups | `tile(tx, ty) → code`; `region(tx, ty) → 0..5`; `isBlocked(tx, ty) → bool`; `speed(tx, ty) → 1 \| 0.7` |
  | Base overlay | `setOverlay([[tx, ty], …])` |
  | Paths | `findPath(sx, sy, gx, gy, allowGoalBlocked) → [[tx, ty], …] \| null` (start excluded; `[]` when already there) |
  | Streaming | `retain(tx, ty, headingTx?, headingTy?)`; `work() → bool` (built one chunk) |
  | Fog | `reveal(tx, ty, r) → newly seen count`; `seen(tx, ty) → bool`; `takeFog() → { key: base64 }`; `mergeFog(map) → [changed keys]`; `fogBits(cx, cy) → Uint8Array \| null`; `fogStamp(key) → int`; `fogKeys() → [keys]` |
  | Inspection | `liveKeys() → [keys]`; `stats() → { data, cap, queue, fog, built }` |

- [ ] **Step 1: Write the failing tests**

Create `test/surface-world.test.js`:

```js
'use strict';
// The surface's world model (src/surface-world.js): live chunks, collision, short paths, the build queue and fog.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/worldgen.js');
const F = require('../src/fog.js');
const SW = require('../src/surface-world.js');

test('tiles and regions are the worldgen ones, west and north of the base too', () => {
  const w = SW.create('WORLD-1');
  const seed = W.seedOf('WORLD-1');
  for (const [tx, ty] of [[0, 0], [-1, -1], [-33, 5], [100, -70], [-200, -200]]) {
    const cx = Math.floor(tx / 32), cy = Math.floor(ty / 32), c = W.chunk(seed, cx, cy);
    assert.equal(w.tile(tx, ty), W.tileOf(c, tx - cx * 32, ty - cy * 32), 'tile ' + tx + ',' + ty);
    assert.equal(w.region(tx, ty), W.regionAt(seed, tx, ty), 'region ' + tx + ',' + ty);
  }
});

test('the base pad is open; the overlay blocks the HQ, reactor, lander and grid rocks', () => {
  const w = SW.create('WORLD-2');
  assert.equal(w.isBlocked(0, 0), false);
  w.setOverlay([[0, 0], [-6, -4]]);
  assert.equal(w.isBlocked(0, 0), true);
  assert.equal(w.isBlocked(-6, -4), true);
  assert.equal(w.isBlocked(1, 0), false);
});

test('chunks within 2 are made, chunks beyond 3 are deleted, the base chunks always stay', () => {
  const w = SW.create('WORLD-3');
  w.get(0, 0);
  w.retain(10 * 32 + 5, 5);
  let n = 0;
  while (w.work()) n++;
  assert.equal(n, 25);
  const live = () => new Set(w.liveKeys());
  for (let cy = -2; cy <= 2; cy++) for (let cx = 8; cx <= 12; cx++) assert.ok(live().has(cx + ',' + cy), cx + ',' + cy);
  w.retain(14 * 32 + 5, 5);
  for (const k of live()) {
    const [cx, cy] = k.split(',').map(Number);
    const base = cx >= -1 && cx <= 0 && cy >= -1 && cy <= 0;
    assert.ok(base || Math.max(Math.abs(cx - 14), Math.abs(cy)) <= 3, 'chunk ' + k + ' should be gone');
  }
  assert.ok(live().has('11,0'), 'a chunk 3 away is kept (no churn at the edge)');
  assert.ok(!live().has('10,0'), 'a chunk 4 away is deleted');
  assert.ok(live().has('0,0'), 'the base chunk stays');
});

test('the queue starts with the chunk nearest to where the player is heading', () => {
  const w = SW.create('WORLD-4');
  w.retain(5, 5, 5 + 64, 5); // standing in chunk (0, 0), heading two chunks east
  w.work();
  assert.deepEqual(w.liveKeys(), ['2,0']);
});

test('never more live chunks than the cap; the least recently used go first, the base never', () => {
  const w = SW.create('WORLD-5', { cap: 10 });
  w.get(0, 0);
  w.get(-1, -1);
  for (let i = 1; i <= 15; i++) w.get(i * 5, 40);
  assert.equal(w.stats().data, 10);
  assert.ok(w.peek(0, 0) && w.peek(-1, -1), 'base chunks stay');
  assert.equal(w.peek(5, 40), null, 'the oldest is dropped');
  assert.ok(w.peek(75, 40), 'the newest is kept');
});

test('a deleted chunk comes back byte-identical, and dataFor never keeps what it builds', () => {
  const w = SW.create('WORLD-6');
  const before = w.get(9, -9).tiles.slice();
  w.retain(100 * 32, 100 * 32);
  assert.equal(w.peek(9, -9), null);
  assert.deepEqual(w.dataFor(9, -9).tiles, before);
  assert.equal(w.peek(9, -9), null, 'dataFor did not keep it');
  assert.deepEqual(w.get(9, -9).tiles, before);
});

test('paths go around what blocks, stay inside the 64×64 box, and can end at a blocked goal', () => {
  const w = SW.create('WORLD-7');
  const wall = [];
  for (let y = -6; y <= 6; y++) wall.push([3, y]);
  w.setOverlay(wall);
  const path = w.findPath(0, 0, 6, 0, false);
  assert.ok(path && path.length >= 20, 'walked around the wall: ' + (path && path.length));
  for (const [x, y] of path) assert.ok(!w.isBlocked(x, y), 'step on a blocked tile ' + x + ',' + y);
  assert.deepEqual(path[path.length - 1], [6, 0]);
  assert.equal(w.findPath(0, 0, 40, 0, false), null, 'beyond the 32-tile box');
  const toWall = w.findPath(0, 0, 3, 0, true);
  assert.deepEqual(toWall[toWall.length - 1], [3, 0]);
  assert.equal(w.findPath(0, 0, 3, 0, false), null);
  assert.deepEqual(w.findPath(0, 0, 0, 0, false), []);
  const west = w.findPath(-1, -1, -8, -7, false); // inside the flat zone, west and north of the HQ
  assert.equal(west.length, 13);
  assert.deepEqual(west[west.length - 1], [-8, -7]);
});

test('walking is slower on dunes; everything else is normal speed', () => {
  const seed = W.seedOf('WORLD-8');
  let dune = null;
  for (const cy of [3, 40, 80, 120, -60]) for (let cx = -200; cx < 200 && !dune; cx += 7) {
    const c = W.chunk(seed, cx, cy), i = c.tiles.indexOf(W.TILE.DUNE);
    if (i >= 0) dune = [cx * 32 + (i % 32), cy * 32 + Math.floor(i / 32)];
  }
  assert.ok(dune, 'found a dune');
  const w = SW.create('WORLD-8');
  assert.equal(w.speed(dune[0], dune[1]), 0.7);
  assert.equal(w.speed(0, 0), 1);
});

test('fog: a circle is seen once, takeFog hands over only new chunks, and merging ORs', () => {
  const w = SW.create('WORLD-9');
  let expect = 0;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) if (dx * dx + dy * dy <= 64) expect++;
  assert.equal(w.reveal(0, 0, 8), expect);
  assert.equal(w.reveal(0, 0, 8), 0);
  assert.ok(w.seen(-8, 0) && w.seen(0, -8) && w.seen(8, 0), 'edges of the circle, both sides of zero');
  assert.ok(!w.seen(9, 0) && !w.seen(6, 6) && !w.seen(-6, -6));
  const sent = w.takeFog();
  assert.deepEqual(Object.keys(sent).sort(), ['-1,-1', '-1,0', '0,-1', '0,0']);
  assert.deepEqual(w.takeFog(), {});
  const other = SW.create('WORLD-9');
  other.reveal(40, 40, 3);
  assert.deepEqual(w.mergeFog(other.takeFog()), ['1,1']);
  assert.ok(w.seen(40, 40));
  assert.deepEqual(w.mergeFog(sent), [], 'our own fog echoed back changes nothing');
  const before = w.fogStamp('1,1');
  w.reveal(41, 44, 1);
  assert.ok(w.fogStamp('1,1') > before);
  assert.ok(w.fogKeys().includes('1,1'));
});

test('fog survives its chunk being deleted, and bad fog is ignored', () => {
  const w = SW.create('WORLD-10');
  w.get(9, 9);
  w.reveal(300, 300, 2);
  w.retain(-3000, -3000);
  assert.equal(w.peek(9, 9), null);
  assert.ok(w.seen(300, 300));
  const evil = JSON.parse('{"__proto__":"' + F.encode(F.empty()) + '","x,y":"zz","1,1":"short"}');
  assert.deepEqual(w.mergeFog(evil), []);
  assert.deepEqual(w.mergeFog(null), []);
  assert.deepEqual(w.mergeFog('nope'), []);
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/surface-world.test.js`
Expected: FAIL with `Cannot find module '../src/surface-world.js'`.

- [ ] **Step 3: Write `src/surface-world.js`**

```js
/*
 * SOL 500 — the surface's model of the endless world: which 32×32 data chunks are live, what blocks a step,
 * short paths, the build queue and the fog the crew has seen. No DOM, so the Node tests cover all of it;
 * src/surface-paint.js draws what this module knows.
 *
 * Data chunks are made when the player comes within MAKE chunks and deleted beyond KEEP (the gap avoids churn
 * at the edge). The base's four chunks are always kept, and a hard cap drops the least recently used first.
 * A deleted chunk is rebuilt from (seed, cx, cy), so it comes back identical. Fog is kept apart and survives.
 *
 * API: SolWorld.create(missionSeed, { cap }) → world (the object returned at the bottom of create)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./worldgen.js'), require('./fog.js'));
  else root.SolWorld = factory(root.SolWorldgen, root.SolFog);
})(typeof self !== 'undefined' ? self : this, function (W, F) {
  'use strict';
  const CH = W.CHUNK;
  const MAKE = 2, KEEP = 3, CAP = 64;
  const PATH_HALF = 32; // click-to-walk searches a 64×64-tile box around the walker
  const BASE_CHUNKS = ['-1,-1', '0,-1', '-1,0', '0,0'];
  const key = (cx, cy) => cx + ',' + cy;
  const chunkOf = t => Math.floor(t / CH);
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function create(missionSeed, opts) {
    const cap = (opts && opts.cap) || CAP;
    const seed = W.seedOf(missionSeed);
    const data = new Map();      // key → { c: chunk, used }
    const fog = new Map();       // key → Uint8Array(128): the tiles seen
    const fogText = new Map();   // key → the last base64 sent or merged, so an unchanged value is skipped quickly
    const stamp = new Map();     // key → bumps whenever that chunk's fog changes (the painter redraws its mini image)
    const dirty = new Set();     // chunks with fog not yet handed out by takeFog()
    const pinned = new Set(BASE_CHUNKS);
    let overlay = new Set();
    let queue = [];
    let tick = 0, built = 0;

    // ---------- data chunks ----------
    function evictOver() {
      while (data.size > cap) {
        let oldest = null, oldestKey = null;
        for (const [k, e] of data) if (!pinned.has(k) && (!oldest || e.used < oldest.used)) { oldest = e; oldestKey = k; }
        if (!oldestKey) return;
        data.delete(oldestKey);
      }
    }
    function get(cx, cy) {
      const k = key(cx, cy);
      let e = data.get(k);
      if (e) { e.used = ++tick; return e.c; }
      e = { c: W.chunk(seed, cx, cy), used: ++tick };
      data.set(k, e);
      built++;
      evictOver();
      return e.c;
    }
    function peek(cx, cy) { const e = data.get(key(cx, cy)); return e ? e.c : null; }
    // For far chunks the map needs once (their mini image): never kept, so they can't push out the player's chunks.
    function dataFor(cx, cy) { return peek(cx, cy) || W.chunk(seed, cx, cy); }

    function tile(tx, ty) {
      const cx = chunkOf(tx), cy = chunkOf(ty);
      return get(cx, cy).tiles[(ty - cy * CH) * CH + (tx - cx * CH)];
    }
    function region(tx, ty) {
      const cx = chunkOf(tx), cy = chunkOf(ty);
      return W.regionOf(get(cx, cy), tx - cx * CH, ty - cy * CH);
    }
    // Base things the world doesn't know about (the HQ, the reactor, the lander, rocks on the build grid) block too.
    function setOverlay(tiles) { overlay = new Set(tiles.map(t => t[0] + ',' + t[1])); }
    const isBlocked = (tx, ty) => overlay.has(tx + ',' + ty) || W.BLOCKING[tile(tx, ty)] === 1;
    const speed = (tx, ty) => W.SPEED[tile(tx, ty)];

    // Breadth-first search inside a 64×64-tile box around the start. Returns the tile steps (start excluded),
    // [] when already there, or null.
    function findPath(sx, sy, gx, gy, allowGoalBlocked) {
      if (Math.abs(gx - sx) > PATH_HALF || Math.abs(gy - sy) > PATH_HALF) return null;
      const size = PATH_HALF * 2 + 1, ox = sx - PATH_HALF, oy = sy - PATH_HALF;
      const at = (x, y) => (y - oy) * size + (x - ox);
      const prev = new Int32Array(size * size).fill(-1);
      const q = new Int32Array(size * size);
      const start = at(sx, sy), goal = at(gx, gy);
      prev[start] = start;
      let head = 0, tail = 0;
      q[tail++] = start;
      while (head < tail) {
        const n = q[head++];
        if (n === goal) break;
        const x = ox + (n % size), y = oy + Math.floor(n / size);
        for (const [dx, dy] of STEPS) {
          const nx = x + dx, ny = y + dy;
          if (nx < ox || ny < oy || nx >= ox + size || ny >= oy + size) continue;
          const m = at(nx, ny);
          if (prev[m] !== -1) continue;
          if (!(allowGoalBlocked && m === goal) && isBlocked(nx, ny)) continue;
          prev[m] = n;
          q[tail++] = m;
        }
      }
      if (prev[goal] === -1) return null;
      const path = [];
      for (let n = goal; n !== start; n = prev[n]) path.unshift([ox + (n % size), oy + Math.floor(n / size)]);
      return path;
    }

    // Keeps the chunks near the player and queues the missing ones, nearest to where the player is heading first.
    function retain(tx, ty, hx, hy) {
      const pcx = chunkOf(tx), pcy = chunkOf(ty);
      for (const [k, e] of data) {
        if (!pinned.has(k) && Math.max(Math.abs(e.c.cx - pcx), Math.abs(e.c.cy - pcy)) > KEEP) data.delete(k);
      }
      const hcx = chunkOf(hx == null ? tx : hx), hcy = chunkOf(hy == null ? ty : hy);
      const want = [];
      for (let cy = pcy - MAKE; cy <= pcy + MAKE; cy++) for (let cx = pcx - MAKE; cx <= pcx + MAKE; cx++) {
        if (!data.has(key(cx, cy))) want.push([cx, cy, (cx - hcx) * (cx - hcx) + (cy - hcy) * (cy - hcy)]);
      }
      want.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
      queue = want;
    }
    // Builds at most one queued chunk; returns whether it built one.
    function work() {
      while (queue.length) {
        const [cx, cy] = queue.shift();
        if (data.has(key(cx, cy))) continue;
        get(cx, cy);
        return true;
      }
      return false;
    }

    // ---------- fog ----------
    function bits(cx, cy, make) {
      const k = key(cx, cy);
      let b = fog.get(k);
      if (!b && make) { b = F.empty(); fog.set(k, b); }
      return b || null;
    }
    const bump = k => stamp.set(k, (stamp.get(k) || 0) + 1);
    // Marks every tile within r tiles of (tx, ty) as seen; returns how many were new.
    function reveal(tx, ty, r) {
      let n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = tx + dx, y = ty + dy, cx = chunkOf(x), cy = chunkOf(y);
        if (F.set(bits(cx, cy, true), x - cx * CH, y - cy * CH)) {
          n++;
          const k = key(cx, cy);
          dirty.add(k);
          bump(k);
        }
      }
      return n;
    }
    function seen(tx, ty) {
      const cx = chunkOf(tx), cy = chunkOf(ty), b = fog.get(key(cx, cy));
      return !!b && F.has(b, tx - cx * CH, ty - cy * CH) === 1;
    }
    // The chunks newly seen since the last call, as { key: base64 }. Whole chunks are sent: merging is an OR,
    // so sending a bit twice is harmless.
    function takeFog() {
      const out = {};
      for (const k of dirty) { out[k] = F.encode(fog.get(k)); fogText.set(k, out[k]); }
      dirty.clear();
      return out;
    }
    // Merges fog from the saved mission or from teammates; returns the keys whose fog changed.
    function mergeFog(map) {
      const changed = [];
      if (!map || typeof map !== 'object') return changed;
      for (const k of Object.keys(map)) {
        const text = map[k];
        if (!F.KEY.test(k) || fogText.get(k) === text) continue;
        const incoming = F.decode(text);
        if (!incoming) continue;
        fogText.set(k, text);
        const b = fog.get(k);
        if (!b) { fog.set(k, incoming); changed.push(k); bump(k); continue; }
        if (F.orInto(b, incoming)) { changed.push(k); bump(k); }
      }
      return changed;
    }

    return {
      seed, get, peek, dataFor, tile, region, setOverlay, isBlocked, speed, findPath, retain, work,
      reveal, seen, takeFog, mergeFog,
      fogBits: (cx, cy) => bits(cx, cy, false),
      fogStamp: k => stamp.get(k) || 0,
      fogKeys: () => [...fog.keys()],
      liveKeys: () => [...data.keys()],
      stats: () => ({ data: data.size, cap, queue: queue.length, fog: fog.size, built }),
    };
  }

  return { create, chunkOf, MAKE, KEEP, CAP, PATH_HALF };
});
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/surface-world.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test` (expected: all pass), then:

```bash
git add src/surface-world.js test/surface-world.test.js
git commit -m "feat(surface): world model for the endless map: chunk streaming with caps, collision, bounded paths, fog store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The painter — seamless ground chunks, fog, minimap images and sprites

**Files:**
- Create: `src/surface-paint.js`
- Test: `test/surface-paint.test.js`

**Interfaces:**
- Consumes: `SolWorldgen` (`TILE`, `CHUNK`, `BASE_RECT`, `hash`, `regionOf`); `SolFog` (`has`); a Task 4 `world` (`tile`, `region`, `peek`, `dataFor`, `fogBits`, `fogStamp`, `seed`).
- Produces (global `SolPaint`):
  - **Painter:** `createPainter(world, { canvas?: (w,h) → canvas, cap = 160, now?: () → ms }) → painter`. A `painter` has:
    - `retainView(x0, y0, x1, y1)`, with the rectangle in world pixels;
    - `work(deadline, atLeast = 0) → painted count`;
    - `drawGround(ctx, x0, y0, x1, y1)`;
    - `mini(cx, cy) → canvas | null`; `workMinis(deadline) → count`;
    - `chunkHash(ix, iy) → hex | null` (browser QA); `has(ix, iy)`; `pending() → [[ix, iy], …]`;
    - `stats() → { images, cap, queue, minis, miniQueue, renders, paintMedian }`.
  - **Drawing helpers:** `drawFog(ctx, world, x0, y0, x1, y1, px, py, radiusPx)`; `decorFor(world, ix, iy) → [{ kind, x, y, s, h }]`; `tileRGB(code, region) → [r, g, b]`.
  - **Constants:** `REGION_COLORS` (six CSS colours, in `REGIONS` order); `IMG = 4` (tiles per image chunk); `PX = 256`.
  - **Sprites:** `sprites = { drawAvatar(ctx, a, name, time, tags, roverImg), drawTags(ctx, tags), roundRect(ctx, x, y, w, h, r), badge(ctx, x, y, kind), drawRock(ctx, { wx, wy, s, ox?, oy? }), drawLander(ctx, wx, wy) }`. The avatar `a` needs `{ x, y, dir, phase, moving, you, down, rover, working, color }`.

This task **copies** the sprite functions out of `src/surface.js` with the parameter changes shown. `surface.js` keeps its own copies until Task 6 deletes them, so nothing breaks in between.

- [ ] **Step 1: Write the failing tests**

Create `test/surface-paint.test.js`:

```js
'use strict';
// The painter's cache rules (src/surface-paint.js), run against a fake canvas: what is queued, kept, deleted and capped.
// What the pixels look like is checked in the browser (Task 11), including that a repainted chunk hashes the same.
const test = require('node:test');
const assert = require('node:assert/strict');
const SW = require('../src/surface-world.js');
const P = require('../src/surface-paint.js');

// A 2D context that accepts every call; create* and measureText return what callers expect.
function fakeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (p === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const canvas = (w, h) => { const ctx = fakeCtx(); return { width: w, height: h, getContext: () => ctx }; };
const painter = (seed, opts) => {
  const world = SW.create(seed);
  return { world, p: P.createPainter(world, Object.assign({ canvas, now: () => 0 }, opts)) };
};

test('the view plus a one-chunk margin is queued, nearest the middle first', () => {
  const { p } = painter('PAINT-1');
  p.retainView(0, 0, 1024, 512);             // image chunks 0..4 × 0..2 on screen
  assert.equal(p.stats().queue, 7 * 5);      // −1..5 × −1..3 with the margin
  assert.deepEqual(p.pending()[0], [2, 1]);
});

test('painted chunks two outside the view are deleted; one outside are kept', () => {
  const { p } = painter('PAINT-2');
  p.retainView(0, 0, 1024, 512);
  p.work(Infinity);
  assert.equal(p.stats().images, 35);
  p.retainView(3 * 256, 0, 3 * 256 + 1024, 512); // move three chunks east
  assert.ok(p.has(1, 0), 'kept: one outside the new margin');
  assert.ok(!p.has(0, 0) && !p.has(-1, 0), 'deleted: two or more outside');
});

test('never more than the cap, but never a chunk on screen, even when the view needs more than the cap', () => {
  const { p } = painter('PAINT-3', { cap: 10 });
  p.retainView(0, 0, 2560, 1280);            // a 4K-wide view: needs 13 × 8 = 104 chunks
  p.work(Infinity);
  assert.equal(p.stats().images, 104);
  assert.equal(p.stats().cap, 104);
  p.retainView(0, 0, 256, 256);              // back to a small view: 4 × 4 = 16 needed
  p.work(Infinity);
  assert.ok(p.stats().images <= 16, 'trimmed to ' + p.stats().images);
  for (let iy = -1; iy <= 2; iy++) for (let ix = -1; ix <= 2; ix++) assert.ok(p.has(ix, iy), 'on screen ' + ix + ',' + iy);
});

test('work stops at the deadline but always paints at least what it is asked to', () => {
  let clock = 0;
  const world = SW.create('PAINT-4');
  const p = P.createPainter(world, { canvas, now: () => (clock += 1) });
  p.retainView(0, 0, 1024, 512);
  const n = p.work(clock + 5);
  assert.ok(n >= 1 && n < 35, 'painted ' + n);
  assert.equal(p.work(0, 1), 1, 'atLeast forces one even past the deadline');
});

test('decor is seeded by its chunk: the same list every time, each piece small enough to touch only its neighbours', () => {
  const { world } = painter('PAINT-5');
  for (const [ix, iy] of [[0, 0], [-3, 7], [40, -12]]) {
    const a = P.decorFor(world, ix, iy), b = P.decorFor(world, ix, iy);
    assert.deepEqual(a, b);
    for (const d of a) {
      assert.ok(d.x >= ix * 256 && d.x < ix * 256 + 256 && d.y >= iy * 256 && d.y < iy * 256 + 256);
      assert.ok(d.s <= 35, 'size ' + d.s);
    }
  }
});

test('mini images exist only for explored chunks and are redrawn when their fog changes', () => {
  const { world, p } = painter('PAINT-6');
  assert.equal(p.mini(0, 0), null, 'nothing seen yet');
  world.get(0, 0);
  world.reveal(5, 5, 3);
  const c = p.mini(0, 0);
  assert.ok(c);
  const renders = p.stats().renders;
  assert.equal(p.mini(0, 0), c, 'cached');
  assert.equal(p.stats().renders, renders);
  world.reveal(20, 20, 2);
  p.mini(0, 0);
  assert.equal(p.stats().renders, renders + 1, 'redrawn after the fog changed');
});

test("a far explored chunk's mini image is queued, and building it never pushes out the player's chunks", () => {
  const world = SW.create('PAINT-7', { cap: 8 });
  const p = P.createPainter(world, { canvas, now: () => 0 });
  for (let i = 0; i < 8; i++) world.get(i, 0);
  world.reveal(300, 300, 2);
  assert.equal(p.mini(9, 9), null);
  assert.equal(p.stats().miniQueue, 1);
  assert.equal(p.workMinis(Infinity), 1);
  assert.ok(p.mini(9, 9));
  assert.deepEqual(world.liveKeys().sort(), ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0', '7,0']);
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/surface-paint.test.js`
Expected: FAIL with `Cannot find module '../src/surface-paint.js'`.

- [ ] **Step 3: Write `src/surface-paint.js`**

```js
/*
 * SOL 500 — everything on the surface drawn with Canvas 2D:
 *   the ground, as 256-px image chunks (4×4 tiles) painted from the world data. Decor that crosses a chunk edge is
 *   replayed by every chunk it touches, clipped to itself, so there are no seams; painting is seeded from
 *   (seed, chunk), so a deleted chunk is repainted with exactly the same picture;
 *   the fog over the view; the minimap's one-pixel-per-tile "mini" images of explored chunks;
 *   and the sprites: astronauts, name tags, rocks, the lander and status badges.
 *
 * API: SolPaint.createPainter(world, { canvas, cap, now }) → painter · SolPaint.drawFog(...) · SolPaint.decorFor(...)
 *      SolPaint.tileRGB(code, region) · SolPaint.REGION_COLORS · SolPaint.sprites
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./worldgen.js'), require('./fog.js'));
  else root.SolPaint = factory(root.SolWorldgen, root.SolFog);
})(typeof self !== 'undefined' ? self : this, function (W, F) {
  'use strict';
  const T = 64, IMG = 4, PX = IMG * T, CH = W.CHUNK, CAP = 160, MINI_CAP = 512;
  const TL = W.TILE;

  // ---------- colours ----------
  // Regolith looks different in each region; the other codes have one colour each.
  const REGION_GROUND = [[116, 58, 37], [67, 48, 43], [104, 82, 72], [134, 72, 44], [177, 158, 146], [59, 45, 44]];
  const REGION_COLORS = ['#b4532f', '#4a3530', '#7d675c', '#c06a3a', '#cfe0e6', '#2f2526'];
  const UNDER_BOULDER = [TL.REGOLITH, TL.DUNE, TL.REGOLITH, TL.REGOLITH, TL.POLYGON, TL.LAVA];
  const CODE_RGB = [];
  CODE_RGB[TL.SAND] = [77, 49, 41];
  CODE_RGB[TL.DUNE] = [88, 57, 45];
  CODE_RGB[TL.BOULDER] = [76, 59, 55];
  CODE_RGB[TL.CLIFF] = [154, 92, 60];
  CODE_RGB[TL.RIM] = [164, 108, 76];
  CODE_RGB[TL.CRATER_FLOOR] = [88, 46, 31];
  CODE_RGB[TL.CANYON_FLOOR] = [104, 56, 36];
  CODE_RGB[TL.CANYON_WALL] = [62, 32, 23];
  CODE_RGB[TL.RAMP] = [142, 85, 54];
  CODE_RGB[TL.ICE] = [207, 227, 234];
  CODE_RGB[TL.POLYGON] = [177, 156, 144];
  CODE_RGB[TL.LAVA] = [59, 45, 44];
  CODE_RGB[TL.BASE] = [128, 70, 45];
  function tileRGB(code, region) {
    if (code === TL.REGOLITH || CODE_RGB[code] == null) return REGION_GROUND[region] || REGION_GROUND[0];
    return CODE_RGB[code];
  }
  const channel = v => Math.min(255, Math.round(v));
  const css = (rgb, k) => 'rgb(' + channel(rgb[0] * k) + ',' + channel(rgb[1] * k) + ',' + channel(rgb[2] * k) + ')';
  const RAISED = new Uint8Array(32);
  for (const k of ['CLIFF', 'RIM', 'CANYON_WALL']) RAISED[TL[k]] = 1;
  // A gentle brightness drift across the ground. It comes from smooth noise, so tiles never show as a checkerboard.
  const shade = (world, tx, ty) => 0.96 + 0.08 * W.noise(world.seed, 920, tx, ty, 5);

  // ---------- one tile of ground ----------
  function paintTile(g, world, tx, ty) {
    const code = world.tile(tx, ty);
    if (RAISED[code]) return; // painted after the decor, in paintRaised
    const reg = world.region(tx, ty);
    const h = W.hash(world.seed, tx, ty, 900);
    const X = tx * T, Y = ty * T;
    // A boulder sits on its region's usual ground, drawn just like that ground (the rock goes on top in paintRaised).
    const look = code === TL.BOULDER ? UNDER_BOULDER[reg] : code;
    g.fillStyle = css(tileRGB(look, reg), shade(world, tx, ty));
    g.fillRect(X, Y, T, T);
    if (look === TL.DUNE) { // ripples across the wind; the ends line up with the next tile's, so they run on unbroken
      g.strokeStyle = 'rgba(140,96,74,0.45)';
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) { const y = Y + 8 + k * 16; g.beginPath(); g.moveTo(X, y); g.quadraticCurveTo(X + 32, y - 3 - ((h >>> (4 + k * 2)) & 3) * 2, X + T, y); g.stroke(); }
    } else if (look === TL.POLYGON) { // ground cracked into polygons by freezing and thawing
      g.strokeStyle = 'rgba(120,98,88,0.55)';
      g.lineWidth = 1.5;
      const a = 12 + ((h >>> 4) % 40), b = 12 + ((h >>> 10) % 40);
      g.beginPath(); g.moveTo(X + a, Y); g.lineTo(X + b, Y + T); g.moveTo(X, Y + b); g.lineTo(X + T, Y + a); g.stroke();
    } else if (look === TL.ICE) {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X + 8, Y + 20); g.lineTo(X + 22, Y + 26); g.lineTo(X + 32, Y + 17); g.lineTo(X + 46, Y + 28); g.stroke();
      g.beginPath(); g.moveTo(X + 12, Y + 44); g.lineTo(X + 24, Y + 40); g.lineTo(X + 33, Y + 48); g.lineTo(X + 48, Y + 43); g.stroke();
    } else if (look === TL.LAVA) {
      g.fillStyle = 'rgba(20,14,14,0.5)';
      for (let k = 0; k < 6; k++) { const v = W.hash(world.seed, tx, ty, 901 + k); g.fillRect(X + (v % 60), Y + ((v >>> 8) % 60), 2 + ((v >>> 16) % 3), 2 + ((v >>> 20) % 3)); }
    } else if (code === TL.CANYON_FLOOR) {
      g.fillStyle = 'rgba(190,120,80,0.16)';
      g.fillRect(X, Y + 18, T, 5);
      g.fillRect(X, Y + 44, T, 4);
    } else if (code === TL.CRATER_FLOOR) {
      g.fillStyle = 'rgba(30,10,6,0.12)';
      g.fillRect(X, Y, T, T);
    } else if (code === TL.BASE) { // compacted regolith with the build grid's dashed lines
      const B = W.BASE_RECT;
      g.strokeStyle = 'rgba(255,220,190,0.12)';
      g.lineWidth = 1;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.moveTo(X, Y); g.lineTo(X + T, Y);
      g.moveTo(X, Y); g.lineTo(X, Y + T);
      if (tx === B.x + B.w - 1) { g.moveTo(X + T, Y); g.lineTo(X + T, Y + T); }
      if (ty === B.y + B.h - 1) { g.moveTo(X, Y + T); g.lineTo(X + T, Y + T); }
      g.stroke();
      g.setLineDash([]);
    }
  }

  // Things that stand up (mesa cliffs, crater rims, canyon walls, boulders) go on top of the decor.
  function paintRaised(g, world, tx, ty) {
    const code = world.tile(tx, ty);
    const X = tx * T, Y = ty * T;
    if (RAISED[code]) {
      g.fillStyle = css(tileRGB(code, world.region(tx, ty)), shade(world, tx, ty));
      g.fillRect(X, Y, T, T);
      const below = world.tile(tx, ty + 1) !== code, above = world.tile(tx, ty - 1) !== code;
      if (code === TL.CLIFF) {
        g.fillStyle = 'rgba(255,214,170,0.10)';
        g.fillRect(X, Y, T, T);
        if (above) { g.fillStyle = 'rgba(255,230,200,0.22)'; g.fillRect(X, Y, T, 3); }
        if (below) {
          g.fillStyle = '#4a2618';
          g.fillRect(X, Y + T - 22, T, 22);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(X, Y + T - 6, T, 6);
        }
      } else {
        if (above) { g.fillStyle = code === TL.RIM ? 'rgba(255,214,170,0.22)' : 'rgba(255,214,170,0.12)'; g.fillRect(X, Y, T, 4); }
        if (below) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X, Y + T - 10, T, 10); }
      }
    } else if (code === TL.BOULDER) {
      const h = W.hash(world.seed, tx, ty, 902);
      drawRock(g, { wx: tx, wy: ty, s: 0.7 + (h % 31) / 100, ox: ((h >>> 8) % 9) - 4, oy: ((h >>> 12) % 7) - 3 });
    }
  }

  // ---------- decor ----------
  const GROUND = new Uint8Array(32);
  for (const k of ['REGOLITH', 'SAND', 'DUNE', 'CRATER_FLOOR', 'CANYON_FLOOR', 'ICE', 'POLYGON', 'LAVA']) GROUND[TL[k]] = 1;
  const DECOR = [
    ['blotch', 'blotch', 'pebbles', 'pit'],   // Plains
    ['ripple', 'ripple', 'blotch'],           // Dune Sea
    ['pit', 'pit', 'pebbles', 'blotch'],      // Crater Field
    ['strata', 'pebbles', 'blotch'],          // Canyon Lands
    ['crack', 'frost', 'blotch'],             // Icy Plains
    ['vesicles', 'pebbles', 'blotch'],        // Volcanic Flanks
  ];
  // The decor that belongs to one image chunk. Each piece reaches at most 58 px from its centre, so it can only
  // spill into the next chunk; every chunk it touches replays it, clipped to itself.
  function decorFor(world, ix, iy) {
    const out = [];
    const n = 5 + (W.hash(world.seed, ix, iy, 910) % 6);
    for (let i = 0; i < n; i++) {
      const h = W.hash(world.seed, ix * 16 + i, iy, 911);
      const x = ix * PX + (h % PX), y = iy * PX + ((h >>> 8) % PX);
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (!GROUND[world.tile(tx, ty)]) continue;
      const kinds = DECOR[world.region(tx, ty)];
      out.push({ kind: kinds[(h >>> 16) % kinds.length], x, y, s: 8 + ((h >>> 20) % 28), h });
    }
    return out;
  }
  function drawDecor(g, d) {
    const x = d.x, y = d.y, s = d.s, h = d.h;
    if (d.kind === 'blotch') {
      g.fillStyle = h & 1 ? 'rgba(40,14,8,0.10)' : 'rgba(200,120,80,0.07)';
      g.beginPath(); g.ellipse(x, y, s * 1.4, s * 0.8, ((h >>> 3) % 7) * 0.4, 0, Math.PI * 2); g.fill();
    } else if (d.kind === 'pebbles') {
      g.fillStyle = h & 2 ? '#5a2a1b' : '#8f4d33';
      for (let k = 0; k < 6; k++) g.fillRect(x + ((h >>> (k * 3)) % 24) - 12, y + ((h >>> (k * 3 + 1)) % 16) - 8, 2 + (k & 1), 2);
    } else if (d.kind === 'pit') {
      g.fillStyle = 'rgba(40,14,8,0.25)';
      g.beginPath(); g.ellipse(x, y, s, s * 0.62, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(210,140,100,0.25)';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y + 1, s, s * 0.62, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
    } else if (d.kind === 'ripple') {
      g.strokeStyle = 'rgba(120,84,64,0.35)';
      g.lineWidth = 1.5;
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x - s * 1.5, y + k * 7); g.quadraticCurveTo(x, y + k * 7 - 5, x + s * 1.5, y + k * 7); g.stroke(); }
    } else if (d.kind === 'strata') {
      g.strokeStyle = 'rgba(214,160,110,0.22)';
      g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - s * 1.6, y + k * 6); g.lineTo(x + s * 1.6, y + k * 6 + 2); g.stroke(); }
    } else if (d.kind === 'crack') {
      g.strokeStyle = 'rgba(110,90,80,0.5)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - s / 3, y - 5); g.lineTo(x + s / 3, y + 4); g.lineTo(x + s, y - 2); g.stroke();
    } else if (d.kind === 'frost') {
      g.fillStyle = 'rgba(240,248,255,0.18)';
      g.beginPath(); g.ellipse(x, y, s * 1.2, s * 0.7, 0, 0, Math.PI * 2); g.fill();
    } else if (d.kind === 'vesicles') {
      g.fillStyle = 'rgba(15,10,10,0.45)';
      for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(x + ((h >>> (k * 2)) % 30) - 15, y + ((h >>> (k * 2 + 5)) % 20) - 10, 1.5 + (k & 1), 0, Math.PI * 2); g.fill(); }
    }
  }

  function paintChunk(world, ix, iy, canvas) {
    const g = canvas.getContext('2d');
    const tx0 = ix * IMG, ty0 = iy * IMG;
    g.setTransform(1, 0, 0, 1, -ix * PX, -iy * PX); // draw in world pixels
    for (let ty = ty0; ty < ty0 + IMG; ty++) for (let tx = tx0; tx < tx0 + IMG; tx++) paintTile(g, world, tx, ty);
    g.save();
    g.beginPath();
    g.rect(ix * PX, iy * PX, PX, PX);
    g.clip();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const d of decorFor(world, ix + dx, iy + dy)) drawDecor(g, d);
    g.restore();
    for (let ty = ty0; ty < ty0 + IMG; ty++) for (let tx = tx0; tx < tx0 + IMG; tx++) paintRaised(g, world, tx, ty);
  }

  // ---------- the painter: image chunks and mini images, with their caches ----------
  function createPainter(world, opts) {
    const o = opts || {};
    const makeCanvas = o.canvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
    const now = o.now || (() => performance.now());
    const cap = o.cap || CAP;
    const images = new Map(); // "ix,iy" → { c, ix, iy, used }
    const minis = new Map();  // "cx,cy" → { c, stamp, used }
    const miniWant = new Set();
    const times = [];
    let queue = [], view = null, need = 0, tick = 0, renders = 0;

    const inView = e => !!view && e.ix >= view[0] && e.ix <= view[2] && e.iy >= view[1] && e.iy <= view[3];
    // The cap never pushes out a chunk the current view needs: a very wide window just keeps more.
    function evictImages() {
      const limit = Math.max(cap, need);
      while (images.size > limit) {
        let oldest = null, oldestKey = null;
        for (const [k, e] of images) if (!inView(e) && (!oldest || e.used < oldest.used)) { oldest = e; oldestKey = k; }
        if (!oldestKey) return;
        images.delete(oldestKey);
      }
    }
    function retainView(x0, y0, x1, y1) {
      const a = Math.floor(x0 / PX) - 1, b = Math.floor(y0 / PX) - 1, c = Math.floor(x1 / PX) + 1, d = Math.floor(y1 / PX) + 1;
      view = [a, b, c, d];
      need = (c - a + 1) * (d - b + 1);
      for (const [k, e] of images) if (e.ix < a - 1 || e.ix > c + 1 || e.iy < b - 1 || e.iy > d + 1) images.delete(k);
      const mx = (a + c) / 2, my = (b + d) / 2, want = [];
      for (let iy = b; iy <= d; iy++) for (let ix = a; ix <= c; ix++) {
        if (!images.has(ix + ',' + iy)) want.push([ix, iy, (ix - mx) * (ix - mx) + (iy - my) * (iy - my)]);
      }
      want.sort((p, q) => p[2] - q[2]);
      queue = want;
      evictImages();
    }
    // Paints queued chunks until the deadline (but at least `atLeast` of them); returns how many it painted.
    function work(deadline, atLeast) {
      let n = 0;
      while (queue.length && (n < (atLeast || 0) || now() < deadline)) {
        const [ix, iy] = queue.shift();
        const k = ix + ',' + iy;
        if (images.has(k)) continue;
        const t0 = now();
        const c = makeCanvas(PX, PX);
        paintChunk(world, ix, iy, c);
        times.push(now() - t0);
        if (times.length > 200) times.shift();
        images.set(k, { c, ix, iy, used: ++tick });
        evictImages();
        n++;
      }
      return n;
    }
    function drawGround(ctx, x0, y0, x1, y1) {
      const a = Math.floor(x0 / PX), b = Math.floor(y0 / PX), c = Math.floor(x1 / PX), d = Math.floor(y1 / PX);
      for (let iy = b; iy <= d; iy++) for (let ix = a; ix <= c; ix++) {
        const e = images.get(ix + ',' + iy);
        if (e) {
          e.used = ++tick;
          // one extra pixel of overlap hides the hairline seam between neighbours at fractional zooms
          ctx.drawImage(e.c, 0, 0, PX, PX, ix * PX, iy * PX, PX + 1, PX + 1);
        } else flat(ctx, ix, iy);
      }
    }
    // A chunk not painted yet is drawn as flat tile colours from its data, so there are never holes.
    function flat(ctx, ix, iy) {
      for (let ty = iy * IMG; ty < iy * IMG + IMG; ty++) for (let tx = ix * IMG; tx < ix * IMG + IMG; tx++) {
        const cx = Math.floor(tx / CH), cy = Math.floor(ty / CH), data = world.peek(cx, cy);
        const lx = tx - cx * CH, ly = ty - cy * CH;
        ctx.fillStyle = css(data ? tileRGB(data.tiles[ly * CH + lx], W.regionOf(data, lx, ly)) : REGION_GROUND[0], 1);
        ctx.fillRect(tx * T, ty * T, T + 0.5, T + 0.5);
      }
    }

    // One pixel per tile, seen tiles only; redrawn when that chunk's fog changes.
    function renderMini(c, data, fogBits) {
      const g = c.getContext('2d');
      const img = g.createImageData(CH, CH), px = img.data;
      for (let ly = 0; ly < CH; ly++) for (let lx = 0; lx < CH; lx++) {
        const o4 = (ly * CH + lx) * 4;
        if (!F.has(fogBits, lx, ly)) { px[o4 + 3] = 0; continue; }
        const rgb = tileRGB(data.tiles[ly * CH + lx], W.regionOf(data, lx, ly));
        px[o4] = rgb[0]; px[o4 + 1] = rgb[1]; px[o4 + 2] = rgb[2]; px[o4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      renders++;
    }
    function mini(cx, cy, build) {
      const k = cx + ',' + cy;
      const fogBits = world.fogBits(cx, cy);
      if (!fogBits) return null;
      const st = world.fogStamp(k);
      let e = minis.get(k);
      if (e && e.stamp === st) { e.used = ++tick; return e.c; }
      const data = build ? world.dataFor(cx, cy) : world.peek(cx, cy);
      if (!data) { miniWant.add(k); return e ? e.c : null; }
      if (!e) { e = { c: makeCanvas(CH, CH), stamp: st, used: 0 }; minis.set(k, e); }
      renderMini(e.c, data, fogBits);
      e.stamp = st;
      e.used = ++tick;
      miniWant.delete(k);
      while (minis.size > MINI_CAP) {
        let oldest = null, oldestKey = null;
        for (const [mk, me] of minis) if (!oldest || me.used < oldest.used) { oldest = me; oldestKey = mk; }
        minis.delete(oldestKey);
      }
      return e.c;
    }
    // Builds queued mini images (far explored chunks the map wants) until the deadline, at least one per call.
    function workMinis(deadline) {
      let n = 0;
      for (const k of [...miniWant]) {
        if (n > 0 && now() >= deadline) break;
        miniWant.delete(k);
        const [cx, cy] = k.split(',').map(Number);
        mini(cx, cy, true);
        n++;
      }
      return n;
    }

    // Browser QA: a hash of a painted chunk's pixels proves a deleted chunk comes back identical.
    function chunkHash(ix, iy) {
      const e = images.get(ix + ',' + iy);
      if (!e) return null;
      const px = e.c.getContext('2d').getImageData(0, 0, PX, PX).data;
      let h = 2166136261;
      for (let i = 0; i < px.length; i++) h = Math.imul(h ^ px[i], 16777619);
      return (h >>> 0).toString(16).padStart(8, '0');
    }
    function stats() {
      const sorted = times.slice().sort((a, b) => a - b);
      return {
        images: images.size, cap: Math.max(cap, need), queue: queue.length, minis: minis.size, miniQueue: miniWant.size,
        renders, paintMedian: sorted.length ? sorted[sorted.length >> 1] : 0,
      };
    }
    return {
      retainView, work, drawGround, workMinis, chunkHash, stats,
      mini: (cx, cy) => mini(cx, cy, false),
      has: (ix, iy) => images.has(ix + ',' + iy),
      pending: () => queue.map(q => [q[0], q[1]]),
    };
  }

  // ---------- fog over the view ----------
  // Unseen tiles are covered; seen tiles outside your view radius are dimmed; tiles in view are clear.
  const FOG = '#120a0c';
  function drawFog(ctx, world, x0, y0, x1, y1, px, py, rad) {
    const tx0 = Math.floor(x0 / T), ty0 = Math.floor(y0 / T), tx1 = Math.floor(x1 / T), ty1 = Math.floor(y1 / T);
    ctx.fillStyle = FOG;
    for (let ty = ty0; ty <= ty1; ty++) {
      const ky = Math.floor(ty / CH), ly = ty - ky * CH;
      let run = null, kx = null, fogBits = null;
      for (let tx = tx0; tx <= tx1 + 1; tx++) {
        let hidden = false;
        if (tx <= tx1) {
          const cx = Math.floor(tx / CH);
          if (cx !== kx) { kx = cx; fogBits = world.fogBits(cx, ky); }
          hidden = !fogBits || !F.has(fogBits, tx - cx * CH, ly);
        }
        if (hidden && run === null) run = tx;
        else if (!hidden && run !== null) { ctx.fillRect(run * T, ty * T, (tx - run) * T, T + 0.5); run = null; }
      }
    }
    const g = ctx.createRadialGradient(px, py, Math.max(0, rad - T * 1.5), px, py, rad);
    g.addColorStop(0, 'rgba(10,6,8,0)');
    g.addColorStop(1, 'rgba(10,6,8,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  // ---------- sprites (moved from surface.js) ----------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawRock(ctx, d) {
    const cx = d.wx * T + T / 2 + (d.ox || 0), cy = d.wy * T + T / 2 + (d.oy || 0);
    const s = d.s;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 14 * s, 22 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4c3b37';
    ctx.beginPath(); ctx.ellipse(cx - 4 * s, cy + 4 * s, 20 * s, 14 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5e4a45';
    ctx.beginPath(); ctx.ellipse(cx + 10 * s, cy - 2 * s, 12 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6f5a54';
    ctx.beginPath(); ctx.ellipse(cx - 8 * s, cy - 1 * s, 7 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawLander(ctx, wx, wy) {
    const cx = wx * T + T / 2, cy = wy * T + T / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 22, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-18, 2); ctx.lineTo(-30, 22); ctx.moveTo(18, 2); ctx.lineTo(30, 22); ctx.moveTo(0, 6); ctx.lineTo(0, 22); ctx.stroke();
    ctx.fillStyle = '#c9c1b5';
    ctx.beginPath(); ctx.moveTo(-24, 4); ctx.lineTo(24, 4); ctx.lineTo(16, -14); ctx.lineTo(-16, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9aa7a';
    ctx.fillRect(-22, -2, 44, 5);
    ctx.fillStyle = '#86b8ea';
    ctx.fillRect(-12, -12, 7, 12); ctx.fillRect(5, -12, 7, 12);
    ctx.restore();
  }

  function badge(ctx, x, y, kind) {
    ctx.save();
    ctx.translate(x, y);
    if (kind === 'broken') {
      ctx.fillStyle = '#f46e5f';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a1214';
      ctx.fillRect(-1.5, -5.5, 3, 7); ctx.fillRect(-1.5, 3, 3, 2.6);
    } else {
      ctx.fillStyle = '#3a2e33';
      ctx.strokeStyle = '#9a877f';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f2b84f';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 1, 4.5, -Math.PI * 0.25, Math.PI * 1.25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 0); ctx.stroke();
    }
    ctx.restore();
  }

  // a: { x, y, dir, phase, moving, you, down, rover, working, color }. Name tags are queued in `tags`
  // and laid out by drawTags once every sprite is drawn.
  function drawAvatar(ctx, a, name, time, tags, roverImg) {
    const color = a.color || '#ccc';
    const x = a.x, y = a.y;
    const tag = (tx, ty, text, c, you) => { if (text) tags.push({ x: tx, y: ty, text, color: c, you }); };
    ctx.save();
    if (a.you) {
      const pulse = 0.55 + 0.45 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(140,188,236,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 12, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    if (a.rover) {
      if (roverImg) {
        ctx.save();
        if (a.dir === 'left') { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
        ctx.drawImage(roverImg, x - 34, y - 52, 68, 68);
        ctx.restore();
      }
      tag(x, y - 50, name, color, a.you);
      ctx.restore();
      return;
    }
    if (a.down) {
      ctx.translate(x, y - 6);
      ctx.fillStyle = '#e9e2d8';
      roundRect(ctx, -16, -6, 26, 12, 5); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-10, -6, 3, 12);
      ctx.fillStyle = '#f3eee7'; ctx.beginPath(); ctx.arc(14, 0, 8, 0, Math.PI * 2); ctx.fill();
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.fillStyle = `rgba(244,110,95,${0.6 + pulse * 0.4})`;
      ctx.fillRect(-2, -26, 4, 14); ctx.fillRect(-7, -21, 14, 4);
      ctx.restore();
      tag(x, y - 34, name, '#f46e5f', a.you);
      return;
    }
    const bob = a.moving ? Math.abs(Math.sin(a.phase)) * 2 : Math.sin(time * 2 + x) * 0.6;
    const swing = a.moving ? Math.sin(a.phase) * 4 : 0;
    // legs
    ctx.fillStyle = '#d6cec3';
    roundRect(ctx, x - 7, y - 11 + (swing > 0 ? 0 : 1), 6, 11 - (swing > 0 ? 0 : 1) + Math.max(0, swing * 0.3), 2); ctx.fill();
    roundRect(ctx, x + 1, y - 11 + (swing < 0 ? 0 : 1), 6, 11 - (swing < 0 ? 0 : 1) + Math.max(0, -swing * 0.3), 2); ctx.fill();
    ctx.fillStyle = '#6d6266';
    ctx.fillRect(x - 7, y - 2, 6, 2); ctx.fillRect(x + 1, y - 2, 6, 2);
    const by = y - 12 - bob;
    // backpack behind (visible from the sides and back)
    if (a.dir !== 'down') {
      ctx.fillStyle = '#9da3a9';
      const bx = a.dir === 'left' ? x + 4 : a.dir === 'right' ? x - 14 : x - 9;
      roundRect(ctx, bx, by - 18, a.dir === 'up' ? 18 : 10, 16, 3); ctx.fill();
    }
    // arms
    ctx.fillStyle = '#e1d9ce';
    roundRect(ctx, x - 13, by - 17 + swing * 0.5, 5, 12, 2.5); ctx.fill();
    roundRect(ctx, x + 8, by - 17 - swing * 0.5, 5, 12, 2.5); ctx.fill();
    // torso
    ctx.fillStyle = '#ece5db';
    roundRect(ctx, x - 9, by - 19, 18, 19, 5); ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x - 9, by - 9, 18, 3);
    if (a.dir === 'down') { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + 4, by - 14, 2.2, 0, Math.PI * 2); ctx.fill(); }
    // helmet
    const hy = by - 27;
    ctx.fillStyle = '#f4efe8';
    ctx.strokeStyle = '#b9afa4';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, hy, 10.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    roundRect(ctx, x - 3.5, hy - 12, 7, 3, 1.5); ctx.fill();
    if (a.dir !== 'up') {
      const ox = a.dir === 'left' ? -3 : a.dir === 'right' ? 3 : 0;
      const grad = ctx.createLinearGradient(x, hy - 6, x, hy + 6);
      grad.addColorStop(0, '#0e1a2b');
      grad.addColorStop(0.65, '#1f3c62');
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(x + ox, hy + 1, a.dir === 'down' ? 7.5 : 6, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x + ox - 1, hy, 4.5, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    }
    if (a.working) {
      const wob = Math.sin(time * 6) * 1.5;
      ctx.fillStyle = 'rgba(20,14,16,0.85)';
      ctx.beginPath(); ctx.arc(x + 15, hy - 14 + wob, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x + 15, hy - 14 + wob, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    tag(x, hy - 17, name, color, a.you);
  }

  // Name tags are laid out after all sprites so they never pile on top of each other.
  function drawTags(ctx, tags) {
    const placed = [];
    ctx.font = '600 10px "Be Vietnam Pro", system-ui, sans-serif';
    const list = tags.slice().sort((a, b) => (b.you - a.you) || (b.y - a.y));
    for (const tg of list) {
      const w = ctx.measureText(tg.text).width + 16;
      let y = tg.y;
      for (let i = 0; i < 6; i++) {
        const hit = placed.some(r => Math.abs(r.x - tg.x) < (r.w + w) / 2 + 2 && Math.abs(r.y - y) < 16);
        if (!hit) break;
        y -= 16;
      }
      placed.push({ x: tg.x, y, w });
      drawTag(ctx, tg.x, y, tg.text, tg.color, tg.you, w);
    }
    tags.length = 0;
  }

  function drawTag(ctx, x, y, text, color, you, w) {
    ctx.save();
    ctx.fillStyle = you ? 'rgba(140,188,236,0.92)' : 'rgba(20,14,16,0.78)';
    roundRect(ctx, x - w / 2, y - 14, w, 15, 7); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x - w / 2 + 7, y - 6.5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = you ? '#0c1a29' : '#f4e9df';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x - w / 2 + 12, y - 6.2);
    ctx.restore();
  }

  return {
    IMG, PX, REGION_COLORS, tileRGB, decorFor, createPainter, drawFog,
    sprites: { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander },
  };
});
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/surface-paint.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test` (expected: all pass), then:

```bash
git add src/surface-paint.js test/surface-paint.test.js
git commit -m "feat(surface): painter for the endless ground: seamless seeded image chunks, capped caches, fog, minimap images, sprites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: The endless surface in the browser — streaming, fog, minimap, full map, debug overlay

**Files:**
- Create: `src/surface-map.js`
- Modify: `src/surface.js` (the edits E1–E16 below), `index.html`, `sw.js`, `src/style.css`, `src/i18n.js`, `src/ui.js` (help list only)
- Test: `test/sw.test.js` (append), plus the browser checks in Step 8

**Interfaces:**
- Consumes: `SolWorldgen` (Tasks 1–2), `SolFog` (Task 3), `SolWorld` (Task 4), `SolPaint` (Task 5).
- Produces:
  - **`SolMap`:** `SolMap.create({ t, onOpen, onClose }) → map` and `SolMap.debugText(stats)`. The `map` has:
    - `minimap` and `el` (elements for the surface overlay);
    - `attach(world, painter)`;
    - `drawMini(state, now)` and `frame(state, deadline)`, where `state = { px, py, crew: [{ x, y, color, you }] }` in world pixels;
    - `open(state?)`, `close()`, `isOpen()`, `key(e) → bool`, `relabel()`.
  - **`SolSurface`:**
    - `update(data)` also accepts `data.fog`, a `{ key: base64 }` map merged into the world;
    - new: `SolSurface.mergeFog(map)` and `SolSurface.reset()`;
    - new hooks it calls: `hooks.reveal(diff)` (at most once a second, with newly seen chunks) and `hooks.enterRegion(regionId)` (whenever your astronaut walks into a different region, including the first frame);
    - with `?debug=chunks` only: `SolSurface.qa = { hold(code, on), board(on), ghost(on), speed(x), chunkHash(ix, iy), teleport(tx, ty) }`;
    - `probe()` also returns `tile`, `region`, `fps`, `mapOpen`, `world` (stats), `paint` (stats) and `seen(tx, ty)`.
- i18n keys added here (EN+VI): `region.plains|dunes|craters|canyons|icy|volcanic`, `sf.minimap`, `sf.mapTitle`, `sf.mapHint`, `sf.zoomIn`, `sf.zoomOut`, `help.9`. The values of `sf.hintKeys` and `sf.hintTouch` change.

The surface keeps working through the change: `ui.js` still passes `controlId` as before. Task 8 switches it to `mission.pilot`.

- [ ] **Step 1: Write the failing test**

Append to `test/sw.test.js`:

```js
test('every script the page loads is in the offline cache', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const scripts = [...html.matchAll(/<script src="(src\/[a-z0-9-]+\.js)"><\/script>/g)].map(m => m[1]);
  for (const s of ['src/worldgen.js', 'src/fog.js', 'src/surface-world.js', 'src/surface-paint.js', 'src/surface-map.js']) assert.ok(scripts.includes(s), s + ' is loaded by index.html');
  for (const s of scripts) assert.ok(sw.includes("'" + s + "'"), s + ' is cached by sw.js');
  assert.ok(scripts.indexOf('src/surface-map.js') < scripts.indexOf('src/surface.js') && scripts.indexOf('src/surface.js') < scripts.indexOf('src/ui.js'), 'load order');
  assert.match(sw, /const CACHE = 'sol500-v2'/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/sw.test.js`
Expected: FAIL with `src/worldgen.js is loaded by index.html`.

- [ ] **Step 3: Load and cache the new scripts**

In `index.html`, replace the line `<script src="src/surface.js"></script>` with:

```html
<script src="src/worldgen.js"></script>
<script src="src/fog.js"></script>
<script src="src/surface-world.js"></script>
<script src="src/surface-paint.js"></script>
<script src="src/surface-map.js"></script>
<script src="src/surface.js"></script>
```

In `sw.js`, replace the `CACHE` and `SHELL` declarations with:

```js
const CACHE = 'sol500-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'src/style.css', 'src/data.js', 'src/engine.js', 'src/i18n.js', 'src/art.js', 'src/charts.js',
  'src/net.js', 'src/worldgen.js', 'src/fog.js', 'src/surface-world.js', 'src/surface-paint.js', 'src/surface-map.js',
  'src/surface.js', 'src/ui.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];
```

Run: `node --test test/sw.test.js`
Expected: PASS. (`src/surface-map.js` doesn't exist yet. The test only reads `index.html` and `sw.js`.)

- [ ] **Step 4: Write `src/surface-map.js`**

```js
/*
 * SOL 500 — the minimap (160×160 tiles, one pixel per tile, centred on you) and the full-screen map of everything
 * the crew has explored, with pan and zoom. Both draw the painter's one-pixel-per-tile "mini" images of explored
 * chunks, so they never need the full ground painting. Also formats the debug overlay (?debug=chunks or F3).
 *
 * API: SolMap.create({ t, onOpen, onClose }) → map
 *        map.attach(world, painter)          a new mission's world
 *        map.minimap · map.el                elements for the surface overlay
 *        map.drawMini(state, now)            state: { px, py, crew: [{ x, y, color, you }] } (world pixels)
 *        map.open(state?) · map.close() · map.isOpen() · map.key(keyEvent) → used?
 *        map.frame(state, deadline)          every animation frame (does nothing while closed)
 *        map.relabel()                       after a language change
 *      SolMap.debugText(stats) → string
 */
(function (root) {
  'use strict';
  const W = root.SolWorldgen, P = root.SolPaint;
  const T = 64, CH = W.CHUNK, MINI = 160;
  const ZOOMS = [1, 2, 3, 4, 6, 8]; // screen pixels per tile on the full map
  const PAN = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };

  function create(opts) {
    const t = opts.t;
    let world = null, painter = null, last = null, lastMini = -1e9;
    let open = false, zi = 2, cx = 0, cy = 0, drag = null;
    const dpr = () => Math.min(2, root.devicePixelRatio || 1);
    const node = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    // The HQ, then every crew member as a dot in their role colour (you with a white ring).
    function markers(g, st, at) {
      const [bx, by] = at(T / 2, T / 2); // the HQ is tile (0, 0)
      g.fillStyle = '#f4e9df';
      g.strokeStyle = '#120a0c';
      g.lineWidth = 1;
      g.fillRect(bx - 3.5, by - 3.5, 7, 7);
      g.strokeRect(bx - 3.5, by - 3.5, 7, 7);
      for (const c of st.crew) {
        const [x, y] = at(c.x, c.y);
        g.fillStyle = c.color;
        g.beginPath(); g.arc(x, y, c.you ? 3.5 : 2.5, 0, Math.PI * 2); g.fill();
        if (c.you) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.stroke(); }
      }
    }

    // ---------- minimap ----------
    const minimap = node('button', 'sf-mini');
    minimap.type = 'button';
    const mc = node('canvas');
    minimap.appendChild(mc);
    minimap.addEventListener('click', () => openMap());

    function drawMini(st, now) {
      last = st;
      if (!world || open || now - lastMini < 150) return;
      lastMini = now;
      const size = minimap.clientWidth || MINI, k = dpr();
      if (mc.width !== Math.round(size * k)) { mc.width = Math.round(size * k); mc.height = Math.round(size * k); }
      const g = mc.getContext('2d');
      const z = size / MINI; // CSS pixels per tile: 1, or less on small screens
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#120a0c';
      g.fillRect(0, 0, mc.width, mc.height);
      const ox = Math.floor(st.px / T) - MINI / 2, oy = Math.floor(st.py / T) - MINI / 2;
      for (let ky = Math.floor(oy / CH); ky <= Math.floor((oy + MINI - 1) / CH); ky++) {
        for (let kx = Math.floor(ox / CH); kx <= Math.floor((ox + MINI - 1) / CH); kx++) {
          const c = painter.mini(kx, ky);
          if (c) blit(g, c, kx * CH - ox, ky * CH - oy, k * z);
        }
      }
      g.setTransform(k, 0, 0, k, 0, 0);
      markers(g, st, (x, y) => [(x / T - ox) * z, (y / T - oy) * z]);
    }

    // Draws a chunk's mini image snapped to whole device pixels (s = device pixels per tile), so neighbouring
    // chunks meet exactly, with no seam.
    function blit(g, c, tx, ty, s) {
      const x0 = Math.round(tx * s), y0 = Math.round(ty * s), x1 = Math.round((tx + CH) * s), y1 = Math.round((ty + CH) * s);
      g.drawImage(c, x0, y0, x1 - x0, y1 - y0);
    }

    // ---------- full map ----------
    const el = node('div', 'sf-map');
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    const fc = node('canvas');
    const head = node('div', 'sf-map-head');
    const title = node('b');
    const legend = node('div', 'sf-map-legend');
    const button = (label, onClick) => { const b = node('button', null, label); b.type = 'button'; b.addEventListener('click', onClick); return b; };
    const zoomOut = button('−', () => zoom(-1)), zoomIn = button('+', () => zoom(1)), shut = button('×', () => closeMap());
    head.append(title, legend, zoomOut, zoomIn, shut);
    const hint = node('p', 'sf-map-hint');
    el.append(fc, head, hint);

    function relabel() {
      title.textContent = t('sf.mapTitle');
      hint.textContent = t('sf.mapHint');
      el.setAttribute('aria-label', t('sf.mapTitle'));
      minimap.setAttribute('aria-label', t('sf.minimap'));
      zoomIn.setAttribute('aria-label', t('sf.zoomIn'));
      zoomOut.setAttribute('aria-label', t('sf.zoomOut'));
      shut.setAttribute('aria-label', t('common.close'));
      legend.textContent = '';
      W.REGIONS.forEach((id, i) => {
        const item = node('span');
        const swatch = node('i');
        swatch.style.background = P.REGION_COLORS[i];
        item.append(swatch, document.createTextNode(t('region.' + id)));
        legend.appendChild(item);
      });
    }

    function openMap(st) {
      if (!world) return;
      const s = st || last;
      if (s) { cx = s.px / T; cy = s.py / T; }
      open = true;
      el.hidden = false;
      if (opts.onOpen) opts.onOpen();
      shut.focus({ preventScroll: true });
    }
    function closeMap() {
      if (!open) return;
      open = false;
      el.hidden = true;
      drag = null;
      if (opts.onClose) opts.onClose();
    }
    function zoom(d) { zi = Math.max(0, Math.min(ZOOMS.length - 1, zi + d)); }
    // Keys while the map is open; returns true when the key was used.
    function key(e) {
      if (e.code === 'Escape' || e.code === 'KeyM') { closeMap(); return true; }
      if (e.key === '+' || e.key === '=') { zoom(1); return true; }
      if (e.key === '-' || e.key === '_') { zoom(-1); return true; }
      const d = PAN[e.code];
      if (!d) return false;
      const step = 48 / ZOOMS[zi];
      cx += d[0] * step;
      cy += d[1] * step;
      return true;
    }
    fc.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; fc.setPointerCapture(e.pointerId); });
    fc.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const z = ZOOMS[zi];
      cx -= (e.clientX - drag.x) / z;
      cy -= (e.clientY - drag.y) / z;
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    const endDrag = () => { drag = null; };
    fc.addEventListener('pointerup', endDrag);
    fc.addEventListener('pointercancel', endDrag);
    fc.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });

    function frame(st, deadline) {
      last = st;
      if (!open || !world) return;
      painter.workMinis(deadline);
      const k = dpr(), w = el.clientWidth, h = el.clientHeight;
      if (fc.width !== Math.round(w * k) || fc.height !== Math.round(h * k)) { fc.width = Math.round(w * k); fc.height = Math.round(h * k); }
      const g = fc.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#120a0c';
      g.fillRect(0, 0, fc.width, fc.height);
      const z = ZOOMS[zi], ox = cx - w / 2 / z, oy = cy - h / 2 / z;
      for (const fk of world.fogKeys()) {
        const comma = fk.indexOf(',');
        const kx = Number(fk.slice(0, comma)), ky = Number(fk.slice(comma + 1));
        const sx = (kx * CH - ox) * z, sy = (ky * CH - oy) * z;
        if (sx > w || sy > h || sx + CH * z < 0 || sy + CH * z < 0) continue;
        const c = painter.mini(kx, ky);
        if (c) blit(g, c, kx * CH - ox, ky * CH - oy, k * z);
      }
      g.setTransform(k, 0, 0, k, 0, 0);
      markers(g, st, (x, y) => [(x / T - ox) * z, (y / T - oy) * z]);
    }

    return {
      minimap, el, drawMini, frame, key, relabel,
      attach(w, p) { world = w; painter = p; closeMap(); },
      open: openMap, close: closeMap, isOpen: () => open,
    };
  }

  function debugText(s) {
    return [
      'fps ' + s.fps,
      'data ' + s.world.data + '/' + s.world.cap + '  queue ' + s.world.queue + '  built ' + s.world.built,
      'images ' + s.paint.images + '/' + s.paint.cap + '  queue ' + s.paint.queue + '  paint ' + s.paint.paintMedian.toFixed(2) + ' ms',
      'minis ' + s.paint.minis + ' (+' + s.paint.miniQueue + ')  fog chunks ' + s.world.fog,
      'tile ' + s.tile.join(',') + '  chunk ' + s.chunk.join(',') + '  ' + s.region,
    ].join('\n');
  }

  root.SolMap = { create, debugText };
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 5: Rewire `src/surface.js` (edits E1–E16)**

Make these edits in order. Each one names the code it replaces. Code not mentioned stays exactly as it is.

**E1. Header and constants.** Replace everything from the first line of the file through `const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));` with:

```js
/*
 * SOL 500 — the walkable surface: your astronaut walks around the outpost and out into the endless world, builds on
 * tiles, inspects and switches machines, drives the rover, and meets the rest of the crew, who walk to their jobs.
 * Canvas 2D + a small DOM overlay. It never changes the mission itself: every action goes through ui.js hooks,
 * so the surface and the mission console always show the same plan.
 * The world model is src/surface-world.js, the painting src/surface-paint.js, the minimap and map src/surface-map.js.
 *
 * API: SolSurface.mount(hooks) → element (persistent; re-attach it on every render)
 *      SolSurface.update({ mission, plan, forecast, controlId, canControl(id), crewName(id), t, lang, fog })
 *      SolSurface.setRemote([{ crewId, x, y, dir, moving, rover }])
 *      SolSurface.mergeFog({ "<cx>,<cy>": base64 }) · SolSurface.reset() (call when a new mission starts)
 * Hooks: queueBuild, cancelBuild, toggleModule, toggleScrap, setJob, openConsole, canAdvance, advance,
 *        sendPos(pos), reveal({ key: base64 }), enterRegion(regionId)
 */
(function (root) {
  'use strict';
  const D = root.SolData, E = root.SolEngine, A = root.SolArt, W = root.SolWorldgen, SW = root.SolWorld, P = root.SolPaint, SM = root.SolMap;
  const { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander } = P.sprites;
  const T = 64;
  const BASE = W.BASE_RECT;
  const LANDER = [-6, -4];
  const SPEED = 150, SPRINT_X = 1.75, ROVER_X = 2.6, NPC_SPEED = 115;
  const VIEW_FOOT = 8, VIEW_ROVER = 10; // tiles you can see around you (dust storms will shrink this in M4)
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const DEBUG = /[?&]debug=chunks\b/.test((root.location && root.location.search) || '');
  const tkey = (x, y) => x + ',' + y;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
```

**E2. Grid conversions.** Replace the two lines `const gridToWorld = (gx, gy) => [gx + PAD, gy + PAD];` and `const worldToGrid = (wx, wy) => [wx - PAD, wy - PAD];` with:

```js
  // The 9×5 build grid sits with its top-left at world tile (−4, −2), so the HQ is at (0, 0).
  const gridToWorld = (gx, gy) => [gx + BASE.x, gy + BASE.y];
  const worldToGrid = (wx, wy) => [wx - BASE.x, wy - BASE.y];
```

**E3. World model.** Replace everything from `// ---------- world model ----------` through the closing brace of `function findPath(fromX, fromY, goalWx, goalWy, allowGoalBlocked)` with the code below. `spotNear` and `spawnPoint` follow it unchanged.

```js
  // ---------- world model ----------
  // A mission (by its code) gets its own world, painter and fog; reset() forces a fresh one for a new mission.
  function world() {
    const m = S.data && S.data.mission;
    if (!m) return null;
    if (S.world && S.worldSeed === m.seed) return S.world;
    S.world = SW.create(m.seed);
    S.painter = P.createPainter(S.world);
    S.map.attach(S.world, S.painter);
    S.worldSeed = m.seed;
    S.world.reveal(0, 0, W.FLAT_RADIUS); // the crew knows their own base
    S.player = null;
    S.npcs = {};
    S.region = null;
    S.seenAt = [NaN, NaN, 0];
    S.camSnap = true;
    refreshWorld(m);
    return S.world;
  }

  function reset() {
    if (!S) return;
    S.world = null;
    S.worldSeed = null;
  }

  // The base's own blockers (the HQ, the reactor, the lander, rocks on the build grid) and the grid lookups.
  function refreshWorld(m) {
    const blocked = [LANDER];
    for (const [gx, gy] of m.terrain.rock) blocked.push(gridToWorld(gx, gy));
    // Crews walk between the machines; only the HQ and the reactor (radiation) are solid.
    for (const tile of m.layout) if (tile.type === 'hab' || tile.type === 'reactor') blocked.push(gridToWorld(tile.x, tile.y));
    S.world.setOverlay(blocked);
    S.base = {
      ice: new Set(m.terrain.ice.map(([x, y]) => tkey(x, y))),
      gridRock: new Set(m.terrain.rock.map(([x, y]) => tkey(x, y))),
    };
  }

  const isBlocked = (wx, wy) => S.world.isBlocked(wx, wy);

  function hitsWall(x, y) {
    const pts = [[x - 10, y - 6], [x + 10, y - 6], [x - 10, y + 4], [x + 10, y + 4]];
    return pts.some(([px, py]) => isBlocked(Math.floor(px / T), Math.floor(py / T)));
  }

  // Breadth-first search over world tiles inside a 64×64-tile box around the walker; returns tile-centre waypoints.
  function findPath(fromX, fromY, goalWx, goalWy, allowGoalBlocked) {
    const steps = S.world.findPath(Math.floor(fromX / T), Math.floor(fromY / T), goalWx, goalWy, allowGoalBlocked);
    return steps && steps.map(([x, y]) => center(x, y));
  }
```

Then add this function right after `function spawnPoint() { … }`:

```js
  // Your astronaut appears beside the HQ when a mission (or a fresh world) starts.
  function ensurePlayer() {
    if (S.player) return;
    const [x, y] = spawnPoint();
    S.player = { x, y, dir: 'down', phase: 0, moving: false, stamina: 100, path: null, inRover: false, crewId: S.data.controlId };
  }
```

**E4. `mount`.** Replace the whole `function mount(hooks) { … }` with:

```js
  function mount(hooks) {
    if (S) { S.hooks = hooks; return S.el; }
    const el = document.createElement('div');
    el.className = 'sf-root';
    const canvas = document.createElement('canvas');
    canvas.className = 'sf-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    const overlay = document.createElement('div');
    overlay.className = 'sf-overlay';
    el.append(canvas, overlay);
    S = {
      el, canvas, ctx: canvas.getContext('2d'), overlay, hooks,
      keys: new Set(), joy: { x: 0, y: 0, id: null }, sprintHeld: false,
      player: null, npcs: {}, remote: {}, images: {}, particles: [], tags: [],
      world: null, painter: null, map: null, base: null, worldSeed: null, data: null, focus: null, menuOpen: null,
      view: { w: 0, h: 0, zoom: 1, dpr: 1, camX: 0, camY: 0 }, time: 0, last: 0, fps: 60, camSnap: true,
      lastSent: 0, lastSentKey: '', hintUntil: 14, touch: false,
      region: null, seenAt: [NaN, NaN, 0], fogSent: 0, debug: DEBUG, debugAt: 0, lang: null, qa: { ghost: false, speed: 1 },
    };
    S.touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    S.map = SM.create({ t: (k, p) => t(k, p), onOpen: () => S.keys.clear(), onClose: () => S.canvas.focus({ preventScroll: true }) });
    buildOverlay();
    bindInput();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el);
    requestAnimationFrame(loop);
    // When the browser is idle, paint more of the ground than the frame budget allows.
    if (window.requestIdleCallback) {
      const idle = d => {
        if (S.painter && S.el.isConnected && !document.hidden) S.painter.work(performance.now() + Math.max(0, d.timeRemaining() - 1), 0);
        window.requestIdleCallback(idle, { timeout: 500 });
      };
      window.requestIdleCallback(idle, { timeout: 500 });
    }
    return el;
  }
```

**E5. Overlay elements.** In `buildOverlay`, replace the line `o.append(S.hint, S.stamina, S.prompt, S.menu, S.pad, S.btnAct, S.btnRun);` with:

```js
    S.regionChip = el('div', 'sf-region');
    S.regionChip.hidden = true;
    S.debugBox = el('pre', 'sf-debug');
    S.debugBox.hidden = !S.debug;
    o.append(S.hint, S.stamina, S.regionChip, S.map.minimap, S.prompt, S.menu, S.pad, S.btnAct, S.btnRun, S.debugBox, S.map.el);
```

**E6. Keys and taps.** Three changes in and after `bindInput`.

First, replace the first line inside the `keydown` handler, `if (!S.el.isConnected || typing(e) || document.querySelector('.modal-back')) return;`, with:

```js
      if (!S.el.isConnected || typing(e) || document.querySelector('.modal-back')) return;
      if (S.map.isOpen()) { if (S.map.key(e)) e.preventDefault(); return; }
      if (e.code === 'KeyM' && !e.repeat) { openMap(); e.preventDefault(); return; }
      if (e.code === 'F3') { S.debug = !S.debug; S.debugBox.hidden = !S.debug; e.preventDefault(); return; }
```

Second, in the canvas `pointerdown` handler, replace `if (!S.player || !S.world) return;` with `if (!S.player || !S.world || S.map.isOpen()) return;`.

Third, add this function right after `bindInput`:

```js
  function openMap() {
    if (!S.world || !S.player) return;
    S.map.open(mapState());
  }
```

**E7. `update`.** Replace the whole `function update(data) { … }` with:

```js
  function update(data) {
    S.data = data;
    if (!data.mission) return;
    world();
    refreshWorld(data.mission);
    if (data.fog) S.world.mergeFog(data.fog);
    ensurePlayer();
    S.player.crewId = data.controlId;
    S.canvas.setAttribute('aria-label', t('sf.aria'));
    S.hint.textContent = t(S.touch ? 'sf.hintTouch' : 'sf.hintKeys');
    S.btnAct.setAttribute('aria-label', t('sf.interact'));
    S.btnRun.setAttribute('aria-label', t('sf.sprint'));
    if (data.lang !== S.lang) {
      S.lang = data.lang;
      S.map.relabel();
      if (S.region != null) S.regionChip.textContent = t('region.' + W.REGIONS[S.region]);
    }
    if (S.menuOpen) renderMenu();
  }
```

**E8. `mergeFog`.** Add after the closing brace of `function setRemote(list)`:

```js
  // Fog a teammate revealed (co-op). ui.js keeps it too, so a rebuilt world gets it back through update().
  function mergeFog(map) { if (S && S.world) S.world.mergeFog(map); }
```

**E9. The frame loop.** Replace the whole `function loop(ts) { … }` with the code below. It adds `stream`, `explore`, `mapState` and `drawDebugText`.

```js
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!S.el.isConnected || document.hidden || !S.data || !S.data.mission) { S.last = ts; return; }
    const t0 = performance.now();
    const raw = ts - (S.last || ts);
    if (raw > 0) S.fps += (1000 / raw - S.fps) * 0.05;
    const dt = Math.min(0.05, raw / 1000);
    S.last = ts;
    S.time += dt;
    world();
    ensurePlayer();
    stepPlayer(dt);
    stepNpcs(dt);
    stepRemote(dt);
    stepFocus();
    stream(t0);
    explore(ts);
    draw();
    const st = mapState();
    S.map.drawMini(st, ts);
    S.map.frame(st, performance.now() + 6);
    if (S.debug && ts - S.debugAt > 250) { S.debugAt = ts; drawDebugText(); }
    maybeSend(ts);
  }

  // Chunk streaming: keep the data near you (at most one new chunk a frame, the ones ahead of you first)
  // and paint ground until about 4 ms of this frame are used (always at least one chunk, so nothing stalls).
  function stream(t0) {
    const p = S.player;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    const [dx, dy] = p.moving ? DIRS[p.dir] : [0, 0];
    S.world.retain(tx, ty, tx + dx * 2 * W.CHUNK, ty + dy * 2 * W.CHUNK);
    S.world.work();
    const v = S.view, viewW = v.w / v.zoom, viewH = v.h / v.zoom;
    S.painter.retainView(v.camX, v.camY, v.camX + viewW, v.camY + viewH);
    S.painter.work(t0 + 4, 1);
  }

  // What you can see becomes explored, and a new region shows its name. New fog goes out once a second.
  function explore(ts) {
    const p = S.player, me = controlledCrew();
    if (!me || me.status === 'dead') return;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), r = p.inRover ? VIEW_ROVER : VIEW_FOOT;
    if (tx !== S.seenAt[0] || ty !== S.seenAt[1] || r !== S.seenAt[2]) {
      S.seenAt = [tx, ty, r];
      S.world.reveal(tx, ty, r);
      const reg = S.world.region(tx, ty);
      if (reg !== S.region) {
        S.region = reg;
        S.regionChip.hidden = false;
        S.regionChip.textContent = t('region.' + W.REGIONS[reg]);
        if (S.hooks.enterRegion) S.hooks.enterRegion(W.REGIONS[reg]);
      }
    }
    if (ts - S.fogSent > 1000) {
      S.fogSent = ts;
      const diff = S.world.takeFog();
      if (S.hooks.reveal && Object.keys(diff).length) S.hooks.reveal(diff);
    }
  }

  function mapState() {
    if (!S.player) return { px: 0, py: 0, crew: [] };
    return { px: S.player.x, py: S.player.y, crew: avatars().map(a => ({ x: a.x, y: a.y, color: a.color, you: !!a.you })) };
  }

  function drawDebugText() {
    const tx = Math.floor(S.player.x / T), ty = Math.floor(S.player.y / T);
    S.debugBox.textContent = SM.debugText({
      fps: Math.round(S.fps), world: S.world.stats(), paint: S.painter.stats(),
      tile: [tx, ty], chunk: [SW.chunkOf(tx), SW.chunkOf(ty)], region: S.region == null ? '-' : W.REGIONS[S.region],
    });
  }
```

**E10. Movement.** In `stepPlayer`, replace these lines:

```js
      const sp = SPEED * (sprinting ? SPRINT_X : 1) * (p.inRover ? ROVER_X : 1) * Math.min(1, len);
      const stuck = hitsWall(p.x, p.y);
      const mx = p.x + nx * sp * dt, my = p.y + ny * sp * dt;
      if (stuck || !hitsWall(mx, p.y)) p.x = clamp(mx, 12, WW - 12);
      if (stuck || !hitsWall(p.x, my)) p.y = clamp(my, 20, WH - 6);
```

with:

```js
      const ground = p.inRover ? 1 : S.world.speed(Math.floor(p.x / T), Math.floor(p.y / T)); // dunes slow walking
      const sp = SPEED * (sprinting ? SPRINT_X : 1) * (p.inRover ? ROVER_X : 1) * ground * S.qa.speed * Math.min(1, len);
      const stuck = hitsWall(p.x, p.y);
      const mx = p.x + nx * sp * dt, my = p.y + ny * sp * dt;
      if (S.qa.ghost || stuck || !hitsWall(mx, p.y)) p.x = mx;
      if (S.qa.ghost || stuck || !hitsWall(p.x, my)) p.y = my;
```

**E11. Where the crew go for "EVA".** Replace the whole `function quarry(rnd) { … }` with:

```js
  // The crew who aren't you stay at the base: EVA work happens on the open ring 6–11 tiles from the HQ.
  function quarry(rnd) {
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(rnd() * 23) - 11, y = Math.floor(rnd() * 23) - 11, d2 = x * x + y * y;
      if (d2 < 36 || d2 > 121 || isBlocked(x, y)) continue;
      const [cx, cy] = center(x, y);
      return [cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 20];
    }
    return spawnPoint();
  }
```

**E12. Avatars carry their colour.** Replace the whole `function avatars() { … }` with:

```js
  function avatars() {
    const m = S.data.mission;
    const out = [];
    const byId = id => m.crew.find(c => c.id === id);
    const color = role => A.ROLE[role] || '#ccc';
    const me = controlledCrew();
    if (me && me.status !== 'dead') out.push({ id: me.id, role: me.role, color: color(me.role), x: S.player.x, y: S.player.y, dir: S.player.dir, phase: S.player.phase, moving: S.player.moving, you: true, down: me.status === 'down', rover: S.player.inRover });
    for (const [id, n] of Object.entries(S.npcs)) {
      const c = byId(id);
      if (!c || c.status === 'dead') continue;
      out.push({ id, role: c.role, color: color(c.role), x: n.x, y: n.y, dir: n.dir, phase: n.phase, moving: n.moving, down: c.status === 'down', working: n.working, job: n.job });
    }
    for (const [id, r] of Object.entries(S.remote)) {
      const c = byId(id);
      if (!c || c.status === 'dead') continue;
      out.push({ id, role: c.role, color: color(c.role), x: r.x, y: r.y, dir: r.dir, phase: r.phase, moving: r.moving, remote: true, down: c.status === 'down', rover: r.rover });
    }
    return out;
  }
```

**E13. `focusAt`.** In `function focusAt(wx, wy)`, make three changes:
- Delete the line `const w = S.world;`.
- Replace `if (wx === w.lander.wx && wy === w.lander.wy) return { kind: 'lander', key: 'lander', wx, wy };` with `if (wx === LANDER[0] && wy === LANDER[1]) return { kind: 'lander', key: 'lander', wx, wy };`.
- Replace `w.gridRock.has(` with `S.base.gridRock.has(` and `w.ice.has(` with `S.base.ice.has(`.

**E14. Drawing helpers move out.** Delete everything from the line `// ---------- drawing ----------` through the closing brace of `function badge(ctx, x, y, kind)`, which is the line just before `function draw() {`. That removes `buildGround`, `drawRock`, `drawLander`, `drawAvatar`, `tag`, `drawTags`, `drawTag`, `roundRect` and `badge`, all of which now come from `P.sprites` (see E1). Put this in their place:

```js
  // ---------- drawing ----------
  // ?debug=chunks or F3: data chunk borders (yellow, 32 tiles) and image chunk borders (blue, 4 tiles).
  function drawChunkBorders(ctx, x0, y0, x1, y1) {
    const lines = (size, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width / S.view.zoom;
      ctx.beginPath();
      for (let x = Math.floor(x0 / size) * size; x <= x1; x += size) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.floor(y0 / size) * size; y <= y1; y += size) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    };
    ctx.save();
    lines(P.PX, 'rgba(140,188,236,0.3)', 1);
    lines(W.CHUNK * T, 'rgba(255,220,80,0.8)', 2);
    ctx.restore();
  }
```

**E15. `draw`.** Replace the whole `function draw() { … }` with:

```js
  function draw() {
    const ctx = S.ctx, v = S.view, m = S.data.mission, plan = S.data.plan, fc = S.data.forecast;
    if (!v.w) resize();
    const p = S.player;
    const viewW = v.w / v.zoom, viewH = v.h / v.zoom;
    // The camera follows you anywhere: the world has no edges.
    const targetX = p.x - viewW / 2, targetY = p.y - 20 - viewH / 2;
    if (S.camSnap) { v.camX = targetX; v.camY = targetY; S.camSnap = false; }
    v.camX += (targetX - v.camX) * 0.15;
    v.camY += (targetY - v.camY) * 0.15;
    const x0 = v.camX, y0 = v.camY, x1 = x0 + viewW, y1 = y0 + viewH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3a1d14';
    ctx.fillRect(0, 0, S.canvas.width, S.canvas.height);
    const k = v.dpr * v.zoom;
    ctx.setTransform(k, 0, 0, k, -v.camX * k, -v.camY * k);
    S.painter.drawGround(ctx, x0, y0, x1, y1);

    // HQ shield layers and water wall
    const [hwx, hwy] = gridToWorld(D.GRID.hq[0], D.GRID.hq[1]);
    const [hcx, hcy] = center(hwx, hwy);
    for (let i = m.modules.shield.count; i >= 1; i--) {
      ctx.fillStyle = i % 2 ? '#8e4a2c' : '#9b5433';
      ctx.strokeStyle = 'rgba(60,20,10,0.5)';
      ctx.beginPath(); ctx.ellipse(hcx, hcy + 18, 30 + i * 5, 12 + i * 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (m.wallWater > 0) {
      ctx.strokeStyle = 'rgba(95,180,255,0.55)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(hcx, hcy - 2, 31, 27, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // queued builds and focus highlight
    for (const b of plan.builds || []) {
      if (b.x == null) continue;
      const [wx, wy] = gridToWorld(b.x, b.y);
      ctx.fillStyle = 'rgba(140,188,236,0.14)';
      ctx.strokeStyle = '#8cbcec';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      roundRect(ctx, wx * T + 4, wy * T + 4, T - 8, T - 8, 6); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }
    const f = S.focus;
    if (f && f.wx != null && !S.player.inRover) {
      const glow = 0.5 + 0.5 * Math.sin(S.time * 5);
      ctx.strokeStyle = `rgba(183,214,245,${0.55 + glow * 0.4})`;
      ctx.lineWidth = 2.5;
      roundRect(ctx, f.wx * T + 3, f.wy * T + 3, T - 6, T - 6, 8); ctx.stroke();
    }

    // sprites sorted by depth
    const sprites = [];
    const brokenLeft = {};
    for (const ty of D.MODULE_TYPES) brokenLeft[ty] = m.modules[ty].broken;
    const runningLeft = Object.assign({}, fc.power.running);
    for (const tile of m.layout) {
      if (tile.type === 'rover' && (p.inRover || Object.values(S.remote).some(r => r.rover))) continue;
      const [wx, wy] = gridToWorld(tile.x, tile.y);
      let status = null;
      if (brokenLeft[tile.type] > 0) { brokenLeft[tile.type]--; status = 'broken'; }
      else if (D.CONSUMERS.includes(tile.type)) { if (runningLeft[tile.type] > 0) runningLeft[tile.type]--; else status = 'off'; }
      sprites.push({ y: wy * T + T - 6, draw: () => {
        const img = moduleImage(tile.type, m.cleanliness);
        const big = tile.type === 'hab' ? 1.3 : 1;
        if (ready(img)) {
          ctx.globalAlpha = status === 'off' ? 0.6 : 1;
          ctx.drawImage(img, wx * T + T / 2 - T * big / 2, wy * T + T - T * big, T * big, T * big);
          ctx.globalAlpha = 1;
        }
        if (status) badge(ctx, wx * T + T - 10, wy * T + 12, status);
      } });
    }
    for (const pr of m.projects) {
      if (pr.x == null) continue;
      const [wx, wy] = gridToWorld(pr.x, pr.y);
      sprites.push({ y: wy * T + T - 6, draw: () => {
        const sc = moduleImage('scaffold', 1), ghost = moduleImage(pr.type, 1);
        if (ready(ghost)) { ctx.globalAlpha = 0.4; ctx.drawImage(ghost, wx * T, wy * T, T, T); ctx.globalAlpha = 1; }
        if (ready(sc)) ctx.drawImage(sc, wx * T, wy * T, T, T);
        ctx.fillStyle = '#140e10'; roundRect(ctx, wx * T + 8, wy * T + T - 7, 48, 4, 2); ctx.fill();
        ctx.fillStyle = '#8cbcec'; roundRect(ctx, wx * T + 8, wy * T + T - 7, 48 * pr.progress / pr.work, 4, 2); ctx.fill();
      } });
    }
    for (const [gx, gy] of m.terrain.rock) {
      const [wx, wy] = gridToWorld(gx, gy);
      sprites.push({ y: wy * T + T / 2 + 10, draw: () => drawRock(ctx, { wx, wy, s: 1 }) });
    }
    sprites.push({ y: LANDER[1] * T + T / 2 + 22, draw: () => drawLander(ctx, LANDER[0], LANDER[1]) });
    const roverImg = moduleImage('rover', 1);
    for (const a of avatars()) {
      if (a.x < x0 - T * 2 || a.x > x1 + T * 2 || a.y < y0 - T || a.y > y1 + T * 3) continue; // off screen
      let name = S.data.crewName(a.id);
      if (a.you) name = t('sf.you') + ' · ' + name;
      sprites.push({ y: a.y, draw: () => drawAvatar(ctx, a, name, S.time, S.tags, ready(roverImg) ? roverImg : null) });
    }
    // lost crew are remembered with a small flag beside the HQ
    m.crew.filter(c => c.status === 'dead').forEach((c, i) => {
      const fx = hcx - 44 - i * 14, fy = hcy + 30;
      sprites.push({ y: fy, draw: () => {
        ctx.strokeStyle = '#cbbfae'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 22); ctx.stroke();
        ctx.fillStyle = A.ROLE[c.role]; ctx.fillRect(fx, fy - 22, 10, 7);
      } });
    });
    sprites.sort((a, b) => a.y - b.y);
    for (const s of sprites) s.draw();
    // the fog over what you can't see, then the name tags on top of it
    P.drawFog(ctx, S.world, x0, y0, x1, y1, p.x, p.y - 12, (p.inRover ? VIEW_ROVER : VIEW_FOOT) * T);
    drawTags(ctx, S.tags);
    if (S.debug) drawChunkBorders(ctx, x0, y0, x1, y1);

    // weather, in screen space
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const weather = m.schedule[m.turn] ? m.schedule[m.turn].weather : 'clear';
    const tint = weather === 'global' ? 'rgba(110,52,22,0.46)' : weather === 'regional' ? 'rgba(180,110,60,0.22)' : null;
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, v.w, v.h); }
    const want = weather === 'global' ? 220 : weather === 'regional' ? 110 : 26;
    while (S.particles.length < want) S.particles.push({ x: Math.random() * v.w, y: Math.random() * v.h, s: 0.6 + Math.random() * 1.8, a: 0.15 + Math.random() * 0.4 });
    if (S.particles.length > want) S.particles.length = want;
    const wind = weather === 'global' ? 160 : weather === 'regional' ? 90 : 18;
    ctx.fillStyle = '#e7b88a';
    for (const q of S.particles) {
      q.x += (wind + q.s * 20) * 0.016;
      q.y += Math.sin(S.time + q.s * 3) * 0.3;
      if (q.x > v.w + 4) { q.x = -4; q.y = Math.random() * v.h; }
      ctx.globalAlpha = q.a;
      ctx.fillRect(q.x, q.y, q.s * 1.6, q.s);
    }
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,5,8,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, v.w, v.h);
  }
```

**E16. `probe`, the QA helpers and the export.** Replace everything from `// Read-only snapshot for automated play-testing.` through `root.SolSurface = { mount, update, setRemote, isMounted: () => !!S, probe };` with:

```js
  // Read-only snapshot for automated play-testing.
  function probe() {
    if (!S || !S.player) return null;
    const toScreen = (x, y) => [(x - S.view.camX) * S.view.zoom, (y - S.view.camY) * S.view.zoom];
    const tileScreen = (gx, gy) => { const [wx, wy] = gridToWorld(gx, gy); return toScreen(wx * T + T / 2, wy * T + T / 2); };
    const tx = Math.floor(S.player.x / T), ty = Math.floor(S.player.y / T);
    return {
      player: { x: S.player.x, y: S.player.y, dir: S.player.dir, inRover: S.player.inRover, stamina: S.player.stamina, path: S.player.path && S.player.path.length },
      lastTap: S.lastTap, focus: S.focus && S.focus.kind, menu: S.menuOpen, npcs: Object.keys(S.npcs), tileScreen, toScreen,
      remote: JSON.parse(JSON.stringify(S.remote)),
      blocked: (wx, wy) => isBlocked(wx, wy), path: (gx, gy) => findPath(S.player.x, S.player.y, gx, gy, true),
      tile: [tx, ty], region: S.region == null ? null : W.REGIONS[S.region], fps: Math.round(S.fps), mapOpen: S.map.isOpen(),
      world: S.world && S.world.stats(), paint: S.painter && S.painter.stats(), seen: (x, y) => S.world.seen(x, y),
    };
  }

  // Browser QA helpers, only with ?debug=chunks: hold keys, board the rover anywhere, drive through rocks,
  // speed up, jump, and hash a painted image chunk to prove a deleted chunk comes back identical.
  const qa = {
    hold(code, on) { if (on) S.keys.add(code); else S.keys.delete(code); },
    board(on) { S.player.inRover = on !== false; },
    ghost(on) { S.qa.ghost = !!on; },
    speed(x) { S.qa.speed = Math.max(0.1, Number(x) || 1); },
    chunkHash(ix, iy) { return S.painter.chunkHash(ix, iy); },
    teleport(tx, ty) { S.player.x = tx * T + T / 2; S.player.y = ty * T + T / 2; S.player.path = null; S.camSnap = true; },
  };

  root.SolSurface = Object.assign({ mount, update, setRemote, mergeFog, reset, isMounted: () => !!S, probe }, DEBUG ? { qa } : {});
```

After E1–E16, check that nothing old is left:

Run: `grep -nwE "PAD|GW|GH|WW|WH" src/surface.js; grep -n "S\.ground\|buildGround\|w\.lander\|S\.world\.decor\|rockSet\|S\.world\.craters" src/surface.js`
Expected: no output.

Run: `node -e "new Function(require('fs').readFileSync('src/surface.js','utf8'))" && wc -l src/surface.js`
Expected: no syntax error, and about 1,020 lines.

- [ ] **Step 6: Styles**

Append to `src/style.css`, after the `.sf-stamina span` rule:

```css
.sf-hint { max-width: calc(100% - 380px); white-space: normal; text-align: center; border-radius: 12px; }
.sf-region { position: absolute; left: 14px; top: 28px; background: rgba(20, 14, 16, 0.82); border: 1px solid var(--line-2); padding: 3px 10px; border-radius: 999px; font-size: var(--fs-xs); color: var(--fg); font-weight: 600; }
.sf-mini { position: absolute; right: 12px; top: 12px; width: 160px; height: 160px; padding: 0; border: 1px solid var(--line-2); border-radius: 10px; overflow: hidden; background: #120a0c; pointer-events: auto; cursor: zoom-in; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4); }
.sf-mini canvas { width: 100%; height: 100%; display: block; }
.sf-mini:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sf-map { position: absolute; inset: 0; background: #120a0c; pointer-events: auto; z-index: 3; }
.sf-map canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; touch-action: none; }
.sf-map-head { position: absolute; left: 12px; right: 12px; top: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: rgba(20, 14, 16, 0.88); border: 1px solid var(--line-2); border-radius: 10px; padding: 6px 8px 6px 12px; }
.sf-map-head b { font-family: var(--font-display); margin-right: auto; }
.sf-map-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: var(--fs-xs); color: var(--fg-2); }
.sf-map-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; border: 1px solid rgba(255, 255, 255, 0.2); }
.sf-map-head button { min-width: 34px; min-height: 34px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--raised); color: var(--fg); font-weight: 700; cursor: pointer; }
.sf-map-head button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sf-map-hint { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); margin: 0; background: rgba(20, 14, 16, 0.88); border: 1px solid var(--line-2); border-radius: 999px; padding: 5px 14px; font-size: var(--fs-xs); color: var(--fg-2); white-space: nowrap; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; }
.sf-debug { position: absolute; left: 12px; bottom: 12px; margin: 0; background: rgba(0, 0, 0, 0.72); color: #b8f7a8; font: 11px/1.4 var(--font-data); padding: 6px 8px; border-radius: 6px; white-space: pre; }
@media (max-width: 640px), (pointer: coarse) {
  .sf-mini { width: 112px; height: 112px; }
  .sf-hint { max-width: calc(100% - 270px); }
}
```

- [ ] **Step 7: Strings (EN and VI)**

In `src/i18n.js`, in the `en` table, replace the values of `'sf.hintKeys'` and `'sf.hintTouch'` and add the new keys next to them:

```js
    'sf.hintKeys': "WASD or arrows to move · Shift to sprint · E to interact · M for the map · C for the console · click the ground to walk there",
    'sf.hintTouch': "Drag the stick to move · hold » to sprint · tap E to interact · tap the minimap for the map · tap the ground to walk there",
    'sf.minimap': 'Minimap. Select it to open the full map (M).',
    'sf.mapTitle': 'Explored map',
    'sf.mapHint': 'Drag or use the arrow keys to move · scroll or + − to zoom · M or Esc to close',
    'sf.zoomIn': 'Zoom in',
    'sf.zoomOut': 'Zoom out',
    'region.plains': 'Plains',
    'region.dunes': 'Dune Sea',
    'region.craters': 'Crater Field',
    'region.canyons': 'Canyon Lands',
    'region.icy': 'Icy Plains',
    'region.volcanic': 'Volcanic Flanks',
```

Add after `'help.8'` (en):

```js
    'help.9': 'Explore: the world goes on in every direction. Walk or drive out of the base, and what you see stays on your map. Press M or tap the minimap to open the map. Each region of Mars looks different and comes with a real fact.',
```

In the `vi` table, the same keys:

```js
    'sf.hintKeys': "WASD hoặc phím mũi tên để đi · Shift để chạy · E để tương tác · M mở bản đồ · C mở bảng điều khiển · bấm xuống đất để đi tới đó",
    'sf.hintTouch': "Kéo cần điều khiển để đi · giữ » để chạy · chạm E để tương tác · chạm bản đồ nhỏ để mở bản đồ · chạm xuống đất để đi tới đó",
    'sf.minimap': 'Bản đồ nhỏ. Chọn để mở bản đồ lớn (M).',
    'sf.mapTitle': 'Bản đồ đã khám phá',
    'sf.mapHint': 'Kéo hoặc dùng phím mũi tên để di chuyển · cuộn chuột hoặc + − để phóng to, thu nhỏ · M hoặc Esc để đóng',
    'sf.zoomIn': 'Phóng to',
    'sf.zoomOut': 'Thu nhỏ',
    'region.plains': 'Đồng bằng',
    'region.dunes': 'Biển cồn cát',
    'region.craters': 'Cánh đồng hố va chạm',
    'region.canyons': 'Vùng hẻm núi',
    'region.icy': 'Đồng bằng băng',
    'region.volcanic': 'Sườn núi lửa',
```

and after `'help.8'` (vi):

```js
    'help.9': 'Khám phá: thế giới trải dài về mọi hướng. Hãy đi bộ hoặc lái xe ra khỏi căn cứ, những gì bạn nhìn thấy sẽ ở lại trên bản đồ. Nhấn M hoặc chạm bản đồ nhỏ để mở bản đồ. Mỗi vùng của sao Hỏa trông khác nhau và đi kèm một sự thật khoa học.',
```

In `src/ui.js` `renderModal`, change the help list `[1, 2, 3, 4, 5, 6, 7, 8].map(` to `[1, 2, 3, 4, 5, 6, 7, 8, 9].map(`.

Run: `npm test`
Expected: all pass, including the i18n parity test and the new sw test.

- [ ] **Step 8: Check it in the browser**

Start a fresh server:
1. Make sure nothing old is running on 5071: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5071/` should fail to connect.
2. Start it: `PORT=5071 node server.js` (run it in the background).

Open `http://localhost:5071/?debug=chunks` in Chrome. Use the chrome-devtools MCP tools (`new_page`, `evaluate_script`, `take_screenshot`, `press_key`, `list_console_messages`) if you have them; otherwise paste the snippets into the DevTools console. Then start a training mission:

```js
document.querySelector('[data-k="train"]').click();
setTimeout(() => document.querySelector('[data-k="launch"]').click(), 300);
```

Check each of these, and record the numbers in your report:

1. **At the base:**
   - `SolSurface.probe()` gives `region: 'plains'` and `world.data` ≥ 25.
   - After 2 s, `paint.queue` is 0 and `paint.paintMedian` is under 2 ms.
   - The ground is painted with no holes or seams.
   - The base grid, HQ and modules look as before.
   - The minimap is top-right, and the debug box is at the bottom left.
   - Take a screenshot.
2. **Walking:**
   - Run `SolSurface.qa.hold('KeyD', true)`, wait 6 s, then run `SolSurface.qa.hold('KeyD', false)`.
   - `probe().tile[0]` has grown by more than 8 (less on dunes).
   - `probe().seen(probe().tile[0], probe().tile[1])` is true, and `probe().seen(probe().tile[0] + 30, probe().tile[1])` is false.
   - Unseen ground is dark, and ground you saw earlier is dimmed.
3. **The full map:**
   - Press M. `probe().mapOpen` is true, and the explored strip and region legend show.
   - Drag, scroll and press + / −, then take a screenshot.
   - Esc closes it, and the canvas has focus again.
4. **The debug overlay:** F3 hides and shows the debug box.
5. **Driving far:**
   - Run `SolSurface.qa.board(); SolSurface.qa.ghost(true); SolSurface.qa.speed(6); SolSurface.qa.hold('KeyD', true)`.
   - Sample `probe().world.data` and `probe().paint.images` every second for 20 s. They never exceed 64 and `probe().paint.cap`.
   - The region chip changes as you cross regions.
   - Take a screenshot of a non-Plains region.
   - Release `KeyD`.
6. **No console errors.**

Stop the server afterwards.

- [ ] **Step 9: Commit**

```bash
git add src/surface-map.js src/surface.js index.html sw.js src/style.css src/i18n.js src/ui.js test/sw.test.js
git commit -m "feat(surface): endless world on the surface: chunk streaming, painted ground, fog, minimap, full map, debug overlay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Engine — the pilot, the exploring state, old saves and the takeover

**Files:**
- Modify: `src/engine.js`, `lib/history.js`
- Test: `test/engine.test.js` (append), `test/history.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces (on `SolEngine` / `require('./engine.js')`):
  - `newExpedition() → { v: 2, revealed: {}, sites: {}, structures: {}, landmarks: {}, regions: [], beacons: [], kits: 0, refills: {}, carried: {}, drops: [], banked: { water: 0, materials: 0, spares: 0, food: 0, o2: 0, science: 0, morale: 0, lines: [] }, goals: [], incidents: [], stats: {} }`. This is spec §4's shape; M3 uses `revealed` and `regions`.
  - `createMission({ …, pilot })`. A new mission has `pilot`, a crew id or `null` (`null` unless one is given, so co-op missions have none), and `expedition: newExpedition()`. An unknown `pilot` throws `Invalid pilot: <id>`.
  - `upgradeMission(mission, { controlId }) → mission`, mutated in place. It fills a missing `expedition` or missing expedition keys, and a missing `pilot`: the saved `controlId` if that crew member is alive, otherwise the first active, otherwise the first living crew member. In co-op it is `null`.
  - `resolveTurn` → `report.pilot` is `null`, or `{ from, to }` when the pilot died this round. `to` is the first active crewmate, otherwise the first living one, otherwise `null`, and `state.pilot` moves to it.
  - `lib/history.js` `validMission` refuses a mission whose `pilot` is set but isn't one of its crew.

- [ ] **Step 1: Write the failing tests**

Append to `test/engine.test.js`:

```js
test("a new mission has an empty exploring state and, in solo play, the player's astronaut", () => {
  const s = E.createMission({ seed: 'PILOT-0', loadout: kit(), events: false, pilot: 'minh' });
  assert.equal(s.pilot, 'minh');
  assert.equal(s.expedition.v, 2);
  assert.deepEqual(s.expedition.revealed, {});
  assert.deepEqual(s.expedition.regions, []);
  assert.deepEqual(Object.keys(s.expedition).sort(),
    ['banked', 'beacons', 'carried', 'drops', 'goals', 'incidents', 'kits', 'landmarks', 'refills', 'regions', 'revealed', 'sites', 'stats', 'structures', 'v']);
  assert.equal(calm().pilot, null, 'no pilot unless one is chosen (co-op seats choose their own)');
  assert.throws(() => E.createMission({ seed: 'PILOT-0', loadout: kit(), events: false, pilot: 'kai' }), /pilot/, 'kai is not in a crew of 4');
  assert.throws(() => E.createMission({ seed: 'PILOT-0', loadout: kit(), events: false, pilot: 'nobody' }), /pilot/);
});

test('when your astronaut dies you take over the first active crewmate, and the report says so once', () => {
  const s = E.createMission({ seed: 'PILOT-1', loadout: kit(), events: false, pilot: 'lena' });
  s.crew[0].status = 'down';
  s.crew[0].downTurns = D.REVIVE.window - 1;
  const { state, report } = E.resolveTurn(s, allJobs(s, 'science'));
  assert.equal(state.crew[0].status, 'dead');
  assert.deepEqual(report.pilot, { from: 'lena', to: 'minh' });
  assert.equal(state.pilot, 'minh');
  const next = E.resolveTurn(state, allJobs(state, 'science'));
  assert.equal(next.report.pilot, null, 'reported only once');
  assert.equal(next.state.pilot, 'minh');
});

test('with nobody active, your astronaut passes to a crewmate who is down', () => {
  const s = E.createMission({ seed: 'PILOT-2', loadout: kit(), events: false, pilot: 'lena' });
  s.crew[0].status = 'down';
  s.crew[0].downTurns = D.REVIVE.window - 1;
  for (const c of s.crew.slice(1)) { c.status = 'down'; c.downTurns = 0; }
  const { state, report } = E.resolveTurn(s, allJobs(s, 'science'));
  assert.deepEqual(report.pilot, { from: 'lena', to: 'minh' });
  assert.equal(state.pilot, 'minh');
});

test('saves from before v3 get the exploring state and a pilot when they load', () => {
  const old = E.createMission({ seed: 'OLD-1', loadout: kit(), events: false });
  delete old.expedition;
  delete old.pilot;
  const copy = () => JSON.parse(JSON.stringify(old));
  const up = E.upgradeMission(copy(), { controlId: 'diego' });
  assert.equal(up.pilot, 'diego', 'the astronaut they were walking as');
  assert.deepEqual(up.expedition, E.newExpedition());
  const dead = copy();
  dead.crew[2].status = 'dead';
  assert.equal(E.upgradeMission(dead, { controlId: 'diego' }).pilot, 'lena', 'a dead astronaut is not picked');
  assert.equal(E.upgradeMission(copy(), {}).pilot, 'lena', 'no saved choice: the first active crew member');
  const coop = copy();
  coop.coop = true;
  assert.equal(E.upgradeMission(coop, { controlId: 'diego' }).pilot, null, 'co-op seats choose their own');
  const partial = copy();
  partial.expedition = { v: 2, regions: ['dunes'] };
  partial.pilot = 'amara';
  const kept = E.upgradeMission(partial, { controlId: 'diego' });
  assert.deepEqual(kept.expedition.regions, ['dunes'], 'what is there is kept');
  assert.deepEqual(kept.expedition.revealed, {}, 'what is missing is filled in');
  assert.equal(kept.pilot, 'amara');
  assert.equal(E.upgradeMission(null), null);
  assert.equal(E.resolveTurn(up, E.defaultPlan(up)).state.status, 'active', 'an upgraded save plays on');
});
```

Append to `test/history.test.js`:

```js
test('a solo mission is refused when its pilot is not one of its crew', () => {
  const m = finishedMission('PILOT-H');
  assert.equal(validMission(Object.assign({}, m, { pilot: 'lena' })), true);
  assert.equal(validMission(Object.assign({}, m, { pilot: null })), true);
  for (const pilot of ['kai', 'nobody', 42, {}, '__proto__']) assert.equal(validMission(Object.assign({}, m, { pilot })), false, String(pilot));
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/engine.test.js test/history.test.js`
Expected: FAIL. The new engine tests fail on `s.pilot` being `undefined`, then `E.upgradeMission is not a function`. The history test fails on `kai`.

- [ ] **Step 3: Implement in `src/engine.js`**

Add this right after the line `// ---------- mission ----------`:

```js
  // The exploring state (spec §4). M3 uses `revealed` (the shared fog) and `regions`; M4 fills in the rest.
  function newExpedition() {
    return {
      v: 2, revealed: {}, sites: {}, structures: {}, landmarks: {}, regions: [], beacons: [], kits: 0, refills: {},
      carried: {}, drops: [], banked: { water: 0, materials: 0, spares: 0, food: 0, o2: 0, science: 0, morale: 0, lines: [] },
      goals: [], incidents: [], stats: {},
    };
  }
```

In `buildState`, in the state object literal, replace the two lines

```js
      history: [],
      log: [],
    };
```

with:

```js
      history: [],
      log: [],
      pilot: null,              // solo: the crew member you walk as (co-op seats choose their own)
      expedition: newExpedition(),
    };
```

In `createMission`, after the line `if (o.names) for (const c of s.crew) if (o.names[c.id]) c.name = String(o.names[c.id]).slice(0, 24);`, add:

```js
    if (o.pilot != null) {
      if (!s.crew.some(c => c.id === o.pilot)) throw new Error('Invalid pilot: ' + o.pilot);
      s.pilot = o.pilot;
    }
```

Add this function right after `createMission`:

```js
  // Missions saved before v3 get the exploring state and a pilot when they load: the astronaut that player was
  // walking as if they are still alive, otherwise the first active (then the first living) crew member.
  function upgradeMission(m, opts) {
    if (!m || typeof m !== 'object') return m;
    const fresh = newExpedition();
    if (!m.expedition || typeof m.expedition !== 'object') m.expedition = fresh;
    else for (const k of Object.keys(fresh)) if (m.expedition[k] == null) m.expedition[k] = fresh[k];
    if (m.pilot === undefined) {
      const controlId = opts && opts.controlId;
      const alive = c => c.status !== 'dead';
      const pick = !m.coop && (m.crew.find(c => c.id === controlId && alive(c)) || m.crew.find(isActive) || m.crew.find(alive));
      m.pilot = pick ? pick.id : null;
    }
    return m;
  }
```

In `resolveTurn`, add this right before the line `s.log.push({`:

```js
    // Solo: if your astronaut died, you take over the first active crewmate (else the first living one).
    report.pilot = null;
    const pilot = s.pilot && s.crew.find(c => c.id === s.pilot);
    if (pilot && pilot.status === 'dead') {
      const next = s.crew.find(isActive) || s.crew.find(c => c.status !== 'dead') || null;
      report.pilot = { from: pilot.id, to: next ? next.id : null };
      s.pilot = next ? next.id : null;
    }
```

Add `newExpedition, upgradeMission` to the object returned at the end of the file:

```js
  return {
    createMission, resolveTurn, forecast, defaultPlan, scoreMission, achievements, advise,
    summarizeLoadout, validateLoadout, loadoutMass, normalizeLoadout,
    shielding, seasonAt, newMissionCode, rng, activeCount, independenceOf,
    buildSpots, touchesBase, canBuild, canRequest, difficultyOf, crewSizeOf, budgetFor, referenceKit, nextPlan,
    newExpedition, upgradeMission,
  };
```

Update the state comment at the top of `src/engine.js`. After the line `science, totals, depot: { drops, incoming: [{ kind, eta }] }, schedule, events, pending, history, log }`, add:

```js
 *   v3: pilot (solo: the crew member you walk as; null in co-op), expedition (exploring state, see newExpedition)
```

- [ ] **Step 4: Implement in `lib/history.js`**

In `validMission`, after the line `if (!m.crew.every(crewOk)) return false;`, add:

```js
  if (m.pilot != null && !(typeof m.pilot === 'string' && m.crew.some(c => c.id === m.pilot))) return false;
```

This changes a decision from M2. Before `pilot` existed, a solo post with a junk pilot was recorded with `crewId: null`. The M2 follow-up said to validate `pilot` once it arrives, so such a post is now refused. Replace the M2 test in `test/admin.test.js` named `'a solo post with an oversized or object pilot records no crewId'` (the whole `test(…)` call) with:

```js
test('a solo post whose pilot is not one of its crew is refused, and nothing is recorded', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const m = finishedMission();
  for (const pilot of ['p'.repeat(5000), { a: 1 }, 'kai']) {
    const r = await call(port, 'local', 'POST', '/api/history/solo', { body: { mission: Object.assign({}, m, { pilot }) } });
    assert.equal(r.status, 400);
  }
  const ok = await call(port, 'local', 'POST', '/api/history/solo', { body: { mission: Object.assign({}, m, { pilot: 'diego' }) } });
  assert.equal(ok.status, 200);
  const list = (await call(port, 'local', 'GET', '/api/admin/history', { headers: K(srv) })).json.records;
  assert.deepEqual(list.map(r => r.players[0].crewId), ['diego']);
});
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `node --test test/engine.test.js test/history.test.js test/admin.test.js`
Expected: PASS.

Run: `npm test`
Expected: all pass. The rooms tests still pass: co-op missions get `pilot: null`, and `summarize` already uses `m.pilot` for solo records.

- [ ] **Step 6: Commit**

```bash
git add src/engine.js lib/history.js test/engine.test.js test/history.test.js test/admin.test.js
git commit -m "feat(engine): mission.pilot with takeover on death, the exploring state, and upgrades for pre-v3 saves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: One astronaut per player — choose at the start, take over on death, seats in co-op

**Files:**
- Modify: `src/ui.js`, `src/i18n.js`, `src/style.css`, `lib/rooms.js`, `dist/` (rebuilt)
- Test: `test/rooms.test.js` (append), plus the browser checks in Step 7

**Interfaces:**
- Consumes:
  - Task 7: `E.createMission({ pilot })`, `E.upgradeMission(m, { controlId })`, `report.pilot`.
  - Task 6: `SolSurface.reset()`.
- Produces:
  - **Solo flow:** manifest → **Launch** → the new `'pilot'` screen → `startMission(crewId)` → ops.
  - `controlId()` returns `mission.pilot` in solo play. The "You play as" switcher and the `sol500.controlId` localStorage key are gone.
  - **Co-op:** `seatPanel(s)` offers the free active crew to a player whose astronaut died or who has none. The server refuses `claim` of a dead crew member with `deadCrew`.
  - **i18n:**
    - added: `pilot.step|title|lead|pick|back|takeover|none`, `seat.lost|none|pick|watch|take`, `lan.deadCrew`;
    - removed: `sf.playAs`.

- [ ] **Step 1: Write the failing server test**

Append to `test/rooms.test.js`:

```js
test('during a mission nobody can take over a crew member who has died, but a living one is fine', () => {
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  say(R, room, host, 'claim', { crewId: 'lena' });
  say(R, room, guest, 'claim', { crewId: 'minh' });
  assert.equal(say(R, room, host, 'launch').status, 200);
  room.mission.crew.find(c => c.id === 'minh').status = 'dead';
  const r = say(R, room, guest, 'claim', { crewId: 'minh' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'deadCrew');
  assert.equal(say(R, room, guest, 'claim', { crewId: 'diego' }).status, 200);
  assert.equal(guest.crewId, 'diego');
});
```

Run: `node --test test/rooms.test.js`
Expected: FAIL. The claim of the dead `minh` returns 200.

- [ ] **Step 2: Refuse dead crew in `lib/rooms.js`**

In `apply`, `case 'claim'`, after the line `if (!crewIds(room).includes(cid)) return 'badCrew';`, add:

```js
        if (room.mission) { const c = room.mission.crew.find(x => x.id === cid); if (!c || c.status === 'dead') return 'deadCrew'; }
```

Run: `node --test test/rooms.test.js`
Expected: PASS.

- [ ] **Step 3: Strings (EN and VI)**

In `src/i18n.js`, delete `'sf.playAs'` from both tables, and add to `en`:

```js
    'pilot.step': 'Before launch',
    'pilot.title': 'Choose your astronaut',
    'pilot.lead': 'You walk the surface as this crew member for the whole mission. The others follow the jobs you give them in the console or the job list. If your astronaut dies, you take over a crewmate.',
    'pilot.pick': 'Play as {name}',
    'pilot.back': 'Back to the payload',
    'pilot.takeover': 'You are now {name}, {role}.',
    'pilot.none': 'No crewmate is left to take over.',
    'seat.lost': 'Your astronaut was lost',
    'seat.none': 'You have no astronaut',
    'seat.pick': 'Take over a free crewmate to keep playing.',
    'seat.watch': 'No crewmate is free, so you are watching the mission.',
    'seat.take': 'Take over {name} ({role})',
    'lan.deadCrew': 'That crew member has died.',
```

and to `vi`:

```js
    'pilot.step': 'Trước khi phóng',
    'pilot.title': 'Chọn phi hành gia của bạn',
    'pilot.lead': 'Bạn đi lại trên bề mặt sao Hỏa trong vai thành viên này suốt nhiệm vụ. Những người còn lại làm theo công việc bạn giao trong bảng điều khiển hoặc danh sách công việc. Nếu phi hành gia của bạn hy sinh, bạn sẽ điều khiển một đồng đội.',
    'pilot.pick': 'Chơi trong vai {name}',
    'pilot.back': 'Quay lại danh sách tải trọng',
    'pilot.takeover': 'Bây giờ bạn là {name}, {role}.',
    'pilot.none': 'Không còn đồng đội nào để tiếp quản.',
    'seat.lost': 'Phi hành gia của bạn đã hy sinh',
    'seat.none': 'Bạn chưa có phi hành gia',
    'seat.pick': 'Hãy tiếp quản một đồng đội còn trống để tiếp tục chơi.',
    'seat.watch': 'Không còn đồng đội nào trống nên bạn đang theo dõi nhiệm vụ.',
    'seat.take': 'Tiếp quản {name} ({role})',
    'lan.deadCrew': 'Thành viên này đã hy sinh.',
```

- [ ] **Step 4: The solo flow in `src/ui.js`**

**4a.** In the `store` object, delete the line `controlId: LS.get('controlId', null),`.

**4b.** Replace the saved-game block

```js
  const saved = LS.get('save', null);
  if (saved && saved.mission && saved.mission.status === 'active' && saved.mission.version === 2) {
    store.mission = saved.mission;
    store.plan = saved.plan || E.defaultPlan(saved.mission);
  }
```

with:

```js
  const saved = LS.get('save', null);
  if (saved && saved.mission && saved.mission.status === 'active' && saved.mission.version === 2) {
    // A save from before v3 gets the exploring state; its pilot is the astronaut that player last walked as.
    store.mission = E.upgradeMission(saved.mission, { controlId: LS.get('controlId', null) });
    store.plan = saved.plan || E.defaultPlan(saved.mission);
    LS.set('save', { mission: store.mission, plan: store.plan }); // write the upgraded save back straight away
  }
  LS.del('controlId'); // replaced by mission.pilot
```

**4c.** Replace the whole `function launch() { … }` with:

```js
  function launch() {
    if (lanOn()) { N.act('launch'); return; }
    go('pilot');
  }

  // Solo: the mission starts once you choose the astronaut you will walk as.
  function startMission(pilot) {
    const s = E.createMission({
      seed: (store.seed || '').trim() || E.newMissionCode(), loadout: store.loadout, difficulty: store.settings.difficulty,
      crewSize: store.settings.crewSize, events: !store.settings.training, names: store.names, pilot,
    });
    store.mission = s;
    store.plan = E.defaultPlan(s);
    store.report = null;
    store.advice = null;
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.reset(); // "Fly again" reuses the code
    saveSolo();
    go('ops');
  }

  function pilotText(p) {
    if (!p.to) return t('pilot.none');
    const c = D.CREW.find(x => x.id === p.to);
    return t('pilot.takeover', { name: crewName(p.to), role: t('role.' + c.role) });
  }
```

**4d.** In `function advance()`, replace the last line `render();` with:

```js
    render();
    if (report.pilot && report.pilot.to) toast(pilotText(report.pilot));
```

**4e.** Replace the whole `function controlId() { … }`, together with the comment line above it, with:

```js
  // Which crew member the local player walks around as: your seat in co-op, mission.pilot in solo play.
  function controlId() {
    const s = mission();
    if (!s) return null;
    if (lanOn()) { const mine = me(); return mine ? mine.crewId : null; }
    return s.pilot || null;
  }
```

**4f.** Add the pilot screen right before `// ---------- operations ----------`:

```js
  // ---------- choose your astronaut ----------
  function viewPilot() {
    if (!store.loadout) return viewTitle();
    const crew = D.CREW.slice(0, store.settings.crewSize);
    return [
      topbar(),
      h('section', { class: 'pilot' },
        h('span', { class: 'eyebrow' }, t('pilot.step') + ' · ' + t('diff.' + store.settings.difficulty)),
        h('h1', { style: 'font-size:var(--fs-2xl)' }, t('pilot.title')),
        h('p', { class: 'muted', style: 'max-width:70ch' }, t('pilot.lead')),
        h('div', { class: 'pilot-grid' }, crew.map((c, i) => h('button', {
          type: 'button', class: 'pilot-card', 'data-k': 'pilot:' + c.id, onclick: () => startMission(c.id),
        },
          h('span', { html: A.portrait(c.role, 72, { variant: i }) }),
          h('b', null, crewName(c.id)),
          h('span', { class: 'role-tag', style: 'color:' + A.ROLE[c.role] }, t('role.' + c.role)),
          h('span', { class: 'hint' }, t('role.' + c.role + '.skill')),
          h('span', { class: 'btn btn-primary btn-sm' }, t('pilot.pick', { name: crewName(c.id) }))))),
        h('div', { class: 'setup-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', 'data-k': 'pilot-back', onclick: () => go('manifest') }, t('pilot.back')))),
    ];
  }
```

**4g.** In `render()`, replace the line `if (name === 'manifest') view = viewManifest();` with:

```js
    if (name === 'manifest') view = viewManifest();
    else if (name === 'pilot') view = viewPilot();
```

**4h.** In `function reportModal(r)`, add after the line `for (const id of r.deaths) li('crit', 'crit', t('rep.dead', { name: crewName(id) }));`:

```js
    if (r.pilot) li('users', r.pilot.to ? 'warn' : 'crit', pilotText(r.pilot));
```

- [ ] **Step 5: Seats in co-op, and the switcher removed**

Replace the whole `function surfaceSide(s, p, f) { … }` with the code below. The chooser and its panel are gone, and the seat panel comes first.

```js
  // Co-op: your astronaut died, or you have none: take over a free crewmate, or watch.
  function seatPanel(s) {
    if (!lanOn()) return null;
    const mine = me();
    const own = mine && mine.crewId ? s.crew.find(c => c.id === mine.crewId) : null;
    if (own && own.status !== 'dead') return null;
    const free = s.crew.filter(c => c.status === 'active' && !store.room.players.some(pl => pl.crewId === c.id && pl.connected));
    return panel(t(own ? 'seat.lost' : 'seat.none'), [
      h('p', { class: 'muted' }, t(free.length ? 'seat.pick' : 'seat.watch')),
      free.length ? h('div', { class: 'seat-list' }, free.map(c => h('button', {
        class: 'btn btn-sm btn-primary', type: 'button', 'data-k': 'seat:' + c.id, onclick: () => N.act('claim', { crewId: c.id }),
      }, t('seat.take', { name: crewName(c.id), role: t('role.' + c.role) })))) : null,
    ]);
  }

  function surfaceSide(s, p, f) {
    const ctl = controlId();
    const jobs = panel(t('sf.jobs'), h('div', { class: 'jobrows' }, s.crew.map((c, i) => {
      const allowed = canControl(c.id) && c.status === 'active';
      const job = p.jobs[c.id];
      const sel = h('select', {
        'data-k': 'jobsel:' + c.id, name: 'job-' + c.id, id: 'job-' + c.id, 'aria-label': crewName(c.id), disabled: !allowed,
        onchange: e => setJob(c.id, e.target.value),
      }, D.JOB_ORDER.map(j => h('option', { value: j, selected: j === job ? true : null, disabled: c.grounded && D.OUTDOOR_JOBS.includes(j) ? true : null },
        t('job.' + j) + (D.SPECIALTY[c.role].includes(j) ? ' ★' : ''))));
      const state = c.status === 'down' ? h('span', { class: 'chip crit' }, t('crew.down', { n: D.REVIVE.window - c.downTurns }))
        : c.status === 'dead' ? h('span', { class: 'chip' }, t('crew.dead'))
          : h('span', { class: 'faint num', style: 'font-size:var(--fs-xs)' }, Math.round(c.health) + ' HP · ' + Math.round(c.dose) + ' mSv');
      return h('div', { class: 'jobrow' + (c.id === ctl ? ' me' : '') },
        h('span', { html: A.portrait(c.role, 34, { variant: i, status: c.status }) }),
        h('div', { style: 'min-width:0' }, h('b', null, crewName(c.id)), h('br'), state),
        c.status === 'dead' ? h('span') : sel);
    })));
    return h('aside', { class: 'sf-side' },
      seatPanel(s),
      eventsPanel(s, p),
      jobs,
      forecastPanel(s, p, f),
      advancePanel(s, p));
  }
```

In `viewOps`, replace `h('div', { class: 'col col-2' }, crewPanel(s, p, f)),` with:

```js
        h('div', { class: 'col col-2' }, seatPanel(s), crewPanel(s, p, f)),
```

In `src/style.css`, delete the four `.playas` / `.playas-b` rules and add:

```css
.pilot { display: grid; gap: 14px; padding: 8px 0 24px; }
.pilot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.pilot-card { display: grid; grid-template-rows: auto auto auto 1fr auto; justify-items: center; gap: 6px; text-align: center; padding: 18px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: var(--r-md); color: var(--fg); cursor: pointer; font: inherit; }
.pilot-card:hover, .pilot-card:focus-visible { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }
.seat-list { display: flex; flex-wrap: wrap; gap: 8px; }
```

Run: `npm test`
Expected: all pass. The i18n parity test proves both languages have the new keys and that `sf.playAs` is gone from both.

Run: `grep -n "LS.get('controlId'\|playAs\|playas\|store.controlId" src/ui.js src/i18n.js src/style.css`
Expected: only the one `LS.get('controlId', null)` inside the saved-game block (4b).

- [ ] **Step 6: The offline build**

Run: `node tools/build.js`
Expected: it prints the two `dist/` sizes, with no "was not inlined" error.

- [ ] **Step 7: Check it in the browser**

Start a fresh server with `PORT=5071 node server.js` (port free first, as in Task 6). Open `http://localhost:5071/?debug=chunks` and check:

1. **A new solo mission:**
   - **Plan a mission → Launch** shows "Choose your astronaut" with one card per crew member: portrait, name, role and skill.
   - Pick the Biologist. The ops screen has no "You play as" panel, and the surface tag reads "You · Minh Tran" (or that astronaut's name).
   - Take a screenshot of the pilot screen in EN and in VI.
2. **Resume:** reload and press **Resume**. You are still the same astronaut.
3. **A save from v3.1.0:** in the console, run:

```js
const sv = JSON.parse(localStorage.getItem('sol500.save')); delete sv.mission.expedition; delete sv.mission.pilot;
localStorage.setItem('sol500.save', JSON.stringify(sv)); localStorage.setItem('sol500.controlId', JSON.stringify('diego')); location.reload();
```

   **Resume** → you are Diego Ruiz, and `localStorage.getItem('sol500.controlId')` is `null`. There are no console errors.
4. **Takeover:** in the console, run:

```js
const sv = JSON.parse(localStorage.getItem('sol500.save')); const me = sv.mission.crew.find(c => c.id === sv.mission.pilot);
me.status = 'down'; me.downTurns = 4; for (const id in sv.plan.jobs) sv.plan.jobs[id] = 'science'; // no medic on Rest & care to revive them
localStorage.setItem('sol500.save', JSON.stringify(sv)); location.reload();
```

   - **Resume**, open the console tab and **Advance**.
   - The report lists "You are now <name>, <role>." and a toast says the same.
   - Close the report. The surface now walks as that crewmate, and the dead astronaut's flag stands by the HQ.
5. **Co-op seats:**
   - Open a second, isolated browser context (the MCP's `new_page` with `isolatedContext`, or a private window).
   - Host a game in one, join with the other, and have only the host take an astronaut. The host launches.
   - The guest sees "You have no astronaut" with buttons for the free crew. Taking one makes the guest walk as them.

Stop the server and close the extra pages.

- [ ] **Step 8: Commit**

```bash
git add src/ui.js src/i18n.js src/style.css lib/rooms.js test/rooms.test.js dist/
git commit -m "feat(ui): choose your astronaut, take over on death, co-op seat panel; no more Play-as switcher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Regions with real facts, and exploring saved in solo play

**Files:**
- Modify: `src/i18n.js`, `src/ui.js`, `src/style.css`, `dist/` (rebuilt)
- Test: `test/i18n.test.js` (append), plus the browser checks in Step 6

**Interfaces:**
- Consumes:
  - Task 6's surface hooks `reveal(diff)` and `enterRegion(regionId)`;
  - `SolFog.mergeMap` (Task 3), `SolWorldgen.REGIONS` (Task 1), `mission.expedition` (Task 7).
- Produces:
  - `I.REGION_SOURCES` (region id → `SOURCES` key) and six new `SOURCES`;
  - i18n `region.fact.<id>`, `region.new` and `region.source`, plus a "Regions of Mars" entry in `NOTES` (EN+VI);
  - in solo play:
    - `mission.expedition.revealed` collects the fog and `mission.expedition.regions` the regions visited;
    - the save is written at most every 4 s, and when the page is hidden;
  - a region card the first time *you* enter each region in a mission. It is remembered per mission code and mode in `sol500.regionsSeen`, so a reload doesn't show it again.

The six sources below were opened and checked on 2026-10-02. Each fact says only what its page says.

| Region | Fact rests on | Page |
|---|---|---|
| Plains | Jezero is 45 km wide; it held a lake about 3.5 billion years ago and a river delta; "Jezero" means "lake" in several Slavic languages | NASA JPL Mars 2020 landing press kit |
| Dune Sea | The Bagnold Dunes skirt Mount Sharp; no active dunes had been visited anywhere but Earth; some move about 1 m per Earth year | NASA JPL, 16 Nov 2015 |
| Crater Field | "The southern hemisphere exists as an ancient cratered terrain, and the northern hemisphere appears younger and smoother and was influenced by extensive volcanism." | NASA Astrobiology, 23 Mar 2018 |
| Canyon Lands | Valles Marineris is about 3,870 km long, about 600 km across at its widest, and about 9.3 km deep at its deepest | NASA Science resource page |
| Icy Plains | Arcadia Planitia: ice less than 30 cm down; Piqueux: "You wouldn't need a backhoe to dig up this ice. You could use a shovel." | NASA JPL, 10 Dec 2019 |
| Volcanic Flanks | Seven dark holes on Arsia Mons, about 100–225 m across, seen by Mars Odyssey's camera, are possible cave skylights | NASA JPL PIA09929, 22 Sep 2007 |

- [ ] **Step 1: Write the failing test**

Append to `test/i18n.test.js`:

```js
test('every region has a name and a real fact with a checked source, in both languages', () => {
  const W = require('../src/worldgen.js');
  for (const id of W.REGIONS) {
    for (const lang of ['en', 'vi']) {
      assert.ok(I.STR[lang]['region.' + id], lang + ' name of ' + id);
      assert.ok(I.STR[lang]['region.fact.' + id], lang + ' fact for ' + id);
    }
    assert.notEqual(I.STR.vi['region.fact.' + id], I.STR.en['region.fact.' + id], 'translated: ' + id);
    const src = I.SOURCES[I.REGION_SOURCES[id]];
    assert.ok(src && src.label && /^https:\/\//.test(src.url), 'source for ' + id);
  }
  for (const lang of ['en', 'vi']) {
    assert.ok(I.NOTES[lang].some(n => W.REGIONS.every(id => n.src.includes(I.REGION_SOURCES[id]))), lang + ': the science notes list the region sources');
  }
});
```

Run: `node --test test/i18n.test.js`
Expected: FAIL with `en fact for plains`.

- [ ] **Step 2: Sources, facts and the note in `src/i18n.js`**

Add to `SOURCES`, after `dra5`:

```js
    jezero: { label: 'NASA JPL: Mars 2020 Perseverance landing press kit, landing site (Jezero Crater)', url: 'https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/mission/landing_site/' },
    bagnold: { label: "NASA JPL (2015): NASA's Curiosity Mars rover heads toward active dunes", url: 'https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-heads-toward-active-dunes/' },
    dichotomy: { label: 'NASA Astrobiology (2018): Rare metals on Mars and Earth implicate colossal impacts', url: 'https://astrobiology.nasa.gov/news/rare-metals-on-mars-and-earth-implicate-colossal-impacts/' },
    valles: { label: 'NASA Science: Valles Marineris, the Grand Canyon of Mars', url: 'https://science.nasa.gov/resource/valles-marineris-the-grand-canyon-of-mars/' },
    iceMap: { label: "NASA JPL (2019): NASA's treasure map for water ice on Mars", url: 'https://www.jpl.nasa.gov/news/nasas-treasure-map-for-water-ice-on-mars' },
    skylights: { label: 'NASA JPL (2007): Seven possible cave skylights on Mars (PIA09929)', url: 'https://www.jpl.nasa.gov/images/pia09929-seven-possible-cave-skylights-on-mars/' },
```

Right after the closing `};` of `SOURCES`, add:

```js
  // The real place each region of the endless map is modelled on (its fact cites this source).
  const REGION_SOURCES = { plains: 'jezero', dunes: 'bagnold', craters: 'dichotomy', canyons: 'valles', icy: 'iceMap', volcanic: 'skylights' };
```

Add to the `en` table, next to the `region.*` names from Task 6:

```js
    'region.new': 'New region',
    'region.source': 'Source',
    'region.fact.plains': 'Like the floor of Jezero Crater, where Perseverance landed. This 45-km crater held a lake about 3.5 billion years ago, fed by a river that built a delta. "Jezero" means "lake" in several Slavic languages.',
    'region.fact.dunes': 'Like the Bagnold Dunes at the foot of Mount Sharp, which Curiosity set out to study in 2015. No one had ever visited active dunes anywhere but Earth. Seen from orbit, some of them move about 1 m every Earth year.',
    'region.fact.craters': 'Like the southern highlands. Mars has two faces: its southern half is ancient, heavily cratered ground, while the north is younger and smoother, reshaped by volcanoes.',
    'region.fact.canyons': 'Like Valles Marineris, the Grand Canyon of Mars: about 3,870 km long, up to 600 km across, and about 9.3 km deep at its deepest.',
    'region.fact.icy': 'Like Arcadia Planitia, where orbiters mapped water ice less than 30 cm under the ground. "You wouldn\'t need a backhoe to dig up this ice. You could use a shovel," said NASA scientist Sylvain Piqueux.',
    'region.fact.volcanic': "Like the slopes of the volcano Arsia Mons. NASA's Mars Odyssey spotted seven very dark holes there, about 100 to 225 m across, that may be skylights into caves.",
```

and to `vi`:

```js
    'region.new': 'Vùng mới',
    'region.source': 'Nguồn',
    'region.fact.plains': 'Giống như đáy hố Jezero, nơi tàu Perseverance hạ cánh. Hố rộng 45 km này từng chứa một hồ nước khoảng 3,5 tỷ năm trước, do một con sông bồi đắp thành châu thổ. "Jezero" nghĩa là "hồ" trong một số ngôn ngữ Slav.',
    'region.fact.dunes': 'Giống như cồn cát Bagnold dưới chân núi Sharp, nơi tàu Curiosity bắt đầu nghiên cứu năm 2015. Trước đó chưa ai từng đến một cồn cát đang di chuyển ở bất kỳ đâu ngoài Trái Đất. Nhìn từ quỹ đạo, một số cồn cát dịch chuyển khoảng 1 m mỗi năm Trái Đất.',
    'region.fact.craters': 'Giống như vùng cao nguyên phía nam. Sao Hỏa có hai bộ mặt: nửa phía nam là vùng đất cổ xưa chi chít hố va chạm, còn phía bắc trẻ hơn và bằng phẳng hơn, được núi lửa định hình lại.',
    'region.fact.canyons': 'Giống như Valles Marineris, "Grand Canyon của sao Hỏa": dài khoảng 3.870 km, rộng tới 600 km và sâu khoảng 9,3 km ở chỗ sâu nhất.',
    'region.fact.icy': 'Giống như đồng bằng Arcadia, nơi các tàu quỹ đạo phát hiện băng nước nằm dưới mặt đất chưa đến 30 cm. Nhà khoa học NASA Sylvain Piqueux nói: "Bạn không cần máy xúc để đào lớp băng này. Một cái xẻng là đủ."',
    'region.fact.volcanic': 'Giống như sườn núi lửa Arsia Mons. Tàu Mars Odyssey của NASA đã phát hiện ở đây bảy hố rất tối, rộng khoảng 100 đến 225 m, có thể là cửa sổ trời dẫn vào hang động.',
```

Append to the end of the `NOTES.en` array:

```js
      { title: 'Regions of Mars', body: 'The six regions of the endless map are modelled on real places: the floor of Jezero Crater (Plains), the Bagnold Dunes (Dune Sea), the cratered southern highlands (Crater Field), Valles Marineris (Canyon Lands), the shallow ice of Arcadia Planitia (Icy Plains) and the possible cave skylights of Arsia Mons (Volcanic Flanks).', src: ['jezero', 'bagnold', 'dichotomy', 'valles', 'iceMap', 'skylights'] },
```

and to the end of `NOTES.vi`:

```js
      { title: 'Các vùng của sao Hỏa', body: 'Sáu vùng trên bản đồ vô tận được mô phỏng theo những nơi có thật: đáy hố Jezero (Đồng bằng), cồn cát Bagnold (Biển cồn cát), cao nguyên phía nam chi chít hố va chạm (Cánh đồng hố va chạm), Valles Marineris (Vùng hẻm núi), lớp băng nông ở đồng bằng Arcadia (Đồng bằng băng) và các cửa sổ hang động có thể có trên núi Arsia Mons (Sườn núi lửa).', src: ['jezero', 'bagnold', 'dichotomy', 'valles', 'iceMap', 'skylights'] },
```

Change the module's return line to export `REGION_SOURCES`:

```js
  return { t, has, STR, SOURCES, REGION_SOURCES, NOTES, LANGS: ['en', 'vi'] };
```

Run: `node --test test/i18n.test.js`
Expected: PASS.

- [ ] **Step 3: Region cards and saving the exploring in `src/ui.js`**

**3a.** Extend the module constants line at the top to:

```js
  const D = window.SolData, E = window.SolEngine, I = window.SolI18n, A = window.SolArt, C = window.SolCharts, N = window.SolNet, W = window.SolWorldgen, F = window.SolFog;
```

**3b.** In the `store` object, after `opsView: LS.get('opsView', 'surface'),`, add:

```js
    regionsSeen: (rs => (rs && typeof rs.key === 'string' && Array.isArray(rs.list) ? rs : { key: '', list: [] }))(LS.get('regionsSeen', null)),
    regionCard: null,
```

**3c.** After `function saveSettings() { … }` add:

```js
  // Exploring changes the mission every second, so its save is written at most every few seconds (and on leaving).
  let saveTimer = null;
  function saveSoloSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; saveSolo(); }, 4000);
  }
  window.addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveSolo(); } });
```

**3d.** Add before `// ---------- operations ----------`:

```js
  // ---------- regions ----------
  // The first time you walk into a region in a mission: its name and one real fact, with the source.
  let regionTimer = null;
  function showRegionCard(id) {
    const s = mission();
    const key = s.seed + '|' + (lanOn() ? 'coop' : 'solo');
    if (store.regionsSeen.key !== key) store.regionsSeen = { key, list: [] };
    if (store.regionsSeen.list.includes(id)) return;
    store.regionsSeen.list.push(id);
    LS.set('regionsSeen', store.regionsSeen);
    store.regionCard = id;
    render();
    clearTimeout(regionTimer);
    regionTimer = setTimeout(() => { if (store.regionCard === id) { store.regionCard = null; render(); } }, 15000);
  }

  function regionCard() {
    const id = store.regionCard;
    if (!id) return null;
    const src = I.SOURCES[I.REGION_SOURCES[id]];
    return h('aside', { class: 'region-card', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'region-card-h' },
        h('span', { class: 'eyebrow' }, t('region.new')),
        h('button', { class: 'sf-x', type: 'button', 'data-k': 'region-close', 'aria-label': t('common.close'), onclick: () => { store.regionCard = null; render(); } }, '×')),
      h('h3', null, t('region.' + id)),
      h('p', null, t('region.fact.' + id)),
      h('p', { class: 'src' }, t('region.source') + ': ', h('a', { href: src.url, target: '_blank', rel: 'noopener' }, src.label)));
  }
```

**3e.** In `const surfaceHooks = { … }`, add two hooks after `sendPos`:

```js
    reveal: diff => {
      const s = mission();
      if (!s || !s.expedition || lanOn()) return; // co-op fog is shared through the server instead
      F.mergeMap(s.expedition.revealed, diff, 4096);
      saveSoloSoon();
    },
    enterRegion: id => {
      const s = mission();
      if (!s || !s.expedition || !W.REGIONS.includes(id)) return;
      if (!lanOn() && !s.expedition.regions.includes(id)) { s.expedition.regions.push(id); saveSoloSoon(); }
      showRegionCard(id);
    },
```

**3f.** In `function surfaceStage(s, p, f)`:
- In the `window.SolSurface.update({ … })` call, add `fog: s.expedition ? s.expedition.revealed : null,` after `lang: store.lang,`.
- Replace `return h('div', { class: 'sf-stage' }, node);` with `return h('div', { class: 'sf-stage' }, node, regionCard());`.

- [ ] **Step 4: Styles**

In `src/style.css`, change `.sf-stage { min-width: 0; }` to `.sf-stage { min-width: 0; position: relative; }` and add:

```css
.region-card { position: absolute; left: 12px; top: 56px; z-index: 2; width: min(340px, calc(100% - 24px)); background: rgba(28, 20, 23, 0.96); border: 1px solid var(--line-2); border-left: 3px solid var(--accent); border-radius: 10px; padding: 10px 12px 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); display: grid; gap: 6px; }
.region-card-h { display: flex; justify-content: space-between; align-items: center; }
.region-card h3 { margin: 0; font-family: var(--font-display); font-size: var(--fs-md); }
.region-card p { margin: 0; font-size: var(--fs-sm); color: var(--fg-2); line-height: 1.45; }
.region-card .src { font-size: var(--fs-xs); }
.region-card a { color: var(--accent); }
@media (max-width: 640px) { .region-card { top: 136px; } }
```

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: The offline build**

Run: `node tools/build.js`
Expected: it prints the two sizes.

- [ ] **Step 6: Check it in the browser**

With a fresh `PORT=5071 node server.js`, open `http://localhost:5071/?debug=chunks` and start a new solo mission (choose any astronaut). Then check:

1. **The first card:** the Plains card appears at once with the Jezero fact and a source link. Opening the link goes to the NASA JPL page in a new tab. Close the card with ×.
2. **A new region:**
   - Run `SolSurface.qa.board(); SolSurface.qa.ghost(true); SolSurface.qa.speed(6); SolSurface.qa.hold('KeyD', true)` until the region chip changes, then `SolSurface.qa.hold('KeyD', false)`.
   - The new region's card appears. Take a screenshot.
   - Switch to VI: the region chip, the card and the map legend are in Vietnamese.
3. **No repeats:** reload, press **Resume**, and walk back across the same border. No card appears again for regions already seen.
4. **The save holds the exploring:**
   - Wait 5 s after moving, then reload and **Resume**.
   - `SolSurface.probe().seen(<a far tile you passed>)` is true, and the full map (M) shows the strip you explored.
   - `JSON.parse(localStorage.getItem('sol500.save')).mission.expedition.regions` lists the regions you entered.
5. **Science notes:** the "Regions of Mars" entry lists six source links.

Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/i18n.js src/ui.js src/style.css test/i18n.test.js dist/
git commit -m "feat(world): region cards with real NASA facts and sources; solo exploring is saved

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Co-op — shared fog, regions and unbounded positions over the network

**Files:**
- Modify: `lib/rooms.js`, `lib/ws.js`, `src/net.js`, `src/ui.js`, `src/admin.js`, `dist/` (rebuilt)
- Test: `test/rooms.test.js` (append), `test/ws.test.js` (append), plus the browser checks in Step 7

**Interfaces:**
- Consumes: `SolFog.mergeMap` and `KEY` (Task 3), `SolWorldgen.REGIONS` (Task 1), `mission.expedition` (Task 7), `SolSurface.mergeFog` and `reset` (Task 6).
- Produces:
  - **`rooms`:**
    - `rooms.reveal(room, player, map) → null | 'noCrew' | 'badPhase' | 'badFog'`;
    - the `'region'` act (`{ region }`, errors `badPhase`, `noCrew`, `badRegion`);
    - `publicRoom(room).mission.expedition.revealed` is always `{}`;
    - `attach` sends the whole fog to the new client as a `fog` frame;
    - positions are clamped to ±64,000,000.
  - **Frames:**
    - client → server `{ t: 'reveal', d: { key: base64 } }`;
    - server → client `{ t: 'fog', d: { key: base64 } }` (merged diffs, at most every 500 ms).
  - **`SolNet`:** `connect(onRoom, onStatus, onPos, onFog)` and `sendReveal(map) → bool` (false when the socket isn't open).
  - **`ui.js`:**
    - `store.fog`, the co-op fog for the surface;
    - an outbox that is flushed 64 chunks per message and again when the socket reopens;
    - a new co-op mission resets the surface and the fog.
  - **`src/admin.js`:** an event or phase key it doesn't know shows its raw name (M2 follow-up).

- [ ] **Step 1: Write the failing server tests**

Append to `test/rooms.test.js`:

```js
const F = require('../src/fog.js');
const fogOf = cells => { const b = F.empty(); for (const [x, y] of cells) F.set(b, x, y); return F.encode(b); };
const wait = ms => new Promise(r => setTimeout(r, ms));
function inMission() {
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  say(R, room, host, 'claim', { crewId: 'lena' });
  say(R, room, guest, 'claim', { crewId: 'minh' });
  say(R, room, host, 'launch');
  const hc = fakeClient(), gc = fakeClient();
  R.attach(room, host, hc);
  R.attach(room, guest, gc);
  return { R, room, host, guest, hc, gc };
}

test('positions can be negative: the world goes on west and north of the base', async () => {
  const { R, room, guest, hc } = inMission();
  R.position(room, guest, { x: -5000, y: -99999999 });
  await wait(150);
  const pos = hc.got.filter(m => m.type === 'pos').at(-1).data.find(p => p.crewId === 'minh');
  assert.equal(pos.x, -5000);
  assert.equal(pos.y, -64000000);
});

test('fog one player reveals reaches everyone once, merged, within half a second', async () => {
  const { R, room, guest, hc, gc } = inMission();
  const before = hc.got.length;
  assert.equal(R.reveal(room, guest, { '0,0': fogOf([[1, 1]]) }), null);
  assert.equal(R.reveal(room, guest, { '0,0': fogOf([[2, 2]]), '-1,2': fogOf([[5, 5]]) }), null);
  await wait(650);
  const fogs = hc.got.slice(before).filter(m => m.type === 'fog');
  assert.equal(fogs.length, 1);
  const merged = F.decode(fogs[0].data['0,0']);
  assert.equal(F.has(merged, 1, 1) + F.has(merged, 2, 2), 2);
  assert.ok(fogs[0].data['-1,2']);
  assert.ok(gc.got.some(m => m.type === 'fog'), 'the sender hears it too');
  assert.deepEqual(Object.keys(room.mission.expedition.revealed).sort(), ['-1,2', '0,0']);
});

test('bad fog is ignored without breaking anything, and the caps hold', () => {
  const { R, room, guest } = inMission();
  for (const bad of [null, 'x', 7, ['a'], { 'x,y': fogOf([[0, 0]]) }, { '0,0': 'short' }, JSON.parse('{"__proto__":"' + fogOf([[0, 0]]) + '"}')]) {
    assert.ok([null, 'badFog'].includes(R.reveal(room, guest, bad)));
  }
  assert.deepEqual(room.mission.expedition.revealed, {});
  assert.equal(Object.getPrototypeOf(room.mission.expedition.revealed), Object.prototype);
  const many = {};
  for (let i = 0; i < 100; i++) many[i + ',0'] = fogOf([[0, 0]]);
  R.reveal(room, guest, many);
  assert.equal(Object.keys(room.mission.expedition.revealed).length, 64, 'at most 64 chunks per message');
  for (let i = 0; i < 4200; i++) room.mission.expedition.revealed[i + ',9'] = fogOf([[0, 0]]);
  R.reveal(room, guest, { '7,7777': fogOf([[0, 0]]) });
  assert.equal(room.mission.expedition.revealed['7,7777'], undefined, 'a mission holds at most 4,096 fog chunks');
  const R2 = createRooms();
  const { room: r2, player: h2 } = R2.create('Host');
  assert.equal(R2.reveal(r2, h2, { '0,0': fogOf([[0, 0]]) }), 'noCrew');
  say(R2, r2, h2, 'claim', { crewId: 'lena' });
  assert.equal(R2.reveal(r2, h2, { '0,0': fogOf([[0, 0]]) }), 'badPhase', 'no mission yet');
});

test('room messages leave the fog out, and a tab that attaches gets the whole fog', () => {
  const { R, room, host, guest } = inMission();
  R.reveal(room, guest, { '3,-4': fogOf([[1, 2]]) });
  assert.deepEqual(R.publicRoom(room).mission.expedition.revealed, {});
  assert.ok(room.mission.expedition.revealed['3,-4'], 'the server keeps it');
  const late = fakeClient();
  R.attach(room, host, late);
  assert.deepEqual(late.got.map(m => m.type).slice(-2), ['room', 'fog']);
  assert.deepEqual(Object.keys(late.got.at(-1).data), ['3,-4']);
});

test('flying again starts with no fog and no regions, and no old fog arrives later', async () => {
  const { R, room, host, guest, hc } = inMission();
  say(R, room, guest, 'region', { region: 'dunes' });
  R.reveal(room, guest, { '0,0': fogOf([[1, 1]]) });
  say(R, room, host, 'restart');
  const mark = hc.got.length;
  assert.equal(say(R, room, host, 'launch').status, 200);
  await wait(650);
  assert.equal(hc.got.slice(mark).filter(m => m.type === 'fog').length, 0, 'no stale fog');
  assert.deepEqual(room.mission.expedition.revealed, {});
  assert.deepEqual(room.mission.expedition.regions, []);
});

test('a region found by anyone is recorded once; made-up regions are refused', () => {
  const { R, room, guest, host } = inMission();
  assert.equal(say(R, room, guest, 'region', { region: 'dunes' }).status, 200);
  assert.equal(say(R, room, host, 'region', { region: 'dunes' }).status, 200);
  assert.deepEqual(room.mission.expedition.regions, ['dunes']);
  const bad = say(R, room, guest, 'region', { region: 'atlantis' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'badRegion');
});
```

Append to `test/ws.test.js`:

```js
test('fog revealed over the socket reaches the other players', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    await act(base, host, 'claim', { crewId: 'lena' });
    await act(base, guest, 'claim', { crewId: 'minh' });
    await act(base, host, 'launch');
    const hws = openWs(base, host), gws = openWs(base, guest);
    await next(hws, isRoom);
    await next(gws, isRoom);
    const bits = new Uint8Array(128);
    bits[0] = 1;
    const text = Buffer.from(bits).toString('base64');
    gws.send(JSON.stringify({ t: 'reveal', d: { '-2,3': text } }));
    const fog = await next(hws, m => m.t === 'fog' && m.d['-2,3']);
    assert.equal(fog.d['-2,3'], text);
    hws.close();
    gws.close();
  } finally { srv.close(); }
});
```

Run: `node --test test/rooms.test.js test/ws.test.js`
Expected: FAIL. `R.reveal is not a function`; the negative position comes back as 0; `'region'` gives `badAction`.

- [ ] **Step 2: The server side in `lib/rooms.js`**

**2a.** Add the requires after `const D = require('../src/data.js');`:

```js
const F = require('../src/fog.js');
const W = require('../src/worldgen.js');
```

**2b.** Replace the line `const MAX_COORD = 5000; // world pixels; M3 (big map) raises this` with:

```js
const FOG_FANOUT_MS = 500;
const FOG_KEYS_PER_MESSAGE = 64;
const FOG_CHUNKS_MAX = 4096;
const MAX_COORD = 64000000; // world pixels either way of the HQ: the world is endless, the numbers are not
```

**2c.** In `publicRoom`, replace `mission: room.mission,` with `mission: room.mission && withoutFog(room.mission),`, and add above `function publicRoom`:

```js
  // Fog is big and changes every second, so it travels in its own 'fog' frames, never inside 'room'.
  function withoutFog(m) {
    if (!m.expedition) return m;
    return Object.assign({}, m, { expedition: Object.assign({}, m.expedition, { revealed: {} }) });
  }
```

**2d.** In `position`, replace `const num = v => Math.max(0, Math.min(MAX_COORD, Math.round(Number(v) || 0)));` with:

```js
    const num = v => Math.max(-MAX_COORD, Math.min(MAX_COORD, Math.round(Number(v) || 0)));
```

**2e.** Add after the closing brace of `function position(room, player, body)`:

```js
  // A player's newly seen fog: checked, OR-merged into the mission, and sent to everyone at most every 500 ms.
  function reveal(room, player, map) {
    if (!player.crewId) return 'noCrew';
    if (room.phase !== 'ops' || !room.mission || !room.mission.expedition) return 'badPhase';
    if (!map || typeof map !== 'object' || Array.isArray(map)) return 'badFog';
    const diff = {};
    for (const k of Object.keys(map).slice(0, FOG_KEYS_PER_MESSAGE)) if (F.KEY.test(k)) diff[k] = map[k];
    const changed = F.mergeMap(room.mission.expedition.revealed, diff, FOG_CHUNKS_MAX);
    if (!Object.keys(changed).length) return null;
    Object.assign(room.fogPending, changed);
    if (!room.fogTimer) {
      room.fogTimer = setTimeout(() => {
        room.fogTimer = null;
        const out = room.fogPending;
        room.fogPending = {};
        if (Object.keys(out).length) fanout(room, 'fog', out);
      }, FOG_FANOUT_MS);
      if (room.fogTimer.unref) room.fogTimer.unref();
    }
    return null;
  }

  // A mission ending or restarting drops any fog still waiting to go out.
  function stopFog(room) {
    if (room.fogTimer) { clearTimeout(room.fogTimer); room.fogTimer = null; }
    room.fogPending = {};
  }
```

**2f.** In `closeRoom`, add `stopFog(room);` after the `posTimer` line.

**2g.** In `apply`:
- In `case 'launch':`, add `stopFog(room);` right before `room.mission = E.createMission({`.
- In `case 'restart':`, add `stopFog(room);` right after that case's `if (!host) return 'onlyHost';` line.

Then add a new case before `case 'leave':`:

```js
      case 'region': {
        if (room.phase !== 'ops' || !room.mission) return 'badPhase';
        if (!player.crewId) return 'noCrew';
        if (!W.REGIONS.includes(body.region)) return 'badRegion';
        const list = room.mission.expedition.regions;
        if (!list.includes(body.region)) list.push(body.region);
        return null;
      }
```

**2h.** In `create`, in the new `room` object, add `fogPending: {}, fogTimer: null,` after `posTimer: null,`.

**2i.** In `attach`, after `broadcast(room);`, add:

```js
    const fog = room.mission && room.mission.expedition && room.mission.expedition.revealed;
    if (fog && Object.keys(fog).length) client.send('fog', fog); // a new or reconnecting tab gets the whole fog
```

**2j.** Add `reveal` to the object returned by `createRooms`:

```js
  return { rooms, create, join, auth, act, position, reveal, attach, detach, publicRoom, kick, close, snapshot };
```

- [ ] **Step 3: The socket in `lib/ws.js`**

Update the header comment's frame list to `Frames are JSON { t, d }. Server → client: room, pos, fog, event (kicked, closed). Client → server: pos, reveal.`

Replace `if (msg.t === 'pos') rooms.position(room, player, msg.d && typeof msg.d === 'object' ? msg.d : {});` with:

```js
      if (msg.t === 'pos') rooms.position(room, player, msg.d && typeof msg.d === 'object' ? msg.d : {});
      else if (msg.t === 'reveal') rooms.reveal(room, player, msg.d);
```

Run: `node --test test/rooms.test.js test/ws.test.js`
Expected: PASS.

- [ ] **Step 4: The client in `src/net.js`**

Change `function connect(onRoom, onStatus, onPos)` to `function connect(onRoom, onStatus, onPos, onFog)` and its handlers line to `handlers = { onRoom, onStatus, onPos, onFog };`. In `open()`'s `onmessage`, after the `pos` branch, add:

```js
      else if (msg.t === 'fog') { if (h.onFog) h.onFog(msg.d); }
```

Add after `function sendPos(pos) { … }`:

```js
  // Newly seen fog goes over the socket. Returns false when it isn't open, so the caller keeps it and tries again.
  function sendReveal(map) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify({ t: 'reveal', d: map }));
    return true;
  }
```

and add `sendReveal` to the `root.SolNet = { … }` export.

- [ ] **Step 5: The co-op side of `src/ui.js`**

**5a.** In `store`, after `regionCard: null,` add `fog: {},`.

**5b.** After the line `const isHost = () => …;` (in the LAN helpers), add:

```js
  // Fog waiting to go to the server: kept until the socket takes it, sent 64 chunks per message.
  let fogOut = {};
  function flushFog() {
    const keys = Object.keys(fogOut);
    for (let i = 0; i < keys.length; i += 64) {
      const part = {};
      for (const k of keys.slice(i, i + 64)) part[k] = fogOut[k];
      if (!N.sendReveal(part)) return;
      for (const k of Object.keys(part)) delete fogOut[k];
    }
  }
```

**5c.** Replace the `reveal` and `enterRegion` hooks from Task 9 with:

```js
    reveal: diff => {
      const s = mission();
      if (!s || !s.expedition) return;
      if (lanOn()) {
        F.mergeMap(store.fog, diff, 4096);
        F.mergeMap(fogOut, diff);
        flushFog();
        return;
      }
      F.mergeMap(s.expedition.revealed, diff, 4096);
      saveSoloSoon();
    },
    enterRegion: id => {
      const s = mission();
      if (!s || !s.expedition || !W.REGIONS.includes(id)) return;
      if (!s.expedition.regions.includes(id)) {
        if (lanOn()) N.act('region', { region: id });
        else { s.expedition.regions.push(id); saveSoloSoon(); }
      }
      showRegionCard(id);
    },
```

**5d.** In `surfaceStage`, change the fog line from Task 9 to `fog: lanOn() ? store.fog : (s.expedition ? s.expedition.revealed : null),`.

**5e.** In `function onRoom(room)`, replace its first two lines

```js
    const prevTurn = store.lastTurnSeen;
    store.room = room;
```

with:

```js
    const prevTurn = store.lastTurnSeen;
    const hadMission = !!(store.room && store.room.mission);
    store.room = room;
    // A new co-op mission (a launch, or a launch after "Fly again") starts with a fresh world and no fog.
    if (room.mission && !hadMission) {
      store.fog = {};
      fogOut = {};
      if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.reset();
    }
```

**5f.** Add a fog handler next to `function onPos(list)`:

```js
  // Fog a teammate revealed: kept for a rebuilt surface, and drawn straight away without a full re-render.
  function onFog(map) {
    F.mergeMap(store.fog, map, 4096);
    if (window.SolSurface && window.SolSurface.isMounted()) window.SolSurface.mergeFog(map);
  }
```

**5g.** Change every `N.connect(onRoom, onLanStatus, onPos)` (there are three) to `N.connect(onRoom, onLanStatus, onPos, onFog)`.

**5h.** In `function onLanStatus(status, kind)`, replace the line `store.lanStatus = status;` with:

```js
    store.lanStatus = status;
    if (status === 'open') flushFog(); // fog seen while the socket was down
```

- [ ] **Step 6: Unknown admin labels (`src/admin.js`)**

After the line `const t = (k, p) => I.t(S.lang, k, p);` add:

```js
  // Room events and phases added after this panel was written show their raw name instead of a bare key.
  const label = (prefix, k, p) => (I.has(S.lang, prefix + k) ? t(prefix + k, p) : k);
```

Replace `t('admin.phase.' + r.phase)` with `label('admin.phase.', r.phase)`, and `t('admin.ev.' + ev.type, {` with `label('admin.ev.', ev.type, {`.

Run: `npm test`
Expected: all pass.

Run: `node tools/build.js`
Expected: it prints the two sizes.

- [ ] **Step 7: Check it in the browser (two players)**

1. Start a fresh `PORT=5071 node server.js` and open two isolated contexts at `http://localhost:5071/?debug=chunks`.
2. Host a game in A, join from B, take Lena in A and Minh in B, and launch.
3. **Shared fog and negative positions:**
   - In B, run `SolSurface.qa.board(); SolSurface.qa.ghost(true); SolSurface.qa.speed(6); SolSurface.qa.hold('KeyA', true)` for about 4 s (going west, x below zero), then release.
   - In A, `SolSurface.probe().remote` shows Minh with a negative `x`.
   - Within about 1 s, A's `SolSurface.probe().seen(<B's tile>)` is true, and A's full map (M) shows B's strip.
4. **Regions:** when B crosses into a new region, B sees its card and A doesn't (A hasn't been there). The server's record is proved by the Step 1 tests. Check that neither tab has console errors.
5. **Reload and reconnect:**
   - Reload A. A's map still shows B's strip, because the full fog arrives on attach.
   - Take a screenshot of A's map.
6. **Fly again:** the host goes Home, a new mission is launched, and its map shows only the base.

Stop the server and close the extra pages.

- [ ] **Step 8: Commit**

```bash
git add lib/rooms.js lib/ws.js src/net.js src/ui.js src/admin.js test/rooms.test.js test/ws.test.js dist/
git commit -m "feat(coop): shared fog and regions over WebSockets, endless positions, fresh fog on a new mission; admin labels for unknown events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Browser QA, performance, docs and the 3.2.0 build

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (§12 ticks only), `package.json` (version)
- Create: `docs/superpowers/plans/2026-10-02-sol500-m3-followups.md`
- Rebuild: `dist/`, `progress.json` (git-ignored), and the installer `dist-app/SOL500-Setup-3.2.0.exe` (git-ignored)

This task changes no game code. If a check fails, fix the cause in the task that owns it, with a test where one is possible, then come back here.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all pass (218 tests when this plan was written). Record the count.

- [ ] **Step 2: The same world in Chrome and in Node**

Start `PORT=5071 node server.js` (port checked free first) and open `http://localhost:5071/`. Run in the page:

```js
(() => {
  const W = SolWorldgen, seed = W.seedOf('PIN-1');
  let a = 7 >>> 0; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
  let h = 2166136261;
  for (let i = 0; i < 1000; i++) {
    const c = W.chunk(seed, Math.floor(r() * 4000) - 2000, Math.floor(r() * 4000) - 2000);
    for (const b of [c.tiles, c.regions]) for (let k = 0; k < b.length; k++) h = Math.imul(h ^ b[k], 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
})()
```

Expected: `4f1ff5dc`, the value pinned in `test/worldgen.test.js`.

- [ ] **Step 3: Frame rate during a 2-minute straight rover drive with 5 avatars (spec §1.3)**

Open `http://localhost:5071/?debug=chunks` at a 1920×1080 window and start a solo mission with a **5-person** crew. Then:

1. Start a Chrome performance trace (`performance_start_trace`).
2. Run this in the page. It returns the median and 5th-percentile fps.

```js
(async () => {
  const q = SolSurface.qa, frames = [];
  q.board(); q.ghost(true); q.speed(1);
  const crew = ['minh', 'diego', 'amara', 'kai'];
  const follow = setInterval(() => {
    const p = SolSurface.probe().player;
    SolSurface.setRemote(crew.map((id, i) => ({ crewId: id, x: p.x - 90 - i * 40, y: p.y + (i % 2 ? 40 : -40), dir: 'right', moving: true, rover: false })));
  }, 100);
  q.hold('KeyD', true);
  let last = performance.now();
  const end = last + 120000;
  await new Promise(done => { const tick = t => { frames.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
  q.hold('KeyD', false); clearInterval(follow); SolSurface.setRemote([]);
  const fps = frames.map(ms => 1000 / ms).sort((a, b) => a - b);
  return { median: fps[fps.length >> 1].toFixed(1), p5: fps[Math.floor(fps.length * 0.05)].toFixed(1), frames: frames.length, tile: SolSurface.probe().tile };
})()
```

3. Stop the trace (`performance_stop_trace`) and keep its summary.

Expected:
- the median is ≥ 50 fps;
- the debug box's `data` stays ≤ 64 and `images` ≤ its cap during the drive;
- `paint` stays ≤ 2 ms.

If the display refreshes at more than 60 Hz the median will be higher; that is fine. If the median is below 50, look at the trace (the largest tasks in a frame) before changing anything.

- [ ] **Step 4: Flat memory over 2,000 tiles out and back, and chunks rebuilt identically**

In the same page, at the base and after 10 s idle:

1. Record `performance.memory.usedJSHeapSize` and take a heap snapshot (`take_heapsnapshot`).
2. Record `SolSurface.qa.chunkHash(0, 0)`.
3. Run:

```js
(async () => {
  const q = SolSurface.qa, w = ms => new Promise(r => setTimeout(r, ms)), peak = { data: 0, images: 0, cap: 0 };
  const sample = () => { const p = SolSurface.probe(); peak.data = Math.max(peak.data, p.world.data); peak.images = Math.max(peak.images, p.paint.images); peak.cap = Math.max(peak.cap, p.paint.cap); };
  q.board(); q.ghost(true); q.speed(8);
  q.hold('KeyD', true); while (SolSurface.probe().tile[0] < 2000) { await w(250); sample(); } q.hold('KeyD', false);
  q.hold('KeyA', true); while (SolSurface.probe().tile[0] > 2) { await w(250); sample(); } q.hold('KeyA', false);
  await w(10000);
  return { peak, tile: SolSurface.probe().tile, hash: q.chunkHash(0, 0) };
})()
```

4. Record `performance.memory.usedJSHeapSize` again and take a second heap snapshot.

Expected:
- the heap after is within **+20 MB** of the heap before (compare both the snapshots and `usedJSHeapSize`);
- `peak.data` ≤ 64 and `peak.images` ≤ `peak.cap` ≤ 160;
- the hash is the same as before the drive.

- [ ] **Step 5: The rest of the browser QA (spec §10)**

1. **A solo mission start to finish with exploring:**
   - Choose an astronaut and explore three regions; each region card appears once.
   - Advance through all 20 rounds (the console's Advance; Training mode is fine) to the debrief.
   - The admin History tab (Admin button) shows the solo record, with the pilot as its crew member.
2. **LAN with 2 players:** Task 10 Step 7 again on the final build.
3. **LAN with 5 players:**
   - Five isolated contexts join one room, each takes an astronaut, and the host launches.
   - Every tab shows all five avatars, and fog revealed by any one appears on everyone's map.
   - There are no console errors.
4. **EN and VI:** the pilot screen, region chip, region card, map title, legend, hint, seat panel and takeover line all read correctly in both languages.
5. **Phone width:**
   - With `emulate` at 390×844, touch, play a mission.
   - The minimap is 112 px, the region card sits below it, the map overlay pans by drag, and the pilot cards stack.
   - Take screenshots.
6. **The offline file:**
   - Open `dist/sol500.html` (after `node tools/build.js`) from disk in Chrome.
   - A solo mission plays, the world streams, and the map works. There is no LAN or admin, which is expected.

Stop the server and close every page you opened.

- [ ] **Step 6: Tick the M3 checklist and write the follow-ups**

In the spec's §12 "M3 — Endless world", change each `- [ ]` to `- [x]` for the items Steps 1–5 proved. If a target was missed, leave that box unticked and say why in the follow-ups.

Create `docs/superpowers/plans/2026-10-02-sol500-m3-followups.md` with:
- the measured numbers: test count, the Chrome hash, the fps median and 5th percentile, the heap before and after, the peak chunk counts, and the paint median;
- the items below;
- anything new the reviews deferred.

```markdown
# SOL 500 M3 — follow-ups for later milestones

## For the M4 plan (exploring)
- The rover goes back to its bay when you leave it far from the base. M4 should park it where you left it (a position in mission state), now that EVA trips are long.
- `mission.expedition` already has spec §4's full shape (v: 2). M4 fills `sites`, `structures`, `landmarks`, `beacons`, `carried`, `banked`, `goals`, `incidents` and `stats`, and adds them to `resolveTurn`.
- `expedition.regions` is recorded in solo and co-op; achievements and expedition goals can read it.
- The view radius is fixed at 8 tiles (10 in the rover). Dust storms shrinking it (spec §3.4) are M4.
- The server has no world cache yet. M4's checked item actions need the shared 256-chunk LRU from spec §5.
- The region card shows once per mission code and mode, so replaying the same code shows no cards.

## For the M5 plan (polish)
- `src/surface.js` is about 1,020 lines, above the spec's "about 900". Move the interaction menu (`focusAt`, `focusLabel`, `renderMenu`, `mbtn`) into `src/surface-menu.js`.
- The minimap is 1 px per tile (spec §2.6), so at the start the explored base is a small blob. Consider a 2× zoom button.
- Fog edges are drawn per tile (blocky by design). A soft edge would look better at low zoom.
- A lone sand tile in the Dune Sea shows as a plain square.
```

- [ ] **Step 7: Version, progress and the installer**

1. Set `"version": "3.2.0"` in `package.json`.
2. Run `node tools/build.js` and `npm run progress`. The admin Project tab, opened from a fresh server, shows M3's items ticked and the new test count.
3. Kill any leftover `electron.exe` and `cloudflared-*.exe`, then run `npm run app`.
   Expected: `dist-app/SOL500-Setup-3.2.0.exe` is built.
4. Run `npm run smoke`. Expected: it passes. Kill leftover `electron.exe` again afterwards.
5. Install the new build over 3.1.0 and launch it. Check: Solo → choose an astronaut → walk out and see a region card → M opens the map; and Admin opens. Close the app.

- [ ] **Step 8: Commit**

```bash
git add package.json dist/ docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md docs/superpowers/plans/2026-10-02-sol500-m3-followups.md
git commit -m "chore: M3 complete (endless world, one astronaut), version 3.2.0, offline build refreshed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review (done while writing this plan)

1. **Spec coverage, M3 (§11 and §12):**

   | M3 item | Task |
   |---|---|
   | worldgen with regions and terrain features | 1, 2 |
   | chunk streaming with delete and rebuild | 4, 6; proved in 11 Step 4 |
   | painting and culling | 5, 6 |
   | collision and paths | 4, 6 |
   | minimap, map screen and shared fog | 3, 5, 6, 10 |
   | region toasts with sources | 9 |
   | the debug overlay | 6 |
   | one-astronaut control | 7, 8 |

   Spec §1.3:
   - determinism in Node is Task 2, and in Chrome Task 11 Step 2;
   - the build and paint timings are Tasks 2 and 6 (Step 8);
   - fps is Task 11 Step 3, memory Task 11 Step 4, reachability Task 2.

   Spec §1.5 (one astronaut) is Tasks 7 and 8. Spec §5 (`reveal`/`fog` frames, unbounded positions) is Task 10.

   The M2 follow-ups for M3 are Task 7 (`pilot` validation) and Task 10 (labels for unknown events and phases).

   Deliberately left to M4: everything in spec §3, the server world cache, and storms shrinking the view (recorded in Task 11's follow-ups).
2. **Placeholders:** none. Every code step shows its code. Every browser step names what to run and what to expect.
3. **Type consistency:**
   - `SolWorld.create(...).fogBits/fogStamp/fogKeys/dataFor/peek` (Task 4) match their use in `SolPaint` (Task 5) and `SolMap` (Task 6).
   - `hooks.reveal` and `hooks.enterRegion` (Task 6) match Tasks 9 and 10.
   - `report.pilot` (Task 7) matches Task 8.
   - `rooms.reveal` (Task 10) matches `lib/ws.js`.
4. **Review Focus:** each of its five lines has its test in the named task. Tasks 1–10 of this plan were applied, as written, to a copy of the repo while the plan was being written: 218 tests passed. In Chrome, the endless surface, streaming, fog, map, pilot screen, old-save upgrade, takeover and two-player shared fog all worked. That dry run found and fixed five plan bugs before anyone ran it: a checkerboard ground, seams on the map, a crash when an old save loaded, a medic reviving the astronaut in the takeover check, and an M2 test that needed updating.
