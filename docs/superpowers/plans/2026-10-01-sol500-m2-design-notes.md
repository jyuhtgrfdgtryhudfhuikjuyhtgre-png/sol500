# SOL 500 M2 (admin panel) — design notes for writing the plan

Status: the M2 plan is **not written yet**. These are the decisions I'd worked out (2026-10-01) from reading the code, so the plan can be written straight from them. Branch: `feat/m2-admin-panel` (off `master` `dc50358`). Spec: v3 spec §8 and §12 M2. Also pull in the "For the M2 plan" items from `2026-10-01-sol500-m1-followups.md`.

## Facts checked in the code
- A finished mission state is about 21 KB as JSON, under the 64 KB body cap, so solo history can POST the whole state.
- End cause: `mission.endCause = { type: 'crew', reason, crewId, sol }`.
  - Possible reasons: hypoxia, dehydration, starvation, cold, habFault, radiationSickness, injury, rations, health.
  - i18n has long `cause.<reason>` texts, so the admin panel needs short `admin.cause.<reason>` labels in EN and VI.
- `E.scoreMission(s)` returns `{ total, parts, grade, independence }`, and `E.achievements(s)` returns an array of ids.
- Solo flow: `ui.js advance()` calls `E.resolveTurn`, then `checkBadges`. Post the history there when `state.status !== 'active'` and `store.lanInfo` is set (served by the server). Do it once per mission.
- `charts.js lineChart` forces the x-axis to 0…≥500 sols with ticks every 100. Add `cfg.xMin`/`cfg.xMax`/`cfg.xTicks` overrides for "score per mission", and add a `barChart` for wins vs losses and failure causes. Read the dataviz skill first.
- Reusable CSS: `.panel`, `.btn*`, `.chip ok/crit`, `.eyebrow`, `.hint`, `.score-table`, `.tablewrap`, `.log`, `.modal*`, `.seg`. Icons include trophy, users, wifi, clock, star, refresh, copy, close, flag, chevron.
- In the app, the title block's `host-game`/`join-game` buttons are at `ui.js` ~335. Add an `admin` button there that sets `location.href = '/admin'` (same origin, allowed by the navigation guard).

## Decisions
- **Admin is this-PC only.** Add `isLoopback(req)` to `lib/limits.js`: no Cloudflare header, not a trycloudflare host, and a loopback socket.
  - `/admin`, `/api/admin/*` and `POST /api/history/solo` return 404 to everyone else, including LAN devices.
  - The key is checked with `timingSafeEqual` on the `X-Admin-Key` header. A wrong key gets 401.
- **`createServer({ dataDir, adminKey, progressFile, allowProgressRefresh })`.**
  - `dataDir` defaults to `./data`; the app passes `userData`.
  - The key is 16 random bytes in hex.
  - `server.adminKey`, `server.setOnline({ url, qr } | null)`.
  - The CLI prints `http://localhost:<port>/admin#key=<key>`.
- **`lib/rooms.js`.**
  - `createRooms({ onEvent, presentMs })`.
  - Events: roomCreated, playerJoined (with remote), playerReplaced, playerLeft, playerKicked, roundResolved, missionEnded, roomClosed.
  - `player.remote` and `room.everRemote` are set at create/join from `isRemote(req)`.
  - `removePlayer(room, player, kind)` passes `kind` to `client.close`.
  - `kick(code, playerId)` sends the 'kicked' event.
  - `close(code)` sends the 'closed' event.
  - `snapshot()` returns the list for the live tab.
  - Call `maybeResolve` after a kick and after the grace timer fires during ops.
- **`lib/history.js`.**
  - `summarize(mission, { mode, players })` calls the engine for score, grade and achievements. `finds`/`distance` stay `{}` until M4.
  - `createHistory({ dataDir, cap: 2000 })` stores records newest first.
  - Writes are atomic (temp file + rename), with a copy fallback on EPERM.
  - A corrupt file is moved aside as `history.corrupt-<ts>.json`.
  - `toCSV` adds a UTF-8 BOM, quotes values, and guards against formula injection (strings only).
- **History recording.**
  - The server records LAN/online games on `missionEnded`. The mode is `online` if `room.everRemote`.
  - Solo games come in through `POST /api/history/solo { mission }`. Validate it and re-score on the server.
- **`lib/admin.js` endpoints.**
  - `GET /admin` (serves `admin.html`)
  - `GET /api/admin/history`, `GET /api/admin/history.csv`
  - `POST /api/admin/history/delete {id}`, `POST /api/admin/history/clear`
  - `GET /api/admin/live`: uptime, port, addresses, online `{url, qr}`, `rooms.snapshot()`, and the last 100 events
  - `POST /api/admin/kick`, `POST /api/admin/close`
  - `GET /api/admin/progress`
  - `POST /api/admin/progress/refresh`: dev only. It runs `tools/progress.js` with `ELECTRON_RUN_AS_NODE=1`; tests pass `allowProgressRefresh: false` and expect 409.
- **`tools/progress.js`.**
  - Parses spec §12 into `{ milestone, text, done }`.
  - Runs `node --test --test-reporter=tap` and parses the `# tests/# pass/# fail` lines.
  - Collects git count and the last 10 commits, line counts of tracked code, and `SOURCES` from i18n.
  - Exports the pure parsers for `test/progress.test.js`.
  - `npm run progress`. `npm run app` runs it first; add `progress.json` and `admin.html` to `build.files`.
- **App.**
  - The preload gets `adminKey()`, served by IPC `admin:key` with the same sender check as `join:open`.
  - Add sender checks to `online:start`/`online:stop` (M1 follow-up).
  - `main.js` passes `dataDir`/`adminKey` and calls `server.setOnline` from `sendStatus` on/off.
- **`ws.js` follow-ups.**
  - At most 3 sockets per seat, refused with 503.
  - `opts.heartbeatMs` for tests.
  - Tests for: 503 at capacity, 404 on a non-`/ws` upgrade, the per-seat cap, and heartbeat termination (a `ws` client with `autoPong: false`).
- **Admin page.**
  - `admin.html` plus `src/admin.js` and `src/admin.css`. It loads i18n, art, charts and admin.js, follows the game's `sol500.lang`, and every string is in EN and VI.
  - **History tab:** totals, charts, a sortable table, a detail view, CSV download (fetch → blob, because of the key header), delete, and clear with confirmation.
  - **Live tab:** polls every 2 s. Shows rooms and players, kick and close (with confirm), the share link with QR, and Stop sharing (app only).
  - **Project tab:** progress by milestone, tests, commits, code size, sources, and Refresh in dev.
- **Rough task order:**
  1. rooms events/kick/close
  2. history
  3. admin + server
  4. ws hardening
  5. progress tool
  6. admin page: history
  7. admin page: live + project
  8. app integration + solo POST + Admin button
  9. end-to-end QA, installer rebuild, spec M2 boxes
- **Execution:** subagent-driven (the user asked for polish). Exact commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
