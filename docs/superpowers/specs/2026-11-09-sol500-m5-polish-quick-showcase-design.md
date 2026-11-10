# SOL 500 M5: polish, the Quick mission and the Showcase

**Date:** 2026-11-09 · **Status:** M5 built and reviewed (3.7.0), QA passed (0 Critical, 0 Important open)
**Builds on:** `2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (§11's M5 line, §12's M5 checklist)
**Branch:** `feat/m5-polish-quick-showcase`, off `master` (`aba7f78`, version 3.6.0, 668 tests)
**Ships as:** 3.7.0

## 1. Why

SOL 500 is a competition entry. The user wants a judge to **feel the game has lots of features**, and says the judge **will look for each feature's purpose**: why it is there, not only that it is cool.

Two things stand in the way today:

- A full game with all the exploring takes about 2 hours, so a judge won't see the whole game.
- The best moments (a solar flare, an oxygen line rupture) are random and can take a long time to arrive, so the user can't show them on demand.

M5 also finishes the polish the spec promised, so nothing a judge or friend touches feels unfinished.

## 2. Goals, non-goals, anti-goals

**Goals**
1. Fix everything a player, judge or friend can see or hit (§3).
2. A **Quick mission**: one whole game in about 20 to 50 minutes, with the big moments guaranteed (§4).
3. A **Showcase**: the user presents, the judge watches, and each feature shows its purpose and jumps straight to the real thing (§5).
4. Release 3.7.0 with the installer other people can use (§6).

**Non-goals (the user's calls)**
- Phones: no phone or touch layout work in M5, upright or sideways.
- Test-only and code-only tidying: it stays on the follow-up lists.
- Co-op Quick missions: Quick is solo only.

**Anti-goals: what would make this a failure even if it works**
- The Showcase plays a fake animation. Every **Show me** must run the real game code.
- The Showcase or Quick mission damages a player's real save or history.
- The Full mission's rules or balance move at all.
- A purpose line states something its source doesn't say. Real NASA data with cited sources is a founding choice of this game.

## 3. Part 1: the polish

**The rule:** an item is in if a player, judge or friend can see it or hit it on a PC. Each item's place in the code and its fix are in the follow-up docs under `docs/superpowers/plans/` (`*-followups.md`); search for the function or string, because line numbers drift. A builder may find an item already fixed, and then skips it.

### 3.1 The spec's own M5 items
- English and Vietnamese for every screen, including a check that fails on an empty value or a missing key.
- Help for the Windows warnings: SmartScreen (the installer is unsigned: "More info", then "Run anyway"), the Firewall prompt (it appears at first launch), and the real install folder `%LOCALAPPDATA%\Programs\sol500`. It goes in the game's help.
- The final balance pass, the offline build and the installer (§6).

### 3.2 Facts and words a judge may read
- `item.battery.fact` ("24 h 39 min"): verify it against its cited page, cite one that says it, or drop it.
- The source labels (`I.SOURCES`) are English in both languages: translate them.
- The role facts in "Choose your astronaut" (the five checked lines in the M4d follow-ups), and that the commander comes with the fifth seat.
- The Plains fact: bring back "Jezero means lake" with its second source (M3 follow-ups).
- "Regions of Mars" moves before "What is simplified", so the disclaimer stays last.
- English: summed report lines ("+2 spare kit", "a canister" for two), `help.11`'s hard-coded numbers, the flare strings that read oddly in solo.

### 3.3 Vietnamese
- The rover is **"xe thám hiểm" everywhere** (the user's call). Change every "xe tự hành".
- One word each for the base and the beacon: "căn cứ" instead of "trụ sở", "trạm chuyển tiếp" instead of "trạm tiếp sóng", one spelling of methane ("mêtan").
- The small fixes named in the M4d follow-ups (`ev.spe.shelter.hint`, `lesson.isruMars.body`, `goal.haul`).
- The clipped star in the crew-job dropdown.
- A native read by the user stays open; the builder lists the strings where the wording was a choice.

### 3.4 Bugs a player can hit
- Title and lobby: `lan.network` shown as a raw key when hosting fails; precise messages for `noRoom` and `slowDown`; seat claims that fail in silence (`lan.deadCrew`); lobby VPN addresses that in-app Join refuses; a rejoin that adds a second player row.
- The app: Ctrl+R and Ctrl+Shift+I (remove the menu, or re-sync the online state); the start-failure box in both languages; a different message for a failed checksum; feedback when a copy fails; clamp the saved window size.
- Surface: full backpack still offers a 3 s pickup; a backpack with a kit that counts wrong; a refused beacon spot still showing E; any mouse button pings on the map; a menu surviving a new mission (reproduce first); the region card lingering into a new mission; the round brief skipped when your seat changes at an advance, or hidden by a card; the map flickering past 512 minis.
- Console: a held card expiring unseen, or opening behind the debrief or in a new mission; a card replacing the one you're reading; a region card shown twice; the forecast one render behind a goal.
- Co-op: a dropped commander still granting the aura; `flushFog` losing fog on a half-open socket; `regionsSeen` replaying cards in a resumed solo game; the flare timer's `early` case; the ready bar see-through over the side panel; a crewmate's rover heading jumping; bunched name tags overlapping.
- Display: Fast on a zoomed-out browser; two blank frames on a window drag under an FPS limit.
- Offline: Google fonts logging errors and delaying the first paint with no network.
- Rover: the drawn nose going into walls (F13).

### 3.5 The look
- The user's approved calls from M4c: a **map key** for the marks, **darker lava tubes**, and **each story log or fact once a mission**. (The boulder squares are already done.)
- The grains photo repeating on Volcanic Flanks; hard tile edges between grounds where a cheap fix exists; the solar array's top edge and the other art notes from M4c.
- Text that wraps or runs over at PC sizes: the "Kestrel Survey" eyebrow at 1280 px, long cards in short windows, the co-op top bar in dust season.
- The hitch from making the ground photos seamless at run time (F12).
- Basic accessibility: the Display rows' names, the found-list's "plus" and "minus".

### 3.6 The Admin page (it is now part of the demo)
A CSV export error that shows the right message; rows showing "—" sorting sensibly; long Vietnamese labels in the bar chart; validation errors that keep the typed passwords; "n/a" when tests couldn't run; the Project tab's ticks not shrinking. The app icon as a multi-resolution `.ico`, and `copyright` and `publisherName` set.

### 3.7 Left out on purpose
Everything phone or touch; test-only and code-only items; the explorer bot's internals; hand-edited saves; co-op races that need two rare failures together (the stale-position guard, tagging positions with the round). `D.SCIENCE.eva` stays 20, the lying-client and flat-haul items stay as they are.

## 4. Part 2: the Quick mission

**What the player sees.** A **Mission length** row on the setup screen, beside difficulty: **Full mission** (20 rounds, Sol 500) or **Quick mission** (8 rounds, Sol 200). Solo only: it isn't offered in the co-op lobby. The game is still called SOL 500.

**The rounds.** Each round stays 25 sols.

| Round | What happens |
|---|---|
| 1, 2 | Calm: clear weather, no flare, no dust devils, no flavour event. The player learns the game. |
| 3 | The **solar flare**, every time, and no other flavour event. |
| 4 | Random, by the usual rules. |
| 5 | The **oxygen line rupture** (`o2_rupture`), every time, and no flare. |
| 6 to 8 | Random, by the usual rules. |

Round 3's card always appears. As in a normal game, the flare on the surface begins once someone steps outside (`Z.flareStart`), so the round's note must tell the player a flare is due and invite them out. Training mode is switched off for a Quick mission, or the set moments couldn't happen.

**The rover** is ready from round 1: a Quick kit always holds it, and the player can't take it out.

**Supplies** are chosen as usual on the manifest screen, with a Quick reference kit and a smaller payload budget, so a shorter mission isn't simply easier. The numbers come from measurement.

**Balance targets**, measured with `tools/balance.js` on 8 rounds, the same bots and three levels: careless + explorer under 35 %; thoughtful + explorer over 70 %; commander S grades rare for sloppy play and earned by thoughtful play, in the same bands as a Full mission (§1.4, §13.12 of the v3 spec). Grade bands for Quick may be their own. A target that can't be met goes to the user.

**The end.** The normal debrief, marked **Quick**, and marked in the game history and the Admin table, so a Quick score never competes with a Full one.

**Saves (the user's call).** A Quick mission has **its own save slot**, separate from `sol500.save`, so starting, playing or finishing one can never touch a Full game, and a Full game can't touch it. The title screen offers a Resume for each slot that holds a mission. "Fly again" and a new mission replace only the slot of their own length. Saves from earlier versions stay Full saves. The boot and repair path in `src/ui.js` (`saveSolo` and the load at start-up) has to handle both slots.

**What must not change.** With no `quick` on the mission, the schedule, world, scores and balance are exactly as today: same seeds, same results, including old saves.

**Known places that assume 20.** Every read of `D.TURNS` (`src/engine.js`, `src/ui.js`, `lib/history.js`, `tools/balance.js`) needs the mission's own length, with `D.TURNS` as the default. `D.CONJUNCTION_TURN` (10) and `D.GLOBAL_STORM_TURNS` (10 to 15) fall outside 8 rounds, so a Quick mission has neither. `buildSchedule`'s `turns[3 + …]` must not index past the end. The last-round banking rule, the forecast, the score's mission length, and any text that says "five hundred sols" (`ev.landing.body` and others, in both languages) need the mission's own length.

## 5. Part 3: the Showcase

**Who and how.** The user presents and holds the mouse; the judge watches.

**Getting there.** A **Showcase** button on the **Admin page** (`src/admin.js`, in its header). It opens the game at `/?showcase=1`, and the game honours that only when the page is the host's own (`lanInfo.adminHere`). It never works through the share link, and the offline single file has none. It needs no new server route. Anyone who installs the game is the admin of their own PC, so they could open it too: that is harmless, because it can't touch saves.

**The gallery.** A full page in the game's own style, with the EN/VI toggle, title "What SOL 500 can do", and 12 cards in the order below. Each card has its name, **one or two sentences on why it is there** (the real problem and what the game teaches), the **name of its NASA source as a link**, and a **Show me** button. The three the user named come first.

**After Show me.** The real game opens with the moment already set up, within about 3 seconds. A **‹ Showcase** button goes back to the gallery, and a one-line **"Why it's here"** caption stays on the screen, so the judge keeps seeing the purpose. A scene that goes badly (the astronaut collapses, say) ends nothing: the user presses ‹ Showcase or runs the card again.

| # | Card | What Show me sets up |
|---|---|---|
| 1 | **Solar flare** | Outside, some way from a shelter, the warning already running and a short countdown (20 s at most) so the run for cover fits in a demo |
| 2 | **Physics rover** | At the wheel on open ground, the speed and stopping-distance readout showing |
| 3 | **Oxygen cut** | The `o2_rupture` card open with its two choices, and the real consequences when one is picked |
| 4 | Relay beacons | A kit in the backpack at a legal spot, and beacons already placed so the route home shows |
| 5 | NASA photo ground | Standing where the photo ground shows, with a way to step through the six regions |
| 6 | Landmarks | Next to an undiscovered landmark, so its discovery card opens with its NASA facts |
| 7 | Lava tubes and caves | At a tube's mouth, ready to walk into the dark |
| 8 | Dust devils and storms | A dust-devil round, with storm visibility |
| 9 | Growing food and making oxygen | The Console, on the greenhouse and oxygen systems |
| 10 | Crew roles and skills | The crew and their jobs, with a different hold time and the commander's aura visible |
| 11 | Why Mars? | The story, covering Apollo 11, Artemis, Opportunity and Perseverance |
| 12 | Field guide | The guide, with the notes on every item |

**The demo game.** One throwaway mission on a fixed mission code, so every **Show me** lands the same way each time. It is marked as a demo: it writes **no** save, no history record and no `regionsSeen`, and a player's real saved game is still there afterwards. Closing the page simply ends it.

**Failure.** A scene that can't set up shows a short message and stays on the gallery; it doesn't crash or strand the presenter.

**Words.** Every card and caption is in English and Vietnamese. A purpose line says only what its named source says; if a source can't be found, the line is about the game's rule and names no source.

## 6. Release

As in M4d's Task 9: the final balance on the release tree (the Full mission unchanged, the Quick targets met), browser QA of the Quick mission, all 12 Show me buttons in both languages, a real save surviving a Showcase session, and a Full save and a Quick save each surviving the other being started, played and finished; version 3.7.0; the service-worker cache bumped (read the current name first, it was `sol500-v6` at 3.6.0); `dist/` rebuilt; the installer built, smoke-tested, installed and launch-checked; §12's M5 items ticked; a copy of the new installer on the user's Desktop. Ask before merging.

**Checks only the user can do:** the hand checks carried from M4d's follow-ups, a native read of the Vietnamese, and a run through the Showcase as a rehearsal.

## 7. Constraints

- Node, no new dependencies. The game runs as the app, in a browser and from the offline file.
- Every new string in `src/i18n.js`, in both languages. Numbers only in `src/data.js`.
- Test first for rules. The Full mission's existing tests stay unchanged.
- The project's lessons in "For every later plan" (the follow-up docs): agents commit early and in small steps, reviewers save as they go, one browser QA at a time.

## 8. Left to the builder

How the mission's length is stored and read; the Quick payload budget, reference kit and grade bands (by measurement); the shape of the Showcase's scene code (a new file such as `src/showcase.js` is fine); the fixed mission code and where each scene stands in it; the exact words of the Windows help; the order of the polish items; how the polish is split across agents.

## 9. Claude's calls, for the user to check

- Quick is **8 rounds of 25 sols, ending at Sol 200**, rather than longer rounds reaching Sol 500, so the per-round numbers keep their meaning.
- The flare comes in **round 3** and the oxygen cut in **round 5**; rounds 1 and 2 are calm.
- The rover can't be removed from a Quick kit, and Training mode is off for a Quick mission.
- Quick is marked in the debrief and history and never compared with Full games.
- The Showcase is reached **only from the Admin page**, not the title screen, to keep it out of normal players' way.
- The nine cards after the user's three are Claude's picks.
- The flare card's countdown is shorter than the game's real 60 s so it fits a demo.
- "căn cứ" is the one word for the base in Vietnamese, and "trạm chuyển tiếp" for the beacon.
- The 20 s, 3 s and "20 to 50 minutes" figures are targets, checked in the browser QA.
