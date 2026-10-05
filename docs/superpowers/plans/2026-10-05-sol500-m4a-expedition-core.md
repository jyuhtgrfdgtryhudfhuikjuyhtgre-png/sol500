# SOL 500 M4a — Expedition Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the endless world worth walking out into.
- Ice, metal-rich rock, crashed cargo pods and science sites lie on the map.
- You hold E by one to load it into your backpack and carry it home on one suit charge a round.
- What you deliver counts when the round advances.
- In co-op the server checks every action.

**Architecture:**
- **`src/worldgen.js`** places finds in every data chunk (pure and deterministic), like the terrain. Crater centres and canyon middles hold ice.
- **`src/expedition.js`** (new, pure UMD, `SolExpedition`) holds the rules:
  - collect, deliver, breathe a canister, pick up a dropped load, collapse, revive;
  - board and park the rover, and the suit and battery levels.
  - `ui.js` runs them on the spot in solo play and `lib/rooms.js` runs them in co-op, so both play by the same rules.
  - Its 256-chunk world cache is shared by every room on the server.
- **`src/engine.js`:**
  - banks deliveries;
  - adds the bank, and collapse incidents, at the start of `simulate` (so the forecast and HUD show a delivery straight away);
  - rolls the round over in `resolveTurn`: backpacks are banked a round late and everyone goes home with a full suit.
- **`src/surface-eva.js`** (new, browser-only, `SolEva`) is the surface's exploring layer: the suit, holding E, delivery, the HUD, sprites and minimap markers. `src/surface.js` only wires it in.
- **`tools/explorer.js`** plays the real rules round after round for the balance runs and a plateau test.

**Tech Stack:** Plain browser JavaScript (no bundler; UMD/IIFE modules on `window`), Canvas 2D, Node 24 built-in test runner (`node --test`), `ws` (already a dependency), Electron (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (v3.1). The sections that apply:
- §1.4 (balance targets);
- §2.4 (finds);
- §3.1–§3.3 (the loop, finds, suit oxygen, role skills);
- §4 (the expedition state and the `src/expedition.js` API);
- §5 (checked actions; positions carry the suit level and carried count; the 256-chunk server cache);
- §11 and §12 (M4, split into M4a–M4d on 2026-10-05; this plan builds the four "(M4a)" items);
- §13.9 (the rover battery, which needs the user's OK).

Follow-ups this plan takes from `docs/superpowers/plans/2026-10-02-sol500-m3-followups.md`:
- the rover parks where you leave it;
- the server world cache;
- `upgradeMission` rebuilds malformed fields;
- `explore()` while dead (unchanged: a collapsed astronaut is still `active`, so their fog still counts).

**Branch:** `feat/m4a-expedition-core`, created off `master` at `92a3894`. It holds this plan and the spec's split, and is otherwise clean.

**How this plan was made:** every task was dry-run against a copy of the repository:
- **Tests:** 278 of 278 pass (228 before).
- **Balance:** the bots were run over 1,000 seeds × 3 difficulties.
- **Browser, solo:** collect, deliver, advance, collapse, the bench, and rover boarding, driving and parking.
- **Browser, co-op:** collect, collapse, revive, and an advance with a load still carried.
- **Code:** every code block below is that tested code.

## Global Constraints

- **No new runtime dependencies.** Browser code stays plain `<script>` files loaded in order by `index.html`. A new pure module uses the UMD header that `src/engine.js` uses.
- **Worldgen determinism (spec §2.1):**
  - Finds use `hash`/`unit` only. In `src/worldgen.js` the only maths allowed is `+ − × ÷`, `%`, `Math.sqrt`, `Math.floor`, `Math.ceil`, `Math.abs`, `Math.min` and `Math.max`.
  - The pinned world hash **`4f1ff5dc`** must not change, because finds don't touch tiles or regions.
  - The finds hash is pinned at **`0e84f5a1`**. Change it only on purpose: saved missions remember finds by id.
- **Coordinates:**
  - Tiles are 64 px. The HQ is tile (0, 0); its centre is (32, 32) in world pixels.
  - The **base zone** is the tiles within 2 of the HQ both ways (Chebyshev), so world pixels −128 to 191 on each axis. The suit pauses there and loads are delivered there.
  - Every action position is in world pixels.
  - In co-op the server uses the **last position it received**, never one in the request.
- **Numbers from the spec, unchanged:**
  - **Suit:** 150 s a round; it pauses in the base zone but doesn't refill there. Drain ×2 sprinting, ×½ in the rover, ×1.1 on the Icy Plains.
  - **Backpack:** 3 loads, or 8 in the rover.
  - **Holding E:** 3 s for a load, 5 s for a survey; 4 s to revive (2 s for the medic).
  - **O₂ canister:** +45 s of suit, or +30 kg of base O₂ if carried home.
  - **Revive:** the crew member gets up with +30 s of suit.
  - **Collapse:** −20 health and −3 morale.
  - **Ice:** 3–6 loads × 40 kg of water, by ring.
  - **Metal:** 3–5 loads × 40 kg of materials.
  - **Cargo pod:** 3 loads, each a spare kit, 60 kg of food or an O₂ canister.
  - **Science:** 20, 35, 60 or 80 by ring, ×1.5 in the Crater Field.
  - **Role skills:** the scientist surveys in half the time with +50 % science; the engineer mines metal and salvages pods in half the time; the biologist collects ice in half the time and senses ice and methane vents from 16 tiles; the medic revives in half the time.
  - **Slack:** 1.5 tiles on every checked action.
  - **Server cache:** 256 data chunks.
- **New number (ruling 4):** the rover drives **400 tiles a round**.
- **Text:**
  - Every player-facing string goes in `src/i18n.js` in English and Vietnamese (the key-parity test checks this).
  - M4a adds no science claims: the find names are game flavour, and facts with sources come with M4c.
- **Commits:** one or more per task, on `feat/m4a-expedition-core`. Messages are imperative and prefixed (`feat(world):`, `feat(engine):`…), and end with exactly this line, not your own model name:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Line endings:**
  - The working tree uses `core.autocrlf=true`. Most files are CRLF on disk, but some are LF (for example `src/data.js` and `tools/balance.js`).
  - When you patch with a script, normalise endings first, then write each file back with its own endings. New files may be either.
- **Before any browser check:**
  - Stop old servers on ports 5050–5079; a stale server caused an earlier bug.
  - After app or tunnel runs, kill leftover `electron.exe` and `cloudflared-*.exe` by PID, never by name.
  - Use a fresh `--data <temp folder>` so the repo's `data/` stays empty.
- **Tests:** `npm test` (`node --test`) must stay green after every task.

  | | Tests |
  |---|---|
  | Start (`92a3894`) | 228 |
  | After Task 1 | 235 |
  | After Task 2 | 244 |
  | After Task 3 | 263 |
  | After Task 4 | 269 |
  | After Task 5 | 271 |
  | After Task 6 | 278 |
  | After Tasks 7 and 8 | 278 |

## Rulings made while planning (binding unless the user overrules them)

1. **M4 is split into M4a–M4d** (the user, 2026-10-05). This plan builds M4a only. Dangers are M4b; landmarks and structures M4c; beacons, goals, pings, the debrief and the final rebalance M4d.
2. **No per-window flood fill (spec §2.3).**
   - Finds only ever stand on open ground.
   - M3's reachability test already proves, on 300 seeds, that all open ground within 128 tiles of the base is connected.
   - The test now also checks that every find is reached.
3. **Several trips a round.** Spec §3.2 has the base zone pause the drain, so you may deliver and head out again. The suit caps the total time outside.
4. **The rover has a battery.** This is new, and is listed as spec §13.9 for the user's OK.
   - It drives 400 tiles a round and recharges overnight.
   - Working on a find from it drains the suit at the walking rate, because you step out to work.
   - Why: without it, the explorer bot hauled about 35 loads a round by rover (5× a walker) and about 5,500 science a mission.
5. **Find layout tuned with the explorer bot** (all numbers are in Task 1's code):
   - **Density:** about 1.4 finds a chunk, and about 0.8 in the Dune Sea. Fewer near the base: ×0.3 inside 20 tiles and ×0.6 out to 40.
   - **Ice:** in crater floors, canyons and the Icy Plains. Every crater centre and canyon middle holds a deposit.
   - **Surveys:** rare (weights 0.35–0.75), so exploring adds a few hundred science, not thousands.
   - **Cargo pods:** a spare kit, food or an O₂ canister in the ratio 1 : 3 : 1. At 1 : 1 : 1 and 1 : 2 : 2 the canisters lifted the careless cadet bot above the 35 % limit.
6. **Balance against spec §1.4** (1,000 seeds; full table in "Measured"):
   - **Met:**
     - The careless bot stays under 35 % with exploring: 31.3 % / 9.9 % / 1.2 % on cadet / commander / veteran.
     - The thoughtful bot stays over 70 % (100 %).
     - The haul levels off: on foot from 8.8 to 3.0 loads a round, in the rover from 18.9 to 7.6.
   - **Not met: "exploring raises the sloppy bot by 10–25 points."**
     - Cadet and commander have no room (100 % and 98.1 % without exploring).
     - On veteran it rises 66.8 → 97.5 % (+30.7). That bot fails at a threshold: a few O₂ canisters and repairs save it.
     - M4d's final rebalance revisits this with landmarks, structures and goals in place.
   - **Scores rise:** the thoughtful commander bot goes 1,324 → 1,754, and S grades become common for explorers. Also for M4d.
7. **One driver at a time**, checked by the server.
   - Getting in at once feels immediate; if the server refuses, you are put back out.
   - Reloading while driving puts you back in the seat.
   - Whoever drove the rover brings it home at the advance. A parked rover stays where it is.
8. **Delivery is automatic** when you step into the base zone with a load. The zone is drawn as a dashed square.
9. **The suit HUD sits at the top left** (58 px down). The region card moves from 56 px to 150 px, and the phone hint strip from 136 px to 150 px, so nothing covers the suit.
10. **The exploring layer is a new file**, `src/surface-eva.js`. `src/surface.js` was already 1,055 lines (the spec says about 900), and grows only by the wiring.
11. **Co-op actions answer with the rules' result**, for example the item you loaded, so the "+40 kg water" note shows in co-op too.
12. **The dry run caught a drawing bug.** `surface.js` drew its sprites with `s.draw()`, but the exploring layer's sprites take the canvas context, so every frame with a find in view threw an error and lost the fog, the name tags, the minimap and the position update. Task 7 changes the call to `s.draw(ctx)`.

## Review Focus

The five input classes or failure modes most likely to bite a real player, which no feature test would naturally hit. Each has a test or check in the task that owns the code.

1. **A 3.2.0 solo save resumed after updating.**
   - Its expedition has no `suits`, `collapsed`, `benched`, `rover` or `roverDriven`, or it was hand-edited into the wrong types.
   - It must load, be repaired field by field and play on.
   - *Covered by:* Task 2's repair test; a browser step in Task 8 with a hand-made save.
2. **Hostile or stale co-op actions.** All of these are refused, and nothing changes:
   - odd find ids (`-0,0:1`, `05,1:2`) or made-up ones;
   - a revive aimed at `__proto__`;
   - no position yet, or a position far away;
   - a second driver.
   - *Covered by:* the Task 3 and Task 4 tests.
3. **A reload or a dropped connection in the middle of an EVA.**
   - The suit level, the rover's battery and driving seat, and a collapse all survive: in the saved solo mission, and in the co-op mission.
   - *Covered by:* Task 6's round test; the Task 7 and Task 8 browser steps.
4. **The round advances while someone is out.**
   - A collapsed co-op astronaut leaves their load where they fell.
   - Everyone goes home with a full suit.
   - The driven rover comes home and a parked one stays.
   - *Covered by:* Task 2's tests; the Task 7 browser steps.
5. **Farming an endless map.** The haul per round is bounded and falls off over the mission. *Covered by:* Task 5's plateau test.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/worldgen.js` | modify | `chunk().finds`, `RINGS`, `FIND_KINDS`, `ringOf`; finds placed per chunk, ice at crater centres and canyon middles |
| `src/data.js` | modify | `EXPEDITION`, `FINDS`, `SKILLS` constants |
| `src/engine.js` | modify | the new expedition fields; `repairExpedition`; `bankItem`; the bank and incidents applied in `simulate`; the round roll-over in `resolveTurn` |
| `src/expedition.js` | create | the exploring rules (pure UMD, `SolExpedition`) and the shared world cache |
| `lib/rooms.js` | modify | the exploring actions in `act()`, checked against the last position; positions carry the suit level and load |
| `tools/explorer.js` | create | the scripted explorer for balance runs and the plateau test |
| `tools/balance.js` | modify | every bot runs with and without exploring; the loads per round are printed |
| `src/surface-paint.js` | modify | sprites for finds, dropped loads, the hold ring and teammates' suit bars |
| `src/surface-eva.js` | create | the surface's exploring layer (browser-only, `SolEva`) |
| `src/surface.js` | modify | wires `SolEva` in: input, focus, movement, drawing, the rover, positions; `s.draw(ctx)` |
| `src/surface-map.js` | modify | minimap and map markers |
| `src/ui.js` | modify | the `exp` and `suit` hooks (solo and co-op); the Expedition panel; report lines; help item 10 |
| `src/i18n.js` | modify | every new string in English and Vietnamese |
| `src/style.css` | modify | the suit, battery and backpack HUD; the region card moves to 150 px |
| `index.html`, `sw.js` | modify | load and cache `src/expedition.js` and `src/surface-eva.js`; cache name `sol500-v3` |
| `test/worldgen-finds.test.js`, `test/expedition.test.js`, `test/explorer.test.js`, `test/surface-eva.test.js` | create | new tests |
| `test/worldgen-reach.test.js`, `test/engine.test.js`, `test/rooms.test.js`, `test/ws.test.js`, `test/sw.test.js` | modify | new and updated cases |
| spec §12, `docs/superpowers/plans/2026-10-05-sol500-m4a-followups.md`, `package.json` | modify/create | tick the M4a items, record what is deferred, version 3.3.0 (Task 8) |

Code blocks for changed files are unified diffs against `92a3894` (three lines of context). Apply them by hand or with `git apply` after normalising line endings. New files are given whole.

---

### Task 1: Worldgen — finds in every chunk

**Files:**
- Modify: `src/worldgen.js`
- Create: `test/worldgen-finds.test.js`
- Modify: `test/worldgen-reach.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces (`SolWorldgen` / `require('./worldgen.js')`):
  - `chunk(seed, cx, cy)` also returns `finds: [{ n, x, y, kind, ring, region, sub? }]`.
    - `x` and `y` are world tiles; `n` is the index.
    - `kind` is one of `FIND_KINDS = ['ice', 'metal', 'pod', 'science']`.
    - `ring` is 0 inner (≤ 20 tiles), 1 middle (≤ 40), 2 outer (≤ 80) or 3 far.
    - `region` indexes `REGIONS`.
    - `sub` exists for science sites only, and is one of `'delta'`, `'vent'`, `'meteorite'` or `'layered'`.
  - A find's id is `"<cx>,<cy>:<n>"`.
  - `RINGS = [20, 40, 80]`; `ringOf(x, y) → 0..3`.
  - Rules: finds stand on open ground, 3 tiles inside their chunk, outside the flat zone, at least 5 tiles apart (Chebyshev). A crater centre or canyon middle that a chunk owns holds an ice deposit.

- [ ] **Step 1: Write the failing tests**

Create `test/worldgen-finds.test.js`:

```js
'use strict';
// Finds in the endless world (src/worldgen.js, spec §2.4): where they stand, what kind they are, and that they never change.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/worldgen.js');

const T = W.TILE;
const ICY_GROUND = [T.CRATER_FLOOR, T.CANYON_FLOOR, T.ICE];
const REGION = Object.fromEntries(W.REGIONS.map((r, i) => [r, i]));

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
      assert.ok(f.x * f.x + f.y * f.y > (W.FLAT_RADIUS + 1) * (W.FLAT_RADIUS + 1), 'outside the flat zone');
      assert.equal(f.region, W.regionOf(c, lx, ly), 'its region is the region of its tile');
      assert.equal(f.ring, W.ringOf(f.x, f.y));
    });
  }
  assert.ok(n > 300, 'enough finds to test: ' + n);
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

test('the base has few finds nearby, more further out, and the Dune Sea has the fewest', () => {
  const perRing = [0, 0, 0, 0], perRegion = [0, 0, 0, 0, 0, 0], regionTiles = [0, 0, 0, 0, 0, 0];
  for (const { c } of chunksAround(['DENS-1', 'DENS-2', 'DENS-3', 'DENS-4', 'DENS-5', 'DENS-6', 'DENS-7', 'DENS-8'], 6)) {
    for (let i = 0; i < 1024; i++) regionTiles[W.regionOf(c, i % 32, i >> 5)]++;
    for (const f of c.finds) { perRing[f.ring]++; perRegion[f.region]++; }
  }
  const per1024 = perRegion.map((n, r) => n / regionTiles[r] * 1024);
  for (let r = 0; r < 6; r++) if (r !== REGION.dunes && regionTiles[r] > 20000) assert.ok(per1024[REGION.dunes] < per1024[r], 'the Dune Sea has fewer finds than ' + W.REGIONS[r]);
  for (let r = 0; r < 6; r++) if (regionTiles[r] > 20000) assert.ok(per1024[r] > 0.5 && per1024[r] < 2.5, W.REGIONS[r] + ': ' + per1024[r].toFixed(2) + ' finds per chunk');
  assert.ok(perRing[0] < perRing[1] && perRing[1] < perRing[2], 'more finds further out: ' + perRing);
});

// FNV-1a over a JSON string.
function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

test('a pinned hash of the finds in 400 chunks catches any change to them', () => {
  const seed = W.seedOf('PIN-FINDS');
  const parts = [];
  for (let cy = -10; cy < 10; cy++) for (let cx = -10; cx < 10; cx++) parts.push(W.chunk(seed, cx * 7, cy * 5).finds);
  const got = fnv(JSON.stringify(parts));
  // Change it only when you mean to move the finds, and say so in the commit message (saved missions remember finds by id).
  const PINNED = '0e84f5a1';
  assert.equal(got, PINNED, 'finds hash is ' + got);
});
```

Change `test/worldgen-reach.test.js` so the reachability run also checks every find:

```diff
--- a/test/worldgen-reach.test.js
+++ b/test/worldgen-reach.test.js
@@ -1,5 +1,6 @@
 'use strict';
-// Spec §1.3 and §2.3: on 300 seeds, every open tile within 128 tiles of the base can be reached on foot from the base.
+// Spec §1.3 and §2.3: on 300 seeds, every open tile within 128 tiles of the base can be reached on foot from the base,
+// and so can every find (finds only ever stand on open ground).
 // Slow (it builds 30,000 chunks), so it has its own file and runs alongside the rest of the suite.
 const test = require('node:test');
 const assert = require('node:assert/strict');
@@ -8,13 +9,15 @@ const W = require('../src/worldgen.js');
 const BUILD = 160; // build tiles −160..159: a 32-tile margin, more than the 24 tiles between canyon ramps
 const CHECK = 128; // check tiles −128..127 (256×256)
 
-test('on 300 seeds every open tile within 128 tiles of the base can be reached from the base', () => {
+test('on 300 seeds every open tile and every find within 128 tiles of the base can be reached from the base', () => {
   const size = BUILD * 2;
   const blocked = new Uint8Array(size * size), seen = new Uint8Array(size * size), queue = new Int32Array(size * size);
   for (let n = 0; n < 300; n++) {
     const seed = W.seedOf('REACH-' + n);
+    const finds = [];
     for (let cy = -BUILD / 32; cy < BUILD / 32; cy++) for (let cx = -BUILD / 32; cx < BUILD / 32; cx++) {
       const c = W.chunk(seed, cx, cy);
+      for (const f of c.finds) if (Math.abs(f.x) < CHECK && Math.abs(f.y) < CHECK) finds.push(f);
       for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
         blocked[(cy * 32 + ly + BUILD) * size + cx * 32 + lx + BUILD] = W.BLOCKING[c.tiles[ly * 32 + lx]];
       }
@@ -38,5 +41,6 @@ test('on 300 seeds every open tile within 128 tiles of the base can be reached f
       if (!blocked[i] && !seen[i]) { lost++; if (!example) example = (x - BUILD) + ',' + (y - BUILD); }
     }
     assert.equal(lost, 0, `seed REACH-${n}: ${lost} open tiles are cut off, e.g. tile ${example}`);
+    for (const f of finds) assert.equal(seen[(f.y + BUILD) * size + f.x + BUILD], 1, `seed REACH-${n}: the ${f.kind} at ${f.x},${f.y} can't be reached`);
   }
 });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/worldgen-finds.test.js test/worldgen-reach.test.js`
Expected: FAIL, because `chunk()` has no `finds` yet (`TypeError ... (reading 'forEach')`, `c.finds is not iterable`, a `JSON.parse` of `undefined`).

- [ ] **Step 3: Implement in `src/worldgen.js`**

```diff
--- a/src/worldgen.js
+++ b/src/worldgen.js
@@ -10,7 +10,9 @@
  * (−4, −2), so the HQ is at (0, 0). Nothing that blocks is ever placed within FLAT_RADIUS tiles of the HQ.
  *
  * API: seedOf(missionSeed) → uint32 · regionAt(seed, x, y) → index into REGIONS
- *      chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512) }   (32×32, row-major)
+ *      chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512), finds }   (32×32, row-major)
+ *        finds: [{ n, x, y, kind, ring, region, sub? }] in world tiles; a find's id is "<cx>,<cy>:<n>"
+ *      ringOf(x, y) → 0 inner · 1 middle · 2 outer · 3 far
  *      tileOf(chunk, lx, ly) · regionOf(chunk, lx, ly)
  *      featuresNear(seed, x0, y0, x1, y1) → { canyons, craters, mesas } touching that tile box (inclusive)
  *      hash(seed, a, b, c) → uint32 · unit(h) → [0, 1) · noise(seed, salt, x, y, size) → [0, 1]
@@ -314,6 +316,61 @@
     return NONE;
   }
 
+  // ---------- finds (spec §2.4): darts thrown inside the chunk, 3 tiles from its edges ----------
+  // A chunk places its own finds without looking at its neighbours. Every find stands on open ground, and the reachability
+  // test proves all open ground near the base is connected, so every find can be reached on foot.
+  const RINGS = [20, 40, 80];                   // inner ≤ 20 < middle ≤ 40 < outer ≤ 80 < far, in tiles from the HQ
+  const FIND_KINDS = ['ice', 'metal', 'pod', 'science'];
+  const FIND_DARTS = 24, FIND_EDGE = 3, FIND_GAP = 5;
+  const FIND_DENSITY = [1.6, 0.8, 1.6, 1.6, 1.8, 1.6]; // finds a chunk aims for, by region (the Dune Sea has few)
+  const RING_DENSITY = [0.3, 0.6, 1, 1];               // fewer finds close to the base
+  const KIND_WEIGHTS = [                             // ice, metal, pod, science, by region
+    [0, 1.5, 1.5, 0.5], [0, 1.2, 2.5, 0.35], [0, 1.5, 0, 0.75], [0, 1.5, 0, 0.75], [6, 0.6, 0, 0.35], [0, 2.25, 0, 0.35],
+  ];
+  const ICY_GROUND = new Uint8Array(32);             // ice deposits lie in crater floors and canyons in any region
+  for (const k of ['CRATER_FLOOR', 'CANYON_FLOOR', 'ICE']) ICY_GROUND[TILE[k]] = 1;
+  const SCIENCE_SUBS = [['delta', 'vent'], ['meteorite'], ['meteorite', 'layered'], ['layered', 'vent'], ['layered'], ['layered', 'meteorite']];
+
+  function ringOf(x, y) {
+    const d2 = x * x + y * y;
+    return d2 <= RINGS[0] * RINGS[0] ? 0 : d2 <= RINGS[1] * RINGS[1] ? 1 : d2 <= RINGS[2] * RINGS[2] ? 2 : 3;
+  }
+
+  // Crater floors and canyon floors hold ice: the chunk that owns a crater's centre (or a canyon's middle) puts an ice
+  // deposit there first. Then darts land at random spots.
+  function placeFinds(seed, cx, cy, tiles, regions, feats) {
+    const out = [], span = CHUNK - 2 * FIND_EDGE;
+    const x0 = cx * CHUNK, y0 = cy * CHUNK;
+    const own = (x, y) => x - x0 >= FIND_EDGE && y - y0 >= FIND_EDGE && x - x0 < CHUNK - FIND_EDGE && y - y0 < CHUNK - FIND_EDGE;
+    const spots = feats.craters.map(c => [c.x, c.y])
+      .concat(feats.canyons.map(k => [Math.floor((k.pts[1][0] + k.pts[2][0]) / 2), Math.floor((k.pts[1][1] + k.pts[2][1]) / 2)]));
+    for (const [x, y] of spots) {
+      if (!own(x, y) || inFlat(x, y)) continue;
+      const n = (y - y0) * CHUNK + (x - x0);
+      if (!ICY_GROUND[tiles[n]]) continue;
+      out.push({ n: out.length, x, y, kind: 'ice', ring: ringOf(x, y), region: (regions[n >> 1] >> ((n & 1) * 4)) & 15 });
+    }
+    for (let i = 0; i < FIND_DARTS; i++) {
+      const h = hash(seed, cx, cy, 500 + i);
+      const lx = FIND_EDGE + (h % span), ly = FIND_EDGE + ((h >>> 8) % span), n = ly * CHUNK + lx;
+      const x = cx * CHUNK + lx, y = cy * CHUNK + ly;
+      if (inFlat(x, y)) continue;
+      const code = tiles[n];
+      if (BLOCKING[code] || code === TILE.BASE) continue;
+      const r = (regions[n >> 1] >> ((n & 1) * 4)) & 15, ring = ringOf(x, y);
+      if (unit(hash(seed, cx, cy, 540 + i)) >= FIND_DENSITY[r] * RING_DENSITY[ring] / FIND_DARTS) continue;
+      if (out.some(f => Math.abs(f.x - x) < FIND_GAP && Math.abs(f.y - y) < FIND_GAP)) continue;
+      const w = KIND_WEIGHTS[r].slice();
+      if (ICY_GROUND[code]) w[0] += 6;
+      let pick = unit(hash(seed, cx, cy, 580 + i)) * (w[0] + w[1] + w[2] + w[3]), k = 0;
+      while (k < 3 && pick >= w[k]) { pick -= w[k]; k++; }
+      const f = { n: out.length, x, y, kind: FIND_KINDS[k], ring, region: r };
+      if (k === 3) f.sub = SCIENCE_SUBS[r][(h >>> 16) % SCIENCE_SUBS[r].length];
+      out.push(f);
+    }
+    return out;
+  }
+
   // ---------- chunks ----------
   function chunk(seed, cx, cy) {
     const x0 = cx * CHUNK, y0 = cy * CHUNK, w = CHUNK + 2;
@@ -341,7 +398,7 @@
       else t = ground(seed, r, x, y);
       tiles[i] = t;
     }
