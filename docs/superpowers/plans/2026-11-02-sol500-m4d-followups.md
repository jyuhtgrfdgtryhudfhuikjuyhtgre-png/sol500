# SOL 500 M4d: follow-ups for later milestones

M4d (relay beacons and the route home, expedition goals, role skills and pings, the debrief's Expedition section and the ISRU lesson, the final rebalance) ships as version 3.6.0, together with the NASA photo floor, the rover physics, the "Why Mars?" story and the field guide (ruling P5; the design is `docs/superpowers/specs/2026-11-03-sol500-rover-drive-design.md`). The plan is `docs/superpowers/plans/2026-11-02-sol500-m4d-progression-team.md`. The floor's own open items are in `docs/superpowers/plans/2026-11-03-sol500-floor-followups.md`, and the ones M4d still owes from earlier milestones are in the M4c, M3 and M1 follow-ups docs.

This doc holds everything the task reviews, the final review and the QA deferred, so the build ledger (`.superpowers/sdd/2026-11-02-sol500-m4d-progression-team/`, git-ignored and deleted after the merge) isn't needed. Each item gives its place in the code as of the 3.6.0 tree and the fix. Line numbers drift: search for the function or string if a line has moved. M4d's Important findings were fixed before release (Critical: none); only Minor findings and design calls are here.

## Measured numbers

Measured on the release tree (Task 9, steps 1 and 2). The dry run's figures are in the plan, under "Measured in the dry run".

### Tests
668 of 668 on the release tree (`10201fe`): 636 from M4d plus the floor's.

### Balance
Measured on `10201fe`, 1,000 missions a cell, and equal to the dry run. Veteran sloppy 66.8 % to 88.8 % with exploring (+22.0, 10 to 25 wanted). Careless + explorer at most 26.8 % (under 35). Thoughtful + explorer 100 % (over 70). Commander S grades: 292 of 1,000 thoughtful explorers (250 to 333), 37 of 1,000 sloppy (under 100). Every target passes except the run length (R20).

### Browser QA
37 checks on `10201fe`: 34 PASS, 3 SEEN, 0 FAIL; Critical 0, Important 0. World hash `3ae4db5e`, repaint 420 of 420. A real 3.5.0 save resumes and repairs. Open Minor findings for M5:
- **A held card expires unseen on the console** (`src/ui.js` `openCard`, `nextCard`): its timers run whatever the view. Pause them off the surface, or rely on the Science notes (a design call).
- **A long log card covers the top 23 px of E on a 1024 x 768 touch tablet** (`src/style.css` R33 wide rule): cap the card's height. A tap still works.
- **A found-list summary is announced with "plus" or "minus"** (`src/style.css` `summary::after`): use `content: '+' / ''`.
- **The grains photo repeats visibly on Volcanic Flanks** (`src/surface-paint.js` `PHOTO.grains`, `repeat: 140`).
- **Ground changes are hard tile edges**, more visible with the photos (`paintTile`).
- **Vietnamese wording**: `guide.kit.desc` says "trạm tiếp sóng" where the rest say "trạm chuyển tiếp"; the rover is both "xe tự hành" and "xe thám hiểm".
- **The Notes dialog scrolls 5,336 px on a phone**: only the found list folds.

### Frame rate
1280 x 720, Best, poller clean (110 samples, 0 busy): scene median 163.9 fps, control 163.9, on a 165 Hz display; paint median 0.50 ms. No region differs.

### Run length
From the dry run (`BAL-0` to `BAL-999`, commander, 30 to 60 s of planning a round; ruling R20):
- no exploring: 10 to 20 minutes;
- one suit charge a round: 47 to 57 minutes;
- full exploring with beacons, pods and goals: 111 to 121 minutes, about 2 hours.

Spec §1.6 now says 10 to 20 minutes, about 45 to 60, and about 2 hours over several sittings (solo saves at every advance and every 4 s while exploring). The original "30 to 40 minutes with full exploring" does not hold. A shorter mission is a user decision (below).

## For the M5 plan (polish)

### Co-op
- **A commander who drops out keeps granting the aura from his last spot until the round advances.**
  - Cause: `room.positions` (`lib/rooms.js:117`) keeps a disconnected seat's spot. It is cleared at each advance (`:252`) and when a seat is released (`:230`, `:299`, `:307`), not when a tab merely disconnects.
  - Fix: leave out seats that aren't `connected` (the `present(p)` test, `:72`) before `X.speedFactor` and `X.commanderOut` read the positions.
  - On the surface his route line already fades within 10 s.
- **A co-op seat that goes past `FOG_SEAT_BUDGET`** (800 new chunks a mission, `lib/rooms.js:24`) **silently loses new fog**: `reveal` returns null (the final review's verdict: leave it for this release).
  - Honest play stays under it: a rover seat sees about 30 new chunks a round, about 600 over 20 rounds. Only a seat breaking fresh ground in every round with no overlap gets near 800.
  - The failure is soft: that seat's own map keeps working, and its teammates and the `chunks` goal stop gaining from it.
  - Fix, if it ever shows: a toast for the seat, or a larger budget (five seats of 800 already sit under `FOG_CHUNKS_MAX`, 4,096, so the budget can't grow much).
- **The fog budget hangs on `left-- <= 0` inside a short-circuit** (`lib/rooms.js:165`), and the `grew &&` half of the frame gate has no test (Task 2 review, Minor 5). Fix: count the new keys in a plain loop, and add a test for a frame that grew nothing.
- **Co-op actions are judged by the seat's last relayed position** (`lib/rooms.js:483`, `room.positions[player.crewId]`), so an action sent right after a jump gets a 400, and a retry 1.5 s later works. Only QA teleports meet it. It is the trust boundary, so it stays (R32).
- **`flushFog` drops fog sent into a half-open socket** (`src/ui.js:158`; M3 follow-ups). It now costs a co-op team chunks toward a goal. Fix: send the last 30 s or so again when the socket reopens (the server's merge is safe to repeat).
- **The surface's own `mergeFog` has no cap** (`src/surface-world.js:178`). Scoring reads the capped `revealed`, so this only costs client memory.
- **`regionsSeen` duplicates `expedition.regions`** (`src/ui.js:48`, `:681`): one global localStorage slot, so a co-op session between two solo sessions makes the resumed solo mission replay every region card. Fix: solo reads `expedition.regions`.
- **A solo save with no crew array** makes the boot drop the whole save, and `upgradeMission` (`src/engine.js:406`) itself still throws on it. It matters only to hand-edited saves.
- **Survey reach.** At N = 120 (rounds 18 to 20), a site up to 150 tiles out may need the rover, a pod or a beacon refill. If playtests show it, give `survey` a reach of its own, about 135 tiles (`D.GOALS`, `src/data.js`; `src/goals.js` `survey`).
- **Plurals.** A `D.GOALS` change to 1 load, or to 2 or more kits, needs singular and plural keys for `goal.haul`, `goal.chunks` and `goal.kits` (`src/i18n.js:860`, `:865`, `:871`; the Vietnamese has no plural, so it needs only the English keys).

### Surface
- **A kit-aware backpack.** `eva.pack` and `eva.full` (`src/i18n.js:749`, `:760`) count a kit as a load: a pack with a kit reads "Backpack: 2 of 3 loads". A pack of kits only reads "Backpack full: bring it back to the base", though delivering it banks nothing.
- **The phone layout (R36).** It goes with the sticky header `.hud` (`src/style.css:229`, older than M4d), which takes 431 of a portrait phone's 915 px and 285 of a sideways phone's 412.
  - **The touch hint is under the HUD's column whenever no card shows** (F-hint-under-column). The hint ("Drag the stick to move · hold » …", `sf.hintTouch`, `src/surface.js:982`) shows for up to 14 s each time the surface opens, in the 150 px strip. The column (`z-index: 3`, later in the page) now runs to 193 to 357 px with the goals. Fix: draw the hint over the column on phones (put it after `.sf-eva` in the overlay, with `z-index: 3`), or step the column aside while the hint shows, as R33 does for a card. Keep the note that says what is outside this round: it lasts 8 s and comes as the surface opens.
  - **A phone held sideways** (915 × 412, touch; F-landscape-touch). R33's wide rule puts a card over E and sprint, and taps on them do nothing while it's up. The card's head row and its × are under the sticky header, and the column covers the stick's centre. Fix: R33's wide rule for a fine pointer only, the column's phone rule for short touch screens too, and a header that doesn't stick on short screens. Whether to do it at all is a user decision (below).
- **The full map's hint on a phone** names keys and clicks ("… click to ping a spot · M or Esc to close", `sf.mapHint`, `src/i18n.js:941`). Fix: touch wording, as `sf.hintTouch` has.
- **A short teleport counts as walking.** A jump of 10 tiles or less is walked distance (`D.TEAM.walk.jump`, capped at 7 tiles a second since the last position). In play only a collapse sent home from under 10 tiles out does this.
- **A refused beacon spot still shows the E or ◉ key cap** (`src/surface.js:978`, the `kbd` drawn beside every prompt, including "Too close to the base…", where E does nothing). Fix: leave out the `kbd` for a `beacon` focus that isn't holdable (Task 5 review, Minor 2).
- **Any mouse button pings on the full map** (`src/surface-map.js:213`, the `pointerdown` handler and the click that follows): a right-click pings the spot and opens the browser's context menu too. Fix: record `e.button` at `pointerdown` and ping only for the primary button (pen and touch report 0) (Task 5, Minor 3).
- **Small per-frame work in the draw loop** (Task 5, Minor 4; bounded, no growth with time):
  - `src/surface-eva.js:241` runs `JSON.stringify(goals)` every frame although the list changes only on the 0.5 s poll: move the comparison into the poll, keeping the language check.
  - `X.beaconSpot` runs every frame while a kit is carried (`src/surface-eva.js:564`). Its open-ground check uses `X.chunkAt`, so a cache miss builds a chunk synchronously in the frame, unlike the `peek` path the flare's cover check uses (`src/dangers.js`, `Z.coversIn`). It is one extra build per chunk crossed. Fix, if a frame trace shows it: recompute the spot only when the tile or the beacon count changes, or pass `peek`.
- **The HQ kit's `why` is built eagerly** (`src/surface.js:1142`, as `kit.reason`): a buildable kit calls `t('bld.why.undefined')`, and the reason mapping is repeated in the console's `kitButton` (`src/ui.js:1319`) (Task 6, Minor 1). Fix: build the text only when `kit.ok` is false, from one shared helper.
- **The older-than-M4d items seen on the way:**
  - Chrome warns about `apple-mobile-web-app-capable` on every load (`index.html:12`). Fix: add `<meta name="mobile-web-app-capable" content="yes">`.
  - The offline file loads Google fonts at run time (`src/ui.js:2231`) and logs 4 errors offline.
  - In co-op, the sticky ready bar (`.advance`, `src/style.css:346`) overlays the side panel: its "0/3 ready" label has no backdrop, and the disabled button is see-through.
- **Map flickers past 512 minis** (M3 follow-ups): `MINI_CAP` (`src/surface-paint.js:23`, evicting at `:530`) drops mini images the map redraws every frame. Fix: never evict a mini drawn in the current frame, or cache a coarser layer for zooms 1 and 2.
- **`explore()` skips `takeFog` while the astronaut is dead** (`src/surface.js:570`; M3 follow-ups): the new fog waits until you take a seat. Solo takeover is immediate, so it is harmless today.
- **The view radius against the visible area** (M3 follow-ups): at 1920 × 1080 the surface shows about 10.9 × 7.9 tiles, inside the 8-tile reveal radius, so fog shows only on the maps. Consider tying the radius to the visible area.
- **From the NASA floor** (`docs/superpowers/plans/2026-11-03-sol500-floor-followups.md` has the details and fixes; its four items are still open):
  - F12: the ground photos are made seamless at run time (`loadPhotos`, `src/surface-paint.js:143`), about 45 ms of main thread per photo. Fix: make them seamless in the generator of `src/ground-photos.js`.
  - F13: the nose probe (`NOSE = 40`, `src/surface.js:34`) doesn't keep the drawn rover out of a wall.
  - F7, its second half: a crewmate's rover heading jumps between relayed positions; ease it as the positions are eased in `stepRemote`.
  - Driving into a wall at an angle keeps the HUD's speed a little high.

### Console
- **The console's forecast can lag one render behind a goal met** in solo: `viewOps` (`src/ui.js:1081`) runs `E.forecast` before `expeditionPanel` brings the goals up to date with `goalsOf` (`:921`). The payout is right, because `G.advance` updates first. Fix: call `goalsOf(s)` first in `viewOps` (Task 2 review).
- **A card that arrives after the 8 s replaces the card on screen at once, even with the mouse on it or the focus in it** (`arrive`, `src/ui.js:673`; `nextCard`, `:661`). `nextCard` asks `reading()` only when something already waits. Nothing is lost for good, since the Notes keep it. Fix: in `arrive`, when no hold runs but `reading()` is true, queue the card and start the hold timer; add a test for it and one with `contains: () => true` (the test's stub is `contains: () => false`, `test/ui.test.js:451`) (Task 4, Minor 1).
- **Held cards are keyed by seed and mode only** (`src/ui.js:653`, `:665`, `:674`, `:710`): a mission that ended but is still `store.mission` (the debrief) counts as current, and `held` isn't cleared on a launch. A card held at the final advance opens unseen behind the debrief, and a card from an old mission can open in a new one with the same code, or a matching id at `:710` swallows the new mission's copy. The window is under 8 s a card. Fix: drop `held` in `nextCard` when `mission().status !== 'active'`, and clear it on a launch. The test (`test/ui.test.js:460`) covers only `mission: null` (Task 4, Minor 2).
- **`reopenRegionCard` leaves a waiting first-time card for the same region in `held`** (`src/ui.js:693`): click a region's name while its first-time card waits, and the card shows twice. Fix: `held = held.filter(e => e.c.id !== id)` before `openCard` (Task 4, Minor 3).
- **The best-find guard checks only amount and kind** (`src/ui.js:1606`; `src/engine.js`, the `bestFind` repair, about `:314`): a hand-edited `crewId: 'ghost'` or `region: 99` passes and draws as "name.ghost" or "region.undefined". It doesn't crash. `banked.best` is copied into `x.bestFind` without checking `crewId` and `kind`, and isn't repaired. Fix: require a real crew id and a real region in the UI, and drop a `banked.best` of the wrong shape in `repairExpedition` (Task 4, Minor 4).
- **Two copies of the same code in `src/ui.js`:** `isMap` is defined twice (`src/ui.js:771` and `:1597`), and the kit button's label and cost markup is repeated by the build menu's. Fix: one `isMap` at the top, and a small `bldLabel(name, spec)` used by both buttons. The two `exploreOf`s are deliberate; these are not (Task 4, Minor 6).
- **The ISRU note shows whether or not there is a mission** (`src/ui.js:1660`, `:2050`): the note is a NASA fact, so it's harmless. Decide: pin the article count with no mission in `test/ui.test.js`, or make the note depend on the mission (Task 4, Minor 7).
- **The engine writes the backpack-to-bank rule twice** (`src/engine.js:1030` and `:1103`: a kit goes to `x.kits`, the rest is banked late, a collapsed co-op astronaut keeps theirs). One helper would stop drift (Task 2, Minor 1).
- **A goal can pay a fractional kit from a hand-edited save** (`payGoals`, `src/engine.js:1070`; R34 rewrote the line). Fix: take `Math.floor` of the kit reward (Task 2, Minor 7).
- **`src/goals.js:74` and `:80` (`siteOf`, `structureKind`) parse ids with looser patterns than `idNums`** (`src/expedition.js:69`): `F01,2:0` counts as `F1,2:0`. Fix: reuse `idNums` (Task 2, Minor 4).
- **`src/goals.js:26`**: the header still calls the `chunks` kind `explore` ("an 'explore' goal"). Fix: say `chunks` (Task 2, Minor 8).
- **The `+` / `−` marker in the Science note's summary is part of its accessible name** (`.found-list summary::after`, `src/style.css:379`; Task 8, Minor 1): a screen reader says "plus" or "minus" on top of the collapsed or expanded state. Fix: add `content: '+' / '';` after the plain declaration, and the same for `\2212`; browsers without the alt-text syntax drop that line and keep the first.
- **`tools/explorer.js:6` has a dangling "(see)"** in a comment R25 rewrote ("as a player's game does (see)."). Fix: delete "(see)", or name `src/surface-eva.js` (Task 8, Minor 3).

### Words
- **The source labels** (`I.SOURCES`, `src/i18n.js:11`) are English in both languages. That design predates M4d.
- **The role facts** for a role card in "Choose your astronaut" (R8). The card should also say that the commander comes with the fifth seat: a 4-crew mission has none (`D.CREW_SIZES` is `[4, 5]`), so it has no aura and no route line. The five role lines, each under 30 words and checked against the NASA page named (the research agent's `sources.md` §C, git-ignored, may be gone):
  - Commander: "In NASA's 378-day Mars simulation, the commander's role was pivotal in maintaining crew morale and ensuring the success of daily operations." (https://www.nasa.gov/missions/voyagers-of-mars-the-first-chapea-crews-yearlong-journey/, "Voyagers of Mars: The First CHAPEA Crew's Yearlong Journey", Jul 11, 2024)
  - Scientist: "Harrison "Jack" Schmitt, a geologist and the Apollo 17 lunar module pilot, was the first scientist to step on the Moon." (https://www.nasa.gov/former-astronaut-harrison-schmitt/)
  - Engineer: "Four spacewalks in 2019 and 2020 replaced the failing cooling pumps of a space-station instrument that observes cosmic-ray particles. It was not designed to be repaired, and 29 specialized tools had to be made for the job." (https://www.nasa.gov/general/alpha-magnetic-spectrometer-hits-ten-years-of-space-station-research/)
  - Biologist: "NASA's Veggie garden on the space station has grown three types of lettuce, Chinese cabbage, mizuna mustard, red Russian kale and zinnia flowers." (https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/, dated Dec 08, 2023; it says "To date"). It fits the role's name more than its skill.
  - Medic: "A NASA Crew Medical Officer is the crew member assigned as a mission's medical expert, often but not always a physician. NASA requires at least two to be trained per vehicle." (https://www.nasa.gov/reference/5-0-training/)
- **Vietnamese strings that need a native read or a small fix:**
  - `ev.spe.shelter.hint` says "ngoài bề mặt", which reads literally "outside the surface" (`src/i18n.js:1616`; plan-mandated text) (Task 6, Minor 2).
  - `eva.err.notAtBase` says "trụ sở" where the new strings say "căn cứ" (`src/i18n.js:1883`; older text) (Task 6, Minor 4).
  - `lesson.isruMars.body` has two grammatical fill-ins ("vùng", "để"), and `goal.haul` drops "hàng"; no facts or numbers changed (Task 6, Minor 5).
- **The placeholder-parity test passes a key missing in Vietnamese when the English has no placeholders** (Task 6, Minor 3; the key-parity test covers it). Fix: make the parity test fail on a missing key itself.
- **The battery's fact "A Mars sol lasts 24 h 39 min, so half of every sol is dark"** (`item.battery.fact`, `src/i18n.js:252`) is cited to `marsGlance` in the field guide (`GUIDE_SOURCES.battery`, `src/ui.js:2000`) and is unverified there (floor re-review). Fix: check the press kit's text, or cite a page that says it, or drop the fact line.
- **The `src/physics.js:7` comment says the air's pressure is "under 1/100th of Earth's (its density about 1/60th)".** The floor re-review flagged the "1/100 thick" wording as untouched and out of its scope. Fix: check it against a NASA page and make the comment say the same as the guide's text.

### Explorer bot and balance tools
Each matters little for the numbers (from the dry run's balance report, Q6, and the Task 7 review):
- A failed `X.collect` ends the leg after its suit and battery were charged (`tools/explorer.js:261`). Fix: refund the leg or skip it.
- `known` and `knownPoi` are keyed by the seed alone (`tools/explorer.js:46`, `:59`): two missions of one seed but different state share a list.
- The careless rover row runs the `naive` loadout (`tools/balance.js:17`).
- `DEVIL_HITS` has no tool to measure it again (`tools/explorer.js:40`).
- A load left at a structure's door is re-queued only within its round, and a pod trip can start before the round's first `Z.flareStart` (`tools/explorer.js:257`). That was 0 of 1,200 rounds at M4c, not measured again with beacons as refill stops.
- The region goal's target uses the world map, which a player doesn't know (`tools/explorer.js:81`, `:179`; it does the same for finds already) (Task 7, Minor 1).
- A refused `X.placeBeacon` and the co-op `Z.slackOf` path in the bot have no test (Task 7, Minor 2).
- The plateau bound 1.25 is loose against the measured 136 against 135 loads (`test/explorer.test.js:217`; plan-mandated, R23). Tighten it when the haul rule changes.
- DUMP's `require('fs')` sits inside the per-run loop (`tools/balance.js:156`): hoist it (Task 7, Minor 4).
- `hq` in `haulRound` is computed even without `poi` (`tools/explorer.js:162`) (Task 7, Minor 5).

### Tests
- `test/rooms.test.js` checks only `.body.error` for a refused `placeBeacon` (`nearBase`). Pin the whole body, `{ error: 'nearBase' }`, so `need` can't leak unnoticed (Task 1, Minor 2).
- `holdSeconds` returns NaN for a kind named like an `Object.prototype` member (`src/expedition.js:171`: `base * (skill[kind] || 1)`). Every caller passes the game's own kinds. Fix: `const f = skill[kind]; return base * (Number.isFinite(f) ? f : 1);`, and add `'toString'` to the no-block case of the `lantern` test (`test/expedition.test.js:172`) (Task 3, Minor 2).
- A rooms test asserts something that can't fail: the cleaned plan writes to nothing shared, so `{}.count` stays undefined with or without the fix (`test/rooms.test.js`, in the `__proto__` plan test near `:949` at review time). Drop the line, or run the plan through a round first (Task 3, Minor 3).
- The order of `ping`'s checks is only partly tested (`lib/rooms.js:202`; tests from `test/rooms.test.js:816`): add a seat with no astronaut pinging outside `ops` (`noCrew` before `badPhase`), and a seat in its cooldown sending junk (`badPing` before `tooFast`) (Task 3, Minor 4).
- A guard that is always true and a stale comment in `test/expedition.test.js:163` (`if (D.EXPEDITION.beacon) HOLDS.beacon = …`): delete the guard and the "comes with the beacons branch" comment (Task 3, Minor 5; plan-mandated).
- The history test's `r.distance.diego <= 1e6` (`test/history.test.js:63`) doesn't pin the cap: a cap of 5 would pass. The 1e6 load cap and the 9999 count cap (`lib/history.js:43`, `:44`) aren't tried at all. Fix: `assert.equal(r.distance.diego, 1e6)`, plus one load of 1e12 and one 10,000-item `regions` list (Task 4, Minor 5).
- "The pack still waits a round earlier" is tested on turn 0, not turn `D.TURNS - 2` (`test/engine.test.js:895`), so an off-by-one at the last-round rule would pass (Task 2, Minor 2).
- `test/goals.test.js:24`'s `scienceNear` oracle mirrors `nearOf`, and the survey and structure tests write `x.sites` and `x.structures` directly instead of going through `X.collect` and `X.interact` (`:94`) (Task 2, Minor 3).
- The odd-reward case (`test/engine.test.js:1092`) asserts only science; a negative water reward isn't checked against a real delivery (Task 2, Minor 6).
- Test gaps on items Task 5's brief asked about (covered by reading, not by a test): a find or drop in reach still beats the kit's beacon focus (`src/surface-eva.js`, `stepFocus`); `reset()` clears the pings, goals and `goalsAt`; `onPos` with a non-array or no `store.room` (`src/ui.js`, `onPos`); and `addPing`'s newest-50 cap. One small test each (Task 5, Minor 5).
- Note on size: `src/ui.js` grew from 1,949 to 2,255 lines, `src/surface-eva.js` to 764. The card hold, the Science note and the debrief's Expedition section are separable; split when the no-new-files rule lifts.

### Open from earlier milestones
The M3 fog follow-ups above are the ones M4d's plan named. The rest of the M4c follow-ups doc (`docs/superpowers/plans/2026-10-21-sol500-m4c-followups.md`, "For the M5 plan") is still open, apart from the items M4d took (beacons as cover and as refills, `pod.refills`, the explorer's labels and bounds).

## For the user to decide
- **`D.SCIENCE.eva`** (R21): 20 today. Lowering it moves the rover kit's grades without exploring, which are 3.2.0's and §13.12 keeps. S grades per 1,000 on commander:

  | `D.SCIENCE.eva` | Sloppy rover kit | Sloppy rover kit + explorer | Thoughtful rover kit | Thoughtful rover kit + explorer |
  |---|---|---|---|---|
  | **20 (today)** | 13 | 549 | 503 | 954 |
  | 14 | 0 | 30 | 139 | 571 |
  | 8 | 0 | 0 | 0 | 17 |

  Claude's suggestion: keep 20. The rover kit is the exploring kit, and the S band is read on the reference kit.
- **A lying co-op client** (R10) can still claim the `chunks` goal (15 science) and the `region` goal (2 morale + 15 science). The fix would check reveals and regions against the seat's last relayed position, but positions are client-sent too.
- **The run length** (R20): full exploring takes about 2 hours. A shorter mission (fewer rounds, for a judge's first game) would be a change to a §1 non-goal, and it moves the balance.
- **The haul per round stays flat with beacons** (R23). If it should fall per round, the lever is the refill rule (a cap on refills a round, or fewer beacons). That hasn't been measured.
- **Phones held sideways** (R36): a target or not? On a sideways phone today, the sticky header leaves 121 px of the stage, and a card covers E and sprint. If they are a target, M5's phone pass takes them.
- **A native read of the Vietnamese.**
  - Start with the glossary at the end of `.superpowers/sdd/m4d/words-report.md` (git-ignored; it may be gone).
  - Then `bld.kit`, `eva.placed`, `lesson.isruMars.body`, `eva.auraLead` and `goal.rewardHaul`, where the wording was a choice.
  - Then Task 8's changed strings, with the browser pass's screenshots.

## Checks only the user can do by hand
The sandbox has no internet. These are carried from M1 to M4c, plus M4d's:
- A share-link game ends with an Online record that has the exploring counts.
- `https://<link>/admin` gives 404.
- The Live tab shows the share link and its QR code, and Stop sharing works.
- The CSV save dialog in the app.
- A ping and a beacon between two PCs over the share link.
- On a real phone in co-op, a joystick walk while goals move and cards open (the dry run used Chrome's touch emulation).
- A native read of the new Vietnamese strings (the glossary and the QA's screenshots, as above).
- Also from the task reviews, if the QA didn't cover them: R33 on a 1024 × 768 touch tablet (a tall card against `.sf-act`), R29 in the browser's accessibility tree, a ping and `away` across two real tabs, the 28 px ⤢ button on the phone minimap, and cards that fall due while the console is showing.

## For every later plan
- **A usage limit loses unsaved work.** An agent stopped by one keeps nothing it hadn't written to disk. In M4d the reviews of Tasks 3, 4, 5 and 8 died at a limit and left reports ending in "pending". Reviewers must write their findings to the report file as they go, one finding at a time, not at the end, and a re-dispatched reviewer starts from the partial file and verifies it. Implementers commit early and in small steps for the same reason.
- **Check a partial report against the code before fixing from it.** The saved partial findings (each task's one Important) were unverified; the controller checked each against the code first, and each held.
- **The controller can apply a verified range itself.** In M4d, Tasks 1 to 8 were each a `git apply` of a replayed range plus the test run and the plan's commit block (P1). An implementer agent would have added only cost. Dispatch each task's review as soon as it commits (P2); run fix rounds on HEAD after the last task.
- **Tests that pass before their code are regression guards,** named in the plan's Step 2 (P3). They assert real behaviour, so a reviewer should weigh a finding on one on its merits, not dismiss it as "asserts nothing".
- **A fix of one to five lines, with its test written first, may be made by the controller** (P6); the final whole-branch review covers it.
- **A plan's pinned constants can go stale when a side branch lands first.** The plan said the service worker cache `sol500-v4` → `sol500-v5`; the floor branch had already taken `v5` and the installed betas use it, so 3.6.0 takes `v6` (P7). When a plan names a version, cache name or hash, re-read the tree before the release task.
- **Fold a side branch in before the release task, not after** (P5): rebase it onto the milestone branch, run the suite, and run the release's QA, docs, version and installer on the combined tree.
- **The docs must match the code as built, not the reports.** Check each spec amendment against `src/data.js`, the code's own API and the wire frames. The ping frame's `by` is a crew id, not a name; QA that expects "the sender's name" means the name the client looks up from it.
