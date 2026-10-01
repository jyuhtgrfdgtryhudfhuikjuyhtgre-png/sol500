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
    socket.on('error', () => { /* a reset mid-refusal must not crash the process */ });
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
