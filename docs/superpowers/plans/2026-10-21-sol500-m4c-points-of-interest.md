# SOL 500 M4c — Points of Interest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the endless world places worth walking to.
- **Landmarks:** one in 60 % of the 256-tile cells: a river delta, a lava tube, a giant crater, a methane vent, an ice scarp, a star dune. The first crew member to see one's centre discovers it: a card with a real NASA fact and its source, and 80–150 science banked at once (Scientist +50 %).
- **Kestrel Survey structures** (a fictional uncrewed programme, labelled "story, fictional"): supply caches, wrecked scout rovers, weather stations, comms masts, abandoned hab pods and dusty solar arrays, each with a one-off reward and a short story log.
- **Natural formations** (arches, yardangs, hoodoos, balanced rocks, ventifacts, layered outcrops, dust-devil tracks): scenery with real geology; about 1 in 3 is a science site whose survey shows its fact.
- **New cover and new views:** a lava tube and a hab pod shelter you from a solar flare; inside a tube it's dark but for your headlamp, whatever the weather; a star dune's crest lets you see 4 tiles further.
- In co-op the server checks every new action and tells every tab about a discovery.

**Architecture:**
- **`src/data.js`** holds the tables (`LANDMARKS`, `STRUCTURES`, `FORMATIONS`, `DECOR`); **`src/worldgen.js`** places landmarks per 256-tile cell, structures per 64-tile cell and formations and decor per chunk, deterministically, and stamps them over the terrain with the spec's precedence. Finds and caves under a footprint stay in the chunk's arrays (their ids never move) and are listed in `c.hidden`.
- **`src/dangers.js`** gains one cover lister (`Z.coversIn`) read by the flare's verdict, the amber rings and the surface; one action table (`Z.act`) run by solo play, the co-op server and the tests; and the view from the tile under you (`Z.viewAt`).
- **`src/expedition.js`** reads the points of interest (`landmarksIn`, `structuresIn`, `landmarkById`, `structureById`) and runs the new actions: `collect` on landmark and formation sites, `discover`, `interact`, `refill`, plus `forecastAhead` and `mastMarks`. **`src/engine.js`** keeps `forecastUntil` and repairs old saves.
- **`lib/rooms.js`** checks the new actions against the last position it saw and broadcasts `discover`. **`tools/explorer.js`** plays them in the balance runs.
- **`src/art.js`** draws the sprites; **`src/surface-paint.js`**, `surface-world.js`, `surface-map.js` and `surface.js` draw the tiles, sprites, the tube's roof and darkness, and the map marks; **`src/surface-eva.js`**, `ui.js`, `net.js`, `style.css` and `i18n.js` give the prompts, holds, cards, story logs and the forecast chip, in English and Vietnamese.

**Tech Stack:** Plain browser JavaScript (no bundler; UMD/IIFE modules on `window`), Canvas 2D, SVG sprites, Node 24 built-in test runner (`node --test`), `ws` (already a dependency), Electron (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (v3.1). The sections that apply:
- §2.3 (reachability, the flat zone, precedence, one feature per cell);
- §3.4 (shelter zones: lava-tube interiors and hab pods; headlamps ignore storms);
- §3.6 (landmarks, discovery) and §3.7 (structures, formations, decor);
- §4 (`structures`, `landmarks`, `refills`, `stats`) and §5 (the server checks every item action; the `discover` event);
- §11 and §12 (M4c: "Landmarks with discovery cards", "Random structures and natural formations").

Follow-ups this plan takes:
- `docs/superpowers/plans/2026-10-05-sol500-m4a-followups.md`, "For the M4c plan": find ids stay stable (finds under a footprint are hidden when read, never removed); landmarks, cards and lava-tube interiors; hab pods refill once a round through `expedition.refills`; formations with sourced facts.
- `docs/superpowers/plans/2026-10-13-sol500-m4b-followups.md`, "For the M4c plan": begin with the cover rules (one lister that `shelterAt`, the amber rings and the surface all read), then lava tubes and hab pods.

**Branch:** `feat/m4c-points-of-interest`, created off `master` at `3e634a7` (354 tests). It holds this plan and is otherwise clean.

**How this plan was made:** every task was dry-run on branch `m4c-dryrun` (46 commits, `3e634a7..607ae78`, in four stages of parallel agents: cover, world, art and research; then rules and paint; then text and interaction):
- **Tests:** 470 of 470 pass (354 before).
- **Tests first:** the diffs were cut per task into a test part and a code part, and replayed on a clean `3e634a7`: each task's tests, applied without its code, fail as its Step 2 says; with the code they pass, and the full suite passes after every task.
- **The code blocks:** the diffs below, taken from this document alone and applied in order with a plain `git apply` to a clean `3e634a7` checkout (`core.autocrlf=true`), give a tree identical to `607ae78`.
- **Balance:** the bots over 1,000 seeds × 3 difficulties, before and after (see "Measured in the dry run").
- **Browser:** a sheet of every kind on the real surface (`paint-preview.png`), and solo and two-tab co-op checks of every interaction (`eva-preview.png`), in English and Vietnamese, with frame rates before and after.

## Global Constraints

- **No new runtime dependencies, and no new files in the page.** Browser code stays plain `<script>` files loaded in order by `index.html`; M4c changes only existing modules, so `index.html`, `sw.js` and its cache name `sol500-v4` stay as they are (the service worker fetches from the network first).
- **Worldgen determinism (spec §2.1):**
  - Points of interest use `hash`/`unit` only: integer hashing (`Math.imul`), no `Math.random`, no sin/cos/pow/hypot/atan2/exp.
  - A chunk comes out the same whatever was built before it; image chunks are rebuilt identically.
  - The pinned world hash moves on purpose twice: **`4f1ff5dc` → `59ba57b3`** (Task 2, landmarks) **→ `3ae4db5e`** (Task 3, structures). The finds hash **`0e84f5a1`** and the caves hash **`c656b50b`** must not change: a find or cave under a footprint keeps its index and is only hidden (`c.hidden.finds`, `c.hidden.caves`).
  - Chunk build time stays under the spec's 4 ms budget (dry run: slowest 2.66 ms).
- **Ids:** landmarks `"L<i>,<j>"` (256-tile cell), structures `"S<i>,<j>"` (64-tile cell), formations `"F<cx>,<cy>"` (data chunk); sites `"<landmark id>:<n>"` and `"<formation id>:0"`, which the find id pattern `"<cx>,<cy>:<n>"` can never match. Compare points of interest by id, never by object.
- **Canonical kinds:** structures `cache wreck weather mast pod array`; landmarks `delta tube crater methane scarp stardune`; formations `arch yardang hoodoo balanced ventifact layered deviltracks`; text keys `lm.<id>`, `fm.<id>`, `ks.<id>`.
- **Coordinates:** tiles are 64 px; the HQ is tile (0, 0). Every action position is in world pixels. In co-op the server uses the **last position it received**, never one in the request, with 1.5 tiles of slack (`D.EXPEDITION.reach`).
- **Numbers from the spec, unchanged:** landmarks in 60 % of 256-tile cells, at most 40×40, never within 60 tiles of the base, discovery 80–150 science (Scientist +50 %); structures one per 64-tile cell at 25–45 % by region, at least 20 tiles from the base, footprints 2×2 to 5×5; hold E: cache 3 s, wreck, weather station and mast 6 s (Engineer 3 s), solar array 5 s; weather station: fog within 24 tiles, +20 science; mast: the nearest landmark and every structure within 96 tiles; pod: one suit refill per crew member per round.
- **Text:**
  - Every player-facing string goes in `src/i18n.js` in English and Vietnamese (the key-parity test checks this).
  - Landmark and formation facts are real, each with its NASA/JPL source (13 sources, `LANDMARK_SOURCES`, `FORMATION_SOURCES`). Kestrel logs are fiction, always shown with `ks.label` ("Kestrel Survey log · story, fictional") and never with a source.
- **Commits:** one per task unless a step says otherwise, on `feat/m4c-points-of-interest`. Messages are imperative and prefixed (`feat(world):`, `feat(rules):`…), say why in the body, and end with exactly this line, not your own model name:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Line endings:** the working tree uses `core.autocrlf=true`; `git apply` handles the CRLF files by itself (checked). If you patch with a script instead, normalise endings first and write each file back with its own endings.
- **Before any browser check:** stop old servers on ports 5050–5079. Use **5071** for QA servers; Chrome refuses 5060 and 5061, and 5050–5059 are the user's app. One Chrome window, tabs; close each tab when its check is done; never type into a tab you didn't open. Don't run timed frame-rate checks while a `node --test` runs.

## Rulings made while planning (binding unless the user overrules them)

1. **The weather station's forecast** (approved by the user on 2026-10-21, "yes that what i want"; spec §13.11). The console has no look-ahead today; spec §4 says `mission.forecastBonus` and `E.forecast`. Instead: repairing a station sets `x.forecastUntil` to the round of the repair + 3, and while `X.forecastAhead(m)` returns a weather the top bar shows "Next round: {weather}" beside this round's weather chip (dashed, in that weather's colours). Nothing counts down at the advance, and it lives in the expedition state the save repair already covers.
2. **Structure loads go straight into the backpack;** what doesn't fit is left as a drop at the door, picked up with the existing `pickUp`. A cache holds 1–2 supplies (an O₂ canister, a spare kit or food, by the cargo pod's pick), a wreck 2–3 × 40 kg materials and a spare kit, an array 2 × 40 kg materials; all fixed by the structure's cell hash. `x.structures[id]` becomes `'used'` or `'repaired'`.
3. **Discovery.** The server allows a discovery from up to **15.5 tiles** from the landmark's centre (the rover's 10 on a crest, +4, +1.5 slack): weather and walking only shrink a view, so this never refuses a real sighting. The game asks when the centre comes inside the fog's own view, once while the answer is out, again 3 s after a refusal. The reward is `80 + hash % 71` by the landmark (the same in every mission of a world), ×1.5 for the Scientist, banked at once for the discoverer. Every refusal of `discover` and `refill` is silent: the player pressed nothing.
4. **Hab pods.** Cover is the footprint widened by the slack, its amber ring at the door. A refill is per pod, per crew member, per round (`x.refills[crewId]` holds pod ids; the round roll-over clears it). The game sends it while the tile under you is in the pod's 5×5 box, at most every 2 s. While you're inside, the pod is drawn as its room, its roof hidden.
5. **Lava tubes.** Cover on a `TUBE_FLOOR` or `SKYLIGHT` tile within the slack; the ring at the skylight. Inside, the view is the headlamp's, 8 tiles (10 in the rover) in any weather, and the roof hides; outside, the roof covers the walls and floor, the skylight's pit on it.
6. **Star dune crest:** `D.DANGERS.view.crest` = +4 tiles on the weather's view, in storms too.
7. **Comms masts:** marks are derived, never stored: `X.mastMarks(m)` gives, for each repaired mast, the nearest landmark by centre and every structure whose door is within 96 tiles of the mast's, as `[{ id, x, y, kind }]` in tiles. The maps draw a pale teal `?` on what isn't marked already.
8. **Formations don't block** (the spec is silent): no tile changes, so the world hash and reachability are untouched; at most one a chunk (chance 0.75), sizes arch, yardang, layered and dust-devil tracks 3×3, hoodoo, balanced rock and ventifact 2×2; about 1 in 3 has a survey site.
9. **Structure placement:** chance by the region at the door (Plains 0.45, Dune Sea 0.25, Crater Field 0.35, Canyon Lands 0.30, Icy Plains 0.35, Volcanic Flanks 0.30); "flat ground" means no landmark and no feature box touching the footprint or its 1-tile apron; footprints cache 2×2, wreck 3×2, weather 2×2, mast 2×2, array 4×2 (solid), pod 5×5 (a walled 3×3 floor with a door in its south wall). Every door is reachable within the §2.3 96×96 window.
10. **New tiles:** `SEDIMENT` 19 (delta fan), `SCARP` 20 (ice cliff, blocks, drawn standing up), `CREST` 21 (dune ridge, dune speed 0.7). `TUBE_WALL` stands up too; `STRUCT_WALL` is painted as the region's ground under its sprite.
11. **One card slot over the surface** (`store.card`, which replaces `store.regionCard`): a discovery (gold edge, the reward and finder), a formation's fact (with its source), a Kestrel log (teal edge, mono, `ks.label`, no source). Logs and formation facts show once per mission code; a discovery every time it happens.
12. **Achievements and the history record's `explore` counters wait for M4d.** M4c records `x.stats[crewId].landmarks/structures` for it. The bot leaves comms masts (it already knows the map).
13. **The heartbeat test runs 250 ms beats** (Task 1, Step 1). Its 50 ms beats dropped the healthy socket now and then when a busy `npm test` stalled the event loop for longer than one beat: after a stall, timers run before the socket is read. The game's own beat is 20 s.

## Review Focus

The five input classes or failure modes most likely to bite a real player that no feature test would naturally hit. Each has a test in the task that owns the code.

1. **A 3.4.0 save resumed after updating.** Its expedition has no `forecastUntil` and no M4c state. It must load, be repaired and play on, and the new actions must work on it.
   - *Covered by:* Task 5's "a mission saved by 3.4.0 loads with the points of interest's state…"; Task 11's browser step with a 3.4.0 save.
2. **Two crew members discover the same landmark at once, or the discoverer's answer and the server's event arrive in either order.** The reward is banked once; every tab shows one card; the loser's `known` is silent.
   - *Covered by:* Task 6's "a landmark is discovered once… every tab hears the discover event"; Task 10's "the discoverer's own tab hears of a discovery twice, in either order…" and "a refused discovery is asked again 3 s later… and opens no card".
3. **A full backpack at a structure.** What doesn't fit waits at the door and can be picked up later; the structure is done once.
   - *Covered by:* Task 5's "a wreck gives 2–3 metal loads and a spare kit… the rest is left at the door"; Task 10's "a structure says its own verb and seconds… loads that do not fit wait at the door".
4. **An old save's find ids under a new footprint.** Saved `sites` are keyed by a find's index in its chunk; a find under a landmark or structure must be hidden, not removed, so no index moves.
   - *Covered by:* the finds hash pin (`0e84f5a1`, Tasks 2 and 3); Task 3's "a find or a cave under a footprint is left out: findsIn, cavesIn and findById skip it, and collect refuses it"; Task 10's "a find or a cave under a point of interest is never offered, drawn or marked on the map".
5. **A solar flare caught inside a lava tube or a hab pod during a dust storm.** You're covered, and the headlamp still sees 8 tiles.
   - *Covered by:* Task 5's "a lava tube is cover on its floor and under its skylight…", "an abandoned hab pod is cover inside its footprint…" and "the view from the tile under you…"; Task 10's "the view is the headlamp's in a lava tube…"; Task 11's browser step.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/data.js` | modify | `LANDMARKS`, `STRUCTURES`, `FORMATIONS`, `DECOR` tables; `DANGERS.view.crest` |
| `src/worldgen.js` | modify | landmarks, structures, formations, decor; new tiles; `c.hidden`; `landmark`, `structure`, `landmarksNear`, `structuresNear`, `reachesOut`, `terrainTile` |
| `src/expedition.js` | modify | read helpers; site collection; `discover`, `interact`, `refill`, `forecastAhead`, `mastMarks`, `holdSeconds` for structures |
| `src/dangers.js` | modify | `coversIn` (pods, tubes, hidden caves left out), `shelterAt`, `slackOf`, `outside`, `act`, `viewAt` |
| `src/engine.js` | modify | `forecastUntil` in a new expedition and in the save repair |
| `lib/rooms.js`, `lib/ws.js` | modify | the new actions through the server; the `discover` event; a structure's fog to every tab |
| `tools/explorer.js`, `tools/balance.js` | modify | the thoughtful explorer uses the points of interest |
| `src/art.js` | modify | Kestrel, formation and prop sprites; the vent's puff |
| `src/surface-paint.js`, `src/surface-world.js`, `src/surface-map.js`, `src/surface.js` | modify | tiles, sprites, the tube's roof and darkness, the pod's room, map marks |
| `src/surface-eva.js` | modify | hidden readers, the view, prompts and holds, refill, discovery, sites |
| `src/ui.js`, `src/net.js`, `src/style.css` | modify | the card slot, story logs, the forecast chip, the co-op event |
| `src/i18n.js` | modify | facts, sources, logs, prompts and errors in English and Vietnamese |
| `test/worldgen-poi.test.js`, `test/i18n-poi.test.js`, `test/net.test.js`, `test/ui.test.js` | create | new tests |
| `test/*.test.js` (dangers, rooms, surface-eva, surface, worldgen, worldgen-caves, worldgen-finds, worldgen-reach, expedition, engine, explorer, art, surface-map, surface-paint, surface-world, i18n, ws) | modify | new and updated cases |
| spec §3, §4, §5, §12, §13; `docs/superpowers/plans/2026-10-21-sol500-m4c-followups.md`; `package.json`; `dist/` | modify/create | Task 11 |

Code blocks are unified diffs against the tree the previous tasks leave (three lines of context), generated from the dry run. Save a block to a file and `git apply` it, or apply it by hand. A new file's block is the whole file.

---

### Task 1: The cover rules and the solo dispatch (do these first)

The M4b follow-ups ask for this before any new cover: one cover lister, one place for the flare's slack, one list of what waits outside, one table of exploring actions, and the surface's checks reading the chunks it already holds. It also steadies the heartbeat test that a busy `npm test` could trip.

**Files:**
- Modify: `test/ws.test.js` (Step 1 only)
- Modify: `src/dangers.js`, `src/surface-eva.js`, `src/surface.js`, `src/ui.js`, `lib/rooms.js`
- Modify: `test/dangers.test.js`, `test/rooms.test.js`, `test/surface-eva.test.js`, `test/surface.test.js`
- Create: `test/ui.test.js` (loads `ui.js` in a small fake DOM)

**Interfaces:**
- Consumes: nothing new.
- Produces (`SolDangers`, `Z`):
  - `Z.coversIn(m, x0, y0, x1, y1, peek)` → `[{ kind, x, y }]`: every cover whose ring point lies in the box (tiles), the storm shelter first, then caves, across chunk borders. `peek(cx, cy)` gives the chunks the surface holds; without it the shared cache is read.
  - `Z.shelterAt(m, pos, slack, peek)`: reads the same lister; the base zone and the storm shelter need no chunk.
  - `Z.slackOf(m)` → `D.EXPEDITION.reach` (1.5) in co-op, 0 in solo: the one place the flare's verdict slack comes from (the server, the solo verdict, the banner).
  - `Z.outside(m)` → what waits outside this round, in order: a solar flare, dust devils, a dust storm, an O₂ leak (read by the round brief and the Expedition panel).
  - `Z.act(m, crewId, type, body, pos)`: the one table of exploring actions (the expedition's eight and the flare's two), run by solo play, `lib/rooms.js` and the tests; an unknown type answers `badAction`. `EXPEDITION_ACTIONS` (`lib/rooms.js:27`) stays the list a player may send.
  - The surface keeps `peek` from the last frame (`src/surface-eva.js`), so a frame never builds a chunk; `probe().dustY` for the sway test.

- [ ] **Step 1: Steady the heartbeat test** (Ruling 13)

```diff
diff --git a/test/ws.test.js b/test/ws.test.js
index 481e8c8..b43500d 100644
--- a/test/ws.test.js
+++ b/test/ws.test.js
@@ -235,15 +235,18 @@ test('one seat can hold three sockets but not a fourth', async t => {
 });
 
 test('a socket that stops answering pings is dropped; one that answers stays', async t => {
-  const { rooms, port } = await bare(t, { heartbeatMs: 50 });
+  // A beat longer than the event loop ever stalls in a busy `npm test`: after a stall, timers run before the socket is
+  // read, so a pong still unread when the next beat fires drops a healthy socket (50 ms beats did, now and then).
+  const heartbeatMs = 250;
+  const { rooms, port } = await bare(t, { heartbeatMs });
   const { room, player } = rooms.create('Host');
   const url = 'ws://127.0.0.1:' + port + seatPath(room, player);
   const silent = new WsClient(url, { autoPong: false });
   const healthy = new WsClient(url);
   await Promise.all([wsOpen(silent), wsOpen(healthy)]);
   assert.equal(await wsClosed(silent), 1006, 'terminated, not closed politely');
-  await new Promise(r => setTimeout(r, 200));
-  assert.equal(healthy.readyState, WsClient.OPEN);
+  await new Promise(r => setTimeout(r, 2 * heartbeatMs + 50));
+  assert.equal(healthy.readyState, WsClient.OPEN, 'still open two beats later');
   healthy.close();
 });
 
```

Run: `node --test --test-name-pattern="stops answering pings" test/ws.test.js`
Expected: PASS in about 1 s. Commit it on its own:

```bash
git add test/ws.test.js
git commit -m "test(ws): beats of 250 ms, so a stalled event loop can't drop the healthy socket" -m "After the event loop stalls, timers run before the socket is read, so a healthy client's pong still unread when the next 50 ms beat fired got it terminated now and then in a busy npm test. The game's own beat is 20 s.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing tests**

```diff
diff --git a/test/dangers.test.js b/test/dangers.test.js
index 2e44169..4c9cf63 100644
--- a/test/dangers.test.js
+++ b/test/dangers.test.js
@@ -8,6 +8,7 @@ const E = require('../src/engine.js');
 const W = require('../src/worldgen.js');
 const X = require('../src/expedition.js');
 const Z = require('../src/dangers.js');
+const SW = require('../src/surface-world.js');
 
 const T = 64;
 const KIT = { solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, spares: 3, materials: 1, food: 6, o2: 3, water: 3 };
@@ -41,6 +42,23 @@ test('you see 8 tiles around you in clear weather (10 in the rover), 5 in a regi
   assert.equal(Z.viewTiles(null, false), 8, 'no mission: clear');
 });
 
+test('what waits outside this round, in the order the brief and the Expedition panel say it: a solar flare, dust devils, a dust storm, an O₂ leak', () => {
+  const quiet = { spe: false, devil: false, weather: 'clear' };
+  assert.deepEqual(Z.outside(solo('DNG-OUT', quiet)), [], 'a quiet round');
+  const m = solo('DNG-OUT', { spe: true, devil: true, weather: 'regional' });
+  m.events = [{ type: 'o2_rupture', options: ['hide', 'salvage'], emergency: true }];
+  assert.deepEqual(Z.outside(m), ['flare', 'devils', 'storm', 'rupture']);
+  m.schedule[m.turn].weather = 'global';
+  assert.deepEqual(Z.outside(m), ['flare', 'devils', 'storm', 'rupture'], 'a global dust storm too');
+  for (const [round, want] of [[{ spe: true }, 'flare'], [{ devil: true }, 'devils'], [{ weather: 'global' }, 'storm']]) {
+    assert.deepEqual(Z.outside(solo('DNG-OUT', Object.assign({}, quiet, round))), [want], want + ' alone');
+  }
+  const leak = solo('DNG-OUT', quiet);
+  leak.events = [{ type: 'water_leak' }, { type: 'o2_rupture', options: ['hide', 'salvage'], emergency: true }];
+  assert.deepEqual(Z.outside(leak), ['rupture'], 'an O₂ leak alone, among other events');
+  assert.deepEqual(Z.outside(null), []);
+});
+
 test("cover from a flare: the base zone, a cave's mouth and the storm shelter once it is built; nowhere else", () => {
   const m = solo('DNG-CAVE');
   const k = nearestCave(m);
@@ -50,7 +68,7 @@ test("cover from a flare: the base zone, a cave's mouth and the storm shelter on
   assert.equal(Z.shelterAt(m, { x: (k.x + 0.5) * T, y: (k.y + 0.5 + 0.85) * T }), 'cave', '0.85 tiles out of the middle of the mouth');
   assert.equal(Z.shelterAt(m, { x: (k.x + 0.5) * T, y: (k.y + 0.5 + 0.95) * T }), null, '0.95 tiles out is in the open');
   assert.equal(Z.shelterAt(m, { x: (k.x + 0.5) * T, y: (k.y + 0.5 + 2) * T }, 1.5), 'cave', 'with 1.5 tiles of slack for a position sent a moment ago');
-  assert.equal(Z.shelterAt(m, at(30, 30)) === 'cave', Z.cavesNear(m, 30.5, 30.5, D.DANGERS.shelter).length > 0);
+  assert.equal(Z.shelterAt(m, at(30, 30)) === 'cave', Z.coversIn(m, 29.6, 29.6, 31.4, 31.4).some(c => Math.hypot(c.x - 30.5, c.y - 30.5) <= D.DANGERS.shelter));
   for (const junk of [null, {}, { x: NaN, y: 0 }, { x: 'a', y: 1 }]) assert.equal(Z.shelterAt(m, junk), null);
 });
 
@@ -71,6 +89,64 @@ test('the storm shelter covers you once it is built, also outside the base zone:
   assert.equal(Z.shelterAt(m, pos), null, 'no shelter without the module');
 });
 
+// Every cave of the data chunks within r chunks of the base's, at the middle of its mouth (tile units).
+function cavesAround(m, r) {
+  const out = [];
+  for (let cy = -r; cy < r; cy++) for (let cx = -r; cx < r; cx++) for (const k of X.cavesIn(m, cx, cy)) out.push({ kind: 'cave', x: k.x + 0.5, y: k.y + 0.5 });
+  return out;
+}
+const byPlace = list => list.slice().sort((a, b) => a.x - b.x || a.y - b.y);
+
+test('one lister for the cover in a box: every cave whose mouth has its middle in it, the edges included, across chunk borders', () => {
+  const m = solo('DNG-CAVE'), all = cavesAround(m, 6), near = cavesAround(m, 4);
+  assert.ok(near.length >= 4, 'caves to list: ' + near.length);
+  const inBox = (x0, y0, x1, y1) => all.filter(c => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1);
+  const boxes = [[-128, -128, 128, 128], [-40.25, -40.75, 40.25, 39.5]];
+  for (const c of near) boxes.push([c.x, c.y, c.x + 40, c.y + 40], [c.x - 40, c.y - 40, c.x, c.y]); // each cave on two boxes' edges
+  for (const box of boxes) assert.deepEqual(byPlace(Z.coversIn(m, ...box)), byPlace(inBox(...box)), box.join(', '));
+  const k = near[0];
+  assert.deepEqual(Z.coversIn(m, k.x - 0.4, k.y - 0.4, k.x - 0.1, k.y + 0.4), [], 'a box with no middle of a mouth in it lists none');
+});
+
+test('the lister has the storm shelter once it is built, at the middle of its tile and before any cave', () => {
+  const m = solo('DNG-CAVE');
+  m.layout = m.layout.filter(k => !(k.x === 8 && k.y === 2));
+  m.layout.push({ type: 'shelter', x: 8, y: 2 }); // world tile (4, 0)
+  assert.deepEqual(Z.coversIn(m, 3, -1, 6, 1), [], 'no module, no shelter');
+  m.modules.shelter.count = 1;
+  assert.deepEqual(Z.coversIn(m, 3, -1, 6, 1), [{ kind: 'shelter', x: 4.5, y: 0.5 }]);
+  assert.deepEqual(Z.coversIn(m, 4.6, -1, 6, 1), [], 'its middle is out of the box');
+  const big = Z.coversIn(m, -128, -128, 128, 128);
+  assert.deepEqual(big.map(c => c.kind), ['shelter', ...cavesAround(m, 4).map(() => 'cave')], 'first, then the caves');
+  m.modules.shelter.broken = 1;
+  assert.deepEqual(Z.coversIn(m, 3, -1, 6, 1), [], 'one that is broken is no shelter (as in shelterAt; none can break, BREAKDOWN.shelter is 0)');
+});
+
+test("the lister reads the chunks it is given: the surface passes the ones it holds, so asking never builds one in a frame", () => {
+  const m = solo('DNG-CAVE'), k = cavesAround(m, 4)[0];
+  const box = [k.x - 3, k.y - 3, k.x + 3, k.y + 3];
+  const world = SW.create(m.seed);
+  assert.deepEqual(Z.coversIn(m, ...box, world.peek), [], 'the surface holds none of those chunks yet');
+  assert.equal(world.stats().data, 0, 'and asking built none');
+  for (let cy = Math.floor(box[1] / W.CHUNK); cy <= Math.floor(box[3] / W.CHUNK); cy++) for (let cx = Math.floor(box[0] / W.CHUNK); cx <= Math.floor(box[2] / W.CHUNK); cx++) world.get(cx, cy);
+  assert.deepEqual(Z.coversIn(m, ...box, world.peek), Z.coversIn(m, ...box), "once it holds them, the same caves as the rules' own chunks");
+});
+
+test('shelterAt reads the chunks it is given, like the lister; the base zone and the storm shelter need none', () => {
+  const m = solo('DNG-CAVE'), k = cavesAround(m, 4)[0], mouth = { x: k.x * T, y: k.y * T }, none = () => null;
+  const world = SW.create(m.seed);
+  assert.equal(Z.shelterAt(m, mouth), 'cave');
+  assert.equal(Z.shelterAt(m, mouth, 0, none), null, 'a lookup that holds no chunk has no cave');
+  assert.equal(Z.shelterAt(m, mouth, 0, world.peek), null, 'nor has a surface that has not built that chunk');
+  world.get(Math.floor(k.x / W.CHUNK), Math.floor(k.y / W.CHUNK));
+  assert.equal(Z.shelterAt(m, mouth, 0, world.peek), 'cave', 'once it has');
+  assert.equal(Z.shelterAt(m, at(0, 1), 0, none), 'base');
+  m.layout = m.layout.filter(c => !(c.x === 8 && c.y === 2));
+  m.layout.push({ type: 'shelter', x: 8, y: 2 });
+  m.modules.shelter.count = 1;
+  assert.equal(Z.shelterAt(m, at(4, 0), 0, none), 'shelter');
+});
+
 test("a solar flare comes in a round whose schedule has one: the warning 30 s after the first step outside, the hit 60 s later", () => {
   const quiet = solo();
   assert.equal(Z.flareDue(quiet), false);
@@ -108,6 +184,15 @@ test('the flare hits whoever is out in the open when it ends, once; whoever has
   assert.deepEqual(Z.flareEnd(c, { minh: at(3, 0) }, D.EXPEDITION.reach, 90).hit, [], "co-op's slack: a step from the base zone counts as in it");
 });
 
+test("the flare's verdict gives a position the slack every checked action gets in co-op (1.5 tiles), and none in solo play", () => {
+  const m = solo('DNG-SLACK');
+  assert.equal(Z.slackOf(m), 0, 'solo play judges you where you are');
+  m.coop = true;
+  assert.equal(Z.slackOf(m), D.EXPEDITION.reach, 'the server judges where it saw you a moment ago');
+  assert.equal(D.EXPEDITION.reach, 1.5);
+  assert.equal(Z.slackOf(null), 0);
+});
+
 test('a solo pilot who collapsed sits out the round at the base: the flare never hits them, wherever their game last saw them', () => {
   const m = solo('DNG-BENCH', { spe: true });
   Z.flareStart(m, 0);
@@ -242,3 +327,18 @@ test('the dust devils of a sample of rounds, places and times match their pinned
   const PINNED = '2d741c4e';
   assert.equal(got, PINNED, 'devils hash is ' + got);
 });
+
+test('one table runs every exploring action a game asks for, solo or on the server; an action the rules do not have is refused, even one named like an object property', () => {
+  const m = solo('DNG-ACT', { spe: true });
+  assert.deepEqual(Z.act(m, 'minh', 'flareStart', { t: 5 }, at(6, 4)), { ok: true, flare: { warn: 35, end: 95, over: false, hit: [] } });
+  assert.deepEqual(Z.act(m, 'minh', 'flareEnd', { t: 95 }, at(3, 1)), { ok: true, hit: ['minh'] }, 'solo play: a step outside the base zone is in the open');
+  const c = solo('DNG-ACT', { spe: true });
+  c.coop = true;
+  Z.act(c, 'minh', 'flareStart', { t: 5 }, at(6, 4));
+  assert.deepEqual(Z.act(c, 'minh', 'flareEnd', { t: 95 }, at(3, 1)).hit, [], "on a co-op mission the verdict has the server's slack");
+  assert.deepEqual(Z.act(m, 'minh', 'revive', undefined, at(0, 1)), { error: 'solo' }, 'the rules, not the table, refuse a revive in solo play');
+  assert.deepEqual(Z.act(m, 'minh', 'collapse', undefined, at(30, 4)), { ok: true, benched: true }, 'no body reads as an empty one');
+  for (const type of ['fly', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined]) {
+    assert.deepEqual(Z.act(m, 'minh', type, {}, at(0, 1)), { error: 'badAction' }, String(type));
+  }
+});
diff --git a/test/rooms.test.js b/test/rooms.test.js
index 51e1b61..62f673a 100644
--- a/test/rooms.test.js
+++ b/test/rooms.test.js
@@ -613,6 +613,30 @@ test('co-op: the first step outside in a flare round starts the warning; 90 s la
   assert.ok(r.state.crew.find(c => c.id === 'minh').dose > m.crew.find(c => c.id === 'minh').dose + D.DANGERS.flare.dose - 1e-9);
 });
 
+test("co-op: the flare's verdict gives every position the slack every checked action gets: a step outside the base zone counts as in it", t => {
+  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e12 });
+  const { R, room, host, guest } = inMission();
+  const m = room.mission;
+  m.schedule[m.turn].spe = true;
+  R.position(room, guest, at(5, 0)); // past the base zone (tiles −2 to 2) and its 1.5 tiles of slack; this starts the flare
+  R.position(room, host, at(3, 0));  // the first tile outside the base zone, within the slack
+  t.mock.timers.tick(90000);
+  assert.equal(m.expedition.flare.over, true);
+  assert.deepEqual(m.expedition.flare.hit, ['minh'], 'lena, a step outside the base zone, has cover');
+});
+
+test('co-op: a player cannot start or end the solar flare (the server times it), although solo play asks the same table for both', t => {
+  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e12 });
+  const { R, room, guest } = inMission();
+  const m = room.mission;
+  m.schedule[m.turn].spe = true;
+  assert.equal(say(R, room, guest, 'flareStart', { t: 0 }).body.error, 'badAction');
+  assert.equal(m.expedition.flare, null);
+  R.position(room, guest, at(30, 0));
+  assert.equal(say(R, room, guest, 'flareEnd', { t: 999 }).body.error, 'badAction');
+  assert.equal(m.expedition.flare.over, false, 'the countdown runs on');
+});
+
 test('co-op: a round that ends before its flare hits calls the flare off, and a round without one never starts it', t => {
   t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e12 });
   const { R, room, host, guest } = inMission();
diff --git a/test/surface-eva.test.js b/test/surface-eva.test.js
index 816c9a8..c8ede6d 100644
--- a/test/surface-eva.test.js
+++ b/test/surface-eva.test.js
@@ -28,8 +28,9 @@ function element() {
 const ART = fs.readFileSync(path.join(__dirname, '..', 'src', 'art.js'), 'utf8');
 const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'surface-eva.js'), 'utf8');
 
-// A surface layer for a mission; hooks run the real rules on it (as ui.js does in solo play) and record every call, every
-// 2-second report and every dust-devil push. `clock.now` is the wall clock the layer reads (co-op's round clock runs on it).
+// A surface layer for a mission; hooks run the rules' one table on it (Z.act, as ui.js does in solo play and the server in
+// co-op) and record every call, every 2-second report and every dust-devil push. `clock.now` is the wall clock the layer
+// reads (co-op's round clock runs on it).
 function setup(opts) {
   const o = opts || {};
   const sandbox = { SolData: D, SolWorldgen: W, SolExpedition: X, SolDangers: Z, SolPaint: P, SolWorld: SW, document: { createElement: element } };
@@ -41,13 +42,7 @@ function setup(opts) {
   const hooks = {
     exp: (type, payload, pos) => {
       calls.push({ type, payload, pos });
-      const p = payload || {};
-      const run = {
-        collect: () => X.collect(m, me, p.find, pos), deliver: () => X.deliver(m, me, pos), collapse: () => X.collapse(m, me, pos, p.driven),
-        canister: () => X.useCanister(m, me, pos, p.suit), pickup: () => X.pickUp(m, me, p.drop, pos), revive: () => X.revive(m, me, p.target, pos),
-        flareStart: () => Z.flareStart(m, p.t), flareEnd: () => Z.flareEnd(m, { [me]: pos }, 0, p.t),
-      }[type];
-      return Promise.resolve(run ? run() : { ok: true });
+      return Promise.resolve(Z.act(m, me, type, payload, pos));
     },
     suit: r => reports.push(JSON.parse(JSON.stringify(r))),
   };
@@ -396,6 +391,51 @@ test("co-op: the banner and the red edge judge cover with the slack the server g
   assert.ok(s.eva.flareFx(spot).warn > warn, 'and grows');
 });
 
+// A 2D context that keeps the middle of every ellipse drawn: the amber rings round the cover.
+function ringRecorder() {
+  const at = [];
+  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'ellipse' ? (x, y) => at.push([x, y]) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
+  return { ctx, at };
+}
+
+test("while a flare's warning runs, the amber rings mark every cover the lister has in view, from the chunks the surface holds", () => {
+  const m = flareMission('EVA-RINGS');
+  m.layout = m.layout.filter(k => !(k.x === 8 && k.y === 2));
+  m.layout.push({ type: 'shelter', x: 8, y: 2 }); // world tile (4, 0)
+  m.modules.shelter.count = 1;
+  m.expedition.flare = { warn: 0, end: 600, over: false, hit: [] }; // the countdown runs from the start
+  const s = setup({ mission: m, t: say });
+  const view = [-64, -128, 1280, 1600]; // tiles −1 to 20 across and −2 to 25 down (world px): the storm shelter and a cave
+  const rings = world => { const r = ringRecorder(); s.eva.drawZone(r.ctx, ...view, world); return r.at; };
+  assert.deepEqual(rings(SW.create(m.seed)), [[4.5 * T, 0.5 * T + 6]], 'a surface that holds none of the chunks rings only the storm shelter');
+  for (const [cx, cy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) s.world.get(cx, cy);
+  const spots = Z.coversIn(m, view[0] / T - 1, view[1] / T - 1, view[2] / T + 1, view[3] / T + 1, s.world.peek);
+  assert.ok(spots.some(c => c.kind === 'cave'), 'a cave in view');
+  assert.deepEqual(rings(s.world), spots.map(c => [c.x * T, c.y * T + 6]), "every one of the lister's spots, and nothing else");
+  m.expedition.flare = null;
+  assert.deepEqual(rings(s.world), [], 'no rings without a warning');
+});
+
+test("the banner, the red edge and the in-cave note read the chunks the surface holds: a frame never builds one, so a cave not built yet is no cover on screen", () => {
+  const m = flareMission('EVA-RINGS');
+  m.expedition.flare = { warn: 0, end: 600, over: false, hit: [] };
+  const s = setup({ mission: m, t: say });
+  let k = null; // the cave nearest the HQ
+  for (let cy = -2; cy < 2; cy++) for (let cx = -2; cx < 2; cx++) for (const c of X.cavesIn(m, cx, cy)) if (!k || Math.hypot(c.x, c.y) < Math.hypot(k.x, k.y)) k = c;
+  const mouth = outside(k.x, k.y);
+  tick(s, NEAR(0, 1), 8.1); // the round brief's note goes after 8 s
+  const blind = { peek: () => null, region: (tx, ty) => s.world.region(tx, ty) }; // a surface with no chunk built yet
+  s.eva.step(0.1, mouth, blind, 0, null);
+  assert.equal(banner(s).msg, 'eva.flare.run', 'in the open, as far as this screen knows');
+  assert.ok(s.eva.flareFx(mouth).warn > 0, 'with the red edge');
+  assert.equal(noteOf(s), '', 'and no in-cave note');
+  s.world.get(SW.chunkOf(k.x), SW.chunkOf(k.y)); // the surface holds the chunk you stand in
+  s.eva.step(0.1, mouth, s.world, 0, null);
+  assert.equal(banner(s).msg, 'eva.flare.covered');
+  assert.equal(s.eva.flareFx(mouth).warn, 0, 'no red edge');
+  assert.equal(noteOf(s), 'eva.inCave');
+});
+
 // A dust devil, fully formed, far from the base, and the round clock when it is there.
 function formedDevil(m) {
   for (let t = 30; t < 400; t += 0.5) {
diff --git a/test/surface.test.js b/test/surface.test.js
index b93bff7..175f4a4 100644
--- a/test/surface.test.js
+++ b/test/surface.test.js
@@ -75,8 +75,8 @@ function element(tag) {
   return n;
 }
 
-// A page showing mission `m` as crew member `me`. Exploring actions run the real rules on the mission the page was last
-// shown, then show it again: ui.js renders the same mission after a solo action, and a co-op room broadcasts a new copy
+// A page showing mission `m` as crew member `me`. Exploring actions run the rules' one table (Z.act) on the mission the page
+// was last shown, then show it again: ui.js renders the same mission after a solo action, and a co-op room broadcasts a new copy
 // (a JSON copy here). sent: the positions teammates are sent; calls: the exploring actions asked for. Like ui.js, the page
 // is shown where its astronaut last stood (the solo save; `opts.lastPos` stands for the co-op server's position).
 // `opts.dpr` is the screen's pixel ratio (1); `opts.gfx` the Display settings the page passes to update (setGfx changes them).
@@ -109,14 +109,7 @@ function page(m, me, opts) {
   const hooks = {
     exp: (type, payload, pos) => {
       calls.push(type);
-      const p = payload || {};
-      const run = {
-        collect: () => X.collect(cur, me, p.find, pos), deliver: () => X.deliver(cur, me, pos), canister: () => X.useCanister(cur, me, pos, p.suit),
-        pickup: () => X.pickUp(cur, me, p.drop, pos), collapse: () => X.collapse(cur, me, pos, p.driven), revive: () => X.revive(cur, me, p.target, pos),
-        board: () => X.board(cur, me, pos), park: () => X.park(cur, me, pos, p.driven),
-        flareStart: () => Z.flareStart(cur, p.t), flareEnd: () => Z.flareEnd(cur, { [me]: pos }, 0, p.t),
-      }[type];
-      const r = run ? run() : { error: 'badAction' };
+      const r = Z.act(cur, me, type, payload, pos);
       if (!r.error) show(cur);
       return Promise.resolve(r);
     },
@@ -580,6 +573,19 @@ test('the FPS limit is an average: 30 on a 60 Hz screen draws 30 frames a second
   assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.01, 'evenly spaced draws, not ' + [...new Set(gaps.map(g => g.toFixed(1)))].join(' / ') + ' ms');
 });
 
+test('a new quality is drawn at once, even under an FPS limit: the resize cleared the canvas, so the next callback draws although no frame is due', () => {
+  const m = mission({ seed: 'CAP-3' });
+  const pg = page(m, 'minh', { gfx: { fpsCap: 30 } });
+  // One callback of a 144 Hz screen, 7 ms after the last: 1 if it drew. At a limit of 30 a frame is due 33 ms after the one before.
+  const one = () => pg.frames(144, 1 / 144);
+  pg.frames(144, 0.5);
+  let n = 0;
+  while (!one()) assert.ok(++n < 5, 'a frame is drawn at least every five callbacks');
+  assert.equal(one(), 0, 'the callback 7 ms after a drawn frame is skipped');
+  pg.setGfx({ quality: 'fast', fpsCap: 30 });
+  assert.equal(one(), 1, 'the callback 14 ms after it draws: the new quality resized the canvas, which cleared it');
+});
+
 test('the FPS limit does not slow the game: a skipped callback leaves its time to the next frame; the fps reading is the rate actually drawn', () => {
   const m = mission({ seed: 'CAP-2' });
   const run = cap => {
@@ -599,7 +605,7 @@ test('the FPS limit does not slow the game: a skipped callback leaves its time t
   assert.equal(slow.fps, 30, 'the reading is the rate of the frames drawn, not of the callbacks');
 });
 
-test("the camera's ease and the dust's drift keep real time: a 30 FPS limit and a 144 Hz screen look the same as 60 Hz", () => {
+test("the camera's ease and the dust's drift and sway keep real time: a 30 FPS limit and a 144 Hz screen look the same as 60 Hz", () => {
   const m = mission({ seed: 'REAL-1' });
   m.schedule[m.turn].weather = 'clear';
   // How far the camera trails a walker after a second of walking east: the astronaut's distance from the middle of the screen, in px.
@@ -617,17 +623,23 @@ test("the camera's ease and the dust's drift keep real time: a 30 FPS limit and
   assert.ok(at60 > 12 && at60 < 30, 'the camera trails a walker by about 20 px at 60 Hz: ' + at60);
   assert.ok(Math.abs(limited - at60) < 3, 'a 30 FPS limit trails ' + limited + ' px against ' + at60 + ' at 60 Hz');
   assert.ok(Math.abs(at144 - at60) < 3, '144 Hz trails ' + at144 + ' px against ' + at60 + ' at 60 Hz');
-  // The same grains of dust drift as far in a second at a 30 FPS limit as at 60 Hz (the wind of a clear sky is 18 px/s, and a grain adds 20 per unit of its size).
-  const pg = page(m, 'minh');
-  const drift = secs => { const from = pg.probe().dustX; pg.frames(60, secs); return pg.probe().dustX.map((x, i) => x - from[i]); };
-  pg.frames(60, 0.5);
-  const d60 = drift(1);
-  pg.setGfx({ fpsCap: 30 });
+  // The same grains of dust drift as far in a second at a 30 FPS limit as at 60 Hz (the wind of a clear sky is 18 px/s, and a grain adds 20 per unit of its size),
+  // and sway as far up or down. The sway is a sine of the clock, so the second at 60 Hz starts 2π s after the one at 30 FPS, at the
+  // same point of every grain's sway; the second at 30 FPS starts on a drawn frame, so it ends on one.
+  const pg = page(m, 'minh', { gfx: { fpsCap: 30 } });
+  const drift = secs => { const a = pg.probe(); pg.frames(60, secs); const b = pg.probe(); return b.dustX.map((x, i) => [x - a.dustX[i], b.dustY[i] - a.dustY[i]]); };
   pg.frames(60, 0.5);
+  assert.ok(pg.frames(60, 1 / 60) || pg.frames(60, 1 / 60), 'one of any two callbacks draws');
   const d30 = drift(1);
-  const both = d60.map((d, i) => [d, d30[i]]).filter(([a, b]) => a > 0 && b > 0); // a grain that went round the screen's edge says nothing
+  pg.setGfx({ fpsCap: 0 });
+  pg.frames(60, 2 * Math.PI - 1);
+  const d60 = drift(1);
+  const both = d60.map((d, i) => [d, d30[i]]).filter(([a, b]) => a[0] > 0 && b[0] > 0); // a grain that went round the screen's edge says nothing
   assert.ok(both.length > 20, 'most of the 39 grains stay on screen for both seconds: ' + both.length);
-  for (const [a, b] of both) assert.ok(Math.abs(b / a - 1) < 0.05, 'a grain drifts ' + b.toFixed(1) + ' px in a second at 30 FPS, ' + a.toFixed(1) + ' at 60 Hz');
+  for (const [a, b] of both) assert.ok(Math.abs(b[0] / a[0] - 1) < 0.05, 'a grain drifts ' + b[0].toFixed(1) + ' px in a second at 30 FPS, ' + a[0].toFixed(1) + ' at 60 Hz');
+  const swaying = both.filter(([a]) => Math.abs(a[1]) > 4); // at the turn of its sway a grain hardly moves up or down in a second
+  assert.ok(swaying.length > 15, 'most grains sway more than 4 px in a second: ' + swaying.length);
+  for (const [a, b] of swaying) assert.ok(Math.abs(b[1] / a[1] - 1) < 0.05, 'a grain sways ' + b[1].toFixed(1) + ' px in a second at 30 FPS, ' + a[1].toFixed(1) + ' at 60 Hz');
 });
 
 test('the FPS readout is hidden unless Show FPS is on; then it reads "<n> FPS", refreshed at most four times a second', () => {
diff --git a/test/ui.test.js b/test/ui.test.js
new file mode 100644
index 0000000..51e8e65
--- /dev/null
+++ b/test/ui.test.js
@@ -0,0 +1,174 @@
+'use strict';
+// The interface (src/ui.js) in a small fake DOM: the Display dialog, solo play's exploring hooks (the rules run on the spot,
+// and the save every 2 s), the dangers in the Expedition panel and the round report's flare line. ui.js is a browser script
+// whose only export is SolUI { store, render }, so it runs in a vm sandbox with the globals the page gives it, and a stub
+// SolSurface keeps the hooks the surface is mounted with and the data of its last update. The looks are checked in the browser.
+const test = require('node:test');
+const assert = require('node:assert/strict');
+const fs = require('node:fs');
+const path = require('node:path');
+const vm = require('node:vm');
+const I = require('../src/i18n.js');
+
+const T = 64;
+const SOURCES = ['data.js', 'engine.js', 'i18n.js', 'art.js', 'charts.js', 'worldgen.js', 'fog.js', 'expedition.js', 'dangers.js', 'ui.js']
+  .map(f => [f, fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')]);
+const en = (k, p) => I.t('en', k, p);
+const plain = v => JSON.parse(JSON.stringify(v));
+const at = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });
+
+// Just enough of a DOM for ui.js to render into: an element keeps its children, attributes and listeners.
+class El {
+  constructor(tag) { Object.assign(this, { tagName: String(tag).toUpperCase(), children: [], attrs: {}, listeners: {}, style: {}, dataset: {}, className: '', innerHTML: '', text: '' }); }
+  appendChild(c) { this.children.push(c); return c; }
+  append(...cs) { cs.forEach(c => this.appendChild(c)); }
+  replaceChildren(...cs) { this.children = []; this.append(...cs); }
+  setAttribute(k, v) { this.attrs[k] = String(v); }
+  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
+  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
+  querySelector() { return null; }
+  focus() {}
+  get content() { return { firstElementChild: new El('svg') }; } // a <template>'s, for the SVG pictures
+  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
+  set textContent(v) { this.text = String(v); this.children = []; }
+}
+const walk = (n, out) => { out.push(n); for (const c of n.children) if (c instanceof El) walk(c, out); return out; };
+const click = n => { for (const fn of n.listeners.click) fn({ target: n, currentTarget: n }); };
+
+// ui.js booted on a device whose localStorage holds `stored` (keys without the "sol500." prefix). Timers wait for flush().
+function page(stored) {
+  const ls = {}, timers = [], app = new El('div'), surface = { hooks: null, data: null };
+  for (const [k, v] of Object.entries(stored || {})) ls['sol500.' + k] = JSON.stringify(v);
+  const win = {
+    document: {
+      createElement: tag => new El(tag), createTextNode: text => ({ textContent: text }), getElementById: id => (id === 'app' ? app : null),
+      addEventListener() {}, head: new El('head'), documentElement: new El('html'), activeElement: null, querySelector: () => null,
+    },
+    localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
+    navigator: { language: 'en-US' }, location: { search: '', hostname: 'localhost', protocol: 'http:' },
+    addEventListener() {}, scrollTo() {}, Intl, console, setTimeout: fn => timers.push(fn), clearTimeout() {},
+    SolSurface: { mount: hooks => { surface.hooks = hooks; return new El('div'); }, update: data => { surface.data = data; } },
+  };
+  win.window = win.self = win;
+  win.Node = El;
+  vm.createContext(win);
+  for (const [f, code] of SOURCES) vm.runInContext(code, win, { filename: f });
+  const UI = win.SolUI, E = win.SolEngine;
+  const all = () => walk(app, []);
+  return {
+    UI, E, X: win.SolExpedition, ls, surface, all,
+    byKey: k => all().find(n => n.attrs['data-k'] === k),
+    dialog: () => all().find(n => n.attrs.role === 'dialog') || null,
+    flush() { while (timers.length) timers.shift()(); },
+    // A solo mission on the operations screen's surface tab, as after a launch.
+    play(m) { Object.assign(UI.store, { mission: m, plan: E.defaultPlan(m), screen: 'ops', opsView: 'surface', modal: null }); UI.render(); },
+    mission: o => E.createMission(Object.assign({ seed: 'UI-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' }, o)),
+  };
+}
+
+// ---------- the Display settings ----------
+
+test('the Display dialog opens from the top bar and from the operations header; a choice is saved at once, and the surface gets it', () => {
+  const pg = page();
+  const pressed = () => pg.all().filter(n => /^(gfx|fpsCap|showFps):/.test(n.attrs['data-k']) && n.attrs['aria-pressed'] === 'true').map(n => n.attrs['data-k']);
+  click(pg.all().find(n => n.tagName === 'BUTTON' && n.textContent === en('nav.display'))); // the title screen's top bar
+  assert.equal(pg.dialog().attrs['aria-label'], en('display.title'));
+  assert.deepEqual(pressed(), ['gfx:best', 'fpsCap:0', 'showFps:false'], 'the defaults: Best, Max, no readout');
+  for (const k of ['display.gfx', 'display.gfx.best.hint', 'display.fpsCap', 'display.fpsCap.hint', 'display.showFps']) assert.ok(pg.dialog().textContent.includes(en(k)), k);
+  click(pg.byKey('gfx:fast'));
+  click(pg.byKey('fpsCap:30'));
+  click(pg.byKey('showFps:true'));
+  assert.deepEqual(pressed(), ['gfx:fast', 'fpsCap:30', 'showFps:true']);
+  assert.ok(pg.dialog().textContent.includes(en('display.gfx.fast.hint')), "the hint follows the chosen level");
+  const saved = JSON.parse(pg.ls['sol500.settings']);
+  assert.deepEqual([saved.gfx, saved.fpsCap, saved.showFps], ['fast', 30, true], 'saved at once: there is no OK button');
+  click(pg.byKey('modal-close'));
+  assert.equal(pg.dialog(), null);
+  pg.play(pg.mission());
+  assert.deepEqual(plain(pg.surface.data.gfx), { quality: 'fast', fpsCap: 30, showFps: true }, 'the surface draws with them');
+  click(pg.all().find(n => n.tagName === 'BUTTON' && n.attrs['aria-label'] === en('nav.display'))); // the operations header's gear
+  click(pg.byKey('fpsCap:60'));
+  assert.equal(pg.surface.data.gfx.fpsCap, 60, 'and follows a change on the re-render');
+});
+
+test('a stored Display setting outside its set reads as the default; a valid one is kept, and so are the other settings', () => {
+  const pick = s => [s.gfx, s.fpsCap, s.showFps];
+  const junk = page({ settings: { gfx: 'ultra', fpsCap: 45, showFps: 'yes', difficulty: 'veteran' } });
+  assert.deepEqual(pick(junk.UI.store.settings), ['best', 0, false]);
+  assert.equal(junk.UI.store.settings.difficulty, 'veteran');
+  assert.deepEqual(pick(page({ settings: { gfx: 'fast', fpsCap: 60, showFps: true } }).UI.store.settings), ['fast', 60, true]);
+});
+
+// ---------- solo play's exploring hooks ----------
+
+test('solo: the exploring hook runs the rules on the spot for the pilot; the flare starts on the round clock and its end judges where you are, with no slack', async () => {
+  const pg = page(), m = pg.mission({ seed: 'UI-FLARE' });
+  m.schedule[m.turn].spe = true;
+  pg.play(m);
+  const exp = pg.surface.hooks.exp;
+  assert.deepEqual(plain(await exp('flareStart', { t: 5 }, at(6, 4))), { ok: true, flare: { warn: 35, end: 95, over: false, hit: [] } });
+  // One tile outside the base zone: a co-op server covers it with its 1.5 tiles of slack; solo judges where you are.
+  assert.deepEqual(plain(await exp('flareEnd', { t: 95 }, at(3, 1))), { ok: true, hit: ['minh'] });
+  assert.deepEqual(plain(m.expedition.incidents), [{ crewId: 'minh', kind: 'flare' }]);
+  assert.deepEqual(plain(await exp('fly', {}, at(3, 1))), { error: 'badAction' }, 'an action the rules do not have');
+  pg.flush();
+  assert.deepEqual(JSON.parse(pg.ls['sol500.save']).mission.expedition.incidents, [{ crewId: 'minh', kind: 'flare' }], 'and the mission is saved');
+});
+
+test("solo: every 2 s the surface's report is kept with the mission: the suit, the rover's distance, the round clock (it only goes up) and where you stand", async () => {
+  const pg = page(), m = pg.mission({ seed: 'UI-SAVE', loadout: Object.assign(pg.E.referenceKit('commander', 4), { rover: 1, waterwall: 0 }) });
+  pg.play(m);
+  const suit = pg.surface.hooks.suit;
+  suit({ suit: 90.5, driven: null, clock: 12.5, at: { x: 640, y: 200 } });
+  assert.equal(m.expedition.suits.minh, 90.5);
+  assert.equal(m.expedition.clock, 12.5);
+  assert.deepEqual(plain(m.expedition.where.minh), { x: 640, y: 200 });
+  assert.equal((await pg.surface.hooks.exp('board', {}, pg.X.bay(m))).ok, true, 'in the rover');
+  suit({ suit: 80, driven: 12, clock: 3, at: { x: 700.4, y: 210 } });
+  assert.equal(m.expedition.roverDriven, 12, "the driver's rover distance");
+  assert.equal(m.expedition.clock, 12.5, 'a clock that went back is ignored');
+  pg.UI.render();
+  assert.deepEqual(plain(pg.surface.data.lastPos), { x: 700, y: 210 }, 'the next look puts you back where you stood');
+  assert.equal(pg.surface.data.clock, null, 'solo play runs its own round clock');
+  pg.flush();
+  const saved = JSON.parse(pg.ls['sol500.save']).mission.expedition;
+  assert.deepEqual([saved.suits.minh, saved.clock, saved.where.minh], [80, 12.5, { x: 700, y: 210 }], 'and the save has them');
+});
+
+// ---------- the dangers in the Expedition panel and the round report ----------
+
+test('the Expedition panel lists what waits outside, in order: the solar flare as it stands, dust devils, a dust storm, an O₂ leak', () => {
+  const pg = page(), m = pg.mission({ seed: 'UI-COND' });
+  Object.assign(m.schedule[m.turn], { spe: true, devil: true, weather: 'regional' });
+  m.events = [{ type: 'o2_rupture', options: ['hide', 'salvage'], emergency: true }];
+  const rows = () => {
+    pg.UI.render();
+    const panel = pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('eva.title'));
+    const list = walk(panel, []).find(n => n.tagName === 'UL');
+    return panel.textContent.includes(en('eva.cond.title')) ? list.children.map(li => li.textContent) : [];
+  };
+  pg.play(m);
+  assert.deepEqual(rows(), [
+    en('eva.cond.flare', { d: 15, w: 30, c: 60 }), en('eva.cond.devils', { n: 2, s: 10 }), en('eva.cond.storm', { n: 5 }), en('eva.cond.rupture', { kg: 30 }),
+  ]);
+  m.expedition.flare = { warn: 35, end: 95, over: false, hit: [] };
+  assert.equal(rows()[0], en('eva.cond.flareOn'));
+  m.expedition.flare = { warn: 35, end: 95, over: true, hit: ['minh', 'lena'] };
+  assert.equal(rows()[0], en('eva.cond.flareHit', { names: en('name.minh') + ', ' + en('name.lena'), d: 15 }));
+  m.expedition.flare.hit = [];
+  assert.equal(rows()[0], en('eva.cond.flareSafe'));
+  pg.play(pg.mission({ seed: 'UI-QUIET' }));
+  assert.deepEqual(rows(), [], 'a quiet round lists nothing');
+});
+
+test("the round report says whom the solar flare caught (+15 mSv) and who collapsed", () => {
+  const pg = page(), m = pg.mission({ seed: 'UI-REP' });
+  m.expedition.incidents.push({ crewId: 'minh', kind: 'flare' }, { crewId: 'lena', kind: 'collapse' });
+  const { state, report } = pg.E.resolveTurn(m, pg.E.defaultPlan(m));
+  pg.play(state);
+  Object.assign(pg.UI.store, { report, modal: 'report' });
+  pg.UI.render();
+  const lines = walk(pg.dialog(), []).filter(n => n.tagName === 'LI').map(n => n.textContent);
+  assert.ok(lines.includes(en('rep.flare', { name: en('name.minh'), d: 15 })), lines.join(' | '));
+  assert.ok(lines.includes(en('rep.collapse', { name: en('name.lena'), h: 20, m: 3 })));
+});
```

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `node --test test/dangers.test.js test/rooms.test.js test/surface-eva.test.js test/surface.test.js test/ui.test.js`
Expected: 27 of 116 fail, among them "one lister for the cover in a box…", "the lister reads the chunks it is given…", "the flare's verdict gives a position the slack every checked action gets in co-op (1.5 tiles)…", "what waits outside this round, in the order the brief and the Expedition panel say it…", "one table runs every exploring action a game asks for…", "the banner, the red edge and the in-cave note read the chunks the surface holds…" and "the camera's ease and the dust's drift and sway keep real time…". The new `test/ui.test.js` cases fail because `ui.js` doesn't expose the hooks they drive yet.

- [ ] **Step 4: Write the cover rules and the dispatch**

```diff
diff --git a/lib/rooms.js b/lib/rooms.js
index cc7e33b..99f0edc 100644
--- a/lib/rooms.js
+++ b/lib/rooms.js
@@ -22,6 +22,8 @@ const FOG_KEYS_PER_MESSAGE = 64;
 const FOG_CHUNKS_MAX = 4096;
 const MAX_COORD = 64000000; // world pixels either way of the HQ: the world is endless, the numbers are not
 const PLAN_KEYS = ['modulesOn', 'rations', 'habMode', 'choices', 'answered', 'drainWall', 'builds', 'scrap', 'request'];
+// The exploring actions a player may send; the rules' one table (Z.act) runs them. Not the solar flare's two: the server
+// times the flare itself.
 const EXPEDITION_ACTIONS = ['collect', 'deliver', 'canister', 'pickup', 'collapse', 'revive', 'board', 'park'];
 
 const cleanName = (n, fallback) => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || fallback;
@@ -29,23 +31,6 @@ const newId = () => crypto.randomBytes(8).toString('hex');
 const ok = () => ({ status: 200, body: { ok: true } });
 const fail = (status, error) => ({ status, body: { error } });
 
-// Exploring actions (spec §5 trust model): checked against the last position this player's game sent, and against the
-// world the server builds itself from the mission code (src/expedition.js keeps a shared cache of 256 data chunks). The
-// player's game adds what only it knows: its live suit level (a canister) and how far the rover went (park, collapse).
-function expeditionAction(m, type, crewId, body, pos) {
-  switch (type) {
-    case 'collect': return X.collect(m, crewId, body.find, pos);
-    case 'deliver': return X.deliver(m, crewId, pos);
-    case 'canister': return X.useCanister(m, crewId, pos, body.suit);
-    case 'pickup': return X.pickUp(m, crewId, body.drop, pos);
-    case 'collapse': return X.collapse(m, crewId, pos, body.driven);
-    case 'revive': return X.revive(m, crewId, body.target, pos);
-    case 'board': return X.board(m, crewId, pos);
-    case 'park': return X.park(m, crewId, pos, body.driven);
-    default: return { error: 'badAction' }; // an action added to EXPEDITION_ACTIONS without a case here
-  }
-}
-
 function createRooms(opts = {}) {
   const rooms = new Map();
   const onEvent = opts.onEvent || (() => {});
@@ -147,7 +132,7 @@ function createRooms(opts = {}) {
       if (!now || now.turn !== turn || room.launch !== launch || room.phase !== 'ops') return;
       const spots = {};
       for (const p of Object.values(room.positions)) spots[p.crewId] = { x: p.x, y: p.y };
-      if (Z.flareEnd(now, spots, D.EXPEDITION.reach, age(room)).ok) broadcast(room);
+      if (Z.flareEnd(now, spots, Z.slackOf(now), age(room)).ok) broadcast(room);
     }, Math.max(0, (m.expedition.flare.end - age(room)) * 1000));
     if (room.flareTimer.unref) room.flareTimer.unref();
   }
@@ -443,10 +428,13 @@ function createRooms(opts = {}) {
       const perr = position(room, player, body);
       return perr ? fail(400, perr) : ok();
     }
+    // Exploring actions (spec §5 trust model): checked against the last position this player's game sent, and against the
+    // world the server builds itself from the mission code (src/expedition.js keeps a shared cache of 256 data chunks). The
+    // player's game adds what only it knows: its live suit level (a canister) and how far the rover went (park, collapse).
     if (EXPEDITION_ACTIONS.includes(body.type)) {
       if (room.phase !== 'ops' || !room.mission) return fail(400, 'badPhase');
       if (!player.crewId) return fail(400, 'noCrew');
-      const r = expeditionAction(room.mission, body.type, player.crewId, body, room.positions[player.crewId]);
+      const r = Z.act(room.mission, player.crewId, body.type, body, room.positions[player.crewId]);
       if (r.error) return fail(400, r.error);
       broadcast(room);
       return { status: 200, body: r };
diff --git a/src/dangers.js b/src/dangers.js
index b39ab8d..123135a 100644
--- a/src/dangers.js
+++ b/src/dangers.js
@@ -1,24 +1,34 @@
 /*
  * SOL 500 — dangers outside (spec §3.4): solar flares and the shelters that cover you from them, dust devils, and how far
- * you can see in a dust storm. Pure (no DOM), like src/expedition.js: the server runs the flare in co-op and ui.js runs it
- * in solo play, and every screen draws the same dust devils from the mission code and the round's clock, without syncing.
+ * you can see in a dust storm; and the one table of exploring actions (act). Pure (no DOM), like src/expedition.js: the
+ * server runs the flare in co-op and ui.js runs it in solo play, and every screen draws the same dust devils from the
+ * mission code and the round's clock, without syncing.
  *
  * The round's clock counts seconds since the round began: in solo play it is the surface's own time (it stops while the
  * console is open, like the suit) and is saved with the mission; in co-op it is the server's, sent with each room frame.
  * Positions are world pixels { x, y } (64 px a tile, the HQ tile's corner at 0, 0).
  *
  * API: viewTiles(m, inRover) → tiles you can see around you this round (dust storms shrink it)
- *      shelterAt(m, pos, slack) → 'base' | 'shelter' | 'cave' | null: what covers you from a solar flare at pos
- *      cavesNear(m, fx, fy, r) → caves whose mouth's middle is within r tiles of (fx, fy) (tile units)
+ *      outside(m) → what waits outside this round, in the order the round's brief and the Expedition panel say it: 'flare'
+ *        (a solar flare is due), 'devils' (a dust-devil round), 'storm' (a regional or global dust storm), 'rupture' (an O₂
+ *        line rupture at the base: canisters carried home count)
+ *      coversIn(m, x0, y0, x1, y1, peek) → [{ kind: 'shelter' | 'cave', x, y }]: the cover from a solar flare whose middle
+ *        (x, y) is in that box (tile units); DANGERS.shelter tiles from it count. peek(cx, cy) → a data chunk or null: the
+ *        surface passes the chunks it holds (SolWorld's peek); the rules leave it out
+ *      shelterAt(m, pos, slack, peek) → 'base' | 'shelter' | 'cave' | null: what covers you from a solar flare at pos
+ *      slackOf(m) → the slack (tiles) the flare's verdict gives a position: EXPEDITION.reach in co-op (the server judges
+ *        where it last saw you), 0 in solo play
  *      flareDue(m) → does a solar flare come this round (the schedule's spe)?
  *      flareStart(m, t) → { ok, flare } or { error }: someone stepped outside at round time t; the warning comes 30 s later
  *      flareEnd(m, spots, slack, t) → { ok, hit } or { error }: the flare hits. spots { crewId: pos } are the crew out on
  *        the map (the rest, and anyone sitting out the round after a solo collapse, are at the base); whoever has no cover
- *        gets a flare incident, counted at the advance
+ *        (with slackOf(m) as the slack) gets a flare incident, counted at the advance
  *      setClock(m, t) · clockOf(m) → the solo round clock kept with the mission (it only goes up within a round)
  *      devils(m, x0, y0, x1, y1, t) → [{ id, x, y, a, dx, dy, spin }] in that box (world px) at round time t;
  *        a: 0–1, how formed it is (it fades in and out); (dx, dy): the way it drifts
  *      devilHit(m, pos, t) → the formed devil close enough to hit you at pos, or null
+ *      act(m, crewId, type, body, pos) → the rules' answer to one exploring action ({ ok, ... } or { error }; 'badAction' for
+ *        one they do not have): the one table solo play and the co-op server both run
  */
 (function (root, factory) {
   if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./worldgen.js'), require('./engine.js'), require('./expedition.js'));
@@ -40,33 +50,50 @@
     return inRover ? Z.view.rover : Z.view.clear;
   }
 
+  // ---------- what waits outside this round ----------
+  // The surface's round brief and the console's Expedition panel both read this list, so a new danger is added here once;
+  // each says it in its own words (eva.brief.<id>, eva.cond.<id>).
+  function outside(m) {
+    const r = round(m) || {}, out = [];
+    if (flareDue(m)) out.push('flare');
+    if (r.devil) out.push('devils');
+    if (r.weather === 'regional' || r.weather === 'global') out.push('storm');
+    if (m && (m.events || []).some(e => e.type === 'o2_rupture')) out.push('rupture');
+    return out;
+  }
+
   // ---------- shelter from a solar flare ----------
-  function cavesNear(m, fx, fy, r) {
-    const out = [];
-    for (let cy = Math.floor((fy - r) / CH); cy <= Math.floor((fy + r) / CH); cy++) {
-      for (let cx = Math.floor((fx - r) / CH); cx <= Math.floor((fx + r) / CH); cx++) {
-        for (const k of X.cavesIn(m, cx, cy)) {
-          const dx = k.x + 0.5 - fx, dy = k.y + 0.5 - fy;
-          if (dx * dx + dy * dy <= r * r) out.push(k);
-        }
+  // Every cover whose middle is in the box (tile units, edges included): the built storm shelter (spec §3.4), then the caves'
+  // mouths. shelterAt, the surface's amber rings and its cover checks all read this one list, so lava-tube interiors and
+  // abandoned hab pods (M4c) join it here. peek(cx, cy) → a data chunk or null; without it the chunks are built.
+  function coversIn(m, x0, y0, x1, y1, peek) {
+    const out = [], chunk = peek || ((cx, cy) => X.chunkAt(m, cx, cy));
+    const add = (kind, x, y) => { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.push({ kind, x, y }); };
+    const sh = E.activeCount(m, 'shelter') > 0 ? m.layout.find(k => k.type === 'shelter') : null;
+    if (sh) add('shelter', sh.x + W.BASE_RECT.x + 0.5, sh.y + W.BASE_RECT.y + 0.5);
+    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) {
+      for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
+        const c = chunk(cx, cy);
+        if (c) for (const k of c.caves) add('cave', k.x + 0.5, k.y + 0.5);
       }
     }
     return out;
   }
-  // The base zone, the built storm shelter (spec §3.4) or a cave's mouth. `slack` (tiles) widens each for a position sent a
-  // moment ago. Lava tubes and hab pods (M4c) join the list here.
-  function shelterAt(m, pos, slack) {
+  // The base zone, or the first cover in the list within DANGERS.shelter tiles of its middle. `slack` (tiles) widens each
+  // for a position sent a moment ago; `peek` is the lister's.
+  function shelterAt(m, pos, slack, peek) {
     if (!m || !okPos(pos)) return null;
-    const s = slack || 0, r = Z.shelter + s;
+    const s = slack || 0, r = Z.shelter + s, fx = pos.x / T, fy = pos.y / T;
     if (X.inBaseZone(pos, s)) return 'base';
-    const sh = E.activeCount(m, 'shelter') > 0 ? m.layout.find(k => k.type === 'shelter') : null;
-    if (sh) {
-      const dx = pos.x / T - (sh.x + W.BASE_RECT.x + 0.5), dy = pos.y / T - (sh.y + W.BASE_RECT.y + 0.5);
-      if (dx * dx + dy * dy <= r * r) return 'shelter';
+    for (const k of coversIn(m, fx - r, fy - r, fx + r, fy + r, peek)) {
+      const dx = k.x - fx, dy = k.y - fy;
+      if (dx * dx + dy * dy <= r * r) return k.kind;
     }
-    if (cavesNear(m, pos.x / T, pos.y / T, r).length) return 'cave';
     return null;
   }
+  // The co-op server judges where it last saw you, a moment ago, so it gives you the slack every checked action gets; solo
+  // play judges you where you are. The server, the solo verdict and the surface's banner all ask here, so they agree.
+  const slackOf = m => (m && m.coop ? D.EXPEDITION.reach : 0);
 
   // ---------- the solar flare (spec §3.4) ----------
   function flareDue(m) { const r = round(m); return !!(r && r.spe); }
@@ -165,5 +192,29 @@
     return best;
   }
 
-  return { viewTiles, shelterAt, cavesNear, flareDue, flareStart, flareEnd, setClock, clockOf, devils, devilHit };
+  // ---------- the exploring actions, one table ----------
+  // What each action a game asks for runs in the rules (src/expedition.js, and the flare here). body holds what only the
+  // asking game knows: the find or the drop, its live suit level, how far the rover went, the round's clock. Solo play's hook
+  // (ui.js) runs any of them on the spot; the co-op server runs those its players may send (EXPEDITION_ACTIONS in
+  // lib/rooms.js), never the flare's two, because it times the flare itself. A new action is one line here.
+  const ACTIONS = {
+    collect: (m, id, b, pos) => X.collect(m, id, b.find, pos),
+    deliver: (m, id, b, pos) => X.deliver(m, id, pos),
+    canister: (m, id, b, pos) => X.useCanister(m, id, pos, b.suit),
+    pickup: (m, id, b, pos) => X.pickUp(m, id, b.drop, pos),
+    collapse: (m, id, b, pos) => X.collapse(m, id, pos, b.driven),
+    revive: (m, id, b, pos) => X.revive(m, id, b.target, pos),
+    board: (m, id, b, pos) => X.board(m, id, pos),
+    park: (m, id, b, pos) => X.park(m, id, pos, b.driven),
+    // Solo play's flare (spec §3.4): your first step outside starts it on the round's clock; at its end you are hit unless
+    // you have cover (the rest of the crew is at the base, and so are you if you sit out the round after a collapse).
+    flareStart: (m, id, b) => flareStart(m, b.t),
+    flareEnd: (m, id, b, pos) => flareEnd(m, { [id]: pos }, slackOf(m), b.t),
+  };
+  function act(m, crewId, type, body, pos) {
+    const run = Object.prototype.hasOwnProperty.call(ACTIONS, type) ? ACTIONS[type] : null;
+    return run ? run(m, crewId, body || {}, pos) : { error: 'badAction' };
+  }
+
+  return { viewTiles, outside, coversIn, shelterAt, slackOf, flareDue, flareStart, flareEnd, setClock, clockOf, devils, devilHit, act };
 });
diff --git a/src/surface-eva.js b/src/surface-eva.js
index 0f32ac1..71a1814 100644
--- a/src/surface-eva.js
+++ b/src/surface-eva.js
@@ -52,6 +52,7 @@
     let now = 0, deliverAt = -1e9, collapseAt = -1e9, reportAt = -1e9, marksAt = -1e9, marksCache = [];
     let soloClock = 0, coopClock = null, hitAt = -1e9, flareAskAt = -1e9, flareEndAt = -1e9, warned = false;
     let note = null;                               // { text, cls, until }
+    let peek = null;                               // the chunks the surface holds (SolWorld's peek), from the last frame
 
     const mission = () => (data && data.mission) || null;
     const exp = () => mission().expedition;
@@ -91,9 +92,10 @@
     const text = (n, k, v) => { if (shown[k] !== v) { shown[k] = v; n.textContent = v; } };
     const prop = (k, v, set) => { if (shown[k] !== v) { shown[k] = v; set(v); } };
 
-    // Are you under cover from the flare? In co-op the server judges with the slack every checked action gets (it knows
-    // where you were a moment ago), so the banner and the red edge ask the same; solo has none.
-    const covered = p => !!(p && Z.shelterAt(mission(), p, mission().coop ? XD.reach : 0));
+    // Are you under cover from the flare? The banner and the red edge ask with the slack the verdict gives (Z.slackOf: the
+    // co-op server's, none in solo play), so they agree with it. Like the in-cave note, it reads the chunks the surface
+    // holds, so asking every frame never builds one.
+    const covered = p => !!(p && Z.shelterAt(mission(), p, Z.slackOf(mission()), peek));
     // The flare as your astronaut sees it: null, or { cls, msg, left (seconds, or null) } for the banner.
     function flareView(p) {
       const m = mission(), f = m && m.expedition && m.expedition.flare;
@@ -119,7 +121,7 @@
       const atBase = !!p && X.inBaseZone(p);
       if (live() && pack().length >= X.capacity(mission(), me) && !atBase) return { text: t('eva.full'), cls: '' };
       if (live() && suit <= XD.suit * 0.2 && !atBase) return { text: t('eva.low'), cls: 'crit' };
-      if (live() && p && !atBase && Z.shelterAt(mission(), p, 0) === 'cave') return { text: t('eva.inCave'), cls: 'ok' };
+      if (live() && p && !atBase && Z.shelterAt(mission(), p, 0, peek) === 'cave') return { text: t('eva.inCave'), cls: 'ok' };
       return null;
     }
     // The canister button shows only when breathing one now is worth it: outside, on your feet, and with room for all 45 s.
@@ -191,15 +193,10 @@
       });
     }
 
-    // What is waiting outside this round, said once a round when you first look at it.
+    // What is waiting outside this round (Z.outside), said once a round when you first look at it.
     function brief(m) {
-      const r = m.schedule && m.schedule[m.turn];
-      if (!r) return;
-      const list = [];
-      if (Z.flareDue(m)) list.push(t('eva.brief.flare'));
-      if (r.devil) list.push(t('eva.brief.devils'));
-      if (r.weather === 'regional' || r.weather === 'global') list.push(t('eva.brief.storm', { n: Z.viewTiles(m, false) }));
-      if ((m.events || []).some(e => e.type === 'o2_rupture')) list.push(t('eva.brief.rupture'));
+      const params = { storm: { n: Z.viewTiles(m, false) } };
+      const list = Z.outside(m).map(k => t('eva.brief.' + k, params[k]));
       if (list.length) say(t('eva.brief', { list: list.join(', ') }), 'warn', 8);
     }
 
@@ -239,7 +236,7 @@
     // A new mission or room (SolSurface.reset): nothing of the last one's exploring carries over, so the next sync is a
     // fresh look even with the same astronaut in the same round.
     function reset() {
-      data = me = turn = hold = note = coopClock = null;
+      data = me = turn = hold = note = coopClock = peek = null;
       wasDown = keyHeld = warned = false;
       suit = XD.suit;
       driven = soloClock = 0;
@@ -260,6 +257,7 @@
 
     function step(dt, p, world, moved, focus) {
       now += dt;
+      peek = world.peek;
       const m = mission();
       if (m && m.expedition && m.status === 'active' && !coopClock) soloClock += dt;
       if (live()) {
@@ -393,7 +391,7 @@
     // ---------- drawing ----------
     const warning = () => { const f = mission() && mission().expedition && mission().expedition.flare; return !!f && !f.over && clock() >= f.warn; };
     // The base zone: where the suit pauses and loads are delivered (5 × 5 tiles around the HQ). While a flare's warning
-    // runs, it and every other cover in view (cave mouths, the storm shelter) pulse amber.
+    // runs, it and every cover in view (Z.coversIn, from the chunks the surface holds) pulse amber.
     function drawZone(ctx, x0, y0, x1, y1, world) {
       if (!mission() || !mission().expedition) return;
       const m = mission(), r = (XD.baseZone + 0.5) * T, warn = warning(), pulse = 0.5 + 0.5 * Math.sin(now * 6);
@@ -405,20 +403,10 @@
       ctx.stroke();
       ctx.setLineDash([]);
       if (warn && world) {
-        const spots = [];
-        for (let cy = SW.chunkOf(Math.floor(y0 / T) - 1); cy <= SW.chunkOf(Math.floor(y1 / T) + 1); cy++) {
-          for (let cx = SW.chunkOf(Math.floor(x0 / T) - 1); cx <= SW.chunkOf(Math.floor(x1 / T) + 1); cx++) {
-            const c = world.peek(cx, cy);
-            if (c) for (const k of c.caves) spots.push([(k.x + 0.5) * T, (k.y + 0.5) * T]);
-          }
-        }
-        const sh = m.modules.shelter && m.modules.shelter.count > 0 ? m.layout.find(k => k.type === 'shelter') : null;
-        if (sh) spots.push([(sh.x + W.BASE_RECT.x + 0.5) * T, (sh.y + W.BASE_RECT.y + 0.5) * T]);
         ctx.strokeStyle = 'rgba(242,184,79,' + (0.5 + 0.45 * pulse).toFixed(3) + ')';
         ctx.lineWidth = 3;
-        for (const [cx, cy] of spots) {
-          if (cx < x0 - T || cx > x1 + T || cy < y0 - T || cy > y1 + T) continue;
-          ctx.beginPath(); ctx.ellipse(cx, cy + 6, 26 + 5 * pulse, 12 + 2 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
+        for (const k of Z.coversIn(m, x0 / T - 1, y0 / T - 1, x1 / T + 1, y1 / T + 1, world.peek)) {
+          ctx.beginPath(); ctx.ellipse(k.x * T, k.y * T + 6, 26 + 5 * pulse, 12 + 2 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
         }
       }
       ctx.restore();
diff --git a/src/surface.js b/src/surface.js
index fe76a22..699be2f 100644
--- a/src/surface.js
+++ b/src/surface.js
@@ -1186,7 +1186,7 @@
       tile: [tx, ty], region: S.region == null ? null : W.REGIONS[S.region], fps: Math.round(S.fps), mapOpen: S.map.isOpen(),
       world: S.world && S.world.stats(), paint: S.painter && S.painter.stats(), seen: (x, y) => S.world.seen(x, y),
       eva: S.eva.state(), focusKey: S.focus && S.focus.key, view: S.eva.view(S.player), push: S.player.push ? Object.assign({}, S.player.push) : null,
-      hint: !S.hint.hidden, alert: S.eva.alerting(), dust: S.particles.length, dustX: S.particles.map(q => q.x),
+      hint: !S.hint.hidden, alert: S.eva.alerting(), dust: S.particles.length, dustX: S.particles.map(q => q.x), dustY: S.particles.map(q => q.y),
     };
   }
 
diff --git a/src/ui.js b/src/ui.js
index 1c29012..15c8767 100644
--- a/src/ui.js
+++ b/src/ui.js
@@ -735,24 +735,15 @@
       showRegionCard(id);
     },
     reopenRegion: id => { if (W.REGIONS.includes(id)) reopenRegionCard(id); },
-    // Exploring (src/expedition.js). Solo: the rules run here on your mission, which is saved. Co-op: the server runs them
-    // against where it last saw you, and everyone gets the new room. Always resolves to { ok, ... } or { error }.
+    // Exploring (the rules' one table, Z.act). Solo: the rules run here for your pilot on your mission, which is saved, and
+    // that includes the solar flare. Co-op: the server runs them against where it last saw you, and everyone gets the new
+    // room. Always resolves to { ok, ... } or { error }.
     exp: (type, payload, pos) => {
       const s = mission();
       if (!s || !s.expedition || s.status !== 'active') return Promise.resolve({ error: 'badPhase' });
       const p = payload || {};
       if (lanOn()) return N.act(type, p).then(r => (r && (!r.error || I.has(store.lang, 'eva.err.' + r.error)) ? r : { error: 'net' }), () => ({ error: 'net' }));
-      const id = s.pilot;
-      const run = {
-        collect: () => X.collect(s, id, p.find, pos), deliver: () => X.deliver(s, id, pos), canister: () => X.useCanister(s, id, pos, p.suit),
-        pickup: () => X.pickUp(s, id, p.drop, pos), collapse: () => X.collapse(s, id, pos, p.driven), board: () => X.board(s, id, pos),
-        park: () => X.park(s, id, pos, p.driven),
-        // The solo flare (spec §3.4): your first step outside starts it on the round's clock; at its end you are hit unless
-        // you have cover (the rest of the crew is at the base, and so are you if you sit out the round after a collapse).
-        flareStart: () => Z.flareStart(s, p.t),
-        flareEnd: () => Z.flareEnd(s, { [id]: pos }, 0, p.t),
-      }[type];
-      const r = run ? run() : { error: 'badAction' };
+      const r = Z.act(s, s.pilot, type, p, pos);
       if (!r.error) { saveSoloSoon(); render(); }
       return Promise.resolve(r);
     },
@@ -777,18 +768,18 @@
       amount: t('haul.' + l.res, { n: nf(l.amount) }), what: t('find.' + l.kind), region: t('region.' + W.REGIONS[l.region]), name: crewName(l.crewId),
     });
   }
-  // What is waiting outside this round (spec §3.4): a solar flare, dust devils, a dust storm, an oxygen leak at the base.
+  // What is waiting outside this round (Z.outside, spec §3.4): a solar flare, dust devils, a dust storm, an oxygen leak at the base.
   function conditions(s) {
-    const r = s.schedule[s.turn] || {}, f = s.expedition.flare, out = [];
-    if (Z.flareDue(s)) {
+    const on = Z.outside(s), f = s.expedition.flare, out = [];
+    if (on.includes('flare')) {
       if (!f) out.push(['crit', 'warn', t('eva.cond.flare', { d: D.DANGERS.flare.dose, w: D.DANGERS.flare.delay, c: D.DANGERS.flare.countdown })]);
       else if (!f.over) out.push(['crit', 'warn', t('eva.cond.flareOn')]);
       else if (f.hit.length) out.push(['warn', 'warn', t('eva.cond.flareHit', { names: f.hit.map(crewName).join(', '), d: D.DANGERS.flare.dose })]);
       else out.push(['ok', 'ok', t('eva.cond.flareSafe')]);
     }
-    if (r.devil) out.push(['warn', 'eva', t('eva.cond.devils', { n: D.DANGERS.devils.push, s: D.DANGERS.devils.suit })]);
-    if (r.weather === 'regional' || r.weather === 'global') out.push(['warn', 'warn', t('eva.cond.storm', { n: Z.viewTiles(s, false) })]);
-    if ((s.events || []).some(e => e.type === 'o2_rupture')) out.push(['', 'o2', t('eva.cond.rupture', { kg: D.EXPEDITION.canister.o2 })]);
+    if (on.includes('devils')) out.push(['warn', 'eva', t('eva.cond.devils', { n: D.DANGERS.devils.push, s: D.DANGERS.devils.suit })]);
+    if (on.includes('storm')) out.push(['warn', 'warn', t('eva.cond.storm', { n: Z.viewTiles(s, false) })]);
+    if (on.includes('rupture')) out.push(['', 'o2', t('eva.cond.rupture', { kg: D.EXPEDITION.canister.o2 })]);
     return out;
   }
   function expeditionPanel(s) {
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: the Step 3 command, then `npm test`.
Expected: PASS; 372 tests.

- [ ] **Step 6: Commit**

```bash
git add src/dangers.js src/surface-eva.js src/surface.js src/ui.js lib/rooms.js test/dangers.test.js test/rooms.test.js test/surface-eva.test.js test/surface.test.js test/ui.test.js
git commit -m "refactor(dangers): one cover lister, one slack, one list of what waits outside, one action table" -m "The M4b follow-ups' 'do these first': shelterAt, the amber rings, the banner and the server read Z.coversIn from the chunks the surface holds, so a frame never builds one; solo play, the server and the tests run Z.act. ui.js gets a fake-DOM test harness.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: World I — the tables, the shared cache, and landmarks

**Files:**
- Modify: `src/data.js`, `src/worldgen.js`, `src/expedition.js`
- Modify: `test/expedition.test.js`, `test/worldgen-caves.test.js`, `test/worldgen-finds.test.js`, `test/worldgen-reach.test.js`, `test/worldgen.test.js`
- Create: `test/worldgen-poi.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `D.LANDMARKS`, `D.STRUCTURES`, `D.FORMATIONS` (`SolData`): per kind its regions, size, hold times by role, rewards and text keys (`fact: 'lm.<id>'`, `log: 'ks.<id>'`), as spec §3.6/§3.7.
  - `W.landmark(seed, i, j)` → `null` or a frozen `{ id: 'L<i>,<j>', kind, x, y, box: [x0, y0, x1, y1], sites }` (tiles); `W.landmarksNear(seed, x0, y0, x1, y1)`.
  - `chunk()` gains `landmarks` (every landmark whose box touches it, the same id in each) and `hidden: { finds: [n], caves: [n] }` (indices of finds and caves under a footprint; the arrays themselves are unchanged).
  - A landmark site is a find-like `{ id: '<landmark id>:<n>', x, y, kind, sub }`; `sub` is the landmark's kind (`delta`, `crater`), the methane vent's is `vent`.
  - The shared world cache's chunks are frozen; a find id from a chunk other than the one you stand in is refused before that chunk is built.
  - New tile codes `SEDIMENT` 19, `SCARP` 20, `CREST` 21; `TUBE_FLOOR`, `TUBE_WALL`, `SKYLIGHT` now used.

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/test/expedition.test.js b/test/expedition.test.js
index 5267e5c..d967be4 100644
--- a/test/expedition.test.js
+++ b/test/expedition.test.js
@@ -67,6 +67,30 @@ test('a find has exactly one id: odd spellings, made-up finds and bad positions
   assert.equal(snap(m), before);
 });
 
+test('a find id from another chunk than the one you stand in is refused before that chunk is built', () => {
+  const m = solo(), f = first(m, 'metal'), before = snap(m);
+  const real = W.chunk;
+  let built = 0;
+  W.chunk = (...args) => { built++; return real(...args); };
+  try {
+    for (const id of ['4000,4000:0', '-3999,17:2', (f.cx + 1) + ',' + f.cy + ':0']) {
+      assert.equal(X.collect(m, 'minh', id, at(f.x, f.y)).error, 'tooFar', id);
+    }
+  } finally { W.chunk = real; }
+  assert.equal(built, 0, 'no chunk was built for them');
+  assert.equal(snap(m), before);
+});
+
+test('nobody can change the shared world cache: the chunk, its finds and its caves are frozen', () => {
+  const m = solo(), f = first(m, 'metal');
+  const finds = X.findsIn(m, f.cx, f.cy);
+  assert.ok(Object.isFrozen(finds) && finds.every(Object.isFrozen));
+  assert.throws(() => { finds[0].x = 99; }, TypeError);
+  assert.throws(() => { finds.push({}); }, TypeError);
+  assert.ok(Object.isFrozen(X.cavesIn(m, f.cx, f.cy)));
+  assert.ok(Object.isFrozen(X.chunkAt(m, f.cx, f.cy)), 'nobody can swap a list for another');
+});
+
 test('a find runs out, and the backpack holds 3 loads on foot', () => {
   const m = solo(), f = first(m, 'ice', g => D.FINDS.ice.loads[g.ring] >= 4);
   for (let i = 0; i < 3; i++) assert.equal(X.collect(m, 'minh', f.id, at(f.x, f.y)).ok, true);
diff --git a/test/worldgen-caves.test.js b/test/worldgen-caves.test.js
index d3968dd..78e0b78 100644
--- a/test/worldgen-caves.test.js
+++ b/test/worldgen-caves.test.js
@@ -21,9 +21,12 @@ test('a cave opens in the south face of a mesa or a canyon wall: its mouth is th
         const lx = k.x - cx * 32, ly = k.y - cy * 32;
         assert.ok(lx >= 0 && lx < 32 && ly >= 1 && ly < 32, `cave ${cx},${cy}:${i} has its mouth and its wall in its chunk`);
         const mouth = W.tileOf(c, lx, ly), wall = W.tileOf(c, lx, ly - 1);
-        assert.equal(W.BLOCKING[mouth], 0, 'the mouth is open ground');
-        assert.notEqual(mouth, T.BASE);
-        assert.ok(wall === T.CLIFF || wall === T.CANYON_WALL, 'the wall is a mesa cliff or a canyon wall, not ' + wall);
+        // A cave under a point of interest is hidden, never shown: the footprint drew its own tiles over it.
+        if (!c.hidden.caves.includes(i)) {
+          assert.equal(W.BLOCKING[mouth], 0, 'the mouth is open ground');
+          assert.notEqual(mouth, T.BASE);
+          assert.ok(wall === T.CLIFF || wall === T.CANYON_WALL, 'the wall is a mesa cliff or a canyon wall, not ' + wall);
+        }
         assert.equal(k.region, W.regionOf(c, lx, ly), "its region is its mouth's");
         assert.ok(!inFlat(k.x, k.y), 'never in the flat zone round the base');
       });
diff --git a/test/worldgen-finds.test.js b/test/worldgen-finds.test.js
index 05420c3..c357b29 100644
--- a/test/worldgen-finds.test.js
+++ b/test/worldgen-finds.test.js
@@ -36,8 +36,11 @@ test('every find stands on open ground inside its chunk, outside the flat zone,
       const lx = f.x - c.cx * 32, ly = f.y - c.cy * 32;
       assert.ok(lx >= 3 && ly >= 3 && lx <= 28 && ly <= 28, `find ${c.cx},${c.cy}:${i} is 3 tiles inside its chunk`);
       const code = W.tileOf(c, lx, ly);
-      assert.equal(W.BLOCKING[code], 0, 'on open ground');
-      assert.notEqual(code, T.BASE);
+      // A find under a point of interest is hidden, never shown: the footprint drew its own tiles over it.
+      if (!c.hidden.finds.includes(i)) {
+        assert.equal(W.BLOCKING[code], 0, 'on open ground');
+        assert.notEqual(code, T.BASE);
+      }
       assert.ok(!inFlat(f.x, f.y), 'outside the flat zone');
       assert.equal(f.region, W.regionOf(c, lx, ly), 'its region is the region of its tile');
       assert.equal(f.ring, W.ringOf(f.x, f.y));
@@ -92,6 +95,22 @@ test('every crater centre a chunk owns holds an ice deposit', () => {
   assert.ok(craters > 5, 'craters checked: ' + craters);
 });
 
+test('every canyon middle a chunk owns holds an ice deposit', () => {
+  let canyons = 0;
+  for (let s = 0; s < 5; s++) {
+    const seed = W.seedOf('CANYON-ICE-' + s);
+    for (const k of W.featuresNear(seed, -1024, -1024, 1023, 1023).canyons) {
+      // The middle of the canyon's middle bend.
+      const x = Math.floor((k.pts[1][0] + k.pts[2][0]) / 2), y = Math.floor((k.pts[1][1] + k.pts[2][1]) / 2);
+      const cx = Math.floor(x / 32), cy = Math.floor(y / 32), lx = x - cx * 32, ly = y - cy * 32;
+      if (lx < 3 || ly < 3 || lx > 28 || ly > 28 || inFlat(x, y)) continue;
+      canyons++;
+      assert.ok(W.chunk(seed, cx, cy).finds.some(f => f.kind === 'ice' && f.x === x && f.y === y), `canyon at ${x},${y} has ice`);
+    }
+  }
+  assert.ok(canyons > 50, 'canyon middles checked: ' + canyons);
+});
+
 test('the rings end 20, 40 and 80 tiles out, finds are thinner per tile nearer the base, and the Dune Sea has the fewest', () => {
   // A ring is a straight-line distance from the HQ and includes its outer edge.
   assert.deepEqual(W.RINGS, [20, 40, 80]);
diff --git a/test/worldgen-poi.test.js b/test/worldgen-poi.test.js
new file mode 100644
index 0000000..bf552ec
--- /dev/null
+++ b/test/worldgen-poi.test.js
@@ -0,0 +1,234 @@
+'use strict';
+// Points of interest in the endless world (spec §2.3, §3.6, §3.7, M4c): landmarks, Kestrel structures and natural formations.
+// Where they stand, what they are made of, and that the finds and caves under them are hidden, never moved.
+const test = require('node:test');
+const assert = require('node:assert/strict');
+const D = require('../src/data.js');
+const W = require('../src/worldgen.js');
+
+test("the points of interest follow the spec's tables: kinds, regions, sizes, hold times, rewards and text keys", () => {
+  const L = D.LANDMARKS, S = D.STRUCTURES, F = D.FORMATIONS;
+  assert.deepEqual(Object.keys(L.kinds), ['delta', 'tube', 'crater', 'methane', 'scarp', 'stardune']);
+  assert.deepEqual(Object.keys(S.kinds), ['cache', 'wreck', 'weather', 'mast', 'pod', 'array']);
+  assert.deepEqual(Object.keys(F.kinds), ['arch', 'yardang', 'hoodoo', 'balanced', 'ventifact', 'layered', 'deviltracks']);
+  // §3.6: one per 256×256 cell, 60 %, never within 60 tiles of the base, up to 40×40, science 80–150 on discovery.
+  assert.deepEqual([L.cell, L.chance, L.clear, L.size, L.science], [256, 0.6, 60, 40, [80, 150]]);
+  const regions = k => L.kinds[k].regions.slice().sort();
+  assert.deepEqual(regions('delta'), ['craters', 'plains']);
+  assert.deepEqual(regions('tube'), ['volcanic']);
+  assert.deepEqual(regions('crater'), ['craters']);
+  assert.deepEqual(regions('methane'), ['canyons', 'plains']);
+  assert.deepEqual(regions('scarp'), ['icy']);
+  assert.deepEqual(regions('stardune'), ['dunes']);
+  assert.equal(L.kinds.delta.sites.filter(s => s === 'science').length, 3, 'the delta: 3 rich science sites');
+  assert.deepEqual(L.kinds.tube.sites.slice().sort(), ['ice', 'metal'], 'the lava tube: ice and rare metal inside');
+  assert.ok(L.kinds.crater.sites.includes('ice') && L.kinds.crater.sites.includes('science'), 'the crater: floor ice and a peak survey');
+  assert.deepEqual(L.kinds.methane.sites, ['science'], 'the vent: one survey');
+  assert.ok(L.kinds.scarp.sites.filter(s => s === 'ice').length >= 3, 'the scarp: many ice loads');
+  assert.equal(L.kinds.crater.radius * 2, 20, 'a rim 20 tiles across');
+  // §3.7: one per 64×64 cell, 25–45 % by region, at least 20 tiles from the base, 2×2 to 5×5.
+  assert.deepEqual([S.cell, S.clear], [64, 20]);
+  assert.deepEqual(Object.keys(S.chance).sort(), W.REGIONS.slice().sort());
+  for (const r of W.REGIONS) assert.ok(S.chance[r] >= 0.25 && S.chance[r] <= 0.45, r + ': ' + S.chance[r]);
+  for (const [id, k] of Object.entries(S.kinds)) assert.ok(k.size.every(n => n >= 2 && n <= 5), id + ' is ' + k.size.join('×'));
+  const holds = Object.fromEntries(Object.entries(S.kinds).map(([id, k]) => [id, [k.hold, k.engineer]]));
+  assert.deepEqual(holds, { cache: [3, undefined], wreck: [6, 3], weather: [6, 3], mast: [6, 3], pod: [undefined, undefined], array: [5, undefined] });
+  assert.deepEqual(S.kinds.cache.loads, [1, 2]);
+  assert.deepEqual([S.kinds.wreck.metal, S.kinds.wreck.spares], [[2, 3], 1]);
+  assert.deepEqual([S.kinds.weather.reveal, S.kinds.weather.science, S.kinds.weather.forecast], [24, 20, 3]);
+  assert.equal(S.kinds.mast.marks, 96);
+  assert.equal(S.kinds.pod.refills, 1);
+  assert.equal(S.kinds.array.materials, 2);
+  // About 1 in 3 formations is a science site; every region has landmarks and formations of its own.
+  assert.equal(F.science, 1 / 3);
+  for (const r of W.REGIONS) {
+    assert.ok(Object.values(L.kinds).some(k => k.regions.includes(r)), 'a landmark kind for ' + r);
+    assert.ok(Object.values(F.kinds).some(k => k.regions.includes(r)), 'a formation kind for ' + r);
+  }
+  // The keys of the facts and the Kestrel story logs that i18n.js holds.
+  for (const [id, k] of Object.entries(L.kinds)) assert.equal(k.fact, 'lm.' + id);
+  for (const [id, k] of Object.entries(F.kinds)) assert.equal(k.fact, 'fm.' + id);
+  for (const [id, k] of Object.entries(S.kinds)) assert.equal(k.log, 'ks.' + id);
+});
+
+const T = W.TILE, LM = D.LANDMARKS;
+const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
+const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
+const codes = (name, n) => Array.from({ length: n }, (_, k) => name + '-' + k);
+// The tile at (x, y), from a cache of chunks.
+function tileAt(seed, x, y, cache) {
+  const cx = Math.floor(x / 32), cy = Math.floor(y / 32), k = cx + ',' + cy;
+  let c = cache.get(k);
+  if (!c) { c = W.chunk(seed, cx, cy); cache.set(k, c); }
+  return W.tileOf(c, x - cx * 32, y - cy * 32);
+}
+// The tiles of a box, row by row, as [x, y, code].
+function boxTiles(seed, b, cache) {
+  const out = [];
+  for (let y = b[1]; y <= b[3]; y++) for (let x = b[0]; x <= b[2]; x++) out.push([x, y, tileAt(seed, x, y, cache)]);
+  return out;
+}
+// The cells of a w-wide grid that a flood fill over the `open` ones reaches from `starts`.
+function flood(open, w, starts) {
+  const seen = new Uint8Array(open.length), queue = [];
+  for (const i of starts) if (open[i] && !seen[i]) { seen[i] = 1; queue.push(i); }
+  while (queue.length) {
+    const i = queue.pop(), x = i % w;
+    for (const m of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
+      if (m >= 0 && m < open.length && open[m] && !seen[m]) { seen[m] = 1; queue.push(m); }
+    }
+  }
+  return seen;
+}
+// Every landmark in the half × half cells either side of the base, for each mission code.
+function* landmarks(list, half) {
+  for (const code of list) {
+    const seed = W.seedOf(code);
+    for (let j = -half; j < half; j++) for (let i = -half; i < half; i++) { const l = W.landmarkAt(seed, i, j); if (l) yield { seed, l }; }
+  }
+}
+
+test('landmarks: one in 60 % of the 256-tile cells, inside its cell, at most 40×40, never within 60 tiles of the base', () => {
+  let n = 0;
+  for (const { l } of landmarks(codes('LM', 20), 6)) {
+    n++;
+    const b = l.box, x0 = l.i * LM.cell, y0 = l.j * LM.cell;
+    assert.equal(l.id, 'L' + l.i + ',' + l.j);
+    // 3 tiles inside its cell, so two landmarks never touch and a chunk only looks up the cells it touches.
+    assert.ok(b[0] >= x0 + 3 && b[1] >= y0 + 3 && b[2] <= x0 + LM.cell - 4 && b[3] <= y0 + LM.cell - 4, `${l.id}: box ${b}`);
+    assert.ok(b[2] - b[0] < LM.size && b[3] - b[1] < LM.size, `${l.id}: box ${b} is more than 40×40`);
+    const dx = Math.max(b[0], 0, -b[2]), dy = Math.max(b[1], 0, -b[3]);
+    assert.ok(dx * dx + dy * dy >= LM.clear * LM.clear, `${l.id}: box ${b} comes within 60 tiles of the HQ`);
+    assert.ok(inBox(b, l.x, l.y), `${l.id}: its centre is in its box`);
+    assert.ok(Object.isFrozen(l) && Object.isFrozen(l.box) && Object.isFrozen(l.sites) && l.sites.every(Object.isFrozen), 'frozen');
+  }
+  const share = n / (20 * 144);
+  assert.ok(share > 0.55 && share < 0.65, 'landmarks in ' + (100 * share).toFixed(1) + ' % of the cells');
+});
+
+test("a landmark's kind is one of the kinds of the region at its centre, and every region gets each of its kinds", () => {
+  const seen = new Set();
+  for (const { seed, l } of landmarks(codes('LM', 20), 6)) {
+    const r = W.regionAt(seed, l.x, l.y);
+    assert.equal(l.region, r);
+    assert.ok(LM.kinds[l.kind].regions.includes(W.REGIONS[r]), `${l.id} is a ${l.kind} in the ${W.REGIONS[r]}`);
+    seen.add(l.kind + ' in the ' + W.REGIONS[r]);
+  }
+  for (const [kind, k] of Object.entries(LM.kinds)) for (const r of k.regions) assert.ok(seen.has(kind + ' in the ' + r), 'no ' + kind + ' in the ' + r);
+});
+
+test('each kind of landmark has its shape: delta fan, lava tube, giant crater, methane vent, ice scarp, star dune', () => {
+  const count = {};
+  for (const { seed, l } of landmarks(codes('LMS', 4), 6)) {
+    const cache = new Map(), at = (x, y) => tileAt(seed, x, y, cache), tiles = boxTiles(seed, l.box, cache);
+    const of = code => tiles.filter(t => t[2] === code), d2 = (x, y) => (x - l.x) * (x - l.x) + (y - l.y) * (y - l.y);
+    count[l.kind] = (count[l.kind] || 0) + 1;
+    if (l.kind === 'delta') {
+      // A fan of sediment within 17 tiles of its apex, all of it walkable.
+      const fan = of(T.SEDIMENT), ax = l.apex[0], ay = l.apex[1];
+      assert.ok(fan.length > 200, `${l.id}: ${fan.length} sediment tiles`);
+      for (const [x, y] of fan) assert.ok((x - ax) * (x - ax) + (y - ay) * (y - ay) <= 17 * 17, `${l.id}: sediment at ${x},${y}`);
+      assert.ok(tiles.every(t => !W.BLOCKING[t[2]]), `${l.id}: nothing blocks on a delta`);
+    } else if (l.kind === 'tube') {
+      // A floor 3 tiles wide and 25–35 long, walled all round but for one skylight in its south (or east) wall.
+      const floor = of(T.TUBE_FLOOR), sky = of(T.SKYLIGHT), len = 2 * l.a + 1;
+      assert.ok(len >= 25 && len <= 35, `${l.id}: ${len} long`);
+      assert.equal(floor.length, 3 * len, `${l.id}: the floor`);
+      assert.equal(sky.length, 1, `${l.id}: one skylight`);
+      for (const [x, y] of floor) for (const [dx, dy] of N4) {
+        assert.ok([T.TUBE_FLOOR, T.TUBE_WALL, T.SKYLIGHT].includes(at(x + dx, y + dy)), `${l.id}: the floor at ${x},${y} opens onto the ground`);
+      }
+      const [sx, sy] = sky[0], [ox, oy] = l.vert ? [1, 0] : [0, 1];
+      assert.equal(at(sx - ox, sy - oy), T.TUBE_FLOOR, `${l.id}: the skylight opens onto the floor`);
+      assert.equal(W.BLOCKING[at(sx + ox, sy + oy)], 0, `${l.id}: and onto open ground ${l.vert ? 'east' : 'south'} of it`);
+    } else if (l.kind === 'crater') {
+      // A rim 20 tiles across (radius 10) with gaps, a floor with ice on it and a peak of 3×3 cliff in the middle.
+      for (const [x, y] of of(T.RIM)) assert.ok(d2(x, y) > 81 && d2(x, y) <= 110.25, `${l.id}: rim at ${x},${y}`);
+      assert.ok(of(T.RAMP).length >= 3, `${l.id}: gaps in the rim`);
+      assert.ok(of(T.ICE).some(([x, y]) => d2(x, y) <= 81), `${l.id}: ice on the floor`);
+      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.equal(at(l.x + dx, l.y + dy), T.CLIFF, `${l.id}: the peak`);
+    } else if (l.kind === 'methane') {
+      // A vent in the open: nothing blocks round it.
+      assert.ok(tiles.every(t => !W.BLOCKING[t[2]]), `${l.id}: nothing blocks round the vent`);
+    } else if (l.kind === 'scarp') {
+      // A cliff of ice 31 tiles long and 2 thick, its ends 4 tiles further south than its middle, with 2 rows of ice at its foot.
+      const top = dx => tiles.find(t => t[0] === l.x + dx && t[2] === T.SCARP)[1];
+      for (let dx = -15; dx <= 15; dx++) {
+        const y = top(dx);
+        assert.deepEqual([at(l.x + dx, y + 1), at(l.x + dx, y + 2), at(l.x + dx, y + 3)], [T.SCARP, T.ICE, T.ICE], `${l.id}: column ${dx}`);
+        assert.equal(of(T.SCARP).filter(t => t[0] === l.x + dx).length, 2, `${l.id}: column ${dx} is 2 thick`);
+      }
+      assert.equal(top(15) - top(0), 4, `${l.id}: bowed`);
+      assert.equal(top(-15) - top(0), 4, `${l.id}: bowed`);
+      assert.equal(of(T.SCARP).length, 62, `${l.id}: 31 long`);
+    } else {
+      // A star dune: 3–5 arms round a summit; the crest (the summit and the arms' ridges) is one walkable path.
+      assert.ok(l.arms.length >= 3 && l.arms.length <= 5, `${l.id}: ${l.arms.length} arms`);
+      const crest = of(T.CREST), w = l.box[2] - l.box[0] + 1, open = Uint8Array.from(tiles, t => (t[2] === T.CREST ? 1 : 0));
+      assert.equal(at(l.x, l.y), T.CREST, `${l.id}: the summit`);
+      const seen = flood(open, w, [(l.y - l.box[1]) * w + l.x - l.box[0]]);
+      assert.equal(seen.reduce((a, b) => a + b, 0), crest.length, `${l.id}: the crest is one path`);
+      assert.ok(crest.length >= 3 * 11, `${l.id}: ${crest.length} crest tiles`);
+    }
+  }
+  assert.deepEqual(Object.keys(count).sort(), Object.keys(LM.kinds).sort(), JSON.stringify(count));
+});
+
+test("every open tile in a landmark's box connects to the box's outer ring, which is all open, so a landmark cuts no ground off", () => {
+  let n = 0;
+  for (const { seed, l } of landmarks(codes('LMR', 6), 4)) {
+    n++;
+    const b = l.box, w = b[2] - b[0] + 1, h = b[3] - b[1] + 1, tiles = boxTiles(seed, b, new Map());
+    const open = Uint8Array.from(tiles, t => (W.BLOCKING[t[2]] ? 0 : 1)), ring = [];
+    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) ring.push(y * w + x);
+    for (const i of ring) assert.equal(open[i], 1, `${l.id}: its ring at ${tiles[i][0]},${tiles[i][1]} is blocked`);
+    const seen = flood(open, w, ring);
+    open.forEach((o, i) => assert.ok(!o || seen[i], `${l.id} (${l.kind}): the open tile ${tiles[i][0]},${tiles[i][1]} is cut off`));
+  }
+  assert.ok(n > 100, 'landmarks checked: ' + n);
+});
+
+test("a landmark's sites are finds on open ground in its box, with ids ('<landmark id>:<n>') that can't be a find's", () => {
+  const FIND_ID = /^-?\d+,-?\d+:\d+$/;
+  const ON = { delta: [T.SEDIMENT], tube: [T.TUBE_FLOOR], crater: [T.CRATER_FLOOR, T.ICE], scarp: [T.ICE] };
+  let n = 0;
+  for (const { seed, l } of landmarks(codes('LMS', 4), 6)) {
+    const cache = new Map();
+    assert.deepEqual(l.sites.map(f => f.kind), LM.kinds[l.kind].sites, l.id);
+    l.sites.forEach((f, i) => {
+      n++;
+      const t = tileAt(seed, f.x, f.y, cache);
+      assert.equal(f.n, i);
+      assert.ok(inBox(l.box, f.x, f.y), `${l.id}:${i} is in its box`);
+      assert.equal(W.BLOCKING[t], 0, `${l.id}:${i} is on open ground`);
+      if (ON[l.kind]) assert.ok(ON[l.kind].includes(t), `${l.id}:${i} (${l.kind}) stands on tile ${t}`);
+      assert.equal(f.ring, W.ringOf(f.x, f.y));
+      assert.equal(f.region, W.regionAt(seed, f.x, f.y));
+      assert.equal(f.sub, f.kind !== 'science' ? undefined : l.kind === 'methane' ? 'vent' : l.kind, `${l.id}:${i}: its subject`);
+      assert.doesNotMatch(l.id + ':' + i, FIND_ID);
+    });
+  }
+  assert.ok(n > 300, 'sites checked: ' + n);
+});
+
+test('a chunk lists the landmarks that touch it, the same one (by id) in each, and hides the finds and caves under them', () => {
+  let finds = 0, caves = 0, shown = 0;
+  for (const { seed, l } of landmarks(codes('LMH', 4), 6)) {
+    const b = l.box;
+    for (let cy = Math.floor(b[1] / 32); cy <= Math.floor(b[3] / 32); cy++) for (let cx = Math.floor(b[0] / 32); cx <= Math.floor(b[2] / 32); cx++) {
+      const c = W.chunk(seed, cx, cy), x0 = cx * 32, y0 = cy * 32;
+      // By id: the same landmark, though not always the same object (the world's memo of features is cleared when it grows).
+      assert.deepEqual(c.landmarks.find(k => k.id === l.id), l, `chunk ${cx},${cy} lists ${l.id}`);
+      assert.deepEqual(c.landmarks.map(k => k.id), W.landmarksNear(seed, x0, y0, x0 + 31, y0 + 31).map(k => k.id));
+      // Hidden by index: the lists are as they were, so every saved find id still names the same find.
+      const under = (x, y) => c.landmarks.some(k => inBox(k.box, x, y));
+      assert.deepEqual(c.hidden.finds, c.finds.filter(f => under(f.x, f.y)).map(f => f.n), `chunk ${cx},${cy}: hidden finds`);
+      assert.deepEqual(c.hidden.caves, c.caves.filter(k => under(k.x, k.y) || under(k.x, k.y - 1)).map(k => k.n), `chunk ${cx},${cy}: hidden caves`);
+      assert.ok(Object.isFrozen(c.hidden) && Object.isFrozen(c.hidden.finds) && Object.isFrozen(c.landmarks));
+      finds += c.hidden.finds.length;
+      caves += c.hidden.caves.length;
+      shown += c.finds.length - c.hidden.finds.length;
+    }
+  }
+  assert.ok(finds > 20 && caves > 5 && shown > finds, `hidden finds ${finds}, hidden caves ${caves}, shown finds ${shown}`);
+});
diff --git a/test/worldgen-reach.test.js b/test/worldgen-reach.test.js
index 7b1ca15..9286cd0 100644
--- a/test/worldgen-reach.test.js
+++ b/test/worldgen-reach.test.js
@@ -1,6 +1,7 @@
 'use strict';
 // Spec §1.3 and §2.3: on 300 seeds, every open tile within 128 tiles of the base can be reached on foot from the base,
-// and so can every find and every cave (finds and cave mouths only ever stand on open ground).
+// and so can every find, every landmark's site and every cave (they only ever stand on open ground). A find or a cave
+// under a footprint is hidden, never shown, so it is left out.
 // Slow (it builds 30,000 chunks), so it has its own file and runs alongside the rest of the suite.
 const test = require('node:test');
 const assert = require('node:assert/strict');
@@ -9,17 +10,19 @@ const W = require('../src/worldgen.js');
 const BUILD = 160; // build tiles −160..159: a 32-tile margin, more than the 24 tiles between canyon ramps
 const CHECK = 128; // check tiles −128..127 (256×256)
 
-test('on 300 seeds every open tile, every find and every cave within 128 tiles of the base can be reached from the base', () => {
+test("on 300 seeds every open tile, every find, every landmark's site and every cave within 128 tiles of the base can be reached from the base", () => {
   const size = BUILD * 2;
   const blocked = new Uint8Array(size * size), seen = new Uint8Array(size * size), queue = new Int32Array(size * size);
-  let total = 0;
+  let total = 0, totalSites = 0;
   for (let n = 0; n < 300; n++) {
     const seed = W.seedOf('REACH-' + n);
-    const finds = [], caves = [];
+    const finds = [], caves = [], sites = new Map(); // a landmark is listed by every chunk it touches: count its sites once
     for (let cy = -BUILD / 32; cy < BUILD / 32; cy++) for (let cx = -BUILD / 32; cx < BUILD / 32; cx++) {
       const c = W.chunk(seed, cx, cy);
-      for (const f of c.finds) if (Math.abs(f.x) < CHECK && Math.abs(f.y) < CHECK) finds.push(f);
-      for (const k of c.caves) if (Math.abs(k.x) < CHECK && Math.abs(k.y) < CHECK) caves.push(k);
+      const near = p => Math.abs(p.x) < CHECK && Math.abs(p.y) < CHECK;
+      for (const f of c.finds) if (near(f) && !c.hidden.finds.includes(f.n)) finds.push(f);
+      for (const k of c.caves) if (near(k) && !c.hidden.caves.includes(k.n)) caves.push(k);
+      for (const l of c.landmarks) for (const f of l.sites) if (near(f)) sites.set(l.id + ':' + f.n, f);
       for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
         blocked[(cy * 32 + ly + BUILD) * size + cx * 32 + lx + BUILD] = W.BLOCKING[c.tiles[ly * 32 + lx]];
       }
@@ -43,9 +46,11 @@ test('on 300 seeds every open tile, every find and every cave within 128 tiles o
       if (!blocked[i] && !seen[i]) { lost++; if (!example) example = (x - BUILD) + ',' + (y - BUILD); }
     }
     assert.equal(lost, 0, `seed REACH-${n}: ${lost} open tiles are cut off, e.g. tile ${example}`);
-    for (const f of finds) assert.equal(seen[(f.y + BUILD) * size + f.x + BUILD], 1, `seed REACH-${n}: the ${f.kind} at ${f.x},${f.y} can't be reached`);
+    for (const f of [...finds, ...sites.values()]) assert.equal(seen[(f.y + BUILD) * size + f.x + BUILD], 1, `seed REACH-${n}: the ${f.kind} at ${f.x},${f.y} can't be reached`);
     for (const k of caves) assert.equal(seen[(k.y + BUILD) * size + k.x + BUILD], 1, `seed REACH-${n}: the cave at ${k.x},${k.y} can't be reached`);
     total += caves.length;
+    totalSites += sites.size;
   }
   assert.ok(total > 300, "caves checked: " + total);
+  assert.ok(totalSites > 300, "landmark sites checked: " + totalSites);
 });
diff --git a/test/worldgen.test.js b/test/worldgen.test.js
index 2d54eb3..f0a6ee9 100644
--- a/test/worldgen.test.js
+++ b/test/worldgen.test.js
@@ -151,12 +151,14 @@ test('every blocking feature fits its size bounds', () => {
   for (let n = 0; n < 10; n++) {
     const seed = W.seedOf('SIZE-' + n), cache = new Map();
     const f = W.featuresNear(seed, -512, -512, 511, 511);
-    for (const m of f.mesas) {
+    // A landmark overrides the features its box overlaps (spec §2.3), so only the ones clear of every landmark are measured.
+    const lms = W.landmarksNear(seed, -512, -512, 511, 511), clear = g => !lms.some(l => touch(l.box, g.box));
+    for (const m of f.mesas.filter(clear)) {
       kinds.mesa++;
       const e = blockedExtent(seed, m, T.CLIFF, cache);
       assert.ok(e.w >= 4 && e.w <= 14 && e.h >= 4 && e.h <= 14, `mesa at ${m.x},${m.y} is ${e.w}×${e.h}`);
     }
-    for (const c of f.craters) {
+    for (const c of f.craters.filter(clear)) {
       kinds.crater++;
       assert.ok(c.r >= 4 && c.r <= 12, 'crater radius ' + c.r);
       assert.ok(c.gaps.length === 2 || c.gaps.length === 3, 'crater gaps ' + c.gaps.length);
@@ -238,6 +240,8 @@ test('a pinned hash of 1,000 chunks catches any change to the world', () => {
   const got = fnv(parts);
   // The world as this plan's worldgen.js builds it. The browser QA (Task 11) checks Chrome gets the same value.
   // Change it only when you mean to change the world, and say so in the commit message.
-  const PINNED = '4f1ff5dc';
+  // M4c: the landmarks stamp their footprints (was 4f1ff5dc). Only tiles inside a footprint changed: 0 outside on 6 seeds,
+  // and the regions, finds and caves are as they were (their own pinned hashes did not move).
+  const PINNED = '59ba57b3';
   assert.equal(got, PINNED, 'world hash is ' + got);
 });
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/expedition.test.js test/worldgen-caves.test.js test/worldgen-finds.test.js test/worldgen-reach.test.js test/worldgen-poi.test.js test/worldgen.test.js`
Expected: 14 of 59 fail, among them "the points of interest follow the spec's tables…", "landmarks: one in 60 % of the 256-tile cells…", "each kind of landmark has its shape…", "a landmark's sites are finds on open ground in its box…", "nobody can change the shared world cache…", "a find id from another chunk than the one you stand in is refused before that chunk is built" and "a pinned hash of 1,000 chunks catches any change to the world" (the pin is now `59ba57b3`).

- [ ] **Step 3: Write the tables and place the landmarks**

```diff
diff --git a/src/data.js b/src/data.js
index b8c04e7..74fe74d 100644
--- a/src/data.js
+++ b/src/data.js
@@ -264,6 +264,53 @@
       pod: { loads: [3, 3, 3, 3], food: 60 },   // each load: a spare kit, 60 kg of food or an O₂ canister
       science: { loads: [1, 1, 1, 1], science: [20, 35, 60, 80], craters: 1.5 },
     },
+    // Points of interest (spec §3.6, §3.7, M4c). src/worldgen.js places them from these numbers. Distances are world
+    // tiles, `regions` are worldgen REGIONS names, and `fact` (lm.<id>, fm.<id>) and `log` (ks.<id>) are i18n.js keys.
+    // Landmarks: one per 256×256 cell with a 60 % chance; the footprint (at most 40×40) never comes within 60 tiles of
+    // the HQ. Its kind is picked from the kinds of the region at its centre, all equally likely. Discovering one banks
+    // 80–150 science (the Scientist gets +50 %). `sites` are the finds it holds: the delta's three rich surveys, the ice
+    // and rare metal inside a lava tube, the giant crater's floor ice and peak survey, the vent's survey, the scarp's ice.
+    LANDMARKS: {
+      cell: 256, chance: 0.6, clear: 60, size: 40, science: [80, 150],
+      kinds: {
+        delta: { regions: ['plains', 'craters'], sites: ['science', 'science', 'science'], fact: 'lm.delta' },
+        tube: { regions: ['volcanic'], sites: ['ice', 'metal'], fact: 'lm.tube' },
+        crater: { regions: ['craters'], radius: 10, sites: ['ice', 'ice', 'science'], fact: 'lm.crater' },
+        methane: { regions: ['canyons', 'plains'], sites: ['science'], fact: 'lm.methane' },
+        scarp: { regions: ['icy'], sites: ['ice', 'ice', 'ice', 'ice'], fact: 'lm.scarp' },
+        stardune: { regions: ['dunes'], sites: [], fact: 'lm.stardune' },
+      },
+    },
+    // Kestrel Survey structures (fictional): one per 64×64 cell with a chance by region, at least 20 tiles from the HQ,
+    // `size` tiles wide and deep. `hold` is the seconds of holding E (the Engineer's own in `engineer`); the pod has
+    // none, you walk in. Rewards: a cache's loads, a wreck's metal loads and spare kit, the weather station's fog reveal
+    // (tiles), science and forecast rounds, the mast's marks (tiles), the pod's suit refills a round, the array's loads.
+    STRUCTURES: {
+      cell: 64, clear: 20,
+      chance: { plains: 0.45, dunes: 0.25, craters: 0.35, canyons: 0.3, icy: 0.35, volcanic: 0.3 },
+      kinds: {
+        cache: { size: [2, 2], hold: 3, loads: [1, 2], log: 'ks.cache' },
+        wreck: { size: [3, 2], hold: 6, engineer: 3, metal: [2, 3], spares: 1, log: 'ks.wreck' },
+        weather: { size: [2, 2], hold: 6, engineer: 3, reveal: 24, science: 20, forecast: 3, log: 'ks.weather' },
+        mast: { size: [2, 2], hold: 6, engineer: 3, marks: 96, log: 'ks.mast' },
+        pod: { size: [5, 5], refills: 1, log: 'ks.pod' },
+        array: { size: [4, 2], hold: 5, materials: 2, log: 'ks.array' },
+      },
+    },
+    // Natural formations: scenery with real geology, scattered per chunk in the regions listed; about 1 in 3 is also a
+    // science site.
+    FORMATIONS: {
+      science: 1 / 3,
+      kinds: {
+        arch: { regions: ['canyons', 'craters'], fact: 'fm.arch' },
+        yardang: { regions: ['plains', 'volcanic'], fact: 'fm.yardang' },
+        hoodoo: { regions: ['canyons'], fact: 'fm.hoodoo' },
+        balanced: { regions: ['plains', 'craters', 'icy'], fact: 'fm.balanced' },
+        ventifact: { regions: ['plains', 'dunes', 'volcanic'], fact: 'fm.ventifact' },
+        layered: { regions: ['canyons', 'craters'], fact: 'fm.layered' },
+        deviltracks: { regions: ['plains', 'dunes', 'icy'], fact: 'fm.deviltracks' },
+      },
+    },
     // Role skills on the map (spec §3.3): factors on how long you hold E, and the scientist's extra science.
     SKILLS: {
       scientist: { science: 0.5, scienceBonus: 1.5 },
diff --git a/src/expedition.js b/src/expedition.js
index 7582c7d..34fcee5 100644
--- a/src/expedition.js
+++ b/src/expedition.js
@@ -42,13 +42,22 @@
   function findsIn(m, cx, cy) { return chunkAt(m, cx, cy).finds; }
   function cavesIn(m, cx, cy) { return chunkAt(m, cx, cy).caves; }
 
-  // A find's id is "<cx>,<cy>:<n>", written exactly the way the world writes it, so one find has one id.
+  // Ids are written exactly the way the world writes them, so one thing has one id: the numbers in one, or null.
+  function idNums(re, id) {
+    const g = typeof id === 'string' && re.exec(id);
+    if (!g) return null;
+    const nums = g.slice(1).map(Number);
+    return g.slice(1).every((s, i) => String(nums[i]) === s) ? nums : null;
+  }
+  // Is a position (world pixels) in cell (i, j) of a grid `size` tiles wide?
+  const inCell = (pos, i, j, size) => Math.floor(pos.x / (T * size)) === i && Math.floor(pos.y / (T * size)) === j;
+
+  // A find's id is "<cx>,<cy>:<n>".
   const ID = /^(-?\d{1,7}),(-?\d{1,7}):(\d{1,2})$/;
   function findById(m, id) {
-    const g = ID.exec(String(id));
+    const g = idNums(ID, id);
     if (!g) return null;
-    const cx = Number(g[1]), cy = Number(g[2]), n = Number(g[3]);
-    if (cx + ',' + cy + ':' + n !== id) return null;
+    const [cx, cy, n] = g;
     const f = findsIn(m, cx, cy)[n];
     if (!f) return null;
     return Object.assign({ id, cx, cy, left: loadsLeft(m, f, id) }, f);
@@ -124,6 +133,11 @@
     const a = able(m, crewId);
     if (a.error) return a;
     if (!okPos(pos)) return { error: 'badPos' };
+    const g = idNums(ID, findId);
+    if (!g) return { error: 'noFind' };
+    // A find stands 3 tiles inside its chunk, so it is only in reach from there. Checked before the chunk is built: an id
+    // from far away would cost a build and push other rooms' chunks out of the shared cache.
+    if (!inCell(pos, g[0], g[1], W.CHUNK)) return { error: 'tooFar' };
     const f = findById(m, findId);
     if (!f) return { error: 'noFind' };
     if (!nearTile(pos, f.x, f.y)) return { error: 'tooFar' };
diff --git a/src/worldgen.js b/src/worldgen.js
index 33b72b6..2636078 100644
--- a/src/worldgen.js
+++ b/src/worldgen.js
@@ -10,33 +10,41 @@
  * (−4, −2), so the HQ is at (0, 0). Nothing that blocks is ever placed within FLAT_RADIUS tiles of the HQ.
  *
  * API: seedOf(missionSeed) → uint32 · regionAt(seed, x, y) → index into REGIONS
- *      chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512), finds, caves }   (32×32, row-major)
+ *      chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512), finds, caves, hidden, landmarks }
+ *        (32×32, row-major)
  *        finds: [{ n, x, y, kind, ring, region, sub? }] in world tiles; a find's id is "<cx>,<cy>:<n>"
  *        caves: [{ n, x, y, region }] in world tiles: a cave's mouth, an open tile; its wall is the tile north of it
+ *        hidden: { finds: [n], caves: [n] }: the ones under a point of interest's footprint. They keep their place in the
+ *          lists, so every id stays stable; src/expedition.js leaves them out.
+ *        landmarks: the ones whose box touches the chunk: { id: "L<i>,<j>", kind, i, j, x, y (its centre), region,
+ *          box: [x0, y0, x1, y1] (its footprint, inclusive), sites: finds as above (a site's id is "<landmark id>:<n>"),
+ *          and its shape (delta: dir, apex · tube: a, vert, s · crater: r, gaps · stardune: arms) }
  *      ringOf(x, y) → 0 inner · 1 middle · 2 outer · 3 far
  *      tileOf(chunk, lx, ly) · regionOf(chunk, lx, ly)
  *      featuresNear(seed, x0, y0, x1, y1) → { canyons, craters, mesas } touching that tile box (inclusive)
+ *      landmarkAt(seed, i, j) → the landmark of cell (i, j) of the 256-tile grid, or null · landmarksNear(seed, x0, y0, x1, y1)
  *      hash(seed, a, b, c) → uint32 · unit(h) → [0, 1) · noise(seed, salt, x, y, size) → [0, 1]
  */
 (function (root, factory) {
-  if (typeof module === 'object' && module.exports) module.exports = factory();
-  else root.SolWorldgen = factory();
-})(typeof self !== 'undefined' ? self : this, function () {
+  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
+  else root.SolWorldgen = factory(root.SolData);
+})(typeof self !== 'undefined' ? self : this, function (D) {
   'use strict';
 
   const CHUNK = 32;
+  // SEDIMENT is a river delta's fan, SCARP an ice scarp's cliff and CREST the ridge of a star dune (landmarks, M4c).
   const TILE = {
     REGOLITH: 0, SAND: 1, DUNE: 2, BOULDER: 3, CLIFF: 4, RIM: 5, CRATER_FLOOR: 6, CANYON_FLOOR: 7, CANYON_WALL: 8,
     RAMP: 9, ICE: 10, POLYGON: 11, LAVA: 12, TUBE_FLOOR: 13, TUBE_WALL: 14, SKYLIGHT: 15, STRUCT_FLOOR: 16,
-    STRUCT_WALL: 17, BASE: 18,
+    STRUCT_WALL: 17, BASE: 18, SEDIMENT: 19, SCARP: 20, CREST: 21,
   };
   const NONE = 255; // "no feature here" in the feature layer
   const BLOCKING = new Uint8Array(32);
-  for (const k of ['BOULDER', 'CLIFF', 'RIM', 'CANYON_WALL', 'TUBE_WALL', 'STRUCT_WALL']) BLOCKING[TILE[k]] = 1;
-  // Walking speed on each tile (the rover ignores it).
+  for (const k of ['BOULDER', 'CLIFF', 'RIM', 'CANYON_WALL', 'TUBE_WALL', 'STRUCT_WALL', 'SCARP']) BLOCKING[TILE[k]] = 1;
+  // Walking speed on each tile (the rover ignores it). A star dune's crest is sand too.
   const SPEED = [];
   for (let i = 0; i < 32; i++) SPEED.push(1);
-  SPEED[TILE.DUNE] = 0.7;
+  SPEED[TILE.DUNE] = SPEED[TILE.CREST] = 0.7;
 
   const REGIONS = ['plains', 'dunes', 'craters', 'canyons', 'icy', 'volcanic'];
   const R = { PLAINS: 0, DUNES: 1, CRATERS: 2, CANYONS: 3, ICY: 4, VOLCANIC: 5 };
@@ -169,11 +177,12 @@
   }
   const grow = (b, p) => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
   const touch = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
-  function nearBase(box) {
-    const b = grow(box, CLEAR);
+  // The squared distance from the HQ's tile to the nearest tile of a box.
+  function fromHQ2(b) {
     const dx = Math.max(b[0], 0, -b[2]), dy = Math.max(b[1], 0, -b[3]);
-    return dx * dx + dy * dy <= FLAT_RADIUS * FLAT_RADIUS;
+    return dx * dx + dy * dy;
   }
+  const nearBase = box => fromHQ2(grow(box, CLEAR)) <= FLAT_RADIUS * FLAT_RADIUS;
   function cellsTouching(box, size) {
     const out = [];
     for (let j = Math.floor(box[1] / size); j <= Math.floor(box[3] / size); j++) {
@@ -322,7 +331,7 @@
   // test proves all open ground near the base is connected, so every find can be reached on foot.
   const RINGS = [20, 40, 80];                   // inner ≤ 20 < middle ≤ 40 < outer ≤ 80 < far, in tiles from the HQ
   const FIND_KINDS = ['ice', 'metal', 'pod', 'science'];
-  const FIND_DARTS = 24, FIND_EDGE = 3, FIND_GAP = 5;
+  const FIND_DARTS = 24, FIND_EDGE = 3, FIND_GAP = 5; // dart i hashes salts 500 + i, 540 + i and 580 + i: keep FIND_DARTS ≤ 40
   const FIND_DENSITY = [1.6, 0.8, 1.6, 1.6, 1.8, 1.6]; // finds a chunk aims for, by region (the Dune Sea has few)
   const RING_DENSITY = [0.3, 0.6, 1, 1];               // fewer finds close to the base
   const KIND_WEIGHTS = [                             // ice, metal, pod, science, by region
@@ -336,6 +345,9 @@
     const d2 = x * x + y * y;
     return d2 <= RINGS[0] * RINGS[0] ? 0 : d2 <= RINGS[1] * RINGS[1] ? 1 : d2 <= RINGS[2] * RINGS[2] ? 2 : 3;
   }
+  // The region of tile i (row-major) of a chunk: its regions hold two tiles to a byte, four bits each.
+  const nibble = (regions, i) => (regions[i >> 1] >> ((i & 1) * 4)) & 15;
+  const tooClose = (list, x, y, gap) => list.some(f => Math.abs(f.x - x) < gap && Math.abs(f.y - y) < gap);
 
   // Crater floors and canyon floors hold ice: the chunk that owns a crater's centre (or a canyon's middle) puts an ice
   // deposit there first. Then darts land at random spots.
@@ -348,8 +360,8 @@
     for (const [x, y] of spots) {
       if (!own(x, y) || inFlat(x, y)) continue;
       const n = (y - y0) * CHUNK + (x - x0);
-      if (!ICY_GROUND[tiles[n]]) continue;
-      out.push({ n: out.length, x, y, kind: 'ice', ring: ringOf(x, y), region: (regions[n >> 1] >> ((n & 1) * 4)) & 15 });
+      if (!ICY_GROUND[tiles[n]] || tooClose(out, x, y, FIND_GAP)) continue; // spaced features never trip the gap today
+      out.push({ n: out.length, x, y, kind: 'ice', ring: ringOf(x, y), region: nibble(regions, n) });
     }
     for (let i = 0; i < FIND_DARTS; i++) {
       const h = hash(seed, cx, cy, 500 + i);
@@ -358,9 +370,9 @@
       if (inFlat(x, y)) continue;
       const code = tiles[n];
       if (BLOCKING[code] || code === TILE.BASE) continue;
-      const r = (regions[n >> 1] >> ((n & 1) * 4)) & 15, ring = ringOf(x, y);
+      const r = nibble(regions, n), ring = ringOf(x, y);
       if (unit(hash(seed, cx, cy, 540 + i)) >= FIND_DENSITY[r] * RING_DENSITY[ring] / FIND_DARTS) continue;
-      if (out.some(f => Math.abs(f.x - x) < FIND_GAP && Math.abs(f.y - y) < FIND_GAP)) continue;
+      if (tooClose(out, x, y, FIND_GAP)) continue;
       const w = KIND_WEIGHTS[r].slice();
       if (ICY_GROUND[code]) w[0] += 6;
       let pick = unit(hash(seed, cx, cy, 580 + i)) * (w[0] + w[1] + w[2] + w[3]), k = 0;
@@ -385,15 +397,159 @@
       if (wall !== TILE.CLIFF && wall !== TILE.CANYON_WALL) continue;
       const m = n + CHUNK, below = tiles[m];
       if (BLOCKING[below] || below === TILE.BASE) continue;
-      const x = cx * CHUNK + lx, y = cy * CHUNK + ly + 1, r = (regions[m >> 1] >> ((m & 1) * 4)) & 15;
+      const x = cx * CHUNK + lx, y = cy * CHUNK + ly + 1, r = nibble(regions, m);
       if (unit(hash(seed, x, y, 650)) >= CAVE_CHANCE[r]) continue;
-      if (out.some(c => Math.abs(c.x - x) < CAVE_GAP[r] && Math.abs(c.y - y) < CAVE_GAP[r])) continue;
+      if (tooClose(out, x, y, CAVE_GAP[r])) continue;
       out.push({ n: out.length, x, y, region: r });
     }
     return out;
   }
 
+  // ---------- landmarks (spec §3.6, M4c): one per 256×256 cell, over everything else ----------
+  // A landmark's centre is jittered inside its cell and its kind is picked from the kinds of the region at the centre
+  // (D.LANDMARKS). Its footprint is a box of at most 40×40 tiles lying at least 3 tiles inside the cell, so two landmarks
+  // never touch and a chunk looks up only the cells it touches. Inside the box the landmark overrides every feature: each
+  // tile is its shape's code, or the region's own ground. The box's outer ring is always ground and every open tile of the
+  // shape connects to it, so a landmark can never cut a pocket of open ground off.
+  const LM = D.LANDMARKS, LM_LO = 22; // its centre is at least 22 tiles inside the cell (half a 40-tile box plus 2)
+  const LM_KINDS = REGIONS.map(r => Object.keys(LM.kinds).filter(k => LM.kinds[k].regions.includes(r)));
+  const near = v => Math.floor(v + 0.5); // the nearest whole tile
+  const scarpTop = (y, dx) => y - 2 + Math.floor(dx * dx / 50);
+  // Each shape: make(seed, i, j, x, y) → its box, the spots of its finds (in the order of D.LANDMARKS' sites) and what
+  // drawing it needs; code(seed, landmark, x, y) → the tile at (x, y) in its box, or NONE for the region's ground.
+  const SHAPES = {
+    // A fan of layered sediment spreading 17 tiles from its apex, up to 53° either side of its axis, with three surveys.
+    delta: {
+      make(seed, i, j, x, y) {
+        const dir = hash(seed, i, j, 1010) % 16, u = DIRS16[dir], ax = x - u[0] * 8.5, ay = y - u[1] * 8.5;
+        const spots = [dir + 14, dir, dir + 2].map(k => { const d = DIRS16[k % 16]; return [near(ax + 9 * d[0]), near(ay + 9 * d[1])]; });
+        return { dir, apex: [ax, ay], box: [x - 15, y - 15, x + 15, y + 15], spots };
+      },
+      code(seed, l, x, y) {
+        const dx = x - l.apex[0], dy = y - l.apex[1], u = DIRS16[l.dir], along = dx * u[0] + dy * u[1], d2 = dx * dx + dy * dy;
+        return along > 0 && d2 <= 17 * 17 && along * along >= 0.36 * d2 ? TILE.SEDIMENT : NONE;
+      },
+    },
+    // A lava tube: a floor 3 tiles wide and 25–35 long inside its wall, running east–west (or north–south), entered
+    // through a skylight in its south (or east) wall. Ice lies near one end and rare metal near the other.
+    tube: {
+      make(seed, i, j, x, y) {
+        const h = hash(seed, i, j, 1010), a = 12 + (h % 6), vert = (h >>> 8) % 2 === 1, s = ((h >>> 12) % (a + 1)) - (a >> 1);
+        const at = (u, v) => (vert ? [x + v, y + u] : [x + u, y + v]);
+        const box = vert ? [x - 3, y - a - 2, x + 3, y + a + 2] : [x - a - 2, y - 3, x + a + 2, y + 3];
+        return { a, vert, s, box, spots: [at(1 - a, 0), at(a - 1, 0)] };
+      },
+      code(seed, l, x, y) {
+        const u = l.vert ? y - l.y : x - l.x, v = l.vert ? x - l.x : y - l.y, au = Math.abs(u), av = Math.abs(v);
+        if (au > l.a + 1 || av > 2) return NONE;
+        if (au <= l.a && av <= 1) return TILE.TUBE_FLOOR;
+        return u === l.s && v === 2 ? TILE.SKYLIGHT : TILE.TUBE_WALL;
+      },
+    },
+    // A rim 20 tiles across (D.LANDMARKS radius 10) with three gaps, a floor patched with ice and a central peak. Ice lies
+    // on the floor either side of the peak, and the peak's survey just south of it.
+    crater: {
+      make(seed, i, j, x, y) {
+        const r = LM.kinds.crater.radius, h = hash(seed, i, j, 1010), g = DIRS16[(h >>> 8) % 16];
+        const gaps = [0, 5, 10].map(k => DIRS16[(h % 16 + k) % 16]);
+        const spots = [[near(x + 6 * g[0]), near(y + 6 * g[1])], [near(x - 6 * g[0]), near(y - 6 * g[1])], [x, y + 2]];
+        return { r, gaps, box: [x - r - 2, y - r - 2, x + r + 2, y + r + 2], spots };
+      },
+      code(seed, l, x, y) {
+        const dx = x - l.x, dy = y - l.y;
+        if (dx * dx + dy * dy <= 2.25) return TILE.CLIFF; // the central peak: the 3×3 tiles round the middle
+        const t = CODE.crater(l, x, y);
+        return t === TILE.CRATER_FLOOR && noise(seed, 1020, x, y, 5) > 0.62 ? TILE.ICE : t;
+      },
+    },
+    // A vent in the open ground: its survey is the vent itself (the surface draws the vent and its puffs there).
+    methane: {
+      make: (seed, i, j, x, y) => ({ box: [x - 4, y - 4, x + 4, y + 4], spots: [[x, y]] }),
+      code: () => NONE,
+    },
+    // A cliff of clean ice 31 tiles long and 2 thick, bowed so its ends lie 4 tiles further south, with 2 rows of exposed
+    // ice at its foot (its south face, the one the surface draws) and four ice deposits along the cliff.
+    scarp: {
+      make: (seed, i, j, x, y) => ({ box: [x - 17, y - 3, x + 17, y + 6], spots: [-11, -4, 4, 11].map(dx => [x + dx, scarpTop(y, dx) + 2]) }),
+      code(seed, l, x, y) {
+        const dx = x - l.x;
+        if (dx < -15 || dx > 15) return NONE;
+        const k = y - scarpTop(l.y, dx);
+        return k === 0 || k === 1 ? TILE.SCARP : k === 2 || k === 3 ? TILE.ICE : NONE;
+      },
+    },
+    // A star dune: 3–5 arms 11–16 tiles long round a summit. The arms' ridges and the summit are its crest, where the view
+    // is wider; the dune spreads 2.5 tiles either side of the ridges and 5 round the summit.
+    stardune: {
+      make(seed, i, j, x, y) {
+        const h = hash(seed, i, j, 1010), n = 3 + (h % 3), step = Math.floor(16 / n), first = (h >>> 4) % 16, arms = [];
+        for (let k = 0; k < n; k++) arms.push([(first + k * step) % 16, 11 + (hash(seed, i, j, 1011 + k) % 6)]);
+        return { arms, box: [x - 19, y - 19, x + 19, y + 19], spots: [] };
+      },
+      code(seed, l, x, y) {
+        const dx = x - l.x, dy = y - l.y, s2 = dx * dx + dy * dy;
+        let best = s2;
+        for (const [k, len] of l.arms) {
+          const u = DIRS16[k], t = Math.max(0, Math.min(len, dx * u[0] + dy * u[1])), px = dx - u[0] * t, py = dy - u[1] * t;
+          best = Math.min(best, px * px + py * py);
+        }
+        // 0.75 tiles either side of a ridge, so even a diagonal one is a path of side-by-side tiles.
+        if (best <= 0.5625 || s2 <= 2) return TILE.CREST;
+        return best <= 6.25 || s2 <= 25 ? TILE.DUNE : NONE;
+      },
+    },
+  };
+
+  // A find held by a point of interest, written like a chunk's finds. A survey's subject is the landmark's (or formation's)
+  // kind, but the methane vent's is 'vent', the subject the surface already labels, paints and lets the Biologist smell.
+  function site(seed, n, x, y, kind, sub) {
+    const f = { n, x, y, kind, ring: ringOf(x, y), region: regionAt(seed, x, y) };
+    if (kind === 'science') f.sub = sub;
+    return f;
+  }
+  // Points of interest are shared by every chunk they touch (and every mission with the seed), so they are frozen whole.
+  function deepFreeze(o) {
+    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
+    return o;
+  }
+
+  // The landmark of cell (i, j) of the 256-tile grid, or null. Its id is "L<i>,<j>".
+  function landmark(seed, i, j) {
+    return memo('L' + seed + ':' + i + ':' + j, () => {
+      if (unit(hash(seed, i, j, 1001)) >= LM.chance) return null;
+      const h = hash(seed, i, j, 1002), span = LM.cell - 2 * LM_LO;
+      const x = i * LM.cell + LM_LO + (h % span), y = j * LM.cell + LM_LO + ((h >>> 16) % span);
+      const region = regionAt(seed, x, y), kinds = LM_KINDS[region], kind = kinds[hash(seed, i, j, 1003) % kinds.length];
+      const { spots, ...shape } = SHAPES[kind].make(seed, i, j, x, y);
+      if (fromHQ2(shape.box) < LM.clear * LM.clear) return null;
+      const sites = spots.map(([sx, sy], n) => site(seed, n, sx, sy, LM.kinds[kind].sites[n], kind === 'methane' ? 'vent' : kind));
+      return deepFreeze(Object.assign({ id: 'L' + i + ',' + j, kind, i, j, x, y, region }, shape, { sites }));
+    });
+  }
+  // Every landmark whose box touches the tile box [x0..x1] × [y0..y1] (inclusive).
+  function landmarksNear(seed, x0, y0, x1, y1) {
+    const box = [x0, y0, x1, y1], out = [];
+    for (const [i, j] of cellsTouching(box, LM.cell)) { const l = landmark(seed, i, j); if (l && touch(l.box, box)) out.push(l); }
+    return out;
+  }
+  // Redraws the chunk's tiles that lie in a landmark's box: its shape, or the region's own ground.
+  function stampLandmarks(seed, tiles, regions, x0, y0, lms) {
+    for (const l of lms) {
+      const code = SHAPES[l.kind].code, b = l.box;
+      for (let y = Math.max(b[1], y0); y <= Math.min(b[3], y0 + CHUNK - 1); y++) {
+        for (let x = Math.max(b[0], x0); x <= Math.min(b[2], x0 + CHUNK - 1); x++) {
+          const i = (y - y0) * CHUNK + x - x0, t = code(seed, l, x, y);
+          tiles[i] = t !== NONE ? t : ground(seed, nibble(regions, i), x, y);
+        }
+      }
+    }
+  }
+
   // ---------- chunks ----------
+  // A chunk is shared (src/expedition.js keeps one cache for every mission with its seed, and on the server for every room),
+  // so its lists are frozen: a reader can't change them for everyone. Typed arrays can't be frozen; tiles and regions are
+  // read-only by agreement.
+  const frozen = list => { for (const o of list) Object.freeze(o); return Object.freeze(list); };
   function chunk(seed, cx, cy) {
     const x0 = cx * CHUNK, y0 = cy * CHUNK, w = CHUNK + 2;
     const sites = sitesFor(seed, x0 - 1, y0 - 1, x0 + CHUNK, y0 + CHUNK);
@@ -420,17 +576,25 @@
       else t = ground(seed, r, x, y);
       tiles[i] = t;
     }
-    return { cx, cy, tiles, regions, finds: placeFinds(seed, cx, cy, tiles, regions, feats), caves: placeCaves(seed, cx, cy, tiles, regions) };
+    const finds = frozen(placeFinds(seed, cx, cy, tiles, regions, feats)), caves = frozen(placeCaves(seed, cx, cy, tiles, regions));
+    // The points of interest are stamped last, over the finished tiles. The finds and caves were placed from the tiles as
+    // they were, so every find id a saved mission holds is unchanged: the ones under a footprint are listed in `hidden`
+    // (src/expedition.js leaves them out), never moved. A cave is hidden when its mouth or its wall is under one.
+    const landmarks = Object.freeze(landmarksNear(seed, x0, y0, x0 + CHUNK - 1, y0 + CHUNK - 1));
+    stampLandmarks(seed, tiles, regions, x0, y0, landmarks);
+    const under = (x, y) => landmarks.some(l => inBox(l.box, x, y));
+    const hidden = Object.freeze({
+      finds: Object.freeze(finds.filter(f => under(f.x, f.y)).map(f => f.n)),
+      caves: Object.freeze(caves.filter(k => under(k.x, k.y) || under(k.x, k.y - 1)).map(k => k.n)),
+    });
+    return Object.freeze({ cx, cy, tiles, regions, finds, caves, hidden, landmarks });
   }
 
   const tileOf = (c, lx, ly) => c.tiles[ly * CHUNK + lx];
-  function regionOf(c, lx, ly) {
-    const i = ly * CHUNK + lx;
-    return (c.regions[i >> 1] >> ((i & 1) * 4)) & 15;
-  }
+  const regionOf = (c, lx, ly) => nibble(c.regions, ly * CHUNK + lx);
 
   return {
     CHUNK, TILE, NONE, BLOCKING, SPEED, REGIONS, BASE_RECT, FLAT_RADIUS, DIRS16, RINGS, FIND_KINDS,
-    seedOf, hash, unit, noise, regionAt, chunk, tileOf, regionOf, featuresNear, ringOf,
+    seedOf, hash, unit, noise, regionAt, chunk, tileOf, regionOf, featuresNear, ringOf, landmarkAt: landmark, landmarksNear,
   };
 });
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: the Step 2 command (the reach test takes about 8 s), then `npm test`.
Expected: PASS; 382 tests. The finds hash `0e84f5a1` and the caves hash `c656b50b` still pass; the world hash is re-pinned to `59ba57b3` on purpose (say so in the commit).

- [ ] **Step 5: Commit**

```bash
git add src/data.js src/worldgen.js src/expedition.js test/
git commit -m "feat(world): landmarks, one per 256-tile cell, stamped over everything else" -m "Adds the points of interest's tables and freezes the shared cache. Finds and caves under a landmark keep their index and are listed in c.hidden, so saved sites never move. The world hash is re-pinned 4f1ff5dc -> 59ba57b3 on purpose; finds and caves hashes unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: World II — Kestrel structures, formations, decor, and reading them

**Files:**
- Modify: `src/data.js`, `src/worldgen.js`, `src/expedition.js`
- Modify: `test/expedition.test.js`, `test/worldgen-poi.test.js`, `test/worldgen-reach.test.js`, `test/worldgen.test.js`

**Interfaces:**
- Consumes: Task 2's tables, `landmark()`, `c.hidden`.
- Produces:
  - `W.structure(seed, i, j)` → `null` or `{ id: 'S<i>,<j>', kind, x, y, box }` where `(x, y)` is the **door** (the pod's door gap; the others' tile just south of their south face) and `box` the footprint; `W.structuresNear(…)`; `W.reachesOut(seed, ex, ey, box)`; `W.terrainTile(seed, x, y)` (terrain without points of interest).
  - A lava tube gains `skylight: [x, y]` (its `SKYLIGHT` tile, where its cover ring goes).
  - `chunk()` gains `structures` (by footprint or apron), `formations` (`[{ id: 'F<cx>,<cy>', kind, x, y, box, size, sites }]`, at most one) and `props` (`[{ x, y, kind }]`, kinds per region in `D.DECOR`).
  - `X.findsIn(m, cx, cy)`, `X.cavesIn(m, cx, cy)` leave out `c.hidden`; `X.landmarksIn`, `X.structuresIn`; `X.landmarkById(m, id, pos)`, `X.structureById(m, id, pos)` answer only from inside the id's cell (else `null`) and never build a chunk. `collect` refuses a hidden find.

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/test/expedition.test.js b/test/expedition.test.js
index d967be4..ab6c8c1 100644
--- a/test/expedition.test.js
+++ b/test/expedition.test.js
@@ -413,3 +413,68 @@ test('solo play remembers where you stand (whole pixels), for a reload; junk and
   const next = E.resolveTurn(m, E.defaultPlan(m)).state;
   assert.equal(X.whereOf(next, 'minh'), null, 'a new round starts at the base');
 });
+
+// The first chunk under a landmark near the base, on mission codes tried in turn, that hides a find (or a cave).
+function hiding(what) {
+  for (let s = 0; s < 40; s++) {
+    const m = solo('HIDE-' + s), seed = W.seedOf(m.seed);
+    for (let j = -2; j < 2; j++) for (let i = -2; i < 2; i++) {
+      const b = (W.landmarkAt(seed, i, j) || {}).box;
+      if (!b) continue;
+      for (let cy = Math.floor(b[1] / 32); cy <= Math.floor(b[3] / 32); cy++) for (let cx = Math.floor(b[0] / 32); cx <= Math.floor(b[2] / 32); cx++) {
+        const c = X.chunkAt(m, cx, cy);
+        if (c.hidden[what].length) return { m, c, cx, cy };
+      }
+    }
+  }
+  throw new Error('no chunk near the base hides one of its ' + what);
+}
+
+test('a find or a cave under a footprint is left out: findsIn, cavesIn and findById skip it, and collect refuses it', () => {
+  const { m, c, cx, cy } = hiding('finds'), n = c.hidden.finds[0], f = c.finds[n], id = cx + ',' + cy + ':' + n;
+  const finds = X.findsIn(m, cx, cy);
+  assert.ok(!finds.some(g => g.n === n), 'findsIn leaves it out');
+  assert.equal(finds.length, c.finds.length - c.hidden.finds.length);
+  assert.ok(Object.isFrozen(finds));
+  assert.equal(X.findById(m, id), null);
+  const before = snap(m);
+  assert.equal(X.collect(m, 'minh', id, at(f.x, f.y)).error, 'noFind');
+  assert.equal(snap(m), before, 'a refused action changes nothing');
+  // The others keep their ids: a find's id is its index in the whole list.
+  for (const g of finds) assert.equal(X.findById(m, cx + ',' + cy + ':' + g.n).x, g.x);
+  const k = hiding('caves'), caves = X.cavesIn(k.m, k.cx, k.cy);
+  assert.deepEqual(caves.map(v => v.n), k.c.caves.map(v => v.n).filter(v => !k.c.hidden.caves.includes(v)));
+  assert.ok(Object.isFrozen(caves));
+});
+
+test('a landmark and a structure are read by id from inside their cell, frozen; other spellings and cells get null, and nothing is looked up', () => {
+  const m = solo('POI-1'), seed = W.seedOf(m.seed);
+  let l = null, s = null;
+  for (let j = -3; j < 3 && !l; j++) for (let i = -3; i < 3 && !l; i++) l = W.landmarkAt(seed, i, j);
+  for (let j = -6; j < 6 && !s; j++) for (let i = -6; i < 6 && !s; i++) s = W.structureAt(seed, i, j);
+  const lp = at(l.x, l.y), sp = at(s.x, s.y);
+  assert.deepEqual(X.landmarkById(m, l.id, lp), l);
+  assert.deepEqual(X.structureById(m, s.id, sp), s);
+  assert.ok(Object.isFrozen(X.landmarkById(m, l.id, lp).sites) && Object.isFrozen(X.structureById(m, s.id, sp).box));
+  // The chunks round them list them, frozen.
+  const lc = [Math.floor(l.x / 32), Math.floor(l.y / 32)], sc = [Math.floor(s.x / 32), Math.floor(s.y / 32)];
+  assert.ok(X.landmarksIn(m, ...lc).some(k => k.id === l.id) && Object.isFrozen(X.landmarksIn(m, ...lc)));
+  assert.ok(X.structuresIn(m, ...sc).some(k => k.id === s.id) && Object.isFrozen(X.structuresIn(m, ...sc)));
+  const real = { L: W.landmarkAt, S: W.structureAt };
+  let looked = 0;
+  W.landmarkAt = (...a) => { looked++; return real.L(...a); };
+  W.structureAt = (...a) => { looked++; return real.S(...a); };
+  try {
+    for (const id of [l.id + ':0', 'l' + l.i + ',' + l.j, 'L0' + l.i + ',' + l.j, 'L' + l.i + ', ' + l.j, 'S' + l.i + ',' + l.j, '', null, 'L4000,4000']) {
+      assert.equal(X.landmarkById(m, id, lp), null, String(id));
+    }
+    for (const id of [s.id + ':0', 's' + s.i + ',' + s.j, 'S0' + s.i + ',' + s.j, 'L' + s.i + ',' + s.j, 'S-4000,9']) {
+      assert.equal(X.structureById(m, id, sp), null, String(id));
+    }
+    assert.equal(X.landmarkById(m, l.id, { x: lp.x + 256 * T, y: lp.y }), null, 'from the next cell');
+    assert.equal(X.structureById(m, s.id, { x: sp.x, y: sp.y - 64 * T }), null, 'from the next cell');
+    assert.equal(X.landmarkById(m, l.id, null), null);
+    assert.equal(X.structureById(m, s.id, { x: NaN, y: 0 }), null);
+  } finally { W.landmarkAt = real.L; W.structureAt = real.S; }
+  assert.equal(looked, 0, 'nothing was looked up for them');
+});
diff --git a/test/worldgen-poi.test.js b/test/worldgen-poi.test.js
index bf552ec..82e2251 100644
--- a/test/worldgen-poi.test.js
+++ b/test/worldgen-poi.test.js
@@ -80,13 +80,20 @@ function flood(open, w, starts) {
   }
   return seen;
 }
-// Every landmark in the half × half cells either side of the base, for each mission code.
-function* landmarks(list, half) {
+// Every landmark (or structure) in the half × half cells either side of the base, for each mission code.
+function* landmarks(list, half, at = W.landmarkAt) {
   for (const code of list) {
     const seed = W.seedOf(code);
-    for (let j = -half; j < half; j++) for (let i = -half; i < half; i++) { const l = W.landmarkAt(seed, i, j); if (l) yield { seed, l }; }
+    for (let j = -half; j < half; j++) for (let i = -half; i < half; i++) { const l = at(seed, i, j); if (l) yield { seed, l }; }
   }
 }
+const structures = (list, half) => landmarks(list, half, W.structureAt);
+// The finds and caves a chunk must hide, by index: the ones under a landmark's box or a structure's footprint (a cave by
+// its mouth or its wall). The lists are as they were, so every saved find id still names the same find.
+function hiddenOf(c) {
+  const under = (x, y) => c.landmarks.some(k => inBox(k.box, x, y)) || c.structures.some(s => inBox(s.box, x, y));
+  return { finds: c.finds.filter(f => under(f.x, f.y)).map(f => f.n), caves: c.caves.filter(k => under(k.x, k.y) || under(k.x, k.y - 1)).map(k => k.n) };
+}
 
 test('landmarks: one in 60 % of the 256-tile cells, inside its cell, at most 40×40, never within 60 tiles of the base', () => {
   let n = 0;
@@ -135,6 +142,7 @@ test('each kind of landmark has its shape: delta fan, lava tube, giant crater, m
       assert.ok(len >= 25 && len <= 35, `${l.id}: ${len} long`);
       assert.equal(floor.length, 3 * len, `${l.id}: the floor`);
       assert.equal(sky.length, 1, `${l.id}: one skylight`);
+      assert.deepEqual(sky[0].slice(0, 2), l.skylight, `${l.id}: where it says its skylight is`);
       for (const [x, y] of floor) for (const [dx, dy] of N4) {
         assert.ok([T.TUBE_FLOOR, T.TUBE_WALL, T.SKYLIGHT].includes(at(x + dx, y + dy)), `${l.id}: the floor at ${x},${y} opens onto the ground`);
       }
@@ -220,10 +228,7 @@ test('a chunk lists the landmarks that touch it, the same one (by id) in each, a
       // By id: the same landmark, though not always the same object (the world's memo of features is cleared when it grows).
       assert.deepEqual(c.landmarks.find(k => k.id === l.id), l, `chunk ${cx},${cy} lists ${l.id}`);
       assert.deepEqual(c.landmarks.map(k => k.id), W.landmarksNear(seed, x0, y0, x0 + 31, y0 + 31).map(k => k.id));
-      // Hidden by index: the lists are as they were, so every saved find id still names the same find.
-      const under = (x, y) => c.landmarks.some(k => inBox(k.box, x, y));
-      assert.deepEqual(c.hidden.finds, c.finds.filter(f => under(f.x, f.y)).map(f => f.n), `chunk ${cx},${cy}: hidden finds`);
-      assert.deepEqual(c.hidden.caves, c.caves.filter(k => under(k.x, k.y) || under(k.x, k.y - 1)).map(k => k.n), `chunk ${cx},${cy}: hidden caves`);
+      assert.deepEqual(c.hidden, hiddenOf(c), `chunk ${cx},${cy}: hidden finds and caves`);
       assert.ok(Object.isFrozen(c.hidden) && Object.isFrozen(c.hidden.finds) && Object.isFrozen(c.landmarks));
       finds += c.hidden.finds.length;
       caves += c.hidden.caves.length;
@@ -232,3 +237,206 @@ test('a chunk lists the landmarks that touch it, the same one (by id) in each, a
   }
   assert.ok(finds > 20 && caves > 5 && shown > finds, `hidden finds ${finds}, hidden caves ${caves}, shown finds ${shown}`);
 });
+
+const ST = D.STRUCTURES;
+const GROUND = [T.REGOLITH, T.SAND, T.DUNE, T.ICE, T.POLYGON, T.LAVA]; // a region's own ground: no feature, no boulder
+const apronOf = b => [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1];
+
+test("structures: one in a 64-tile cell at its region's chance, inside the cell, 20 tiles from the base, clear of landmarks and features", () => {
+  const cells = W.REGIONS.map(() => 0), placed = W.REGIONS.map(() => 0), kinds = {};
+  for (const code of codes('ST', 6)) {
+    const seed = W.seedOf(code);
+    for (let j = -12; j < 12; j++) for (let i = -12; i < 12; i++) {
+      const r = W.regionAt(seed, i * ST.cell + 32, j * ST.cell + 32), s = W.structureAt(seed, i, j);
+      cells[r]++;
+      if (!s) continue;
+      placed[r]++;
+      kinds[s.kind] = (kinds[s.kind] || 0) + 1;
+      const b = s.box, a = apronOf(b), x0 = i * ST.cell, y0 = j * ST.cell;
+      assert.equal(s.id, 'S' + i + ',' + j);
+      assert.deepEqual([b[2] - b[0] + 1, b[3] - b[1] + 1], ST.kinds[s.kind].size, `${s.id}: a ${s.kind}'s size`);
+      // Its apron 2 tiles inside the cell, so two structures never touch and a chunk (inside one cell) looks up only its own.
+      assert.ok(a[0] >= x0 + 2 && a[1] >= y0 + 2 && a[2] <= x0 + ST.cell - 3 && a[3] <= y0 + ST.cell - 3, `${s.id}: box ${b}`);
+      const dx = Math.max(b[0], 0, -b[2]), dy = Math.max(b[1], 0, -b[3]);
+      assert.ok(dx * dx + dy * dy >= ST.clear * ST.clear, `${s.id}: box ${b} comes within 20 tiles of the HQ`);
+      assert.equal(W.landmarksNear(seed, ...a).length, 0, `${s.id}: on a landmark`);
+      const f = W.featuresNear(seed, ...a);
+      assert.equal(f.canyons.length + f.craters.length + f.mesas.length, 0, `${s.id}: on a feature`);
+      assert.equal(s.region, W.regionAt(seed, s.x, s.y), `${s.id}: its region is its door's`);
+      assert.ok(Object.isFrozen(s) && Object.isFrozen(s.box), 'frozen');
+    }
+  }
+  assert.deepEqual(Object.keys(kinds).sort(), Object.keys(ST.kinds).sort(), JSON.stringify(kinds));
+  // By the region at the cell's centre: flat ground is rarer where the features are, so a few chances fall short.
+  W.REGIONS.forEach((r, k) => {
+    const rate = placed[k] / cells[k];
+    assert.ok(rate > ST.chance[r] - 0.1 && rate < ST.chance[r] + 0.05, `${r}: structures in ${(100 * rate).toFixed(1)} % of its cells`);
+  });
+});
+
+test("each structure is stamped on flat ground: a solid footprint, or a hab pod's walls round a 3×3 floor with its door in the south wall, in a ring of open ground", () => {
+  let pods = 0;
+  for (const { seed, l: s } of structures(codes('STS', 4), 8)) {
+    const cache = new Map(), b = s.box, w = b[2] - b[0] + 1;
+    for (const [x, y, t] of boxTiles(seed, apronOf(b), cache)) {
+      if (!inBox(b, x, y)) assert.ok(GROUND.includes(t), `${s.id}: its apron at ${x},${y} is tile ${t}`);
+      else if (s.kind !== 'pod') assert.equal(t, T.STRUCT_WALL, `${s.id}: the ${s.kind} at ${x},${y}`);
+      else {
+        const edge = x === b[0] || x === b[2] || y === b[1] || y === b[3];
+        assert.equal(t, edge && !(x === s.x && y === s.y) ? T.STRUCT_WALL : T.STRUCT_FLOOR, `${s.id}: the pod at ${x},${y}`);
+      }
+    }
+    // The door: the gap in a pod's south wall, or the open tile just south of the middle of the others' south face.
+    assert.deepEqual([s.x, s.y], [b[0] + (w >> 1), s.kind === 'pod' ? b[3] : b[3] + 1], s.id);
+    if (s.kind === 'pod') pods++;
+  }
+  assert.ok(pods > 10, 'pods checked: ' + pods);
+});
+
+test("every structure's door can be reached from the border of the 96×96 window round it (§2.3), and reachesOut says so", () => {
+  let n = 0;
+  for (const { seed, l: s } of structures(codes('STR', 2), 6)) {
+    n++;
+    // A flood fill of the stamped world from the window's border reaches the door.
+    const x0 = s.x - 48, y0 = s.y - 48, tiles = boxTiles(seed, [x0, y0, x0 + 95, y0 + 95], new Map());
+    const open = Uint8Array.from(tiles, t => (W.BLOCKING[t[2]] ? 0 : 1)), border = [];
+    for (let k = 0; k < 96; k++) border.push(k, 95 * 96 + k, k * 96, k * 96 + 95);
+    assert.equal(flood(open, 96, border)[48 * 96 + 48], 1, `${s.id}: its door at ${s.x},${s.y} is cut off`);
+    assert.ok(W.reachesOut(seed, s.x, s.box[3] + 1, s.box), s.id);
+  }
+  assert.ok(n > 50, 'structures checked: ' + n);
+  // And it says no from a closed pocket: the middle of a mesa, walled in by its cliff.
+  const seed = W.seedOf('STR-0'), m = W.featuresNear(seed, -600, -600, 599, 599).mesas[0];
+  assert.equal(W.reachesOut(seed, m.x, m.y), false, `the middle of the mesa at ${m.x},${m.y}`);
+  assert.equal(W.reachesOut(seed, m.box[0] - 2, m.y), true, 'beside it');
+});
+
+test('a chunk lists the structures whose footprint or apron touches it, and hides the finds and caves under their footprints', () => {
+  let n = 0, finds = 0;
+  for (const { seed, l: s } of structures(codes('STH', 6), 12)) {
+    const a = apronOf(s.box);
+    for (let cy = Math.floor(a[1] / 32); cy <= Math.floor(a[3] / 32); cy++) for (let cx = Math.floor(a[0] / 32); cx <= Math.floor(a[2] / 32); cx++) {
+      const c = W.chunk(seed, cx, cy), x0 = cx * 32, y0 = cy * 32;
+      n++;
+      assert.deepEqual(c.structures.find(k => k.id === s.id), s, `chunk ${cx},${cy} lists ${s.id}`);
+      assert.deepEqual(c.structures.map(k => k.id), W.structuresNear(seed, x0, y0, x0 + 31, y0 + 31).map(k => k.id));
+      assert.deepEqual(c.hidden, hiddenOf(c), `chunk ${cx},${cy}: hidden finds and caves`);
+      assert.ok(Object.isFrozen(c.structures));
+      finds += c.finds.filter(f => inBox(s.box, f.x, f.y)).length;
+    }
+  }
+  assert.ok(n > 1000 && finds > 5, `chunks checked ${n}, finds under a footprint ${finds}`);
+});
+
+const FM = D.FORMATIONS, PLAIN = [T.REGOLITH, T.SAND, T.DUNE, T.ICE, T.POLYGON, T.LAVA];
+
+test('formations have a square of 2 or 3 tiles (the art reads at both) and decor has 4 to 6 kinds in every region', () => {
+  const sizes = Object.fromEntries(Object.entries(FM.kinds).map(([id, k]) => [id, k.size]));
+  assert.deepEqual(sizes, { arch: 3, yardang: 3, hoodoo: 2, balanced: 2, ventifact: 2, layered: 3, deviltracks: 3 });
+  assert.ok(FM.chance > 0 && FM.chance <= 1);
+  assert.deepEqual(Object.keys(D.DECOR.kinds).sort(), W.REGIONS.slice().sort());
+  for (const [r, kinds] of Object.entries(D.DECOR.kinds)) {
+    assert.ok(kinds.length >= 4 && kinds.length <= 6 && new Set(kinds).size === kinds.length, r + ': ' + kinds.join(', '));
+  }
+});
+
+test('formations: at most one a chunk, of its region, on plain ground clear of finds, caves and footprints; about 1 in 3 a science site', () => {
+  let chunks = 0, n = 0, science = 0;
+  const seen = new Set();
+  for (const code of codes('FM', 4)) {
+    const seed = W.seedOf(code);
+    for (let cy = -12; cy < 12; cy++) for (let cx = -12; cx < 12; cx++) {
+      const c = W.chunk(seed, cx, cy);
+      chunks++;
+      assert.ok(c.formations.length <= 1 && Object.isFrozen(c.formations), `chunk ${cx},${cy}`);
+      for (const f of c.formations) {
+        n++;
+        const b = f.box, s = FM.kinds[f.kind].size, at = (x, y) => W.tileOf(c, x - cx * 32, y - cy * 32);
+        assert.equal(f.id, 'F' + cx + ',' + cy);
+        assert.equal(f.region, W.regionAt(seed, f.x, f.y));
+        assert.ok(FM.kinds[f.kind].regions.includes(W.REGIONS[f.region]), `${f.id}: a ${f.kind} in the ${W.REGIONS[f.region]}`);
+        seen.add(f.kind + ' in the ' + W.REGIONS[f.region]);
+        // Its square, s tiles a side, just north of its spot, inside the chunk.
+        assert.deepEqual(b, [f.x - (s >> 1), f.y - s, f.x - (s >> 1) + s - 1, f.y - 1], f.id);
+        assert.ok(b[0] >= cx * 32 && b[1] >= cy * 32 && b[2] < cx * 32 + 32 && f.y < cy * 32 + 32, `${f.id} is inside its chunk`);
+        const spots = [[f.x, f.y]];
+        for (let y = b[1]; y <= b[3]; y++) for (let x = b[0]; x <= b[2]; x++) spots.push([x, y]);
+        for (const [x, y] of spots) {
+          assert.ok(PLAIN.includes(at(x, y)), `${f.id}: plain ground at ${x},${y}, not tile ${at(x, y)}`);
+          assert.ok(x * x + y * y > (W.FLAT_RADIUS + 1) * (W.FLAT_RADIUS + 1), `${f.id} is in the flat zone`);
+          assert.ok(!c.finds.some(k => k.x === x && k.y === y) && !c.caves.some(k => k.x === x && k.y === y), `${f.id}: a find or a cave at ${x},${y}`);
+        }
+        const ring = [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1];
+        assert.equal(W.landmarksNear(seed, ...ring).length, 0, `${f.id}: on a landmark`);
+        assert.equal(W.structuresNear(seed, ...ring).length, 0, `${f.id}: by a structure`);
+        // About 1 in 3 is also a science site, surveyed from its spot.
+        if (f.sites.length) {
+          science++;
+          assert.deepEqual(f.sites, [{ n: 0, x: f.x, y: f.y, kind: 'science', ring: W.ringOf(f.x, f.y), region: f.region, sub: f.kind }]);
+        }
+      }
+    }
+  }
+  assert.ok(n > chunks / 4, `formations in ${n} of ${chunks} chunks`);
+  assert.ok(science / n > 0.28 && science / n < 0.39, `science sites: ${science} of ${n}`);
+  for (const [kind, k] of Object.entries(FM.kinds)) for (const r of k.regions) assert.ok(seen.has(kind + ' in the ' + r), 'no ' + kind + ' in the ' + r);
+});
+
+test("decor: props of their region's kinds on open ground, never on a formation, and every kind turns up", () => {
+  const GROUND = [...PLAIN, T.CRATER_FLOOR, T.CANYON_FLOOR], seen = new Set();
+  let n = 0;
+  for (const code of codes('DC', 6)) {
+    const seed = W.seedOf(code);
+    for (let cy = -8; cy < 8; cy++) for (let cx = -8; cx < 8; cx++) {
+      const c = W.chunk(seed, cx, cy);
+      assert.ok(Object.isFrozen(c.props) && c.props.length <= D.DECOR.props);
+      for (const p of c.props) {
+        n++;
+        const lx = p.x - cx * 32, ly = p.y - cy * 32, r = W.regionOf(c, lx, ly);
+        assert.ok(lx >= 0 && lx < 32 && ly >= 0 && ly < 32, 'inside its chunk');
+        assert.ok(GROUND.includes(W.tileOf(c, lx, ly)), `a ${p.kind} on tile ${W.tileOf(c, lx, ly)}`);
+        assert.ok(D.DECOR.kinds[W.REGIONS[r]].includes(p.kind), `a ${p.kind} in the ${W.REGIONS[r]}`);
+        assert.ok(!c.formations.some(f => inBox(f.box, p.x, p.y)), `a ${p.kind} on a formation`);
+        seen.add(W.REGIONS[r] + ' ' + p.kind);
+      }
+    }
+  }
+  assert.ok(n > 4000, 'props: ' + n);
+  for (const [r, kinds] of Object.entries(D.DECOR.kinds)) for (const k of kinds) assert.ok(seen.has(r + ' ' + k), `no ${k} in the ${r}`);
+});
+
+test('one point of interest to a cell: no two footprints (a structure with its apron) overlap or touch', () => {
+  const touch = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
+  let n = 0;
+  for (const code of codes('ONE', 3)) {
+    const seed = W.seedOf(code), all = [];
+    for (let j = -4; j < 4; j++) for (let i = -4; i < 4; i++) { const l = W.landmarkAt(seed, i, j); if (l) all.push([l.id, l.box]); }
+    for (let j = -16; j < 16; j++) for (let i = -16; i < 16; i++) { const s = W.structureAt(seed, i, j); if (s) all.push([s.id, apronOf(s.box)]); }
+    n += all.length;
+    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
+      assert.ok(!touch(all[a][1], all[b][1]), `${all[a][0]} ${all[a][1]} touches ${all[b][0]} ${all[b][1]}`);
+    }
+  }
+  assert.ok(n > 900, 'footprints: ' + n);
+});
+
+test('every chunk comes out the same, points of interest and all, whatever was built before it, in a fresh copy of the world too', () => {
+  // A second copy of src/worldgen.js, with memos of its own, builds the chunks backwards with others in between.
+  delete require.cache[require.resolve('../src/worldgen.js')];
+  const W2 = require('../src/worldgen.js'), seed = W.seedOf('ORDER-1'), coords = [], seen = { l: 0, s: 0, f: 0 };
+  assert.notEqual(W2, W);
+  for (let cy = -8; cy < 8; cy++) for (let cx = -8; cx < 8; cx++) coords.push([cx, cy]);
+  const key = c => JSON.stringify([Array.from(c.tiles), Array.from(c.regions), c.finds, c.caves, c.hidden, c.landmarks, c.structures, c.formations, c.props]);
+  const first = coords.map(([cx, cy]) => {
+    const c = W.chunk(seed, cx, cy);
+    seen.l += c.landmarks.length; seen.s += c.structures.length; seen.f += c.formations.length;
+    return key(c);
+  });
+  for (let k = coords.length - 1; k >= 0; k--) {
+    W2.chunk(seed, coords[k][0] + 1, coords[k][1] - 1);
+    assert.equal(key(W2.chunk(seed, coords[k][0], coords[k][1])), first[k], 'chunk ' + coords[k]);
+  }
+  // And built again in the first copy, after all that: what it keeps between chunks never leaks into a chunk.
+  coords.forEach(([cx, cy], k) => assert.equal(key(W.chunk(seed, cx, cy)), first[k], 'chunk ' + cx + ',' + cy + ' again'));
+  assert.ok(seen.l > 3 && seen.s > 10 && seen.f > 20, JSON.stringify(seen));
+});
diff --git a/test/worldgen-reach.test.js b/test/worldgen-reach.test.js
index 9286cd0..6abdc53 100644
--- a/test/worldgen-reach.test.js
+++ b/test/worldgen-reach.test.js
@@ -1,7 +1,7 @@
 'use strict';
 // Spec §1.3 and §2.3: on 300 seeds, every open tile within 128 tiles of the base can be reached on foot from the base,
-// and so can every find, every landmark's site and every cave (they only ever stand on open ground). A find or a cave
-// under a footprint is hidden, never shown, so it is left out.
+// and so can every find, every landmark's site, every structure's door and every cave (they only ever stand on open
+// ground). A find or a cave under a footprint is hidden, never shown, so it is left out.
 // Slow (it builds 30,000 chunks), so it has its own file and runs alongside the rest of the suite.
 const test = require('node:test');
 const assert = require('node:assert/strict');
@@ -10,19 +10,20 @@ const W = require('../src/worldgen.js');
 const BUILD = 160; // build tiles −160..159: a 32-tile margin, more than the 24 tiles between canyon ramps
 const CHECK = 128; // check tiles −128..127 (256×256)
 
-test("on 300 seeds every open tile, every find, every landmark's site and every cave within 128 tiles of the base can be reached from the base", () => {
+test("on 300 seeds every open tile, find, landmark site, structure door and cave within 128 tiles of the base can be reached from the base", () => {
   const size = BUILD * 2;
   const blocked = new Uint8Array(size * size), seen = new Uint8Array(size * size), queue = new Int32Array(size * size);
-  let total = 0, totalSites = 0;
+  let total = 0, totalSites = 0, totalDoors = 0;
   for (let n = 0; n < 300; n++) {
     const seed = W.seedOf('REACH-' + n);
-    const finds = [], caves = [], sites = new Map(); // a landmark is listed by every chunk it touches: count its sites once
+    const finds = [], caves = [], sites = new Map(), doors = new Map(); // listed by every chunk they touch: count them once
     for (let cy = -BUILD / 32; cy < BUILD / 32; cy++) for (let cx = -BUILD / 32; cx < BUILD / 32; cx++) {
       const c = W.chunk(seed, cx, cy);
       const near = p => Math.abs(p.x) < CHECK && Math.abs(p.y) < CHECK;
       for (const f of c.finds) if (near(f) && !c.hidden.finds.includes(f.n)) finds.push(f);
       for (const k of c.caves) if (near(k) && !c.hidden.caves.includes(k.n)) caves.push(k);
       for (const l of c.landmarks) for (const f of l.sites) if (near(f)) sites.set(l.id + ':' + f.n, f);
+      for (const s of c.structures) if (near(s)) doors.set(s.id, s);
       for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
         blocked[(cy * 32 + ly + BUILD) * size + cx * 32 + lx + BUILD] = W.BLOCKING[c.tiles[ly * 32 + lx]];
       }
@@ -47,10 +48,13 @@ test("on 300 seeds every open tile, every find, every landmark's site and every
     }
     assert.equal(lost, 0, `seed REACH-${n}: ${lost} open tiles are cut off, e.g. tile ${example}`);
     for (const f of [...finds, ...sites.values()]) assert.equal(seen[(f.y + BUILD) * size + f.x + BUILD], 1, `seed REACH-${n}: the ${f.kind} at ${f.x},${f.y} can't be reached`);
+    for (const s of doors.values()) assert.equal(seen[(s.y + BUILD) * size + s.x + BUILD], 1, `seed REACH-${n}: the door of the ${s.kind} at ${s.x},${s.y} can't be reached`);
     for (const k of caves) assert.equal(seen[(k.y + BUILD) * size + k.x + BUILD], 1, `seed REACH-${n}: the cave at ${k.x},${k.y} can't be reached`);
     total += caves.length;
     totalSites += sites.size;
+    totalDoors += doors.size;
   }
   assert.ok(total > 300, "caves checked: " + total);
   assert.ok(totalSites > 300, "landmark sites checked: " + totalSites);
+  assert.ok(totalDoors > 1500, "structure doors checked: " + totalDoors);
 });
diff --git a/test/worldgen.test.js b/test/worldgen.test.js
index f0a6ee9..d154f91 100644
--- a/test/worldgen.test.js
+++ b/test/worldgen.test.js
@@ -240,8 +240,9 @@ test('a pinned hash of 1,000 chunks catches any change to the world', () => {
   const got = fnv(parts);
   // The world as this plan's worldgen.js builds it. The browser QA (Task 11) checks Chrome gets the same value.
   // Change it only when you mean to change the world, and say so in the commit message.
-  // M4c: the landmarks stamp their footprints (was 4f1ff5dc). Only tiles inside a footprint changed: 0 outside on 6 seeds,
-  // and the regions, finds and caves are as they were (their own pinned hashes did not move).
-  const PINNED = '59ba57b3';
+  // M4c: the landmarks and the structures stamp their footprints (was 4f1ff5dc). Only tiles inside a footprint changed (and
+  // the boulders on a structure's apron): 0 outside on 6 seeds, and the regions, finds and caves are as they were (their own
+  // pinned hashes did not move).
+  const PINNED = '3ae4db5e';
   assert.equal(got, PINNED, 'world hash is ' + got);
 });
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/expedition.test.js test/worldgen-poi.test.js test/worldgen-reach.test.js test/worldgen.test.js`
Expected: 15 of 58 fail, among them "structures: one in a 64-tile cell at its region's chance…", "each structure is stamped on flat ground…", "every structure's door can be reached from the border of the 96×96 window round it (§2.3)…", "formations: at most one a chunk…", "decor: props of their region's kinds on open ground…", "one point of interest to a cell…", "every chunk comes out the same, points of interest and all, whatever was built before it…", "a find or a cave under a footprint is left out…" and the world hash pin (now `3ae4db5e`).

- [ ] **Step 3: Place the structures, formations and decor, and read them**

```diff
diff --git a/src/data.js b/src/data.js
index 74fe74d..6d468d2 100644
--- a/src/data.js
+++ b/src/data.js
@@ -297,18 +297,32 @@
         array: { size: [4, 2], hold: 5, materials: 2, log: 'ks.array' },
       },
     },
-    // Natural formations: scenery with real geology, scattered per chunk in the regions listed; about 1 in 3 is also a
-    // science site.
+    // Natural formations: scenery with real geology, scattered per chunk in the regions listed: a chunk holds one with
+    // `chance`. About 1 in 3 is also a science site. `size` is the side of its square in tiles (art draws each sprite
+    // that wide); none of them blocks, and the dust-devil tracks are a flat mark on the ground.
     FORMATIONS: {
-      science: 1 / 3,
+      chance: 0.75, science: 1 / 3,
       kinds: {
-        arch: { regions: ['canyons', 'craters'], fact: 'fm.arch' },
-        yardang: { regions: ['plains', 'volcanic'], fact: 'fm.yardang' },
-        hoodoo: { regions: ['canyons'], fact: 'fm.hoodoo' },
-        balanced: { regions: ['plains', 'craters', 'icy'], fact: 'fm.balanced' },
-        ventifact: { regions: ['plains', 'dunes', 'volcanic'], fact: 'fm.ventifact' },
-        layered: { regions: ['canyons', 'craters'], fact: 'fm.layered' },
-        deviltracks: { regions: ['plains', 'dunes', 'icy'], fact: 'fm.deviltracks' },
+        arch: { regions: ['canyons', 'craters'], size: 3, fact: 'fm.arch' },
+        yardang: { regions: ['plains', 'volcanic'], size: 3, fact: 'fm.yardang' },
+        hoodoo: { regions: ['canyons'], size: 2, fact: 'fm.hoodoo' },
+        balanced: { regions: ['plains', 'craters', 'icy'], size: 2, fact: 'fm.balanced' },
+        ventifact: { regions: ['plains', 'dunes', 'volcanic'], size: 2, fact: 'fm.ventifact' },
+        layered: { regions: ['canyons', 'craters'], size: 3, fact: 'fm.layered' },
+        deviltracks: { regions: ['plains', 'dunes', 'icy'], size: 3, fact: 'fm.deviltracks' },
+      },
+    },
+    // Decor (spec §3.7): props scattered by each chunk's seed, `props` darts a chunk. Scenery only: nothing blocks or is
+    // picked up. 4–6 kinds per region: the painter's own decor (src/surface-paint.js) and `rock`, a small rock standing up.
+    DECOR: {
+      props: 12,
+      kinds: {
+        plains: ['pebbles', 'pit', 'blotch', 'crack', 'rock'],
+        dunes: ['ripple', 'blotch', 'pebbles', 'pit'],
+        craters: ['pit', 'pebbles', 'blotch', 'crack', 'rock'],
+        canyons: ['strata', 'pebbles', 'blotch', 'crack', 'rock'],
+        icy: ['crack', 'frost', 'blotch', 'pit', 'pebbles'],
+        volcanic: ['vesicles', 'pebbles', 'blotch', 'crack', 'rock'],
       },
     },
     // Role skills on the map (spec §3.3): factors on how long you hold E, and the scientist's extra science.
diff --git a/src/expedition.js b/src/expedition.js
index 34fcee5..879b9ae 100644
--- a/src/expedition.js
+++ b/src/expedition.js
@@ -8,6 +8,8 @@
  * the surface draws with and the network sends. The mission state is described at newExpedition in src/engine.js.
  *
  * API: findById(m, id) → the find plus { id, cx, cy, left } or null · findsIn(m, cx, cy) · cavesIn(m, cx, cy)
+ *      (the finds and caves under a point of interest's footprint are left out: never shown, never collected)
+ *      landmarksIn(m, cx, cy) · structuresIn(m, cx, cy) · landmarkById(m, id, pos) · structureById(m, id, pos) → or null
  *      chunkAt(m, cx, cy) → the data chunk · loadsLeft(m, find, id) · itemFor(m, find, load, role) · holdSeconds(kind, role)
  *      capacity(m, crewId) · inBaseZone(pos, slack) · suitOf(m, crewId) · setSuit(m, crewId, s) · bay(m) → the rover's bay
  *      setWhere(m, crewId, pos) · whereOf(m, crewId) (solo: where you stand, so a reload puts you back there)
@@ -39,8 +41,13 @@
     if (cache.size > CACHE) cache.delete(cache.keys().next().value);
     return c;
   }
-  function findsIn(m, cx, cy) { return chunkAt(m, cx, cy).finds; }
-  function cavesIn(m, cx, cy) { return chunkAt(m, cx, cy).caves; }
+  // A find or a cave under a landmark's or a structure's footprint keeps its place in its chunk's list (its id is its index)
+  // but is never shown: the chunk lists it in `hidden`, and the readers here leave it out.
+  const shown = (list, hidden) => (hidden.length ? Object.freeze(list.filter(o => !hidden.includes(o.n))) : list);
+  function findsIn(m, cx, cy) { const c = chunkAt(m, cx, cy); return shown(c.finds, c.hidden.finds); }
+  function cavesIn(m, cx, cy) { const c = chunkAt(m, cx, cy); return shown(c.caves, c.hidden.caves); }
+  function landmarksIn(m, cx, cy) { return chunkAt(m, cx, cy).landmarks; }
+  function structuresIn(m, cx, cy) { return chunkAt(m, cx, cy).structures; }
 
   // Ids are written exactly the way the world writes them, so one thing has one id: the numbers in one, or null.
   function idNums(re, id) {
@@ -58,10 +65,23 @@
     const g = idNums(ID, id);
     if (!g) return null;
     const [cx, cy, n] = g;
-    const f = findsIn(m, cx, cy)[n];
-    if (!f) return null;
+    const c = chunkAt(m, cx, cy), f = c.finds[n];
+    if (!f || c.hidden.finds.includes(n)) return null;
     return Object.assign({ id, cx, cy, left: loadsLeft(m, f, id) }, f);
   }
+  // A landmark's id is "L<i>,<j>" (its 256-tile cell), a structure's "S<i>,<j>" (its 64-tile cell). Each is only looked up
+  // from a position inside its cell, as a find is from its chunk: you see a landmark's centre (22 tiles inside its cell)
+  // and use a structure from its door (2 tiles inside) only from there, so an id sent from far away costs nothing. The
+  // world reads them from its own cells, without building a chunk; they are frozen, like the cache.
+  const LID = /^L(-?\d{1,7}),(-?\d{1,7})$/, SID = /^S(-?\d{1,7}),(-?\d{1,7})$/;
+  function landmarkById(m, id, pos) {
+    const g = idNums(LID, id);
+    return g && okPos(pos) && inCell(pos, g[0], g[1], D.LANDMARKS.cell) ? W.landmarkAt(W.seedOf(m.seed), g[0], g[1]) : null;
+  }
+  function structureById(m, id, pos) {
+    const g = idNums(SID, id);
+    return g && okPos(pos) && inCell(pos, g[0], g[1], D.STRUCTURES.cell) ? W.structureAt(W.seedOf(m.seed), g[0], g[1]) : null;
+  }
   function loadsLeft(m, f, id) {
     const v = m.expedition.sites[id == null ? f.id : id];
     return Number.isFinite(v) ? v : D.FINDS[f.kind].loads[f.ring];
@@ -305,7 +325,7 @@
   }
 
   return {
-    findById, findsIn, cavesIn, chunkAt, loadsLeft, holdSeconds, capacity, inBaseZone, suitOf, setSuit, itemFor, bay, roverLeft,
+    findById, findsIn, cavesIn, landmarksIn, structuresIn, landmarkById, structureById, chunkAt, loadsLeft, holdSeconds, capacity, inBaseZone, suitOf, setSuit, itemFor, bay, roverLeft,
     setRoverDriven, setWhere, whereOf, collect, deliver, useCanister, pickUp, collapse, revive, board, park,
     cacheSize: () => cache.size,
   };
diff --git a/src/worldgen.js b/src/worldgen.js
index 2636078..c810cea 100644
--- a/src/worldgen.js
+++ b/src/worldgen.js
@@ -10,19 +10,26 @@
  * (−4, −2), so the HQ is at (0, 0). Nothing that blocks is ever placed within FLAT_RADIUS tiles of the HQ.
  *
  * API: seedOf(missionSeed) → uint32 · regionAt(seed, x, y) → index into REGIONS
- *      chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512), finds, caves, hidden, landmarks }
- *        (32×32, row-major)
+ *      chunk(seed, cx, cy) → { cx, cy, tiles: Uint8Array(1024), regions: Uint8Array(512), finds, caves, hidden, landmarks,
+ *        structures, formations, props }   (32×32, row-major)
  *        finds: [{ n, x, y, kind, ring, region, sub? }] in world tiles; a find's id is "<cx>,<cy>:<n>"
  *        caves: [{ n, x, y, region }] in world tiles: a cave's mouth, an open tile; its wall is the tile north of it
- *        hidden: { finds: [n], caves: [n] }: the ones under a point of interest's footprint. They keep their place in the
- *          lists, so every id stays stable; src/expedition.js leaves them out.
+ *        hidden: { finds: [n], caves: [n] }: the ones under a landmark's box or a structure's footprint. They keep their
+ *          place in the lists, so every id stays stable; src/expedition.js leaves them out.
  *        landmarks: the ones whose box touches the chunk: { id: "L<i>,<j>", kind, i, j, x, y (its centre), region,
  *          box: [x0, y0, x1, y1] (its footprint, inclusive), sites: finds as above (a site's id is "<landmark id>:<n>"),
- *          and its shape (delta: dir, apex · tube: a, vert, s · crater: r, gaps · stardune: arms) }
+ *          and its shape (delta: dir, apex · tube: a, vert, s, skylight: [x, y] · crater: r, gaps · stardune: arms) }
+ *        structures: the ones whose footprint or apron touches the chunk: { id: "S<i>,<j>", kind, i, j, x, y (its door),
+ *          region, box: its footprint [x0, y0, x1, y1] (inclusive; the ring of tiles round it, its apron, is open ground) }
+ *        formations: the chunk's formation, or none: [{ id: "F<cx>,<cy>", kind, x, y (its spot, the tile south of its
+ *          middle), region, box: its square, sites: [] or its survey (id "<formation id>:0") }]; it blocks nothing
+ *        props: decor, scenery only: [{ x, y, kind }], kind from D.DECOR for the region
  *      ringOf(x, y) → 0 inner · 1 middle · 2 outer · 3 far
  *      tileOf(chunk, lx, ly) · regionOf(chunk, lx, ly)
  *      featuresNear(seed, x0, y0, x1, y1) → { canyons, craters, mesas } touching that tile box (inclusive)
  *      landmarkAt(seed, i, j) → the landmark of cell (i, j) of the 256-tile grid, or null · landmarksNear(seed, x0, y0, x1, y1)
+ *      structureAt(seed, i, j) → the structure of cell (i, j) of the 64-tile grid, or null · structuresNear(seed, x0, y0, x1, y1)
+ *      reachesOut(seed, x, y, box?) → can (x, y) reach the border of the 96×96 window round it on foot (§2.3)
  *      hash(seed, a, b, c) → uint32 · unit(h) → [0, 1) · noise(seed, salt, x, y, size) → [0, 1]
  */
 (function (root, factory) {
@@ -437,7 +444,7 @@
         const h = hash(seed, i, j, 1010), a = 12 + (h % 6), vert = (h >>> 8) % 2 === 1, s = ((h >>> 12) % (a + 1)) - (a >> 1);
         const at = (u, v) => (vert ? [x + v, y + u] : [x + u, y + v]);
         const box = vert ? [x - 3, y - a - 2, x + 3, y + a + 2] : [x - a - 2, y - 3, x + a + 2, y + 3];
-        return { a, vert, s, box, spots: [at(1 - a, 0), at(a - 1, 0)] };
+        return { a, vert, s, skylight: at(s, 2), box, spots: [at(1 - a, 0), at(a - 1, 0)] };
       },
       code(seed, l, x, y) {
         const u = l.vert ? y - l.y : x - l.x, v = l.vert ? x - l.x : y - l.y, au = Math.abs(u), av = Math.abs(v);
@@ -532,17 +539,122 @@
     for (const [i, j] of cellsTouching(box, LM.cell)) { const l = landmark(seed, i, j); if (l && touch(l.box, box)) out.push(l); }
     return out;
   }
-  // Redraws the chunk's tiles that lie in a landmark's box: its shape, or the region's own ground.
-  function stampLandmarks(seed, tiles, regions, x0, y0, lms) {
-    for (const l of lms) {
-      const code = SHAPES[l.kind].code, b = l.box;
-      for (let y = Math.max(b[1], y0); y <= Math.min(b[3], y0 + CHUNK - 1); y++) {
-        for (let x = Math.max(b[0], x0); x <= Math.min(b[2], x0 + CHUNK - 1); x++) {
-          const i = (y - y0) * CHUNK + x - x0, t = code(seed, l, x, y);
-          tiles[i] = t !== NONE ? t : ground(seed, nibble(regions, i), x, y);
-        }
+  // Redraws the chunk's tiles that lie in the box b: code(x, y), or the region's own ground where it gives NONE.
+  function stamp(seed, tiles, regions, x0, y0, b, code) {
+    for (let y = Math.max(b[1], y0); y <= Math.min(b[3], y0 + CHUNK - 1); y++) {
+      for (let x = Math.max(b[0], x0); x <= Math.min(b[2], x0 + CHUNK - 1); x++) {
+        const i = (y - y0) * CHUNK + x - x0, t = code(x, y);
+        tiles[i] = t !== NONE ? t : ground(seed, nibble(regions, i), x, y);
+      }
+    }
+  }
+
+  // ---------- Kestrel structures (spec §3.7, M4c): one per 64×64 cell at most, on flat ground ----------
+  // A structure's footprint (D.STRUCTURES' size, 2×2 to 5×5) is jittered inside its cell, with the 1-tile apron round it
+  // 2 tiles inside the cell, so two structures never touch; a 32-tile chunk lies inside one cell, so it looks up only that
+  // one. Its chance is its region's (the region at its door). It is placed only on flat ground: no landmark and no
+  // feature (crater, canyon, mesa) has its box touching the footprint or the apron, it is at least 20 tiles from the HQ,
+  // and its entrance passes §2.3's reachability check. It is stamped over the boulders (precedence landmark > structure >
+  // features > boulders): its footprint solid, or a hab pod's walls round a 3×3 floor, and its apron the region's ground.
+  // So it stands in a ring of open ground and can never cut ground off.
+  const ST = D.STRUCTURES, ST_KINDS = Object.keys(ST.kinds), WIN = 48; // the reachability window is 2 × WIN tiles across
+
+  // The tiles before any point of interest is stamped, a chunk at a time (terrain(), with the chunks below): the
+  // reachability check reads them, and the chunk they belong to starts from them. A few are kept, as the 4 chunks of a
+  // structure cell share them.
+  const terrainMemo = new Map();
+  function terrainTile(seed, x, y) {
+    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
+    return terrain(seed, cx, cy).tiles[(y - cy * CHUNK) * CHUNK + x - cx * CHUNK];
+  }
+
+  // §2.3's reachability check: can (ex, ey) reach the border of the 96×96 window round it over open ground? The terrain
+  // without the points of interest gives the same answer, as each one stands in a ring of open ground; only the footprint
+  // being placed (`box`: solid, with its open apron) is drawn in. A depth-first search that tries south first (structures
+  // face south): on open ground it walks straight out in 48 steps.
+  const OUT4 = [[0, -1], [-1, 0], [1, 0], [0, 1]]; // pushed in this order, so south is popped first
+  function reachesOut(seed, ex, ey, box) {
+    const n = 2 * WIN, seen = new Uint8Array(n * n), stack = [ex, ey], apron = box && grow(box, 1);
+    const open = (x, y) => (apron && inBox(apron, x, y) ? !inBox(box, x, y) : !BLOCKING[terrainTile(seed, x, y)]);
+    seen[WIN * n + WIN] = 1;
+    while (stack.length) {
+      const y = stack.pop(), x = stack.pop(), u = x - ex + WIN, v = y - ey + WIN;
+      if (u === 0 || v === 0 || u === n - 1 || v === n - 1) return true;
+      for (const [dx, dy] of OUT4) {
+        const k = (v + dy) * n + u + dx;
+        if (seen[k]) continue;
+        seen[k] = 1;
+        if (open(x + dx, y + dy)) stack.push(x + dx, y + dy);
       }
     }
+    return false;
+  }
+
+  // The structure of cell (i, j) of the 64-tile grid, or null. Its id is "S<i>,<j>"; (x, y) is its door, the open tile it
+  // is used from: a hab pod's is the gap in its south wall, the others' the tile just south of the middle of their south face.
+  function structure(seed, i, j) {
+    return memo('S' + seed + ':' + i + ':' + j, () => {
+      const kind = ST_KINDS[hash(seed, i, j, 1102) % ST_KINDS.length], w = ST.kinds[kind].size[0], d = ST.kinds[kind].size[1];
+      const h = hash(seed, i, j, 1101), bx = i * ST.cell + 3 + (h % (ST.cell - 5 - w)), by = j * ST.cell + 3 + ((h >>> 16) % (ST.cell - 5 - d));
+      const box = [bx, by, bx + w - 1, by + d - 1], apron = grow(box, 1);
+      const x = bx + (w >> 1), y = kind === 'pod' ? box[3] : box[3] + 1, region = regionAt(seed, x, y);
+      if (unit(hash(seed, i, j, 1100)) >= ST.chance[REGIONS[region]]) return null;
+      if (fromHQ2(box) < ST.clear * ST.clear || landmarksNear(seed, ...apron).length) return null;
+      const f = featuresNear(seed, ...apron);
+      if (f.canyons.length || f.craters.length || f.mesas.length) return null;
+      if (!reachesOut(seed, x, box[3] + 1, box)) return null;
+      return deepFreeze({ id: 'S' + i + ',' + j, kind, i, j, x, y, region, box });
+    });
+  }
+  // Every structure whose footprint or apron touches the tile box [x0..x1] × [y0..y1] (inclusive).
+  function structuresNear(seed, x0, y0, x1, y1) {
+    const box = [x0, y0, x1, y1], out = [];
+    for (const [i, j] of cellsTouching(box, ST.cell)) { const s = structure(seed, i, j); if (s && touch(grow(s.box, 1), box)) out.push(s); }
+    return out;
+  }
+  // A structure's tile at (x, y) in its footprint and apron: NONE on the apron, for the region's ground.
+  function structTile(s, x, y) {
+    const b = s.box;
+    if (!inBox(b, x, y)) return NONE;
+    if (s.kind !== 'pod') return TILE.STRUCT_WALL;
+    const edge = x === b[0] || x === b[2] || y === b[1] || y === b[3];
+    return edge && !(x === s.x && y === s.y) ? TILE.STRUCT_WALL : TILE.STRUCT_FLOOR;
+  }
+
+  // ---------- formations and decor (spec §3.7, M4c): scenery placed by each chunk's own seed, last ----------
+  // A chunk holds a formation with D.FORMATIONS' chance, of a kind its region has (the region at its spot). Its square
+  // (`size` tiles a side) stands just north of its spot, the tile you survey it from, and only on plain ground: the square
+  // and the spot are the region's own ground (no feature, point of interest, boulder or base), inside the chunk, outside
+  // the flat zone, with no find or cave mouth on them, and no point of interest's footprint or apron comes within a tile.
+  // Nothing in it blocks (art draws it over the ground), so it changes no tile. About 1 in 3 is also a science site, at
+  // its spot. Decor props land on open ground, never on a formation.
+  const FM = D.FORMATIONS, FM_KINDS = REGIONS.map(r => Object.keys(FM.kinds).filter(k => FM.kinds[k].regions.includes(r)));
+  const PLAIN = new Uint8Array(32), DECOR_GROUND = new Uint8Array(32);
+  for (const k of ['REGOLITH', 'SAND', 'DUNE', 'ICE', 'POLYGON', 'LAVA']) PLAIN[TILE[k]] = DECOR_GROUND[TILE[k]] = 1;
+  DECOR_GROUND[TILE.CRATER_FLOOR] = DECOR_GROUND[TILE.CANYON_FLOOR] = 1;
+  function placeFormation(seed, cx, cy, tiles, regions, finds, caves, areas) {
+    if (unit(hash(seed, cx, cy, 1200)) >= FM.chance) return null;
+    const h = hash(seed, cx, cy, 1201), lx = 2 + (h % (CHUNK - 4)), ly = 4 + ((h >>> 8) % (CHUNK - 5));
+    const x0 = cx * CHUNK, y0 = cy * CHUNK, x = x0 + lx, y = y0 + ly, region = nibble(regions, ly * CHUNK + lx);
+    const kinds = FM_KINDS[region], kind = kinds[(h >>> 16) % kinds.length], s = FM.kinds[kind].size;
+    const box = [x - (s >> 1), y - s, x - (s >> 1) + s - 1, y - 1];
+    const plain = (tx, ty) => PLAIN[tiles[(ty - y0) * CHUNK + tx - x0]] && !inFlat(tx, ty);
+    for (let ty = box[1]; ty <= box[3]; ty++) for (let tx = box[0]; tx <= box[2]; tx++) if (!plain(tx, ty)) return null;
+    const on = p => inBox(box, p.x, p.y) || (p.x === x && p.y === y);
+    if (!plain(x, y) || finds.some(on) || caves.some(on) || areas.some(a => touch(a, grow(box, 1)))) return null;
+    const sites = unit(hash(seed, cx, cy, 1202)) < FM.science ? [site(seed, 0, x, y, 'science', kind)] : [];
+    return deepFreeze({ id: 'F' + cx + ',' + cy, kind, x, y, region, box, sites });
+  }
+  function placeProps(seed, cx, cy, tiles, regions, formation) {
+    const out = [];
+    for (let i = 0; i < D.DECOR.props; i++) {
+      const h = hash(seed, cx, cy, 1210 + i), lx = h % CHUNK, ly = (h >>> 8) % CHUNK, n = ly * CHUNK + lx;
+      const x = cx * CHUNK + lx, y = cy * CHUNK + ly;
+      if (!DECOR_GROUND[tiles[n]] || (formation && inBox(formation.box, x, y))) continue;
+      const kinds = D.DECOR.kinds[REGIONS[nibble(regions, n)]];
+      out.push({ x, y, kind: kinds[(h >>> 16) % kinds.length] });
+    }
+    return out;
   }
 
   // ---------- chunks ----------
@@ -550,7 +662,17 @@
   // so its lists are frozen: a reader can't change them for everyone. Typed arrays can't be frozen; tiles and regions are
   // read-only by agreement.
   const frozen = list => { for (const o of list) Object.freeze(o); return Object.freeze(list); };
-  function chunk(seed, cx, cy) {
+  function terrain(seed, cx, cy) {
+    const k = seed + ':' + cx + ':' + cy;
+    let t = terrainMemo.get(k);
+    if (!t) {
+      t = buildTerrain(seed, cx, cy);
+      if (terrainMemo.size >= 64) terrainMemo.clear();
+      terrainMemo.set(k, t);
+    }
+    return t;
+  }
+  function buildTerrain(seed, cx, cy) {
     const x0 = cx * CHUNK, y0 = cy * CHUNK, w = CHUNK + 2;
     const sites = sitesFor(seed, x0 - 1, y0 - 1, x0 + CHUNK, y0 + CHUNK);
     const feats = featuresNear(seed, x0 - 1, y0 - 1, x0 + CHUNK, y0 + CHUNK);
@@ -576,18 +698,27 @@
       else t = ground(seed, r, x, y);
       tiles[i] = t;
     }
-    const finds = frozen(placeFinds(seed, cx, cy, tiles, regions, feats)), caves = frozen(placeCaves(seed, cx, cy, tiles, regions));
+    return { tiles, regions, feats };
+  }
+  function chunk(seed, cx, cy) {
+    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = x0 + CHUNK - 1, y1 = y0 + CHUNK - 1, t = terrain(seed, cx, cy);
+    const tiles = t.tiles.slice(), regions = t.regions.slice(); // the kept terrain stays as it was
+    const finds = frozen(placeFinds(seed, cx, cy, tiles, regions, t.feats)), caves = frozen(placeCaves(seed, cx, cy, tiles, regions));
     // The points of interest are stamped last, over the finished tiles. The finds and caves were placed from the tiles as
     // they were, so every find id a saved mission holds is unchanged: the ones under a footprint are listed in `hidden`
     // (src/expedition.js leaves them out), never moved. A cave is hidden when its mouth or its wall is under one.
-    const landmarks = Object.freeze(landmarksNear(seed, x0, y0, x0 + CHUNK - 1, y0 + CHUNK - 1));
-    stampLandmarks(seed, tiles, regions, x0, y0, landmarks);
-    const under = (x, y) => landmarks.some(l => inBox(l.box, x, y));
+    const landmarks = Object.freeze(landmarksNear(seed, x0, y0, x1, y1)), structures = Object.freeze(structuresNear(seed, x0, y0, x1, y1));
+    for (const s of structures) stamp(seed, tiles, regions, x0, y0, grow(s.box, 1), (x, y) => structTile(s, x, y));
+    for (const l of landmarks) stamp(seed, tiles, regions, x0, y0, l.box, (x, y) => SHAPES[l.kind].code(seed, l, x, y));
+    const under = (x, y) => landmarks.some(l => inBox(l.box, x, y)) || structures.some(s => inBox(s.box, x, y));
     const hidden = Object.freeze({
       finds: Object.freeze(finds.filter(f => under(f.x, f.y)).map(f => f.n)),
       caves: Object.freeze(caves.filter(k => under(k.x, k.y) || under(k.x, k.y - 1)).map(k => k.n)),
     });
-    return Object.freeze({ cx, cy, tiles, regions, finds, caves, hidden, landmarks });
+    const areas = landmarks.map(l => l.box).concat(structures.map(s => grow(s.box, 1)));
+    const formation = placeFormation(seed, cx, cy, tiles, regions, finds, caves, areas);
+    const formations = Object.freeze(formation ? [formation] : []), props = frozen(placeProps(seed, cx, cy, tiles, regions, formation));
+    return Object.freeze({ cx, cy, tiles, regions, finds, caves, hidden, landmarks, structures, formations, props });
   }
 
   const tileOf = (c, lx, ly) => c.tiles[ly * CHUNK + lx];
@@ -596,5 +727,6 @@
   return {
     CHUNK, TILE, NONE, BLOCKING, SPEED, REGIONS, BASE_RECT, FLAT_RADIUS, DIRS16, RINGS, FIND_KINDS,
     seedOf, hash, unit, noise, regionAt, chunk, tileOf, regionOf, featuresNear, ringOf, landmarkAt: landmark, landmarksNear,
+    structureAt: structure, structuresNear, reachesOut,
   };
 });
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: the Step 2 command, then `npm test`.
Expected: PASS; 393 tests. Finds `0e84f5a1` and caves `c656b50b` unchanged; the world hash re-pinned `59ba57b3` → `3ae4db5e` on purpose.

- [ ] **Step 5: Commit**

```bash
git add src/data.js src/worldgen.js src/expedition.js test/
git commit -m "feat(world): Kestrel structures on flat ground with a reachable door, natural formations and decor" -m "One structure per 64-tile cell at its region's chance, its door reachable within the 96x96 window; formations (scenery, never blocking) and decor props per chunk; expedition reads them and leaves out what lies under a footprint. World hash re-pinned 59ba57b3 -> 3ae4db5e on purpose.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Art — the Kestrel structures, formations and props

**Files:**
- Modify: `src/art.js`
- Create/modify: `test/art.test.js`

**Interfaces:**
- Consumes: the canonical kinds.
- Produces (`SolArt`): `kestrel(id, size, { done, inside })` (a structure before and after use; the pod's roof, or its room with `inside`), `formation(id, size)`, `prop('skylight' | 'vent', size)`, `ventPuff(phase, size)` (a loop: the same drawing every whole turn). Each returns a square SVG string under 3 KB; an unknown id falls back to a known one; only numbers reach the markup.
- A structure is drawn as a square `w` tiles wide on its footprint's bottom edge; the dust-devil tracks lie flat.

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/test/art.test.js b/test/art.test.js
new file mode 100644
index 0000000..4484f1a
--- /dev/null
+++ b/test/art.test.js
@@ -0,0 +1,93 @@
+'use strict';
+// The sprites of the map's points of interest (src/art.js): the Kestrel Survey's structures, the natural formations and the
+// landmark props. The file is a browser script, so it runs in a vm sandbox. What they look like is checked in the browser.
+const test = require('node:test');
+const assert = require('node:assert/strict');
+const fs = require('node:fs');
+const path = require('node:path');
+const vm = require('node:vm');
+
+const sandbox = {};
+vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'art.js'), 'utf8'), sandbox);
+const A = sandbox.SolArt;
+
+const KESTREL = ['cache', 'wreck', 'weather', 'mast', 'pod', 'array'];
+const FORMATIONS = ['arch', 'yardang', 'hoodoo', 'balanced', 'ventifact', 'layered', 'deviltracks'];
+const PROPS = ['skylight', 'vent'];
+
+// One <svg> with a square viewBox and aria-hidden, every attribute quoted, every tag closed in order, no text,
+// nothing like NaN or undefined leaking out of a computed number, and small: under 3 KB.
+function wellFormed(svg, size) {
+  assert.match(svg, new RegExp(`^<svg width="${size}" height="${size}" viewBox="0 0 (\\d+) \\1" aria-hidden="true">`));
+  assert.ok(svg.endsWith('</svg>'));
+  assert.doesNotMatch(svg, /NaN|undefined|null|Infinity|\[object/);
+  const open = [];
+  for (const [tag, close, name, attrs, self] of svg.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
+    assert.match(attrs, /^(\s+[a-zA-Z:-]+="[^"<>]*")*\s*$/, 'the attributes of ' + tag);
+    if (close) assert.equal(open.pop(), name, 'closes ' + name);
+    else if (!self) open.push(name);
+  }
+  assert.deepEqual(open, [], 'every tag is closed');
+  assert.equal(svg.replace(/<[^>]*>/g, '').trim(), '', 'no text');
+  assert.ok(svg.length < 3072, `${svg.length} characters: under 3 KB`);
+}
+const distinct = list => new Set(list).size === list.length;
+
+test('every Kestrel structure in both states, and both layers of the hab pod, is a well-formed square SVG under 3 KB', () => {
+  for (const id of KESTREL) for (const done of [false, true]) wellFormed(A.kestrel(id, 128, { done }), 128);
+  for (const inside of [false, true]) wellFormed(A.kestrel('pod', 96, { inside }), 96);
+});
+
+test('each state has its own look: used or repaired differs from before, and the pod\'s floor differs from its roof', () => {
+  for (const id of KESTREL.filter(k => k !== 'pod')) assert.notEqual(A.kestrel(id, 64, { done: true }), A.kestrel(id, 64), id);
+  assert.notEqual(A.kestrel('pod', 64, { inside: true }), A.kestrel('pod', 64));
+});
+
+test('every formation and prop is a well-formed square SVG under 3 KB, and so is the vent\'s puff at any phase', () => {
+  for (const id of FORMATIONS) wellFormed(A.formation(id, 128), 128);
+  for (const id of PROPS) wellFormed(A.prop(id, 192), 192);
+  for (const phase of [0, 0.25, 0.5, 1, -3, 7, NaN, undefined]) wellFormed(A.ventPuff(phase, 64), 64);
+});
+
+test('the dust-devil tracks lie flat on the ground, and each track ends inside its square, so none is cut off at the edge', () => {
+  const svg = A.formation('deviltracks', 64);
+  assert.doesNotMatch(svg, /<ellipse/, 'no drop shadow: nothing stands up');
+  const tracks = [...svg.matchAll(/<path d="([^"]*)" stroke-width="([\d.]+)"\/>/g)];
+  assert.ok(tracks.length > 0 && tracks.length === svg.split('<path').length - 1, 'every path is a track with its own width');
+  for (const [, d, width] of tracks) {
+    // only absolute moves and curves, so every number is a point the track runs through or bends towards, and the track
+    // stays among them: points half its width and a pixel from the edge keep the whole track inside
+    assert.match(d, /^M[\d. ]+(C[\d. ]+)+$/, d);
+    const m = Number(width) / 2 + 1;
+    for (const n of d.match(/[\d.]+/g).map(Number)) assert.ok(n >= m && n <= 64 - m, `${d}: ${n} is within ${m} of the edge`);
+  }
+});
+
+test('the vent\'s puff moves with the phase and comes back to the same drawing every whole turn, so its loop never jumps', () => {
+  assert.notEqual(A.ventPuff(0.2, 64), A.ventPuff(0.7, 64));
+  assert.equal(A.ventPuff(1, 64), A.ventPuff(0, 64));
+  assert.equal(A.ventPuff(2.25, 64), A.ventPuff(0.25, 64));
+  assert.equal(A.ventPuff(-0.25, 64), A.ventPuff(0.75, 64), 'a phase below 0 counts back from the end of the turn');
+  // a wisp is born and dies unseen, so just before a turn ends you see what phase 0 shows
+  const seen = svg => svg.match(/<circle[^>]*opacity="0\.(0[1-9]|[1-9]\d)"\/>/g);
+  assert.deepEqual(seen(A.ventPuff(0.99999, 64)), seen(A.ventPuff(0, 64)), 'the wisps you see just before a whole turn');
+});
+
+test('every id has a drawing of its own, and an unknown id falls back to a known one, as moduleInner does', () => {
+  assert.ok(distinct(KESTREL.map(id => A.kestrel(id, 64))), 'structures');
+  assert.ok(distinct(FORMATIONS.map(id => A.formation(id, 64))), 'formations');
+  assert.ok(distinct(PROPS.map(id => A.prop(id, 64))), 'props');
+  for (const id of ['<b>nope</b>', 'constructor', '__proto__']) {
+    assert.equal(A.kestrel(id, 64), A.kestrel('cache', 64), id);
+    assert.equal(A.formation(id, 64), A.formation('ventifact', 64), id);
+    assert.equal(A.prop(id, 64), A.prop('vent', 64), id);
+  }
+});
+
+test('only numbers reach the markup: a size that is not a number gives the default size', () => {
+  for (const svg of [A.kestrel('cache', '"><script>x</script>'), A.kestrel('pod', {}, { inside: true }), A.formation('arch', '"/>'),
+    A.prop('vent', {}), A.ventPuff(0.5, 'x')]) {
+    assert.doesNotMatch(svg, /script/);
+    wellFormed(svg, 64);
+  }
+});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/art.test.js`
Expected: 7 of 7 fail (`kestrel`, `formation`, `prop` and `ventPuff` don't exist yet).

- [ ] **Step 3: Draw them**

```diff
diff --git a/src/art.js b/src/art.js
index 20d3e25..96a0a49 100644
--- a/src/art.js
+++ b/src/art.js
@@ -1,5 +1,5 @@
 /*
- * SOL 500 — hand-built SVG art: UI icons, outpost structures, crew portraits and the dusk landscape.
+ * SOL 500 — hand-built SVG art: UI icons, outpost structures, points of interest, crew portraits and the dusk landscape.
  * Every function returns an SVG string built only from constants (never from player text).
  */
 (function (root) {
@@ -166,6 +166,155 @@
     return `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
   }
 
+  // ---------- points of interest on the map (64×64, 3/4 view and light from the upper left, as the modules) ----------
+  // Each fills a square as wide as its footprint, with its bottom edge on the footprint's: a footprint wider than deep (the
+  // 3×2 wreck, the 4×2 array) leaves the top of the square to what stands up, as with the modules. A size that is not a
+  // positive number gives 64 px; an unknown id gives a known drawing.
+  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
+  const svg64 = (size, inner) => {
+    const s = Number.isFinite(size) && size > 0 ? size : 64;
+    return `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
+  };
+
+  // The Kestrel Survey (spec §3.7): robotic hardware older than the outpost, so its paint is faded and dust lies on its
+  // tops and feet. One teal accent marks the programme; a repaired machine's beacon is lit. Paint: hull, its lit top, its
+  // shade, dark.
+  const KH = '#c3b7a7', KT = '#d8cdbe', KS = '#968a7c', KD = '#3d3537', TEAL = '#4a978e', LIT = '#a9f4e4', DUST = '#a96f48', STRUT = '#7a736d';
+  const dust = (d, op) => `<path d="${d}" fill="${DUST}" opacity="${op || 0.45}"/>`;
+  const beacon = (x, y, on) => (on ? `<circle cx="${x}" cy="${y}" r="6" fill="${LIT}" opacity="0.3"/><circle cx="${x}" cy="${y}" r="2.4" fill="${LIT}"/>`
+    : `<circle cx="${x}" cy="${y}" r="2.2" fill="#4d4346"/>`);
+  // the weather station's top, from the break in its mast up: the boom with the wind cups and the vane, and the beacon
+  const weatherTop = on => `<path d="M32 27V12M21 18h22M21 18v-4M17 14h8" stroke="#8f8780" stroke-width="1.6"/><circle cx="17" cy="14" r="1.8" fill="${KH}"/>` +
+    `<circle cx="25" cy="14" r="1.8" fill="${KH}"/><path d="M43 18l5-4v8z" fill="${TEAL}"/>` + beacon(32, 10, on);
+
+  const KESTREL_ART = {
+    // a supply cache on its four landing legs; opened, its lid stands up behind and the box is empty
+    cache: done => shadow(27) +
+      `<path d="M16 46 9 53M48 46l7 7M24 48l-1 6M40 48l1 6" stroke="${STRUT}" stroke-width="2"/><path d="M6 53.5h6M52 53.5h6" stroke="${STRUT}" stroke-width="2.4" stroke-linecap="round"/>` +
+      (done ? `<path d="M15 20l2-14h30l2 14z" fill="#a89c8d"/><path d="M19 9h26" stroke="${TEAL}" stroke-width="2"/>` : '') +
+      `<rect x="12" y="29" width="40" height="20" rx="2" fill="${KH}"/><path d="M32 29v20" stroke="${KS}"/><rect x="12" y="35" width="40" height="3.5" fill="${TEAL}"/>` + dust('M12 43h40v6H12z') +
+      (done ? `<path d="M15 20h34l3 9H12z" fill="${KD}"/><path d="M15 20h34l1 3H14z" fill="#62575a"/><path d="M15 20h34" stroke="${KS}" stroke-width="1.5"/>`
+        : `<path d="M15 20h34l3 9H12z" fill="${KT}"/><path d="M20 27v4M44 27v4" stroke="${KD}" stroke-width="3"/>` + dust('M17 22h18l-1 4H16z', 0.35)),
+    // a six-wheeled scout rover that crashed nose down; salvaged, only its stripped frame is left
+    wreck: done => (done
+      ? shadow(25) + `<g transform="rotate(-8 32 44)"><rect x="10" y="35" width="42" height="11" rx="2" fill="#a39a90"/><path d="M13 38h9v5h-9zM26 38h10v5H26zM40 38h9v5h-9z" fill="${KD}"/>` +
+        `<path d="M13 29h36l3 6H10z" fill="${KD}"/><path d="M18 29l-1 6M26 29v6M34 29v6M42 29l1 6" stroke="#a39a90" stroke-width="1.5"/><path d="M17 29v-4" stroke="#9a938c" stroke-width="2"/>` +
+        `<rect x="10" y="44" width="14" height="1.5" fill="${TEAL}" opacity="0.7"/><path d="M16 46v3M30 46v3M45 46v3" stroke="${STRUT}" stroke-width="2"/></g>`
+      : shadow(28) + dust('M5 53q8-7 20-3l1 3z', 0.55) + `<g transform="rotate(-8 32 44)"><rect x="10" y="30" width="42" height="12" rx="2.5" fill="${KH}"/>` +
+        `<path d="M13 24h36l3 6H10z" fill="#55627a"/>` + dust('M13 24h36l3 6H10z', 0.5) + `<rect x="10" y="35" width="42" height="2.5" fill="${TEAL}"/>` +
+        `<path d="M16 45l7-4 7 5" stroke="${STRUT}" stroke-width="1.8" fill="none"/><g fill="${KD}" stroke="${STRUT}" stroke-width="1.5"><circle cx="16" cy="45" r="5"/><circle cx="30" cy="46" r="5"/></g>` +
+        `<path d="M46 42l2 5" stroke="${STRUT}" stroke-width="2"/><path d="M17 24v-8l7-3" stroke="#9a938c" stroke-width="2" fill="none"/><rect x="22" y="10" width="8" height="5" rx="1" fill="${STRUT}"/></g>` +
+        `<ellipse cx="54" cy="51" rx="5" ry="3" fill="${KD}" stroke="${STRUT}" stroke-width="1.4"/>`),
+    // a weather station: a box on a tripod with its own small panel; broken, the mast is snapped and its top leans over, a cup
+    // in the dust; repaired, it stands straight, the panel is clean and the beacon is lit
+    weather: done => shadow(22) +
+      `<path d="M32 40 20 54M32 40l12 14" stroke="${STRUT}" stroke-width="2"/><path d="M15 51v-6" stroke="${STRUT}" stroke-width="1.6"/><path d="M8 45l4-7h10l-4 7z" fill="${done ? PANEL : '#4c5b76'}"/>` +
+      (done ? `<path d="M10 41.5h10M15 38l-2 7" stroke="${GRID}" stroke-width="0.7" opacity="0.7"/>` : dust('M8 45l4-7h10l-4 7z', 0.6)) +
+      `<path d="M32 40V27" stroke="#8f8780" stroke-width="1.6"/><rect x="24" y="41" width="16" height="10" rx="1.5" fill="${KH}"/><path d="M25 38h14l1 3H24z" fill="${KT}"/><rect x="24" y="45" width="16" height="2.5" fill="${TEAL}"/>` +
+      (done ? weatherTop(true) : `<g transform="rotate(35 32 27)">${weatherTop(false)}</g><circle cx="50" cy="52" r="1.8" fill="${KH}"/>`),
+    // a lattice comms mast; broken, a guy wire hangs and the dish droops; repaired, the dish looks up and the beacon is lit
+    mast: done => shadow(19) +
+      `<path d="M31 16 9 53${done ? 'M33 16l22 37' : 'M33 16q7 14 4 24'}" stroke="#9b938c" stroke-width="0.8" opacity="0.8" fill="none"/>` +
+      `<path d="M21 50h22l3 4H18z" fill="${STRUT}"/><path d="M26 51 30.5 13M38 51 33.5 13" stroke="#857d76" stroke-width="2"/><path d="M26.6 46l10.6-6-9.9-5 9.3-6-8.7-5 8.1-6" stroke="#857d76" stroke-width="1.1" fill="none"/>` +
+      `<rect x="26" y="42" width="12" height="8" rx="1" fill="${KH}"/><rect x="26" y="45" width="12" height="2.5" fill="${TEAL}"/><path d="M34 24h5" stroke="#857d76" stroke-width="1.6"/>` +
+      (done ? `<ellipse cx="43" cy="20" rx="8" ry="3.6" transform="rotate(-40 43 20)" fill="${KH}"/><path d="M43 20l4-5" stroke="${KS}" stroke-width="1.2"/><path d="M50 9a7 7 0 0 1 5 5M52 5a11 11 0 0 1 7 8" stroke="${LIT}" stroke-width="1.2" fill="none" opacity="0.7"/>`
+        : `<ellipse cx="41" cy="30" rx="8" ry="3.6" transform="rotate(70 41 30)" fill="${KS}"/><ellipse cx="41.6" cy="30" rx="6" ry="2.4" transform="rotate(70 41.6 30)" fill="#7d7268"/>`) +
+      beacon(32, 11, done),
+    // an abandoned hab pod: its roof from outside; inside (the roof hidden), its room. Drawn for a 5×5 footprint: a ring of
+    // wall one tile thick, a 3×3 room, and the door in the middle of the south wall
+    pod: (done, inside) => `<ellipse cx="32" cy="58" rx="31" ry="5" fill="#000" opacity="0.32"/>` +
+      `<rect x="2" y="44" width="60" height="15" rx="4" fill="${KS}"/><rect x="2" y="49" width="60" height="2.5" fill="${TEAL}"/><rect x="26" y="45" width="12" height="14" rx="1.5" fill="${KD}"/>` +
+      `<circle cx="13" cy="54.5" r="2.2" fill="${WIN}" stroke="${KH}"/><circle cx="51" cy="54.5" r="2.2" fill="${WIN}" stroke="${KH}"/>` +
+      (inside
+        ? `<rect x="2" y="3" width="60" height="45" rx="9" fill="#b9ad9d"/><rect x="13" y="13" width="38" height="33" fill="#6d625c"/><rect x="13" y="13" width="38" height="5" fill="#4f4542"/>` +
+          `<path d="M13 31h38M26 18v28M38 18v28" stroke="#5c524d" stroke-width="0.8"/><rect x="14" y="21" width="9" height="18" rx="1.5" fill="#8c8076"/><rect x="15" y="22" width="7" height="5" rx="1" fill="#c9bfb3"/>` +
+          `<rect x="27" y="13" width="12" height="7" rx="1" fill="#3a3436"/><rect x="29" y="14.5" width="8" height="3" fill="${LIT}" opacity="0.65"/>` +
+          `<rect x="44" y="20" width="6" height="12" rx="3" fill="#86b8ea"/><circle cx="47" cy="34" r="1.3" fill="${LIT}"/><rect x="42" y="37" width="8" height="8" rx="1" fill="${KS}"/>` + dust('M26 46q6-5 12 0z', 0.5)
+        : `<rect x="2" y="3" width="60" height="45" rx="9" fill="#c9bdad"/><rect x="2" y="12" width="60" height="13" fill="${KT}"/><rect x="2" y="33" width="60" height="6" fill="#b4a898"/>` +
+          `<path d="M14 4v43M26 3v45M38 3v45M50 4v43" stroke="${KS}" stroke-width="0.8" opacity="0.7"/><rect x="40" y="14" width="12" height="8" rx="2" fill="${KS}"/><rect x="42" y="16" width="8" height="4" rx="1" fill="#837768"/>` +
+          dust('M6 22q7-4 14-1t12 0v3H6z', 0.3) + dust('M36 36q8-3 16 0v3H36z', 0.3) + `<path d="M10 12V2" stroke="${STRUT}" stroke-width="1.4"/>` + beacon(10, 2, false)),
+    // a dusty solar array of three panels; salvaged, two panels are gone and the one left is wiped clean
+    array: done => shadow(28) + [0, 1, 2].map(i => {
+      const x = 6 + i * 18, gone = done && i > 0;
+      const panel = `M${x} 44l5-13h14l-5 13z`;
+      return `<path d="M${x + 4} 44v7M${x + 12} 44v6" stroke="${STRUT}" stroke-width="1.6"/>` +
+        (gone ? `<path d="${panel}" fill="none" stroke="${STRUT}" stroke-width="1.4"/>`
+          : `<path d="${panel}" fill="${PANEL}"/><path d="M${x + 3} 37.5h14M${x + 9} 31l-5 13" stroke="${GRID}" stroke-width="0.8" opacity="0.7"/>` + (done ? '' : dust(panel, 0.75)));
+    }).join('') + `<rect x="52" y="47" width="7" height="6" rx="1" fill="${TEAL}"/>`,
+  };
+
+  // Natural formations (spec §3.7), real geology in regolith tones: lit top, face, shade and deep shade.
+  const R0 = '#c4916a', R1 = '#a06a4b', R2 = '#7a4a34', R3 = '#4f2f23';
+  const FORMATION_ART = {
+    // a thin span over a wide opening, the ground showing through it
+    arch: shadow(28) + `<path d="M4 54 5 44 3 36l4-8 3-6 6-6 8-3 10-1 10 1 8 4 4 5 1 8-2 8 3 8-1 8zM19 54l-1-10 2-10 4-8 8-5 8 1 5 6 2 10-1 8 1 8z" fill="${R1}" fill-rule="evenodd"/>` +
+      `<path d="M10 22l6-6 8-3 10-1 10 1 8 4 4 5-6-1-8-3-9-1-9 1-8 2z" fill="${R0}"/><path d="M52 17l4 5 1 8-2 8 3 8-1 8h-5l1-8-2-8 1-8-1-8z" fill="${R2}"/>` +
+      `<path d="M19 54l-1-10 2-10 4-8 8-5-2 4-5 5-2 8-1 8 1 8z" fill="${R3}"/><path d="M5 44h12M48 44h8M7 32h11M49 30h7" stroke="${R3}" stroke-width="0.8" opacity="0.5"/>`,
+    // three wind-carved ridges in a row: a blunt head into the wind (from the left), a long tail, grooves along the flanks
+    yardang: [[14, 30, 43, 6, 9], [6, 43, 54, 9, 12], [20, 54, 32, 5, 7]].map(([x, y, l, d, h]) =>
+      `<ellipse cx="${x + l / 2}" cy="${y + 0.5}" rx="${l / 2 + 1}" ry="2" fill="#000" opacity="0.3"/><path d="M${x} ${y}c0-${h - 4} 2-${h - 1} ${d}-${h}l${l - d} ${h - 2}v2z" fill="${R1}"/>` +
+      `<path d="M${x} ${y}c0-${h - 4} 2-${h - 1} ${d}-${h}l${l - d} ${h - 2}-${l - d - 1}-${h - 5}c-3 0-${d - 1} 2-${d} ${h - 5}z" fill="${R0}"/><path d="M${x + d + 2} ${y - 3}l${l - d - 6} 2" stroke="${R2}" stroke-width="0.8" opacity="0.7"/>`).join(''),
+    hoodoo: shadow(22) +
+      `<path d="M21 54c1-9-2-15 0-23s-1-11 1-17h8c2 6-1 10 0 17s-1 14 1 23z" fill="${R1}"/><path d="M26 14h4c2 6-1 10 0 17s-1 14 1 23h-5z" fill="${R2}"/><ellipse cx="26" cy="14" rx="7.5" ry="3.4" fill="${R3}"/><ellipse cx="25.5" cy="12.8" rx="6.5" ry="2.3" fill="${R0}"/>` +
+      `<path d="M38 54c1-7-1-11 0-17s-1-8 0-11h7c1 3-1 6 0 11s-1 10 1 17z" fill="${R1}"/><path d="M42 26h3c1 3-1 6 0 11s-1 10 1 17h-4z" fill="${R2}"/><ellipse cx="41.5" cy="26" rx="6" ry="2.8" fill="${R3}"/><ellipse cx="41" cy="25" rx="5" ry="1.9" fill="${R0}"/>` +
+      `<path d="M10 54c1-6-1-9 0-13s0-5 1-7h5c1 2-1 4 0 7s0 7 1 13z" fill="${R1}"/><ellipse cx="13.5" cy="34" rx="4.8" ry="2.2" fill="${R3}"/><ellipse cx="13.2" cy="33.2" rx="4" ry="1.5" fill="${R0}"/>` +
+      `<path d="M21 30h10M21 42h11M38 38h8M10 44h7" stroke="${R0}" stroke-width="1.2" opacity="0.6"/>`,
+    // the oblong boulder of its fact: it tumbled down a slope, leaving a trail of dents behind it, and came to rest standing
+    // on end, nearly twice as tall as it is wide
+    balanced: shadow(16) +
+      `<ellipse cx="18" cy="46" rx="2.6" ry="1.2" fill="${R3}" opacity="0.5"/><ellipse cx="12" cy="40" rx="2.2" ry="1" fill="${R3}" opacity="0.4"/><ellipse cx="7" cy="34.5" rx="1.8" ry="0.8" fill="${R3}" opacity="0.3"/>` +
+      `<path d="M24 54 22 41 24 27 29 19 36 16 42 21 44 34 43 46 41 54z" fill="${R1}"/><path d="M24 54 22 41 24 27 29 19 36 16 32 22 28 34 27 54z" fill="${R0}"/>` +
+      `<path d="M42 21 44 34 43 46 41 54H36L38 40 39 27z" fill="${R2}"/><path d="M30 28l3 4M33 45l2-5" stroke="${R2}" stroke-width="0.9" opacity="0.7"/><ellipse cx="47" cy="53" rx="3" ry="1.7" fill="${R2}"/>`,
+    ventifact: shadow(24) + `<path d="M10 51 14 35l12-8 14 1 10 10 2 13z" fill="#4a4140"/><path d="M14 35l12-8 6 7-12 7z" fill="#7d716c"/><path d="M26 27l14 1 10 10-18-4z" fill="#605654"/>` +
+      `<path d="M40 28l10 10 2 13-12-4z" fill="#2f2928"/><path d="M16 41l8-5M17 45l9-6M19 49l8-5" stroke="#2a2423" stroke-width="0.9"/>` +
+      `<path d="M41 55l3-8 8-2 6 5-1 5z" fill="#4a4140"/><path d="M44 47l8-2 2 4-9 1z" fill="#7d716c"/><path d="M15 36l10-7" stroke="#b3a59d" stroke-width="0.8" opacity="0.7"/>`,
+    // an outcrop of soft and hard layers: a steep face on the left, ledges stepping down to the right, a ragged cap
+    layered: shadow(30) + [[3, 61, 46, 8, '#a2603f'], [4, 57, 39, 7, '#c99f78'], [6, 52, 32, 7, R1], [8, 46, 26, 6, '#cfa883']].map(([a, b, y, h, c]) =>
+      `<path d="M${a} ${y + h}l1-${h}h${b - a - 3}l2 ${h}z" fill="${c}"/><path d="M${a + 1} ${y + 0.6}h${b - a - 3}" stroke="#fff" stroke-width="1.2" opacity="0.2"/><path d="M${b - 7} ${y}h5l2 ${h}h-7z" fill="#000" opacity="0.18"/>`).join('') +
+      `<path d="M9 26l1-5 4-1 3-2 8-1 3 2h7l4 2 3 2 1 3z" fill="${R2}"/><path d="M9 26l1-5 4-1 3-2 8-1v9z" fill="${R1}"/>` +
+      `<path d="M34 39v-7M44 54v-8" stroke="${R3}" stroke-width="0.9" opacity="0.4"/><path d="M52 54l2-3h4l2 3zM6 54l2-2h3l1 2z" fill="${R2}"/>`,
+    // dust-devil tracks: dark lanes where the devils scoured off the bright dust, each as wide all along as the devil that
+    // made it, crossing one another; flat on the ground, and each ends inside the square, so no track is cut off at its edge
+    deviltracks: `<g fill="none" stroke="#1d110d" stroke-linecap="round" opacity="0.26"><path d="M6 49C17 45 27 38 35 32C43 26 50 21 58 17" stroke-width="4"/>` +
+      `<path d="M5 31C14 29 22 24 30 22C38 20 45 15 51 8" stroke-width="2.4"/><path d="M11 12C20 21 27 31 35 40C42 48 49 53 55 58" stroke-width="1.6"/>` +
+      `<path d="M31 58C39 55 47 50 58 45" stroke-width="3"/></g>`,
+  };
+
+  // Landmark props (spec §3.6): the skylight into a lava tube, and the methane vent (its puffs: ventPuff).
+  const PROP_ART = {
+    // a collapse pit with no rim: cracks round it, the far wall lit inside, black below, a slope of rubble going in at the front
+    skylight: `<ellipse cx="32" cy="34" rx="28" ry="18" fill="#000" opacity="0.12"/><path d="M5 30l7 2M59 38l-7-2M18 52l4-4M47 15l-3 4M8 42l6-2" stroke="#1a0f0c" stroke-width="1" opacity="0.45"/>` +
+      `<ellipse cx="32" cy="34" rx="22" ry="14" fill="#0b0607"/><path d="M10 34a22 14 0 0 1 44 0c-5-5-13-8-22-8s-17 3-22 8z" fill="#4a2a1f"/><path d="M10 34a22 14 0 0 1 44 0c-4-6-12-11-22-11s-18 5-22 11z" fill="#7a4632"/>` +
+      `<path d="M10 34a22 14 0 0 0 44 0" stroke="#b07a58" stroke-width="1.2" fill="none" opacity="0.5"/><path d="M25 48l3-6 4-3 4 3 3 6z" fill="#4e2c21"/><path d="M27 46h2M33 44h2M30 41h2" stroke="#8a5538" stroke-width="1.6"/>` +
+      `<ellipse cx="9" cy="24" rx="3.5" ry="2.2" fill="${R2}"/><ellipse cx="55" cy="47" rx="3" ry="1.9" fill="${R2}"/><ellipse cx="47" cy="12" rx="2.4" ry="1.5" fill="${R2}"/>`,
+    // a low mound split by a fissure, its lips crusted pale, in a faint pale halo
+    vent: `<ellipse cx="32" cy="42" rx="27" ry="12" fill="#e3d3ab" opacity="0.14"/><path d="M8 46c4-6 14-10 24-10s20 4 24 10c-6 3-14 4-24 4S14 49 8 46z" fill="#8a5a40"/>` +
+      `<path d="M10 45c5-5 13-8 22-8s17 3 22 8c-8-3-14-4-22-4s-15 1-22 4z" fill="#a87250"/><path d="M18 43l6-2 4 1 5-2 4 1 6-2 5 1" stroke="#1a0f0c" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` +
+      `<path d="M19 41.4l5-2 4 1 5-2 4 1 6-2" stroke="#efe4c4" stroke-width="1" fill="none" opacity="0.7"/><path d="M13 47l5-2M46 45l5 2" stroke="#1a0f0c" stroke-width="1" opacity="0.6"/>` +
+      `<ellipse cx="22" cy="46.5" rx="3" ry="1.1" fill="#efe4c4" opacity="0.45"/><ellipse cx="42" cy="46" rx="2.5" ry="1" fill="#efe4c4" opacity="0.45"/><ellipse cx="11" cy="50" rx="2.6" ry="1.6" fill="${R2}"/><ellipse cx="53" cy="49" rx="2.2" ry="1.4" fill="${R2}"/>`,
+  };
+
+  // opts: { done } opened, salvaged or repaired; { inside } the hab pod's room, drawn while you are in it (its roof hidden).
+  function kestrel(id, size, opts) {
+    const o = opts || {};
+    return svg64(size, KESTREL_ART[own(KESTREL_ART, id) ? id : 'cache'](!!o.done, !!o.inside));
+  }
+  function formation(id, size) { return svg64(size, FORMATION_ART[own(FORMATION_ART, id) ? id : 'ventifact']); }
+  function prop(id, size) { return svg64(size, PROP_ART[own(PROP_ART, id) ? id : 'vent']); }
+
+  // The methane vent's puff, drawn over prop('vent') in the same square: three wisps rise from the fissure, grow and fade,
+  // a third of a cycle apart, so phase 1 looks like phase 0 and the loop never jumps. Any phase is safe (not a number: 0).
+  function ventPuff(phase, size) {
+    const p = Number.isFinite(phase) ? phase - Math.floor(phase) : 0;
+    let o = '';
+    for (let i = 0; i < 3; i++) {
+      const q = (p + i / 3) % 1, x = 33 + q * 10, y = 40 - q * 30, r = 2.5 + q * 8, a = (q * (1 - q) * 1.6).toFixed(2);
+      o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#efe6dc" opacity="${a}"/>` +
+        `<circle cx="${(x - r * 0.6).toFixed(1)}" cy="${(y + r * 0.4).toFixed(1)}" r="${(r * 0.7).toFixed(1)}" fill="#efe6dc" opacity="${a}"/>`;
+    }
+    return svg64(size, o);
+  }
+
   // ---------- crew portraits (64×64) ----------
   let uid = 0;
   const GLYPH = {
@@ -230,5 +379,5 @@
       `</svg>`;
   }
 
-  root.SolArt = { icon, module, moduleInner, itemArt, portrait, landscape, ROLE };
+  root.SolArt = { icon, module, moduleInner, itemArt, portrait, landscape, ROLE, kestrel, formation, prop, ventPuff };
 })(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/art.test.js`, then `npm test`.
Expected: PASS; 400 tests.

- [ ] **Step 5: Commit**

```bash
git add src/art.js test/art.test.js
git commit -m "feat(art): sprites for the Kestrel structures, the natural formations and the landmark props" -m "Each structure before and after use and the hab pod's roof and room; formations readable at 2x2 and 3x3; the skylight, the methane vent and its looping puff. One teal accent marks Kestrel hardware.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The rules — new cover, sites, discovery, structures, pod refills, the view, old saves

**Files:**
- Modify: `src/dangers.js`, `src/data.js`, `src/engine.js`, `src/expedition.js`
- Modify: `test/dangers.test.js`, `test/engine.test.js`, `test/expedition.test.js`

**Interfaces:**
- Consumes: Task 1's `Z.coversIn`/`Z.act`; Tasks 2–3's read helpers and ids.
- Produces:
  - `Z.coversIn` also lists hab pods (ring at the door, inside = footprint + slack) and lava tubes (ring at the skylight, inside = a `TUBE_FLOOR`/`SKYLIGHT` tile within the slack), once each by id; a hidden cave is no cover.
  - `Z.viewAt(m, inRover, tile)`: the weather's view, the headlamp's 8 (10 in the rover) in a tube in any weather, +4 on a `CREST` (`D.DANGERS.view.crest`).
  - `Z.act` gains `discover { landmark }`, `interact { structure }`, `refill { pod }`; `collect { find }` also takes `L<i>,<j>:<n>` and `F<cx>,<cy>:0`.
  - `X.collect(m, crewId, siteId, pos)` on landmark and formation sites (loads left kept under the site's id in `x.sites`).
  - `X.discover(m, crewId, landmarkId, pos)` → `{ ok, landmark, science }`; errors `noLandmark`, `known`, `tooFar`. Sets `x.landmarks[id] = { by, round }`, banks a `landmark` line.
  - `X.interact(m, crewId, structId, pos)` → `{ ok, done: 'used' | 'repaired', items, left, fog }`; errors `noStructure`, `badKind` (a pod), `done`, `tooFar`. Banks `weather` lines; sets `x.forecastUntil` (Ruling 1).
  - `X.refill(m, crewId, podId, pos)` → `{ ok, suit }`; errors `noStructure`, `badKind`, `refilled`, `tooFar`.
  - `X.holdSeconds(kind, role)` for `cache wreck weather mast array`; `X.forecastAhead(m)` → next round's weather or `null`; `X.mastMarks(m)` → `[{ id, x, y, kind }]` (tiles).
  - `x.stats[crewId].landmarks/structures` counted; `E.newExpedition()` has `forecastUntil: -1`, and the save repair adds it.

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/test/dangers.test.js b/test/dangers.test.js
index 4c9cf63..4d8a8ec 100644
--- a/test/dangers.test.js
+++ b/test/dangers.test.js
@@ -42,6 +42,24 @@ test('you see 8 tiles around you in clear weather (10 in the rover), 5 in a regi
   assert.equal(Z.viewTiles(null, false), 8, 'no mission: clear');
 });
 
+test("the view from the tile under you: in a lava tube the headlamp's reach ignores the weather; on a star dune's crest you see 4 tiles further", () => {
+  const m = solo(), K = W.TILE;
+  for (const [weather, foot, rover] of [['clear', 8, 10], ['regional', 5, 5], ['global', 3, 3]]) {
+    m.schedule[m.turn].weather = weather;
+    for (const tile of [K.TUBE_FLOOR, K.SKYLIGHT]) {
+      assert.equal(Z.viewAt(m, false, tile), 8, weather + ': the headlamp in a tube');
+      assert.equal(Z.viewAt(m, true, tile), 10, weather + ': the rover in a tube');
+    }
+    assert.equal(Z.viewAt(m, false, K.CREST), foot + 4, weather + ': on a crest');
+    assert.equal(Z.viewAt(m, true, K.CREST), rover + 4, weather + ': the rover on a crest');
+    for (const tile of [K.REGOLITH, K.DUNE, K.TUBE_WALL, undefined]) {
+      assert.equal(Z.viewAt(m, false, tile), foot, weather + ', tile ' + tile);
+      assert.equal(Z.viewAt(m, true, tile), rover, weather + ', tile ' + tile + ', the rover');
+    }
+  }
+  assert.equal(Z.viewAt(null, false, K.CREST), 12, 'no mission: clear');
+});
+
 test('what waits outside this round, in the order the brief and the Expedition panel say it: a solar flare, dust devils, a dust storm, an O₂ leak', () => {
   const quiet = { spe: false, devil: false, weather: 'clear' };
   assert.deepEqual(Z.outside(solo('DNG-OUT', quiet)), [], 'a quiet round');
@@ -103,7 +121,8 @@ test('one lister for the cover in a box: every cave whose mouth has its middle i
   const inBox = (x0, y0, x1, y1) => all.filter(c => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1);
   const boxes = [[-128, -128, 128, 128], [-40.25, -40.75, 40.25, 39.5]];
   for (const c of near) boxes.push([c.x, c.y, c.x + 40, c.y + 40], [c.x - 40, c.y - 40, c.x, c.y]); // each cave on two boxes' edges
-  for (const box of boxes) assert.deepEqual(byPlace(Z.coversIn(m, ...box)), byPlace(inBox(...box)), box.join(', '));
+  const caves = box => Z.coversIn(m, ...box).filter(c => c.kind === 'cave'); // the pods and tubes are their own tests
+  for (const box of boxes) assert.deepEqual(byPlace(caves(box)), byPlace(inBox(...box)), box.join(', '));
   const k = near[0];
   assert.deepEqual(Z.coversIn(m, k.x - 0.4, k.y - 0.4, k.x - 0.1, k.y + 0.4), [], 'a box with no middle of a mouth in it lists none');
 });
@@ -117,7 +136,7 @@ test('the lister has the storm shelter once it is built, at the middle of its ti
   assert.deepEqual(Z.coversIn(m, 3, -1, 6, 1), [{ kind: 'shelter', x: 4.5, y: 0.5 }]);
   assert.deepEqual(Z.coversIn(m, 4.6, -1, 6, 1), [], 'its middle is out of the box');
   const big = Z.coversIn(m, -128, -128, 128, 128);
-  assert.deepEqual(big.map(c => c.kind), ['shelter', ...cavesAround(m, 4).map(() => 'cave')], 'first, then the caves');
+  assert.deepEqual(big.filter(c => c.kind !== 'pod').map(c => c.kind), ['shelter', ...cavesAround(m, 4).map(() => 'cave')], 'first, then the caves (a pod stands in this box too)');
   m.modules.shelter.broken = 1;
   assert.deepEqual(Z.coversIn(m, 3, -1, 6, 1), [], 'one that is broken is no shelter (as in shelterAt; none can break, BREAKDOWN.shelter is 0)');
 });
@@ -147,6 +166,45 @@ test('shelterAt reads the chunks it is given, like the lister; the base zone and
   assert.equal(Z.shelterAt(m, at(4, 0), 0, none), 'shelter');
 });
 
+test('a cave hidden under a landmark is no cover and gets no ring: the lister leaves it out, as the rules do', () => {
+  const m = solo('DNG-1'), c = X.chunkAt(m, 1, -7), k = c.caves[c.hidden.caves[0]]; // under the methane vent's box
+  assert.ok(k, 'a hidden cave');
+  assert.ok(!X.cavesIn(m, 1, -7).includes(k), 'the rules never show it');
+  assert.deepEqual(Z.coversIn(m, k.x, k.y, k.x + 1, k.y + 1).filter(v => v.kind === 'cave'), [], 'no ring at its mouth');
+  assert.equal(Z.shelterAt(m, at(k.x, k.y)), null, 'its mouth is in the open');
+});
+
+test('an abandoned hab pod is cover inside its footprint, widened by the slack, with its ring at its door', () => {
+  const m = solo('DNG-CAVE'), p = X.structureById(m, 'S0,1', at(22, 73));
+  assert.equal(p.kind, 'pod');
+  const [x0, y0, x1, y1] = p.box;
+  assert.deepEqual(Z.coversIn(m, x0 - 9, y0 - 9, x1 + 9, y1 + 9).filter(k => k.kind === 'pod'), [{ kind: 'pod', id: p.id, x: p.x + 0.5, y: p.y + 0.5, box: p.box }], 'its ring at the middle of its door');
+  assert.equal(Z.shelterAt(m, at((x0 + x1) / 2, (y0 + y1) / 2)), 'pod', 'in the middle of its floor');
+  assert.equal(Z.shelterAt(m, at(p.x, p.y)), 'pod', 'in its door');
+  assert.equal(Z.shelterAt(m, at(p.x, y1 + 1)), null, 'a step out of the door is in the open');
+  assert.equal(Z.shelterAt(m, at(p.x, y1 + 1), 1.5), 'pod', 'unless the position was sent a moment ago');
+  assert.equal(Z.shelterAt(m, at(p.x, y1 + 3), 1.5), null, 'three steps out is in the open even then');
+  assert.equal(Z.shelterAt(m, at(x0 - 1, (y0 + y1) / 2)), null, 'beside its wall is in the open');
+});
+
+test('a lava tube is cover on its floor and under its skylight, not on the ground round its wall; listed once, its ring at the skylight', () => {
+  const m = solo('DNG-TUBE'), l = X.landmarkById(m, 'L1,0', at(284, 69));
+  assert.equal(l.kind, 'tube');
+  assert.equal(l.vert, false, 'it runs east–west, so its skylight is in its south wall');
+  const [sx, sy] = l.skylight, b = l.box;
+  assert.notEqual(Math.floor(b[0] / W.CHUNK), Math.floor(b[2] / W.CHUNK), 'its box spans two chunks');
+  assert.deepEqual(Z.coversIn(m, ...b).filter(k => k.kind === 'tube'), [{ kind: 'tube', id: l.id, x: sx + 0.5, y: sy + 0.5, box: b }], 'listed once, by id');
+  assert.equal(Z.shelterAt(m, at(l.x, l.y)), 'tube', 'on its floor');
+  assert.equal(Z.shelterAt(m, at(b[0] + 2, l.y)), 'tube', 'at its west end');
+  assert.equal(Z.shelterAt(m, at(sx, sy)), 'tube', 'under its skylight');
+  assert.equal(Z.shelterAt(m, at(b[0], b[1])), null, 'the corner of its box is plain ground');
+  assert.equal(Z.shelterAt(m, at(sx, sy + 1)), null, 'a step out of the skylight is in the open');
+  assert.equal(Z.shelterAt(m, at(sx, sy + 1), 1.5), 'tube', 'unless the position was sent a moment ago');
+  assert.equal(Z.shelterAt(m, at(b[0], l.y)), null, 'nor is the ground beyond its west wall');
+  assert.equal(Z.shelterAt(m, at(b[0], l.y), 1.5), 'tube', 'unless the position was sent a moment ago, 2 tiles from its floor');
+  assert.equal(Z.shelterAt(m, at(l.x, l.y), 0, () => null), null, 'a lookup that holds no chunk has no tube');
+});
+
 test("a solar flare comes in a round whose schedule has one: the warning 30 s after the first step outside, the hit 60 s later", () => {
   const quiet = solo();
   assert.equal(Z.flareDue(quiet), false);
diff --git a/test/engine.test.js b/test/engine.test.js
index cba7bcf..2314738 100644
--- a/test/engine.test.js
+++ b/test/engine.test.js
@@ -611,9 +611,10 @@ test("a new mission has an empty exploring state and, in solo play, the player's
   assert.deepEqual(s.expedition.revealed, {});
   assert.deepEqual(s.expedition.regions, []);
   assert.deepEqual(Object.keys(s.expedition).sort(),
-    ['banked', 'beacons', 'benched', 'carried', 'clock', 'collapsed', 'drops', 'flare', 'goals', 'incidents', 'kits', 'landmarks', 'refills',
-      'regions', 'revealed', 'rover', 'roverDriven', 'sites', 'stats', 'structures', 'suits', 'v', 'where']);
+    ['banked', 'beacons', 'benched', 'carried', 'clock', 'collapsed', 'drops', 'flare', 'forecastUntil', 'goals', 'incidents', 'kits', 'landmarks',
+      'refills', 'regions', 'revealed', 'rover', 'roverDriven', 'sites', 'stats', 'structures', 'suits', 'v', 'where']);
   assert.equal(s.expedition.flare, null, 'no solar flare yet');
+  assert.equal(s.expedition.forecastUntil, -1, 'no weather station forecast yet');
   assert.equal(s.expedition.clock, 0, "the round's clock starts at 0");
   assert.deepEqual(s.expedition.where, {});
   assert.equal(calm().pilot, null, 'no pilot unless one is chosen (co-op seats choose their own)');
diff --git a/test/expedition.test.js b/test/expedition.test.js
index ab6c8c1..6af0c95 100644
--- a/test/expedition.test.js
+++ b/test/expedition.test.js
@@ -6,6 +6,7 @@ const E = require('../src/engine.js');
 const D = require('../src/data.js');
 const W = require('../src/worldgen.js');
 const X = require('../src/expedition.js');
+const F = require('../src/fog.js');
 
 const T = 64;
 const KIT = { solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, greenhouse: 1, waterwall: 1, spares: 3, materials: 1, food: 6, o2: 3, water: 3 };
@@ -478,3 +479,332 @@ test('a landmark and a structure are read by id from inside their cell, frozen;
   } finally { W.landmarkAt = real.L; W.structureAt = real.S; }
   assert.equal(looked, 0, 'nothing was looked up for them');
 });
+
+test("a landmark's site is collected like a find: a load by its kind and ring, its loads left kept under its id, the backpack's rules too", () => {
+  const m = solo('EXP-1'), l = X.landmarkById(m, 'L0,-1', at(134, -46)); // a giant crater: floor ice and a peak survey
+  const s = l.sites[0], id = 'L0,-1:0', here = at(s.x, s.y);
+  assert.equal(s.kind, 'ice');
+  const r = X.collect(m, 'minh', id, here);
+  assert.equal(r.ok, true);
+  assert.deepEqual(r.item, { kind: 'ice', id, region: s.region, res: 'water', amount: 40 });
+  assert.equal(r.left, D.FINDS.ice.loads[s.ring] - 1);
+  assert.equal(m.expedition.sites[id], r.left);
+  assert.deepEqual(m.expedition.stats.minh, { finds: { ice: 1 } });
+  assert.equal(X.collect(m, 'minh', id, { x: here.x + 1.6 * T, y: here.y }).error, 'tooFar', '1.5 tiles of slack, no more');
+  X.collect(m, 'minh', id, here);
+  X.collect(m, 'minh', id, here);
+  assert.equal(X.collect(m, 'minh', id, here).error, 'full', 'the backpack holds 3 loads on foot');
+  for (let i = 3; i < D.FINDS.ice.loads[s.ring]; i++) m.expedition.carried.minh = [], X.collect(m, 'minh', id, here);
+  m.expedition.carried.minh = [];
+  assert.equal(X.collect(m, 'minh', id, here).error, 'empty');
+  assert.equal(X.collect(m, 'minh', 'L0,-1:1', at(l.sites[1].x, l.sites[1].y)).ok, true, 'each site has its own loads');
+});
+
+test("a survey at a landmark or a formation gives science by its ring (half again in the Crater Field and for the Scientist), its subject the landmark's or the formation's", () => {
+  const m = solo('EXP-1'), s = X.landmarkById(m, 'L0,-1', at(134, -46)).sites[2], id = 'L0,-1:2';
+  const crater = W.REGIONS[s.region] === 'craters' ? 1.5 : 1;
+  const r = X.collect(m, 'diego', id, at(s.x, s.y));
+  assert.deepEqual(r.item, { kind: 'science', id, region: s.region, res: 'science', amount: Math.round(D.FINDS.science.science[s.ring] * crater * 1.5), sub: 'crater' });
+  assert.equal(X.collect(m, 'diego', id, at(s.x, s.y)).error, 'empty', 'a survey is one load');
+  const p = solo('POI-1'), f = X.chunkAt(p, 0, 0).formations[0], g = f.sites[0], fid = 'F0,0:0';
+  assert.equal(f.id + ':0', fid);
+  const q = X.collect(p, 'minh', fid, at(g.x, g.y));
+  assert.deepEqual(q.item, { kind: 'science', id: fid, region: g.region, res: 'science', amount: D.FINDS.science.science[g.ring], sub: f.kind });
+  assert.equal(p.expedition.sites[fid], 0);
+});
+
+test("a site from outside its landmark's cell or its formation's chunk is refused before anything is looked up or built; odd spellings are no site", () => {
+  const m = solo('EXP-1'), s = X.landmarkById(m, 'L0,-1', at(134, -46)).sites[0], here = at(s.x, s.y), before = snap(m);
+  const real = { L: W.landmarkAt, C: W.chunk };
+  let looked = 0;
+  W.landmarkAt = (...a) => { looked++; return real.L(...a); };
+  W.chunk = (...a) => { looked++; return real.C(...a); };
+  try {
+    for (const id of ['L1,-1:0', 'L-4000,4000:0', 'F4000,4000:0', 'F5,-2:0']) assert.equal(X.collect(m, 'minh', id, here).error, 'tooFar', id);
+  } finally { W.landmarkAt = real.L; W.chunk = real.C; }
+  assert.equal(looked, 0, 'nothing was looked up for them');
+  for (const id of ['L0,-1:9', 'L0,-1:', 'L0,-1', 'L00,-1:0', 'L0,-1:00', 'l0,-1:0', 'F4,-2:1', 'F4,-2', 'S0,-1:0']) {
+    assert.equal(X.collect(m, 'minh', id, here).error, 'noFind', id);
+  }
+  assert.equal(X.collect(m, 'minh', 'F4,-2:0', here).error, 'noFind', 'a chunk with no formation has no survey');
+  const p = solo('POI-1'), f = X.chunkAt(p, -2, -1).formations[0];
+  assert.equal(f.sites.length, 0);
+  assert.equal(X.collect(p, 'minh', 'F-2,-1:0', at(f.x, f.y)).error, 'noFind', 'nor has a formation that is only scenery');
+  assert.equal(snap(m), before);
+});
+
+test("the first to see a landmark's centre discovers it: 80–150 science by the landmark, banked once for them, the Scientist's half again", () => {
+  const m = solo('EXP-1'), l = X.landmarkById(m, 'L0,-1', at(134, -46)), seen = at(l.x + 10, l.y), x = m.expedition;
+  const r = X.discover(m, 'minh', l.id, seen);
+  assert.equal(r.ok, true);
+  assert.ok(r.science >= 80 && r.science <= 150, String(r.science));
+  assert.deepEqual(r, { ok: true, landmark: l.id, science: r.science });
+  assert.deepEqual(x.landmarks, { [l.id]: { by: 'minh', round: m.turn } });
+  assert.equal(x.banked.science, r.science);
+  assert.deepEqual(x.banked.lines, [{ crewId: 'minh', kind: 'landmark', res: 'science', region: l.region, amount: r.science, loads: 1, late: false }]);
+  assert.equal(x.stats.minh.landmarks, 1);
+  const before = snap(m);
+  assert.equal(X.discover(m, 'diego', l.id, seen).error, 'known', 'once, whoever sees it next');
+  assert.equal(snap(m), before);
+  const s = solo('EXP-1');
+  assert.equal(X.discover(s, 'diego', l.id, seen).science, Math.round(r.science * 1.5), 'the Scientist gets half again');
+  // The reward goes by the landmark: the same in every mission of the world, and not the same for every landmark.
+  const all = [];
+  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
+    const k = W.landmarkAt(W.seedOf(m.seed), i, j);
+    if (k) all.push(X.discover(solo('EXP-1'), 'minh', k.id, at(k.x, k.y)).science);
+  }
+  assert.ok(all.length >= 8 && all.every(v => v >= 80 && v <= 150), all.join(' '));
+  assert.ok(new Set(all).size > all.length / 2, all.join(' '));
+  assert.equal(all[all.length - 1], X.discover(solo('EXP-1'), 'minh', 'L2,2', at(605, 640)).science);
+});
+
+test("a landmark is seen from 15.5 tiles of its centre at most (the rover's 10 on a star dune's crest, 4 more, and the slack); far ids are refused before anything is looked up", () => {
+  const m = solo('EXP-1'), l = X.landmarkById(m, 'L0,-1', at(134, -46)), c = at(l.x, l.y), before = snap(m);
+  assert.equal(X.discover(m, 'minh', l.id, { x: c.x + 15.6 * T, y: c.y }).error, 'tooFar');
+  assert.equal(snap(m), before);
+  assert.equal(X.discover(m, 'minh', l.id, { x: c.x, y: c.y - 15.4 * T }).ok, true);
+  const p = solo('EXP-1'), real = W.landmarkAt;
+  let looked = 0;
+  W.landmarkAt = (...a) => { looked++; return real(...a); };
+  try {
+    for (const id of ['L1,-1', 'L-4000,4000', 'L0,0']) assert.equal(X.discover(p, 'minh', id, c).error, 'tooFar', id);
+  } finally { W.landmarkAt = real; }
+  assert.equal(looked, 0, 'nothing was looked up for them');
+  for (const id of ['L0,-1:0', 'l0,-1', 'L00,-1', 'L0, -1', 'S0,-1', '', null]) assert.equal(X.discover(p, 'minh', id, c).error, 'noLandmark', String(id));
+  let none = null;
+  for (let j = -3; j <= 3 && !none; j++) for (let i = -3; i <= 3 && !none; i++) if (!W.landmarkAt(W.seedOf(p.seed), i, j)) none = [i, j];
+  assert.equal(X.discover(p, 'minh', 'L' + none[0] + ',' + none[1], at(none[0] * 256 + 128, none[1] * 256 + 128)).error, 'noLandmark', 'a cell without one');
+  assert.equal(X.discover(p, 'minh', l.id, null).error, 'badPos');
+  assert.equal(X.discover(p, 'nobody', l.id, c).error, 'noCrew');
+  assert.deepEqual(p.expedition.landmarks, {});
+});
+
+// A structure of a kind near the base (EXP-1 has one of each within 5 cells); you use it from its door, (x, y).
+function structure(m, kind) {
+  const seed = W.seedOf(m.seed);
+  for (let r = 0; r < 6; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
+    const s = W.structureAt(seed, i, j);
+    if (s && s.kind === kind) return s;
+  }
+  throw new Error('no ' + kind + ' near the base');
+}
+const loadsOf = (m, s, r) => r.items.concat(r.left ? m.expedition.drops.find(d => d.id === s.id).items : []);
+// The numbers of loads the structures of a kind within r cells of EXP-1's base hold (each opened in a fresh mission).
+function loadCounts(kind, r) {
+  const seed = W.seedOf('EXP-1'), out = new Set();
+  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
+    const s = W.structureAt(seed, i, j), q = s && s.kind === kind && X.interact(solo('EXP-1'), 'minh', s.id, at(s.x, s.y));
+    if (q) out.add(q.items.length + q.left);
+  }
+  return [...out].sort();
+}
+
+test('a cache opens once: its 1–2 supplies, fixed by the mission code, go into your backpack and what does not fit is left at its door', () => {
+  const m = solo('EXP-1'), s = structure(m, 'cache'), door = at(s.x, s.y), x = m.expedition;
+  const ice = { kind: 'ice', res: 'water', amount: 40 };
+  x.carried.minh = [ice, ice, ice];
+  const r = X.interact(m, 'minh', s.id, door);
+  assert.equal(r.ok, true);
+  assert.equal(r.done, 'used');
+  assert.deepEqual(x.structures, { [s.id]: 'used' });
+  assert.equal(x.stats.minh.structures, 1);
+  assert.deepEqual(r.items, [], 'a full backpack takes none');
+  const d = x.drops.find(k => k.id === s.id);
+  assert.deepEqual([d.x, d.y], [door.x, door.y], 'they wait at its door');
+  assert.ok(d.items.length >= 1 && d.items.length <= 2 && r.left === d.items.length);
+  for (const it of d.items) {
+    assert.equal(it.kind, 'cache');
+    assert.equal(it.id, s.id);
+    assert.ok(['spares', 'food', 'o2'].includes(it.res), it.res);
+  }
+  const supplies = d.items.slice();
+  x.carried.minh = [];
+  assert.deepEqual(X.pickUp(m, 'minh', s.id, door).items, supplies, 'picked up as any drop');
+  const again = solo('EXP-1');
+  assert.deepEqual(X.interact(again, 'diego', s.id, door).items, supplies, 'the same supplies in every mission of the code, whoever opens it');
+  assert.equal(X.interact(m, 'diego', s.id, door).error, 'done', 'once');
+  assert.deepEqual(loadCounts('cache', 4), [1, 2], 'by the cache: some hold 1, some 2');
+});
+
+test('a wreck gives 2–3 metal loads and a spare kit, a solar array 2 loads of materials; on foot 3 loads fit and the rest is left at the door', () => {
+  const m = solo('EXP-1'), w = structure(m, 'wreck'), x = m.expedition;
+  const r = X.interact(m, 'lena', w.id, at(w.x, w.y)), loads = loadsOf(m, w, r);
+  const metal = loads.filter(it => it.res === 'materials');
+  assert.ok(metal.length >= 2 && metal.length <= 3, String(metal.length));
+  assert.ok(metal.every(it => it.amount === D.FINDS.metal.kg && it.kind === 'wreck'));
+  assert.deepEqual(loads.filter(it => it.res === 'spares').map(it => it.amount), [1]);
+  assert.equal(loads.length, metal.length + 1);
+  assert.equal(r.items.length, 3);
+  assert.equal(x.carried.lena.length, 3);
+  assert.deepEqual(loadCounts('wreck', 5), [3, 4], 'by the wreck: 2 or 3 metal loads, and the spare kit');
+  const a = structure(m, 'array'), q = X.interact(m, 'diego', a.id, at(a.x, a.y));
+  const load = { kind: 'array', id: a.id, region: a.region, res: 'materials', amount: D.FINDS.metal.kg };
+  assert.deepEqual(q, { ok: true, done: 'used', items: [load, load], left: 0, fog: {} });
+  assert.deepEqual(x.structures, { [w.id]: 'used', [a.id]: 'used' });
+});
+
+test('a repaired weather station reveals the fog within 24 tiles of it, banks 20 science and forecasts the weather a round ahead for 3 rounds', () => {
+  const m = solo('EXP-1'), s = structure(m, 'weather'), x = m.expedition;
+  assert.equal(X.forecastAhead(m), null, 'no forecast before');
+  const r = X.interact(m, 'minh', s.id, at(s.x, s.y));
+  assert.equal(r.done, 'repaired');
+  assert.deepEqual(r.items, []);
+  assert.deepEqual(r.fog, x.revealed, 'what it revealed, for the co-op server to share');
+  const seen = (tx, ty) => {
+    const cx = Math.floor(tx / 32), cy = Math.floor(ty / 32), k = cx + ',' + cy, bits = x.revealed[k] && F.decode(x.revealed[k]);
+    return !!bits && F.has(bits, tx - cx * 32, ty - cy * 32) === 1;
+  };
+  const mx = (s.box[0] + s.box[2] + 1) / 2, my = (s.box[1] + s.box[3] + 1) / 2; // the middle of its 2×2 footprint
+  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
+    const tile = d => [Math.floor(mx + dx * d), Math.floor(my + dy * d)]; // the tile whose middle is d tiles out
+    assert.ok(seen(...tile(23.5)), '23.5 tiles out, ' + [dx, dy]);
+    assert.ok(!seen(...tile(24.5)), 'not 24.5 tiles out, ' + [dx, dy]);
+  }
+  assert.equal(x.banked.science, D.STRUCTURES.kinds.weather.science);
+  assert.deepEqual(x.banked.lines, [{ crewId: 'minh', kind: 'weather', res: 'science', region: s.region, amount: 20, loads: 1, late: false }]);
+  assert.equal(x.forecastUntil, m.turn + 3);
+  const now = m.turn;
+  for (let t = now; t <= now + 3; t++) {
+    m.turn = t;
+    assert.equal(X.forecastAhead(m), m.schedule[t + 1].weather, 'round ' + t + ' sees the next');
+  }
+  m.turn = now + 4;
+  assert.equal(X.forecastAhead(m), null, 'then it stops');
+});
+
+test('a repaired comms mast marks the nearest landmark and every other structure within 96 tiles; the marks are read from the world, never stored', () => {
+  const m = solo('EXP-1'), seed = W.seedOf(m.seed), s = W.structureAt(seed, -3, -4); // a mast with 4 structures near it
+  assert.equal(s.kind, 'mast');
+  assert.deepEqual(X.mastMarks(m), [], 'nothing before it is repaired');
+  X.interact(m, 'lena', s.id, at(s.x, s.y));
+  let near = null;
+  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
+    const l = W.landmarkAt(seed, i, j), d = l && (l.x - s.x) * (l.x - s.x) + (l.y - s.y) * (l.y - s.y);
+    if (l && (!near || d < near.d)) near = { d, mark: { id: l.id, x: l.x, y: l.y, kind: l.kind } };
+  }
+  const want = [near.mark];
+  for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
+    const k = W.structureAt(seed, i, j);
+    if (k && k.id !== s.id && (k.x - s.x) * (k.x - s.x) + (k.y - s.y) * (k.y - s.y) <= 96 * 96) want.push({ id: k.id, x: k.x, y: k.y, kind: k.kind });
+  }
+  assert.ok(want.length >= 3, 'structures to mark: ' + (want.length - 1));
+  const byId = list => list.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
+  const marks = X.mastMarks(m);
+  assert.deepEqual(byId(marks), byId(want));
+  assert.ok(marks.every(k => Object.keys(k).join() === 'id,x,y,kind'), 'exactly { id, x, y, kind }');
+  assert.deepEqual(m.expedition.structures, { [s.id]: 'repaired' }, 'only its state is stored');
+});
+
+test('using a structure is refused from outside its cell before anything is looked up, and for odd spellings, an empty cell, a hab pod, one already used or a door out of reach', () => {
+  const m = solo('EXP-1'), s = structure(m, 'cache'), door = at(s.x, s.y), before = snap(m), real = W.structureAt;
+  let looked = 0;
+  W.structureAt = (...a) => { looked++; return real(...a); };
+  try {
+    for (const id of ['S-4000,9', 'S' + (s.i + 1) + ',' + s.j, 'S' + s.i + ',' + (s.j - 1)]) assert.equal(X.interact(m, 'minh', id, door).error, 'tooFar', id);
+  } finally { W.structureAt = real; }
+  assert.equal(looked, 0, 'nothing was looked up for them');
+  for (const id of ['s' + s.i + ',' + s.j, 'S0' + s.i + ',' + s.j, s.id + ':0', 'L' + s.i + ',' + s.j, '', null]) {
+    assert.equal(X.interact(m, 'minh', id, door).error, 'noStructure', String(id));
+  }
+  let none = null;
+  for (let j = -4; j <= 4 && !none; j++) for (let i = -4; i <= 4 && !none; i++) if (!W.structureAt(W.seedOf(m.seed), i, j)) none = [i, j];
+  assert.equal(X.interact(m, 'minh', 'S' + none[0] + ',' + none[1], at(none[0] * 64 + 32, none[1] * 64 + 32)).error, 'noStructure', 'a cell without one');
+  const pod = structure(m, 'pod');
+  assert.equal(X.interact(m, 'minh', pod.id, at(pod.x, pod.y)).error, 'badKind', 'a hab pod is walked into, not used');
+  assert.equal(X.interact(m, 'minh', s.id, { x: door.x, y: door.y + 1.6 * T }).error, 'tooFar', '1.5 tiles of slack, no more');
+  assert.equal(X.interact(m, 'minh', s.id, null).error, 'badPos');
+  assert.equal(X.interact(m, 'nobody', s.id, door).error, 'noCrew');
+  assert.equal(snap(m), before, 'a refused action changes nothing');
+  assert.equal(X.interact(m, 'minh', s.id, { x: door.x, y: door.y + 1.4 * T }).ok, true);
+  assert.equal(X.interact(m, 'minh', s.id, door).error, 'done');
+});
+
+test('holding E at a structure: 3 s for a cache, 6 s for a wreck, a weather station or a mast (the Engineer 3 s), 5 s for a solar array', () => {
+  const want = { cache: [3, 3], wreck: [6, 3], weather: [6, 3], mast: [6, 3], array: [5, 5] };
+  for (const kind of Object.keys(want)) {
+    assert.equal(X.holdSeconds(kind, 'medic'), want[kind][0], kind);
+    assert.equal(X.holdSeconds(kind, 'engineer'), want[kind][1], kind + ', the Engineer');
+  }
+  assert.equal(X.holdSeconds('pod', 'engineer'), 1.5, "a cargo pod's loads are still the Engineer's quick work");
+  assert.equal(X.holdSeconds('pod', 'medic'), 3);
+});
+
+test("a mast marks the nearest landmark, also when it stands across the border of the mast's own landmark cell", () => {
+  let masts = 0, across = 0;
+  for (const code of ['EXP-1', 'POI-1', 'EXP-SCI']) {
+    const seed = W.seedOf(code);
+    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
+      const s = W.structureAt(seed, i, j);
+      if (!s || s.kind !== 'mast') continue;
+      const m = solo(code);
+      m.expedition.structures[s.id] = 'repaired';
+      let near = null, nd = Infinity;
+      for (let b = -5; b <= 5; b++) for (let a = -5; a <= 5; a++) {
+        const l = W.landmarkAt(seed, a, b), d = l && (l.x - s.x) * (l.x - s.x) + (l.y - s.y) * (l.y - s.y);
+        if (l && d < nd) { near = l; nd = d; }
+      }
+      assert.equal(X.mastMarks(m).filter(k => k.id[0] === 'L').map(k => k.id).join(), near.id, code + ' ' + s.id);
+      masts++;
+      if (Math.floor(s.x / 256) !== near.i || Math.floor(s.y / 256) !== near.j) across++;
+    }
+  }
+  assert.ok(masts >= 10 && across >= 3, masts + ' masts, ' + across + ' with the nearest in another cell');
+});
+
+test('a hab pod refills your suit from inside it, once per pod for each crew member each round; the advance gives a new one', () => {
+  const m = solo('EXP-1'), p = X.structureById(m, 'S0,-1', at(32, -53)), x = m.expedition;
+  assert.equal(p.kind, 'pod');
+  const floor = at((p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2);
+  x.suits.minh = 40;
+  assert.deepEqual(X.refill(m, 'minh', p.id, floor), { ok: true, suit: D.EXPEDITION.suit });
+  assert.equal(x.suits.minh, D.EXPEDITION.suit);
+  assert.deepEqual(x.refills, { minh: [p.id] });
+  const before = snap(m);
+  assert.equal(X.refill(m, 'minh', p.id, floor).error, 'refilled', 'once a round');
+  assert.equal(snap(m), before);
+  assert.equal(X.refill(m, 'diego', p.id, floor).ok, true, 'each crew member has their own');
+  const { state } = E.resolveTurn(m, E.defaultPlan(m));
+  assert.deepEqual(state.expedition.refills, {}, 'the advance clears them');
+  assert.equal(X.refill(state, 'minh', p.id, floor).ok, true, 'and the next round it refills again');
+});
+
+test('a hab pod refills only from inside its footprint, with the 1.5 tiles of slack every action gets; nothing else refills', () => {
+  const m = solo('EXP-1'), p = X.structureById(m, 'S0,-1', at(32, -53)), b = p.box, before = snap(m);
+  assert.equal(X.refill(m, 'minh', p.id, at(p.x, b[3] + 2)).error, 'tooFar', 'two steps out of its door');
+  assert.equal(X.refill(m, 'minh', p.id, at(b[0] - 3, (b[1] + b[3]) / 2)).error, 'tooFar', 'three steps west of its wall');
+  const c = structure(m, 'cache');
+  assert.equal(X.refill(m, 'minh', c.id, at(c.x, c.y)).error, 'badKind', 'a cache is no hab pod');
+  const real = W.structureAt;
+  let looked = 0;
+  W.structureAt = (...a) => { looked++; return real(...a); };
+  try {
+    for (const id of ['S-4000,9', 'S1,-1', 'S0,0']) assert.equal(X.refill(m, 'minh', id, at(p.x, p.y)).error, 'tooFar', id);
+  } finally { W.structureAt = real; }
+  assert.equal(looked, 0, 'nothing was looked up for them');
+  for (const id of ['s0,-1', 'S00,-1', 'S0,-1:0', 'L0,-1', '', null]) assert.equal(X.refill(m, 'minh', id, at(p.x, p.y)).error, 'noStructure', String(id));
+  assert.equal(X.refill(m, 'minh', p.id, null).error, 'badPos');
+  assert.equal(X.refill(m, 'nobody', p.id, at(p.x, p.y)).error, 'noCrew');
+  assert.equal(snap(m), before, 'a refused action changes nothing');
+  assert.equal(X.refill(m, 'minh', p.id, at(p.x, b[3] + 1)).ok, true, 'a step out of its door is within the slack');
+});
+
+test("a mission saved by 3.4.0 loads with the points of interest's state: no forecast running, its stats kept, and the new actions work on it", () => {
+  const m = solo('EXP-1');
+  delete m.expedition.forecastUntil; // what 3.4.0 saved: every field but the weather station's forecast
+  m.expedition.stats = { minh: { finds: { ice: 2 } } };
+  const up = E.upgradeMission(JSON.parse(JSON.stringify(m)), {}), x = up.expedition; // a save is JSON
+  assert.equal(x.forecastUntil, -1);
+  assert.equal(X.forecastAhead(up), null);
+  assert.deepEqual(x.stats.minh, { finds: { ice: 2 } }, 'kept as it was');
+  assert.equal(X.discover(up, 'minh', 'L0,-1', at(134, -46)).ok, true);
+  assert.deepEqual(x.stats.minh, { finds: { ice: 2 }, landmarks: 1 });
+  assert.equal(X.interact(up, 'minh', 'S3,0', at(200, 12)).done, 'repaired');
+  assert.equal(x.forecastUntil, up.turn + 3);
+  assert.equal(X.refill(up, 'minh', 'S0,-1', at(32, -55)).ok, true);
+  for (const junk of ['3', NaN, Infinity, null, {}]) {
+    const s = solo('EXP-1');
+    s.expedition.forecastUntil = junk;
+    assert.equal(E.upgradeMission(s, {}).expedition.forecastUntil, -1, 'a hand-edited forecast is none: ' + String(junk));
+  }
+});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/dangers.test.js test/engine.test.js test/expedition.test.js`
Expected: 20 of 142 fail, among them "an abandoned hab pod is cover inside its footprint…", "a lava tube is cover on its floor and under its skylight…", "a cave hidden under a landmark is no cover…", "a landmark's site is collected like a find…", "the first to see a landmark's centre discovers it: 80–150 science…", "a landmark is seen from 15.5 tiles of its centre at most…", "a cache opens once…", "a wreck gives 2–3 metal loads and a spare kit…", "a repaired weather station reveals the fog within 24 tiles…", "a repaired comms mast marks the nearest landmark…", "a hab pod refills your suit from inside it, once per pod for each crew member each round…", "the view from the tile under you…", "a new mission has an empty exploring state…" (the new `forecastUntil` key) and "a mission saved by 3.4.0 loads with the points of interest's state…".

- [ ] **Step 3: Write the rules**

```diff
diff --git a/src/dangers.js b/src/dangers.js
index 123135a..b38ace3 100644
--- a/src/dangers.js
+++ b/src/dangers.js
@@ -9,13 +9,17 @@
  * Positions are world pixels { x, y } (64 px a tile, the HQ tile's corner at 0, 0).
  *
  * API: viewTiles(m, inRover) → tiles you can see around you this round (dust storms shrink it)
+ *      viewAt(m, inRover, tile) → the same from the tile under you: a lava tube's headlamp ignores the storm, a star
+ *        dune's crest sees further
  *      outside(m) → what waits outside this round, in the order the round's brief and the Expedition panel say it: 'flare'
  *        (a solar flare is due), 'devils' (a dust-devil round), 'storm' (a regional or global dust storm), 'rupture' (an O₂
  *        line rupture at the base: canisters carried home count)
- *      coversIn(m, x0, y0, x1, y1, peek) → [{ kind: 'shelter' | 'cave', x, y }]: the cover from a solar flare whose middle
- *        (x, y) is in that box (tile units); DANGERS.shelter tiles from it count. peek(cx, cy) → a data chunk or null: the
- *        surface passes the chunks it holds (SolWorld's peek); the rules leave it out
- *      shelterAt(m, pos, slack, peek) → 'base' | 'shelter' | 'cave' | null: what covers you from a solar flare at pos
+ *      coversIn(m, x0, y0, x1, y1, peek) → [{ kind: 'shelter' | 'cave', x, y } | { kind: 'pod' | 'tube', id, x, y, box }]: the
+ *        cover from a solar flare in that box (tile units): a point whose middle (x, y) is in it (DANGERS.shelter tiles from
+ *        it count), or an interior whose box touches it ((x, y) is where its ring goes). peek(cx, cy) → a data chunk or null:
+ *        the surface passes the chunks it holds (SolWorld's peek); the rules leave it out
+ *      shelterAt(m, pos, slack, peek) → 'base' | 'shelter' | 'cave' | 'pod' | 'tube' | null: what covers you from a solar
+ *        flare at pos
  *      slackOf(m) → the slack (tiles) the flare's verdict gives a position: EXPEDITION.reach in co-op (the server judges
  *        where it last saw you), 0 in solo play
  *      flareDue(m) → does a solar flare come this round (the schedule's spe)?
@@ -49,6 +53,12 @@
     if (w === 'regional') return Z.view.regional;
     return inRover ? Z.view.rover : Z.view.clear;
   }
+  // The same from the tile under you (spec §3.4, §3.6): inside a lava tube (its floor or under its skylight) the headlamp
+  // lights what clear weather shows, whatever the storm outside; a star dune's crest adds view.crest tiles to the weather's.
+  function viewAt(m, inRover, tile) {
+    if (tile === W.TILE.TUBE_FLOOR || tile === W.TILE.SKYLIGHT) return inRover ? Z.view.rover : Z.view.clear;
+    return viewTiles(m, inRover) + (tile === W.TILE.CREST ? Z.view.crest : 0);
+  }
 
   // ---------- what waits outside this round ----------
   // The surface's round brief and the console's Expedition panel both read this list, so a new danger is added here once;
@@ -63,34 +73,62 @@
   }
 
   // ---------- shelter from a solar flare ----------
-  // Every cover whose middle is in the box (tile units, edges included): the built storm shelter (spec §3.4), then the caves'
-  // mouths. shelterAt, the surface's amber rings and its cover checks all read this one list, so lava-tube interiors and
-  // abandoned hab pods (M4c) join it here. peek(cx, cy) → a data chunk or null; without it the chunks are built.
+  // Every cover in the box (tile units, edges included): the built storm shelter (spec §3.4), then, chunk by chunk, the caves'
+  // mouths (not those hidden under a point of interest's footprint), the abandoned hab pods and the lava tubes. shelterAt, the
+  // surface's amber rings and its cover checks all read this one list. The shelter and a cave are points, listed when their
+  // middle is in the box. A pod and a tube are interiors: the entry carries its id and its box (inclusive tiles), and is listed
+  // when that box touches the query's; its (x, y) is where its ring goes, the middle of the pod's door or of the tube's
+  // skylight. Every chunk a landmark's box (or a structure's apron) touches lists it, so each is added once, by id.
+  // peek(cx, cy) → a data chunk or null; without it the chunks are built.
+  const chunksOf = (m, peek) => peek || ((cx, cy) => X.chunkAt(m, cx, cy));
   function coversIn(m, x0, y0, x1, y1, peek) {
-    const out = [], chunk = peek || ((cx, cy) => X.chunkAt(m, cx, cy));
+    const out = [], seen = new Set(), chunk = chunksOf(m, peek);
     const add = (kind, x, y) => { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.push({ kind, x, y }); };
+    const room = (kind, id, [x, y], box) => {
+      if (seen.has(id) || box[0] > x1 || box[2] + 1 < x0 || box[1] > y1 || box[3] + 1 < y0) return;
+      seen.add(id);
+      out.push({ kind, id, x: x + 0.5, y: y + 0.5, box });
+    };
     const sh = E.activeCount(m, 'shelter') > 0 ? m.layout.find(k => k.type === 'shelter') : null;
     if (sh) add('shelter', sh.x + W.BASE_RECT.x + 0.5, sh.y + W.BASE_RECT.y + 0.5);
     for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) {
       for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
         const c = chunk(cx, cy);
-        if (c) for (const k of c.caves) add('cave', k.x + 0.5, k.y + 0.5);
+        if (!c) continue;
+        for (const k of c.caves) if (!c.hidden.caves.includes(k.n)) add('cave', k.x + 0.5, k.y + 0.5);
+        for (const s of c.structures) if (s.kind === 'pod') room('pod', s.id, [s.x, s.y], s.box);
+        for (const l of c.landmarks) if (l.kind === 'tube') room('tube', l.id, l.skylight, l.box);
       }
     }
     return out;
   }
-  // The base zone, or the first cover in the list within DANGERS.shelter tiles of its middle. `slack` (tiles) widens each
-  // for a position sent a moment ago; `peek` is the lister's.
+  // The base zone, or the first cover in the list that holds you: within DANGERS.shelter tiles of a point's middle, or
+  // inside an interior. `slack` (tiles) widens each for a position sent a moment ago; `peek` is the lister's.
   function shelterAt(m, pos, slack, peek) {
     if (!m || !okPos(pos)) return null;
     const s = slack || 0, r = Z.shelter + s, fx = pos.x / T, fy = pos.y / T;
     if (X.inBaseZone(pos, s)) return 'base';
     for (const k of coversIn(m, fx - r, fy - r, fx + r, fy + r, peek)) {
       const dx = k.x - fx, dy = k.y - fy;
-      if (dx * dx + dy * dy <= r * r) return k.kind;
+      if (k.box ? inside(m, k, fx, fy, s, peek) : dx * dx + dy * dy <= r * r) return k.kind;
     }
     return null;
   }
+  // Inside an interior: in its box, widened by the slack. A tube's box also holds its wall and the plain ground round it, so
+  // there you must be on its floor or under its skylight: on one of those tiles, or within the slack of one.
+  function inside(m, k, fx, fy, s, peek) {
+    const b = k.box;
+    if (fx < b[0] - s || fx >= b[2] + 1 + s || fy < b[1] - s || fy >= b[3] + 1 + s) return false;
+    if (k.kind !== 'tube') return true;
+    const chunk = chunksOf(m, peek);
+    for (let ty = Math.floor(fy - s); ty <= Math.floor(fy + s); ty++) {
+      for (let tx = Math.floor(fx - s); tx <= Math.floor(fx + s); tx++) {
+        const cx = Math.floor(tx / CH), cy = Math.floor(ty / CH), c = chunk(cx, cy), t = c && W.tileOf(c, tx - cx * CH, ty - cy * CH);
+        if (t === W.TILE.TUBE_FLOOR || t === W.TILE.SKYLIGHT) return true;
+      }
+    }
+    return false;
+  }
   // The co-op server judges where it last saw you, a moment ago, so it gives you the slack every checked action gets; solo
   // play judges you where you are. The server, the solo verdict and the surface's banner all ask here, so they agree.
   const slackOf = m => (m && m.coop ? D.EXPEDITION.reach : 0);
@@ -206,6 +244,9 @@
     revive: (m, id, b, pos) => X.revive(m, id, b.target, pos),
     board: (m, id, b, pos) => X.board(m, id, pos),
     park: (m, id, b, pos) => X.park(m, id, pos, b.driven),
+    discover: (m, id, b, pos) => X.discover(m, id, b.landmark, pos),
+    interact: (m, id, b, pos) => X.interact(m, id, b.structure, pos),
+    refill: (m, id, b, pos) => X.refill(m, id, b.pod, pos),
     // Solo play's flare (spec §3.4): your first step outside starts it on the round's clock; at its end you are hit unless
     // you have cover (the rest of the crew is at the base, and so are you if you sit out the round after a collapse).
     flareStart: (m, id, b) => flareStart(m, b.t),
@@ -216,5 +257,5 @@
     return run ? run(m, crewId, body || {}, pos) : { error: 'badAction' };
   }
 
-  return { viewTiles, outside, coversIn, shelterAt, slackOf, flareDue, flareStart, flareEnd, setClock, clockOf, devils, devilHit, act };
+  return { viewTiles, viewAt, outside, coversIn, shelterAt, slackOf, flareDue, flareStart, flareEnd, setClock, clockOf, devils, devilHit, act };
 });
diff --git a/src/data.js b/src/data.js
index 6d468d2..0f892d2 100644
--- a/src/data.js
+++ b/src/data.js
@@ -248,7 +248,7 @@
     DANGERS: {
       flare: { delay: 30, countdown: 60, dose: 15 }, // the warning comes 30 s after the first step outside; 60 s to take cover
       shelter: 0.9,             // tiles from the middle of a cave's mouth, or of the storm shelter's tile, that count as cover
-      view: { clear: 8, rover: 10, regional: 5, global: 3 }, // tiles you can see around you; dust storms shrink it
+      view: { clear: 8, rover: 10, regional: 5, global: 3, crest: 4 }, // tiles you can see around you; dust storms shrink it, a star dune's crest adds `crest`
       devils: {
         quiet: [0, 1], round: [3, 5], dunes: 2, // devils a chunk in most rounds and in a dust-devil round; the Dune Sea doubles both
         life: 24, fade: 2, track: [6, 12], // a devil lasts 24 s (2 s to form, 2 to die down) and drifts 6–12 tiles in a line
diff --git a/src/engine.js b/src/engine.js
index 357ac41..b5eea1b 100644
--- a/src/engine.js
+++ b/src/engine.js
@@ -227,6 +227,9 @@
   //   { x, y } parked out on the map, or { driver } while someone drives it · roverDriven: tiles driven this round.
   // M4b adds the dangers: flare (null, or this round's solar flare { warn, end, over, hit } on the round's clock, see
   //   src/dangers.js) · clock (solo: the round's clock, seconds) · where { crewId: { x, y } } (solo: where you last stood).
+  // M4c adds the points of interest (src/expedition.js): landmarks { landmarkId: { by, round } } (discovered) ·
+  //   structures { structId: 'used' | 'repaired' } · forecastUntil: the last round a repaired weather station forecasts
+  //   the next one's weather (−1: none) · stats[crewId].landmarks, .structures (counts).
   // An item is { kind, res, amount, id, region } (+ sub for a survey, canister: true for an O₂ canister).
   const BANK_RES = ['water', 'materials', 'spares', 'food', 'o2', 'science', 'morale'];
   function freshBank() {
@@ -239,7 +242,7 @@
       v: 2, revealed: {}, sites: {}, structures: {}, landmarks: {}, regions: [], beacons: [], kits: 0, refills: {},
       carried: {}, drops: [], banked: freshBank(), goals: [], incidents: [], stats: {},
       suits: {}, collapsed: {}, benched: [], rover: null, roverDriven: 0,
-      flare: null, clock: 0, where: {},
+      flare: null, clock: 0, where: {}, forecastUntil: -1,
     };
   }
 
diff --git a/src/expedition.js b/src/expedition.js
index 879b9ae..ad63276 100644
--- a/src/expedition.js
+++ b/src/expedition.js
@@ -13,17 +13,23 @@
  *      chunkAt(m, cx, cy) → the data chunk · loadsLeft(m, find, id) · itemFor(m, find, load, role) · holdSeconds(kind, role)
  *      capacity(m, crewId) · inBaseZone(pos, slack) · suitOf(m, crewId) · setSuit(m, crewId, s) · bay(m) → the rover's bay
  *      setWhere(m, crewId, pos) · whereOf(m, crewId) (solo: where you stand, so a reload puts you back there)
- *      collect(m, crewId, findId, pos) · deliver(m, crewId, pos) · useCanister(m, crewId, pos, liveSuit)
+ *      collect(m, crewId, siteId, pos) (a find "<cx>,<cy>:<n>", a landmark's site "L<i>,<j>:<n>", a formation's survey
+ *        "F<cx>,<cy>:0") · deliver(m, crewId, pos) · useCanister(m, crewId, pos, liveSuit)
  *      pickUp(m, crewId, dropId, pos) · collapse(m, crewId, pos, driven) · revive(m, crewId, targetId, pos)
  *      board(m, crewId, pos) · park(m, crewId, pos, driven)
+ *      discover(m, crewId, landmarkId, pos) → { ok, landmark, science }: the first sighting of a landmark's centre
+ *      interact(m, crewId, structId, pos) → { ok, done: 'used' | 'repaired', items, left, fog }: a Kestrel structure
+ *      refill(m, crewId, podId, pos) → { ok, suit }: a full suit inside a hab pod, once per pod for each crew member a round
+ *      forecastAhead(m) → next round's weather while a repaired weather station forecasts it, or null
+ *      mastMarks(m) → [{ id, x, y, kind }]: what the repaired comms masts mark on the minimap (world tiles)
  *      roverLeft(m) → tiles the rover can still drive this round · setRoverDriven(m, crewId, tiles) (the driver's game)
  *      cacheSize() → data chunks in the shared world cache (at most 256)
  * Solar flares, shelters, dust devils and how far you can see are src/dangers.js.
  */
 (function (root, factory) {
-  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./worldgen.js'), require('./engine.js'));
-  else root.SolExpedition = factory(root.SolData, root.SolWorldgen, root.SolEngine);
-})(typeof self !== 'undefined' ? self : this, function (D, W, E) {
+  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./worldgen.js'), require('./engine.js'), require('./fog.js'));
+  else root.SolExpedition = factory(root.SolData, root.SolWorldgen, root.SolEngine, root.SolFog);
+})(typeof self !== 'undefined' ? self : this, function (D, W, E, Fog) {
   'use strict';
   const T = 64;
   const X = D.EXPEDITION;
@@ -86,6 +92,27 @@
     const v = m.expedition.sites[id == null ? f.id : id];
     return Number.isFinite(v) ? v : D.FINDS[f.kind].loads[f.ring];
   }
+  // What you can collect: a find, a landmark's site ("L<i>,<j>:<n>") or a formation's survey ("F<cx>,<cy>:0"), plus its id
+  // and loads left, or { error }. Each is looked up only from inside what holds it: a find's or a formation's chunk (the
+  // survey is at the formation's spot, 2 tiles inside it), a landmark's cell (its sites lie in its box, 3 tiles inside).
+  const LSITE = /^L(-?\d{1,7}),(-?\d{1,7}):(\d{1,2})$/, FSITE = /^F(-?\d{1,7}),(-?\d{1,7}):0$/;
+  function siteAt(m, id, pos) {
+    let g = idNums(ID, id), f = null;
+    if (g) {
+      if (!inCell(pos, g[0], g[1], W.CHUNK)) return { error: 'tooFar' };
+      return findById(m, id) || { error: 'noFind' };
+    }
+    if ((g = idNums(LSITE, id))) {
+      if (!inCell(pos, g[0], g[1], D.LANDMARKS.cell)) return { error: 'tooFar' };
+      const l = W.landmarkAt(W.seedOf(m.seed), g[0], g[1]);
+      f = l && l.sites[g[2]];
+    } else if ((g = idNums(FSITE, id))) {
+      if (!inCell(pos, g[0], g[1], W.CHUNK)) return { error: 'tooFar' };
+      const k = chunkAt(m, g[0], g[1]).formations[0];
+      f = k && k.sites[0];
+    }
+    return f ? Object.assign({ id, left: loadsLeft(m, f, id) }, f) : { error: 'noFind' };
+  }
 
   // ---------- small helpers ----------
   const okPos = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
@@ -107,8 +134,11 @@
     const v = m.expedition.suits[crewId];
     return Number.isFinite(v) ? v : X.suit;
   }
-  // Seconds of holding E for a find (or 'pickup', 'revive'), with the role's skill (spec §3.3).
+  // Seconds of holding E for a find (or 'pickup', 'revive'), with the role's skill (spec §3.3), or for a structure (its
+  // own seconds in D.STRUCTURES, the Engineer's where it has them; the hab pod has none, and 'pod' is a cargo pod's).
   function holdSeconds(kind, role) {
+    const S = D.STRUCTURES.kinds[kind];
+    if (S && S.hold) return role === 'engineer' && S.engineer ? S.engineer : S.hold;
     const base = kind === 'science' ? X.hold.survey : kind === 'pickup' ? X.hold.pickup : kind === 'revive' ? X.hold.revive : X.hold.load;
     const skill = D.SKILLS[role] || {};
     return base * (skill[kind] || 1);
@@ -136,10 +166,14 @@
       const k = (f.region === CRATERS ? F.craters : 1) * (role === 'scientist' ? D.SKILLS.scientist.scienceBonus : 1);
       return Object.assign(item, { res: 'science', amount: Math.round(F.science[f.ring] * k), sub: f.sub });
     }
-    const pick = W.hash(W.seedOf(m.seed), f.x, f.y, 700 + load) % 5; // spare kits are the rarest
-    if (pick === 0) return Object.assign(item, { res: 'spares', amount: 1 });
-    if (pick <= 3) return Object.assign(item, { res: 'food', amount: F.food });
-    return Object.assign(item, { res: 'o2', amount: X.canister.o2, canister: true });
+    return Object.assign(item, supply(W.hash(W.seedOf(m.seed), f.x, f.y, 700 + load)));
+  }
+  // A load of supplies (a cargo pod's, a supply cache's) from its hash: a spare kit (the rarest), food or an O₂ canister.
+  function supply(h) {
+    const pick = h % 5;
+    if (pick === 0) return { res: 'spares', amount: 1 };
+    if (pick <= 3) return { res: 'food', amount: D.FINDS.pod.food };
+    return { res: 'o2', amount: X.canister.o2, canister: true };
   }
   function statsOf(x, crewId) {
     if (!x.stats[crewId] || typeof x.stats[crewId] !== 'object') x.stats[crewId] = { finds: {} };
@@ -148,25 +182,22 @@
   }
 
   // ---------- actions ----------
-  // Takes one load from a find next to you into your backpack.
-  function collect(m, crewId, findId, pos) {
+  // Takes one load from a find, or a landmark's or a formation's site, next to you into your backpack.
+  function collect(m, crewId, siteId, pos) {
     const a = able(m, crewId);
     if (a.error) return a;
     if (!okPos(pos)) return { error: 'badPos' };
-    const g = idNums(ID, findId);
-    if (!g) return { error: 'noFind' };
-    // A find stands 3 tiles inside its chunk, so it is only in reach from there. Checked before the chunk is built: an id
-    // from far away would cost a build and push other rooms' chunks out of the shared cache.
-    if (!inCell(pos, g[0], g[1], W.CHUNK)) return { error: 'tooFar' };
-    const f = findById(m, findId);
-    if (!f) return { error: 'noFind' };
+    // A site is only in reach from inside what holds it. Checked before anything is built: an id from far away would cost a
+    // build and push other rooms' chunks out of the shared cache.
+    const f = siteAt(m, siteId, pos);
+    if (f.error) return f;
     if (!nearTile(pos, f.x, f.y)) return { error: 'tooFar' };
     if (f.left <= 0) return { error: 'empty' };
     const x = m.expedition, mine = pack(x, crewId);
     if (mine.length >= capacity(m, crewId)) return { error: 'full' };
     const item = itemFor(m, f, D.FINDS[f.kind].loads[f.ring] - f.left, a.crew.role);
     x.carried[crewId] = mine.concat([item]);
-    x.sites[findId] = f.left - 1;
+    x.sites[siteId] = f.left - 1;
     const st = statsOf(x, crewId);
     st.finds[f.kind] = (st.finds[f.kind] || 0) + 1;
     return { ok: true, item, left: f.left - 1 };
@@ -324,9 +355,158 @@
     return okPos(w) ? { x: w.x, y: w.y } : null;
   }
 
+  // ---------- points of interest (spec §3.6, §3.7, M4c) ----------
+  // The first crew member to see a landmark's centre discovers it: every screen shows its card (in co-op the server sends
+  // a `discover` event) and they bank a one-time reward, 80–150 science by the landmark (the Scientist half again). Seeing
+  // is the game's call, from its fog; the rules check the centre was within SIGHT tiles, the widest view anyone has (the
+  // rover's, on a star dune's crest) plus the slack. Weather and walking only shrink a view, so no real sighting is refused.
+  const SIGHT = D.DANGERS.view.rover + D.DANGERS.view.crest + X.reach;
+  function discover(m, crewId, landmarkId, pos) {
+    const a = able(m, crewId);
+    if (a.error) return a;
+    if (!okPos(pos)) return { error: 'badPos' };
+    const g = idNums(LID, landmarkId);
+    if (!g) return { error: 'noLandmark' };
+    if (!inCell(pos, g[0], g[1], D.LANDMARKS.cell)) return { error: 'tooFar' };
+    const l = W.landmarkAt(W.seedOf(m.seed), g[0], g[1]), x = m.expedition;
+    if (!l) return { error: 'noLandmark' };
+    if (x.landmarks[l.id]) return { error: 'known' };
+    if (!nearPx(pos, (l.x + 0.5) * T, (l.y + 0.5) * T, SIGHT)) return { error: 'tooFar' };
+    const [lo, hi] = D.LANDMARKS.science, base = lo + W.hash(W.seedOf(m.seed), l.i, l.j, 1300) % (hi - lo + 1);
+    const science = Math.round(base * (a.crew.role === 'scientist' ? D.SKILLS.scientist.scienceBonus : 1));
+    x.landmarks[l.id] = { by: crewId, round: m.turn };
+    E.bankItem(x.banked, crewId, { kind: 'landmark', res: 'science', amount: science, region: l.region }, false);
+    const st = statsOf(x, crewId);
+    st.landmarks = (st.landmarks || 0) + 1;
+    return { ok: true, landmark: l.id, science };
+  }
+
+  // Kestrel structures (spec §3.7): hold E at the door to open a supply cache, to salvage a wreck or a solar array, or to
+  // repair a weather station or a comms mast, once each (x.structures[id]). Their loads go into your backpack and what
+  // does not fit waits at the door as a drop, picked up like any other (C2). A repaired weather station reveals the fog
+  // round it, banks its science and forecasts the weather a round ahead for a few rounds (C1); a repaired mast marks what
+  // is near it on the minimap (mastMarks, C4). The game times the hold (holdSeconds). A hab pod has no hold: see refill.
+  const DONE = { cache: 'used', wreck: 'used', array: 'used', weather: 'repaired', mast: 'repaired' };
+  // What a structure holds, fixed by the mission code like a cargo pod's loads: a cache's 1–2 supplies, a wreck's 2–3
+  // metal loads and spare kit, an array's materials (a load of them weighs what a metal find's does).
+  function contents(m, s) {
+    const K = D.STRUCTURES.kinds[s.kind], seed = W.seedOf(m.seed), item = o => Object.assign({ kind: s.kind, id: s.id, region: s.region }, o);
+    const span = ([lo, hi], salt) => lo + W.hash(seed, s.i, s.j, salt) % (hi - lo + 1);
+    const loads = (n, o) => Array.from({ length: n }, (_, k) => item(typeof o === 'function' ? o(k) : o));
+    const metal = { res: 'materials', amount: D.FINDS.metal.kg };
+    if (s.kind === 'cache') return loads(span(K.loads, 1310), k => supply(W.hash(seed, s.i, s.j, 1320 + k)));
+    if (s.kind === 'wreck') return loads(span(K.metal, 1311), metal).concat(loads(K.spares, { res: 'spares', amount: 1 }));
+    if (s.kind === 'array') return loads(K.materials, metal);
+    return [];
+  }
+  // Reveals every tile whose middle is within r tiles of (cx, cy) (tile units) in x.revealed, stored as the game's fog is.
+  // Returns what changed ({ "<cx>,<cy>": base64 }) for the co-op server to share.
+  function revealAround(m, cx, cy, r) {
+    const diff = {}, C = W.CHUNK;
+    for (let ky = Math.floor((cy - r) / C); ky <= Math.floor((cy + r) / C); ky++) {
+      for (let kx = Math.floor((cx - r) / C); kx <= Math.floor((cx + r) / C); kx++) {
+        const bits = Fog.empty();
+        for (let ly = 0; ly < C; ly++) for (let lx = 0; lx < C; lx++) {
+          const dx = kx * C + lx + 0.5 - cx, dy = ky * C + ly + 0.5 - cy;
+          if (dx * dx + dy * dy <= r * r) Fog.set(bits, lx, ly);
+        }
+        if (Fog.count(bits)) diff[kx + ',' + ky] = Fog.encode(bits);
+      }
+    }
+    return Fog.mergeMap(m.expedition.revealed, diff);
+  }
+  function interact(m, crewId, structId, pos) {
+    const a = able(m, crewId);
+    if (a.error) return a;
+    if (!okPos(pos)) return { error: 'badPos' };
+    const g = idNums(SID, structId);
+    if (!g) return { error: 'noStructure' };
+    if (!inCell(pos, g[0], g[1], D.STRUCTURES.cell)) return { error: 'tooFar' };
+    const s = W.structureAt(W.seedOf(m.seed), g[0], g[1]), x = m.expedition;
+    if (!s) return { error: 'noStructure' };
+    if (!DONE[s.kind]) return { error: 'badKind' };
+    if (x.structures[s.id]) return { error: 'done' };
+    if (!nearTile(pos, s.x, s.y)) return { error: 'tooFar' };
+    const loads = contents(m, s), mine = pack(x, crewId), room = Math.max(0, capacity(m, crewId) - mine.length);
+    const items = loads.slice(0, room), rest = loads.slice(room);
+    x.carried[crewId] = mine.concat(items);
+    if (rest.length) {
+      x.drops.push({ id: s.id, x: (s.x + 0.5) * T, y: (s.y + 0.5) * T, items: rest });
+      while (x.drops.length > X.maxDrops) x.drops.shift();
+    }
+    x.structures[s.id] = DONE[s.kind];
+    let fog = {};
+    if (s.kind === 'weather') {
+      const K = D.STRUCTURES.kinds.weather, b = s.box;
+      fog = revealAround(m, (b[0] + b[2] + 1) / 2, (b[1] + b[3] + 1) / 2, K.reveal);
+      E.bankItem(x.banked, crewId, { kind: 'weather', res: 'science', amount: K.science, region: s.region }, false);
+      x.forecastUntil = m.turn + K.forecast; // this round and the next 3 (C1)
+    }
+    const st = statsOf(x, crewId);
+    st.structures = (st.structures || 0) + 1;
+    return { ok: true, done: x.structures[s.id], items, left: rest.length, fog };
+  }
+  // An abandoned hab pod is walked into, not used: inside it your suit is filled up, once per pod for each crew member each
+  // round (x.refills[crewId] holds the pods, C3; the advance clears it). Inside = in its footprint, with the slack every
+  // action gets (its footprint lies 3 tiles inside its cell, so the cell's guard never refuses you there).
+  function refill(m, crewId, podId, pos) {
+    const a = able(m, crewId);
+    if (a.error) return a;
+    if (!okPos(pos)) return { error: 'badPos' };
+    const g = idNums(SID, podId);
+    if (!g) return { error: 'noStructure' };
+    if (!inCell(pos, g[0], g[1], D.STRUCTURES.cell)) return { error: 'tooFar' };
+    const s = W.structureAt(W.seedOf(m.seed), g[0], g[1]), x = m.expedition;
+    if (!s) return { error: 'noStructure' };
+    if (s.kind !== 'pod') return { error: 'badKind' };
+    const b = s.box, r = X.reach, tx = pos.x / T, ty = pos.y / T;
+    if (tx < b[0] - r || tx >= b[2] + 1 + r || ty < b[1] - r || ty >= b[3] + 1 + r) return { error: 'tooFar' };
+    const had = Array.isArray(x.refills[crewId]) ? x.refills[crewId] : [];
+    if (had.includes(s.id)) return { error: 'refilled' };
+    x.refills[crewId] = had.concat([s.id]);
+    x.suits[crewId] = X.suit;
+    return { ok: true, suit: X.suit };
+  }
+  // The weather station's forecast: next round's weather while it runs (x.forecastUntil, a round), else null.
+  function forecastAhead(m) {
+    const x = m && m.expedition, next = m && m.schedule && m.schedule[m.turn + 1];
+    return x && next && m.turn <= x.forecastUntil ? next.weather : null;
+  }
+  // The comms masts' marks, read from the world, never stored (C4): for each repaired mast, the nearest landmark and every
+  // other structure whose door is within `marks` tiles of its own, once each: [{ id, x, y, kind }] in world tiles.
+  function nearestLandmark(seed, px, py) {
+    const C = D.LANDMARKS.cell, ci = Math.floor(px / C), cj = Math.floor(py / C);
+    const edge = Math.min(px - ci * C, (ci + 1) * C - px, py - cj * C, (cj + 1) * C - py);
+    let best = null, bd = Infinity;
+    // Ring r of cells round the mast's is at least (r − 1) cells plus `edge` away: stop once the best is nearer than that.
+    for (let r = 0; r < 8 && !(best && Math.sqrt(bd) <= (r - 1) * C + edge); r++) {
+      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
+        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
+        const l = W.landmarkAt(seed, i, j), d = l && (l.x - px) * (l.x - px) + (l.y - py) * (l.y - py);
+        if (l && d < bd) { best = l; bd = d; }
+      }
+    }
+    return best;
+  }
+  function mastMarks(m) {
+    const x = m.expedition, seed = W.seedOf(m.seed), r = D.STRUCTURES.kinds.mast.marks, out = [], seen = new Set();
+    const mark = k => { if (!seen.has(k.id)) { seen.add(k.id); out.push({ id: k.id, x: k.x, y: k.y, kind: k.kind }); } };
+    for (const id of Object.keys(x.structures)) {
+      const g = x.structures[id] === 'repaired' && idNums(SID, id), s = g && W.structureAt(seed, g[0], g[1]);
+      if (!s || s.kind !== 'mast') continue;
+      const l = nearestLandmark(seed, s.x, s.y);
+      if (l) mark(l);
+      for (const k of W.structuresNear(seed, s.x - r, s.y - r, s.x + r, s.y + r)) {
+        if (k.id !== s.id && (k.x - s.x) * (k.x - s.x) + (k.y - s.y) * (k.y - s.y) <= r * r) mark(k);
+      }
+    }
+    return out;
+  }
+
   return {
     findById, findsIn, cavesIn, landmarksIn, structuresIn, landmarkById, structureById, chunkAt, loadsLeft, holdSeconds, capacity, inBaseZone, suitOf, setSuit, itemFor, bay, roverLeft,
-    setRoverDriven, setWhere, whereOf, collect, deliver, useCanister, pickUp, collapse, revive, board, park,
+    setRoverDriven, setWhere, whereOf, collect, deliver, useCanister, pickUp, collapse, revive, board, park, discover,
+    interact, refill, forecastAhead, mastMarks,
     cacheSize: () => cache.size,
   };
 });
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: the Step 2 command, then `npm test`.
Expected: PASS; 419 tests. `lib/rooms.js` doesn't send the new actions yet (Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/dangers.js src/data.js src/engine.js src/expedition.js test/dangers.test.js test/engine.test.js test/expedition.test.js
git commit -m "feat(rules): discover landmarks, use the Kestrel structures, refill at hab pods; tubes and pods are cover" -m "Landmark and formation sites are collected like finds; the first to see a landmark's centre banks 80-150 science; caches, wrecks, arrays, weather stations and masts give their one-off rewards; a pod refills each crew member once a round. The view comes from the tile under you (tube headlamp, dune crest). A 3.4.0 save loads with the new state.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Co-op — the server checks the new actions and tells every tab

**Files:**
- Modify: `lib/rooms.js`
- Modify: `test/rooms.test.js`

**Interfaces:**
- Consumes: Task 5's actions through `Z.act`.
- Produces:
  - `EXPEDITION_ACTIONS` gains `discover`, `interact`, `refill`; each is checked against the last position the server received.
  - On a discovery the server fans out `event` `{ kind: 'discover', landmark, by: crewId, science }` to every tab (spec §5). The reward is banked once.
  - A repaired weather station's revealed fog goes to every tab as any fog does (`shareFog`).

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/test/rooms.test.js b/test/rooms.test.js
index 62f673a..a1e4d5c 100644
--- a/test/rooms.test.js
+++ b/test/rooms.test.js
@@ -287,10 +287,11 @@ test('during a mission nobody can take over a crew member who has died, but a li
 const F = require('../src/fog.js');
 const fogOf = cells => { const b = F.empty(); for (const [x, y] of cells) F.set(b, x, y); return F.encode(b); };
 const wait = ms => new Promise(r => setTimeout(r, ms));
-function inMission() {
+function inMission(seed) {
   const R = createRooms();
   const { room, player: host } = R.create('Host');
   const { player: guest } = R.join(room.code, 'Guest');
+  if (seed) say(R, room, host, 'settings', { seed }); // a mission code whose world the test knows
   say(R, room, host, 'claim', { crewId: 'lena' });
   say(R, room, guest, 'claim', { crewId: 'minh' });
   say(R, room, host, 'launch');
@@ -667,3 +668,59 @@ test("co-op: a new round forgets where everyone stood, so a seat last seen outsi
   assert.deepEqual(room.mission.expedition.flare.hit, [], 'the guest was out last round, not this one');
   assert.deepEqual(room.mission.expedition.incidents, [], 'so nobody is counted as hit');
 });
+
+// ---------- co-op points of interest (M4c) ----------
+// EXP-1's world: a giant crater L0,-1 centred on tile (134, −46), a weather station S3,0 with its door at (200, 12) and a
+// hab pod S0,-1 whose 5×5 footprint has its door at (32, −53).
+const events = (c, mark) => c.got.slice(mark).filter(m => m.type === 'event').map(m => m.data);
+
+test('co-op: a landmark is discovered once, from where the server last saw you, and every tab hears the discover event', () => {
+  const { R, room, host, guest, hc, gc } = inMission('EXP-1');
+  assert.equal(room.mission.seed, 'EXP-1');
+  R.position(room, guest, at(134 + 20, -46));
+  assert.equal(say(R, room, guest, 'discover', { landmark: 'L0,-1' }).body.error, 'tooFar', '20 tiles from its centre');
+  R.position(room, guest, at(134 + 10, -46));
+  const mark = hc.got.length, r = say(R, room, guest, 'discover', { landmark: 'L0,-1' });
+  assert.equal(r.status, 200);
+  assert.equal(r.body.landmark, 'L0,-1');
+  for (const c of [hc, gc]) assert.deepEqual(events(c, mark), [{ kind: 'discover', landmark: 'L0,-1', by: 'minh', science: r.body.science }], 'every tab shows the card, with its reward');
+  assert.deepEqual(frames(hc, mark).at(-1).data.mission.expedition.landmarks, { 'L0,-1': { by: 'minh', round: room.mission.turn } });
+  assert.equal(room.mission.expedition.banked.science, r.body.science);
+  R.position(room, host, at(134, -46 + 5));
+  const again = hc.got.length;
+  assert.equal(say(R, room, host, 'discover', { landmark: 'L0,-1' }).body.error, 'known', 'the reward is banked once');
+  assert.deepEqual(events(hc, again), []);
+  assert.equal(room.mission.expedition.banked.science, r.body.science);
+});
+
+test("co-op: a structure is used through the server from its door, and a weather station's fog reaches every tab", async () => {
+  const { R, room, guest, hc, gc } = inMission('EXP-1');
+  R.position(room, guest, at(200, 12 + 3));
+  assert.equal(say(R, room, guest, 'interact', { structure: 'S3,0' }).body.error, 'tooFar', 'three steps from its door');
+  R.position(room, guest, at(200, 12));
+  const mark = hc.got.length, r = say(R, room, guest, 'interact', { structure: 'S3,0' });
+  assert.equal(r.status, 200);
+  assert.equal(r.body.done, 'repaired');
+  assert.equal(frames(hc, mark).at(-1).data.mission.expedition.structures['S3,0'], 'repaired', 'everyone sees it repaired');
+  assert.ok(Object.keys(r.body.fog).length >= 4, 'it revealed the fog round it');
+  await wait(650);
+  for (const c of [hc, gc]) {
+    const fog = c.got.slice(mark).filter(m => m.type === 'fog');
+    assert.equal(fog.length, 1);
+    assert.deepEqual(fog[0].data, r.body.fog);
+  }
+  assert.equal(say(R, room, guest, 'interact', { structure: 'S3,0' }).body.error, 'done');
+});
+
+test('co-op: a hab pod refills a suit through the server from inside it, once a round for each crew member', () => {
+  const { R, room, host, guest, hc } = inMission('EXP-1');
+  R.position(room, guest, Object.assign(at(32, -53 + 3), { suit: 50 }));
+  assert.equal(say(R, room, guest, 'refill', { pod: 'S0,-1' }).body.error, 'tooFar', 'three steps out of its door');
+  R.position(room, guest, Object.assign(at(32, -55), { suit: 50 }));
+  const mark = hc.got.length, r = say(R, room, guest, 'refill', { pod: 'S0,-1' });
+  assert.deepEqual(r.body, { ok: true, suit: D.EXPEDITION.suit });
+  assert.deepEqual(frames(hc, mark).at(-1).data.mission.expedition.refills, { minh: ['S0,-1'] });
+  assert.equal(say(R, room, guest, 'refill', { pod: 'S0,-1' }).body.error, 'refilled');
+  R.position(room, host, at(31, -55));
+  assert.equal(say(R, room, host, 'refill', { pod: 'S0,-1' }).status, 200, 'a crewmate has their own');
+});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/rooms.test.js`
Expected: 3 of 46 fail: "co-op: a landmark is discovered once, from where the server last saw you, and every tab hears the discover event", "co-op: a structure is used through the server from its door, and a weather station's fog reaches every tab" and "co-op: a hab pod refills a suit through the server from inside it, once a round for each crew member".

- [ ] **Step 3: Send them through the server**

```diff
diff --git a/lib/rooms.js b/lib/rooms.js
index 99f0edc..671ed06 100644
--- a/lib/rooms.js
+++ b/lib/rooms.js
@@ -24,7 +24,7 @@ const MAX_COORD = 64000000; // world pixels either way of the HQ: the world is e
 const PLAN_KEYS = ['modulesOn', 'rations', 'habMode', 'choices', 'answered', 'drainWall', 'builds', 'scrap', 'request'];
 // The exploring actions a player may send; the rules' one table (Z.act) runs them. Not the solar flare's two: the server
 // times the flare itself.
-const EXPEDITION_ACTIONS = ['collect', 'deliver', 'canister', 'pickup', 'collapse', 'revive', 'board', 'park'];
+const EXPEDITION_ACTIONS = ['collect', 'deliver', 'canister', 'pickup', 'collapse', 'revive', 'board', 'park', 'discover', 'interact', 'refill'];
 
 const cleanName = (n, fallback) => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || fallback;
 const newId = () => crypto.randomBytes(8).toString('hex');
@@ -147,8 +147,12 @@ function createRooms(opts = {}) {
     if (!map || typeof map !== 'object' || Array.isArray(map)) return 'badFog';
     const diff = {};
     for (const k of Object.keys(map).slice(0, FOG_KEYS_PER_MESSAGE)) if (F.KEY.test(k)) diff[k] = map[k];
-    const changed = F.mergeMap(room.mission.expedition.revealed, diff, FOG_CHUNKS_MAX);
-    if (!Object.keys(changed).length) return null;
+    shareFog(room, F.mergeMap(room.mission.expedition.revealed, diff, FOG_CHUNKS_MAX));
+    return null;
+  }
+  // Fog the mission gained (a player's, or a repaired weather station's) goes to everyone, at most every 500 ms.
+  function shareFog(room, changed) {
+    if (!changed || !Object.keys(changed).length) return;
     Object.assign(room.fogPending, changed);
     if (!room.fogTimer) {
       room.fogTimer = setTimeout(() => {
@@ -159,7 +163,6 @@ function createRooms(opts = {}) {
       }, FOG_FANOUT_MS);
       if (room.fogTimer.unref) room.fogTimer.unref();
     }
-    return null;
   }
 
   // A mission ending or restarting drops any fog still waiting to go out.
@@ -437,6 +440,9 @@ function createRooms(opts = {}) {
       const r = Z.act(room.mission, player.crewId, body.type, body, room.positions[player.crewId]);
       if (r.error) return fail(400, r.error);
       broadcast(room);
+      // A discovery opens its card on every tab (spec §5, C6); a repaired weather station's fog goes out as any fog does.
+      if (body.type === 'discover') fanout(room, 'event', { kind: 'discover', landmark: r.landmark, by: player.crewId, science: r.science });
+      shareFog(room, r.fog);
       return { status: 200, body: r };
     }
     const err = apply(room, player, body);
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/rooms.test.js test/ws.test.js test/server.test.js`, then `npm test`.
Expected: PASS; 422 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/rooms.js test/rooms.test.js
git commit -m "feat(rooms): co-op discover, interact and refill, checked by the server" -m "Each is checked against the last position the server saw; a discovery is broadcast to every tab with its reward, and a weather station's fog reaches every tab.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The explorer bot uses the points of interest; the balance runs

**Files:**
- Modify: `tools/explorer.js`, `tools/balance.js`
- Modify: `test/explorer.test.js`

**Interfaces:**
- Consumes: Task 5's actions, `X.landmarksIn`/`X.structuresIn`.
- Produces: `haulRound(m, crewId, poi)`. Without `poi` the walk is M4b's, unchanged. With it, the pool also holds landmark and formation sites, structures not yet done (`interact`, held `X.holdSeconds`), undiscovered landmarks (walk until the centre is in view, then `discover`), and, when the next target's round trip no longer fits the suit, the nearest hab pod not used this round. It leaves comms masts. `tools/balance.js` gives every Thoughtful run `poi = true`; Careless and Sloppy explore as in M4b.

- [ ] **Step 1: Write the failing test**

```diff
diff --git a/test/explorer.test.js b/test/explorer.test.js
index 2caa055..126229e 100644
--- a/test/explorer.test.js
+++ b/test/explorer.test.js
@@ -92,3 +92,38 @@ test("in the rover the battery caps the haul, and it never grows", () => {
     assert.ok(mean(loads.slice(15)) <= mean(loads.slice(0, 5)), seed + ': ' + loads.join(' '));
   }
 });
+
+const W = require('../src/worldgen.js');
+// Plays 20 calm rounds with the explorer out every round, thoughtfully or not; returns the mission at the end, the loads
+// and the refills it took. The science of a discovery or a weather station is banked on the spot, not delivered as a load.
+function mission(seed, kit, poi) {
+  let s = E.createMission({ seed, loadout: kit, events: false, pilot: 'diego' }), loads = 0, refills = 0;
+  const delivered = () => s.expedition.banked.lines.filter(l => !l.late && l.kind !== 'landmark' && l.kind !== 'weather').reduce((n, l) => n + l.loads, 0);
+  while (s.status === 'active') {
+    const before = delivered(), got = haulRound(s, s.pilot, poi);
+    assert.equal(delivered() - before, got.loads, 'what it reports is what the real rules banked');
+    loads += got.loads;
+    refills += (s.expedition.refills.diego || []).length;
+    s = E.resolveTurn(s, E.defaultPlan(s)).state;
+  }
+  return { s, loads, refills };
+}
+
+test('played thoughtfully, the explorer also uses the points of interest near the base, and on foot a hab pod lets it haul more', () => {
+  const sites = x => Object.keys(x.sites).filter(id => /^[LF]/.test(id)).length;
+  let landmarks = 0;
+  for (const seed of ['FARM-1', 'FARM-3']) {
+    const plain = mission(seed, KIT, false), keen = mission(seed, KIT, true), x = keen.s.expedition;
+    assert.deepEqual([plain.s.expedition.structures, plain.s.expedition.landmarks, sites(plain.s.expedition), plain.refills], [{}, {}, 0, 0], seed + ': a careless explorer leaves them');
+    assert.ok(Object.values(x.structures).length >= 1 && Object.values(x.structures).every(v => v === 'used' || v === 'repaired'), seed + ': ' + JSON.stringify(x.structures));
+    assert.ok(sites(x) >= 1, seed + ': it collects the sites of landmarks and formations');
+    assert.ok(keen.refills >= 5, seed + ': ' + keen.refills + ' refills');
+    assert.ok(keen.loads > plain.loads, seed + ': ' + keen.loads + ' loads, careless ' + plain.loads);
+    landmarks += Object.keys(x.landmarks).length;
+  }
+  assert.ok(landmarks >= 1, 'it discovers the landmarks it comes near');
+  // BAL-2 has a comms mast 62 tiles from the base, nearer than most of what it uses.
+  const used = mission('BAL-2', KIT, true).s.expedition.structures;
+  const kinds = Object.keys(used).map(id => W.structureAt(W.seedOf('BAL-2'), ...id.slice(1).split(',').map(Number)).kind);
+  assert.ok(kinds.length >= 1 && !kinds.includes('mast'), 'it leaves the comms masts, it knows the map: ' + kinds);
+});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/explorer.test.js`
Expected: 1 of 5 fails: "played thoughtfully, the explorer also uses the points of interest near the base, and on foot a hab pod lets it haul more".

- [ ] **Step 3: Teach the bot**

```diff
diff --git a/tools/balance.js b/tools/balance.js
index 55e53a2..7f767de 100644
--- a/tools/balance.js
+++ b/tools/balance.js
@@ -1,6 +1,7 @@
 #!/usr/bin/env node
 // Plays many seeded missions with scripted strategies and prints success rates,
-// end causes and scores, each without and with exploring (tools/explorer.js).
+// end causes and scores, each without and with exploring (tools/explorer.js; the thoughtful player's explorer also
+// uses the points of interest).
 // Usage: node tools/balance.js [runs]   (LEVELS=commander to run one difficulty)
 'use strict';
 const E = require('../src/engine.js');
@@ -107,7 +108,7 @@ function play(loadoutName, planner, seed, explore, haul) {
   let s = E.createMission({ seed, loadout: LOADOUTS[loadoutName], difficulty: DIFF, pilot: explore ? EXPLORER : undefined });
   while (s.status === 'active') {
     if (explore) {
-      const got = haulRound(s, s.pilot);
+      const got = haulRound(s, s.pilot, planner === smartPlan);
       haul[s.turn] = haul[s.turn] || [0, 0];
       haul[s.turn][0] += got.loads;
       haul[s.turn][1] += 1;
diff --git a/tools/explorer.js b/tools/explorer.js
index 6dcf9c0..40ba037 100644
--- a/tools/explorer.js
+++ b/tools/explorer.js
@@ -8,9 +8,13 @@
  * The dangers (spec §3.4) cost it what they cost a player who ignores them: it never dodges a dust devil, so on foot it
  * pays the devils' average toll on its suit, and it never runs for cover, so a solar flare that ends while it is out
  * hits it (through the real rules in src/dangers.js).
+ * Played thoughtfully (`poi`), it also uses the points of interest near the base (spec §3.6, §3.7) as a thoughtful
+ * player would: it collects the landmarks' and formations' sites like finds, opens supply caches, salvages wrecks and
+ * solar arrays (picking up what did not fit), repairs weather stations, discovers a landmark once its centre is in view,
+ * and fills its suit at a hab pod when the next find would be out of reach. Comms masts it leaves: it knows the map.
  *
- * API: haulRound(mission, crewId) → { loads, seconds, flare: null | 'hit' | 'safe' } (call it before E.resolveTurn; it
- *      changes mission.expedition)
+ * API: haulRound(mission, crewId, poi) → { loads, seconds, flare: null | 'hit' | 'safe' } (call it before E.resolveTurn;
+ *      it changes mission.expedition). loads are what it delivered; seconds the suit it used.
  */
 const D = require('../src/data.js');
 const X = require('../src/expedition.js');
@@ -38,10 +42,37 @@ function findsNear(m) {
   known.set(m.seed, list);
   return list;
 }
+// The points of interest near the base, the same way (tile units): the sites of landmarks and formations, the structures
+// it uses, the hab pods (the middle of the floor) and the landmarks' centres.
+const knownPoi = new Map();
+function poiNear(m) {
+  let p = knownPoi.get(m.seed);
+  if (p) return p;
+  p = { sites: [], structures: [], pods: [], landmarks: [] };
+  const seen = new Set(), at = (k, kind, dy) => ({ id: k.id, x: k.x + 0.5, y: k.y + 0.5 + (dy || 0), kind });
+  for (let cy = -SPAN; cy < SPAN; cy++) for (let cx = -SPAN; cx < SPAN; cx++) {
+    for (const l of X.landmarksIn(m, cx, cy)) {
+      if (seen.has(l.id)) continue;
+      seen.add(l.id);
+      p.landmarks.push(at(l, 'landmark'));
+      l.sites.forEach((s, n) => p.sites.push(Object.assign(at(s, s.kind), { id: l.id + ':' + n, site: s })));
+    }
+    for (const s of X.structuresIn(m, cx, cy)) {
+      if (seen.has(s.id) || s.kind === 'mast') continue;
+      seen.add(s.id);
+      if (s.kind === 'pod') p.pods.push(at(s, 'pod', -2));
+      else p.structures.push(at(s, s.kind));
+    }
+    for (const f of X.chunkAt(m, cx, cy).formations) for (const s of f.sites) p.sites.push(Object.assign(at(s, s.kind), { id: f.id + ':0', site: s }));
+  }
+  if (knownPoi.size > 64) knownPoi.clear();
+  knownPoi.set(m.seed, p);
+  return p;
+}
 const px = p => ({ x: p.x * T, y: p.y * T });
 const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * DETOUR;
 
-function haulRound(m, crewId) {
+function haulRound(m, crewId, poi) {
   const c = m.crew.find(k => k.id === crewId);
   if (!c || c.status !== 'active' || m.status !== 'active') return { loads: 0, seconds: 0, flare: null };
   const x = m.expedition;
@@ -49,8 +80,8 @@ function haulRound(m, crewId) {
   const rover = !!bay && !!X.board(m, crewId, bay).ok;
   const speed = rover ? ROVER : FOOT, drain = rover ? D.EXPEDITION.drain.rover : 1;
   const toll = (m.schedule[m.turn].devil ? DEVIL_HITS.round : DEVIL_HITS.quiet) * D.DANGERS.devils.suit; // suit s a second on foot
-  const cap = X.capacity(m, crewId);
-  let suit = D.EXPEDITION.suit, here = HOME, loads = 0, carried = 0, clock = 0, flare = null;
+  const cap = X.capacity(m, crewId), view = Z.viewTiles(m, rover);
+  let suit = D.EXPEDITION.suit, used = 0, here = HOME, loads = 0, carried = 0, clock = 0, flare = null;
   const range = rover ? X.roverLeft(m) : Infinity;
   let battery = range;
   // What a leg of `dist` tiles and `hold` seconds of work costs the suit. Work is on foot, even from the rover.
@@ -64,29 +95,69 @@ function haulRound(m, crewId) {
       flare = Z.flareEnd(m, { [crewId]: px(at) }, 0, f.end).hit.length ? 'hit' : 'safe';
     }
     suit -= cost(dist, hold);
+    used += cost(dist, hold);
     battery -= dist;
     clock += travel + hold;
     here = to;
   }
-  // Loads left are read once a round and counted down here, so the nearest-find search stays cheap.
-  const pool = findsNear(m).map(f => ({ f, left: X.findById(m, f.id).left })).filter(p => p.left > 0);
+  // What it can do this round, with the loads left read once and counted down here, so the nearest search stays cheap:
+  // collect a find (or a site), use a structure, pick up what a structure left at its door, discover a landmark.
+  const pool = findsNear(m).map(f => ({ f, left: X.findById(m, f.id).left, use: 'collect' }));
+  const P = poi ? poiNear(m) : null;
+  if (P) {
+    for (const s of P.sites) pool.push({ f: s, left: X.loadsLeft(m, s.site, s.id), use: 'collect' });
+    for (const s of P.structures) if (!x.structures[s.id]) pool.push({ f: s, left: 1, use: 'interact' });
+    for (const l of P.landmarks) if (!x.landmarks[l.id]) pool.push({ f: l, left: 1, use: 'discover' });
+  }
+  // Where it acts: a landmark's centre only has to come into view.
+  const spot = p => {
+    if (p.use !== 'discover') return p.f;
+    const d = Math.hypot(p.f.x - here.x, p.f.y - here.y), k = d > view - 0.5 ? (view - 0.5) / d : 1;
+    return { x: p.f.x + (here.x - p.f.x) * k, y: p.f.y + (here.y - p.f.y) * k };
+  };
+  const holdOf = p => (p.use === 'discover' ? 0 : X.holdSeconds(p.use === 'pickup' ? 'pickup' : p.f.kind, c.role));
+  // A hab pod it can reach now, not used this round, and the way home from it in the battery (its suit will be full).
+  const podFor = () => {
+    let best = null, bestD = Infinity;
+    for (const k of P ? P.pods : []) {
+      const d = far(here, k);
+      if (d < bestD && !(x.refills[crewId] || []).includes(k.id) && cost(d, 0) <= suit && d + far(k, HOME) <= battery) { best = k; bestD = d; }
+    }
+    return best;
+  };
   const home = () => { if (carried) { X.deliver(m, crewId, px(HOME)); loads += carried; carried = 0; } };
   for (;;) {
-    let best = null, bestD = Infinity;
+    let best = null, bestD = Infinity, to = null;
     for (const p of pool) {
       if (p.left <= 0) continue;
-      const dd = far(here, p.f);
-      if (dd < bestD) { bestD = dd; best = p; }
+      const s = spot(p), dd = far(here, s);
+      if (dd < bestD) { bestD = dd; best = p; to = s; }
     }
     if (!best) break;
-    const hold = X.holdSeconds(best.f.kind, c.role);
-    const back = far(best.f, HOME);
-    if (cost(bestD + back, hold) > suit || bestD + back > battery) break;
+    const hold = holdOf(best);
+    const back = far(to, HOME);
+    if (cost(bestD + back, hold) > suit || bestD + back > battery) {
+      const pod = cost(bestD + back, hold) > suit && podFor(); // played thoughtfully, it fills its suit and goes on
+      if (!pod) break;
+      go(pod, 0);
+      if (!X.refill(m, crewId, pod.id, px(pod)).ok) break;
+      suit = D.EXPEDITION.suit;
+      continue;
+    }
     if (Z.flareDue(m) && !x.flare) Z.flareStart(m, clock); // the first step outside starts the flare's warning
-    go(best.f, hold);
-    if (!X.collect(m, crewId, best.f.id, px(best.f)).ok) break;
+    go(to, hold);
+    const at = px(to);
+    if (best.use === 'collect') {
+      if (!X.collect(m, crewId, best.f.id, at).ok) break;
+      carried++;
+    } else if (best.use === 'interact' || best.use === 'pickup') {
+      const r = best.use === 'interact' ? X.interact(m, crewId, best.f.id, at) : X.pickUp(m, crewId, best.f.id, at);
+      if (!r.ok) break;
+      carried += r.items.length;
+      if (r.left && best.use === 'pickup') best.left++;
+      else if (r.left) pool.push({ f: best.f, left: 1, use: 'pickup' }); // the drop's id is the structure's
+    } else if (!X.discover(m, crewId, best.f.id, at).ok) break;
     best.left--;
-    carried++;
     if (carried >= cap) { go(HOME, 0); home(); }
   }
   if (here !== HOME) go(HOME, 0);
@@ -97,7 +168,7 @@ function haulRound(m, crewId) {
     X.park(m, crewId, px(HOME));
   }
   x.suits[crewId] = Math.max(0, suit);
-  return { loads, seconds: D.EXPEDITION.suit - suit, flare };
+  return { loads, seconds: used, flare };
 }
 
-module.exports = { haulRound, findsNear, DEVIL_HITS };
+module.exports = { haulRound, findsNear, poiNear, DEVIL_HITS };
```

- [ ] **Step 4: Run the tests and the balance**

Run: `node --test test/explorer.test.js`, then `npm test` (expected 423), then `node tools/balance.js > balance-after.txt` (about 20 minutes; save it under `.superpowers/`).
Expected: PASS; 423 tests. The M4b targets hold: careless + explorer about 31 / 10 / 1 % (cadet / commander / veteran), thoughtful about 100 %; the dry run measured 31.1 / 9.7 / 1.2 % and a largest change in success of 1.0 point (see "Measured in the dry run").

- [ ] **Step 5: Commit**

```bash
git add tools/explorer.js tools/balance.js test/explorer.test.js
git commit -m "feat(explorer): a thoughtful player's explorer uses the points of interest" -m "It collects landmark and formation sites, opens and repairs structures, discovers landmarks in view and refills at a hab pod when the next trip no longer fits its suit. Careless and sloppy explore as in M4b, so their numbers measure the rules alone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Painting the points of interest on the surface and the maps

**Files:**
- Modify: `src/surface-paint.js`, `src/surface-world.js`, `src/surface-map.js`, `src/surface.js`
- Modify: `test/surface-map.test.js`, `test/surface-paint.test.js`, `test/surface-world.test.js`, `test/surface.test.js`

**Interfaces:**
- Consumes: Tasks 2–3's chunk fields, Task 4's sprites, Task 5's `X.mastMarks` and `m.expedition.structures` / `landmarks`.
- Produces:
  - The eight tiles' colours and patterns in `tileRGB` / `paintTile` / `paintRaised`; `SCARP` and `TUBE_WALL` raised (Ruling 10); decor props painted into the ground images (no per-frame cost; a rebuilt chunk is the same picture).
  - `SolPaint.scenery(chunks, { at, done })` → depth-sorted `{ art, id, opts, x, y, w, h, depth }` for structures (done from `done(id)`), the pod (its room while `at` is in its box), formations, the vent's puff; flat decals under every sprite.
  - `tubeAt(chunks, at, under)`; the tube's roof drawn on the canvas, hidden while you're inside; `drawDark(…, rad)` closes in from `S.eva.view(p)`'s radius.
  - `caveAt` leaves out `c.hidden.caves`.
  - `poiMarks(seed, x, masts)`: a discovered landmark is a gold `#f0c35a` diamond at its centre; a used or repaired structure a pale teal `#a9f4e4` square; a mast's mark a bold pale teal `?`, left out on what is marked already. With no `X.mastMarks` the maps show no `?`.

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/test/surface-map.test.js b/test/surface-map.test.js
index 25e3934..7404599 100644
--- a/test/surface-map.test.js
+++ b/test/surface-map.test.js
@@ -100,3 +100,36 @@ test("the legend's swatches are the colours the minimap paints for each region's
     assert.deepEqual(painted, rgb(legend.children[r].children[0].style.background), id + ': the swatch is the colour on the map');
   });
 });
+
+// ---------- the points of interest (M4c) ----------
+
+test("the maps mark the landmarks discovered, the structures used or repaired, and a mast's '?' on what is not marked already", () => {
+  const sandbox = { SolWorldgen: W, SolPaint: P, document: { createElement: element } };
+  vm.runInNewContext(SOURCE, sandbox);
+  const seed = W.seedOf('MAP-POI');
+  let l = null, s = null;
+  for (let j = -2; j < 2 && !l; j++) for (let i = -2; i < 2 && !l; i++) l = W.landmarkAt(seed, i, j);
+  for (let j = -3; j < 3 && !s; j++) for (let i = -3; i < 3 && !s; i++) s = W.structureAt(seed, i, j);
+  assert.ok(l && s, 'a landmark and a structure near the base');
+  const x = { landmarks: { [l.id]: { by: 'minh', round: 3 } }, structures: { [s.id]: 'repaired' } };
+  const masts = [{ id: l.id, x: l.x, y: l.y, kind: l.kind }, { id: 'S9,9', x: 600, y: 610, kind: 'cache' }];
+  const b = s.box;
+  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.SolMap.poiMarks(seed, x, masts))), [
+    { x: (l.x + 0.5) * 64, y: (l.y + 0.5) * 64, color: '#f0c35a', diamond: true, ring: '#120a0c' },
+    { x: (b[0] + b[2] + 1) * 32, y: (b[1] + b[3] + 1) * 32, color: '#a9f4e4', square: true },
+    { x: 600.5 * 64, y: 610.5 * 64, color: '#a9f4e4', text: '?' }, // the discovered landmark has its diamond, not a "?"
+  ]);
+  assert.deepEqual(sandbox.SolMap.poiMarks(seed, {}, undefined).length, 0, 'nothing before the rules have any');
+});
+
+test("the minimap draws a landmark's diamond and a mast's '?' where their marks are", () => {
+  const { map } = setup('MAP-DRAW');
+  const calls = [];
+  const ctx = new Proxy({}, { get(t, p) { if (p in t) return t[p]; return (...a) => { calls.push([p, ...a]); }; }, set(t, p, v) { t[p] = v; return true; } });
+  map.minimap.children[0].getContext = () => ctx;
+  // you at the HQ: the minimap's left edge is 80 tiles west of you, its top 80 tiles north (one CSS pixel a tile)
+  map.drawMini({ px: 0, py: 0, crew: [], marks: [{ x: 640, y: 0, color: '#f0c35a', diamond: true, ring: '#120a0c' }, { x: -640, y: 0, color: '#a9f4e4', text: '?' }] }, 1000);
+  const at = calls.findIndex(c => c[0] === 'moveTo' && c[1] === 90 && c[2] === 76);
+  assert.deepEqual(calls.slice(at, at + 6), [['moveTo', 90, 76], ['lineTo', 94, 80], ['lineTo', 90, 84], ['lineTo', 86, 80], ['closePath'], ['fill']]);
+  assert.ok(calls.some(c => c[0] === 'fillText' && c[1] === '?' && c[2] === 70 && c[3] === 80), 'the "?" 10 tiles west of you');
+});
diff --git a/test/surface-paint.test.js b/test/surface-paint.test.js
index 006c9f5..82fe739 100644
--- a/test/surface-paint.test.js
+++ b/test/surface-paint.test.js
@@ -145,6 +145,49 @@ test('an ice tile of the ground is painted with those cracks at its corner', ()
   assert.ok(at >= 0, 'the cracks were drawn at the ice tile');
 });
 
+// ---------- the points of interest's tiles (M4c) ----------
+
+const POI_TILES = ['SEDIMENT', 'SCARP', 'CREST', 'TUBE_FLOOR', 'TUBE_WALL', 'SKYLIGHT', 'STRUCT_FLOOR', 'STRUCT_WALL'];
+// Paints the image chunk (0, 0) of a fake world whose every tile is `code` in `region`, and returns its calls in order, each
+// fillRect with the fill style it was made in.
+function paintAll(code, region) {
+  const calls = [];
+  const ctx = new Proxy({}, {
+    get(t, p) { if (p in t) return t[p]; return (...a) => { calls.push(p === 'fillRect' ? [p, t.fillStyle, ...a] : [p, ...a]); }; },
+    set(t, p, v) { t[p] = v; return true; },
+  });
+  const world = { seed: 7, tile: () => code, region: () => region };
+  const p = P.createPainter(world, { canvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }), now: () => 0 });
+  p.retainView(0, 0, 255, 255);
+  p.work(-Infinity, 1); // the chunk in the middle only
+  return calls;
+}
+
+test("the points of interest's eight tiles have colours of their own: none of them falls back to the region's ground", () => {
+  const W = require('../src/worldgen.js');
+  const colours = new Set();
+  for (const k of POI_TILES) {
+    for (let r = 0; r < W.REGIONS.length; r++) assert.notDeepEqual(P.tileRGB(W.TILE[k], r), P.tileRGB(W.TILE.REGOLITH, r), `${k} in ${W.REGIONS[r]}`);
+    colours.add(String(P.tileRGB(W.TILE[k], 0)));
+  }
+  assert.equal(colours.size, POI_TILES.length, 'eight different colours');
+});
+
+test("an ice scarp and a lava tube's wall stand up as cliffs do, painted over the decor; the other six lie flat under it", () => {
+  const W = require('../src/worldgen.js');
+  for (const k of POI_TILES) {
+    const calls = paintAll(W.TILE[k], 0), fill = calls.findIndex(c => c[0] === 'fillRect'), decor = calls.findIndex(c => c[0] === 'clip');
+    assert.equal(fill > decor, k === 'SCARP' || k === 'TUBE_WALL', k);
+  }
+});
+
+test("a Kestrel structure's footprint is painted as its region's usual ground, for its sprite to stand on", () => {
+  const W = require('../src/worldgen.js');
+  const UNDER = [W.TILE.REGOLITH, W.TILE.DUNE, W.TILE.REGOLITH, W.TILE.REGOLITH, W.TILE.POLYGON, W.TILE.LAVA];
+  const ground = calls => calls.slice(0, calls.findIndex(c => c[0] === 'save')); // the tiles, before the decor
+  W.REGIONS.forEach((id, r) => assert.deepEqual(ground(paintAll(W.TILE.STRUCT_WALL, r)), ground(paintAll(UNDER[r], r)), id));
+});
+
 // ---------- the graphics level: chunk images painted at a scale (the Display settings) ----------
 
 // A painter whose canvases are kept, each with a recording 2D context: the tests see their size and what was drawn on them.
@@ -205,3 +248,88 @@ test('a painted chunk is hashed whole at any scale (the browser QA helper)', ()
   p.chunkHash(0, 0);
   assert.deepEqual(asked, [0, 0, 512, 512]);
 });
+
+// ---------- the points of interest over the ground (M4c) ----------
+
+// A data chunk holding only the points of interest given (the fields src/worldgen.js gives every chunk).
+const chunkWith = o => Object.assign({ structures: [], formations: [], landmarks: [], props: [] }, o);
+const nobody = { at: [1000, 1000], done: () => false };
+
+test('a Kestrel structure is drawn once, however many chunks list it: a square as wide as its footprint on its bottom edge, done once the rules say so', () => {
+  const wreck = { id: 'S1,2', kind: 'wreck', x: 11, y: 22, box: [10, 20, 12, 21] }; // 3×2, its door south of it
+  const chunks = [chunkWith({ structures: [wreck] }), chunkWith({ structures: [Object.assign({}, wreck)] })];
+  assert.deepEqual(P.scenery(chunks, nobody), [{ art: 'kestrel', id: 'wreck', opts: { done: false }, x: 10, y: 19, w: 3, h: 3, depth: 22 * 64 - 6 }]);
+  assert.deepEqual(P.scenery(chunks, { at: nobody.at, done: id => id === 'S1,2' })[0].opts, { done: true });
+});
+
+test('the hab pod is its room while you stand inside its box, sorted under whoever is in there; its roof otherwise', () => {
+  const pod = { id: 'S0,3', kind: 'pod', x: 2, y: 4, box: [0, 0, 4, 4] };
+  const at = (x, y) => P.scenery([chunkWith({ structures: [pod] })], { at: [x, y], done: () => true })[0];
+  assert.deepEqual([at(2, 2).opts, at(2, 2).depth], [{ inside: true }, 0], 'inside: under everyone in it');
+  assert.deepEqual([at(2, 4).opts, at(2, 4).depth], [{ inside: true }, 0], 'in its doorway');
+  assert.deepEqual([at(2, 5).opts, at(2, 5).depth], [{ inside: false }, 5 * 64 - 6], 'outside, at its door: a sprite like the others');
+});
+
+test('formations fill their square, sorted at its foot; the dust-devil tracks are a decal flat on the ground', () => {
+  const arch = { id: 'F0,0', kind: 'arch', x: 6, y: 8, box: [5, 5, 7, 7] }, tracks = { id: 'F1,0', kind: 'deviltracks', x: 41, y: 8, box: [40, 5, 42, 7] };
+  assert.deepEqual(P.scenery([chunkWith({ formations: [arch] }), chunkWith({ formations: [tracks] })], nobody), [
+    { art: 'formation', id: 'arch', opts: null, x: 5, y: 5, w: 3, h: 3, depth: 8 * 64 - 6 },
+    { art: 'formation', id: 'deviltracks', opts: null, x: 40, y: 5, w: 3, h: 3, depth: null },
+  ]);
+});
+
+test("the methane vent is a mound on its survey's tile, drawn once, with its puff rising from it", () => {
+  const vent = chunkWith({ landmarks: [{ id: 'L1,1', kind: 'methane', x: 300, y: 310, box: [296, 306, 304, 314] }] });
+  assert.deepEqual(P.scenery([vent, vent], nobody), [
+    { art: 'prop', id: 'vent', opts: null, depth: null, x: 299.5, y: 309, w: 2, h: 2 },
+    { art: 'puff', id: 'vent', opts: null, depth: 311 * 64 - 6, x: 299.5, y: 309, w: 2, h: 2 },
+  ]);
+});
+
+// A lava tube 29 tiles long, east–west, its skylight in its south wall (src/worldgen.js SHAPES.tube, a = 13, s = 4).
+const TUBE = { id: 'L2,1', kind: 'tube', x: 600, y: 310, skylight: [604, 312], box: [585, 307, 615, 313] };
+
+test("you are inside a lava tube when you stand on its floor or its skylight, in its box; not on the open ground round it", () => {
+  const W = require('../src/worldgen.js'), chunks = [chunkWith({ landmarks: [TUBE] })];
+  assert.equal(P.tubeAt(chunks, [600, 310], W.TILE.TUBE_FLOOR), TUBE);
+  assert.equal(P.tubeAt(chunks, [604, 312], W.TILE.SKYLIGHT), TUBE);
+  assert.equal(P.tubeAt(chunks, [604, 313], W.TILE.REGOLITH), null, 'the ring of open ground in its box');
+  assert.equal(P.tubeAt(chunks, [700, 310], W.TILE.TUBE_FLOOR), null, "another tube's floor");
+});
+
+test("a lava tube's roof covers its walls and floor with the skylight's pit on it while you are outside; inside, both hide", () => {
+  const chunks = [chunkWith({ landmarks: [TUBE] })];
+  assert.deepEqual(P.scenery(chunks, nobody), [
+    { art: 'roof', id: 'L2,1', opts: null, x: 586, y: 308, w: 29, h: 5, depth: 313 * 64 - 6 },
+    { art: 'prop', id: 'skylight', opts: null, x: 603.5, y: 311.5, w: 2, h: 2, depth: 313 * 64 - 5 },
+  ]);
+  assert.deepEqual(P.scenery(chunks, { at: [600, 310], done: () => false, tube: TUBE }), []);
+});
+
+test('inside a lava tube the dark closes in from the radius given: clear round your headlamp, nearly black at the radius and beyond', () => {
+  const calls = [], stops = [];
+  const ctx = new Proxy({}, {
+    get(t, p) {
+      if (p in t) return t[p];
+      if (p === 'createRadialGradient') return (...a) => { calls.push([p, ...a]); return { addColorStop: (k, c) => stops.push([k, c]) }; };
+      return (...a) => { calls.push([p, ...a]); };
+    },
+    set(t, p, v) { t[p] = v; return true; },
+  });
+  P.drawDark(ctx, 0, 0, 1280, 720, 640, 348, 512);
+  assert.deepEqual(calls, [['createRadialGradient', 640, 348, 512 * 0.3, 640, 348, 512], ['fillRect', 0, 0, 1280, 720]]);
+  assert.deepEqual(stops, [[0, 'rgba(5,3,4,0)'], [1, 'rgba(5,3,4,0.94)']]);
+});
+
+test("the world's decor props are painted into the ground: the flat ones with the decor, a rock standing up over it", () => {
+  const { ctx, calls } = recorder();
+  const props = [{ x: 1, y: 1, kind: 'pit' }, { x: 2, y: 2, kind: 'rock' }];
+  const world = { seed: 7, tile: () => 0, region: () => 0, get: (cx, cy) => chunkWith(cx === 0 && cy === 0 ? { props } : {}) };
+  const p = P.createPainter(world, { canvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }), now: () => 0 });
+  p.retainView(0, 0, 255, 255);
+  p.work(-Infinity, 1); // the chunk (0, 0) only
+  const clip = calls.findIndex(c => c[0] === 'clip'), restore = calls.findIndex(c => c[0] === 'restore');
+  const pit = calls.findIndex(c => c[0] === 'ellipse' && c[1] === 96 && c[2] === 96);
+  assert.ok(pit > clip && pit < restore, 'the pit, centred on its tile, with the decor');
+  assert.ok(calls.slice(restore).some(c => c[0] === 'ellipse'), 'the rock, after the decor (the ground here has nothing else that stands up)');
+});
diff --git a/test/surface-world.test.js b/test/surface-world.test.js
index f5a4ce2..8d7c916 100644
--- a/test/surface-world.test.js
+++ b/test/surface-world.test.js
@@ -105,6 +105,28 @@ test('walking is slower on dunes; everything else is normal speed', () => {
   assert.equal(w.speed(0, 0), 1);
 });
 
+test("a cave under a landmark or a structure has no mouth: caveAt leaves out the chunk's hidden caves", () => {
+  // Caves lie at the foot of walls, so few are under a footprint: look in the chunks under the landmarks round the base.
+  let name = null, hidden = null, open = null;
+  for (let s = 0; s < 40 && !(hidden && open); s++) {
+    const seed = W.seedOf('WORLD-CAVE-' + s);
+    hidden = open = null;
+    for (let j = -2; j < 2; j++) for (let i = -2; i < 2; i++) {
+      const b = (W.landmarkAt(seed, i, j) || {}).box;
+      if (!b) continue;
+      for (let cy = Math.floor(b[1] / 32); cy <= Math.floor(b[3] / 32); cy++) for (let cx = Math.floor(b[0] / 32); cx <= Math.floor(b[2] / 32); cx++) {
+        const c = W.chunk(seed, cx, cy);
+        for (const k of c.caves) if (c.hidden.caves.includes(k.n)) hidden = hidden || k; else open = open || k;
+      }
+    }
+    name = 'WORLD-CAVE-' + s;
+  }
+  assert.ok(hidden && open, 'a hidden cave and one in the open');
+  const w = SW.create(name);
+  assert.equal(w.caveAt(hidden.x, hidden.y), null, 'the hidden one');
+  assert.equal(w.caveAt(open.x, open.y).n, open.n, 'the one in the open');
+});
+
 test('fog: a circle is seen once, takeFog hands over only new chunks, and merging ORs', () => {
   const w = SW.create('WORLD-9');
   let expect = 0;
diff --git a/test/surface.test.js b/test/surface.test.js
index 175f4a4..beb948c 100644
--- a/test/surface.test.js
+++ b/test/surface.test.js
@@ -79,15 +79,16 @@ function element(tag) {
 // was last shown, then show it again: ui.js renders the same mission after a solo action, and a co-op room broadcasts a new copy
 // (a JSON copy here). sent: the positions teammates are sent; calls: the exploring actions asked for. Like ui.js, the page
 // is shown where its astronaut last stood (the solo save; `opts.lastPos` stands for the co-op server's position).
-// `opts.dpr` is the screen's pixel ratio (1); `opts.gfx` the Display settings the page passes to update (setGfx changes them).
+// `opts.dpr` is the screen's pixel ratio (1); `opts.gfx` the Display settings the page passes to update (setGfx changes them);
+// `opts.paint` replaces SolPaint functions (to see what is drawn), `opts.expedition` SolExpedition ones (rules not written yet).
 function page(m, me, opts) {
   const o = opts || {};
   let raf = null, clock = 0, cur = m, gfx = o.gfx, wobble = 7;
   const on = {}, sent = [], calls = [];
   const { painter, seen } = stubPainter(() => clock);
   const win = {
-    SolData: D, SolEngine: E, SolWorldgen: W, SolExpedition: X, SolDangers: Z, SolWorld: SW,
-    SolPaint: Object.assign({}, P, { createPainter: (world, popts) => { seen.scale = (popts && popts.scale) || 1; return painter; } }),
+    SolData: D, SolEngine: E, SolWorldgen: W, SolExpedition: Object.assign({}, X, o.expedition), SolDangers: Z, SolWorld: SW,
+    SolPaint: Object.assign({}, P, o.paint, { createPainter: (world, popts) => { seen.scale = (popts && popts.scale) || 1; return painter; } }),
     document: { createElement: element, createTextNode: text => ({ text }), querySelector: () => null, hidden: false },
     location: { search: '?debug=chunks' }, performance: { now: () => clock }, devicePixelRatio: o.dpr || 1, Image: function () {},
     matchMedia: () => ({ matches: false }),
@@ -663,3 +664,70 @@ test('the FPS readout is hidden unless Show FPS is on; then it reads "<n> FPS",
   on.setGfx({ showFps: 1 });
   assert.equal(chip.hidden, false, 'any true value shows it');
 });
+
+// ---------- the points of interest (M4c) ----------
+
+// The structure nearest the HQ that is not a hab pod.
+function structureNear(m) {
+  let s = null;
+  for (let cy = -3; cy <= 2; cy++) for (let cx = -3; cx <= 2; cx++) for (const k of X.structuresIn(m, cx, cy)) {
+    if (k.kind !== 'pod' && (!s || k.x * k.x + k.y * k.y < s.x * s.x + s.y * s.y)) s = k;
+  }
+  return s;
+}
+
+test('a Kestrel structure in view is drawn as the rules leave it: done once m.expedition.structures marks it', () => {
+  const m = mission({ seed: 'POI-1' }), s = structureNear(m);
+  assert.ok(s, 'a structure near the base');
+  const pg = page(m, 'minh');
+  pg.qa.teleport(s.x, s.y + 1); // just south of its door
+  pg.step(1);
+  const drawn = () => plain(pg.probe().pois).filter(i => i.art === 'kestrel' && i.x === s.box[0]).map(i => [i.id, i.opts]);
+  assert.deepEqual(drawn(), [[s.kind, { done: false }]]);
+  m.expedition.structures = Object.assign({}, m.expedition.structures, { [s.id]: 'used' });
+  pg.show(m);
+  pg.step(0.1);
+  assert.deepEqual(drawn(), [[s.kind, { done: true }]]);
+});
+
+test("in a lava tube its roof hides and the dark closes in round your headlamp, from your view's radius; outside, the roof is back", () => {
+  let found = null;
+  for (let s = 0; s < 80 && !found; s++) for (let j = -2; j < 2 && !found; j++) for (let i = -2; i < 2 && !found; i++) {
+    const l = W.landmarkAt(W.seedOf('TUBE-' + s), i, j);
+    if (l && l.kind === 'tube') found = { seed: 'TUBE-' + s, l };
+  }
+  assert.ok(found, 'a lava tube near a base');
+  const { seed, l } = found, darks = [];
+  const pg = page(mission({ seed }), 'minh', { paint: { drawDark: (...a) => darks.push(a.slice(5)) } });
+  const roof = () => plain(pg.probe().pois).filter(i => i.art === 'roof' && i.id === l.id).length;
+  pg.qa.teleport(l.x, l.y); // the middle of its floor
+  pg.step(1);
+  assert.equal(pg.probe().tube, l.id);
+  assert.equal(roof(), 0, 'no roof over you');
+  const [px, py, rad] = darks[darks.length - 1];
+  assert.deepEqual([px, py + 12, rad], [pg.probe().player.x, pg.probe().player.y, pg.probe().view * T], 'the dark round you, at your view');
+  pg.qa.teleport(l.skylight[0] + (l.vert ? 1 : 0), l.skylight[1] + (l.vert ? 0 : 1)); // out through the skylight
+  const before = darks.length;
+  pg.step(0.5);
+  assert.equal(pg.probe().tube, null);
+  assert.equal(roof(), 1, 'its roof covers it again');
+  assert.equal(darks.length, before, 'and the dark has gone');
+});
+
+test("the maps are given the points of interest's marks: a landmark once it is discovered, and the masts' '?' once the rules give them", () => {
+  const m = mission({ seed: 'POI-2' }), seed = W.seedOf(m.seed);
+  let l = null;
+  for (let j = -2; j < 2 && !l; j++) for (let i = -2; i < 2 && !l; i++) l = W.landmarkAt(seed, i, j);
+  assert.ok(l, 'a landmark near the base');
+  const poi = pg => plain(pg.probe().marks).filter(k => k.diamond || k.text);
+  const bare = page(m, 'minh'); // rules with no X.mastMarks yet
+  bare.step(0.1);
+  assert.deepEqual(poi(bare), [], 'nothing discovered, no masts');
+  m.expedition.landmarks = { [l.id]: { by: 'minh', round: 1 } };
+  bare.show(m);
+  bare.step(0.1);
+  assert.deepEqual(poi(bare).map(k => [k.x, k.y, k.diamond]), [[(l.x + 0.5) * T, (l.y + 0.5) * T, true]]);
+  const pg = page(m, 'minh', { expedition: { mastMarks: () => [{ id: 'S5,5', x: 330, y: 340, kind: 'wreck' }] } });
+  pg.step(0.1);
+  assert.deepEqual(poi(pg).map(k => k.text || 'diamond'), ['diamond', '?']);
+});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/surface-map.test.js test/surface-paint.test.js test/surface-world.test.js test/surface.test.js`
Expected: 17 of 64 fail, among them "the points of interest's eight tiles have colours of their own…", "an ice scarp and a lava tube's wall stand up as cliffs do…", "a cave under a landmark or a structure has no mouth…", "a Kestrel structure is drawn once, however many chunks list it…", "the hab pod is its room while you stand inside its box…", "a lava tube's roof covers its walls and floor…", "inside a lava tube the dark closes in from the radius given…" and "the maps mark the landmarks discovered, the structures used or repaired, and a mast's '?'…".

- [ ] **Step 3: Paint them**

```diff
diff --git a/src/surface-map.js b/src/surface-map.js
index f1104ba..3588491 100644
--- a/src/surface-map.js
+++ b/src/surface-map.js
@@ -6,12 +6,12 @@
  * API: SolMap.create({ t, onOpen, onClose }) → map
  *        map.attach(world, painter)          a new mission's world
  *        map.minimap · map.el                elements for the surface overlay
- *        map.drawMini(state, now)            state: { px, py, crew: [{ x, y, color, you }], marks: [{ x, y, color, square, ring }] }
- *                                            (world pixels; marks are finds, cave mouths, dropped loads and the parked rover)
+ *        map.drawMini(state, now)            state: { px, py, crew: [{ x, y, color, you }], marks: [{ x, y, color, square, diamond, text, ring }] }
+ *                                            (world pixels; marks are finds, cave mouths, dropped loads, the parked rover and poiMarks)
  *        map.open(state?) · map.close() · map.isOpen() · map.key(keyEvent) → used?
  *        map.frame(state, deadline)          every animation frame (does nothing while closed)
  *        map.relabel()                       after a language change
- *      SolMap.debugText(stats) → string
+ *      SolMap.debugText(stats) → string · SolMap.poiMarks(seed, expedition, masts) → the points of interest's marks
  */
 (function (root) {
   'use strict';
@@ -37,9 +37,20 @@
       for (const k of st.marks || []) {
         const [x, y] = at(k.x, k.y);
         g.fillStyle = k.color;
+        if (k.text) { // a comms mast's "?", edged in dark so it reads on any ground
+          g.font = '700 10px system-ui, sans-serif';
+          g.textAlign = 'center';
+          g.textBaseline = 'middle';
+          g.strokeStyle = '#120a0c';
+          g.lineWidth = 2.5;
+          g.strokeText(k.text, x, y);
+          g.fillText(k.text, x, y);
+          continue;
+        }
         if (k.square) g.fillRect(x - 2.5, y - 2.5, 5, 5);
+        else if (k.diamond) { g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath(); g.fill(); }
         else { g.beginPath(); g.arc(x, y, k.ring ? 2.5 : 2, 0, Math.PI * 2); g.fill(); }
-        if (k.ring) { g.strokeStyle = k.ring; g.lineWidth = 1; g.stroke(); } // a cave's mouth: dark, with a light rim
+        if (k.ring) { g.strokeStyle = k.ring; g.lineWidth = 1; g.stroke(); } // a cave's mouth: dark, with a light rim; a landmark's dark edge
       }
       const [bx, by] = at(T / 2, T / 2); // the HQ is tile (0, 0)
       g.fillStyle = '#f4e9df';
@@ -201,6 +212,25 @@
     };
   }
 
+  // The points of interest both maps mark (spec §2.6, §3.7), in world pixels: the landmarks the crew has discovered
+  // (x.landmarks, a gold diamond at its centre), the structures used or repaired (x.structures, a pale teal square on its
+  // footprint's teal), and the comms masts' "?" (`masts`: the rules' X.mastMarks(m), [{ id, x, y, kind }] in tiles) on
+  // what is not marked already. x is the mission's expedition, seed the world's.
+  const cellOf = id => id.slice(1).split(',').map(Number); // "L<i>,<j>" or "S<i>,<j>"
+  function poiMarks(seed, x, masts) {
+    const out = [], shown = new Set();
+    for (const id of Object.keys(x.landmarks || {})) {
+      const l = W.landmarkAt(seed, ...cellOf(id));
+      if (l) { shown.add(id); out.push({ x: (l.x + 0.5) * T, y: (l.y + 0.5) * T, color: '#f0c35a', diamond: true, ring: '#120a0c' }); }
+    }
+    for (const id of Object.keys(x.structures || {})) {
+      const s = W.structureAt(seed, ...cellOf(id)), b = s && s.box;
+      if (s) { shown.add(id); out.push({ x: (b[0] + b[2] + 1) / 2 * T, y: (b[1] + b[3] + 1) / 2 * T, color: '#a9f4e4', square: true }); }
+    }
+    for (const k of masts || []) if (!shown.has(k.id)) out.push({ x: (k.x + 0.5) * T, y: (k.y + 0.5) * T, color: '#a9f4e4', text: '?' });
+    return out;
+  }
+
   function debugText(s) {
     return [
       'fps ' + s.fps,
@@ -211,5 +241,5 @@
     ].join('\n');
   }
 
-  root.SolMap = { create, debugText };
+  root.SolMap = { create, debugText, poiMarks };
 })(typeof self !== 'undefined' ? self : this);
diff --git a/src/surface-paint.js b/src/surface-paint.js
index 9634939..2bc4d22 100644
--- a/src/surface-paint.js
+++ b/src/surface-paint.js
@@ -8,6 +8,8 @@
  *
  * API: SolPaint.createPainter(world, { canvas, cap, now, scale }) → painter · SolPaint.drawFog(...) · SolPaint.decorFor(...)
  *      SolPaint.tileRGB(code, region) · SolPaint.REGION_COLORS · SolPaint.sprites
+ *      SolPaint.scenery(chunks, { at, done, tube }) → the points of interest's sprites and decals (see there)
+ *      SolPaint.tubeAt(chunks, at, under) → the lava tube you are inside, or null · SolPaint.drawDark(...): its headlamp's dark
  *      scale (default 1): the ground is painted at this many canvas pixels per world pixel, so each chunk image is scale·256 px
  *      square (the Display settings' Best level paints at 2); painter.setScale(s) changes it while playing.
  */
@@ -37,6 +39,17 @@
   CODE_RGB[TL.POLYGON] = [177, 156, 144];
   CODE_RGB[TL.LAVA] = [59, 45, 44];
   CODE_RGB[TL.BASE] = [128, 70, 45];
+  // The points of interest (M4c): a delta's pale layered sediment, an ice scarp's dusty top, a star dune's sunlit crest, a
+  // lava tube's basalt floor and walls and the sunlit floor under its skylight, a hab pod's deck, and a Kestrel structure's
+  // footprint in the programme's teal (the minimap's colour: the ground under its sprite is painted as the region's own).
+  CODE_RGB[TL.SEDIMENT] = [150, 102, 74];
+  CODE_RGB[TL.SCARP] = [176, 184, 188];
+  CODE_RGB[TL.CREST] = [122, 82, 61];
+  CODE_RGB[TL.TUBE_FLOOR] = [48, 37, 36];
+  CODE_RGB[TL.TUBE_WALL] = [74, 58, 55];
+  CODE_RGB[TL.SKYLIGHT] = [118, 82, 62];
+  CODE_RGB[TL.STRUCT_FLOOR] = [106, 100, 96];
+  CODE_RGB[TL.STRUCT_WALL] = [74, 151, 142];
   function tileRGB(code, region) {
     if (code === TL.REGOLITH || CODE_RGB[code] == null) return REGION_GROUND[region] || REGION_GROUND[0];
     return CODE_RGB[code];
@@ -47,7 +60,7 @@
   const channel = v => Math.min(255, Math.round(v));
   const css = (rgb, k) => 'rgb(' + channel(rgb[0] * k) + ',' + channel(rgb[1] * k) + ',' + channel(rgb[2] * k) + ')';
   const RAISED = new Uint8Array(32);
-  for (const k of ['CLIFF', 'RIM', 'CANYON_WALL']) RAISED[TL[k]] = 1;
+  for (const k of ['CLIFF', 'RIM', 'CANYON_WALL', 'SCARP', 'TUBE_WALL']) RAISED[TL[k]] = 1;
   // A gentle brightness drift across the ground. It comes from smooth noise, so tiles never show as a checkerboard.
   const shade = (world, tx, ty) => 0.96 + 0.08 * W.noise(world.seed, 920, tx, ty, 5);
 
@@ -58,12 +71,13 @@
     const reg = world.region(tx, ty);
     const h = W.hash(world.seed, tx, ty, 900);
     const X = tx * T, Y = ty * T;
-    // A boulder sits on its region's usual ground, drawn just like that ground (the rock goes on top in paintRaised).
-    const look = code === TL.BOULDER ? UNDER_BOULDER[reg] : code;
+    // A boulder sits on its region's usual ground, drawn just like that ground (the rock goes on top in paintRaised), and so
+    // does a Kestrel structure (the surface draws its sprite on top).
+    const look = code === TL.BOULDER || code === TL.STRUCT_WALL ? UNDER_BOULDER[reg] : code;
     g.fillStyle = css(tileRGB(look, reg), shade(world, tx, ty));
     g.fillRect(X, Y, T, T);
-    if (look === TL.DUNE) { // ripples across the wind; the ends line up with the next tile's, so they run on unbroken
-      g.strokeStyle = 'rgba(140,96,74,0.45)';
+    if (look === TL.DUNE || look === TL.CREST) { // ripples across the wind; the ends line up with the next tile's, so they run on unbroken
+      g.strokeStyle = look === TL.CREST ? 'rgba(92,60,46,0.35)' : 'rgba(140,96,74,0.45)'; // on the sunlit crest they lie in shade
       g.lineWidth = 2;
       for (let k = 0; k < 4; k++) { const y = Y + 8 + k * 16; g.beginPath(); g.moveTo(X, y); g.quadraticCurveTo(X + 32, y - 3 - ((h >>> (4 + k * 2)) & 3) * 2, X + T, y); g.stroke(); }
     } else if (look === TL.POLYGON) { // ground cracked into polygons by freezing and thawing
@@ -75,7 +89,7 @@
       g.strokeStyle = 'rgba(255,255,255,0.8)';
       g.lineWidth = 1.5;
       drawIceCracks(g, X, Y);
-    } else if (look === TL.LAVA) {
+    } else if (look === TL.LAVA || look === TL.TUBE_FLOOR) {
       g.fillStyle = 'rgba(20,14,14,0.5)';
       for (let k = 0; k < 6; k++) { const v = W.hash(world.seed, tx, ty, 901 + k); g.fillRect(X + (v % 60), Y + ((v >>> 8) % 60), 2 + ((v >>> 16) % 3), 2 + ((v >>> 20) % 3)); }
     } else if (code === TL.CANYON_FLOOR) {
@@ -85,6 +99,16 @@
     } else if (code === TL.CRATER_FLOOR) {
       g.fillStyle = 'rgba(30,10,6,0.12)';
       g.fillRect(X, Y, T, T);
+    } else if (code === TL.SEDIMENT) { // a delta's beds: pale bands that run on from tile to tile across the fan
+      g.fillStyle = 'rgba(236,196,156,0.16)';
+      g.fillRect(X, Y + 10, T, 3);
+      g.fillRect(X, Y + 30, T, 2);
+      g.fillRect(X, Y + 49, T, 3);
+    } else if (code === TL.STRUCT_FLOOR) { // a hab pod's deck: a plate a tile, split down the middle
+      g.strokeStyle = 'rgba(30,24,24,0.4)';
+      g.lineWidth = 2;
+      g.strokeRect(X + 1, Y + 1, T - 2, T - 2);
+      g.beginPath(); g.moveTo(X + T / 2, Y); g.lineTo(X + T / 2, Y + T); g.stroke();
     } else if (code === TL.BASE) { // compacted regolith with the build grid's dashed lines
       const B = W.BASE_RECT;
       g.strokeStyle = 'rgba(255,220,190,0.12)';
@@ -104,7 +128,7 @@
     }
   }
 
-  // Things that stand up (mesa cliffs, crater rims, canyon walls, boulders) go on top of the decor.
+  // Things that stand up (mesa cliffs, crater rims, canyon walls, ice scarps, lava tubes' walls, boulders) go on top of the decor.
   function paintRaised(g, world, tx, ty) {
     const code = world.tile(tx, ty);
     const X = tx * T, Y = ty * T;
@@ -122,7 +146,17 @@
           g.fillStyle = 'rgba(0,0,0,0.25)';
           g.fillRect(X, Y + T - 6, T, 6);
         }
-      } else {
+      } else if (code === TL.SCARP) { // a cliff of ice under a dusty top: a bright edge, its face clean blue ice with streaks
+        if (above) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(X, Y, T, 3); }
+        if (below) {
+          g.fillStyle = '#6f9fb8';
+          g.fillRect(X, Y + T - 30, T, 30);
+          g.fillStyle = 'rgba(235,250,255,0.35)';
+          for (const dx of [9, 30, 47]) g.fillRect(X + dx, Y + T - 28, 2, 20);
+          g.fillStyle = 'rgba(10,30,45,0.35)';
+          g.fillRect(X, Y + T - 6, T, 6);
+        }
+      } else { // a crater's rim, a canyon's wall, a lava tube's wall
         if (above) { g.fillStyle = code === TL.RIM ? 'rgba(255,214,170,0.22)' : 'rgba(255,214,170,0.12)'; g.fillRect(X, Y, T, 4); }
         if (below) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X, Y + T - 10, T, 10); }
       }
@@ -206,9 +240,20 @@
     }
   }
 
+  // The world's decor props (src/worldgen.js, M4c: whole tiles, the kinds above plus `rock`) on the tiles of image chunk
+  // (ix, iy) and the ring round it, whose flat ones can spill in. None without the world's data chunks (a fake world).
+  function propsNear(world, ix, iy) {
+    if (!world.get) return [];
+    const x0 = ix * IMG - 1, y0 = iy * IMG - 1, x1 = x0 + IMG + 1, y1 = y0 + IMG + 1, out = [];
+    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
+      for (const p of world.get(cx, cy).props) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(p);
+    }
+    return out;
+  }
+
   function paintChunk(world, ix, iy, canvas, scale) {
     const g = canvas.getContext('2d');
-    const tx0 = ix * IMG, ty0 = iy * IMG;
+    const tx0 = ix * IMG, ty0 = iy * IMG, props = propsNear(world, ix, iy);
     g.setTransform(scale, 0, 0, scale, -ix * PX * scale, -iy * PX * scale); // draw in world pixels, `scale` canvas pixels each
     for (let ty = ty0; ty < ty0 + IMG; ty++) for (let tx = tx0; tx < tx0 + IMG; tx++) paintTile(g, world, tx, ty);
     g.save();
@@ -216,8 +261,18 @@
     g.rect(ix * PX, iy * PX, PX, PX);
     g.clip();
     for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const d of decorFor(world, ix + dx, iy + dy)) drawDecor(g, d);
+    for (const p of props) {
+      if (p.kind === 'rock') continue;
+      const h = W.hash(world.seed, p.x, p.y, 912);
+      drawDecor(g, { kind: p.kind, x: p.x * T + T / 2, y: p.y * T + T / 2, s: 8 + ((h >>> 20) % 28), h });
+    }
     g.restore();
     for (let ty = ty0; ty < ty0 + IMG; ty++) for (let tx = tx0; tx < tx0 + IMG; tx++) paintRaised(g, world, tx, ty);
+    for (const p of props) { // a small rock stands up, as a boulder does; it stays inside its tile
+      if (p.kind !== 'rock' || p.x < tx0 || p.x >= tx0 + IMG || p.y < ty0 || p.y >= ty0 + IMG) continue;
+      const h = W.hash(world.seed, p.x, p.y, 912);
+      drawRock(g, { wx: p.x, wy: p.y, s: 0.4 + (h % 16) / 100, ox: ((h >>> 8) % 9) - 4, oy: ((h >>> 12) % 7) - 3 });
+    }
   }
 
   // ---------- the painter: image chunks and mini images, with their caches ----------
@@ -404,6 +459,73 @@
     ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
   }
 
+  // ---------- the points of interest (M4c) ----------
+  // What the surface draws over the ground for the points of interest in `chunks` (the data chunks round the view), each
+  // once: a landmark is listed by every chunk its box touches, a structure by every chunk its apron touches. An item is
+  // { art, id, opts, x, y, w, h, depth }: the SolArt drawing (kestrel, formation, prop, or 'puff', the vent's puff), the
+  // box it fills in tiles, and the world-pixel y it is sorted by among the sprites, or null for a decal flat on the
+  // ground, drawn under every sprite. o: { at: [tx, ty] the tile you stand on, done(id): that structure is used or repaired,
+  // tube: the lava tube you are inside (tubeAt), or none }.
+  const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
+  const feet = b => (b[3] + 1) * T - 6; // the bottom of a box's last row, where a module's feet are sorted too
+  // The lava tube you are inside: the one whose box holds the tile you stand on, when that tile (`under`) is its floor or
+  // its skylight. Its open ring and its walls are outside (the walls can't be stood on).
+  function tubeAt(chunks, at, under) {
+    if (under !== TL.TUBE_FLOOR && under !== TL.SKYLIGHT) return null;
+    for (const c of chunks) for (const l of c.landmarks) if (l.kind === 'tube' && inBox(l.box, at[0], at[1])) return l;
+    return null;
+  }
+  function scenery(chunks, o) {
+    const out = [], seen = new Set(), [ax, ay] = o.at;
+    const once = id => !seen.has(id) && !!seen.add(id);
+    for (const c of chunks) {
+      // A structure is a square as wide as its footprint, standing on the footprint's bottom edge. The hab pod is its room
+      // while you stand inside its box, sorted by its top edge so whoever is in there is drawn over it; its roof otherwise.
+      for (const s of c.structures) {
+        if (!once(s.id)) continue;
+        const b = s.box, w = b[2] - b[0] + 1, inside = s.kind === 'pod' && inBox(b, ax, ay);
+        const opts = s.kind === 'pod' ? { inside } : { done: !!o.done(s.id) };
+        out.push({ art: 'kestrel', id: s.kind, opts, x: b[0], y: b[3] + 1 - w, w, h: w, depth: inside ? b[1] * T : feet(b) });
+      }
+      // A formation fills its square; the dust-devil tracks are dark lanes on the ground.
+      for (const f of c.formations) {
+        const b = f.box, n = b[2] - b[0] + 1;
+        out.push({ art: 'formation', id: f.kind, opts: null, x: b[0], y: b[1], w: n, h: n, depth: f.kind === 'deviltracks' ? null : feet(b) });
+      }
+      // The methane vent is a low mound on its survey's tile, its puff rising from it. A lava tube's roof covers its walls and
+      // floor (its box but the open ring round it), with the skylight's pit on it, while you are outside; inside, both hide.
+      for (const l of c.landmarks) {
+        if (!once(l.id)) continue;
+        if (l.kind === 'methane') {
+          const at = { x: l.x - 0.5, y: l.y - 1, w: 2, h: 2 };
+          out.push(Object.assign({ art: 'prop', id: 'vent', opts: null, depth: null }, at));
+          out.push(Object.assign({ art: 'puff', id: 'vent', opts: null, depth: (l.y + 1) * T - 6 }, at));
+        } else if (l.kind === 'tube' && !(o.tube && o.tube.id === l.id)) {
+          const r = [l.box[0] + 1, l.box[1] + 1, l.box[2] - 1, l.box[3] - 1];
+          out.push({ art: 'roof', id: l.id, opts: null, x: r[0], y: r[1], w: r[2] - r[0] + 1, h: r[3] - r[1] + 1, depth: feet(r) });
+          out.push({ art: 'prop', id: 'skylight', opts: null, x: l.skylight[0] - 0.5, y: l.skylight[1] - 0.5, w: 2, h: 2, depth: feet(r) + 1 });
+        }
+      }
+    }
+    return out;
+  }
+  // A lava tube's roof (scenery's item: its box in tiles): a long ridge of basalt, lit along its top, its south face in shade.
+  function drawRoof(ctx, it) {
+    const X = it.x * T, Y = it.y * T, w = it.w * T, h = it.h * T;
+    ctx.fillStyle = 'rgba(0,0,0,0.28)'; roundRect(ctx, X - 2, Y + 10, w + 4, h, 18); ctx.fill(); // its shadow on the ground
+    ctx.fillStyle = '#4e3c39'; roundRect(ctx, X, Y, w, h, 16); ctx.fill();
+    ctx.fillStyle = '#35282a'; roundRect(ctx, X, Y + h - 24, w, 24, 10); ctx.fill(); // the south face
+    ctx.fillStyle = 'rgba(255,214,170,0.14)'; roundRect(ctx, X + 8, Y + 5, w - 16, 7, 3); ctx.fill(); // the lit top
+  }
+  // Inside a lava tube it is dark but for your headlamp: clear round you (px, py), nearly black from `rad` world pixels out.
+  function drawDark(ctx, x0, y0, x1, y1, px, py, rad) {
+    const g = ctx.createRadialGradient(px, py, rad * 0.3, px, py, rad);
+    g.addColorStop(0, 'rgba(5,3,4,0)');
+    g.addColorStop(1, 'rgba(5,3,4,0.94)');
+    ctx.fillStyle = g;
+    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
+  }
+
   // ---------- sprites (moved from surface.js) ----------
   function roundRect(ctx, x, y, w, h, r) {
     ctx.beginPath();
@@ -721,7 +843,7 @@
   }
 
   return {
-    IMG, PX, REGION_COLORS, tileRGB, decorFor, createPainter, drawFog,
-    sprites: { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks, drawFind, drawDrop, drawRing, drawSuitBar, drawDevil },
+    IMG, PX, REGION_COLORS, tileRGB, decorFor, createPainter, drawFog, drawDark, scenery, tubeAt,
+    sprites: { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks, drawFind, drawDrop, drawRing, drawSuitBar, drawDevil, drawRoof },
   };
 });
diff --git a/src/surface-world.js b/src/surface-world.js
index 09a0880..81d2fec 100644
--- a/src/surface-world.js
+++ b/src/surface-world.js
@@ -66,9 +66,11 @@
       const cx = chunkOf(tx), cy = chunkOf(ty);
       return W.regionOf(get(cx, cy), tx - cx * CH, ty - cy * CH);
     }
-    // The cave whose mouth is tile (tx, ty), or null (its wall is the tile north of it, in the same chunk).
+    // The cave whose mouth is tile (tx, ty), or null (its wall is the tile north of it, in the same chunk). A cave under a
+    // landmark or a structure (the chunk's `hidden`) is gone, so the painter draws no mouth there.
     function caveAt(tx, ty) {
-      for (const k of get(chunkOf(tx), chunkOf(ty)).caves) if (k.x === tx && k.y === ty) return k;
+      const c = get(chunkOf(tx), chunkOf(ty));
+      for (const k of c.caves) if (k.x === tx && k.y === ty && !c.hidden.caves.includes(k.n)) return k;
       return null;
     }
     // Base things the world doesn't know about (the HQ, the reactor, the lander, rocks on the build grid) block too.
diff --git a/src/surface.js b/src/surface.js
index 699be2f..edb6b9f 100644
--- a/src/surface.js
+++ b/src/surface.js
@@ -66,6 +66,29 @@
   }
   function ready(img) { return img && img.complete && img.naturalWidth > 0; }
 
+  // The points of interest in the live data chunks under the view, grown by 4 tiles for the sprites that stand up into it
+  // (src/surface-paint.js scenery). A structure is done once the rules mark it used or repaired (m.expedition.structures).
+  // S.tube is the lava tube you are inside, whose roof hides while the dark closes in round your headlamp.
+  function pointsOfInterest(x0, y0, x1, y1, m) {
+    const C = W.CHUNK * T, chunks = [], marked = (m.expedition && m.expedition.structures) || {};
+    for (let cy = Math.floor((y0 - 4 * T) / C); cy <= Math.floor((y1 + 4 * T) / C); cy++) {
+      for (let cx = Math.floor((x0 - 4 * T) / C); cx <= Math.floor((x1 + 4 * T) / C); cx++) { const c = S.world.peek(cx, cy); if (c) chunks.push(c); }
+    }
+    const at = [Math.floor(S.player.x / T), Math.floor(S.player.y / T)];
+    S.tube = P.tubeAt(chunks, at, S.world.tile(at[0], at[1]));
+    S.pois = P.scenery(chunks, { at, done: id => !!marked[id], tube: S.tube });
+    return S.pois;
+  }
+  // One point of interest's SolArt drawing, made into an image once per look and size (the vent's puff: a 3 s loop in 24
+  // steps); a lava tube's roof is drawn on the canvas.
+  function drawArt(ctx, it) {
+    if (it.art === 'roof') return P.sprites.drawRoof(ctx, it);
+    const o = it.opts || {}, step = it.art === 'puff' ? Math.floor(S.time / 3 * 24) % 24 : 0;
+    const k = it.art + '|' + it.id + '|' + (o.done ? 1 : 0) + (o.inside ? 1 : 0) + '|' + step + '|' + it.w;
+    if (!S.images[k]) S.images[k] = image(it.art === 'puff' ? A.ventPuff(step / 24, it.w * 128) : A[it.art](it.id, it.w * 128, it.opts));
+    if (ready(S.images[k])) ctx.drawImage(S.images[k], it.x * T, it.y * T, it.w * T, it.h * T);
+  }
+
   // ---------- world model ----------
   // A mission (by its code) gets its own world, painter and fog; reset() forces a fresh one for a new mission.
   function world() {
@@ -515,9 +538,17 @@
     if (!S.player) return { px: 0, py: 0, crew: [], marks: [] };
     return {
       px: S.player.x, py: S.player.y, crew: avatars().map(a => ({ x: a.x, y: a.y, color: a.color, you: !!a.you })),
-      marks: S.eva.marks(S.world, S.player.x, S.player.y),
+      marks: S.eva.marks(S.world, S.player.x, S.player.y).concat(poiMarks()),
     };
   }
+  // The maps' marks for the points of interest (src/surface-map.js poiMarks), made again only when what they show changes:
+  // the landmarks discovered, the structures used or repaired (a repaired mast adds "?" marks: X.mastMarks, when the rules have it).
+  function poiMarks() {
+    const m = S.data.mission, x = m.expedition || {}, X = root.SolExpedition;
+    const key = m.seed + '|' + Object.keys(x.landmarks || {}).join() + '|' + JSON.stringify(x.structures || {});
+    if (S.poiKey !== key) { S.poiKey = key; S.poiMarks = SM.poiMarks(S.world.seed, x, X && X.mastMarks ? X.mastMarks(m) : []); }
+    return S.poiMarks;
+  }
 
   function drawDebugText() {
     const tx = Math.floor(S.player.x / T), ty = Math.floor(S.player.y / T);
@@ -1017,6 +1048,9 @@
     const k = v.dpr * v.zoom;
     ctx.setTransform(k, 0, 0, k, -v.camX * k, -v.camY * k);
     S.painter.drawGround(ctx, x0, y0, x1, y1);
+    // the points of interest: their decals lie flat on the ground, under everything; the rest are sorted with the sprites
+    const pois = pointsOfInterest(x0, y0, x1, y1, m);
+    for (const it of pois) if (it.depth == null) drawArt(ctx, it);
     S.eva.drawZone(ctx, x0, y0, x1, y1, S.world);
 
     // buried ice at the base: the only cue for where the ice drill can go
@@ -1122,11 +1156,13 @@
         ctx.fillStyle = A.ROLE[c.role]; ctx.fillRect(fx, fy - 22, 10, 7);
       } });
     });
+    for (const it of pois) if (it.depth != null) sprites.push({ y: it.depth, draw: () => drawArt(ctx, it) });
     for (const s of S.eva.sprites(x0, y0, x1, y1, S.world, S.time)) sprites.push(s);
     sprites.sort((a, b) => a.y - b.y);
     for (const s of sprites) s.draw(ctx); // the exploring layer's sprites take the context; the others close over it
     // the fog over what you can't see, then the name tags (with teammates' suit bars) on top of it
     P.drawFog(ctx, S.world, x0, y0, x1, y1, p.x, p.y - 12, S.eva.view(p) * T);
+    if (S.tube) P.drawDark(ctx, x0, y0, x1, y1, p.x, p.y - 12, S.eva.view(p) * T); // inside a lava tube: your headlamp's light
     drawTags(ctx, S.tags);
     S.eva.drawOver(ctx);
     if (S.debug) drawChunkBorders(ctx, x0, y0, x1, y1);
@@ -1187,6 +1223,8 @@
       world: S.world && S.world.stats(), paint: S.painter && S.painter.stats(), seen: (x, y) => S.world.seen(x, y),
       eva: S.eva.state(), focusKey: S.focus && S.focus.key, view: S.eva.view(S.player), push: S.player.push ? Object.assign({}, S.player.push) : null,
       hint: !S.hint.hidden, alert: S.eva.alerting(), dust: S.particles.length, dustX: S.particles.map(q => q.x), dustY: S.particles.map(q => q.y),
+      pois: JSON.parse(JSON.stringify(S.pois || [])), tube: S.tube ? S.tube.id : null, // the last frame's points of interest
+      marks: JSON.parse(JSON.stringify(mapState().marks)), // what the maps mark
     };
   }
 
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: the Step 2 command, then `npm test`.
Expected: PASS; 440 tests.

- [ ] **Step 5: Look at it in the browser.** Serve on 5071 with a scratch `--data` folder, mission code `PAINT-QA-1` (all 20 kinds lie within 473 tiles of the HQ), `?debug=chunks`. Teleport to one of each kind and look: each reads at a glance, a used structure looks different from a fresh one, the scarp reads as a cliff, the tube is dark inside but for the headlamp. Compare with the dry run's sheet `.superpowers/sdd/m4c/paint-preview.png` if it is still there. Frame rate at Best: the dry run measured a median of 131.6 fps before and after.

- [ ] **Step 6: Commit**

```bash
git add src/surface-paint.js src/surface-world.js src/surface-map.js src/surface.js test/surface-map.test.js test/surface-paint.test.js test/surface-world.test.js test/surface.test.js
git commit -m "feat(surface): the points of interest drawn on the surface and the maps" -m "Eight new tiles, the structures as the rules leave them, the hab pod's room while you're inside, formations, decals, props and the vent's puff; a lava tube under its roof, dark inside but for your headlamp; the maps mark discovered landmarks, used structures and a mast's '?'. No cave mouth under a footprint.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The words — facts, sources, Kestrel logs and survey labels

**Files:**
- Modify: `src/i18n.js`
- Create: `test/i18n-poi.test.js`

**Interfaces:**
- Consumes: the canonical kinds; `D.LANDMARKS[kind].fact` / `D.FORMATIONS[kind].fact` hold a key stem such as `'lm.delta'`, `D.STRUCTURES[kind].log` one such as `'ks.cache'`.
- Produces (`SolI18n`):
  - `SOURCES` gains 13 entries; `LANDMARK_SOURCES` (6 landmark kinds → source key) and `FORMATION_SOURCES` (7 formation kinds → source key), both in the module's return.
  - Keys in English and Vietnamese: `lm.<id>.name`, `lm.<id>.fact`, `fm.<id>.name`, `fm.<id>.fact`, `ks.<id>.name`, `ks.<id>.log`, `ks.label`; `sci.crater`, `sci.arch`, `sci.yardang`, `sci.hoodoo`, `sci.balanced`, `sci.ventifact`, `sci.deviltracks` (`sci.layered` already exists). No string has a `{placeholder}`.
  - The texts are the verified ones of the research (sources on nasa.gov, jpl.nasa.gov, science.nasa.gov or Photojournal). Copy them exactly: the facts keep their apostrophes, quotes, diacritics, `O₂` and number formats (`5,000` / `5.000`).

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/test/i18n-poi.test.js b/test/i18n-poi.test.js
new file mode 100644
index 0000000..4e3b682
--- /dev/null
+++ b/test/i18n-poi.test.js
@@ -0,0 +1,85 @@
+'use strict';
+const test = require('node:test');
+const assert = require('node:assert/strict');
+const I = require('../src/i18n.js');
+const D = require('../src/data.js');
+
+const LM = Object.keys(D.LANDMARKS.kinds);
+const FM = Object.keys(D.FORMATIONS.kinds);
+
+test('every landmark and formation kind maps to a source, and each source has a label and a NASA/JPL url', () => {
+  assert.deepEqual(Object.keys(I.LANDMARK_SOURCES).sort(), [...LM].sort());
+  assert.deepEqual(Object.keys(I.FORMATION_SOURCES).sort(), [...FM].sort());
+  for (const key of [...Object.values(I.LANDMARK_SOURCES), ...Object.values(I.FORMATION_SOURCES)]) {
+    const s = I.SOURCES[key];
+    assert.ok(s, key + ' is in SOURCES');
+    assert.match(s.label, /\S/, key + ' has a label');
+    assert.match(s.url, /^https:\/\/(science|www\.jpl)\.nasa\.gov\//, key + ' has a NASA url');
+  }
+});
+
+test('the 13 new sources are all different from the region ones and from each other', () => {
+  const keys = [...Object.values(I.LANDMARK_SOURCES), ...Object.values(I.FORMATION_SOURCES)];
+  assert.equal(new Set(keys).size, 13);
+  for (const key of keys) assert.ok(!Object.values(I.REGION_SOURCES).includes(key), key + ' is not a region source');
+});
+
+test('every landmark and formation has a name and a fact in English and Vietnamese', () => {
+  for (const [pre, kinds] of [['lm', LM], ['fm', FM]]) {
+    for (const id of kinds) {
+      for (const lang of ['en', 'vi']) {
+        for (const part of ['name', 'fact']) {
+          const v = I.STR[lang][`${pre}.${id}.${part}`];
+          assert.ok(typeof v === 'string' && v.length > 0, `${pre}.${id}.${part} (${lang})`);
+        }
+      }
+      assert.equal(D[pre === 'lm' ? 'LANDMARKS' : 'FORMATIONS'].kinds[id].fact, `${pre}.${id}`, 'the data names the key stem');
+    }
+  }
+});
+
+test('facts keep the exact text of sources.md: apostrophes, quotes, diacritics and number formats', () => {
+  const en = I.STR.en, vi = I.STR.vi;
+  assert.ok(en['lm.tube.fact'].startsWith("Like the flanks of Arsia Mons, where a lava tube's ceiling collapsed"));
+  assert.ok(en['fm.hoodoo.fact'].includes("NASA's Mars Reconnaissance Orbiter often sees river channels"));
+  assert.ok(en['fm.ventifact.fact'].includes('"'), 'the ventifact fact has straight double quotes');
+  assert.ok(en['fm.yardang.fact'].includes('5,000 km') && vi['fm.yardang.fact'].includes('5.000 km'));
+  assert.ok(en['fm.layered.fact'].includes('3.6 m') && vi['fm.layered.fact'].includes('3,6 m'));
+  assert.equal(vi['lm.delta.name'], 'Châu thổ sông cổ');
+  assert.equal(vi['fm.hoodoo.name'], 'Cột đá hoodoo');
+  assert.ok(vi['lm.stardune.fact'].startsWith('Cồn cát hình sao hình thành khi gió cuốn cát'));
+});
+
+test('every Kestrel structure has a name and a log in both languages, and the log label says it is fiction', () => {
+  for (const [kind, def] of Object.entries(D.STRUCTURES.kinds)) {
+    assert.equal(def.log, `ks.${kind}`, 'the data names the key stem');
+    for (const lang of ['en', 'vi']) {
+      for (const part of ['name', 'log']) {
+        const v = I.STR[lang][`ks.${kind}.${part}`];
+        assert.ok(typeof v === 'string' && v.length > 0, `ks.${kind}.${part} (${lang})`);
+      }
+      assert.match(I.STR[lang]['ks.' + kind + '.log'], /^Sol \d+\./, 'a log opens with its sol');
+    }
+  }
+  assert.equal(I.STR.en['ks.label'], 'Kestrel Survey log · story, fictional');
+  assert.equal(I.STR.vi['ks.label'], 'Nhật ký Khảo sát Kestrel · truyện hư cấu');
+});
+
+test('Kestrel logs keep their quotes, apostrophes and the subscript in O₂', () => {
+  assert.ok(I.STR.en['ks.cache.log'].includes('O₂ canisters') && I.STR.vi['ks.cache.log'].includes('bình O₂'));
+  assert.ok(I.STR.en['ks.cache.log'].includes('Kestrel Control: "Nice work.'));
+  assert.ok(I.STR.en['ks.array.log'].includes("'"), 'the array log has an apostrophe');
+  assert.ok(I.STR.en['ks.array.log'].includes('52 %') && I.STR.vi['ks.array.log'].includes('52 %'));
+});
+
+test('every survey subject the world can produce has a label in both languages', () => {
+  // worldgen: region science finds (SCIENCE_SUBS), a landmark's science site (its kind, 'vent' for the methane vent)
+  // and a formation's science site (its kind).
+  const subs = new Set(['delta', 'vent', 'meteorite', 'layered']);
+  for (const [kind, def] of Object.entries(D.LANDMARKS.kinds)) if (def.sites.includes('science')) subs.add(kind === 'methane' ? 'vent' : kind);
+  for (const kind of FM) subs.add(kind);
+  for (const lang of ['en', 'vi']) {
+    for (const sub of subs) assert.ok(I.STR[lang]['sci.' + sub], `sci.${sub} (${lang})`);
+  }
+  assert.ok(subs.has('crater') && subs.has('deviltracks'), 'the new subjects are among them');
+});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/i18n-poi.test.js`
Expected: 7 of 7 fail (no `LANDMARK_SOURCES`, no `lm.*` / `fm.*` / `ks.*` keys yet).

- [ ] **Step 3: Add the words**

```diff
diff --git a/src/i18n.js b/src/i18n.js
index 1b64b33..7bd0b4c 100644
--- a/src/i18n.js
+++ b/src/i18n.js
@@ -29,10 +29,26 @@
     valles: { label: 'NASA Science: Valles Marineris, the Grand Canyon of Mars', url: 'https://science.nasa.gov/resource/valles-marineris-the-grand-canyon-of-mars/' },
     iceMap: { label: "NASA JPL (2019): NASA's treasure map for water ice on Mars", url: 'https://www.jpl.nasa.gov/news/nasas-treasure-map-for-water-ice-on-mars' },
     skylights: { label: 'NASA JPL (2007): Seven possible cave skylights on Mars (PIA09929)', url: 'https://www.jpl.nasa.gov/images/pia09929-seven-possible-cave-skylights-on-mars/' },
+    wildcat: { label: "NASA JPL (2022): NASA's Perseverance rover investigates geologically rich Mars terrain", url: 'https://www.jpl.nasa.gov/news/nasas-perseverance-rover-investigates-geologically-rich-mars-terrain/' },
+    pitCrater: { label: 'NASA (2020): Pit craters and giant volcanoes (PIA24149)', url: 'https://science.nasa.gov/photojournal/pit-craters-and-giant-volcanoes/' },
+    centralPeak: { label: 'NASA (2011): Colorful central peak in an unnamed crater (PIA14890)', url: 'https://science.nasa.gov/photojournal/colorful-central-peak-in-an-unnamed-crater/' },
+    methane: { label: "NASA JPL (2021): First you see it, then you don't: scientists closer to explaining Mars methane mystery", url: 'https://www.jpl.nasa.gov/news/first-you-see-it-then-you-dont-scientists-closer-to-explaining-mars-methane-mystery/' },
+    iceScarps: { label: 'NASA JPL (2018): Steep slopes on Mars reveal structure of buried ice', url: 'https://www.jpl.nasa.gov/news/steep-slopes-on-mars-reveal-structure-of-buried-ice/' },
+    starDunes: { label: 'NASA (2017): Opposing dunes, opposing winds (PIA21934)', url: 'https://science.nasa.gov/photojournal/opposing-dunes-opposing-winds/' },
+    rockBridge: { label: 'NASA (2006): Narrow trough in Tartarus Colles (PIA09383)', url: 'https://science.nasa.gov/photojournal/narrow-trough-in-tartarus-colles/' },
+    yardangs: { label: 'NASA (2003): Medusae Fossae yardangs (PIA04464)', url: 'https://science.nasa.gov/photojournal/medusae-fossae-yardangs/' },
+    hoodoos: { label: 'NASA (2017): The hoodoos of Mars (PIA21883)', url: 'https://science.nasa.gov/photojournal/the-hoodoos-of-mars/' },
+    uprightBoulder: { label: 'NASA JPL (2014): An irregular, upright boulder on Mars (PIA18594)', url: 'https://www.jpl.nasa.gov/images/pia18594-an-irregular-upright-boulder-on-mars/' },
+    gatorBack: { label: "NASA (2022): Curiosity's 360-degree panorama of gator-back rocks on Greenheugh (PIA25176)", url: 'https://science.nasa.gov/photojournal/curiositys-360-degree-panorama-of-gator-back-rocks-on-greenheugh/' },
+    becquerel: { label: 'NASA (2008): Periodic layering in Becquerel Crater, Mars (PIA11443)', url: 'https://science.nasa.gov/photojournal/periodic-layering-in-becquerel-crater-mars/' },
+    devilTracks: { label: 'NASA (2008): Dust-devil tracks in southern Schiaparelli Basin (PIA10226)', url: 'https://science.nasa.gov/photojournal/dust-devil-tracks-in-southern-schiaparelli-basin/' },
   };
 
   // The real place each region of the endless map is modelled on (its fact cites this source).
   const REGION_SOURCES = { plains: 'jezero', dunes: 'bagnold', craters: 'dichotomy', canyons: 'valles', icy: 'iceMap', volcanic: 'skylights' };
+  // Likewise for the landmarks and formations (the id of the kind in src/data.js).
+  const LANDMARK_SOURCES = { delta: 'wildcat', tube: 'pitCrater', crater: 'centralPeak', methane: 'methane', scarp: 'iceScarps', stardune: 'starDunes' };
+  const FORMATION_SOURCES = { arch: 'rockBridge', yardang: 'yardangs', hoodoo: 'hoodoos', balanced: 'uprightBoulder', ventifact: 'gatorBack', layered: 'becquerel', deviltracks: 'devilTracks' };
 
   const en = {
     'app.name': 'SOL 500',
@@ -605,6 +621,13 @@
     'find.science': 'Science site',
     'sci.delta': 'old river delta',
     'sci.vent': 'methane vent',
+    'sci.crater': 'crater peak',
+    'sci.arch': 'rock arch',
+    'sci.yardang': 'yardang ridges',
+    'sci.hoodoo': 'hoodoos',
+    'sci.balanced': 'balanced rock',
+    'sci.ventifact': 'ventifacts',
+    'sci.deviltracks': 'dust-devil tracks',
     'sci.meteorite': 'meteorite',
     'sci.layered': 'layered rock',
     'haul.water': '+{n} kg water',
@@ -769,6 +792,45 @@
     'region.fact.canyons': 'Like Valles Marineris, the Grand Canyon of Mars: about 3,870 km long, up to 600 km across, and about 9.3 km deep at its deepest.',
     'region.fact.icy': 'Like Arcadia Planitia, where orbiters mapped water ice less than 30 cm under the ground. "You wouldn\'t need a backhoe to dig up this ice. You could use a shovel," said NASA scientist Sylvain Piqueux.',
     'region.fact.volcanic': "Like the slopes of the volcano Arsia Mons. NASA's Mars Odyssey spotted seven very dark holes there, about 100 to 225 m across, that may be skylights into caves.",
+    'lm.delta.name': 'Ancient river delta',
+    'lm.delta.fact': 'Like the delta in Jezero Crater, a fan that formed about 3.5 billion years ago where a river met a lake. There, in 2022, Perseverance made its most abundant organic detections yet, in a rock called Wildcat Ridge.',
+    'lm.tube.name': 'Lava tube',
+    'lm.tube.fact': "Like the flanks of Arsia Mons, where a lava tube's ceiling collapsed in one spot and made a pit about 50 m across. The tube below is likely at least that big, much bigger than similar caves on Earth.",
+    'lm.crater.name': 'Crater with a central peak',
+    'lm.crater.fact': 'On Mars, craters wider than about 7 km stop being simple bowls: the walls collapse inward and form a central peak. It brings up material from deep below the surface, a good place to look for ancient rocks.',
+    'lm.methane.name': 'Methane vent',
+    'lm.methane.fact': 'Like Gale Crater, where Curiosity has repeatedly detected methane just above the ground: under half a part per billion on average, with spikes of up to 20. Microbes can make methane, but so can rocks, water and heat.',
+    'lm.scarp.name': 'Exposed ice scarp',
+    'lm.scarp.fact': "Like the eight slopes where NASA's Mars Reconnaissance Orbiter found thick buried ice laid bare, some as steep as 55 degrees. The fairly pure ice, likely snow from long ago, lies under just 1–2 m of rock and dust.",
+    'lm.stardune.name': 'Giant star dune',
+    'lm.stardune.fact': "Star dunes form when the sand-moving wind comes from several directions at different times of day or year. NASA's Mars Reconnaissance Orbiter spotted some between dunes pointing in opposite directions, a sign the area seems to be gathering sand.",
+    'fm.arch.name': 'Rock arch',
+    'fm.arch.fact': "In Tartarus Colles, NASA's HiRISE camera saw what may be a natural bridge, 23 m wide, over a narrow trough. The trough likely formed as a lava tube whose roof mostly caved in, leaving only a small section standing.",
+    'fm.yardang.name': 'Yardang ridges',
+    'fm.yardang.fact': "Yardangs are ridges scoured out by windblown sand. They are a hallmark of the Medusae Fossae Formation, imaged by NASA's Mars Odyssey: a patchy pile of eroding sediments spanning over 5,000 km along Mars' equator.",
+    'fm.hoodoo.name': 'Hoodoos',
+    'fm.hoodoo.fact': "Hoodoos are tall columns protected by a strong cap rock. Mars has something similar: NASA's Mars Reconnaissance Orbiter often sees river channels perched above the land, because the sediment inside them was stronger than its surroundings.",
+    'fm.balanced.name': 'Balanced rock',
+    'fm.balanced.fact': "NASA's HiRISE camera saw an oblong boulder, about 6 m tall and 3.5 m wide, that tumbled about 500 m down a slope on Mars and came to rest standing upright. Its dotted trail suggests it couldn't roll straight.",
+    'fm.ventifact.name': 'Ventifacts',
+    'fm.ventifact.fact': 'Wind-sharpened rocks are called ventifacts. In the foothills of Mount Sharp, Curiosity met scaly "gator-back" ventifacts made of sandstone, the hardest rock it has found on Mars. Rocks like these chewed up its wheels earlier in the mission.',
+    'fm.layered.name': 'Layered outcrop',
+    'fm.layered.fact': "In Becquerel Crater, rock layers averaging 3.6 m thick come in bundles of about 10. That matches a known 10-to-one pattern in how the tilt of Mars' axis changes, suggesting the rhythm comes from cycles in the planet's tilt.",
+    'fm.deviltracks.name': 'Dust-devil tracks',
+    'fm.deviltracks.fact': 'In southern Schiaparelli Basin, dark tracks form where dust devils scour off a thin blanket of bright dust, exposing darker rock beneath. Martian dust devils can grow as big as tornadoes on Earth, with plumes up to 9 km high.',
+    'ks.cache.name': 'Supply cache',
+    'ks.cache.log': 'Sol 96. Cache placed and sealed: O₂ canisters, spare kits and food for the crew. The seal is holding; next check in 50 sols. Kestrel Control: "Nice work. The crew launches in 300 sols."',
+    'ks.wreck.name': 'Wrecked scout rover',
+    'ks.wreck.log': 'Sol 458. Driving to the nearest pod as ordered, but it is nearly dark at noon and my cameras can barely see. Slid down a dune and tipped onto my side: wheel 4 cracked, panels in the sand, battery 9 %. Route map for the crew saved; sending at the next relay pass.',
+    'ks.weather.name': 'Weather station',
+    'ks.weather.log': 'Sol 455. Dust in the air has tripled in 5 sols, and every station reports the same: a global dust storm is coming. All units: charge your batteries and get ready to sleep through it. Scouts: drive to the nearest pod and park.',
+    'ks.mast.name': 'Comms mast',
+    'ks.mast.log': 'Sol 512. Storm over. The relay satellite passes twice a sol again, but it is getting old: one pass in five is lost. The scouts have been silent since sol 458, but their last route maps reached me. Saved here for the crew, with the position of every Kestrel unit in range.',
+    'ks.pod.name': 'Abandoned hab pod',
+    'ks.pod.log': 'Sol 977. Last message from Kestrel Control before the relay satellite went quiet: "The crew is coming, but not in time for us. Keep the pod warm for them." O₂ tanks full, heater on minimum, door unlocked. Waiting.',
+    'ks.array.name': 'Dusty solar array',
+    'ks.array.log': "Sol 410. Output down to 52 % of a clean panel; no dust devil has passed this way since sol 322. Battery: 410 charge cycles, capacity down to 81 %. Kestrel Control reports that the crew's launch has slipped to the next window, 26 months later. Switching off everything but the heaters.",
+    'ks.label': 'Kestrel Survey log · story, fictional',
     'sf.interact': "Interact",
     'sf.sprint': "Sprint",
     'sf.you': "You",
@@ -1523,6 +1585,13 @@
     'find.science': 'Địa điểm khoa học',
     'sci.delta': 'châu thổ sông cổ',
     'sci.vent': 'lỗ thoát khí mê-tan',
+    'sci.crater': 'đỉnh trung tâm hố va chạm',
+    'sci.arch': 'vòm đá',
+    'sci.yardang': 'dải gờ yardang',
+    'sci.hoodoo': 'cột đá hoodoo',
+    'sci.balanced': 'tảng đá cân bằng',
+    'sci.ventifact': 'đá gió mài',
+    'sci.deviltracks': 'vệt lốc bụi',
     'sci.meteorite': 'thiên thạch',
     'sci.layered': 'đá phân lớp',
     'haul.water': '+{n} kg nước',
@@ -1687,6 +1756,45 @@
     'region.fact.canyons': 'Giống như Valles Marineris, "Grand Canyon của sao Hỏa": dài khoảng 3.870 km, rộng tới 600 km và sâu khoảng 9,3 km ở chỗ sâu nhất.',
     'region.fact.icy': 'Giống như đồng bằng Arcadia, nơi các tàu quỹ đạo phát hiện băng nước nằm dưới mặt đất chưa đến 30 cm. Nhà khoa học NASA Sylvain Piqueux nói: "Bạn không cần máy xúc để đào lớp băng này. Một cái xẻng là đủ."',
     'region.fact.volcanic': 'Giống như sườn núi lửa Arsia Mons. Tàu Mars Odyssey của NASA đã phát hiện ở đây bảy hố rất tối, rộng khoảng 100 đến 225 m, có thể là cửa sổ trời dẫn vào hang động.',
+    'lm.delta.name': 'Châu thổ sông cổ',
+    'lm.delta.fact': 'Giống như châu thổ trong hố Jezero, một dạng địa hình hình quạt hình thành khoảng 3,5 tỷ năm trước, nơi một con sông đổ vào hồ. Năm 2022, tàu Perseverance đã phát hiện lượng chất hữu cơ nhiều nhất từ đầu sứ mệnh tại đây, trong khối đá mang tên Wildcat Ridge.',
+    'lm.tube.name': 'Ống dung nham',
+    'lm.tube.fact': 'Giống như sườn núi lửa Arsia Mons, nơi trần của một ống dung nham sụp xuống ở một chỗ, tạo thành một hố rộng khoảng 50 m. Ống bên dưới có lẽ cũng rộng ít nhất chừng ấy, lớn hơn nhiều so với những hang tương tự trên Trái Đất.',
+    'lm.crater.name': 'Hố va chạm có đỉnh trung tâm',
+    'lm.crater.fact': 'Trên sao Hỏa, các hố va chạm rộng hơn khoảng 7 km không còn là những cái bát đơn giản: thành hố sụp vào trong và tạo nên một đỉnh ở giữa. Đỉnh này đưa vật chất từ sâu dưới bề mặt lên, nên là nơi thích hợp để tìm đá cổ.',
+    'lm.methane.name': 'Lỗ thoát khí mêtan',
+    'lm.methane.fact': 'Giống như hố Gale, nơi tàu Curiosity nhiều lần phát hiện khí mêtan ngay sát mặt đất: trung bình chưa đến nửa phần tỷ, có lúc vọt lên tới 20 phần tỷ. Vi sinh vật có thể tạo ra mêtan, nhưng đá, nước và nhiệt cũng có thể.',
+    'lm.scarp.name': 'Vách băng lộ thiên',
+    'lm.scarp.fact': 'Giống như tám sườn dốc nơi tàu Mars Reconnaissance Orbiter của NASA phát hiện những lớp băng dày bị chôn vùi nay lộ ra, có chỗ dốc tới 55 độ. Lớp băng khá tinh khiết này, có lẽ vốn là tuyết rơi từ rất lâu, chỉ nằm dưới 1–2 m đất đá và bụi.',
+    'lm.stardune.name': 'Cồn cát hình sao khổng lồ',
+    'lm.stardune.fact': 'Cồn cát hình sao hình thành khi gió cuốn cát thổi tới từ nhiều hướng, vào những thời điểm khác nhau trong ngày hoặc trong năm. Tàu Mars Reconnaissance Orbiter của NASA đã chụp được vài cồn như thế nằm giữa những cồn cát quay về hai hướng ngược nhau, dấu hiệu cho thấy cát dường như đang tích tụ ở vùng này.',
+    'fm.arch.name': 'Vòm đá',
+    'fm.arch.fact': 'Ở vùng Tartarus Colles, camera HiRISE của NASA đã chụp được một thứ có thể là cây cầu tự nhiên rộng 23 m, bắc qua một rãnh hẹp. Rãnh này có lẽ vốn là một ống dung nham mà phần mái đã sụp gần hết, chỉ còn sót lại một đoạn nhỏ.',
+    'fm.yardang.name': 'Dải gờ yardang',
+    'fm.yardang.fact': 'Yardang là những dải gờ hình thành khi cát bị gió cuốn bào mòn mặt đất. Chúng là nét đặc trưng của thành hệ Medusae Fossae, được tàu Mars Odyssey của NASA chụp lại: một khối trầm tích đang bị bào mòn, trải thành từng mảng dài hơn 5.000 km dọc xích đạo sao Hỏa.',
+    'fm.hoodoo.name': 'Cột đá hoodoo',
+    'fm.hoodoo.fact': 'Hoodoo là những cột đá cao được một lớp đá đỉnh cứng che chắn. Sao Hỏa cũng có thứ tương tự: tàu Mars Reconnaissance Orbiter của NASA thường thấy những lòng sông nhô cao hơn địa hình xung quanh, vì trầm tích bên trong chúng bền chắc hơn phần đất bao quanh.',
+    'fm.balanced.name': 'Tảng đá cân bằng',
+    'fm.balanced.fact': 'Camera HiRISE của NASA đã chụp được một tảng đá thuôn dài, cao khoảng 6 m và rộng 3,5 m, lăn khoảng 500 m xuống một sườn dốc trên sao Hỏa rồi dừng lại ở tư thế dựng đứng. Vệt lăn đứt quãng của nó gợi ý rằng nó không thể lăn thẳng.',
+    'fm.ventifact.name': 'Đá gió mài',
+    'fm.ventifact.fact': 'Những tảng đá bị gió mài sắc được gọi là ventifact. Ở vùng chân núi Sharp, tàu Curiosity đã gặp những ventifact bằng sa thạch, bề mặt sần như vảy nên được gọi là "lưng cá sấu", loại đá cứng nhất mà nó từng gặp trên sao Hỏa. Những tảng đá như thế từng làm nát bánh xe của nó trước đó trong sứ mệnh.',
+    'fm.layered.name': 'Vỉa đá phân lớp',
+    'fm.layered.fact': 'Ở hố Becquerel, các lớp đá dày trung bình 3,6 m xếp thành từng cụm khoảng 10 lớp. Tỉ lệ 10:1 này khớp với một quy luật đã biết trong sự thay đổi độ nghiêng trục quay của sao Hỏa, gợi ý rằng nhịp điệu của các lớp đá bắt nguồn từ những chu kỳ nghiêng của hành tinh.',
+    'fm.deviltracks.name': 'Vệt lốc bụi',
+    'fm.deviltracks.fact': 'Ở phía nam lòng chảo Schiaparelli, những vệt tối hình thành khi lốc bụi quét đi lớp bụi sáng mỏng phủ trên mặt đất, làm lộ ra lớp đá tối màu bên dưới. Lốc bụi trên sao Hỏa có thể lớn ngang những cơn lốc xoáy trên Trái Đất, với cột bụi cao tới 9 km.',
+    'ks.cache.name': 'Thùng tiếp tế',
+    'ks.cache.log': 'Sol 96. Đã đặt và niêm phong thùng tiếp tế: bình O₂, bộ phụ tùng và thực phẩm cho phi hành đoàn. Nắp vẫn kín; 50 sol nữa kiểm tra lại. Trung tâm điều khiển Kestrel: "Làm tốt lắm. Phi hành đoàn sẽ khởi hành sau 300 sol nữa."',
+    'ks.wreck.name': 'Xác xe tự hành trinh sát',
+    'ks.wreck.log': 'Sol 458. Đang chạy về khoang sinh hoạt gần nhất theo lệnh, nhưng giữa trưa mà trời gần như tối đen, camera hầu như không thấy gì. Trượt xuống một cồn cát và lật nghiêng: bánh số 4 nứt, tấm pin vùi trong cát, pin còn 9 %. Đã lưu bản đồ tuyến đường cho phi hành đoàn; sẽ gửi khi vệ tinh chuyển tiếp bay qua lần tới.',
+    'ks.weather.name': 'Trạm khí tượng',
+    'ks.weather.log': 'Sol 455. Lượng bụi trong không khí đã tăng gấp ba sau 5 sol, và trạm nào cũng báo như nhau: một cơn bão bụi toàn cầu đang kéo đến. Tất cả thiết bị: sạc đầy pin và chuẩn bị ngủ đông cho đến khi bão tan. Các xe trinh sát: chạy về khoang sinh hoạt gần nhất và đỗ lại.',
+    'ks.mast.name': 'Cột ăng-ten liên lạc',
+    'ks.mast.log': 'Sol 512. Bão đã tan. Vệ tinh chuyển tiếp lại bay qua hai lượt mỗi sol, nhưng nó đã cũ: cứ năm lượt thì mất một. Các xe trinh sát im lặng từ sol 458, nhưng bản đồ tuyến đường cuối cùng của chúng đã đến được đây. Đã lưu lại cho phi hành đoàn, cùng vị trí của mọi thiết bị Kestrel trong tầm phủ sóng.',
+    'ks.pod.name': 'Khoang sinh hoạt bỏ hoang',
+    'ks.pod.log': 'Sol 977. Tin nhắn cuối cùng từ Trung tâm điều khiển Kestrel trước khi vệ tinh chuyển tiếp im bặt: "Phi hành đoàn sẽ đến, nhưng không kịp gặp chúng ta. Hãy giữ ấm khoang cho họ." Bình chứa O₂ đầy, máy sưởi ở mức thấp nhất, cửa không khóa. Đang chờ.',
+    'ks.array.name': 'Dàn pin mặt trời phủ bụi',
+    'ks.array.log': 'Sol 410. Công suất chỉ còn 52 % so với khi tấm pin còn sạch; từ sol 322 đến nay chưa có cơn lốc bụi nào đi qua đây. Pin lưu trữ: 410 chu kỳ sạc, dung lượng còn 81 %. Trung tâm điều khiển Kestrel báo chuyến phóng của phi hành đoàn đã lùi sang cửa sổ phóng kế tiếp, muộn hơn 26 tháng. Tắt mọi hệ thống, chỉ giữ máy sưởi.',
+    'ks.label': 'Nhật ký Khảo sát Kestrel · truyện hư cấu',
     'sf.interact': "Tương tác",
     'sf.sprint': "Chạy",
     'sf.you': "Bạn",
@@ -1920,5 +2028,5 @@
     return (STR[lang] && STR[lang][key] != null) || en[key] != null;
   }
 
-  return { t, has, STR, SOURCES, REGION_SOURCES, NOTES, LANGS: ['en', 'vi'] };
+  return { t, has, STR, SOURCES, REGION_SOURCES, LANDMARK_SOURCES, FORMATION_SOURCES, NOTES, LANGS: ['en', 'vi'] };
 });
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/i18n-poi.test.js test/i18n.test.js`, then `npm test`.
Expected: PASS; 447 tests.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.js test/i18n-poi.test.js
git commit -m "feat(i18n): the landmarks', formations' and Kestrel structures' text, with sources, in English and Vietnamese" -m "Thirteen real facts with their NASA/JPL sources, six Kestrel Survey logs tagged as fiction, and the new survey labels.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Interacting — prompts, holds, cards, story logs, pod refills and the forecast chip

**Files:**
- Modify: `src/surface-eva.js`, `src/ui.js`, `src/net.js`, `src/style.css`, `src/i18n.js`, `lib/ws.js` (its event comment)
- Modify: `test/i18n.test.js`, `test/surface-eva.test.js`, `test/ui.test.js`
- Create: `test/net.test.js`

**Interfaces:**
- Consumes: Task 5's actions and `Z.viewAt`; Task 6's `discover` event; Task 8's "inside" and `S.eva.view`; Task 9's keys and source maps.
- Produces:
  - The surface's readers of `c.finds` / `c.caves` leave out `c.hidden`; `S.eva.view(p)` is `Z.viewAt(m, inRover, tile under you)`, and the dust devils fade at its edge.
  - The in-cover note and the flare's warnings name lava tubes and hab pods (`eva.inTube`, `eva.inPod`).
  - A focus kind `'kestrel'` (the base's modules already use `'structure'`): prompts `eva.open` / `eva.salvage` / `eva.repair` with the structure's name and `X.holdSeconds`; the hold sends `interact`; loads that don't fit wait at the door (`eva.atDoor`).
  - Walking into a pod sends `refill` once a round (Ruling 4); a landmark in view sends `discover` (Ruling 3); landmark and formation sites are offered as finds by their own ids, once each.
  - `store.card` (one card slot, Ruling 11) with `showCard(c)`; `connect(onRoom, onStatus, onPos, onFog, onEvent)` in `src/net.js` passes `discover` to `ui.js`, which opens the card on every tab and merges the discoverer's own answer with the event in either order.
  - The forecast chip while `X.forecastAhead(m)` returns a weather (Ruling 1), keeping the top bar one row at 1280 px.
  - Strings in English and Vietnamese: `eva.inTube`, `eva.inPod`, `eva.open`, `eva.salvage`, `eva.repair`, `eva.atDoor`, `eva.repairedWeather`, `eva.repairedMast`, `eva.refilled`, `eva.forecast`, `eva.forecastBy`, `eva.err.noStructure`, `eva.err.badKind`, `eva.err.done`, `eva.err.noLandmark`, `eva.err.known`, `eva.err.refilled`, `find.cache`, `find.wreck`, `find.weather`, `find.array`, `find.landmark`, `disc.new`, `disc.by`, `disc.formation`; the flare lines name the new cover.

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/test/i18n.test.js b/test/i18n.test.js
index 590c8a3..002c9d2 100644
--- a/test/i18n.test.js
+++ b/test/i18n.test.js
@@ -65,3 +65,41 @@ test('the Plains fact cites a page from after the landing and claims nothing tha
     assert.doesNotMatch(fact, /slav/i, lang + ': the meaning of the name is not on that page');
   }
 });
+
+// ---------- points of interest (M4c) ----------
+
+test("the flare's warnings name every cover out on the map, and each has its own in-cover note, in both languages", () => {
+  const cover = { en: ['cave', 'lava tube', 'hab pod', 'storm shelter'], vi: ['hang', 'ống dung nham', 'khoang sinh hoạt', 'hầm trú bão'] };
+  for (const lang of ['en', 'vi']) {
+    for (const k of ['eva.flare.run', 'eva.flare.warned']) for (const w of cover[lang]) assert.ok(I.STR[lang][k].includes(w), lang + ' ' + k + ': ' + w);
+    for (const k of ['eva.inCave', 'eva.inTube', 'eva.inPod']) assert.ok(I.STR[lang][k], lang + ' ' + k);
+  }
+});
+
+test("the Kestrel structures' prompts, notes and report lines have their strings in both languages", () => {
+  const keys = ['eva.open', 'eva.salvage', 'eva.repair', 'eva.atDoor', 'eva.repairedWeather', 'eva.repairedMast', 'eva.refilled', ...['cache', 'wreck', 'weather', 'array'].map(k => 'find.' + k)];
+  for (const lang of ['en', 'vi']) assert.deepEqual(keys.filter(k => !I.STR[lang][k]), [], 'missing in ' + lang);
+});
+
+test("every error the exploring rules can give has a string, so co-op never turns one into 'no answer from the server'", () => {
+  // src/ui.js passes a co-op error on only when eva.err.<code> exists (else 'net'): the surface must know 'known' and
+  // 'refilled' to stay quiet on them. The flare's own errors are solo play's, never sent to a server.
+  const fs = require('node:fs'), path = require('node:path');
+  const codes = [...new Set([...fs.readFileSync(path.join(__dirname, '..', 'src', 'expedition.js'), 'utf8').matchAll(/error: '(\w+)'/g)].map(g => g[1]))];
+  assert.ok(['noLandmark', 'known', 'noStructure', 'badKind', 'done', 'refilled'].every(c => codes.includes(c)), 'the points of interest\'s codes are read');
+  for (const lang of ['en', 'vi']) assert.deepEqual(codes.filter(c => !I.STR[lang]['eva.err.' + c]), [], 'missing in ' + lang);
+});
+
+test("the discovery and formation cards and a discovery's report line have their strings in both languages; the discovery names the finder", () => {
+  for (const lang of ['en', 'vi']) {
+    assert.deepEqual(['disc.new', 'disc.by', 'disc.formation', 'find.landmark'].filter(k => !I.STR[lang][k]), [], 'missing in ' + lang);
+    assert.match(I.STR[lang]['disc.by'], /\{name\}/, lang);
+  }
+});
+
+test("the weather station's forecast chip has its strings in both languages, naming the weather", () => {
+  for (const lang of ['en', 'vi']) {
+    assert.match(I.STR[lang]['eva.forecast'], /\{w\}/, lang);
+    assert.ok(I.STR[lang]['eva.forecastBy'], lang);
+  }
+});
diff --git a/test/net.test.js b/test/net.test.js
new file mode 100644
index 0000000..c1f0d7e
--- /dev/null
+++ b/test/net.test.js
@@ -0,0 +1,34 @@
+'use strict';
+// The co-op client (src/net.js) in a vm sandbox with a fake WebSocket: which handler each frame from the server reaches.
+const test = require('node:test');
+const assert = require('node:assert/strict');
+const fs = require('node:fs');
+const path = require('node:path');
+const vm = require('node:vm');
+
+const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'net.js'), 'utf8');
+// A tab with a saved seat, offline (fetch fails): its sockets are kept to feed frames to.
+function client() {
+  const sockets = [], saved = { 'sol500.lan': JSON.stringify({ code: 'ABCD', playerId: 'p1', token: 't' }) };
+  class WebSocket { constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); } close() {} send() {} }
+  const sandbox = {
+    WebSocket, URLSearchParams, setTimeout, clearTimeout, location: { protocol: 'http:', host: 'localhost:5073' },
+    sessionStorage: { getItem: k => saved[k] || null, setItem() {}, removeItem() {} }, fetch: () => Promise.reject(new Error('offline')),
+  };
+  vm.runInNewContext(SOURCE, sandbox);
+  return { N: sandbox.SolNet, sockets };
+}
+const frame = (sock, t, d) => sock.onmessage({ data: JSON.stringify({ t, d }) });
+const plain = v => JSON.parse(JSON.stringify(v));
+
+test("a discovery the server sends reaches the game's event handler; kicked and closed still end the seat, not the game", () => {
+  const { N, sockets } = client();
+  N.restore();
+  const events = [], status = [];
+  N.connect(() => {}, (s, k) => status.push([s, k]), () => {}, () => {}, d => events.push(d));
+  frame(sockets[0], 'event', { kind: 'discover', landmark: 'L0,1', by: 'diego' });
+  assert.deepEqual(plain(events), [{ kind: 'discover', landmark: 'L0,1', by: 'diego' }]);
+  frame(sockets[0], 'event', { kind: 'kicked' });
+  assert.deepEqual(status, [['gone', 'kicked']]);
+  assert.equal(events.length, 1, 'kicked is not a game event');
+});
diff --git a/test/surface-eva.test.js b/test/surface-eva.test.js
index c8ede6d..27ec95a 100644
--- a/test/surface-eva.test.js
+++ b/test/surface-eva.test.js
@@ -29,8 +29,9 @@ const ART = fs.readFileSync(path.join(__dirname, '..', 'src', 'art.js'), 'utf8')
 const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'surface-eva.js'), 'utf8');
 
 // A surface layer for a mission; hooks run the rules' one table on it (Z.act, as ui.js does in solo play and the server in
-// co-op) and record every call, every 2-second report and every dust-devil push. `clock.now` is the wall clock the layer
-// reads (co-op's round clock runs on it).
+// co-op) and record every call, every 2-second report, every card asked for and every dust-devil push. `clock.now` is the wall clock the layer
+// reads (co-op's round clock runs on it). `answer(type, payload)`, when it returns something, answers in the rules' place
+// (a server's refusal).
 function setup(opts) {
   const o = opts || {};
   const sandbox = { SolData: D, SolWorldgen: W, SolExpedition: X, SolDangers: Z, SolPaint: P, SolWorld: SW, document: { createElement: element } };
@@ -38,13 +39,14 @@ function setup(opts) {
   vm.runInNewContext(SOURCE, sandbox);
   const m = o.mission || E.createMission({ seed: 'EVA-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' });
   const me = o.me || 'minh';
-  const calls = [], home = [], reports = [], pushes = [], clock = { now: 0 }, player = { p: null };
+  const calls = [], home = [], reports = [], pushes = [], cards = [], clock = { now: 0 }, player = { p: null };
   const hooks = {
     exp: (type, payload, pos) => {
       calls.push({ type, payload, pos });
-      return Promise.resolve(Z.act(m, me, type, payload, pos));
+      return Promise.resolve((o.answer && o.answer(type, payload)) || Z.act(m, me, type, payload, pos));
     },
     suit: r => reports.push(JSON.parse(JSON.stringify(r))),
+    card: c => cards.push(JSON.parse(JSON.stringify(c))),
   };
   const eva = sandbox.SolEva.create({
     t: o.t || (k => k), hooks: () => hooks, crewName: id => id, player: () => player.p, home: () => home.push(1), drawRover: () => {},
@@ -53,7 +55,7 @@ function setup(opts) {
   const data = { mission: m, controlId: me, lang: 'en', clock: o.clock || null };
   eva.sync(data);
   const world = SW.create(m.seed);
-  return { eva, m, calls, home, data, world, reports, pushes, clock, player };
+  return { eva, m, calls, home, data, world, reports, pushes, cards, clock, player };
 }
 const outside = (tx, ty) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T, moving: false, sprinting: false, inRover: false });
 const tick = (s, p, secs, focus) => { for (let i = 0; i < secs * 10; i++) s.eva.step(0.1, p, s.world, 0, focus || null); };
@@ -587,3 +589,200 @@ test('taking over another astronaut mid-round picks up their suit; a new round r
   s.eva.sync({ mission: next, controlId: 'diego', lang: 'en' });
   assert.equal(s.eva.report().driven, 0, 'recharged overnight');
 });
+
+// ---------- points of interest (M4c) ----------
+// Seed PAINT-QA-1 has every kind of point of interest near the HQ (the painter's QA seed); EVA-POI has a find and a cave
+// under a footprint. Places are world tiles.
+const QA = { skylight: [-182, 441], crest: [393, 24], podIn: [291, -32], cache: [-25, 47], weather: [13, 48], mast: [-137, 105], array: [-40, -50] };
+const poiMission = o => E.createMission(Object.assign({ seed: 'PAINT-QA-1', loadout: E.referenceKit('commander', 4), events: false, pilot: 'minh' }, o));
+const quiet = m => { Object.assign(m.schedule[m.turn], { weather: 'clear', spe: false, devil: false }); return m; };
+const hold = (s, tx, ty) => s.world.get(SW.chunkOf(tx), SW.chunkOf(ty)); // the surface holds the chunk of that tile
+// The same surface with every chunk's `hidden` emptied: what the layer would show if it read the lists raw.
+const raw = world => ({ peek: (cx, cy) => { const c = world.peek(cx, cy); return c && Object.assign({}, c, { hidden: { finds: [], caves: [] } }); }, seen: world.seen, region: world.region });
+
+test('a find or a cave under a point of interest is never offered, drawn or marked on the map', () => {
+  const s = setup({ mission: quiet(poiMission({ seed: 'EVA-POI' })), t: say });
+  const W0 = W.seedOf('EVA-POI'), fc = W.chunk(W0, -2, 5), f = fc.finds[fc.hidden.finds[0]], kc = W.chunk(W0, 9, -10), k = kc.caves[kc.hidden.caves[0]];
+  for (const [x, y] of [[f.x, f.y], [k.x, k.y]]) { hold(s, x, y); s.world.reveal(x, y, 6); }
+  const p = outside(f.x, f.y);
+  assert.equal(s.eva.focusAt(p.x, p.y, p, raw(s.world)).id, '-2,5:' + f.n, 'read raw, the hidden find would be offered');
+  const focus = s.eva.focusAt(p.x, p.y, p, s.world);
+  assert.notEqual(focus && focus.id, '-2,5:' + f.n, 'it is not');
+  const box = [(f.x - 1) * T, (f.y - 1) * T, (f.x + 2) * T, (f.y + 2) * T];
+  s.player.p = p;
+  assert.equal(s.eva.sprites(...box, raw(s.world), 0).length - s.eva.sprites(...box, s.world, 0).length, 1, 'one sprite fewer: the hidden find');
+  const marks = (world, x, y) => { tick(s, NEAR(0, 1), 0.2); return s.eva.marks(world, x * T, y * T).filter(q => q.x === (f.x + 0.5) * T && q.y === (f.y + 0.5) * T || q.x === (k.x + 0.5) * T && q.y === (k.y + 0.5) * T).length; };
+  assert.equal(marks(raw(s.world), f.x, f.y), 1, 'read raw, the find would be marked');
+  assert.equal(marks(s.world, f.x, f.y), 0, 'it is not');
+  assert.equal(marks(raw(s.world), k.x, k.y), 1, 'read raw, the cave would be marked');
+  assert.equal(marks(s.world, k.x, k.y), 0, 'it is not');
+});
+
+test("the view is the headlamp's in a lava tube and the weather's plus 4 on a star dune's crest, also in a dust storm; the dust devils fade at its edge", () => {
+  const m = poiMission();
+  Object.assign(m.schedule[m.turn], { weather: 'global', devil: true });
+  const s = setup({ mission: m, t: say });
+  const at = ([x, y]) => outside(x, y), [sx, sy] = QA.skylight;
+  for (const [x, y] of [QA.skylight, QA.crest]) hold(s, x, y);
+  s.eva.step(0.1, at(QA.skylight), s.world, 0, null); // a frame: the layer now reads the chunks the surface holds
+  assert.equal(s.eva.view(at(QA.skylight)), D.DANGERS.view.clear, "under the tube's skylight: the headlamp, whatever the storm");
+  assert.equal(s.eva.view(Object.assign(at(QA.skylight), { inRover: true })), D.DANGERS.view.rover, "the rover's headlamps");
+  assert.equal(s.eva.view(at(QA.crest)), D.DANGERS.view.global + D.DANGERS.view.crest, "on the dune's crest: the storm's view and 4 more");
+  assert.equal(s.eva.view(at([sx, sy + 8])), D.DANGERS.view.global, 'out on open ground: the storm');
+  // A formed devil 5 to 8 tiles from the skylight: inside the headlamp's 8 tiles it is drawn; the storm's 3 would hide it.
+  const px = (sx + 0.5) * T, py = (sy + 0.5) * T;
+  let t = 30, d = null;
+  for (; t < 600 && !d; t += 0.5) d = Z.devils(m, px - 12 * T, py - 12 * T, px + 12 * T, py + 12 * T, t).find(k => k.a === 1 && Math.hypot(k.x - px, k.y - py) / T > 5 && Math.hypot(k.x - px, k.y - py) / T < 7.5);
+  assert.ok(d, 'a devil near the tube');
+  s.player.p = at(QA.skylight);
+  s.eva.qaClock(t - 0.5);
+  const devils = world => { s.eva.step(0, s.player.p, world, 0, null); return s.eva.sprites(d.x - T, d.y - T, d.x + T, d.y + T, world, 0).filter(q => q.y === d.y).length; };
+  assert.equal(devils(s.world), 1, "in the tube's headlamp: the devil is drawn");
+  assert.equal(devils({ peek: () => null, region: s.world.region }), 0, "on a surface that knows no tube there, the storm's view hides it");
+});
+
+test('in a lava tube or a hab pod out on the map, the note says you are in cover from a solar flare, in its own words', () => {
+  const s = setup({ mission: quiet(poiMission()), t: say });
+  for (const [x, y] of [QA.skylight, QA.podIn]) hold(s, x, y);
+  s.eva.step(0.1, outside(...QA.skylight), s.world, 0, null);
+  assert.equal(noteOf(s), 'eva.inTube');
+  s.eva.step(0.1, outside(...QA.podIn), s.world, 0, null);
+  assert.equal(noteOf(s), 'eva.inPod');
+  s.eva.step(0.1, outside(QA.podIn[0], QA.podIn[1] + 4), s.world, 0, null);
+  assert.equal(noteOf(s), '', 'out of the pod: no note');
+});
+
+// Standing on the door of a structure (world tiles), facing it: the focus the surface would get.
+const atDoor = (s, [x, y]) => { hold(s, x, y); const p = outside(x, y); return { p, focus: s.eva.focusAt(p.x, p.y - 8 - 34, p, s.world) }; };
+const role = (s, id) => s.m.crew.find(c => c.id === id).role;
+
+test("at a Kestrel structure's door, holding E opens, salvages or repairs it once: the prompt names it and its seconds, the loads go into the backpack, and its story log opens", async () => {
+  const s = setup({ mission: quiet(poiMission()), t: say });
+  const { p, focus } = atDoor(s, QA.cache);
+  assert.equal(focus.kind, 'kestrel');
+  assert.equal(focus.id, 'S-1,0');
+  assert.equal(s.eva.label(focus), 'eva.open ' + JSON.stringify({ what: 'ks.cache.name', s: '3' }));
+  assert.equal(s.eva.start(focus), true, 'E holds');
+  tick(s, p, X.holdSeconds('cache', role(s, 'minh')) + 0.2, focus);
+  await flush();
+  s.eva.step(0.1, p, s.world, 0, null); // the HUD shows the answer
+  assert.deepEqual(s.calls.filter(c => c.type === 'interact').map(c => plain(c.payload)), [{ structure: 'S-1,0' }]);
+  assert.equal(s.m.expedition.structures['S-1,0'], 'used');
+  const got = s.m.expedition.carried.minh;
+  assert.ok(got.length >= 1 && got.every(i => i.kind === 'cache'), 'its supplies are in the backpack');
+  assert.equal(noteOf(s), got.map(i => 'haul.' + i.res + ' ' + JSON.stringify({ n: i.amount })).join(' · '), 'and the note says what');
+  assert.deepEqual(s.cards, [{ type: 'log', id: 'S-1,0', kind: 'cache' }], 'its story log opens');
+  const again = s.eva.focusAt(p.x, p.y - 42, p, s.world);
+  assert.notEqual(again && again.kind, 'kestrel', 'a used cache has no prompt');
+});
+
+test('a structure says its own verb and seconds (the Engineer repairs faster); a repair says what it did; loads that do not fit wait at the door', async () => {
+  const s = setup({ mission: quiet(poiMission()), t: say });
+  const label = (id, at) => { s.eva.sync({ mission: s.m, controlId: id, lang: 'en' }); return s.eva.label(atDoor(s, at).focus); };
+  assert.equal(label('minh', QA.weather), 'eva.repair ' + JSON.stringify({ what: 'ks.weather.name', s: '6' }));
+  assert.equal(label('lena', QA.weather), 'eva.repair ' + JSON.stringify({ what: 'ks.weather.name', s: '3' }), "the Engineer's 3 s");
+  assert.equal(label('minh', QA.mast), 'eva.repair ' + JSON.stringify({ what: 'ks.mast.name', s: '6' }));
+  assert.equal(label('minh', QA.array), 'eva.salvage ' + JSON.stringify({ what: 'ks.array.name', s: '5' }));
+  const use = async at => {
+    const { p, focus } = atDoor(s, at);
+    s.eva.start(focus);
+    tick(s, p, 6.2, focus);
+    await flush();
+    s.eva.step(0.1, p, s.world, 0, null);
+    return noteOf(s);
+  };
+  assert.equal(await use(QA.weather), 'eva.repairedWeather ' + JSON.stringify({ n: 20 }));
+  assert.ok(Object.keys(s.m.expedition.revealed).length > 0, 'the fog round it is revealed');
+  assert.equal(await use(QA.mast), 'eva.repairedMast');
+  s.m.expedition.carried.minh = [{ kind: 'ice', res: 'water', amount: 40 }, { kind: 'ice', res: 'water', amount: 40 }]; // room for one more
+  assert.equal(await use(QA.array), 'haul.materials ' + JSON.stringify({ n: 40 }) + ' · eva.atDoor ' + JSON.stringify({ n: 1 }));
+  assert.deepEqual(s.m.expedition.drops.map(d => [d.id, d.items.length]), [['S-1,-1', 1]], 'the other load is a drop at the door');
+  assert.deepEqual(s.cards.map(c => c.kind), ['weather', 'mast', 'array'], 'each story log opens');
+});
+
+test("walking into a hab pod fills your suit once a round and opens its log; staying in, or coming back the same round, asks nothing more; a 'refilled' answer is not said", async () => {
+  const s = setup({ mission: quiet(poiMission()), t: say });
+  const [ix, iy] = QA.podIn, out = outside(ix, iy + 3), inside = outside(ix, iy); // its door, the gap in its south wall, is iy + 2
+  hold(s, ix, iy);
+  s.eva.qaSuit(50);
+  tick(s, outside(ix, iy + 4), 0.5);
+  const refills = () => s.calls.filter(c => c.type === 'refill');
+  assert.equal(refills().length, 0, 'outside the pod: nothing');
+  tick(s, inside, 0.1);
+  await flush();
+  tick(s, inside, 0.1);
+  assert.deepEqual(refills().map(c => plain(c.payload)), [{ pod: 'S4,-1' }]);
+  assert.ok(s.eva.state().suit > D.EXPEDITION.suit - 1, "the suit from the rules' answer");
+  assert.equal(noteOf(s), 'eva.refilled ' + JSON.stringify({ s: D.EXPEDITION.suit }));
+  assert.deepEqual(s.cards, [{ type: 'log', id: 'S4,-1', kind: 'pod' }], "the pod's story log");
+  tick(s, inside, 3);
+  tick(s, out, 0.5);
+  tick(s, inside, 3);
+  await flush();
+  assert.equal(refills().length, 1, 'once this round');
+  assert.equal(s.cards.length, 2, 'walking in again asks for the log again (ui.js shows it once a mission)');
+  assert.deepEqual(plain(await s.eva.act('refill', inside, { pod: 'S4,-1' })), { error: 'refilled' });
+  tick(s, inside, 0.1);
+  assert.doesNotMatch(noteOf(s), /eva\.err/, "and 'refilled' is not said");
+});
+
+test("a landmark is discovered when its centre comes into your view: asked once while the answer is out, its card opens with the reward, and it is never asked again", async () => {
+  const s = setup({ mission: quiet(poiMission()), t: say });
+  const [lx, ly] = [68, 462]; // the river delta L0,1's centre; clear weather: 8 tiles of view
+  hold(s, lx, ly);
+  tick(s, outside(lx, ly + 9), 1);
+  const asked = () => s.calls.filter(c => c.type === 'discover');
+  assert.equal(asked().length, 0, '9 tiles away: not in view');
+  tick(s, outside(lx, ly + 8), 1); // ten frames before the answer is read
+  assert.deepEqual(asked().map(c => plain(c.payload)), [{ landmark: 'L0,1' }], 'in view: asked once while the answer is out');
+  await flush();
+  const science = s.m.expedition.banked.lines.find(l => l.kind === 'landmark').amount;
+  assert.deepEqual(s.m.expedition.landmarks['L0,1'], { by: 'minh', round: s.m.turn });
+  assert.deepEqual(s.cards, [{ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science }]);
+  tick(s, outside(lx, ly + 2), 5);
+  await flush();
+  assert.equal(asked().length, 1, 'discovered: never asked again');
+  assert.deepEqual(plain(await s.eva.act('discover', outside(lx, ly), { landmark: 'L0,1' })), { error: 'known' });
+  tick(s, outside(lx, ly), 0.1);
+  assert.doesNotMatch(noteOf(s), /eva\.err/, "'known' (a crewmate was first) is not said");
+});
+
+test('a refused discovery is asked again 3 s later while the landmark is still in view and undiscovered, and opens no card', async () => {
+  const s = setup({ mission: quiet(poiMission()), t: say, answer: type => (type === 'discover' ? { error: 'tooFar' } : null) });
+  hold(s, 68, 462);
+  const asked = () => s.calls.filter(c => c.type === 'discover').length;
+  tick(s, outside(68, 465), 0.1);
+  await flush();
+  tick(s, outside(68, 465), 2.8);
+  assert.equal(asked(), 1, 'not again within 3 s of the refusal');
+  tick(s, outside(68, 465), 0.3);
+  assert.equal(asked(), 2, 'again after 3 s');
+  assert.deepEqual(s.cards, []);
+});
+
+test("the sites of landmarks and formations are offered, drawn and marked as finds by their own ids, once each; surveying a formation opens its fact", async () => {
+  const s = setup({ mission: quiet(poiMission()), t: say });
+  const site = [63, 466], centre = [68, 462], spot = [37, 12]; // the delta L0,1's sites 0 and 1, the ventifact F1,0's survey
+  for (const [x, y] of [site, centre, spot]) { hold(s, x, y); s.world.reveal(x, y, 3); }
+  for (const [cx, cy] of [[1, 13], [2, 13], [1, 14], [2, 14]]) s.world.get(cx, cy); // every chunk the delta's box touches
+  const p = outside(...site), f = s.eva.focusAt(p.x, p.y, p, s.world), survey = String(X.holdSeconds('science', role(s, 'minh')));
+  assert.deepEqual(f && [f.kind, f.id], ['find', 'L0,1:0'], "the delta's site, offered as a find");
+  assert.equal(s.eva.label(f), 'eva.survey ' + JSON.stringify({ what: 'find.science · sci.delta', s: survey }));
+  s.player.p = p;
+  const box = [(site[0] - 1) * T, (site[1] - 1) * T, (site[0] + 1) * T, (site[1] + 1) * T];
+  assert.equal(s.eva.sprites(...box, s.world, 0).filter(q => q.y === (site[1] + 0.5) * T + 12).length, 1, 'drawn');
+  tick(s, NEAR(0, 1), 0.2);
+  const at = ([x, y]) => s.eva.marks(s.world, x * T, y * T).filter(q => q.x === (x + 0.5) * T && q.y === (y + 0.5) * T).length;
+  assert.equal(at(centre), 1, 'marked once, though four chunks list the delta');
+  const q = outside(...spot), g = s.eva.focusAt(q.x, q.y, q, s.world);
+  assert.deepEqual(g && [g.kind, g.id], ['find', 'F1,0:0'], "the ventifact's survey");
+  assert.equal(s.eva.label(g), 'eva.survey ' + JSON.stringify({ what: 'find.science · sci.ventifact', s: survey }));
+  s.eva.start(g);
+  tick(s, q, X.holdSeconds('science', role(s, 'minh')) + 0.2, g);
+  await flush();
+  assert.deepEqual(s.calls.filter(c => c.type === 'collect').map(c => plain(c.payload)), [{ find: 'F1,0:0' }]);
+  assert.equal(s.m.expedition.carried.minh[0].sub, 'ventifact');
+  assert.deepEqual(s.cards, [{ type: 'formation', id: 'F1,0', kind: 'ventifact' }], "the formation's fact and source");
+  const h = s.eva.focusAt(q.x, q.y, q, s.world);
+  assert.notEqual(h && h.id, 'F1,0:0', 'surveyed: gone');
+});
diff --git a/test/ui.test.js b/test/ui.test.js
index 51e8e65..026d39f 100644
--- a/test/ui.test.js
+++ b/test/ui.test.js
@@ -35,8 +35,9 @@ class El {
 const walk = (n, out) => { out.push(n); for (const c of n.children) if (c instanceof El) walk(c, out); return out; };
 const click = n => { for (const fn of n.listeners.click) fn({ target: n, currentTarget: n }); };
 
-// ui.js booted on a device whose localStorage holds `stored` (keys without the "sol500." prefix). Timers wait for flush().
-function page(stored) {
+// ui.js booted on a device whose localStorage holds `stored` (keys without the "sol500." prefix), with `globals` added to its
+// window (a stub SolNet). Timers wait for flush().
+function page(stored, globals) {
   const ls = {}, timers = [], app = new El('div'), surface = { hooks: null, data: null };
   for (const [k, v] of Object.entries(stored || {})) ls['sol500.' + k] = JSON.stringify(v);
   const win = {
@@ -50,13 +51,14 @@ function page(stored) {
     SolSurface: { mount: hooks => { surface.hooks = hooks; return new El('div'); }, update: data => { surface.data = data; } },
   };
   win.window = win.self = win;
+  Object.assign(win, globals);
   win.Node = El;
   vm.createContext(win);
   for (const [f, code] of SOURCES) vm.runInContext(code, win, { filename: f });
   const UI = win.SolUI, E = win.SolEngine;
   const all = () => walk(app, []);
   return {
-    UI, E, X: win.SolExpedition, ls, surface, all,
+    UI, E, X: win.SolExpedition, I: win.SolI18n, ls, surface, all,
     byKey: k => all().find(n => n.attrs['data-k'] === k),
     dialog: () => all().find(n => n.attrs.role === 'dialog') || null,
     flush() { while (timers.length) timers.shift()(); },
@@ -172,3 +174,123 @@ test("the round report says whom the solar flare caught (+15 mSv) and who collap
   assert.ok(lines.includes(en('rep.flare', { name: en('name.minh'), d: 15 })), lines.join(' | '));
   assert.ok(lines.includes(en('rep.collapse', { name: en('name.lena'), h: 20, m: 3 })));
 });
+
+// ---------- points of interest (M4c) ----------
+// Seed PAINT-QA-1 has every kind of point of interest near the HQ (the painter's QA seed). Until the words branch is
+// merged its names, facts and logs read as their keys, which en() gives back too.
+const QA = { weather: at(13, 48), cache: at(-25, 47) };
+const cardOf = pg => pg.all().find(n => /(^| )region-card( |$)/.test(n.className)) || null;
+const panelText = pg => { pg.UI.render(); return pg.all().find(n => n.tagName === 'SECTION' && n.attrs['aria-label'] === en('eva.title')).textContent; };
+
+test("solo: a Kestrel structure's story log opens over the surface once a mission, tagged as a fictional log, with no source", () => {
+  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
+  pg.play(m);
+  pg.surface.hooks.card({ type: 'log', id: 'S0,0', kind: 'weather' });
+  pg.UI.render();
+  const card = cardOf(pg);
+  assert.match(card.className, /(^| )log( |$)/);
+  const [head, title, body, ...rest] = card.children;
+  assert.equal(head.children[0].textContent, en('ks.label'), 'the tag');
+  assert.equal(title.textContent, en('ks.weather.name'));
+  assert.equal(body.textContent, en('ks.weather.log'));
+  assert.deepEqual(rest, [], 'no source line: the Kestrel Survey is fiction');
+  click(pg.byKey('region-close'));
+  pg.UI.render();
+  assert.equal(cardOf(pg), null, 'closed');
+  pg.surface.hooks.card({ type: 'log', id: 'S0,0', kind: 'weather' });
+  pg.UI.render();
+  assert.equal(cardOf(pg), null, 'the same structure never opens it again in this mission');
+});
+
+test("solo: a repaired weather station's fog reaches the surface at once; its science and a cache's loads are report lines named after them", async () => {
+  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
+  pg.play(m);
+  const r = await pg.surface.hooks.exp('interact', { structure: 'S0,0' }, QA.weather);
+  assert.equal(r.done, 'repaired');
+  assert.ok(Object.keys(r.fog).length > 0);
+  for (const k of Object.keys(r.fog)) assert.ok(pg.surface.data.fog[k], 'the surface has the fog of chunk ' + k);
+  assert.ok(panelText(pg).includes(en('find.weather')), 'the weather station line');
+  assert.equal((await pg.surface.hooks.exp('interact', { structure: 'S-1,0' }, QA.cache)).ok, true);
+  assert.equal((await pg.surface.hooks.exp('deliver', {}, at(0, 0))).ok, true);
+  assert.ok(panelText(pg).includes(en('find.cache')), 'the supply cache line');
+});
+
+test("solo: a landmark's discovery card shows its name, the reward and who found it, its real fact and its source", () => {
+  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
+  if (!pg.I.LANDMARK_SOURCES) pg.I.LANDMARK_SOURCES = { delta: 'jezero' }; // a stand-in until the words branch brings the real map
+  pg.play(m);
+  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: 120 });
+  pg.UI.render();
+  const card = cardOf(pg);
+  assert.match(card.className, /(^| )disc( |$)/);
+  const src = pg.I.SOURCES[pg.I.LANDMARK_SOURCES.delta];
+  assert.deepEqual(card.children.slice(1).map(n => n.textContent), [
+    en('lm.delta.name'), en('haul.science', { n: 120 }) + ' · ' + en('disc.by', { name: en('name.minh') }), en('lm.delta.fact'), en('region.source') + ': ' + src.label,
+  ]);
+  assert.equal(card.children[0].children[0].textContent, en('disc.new'));
+  assert.equal(walk(card, []).find(n => n.tagName === 'A').attrs.href, src.url);
+});
+
+test("the discoverer's own tab hears of a discovery twice, in either order: the second adds the reward the first did not have, and opens nothing new", () => {
+  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
+  pg.play(m);
+  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: null });
+  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: 120 });
+  assert.equal(pg.UI.store.card.science, 120);
+  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: null });
+  assert.equal(pg.UI.store.card.science, 120, 'a later copy without it changes nothing');
+});
+
+test("co-op: a crewmate's discovery from the server opens its card on this tab, the landmark's kind read from the world; an unknown landmark opens none", async () => {
+  const net = { info: () => Promise.resolve({ lan: true }), restore: () => ({ code: 'ABCD', playerId: 'p1', token: 't' }), connect: (...h) => { net.h = h; } };
+  const pg = page(null, { SolNet: net });
+  await new Promise(r => setImmediate(r)); // the boot asks the server for its info, then connects
+  const onEvent = net.h[4];
+  pg.UI.store.room = { mission: pg.mission({ seed: 'PAINT-QA-1', coop: true }), players: [], settings: { names: {} } };
+  onEvent({ kind: 'discover', landmark: 'L1,1', by: 'diego' });
+  assert.equal(pg.UI.store.card, null, 'no landmark in that cell of this world');
+  onEvent({ kind: 'discover', landmark: 'L0,1', by: 'diego' });
+  assert.deepEqual(plain(pg.UI.store.card), { type: 'landmark', id: 'L0,1', kind: 'delta', by: 'diego', science: null });
+  onEvent({ kind: 'discover', landmark: 'L0,1', by: 'diego', science: 132 });
+  assert.equal(pg.UI.store.card.science, 132, "the reward, when the server's event carries it");
+});
+
+test("solo: a formation's survey opens its real fact with its source, once per formation", () => {
+  const pg = page(), m = pg.mission({ seed: 'PAINT-QA-1' });
+  if (!pg.I.FORMATION_SOURCES) pg.I.FORMATION_SOURCES = { ventifact: 'bagnold' }; // a stand-in until the words branch brings the real map
+  pg.play(m);
+  pg.surface.hooks.card({ type: 'formation', id: 'F1,0', kind: 'ventifact' });
+  pg.UI.render();
+  const card = cardOf(pg), src = pg.I.SOURCES[pg.I.FORMATION_SOURCES.ventifact];
+  assert.equal(card.children[0].children[0].textContent, en('disc.formation'));
+  assert.deepEqual(card.children.slice(1).map(n => n.textContent), [en('fm.ventifact.name'), en('fm.ventifact.fact'), en('region.source') + ': ' + src.label]);
+  click(pg.byKey('region-close'));
+  pg.surface.hooks.card({ type: 'formation', id: 'F1,0', kind: 'ventifact' });
+  pg.UI.render();
+  assert.equal(cardOf(pg), null, 'the same formation, surveyed again in this mission, opens nothing');
+});
+
+test("while a repaired weather station forecasts, the top bar also shows next round's weather, in that weather's colours", () => {
+  const pg = page(), m = pg.mission({ seed: 'UI-FORECAST' });
+  m.schedule[m.turn + 1].weather = 'global';
+  const chip = () => { pg.UI.render(); return pg.all().find(n => n.tagName === 'SPAN' && /(^| )fc( |$)/.test(n.className)) || null; };
+  pg.play(m);
+  assert.equal(chip(), null, 'no station repaired: no forecast');
+  m.expedition.forecastUntil = m.turn + 3; // repaired this round (X.interact)
+  const c = chip();
+  assert.ok(c, 'the forecast chip');
+  assert.equal(c.textContent, en('eva.forecast', { w: en('weather.global') }));
+  assert.match(c.className, /(^| )crit( |$)/);
+  assert.equal(c.attrs.title, en('eva.forecastBy'));
+  m.expedition.forecastUntil = m.turn - 1;
+  assert.equal(chip(), null, 'the forecast has run out');
+});
+
+test('a landmark discovered in a new mission under a code played before opens its card again; a story log read under that code does not', () => {
+  const pg = page({ regionsSeen: { key: 'PAINT-QA-1|solo', list: ['L0,1', 'S0,0'] } }), m = pg.mission({ seed: 'PAINT-QA-1' });
+  pg.play(m);
+  pg.surface.hooks.card({ type: 'log', id: 'S0,0', kind: 'weather' });
+  assert.equal(pg.UI.store.card, null, 'the log was read under this code');
+  pg.surface.hooks.card({ type: 'landmark', id: 'L0,1', kind: 'delta', by: 'minh', science: 120 });
+  assert.equal(pg.UI.store.card && pg.UI.store.card.id, 'L0,1', "the discovery is this mission's");
+});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `node --test test/i18n.test.js test/net.test.js test/surface-eva.test.js test/ui.test.js`
Expected: 22 of 59 fail, among them "a find or a cave under a point of interest is never offered, drawn or marked on the map", "the view is the headlamp's in a lava tube and the weather's plus 4 on a star dune's crest…", "at a Kestrel structure's door, holding E opens, salvages or repairs it once…", "walking into a hab pod fills your suit once a round and opens its log…", "a landmark is discovered when its centre comes into your view…", "the discoverer's own tab hears of a discovery twice, in either order…", "solo: a formation's survey opens its real fact with its source, once per formation", "while a repaired weather station forecasts, the top bar also shows next round's weather…", "a discovery the server sends reaches the game's event handler…" and "every error the exploring rules can give has a string…".

- [ ] **Step 3: Wire them up**

```diff
diff --git a/lib/ws.js b/lib/ws.js
index 924765a..c48687b 100644
--- a/lib/ws.js
+++ b/lib/ws.js
@@ -1,7 +1,7 @@
 'use strict';
 /*
  * SOL 500 — WebSocket transport. One socket per browser tab at /ws?code=&player=&token=.
- * Frames are JSON { t, d }. Server → client: room, pos, fog, event (kicked, closed). Client → server: pos, reveal.
+ * Frames are JSON { t, d }. Server → client: room, pos, fog, event (kicked, closed, discover). Client → server: pos, reveal.
  * At most 3 sockets per seat.
  * (Cloudflare quick tunnels don't carry Server-Sent Events, so live updates use this instead.)
  */
diff --git a/src/i18n.js b/src/i18n.js
index 7bd0b4c..b16f1e5 100644
--- a/src/i18n.js
+++ b/src/i18n.js
@@ -618,6 +618,11 @@
     'find.ice': 'Ice deposit',
     'find.metal': 'Metal-rich rock',
     'find.pod': 'Crashed cargo pod',
+    'find.cache': 'Supply cache',
+    'find.wreck': 'Wrecked scout rover',
+    'find.weather': 'Weather station',
+    'find.array': 'Dusty solar array',
+    'find.landmark': 'Landmark discovered',
     'find.science': 'Science site',
     'sci.delta': 'old river delta',
     'sci.vent': 'methane vent',
@@ -692,17 +697,37 @@
     'eva.err.notDriving': 'You are not driving the rover.',
     'eva.err.badAction': 'Not now.',
     'eva.err.suitFull': 'Not yet: breathe a canister at {s} s of suit or less, so none of it is wasted.',
-    'eva.flare.run': '☢ Solar flare coming: get under cover at the base, in a cave or in the storm shelter',
+    'eva.flare.run': '☢ Solar flare coming: get under cover at the base, in a cave, a lava tube, a hab pod or the storm shelter',
     'eva.flare.covered': '☢ Solar flare coming: you are under cover here',
     'eva.flare.now': '☢ The solar flare is here',
     'eva.flare.hit': '☢ The flare caught you in the open: +{d} mSv at the next advance',
     'eva.flare.missed': '☢ The flare has passed: you were under cover',
-    'eva.flare.warned': 'Solar flare warning: {s} s to get under cover, at the base, in a cave or in the storm shelter.',
+    'eva.flare.warned': 'Solar flare warning: {s} s to get under cover, at the base, in a cave, a lava tube, a hab pod or the storm shelter.',
     'eva.devil': 'A dust devil caught you: −{s} s of suit.',
     'eva.inCave': 'In a cave: cover from a solar flare.',
     'eva.brief': 'Outside this round: {list}.',
     'eva.brief.flare': 'a solar flare',
     'eva.brief.devils': 'dust devils',
+    'eva.inTube': 'In a lava tube: cover from a solar flare.',
+    'eva.inPod': 'In a hab pod: cover from a solar flare.',
+    'eva.open': 'Hold to open: {what} · {s} s',
+    'eva.salvage': 'Hold to salvage: {what} · {s} s',
+    'eva.repair': 'Hold to repair: {what} · {s} s',
+    'eva.atDoor': 'no room for {n}: left at the door',
+    'eva.refilled': 'Hab pod: your suit is full again ({s} s).',
+    'eva.forecast': 'Next round: {w}',
+    'eva.forecastBy': 'Forecast from a repaired weather station',
+    'disc.new': 'Landmark discovered',
+    'disc.by': 'found by {name}',
+    'disc.formation': 'Natural formation surveyed',
+    'eva.repairedWeather': "Weather station repaired: +{n} science, and the forecast now shows next round's weather",
+    'eva.repairedMast': 'Comms mast repaired: what it picks up is marked ? on the map',
+    'eva.err.noStructure': 'There is no structure here.',
+    'eva.err.badKind': 'That is not used this way.',
+    'eva.err.done': 'Already used or repaired.',
+    'eva.err.noLandmark': 'There is no landmark there.',
+    'eva.err.known': 'A crewmate found it first.',
+    'eva.err.refilled': 'You have already refilled your suit at this pod this round.',
     'eva.brief.storm': 'a dust storm (you see {n} tiles)',
     'eva.brief.rupture': 'an O₂ leak at the base (bring canisters home)',
     'eva.cond.title': 'Outside this round',
@@ -1582,6 +1607,11 @@
     'find.ice': 'Mỏ băng',
     'find.metal': 'Đá giàu kim loại',
     'find.pod': 'Khoang hàng bị rơi',
+    'find.cache': 'Thùng tiếp tế',
+    'find.wreck': 'Xác xe tự hành trinh sát',
+    'find.weather': 'Trạm khí tượng',
+    'find.array': 'Dàn pin mặt trời phủ bụi',
+    'find.landmark': 'Khám phá địa danh',
     'find.science': 'Địa điểm khoa học',
     'sci.delta': 'châu thổ sông cổ',
     'sci.vent': 'lỗ thoát khí mê-tan',
@@ -1656,17 +1686,37 @@
     'eva.err.notDriving': 'Bạn đang không lái xe tự hành.',
     'eva.err.badAction': 'Chưa được lúc này.',
     'eva.err.suitFull': 'Chưa cần: hãy thở bình O₂ khi bộ đồ còn {s} giây trở xuống để không phí chút oxy nào.',
-    'eva.flare.run': '☢ Bão hạt Mặt Trời sắp tới: hãy vào nơi trú ẩn ở căn cứ, trong hang hoặc trong hầm trú bão',
+    'eva.flare.run': '☢ Bão hạt Mặt Trời sắp tới: hãy vào nơi trú ẩn ở căn cứ, trong hang, ống dung nham, khoang sinh hoạt hoặc hầm trú bão',
     'eva.flare.covered': '☢ Bão hạt Mặt Trời sắp tới: bạn đang ở nơi trú ẩn',
     'eva.flare.now': '☢ Bão hạt Mặt Trời đã tới',
     'eva.flare.hit': '☢ Bão hạt Mặt Trời bắt gặp bạn ngoài trời: +{d} mSv khi sang vòng mới',
     'eva.flare.missed': '☢ Bão hạt Mặt Trời đã qua: bạn đã ở nơi trú ẩn',
-    'eva.flare.warned': 'Cảnh báo bão hạt Mặt Trời: còn {s} giây để vào nơi trú ẩn ở căn cứ, trong hang hoặc trong hầm trú bão.',
+    'eva.flare.warned': 'Cảnh báo bão hạt Mặt Trời: còn {s} giây để vào nơi trú ẩn ở căn cứ, trong hang, ống dung nham, khoang sinh hoạt hoặc hầm trú bão.',
     'eva.devil': 'Một cơn lốc bụi cuốn trúng bạn: −{s} giây oxy bộ đồ.',
     'eva.inCave': 'Trong hang: nơi trú ẩn khỏi bão hạt Mặt Trời.',
     'eva.brief': 'Bên ngoài vòng này: {list}.',
     'eva.brief.flare': 'bão hạt Mặt Trời',
     'eva.brief.devils': 'lốc bụi',
+    'eva.inTube': 'Trong ống dung nham: nơi trú ẩn khỏi bão hạt Mặt Trời.',
+    'eva.inPod': 'Trong khoang sinh hoạt: nơi trú ẩn khỏi bão hạt Mặt Trời.',
+    'eva.open': 'Giữ để mở: {what} · {s} giây',
+    'eva.salvage': 'Giữ để tháo dỡ: {what} · {s} giây',
+    'eva.repair': 'Giữ để sửa: {what} · {s} giây',
+    'eva.atDoor': 'không còn chỗ cho {n} kiện: để lại ở cửa',
+    'eva.refilled': 'Khoang sinh hoạt: bộ đồ đã được nạp đầy ({s} giây).',
+    'eva.forecast': 'Vòng sau: {w}',
+    'eva.forecastBy': 'Dự báo từ một trạm khí tượng đã sửa',
+    'disc.new': 'Đã khám phá địa danh',
+    'disc.by': 'do {name} tìm thấy',
+    'disc.formation': 'Đã khảo sát địa hình tự nhiên',
+    'eva.repairedWeather': 'Đã sửa trạm khí tượng: +{n} điểm khoa học, và dự báo giờ cho thấy thời tiết vòng sau',
+    'eva.repairedMast': 'Đã sửa cột ăng-ten: những gì nó bắt được được đánh dấu ? trên bản đồ',
+    'eva.err.noStructure': 'Ở đây không có công trình nào.',
+    'eva.err.badKind': 'Không dùng được theo cách này.',
+    'eva.err.done': 'Đã được dùng hoặc sửa rồi.',
+    'eva.err.noLandmark': 'Ở đó không có địa danh nào.',
+    'eva.err.known': 'Một đồng đội đã tìm thấy nó trước.',
+    'eva.err.refilled': 'Bạn đã nạp đầy bộ đồ ở khoang này trong vòng này rồi.',
     'eva.brief.storm': 'bão bụi (bạn nhìn thấy {n} ô)',
     'eva.brief.rupture': 'rò rỉ O₂ ở căn cứ (hãy mang bình O₂ về)',
     'eva.cond.title': 'Bên ngoài vòng này',
diff --git a/src/net.js b/src/net.js
index f1adcfa..05ced80 100644
--- a/src/net.js
+++ b/src/net.js
@@ -8,7 +8,7 @@
   const KEY = 'sol500.lan';
   let session = null;
   let ws = null;        // the live socket, or null
-  let handlers = null;  // { onRoom, onStatus, onPos, onFog } while connected
+  let handlers = null;  // { onRoom, onStatus, onPos, onFog, onEvent } while connected
   let retry = 0;
   let timer = null;
   let gen = 0;          // bumped by disconnect(): tells an in-flight recover() it is stale
@@ -70,10 +70,10 @@
     return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws?' + q.toString();
   }
 
-  function connect(onRoom, onStatus, onPos, onFog) {
+  function connect(onRoom, onStatus, onPos, onFog, onEvent) {
     if (!session) return;
     disconnect();
-    handlers = { onRoom, onStatus, onPos, onFog };
+    handlers = { onRoom, onStatus, onPos, onFog, onEvent };
     open();
   }
 
@@ -93,6 +93,7 @@
       else if (msg.t === 'pos') { if (h.onPos) h.onPos(msg.d); }
       else if (msg.t === 'fog') { if (h.onFog) h.onFog(msg.d); }
       else if (msg.t === 'event' && msg.d && (msg.d.kind === 'kicked' || msg.d.kind === 'closed')) gone(msg.d.kind);
+      else if (msg.t === 'event' && msg.d) { if (h.onEvent) h.onEvent(msg.d); } // the rest (a discovery) are the game's
     };
     sock.onclose = () => {
       if (ws !== sock) return; // closed on purpose
diff --git a/src/style.css b/src/style.css
index 0f1a6da..ef8b110 100644
--- a/src/style.css
+++ b/src/style.css
@@ -140,6 +140,10 @@ p { margin: 0; }
 .chip.warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
 .chip.crit { background: var(--crit-soft); color: var(--crit); border-color: transparent; }
 .chip.info { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
+/* The weather station's forecast of next round's weather: dashed, as a prediction, in the weather's colours. */
+.chip.fc { border-style: dashed; }
+.chip.fc.warn { border-color: var(--warn); }
+.chip.fc.crit { border-color: var(--crit); }
 
 .bar { height: 6px; border-radius: 6px; background: var(--sunk); overflow: hidden; position: relative; }
 .bar > span { display: block; height: 100%; border-radius: 6px; background: var(--fg-2); }
@@ -228,6 +232,8 @@ p { margin: 0; }
 .track span.regional { background: #b07a4a; }
 .track span.global { background: var(--rust); }
 .track span.now { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
+/* While the forecast chip shows, the round track gives way down to its minimum, so the bar stays one row at 1280 px. */
+.hud-top:has(.chip.fc) .track { flex-basis: 180px; }
 .meters { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 8px; }
 .meter { display: grid; gap: 2px; padding: 6px 8px; border-radius: 8px; background: var(--panel); border: 1px solid var(--line); min-width: 0; }
 .meter .k { display: flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@@ -456,6 +462,17 @@ p { margin: 0; }
 .region-card p { margin: 0; font-size: var(--fs-sm); color: var(--fg-2); line-height: 1.45; }
 .region-card .src { font-size: var(--fs-xs); }
 .region-card a { color: var(--accent); }
+/* Wide screens: the card sits under the HUD's column, whose note (what a structure gave, a refill) can run to three lines
+   as the card opens; a longer column is drawn over the card (.sf-eva's z-index) while its note lasts. */
+@media (min-width: 641px) { .region-card { top: 196px; } }
+/* A Kestrel Survey story log: the programme's teal (its structures on the maps) and a log's monospace. */
+.region-card.log { border-left-color: #4a978e; }
+.region-card.log .eyebrow { color: #7cc7bd; }
+.region-card.log p { font-family: var(--font-data); font-size: var(--fs-xs); line-height: 1.5; }
+/* A landmark's discovery: the gold of its diamond on the maps; the reward and the finder under the name. */
+.region-card.disc { border-left-color: #f0c35a; }
+.region-card.disc .eyebrow, .region-card .meta { color: #f0c35a; }
+.region-card .meta { font-family: var(--font-data); font-size: var(--fs-xs); }
 
 .sf-root { position: relative; height: min(74vh, 780px); min-height: 440px; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #3a1d14; touch-action: none; user-select: none; -webkit-user-select: none; }
 .sf-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; outline: none; cursor: crosshair; }
@@ -494,7 +511,7 @@ p { margin: 0; }
 .sf-region:hover, .sf-region:focus-visible { border-color: var(--accent); }
 .sf-region:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
 /* Exploring: the suit, the rover's battery, the backpack and notes, under the region name. */
-.sf-eva { position: absolute; left: 14px; top: 58px; display: grid; gap: 6px; width: 210px; pointer-events: none; }
+.sf-eva { position: absolute; left: 14px; top: 58px; z-index: 3; display: grid; gap: 6px; width: 210px; pointer-events: none; }
 .sf-eva > * { pointer-events: auto; }
 .sf-suit { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; background: rgba(20, 14, 16, 0.82); border: 1px solid var(--line-2); border-radius: 10px; padding: 4px 10px; font-size: var(--fs-xs); color: var(--fg); }
 .sf-suit .k { color: var(--fg-2); font-weight: 600; }
diff --git a/src/surface-eva.js b/src/surface-eva.js
index 71a1814..031dac0 100644
--- a/src/surface-eva.js
+++ b/src/surface-eva.js
@@ -12,20 +12,25 @@
  * API: SolEva.create(env) → eva
  *        env: { t(key, params), hooks(), crewName(id), home(), drawRover(ctx, x, y), player(), now() → seconds,
  *               push(dx, dy) (a dust devil throws your astronaut that far, world px) }
+ *        hooks() is ui.js's: exp(type, payload, pos) runs the rules (above), suit(report) keeps the solo save, and
+ *        card({ type, id, kind, ... }) shows a point of interest's card (a Kestrel structure's story log, a hab pod's as you
+ *        walk in, a landmark's discovery { by, science }, a formation's fact when you survey it)
  *      eva.el · eva.alert                           the HUD node and the flare's banner, for the surface overlay
  *      eva.sync(data) → { round, fresh }            round: a new round began; fresh: first look at this mission/seat
  *                                                   (data.clock, co-op only: { t: round seconds, at: env.now() then })
  *      eva.reset()                                  a new mission or room: forget the last one's suit, battery, collapse and hold
  *      eva.canMove(player, nx, ny) → may your astronaut step to (nx, ny)? (world px)
  *      eva.step(dt, player, world, moved, focus)    every frame: suit, battery, delivering, holds, dangers, the HUD
- *      eva.focusAt(x, y, player, world) → a focus on a find, a dropped load, a collapsed crewmate or the parked rover
+ *      eva.focusAt(x, y, player, world) → a focus on a find (or a landmark's or a formation's site, as one), a dropped load, a
+ *        collapsed crewmate, the parked rover or the door
+ *        of a Kestrel structure not used yet (kind 'kestrel')
  *      eva.holdable(focus) · eva.label(focus) · eva.start(focus) · eva.stop()       E / the action button
  *      eva.hasRoom() → does your backpack take another load?
  *      eva.act(type, player, payload) → Promise of the rules' answer (board, park) · eva.canister(player) (the button, or Q)
  *      eva.drawZone(ctx, x0, y0, x1, y1, world) the base zone, and every cover in view during a flare warning
  *      eva.sprites(x0, y0, x1, y1, world, time) → [{ y, draw(ctx) }] · eva.drawOver(ctx)
  *      eva.flareFx(player) → { warn: 0–1, flash: 0–1 }: the red edge of a flare countdown, the flash when it hits
- *      eva.view(player) → tiles you can see this round · eva.clock() → the round's clock (s) · eva.alerting()
+ *      eva.view(player) → tiles you see from where you stand (Z.viewAt) · eva.clock() → the round's clock (s) · eva.alerting()
  *      eva.suitBar(teammate) → 0–1, or null: the suit bar on a teammate's name tag (drawn by SolPaint's drawTags)
  *      eva.marks(world, px, py) → minimap markers · eva.report() → { suit (null while collapsed), driven } for positions
  *      eva.roverAtBay(player) · eva.driving() · eva.collapsed(crewId) · eva.state() (play-testing)
@@ -39,20 +44,38 @@
   const REACH = 0.9 * T;                        // how close the spot you look at must be to a find
   const COLORS = { ice: '#9fd3ea', metal: '#d9b46a', pod: '#ece5db', science: '#6fa8ff' };
   const RES_ICON = { water: 'water', materials: 'materials', food: 'food', o2: 'o2', spares: 'spares', science: 'science' };
-  // No message when these are refused: they are retried, or harmless.
-  const QUIET = ['deliver', 'collapse', 'park', 'flareStart', 'flareEnd'];
+  // No message when these are refused: they are retried, or harmless (a discovery is asked for when a landmark comes into
+  // view, a refill as you walk into a hab pod; 'known' only means a crewmate saw it first).
+  const QUIET = ['deliver', 'collapse', 'park', 'flareStart', 'flareEnd', 'discover', 'refill'];
   const CAN_BELOW = XD.suit - XD.canister.suit;  // a canister is breathed only when all of its 45 s fit in the suit
   const VERDICT = 8;                             // seconds the flare's verdict stays on the banner
+  const INSIDE = { cave: 'eva.inCave', tube: 'eva.inTube', pod: 'eva.inPod' }; // the note while you are in cover out there
+  // What holding E does at a Kestrel structure's door (the hab pod has no hold: you walk in).
+  const VERB = { cache: 'eva.open', wreck: 'eva.salvage', array: 'eva.salvage', weather: 'eva.repair', mast: 'eva.repair' };
+  // A chunk's finds or caves less those under a point of interest's footprint (its `hidden`), as X.findsIn / X.cavesIn
+  // give them: never drawn, marked, smelled or offered.
+  const visible = (c, k) => (c.hidden[k].length ? c[k].filter(o => !c.hidden[k].includes(o.n)) : c[k]);
+  // What can be collected in a chunk, with its id: its finds ("<cx>,<cy>:<n>") and the sites lying in it of the landmarks and
+  // formations it lists ("L<i>,<j>:<n>", "F<cx>,<cy>:0"). A landmark is listed by every chunk its box touches, so each chunk
+  // takes only the sites in it, and a site comes once.
+  function sitesIn(c, cx, cy) {
+    const out = visible(c, 'finds').map(f => [cx + ',' + cy + ':' + f.n, f]);
+    for (const k of c.landmarks.concat(c.formations)) {
+      for (const f of k.sites) if (SW.chunkOf(f.x) === cx && SW.chunkOf(f.y) === cy) out.push([k.id + ':' + f.n, f]);
+    }
+    return out;
+  }
 
   function create(env) {
     const t = (k, p) => env.t(k, p);
     const wall = () => (env.now ? env.now() : 0);
     let data = null, me = null, turn = null, wasDown = false;
     let suit = XD.suit, driven = 0, hold = null, keyHeld = false;
-    let now = 0, deliverAt = -1e9, collapseAt = -1e9, reportAt = -1e9, marksAt = -1e9, marksCache = [];
+    let now = 0, deliverAt = -1e9, collapseAt = -1e9, reportAt = -1e9, marksAt = -1e9, marksCache = [], refillAt = -1e9, inPod = null;
     let soloClock = 0, coopClock = null, hitAt = -1e9, flareAskAt = -1e9, flareEndAt = -1e9, warned = false;
     let note = null;                               // { text, cls, until }
     let peek = null;                               // the chunks the surface holds (SolWorld's peek), from the last frame
+    let asked = {};                                // landmark id → when its discovery was answered (Infinity while asked)
 
     const mission = () => (data && data.mission) || null;
     const exp = () => mission().expedition;
@@ -67,6 +90,8 @@
     const secs = s => (Math.round(s * 10) / 10).toString();
     const clock = () => (coopClock ? coopClock.t + (wall() - coopClock.at) : soloClock);
     function say(text, cls, s) { note = { text, cls: cls || '', until: now + (s || 3) }; }
+    // A point of interest's card over the surface (ui.js shows each once a mission): { type: 'log' | ..., id, kind }.
+    const card = c => { const h = env.hooks(); if (h && h.card) h.card(c); };
 
     // ---------- the HUD ----------
     const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
@@ -96,6 +121,40 @@
     // co-op server's, none in solo play), so they agree with it. Like the in-cave note, it reads the chunks the surface
     // holds, so asking every frame never builds one.
     const covered = p => !!(p && Z.shelterAt(mission(), p, Z.slackOf(mission()), peek));
+    // A landmark is discovered the first time anyone sees its centre (spec §3.6): here, when that tile comes into your view
+    // as the fog's does (within viewOf(p) tiles of the tile under you; the rules allow 15.5). It is asked once while the
+    // answer is out, and again 3 s after a refusal while it is still in view and undiscovered. Its card opens on the ok; in
+    // co-op the server's event opens it on every tab as well (ui.js shows it once).
+    function sight(p) {
+      const x = exp(), tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), r = viewOf(p);
+      for (let cy = SW.chunkOf(ty) - 1; cy <= SW.chunkOf(ty) + 1; cy++) for (let cx = SW.chunkOf(tx) - 1; cx <= SW.chunkOf(tx) + 1; cx++) {
+        const c = peek && peek(cx, cy);
+        if (c) for (const l of c.landmarks) {
+          if (x.landmarks[l.id] || now - (asked[l.id] == null ? -1e9 : asked[l.id]) < 3) continue;
+          if ((l.x - tx) * (l.x - tx) + (l.y - ty) * (l.y - ty) > r * r) continue;
+          asked[l.id] = Infinity;
+          const by = me;
+          act('discover', p, { landmark: l.id }).then(res => {
+            asked[l.id] = now;
+            if (res.ok) card({ type: 'landmark', id: l.id, kind: l.kind, by, science: res.science });
+          });
+        }
+      }
+    }
+    // The hab pod you stand in (the painter's "inside": the tile under you is in its 5×5 box), from the chunks the surface
+    // holds: the chunk of that tile lists it.
+    function podAt(p) {
+      const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), c = peek && peek(SW.chunkOf(tx), SW.chunkOf(ty));
+      if (c) for (const s of c.structures) if (s.kind === 'pod' && tx >= s.box[0] && tx <= s.box[2] && ty >= s.box[1] && ty <= s.box[3]) return s;
+      return null;
+    }
+    // Tiles you see from where you stand (Z.viewAt): the weather's view, a lava tube's headlamp, a star dune's crest. The
+    // tile under you comes from the chunks the surface holds; before the first frame, or off them, it is open ground.
+    function viewOf(p) {
+      const tx = p ? Math.floor(p.x / T) : 0, ty = p ? Math.floor(p.y / T) : 0, cx = SW.chunkOf(tx), cy = SW.chunkOf(ty);
+      const c = p && peek ? peek(cx, cy) : null;
+      return Z.viewAt(mission(), !!(p && p.inRover), c ? W.tileOf(c, tx - cx * W.CHUNK, ty - cy * W.CHUNK) : null);
+    }
     // The flare as your astronaut sees it: null, or { cls, msg, left (seconds, or null) } for the banner.
     function flareView(p) {
       const m = mission(), f = m && m.expedition && m.expedition.flare;
@@ -121,7 +180,8 @@
       const atBase = !!p && X.inBaseZone(p);
       if (live() && pack().length >= X.capacity(mission(), me) && !atBase) return { text: t('eva.full'), cls: '' };
       if (live() && suit <= XD.suit * 0.2 && !atBase) return { text: t('eva.low'), cls: 'crit' };
-      if (live() && p && !atBase && Z.shelterAt(mission(), p, 0, peek) === 'cave') return { text: t('eva.inCave'), cls: 'ok' };
+      const cover = live() && p && !atBase ? INSIDE[Z.shelterAt(mission(), p, 0, peek)] : null;
+      if (cover) return { text: t(cover), cls: 'ok' };
       return null;
     }
     // The canister button shows only when breathing one now is worth it: outside, on your feet, and with room for all 45 s.
@@ -240,7 +300,9 @@
       wasDown = keyHeld = warned = false;
       suit = XD.suit;
       driven = soloClock = 0;
-      deliverAt = collapseAt = reportAt = marksAt = hitAt = flareAskAt = flareEndAt = -1e9;
+      deliverAt = collapseAt = reportAt = marksAt = hitAt = flareAskAt = flareEndAt = refillAt = -1e9;
+      inPod = null;
+      asked = {};
       marksCache = [];
     }
 
@@ -299,6 +361,20 @@
           warned = true;
           say(t('eva.flare.warned', { s: ZD.flare.countdown }), 'crit', 6);
         }
+        // An abandoned hab pod (spec §3.7): walking in fills your suit, once per pod a round (x.refills, C3), and its story log
+        // opens (ui.js shows each once a mission).
+        const pod = out ? podAt(p) : null;
+        if (pod && pod.id !== inPod) card({ type: 'log', id: pod.id, kind: 'pod' });
+        inPod = pod ? pod.id : null;
+        if (pod && !(x.refills[me] || []).includes(pod.id) && now - refillAt > 2) {
+          refillAt = now;
+          act('refill', p, { pod: pod.id }).then(r => {
+            if (!r.ok) return;
+            suit = r.suit;
+            say(t('eva.refilled', { s: Math.round(r.suit) }), 'ok', 4);
+          });
+        }
+        if (out) sight(p);
         if (atBase && pack().length && !collapsed(me) && now - deliverAt > 1.5) { // the rules refuse anything while you are down
           deliverAt = now;
           const n = pack().length;
@@ -323,22 +399,38 @@
       hold = null;
       const ask = f.kind === 'find' ? act('collect', p, { find: f.id })
         : f.kind === 'drop' ? act('pickup', p, { drop: f.id })
-          : act('revive', p, { target: f.id });
+          : f.kind === 'kestrel' ? act('interact', p, { structure: f.id })
+            : act('revive', p, { target: f.id });
       ask.then(r => {
         if (!r.ok) return;
+        if (f.kind === 'kestrel') return used(f.struct, r);
         if (f.kind === 'find') say(r.item ? t('haul.' + r.item.res, { n: r.item.amount }) : t('eva.collected'), 'ok', 2);
+        // A formation's survey: its real fact and source, once per formation (spec §3.7).
+        if (f.kind === 'find' && f.id[0] === 'F') card({ type: 'formation', id: f.id.split(':')[0], kind: f.find.sub });
         else if (f.kind === 'drop') say(t('eva.pickedUp'), 'ok', 2);
         else say(t('eva.revivedThem', { name: env.crewName(f.id) }), 'ok', 3);
         if (f.kind === 'find' && keyHeld && live()) hold = { f, t: 0, dur: hold0(f) }; // keep going while E is held
       });
     }
 
+    // A Kestrel structure opened, salvaged or repaired (X.interact): its loads are in your backpack and what did not fit waits
+    // at its door as a drop (C2); a weather station's fog is in the mission's (solo) or comes as any fog does (co-op), and a
+    // mast's marks are read by the maps. Its story log opens: a structure is used once, so this is the first time.
+    function used(s, r) {
+      const said = (r.items || []).map(i => t('haul.' + i.res, { n: i.amount }));
+      if (r.left) said.push(t('eva.atDoor', { n: r.left }));
+      if (s.kind === 'weather') said.push(t('eva.repairedWeather', { n: D.STRUCTURES.kinds.weather.science }));
+      if (s.kind === 'mast') said.push(t('eva.repairedMast'));
+      say(said.join(' · '), 'ok', 5);
+      card({ type: 'log', id: s.id, kind: s.kind });
+    }
+
     // ---------- what you can work on ----------
     function hold0(f) {
       const role = crew() && crew().role;
-      return X.holdSeconds(f.kind === 'find' ? f.find.kind : f.kind === 'drop' ? 'pickup' : 'revive', role);
+      return X.holdSeconds(f.kind === 'find' ? f.find.kind : f.kind === 'drop' ? 'pickup' : f.kind === 'kestrel' ? f.struct.kind : 'revive', role);
     }
-    const holdable = f => !!f && (f.kind === 'find' || f.kind === 'drop' || f.kind === 'revive');
+    const holdable = f => !!f && (f.kind === 'find' || f.kind === 'drop' || f.kind === 'revive' || f.kind === 'kestrel');
 
     function focusAt(lx, ly, p, world) {
       if (!live() || collapsed(me) || benched()) return null;
@@ -352,11 +444,15 @@
       for (let cy = ccy - 1; cy <= ccy + 1; cy++) for (let cx = ccx - 1; cx <= ccx + 1; cx++) {
         const c = world.peek(cx, cy);
         if (!c) continue;
-        for (const f of c.finds) {
-          const id = cx + ',' + cy + ':' + f.n;
+        for (const [id, f] of sitesIn(c, cx, cy)) {
           if (X.loadsLeft(m, f, id) <= 0) continue;
           consider((f.x + 0.5) * T, (f.y + 0.5) * T, { kind: 'find', key: 'f:' + id, id, find: f, wx: f.x, wy: f.y, x: (f.x + 0.5) * T, y: (f.y + 0.5) * T });
         }
+        // A Kestrel structure is used from its door, once (x.structures). Up to 4 chunks list one: the same door again changes nothing.
+        for (const s of c.structures) {
+          if (!VERB[s.kind] || x.structures[s.id]) continue;
+          consider((s.x + 0.5) * T, (s.y + 0.5) * T, { kind: 'kestrel', key: 's:' + s.id, id: s.id, struct: s, x: (s.x + 0.5) * T, y: (s.y + 0.5) * T });
+        }
       }
       for (const d of x.drops) consider(d.x, d.y, { kind: 'drop', key: 'd:' + d.id, id: d.id, x: d.x, y: d.y });
       if (m.coop) for (const id of Object.keys(x.collapsed)) {
@@ -375,6 +471,7 @@
         return t(f.find.kind === 'science' ? 'eva.survey' : 'eva.collect', { what, s: secs(X.holdSeconds(f.find.kind, role)) });
       }
       if (f.kind === 'drop') return t('eva.pickup', { s: secs(X.holdSeconds('pickup', role)) });
+      if (f.kind === 'kestrel') return t(VERB[f.struct.kind], { what: t('ks.' + f.struct.kind + '.name'), s: secs(X.holdSeconds(f.struct.kind, role)) });
       if (f.kind === 'revive') return t('eva.revive', { name: env.crewName(f.id), s: secs(X.holdSeconds('revive', role)) });
       if (f.kind === 'rover') return t('sf.boardRover');
       return '';
@@ -420,9 +517,9 @@
       for (let cy = SW.chunkOf(ty0); cy <= SW.chunkOf(ty1); cy++) for (let cx = SW.chunkOf(tx0); cx <= SW.chunkOf(tx1); cx++) {
         const c = world.peek(cx, cy);
         if (!c) continue;
-        for (const f of c.finds) {
+        for (const [id, f] of sitesIn(c, cx, cy)) {
           if (f.x < tx0 || f.x > tx1 || f.y < ty0 || f.y > ty1) continue;
-          if (X.loadsLeft(m, f, cx + ',' + cy + ':' + f.n) <= 0) continue;
+          if (X.loadsLeft(m, f, id) <= 0) continue;
           const fx = (f.x + 0.5) * T, fy = (f.y + 0.5) * T;
           out.push({ y: fy + 12, draw: ctx => drawFind(ctx, f, fx, fy, time) });
         }
@@ -435,7 +532,7 @@
       }
       // Dust devils: every screen draws the same ones from the round's clock. Past the edge of your view they fade out, so in
       // a dust storm one can be on you before you see it.
-      const pl = env.player && env.player(), view = Z.viewTiles(m, !!(pl && pl.inRover));
+      const pl = env.player && env.player(), view = viewOf(pl);
       for (const d of Z.devils(m, x0 - T, y0 - T, x1 + T, y1 + 2 * T, clock())) {
         const dist = pl ? Math.sqrt(near2(d.x, d.y, pl.x, pl.y)) / T : 0;
         const a = d.a * Math.max(0, Math.min(1, (view + 1 - dist) / 2));
@@ -472,12 +569,12 @@
       for (let cy = SW.chunkOf(ty - 80); cy <= SW.chunkOf(ty + 79); cy++) for (let cx = SW.chunkOf(tx - 80); cx <= SW.chunkOf(tx + 79); cx++) {
         const c = world.peek(cx, cy);
         if (!c) continue;
-        for (const f of c.finds) {
-          if (X.loadsLeft(m, f, cx + ',' + cy + ':' + f.n) <= 0) continue;
+        for (const [id, f] of sitesIn(c, cx, cy)) {
+          if (X.loadsLeft(m, f, id) <= 0) continue;
           const smelt = sniff && (f.kind === 'ice' || f.sub === 'vent') && near2(f.x, f.y, tx, ty) <= sniff * sniff;
           if (smelt || world.seen(f.x, f.y)) out.push({ x: (f.x + 0.5) * T, y: (f.y + 0.5) * T, color: COLORS[f.kind] });
         }
-        for (const k of c.caves) if (world.seen(k.x, k.y)) out.push({ x: (k.x + 0.5) * T, y: (k.y + 0.5) * T, color: '#1a0d0a', ring: '#e8c9a8' });
+        for (const k of visible(c, 'caves')) if (world.seen(k.x, k.y)) out.push({ x: (k.x + 0.5) * T, y: (k.y + 0.5) * T, color: '#1a0d0a', ring: '#e8c9a8' });
       }
       for (const d of x.drops) out.push({ x: d.x, y: d.y, color: '#f46e5f' });
       if (x.rover && !x.rover.driver) out.push({ x: x.rover.x, y: x.rover.y, color: '#e9e2d8', square: true });
@@ -488,7 +585,7 @@
     return {
       el, alert, sync, reset, canMove, step, focusAt, holdable, hasRoom, label, start, stop, act, canister, drawZone, sprites, drawOver,
       flareFx, suitBar, marks, clock,
-      view: p => Z.viewTiles(mission(), !!(p && p.inRover)),
+      view: viewOf,
       alerting: () => !alert.hidden,
       // While you are down your suit is not sent: a position in flight could undo a revive the server has just made.
       report: () => ({ suit: collapsed(me) ? null : Math.round(suit * 10) / 10, driven: Math.round(driven * 10) / 10 }),
diff --git a/src/ui.js b/src/ui.js
index 15c8767..0f2792c 100644
--- a/src/ui.js
+++ b/src/ui.js
@@ -46,7 +46,7 @@
     prevScreen: null,
     opsView: LS.get('opsView', 'surface'),
     regionsSeen: (rs => (rs && typeof rs.key === 'string' && Array.isArray(rs.list) ? rs : { key: '', list: [] }))(LS.get('regionsSeen', null)),
-    regionCard: null,
+    card: null,           // the card over the surface (a region's fact, a point of interest's): see setCard
     fog: {},
     launchSeen: null, // co-op: the launch number of the mission this tab last showed (see SolFog.isNewLaunch)
   };
@@ -605,72 +605,120 @@
     ];
   }
 
-  // ---------- regions ----------
-  // The first time you walk into a region in a mission: its name and one real fact, with the source. The region's name on
-  // the surface is a button that shows the card again. The card stays while the mouse is on it or it has keyboard focus
-  // (WCAG 2.2.1), and goes 15 s after that.
-  let regionTimer = null, regionIsNew = true;
+  // ---------- the card on the surface ----------
+  // One card at a time over the surface: a region's name and one real fact, with the source, the first time you walk into
+  // it in a mission, and a point of interest's card the first time it is met (a landmark's discovery, a formation's fact
+  // when you survey it, a Kestrel structure's story log). Facts and logs come once a mission: store.regionsSeen keeps the ids
+  // shown (regions' and points of interest's), by mission code and mode. The region's name on the surface is a button that shows
+  // its card again. The card stays while the mouse is on it or it has keyboard focus (WCAG 2.2.1), and goes 15 s after that.
+  let cardTimer = null;
   // Sets the card and changes the live stage in place. The walking loop gets here, and a render() would move the surface
   // node into a new stage, which can drop a touch drag on the joystick and closes an open crew-job dropdown.
-  function setRegionCard(id) {
-    store.regionCard = id;
-    if (!id) clearTimeout(regionTimer);
+  function setCard(c) {
+    store.card = c;
+    if (!c) clearTimeout(cardTimer);
     const stage = document.querySelector('.sf-stage');
     if (!stage) return; // the surface isn't shown: the next render() takes the card from the store
-    const old = stage.querySelector('.region-card'), card = regionCard();
+    const old = stage.querySelector('.region-card'), card = surfaceCard();
     if (old && card) old.replaceWith(card);
     else if (card) stage.appendChild(card);
     else if (old) old.remove();
   }
 
   // The card closes 15 s from now, unless by then the mouse is on it or it has keyboard focus: it then waits another 15 s.
-  // The mouse or the focus leaving the card (see regionCard) starts the 15 s again. Touch never holds it: :hover sticks
+  // The mouse or the focus leaving the card (see surfaceCard) starts the 15 s again. Touch never holds it: :hover sticks
   // after a tap, so only a mouse (hover: hover) counts.
   const canHover = () => !!window.matchMedia && window.matchMedia('(hover: hover)').matches;
-  function armRegionTimer() {
-    clearTimeout(regionTimer);
-    if (!store.regionCard) return;
-    regionTimer = setTimeout(() => {
+  function armCardTimer() {
+    clearTimeout(cardTimer);
+    if (!store.card) return;
+    cardTimer = setTimeout(() => {
       const card = document.querySelector('.region-card');
-      if (card && ((canHover() && card.matches(':hover')) || card.contains(document.activeElement))) armRegionTimer();
-      else setRegionCard(null);
+      if (card && ((canHover() && card.matches(':hover')) || card.contains(document.activeElement))) armCardTimer();
+      else setCard(null);
     }, 15000);
   }
 
-  function showRegionCard(id) {
+  // Is this the first time the card of `id` (a region, or a point of interest) comes up in this mission and mode?
+  function firstTime(id) {
     const s = mission();
     const key = s.seed + '|' + (lanOn() ? 'coop' : 'solo');
     if (store.regionsSeen.key !== key) store.regionsSeen = { key, list: [] };
-    if (store.regionsSeen.list.includes(id)) return;
+    if (store.regionsSeen.list.includes(id)) return false;
     store.regionsSeen.list.push(id);
     LS.set('regionsSeen', store.regionsSeen);
-    regionIsNew = true;
-    setRegionCard(id);
-    armRegionTimer();
+    return true;
+  }
+
+  function showRegionCard(id) {
+    if (!firstTime(id)) return;
+    setCard({ type: 'region', id });
+    armCardTimer();
   }
 
   // The region's name on the surface was selected: read its card again, for another 15 s.
   function reopenRegionCard(id) {
-    regionIsNew = false;
-    setRegionCard(id);
-    armRegionTimer();
+    setCard({ type: 'region', id, again: true });
+    armCardTimer();
+  }
+
+  // A point of interest's card, asked for by the surface (src/surface-eva.js) or a crewmate's discovery (onEvent): { type:
+  // 'landmark', id, kind, by, science } (science: null when not known), { type: 'formation', id, kind } or { type: 'log', id,
+  // kind } (a Kestrel structure's story log, its id the structure's). A fact or a log is reading, shown once a mission code
+  // as a region's is; a discovery is this mission's event (the rules make it once), shown whenever it happens. The
+  // discoverer's own tab hears of it twice, its answer and the server's event, in either order: the second only adds the
+  // reward when the first had none.
+  function showCard(c) {
+    if (!c || !mission()) return;
+    const cur = store.card;
+    if (cur && cur.id === c.id) {
+      if (cur.science == null && c.science != null) setCard(Object.assign({}, cur, { science: c.science }));
+      return;
+    }
+    if (c.type !== 'landmark' && !firstTime(c.id)) return;
+    setCard(c);
+    armCardTimer();
+  }
+
+  // A server event (src/net.js): a crewmate's discovery opens its card on every tab (spec §5, C6). The event names the
+  // landmark by id; its kind is the world's.
+  function onEvent(d) {
+    const s = mission(), g = d && d.kind === 'discover' && /^L(-?\d+),(-?\d+)$/.exec(d.landmark);
+    const l = s && g && W.landmarkAt(W.seedOf(s.seed), Number(g[1]), Number(g[2]));
+    if (l) showCard({ type: 'landmark', id: l.id, kind: l.kind, by: d.by, science: Number.isFinite(d.science) ? d.science : null });
+  }
+
+  // What a card says, in the language of the moment: { cls, eyebrow, title, meta, body, src } (meta: a discovery's reward
+  // and finder; src: a real fact's source, when the sources table has it).
+  function cardText(c) {
+    if (c.type === 'region') return { cls: '', eyebrow: t(c.again ? 'region.note' : 'region.new'), title: t('region.' + c.id), body: t('region.fact.' + c.id), src: I.SOURCES[I.REGION_SOURCES[c.id]] };
+    if (c.type === 'landmark') {
+      const stem = D.LANDMARKS.kinds[c.kind].fact, meta = [c.science != null ? t('haul.science', { n: nf(c.science) }) : null, t('disc.by', { name: crewName(c.by) })];
+      const src = I.LANDMARK_SOURCES ? I.SOURCES[I.LANDMARK_SOURCES[c.kind]] : null;
+      return { cls: ' disc', eyebrow: t('disc.new'), title: t(stem + '.name'), meta: meta.filter(Boolean).join(' · '), body: t(stem + '.fact'), src };
+    }
+    if (c.type === 'formation') {
+      const stem = D.FORMATIONS.kinds[c.kind].fact, src = I.FORMATION_SOURCES ? I.SOURCES[I.FORMATION_SOURCES[c.kind]] : null;
+      return { cls: '', eyebrow: t('disc.formation'), title: t(stem + '.name'), body: t(stem + '.fact'), src };
+    }
+    const stem = D.STRUCTURES.kinds[c.kind].log; // a Kestrel structure's story log: fiction (ks.label says so), no source
+    return { cls: ' log', eyebrow: t('ks.label'), title: t(stem + '.name'), body: t(stem + '.log'), src: null };
   }
-
-  function regionCard() {
-    const id = store.regionCard;
-    if (!id) return null;
-    const src = I.SOURCES[I.REGION_SOURCES[id]];
+  function surfaceCard() {
+    if (!store.card) return null;
+    const { cls, eyebrow, title, meta, body, src } = cardText(store.card);
     const card = h('aside', {
-      class: 'region-card', role: 'status', 'aria-live': 'polite',
-      onpointerleave: e => { if (e.pointerType === 'mouse') armRegionTimer(); },
-      onfocusout: e => { if (!card.contains(e.relatedTarget)) armRegionTimer(); },
+      class: 'region-card' + cls, role: 'status', 'aria-live': 'polite',
+      onpointerleave: e => { if (e.pointerType === 'mouse') armCardTimer(); },
+      onfocusout: e => { if (!card.contains(e.relatedTarget)) armCardTimer(); },
     },
       h('div', { class: 'region-card-h' },
-        h('span', { class: 'eyebrow' }, t(regionIsNew ? 'region.new' : 'region.note')),
-        h('button', { class: 'sf-x', type: 'button', 'data-k': 'region-close', 'aria-label': t('common.close'), onclick: () => setRegionCard(null) }, '×')),
-      h('h3', null, t('region.' + id)),
-      h('p', null, t('region.fact.' + id)),
-      h('p', { class: 'src' }, t('region.source') + ': ', h('a', { href: src.url, target: '_blank', rel: 'noopener' }, src.label)));
+        h('span', { class: 'eyebrow' }, eyebrow),
+        h('button', { class: 'sf-x', type: 'button', 'data-k': 'region-close', 'aria-label': t('common.close'), onclick: () => setCard(null) }, '×')),
+      h('h3', null, title),
+      meta ? h('p', { class: 'meta' }, meta) : null,
+      h('p', null, body),
+      src ? h('p', { class: 'src' }, t('region.source') + ': ', h('a', { href: src.url, target: '_blank', rel: 'noopener' }, src.label)) : null);
     return card;
   }
 
@@ -735,6 +783,7 @@
       showRegionCard(id);
     },
     reopenRegion: id => { if (W.REGIONS.includes(id)) reopenRegionCard(id); },
+    card: c => showCard(c),
     // Exploring (the rules' one table, Z.act). Solo: the rules run here for your pilot on your mission, which is saved, and
     // that includes the solar flare. Co-op: the server runs them against where it last saw you, and everyone gets the new
     // room. Always resolves to { ok, ... } or { error }.
@@ -820,7 +869,7 @@
       // The Display settings of this device: the graphics level, the FPS limit and the readout.
       gfx: { quality: store.settings.gfx, fpsCap: store.settings.fpsCap, showFps: store.settings.showFps },
     });
-    return h('div', { class: 'sf-stage' }, node, regionCard());
+    return h('div', { class: 'sf-stage' }, node, surfaceCard());
   }
 
   // Co-op: your astronaut died, or you have none: take over a free crewmate, or watch.
@@ -892,6 +941,8 @@
   function hud(s, f) {
     const season = E.seasonAt(s.sol);
     const weather = s.schedule[s.turn].weather;
+    const next = X.forecastAhead(s); // a repaired weather station's forecast (C1): next round's weather, or null
+    const wx = w => (w === 'global' ? 'crit' : w === 'regional' ? 'warn' : '');
     const remaining = (D.TURNS - s.turn) * D.TURN_SOLS;
     const track = h('div', { class: 'track', 'aria-label': t('ops.round', { n: s.turn + 1, m: D.TURNS }) },
       Array.from({ length: D.TURNS }, (_, i) => {
@@ -921,7 +972,8 @@
         track,
         h('div', { class: 'topbar-actions' },
           h('span', { class: 'chip' }, t(seasonKey(season.ls)) + ' · Ls ' + Math.round(season.ls) + '°'),
-          h('span', { class: 'chip ' + (weather === 'global' ? 'crit' : weather === 'regional' ? 'warn' : '') }, t('weather.' + weather)),
+          h('span', { class: 'chip ' + wx(weather) }, t('weather.' + weather)),
+          next ? h('span', { class: 'chip fc ' + wx(next), title: t('eva.forecastBy') }, t('eva.forecast', { w: t('weather.' + next) })) : null,
           lanOn() ? lanChip() : null,
           h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.help'), onclick: () => { store.modal = 'help'; render(); } }, ico('help')),
           h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': t('nav.notes'), onclick: () => { store.modal = 'notes'; render(); } }, ico('book')),
@@ -1647,7 +1699,7 @@
     if (r.error) { store.lanError = t('lan.' + r.error) || r.error; render(); return; }
     store.lan = N.session();
     store.modal = null;
-    N.connect(onRoom, onLanStatus, onPos, onFog);
+    N.connect(onRoom, onLanStatus, onPos, onFog, onEvent);
   }
 
   async function joinRoom(code, name) {
@@ -1655,7 +1707,7 @@
     if (r.error) { store.lanError = I.has(store.lang, 'lan.' + r.error) ? t('lan.' + r.error) : r.error; render(); return; }
     store.lan = N.session();
     store.modal = null;
-    N.connect(onRoom, onLanStatus, onPos, onFog);
+    N.connect(onRoom, onLanStatus, onPos, onFog, onEvent);
   }
 
   // Desktop app only: a friend's game on another PC opens in the normal browser (see app/join.js).
@@ -1882,7 +1934,7 @@
         let joinCode = null;
         try { joinCode = new URLSearchParams(location.search).get('join'); } catch (e) { /* no query */ }
         const invited = !s && !!joinCode && /^[A-Za-z]{1,6}$/.test(joinCode);
-        if (s) { store.lan = s; N.connect(onRoom, onLanStatus, onPos, onFog); }
+        if (s) { store.lan = s; N.connect(onRoom, onLanStatus, onPos, onFog, onEvent); }
         else if (invited) { store.lanForm.code = joinCode.toUpperCase(); store.modal = 'lan'; }
         render();
         if (invited) { const el = document.getElementById('lan-me'); if (el) el.focus(); }
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: the Step 2 command, then `npm test`.
Expected: PASS; 470 tests.

- [ ] **Step 5: Check it in the browser** on 5071 with a scratch `--data` folder and mission code `PAINT-QA-1`. **Solo:** use each structure kind once (a full backpack at the wreck: the rest waits at the door, and the prompt then picks it up); walk into a pod (refill, its log); discover a landmark (the card: name, `+N science · found by …`, fact, source); survey a formation (its fact and source); repair a weather station (the "Next round" chip, the top bar still one row at 1280 px); a flare with you in a pod and in a lava tube during a dust storm (covered; the headlamp sees 8 tiles). **Co-op, two tabs in one window:** one discovers, both get the card with the reward; one opens a cache, the other sees it done and gets no prompt. Then switch to Vietnamese and look at the card, a log and the chip. The dry run measured a median of 163.9 fps at Best before and after (the display's cap).

- [ ] **Step 6: Commit**

```bash
git add src/surface-eva.js src/ui.js src/net.js src/style.css src/i18n.js lib/ws.js test/i18n.test.js test/net.test.js test/surface-eva.test.js test/ui.test.js
git commit -m "feat(surface-eva): use the points of interest: holds, discovery and story-log cards, pod refills, the forecast chip" -m "The view comes from the tile under you; nothing hidden under a footprint is offered; structures open, salvage and repair with their own verbs; a pod refills on walking in; a landmark in view is discovered and its card opens on every tab; a repaired weather station shows next round's weather.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: QA, docs, version 3.5.0 and the installer

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md`:
  - §12: tick "Landmarks with discovery cards (M4c)" and "Random structures and natural formations (M4c)";
  - the Status line reads "M1–M3, M4a, M4b and M4c shipped (v3.5.0); M4d and M5 to do";
  - §4: `mission.forecastBonus` → `x.forecastUntil` (a round, `-1` none), read by `X.forecastAhead`; §5's API list as built (`interact`, `discover`, `refill`, `forecastAhead`, `mastMarks`); §3.6: a discovery may be claimed from 15.5 tiles;
  - §13 gains item 11: Ruling 1 (the weather station's forecast), approved by the user on 2026-10-21 ("yes that what i want").
- Create: `docs/superpowers/plans/2026-10-21-sol500-m4c-followups.md`
- Modify: `package.json` (`"version": "3.5.0"`)
- Rebuild: `dist/` (`node tools/build.js`, committed), `dist-app/` (git-ignored)

- [ ] **Step 1: Browser QA** (solo and co-op; English and Vietnamese; offline) on a QA server with a fresh `--data` folder. Save logs and screenshots under `.superpowers/` (git-ignored).
  1. **Every Task 8 Step 5 and Task 10 Step 5 check**, on the final code.
  2. **An old save.** Put a 3.4.0-shaped save in `localStorage['sol500.save']`: its expedition has no `forecastUntil`, and `structures` / `landmarks` are `{}`. Reload. Expected: "Resume" works with no console error; `forecastUntil` is `-1`; a structure can be used and a landmark discovered.
  3. **Co-op with three players:** two walk up to one landmark together; one discovers it, every tab shows one card, the reward is banked once. A full backpack at a wreck: the rest waits at the door, and a teammate can pick it up.
  4. **Offline file.** `node tools/build.js`, then open `dist/sol500.html` from disk: structures, a pod refill and a discovery card work there.
  5. **Performance.** Walk across a structure-dense Plains area at Best and at Fast: median fps no lower than before (the dry run: unchanged); the debug box's paint median stays at 2 ms or less; `npm test` takes about as long as before.
- [ ] **Step 2: Docs**
  - The spec changes listed under **Files**.
  - Write `docs/superpowers/plans/2026-10-21-sol500-m4c-followups.md`: the measured numbers (QA, fps, balance, chunk build time); everything reviews defer, sorted into M4d and M5; at least the items under "For later plans" below; anything QA finds and doesn't fix.
- [ ] **Step 3: Version and builds**
  1. Set `package.json` to `3.5.0`.
  2. `node tools/build.js`: commit `dist/`.
  3. `npm run app`: this builds `dist-app/SOL500-Setup-3.5.0.exe`.
  4. `npm run smoke` must report `ok: true`.
  5. Install silently over 3.4.0, the same way as for 3.4.0; check the installed `app.asar` matches HEAD.
  6. Launch check, read-only, with an empty `--user-data-dir`: the app opens, a solo mission shows a structure and a discovery card, and the admin Project tab lists the M4c items ticked.
  7. Kill leftover `electron.exe` and `cloudflared-*.exe` by PID.
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md docs/superpowers/plans/2026-10-21-sol500-m4c-followups.md package.json dist/
git commit -m "chore: M4c complete (landmarks and discovery cards, Kestrel structures, natural formations), version 3.5.0, offline build refreshed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Ask before merging.** The final whole-branch review and its fix wave come first. Then offer the user the merge (for M1–M4b they chose "Merge back to master locally").

---

## Measured in the dry run

**Tests:** 470 of 470 (354 before): 372 after Task 1, 382, 393, 400, 419, 422, 423, 440, 447, 470.

**The world** (3 seeds, before and after alternated 3 times):
- Chunk build median 0.11 → 0.16 ms scattered, 0.09 → 0.10 ms walking; slowest 2.66 ms (budget 4). The rise is the structure check: the first chunk of a 64-tile cell builds a few terrain chunks for the reachability search.
- 0 tiles changed outside footprints and their aprons on 6 seeds. 28 % of landmark boxes cut a feature, which keeps its part outside the box.

**Balance** (`node tools/balance.js` = 1,000 runs × 3 difficulties; only the Thoughtful runs explore the points of interest):

| Bot | Cadet | Commander | Veteran |
|---|---|---|---|
| Careless | 24.7 % | 3.3 % | 0.0 % |
| Careless + explorer | **31.1 %** (M4b 31.1) | **9.7 %** (9.6) | **1.2 %** (1.2) |
| Sloppy | 100.0 % | 98.1 % | 66.8 % |
| Sloppy + explorer | 100.0 % | 100.0 % | 96.9 % (97.0) |
| Thoughtful | 100.0 % | 99.9 % | 99.7 % |
| Thoughtful + explorer | 100.0 % | 100.0 % | 99.9 % |

- Largest change in success: 1.0 point (commander, thoughtful with a solar-only base + explorer, 96.1 → 97.1 %).
- **Score:** the thoughtful explorer's average rises by about 440 (commander 1,712 → 2,151; science 958 → 1,397; loads over 20 rounds 82.4 → 105.5), mostly from second suits at hab pods near the base (FARM-1: 92 → 146 loads, 16 refills). This adds to the grade inflation already parked for M4d's rebalance.

**Frame rate** (Best, before and after alternated, 3 runs each): the painting, 131.6 → 131.6 fps median (Fast 129.9 → 131.6); the interaction, 163.9 → 163.9 (the display's cap). Each "after" run had one 12 ms frame, a discovery card's re-render.

**Browser** (the dry run's checks): every kind on the real surface looked at and fixed (the ice scarp reads as a cliff; the crest keeps its ripples); solo, every structure kind, a pod refill, a discovery (not made with the centre 9 tiles away, made at 8), a formation survey, the forecast chip, a flare covered in a pod and in a tube during a global storm, in English and Vietnamese; co-op, two tabs: both get the discovery card, and a cache used in one is done in the other.

## For later plans

- **M4d:**
  - the final rebalance: the thoughtful explorer's score +≈440 from M4c, on top of the grade inflation and the sloppy-bot target already parked;
  - achievements and expedition goals for landmarks discovered and structures used (`x.stats[crewId].landmarks/structures` are recorded) and the history record's `explore` counters; an achievement toast can reuse the card slot;
  - whether "Take shelter" on the solar-storm card should protect crew on the surface (recorded at the M4b merge);
  - beacons join the cover lister and the refill rule the pods use.
- **M5:**
  - follow-ups line 108: `S.nextDraw = 0` in `resize()`, so a window drag under an FPS limit draws at once;
  - a boulder drawn on its neighbours' ground (today a boulder sits on the region's sand patch, a blocky square round it);
  - the card's eyebrow "Kestrel Survey log · story, fictional" wraps onto two lines at 1280 px.

## Self-review (done while writing this plan)

- **Spec coverage, the M4c items:**
  - landmarks with discovery cards: placement Task 2, discovery Tasks 5, 6 and 10, drawing Tasks 4 and 8, facts and sources Task 9;
  - Kestrel structures: placement Task 3, rules Tasks 5 and 6, sprites Tasks 4 and 8, prompts, logs and the forecast Tasks 9 and 10;
  - natural formations and decor: placement Task 3, surveys Tasks 5 and 10, drawing Tasks 4 and 8, facts Task 9;
  - lava tubes and hab pods as cover, the headlamp and the crest (§3.4, §3.6): Tasks 1, 5, 8 and 10;
  - the bot and balance: Task 7.
- **Placeholders:** every code step carries an exact diff, generated from the tested dry-run commits and checked to rebuild `607ae78` from this document alone.
- **Type consistency:** these names are used identically everywhere: `Z.coversIn`, `Z.shelterAt`, `Z.slackOf`, `Z.outside`, `Z.act`, `Z.viewAt`; `X.landmarksIn`, `X.structuresIn`, `X.landmarkById`, `X.structureById`, `X.discover`, `X.interact`, `X.refill`, `X.holdSeconds`, `X.forecastAhead`, `X.mastMarks`; `x.forecastUntil`, `x.structures[id] = 'used' | 'repaired'`, `x.landmarks[id] = { by, round }`, `x.refills[crewId]`; `c.landmarks`, `c.structures`, `c.formations`, `c.props`, `c.hidden.finds`, `c.hidden.caves`; the event `{ kind: 'discover', landmark, by, science }`; `store.card`.
- **Error strings:** every error code the new actions can return (`noLandmark`, `known`, `noStructure`, `badKind`, `done`, `refilled`) has an `eva.err.*` string in both languages (Task 10's test), so co-op never turns one into "no answer from the server".
- **Review Focus:** each of the five lines has its test in the owning task, and lines 1, 3 and 5 a browser step in Task 11.