-    return { cx, cy, tiles, regions };
+    return { cx, cy, tiles, regions, finds: placeFinds(seed, cx, cy, tiles, regions, feats) };
   }
 
   const tileOf = (c, lx, ly) => c.tiles[ly * CHUNK + lx];
@@ -351,7 +408,7 @@
   }
 
   return {
-    CHUNK, TILE, NONE, BLOCKING, SPEED, REGIONS, BASE_RECT, FLAT_RADIUS, DIRS16,
-    seedOf, hash, unit, noise, regionAt, chunk, tileOf, regionOf, featuresNear,
+    CHUNK, TILE, NONE, BLOCKING, SPEED, REGIONS, BASE_RECT, FLAT_RADIUS, DIRS16, RINGS, FIND_KINDS,
+    seedOf, hash, unit, noise, regionAt, chunk, tileOf, regionOf, featuresNear, ringOf,
   };
 });
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/worldgen-finds.test.js test/worldgen.test.js test/worldgen-reach.test.js`
Expected:
- PASS (7 + 14 + 1). The world hash is still `4f1ff5dc` and the finds hash is `0e84f5a1`.
- The reach run takes about 8 s.
- The chunk build time is still well under 4 ms: about 0.2 ms a chunk in the dry run, finds included.

Then `npm test`: **235** pass.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen.js test/worldgen-finds.test.js test/worldgen-reach.test.js
git commit -m "feat(world): finds in every chunk: ice, metal-rich rock, cargo pods and science sites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Engine — the bank, the advance and repaired saves

**Files:**
- Modify: `src/data.js`, `src/engine.js`
- Modify: `test/engine.test.js` (one updated test and nine new ones)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - In `SolData`:
    - `EXPEDITION`: `{ suit, drain: { sprint, rover, icy }, baseZone, reach, pack, packRover, hold: { load, survey, pickup, revive }, canister: { suit, o2 }, reviveSuit, collapse: { health, morale }, roverHome, roverRange, maxDrops }`;
    - `FINDS`: `{ ice, metal, pod, science }`, giving the loads by ring and what each load gives;
    - `SKILLS`: `{ scientist, engineer, biologist, medic }`.
  - In `SolEngine`:
    - `newExpedition()` adds `suits: {}`, `collapsed: {}`, `benched: []`, `rover: null` and `roverDriven: 0`.
    - `repairExpedition(x) → x`, repaired field by field (a new one if `x` isn't an object). `upgradeMission` uses it, and chooses the pilot again if the saved one isn't in the crew.
    - `bankItem(bank, crewId, item, late)` adds an item `{ kind, res, amount, region, … }` to `bank[res]`. It sums into `bank.lines` per crew member, kind, resource, region and `late`; each line is `{ crewId, kind, res, region, amount, loads, late }`.
    - `simulate` (so `forecast` and `resolveTurn` too) first adds `expedition.banked` to the stocks and science, and applies each collapse: the recorded `incidents`, plus every co-op crew member still in `collapsed`.
    - `report.expedition = { got: { water, materials, spares, food, o2, science, morale }, lines, incidents } | null`.
    - `resolveTurn` then rolls the round over:
      - backpacks are banked for the next round, marked `late`;
      - a collapsed co-op crew member's load becomes a drop `{ id: '<turn>:<crewId>', x, y, items }` instead (at most `maxDrops`, the oldest go first);
      - `banked`, `incidents`, `collapsed`, `benched`, `suits` and `refills` are reset, and so is `roverDriven` (to 0);
      - a driven rover (`{ driver }`) goes back to its bay (`null`); a parked one stays.

- [ ] **Step 1: Write the failing tests**

In `test/engine.test.js`, update the shape test and append the new tests:

```diff
--- a/test/engine.test.js
+++ b/test/engine.test.js
@@ -611,7 +611,8 @@ test("a new mission has an empty exploring state and, in solo play, the player's
   assert.deepEqual(s.expedition.revealed, {});
   assert.deepEqual(s.expedition.regions, []);
   assert.deepEqual(Object.keys(s.expedition).sort(),
-    ['banked', 'beacons', 'carried', 'drops', 'goals', 'incidents', 'kits', 'landmarks', 'refills', 'regions', 'revealed', 'sites', 'stats', 'structures', 'v']);
+    ['banked', 'beacons', 'benched', 'carried', 'collapsed', 'drops', 'goals', 'incidents', 'kits', 'landmarks', 'refills', 'regions',
+      'revealed', 'rover', 'roverDriven', 'sites', 'stats', 'structures', 'suits', 'v']);
   assert.equal(calm().pilot, null, 'no pilot unless one is chosen (co-op seats choose their own)');
   assert.throws(() => E.createMission({ seed: 'PILOT-0', loadout: kit(), events: false, pilot: 'kai' }), /pilot/, 'kai is not in a crew of 4');
   assert.throws(() => E.createMission({ seed: 'PILOT-0', loadout: kit(), events: false, pilot: 'nobody' }), /pilot/);
@@ -667,3 +668,136 @@ test('saves from before v3 get the exploring state and a pilot when they load',
   assert.equal(E.upgradeMission(null), null);
   assert.equal(E.resolveTurn(up, E.defaultPlan(up)).state.status, 'active', 'an upgraded save plays on');
 });
+
+// ---------- exploring: the bank and the advance (M4a) ----------
+
+const ICE = { kind: 'ice', res: 'water', amount: 40, id: '3,1:0', region: 4 };
+const METAL = { kind: 'metal', res: 'materials', amount: 40, id: '2,2:1', region: 0 };
+const SURVEY = { kind: 'science', res: 'science', amount: 35, id: '2,2:2', region: 0, sub: 'delta' };
+
+test('delivered finds count when the round advances, and the report lists them per crew member, find and region', () => {
+  const plain = calm();
+  const s = calm();
+  E.bankItem(s.expedition.banked, 'minh', ICE);
+  E.bankItem(s.expedition.banked, 'minh', ICE);
+  E.bankItem(s.expedition.banked, 'minh', METAL);
+  E.bankItem(s.expedition.banked, 'diego', SURVEY);
+  const a = E.resolveTurn(plain, E.defaultPlan(plain));
+  const b = E.resolveTurn(s, E.defaultPlan(s));
+  assert.equal(Math.round(b.state.resources.water - a.state.resources.water), 80);
+  assert.equal(Math.round(b.state.resources.materials - a.state.resources.materials), 40);
+  assert.equal(Math.round(b.state.science - a.state.science), 35);
+  assert.deepEqual(b.report.expedition.got, { water: 80, materials: 40, spares: 0, food: 0, o2: 0, science: 35, morale: 0 });
+  assert.deepEqual(b.report.expedition.lines, [
+    { crewId: 'minh', kind: 'ice', res: 'water', region: 4, amount: 80, loads: 2, late: false },
+    { crewId: 'minh', kind: 'metal', res: 'materials', region: 0, amount: 40, loads: 1, late: false },
+    { crewId: 'diego', kind: 'science', res: 'science', region: 0, amount: 35, loads: 1, late: false },
+  ]);
+  assert.deepEqual(b.state.expedition.banked, { water: 0, materials: 0, spares: 0, food: 0, o2: 0, science: 0, morale: 0, lines: [] }, 'spent');
+  assert.equal(E.resolveTurn(b.state, E.defaultPlan(b.state)).report.expedition.lines.length, 0, 'counted once');
+});
+
+test('the forecast includes the bank, so a delivery shows in the HUD before the round advances', () => {
+  const s = calm();
+  const before = E.forecast(s, E.defaultPlan(s)).delta.water;
+  E.bankItem(s.expedition.banked, 'lena', ICE);
+  assert.equal(Math.round(E.forecast(s, E.defaultPlan(s)).delta.water - before), 40);
+});
+
+test('a load still in a backpack is banked at the start of the next round and marked late', () => {
+  const s = calm();
+  s.expedition.carried = { lena: [ICE, METAL] };
+  const r1 = E.resolveTurn(s, E.defaultPlan(s));
+  assert.deepEqual(r1.state.expedition.carried, {});
+  assert.equal(r1.report.expedition.lines.length, 0, 'nothing delivered this round');
+  assert.equal(r1.state.expedition.banked.water, 40);
+  assert.equal(r1.state.expedition.banked.materials, 40);
+  assert.ok(r1.state.expedition.banked.lines.every(l => l.late && l.crewId === 'lena'));
+  const r2 = E.resolveTurn(r1.state, E.defaultPlan(r1.state));
+  assert.equal(r2.report.expedition.got.water, 40, 'counted one round late');
+});
+
+test('a collapse outside costs that astronaut 20 health and the crew 3 morale at the advance, once', () => {
+  const plain = calm(), s = calm();
+  for (const m of [plain, s]) { m.crew[1].health = 70; m.morale = 60; }
+  s.expedition.incidents = [{ crewId: 'minh', kind: 'collapse' }];
+  const a = E.resolveTurn(plain, E.defaultPlan(plain)), b = E.resolveTurn(s, E.defaultPlan(s));
+  assert.equal(Math.round(a.state.crew[1].health - b.state.crew[1].health), 20);
+  assert.equal(Math.round(a.state.morale - b.state.morale), 3);
+  assert.deepEqual(b.report.expedition.incidents, [{ crewId: 'minh', kind: 'collapse' }]);
+  assert.deepEqual(b.state.expedition.incidents, [], 'spent');
+});
+
+test('in co-op an astronaut still collapsed at the advance counts as a collapse and leaves the load where they fell', () => {
+  const s = E.createMission({ seed: 'COOP-X', loadout: kit(), events: false, coop: true });
+  s.crew[2].health = 50;
+  const plain = JSON.parse(JSON.stringify(s));
+  s.expedition.collapsed = { diego: { x: 900, y: -640 } };
+  s.expedition.carried = { diego: [ICE, SURVEY], minh: [METAL] };
+  const a = E.resolveTurn(plain, E.defaultPlan(plain)), b = E.resolveTurn(s, E.defaultPlan(s));
+  assert.equal(Math.round(a.state.crew[2].health - b.state.crew[2].health), 20);
+  assert.deepEqual(b.report.expedition.incidents, [{ crewId: 'diego', kind: 'collapse' }]);
+  assert.deepEqual(b.state.expedition.drops, [{ id: '0:diego', x: 900, y: -640, items: [ICE, SURVEY] }]);
+  assert.equal(b.state.expedition.banked.materials, 40, "minh's load is banked as usual");
+  assert.equal(b.state.expedition.banked.water, 0, "diego's load is not");
+  assert.deepEqual(b.state.expedition.collapsed, {});
+});
+
+test('everyone starts the next round at the base with a full suit; a driven rover comes home, a parked one stays', () => {
+  const s = calm();
+  Object.assign(s.expedition, { suits: { lena: 12 }, benched: ['minh'], rover: { driver: 'lena' } });
+  const next = E.resolveTurn(s, E.defaultPlan(s)).state.expedition;
+  assert.deepEqual(next.suits, {});
+  assert.deepEqual(next.benched, []);
+  assert.equal(next.rover, null);
+  const p = calm();
+  p.expedition.rover = { x: 3200, y: 640 };
+  assert.deepEqual(E.resolveTurn(p, E.defaultPlan(p)).state.expedition.rover, { x: 3200, y: 640 });
+});
+
+test('a mission keeps at most maxDrops dropped loads, the oldest going first', () => {
+  const s = E.createMission({ seed: 'DROPS', loadout: kit(), events: false, coop: true });
+  s.expedition.drops = Array.from({ length: D.EXPEDITION.maxDrops }, (_, i) => ({ id: 'old' + i, x: 0, y: 0, items: [ICE] }));
+  s.expedition.collapsed = { lena: { x: 64, y: 64 } };
+  s.expedition.carried = { lena: [METAL] };
+  const drops = E.resolveTurn(s, E.defaultPlan(s)).state.expedition.drops;
+  assert.equal(drops.length, D.EXPEDITION.maxDrops);
+  assert.equal(drops[0].id, 'old1');
+  assert.equal(drops[drops.length - 1].id, '0:lena');
+});
+
+test('bankItem ignores unknown resources and treats a bad amount as zero', () => {
+  const bank = E.newExpedition().banked;
+  E.bankItem(bank, 'lena', { kind: 'ice', res: 'gold', amount: 9, region: 0 });
+  E.bankItem(bank, 'lena', { kind: 'ice', res: 'morale', amount: 9, region: 0 });
+  E.bankItem(bank, 'lena', { kind: 'ice', res: 'water', amount: -5, region: 0 });
+  E.bankItem(bank, 'lena', null);
+  assert.equal(bank.water, 0);
+  assert.equal(bank.morale, 0);
+  assert.equal(bank.lines.length, 1);
+});
+
+test('a saved exploring state with missing or malformed fields is repaired field by field', () => {
+  const m = calm();
+  m.pilot = 'nobody';
+  m.expedition = {
+    v: 2, revealed: [], sites: 'x', carried: null, regions: ['plains'], drops: {}, rover: 7, suits: [], kits: 'two',
+    banked: { water: 'a', science: 12, lines: 5 },
+  };
+  const up = E.upgradeMission(m, {});
+  const x = up.expedition;
+  assert.deepEqual(x.revealed, {});
+  assert.deepEqual(x.sites, {});
+  assert.deepEqual(x.carried, {});
+  assert.deepEqual(x.regions, ['plains'], 'good fields are kept');
+  assert.deepEqual(x.drops, []);
+  assert.equal(x.rover, null);
+  assert.deepEqual(x.suits, {});
+  assert.equal(x.kits, 0);
+  assert.equal(x.banked.water, 0);
+  assert.equal(x.banked.science, 12);
+  assert.deepEqual(x.banked.lines, []);
+  assert.deepEqual(x.collapsed, {}, 'fields a v3.2 save never had are added');
+  assert.equal(up.pilot, 'lena', 'a pilot who is not in the crew is chosen again');
+  assert.deepEqual(E.upgradeMission(calm(), {}).expedition, E.newExpedition(), 'a good one is untouched');
+});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/engine.test.js`
Expected: FAIL:
- the shape test, on the missing keys;
- `E.bankItem is not a function`;
- `D.EXPEDITION` undefined.

- [ ] **Step 3: Implement**

`src/data.js` (it is LF on disk):

```diff
--- a/src/data.js
+++ b/src/data.js
@@ -228,6 +228,36 @@
       grades: [['S', 1400], ['A', 1200], ['B', 1000], ['C', 800]],
     },
 
+    // Exploring (spec §3). Seconds are real time on the surface; distances are world tiles (the HQ is tile 0, 0).
+    EXPEDITION: {
+      suit: 150,                // a full suit: seconds outside the base zone, per crew member per round
+      drain: { sprint: 2, rover: 0.5, icy: 1.1 }, // drain factors: sprinting, driving the rover, the cold Icy Plains
+      baseZone: 2,              // tiles around the HQ either way: the suit pauses here and finds are delivered here
+      reach: 1.5,               // tiles of slack on every action checked against a position
+      pack: 3, packRover: 8,    // loads you can carry on foot and in the rover
+      hold: { load: 3, survey: 5, pickup: 3, revive: 4 }, // seconds of holding E
+      canister: { suit: 45, o2: 30 }, // an O₂ canister: +45 s of suit now, or +30 kg of base O₂ if carried home
+      reviveSuit: 30,           // a revived crew member stands up with this much suit
+      collapse: { health: 20, morale: 3 }, // an empty suit outside: lost at the next advance
+      roverHome: 6,             // a rover left within this many tiles of the HQ goes back to its bay
+      roverRange: 400,          // tiles the rover's battery drives per round (it recharges overnight)
+      maxDrops: 40,             // dropped loads kept in the mission (the oldest go first)
+    },
+    // What one load of each find gives (spec §3.1). Arrays run inner, middle, outer, far (worldgen RINGS).
+    FINDS: {
+      ice: { loads: [3, 4, 5, 6], res: 'water', kg: 40 },
+      metal: { loads: [3, 4, 4, 5], res: 'materials', kg: 40 },
+      pod: { loads: [3, 3, 3, 3], food: 60 },   // each load: a spare kit, 60 kg of food or an O₂ canister
+      science: { loads: [1, 1, 1, 1], science: [20, 35, 60, 80], craters: 1.5 },
+    },
+    // Role skills on the map (spec §3.3): factors on how long you hold E, and the scientist's extra science.
+    SKILLS: {
+      scientist: { science: 0.5, scienceBonus: 1.5 },
+      engineer: { metal: 0.5, pod: 0.5 },
+      biologist: { ice: 0.5, sight: 16 },
+      medic: { revive: 0.5 },
+    },
+
     ACHIEVEMENTS: ['first_sol', 'sol500', 'full_crew', 'revived', 'storm_survivor', 'closed_loop',
       'green_thumb', 'lead_apron', 'builder', 'fortress', 'scrapper', 'self_reliant', 'explorer',
       'grade_s', 'lightweight', 'flare_dodger', 'oxygen_hero', 'team_player'],
```

`src/engine.js`:

```diff
--- a/src/engine.js
+++ b/src/engine.js
@@ -9,6 +9,8 @@
  *     crew: [{ id, role, name, health, dose, status: 'active'|'down'|'dead', downTurns, revives, grounded, harm }],
  *     science, totals, depot: { drops, incoming: [{ kind, eta }] }, schedule, events, pending, history, log
  *   v3: pilot (solo: the crew member you walk as; null in co-op), expedition (exploring state, see newExpedition) }
