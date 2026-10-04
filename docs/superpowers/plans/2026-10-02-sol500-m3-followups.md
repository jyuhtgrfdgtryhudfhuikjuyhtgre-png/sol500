# SOL 500 M3 — follow-ups for later milestones

M3 (endless world, one astronaut per player) is built on `feat/m3-endless-world` as version 3.2.0, with 228 tests passing. Every task passed its own review, two of them after a fix round, and the final whole-branch review and its fix wave are done too. The browser QA met every target, so all seven M3 boxes in spec §12 are ticked and none was left open. This doc holds everything those reviews deferred: pick the items up in the milestone named.

## Measured
Browser QA on the final M3 code (commit `8bec72e`, 2026-10-03) in Chrome 154 on Windows 11, plus the test suite.
- **Tests:** `npm test` passes 219 of 219.
- **Same world in Chrome and in Node:** the Chrome hash of 1,000 random chunks (seed `PIN-1`) is `4f1ff5dc`, the value pinned in `test/worldgen.test.js`.
- **Frame rate:** a 120 s straight rover drive with 5 avatars in a 1920×1080 window (devicePixelRatio 1, display about 164 Hz) ran at a median of 163.9 fps and a 5th percentile of 161.3 fps over 19,705 frames (target: median 50 or more). Only 10 of those frames took longer than 20 ms. The game loop itself costs about 0.5 to 0.6 ms per frame (1.5 to 2.9 ms at the 99th percentile, measured under tracing).
- **Chunks in memory:** at most 34 data chunks (cap 64) and 35 image chunks (cap 160) over both drives.
- **Paint:** the debug box's paint median stayed between 0.10 and 0.30 ms (target: 2 ms or less).
- **Heap over 2,000 tiles out and back:** `usedJSHeapSize` went from 4,011,738 B to 4,739,111 B (+0.73 MB, or +0.12 MB after a forced garbage collection), and the heap snapshot files from 7.61 MB to 7.98 MB (self size 7.40 MB to 8.32 MB). The +0.92 MB of self size is 126 more minimap canvases, which are bounded by `MINI_CAP` (512). Target: within +20 MB.
- **Chunks rebuilt identically:** the painted image chunk at (0, 0), `SolSurface.qa.chunkHash(0, 0)`, was `52517c1c` before and after that drive.
- **Trace caveat:** a full 2-minute Chrome performance trace crashed the renderer at about 66 s. The JS heap stayed at 3 to 6 MB and the same drive without a trace ran the full 120 s, so it looks like tracing or the environment, not the game. The fps figures above therefore come from the untraced drive, and partial traces of 65 s and 20 s agree (median 165.1 fps, 5th percentile 140.2 and 149.7 with tracing on). For future performance checks use a 20 s trace plus an in-page frame sampler.

## For the M4 plan (exploring)
- The rover goes back to its bay when you leave it far from the base. M4 should park it where you left it (a position in mission state), now that EVA trips are long.
- `mission.expedition` already has spec §4's full shape (v: 2). M4 fills `sites`, `structures`, `landmarks`, `beacons`, `carried`, `banked`, `goals`, `incidents` and `stats`, and adds them to `resolveTurn`.
- `expedition.regions` is recorded in solo and co-op; achievements and expedition goals can read it.
- The view radius is fixed at 8 tiles (10 in the rover). Dust storms shrinking it (spec §3.4) are M4.
- The server has no world cache yet. M4's checked item actions need the shared 256-chunk LRU from spec §5.
- The region card shows once per mission code and mode, so replaying the same code shows no cards.

