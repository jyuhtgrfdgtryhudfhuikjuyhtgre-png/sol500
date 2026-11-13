# SOL 500 M1 — Desktop App + Online Share Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows desktop app (`SOL500-Setup.exe`) that runs the game in its own window with a built-in server, and lets the host share a Cloudflare quick-tunnel link so friends anywhere can join. Live updates move from Server-Sent Events to WebSockets.

**Architecture:**
- Room logic moves out of `server.js` into a transport-free `lib/rooms.js`. "Clients" are any objects with `send(type, data)` and `close()`.
- `lib/ws.js` plugs WebSockets into it, and `lib/limits.js` spots requests that arrive through the share link and rate-limits them.
- The Electron main process (`app/main.js`) starts that same server in-process, opens a sandboxed window on `http://localhost:<port>`, and runs `cloudflared` (`app/tunnel.js`) on request.

**Tech Stack:** Node 24 (dev) · `ws` 8 · Electron (latest) · electron-builder (NSIS) · `qrcode` · `node:test` · Chrome DevTools MCP for browser QA.

**Spec:** `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (§5, §6, §7, §11 M1, §12 M1 checklist)

## Global Constraints

- Players need Windows 10/11 and **no Node install**. The installer is per-user NSIS and needs no admin rights.
- **Runtime dependencies:**
  - Server: `ws` only.
  - App main process: `ws` + `qrcode`. `qrcode` isn't in the spec's §9 list; it draws the QR code in the main process, and the user is told.
  - Dev only: `electron`, `electron-builder`.
- **Caps:**
  - 5 players per room, 40 rooms (unchanged)
  - 100 WebSocket connections
  - 64 KB per HTTP body or WebSocket message
- **Remote (share-link) limits:**
  - room create: 10/min per IP
  - join: 30/min per IP
  - actions: 20/s per player
  - WebSocket messages: 30/s per connection (applies to all sockets)
- A request is **remote** if it has a `Cf-Connecting-IP` header, **or** its Host ends in `.trycloudflare.com`, **or** its socket address isn't loopback or private LAN. Remote callers never see LAN addresses.
- **WebSocket endpoint:** `/ws?code=&player=&token=`. Frames are JSON `{ t, d }`:
  - server → client: `room`, `pos`, `event` (`{ kind }`)
  - client → server: `pos`
- **App ports:** try 5050–5059 in order, else port 0 (the OS chooses).
- **Window:** 1280×800, minimum 960×600. `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- **Tunnel:**
  - pinned `cloudflared` version plus its SHA-256, checked before every run
  - command: `tunnel --url http://127.0.0.1:<port> --no-autoupdate`
  - 30 s start timeout
- Every new player-facing string exists in **both** `en` and `vi` in `src/i18n.js` (guarded by `test/i18n.test.js`).
- The existing 64 tests stay green after every task. `npm test` = `node --test`.
- Each commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. In the commands below that's the second `-m`.
- Work on branch `feat/v3-app-online-bigmap-admin`. Before any browser QA, stop any old server on the port (`netstat -ano | grep ":5050 " | grep LISTENING`). A stale server was the cause of the 2026-09-30 LAN bug.
- `SCRATCH="<scratchpad>/spike-tunnel"` is used for throwaway files and screenshots.

## Review Focus

The five things a real player is most likely to hit that the spec doesn't spell out. Each has a test in the task named.

1. **Wi-Fi blip or laptop sleep mid-game.** The socket drops; the player should reconnect into the same seat with no duplicate player. → Task 5 test "a player who drops and reconnects keeps their seat"; Task 6 browser check with `SolNet.dropForTest()`.
2. **Port 5050 already taken**, e.g. an old `Play SOL 500.cmd` server still running. The app should start on the next port and show that real address. → Task 8 `pickPort` test plus a smoke run with 5050 blocked.
3. **The share link dies mid-game** (cloudflared crash or a Cloudflare drop). The host should see that sharing stopped and get a retry button; guests should see "Lost connection". → Task 9 test "the host hears about it when the share link dies mid-game"; Task 11 live check.
4. **A stranger on the link sends junk:** bad JSON, a message over 64 KB, or a flood. Junk should be ignored or that one socket closed, while the server keeps serving everyone else. → Task 5 tests.
5. **Double-clicking the app twice.** The second launch should focus the first window and must not start a second server. → Task 8 Step 8.

---

### Task 1: Spike — WebSockets through a real Cloudflare quick tunnel

Throwaway code in `$SCRATCH`; only `app/cloudflared.json` (the verified pin) is kept.

**Files:**
- Create (throwaway): `$SCRATCH/spike-server.js`, `$SCRATCH/spike-client.js`
- Create (kept): `app/cloudflared.json`

**Interfaces:**
- Produces: `app/cloudflared.json` = `{ "version": "<tag>", "url": "https://github.com/cloudflare/cloudflared/releases/download/<tag>/cloudflared-windows-amd64.exe", "sha256": "<64 hex>" }`, read by `app/tunnel.js` (Task 9).
- Produces a decision: go on only if WebSockets work through the tunnel with a median RTT under 300 ms. Otherwise **stop and report to the user**; the fallback (HTTP long-polling) changes Tasks 5–6.

- [ ] **Step 1: Find the latest cloudflared release and its published checksum**

```bash
mkdir -p "$SCRATCH" && cd "$SCRATCH"
curl -s https://api.github.com/repos/cloudflare/cloudflared/releases/latest > rel.json
node -e "
const r = require('./rel.json');
const a = r.assets.find(x => x.name === 'cloudflared-windows-amd64.exe');
const fromBody = (r.body.match(/cloudflared-windows-amd64\.exe:\s*([a-f0-9]{64})/) || [])[1] || null;
console.log(JSON.stringify({ tag: r.tag_name, url: a && a.browser_download_url, digest: a && a.digest, fromBody }, null, 2));
"
```
Expected: a tag, the download URL, and at least one of `digest` (`sha256:…`) or `fromBody`.

- [ ] **Step 2: Download and verify the binary**

```bash
cd "$SCRATCH"
URL=$(node -e "const r=require('./rel.json');console.log(r.assets.find(x=>x.name==='cloudflared-windows-amd64.exe').browser_download_url)")
curl -sL -o cloudflared.exe "$URL"
sha256sum cloudflared.exe
./cloudflared.exe --version
```
Expected: the hash equals the published one from Step 1 (`digest` without the `sha256:` prefix, or `fromBody`). **If they differ, stop and report.** `--version` prints the same tag.

- [ ] **Step 3: Write the throwaway echo server**

`$SCRATCH/spike-server.js`:
```js
const http = require('node:http');
const fs = require('node:fs');
const { WebSocketServer } = require('ws');
const seen = [];
const note = (kind, req) => { seen.push({ kind, url: req.url, headers: req.headers }); fs.writeFileSync('seen.json', JSON.stringify(seen, null, 2)); };
const server = http.createServer((req, res) => {
  note('http', req);
  if (req.method === 'POST') {
    let b = '';
    req.on('data', c => { b += c; });
    req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(b); });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('spike ok');
});
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  note('upgrade', req);
  wss.handleUpgrade(req, socket, head, ws => ws.on('message', m => ws.send(m.toString())));
});
server.listen(5099, '127.0.0.1', () => console.log('spike server on 5099'));
```

- [ ] **Step 4: Write the throwaway client**

`$SCRATCH/spike-client.js`:
```js
const base = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = { base };
  for (let i = 0; i < 30; i++) { // new quick-tunnel names can take a few seconds to resolve
    try { out.get = (await fetch(base + '/')).status; if (out.get === 200) break; } catch (e) { out.getError = e.message; }
    await wait(2000);
  }
  out.post = await (await fetch(base + '/echo', { method: 'POST', body: '{"hi":1}' })).text();
  const ws = new WebSocket(base.replace('https:', 'wss:') + '/ws');
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); setTimeout(() => rej(new Error('ws open timeout')), 15000); });
  const rtts = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    ws.send(String(i));
    await new Promise(res => { ws.onmessage = e => { if (e.data === String(i)) res(); }; });
    rtts.push(performance.now() - t0);
  }
  rtts.sort((a, b) => a - b);
  out.wsMedianMs = Math.round(rtts[25]);
  out.wsP90Ms = Math.round(rtts[45]);
  ws.close();
  console.log(JSON.stringify(out));
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
```

- [ ] **Step 5: Run the server, open a quick tunnel, and measure**

```bash
cd "$SCRATCH" && npm init -y >/dev/null && npm install ws@8 --no-audit --no-fund
node spike-server.js                                                                     # run_in_background
./cloudflared.exe tunnel --url http://127.0.0.1:5099 --no-autoupdate > tunnel.log 2>&1   # run_in_background
for i in $(seq 1 30); do U=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" tunnel.log | grep -v "//api\." | head -1); [ -n "$U" ] && break; sleep 1; done; echo "$U"
node spike-client.js "$U"
node -e "const s=require('./seen.json');console.log(s.map(x=>[x.kind, x.headers['cf-connecting-ip']||null, x.headers.host]))"
```
Expected:
- The client prints `get: 200`, `post: '{"hi":1}'` and `wsMedianMs` under 300.
- `seen.json` shows that requests through the tunnel carry `cf-connecting-ip` and a `*.trycloudflare.com` host. **Record both facts.** Task 4 relies on them.

- [ ] **Step 6: Decide**

- If the WebSocket opened and the median is under 300 ms: continue.
- If it failed or was slow: stop all processes, report the numbers and the error to the user, and wait. Don't start Task 2.

- [ ] **Step 7: Keep the verified pin, stop the spike processes**

```bash
cd mars-outpost && mkdir -p app
node -e "
const fs = require('node:fs'), crypto = require('node:crypto');
const S = process.argv[1];
const r = JSON.parse(fs.readFileSync(S + '/rel.json', 'utf8'));
const a = r.assets.find(x => x.name === 'cloudflared-windows-amd64.exe');
const sha = crypto.createHash('sha256').update(fs.readFileSync(S + '/cloudflared.exe')).digest('hex');
fs.writeFileSync('app/cloudflared.json', JSON.stringify({ version: r.tag_name, url: a.browser_download_url, sha256: sha }, null, 2) + '\n');
console.log(fs.readFileSync('app/cloudflared.json', 'utf8'));
" "$SCRATCH"
```
Stop the background `spike-server.js` and `cloudflared.exe` tasks. Their link dies with them.

- [ ] **Step 8: Commit the pin**

```bash
git add app/cloudflared.json
git commit -m "chore: pin verified cloudflared release for the share link" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: package.json, the `ws` dependency, string-parity guard, launchers

**Files:**
- Create: `package.json`, `test/i18n.test.js`
- Modify: `.gitignore`, `Play SOL 500.cmd`, `play.sh`

**Interfaces:**
- Produces: `npm test`, `npm start`; `require('ws')` resolvable from the repo root.

- [ ] **Step 1: Write the guard test**

`test/i18n.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/i18n.js');

