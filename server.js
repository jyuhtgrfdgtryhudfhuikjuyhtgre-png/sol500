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