+ *   Exploring: what the crew delivers is banked in expedition.banked and added when the round advances (applyExpedition);
+ *   the rules for collecting and carrying finds live in src/expedition.js.
  *
  * Plan (the player's decisions for one turn):
  *   { jobs: { crewId: job }, modulesOn: { type: bool }, rations: 'full'|'reduced', habMode: 'normal'|'austerity',
@@ -216,15 +218,59 @@
   }
 
   // ---------- mission ----------
-  // The exploring state (spec §4). M3 uses `revealed` (the shared fog) and `regions`; M4 fills in the rest.
+  // The exploring state (spec §4). M3 uses `revealed` (the shared fog) and `regions`. M4a adds the finds:
+  //   sites { findId: loadsLeft } (touched finds only) · carried { crewId: [item] } · drops [{ id, x, y, items }] (world px)
+  //   banked { water, materials, spares, food, o2, science, morale, lines } (added at the next advance)
+  //   incidents [{ crewId, kind }] · stats { crewId: { finds: { kind: loads } } }
+  //   suits { crewId: seconds left } (missing = full) · collapsed { crewId: { x, y } } (co-op, waiting for a revive)
+  //   benched [crewId] (solo: collapsed, back at the base for the rest of the round) · rover: null at its bay,
+  //   { x, y } parked out on the map, or { driver } while someone drives it · roverDriven: tiles driven this round.
+  // An item is { kind, res, amount, id, region } (+ sub for a survey, canister: true for an O₂ canister).
+  const BANK_RES = ['water', 'materials', 'spares', 'food', 'o2', 'science', 'morale'];
+  function freshBank() {
+    const b = { lines: [] };
+    for (const k of BANK_RES) b[k] = 0;
+    return b;
+  }
   function newExpedition() {
     return {
       v: 2, revealed: {}, sites: {}, structures: {}, landmarks: {}, regions: [], beacons: [], kits: 0, refills: {},
-      carried: {}, drops: [], banked: { water: 0, materials: 0, spares: 0, food: 0, o2: 0, science: 0, morale: 0, lines: [] },
-      goals: [], incidents: [], stats: {},
+      carried: {}, drops: [], banked: freshBank(), goals: [], incidents: [], stats: {},
+      suits: {}, collapsed: {}, benched: [], rover: null, roverDriven: 0,
     };
   }
 
+  // Missing or malformed fields (an old save, a hand-edited one) are replaced with fresh ones, so the rules never
+  // meet the wrong type. Returns the repaired expedition (a new one if it wasn't an object at all).
+  function repairExpedition(x) {
+    const fresh = newExpedition();
+    if (!x || typeof x !== 'object' || Array.isArray(x)) return fresh;
+    const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
+    for (const k of Object.keys(fresh)) {
+      const want = fresh[k], have = x[k];
+      let ok;
+      if (Array.isArray(want)) ok = Array.isArray(have);
+      else if (want === null) ok = have === null || isMap(have);
+      else if (typeof want === 'object') ok = isMap(have);
+      else ok = typeof have === typeof want && Number.isFinite(have);
+      if (!ok) x[k] = want;
+    }
+    for (const k of BANK_RES) if (!Number.isFinite(x.banked[k])) x.banked[k] = 0;
+    if (!Array.isArray(x.banked.lines)) x.banked.lines = [];
+    return x;
+  }
+
+  // Adds one item to a bank. Report lines are summed per crew member, find kind, resource and region; `late` marks
+  // items banked from a backpack at the start of the next round (spec §3.1).
+  function bankItem(bank, crewId, item, late) {
+    if (!item || !BANK_RES.includes(item.res) || item.res === 'morale') return;
+    const amount = Math.max(0, Number(item.amount) || 0);
+    bank[item.res] += amount;
+    const line = bank.lines.find(l => l.crewId === crewId && l.kind === item.kind && l.res === item.res && l.region === item.region && l.late === !!late);
+    if (line) { line.amount += amount; line.loads += 1; }
+    else bank.lines.push({ crewId, kind: item.kind, res: item.res, region: item.region, amount, loads: 1, late: !!late });
+  }
+
   function buildState(loadout, seed, eventsOn, level, size) {
     const difficulty = difficultyOf(level);
     const crewSize = crewSizeOf(size);
@@ -301,9 +347,9 @@
   // walking as if they are still alive, otherwise the first active (then the first living) crew member.
   function upgradeMission(m, opts) {
     if (!m || typeof m !== 'object') return m;
-    const fresh = newExpedition();
-    if (!m.expedition || typeof m.expedition !== 'object') m.expedition = fresh;
-    else for (const k of Object.keys(fresh)) if (m.expedition[k] == null) m.expedition[k] = fresh[k];
+    m.expedition = repairExpedition(m.expedition);
+    // A pilot who isn't in the crew (a hand-edited save) is chosen again, the same way as for an old save.
+    if (m.pilot != null && !(m.crew || []).some(c => c.id === m.pilot)) m.pilot = undefined;
     if (m.pilot === undefined) {
       const controlId = opts && opts.controlId;
       const alive = c => c.status !== 'dead';
@@ -506,6 +552,8 @@
       production: {}, consumption: {}, delta: {}, crew: [], power: null, science: 0,
       started: [], completed: [], revived: [], downs: [], deaths: [], requested: null,
     };
+    // Exploring: what the crew delivered this round, and what went wrong outside, count before anything else.
+    report.expedition = applyExpedition(s);
     const living = s.crew.filter(c => c.status !== 'dead');
     const n = living.length;
     const workers = s.crew.filter(isActive);
@@ -898,6 +946,53 @@
     return { state: s, report };
   }
 
+  // The bank goes into the base's stocks; each collapse outside (recorded, or a co-op crew member still waiting for a
+  // revive) costs that astronaut health and the crew morale. Returns what the report shows.
+  function applyExpedition(s) {
+    const x = s.expedition;
+    if (!x || !x.banked) return null;
+    const got = {};
+    for (const k of BANK_RES) got[k] = Math.max(0, Number(x.banked[k]) || 0);
+    for (const k of ['water', 'materials', 'spares', 'food', 'o2']) s.resources[k] += got[k];
+    s.science += got.science;
+    s.morale = clamp(s.morale + got.morale, 0, 100);
+    const incidents = (x.incidents || []).map(i => ({ crewId: i.crewId, kind: i.kind }));
+    for (const id of Object.keys(x.collapsed || {})) incidents.push({ crewId: id, kind: 'collapse' });
+    for (const inc of incidents) {
+      const c = s.crew.find(k => k.id === inc.crewId);
+      if (!c || c.status !== 'active') continue;
+      c.health = clamp(c.health - D.EXPEDITION.collapse.health, 0, 100);
+      s.morale = clamp(s.morale - D.EXPEDITION.collapse.morale, 0, 100);
+    }
+    return { got, lines: (x.banked.lines || []).map(l => Object.assign({}, l)), incidents };
+  }
+
+  // After a round: the bank and the incidents are spent; what is still in a backpack is banked for the next round (a
+  // one-round delay), except that a co-op astronaut still collapsed outside leaves their load where they fell. Everyone
+  // starts the next round at the base with a full suit, and the rover comes home with whoever was driving it.
+  function rollExpedition(s, endedTurn) {
+    const x = s.expedition;
+    if (!x) return;
+    const next = freshBank();
+    for (const crewId of Object.keys(x.carried || {})) {
+      const items = x.carried[crewId];
+      if (!Array.isArray(items) || !items.length) continue;
+      const spot = (x.collapsed || {})[crewId];
+      if (spot) x.drops.push({ id: endedTurn + ':' + crewId, x: spot.x, y: spot.y, items });
+      else for (const it of items) bankItem(next, crewId, it, true);
+    }
+    while (x.drops.length > D.EXPEDITION.maxDrops) x.drops.shift();
+    x.banked = next;
+    x.carried = {};
+    x.incidents = [];
+    x.collapsed = {};
+    x.benched = [];
+    x.suits = {};
+    x.refills = {};
+    x.roverDriven = 0;
+    if (x.rover && x.rover.driver) x.rover = null;
+  }
+
   function runway(s, report) {
     const perSol = k => report.delta[k] / D.TURN_SOLS;
     const out = {};
@@ -966,6 +1061,7 @@
 
   function resolveTurn(state, plan) {
     const { state: s, report } = simulate(state, plan, true);
+    rollExpedition(s, s.turn);
     s.turn += 1;
     s.sol += D.TURN_SOLS;
 
@@ -1139,6 +1235,6 @@
     summarizeLoadout, validateLoadout, loadoutMass, normalizeLoadout,
     shielding, seasonAt, newMissionCode, rng, activeCount, independenceOf,
     buildSpots, touchesBase, canBuild, canRequest, difficultyOf, crewSizeOf, budgetFor, referenceKit, nextPlan,
-    newExpedition, upgradeMission,
+    newExpedition, upgradeMission, repairExpedition, bankItem,
   };
 });
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/engine.test.js`. Expected: PASS (72).
Then `npm test`: **244** pass.

- [ ] **Step 5: Commit**

```bash
git add src/data.js src/engine.js test/engine.test.js
git commit -m "feat(engine): deliveries are banked and count at the advance; collapses cost health; old saves are repaired

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The exploring rules — `src/expedition.js`

**Files:**
- Create: `src/expedition.js`, `test/expedition.test.js`

**Interfaces:**
- Consumes: `W.chunk().finds`, `W.seedOf`, `W.hash`, `W.REGIONS`, `W.BASE_RECT` (Task 1); `D.EXPEDITION`, `D.FINDS`, `D.SKILLS`, `E.bankItem`, `E.activeCount` (Task 2).
- Produces (`SolExpedition` / `require('./expedition.js')`):
  - **The common rule:** every action returns `{ error }` without changing anything, or changes `mission.expedition` in place and returns `{ ok: true, … }`. Positions are world pixels `{ x, y }`.
  - **Lookups:**
    - `findById(m, id)` → the find plus `{ id, cx, cy, left }`, or `null`. Only the canonical spelling of an id is accepted.
    - `findsIn(m, cx, cy)`, `loadsLeft(m, find, id)`, `itemFor(m, find, load, role)`, `bay(m)` (the rover bay's centre, or `null`).
    - `holdSeconds(kind | 'pickup' | 'revive', role)`, `capacity(m, crewId)` (3, or 8 while driving), `inBaseZone(pos, slack)`.
    - `suitOf(m, crewId)` (missing = full) and `setSuit(m, crewId, s)`: clamped to [0, 150], ignored while collapsed.
    - `roverLeft(m)` and `setRoverDriven(m, crewId, tiles)`: the driver only, and the value only goes up.
    - `cacheSize()`.
  - **Actions and their errors:**
    - `collect(m, crewId, id, pos)` → `{ ok, item, left }`. Errors: `badPhase`, `noCrew`, `notActive`, `collapsed`, `benched`, `badPos`, `noFind`, `tooFar` (beyond 1.5 tiles), `empty`, `full`.
    - `deliver(m, crewId, pos)` → `{ ok, items }`. Errors: `notAtBase` (the base zone plus 1.5 tiles), `empty`.
    - `useCanister(m, crewId)` → `{ ok, suit }`. Error: `noCanister`.
    - `pickUp(m, crewId, dropId, pos)` → `{ ok, items, left }`. Errors: `noDrop`, `tooFar`, `full`.
    - `collapse(m, crewId, pos)`. Error: `atBase`.
      - Solo: → `{ ok, benched: true }`. An incident is recorded, the load drops at the spot and the crew member is benched.
      - Co-op: → `{ ok, waiting: true }`, with `collapsed[crewId] = { x, y }`.
      - Either way the suit is set to 0, and a rover being driven parks at the spot.
    - `revive(m, crewId, targetId, pos)`. Errors: `solo`, `notCollapsed`, `tooFar`. The target gets 30 s of suit.
    - `board(m, crewId, pos)`. Errors: `noRover`, `taken`, `flat`, `tooFar` (2 tiles of the bay or the parked rover).
    - `park(m, crewId, pos)` → `{ ok, home }`. Error: `notDriving`. The rover goes back to its bay within 6 tiles of the HQ, otherwise it stays at `pos`.

- [ ] **Step 1: Write the failing tests**

Create `test/expedition.test.js`:

```js
'use strict';
// The exploring rules (src/expedition.js, spec §3): collecting, carrying, delivering, the suit, collapses and the rover.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');

const T = 64;
const KIT = { solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, spares: 3, materials: 1, food: 6, o2: 3, water: 3 };
const ROVER_KIT = Object.assign({}, KIT, { rover: 1, reactor: 0, solar: 6 });
const solo = (seed, kit) => E.createMission({ seed: seed || 'EXP-1', loadout: kit || KIT, events: false, pilot: 'minh' });
const coop = seed => E.createMission({ seed: seed || 'EXP-1', loadout: KIT, events: false, coop: true });
const snap = m => JSON.stringify(m.expedition);
// The centre of a tile, in world pixels: where you stand to work on a find.
const at = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });
const HOME = at(0, 1);

// The first find of a kind (and optional test) near the base, with its id and how many loads it starts with.
function first(m, kind, ok) {
  for (let r = 1; r < 6; r++) for (let cy = -r; cy < r; cy++) for (let cx = -r; cx < r; cx++) {
    for (const f of X.findsIn(m, cx, cy)) {
      if (f.kind !== kind || (ok && !ok(f))) continue;
      return X.findById(m, cx + ',' + cy + ':' + f.n);
    }
  }
  throw new Error('no ' + kind + ' near the base');
}

test('the rover passes the mass budget in the kit these tests use', () => {
  assert.ok(E.validateLoadout(ROVER_KIT, 'commander', 4).ok);
});

test('collecting takes one load into your backpack and leaves one less at the find', () => {
  const m = solo();
  const f = first(m, 'ice');
  assert.equal(f.left, D.FINDS.ice.loads[f.ring]);
  const r = X.collect(m, 'minh', f.id, at(f.x, f.y));
  assert.equal(r.ok, true);
  assert.deepEqual(r.item, { kind: 'ice', id: f.id, region: f.region, res: 'water', amount: 40 });
  assert.deepEqual(m.expedition.carried.minh, [r.item]);
  assert.equal(m.expedition.sites[f.id], f.left - 1);
  assert.equal(X.findById(m, f.id).left, f.left - 1);
  assert.deepEqual(m.expedition.stats.minh, { finds: { ice: 1 } });
});

test('you have to stand by the find: 1.5 tiles of slack, no more', () => {
  const m = solo(), f = first(m, 'metal');
  assert.equal(X.collect(m, 'minh', f.id, { x: (f.x + 0.5) * T + 1.4 * T, y: (f.y + 0.5) * T }).ok, true);
  const before = snap(m);
  assert.equal(X.collect(m, 'minh', f.id, { x: (f.x + 0.5) * T + 1.6 * T, y: (f.y + 0.5) * T }).error, 'tooFar');
  assert.equal(snap(m), before, 'a refused action changes nothing');
});

test('a find has exactly one id: odd spellings, made-up finds and bad positions are refused without changes', () => {
  const m = solo(), f = first(m, 'metal');
  const before = snap(m);
  const [cx, cy] = [f.cx, f.cy];
  for (const id of ['0' + cx + ',' + cy + ':' + f.n, cx + ',' + cy + ':0' + f.n, cx + ',' + cy + ':99', 'x', '', null, '1,2,3:0']) {
    assert.equal(X.collect(m, 'minh', id, at(f.x, f.y)).error, 'noFind', String(id));
  }
  if (cx === 0) assert.equal(X.collect(m, 'minh', '-0,' + cy + ':' + f.n, at(f.x, f.y)).error, 'noFind');
  assert.equal(X.collect(m, 'minh', f.id, { x: NaN, y: 0 }).error, 'badPos');
  assert.equal(X.collect(m, 'minh', f.id, null).error, 'badPos');
  assert.equal(X.collect(m, 'nobody', f.id, at(f.x, f.y)).error, 'noCrew');
  assert.equal(snap(m), before);
});

test('a find runs out, and the backpack holds 3 loads on foot', () => {
  const m = solo(), f = first(m, 'ice', g => D.FINDS.ice.loads[g.ring] >= 4);
  for (let i = 0; i < 3; i++) assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).ok, true);
  assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).error, 'full');
  assert.equal(X.capacity(m, 'minh'), 3);
  m.expedition.carried.minh = [];
  while (X.findById(m, f.id).left > 0) X.collect(m, 'minh', f.id, at(f.x, f.y)), m.expedition.carried.minh = [];
  assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).error, 'empty');
});

test('a survey gives science by distance, half again in the Crater Field and half again for the scientist', () => {
  const m = solo('EXP-SCI');
  const f = first(m, 'science');
  const base = D.FINDS.science.science[f.ring] * (W.REGIONS[f.region] === 'craters' ? 1.5 : 1);
  assert.equal(X.itemFor(m, f, 0, 'biologist').amount, Math.round(base));
  assert.equal(X.itemFor(m, f, 0, 'scientist').amount, Math.round(base * 1.5));
  assert.equal(X.itemFor(m, f, 0, 'biologist').sub, f.sub);
});

test("a cargo pod's loads are fixed by the mission code, whoever opens it, and include all three kinds", () => {
  const kinds = new Set();
  for (let s = 0; s < 6; s++) {
    const a = solo('POD-' + s), b = solo('POD-' + s);
    const f = first(a, 'pod');
    const got = (m, crew) => { const out = []; for (let i = 0; i < 3; i++) { out.push(X.collect(m, crew, f.id, at(f.x, f.y)).item.res); } return out; };
    const ra = got(a, 'minh'), rb = got(b, 'lena');
    assert.deepEqual(ra, rb);
    ra.forEach(k => kinds.add(k));
  }
  assert.deepEqual([...kinds].sort(), ['food', 'o2', 'spares']);
});

test('the role skills shorten holding E', () => {
  assert.equal(X.holdSeconds('ice', 'engineer'), 3);
  assert.equal(X.holdSeconds('ice', 'biologist'), 1.5);
  assert.equal(X.holdSeconds('metal', 'engineer'), 1.5);
  assert.equal(X.holdSeconds('pod', 'engineer'), 1.5);
  assert.equal(X.holdSeconds('science', 'medic'), 5);
  assert.equal(X.holdSeconds('science', 'scientist'), 2.5);
  assert.equal(X.holdSeconds('revive', 'commander'), 4);
  assert.equal(X.holdSeconds('revive', 'medic'), 2);
  assert.equal(X.holdSeconds('pickup', 'engineer'), 3);
});

test('delivering at the base banks your whole backpack; it only works in the base zone', () => {
  const m = solo(), f = first(m, 'metal');
  X.collect(m, 'minh', f.id, at(f.x, f.y));
  X.collect(m, 'minh', f.id, at(f.x, f.y));
  assert.equal(X.deliver(m, 'minh', at(5, 0)).error, 'notAtBase');
  assert.equal(X.deliver(m, 'minh', at(3, 0)).ok, true, '2 tiles from the HQ, plus 1.5 tiles of slack');
  assert.deepEqual(m.expedition.carried.minh, []);
  assert.equal(m.expedition.banked.materials, 80);
  assert.deepEqual(m.expedition.banked.lines, [{ crewId: 'minh', kind: 'metal', res: 'materials', region: f.region, amount: 80, loads: 2, late: false }]);
  assert.equal(X.deliver(m, 'minh', HOME).error, 'empty');
  assert.equal(X.inBaseZone(at(2, -2)), true);
  assert.equal(X.inBaseZone(at(3, 0)), false);
  assert.equal(X.inBaseZone(at(-3, 0), 1.5), true);
});

test('an O₂ canister gives 45 s of suit now, never more than a full suit', () => {
  const m = solo();
  m.expedition.carried.minh = [{ kind: 'pod', res: 'o2', amount: 30, canister: true, id: '1,1:0', region: 0 }, { kind: 'pod', res: 'food', amount: 60, id: '1,1:0', region: 0 }];
  m.expedition.suits.minh = 20;
  assert.deepEqual(X.useCanister(m, 'minh'), { ok: true, suit: 65 });
  assert.equal(m.expedition.carried.minh.length, 1);
  assert.equal(X.useCanister(m, 'minh').error, 'noCanister');
  m.expedition.carried.minh.push({ kind: 'pod', res: 'o2', amount: 30, canister: true, id: '1,1:0', region: 0 });
  m.expedition.suits.minh = 140;
  assert.equal(X.useCanister(m, 'minh').suit, D.EXPEDITION.suit);
});

test('solo: an empty suit counts as a collapse at once, the load stays where you fell and you sit out the round', () => {
  const m = solo(), f = first(m, 'metal');
  X.collect(m, 'minh', f.id, at(f.x, f.y));
  const load = m.expedition.carried.minh[0];
  assert.equal(X.collapse(m, 'minh', HOME).error, 'atBase', 'the suit never runs out at the base');
  const spot = at(f.x, f.y);
  assert.deepEqual(X.collapse(m, 'minh', spot), { ok: true, benched: true });
  const x = m.expedition;
  assert.deepEqual(x.incidents, [{ crewId: 'minh', kind: 'collapse' }]);
  assert.deepEqual(x.drops, [{ id: '0:minh', x: Math.round(spot.x), y: Math.round(spot.y), items: [load] }]);
  assert.deepEqual(x.carried.minh, []);
  assert.deepEqual(x.benched, ['minh']);
  assert.equal(X.suitOf(m, 'minh'), 0);
  assert.equal(X.collect(m, 'minh', f.id, spot).error, 'benched');
  assert.equal(X.collapse(m, 'minh', spot).error, 'benched', 'only once');
});

test('co-op: a collapsed crew member waits; a crewmate standing by revives them with 30 s of suit', () => {
  const m = coop(), spot = at(30, 4);
  m.expedition.carried.diego = [{ kind: 'ice', res: 'water', amount: 40, id: '0,0:0', region: 0 }];
  assert.deepEqual(X.collapse(m, 'diego', spot), { ok: true, waiting: true });
  assert.deepEqual(m.expedition.collapsed.diego, { x: Math.round(spot.x), y: Math.round(spot.y) });
  assert.deepEqual(m.expedition.incidents, [], 'nothing recorded yet');
  assert.equal(m.expedition.carried.diego.length, 1, 'still carrying it');
  assert.equal(X.revive(m, 'lena', 'diego', at(33, 4)).error, 'tooFar');
  assert.equal(X.revive(m, 'diego', 'diego', spot).error, 'collapsed');
  assert.equal(X.revive(m, 'lena', 'minh', spot).error, 'notCollapsed');
  assert.deepEqual(X.revive(m, 'lena', 'diego', at(31, 4)), { ok: true });
  assert.deepEqual(m.expedition.collapsed, {});
  assert.equal(X.suitOf(m, 'diego'), 30);
  assert.equal(X.revive(solo(), 'lena', 'minh', spot).error, 'solo');
});

test('a dropped load can be picked up again, as much as fits', () => {
  const m = solo();
  const items = [1, 2, 3, 4].map(i => ({ kind: 'metal', res: 'materials', amount: 40, id: '2,0:' + i, region: 0 }));
  m.expedition.drops = [{ id: '3:lena', x: 2000, y: 640, items }];
  m.expedition.carried.minh = [items[0]];
  assert.equal(X.pickUp(m, 'minh', '3:lena', { x: 2200, y: 640 }).error, 'tooFar');
  assert.equal(X.pickUp(m, 'minh', 'nope', { x: 2000, y: 640 }).error, 'noDrop');
  const r = X.pickUp(m, 'minh', '3:lena', { x: 2010, y: 650 });
  assert.equal(r.items.length, 2);
  assert.equal(r.left, 2);
  assert.equal(m.expedition.carried.minh.length, 3);
  m.expedition.carried.minh = [];
  X.pickUp(m, 'minh', '3:lena', { x: 2000, y: 640 });
  assert.deepEqual(m.expedition.drops, [], 'an emptied drop is gone');
});

test('the rover: one driver at a time, 8 loads, parked where you get out or back in its bay at the outpost', () => {
  const m = solo('EXP-ROVER', ROVER_KIT);
  const bay = X.bay(m);
  assert.ok(bay, 'the rover has a bay');
  assert.equal(X.board(m, 'minh', { x: bay.x + 3 * T, y: bay.y }).error, 'tooFar');
  assert.deepEqual(X.board(m, 'minh', bay), { ok: true });
  assert.equal(X.board(m, 'lena', bay).error, 'taken');
  assert.equal(X.capacity(m, 'minh'), 8);
  assert.equal(X.park(m, 'lena', bay).error, 'notDriving');
  assert.deepEqual(X.park(m, 'minh', at(40, -12)), { ok: true, home: false });
  assert.deepEqual(m.expedition.rover, { x: Math.round(at(40, -12).x), y: Math.round(at(40, -12).y) });
  assert.equal(X.capacity(m, 'minh'), 3);
  assert.equal(X.board(m, 'lena', bay).error, 'tooFar', 'it is not in its bay any more');
  assert.deepEqual(X.board(m, 'lena', at(40, -11)), { ok: true });
  assert.deepEqual(X.park(m, 'lena', at(2, 3)), { ok: true, home: true });
  assert.equal(m.expedition.rover, null);
  m.modules.rover.broken = 1;
  assert.equal(X.board(m, 'minh', bay).error, 'noRover');
  assert.equal(X.board(solo(), 'minh', HOME).error, 'noRover', 'no rover in the kit');
});

test('collapsing while driving leaves the rover where you fell', () => {
  const m = solo('EXP-ROVER', ROVER_KIT);
  X.board(m, 'minh', X.bay(m));
  X.collapse(m, 'minh', at(50, 50));
  assert.deepEqual(m.expedition.rover, { x: Math.round(at(50, 50).x), y: Math.round(at(50, 50).y) });
});

test('the suit level a game reports is kept between empty and full, and ignored while collapsed', () => {
  const m = coop();
  X.setSuit(m, 'lena', 87.5);
  assert.equal(X.suitOf(m, 'lena'), 87.5);
  X.setSuit(m, 'lena', 900);
  assert.equal(X.suitOf(m, 'lena'), D.EXPEDITION.suit);
  X.setSuit(m, 'lena', -4);
  assert.equal(X.suitOf(m, 'lena'), 0);
  X.setSuit(m, 'lena', 'abc');
  assert.equal(X.suitOf(m, 'lena'), 0);
  X.setSuit(m, 'nobody', 5);
  assert.equal(m.expedition.suits.nobody, undefined);
  X.collapse(m, 'minh', at(30, 0));
  X.setSuit(m, 'minh', 100);
  assert.equal(X.suitOf(m, 'minh'), 0);
  assert.equal(X.suitOf(m, 'amara'), D.EXPEDITION.suit, 'a full suit when nothing was reported');
});

test('nobody acts once the mission is over or while down', () => {
  const m = solo(), f = first(m, 'metal');
  m.crew[1].status = 'down';
  assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).error, 'notActive');
  m.crew[1].status = 'active';
  m.status = 'lost';
  assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).error, 'badPhase');
});

test('the shared world cache never holds more than 256 chunks', () => {
  const m = solo('EXP-CACHE');
  for (let i = 0; i < 300; i++) X.findsIn(m, i, -i);
  assert.ok(X.cacheSize() <= 256);
});

test("the rover's battery drives 400 tiles a round; it only counts up, and a flat rover can't be boarded", () => {
  const m = solo('EXP-ROVER', ROVER_KIT);
  const bay = X.bay(m);
  assert.equal(X.roverLeft(m), D.EXPEDITION.roverRange);
  X.setRoverDriven(m, 'minh', 50);
  assert.equal(m.expedition.roverDriven, 0, 'only the driver reports it');
  X.board(m, 'minh', bay);
  X.setRoverDriven(m, 'minh', 120.5);
  assert.equal(X.roverLeft(m), D.EXPEDITION.roverRange - 120.5);
  X.setRoverDriven(m, 'minh', 30);
  assert.equal(m.expedition.roverDriven, 120.5, 'never goes down');
  X.setRoverDriven(m, 'minh', 9999);
  assert.equal(X.roverLeft(m), 0);
  X.park(m, 'minh', bay);
  assert.equal(X.board(m, 'lena', bay).error, 'flat');
  const next = E.resolveTurn(m, E.defaultPlan(m)).state;
  assert.equal(next.expedition.roverDriven, 0, 'recharged overnight');
  assert.deepEqual(X.board(next, 'lena', X.bay(next)), { ok: true });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/expedition.test.js`
Expected: FAIL with `Cannot find module '../src/expedition.js'`.

- [ ] **Step 3: Implement**

Create `src/expedition.js`:

```js
/*
 * SOL 500 — exploring (spec §3, §4): the rules for finds, the backpack, the suit, collapses and the rover.
 * Pure (no DOM): the server runs it for co-op and ui.js runs it for solo play, so both play by the same rules.
 *
 * Every action first checks the mission, the crew member and the world (built here from the mission code), and
 * returns { error } without changing anything; otherwise it changes mission.expedition in place and returns
 * { ok: true, ... }. Positions are world pixels { x, y } (64 px a tile, the HQ tile's corner at 0, 0): the numbers
 * the surface draws with and the network sends. The mission state is described at newExpedition in src/engine.js.
 *
 * API: findById(m, id) → the find plus { id, cx, cy, left } or null · findsIn(m, cx, cy) · loadsLeft(m, find)
 *      holdSeconds(kind, role) · capacity(m, crewId) · inBaseZone(pos, slack) · suitOf(m, crewId) · setSuit(m, crewId, s)
 *      collect(m, crewId, findId, pos) · deliver(m, crewId, pos) · useCanister(m, crewId) · pickUp(m, crewId, dropId, pos)
 *      collapse(m, crewId, pos) · revive(m, crewId, targetId, pos) · board(m, crewId, pos) · park(m, crewId, pos)
 *      roverLeft(m) → tiles the rover can still drive this round · setRoverDriven(m, crewId, tiles) (the driver's game)
 *      cacheSize() → data chunks in the shared world cache (at most 256)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./worldgen.js'), require('./engine.js'));
  else root.SolExpedition = factory(root.SolData, root.SolWorldgen, root.SolEngine);
})(typeof self !== 'undefined' ? self : this, function (D, W, E) {
  'use strict';
  const T = 64;
  const X = D.EXPEDITION;
  const CRATERS = W.REGIONS.indexOf('craters');

  // ---------- the world: one cache of data chunks shared by every mission (and, on the server, every room) ----------
  const CACHE = 256;
  const cache = new Map(); // "<world seed>|<cx>,<cy>" → chunk, oldest first
  function chunkAt(m, cx, cy) {
    const seed = W.seedOf(m.seed), k = seed + '|' + cx + ',' + cy;
    let c = cache.get(k);
    if (c) { cache.delete(k); cache.set(k, c); return c; }
    c = W.chunk(seed, cx, cy);
    cache.set(k, c);
    if (cache.size > CACHE) cache.delete(cache.keys().next().value);
    return c;
  }
  function findsIn(m, cx, cy) { return chunkAt(m, cx, cy).finds; }

  // A find's id is "<cx>,<cy>:<n>", written exactly the way the world writes it, so one find has one id.
  const ID = /^(-?\d{1,7}),(-?\d{1,7}):(\d{1,2})$/;
  function findById(m, id) {
    const g = ID.exec(String(id));
    if (!g) return null;
    const cx = Number(g[1]), cy = Number(g[2]), n = Number(g[3]);
    if (cx + ',' + cy + ':' + n !== id) return null;
    const f = findsIn(m, cx, cy)[n];
    if (!f) return null;
    return Object.assign({ id, cx, cy, left: loadsLeft(m, f, id) }, f);
  }
  function loadsLeft(m, f, id) {
    const v = m.expedition.sites[id == null ? f.id : id];
    return Number.isFinite(v) ? v : D.FINDS[f.kind].loads[f.ring];
  }

  // ---------- small helpers ----------
  const okPos = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const dist2 = (a, x, y) => (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
  const nearPx = (pos, x, y, tiles) => dist2(pos, x, y) <= (tiles * T) * (tiles * T);
  const nearTile = (pos, tx, ty) => nearPx(pos, (tx + 0.5) * T, (ty + 0.5) * T, X.reach);
  // The base zone: the tiles within baseZone of the HQ (Chebyshev), plus `slack` tiles for a position sent a moment ago.
  function inBaseZone(pos, slack) {
    return okPos(pos) && Math.max(Math.abs(pos.x / T - 0.5), Math.abs(pos.y / T - 0.5)) <= X.baseZone + 0.5 + (slack || 0);
  }
  const crewOf = (m, id) => m.crew.find(c => c.id === id) || null;
  const pack = (x, id) => (Array.isArray(x.carried[id]) ? x.carried[id] : []);
  const driving = (x, id) => !!x.rover && x.rover.driver === id;
  function capacity(m, crewId) { return driving(m.expedition, crewId) ? X.packRover : X.pack; }
  function suitOf(m, crewId) {
    const v = m.expedition.suits[crewId];
    return Number.isFinite(v) ? v : X.suit;
  }
  // Seconds of holding E for a find (or 'pickup', 'revive'), with the role's skill (spec §3.3).
  function holdSeconds(kind, role) {
    const base = kind === 'science' ? X.hold.survey : kind === 'pickup' ? X.hold.pickup : kind === 'revive' ? X.hold.revive : X.hold.load;
    const skill = D.SKILLS[role] || {};
    return base * (skill[kind] || 1);
  }

  // The crew member may act on the map: the mission is on, they are on their feet, and their suit isn't empty.
  function able(m, crewId) {
    if (!m || m.status !== 'active' || !m.expedition) return { error: 'badPhase' };
    const c = crewOf(m, crewId);
    if (!c) return { error: 'noCrew' };
    if (c.status !== 'active') return { error: 'notActive' };
    const x = m.expedition;
    if (x.collapsed[crewId]) return { error: 'collapsed' };
    if (x.benched.includes(crewId)) return { error: 'benched' };
    return { crew: c };
  }

  // What one load of a find gives. A cargo pod's loads are fixed by the mission code, not by who opens it.
  function itemFor(m, f, load, role) {
    const F = D.FINDS[f.kind];
    const item = { kind: f.kind, id: f.id, region: f.region };
    if (f.kind === 'ice' || f.kind === 'metal') return Object.assign(item, { res: F.res, amount: F.kg });
    if (f.kind === 'science') {
      const k = (f.region === CRATERS ? F.craters : 1) * (role === 'scientist' ? D.SKILLS.scientist.scienceBonus : 1);
      return Object.assign(item, { res: 'science', amount: Math.round(F.science[f.ring] * k), sub: f.sub });
    }
    const pick = W.hash(W.seedOf(m.seed), f.x, f.y, 700 + load) % 5; // spare kits are the rarest
    if (pick === 0) return Object.assign(item, { res: 'spares', amount: 1 });
    if (pick <= 3) return Object.assign(item, { res: 'food', amount: F.food });
    return Object.assign(item, { res: 'o2', amount: X.canister.o2, canister: true });
  }
  function statsOf(x, crewId) {
    if (!x.stats[crewId] || typeof x.stats[crewId] !== 'object') x.stats[crewId] = { finds: {} };
    if (!x.stats[crewId].finds) x.stats[crewId].finds = {};
    return x.stats[crewId];
  }

  // ---------- actions ----------
  // Takes one load from a find next to you into your backpack.
  function collect(m, crewId, findId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const f = findById(m, findId);
    if (!f) return { error: 'noFind' };
    if (!nearTile(pos, f.x, f.y)) return { error: 'tooFar' };
    if (f.left <= 0) return { error: 'empty' };
    const x = m.expedition, mine = pack(x, crewId);
    if (mine.length >= capacity(m, crewId)) return { error: 'full' };
    const item = itemFor(m, f, D.FINDS[f.kind].loads[f.ring] - f.left, a.crew.role);
    x.carried[crewId] = mine.concat([item]);
    x.sites[findId] = f.left - 1;
    const st = statsOf(x, crewId);
    st.finds[f.kind] = (st.finds[f.kind] || 0) + 1;
    return { ok: true, item, left: f.left - 1 };
  }

  // Everything in your backpack goes into the round's bank; it counts when the round advances.
  function deliver(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!inBaseZone(pos, X.reach)) return { error: 'notAtBase' };
    const x = m.expedition, mine = pack(x, crewId);
    if (!mine.length) return { error: 'empty' };
    for (const it of mine) E.bankItem(x.banked, crewId, it, false);
    x.carried[crewId] = [];
    return { ok: true, items: mine };
  }

  // Breathes an O₂ canister from your backpack now: +45 s of suit (never more than a full suit).
  function useCanister(m, crewId) {
    const a = able(m, crewId);
    if (a.error) return a;
    const x = m.expedition, mine = pack(x, crewId), i = mine.findIndex(it => it && it.canister);
    if (i < 0) return { error: 'noCanister' };
    x.carried[crewId] = mine.slice(0, i).concat(mine.slice(i + 1));
    x.suits[crewId] = Math.min(X.suit, suitOf(m, crewId) + X.canister.suit);
    return { ok: true, suit: x.suits[crewId] };
  }

  // Picks up a dropped load (a collapsed crew member's), as much as your backpack takes.
  function pickUp(m, crewId, dropId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition, d = x.drops.find(k => k.id === dropId);
    if (!d) return { error: 'noDrop' };
    if (!nearPx(pos, d.x, d.y, X.reach)) return { error: 'tooFar' };
    const mine = pack(x, crewId), room = capacity(m, crewId) - mine.length;
    if (room <= 0) return { error: 'full' };
    const take = d.items.slice(0, room);
    x.carried[crewId] = mine.concat(take);
    d.items = d.items.slice(room);
    if (!d.items.length) x.drops = x.drops.filter(k => k !== d);
    return { ok: true, items: take, left: d.items.length };
  }

  // Your suit ran out outside the base zone. In co-op you wait where you fell for a crewmate to revive you; if nobody does
  // before the round advances, it counts as a collapse then. In solo nobody can come, so the collapse counts now, your load
  // stays where you fell and you are back at the base until the next round.
  function collapse(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    if (inBaseZone(pos, 0)) return { error: 'atBase' };
    const x = m.expedition, spot = { x: Math.round(pos.x), y: Math.round(pos.y) };
    x.suits[crewId] = 0;
    if (driving(x, crewId)) x.rover = { x: spot.x, y: spot.y };
    if (m.coop) {
      x.collapsed[crewId] = spot;
      return { ok: true, waiting: true };
    }
    x.incidents.push({ crewId, kind: 'collapse' });
    const mine = pack(x, crewId);
    if (mine.length) {
      x.drops.push({ id: m.turn + ':' + crewId, x: spot.x, y: spot.y, items: mine });
      while (x.drops.length > X.maxDrops) x.drops.shift();
    }
    x.carried[crewId] = [];
    x.benched.push(crewId);
    return { ok: true, benched: true };
  }

  // Co-op: stand by a collapsed crewmate and hold E. They get up with 30 s of suit and nothing is recorded.
  function revive(m, crewId, targetId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!m.coop) return { error: 'solo' };
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition, spot = Object.prototype.hasOwnProperty.call(x.collapsed, targetId) ? x.collapsed[targetId] : null;
    if (!spot) return { error: 'notCollapsed' };
    if (!nearPx(pos, spot.x, spot.y, X.reach)) return { error: 'tooFar' };
    delete x.collapsed[targetId];
    x.suits[targetId] = X.reviveSuit;
    return { ok: true };
  }

  // The rover's bay: the centre of its tile on the build grid (world pixels), or null if the base has no rover.
  function bay(m) {
    const t = m.layout.find(k => k.type === 'rover');
    return t ? { x: (t.x + W.BASE_RECT.x + 0.5) * T, y: (t.y + W.BASE_RECT.y + 0.5) * T } : null;
  }
  // Gets into the rover, at its bay or where it was parked. One driver at a time.
  function board(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition;
    if (E.activeCount(m, 'rover') <= 0) return { error: 'noRover' };
    if (x.rover && x.rover.driver) return x.rover.driver === crewId ? { ok: true } : { error: 'taken' };
    if (roverLeft(m) <= 0) return { error: 'flat' };
    const at = x.rover || bay(m);
    if (!at) return { error: 'noRover' };
    if (!nearPx(pos, at.x, at.y, X.reach + 0.5)) return { error: 'tooFar' };
    x.rover = { driver: crewId };
    return { ok: true };
  }
  // Gets out: the rover stays where you are, or goes back to its bay if you are at the outpost.
  function park(m, crewId, pos) {
    if (!m || !m.expedition) return { error: 'badPhase' };
    const x = m.expedition;
    if (!driving(x, crewId)) return { error: 'notDriving' };
    if (!okPos(pos)) return { error: 'badPos' };
    const home = nearPx(pos, 0.5 * T, 0.5 * T, X.roverHome);
    x.rover = home ? null : { x: Math.round(pos.x), y: Math.round(pos.y) };
    return { ok: true, home };
  }

  // The rover's battery: it drives roverRange tiles a round and recharges overnight (spec ruling, M4a).
  function roverLeft(m) { return Math.max(0, X.roverRange - (Number(m.expedition.roverDriven) || 0)); }
  // How far the rover has been driven this round, as the driver's game reports it. It only ever goes up.
  function setRoverDriven(m, crewId, tiles) {
    const x = m && m.expedition;
    if (!x || !driving(x, crewId) || !Number.isFinite(Number(tiles))) return;
    x.roverDriven = Math.max(Number(x.roverDriven) || 0, Math.min(X.roverRange, Number(tiles)));
  }

  // The suit level a crew member's own game reports (it is drained there, frame by frame). Kept between 0 and full;
  // ignored while they are collapsed (their suit is empty until a crewmate revives them).
  function setSuit(m, crewId, seconds) {
    const x = m && m.expedition;
    if (!x || !crewOf(m, crewId) || x.collapsed[crewId] || !Number.isFinite(Number(seconds))) return;
    x.suits[crewId] = Math.max(0, Math.min(X.suit, Number(seconds)));
  }

  return {
    findById, findsIn, loadsLeft, holdSeconds, capacity, inBaseZone, suitOf, setSuit, itemFor, bay, roverLeft, setRoverDriven,
    collect, deliver, useCanister, pickUp, collapse, revive, board, park,
    cacheSize: () => cache.size,
  };
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/expedition.test.js`. Expected: PASS (19).
Then `npm test`: **263** pass.

- [ ] **Step 5: Commit**

```bash
git add src/expedition.js test/expedition.test.js
git commit -m "feat(expedition): the exploring rules: collect, deliver, canisters, collapse and revive, the rover and its battery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Co-op — the server runs the exploring actions

**Files:**
- Modify: `lib/rooms.js`
- Modify: `test/rooms.test.js` (append), `test/ws.test.js` (one expectation)

**Interfaces:**
- Consumes: `SolExpedition` (Task 3).
- Produces:
  - **The actions:** `act()` takes `collect` `{ find }`, `deliver`, `canister`, `pickup` `{ drop }`, `collapse`, `revive` `{ target }`, `board` and `park`.
    - Each needs the `ops` phase and a seat. It runs against `room.positions[player.crewId]`, the last position the server received.
    - On success it broadcasts the room and answers `200` with the rules' result (for example `{ ok: true, item, left }`).
    - On a refusal it answers `400 { error }`.
  - **Positions:** `position()` also takes `suit` (seconds) and `driven` (tiles; the driver only).
    - When a mission is running, both are kept in it.
    - Each fanned-out position gains `suit` (whole seconds, or `null` with no mission) and `load` (how many items that crew member carries).

- [ ] **Step 1: Write the failing tests**

```diff
--- a/test/rooms.test.js
+++ b/test/rooms.test.js
@@ -404,3 +404,99 @@ test('a region found by anyone is recorded once; made-up regions are refused', (
   assert.equal(bad.status, 400);
   assert.equal(bad.body.error, 'badRegion');
 });
+
+// ---------- exploring in co-op (M4a) ----------
+
+const X = require('../src/expedition.js');
+const T = 64;
+const at = (tx, ty) => ({ x: Math.round((tx + 0.5) * T), y: Math.round((ty + 0.5) * T) });
+function firstFind(m, kind) {
+  for (let r = 1; r < 6; r++) for (let cy = -r; cy < r; cy++) for (let cx = -r; cx < r; cx++) {
+    for (const f of X.findsIn(m, cx, cy)) if (f.kind === kind) return X.findById(m, cx + ',' + cy + ':' + f.n);
+  }
+  throw new Error('no ' + kind);
+}
+
+test('co-op: collecting is checked against where the server last saw you, and everyone sees the result', () => {
+  const { R, room, guest, hc } = inMission();
+  const f = firstFind(room.mission, 'metal');
+  assert.equal(say(R, room, guest, 'collect', { find: f.id }).body.error, 'badPos', 'no position yet');
+  R.position(room, guest, at(f.x + 5, f.y));
+  assert.equal(say(R, room, guest, 'collect', { find: f.id }).body.error, 'tooFar');
+  R.position(room, guest, at(f.x, f.y));
+  const mark = hc.got.length;
+  assert.equal(say(R, room, guest, 'collect', { find: f.id }).status, 200);
+  assert.equal(room.mission.expedition.carried.minh.length, 1);
+  const frame = hc.got.slice(mark).find(m => m.type === 'room');
+  assert.equal(frame.data.mission.expedition.carried.minh.length, 1, 'the host sees the load');
+  assert.equal(frame.data.mission.expedition.sites[f.id], f.left - 1);
+  assert.equal(say(R, room, guest, 'collect', { find: 'made-up' }).body.error, 'noFind');
+});
+
+test('co-op: delivering only counts at the base, as the server sees it', () => {
+  const { R, room, guest } = inMission();
+  const f = firstFind(room.mission, 'metal');
+  R.position(room, guest, at(f.x, f.y));
+  say(R, room, guest, 'collect', { find: f.id });
+  assert.equal(say(R, room, guest, 'deliver').body.error, 'notAtBase');
+  R.position(room, guest, at(0, 2));
+  assert.equal(say(R, room, guest, 'deliver').status, 200);
+  assert.equal(room.mission.expedition.banked.materials, 40);
+});
+
+test('co-op: a collapse waits for a revive from a crewmate standing by', () => {
+  const { R, room, host, guest } = inMission();
+  R.position(room, guest, at(30, 0));
+  assert.equal(say(R, room, guest, 'collapse').status, 200);
+  assert.ok(room.mission.expedition.collapsed.minh);
+  R.position(room, host, at(36, 0));
+  assert.equal(say(R, room, host, 'revive', { target: 'minh' }).body.error, 'tooFar');
+  assert.equal(say(R, room, host, 'revive', { target: '__proto__' }).body.error, 'notCollapsed');
+  R.position(room, host, at(31, 0));
+  assert.equal(say(R, room, host, 'revive', { target: 'minh' }).status, 200);
+  assert.equal(X.suitOf(room.mission, 'minh'), 30);
+});
+
+test("positions carry each astronaut's suit level and load, and the server keeps the suit in the mission", async () => {
+  const { R, room, guest, hc } = inMission();
+  R.position(room, guest, Object.assign(at(20, 0), { suit: 88.4 }));
+  assert.equal(X.suitOf(room.mission, 'minh'), 88.4);
+  await wait(150);
+  const last = hc.got.filter(m => m.type === 'pos').at(-1).data.find(p => p.crewId === 'minh');
+  assert.equal(last.suit, 88);
+  assert.equal(last.load, 0);
+  R.position(room, guest, Object.assign(at(20, 0), { suit: 'lots' }));
+  assert.equal(X.suitOf(room.mission, 'minh'), 88.4, 'a bad value is ignored');
+});
+
+test('co-op: one driver at a time, and only the driver reports the battery', () => {
+  const R = createRooms();
+  const { room, player: host } = R.create('Host');
+  const { player: guest } = R.join(room.code, 'Guest');
+  say(R, room, host, 'claim', { crewId: 'lena' });
+  say(R, room, guest, 'claim', { crewId: 'minh' });
+  say(R, room, host, 'phase', { phase: 'manifest' });
+  const L = Object.assign({}, room.loadout, { rover: 1, waterwall: 0 });
+  say(R, room, host, 'loadout', { loadout: L });
+  assert.equal(say(R, room, host, 'launch').status, 200);
+  const bay = X.bay(room.mission);
+  R.position(room, host, bay);
+  R.position(room, guest, bay);
+  assert.equal(say(R, room, host, 'board').status, 200);
+  assert.equal(say(R, room, guest, 'board').body.error, 'taken');
+  R.position(room, guest, Object.assign({}, bay, { driven: 300 }));
+  assert.equal(room.mission.expedition.roverDriven, 0);
+  R.position(room, host, Object.assign(at(40, 0), { rover: true, driven: 120 }));
+  assert.equal(room.mission.expedition.roverDriven, 120);
+  assert.equal(say(R, room, host, 'park').status, 200);
+  assert.deepEqual(room.mission.expedition.rover, at(40, 0));
+});
+
+test('exploring actions need a mission and a seat', () => {
+  const R = createRooms();
+  const { room, player: host } = R.create('Host');
+  assert.equal(say(R, room, host, 'collect', { find: '1,1:0' }).body.error, 'badPhase');
+  const { R: R2, room: r2, host: h2 } = inMission();
+  say(R2, r2, h2, 'claim', { crewId: null });
+  assert.equal(say(R2, r2, h2, 'deliver').body.error, 'noCrew');
+});
```

```diff
--- a/test/ws.test.js
+++ b/test/ws.test.js
@@ -76,7 +76,7 @@ test('positions sent over the socket reach the other players', async () => {
     await next(gws, isRoom);
     gws.send(JSON.stringify({ t: 'pos', d: { x: 300, y: 200, dir: 'left', moving: true } }));
     const pos = await next(hws, m => m.t === 'pos' && m.d.some(p => p.crewId === 'minh'));
-    assert.deepEqual(pos.d.find(p => p.crewId === 'minh'), { crewId: 'minh', x: 300, y: 200, dir: 'left', moving: true, rover: false });
+    assert.deepEqual(pos.d.find(p => p.crewId === 'minh'), { crewId: 'minh', x: 300, y: 200, dir: 'left', moving: true, rover: false, suit: null, load: 0 });
     hws.close(); gws.close();
   } finally { srv.close(); }
 });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/rooms.test.js test/ws.test.js`
Expected: FAIL:
- the new room tests get `badAction`;
- the ws position test lacks `suit` and `load`.

- [ ] **Step 3: Implement in `lib/rooms.js`**

```diff
--- a/lib/rooms.js
+++ b/lib/rooms.js
@@ -9,6 +9,7 @@ const E = require('../src/engine.js');
 const D = require('../src/data.js');
 const F = require('../src/fog.js');
 const W = require('../src/worldgen.js');
+const X = require('../src/expedition.js');
 
 const MAX_PLAYERS = 5;
 const MAX_ROOMS = 40;
@@ -20,12 +21,28 @@ const FOG_KEYS_PER_MESSAGE = 64;
 const FOG_CHUNKS_MAX = 4096;
 const MAX_COORD = 64000000; // world pixels either way of the HQ: the world is endless, the numbers are not
 const PLAN_KEYS = ['modulesOn', 'rations', 'habMode', 'choices', 'answered', 'drainWall', 'builds', 'scrap', 'request'];
+const EXPEDITION_ACTIONS = ['collect', 'deliver', 'canister', 'pickup', 'collapse', 'revive', 'board', 'park'];
 
 const cleanName = (n, fallback) => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || fallback;
 const newId = () => crypto.randomBytes(8).toString('hex');
 const ok = () => ({ status: 200, body: { ok: true } });
 const fail = (status, error) => ({ status, body: { error } });
 
+// Exploring actions (spec §5 trust model): checked against the last position this player's game sent, and against the
+// world the server builds itself from the mission code (src/expedition.js keeps a shared cache of 256 data chunks).
+function expeditionAction(m, type, crewId, body, pos) {
+  switch (type) {
+    case 'collect': return X.collect(m, crewId, body.find, pos);
+    case 'deliver': return X.deliver(m, crewId, pos);
+    case 'canister': return X.useCanister(m, crewId);
+    case 'pickup': return X.pickUp(m, crewId, body.drop, pos);
+    case 'collapse': return X.collapse(m, crewId, pos);
+    case 'revive': return X.revive(m, crewId, body.target, pos);
+    case 'board': return X.board(m, crewId, pos);
+    default: return X.park(m, crewId, pos);
+  }
+}
+
 function createRooms(opts = {}) {
   const rooms = new Map();
   const onEvent = opts.onEvent || (() => {});
@@ -71,14 +88,21 @@ function createRooms(opts = {}) {
     fanout(room, 'room', publicRoom(room));
   }
 
-  // Astronaut positions change many times a second, so they travel in their own small, throttled message.
+  // Astronaut positions change many times a second, so they travel in their own small, throttled message. They also
+  // carry the suit level and how many loads the astronaut carries (teammates see both), and, for the rover's driver,
+  // how far it has been driven this round. The suit and the rover's battery are kept in the mission too.
   function position(room, player, body) {
     if (!player.crewId) return 'noCrew';
     const num = v => Math.max(-MAX_COORD, Math.min(MAX_COORD, Math.round(Number(v) || 0)));
+    const m = room.phase === 'ops' && room.mission && room.mission.status === 'active' ? room.mission : null;
+    if (m && body.suit != null) X.setSuit(m, player.crewId, body.suit);
+    if (m && body.driven != null) X.setRoverDriven(m, player.crewId, body.driven);
     room.positions[player.crewId] = {
       crewId: player.crewId, x: num(body.x), y: num(body.y),
       dir: ['up', 'down', 'left', 'right'].includes(body.dir) ? body.dir : 'down',
       moving: !!body.moving, rover: !!body.rover,
+      suit: m ? Math.round(X.suitOf(m, player.crewId)) : null,
+      load: m && Array.isArray(m.expedition.carried[player.crewId]) ? m.expedition.carried[player.crewId].length : 0,
     };
     if (!room.posTimer) {
       room.posTimer = setTimeout(() => {
@@ -370,6 +394,14 @@ function createRooms(opts = {}) {
       const perr = position(room, player, body);
       return perr ? fail(400, perr) : ok();
     }
+    if (EXPEDITION_ACTIONS.includes(body.type)) {
+      if (room.phase !== 'ops' || !room.mission) return fail(400, 'badPhase');
+      if (!player.crewId) return fail(400, 'noCrew');
+      const r = expeditionAction(room.mission, body.type, player.crewId, body, room.positions[player.crewId]);
+      if (r.error) return fail(400, r.error);
+      broadcast(room);
+      return { status: 200, body: r };
+    }
     const err = apply(room, player, body);
     if (err) return fail(400, err);
     if (rooms.has(room.code)) broadcast(room);
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/rooms.test.js test/ws.test.js`. Expected: PASS.
Then `npm test`: **269** pass.

- [ ] **Step 5: Commit**

```bash
git add lib/rooms.js test/rooms.test.js test/ws.test.js
git commit -m "feat(coop): the server runs the exploring actions against where it last saw you; positions carry the suit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The explorer bot and the balance runs

**Files:**
- Create: `tools/explorer.js`, `test/explorer.test.js`
- Modify: `tools/balance.js` (LF on disk)

**Interfaces:**
- Consumes: `SolExpedition` (Task 3), the engine (Task 2).
- Produces:
  - `require('./tools/explorer.js')` → `{ haulRound(mission, crewId) → { loads, seconds }, findsNear(mission) }`. Call `haulRound` before `E.resolveTurn`; it changes `mission.expedition` through the real rules.
  - `node tools/balance.js [runs]` runs every bot without and then with exploring, and prints the loads per round (`LEVELS=commander` runs one difficulty).

- [ ] **Step 1: Write the failing test**

Create `test/explorer.test.js`:

```js
'use strict';
// The balance explorer (tools/explorer.js) and spec §1.4: an endless map can't be farmed, so the haul per round levels off.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const { haulRound } = require('../tools/explorer.js');

const KIT = D.REFERENCE_KITS.commander;
const ROVER_KIT = Object.assign({}, KIT, { rover: 1, waterwall: 0 });

// Plays 20 calm rounds with the explorer out every round; returns the loads delivered in each round.
function rounds(seed, kit) {
  let s = E.createMission({ seed, loadout: kit, events: false, pilot: 'diego' });
  const loads = [];
  while (s.status === 'active') {
    const before = s.expedition.banked.lines.reduce((n, l) => n + l.loads, 0);
    const got = haulRound(s, s.pilot);
    const banked = s.expedition.banked.lines.filter(l => !l.late).reduce((n, l) => n + l.loads, 0) - before;
    assert.equal(banked, got.loads, 'what it reports is what the real rules banked');
    loads.push(got.loads);
    s = E.resolveTurn(s, E.defaultPlan(s)).state;
  }
  return loads;
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

test('on foot the haul per round is capped by one suit charge and falls off as the finds near the base run out', () => {
  for (const seed of ['FARM-1', 'FARM-2', 'FARM-3', 'FARM-4']) {
    const loads = rounds(seed, KIT);
    assert.equal(loads.length, D.TURNS);
    assert.ok(Math.max(...loads) <= 15, seed + ': at most 15 loads a round on one suit, got ' + Math.max(...loads));
    assert.ok(mean(loads.slice(15)) <= mean(loads.slice(0, 5)), seed + ': no more in the last rounds than the first: ' + loads.join(' '));
    assert.ok(mean(loads) >= 2, seed + ': exploring brings something home: ' + loads.join(' '));
  }
});

test("in the rover the battery caps the haul, and it never grows", () => {
  for (const seed of ['FARM-5', 'FARM-6']) {
    const loads = rounds(seed, ROVER_KIT);
    assert.ok(Math.max(...loads) <= 30, seed + ': at most 30 loads a round in the rover, got ' + Math.max(...loads));
    assert.ok(mean(loads.slice(15)) <= mean(loads.slice(0, 5)), seed + ': ' + loads.join(' '));
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/explorer.test.js`
Expected: FAIL with `Cannot find module '../tools/explorer.js'`.

- [ ] **Step 3: Implement**

Create `tools/explorer.js`:

```js
'use strict';
/*
 * SOL 500 — a scripted explorer for the balance runs (spec §10). Each round one crew member goes out on one suit charge,
 * walks (or drives the rover) to the nearest finds, collects them through the real rules in src/expedition.js and
 * delivers them at the base. It is a model, not a player: it moves in straight lines with a detour factor, never
 * sprints, and knows where every find within 128 tiles is. Holding E drains the suit at the walking rate (you step
 * out of the rover to work), and the rover drives at most roverRange tiles a round.
 *
 * API: haulRound(mission, crewId) → { loads, seconds } (call it before E.resolveTurn; it changes mission.expedition)
 */
const D = require('../src/data.js');
const X = require('../src/expedition.js');

const T = 64;
const FOOT = 150 / T;              // tiles a second on foot (SPEED in src/surface.js)
const ROVER = FOOT * 2.6;          // in the rover (ROVER_X)
const DETOUR = 1.25;               // paths bend around rocks, rims and canyon walls
const SPAN = 4;                    // the explorer knows the finds in chunks −4..3 both ways (±128 tiles)
const HOME = { x: 0.5, y: 1.5 };   // the tile just south of the HQ, where it delivers (tile units)

const known = new Map();           // mission code → the finds near the base, in tile units
function findsNear(m) {
  let list = known.get(m.seed);
  if (list) return list;
  list = [];
  for (let cy = -SPAN; cy < SPAN; cy++) for (let cx = -SPAN; cx < SPAN; cx++) {
    for (const f of X.findsIn(m, cx, cy)) list.push({ id: cx + ',' + cy + ':' + f.n, x: f.x + 0.5, y: f.y + 0.5, kind: f.kind });
  }
  if (known.size > 64) known.clear();
  known.set(m.seed, list);
  return list;
}
const px = p => ({ x: p.x * T, y: p.y * T });
const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * DETOUR;

function haulRound(m, crewId) {
  const c = m.crew.find(k => k.id === crewId);
  if (!c || c.status !== 'active' || m.status !== 'active') return { loads: 0, seconds: 0 };
  const x = m.expedition;
  const bay = X.bay(m);
  const rover = !!bay && !!X.board(m, crewId, bay).ok;
  const speed = rover ? ROVER : FOOT, drain = rover ? D.EXPEDITION.drain.rover : 1;
  const cap = X.capacity(m, crewId);
  let suit = D.EXPEDITION.suit, here = HOME, loads = 0, carried = 0;
  const range = rover ? X.roverLeft(m) : Infinity;
  let battery = range;
  // Loads left are read once a round and counted down here, so the nearest-find search stays cheap.
  const pool = findsNear(m).map(f => ({ f, left: X.findById(m, f.id).left })).filter(p => p.left > 0);
  const home = () => { if (carried) { X.deliver(m, crewId, px(HOME)); loads += carried; carried = 0; } };
  for (;;) {
    let best = null, bestD = Infinity;
    for (const p of pool) {
      if (p.left <= 0) continue;
      const dd = far(here, p.f);
      if (dd < bestD) { bestD = dd; best = p; }
    }
    if (!best) break;
    const hold = X.holdSeconds(best.f.kind, c.role);
    const back = far(best.f, HOME);
    if ((bestD + back) / speed * drain + hold > suit || bestD + back > battery) break;
    suit -= bestD / speed * drain + hold;
    battery -= bestD;
    here = best.f;
    if (!X.collect(m, crewId, best.f.id, px(best.f)).ok) break;
    best.left--;
    carried++;
    if (carried >= cap) {
      suit -= far(here, HOME) / speed * drain;
      battery -= far(here, HOME);
      here = HOME;
      home();
    }
  }
  if (here !== HOME) { suit -= far(here, HOME) / speed * drain; battery -= far(here, HOME); }
  home();
  if (rover) {
    X.setRoverDriven(m, crewId, (Number(x.roverDriven) || 0) + range - battery);
    X.park(m, crewId, px(HOME));
  }
  x.suits[crewId] = Math.max(0, suit);
  return { loads, seconds: D.EXPEDITION.suit - suit };
}

module.exports = { haulRound, findsNear };
```

`tools/balance.js`:

```diff
--- a/tools/balance.js
+++ b/tools/balance.js
@@ -1,9 +1,11 @@
 #!/usr/bin/env node
 // Plays many seeded missions with scripted strategies and prints success rates,
-// end causes and scores. Usage: node tools/balance.js [runs]
+// end causes and scores, each without and with exploring (tools/explorer.js).
+// Usage: node tools/balance.js [runs]   (LEVELS=commander to run one difficulty)
 'use strict';
 const E = require('../src/engine.js');
 const D = require('../src/data.js');
+const { haulRound } = require('./explorer.js');
 
 const RUNS = Number(process.argv[2]) || 1000;
 
@@ -12,6 +14,7 @@ const LOADOUTS = {
   recommended: D.RECOMMENDED,
   solarOnly: { solar: 7, battery: 4, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, lab: 1, spares: 2, materials: 1, food: 6, o2: 3, water: 3 },
   fortress: { solar: 2, battery: 1, reactor: 2, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, spares: 3, food: 6, o2: 3, water: 2 },
+  roverKit: Object.assign({}, D.REFERENCE_KITS.commander, { rover: 1, waterwall: 0 }), // a rover instead of the water wall
 };
 
 const remainingTurns = s => D.TURNS - s.turn;
@@ -97,21 +100,32 @@ function sloppyPlan(s) {
 }
 
 let DIFF = 'commander';
+const EXPLORER = 'diego'; // with exploring on, the scientist is the astronaut the player walks as
 
-function play(loadoutName, planner, seed) {
-  let s = E.createMission({ seed, loadout: LOADOUTS[loadoutName], difficulty: DIFF });
-  while (s.status === 'active') s = E.resolveTurn(s, planner(s)).state;
+// `haul` collects the loads delivered in each round (sum and missions still running), for the plateau check.
+function play(loadoutName, planner, seed, explore, haul) {
+  let s = E.createMission({ seed, loadout: LOADOUTS[loadoutName], difficulty: DIFF, pilot: explore ? EXPLORER : undefined });
+  while (s.status === 'active') {
+    if (explore) {
+      const got = haulRound(s, s.pilot);
+      haul[s.turn] = haul[s.turn] || [0, 0];
+      haul[s.turn][0] += got.loads;
+      haul[s.turn][1] += 1;
+    }
+    s = E.resolveTurn(s, planner(s)).state;
+  }
   return s;
 }
 
-function run(label, loadoutName, planner) {
+function run(label, loadoutName, planner, explore) {
   const v = E.validateLoadout(LOADOUTS[loadoutName], DIFF);
   if (!v.ok) throw new Error(label + ': ' + v.errors.join(','));
   let wins = 0, score = 0, sci = 0, deaths = 0, grounded = 0;
   const causes = {}, grades = {}, badges = {};
   let globalWins = 0, globalRuns = 0;
+  const haul = [];
   for (let i = 0; i < RUNS; i++) {
-    const s = play(loadoutName, planner, 'BAL-' + i);
+    const s = play(loadoutName, planner, 'BAL-' + i, explore, haul);
     const sc = E.scoreMission(s);
     const hadGlobal = s.schedule.some(t => t.weather === 'global');
     if (hadGlobal) globalRuns++;
@@ -128,12 +142,13 @@ function run(label, loadoutName, planner) {
     sci += s.science;
   }
   const pct = x => (100 * x / RUNS).toFixed(1) + '%';
-  console.log(`\n${label}  [${DIFF} · ${loadoutName}, ${v.mass} t]`);
+  console.log(`\n${label}${explore ? ' + explorer' : ''}  [${DIFF} · ${loadoutName}, ${v.mass} t]`);
   console.log(`  success ${pct(wins)}   global-storm missions won ${globalWins}/${globalRuns}`);
   console.log(`  avg score ${(score / RUNS).toFixed(0)}   avg science ${(sci / RUNS).toFixed(0)}   deaths/run ${(deaths / RUNS).toFixed(2)}   grounded/run ${(grounded / RUNS).toFixed(2)}`);
   console.log('  grades', JSON.stringify(grades));
   console.log('  lost', JSON.stringify(causes));
   if (process.env.BADGES) console.log('  badges', JSON.stringify(badges));
+  if (explore) console.log('  loads per round', haul.map(h => (h[0] / h[1]).toFixed(1)).join(' '));
   return wins / RUNS;
 }
 
@@ -141,11 +156,16 @@ for (const level of (process.env.LEVELS || 'cadet,commander,veteran').split(',')
   DIFF = level;
   LOADOUTS.reference = D.REFERENCE_KITS[level];
   console.log('\n==================== ' + level.toUpperCase() + ' ====================');
-  run('Careless player', 'reference', naivePlan);
-  run('Sloppy player', 'reference', sloppyPlan);
-  run('Thoughtful player', 'reference', smartPlan);
-  if (level === 'commander') {
-    run('Thoughtful player, solar-only base', 'solarOnly', smartPlan);
-    run('Thoughtful player, reactor fortress', 'fortress', smartPlan);
+  for (const explore of [false, true]) {
+    run('Careless player', 'reference', naivePlan, explore);
+    run('Sloppy player', 'reference', sloppyPlan, explore);
+    run('Thoughtful player', 'reference', smartPlan, explore);
+    if (level === 'commander') {
+      run('Thoughtful player, solar-only base', 'solarOnly', smartPlan, explore);
+      run('Thoughtful player, reactor fortress', 'fortress', smartPlan, explore);
+      run('Careless player, rover kit', 'naive', naivePlan, explore);
+      run('Sloppy player, rover kit', 'roverKit', sloppyPlan, explore);
+      run('Thoughtful player, rover kit', 'roverKit', smartPlan, explore);
+    }
   }
 }
```

- [ ] **Step 4: Run the test and the balance**

1. Run: `node --test test/explorer.test.js`. Expected: PASS (2).
2. Then `npm test`: **271** pass.
3. Then run `node tools/balance.js 1000 > balance.txt` (about 10 minutes). The numbers must match "Measured" below to within ±1.5 points.
   - **Hard targets:** the careless bot with exploring stays under 35 % at every difficulty, and the thoughtful bot stays over 70 %.
   - **Plateau:** the loads per round fall from about 8.8 to about 3.0 on foot, and from 18.9 to about 7.6 for the rover kit.
   - Paste the success lines into your report. Don't commit `balance.txt`.

- [ ] **Step 5: Commit**

```bash
git add tools/explorer.js tools/balance.js test/explorer.test.js
git commit -m "feat(balance): an explorer bot plays the real rules; every bot runs with and without exploring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The exploring layer on the surface, and sprites for finds

**Files:**
- Modify: `src/surface-paint.js`, `index.html`, `sw.js`, `test/sw.test.js`
- Create: `src/surface-eva.js`, `test/surface-eva.test.js`

**Interfaces:**
- Consumes: `SolExpedition` (Task 3), `SolWorld` (`peek`, `region`, `seen`, `chunkOf`), `SolArt.icon`.
- Produces:
  - **New sprites** in `SolPaint.sprites`: `drawFind(ctx, find, cx, cy, time)` (with a breathing glow), `drawDrop(ctx, x, y)`, `drawRing(ctx, x, y, frac)` and `drawSuitBar(ctx, x, y, frac)`.
  - **`SolEva.create(env)`**, where `env` is `{ t, hooks, crewName, home, drawRover, player }`. The API is in the file header. Behaviour:
    - The suit drains outside the base zone (×2 sprinting, ×½ in the rover unless you hold E, ×1.1 on the Icy Plains).
    - At 0 s it asks for `collapse` once; a solo answer of `benched` calls `env.home()`.
    - It delivers on entering the zone with a load, at most every 1.5 s.
    - Holding E collects, surveys, picks up or revives, and goes on while E is held.
    - It reports the suit and battery to `hooks.suit` every 2 s.
    - The HUD is `.sf-eva`.
    - Movement is blocked when collapsed, when the suit is empty outside, when benched at the zone's edge, and when the rover's battery is flat.
  - **Loading:** `index.html` loads `src/expedition.js` after `src/fog.js`, and `src/surface-eva.js` after `src/surface-map.js`. `sw.js` caches both under `sol500-v3`.

- [ ] **Step 1: Write the failing tests**

Create `test/surface-eva.test.js`:

```js
'use strict';
// Exploring on the surface (src/surface-eva.js) in a fake DOM: the suit, collapsing, delivering, holding E and moving.
// The file is a browser script, so it runs in a vm sandbox with the same globals the page gives it. What it draws is
// checked in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/data.js');
const E = require('../src/engine.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');
const SW = require('../src/surface-world.js');
const P = require('../src/surface-paint.js');

const T = 64;
function element() {
  const n = { children: [], style: {}, hidden: false, className: '', textContent: '', innerHTML: '', title: '', attrs: {} };
  n.appendChild = c => { n.children.push(c); return c; };
  n.append = (...cs) => { n.children.push(...cs); };
  n.addEventListener = () => {};
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.classList = { add: c => { n.className += ' ' + c; } };
  return n;
}
const ART = fs.readFileSync(path.join(__dirname, '..', 'src', 'art.js'), 'utf8');
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'surface-eva.js'), 'utf8');

// A surface layer for a mission; hooks run the real rules on it (as ui.js does in solo play) and record every call.
function setup(opts) {
  const o = opts || {};
  const sandbox = { SolData: D, SolWorldgen: W, SolExpedition: X, SolPaint: P, SolWorld: SW, document: { createElement: element } };
  vm.runInNewContext(ART, sandbox);
  vm.runInNewContext(SOURCE, sandbox);
  const m = o.mission || E.createMission({ seed: 'EVA-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
  const calls = [], home = [];
  const hooks = {
    exp: (type, payload, pos) => {
      calls.push({ type, payload, pos });
      const run = { collect: () => X.collect(m, 'minh', payload.find, pos), deliver: () => X.deliver(m, 'minh', pos), collapse: () => X.collapse(m, 'minh', pos) }[type];
      return Promise.resolve(run ? run() : { ok: true });
    },
    suit: () => {},
  };
  const eva = sandbox.SolEva.create({ t: k => k, hooks: () => hooks, crewName: id => id, player: () => null, home: () => home.push(1), drawRover: () => {} });
  const data = { mission: m, controlId: 'minh', lang: 'en' };
  eva.sync(data);
  const world = SW.create(m.seed);
  return { eva, m, calls, home, data, world };
}
const outside = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T, moving: false, sprinting: false, inRover: false });
const tick = (s, p, secs, focus) => { for (let i = 0; i < secs * 10; i++) s.eva.step(0.1, p, s.world, 0, focus || null); };
const flush = () => new Promise(r => setImmediate(r));
// Objects made inside the sandbox have the sandbox's prototypes, so they are compared as plain JSON.
const plain = v => JSON.parse(JSON.stringify(v));

test('the suit drains one second a second outside, pauses at the base, and twice as fast when sprinting', () => {
  const s = setup();
  tick(s, outside(0, 1), 10);
  assert.equal(s.eva.state().suit, D.EXPEDITION.suit, 'paused in the base zone');
  tick(s, outside(20, 1), 10);
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 10)) < 1e-6);
  tick(s, Object.assign(outside(20, 1), { sprinting: true }), 5);
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 20)) < 1e-6);
});