test('every English string has a Vietnamese twin and the other way round', () => {
  const en = Object.keys(I.STR.en);
  const vi = Object.keys(I.STR.vi);
  assert.deepEqual(en.filter(k => !(k in I.STR.vi)), [], 'missing in Vietnamese');
  assert.deepEqual(vi.filter(k => !(k in I.STR.en)), [], 'missing in English');
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/i18n.test.js`
Expected: PASS. Both have 585 keys today; this test guards every later task.

- [ ] **Step 3: Create package.json and install ws**

`package.json`:
```json
{
  "name": "sol500",
  "productName": "SOL 500",
  "version": "3.0.0",
  "private": true,
  "description": "SOL 500: run a Mars outpost for 500 sols. Real NASA numbers, English and Vietnamese, co-op for up to 5 players.",
  "author": "ccclbeep",
  "main": "app/main.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  }
}
```
```bash
npm install ws@8 --no-audit --no-fund
node -e "require('ws'); console.log('ws ok')"
```
Expected: `ws ok`, and `package.json` now has `"dependencies": { "ws": "^8.x.y" }` plus a `package-lock.json`.

- [ ] **Step 4: Ignore generated folders**

Append to `.gitignore`:
```
data/
dist-app/
progress.json
```

- [ ] **Step 5: Launchers install `ws` once**

`Play SOL 500.cmd` (full file):
```bat
@echo off
title SOL 500 - Mars Outpost
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   SOL 500 needs Node.js to host games on your network.
  echo   Download the LTS version from https://nodejs.org, install it, then double-click this file again.
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\ws\package.json" (
  echo.
  echo   First run: installing the network add-on, this needs internet once...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo   Could not install it. Check the internet connection and try again.
    pause
    exit /b 1
  )
)
echo.
echo   Starting SOL 500... your browser will open in a moment.
echo   Keep this window open while you play. Close it to stop the game server.
node server.js --open
pause
```

`play.sh` (full file):
```sh
#!/bin/sh
# SOL 500 launcher for macOS and Linux: starts the LAN server and opens the game in your browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "SOL 500 needs Node.js to host games. Install it from https://nodejs.org and run this again."
  exit 1
fi
if [ ! -f node_modules/ws/package.json ]; then
  echo "First run: installing the network add-on (needs internet once)..."
  npm install --omit=dev --no-audit --no-fund || { echo "Could not install it. Check the internet connection and try again."; exit 1; }
fi
node server.js --open
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: 65 tests pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore test/i18n.test.js "Play SOL 500.cmd" play.sh
git commit -m "chore: add package.json with ws, string-parity test, launchers install deps once" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Move room logic into `lib/rooms.js` (behaviour unchanged, still SSE)

**Files:**
- Create: `lib/rooms.js`, `test/rooms.test.js`
- Modify: `server.js` (whole file rewritten below)

**Interfaces:**
- Produces `createRooms()` returning:
  - `rooms: Map<code, room>`
  - `create(name) → { room, player } | { status, error }`
  - `join(code, name) → { room, player } | { status, error }`
  - `auth(code, playerId, token) → { room, player } | null`
  - `act(body) → { status, body }`, where `body` is the JSON the HTTP route returns
  - `position(room, player, data) → null | 'noCrew'`
  - `attach(room, player, client)` and `detach(room, player, client)`
  - `publicRoom(room)`
- A client is `{ send(type, data), close() }`. Fan-out types: `'room'` (public room) and `'pos'` (array of positions).
- `module.exports = { createRooms, MAX_PLAYERS }`.

- [ ] **Step 1: Write the failing tests**

`test/rooms.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRooms } = require('../lib/rooms.js');

function fakeClient() {
  return { got: [], closed: false, send(type, data) { this.got.push({ type, data }); }, close() { this.closed = true; } };
}

test('a client attached to a player hears every room change', () => {
  const R = createRooms();
  const { room, player } = R.create('Linh');
  const c = fakeClient();
  R.attach(room, player, c);
  assert.equal(c.got.at(-1).type, 'room');
  const r = R.act({ code: room.code, player: player.id, token: player.token, type: 'rename', name: 'Linh B' });
  assert.equal(r.status, 200);
  assert.equal(c.got.at(-1).data.players[0].name, 'Linh B');
});

test('positions reach other players in one throttled message', async () => {
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  const c = fakeClient();
  R.attach(room, host, c);
  R.act({ code: room.code, player: guest.id, token: guest.token, type: 'claim', crewId: 'minh' });
  R.position(room, guest, { x: 10, y: 20, dir: 'up' });
  R.position(room, guest, { x: 11, y: 21, dir: 'up' });
  await new Promise(r => setTimeout(r, 150));
  const pos = c.got.filter(m => m.type === 'pos');
  assert.equal(pos.length, 1);
  assert.deepEqual(pos[0].data.map(p => [p.crewId, p.x, p.y]), [['minh', 11, 21]]);
});

test("leaving closes that player's clients and an empty room disappears", () => {
  const R = createRooms();
  const { room, player } = R.create('Solo');
  const c = fakeClient();
  R.attach(room, player, c);
  R.act({ code: room.code, player: player.id, token: player.token, type: 'leave' });
  assert.equal(c.closed, true);
  assert.equal(R.auth(room.code, player.id, player.token), null);
});

test('a wrong token is not a player', () => {
  const R = createRooms();
  const { room, player } = R.create('Host');
  assert.equal(R.auth(room.code, player.id, 'nope'), null);
  assert.equal(R.act({ code: room.code, player: player.id, token: 'nope', type: 'rename' }).status, 403);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/rooms.test.js`
Expected: FAIL with `Cannot find module '../lib/rooms.js'`.

- [ ] **Step 3: Create `lib/rooms.js`**

```js
'use strict';
/*
 * SOL 500 — rooms: players, seats, actions and the authoritative co-op mission.
 * No networking in here. A transport attaches "clients" to a player (any object with
 * send(type, data) and close()) and every room change fans out to them.
 */
const crypto = require('node:crypto');
const E = require('../src/engine.js');
const D = require('../src/data.js');

const MAX_PLAYERS = 5;
const MAX_ROOMS = 40;
const ROOM_TTL = 6 * 60 * 60 * 1000;
const PRESENT_MS = 30 * 1000;
const POS_FANOUT_MS = 80;
const MAX_COORD = 5000; // world pixels; M3 (big map) raises this
const PLAN_KEYS = ['modulesOn', 'rations', 'habMode', 'choices', 'answered', 'drainWall', 'builds', 'scrap', 'request'];

const cleanName = (n, fallback) => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || fallback;
const newId = () => crypto.randomBytes(8).toString('hex');
const ok = () => ({ status: 200, body: { ok: true } });
const fail = (status, error) => ({ status, body: { error } });

function createRooms() {
  const rooms = new Map();

  function newCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += letters[crypto.randomInt(letters.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function present(p) { return p.clients.size > 0 || Date.now() - p.lastSeen < PRESENT_MS; }

  function publicRoom(room) {
    return {
      code: room.code, hostId: room.hostId, version: room.version, phase: room.phase,
      players: room.players.map(p => ({ id: p.id, name: p.name, crewId: p.crewId, ready: p.ready, connected: present(p) })),
      settings: room.settings, loadout: room.loadout, mission: room.mission, plan: room.plan,
      lastReport: room.lastReport, advice: room.advice, positions: Object.values(room.positions),
    };
  }

  function fanout(room, type, data) {
    for (const p of room.players) for (const c of p.clients) c.send(type, data);
  }

  function broadcast(room) {
    room.version++;
    room.touched = Date.now();
    fanout(room, 'room', publicRoom(room));
  }

  // Astronaut positions change many times a second, so they travel in their own small, throttled message.
  function position(room, player, body) {
    if (!player.crewId) return 'noCrew';
    const num = v => Math.max(0, Math.min(MAX_COORD, Math.round(Number(v) || 0)));
    room.positions[player.crewId] = {
      crewId: player.crewId, x: num(body.x), y: num(body.y),
      dir: ['up', 'down', 'left', 'right'].includes(body.dir) ? body.dir : 'down',
      moving: !!body.moving, rover: !!body.rover,
    };
    if (!room.posTimer) {
      room.posTimer = setTimeout(() => {
        room.posTimer = null;
        fanout(room, 'pos', Object.values(room.positions));
      }, POS_FANOUT_MS);
      if (room.posTimer.unref) room.posTimer.unref();
    }
    return null;
  }

  function findPlayer(room, id, token) {
    const p = room && room.players.find(x => x.id === id);
    return p && p.token === token ? p : null;
  }

  function addPlayer(room, name) {
    const p = { id: newId(), token: newId(), name: cleanName(name, 'Crew ' + (room.players.length + 1)), crewId: null, ready: false, clients: new Set(), lastSeen: Date.now() };
    room.players.push(p);
    return p;
  }

  function crewIds(room) { return D.CREW.slice(0, room.settings.crewSize).map(c => c.id); }

  function resolveRound(room) {
    const { state, report } = E.resolveTurn(room.mission, room.plan);
    room.mission = state;
    room.plan = E.nextPlan(state, room.plan);
    room.lastReport = report;
    room.advice = null;
    for (const p of room.players) p.ready = false;
    if (state.status !== 'active') room.phase = 'debrief';
  }

  function maybeResolve(room) {
    const here = room.players.filter(present);
    if (here.length && here.every(p => p.ready)) resolveRound(room);
  }

  function cleanPatch(patch) {
    const out = {};
    if (!patch || typeof patch !== 'object') return out;
    for (const k of PLAN_KEYS) if (k in patch) out[k] = patch[k];
    if (out.builds) out.builds = (Array.isArray(out.builds) ? out.builds : []).slice(0, 12)
      .filter(b => b && D.BUILDS[b.type]).map(b => ({ type: b.type, x: b.x == null ? null : Number(b.x), y: b.y == null ? null : Number(b.y) }));
    if (out.scrap) out.scrap = (Array.isArray(out.scrap) ? out.scrap : []).filter(x => D.MODULES[x]).slice(0, 6);
    if ('drainWall' in out) out.drainWall = Math.max(0, Number(out.drainWall) || 0);
    if ('rations' in out && !['full', 'reduced'].includes(out.rations)) delete out.rations;
    if ('habMode' in out && !['normal', 'austerity'].includes(out.habMode)) delete out.habMode;
    if ('request' in out && out.request !== null && !D.DEPOT.amounts[out.request]) delete out.request;
    for (const k of ['modulesOn', 'choices', 'answered']) if (k in out && (typeof out[k] !== 'object' || out[k] === null)) delete out[k];
    return out;
  }

  // Returns an error code, or null when the action was applied.
  function apply(room, player, body) {
    // Paste the body of the current server.js apply() here (server.js lines 133-244: from `const host = …`
    // through the closing brace of the switch) unchanged, except for ONE line in `case 'leave':`
    //   old: for (const res of player.clients) res.end();
    //   new: for (const c of player.clients) c.close();
  }

  function sweep() {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.touched > ROOM_TTL && room.players.every(p => p.clients.size === 0)) rooms.delete(code);
    }
  }

  function get(code) { return rooms.get(String(code || '').trim().toUpperCase()); }

  function auth(code, playerId, token) {
    const room = get(code);
    const player = findPlayer(room, playerId, token);
    return player ? { room, player } : null;
  }

  function create(name) {
    sweep();
    if (rooms.size >= MAX_ROOMS) return { status: 503, error: 'busy' };
    const room = {
      code: newCode(), hostId: null, version: 0, phase: 'lobby', players: [], touched: Date.now(), positions: {}, posTimer: null,
      settings: { difficulty: D.DEFAULT_DIFFICULTY, crewSize: 5, seed: E.newMissionCode(), names: {} },
      loadout: null, mission: null, plan: null, lastReport: null, advice: null,
    };
    room.loadout = E.referenceKit(room.settings.difficulty, room.settings.crewSize);
    const player = addPlayer(room, name);
    room.hostId = player.id;
    rooms.set(room.code, room);
    return { room, player };
  }

  function join(code, name) {
    const room = get(code);
    if (!room) return { status: 404, error: 'noRoom' };
    if (room.players.length >= MAX_PLAYERS) return { status: 409, error: 'full' };
    const player = addPlayer(room, name);
    broadcast(room);
    return { room, player };
  }

  function act(body) {
    const found = auth(body.code, body.player, body.token);
    if (!found) return fail(403, 'noRoom');
    const { room, player } = found;
    player.lastSeen = Date.now();
    if (body.type === 'pos') {
      const perr = position(room, player, body);
      return perr ? fail(400, perr) : ok();
    }
    const err = apply(room, player, body);
    if (err) return fail(400, err);
    if (rooms.has(room.code)) broadcast(room);
    return ok();
  }

  function attach(room, player, client) {
    player.clients.add(client);
    player.lastSeen = Date.now();
    broadcast(room);
  }

  function detach(room, player, client) {
    player.clients.delete(client);
    player.lastSeen = Date.now();
    if (rooms.has(room.code)) broadcast(room);
  }

  return { rooms, create, join, auth, act, position, attach, detach, publicRoom };
}

module.exports = { createRooms, MAX_PLAYERS };
```
Move the existing `apply()` body with the editor: it's 110 lines of tested code, and only the `leave` line changes. Afterwards, `grep -n "res.end" lib/rooms.js` must print nothing.

