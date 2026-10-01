# SOL 500 v3 — Desktop App · Online Share Link · Big Random Map · Admin Panel

**Date:** 2026-10-01 · **Status:** design approved in chat (parts 1–3); spec awaiting review
**Builds on:** `2026-09-30-sol500-mars-outpost-design.md` (v1/v2: engine, roles, LAN co-op, walkable outpost)
**Branch:** `feat/v3-app-online-bigmap-admin`

## 0. Decisions (from the user, 2026-10-01)

| Question | Answer |
|---|---|
| App type | Windows desktop app: its own window, no Node install, hosts the server itself |
| "Host the server on web" | Share link from the host's PC (Cloudflare quick tunnel), no account |
| What exploring gives | Resources & finds · Shelter & survival · Dangers · Fog of war + minimap |
| How exploring ties into the mission | Approach A, the **expedition layer**: explore in real time during each round's planning phase; banked finds count when the round advances |
| Admin panel | All three tabs: Game history · Live server control · Project progress |

## 1. Goals & success criteria

1. **App:** `SOL500-Setup.exe` installs and runs on Windows 10/11 without Node. Solo, Host and Join all work from the app.
2. **Online:** a friend on another network joins through the share link and sees teammates move smoothly. The median position round-trip through the tunnel must be under 300 ms, measured in the M1 spike and in QA. The admin panel can't be reached through the link (automated test).
3. **Big map:** the same mission code gives the same map on every computer. Generating a Large map takes ≤ 200 ms. Every find is reachable (tested on 300 seeds × 2 sizes). The median frame rate is ≥ 50 fps in a Chrome performance trace on the dev laptop, on a Large map with 5 avatars and devils on screen.
4. **Exploring matters, without breaking balance:**
   - The debrief shows what was found and by whom.
   - Balance bots over 1000 seeds keep the v2 targets: the naive bot succeeds < 35 % and the balanced bot > 70 %, both with and without exploring.
   - Exploring raises the existing "sloppy player, recommended kit" bot's success rate by 10–25 points.
5. **Run length:** a solo mission without exploring still fits in 10–20 minutes. With full exploring it fits in about 30 minutes.
6. **Admin:**
   - Every finished mission (solo, LAN or online) is recorded.
   - The live view updates within 2 s.
   - Kick and close work.
   - The project tab shows the checklist, tests, commits and sources.

**Non-goals:** Mac/Linux app builds, code signing, accounts or logins, an always-online cloud server, player-vs-player play, changing the 20-round × 25-sol mission structure.

## 2. The big random map (`src/worldgen.js`)

**Size**
- The host picks **Normal 96×96** (default) or **Large 128×128** tiles. Tiles are 64 px; the current map is 15×11.
- The base's 9×5 build grid sits in the centre, so the engine's build rules (`buildSpots`, `touchesBase`) don't change.
- A flat ring 6 tiles wide is kept around the base.

**Determinism:** `generate(seed, size)` is a pure function. Every client generates the map locally from the mission code, so the map is never sent over the network. Results are cached per (seed, size).

**Terrain layers**, in generation order:
1. **Elevation:** fractal value noise. High ground becomes **mesas** with a **cliff** border (blocks movement).
2. **Dunes:** a second noise field. Dunes slow walking to ×0.7; the rover isn't slowed.
3. **Boulder fields:** a third noise field. Scattered single boulders block movement.
4. **Craters:** 6–10 on Normal (scaled by area on Large), radius 4–9. Each has a raised **rim** (blocking) with 1–2 gaps and a flat floor.
5. **One canyon:** a noise-guided walk across the map, 3–5 tiles wide. The walls block movement; there are at least 3 ramps.
6. **Lava-tube entrances (caves):** placed on mesa or canyon walls. Each cave tile is a shelter zone.

**Finds** are placed by Poisson-disc sampling with at least 6 tiles between them. Distance rings set how rich a find is: inner ≤ 20 tiles from the base, middle 20–40, outer > 40. The values below are starting points that `tools/balance.js` tunes.