test('in the rover the suit drains at half the rate, but not while you step out to work on a find', () => {
  const s = setup();
  tick(s, Object.assign(outside(20, 1), { inRover: true }), 10);
  assert.ok(Math.abs(s.eva.state().suit - (D.EXPEDITION.suit - 5)) < 1e-6);
});

test('an empty suit outside asks for a collapse once; a solo collapse sends you home', async () => {
  const s = setup();
  const p = outside(30, 4);
  tick(s, p, D.EXPEDITION.suit + 2);
  await flush();
  const asked = s.calls.filter(c => c.type === 'collapse');
  assert.equal(asked.length, 1);
  assert.deepEqual(plain(asked[0].pos), { x: Math.round(p.x), y: Math.round(p.y) });
  assert.equal(s.home.length, 1, 'back to the base');
  s.eva.sync(s.data);
  assert.equal(s.eva.state().benched, true);
  assert.equal(s.eva.canMove(outside(0, 0), 3 * T + 40, 32), false, 'you cannot leave the base zone until the next round');
  assert.equal(s.eva.canMove(outside(0, 0), 1 * T, 32), true, 'but you can walk about inside it');
});

test('walking into the base zone with a load delivers it, once', async () => {
  const s = setup();
  s.m.expedition.carried.minh = [{ kind: 'metal', res: 'materials', amount: 40, id: '0,0:1', region: 0 }];
  tick(s, outside(1, 1), 3);
  await flush();
  assert.equal(s.calls.filter(c => c.type === 'deliver').length, 1);
  assert.equal(s.m.expedition.banked.materials, 40);
});

