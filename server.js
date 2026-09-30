#!/usr/bin/env node
/*
 * SOL 500 — LAN co-op server. No dependencies: `node server.js`, then open the printed address on every device.
 * Serves index.html + src/*, keeps rooms in memory, and runs the same engine as the browser (the server is authoritative).
 * Transport: JSON POST for actions, Server-Sent Events for room updates.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const E = require('./src/engine.js');
const D = require('./src/data.js');

const MAX_PLAYERS = 5;
const MAX_ROOMS = 40;
const ROOM_TTL = 6 * 60 * 60 * 1000;
const PRESENT_MS = 30 * 1000;
const MAX_BODY = 256 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const PLAN_KEYS = ['modulesOn', 'rations', 'habMode', 'choices', 'answered', 'drainWall', 'builds', 'scrap', 'request'];

function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

const cleanName = (n, fallback) => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || fallback;
const newId = () => crypto.randomBytes(8).toString('hex');

function createServer() {
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
      lastReport: room.lastReport, advice: room.advice,
    };
  }

  function broadcast(room) {
    room.version++;
    room.touched = Date.now();
    const data = 'event: room\ndata: ' + JSON.stringify(publicRoom(room)) + '\n\n';
    for (const p of room.players) for (const res of p.clients) res.write(data);
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
    const host = player.id === room.hostId;
    const type = body.type;
    switch (type) {
      case 'rename':
        player.name = cleanName(body.name, player.name);
        if (player.crewId) room.settings.names[player.crewId] = player.name;
        return null;
      case 'claim': {
        const cid = body.crewId;
        if (cid == null) {
          if (player.crewId) delete room.settings.names[player.crewId];
          player.crewId = null;
          return null;
        }
        if (!crewIds(room).includes(cid)) return 'badCrew';
        if (room.players.some(p => p !== player && p.crewId === cid)) return 'taken';
        if (player.crewId) delete room.settings.names[player.crewId];
        player.crewId = cid;
        room.settings.names[cid] = player.name;
        return null;
      }
      case 'settings': {
        if (!host) return 'onlyHost';
        if (room.phase !== 'lobby' && room.phase !== 'manifest') return 'badPhase';
        let reset = false;
        if (body.difficulty && D.DIFFICULTY[body.difficulty]) { room.settings.difficulty = body.difficulty; reset = true; }
        if (body.crewSize && D.CREW_SIZES.includes(Number(body.crewSize))) {
          room.settings.crewSize = Number(body.crewSize);
          const ids = crewIds(room);
          for (const p of room.players) if (p.crewId && !ids.includes(p.crewId)) { delete room.settings.names[p.crewId]; p.crewId = null; }
          reset = true;
        }
        if (typeof body.seed === 'string') room.settings.seed = body.seed.replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 24) || room.settings.seed;
        if (reset) room.loadout = E.referenceKit(room.settings.difficulty, room.settings.crewSize);
        return null;
      }
      case 'phase':
        if (!host) return 'onlyHost';
        if (!['lobby', 'manifest'].includes(body.phase) || room.phase === 'ops') return 'badPhase';
        room.phase = body.phase;
        if (!room.loadout) room.loadout = E.referenceKit(room.settings.difficulty, room.settings.crewSize);
        return null;
      case 'loadout':
        if (!host) return 'onlyHost';
        if (room.phase !== 'manifest') return 'badPhase';
        room.loadout = E.normalizeLoadout(body.loadout);
        return null;
      case 'launch': {
        if (!host) return 'onlyHost';
        if (room.phase !== 'manifest' && room.phase !== 'lobby') return 'badPhase';
        const loadout = room.loadout || E.referenceKit(room.settings.difficulty, room.settings.crewSize);
        if (!E.validateLoadout(loadout, room.settings.difficulty, room.settings.crewSize).ok) return 'badLoadout';
        room.mission = E.createMission({
          seed: room.settings.seed, loadout, difficulty: room.settings.difficulty, crewSize: room.settings.crewSize,
          names: room.settings.names, coop: true,
        });
        room.plan = E.defaultPlan(room.mission);
        room.phase = 'ops';
        room.lastReport = null;
        room.advice = null;
        for (const p of room.players) p.ready = false;
        return null;
      }
      case 'job': {
        if (room.phase !== 'ops') return 'badPhase';
        const cid = body.crewId;
        if (!crewIds(room).includes(cid) || !D.JOBS[body.job]) return 'badJob';
        const owner = room.players.find(p => p.crewId === cid);
        if (!(player.crewId === cid || (host && !owner))) return 'notYours';
        room.plan.jobs = Object.assign({}, room.plan.jobs, { [cid]: body.job });
        return null;
      }
      case 'plan':
        if (room.phase !== 'ops') return 'badPhase';
        Object.assign(room.plan, cleanPatch(body.patch));
        return null;
      case 'ready':
        if (room.phase !== 'ops') return 'badPhase';
        player.ready = !!body.ready;
        maybeResolve(room);
        return null;
      case 'advance':
        if (!host) return 'onlyHost';
        if (room.phase !== 'ops') return 'badPhase';
        resolveRound(room);
        return null;
      case 'advice':
        if (room.phase !== 'ops') return 'badPhase';
        if (room.mission.schedule[room.mission.turn].conjunction) return 'blackout';
        if (!room.advice || room.advice.turn !== room.mission.turn) room.advice = { turn: room.mission.turn, items: E.advise(room.mission, room.plan) };
        return null;
      case 'restart':
        if (!host) return 'onlyHost';
        room.phase = 'lobby';
        room.mission = null;
        room.plan = null;
        room.lastReport = null;
        room.advice = null;
        room.settings.seed = E.newMissionCode();
        for (const p of room.players) p.ready = false;
        return null;
      case 'leave':
        room.players = room.players.filter(p => p !== player);
        for (const res of player.clients) res.end();
        if (player.crewId) delete room.settings.names[player.crewId];
        if (!room.players.length) { rooms.delete(room.code); return null; }
        if (room.hostId === player.id) room.hostId = (room.players.find(present) || room.players[0]).id;
        if (room.phase === 'ops') maybeResolve(room);
        return null;
      default:
        return 'badAction';
    }
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

  function send(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  function serveStatic(req, res, pathname) {
    let rel = null;
    if (pathname === '/' || pathname === '/index.html') rel = 'index.html';
    else if (/^\/src\/[a-z0-9-]+\.(js|css)$/.test(pathname)) rel = pathname.slice(1);
    if (!rel) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    fs.readFile(path.join(__dirname, rel), (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)], 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  }

  function sweep() {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.touched > ROOM_TTL && room.players.every(p => p.clients.size === 0)) rooms.delete(code);
    }
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
      if (req.method === 'POST' && p === '/api/room/create') {
        sweep();
        if (rooms.size >= MAX_ROOMS) { send(res, 503, { error: 'busy' }); return; }
        const body = await readBody(req);
        const room = {
          code: newCode(), hostId: null, version: 0, phase: 'lobby', players: [], touched: Date.now(),
          settings: { difficulty: D.DEFAULT_DIFFICULTY, crewSize: 5, seed: E.newMissionCode(), names: {} },
          loadout: null, mission: null, plan: null, lastReport: null, advice: null,
        };
        room.loadout = E.referenceKit(room.settings.difficulty, room.settings.crewSize);
        const host = addPlayer(room, body.name);
        room.hostId = host.id;
        rooms.set(room.code, room);
        send(res, 200, { code: room.code, playerId: host.id, token: host.token });
        return;
      }
      if (req.method === 'POST' && p === '/api/room/join') {
        const body = await readBody(req);
        const room = rooms.get(String(body.code || '').trim().toUpperCase());
        if (!room) { send(res, 404, { error: 'noRoom' }); return; }
        if (room.players.length >= MAX_PLAYERS) { send(res, 409, { error: 'full' }); return; }
        const pl = addPlayer(room, body.name);
        broadcast(room);
        send(res, 200, { code: room.code, playerId: pl.id, token: pl.token });
        return;
      }
      if (req.method === 'POST' && p === '/api/room/act') {
        const body = await readBody(req);
        const room = rooms.get(String(body.code || ''));
        const player = findPlayer(room, body.player, body.token);
        if (!player) { send(res, 403, { error: 'noRoom' }); return; }
        player.lastSeen = Date.now();
        const err = apply(room, player, body);
        if (err) { send(res, 400, { error: err }); return; }
        if (rooms.has(room.code)) broadcast(room);
        send(res, 200, { ok: true });
        return;
      }
      if (req.method === 'GET' && (p === '/api/room/state' || p === '/api/room/stream')) {
        const room = rooms.get(url.searchParams.get('code') || '');
        const player = findPlayer(room, url.searchParams.get('player'), url.searchParams.get('token'));
        if (p === '/api/room/state') {
          if (!player) { send(res, 403, { error: 'noRoom' }); return; }
          player.lastSeen = Date.now();
          send(res, 200, publicRoom(room));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        if (!player) { res.end('event: gone\ndata: {}\n\n'); return; }
        player.clients.add(res);
        player.lastSeen = Date.now();
        res.write('retry: 2000\n\n');
        broadcast(room);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => {
          clearInterval(ping);
          player.clients.delete(res);
          player.lastSeen = Date.now();
          if (rooms.has(room.code)) broadcast(room);
        });
        return;
      }
      if (req.method === 'GET') { serveStatic(req, res, p); return; }
      res.writeHead(405); res.end();
    } catch (e) {
      if (!res.headersSent) send(res, 400, { error: 'bad' });
      else res.end();
    }
  });
  server.rooms = rooms;
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
  });
}
