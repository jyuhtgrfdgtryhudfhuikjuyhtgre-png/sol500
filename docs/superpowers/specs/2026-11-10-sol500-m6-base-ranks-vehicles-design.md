# SOL 500 M6: base ranks, the Garage and the Fabricator

**Date:** 2026-11-10 · **Status:** design, builder-checked, waiting for the user's approval
**Builds on:** `2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (the game), `2026-11-09-sol500-m5-polish-quick-showcase-design.md` (the Quick mission and the Showcase)
**Branch:** `feat/m6-base-ranks-vehicles`, off `master` (`d6a3cb9`, version 3.7.0, 805 tests)
**Ships as:** 3.8.0 · **Deadline:** the judges see the game on **13 November 2026**

## 1. Why

The user, on 2026-11-09: *"now i want to make the base much bigger and it can upgrade over time and add something to create vehicle and make use of material so i can explore mars more easy"*, and on 2026-11-10: *"i want the base to be much bigger which can upgrade overtime"*.

Asked what makes exploring hard today, the user said all four of these are true:
- **Suit air runs out:** 150 s of suit is gone before you reach anything good.
- **Too far, too slow:** the good finds and landmarks are far away, and one rover (when the kit even brings one) doesn't get you there and back.
- **Can't carry enough:** 3 loads on foot, 8 in the rover.
- **Materials feel useless:** metal and ice come home but never turn into anything that helps you explore.

The answer is a loop the whole mission turns on: **what you haul home ranks the base up → each rank unlocks buildings that make better vehicles and gear → those take you further → where you find more.**

**The base never upgrades by itself.** The user, 2026-11-10: *"not overtime but you have to upgrade it using the material"*. Every rank-up, vehicle and piece of gear is the player's choice, paid for with materials; a base that nobody upgrades stays a Camp all mission.

SOL 500 is a competition entry with real NASA data and cited sources. Living off the land is a real NASA idea (in-situ resource utilisation, which the game already teaches in the debrief), and every vehicle and gear line below has a real NASA counterpart, which is the story a judge will look for.

## 2. Goals, non-goals, anti-goals

**Goals**
1. **Base ranks** (§3): Camp → Outpost → Station → Colony, each one bought with materials when the player chooses. Each rank makes the base's land much bigger and unlocks new buildings. The user picked this from browser mockups and added the fourth rank.
2. **The Garage** (§4), unlocked at Outpost: builds a **pressurised rover** and a **scout drone**, and today's rover if the mission didn't bring one.
3. **The Fabricator** (§5), unlocked at Station: turns metal and ice into **bigger suit tanks, a bigger backpack, rover cargo racks and faster tools**.
4. **Colony** (§6): a **sample-return launch pad** and a **self-sufficient base**.
5. Showcase cards so a judge sees all of it in seconds, not after 15 rounds (§7.3).
6. Release 3.8.0 in time for the user to rehearse before 13 November (§9).

**Non-goals**
- A cargo hauler or a scout buggy: the user looked at both and left them out. Carrying is fixed by Fabricator gear instead.
- Phones and touch, as in M5.
- The Quick mission's rules and balance (§7.2).
- Code-only tidying from the M5 follow-ups.

**Anti-goals: what would make this a failure even if it works**
- **Breaking what the judges would otherwise see.** 3.7.0 works. Nothing half-finished ships: a part that isn't done and reviewed by the release is left out, and 3.7.0 stays on the Desktop as the fallback.
- **The game becomes easy.** Ranks and gear are earned by exploring; a careless player stays a Camp or an Outpost and can still lose; an S grade stays special (§8).
- **A NASA fact the source doesn't say.** Every rank card, vehicle and gear line that names a real mission says only what its cited source says.
- **A judge has to play an hour to see it.** The Showcase covers it (§7.3).
- **The console turns into a wall of buttons.** New choices appear only when their rank unlocks them.

## 3. Base ranks

**The four ranks** (the land sizes are the ones in the mockups the user picked; the builder may tune them):

| Rank | Land (tiles) | Unlocks |
|---|---|---|
| **Camp** (start) | 9 × 5, as today | everything the game has today |
| **Outpost** | about 15 × 9 | the **Garage** |
| **Station** | about 21 × 13 | the **Fabricator** |
| **Colony** | about 27 × 17 | the **sample-return launch pad**; the base becomes **self-sufficient** |

**Ranking up.** The player chooses to upgrade the base, from the Mission console, like any other build: it costs **materials** (paid when it starts) and **crew work**, and nothing else (the user's call: *"you have to upgrade it using the material"*; no science level, no timer). Like any build, its crew work counts at a round's advance, so the new rank, its land and its limits arrive at that advance, never in the middle of a round on the surface (Claude's call: it reuses the build pipeline, and co-op never has to grow the base live). It takes no tile, like a relay beacon kit (`BUILDS.kit`). **Any materials pay** (the user's call, 2026-11-10): the one materials pile of today, whether it came from Earth crates, supply drops, leftover construction work or hauled metal. Ranks are priced so that hauling metal home gets you there much sooner, and each rank costs clearly more than the last; a base that never explores can still grow, slowly. If regolith from construction work makes ranks too cheap without exploring, the Full mission gets its own value for it, because the Quick mission's numbers must not move.

**Pacing targets** (measured with `tools/balance.js` on the Full mission, commander, 4 crew): a thoughtful explorer reaches Outpost around round 5–7, Station around 10–12 and Colony around 15–17; a mission played without exploring gets clearly less far (Station late at best); Colony is for good players and not every mission gets there.

**More buildings, not just more ground.** Each rank also raises how many of each building the base may have (`D.MODULES[type].max`), so the new land fills with more solar, greenhouses, ice drills and the rest (Claude's call: today's 9 × 5 grid is already one tile short of every building at its limit, so without this "much bigger" would be for show). It is the milestone's biggest balance lever, measured against §8.

**The land grows on every side.** At each rank the base's buildable land grows outward around the HQ. Every existing building stays exactly where it is on the surface, and the new ground gets its own ice and rock tiles. Today the 9 × 5 grid is fixed (`D.GRID`, addressed from its corner with the HQ at `[4, 2]`) and four files read it (`src/engine.js`, `src/surface.js`, `src/ui.js`, and `src/expedition.js` through the base zone); changing that safely is the main technical risk of the milestone.

**On the surface** the bigger base is real: you walk round a larger outpost, the new buildings stand on the new ground, and the **base zone** (where the suit pauses and finds are delivered) grows with the rank. How much it grows is a balance lever: a much bigger safe zone makes every trip shorter.

**The rank-up moment.** Reaching a rank opens a full card: the new rank's name, what it unlocks, and one real fact with its NASA source (for example NASA's Artemis Base Camp plans for the Moon). The console and the HUD show the current rank.

## 4. The Garage (Outpost)

A building on one tile, built like any other once the base is an Outpost. It builds vehicles from materials and crew work.

**Today's rover.** The rover is cargo the player may or may not bring from Earth (the reference kits bring none). The Garage can build it from Mars metal if the mission has none.

### 4.1 The pressurised rover

The user picked this to fix "suit air runs out" and "too far". Based on the Artemis pressurised rover (NASA with JAXA).
- **You breathe inside:** no suit drain while you're in it.
- **About twice the range** of today's rover (today 400 tiles a round), recharged each night like today's.
- **Cargo:** 8 loads, like today's rover, plus the Fabricator's racks.
- **Medium speed**, driven with the same physics as today's rover (`src/physics.js`), with its own mass and grip.
- **Added alongside** today's rover, not swapped for it (the user confirmed): a mission can have both.
- **Two seats:** in co-op a passenger rides along and their suit doesn't drain either (the user confirmed).
- **Not flare cover** (Claude's call, as beacons aren't): the flare hint says so, so the run for cover stays a real choice.

### 4.2 The scout drone

The user picked this to see where the good finds are before driving. Based on NASA's Ingenuity helicopter, which flew on Mars with Perseverance.
- **Flies over cliffs and walls**, from the base or from a rover.
- **Clears the fog in a wide circle** where it flies (a relay beacon reveals 12 tiles today) and so shows the finds there. It **carries nothing**.
- **A short flight battery** that recharges each round.
- Grounded in a global dust storm (Claude's call; Ingenuity's flights were planned round Mars's dust and seasons, if the source supports saying so).
- The first flight tells Ingenuity's real story in one card, with its source.

## 5. The Fabricator (Station)

A building on one tile, unlocked at Station. It makes gear from **metal (materials) and ice (water)**; each line has levels, each level costs more, and an upgrade applies to the whole crew. The user picked all four:

| Gear | Today | Levels (to tune) | Fixes | Real counterpart |
|---|---|---|---|---|
| **Bigger suit tanks** | 150 s of suit | 200 s → 250 s | suit air | oxygen made from Mars's air, as NASA's MOXIE did on Perseverance |
| **Bigger backpack** | 3 loads on foot | 4 → 5 | carrying | |
| **Rover cargo racks** | 8 loads in a rover | 12 → 16, on every rover | carrying | |
| **Faster tools** | the hold seconds in `EXPEDITION.hold` | about −20 % → −40 % | slow work at a find | |

The server checks every action with the same values (`src/expedition.js`), so a gear level is part of the mission state, read through one place.

## 6. Colony

**The sample-return launch pad.** A building at Colony. Once a mission, the crew launches the science samples they've banked to Earth, and the mission gets a science bonus: the finale exploring builds to. The bonus is worked out from the map science already banked (`expedition.science`); there is no separate store of samples, and delivering a find works as today (Claude's call). Based on NASA's Mars Sample Return plans and the sample tubes Perseverance has been collecting. The bonus has to fit the score's rules: the map's science counts only a share up to a cap today (`D.SCORE.map`), because exploring had pushed nearly every thoughtful explorer to an S, and the launch must not undo that (§8).

**A self-sufficient base.** At Colony the base makes more of its own oxygen, water and food (the builder picks the lever: more output, or less use), so the independence part of the score goes up and supply delays stop hurting. The console says the base is self-sufficient.

## 7. Everywhere else

### 7.1 Co-op
Everything works in co-op, as every feature since M1 has. Ranks and gear are base state, shared by the whole crew and checked by the server. The vehicles follow today's rover rules for drivers, with the pressurised rover's passenger seat added. One drone flies at a time.

### 7.2 The Quick mission
Claude's call: **Quick stays exactly as in 3.7.0.** Its 8 rounds are too few to grow a base, its balance was measured in M5, and the Showcase covers the new features for a judge.

### 7.3 The Showcase
New cards in the M5 gallery, each with its purpose line, its NASA source and a **Show me** that runs the real game (the M5 rules hold: a throwaway demo mission that writes no save or history):
- **Base ranks:** standing in a Station-rank base on the surface, with the rank-up card.
- **Pressurised rover:** at the wheel, the suit timer visibly paused.
- **Scout drone:** a flight clearing the fog.
- **Fabricator:** the console's gear lines.
- **Sample return** (if §6 ships): the launch.
A card for a part that didn't ship isn't added.

### 7.4 Saves
A 3.7.0 save (Full or Quick) resumes as a Camp with its buildings in place. A new save loads in 3.8.0 only; 3.7.0 doesn't have to read it.

### 7.5 Words
Every new string in English and Vietnamese. The rover is "xe thám hiểm" in Vietnamese (the user's M5 call); the base stays "căn cứ".

## 8. Balance

M6 moves the Full mission's balance on purpose, unlike M5. The targets, measured with `tools/balance.js` (whose explorer bot has to learn to rank up and buy gear, or the numbers mean nothing):
- **S stays special:** the M4d targets hold. Thoughtful explorers on commander get an S about a quarter to a third of the time, and sloppy explorers under 10 %.
- **Exploring still has to be earned:** on veteran, exploring adds 10 to 25 points of success for a sloppy player (M4d's target).
- **Careless players still lose:** a careless player's success rate doesn't rise by more than a few points.
- **Ranks pace as in §3.**
- The Quick mission's numbers don't move.

## 9. The deadline, and the order things are built

The judges see the game on the **evening of 13 November** (the user). About three days is short for this much, so the work is built **in tiers**. Each tier leaves the game whole and releasable, and gets its Showcase card along with it:

1. **Ranks and land:** the four ranks, the growing land on the surface, the rank-up cards, the Garage and Fabricator buildings, and the Garage building today's rover.
2. **Fabricator gear:** the four lines.
3. **Colony:** the sample-return launch and the self-sufficient base.
4. **The pressurised rover.**
5. **The scout drone.**

Tiers 2 to 5 can be built in parallel once tier 1 is in.

**If a tier misses the release** (Claude's call): every rank still gives its land and its building limits, which are tier 1. An unlock whose tier didn't ship is hidden, not shown doing nothing: no Fabricator to build without tier 2's gear, no launch pad without tier 3, and the Garage offers only what shipped. One switch per tier in `src/data.js` turns its unlocks on, so leaving a tier out is a one-line change and the §3 pacing is measured on what ships. **3.8.0 is installed and ready by midday on 13 November** with every tier that passed review, balance and browser QA, so the user can rehearse; anything unfinished is left out, not shipped half-done. The release follows M5's (§6 of its spec): final balance, browser QA, version and service-worker cache bump, `dist/` rebuilt, the installer built, smoke-tested, installed and launch-checked, a copy on the Desktop, and ask before merging.

## 10. Constraints

- Node, no new dependencies. The game runs as the app, in a browser and from the offline file.
- Numbers only in `src/data.js`; every string in `src/i18n.js` in both languages.
- Test first for rules. Existing tests stay green; a test that pins the Full mission's old balance may change only on purpose, with the reason in the commit.
- Old saves load (§7.4).
- NASA facts only from cited sources; if a source can't be found, the line is about the game's rule and names no source.
- The project's process lessons (the follow-up docs' "For every later plan"): agents commit early and in small steps, reviewers save as they go, one browser QA at a time, the CRLF working tree, the GateGuard hook.

## 11. Left to the builder

The exact numbers (rank costs, land sizes, base-zone growth, vehicle and drone figures, gear levels and costs, the sample-return bonus, the self-sufficiency lever), all by measurement against §8; how the grid grows in code; the shape of the vehicle and drone state; how the drone is steered; the art for the new buildings, vehicles and ranks in the game's style (`src/art.js`); the words; how the work is split across agents.

## 12. Claude's calls, for the user to check

- Rank-ups, vehicles and gear are built from the Mission console with materials and crew work, like every build today (the user said materials; the crew work is Claude's addition, so a rank-up takes the crew's time as building does).
- A rank-up arrives at a round's advance, like every build.
- Each rank raises the building limits, so the bigger land fills with more buildings.
- No separate greenhouse dome (it was only in a mockup): Station's extra greenhouses are the dome.
- The sample-return bonus is worked out from the map science already banked.
- An unlock whose tier misses the release is hidden; the ranks always give their land and limits.
- The base zone grows with the rank (by how much is measured).
- The Garage can also build today's rover from Mars metal.
- The Garage and the Fabricator each take one tile, like every building today.
- The pressurised rover is **not** flare cover.
- The drone is grounded in a global dust storm.
- Gear upgrades apply to the whole crew.
- The sample-return launch is once a mission.
- The Quick mission doesn't change.
- The build order of §9, with the drone last, and 3.8.0 ready by midday on 13 November, leaving the afternoon to rehearse.
- Version 3.8.0.
