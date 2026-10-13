'use strict';
/*
 * SOL 500 — rooms: players, seats, actions and the authoritative co-op mission.
 * No networking in here. A transport attaches "clients" to a player (any object with
 * send(type, data) and close()) and every room change fans out to them.
 */
const crypto = require('node:crypto');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const F = require('../src/fog.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');
const Z = require('../src/dangers.js');

const MAX_PLAYERS = 5;
const MAX_ROOMS = 40;
const ROOM_TTL = 6 * 60 * 60 * 1000;
const PRESENT_MS = 30 * 1000;
const POS_FANOUT_MS = 80;
const FOG_FANOUT_MS = 500;
const FOG_KEYS_PER_MESSAGE = 64;
const FOG_CHUNKS_MAX = 4096;
const MAX_COORD = 64000000; // world pixels either way of the HQ: the world is endless, the numbers are not
const PLAN_KEYS = ['modulesOn', 'rations', 'habMode', 'choices', 'answered', 'drainWall', 'builds', 'scrap', 'request'];
const EXPEDITION_ACTIONS = ['collect', 'deliver', 'canister', 'pickup', 'collapse', 'revive', 'board', 'park'];

const cleanName = (n, fallback) => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || fallback;
const newId = () => crypto.randomBytes(8).toString('hex');
const ok = () => ({ status: 200, body: { ok: true } });
const fail = (status, error) => ({ status, body: { error } });

// Exploring actions (spec §5 trust model): checked against the last position this player's game sent, and against the
// world the server builds itself from the mission code (src/expedition.js keeps a shared cache of 256 data chunks). The
// player's game adds what only it knows: its live suit level (a canister) and how far the rover went (park, collapse).
function expeditionAction(m, type, crewId, body, pos) {
  switch (type) {
    case 'collect': return X.collect(m, crewId, body.find, pos);
    case 'deliver': return X.deliver(m, crewId, pos);
    case 'canister': return X.useCanister(m, crewId, pos, body.suit);
    case 'pickup': return X.pickUp(m, crewId, body.drop, pos);
    case 'collapse': return X.collapse(m, crewId, pos, body.driven);
    case 'revive': return X.revive(m, crewId, body.target, pos);
    case 'board': return X.board(m, crewId, pos);
    case 'park': return X.park(m, crewId, pos, body.driven);
    default: return { error: 'badAction' }; // an action added to EXPEDITION_ACTIONS without a case here
  }
}