- [ ] **Step 4: Rewrite `server.js` on top of it (SSE kept for now)**

`server.js` (full file):
```js
#!/usr/bin/env node
/*
 * SOL 500 — LAN co-op server. `node server.js`, then open the printed address on every device.
 * Serves index.html + src/* and hosts rooms (lib/rooms.js), which run the same engine as the browser.
 * Transport: JSON POST for actions, Server-Sent Events for room updates.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRooms, MAX_PLAYERS } = require('./lib/rooms.js');

const MAX_BODY = 256 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
};

function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

function createServer() {
  const rooms = createRooms();

  function send(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  function serveStatic(req, res, pathname) {
    let rel = null;
    if (pathname === '/' || pathname === '/index.html') rel = 'index.html';
    else if (pathname === '/manifest.webmanifest' || pathname === '/sw.js') rel = pathname.slice(1);
    else if (/^\/src\/[a-z0-9-]+\.(js|css)$/.test(pathname)) rel = pathname.slice(1);
    else if (/^\/icons\/[a-z0-9-]+\.png$/.test(pathname)) rel = pathname.slice(1);
    if (!rel) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    fs.readFile(path.join(__dirname, rel), (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)], 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', c => {
        size += c.length;
        if (size > MAX_BODY) { reject(new Error('tooBig')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  function seat(res, r) {
    if (r.error) { send(res, r.status, { error: r.error }); return; }
    send(res, 200, { code: r.room.code, playerId: r.player.id, token: r.player.token });
  }

  // Server-Sent Events adapter: an open HTTP response becomes a rooms client.
  function sseClient(res) {
    return {
      send(type, data) { res.write('event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n'); },
      close() { res.end(); },
    };
  }

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); res.end(); return; }
    const p = url.pathname;
    try {
      if (req.method === 'GET' && p === '/api/info') {
        const port = server.address() && server.address().port;
        send(res, 200, { lan: true, maxPlayers: MAX_PLAYERS, addresses: lanAddresses(port) });
        return;
      }
      if (req.method === 'POST' && p === '/api/room/create') { seat(res, rooms.create((await readBody(req)).name)); return; }
      if (req.method === 'POST' && p === '/api/room/join') {
        const body = await readBody(req);
        seat(res, rooms.join(body.code, body.name));
        return;
      }
      if (req.method === 'POST' && p === '/api/room/act') {
        const r = rooms.act(await readBody(req));
        send(res, r.status, r.body);
        return;
      }
      if (req.method === 'GET' && (p === '/api/room/state' || p === '/api/room/stream')) {
        const found = rooms.auth(url.searchParams.get('code'), url.searchParams.get('player'), url.searchParams.get('token'));
        if (p === '/api/room/state') {
          if (!found) { send(res, 403, { error: 'noRoom' }); return; }
          found.player.lastSeen = Date.now();
          send(res, 200, rooms.publicRoom(found.room));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        if (!found) { res.end('event: gone\ndata: {}\n\n'); return; }
        const client = sseClient(res);
        res.write('retry: 2000\n\n');
        rooms.attach(found.room, found.player, client);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ping); rooms.detach(found.room, found.player, client); });
        return;
      }
      if (req.method === 'GET') { serveStatic(req, res, p); return; }
      res.writeHead(405); res.end();
    } catch (e) {
      if (!res.headersSent) send(res, 400, { error: 'bad' });
      else res.end();
    }
  });
  server.rooms = rooms.rooms;
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 5050;
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log('\n  SOL 500 · LAN co-op server is running.\n');
    console.log('  On this computer:        http://localhost:' + port);
    const addrs = lanAddresses(port);
    if (addrs.length) console.log('  Other devices on Wi-Fi:  ' + addrs.join('   '));
    console.log('\n  Up to ' + MAX_PLAYERS + ' players per room. Press Ctrl+C to stop.\n');
    if (process.argv.includes('--open')) {
      const url = 'http://localhost:' + port;
      const { spawn } = require('node:child_process');
      const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
        : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch (e) { /* open the address by hand */ }
    }
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.log('\n  Port ' + port + ' is busy. SOL 500 may already be running: open http://localhost:' + port + '\n');
    else console.log(err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 5: Run the new and old tests**

Run: `npm test`
Expected: 69 tests pass (65 + 4 new), 0 fail.

- [ ] **Step 6: Commit**

```bash
git add lib/rooms.js test/rooms.test.js server.js
git commit -m "refactor: move room logic into transport-free lib/rooms.js" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Remote-request detection and rate limiting (`lib/limits.js`)

**Files:**
- Create: `lib/limits.js`, `test/limits.test.js`

**Interfaces:**
- Produces:
  - `isRemote(req) → boolean`
  - `clientIp(req) → string` (`Cf-Connecting-IP` if present, else the socket address)
  - `createLimiter({ limit, windowMs, now? }) → { hit(key) → boolean }`, where `false` means over the limit

- [ ] **Step 1: Write the failing tests**

`test/limits.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isRemote, clientIp, createLimiter } = require('../lib/limits.js');

const req = (addr, headers) => ({ socket: { remoteAddress: addr }, headers: headers || {} });

test('the host PC and the home Wi-Fi are local', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.1.20', '10.0.0.5', '172.16.0.2', '172.31.9.9', '::ffff:192.168.0.7', 'fe80::1', 'fd12::3'])
    assert.equal(isRemote(req(a, { host: 'localhost:5050' })), false, a);
});

test('anything that came through the share link is remote, even though cloudflared connects from this PC', () => {
  assert.equal(isRemote(req('127.0.0.1', { 'cf-connecting-ip': '203.0.113.7' })), true);
  assert.equal(isRemote(req('127.0.0.1', { host: 'quiet-river.trycloudflare.com' })), true);
  assert.equal(isRemote(req('203.0.113.7', {})), true);
  assert.equal(isRemote(req('172.32.0.1', {})), true, '172.32/16 is public');
});

test("a visitor's address comes from Cloudflare's header when there is one", () => {
  assert.equal(clientIp(req('127.0.0.1', { 'cf-connecting-ip': '198.51.100.4' })), '198.51.100.4');
  assert.equal(clientIp(req('::ffff:192.168.1.9', {})), '192.168.1.9');
});

test('the limiter allows the limit per window, per key, then resets', () => {
  let t = 1000;
  const L = createLimiter({ limit: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([L.hit('a'), L.hit('a'), L.hit('a'), L.hit('a')], [true, true, true, false]);
  assert.equal(L.hit('b'), true, 'other keys have their own count');
  t += 1000;
  assert.equal(L.hit('a'), true, 'a new window starts fresh');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/limits.test.js`
Expected: FAIL with `Cannot find module '../lib/limits.js'`.

- [ ] **Step 3: Implement**

`lib/limits.js`:
```js
'use strict';
/*
 * SOL 500 — who is calling, and how often. Requests that arrive through the Cloudflare share link
 * reach us from cloudflared on this same PC, so the socket address alone can't be trusted:
 * Cloudflare's own header and the trycloudflare host name mark them as remote.
 */
const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^::1$/, /^fe80:/i, /^f[cd][0-9a-f]{0,2}:/i];

function socketAddress(req) {
  const a = String((req.socket && req.socket.remoteAddress) || '');
  return a.startsWith('::ffff:') ? a.slice(7) : a;
}

function isRemote(req) {
  const h = req.headers || {};
  if (h['cf-connecting-ip']) return true;
  const host = String(h.host || '').toLowerCase().replace(/:\d+$/, '');
  if (host.endsWith('.trycloudflare.com')) return true;
  const a = socketAddress(req);
  return !PRIVATE.some(re => re.test(a));
}

function clientIp(req) {
  const h = req.headers || {};
  return String(h['cf-connecting-ip'] || socketAddress(req) || 'unknown');
}

// Fixed-window counter per key. Old windows are dropped lazily so the map can't grow forever.
function createLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return {
    hit(key) {
      const t = now();
      let e = hits.get(key);
      if (!e || t - e.start >= windowMs) { e = { start: t, n: 0 }; hits.set(key, e); }
      e.n++;
      if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      return e.n <= limit;
    },
  };
}

module.exports = { isRemote, clientIp, createLimiter };
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/limits.test.js`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/limits.js test/limits.test.js
git commit -m "feat: detect share-link requests and add a fixed-window rate limiter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: WebSocket transport (`lib/ws.js`), SSE removed

**Files:**
- Create: `lib/ws.js`, `test/ws.test.js`
- Modify: `server.js` (header comment, remove `sseClient` and the `/api/room/stream` branch, attach WebSockets, close sockets on `server.close`)

**Interfaces:**
- Consumes: `createRooms()` API from Task 3.
- Produces:
  - `attachWebSocket(server, rooms, { maxConnections = 100, msgPerSecond = 30 }) → { wss, shutdown() }`
  - Socket URL `/ws?code=&player=&token=`. A bad seat is refused with HTTP 403 before the upgrade.
  - Frames `{ t, d }`. On connect the client immediately gets `{ t: 'room' }`.
  - Client `{ t: 'pos', d: { x, y, dir, moving, rover } }` → `rooms.position`.
  - Oversized frames (> 64 KB) close the socket with code 1009. Bad JSON is ignored. Messages over the rate in a 1 s window are dropped.