test('holding E for the hold time collects the find you face; moving or looking away lets go', async () => {
  const s = setup();
  let f = null;
  for (let cy = -2; cy < 2 && !f; cy++) for (let cx = -2; cx < 2 && !f; cx++) for (const g of X.findsIn(s.m, cx, cy)) if (g.kind === 'metal' && !f) f = Object.assign({ cx, cy }, g);
  s.world.get(f.cx, f.cy); // the surface keeps the chunks around you built
  const p = outside(f.x, f.y - 1);
  const focus = s.eva.focusAt((f.x + 0.5) * T, (f.y + 0.5) * T, p, s.world);
  assert.equal(focus.kind, 'find');
  assert.equal(focus.id, f.cx + ',' + f.cy + ':' + f.n);
  assert.equal(s.eva.start(focus), true);
  tick(s, p, 1, focus);
  tick(s, Object.assign({}, p, { moving: true }), 0.2, focus);
  assert.equal(s.eva.state().hold, null, 'moving lets go');
  s.eva.start(focus);
  tick(s, p, 1, null);
  assert.equal(s.eva.state().hold, null, 'looking away lets go');
  s.eva.start(focus);
  tick(s, p, X.holdSeconds('metal', 'biologist') + 0.2, focus);
  await flush();
  const asked = s.calls.filter(c => c.type === 'collect');
  assert.equal(asked.length, 1);
  assert.deepEqual(plain(asked[0].payload), { find: focus.id });
  assert.equal(s.m.expedition.carried.minh.length, 1);
});

test('a new round means a full suit again, and says so', () => {
  const s = setup();
  tick(s, outside(20, 1), 30);
  const next = E.resolveTurn(s.m, E.defaultPlan(s.m)).state;
  const look = s.eva.sync({ mission: next, controlId: 'minh', lang: 'en' });
  assert.equal(look.round, true);
  assert.equal(s.eva.state().suit, D.EXPEDITION.suit);
});

test('nobody moves on an empty suit or a flat rover battery', () => {
  const s = setup();
  const p = outside(20, 1);
  s.eva.qaSuit(0);
  assert.equal(s.eva.canMove(p, p.x + 5, p.y), false);
  s.eva.qaSuit(50);
  assert.equal(s.eva.canMove(p, p.x + 5, p.y), true);
  s.m.expedition.roverDriven = D.EXPEDITION.roverRange;
  s.eva.sync(s.data);
  assert.equal(s.eva.canMove(Object.assign({}, p, { inRover: true }), p.x + 5, p.y), false);
});
```

`test/sw.test.js`:

```diff
--- a/test/sw.test.js
+++ b/test/sw.test.js
@@ -31,8 +31,10 @@ test('every script the page loads is in the offline cache', () => {
   const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
   const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
   const scripts = [...html.matchAll(/<script src="(src\/[a-z0-9-]+\.js)"><\/script>/g)].map(m => m[1]);
-  for (const s of ['src/worldgen.js', 'src/fog.js', 'src/surface-world.js', 'src/surface-paint.js', 'src/surface-map.js']) assert.ok(scripts.includes(s), s + ' is loaded by index.html');
+  for (const s of ['src/worldgen.js', 'src/fog.js', 'src/expedition.js', 'src/surface-world.js', 'src/surface-paint.js', 'src/surface-map.js', 'src/surface-eva.js']) assert.ok(scripts.includes(s), s + ' is loaded by index.html');
+  assert.ok(scripts.indexOf('src/engine.js') < scripts.indexOf('src/expedition.js') && scripts.indexOf('src/worldgen.js') < scripts.indexOf('src/expedition.js'), 'the rules load after the engine and the world');
+  assert.ok(scripts.indexOf('src/surface-eva.js') < scripts.indexOf('src/surface.js'), 'the exploring layer loads before the surface');
   for (const s of scripts) assert.ok(sw.includes("'" + s + "'"), s + ' is cached by sw.js');
   assert.ok(scripts.indexOf('src/surface-map.js') < scripts.indexOf('src/surface.js') && scripts.indexOf('src/surface.js') < scripts.indexOf('src/ui.js'), 'load order');
-  assert.match(sw, /const CACHE = 'sol500-v2'/);
+  assert.match(sw, /const CACHE = 'sol500-v3'/);
 });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/surface-eva.test.js test/sw.test.js`
Expected: FAIL:
- `ENOENT ... src/surface-eva.js`;
- the service-worker test misses the two scripts and the new cache name.

- [ ] **Step 3: Implement**

`src/surface-paint.js`:

```diff
--- a/src/surface-paint.js
+++ b/src/surface-paint.js
@@ -538,6 +538,102 @@
     tag(x, hy - 17, name, color, a.you);
   }
 
+  // ---------- finds (spec §3.1) ----------
+  // A find on its tile, (cx, cy) = the tile's centre in world pixels; `time` makes the science flag wave.
+  const FIND_GLOW = { ice: '159,211,234', metal: '217,180,106', pod: '236,229,219', science: '111,168,255' };
+  function drawFind(ctx, f, cx, cy, time) {
+    ctx.save();
+    // A soft glow that breathes, so a find stands out from the rocks around it.
+    ctx.fillStyle = 'rgba(' + FIND_GLOW[f.kind] + ',' + (0.14 + 0.08 * Math.sin(time * 2.5 + f.x)).toFixed(3) + ')';
+    ctx.beginPath(); ctx.ellipse(cx, cy + 12, 28, 11, 0, 0, Math.PI * 2); ctx.fill();
+    ctx.fillStyle = 'rgba(0,0,0,0.28)';
+    ctx.beginPath(); ctx.ellipse(cx, cy + 14, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
+    if (f.kind === 'ice') { // pale blue crystals on a frosty patch
+      ctx.fillStyle = 'rgba(225,243,250,0.35)';
+      ctx.beginPath(); ctx.ellipse(cx, cy + 10, 24, 9, 0, 0, Math.PI * 2); ctx.fill();
+      for (const [dx, h, w] of [[-10, 18, 8], [2, 26, 10], [12, 15, 7]]) {
+        ctx.fillStyle = '#9fd3ea';
+        ctx.beginPath(); ctx.moveTo(cx + dx - w / 2, cy + 12); ctx.lineTo(cx + dx, cy + 12 - h); ctx.lineTo(cx + dx + w / 2, cy + 12); ctx.closePath(); ctx.fill();
+        ctx.fillStyle = 'rgba(255,255,255,0.75)';
+        ctx.beginPath(); ctx.moveTo(cx + dx - 1, cy + 10); ctx.lineTo(cx + dx, cy + 14 - h); ctx.lineTo(cx + dx + 1.5, cy + 10); ctx.closePath(); ctx.fill();
+      }
+    } else if (f.kind === 'metal') { // a dark rock with bright metal grains
+      ctx.fillStyle = '#3b3433';
+      ctx.beginPath(); ctx.ellipse(cx - 3, cy + 4, 18, 13, 0, 0, Math.PI * 2); ctx.fill();
+      ctx.fillStyle = '#4d4544';
+      ctx.beginPath(); ctx.ellipse(cx + 8, cy, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
+      ctx.fillStyle = '#d9b46a';
+      for (const [dx, dy] of [[-9, 0], [-2, 7], [6, -3], [11, 3], [-12, 8]]) ctx.fillRect(cx + dx, cy + dy, 3, 2);
+      ctx.fillStyle = '#c9d2da';
+      for (const [dx, dy] of [[-5, -4], [3, 2], [9, -6]]) ctx.fillRect(cx + dx, cy + dy, 2, 2);
+    } else if (f.kind === 'pod') { // a cargo pod on its side, with its torn parachute
+      ctx.strokeStyle = '#e9874a';
+      ctx.lineWidth = 2;
+      ctx.beginPath(); ctx.moveTo(cx + 10, cy + 2); ctx.quadraticCurveTo(cx + 26, cy - 14, cx + 20, cy + 12); ctx.stroke();
+      ctx.fillStyle = '#ece5db';
+      roundRect(ctx, cx - 18, cy - 6, 30, 18, 8); ctx.fill();
+      ctx.fillStyle = '#b8aea2';
+      roundRect(ctx, cx - 18, cy + 6, 30, 6, 3); ctx.fill();
+      ctx.fillStyle = '#e9874a';
+      ctx.fillRect(cx - 6, cy - 6, 5, 18);
+    } else { // a science site: an outcrop with a survey flag
+      ctx.fillStyle = f.sub === 'meteorite' ? '#2c2a2e' : '#7a5442';
+      ctx.beginPath(); ctx.ellipse(cx - 4, cy + 6, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
+      if (f.sub === 'layered' || f.sub === 'delta') {
+        ctx.strokeStyle = f.sub === 'delta' ? 'rgba(130,190,220,0.7)' : 'rgba(230,190,140,0.75)';
+        ctx.lineWidth = 2;
+        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(cx - 16, cy + 2 + k * 4); ctx.lineTo(cx + 8, cy + 3 + k * 4); ctx.stroke(); }
+      } else if (f.sub === 'vent') {
+        ctx.fillStyle = 'rgba(235,225,215,0.35)';
+        const w = Math.sin(time * 2) * 2;
+        ctx.beginPath(); ctx.ellipse(cx - 4 + w, cy - 6, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
+      }
+      ctx.strokeStyle = '#d6cec3';
+      ctx.lineWidth = 2;
+      ctx.beginPath(); ctx.moveTo(cx + 12, cy + 12); ctx.lineTo(cx + 12, cy - 22); ctx.stroke();
+      ctx.fillStyle = '#6fa8ff';
+      const wave = Math.sin(time * 3) * 2;
+      ctx.beginPath(); ctx.moveTo(cx + 12, cy - 22); ctx.lineTo(cx + 26, cy - 18 + wave); ctx.lineTo(cx + 12, cy - 13); ctx.closePath(); ctx.fill();
+    }
+    ctx.restore();
+  }
+
+  // A load someone dropped when their suit ran out: a backpack with a red tag. (x, y) in world pixels.
+  function drawDrop(ctx, x, y) {
+    ctx.save();
+    ctx.fillStyle = 'rgba(0,0,0,0.3)';
+    ctx.beginPath(); ctx.ellipse(x, y + 8, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
+    ctx.fillStyle = '#9da3a9';
+    roundRect(ctx, x - 10, y - 12, 20, 20, 4); ctx.fill();
+    ctx.fillStyle = '#7d848b';
+    roundRect(ctx, x - 7, y - 4, 14, 8, 2); ctx.fill();
+    ctx.fillStyle = '#f46e5f';
+    ctx.fillRect(x + 6, y - 16, 5, 8);
+    ctx.restore();
+  }
+
+  // How far a hold of E has got: a ring that fills clockwise. (x, y) is its centre in world pixels.
+  function drawRing(ctx, x, y, frac) {
+    ctx.save();
+    ctx.lineWidth = 5;
+    ctx.strokeStyle = 'rgba(20,14,16,0.75)';
+    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
+    ctx.strokeStyle = '#8cbcec';
+    ctx.beginPath(); ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac))); ctx.stroke();
+    ctx.restore();
+  }
+
+  // A teammate's suit level: a small bar above their name tag, from green through amber to red.
+  function drawSuitBar(ctx, x, y, frac) {
+    const f = Math.max(0, Math.min(1, frac));
+    ctx.save();
+    ctx.fillStyle = 'rgba(20,14,16,0.8)';
+    roundRect(ctx, x - 15, y, 30, 5, 2.5); ctx.fill();
+    ctx.fillStyle = f > 0.4 ? '#4fd0c4' : f > 0.15 ? '#e9a13b' : '#f46e5f';
+    roundRect(ctx, x - 15, y, 30 * f, 5, 2.5); ctx.fill();
+    ctx.restore();
+  }
+
   // Name tags are laid out after all sprites so they never pile on top of each other.
   function drawTags(ctx, tags) {
     const placed = [];
@@ -572,6 +668,6 @@
 
   return {
     IMG, PX, REGION_COLORS, tileRGB, decorFor, createPainter, drawFog,
-    sprites: { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks },
+    sprites: { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks, drawFind, drawDrop, drawRing, drawSuitBar },
   };
 });
```

Create `src/surface-eva.js`:

```js
/*
 * SOL 500 — exploring on the surface (spec §3): finds, dropped loads and the parked rover on the ground; holding E to
 * collect, survey, pick up or revive; the suit, the rover's battery and delivering at the base; and the HUD for all of
 * it. The rules live in src/expedition.js. This layer decides when to ask for them, through the ui.js hook `exp` (solo
 * play runs them on the spot, co-op sends them to the server), and draws what the mission says. Browser-only (SolEva).
 *
 * API: SolEva.create(env) → eva
 *        env: { t(key, params), hooks(), crewName(id), home(), drawRover(ctx, x, y), player() }
 *      eva.el                                       the HUD node for the surface overlay
 *      eva.sync(data) → { round, fresh }            round: a new round began; fresh: first look at this mission/seat
 *      eva.canMove(player, nx, ny) → may your astronaut step to (nx, ny)? (world px)
 *      eva.step(dt, player, world, moved, focus)    every frame: suit, battery, delivering, holds, the HUD
 *      eva.focusAt(x, y, player, world) → a focus on a find, a dropped load, a collapsed crewmate or the parked rover
 *      eva.holdable(focus) · eva.label(focus) · eva.start(focus) · eva.stop()       E / the action button
 *      eva.act(type, player) → Promise of the rules' answer (board, park) · eva.canister(player) (the button, or Q)
 *      eva.drawZone(ctx) · eva.sprites(x0, y0, x1, y1, world, time) → [{ y, draw(ctx) }] · eva.drawOver(ctx, remote)
 *      eva.marks(world, px, py) → minimap markers · eva.report() → { suit, driven } for the position message
 *      eva.roverAtBay(player) · eva.driving() · eva.collapsed(crewId) · eva.state() (play-testing)
 */
