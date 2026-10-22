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
 *      capacity(m, crewId) · inBaseZone(pos, slack) · suitOf(m, crewId) · setSuit(m, crewId, s) · bay(m) → the rover's bay
 *      setWhere(m, crewId, pos) · whereOf(m, crewId) (solo: where you stand, so a reload puts you back there)
 *      collect(m, crewId, siteId, pos) (a find "<cx>,<cy>:<n>", a landmark's site "L<i>,<j>:<n>", a formation's survey
 *        "F<cx>,<cy>:0") · deliver(m, crewId, pos) · useCanister(m, crewId, pos, liveSuit)
 *      pickUp(m, crewId, dropId, pos) · collapse(m, crewId, pos, driven) · revive(m, crewId, targetId, pos)
 *      board(m, crewId, pos) · park(m, crewId, pos, driven)
 *      discover(m, crewId, landmarkId, pos) → { ok, landmark, science }: the first sighting of a landmark's centre
 *      interact(m, crewId, structId, pos) → { ok, done: 'used' | 'repaired', items, left, fog }: a Kestrel structure
 *      refill(m, crewId, podId, pos) → { ok, suit }: a full suit inside a hab pod, once per pod for each crew member a round
 *      forecastAhead(m) → next round's weather while a repaired weather station forecasts it, or null
 *      mastMarks(m) → [{ id, x, y, kind }]: what the repaired comms masts mark on the minimap (world tiles)
 *      roverLeft(m) → tiles the rover can still drive this round · setRoverDriven(m, crewId, tiles) (the driver's game)
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
  function landmarkById(m, id, pos) {
    const g = idNums(LID, id);
    return g && okPos(pos) && inCell(pos, g[0], g[1], D.LANDMARKS.cell) ? W.landmarkAt(W.seedOf(m.seed), g[0], g[1]) : null;
  }
  function structureById(m, id, pos) {
    const g = idNums(SID, id);
    return g && okPos(pos) && inCell(pos, g[0], g[1], D.STRUCTURES.cell) ? W.structureAt(W.seedOf(m.seed), g[0], g[1]) : null;
  }
  function loadsLeft(m, f, id) {
    const v = m.expedition.sites[id == null ? f.id : id];
    return Number.isFinite(v) ? v : D.FINDS[f.kind].loads[f.ring];
  }
  // What you can collect: a find, a landmark's site ("L<i>,<j>:<n>") or a formation's survey ("F<cx>,<cy>:0"), plus its id
  // and loads left, or { error }. Each is looked up only from inside what holds it: a find's or a formation's chunk (the
  // survey is at the formation's spot, 2 tiles inside it), a landmark's cell (its sites lie in its box, 3 tiles inside).
  const LSITE = /^L(-?\d{1,7}),(-?\d{1,7}):(\d{1,2})$/, FSITE = /^F(-?\d{1,7}),(-?\d{1,7}):0$/;
  function siteAt(m, id, pos) {
    let g = idNums(ID, id), f = null;
    if (g) {
      if (!inCell(pos, g[0], g[1], W.CHUNK)) return { error: 'tooFar' };
      return findById(m, id) || { error: 'noFind' };
    }
    if ((g = idNums(LSITE, id))) {
      if (!inCell(pos, g[0], g[1], D.LANDMARKS.cell)) return { error: 'tooFar' };
      const l = W.landmarkAt(W.seedOf(m.seed), g[0], g[1]);
      f = l && l.sites[g[2]];
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
  // The base zone: the tiles within baseZone of the HQ either way (Chebyshev), so world pixels −128 up to (not including)
  // 192 on each axis, plus `slack` tiles for a position sent a moment ago.
  function inBaseZone(pos, slack) {
    if (!okPos(pos)) return false;
    const s = slack || 0, lo = -X.baseZone - s, hi = X.baseZone + 1 + s, tx = pos.x / T, ty = pos.y / T;
    return tx >= lo && tx < hi && ty >= lo && ty < hi;
  }
  const crewOf = (m, id) => m.crew.find(c => c.id === id) || null;
  const pack = (x, id) => (Array.isArray(x.carried[id]) ? x.carried[id] : []);
  const driving = (x, id) => !!id && !!x.rover && x.rover.driver === id;
  function capacity(m, crewId) { return driving(m.expedition, crewId) ? X.packRover : X.pack; }
  function suitOf(m, crewId) {
    const v = m.expedition.suits[crewId];
    return Number.isFinite(v) ? v : X.suit;
  }
  // Seconds of holding E for a find (or 'pickup', 'revive'), with the role's skill (spec §3.3), or for a structure (its
  // own seconds in D.STRUCTURES, the Engineer's where it has them; the hab pod has none, and 'pod' is a cargo pod's).
  function holdSeconds(kind, role) {
    const S = D.STRUCTURES.kinds[kind];
    if (S && S.hold) return role === 'engineer' && S.engineer ? S.engineer : S.hold;
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

  // Everything in your backpack goes into the round's bank; it counts when the round advances.
  function deliver(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!inBaseZone(pos, X.reach)) return { error: 'notAtBase' };
    const x = m.expedition, mine = pack(x, crewId);
    if (!mine.length) return { error: 'empty' };
    for (const it of mine) E.bankItem(x.banked, crewId, it, false);
    x.carried[crewId] = [];
    return { ok: true, items: mine };
  }

  // Breathes an O₂ canister from your backpack now: +45 s of suit. Only outside the base zone, and only when your suit has
  // room for all of it, so a canister is never wasted (carried home it is worth 30 kg of the base's O₂). `live` is the suit
  // level your own game has now: the one it last reported can be up to 2 s old.
  function useCanister(m, crewId, pos, live) {
    const a = able(m, crewId);
    if (a.error) return a;
    const x = m.expedition, mine = pack(x, crewId), i = mine.findIndex(it => it && it.canister);
    if (i < 0) return { error: 'noCanister' };
    if (!okPos(pos)) return { error: 'badPos' };
    if (inBaseZone(pos, 0)) return { error: 'atBase' };
    setSuit(m, crewId, live);
    if (suitOf(m, crewId) > X.suit - X.canister.suit) return { error: 'suitFull' };
    x.carried[crewId] = mine.slice(0, i).concat(mine.slice(i + 1));
    x.suits[crewId] = Math.min(X.suit, suitOf(m, crewId) + X.canister.suit);
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
  // stays where you fell and you are back at the base until the next round. A driver's game also says how far the rover
  // went (`driven`), so the last seconds of driving count too.
  function collapse(m, crewId, pos, driven) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    if (inBaseZone(pos, 0)) return { error: 'atBase' };
    const x = m.expedition, spot = { x: Math.round(pos.x), y: Math.round(pos.y) };
    x.suits[crewId] = 0;
    if (driving(x, crewId)) {
      setRoverDriven(m, crewId, driven);
      x.rover = { x: spot.x, y: spot.y };
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

  // The rover's bay: the centre of its tile on the build grid (world pixels), or null if the base has no rover.
  function bay(m) {
    const t = m.layout.find(k => k.type === 'rover');
    return t ? { x: (t.x + W.BASE_RECT.x + 0.5) * T, y: (t.y + W.BASE_RECT.y + 0.5) * T } : null;
  }
  // Gets into the rover, at its bay or where it was parked. One driver at a time.
  function board(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const x = m.expedition;
    if (E.activeCount(m, 'rover') <= 0) return { error: 'noRover' };
    if (x.rover && x.rover.driver) return x.rover.driver === crewId ? { ok: true } : { error: 'taken' };
    if (roverLeft(m) <= 0) return { error: 'flat' };
    const at = x.rover || bay(m);
    if (!at) return { error: 'noRover' };
    if (!nearPx(pos, at.x, at.y, X.reach + 0.5)) return { error: 'tooFar' };
    x.rover = { driver: crewId };
    return { ok: true };
  }
  // Gets out: the rover stays where you are, or goes back to its bay if you are at the outpost. The driver's game says how
  // far it went (`driven`), so the last seconds of driving count too.
  function park(m, crewId, pos, driven) {
    if (!m || m.status !== 'active' || !m.expedition) return { error: 'badPhase' };
    const x = m.expedition;
    if (!driving(x, crewId)) return { error: 'notDriving' };
    if (!okPos(pos)) return { error: 'badPos' };
    setRoverDriven(m, crewId, driven);
    const home = nearPx(pos, 0.5 * T, 0.5 * T, X.roverHome);
    x.rover = home ? null : { x: Math.round(pos.x), y: Math.round(pos.y) };
    return { ok: true, home };
  }

  // The rover's battery: it drives roverRange tiles a round and recharges overnight (spec ruling, M4a).
  function roverLeft(m) { return Math.max(0, X.roverRange - (Number(m.expedition.roverDriven) || 0)); }
  // How far the rover has been driven this round, as the driver's game reports it. It only ever goes up.
  function setRoverDriven(m, crewId, tiles) {
    const x = m && m.expedition;
    if (!x || !driving(x, crewId) || typeof tiles !== 'number' || !Number.isFinite(tiles)) return;
    x.roverDriven = Math.max(Number(x.roverDriven) || 0, Math.min(X.roverRange, tiles));
  }

  // The suit level a crew member's own game reports (it is drained there, frame by frame). Kept between 0 and full;
  // ignored while they are collapsed (their suit is empty until a crewmate revives them), and anything but a number is junk.
  function setSuit(m, crewId, seconds) {
    const x = m && m.expedition;
    if (!x || !crewOf(m, crewId) || x.collapsed[crewId] || typeof seconds !== 'number' || !Number.isFinite(seconds)) return;
    x.suits[crewId] = Math.max(0, Math.min(X.suit, seconds));
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
    const g = idNums(LID, landmarkId);
    if (!g) return { error: 'noLandmark' };
    if (!inCell(pos, g[0], g[1], D.LANDMARKS.cell)) return { error: 'tooFar' };
    const l = W.landmarkAt(W.seedOf(m.seed), g[0], g[1]), x = m.expedition;
    if (!l) return { error: 'noLandmark' };
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
    const g = idNums(SID, structId);
    if (!g) return { error: 'noStructure' };
    if (!inCell(pos, g[0], g[1], D.STRUCTURES.cell)) return { error: 'tooFar' };
    const s = W.structureAt(W.seedOf(m.seed), g[0], g[1]), x = m.expedition;
    if (!s) return { error: 'noStructure' };
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
  // An abandoned hab pod is walked into, not used: inside it your suit is filled up, once per pod for each crew member each
  // round (x.refills[crewId] holds the pods, C3; the advance clears it). Inside = in its footprint, with the slack every
  // action gets (its footprint lies 3 tiles inside its cell, so the cell's guard never refuses you there).
  function refill(m, crewId, podId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const g = idNums(SID, podId);
    if (!g) return { error: 'noStructure' };
    if (!inCell(pos, g[0], g[1], D.STRUCTURES.cell)) return { error: 'tooFar' };
    const s = W.structureAt(W.seedOf(m.seed), g[0], g[1]), x = m.expedition;
    if (!s) return { error: 'noStructure' };
    if (s.kind !== 'pod') return { error: 'badKind' };
    const b = s.box, r = X.reach, tx = pos.x / T, ty = pos.y / T;
    if (tx < b[0] - r || tx >= b[2] + 1 + r || ty < b[1] - r || ty >= b[3] + 1 + r) return { error: 'tooFar' };
    const had = Array.isArray(x.refills[crewId]) ? x.refills[crewId] : [];
    if (had.includes(s.id)) return { error: 'refilled' };
    x.refills[crewId] = had.concat([s.id]);
    x.suits[crewId] = X.suit;
    return { ok: true, suit: X.suit };
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

  return {
    findById, findsIn, cavesIn, landmarksIn, structuresIn, landmarkById, structureById, chunkAt, loadsLeft, holdSeconds, capacity, inBaseZone, suitOf, setSuit, itemFor, bay, roverLeft,
    setRoverDriven, setWhere, whereOf, collect, deliver, useCanister, pickUp, collapse, revive, board, park, discover,
    interact, refill, forecastAhead, mastMarks,
    cacheSize: () => cache.size,
  };
});