- [ ] **Step 1: Write the failing tests**

`test/ws.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.js');

function start() {
  return new Promise(resolve => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}
async function post(base, path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
const act = (base, s, type, payload) => post(base, '/api/room/act', Object.assign({ code: s.code, player: s.playerId, token: s.token, type }, payload || {}));

function openWs(base, s, token) {
  const q = new URLSearchParams({ code: s.code, player: s.playerId, token: token || s.token });
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws?' + q);
  ws.inbox = [];
  ws.waiters = [];
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    ws.inbox.push(msg);
    for (const w of ws.waiters.slice()) if (w.pred(msg)) { ws.waiters.splice(ws.waiters.indexOf(w), 1); w.resolve(msg); }
  });
  return ws;
}
function next(ws, pred, ms = 3000) {
  const hit = ws.inbox.find(pred);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    ws.waiters.push({ pred, resolve });
    setTimeout(() => reject(new Error('timed out waiting for a message')), ms).unref();
  });
}
const closed = ws => new Promise(resolve => {
  if (ws.readyState === WebSocket.CLOSED) resolve({ code: 1006 });
  else ws.addEventListener('close', e => resolve(e));
});
const isRoom = m => m.t === 'room';

test('opening the socket delivers the room straight away', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Linh' });
    const ws = openWs(base, host);
    const msg = await next(ws, isRoom);
    assert.equal(msg.d.code, host.code);
    assert.equal(msg.d.players[0].connected, true);
    ws.close();
  } finally { srv.close(); }
});

test('a socket with the wrong token is refused', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Linh' });
    const ws = openWs(base, host, 'wrong');
    await closed(ws);
    assert.equal(ws.inbox.length, 0);
  } finally { srv.close(); }
});

test('positions sent over the socket reach the other players', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    await act(base, guest, 'claim', { crewId: 'minh' });
    const hws = openWs(base, host);
    const gws = openWs(base, guest);
    await next(hws, isRoom);
    await next(gws, isRoom);
    gws.send(JSON.stringify({ t: 'pos', d: { x: 300, y: 200, dir: 'left', moving: true } }));
    const pos = await next(hws, m => m.t === 'pos' && m.d.some(p => p.crewId === 'minh'));
    assert.deepEqual(pos.d.find(p => p.crewId === 'minh'), { crewId: 'minh', x: 300, y: 200, dir: 'left', moving: true, rover: false });
    hws.close(); gws.close();
  } finally { srv.close(); }
});

test('junk on the socket is ignored and the connection stays usable', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    await act(base, guest, 'claim', { crewId: 'minh' });
    const hws = openWs(base, host);
    const gws = openWs(base, guest);
    await next(hws, isRoom);
    await next(gws, isRoom);
    for (const junk of ['not json', 'null', '{"t":"nope"}', '{"t":"pos","d":{"x":"a","y":{},"dir":"sideways"}}']) gws.send(junk);
    gws.send(JSON.stringify({ t: 'pos', d: { x: 50, y: 60 } }));
    const pos = await next(hws, m => m.t === 'pos' && m.d.some(p => p.crewId === 'minh' && p.x === 50));
    assert.equal(pos.d.find(p => p.crewId === 'minh').dir, 'down');
    hws.close(); gws.close();
  } finally { srv.close(); }
});

test('an oversized message closes only that socket', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    const hws = openWs(base, host);
    const gws = openWs(base, guest);
    await next(hws, isRoom);
    await next(gws, isRoom);
    gws.send('x'.repeat(70 * 1024));
    const ev = await closed(gws);
    assert.equal(ev.code, 1009);
    assert.equal(hws.readyState, WebSocket.OPEN, 'the host is unaffected');
    hws.close();
  } finally { srv.close(); }
});

test('a flood is cut to 30 messages per second', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    await act(base, host, 'claim', { crewId: 'lena' });
    const ws = openWs(base, host);
    await next(ws, isRoom);
    for (let i = 1; i <= 100; i++) ws.send(JSON.stringify({ t: 'pos', d: { x: i, y: 1 } }));
    await new Promise(r => setTimeout(r, 200));
    const q = new URLSearchParams({ code: host.code, player: host.playerId, token: host.token });
    const room = await (await fetch(base + '/api/room/state?' + q)).json();
    const x = room.positions.find(p => p.crewId === 'lena').x;
    assert.ok(x >= 1 && x <= 30, 'only the first 30 counted, got x=' + x);
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  } finally { srv.close(); }
});

test('a player who drops and reconnects keeps their seat', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    const g1 = openWs(base, guest);
    await next(g1, isRoom);
    g1.close();
    await closed(g1);
    const g2 = openWs(base, guest);
    const m = await next(g2, msg => msg.t === 'room' && msg.d.players.find(p => p.id === guest.playerId).connected);
    assert.equal(m.d.players.length, 2, 'no duplicate player');
    g2.close();
  } finally { srv.close(); }
});

test("leaving closes the player's socket", async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    const gws = openWs(base, guest);
    await next(gws, isRoom);
    await act(base, guest, 'leave');
    await closed(gws);
    assert.equal(gws.readyState, WebSocket.CLOSED);
  } finally { srv.close(); }
});

test('live updates no longer use Server-Sent Events', async () => {
  const { srv, base } = await start();
  try {
    assert.equal((await fetch(base + '/api/room/stream?code=X&player=Y&token=Z')).status, 404);
  } finally { srv.close(); }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/ws.test.js`
Expected: FAIL. The sockets never open (no `/ws` handler), and the SSE test gets 200 instead of 404.

- [ ] **Step 3: Implement `lib/ws.js`**

```js
'use strict';
/*
 * SOL 500 — WebSocket transport. One socket per browser tab at /ws?code=&player=&token=.
 * Frames are JSON { t, d }. Server → client: room, pos, event. Client → server: pos.
 * (Cloudflare quick tunnels don't carry Server-Sent Events, so live updates use this instead.)
 */
const { WebSocketServer } = require('ws');

const MAX_MESSAGE = 64 * 1024;
const HEARTBEAT_MS = 20000;
const REASONS = { 403: 'Forbidden', 404: 'Not Found', 503: 'Service Unavailable' };

function attachWebSocket(server, rooms, opts = {}) {
  const maxConnections = opts.maxConnections || 100;
  const msgPerSecond = opts.msgPerSecond || 30;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });

  function refuse(socket, status) {
    socket.end(`HTTP/1.1 ${status} ${REASONS[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { socket.destroy(); return; }
    if (url.pathname !== '/ws') { refuse(socket, 404); return; }
    if (wss.clients.size >= maxConnections) { refuse(socket, 503); return; }
    const found = rooms.auth(url.searchParams.get('code'), url.searchParams.get('player'), url.searchParams.get('token'));
    if (!found) { refuse(socket, 403); return; }
    wss.handleUpgrade(req, socket, head, ws => connected(ws, found.room, found.player));
  });

  function connected(ws, room, player) {
    ws.alive = true;
    let windowStart = Date.now();
    let count = 0;
    const client = {
      send(type, data) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: type, d: data })); },
      close(kind) { if (kind) client.send('event', { kind }); ws.close(1000); },
    };
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', raw => {
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; count = 0; }
      if (++count > msgPerSecond) return;
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'pos') rooms.position(room, player, msg.d && typeof msg.d === 'object' ? msg.d : {});
    });
    ws.on('error', () => { /* 'close' follows and cleans up */ });
    ws.on('close', () => rooms.detach(room, player, client));
    rooms.attach(room, player, client);
  }

  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  if (beat.unref) beat.unref();

  function shutdown() {
    clearInterval(beat);
    for (const ws of wss.clients) ws.terminate();
  }

  return { wss, shutdown };
}

module.exports = { attachWebSocket };
```

- [ ] **Step 4: Wire it into `server.js`**

1. In the header comment, replace `Transport: JSON POST for actions, Server-Sent Events for room updates.` with:
```js
 * Transport: JSON POST for actions, one WebSocket per tab (/ws) for live updates.
```
2. Add after the `rooms.js` require:
```js
const { attachWebSocket } = require('./lib/ws.js');
const MAX_SOCKETS = 100;
```
3. Delete the whole `sseClient` function.
4. Replace the `state`/`stream` branch with a `state`-only branch:
```js
      if (req.method === 'GET' && p === '/api/room/state') {
        const found = rooms.auth(url.searchParams.get('code'), url.searchParams.get('player'), url.searchParams.get('token'));
        if (!found) { send(res, 403, { error: 'noRoom' }); return; }
        found.player.lastSeen = Date.now();
        send(res, 200, rooms.publicRoom(found.room));
        return;
      }
```
5. Replace `server.rooms = rooms.rooms;` with:
```js
  const live = attachWebSocket(server, rooms, { maxConnections: MAX_SOCKETS, msgPerSecond: 30 });
  const closeHttp = server.close.bind(server);
  server.close = cb => { live.shutdown(); return closeHttp(cb); };
  server.rooms = rooms.rooms;
```

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: 78 pass (69 + 9), 0 fail. The suite must also **exit by itself**; if it hangs, a socket isn't being closed.

- [ ] **Step 6: Commit**

```bash
git add lib/ws.js test/ws.test.js server.js
git commit -m "feat: live updates over WebSockets, Server-Sent Events removed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Browser client on WebSockets (`src/net.js`), reconnects

**Files:**
- Modify: `src/net.js` (whole file below), `src/ui.js:546` (`sendPos` hook)

**Interfaces:**
- Consumes: the `/ws` protocol from Task 5.
- Produces `window.SolNet = { info, create, join, restore, clear, connect(onRoom, onStatus, onPos), disconnect, act, sendPos(pos), dropForTest(), session() }`. `onStatus` receives `'open' | 'error' | 'gone'`.

- [ ] **Step 1: Replace `src/net.js`**