(function (root) {
  'use strict';
  const D = root.SolData, W = root.SolWorldgen, X = root.SolExpedition, P = root.SolPaint, SW = root.SolWorld, A = root.SolArt;
  const { drawFind, drawDrop, drawRing, drawSuitBar, roundRect } = P.sprites;
  const XD = D.EXPEDITION;
  const T = 64, ICY = W.REGIONS.indexOf('icy');
  const REACH = 0.9 * T;                        // how close the spot you look at must be to a find
  const COLORS = { ice: '#9fd3ea', metal: '#d9b46a', pod: '#ece5db', science: '#6fa8ff' };
  const RES_ICON = { water: 'water', materials: 'materials', food: 'food', o2: 'o2', spares: 'spares', science: 'science' };
  const QUIET = ['deliver', 'collapse', 'park'];    // no message when these are refused (they are retried or harmless)

  function create(env) {
    const t = (k, p) => env.t(k, p);
    let data = null, me = null, turn = null, wasDown = false;
    let suit = XD.suit, driven = 0, hold = null, keyHeld = false;
    let now = 0, deliverAt = -1e9, collapseAt = -1e9, reportAt = -1e9, marksAt = -1e9, marksCache = [];
    let note = null;                               // { text, cls, until }

    const mission = () => (data && data.mission) || null;
    const exp = () => mission().expedition;
    const crew = () => (mission() && me ? mission().crew.find(c => c.id === me) || null : null);
    const pack = () => (me && Array.isArray(exp().carried[me]) ? exp().carried[me] : []);
    const collapsed = id => !!(mission() && mission().expedition && mission().expedition.collapsed[id]);
    const benched = () => !!(me && exp().benched.includes(me));
    const live = () => { const m = mission(), c = crew(); return !!m && !!m.expedition && m.status === 'active' && !!c && c.status === 'active'; };
    const at = p => ({ x: Math.round(p.x), y: Math.round(p.y) });
    const near2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
    const secs = s => (Math.round(s * 10) / 10).toString();
    function say(text, cls, s) { note = { text, cls: cls || '', until: now + (s || 3) }; }

    // ---------- the HUD ----------
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const el = node('div', 'sf-eva');
    const meter = () => { const row = node('div', 'sf-suit'), k = node('span', 'k'), bar = node('span', 'bar'), fill = node('i'), v = node('b'); bar.appendChild(fill); row.append(k, bar, v); return { row, k, fill, v }; };
    const suitM = meter(), battM = meter();
    battM.row.classList.add('batt');
    const packEl = node('div', 'sf-pack');
    const canBtn = node('button', 'sf-can');
    canBtn.type = 'button';
    canBtn.addEventListener('click', () => canister(env.player && env.player()));
    const noteEl = node('p', 'sf-evanote');
    noteEl.setAttribute('role', 'status');
    el.append(suitM.row, battM.row, packEl, canBtn, noteEl);
    const shown = {};
    const text = (n, k, v) => { if (shown[k] !== v) { shown[k] = v; n.textContent = v; } };
    const prop = (k, v, set) => { if (shown[k] !== v) { shown[k] = v; set(v); } };

    function statusNote(p) {
      if (!me || !mission()) return null;
      if (collapsed(me)) return { text: t('eva.collapsedCoop'), cls: 'crit' };
      if (benched()) return { text: t('eva.benched'), cls: 'warn' };
      if (p && p.inRover && driven >= XD.roverRange) return { text: t('eva.flat'), cls: 'warn' };
      if (live() && pack().length >= X.capacity(mission(), me) && !(p && X.inBaseZone(p))) return { text: t('eva.full'), cls: '' };
      if (live() && suit <= XD.suit * 0.2 && !(p && X.inBaseZone(p))) return { text: t('eva.low'), cls: 'crit' };
      return null;
    }

    function renderHud(p) {
      const hide = !me || !mission() || !mission().expedition || mission().status !== 'active';
      prop('hide', hide, v => { el.hidden = v; });
      if (hide) return;
      const atBase = !!p && X.inBaseZone(p);
      text(suitM.k, 'sk', t('eva.suit'));
      text(suitM.v, 'sv', atBase && !benched() ? t('eva.paused', { s: Math.ceil(suit) }) : Math.ceil(suit) + ' s');
      prop('sw', (100 * suit / XD.suit).toFixed(1) + '%', v => { suitM.fill.style.width = v; });
      const f = suit / XD.suit;
      prop('sc', 'sf-suit' + (f <= 0.2 ? ' crit' : f <= 0.4 ? ' warn' : ''), v => { suitM.row.className = v; });
      const inRover = !!(p && p.inRover);
      prop('bh', !inRover, v => { battM.row.hidden = v; });
      if (inRover) {
        const left = Math.max(0, XD.roverRange - driven);
        text(battM.k, 'bk', t('eva.battery'));
        text(battM.v, 'bv', Math.floor(left) + ' ' + t('eva.tiles'));
        prop('bw', (100 * left / XD.roverRange).toFixed(1) + '%', v => { battM.fill.style.width = v; });
      }
      const items = live() || collapsed(me) ? pack() : [], cap = X.capacity(mission(), me);
      prop('pk', items.map(i => i.res + (i.canister ? '*' : '')).join(',') + '|' + cap + '|' + (shown.lang || ''), () => {
        packEl.textContent = '';
        packEl.setAttribute('aria-label', t('eva.pack', { n: items.length, m: cap }));
        for (let i = 0; i < cap; i++) {
          const it = items[i], slot = node('span', 'slot' + (it ? ' full' : ''));
          if (it) { slot.innerHTML = A.icon(RES_ICON[it.res] || 'materials', 14); slot.title = t('haul.' + it.res, { n: it.amount }); }
          packEl.appendChild(slot);
        }
      });
      prop('ch', !(live() && items.some(i => i.canister)), v => { canBtn.hidden = v; });
      text(canBtn, 'ct', t('eva.useCanister', { s: XD.canister.suit }));
      const n = note && note.until > now ? note : statusNote(p);
      text(noteEl, 'nt', n ? n.text : '');
      prop('nc', 'sf-evanote' + (n && n.cls ? ' ' + n.cls : ''), v => { noteEl.className = v; });
      prop('nh', !n, v => { noteEl.hidden = v; });
    }

    // ---------- asking the rules (through ui.js) ----------
    function act(type, p, payload) {
      const h = env.hooks();
      if (!h || !h.exp) return Promise.resolve({ error: 'net' });
      return Promise.resolve(h.exp(type, payload || {}, p ? at(p) : null)).then(r => {
        const res = r || { error: 'net' };
        if (res.error && !QUIET.includes(type)) say(t('eva.err.' + res.error), 'warn');
        return res;
      }, () => { if (!QUIET.includes(type)) say(t('eva.err.net'), 'warn'); return { error: 'net' }; });
    }

    // Breathes an O₂ canister from your backpack (the button, or Q): +45 s of suit now.
    function canister(p) {
      if (!live() || !pack().some(i => i.canister)) return;
      act('canister', p).then(r => {
        if (!r.ok) return;
        suit = Number.isFinite(r.suit) ? r.suit : Math.min(XD.suit, suit + XD.canister.suit);
        say(t('eva.breathed', { s: XD.canister.suit }), 'ok');
      });
    }

    // ---------- each new look at the mission ----------
    function sync(d) {
      data = d;
      const m = d.mission;
      if (!m || !m.expedition) return { round: false, fresh: false };
      const id = d.controlId || null;
      let round = false, fresh = false;
      if (m.turn !== turn || id !== me) {
        round = turn != null && m.turn !== turn && id === me;
        fresh = !round;
        turn = m.turn;
        me = id;
        suit = me ? X.suitOf(m, me) : XD.suit;
        driven = Number(m.expedition.roverDriven) || 0;
        hold = null;
        collapseAt = -1e9;
        wasDown = !!(me && m.expedition.collapsed[me]);
      }
      const down = !!(me && m.expedition.collapsed[me]);
      if (wasDown && !down && me) { suit = X.suitOf(m, me); say(t('eva.revived', { s: XD.reviveSuit }), 'ok', 4); }
      wasDown = down;
      if (down || benched()) suit = 0;
      driven = Math.max(driven, Number(m.expedition.roverDriven) || 0); // it only ever goes up within a round
      shown.lang = d.lang;
      return { round, fresh };
    }

    // ---------- every frame ----------
    function canMove(p, nx, ny) {
      if (!me || !mission() || !mission().expedition) return true;
      if (collapsed(me)) return false;
      const atBase = X.inBaseZone(p);
      if (benched() && atBase && !X.inBaseZone({ x: nx, y: ny })) return false; // solo: back out next round
      if (!atBase && suit <= 0) return false;
      if (p.inRover && driven >= XD.roverRange) return false;
      return true;
    }

    function step(dt, p, world, moved, focus) {
      now += dt;
      if (live()) {
        const atBase = X.inBaseZone(p);
        if (p.inRover && moved > 0) driven = Math.min(XD.roverRange, driven + moved / T);
        if (!atBase && !collapsed(me) && !benched()) {
          let k = p.inRover && !hold ? XD.drain.rover : 1;   // you step out of the rover to work
          if (p.sprinting) k *= XD.drain.sprint;
          if (world.region(Math.floor(p.x / T), Math.floor(p.y / T)) === ICY) k *= XD.drain.icy;
          suit = Math.max(0, suit - dt * k);
          if (suit <= 0 && now - collapseAt > 3) {
            collapseAt = now;
            hold = null;
            act('collapse', p).then(r => {
              if (r.benched) { env.home(); say(t('eva.collapsedSolo'), 'crit', 8); }
            });
          }
        }
        if (atBase && pack().length && now - deliverAt > 1.5) {
          deliverAt = now;
          const n = pack().length;
          act('deliver', p).then(r => { if (r.ok) say(t(n === 1 ? 'eva.delivered1' : 'eva.delivered', { n }), 'ok', 4); });
        }
        if (hold) {
          if (p.moving || !focus || focus.key !== hold.f.key) hold = null;
          else if ((hold.t += dt) >= hold.dur) finish(p);
        }
        if (now - reportAt > 2) {
          reportAt = now;
          const h = env.hooks();
          if (h && h.suit) h.suit(suit, p.inRover ? driven : null);
        }
      }
      renderHud(p);
    }

    function finish(p) {
      const f = hold.f;
      hold = null;
      const ask = f.kind === 'find' ? act('collect', p, { find: f.id })
        : f.kind === 'drop' ? act('pickup', p, { drop: f.id })
          : act('revive', p, { target: f.id });
      ask.then(r => {
        if (!r.ok) return;
        if (f.kind === 'find') say(r.item ? t('haul.' + r.item.res, { n: r.item.amount }) : t('eva.collected'), 'ok', 2);
        else if (f.kind === 'drop') say(t('eva.pickedUp'), 'ok', 2);
        else say(t('eva.revivedThem', { name: env.crewName(f.id) }), 'ok', 3);
        if (f.kind === 'find' && keyHeld && live()) hold = { f, t: 0, dur: hold0(f) }; // keep going while E is held
      });
    }

    // ---------- what you can work on ----------
    function hold0(f) {
      const role = crew() && crew().role;
      return X.holdSeconds(f.kind === 'find' ? f.find.kind : f.kind === 'drop' ? 'pickup' : 'revive', role);
    }
    const holdable = f => !!f && (f.kind === 'find' || f.kind === 'drop' || f.kind === 'revive');

    function focusAt(lx, ly, p, world) {
      if (!live() || collapsed(me) || benched()) return null;
      const m = mission(), x = exp();
      let best = null, bestD = REACH * REACH;
      const consider = (px, py, f) => {
        const d = Math.min(near2(px, py, lx, ly), near2(px, py, p.x, p.y - 8));
        if (d < bestD) { bestD = d; best = f; }
      };
      const ccx = SW.chunkOf(Math.floor(p.x / T)), ccy = SW.chunkOf(Math.floor(p.y / T));
      for (let cy = ccy - 1; cy <= ccy + 1; cy++) for (let cx = ccx - 1; cx <= ccx + 1; cx++) {
        const c = world.peek(cx, cy);
        if (!c) continue;
        for (const f of c.finds) {
          const id = cx + ',' + cy + ':' + f.n;
          if (X.loadsLeft(m, f, id) <= 0) continue;
          consider((f.x + 0.5) * T, (f.y + 0.5) * T, { kind: 'find', key: 'f:' + id, id, find: f, wx: f.x, wy: f.y, x: (f.x + 0.5) * T, y: (f.y + 0.5) * T });
        }
      }
      for (const d of x.drops) consider(d.x, d.y, { kind: 'drop', key: 'd:' + d.id, id: d.id, x: d.x, y: d.y });
      if (m.coop) for (const id of Object.keys(x.collapsed)) {
        if (id === me) continue;
        const s = x.collapsed[id];
        consider(s.x, s.y, { kind: 'revive', key: 'v:' + id, id, x: s.x, y: s.y - 10 });
      }
      if (x.rover && !x.rover.driver && !p.inRover) consider(x.rover.x, x.rover.y, { kind: 'rover', key: 'rover-parked', parked: true, x: x.rover.x, y: x.rover.y });
      return best;
    }

    function label(f) {
      const role = crew() && crew().role;
      if (f.kind === 'find') {
        const what = t('find.' + f.find.kind) + (f.find.sub ? ' · ' + t('sci.' + f.find.sub) : '');
        return t(f.find.kind === 'science' ? 'eva.survey' : 'eva.collect', { what, s: secs(X.holdSeconds(f.find.kind, role)) });
      }
      if (f.kind === 'drop') return t('eva.pickup', { s: secs(X.holdSeconds('pickup', role)) });
      if (f.kind === 'revive') return t('eva.revive', { name: env.crewName(f.id), s: secs(X.holdSeconds('revive', role)) });
      if (f.kind === 'rover') return t('sf.boardRover');
      return '';
    }

    function start(f) {
      if (!holdable(f) || !live()) return false;
      keyHeld = true;
      if (!hold || hold.f.key !== f.key) hold = { f, t: 0, dur: hold0(f) };
      return true;
    }
    function stop() { keyHeld = false; hold = null; }

    // ---------- drawing ----------
    // The base zone: where the suit pauses and loads are delivered (5 × 5 tiles around the HQ).
    function drawZone(ctx) {
      if (!mission() || !mission().expedition) return;
      const r = (XD.baseZone + 0.5) * T;
      ctx.save();
      ctx.strokeStyle = 'rgba(140,188,236,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      roundRect(ctx, T / 2 - r, T / 2 - r, 2 * r, 2 * r, 18);
      ctx.stroke();
      ctx.restore();
    }

    function sprites(x0, y0, x1, y1, world, time) {
      const out = [];
      if (!mission() || !mission().expedition) return out;
      const m = mission(), x = exp();
      const tx0 = Math.floor(x0 / T) - 1, ty0 = Math.floor(y0 / T) - 1, tx1 = Math.floor(x1 / T) + 1, ty1 = Math.floor(y1 / T) + 1;
      for (let cy = SW.chunkOf(ty0); cy <= SW.chunkOf(ty1); cy++) for (let cx = SW.chunkOf(tx0); cx <= SW.chunkOf(tx1); cx++) {
        const c = world.peek(cx, cy);
        if (!c) continue;
        for (const f of c.finds) {
          if (f.x < tx0 || f.x > tx1 || f.y < ty0 || f.y > ty1) continue;
          if (X.loadsLeft(m, f, cx + ',' + cy + ':' + f.n) <= 0) continue;
          const fx = (f.x + 0.5) * T, fy = (f.y + 0.5) * T;
          out.push({ y: fy + 12, draw: ctx => drawFind(ctx, f, fx, fy, time) });
        }
      }
      const inView = (px, py) => px > x0 - T && px < x1 + T && py > y0 - T && py < y1 + 2 * T;
      for (const d of x.drops) if (inView(d.x, d.y)) out.push({ y: d.y + 8, draw: ctx => drawDrop(ctx, d.x, d.y) });
      if (x.rover && !x.rover.driver && inView(x.rover.x, x.rover.y)) {
        const r = x.rover;
        out.push({ y: r.y + 10, draw: ctx => env.drawRover(ctx, r.x, r.y) });
      }
      return out;
    }

    // Over the fog: the hold ring, and teammates' suit bars (co-op positions carry them).
    function drawOver(ctx, remote) {
      if (hold) drawRing(ctx, hold.f.x, hold.f.y - 40, hold.t / hold.dur);
      for (const r of Object.values(remote || {})) {
        if (r.suit == null || r.suit >= XD.suit || X.inBaseZone(r)) continue;
        drawSuitBar(ctx, r.x, r.y - (r.rover ? 78 : 66), r.suit / XD.suit);
      }
    }

    // Minimap and map markers: finds you have seen (the biologist senses ice and methane vents further), dropped loads,
    // the parked rover. Rebuilt at most every 150 ms.
    function marks(world, px, py) {
      if (!mission() || !mission().expedition || !world) return [];
      if (now - marksAt < 0.15) return marksCache;
      marksAt = now;
      const m = mission(), x = exp(), out = [];
      const sniff = ((D.SKILLS[crew() && crew().role] || {}).sight) || 0;
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      for (let cy = SW.chunkOf(ty - 80); cy <= SW.chunkOf(ty + 79); cy++) for (let cx = SW.chunkOf(tx - 80); cx <= SW.chunkOf(tx + 79); cx++) {
        const c = world.peek(cx, cy);
        if (!c) continue;
        for (const f of c.finds) {
          if (X.loadsLeft(m, f, cx + ',' + cy + ':' + f.n) <= 0) continue;
          const smelt = sniff && (f.kind === 'ice' || f.sub === 'vent') && near2(f.x, f.y, tx, ty) <= sniff * sniff;
          if (smelt || world.seen(f.x, f.y)) out.push({ x: (f.x + 0.5) * T, y: (f.y + 0.5) * T, color: COLORS[f.kind] });
        }
      }
      for (const d of x.drops) out.push({ x: d.x, y: d.y, color: '#f46e5f' });
      if (x.rover && !x.rover.driver) out.push({ x: x.rover.x, y: x.rover.y, color: '#e9e2d8', square: true });
      marksCache = out;
      return out;
    }

    return {
      el, sync, canMove, step, focusAt, holdable, label, start, stop, act, canister, drawZone, sprites, drawOver, marks,
      report: () => ({ suit: Math.round(suit * 10) / 10, driven: Math.round(driven * 10) / 10 }),
      roverAtBay: p => !!mission() && !!mission().expedition && !exp().rover && !(p && p.inRover),
      driving: () => !!(me && mission() && mission().expedition && exp().rover && exp().rover.driver === me),
      collapsed,
      state: () => ({ suit, driven, hold: hold && hold.f.key, collapsed: collapsed(me), benched: !!me && !!mission() && benched(), pack: me && mission() ? pack().length : 0 }),
      qaSuit: s => { suit = Math.max(0, Math.min(XD.suit, Number(s) || 0)); }, // play-testing: jump the suit level
    };
  }

  root.SolEva = { create };
})(typeof self !== 'undefined' ? self : this);
```

`index.html`:

```diff
--- a/index.html
+++ b/index.html
@@ -25,9 +25,11 @@
 <script src="src/net.js"></script>
 <script src="src/worldgen.js"></script>
 <script src="src/fog.js"></script>
+<script src="src/expedition.js"></script>
 <script src="src/surface-world.js"></script>
 <script src="src/surface-paint.js"></script>
 <script src="src/surface-map.js"></script>
+<script src="src/surface-eva.js"></script>
 <script src="src/surface.js"></script>
 <script src="src/ui.js"></script>
 </body>
```

`sw.js`:

```diff
--- a/sw.js
+++ b/sw.js
@@ -2,12 +2,12 @@
  * SOL 500 — service worker. Caches the app shell so the installed app starts offline.
  * App files: network first (always fresh when online), cache as the fallback. LAN API calls and the admin page are never cached.
  */
-const CACHE = 'sol500-v2';
+const CACHE = 'sol500-v3';
 const SHELL = [
   './', 'index.html', 'manifest.webmanifest',
   'src/style.css', 'src/data.js', 'src/engine.js', 'src/i18n.js', 'src/art.js', 'src/charts.js',
-  'src/net.js', 'src/worldgen.js', 'src/fog.js', 'src/surface-world.js', 'src/surface-paint.js', 'src/surface-map.js',
-  'src/surface.js', 'src/ui.js',
+  'src/net.js', 'src/worldgen.js', 'src/fog.js', 'src/expedition.js', 'src/surface-world.js', 'src/surface-paint.js',
+  'src/surface-map.js', 'src/surface-eva.js', 'src/surface.js', 'src/ui.js',
   'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
 ];
 
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/surface-eva.test.js test/sw.test.js`. Expected: PASS.
Then `npm test`: **278** pass.
`surface.js` doesn't use the layer yet, so the game plays exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/surface-paint.js src/surface-eva.js test/surface-eva.test.js index.html sw.js test/sw.test.js
git commit -m "feat(surface): the exploring layer (suit, holding E, delivery and the HUD) and sprites for finds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Exploring wired into the surface, the UI and both languages

**Files:**
- Modify: `src/surface.js`, `src/surface-map.js`, `src/ui.js`, `src/i18n.js`, `src/style.css`

**Interfaces:**
- Consumes: `SolEva` and the sprites (Task 6), `SolExpedition` (Task 3), co-op actions (Task 4).
- Produces:
  - **Hooks** in `ui.js`:
    - `exp(type, payload, pos) → Promise<{ ok… } | { error }>`. Solo runs the rules on `store.mission`, then `saveSoloSoon()` and `render()`. Co-op goes through `N.act`.
    - `suit(seconds, driven)`: solo only; saved with the mission.
  - **Panel:** `expeditionPanel(s)` in the surface side panel lists what was delivered this round and what is in backpacks.
  - **Report:** lines for every delivery and every collapse.
  - **Help:** item 10 explains exploring.
  - **Positions:** `surface.js` sends `{ …, suit, driven? }` with each position.
  - **Map:** `mapState()` adds `marks`, and `surface-map.js` draws them.

- [ ] **Step 1: Wire the surface**

`src/surface.js` (this includes the `s.draw(ctx)` fix from ruling 12):

```diff
--- a/src/surface.js
+++ b/src/surface.js
@@ -10,11 +10,13 @@
  *      SolSurface.setRemote([{ crewId, x, y, dir, moving, rover }])
  *      SolSurface.mergeFog({ "<cx>,<cy>": base64 }) · SolSurface.reset() (call when a new mission starts)
  * Hooks: queueBuild, cancelBuild, toggleModule, toggleScrap, setJob, openConsole, canAdvance, advance,
- *        sendPos(pos), reveal({ key: base64 }), enterRegion(regionId), reopenRegion(regionId)
+ *        sendPos(pos), reveal({ key: base64 }), enterRegion(regionId), reopenRegion(regionId),
+ *        exp(type, payload, pos) → Promise of { ok } or { error } (exploring, see src/surface-eva.js), suit(seconds, driven)
+ * Exploring on the map (finds, the suit, the backpack, the rover's battery) is src/surface-eva.js.
  */
 (function (root) {
   'use strict';
-  const D = root.SolData, E = root.SolEngine, A = root.SolArt, W = root.SolWorldgen, SW = root.SolWorld, P = root.SolPaint, SM = root.SolMap;
+  const D = root.SolData, E = root.SolEngine, A = root.SolArt, W = root.SolWorldgen, SW = root.SolWorld, P = root.SolPaint, SM = root.SolMap, EV = root.SolEva;
   const { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks } = P.sprites;
   const T = 64;
   const BASE = W.BASE_RECT;
@@ -158,6 +160,10 @@
     };
     S.touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
     S.map = SM.create({ t: (k, p) => t(k, p), onOpen: () => S.keys.clear(), onClose: () => S.canvas.focus({ preventScroll: true }) });
+    S.eva = EV.create({
+      t: (k, p) => t(k, p), hooks: () => S.hooks, crewName: id => S.data.crewName(id), player: () => S.player, home: goHome,
+      drawRover: (ctx, x, y) => { const img = moduleImage('rover', 1); if (ready(img)) ctx.drawImage(img, x - 34, y - 52, 68, 68); },
+    });
     buildOverlay();
     bindInput();
     if (window.ResizeObserver) new ResizeObserver(resize).observe(el);
@@ -220,8 +226,11 @@
     S.regionChip.addEventListener('click', () => { if (S.region != null && S.hooks.reopenRegion) S.hooks.reopenRegion(W.REGIONS[S.region]); });
     S.debugBox = el('pre', 'sf-debug');
     S.debugBox.hidden = !S.debug;
-    o.append(S.hint, S.stamina, S.regionChip, S.map.minimap, S.prompt, S.menu, S.pad, S.btnAct, S.btnRun, S.debugBox, S.map.el);
-    S.btnAct.addEventListener('click', () => interact());
+    o.append(S.hint, S.stamina, S.regionChip, S.eva.el, S.map.minimap, S.prompt, S.menu, S.pad, S.btnAct, S.btnRun, S.debugBox, S.map.el);
+    // The action button is held for finds, like E: it acts when pressed and lets go of a hold when released.
+    S.btnAct.addEventListener('pointerdown', e => { e.preventDefault(); S.actId = e.pointerId; interact(); });
+    S.btnAct.addEventListener('click', e => { if (e.detail === 0) interact(); }); // Enter or Space on the focused button
+    const actOff = e => { if (e.pointerId !== S.actId) return; S.actId = null; S.eva.stop(); };
     // The stick and the sprint button follow their finger on the window, filtered by its pointer id: a re-render moves this
     // node into a new stage, which releases the pad's pointer capture, and the finger can then slide off or lift anywhere.
     // The pad has no move/up/cancel handlers of its own, so nothing is handled twice.
@@ -236,8 +245,8 @@
     });
     const joyEnd = e => { if (S.joy.id !== e.pointerId) return; S.joy = { x: 0, y: 0, id: null }; S.knob.style.transform = ''; };
     window.addEventListener('pointermove', e => { if (S.joy.id === e.pointerId) joyMove(e); });
