# SOL 500 M5: follow-ups for later milestones

M5 (polish, the Quick mission and the Showcase) ships as version 3.7.0. The plan is `docs/superpowers/plans/2026-11-09-sol500-m5-polish-quick-showcase.md` and the design is `docs/superpowers/specs/2026-11-09-sol500-m5-polish-quick-showcase-design.md`. The follow-ups it still owes from earlier milestones are in the M4d, M4c, floor, M3 and M1 follow-ups docs in this folder.

This doc holds everything the task reviews, the final review and the QA deferred, so the build ledger (`.superpowers/sdd/2026-11-09-sol500-m5-polish-quick-showcase/`, git-ignored) isn't needed. Line numbers are those of the reviewed tree `5270e7e` unless a line says otherwise, and they drift: search for the function or string. Every Important and Critical finding was fixed before release; only Minor findings and the user's design calls are here.

## Measured

### Tests
795 of 795 on `5270e7e` (the last code change before the release commit): 668 at 3.6.0, 789 at the end of the feature tasks, 795 after the final review's fixes.

### The Full mission did not move
The final balance (`node tools/balance.js`, 1,000 seeds a level, commander, veteran and cadet) on `5270e7e` is **byte-identical** to 3.6.0's (`aba7f78`) on the same seeds, at all three levels: `diff` of the two outputs is empty. The final whole-branch review (`aba7f78..a03cca4`) checked the same promise another way: 120 Full missions (seed x level x crew x events) played to the end through `G.advance`, with forecast, advise, score, badges, `summarizeLoadout` and `upgradeMission` of a stripped old save, hash identically at `aba7f78` and `a03cca4`, and `LEVELS=commander BADGES=1 node tools/balance.js 200` is byte-identical at both. The fixes after that review (`a03cca4..5270e7e`) touched `referenceKit` only for a Quick mission, and the balance rerun above covers them.

### The Quick mission
`QUICK=1 node tools/balance.js` on `5270e7e`, 1,000 seeds a level, 4 crew, the reference Quick kit (8 rounds, flare in round 3, oxygen cut in round 5). Targets from spec §4: careless + explorer under 35 %; thoughtful + explorer over 70 %; S grades rare for sloppy play.

| Level | Bot | Success | Avg score | S per 1,000 |
|---|---|---|---|---|
| Cadet | Careless | 40.6 % | 913 | 196 |
| Cadet | Sloppy | 90.6 % | 1217 | 56 |
| Cadet | Thoughtful | 100.0 % | 1276 | 66 |
| Cadet | Careless + explorer | 56.2 % | 1064 | 412 |
| Cadet | Sloppy + explorer | 97.2 % | 1334 | 493 |
| Veteran | Careless | 13.9 % | 628 | 0 |
| Veteran | Sloppy | 78.6 % | 1052 | 0 |
| Veteran | Thoughtful | 99.8 % | 1204 | 0 |
| Veteran | Careless + explorer | 24.7 % | 715 | 5 |
| Veteran | Sloppy + explorer | 94.5 % | 1214 | 36 |
| Commander | Careless | 22.1 % | 753 | 51 |
| Commander | Sloppy | 85.2 % | 1160 | 47 |
| Commander | Thoughtful | 100.0 % | 1257 | 44 |
| Commander | Careless + explorer | **35.9 %** | 875 | 170 |
| Commander | Sloppy + explorer | 95.7 % | 1299 | 321 |

The commander kit variants, same seeds: thoughtful on a solar-only base 99.8 % (S 40); thoughtful with a reactor fortress 100.0 % (S 0); the rover-kit rows equal the reference rows above; careless with the naive rover kit (22 t) 0.0 %, all D. The final table has no thoughtful + explorer row; Task 3 measured it (commander, S 308 of 1,000).

**The two misses, and the user's call (2026-11-09, spec line 105: "a target that can't be met goes to the user").** On commander:
- Careless + explorer wins **35.9 %** against a target of under 35. The cadet row (56.2 %) and the veteran row (24.7 %) are the other levels.
- Sloppy + explorer earns S on **321** of 1,000 against a target of rare (under 100), and thoughtful + explorer 308. Sloppy and thoughtful explorers score alike over 8 rounds (median about 1,320), so no S cut separates them.