| Find | Where | Normal count | Gives |
|---|---|---|---|
| Ice deposit | crater floors, canyon | 8 | 3 / 4 / 6 loads (by ring) × 40 kg water |
| Metal-rich rock | anywhere outside the base ring | 12 | 3 / 4 / 5 loads × 40 kg materials |
| Crashed cargo pod (fictional, from earlier uncrewed supply landers) | plains | 5 | 3 loads, each a spare kit, 60 kg food, or an O₂ canister |
| Science site (layered rock, meteorite, old delta, methane vent) | mixed | 7 | one survey: 20 / 35 / 60 science |
| Cave | mesa/canyon walls | 4 (≥ 1 within 25 tiles of the base) | shelter |

**Guarantees, enforced and tested:**
- The flat base ring exists.
- Every find and cave can be reached on foot from the base. A flood fill checks this; if a find is unreachable, a ramp is carved through the nearest blocking boundary.
- The minimum counts per ring are met.
- The generator is deterministic.

**Output:** `{ w, h, tiles: Uint8Array, sites: [{ id, kind, x, y, loads, amount, ring }], caves: [{ x, y }], base: { x, y } }`. Tile codes cover regolith, dune, boulder, cliff, rim, crater floor, canyon floor, canyon wall, cave, ramp and base.

**Rendering** (`src/surface.js`, split into `src/surface-*.js` files if needed):
- Ground is drawn in chunks of 16×16 tiles into offscreen canvases, created lazily and kept in a cache of up to 30. Only visible chunks are drawn.
- **Minimap:** 1 px per tile, updated incrementally. It shows fog, crew dots in role colours, discovered finds, the base and pings.
- **Fog of war:** tiles start unseen. Seen tiles show the remembered terrain dimmed, and currently visible tiles show it fully.

## 3. Exploring — the expedition layer (`src/expedition.js`)

### 3.1 The loop
- Each round's planning phase is when players walk out ("go on EVA"), collect finds, and **deliver** them at the base.
- Delivered finds are **banked** and added to the mission when the round advances. The report shows lines like "+160 kg water — north ice field (Bao)".
- Finds are finite, so later rounds push farther out.
- **Collecting:** stand next to a find and hold **E** or the action button. A load takes 3 s; a science survey takes 5 s.
- **Backpack:** 3 loads, or 8 while driving the rover.
- **At round end**, everyone is back at the base when the next round starts. Anything still in a backpack is banked automatically at the start of the next round, a one-round delay.

### 3.2 Suit oxygen — one charge per round
*(Refined from chat Part 1. See §13.)*
- Each crew member starts every round with a full suit charge of **150 s outside**.
- Being inside the base zone (within 2 tiles of the habitat) **pauses** the drain but **does not refill** the suit.
- Sprinting doubles the drain. In the rover it's halved.
- An **O₂ canister** from a pod gives a choice: use it now (+45 s suit time) or carry it home (+30 kg base O₂).
- **At 0 s you collapse:**
  - In multiplayer, a teammate revives you by holding E for 4 s (2 s for the Medic). You get +30 s and stand up.
  - If nobody revives you before the round advances, a **collapse incident** is recorded: −20 health and −3 morale at advance. Anything you were carrying drops on that spot as a recoverable find.
  - In solo play nobody can revive you, so collapsing records the incident straight away and returns you to the base for the rest of the round. You can't go back out until the next round.

### 3.3 Role skills on the map
| Role | Skill |
|---|---|
| Scientist | surveys in half the time, +50 % science from sites |
| Engineer | mines metal and salvages pods in half the time |
| Biologist | sees ice deposits and methane vents on the minimap from 16 tiles (others 8); collects ice in half the time |
| Medic | revives in half the time |
| Commander | pings draw a route line for everyone; crew within 5 tiles move 10 % faster |

### 3.4 Survival events on the map
- **Solar flare:** in rounds whose schedule has `spe`, a warning starts 30 s after the first crew member steps outside, timed by the server in multiplayer. A **60 s countdown** follows.
  - Shelter zones are the base zone, cave tiles and the built storm-shelter module.
  - Crew outside shelter when the countdown ends get a **flare incident**: +15 mSv at advance, on top of whatever the SPE decision card chose.
