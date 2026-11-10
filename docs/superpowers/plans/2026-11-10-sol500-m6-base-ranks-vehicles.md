# SOL 500 M6: base ranks, the Garage and the Fabricator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The player upgrades the base with materials through four ranks (Camp → Outpost → Station → Colony) that grow its land and limits and unlock the Garage (pressurised rover, scout drone, today's rover), the Fabricator (four gear lines) and Colony's sample return and self-sufficiency; shipped as 3.8.0 by midday on 13 November 2026.

**Architecture:** Ranks are mission state (`s.rank`, `s.gear` on the mission root) read through a few engine helpers (`E.rankOf`, `E.landOf`, `E.onLand`, `E.maxOf`, `E.costOf`), so the grid keeps today's coordinates (HQ at grid `[4, 2]`) and simply allows spots past the old edges, including negative ones. Everything new is a build in the existing build pipeline (materials + crew work, finished at a round's advance). Effects live where today's rules live: the base zone and gear in `src/expedition.js` (shared by client and server), production and score in `src/engine.js`, vehicles in the expedition actions table.

**Tech Stack:** plain browser JavaScript (UMD modules), Node with no dependencies, `node:test`, Electron for the app.

**Spec:** `docs/superpowers/specs/2026-11-10-sol500-m6-base-ranks-vehicles-design.md` (approved 2026-11-10). Read it first; this plan argues from it.

## Global Constraints

