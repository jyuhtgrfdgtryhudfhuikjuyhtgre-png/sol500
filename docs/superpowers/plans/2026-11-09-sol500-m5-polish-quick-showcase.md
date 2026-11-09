# SOL 500 M5: polish, Quick mission and Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what a player or judge can see, add an 8-round Quick mission with its own save, add a presenter's Showcase of 12 real game moments, and release 3.7.0.

**Architecture:** A mission's length is its schedule's length (`E.turnsOf(s)`), so a Full mission and every old save need no new field; a Quick mission only adds `s.quick = true`. Saves move into a small pure module (`src/saves.js`). The Showcase is data in `src/showcase.js`, played by `src/ui.js` as a throwaway mission that the existing save, history and badge paths refuse to record.

**Tech Stack:** Node, plain browser JavaScript (UMD modules), `node --test`, Electron. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-sol500-m5-polish-quick-showcase-design.md`. Item details and fixes for the polish are in `docs/superpowers/plans/*-followups.md`: search for the function or string, because line numbers drift.

## Global Constraints

- Node, no new dependencies. The game runs as the app, in a browser and from the offline file.
- Every new string in `src/i18n.js`, in English and Vietnamese. Numbers only in `src/data.js`.
- Test first for rules. The Full mission's existing tests stay unchanged.
- With no `quick` on the mission: schedule, world, scores and balance exactly as `aba7f78`, same seeds and same results, including old saves.
- Phones, touch layouts, test-only tidying, code-only tidying and co-op Quick missions are out of scope.
- The Vietnamese for the rover is "xe thám hiểm" everywhere; the base is "căn cứ"; the beacon is "trạm chuyển tiếp".
- A new `src/*.js` module goes in `index.html`, `sw.js`'s `SHELL` and `test/sw.test.js`'s load order. `tools/build.js` carries it into `dist/`.
- Commit early and in small slices: agents die at usage limits and lose what isn't committed. Every commit ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Reviewers write findings to their report file one at a time.
- The working tree is CRLF (`core.autocrlf=true`): patch scripts must normalise line endings.
- Browser QA: one agent at a time, tabs in one window, at most 2 windows, server on port 5071 with a fresh `--data` folder (Chrome refuses 5060 and 5061). Don't run it while `node --test` runs.

## Review Focus

- A Full game is saved and the player starts, plays, abandons or finishes a Quick one, or the reverse: the other slot is byte-for-byte unchanged (Task 2).
- An old save with no `quick`, or a damaged Quick slot: the game boots, the Full slot is untouched, and only the damaged slot is dropped (Task 2).
- `/?showcase=1` opened through a share link, from another Wi-Fi device or as the offline file: the normal title screen, no gallery (Task 4).
- A Showcase session advanced all the way to its debrief: the real save, `regionsSeen`, `opsView` and badges are unchanged and no history record is sent (Task 4).
- A hand-made solo history POST claiming `quick` with the wrong number of rounds, or a turn past its length: refused (Task 1).

---

## Order of work

- **Wave 1 (independent):** Tasks 1, 6, 7, 9.
- **Wave 2:** Tasks 2 and 3 (after Task 1), 8, 10.
- **Wave 3:** Tasks 4 and 5 (after Tasks 1 and 2).
- **Last:** Task 11.

Tasks in one wave run in separate worktrees (`node_modules` as a PowerShell junction) and merge back when each is reviewed.

---

### Task 1: The mission's length and the Quick schedule

**Files:**
- Modify: `src/data.js`, `src/engine.js`, `lib/history.js`, `tools/balance.js:24`
- Test: `test/quick.test.js` (new), `test/history.test.js`

**Interfaces:**
- Produces, in `src/data.js`: `D.QUICK = { turns: 8, flareTurn: 2, oxygenTurn: 4, budget: { cadet: 32, commander: 30, veteran: 28 }, kitChange: { rover: 1, waterwall: 0 }, grades: [['S', 1400], ['A', 1200], ['B', 1000], ['C', 800]] }` (Task 3 tunes `budget`, `kitChange` and `grades`).
- Produces, on `E`: `turnsOf(s) → s.schedule.length`; `budgetFor(difficulty, crewSize, quick)`; `referenceKit(difficulty, crewSize, quick)`; `validateLoadout(loadout, difficulty, crewSize, quick)` adding error `'needs_rover'`; `summarizeLoadout(loadout, difficulty, crewSize, quick)`; `createMission({ …, quick: true, schedulePatch: { [turn]: { spe?, flavor?, devil?, weather? } } })`.
- `s.quick === true` only on a Quick mission. Co-op (`lib/rooms.js`) never passes `quick`.

- [ ] **Step 1: Write the failing tests in `test/quick.test.js`**

```js
const quick = (seed, extra) => E.createMission(Object.assign({ seed, quick: true, loadout: E.referenceKit('commander', 4, true), difficulty: 'commander', crewSize: 4 }, extra));

test('a quick mission has 8 rounds and a full one 20', () => {
  assert.equal(E.turnsOf(quick('A')), 8);
  assert.equal(E.turnsOf(E.createMission({ seed: 'A', loadout: E.referenceKit('commander', 4), difficulty: 'commander', crewSize: 4 })), 20);
});
test('on 200 seeds, rounds 1 and 2 are calm, round 3 has the flare and round 5 the oxygen rupture', () => {
  for (let i = 0; i < 200; i++) {
    const [a, b, c, , e] = quick('S' + i).schedule;
    for (const t of [a, b]) assert.deepEqual([t.weather, t.spe, t.devil, t.flavor], ['clear', false, false, null]);
    assert.deepEqual([c.weather, c.spe, c.devil, c.flavor], ['clear', true, false, null]);
    assert.deepEqual([e.weather, e.spe, e.devil, e.flavor], ['clear', false, false, 'o2_rupture']);
  }
});
test('a quick mission has no conjunction and no global storm', () => { /* 200 seeds: no turn with conjunction or weather 'global' */ });
test('events stay on in a quick mission even when events: false is passed', () => assert.equal(quick('A', { events: false }).schedule[2].spe, true));
test('a quick kit must hold the rover', () => {
  const kit = Object.assign(E.referenceKit('commander', 4, true), { rover: 0 });
  assert.ok(E.validateLoadout(kit, 'commander', 4, true).errors.includes('needs_rover'));
});
test('a quick mission succeeds after round 8, on sol 200', () => { /* s.turn = 7; s.sol = 175; resolve with a safe plan; status 'success', sol 200 */ });
test('the last round banks backpacks at turn 7', () => { /* a find carried at turn 7 is in banked after the advance */ });
test('a quick mission earns no achievements', () => { /* a successful quick state: E.achievements(s) deepEquals [] */ });
test('a quick mission reads its grades from D.QUICK.grades', () => { /* scoreMission on a state whose total is between the two tables */ });
test('advice never warns of a storm in a quick mission', () => { /* E.advise codes exclude 'storm_risk' */ });
test('schedulePatch changes round 1 before it begins', () => {
  const s = quick('A', { schedulePatch: { 0: { flavor: 'o2_rupture' } } });
  assert.ok(s.events.some(e => e.type === 'o2_rupture'));
});
test('the full schedule is the same as 3.6.0', () => {
  for (const [seed, sha] of PINNED) assert.equal(hash(JSON.stringify(E.createMission({ seed, loadout: E.referenceKit('commander', 4), difficulty: 'commander', crewSize: 4 }).schedule)), sha);
});
```

`PINNED`: three seeds (`A`, `BAL-0`, `PAINT-QA-1`) with SHA-256 values computed by running the same line against `git show aba7f78` code before changing anything.

In `test/history.test.js`:

```js
test('a solo mission claiming quick with 20 rounds is refused', ...);      // validMission false
test('a mission with a full flag but an 8-round schedule is refused', ...);
test('a quick mission with turn 9 is refused', ...);
test('a valid quick mission is accepted and its record says quick: true', ...);
test('a full mission record has no quick field', ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/quick.test.js test/history.test.js`
Expected: FAIL (`E.turnsOf is not a function`; the history cases accepted or thrown).

- [ ] **Step 3: Add `D.QUICK` and the engine's length**

`buildSchedule(seed, eventsOn, level, quick)` returns early into a separate Quick branch, leaving the Full branch's random draws untouched: rounds index 0, 1, 2, 4 fixed as tested, indices 3, 5, 6, 7 drawn with `rng(seed, 'schedule-quick')` by the Full rules for regional storm, extra flare, devil and flavour. Replace `D.TURNS` with `turnsOf(s)` at `src/engine.js` lines 1027, 1198, 1294, 1305; `D.TURNS * D.TURN_SOLS` in `summarizeLoadout` becomes the given length (`quick ? D.QUICK.turns : D.TURNS`). In `advise`, `storm_risk` needs `!s.quick`. In `scoreMission`, `const bands = s.quick ? D.QUICK.grades : D.SCORE.grades`. `achievements` returns `[]` when `s.quick`. The landing event's type is `'landing_quick'` on a Quick mission (its words come in Task 2; a test stub string is not needed because `t` returns the key).

- [ ] **Step 4: Make the history check and the record length-aware**

In `lib/history.js` `validMission`: after the `Array.isArray(m.schedule)` check, require `m.schedule.length === (m.quick === true ? D.QUICK.turns : D.TURNS)` and `m.turn <= m.schedule.length`; remove the old `m.turn > D.TURNS` clause. `summarize` adds `quick: true` only for a Quick mission. `tools/balance.js:24` uses `E.turnsOf(s)`.

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: all pass (668 plus the new ones).

- [ ] **Step 6: Commit**

```bash
git add src/data.js src/engine.js lib/history.js tools/balance.js test/quick.test.js test/history.test.js
git commit -m "feat(quick): a mission's length is its schedule's, and a Quick mission has 8 rounds with set moments"
```

---

### Task 2: The Quick mission in the game, and its own save

**Files:**
- Create: `src/saves.js`, `test/saves.test.js`
- Modify: `src/ui.js`, `src/i18n.js`, `src/admin.js`, `index.html`, `sw.js`, `test/sw.test.js`

**Interfaces:**
- Consumes: Task 1's `E` functions, `D.QUICK`.
- Produces: `window.SolSaves` (UMD): `slotOf(mission) → 'save' | 'saveQuick'`; `load(ls, key, repair) → { mission, plan } | null` (`ls` is the `{ get, set, del }` of `src/ui.js`, `repair(mission)` is `E.upgradeMission`; a slot that throws is deleted from that slot only, and it writes the repaired save back); `summary(ls) → { save: { sol } | null, saveQuick: { sol } | null }`.
- Produces: `store.settings.length` is `'full'` or `'quick'` (any other stored value reads as `'full'`).

- [ ] **Step 1: Write the failing tests in `test/saves.test.js`**

```js
test('slotOf: a quick mission uses saveQuick, anything else save', ...);
test('load reads a save, repairs it and writes it back', ...);
test('a damaged quick slot is dropped and the full slot is untouched', () => {
  const ls = fakeLS({ save: FULL, saveQuick: { mission: { status: 'active', version: 2 } } });
  assert.equal(S.load(ls, 'saveQuick', () => { throw new Error('bad'); }), null);
  assert.equal(ls.raw.saveQuick, undefined);
  assert.deepEqual(ls.raw.save, FULL);
});
test('an old save with no quick field loads from the full slot', ...);
test('a save that is not active or not version 2 loads as null and stays', ...);
test('summary gives each slot its sol, or null', ...);
```

Add to `test/ui.test.js`, using its page harness:

```js
test('starting a quick mission leaves the full save unchanged', ...);
test('abandoning a quick mission (newMission) deletes only saveQuick', ...);
test('Fly again from a finished quick mission keeps the full save', ...);
test('finishing a full mission leaves the quick save unchanged', ...);
test('the title offers a Resume for each slot that holds a mission', ...);
test('Resume on the other slot loads that mission and keeps both saved', ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/saves.test.js test/ui.test.js`
Expected: FAIL (cannot find `src/saves.js`; the new UI cases).

- [ ] **Step 3: Write `src/saves.js` and rewire `src/ui.js`'s saving**

`saveSolo()`: returns under `lanOn()`; with an active mission writes `slotOf(store.mission)`; with a finished mission deletes that mission's own slot; with no mission does nothing. `flyAgain` and `newMission` call `LS.del(S.slotOf(mission))` **before** setting `store.mission = null`, because they relied on `saveSolo` deleting. Boot loads `'save'`, otherwise `'saveQuick'`, into `store.mission` (`src/ui.js:55-69`). `resumeSlot(key)` flushes the pending save, loads the slot when it isn't already `store.mission`, calls `SolSurface.reset()` if mounted, and goes to `ops`. The header comment's list of `localStorage` keys gains `saveQuick`.

- [ ] **Step 4: Add the setup row and carry `quick` through the flow**

A `seg('length', …)` row on the title's setup panel, beside difficulty, labelled by `title.length`, `length.full`, `length.quick`, with hints `length.fullHint` and `length.quickHint`. Changing it sets `store.loadout = null` and saves settings. With Quick selected, the Training button is disabled. `startManifest`, `startMission`, the manifest's `summarizeLoadout` call and its reference-kit button pass `store.settings.length === 'quick'`. In the manifest the rover's minus control is disabled at 1 on a Quick kit. `flyAgain` sets `store.settings.length` from the mission. The co-op lobby gets no such row.

- [ ] **Step 5: Length-aware words and marks**

`src/ui.js:1104-1129` uses `E.turnsOf(s)`. Replace "sol 500" with "sol {end}" in `mwarn.o2_short`, `mwarn.water_short`, `mwarn.food_short`, `advice.dose_projection` and `deb.successBody` (both languages) and pass `end` (`sum.mission`, or `turnsOf * TURN_SOLS`), so a Full mission still reads "sol 500". Add `ev.landing_quick.title` and `.body` ("Two hundred sols until the early return window…"). Round 3's note says a flare is due and invites the player outside (`quick.flareHint`). The debrief shows a `quick.tag` chip; the Admin history table shows it for records with `quick: true`, and the CSV gains a last column `quick`. Search both languages for "20 rounds" and "20 vòng".

- [ ] **Step 6: Run everything and commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/saves.js src/ui.js src/i18n.js src/admin.js index.html sw.js test/saves.test.js test/ui.test.js test/sw.test.js
git commit -m "feat(quick): the Quick mission on the setup screen, with its own save slot and its own words"
```

---

### Task 3: The Quick mission's balance

**Files:**
- Modify: `tools/balance.js`, `src/data.js` (`D.QUICK` only), `test/quick.test.js`

**Interfaces:**
- Consumes: Task 1's `E.createMission({ quick })`, `D.QUICK`.

- [ ] **Step 1: Add `QUICK=1` to `tools/balance.js`**

With `QUICK=1`, every loadout is a Quick kit (the loadout plus `D.QUICK.kitChange`, then fitted to `D.QUICK.budget`) and each mission is created with `quick: true`. Without it, output is byte-identical: confirm by comparing `LEVELS=commander BADGES=1 node tools/balance.js 200` against `aba7f78`.

- [ ] **Step 2: Measure and tune `D.QUICK.budget`, `kitChange` and `grades`**

Run, with nothing else running: `QUICK=1 LEVELS=<level> BADGES=1 node tools/balance.js 1000` for cadet, commander and veteran.
Expected at commander: careless + explorer under 35 %; thoughtful + explorer over 70 %; S grades rare for sloppy play (under 100 of 1,000) and earned by thoughtful explorers (250 to 333 of 1,000). If a target can't be met, stop and report it to the user.

- [ ] **Step 3: Pin the result**

`test/quick.test.js`: `test('every reference quick kit fits its budget and holds the rover', …)` for all three levels and both crew sizes (`E.validateLoadout(...).ok`).

- [ ] **Step 4: Run and commit**

Run: `npm test`
Expected: all pass.

```bash
git add tools/balance.js src/data.js test/quick.test.js
git commit -m "balance(quick): the Quick mission's budgets, kits and grades, from 1,000 missions a level"
```

Report the table in the task's report; Task 11 copies it into the follow-ups doc.

---

### Task 4: The Showcase: gallery, access and the demo game

**Files:**
- Create: `src/showcase.js`, `test/showcase.test.js`
- Modify: `src/ui.js`, `src/admin.js`, `src/i18n.js`, `src/surface.js`, `src/style.css`, `index.html`, `sw.js`, `test/sw.test.js`

**Interfaces:**
- Consumes: `E.createMission({ quick, schedulePatch })`, `SolSaves.slotOf`.
- Produces: `window.SolShowcase` (UMD): `CODE = 'PAINT-QA-1'` (the code whose positions QA has mapped in `.superpowers/sdd/qa-tools-m4c/qa/pois-PAINT-QA-1.json`); `CARDS: [{ id, source: <I.SOURCES key or null>, view: 'surface' | 'console' | 'modal', modal?, opsTab?, schedule?, at?: [tx, ty], board?, suit?, clock? }]` in the spec's order; `card(id)`.
- Produces: `store.demo` is `null` or `{ id }`. `store.screen === 'showcase'` is the gallery.
- Produces: `SolSurface.scene({ at, board, suit, clock })`, exported always, called only by the Showcase. It reuses what `qa` does for `teleport`, `suit` and `clock`, and boards by the real `eva.act('board', player)`.
- Words: `show.title`, `show.me`, `show.back`, `show.why`, `show.failed`, `show.exit`, `show.card.<id>.name`, `show.card.<id>.why`.

- [ ] **Step 1: Write the failing tests in `test/showcase.test.js` and `test/ui.test.js`**

```js
test('there are 12 cards, and the first three are flare, rover, oxygen', () => assert.deepEqual(C.CARDS.slice(0, 3).map(c => c.id), ['flare', 'rover', 'oxygen']));
test('every card has a name and a purpose in both languages', ...);
test('a card that names a source names one in I.SOURCES', ...);
```

```js
test('?showcase=1 opens the gallery when adminHere is true', ...);
test('?showcase=1 with adminHere false shows the title', ...);
test('?showcase=1 in the offline file, with no lanInfo, shows the title', ...);
test('a demo writes no save, no regionsSeen, no opsView and no badges, even when advanced to its debrief', () => { /* snapshot localStorage, run a demo to the end, deep-equal; store.badges unchanged */ });
test('a demo sends no history record', ...);  // N.recordSolo not called
test('a scene that throws shows show.failed and stays on the gallery', ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/showcase.test.js test/ui.test.js`
Expected: FAIL (cannot find `src/showcase.js`; the new UI cases).

- [ ] **Step 3: Write the guards**

With `store.demo` set: `saveSolo` returns at once; `N.recordSolo` isn't called; `checkBadges` returns at once; the seen-once list (`src/ui.js:681-684`) stays in memory without `LS.set`; `setOpsView` doesn't write `opsView`.

- [ ] **Step 4: Write the gallery, the access rule and the in-game chrome**

A **Showcase** link in `src/admin.js`'s `header()`, `href: '/?showcase=1'`, `data-k: 'admin-showcase'`, shown when `MODE === 'local'`. At boot, once `store.lanInfo` has arrived, `?showcase=1` with `adminHere` true goes to the gallery. `viewShowcase()` renders the 12 cards in the game's style with the language toggle; `data-k` is `show:<id>`. `showScene(id)` builds a demo mission in the Showcase's own `CODE`, sets `store.demo`, opens the card's view and calls `SolSurface.scene` once `SolSurface.probe().world` is ready, inside `try/catch` → `toast(t('show.failed'))` and back to the gallery. While `store.demo`: a `‹ Showcase` button (`data-k: 'show-back'`) and a one-line caption with `show.why` and the card's purpose, both over the stage. A modal card returns to the gallery when closed. Exit goes to `/admin`.

- [ ] **Step 5: Run and commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/showcase.js src/ui.js src/admin.js src/i18n.js src/surface.js src/style.css index.html sw.js test/showcase.test.js test/ui.test.js test/sw.test.js
git commit -m "feat(showcase): the presenter's gallery, reached from the Admin page, with a demo game that records nothing"
```

---

### Task 5: The Showcase's 12 scenes and their words

**Files:**
- Modify: `src/showcase.js`, `src/i18n.js`, `test/showcase.test.js`

**Interfaces:**
- Consumes: Task 4's `CARDS` shape and `SolSurface.scene`.

- [ ] **Step 1: Write the failing tests**

```js
test('every surface scene stands on open ground in the Showcase code', ...);   // W terrain at `at` is not a wall
test('the flare scene starts within reach of a shelter and leaves 20 s at most', ...);  // Z.shelterAt search; clock leaves <= 20 s of Z.flare.countdown
test('the landmark scene stands within discovery range of an undiscovered landmark', ...);
test('the tube scene stands at a lava tube mouth', ...);
test('the oxygen scene opens with the o2_rupture event and its two options', ...);
test('the rover scene loadout holds the rover', ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/showcase.test.js`
Expected: FAIL on the scene cases.

- [ ] **Step 3: Fill in `CARDS`**

Follow the table in spec §5. Ids: `flare`, `rover`, `oxygen`, `beacons`, `ground`, `landmark`, `tube`, `devils`, `isru`, `crew`, `story`, `guide`. Take positions from `pois-PAINT-QA-1.json`; the Showcase's weather or devil rounds use `schedule`; `ground` adds a **Next region** control through six tiles (one per region); `beacons` pre-places beacons through the rules' `placeBeacon`, not by editing state; `story` and `guide` open the modals `story` and `guide`.

- [ ] **Step 4: Write the purpose lines**

One or two sentences each, in English and Vietnamese, under `show.card.<id>.why`. For each line, open its source's page and record the sentence that supports it in the task report. If no source says it, write about the game's rule and set `source: null`. Don't reuse the mockups' sample text without checking it.

- [ ] **Step 5: Run and commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/showcase.js src/i18n.js test/showcase.test.js
git commit -m "feat(showcase): twelve scenes that run the real game, each saying why it is there"
```

---

### Task 6: Words: English, Vietnamese and facts (spec §3.1, §3.2, §3.3)

**Files:**
- Modify: `src/i18n.js`, `src/ui.js`, `src/style.css`, `test/i18n.test.js`

- [ ] **Step 1: Write the failing tests in `test/i18n.test.js`**

```js
test('every key exists in both languages, and no value is empty', ...);
test('every {placeholder} in English is in the Vietnamese', ...);
test('the Vietnamese says xe thám hiểm, never xe tự hành', () => assert.ok(!viText.includes('xe tự hành')));
test('the Vietnamese has one word each for the base, the beacon and methane', () => { for (const w of ['trụ sở', 'trạm tiếp sóng', 'mê-tan']) assert.ok(!viText.includes(w), w); });
test('"Regions of Mars" comes before "What is simplified" in both languages', ...);
test('every I.SOURCES label has a Vietnamese form', ...);
```

Sentence-initial capitals ("Xe tự hành", "Trụ sở") are included: compare in lower case.

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/i18n.test.js`
Expected: FAIL on the wording and source-label cases.

- [ ] **Step 3: Apply spec §3.2 and §3.3**

Include the facts: open the cited page for `item.battery.fact`, and for the Plains' "Jezero means lake" line use the June 2023 Mars Report page named in the M3 follow-ups; the five role lines are in the M4d follow-ups. List in the task report every string where the wording was a choice, for the user's native read.

- [ ] **Step 4: Run and commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/i18n.js src/ui.js src/style.css test/i18n.test.js
git commit -m "fix(words): one name for each thing in Vietnamese, translated sources, and facts checked against their pages"
```

---

### Task 7: The title, the lobby, the app and the Admin page (spec §3.1 Windows help, §3.4 first two bullets, §3.6)

**Files:**
- Modify: `src/ui.js`, `src/i18n.js`, `src/net.js`, `lib/rooms.js`, `app/main.js`, `src/admin.js`, `src/admin.css`, `tools/progress.js`, `package.json`, `icons/`
- Test: `test/ui.test.js`, `test/rooms.test.js`, `test/app.test.js` (or the existing test for `app/`)

- [ ] **Step 1: Write the failing tests**

```js
test('a failed host shows words, never the raw key lan.network', ...);
test('noRoom and slowDown have their own messages', ...);
test('a refused seat claim shows lan.deadCrew', ...);
test('the lobby lists only addresses in-app Join accepts', ...);
test('rejoining under the same name reuses the away row', ...);
test('the saved window size is clamped to at least 960 x 600', ...);
test('help names SmartScreen, the Firewall prompt and the install folder in both languages', ...);
test('a tests-could-not-run result reads n/a, not 0', ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: FAIL on the new cases only.

- [ ] **Step 3: Apply the fixes**

From the M1, M2 and M4a follow-ups. The application menu is `Menu.setApplicationMenu(null)`. The checksum failure and the clipboard failure get their own words; the start-failure box is in both languages. `.ico` at 16, 32, 48, 64, 128 and 256 px from `icons/icon-512.png`, referenced by `build.win.icon`; `build.copyright` and `build.win.publisherName` set, using `author` from `package.json`. Admin page: spec §3.6.

- [ ] **Step 4: Run and commit**

Run: `npm test`
Expected: all pass. Commit in slices (`fix(lobby): …`, `fix(app): …`, `fix(admin): …`, `feat(help): …`), staging only that slice's files.

---

### Task 8: The surface, the rover and Display (spec §3.4, surface, display and rover bullets)

**Files:**
- Modify: `src/surface.js`, `src/surface-eva.js`, `src/surface-map.js`, `src/surface-paint.js`, `src/i18n.js`, `src/style.css`
- Test: `test/surface.test.js`, `test/surface-eva.test.js` (or the nearest existing), `test/surface-map.test.js` (or the nearest existing)

- [ ] **Step 1: Write the failing tests**

```js
test('with a full backpack the pickup prompt says so and offers no hold', ...);
test('a pack with a kit counts the kit apart, and a pack of only kits is not "full"', ...);
test('a refused beacon spot shows no key cap', ...);
test('only the primary button pings on the full map', ...);
test('Fast never draws more pixels than Best on a zoomed-out browser', ...);  // ratio 0.5: Math.min(1, dpr)
test('a resize asks for the next draw at once', ...);
test('the round brief shows after a seat change at an advance', ...);
test('the nose probe stops the rover before the drawn front reaches a wall, in 1-tile gaps too', ...);
test('a mini drawn this frame is never evicted', ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: FAIL on the new cases only.

- [ ] **Step 3: Apply the fixes**

From the M4a, M4b, M4c, M4d and floor follow-ups. Reproduce the menu that survives a new mission before fixing it; if it doesn't reproduce, record that in the report and leave the code. The region card clears on a launch.

- [ ] **Step 4: Run and commit**

Run: `npm test`
Expected: all pass. Commit in slices.

---

### Task 9: The console and co-op (spec §3.4, console and co-op bullets)

**Files:**
- Modify: `src/ui.js`, `lib/rooms.js`, `src/surface.js`, `src/surface-paint.js`, `src/style.css`
- Test: `test/ui.test.js`, `test/rooms.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('a card arriving while you read another waits its turn', ...);          // with contains: () => true
test('a held card is dropped when the mission ends or a new one launches', ...);
test('reopening a region card does not show its waiting first-time card again', ...);
test('the forecast counts a goal met this render', ...);
test('a held card does not expire while the console is showing', ...);
test('a disconnected commander grants no aura', ...);
test('fog sent just before a socket drops is sent again when it reopens', ...);
test('solo reads seen regions from the mission, not the global slot', ...);
test('a flare timer answered "early" tries again', ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: FAIL on the new cases only.

- [ ] **Step 3: Apply the fixes**

From the M4b and M4d follow-ups, plus: the ready bar gets a backdrop and an opaque disabled state; a crewmate's rover eases its heading (`r.shown += wrap(r.heading - r.shown) * k`, drawn from `r.shown`); name tags push by their full height, and "your tag first" sorts with `(b.you ? 1 : 0) - (a.you ? 1 : 0)`.

- [ ] **Step 4: Run and commit**

Run: `npm test`
Expected: all pass. Commit in slices.

---

### Task 10: The look and the offline start (spec §3.4 offline, §3.5)

**Files:**
- Modify: `src/surface-paint.js`, `src/surface-map.js`, `src/surface.js`, `src/ui.js`, `src/i18n.js`, `src/style.css`, `src/art.js`, `index.html`, `src/ground-photos.js` and its generator
- Test: `test/surface-paint.test.js`, `test/ui.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('the big map has a key naming every mark, in both languages', ...);
test('a lava tube pool is dark at the new radius', ...);     // new stops, replacing the pinned ones at test/surface-paint.test.js:319-321 (the user approved this change)
test('a story log or fact opens once a mission per kind', ...);     // replaces the once-per-place cases (the user approved this change)
test('the found-list marker is not read aloud', ...);     // style.css: content '+' / ''
test('the Display rows have accessible names', ...);
test('the ground photos ship seamless and loadPhotos no longer calls tileable', ...);
test('the page loads with no font request when offline', ...);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: FAIL on the new cases only.

- [ ] **Step 3: Apply the fixes**

From the M4c and floor follow-ups. Fonts: when offline, or in the single file, don't add the Google Fonts `<link>`; the CSS stacks fall back to system fonts. Run `tileable` in the generator and ship the seamless images, keeping the credits in the file's header. The "hard tile edges" item stops at whatever needs no new per-frame work. Check after the build that the world hash is still `3ae4db5e` (`q5c-hash.js`).

- [ ] **Step 4: Run and commit**

Run: `npm test`
Expected: all pass. Commit in slices.

---

### Task 11: QA, docs, version 3.7.0 and the installer (spec §6)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (Status, §12's three M5 items), `docs/superpowers/specs/2026-11-09-sol500-m5-polish-quick-showcase-design.md` (Status), `sw.js`, `test/sw.test.js`, `package.json`, `package-lock.json`, `dist/`
- Create: `docs/superpowers/plans/2026-11-09-sol500-m5-followups.md`

- [ ] **Step 1: Whole-branch review, then browser QA on the merged tree**

The final whole-branch review and its fixes come first, so the release is built from reviewed code. Then QA on port 5071, fresh `--data`, tools from `.superpowers/sdd/qa-tools-m4c/qa/`, in English and Vietnamese at 1280 x 720:
1. A Quick mission from setup to debrief: flare in round 3, oxygen cut in round 5, the rover from round 1, the Quick marks, and its play time recorded (20 to 50 minutes is the target).
2. All 12 Show me buttons: each opens within about 3 s, and ‹ Showcase returns.
3. A real save, `regionsSeen` and badges deep-equal before and after a Showcase session.
4. Full and Quick saves, each surviving the other being started, played and finished.
5. `/?showcase=1` through a non-local request shows the title.
6. Frame rate within a frame of 3.6.0's (163.9 fps median on the 165 Hz display), and repaint 420 of 420.
7. The offline file: Quick works and there are no font errors.

Expected: Critical 0, Important 0. A failure is fixed test-first, then its check is re-run.

- [ ] **Step 2: The final balance**

With nothing else running, one process per level, with and without `QUICK=1`.
Expected: Full figures equal the M4d follow-ups' on the same seeds (a difference stops the release); Quick targets as in Task 3.

- [ ] **Step 3: Docs**

The follow-ups doc holds measured numbers, what QA left, the strings for the native read, the items left out on purpose, and the hand checks. Tick §12.

- [ ] **Step 4: Version and builds**

1. `npm version 3.7.0 --no-git-tag-version`.
2. Read `sw.js`'s cache name, bump it by one (`sol500-v7` if it still reads `v6`), and update `test/sw.test.js`'s pin. `npm test` passes.
3. `node tools/build.js`.
4. `npm run app` builds `dist-app/SOL500-Setup-3.7.0.exe`.
5. `npm run smoke` reports `"ok": true`.
6. Check the app isn't running, install with `/S`, and compare the asar (`.superpowers/sdd/2026-11-02-sol500-m4d-progression-team/release/compare-asar.js`, after pointing `REL` at this release's folder).
7. Launch check in an empty profile (`app-launch-check.js` from the same folder, adding: the Mission length row exists, and the Admin page's Showcase link opens the gallery). Then repeat from the installer's unpacked payload with no Node on `PATH`, as for 3.6.0.
8. Kill leftover `electron.exe` and `cloudflared-*.exe` by PID. Copy the installer to the Desktop and confirm the hash matches.

- [ ] **Step 5: Commit**

```bash
git add docs/ sw.js test/sw.test.js package.json package-lock.json dist/
git commit -m "chore: M5 complete (polish, the Quick mission and the Showcase), version 3.7.0, offline build refreshed"
```

- [ ] **Step 6: Ask before merging**

Offer the user the merge. Old branches and worktrees go only with the user's OK.
