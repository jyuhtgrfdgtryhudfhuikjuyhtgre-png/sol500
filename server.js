#!/usr/bin/env node
/*
 * SOL 500 — LAN co-op server. `node server.js`, then open the printed address on every device.
 * Serves index.html + src/* and hosts rooms (lib/rooms.js), which run the same engine as the browser,
 * and the admin panel (lib/admin.js).
 * Transport: JSON POST for actions, one WebSocket per tab (/ws) for live updates.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRooms, MAX_PLAYERS } = require('./lib/rooms.js');
const { attachWebSocket } = require('./lib/ws.js');
const MAX_SOCKETS = 100;

const { clientIp, createLimiter, requestClass } = require('./lib/limits.js');
const { send, readBody } = require('./lib/http.js');
const { createAdmin } = require('./lib/admin.js');
const { privateIPv4 } = require('./app/join.js');
const { createHistory } = require('./lib/history.js');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
};

// Only addresses the app's own Join accepts (private ranges): VPN ones (Radmin, Hamachi, Tailscale) would be refused there.
function lanAddresses(port, ifaces = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(ifaces)) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && privateIPv4(a.address)) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

function createServer(opts = {}) {
  const dataDir = opts.dataDir || null;
  let admin = null;
  const rooms = createRooms({ onEvent: ev => { if (admin) admin.onRoomEvent(ev); } });
  admin = createAdmin({
    dataDir, adminKey: opts.adminKey || null, rooms, history: createHistory({ dataDir }),
    progressFile: opts.progressFile || path.join(__dirname, 'progress.json'),
    allowProgressRefresh: !!opts.allowProgressRefresh,
    info: () => { const a = server.address(); const port = a && a.port; return { port, addresses: port ? lanAddresses(port) : [] }; },
  });
  const limits = {
    create: createLimiter({ limit: 10, windowMs: 60000 }),
    join: createLimiter({ limit: 30, windowMs: 60000 }),
    act: createLimiter({ limit: 20, windowMs: 1000 }),
  };

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

  function seat(res, r) {
    if (r.error) { send(res, r.status, { error: r.error }); return; }
    send(res, 200, { code: r.room.code, playerId: r.player.id, token: r.player.token });
  }

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); res.end(); return; }
    const p = url.pathname;
    const cls = requestClass(req);
    const remote = cls === 'remote';
    const ip = clientIp(req);
    const tooFast = () => send(res, 429, { error: 'slowDown' });
    try {
      if (req.method === 'GET' && p === '/api/info') {
        const port = server.address() && server.address().port;
        send(res, 200, { lan: true, maxPlayers: MAX_PLAYERS, addresses: remote ? [] : lanAddresses(port), adminHere: cls === 'local' });
        return;
      }
      if (await admin.handle(req, res, url, cls, ip)) return;
      if (req.method === 'POST' && p === '/api/room/create') {
        if (remote && !limits.create.hit(ip)) { tooFast(); return; }
        seat(res, rooms.create((await readBody(req)).name, { remote }));
        return;
      }
      if (req.method === 'POST' && p === '/api/room/join') {
        if (remote && !limits.join.hit(ip)) { tooFast(); return; }
        const body = await readBody(req);
        seat(res, rooms.join(body.code, body.name, { remote }));
        return;
      }
      if (req.method === 'POST' && p === '/api/room/act') {
        const body = await readBody(req);
        if (remote && !limits.act.hit(String(body.player))) { tooFast(); return; }
        const r = rooms.act(body);
        send(res, r.status, r.body);
        return;
      }
      if (req.method === 'GET' && p === '/api/room/state') {
        const found = rooms.auth(url.searchParams.get('code'), url.searchParams.get('player'), url.searchParams.get('token'));
        if (!found) { send(res, 403, { error: 'noRoom' }); return; }
        found.player.lastSeen = Date.now();
        send(res, 200, rooms.publicRoom(found.room));
        return;
      }
      if (req.method === 'GET') { serveStatic(req, res, p); return; }
      res.writeHead(405); res.end();
    } catch (e) {
      const big = e && e.status === 413;
      if (!res.headersSent) send(res, big ? 413 : 400, { error: big ? 'tooBig' : 'bad' });
      else res.end();
    }
  });
  const live = attachWebSocket(server, rooms, { maxConnections: MAX_SOCKETS, msgPerSecond: 30 });
  const closeHttp = server.close.bind(server);
  server.close = cb => { live.shutdown(); return closeHttp(cb); };
  server.rooms = rooms.rooms;
  server.adminKey = admin.key;
  server.setOnline = admin.setOnline;
  return server;
}

module.exports = { createServer, lanAddresses };

if (require.main === module) {
  const port = Number(process.env.PORT) || 5050;
  const at = process.argv.indexOf('--data');
  const dataDir = at > 0 && process.argv[at + 1] ? path.resolve(process.argv[at + 1]) : path.join(__dirname, 'data');
  const server = createServer({ dataDir, allowProgressRefresh: true });
  server.listen(port, '0.0.0.0', () => {
    console.log('\n  SOL 500 · LAN co-op server is running.\n');
    console.log('  On this computer:        http://localhost:' + port);
    const addrs = lanAddresses(port);
    if (addrs.length) console.log('  Other devices on Wi-Fi:  ' + addrs.join('   '));
    console.log('  Admin panel (this PC):   http://localhost:' + port + '/admin');
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