```js
/*
 * SOL 500 — co-op client. Talks to server.js: JSON POSTs for actions, one WebSocket for live updates.
 * Works on the home network (ws://) and through the Cloudflare share link (wss://).
 * Session { code, playerId, token } lives in sessionStorage, so each browser tab is its own player.
 */
(function (root) {
  'use strict';
  const KEY = 'sol500.lan';
  let session = null;
  let ws = null;        // the live socket, or null
  let handlers = null;  // { onRoom, onStatus, onPos } while connected
  let retry = 0;
  let timer = null;

  async function info() {
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      const r = await fetch('/api/info', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.lan ? j : null;
    } catch (e) {
      return null;
    }
  }

  async function post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) {
      return { error: 'network' };
    }
  }

  function save(s) {
    session = { code: s.code, playerId: s.playerId, token: s.token };
    try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch (e) { /* private mode: keep in memory */ }
  }

  function restore() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (s && s.code && s.playerId && s.token) session = s;
    } catch (e) { session = null; }
    return session;
  }

  function clear() {
    session = null;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  async function create(name) {
    const j = await post('/api/room/create', { name });
    if (j.code) save(j);
    return j;
  }

  async function join(code, name) {
    const j = await post('/api/room/join', { code: String(code || '').trim().toUpperCase(), name });
    if (j.code) save(j);
    return j;
  }

  function socketUrl() {
    const q = new URLSearchParams({ code: session.code, player: session.playerId, token: session.token });
    return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws?' + q.toString();
  }

  function connect(onRoom, onStatus, onPos) {
    if (!session) return;
    disconnect();
    handlers = { onRoom, onStatus, onPos };
    open();
  }

  function open() {
    timer = null;
    if (!session || !handlers) return;
    const h = handlers;
    const sock = new WebSocket(socketUrl());
    ws = sock;
    sock.onopen = () => { retry = 0; h.onStatus('open'); };
    sock.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (!msg) return;
      if (msg.t === 'room') h.onRoom(msg.d);
      else if (msg.t === 'pos') { if (h.onPos) h.onPos(msg.d); }
      else if (msg.t === 'event' && msg.d && (msg.d.kind === 'kicked' || msg.d.kind === 'closed')) gone();
    };
    sock.onclose = () => {
      if (ws !== sock) return; // closed on purpose
      ws = null;
      h.onStatus('error');
      recover();
    };
  }

  // A refused socket looks just like a network error, so ask the server whether this seat still exists.
  async function recover() {
    const s = session;
    if (!s || !handlers) return;
    try {
      const q = new URLSearchParams({ code: s.code, player: s.playerId, token: s.token });
      const r = await fetch('/api/room/state?' + q.toString(), { cache: 'no-store' });
      if (r.status === 403) { gone(); return; }
    } catch (e) { /* host unreachable for now: keep trying */ }
    if (session !== s || !handlers) return;
    timer = setTimeout(open, Math.min(5000, 500 * Math.pow(2, retry++)));
  }

  function gone() {
    const h = handlers;
    disconnect();
    clear();
    if (h) h.onStatus('gone');
  }

  function disconnect() {
    clearTimeout(timer);
    timer = null;
    handlers = null;
    const s = ws;
    ws = null;
    if (s) s.close();
  }

  function act(type, payload) {
    if (!session) return Promise.resolve({ error: 'noSession' });
    return post('/api/room/act', Object.assign({ code: session.code, player: session.playerId, token: session.token, type }, payload || {}));
  }

  function sendPos(pos) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'pos', d: pos }));
  }

  // Play-testing hook: drops the socket the way a Wi-Fi blip would, so reconnection can be checked in a real browser.
  function dropForTest() { if (ws) ws.close(); }

  root.SolNet = { info, create, join, restore, clear, connect, disconnect, act, sendPos, dropForTest, session: () => session };
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 2: Positions go over the socket**

In `src/ui.js:546` replace:
```js
    sendPos: pos => { if (lanOn() && me() && me().crewId) N.act('pos', pos); },
```
with:
```js
    sendPos: pos => { if (lanOn() && me() && me().crewId) N.sendPos(pos); },
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: 78 pass.

- [ ] **Step 4: Start a fresh server**

`netstat -ano | grep ":5050 " | grep LISTENING` must print nothing. Then `node server.js`, run in the background.

- [ ] **Step 5: Two-player browser check (Chrome DevTools MCP)**

- **Page A** (`new_page`, `isolatedContext: "host-a"`, URL `http://localhost:5050/`), host:
```js
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 30 && !document.querySelector('[data-k="lan"]'); i++) await wait(100);
  document.querySelector('[data-k="lan"]').click(); await wait(80);
  const name = document.getElementById('lan-me'); name.value = 'Linh'; name.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-k="lan-host"]').click(); await wait(800);
  [...document.querySelectorAll('.slot button')][0].click(); await wait(400);
  return { code: document.querySelector('.roomcode').textContent };
}
```
- **Page B** (`isolatedContext: "guest-b"`). Substitute the room code from A for `ROOM`:
```js
async () => {
  const ROOM = 'ABCD';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 30 && !document.querySelector('[data-k="lan"]'); i++) await wait(100);
  document.querySelector('[data-k="lan"]').click(); await wait(80);
  const name = document.getElementById('lan-me'); name.value = 'Bao'; name.dispatchEvent(new Event('input', { bubbles: true }));
  const code = document.getElementById('lan-join'); code.value = ROOM; code.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-k="lan-joinbtn"]').click(); await wait(800);
  document.querySelectorAll('.slot')[2].querySelector('button').click(); await wait(400);
  return { players: document.querySelector('.players').innerText };
}
```
- **A** launches:
```js
async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-k="pack"]').click(); await wait(500); document.querySelector('[data-k="launch"]').click(); await wait(900); return !!document.querySelector('.sf-canvas'); }
```
- **B** walks right for 900 ms:
```js
async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 30 && !document.querySelector('.sf-canvas'); i++) await wait(100); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true })); await wait(900); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true })); await wait(400); return SolSurface.probe().player; }
```
- **A** reads `() => SolSurface.probe().remote`.

Expected: `remote.diego.tx` equals B's `x` within ±2.

- [ ] **Step 6: Reconnect check (Review Focus 1)**

- On B: `async () => { SolNet.dropForTest(); await new Promise(r => setTimeout(r, 2500)); return { status: SolUI.store.lanStatus, players: SolUI.store.room.players.length }; }`
- Expected: `status: 'open'` and `players: 2`. It went `error` then back to `open`.
- Then on B walk again, as in Step 5. A's `remote.diego.tx` follows.

- [ ] **Step 7: Stop the server, close the pages, commit**

```bash
git add src/net.js src/ui.js
git commit -m "feat: browser client uses WebSockets with automatic reconnect" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Share-link rules on the server (remote info, rate limits, 64 KB bodies)

**Files:**
- Modify: `server.js`, `test/server.test.js` (3 new tests), `src/ui.js` (`viewLobby` hides the address line when there are no addresses), `src/i18n.js` (`lan.slowDown` in `en` and `vi`)

**Interfaces:**
- Consumes: `isRemote`, `clientIp`, `createLimiter` (Task 4).
- Produces:
  - HTTP 429 `{ error: 'slowDown' }` for remote callers over a limit
  - HTTP 413 `{ error: 'tooBig' }` for bodies over 64 KB
  - `/api/info.addresses` is `[]` for remote callers

- [ ] **Step 1: Write the failing tests** (append to `test/server.test.js`)

```js
test("players coming through the share link do not see the host's home network addresses", async () => {
  const { srv, base } = await start();
  try {
    const local = await (await fetch(base + '/api/info')).json();
    const remote = await (await fetch(base + '/api/info', { headers: { 'cf-connecting-ip': '203.0.113.7' } })).json();
    assert.ok(Array.isArray(local.addresses));
    assert.deepEqual(remote.addresses, []);
    assert.equal(remote.lan, true);
  } finally { srv.close(); }
});

test('strangers on the share link cannot flood the host with new rooms', async () => {
  const { srv, base } = await start();
  try {
    const H = { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' };
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await fetch(base + '/api/room/create', { method: 'POST', headers: H, body: '{"name":"x"}' })).status);
    assert.deepEqual(statuses, [...Array(10).fill(200), 429]);
    const other = await fetch(base + '/api/room/create', { method: 'POST', headers: { ...H, 'cf-connecting-ip': '198.51.100.1' }, body: '{}' });
    assert.equal(other.status, 200, 'a different visitor is not blocked');
    assert.equal((await post(base, '/api/room/create', { name: 'Host' })).code.length, 4, 'the host on this PC is never limited');
  } finally { srv.close(); }
});

