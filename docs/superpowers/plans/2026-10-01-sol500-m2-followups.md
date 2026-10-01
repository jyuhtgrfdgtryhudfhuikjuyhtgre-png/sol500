# SOL 500 M2 — follow-ups for later milestones

M2 (admin panel) shipped on `feat/m2-admin-panel`, commits `e2e9cc8..a143671`, with 167 tests passing and version 3.1.0. Every task passed its own review. The final whole-branch review found no Critical issues and two Important ones (an unbounded `crewId` in solo records, and render-blocking Google Fonts), which were fixed in one fix wave (`a143671`) together with six Minor items. The items below were reviewed and deliberately deferred. Pick them up in the milestone named.

## Before the demo (needs a person with internet; the build sandbox had none)
- Play a share-link game to the debrief: an **Online** record appears in the History tab.
- Through the share link, `https://<link>/admin`, `/api/admin/whoami` (even with the local key) and `POST /api/history/solo` all answer **404**.
- The admin Live tab shows the share link and its QR code within 2 s, and **Stop sharing** on the admin page stops it (the lobby's Online chip turns off).
- **Export CSV** in the installed app shows a save dialog and writes the file.

## For the M3 plan (endless world, one astronaut)
- `mission.pilot` arrives in M3. Validate it where the mission is validated; `summarize` already keeps `crewId` only when it is a real crew id.
- `t('admin.ev.' + type)` and `t('admin.phase.' + phase)` have no fallback for an unknown key. Add one before M3/M4 add new room events or phases.

## For the M5 plan (polish)

### Admin page
- `downloadCsv` calls `fetch` directly, so a stale key, an ended session or Wi-Fi switched off during an export shows only the generic error toast instead of the restart banner or the login screen (`src/admin.js`, `downloadCsv`).
- `login()` awaits `r.json()` without a guard.
- The table sort mixes `null` and strings, so rows showing "—" sort unpredictably.
- `barChart` uses a fixed 160-unit label column with no truncation; check long Vietnamese cause labels and the tooltip of the longest bar.
- `msg()` on the Wi-Fi card does a full render, so a validation error clears the typed passwords.
- After the stale state, a `visibilitychange` makes one extra `/live` call and render (no loop).
- The Project tab cannot tell "tests could not run" from "0 tests" (`tools/progress.js` returns `{0,0,0}` on a spawn failure); show "n/a".
- Milestone and feature text in `progress.json` is English only (it is the spec's checklist text).

### Server
- `POST /api/admin/wifi` applies the password before validating `enabled`; a 400 can follow a partial apply (unreachable with today's rules).
- Two overlapping `setPassword` calls whose hashes finish out of order can store the earlier-requested password (no stale session survives).
- A failed write of `admin.json` still returns `ok: true` (it is logged).
- `lib/jsonfile.js` can leave a `*.tmp` file behind if the write or copy fails midway.
- The solo route has no local try/catch around `history.add`, so an unexpected throw maps to 400, not 500.
- A `progress.json` that is a JSON array would lose the `refreshable` flag.
- The `app:info` IPC handler has no `fromGame` check (it only returns the port).
- `sw.js` still uses cache `sol500-v1`; a browser that loaded `/admin` under the old worker keeps an inert entry. Bumping to `sol500-v2` would purge it.
- Share-link players finishing a solo game still `POST /api/history/solo` and get the designed 404 (network-log noise only).
- Rejoining a room under the same name from a fresh tab adds a second player row; the old one stays "away" (M1 behaviour).

### Tests
- `test/tunnel.test.js` leaves `sol500-bin-*` and `sol500-cancel-*` folders in `%TEMP%` on every run (pre-existing; the Project-tab refresh and `npm run app` now run the suite too). Add `t.after` cleanup.
- Gaps: a non-`127.0.0.1` loopback (e.g. `127.5.5.5`); the lost-cause mapping, other CSV prefixes, the cap on load and control characters in `cleanName`; Wi-Fi password boundaries 8/64/65; the progress-refresh `busy` branch; a hostile co-op name (`=HYPERLINK`, `<img onerror>`) through `history.csv` end to end.
- The i18n test checks key presence only; `{param}` drift between `en` and `vi` would not be caught (none today).
- The heartbeat test (50 ms, 200 ms settle) may be timing-sensitive on a slow machine.
- Tidy-ups: hoist the requires in `test/ws.test.js` and drop the "(Task 7)" label; header comments on the new test files; unused `catch` bindings in `tools/progress.js`; `missionEnded` passes the live state by reference; a non-function `onEvent` is silently ignored.
