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
          if (player.crewId) { delete room.settings.names[player.crewId]; delete room.positions[player.crewId]; }
          player.crewId = null;
          return null;
        }
        if (!crewIds(room).includes(cid)) return 'badCrew';
        if (room.players.some(p => p !== player && p.crewId === cid)) return 'taken';
        if (player.crewId) { delete room.settings.names[player.crewId]; delete room.positions[player.crewId]; }
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
        for (const c of player.clients) c.close();
        if (player.crewId) { delete room.settings.names[player.crewId]; delete room.positions[player.crewId]; }
        if (!room.players.length) { rooms.delete(room.code); return null; }
        if (room.hostId === player.id) room.hostId = (room.players.find(present) || room.players[0]).id;
        if (room.phase === 'ops') maybeResolve(room);
        return null;
      default:
        return 'badAction';
    }
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