test('oversized requests are turned away with 413', async () => {
  const { srv, base } = await start();
  try {
    const r = await fetch(base + '/api/room/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(70 * 1024) }) });
    assert.equal(r.status, 413);
    assert.equal((await r.json()).error, 'tooBig');
  } finally { srv.close(); }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/server.test.js`
Expected: 3 fail:
- the remote addresses aren't empty
- the 11th create gets 200 instead of 429
- the oversized body gets a socket error or 400 instead of 413

- [ ] **Step 3: Implement in `server.js`**

1. Replace the line `const MAX_BODY = 256 * 1024;` with:
```js
const { isRemote, clientIp, createLimiter } = require('./lib/limits.js');
const MAX_BODY = 64 * 1024;
```

2. At the top of `createServer()`, after `const rooms = createRooms();`:
```js
  const limits = {
    create: createLimiter({ limit: 10, windowMs: 60000 }),
    join: createLimiter({ limit: 30, windowMs: 60000 }),
    act: createLimiter({ limit: 20, windowMs: 1000 }),
  };
```

3. Replace `readBody` so an oversized body gets a proper answer instead of a cut connection:
```js
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const tooBig = () => Object.assign(new Error('tooBig'), { status: 413 });
      if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); reject(tooBig()); return; }
      let size = 0;
      let over = false;
      const chunks = [];
      req.on('data', c => {
        size += c.length;
        if (size > MAX_BODY) { over = true; chunks.length = 0; return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (over) { reject(tooBig()); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }
```

4. In the request handler, right after `const p = url.pathname;`:
```js
    const remote = isRemote(req);
    const ip = clientIp(req);
    const tooFast = () => send(res, 429, { error: 'slowDown' });
```

5. Replace the `info`, `create`, `join` and `act` branches with:
```js
      if (req.method === 'GET' && p === '/api/info') {
        const port = server.address() && server.address().port;
        send(res, 200, { lan: true, maxPlayers: MAX_PLAYERS, addresses: remote ? [] : lanAddresses(port) });
        return;
      }
      if (req.method === 'POST' && p === '/api/room/create') {
        if (remote && !limits.create.hit(ip)) { tooFast(); return; }
        seat(res, rooms.create((await readBody(req)).name));
        return;
      }
      if (req.method === 'POST' && p === '/api/room/join') {
        if (remote && !limits.join.hit(ip)) { tooFast(); return; }
        const body = await readBody(req);
        seat(res, rooms.join(body.code, body.name));
        return;
      }
      if (req.method === 'POST' && p === '/api/room/act') {
        const body = await readBody(req);
        if (remote && !limits.act.hit(String(body.player))) { tooFast(); return; }
        const r = rooms.act(body);
        send(res, r.status, r.body);
        return;
      }
```

6. Replace the `catch` block:
```js
    } catch (e) {
      const big = e && e.status === 413;
      if (!res.headersSent) send(res, big ? 413 : 400, { error: big ? 'tooBig' : 'bad' });
      else res.end();
    }
```

- [ ] **Step 4: Player-facing text and the lobby address line**

`src/i18n.js`:
- In `en`, after the `'lan.lost'` line, add:
```js
    'lan.slowDown': 'Too many tries. Wait a minute, then try again.',
```
- In `vi`, after its `'lan.lost'` line, add:
```js
    'lan.slowDown': 'Thử quá nhiều lần. Hãy đợi một phút rồi thử lại.',
```

`src/ui.js`, in `viewLobby()`, replace these two lines:
```js
            h('p', { class: 'hint' }, t('lan.share')),
            (store.lanInfo && store.lanInfo.addresses || []).map(a => h('div', { class: 'addr' }, a)),
```
with:
```js
            (store.lanInfo && store.lanInfo.addresses || []).length
              ? [h('p', { class: 'hint' }, t('lan.share')), store.lanInfo.addresses.map(a => h('div', { class: 'addr' }, a))]
              : null,
```

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: 81 pass (78 + 3), 0 fail, including the i18n parity test.

- [ ] **Step 6: Commit**

```bash
git add server.js test/server.test.js src/ui.js src/i18n.js
git commit -m "feat: share-link callers get no LAN addresses, rate limits and a 64 KB body cap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Desktop app shell (Electron) with the built-in server

**Files:**
- Create: `app/port.js`, `app/main.js`, `app/preload.js`, `app/smoke.js`, `tools/app-smoke.js`, `test/port.test.js`
- Modify: `package.json` (dev dependency `electron`, scripts), `src/ui.js` (app-mode title buttons, firewall hint), `src/i18n.js` (`title.host`, `title.join`, `lan.firewall`; `title.lan` and `lan.title` renamed to "Play together")

**Interfaces:**
- Consumes: `createServer()` from `server.js`.
- Produces:
  - `pickPort(first = 5050, count = 10, host = '0.0.0.0') → Promise<number>` (0 means let the OS choose)
  - `window.solApp = { info() → Promise<{ port }> }`, which Task 9 extends
  - `smoke.run({ win, port, app, startOnline })`
  - `node tools/app-smoke.js [--exe path] [--shot file.png] [--online] [--stay seconds]` prints `SOL_SMOKE_OUT <file>` first, then the result JSON, and exits 0 or 1

- [ ] **Step 1: Write the failing port test**

`test/port.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { pickPort } = require('../app/port.js');

test('the app skips a port that is already taken (for example an old server still running)', async () => {
  const blocker = net.createServer();
  await new Promise(r => blocker.listen(0, '0.0.0.0', r));
  const taken = blocker.address().port;
  try {
    const p = await pickPort(taken, 3);
    assert.notEqual(p, taken);
    assert.ok(p === 0 || (p > taken && p < taken + 3), 'next port in the range, or 0 for any free port; got ' + p);
  } finally {
    blocker.close();
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/port.test.js`
Expected: FAIL with `Cannot find module '../app/port.js'`.

- [ ] **Step 3: Implement `app/port.js`**

```js
'use strict';
const net = require('node:net');

function canListen(port, host) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}

// Always try the same ports first: saved games are stored per address, so a stable port keeps them.
async function pickPort(first = 5050, count = 10, host = '0.0.0.0') {
  for (let p = first; p < first + count; p++) if (await canListen(p, host)) return p;
  return 0;
}

module.exports = { pickPort, canListen };
```

Run: `node --test test/port.test.js`. Expected: PASS.

- [ ] **Step 4: Install Electron and add scripts**

```bash
npm install --save-dev electron --no-audit --no-fund
npx electron --version
```
Add to `package.json` `"scripts"`:
```json
    "app:dev": "electron .",
    "smoke": "node tools/app-smoke.js"
```

- [ ] **Step 5: Write the app files**

`app/main.js`:
```js
'use strict';
/*
 * SOL 500 desktop app: starts the game server inside the app, then shows the game in its own window.
 * Friends on the same Wi-Fi (or through the share link) connect to this same server.
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('../server.js');
const { pickPort } = require('./port.js');

let win = null;
let server = null;
let port = 0;

const sizeFile = () => path.join(app.getPath('userData'), 'window.json');
function loadSize() { try { return JSON.parse(fs.readFileSync(sizeFile(), 'utf8')); } catch (e) { return null; } }
function saveSize() {
  try {
    if (win && !win.isMinimized() && !win.isMaximized()) {
      const { width, height } = win.getBounds();
      fs.writeFileSync(sizeFile(), JSON.stringify({ width, height }));
    }
  } catch (e) { /* not critical */ }
}

async function startServer() {
  port = await pickPort();
  server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  port = server.address().port;
}

function createWindow() {
  const size = loadSize();
  win = new BrowserWindow({
    width: size ? size.width : 1280, height: size ? size.height : 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#1b1417', title: 'SOL 500', show: false,
    icon: path.join(__dirname, '..', 'icons', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  const origin = 'http://localhost:' + port;
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin + '/')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url); // science sources open in the normal browser
    return { action: 'deny' };
  });
  win.once('ready-to-show', () => win.show());
  win.on('close', saveSize);
  win.loadURL(origin + '/?app=1');
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0); // a second double-click: the first window gets focused instead
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    try {
      await startServer();
    } catch (e) {
      dialog.showErrorBox('SOL 500', 'The game server could not start: ' + e.message);
      app.exit(1);
      return;
    }
    ipcMain.handle('app:info', () => ({ port }));
    createWindow();
    if (process.env.SOL_SMOKE) require('./smoke.js').run({ win, port, app, startOnline: null });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (server) server.close(); });
}
```

`app/preload.js`:
```js
'use strict';
// The only bridge between the game page and the app. Everything else stays sandboxed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solApp', {
  info: () => ipcRenderer.invoke('app:info'),
});
```

`app/smoke.js`:
```js
'use strict';
// Check mode for the desktop app (driven by tools/app-smoke.js): looks at the page, writes one JSON file, quits.
const fs = require('node:fs');

async function run({ win, port, app, startOnline }) {
  const out = { port, ok: false };
  try {
    if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
    await new Promise(r => setTimeout(r, 1500));
    out.page = await win.webContents.executeJavaScript(`({
      title: document.title, ui: !!window.SolUI, app: !!window.solApp,
      lan: !!(window.SolUI && SolUI.store.lanInfo),
      addresses: (window.SolUI && SolUI.store.lanInfo && SolUI.store.lanInfo.addresses) || [],
      keys: [...document.querySelectorAll('[data-k]')].map(b => b.getAttribute('data-k')),
    })`);
    if (process.env.SOL_SMOKE_ONLINE && startOnline) out.online = await startOnline();
    out.ok = !!(out.page.ui && out.page.app && out.page.lan && out.page.keys.includes('host-game') &&
      (!process.env.SOL_SMOKE_ONLINE || (out.online && out.online.url)));
    fs.writeFileSync(process.env.SOL_SMOKE_OUT, JSON.stringify(out)); // written early so a long --stay run can be read
    if (process.env.SOL_SMOKE_SHOT) fs.writeFileSync(process.env.SOL_SMOKE_SHOT, (await win.webContents.capturePage()).toPNG());
  } catch (e) {
    out.error = String((e && e.message) || e);
    out.ok = false;
  }
  fs.writeFileSync(process.env.SOL_SMOKE_OUT, JSON.stringify(out));
  const stay = Number(process.env.SOL_SMOKE_STAY) || 0;
  setTimeout(() => app.exit(out.ok ? 0 : 1), stay * 1000);
}

module.exports = { run };
```

`tools/app-smoke.js`:
```js
#!/usr/bin/env node
// Launches the desktop app in check mode and prints what it saw.
//   node tools/app-smoke.js [--exe "C:\\path\\SOL 500.exe"] [--shot out.png] [--online] [--stay 60]
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = name => {
  const i = args.indexOf('--' + name);
  if (i < 0) return null;
  return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const out = path.join(os.tmpdir(), 'sol500-smoke-' + process.pid + '.json');
const exe = opt('exe');
const env = Object.assign({}, process.env, { SOL_SMOKE: '1', SOL_SMOKE_OUT: out });
if (opt('shot')) env.SOL_SMOKE_SHOT = path.resolve(String(opt('shot')));
if (opt('online')) env.SOL_SMOKE_ONLINE = '1';
if (opt('stay')) env.SOL_SMOKE_STAY = String(opt('stay'));
console.log('SOL_SMOKE_OUT ' + out);
const child = exe
  ? spawn(String(exe), [], { env, stdio: 'inherit' })
  : spawn(require('electron'), [path.join(__dirname, '..')], { env, stdio: 'inherit' });
child.on('exit', () => {
  let result = null;
  try { result = JSON.parse(fs.readFileSync(out, 'utf8')); fs.unlinkSync(out); } catch (e) { /* the app wrote nothing */ }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result && result.ok ? 0 : 1);
});
```

- [ ] **Step 6: App-mode title buttons, firewall hint, clearer "Play together" label**

`src/ui.js` title (the `store.lanInfo ? … : …` block near line 329). Replace:
```js
          store.lanInfo
            ? h('div', { class: 'setup-row' },
              h('button', { class: 'btn', type: 'button', 'data-k': 'lan', onclick: () => { store.modal = 'lan'; render(); } }, ico('wifi'), t('title.lan')),
              h('p', { class: 'hint' }, t('title.lanHint')))
            : h('p', { class: 'hint' }, ico('wifi', 14), ' ', t('title.lanOff')))),
```
with:
```js
          store.lanInfo
            ? h('div', { class: 'setup-row' },
              window.solApp
                ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
                  h('button', { class: 'btn', type: 'button', 'data-k': 'host-game', onclick: () => { store.modal = 'lan'; render(); } }, ico('users'), t('title.host')),
                  h('button', {
                    class: 'btn', type: 'button', 'data-k': 'join-game',
                    onclick: () => { store.modal = 'lan'; render(); const el = document.getElementById('lan-join'); if (el) el.focus(); },
                  }, ico('wifi'), t('title.join')))
                : h('button', { class: 'btn', type: 'button', 'data-k': 'lan', onclick: () => { store.modal = 'lan'; render(); } }, ico('wifi'), t('title.lan')),
              h('p', { class: 'hint' }, t('title.lanHint')))
            : h('p', { class: 'hint' }, ico('wifi', 14), ' ', t('title.lanOff')))),
```
In `viewLobby()`, right after the address block from Task 7, add:
```js
            window.solApp && host ? h('p', { class: 'hint' }, t('lan.firewall')) : null,
```

`src/i18n.js`:
- `en`: change `'title.lan': 'LAN co-op',` to `'title.lan': 'Play together',` and `'lan.title': 'LAN co-op',` to `'lan.title': 'Play together',`.
- Add after `'title.lanOff'`:
```js
    'title.host': 'Host game',
    'title.join': 'Join game',
```
- Add after `'lan.slowDown'`:
```js
    'lan.firewall': "Friends can't connect? When Windows asks, allow SOL 500 on private networks.",
```
- `vi`: change `'title.lan': 'Chơi chung qua LAN',` to `'title.lan': 'Chơi cùng nhau',` and `'lan.title': 'Chơi chung qua LAN',` to `'lan.title': 'Chơi cùng nhau',`.
- Add after `'title.lanOff'`:
```js
    'title.host': 'Mở phòng chơi',
    'title.join': 'Vào phòng chơi',
```
- Add after `'lan.slowDown'`:
```js
    'lan.firewall': 'Bạn bè không vào được? Khi Windows hỏi, hãy cho phép SOL 500 trên mạng riêng (Private).',
```

- [ ] **Step 7: Run tests and the app check**

```bash
npm test
node tools/app-smoke.js --shot "$SCRATCH/app-title.png"
```
Expected:
- `npm test`: 82 pass.
- Smoke JSON: `ok: true`, `port: 5050`, `page.app: true`, `page.keys` contains `host-game` and `join-game`.
- Read `app-title.png`: the title screen in the app window, with Host game and Join game buttons.

- [ ] **Step 8: Busy port and double launch (Review Focus 2 and 5)**

```bash
node server.js                       # run_in_background: an "old" server on 5050
node tools/app-smoke.js              # expect port 5051 and page.addresses ending in :5051
```
Stop the background server. Then:
```bash
npx electron .                       # run_in_background: the first instance
node tools/app-smoke.js              # the second instance exits straight away: prints null, exit code 1
netstat -ano | grep -E ":505[0-9] " | grep LISTENING   # exactly one listener (5050)
```
Expected as commented. Close the first instance by stopping its background task.

- [ ] **Step 9: Commit**

```bash
git add app/port.js app/main.js app/preload.js app/smoke.js tools/app-smoke.js test/port.test.js package.json package-lock.json src/ui.js src/i18n.js
git commit -m "feat: desktop app window with built-in server, app-mode title, port fallback" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Host online — Cloudflare share link with Copy and QR

**Files:**
- Create: `app/tunnel.js`, `test/tunnel.test.js`
- Modify: `app/main.js` (online start/stop, status events, smoke hook), `app/preload.js` (`hostOnline`, `stopOnline`, `onOnline`), `src/ui.js` (`online` in store, lobby online panel, status listener), `src/i18n.js` (`online.*`), `package.json` (dependency `qrcode`)

**Interfaces:**
- Consumes: `app/cloudflared.json` (Task 1) and `port` from `app/main.js`.
- Produces:
  - `tunnel.start({ port, binDir, onStatus, onExit, command?, args?, timeoutMs? }) → Promise<{ url, stop() }>`
  - `tunnel.ensureBinary(binDir, { pin?, fetch?, onStatus? }) → Promise<path>`
  - `tunnel.parseTunnelUrl(text) → string | null`
  - Errors carry `.code`: `'download' | 'hashMismatch' | 'timeout' | 'exited' | 'spawn'`.
- Produces `window.solApp`:
  - `hostOnline() → Promise<{ url, qr } | { error }>`
  - `stopOnline()`
  - `onOnline(cb)`, where cb receives `{ state: 'downloading' | 'starting' | 'on' | 'off', url?, qr?, error? }`

- [ ] **Step 1: Write the failing tests**

`test/tunnel.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseTunnelUrl, ensureBinary, start } = require('../app/tunnel.js');

test("the share link is read from cloudflared's banner, never its API address", () => {
  const log = 'INF Requesting new quick Tunnel on trycloudflare.com...\n' +
    'ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"\n' +
    '|  https://quiet-river-sun-tiny.trycloudflare.com  |\n';
  assert.equal(parseTunnelUrl(log), 'https://quiet-river-sun-tiny.trycloudflare.com');
  assert.equal(parseTunnelUrl('nothing yet'), null);
});

test('a download that fails its checksum is never saved or run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-bin-'));
  const pin = { version: 'test', url: 'https://example.invalid/x.exe', sha256: '0'.repeat(64) };
  const fakeFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('evil').buffer });
  await assert.rejects(ensureBinary(dir, { pin, fetch: fakeFetch }), e => e.code === 'hashMismatch');
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('a good download is saved once and reused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-bin-'));
  const body = Buffer.from('pretend-binary');
  const pin = { version: 'test', url: 'x', sha256: crypto.createHash('sha256').update(body).digest('hex') };
  let calls = 0;
  const fakeFetch = async () => { calls++; return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) }; };
  const a = await ensureBinary(dir, { pin, fetch: fakeFetch });
  const b = await ensureBinary(dir, { pin, fetch: fakeFetch });
  assert.equal(a, b);
  assert.equal(calls, 1);
});