### Also for M4
- At 1920×1080 the surface shows about 10.9 × 7.9 tiles, inside the 8-tile reveal radius, so fog never appears on the surface itself, only on the minimap and the map. M4's storms shrinking the radius will make it visible; consider tying the radius to the visible area.
- `F.KEY` (`src/fog.js:15`) accepts non-canonical fog keys such as `-0,0` and `00,0`, so one chunk can take several slots in the shared map (the 4,096 cap still holds) and they sit unread as dead entries on clients; before M4 scores explored area, tighten it to `^(0|-?[1-9]\d{0,5}),(0|-?[1-9]\d{0,5})$` with one test, and decide whether `rooms.reveal` should canonicalise keys.
- The surface's own `mergeFog` (`src/surface-world.js:167`) has no 4,096-chunk cap, so only the server and the saved mission bound a hostile saved or teammate fog map; confirm that bound before M4 scores explored area.
- `flushFog` (`src/ui.js:155`) drops fog entries as soon as `sendReveal` returns true, so fog sent into a half-open socket never reaches teammates; send the last 30 s or so again when the socket reopens (the server's merge is safe to repeat).
- `regionsSeen` is one global localStorage slot that duplicates `mission.expedition.regions`, so a co-op session between two solo sessions makes the resumed solo mission replay every region card; solo could read `expedition.regions` instead, which also bears on the replay item above.
- `upgradeMission` (`src/engine.js:302`) keeps a non-object `revealed` or `regions`, a partial `banked` and a pilot who is not in the crew (nothing replaces that pilot later), and leaves a dead pilot until the next `resolveTurn`; when M4 fills the rest of `mission.expedition`, make it rebuild whatever is missing or malformed.
- A solo save with no crew array now makes the boot drop the whole save (`src/ui.js:57-66`), so `upgradeMission` itself still throws on it; that only matters to corrupt or hand-edited saves.
- `explore()` (`src/surface.js:410`) returns early while your astronaut is dead, so `takeFog` is skipped and the new fog waits until you take a seat; solo takeover is immediate and players usually stand still when a round resolves, so it is harmless today, but M4's deaths on EVA make it matter.
- A hostile co-op seat can fill the server's whole 4,096-chunk fog cap on its own (`lib/rooms.js:94`, `FOG_CHUNKS_MAX` at `:20`), which stops the shared fog growing for that mission; give each seat a budget of about 800 new keys before M4 scores explored area.
- The full map flickers once more than 512 explored chunks are on screen, because `MINI_CAP` (`src/surface-paint.js:17`) evicts mini images (`:306-310`) that the map redraws every frame (`src/surface-map.js:177-185`) and about 100 are rebuilt a frame; never evict a mini drawn in the current frame, or cache a coarser layer for zooms 1 and 2.

## For the M5 plan (polish)
- `src/surface.js` is about 1,050 lines, above the spec's "about 900". Move the interaction menu (`focusAt`, `focusLabel`, `renderMenu`, `mbtn`) into `src/surface-menu.js`.
- The minimap is 1 px per tile (spec §2.6), so at the start the explored base is a small blob. Consider a 2× zoom button.
- Fog edges are drawn per tile (blocky by design). A soft edge would look better at low zoom.
- A lone sand tile in the Dune Sea shows as a plain square.
- NPC paths search a 64×64-tile box (`PATH_HALF` 32, `src/surface-world.js:19`) and can rebuild evicted chunks while the player is far away (a probe of 3,600 trips found none typically and 3 chunks and 1.5 ms at worst); shrink the NPC search half-size to about 20.
- Input and QA hygiene: held keys are not cleared on `visibilitychange` (the window `blur` handler already covers tab and app switches), the `?debug=chunks` QA state is not reset with the surface, and `qa.speed` is unbounded.
- The full map's header (`.sf-map-head`, `src/style.css:501`) wraps onto several lines at about 620 px and narrower and covers a strip of the map; shorten or collapse the legend there.

### From the browser QA
- On a 390×844 phone the sticky `.hud` is 431 px tall (51 % of the screen), so the minimap and region card and the touch joystick are never on screen together; for example, collapse the HUD on the surface tab. This predates M3.
- The Vietnamese crew-job dropdown "Nghỉ & chăm sóc ★" clips its star (the select is 150 px wide).
- On a phone the map hint is cut off with an ellipsis, in English and in Vietnamese.
- `index.html`'s `apple-mobile-web-app-capable` meta is deprecated (Chrome logs a warning when the page loads in Chrome); add `mobile-web-app-capable` next to it.
- Five full game windows on one PC run at 42 to 44 fps each (they share one GPU); a single window runs at about 165 fps.
- `src/surface.js` assigns `.hidden` every frame, with the same value, at lines 498, 682 and 692 (stamina bar, prompt, hint); guard them with a change check. This does not affect any target.

### Polish and accessibility
- The seat buttons discard the result of the claim, so `lan.deadCrew` ("That crew member has died.") is never shown (the lobby claim buttons do the same, and `lan.taken_err` is unused); show it with `toast(t('lan.' + r.error))`.
- The pilot card's `.role-tag` is styled only under `.who` (`src/style.css:443`), so its role label looks plainer than on the other crew cards.
- Because the region card is inserted with its content already in place, screen readers may not announce its `role=status` / `aria-live=polite` text.
- The region card is not cleared when a mission ends or a new one starts, so with "Fly again" on the same code it can linger for the rest of its 15 s.
- On a phone the control hint steps aside while a region card shows, and the card (15 s) outlasts the hint (14 s, `hintUntil` in `src/surface.js`), so a first-time phone player may never see it; start the hint's clock when the card goes.
- The Plains fact lost its sentence about the name "Jezero" meaning "lake" because the post-landing NASA page it now cites does not say it; NASA's Mars Report page of 8 June 2023 (`science.nasa.gov/resource/how-does-nasa-name-things-on-mars-mars-report-june-2023/`) does, so a second source per region would bring it back.
- The "Regions of Mars" note sits after the closing "What is simplified" note in the science sources (`src/i18n.js:1676`, Vietnamese at `:1692`); move it one place earlier so the disclaimer stays last.
- The decorative dashed rover tracks that ran from the HQ across the old map are gone; a short track from the HQ into the plains would bring them back.
- `stream()` hands `retainView` the camera from before the move (`src/surface.js:398`), so a camera snap (a new world, a teleport, the first frame before the resize observer) shows one frame of flat fill.

### Tests
- The "features keep their distance" test (`test/worldgen.test.js:188`) duplicates the `grow` and `touch` helpers from `src/worldgen.js` because they are not exported, and its `distToOrigin` (`:144`) copies `nearBase`'s inline maths (`src/worldgen.js:169-173`).
- The 4 ms median build-time test (`test/worldgen.test.js:217`) is wall-clock, so it could flake on a loaded machine.
- `decode` in `src/fog.js` ignores the 2 unused trailing bits, `has` and `set` do no bounds check on `lx` and `ly`, and no test shows that an existing key still merges once the cap is reached.
- No test covers cap eviction through real streaming, a duplicate `mergeFog` key, or a base chunk surviving a far `retain()` (`test/surface-world.test.js`).
- The cap test in `test/surface-paint.test.js:45` ("never more than the cap, but never a chunk on screen") does not assert that the queue is empty after filling or that a repeated `retainView` queues nothing, so that guarantee is not pinned.
- `test/engine.test.js` only half pins the pilot successor rule: nothing covers an active crewmate beating an earlier downed one, the first-living branch of `upgradeMission`, or co-op never taking over.
- `test/rooms.test.js` covers only re-claiming your own dead crewmate; add an unseated player claiming a dead crewmate who has no owner, and the missing-crewmate branch.
- The Fly-again fog test in `test/rooms.test.js` runs restart and launch back to back; add a 650 ms wait so restart's `stopFog` is pinned.
- The fog cap test in `test/rooms.test.js` starts at 4,264 keys; pin exactly 4,096.
- The region action's no-crew and wrong-phase refusals are untested.
- Nothing statically guards `admin.js`'s exports across its two IIFEs (`npm test` never loads `admin.js`).
- `src/ui.js` has no DOM test harness, so the pilot screen, the seat panel, the boot upgrade and its guard, the 4 s solo-save throttle, the hidden/pagehide flush, the region card's hold and reopen, and the launch-counter reset in `onRoom` have no automated check.

### Code tidiness
- `createMission({ coop: true, pilot })` is accepted (`lib/rooms.js` never passes a pilot, so it cannot happen today); ignore or reject `pilot` when `coop` is set.
- `src/ui.js:60` repeats `saveSolo()`'s `{ mission, plan }` save shape (`lanOn`, declared later, stops it calling `saveSolo()` there), so the two writers drift if the shape changes.
- The 4,096 fog cap is a bare literal in `src/ui.js` and the tests, and the 64-keys-per-message limit is inline in `src/ui.js`, while the server names them `FOG_CHUNKS_MAX` and `FOG_KEYS_PER_MESSAGE`; export them once from `src/fog.js`.
- The `reveal` hook in `src/ui.js` schedules a save even when `mergeMap` changed nothing (every resume re-reports the base chunks, causing one extra whole-mission write); call `saveSoloSoon()` only when the returned diff has keys.
- `retainView` (`src/surface-paint.js:236`) re-sorts its queue on every call, even when the chunk range has not changed.
- The header comment of `src/ui.js` lists the localStorage keys but misses `opsView` and `regionsSeen`.
- There is seam whitespace at `src/surface.js:42`.
- The working tree mixes LF files (for example `src/surface-map.js` and `src/i18n.js`) with CRLF ones although git stores LF.
- `probe().path`'s parameters are named `(gx, gy)` but hold world tiles.
- `mapState()` rebuilds the crew list every frame while `draw()` keeps painting under the opaque full map.
- The `stopFog` comment in `lib/rooms.js` says "ending" but the debrief does not call it (harmless).
- The region action in `lib/rooms.js` lacks `reveal`'s expedition guard (unreachable today).