The user accepted the numbers as they are: the sloppy S target is read as the non-explorer rows (sloppy S **47** of 1,000, under 100), and careless + explorer at 35.9 % counts as met. Nothing was retuned for these.

## Release QA

<<QA>>

## For the user to decide

- **The reference Quick kit's red `water_short` warning.** The reference Quick kit shows a red "Water runs out before sol {end}" on the manifest at every level, true for 169 of the 200 sols; the Full reference kit shows none. Water 1 is what the user accepted in Task 3, and softening a warning to look better would make it less honest, so it stays by ruling. If a judge should not see red on the default kit, the lever is a threshold on the warning or one more water in `D.QUICK.kitChange` (which moves the balance above).
- **5-crew Quick survival has not been re-measured after the o2 fix.** The final review found `D.QUICK.kitChange` overwriting the five-crew +1 o2 (`src/engine.js` `referenceKit`); the fix applies `kitChange` first, so the 5-crew Quick kit has o2 2, one more than the 4-crew kit (a test pins it). The reviewer measured that kit by hand, commander, 200 seeds: careless + explorer 41.5 %, sloppy 90.5 %, sloppy + explorer 97 %, thoughtful 100 %; before the fix 12.5 %, 10.5 %, 61 %. The balance tool plays 4 crew, so these 5-crew figures are not in the table above. Careless + explorer at 41.5 % is over the 35 % target, as at 4 crew.
- **Grades are global across levels.** One band table grades every level, so cadet explorers earn S often in Quick (385 to 493 per 1,000) and veteran almost never (0 to 36). Per-level bands would be a rule change.

## Native Vietnamese read

<<VI>>

## Deferred minors

Each was found in a task review and left, by ruling or because it cannot be seen in play. Search for the name if a line has moved.

### Quick mission and rules
- `buildQuickSchedule` (`src/engine.js:170`) hard-codes the drawn rounds `[3, 5, 6, 7]` instead of deriving them from `D.QUICK.flareTurn` and `D.QUICK.oxygenTurn`.
- The calm-round and no-storm Quick tests cover commander with 4 crew only.
- `schedulePatch` (`src/engine.js:422`) has no key validation; it is for the Showcase's own use.
- The test for `referenceKit`'s Quick kit pins that it fits the budget, not the figures.

### Saves, title and Resume (`src/ui.js`)
- Resume depends on storage alone: with blocked `localStorage`, a mission held in memory gets no Resume after Home.
- `resumeSlot` (`src/ui.js:235`) now clears the card on a switch, but per-mission `regionsSeen` state is shared with the slot it left; and Resume closing an unread Full card leaves that region marked seen.
- The `{end}` test for the lessons checks the Full side by the strings only.
- The Admin Best tile and the debrief charts' `xMax` for a Quick mission have no test; tick spacing on a Quick chart was not checked.
- `lesson.food` no longer gives "about 3.6 tonnes" (true for 500 sols only) and says "weighs tonnes" with no figure; a per-length figure could return.
- The kind key `c.type + ':' + c.kind` (`src/ui.js:454` at review time) would collapse a future card with no kind.

### Words and tests of words
- The Plains test's comment became `// X`; the `help.11` test's `/spare kit\b(?!s)/` is lower-case only; `srcA` reverse-looks-up the id on every call (`src/ui.js:75`); the pilot card's source is plain text; the plural keys of `goal.*` are left as they were; `/^haul./` in `I.t` has an unescaped dot (harmless).
- The copyright string hardcodes the name instead of reading `author` (a test checks that they agree).
- `lan.seatTaken` duplicates `lan.taken_err` (`src/i18n.js`, both languages).
- The noRoom / slowDown test mostly proves the strings exist; the no-menu check is a regex over `main.js`.
- The `.found-list` test is a regex over CSS; the lava-tube test pins the stops, not the darkness.

