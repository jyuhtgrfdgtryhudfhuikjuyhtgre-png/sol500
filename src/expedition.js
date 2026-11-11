/*
 * SOL 500 — exploring (spec §3, §4): the rules for finds, the backpack, the suit, collapses and the rover.
 * Pure (no DOM): the server runs it for co-op and ui.js runs it for solo play, so both play by the same rules.
 *
 * Every action first checks the mission, the crew member and the world (built here from the mission code), and
 * returns { error } without changing anything; otherwise it changes mission.expedition in place and returns
 * { ok: true, ... }. Positions are world pixels { x, y } (64 px a tile, the HQ tile's corner at 0, 0): the numbers
 * the surface draws with and the network sends. The mission state is described at newExpedition in src/engine.js.
 *
 * API: findById(m, id) → the find plus { id, cx, cy, left } or null · findsIn(m, cx, cy) · cavesIn(m, cx, cy)
 *      (the finds and caves under a point of interest's footprint are left out: never shown, never collected)
 *      landmarksIn(m, cx, cy) · structuresIn(m, cx, cy) · landmarkById(m, id, pos) · structureById(m, id, pos) → or null
 *      chunkAt(m, cx, cy) → the data chunk · loadsLeft(m, find, id) · itemFor(m, find, load, role) · holdSeconds(kind, role)
 *      capacity(m, crewId) · inBaseZone(m, pos, slack) · suitOf(m, crewId) · setSuit(m, crewId, s) · bay(m, kind) → a vehicle's bay
 *      setWhere(m, crewId, pos) · whereOf(m, crewId) (solo: where you stand, so a reload puts you back there)
 *      commanderOut(m, positions) → { id, x, y } while the commander is out on the map, else null (his aura and route line)
 *      speedFactor(m, crewId, positions) → 1.1 within 5 tiles of the commander while he is out, else 1 (positions: the server's
 *        { crewId: { x, y } } map, or the network's [{ crewId, x, y }] list; it holds crewId's own spot too)
 *      addDistance(m, crewId, from, to, dt) → tiles walked between two position samples, added to stats[crewId].distance
 *      collect(m, crewId, siteId, pos) (a find "<cx>,<cy>:<n>", a landmark's site "L<i>,<j>:<n>", a formation's survey
 *        "F<cx>,<cy>:0") · deliver(m, crewId, pos) · useCanister(m, crewId, pos, liveSuit)
 *      pickUp(m, crewId, dropId, pos) · collapse(m, crewId, pos, driven) · revive(m, crewId, targetId, pos)
 *      board(m, crewId, pos, kind) · park(m, crewId, pos, driven, kind) (kind: 'rover', the default, or 'cabin', the
 *        pressurised rover, M6) · vehicleOf(m, crewId) → 'rover' | 'cabin' | null: the vehicle they are in (driving it, or
 *        riding in the pressurised rover) · ride(m, crewId, pos, positions) · alight(m, crewId): co-op's passenger (M6)
 *      discover(m, crewId, landmarkId, pos) → { ok, landmark, science }: the first sighting of a landmark's centre
 *      interact(m, crewId, structId, pos) → { ok, done: 'used' | 'repaired', items, left, fog }: a Kestrel structure
 *      refill(m, crewId, id, pos) → { ok, suit }: a full suit inside a hab pod ("S<i>,<j>") or by a relay beacon ("B<i>"),
 *        once at each for each crew member a round; a pod also counts a visit in stats[crewId].pods (the Science notes)
 *      forecastAhead(m) → next round's weather while a repaired weather station forecasts it, or null
 *      mastMarks(m) → [{ id, x, y, kind }]: what the repaired comms masts mark on the minimap (world tiles)
 *      takeKit(m, crewId, pos) · returnKit(m, crewId, pos) → { ok, kits }: a relay beacon kit from the base into your
 *        backpack, or back (kits: those left at the base)
 *      beaconSpot(m, crewId, pos) → { ok, x, y } (the tile) or { error, need?, beacon? }: may a beacon go where you stand?
 *        No changes · placeBeacon(m, crewId, pos) → { ok, beacon: "B<i>", fog }: places one there from your kit
 *      routeHome(m) → [{ from, to, x0, y0, x1, y1 }]: the dashed route home, a link a beacon (world tiles)
 *      left(m, kind) → tiles a vehicle can still drive this round · roverLeft(m) → the rover's
 *      setRoverDriven(m, crewId, tiles) (the driver's game: the vehicle they drive)
 *      revealAround(m, cx, cy, r) → what changed: the fog within r tiles of (cx, cy) (tile units) revealed for good
 *      canFly(m, crewId, pos) → { ok, left } or { error }: may the scout drone take off from where you are? No changes ·
 *        fly(m, crewId, pos, tx, ty) → { ok, fog }: it flies to tile (tx, ty) and clears the fog round it (M6)
 *      cacheSize() → data chunks in the shared world cache (at most 256)
 * Solar flares, shelters, dust devils and how far you can see are src/dangers.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./worldgen.js'), require('./engine.js'), require('./fog.js'));
  else root.SolExpedition = factory(root.SolData, root.SolWorldgen, root.SolEngine, root.SolFog);
})(typeof self !== 'undefined' ? self : this, function (D, W, E, Fog) {
  'use strict';
  const T = 64;
  const X = D.EXPEDITION;
  const CRATERS = W.REGIONS.indexOf('craters');

  // ---------- the world: one cache of data chunks shared by every mission (and, on the server, every room) ----------
  const CACHE = 256;
  const cache = new Map(); // "<world seed>|<cx>,<cy>" → chunk, oldest first
  function chunkAt(m, cx, cy) {
    const seed = W.seedOf(m.seed), k = seed + '|' + cx + ',' + cy;
    let c = cache.get(k);
    if (c) { cache.delete(k); cache.set(k, c); return c; }
    c = W.chunk(seed, cx, cy);
    cache.set(k, c);
    if (cache.size > CACHE) cache.delete(cache.keys().next().value);
    return c;
  }
  // A find or a cave under a landmark's or a structure's footprint keeps its place in its chunk's list (its id is its index)
  // but is never shown: the chunk lists it in `hidden`, and the readers here leave it out.
  const shown = (list, hidden) => (hidden.length ? Object.freeze(list.filter(o => !hidden.includes(o.n))) : list);
  function findsIn(m, cx, cy) { const c = chunkAt(m, cx, cy); return shown(c.finds, c.hidden.finds); }
  function cavesIn(m, cx, cy) { const c = chunkAt(m, cx, cy); return shown(c.caves, c.hidden.caves); }
  function landmarksIn(m, cx, cy) { return chunkAt(m, cx, cy).landmarks; }
  function structuresIn(m, cx, cy) { return chunkAt(m, cx, cy).structures; }

  // Ids are written exactly the way the world writes them, so one thing has one id: the numbers in one, or null.
  function idNums(re, id) {
    const g = typeof id === 'string' && re.exec(id);
    if (!g) return null;
    const nums = g.slice(1).map(Number);
    return g.slice(1).every((s, i) => String(nums[i]) === s) ? nums : null;
  }
  // Is a position (world pixels) in cell (i, j) of a grid `size` tiles wide?
  const inCell = (pos, i, j, size) => Math.floor(pos.x / (T * size)) === i && Math.floor(pos.y / (T * size)) === j;

  // A find's id is "<cx>,<cy>:<n>".
  const ID = /^(-?\d{1,7}),(-?\d{1,7}):(\d{1,2})$/;
  function findById(m, id) {
    const g = idNums(ID, id);
    if (!g) return null;
    const [cx, cy, n] = g;
    const c = chunkAt(m, cx, cy), f = c.finds[n];
    if (!f || c.hidden.finds.includes(n)) return null;
    return Object.assign({ id, cx, cy, left: loadsLeft(m, f, id) }, f);
  }
  // A landmark's id is "L<i>,<j>" (its 256-tile cell), a structure's "S<i>,<j>" (its 64-tile cell). Each is only looked up
  // from a position inside its cell, as a find is from its chunk: you see a landmark's centre (22 tiles inside its cell)
  // and use a structure from its door (2 tiles inside) only from there, so an id sent from far away costs nothing. The
  // world reads them from its own cells, without building a chunk; they are frozen, like the cache.
  const LID = /^L(-?\d{1,7}),(-?\d{1,7})$/, SID = /^S(-?\d{1,7}),(-?\d{1,7})$/;
  // What turns an id from outside into the world's landmark or structure: how it is spelled (its first two numbers are its
  // cell), the grid of cells it lies on, the world's lookup (called through W each time, never held on to, so a test that
  // swaps it to count the lookups counts them all) and the error for none.
  const LANDMARK = { re: LID, grid: D.LANDMARKS, at: (seed, i, j) => W.landmarkAt(seed, i, j), none: () => ({ error: 'noLandmark' }) };
  const STRUCTURE = { re: SID, grid: D.STRUCTURES, at: (seed, i, j) => W.structureAt(seed, i, j), none: () => ({ error: 'noStructure' }) };
  // The one place it happens, for every action that takes such an id and for the two readers below: the landmark or the
  // structure, or the { error } of the first check to fail, with the world asked last. Not spelled so, or nothing there, is
  // K.none(); a position outside its cell is 'tooFar'.
  function poiAt(m, id, pos, K) {
    const g = idNums(K.re, id);
    if (!g) return K.none();
    if (!inCell(pos, g[0], g[1], K.grid.cell)) return { error: 'tooFar' };
    return K.at(W.seedOf(m.seed), g[0], g[1]) || K.none();
  }
  // The two readers say null to any refusal, whatever the reason.
  const found = o => (o.error ? null : o);
  function landmarkById(m, id, pos) { return okPos(pos) ? found(poiAt(m, id, pos, LANDMARK)) : null; }
  function structureById(m, id, pos) { return okPos(pos) ? found(poiAt(m, id, pos, STRUCTURE)) : null; }
  function loadsLeft(m, f, id) {
    const v = m.expedition.sites[id == null ? f.id : id];
    return Number.isFinite(v) ? v : D.FINDS[f.kind].loads[f.ring];
  }
  // What you can collect: a find, a landmark's site ("L<i>,<j>:<n>") or a formation's survey ("F<cx>,<cy>:0"), plus its id
  // and loads left, or { error }. Each is looked up only from inside what holds it: a find's or a formation's chunk (the
  // survey is at the formation's spot, 1.5 tiles or more inside it, no less than the reach), a landmark's cell (its sites
  // lie in its box, 3 tiles inside).
  const LSITE = /^L(-?\d{1,7}),(-?\d{1,7}):(\d{1,2})$/, FSITE = /^F(-?\d{1,7}),(-?\d{1,7}):0$/;
  // A landmark's site is spelled with its number after the landmark's id, and no landmark there is no find.
  const LANDMARK_SITE = Object.assign({}, LANDMARK, { re: LSITE, none: () => ({ error: 'noFind' }) });
  function siteAt(m, id, pos) {
    let g = idNums(ID, id), f = null;
    if (g) {
      if (!inCell(pos, g[0], g[1], W.CHUNK)) return { error: 'tooFar' };
      return findById(m, id) || { error: 'noFind' };
    }
    if ((g = idNums(LSITE, id))) {
      const l = poiAt(m, id, pos, LANDMARK_SITE);
      if (l.error) return l;
      f = l.sites[g[2]];
    } else if ((g = idNums(FSITE, id))) {
      if (!inCell(pos, g[0], g[1], W.CHUNK)) return { error: 'tooFar' };
      const k = chunkAt(m, g[0], g[1]).formations[0];
      f = k && k.sites[0];
    }
    return f ? Object.assign({ id, left: loadsLeft(m, f, id) }, f) : { error: 'noFind' };
  }

  // ---------- small helpers ----------
  const okPos = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const dist2 = (a, x, y) => (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
  const nearPx = (pos, x, y, tiles) => dist2(pos, x, y) <= (tiles * T) * (tiles * T);
  const nearTile = (pos, tx, ty) => nearPx(pos, (tx + 0.5) * T, (ty + 0.5) * T, X.reach);
  // The base zone: the tiles within the rank's zone of the HQ either way (Chebyshev, E.zoneOf: a Camp's 2 tiles are world
  // pixels −128 up to, not including, 192 on each axis), plus `slack` tiles for a position sent a moment ago.
  function inBaseZone(m, pos, slack) {
    if (!okPos(pos)) return false;
    const z = E.zoneOf(m), s = slack || 0, lo = -z - s, hi = z + 1 + s, tx = pos.x / T, ty = pos.y / T;
    return tx >= lo && tx < hi && ty >= lo && ty < hi;
  }
  const crewOf = (m, id) => m.crew.find(c => c.id === id) || null;
  const pack = (x, id) => (Array.isArray(x.carried[id]) ? x.carried[id] : []);
  // The vehicles (M6): today's rover and the pressurised rover ('cabin'). Each has its bay (a layout tile of its type), its state
  // (x.rover / x.cabin: null at its bay, { x, y } parked, { driver } driven), its battery (x.roverDriven / x.cabinDriven: tiles
  // driven this round, rangeOf a round) and one driver. No kind is the rover, as before M6; any other is no vehicle (null).
  const KINDS = ['rover', 'cabin'];
  const kindOf = k => (k == null ? 'rover' : KINDS.includes(k) ? k : null);
  const rangeOf = k => (k === 'cabin' ? X.cabin.range : X.roverRange);
  const drivesThe = (x, id, k) => !!id && !!x[k] && x[k].driver === id;
  const drives = (x, id) => KINDS.find(k => drivesThe(x, id, k)) || null; // the vehicle they drive, or null
  function vehicleOf(m, crewId) {
    const x = m && m.expedition;
    return x ? drives(x, crewId) || (x.riders && x.riders[crewId] === 'cabin' ? 'cabin' : null) : null;
  }
  // Fabricator gear (M6): the levels bought apply to the whole crew at once. A mission with none (a Quick one, a 3.7.0 save)
  // has today's numbers.
  const gearLevel = (m, line) => {
    const v = m && m.gear && m.gear[line];
    return Number.isInteger(v) && v > 0 ? Math.min(v, D.GEAR[line].levels.length) : 0;
  };
  const gearValue = (m, line, base) => { const l = gearLevel(m, line); return l ? D.GEAR[line].levels[l - 1].value : base; };
  const suitMax = m => gearValue(m, 'tanks', X.suit);     // seconds
  const packOf = m => gearValue(m, 'backpack', X.pack);   // loads on foot
  const rackOf = m => gearValue(m, 'racks', X.packRover); // loads in a rover
  function capacity(m, crewId) { return drives(m.expedition, crewId) ? rackOf(m) : packOf(m); }
  function suitOf(m, crewId) {
    const v = m.expedition.suits[crewId];
    return Number.isFinite(v) ? v : suitMax(m);
  }
  // Seconds of holding E for a find (or 'pickup', 'revive'), with the role's skill (spec §3.3), or for a structure (its
  // own seconds in D.STRUCTURES, the Engineer's where it has them; the hab pod has none, and 'pod' is a cargo pod's), or for
  // any other kind with a block of its own in D.EXPEDITION that has a `hold` (the relay beacon's 4 s, spec §3.8): that, for
  // every role.
  // `m` (optional) brings the tools gear's factor, applied to the result of every branch.
  function holdSeconds(kind, role, m) {
    return holdBase(kind, role) * gearValue(m, 'tools', 1);
  }
  function holdBase(kind, role) {
    const S = D.STRUCTURES.kinds[kind];
    if (S && S.hold) return role === 'engineer' && S.engineer ? S.engineer : S.hold;
    const own = X[kind];
    if (own && own.hold > 0) return own.hold;
    const base = kind === 'science' ? X.hold.survey : kind === 'pickup' ? X.hold.pickup : kind === 'revive' ? X.hold.revive : X.hold.load;
    const skill = D.SKILLS[role] || {};
    return base * (skill[kind] || 1);
  }

  // The crew member may act on the map: the mission is on, they are alive and active, and they are on their feet (not
  // collapsed waiting for a revive, nor sitting out the round after a solo collapse).
  function able(m, crewId) {
    if (!m || m.status !== 'active' || !m.expedition) return { error: 'badPhase' };
    const c = crewOf(m, crewId);
    if (!c) return { error: 'noCrew' };
    if (c.status !== 'active') return { error: 'notActive' };
    const x = m.expedition;
    if (x.collapsed[crewId]) return { error: 'collapsed' };
    if (x.benched.includes(crewId)) return { error: 'benched' };
    return { crew: c };
  }

  // What one load of a find gives. A cargo pod's loads are fixed by the mission code, not by who opens it.
  function itemFor(m, f, load, role) {
    const F = D.FINDS[f.kind];
    const item = { kind: f.kind, id: f.id, region: f.region };
    if (f.kind === 'ice' || f.kind === 'metal') return Object.assign(item, { res: F.res, amount: F.kg });
    if (f.kind === 'science') {
      const k = (f.region === CRATERS ? F.craters : 1) * (role === 'scientist' ? D.SKILLS.scientist.scienceBonus : 1);
      return Object.assign(item, { res: 'science', amount: Math.round(F.science[f.ring] * k), sub: f.sub });
    }
    return Object.assign(item, supply(W.hash(W.seedOf(m.seed), f.x, f.y, 700 + load)));
  }
  // A load of supplies (a cargo pod's, a supply cache's) from its hash: a spare kit (the rarest), food or an O₂ canister.
  function supply(h) {
    const pick = h % 5;
    if (pick === 0) return { res: 'spares', amount: 1 };
    if (pick <= 3) return { res: 'food', amount: D.FINDS.pod.food };
    return { res: 'o2', amount: X.canister.o2, canister: true };
  }
  function statsOf(x, crewId) {
    if (!x.stats[crewId] || typeof x.stats[crewId] !== 'object') x.stats[crewId] = { finds: {} };
    if (!x.stats[crewId].finds) x.stats[crewId].finds = {};
    return x.stats[crewId];
  }

  // ---------- the team on the map (spec §3.3, §3.5, §3.10, M4d) ----------
  // Where a crew member stands in `positions` (world pixels), or null for anything that is not a position. `positions` is the map
  // the server keeps ({ crewId: { x, y } }, room.positions) or the list the network sends ([{ crewId, x, y }, ...]).
  const spotIn = (positions, id) => {
    const p = Array.isArray(positions) ? positions.find(q => !!q && q.crewId === id) : positions && positions[id];
    return okPos(p) ? p : null;
  };
  // The commander when he is out on the map: alive, on his feet and past the base zone, as { id, x, y }, else null. His aura and
  // the route line his pings draw count only then (§13.12).
  function commanderOut(m, positions) {
    const c = m && m.crew && m.crew.find(k => k.role === 'commander'), x = m && m.expedition, spot = c && spotIn(positions, c.id);
    if (!spot || !x || c.status !== 'active' || x.collapsed[c.id] || x.benched.includes(c.id) || inBaseZone(m, spot, 0)) return null;
    return { id: c.id, x: spot.x, y: spot.y };
  }
  // How much faster a crew member moves: D.SKILLS.commander.auraSpeed (1.1) within auraRange (5 tiles) of the commander while he
  // is out, else 1. He counts too, so the group he leads never outruns his reach. `positions` holds the crew member's own spot.
  function speedFactor(m, crewId, positions) {
    const lead = commanderOut(m, positions), me = lead && spotIn(positions, crewId);
    return me && nearPx(me, lead.x, lead.y, D.SKILLS.commander.auraRange) ? D.SKILLS.commander.auraSpeed : 1;
  }

  // Walking distance (spec §3.10): the tiles walked between two position samples (world pixels, the crew member's own game's, or
  // the server's last two), added to x.stats[crewId].distance and returned. `dt` is the seconds between them on the caller's
  // clock. A step of more than TEAM.walk.jump tiles is a jump (a reload, a teleport, a solo collapse sending you home): it counts
  // for nothing. The rest is capped by what the time allows (TEAM.walk.speed tiles a second), so a stream of steps never adds more
  // than real time does; without a usable `dt` only the jump rule is left. Only an astronaut who can act and is on foot walks:
  // a sample in the rover counts for nothing (the rover has its own odometer, roverDriven).
  function addDistance(m, crewId, from, to, dt) {
    if (able(m, crewId).error || !okPos(from) || !okPos(to) || from.rover || to.rover) return 0;
    if (m.expedition.riders && m.expedition.riders[crewId]) return 0; // a passenger's ride (M6): their position says on foot
    const walk = D.TEAM.walk;
    let tiles = Math.hypot(to.x - from.x, to.y - from.y) / T;
    if (tiles > walk.jump) return 0;
    if (typeof dt === 'number' && Number.isFinite(dt)) tiles = Math.min(tiles, walk.speed * Math.max(0, dt));
    if (!(tiles > 0)) return 0;
    const st = statsOf(m.expedition, crewId);
    st.distance = (st.distance > 0 && Number.isFinite(st.distance) ? st.distance : 0) + tiles;
    return tiles;
  }

  // ---------- actions ----------
  // Takes one load from a find, or a landmark's or a formation's site, next to you into your backpack.
  function collect(m, crewId, siteId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    // A site is only in reach from inside what holds it. Checked before anything is built: an id from far away would cost a
    // build and push other rooms' chunks out of the shared cache.
    const f = siteAt(m, siteId, pos);
    if (f.error) return f;
    if (!nearTile(pos, f.x, f.y)) return { error: 'tooFar' };
    if (f.left <= 0) return { error: 'empty' };
    const x = m.expedition, mine = pack(x, crewId);
    if (mine.length >= capacity(m, crewId)) return { error: 'full' };
    const item = itemFor(m, f, D.FINDS[f.kind].loads[f.ring] - f.left, a.crew.role);
    x.carried[crewId] = mine.concat([item]);
    x.sites[siteId] = f.left - 1;
    const st = statsOf(x, crewId);
    st.finds[f.kind] = (st.finds[f.kind] || 0) + 1;
    return { ok: true, item, left: f.left - 1 };
  }

  // Everything in your backpack goes into the round's bank; it counts when the round advances. A beacon kit stays in the
  // backpack: you are taking it out (returnKit puts it back with the base's kits).
  function deliver(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!inBaseZone(m, pos, X.reach)) return { error: 'notAtBase' };
    const x = m.expedition, mine = pack(x, crewId), items = mine.filter(it => !E.isKit(it));
    if (!items.length) return { error: 'empty' };
    for (const it of items) E.bankItem(x.banked, crewId, it, false);
    x.carried[crewId] = mine.filter(E.isKit);
    return { ok: true, items };
  }

  // Breathes an O₂ canister from your backpack now: +45 s of suit. Only outside the base zone, and only when your suit has
  // room for all of it, so a canister is never wasted (carried home it is worth 10 kg of the base's O₂). `live` is the suit
  // level your own game has now: the one it last reported can be up to 2 s old.
  function useCanister(m, crewId, pos, live) {
    const a = able(m, crewId);
    if (a.error) return a;
    const x = m.expedition, mine = pack(x, crewId), i = mine.findIndex(it => it && it.canister);
    if (i < 0) return { error: 'noCanister' };
    if (!okPos(pos)) return { error: 'badPos' };
    if (inBaseZone(m, pos, 0)) return { error: 'atBase' };
    setSuit(m, crewId, live);
    if (suitOf(m, crewId) > suitMax(m) - X.canister.suit) return { error: 'suitFull' };
    x.carried[crewId] = mine.slice(0, i).concat(mine.slice(i + 1));
    x.suits[crewId] = Math.min(suitMax(m), suitOf(m, crewId) + X.canister.suit);
    return { ok: true, suit: x.suits[crewId] };
  }

  // Picks up a dropped load (a collapsed crew member's), as much as your backpack takes.
  function pickUp(m, crewId, dropId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition, d = x.drops.find(k => k.id === dropId);
    if (!d) return { error: 'noDrop' };
    if (!nearPx(pos, d.x, d.y, X.reach)) return { error: 'tooFar' };
    const mine = pack(x, crewId), room = capacity(m, crewId) - mine.length;
    if (room <= 0) return { error: 'full' };
    const take = d.items.slice(0, room);
    x.carried[crewId] = mine.concat(take);
    d.items = d.items.slice(room);
    if (!d.items.length) x.drops = x.drops.filter(k => k !== d);
    return { ok: true, items: take, left: d.items.length };
  }

  // Your suit ran out outside the base zone. In co-op you wait where you fell for a crewmate to revive you; if nobody does
  // before the round advances, it counts as a collapse then. In solo nobody can come, so the collapse counts now, your load
  // stays where you fell and you are back at the base until the next round. A driver's game also says how far the vehicle
  // went (`driven`), so the last seconds of driving count too; it is left where you fell.
  function collapse(m, crewId, pos, driven) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    if (inBaseZone(m, pos, 0)) return { error: 'atBase' };
    const x = m.expedition, spot = { x: Math.round(pos.x), y: Math.round(pos.y) };
    x.suits[crewId] = 0;
    if (x.riders) delete x.riders[crewId]; // a passenger is out of the seat where they fell: the next teammate can ride
    const k = drives(x, crewId);
    if (k) {
      setRoverDriven(m, crewId, driven);
      x[k] = { x: spot.x, y: spot.y };
      if (k === 'cabin') x.riders = {}; // its passenger gets out there too
    }
    if (m.coop) {
      x.collapsed[crewId] = spot;
      return { ok: true, waiting: true };
    }
    x.incidents.push({ crewId, kind: 'collapse' });
    const mine = pack(x, crewId);
    if (mine.length) {
      x.drops.push({ id: m.turn + ':' + crewId, x: spot.x, y: spot.y, items: mine });
      while (x.drops.length > X.maxDrops) x.drops.shift();
    }
    x.carried[crewId] = [];
    x.benched.push(crewId);
    return { ok: true, benched: true };
  }

  // Co-op: stand by a collapsed crewmate and hold E. They get up with 30 s of suit and nothing is recorded.
  function revive(m, crewId, targetId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!m.coop) return { error: 'solo' };
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition, spot = Object.prototype.hasOwnProperty.call(x.collapsed, targetId) ? x.collapsed[targetId] : null;
    if (!spot) return { error: 'notCollapsed' };
    if (!nearPx(pos, spot.x, spot.y, X.reach)) return { error: 'tooFar' };
    delete x.collapsed[targetId];
    x.suits[targetId] = X.reviveSuit;
    return { ok: true };
  }

  // A vehicle's bay: the centre of its tile on the build grid (world pixels), or null if the base has none.
  function bay(m, kind) {
    const k = kindOf(kind), t = k && m.layout.find(q => q.type === k);
    return t ? { x: (t.x + W.BASE_RECT.x + 0.5) * T, y: (t.y + W.BASE_RECT.y + 0.5) * T } : null;
  }
  // Gets into a vehicle, at its bay or where it was parked. One driver each, and one vehicle at a time.
  function board(m, crewId, pos, kind) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const k = kindOf(kind);
    if (!k) return { error: 'badKind' };
    const x = m.expedition, none = { error: k === 'cabin' ? 'noCabin' : 'noRover' };
    if (E.activeCount(m, k) <= 0) return none;
    if (x[k] && x[k].driver) return x[k].driver === crewId ? { ok: true } : { error: 'taken' };
    if (vehicleOf(m, crewId)) return { error: 'inVehicle' };
    if (left(m, k) <= 0) return { error: 'flat' };
    const at = x[k] || bay(m, k);
    if (!at) return none;
    if (!nearPx(pos, at.x, at.y, X.reach + 0.5)) return { error: 'tooFar' };
    x[k] = { driver: crewId };
    return { ok: true };
  }
  // Gets out: the vehicle stays where you are, or goes back to its bay if you are at the outpost (its `home` tiles of the HQ)
  // or next to its own bay, which a bigger rank's land can put further out than that. The driver's game says how far it went
  // (`driven`), so the last seconds of driving count too.
  function park(m, crewId, pos, driven, kind) {
    if (!m || m.status !== 'active' || !m.expedition) return { error: 'badPhase' };
    const k = kindOf(kind);
    if (!k) return { error: 'badKind' };
    const x = m.expedition;
    if (!drivesThe(x, crewId, k)) return { error: 'notDriving' };
    if (!okPos(pos)) return { error: 'badPos' };
    setRoverDriven(m, crewId, driven);
    const b = bay(m, k);
    const home = nearPx(pos, 0.5 * T, 0.5 * T, k === 'cabin' ? X.cabin.home : X.roverHome) || (!!b && nearPx(pos, b.x, b.y, X.reach + 0.5));
    x[k] = home ? null : { x: Math.round(pos.x), y: Math.round(pos.y) };
    if (k === 'cabin') x.riders = {}; // its passenger gets out where it parks
    return { ok: true, home };
  }
  // Co-op's passenger (M6): rides along in the pressurised rover a teammate drives, within reach of where the driver's game
  // last said it was (positions: the server's, as speedFactor's), in its free seat (EXPEDITION.cabin.riders). Inside you
  // breathe its air (setSuit); you get out with alight, any time, or where the driver parks.
  function ride(m, crewId, pos, positions) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!m.coop) return { error: 'solo' };
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition, driver = x.cabin && x.cabin.driver, at = driver && spotIn(positions, driver);
    if (vehicleOf(m, crewId)) return { error: 'inVehicle' };
    if (!driver) return { error: 'notDriven' };
    if (Object.keys(x.riders).length >= X.cabin.riders) return { error: 'full' };
    if (!at || !nearPx(pos, at.x, at.y, X.reach + 0.5)) return { error: 'tooFar' };
    x.riders[crewId] = 'cabin';
    return { ok: true };
  }
  function alight(m, crewId) {
    const x = m && m.expedition;
    if (!x || !x.riders || !x.riders[crewId]) return { error: 'notRiding' };
    delete x.riders[crewId];
    return { ok: true };
  }

  // A vehicle's battery: it drives rangeOf(kind) tiles a round and recharges overnight (spec ruling, M4a). → tiles left.
  function left(m, kind) {
    const k = kindOf(kind);
    return k ? Math.max(0, rangeOf(k) - (Number(m.expedition[k + 'Driven']) || 0)) : 0;
  }
  function roverLeft(m) { return left(m, 'rover'); }
  // How far the vehicle a crew member drives has gone this round, as the driver's game reports it. It only ever goes up.
  function setRoverDriven(m, crewId, tiles) {
    const x = m && m.expedition, k = x && drives(x, crewId);
    if (!k || typeof tiles !== 'number' || !Number.isFinite(tiles)) return;
    const f = k + 'Driven';
    x[f] = Math.max(Number(x[f]) || 0, Math.min(rangeOf(k), tiles));
  }

  // The suit level a crew member's own game reports (it is drained there, frame by frame). Kept between 0 and full;
  // ignored while they are collapsed (their suit is empty until a crewmate revives them), and anything but a number is junk.
  function setSuit(m, crewId, seconds) {
    const x = m && m.expedition;
    if (!x || !crewOf(m, crewId) || x.collapsed[crewId] || typeof seconds !== 'number' || !Number.isFinite(seconds)) return;
    // A passenger breathes the pressurised rover's air and cannot work (EXPEDITION.cabin.drain 0): a level reported from the
    // seat never goes down. Its driver's reports go through, as a rover driver's do: they step out to work on a find (R22).
    const low = x.riders && x.riders[crewId] && !(X.cabin.drain > 0) ? suitOf(m, crewId) : 0;
    x.suits[crewId] = Math.max(low, Math.min(suitMax(m), seconds));
  }

  // Solo play: where your astronaut stands, saved every 2 s with the suit, so a reload puts you back there instead of giving
  // you a free walk home. Forgotten at the end of the round, when everyone is back at the base.
  function setWhere(m, crewId, pos) {
    const x = m && m.expedition;
    if (!x || !crewOf(m, crewId) || !okPos(pos)) return;
    x.where[crewId] = { x: Math.round(pos.x), y: Math.round(pos.y) };
  }
  function whereOf(m, crewId) {
    const x = m && m.expedition, w = x && x.where && Object.prototype.hasOwnProperty.call(x.where, crewId) ? x.where[crewId] : null;
    return okPos(w) ? { x: w.x, y: w.y } : null;
  }

  // ---------- points of interest (spec §3.6, §3.7, M4c) ----------
  // The first crew member to see a landmark's centre discovers it: every screen shows its card (in co-op the server sends
  // a `discover` event) and they bank a one-time reward, 80–150 science by the landmark (the Scientist half again). Seeing
  // is the game's call, from its fog; the rules check the centre was within SIGHT tiles, the widest view anyone has (the
  // rover's, on a star dune's crest) plus the slack. Weather and walking only shrink a view, so no real sighting is refused.
  const SIGHT = D.DANGERS.view.rover + D.DANGERS.view.crest + X.reach;
  function discover(m, crewId, landmarkId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const l = poiAt(m, landmarkId, pos, LANDMARK), x = m.expedition;
    if (l.error) return l;
    if (x.landmarks[l.id]) return { error: 'known' };
    if (!nearPx(pos, (l.x + 0.5) * T, (l.y + 0.5) * T, SIGHT)) return { error: 'tooFar' };
    const [lo, hi] = D.LANDMARKS.science, base = lo + W.hash(W.seedOf(m.seed), l.i, l.j, 1300) % (hi - lo + 1);
    const science = Math.round(base * (a.crew.role === 'scientist' ? D.SKILLS.scientist.scienceBonus : 1));
    x.landmarks[l.id] = { by: crewId, round: m.turn };
    E.bankItem(x.banked, crewId, { kind: 'landmark', res: 'science', amount: science, region: l.region }, false);
    const st = statsOf(x, crewId);
    st.landmarks = (st.landmarks || 0) + 1;
    return { ok: true, landmark: l.id, science };
  }

  // Kestrel structures (spec §3.7): hold E at the door to open a supply cache, to salvage a wreck or a solar array, or to
  // repair a weather station or a comms mast, once each (x.structures[id]). Their loads go into your backpack and what
  // does not fit waits at the door as a drop, picked up like any other (C2). A repaired weather station reveals the fog
  // round it, banks its science and forecasts the weather a round ahead for a few rounds (C1); a repaired mast marks what
  // is near it on the minimap (mastMarks, C4). The game times the hold (holdSeconds). A hab pod has no hold: see refill.
  const DONE = { cache: 'used', wreck: 'used', array: 'used', weather: 'repaired', mast: 'repaired' };
  // What a structure holds, fixed by the mission code like a cargo pod's loads: a cache's 1–2 supplies, a wreck's 2–3
  // metal loads and spare kit, an array's materials (a load of them weighs what a metal find's does).
  function contents(m, s) {
    const K = D.STRUCTURES.kinds[s.kind], seed = W.seedOf(m.seed), item = o => Object.assign({ kind: s.kind, id: s.id, region: s.region }, o);
    const span = ([lo, hi], salt) => lo + W.hash(seed, s.i, s.j, salt) % (hi - lo + 1);
    const loads = (n, o) => Array.from({ length: n }, (_, k) => item(typeof o === 'function' ? o(k) : o));
    const metal = { res: 'materials', amount: D.FINDS.metal.kg };
    if (s.kind === 'cache') return loads(span(K.loads, 1310), k => supply(W.hash(seed, s.i, s.j, 1320 + k)));
    if (s.kind === 'wreck') return loads(span(K.metal, 1311), metal).concat(loads(K.spares, { res: 'spares', amount: 1 }));
    if (s.kind === 'array') return loads(K.materials, metal);
    return [];
  }
  // Reveals every tile whose middle is within r tiles of (cx, cy) (tile units) in x.revealed, stored as the game's fog is.
  // Returns what changed ({ "<cx>,<cy>": base64 }) for the co-op server to share.
  function revealAround(m, cx, cy, r) {
    const diff = {}, C = W.CHUNK;
    for (let ky = Math.floor((cy - r) / C); ky <= Math.floor((cy + r) / C); ky++) {
      for (let kx = Math.floor((cx - r) / C); kx <= Math.floor((cx + r) / C); kx++) {
        const bits = Fog.empty();
        for (let ly = 0; ly < C; ly++) for (let lx = 0; lx < C; lx++) {
          const dx = kx * C + lx + 0.5 - cx, dy = ky * C + ly + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r) Fog.set(bits, lx, ly);
        }
        if (Fog.count(bits)) diff[kx + ',' + ky] = Fog.encode(bits);
      }
    }
    return Fog.mergeMap(m.expedition.revealed, diff);
  }
  function interact(m, crewId, structId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const s = poiAt(m, structId, pos, STRUCTURE), x = m.expedition;
    if (s.error) return s;
    if (!DONE[s.kind]) return { error: 'badKind' };
    if (x.structures[s.id]) return { error: 'done' };
    if (!nearTile(pos, s.x, s.y)) return { error: 'tooFar' };
    const loads = contents(m, s), mine = pack(x, crewId), room = Math.max(0, capacity(m, crewId) - mine.length);
    const items = loads.slice(0, room), rest = loads.slice(room);
    x.carried[crewId] = mine.concat(items);
    if (rest.length) {
      x.drops.push({ id: s.id, x: (s.x + 0.5) * T, y: (s.y + 0.5) * T, items: rest });
      while (x.drops.length > X.maxDrops) x.drops.shift();
    }
    x.structures[s.id] = DONE[s.kind];
    let fog = {};
    if (s.kind === 'weather') {
      const K = D.STRUCTURES.kinds.weather, b = s.box;
      fog = revealAround(m, (b[0] + b[2] + 1) / 2, (b[1] + b[3] + 1) / 2, K.reveal);
      E.bankItem(x.banked, crewId, { kind: 'weather', res: 'science', amount: K.science, region: s.region }, false);
      x.forecastUntil = m.turn + K.forecast; // this round and the next 3 (C1)
    }
    const st = statsOf(x, crewId);
    st.structures = (st.structures || 0) + 1;
    return { ok: true, done: x.structures[s.id], items, left: rest.length, fog };
  }
  // An abandoned hab pod is walked into, not used, and a relay beacon (spec §3.8) is stood by: there your suit is filled
  // up, once at each for each crew member each round (x.refills[crewId] holds the pods' and beacons' ids, C3; the advance
  // clears it). Inside a pod = in its footprint, with the slack every action gets (its footprint lies 3 tiles inside its
  // cell, so the cell's guard never refuses you there); by a beacon = within its `refill` tiles, plus the slack. A beacon's
  // id is "B<i>", its place in x.beacons.
  const BID = /^B(\d{1,2})$/;
  function refill(m, crewId, id, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition, g = idNums(BID, id);
    if (g) {
      const k = x.beacons[g[0]];
      if (!k) return { error: 'noBeacon' };
      if (!nearPx(pos, (k.x + 0.5) * T, (k.y + 0.5) * T, X.beacon.refill + X.reach)) return { error: 'tooFar' };
    } else {
      const s = poiAt(m, id, pos, STRUCTURE);
      if (s.error) return s;
      if (s.kind !== 'pod') return { error: 'badKind' };
      const b = s.box, r = X.reach, tx = pos.x / T, ty = pos.y / T;
      if (tx < b[0] - r || tx >= b[2] + 1 + r || ty < b[1] - r || ty >= b[3] + 1 + r) return { error: 'tooFar' };
    }
    const had = Array.isArray(x.refills[crewId]) ? x.refills[crewId] : [];
    if (had.includes(id)) return { error: 'refilled' };
    x.refills[crewId] = had.concat([id]);
    if (!g) { const st = statsOf(x, crewId); st.pods = (st.pods || 0) + 1; } // a hab pod visited: the Science notes list its log (M4d)
    x.suits[crewId] = suitMax(m);
    return { ok: true, suit: suitMax(m) };
  }
  // The weather station's forecast: next round's weather while it runs (x.forecastUntil, a round), else null.
  function forecastAhead(m) {
    const x = m && m.expedition, next = m && m.schedule && m.schedule[m.turn + 1];
    return x && next && m.turn <= x.forecastUntil ? next.weather : null;
  }
  // The comms masts' marks, read from the world, never stored (C4): for each repaired mast, the nearest landmark and every
  // other structure whose door is within `marks` tiles of its own, once each: [{ id, x, y, kind }] in world tiles.
  function nearestLandmark(seed, px, py) {
    const C = D.LANDMARKS.cell, ci = Math.floor(px / C), cj = Math.floor(py / C);
    const edge = Math.min(px - ci * C, (ci + 1) * C - px, py - cj * C, (cj + 1) * C - py);
    let best = null, bd = Infinity;
    // Ring r of cells round the mast's is at least (r − 1) cells plus `edge` away: stop once the best is nearer than that.
    for (let r = 0; r < 8 && !(best && Math.sqrt(bd) <= (r - 1) * C + edge); r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const l = W.landmarkAt(seed, i, j), d = l && (l.x - px) * (l.x - px) + (l.y - py) * (l.y - py);
        if (l && d < bd) { best = l; bd = d; }
      }
    }
    return best;
  }
  function mastMarks(m) {
    const x = m.expedition, seed = W.seedOf(m.seed), r = D.STRUCTURES.kinds.mast.marks, out = [], seen = new Set();
    const mark = k => { if (!seen.has(k.id)) { seen.add(k.id); out.push({ id: k.id, x: k.x, y: k.y, kind: k.kind }); } };
    for (const id of Object.keys(x.structures)) {
      const g = x.structures[id] === 'repaired' && idNums(SID, id), s = g && W.structureAt(seed, g[0], g[1]);
      if (!s || s.kind !== 'mast') continue;
      const l = nearestLandmark(seed, s.x, s.y);
      if (l) mark(l);
      for (const k of W.structuresNear(seed, s.x - r, s.y - r, s.x + r, s.y + r)) {
        if (k.id !== s.id && (k.x - s.x) * (k.x - s.x) + (k.y - s.y) * (k.y - s.y) <= r * r) mark(k);
      }
    }
    return out;
  }

  // ---------- relay beacons (spec §3.8, M4d) ----------
  // A finished beacon kit waits at the base (x.kits). In the base zone you take one into your backpack, where it takes a
  // slot like a load, and put it back the same way. Delivering leaves it in the backpack; the advance brings any still
  // carried back to the base (src/engine.js). Both return the kits left at the base.
  function takeKit(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!inBaseZone(m, pos, X.reach)) return { error: 'notAtBase' };
    const x = m.expedition, mine = pack(x, crewId);
    if (!(x.kits > 0)) return { error: 'noKit' };
    if (mine.length >= capacity(m, crewId)) return { error: 'full' };
    x.kits -= 1;
    x.carried[crewId] = mine.concat([E.kitItem()]);
    return { ok: true, kits: x.kits };
  }
  function returnKit(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!inBaseZone(m, pos, X.reach)) return { error: 'notAtBase' };
    const x = m.expedition, mine = pack(x, crewId), i = mine.findIndex(E.isKit);
    if (i < 0) return { error: 'noKit' };
    x.carried[crewId] = mine.slice(0, i).concat(mine.slice(i + 1));
    x.kits += 1;
    return { ok: true, kits: x.kits };
  }

  // Where a beacon may go: the tile under you, open ground `base` tiles or more from the HQ and `apart` from every other
  // beacon, with a kit in your backpack and fewer than `max` placed this mission. It changes nothing: placeBeacon asks it
  // first, and the surface asks it before the hold, to word its prompt. → { ok: true, x, y } (the tile) or { error };
  // 'nearBase' and 'nearBeacon' carry `need`, the tiles still to go, and 'nearBeacon' `beacon`, the id of the nearest.
  function beaconSpot(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition, B = X.beacon;
    if (!pack(x, crewId).some(E.isKit)) return { error: 'noKit' };
    if (x.beacons.length >= B.max) return { error: 'limit' };
    const tx = Math.floor(pos.x / T), ty = Math.floor(pos.y / T), home = tx * tx + ty * ty;
    if (home < B.base * B.base) return { error: 'nearBase', need: B.base - Math.sqrt(home) };
    let near = -1, d2 = Infinity;
    x.beacons.forEach((b, i) => { const d = (b.x - tx) * (b.x - tx) + (b.y - ty) * (b.y - ty); if (d < d2) { near = i; d2 = d; } });
    if (d2 < B.apart * B.apart) return { error: 'nearBeacon', beacon: 'B' + near, need: B.apart - Math.sqrt(d2) };
    if (!openGround(m, tx, ty)) return { error: 'blocked' };
    return { ok: true, x: tx, y: ty };
  }
  // Open ground: a tile collision lets you onto (no wall, cliff or boulder: W.BLOCKING), outside every structure's footprint
  // (a hab pod's floor and door are no walls) and not on or beside a landmark's prop, the lava tube's skylight or the
  // methane vent, which the surface draws over the tiles round it.
  const propOf = l => (l.kind === 'tube' ? l.skylight : l.kind === 'methane' ? [l.x, l.y] : null);
  function openGround(m, tx, ty) {
    const C = W.CHUNK, cx = Math.floor(tx / C), cy = Math.floor(ty / C), c = chunkAt(m, cx, cy), t = W.tileOf(c, tx - cx * C, ty - cy * C);
    if (W.BLOCKING[t] || t === W.TILE.STRUCT_FLOOR) return false;
    return !c.landmarks.some(l => { const p = propOf(l); return !!p && Math.abs(p[0] - tx) <= 1 && Math.abs(p[1] - ty) <= 1; });
  }
  // Places a relay beacon where beaconSpot allows, from the kit in your backpack: { x, y, by, round } joins x.beacons (its
  // id is "B<i>", its place in the list) and it reveals the fog within `reveal` tiles once, for good: fog is shared and
  // never grows back, and no dust storm cuts it (spec §3.4). → { ok, beacon: its id, fog: what changed, as interact's }.
  function placeBeacon(m, crewId, pos) {
    const s = beaconSpot(m, crewId, pos);
    if (s.error) return s;
    const x = m.expedition, mine = pack(x, crewId), k = mine.findIndex(E.isKit);
    x.carried[crewId] = mine.slice(0, k).concat(mine.slice(k + 1));
    x.beacons.push({ x: s.x, y: s.y, by: crewId, round: m.turn });
    return { ok: true, beacon: 'B' + (x.beacons.length - 1), fog: revealAround(m, s.x + 0.5, s.y + 0.5, X.beacon.reveal) };
  }
  // The dashed route home: each beacon links to the nearest of the HQ and the beacons placed before it that are nearer the
  // HQ than itself (a tie goes to the HQ, then to the oldest), so every link leads closer to home (R35), a new beacon never
  // moves the others' links, and every chain ends at the base. Worked out from x.beacons each time, never stored.
  // → [{ from, to, x0, y0, x1, y1 }], one a beacon in the order they were placed: from its id to 'base' or a beacon's id,
  // from its tile to that one's, in world tiles (the HQ is tile 0, 0).
  function routeHome(m) {
    const bs = m.expedition.beacons;
    return bs.map((b, i) => {
      const home = b.x * b.x + b.y * b.y;
      let to = 'base', x1 = 0, y1 = 0, best = home;
      for (let j = 0; j < i; j++) {
        const o = bs[j], d = (o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y);
        if (d < best && o.x * o.x + o.y * o.y < home) { best = d; to = 'B' + j; x1 = o.x; y1 = o.y; }
      }
      return { from: 'B' + i, to, x0: b.x, y0: b.y, x1, y1 };
    });
  }

  // ---------- the scout drone (spec §4.2, M6) ----------
  // Built in the Garage, it flies from the base zone or from a rover or pressurised rover you drive, straight over cliffs and
  // walls to a tile within D.DRONE.range tiles of you, clears the fog within D.DRONE.reveal tiles of it for good, as a beacon
  // does, and comes back carrying nothing. One drone: D.DRONE.flights a round for the whole crew (x.droneFlights), recharged
  // at the advance. A global dust storm grounds it (Z.stormOf(m) === 'global'; read here from the round's weather, since
  // src/dangers.js is built on this file). canFly changes nothing: fly asks it first, and the surface asks it to word the
  // Drone button. → { ok: true, left } (the flights left) or { error }.
  function canFly(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    const x = m.expedition, flown = Number(x.droneFlights) || 0;
    if (D.M6.drone !== true || E.activeCount(m, 'drone') <= 0) return { error: 'noDrone' };
    if (((m.schedule && m.schedule[m.turn]) || {}).weather === 'global') return { error: 'grounded' };
    if (flown >= D.DRONE.flights) return { error: 'flights' };
    if (!okPos(pos)) return { error: 'badPos' };
    if (!inBaseZone(m, pos, X.reach) && !drives(x, crewId)) return { error: 'notHere' }; // from a vehicle you drive, not one you ride in
    return { ok: true, left: D.DRONE.flights - flown };
  }
  // Flies the drone to tile (tx, ty) (world tiles: whole numbers, from the network unchecked). → { ok, fog: what changed,
  // as placeBeacon's }.
  function fly(m, crewId, pos, tx, ty) {
    const c = canFly(m, crewId, pos);
    if (c.error) return c;
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return { error: 'badPos' };
    if (!nearPx(pos, (tx + 0.5) * T, (ty + 0.5) * T, D.DRONE.range)) return { error: 'tooFar' };
    const x = m.expedition;
    x.droneFlights = (Number(x.droneFlights) || 0) + 1;
    return { ok: true, fog: revealAround(m, tx + 0.5, ty + 0.5, D.DRONE.reveal) };
  }

  return {
    findById, findsIn, cavesIn, landmarksIn, structuresIn, landmarkById, structureById, chunkAt, loadsLeft, holdSeconds, commanderOut, speedFactor, addDistance, capacity, suitMax, packOf, rackOf, inBaseZone, suitOf, setSuit, itemFor, bay, roverLeft,
    left, vehicleOf,
    ride, alight,
    setRoverDriven, setWhere, whereOf, collect, deliver, useCanister, pickUp, collapse, revive, board, park, discover,
    interact, refill, forecastAhead, mastMarks, takeKit, returnKit, beaconSpot, placeBeacon, routeHome,
    revealAround, canFly, fly,
    cacheSize: () => cache.size,
  };
});