function createRooms(opts = {}) {
  const rooms = new Map();
  const onEvent = opts.onEvent || (() => {});

  // Room events feed the admin panel's log and the mission history. A failing listener must never break a game.
  function emit(type, room, extra) {
    try { onEvent(Object.assign({ type, at: Date.now(), code: room.code }, extra)); } catch (e) { /* ignore */ }
  }

  function newCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += letters[crypto.randomInt(letters.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function present(p) { return p.clients.size > 0 || Date.now() - p.lastSeen < PRESENT_MS; }

  // Fog is big and changes every second, so it travels in its own 'fog' frames, never inside 'room'.
  function withoutFog(m) {
    if (!m.expedition) return m;
    return Object.assign({}, m, { expedition: Object.assign({}, m.expedition, { revealed: {} }) });
  }

  // The round's clock (spec §3.4): seconds since this round began. Dust devils move by it and the solar flare is timed by
  // it, so every tab is sent it with each room frame and keeps it running from there.
  const age = room => (Date.now() - room.roundAt) / 1000;

  function publicRoom(room) {
    return {
      code: room.code, hostId: room.hostId, version: room.version, phase: room.phase, launch: room.launch,
      players: room.players.map(p => ({ id: p.id, name: p.name, crewId: p.crewId, ready: p.ready, connected: present(p) })),
      settings: room.settings, loadout: room.loadout, mission: room.mission && withoutFog(room.mission), plan: room.plan,
      lastReport: room.lastReport, advice: room.advice, positions: Object.values(room.positions),
      clock: room.phase === 'ops' && room.mission ? Math.round(age(room) * 1000) / 1000 : null,
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

  // Astronaut positions change many times a second, so they travel in their own small, throttled message. They also
  // carry the suit level and how many loads the astronaut carries (teammates see both), and, for the rover's driver,
  // how far it has been driven this round. The suit and the rover's battery are kept in the mission too.
  function position(room, player, body) {
    if (!player.crewId) return 'noCrew';
    const num = v => Math.max(-MAX_COORD, Math.min(MAX_COORD, Math.round(Number(v) || 0)));
    const m = room.phase === 'ops' && room.mission && room.mission.status === 'active' ? room.mission : null;
    const id = player.crewId, spot = { x: num(body.x), y: num(body.y) };
    let changed = false;
    if (m && body.suit != null) X.setSuit(m, id, body.suit);
    if (m && body.driven != null) X.setRoverDriven(m, id, body.driven);
    // A driver whose game says they are out of the rover has parked it there, even if their `park` never arrived.
    if (m && body.rover === false && m.expedition.rover && m.expedition.rover.driver === id && X.park(m, id, spot, body.driven).ok) changed = true;
    // The first crew member outside in a round with a solar flare starts its warning (spec §3.4); the server times it.
    if (m && !m.expedition.flare && Z.flareDue(m) && !X.inBaseZone(spot) && !m.expedition.collapsed[id] &&
      m.crew.some(c => c.id === id && c.status === 'active') && Z.flareStart(m, age(room)).ok) {
      flareLater(room);
      changed = true;
    }
    room.positions[id] = {
      crewId: id, x: spot.x, y: spot.y,
      dir: ['up', 'down', 'left', 'right'].includes(body.dir) ? body.dir : 'down',
      moving: !!body.moving, rover: !!body.rover,
      suit: m ? Math.round(X.suitOf(m, id)) : null,
      load: m && Array.isArray(m.expedition.carried[id]) ? m.expedition.carried[id].length : 0,
    };
    if (changed) broadcast(room);
    if (!room.posTimer) {
      room.posTimer = setTimeout(() => {
        room.posTimer = null;
        fanout(room, 'pos', Object.values(room.positions));
      }, POS_FANOUT_MS);
      if (room.posTimer.unref) room.posTimer.unref();
    }
    return null;
  }

  // The solar flare hits when its countdown ends: whoever the server last saw out in the open, give or take the slack
  // every checked action gets, has a flare incident. Crew without a player stay at the base, under cover.
  function flareLater(room) {
    stopFlare(room);
    const m = room.mission, turn = m.turn, launch = room.launch;
    room.flareTimer = setTimeout(() => {
      room.flareTimer = null;
      const now = room.mission;
      if (!now || now.turn !== turn || room.launch !== launch || room.phase !== 'ops') return;
      const spots = {};
      for (const p of Object.values(room.positions)) spots[p.crewId] = { x: p.x, y: p.y };
      if (Z.flareEnd(now, spots, D.EXPEDITION.reach, age(room)).ok) broadcast(room);
    }, Math.max(0, (m.expedition.flare.end - age(room)) * 1000));
    if (room.flareTimer.unref) room.flareTimer.unref();
  }
  function stopFlare(room) {
    if (room.flareTimer) { clearTimeout(room.flareTimer); room.flareTimer = null; }
  }

  // A player's newly seen fog: checked, OR-merged into the mission, and sent to everyone at most every 500 ms.
  function reveal(room, player, map) {
    if (!player.crewId) return 'noCrew';
    if (room.phase !== 'ops' || !room.mission || !room.mission.expedition) return 'badPhase';
    if (!map || typeof map !== 'object' || Array.isArray(map)) return 'badFog';
    const diff = {};
    for (const k of Object.keys(map).slice(0, FOG_KEYS_PER_MESSAGE)) if (F.KEY.test(k)) diff[k] = map[k];
    const changed = F.mergeMap(room.mission.expedition.revealed, diff, FOG_CHUNKS_MAX);
    if (!Object.keys(changed).length) return null;
    Object.assign(room.fogPending, changed);
    if (!room.fogTimer) {
      room.fogTimer = setTimeout(() => {
        room.fogTimer = null;
        const out = room.fogPending;
        room.fogPending = {};
        if (Object.keys(out).length) fanout(room, 'fog', out);
      }, FOG_FANOUT_MS);
      if (room.fogTimer.unref) room.fogTimer.unref();
    }
    return null;
  }

  // A mission ending or restarting drops any fog still waiting to go out.
  function stopFog(room) {
    if (room.fogTimer) { clearTimeout(room.fogTimer); room.fogTimer = null; }
    room.fogPending = {};
  }

  function findPlayer(room, id, token) {
    const p = room && room.players.find(x => x.id === id);
    return p && p.token === token ? p : null;
  }

  function addPlayer(room, name, meta) {
    const p = { id: newId(), token: newId(), name: cleanName(name, 'Crew ' + (room.players.length + 1)), crewId: null, ready: false, clients: new Set(), lastSeen: Date.now(), remote: !!(meta && meta.remote) };
    if (p.remote) room.everRemote = true;
    room.players.push(p);
    return p;
  }

  // Takes a player out of the room: frees their astronaut, closes their tabs and passes on the host role.
  function removePlayer(room, player, kind) {
    room.players = room.players.filter(p => p !== player);
    for (const c of player.clients) c.close(kind);
    if (player.crewId) { delete room.settings.names[player.crewId]; delete room.positions[player.crewId]; }
    player.crewId = null; // a position message still in flight must not bring the avatar back
    if (room.players.length && room.hostId === player.id) room.hostId = (room.players.find(present) || room.players[0]).id;
  }

  function closeRoom(room, reason) {
    if (room.posTimer) { clearTimeout(room.posTimer); room.posTimer = null; }
    stopFog(room);
    stopFlare(room);
    rooms.delete(room.code);
    emit('roomClosed', room, { reason });
  }

  function crewIds(room) { return D.CREW.slice(0, room.settings.crewSize).map(c => c.id); }

  function resolveRound(room) {
    const { state, report } = E.resolveTurn(room.mission, room.plan);
    room.mission = state;
    room.plan = E.nextPlan(state, room.plan);
    room.lastReport = report;
    room.advice = null;
    stopFlare(room); // a flare still counting down is over with the round: everyone is home
    room.roundAt = Date.now();
    for (const p of room.players) p.ready = false;
    emit('roundResolved', room, { round: state.turn, sol: state.sol });
    if (state.status !== 'active') {
      room.phase = 'debrief';
      emit('missionEnded', room, {
        outcome: state.status, sol: state.sol, mission: state, mode: room.everRemote ? 'online' : 'lan',
        players: room.players.filter(p => p.crewId).map(p => ({ name: p.name, crewId: p.crewId })),
      });
    }
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
        if (room.mission) { const c = room.mission.crew.find(x => x.id === cid); if (!c || c.status === 'dead') return 'deadCrew'; }
        const owner = room.players.find(p => p !== player && p.crewId === cid);
        if (owner && present(owner)) return 'taken';
        if (owner) { owner.crewId = null; delete room.positions[cid]; } // their tab is gone: a rejoining player takes the seat back
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
        stopFog(room);
        stopFlare(room);
        room.mission = E.createMission({
          seed: room.settings.seed, loadout, difficulty: room.settings.difficulty, crewSize: room.settings.crewSize,
          names: room.settings.names, coop: true,
        });
        room.plan = E.defaultPlan(room.mission);
        room.roundAt = Date.now();
        room.launch++; // tabs compare it: a launch under the same mission code is still a new mission
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
        stopFog(room);
        stopFlare(room);
        room.positions = {};
        room.phase = 'lobby';
        room.mission = null;
        room.plan = null;
        room.lastReport = null;
        room.advice = null;
        room.settings.seed = E.newMissionCode();
        for (const p of room.players) p.ready = false;
        return null;
      case 'region': {
        if (room.phase !== 'ops' || !room.mission) return 'badPhase';
        if (!player.crewId) return 'noCrew';
        if (!W.REGIONS.includes(body.region)) return 'badRegion';
        const list = room.mission.expedition.regions;
        if (!list.includes(body.region)) list.push(body.region);
        return null;
      }
      case 'leave':
        removePlayer(room, player);
        emit('playerLeft', room, { name: player.name });
        if (!room.players.length) { closeRoom(room, 'empty'); return null; }
        if (room.phase === 'ops') maybeResolve(room);
        return null;
      default:
        return 'badAction';
    }
  }

  function sweep() {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.touched > ROOM_TTL && room.players.every(p => p.clients.size === 0)) closeRoom(room, 'expired');
    }
  }

  function get(code) { return rooms.get(String(code || '').trim().toUpperCase()); }

  function auth(code, playerId, token) {
    const room = get(code);
    const player = findPlayer(room, playerId, token);
    return player ? { room, player } : null;
  }

  function create(name, meta = {}) {
    sweep();
    if (rooms.size >= MAX_ROOMS) return { status: 503, error: 'busy' };
    const room = {
      code: newCode(), hostId: null, version: 0, phase: 'lobby', launch: 0, players: [], touched: Date.now(), positions: {}, posTimer: null, fogPending: {}, fogTimer: null, everRemote: false,
      roundAt: Date.now(), flareTimer: null,
      settings: { difficulty: D.DEFAULT_DIFFICULTY, crewSize: 5, seed: E.newMissionCode(), names: {} },
      loadout: null, mission: null, plan: null, lastReport: null, advice: null,
    };
    room.loadout = E.referenceKit(room.settings.difficulty, room.settings.crewSize);
    const player = addPlayer(room, name, meta);
    room.hostId = player.id;
    rooms.set(room.code, room);
    emit('roomCreated', room, { name: player.name, remote: player.remote });
    return { room, player };
  }

  function join(code, name, meta = {}) {
    const room = get(code);
    if (!room) return { status: 404, error: 'noRoom' };
    if (room.players.length >= MAX_PLAYERS) {
      // Full: make space by dropping whoever has been gone longest (e.g. a friend rejoining through a new link).
      const stale = room.players.filter(p => !present(p)).sort((a, b) => a.lastSeen - b.lastSeen)[0];
      if (!stale) return { status: 409, error: 'full' };
      removePlayer(room, stale);
      emit('playerReplaced', room, { name: stale.name });
    }
    const player = addPlayer(room, name, meta);
    emit('playerJoined', room, { name: player.name, remote: player.remote });
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
    if (EXPEDITION_ACTIONS.includes(body.type)) {
      if (room.phase !== 'ops' || !room.mission) return fail(400, 'badPhase');
      if (!player.crewId) return fail(400, 'noCrew');
      const r = expeditionAction(room.mission, body.type, player.crewId, body, room.positions[player.crewId]);
      if (r.error) return fail(400, r.error);
      broadcast(room);
      return { status: 200, body: r };
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
    const fog = room.mission && room.mission.expedition && room.mission.expedition.revealed;
    if (fog && Object.keys(fog).length) client.send('fog', fog); // a new or reconnecting tab gets the whole fog
  }

  function detach(room, player, client) {
    player.clients.delete(client);
    player.lastSeen = Date.now();
    if (!rooms.has(room.code)) return;
    broadcast(room);
    if (player.clients.size) return;
    // Once the grace period is over, tell everyone this player is gone, so their seat can be taken back.
    const t = setTimeout(() => {
      if (!rooms.has(room.code) || !room.players.includes(player) || present(player)) return;
      // During a round the players still here may all be ready: don't keep them waiting for someone who left.
      if (room.phase === 'ops') maybeResolve(room);
      broadcast(room);
    }, PRESENT_MS + 500);
    if (t.unref) t.unref();
  }

  // Admin: remove one player. Their tabs hear "kicked" and stop reconnecting.
  function kick(code, playerId) {
    const room = get(code);
    const player = room && room.players.find(p => p.id === playerId);
    if (!player) return false;
    removePlayer(room, player, 'kicked');
    emit('playerKicked', room, { name: player.name });
    if (!room.players.length) { closeRoom(room, 'empty'); return true; }
    if (room.phase === 'ops') maybeResolve(room);
    broadcast(room);
    return true;
  }

  // Admin: end a room for everyone. Every tab hears "closed".
  function close(code) {
    const room = get(code);
    if (!room) return false;
    for (const p of room.players) for (const c of p.clients) c.close('closed');
    closeRoom(room, 'admin');
    return true;
  }

  // Admin: every room, for the live view. Never includes tokens.
  function snapshot() {
    return [...rooms.values()].map(room => ({
      code: room.code, phase: room.phase, crewSize: room.settings.crewSize, difficulty: room.settings.difficulty,
      round: room.mission ? room.mission.turn : null, sol: room.mission ? room.mission.sol : null, everRemote: !!room.everRemote,
      players: room.players.map(p => ({
        id: p.id, name: p.name, crewId: p.crewId, role: p.crewId ? (D.CREW.find(c => c.id === p.crewId) || {}).role || null : null,
        host: p.id === room.hostId, connected: present(p), lastSeen: p.lastSeen, remote: !!p.remote,
      })),
    }));
  }

  return { rooms, create, join, auth, act, position, reveal, attach, detach, publicRoom, kick, close, snapshot };
}

module.exports = { createRooms, MAX_PLAYERS };