### Server, rooms and the app
- A reused room row keeps its old `meta.remote` (`lib/rooms.js:186-192`).
- `server.js` imports `privateIPv4` from `app/join.js`; it would sit better in `lib/`.
- `src/admin.js` still adds the fonts link itself.

### Surface and map (`src/surface*.js`, `src/ui.js`)
- `fogSent` is pruned only on socket open or `forgetFog` (`src/ui.js:159-174`); the fog cap bounds it.
- `r.shown` is not reset when a crewmate leaves the rover (`src/surface.js:851`), so the rover shows a brief swing from a stale angle.
- The console pause (`armCardTimer`, `src/ui.js:684`) leaves an already-open card up while the console shows.
- The pack's kit count is only in its aria-label; a pack of only kits has no "full" note yet a pickup says full.
- The repeated round brief can overwrite a different note set while a card was up (it fires only after a card closes).
- Stale comment at `test/surface.test.js:925`; the nose tests cover east, north and one pinch only.
- `src/ui.js` keeps its own `const TILE = 64` (`src/ui.js:1260`) beside the surface's tile size.

### The Showcase (`src/showcase.js`)
- `opsTab` is not in the `CARDS` shape: `view: 'console'` covers it, and `ui.js` has no console tab state.
- `show.open` is an extra key that the Admin link needs.
- `SolSurface.scene`, the scene's boarding refusal and the Admin Showcase link have no automated test (they were left to the browser pass).
- The flare 20 s test compares `flareStart` with the card's own clock through a fake surface; the real order is by code reading and the browser pass.
- `test/showcase.test.js:46`'s comment says "exactly as showScene builds it" but the helper omits `G.pick` (no effect found); the ground test restates the `REGION_PHOTO` names.

### Looked at and left, from the final review
- Saves that pass repair but crash on Resume (schedule removed, turn 9) were reproduced; the title stays usable and spec §3.7 leaves hand-edited saves out.
- A lying client sending `quick: 1` with 20 rounds is accepted and graded on Quick bands (spec §3.7 keeps the lying-client item as is).
- Removing the app menu also removes F11 and zoom (spec §3.4 allows it).
- Hiding VPN addresses also removes them from the `node server.js` console list (the same function as the lobby fix).
- `.show-cap` truncates a long purpose line to one line: a layout call for the browser pass.
- The Full-mission `D.SCIENCE.eva` stays 20 (see the M4d follow-ups' table), and the flat haul stays.

## Left out on purpose

From spec §2 and §3.7:
- Everything phone or touch (no phone or touch layout work in M5, upright or sideways).
- Test-only and code-only tidying: it stays on the follow-up lists.
- Co-op Quick missions: Quick is solo only.
- The explorer bot's internals.
- Hand-edited saves.
- Co-op races that need two rare failures together (the stale-position guard, tagging positions with the round).
- `D.SCIENCE.eva` stays 20; the lying-client and flat-haul items stay as they are.
- The Full mission's rules and balance: not one number moved.

Also not done at the time of this doc: the bigger base, upgrades over time, vehicle building and materials. The user asked for them on 2026-11-09 (20:43) and they are a separate project, in brainstorming.

## Hand checks the user must make

The sandbox has no internet. These carry over from M1 to M4d, and the Showcase run is new:
- A share-link game ends with an Online record that has the exploring counts.
- `https://<link>/admin` gives 404.
- The Live tab shows the share link and its QR code, and Stop sharing works.
- The CSV save dialog in the app.
- A ping and a beacon between two PCs over the share link.
- The Showcase run by the presenter on the installed app, as a rehearsal: all 12 cards, Show me and ‹ Showcase, in both languages.
- Also, from the task reviews, if the QA did not cover them: the browser-pass lines of Tasks 6 to 10 (the job-select star at max-width 190 px; the Admin CSV, sort, kept passwords, chart labels, n/a and ticks; map key glyphs and colours against the maps; the eyebrow on one line at 1280 px with card width 380; the card max-height against the HUD; grains repeating 200; offline fonts; the rover nose at diagonals and wall corners; the missing key cap; the map past 512 minis; round 2+ with a flare or storm brief and a region card opening in the first 8 s).
