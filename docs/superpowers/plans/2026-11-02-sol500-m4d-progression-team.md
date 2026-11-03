# SOL 500 M4d — Progression and Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give exploring a reason to go further, and a team to do it with.
- **Relay beacons:** a kit built at the base (50 kg, 1.5 work points) and carried in a backpack slot is placed with a 4 s hold on open ground, at least 12 tiles from the base and 10 from another beacon, 6 a mission. A beacon refills a suit once per crew member per round, reveals the fog within 12 tiles for good (storms don't cut it), and a dashed route home links the chain to the base on the map and the minimap. It is not flare cover.
- **Expedition goals:** 1 a round in rounds 1–4 and 2 from round 5, picked from the seed, the round and the state among the goals that can be done. Progress shows in the HUD and the console; a goal met pays out at the advance and is named in the round report.
- **The team:** role hold times (the Scientist surveys, the Engineer mines metal, salvages pods and works structures, the Biologist collects ice, the Medic revives, each in half the time), the commander's route line and +10 % speed for crew within 5 tiles, pings (P or a tap on the minimap, 10 s, in solo too), and the distance each astronaut walks.
- **The debrief's Expedition section:** distance and finds for each astronaut, the best find, the regions, landmarks, structures, beacons and goals, who a flare caught; the ISRU lesson, word for word from NASA's pages; and Science notes that list every fact and story log the mission found, with its source.
- **The final rebalance,** the merge gate since M4a: on veteran, exploring now adds 22.0 points to the sloppy bot (the spec wants 10–25); an S grade is special again (commander: 292 of 1,000 thoughtful explorers, 37 of 1,000 sloppy ones); a mission played without exploring keeps its 3.2.0 grades. The two levers: an O₂ canister carried home brings 10 kg, not 30, and the map's science counts a tenth of itself in the score, up to 55 points.
- **The last round's backpack** is banked at the final advance, so it counts for the score and the debrief.

**Architecture:**
- **`src/data.js`** holds the numbers: `BUILDS.kit`, `EXPEDITION.beacon`, `GOALS`, `SKILLS.commander`, `TEAM` (walking and pings) and `SCORE.map`; `EXPEDITION.canister.o2` becomes 10.
- **`src/expedition.js`** gains the beacon rules (`takeKit`, `returnKit`, `beaconSpot`, `placeBeacon`, `routeHome`; `refill` takes a beacon's id as well as a pod's) and the team helpers (`holdSeconds` by role, `commanderOut`, `speedFactor`, `addDistance`).
- **`src/goals.js`** is a new pure module (`SolGoals`: `pick`, `offered`, `make`, `update`, `advance`). Picking a goal needs the world, so it lives outside the engine (spec §4), and solo and co-op both advance a round through `G.advance`, which updates the goals, runs `E.resolveTurn` and picks the next round's.
- **`src/engine.js`** builds kits through construction, pays each met goal once at the advance, banks the last round's backpack, records the best find and the flares, scores the map's science apart, and repairs every new field in old saves.
- **`lib/rooms.js`** runs the three beacon actions, computes the goals on the server (a client can't fake one), counts the distance walked from the positions it already relays, keeps only real names in a co-op plan, and relays pings; **`lib/ws.js`** carries the `ping` frame; **`lib/history.js`** records the exploring counts.
- **The surface** (`src/surface-eva.js`, `surface.js`, `surface-map.js`, `surface-paint.js`, `src/art.js`) takes, places and refills at beacons, draws kits, beacons, the route home and pings, and applies the aura and the role holds; **`src/net.js`** sends and hears pings. **`src/ui.js`** and **`src/style.css`** show the goals, the kit's build button, the round report, the debrief's Expedition section, the ISRU lesson and the Science notes. **`src/i18n.js`** has every new string in English and Vietnamese.
- **`tools/explorer.js`** and **`tools/balance.js`** play goals and beacons, so the rebalance measures the game as built.

**Tech Stack:** Plain browser JavaScript (no bundler; UMD/IIFE modules on `window`), Canvas 2D, SVG sprites, Node 24 built-in test runner (`node --test`), `ws` (already a dependency), Electron (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (v3.1). The sections that apply:
- §1.4 (balance targets) and §1.6 (run length);
- §3.2 (suit refills; the O₂ canister), §3.3 (role skills), §3.5 (pings, the team HUD), §3.8 (relay beacons), §3.9 (expedition goals), §3.10 (the debrief's Expedition section);
- §4 (the state: `beacons`, `kits`, `refills`, `goals`, `stats`) and §5 (the server checks every item action; pings);
- §12 (the five M4d items) and **§13.12, the calls made for M4d** (Take shelter, the veteran sloppy-bot target, S grades, the last round's backpack, the Science note, solo pings, beacons aren't flare cover, one release).

Follow-ups this plan takes:
- `docs/superpowers/plans/2026-10-05-sol500-m4a-followups.md`, "For the M4d plan" and "The final rebalance": beacons, goals, pings, the debrief's distance walked, ISRU sources, the last round's backpack, the run length, the rebalance as the merge gate.
- `docs/superpowers/plans/2026-10-13-sol500-m4b-followups.md`, "For the M4d plan": a beacon's reveal never reads the storm-cut `Z.viewTiles`; the debrief names who a flare caught.
- `docs/superpowers/plans/2026-10-21-sol500-m4c-followups.md`, "For the M4d plan": beacons share the pods' refill rule and `pod.refills` goes; goals and the history record read `stats[crewId].landmarks/structures`; the bot's test bounds and the "+ explorer" label; the 13 landmark and formation sources in a Science note; a card that another card replaces is no longer lost.
- `docs/superpowers/plans/2026-10-02-sol500-m3-followups.md`, lines 26–33: fog keys and the per-seat fog budget, now that explored chunks pay a goal.

**Branch:** `feat/m4d-progression-team`, off `master` at `a94e141` plus `f82bfe9` (the spec's §13.12). 472 tests pass on it. It holds this plan and is otherwise clean.

**How this plan was made:** every task was built first as a dry run on branch `m4d-dryrun` (`f82bfe9..e79d28f`) by parallel agents, in four waves:
1. the rules (beacons, goals and the team, plus the research);
2. the console, the surface and the bot;
3. the words;
4. the fixes for what the dry run's browser pass found.

Each wave was merged and tested before the next began.
- **Tests:** 628 of 628 pass on `e79d28f` (472 before).
- **The tasks are the dry run's ranges:**
  - Each of Tasks 1–8 is one range of `m4d-dryrun`'s first-parent chain, and the full suite passed on the tree at each range's end.
  - Applied in order to a clean `f82bfe9` checkout (`core.autocrlf=true`) with a plain `git apply`, each task's test diff and then its code diff give exactly the range's end tree. After Task 7 the tree is `c8ff6bd`; after Task 8 it is `e79d28f`.
- **Tests first:**
  - The eight ranges were replayed on clean worktrees. Each task's tests, applied without its code, fail as its Step 2 says; the few that pass already are named there as guards.
  - With the code they pass, and the full suite passes after every task: 488, 507, 536, 572, 598, 602, 610, 628.
- **Balance:** the bots over 1,000 seeds × 3 difficulties, before and after (see "Measured in the dry run").
- **Browser:** 19 checks in Chrome (`.superpowers/sdd/m4d/qa-report.md`): solo and three-seat co-op, English and Vietnamese, desktop and a phone, a 3.5.0 save, the offline file and the frame rate. On the final tree all 19 pass, and resume 5's 8 re-checks of Task 8's last fixes on `e79d28f` pass too. The pass found 10 problems, none Critical. Task 8 fixes 8 of them, each seen fixed in the browser. The other 2 are Minor phone-layout ones, which go to M5 (R36).

## How each task is built

- **Tasks 1–8 apply the dry run's code.** Step 1 applies the range's test diff, `git diff A B -- test | git apply`, from the repo root. Step 2 runs those tests and sees them fail as it says. Step 3 applies the code diff, `git diff A B -- . ':(exclude)test' | git apply`. Step 4 runs the task's tests, then `npm test`. Step 5 makes one commit on `feat/m4d-progression-team`. Don't cherry-pick or merge the dry run's commits: the build has one commit per task.
- **Each task section is the spec for its review.** "What it must provide" lists what the code must do, line by line; the "Keep:" lines are decisions a reviewer might otherwise "fix", each with its reason. The dry run's code is reviewed like new code: a reviewer's finding is fixed in the task, with a test.
- **After a review fix,** a later range may not apply cleanly. Use `git apply --3way` and resolve, keeping both changes; then the section's tests and `npm test` must pass as written.
- **`m4d-dryrun` and the `m4d-dry-*` branches stay** until M4d is merged into `master`. Each task names its range; nothing else is needed from them.
- **Task 9 is written out in full:** the release.

## Global Constraints

- **No new runtime dependencies.** Browser code stays plain `<script>` files loaded in order by `index.html`. M4d adds one, `src/goals.js`, after `src/expedition.js` and before `src/ui.js`; `sw.js` caches it.
- **Pure modules stay pure:** `src/engine.js`, `src/expedition.js`, `src/worldgen.js`, `src/dangers.js` and `src/goals.js` use no DOM, no `Date.now()` and no `Math.random()`; anything random comes from the seed through `W.hash`. The engine doesn't depend on `worldgen.js` (spec §4): goal checks that need the world run in `src/goals.js`.
- **The world doesn't change:** M4d touches no worldgen code. The pinned hashes stay **`3ae4db5e`** (world), **`0e84f5a1`** (finds) and **`c656b50b`** (caves).
- **Ids:** beacons `"B<i>"` in placement order, no leading zeros, never removed; goals `"G<turn>:<i>"` (`m.turn` is 0-based); hab pods `"S<i>,<j>"`. `x.refills[crewId]` holds both kinds of id. Compare by id, never by object.
- **Coordinates:** tiles are 64 px and the HQ is tile (0, 0). Every action's position is in world pixels; a beacon is stored in whole world tiles. Distance walked is in tiles everywhere, the history record too (spec §8.3's record says `distance: { crewId: m }`; Task 9 amends it). In co-op the server uses **the last position it received**, never one in the request, with 1.5 tiles of slack (`D.EXPEDITION.reach`).
- **Numbers from the spec, unchanged:** a kit is `D.BUILDS.kit = { materials: 50, work: 1.5 }`; `D.EXPEDITION.beacon = { hold: 4, base: 12, apart: 10, max: 6, refill: 2, reveal: 12 }` (seconds and tiles); a beacon refills once per crew member per round; goals: 1 in rounds 1–4, 2 from round 5 (`D.GOALS.two = 5`), a survey or a beacon `N = min(120, 30 + 5 × round)` tiles out, and the rewards of spec §3.9; the role factors 0.5 (`D.SKILLS`); the commander's aura `{ auraRange: 5, auraSpeed: 1.1 }`, only while the commander is outside; pings fade after 10 s, one a second per seat (`D.TEAM.ping = { life: 10, gap: 1, range: 10000 }`).
- **Numbers M4d sets** (spec §3.9 leaves them open; the dry run measured them): a haul goal is 4 loads with a 25 % bonus, a chunks goal 4 chunks, goals are looked for within 150 tiles (`D.GOALS.reach`); `D.TEAM.walk = { jump: 10, speed: 7 }` (a step over 10 tiles is a reload or a teleport; nobody walks faster than 7 tiles a second); `D.SCORE.map = { share: 0.1, cap: 55 }`; `D.EXPEDITION.canister = { suit: 45, o2: 10 }`.
- **Trust boundary (the share link):** a co-op plan keeps only real names (own keys of `D.BUILDS`, `D.MODULES`, `D.DEPOT.amounts`); a build, scrap or request named `'__proto__'`, `'toString'` or `'constructor'` is unknown and reaches nothing. An action's error goes out as `{ error: code }` only. The server computes goal progress; clients never report it.
- **Old saves keep loading:** every new or reshaped field goes through `repairExpedition` (`src/engine.js`), with a test. A 3.5.0 save resumes with no beacons, no kits and no goals, and plays on.
- **Text:** every player-facing string goes in `src/i18n.js` in English and Vietnamese (the key-parity test, and from Task 6 a placeholder-parity test). Facts are real, each with its NASA source; the ISRU lesson is quoted word for word from its pages. Kestrel logs stay fiction, labelled as such.
- **Commits:** one per task unless a step says otherwise, on `feat/m4d-progression-team`. Messages are imperative and prefixed (`feat(expedition):`, `feat(ui):`…), say why in the body, and end with exactly this line, not your own model name:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Line endings:** the working tree uses `core.autocrlf=true`; `git apply` handles the CRLF files by itself (checked for every task). If you patch with a script instead, normalise endings first and write each file back with its own endings.
- **Before any browser check:** stop old servers on ports 5050–5079. Use **5071** for QA servers; Chrome refuses 5060 and 5061, and 5050–5059 are the user's app. One Chrome window, tabs; close each tab when its check is done; never type into a tab you didn't open. Don't run timed frame-rate checks while a `node --test` runs.

## Rulings made while planning (binding unless the user overrules them)

The user left the M4d calls to Claude on 2026-10-27 ("just start, make the calls yourself"); spec §13.12 holds the first eight. These came up while building the dry run. The task sections cite them by number.

- **R1. Beacons aren't flare cover** (§13.12) and share the hab pods' refill rule: `X.refill` takes a beacon's id or a pod's, once per crew member per round, recorded in `x.refills`. `pod.refills: 1`, which nothing read, is deleted from `src/data.js`.
- **R2. A beacon's fog reveal is a place-based reveal at placement** (12 tiles round the beacon's tile, permanent and shared), never the storm-cut `Z.viewTiles`.
- **R3. Goal progress is derived from the mission state:** a baseline is captured when the goal is picked and compared with the state now. Clients never report it; in co-op the server computes it.
- **R4. Picking goals needs the world, so it lives in `src/goals.js`, not the engine.** Solo (`src/ui.js`) and co-op (`lib/rooms.js`) both advance through `G.advance(m, plan)`: it updates progress, runs `E.resolveTurn` (which pays each met goal once and reports it), then picks the next round's goals.
- **R5. Walked distance in co-op is measured by the server** from the positions it already relays, ignoring jumps (a reload, a teleport). Solo reports through the same pure helper, `X.addDistance`.
- **R6. Hold times by role come from one pure function,** `X.holdSeconds(kind, role)`, used by the surface and the bot.
- **R7–R9. The words of the facts.** The ISRU lesson's fifth sentence stays: it opens "In the game" and claims nothing about metal on the real Mars, and no real-world metal line goes anywhere. The beacon's NASA line (the Mars Relay Network) goes on the kit's build button; the role facts wait for M5's role card. No orbiter count appears in the game's text.
- **R10. A lying co-op client can still claim the `chunks` and `region` goals** (fog bits up to its seat's budget of 800; the `region` action is trusted). Accepted for M4d: the cost is score only, between friends, and positions are client-sent too. It goes in the follow-ups.
- **R11. The balance runs play the goals as solo play does:** `tools/balance.js` picks them with `G.pick` and advances with `G.advance`, and the thoughtful explorer goes after them (Task 7).
- **R12–R14. Names as built:** the progress function is `G.update(m)` (spec §4 says `goalProgress`); pings keep their own frame `{ t: 'ping', d: { x, y, by } }` (spec §5 says an `event` with `from`); walked distance is in tiles everywhere, the history record too (spec §8.3's record says `distance: { crewId: m }`; the game has no metre scale). Task 9 amends the spec.
- **R15. The card hold protects every card that has been up for less than 8 s,** a landmark's discovery card included, so a log or a fact is never lost to the next card.
- **R16. Hab pods stay a visit count,** `stats[crewId].pods`. The debrief has no count of distinct pods.
- **R17. A commander driving the rover still gives crew on foot within 5 tiles the aura;** the driver gets none.
- **R18–R19. The beacon kit is offered in two views,** the console's build button and the HQ menu, as the shield is; both say why not with `bld.why.maxKit`. The surface's goals use the console's `goal.title`.
- **R20. The run length (§1.6) can't hold with full exploring.** One 150 s suit a round over the fixed 20 rounds (a §1 non-goal to change) is already about 37 minutes outside, and refills at beacons and pods are the intended progression (§3.8). No lever: Task 9 amends §1.6 to the measured lengths.
- **R21. `D.SCIENCE.eva` stays 20.** Lowering it would move the rover kit's no-exploring grades (3.2.0's, which §13.12 keeps), and §13.12's S targets are met on the reference kit. It goes to the user under "For the user to decide", with the measured what-if.
- **R22. The plan's form:** each task applies a verified range of the dry run (see "How each task is built").
- **R23. The haul plateau (§1.4) is read per suit charge.** A haul that stays flat per round is the beacons' intended growth in reach.
- **R24. The debrief explains the score's Science row** with one line under the score table when the map's science counts, and none for a lost mission (Task 8).
- **R25. Small fixes the balance work found.** Task 8 takes comments and a stale "30 kg". Task 9 takes the spec's words for `expedition.science` and `D.SCORE.map`, and a fresh balance run on the release tree.
- **R26. The HQ menu numbers its enabled buttons in order,** so Advance is 4 when both the shield layer and the kit can be built (3 before). This is kept: a disabled button already shifts the numbers, and each button shows its own.
- **R27–R36: what the browser pass found** (all Task 8, except R32 and R36):
  - **R27.** A low suit at a beacon or hab pod already used this round is told why nothing comes, once a round for each.
  - **R28.** A new HUD note fits in 2 lines in English and 3 in Vietnamese at 210 px; `eva.placed` drops the fog part, which the map shows.
  - **R29.** Each "Found on this mission" entry is a closed native `<details>`.
  - **R30.** The delivery note says nothing about a kit left in the pack: the pack slot and the "Put the beacon kit back" button show it.
  - **R31.** Every number the surface writes follows the player's language, as the console's do: costs, a build's progress, power, and a hold's seconds ("1,5" in Vietnamese).
  - **R32.** The pass's other open questions go to the follow-ups ("For later plans"). Co-op actions stay judged by the seat's last relayed position: that's the trust boundary, and only QA teleports met it.
  - **R33.** A card never opens under the HUD's column. On wide screens it sits on the right, under the minimap. On a phone, the column keeps its suit, battery and backpack rows while a card shows.
  - **R34.** A goal's kit is paid only into the room left under the 6, counting kits being built; a kit the limit cuts comes as its 50 kg of materials.
  - **R35.** The route home leads home: a beacon links only to an older beacon nearer the HQ than itself.
  - **R36.** The last re-check's two phone-layout findings go to M5, with the sticky header (431 of a portrait phone's 915 px, older than M4d). M5 has to lay the phone out again around that header anyway. The two findings: the touch hint under the HUD's column, and a phone held sideways. Whether a sideways phone is a target is for the user to decide ("For later plans").
- **The rebalance's levers** (Task 7): an O₂ canister carried home brings 10 kg, not 30 (it was most of what exploring added on veteran); the map's science counts a tenth of itself, up to 55 points, tallied apart in `expedition.science`. The careless and sloppy bots chase no goal and carry no kit; the thoughtful one does.
- **The last advance** (Task 2): every backpack is banked before the last round is simulated, except a co-op astronaut still collapsed outside, whose pack waits where they fell; a carried kit goes back to `x.kits`, never banked as a resource.

## Review Focus

The five input classes or failure modes most likely to bite a real player that no feature test would naturally hit. Each has a test in the task that owns the code.

1. **A 3.5.0 save resumed after updating.**
   - Its expedition has none of M4d's state: no beacons, kits, goals, goal records, map science, best find or new per-crew counts.
   - It must load, be repaired, get its goals at the next advance, and play on.
   - A hand-edited save with junk in any of those fields must never reach the rules.
   - *Covered by:*
     - Task 1's `a saved relay beacon state is repaired: a beacon that isn't { x, y, by, round } on a tile is dropped, kits are a whole number, refills are lists of ids, a carried kit is a kit item`;
     - Task 2's `a save from before M4d has no goals; it plays on and gets its goals at the next advance` and `a saved goal or goal record with the wrong shape is dropped, and a save from before M4d gets an empty record`;
     - Task 3's `a save with a bad distance loads with it dropped, the good stats stay, and walking goes on from there`;
     - Task 4's `a saved best find, flare count or pod visit count with the wrong shape is dropped, so the debrief and the notes never meet one`;
     - Task 8's `a saved stats entry whose finds is no map, or whose structure, landmark or find counts are no numbers, is repaired, so collecting after the load works`;
     - Task 9's browser step with a 3.5.0 save.
2. **The last round.** Round 20 is settled at the final advance, which has no next round.
   - A goal met in round 20 is paid once and counted in the debrief.
   - Every backpack is banked late, and a carried kit goes back to the base.
   - *Covered by:*
     - Task 2's `the last round's backpack is banked at the final advance, so it counts for the score and the report (M4d)`;
     - Task 4's `the last round's backpack is banked at the final advance, and the report lists it in the banked lines' words`;
     - Task 8's `solo: a goal met in the last round is paid at the final advance, once: the report lists it, goalsDone keeps it, the debrief counts it and its science reaches the score`.
3. **A beacon kit that leaves a backpack without being placed.**
   - A kit still carried at the advance is back at the base.
   - A kit held by a co-op astronaut still collapsed waits where they fell.
   - A kit dropped in a solo collapse lies in the drop. It isn't counted, so one more can be built; it can still be picked up and placed; and the limit of 6 beacons still holds.
   - *Covered by:*
     - Task 1's `a beacon kit still carried at the advance is back at the base, never banked; one a collapsed astronaut held waits where they fell`;
     - Task 8's `solo: a kit carried by an astronaut who collapses is in the drop with the load; one more can be built, the next advance leaves the drop, and the kit picked up is placed, until the 6th` and `a kit in a drop that newer drops push out (maxDrops) goes with it: accepted, since a dropped kit no longer counted`.
4. **A co-op client that lies or sends junk over the share link.** It might:
   - send a plan naming `__proto__`, `toString` or `constructor`;
   - send an action from a spot it isn't at;
   - claim goal progress;
   - ping faster than once a second, or with junk in the ping;
   - post a finished mission's record with junk counts.
   - *Covered by:*
     - Task 1's `a build or a scrap named like a property every object has ('__proto__', 'toString') is unknown: nothing starts or is scrapped, and nothing reaches Object.prototype` and `co-op: a relay beacon is placed through the server where it last saw you, its fog reaches every tab, and a crewmate's suit is refilled by it`;
     - Task 2's `co-op: every room frame carries the goals' progress as the server judges it, and new fog that moves an open 'explore' goal sends one`;
     - Task 3's `a co-op plan can't queue, scrap or request a type named like a property every object has, nor a non-string one`, `a seat gets one ping a second: a faster one is dropped without a word, and the next comes through once the second is up` and `a ping sent over the socket reaches every player as { x, y, by }, the sender named by the server, and one inside the second is dropped`;
     - Task 4's `a mission posted by a browser cannot put junk into the record: only its own crew, the game's kinds and whole positive numbers get in`.
     - What a lying client can still claim is ruling R10's.
5. **Cards and notes when much happens at once.**
   - The cases: a fact card, then a region card as the player walks on; a card the player is reading; a discovery heard twice.
   - Nothing is lost (R15), and the debrief lists each find once.
   - *Covered by:*
     - Task 4's `a card that arrives while a log or fact opened less than 8 s ago is still up waits, and opens when the 8 s are over; after that the next one opens at once`;
     - Task 4's `held cards open in the order they came, each after the one before had its 8 s; a new region's card is held too, and a discovery heard twice while it waits is one card with its reward`;
     - Task 4's `a card is not replaced while the player is reading it, the mouse on it or the focus in it; and what waited for a mission that is over is dropped`;
     - Task 4's `a fact or log found twice is listed once: two deltas (the first finder named), two supply caches, a region entered twice`;
     - the dry run's browser check 6, repeated in Task 9.

## File Structure

| File | Status | Responsibility | Tasks |
|---|---|---|---|
| `src/data.js` | modify | `BUILDS.kit`, `EXPEDITION.beacon`, `GOALS`, `SKILLS.commander`, `TEAM`, `SCORE.map`, `canister.o2`; `pod.refills` goes | 1, 2, 3, 7 |
| `src/expedition.js` | modify | beacon rules; `refill` by beacon or pod; `holdSeconds` by role; `commanderOut`, `speedFactor`, `addDistance` | 1, 3, 4, 8 |
| `src/goals.js` | create | picking, progress and the advance for expedition goals | 2 |
| `src/engine.js` | modify | kits in construction, goal payout, the last backpack, records, the score's map term and its figures, the save repair | 1, 2, 3, 4, 7, 8 |
| `src/dangers.js` | modify | the three beacon actions in `Z.act`; `refill` by beacon or pod | 1 |
| `src/fog.js` | modify | strict fog keys | 2 |
| `lib/rooms.js` | modify | beacon actions, goals on the server, walked distance, the plan's own keys, the ping relay | 1, 2, 3 |
| `lib/ws.js` | modify | the `ping` frame | 3 |
| `lib/history.js` | modify | the record's finds, tiles walked and exploring counts | 4 |
| `src/net.js` | modify | sending and hearing pings | 3 |
| `src/ui.js` | modify | goals in the console, the kit button, the round report, the debrief's Expedition section, the ISRU lesson, the Science notes, the card queue; the surface hooks | 2, 4, 5, 8 |
| `src/style.css` | modify | the goals panel, the debrief section, the surface's new chips | 4, 5, 8 |
| `src/surface-eva.js`, `src/surface.js` | modify | kits, beacons, refills, pings, the aura, role holds, walked distance, goals in the HUD; the build menus' costs | 5, 6, 8 |
| `src/surface-map.js`, `src/surface-paint.js`, `src/art.js` | modify | beacons, kits, the route home and pings on the maps and the ground | 5 |
| `src/i18n.js` | modify | every new string in English and Vietnamese | 1, 4, 5, 6, 8 |
| `index.html`, `sw.js` | modify | load and cache `src/goals.js`; the cache name | 2, 9 |
| `tools/explorer.js`, `tools/balance.js` | modify | the bots play goals and beacons; the rebalance | 7, 8 |
| `test/goals.test.js` | create | the goals | 2 |
| `test/*.test.js` (engine, expedition, rooms, dangers, fog, ws, net, history, ui, surface, surface-eva, surface-map, surface-paint, i18n, sw, explorer, worldgen-poi) | modify | new and changed cases | 1–8 |
| spec §1.4, §1.6, §3.2, §3.3, §3.9, §4, §5, §8.3, §12, §13.12; `docs/superpowers/plans/2026-11-02-sol500-m4d-followups.md`; `package.json`; `dist/` | modify/create | Task 9 | 9 |

---

### Task 1: Relay beacons: the rules

A crew can build a relay beacon kit at the base, carry it out in a backpack slot, place it on open ground at least 12 tiles from the base, and refill a suit at it once a round. Each beacon reveals the fog within 12 tiles for good, and a route home links the beacons to the base. This task is the rules only: the pure functions, the co-op actions on the server and the save repair (the console's kit button is Task 4, the surface Task 5, the words Task 6). It carries out spec §3.8, §3.2 and §13.12 (beacons aren't flare cover) and rulings R1 and R2, and it closes a hole that is on master today: a co-op plan that scraps `'__proto__'`.

**Dry-run code:** `m4d-dryrun` `f82bfe9..cd4929a` (9 commits). Full suite 472 → 488.

**Files:**
- Modify: `src/data.js` — `BUILDS.kit`; `EXPEDITION.beacon`; `STRUCTURES.kinds.pod.refills` removed (and its comment).
- Modify: `src/engine.js` — `isKit` and `kitItem` (exported); `kitsMade`; `own`; `canBuild`; `simulate` (build start, project finish, scrap loop); `rollExpedition`; `repairExpedition`; the state comment.
- Modify: `src/expedition.js` — new `takeKit`, `returnKit`, `beaconSpot`, `openGround`, `placeBeacon`, `routeHome`; `refill` takes a beacon id or a pod id; `deliver` keeps kits in the pack; the header comment.
- Modify: `src/dangers.js` — three action types in `Z.act`'s table; `refill` reads `b.beacon || b.pod`.
- Modify: `lib/rooms.js` — `EXPEDITION_ACTIONS` gains the three; one comment.
- Modify: `src/i18n.js` — six placeholder `eva.err.*` strings, en and vi. The existing `test/i18n.test.js` wants one for every `error:` code in `src/expedition.js`. Task 6 rewrites them.
- Test: `test/engine.test.js` — 5 new; `test/expedition.test.js` — 8 new; `test/rooms.test.js` — 2 new; `test/dangers.test.js` — 1 new; `test/worldgen-poi.test.js` — 1 changed (the `pod.refills` pin is removed).

**Interfaces:**
- Consumes (master `f82bfe9`): in `src/expedition.js` the private `able(m, crewId)` (refuses with `badPhase` | `noCrew` | `notActive` | `collapsed` | `benched`), `inBaseZone(pos, slack)`, `capacity(m, crewId)` (3 on foot, 8 in the rover), `pack`, `okPos`, `nearPx`, `idNums`, `poiAt`, `chunkAt` and `revealAround(m, cx, cy, r)` (the weather station's reveal); `W.BLOCKING`, `W.TILE.STRUCT_FLOOR`, `W.tileOf`, `W.CHUNK`; `E.bankItem`; `D.PLACED`; `D.EXPEDITION.reach` (1.5, the slack every action gets) and `.suit` (150); in `lib/rooms.js` `shareFog(room, r.fog)`, which already runs after every expedition action.
- Produces:
  - Constants: `D.BUILDS.kit = { materials: 50, work: 1.5 }` (not in `BUILD_ORDER`, not in `PLACED`); `D.EXPEDITION.beacon = { hold: 4, base: 12, apart: 10, max: 6, refill: 2, reveal: 12 }` (seconds and world tiles).
  - State (`m.expedition`; `newExpedition` already had the fields): `beacons: [{ x, y, by, round }]`, integer world tiles (the HQ is tile 0,0), `by` a crew id, `round` = `m.turn` at placement; beacon `i` has the id `"B<i>"` (no leading zeros) and beacons are never removed. `kits: n`, an integer >= 0: the kits waiting at the base. A carried kit is the backpack item `{ kind: 'kit', res: 'kit', amount: 1 }` and takes one slot. `refills: { crewId: [id] }` now holds hab pod ids (`"S<i>,<j>"`) and beacon ids together; the advance clears it.
  - `E`: `isKit(item) → boolean`; `kitItem() → { kind: 'kit', res: 'kit', amount: 1 }` (fresh each call). `canBuild(s, type, pending) → { ok: true } | { ok: false, reason: 'unknown' | 'max' | 'materials' | 'space' }`; `space` never applies to a kit.
  - `X` (every one runs `able` first; `pos` is `{ x, y }` in world pixels):
    - `takeKit(m, crewId, pos) → { ok: true, kits } | { error: 'notAtBase' | 'noKit' | 'full' }`; `kits` is what is left at the base. It works in the base zone with the 1.5-tile slack.
    - `returnKit(m, crewId, pos) → { ok: true, kits } | { error: 'notAtBase' | 'noKit' }`. It puts the first carried kit back.
    - `beaconSpot(m, crewId, pos) → { ok: true, x, y }` (the tile under you) `| { error }`. It changes nothing. The first failing check answers: `badPos`, `noKit`, `limit` (6 placed), `{ error: 'nearBase', need }` (under 12 tiles from the HQ tile), `{ error: 'nearBeacon', beacon: 'B<i>', need }` (the nearest beacon is under 10 tiles away), `blocked`. `need` is the tiles still to go, a float.
    - `placeBeacon(m, crewId, pos) → { ok: true, beacon: 'B<i>', fog } | beaconSpot's error`. It pushes the beacon, uses up one carried kit and reveals every tile whose middle lies within 12 tiles of the beacon tile's middle. `fog` is the changed chunks `{ "<cx>,<cy>": base64 }`, as `interact`'s.
    - `refill(m, crewId, id, pos) → { ok: true, suit } | { error }`; `id` is `"B<i>"` or a pod id. Errors: `badPos`; for a beacon `noBeacon` | `tooFar`; for a pod `noStructure` | `tooFar` | `badKind`; then `refilled`. Any other spelling (`B01`, `b0`, `B`) goes down the pod path and gets `noStructure`.
    - `routeHome(m) → [{ from: 'B<i>', to: 'base' | 'B<j>', x0, y0, x1, y1 }]`, one link per beacon in placement order, world tiles (the base end is 0,0).
    - `deliver` (changed): banks everything but kits; `{ ok, items }` lists only what was banked; a pack of only kits is `{ error: 'empty' }`.
  - `Z.act` table: `takeKit`, `returnKit` and `placeBeacon` (empty bodies; the position comes from the caller); `refill`'s body is `{ beacon: 'B<i>' }` or `{ pod }`.
  - `lib/rooms.js`: the three actions in `EXPEDITION_ACTIONS`. The server checks them against the last position it saw, broadcasts the room, and sends `placeBeacon`'s `fog` out through `shareFog`. An error goes out as `{ error: code }` only, so `need` and `beacon` never reach a client.
  - i18n: `eva.err.noKit`, `.limit`, `.nearBase`, `.nearBeacon`, `.blocked`, `.noBeacon`, in en and vi (placeholders).

- [ ] **Step 1: Write the failing tests**

Apply the dry run's tests from the repo root: `git diff f82bfe9 cd4929a -- test | git apply`. If an earlier task changed after its review and this doesn't apply, use `git apply --3way` and resolve.

`test/engine.test.js` (5 new):
- `a relay beacon kit is a build of 50 kg and 1.5 work points; finished, it waits at the base and the report lists it` — `D.BUILDS.kit` is `{ materials: 50, work: 1.5 }`; `canBuild(st, 'kit', [])` is `{ ok: true }` (no spot); the forecast's `delta.materials` is -50 + regolith; the engineer on construction finishes it: `report.started` and `report.completed` are both `['kit']`, `kits` 1, `projects` `[]`, `layout` unchanged, `totals.built` 1.
- `kits stop at the 6 beacons a mission places: those placed, at the base, in a backpack, being built and queued all count` — 1 placed + 2 at the base + 1 carried (a junk `carried.diego` is ignored) + 1 project: one more fits; one queued fills it (`max`); of two queued builds only the first starts; at 49 kg it is `materials`.
- `a build or a scrap named like a property every object has ('__proto__', 'toString') is unknown: nothing starts or is scrapped, and nothing reaches Object.prototype` — for `__proto__`, `toString`, `constructor` and `hasOwnProperty`: `canBuild` is `{ ok: false, reason: 'unknown' }`; a plan with that type in `builds` and `scrap` starts and scraps nothing; resources equal a plain turn's (no NaN, no free spare); `({}).count` stays undefined.
- `a beacon kit still carried at the advance is back at the base, never banked; one a collapsed astronaut held waits where they fell` — co-op, `kits` 1, minh carries kit, metal, kit, diego (collapsed at 900,-640) carries a kit: after the advance `kits` is 3, `carried` is `{}`, `banked.materials` is 40 and the banked lines are `['metal']`, `drops` is `[{ id: '0:diego', x: 900, y: -640, items: [kit] }]`, the report's lines are `[]`.
- `a saved relay beacon state is repaired: a beacon that isn't { x, y, by, round } on a tile is dropped, kits are a whole number, refills are lists of ids, a carried kit is a kit item` — of 7 saved beacons (null, 'B0', one good, x as a string, x 20.5, no `by`, no `round`) only the good one stays; `kits` 1.5 → 1 and -2 → 0; `refills` `{ minh: ['B0', 3, null, 'S0,-1'], lena: 1, diego: 'B0' }` → `{ minh: ['B0', 'S0,-1'], lena: [], diego: [] }`; carried `[{ kind: 'kit' }, ice, { kind: 'kit', res: 'materials', amount: 500 }]` → `[kit item, ice, kit item]`; the advance then runs: `kits` 3, `banked.water` 40.

`test/expedition.test.js` (8 new; EXP-1 spots below are tiles):
- `a beacon kit is taken from the base into a backpack slot, and put back the same way` — no kit: `noKit`. With 2: `notAtBase` from 5 tiles out and from `null`, `noCrew` for 'nobody', all changing nothing; from 3 tiles `{ ok: true, kits: 1 }`; with 3 items in the pack `full`; `returnKit` is `notAtBase` from 5 tiles, `{ ok: true, kits: 2 }` at the base (the other loads stay), then `noKit`.
- `delivering banks the finds and keeps the kit, so it goes out again: a kit is never banked as a resource` — kit and a metal find: `deliver` returns only the metal, the kit stays, `banked.materials` 40, the lines are `['metal']`; a second `deliver` is `empty`; `kits` is 0.
- `a relay beacon goes on the tile you stand on and uses up your kit; it reveals the fog within 12 tiles, for good` — in a global dust storm, `placeBeacon(m, 'minh', at(12, 0))` gives `beacon: 'B0'` and `beacons` `[{ x: 12, y: 0, by: 'minh', round: m.turn }]`; the pack is `[]`; `r.fog` equals `x.revealed`; the tile 12 out is seen in all four directions, the tile 13 out is not; `diego` placing at (12, 10) gets `B1`.
- `a beacon stands 12 tiles or more from the HQ and 10 from any other, 6 a mission, from a kit you carry: beaconSpot says why not, how far is still to go and which beacon is in the way, changing nothing` — no kit: `noKit`. With beacons at (12,0) and (20,8): (11,0) is `{ error: 'nearBase', need: 1 }`; (8,8) is `nearBase` with `need` 12 - sqrt(128); (-12,0) is `{ ok: true, x: -12, y: 0 }`; (14,7) is `nearBeacon` naming `B1` with `need` 10 - sqrt(37); (12,-10) is ok (exactly 10 from B0); `null` is `badPos`; `placeBeacon` refuses with the same answer; 6 placed is `limit`; a collapsed co-op astronaut is `collapsed`, a dead one `notActive`; the kit stays in the pack each time.
- `a beacon needs open ground: no wall or boulder, no structure's footprint (a hab pod's floor and door too), not on or beside a landmark's prop` — `blocked` at (14,-3) a boulder, (199,10) a weather station's wall, (32,-55) a pod's floor, (32,-53) its door, (-81,104) the methane vent, (-80,105) beside it, (828,139) a lava tube's skylight, (828,140) and (828,138) beside it; nothing changes. Open: (32,-52), (200,12) the weather station's door, (-79,104), (826,137) the tube's floor.
- `a beacon refills your suit within 2 tiles, once a round for each crew member, sharing the round's refills with the hab pods` — beacon at (12,0), suit 40: `refill(..., 'B0', at(15, 0))` is `{ ok: true, suit: D.EXPEDITION.suit }` (3 tiles: 2 plus the slack); `refills` is `{ minh: ['B0'] }`; again is `refilled` and changes nothing; the pod `S0,-1` still refills (`['B0', 'S0,-1']`); `diego` has his own; the advance clears `refills` and the beacon refills again.
- `a beacon refill is refused from further than 3.5 tiles, at a beacon not placed and for an odd spelling, changing nothing` — 3.6 tiles `tooFar`; `B1` `noBeacon`; `B01`, `b0`, `B-1`, `B0:0`, `B` all `noStructure`; `null` `badPos`; 3.4 tiles is ok.
- `the route home links each beacon to the nearest of the HQ and the beacons placed before it, so a new beacon never moves the others` — none: `[]`. At (15,0), (27,0), (-14,0), then (27,12): B0>base, B1>B0, B2>base, B3>B1, with the exact `x0, y0, x1, y1`; the first three links don't change when B3 is added. At (14,0), (0,14), (14,14), (7,-12): `B0>base`, `B1>base`, `B2>B0`, `B3>base` (a tie goes to the HQ, then the oldest); nothing is stored.

`test/rooms.test.js` (2 new):
- `co-op: a beacon kit is taken out and put back through the server, in the base zone, and every tab sees where it is` — `takeKit` from 5 tiles is `notAtBase`; from (0,1) `{ ok: true, kits: 0 }` and the next room frame shows `kits` 0 and `carried.minh` `[kit item]`; a second take is `noKit`; `returnKit` gives `{ ok: true, kits: 1 }`.
- `co-op: a relay beacon is placed through the server where it last saw you, its fog reaches every tab, and a crewmate's suit is refilled by it` — from (11,0) `nearBase`; from (12,0) status 200, `beacon: 'B0'`, the frame shows the beacon, `fog` has the keys `0,-1` and `0,0`, and each tab gets exactly one `fog` frame equal to it; then `noKit`. The host at (14,1) with suit 30 refills with `{ beacon: 'B0' }`, and again is `refilled`.

`test/dangers.test.js` (1 new): `a relay beacon is no cover from a solar flare: it refills and reveals, nothing more (spec §13.12)` — with a beacon at (12,0): `Z.shelterAt` is `null`, `Z.coversIn(m, 9, -3, 15, 3)` is `[]`, and after `Z.flareStart` a crew member standing by it is in `Z.flareEnd(...).hit`.

`test/worldgen-poi.test.js` (1 changed): the line pinning `S.kinds.pod.refills` is removed (R1).

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/engine.test.js test/expedition.test.js test/rooms.test.js test/dangers.test.js test/worldgen-poi.test.js`
Expected: 15 of 221 fail, the new tests of `engine`, `expedition` and `rooms`.
- Six stop at a function that doesn't exist yet: `X.takeKit` (taking a kit; delivering keeps the kit), `E.kitItem` (placing; open ground), `X.beaconSpot` and `X.routeHome` ("is not a function").
- Nine fail an assertion: there is no `D.BUILDS.kit` (the kit's build, the 6-kit cap); `'__proto__'` reaches the plan; a carried kit isn't put back at the advance; the save repair leaves bad beacons; `X.refill` refuses a beacon's id (both refill tests); and the server doesn't know the three actions (both `co-op:` tests).
- The new `dangers` test passes already: with no beacons, nothing can be mistaken for cover, so it guards R1. The changed `worldgen-poi` test passes too.

- [ ] **Step 3: Build the relay beacon rules**

Apply the dry run's code: `git diff f82bfe9 cd4929a -- . ':(exclude)test' | git apply`.

What it must provide (the reviewers check each line against the code):
- `src/data.js`: the two constants above; `pod.refills` deleted, its comment now says a pod refills once a round for each crew member, as a beacon does.
- `src/engine.js`: `kitsMade(s)` = beacons placed + `x.kits` + carried kit items; kits in `drops` don't count. `own(o, k)` is `Object.prototype.hasOwnProperty.call`.
- `canBuild`: `unknown` unless `own(D.BUILDS, type)`; the cap for a kit is `D.EXPEDITION.beacon.max - kitsMade(s)`, for any other type `D.MODULES[type].max - s.modules[type].count`; the pending-spend sum also uses `own`; the `space` check runs only for `D.PLACED` types. (The shield is not in `D.PLACED`, so it is exempt as before.)
- `simulate`: a kit project has `x` and `y` null; finishing one does `x.kits += 1`, pushes nothing to `layout`, and still adds to `totals.built`; the scrap loop reads `own(s.modules, type)`.
- `rollExpedition`: a carried kit is `x.kits += 1`, never `bankItem`; a collapsed co-op astronaut's load, kits too, goes to a drop.
- `repairExpedition`: keeps a beacon only if `x`, `y`, `round` are integers and `by` a string; `kits = max(0, floor(kits))`; each `refills[id]` is an array of strings (else `[]`); each carried item of kind `'kit'` becomes `kitItem()`.
- `src/expedition.js`: `BID = /^B(\d{1,2})$/` through `idNums`; `openGround`: a tile that is not `W.BLOCKING` and not `STRUCT_FLOOR`, and not on or within 1 tile (Chebyshev) of a lava tube's skylight or a methane vent; refill radius is `beacon.refill + reach` = 3.5 tiles from the beacon tile's middle.
- `src/dangers.js` and `lib/rooms.js`: as listed under Interfaces. `Z.shelterAt` and `Z.coversIn` are not touched.

Keep:
- Delivering does not shelve a kit (beacons decision). The surface auto-delivers every 1.5 s in the base zone, so a kit would bounce back the moment it was taken out. `returnKit` shelves on purpose and the advance shelves what is still carried. Task 5 makes the auto-deliver skip a pack of only kits.
- The 4 s hold stays `D.EXPEDITION.beacon.hold`, outside `X.holdSeconds`: no role changes it (§3.3). Task 3 routes it through `holdSeconds` for the surface.
- The kit is not in `BUILD_ORDER`: the grid tile menu is made from it and would offer a kit on a tile. It gets its own button (Tasks 4 and 5).
- `kits` has no top cap in the repair: Task 2's free kit can lawfully take the total past 6. `canBuild` then says `max`, and placing still stops at `limit`.
- `pod.refills` is deleted, not read (R1). `x.refills` already enforces once per pod or beacon, for each crew member, each round.
- Distances run from the HQ tile as Euclidean distance between tile middles. A beacon may stand on a find, a cave mouth or a tube floor. The base's own blockers all lie within 12 tiles, which `nearBase` covers.
- A finished kit counts in `totals.built` (toward "Master builder": 5 kits cost 250 kg). A malformed saved beacon is dropped, not mended, and the ids after it move up one. Kit items in `drops` are not mended.
- `placeBeacon` returns the id (`'B3'`), not the object, as `discover` returns `landmark: '<id>'`. The route home is straight links in placement order, not a spanning tree, so a new beacon never moves the old links.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/engine.test.js test/expedition.test.js test/rooms.test.js test/dangers.test.js test/worldgen-poi.test.js test/i18n.test.js`, then `npm test`
Expected: all pass; `npm test` 488/488.

- [ ] **Step 5: Commit**

```bash
git add src/data.js src/engine.js src/expedition.js src/dangers.js src/i18n.js lib/rooms.js test/engine.test.js test/expedition.test.js test/rooms.test.js test/dangers.test.js test/worldgen-poi.test.js
git commit -m "feat(expedition): a relay beacon kit is built, carried out, placed on open ground and refilled at, and the route home links the beacons" -m "Spec §3.8 and §13.12, rulings R1 and R2. A build or a scrap is looked up among a table's own keys, so a co-op plan naming '__proto__' can no longer reach Object.prototype." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Review notes:**
- **The security fix; keep the `own()` lookups.** In the dry run, `fb1815b` (the kit build) alone lets a co-op plan with `builds: [{ type: '__proto__' }]` pass `canBuild`, set materials to NaN and write `count` onto `Object.prototype`. `51c6940` fixes that, and an older hole that is on master today: `scrap: ['__proto__']` gave a free spare and polluted the prototype the same way. This range holds both, so the net diff is safe, but nobody may "simplify" the lookups back to `D.BUILDS[type]` or `s.modules[type]`. Check `canBuild`'s first line, its pending-spend sum, and the scrap loop. At the end of this task `lib/rooms.js` `cleanPatch` still lets such names into `room.plan` (it filters with `D.BUILDS[b.type]`); the engine ignores them now. Task 3 hardens `cleanPatch`, and both layers stay.
- **Decided, do not reopen:** R1, R2, and the Keep list above. §13.12 says beacons are no flare cover; the guard test in `test/dangers.test.js` pins it.
- **Look hardest at:**
  - `refill` has two branches: the hab pod's errors and its once-a-round rule must come out as before (the existing pod tests in `test/expedition.test.js` and `test/rooms.test.js` still pass unchanged).
  - `deliver`: `items` lists only what was banked.
  - The order of `beaconSpot`'s checks. The first failure answers, and `placeBeacon` returns that same answer.
  - The repair: a hand-edited save must never reach the rules with a bad `beacons`, `kits`, `refills` or kit item.
- **Carried to later tasks:** the surface's prompt must call `X.beaconSpot` locally, since the server drops `need` and `beacon` (Task 5); the surface's auto-deliver and its toast count (`r.items.length`, not the pack) (Task 5); `lib/history.js` still writes `explore.beacons: 0` (Task 4 fills it); the six `eva.err.*` strings are placeholders (Task 6).
- Files in this task that change again later: `src/engine.js` (Tasks 2, 3, 4, 7), `src/expedition.js` (3, 4: Task 4 adds a `stats.<id>.pods` count in `refill`'s pod branch), `src/data.js` (2, 3, 7), `lib/rooms.js` (2, 3), `src/i18n.js` (4, 5, 6).

---

### Task 2: Expedition goals: the rules

Each round now asks the crew outside for one goal (two from round 5): survey a far science site, haul four loads, enter a new kind of region, discover a landmark, repair or salvage a structure, place a beacon far out, or explore four new chunks. A goal is picked from the mission code, the round and the state, only among the kinds that can be done; it is judged from the mission state, never from what a client says, and paid at the advance. This task is the rules only: the pure module, the engine's payout and save repair, and the solo and co-op hooks (the HUD is Task 4, the surface Task 5, the words Task 6, the explorer bot Task 7). It carries out spec §3.9 and §13.12 (the last round's backpack) and rulings R3, R4 and R12, and it makes co-op fog stricter, because explored ground now scores.

**Dry-run code:** `m4d-dryrun` `cd4929a..96b101e` (the goals merge: nine branch commits, `0ee0ad3..ab1d1b7`, and the merge's two fixes). Full suite 488 → 507.

**Files:**
- Create: `src/goals.js` — the rules module `SolGoals` (UMD, pure, no `Math.random`, no clock): `pick`, `offered`, `make`, `update`, `advance`.
- Modify: `src/data.js` — `GOALS`, just before `DECOR`.
- Modify: `src/engine.js` — `newExpedition` (`goalsDone`); `repairExpedition` (goals and goalsDone); `applyExpedition` (the last round's backpack, `payGoals`, `goals` in its result); new private `payGoals`; `rollExpedition` (clears `x.goals`); the state comment.
- Modify: `src/fog.js` — `KEY` is strict.
- Modify: `lib/rooms.js` — `FOG_SEAT_BUDGET`; `room.fogUsed`; `reveal`; `stopFog`; `broadcast`; `launch`; `resolveRound`; the export.
- Modify: `src/ui.js` — the `G` alias; `startMission` picks; `advance` goes through `G.advance`.
- Modify: `index.html`, `sw.js` — load and cache `src/goals.js` right after `src/expedition.js`.
- Test: `test/goals.test.js` (new, 13 tests); `test/engine.test.js` (3 new, 1 changed); `test/fog.test.js` (1 new); `test/rooms.test.js` (1 new); `test/ui.test.js` (1 new, the harness changed); `test/sw.test.js` (1 changed).

**Interfaces:**
- Consumes: from master `E.resolveTurn(m, plan) → { state, report }`, `E.bankItem(bank, crewId, item, late)`, `E.upgradeMission`; `W.hash`, `W.seedOf`, `W.regionAt`, `W.REGIONS`, `W.CHUNK`, `W.landmarksNear`, `W.landmarkAt`, `W.structuresNear`, `W.structureAt`; `X.findsIn(m, cx, cy)`, `X.chunkAt(m, cx, cy)` (its `formations[].sites`), `X.findById(m, id)`; `F.KEY`, `F.mergeMap(map, diff, cap)`; in `lib/rooms.js` `shareFog`, `broadcast`, `FOG_CHUNKS_MAX` (4096) and `FOG_KEYS_PER_MESSAGE` (64); the lists a goal watches, `x.sites` (`{ siteId: loadsLeft }`), `x.regions`, `x.landmarks`, `x.structures`, `x.revealed`, and `x.banked.lines` with their `late` flag. From Task 1: `x.beacons` (`{ x, y, by, round }`, world tiles), `x.kits`, `D.EXPEDITION.beacon.max` (6), and the engine's `isKit`.
- Produces:
  - `D.GOALS` (`two` is the first round with two goals; `tiles` is `[a, b, max]`, so a survey or beacon goal asks `min(max, a + b × round)` tiles, 35 in round 1 and 120 from round 18; `reach` is how far from the HQ a goal must be doable):

    ```js
    GOALS: { two: 5, tiles: [30, 5, 120], reach: 150, kinds: {
      survey: { science: [20, 40] }, haul: { loads: 4, bonus: 0.25 },
      region: { reward: { morale: 2, science: 15 } }, landmark: { reward: { science: 25 } },
      structure: { reward: { materials: 40 } }, beacon: { reward: { kits: 1 } },
      chunks: { count: 4, reward: { science: 15 } } } }
    ```
  - State (`m.expedition`): `goals: [goal]`, this round's goals, set as the round starts and emptied by the advance. A goal is `{ id: 'G<turn>:<n>', kind, params, need, base, progress, done, reward }`: `turn` is the 0-based `m.turn`; `params` is `{ tiles }` (survey, beacon), `{ loads: 4 }` (haul), `{ count: 4 }` (chunks) or `{}`; `need = params.loads || params.count || 1`; `base` is the length of the list the kind watches, taken at the pick; `progress` runs 0..`need`; `reward` holds some of `science, morale, water, materials, kits`. This is a superset of spec §4's `{ id, kind, params, progress, done }`. `goalsDone: [{ id, kind, round, params }]` is every goal paid this mission, in payout order, `round` the 0-based turn; `newExpedition` starts it `[]`.
  - `report.expedition` is now `{ got, lines, incidents, goals }`, where `goals` is `[{ id, kind, params, reward }]`, the goals paid at this advance. A goal's reward is in `got` and has no line in `lines`.
  - `G` is `src/goals.js` (browser global `SolGoals`; it requires data, worldgen, engine, fog and expedition, so it loads after `src/expedition.js`):
    - `pick(m) → m.expedition.goals`, filled in place. It picks only when `m.status === 'active'` and the round has no goals yet: 1 goal while `m.turn + 1 < D.GOALS.two`, else 2 of different kinds. Anything else returns `x.goals` as it is, or `[]` when there is no `m.expedition`.
    - `offered(m) → [kind]` in `D.GOALS.kinds` order: the kinds that can be done this round.
    - `make(m, kind) → goal` with `id: ''` (`pick` gives the id). An unknown kind throws a `TypeError`; it is only called inside the module and from tests.
    - `update(m) → m.expedition.goals`, with `progress`, `done` and a haul's `reward` brought up to date in place.
    - `advance(m, plan) → E.resolveTurn's { state, report }`: `update(m)`, then `E.resolveTurn`, then `pick(state)`. Its errors are `resolveTurn`'s. Solo and co-op both advance through it.
  - `F.KEY = /^(0|-?[1-9]\d{0,5}),(0|-?[1-9]\d{0,5})$/`: no `-0`, no leading zeros, at most 6 digits.
  - `lib/rooms.js`: the module exports `{ createRooms, MAX_PLAYERS, FOG_SEAT_BUDGET }` with `FOG_SEAT_BUDGET = 800`; a room gains `fogUsed: { crewId: n }`. `reveal(room, player, map)` still returns `null | 'noCrew' | 'badPhase' | 'badFog'`.

- [ ] **Step 1: Write the failing tests**

Apply the dry run's tests from the repo root: `git diff cd4929a 96b101e -- test | git apply`. If an earlier task changed after its review and this doesn't apply, use `git apply --3way` and resolve.

`test/goals.test.js` (13 new). Helpers: `fresh(seed, round)` is a commander mission in that round with no goals; `withGoal(m, kind)` adds `G.make(m, kind)` as goal `G<turn>:0`; the test reads the world itself (`scienceNear`, `repairsNear`, `landmarksNear`) to know what lies within 150 tiles.
- `one goal a round in rounds 1-4 and two from round 5, the same ones for the same mission code, round and state` — rounds 1-20 of `GOAL-1`: 1 goal below round 5, else 2 of different kinds; ids `G<round-1>:<n>`; the same again for the same mission. Over 30 seeds and 20 rounds every kind but `beacon` comes up. A second `pick` returns the same array. A mission with `status: 'success'` picks `[]`.
- `a goal is made with its target, its reward and the baseline it is judged against` — round 3 (45 tiles) with `dunes` visited: survey `{ id: '', kind: 'survey', params: { tiles: 45 }, need: 1, base: 0, progress: 0, done: false, reward: { science: 22 } }`; haul `params { loads: 4 }`, `need` 4, `reward { water: 0, materials: 0 }`; region `base` 1, `{ morale: 2, science: 15 }`; landmark `{ science: 25 }`; structure `{ materials: 40 }`; beacon `{ tiles }` and `{ kits: 1 }`; chunks `{ count: 4 }`, `need` 4, `{ science: 15 }`. Survey is 20 science in round 1 (35 tiles) and 40 in round 20 (120 tiles).
- `only kinds that can be done this round are offered` — `haul` and `chunks` always; `beacon` only with `x.kits` 1 and under 6 beacons; `region` until `x.regions` holds every `W.REGIONS` name; `survey` until every science site at least 35 tiles out within reach is touched (in round 20 the ones nearer than 120 don't count); `structure` until every wreck, array, weather station and mast within reach is used; `landmark` only on a seed with one within reach, and not once it is discovered.
- `a survey counts a science site surveyed far enough out since the pick, even after the save is reloaded` — round 3: a far site touched before the pick, an ice load and a site nearer than 45 tiles don't count; after a `JSON` round trip, a second far site gives `[1, true]`.
- `a haul counts the ice and metal brought home this round, and its bonus is a quarter of what its loads gave` — late lines and science don't count; 3 ice loads give progress 3; a wreck's metal makes 4; `reward` is `{ water: 30, materials: 10 }` (a quarter of 120 and 40); with 6 loads (160 water, 80 materials) `progress` stays 4 and `reward` is `round(160 × 0.25 × 4/6)` and `round(80 × 0.25 × 4/6)`. A load banked after the last `update` shows only at the next one.
- `a region counts once someone enters a kind of region the crew hadn't been in when it was picked` — the HQ's own region (`plains` on this seed) doesn't count; `icy` gives `[1, true]`.
- `a landmark, a repaired or salvaged structure, and a beacon far enough out each count once they happen` — a landmark discovered; a supply cache or hab pod used doesn't count, a wreck, array, weather station or mast does; the round-1 beacon goal asks 35 tiles: a beacon at (20, 0) doesn't count, one at (30, -20) does.
- `explored chunks count only new ones, spelled canonically` — `-0,5` and `05,5` never count; 3 new chunks give 3, a fourth gives `[4, true]`.
- `the base's own four chunks are not new ground, though its view shows them only once round 1 has begun` — `D.EXPEDITION.baseZone + D.DANGERS.view.rover < W.CHUNK`; `0,0`, `-1,0`, `0,-1`, `-1,-1` give progress 0; four others give `[4, true]`.
- `the advance brings progress up to date, pays the done goals once and picks the next round's` — a landmark goal nobody has updated: `G.advance` reports `[{ id: 'G0:0', kind: 'landmark', params: {}, reward: { science: 25 } }]`, science +25, `goalsDone` `[{ id: 'G0:0', kind: 'landmark', round: 0, params: {} }]`, next goals `[['G1:0', 0, false]]`; a goal nobody worked on expires with no payout; a second advance pays nothing.
- `a solo advance and a co-op advance on the same state give the same goals and payouts` — one seed in a room and in solo: the same first goals; a chunks and a haul goal, four new chunks (through `reveal` in the room) and two ice loads: the same `report.expedition`, the same next goals, `goalsDone` and science. Only `chunks` is paid.
- `co-op: every room frame carries the goals' progress as the server judges it, and new fog that moves an open 'explore' goal sends one` — (the kind is `chunks`; the title keeps its old word) a chunks and a region goal: one chunk of fog sends a frame with `[['chunks', 1, false], ['region', 0, false]]`; the `region` action gives `['region', 1, true]` in the frame it triggers; three more chunks give `['chunks', 4, true]`; once done, further fog sends no room frame.
- `a save from before M4d has no goals; it plays on and gets its goals at the next advance` — no `goalsDone` loads as `goals: []` and `[]` from `G.update`; `G.advance` reports no goals and picks one for round 2.

`test/engine.test.js` (3 new, 1 changed):
- `a new mission has an empty exploring state and, in solo play, the player's astronaut` (changed) — the key list gains `goalsDone`.
- `the last round's backpack is banked at the final advance, so it counts for the score and the report (M4d)` — on the last turn a pack of ice, a 35-science survey and a kit: the forecast already shows 2 lines; after the advance water +40, science +35, the score's science part +35, the lines are the two `late: true` ones (ice `region 4`, amount 40; science `region 0`, amount 35), `carried` is `{}`, `kits` is 1 (the merge's fix), `banked.water` is 0. One round earlier the pack still waits (no lines). In co-op, diego collapsed at (900, -640) banks nothing and his ice stays a drop with id `19:diego`; minh's metal is banked.
- `done goals pay out once at the advance, the report lists them, the mission keeps a record, and the rest expire` — landmark, region and beacon goals done, structure not: science +40, morale +2, materials +0, `kits` 1; `report.expedition.goals` lists the three paid, `got.science` 40, `lines` `[]`; `goals` `[]` and `goalsDone` holds the three with `round: 0`; a second advance pays nothing and keeps the record; the forecast shows the science first. A reward of `'25'`, `-5` or `NaN` pays nothing.
- `a saved goal or goal record with the wrong shape is dropped, and a save from before M4d gets an empty record` — of 8 saved goals (null, a string, one with no `params`, an unknown kind, `done: 'yes'`, `progress: 'x'`, `reward: null`, one good) only the good one stays; of 4 saved records only the whole one; `goalsDone: 'lots'` and a missing one become `[]`.

`test/fog.test.js` (1 new): `a chunk has one fog key, spelled the way String() writes its numbers, so it takes one slot and counts once (M4d)` — accepts `0,0`, `-1,0`, `0,-1`, `7,-12`, `999999,-999999`; refuses `-0,0`, `0,-0`, `00,0`, `01,2`, `1,007`, `+1,0`, ` 1,0`, `1, 0`, `1234567,0`, `1,2,3`; `mergeMap` of `0,0`, `-0,0`, `00,0`, `0,-0` leaves one key.

`test/rooms.test.js` (1 new): `each seat adds at most its budget of new fog chunks a mission, so one seat cannot fill the shared cap (M4d)` — 5 × `FOG_SEAT_BUDGET` fits under 4096; the guest stops at 800 chunks; a chunk already in the map still merges, a new one is skipped; the host has its own budget; `-0,7` and `07,7` are skipped; after `restart` and `launch` the guest has a budget again.

`test/ui.test.js` (1 new; harness: `goals.js` joins `SOURCES` after `expedition.js`, `SolSurface` gets `isMounted: () => false`, `page()` returns `G`): `solo: a new mission starts with round 1's goal; the advance judges the goals from the mission, pays the done ones and picks the next round's` — one goal after the pilot is chosen, equal to `G.pick` on the same code; a discovered landmark nobody has judged is paid at `hooks.advance()` (+25 science, `report.expedition.goals`, `goalsDone`); round 2's goal is `G1:0`, and the save holds it.

`test/sw.test.js` (1 changed): `every script the page loads is in the offline cache` — `src/goals.js` loads after `src/expedition.js` and before `src/ui.js`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/goals.test.js test/engine.test.js test/fog.test.js test/rooms.test.js test/ui.test.js test/sw.test.js`
Expected: 9 failures among 145 tests.
- `test/goals.test.js` doesn't load (`Cannot find module '../src/goals.js'`), and neither does `test/ui.test.js`, which reads every script `index.html` loads (`ENOENT … src\goals.js`). None of their tests run.
- Seven fail an assertion: in `engine`, the new mission's key list (no `goalsDone`), the last round's backpack, the goals' payout and the goals' repair; in `fog`, the one canonical key (`-0,0` takes a slot of its own); in `rooms`, the per-seat fog budget; in `sw`, `src/goals.js` isn't loaded between `src/expedition.js` and `src/ui.js`, nor cached.

- [ ] **Step 3: Build the goals rules**

Apply the dry run's code: `git diff cd4929a 96b101e -- . ':(exclude)test' | git apply`.

What it must provide (the reviewers check each line against the code):
- `src/data.js`: `D.GOALS` as above, with its comment.
- `src/goals.js`: `make` gives a survey `science: 20 + round(20 × (tiles - 35) / 85)`, a haul `{ water: 0, materials: 0 }`, and the other kinds `D.GOALS.kinds[kind].reward`. `pick` takes kind `i` from the open list at index `W.hash(W.seedOf(m.seed), m.turn, i, 1500) % open.length` and removes it before the next. `offered` keeps a kind when it can be done:
  - `haul` and `chunks`: always;
  - `survey`: an untouched science site at least `tiles` out within 150 tiles (a find, a formation's survey, or a landmark's site);
  - `region`: a region kind other than the HQ's lies within 150 tiles (sampled every 8 tiles) and is not in `x.regions`;
  - `landmark`, `structure`: one lies within 150 tiles and is not in `x.landmarks` or `x.structures` (a structure is a wreck, array, weather station or mast);
  - `beacon`: `x.kits > 0` and fewer than `D.EXPEDITION.beacon.max` placed.
- The world part of `offered` is worked out once a world seed and kept for 64 worlds.
- `update` counts what lies past `base` in the watched list (each list only grows, in the order things happened, and JSON keeps that order, so a reload keeps the baseline); `progress = min(need, n)`, `done = n >= need`:
  - `survey`: `x.sites` keys that are science sites at least `params.tiles` from the HQ;
  - `haul`: the loads in this round's bank lines that are not `late` and have `res` water or materials (`base` is 0, since the bank holds only this round);
  - `region`: `x.regions` names that are `W.REGIONS` names, not the HQ's, not seen before `base`;
  - `landmark`: `x.landmarks` keys;
  - `structure`: `x.structures` keys whose structure is a wreck, array, weather station or mast;
  - `beacon`: `x.beacons` at least `params.tiles` from the HQ;
  - `chunks`: `x.revealed` keys that pass `F.KEY` and are not `0,0`, `-1,0`, `0,-1` or `-1,-1`.
  - A haul also sets `reward` to `{ water, materials }`, each `round(got × 0.25 × min(1, need / n))`, where `got` is this round's amount of that resource in lines that are not `late`.
- `src/engine.js`:
  - `payGoals(s)` pays each goal with `done === true`: every positive finite number of its reward among `water, materials, spares, food, o2, science, morale` goes into `x.banked` (so into `got`), `reward.kits` into `x.kits`; a copy goes to the returned list and `{ id, kind, round: s.turn, params }` to `x.goalsDone`. `applyExpedition` runs it before it reads the bank. `rollExpedition` then sets `x.goals = []`.
  - Final advance: when `s.turn === D.TURNS - 1`, `applyExpedition` first banks every backpack as `late: true` lines (a kit goes to `x.kits`) and empties it, except for a co-op astronaut still in `x.collapsed`, whose load `rollExpedition` leaves as a drop.
  - `repairExpedition` drops a goal unless it is `{ id: string, kind: a D.GOALS.kinds key, params: object, reward: object, done: boolean }` with `need`, `base` and `progress` finite. It drops a `goalsDone` record unless it is `{ id: string, kind: a known kind, round: finite, params: object }`. The generic field loop already gives a missing `goalsDone` its `[]`.
- `lib/rooms.js`: `reveal` takes only canonical keys, at most 64 a message; once a seat's `room.fogUsed[crewId]` reaches `FOG_SEAT_BUDGET` it skips keys the map does not hold yet, while chunks already in the map always merge; it counts what the merge really added; and it calls `broadcast` when the map grew while a `chunks` goal is open and not done. `broadcast` runs `G.update(room.mission)` before every room frame. `stopFog` resets `fogUsed`, so a launch or restart gives every seat its budget again. `launch` runs `G.pick(room.mission)` after `createMission`; `resolveRound` runs `G.advance`.
- `src/ui.js`: `startMission` runs `G.pick(s)` before `store.mission = s`; `advance` runs `G.advance(store.mission, store.plan)`.
- `index.html` loads `src/goals.js` and `sw.js` caches it, both right after `src/expedition.js` (the offline-cache test enforces the order and the list).

Keep:
- The rules for each kind and every number in `D.GOALS` are the dry run's measured choices (the goals report's Decisions: haul 4 loads, chunks 4 new chunks, a beacon goal asks the survey's distance, a survey's science rises evenly from 20 to 40, equal odds among the offered kinds, one 150-tile reach for all). Change none; Task 7 measured the balance with them.
- `G.update` is the progress function, not spec §4's `goalProgress` (R12). The engine only reads the numbers `update` left, because the engine does not depend on worldgen (R4).
- A survey counts when it is collected, not delivered. A region goal counts any region kind not visited at the pick except the HQ's, even one farther than 150 tiles. A supply cache opened or a hab pod entered never counts as a structure.
- A save from before M4d gets its goals at the next advance, not when it loads (`G.pick` is not called on load).
- The final advance banks the last backpack before the last round is simulated, so it also feeds that round's totals. A fog key that is not canonical is refused, not rewritten.
- The words "explore goal" in a test title and a `lib/rooms.js` comment mean the `chunks` kind, which had that name. The diff keeps them.
- `sw.js`'s cache name stays `sol500-v4` and `dist/` is not rebuilt: both are Task 9's release steps.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/goals.test.js test/engine.test.js test/fog.test.js test/rooms.test.js test/ui.test.js test/sw.test.js`, then `npm test`
Expected: all pass; `npm test` 507/507.

- [ ] **Step 5: Commit**

```bash
git add src/goals.js src/data.js src/engine.js src/fog.js src/ui.js lib/rooms.js index.html sw.js test/goals.test.js test/engine.test.js test/fog.test.js test/rooms.test.js test/ui.test.js test/sw.test.js
git commit -m "feat(expedition): each round has expedition goals, judged from the mission and paid at the advance, in solo and co-op alike" -m "Spec §3.9 and §13.12 (the last round's backpack is banked at the final advance), rulings R3 and R4. A fog chunk has one key and each co-op seat adds at most 800 new chunks, so explored ground can be counted." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Review notes:**
- **Decided, do not reopen:** R3 (progress comes from the mission, with a baseline taken at the pick), R4 (picking lives outside the engine), R10 (a lying co-op client can still claim `chunks` and `region` goals: fog bits up to its seat's 800, and the `region` action is trusted; accepted, it costs score between friends, and it goes in the follow-ups), R12, and the Keep list.
- **Look hardest at:**
  - The merge's two fixes, which are not in the goals branch's own history: the final-advance loop sends a kit back to `x.kits` and never to `bankItem` (which drops it; the last-round test has a kit in the pack for this), and `goals.js` reads `D.EXPEDITION.beacon.max`, not a literal 6.
  - `reveal` is a trust boundary: canonical keys only, the 800-chunk budget counts only chunks the map does not hold, and the room frame goes out only while a `chunks` goal is open (otherwise every fog message would cost a frame).
  - The repair: a hand-edited `goals` or `goalsDone` must never reach `payGoals` or `G.update`. Each goal pays once: `payGoals` runs before the bank is read, `rollExpedition` clears the list. A saved goal's reward is trusted if it is a positive number: a solo save is the player's own, and in co-op only the server makes and judges goals.
  - Determinism: `pick` uses the mission code and `m.turn` only (salt 1500), so solo and co-op pick the same goals (the equivalence test).
- **Carried to later tasks:**
  - Task 4: the console's goal rows and the surface hook `goals()`. In solo they call `G.update(store.mission)` first; in co-op they read the room frame's goals and never run `G.update` on a client, since frames carry `revealed: {}`. The round report lists `report.expedition.goals`. `lib/history.js` must fill `explore.goals` from `x.goalsDone.length`.
  - Task 5: the surface's goals column reads Task 4's hook.
  - Task 7: `tools/balance.js` still advances with `E.resolveTurn` and never picks goals; it must call `G.pick` at the start and `G.advance` each round (R11), and the explorer bot must pursue them.
  - Task 9 and the follow-ups: the spec's `goalProgress` becomes `G.update` (R12); R10; the M3 fog items that now matter (`flushFog` drops fog sent into a half-open socket, which costs a co-op team chunks toward its goal; the surface's own `mergeFog` has no cap); the survey's 150-tile reach, which the playtest decides (R12).
- Files in this task that change again later: `src/engine.js` (Tasks 3, 4, 7), `src/data.js` (3, 7), `lib/rooms.js` (3), `src/ui.js` (4, 5), `test/engine.test.js` (the key-list test: 4 and 7; the last-round test's score line: 7, when the map's science counts a tenth), `test/ui.test.js` (4, 5, 7), `test/rooms.test.js` (3). `src/goals.js` and `src/fog.js` do not change again.

---

### Task 3: The team rules: role holds, the commander's aura, walked distance, pings; a co-op plan keeps only real names

Each role now holds E for the time spec §3.3 gives it, from the one function the surface and the explorer bot both ask (R6). The commander speeds up crew within 5 tiles of him while he is out, the server counts how far each astronaut walks from the positions it already relays (R5), and any seated astronaut can ping a spot to the whole room. The task also finishes the `__proto__` fix that Task 1 began: a co-op plan can no longer carry a build, a scrap or an Earth request named like a property every object has. It is rules and wire only (the surface is Task 5, the debrief and history Task 4), and it carries out spec §3.3, §3.5, §3.10 and §13.12 and rulings R5, R6, R13, R14 and R17.

**Dry-run code:** `m4d-dryrun` `96b101e..1766f20` (the team merge `5f29250`, which brings eleven branch commits `7426392..a9a6f30`, and the controller's fix `1766f20`). Full suite 507 → 536.

**Files:**
- Modify: `src/expedition.js` — `holdSeconds` (one new rule); new `commanderOut`, `speedFactor`, `addDistance` and the private `spotIn`; the header comment and the export list.
- Modify: `src/data.js` — `SKILLS.commander`; new `TEAM`; the comment above `SKILLS`.
- Modify: `src/engine.js` — new private `repairStats`, called from `repairExpedition`; `resolveTurn`'s request check reads `own(D.DEPOT.amounts, plan.request)`; the state comment.
- Modify: `lib/rooms.js` — `position` counts distance; new `ping`, exported on the returned object; `cleanPatch` with a new private `own`.
- Modify: `lib/ws.js` — an incoming `ping` frame goes to `rooms.ping`; the header comment.
- Modify: `src/net.js` — `sendPing`; `connect` takes a sixth handler, `onPing`; the `ping` frame is dispatched to it.
- Test: `test/expedition.test.js` — 16 new; `test/rooms.test.js` — 10 new; `test/net.test.js` — 2 new, the fake socket changed; `test/ws.test.js` — 1 new; `test/engine.test.js` — 1 changed.

**Interfaces:**
- Consumes: in `src/expedition.js` the private `able(m, crewId)` (`{ error }` with `badPhase` | `noCrew` | `notActive` | `collapsed` | `benched`, else `{ crew }`), `okPos(p)` (a finite `{ x, y }`), `inBaseZone(pos, slack)`, `nearPx(pos, x, y, tiles)`, `statsOf(x, crewId)`, the tile size 64 px and `D.EXPEDITION.hold` (`load` 3, `survey` 5, `pickup` 3, `revive` 4 s); `D.STRUCTURES.kinds[kind].hold` and `.engineer`; `D.EXPEDITION.beacon.hold` (4, from Task 1); in `lib/rooms.js` `room.positions[crewId]` (it keeps `rover`), `fanout`, and the player objects; in `lib/ws.js` the incoming-frame dispatch; in `src/net.js` the open socket and `handlers`.
- Produces:
  - `D.SKILLS.commander = { auraRange: 5, auraSpeed: 1.1 }` (tiles; factor). `D.TEAM = { walk: { jump: 10, speed: 7 }, ping: { life: 10, gap: 1, range: 10000 } }`: `walk.jump` tiles is the largest step that is a walk, `walk.speed` tiles a second the fastest anyone goes (the rover with the aura is 6.7), `ping.life` seconds a ping stays on a map (the surface fades it; the server never expires anything), `ping.gap` seconds between one seat's pings, `ping.range` tiles from the HQ.
  - `X.holdSeconds(kind, role) → number` (seconds of holding E). Rules in this order: (1) a structure kind with a `hold` in `D.STRUCTURES.kinds` gives the Engineer's seconds if `role === 'engineer'` and the structure has them, else `hold`; (2) new: any other kind with a block of its own in `D.EXPEDITION` that has `hold > 0` (the relay beacon, 4) gives that for every role; (3) else the base time times `D.SKILLS[role][kind] || 1`, the base being `hold.survey` for `'science'`, `hold.pickup` for `'pickup'`, `hold.revive` for `'revive'` and `hold.load` otherwise. It never throws: an unknown kind or role is a plain load.
  - `X.commanderOut(m, positions) → { id, x, y } | null`: the crew member with `role: 'commander'` when he is `status: 'active'`, not in `x.collapsed`, not in `x.benched` and his spot is outside the base zone (`!inBaseZone(spot, 0)`: past tiles -2..2). Else `null`, also for junk input.
  - `X.speedFactor(m, crewId, positions) → 1.1 | 1`: `auraSpeed` when `commanderOut` is not null and `crewId`'s own spot is within `auraRange` tiles of him (5 tiles itself counts; he counts too), else 1. `positions` is the server's map `{ crewId: { x, y, ... } }` or the network's list `[{ crewId, x, y, ... }]`, world pixels, and must hold `crewId`'s own spot.
  - `X.addDistance(m, crewId, from, to, dt) → number`: the tiles added (>= 0), also added to `x.stats[crewId].distance`. `from` and `to` are samples `{ x, y, rover? }` in world pixels and `dt` the seconds between them on the caller's clock. It returns 0 and changes nothing when `able` refuses (the mission is not active, or the crew member is unknown, down, collapsed or benched), when a sample is not a finite position, when either sample has `rover` set, when the step is over `D.TEAM.walk.jump` tiles, or when it is 0 or `dt <= 0`. Otherwise tiles = distance / 64, capped at `walk.speed × dt` when `dt` is a finite number (any other `dt` leaves only the jump rule). It never throws and never returns `{ error }`.
  - State: `x.stats[crewId].distance`, tiles walked, a float (not rounded), >= 0, absent until the first counted step. Pings are not in the mission.
  - `lib/rooms.js`: `position(room, player, body) → null | 'noCrew'` (unchanged) now also calls `X.addDistance(m, id, <the record room.positions[id] held>, { x, y, rover: !!body.rover }, (Date.now() - player.posAt) / 1000)` when the mission is active and the seat has an earlier position and a `posAt`. `ping(room, player, body) → null | 'noCrew' | 'badPhase' | 'badPing' | 'tooFast'`, checked in that order: no astronaut; the room is not in `ops` or has no mission; `body.x` and `body.y` are not two finite numbers within `ping.range × 64` pixels of the HQ on each axis (the edge is in); under `ping.gap` seconds since this seat's last accepted ping (a refused ping does not start the clock). On `null` every client of every player in the room, the sender's tabs too, gets `ping` with `{ x, y, by }`: whole pixels, `by` the seat's crew id, set by the server. Nothing is stored and `room.version` is not bumped. Two new fields on a player, `posAt` and `pingAt` (ms, server clock), are never serialized.
  - Wire: client to server `{ t: 'ping', d: { x, y } }`; server to client `{ t: 'ping', d: { x, y, by } }` (R13: its own frame, not spec §5's `event`). `lib/ws.js` ignores the result of `rooms.ping`, as for `pos` and `reveal`.
  - `src/net.js`: `sendPing(x, y) → boolean` (false when the socket is not open); `connect(onRoom, onStatus, onPos, onFog, onEvent, onPing)`, the sixth optional: `onPing({ x, y, by })` hears every ping frame with data, the sender's own included.
  - `cleanPatch` keeps a build, a scrap or a request only when its type is a string and an own key of `D.BUILDS`, `D.MODULES` or `D.DEPOT.amounts`.

- [ ] **Step 1: Write the failing tests**

Apply the dry run's tests from the repo root: `git diff 96b101e 1766f20 -- test | git apply`. If an earlier task changed after its review and this doesn't apply, use `git apply --3way` and resolve.

`test/expedition.test.js` (16 new; helpers `five(size)` is an `EXP-1` mission with a crew of that size, `spots({ crewId: [tx, ty] })` builds a positions map, `walk(m, id, [tx, ty], [tx, ty], dt)` calls `addDistance`):
- `every role holds E for the time §3.3 gives it, for every kind of work` — seconds for commander / engineer / scientist / biologist / medic: ice 3/3/3/1.5/3; metal 3/1.5/3/3/3; pod 3/1.5/3/3/3; science 5/5/2.5/5/5; pickup 3 for all; revive 4/4/4/4/2; cache 3 for all; wreck, weather and mast 6/3/6/6/6; array 5 for all; beacon 4 for all.
- `a kind with a block of its own in D.EXPEDITION that has a hold takes it, whatever the role (the relay beacon is placed in 4 s)` — a temporary `D.EXPEDITION.lantern = { hold: 2.5 }` gives all five roles 2.5; without the block it is a plain load.
- `the table covers every role and every kind there is to hold E for, so a new one cannot slip past it` — the table's roles are `D.CREW`'s; its rows are exactly the `D.FINDS` kinds, `pickup`, `revive`, the kinds with a block and a hold, and the structure kinds with a hold.
- `the commander's aura: crew within 5 tiles of him move 10 % faster while he is out on the map` — kai (commander) at tile (30, 0): minh at (33, 4) and amara at (30, -5) are exactly 5 tiles away, factor 1.1; lena at (30, 6) and diego at (24, 3) are out of reach, 1; kai himself 1.1; 5.01 tiles is 1; asking changes nothing.
- `the aura is the commander's alone, and only while he is out: not at the base, not absent, not down, not collapsed` — with minh one tile east of him, a commander at tile (3, 0), one step past the base zone, gives 1.1; at (2, 0) or (0, 1) it is 1; no commander seat, a crew of four, no spot for the asker, a commander `down` or `dead`, collapsed, or benched: all 1.
- `the aura reads only what it can trust: junk positions, junk ids and no positions at all give 1` — `null`, `undefined`, 7, `'kai'`, `[]`, `{}` as positions; a commander or an asker whose spot has `NaN`, string or infinite coordinates, or is `null` or 4; ids `'nobody'`, `'__proto__'`, `'constructor'`, `''`, `null`, `undefined`; a `null` mission and one with no crew.
- `positions may be the list the network sends (records with a crewId) as well as the map the server keeps` — the list gives 1.1; a record with no `y` gives 1; `commanderOut` on the list is `{ id: 'kai', x, y }`; the same records keyed by crew id give 1.1; a list of junk gives 1.
- `commanderOut says who leads and where he stands, for the route line his pings draw too` — `{ id: 'kai', x, y }` at (30, 0); `null` at the base, with no spot, in a crew of four, for a `null` mission.
- `walking adds the tiles between two positions to the crew member's distance, and it keeps adding up` — (10, 0) to (13, 4) is 5, then 2 more is 7, then 1 (with `dt` 1) is 8, `stats.minh` is `{ finds: {}, distance: 8 }`; a collected ice find leaves it (`{ finds: { ice: 1 }, distance: 8 }`); lena has her own 2.
- `standing still adds nothing, and doesn't even start a stats entry` — 0, `stats` stays `{}`, the state is unchanged.
- `a jump is not a walk: a step of more than 10 tiles (a reload, a teleport, a solo collapse sending you home) adds nothing` — 10 tiles counts, (10, 1) is 0, 150 tiles is 0, a huge step is 0; the total is 10.
- `what a step adds is capped by how far anyone can go in the time it took: 7 tiles a second, the rover with the aura is 6.7` — 3 tiles in 0.1 s adds 0.7; `dt` 0 or -2 adds 0; `dt` 1 adds 3; `dt` `NaN`, `'1'` or none add 3 (only the jump rule).
- `a hostile stream of steps adds no more than real time allows, however many it sends` — 10,000 steps of 9.9 tiles, 1 ms apart, add at most 70 tiles and more than 69.
- `only an astronaut on foot who can act is walking: not in the rover, not collapsed, benched or dead, not once the mission is over` — a sample with `rover: true` at either end adds 0, two with `rover: false` add 2; collapsed, benched, `down`, `dead` and `status: 'lost'` add 0 and change nothing; an unknown crew member adds 0 and gets no `stats` entry.
- `a step that is not two positions adds nothing and changes nothing` — `null`, `undefined`, 4, `'x'`, `{}`, `{ x: NaN, y: 0 }`, `{ x: 0, y: Infinity }`, `{ x: '64', y: 0 }` at either end; a `null` mission.
- `a save with a bad distance loads with it dropped, the good stats stay, and walking goes on from there` — `upgradeMission` of stats with minh `{ finds: { ice: 2 }, distance: 12.5 }`, lena `'far'`, diego -3, amara `null`, kai the number 7, bao `Infinity`, mei `[4]` gives `{ minh: { finds: { ice: 2 }, distance: 12.5 }, lena: { finds: {} }, diego: {}, amara: {}, bao: {} }`; walking then makes minh 17.5 and restarts lena at 5; a save with no `stats` gets `{}`.

`test/rooms.test.js` (10 new; the distance tests and the two ping-limit tests mock `Date` and `setTimeout` with `t.mock.timers`, so the server's clock is theirs):
- `co-op: the server measures each astronaut's walking distance from the positions it relays, on its own clock` — the first position counts nothing; 1 s later 3 tiles, 1 s later 4 more: `distance` 7; the other crew have no `stats` entry.
- `co-op: walking at the usual pace, a position every 110 ms, is counted in full` — 100 steps of half a tile, 110 ms apart: 50 tiles.
- `co-op: a hostile client cannot inflate its distance: a jump counts for nothing, and a flood of steps adds no more than the time allows` — 100 jumps of 6e7 px a second apart and a position of `{ x: 'far', y: null }` add 0; then 5,000 steps of 9.9 tiles, 1 ms apart, add at most 35 and more than 30.
- `co-op: the rover, a collapse and a new round add no distance, and a new round starts from where it finds you` — samples in the rover and the step out of it add 0; 1 tile on foot adds 1; after `collapse` nothing; after the advance the first position (home) adds nothing, then 2 tiles make 3.
- `a ping is relayed to everyone in the room, the sender too, and kept nowhere` — `null`; both connections get one `ping` frame `{ x: 1000, y: -500, by: 'minh' }` and no room frame; the mission JSON and `room.version` are unchanged; `publicRoom` has no ping.
- `` a ping's sender is the seat it came from: the server sets `by`, whatever the client says, and nothing else rides along `` — `by`, `from`, `crewId` and a 5,000-character field are ignored; `7.6, -7.4` arrives as `8, -7`.
- `a ping must be two finite numbers within 10,000 tiles of the HQ (20 rounds of one-way rover trips are 8,000), in any direction; anything else is refused and sent nowhere` — `lim` is 640000 px and `D.TEAM.ping.range >= D.TURNS × D.EXPEDITION.roverRange`; `badPing` for `null`, `undefined`, 4, `'x'`, `[]`, `{}`, a missing or non-number coordinate, `NaN`, `Infinity` (also `1e999`), one past `lim` on either axis, 6.4e7, 1e300, booleans; `{ x: lim, y: -lim }` and, a second later, `{ x: -lim, y: 0 }` are accepted.
- `a seat gets one ping a second: a faster one is dropped without a word, and the next comes through once the second is up` — 999 ms later `tooFast`; the host's own ping is fine (the limit is the seat's); at 1000 ms fine; a refused ping does not push the next back; the frames' `x` are `[1, 3, 4, 7]` by minh, lena, minh, minh.
- `only a seated astronaut in a mission can ping` — in the lobby `badPhase`; with no astronaut `noCrew`; a seated host `null`; after `restart` `badPhase`.
- `a co-op plan can't queue, scrap or request a type named like a property every object has, nor a non-string one` — for `'__proto__'`, `'toString'`, `'constructor'`, `['solar']`, `{ toString: () => 'solar' }`: `room.plan.builds` and `scrap` stay `[]`, `request` stays `null`; `({}).count` stays undefined.

`test/net.test.js` (2 new; the fake `WebSocket` now records what it sends):
- `a ping the server relays reaches the game's ping handler and no other, and a game that asks for none just doesn't hear it` — a `ping` frame reaches only `onPing` (a frame with `d: null` is not a ping, a discover `event` still goes to `onEvent`, `onPos` hears nothing); a caller with five handlers hears no ping and nothing throws.
- `sendPing puts the spot on the socket for the server to check, and says so when the socket is not open` — `false` when not connected and while connecting; `true` when open, with `{ t: 'ping', d: { x: 640, y: -320.5 } }` sent.

`test/ws.test.js` (1 new): `a ping sent over the socket reaches every player as { x, y, by }, the sender named by the server, and one inside the second is dropped` — four junk frames (no `d`, `d: "x"`, `x: "a"`, `x: 1e999`) go nowhere; `{ x: 640, y: -320, by: 'lena' }` from minh reaches the host and minh as `{ x: 640, y: -320, by: 'minh' }`; a second one inside the second is dropped (the host's inbox holds one ping).

`test/engine.test.js` (1 changed): `a build or a scrap named like a property every object has ('__proto__', 'toString') is unknown: nothing starts or is scrapped, and nothing reaches Object.prototype` — the plan also sets `request: type`, and `report.requested` must be `null` (a `'toString'` request used to spend an Earth drop).

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/expedition.test.js test/rooms.test.js test/net.test.js test/ws.test.js test/engine.test.js`
Expected: 29 of 229 fail: 28 of the 29 new tests, and the changed engine test.
- Most stop at a function that doesn't exist yet: `X.speedFactor`, `X.commanderOut`, `X.addDistance`, `N.sendPing` and `R.ping` ("is not a function", or `undefined` reading `ping`).
- The rest fail an assertion: `X.holdSeconds` has no hold for a beacon or the commander (the two hold tests); the save repair keeps a bad distance; the server counts no walking from the positions it relays (the four `co-op:` walking tests); a ping with nothing in it reaches the game's handler; `'__proto__'` gets into a co-op plan and a `'toString'` request is spent (the changed engine test and the new rooms test); and the socket test times out waiting for a ping.
- The new test that passes already, `the table covers every role and every kind there is to hold E for, so a new one cannot slip past it`, guards the hold table.

- [ ] **Step 3: Build the team rules**

Apply the dry run's code: `git diff 96b101e 1766f20 -- . ':(exclude)test' | git apply`.

What it must provide (the reviewers check each line against the code):
- `src/expedition.js`: the three functions and `holdSeconds`'s new rule as under Interfaces; `spotIn(positions, id)` reads a map or a list and returns the spot only if `okPos`; `speedFactor` and `commanderOut` look only at positions and crew state, never at the rover or at sprinting. The header lists the three new functions.
- `src/data.js`: the constants above, each with a comment saying what it is for.
- `src/engine.js`: `repairStats(stats)` runs right after the field loop in `repairExpedition`. It deletes a `stats[crewId]` that is not a map and a `distance` that is not a finite number >= 0, and adds nothing. The request check is `plan.request && own(D.DEPOT.amounts, plan.request) && canRequest(state)`.
- `lib/rooms.js`: `position` sets `player.posAt = Date.now()` on every call, after counting. `ping` is exported with the others. `cleanPatch`: `own(o, k)` is `typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k)`; `builds` filter on `own(D.BUILDS, b.type)`, `scrap` on `own(D.MODULES, x)`, `request` on `own(D.DEPOT.amounts, out.request)`.
- `lib/ws.js`: `else if (msg.t === 'ping') rooms.ping(room, player, msg.d);`. `src/net.js` as under Interfaces.

Keep:
- No new hold function (R6): `X.holdSeconds` already was the one, and `src/surface-eva.js` and `tools/explorer.js` already call it. The work is the table test and the one rule for a kind with its own block, so the surface never reads `D.EXPEDITION.beacon.hold` itself (Task 5 asks `holdSeconds('beacon', role)`). The beacon's row in the table is `if (D.EXPEDITION.beacon) HOLDS.beacon = [4, 4, 4, 4, 4];`; with Task 1 in, it is always on.
- The commander counts inside his own aura: in solo only the pilot is ever outside, so the aura could never act otherwise, and in co-op the group he leads would outrun his reach in about 20 s. §13.12 says it counts "only while the commander is outside", and `commanderOut` says what outside is.
- A mission with a crew of four has no commander (`D.CREW_SIZES` is `[4, 5]`, kai is the fifth): the factor is 1 and `commanderOut` is `null`. The words must not promise a 4-crew team an aura.
- R17: `commanderOut` does not exclude a commander in the rover, so a driving commander still gives the aura to crew on foot within 5 tiles; the driver gets none, because the surface multiplies foot speed only (Task 5).
- Distance is in tiles everywhere, the history record included (R14); the game has no metre scale. It counts anywhere on foot, the base zone too. The jump limit (10 tiles) is above any real step at the co-op cadence (110 ms, at most 0.8 tiles) and above the 9 tiles a sprint with the aura covers in the 2 s solo report interval. The server times a step by its own arrival clock, never a client timestamp. Known limits: a burst after a network stall counts less than was walked (never more), and a client that shuffles back and forth can credit itself up to 7 tiles a second, since the server does not simulate terrain; nothing scores on distance, only the debrief and the history.
- Pings: its own frame with `by` (R13), one a second a seat (spec §5), any seated astronaut in a running mission, a collapsed one too; the sender hears its own (one drawing path in solo and co-op); whole pixels. `range` is 10,000 tiles because a parked rover driven on one way for 20 rounds reaches 8,000. `lib/ws.js` is outside the first brief's file list; without its one line the frame never reaches `rooms.ping`.
- Both layers of the `__proto__` fix stay: `cleanPatch` keeps junk out of `room.plan` (the share link is a trust boundary), and the engine still ignores it if it gets there (Task 1's `own()` lookups).

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/expedition.test.js test/rooms.test.js test/net.test.js test/ws.test.js test/engine.test.js`, then `npm test`
Expected: all pass; `npm test` 536/536.

- [ ] **Step 5: Commit**

```bash
git add src/expedition.js src/data.js src/engine.js src/net.js lib/rooms.js lib/ws.js test/expedition.test.js test/rooms.test.js test/net.test.js test/ws.test.js test/engine.test.js
git commit -m "feat(expedition): each role holds E for its own time, the commander's aura speeds nearby crew, walked distance is counted and pings are relayed" -m "Spec §3.3, §3.5, §3.10 and §13.12, rulings R5, R6, R13 and R14. A co-op plan keeps only builds, scraps and requests that are real names, so '__proto__' and 'toString' never reach room.plan or an Earth request." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Review notes:**
- **Decided, do not reopen:** R5, R6, R13 (pings are their own frame, so Task 9's spec pass amends the row in §5 that lists `ping (x, y, from)` under `event`), R14 (tiles, so Task 9 amends the history record's `distance: { crewId: m }` in spec §8.3), R17, and the Keep list.
- **Look hardest at:**
  - The trust boundaries. `rooms.ping`: the order of the checks, `NaN` and `Infinity` refused, the edge in, a refused ping not starting the clock. `position`: the server's clock, the jump rule and the speed cap (the hostile-stream tests). `cleanPatch`: the `typeof k === 'string'` is the point, since `hasOwnProperty.call(D.BUILDS, ['solar'])` is true.
  - `holdSeconds` is an if-chain: the old branches' output (every row except the beacon's) must still come out as before, and the table test asserts all of it.
  - The aura functions never throw on junk, and every junk case answers 1 or `null`.
  - The repair: a hand-edited `distance` is dropped and walking restarts from 0.
- **For the controller, not this task's work:** team's pre-existing find. A hand-edited save whose `stats.<id>.finds` is not a map (a string, say) survives `repairExpedition`, and then `X.collect` throws `TypeError: Cannot create property 'ice' on string`, because `statsOf` rebuilds `finds` only when it is falsy. The fix is one line in `repairStats` (delete `s.finds` when it is not a map; `statsOf` then rebuilds it), with a test. It is in no dry-run range, so it goes into **Task 8**; do not add it here. This task's `repairStats` checks only the shape of `stats[crewId]` and of `distance`.
- **Carried to later tasks:**
  - Task 4: `lib/history.js` still writes `distance: {}` and `finds: {}`; fill `distance` from `stats[id].distance`, rounded, in tiles (R14). The debrief's walked column reads the same number.
  - Task 5: the surface feeds solo distance through `X.addDistance` from the frame loop at about the co-op cadence (110-250 ms) with the surface clock's `dt`, not from the 2 s `suit` hook (two samples 2 s apart give the chord, not the path, and a sprint with the aura covers 9 tiles in 2 s, close to the jump limit). It must drop positions of seats whose player is not `connected` before calling `speedFactor` or `commanderOut`: a disconnected seat's last position stays in `room.positions` until the round advances, so a ghost commander would keep granting the aura. A live distance readout would have to count locally, since room frames come only with actions. It draws a ping from `{ x, y, by }` with its own arrival time, drops it after `D.TEAM.ping.life`, and passes `onPing` to the `N.connect` calls; solo pings never touch the network.
  - Task 7: `tools/explorer.js` is unchanged and its `FOOT` speed has no aura; modelling a commander explorer 10 % faster would move every balance run, so it is the balance task's call.
- Files in this task that change again later: `src/expedition.js` (Task 4 adds a `stats.<id>.pods` count in `refill`'s pod branch), `src/engine.js` (Task 4 widens `repairStats` to `flareHit`, `flareCover` and `pods`; Task 7), `src/data.js` (Task 7), `test/engine.test.js` (4, 7). `lib/rooms.js`, `lib/ws.js` and `src/net.js` do not change again.

---

### Task 4: The console, the round report and the debrief

The console now shows what the rules of Tasks 1-3 do. It lists this round's goals with their progress and reward, builds a relay beacon kit from a button of its own, and the round report names the goals that paid out and the kits waiting at the base. The debrief gets an Expedition section, and the ISRU lesson when the mission explored. The Notes dialog lists every fact and story log the mission found, and a card that arrives while another is being read waits its turn. This carries out spec §3.9, §3.10 and §13.12, and rulings R3, R8, R14, R15 and R16.

**Dry-run code:** `m4d-dryrun` `1766f20..62eca6a` (10 commits). Full suite 536 → 572.

**Files** (line numbers are at `c8ff6bd`. Task 5 adds the `walk` and `ping` hooks and `onPing` to `src/ui.js`, so from `goalsOf` down the lines sit 10 to 19 lower in this task's tree):
- Modify: `lib/history.js` — `summarize` fills `finds`, `distance` and `explore` (empty stubs until now) through a new private `exploreOf(mission)`.
- Modify: `src/engine.js` — `newExpedition` (`bestFind: null`), `repairStats` (`:267`), `repairExpedition` (`bestFind`, `:310`), `bankItem` (`:318`, keeps `bank.best`), `applyExpedition` (`:1017`, folds `bestFind` and counts flares), and the state notes above them (`:236`).
- Modify: `src/expedition.js` — `refill` (`:516`) counts a hab-pod visit; its header comment.
- Modify: `src/ui.js` — the card hold: `reading`, `openCard`, `nextCard`, `closeCard`, `arrive`, `showCard`, `showRegionCard`, `reopenRegionCard` (`:634-715`); `foundCards`, `foundNote` (`:764`, `:788`); the `goals` hook (`:862`); `goalsOf`, `goalText`, `goalFrac`, `rewardText`, `goalReward`, `goalRow` (`:911-945`) and the goals list at the top of `expeditionPanel`; `kitButton`, `kitStatus`, `buildPanel` (`:1291-1306`); `exploreOf`, `expeditionSection`, `ISRU_SOURCES`, `lessonsFor` (`:1566-1634`) and one line in `viewDebrief`; the `notes` branch of `renderModal` (`:1955`); `reportModal` (`:2025`); `cardText` (`:725`).
- Modify: `src/i18n.js` — 38 new keys in each language, in blocks under `// M4d hud` comments, and four new `I.SOURCES` entries.
- Modify: `src/style.css` — three blocks under `/* M4d hud */`: the goals list, the Notes' found list, the debrief's Expedition section.
- Test: `test/ui.test.js` — 27 new tests; its fake DOM and `page()` grow. `test/engine.test.js` — 5 new, 1 changed. `test/history.test.js` — 2 new. `test/expedition.test.js` — 1 new. `test/i18n.test.js` — 1 new.

**Interfaces:**
- Consumes:
  - From Task 1: `E.canBuild(s, 'kit', pending)` → `{ ok: true }` or `{ ok: false, reason: 'unknown' | 'max' | 'materials' }`; `E.isKit(item)` and `E.kitItem()` → `{ kind: 'kit', res: 'kit', amount: 1 }`; `D.BUILDS.kit` = `{ materials: 50, work: 1.5 }`; `D.EXPEDITION.beacon` = `{ hold: 4, base: 12, apart: 10, max: 6, refill: 2, reveal: 12 }`; `x.beacons` (`[{ x, y, by, round }]`), `x.kits`, `x.carried`; a finished kit is `'kit'` in `report.completed`; `X.refill(m, crewId, id, pos)` takes a beacon id `"B<i>"` or a hab-pod id `"S<i>,<j>"`, and both share `x.refills`.
  - From Task 2: `G.update(m)` (brings `x.goals` up to date in place), and `G.make(m, kind)` and `G.advance(m, plan)` (the tests); `x.goals` = `[{ id, kind, params, need, base, progress, done, reward }]`; `x.goalsDone` = `[{ id, kind, round, params }]`; `report.expedition.goals` = `[{ id, kind, params, reward }]` (no `need`: a count is in `params.loads` or `params.count`); the final advance's `late: true` bank lines; `D.GOALS.kinds.haul.bonus` = 0.25.
  - From Task 3: `stats[crewId].distance` (tiles, a float, absent until walked) and the private `repairStats` in `src/engine.js`, which this task extends. Co-op needs no server change: `cleanPatch` keeps `{ type: 'kit' }` because `kit` is an own key of `D.BUILDS`.
  - From master: `E.bankItem(bank, crewId, item, late)`, `W.landmarkAt`, `W.structureAt`, `W.REGIONS`, `X.chunkAt`, `I.has`, the console's helpers (`panel`, `bar`, `ico`, `nf`, `haulText`, `patchPlan`), and `A.module(type, size)`, which draws a scaffold for a type it has no art for. The kit has none until Task 5.
- Produces:
  - `surfaceHooks.goals()` → `Array<{ text: string, done: boolean, frac: number }>`, a new array each call. `[]` when there is no mission, it is not `active`, or `expedition.goals` is not an array; it never throws. `text` is `goal.<kind>` (params `{ tiles }`, `{ n }`) and, when `need > 1`, `goal.withProgress` = "<goal> (p/n)". `frac` is 1 when done, else `progress / need` clamped to 0..1 (0 when `need <= 0`). Solo runs `G.update(mission)` first. Co-op reads the room frame's goals and never runs `G.update` on a client (R3).
  - Mission state, all in `mission.expedition`:

    ```
    bestFind: null | { crewId: string, kind: string, res: 'science', amount: number > 0, region: integer }   // new key in newExpedition()
    banked.best (only once a science item is banked): { crewId, kind, res: 'science', amount, region }       // kept by E.bankItem, not repaired
    stats[crewId].flareHit, .flareCover, .pods: whole numbers, absent until first counted
    ```

  - `E.bankItem(bank, crewId, item, late)` and `X.refill(m, crewId, id, pos)` keep their signatures and returns. `repairStats` now deletes a `distance`, `flareHit`, `flareCover` or `pods` that is not finite or is below 0.
  - History record, `lib/history.js` `summarize(mission, { mode, players })` (signature unchanged): `finds { [crewId]: { [kind]: loads } }`, `distance { [crewId]: tiles }`, `explore { regions, landmarks, structures, beacons, goals }`.
  - `src/data.js`: no new constant. `SolUI` still exports only `{ store, render }`; every function named above is private to `src/ui.js`.
  - Strings (EN and VI): `mod.kit`, `bld.kit`, `bld.kitReal`, `bld.why.maxKit`, `bld.kitStatus`; `deb.expedition`, `deb.exp.walked|found|best|regions|landmarks|structures|beacons|goals|flares|flareHit|flareCover`; `lesson.isruMars.title|body`; `rep.goal`, `rep.kits`; `goal.title|survey|haul|region|landmark|structure|beacon|chunks|withProgress|progress|reward|rewardHaul|morale|kits|done`; `notes.found`, `notes.foundNone`. `I.SOURCES` gains `isru`, `moxieInstruments`, `lroIce`, `protonCeramics`, each `{ label, url }`.

- [ ] **Step 1: Write the failing tests**

Apply the dry run's tests from the repo root: `git diff 1766f20 62eca6a -- test | git apply`. If an earlier task changed after its review and this doesn't apply, use `git apply --3way` and resolve.

`test/engine.test.js` (5 new, 1 changed):
- Changed: `a new mission has an empty exploring state and, in solo play, the player's astronaut`: the key list gains `bestFind`, and `bestFind` is `null`.
- `the advance counts, for each astronaut who could have been out, the solar flares that caught them in the open and those they were safe from`: in a round with `schedule[turn].spe`, the astronaut with a `flare` incident gets `flareHit: 1` and no `flareCover`; another gets `flareCover: 1`; a dead one gets no entry; a new entry is `{ finds: {} }`; the counts add up over rounds (`[2, 1, 1]`); a round with no flare adds none.
- `a flare round with a flare that never hit anyone counts everyone safe; a round whose flare is not due counts nobody`: `flare = { warn: 30, end: 90, over: true, hit: [] }` gives all four `flareCover: 1`; `spe: false` with a flare incident leaves `stats` as `{}`.
- `the advance keeps the single best science find of the mission, the one worth the most score points`: banking a survey of 35, a landmark of 120 (minh), ice and a weather find of 20 gives `bestFind = { crewId: 'minh', kind: 'landmark', res: 'science', amount: 120, region: 1 }`; the next bank starts with `lines: []` and no `best`; a later 80 does not replace it, a 135 does; ice alone gives `null`.
- `a goal's science is a reward, not a find; a find carried over to the next round and the last round's backpack count when they are banked`: a done goal paying 500 science leaves `bestFind` `null`; a carried survey of 60 is banked one advance later; at `turn = D.TURNS - 1` the final advance banks a carried 80 first.
- `a saved best find, flare count or pod visit count with the wrong shape is dropped, so the debrief and the notes never meet one`: a good `bestFind` and `{ flareHit: 2, flareCover: 3, distance: 5, pods: 4 }` survive `E.upgradeMission`; eight bad `bestFind` shapes (`'x'`, `7`, `[]`, `{}`, a number `crewId`, a string, zero-or-negative `amount`, a fractional `region`) become `null`; a save with no key gets `null`; negative, NaN and string counts are deleted.

`test/expedition.test.js` (1 new):
- `a hab pod visit is kept for the whole mission in stats[id].pods, for the Science notes: one for each refill at a pod, none at a beacon or for a refused one (M4d hud)`: a beacon refill and a `tooFar` pod refill leave `stats.minh` undefined; a pod refill gives `pods: 1`, a second `refilled` error leaves it 1, diego gets his own 1; the advance keeps it and the next round counts again (2).

`test/history.test.js` (2 new):
- `a record carries what the crew found, how far each walked and what they explored, all read from the expedition state (M4d)`: `finds { lena: { ice: 3, science: 2 }, minh: { metal: 1 } }` (total 6), `distance { lena: 413 }` from 412.6 (minh has none), `explore { regions: 2, landmarks: 1, structures: 2, beacons: 1, goals: 2 }`.
- `a mission posted by a browser cannot put junk into the record: only its own crew, the game's kinds and whole positive numbers get in`: a stranger, `gold`, `-2`, `'many'`, `Infinity`, `NaN`, a non-map `finds` are dropped and `2.6` becomes 3; `1e12` is capped at 1e6; a map where a list belongs (and the reverse) counts 0; an `expedition` of `undefined`, `null`, `'x'`, `[]` or `5` gives `{}`, `{}` and five zeros.

`test/i18n.test.js` (1 new):
- `the ISRU lesson and its sources are in both languages; the sources are NASA pages with a label and a date or a name`: the title and body exist in both and the body holds 122, 16, 2021, 2023, 12 and 98; the six sources (`isru`, `moxie`, `moxieInstruments`, `iceMap`, `lroIce`, `protonCeramics`) have a label and a `nasa.gov`, `science.nasa.gov` or `jpl.nasa.gov` URL; `lroIce.label` says "chemistry only" and `protonCeramics.label` says "research-fellowship project".

`test/ui.test.js` (27 new). The fake DOM gains `createElementNS`, `createTHead`, `createTBody`, `insertRow` and `insertCell` (the debrief's charts draw), and `page()` also returns `win`. The card-hold tests bring a fake clock, `clockOf()`, through `page(null, clock.globals)`, because the default harness ignores timer delays.
- The lost card (4). A log (`S4,-1`) opens a card; a card that arrives before 8 s (7,999 ms) waits; at 8,000 ms it opens; a card after that opens at once; a card nobody replaces goes 15,000 ms later:
  - `a card that arrives while a log or fact opened less than 8 s ago is still up waits, and opens when the 8 s are over; after that the next one opens at once`
  - `held cards open in the order they came, each after the one before had its 8 s; a new region's card is held too, and a discovery heard twice while it waits is one card with its reward`: each held card is marked read when it came (`regionsSeen` = log, `icy`, formation), a region walked into is recorded at once, and the waiting discovery opens with `science: 120` from its second copy.
  - `closing the card up opens the one that waits at once; a card the player asks for again replaces the one up, and starts its own 8 s`: the × (`data-k="region-close"`) at 3 s opens the next; `reopenRegion('plains')` gives `{ id: 'plains', again: true }` at once; a discovery then waits 8 s behind it.
  - `a card is not replaced while the player is reading it, the mouse on it or the focus in it; and what waited for a mission that is over is dropped`: with the mouse on `.region-card` the card stays 30 s and the held one waits; 8 s after the mouse leaves the held one opens; a card held for a mission that is over is dropped (`store.mission` set to `null`, then 8 s: it does not open).
- Goals in the console (4):
  - `the surface's goals hook lists this round's goals as { text, done, frac }; solo play brings their progress up to date first`: a `chunks` goal reads `goal.withProgress` with p 0 of n 4 and `frac: 0`; a landmark found since the pick reads done, `frac: 1`; a lost mission gives `[]`.
  - `co-op: the goals come from the room's frame as the server judged them; a tab never runs the progress itself`: progress 3 of 4 gives `frac: 0.75`, and the number is left as sent.
  - `the Expedition panel lists this round's goals with their progress and reward, and ticks the done ones`: rows for `chunks` (reward 15 science), `landmark` (25) and `haul` (`goal.rewardHaul` with `pct: 25`); after a bank line of 4 loads (160 kg ice) the haul row is done and its reward is 40 kg water, the landmark row is done once a landmark is found, and `goal.done` shows.
  - `a goal is told in plain words for every kind, in both languages, with its numbers`: every key of `D.GOALS.kinds` has `goal.<kind>` in EN and VI; the VI `survey` and `beacon` keep `{tiles}`, `chunks` and `haul` keep `{n}`.
- The round report (3):
  - `the round report lists each goal that paid out with its reward, and says when beacon kits wait at the base`: `rep.goal` for a landmark goal (25 science) and for a beacon goal (`goal.beacon` with `tiles: 35`, reward `goal.kits` n 1), and `rep.kits` n 1.
  - `the round report names a beacon kit that was started and finished, and the kits waiting; a round with no kit and no goal has no such line`: `rep.started` and `rep.completed` list `mod.kit`, `rep.kits` n 1; the next round has no `rep.kits`.
  - `the last round's backpack is banked at the final advance, and the report lists it in the banked lines' words`: `rep.haulLate` for 40 kg ice; a kit carried home at the end is no news (no `rep.kits`).
- The kit button (4):
  - `the build panel has a button of its own for the relay beacon kit: its cost, what a beacon does, the Mars Relay Network line, and how many are placed, waiting and out`: `data-k="bld:kit"` shows `mod.kit` and `bld.cost` (50 kg, 1.5 work); `title` = `bld.kit` (params `D.EXPEDITION.beacon`) and `bld.kitReal` joined by a newline; the English `bld.kitReal` is exactly "Real Mars rovers send most of their data to Earth through orbiters overhead, called the Mars Relay Network; the ground beacons in this game are fictional."; the panel shows `bld.kitStatus` with placed 1, max 6, kits 2, out 1; a click queues `{ type: 'kit' }` with `buildType` still `null`, and the queue shows `Relay beacon kit −50 kg`.
  - `the kit button is off, with the reason and still the network line, when materials are short or all six beacons are accounted for`: disabled with `bld.why.materials`, then with `bld.why.maxKit` (`max: 6`), each followed by `bld.kitReal`.
  - `a kit under construction shows in the projects list by its name`
  - `the kit and its lines have strings in both languages, and the English one repeats the research agent's line exactly`: seven keys in both languages, `bld.kitStatus` holds `{placed}`, `{max}`, `{kits}`, `{out}` in that order, and the VI `bld.kitReal` differs from the EN.
- The Expedition section (5):
  - `a mission that never explored has no Expedition section in its debrief`: the HQ's own region alone is not exploring.
  - `the debrief's Expedition section shows distance and finds for each astronaut, the most valuable find, the counts and who a flare caught`: header `deb.crew`, `deb.exp.walked`, `deb.exp.found`; lena `413 tiles`, `5 (Ice ×3 · Science ×2)`; minh `88 tiles`, `1 (Metal ×1)`; crew with no walk or load have no row; the best find reads like a banked line (132 science, landmark, plains, lena); the five count chips (3, 1, 2, 2, 1); `deb.exp.flares` n 2, `flareHit` with `d: 15` and minh ×1, `flareCover` lena ×2 and minh ×1.
  - `the Expedition section leaves out what is empty: no table without a walk, no best find, no flare lines, no zero counts`: one landmark gives the title and one chip and nothing else.
  - `a debrief survives an expedition state a hand-edited save left odd: junk stats, finds and best find are skipped, not drawn`
  - `the Expedition section has its strings in both languages`
- The ISRU lesson (2):
  - `a mission that explored learns the ISRU lesson in its debrief: NASA's five sentences as researched, with the sources they rest on`: the body equals the five sentences joined by a space, 111 words; its links are the six URLs in the order `isru`, `moxie`, `moxieInstruments`, `iceMap`, `lroIce`, `protonCeramics`; a mission that never explored has no such card.
  - `a debrief that already has four lessons gives the ISRU one the last place`
- The Science note (5). The first four use seed `PAINT-QA-1`, which has deltas, a ventifact with a science site, a weather station, supply caches and hab pods near the HQ:
  - `the Science note lists every fact and story log the mission found with its source: regions, landmarks, formations surveyed, structures used, then the hab pods visited`: seven entries in that order, `site 4,4:0` (no formation) makes none; the region, landmark and formation entries link their real source; the three Kestrel logs link nothing and say they are fiction (`ks.label`); the landmark names its finder; Vietnamese works.
  - `a fact or log found twice is listed once: two deltas (the first finder named), two supply caches, a region entered twice`
  - `the Science note says when nothing has been found, is not there without a mission, and the notes after it end with the ISRU note and its sources`: `notes.foundNone`; with no mission only the standing notes; with one, the found note, the standing notes and last the ISRU note with its six links.
  - `a mission somebody edited by hand is skipped, not drawn: ids that are no region, landmark, formation or structure of this world, odd spellings, counts that are no numbers`: only the plains, the one real delta and the weather station remain; `stats`, `structures`, `landmarks`, `regions` and `sites` of the wrong type give nothing.
  - `the Science note of a mission the explorer bot really played lists the landmark, formations and structures it used and the hab pods it visited, from the shapes the rules write`: plays FARM-1 and FARM-3 for 20 rounds with `haulRound` from `tools/explorer.js` and compares the note with what the mission kept.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/engine.test.js test/expedition.test.js test/history.test.js test/i18n.test.js test/ui.test.js`
Expected: 34 of 225 fail.
- `engine` (6): the new mission's key list (no `bestFind`), the two flare counts (`stats[id].flareHit` is undefined), the best find, a goal's science that isn't a find, and the repair of the new records. `expedition` (1): the pod visit count (`stats[id].pods`). `history` (2): the record's finds, distance and exploring counts, and the junk check. `i18n` (1): the ISRU strings.
- `ui` (24): the card hold (4), the goals hook and panel (3; `pg.surface.hooks.goals is not a function`), the goal words (1), the round report (2), the kit button (3), the debrief's Expedition section (4), the ISRU lesson (2) and the Science notes (5).
- Three new tests pass already and guard what is there: `a kit under construction shows in the projects list by its name`, `a mission that never explored has no Expedition section in its debrief`, and `the last round's backpack is banked at the final advance, and the report lists it in the banked lines' words` (Task 2 banks it).

- [ ] **Step 3: Show the rules in the console, the report, the debrief and the Notes**

Apply the dry run's code: `git diff 1766f20 62eca6a -- . ':(exclude)test' | git apply`.

What it must provide (the reviewers check each line against the code):
- **The record the debrief needs** (`src/engine.js`).
  - `bankItem` also keeps `bank.best`, the one item with `res: 'science'` and the largest `amount` (strictly greater replaces).
  - `applyExpedition` folds it into `x.bestFind` when it is strictly greater than the current `bestFind.amount` (`region` falls back to 0 if not an integer). The final advance banks the last backpack first, so those loads count. A goal's reward bypasses `bankItem`, so it is never a find, and ice and metal are not science.
  - In a round whose `s.schedule[s.turn].spe` is true, every crew member with `status === 'active'` gets `flareHit` +1 if the round's incidents hold a `flare` for them, else `flareCover` +1. The entry is made as `{ finds: {} }` if missing.
  - `repairExpedition` sets `bestFind` to `null` unless it is a map with string `crewId` and `kind`, `res === 'science'`, a finite `amount` above 0 and an integer `region`. `repairStats` is as under Produces.
- **Hab-pod visits** (`src/expedition.js`). A successful `refill` at a pod (the non-beacon path) does `statsOf(x, crewId).pods += 1`. A beacon refill and a refused one add nothing, and the once-a-pod-a-round rule is the existing `refilled` error.
- **History** (`lib/history.js`). `exploreOf(mission)` trusts nothing, because a solo mission is posted by a browser. It reads only this mission's own crew (own-key lookups), only the kinds of `D.FINDS`, and whole numbers: a load count or a tile count is rounded and must be 1 or more (so under half a tile is left out), capped at 1e6. Each `explore` count is capped at 9999, and a list counts only if it is an array, a map only if it is an object. `regions` and `beacons` count array lengths, `landmarks` and `structures` count map keys (hab pods are not in `x.structures`), `goals` counts `x.goalsDone`.
- **Goals in the console** (`src/ui.js`).
  - `expeditionPanel` begins with a `goal.title` eyebrow and a `ul.replist.goals` of `goalRow`s, before the conditions. A row is `li.goal` (+ `.done`): icon `flag` (`ok` when done), the sentence, `goal.progress` "p / n" and a bar only when `need > 1`, a `.hint` with the reward, and a `.hint.ok` `goal.done` when done.
  - The reward is `goal.reward` with `rewardText`: science, materials, water, morale, kits in that order, zeros left out (`haul.science|materials|water`, `goal.morale`, `goal.kits`). A haul with nothing yet reads `goal.rewardHaul` with `pct: 25` (from `D.GOALS.kinds.haul.bonus`).
  - `goalText` also reads the report's copy of a goal (no `need`): `n` comes from `params.loads` or `params.count`.
- **The round report** (`reportModal`). After the haul lines, one `rep.goal` line per `r.expedition.goals` entry (icon `flag`, `goal`, `reward`). The reward is already in the totals, so the line only names it. After the incidents, `rep.kits` with `n: x.kits` only when `x.kits > 0` and either `r.completed` holds `'kit'` or a paid goal had `reward.kits > 0`. The last backpack's lines already render as `rep.haulLate`: no code, one test.
- **The kit button** (`kitButton(s, pending)`, appended to the palette grid; `kitStatus(x)` is a `p.hint` under it when `s.expedition`).
  - A `button.bld` with `data-k="bld:kit"`, art `A.module('kit', 36)`, `mod.kit` and `bld.cost` (`kg` 50, `w` 1.5). It is disabled unless `E.canBuild(s, 'kit', pending).ok`, and a click does `patchPlan({ builds: pending.concat([{ type: 'kit' }]) })`. It is not in `BUILD_ORDER`: it takes no tile.
  - `title` is two lines: `bld.kit` (params `D.EXPEDITION.beacon`) when it can be built, else the reason (`bld.why.maxKit` with `max` for `'max'`, `bld.why.<reason>` otherwise); then `bld.kitReal`, always (R8).
  - `kitStatus` is `bld.kitStatus` with `placed` = `x.beacons.length`, `max` = `D.EXPEDITION.beacon.max`, `kits` = `x.kits`, `out` = the kit items in `x.carried`.
- **The debrief** (`src/ui.js`).
  - `exploreOf(s)` is the UI's reader: it skips what is not a number, a map or a known kind of find. It returns `null | { crew: [{ id, walked, finds: [[kind, loads]], loads, hit, cover }], counts: { regions, landmarks, structures, beacons, goals }, best }`, and `null` when no astronaut walked 1+ tile or found a load, no region beyond the HQ's own was entered (`counts.regions > 1`), and there is no landmark, structure, beacon or goal.
  - `expeditionSection(s)` is a panel titled `deb.expedition` between the crew panel and `.deb-grid`. Its parts are each left out when empty: the table (rows only for crew with a walk or a load, columns `deb.crew`, `deb.exp.walked`, `deb.exp.found`, cells "413 tiles" and "5 (Ice ×3 · Science ×2)" or "–"); the best find (`deb.exp.best` + `haulText`); one chip per non-zero count (`deb.exp.regions`, `landmarks`, `structures`, `beacons`, `goals`); the flare lines. "Rounds with a solar flare" is the largest `hit + cover` over the crew; `flareHit` (with `d` = `D.DANGERS.flare.dose`) and `flareCover` list `Name ×n`.
- **The ISRU lesson.** `lessonsFor` keeps its lessons (at most four), then, when `exploreOf(s)` is not null, puts `['isruMars', ISRU_SOURCES]` last of four: it replaces the fourth when four are there, else it is appended. The body is `sources.md` §A word for word (five sentences, 111 words; the test pins them). The old `lesson.isru` ("Living off the land") is untouched.
- **The Science note.**
  - `foundCards(s)` reads the mission's own record, in this order: `x.regions` (a name in `W.REGIONS`; `again: true`), `x.landmarks` (id `L<i>,<j>`), `x.sites` keys that are a formation's survey (`F<cx>,<cy>:0`, only if the formation has sites), `x.structures` (id `S<i>,<j>`, only with a truthy value), then one `{ type: 'log', id: 'pod', kind: 'pod' }` if any `stats[*].pods > 0`.
  - Every id is checked against the world in its canonical spelling (one to seven digits; `l.id === id`, and so on), so a hand-edited save is skipped. A landmark's finder is named only if it is a crew member. Each fact or log is listed once: the key is type + kind (or id), and the first finder wins.
  - `foundNote(s)` draws each card through `cardText`, so notes and cards cannot differ: `article.note.found` with `h3` `notes.found` and `ul.found-list` of `li` (`.disc` for a landmark, `.log` for a Kestrel log), or `notes.foundNone`. In `renderModal`, only with a mission, it is the first note, and the ISRU note (the lesson's title, body and `ISRU_SOURCES`) is added after `I.NOTES[lang]`. `cardText` no longer needs a finder on a landmark card.
- **The card hold** (`src/ui.js`).
  - `CARD_HOLD = 8000` ms. `openCard(c)` shows the card, starts the 15 s close timer and starts the hold timer. `arrive(c)` opens the card at once when no hold runs, else queues `{ c, key: missionKey() }` in `held`. This covers every card (`showCard`'s and `showRegionCard`'s), a landmark's discovery included (R15). A card is marked read when it arrives, not when it opens.
  - `nextCard()` runs when the hold ends: if a card is waiting and `reading()` is true (the mouse over `.region-card` on a device with hover, or focus inside it), it waits another 8 s; else it drops cards of another mission and opens the first. `closeCard()` (the × and the 15 s timeout) closes the card and calls `nextCard()` at once. `reopenRegionCard` calls `openCard` itself, so it replaces what is up and starts its own 8 s.
  - A discovery heard twice while it waits is one card: `showCard` adds the second copy's `science` to the waiting one if it had none.

Keep:
- The tooltip for `bld.kitReal` (R8). Hud's D4: if wrong, put it in a visible hint line. A touch player never sees a `title`, which is a Task 8 call. Do not move it here.
- The hold covers every card (R15): "nothing is lost" is the aim, and a landmark's card is a NASA fact. Do not narrow `arrive` to logs and facts.
- Hab pods stay a visit count, `stats[id].pods` (R16). It tells "any pod was visited", which is all the note needs (every pod shows one log). No id list, and no "pods visited: n" in the debrief.
- `distance` is in whole tiles, in the record and on screen (R14); the spec's metres are amended in the header.
- `flareCover` means "not caught": an astronaut who stayed at the base all round is counted. The advance has no position to tell them apart.
- "Most valuable find" is the one science item worth the most points, by `amount`. The state keeps one record because neither the bank nor the log keeps per-item facts.
- Two `exploreOf`s on purpose, one in `lib/history.js` (a browser's posted mission) and one in `src/ui.js` (a saved mission on the page). Do not merge them.
- The Notes read the mission's record and not `store.regionsSeen`, so a card another card replaced is not lost and a co-op note is the team's.
- `G.update` runs on each solo render and hook call. That is the design (R3), at about 0.55 ms on a busy mission. Co-op never runs it on a client.
- Not in this task: a `lib/rooms.js` change, an admin-tab column (the tab has no place for distance or explore), and a repair of a `stats.<id>.finds` that is not a map (see Review notes).

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/engine.test.js test/expedition.test.js test/history.test.js test/i18n.test.js test/ui.test.js`, then `npm test`
Expected: all pass; `npm test` 572/572.

- [ ] **Step 5: Commit**

```bash
git add lib/history.js src/engine.js src/expedition.js src/ui.js src/i18n.js src/style.css test/engine.test.js test/expedition.test.js test/history.test.js test/i18n.test.js test/ui.test.js
git commit -m "feat(ui): the console shows goals and builds beacon kits, the report and debrief tell what the crew explored, and the Notes list what they found" -m "Tasks 1-3 made the rules; this shows them (spec §3.9, §3.10, §13.12). The mission keeps the records the debrief needs (best find, flare counts, pod visits), and a card no longer cuts short the one being read." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Review notes:**
- **Not to reopen:** R3 (co-op goals come from the server's frame), R7 (ISRU sentence 5 stays), R8, R14, R15 and R16 above. Hud's open questions Q1 and Q2 are these rulings.
- **Look hardest at:**
  1. `lib/history.js` `exploreOf`, a trust boundary. Try crew ids like `__proto__`, a non-map `finds`, `Infinity`, strings and negative numbers.
  2. The save repair. Each new field (`bestFind`, `flareHit`, `flareCover`, `pods`) has a repair and a test, and an old save with none must load.
  3. The card hold's timers: the 8 s start when a card opens, not when it arrives; the × and the 15 s timeout both open the next; a reading player blocks the swap; held cards carry a mission key.
  4. The if-chains: `lessonsFor` (the old lessons must come out as before, and an unexplored mission gets no ISRU card) and `reportModal` (a round with no kit and no goal has no new line).
  5. `foundCards`: canonical ids only; `__proto__:0` as a site id must not throw.
- **Later tasks touch this one's files:** Task 5 adds the `walk` and `ping` hooks, `onPing` and `onPos` to `src/ui.js`. Task 6 rewords strings (not the English `bld.kitReal` or `lesson.isruMars.body`), so tests here read keys, not copied text, except those two. Task 7 adds `science: 0` to `newExpedition`, so the key-list test in `test/engine.test.js` changes again; and it adds `x.regions.map(id => 'region.' + id)` first in the last `test/ui.test.js` test's `want`, because the bot now visits regions. That test plays missions with `haulRound` from `tools/explorer.js`, which Task 7 rewrites.
- **Seen in the dry run, not for this task:**
  - A hand-edited save whose `stats.<id>.finds` is not a map survives `repairStats`, and `X.collect` then throws. Hud left `finds` alone. The ledger gives the one-line fix to the plan.
  - The debrief's walked column prints "1 tiles" for one tile. `I.SOURCES` labels are English in both languages. These are follow-ups.
  - `x.regions` is written only by `src/ui.js` (`enterRegion`, solo) and `lib/rooms.js` (co-op), never by the rules, so a bot that walks into regions must record them itself.
  - The default `page()` harness ignores timer delays and its `clearTimeout` does nothing, so timer logic there fires all at once on `flush()`. Do not "simplify" the card tests onto it.
- **Not checkable here:** how it looks. Task 8's browser pass looks at `.found-list`, `.goal*`, `.exp*`, the kit button, whether the Notes dialog gets too long with many finds, whether 8 s feels right on the surface, and the Vietnamese line lengths.

---

### Task 5: The surface: beacon kits, beacons, the route home, pings, the aura, walked distance and goals in the HUD

The player can now play M4d on the map itself. They take a relay beacon kit at the base (a button, or K), carry it out and hold E for 4 s where the prompt says a beacon may go; the beacon flashes on the ground, shows on both maps with the dashed route home, and refills a low suit once a round. P, a tap on the minimap or a click on the map pings a spot for 10 s, the commander's pings draw a line from him, crew within 5 tiles of him walk 10 % faster, solo counts the tiles walked, and the round's goals are listed in the HUD column. This carries out spec §3.2, §3.3, §3.5, §3.8, §3.9, §3.10 and §13.12 on the surface, with rulings R1, R5, R17 and R19.

**Dry-run code:** `m4d-dryrun` `62eca6a..d9bbfa2`, the eva merge (10 commits on the eva branch, merged with no conflict). Full suite 572 → 598.

**Files** (line numbers are at `c8ff6bd`; Task 6 changes a few lines of `src/surface-eva.js`, `src/surface.js` and `src/i18n.js`, so they sit a line or two off in this task's tree):
- Modify: `src/surface-eva.js` — it now reads `SolEngine` (`E`). The kit in the pack and its two buttons (`takeKit`, `returnKit`, `:327`); the auto-deliver guard (`:477`); the refill at a beacon (`:461`); placing (`holdKind`, `hold0`, `holdable`, `beaconName`, `beaconFocus`, `:537`; the tail of `focusAt`; the beacon branches of `label` and `finish`); beacon sprites in `sprites` (`:654`); the team and pings (`team`, `addPing`, `livePings`, `pingMarks`, `speed`, `:105`; `drawOver`, `marks` and the new `lines`, `:675`); `renderGoals` (`:230`); the aura line; the API comment.
- Modify: `src/surface-paint.js` — `drawBeacon` (`:769`) and `drawPing` (`:795`), added to `P.sprites`.
- Modify: `src/surface-map.js` — `markers` (`:40`) draws lines, ping marks and beacon marks; the minimap's click (`:108`) and the new `openBtn` (`:114`); the full map's `pointerdown` and `pointerup` (`:213`).
- Modify: `src/surface.js` — `ping` and `team` (`:470`); `WALK_GAP` (`:35`) and `walkSample` (`:769`); the K and P keys (`:328`); `mapState` (`:569`, adds `lines`); the pilot's speed (`:636`); `interact` (`:884`); the HQ menu's kit button (`:1032`); `setRemote` keeps `away`; `SolSurface.ping`; `probe()`; the API comment.
- Modify: `src/ui.js` — the `walk` and `ping` hooks of `surfaceHooks` (`:888`); `onPos` marks `away` (`:1927`); the new `onPing` (`:1940`); the three `N.connect` calls (`:1906`, `:1914`, `:2156`).
- Modify: `src/art.js` — `ICONS.kit` (`:53`) and `MODULE_ART.kit` (`:140`).
- Modify: `src/i18n.js` — 18 new keys in each language, in blocks under `// M4d eva` comments; 4 reworded in each (`sf.hintKeys`, `sf.hintTouch`, `sf.minimap`, `sf.mapHint`).
- Modify: `src/style.css` — `.sf-kit` and `.sf-kitback` (with `.sf-can`), `.sf-goals`, `.sf-aura`, `.sf-mini-open`, and `.sf-mini`'s cursor.
- Test: `test/surface-eva.test.js` — 10 new, 1 changed. `test/surface.test.js` — 8 new. `test/surface-map.test.js` — 4 new. `test/surface-paint.test.js` — 1 new. `test/ui.test.js` — 3 new. The fake DOMs and helpers of the first three grow (see Step 1).

**Interfaces:**
- Consumes:
  - From Task 1: `X.beaconSpot(m, crewId, pos)` → `{ ok: true, x, y }` or `{ error }`, where `error` is the first failing check (`badPos`, `noKit`, `limit`, `nearBase`, `nearBeacon`, `blocked`, or an `able` error). `nearBase` and `nearBeacon` also carry `need` (the tiles still to go, a float), and `nearBeacon` a `beacon: 'B<i>'`. It changes nothing. The co-op server drops `need` and `beacon` from a refusal, so the surface calls it locally.
  - Also from Task 1: `X.routeHome(m)` → `[{ from, to, x0, y0, x1, y1 }]` in world tiles; `E.isKit(item)`; `E.canBuild(m, 'kit', pending)`; `D.BUILDS.kit` = `{ materials: 50, work: 1.5 }`; `D.EXPEDITION.beacon` = `{ hold: 4, base: 12, apart: 10, max: 6, refill: 2, reveal: 12 }`; the actions `takeKit`, `returnKit` and `placeBeacon` (no payload) and `refill` with `{ beacon: 'B<i>' }`, which ui.js's `exp` hook already runs (solo `Z.act`, co-op `N.act`); `x.beacons`, `x.kits` and `x.refills` (`{ crewId: ['B0', 'S0,-1'] }`, beacons and pods together).
  - From Task 3: `X.holdSeconds('beacon', role)` = 4 for every role; `X.commanderOut(m, positions)` → `{ id, x, y }` (world px) or `null`; `X.speedFactor(m, crewId, positions)` → `D.SKILLS.commander.auraSpeed` (1.1) or 1, `positions` being `[{ crewId, x, y }]`; `X.addDistance(m, crewId, from, to, dt)`; `D.TEAM` = `{ walk: { jump: 10, speed: 7 }, ping: { life: 10, gap: 1, range: 10000 } }`; `D.SKILLS.commander.auraRange` = 5; `N.sendPing(x, y)` → boolean; `N.connect(onRoom, onStatus, onPos, onFog, onEvent, onPing)`, whose `onPing({ x, y, by })` also hears the sender's own ping (the ping frame is R13's).
  - From Task 4: `surfaceHooks.goals()` → `[{ text, done, frac }]`. The HUD column reads it; without it there is no goals block.
  - From master: `X.inBaseZone`, `X.capacity`, `A.ROLE` (the role colours), `store.room.players[]` (`{ crewId, connected, ... }`), `lanOn()`, `bld.cost` and `bld.why.<reason>`.
- Produces:
  - `SolEva.create(env)`: `env.team()` (new, optional) → `[{ crewId, x, y }]` in world px, you included; absent → `[]`. `env.hooks().goals` (optional).
  - `eva.takeKit(player)` and `eva.returnKit(player)` → undefined. `eva.addPing({ x, y, by })` → undefined. `eva.speed(player)` → `1` or `1.1`. `eva.lines()` → `[{ x0, y0, x1, y1, color, width?, dash, alpha? }]` in world px. `eva.marks(world, px, py)` also returns beacon marks `{ x, y, color, beacon: true }` and ping marks `{ x, y, color, ping: true, label, alpha }`. `eva.focusAt` can return a new focus `{ kind: 'beacon', key: 'b:<tx>,<ty>:<error|ok>', spot, wx, wy, x, y }`, `spot` being `X.beaconSpot`'s answer.
  - `P.sprites.drawBeacon(ctx, x, y, time, spent)` (`(x, y)` is the foot) and `P.sprites.drawPing(ctx, x, y, color, name, fade, age)`, in world px.
  - `SolMap.create({ t, onOpen, onClose, onPing })`: `onPing(x, y)` is optional and gets world px. `map.openBtn` is a new element (`button.sf-mini-open`, text `⤢`, `aria-label` = `sf.openMap`). `drawMini`'s state gains `lines` (as above) and its marks gain `beacon: true` and `ping: true` with `label` and `alpha`.
  - `SolSurface.ping({ x, y, by })` (new). `SolSurface.setRemote` entries may carry `away`. The surface calls three optional hooks: `walk(from, to, dt)` (`{ x, y, rover }` in world px, `dt` in seconds of the surface's clock), `ping(x, y)` → true when the ping went to the server, and `queueBuild({ type: 'kit' })`. `probe()` gains `lines` and `team`.
  - `src/ui.js`, all private (`SolUI` still exports `{ store, render }`): `surfaceHooks.walk`, `surfaceHooks.ping`, `onPos` (adds `away`), `onPing`.
  - `A.icon('kit', n)` and `A.module('kit', n)`. Keys: K takes a kit, P pings where you stand.
  - No new mission-state field, so no save repair; no `src/data.js` constant; no new file. `index.html` and `sw.js` need nothing: `engine.js` already loads before `surface-eva.js`.
  - Strings (EN and VI), new: `eva.kit`, `eva.kitStays`, `eva.takeKit` `{n}`, `eva.returnKit`, `eva.tookKit` `{n}`, `eva.returnedKit`, `eva.beaconName` `{n}`, `eva.placeBeacon` `{s}`, `eva.beaconNearBase` `{n}`, `eva.beaconNearBeacon` `{name, n}`, `eva.beaconLimit` `{n}`, `eva.placed` `{name, n, r}`, `eva.refilledBeacon` `{name, s}`, `eva.aura` `{p}`, `eva.auraLead` `{p, n}`, `eva.goals`, `sf.openMap`, `sf.kitAdd`. Reworded: `sf.hintKeys`, `sf.hintTouch`, `sf.minimap`, `sf.mapHint`. The Vietnamese is a draft until Task 6.

- [ ] **Step 1: Write the failing tests**

Apply the dry run's tests from the repo root: `git diff 62eca6a d9bbfa2 -- test | git apply`. If an earlier task changed after its review and this doesn't apply, use `git apply --3way` and resolve.

`test/surface-eva.test.js` (10 new, 1 changed). The fake DOM's `textContent` now replaces the children, as the real DOM's does. `setup()` takes `o.paint` (replaces sprite painters, to see what is drawn), `o.goals` (the goals hook) and `o.team` (`env.team`), and its sandbox gains `SolEngine`. `noteOf` and the canister test find their node by class, because the HUD column grew by five nodes.
- Changed: `the canister button shows only when breathing one is worth it, and breathing sends your live suit level`: the button is found by class `sf-can`; the asserts are the same.
- `a beacon kit stays in the backpack at the base: a pack of kits only asks for no delivery; with a load, the note counts what was banked and says the kit stays`: a pack of one kit sends no `deliver` in 3 s. With a kit and a 40 kg metal load one `deliver` goes, `banked.materials` is 40, the note is `eva.delivered1` `{ n: 1 }` then `eva.kitStays` ("one load, not two"), and the kit is still in the pack.
- `the backpack shows a carried kit with its own icon and name`: in a pack of metal and a kit, slot 1 holds `A.icon('kit', 14)` (not the `info` fallback) titled `eva.kit`, and slot 0 the materials icon.
- `at the base with a kit waiting and room in the backpack, a button (or K) takes one; carrying one there, another puts it back`: no kit, both buttons hidden. With 2 kits the take button reads `eva.takeKit` `{ n: 2 }`. `takeKit` leaves 1 kit at the base and 1 in the pack, with the note `eva.tookKit` `{ n: 12 }`; the put-back button shows and the take button now says `{ n: 1 }`. At tile (9, 1), outside the base zone, both hide. `returnKit` makes 2 kits and an empty pack, note `eva.returnedKit`. With three kits in the pack the take button hides.
- `carrying a kit on the map, the prompt says why a beacon cannot go here (the tiles still to go), or to hold E for its 4 s; the note names it`: no kit, no beacon focus. With a kit 6 tiles out the focus is a beacon, its label `eva.beaconNearBase` `{ n: 6 }`, not holdable, and `start` is false; in the rover and inside the base zone there is no focus. At the first open spot 12 tiles out or more the label is `eva.placeBeacon` `{ s: '4' }` and the focus is holdable. After 4.2 s, `placeBeacon` was asked once with the rounded position, `beacons` is `[{ x, y, by: 'minh', round: 0 }]`, the pack is empty and the note is `eva.placed` `{ name: Beacon 1, n: 12, r: 2 }`. With a second kit 4 tiles from the first beacon the label is `eva.beaconNearBeacon` with that name and `n: 6`; with six placed it is `eva.beaconLimit` `{ n: 6 }`.
- `by a relay beacon a suit low enough is filled once a round; a nearly full one is not, so the refill waits for the way home; the beacon looks spent until the next round`: at 2 tiles, a full suit and a suit of 106 s ask for nothing; a suit of 60 s at 3 tiles asks for nothing; at 2 tiles it asks `refill` once with `{ beacon: 'B0' }`, the suit comes from the answer (150) and the note is `eva.refilledBeacon` `{ name, s: 150 }`. A suit of 30 s 3 s later asks nothing more. The sprite is drawn on the beacon's tile with `spent: true`, and with `spent: false` once `x.refills` is empty.
- `the maps always mark the relay beacons, fog or not, and draw the dashed route home: each beacon's link from X.routeHome, in world pixels`: with beacons B0 and B1, the `beacon: true` marks are each beacon's tile centre in `#ffcf7a`; `lines()` equals `X.routeHome` in world px with a dash (B0 to the base, B1 to B0).
- `a ping shows on the maps in its sender's colour with their name, fading out over 10 s of the wall clock`: a five-crew mission. `addPing` for diego at (640, -320) gives one mark in the scientist's colour with `label: 'diego'` and `alpha: 1`; a ping with `x: 'x'` is ignored. After 5 s the alpha is 0.5; after 10 s there is none.
- `while the commander is out, his pings draw a dashed line from him to each, for everyone; nobody else's do, and a 4-crew mission has none`: kai at (20, 0) tiles with pings by kai and by diego: one line, from kai to his ping, in the commander's colour, dashed. With kai at the base there is none; with a crew of 4 there is none.
- `the commander's aura: within 5 tiles of him while he is out you move 10 % faster on foot, never in the rover, and a hint says so`: minh with kai 4 tiles away has `speed` 1.1 and the hint `eva.aura` `{ p: 10 }`; in the rover 1; with kai 6 tiles away 1 and the hint hidden. Played as kai, `speed` is 1.1 and the hint is `eva.auraLead` `{ p: 10, n: 5 }`.
- `the round's goals show in the HUD column, asked twice a second: a line each over a bar, a done one ticked; no goals or no hook, no block`: two goals show under the caption `eva.goals` with bars of 25 % and 33 %; over 11 frames (1.1 s) the hook is asked 2 or 3 times, not on each frame; a done goal has class `done`, the text prefixed `✓ ` and a bar of 100 %; an empty list hides the block, and so does a hook that is not there.

`test/surface.test.js` (8 new). `page()` gains the hooks `walk` (it records `dt` in `walks` and, in solo, runs `X.addDistance`), `ping` (from `opts.ping`) and `queueBuild` (recorded in `queued`), and returns `walks`, `queued` and `ping`.
- `K at the base takes a relay beacon kit that waits there into the backpack; out on the map it does nothing`: at tile (9, 1) K asks nothing; at (0, 1) it asks `takeKit`, `kits` is 0 and the kit is in the pack.
- `E where a relay beacon cannot go opens no menu: the prompt has already said why`: with a kit at (6, 9) the focus is `beacon`, and E leaves `probe().menu` null.
- `P pings where you stand: solo shows it on your own maps at once, without the network; at most one a second`: one ping at (6.5, 3.5) tiles labelled `minh`; a second press within the second adds none; 1 s later a second one shows.
- `co-op: P sends the ping and draws nothing itself; the server's echo (SolSurface.ping) draws it, the sender's too`: the ping hook gets (6.5, 3.5) tiles in px and nothing is drawn until `pg.ping` echoes minh's and diego's; then both are.
- `the commander's aura speeds his walk by 10 % once he is out of the base zone; a crew of 4 has none`: kai in a crew of 5 walks 1.1 times as far in 1 s as minh in a crew of 4 (within 0.01).
- `co-op: a teammate whose tab is gone counts for nobody's aura or route line, though they still stand where they left`: `probe().team` lists minh and kai; with `away: true` on kai it lists minh only, and `probe().remote` still has kai.
- `solo: the tiles you walk reach the rules about every 150 ms of the surface clock; a jump and a ride in the rover count for nothing`: a teleport counts 0; walking east for 1 s counts the tiles walked (more than 2, within 1e-6) in at least 10 samples of 0.11 to 0.25 s; the same drive in the rover counts 0.
- `the HQ's menu builds a relay beacon kit, as it adds a shield layer: its cost, or why not`: the button `sf.kitAdd` shows `bld.cost` `{ kg: 50, w: 1.5 }` and a click queues `{ type: 'kit' }`; with 10 kg of materials it shows `bld.why.materials` and is disabled.

`test/surface-map.test.js` (4 new). The fake element records its listeners (`n.on`) and answers `getBoundingClientRect`; `setup(seed, opts)` passes `opts` to `SolMap.create`.
- `the minimap draws a dashed line for each link of the route home, under the marks, and a relay beacon's mark as a little mast`: a line from a beacon 20 tiles east to the HQ is stroked dashed from (100.5, 80.5) to (80.5, 80.5); the dash is reset before the marks; the beacon's mark is a small mast above its spot.
- `a tap on the minimap pings that spot in world pixels; Enter on the minimap, or its corner button, opens the full map`: a click at (100, 70) pings (20 × 64, -10 × 64) and leaves the map shut; a click with `detail: 0` opens it; so does `openBtn`.
- `on the full map a click that does not drag pings the spot under it; a drag pans and never pings`: a click at (110, 50) pings (10 × 64, -10 × 64); a drag of 15 px pings nothing.
- `the maps draw a ping as a ring in the sender's colour with their name, and a mark's or a line's alpha as its faintness`: a line with `alpha: 0.25` is stroked at that alpha; a ping 10 tiles east at `alpha: 0.5` gets its ring (`arc` at (90.5, 80.5)) and its name `kai` above it at (90.5, 74.5) at that alpha; the HQ after it is drawn at full strength.

`test/surface-paint.test.js` (1 new):
- `a relay beacon's light flashes once every 2 s, and stays dark while your refill there is used`: at `time` 0.5 the beacon draws two arcs (the glow, then the light in `#ffcf7a`); at 1.5 one (the light alone); spent, one in `#5d5355` with no flash; every arc sits above the foot.

`test/ui.test.js` (3 new, mid-file after the co-op discovery test). `surfacePage()` is a page whose net connects at boot and whose surface records what ui.js hands it.
- `a ping: solo sends nothing (the surface shows it itself); co-op sends it to the server, and the server's pings reach the surface`: the `ping` hook is false in solo and sends nothing; in co-op it is true and `sendPing` got (640, -320); the sixth `connect` handler passes `{ x, y, by }` on to `SolSurface.ping`.
- `co-op: a teammate whose tab is gone reaches the surface marked away, so they count for nobody's aura or route line`: of two seats, the connected one reaches `setRemote` with `away: false` and the other with `away: true`.
- `solo: the surface's walking samples add the tiles walked to the pilot's stats; co-op leaves them to the server`: the `walk` hook for 128 px in 0.5 s gives `stats.minh.distance` 2; in co-op it changes nothing.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/surface-eva.test.js test/surface.test.js test/surface-map.test.js test/surface-paint.test.js test/ui.test.js`
Expected: 26 of 157 fail, the 26 new tests (`surface-eva` 10, `surface` 8, `surface-map` 4, `surface-paint` 1, `ui` 3).
- Several stop at what doesn't exist yet: `s.eva.addPing`, `s.eva.speed`, `P.sprites.drawBeacon` and the `walk` and `ping` hooks ("is not a function"); the kit buttons and the goals block (`undefined` reading `hidden`); the beacon prompt (`null` reading `kind`); the HQ menu's kit (`undefined` reading `slice`).
- Two stop at their own helper's `no open spot`, which looks for a place to put a beacon.
- The rest fail an assertion naming the missing behaviour: a pack with a kit asks for a delivery every 1.5 s; no dashed route home on the minimap; a minimap tap and a map click don't ping; the commander walks no faster; the tiles walked are 0 of 2.34375; a teammate whose tab is gone isn't marked `away`.
- The changed `surface-eva` test (`the canister button shows only when breathing one is worth it, …`) passes before and after.

- [ ] **Step 3: Put M4d on the map**

Apply the dry run's code: `git diff 62eca6a d9bbfa2 -- . ':(exclude)test' | git apply`.

What it must provide (the reviewers check each line against the code):
- **The kit in the pack** (`src/surface-eva.js`, `src/art.js`).
  - A kit slot shows `A.icon('kit', 14)` (`RES_ICON.kit`) titled `eva.kit`; other items keep `haul.<res>`. `ICONS.kit` (the pack slot and the HQ menu's button) is a mast on three legs; `MODULE_ART.kit` (Task 4's kit button and build queue) is the folded mast on its case.
  - `button.sf-kit` (take) and `button.sf-kitback` (put back) sit in the HUD column after the canister button. Both show only at the base, for a live astronaut who is standing and not benched. Take also needs a kit waiting and `hasRoom()`, and reads `eva.takeKit` `{ n: kits }`; put back needs a kit carried and reads `eva.returnKit`. K (not a repeat) calls `eva.takeKit`.
  - The auto-deliver runs only when the pack holds something that is not a kit. Its note counts `r.items.length` (what was banked), reads `eva.delivered1` for one and `eva.delivered` for more, and ends with ` eva.kitStays` when a kit stays.
- **Placing** (`src/surface-eva.js`, `src/surface.js`).
  - `focusAt` ends with `beaconFocus(p)` when nothing else is in reach, the player is on foot and outside the base zone, and the pack holds a kit. Its `key` holds the error code, so a hold stops when the verdict changes.
  - `holdable` is true for a beacon focus only when `spot.ok`. Every hold's seconds are `X.holdSeconds(holdKind(f), role)`; a beacon's are 4.
  - `label` for a beacon: ok → `eva.placeBeacon` `{ s: '4' }`; `nearBase` → `eva.beaconNearBase` `{ n }`; `nearBeacon` → `eva.beaconNearBeacon` `{ name, n }`; `limit` → `eva.beaconLimit` `{ n: 6 }`; any other error → `eva.err.<error>`. `n` is `max(1, ceil(need))`, whole tiles.
  - At the end of the hold `finish` asks `placeBeacon` and, on `ok`, says `eva.placed` `{ name, n: 12, r: 2 }` for 6 s. `name` is `eva.beaconName` `{ n: i + 1 }`, from the returned id `B<i>`. The other kinds still ask `collect`, `pickup` and `interact`, and `revive` for anything else.
  - `interact` in `src/surface.js`: a holdable focus starts its hold, the rover toggles, a refused beacon spot does nothing (no menu), and anything else opens the menu.
- **Refill and drawing at a beacon** (`src/surface-eva.js`, `src/surface-paint.js`).
  - In `step`, outside the base and not collapsed or benched, with `suit <= CAN_BELOW` (105 s) and 2 s since the last refill ask (the pods' timer is shared): the first beacon not in `x.refills[me]` whose tile centre is within `D.EXPEDITION.beacon.refill` (2) tiles. It asks `refill` `{ beacon: 'B<i>' }`; on `ok` the suit becomes `r.suit` and the note is `eva.refilledBeacon` `{ name, s }` for 4 s. A refusal says nothing (`refill` is in `QUIET`).
  - `sprites` draws every beacon in view on its tile centre, sorted at `y + 6`, with `drawBeacon`; `spent` when `x.refills[me]` holds its id. The light flashes once every 2 s (`sin(time × π)` to the 8th power; the glow arc only while it is above 0.02) and is `#5d5355`, with no flash, when spent.
- **The maps** (`src/surface-map.js`, `src/surface-eva.js`).
  - `eva.lines()` gives one line per `X.routeHome(m)` link, tile centre to tile centre in world px, `color '#ffcf7a'`, `dash [3, 2]`. While `X.commanderOut(m, team())` is not null it adds, for each live ping of his, a line from him to it: `width 2`, `dash [6, 3]`, `color A.ROLE.commander`, `alpha` = the ping's fade. `mapState()` passes it on as `lines`.
  - `eva.marks()` adds a beacon mark for every beacon, always (fog or not), and a ping mark for every live ping: the sender's role colour (`#cccccc` if unknown), `label` = `crewName(by)`, `alpha` = the fade. The ping marks are added after the 150 ms cache, so they fade smoothly.
  - `markers` draws `st.lines` first (alpha as given, width 1.5 unless given, dashes in screen pixels, reset afterwards), then the marks. A `ping` mark is a ring of radius 4.5 with the name above it, in the sender's colour at its alpha; a `beacon` mark is a small triangle with a dark edge.
  - A click on the minimap pings that spot in world px, worked out from the click's place on the 160-tile image. When `detail === 0` (Enter or Space), when there is no `onPing`, or before the first frame, it opens the map instead. `openBtn` opens it too.
  - On the full map, `pointerdown` starts a record with `moved: 0`, `pointermove` adds the distance, and `pointerup` pings the spot under the pointer if `moved < 5`. A longer drag only pans, and `pointercancel` pings nothing.
- **Pings** (`src/surface.js`, `src/surface-eva.js`, `src/surface-paint.js`, `src/ui.js`).
  - `ping(x, y)` in `src/surface.js` does nothing unless the mission is `active` and `D.TEAM.ping.gap` (1) s of `S.time` have passed. It rounds the spot. If `hooks.ping` returns true (co-op sent it) it draws nothing and waits for the server's echo; otherwise it calls `eva.addPing` with `by` = the controlled crew id. P pings `S.player`'s own spot; a map click pings the spot clicked.
  - ui.js: `ping` is `lanOn() && N.sendPing(x, y)`. `onPing(d)` calls `SolSurface.ping(d)` when the surface is mounted, and it is the sixth argument of all three `N.connect` calls. `SolSurface.ping` does nothing before the surface is mounted.
  - `addPing` drops a non-finite spot and a non-string `by`, keeps the newest 50, and a ping lives `D.TEAM.ping.life` (10) s of `env.now()`. `drawOver` draws each one before the hold ring with `drawPing`: a pin, a ring opening out every 1.5 s, and the name, dimmed by `fade` = `1 - age / 10`; nothing when `fade <= 0`.
- **The commander** (`src/surface.js`, `src/surface-eva.js`, `src/ui.js`).
  - `team()` in `src/surface.js` is you, plus the crew walking round the base (`S.npcs`) in solo, or the `S.remote` seats that are not `away` in co-op. In `onPos`, ui.js sets `away` to true for any seat whose crew id is not held by a `connected` player (and for all of them when there is no `store.room`).
  - The pilot's speed is multiplied by `S.eva.speed(p)`, which is 1 when not live, collapsed or in the rover. The HUD line `p.sf-aura` shows only while it is above 1: `eva.auraLead` `{ p: 10, n: 5 }` for the commander himself, else `eva.aura` `{ p: 10 }`.
- **Walked distance** (`src/surface.js`, `src/ui.js`). `walkSample()` runs at the end of every frame. The first sample after a new world only records where you stand. After that, every `WALK_GAP` (0.15) s of `S.time`, it calls `hooks.walk(from, to, dt)` with the two `{ x, y, rover }` samples. In solo with an expedition and a pilot, ui.js does `X.addDistance(s, s.pilot, from, to, dt)`; in co-op it does nothing. It does not save: the 2 s `suit` report does.
- **Goals in the HUD column** (`src/surface-eva.js`). `renderGoals` asks `hooks.goals()` every 0.5 s of `now` and keeps the entries with a string `text`. `div.sf-goals` holds the caption `eva.goals` and a `ul` with one `li` per goal: `.done` and a `✓ ` prefix when done, and a `span.bar > i` as wide as `round(100 × frac)` % (100 % when done). It is rebuilt only when the list or the language changes, and hidden when the list is empty. The column's order is suit, battery, pack, goals, canister button, kit buttons, aura line, note.
- **The HQ menu** (`src/surface.js`). With `m.expedition`, after "Add shield layer": a button `sf.kitAdd` with `bld.cost` `{ kg: 50, w: 1.5 }` as its second line, or `bld.why.<reason>`; it is disabled when `E.canBuild(m, 'kit', plan.builds).ok` is false, and a click calls `queueBuild({ type: 'kit' })`.

Keep:
- The rules stay in the pure modules: the surface asks through `exp` and draws what the mission says. It merges no fog after a placement; solo's mission holds it and the next `update()` passes it on, and co-op's `fog` frame brings it, as a repaired weather station's does.
- The kit buttons are in the HUD column, with K to take (eva report §4). The HQ menu's kit button stays beside the console's (R19): two views, as the shield is offered in both. Its reason for `max` is the generic `bld.why.max` until Task 6 (R18).
- The placement prompt is for the tile under you, and only when nothing else is in reach. A refused spot says why and E opens no menu there.
- A beacon refill is asked only when the suit is at or below 105 s, a canister's worth to gain. The rules would refill at any level; this keeps the round's refill for the way home (eva report §4). If wrong: refill on entry, as a pod does.
- R17: a commander driving the rover still gives crew on foot within 5 tiles the aura (Task 3's `X.commanderOut` ignores the rover); the driver gets none. The aura and the route line need a commander, so a crew of 4 has neither, and no hint.
- Who counts as the team: solo, you and the crew walking round the base; co-op, you and the players who are connected. An `away` seat is still drawn but counts for nobody, because a dropped player's last position stays in the room (Task 3's hand-off).
- P pings where you stand, not under the mouse. The minimap click pings (spec §3.5), so the map opens from the ⤢ button, M, or Enter on the minimap. In solo nothing goes to the network (§13.12). In co-op with the socket closed a ping shows on your own maps only.
- A ping fades on `env.now()`, the wall clock, so it also fades while the tab is hidden. Route lines are drawn on the minimap and the map only, not on the ground.
- Solo walked distance has its own `walk` hook, sampled every 0.15 s of the surface clock. The 2 s `suit` report would give the chord, not the path, and a sprint with the aura covers 9 tiles in 2 s (Task 3's hand-off). Co-op leaves the counting to the server (R5). There is no live distance readout on the surface; the debrief has the totals.
- The goals block reads the `goals` hook (Task 4). The surface has no goal logic and never calls `G.update`.
- Apply the diff as it is. Task 6's diff is made against these lines: `eva.goals`, `eva.kit`, the plain `bld.why.max`, `label`'s one key for every number of tiles, and the "dry run" and "nháp" comments in `src/i18n.js`. Do not tidy them here.
- Not in this task: `lib/rooms.js` and `src/net.js` (Task 3 made the ping frame and the server's distance), `src/data.js`, `index.html`, `sw.js` and `dist/` (the release, Task 9).

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/surface-eva.test.js test/surface.test.js test/surface-map.test.js test/surface-paint.test.js test/ui.test.js test/i18n.test.js`, then `npm test`
Expected: all pass; `npm test` 598/598.

- [ ] **Step 5: Commit**

```bash
git add src/art.js src/i18n.js src/style.css src/surface-eva.js src/surface-map.js src/surface-paint.js src/surface.js src/ui.js test/surface-eva.test.js test/surface-map.test.js test/surface-paint.test.js test/surface.test.js test/ui.test.js
git commit -m "feat(surface): beacon kits are carried out and placed, the maps draw the route home and pings, the commander's aura speeds the crew, solo counts the tiles walked and the HUD lists the round's goals" -m "Tasks 1-4 made the rules and the console; this puts them out on the surface (spec §3.2, §3.3, §3.5, §3.8, §3.9, §3.10, §13.12). The surface only asks the rules and draws what the mission says; co-op's server counts the distance and relays the pings." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Review notes:**
- **Not to reopen:** R17 (the aura in the rover), R19 (two kit buttons), R18 (Task 6 folds the keys), R5 (`walk` is the surface's half), and the eva decisions under Keep.
- **Look hardest at:**
  1. The if/else chains that gained a beacon branch: `finish`, `holdKind`, `holdable`, `focusAt`'s tail (a find or a drop in reach must still win), `label`, and `interact`. The old tests carry the old branches; check that none was changed to fit.
  2. The auto-deliver guard: a pack of a kit and a load delivers the load and keeps the kit; a pack of kits only asks for nothing. And the HUD column's order, which the tests now find by class.
  3. Input from the network: `addPing` must drop a non-finite spot or a non-string `by`, and `onPos` must cope with a non-array and with no `store.room`. The surface reads `x.beacons`, `x.kits` and `x.refills` from a saved mission, which Task 1's repair has made safe.
  4. The click maths: the minimap's (the origin is the tile under you minus 80, on a 160-tile image) and the full map's (`cx - w / 2 / z + ...`) must match how each draws. A drag under 5 px pings; more only pans.
  5. Clean-up: `reset()` clears the pings, the goals and `goalsAt`; a new world clears `S.walk`, so a new mission's first sample counts nothing.
- **Later tasks touch this one's files:**
  - Task 6 rewrites the strings; points `renderGoals` at `goal.title`, the kit slot at `mod.kit` and the HQ menu's `max` reason at `bld.why.maxKit`; and gives `label` one-tile keys. So it changes three tests here (the kit slot's title, the goals caption, the beacon prompts) and one in `test/surface.test.js` (the HQ menu).
  - Task 8 may tune looks. It also rewords the stale "30 kg" message in the canister test (R25): it is right at this task's tree and this task leaves it as it was.
  - Task 9: `sw.js`'s cache name and `dist/` are release steps (R12).
- **Seen in the dry run, not for this task:**
  - A commander whose tab drops while nobody moves keeps his route line until the next `pos` frame or until his pings fade (10 s at most).
  - A pack of kits reads "Backpack full" and counts kits as loads (`eva.full`, `eva.pack`); Task 6 lists it.
  - `help.9` still says a tap on the minimap opens the map, and a beacon prompt one tile short reads "1 more tiles"; Task 6 fixes both.
  - The HQ menu's digit keys shift (found while writing this plan): with the shield and kit buttons both on, Advance is key 4, not 3.
  - In `test/surface.test.js` the fake DOM still lets children pile up across menu redraws; `menuButtons` reads the last body.
- **Not checkable here:** how it looks and feels. Task 8's browser pass looks at the ⤢ button's size and place on a phone and whether a tap that pings reads right; the beacon and ping sprites; the goals block and the aura line in the 210 px column; P doing nothing while the full map is open (the map takes the keys), where a click pings; and whether touch players can find everything without K and P.

---

### Task 6: The words, in English and Vietnamese

The player reads every line M4d added in finished English and Vietnamese: no draft marker is left, and the Vietnamese uses the file's own terms. The solar-storm card's Take shelter hint says that crew out on the surface still need cover from the flare (spec §13.12). The surface and the console share one word for the goals and for a kit, and the HQ menu says why a kit can't be built (ruling R18). A beacon prompt that is one tile short reads "1 more tile".

**Dry-run code:** `m4d-dryrun` `d9bbfa2..0f5192d` (5 commits). Full suite 598 → 602.

**Files** (line numbers are at `c8ff6bd`; Task 7 doesn't touch these files):
- Modify: `src/i18n.js` — the English and Vietnamese pass over M4d's keys (the lists under Interfaces); 2 keys added and 2 removed in each language; the 7 comment lines that said "dry run" or "nháp" reworded.
- Modify: `src/surface-eva.js` — `renderGoals` caption (`:240`) reads `goal.title`; `renderHud` kit slot title (`:284`) reads `mod.kit`; `label`'s beacon branch (`:597-598`) picks the singular key at 1 tile.
- Modify: `src/surface.js` — the HQ menu's kit button (`:1034-1036`) gives `bld.why.maxKit` when the kit is at its limit.
- Test: `test/i18n.test.js` — 4 new tests. `test/surface-eva.test.js` — 3 changed. `test/surface.test.js` — 1 changed.

**Interfaces:**
- Consumes:
  - From Task 1: `E.canBuild(s, 'kit', pending)` → `{ ok: true }` or `{ ok: false, reason }`, where reason `'max'` means the beacons placed + kits waiting + kits carried + kits queued reach `D.EXPEDITION.beacon.max`; `E.isKit(item)`; `D.EXPEDITION.beacon` = `{ hold: 4, base: 12, apart: 10, max: 6, refill: 2, reveal: 12 }`; `D.BUILDS.kit` = `{ materials: 50, work: 1.5 }`.
  - From Task 4: the keys `mod.kit` ("Relay beacon kit"), `goal.title` ("Goals this round") and `bld.why.maxKit`. `bld.kit` is called with `D.EXPEDITION.beacon` as its params, so its placeholders are that object's keys.
  - From Task 5: the `eva.*` and `sf.*` blocks this task rewrites. From master: the `eva.delivered1` pattern (a singular key picked at the call site).
- Produces: no new or changed export, function signature, mission-state field or `src/data.js` constant. String keys only:
  - Added in EN and VI: `eva.beaconNearBase1` (no params), `eva.beaconNearBeacon1` (`{name}`).
  - Removed from EN and VI: `eva.goals` (use `goal.title`), `eva.kit` (use `mod.kit`).
  - Reworded in both languages (12): `bld.kit`, `deb.exp.flareCover`, `ev.spe.shelter.hint`, `eva.err.limit`, `eva.err.noKit`, `eva.err.notAtBase`, `eva.err.refilled`, `eva.kitStays`, `eva.placed`, `eva.takeKit`, `help.9`, `sf.hintKeys`.
  - Reworded in English only (3): `eva.beaconLimit`, `eva.beaconNearBeacon`, `goal.region`.
  - Reworded in Vietnamese only (15): `bld.kitReal`, `bld.kitStatus`, `bld.why.maxKit`, `deb.exp.flareHit`, `eva.aura`, `eva.auraLead`, `eva.err.blocked`, `eva.err.nearBeacon`, `eva.returnKit`, `eva.tookKit`, `goal.done`, `goal.haul`, `goal.rewardHaul`, `goal.structure`, `lesson.isruMars.body`.

- [ ] **Step 1: Write the failing tests**

Apply the dry run's tests from the repo root: `git diff d9bbfa2 0f5192d -- test | git apply`. If an earlier task changed after its review and this doesn't apply, use `git apply --3way` and resolve.

`test/i18n.test.js` (4 new):
- `the solar-storm card's Take shelter hint says crew out on the surface still need cover from the flare (spec §13.12)`: `ev.spe.shelter.hint` matches `/surface.*cover/` in English and `/bề mặt.*trú ẩn/` in Vietnamese.
- `every Vietnamese string keeps exactly the placeholders of its English twin`: for every English key, the set of `{word}` placeholders (sorted, duplicates ignored) is the same in both languages.
- `the hints' · separator has a space on each side, in both languages`: no value in either language matches `/\S·|·\S/`.
- `no string in either language is still a draft, and no comment marks one as a draft`: no value, and no line of `src/i18n.js` (comments included), matches `/dry run|draft|nháp/i`.
- The placeholder and separator tests should already pass on the tree before the code (the file at `d9bbfa2` has no mismatch and no bare `·`). They guard the Vietnamese pass, they don't drive it.

`test/surface-eva.test.js` (3 changed):
- `the backpack shows a carried kit with its own icon and name`: the kit slot's title is `'mod.kit'` (it was `'eva.kit'`).
- `carrying a kit on the map, the prompt says why a beacon cannot go here (the tiles still to go), or to hold E for its 4 s; the note names it`: one tile short of the base the label is `eva.beaconNearBase1` (`{ n: 1 }`), and one tile short of the first beacon it is `eva.beaconNearBeacon1` (`{ name: <the first beacon's name>, n: 1 }`). The plural lines at 6 tiles to go are asserted as before.
- `the round's goals show in the HUD column, asked twice a second: a line each over a bar, a done one ticked; no goals or no hook, no block`: the caption is `goal.title`.

`test/surface.test.js` (1 changed):
- `the HQ's menu builds a relay beacon kit, as it adds a shield layer: its cost, or why not`: with 500 kg of materials and `m.expedition.kits = D.EXPEDITION.beacon.max`, the kit button reads `bld.why.maxKit` with `{ max: 6 }` and is disabled. The earlier asserts (cost; `bld.why.materials`) stay.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/i18n.test.js test/surface-eva.test.js test/surface.test.js`
Expected: 6 of 93 fail.
- The Take shelter hint test (the hint doesn't match `/surface.*cover/`) and the draft test (`src/i18n.js` still marks drafts).
- The four changed surface tests, which now want the console's words and the singular lines: `mod.kit` for a carried kit, `eva.beaconNearBase1` and `eva.beaconNearBeacon1` at one tile to go, `goal.title` over the goals block, and `bld.why.maxKit` in the HQ menu.
- The placeholder-parity and separator tests pass already: they guard the words this task writes.

- [ ] **Step 3: Write the words and point the surface at the shared keys**

Apply the dry run's code: `git diff d9bbfa2 0f5192d -- . ':(exclude)test' | git apply`.

What it must provide (the reviewers check each line against the code):
- **No draft left.** No value and no line of `src/i18n.js` carries "dry run", "draft" or "nháp". The 7 comments become plain notes on what each block is for and which file reads it.
- **Take shelter (§13.12).** `ev.spe.shelter.hint` keeps its first sentence and adds one. English: "Everyone in the shielded core: less work, only a few mSv. Crew out on the surface still need cover from the flare." Vietnamese: "Mọi người vào lõi được che chắn: ít việc hơn, chỉ vài mSv. Ai đang ở ngoài bề mặt vẫn phải tìm nơi trú ẩn khỏi bão hạt Mặt Trời."
- **One tile short.** `eva.beaconNearBase1` is "Too close to the base for a relay beacon: 1 more tile out" / "Quá gần căn cứ để đặt trạm: đi thêm 1 ô nữa". `eva.beaconNearBeacon1` is "Too close to {name}: 1 more tile away" / "Quá gần {name}: cách xa nó thêm 1 ô nữa". `label` in `src/surface-eva.js` picks them when `more === 1` and passes the same params as before. The plural keys keep `{n}`.
- **The folds (R18 names the first and third; the backpack's `eva.kit` → `mod.kit` is the same kind, found while looking for pairs).** `renderGoals` titles the block with `goal.title`; the backpack's kit slot is titled `mod.kit`; the HQ menu's kit button says `t('bld.why.maxKit', { max: D.EXPEDITION.beacon.max })` when `E.canBuild` gives `reason: 'max'`, and `bld.why.<reason>` for any other reason, as the console's `kitButton` (`src/ui.js:1291`) does.
- **Old words that M4d made false**, fixed in both languages: `help.9` says to tap ⤢ on the minimap to open the map (a tap on the minimap now pings); `eva.err.refilled` says "here", not "at this pod" (beacons share the refill rule); `eva.err.notAtBase` says "That only works inside the dashed square around the HQ." (delivering is quiet now, so only taking or returning a kit shows it).
- **Each suit.** `bld.kit` and `eva.placed` say a beacon refills each suit within `{refill}` tiles once a round: the rule is once per crew member (R1), not once for the crew.
- **The hints.** `sf.hintKeys` says "P to ping where you stand" / "P để đánh dấu chỗ bạn đứng", since P pings the player's own spot (`src/surface.js:329`). `sf.hintTouch` and `sf.minimap` still say "a spot": a tap pings that spot.
- **The debrief.** `deb.exp.flareCover` reads "Safe at the base or under cover: {list}" (staying at the base counts). Vietnamese `deb.exp.flareHit` says "Bị bão bắt gặp ngoài trời", so the subject is clear without the card.
- **NASA's lines.** English `bld.kitReal` and `lesson.isruMars.body` are not touched. The Vietnamese follows them sentence by sentence and adds nothing; "98% purity or better" stays on the 12 g an hour only; the six numbers the ISRU test pins (122, 16, 2021, 2023, 12, 98) stay in both languages.
- **Vietnamese terms** (M4d's strings use no other word for these): relay beacon = trạm chuyển tiếp ("Beacon 2" = "Trạm 2"); beacon kit = bộ trạm; build a kit = chế tạo (a kit takes no tile; xây stays for modules on the map); place = đặt; within N tiles = trong phạm vi N ô; commander = chỉ huy trưởng (as `role.commander`); ping = đánh dấu; route home = đường về căn cứ; local materials = vật liệu tại chỗ; carbon dioxide and hydrogen = CO₂ and hydro.

Keep:
- Two singular keys and a ternary, not a reworded plural: the prompt counts down to 1 on every walk out, so "1 more tiles" would show every time. It is the file's `eva.delivered1` pattern. Vietnamese has no plural, so its singular keys repeat the plural text with "1".
- `sf.kitAdd` ("Build a relay beacon kit", a verb phrase beside `bld.shieldAdd`) next to `mod.kit` (the console button's noun). `eva.beaconLimit` (all placed) next to `bld.why.maxKit` (placed + made + queued). They mean different things, so they are not folded.
- "trong phạm vi", never "trong vòng": *vòng* is this game's word for a round.
- "chế tạo", not "xây", for a kit: the build panel's "xây" is for tiles.
- The draft test reads the whole of `src/i18n.js`, comments too, and `/draft/i` bans the word in any value. At `d9bbfa2` the markers were only in comments, so a test of values alone would have passed before the change.
- No real-world metal line and no orbiter count in the text (R7, R9), and no role facts: they wait for M5 (R8).
- The sweep for text that skips `t()` (template literals, `title`, `aria-label`, `textContent`, `innerHTML`, `fillText`) over M4d's code found none, so `src/ui.js` is not in this task.
- Task 1's English for `eva.err.nearBase`, `nearBeacon`, `blocked` and `noBeacon` was already plain and stays. Only `noKit` and `limit` were reworded in English.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/i18n.test.js test/surface-eva.test.js test/surface.test.js`, then `npm test`
Expected: all pass; `npm test` 602/602.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.js src/surface-eva.js src/surface.js test/i18n.test.js test/surface-eva.test.js test/surface.test.js
git commit -m "feat(i18n): M4d's lines read finished in English and Vietnamese, the solar-storm card says crew outside still need cover, and the surface uses the console's words for goals and kits" -m "The earlier tasks left the Vietnamese as a draft and the English unreviewed. Spec §13.12 wants the Take shelter hint to say crew outside still need cover, and R18 folds the surface's goals and kit lines into the console's keys." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Review notes:**
- **Not to reopen:** R18 (the folds), R19 (the HQ menu keeps its own kit button beside the console's: two views, as the shield is offered in both), and R7 (the ISRU lesson's last English sentence, "In the game, …", stays). The Vietnamese terms above were chosen against the file's existing words; "đèn hiệu" for beacon and "xây" for building a kit were weighed and left out.
- **Look hardest at:** (1) the placeholders: every Vietnamese string keeps its English twin's, `bld.kit` still takes only keys of `D.EXPEDITION.beacon`, and every `eva.err.<code>` the rules can give still has a string in both languages (an existing test reads `src/expedition.js` for the codes); (2) the two ternary chains, which need both branches asserted: the beacon prompts (1 tile and 6 tiles) and the HQ menu's reason (`max` and `materials`); (3) that no quoted NASA line changed in English; (4) that the file is still UTF-8 with its diacritics, `₂`, `⤢` and `·` intact.
- **Not checkable here:** whether `eva.auraLead` (English 57 characters, Vietnamese 63), `eva.placed` and `eva.kitStays` wrap past two lines in the surface's 210 px column. The browser pass behind Task 8 is where that is seen.
- **For the user's native read of the Vietnamese:** start with the glossary (the Vietnamese terms above), then `bld.kit`, `eva.placed`, `lesson.isruMars.body`, `eva.auraLead` and `goal.rewardHaul`, where the wording was a choice.
- **For the plan's follow-ups (found here, not fixed here):**
  - The debrief's walked column prints `nf(c.walked) + ' ' + t('eva.tiles')` (`src/ui.js:1597`), so one tile reads "1 tiles". The rover battery readout (`src/surface-eva.js:275`) does the same, from before M4d.
  - `eva.pack` and `eva.full` (`src/surface-eva.js:281`, `:222`) count a kit as a load: "Backpack: 2 of 3 loads" with a kit in it, and "Backpack full: bring it back to the base" for a pack of kits, where delivering banks nothing.
  - `I.SOURCES` labels are English in both languages (a design from before M4d), so the four labels Task 4 added for the Science note are too.
  - `goal.haul`, `goal.chunks` and `goal.kits` read right only while a goal's counts stay at 4 (haul, chunks) and 1 (kit). A `D.GOALS` change to one load, or to 2+ kits, needs singular and plural keys.

---

### Task 7: The explorer bot plays M4d; the rebalance

The balance bot now plays M4d like a thoughtful player (it goes after the round's goals, has beacon kits built, places them and refills its suit at them, and it explores and visits regions as the surface does), and two data levers then keep spec §13.12's targets. An O₂ canister carried home gives 10 kg of base O₂, not 30, so exploring adds about 22 points of success for a sloppy veteran crew, not 30. Science from the map counts a tenth of itself, up to 55 points, beside the base's science in full, so an S grade stays special; the player sees that as the debrief's Science row, and Task 8 adds the hint that explains it (R24). It carries out spec §1.4, §3.8, §3.9 and §13.12 and rulings R11, R20, R21 and R23.

**Dry-run code:** `m4d-dryrun` `0f5192d..c8ff6bd` (the balance merge: `m4d-dry-balance`'s 9 commits, `076a477..46143f8`, plus the merge's two keep-both conflicts and one test line). Full suite 602 → 610.

**Files** (line numbers are at `c8ff6bd`; Task 8 rewords the header of `tools/explorer.js`):
- Modify: `tools/explorer.js` — `haulRound` (goals, kits, beacons, seeing and visiting, `time`, loads as banked, `Z.slackOf`), `poiNear` (new `masts` and `regions`), new `see` and `walkSees`, new constants `PULL` and `PLACE`.
- Modify: `tools/balance.js` — `smartPlan(s, explore)`, `play(…, level, tally)`, `run` (tally, `DUMP`, labels, one new output line), `main()` behind a `require.main` guard, a new `module.exports`.
- Modify: `src/data.js` — new `D.SCORE.map`; `D.EXPEDITION.canister.o2` 30 → 10.
- Modify: `src/engine.js` — `newExpedition` (+`science: 0`) and its state note, `applyExpedition` (adds to `x.science`), `scoreMission` (the map's share). The save repair needs no new line: `repairExpedition`'s generic loop covers a new numeric field.
- Test: `test/explorer.test.js` — 6 new, 4 changed. `test/engine.test.js` — 2 new, 3 changed. `test/ui.test.js` — 2 changed, one line each.

**Interfaces:**
- Consumes:
  - From master: the rules the bot already called (`X.collect`, `X.deliver(m, crewId, pos)` → `{ ok, items }` or `{ error }`, `X.interact`, `X.pickUp`, `X.discover`, `X.board`, `X.park`), `Z.slackOf(m)` (0 in solo, `D.EXPEDITION.reach` in co-op), `Z.flareEnd(m, spots, slack, t)`, `F.mergeMap(map, diff, limit)`, `W.regionAt(seed, x, y)`, `W.regionOf(chunk, lx, ly)`, `W.REGIONS`, `W.CHUNK`, `D.REPAIR_MATERIALS` (100).
  - From Task 1: `X.takeKit(m, crewId, pos)` → `{ ok, kits }`; `X.beaconSpot(m, crewId, pos)` → `{ ok, x, y }` or `{ error }`; `X.placeBeacon(m, crewId, pos)` → `{ ok, beacon, fog }` or `{ error }`; `X.refill(m, crewId, id, pos)` takes a beacon id `"B<i>"`; `X.holdSeconds('beacon', role)` = 4; `E.canBuild(s, 'kit')`, `E.isKit`, `E.kitItem()`; `expedition.beacons` `[{ x, y, by, round }]`, `.kits`, `.refills`; `D.EXPEDITION.beacon` `{ hold: 4, base: 12, apart: 10, max: 6, refill: 2, reveal: 12 }`; `D.BUILDS.kit` `{ materials: 50, work: 1.5 }`.
  - From Task 2: `G.pick(m)`, `G.update(m)` (the goals, with `progress` and `done` brought up to date), `G.advance(m, plan)` (→ `E.resolveTurn`'s `{ state, report }`, then picks the next round's goals), `G.offered(m)`, `G.make(m, kind)`; a goal is `{ id, kind, params, need, base, progress, done, reward }`, and `survey` and `beacon` goals carry `params.tiles`; `expedition.goals`, `expedition.goalsDone`. `applyExpedition`'s `got.science` already holds a done goal's science reward (`payGoals` banks it first) and, at the final advance, the last round's backpacks.
  - From Task 4: `bestFind: null` in `newExpedition`; `stats[id].pods`, the hab pods a crew member has visited (the Science-note test needs the bot to visit them).
- Produces:
  - `tools/explorer.js` exports `{ haulRound, findsNear, poiNear, DEVIL_HITS }`, the same four names.
    - `haulRound(m, crewId, poi)` → `{ loads, seconds, time, flare }` (`:111`). Call it before the advance. It changes `m.expedition` through the real rules, and writes the fog (`revealed`) and the visited `regions` a player's game would. `loads`: what `X.deliver` banked (a refused delivery counts nothing and leaves the pack as it was; a beacon kit is never a load). `seconds`: the suit used (a charge is 150). **`time` (new):** the seconds out on the round's clock, every leg's distance over its speed plus every hold; on foot `seconds = time × (1 + the devils' toll)`. `flare`: `null`, `'hit'` or `'safe'`. An astronaut or a mission that isn't active gives `{ loads: 0, seconds: 0, time: 0, flare: null }`. It throws nothing on game conditions.
    - `poi` is one switch (`play` passes `planner === smartPlan`). Truthy turns on the points of interest and hab pods (as before) and, new, the round's goals, taking a waiting kit out and placing it, and refills at beacons.
    - `poiNear(m)` → `{ sites, structures, masts, pods, landmarks, regions }`, each entry `{ id, x, y, kind }` in tile units (a site also has `site`). New: `masts` (comms masts, skipped before; kept for a structure goal only, so `structures` still holds none) and `regions` (a spot every 8 tiles over ±128 tiles, `kind: 'visit'`, with `region`: a name in `W.REGIONS`).
    - Not exported: `see`, `walkSees`, `PULL` = 0.35 (`:36`), `PLACE` = 20 (`:37`).
  - `tools/balance.js` exports `{ play, naivePlan, sloppyPlan, smartPlan, LOADOUTS }` (`:210`; new). Requiring it runs nothing: `main()` runs only as the script (`:211`). It used to run its loops on require, so no test could use it.
    - `play(loadoutName, planner, seed, explore, haul, level, tally)` → the mission at its end (`:122`). `loadoutName`: `'reference'` (the level's `D.REFERENCE_KITS[level || DIFF]`) or a key of `LOADOUTS`. `planner(s, explore)`: `naivePlan`, `sloppyPlan` or `smartPlan`. `haul` (optional): `haul[turn] = [loads, missions still running]`. `level` (optional): `'cadet'`, `'commander'` or `'veteran'`, default `'commander'`. `tally` (optional): `{ map, loads, time }`, numbers `play` adds to: the science banked from the map (the sum of `report.expedition.got.science`), the loads, the seconds outside. Exploring: the pilot is `diego`, `G.pick(s)` runs first, then each round `haulRound` and `G.advance`. Not exploring: `E.resolveTurn`, no pilot, no goals, as in 3.2.0.
    - `smartPlan(s, explore)` → plan (`:39`; new second argument). `naivePlan(s)` and `sloppyPlan(s)` are unchanged and ignore it.
    - Command line: `node tools/balance.js [runs]` (default 1,000; seeds `BAL-0`…). Env: `LEVELS` and `BADGES=1` (existing) and `DUMP=<file>` (new): appends one JSON line a run, `{ level, label, explore, seed, status, parts, total, grade, science, map, loads, time, goals, beacons }`, so use a fresh file for each process. New on every exploring row: `goals met/run … beacons placed/run … minutes outside/run …`; the thoughtful row's label reads `+ explorer (points of interest)`.
  - `src/data.js`: `D.SCORE.map = { share: 0.1, cap: 55 }` and `D.EXPEDITION.canister = { suit: 45, o2: 10 }`.
  - Mission state: **`expedition.science`**, a number ≥ 0, new, 0 at the start. The science banked from the map this mission (finds, sites, landmarks, structures, goal rewards and the last backpack). It is part of `s.science`: `s.science − expedition.science` is the base's own (labs, EVA jobs, farming, discovery cards).
  - `E.scoreMission(s)`: signature and return shape unchanged, `{ total, parts: { science, health, radiation, crew, independence, depot, completion }, grade, independence }`. The split isn't returned: a UI that wants "the map's counted points" works out `min(D.SCORE.map.cap, map × D.SCORE.map.share)` itself.

- [ ] **Step 1: Write the failing tests**

Apply the dry run's tests from the repo root: `git diff 0f5192d c8ff6bd -- test | git apply`. If an earlier task changed after its review and this doesn't apply, use `git apply --3way` and resolve.

`test/explorer.test.js` (6 new, 4 changed):
- Changed `on foot the haul per round is capped by one suit charge and falls off as the finds near the base run out`: FARM-1 to FARM-4; at most 15 loads a round; rounds 16-20 bring at most 0.7 × rounds 1-5 (it was "no more than"; 0.44-0.60 seen); the mean is still at least 2.
- Changed `in a solar-flare round the explorer, who never runs for cover, is hit when the flare ends while it is out, and safe when it is home first`: each verdict is checked against the incident the rules recorded and the dose at the advance (hit: only diego caught and at least `D.DANGERS.flare.dose`, 15 mSv, more; safe: no incident and less). Round 1 on 12 seeds (`FLARE-BOT-0` to `-11`): at least 10 hit (12 seen). After 12 calm rounds: at least 2 safe and 2 hit (5 and 7 seen). A quiet round: `flare` is null.
- New `the explorer reports its time outside on the round's clock (for the run length): on foot its suit pays that and the devils' toll`: FARM-1 (quiet) and FARM-2 (a dust-devil round): `time` above 60 and `seconds = time × (1 + toll)` to 1e-6, the toll being `DEVIL_HITS.quiet` or `.round` × `D.DANGERS.devils.suit`.
- New `the explorer counts only what the rules banked: a refused delivery brings nothing home`: with `X.deliver` stubbed to `{ error: 'notAtBase' }`, `loads` is 0 and the backpack still holds what it carried.
- Changed `in the rover the battery caps the haul, and it never grows`: FARM-5 and FARM-6 with the rover kit; at most 30 loads a round and more than 15 in some round (so it drove); rounds 16-20 at most 0.75 × rounds 1-5.
- New `as it walks, the explorer explores what a player would see and visits the regions it walks into, as the surface does`: FARM-1, one round, no `poi`: the HQ's region is visited, regions are valid names with no repeats; more than 4 chunks revealed, each key valid (`F.KEY`) with a bit set; every site it touched lies in a chunk it explored.
- New `played thoughtfully, the explorer goes after the round's goal when it can get there and back; a careless one only meets it by chance`: kinds `survey`, `landmark`, `structure` and `chunks`, on up to 8 seeds each (`GOAL-BOT-0` to `-29` where `G.offered` has the kind), round 5, one goal made by `G.make` (id `G4:0`), played with `poi` and without. Per kind at least 5 seeds tried; thoughtful met at least 3 and more than careless; over all kinds thoughtful met at least 70 %. Not `region`: the base's plains reach 84 tiles or more out on every seed.
- New `a balance mission that explores has goals picked each round and paid through the real advance; one that stays home has none`: `B.play('reference', B.smartPlan, seed, true, null, 'commander')` on `GOALS-BAL-1` and `-2`: `s.turn` is `D.TURNS` at the end; at least 4 goals are paid over both, `chunks` or `region` among them; the same seeds played at home have `goalsDone` equal to `[]`.
- New `played thoughtfully, the explorer has beacon kits built, takes one out a round, places it and refills its suit there; its haul per round stays capped by its suits and levels off`: `BEACON-BOT-1` and `-2` on commander, `G.pick` then `G.advance(s, B.smartPlan(s, true))`. Each round at most 15 loads on each suit it had (1 + its refills). At least 3 kits built and 3 beacons placed, each at least `D.EXPEDITION.beacon.base` from the HQ and `by: 'diego'`; at least as many refills at beacons (ids `B…`) as beacons; the same seed played at home builds no kit (`kits` 0). Loads in rounds 11-20 at most 1.25 × rounds 1-10 (136 against 135 seen). A mutant that stops counting refills fails it.
- Changed `played thoughtfully, the explorer also uses the points of interest near the base, and on foot a hab pod lets it haul more`: now over FARM-1, FARM-3 and FARM-16, so one lost event doesn't fail it: structures used at least 4 in all (6 seen) and landmarks at least 2 (3 seen). Before, two seeds each had to use at least 1 structure, and 1 landmark in all was enough. Per seed the careless run leaves them, the thoughtful one collects a site, refills at least 5 times and hauls more; BAL-2's comms mast is still left.

`test/engine.test.js` (2 new, 3 changed):
- New `science from the map counts a share of itself, up to a cap, beside the base's science in full: an S grade stays special (spec §13.12)`: it reads `M = D.SCORE.map` (0 < share < 1, cap > 0) and sets `science` and `expedition.science` on a calm mission. 800 with no map science counts 800; 800 with 200 counts `round(600 + min(cap, 200 × share))`; 3,000 with 2,400 counts `600 + cap`; 800 with 5,000 (more than the science: a hand-edited save) counts `round(min(cap, 800 × share))`; 800 with −50 counts 800; a lost mission is the same sum × `D.SCORE.abortScience`; with no `expedition` (still a lost mission) it is `800 × abortScience`, all of it the base's.
- New `the science banked from the map, a goal's too, is tallied for the score as it is banked; a save from before M4d's rebalance has none`: a banked 35-science find and a done goal paying 15 give a forecast `got.science` of 50 and leave `expedition.science` at 0; the advance makes it 50; the next adds nothing; a save without the field, or with `'lots'`, repairs to 0 through `E.upgradeMission(m, {})`.
- Changed `a new mission has an empty exploring state and, in solo play, the player's astronaut`: the sorted key list gains `science` (after `roverDriven`, before `sites`) beside Task 4's `bestFind`, and `expedition.science` is 0.
- Changed `the last round's backpack is banked at the final advance, so it counts for the score and the report (M4d)`: the 35-science find in the last backpack adds 35 to `expedition.science`, and to the score only its map share, `round(a.science + min(cap, 35 × share)) − round(a.science)`, which is above 0 (it used to be the full 35).
- Changed `an O₂ canister carried home offsets an oxygen leak: the decision card is unchanged and its kg count first`: title and message only (they said "30 kg"); the amount already came from `D.EXPEDITION.canister.o2`.

`test/ui.test.js` (2 changed):
- `the Expedition panel lists what waits outside, in order: the solar flare as it stands, dust devils, a dust storm, an O₂ leak`: the O₂-leak line is built from `D.EXPEDITION.canister.o2`, not a typed 30.
- `the Science note of a mission the explorer bot really played lists the landmark, formations and structures it used and the hab pods it visited, from the shapes the rules write`: the wanted list starts with `x.regions.map(id => 'region.' + id)`, since the bot now visits regions as a player does and the note rightly lists them ("Plains"). This line is the merge's, not the branch's.

Before the code: in `test/engine.test.js` the score test, the key-list test, the last-round test and the tally test should fail (no `D.SCORE.map`, no `expedition.science`). The canister test and both `test/ui.test.js` tests should pass, because they read the data and the old bot visits no region; they guard the change. `test/explorer.test.js` requires `tools/balance.js` at module level (`:177`), and until this task's code that file runs its whole measurement (1,000 missions a row, three levels) the moment it is required, so Step 2 leaves the explorer file out. After the code it loads at once, and Step 4 runs it.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/engine.test.js test/ui.test.js` (not `test/explorer.test.js` yet: see the note in Step 1)
Expected: 4 of 137 fail, all in `engine`.
- The score's map term (`undefined` reading `share`: no `D.SCORE.map`), the new mission's key list (no `science`), the last round's backpack (its science isn't counted as the map's), and the science tally.
- The canister test and both `ui` tests pass already: they read the data, and the old bot visits no region, so they guard the change.

- [ ] **Step 3: Write the bot's play, the two levers and the map-science tally**

Apply the dry run's code: `git diff 0f5192d c8ff6bd -- . ':(exclude)test' | git apply`.

What it must provide (the reviewers check each line against the code):
- **Data.** `D.SCORE.map = { share: 0.1, cap: 55 }` (`src/data.js:234`, comment `:230-233`) and `D.EXPEDITION.canister = { suit: 45, o2: 10 }` (`:248`, comment `:245-247`). `supply` (`src/expedition.js:203`, the canister item of a pod or cache load) and the Expedition panel's O₂-leak line (`src/ui.js:957`) already read `canister.o2`; a canister already in a saved pack or drop keeps the amount it was made with.
- **State.** `newExpedition()` gives `science: 0` (`src/engine.js:258`) beside `bestFind: null`, with a state note (`:245-246`). `applyExpedition` (`:1017`) adds `got.science` to `x.science` on the line after `s.science += got.science` (`:1035`) and nothing else writes it; the forecast runs it on a copy, so the forecast changes nothing. An old save has no `science`: the generic loop of `repairExpedition` (`:281-289`) gives it 0, so all its science counts as the base's. A negative or too-big number passes the repair and `scoreMission` clamps it.
- **Score** (`:1223-1250`). `map = min(s.science, max(0, Number(expedition.science) || 0))`, `science = s.science − map + min(cap, map × share)`, `parts.science = round(success ? science : science × D.SCORE.abortScience)` (`:1229-1233`). No `expedition` means `map = 0`: all the base's, as in 3.2.0. The bands, the other parts and `E.achievements` are untouched.
- **The bot's honesty** (`tools/explorer.js`). `home()` (`:225-231`) counts what `X.deliver` banked and stops on a refusal. Every other rule's result is checked, and a refused action ends the round's loop; a refused `X.placeBeacon` leaves the kit in the pack. `Z.slackOf(m)` is the slack at both `Z.flareEnd` calls (`:131`, `:272`).
- **Seeing and visiting** (`see`, `walkSees`, `:89-109`). At the HQ (`:140`) and along every leg (`go`, `:137`), each chunk within `view` gets a fog bit and the region under the walker is visited, for every explorer, `poi` or not. The fog is capped at 4,096 chunks, as `src/ui.js:847` caps it.
- **Goals, with `poi`** (`refreshGoals`, `:163-193`). A goal's target counts as `PULL` of its distance (`:236`); a target it can't reach and get home from waits for a refill (`:243`); `G.update` judges the goals again after it acts on one (`:266`). Targets: a science site at least `tiles` out (survey), a landmark, a structure to repair or salvage (a comms mast too), the nearest spot in a region not yet visited, the nearest unexplored chunk. A haul is met by hauling and a beacon by placing.
- **Kits and beacons, with `poi`.** A waiting kit is taken out at the round's start while fewer than `beacon.max` are placed (`:160`). `placeHere` (`:215-223`) places it on the first open ground (`X.beaconSpot`) at least `PLACE` tiles out, or as far as an open beacon goal asks, and only when it can still get home after the hold. It refills at beacons as at pods (`podFor`, `:204-212`).
- **The plan** (`tools/balance.js:39-58`). Without `explore`, `smartPlan` gives the plan it gave before. With it the engineer builds `{ type: 'kit' }` while the kits made (placed, waiting, carried and being built) are fewer than `min(D.EXPEDITION.beacon.max, shields built + 1)`, only with `D.BUILDS.kit.materials + D.REPAIR_MATERIALS` (150 kg) in store and nothing broken, and finishes a kit it began; otherwise the shield and maintenance branches run as before. `play` (`:122-141`) and `run` (`:143-188`) are as under Interfaces.

The values were set to reach these, measured on the dry run at `8c72ac8` (1,000 missions a cell, seeds `BAL-0` to `BAL-999`; `npm test` runs none of them):
- Veteran, sloppy crew: exploring takes success from 66.8 % to 88.8 % (+22.0; the band is 10-25).
- Careless + explorer: cadet 26.8 %, commander 7.6 %, veteran 0.9 % (under 35 %). Thoughtful + explorer: 100.0 % on all three (over 70 %). Sloppy rover kit with exploring: 15.0 → 91.0 %, its large gain kept.
- Commander, S per 1,000: thoughtful explorers 292 (a quarter to a third), sloppy explorers 37 (under 10 %). Without exploring, as in 3.2.0: sloppy 64, thoughtful 84.
- Minutes outside a mission (commander): sloppy explorer 36.7, thoughtful 100.6.

Keep:
- **Why 10 kg (D1).** Zeroing everything the explorer banks gave 66.8 %, so all of exploring's gain on veteran is the haul, and zeroing one resource at a time showed only O₂ matters. A veteran-only cut to the kg of ice and metal changed nothing (×0.3: 96.8 %). 6 kg gives +19.0 and 15 kg +25.8, over the band. One value for every level; it only moves the rows where O₂ binds (careless cadet 31.1 → 26.8 %).
- **Why the map's science is tallied apart (D2).** No score of the form "the rest + g(all the science)" meets §13.12: the thoughtful explorer has more of everything than the sloppy players who earn an S without exploring, so any g that takes its S takes theirs. A search over cap, factor and bands found 2,521 settings that met the explorer targets, and every one took the no-exploring S (84 and 64 per 1,000) to 0. `cap` is the dial (about 7 S per 1,000 a point); `share` hardly moves an S count.
- **The careless and sloppy explorers chase no goal and carry no kit (D3).** They model players who don't plan; their plans build no kit, and goals they don't read are met by chance (1.4-1.6 a mission). `haulRound`'s third argument is the one switch.
- **Goals only when the mission explores (D6, R11).** A mission that stays home can't meet one, and its rows stay the 3.2.0 baseline to the cell.
- **Every explorer sees and visits as the game does (D7).** The `chunks` and `region` goals and the Science note's regions read `x.revealed` and `x.regions`, which only the surface fills. `see` marks one bit a chunk, not the disc; its `ponytail:` note says when to change that.
- **No survey reach of its own (D8):** the bot meets 87 % of the survey goals it is offered, and R12 leaves reach to the playtest. **`FOOT` has no commander aura (D13):** the balance crews have four people.
- **The Explorer badge keeps the full number:** `E.achievements` reads `s.science >= 800` (`src/engine.js:1268`), the HUD's number. Only the score's Science row counts the map's less. `lib/history.js:63` re-scores with the same `scoreMission`.
- **No run-length lever (R20).** A sloppy explorer on one suit a round (about 110 s of the 150 s used) is already about 37 minutes outside over the spec's fixed 20 rounds, and refills at beacons and pods are §3.8's intended progression. The bot's estimate is T = 20 × p + time outside, with p the planning time a round (30-60 s, the spec's own assumption): 47-57 minutes for one suit a round and 111-121 for full exploring, against §1.6's "about 30-40". `haulRound` only reports `time`; Task 9 amends §1.6.
- **`D.SCIENCE.eva` stays 20 (R21).** The rover kit's S grades with exploring (954 and 549 per 1,000) come from the base's EVA science, which predates M4d. Lowering it would move the rover kit's no-exploring grades, which §13.12 keeps. It goes in the plan's follow-ups under "For the user to decide".
- **The plateau is read per suit (R23, D9).** With beacons and pods a round has 1 + refills charges, so the thoughtful explorer's haul per round stays flat (about 7.5 loads; rounds 16-20 bring 0.87-0.90 of rounds 1-5) while its loads per charge fall from about 7.7 to 2.6. That flat haul is §3.8's intended growth in reach. The test pins what §1.4 names: at most 15 loads per charge and rounds 11-20 within 1.25 × rounds 1-10. Don't tighten it into a fall per round.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/engine.test.js test/ui.test.js test/explorer.test.js`, then `npm test`
Expected: all pass; `npm test` 610/610.

- [ ] **Step 5: Commit**

```bash
git add src/data.js src/engine.js tools/balance.js tools/explorer.js test/engine.test.js test/explorer.test.js test/ui.test.js
git commit -m "feat(balance): the explorer bot plays M4d's goals and beacons, a carried O₂ canister brings 10 kg home, and the map's science counts a tenth of itself up to 55 points" -m "Spec §13.12 wants exploring to add 10-25 points of success for a sloppy veteran crew and an S grade to stay special. Played by a bot that uses M4d's goals and beacons, a 10 kg canister and a tenth of the map's science up to 55 points meet both." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Review notes:**
- **Not to reopen:** D1 and D2 with their evidence (Keep), R11, R20, R21 and R23. The sloppy explorer's modesty (D3) is part of why the sloppy veteran's gain is +22.0 and not more.
- **Look hardest at:**
  - (1) The score term, which re-scores saves: the clamp (a negative, a string, more than the science, no `expedition`), the success and the lost branch both asserted, and `E.achievements` untouched.
  - (2) That `x.science` has one writer, after a goal's reward and the last backpack are in the bank (the final-advance test: the find counts, the kit doesn't).
  - (3) That the bot uses only the real rules and counts only what `X.deliver` banked (the refused-delivery test fails without that: 3 loads reported, 0 banked).
  - (4) `smartPlan`'s if/else chain: with `explore` falsy the shield and maintenance branches must give the plan they gave before. The "played at home builds no kit" asserts and the unchanged no-exploring rows are the evidence.
  - (5) The tightened tests. The plateau tests now want a real fall (0.7, 0.75), the flare test both verdicts. Their bounds have room (see Step 1). If one fails on the real tree and not on the dry run's, look for what differs between the trees before touching a bound.
  - (6) The files are UTF-8 (`₂` in a data comment and a test title).
- **Not checkable here:** the balance tables. They were measured at `8c72ac8`; `46143f8` only adds a test, and the code merged since (Tasks 4, 5 and 6) changes the rules only by records that no bot decision reads, so every figure should carry. Task 9 re-measures on the release tree (`node tools/balance.js 1000` with `BADGES=1`, one process per level, nothing else running). The careless cadet row is 26.8 % on the balance seeds and 29.4 % on 1,000 other seeds: under 35 % either way, but a later change that helps a careless crew by 5 points puts it over on other seeds.
- **Handed on, not this task (R24, R25, R20, R23):**
  - The debrief's hint under the score table is Task 8's (R24). Until then a thorough commander explorer sees about 2,700 science in the HUD and a Science row of about +630, with no word why. That is known.
  - Task 8 also rewords what the dry run left stale (R25), and this task leaves them: the header of `tools/explorer.js` (`:2-19`; no goals, beacons or regions, and masts "left" at `:14` though a structure goal visits them), the "30 kg" in the comment at `src/expedition.js:286` and in the assert message at `test/surface-eva.test.js:483`.
  - Task 9 words the spec (R20, R23, R25): `expedition.science` in §4, `D.SCORE.map` in §1.4, line 164's "+30 kg" to "+10 kg", §1.6's measured lengths (no exploring 10-20 minutes; one suit a round about 45-60; full exploring about 2 hours over several sittings), and the per-suit plateau where §1.4 states it.
- **For the plan's follow-ups (R25; found here, not fixed here), at `c8ff6bd`:**
  - A failed `X.collect` ends the round's loop after the leg's suit and battery were charged (`tools/explorer.js:256`; the same shape at `:247`, `:260`, `:264`): slightly pessimistic.
  - `known` and `knownPoi` are keyed by the seed alone and cleared at 64 entries (`:39-50`, `:54-80`): right while finds, structures and regions depend on the seed alone.
  - The careless rover-kit row runs the 26 t `naive` loadout where the other rover rows use `roverKit`, and explore runs set `pilot: 'diego'` where plain runs don't (`tools/balance.js:202`, `:124`): that row is 0.1-0.2 % either way.
  - `DEVIL_HITS` has no tool to measure it again, and hold seconds are charged the walking rate (`tools/explorer.js:33-35`, `:118`, `:124`).
  - A load left at a structure's door is re-queued only within its round, though the header (`:11-14`) reads broader (`:262-263`): pessimistic the same way at both ends.
  - A pod trip can run before the round's first `Z.flareStart` (`:244-250` before `:252`): 0 of 1,200 rounds at M4c, **not re-measured with beacons as refill stops**; it can only start the warning late. Re-measure this one first.
  - Test fixtures that build a canister with `amount: 30` (`test/expedition.test.js:203`, `test/rooms.test.js:533`, `test/surface-eva.test.js:480` and `:498`) are valid items and pass; they may read the data later.

---

### Task 8: What the browser pass found

The dry run's browser pass (`.superpowers/sdd/m4d/qa-report.md`) played every M4d feature in Chrome: solo and co-op, English and Vietnamese, desktop and phone. This task fixes what it found:
- in solo, the console's Expedition panel lagged behind the HUD;
- a refused refill said nothing;
- the HUD's new notes ran too long for their 210 px column;
- the Science note was too long to read;
- the HQ menu wrote "1.5" in Vietnamese, and so did the surface's other numbers;
- a carried kit showed as the key "haul.kit";
- the HUD column, made taller by the goals, covered the top of every card;
- a goal's kit reward could make a 7th kit that could never be placed;
- the route home could lead away from home.

It also takes the small fixes the planning found:
- the debrief explains the score's Science row (R24);
- two stale comments (R25);
- a save repair;
- "1 tiles";
- two Review Focus tests.

**Dry-run code:** `c8ff6bd..e79d28f` (17 commits, branch `m4d-dry-fix`; `m4d-dryrun` is fast-forwarded to it). Full suite 610 → 628.

**Files** (line numbers are at `c8ff6bd`):
- Modify: `src/ui.js`:
  - `goalList`, `goalsKey` and `followGoals` beside `expeditionPanel` (`:960`); the HUD's `goals` hook goes through `followGoals`;
  - `foundNote` (`:788-797`) builds `<details>`;
  - a hint under the score table (`:1686-1689`);
  - `tilesText(n)` for the walked column (`:1597`).
- Modify: `src/surface-eva.js`:
  - the beacon and pod refill block (`:453-475`) with a `told` list, reset in `sync` and `reset()`;
  - `eva.placed` without `n` (`:513`);
  - the delivery note without a kit line (`:484`);
  - the rover battery's singular (`:275`);
  - `secs` (`:100`) in the player's language;
  - the route home's comment (`:729`).
- Modify: `src/surface.js` — `nf(v, d)` and `cost(spec)` beside `t` (`:236`). They're used by:
  - the build grid (`:981`), the HQ's shield layer (`:1030`) and its kit (`:1036`);
  - a build's progress (`:1002`);
  - the solar and reactor notes (`:1060`, `:1062`).
- Modify: `src/engine.js` — `E.scoreMission` (`:1229-1249`) returns `map`; `repairStats` (`:267-273`); `isMap` moves to module level; `payGoals` (`:1070-1080`) caps a kit reward.
- Modify: `src/expedition.js` — `routeHome` (`:640-648`) links only nearer home; the canister comment (`:286`).
- Modify: `src/i18n.js` — the keys under Interfaces.
- Modify: `src/style.css`:
  - `.found-list summary` (its marker, hover and `:focus-visible`), `details > p`, `.score-table + .hint`;
  - where a card sits on wide screens (`:501-503`), and the phone's column while a card shows (after `:628`).
- Modify: `tools/explorer.js` (`:2-19`) — its header comment.
- Test:
  - `test/ui.test.js` — 6 new.
  - `test/surface-eva.test.js` — 3 new, 2 changed, and one assertion message.
  - `test/engine.test.js` — 3 new.
  - `test/expedition.test.js` — 3 new.
  - `test/i18n.test.js` — 1 new.
  - `test/surface.test.js` — 2 new; the test page's `page()` takes `opts.lang`.

**Interfaces:**
- Consumes:
  - From Task 2: `G.update(m)`, and `x.goals` as `[{ id, kind, params, need, base, progress, done, reward }]`.
  - From Task 4: `expeditionPanel`, `foundNote`, the debrief's score table, `surfaceHooks.goals()` → `[{ text, done, frac }]`, and `nf(n, d)`.
  - From Task 5:
    - the surface's refill block (`X.refill` by a beacon's or a pod's id; `'refill'` is a quiet answer);
    - `say(text, cls, s)` (one note at a time);
    - the kit buttons `sf-kit` and `sf-kitback`.
  - From Task 7: `D.SCORE.map = { share: 0.1, cap: 55 }` and `x.science`.
- Produces:
  - `E.scoreMission(s)` → `{ total, parts, grade, independence, map: { found, counted } }`:
    - `map` is new: `found = min(s.science, max(0, Number(s.expedition.science) || 0))`, or 0 without an expedition. `counted = min(D.SCORE.map.cap, found × D.SCORE.map.share)`, unrounded and before a lost mission's halving.
    - Nothing else changes. `lib/history.js`, `tools/balance.js` and `E.achievements` ignore `map`.
  - Keys:
    - added in English and Vietnamese: `eva.refillUsed` (`{name}`), `eva.refillUsedPod`, `sc.mapHint` (`{pct} {cap} {found} {counted}`), `eva.tiles1`, `haul.kit` (`{n}`);
    - changed: `eva.placed` (`{name} {r}`, no `{n}`) and `eva.tookKit` (`{n}`);
    - removed: `eva.kitStays`.
  - `X.routeHome(m)` keeps its shape, `[{ from, to, x0, y0, x1, y1 }]`. Only its rule changes (R35).
  - A paid goal in `report.expedition.goals` holds `reward.materials` in place of `reward.kits` when the limit cuts the kit (R34).
  - No new mission-state field and no hook signature change.

- [ ] **Step 1: Write the failing tests**

Apply the dry run's tests from the repo root: `git diff c8ff6bd e79d28f -- test | git apply`.

`test/ui.test.js` (6 new):
- `the Expedition panel names a beacon kit in a backpack as it names a load, never by its key`: with a kit and 40 kg of metal in Minh's pack, the panel reads `haul.kit` with `{ n: 1 }`, then `haul.materials` with `{ n: 40 }`, and never the text `haul.kit`.
- `solo: the Expedition panel's goals follow progress that comes with no action, new ground in the fog or a region walked into, at the HUD's next look, and are redrawn only when it moved`:
  - after a reveal and one call of the HUD's `goals()`, the panel shows the new count;
  - a second call with nothing moved redraws nothing.
- `each entry of the found list is a closed <details>: its summary is the card's eyebrow, title and meta, and the fact or log and its source open under it (R29)`:
  - every `<li>` holds one `DETAILS` with no `open`;
  - its `SUMMARY` has the eyebrow, the `<b>` title and the meta;
  - the `<p>` and the `.src` line are inside.
- `under the score table, a mission whose map science counts says it counts a tenth of itself up to 55 points, what it found and what counted; one with none, or a lost one, says nothing (R24)`:
  - the browser pass's mission (science 1,121.5, of which 444 from the map) has the row `Science+722` and one line, `sc.mapHint` with `{ pct: 10, cap: 55, found: 444, counted: 44 }`;
  - 2,135 found gives `found: '2,135', counted: 55`;
  - a mission with no map science, or a lost one, has no line.
- `the debrief's walked column says 1 tile, not 1 tiles, and 2 tiles; Vietnamese has the one word for both`.
- `solo: a goal met in the last round is paid at the final advance, once: the report lists it, goalsDone keeps it, the debrief counts it and its science reaches the score`:
  - a landmark goal met in round 20 is compared with a twin last round that has no goal;
  - +25 science and +25 map science, once;
  - the report lists it;
  - "Goals completed: 1".

`test/surface-eva.test.js` (3 new, 2 changed, 1 message):
- New: `a hold's seconds are written in the player's language: the Engineer's 1.5 in English, 1,5 in Vietnamese, and a whole 3 the same in both (R31)`. On one metal find, the label's `s` is `'1.5'` for Lena (engineer) in English, `'1,5'` in Vietnamese, and `'3'` for Minh (biologist) in Vietnamese.
- New: `a suit low enough for a refill, by a beacon or in a hab pod that has already refilled it this round, is told why nothing comes, the beacon named, once each a round (R27)`:
  - by a used beacon the note is `eva.refillUsed` with `{ name: 'Beacon 1' }`, a `warn`;
  - walking away and back says nothing more;
  - in a used pod the note is `eva.refillUsedPod`;
  - the next round says it again.
- New: `the rover's battery reads 2 tiles, then 1 tile, not 1 tiles`.
- Changed: `a beacon kit stays in the backpack at the base: … and the kit's own button shows it stays (R30)`:
  - the note is `eva.delivered1 {"n":1}` alone;
  - the `sf-kitback` button isn't hidden.
- Changed: `carrying a kit on the map, …; the note names it` — the placed note is `eva.placed` with `{ name, r }`, no `n`.
- Message only: the canister test says 10 kg of O₂, not 30 (R25).

`test/engine.test.js` (3 new):
- `a goal's beacon kit is paid only into the room left under the limit, kits being built counted; one it cuts comes as its materials, and the report says so (R34)`:
  - with 4 beacons placed, 1 kit waiting and 1 being built, a met beacon goal leaves the kits placed, waiting and being built at 6;
  - it pays 50 kg of materials more than a twin round without the goal;
  - the report's reward is `{ materials: 50 }`;
  - with one place left, the reward is the kit itself, `{ kits: 1 }`.
- `the score gives the map's science it found and what of it counted, before a lost mission's halving, for the debrief to explain its Science row (R24)`:
  - with 444 of 1,121.5 from the map, `map` is `{ found: 444, counted: 44.4 }` and `parts.science` is `Math.round(1121.5 − 444 + 44.4)`;
  - with 5,000, `map` is `{ found: 1121.5, counted: 55 }`, the same when the mission is lost;
  - with no expedition, `map` is `{ found: 0, counted: 0 }`.
- `a saved stats entry whose finds is no map, or whose structure, landmark or find counts are no numbers, is repaired, so collecting after the load works`:
  - `finds: 5` becomes `{}`, and `X.collect` then works;
  - bad find counts, `structures` and `landmarks` are dropped;
  - a missing `finds` stays missing.

`test/expedition.test.js` (3 new; two for Review Focus line 3):
- `the route home never leads away from home: a beacon links only to an older one nearer the HQ than itself (R35)`:
  - the browser pass's chain B0 (12,0), B1 (46,0), B2 (32,0) links `B0>base`, `B1>B0`, `B2>B0` (not B2 to B1);
  - with three more beacons placed, every link ends nearer the HQ than it starts.
- `solo: a kit carried by an astronaut who collapses is in the drop with the load; one more can be built, the next advance leaves the drop, and the kit picked up is placed, until the 6th`.
- `a kit in a drop that newer drops push out (maxDrops) goes with it: accepted, since a dropped kit no longer counted`.

`test/i18n.test.js` (1 new):
- `the surface's new HUD notes fit its 210 px column, their placeholders filled: two lines in English, three in Vietnamese (R28)`:
  - greedy word wrap at 28 characters a line (`linesAt28`);
  - `eva.placed`, `eva.tookKit`, `eva.refillUsed` and `eva.refillUsedPod` with their placeholders filled take ≤ 2 lines in English and ≤ 3 in Vietnamese;
  - `eva.placed` keeps `{r}` and `eva.tookKit` keeps `{n}`.

`test/surface.test.js` (2 new), each on `page(m, 'minh', { lang: 'vi' })`:
- `in Vietnamese the surface's build menus write a cost's numbers as the console does: 1,5 công, not 1.5 (R31)`:
  - the HQ menu's kit line is `bld.cost` with `{ kg: '50', w: '1,5' }`;
  - its shield line is `{ kg: '100', w: '1' }`;
  - the build grid's battery on an empty spot is `{ kg: '200', w: '0,5' }`.
- `in Vietnamese the surface's menus write a build's progress and a module's power as the console does: 0,5 / 1,5 and +13,0 kW (R31)`:
  - a workshop at 0.5 of 1.5 work reads `bld.progress` with `{ p: '0,5', w: '1,5' }`;
  - the solar array's note matches `/^\+\d+,\d kW · /`;
  - the reactor's note matches `/^\+\d+,\d kW$/`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/engine.test.js test/expedition.test.js test/i18n.test.js test/surface-eva.test.js test/surface.test.js test/ui.test.js`
Expected: 17 of 316 fail.
- engine:
  - R24's `scoreMission(…).map` is undefined;
  - the stats repair throws `TypeError: Cannot create property 'pod' on number '5'`;
  - R34 finds 7 kits ("never a 7th kit").
- expedition: R35's chain links `B2>B1`.
- i18n: `en eva.placed, 5 lines: …`.
- surface-eva:
  - the battery reads `'1 tiles'`;
  - the delivery note still ends in `eva.kitStays`;
  - the placed note still passes `n`;
  - R27's note is `eva.low`;
  - the Engineer's hold reads `'1.5'` in Vietnamese.
- surface: the kit line reads `50 kg · 1.5 công`; the build in progress reads `0.5 / 1.5 công`.
- ui:
  - the backpack line reads `Minh Tran: haul.kit, +40 kg materials`;
  - the panel still reads `0 / 4` after the reveal;
  - `'1 tiles'`;
  - no line under the score table;
  - the found list's `<li>` children are `SPAN, B, P, DIV`, not `DETAILS`.
- The three Review Focus tests pass already (the last-round goal, the kit in a collapse drop, the kit pushed out with its drop). They guard the dry run's rules; they don't drive code.

- [ ] **Step 3: Fix what the browser pass found**

Apply the dry run's code: `git diff c8ff6bd e79d28f -- . ':(exclude)test' | git apply`.

What it must provide (the reviewers check each line against the code):
1. **The panel follows the HUD.** In solo, progress that comes with no action reaches the console's Expedition panel at the HUD's next look, twice a second. That means new fog for an "explore" goal, or a region walked into.
   - The `goals` hook passes its list through `followGoals`.
   - `followGoals` redraws the panel's `<ul class="replist goals">` in place (`replaceChildren`) when any goal's id, progress or done flag differs from what the panel shows (`goalsKey`). Otherwise it does nothing.
   - In co-op it finds nothing to do: the server sends a frame when fog moves an open goal, and every frame re-renders the panel.
2. **A used refill says so (R27).**
   - With a suit low enough for a refill (`suit <= CAN_BELOW`), the beacon block runs even when no unused beacon is in reach.
   - It refills at the first unused beacon in reach.
   - If there is none, the first used beacon in reach, or a used hab pod you stand in, says so once a round, as a `warn` note for 5 s: `eva.refillUsed` with the beacon's name, or `eva.refillUsedPod`.
   - `told` is emptied at a new round or seat (`sync`) and in `reset()`. The refill keeps its throttle (`refillAt`).
3. **The HUD's new notes fit (R28, R30).** English takes at most 2 lines and Vietnamese at most 3 in the 210 px column.
   - `eva.placed` drops the fog part (the map shows it), and the surface stops passing `n`.
   - The delivery note gets no kit line, and `eva.kitStays` goes from both languages. The kit's pack slot and its "Put the beacon kit back" button, shown at the base whenever a kit is carried, already say that it stays.

   | Key | English | Vietnamese |
   |---|---|---|
   | `eva.placed` | `{name} refills each suit once a round within {r} tiles.` | `{name} nạp đầy bộ đồ của mỗi người trong phạm vi {r} ô, mỗi vòng một lần.` |
   | `eva.tookKit` | `Kit packed: place it at least {n} tiles out (hold E).` | `Đã cho bộ trạm vào ba lô: hãy đặt nó cách căn cứ ít nhất {n} ô (giữ E).` |
   | `eva.refillUsed` | `{name} already refilled your suit this round.` | `{name} đã nạp đầy bộ đồ cho bạn trong vòng này rồi.` |
   | `eva.refillUsedPod` | `The hab pod already refilled your suit this round.` | `Khoang sinh hoạt này đã nạp đầy bộ đồ cho bạn trong vòng này rồi.` |
4. **The found list folds (R29).**
   - Each "Found on this mission" entry is a native `<details>`, closed.
   - The `<summary>` holds the card's eyebrow, its title (`<b>`) and its meta. The fact or log (`<p>`) and the source line (`.src`) open under it.
   - CSS:
     - the summary is a grid without the native marker (`list-style: none`, `::-webkit-details-marker` hidden);
     - it draws a round `+` of its own (`::after`), which turns to `−` when open and takes the accent colour on hover;
     - it has a 2 px accent outline on `:focus-visible`.
   - No script. The other notes and the ISRU note don't change.
5. **The Science row explained (R24).**
   - Under the score table, inside the Score panel, a `<p class="hint">` reads `sc.mapHint`.
   - Its values: `pct: Math.round(D.SCORE.map.share * 100)`, `cap: D.SCORE.map.cap`, and `found` and `counted` from `E.scoreMission(s).map` through `nf`.
   - It shows when the mission succeeded and `map.found > 0`.
   - English: "Science from exploring counts {pct} % of itself, up to {cap} points: {found} found, {counted} counted." Vietnamese: "Điểm khoa học từ thám hiểm chỉ được tính {pct} %, tối đa {cap} điểm: tìm được {found}, được tính {counted}."
   - CSS: `.score-table + .hint { margin-top: 8px; }`.
6. **A stats entry with junk is repaired.** In `repairStats`:
   - `finds` that is present and no plain map becomes `{}`;
   - a find count that isn't a finite number ≥ 0 is deleted;
   - `structures` and `landmarks` join the numbers that must be finite and ≥ 0.
   - A missing `finds` stays missing (`statsOf` adds it).
7. **One tile.** A key `eva.tiles1` ("tile" / "ô") is picked the way `eva.delivered1` is. The debrief's walked column picks it through `tilesText(n)` (the number as shown: `nf(n) === '1'`), and the rover's battery from its whole tiles left.
8. **One number format (R31).** Every number the surface writes follows the player's language, as the console's do.
   - `nf(v, d)` in `src/surface.js` mirrors ui.js's: `toLocaleString(S.data.lang === 'vi' ? 'vi-VN' : 'en-US')` with exactly `d` decimals (0 by default).
   - It's used for:
     - the three cost lines, through `cost(spec)` = `t('bld.cost', { kg: nf(materials), w: nf(work, work % 1 ? 1 : 0) })`;
     - a build's progress, `nf(progress, 1)` and `nf(work, 1)`;
     - the solar and reactor notes, `nf(kW, 1)`.
   - The hold prompts' seconds (`secs` in `src/surface-eva.js`) use the player's locale too. M4d's role holds made the first fractional ones (1.5 s, 2.5 s).
9. **Words only (R25).**
   - The header of `tools/explorer.js` says what the bot does now: it sees the fog and visits regions as it walks, refills at hab pods and relay beacons, goes after the round's open goals, and takes out and places kits.
   - The canister comment (`src/expedition.js:286`) says 10 kg.
10. **A carried kit has its haul line.** `haul.kit` is "+{n} relay beacon kit" / "+{n} bộ trạm chuyển tiếp", beside `haul.spares`. Every list that names a backpack's items by `haul.<res>` (the Expedition panel's "In backpacks") then names a kit. The pack slot keeps `mod.kit` as its title.
11. **A card is never under the HUD's column (R33).** CSS only.
    - Wide screens (`min-width: 641px`): `.region-card { top: 208px; left: auto; right: 12px; }`. That's on the right, under the minimap (12–172 px) and the FPS readout (180 px), clear of the left column however tall the round's goals, the kit buttons and the aura make it.
    - Phones (`max-width: 640px`): `.sf-stage:has(.region-card) .sf-eva > :not(.sf-suit, .sf-pack) { display: none; }`. While a card shows, the column keeps its suit and battery rows and the backpack, and the rest comes back when the card closes.
12. **A goal's kit stays under the limit (R34).**
    - In `payGoals`, the room is `D.EXPEDITION.beacon.max − kitsMade(s) − kits being built`, counted as `canBuild` does.
    - A kit reward is paid only into that room. Each kit it cuts comes as `D.BUILDS.kit.materials` (50 kg) of materials.
    - The paid reward that the report and the record read says what was paid.
13. **The route home leads home (R35).** In `X.routeHome`, a beacon links to the nearest of the HQ and the older beacons that are nearer the HQ than itself (a tie goes to the HQ, then to the oldest).

Keep:
- **The panel is redrawn in place from the HUD's hook, not by `render()`.** As `setCard`'s comment explains, a render from the walking loop moves the surface's node into a new stage, which drops a joystick drag on a phone and closes an open crew-job dropdown. The panel is shown only beside the running surface, so the hook sees every way progress moves while it's visible.
- **The pod's note has its own key.** `eva.err.*` stays for refused actions. Each id is told once a round, across walking away and back; a reload tells it once more.
- **`eva.placed` drops "placed" too,** so it fits 2 English lines at 28 characters.
- **No R24 line for a lost mission.** A loss halves all its science, so the line would explain only part of the row. The figures come from `E.scoreMission`, so the line and the row can't disagree.
- **The line test wraps at 28 characters.** The browser pass measured 28–32 a line, and the model gives the pass's own counts at 30. The browser is still the judge (Task 9).
- **A `finds` that isn't a map becomes `{}`,** not deleted.
- **The singular follows the number as shown,** the same in both languages.
- **The Review Focus tests are guards.** A kit in a drop that 40 newer drops push out is lost with it. That's accepted: a dropped kit no longer counts against the limit of 6.
- **No kit line in the delivery note (R30).** It was the eva agent's own fallback ("If wrong: drop the note line"), and the HUD shows the kit twice already. A shorter line still made the note 3–4 English lines.
- **`nf` lives in `surface.js`,** not ui.js's passed in by `update`. The surface already gets `lang`, and the tests' page needs only its language.
- **`haul.kit`, not a kit test at each caller.** One string fixes every list that names a backpack by `haul.<res>`.
- **R33 moves the card on wide screens rather than hiding the column.** On a phone there's no room beside the column, so the lower blocks step aside there. That's the pattern the hint already uses on phones, so no z-index changes: the full map, the HQ menu and the flare banner stay over the card.
- **R34 caps at the payout, not at the goal's pick.** The beacon goal is about placing a beacon, and a kit to place is the condition for offering it (`G` `can`). Kits being built count as made, since construction turns one into the other; this round's queued kit is checked again when it would start (`canBuild` in the build loop).
- **R35 keeps links stable.** A beacon's link still depends only on itself and older beacons, so a new beacon never moves the others' links, and every chain ends at the base, each step nearer.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `node --test test/engine.test.js test/expedition.test.js test/i18n.test.js test/surface-eva.test.js test/surface.test.js test/ui.test.js`, then `npm test`
Expected: all pass, 316/316; `npm test` 628/628.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js src/expedition.js src/i18n.js src/style.css src/surface-eva.js src/surface.js src/ui.js tools/explorer.js test/engine.test.js test/expedition.test.js test/i18n.test.js test/surface-eva.test.js test/surface.test.js test/ui.test.js
git commit -m "fix(m4d): what the browser pass found: the console's goals follow the HUD, a used refill says so, the HUD's notes fit, cards clear the HUD, the found list folds, the Science row is explained" -m "The dry run's browser pass played every M4d feature in Chrome. It found:" -m "- in solo the Expedition panel kept an old count; a low suit by a used beacon heard nothing;
- four HUD notes ran to 4-6 lines in a 210 px column, and the column covered the top of every card;
- the Science note was 1,109 px tall, and the surface wrote 1.5 for 1,5 in Vietnamese;
- a carried kit read 'haul.kit', a goal's kit could be a 7th, and the route home could lead away from home." -m "Also R24's line under the score, R25's comments, a save repair and '1 tiles'." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Review notes:**
- **Not to reopen:** R27–R31, R33–R35, and the decisions under Keep.
- **Look hardest at:**
  1. `followGoals`: it may redraw only the goals' `<ul>`, never call `render()`, and do nothing when nothing moved.
  2. R27's `told`: it's emptied at a new round or seat, and a nearer used beacon doesn't stop a refill at an unused one in reach.
  3. The `<details>` summary: keyboard (Enter or Space opens it), the focus ring, and what a screen reader hears (eyebrow, title and meta as one line).
  4. `E.scoreMission`'s `map` is taken before the halving, while `parts.science` is unchanged.
  5. No number the surface shows a player is left unformatted: a `toFixed` or raw decimal should only remain in CSS widths, colours and the debug box.
  6. R33 has no unit test (no test reads `style.css`). Check it in the browser at 1280 × 720 with two goals and at 412 × 915.
- **Checked in the browser** (the dry run's pass):
  - on `8a2b292`: F-panel-lag, R27 and R28 (EN and VI); R29, R24 and "1 tile" in the debrief; R29 again on the phone;
  - on `e79d28f` (resumes 5 and 5b, 8 PASS):
    - R33 at 1280, 1120, 700 and 641 px wide and on a 412 × 915 phone;
    - F-haul-kit and R30 (EN and VI);
    - R31 in Vietnamese ("1,5 công", "1,5 giây", "0,5 / 1,5 công", "+13,0 kW"; English keeps "1.5");
    - R35 on c2's chain;
    - R34 with 6 kits placed or being built;
    - the console and the server: clean.
  - R33's two phone leftovers are R36's, for M5.

---

### Task 9: QA, docs, version 3.6.0 and the installer

The release. Every M4d feature is checked once more in a real browser on the final code, the balance is measured again on the release tree, the spec says what was built, the deferred items are written down, and 3.6.0 is built, installed and launch-checked. It carries out spec §11's M4d line ("one release, 3.6.0", §13.12) and rulings R20, R23 and R25.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md`:
  - the Status line reads "M1–M3 and M4a–M4d shipped (v3.6.0); M5 to do";
  - §12: tick the five M4d items;
  - §1.4: the haul "must plateau" per suit charge once refills come in; beacons and pods refill once a round each, so the reach per round grows by design, as §3.8 says (R23). The score counts the map's science (finds, sites, landmarks, goals' science) apart, a tenth of it up to 55 points (`D.SCORE.map = { share: 0.1, cap: 55 }`), tallied in `expedition.science` (R25);
  - §1.6: the run length as measured (R20): without exploring 10–20 minutes; with one suit charge a round about 45–60; full exploring with beacons, pods and goals about 2 hours, over several sittings (solo saves at every advance and every 4 s while exploring);
  - §3.2: an O₂ canister carried home gives +10 kg of base O₂ (it was 30; the rebalance's lever for the veteran sloppy target);
  - §3.3: the commander's aura also reaches crew on foot while the commander drives the rover; the driver gets none (R17);
  - §3.9: as built: a haul is 4 loads, a chunks goal 4 new chunks, goals are looked for within 150 tiles, and a structure goal takes a wreck, a solar array, a weather station or a comms mast (not a supply cache or a hab pod);
  - §4: the state as built: `goalsDone: [{ id, kind, round, params }]`, `science` (the map's science, for the score), `bestFind`, and `stats[crewId]` with `distance` **in tiles** (R14), `pods`, `flareHit` and `flareCover`; the API: `takeKit`, `returnKit`, `beaconSpot`, `placeBeacon`, `routeHome`, `refill(m, crewId, id, pos)` with a beacon's or a pod's id (drop "beacons join in M4d"), `holdSeconds`, `commanderOut`, `speedFactor`, `addDistance`; and `goalProgress(m)` becomes `src/goals.js`'s `G.update(m)`, beside `G.pick` and `G.advance` (R12);
  - §5: pings are their own frame, server to client `{ t: 'ping', d: { x, y, by } }`, not an `event` (R13); take `ping (x, y, from)` out of the `event` row;
  - §8.3: the history record's `distance: { crewId: m }` becomes `{ crewId: tiles }` (R14), and its "Fields before M4 hold `{}` or 0" now applies only to records written before 3.6.0;
  - spec line 164 (the canister in §3.2's text) and any other "30 kg" for a canister: 10 kg;
  - §13.12 gains "Decided after the dry run's measurements (2026-11-02)": the canister's 10 kg, the map's science in the score, the run length, and `D.SCIENCE.eva` left at 20 for the user to decide (R21).
- Create: `docs/superpowers/plans/2026-11-02-sol500-m4d-followups.md`.
- Modify: `sw.js` — the cache name `sol500-v4` → `sol500-v5`, as M4b did when it added a module (`81bd2ac`), so an installed copy drops the old shell at once; `test/sw.test.js` — its pin `/const CACHE = 'sol500-v5'/`.
- Modify: `package.json` and `package-lock.json` (`"version": "3.6.0"`).
- Rebuild: `dist/` (`node tools/build.js`, committed), `dist-app/` (git-ignored).

- [ ] **Step 1: Browser QA** (solo and co-op; English and Vietnamese; desktop and phone; offline) on a QA server on port 5071 with a fresh `--data` folder. Use the dry run's tools in `.superpowers/sdd/m4d/qa/` (git-ignored); point `startserver.js`'s `MAIN` at the build's checkout. Save logs and screenshots under `.superpowers/` (git-ignored).
  1. **Every check of the dry run's browser pass** (`.superpowers/sdd/m4d/qa-report.md`'s checks table, 1–18), on the final code. Each FAIL there is fixed by Task 8 and must PASS now.
  2. **A 3.5.0 save.** Make it with `master`'s code (`q1-make-save.js` run against a `git archive master` copy), put it in `localStorage['sol500.save']` and reload. Expected: "Resume" works with no console error; the expedition gains `beacons: []`, `kits: 0`, `goals`, `goalsDone: []` and `science: 0` by repair; the next round has goals; a kit can be built, carried and placed.
  3. **Co-op with three tabs:** a beacon placed in one tab shows in all three, and each player refills there once; a goal met is paid once and every tab shows the same progress; a ping reaches every tab with the sender's name; walked tiles in the debrief roughly match what each tab walked.
  4. **The offline file.** `node tools/build.js`, then open `dist/sol500.html` from disk with the network cut: goals show, and a kit can be placed and a suit refilled at it.
  5. **Performance.** With at least 3 beacons in view, the route home on the minimap and a ping fading: the walk's median fps within a frame of the same build's bare-ground control (the dry run: 128.2 fps with the scene, 129.9 without, on a ~130 Hz display), the debug box's paint median at 2 ms or less. `npm test` takes about as long as before.
- [ ] **Step 2: Balance on the release tree** (R25). With nothing else running, one process per level:
  ```bash
  LEVELS=cadet BADGES=1 node tools/balance.js 1000 > balance-cadet.txt
  LEVELS=commander BADGES=1 node tools/balance.js 1000 > balance-commander.txt
  LEVELS=veteran BADGES=1 node tools/balance.js 1000 > balance-veteran.txt
  ```
  (into the git-ignored `.superpowers/`). Expected: the success, grade and score figures of "Measured in the dry run" below, give or take what Task 8 changed. Each §1.4 and §13.12 target must still pass (veteran sloppy + explorer 10–25 points over 66.8 %; careless + explorer under 35 %; thoughtful + explorer over 70 %; commander S grades: thoughtful explorers 250–333 of 1,000, sloppy explorers under 100; no-exploring grades as in 3.2.0). A target that fails stops the release: report it to the user.
- [ ] **Step 3: Docs**
  - The spec changes listed under **Files**.
  - Write `docs/superpowers/plans/2026-11-02-sol500-m4d-followups.md`: the measured numbers (QA, fps, balance, run length); everything the reviews defer, sorted into M5 and "For the user to decide"; at least the items under "For later plans" below; anything QA finds and doesn't fix; and the checks only the user can do by hand (below).
- [ ] **Step 4: Version and builds**
  1. `npm version 3.6.0 --no-git-tag-version` (sets `package.json` and `package-lock.json`).
  2. The `sw.js` cache name and its test pin, as under **Files**; `npm test` passes.
  3. `node tools/build.js`: commit `dist/`.
  4. `npm run app`: this builds `dist-app/SOL500-Setup-3.6.0.exe`.
  5. `npm run smoke` must report `ok: true` (it runs in an empty profile of its own, never the player's).
  6. Install silently over 3.5.0, the same way as 3.5.0 was installed over 3.4.0; check that the installed `app.asar` matches HEAD with `.superpowers/sdd/qa-tools-m4c/release/compare-asar.js` (fix its hard-coded workspace path first).
  7. Launch check, read-only, with an empty `--user-data-dir`: adapt `.superpowers/sdd/qa-tools-m4c/release/app-launch-check.js` so a solo mission shows the round's goals and the kit's build button, and the admin Project tab lists the M4d items ticked.
  8. Kill leftover `electron.exe` and `cloudflared-*.exe` by PID.
- [ ] **Step 5: Commit** (two commits, as M4c did)

```bash
git add docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md docs/superpowers/plans/2026-11-02-sol500-m4d-followups.md
git commit -m "docs(m4d): the spec says what M4d built and measured, and the follow-ups doc holds what waits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add sw.js test/sw.test.js package.json package-lock.json dist/
git commit -m "chore: M4d complete (relay beacons, expedition goals, role skills and pings, the debrief's Expedition section, the final rebalance), version 3.6.0, offline build refreshed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ask before merging.** The final whole-branch review and its fix wave come first. Then offer the user the merge (for M1–M4c they chose "Merge back to master locally"). After the merge, `m4d-dryrun` and the `m4d-dry-*` branches and their worktrees can go, with the user's OK.

**The user must check these by hand** (the sandbox has no internet; carried from M1–M4c, plus M4d's): a share-link game ends with an Online record that has the exploring counts; `https://<link>/admin` gives 404; the Live tab shows the share link and its QR code, and Stop sharing works; the CSV save dialog in the app; a ping and a beacon between two PCs over the share link; on a real phone in co-op, a joystick walk while goals move and cards open (the dry run used Chrome's touch emulation); a native read of the new Vietnamese strings (the glossary at the end of `.superpowers/sdd/m4d/words-report.md`, and the QA's screenshots).

**Review notes:** the spec amendments must match the code as built, not the dry run's reports: check each against the merged tree (`D.GOALS`, `D.SCORE.map`, `D.EXPEDITION.canister`, `D.TEAM`, the `ping` frame in `lib/ws.js`). `npm run app` regenerates the git-ignored `progress.json`; the Project tab reads it, so build after §12 is ticked.

---

## Measured in the dry run

**Tests:**
- 472 at the start; 628 of 628 after Task 8.
- After each task: 488, 507, 536, 572, 598, 602, 610, 628.

**Balance.**
- Run with `node tools/balance.js 1000`, `BADGES=1`, one process per level. Each cell is the same 1,000 missions before and after (seeds `BAL-0` to `BAL-999`).
- "Before" is `1766f20`: M4c's rules, plus M4d's records. "After" is `8c72ac8`, whose rules are `c8ff6bd`'s.
- Only the thoughtful explorer chases goals and builds, carries and places beacons.

| Bot | Cadet | Commander | Veteran |
|---|---|---|---|
| Careless | 24.7 % | 3.3 % | 0.0 % |
| Careless + explorer | **31.1 → 26.8 %** | **9.7 → 7.6 %** | **1.2 → 0.9 %** |
| Sloppy | 100.0 % | 98.1 % | 66.8 % |
| Sloppy + explorer | 100.0 % | 100.0 % | **96.9 → 88.8 %** |
| Thoughtful | 100.0 % | 99.9 % | 99.7 % |
| Thoughtful + explorer | 100.0 % | 100.0 % | 99.9 → 100.0 % |

- **The targets** (spec §1.4, §1.6, §13.12): 10 of 11 pass.
  - Veteran, sloppy: exploring adds 22.0 points (10–25 wanted; it added 30.1 before).
  - Careless + explorer is at most 26.8 % (under 35 wanted).
  - Thoughtful + explorer is 100 % (over 70 wanted).
  - Commander S grades: 292 of 1,000 thoughtful explorers (a quarter to a third wanted; 999 before) and 37 of 1,000 sloppy ones (under 100 wanted; 800 before).
  - Every mission played without exploring keeps its 3.2.0 grades exactly.
  - The haul plateaus per suit charge (R23).
  - The one that fails: §1.6's run length with full exploring (R20).
- **Score:**
  - Commander, thoughtful + explorer: 2,151 → 1,371. Its science is 1,397 → 2,708, and the score counts at most 55 points of the map's part.
  - Commander, sloppy + explorer: 1,578 → 1,252.
- **Goals and beacons** (commander, thoughtful + explorer): 22.4 goals met and 5.7 beacons placed a mission. Share of goals met, of those offered: survey 87 %, beacon 98 %, chunks 57 %, structure 54 %, haul 51 %, region 42 %, landmark 39 %.
- **The run length** (commander, with 30–60 s of planning a round): no exploring, 10–20 minutes; one suit a round, 47–57; full exploring with beacons, pods and goals, 111–121 (R20).
- **The rover kit** (R21): with the explorer, 954 of 1,000 thoughtful players and 549 of 1,000 sloppy ones get an S. The rover's EVA science (`D.SCIENCE.eva` = 20, unchanged since 3.2.0) carries those grades.

**Frame rate.** Setup: Best, 1280 × 720, a 7-tile walk timed with `requestAnimationFrame`, 3 runs each of the scene and a bare-ground control, alternated. The poller was clean throughout: 114 samples, 0 busy.
- The scene: 6 beacons on the minimap with their 6 route links, 1-2 beacons on the ground view, and a ping fading.
  - Median 128.2 fps (all three runs), p1 114.9, slowest frame 9.3 ms, no frame over 20 ms.
- The control, with no beacon within 98 tiles: median 129.9, p1 116.3, slowest 9.0 ms.
- The painter's median is 0.30 ms in both.
- The display runs at about 130 Hz, and the scene's cost is one 0.1 ms step of the median frame (7.8 against 7.7 ms).

**Browser** (the dry run's checks, `.superpowers/sdd/m4d/qa-report.md`): **19 PASS, 0 FAIL**. The checks:
- the beacon kit from start to finish, and delivering with a kit in the pack;
- pings, role hold times (each within 9–24 ms of its rule) and goals;
- the card hold, the flare and the debrief;
- text fit in English and Vietnamese;
- in co-op, pings and the commander's aura (166 against 150 px/s), beacons with the 6-beacon limit across three tabs, and goals and walked distance computed by the server (equal to each tab's walks to 0.01 tile);
- a 3.5.0 save resumed and repaired;
- a phone;
- the frame rate;
- the offline file;
- the console and the server: no page exception, no error or warning from the game, server stderr empty.

Resume 5 re-checked Task 8's last fixes on `e79d28f`: 8 PASS.

The pass found 10 problems, none Critical. Task 8 fixes 8, each seen fixed in the browser. The two left are Minor and phone-only, and go to M5 (R36).

## For later plans

- **M5:**
  - A kit-aware backpack.
    - `eva.pack` and `eva.full` count a kit as a load: a pack with a kit reads "Backpack: 2 of 3 loads".
    - A pack of kits only reads "Backpack full: bring it back to the base", though delivering it banks nothing.
  - The source labels (`I.SOURCES`) are English in both languages. That design predates M4d.
  - The role facts in `.superpowers/sdd/m4d/sources.md` §C, for a role card in "Choose your astronaut" (R8). The card should also say that the commander comes with the fifth seat: a 4-crew mission has none (`D.CREW_SIZES` is `[4, 5]`), so it has no aura and no route line.
  - Co-op: a commander who drops out keeps granting the aura from his last spot until the round advances.
    - The cause: `room.positions` keeps a disconnected seat's spot.
    - The fix: leave out seats that aren't `connected` before `X.speedFactor` and `X.commanderOut`.
    - On the surface, his route line already fades within 10 s.
  - The M3 fog follow-ups still open (`docs/superpowers/plans/2026-10-02-sol500-m3-followups.md`, lines 27, 29–31, 33, 34 and 36):
    - `flushFog` drops fog sent into a half-open socket. It now costs a co-op team chunks toward a goal: resend on reconnect.
    - The surface's own `mergeFog` has no cap. Scoring reads the capped `revealed`, so this only costs client memory.
    - `regionsSeen` duplicates `expedition.regions`.
    - A solo save with no crew array.
    - `explore()` skips `takeFog` while the astronaut is dead.
    - The map flickers past 512 minis.
    - The view radius against the visible area.
  - Survey reach. At N = 120 (rounds 18–20), a site up to 150 tiles out may need the rover, a pod or a beacon refill. If playtests show it, give `survey` a reach of its own, about 135 tiles.
  - Plurals. A `D.GOALS` change to 1 load, or to 2 or more kits, would need singular or plural keys for `goal.haul`, `goal.chunks` and `goal.kits`.
  - The explorer bot's open items (from the dry run's balance report, Q6). Each matters little for the numbers:
    - a failed `X.collect` ends the leg after its suit and battery were charged (`tools/explorer.js:256`);
    - `known` and `knownPoi` are keyed by the seed alone;
    - the careless rover row runs the `naive` loadout;
    - `DEVIL_HITS` has no tool to measure it again;
    - a load left at a structure's door is re-queued only within its round;
    - a pod trip can start before the round's first `Z.flareStart`. That was 0 of 1,200 rounds at M4c, not measured again with beacons as refill stops.
  - From the browser pass (R32):
    - **The full map's hint on a phone** names keys and clicks ("… click to ping a spot · M or Esc to close"). It wants touch wording, as the surface's `sf.hintTouch` has.
    - **A short teleport counts as walking.** A jump of 10 tiles or less is walked distance (`D.TEAM.walk.jump`, capped at 7 tiles a second since the last position). In play, only a collapse sent home from under 10 tiles out does this.
    - **Co-op actions are judged by the seat's last relayed position** (`lib/rooms.js:481`), so an action sent right after a jump gets a 400 and a retry 1.5 s later. Only QA teleports meet it. It's the trust boundary, so it stays.
  - Older than M4d, seen on the way:
    - Chrome warns about `apple-mobile-web-app-capable` on every load: add `<meta name="mobile-web-app-capable" content="yes">` to `index.html`.
    - The offline file loads Google fonts at run time (`src/ui.js:2170`) and logs 4 errors offline.
    - In co-op, the sticky ready bar (`src/style.css:346`) overlays the side panel: its "0/3 ready" label has no backdrop, and the disabled button is see-through.
  - **The phone layout (R36).** It goes with the sticky header (`.hud`, `src/style.css:229`, older than M4d), which takes 431 of a portrait phone's 915 px and 285 of a sideways phone's 412.
    - **The touch hint is under the HUD's column whenever no card shows** (F-hint-under-column).
      - The hint ("Drag the stick to move · hold » …") shows for up to 14 s each time the surface opens, in the 150 px strip.
      - The column (z-index 3, later in the page) now runs to 193–357 px with the goals.
      - A fix: draw the hint over the column on phones (put it after `.sf-eva` in the overlay, with z-index 3). Or step the column aside while the hint shows, as R33 does for a card, but keep the note that says what is outside this round: it lasts 8 s and comes as the surface opens.
    - **A phone held sideways** (915 × 412, touch; F-landscape-touch).
      - R33's wide rule puts a card over E and sprint, and taps on them do nothing while it's up.
      - The card's head row and its × are under the sticky header.
      - The column covers the stick's centre.
      - A fix: R33's wide rule for a fine pointer only, the column's phone rule for short touch screens too, and a header that doesn't stick on short screens.
- **For the user to decide:**
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
    - Start with the glossary at the end of `.superpowers/sdd/m4d/words-report.md`.
    - Then `bld.kit`, `eva.placed`, `lesson.isruMars.body`, `eva.auraLead` and `goal.rewardHaul`, where the wording was a choice.
    - Then Task 8's changed strings, with the browser pass's screenshots.

## Self-review (done while writing this plan)

- **Spec coverage: the five M4d items (§12) and §13.12.**
  - Relay beacons and the route home: the rules in Task 1, the kit's build button in Task 4, the surface in Task 5, the words in Task 6. R1 (a beacon isn't cover) is in Task 1.
  - Expedition goals: the rules in Task 2, the console and the round report in Task 4, the HUD in Task 5.
  - Pings and role skills: the rules in Task 3, the surface in Task 5.
  - The debrief's Expedition section and the ISRU lesson: Task 4, with the words in Task 6.
  - The final rebalance: Task 7, plus R24's line in Task 8.
  - §13.12:
    - the Take shelter hint: Task 6;
    - the veteran sloppy-bot target and the S grades: Task 7;
    - the last round's backpack: Task 2;
    - the Science note: Task 4, with R29's form in Task 8;
    - pings in solo: Tasks 3 and 5;
    - beacons aren't cover: Task 1;
    - one release: Task 9.
- **Placeholders:** none. Every Step 2 comes from the replay: each task's tests applied without its code to a clean tree, then with it.
- **Type consistency.** These names are used identically everywhere:
  - `X.takeKit`, `X.returnKit`, `X.beaconSpot`, `X.placeBeacon`, `X.routeHome`, `X.refill(m, crewId, id, pos)`, `X.holdSeconds(kind, role)`, `X.commanderOut`, `X.speedFactor`, `X.addDistance`;
  - `G.pick`, `G.offered`, `G.make`, `G.update`, `G.advance`; `E.isKit`, `E.kitItem`;
  - `x.beacons` (`[{ x, y, by, round }]`), `x.kits`, `x.refills[crewId]`, `x.goals`, `x.goalsDone`, `x.science`, `x.bestFind`, `x.stats[crewId]` (`distance`, `pods`, `flareHit`, `flareCover`);
  - the frame `{ t: 'ping', d: { x, y, by } }`;
  - `D.EXPEDITION.beacon`, `D.GOALS`, `D.TEAM`, `D.SCORE.map`.
- **Error strings:** every error code the new actions return (`noKit`, `notAtBase`, `nearBase`, `nearBeacon`, `blocked`, `limit`, `full`, `noBeacon`, `refilled`) has an `eva.err.*` string in both languages. An existing test reads `src/expedition.js` for the codes, so co-op never turns one into "no answer from the server".
- **Review Focus:** each of the five lines has its test in the task that owns the code, and Task 9's browser steps check lines 1, 3 and 5 again.
