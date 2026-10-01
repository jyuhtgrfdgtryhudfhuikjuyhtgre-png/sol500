# SOL 500 M1 — follow-ups for later milestones

M1 (desktop app and online share link) shipped on `feat/v3-app-online-bigmap-admin`, commits `3d6d96c..3862a9a`, with 107 tests passing. Every task passed its own review, and the final whole-branch review passed after one fix wave. The items below were reviewed and deliberately deferred. Pick them up in the milestone named.

## For the M2 plan (admin panel)
- `server.setOnline({ url })` and preload `adminKey()`. They were deferred from M1 (spec §7 and §6) because the admin panel is their only consumer.
- Kick and close are the first features to send the WebSocket `event` frame (`client.close(kind)`), so test that path.
- Missing ws tests: 503 at capacity, 404 on a non-`/ws` upgrade, and the heartbeat terminating a socket.
- A player replaced during the `ops` phase doesn't trigger `maybeResolve`. The same gap exists when a player drops.
- Per-seat WebSocket cap, about 3 per seat. Without it, one seat can use up the 100-socket limit.
- `online:start` and `online:stop` IPC handlers don't check the sender. The preload and navigation guard cover this for now. Check the sender the way `join:open` does.

## For the M5 plan (polish)
- **VPN addresses in the lobby.** The lobby can list VPN addresses (Radmin 26/8, Hamachi 25/8, Tailscale 100.64/10), but in-app Join refuses them. Either widen the allowed ranges or show only private-LAN addresses.
- **Help text for Windows warnings.** It should cover:
  - the Firewall prompt, which appears at first launch (the server listens on 0.0.0.0 at startup), not at first Host;
  - SmartScreen, because the installer is unsigned;
  - the real install folder, `%LOCALAPPDATA%\Programs\sol500`.
- **Electron menu shortcuts.** Ctrl+R reloads the window and wipes `store.online` while the tunnel keeps running, and Ctrl+Shift+I opens DevTools. Use `Menu.setApplicationMenu(null)` or add an online-state re-sync.
- **Error messages.**
  - One generic online-error text covers `hashMismatch`, `spawn` and `timeout`. A checksum failure should read differently.
  - A clipboard copy failure gives no feedback.
  - The app's start-failure box is English-only.
- **`.gitattributes`.** Add `*.cmd text eol=crlf` and `*.sh text eol=lf`. The launchers are stored with LF line endings.
- **Window and packaging polish.**
  - Validate and clamp the saved window size (minimum 960×600).
  - Guard `will-redirect` as well as `will-navigate`.
  - The `?app=1` query parameter is unused.
  - Use a multi-resolution `.ico` icon.
  - Set `copyright` and `publisherName`.
- **i18n parity test.** It checks keys only. Also flag empty values and values identical to the English.

## Hardening backlog (attack-only or edge cases)
- `cf-connecting-ip` is trusted from any socket. Trust it only from loopback (cloudflared), and cap its length when it's used as a limiter key.
- The limiter's lazy pruning is O(n) per hit once more than 5000 keys are live in one window. The fixed 1 s window allows bursts of up to 2× at a window edge.
- Oversized bodies are drained rather than destroyed. Add `Connection: close` to 413 responses.
- `String(body.player)` throws on a literal `null` body. It's caught and becomes a 400.
- Quitting during the cloudflared download or spawn can still leave cloudflared running in a narrow window. Check once with `tasklist`.
- After a cancelled start, pressing Stop and then Host immediately returns the old cancelled promise, so the user has to click again.
- If the tunnel dies during the readiness probe, the probe keeps polling for up to 20 s before reporting.
- `src/net.js`: wrap the UI callbacks in try/catch. `dropForTest` stays in the production API.
- The `'online'` modal state lingers (and renders nothing) after the host leaves the room.

## Test gaps
- **limits:**
  - the 172.15 boundary;
  - a trycloudflare Host header with a port or in uppercase;
  - an empty socket or headers;
  - an IPv6 `cf-connecting-ip`;
  - the prune path;
  - fc00:: and 169.254 counted as local.
- **server:** chunked bodies over 64 KB, and the join and act limiters.
- **tunnel:** a tampered cached binary, a non-OK HTTP download, and the `spawn` error code.
- **Browser QA:** the 15 s hidden-page refresh path and the reconnect race have been reasoned about but not exercised in a browser.

## Decisions made during M1 (for context)
- The app loads `http://localhost:<port>`. Keep this origin, because saved games are stored per origin.
- In-app Join opens the host's game in the friend's default browser. Remote pages never load in the app window.
- Live updates use WebSockets everywhere, because quick tunnels don't support Server-Sent Events.