-    window.addEventListener('pointerup', e => { joyEnd(e); runOff(e); });
-    window.addEventListener('pointercancel', e => { joyEnd(e); runOff(e); });
+    window.addEventListener('pointerup', e => { joyEnd(e); runOff(e); actOff(e); });
+    window.addEventListener('pointercancel', e => { joyEnd(e); runOff(e); actOff(e); });
   }
 
   function joyMove(e) {
@@ -268,6 +277,7 @@
       if (MOVE[e.code]) { S.keys.add(e.code); if (S.player) S.player.path = null; e.preventDefault(); }
       if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') S.keys.add('Shift');
       if (e.code === 'KeyE' && !e.repeat) { interact(); e.preventDefault(); }
+      if (e.code === 'KeyQ' && !e.repeat) { S.eva.canister(S.player); e.preventDefault(); }
       if (e.code === 'Escape' && S.menuOpen) { closeMenu(); e.preventDefault(); }
       if (e.code === 'KeyC' && !e.repeat && S.hooks.openConsole) S.hooks.openConsole();
       if (S.menuOpen && /^Digit[1-9]$/.test(e.code)) {
@@ -279,8 +289,9 @@
     window.addEventListener('keyup', e => {
       S.keys.delete(e.code);
       if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') S.keys.delete('Shift');
+      if (e.code === 'KeyE') S.eva.stop();
     });
-    window.addEventListener('blur', () => S.keys.clear());
+    window.addEventListener('blur', () => { S.keys.clear(); S.eva.stop(); });
     S.canvas.addEventListener('pointerdown', e => {
       if (!S.player || !S.world || S.map.isOpen()) return;
       S.canvas.focus({ preventScroll: true });
@@ -324,6 +335,17 @@
     S.camSnap = true;
   }
 
+  // A new round, or a solo collapse: your astronaut is back by the HQ, out of the rover (whoever drove it brought it home).
+  function goHome() {
+    const p = S.player;
+    if (!p) return;
+    const [x, y] = spawnPoint();
+    Object.assign(p, { x, y, dir: 'down', path: null, inRover: false, autoFocus: null, faceTo: null });
+    S.pendingAuto = null;
+    S.camSnap = true;
+    if (S.menuOpen) closeMenu();
+  }
+
   // ---------- data from ui.js ----------
   function update(data) {
     S.data = data;
@@ -334,6 +356,9 @@
     ensurePlayer();
     if (data.controlId && S.player.crewId !== data.controlId) moveToCrewmate(data.controlId);
     S.player.crewId = data.controlId;
+    const look = S.eva.sync(data);
+    if (look.round) goHome();
+    else if (look.fresh && S.eva.driving()) S.player.inRover = true; // back in the seat you left (a reload while driving)
     S.canvas.setAttribute('aria-label', t('sf.aria'));
     S.hint.textContent = t(S.touch ? 'sf.hintTouch' : 'sf.hintKeys');
     S.btnAct.setAttribute('aria-label', t('sf.interact'));
@@ -352,7 +377,10 @@
     for (const p of list || []) {
       if (!p.crewId || (S.data && p.crewId === S.data.controlId)) continue;
       const prev = S.remote[p.crewId];
-      next[p.crewId] = { x: prev ? prev.x : p.x, y: prev ? prev.y : p.y, tx: p.x, ty: p.y, dir: p.dir || 'down', moving: !!p.moving, rover: !!p.rover, phase: prev ? prev.phase : 0, at: now };
+      next[p.crewId] = {
+        x: prev ? prev.x : p.x, y: prev ? prev.y : p.y, tx: p.x, ty: p.y, dir: p.dir || 'down', moving: !!p.moving, rover: !!p.rover,
+        phase: prev ? prev.phase : 0, at: now, suit: Number.isFinite(p.suit) ? p.suit : null, load: p.load || 0,
+      };
     }
     S.remote = next;
   }
@@ -372,10 +400,11 @@
     S.time += dt;
     world();
     ensurePlayer();
-    stepPlayer(dt);
+    const moved = stepPlayer(dt);
     stepNpcs(dt);
     stepRemote(dt);
     stepFocus();
+    S.eva.step(dt, S.player, S.world, moved, S.focus);
     stream(t0);
     explore(ts);
     draw();
@@ -429,8 +458,11 @@
   }
 
   function mapState() {
-    if (!S.player) return { px: 0, py: 0, crew: [] };
-    return { px: S.player.x, py: S.player.y, crew: avatars().map(a => ({ x: a.x, y: a.y, color: a.color, you: !!a.you })) };
+    if (!S.player) return { px: 0, py: 0, crew: [], marks: [] };
+    return {
+      px: S.player.x, py: S.player.y, crew: avatars().map(a => ({ x: a.x, y: a.y, color: a.color, you: !!a.you })),
+      marks: S.eva.marks(S.world, S.player.x, S.player.y),
+    };
   }
 
   function drawDebugText() {
@@ -446,8 +478,9 @@
     return m.crew.find(c => c.id === S.data.controlId) || null;
   }
 
+  // Moves your astronaut; returns how far (world px) they moved this frame (the rover's battery counts it).
   function stepPlayer(dt) {
-    const p = S.player;
+    const p = S.player, ox = p.x, oy = p.y;
     const me = controlledCrew();
     const canMove = me && me.status === 'active';
     let vx = 0, vy = 0;
@@ -486,8 +519,10 @@
       const sp = SPEED * (sprinting ? SPRINT_X : 1) * (p.inRover ? ROVER_X : 1) * ground * S.qa.speed * Math.min(1, len);
       const stuck = hitsWall(p.x, p.y);
       const mx = p.x + nx * sp * dt, my = p.y + ny * sp * dt;
-      if (S.qa.ghost || stuck || !hitsWall(mx, p.y)) p.x = mx;
-      if (S.qa.ghost || stuck || !hitsWall(p.x, my)) p.y = my;
+      // A step is allowed if nothing blocks it and the exploring rules agree (an empty suit, a flat rover battery).
+      const ok = (x, y) => S.qa.ghost || ((stuck || !hitsWall(x, y)) && S.eva.canMove(p, x, y));
+      if (ok(mx, p.y)) p.x = mx;
+      if (ok(p.x, my)) p.y = my;
       if (Math.abs(nx) > Math.abs(ny)) p.dir = nx > 0 ? 'right' : 'left'; else p.dir = ny > 0 ? 'down' : 'up';
       p.phase += dt * sp / 26;
       S.hintUntil = Math.min(S.hintUntil, S.time + 3);
@@ -496,6 +531,7 @@
     p.sprinting = sprinting;
     S.staminaFill.style.width = p.stamina.toFixed(0) + '%';
     S.stamina.hidden = p.stamina >= 99.5 && !sprinting;
+    return Math.hypot(p.x - ox, p.y - oy);
   }
 
   function jobTarget(c, job, rnd) {
@@ -585,11 +621,13 @@
   function maybeSend(ts) {
     if (!S.hooks.sendPos || ts - S.lastSent < 110) return;
     const p = S.player;
-    const k = Math.round(p.x) + ',' + Math.round(p.y) + ',' + p.dir + ',' + p.moving + ',' + p.inRover;
+    const ev = S.eva.report();
+    const k = Math.round(p.x) + ',' + Math.round(p.y) + ',' + p.dir + ',' + p.moving + ',' + p.inRover + ',' + Math.ceil(ev.suit) + ',' + Math.floor(ev.driven);
     if (k === S.lastSentKey && ts - S.lastSent < 2000) return;
     S.lastSent = ts;
     S.lastSentKey = k;
-    S.hooks.sendPos({ x: Math.round(p.x), y: Math.round(p.y), dir: p.dir, moving: p.moving, rover: p.inRover });
+    // The suit level travels with the position (teammates see it); the driver also says how far the rover has gone.
+    S.hooks.sendPos({ x: Math.round(p.x), y: Math.round(p.y), dir: p.dir, moving: p.moving, rover: p.inRover, suit: ev.suit, driven: p.inRover ? ev.driven : undefined });
   }
 
   // ---------- what the player is looking at ----------
@@ -599,7 +637,7 @@
     const byId = id => m.crew.find(c => c.id === id);
     const color = role => A.ROLE[role] || '#ccc';
     const me = controlledCrew();
-    if (me && me.status !== 'dead') out.push({ id: me.id, role: me.role, color: color(me.role), x: S.player.x, y: S.player.y, dir: S.player.dir, phase: S.player.phase, moving: S.player.moving, you: true, down: me.status === 'down', rover: S.player.inRover });
+    if (me && me.status !== 'dead') out.push({ id: me.id, role: me.role, color: color(me.role), x: S.player.x, y: S.player.y, dir: S.player.dir, phase: S.player.phase, moving: S.player.moving, you: true, down: me.status === 'down' || S.eva.collapsed(me.id), rover: S.player.inRover });
     for (const [id, n] of Object.entries(S.npcs)) {
       const c = byId(id);
       if (!c || c.status === 'dead') continue;
@@ -608,7 +646,7 @@
     for (const [id, r] of Object.entries(S.remote)) {
       const c = byId(id);
       if (!c || c.status === 'dead') continue;
-      out.push({ id, role: c.role, color: color(c.role), x: r.x, y: r.y, dir: r.dir, phase: r.phase, moving: r.moving, remote: true, down: c.status === 'down', rover: r.rover });
+      out.push({ id, role: c.role, color: color(c.role), x: r.x, y: r.y, dir: r.dir, phase: r.phase, moving: r.moving, remote: true, down: c.status === 'down' || S.eva.collapsed(id), rover: r.rover });
     }
     return out;
   }
@@ -621,7 +659,7 @@
     const tile = m.layout.find(x => x.x === gx && x.y === gy);
     if (tile) {
       if (tile.type === 'hab') return { kind: 'hq', key: 'hq', gx, gy, wx, wy };
-      if (tile.type === 'rover') return { kind: 'rover', key: 'rover', gx, gy, wx, wy, type: 'rover' };
+      if (tile.type === 'rover') return S.eva.roverAtBay(S.player) ? { kind: 'rover', key: 'rover', gx, gy, wx, wy, type: 'rover' } : { kind: 'structure', key: 's:' + gx + ',' + gy, gx, gy, wx, wy, type: 'rover' };
       return { kind: 'structure', key: 's:' + gx + ',' + gy, gx, gy, wx, wy, type: tile.type };
     }
     const pr = m.projects.find(x => x.x === gx && x.y === gy);
@@ -648,12 +686,15 @@
     const lx = p.x + dx * 38, ly = p.y - 8 + dy * 34;
     const crew = avatars().find(a => !a.you && !a.remote && Math.hypot(a.x - lx, a.y - ly) < 30);
     if (crew) f = { kind: 'crew', key: 'c:' + crew.id, id: crew.id };
+    const ef = S.eva.focusAt(lx, ly, p, S.world); // a find, a dropped load, a crewmate down outside, the parked rover
+    if (!f) f = ef;
     if (!f) f = focusAt(Math.floor(lx / T), Math.floor(ly / T));
     if (!f || f.kind === 'empty') {
       const under = focusAt(Math.floor(p.x / T), Math.floor((p.y - 4) / T));
       if (under && (!f || under.kind !== 'empty' || !f)) f = under || f;
     }
-    if (p.inRover) f = { kind: 'rover', key: 'rover-exit', driving: true };
+    // In the rover, E gets you out, unless a find is right there: you step out to work on it and get back in.
+    if (p.inRover) f = ef && S.eva.holdable(ef) ? ef : { kind: 'rover', key: 'rover-exit', driving: true };
     const changed = (f && f.key) !== (S.focus && S.focus.key);
     S.focus = f;
     if (changed && S.menuOpen) closeMenu();
@@ -672,7 +713,7 @@
       case 'lander': return t('sf.lander');
       case 'crew': return S.data.crewName(f.id);
       case 'empty': return t('sf.buildHere') + (f.ice ? ' · ' + t('map.ice') : '');
-      default: return '';
+      default: return S.eva.label(f);
     }
   }
 
@@ -698,24 +739,36 @@
     if (!me || me.status !== 'active') return;
     if (S.menuOpen) { closeMenu(); return; }
     if (!S.focus) return;
+    if (S.eva.holdable(S.focus)) { S.eva.start(S.focus); return; }
     if (S.focus.kind === 'rover') { toggleRover(); return; }
     openMenu();
   }
 
+  // Getting in and out of the rover goes through the exploring rules: one driver at a time, it stays where you leave it
+  // (or goes back to its bay at the outpost), and its battery drives roverRange tiles a round.
   function toggleRover() {
-    const p = S.player;
+    const p = S.player, m = S.data.mission;
     if (p.inRover) {
       p.inRover = false;
-      const m = S.data.mission;
-      const bay = m.layout.find(x => x.type === 'rover');
-      refreshWorld(m);
-      if (hitsWall(p.x, p.y) && bay) { const sp = spotNear(bay.x, bay.y, Math.random); if (sp) { p.x = sp[0]; p.y = sp[1]; } }
-    } else {
-      const m = S.data.mission;
-      if (m.modules.rover.count - m.modules.rover.broken <= 0) { openMenu(); return; }
-      p.inRover = true;
       refreshWorld(m);
+      if (hitsWall(p.x, p.y)) { const sp = freeSpot(p.x, p.y); if (sp) { p.x = sp[0]; p.y = sp[1]; } }
+      S.eva.act('park', p);
+      return;
+    }
+    if (m.modules.rover.count - m.modules.rover.broken <= 0) { openMenu(); return; }
+    p.inRover = true; // at once, so it feels immediate; in co-op the server may say someone else has it
+    refreshWorld(m);
+    S.eva.act('board', p).then(r => { if (r.error && p.inRover) { p.inRover = false; refreshWorld(S.data.mission); } });
+  }
+  // The nearest open spot to stand on, within 3 tiles of (x, y) (world px), for getting out of the rover by a rock.
+  function freeSpot(x, y) {
+    const tx = Math.floor(x / T), ty = Math.floor(y / T);
+    for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
+      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
+      const c = center(tx + dx, ty + dy);
+      if (!hitsWall(c[0], c[1])) return c;
     }
+    return null;
   }
 
   function openMenu() {
@@ -847,7 +900,7 @@
       } else if (ty === 'reactor') {
         note('+' + fc.power.reactorKw.toFixed(1) + ' kW');
       }
-      if (ty === 'rover' && mod.count - mod.broken > 0) body.appendChild(numbered(mbtn(t('sf.boardRover'), t('sf.roverSub'), () => { closeMenu(); toggleRover(); }, { primary: true, icon: A.icon('eva', 18) })));
+      if (ty === 'rover' && mod.count - mod.broken > 0 && S.eva.roverAtBay(S.player)) body.appendChild(numbered(mbtn(t('sf.boardRover'), t('sf.roverSub'), () => { closeMenu(); toggleRover(); }, { primary: true, icon: A.icon('eva', 18) })));
       const scrapping = (plan.scrap || []).includes(ty);
       body.appendChild(numbered(mbtn(scrapping ? t('sys.scrapQueued') : t('sys.scrap'), fc.points.maintenance ? '' : t('sys.scrapNeed'),
         () => { H.toggleScrap(ty); renderMenu(); }, { on: scrapping, disabled: !fc.points.maintenance && !scrapping, icon: A.icon('scrap', 18) })));
@@ -888,6 +941,7 @@
     const k = v.dpr * v.zoom;
     ctx.setTransform(k, 0, 0, k, -v.camX * k, -v.camY * k);
     S.painter.drawGround(ctx, x0, y0, x1, y1);
+    S.eva.drawZone(ctx);
 
     // buried ice at the base: the only cue for where the ice drill can go
     ctx.save();
@@ -943,7 +997,7 @@
     for (const ty of D.MODULE_TYPES) brokenLeft[ty] = m.modules[ty].broken;
     const runningLeft = Object.assign({}, fc.power.running);
     for (const tile of m.layout) {
-      if (tile.type === 'rover' && (p.inRover || Object.values(S.remote).some(r => r.rover))) continue;
+      if (tile.type === 'rover' && !S.eva.roverAtBay(p)) continue; // driven, or parked out on the map
       const [wx, wy] = gridToWorld(tile.x, tile.y);
       let status = null;
       if (brokenLeft[tile.type] > 0) { brokenLeft[tile.type]--; status = 'broken'; }
@@ -991,11 +1045,13 @@
         ctx.fillStyle = A.ROLE[c.role]; ctx.fillRect(fx, fy - 22, 10, 7);
       } });
     });
+    for (const s of S.eva.sprites(x0, y0, x1, y1, S.world, S.time)) sprites.push(s);
     sprites.sort((a, b) => a.y - b.y);
-    for (const s of sprites) s.draw();
+    for (const s of sprites) s.draw(ctx); // the exploring layer's sprites take the context; the others close over it
     // the fog over what you can't see, then the name tags on top of it
     P.drawFog(ctx, S.world, x0, y0, x1, y1, p.x, p.y - 12, (p.inRover ? VIEW_ROVER : VIEW_FOOT) * T);
     drawTags(ctx, S.tags);
+    S.eva.drawOver(ctx, S.remote);
     if (S.debug) drawChunkBorders(ctx, x0, y0, x1, y1);
 
     // weather, in screen space
@@ -1037,6 +1093,7 @@
       blocked: (wx, wy) => isBlocked(wx, wy), path: (gx, gy) => findPath(S.player.x, S.player.y, gx, gy, true),
       tile: [tx, ty], region: S.region == null ? null : W.REGIONS[S.region], fps: Math.round(S.fps), mapOpen: S.map.isOpen(),
       world: S.world && S.world.stats(), paint: S.painter && S.painter.stats(), seen: (x, y) => S.world.seen(x, y),
+      eva: S.eva.state(), focusKey: S.focus && S.focus.key,
     };
   }
 
@@ -1049,6 +1106,7 @@
     speed(x) { S.qa.speed = Math.max(0.1, Number(x) || 1); },
     chunkHash(ix, iy) { return S.painter.chunkHash(ix, iy); },
     teleport(tx, ty) { S.player.x = tx * T + T / 2; S.player.y = ty * T + T / 2; S.player.path = null; S.camSnap = true; },
+    suit(s) { S.eva.qaSuit(s); },
   };
 
   root.SolSurface = Object.assign({ mount, update, setRemote, mergeFog, reset, isMounted: () => !!S, probe }, DEBUG ? { qa } : {});
```

`src/surface-map.js`:

```diff
--- a/src/surface-map.js
+++ b/src/surface-map.js
@@ -6,7 +6,8 @@
  * API: SolMap.create({ t, onOpen, onClose }) → map
  *        map.attach(world, painter)          a new mission's world
  *        map.minimap · map.el                elements for the surface overlay
- *        map.drawMini(state, now)            state: { px, py, crew: [{ x, y, color, you }] } (world pixels)
+ *        map.drawMini(state, now)            state: { px, py, crew: [{ x, y, color, you }], marks: [{ x, y, color, square }] }
+ *                                            (world pixels; marks are finds, dropped loads and the parked rover)
  *        map.open(state?) · map.close() · map.isOpen() · map.key(keyEvent) → used?
  *        map.frame(state, deadline)          every animation frame (does nothing while closed)
  *        map.relabel()                       after a language change
@@ -31,8 +32,14 @@
       return n;
     };
 