- **O₂ rupture event:** canisters carried home count as base O₂, which offsets the loss. The decision card is unchanged.
- **Dust devils:**
  - Rounds whose schedule has `devil` spawn 3–5 devils; other rounds spawn 0–1.
  - Their paths come from a seed plus the time since the round started (one shared clock), so every client draws them in the same place without syncing.
  - A hit pushes you 2 tiles and costs 10 s of suit time. The rover is immune.
- **Dust storms** (the existing weather) shrink how far you can see: 8 tiles when clear (10 in the rover), 5 in a regional storm, 3 in a global one.
- **Terrain:** dunes slow you down; cliffs, rims, canyon walls and boulders block you.

### 3.5 Team features
- Fog is shared: anything any crew member sees is revealed for everyone.
- **Ping:** press P or tap the minimap. Pings fade after 10 s.
- The HUD shows each teammate's suit level and what they're carrying.

### 3.6 Debrief "Expedition" section
- Distance walked and finds per player.
- The single most valuable find.
- A real-world lesson on in-situ resource utilisation (ISRU: using local ice and rock), with NASA sources added in M4 (see §14).

## 4. Engine integration (`src/engine.js`)

**New mission state:** `mission.expedition` is created by `createMission` for new missions.

```
{ mapSize, revealed: <base64 bitset>, sites: { siteId: loadsLeft }, carried: { crewId: [{ kind, amount, siteId }] },
  drops: [{ x, y, items }], banked: { water, materials, spares, food, o2, science, lines: [...] },
  incidents: [{ crewId, kind: 'collapse'|'flare' }], stats: { crewId: { distance, finds: { ice, metal, pod, science } } } }
```

**`resolveTurn`** applies the banked haul and incidents before simulating, adds them to the report, then resets them. The carried items and stats persist. The engine only reads these numbers and doesn't depend on `worldgen.js`.

**`src/expedition.js`** is pure UMD. The server uses it in multiplayer and `ui.js` uses it in solo play:
- `createExpedition(seed, size)`
- `collect(m, crewId, siteId, pos)`
- `deliver(m, crewId, pos)`
- `useCanister(m, crewId)`
- `revive(m, crewId, targetId, pos)`
- `collapse(m, crewId, pos)`
- `flare(m, crewIds)`
- `reveal(m, cells)`

Each validates distance (1.5 tiles of tolerance), loads left and backpack space, and returns `{ error }` or `{ state }`. Pings aren't mission state: they travel as short-lived WebSocket messages (§5).

**Old saves:** a mission saved before v3 gets an `expedition` (Normal size) added when it loads. The base grid is unchanged, so the big map simply grows around it. Only one renderer is needed.

## 5. Multiplayer & networking

**Why the change:** Cloudflare quick tunnels **do not support Server-Sent Events**, so live updates move to **WebSockets** for both LAN and online play, one path for both.
- **Library:** `ws` (npm). This is the server's first runtime dependency.
- **App:** the app bundles `ws`.
- **Launcher:** `Play SOL 500.cmd` runs `npm install --omit=dev` once if `node_modules` is missing, which needs internet once.

**Endpoint:** `/ws?code=&player=&token=`. HTTP POST `/api/room/act` stays for actions (create, join, claim, plan and expedition actions).

| Direction | Message | Notes |
|---|---|---|
| server→client | `room` | full public room on change (replaces SSE `room`) |
| server→client | `pos` | all positions + suit level + carried count, throttled to 80 ms |
| server→client | `fog` | revealed-cell diff, throttled to 500 ms |
| server→client | `event` | `flare` (start time), `ping` (x, y, from), `kicked`, `closed` |
| client→server | `pos` | at most every 110 ms (as now) |
| client→server | `reveal` | newly seen cells |
| client→server | `ping` | x, y; at most 1 per second per player |

- The server pings every 20 s. Clients reconnect with backoff from 0.5 s to 5 s and get a full `room` message on reconnect. The SSE endpoint is removed.
- **Trust model:** this is a co-op game, so clients report their own suit level, collapses and flare exposure. Item actions (collect, deliver, revive) are checked on the server against the last position it received.

**Server split**, because `server.js` would otherwise triple in size. The tests keep importing `createServer` from `server.js`.