test('the host hears about it when the share link dies mid-game', async () => {
  const script = "console.error('|  https://brave-test-link.trycloudflare.com  |'); setTimeout(() => process.exit(3), 200);";
  let resolveExit;
  const exited = new Promise(r => { resolveExit = r; });
  const t = await start({ command: process.execPath, args: ['-e', script], onExit: e => resolveExit(e) });
  assert.equal(t.url, 'https://brave-test-link.trycloudflare.com');
  const err = await exited;
  assert.equal(err.code, 'exited');
});

test('stopping the link on purpose is not reported as a failure', async () => {
  const script = "console.log('https://calm-test-link.trycloudflare.com'); setInterval(() => {}, 1000);";
  let resolveExit;
  const exited = new Promise(r => { resolveExit = r; });
  const t = await start({ command: process.execPath, args: ['-e', script], onExit: e => resolveExit(e) });
  t.stop();
  assert.equal(await exited, null);
});

test('a tunnel that never prints a link times out cleanly', async () => {
  await assert.rejects(
    start({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], timeoutMs: 300 }),
    e => e.code === 'timeout');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/tunnel.test.js`
Expected: FAIL with `Cannot find module '../app/tunnel.js'`.

- [ ] **Step 3: Implement `app/tunnel.js`**

```js
'use strict';
/*
 * SOL 500 — online share link through a Cloudflare quick tunnel:
 *   https://<random-words>.trycloudflare.com  →  this PC's game server.
 * cloudflared is downloaded once, checked against a pinned SHA-256 (app/cloudflared.json), and started per session.
 * Quick tunnels need no account; Cloudflare gives no uptime guarantee and allows 200 requests in flight.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const PINNED = require('./cloudflared.json');
const URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i;
const START_TIMEOUT_MS = 30000;
const fail = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

function parseTunnelUrl(text) {
  const m = String(text).match(URL_RE);
  return m ? m[0] : null;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('error', reject).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex')));
  });
}

async function ensureBinary(binDir, opts = {}) {
  const pin = opts.pin || PINNED;
  const fetchImpl = opts.fetch || fetch;
  const file = path.join(binDir, 'cloudflared-' + pin.version + '.exe');
  if (fs.existsSync(file) && (await sha256File(file)) === pin.sha256) return file;
  if (opts.onStatus) opts.onStatus({ state: 'downloading' });
  const res = await fetchImpl(pin.url, { redirect: 'follow' });
  if (!res.ok) throw fail('download failed: HTTP ' + res.status, 'download');
  const buf = Buffer.from(await res.arrayBuffer());
  if (crypto.createHash('sha256').update(buf).digest('hex') !== pin.sha256) throw fail('cloudflared failed its checksum', 'hashMismatch');
  fs.mkdirSync(binDir, { recursive: true });
  const part = file + '.part';
  fs.writeFileSync(part, buf);
  fs.renameSync(part, file);
  return file;
}

// Resolves { url, stop() } once Cloudflare hands out the address.
// onExit(error|null) fires later if the link stops: null when stop() was called, an error otherwise.
async function start(opts) {
  const command = opts.command || await ensureBinary(opts.binDir, { onStatus: opts.onStatus });
  const args = opts.args || ['tunnel', '--url', 'http://127.0.0.1:' + opts.port, '--no-autoupdate'];
  if (opts.onStatus) opts.onStatus({ state: 'starting' });
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    let log = '';
    let stopped = false;
    const timer = setTimeout(() => {
      if (url) return;
      child.kill();
      reject(fail('Cloudflare did not answer in time', 'timeout'));
    }, opts.timeoutMs || START_TIMEOUT_MS);
    const onData = d => {
      if (url) return;
      log = (log + d.toString('utf8')).slice(-8000);
      const found = parseTunnelUrl(log);
      if (!found) return;
      url = found;
      clearTimeout(timer);
      resolve({ url, stop: () => { stopped = true; child.kill(); } });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', err => { clearTimeout(timer); if (!url) reject(fail(err.message, 'spawn')); });
    child.on('exit', code => {
      clearTimeout(timer);
      if (!url) { reject(fail('cloudflared stopped (exit ' + code + ')', 'exited', { log })); return; }
      if (opts.onExit) opts.onExit(stopped ? null : fail('the share link stopped (exit ' + code + ')', 'exited'));
    });
  });
}

module.exports = { start, ensureBinary, parseTunnelUrl, sha256File, PINNED };
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/tunnel.test.js`
Expected: 6 pass.

- [ ] **Step 5: Wire it into the app**

```bash
npm install qrcode@1 --no-audit --no-fund
```

`app/main.js`:
1. Add requires under the existing ones:
```js
const QRCode = require('qrcode');
const tunnel = require('./tunnel.js');
```
2. Add state and functions after `let port = 0;`:
```js
let online = null;   // { url, stop } while sharing
let starting = null; // the pending start, so a double click can't open two tunnels

function sendStatus(s) { if (win && !win.isDestroyed()) win.webContents.send('online:status', s); }

async function doStartOnline() {
  if (!online) {
    online = await tunnel.start({
      port,
      binDir: path.join(app.getPath('userData'), 'bin'),
      onStatus: sendStatus,
      onExit: err => { online = null; sendStatus({ state: 'off', error: err ? err.code : null }); },
    });
  }
  const qr = await QRCode.toDataURL(online.url, { margin: 1, width: 240, color: { dark: '#1b1417', light: '#ffffff' } });
  sendStatus({ state: 'on', url: online.url, qr });
  return { url: online.url, qr };
}

function startOnline() {
  if (!starting) starting = doStartOnline().finally(() => { starting = null; });
  return starting;
}

function stopOnline() {
  const o = online;
  online = null;
  if (o) o.stop();
  sendStatus({ state: 'off', error: null });
}

// Check mode: host a room in the window and press "Host online" like a player would.
function uiStartOnline() {
  return win.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const until = async (sel, ms) => { for (let t = 0; t < ms; t += 200) { const el = document.querySelector(sel); if (el) return el; await wait(200); } return null; };
    document.querySelector('[data-k="host-game"]').click(); await wait(200);
    const name = document.getElementById('lan-me'); name.value = 'Host'; name.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-k="lan-host"]').click();
    const btn = await until('[data-k="online-start"]', 5000);
    if (!btn) return { error: 'no online button in the lobby' };
    btn.click();
    const link = await until('[data-k="online-url"]', 120000);
    return link ? { url: link.textContent, room: SolUI.store.room && SolUI.store.room.code } : { error: (SolUI.store.online && SolUI.store.online.error) || 'no link' };
  })()`);
}
```
3. In `whenReady`, after the `app:info` handler:
```js
    ipcMain.handle('online:start', async () => {
      try { return await startOnline(); } catch (e) { const error = e.code || 'failed'; sendStatus({ state: 'off', error }); return { error }; }
    });
    ipcMain.handle('online:stop', () => { stopOnline(); return { ok: true }; });
```
4. Change the smoke line to:
```js
    if (process.env.SOL_SMOKE) require('./smoke.js').run({ win, port, app, startOnline: uiStartOnline });
```
5. Change the `before-quit` line to:
```js
  app.on('before-quit', () => { stopOnline(); if (server) server.close(); });
```

`app/preload.js` (full):
```js
'use strict';
// The only bridge between the game page and the app. Everything else stays sandboxed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solApp', {
  info: () => ipcRenderer.invoke('app:info'),
  hostOnline: () => ipcRenderer.invoke('online:start'),
  stopOnline: () => ipcRenderer.invoke('online:stop'),
  onOnline: cb => { ipcRenderer.on('online:status', (_e, s) => cb(s)); },
});
```

- [ ] **Step 6: The lobby's "Play online" panel**

`src/ui.js`:
1. In `store`, after `lanError: null,` add `online: null,`.
2. Add these functions above `viewLobby()`:
```js
  // ---------- online share link (desktop app only) ----------
  function onlinePanel() {
    const o = store.online || { state: 'off' };
    const body = [h('p', { class: 'hint' }, t('online.lead'))];
    if (o.state === 'on') {
      body.push(
        h('div', { class: 'addr', 'data-k': 'online-url' }, o.url),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('button', {
            class: 'btn btn-sm', type: 'button', 'data-k': 'online-copy',
            onclick: () => navigator.clipboard.writeText(o.url).then(() => toast(t('online.copied')), () => {}),
          }, t('online.copy')),
          h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'data-k': 'online-stop', onclick: () => window.solApp.stopOnline() }, t('online.stop'))),
        h('img', { src: o.qr, alt: t('online.qr'), width: 160, height: 160, style: 'border-radius:8px;background:#fff;padding:6px' }),
        h('p', { class: 'hint' }, t('online.hint', { code: store.room.code })));
    } else if (o.state === 'downloading' || o.state === 'starting') {
      body.push(h('p', { class: 'muted' }, t(o.state === 'downloading' ? 'online.downloading' : 'online.starting')));
    } else {
      if (o.error) body.push(h('p', { class: 'crit' }, t('online.error')));
      body.push(h('button', { class: 'btn btn-primary', type: 'button', 'data-k': 'online-start', onclick: startOnline }, ico('wifi', 16), t('online.start')));
    }
    return panel(t('online.title'), body);
  }

  async function startOnline() {
    store.online = { state: 'starting' };
    render();
    const r = await window.solApp.hostOnline();
    if (r && r.error) store.online = { state: 'off', error: r.error };
    render();
  }
```
3. In `viewLobby()`, inside the first `h('div', { class: 'col' }, …)`, add this between the room panel and the `host ? panel(t('title.start'), …)` panel:
```js
          host && window.solApp ? onlinePanel() : null,
```
4. In `boot()`, before `render();`:
```js
    if (window.solApp) window.solApp.onOnline(s => { store.online = s; render(); });
```

`src/i18n.js`. Add to `en` after `'lan.firewall'`:
```js
    'online.title': 'Play online',
    'online.lead': 'Friends anywhere can join through a free Cloudflare link while this app stays open.',
    'online.start': 'Host online',
    'online.downloading': 'Downloading the Cloudflare link tool (first time only, about 40 MB)…',
    'online.starting': 'Opening the link…',
    'online.copy': 'Copy link',
    'online.copied': 'Link copied',
    'online.stop': 'Stop sharing',
    'online.qr': 'QR code for the share link',
    'online.hint': 'Friends open the link, press "Play together", then join room {code}.',
    'online.error': 'The share link could not open or has stopped. Check the internet connection and try again.',
```
Add to `vi` after its `'lan.firewall'`:
```js
    'online.title': 'Chơi qua mạng',
    'online.lead': 'Bạn bè ở bất cứ đâu đều vào được qua một link Cloudflare miễn phí, miễn là ứng dụng này vẫn mở.',
    'online.start': 'Mở phòng online',
    'online.downloading': 'Đang tải công cụ tạo link của Cloudflare (chỉ lần đầu, khoảng 40 MB)…',
    'online.starting': 'Đang mở link…',
    'online.copy': 'Sao chép link',
    'online.copied': 'Đã sao chép link',
    'online.stop': 'Dừng chia sẻ',
    'online.qr': 'Mã QR của link chia sẻ',
    'online.hint': 'Bạn bè mở link, bấm "Chơi cùng nhau", rồi vào phòng {code}.',
    'online.error': 'Không mở được link chia sẻ hoặc link đã dừng. Hãy kiểm tra kết nối mạng rồi thử lại.',
```

- [ ] **Step 7: Run tests and the online app check**

```bash
npm test
node tools/app-smoke.js --online --shot "$SCRATCH/app-online.png"
```
Expected:
- `npm test`: 88 pass.
- Smoke: `ok: true` and `online.url` matching `https://….trycloudflare.com`. The first run downloads cloudflared into the app's `userData/bin` folder.
- Read `app-online.png`: the lobby's "Play online" panel shows the link, Copy, Stop sharing and the QR code.

- [ ] **Step 8: Commit**

```bash
git add app/tunnel.js test/tunnel.test.js app/main.js app/preload.js src/ui.js src/i18n.js package.json package-lock.json
git commit -m "feat: Host online share link via Cloudflare quick tunnel with copy and QR" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Windows installer

**Files:**
- Modify: `package.json` (dev dependency `electron-builder`, `build` config, `app` script)

**Interfaces:**
- Produces: `npm run app` → `dist-app/SOL500-Setup-3.0.0.exe`. A per-user install lands at `%LOCALAPPDATA%\Programs\SOL 500\SOL 500.exe`.

- [ ] **Step 1: Install and configure**

```bash
npm install --save-dev electron-builder --no-audit --no-fund
```
Add to `package.json` `"scripts"`: `"app": "electron-builder --win nsis"`.
Add a top-level `"build"` block:
```json
  "build": {
    "appId": "com.sol500.marsoutpost",
    "productName": "SOL 500",
    "artifactName": "SOL500-Setup-${version}.${ext}",
    "directories": { "output": "dist-app" },
    "files": ["app/**", "lib/**", "src/**", "icons/**", "server.js", "index.html", "manifest.webmanifest", "sw.js", "package.json"],
    "win": { "target": "nsis", "icon": "icons/icon-512.png" },
    "nsis": { "oneClick": true, "perMachine": false, "createDesktopShortcut": true, "createStartMenuShortcut": true, "shortcutName": "SOL 500" }
  }
```

- [ ] **Step 2: Build**

Run: `npm run app`
Expected: `dist-app/SOL500-Setup-3.0.0.exe` exists, roughly 80–100 MB.

If the build fails with `Cannot create symbolic link : A required privilege is not held by the client` while unpacking `winCodeSign`, use superpowers:systematic-debugging. The archive contains macOS symlinks that Windows refuses without Developer Mode:
- Read the full error for the cache path.
- Confirm the cause before changing anything.
- Report the options to the user. Enabling Windows Developer Mode is their decision, not something to change silently.

- [ ] **Step 3: Install it and check the installed app**

```bash
"./dist-app/SOL500-Setup-3.0.0.exe" /S
ls "$LOCALAPPDATA/Programs/SOL 500/"
node tools/app-smoke.js --exe "$LOCALAPPDATA/Programs/SOL 500/SOL 500.exe" --shot "$SCRATCH/installed.png"
```
Expected:
- The folder exists.
- Smoke `ok: true` with `page.app: true`. The installed app runs without the repo's Node.
- `installed.png` shows the title screen.
- The Start menu and desktop now have "SOL 500" shortcuts.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: Windows installer (per-user NSIS) via electron-builder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end check through a real share link, then close out M1

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md` (§12 M1 boxes), `dist/sol500.html` and `dist/artifact.html` (rebuilt)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Start the app hosting online and leave it running**

```bash
node tools/app-smoke.js --online --stay 900   # run_in_background
```
Read the background output for `SOL_SMOKE_OUT <file>`. Within about 60 s that file holds `{ port, online: { url, room } }`.

- [ ] **Step 2: A guest through the link and a guest on the LAN join the app's room**

- **Page B** (`isolatedContext: "online-b"`) at `online.url`. Run the join script from Task 6 Step 5 with `ROOM = online.room` and the name "Bao", taking slot index 2.
- **Page C** (`isolatedContext: "lan-c"`) at `http://localhost:<port>/`. Same script with the name "Chi", taking slot index 1.
- Then on C: `() => SolUI.store.room.players.map(p => p.name + (p.connected ? '+' : '-'))`

Expected: `['Host+', 'Bao+', 'Chi+']`.

- [ ] **Step 3: Measure position round-trip through the link (spec §1.2)**

On B:
```js
async () => {
  const s = SolNet.session();
  const q = new URLSearchParams({ code: s.code, player: s.playerId, token: s.token });
  const ws = new WebSocket('wss://' + location.host + '/ws?' + q);
  await new Promise(r => { ws.onopen = r; });
  const rtts = [];
  for (let i = 1; i <= 21; i++) {
    const t0 = performance.now();
    ws.send(JSON.stringify({ t: 'pos', d: { x: 1000 + i, y: 7 } }));
    await new Promise(res => { ws.onmessage = e => { const m = JSON.parse(e.data); if (m.t === 'pos' && m.d.some(p => p.x === 1000 + i)) res(); }; });
    rtts.push(performance.now() - t0);
    await new Promise(r => setTimeout(r, 120));
  }
  ws.close();
  rtts.sort((a, b) => a - b);
  return { medianMs: Math.round(rtts[10]), maxMs: Math.round(rtts[20]), info: await (await fetch('/api/info')).json() };
}
```
Expected:
- `medianMs` under 300. It includes the server's deliberate 80 ms batching.
- `info.addresses` is `[]`: the link hides the host's Wi-Fi addresses.

- [ ] **Step 4: The link stopping mid-game (Review Focus 3)**

Stop the background app task. That kills the tunnel with it. Then on B: wait 3 s and read `SolUI.store.lanStatus`.

Expected: `'error'`. The page shows the "Lost connection to the host. Reconnecting…" chip.

- [ ] **Step 5: LAN regression with the plain server**

Re-run Task 6 Steps 4–6 against `node server.js`: two players, walking, `dropForTest` reconnect. Then stop the server.

- [ ] **Step 6: Rebuild the offline single file and check it**

```bash
node tools/build.js
```
Then in Chrome DevTools (`isolatedContext: "offline-d"`) open `dist/sol500.html (as a file:/// URL)` and run:
```js
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 30 && !document.querySelector('[data-k="start"]'); i++) await wait(100);
  document.querySelector('[data-k="start"]').click(); await wait(200);
  document.querySelector('[data-k="launch"]').click(); await wait(900);
  return { surface: !!document.querySelector('.sf-canvas'), lan: !!SolUI.store.lanInfo };
}
```
Expected: `{ surface: true, lan: false }`, and `list_console_messages` shows no errors.

- [ ] **Step 7: Tick the M1 checklist and run the whole suite one last time**

In the spec's §12, change every `- [ ]` under `### M1 — App + online` to `- [x]`.
Run: `npm test`. Expected: 88 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-10-01-sol500-v3-app-online-bigmap-admin-design.md dist/sol500.html dist/artifact.html
git commit -m "chore: M1 complete (app + online), offline build refreshed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Tell the user**

Report:
- where the installer is (`dist-app/SOL500-Setup-3.0.0.exe`) and that it's already installed with shortcuts
- the measured round-trip
- the Windows SmartScreen and Firewall prompts they'll see
- that M2 (admin panel) gets its own plan next