-    // The HQ, then every crew member as a dot in their role colour (you with a white ring).
+    // Finds and the like, then the HQ, then every crew member as a dot in their role colour (you with a white ring).
     function markers(g, st, at) {
+      for (const k of st.marks || []) {
+        const [x, y] = at(k.x, k.y);
+        g.fillStyle = k.color;
+        if (k.square) g.fillRect(x - 2.5, y - 2.5, 5, 5);
+        else { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
+      }
       const [bx, by] = at(T / 2, T / 2); // the HQ is tile (0, 0)
       g.fillStyle = '#f4e9df';
       g.strokeStyle = '#120a0c';
```

- [ ] **Step 2: The UI and the strings**

`src/ui.js`:

```diff
--- a/src/ui.js
+++ b/src/ui.js
@@ -5,7 +5,7 @@
  */
 (function () {
   'use strict';
-  const D = window.SolData, E = window.SolEngine, I = window.SolI18n, A = window.SolArt, C = window.SolCharts, N = window.SolNet, W = window.SolWorldgen, F = window.SolFog;
+  const D = window.SolData, E = window.SolEngine, I = window.SolI18n, A = window.SolArt, C = window.SolCharts, N = window.SolNet, W = window.SolWorldgen, F = window.SolFog, X = window.SolExpedition;
   const app = document.getElementById('app');
 
   // ---------- storage (every access guarded: private windows and previews can throw) ----------
@@ -732,8 +732,61 @@
       showRegionCard(id);
     },
     reopenRegion: id => { if (W.REGIONS.includes(id)) reopenRegionCard(id); },
+    // Exploring (src/expedition.js). Solo: the rules run here on your mission, which is saved. Co-op: the server runs them
+    // against where it last saw you, and everyone gets the new room. Always resolves to { ok, ... } or { error }.
+    exp: (type, payload, pos) => {
+      const s = mission();
+      if (!s || !s.expedition || s.status !== 'active') return Promise.resolve({ error: 'badPhase' });
+      const p = payload || {};
+      if (lanOn()) return N.act(type, p).then(r => r || { error: 'net' }, () => ({ error: 'net' }));
+      const id = s.pilot;
+      const run = {
+        collect: () => X.collect(s, id, p.find, pos), deliver: () => X.deliver(s, id, pos), canister: () => X.useCanister(s, id),
+        pickup: () => X.pickUp(s, id, p.drop, pos), collapse: () => X.collapse(s, id, pos), board: () => X.board(s, id, pos),
+        park: () => X.park(s, id, pos),
+      }[type];
+      const r = run ? run() : { error: 'badAction' };
+      if (!r.error) { saveSoloSoon(); render(); }
+      return Promise.resolve(r);
+    },
+    // Solo: your suit level and the rover's battery are kept with the saved mission (co-op sends them with each position).
+    suit: (seconds, driven) => {
+      const s = mission();
+      if (lanOn() || !s || !s.expedition || !s.pilot) return;
+      X.setSuit(s, s.pilot, seconds);
+      if (driven != null) X.setRoverDriven(s, s.pilot, driven);
+      saveSoloSoon();
+    },
   };
 
+  // ---------- exploring: what was delivered and what is still out there ----------
+  const RES_ICON = { water: 'water', materials: 'materials', food: 'food', o2: 'o2', spares: 'spares', science: 'science' };
+  // "+160 kg water — Ice deposit, Icy Plains (Minh)"
+  function haulText(l) {
+    return t(l.late ? 'rep.haulLate' : 'rep.haul', {
+      amount: t('haul.' + l.res, { n: nf(l.amount) }), what: t('find.' + l.kind), region: t('region.' + W.REGIONS[l.region]), name: crewName(l.crewId),
+    });
+  }
+  function expeditionPanel(s) {
+    const x = s.expedition;
+    if (!x || !x.banked) return null;
+    const lines = x.banked.lines || [];
+    const carrying = Object.keys(x.carried).filter(id => Array.isArray(x.carried[id]) && x.carried[id].length);
+    const body = [];
+    if (!lines.length && !carrying.length) body.push(h('p', { class: 'muted' }, t('eva.nothing')));
+    if (lines.length) {
+      body.push(h('span', { class: 'eyebrow' }, t('eva.banked')));
+      body.push(h('ul', { class: 'replist' }, lines.map(l => h('li', { class: 'ok' }, ico(RES_ICON[l.res], 14), h('span', null, haulText(l))))));
+      body.push(h('p', { class: 'hint' }, t('eva.counts')));
+    }
+    if (carrying.length) {
+      body.push(h('span', { class: 'eyebrow' }, t('eva.carrying')));
+      body.push(h('ul', { class: 'replist' }, carrying.map(id => h('li', null, ico('eva', 14),
+        h('span', null, crewName(id) + ': ' + x.carried[id].map(it => t('haul.' + it.res, { n: nf(it.amount) })).join(', '))))));
+    }
+    return panel(t('eva.title'), body);
+  }
+
   function surfaceStage(s, p, f) {
     if (!window.SolSurface) return null;
     const node = window.SolSurface.mount(surfaceHooks);
@@ -779,6 +832,7 @@
     })));
     return h('aside', { class: 'sf-side' },
       seatPanel(s),
+      expeditionPanel(s),
       eventsPanel(s, p),
       jobs,
       forecastPanel(s, p, f),
@@ -1609,7 +1663,7 @@
     const m = store.modal;
     if (m === 'help') {
       return modal(t('help.title'), h('ol', { class: 'replist', style: 'list-style:decimal;padding-left:20px' },
-        [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => h('li', { style: 'display:list-item' }, t('help.' + i)))));
+        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => h('li', { style: 'display:list-item' }, t('help.' + i)))));
     }
     if (m === 'notes') {
       return modal(t('notes.title'), [
@@ -1673,6 +1727,10 @@
     for (const id of r.downs) li('crit', 'crit', t('rep.down', { name: crewName(id) }));
     for (const id of r.deaths) li('crit', 'crit', t('rep.dead', { name: crewName(id) }));
     if (r.pilot) li('users', r.pilot.to ? 'warn' : 'crit', pilotText(r.pilot));
+    if (r.expedition) {
+      for (const l of r.expedition.lines) li(RES_ICON[l.res], 'ok', haulText(l));
+      for (const inc of r.expedition.incidents) li('crit', 'warn', t('rep.collapse', { name: crewName(inc.crewId), h: D.EXPEDITION.collapse.health, m: D.EXPEDITION.collapse.morale }));
+    }
     if (r.requested) li('rocket', 'muted', t('rep.requested', { kind: t('earth.' + r.requested) }));
     if (r.hypoxia > 0) li('crit', 'crit', t('w.o2_out'));
     if (r.dehydration > 0) li('crit', 'crit', t('w.water_out'));
```

`src/i18n.js`. Keep the English and Vietnamese key sets identical; `test/i18n.test.js` checks this.

```diff
--- a/src/i18n.js
+++ b/src/i18n.js
@@ -585,6 +585,74 @@
     'help.6': 'At 0 HP a crew member goes down. The medic on Rest & care, or anyone with a med bay, can revive them within 5 rounds. A second collapse is permanent.',
     'help.7': 'Each astronaut has a 300 mSv surface budget. Past it they are grounded and the mission loses a lot of score.',
     'help.8': 'Earth can drop food, water or materials from orbit a few times per mission, and Mission Control answers one question per round.',
+    'help.10': 'Bring things home: ice, metal-rich rock, crashed cargo pods and science sites lie out on the map. Stand by one and hold E (or the action button) to load it into your backpack (3 loads, 8 in the rover), then walk back inside the dashed square around the HQ to deliver. Your suit holds 150 s of oxygen outside each round and pauses at the base; if it runs out you collapse. Deliveries count when the round advances.',
+    'find.ice': 'Ice deposit',
+    'find.metal': 'Metal-rich rock',
+    'find.pod': 'Crashed cargo pod',
+    'find.science': 'Science site',
+    'sci.delta': 'old river delta',
+    'sci.vent': 'methane vent',
+    'sci.meteorite': 'meteorite',
+    'sci.layered': 'layered rock',
+    'haul.water': '+{n} kg water',
+    'haul.materials': '+{n} kg materials',
+    'haul.food': '+{n} kg food',
+    'haul.o2': '+{n} kg O₂ (a canister)',
+    'haul.spares': '+{n} spare kit',
+    'haul.science': '+{n} science',
+    'rep.haul': '{amount}: {what}, {region} ({name})',
+    'rep.haulLate': '{amount}: {what}, {region} ({name}), banked from a backpack',
+    'rep.collapse': '{name} collapsed outside with an empty suit: −{h} health, −{m} morale.',
+    'eva.title': 'Expedition',
+    'eva.banked': 'Delivered this round',
+    'eva.carrying': 'In backpacks',
+    'eva.counts': 'It counts when the round advances.',
+    'eva.nothing': 'Nothing yet. Walk out of the base: ice, metal-rich rock, cargo pods and science sites lie on the map. Hold E by one to load it, then bring it back inside the dashed square around the HQ.',
+    'eva.suit': 'Suit O₂',
+    'eva.paused': '{s} s · paused',
+    'eva.battery': 'Rover battery',
+    'eva.tiles': 'tiles',
+    'eva.pack': 'Backpack: {n} of {m} loads',
+    'eva.useCanister': 'Breathe an O₂ canister (+{s} s) · Q',
+    'eva.breathed': '+{s} s of suit oxygen.',
+    'eva.collect': 'Hold to collect: {what} · {s} s',
+    'eva.survey': 'Hold to survey: {what} · {s} s',
+    'eva.pickup': 'Hold to pick up the dropped load · {s} s',
+    'eva.revive': 'Hold to revive {name} · {s} s',
+    'eva.collected': 'Loaded into your backpack.',
+    'eva.pickedUp': 'Load picked up.',
+    'eva.delivered1': 'Delivered 1 load. It counts when the round advances.',
+    'eva.delivered': 'Delivered {n} loads. They count when the round advances.',
+    'eva.full': 'Backpack full: bring it back to the base.',
+    'eva.low': 'Suit oxygen low: head back to the base!',
+    'eva.flat': 'The rover battery is flat until tomorrow: press E to get out and walk.',
+    'eva.collapsedCoop': 'Your suit is empty and you collapsed. Hold on: a crewmate can revive you.',
+    'eva.collapsedSolo': 'Your suit ran out and you collapsed. The crew brought you back to the base; your load waits where you fell.',
+    'eva.benched': 'Your suit is empty until the next round.',
+    'eva.revived': 'A crewmate revived you: {s} s of suit oxygen.',
+    'eva.revivedThem': 'You revived {name}.',
+    'eva.err.tooFar': 'Too far away: step closer.',
+    'eva.err.full': 'Your backpack is full.',
+    'eva.err.empty': 'Nothing left here.',
+    'eva.err.taken': 'Someone else is driving the rover.',
+    'eva.err.flat': "The rover's battery is flat until tomorrow.",
+    'eva.err.noRover': 'The rover is out of action.',
+    'eva.err.noCanister': 'No O₂ canister in your backpack.',
+    'eva.err.badPos': 'Waiting for your position to reach the server.',
+    'eva.err.net': 'No answer from the server.',
+    'eva.err.noFind': 'That find is gone.',
+    'eva.err.noDrop': 'Someone already picked that up.',
+    'eva.err.notCollapsed': 'They are already back on their feet.',
+    'eva.err.collapsed': 'You have collapsed.',
+    'eva.err.benched': 'Your suit is empty until the next round.',
+    'eva.err.notActive': 'You are not fit to work outside.',
+    'eva.err.badPhase': 'Not now.',
+    'eva.err.noCrew': 'Take a crew member first.',
+    'eva.err.solo': 'Nobody can revive you on a solo mission.',
+    'eva.err.notAtBase': 'Deliver inside the dashed square around the HQ.',
+    'eva.err.atBase': 'Your suit pauses at the base.',
+    'eva.err.notDriving': 'You are not driving the rover.',
+    'eva.err.badAction': 'Not now.',
     'help.9': 'Explore: the world goes on in every direction. Walk or drive out of the base, and what you see stays on your map. Press M or tap the minimap to open the map. Each region of Mars looks different and comes with a real fact.',
 
     'notes.title': 'Science notes',
@@ -640,8 +708,8 @@
     'sf.surface': "Surface",
     'sf.consoleTab': "Mission console",
     'sf.aria': "Outpost surface. Move with WASD or the arrow keys, press E to interact, C opens the mission console.",
-    'sf.hintKeys': "WASD or arrows to move · Shift to sprint · E to interact · M for the map · C for the console · click the ground to walk there",
-    'sf.hintTouch': "Drag the stick to move · hold » to sprint · tap E to interact · tap the minimap for the map · tap the ground to walk there",
+    'sf.hintKeys': "WASD or arrows to move · Shift to sprint · E to interact (hold it by a find) · M for the map · C for the console · click the ground to walk there",
+    'sf.hintTouch': "Drag the stick to move · hold » to sprint · tap E to interact (hold it by a find) · tap the minimap for the map · tap the ground to walk there",
     'sf.minimap': 'Minimap. Select it to open the full map (M).',
     'sf.mapTitle': 'Explored map',
     'sf.mapHint': 'Drag or use the arrow keys to move · scroll or + − to zoom · M or Esc to close',
@@ -1397,6 +1465,74 @@
     'help.6': 'Hết HP, phi hành gia sẽ ngã gục. Bác sĩ làm Nghỉ & chăm sóc, hoặc bất kỳ ai khi có trạm y tế, có thể cứu trong vòng 5 vòng. Ngã gục lần thứ hai là mãi mãi.',
     'help.7': 'Mỗi phi hành gia có giới hạn 300 mSv trên bề mặt. Vượt qua sẽ bị cấm ra ngoài và nhiệm vụ mất nhiều điểm.',
     'help.8': 'Trái Đất có thể thả thực phẩm, nước hoặc vật liệu từ quỹ đạo vài lần mỗi nhiệm vụ, và Trung tâm điều khiển trả lời một câu hỏi mỗi vòng.',
+    'help.10': 'Mang về căn cứ: băng, đá giàu kim loại, khoang hàng bị rơi và địa điểm khoa học nằm rải rác trên bản đồ. Đứng cạnh và giữ phím E (hoặc nút hành động) để chất vào ba lô (3 phần, 8 phần khi đi xe tự hành), rồi đi vào trong ô vuông nét đứt quanh trụ sở để giao hàng. Bộ đồ du hành có 150 giây oxy bên ngoài mỗi vòng và tạm dừng khi ở căn cứ; nếu hết oxy bạn sẽ ngã gục. Hàng giao sẽ được tính khi sang vòng mới.',
+    'find.ice': 'Mỏ băng',
+    'find.metal': 'Đá giàu kim loại',
+    'find.pod': 'Khoang hàng bị rơi',
+    'find.science': 'Địa điểm khoa học',
+    'sci.delta': 'châu thổ sông cổ',
+    'sci.vent': 'lỗ thoát khí mê-tan',
+    'sci.meteorite': 'thiên thạch',
+    'sci.layered': 'đá phân lớp',
+    'haul.water': '+{n} kg nước',
+    'haul.materials': '+{n} kg vật liệu',
+    'haul.food': '+{n} kg thức ăn',
+    'haul.o2': '+{n} kg O₂ (một bình)',
+    'haul.spares': '+{n} bộ phụ tùng',
+    'haul.science': '+{n} điểm khoa học',
+    'rep.haul': '{amount}: {what}, {region} ({name})',
+    'rep.haulLate': '{amount}: {what}, {region} ({name}), gửi từ ba lô',
+    'rep.collapse': '{name} ngã gục bên ngoài vì hết oxy: −{h} sức khỏe, −{m} tinh thần.',
+    'eva.title': 'Thám hiểm',
+    'eva.banked': 'Đã giao trong vòng này',
+    'eva.carrying': 'Trong ba lô',
+    'eva.counts': 'Sẽ được tính khi sang vòng mới.',
+    'eva.nothing': 'Chưa có gì. Hãy đi ra khỏi căn cứ: băng, đá giàu kim loại, khoang hàng và địa điểm khoa học nằm trên bản đồ. Giữ phím E bên cạnh để chất hàng, rồi mang về trong ô vuông nét đứt quanh trụ sở.',
+    'eva.suit': 'Oxy bộ đồ',
+    'eva.paused': '{s} giây · tạm dừng',
+    'eva.battery': 'Pin xe tự hành',
+    'eva.tiles': 'ô',
+    'eva.pack': 'Ba lô: {n} trên {m} phần',
+    'eva.useCanister': 'Thở một bình O₂ (+{s} giây) · Q',
+    'eva.breathed': '+{s} giây oxy cho bộ đồ.',
+    'eva.collect': 'Giữ để thu thập: {what} · {s} giây',
+    'eva.survey': 'Giữ để khảo sát: {what} · {s} giây',
+    'eva.pickup': 'Giữ để nhặt hàng bị rơi · {s} giây',
+    'eva.revive': 'Giữ để cứu {name} · {s} giây',
+    'eva.collected': 'Đã chất vào ba lô.',
+    'eva.pickedUp': 'Đã nhặt hàng.',
+    'eva.delivered1': 'Đã giao 1 phần hàng. Sẽ được tính khi sang vòng mới.',
+    'eva.delivered': 'Đã giao {n} phần hàng. Sẽ được tính khi sang vòng mới.',
+    'eva.full': 'Ba lô đã đầy: hãy mang về căn cứ.',
+    'eva.low': 'Oxy bộ đồ sắp hết: quay về căn cứ ngay!',
+    'eva.flat': 'Pin xe tự hành đã cạn đến ngày mai: nhấn E để xuống xe và đi bộ.',
+    'eva.collapsedCoop': 'Bộ đồ hết oxy và bạn đã ngã gục. Cố lên: đồng đội có thể cứu bạn.',
+    'eva.collapsedSolo': 'Bộ đồ hết oxy và bạn đã ngã gục. Phi hành đoàn đưa bạn về căn cứ; hàng của bạn vẫn nằm ở chỗ bạn ngã.',
+    'eva.benched': 'Bộ đồ hết oxy cho đến vòng sau.',
+    'eva.revived': 'Một đồng đội đã cứu bạn: {s} giây oxy cho bộ đồ.',
+    'eva.revivedThem': 'Bạn đã cứu {name}.',
+    'eva.err.tooFar': 'Quá xa: hãy lại gần hơn.',
+    'eva.err.full': 'Ba lô của bạn đã đầy.',
+    'eva.err.empty': 'Ở đây không còn gì.',
+    'eva.err.taken': 'Người khác đang lái xe tự hành.',
+    'eva.err.flat': 'Pin xe tự hành đã cạn đến ngày mai.',
+    'eva.err.noRover': 'Xe tự hành đang không hoạt động.',
+    'eva.err.noCanister': 'Không có bình O₂ nào trong ba lô.',
+    'eva.err.badPos': 'Đang chờ vị trí của bạn gửi tới máy chủ.',
+    'eva.err.net': 'Máy chủ không phản hồi.',
+    'eva.err.noFind': 'Vật đó không còn nữa.',
+    'eva.err.noDrop': 'Đã có người nhặt rồi.',
+    'eva.err.notCollapsed': 'Họ đã đứng dậy rồi.',
+    'eva.err.collapsed': 'Bạn đã ngã gục.',
+    'eva.err.benched': 'Bộ đồ hết oxy cho đến vòng sau.',
+    'eva.err.notActive': 'Bạn không đủ sức khỏe để làm việc bên ngoài.',
+    'eva.err.badPhase': 'Chưa được lúc này.',
+    'eva.err.noCrew': 'Hãy nhận một thành viên trước.',
+    'eva.err.solo': 'Không ai có thể cứu bạn trong nhiệm vụ một người.',
+    'eva.err.notAtBase': 'Hãy giao hàng trong ô vuông nét đứt quanh trụ sở.',
+    'eva.err.atBase': 'Bộ đồ tạm dừng khi ở căn cứ.',
+    'eva.err.notDriving': 'Bạn đang không lái xe tự hành.',
+    'eva.err.badAction': 'Chưa được lúc này.',
     'help.9': 'Khám phá: thế giới trải dài về mọi hướng. Hãy đi bộ hoặc lái xe ra khỏi căn cứ, những gì bạn nhìn thấy sẽ ở lại trên bản đồ. Nhấn M hoặc chạm bản đồ nhỏ để mở bản đồ. Mỗi vùng của sao Hỏa trông khác nhau và đi kèm một sự thật khoa học.',
 
     'notes.title': 'Ghi chú khoa học',
```

`src/style.css`:

```diff
--- a/src/style.css
+++ b/src/style.css
@@ -450,13 +450,13 @@ p { margin: 0; }
 .ops-tabs button { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding-inline: 16px; }
 .sf-layout { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 14px; margin-top: 12px; align-items: start; }
 .sf-stage { min-width: 0; position: relative; }
-.region-card { position: absolute; left: 12px; top: 56px; z-index: 2; width: min(340px, calc(100% - 24px)); background: rgba(28, 20, 23, 0.96); border: 1px solid var(--line-2); border-left: 3px solid var(--accent); border-radius: 10px; padding: 10px 12px 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); display: grid; gap: 6px; }
+.region-card { position: absolute; left: 12px; top: 150px; z-index: 2; width: min(340px, calc(100% - 24px)); background: rgba(28, 20, 23, 0.96); border: 1px solid var(--line-2); border-left: 3px solid var(--accent); border-radius: 10px; padding: 10px 12px 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); display: grid; gap: 6px; }
 .region-card-h { display: flex; justify-content: space-between; align-items: center; }
 .region-card h3 { margin: 0; font-family: var(--font-display); font-size: var(--fs-md); }
 .region-card p { margin: 0; font-size: var(--fs-sm); color: var(--fg-2); line-height: 1.45; }
 .region-card .src { font-size: var(--fs-xs); }
 .region-card a { color: var(--accent); }
-@media (max-width: 640px) { .region-card { top: 136px; } }
+
 .sf-root { position: relative; height: min(74vh, 780px); min-height: 440px; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #3a1d14; touch-action: none; user-select: none; -webkit-user-select: none; }
 .sf-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; outline: none; cursor: crosshair; }
 .sf-canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
@@ -493,6 +493,27 @@ p { margin: 0; }
 .sf-region::after { content: 'i'; display: inline-grid; place-items: center; width: 14px; height: 14px; margin-left: 6px; border: 1px solid currentColor; border-radius: 50%; font: italic 700 10px/1 var(--font-display); opacity: 0.7; vertical-align: 1px; }
 .sf-region:hover, .sf-region:focus-visible { border-color: var(--accent); }
 .sf-region:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
+/* Exploring: the suit, the rover's battery, the backpack and notes, under the region name. */
+.sf-eva { position: absolute; left: 14px; top: 58px; display: grid; gap: 6px; width: 210px; pointer-events: none; }
+.sf-eva > * { pointer-events: auto; }
+.sf-suit { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; background: rgba(20, 14, 16, 0.82); border: 1px solid var(--line-2); border-radius: 10px; padding: 4px 10px; font-size: var(--fs-xs); color: var(--fg); }
+.sf-suit .k { color: var(--fg-2); font-weight: 600; }
+.sf-suit .bar { height: 7px; border-radius: 7px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
+.sf-suit .bar i { display: block; height: 100%; background: #4fd0c4; }
+.sf-suit.warn .bar i { background: var(--warn); }
+.sf-suit.crit .bar i { background: var(--crit); }
+.sf-suit.crit b { color: var(--crit); }
+.sf-suit.batt .bar i { background: var(--accent); }
+.sf-suit b { font-variant-numeric: tabular-nums; }
+.sf-pack { display: flex; gap: 4px; flex-wrap: wrap; }
+.sf-pack .slot { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; border: 1px dashed var(--line-2); background: rgba(20, 14, 16, 0.6); color: var(--fg); }
+.sf-pack .slot.full { border-style: solid; background: rgba(20, 14, 16, 0.86); }
+.sf-can { justify-self: start; font: inherit; font-size: var(--fs-xs); padding: 4px 10px; border-radius: 999px; border: 1px solid var(--accent); background: rgba(20, 14, 16, 0.86); color: var(--fg); cursor: pointer; }
+.sf-can:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
+.sf-evanote { margin: 0; font-size: var(--fs-xs); background: rgba(20, 14, 16, 0.82); border: 1px solid var(--line-2); border-radius: 10px; padding: 4px 10px; color: var(--fg); }
+.sf-evanote.ok { border-color: var(--ok); }
+.sf-evanote.warn { border-color: var(--warn); }
+.sf-evanote.crit { border-color: var(--crit); color: var(--crit); }
 .sf-mini { position: absolute; right: 12px; top: 12px; width: 160px; height: 160px; padding: 0; border: 1px solid var(--line-2); border-radius: 10px; overflow: hidden; background: #120a0c; pointer-events: auto; cursor: zoom-in; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4); }
 .sf-mini canvas { width: 100%; height: 100%; display: block; }
 .sf-mini:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@@ -523,9 +544,9 @@ p { margin: 0; }
   .sf-hint { white-space: normal; text-align: center; border-radius: 12px; }
 }
 @media (max-width: 640px) {
-  /* A full-width strip under the minimap, in the slot the region card takes on a phone (top: 136px, above): never a tall narrow column.
+  /* A full-width strip under the minimap and the suit, in the slot the region card takes (top: 150px): never a tall narrow column.
      While the card shows, the hint steps aside, so the two never overlap. */
-  .sf-hint { top: 136px; left: 12px; right: 12px; transform: none; max-width: none; }
+  .sf-hint { top: 150px; left: 12px; right: 12px; transform: none; max-width: none; }
   .sf-stage:has(.region-card) .sf-hint { display: none; }
 }
 .sf-side { display: grid; gap: 12px; min-width: 0; }
```

- [ ] **Step 3: Run the suite**

Run: `npm test`. Expected: **278** pass, including the i18n key-parity test with the new keys in both languages.

- [ ] **Step 4: Check it in the browser**

Start a dry server: `PORT=5071 node server.js --data <fresh temp folder>`, then open `http://localhost:5071/?debug=chunks` in Chrome (DevTools MCP or CDP). The checks below use `SolUI.store`, `SolSurface.probe()`, `SolSurface.qa` and real `KeyboardEvent`s on `window`. They are the ones run in the dry run, with the results it saw.

1. **Solo start.** Create a mission and show the surface:
   - `E.createMission({ seed: 'QA-M4A', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' })`;
   - set `store.mission`, `store.plan`, `screen = 'ops'` and `opsView = 'surface'`, then `SolUI.render()`.

   Expected:
   - the HUD reads "Suit O₂ / 150 s · paused";
   - the side panel's first panel is "Expedition";
   - a dashed square is drawn around the HQ;
   - no console errors.
2. **Collect.**
   - `qa.teleport(4, 20)` puts you next to the metal-rich rock at (4, 21) on this seed (find `0,0:1`, 4 loads).
   - The prompt reads "E Hold to collect: Metal-rich rock · 3 s".
   - Hold E (keydown, then 3.3 s): the backpack has 1 item, `sites['0,0:1'] === 3`, and the note reads "+40 kg materials".
   - While E is held the next load starts on its own.
3. **Deliver.**
   - `qa.teleport(1, 1)`: `banked.materials === 40`.
   - The panel lists "+40 kg materials: Metal-rich rock, Plains (Minh Tran)".
   - The note reads "Delivered 1 load…".
4. **Advance.** Click "Advance 25 sols":
   - materials go 500 → 540;
   - the report lists the haul line;
   - the bank is spent;
   - the suit is 150 and you stand by the HQ.
5. **Solo collapse.**
   - Load something, then `qa.teleport(10, 30)` and `qa.suit(0.5)`. After about 1 s:
     - `incidents` is `[{ crewId: 'minh', kind: 'collapse' }]`;
     - a drop with id `1:minh` lies at that spot;
     - `benched` is `['minh']` and you are back by the HQ;
     - the note reads "Your suit ran out…".
   - Walking east from tile (2, 0) stops at x = 192: the zone's edge.
6. **Rover.** Start a mission with the commander kit plus `rover: 1` and `waterwall: 0`, and pilot `diego`.
   - Stand south of the bay facing it: the focus is `rover`. E boards it: `rover` is `{ driver: 'diego' }`.
   - Drive east for 4 s: about 24 tiles, the battery shows "375 tiles", and the suit drains at half rate.
   - E gets out: `rover` is `{ x, y }` where you stopped, and the parked rover is drawn there.
   - Reload the page: the rover is still parked and `roverDriven` is kept.
7. **Co-op.** Use two isolated browser contexts: the host hosts (`[data-k=lan-host]`), the guest joins, they claim `lena` and `minh`, and the host launches.
   - **Collect:** the guest stands by a metal find and holds E. The server answers with the item: the note reads "+40 kg materials", and the host sees `carried.minh`.
   - **Collapse:** guest `qa.suit(0.3)` gives `collapsed.minh = { x, y }`, and the guest's note reads "Your suit is empty and you collapsed…". The host sees the guest's position with `suit: 0, load: 1`.
   - **Revive:** the host stands north of the guest. The prompt reads "E Hold to revive Guest · 4 s". Holding E for 4.5 s gives `collapsed {}` and `suits.minh === 30`. The guest can move again.
   - **Advance:** the host advances while the guest carries a load. `banked.lines[0].late === true`, everyone is by the HQ with 150 s, and no load is lost.
8. **Console:** no errors or warnings in either tab.

Stop the server by its PID and close the tabs.

- [ ] **Step 5: Commit**

```bash
git add src/surface.js src/surface-map.js src/ui.js src/i18n.js src/style.css
git commit -m "feat(ui): exploring on the surface: finds, the suit, the backpack and the rover, in the report and the side panel, in English and Vietnamese

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: QA, docs, version 3.3.0 and the installer

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (§12: tick the four "(M4a)" items; the Status line reads "M1–M3 and M4a shipped (v3.3.0); M4b–M4d and M5 to do")
- Create: `docs/superpowers/plans/2026-10-05-sol500-m4a-followups.md`
- Modify: `package.json` (`"version": "3.3.0"`)
- Rebuild: `dist/` (`node tools/build.js`, committed), `dist-app/` (git-ignored)

- [ ] **Step 1: Browser QA (solo, co-op, phone, offline)** on a dry server with a fresh `--data` folder. Save logs and screenshots under `.superpowers/` (git-ignored).
  1. **Every Task 7 Step 4 check**, on the final code.
  2. **An old save.** Put a 3.2.0-shaped save in `localStorage['sol500.save']`: its expedition has no `suits`, `collapsed`, `benched`, `rover` or `roverDriven`, and `sites: 'x'`. Reload. Expected:
     - "Resume" works, with no console error;
     - the repaired fields are present;
     - you can collect and deliver.
  3. **Co-op with 5 players.** Five tabs, one per seat, each walks out and collects. Expected:
     - teammates' suit bars show above their names outside the base;
     - every tab sees every backpack in the Expedition panel;
     - a second tab trying to board while someone drives is put back out, with "Someone else is driving the rover";
     - no console errors.
  4. **Phone, 390×844, with touch emulation**, EN and VI. Expected:
     - the suit HUD (top left, from 58 px) and the region card (from 150 px) don't overlap;
     - the hint strip shows at 150 px when no card shows;
     - the action button, held down, collects a find, and lifting the finger lets go;
     - the joystick still stops when the finger lifts outside it.
     - Measure the rectangles as M3's C1 check did.
  5. **Offline file.** Run `node tools/build.js`, then open `dist/sol500.html` from disk. A solo mission collects and delivers there (the rules run in the page).
  6. **Performance.**
     - A 60 s rover drive with finds in view runs at a median of 50 fps or more (trace 20 s, plus an in-page frame sampler).
     - The debug box's paint median stays at 2 ms or less.
     - `npm test` time is about the same as before (the reach test takes about 8 s).
- [ ] **Step 2: Docs**
  - Tick the four "(M4a)" items in spec §12 and update the Status line.
  - Write `docs/superpowers/plans/2026-10-05-sol500-m4a-followups.md`:
    - the measured numbers (QA, fps, balance);
    - everything reviews defer, sorted into M4b, M4c, M4d and M5;
    - at least: the sloppy-bot target and the grade inflation (M4d);
    - the hint-strip and region-card positions on phones (M5);
    - anything QA finds and doesn't fix.
- [ ] **Step 3: Version and builds**
  1. Set `package.json` to `3.3.0`.
  2. `node tools/build.js`: commit `dist/`.
  3. `npm run app`: this builds `dist-app/SOL500-Setup-3.3.0.exe`.
  4. `npm run smoke` must report `ok: true`.
  5. Install silently over 3.2.0, the same way as Task 11b of M3.
  6. Launch check, read-only: the app opens, Solo shows the suit HUD, and the admin Project tab lists the M4a items ticked.
  7. Kill leftover `electron.exe` and `cloudflared-*.exe` by PID.
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md docs/superpowers/plans/2026-10-05-sol500-m4a-followups.md package.json dist/
git commit -m "chore: M4a complete (finds, the backpack, suit oxygen and the rover's battery), version 3.3.0, offline build refreshed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Ask before merging.** The final whole-branch review and its fix wave come first. Then offer the user the merge (for M1–M3 they chose "Merge back to master locally").

---

## Measured in the dry run

**Tests:** 278 of 278.

**Finds** (40 seeds × 144 chunks):
- 1.37 finds a chunk;
- by region: Plains 1.38, Dune Sea 0.84, Crater Field 1.51, Canyon Lands 1.31, Icy Plains 1.65, Volcanic Flanks 1.36;
- an average of 3.4 finds within 40 tiles of the base and 25 within 80;
- by kind: metal 45 %, pods 22 %, science 16 %, ice 16 %;
- building a chunk with its finds takes about 0.16–0.19 ms.

**Balance** (`node tools/balance.js 1000`):

| Bot | Cadet | Commander | Veteran |
|---|---|---|---|
| Careless | 24.7 % | 3.3 % | 0.0 % |
| Careless + explorer | **31.3 %** | **9.9 %** | **1.2 %** |
| Sloppy | 100.0 % | 98.1 % | 66.8 % |
| Sloppy + explorer | 100.0 % | 100.0 % | 97.5 % |
| Thoughtful | 100.0 % | 99.9 % | 99.7 % |
| Thoughtful + explorer | 100.0 % | 100.0 % | 100.0 % |

On commander with the rover kit, the sloppy bot goes from 15.0 % to 90.8 % with exploring, and the careless bot from 0.1 % to 0.2 %.

**Loads delivered per round** (commander):
- on foot: 8.8 6.4 5.9 5.6 5.3 4.9 4.5 4.1 3.8 3.6 3.3 3.2 3.1 3.0 3.0 3.0 3.0 3.0 3.0 3.0;
- with the rover kit: 18.9 14.6 13.1 11.1 9.6 8.5 8.0 7.9 7.9 7.8 7.7 7.7 7.7 7.7 7.8 7.7 7.8 7.7 7.7 7.6.

**Average science and score** (commander):
- thoughtful: 600 → 979 science and 1,324 → 1,754 score;
- sloppy: 796 → 1,163 science and 1,254 → 1,646 score.

## For the M4b plan (dangers)
- Solar flares: the 30 s warning and the 60 s countdown, shelters (the base zone, caves), and +15 mSv for anyone outside.
- Caves in mesa and canyon walls and in the Volcanic Flanks.
- Dust devils on a shared clock.
- Storms shrink the view to 5 or 3 tiles. Consider tying the view radius to the visible area (M3 follow-up).
- O₂ ruptures: canisters carried home offset the loss (spec §3.4).

## For the M4c and M4d plans
- **M4c:** landmarks, discovery cards and lava-tube interiors; Kestrel structures (hab pods add a once-a-round refill through `expedition.refills`, which the round roll-over already resets); formations, with sourced facts.
- **M4d:**
  - relay beacons;
  - goals;
  - pings and the commander's skills;
  - the debrief Expedition section, using `expedition.stats` (finds per crew member are already counted; add the distance walked);
  - ISRU sources;
  - the final rebalance: the sloppy-bot target and grade inflation (ruling 6);
  - the per-seat fog budget and the strict fog keys before explored area is scored (M3 follow-ups).

## Self-review (done while writing this plan)
- **Spec coverage, the M4a items:**
  - collect, carry and deliver finds: Tasks 1, 3, 6 and 7;
  - finds counted at the advance and in the report: Tasks 2 and 7;
  - suit oxygen, collapse and revive: Tasks 3, 6 and 7;
  - rover parking and its battery: Tasks 2, 3 and 7;
  - checked actions and the 256-chunk cache: Tasks 3 and 4;
  - balance: Task 5.
  - The role skills for collecting are in (Task 3); pings and the commander are M4d.
- **Placeholders:** every code step carries the full code or an exact diff, taken from the tested dry-run copy.
- **Type consistency:** these names are used identically everywhere:
  - finds: `findById`, `loadsLeft(m, f, id)`, `capacity`, `holdSeconds`, `inBaseZone`;
  - the suit and battery: `suitOf`, `setSuit`, `roverLeft`, `setRoverDriven`;
  - the bank: `bankItem`;
  - the surface layer: `SolEva.create(env)` with `env.hooks().exp`, `.suit`;
  - the room action names, and the position fields `suit`, `load` and `driven`.
- **Review Focus:** each of the five lines has its test or browser step in the owning task.
