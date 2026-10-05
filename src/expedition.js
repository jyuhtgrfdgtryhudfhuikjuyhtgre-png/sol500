/*
 * SOL 500 — exploring (spec §3, §4): the rules for finds, the backpack, the suit, collapses and the rover.
 * Pure (no DOM): the server runs it for co-op and ui.js runs it for solo play, so both play by the same rules.
 *
 * Every action first checks the mission, the crew member and the world (built here from the mission code), and
 * returns { error } without changing anything; otherwise it changes mission.expedition in place and returns
 * { ok: true, ... }. Positions are world pixels { x, y } (64 px a tile, the HQ tile's corner at 0, 0): the numbers
 * the surface draws with and the network sends. The mission state is described at newExpedition in src/engine.js.
 *
 * API: findById(m, id) → the find plus { id, cx, cy, left } or null · findsIn(m, cx, cy) · loadsLeft(m, find)
 *      holdSeconds(kind, role) · capacity(m, crewId) · inBaseZone(pos, slack) · suitOf(m, crewId) · setSuit(m, crewId, s)
 *      collect(m, crewId, findId, pos) · deliver(m, crewId, pos) · useCanister(m, crewId) · pickUp(m, crewId, dropId, pos)
 *      collapse(m, crewId, pos) · revive(m, crewId, targetId, pos) · board(m, crewId, pos) · park(m, crewId, pos)
 *      roverLeft(m) → tiles the rover can still drive this round · setRoverDriven(m, crewId, tiles) (the driver's game)
 *      cacheSize() → data chunks in the shared world cache (at most 256)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./worldgen.js'), require('./engine.js'));
  else root.SolExpedition = factory(root.SolData, root.SolWorldgen, root.SolEngine);
})(typeof self !== 'undefined' ? self : this, function (D, W, E) {
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
  function findsIn(m, cx, cy) { return chunkAt(m, cx, cy).finds; }

  // A find's id is "<cx>,<cy>:<n>", written exactly the way the world writes it, so one find has one id.
  const ID = /^(-?\d{1,7}),(-?\d{1,7}):(\d{1,2})$/;
  function findById(m, id) {
    const g = ID.exec(String(id));
    if (!g) return null;
    const cx = Number(g[1]), cy = Number(g[2]), n = Number(g[3]);
    if (cx + ',' + cy + ':' + n !== id) return null;
    const f = findsIn(m, cx, cy)[n];
    if (!f) return null;
    return Object.assign({ id, cx, cy, left: loadsLeft(m, f, id) }, f);
  }
  function loadsLeft(m, f, id) {
    const v = m.expedition.sites[id == null ? f.id : id];
    return Number.isFinite(v) ? v : D.FINDS[f.kind].loads[f.ring];
  }

  // ---------- small helpers ----------
  const okPos = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const dist2 = (a, x, y) => (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
  const nearPx = (pos, x, y, tiles) => dist2(pos, x, y) <= (tiles * T) * (tiles * T);
  const nearTile = (pos, tx, ty) => nearPx(pos, (tx + 0.5) * T, (ty + 0.5) * T, X.reach);
  // The base zone: the tiles within baseZone of the HQ (Chebyshev), plus `slack` tiles for a position sent a moment ago.
  function inBaseZone(pos, slack) {
    return okPos(pos) && Math.max(Math.abs(pos.x / T - 0.5), Math.abs(pos.y / T - 0.5)) <= X.baseZone + 0.5 + (slack || 0);
  }
  const crewOf = (m, id) => m.crew.find(c => c.id === id) || null;
  const pack = (x, id) => (Array.isArray(x.carried[id]) ? x.carried[id] : []);
  const driving = (x, id) => !!x.rover && x.rover.driver === id;
  function capacity(m, crewId) { return driving(m.expedition, crewId) ? X.packRover : X.pack; }
  function suitOf(m, crewId) {
    const v = m.expedition.suits[crewId];
    return Number.isFinite(v) ? v : X.suit;
  }
  // Seconds of holding E for a find (or 'pickup', 'revive'), with the role's skill (spec §3.3).
  function holdSeconds(kind, role) {
    const base = kind === 'science' ? X.hold.survey : kind === 'pickup' ? X.hold.pickup : kind === 'revive' ? X.hold.revive : X.hold.load;
    const skill = D.SKILLS[role] || {};
    return base * (skill[kind] || 1);
  }

  // The crew member may act on the map: the mission is on, they are on their feet, and their suit isn't empty.
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
    const pick = W.hash(W.seedOf(m.seed), f.x, f.y, 700 + load) % 5; // spare kits are the rarest
    if (pick === 0) return Object.assign(item, { res: 'spares', amount: 1 });
    if (pick <= 3) return Object.assign(item, { res: 'food', amount: F.food });
    return Object.assign(item, { res: 'o2', amount: X.canister.o2, canister: true });
  }
  function statsOf(x, crewId) {
    if (!x.stats[crewId] || typeof x.stats[crewId] !== 'object') x.stats[crewId] = { finds: {} };
    if (!x.stats[crewId].finds) x.stats[crewId].finds = {};
    return x.stats[crewId];
  }

  // ---------- actions ----------
  // Takes one load from a find next to you into your backpack.
  function collect(m, crewId, findId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    const f = findById(m, findId);
    if (!f) return { error: 'noFind' };
    if (!nearTile(pos, f.x, f.y)) return { error: 'tooFar' };
    if (f.left <= 0) return { error: 'empty' };
    const x = m.expedition, mine = pack(x, crewId);
    if (mine.length >= capacity(m, crewId)) return { error: 'full' };
    const item = itemFor(m, f, D.FINDS[f.kind].loads[f.ring] - f.left, a.crew.role);
    x.carried[crewId] = mine.concat([item]);
    x.sites[findId] = f.left - 1;
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

  // Breathes an O₂ canister from your backpack now: +45 s of suit (never more than a full suit).
  function useCanister(m, crewId) {
    const a = able(m, crewId);
    if (a.error) return a;
    const x = m.expedition, mine = pack(x, crewId), i = mine.findIndex(it => it && it.canister);
    if (i < 0) return { error: 'noCanister' };
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
  // stays where you fell and you are back at the base until the next round.
  function collapse(m, crewId, pos) {
    const a = able(m, crewId);
    if (a.error) return a;
    if (!okPos(pos)) return { error: 'badPos' };
    if (inBaseZone(pos, 0)) return { error: 'atBase' };
    const x = m.expedition, spot = { x: Math.round(pos.x), y: Math.round(pos.y) };
    x.suits[crewId] = 0;
    if (driving(x, crewId)) x.rover = { x: spot.x, y: spot.y };
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
  // Gets out: the rover stays where you are, or goes back to its bay if you are at the outpost.
  function park(m, crewId, pos) {
    if (!m || !m.expedition) return { error: 'badPhase' };
    const x = m.expedition;
    if (!driving(x, crewId)) return { error: 'notDriving' };
    if (!okPos(pos)) return { error: 'badPos' };
    const home = nearPx(pos, 0.5 * T, 0.5 * T, X.roverHome);
    x.rover = home ? null : { x: Math.round(pos.x), y: Math.round(pos.y) };
    return { ok: true, home };
  }

  // The rover's battery: it drives roverRange tiles a round and recharges overnight (spec ruling, M4a).
  function roverLeft(m) { return Math.max(0, X.roverRange - (Number(m.expedition.roverDriven) || 0)); }
  // How far the rover has been driven this round, as the driver's game reports it. It only ever goes up.
  function setRoverDriven(m, crewId, tiles) {
    const x = m && m.expedition;
    if (!x || !driving(x, crewId) || !Number.isFinite(Number(tiles))) return;
    x.roverDriven = Math.max(Number(x.roverDriven) || 0, Math.min(X.roverRange, Number(tiles)));
  }

  // The suit level a crew member's own game reports (it is drained there, frame by frame). Kept between 0 and full;
  // ignored while they are collapsed (their suit is empty until a crewmate revives them).
  function setSuit(m, crewId, seconds) {
    const x = m && m.expedition;
    if (!x || !crewOf(m, crewId) || x.collapsed[crewId] || !Number.isFinite(Number(seconds))) return;
    x.suits[crewId] = Math.max(0, Math.min(X.suit, Number(seconds)));
  }

  return {
    findById, findsIn, loadsLeft, holdSeconds, capacity, inBaseZone, suitOf, setSuit, itemFor, bay, roverLeft, setRoverDriven,
    collect, deliver, useCanister, pickUp, collapse, revive, board, park,
    cacheSize: () => cache.size,
  };
});
