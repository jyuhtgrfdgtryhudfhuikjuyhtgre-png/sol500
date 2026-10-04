# SOL 500 M3 — follow-ups for later milestones

M3 (endless world, one astronaut per player) is built on `feat/m3-endless-world` as version 3.2.0, with 219 tests passing. Every task passed its own review, two of them after a fix round. The browser QA met every target, so all seven M3 boxes in spec §12 are ticked and none was left open. The items below were reviewed and deliberately deferred. Pick them up in the milestone named. A few findings that should be fixed before the merge are not listed here: they go to the final whole-branch review, which will add whatever it defers.

## Measured
Browser QA on the final M3 code (commit `8bec72e`, 2026-10-03) in Chrome 154 on Windows 11, plus the test suite.
- **Tests:** `npm test` passes 219 of 219.
- **Same world in Chrome and in Node:** the Chrome hash of 1,000 random chunks (seed `PIN-1`) is `4f1ff5dc`, the value pinned in `test/worldgen.test.js`.
- **Frame rate:** a 120 s straight rover drive with 5 avatars in a 1920×1080 window (devicePixelRatio 1, display about 164 Hz) ran at a median of 163.9 fps and a 5th percentile of 161.3 fps over 19,705 frames (target: median 50 or more). Only 10 of those frames took longer than 20 ms. The game loop itself costs about 0.5 to 0.6 ms per frame (1.5 to 2.9 ms at the 99th percentile, measured under tracing).
- **Chunks in memory:** at most 34 data chunks (cap 64) and 35 image chunks (cap 160) over both drives.
- **Paint:** the debug box's paint median stayed between 0.10 and 0.30 ms (target: 2 ms or less).
- **Heap over 2,000 tiles out and back:** `usedJSHeapSize` went from 4,011,738 B to 4,739,111 B (+0.73 MB, or +0.12 MB after a forced garbage collection), and the heap snapshots from 7.61 MB to 7.98 MB (self size 7.40 MB to 8.32 MB). The +0.92 MB of self size is 126 more minimap canvases, which are bounded by `MINI_CAP` (512). Target: within +20 MB.
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
- `flushFog` (`src/ui.js:146`) drops fog entries as soon as `sendReveal` returns true, so fog sent into a half-open socket never reaches teammates; send the last 30 s or so again when the socket reopens (the server's merge is safe to repeat).
- `regionsSeen` is one global localStorage slot that duplicates `mission.expedition.regions`, so a co-op session between two solo sessions makes the resumed solo mission replay every region card; solo could read `expedition.regions` instead, which also bears on the replay item above.
- `upgradeMission` (`src/engine.js:302`) throws on a solo save with no crew array, keeps a non-object `revealed` or `regions`, a partial `banked` and a pilot who is not in the crew (nothing replaces that pilot later), and leaves a dead pilot until the next `resolveTurn` (corrupt or hand-edited saves only); when M4 fills the rest of `mission.expedition`, make it rebuild whatever is missing or malformed.

## For the M5 plan (polish)
- `src/surface.js` is about 1,020 lines, above the spec's "about 900". Move the interaction menu (`focusAt`, `focusLabel`, `renderMenu`, `mbtn`) into `src/surface-menu.js`.
- The minimap is 1 px per tile (spec §2.6), so at the start the explored base is a small blob. Consider a 2× zoom button.
- Fog edges are drawn per tile (blocky by design). A soft edge would look better at low zoom.
- A lone sand tile in the Dune Sea shows as a plain square.

### From the browser QA
- On a 390×844 phone the sticky `.hud` is 431 px tall (51 % of the screen), so the minimap and region card and the touch joystick are never on screen together; for example, collapse the HUD on the surface tab. This predates M3.
- The Vietnamese crew-job dropdown "Nghỉ & chăm sóc ★" clips its star (the select is 150 px wide).
- On a phone the map hint is cut off with an ellipsis, in English and in Vietnamese.
- `index.html`'s `apple-mobile-web-app-capable` meta is deprecated (Chrome logs a warning on every load); add `mobile-web-app-capable` next to it.
- Five full game windows on one PC run at 42 to 44 fps each (they share one GPU); a single window runs at about 165 fps.
- `src/surface.js` assigns `.hidden` every frame, with the same value, at lines 473, 657 and 667 (stamina bar, prompt, hint); guard them with a change check. This does not affect any target.

### Polish and accessibility
- The seat buttons discard the result of the claim, so `lan.deadCrew` ("That crew member has died.") is never shown (the lobby claim buttons do the same, and `lan.taken_err` is unused); show it with `toast(t('lan.' + r.error))`.
- The pilot card's `.role-tag` is styled only under `.who` (`src/style.css:443`), so its role label looks plainer than on the other crew cards.
- The region card vanishes after 15 s with no pause on hover or focus (WCAG 2.2.1) and cannot be read again, and because it is inserted with its content already in place, screen readers may not announce its `role=status` / `aria-live=polite` text.
- The region card is not cleared when a mission ends or a new one starts, so with "Fly again" on the same code it can linger for the rest of its 15 s.
- The "Regions of Mars" note sits after the closing "What is simplified" note in the science sources (`src/i18n.js:1672`, Vietnamese at `:1688`); move it one place earlier so the disclaimer stays last.
- The decorative dashed rover tracks that ran from the HQ across the old map are gone; a short track from the HQ into the plains would bring them back.
- `stream()` hands `retainView` the camera from before the move (`src/surface.js:379`), so a camera snap (a new world, a teleport, the first frame before the resize observer) shows one frame of flat fill.
- Launching or restarting a mission in `lib/rooms.js` does not clear `room.positions`, so console-view teammates show the previous mission's last position (this predates M3); set `room.positions = {}` on restart.

### Tests
- The "features keep their distance" test (`test/worldgen.test.js:188`) duplicates the `grow`, `touch` and `distance` helpers from `src/worldgen.js` because they are not exported, and the 4 ms median build-time test (`:217`) is wall-clock, so it could flake on a loaded machine.
- `decode` in `src/fog.js` ignores the 2 unused trailing bits, `has` and `set` do no bounds check on `lx` and `ly`, and no test shows that an existing key still merges once the cap is reached.
- No test covers cap eviction through real streaming, a duplicate `mergeFog` key, or a base chunk surviving a far `retain()` (`test/surface-world.test.js`).
- The no-flicker test in `test/surface-paint.test.js` does not assert that the queue is empty after filling or that a repeated `retainView` queues nothing, so the guarantee is not pinned.
- `test/engine.test.js` only half pins the pilot successor rule: nothing covers an active crewmate beating an earlier downed one, `to: null` on a total loss, the first-living branch of `upgradeMission`, or co-op never taking over.
- `test/rooms.test.js` covers only re-claiming your own dead crewmate; add an unseated player claiming a dead crewmate who has no owner, and the missing-crewmate branch.
- The co-op fog tests have gaps: the Fly-again test runs restart and launch back to back (add a 650 ms wait so restart's `stopFog` is pinned), the cap test starts at 4,264 keys (pin exactly 4,096), the region action's no-crew and wrong-phase refusals are untested, and nothing statically guards `admin.js`'s exports across its two IIFEs (`npm test` never loads `admin.js`).
- `src/ui.js` has no DOM test harness, so the pilot screen, the seat panel, the boot upgrade, the 4 s solo-save throttle and the hidden/pagehide flush have no automated check.

### Code tidiness
- `createMission({ coop: true, pilot })` is accepted (`lib/rooms.js` never passes a pilot, so it cannot happen today); ignore or reject `pilot` when `coop` is set.
- The rule "first active crewmate, else first living one" is written twice in `src/engine.js` (`upgradeMission` and `resolveTurn`); a shared helper would keep it in one place.
- `src/ui.js:57` repeats `saveSolo()`'s `{ mission, plan }` save shape (`lanOn`, declared later, stops it calling `saveSolo()` there), so the two writers drift if the shape changes.
- The 4,096 fog cap is a bare literal in `src/ui.js` and the tests, and the 64-keys-per-message limit is inline in `src/ui.js`, while the server names them `FOG_CHUNKS_MAX` and `FOG_KEYS_PER_MESSAGE`; export them once from `src/fog.js`.
- The `reveal` hook in `src/ui.js` schedules a save even when `mergeMap` changed nothing (every resume re-reports the base chunks, causing one extra whole-mission write); call `saveSoloSoon()` only when the returned diff has keys.
- `retainView` (`src/surface-paint.js:235`) re-sorts its queue on every call, even when the chunk range has not changed.
- The header comment of `src/ui.js` lists the localStorage keys but misses `opsView` and `regionsSeen`.
- There is seam whitespace at `src/surface.js:42` and `:215`; the working tree mixes LF files (for example `src/surface-map.js` and `src/i18n.js`) with CRLF ones although git stores LF; `probe().path`'s parameters are named `(gx, gy)` but hold world tiles; and `mapState()` rebuilds the crew list every frame while `draw()` keeps painting under the opaque full map.
- Two small co-op nits in `lib/rooms.js`: the `stopFog` comment says "ending" but the debrief does not call it (harmless), and the region action lacks `reveal`'s expedition guard (unreachable today).

### Nothing to do
- Two reviews noted that an implementer's report quoted test output loosely or mislabelled details (for example "Perlin" and "8000 samples per seed" for the world generator, a wrong line count); no code was affected.