- Node, no new dependencies. The game runs as the app, in a browser and from the offline file.
- Numbers only in `src/data.js` (physics tuning sits beside today's `ROVER` in `src/physics.js`, as now); every string in `src/i18n.js` in both languages.
- Test first for rules. Existing tests stay green; a test that pins the Full mission's old balance may change only on purpose, with the reason in the commit.
- Old saves load: a 3.7.0 save (Full or Quick) resumes as a Camp with its buildings in place. The mission `version` stays 2 (`src/saves.js` and `lib/history.js` require it).
- NASA facts only from cited sources (Task 0's `sources.md`); if a source can't be found, the line is about the game's rule and names no source.
- **The base never upgrades by itself:** every rank-up, vehicle and gear level is the player's build, paid with materials (plus crew work). Any materials pay (one pile).
- **The Quick mission's rules and numbers don't move:** no rank-up, Garage, Fabricator or gear in a Quick mission (`s.quick === true`); `test/quick.test.js` stays green unchanged.
- **The world doesn't change:** the world hash `3ae4db5e` and `src/worldgen.js` stay as they are; every rank's land lies inside the world's flat disc around the HQ (`dx² + dy² ≤ 169`, worldgen `(FLAT_RADIUS + 1)²`).
- Camp is exactly today's base: `buildTerrain(seed)` is unchanged, so ice and rock for a mission code are where they were.
- The pressurised rover is not flare cover (`shelterAt` in `src/dangers.js` stays position-only).
- Vietnamese: the rover is "xe thám hiểm", the base "căn cứ", the relay beacon "trạm chuyển tiếp".
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (not your own model's name).
- The working tree is CRLF (`core.autocrlf=true`): patch scripts normalise line endings.
- A GateGuard hook asks for facts before the first edit of each file and before "destructive" git commands: present them, then retry the identical call.
- Commit early and in small slices (agents die with their sessions); reviewers save their report as they go.
- One browser QA at a time; it waits while any `node --test` runs. At most two Chrome windows; close each tab when its check is done.
- On Windows, kill leftover `electron.exe` and `cloudflared-*.exe` you started, by PID. Stop any old server on 5050 before testing; QA servers use 5071.

## Review Focus

1. **A 3.7.0 save** (solo Full and solo Quick) with no `rank`, `gear` or new `modules.<type>` keys: Resume, plan a build and advance without throwing, as a Camp with every building where it was. → Task 1, `test/ranks.test.js` "a 3.7.0 save resumes as a Camp".
2. **Duplicate or forged builds:** two co-op players queue the same rank-up or gear level in one round, or a client sends a locked or unaffordable build: it is taken once (or not at all) and paid once. → Task 1, "a rank-up queued twice in one round is built once and paid once" and "a locked build sent anyway is refused".
3. **A building on the newest edge of the land** (negative grid x or y) is drawn on the right world tile on the surface and in the console map, and survives a reload. → Task 2 "a building at a negative grid spot stands on its world tile" and Task 3 "the console map shows the whole land, negative spots included".
4. **Standing between the old and new base-zone edges** when a rank arrives: delivering and the suit pause agree between client and server, both reading the rank's zone. → Task 2 "the base zone is the rank's, the same for the server and the surface".
5. **A suit already partly used when bigger tanks finish:** it keeps its seconds left, refills to the new size, and the HUD bar never shows over 100 %. → Task 4 "bigger tanks keep the seconds left and refill to the new size".

---

## How the work runs

| Wave | Tasks (parallel within a wave) | Base |
|---|---|---|
| A | **T0** sources (research) ‖ **T1** ranks in the rules | `feat/m6-base-ranks-vehicles` |
| B | **T2** land and zone on the surface ‖ **T3** console, cards, art ‖ **T4** Fabricator gear ‖ **T5** Colony | A merged |
| C | **T6** pressurised rover ‖ **T7** scout drone | B merged |
| D | **T8** balance ‖ **T9** Showcase | C merged |
| E | **T10** release 3.8.0 | D merged |

Each task runs in its own worktree (`git worktree add -b m6-t<N> <scratchpad>/wt-t<N> <base>`, `node_modules` as a PowerShell junction) and gets a task review before it merges. **Cut line:** if the clock runs short, T7 then T6 are left out by switching `D.M6.drone` / `D.M6.cabin` off (spec §9), never shipped half-done. Target times: wave A by the night of 10 Nov, B by midday 11 Nov, C by the night of 11 Nov, D by midday 12 Nov, T10 and QA by the night of 12 Nov, leaving the morning of 13 Nov for fixes.

**File ownership in waves B and C** (to keep merges clean): T1 writes every new data table and every new module/build entry and the module names in both languages, each language's M6 strings under one comment anchor per task (`// M6 T3`, `// M6 T4`, … each followed by at least one key so anchors never touch). A later task adds its strings only under its own anchor, and changes only its own table in `src/data.js`.

---

### Task 0: Sources for every NASA fact

**Files:**
- Create: `.superpowers/sdd/2026-11-10-sol500-m6/sources.md`
- Modify: `src/i18n.js` (`SOURCES` at :11 and `SOURCE_VI` at :2509 only)
- Test: `test/i18n.test.js` (existing source tests must pass)

**Interfaces:**
- Produces: `I.SOURCES` keys `m6Basecamp`, `m6Habitat3d`, `m6Isru`, `m6Pressurized`, `m6Ingenuity`, `m6Moxie`, `m6Samples`, `m6Printing` (rename or drop one only if no source can be found; `sources.md` says which), each `{ label, url }` with a `SOURCE_VI` label. For each key, `sources.md` gives: the URL (nasa.gov, jpl.nasa.gov, science.nasa.gov or the agency partner's own page), the page title, the exact sentence quoted from the page, and one or two English sentences the game may say that the quote supports.

Facts to find, one source each:
1. NASA's Artemis Base Camp plans (Outpost card).
2. Building with Martian or lunar regolith, e.g. NASA's 3D-Printed Habitat Challenge (Station card).
3. Living off the land: in-situ resource utilisation on Mars (Colony card, self-sufficiency).
4. The Artemis pressurised rover, NASA with JAXA (pressurised rover).
5. Ingenuity, the Mars helicopter that flew with Perseverance, and whether its flights were planned round dust or seasons (drone; if not supported, the drone's storm line names no source).
6. MOXIE making oxygen from Mars's carbon dioxide on Perseverance (bigger suit tanks).
7. The sample tubes Perseverance collects and NASA's plans to return them (sample return).
8. Making parts in space, e.g. the 3D printer on the International Space Station (Fabricator).

- [ ] **Step 1:** Research each fact on the web; write `sources.md` with the four items per key. A fact whose page can't be reached or doesn't say it is marked "not found", with what was tried.
- [ ] **Step 2:** Add the found keys to `SOURCES` and `SOURCE_VI` in `src/i18n.js`.
- [ ] **Step 3:** Run `node --test test/i18n.test.js` — Expected: PASS.
- [ ] **Step 4:** Commit `feat(sources): the NASA sources for M6's ranks, vehicles and gear` (with `sources.md` committed too: it is in the git-ignored `.superpowers/`, so copy it to `docs/superpowers/plans/2026-11-10-sol500-m6-sources.md` as well).

---

### Task 1: Ranks in the rules

**Files:**
- Modify: `src/data.js` (new tables after `GRID`; new `MODULES`, `BUILDS` entries; `MODULE_TYPES`, `PLACED`, `BREAKDOWN`, `BUILD_ORDER`)
- Modify: `src/engine.js` (grid helpers, `canBuild`, the builds section of `resolveTurn` at :743-750, project completion at :966-975, `beginTurn` events, `upgradeMission` at :437, exports at :1397)
- Modify: `src/i18n.js` (module names, both languages; the per-task anchors), `src/ui.js` (`GUIDE` buildings list only)
- Create: `test/ranks.test.js`

**Interfaces:**
- Produces (data, `src/data.js`; starting values, Task 8 tunes them):
  - `LAND_R2: 169` — comment: must equal worldgen `(FLAT_RADIUS + 1) ** 2`.
  - `RANKS: [ { id:'camp', w:9, h:5, zone:2 }, { id:'outpost', w:15, h:9, zone:3, materials:800, work:2, ice:3, rock:4, max:{ solar:4, battery:2, greenhouse:1, icedrill:1, habitat:1, garage:1, cabin:1, drone:1 } }, { id:'station', w:21, h:13, zone:4, materials:1600, work:3, ice:3, rock:5, max:{ solar:4, battery:2, greenhouse:2, oxygen:1, icedrill:1, fabricator:1 } }, { id:'colony', w:27, h:17, zone:5, materials:2800, work:4, ice:4, rock:6, max:{ solar:4, battery:2, greenhouse:2, oxygen:1, icedrill:1, reactor:1, launchpad:1 } } ]`
  - `M6: { gear: true, colony: true, cabin: true, drone: true }` — the tier switches (spec §9). Tier of each new type: `fabricator`, `tanks`, `backpack`, `racks`, `tools` → gear; `launchpad`, `launch` → colony; `cabin` → cabin; `drone` → drone.
  - `MODULES` += `garage:{kw:0,max:0}`, `fabricator:{kw:0,max:0}`, `launchpad:{kw:0,max:0}`, `cabin:{kw:0,max:0}`, `drone:{kw:0,max:0}` (max 0: only a rank's `max` opens them). `MODULE_TYPES` += the five; `PLACED` += `garage`, `fabricator`, `launchpad`, `cabin` (the drone lives in the Garage, no tile); `BREAKDOWN` 0 for the five.
  - `BUILDS` += `rankup:{materials:0,work:0}` (its cost is the next rank's), `garage:{materials:600,work:2}`, `fabricator:{materials:800,work:3}`, `launchpad:{materials:1000,work:3}`, `rover:{materials:500,work:2,needs:'garage'}`, `cabin:{materials:900,work:3,needs:'garage'}`, `drone:{materials:300,work:1,needs:'garage'}`, `tanks|backpack|racks|tools:{materials:0,work:0,needs:'fabricator'}` (cost from `GEAR`), `launch:{materials:0,work:0,needs:'launchpad'}` (cost from `COLONY.launch`). `BUILD_ORDER` is **not** changed here: Task 3 adds the new rows together with the code that hides locked ones, so the console never shows a locked row with a missing reason.
  - `GEAR: { tanks:{ levels:[{materials:300,water:100,work:1,value:200},{materials:500,water:200,work:1.5,value:250}] }, backpack:{ levels:[{materials:250,work:1,value:4},{materials:400,work:1.5,value:5}] }, racks:{ levels:[{materials:300,work:1,value:12},{materials:500,work:1.5,value:16}] }, tools:{ levels:[{materials:250,work:1,value:0.8},{materials:400,work:1.5,value:0.6}] } }` (`value` = the suit seconds, loads on foot, loads in a rover, and the factor on hold seconds).
  - `COLONY: { launch:{ materials:600, work:2, share:0.3, cap:120 }, selfSufficient:1.2 }`.
  - `DRONE: { flights:3, range:40, reveal:16 }`, and in `EXPEDITION`: `cabin:{ range:800, drain:0, home:6 }`.
- Produces (engine, all exported from `src/engine.js`):
  - `rankOf(s) → 0..3` (`s.rank`, 0 when missing or invalid)
  - `landOf(s) → { x0, y0, x1, y1 }` — inclusive grid bounds: `hq ± floor(w/2)`, `hq ± floor(h/2)` of `D.RANKS[rankOf(s)]`
  - `onLand(s, x, y) → boolean` — inside `landOf(s)` and `(x−hq.x)² + (y−hq.y)² ≤ D.LAND_R2`
  - `landTiles(s) → [[x, y]]` — every `onLand` tile, row by row (replaces `allTiles()` for every caller)
  - `maxOf(s, type) → number` — `D.MODULES[type].max` plus every reached rank's `max[type]`; 0 when the type's tier is switched off or `s.quick`
  - `unlockRank(type) → number` — the first rank whose `maxOf` would be over 0 for a module (or whose `needs` building can first exist), `-1` if its tier is off
  - `costOf(s, type) → { materials, water, work }` — `rankup`: the next rank's; gear: the next level's; `launch`: `COLONY.launch`; else `BUILDS[type]` (water 0)
  - `zoneOf(s) → tiles` — `D.RANKS[rankOf(s)].zone`
  - `grantRank(s, rank)` — sets the rank and grows the land and terrain at once, for tests and the Showcase (Task 9); the advance uses the same code
  - state: `s.rank` (0..3), `s.gear = { tanks:0, backpack:0, racks:0, tools:0 }` (levels bought), `s.launched` (boolean), `s.pending.rank` (null or the rank reached), event `{ type:'rank_up', rank }`
  - `canBuild(s, type, pending)` reasons, added to today's: `'rank'` (unlocked by a later rank: Task 3 hides the row), `'needs'` (its building isn't built and working), `'quick'` (an M6 build in a Quick mission), `'water'` (not enough water for a gear level). Today's reasons are unchanged for today's builds.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests** in `test/ranks.test.js` (use `test/engine.test.js`'s `kit()`/`calm()` pattern; give materials with `s.resources.materials = …` and crew construction with the plan's jobs):

```js
test('a new mission is a Camp on the 9 × 5 land, with the ice and rock of 3.7.0', () => {
  const s = calm();
  assert.equal(E.rankOf(s), 0);
  assert.equal(E.landTiles(s).length, 45);
  assert.deepEqual(E.landOf(s), { x0: 0, y0: 0, x1: 8, y1: 4 });
  // terrain pinned as test/engine.test.js:131-148 pins it: same ice and rock for the same code
});
test('a rank-up costs its materials and crew work and arrives at the advance', () => {
  // materials = D.RANKS[1].materials + 50; builds [{type:'rankup'}]; enough construction to finish
  // after resolveTurn: rankOf 1, materials down by D.RANKS[1].materials (plus regolith), report.completed has 'rankup',
  // the next round's events include { type:'rank_up', rank: 1 }
});
test('a rank-up the base cannot afford is refused, and Colony is the last rank', () => {
  // canBuild(s,'rankup').reason === 'materials'; grantRank(s,3) → canBuild reason 'max'
});
test('a rank-up queued twice in one round is built once and paid once', () => {
  // plan.builds [{type:'rankup'},{type:'rankup'}] → one project, materials paid once; canBuild with pending [{type:'rankup'}] → 'max'
});
test('each rank grows the land on every side, inside the flat disc, and keeps every building', () => {
  // for r = 1..3: grantRank(s, r); every earlier s.layout entry unchanged; landTiles(s) all satisfy dx²+dy² ≤ 169 and are inside landOf;
  // some tile has x < 0 and some y < 0; counts strictly grow; D.LAND_R2 === (W.FLAT_RADIUS + 1) ** 2
});
test('new land gets its own ice and rock, the same for the same mission code, and the old terrain stays', () => {
  // two missions with one code ranked to 2 have equal terrain; the Camp entries are a prefix/subset unchanged;
  // ice grows by RANKS[1].ice + RANKS[2].ice, all new ice and rock on land outside the earlier rank's land
});
test('a rank raises the building limits', () => {
  // maxOf(s,'solar') === 12 at Camp, 12 + RANKS[1].max.solar at Outpost; canBuild solar 'max' at 12 built becomes ok after the rank
});
test('the Garage opens at Outpost, and the Garage builds the rover, the pressurised rover and the drone', () => {
  // Camp: canBuild 'garage' → 'rank'; Outpost: ok with materials and a free spot next to the base
  // rover 0 in the kit: canBuild 'rover' → 'needs' until a garage is built and working, then ok; 'cabin' and 'drone' likewise
});
test('gear needs a working Fabricator, costs the next level, and stops at the last level', () => {
  // grantRank(s,2) + a fabricator in layout/modules: canBuild 'tanks' ok; cost === GEAR.tanks.levels[0]; after it finishes s.gear.tanks === 1
  // water short → 'water'; s.gear.tanks === levels.length → 'max'
});
test('a locked build sent anyway is refused', () => {
  // at Camp, plan.builds [{type:'garage',x,y},{type:'tanks'},{type:'launch'}] → no projects, no materials spent
});
test('a tier switched off hides its unlocks', () => {
  // with D.M6.gear = false (restore after): maxOf(s,'fabricator') === 0 at Station, unlockRank('fabricator') === -1
});
test('a Quick mission has no ranks', () => {
  // E.createMission({ quick: true, ... }): canBuild 'rankup' and 'garage' → 'quick'; landTiles length 45
});
test('a 3.7.0 save resumes as a Camp', () => {
  // take a played mission, delete m.rank, m.gear, m.launched, m.pending.rank and every new modules key
  // (garage, fabricator, launchpad, cabin, drone); E.upgradeMission(m) → rankOf 0, gear zeros, modules present with count 0;
  // E.canBuild(m,'garage') runs; E.resolveTurn(m, E.defaultPlan(m)) does not throw; layout unchanged. Same for a Quick save.
});
```

- [ ] **Step 2:** Run `node --test test/ranks.test.js` — Expected: FAIL (`E.rankOf is not a function`).
- [ ] **Step 3:** Add the data tables and entries to `src/data.js` exactly as in Interfaces.
- [ ] **Step 4:** Implement the engine helpers and replace every `allTiles()` caller (`buildTerrain` keeps using the 9 × 5 Camp land so 3.7.0 terrain is unchanged; `buildSpots`, `autoPlace`, `tileSets` use `landTiles(s)`). `grantRank(s, r)` raises `s.rank` one step at a time and, for each new rank, adds `RANKS[r].ice` ice and `RANKS[r].rock` rock tiles chosen with `rng(s.seed, 'terrain' + r)` from the new rank's land minus the earlier land, ice at `cheb ≥ 3`, never on a built or queued tile.
- [ ] **Step 5:** Generalise `canBuild` (`costOf` for the cost and for the pending spend, `maxOf` for the room, `needs` checked with `activeCount`, the gear room `levels.length − s.gear[line]`, rank-up room `1` below Colony, the `launch` room `s.launched ? 0 : 1`, `'quick'` for any M6 type when `s.quick`), and use `costOf` (materials and water) in `resolveTurn`'s builds section.
- [ ] **Step 6:** At project completion: `rankup` → `grantRank(s, rankOf(s) + 1)` and `s.pending.rank = rankOf(s)`; a gear line → `s.gear[line] += 1`; `launch` → `s.launched = true` (Task 5 adds its bonus at this line); a module → as today. `beginTurn` pushes `{ type:'rank_up', rank }` from `s.pending.rank` and clears it (keep `s.pending`'s reset at :579 carrying `rank: null`).
- [ ] **Step 7:** `buildState` sets `rank: 0`, `gear: {tanks:0,backpack:0,racks:0,tools:0}`, `launched: false`, `pending.rank: null`. `upgradeMission` defaults the same fields when missing or wrongly typed, and adds `{count:0, broken:0}` for every `D.MODULE_TYPES` entry missing from `m.modules`.
- [ ] **Step 8:** In `src/i18n.js`, both languages: `mod.garage` "Garage", `mod.fabricator` "Fabricator", `mod.launchpad` "Sample-return launch pad", `mod.cabin` "Pressurised rover", `mod.drone` "Scout drone", a one-line `bld.<type>` description for each of the five (what it does, no NASA fact yet), `rank.camp|outpost|station|colony` (the rank names), each with its Vietnamese; then the anchors `// M6 T2` … `// M6 T7` and `// M6 T9`, each followed by one key it owns (e.g. `rank.next` under T3). Add the five ids to the buildings list of `GUIDE` in `src/ui.js` (:2082): `test/ui.test.js:1036` requires every `D.MODULES` key in the guide with a name and a description (Task 3 adds their facts, sources and art).
- [ ] **Step 9:** Run `node --test test/ranks.test.js` — Expected: PASS. Then `npm test` — Expected: 805 + the new tests, 0 fail (no existing test edited).
- [ ] **Step 10:** Commit in slices: data tables; land helpers + tests; canBuild + completion; upgradeMission; words.

---

### Task 2: The bigger base on the surface, and its zone

**Files:**
- Modify: `src/expedition.js` (`inBaseZone` at :147 and every caller; `X.bay`), `src/surface.js` (`inGrid` at :58 → `E.onLand`; the base pad paint hook; a repaint when the rank changes), `src/surface-paint.js` (the `TL.BASE` branch at :245 → a "base land" test from the surface), `src/surface-eva.js` (the zone ring at :646 and the suit-drain `out` test), `src/dangers.js` (only if `shelterAt`'s `'base'` reads the zone)
- Test: `test/surface.test.js`, `test/expedition.test.js`, `test/surface-paint.test.js`

**Interfaces:**
- Consumes: `E.rankOf`, `E.onLand`, `E.landOf`, `E.zoneOf`, `E.grantRank` (Task 1).
- Produces: `inBaseZone(m, pos, slack)` — the zone is `E.zoneOf(m)` tiles (Chebyshev) round the HQ; every caller passes the mission. The painter gets `painter.setBaseLand(fn(tx, ty) → boolean)` and repaints the chunks it changes; `SolSurface.update` calls it when `E.rankOf(m)` changes.

- [ ] **Step 1: Write the failing tests:**
  - `test/expedition.test.js` "the base zone is the rank's, the same for the server and the surface": at Camp a position 3 tiles out is outside (`X.inBaseZone(m, pos)` false) and `X.deliver` there fails as today; after `E.grantRank(m, 1)` it is inside and delivering works; the suit pause uses the same test (the function the surface uses is the same export).
  - `test/surface.test.js` "a building at a negative grid spot stands on its world tile": `E.grantRank(m, 2)`, push `{type:'solar', x:-2, y:3}` into `m.layout` and a matching module; the surface's base sprites include a solar at world tile `(-6, 1)` (`gridToWorld(-2, 3)`); its module menu opens there (`worldToGrid` + `onLand`, not the old `inGrid`).
  - `test/surface-paint.test.js` "the base ground follows the rank's land": with `setBaseLand` from a Station mission a tile at world `(8, 0)` is painted as base ground; at Camp it isn't.
- [ ] **Step 2:** Run them — Expected: FAIL.
- [ ] **Step 3:** Implement: grep `baseZone` and `inBaseZone` across `src/` and `lib/` and route every one through `E.zoneOf(m)`; replace `inGrid` with `E.onLand(m, gx, gy)`; add the paint hook (base ground = `onLand` of the world tile's grid spot, drawn as today's `TL.BASE` dashed grid; the world's own tile codes are untouched) and call `painter.refresh` for the changed chunks once per rank change.
- [ ] **Step 4:** Run the tests and `npm test` — Expected: PASS, 0 fail.
- [ ] **Step 5:** Commit (zone; surface land; paint).

---

### Task 3: The console, the rank card, the art and the guide

**Files:**
- Modify: `src/ui.js` (`buildPanel` :1411, a `rankButton` beside `kitButton` :1397, `mapSvg` :1281-1373, `hud` :1174, `cardText` ~:800, the round's events → cards, `GUIDE` :2082 / `GUIDE_SOURCES` :2090), `src/surface.js` (the surface build menu :1083-1146), `src/art.js` (`MODULE_ART` entries), `src/i18n.js` (under `// M6 T3`)
- Test: `test/ui.test.js`, `test/art.test.js`

**Interfaces:**
- Consumes: Task 1's helpers and reasons; Task 0's source keys.
- Produces:
  - `MODULE_ART.garage | fabricator | launchpad | cabin | drone` (64 × 64 SVG in the house style) and `A.module(type)` for `rankup`, `tanks`, `backpack`, `racks`, `tools`, `launch` (icons).
  - `showM6Card(key)` inside `src/ui.js` — shows a full card `{ type:'m6', id:'m6:'+key, key }` once per mission through `showCard`; `cardText` reads `card.<key>.title`, `card.<key>.body`, `card.<key>.src` (an `I.SOURCES` key). Tasks 5 and 7 call it with their own keys.
  - `M6_CARD_EVENTS` in `src/ui.js`: the event types that open a card when a round's events arrive: `rank_up` → `showM6Card('rank' + rank)`; Task 5 adds `sample_launch`.
- Behaviour (the user: new choices appear only when their rank unlocks them):
  - `BUILD_ORDER` += `garage, fabricator, launchpad`; `bld.why.needs` ("Needs a working {module}") and `bld.why.water` in both languages.
  - The build list shows a type only when `E.canBuild(...).reason !== 'rank'` and `!== 'quick'` (and its tier is on). Vehicles (`rover`, `cabin`, `drone`) form a "Garage" group shown once a Garage stands; gear (`tanks`, `backpack`, `racks`, `tools`) a "Fabricator" group showing "level n / 2"; `launch` shows at Colony. Each row's cost shows water when there is any (`bld.costWater` "{kg} kg · {water} kg water · {w} work").
  - The rank-up button (like the kit's, no tile): the next rank's name, cost and what it unlocks; hidden at Colony and in Quick.
  - The console map draws `E.landTiles(s)` over the `landOf` box (viewBox from the bounds, negative spots offset), the shield and water-wall rings still round `D.GRID.hq`.
  - The HUD shows the rank in `.solclock` (`ops.rank` "{rank} base").
  - The guide gains the garage, fabricator, launchpad, cabin and drone, with their sources from Task 0.
  - The surface build menu shows the new buildings when unlocked and never shows a locked one.

- [ ] **Step 1: Write the failing tests** (`test/ui.test.js`, using `page()`, `mission()`, `byKey`):
  - "the build list shows only what the rank unlocks": Camp has no `bld:garage`; after `E.grantRank(m,1)` it does; no gear row until a Fabricator stands; none of them in a Quick mission.
  - "the rank-up button shows the next rank, its cost and what it unlocks, and queues one rank-up": click → `plan.builds` has one `{type:'rankup'}`; a second click doesn't add another.
  - "the console map shows the whole land, negative spots included": at Station the map has `landTiles(m).length` tiles and a `.tile-hit` at `data-x="-2"` for a solar.
  - "a rank-up opens its card once": a mission whose `events` include `{type:'rank_up', rank:1}` shows a card with `card.rank1.title`; rendering again doesn't open it twice.
  - "the guide lists the new buildings in both languages" (extend the test at :1036/:1043, which lists every module id).
  - `test/art.test.js` "every new module has its own art": `A.moduleInner(type)` for each new type isn't the scaffold.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement the rows, button, map, HUD, cards, guide, surface menu and art; strings under `// M6 T3` in both languages, with `card.rank1..3.title|body|src` written from `sources.md` (each body says only what its quote supports).
- [ ] **Step 4:** Run the tests and `npm test` — Expected: PASS, 0 fail.
- [ ] **Step 5:** Commit (rows and button; map; HUD and cards; art; guide and words).

---

### Task 4: Fabricator gear

**Files:**
- Modify: `src/expedition.js` (`capacity` :155, `suitOf` :156, `holdSeconds` :164-171, `useCanister` :296-298, `setSuit` :407-410, `refill` :536-537; exports), `src/surface-eva.js` (`CAN_BELOW` :57, `suit` :80/:367/:392, the suit bar :227/:271-272/:717, `holdSeconds` calls :566/:615-623), `src/showcase.js` (:49 `holdSeconds` call), `tools/explorer.js` (:124-125, :206, :222, :253), `src/i18n.js` (under `// M6 T4`)
- Test: `test/expedition.test.js`, `test/surface-eva.test.js`

**Interfaces:**
- Consumes: `s.gear`, `D.GEAR` (Task 1).
- Produces (exported from `src/expedition.js`):
  - `X.suitMax(m) → seconds` — `D.EXPEDITION.suit` (150) with no tanks, else `GEAR.tanks.levels[s.gear.tanks − 1].value`
  - `X.packOf(m) → loads` on foot; `X.rackOf(m) → loads` in a rover (today's `pack` and `packRover` at level 0)
  - `X.holdSeconds(kind, role, m)` — today's result (every branch: finds, structures, beacons, the role factor) times the tools factor; `m` optional (no gear when missing), so today's callers and tests keep working
  - `capacity(m, crewId)` uses `packOf`/`rackOf`; `suitOf`, `setSuit`'s clamp, `useCanister`, `refill` use `suitMax(m)`
- Behaviour: gear applies to the whole crew at the advance it finishes; a suit already partly used keeps its seconds left and refills to the new size.

- [ ] **Step 1: Write the failing tests:**
  - "bigger tanks keep the seconds left and refill to the new size": a suit at 90 s; finish `tanks` level 1; `X.suitOf` still 90, `X.refill` gives 200, `X.setSuit(m, id, 999)` clamps to 200; the surface-eva suit bar at 200 of 200 reads 100 % and never more.
  - "a bigger backpack and racks carry more": `packOf` 4 then 5; collecting a 5th load on foot at level 2 works, a 6th says full; `rackOf` 12 then 16 while driving.
  - "faster tools shorten every hold": `X.holdSeconds('metal', 'engineer', m)` at level 1 equals today's value × 0.8, likewise a structure hold and a beacon hold; with no `m`, today's value.
  - "a mission with no gear plays exactly as 3.7.0": every existing suit/pack/hold assertion still passes (the full suite).
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement the helpers and route every reader through them (client and server); `tools/explorer.js` uses them too; strings (the gear names, levels, the "suit tanks from MOXIE" fact line from `sources.md`) under `// M6 T4`.
- [ ] **Step 4:** Run the tests and `npm test` — Expected: PASS, 0 fail.
- [ ] **Step 5:** Commit (suit; pack and racks; tools; explorer).

---

### Task 5: Colony — sample return and a self-sufficient base

**Files:**
- Modify: `src/engine.js` (the `launch` completion line from Task 1; local production in `simulate` ~:812-840; `report.production`), `src/ui.js` (the debrief line and `M6_CARD_EVENTS += sample_launch`), `src/i18n.js` (under `// M6 T5`)
- Test: `test/ranks.test.js` (new `describe`-free tests appended), `test/ui.test.js`

**Interfaces:**
- Consumes: `E.grantRank`, `s.launched`, `D.COLONY`, `showM6Card` (Task 3).
- Produces: at the launch's completion, `bonus = Math.round(Math.min(D.COLONY.launch.cap, map * D.COLONY.launch.share))` where `map` is the expedition's banked map science (`s.expedition.science`), added to `s.science` (the base's science, which the score counts in full), `report.launch = { bonus }`, and the next round's event `{ type:'sample_launch', bonus }`. At Colony (and `D.M6.colony`), `o2Plant`, `ghO2`, `recovered`, `iceWater` and `ghFood` are multiplied by `D.COLONY.selfSufficient` before they reach the resources, the totals and `report.production`; `report.selfSufficient = true`.

- [ ] **Step 1: Write the failing tests:**
  - "the launch sends the samples home once a mission": Colony, a launchpad, `s.expedition.science = 300`: after the launch finishes `s.science` rose by `min(120, 90) = 90`, `s.launched` is true, `canBuild('launch')` → `'max'`, and the next events include `sample_launch` with `bonus: 90`; with `expedition.science = 0` the bonus is 0 and the launch still finishes.
  - "a Colony makes more of its own oxygen, water and food": the same mission at Station and at Colony with one plan: Colony's `report.production` o2/water/food are `selfSufficient` times Station's, and `E.independenceOf` is higher; at Station nothing changes.
  - "the score counts the launch in full and still caps the map": `E.scoreMission` of a mission with a launch has `parts.science` higher by the bonus; the map's own cap (`D.SCORE.map`) is unchanged.
  - `test/ui.test.js` "the debrief names the launch and the self-sufficient base" and "at Colony the console says the base is self-sufficient" (a line in the production or events panel, `ops.selfSufficient`).
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement; words and the card (`card.launch.*`, `card.colony.*` from `sources.md`) under `// M6 T5`.
- [ ] **Step 4:** Run the tests and `npm test` — Expected: PASS, 0 fail.
- [ ] **Step 5:** Commit (launch; self-sufficiency; debrief and card).

---

### Task 6: The pressurised rover

**Files:**
- Modify: `src/physics.js` (a `CABIN` spec beside `ROVER`; `drive`, `grip`, `stopDistance` take an optional spec, default `ROVER`), `src/expedition.js` (vehicles by kind), `src/dangers.js` (`ACTIONS` :238-256), `lib/rooms.js` (`EXPEDITION_ACTIONS` :29, `position` :93-127), `src/engine.js` (`newExpedition` fields, `rollExpedition` reset :1145-1146), `src/surface.js` (`toggleRover` :1007-1023 → by kind, the drive call :660-664, the parked/bay drawing :1270-1290, `setRemote` :466-483, `sendPos` :864-870), `src/surface-eva.js` (suit drain :430, battery :410/:428, HUD, marks :739), `src/surface-paint.js` (`drawCabinTop` beside `drawRoverTop` :761), `src/surface-map.js` (`MARKS` :24), `src/i18n.js` (under `// M6 T6`)
- Test: `test/expedition.test.js`, `test/physics.test.js`, `test/rooms.test.js`, `test/surface.test.js`, `test/surface-eva.test.js`

**Interfaces:**
- Consumes: the `cabin` module and build (Task 1, built in the Garage, with a bay tile), `X.rackOf` (Task 4; if Task 4 isn't merged yet, `X.packRover`).
- Produces:
  - `expedition.cabin` (`null` at its bay | `{x, y}` parked | `{driver}`), `expedition.cabinDriven` (tiles this round), `expedition.riders` (`{ crewId: 'cabin' }`, co-op passengers); `newExpedition` and `repairExpedition` know them; `rollExpedition` resets them as it does the rover.
  - `X.board(m, crewId, pos, kind = 'rover')`, `X.park(m, crewId, pos, driven, kind = 'rover')`, `X.bay(m, kind = 'rover')` (the layout tile of that type), `X.vehicleOf(m, crewId) → 'rover' | 'cabin' | null`, `X.left(m, kind)` (battery tiles left: `roverRange` or `EXPEDITION.cabin.range`). Today's calls without `kind` behave exactly as now.
  - Actions `board` / `park` take `body.kind`; new `ride` (join a cabin driven by a teammate, within reach, one passenger) and `alight`. `lib/rooms.js` lists `ride` and `alight`; a position's `vehicle` field (`'rover' | 'cabin' | null`, beside the boolean `rover` kept for old clients) drives the lost-park fallback per kind.
  - `PH.CABIN = { mass: 3200, power: 30000, grip: 1.8, roll: 0.05, rollRough: 0.25, top: 300 / 64, boost: 1.4, roughTop: 0.5, turn: 3.0 }` (starting values; heavier and slower than the rover, so it brakes in a longer distance, and its stopping-distance readout says so).
- Behaviour: no suit drain while driving or riding the cabin (`EXPEDITION.cabin.drain` 0); cargo `X.rackOf(m)` (the same racks as the rover); view as the rover's; **not** flare cover (no change to `shelterAt`); a rider's position follows the driver's, and both get out where it parks; the cabin and the rover can be out at the same time with different drivers.

- [ ] **Step 1: Write the failing tests:**
  - `test/expedition.test.js` "the pressurised rover: its own bay and battery, no suit drain, 8 loads": board by kind next to its bay; `X.vehicleOf` is `'cabin'`; `capacity` is the rack value; park beyond `home` leaves it `{x,y}`, near the HQ back at its bay; `X.left(m,'cabin')` counts down from 800; the rover is untouched.
  - "the rover and the pressurised rover can be out at once": two crew, one in each.
  - "a passenger rides along and gets out where it parks": `ride` needs a driven cabin within reach and a free seat; a second rider is refused (`'full'`); `park` drops the rider at the same spot; `alight` works any time.
  - "the pressurised rover is not flare cover": a flare ending while you sit in it outside the base hits you (`Z.flareEnd`).
  - `test/physics.test.js` "the pressurised rover is heavier: it gets to speed slower and needs longer to stop": `stopDistance(PH.CABIN) > stopDistance(PH.ROVER)`; `drive` with no spec is unchanged (today's tests).
  - `test/rooms.test.js` "co-op: a cabin driver's lost park is per vehicle" and "co-op: a rider's suit doesn't drain".
  - `test/surface-eva.test.js` "in the pressurised rover the suit doesn't drain outside": the suit is unchanged after 10 s of driving outside the zone.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement the rules (expedition, dangers, rooms), then the surface (E near either vehicle boards the nearest; the HUD shows which; the cabin drawn top-down; marks on the minimap and map), then the words (`eva.cabin*`, the fact line from `sources.md`) under `// M6 T6`.
- [ ] **Step 4:** Run the tests and `npm test` — Expected: PASS, 0 fail.
- [ ] **Step 5:** Commit (physics spec; rules; co-op; surface; passenger; words). The passenger is its own commit, last, so it can be dropped if the clock runs out.

---

### Task 7: The scout drone

**Files:**
- Modify: `src/expedition.js` (a `fly` action; export the reveal it uses), `src/dangers.js` (`ACTIONS`; `Z.stormOf(m)` beside `round()` :47), `lib/rooms.js` (`EXPEDITION_ACTIONS`), `src/engine.js` (`newExpedition`: `droneFlights`; `rollExpedition` resets it), `src/surface.js` / `src/surface-eva.js` (a Drone button, picking a target on the surface or the map, the flight drawn there and back), `src/surface-map.js` (picking on the full map), `src/ui.js` (the first flight's card via `showM6Card('drone')`), `src/i18n.js` (under `// M6 T7`)
- Test: `test/expedition.test.js`, `test/dangers.test.js`, `test/rooms.test.js`, `test/surface-eva.test.js`

**Interfaces:**
- Consumes: the `drone` module and build (Task 1), `D.DRONE`, `showM6Card` (Task 3), `revealAround(m, cx, cy, r)` (expedition.js:468, to be exported).
- Produces: action `fly` with body `{ tx, ty }` (world tiles) → `X.fly(m, crewId, pos, tx, ty)` → `{ ok, fog }` (the revealed diff, shared like a beacon's) or an error: `noDrone` (no working drone), `grounded` (`Z.stormOf(m) === 'global'`), `flights` (`droneFlights ≥ D.DRONE.flights` this round), `badPos`, `tooFar` (target beyond `D.DRONE.range` tiles of `pos`), `notHere` (launched neither inside the base zone nor from a rover or cabin you drive). `Z.stormOf(m) → 'clear' | 'regional' | 'global'`.
- Behaviour: it reveals a circle of `D.DRONE.reveal` tiles round the target (so the finds there show), carries nothing, flies over walls (no path), and its flight is drawn from you to the target and back in about 3 s on the client only. Three flights a round, recharged at the advance. The first flight of a mission opens the Ingenuity card.

- [ ] **Step 1: Write the failing tests:**
  - `test/expedition.test.js` "the drone clears the fog round where it flies": a working drone, at the base, target 30 tiles out: `ok`, `fog` non-empty, `X` reveal shows the target's tile as seen, `droneFlights` 1.
  - "the drone needs a working drone, a launch from the base or a vehicle, a target in range, and a flight left": each error code above; the fourth flight in a round → `'flights'`; after `rollExpedition` the count is 0.
  - `test/dangers.test.js` "the drone is grounded in a global dust storm": `Z.stormOf(m)` with `weather = 'global'`, and `X.fly` → `'grounded'`; a regional storm lets it fly.
  - `test/rooms.test.js` "co-op: a drone flight's fog reaches the whole crew" (via `shareFog`, within `FOG_SEAT_BUDGET`).
  - `test/surface-eva.test.js` "the Drone button shows only with a drone and says why it can't fly".
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement the rules, then the surface (button, target pick, flight drawing), then the card and words (`eva.drone*`, `card.drone.*` from `sources.md`) under `// M6 T7`.
- [ ] **Step 4:** Run the tests and `npm test` — Expected: PASS, 0 fail.
- [ ] **Step 5:** Commit (rules; storm; co-op; surface; card and words).

---

### Task 8: Balance — the bots learn ranks and gear, and the numbers are tuned

**Files:**
- Modify: `tools/balance.js` (`smartPlan` builds the rank-ups, a Garage and a Fabricator, and gear; the explorer uses gear through Task 4's helpers), `tools/explorer.js` (boards the pressurised rover when there is one), `src/data.js` (only the M6 tables: `RANKS`, `GEAR`, `COLONY`, `DRONE`, `EXPEDITION.cabin`, the new `BUILDS` costs)
- Create: `.superpowers/sdd/2026-11-10-sol500-m6/balance-report.md`
- Test: `test/explorer.test.js` (its capped-haul tests stay green: they use no gear)

**Interfaces:**
- Consumes: everything above.
- Produces: tuned values and a report with, per level, before (3.7.0 = `d6a3cb9`) and after: success %, S rate, average score, for careless, sloppy and thoughtful, with and without exploring, plus the round each rank is reached (median, and the share of missions reaching each rank).

Targets (spec §3 and §8): thoughtful explorer on commander reaches Outpost around rounds 5–7, Station 10–12, Colony 15–17, and not every mission reaches Colony; without exploring, clearly less far (Station late at best); thoughtful explorers on commander get S about 25–33 % of the time and sloppy explorers under 10 %; on veteran exploring adds 10–25 points of success for a sloppy player; a careless player's success doesn't rise by more than a few points; the Quick mission's numbers are byte-identical (`QUICK=1` run before and after).

- [ ] **Step 1:** Teach `smartPlan` the builds (rank up when the next rank's cost leaves a 300 kg reserve; then a Garage, a Fabricator, then gear in the order tanks, backpack, racks, tools; the launch at Colony) and record each mission's rank-up rounds in the tally. `ponytail:` comment: the bot doesn't build the extra solar/greenhouses a bigger base allows, so independence from more buildings is under-measured.
- [ ] **Step 2:** Run the baseline on `d6a3cb9`'s tree and the new tree with 300 runs (`node tools/balance.js 300`), write both into the report.
- [ ] **Step 3:** Tune only the M6 tables until the targets hold at 300 runs, then confirm at 1000 runs; keep each tuning step a commit with its numbers in the message.
- [ ] **Step 4:** Run `npm test` — Expected: PASS, 0 fail.
- [ ] **Step 5:** Commit the report copy to `docs/superpowers/plans/2026-11-10-sol500-m6-balance.md`.

---

### Task 9: The Showcase cards

**Files:**
- Modify: `src/showcase.js` (`CARDS`), `src/ui.js` (only if a scene needs a hook `showScene` lacks), `src/i18n.js` (under `// M6 T9`, created by this task beside the others)
- Test: `test/showcase.test.js` (its `CARDS.length === 12` becomes the new count; the first three ids stay)

**Interfaces:**
- Consumes: `E.grantRank` (Task 1), the shipped tiers' state, `I.SOURCES` (Task 0).
- Produces: cards `ranks`, `cabin`, `drone`, `fabricator`, `launch`, added after today's 12, each only if its tier is on (`D.M6`). The demo mission is a **Quick** mission (`showScene` passes `quick: true`), which has no rank-up, so each card's `prepare(s)` sets the state itself: `E.grantRank(s, 2)` (or 3 for `launch`), the buildings in `s.layout` and `s.modules`, gear levels for `fabricator`, a working cabin for `cabin`, a drone for `drone`.
  - `ranks`: on the surface inside a Station base, `line` showing the rank and what it unlocked.
  - `cabin`: at the wheel of the pressurised rover outside the zone (`at`, `board: 'cabin'`), the suit visibly not draining.
  - `drone`: outside with a drone, the Drone button ready.
  - `fabricator`: the console on the Fabricator's gear rows.
  - `launch`: the console at Colony with the launch row.

- [ ] **Step 1: Write the failing tests:** each new card has `show.card.<id>.name|why` in both languages (the existing per-card tests cover the words once the ids exist); "a rank scene stands inside a Station base, not on the old pad's edge"; "the cabin scene's suit doesn't drain"; "a card whose tier is off isn't in the gallery"; "the demo still writes no save" (the existing demo-save test, run for the new ids).
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement the cards and words (each `why` line says only what its source says).
- [ ] **Step 4:** Run the tests and `npm test` — Expected: PASS, 0 fail.
- [ ] **Step 5:** Commit.

---

### Task 10: Release 3.8.0

**Files:**
- Modify: `package.json` (version 3.8.0), `sw.js` (the cache name: read it first, it was `sol500-v7` at 3.7.0, so `sol500-v8`), `dist/` (rebuilt with `node tools/build.js`), `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (§12: a `### M6 — Base ranks, the Garage and the Fabricator` heading with one `- [ ]` item per shipped tier, before `## 13.`), `progress.json` (`npm run progress`)
- Create: `docs/superpowers/plans/2026-11-10-sol500-m6-followups.md`

- [ ] **Step 1:** Final balance on the release tree (Task 8's targets at 1000 runs; Quick byte-identical).
- [ ] **Step 2:** Browser QA, one agent, in Chrome on a port-5071 server with a scratch `--data` folder, in both languages: rank up through every shipped rank in a played mission (the land, the zone ring, the build list, the cards), each vehicle and the drone, gear, the launch; a 3.7.0 Full save and a Quick save resume; a co-op room of two tabs (rank-up, the cabin with a passenger, a drone flight's fog); every new Showcase card's Show me and ‹ Showcase; the frame rate inside a Colony base; findings Critical / Important / Minor in a report.
- [ ] **Step 3:** Fix wave for Critical and Important findings (test first), re-checked in Chrome.
- [ ] **Step 4:** Version, cache, `dist/`, §12 items ticked for what shipped, `npm run progress`, then `npm run app`; `npm run smoke`; install silently over 3.7.0; compare the asar with HEAD; the launch check in an empty profile and from a copy of `win-unpacked` with no Node on PATH; copy `SOL500-Setup-3.8.0.exe` to the Desktop beside 3.7.0's (the fallback).
- [ ] **Step 5:** The follow-ups doc: deferred minors, the native Vietnamese read list (every new VI string, grouped by screen), the hand checks only the user can do (share-link co-op with the new vehicles; a rehearsal of the new Showcase cards), and anything left out by the cut line.
- [ ] **Step 6:** Commit, then ask the user before merging `feat/m6-base-ranks-vehicles` into `master`.