| File | Job |
|---|---|
| `server.js` | startup, CLI flags, static files, HTTP routing |
| `lib/rooms.js` | rooms, players, `apply()` actions, mission/plan/expedition handling |
| `lib/ws.js` | WebSocket upgrade, auth, fan-out, heartbeat |
| `lib/limits.js` | detects remote (tunnel) requests; rate limits |
| `lib/history.js` | saves finished missions to `<dataDir>/history.json` |
| `lib/admin.js` | admin API and key check |

## 6. Desktop app (`app/`)

- **Stack:** Electron and electron-builder, as dev dependencies. `npm run app` builds `dist-app/SOL500-Setup-<version>.exe`: an NSIS installer, per-user, with no admin rights needed, a Start-menu entry and a desktop shortcut.
- **`app/main.js`**
  - Takes a single-instance lock; a second launch focuses the existing window.
  - Picks a port: 5050–5059, or a free one if all are busy.
  - Starts the server in-process with `createServer({ dataDir: userData, adminKey })`.
  - Opens a `BrowserWindow` (1280×800, minimum 960×600, remembers its size) loading `http://localhost:<port>/?app=1`, with `contextIsolation`, `sandbox`, and no `nodeIntegration`.
  - Kills the tunnel on quit.
- **`app/preload.js`** exposes `window.solApp = { adminKey(), hostOnline(), stopOnline(), onOnline(cb) }` and nothing else.
- **Title screen in the app:** Play solo · Host game · Join game · Admin.
- **Windows warnings:** Windows Firewall asks once on the first Host; players choose "Allow" for private networks. SmartScreen warns because the app is unsigned; players click "More info → Run anyway". Both are explained on an in-game help screen (M5).
- **Unchanged ways to play:** the browser via `node server.js` or `Play SOL 500.cmd`, and the offline `dist/sol500.html`. The offline file is solo-only, with no history or admin, but it does have the big map.

## 7. Online share link (`app/tunnel.js`)

**Starting it**
1. **Host online** downloads a pinned `cloudflared` version for windows-amd64 from its GitHub release into `<userData>/bin`, the first time only. It checks the file's **SHA-256 against a hash pinned in the code** and refuses to run on a mismatch.
2. It spawns `cloudflared tunnel --url http://localhost:<port> --no-autoupdate` and reads the `https://*.trycloudflare.com` address from its output, with a 30 s timeout.
3. The app shows the link with Copy and a QR code.

**Stopping it:** **Stop sharing** kills the process; a new link is made each time. The server is told the state through `server.setOnline({ url })` so the admin panel can show it.

**Detecting remote requests** (`lib/limits.js`): a request counts as remote if it carries `Cf-Connecting-IP`, **or** its Host is `*.trycloudflare.com`, **or** its socket address isn't loopback or private LAN.

**Rules for remote requests**
- Admin endpoints and the admin page return 404.
- `/api/info` hides LAN addresses.
- Rate limits apply per client IP: room create 10/min, join 30/min, actions 20/s per player, WS messages 30/s per connection.

**Global caps:** 40 rooms (as now), 5 players per room (as now), 100 WebSocket connections, 64 KB per request or message.

Static file serving keeps its allow-list, so `src/*.js|css`, `icons/*.png`, `index.html`, `admin.html`, the manifest and the service worker are all it serves.

**Known limits** (from Cloudflare's docs): no uptime guarantee and at most 200 in-flight requests per quick tunnel. Five players with WebSockets is well under that.

## 8. Admin panel (`admin.html`, `src/admin.js`)

**Access**
- In the app, the **Admin** button opens the panel.
- From the CLI, the server prints `http://localhost:<port>/admin#key=<key>`. The key sits in the URL fragment, so it never reaches server logs.
- `admin.js` sends the key as an `X-Admin-Key` header. The server compares it in constant time and refuses all remote requests.
- The key is 128 random bits and changes on every server start.

**Tab 1: Game history**
- A finished mission (success or lost) is saved to `<dataDir>/history.json`:
  - written atomically (temp file + rename)
  - capped at 2000 records, oldest dropped first
  - `dataDir` is the app's `userData` folder, or `./data/` when running from source (git-ignored)
- **Record:** `{ id, endedAt, mode: solo|lan|online, missionCode, difficulty, crewSize, mapSize, players: [{ name, crewId, role }], outcome, cause, score, grade, sols, finds: { crewId: {...} }, distance: { crewId: m }, achievements: [] }`.
- `mode` is `online` if any player connected through the tunnel.
- **Who records what:** LAN and online games are recorded by the server when the room reaches debrief. Solo games in the app or in a browser served by the server are recorded when the client POSTs `/api/history/solo` (local requests only). The server re-scores those with `E.scoreMission`.
- **What the tab shows:**
  - Totals: missions, win rate, best score, total finds
  - Charts using `src/charts.js` and the dataviz rules: score over time (line), wins vs losses, failure causes (bar)
  - A sortable table; clicking a row shows the debrief summary
  - Export CSV · delete one · clear all (with confirmation)

**Tab 2: Live server** (polls `/api/admin/live` every 2 s)
- Shows: uptime, port, LAN addresses, share-link status (link + QR) and players online.
- For each room: code, stage, round and sol, map size, and each player's name, role, connected state, last seen and whether they're remote.
- **Actions:** kick a player, close a room, stop sharing (in the app only, through IPC).
- A log of the last 100 events.

**Tab 3: Project progress** (reads `progress.json`, made by `tools/progress.js`)
- **Contents:** `{ generatedAt, features: [{ milestone, text, done }], tests: { total, pass, fail }, commits: { count, recent: [{ hash, date, subject }] }, code: { files: [{ path, lines }], total }, sources: [{ label, url }] }`.
- **Where the data comes from:**
  - Features come from §12 of this spec.
  - Tests come from `node --test` with the TAP reporter.
  - Commits come from `git log`.
  - Sources come from `src/i18n.js`.
- **When it's made:** at `npm run progress` and automatically by `npm run app`. From source, a **Refresh** button re-runs it. The packaged app shows its build-day snapshot with the date. `progress.json` is git-ignored.

## 9. File map (new and changed)

| File | Status | Job |
|---|---|---|
| `src/worldgen.js` | new | seeded map generator (UMD, pure) |
| `src/expedition.js` | new | exploring rules (UMD, pure) |
| `src/engine.js` | changed | apply banked haul and incidents in `resolveTurn`; create `expedition` |
| `src/data.js` | changed | `WORLD` and `EXPEDITION` constants |
| `src/surface.js` (+ `src/surface-*.js`) | changed | big map, chunks, fog, minimap, suit HUD, devils, flare countdown |
| `src/net.js` | changed | WebSocket client, reconnects |
| `src/ui.js` | changed | app title buttons, map-size setting, expedition report lines, debrief section, solo history POST |
| `src/i18n.js` | changed | EN + VI text for everything new |
| `admin.html`, `src/admin.js` | new | admin panel |
| `server.js`, `lib/*.js` | changed/new | split server, WebSockets, limits, history, admin |
| `app/main.js`, `app/preload.js`, `app/tunnel.js` | new | desktop app and share link |
| `package.json` | new | scripts: `test`, `start`, `progress`, `app`, `app:dev`; deps: `ws`; dev deps: `electron`, `electron-builder` |
| `tools/progress.js` | new | generates `progress.json` |
| `tools/balance.js` | changed | explorer bot (haul model) |
| `Play SOL 500.cmd`, `play.sh` | changed | install `ws` once if missing |

## 10. Testing

**Unit tests (`node --test`)**
- **worldgen:** determinism; reachability, counts, base ring and timing on 300 seeds × 2 sizes.
- **expedition:** collect/deliver/capacity/distance errors; canister both ways; collapse drops; revive; flare; reveal OR-merge.
- **engine:** banked haul and incidents applied once, reported, then reset; old saves without `expedition` still work.
- **server:** WebSocket auth, `room`/`pos`/`fog` fan-out, reconnect, kick/close; rate limits return 429.
- **Remote detection:** admin returns 404 with `Cf-Connecting-IP` or a trycloudflare Host, even with the key.
- **history:** atomic write, cap, solo POST refused when remote, CSV export.
- **progress:** parses the checklist and TAP output.

**Other checks**
- **Balance:** `tools/balance.js` with an explorer bot over 1000 seeds × 3 difficulties; the targets are in §1.4.
- **Browser QA** in Chrome DevTools:
  - a solo big-map mission start to finish
  - 2- and 5-player LAN
  - a live share-link game: one client through the trycloudflare URL
  - all admin tabs
  - EN/VI
  - phone width
- **App QA:** build, install and launch the installer; Solo/Host/Join/Admin; Host online; reinstall over the old version; uninstall.

## 11. Milestones

Each milestone is usable on its own. Work happens on `feat/v3-app-online-bigmap-admin`, with checks in a real browser before moving on.

1. **M1: App + online.** Spike WebSockets through a real quick tunnel first, and stop and report if it fails. Then the WebSocket switch, the server split, limits and remote detection, the Electron app, and Host online.
2. **M2: Admin panel.** History recording, the three tabs, progress generation.
3. **M3: Big random map.** Worldgen, chunked rendering, minimap, fog, map-size setting.
4. **M4: Exploring.** Expedition rules, engine integration, role skills, suit O₂, flare countdown, devils, storms, debrief section, ISRU lesson and sources, rebalancing.
5. **M5: Polish.** Every new string in EN + VI, final balance pass, offline build, installer rebuild, help text for the Windows warnings.

## 12. Feature checklist

### M1 — App + online
- [ ] WebSocket transport through a real quick tunnel verified (spike)
- [ ] Live updates on WebSockets (LAN + online); SSE removed
- [ ] Server split into lib/ modules; existing tests still pass
- [ ] Remote-request detection and rate limits
- [ ] Desktop app window with built-in server
- [ ] Host online share link with Copy + QR
- [ ] Windows installer builds

### M2 — Admin panel
- [ ] Admin key and local-only access
- [ ] Mission history recorded (solo, LAN, online)
- [ ] History tab with totals, charts, table, CSV
- [ ] Live server tab with kick and close
- [ ] Project progress tab and generator

### M3 — Big random map
- [ ] Seeded map generator with guarantees
- [ ] Chunked rendering at 60 fps
- [ ] Minimap
- [ ] Shared fog of war
- [ ] Map size setting (Normal / Large)

### M4 — Exploring
- [ ] Collect, carry and deliver finds
- [ ] Finds counted at advance and in the report
- [ ] Role skills on the map
- [ ] Suit oxygen, collapse and revive
- [ ] Solar flare countdown and shelters
- [ ] Dust devils and storm visibility
- [ ] Pings
- [ ] Debrief Expedition section and ISRU lesson
- [ ] Rebalanced with explorer bots

### M5 — Polish
- [ ] English + Vietnamese for every new screen
- [ ] Offline single-file build updated
- [ ] Final installer build tested

## 13. Refinements made while writing this spec (need the user's OK)

1. **Suit oxygen refills once per round, not at the base.** Rounds have no clock, so if the base refilled your suit, the best play would be emptying the whole map in round 1. A mission could then take hours, and exploring would make the game too easy. With one charge per round, each EVA is a real decision. Standing at the base still pauses the drain.
2. **Revive only, no carrying.** A fallen crewmate is revived on the spot. Carrying would need a new animation and new sync rules for little gain.
3. **Items still in a backpack at round end** are banked at the start of the next round instead of being lost.
4. **The server gains one dependency (`ws`).** `Play SOL 500.cmd` installs it once on its first run, which needs internet that one time. The app includes it.

## 14. Risks

| Risk | Plan |
|---|---|
| WebSockets through quick tunnels fail or are unreliable | M1 spike first; fallback is HTTP long-polling (works through any proxy) |
| Quick tunnels have no uptime guarantee | Fine for play sessions; the status shows errors and offers a new link |
| Antivirus flags the unsigned app or the cloudflared download | Pinned version and hash check; documented "Run anyway" steps |
| Missions get too long with exploring | Suit time per round is tunable; exploring stays optional; measured in playtests |
| Slow laptops | Chunk cache, fewer particles, render only the visible area |
| ISRU, lava-tube and dust-devil facts | Real NASA sources are found and checked in M4 before any in-game claim is written; no invented citations |

## 15. Sources

**Already in the game:** see the v1 spec §6.
**Cloudflare quick-tunnel limits:** https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
**New science sources:** ISRU and water ice on Mars, lava tubes as shelter, and dust devils will be researched and verified in M4 and added to `src/i18n.js`.
