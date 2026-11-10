/*
 * SOL 500 — pure simulation engine (no DOM). Works as a browser global (SolEngine) and a Node module.
 *
 * Mission state (plain JSON):
 *   { seed, eventsOn, coop, turn, sol, status: 'active'|'success'|'lost', endCause,
 *     loadout, terrain: { ice: [[x,y]], rock: [[x,y]] }, layout: [{ type, x, y }], projects: [...],
 *     modules: { type: { count, broken } }, crops: [age...],
 *     resources: { o2, water, food, spares, materials }, wallWater, cleanliness, morale,
 *     crew: [{ id, role, name, health, dose, status: 'active'|'down'|'dead', downTurns, revives, grounded, harm }],
 *     science, totals, depot: { drops, incoming: [{ kind, eta }] }, schedule, events, pending, history, log
 *   v3: pilot (solo: the crew member you walk as; null in co-op), expedition (exploring state, see newExpedition)
 *   M6: rank (0..3, D.RANKS), gear: { tanks, backpack, racks, tools } (levels bought), launched (boolean),
 *       pending.rank (the rank a rank-up reached at this advance, or null) }
 *   Layout and terrain spots are grid spots: the Camp's 9 × 5 grid is 0..8 × 0..4, a bigger rank's land reaches negative
 *   spots (landOf). The terrain grows with the rank (grantRank).
 *   Exploring: what the crew delivers is banked in expedition.banked and added when the round advances (applyExpedition);
 *   the rules for collecting and carrying finds live in src/expedition.js.
 *
 * Plan (the player's decisions for one turn):
 *   { jobs: { crewId: job }, modulesOn: { type: bool }, rations: 'full'|'reduced', habMode: 'normal'|'austerity',
 *     choices: { eventType: option }, drainWall: kg, builds: [{ type, x, y }], scrap: [type], request: kind|null }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.SolEngine = factory(root.SolData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  // ---------- helpers ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
  const key = (x, y) => x + ',' + y;
  const cheb = (x, y) => Math.max(Math.abs(x - D.GRID.hq[0]), Math.abs(y - D.GRID.hq[1]));
  const manhattan = (x, y) => Math.abs(x - D.GRID.hq[0]) + Math.abs(y - D.GRID.hq[1]);

  function hashString(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }

  // Independent random streams per (seed, purpose, turn) keep the event schedule and the map
  // identical for everyone who plays the same mission code, whatever they decide.
  function rng(...parts) {
    let a = hashString(parts.join('|'));
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickWeighted(r, weights) {
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let x = r() * total;
    for (const k of keys) {
      x -= weights[k];
      if (x <= 0) return k;
    }
    return keys[keys.length - 1];
  }

  function shuffle(r, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function newMissionCode(random) {
    const r = random || Math.random;
    const words = ['ARES', 'JEZERO', 'GALE', 'THARSIS', 'HELLAS', 'ELYSIUM', 'UTOPIA', 'ACIDALIA'];
    return words[Math.floor(r() * words.length)] + '-' + String(Math.floor(r() * 9000) + 1000);
  }

  // ---------- seasons ----------
  function seasonAt(sol) {
    const ls = (D.LS_START + sol * D.LS_PER_SOL) % 360;
    return {
      ls,
      solarFactor: 1 + D.SUN_VARIATION * Math.cos(((ls - D.PERIHELION_LS) * Math.PI) / 180),
      dustSeason: ls >= 180,
      winter: ls >= 270,
    };
  }

  // ---------- loadout ----------
  function normalizeLoadout(loadout) {
    const L = {};
    for (const id of D.ITEM_ORDER) L[id] = Math.max(0, Math.floor(Number((loadout || {})[id]) || 0));
    return L;
  }

  function loadoutMass(loadout) {
    const L = normalizeLoadout(loadout);
    let mass = D.HAB.mass;
    for (const id of D.ITEM_ORDER) mass += L[id] * D.ITEMS[id].mass;
    return Math.round(mass * 1000) / 1000;
  }

  function difficultyOf(level) {
    return own(D.DIFFICULTY, level) ? level : D.DEFAULT_DIFFICULTY;
  }

  function crewSizeOf(n) {
    return D.CREW_SIZES.includes(Number(n)) ? Number(n) : D.DEFAULT_CREW;
  }

  // A mission's length is its schedule's: 20 rounds, or 8 in a Quick mission.
  const turnsOf = s => s.schedule.length;

  function budgetFor(difficulty, crewSize, quick) {
    const base = quick ? D.QUICK.budget[difficultyOf(difficulty)] : D.DIFFICULTY[difficultyOf(difficulty)].budget;
    return base + (crewSizeOf(crewSize) === 5 ? D.CREW5_BUDGET : 0);
  }

  function referenceKit(difficulty, crewSize, quick) {
    const kit = Object.assign({}, D.REFERENCE_KITS[difficultyOf(difficulty)]);
    if (quick) Object.assign(kit, D.QUICK.kitChange);
    if (crewSizeOf(crewSize) === 5) for (const k of Object.keys(D.CREW5_EXTRA)) kit[k] += D.CREW5_EXTRA[k];
    return kit;
  }

  function validateLoadout(loadout, difficulty, crewSize, quick) {
    const budget = budgetFor(difficulty, crewSize, quick);
    const L = normalizeLoadout(loadout);
    const errors = [];
    if (quick && L.rover < 1) errors.push('needs_rover');
    for (const id of D.ITEM_ORDER) if (L[id] > D.ITEMS[id].max) errors.push('too_many:' + id);
    const mass = loadoutMass(L);
    if (mass > budget + 1e-9) errors.push('over_budget');
    return { ok: errors.length === 0, errors, mass, budget };
  }

  // ---------- event schedule ----------
  function buildSchedule(seed, eventsOn, level, quick) {
    const diff = D.DIFFICULTY[difficultyOf(level)];
    if (quick) return buildQuickSchedule(seed, diff);
    const turns = [];
    for (let t = 0; t < D.TURNS; t++) {
      turns.push({ weather: 'clear', spe: false, devil: false, flavor: null, conjunction: t === D.CONJUNCTION_TURN });
    }
    if (!eventsOn) return turns;
    const r = rng(seed, 'schedule');
    if (r() < diff.globalStorm) {
      const [lo, hi] = D.GLOBAL_STORM_TURNS;
      const start = lo + Math.floor(r() * (hi - lo + 1));
      for (let k = 0; k < D.GLOBAL_STORM_LENGTH && start + k < D.TURNS; k++) turns[start + k].weather = 'global';
    }
    turns[3 + Math.floor(r() * 15)].spe = true; // at least one solar particle event
    for (let t = 1; t < D.TURNS; t++) {
      const season = seasonAt(t * D.TURN_SOLS);
      const pStorm = season.dustSeason ? D.REGIONAL_STORM_CHANCE.season : D.REGIONAL_STORM_CHANCE.calm;
      if (r() < pStorm && turns[t].weather === 'clear') turns[t].weather = 'regional';
      if (r() < D.EXTRA_SPE_CHANCE) turns[t].spe = true;
      if (r() < D.DUST_DEVIL_CHANCE && turns[t].weather === 'clear') turns[t].devil = true;
      if (r() < diff.flavor && t >= 2) turns[t].flavor = pickWeighted(r, D.FLAVOR_WEIGHTS);
    }
    return turns;
  }

  // The Quick schedule: rounds 1 and 2 calm, the flare and the oxygen rupture at set rounds, no conjunction and no global
  // storm. The other rounds (4, 6, 7, 8) draw a regional storm, an extra flare, a devil and a flavour by the Full rules.
  function buildQuickSchedule(seed, diff) {
    const turns = [];
    for (let t = 0; t < D.QUICK.turns; t++) turns.push({ weather: 'clear', spe: false, devil: false, flavor: null, conjunction: false });
    turns[D.QUICK.flareTurn].spe = true;
    turns[D.QUICK.oxygenTurn].flavor = 'o2_rupture';
    const r = rng(seed, 'schedule-quick');
    for (const t of [3, 5, 6, 7]) {
      const season = seasonAt(t * D.TURN_SOLS);
      const pStorm = season.dustSeason ? D.REGIONAL_STORM_CHANCE.season : D.REGIONAL_STORM_CHANCE.calm;
      if (r() < pStorm) turns[t].weather = 'regional';
      if (r() < D.EXTRA_SPE_CHANCE) turns[t].spe = true;
      if (r() < D.DUST_DEVIL_CHANCE && turns[t].weather === 'clear') turns[t].devil = true;
      if (r() < diff.flavor) turns[t].flavor = pickWeighted(r, D.FLAVOR_WEIGHTS);
    }
    return turns;
  }

  // ---------- map ----------
  // The base's land (M6, spec §3): a rank's w × h tiles round the HQ, in grid spots (the Camp's 9 × 5 grid is spots 0..8 ×
  // 0..4; a bigger rank's land reaches negative spots), cut to the world's flat disc (D.LAND_R2). It only ever grows, so
  // every building stays on its tile.
  const rankOf = s => (s && Number.isInteger(s.rank) && s.rank >= 0 && s.rank < D.RANKS.length ? s.rank : 0);
  function boundsOf(r) {
    const R = D.RANKS[r], [hx, hy] = D.GRID.hq, dx = Math.floor(R.w / 2), dy = Math.floor(R.h / 2);
    return { x0: hx - dx, y0: hy - dy, x1: hx + dx, y1: hy + dy };
  }
  const landOf = s => boundsOf(rankOf(s));
  function inLand(r, x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    const b = boundsOf(r), dx = x - D.GRID.hq[0], dy = y - D.GRID.hq[1];
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && dx * dx + dy * dy <= D.LAND_R2;
  }
  const onLand = (s, x, y) => inLand(rankOf(s), x, y);
  // A rank's land, row by row. The Camp's is 3.7.0's grid in 3.7.0's order, so its terrain and start layout are unchanged.
  function rankTiles(r) {
    const b = boundsOf(r), out = [];
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (inLand(r, x, y)) out.push([x, y]);
    return out;
  }
  const landTiles = s => rankTiles(rankOf(s));
  const zoneOf = s => D.RANKS[rankOf(s)].zone;

  function buildTerrain(seed) {
    const r = rng(seed, 'terrain'), camp = rankTiles(0);
    const ice = shuffle(r, camp.filter(([x, y]) => cheb(x, y) >= 3)).slice(0, D.GRID.ice);
    const iceKeys = new Set(ice.map(([x, y]) => key(x, y)));
    const rock = shuffle(r, camp.filter(([x, y]) => cheb(x, y) >= 2 && !iceKeys.has(key(x, y)))).slice(0, D.GRID.rock);
    return { ice, rock };
  }

  // Raises the base to `rank` one step at a time (the advance's rank-up, tests and the Showcase use it): each new rank's
  // ground gets its own ice and rock, drawn from the mission code (the same for everyone who plays it) on the new land
  // only, never on a tile that is built, under construction, ice or rock already; ice at least 3 tiles out, as the Camp's.
  function grantRank(s, rank) {
    const want = Math.min(D.RANKS.length - 1, Math.floor(Number(rank)) || 0);
    while (rankOf(s) < want) {
      const r = rankOf(s) + 1, R = D.RANKS[r], sets = tileSets(s);
      const free = rankTiles(r).filter(([x, y]) => {
        const k = key(x, y);
        return !inLand(r - 1, x, y) && !sets.occupied.has(k) && !sets.ice.has(k) && !sets.rock.has(k);
      });
      const rnd = rng(s.seed, 'terrain' + r);
      const ice = shuffle(rnd, free.filter(([x, y]) => cheb(x, y) >= 3)).slice(0, R.ice);
      const iceKeys = new Set(ice.map(([x, y]) => key(x, y)));
      const rock = shuffle(rnd, free.filter(([x, y]) => !iceKeys.has(key(x, y)))).slice(0, R.rock);
      s.terrain.ice.push(...ice);
      s.terrain.rock.push(...rock);
      s.rank = r;
    }
    return s;
  }

  function tileSets(s, pending) {
    const occupied = new Set();
    for (const t of s.layout) occupied.add(key(t.x, t.y));
    for (const p of s.projects) if (p.x != null) occupied.add(key(p.x, p.y));
    for (const b of pending || []) if (b.x != null) occupied.add(key(b.x, b.y));
    return {
      occupied,
      ice: new Set(s.terrain.ice.map(([x, y]) => key(x, y))),
      rock: new Set(s.terrain.rock.map(([x, y]) => key(x, y))),
    };
  }

  function tileAllows(type, x, y, sets) {
    const k = key(x, y);
    if (sets.occupied.has(k) || sets.rock.has(k)) return false;
    if (type === 'icedrill') return sets.ice.has(k);
    if (sets.ice.has(k)) return false;
    if (type === 'reactor') return cheb(x, y) >= 2;
    return true;
  }

  function touchesBase(s, x, y, pending) {
    const { occupied } = tileSets(s, pending);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => occupied.has(key(x + dx, y + dy)));
  }

  function buildSpots(s, type, pending) {
    if (!D.PLACED.includes(type)) return [];
    const sets = tileSets(s, pending);
    return landTiles(s).filter(([x, y]) => tileAllows(type, x, y, sets) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => sets.occupied.has(key(x + dx, y + dy))));
  }

  function autoPlace(s, type) {
    const sets = tileSets(s);
    const cands = landTiles(s).filter(([x, y]) => tileAllows(type, x, y, sets));
    if (!cands.length) return null;
    const adj = ([x, y]) => ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => sets.occupied.has(key(x + dx, y + dy))) ? 0 : 1);
    cands.sort((a, b) => adj(a) - adj(b) || manhattan(a[0], a[1]) - manhattan(b[0], b[1]) || a[1] - b[1] || a[0] - b[0]);
    const [x, y] = cands[0];
    s.layout.push({ type, x, y });
    return [x, y];
  }

  // ---------- mission ----------
  // The exploring state (spec §4). M3 uses `revealed` (the shared fog) and `regions`. M4a adds the finds:
  //   sites { findId: loadsLeft } (touched finds only) · carried { crewId: [item] } · drops [{ id, x, y, items }] (world px)
  //   banked { water, materials, spares, food, o2, science, morale, lines } (added at the next advance)
  //   incidents [{ crewId, kind }] · stats { crewId: { finds: { kind: loads } } }
  //   suits { crewId: seconds left } (missing = full) · collapsed { crewId: { x, y } } (co-op, waiting for a revive)
  //   benched [crewId] (solo: collapsed, back at the base for the rest of the round) · rover: null at its bay,
  //   { x, y } parked out on the map, or { driver } while someone drives it · roverDriven: tiles driven this round.
  // M4b adds the dangers: flare (null, or this round's solar flare { warn, end, over, hit } on the round's clock, see
  //   src/dangers.js) · clock (solo: the round's clock, seconds) · where { crewId: { x, y } } (solo: where you last stood).
  // M4c adds the points of interest (src/expedition.js): landmarks { landmarkId: { by, round } } (discovered) ·
  //   structures { structId: 'used' | 'repaired' } · forecastUntil: the last round a repaired weather station forecasts
  //   the next one's weather (−1: none) · stats[crewId].landmarks, .structures (counts).
  // M4d adds the expedition goals (src/goals.js): goals [{ id, kind, params, need, base, progress, done, reward }] (this
  //   round's; see src/goals.js) · goalsDone [{ id, kind, round, params }] (every goal paid out this mission).
  // M4d adds stats[crewId].distance: tiles walked, from position samples (addDistance in src/expedition.js); only there once walked.
  // M4d adds what the debrief's Expedition section keeps for the whole mission (spec §3.10): bestFind (null, or the one find
  //   worth the most science so far: { crewId, kind, res: 'science', amount, region }, folded in at each advance from the bank's
  //   best) · stats[crewId].flareHit and .flareCover (rounds with a solar flare: caught in the open / not; only there once counted)
  //   · stats[crewId].pods (hab pod refills, one a pod a round: no other record says a pod was visited; the Science notes read it).
  // An item is { kind, res, amount, id, region } (+ sub for a survey, canister: true for an O₂ canister).
  // M4d adds the relay beacons (spec §3.8): beacons [{ x, y, by, round }] (world tiles; beacon i's id is "B<i>") ·
  //   kits: the beacon kits waiting at the base. A kit someone carries is the item { kind: 'kit', res: 'kit', amount: 1 }
  //   (kitItem): it takes a backpack slot, is never banked, and is back with `kits` at the advance. refills { crewId: [id] }
  //   (since M4c): the hab pods ("S<i>,<j>") and beacons ("B<i>") that filled that suit this round; the advance clears it.
  // M4d's rebalance adds science: the science banked from the map this mission (finds, sites, landmarks, structures, goal
  //   rewards), which counts less in the score than the base's (scoreMission, D.SCORE.map); a save from before has 0.
  const isKit = it => !!it && it.kind === 'kit';
  const kitItem = () => ({ kind: 'kit', res: 'kit', amount: 1 });
  const BANK_RES = ['water', 'materials', 'spares', 'food', 'o2', 'science', 'morale'];
  function freshBank() {
    const b = { lines: [] };
    for (const k of BANK_RES) b[k] = 0;
    return b;
  }
  function newExpedition() {
    return {
      v: 2, revealed: {}, sites: {}, structures: {}, landmarks: {}, regions: [], beacons: [], kits: 0, refills: {},
      carried: {}, drops: [], banked: freshBank(), science: 0, goals: [], goalsDone: [], bestFind: null, incidents: [], stats: {},
      suits: {}, collapsed: {}, benched: [], rover: null, roverDriven: 0,
      flare: null, clock: 0, where: {}, forecastUntil: -1,
    };
  }

  const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
  // stats[crewId] is a map (finds { kind: loads }, structures and landmarks used, distance in tiles walked, flareHit and
  // flareCover in rounds, pods visited): one that is not a map is dropped, finds that are no map become {} (X.collect counts
  // into it), and a distance or count that is not a number (not finite, or below 0) goes from the one that has it, a find's
  // count from finds. Nothing is added.
  function repairStats(stats) {
    const count = v => Number.isFinite(v) && v >= 0;
    for (const id of Object.keys(stats)) {
      const s = stats[id];
      if (!isMap(s)) { delete stats[id]; continue; }
      for (const k of ['distance', 'flareHit', 'flareCover', 'pods', 'structures', 'landmarks']) if (!count(s[k])) delete s[k];
      if (s.finds !== undefined && !isMap(s.finds)) s.finds = {};
      else if (s.finds) for (const k of Object.keys(s.finds)) if (!count(s.finds[k])) delete s.finds[k];
    }
  }

  // Missing or malformed fields (an old save, a hand-edited one) are replaced with fresh ones, so the rules never
  // meet the wrong type. Returns the repaired expedition (a new one if it wasn't an object at all).
  function repairExpedition(x) {
    const fresh = newExpedition();
    if (!x || typeof x !== 'object' || Array.isArray(x)) return fresh;
    for (const k of Object.keys(fresh)) {
      const want = fresh[k], have = x[k];
      let ok;
      if (Array.isArray(want)) ok = Array.isArray(have);
      else if (want === null) ok = have === null || isMap(have);
      else if (typeof want === 'object') ok = isMap(have);
      else ok = typeof have === typeof want && Number.isFinite(have);
      if (!ok) x[k] = want;
    }
    repairStats(x.stats);
    for (const k of BANK_RES) if (!Number.isFinite(x.banked[k])) x.banked[k] = 0;
    x.banked.lines = Array.isArray(x.banked.lines) ? x.banked.lines.filter(isMap) : [];
    // A flare whose times are not numbers never ends: drop it (the next step outside starts a new one).
    if (x.flare && !(Number.isFinite(x.flare.warn) && Number.isFinite(x.flare.end))) x.flare = null;
    if (x.flare && !Array.isArray(x.flare.hit)) x.flare.hit = [];
    // An incident that is not { crewId, kind } (a hand-edited save) would stop the advance: drop it.
    x.incidents = x.incidents.filter(i => !!i && typeof i === 'object' && typeof i.crewId === 'string' && typeof i.kind === 'string');
    // Relay beacons (M4d): a beacon that isn't { x, y, by, round } on a tile is dropped (the ids after it move up one), the
    // kits at the base are a whole number, a round's refills are lists of ids, and a carried kit is a plain kit item.
    x.beacons = x.beacons.filter(b => !!b && typeof b === 'object' && Number.isInteger(b.x) && Number.isInteger(b.y) && typeof b.by === 'string' && Number.isInteger(b.round));
    x.kits = Math.max(0, Math.floor(x.kits));
    for (const id of Object.keys(x.refills)) x.refills[id] = Array.isArray(x.refills[id]) ? x.refills[id].filter(k => typeof k === 'string') : [];
    for (const items of Object.values(x.carried)) if (Array.isArray(items)) items.forEach((it, i) => { if (isKit(it)) items[i] = kitItem(); });
    // So would a goal or a goal record with the wrong shape, or of a kind this version does not know: drop it.
    const kind = k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(D.GOALS.kinds, k);
    x.goals = x.goals.filter(g => isMap(g) && typeof g.id === 'string' && kind(g.kind) && isMap(g.params) && isMap(g.reward) &&
      typeof g.done === 'boolean' && [g.need, g.base, g.progress].every(Number.isFinite));
    x.goalsDone = x.goalsDone.filter(g => isMap(g) && typeof g.id === 'string' && kind(g.kind) && Number.isFinite(g.round) && isMap(g.params));
    // The best find (M4d, the debrief) is one find worth some science, from a crew member and a region, or there is none.
    const b = x.bestFind;
    if (b && !(isMap(b) && typeof b.crewId === 'string' && typeof b.kind === 'string' && b.res === 'science' && Number.isFinite(b.amount) && b.amount > 0 && Number.isInteger(b.region))) x.bestFind = null;
    return x;
  }

  // Adds one item to a bank. Report lines are summed per crew member, find kind, resource and region; `late` marks
  // items banked from a backpack at the start of the next round (spec §3.1). The bank also keeps the best single item worth
  // science (what the score counts) as bank.best, which the advance folds into expedition.bestFind for the debrief.
  function bankItem(bank, crewId, item, late) {
    if (!item || !BANK_RES.includes(item.res) || item.res === 'morale') return;
    const amount = Math.max(0, Number(item.amount) || 0);
    bank[item.res] += amount;
    const line = bank.lines.find(l => l.crewId === crewId && l.kind === item.kind && l.res === item.res && l.region === item.region && l.late === !!late);
    if (line) { line.amount += amount; line.loads += 1; }
    else bank.lines.push({ crewId, kind: item.kind, res: item.res, region: item.region, amount, loads: 1, late: !!late });
    if (item.res === 'science' && amount > (bank.best ? bank.best.amount : 0)) bank.best = { crewId, kind: item.kind, res: 'science', amount, region: item.region };
  }

  // What the advance tells the next round (beginTurn): rank is the rank a rank-up reached this round, or null.
  const freshPending = () => ({ discovery: false, injuries: [], breakdowns: [], rank: null, launch: null });
  function freshGear() {
    const g = {};
    for (const line of Object.keys(D.GEAR)) g[line] = 0;
    return g;
  }

  function buildState(loadout, seed, eventsOn, level, size, quick) {
    const difficulty = difficultyOf(level);
    const crewSize = crewSizeOf(size);
    const L = normalizeLoadout(loadout);
    const modules = {};
    for (const type of D.MODULE_TYPES) modules[type] = { count: 0, broken: 0 };
    modules.hab.count = 1;
    for (const id of D.ITEM_ORDER) if (modules[id]) modules[id].count = L[id];
    const s = {
      version: 2,
      seed: String(seed),
      eventsOn: !!eventsOn,
      coop: false,
      difficulty,
      crewSize,
      turn: 0,
      sol: 0,
      status: 'active',
      endCause: null,
      loadout: L,
      mass: loadoutMass(L),
      terrain: buildTerrain(String(seed)),
      layout: [{ type: 'hab', x: D.GRID.hq[0], y: D.GRID.hq[1] }],
      projects: [],
      modules,
      crops: new Array(L.greenhouse).fill(0),
      resources: {
        o2: L.o2 * D.ITEMS.o2.kg,
        water: L.water * D.ITEMS.water.kg,
        food: L.food * D.ITEMS.food.kg,
        spares: L.spares,
        materials: L.materials * D.ITEMS.materials.kg,
      },
      wallWater: L.waterwall * D.ITEMS.waterwall.kg,
      cleanliness: 1,
      morale: D.MORALE.start,
      crew: D.CREW.slice(0, crewSize).map(c => ({ id: c.id, role: c.role, name: null, health: 100, dose: 0, status: 'active', downTurns: 0, revives: 0, grounded: false, harm: null })),
      science: 0,
      totals: {
        o2Used: 0, o2Local: 0, waterUsed: 0, waterLocal: 0, foodUsed: 0, foodLocal: 0,
        built: 0, scrapped: 0, shelters: 0, salvages: 0, revives: 0, downs: 0, deaths: 0, dropsUsed: 0,
      },
      depot: { drops: D.DIFFICULTY[difficulty].drops, incoming: [] },
      schedule: buildSchedule(String(seed), !!eventsOn, difficulty, quick),
      events: [],
      pending: freshPending(),
      history: [],
      log: [],
      pilot: null,              // solo: the crew member you walk as (co-op seats choose their own)
      expedition: newExpedition(),
      rank: 0,                  // M6: the base's rank, an index into D.RANKS (0 Camp … 3 Colony)
      gear: freshGear(),        // M6: the Fabricator gear levels bought, per line
      launched: false,          // M6: the samples have gone to Earth (once a mission)
    };
    const order = ['recycler', 'oxygen', 'greenhouse', 'lab', 'rover', 'solar', 'battery', 'reactor', 'icedrill'];
    for (const type of order) for (let i = 0; i < L[type]; i++) autoPlace(s, type);
    return s;
  }

  function createMission(opts) {
    const o = opts || {};
    const quick = o.quick === true;
    const v = validateLoadout(o.loadout, o.difficulty, o.crewSize, quick);
    if (!v.ok) throw new Error('Invalid loadout: ' + v.errors.join(', '));
    const s = buildState(o.loadout, o.seed || newMissionCode(), o.events !== false, o.difficulty, o.crewSize, quick);
    if (quick) {
      s.quick = true;
      for (const t of Object.keys(o.schedulePatch || {})) if (s.schedule[t]) Object.assign(s.schedule[t], o.schedulePatch[t]);
    }
    if (o.coop) s.coop = true;
    if (o.names) for (const c of s.crew) if (o.names[c.id]) c.name = String(o.names[c.id]).slice(0, 24);
    if (o.pilot != null) {
      if (!s.crew.some(c => c.id === o.pilot)) throw new Error('Invalid pilot: ' + o.pilot);
      s.pilot = o.pilot;
    }
    beginTurn(s);
    s.history.push(snapshot(s, null));
    return s;
  }

  // Missions saved before v3 get the exploring state and a pilot when they load: the astronaut that player was
  // walking as if they are still alive, otherwise the first active (then the first living) crew member.
  function upgradeMission(m, opts) {
    if (!m || typeof m !== 'object') return m;
    m.expedition = repairExpedition(m.expedition);
    // A pilot who isn't in the crew (a hand-edited save) is chosen again, the same way as for an old save.
    if (m.pilot != null && !(m.crew || []).some(c => c.id === m.pilot)) m.pilot = undefined;
    if (m.pilot === undefined) {
      const controlId = opts && opts.controlId;
      const alive = c => c.status !== 'dead';
      const pick = !m.coop && (m.crew.find(c => c.id === controlId && alive(c)) || m.crew.find(isActive) || m.crew.find(alive));
      m.pilot = pick ? pick.id : null;
    }
    upgradeRanks(m);
    return m;
  }

  // M6: a 3.7.0 save (Full or Quick) resumes as a Camp with its buildings where they were. A rank, gear levels, the launch
  // or the next round's rank-up news that are missing or of the wrong type are replaced (a Quick mission has no ranks), and
  // every module the save doesn't know (the five M6 ones) is added, none built.
  function upgradeRanks(m) {
    if (m.quick === true || !(Number.isInteger(m.rank) && m.rank >= 0 && m.rank < D.RANKS.length)) m.rank = 0;
    const gear = freshGear();
    for (const line of Object.keys(gear)) {
      const v = isMap(m.gear) ? m.gear[line] : 0;
      if (Number.isInteger(v)) gear[line] = clamp(v, 0, D.GEAR[line].levels.length);
    }
    m.gear = gear;
    if (typeof m.launched !== 'boolean') m.launched = false;
    if (!isMap(m.pending)) m.pending = freshPending();
    const lb = m.pending.launch;
    if (!(Number.isFinite(lb) && lb >= 0)) m.pending.launch = null;
    const r = m.pending.rank;
    if (!(Number.isInteger(r) && r > 0 && r < D.RANKS.length)) m.pending.rank = null;
    if (isMap(m.modules)) for (const type of D.MODULE_TYPES) if (!isMap(m.modules[type])) m.modules[type] = { count: 0, broken: 0 };
  }

  function shielding(s) {
    const wallCap = s.loadout.waterwall * D.ITEMS.waterwall.kg;
    const wall = wallCap > 0 ? D.ITEMS.waterwall.shielding * s.loadout.waterwall * (s.wallWater / wallCap) : 0;
    return clamp(D.HAB.shielding + wall + s.modules.shield.count * D.MODULES.shield.shielding, 0, D.SHIELD_CAP);
  }

  function activeCount(s, type) {
    const m = s.modules[type];
    return m ? Math.max(0, m.count - m.broken) : 0;
  }

  function isActive(c) { return c.status === 'active'; }

  function defaultPlan(s) {
    const jobs = {};
    for (const c of s.crew) {
      let job = D.DEFAULT_JOB[c.role];
      if (job === 'farming' && s.modules.greenhouse.count === 0) job = 'construction';
      if (c.grounded && D.OUTDOOR_JOBS.includes(job)) job = 'science';
      jobs[c.id] = job;
    }
    const modulesOn = {};
    for (const type of D.CONSUMERS) modulesOn[type] = true;
    const choices = {};
    for (const e of s.events || []) if (e.options) choices[e.type] = e.options[0];
    return { jobs, modulesOn, rations: 'full', habMode: 'normal', choices, drainWall: 0, builds: [], scrap: [], request: null };
  }

  // Plan for the next round: standing orders and jobs carry over, one-off actions reset.
  function nextPlan(s, prev) {
    const p = defaultPlan(s);
    if (!prev) return p;
    for (const c of s.crew) {
      const job = (prev.jobs || {})[c.id];
      if (own(D.JOBS, job) && !(c.grounded && D.OUTDOOR_JOBS.includes(job))) p.jobs[c.id] = job;
    }
    Object.assign(p.modulesOn, prev.modulesOn || {});
    if (prev.rations) p.rations = prev.rations;
    if (prev.habMode) p.habMode = prev.habMode;
    return p;
  }

  function canRequest(s) {
    return s.status === 'active' && s.depot.drops > 0 && !s.schedule[s.turn].conjunction;
  }

  // Relay beacon kits are built for the 6 beacons a mission places, at most: those placed, the kits waiting at the base
  // and those in a backpack count (spec §3.8). A kit dropped where someone collapsed doesn't: it may never come back.
  function kitsMade(s) {
    const x = s.expedition, carried = Object.values(x.carried).reduce((n, items) => n + (Array.isArray(items) ? items.filter(isKit).length : 0), 0);
    return x.beacons.length + x.kits + carried;
  }

  // A build, a module, a job or a difficulty is one of the table's own keys: a plan (a co-op player's too) may name '__proto__' or 'toString'.
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

  // ---------- M6: ranks, unlocks and costs ----------
  // Every build M6 adds (none in a Quick mission: it stays as in 3.7.0), the modules among them, and the tier (D.M6) of
  // those a tier switch hides. The rest (rank-ups, the Garage, its rover) are tier 1 and always on.
  const M6_BUILDS = ['rankup', 'garage', 'fabricator', 'launchpad', 'rover', 'cabin', 'drone', 'tanks', 'backpack', 'racks', 'tools', 'launch'];
  const M6_MODULES = ['garage', 'fabricator', 'launchpad', 'cabin', 'drone'];
  const M6_TIER = { fabricator: 'gear', tanks: 'gear', backpack: 'gear', racks: 'gear', tools: 'gear', launchpad: 'colony', launch: 'colony', cabin: 'cabin', drone: 'drone' };
  const tierOn = type => !own(M6_TIER, type) || D.M6[M6_TIER[type]] === true;
  const gearOf = (s, line) => {
    const v = s.gear && s.gear[line];
    return Number.isInteger(v) && v > 0 ? v : 0;
  };

  // How many of a module the base may have: MODULES' max plus every reached rank's. A Quick mission keeps 3.7.0's limits
  // and has none of M6's modules; a module whose tier is off has none.
  function maxOf(s, type) {
    if (!own(D.MODULES, type) || !tierOn(type)) return 0;
    if (s.quick === true) return M6_MODULES.includes(type) ? 0 : D.MODULES[type].max;
    let max = D.MODULES[type].max;
    for (let r = 1; r <= rankOf(s); r++) max += ((D.RANKS[r].max || {})[type]) || 0;
    return max;
  }

  // The first rank at which a build can be made: a module's when its limit is first over 0, at least its `needs`
  // building's. -1: never (its tier is off, or it is no build or module at all).
  function unlockRank(type) {
    if ((!own(D.BUILDS, type) && !own(D.MODULES, type)) || !tierOn(type)) return -1;
    let first = 0;
    if (own(D.MODULES, type)) {
      first = -1;
      for (let r = 0; r < D.RANKS.length && first < 0; r++) if (maxOf({ rank: r }, type) > 0) first = r;
      if (first < 0) return -1;
    }
    const needs = own(D.BUILDS, type) ? D.BUILDS[type].needs : null;
    if (needs) {
      const n = unlockRank(needs);
      if (n < 0) return -1;
      first = Math.max(first, n);
    }
    return first;
  }

  // What a build costs: a rank-up the next rank's, a gear line its next level's (after the levels bought, those under
  // construction and those in `pending`, the plan's queue), the launch COLONY.launch, anything else BUILDS'.
  function costOf(s, type, pending) {
    const none = { materials: 0, water: 0, work: 0 };
    if (!own(D.BUILDS, type)) return none;
    if (type === 'rankup') {
      const next = D.RANKS[rankOf(s) + 1];
      return next ? { materials: next.materials, water: 0, work: next.work } : none;
    }
    if (own(D.GEAR, type)) {
      const queued = s.projects.filter(p => p.type === type).length + (pending || []).filter(b => b && b.type === type).length;
      const lv = D.GEAR[type].levels[gearOf(s, type) + queued];
      return lv ? { materials: lv.materials, water: lv.water || 0, work: lv.work } : none;
    }
    if (type === 'launch') return { materials: D.COLONY.launch.materials, water: 0, work: D.COLONY.launch.work };
    return { materials: D.BUILDS[type].materials, water: 0, work: D.BUILDS[type].work };
  }

  // Room for more: kits under the beacon limit, one rank-up below Colony, one launch a mission, a gear line's levels left,
  // a module's limit.
  function roomOf(s, type) {
    if (type === 'kit') return D.EXPEDITION.beacon.max - kitsMade(s);
    if (type === 'rankup') return rankOf(s) < D.RANKS.length - 1 ? 1 : 0;
    if (type === 'launch') return s.launched === true ? 0 : 1;
    if (own(D.GEAR, type)) return D.GEAR[type].levels.length - gearOf(s, type);
    return maxOf(s, type) - (s.modules[type] ? s.modules[type].count : 0);
  }

  // Reasons, in order: 'unknown' (no such build), 'quick' (an M6 build in a Quick mission), 'rank' (a later rank unlocks
  // it, or its tier is off: the console hides it), 'needs' (its building isn't built and working), 'max', 'materials',
  // 'water' (a gear level's), 'space' (no free tile next to the base).
  function canBuild(s, type, pending) {
    if (!own(D.BUILDS, type)) return { ok: false, reason: 'unknown' };
    const pend = pending || [];
    if (s.quick === true && M6_BUILDS.includes(type)) return { ok: false, reason: 'quick' };
    const unlock = unlockRank(type);
    if (unlock < 0 || unlock > rankOf(s)) return { ok: false, reason: 'rank' };
    const needs = D.BUILDS[type].needs;
    if (needs && activeCount(s, needs) <= 0) return { ok: false, reason: 'needs' };
    const planned = s.projects.filter(p => p.type === type).length + pend.filter(b => b.type === type).length;
    if (planned >= roomOf(s, type)) return { ok: false, reason: 'max' };
    const spent = { materials: 0, water: 0 };
    pend.forEach((b, i) => {
      if (!own(D.BUILDS, b.type)) return;
      const c = costOf(s, b.type, pend.slice(0, i));
      spent.materials += c.materials;
      spent.water += c.water;
    });
    const cost = costOf(s, type, pend);
    if (s.resources.materials - spent.materials < cost.materials) return { ok: false, reason: 'materials' };
    if (s.resources.water - spent.water < cost.water) return { ok: false, reason: 'water' };
    if (D.PLACED.includes(type) && buildSpots(s, type, pend).length === 0) return { ok: false, reason: 'space' };
    return { ok: true };
  }

  // ---------- turn start: reveal events ----------
  function beginTurn(s) {
    const info = s.schedule[s.turn];
    const ev = [];
    if (s.turn === 0) ev.push({ type: s.quick ? 'landing_quick' : 'landing' });
    if (s.turn > 0) {
      const now = seasonAt(s.sol);
      const before = seasonAt(s.sol - D.TURN_SOLS);
      if (now.dustSeason && !before.dustSeason) ev.push({ type: 'dust_season' });
      if (now.winter && !before.winter) ev.push({ type: 'winter' });
    }
    if (s.pending.rank != null) ev.push({ type: 'rank_up', rank: s.pending.rank });
    if (s.pending.launch != null) ev.push({ type: 'sample_launch', bonus: s.pending.launch });
    for (const b of s.pending.breakdowns) ev.push({ type: 'breakdown', module: b });
    for (const id of s.pending.injuries) ev.push({ type: 'injury', crewId: id });

    // Earth supply: delays, then arrivals
    if (s.eventsOn && s.depot.incoming.some(d => d.eta <= s.turn) && rng(s.seed, 'delay', s.turn)() < D.DEPOT.delayChance) {
      for (const d of s.depot.incoming) d.eta += 1;
      ev.push({ type: 'supply_delay' });
    }
    const arrived = s.depot.incoming.filter(d => d.eta <= s.turn);
    s.depot.incoming = s.depot.incoming.filter(d => d.eta > s.turn);
    for (const d of arrived) {
      const amount = D.DEPOT.amounts[d.kind];
      s.resources[d.kind] += amount;
      s.morale = clamp(s.morale + D.MORALE.drop, 0, 100);
      ev.push({ type: 'supply_arrived', kind: d.kind, amount });
    }

    if (info.weather === 'global') {
      const first = s.turn === 0 || s.schedule[s.turn - 1].weather !== 'global';
      ev.push({ type: 'dust_global', first });
    } else if (info.weather === 'regional') {
      ev.push({ type: 'dust_regional' });
    }
    if (info.devil) {
      ev.push({ type: 'dust_devil' });
      s.cleanliness = 1;
    }
    if (info.conjunction) {
      ev.push({ type: 'conjunction' });
      s.morale = clamp(s.morale + D.MORALE.conjunction, 0, 100);
    }
    if (info.spe) ev.push({ type: 'spe', options: ['shelter', 'work'] });
    let discovery = s.pending.discovery;
    if (info.flavor) {
      let f = info.flavor;
      if (f === 'perchlorate' && s.modules.greenhouse.count === 0) f = 'earth_message';
      if (f === 'o2_rupture') ev.push({ type: 'o2_rupture', options: ['hide', 'salvage'], emergency: true });
      else if (f === 'water_leak') ev.push({ type: 'water_leak', options: ['patch', 'ignore'] });
      else if (f === 'perchlorate') ev.push({ type: 'perchlorate', options: ['wash', 'hydro'] });
      else if (f === 'discovery') discovery = true;
      else {
        ev.push({ type: 'earth_message' });
        s.morale = clamp(s.morale + D.MORALE.earthMessage, 0, 100);
      }
    }
    if (discovery) ev.push({ type: 'discovery', options: ['investigate', 'log'] });
    const led = s.crew.some(c => c.role === 'commander' && c.status === 'active');
    if (s.eventsOn && s.turn > 0 && s.morale < D.CONFLICT_MORALE && rng(s.seed, 'conflict', s.turn)() < D.CONFLICT_CHANCE * (led ? 0.5 : 1)) {
      ev.push({ type: 'conflict', options: ['meeting', 'push'] });
    }
    s.pending = freshPending();
    s.events = ev;
  }

  function resolveChoices(s, plan) {
    const out = { spe: null, perchlorate: null, discovery: null, conflict: null, o2_rupture: null, water_leak: null };
    for (const e of s.events || []) {
      if (!e.options) continue;
      const wanted = (plan.choices || {})[e.type];
      out[e.type] = e.options.includes(wanted) ? wanted : e.options[0];
    }
    if (out.water_leak === 'patch' && s.resources.spares < 1) out.water_leak = 'ignore';
    if (out.perchlorate === 'wash' && s.resources.water < D.PERCHLORATE_WASH_WATER) out.perchlorate = 'hydro';
    return out;
  }

  // ---------- power ----------
  function computePower(s, plan, weather, season) {
    const stormFactor = D.STORM_FACTOR[weather] || 1;
    const solarN = activeCount(s, 'solar');
    const covered = Math.min(solarN, activeCount(s, 'battery') * D.MODULES.battery.covers);
    const perArray = D.MODULES.solar.gen * season.solarFactor * stormFactor * s.cleanliness;
    const solarKw = perArray * (covered + D.NIGHT_LOSS_UNCOVERED * (solarN - covered));
    const reactorKw = activeCount(s, 'reactor') * D.MODULES.reactor.gen;
    const supply = solarKw + reactorKw;
    const habKw = (plan.habMode === 'austerity' ? D.HAB.powerAusterity : D.HAB.powerNormal) +
      (season.winter ? D.WINTER_HEATING : 0);

    const running = {}, requested = {}, shed = {};
    let demand = habKw;
    for (const type of D.CONSUMERS) {
      const on = (plan.modulesOn || {})[type] !== false;
      const n = on ? activeCount(s, type) : 0;
      running[type] = n;
      requested[type] = n;
      shed[type] = 0;
      demand += n * D.MODULES[type].kw;
    }
    let load = demand;
    for (const type of D.SHED_ORDER) {
      while (load > supply + 1e-9 && running[type] > 0) {
        running[type]--;
        shed[type]++;
        load -= D.MODULES[type].kw;
      }
    }
    return {
      supply, solarKw, reactorKw, habKw, demand, load, running, requested, shed,
      habShort: supply + 1e-9 < habKw,
      margin: supply - load,
      stormFactor, solarFactor: season.solarFactor, cleanliness: s.cleanliness,
      solarN, covered,
    };
  }

  // ---------- one turn ----------
  function simulate(state, plan0, random) {
    if (state.status !== 'active') throw new Error('The mission is over.');
    const plan = Object.assign({ jobs: {}, modulesOn: {}, choices: {}, builds: [], scrap: [] }, plan0 || {});
    const s = clone(state);
    const T = D.TURN_SOLS;
    const info = s.schedule[s.turn];
    const weather = info.weather;
    const season = seasonAt(s.sol);
    const ch = resolveChoices(s, plan);
    const start = {
      o2: s.resources.o2, water: s.resources.water, food: s.resources.food,
      spares: s.resources.spares, materials: s.resources.materials, wall: s.wallWater,
    };
    const report = {
      turn: s.turn, sol: s.sol, weather, season, choices: ch, repairs: [], repairMethods: [], warnings: [],
      production: {}, consumption: {}, delta: {}, crew: [], power: null, science: 0,
      started: [], completed: [], revived: [], downs: [], deaths: [], requested: null,
    };
    // Exploring: what the crew delivered this round, and what went wrong outside, count before anything else.
    report.expedition = applyExpedition(s);
    const living = s.crew.filter(c => c.status !== 'dead');
    const n = living.length;
    const workers = s.crew.filter(isActive);

    // Jobs (grounded crew stay indoors)
    const jobOf = {};
    for (const c of s.crew) {
      let job = plan.jobs[c.id];
      if (!own(D.JOBS, job)) job = 'medical';
      if (c.grounded && D.OUTDOOR_JOBS.includes(job)) job = 'science';
      jobOf[c.id] = job;
    }

    // Work capacity
    const shelterBuilt = s.modules.shelter.count > 0;
    let workFactor = s.morale < 20 ? 0.6 : s.morale < 40 ? 0.8 : 1;
    if (plan.habMode === 'austerity') workFactor *= D.AUSTERITY_WORK;
    if (ch.spe === 'shelter') workFactor *= shelterBuilt ? D.SPE.shelterBuiltWork : D.SPE.shelterWork;
    if (ch.o2_rupture === 'hide') workFactor *= D.O2_RUPTURE.hideWork;
    if (ch.conflict === 'meeting') workFactor *= D.MEETING_WORK;
    if (ch.conflict === 'push') workFactor *= D.PUSH_WORK;
    const leader = workers.find(c => c.role === 'commander');
    const pts = { maintenance: 0, farming: 0, construction: 0, science: 0, eva: 0, medical: 0 };
    for (const c of workers) {
      const job = jobOf[c.id];
      const spec = D.SPECIALTY[c.role].includes(job) ? D.SPECIALIST_BONUS : 1;
      const fit = c.health < 30 ? 0.5 : 1;
      const led = leader && c !== leader ? D.LEADERSHIP.work : 1;
      pts[job] += spec * fit * led * workFactor;
    }
    report.workFactor = workFactor;
    report.points = pts;
    const engineerFixing = workers.some(c => c.role === 'engineer' && jobOf[c.id] === 'maintenance');

    // Event costs paid up front
    if (ch.water_leak === 'patch') s.resources.spares -= 1;

    // Earth support request
    if (plan.request && own(D.DEPOT.amounts, plan.request) && canRequest(state)) {
      const lead = activeCount(s, 'comms') > 0 ? D.DEPOT.commsLeadTurns : D.DEPOT.leadTurns;
      s.depot.drops -= 1;
      s.depot.incoming.push({ kind: plan.request, eta: s.turn + 1 + lead });
      s.totals.dropsUsed += 1;
      report.requested = plan.request;
    }

    // Scrap modules for spare parts (someone has to be on maintenance to strip them)
    const scrapped = [];
    if (pts.maintenance > 0) {
      for (const type of plan.scrap || []) {
        const m = own(s.modules, type) ? s.modules[type] : null;
        if (!m || type === 'hab' || type === 'shield' || m.count <= 0) continue;
        m.count--;
        if (m.broken > 0) m.broken--;
        if (type === 'greenhouse') s.crops.sort((a, b) => b - a).pop();
        for (let i = s.layout.length - 1; i >= 0; i--) {
          if (s.layout[i].type === type) { s.layout.splice(i, 1); break; }
        }
        s.resources.spares++;
        s.totals.scrapped++;
        scrapped.push(type);
      }
    }
    report.scrapped = scrapped;

    // Repairs: spare kits first, then materials (workshop, or the engineer's jury-rig once per turn)
    let capacity = Math.floor(pts.maintenance * D.REPAIRS_PER_POINT + 1e-9);
    const workshop = activeCount(s, 'workshop') > 0;
    let juryRig = engineerFixing;
    for (const type of D.REPAIR_ORDER) {
      const m = s.modules[type];
      while (m && m.broken > 0 && capacity > 0) {
        let method = null;
        if (s.resources.spares > 0) method = 'spare';
        else if (s.resources.materials >= D.REPAIR_MATERIALS && (workshop || juryRig)) method = workshop ? 'workshop' : 'juryrig';
        if (!method) break;
        if (method === 'spare') s.resources.spares--;
        else s.resources.materials -= D.REPAIR_MATERIALS;
        if (method === 'juryrig') juryRig = false;
        m.broken--;
        capacity--;
        report.repairs.push(type);
        report.repairMethods.push(method);
      }
    }
    report.unrepaired = D.REPAIR_ORDER.filter(t => s.modules[t] && s.modules[t].broken > 0);

    // New construction projects (materials, and a gear level's water, paid now; work applied at the end of the turn)
    for (const b of plan.builds || []) {
      if (!canBuild(s, b.type).ok) continue;
      const placed = D.PLACED.includes(b.type); // a shield layer, a relay beacon kit, a rank-up, gear and the launch take no tile
      if (placed && !buildSpots(s, b.type).some(([x, y]) => x === b.x && y === b.y)) continue;
      const cost = costOf(s, b.type);
      s.resources.materials -= cost.materials;
      s.resources.water -= cost.water;
      s.projects.push({ type: b.type, x: placed ? b.x : null, y: placed ? b.y : null, progress: 0, work: cost.work });
      report.started.push(b.type);
    }

    // Player drains the water wall
    const drain = clamp(Number(plan.drainWall) || 0, 0, s.wallWater);
    s.wallWater -= drain;
    s.resources.water += drain;
    report.drained = drain;

    // Power
    const power = computePower(s, plan, weather, season);
    report.power = power;
    const run = power.running;
    const habFault = s.modules.hab.broken > 0;

    // Revive one downed crew member (medic on medical care, or anyone on medical care with a med bay)
    const medicCaring = workers.some(c => c.role === 'medic' && jobOf[c.id] === 'medical');
    const medbayOn = run.medbay > 0;
    const canRevive = medicCaring || (medbayOn && workers.some(c => jobOf[c.id] === 'medical'));
    const revivedIds = [];
    if (canRevive) {
      const down = s.crew.filter(c => c.status === 'down').sort((a, b) => b.downTurns - a.downTurns)[0];
      if (down) {
        down.status = 'active';
        down.health = D.REVIVE.health;
        down.revives += 1;
        down.downTurns = 0;
        s.totals.revives += 1;
        revivedIds.push(down.id);
      }
    }
    report.revived = revivedIds;

    // Greenhouses: oldest crops keep the power first
    s.crops.sort((a, b) => b - a);
    const ghRun = run.greenhouse;
    let harvesting = 0;
    for (let i = 0; i < ghRun; i++) if (s.crops[i] >= D.MODULES.greenhouse.growTurns) harvesting++;
    const tended = Math.min(harvesting, pts.farming * D.GREENHOUSES_PER_FARMER);
    // M6: a Colony makes more of its own oxygen, water and food (D.COLONY.selfSufficient), before it reaches the stores.
    const selfSufficient = s.quick !== true && D.M6.colony === true && rankOf(s) >= D.RANKS.length - 1;
    const sf = selfSufficient ? D.COLONY.selfSufficient : 1;
    let ghFood = D.MODULES.greenhouse.foodPerSol * T * (tended + D.UNTENDED_YIELD * (harvesting - tended)) * sf;
    if (ch.perchlorate === 'hydro') ghFood = 0;
    const cropsLost = s.crops.some((age, i) => i >= ghRun && age > 0);
    for (let i = 0; i < s.crops.length; i++) s.crops[i] = i < ghRun ? s.crops[i] + 1 : 0;
    const ghO2 = ghRun * D.MODULES.greenhouse.o2PerSol * T * sf;
    const ghWater = ghRun * D.MODULES.greenhouse.waterPerSol * T;
    report.greenhouse = { running: ghRun, harvesting, tended, cropsLost };

    // Oxygen
    const o2Need = D.O2_PER_CREW * n * T;
    const o2Plant = run.oxygen * D.MODULES.oxygen.o2PerSol * T * sf;
    let o2Event = 0;
    if (ch.o2_rupture === 'hide') o2Event = -D.O2_RUPTURE.hideLoss;
    if (ch.o2_rupture === 'salvage') o2Event = D.O2_RUPTURE.salvageGain - D.O2_RUPTURE.salvageLoss;
    const o2Loss = (habFault ? D.HAB_FAULT.o2 : 0);
    s.resources.o2 += o2Plant + ghO2 - o2Need - o2Loss + o2Event;
    let hypoxia = 0;
    if (s.resources.o2 < 0) {
      hypoxia = o2Need > 0 ? Math.min(1, -s.resources.o2 / o2Need) : 0;
      s.resources.o2 = 0;
    }

    // Water
    const waterGross = D.WATER_PER_CREW * n * T;
    const recovered = run.recycler > 0 ? waterGross * D.MODULES.recycler.recovery * sf : 0;
    const iceWater = run.icedrill * D.MODULES.icedrill.waterPerSol * T * sf;
    const washWater = ch.perchlorate === 'wash' ? D.PERCHLORATE_WASH_WATER : 0;
    const leakWater = ch.water_leak === 'ignore' ? D.WATER_LEAK : 0;
    s.resources.water += iceWater + recovered - waterGross - ghWater - washWater - leakWater;
    let autoDrained = 0;
    if (s.resources.water < 0 && s.wallWater > 0) {
      autoDrained = Math.min(-s.resources.water, s.wallWater);
      s.wallWater -= autoDrained;
      s.resources.water += autoDrained;
    }
    report.autoDrained = autoDrained;
    let dehydration = 0;
    if (s.resources.water < 0) {
      dehydration = waterGross > 0 ? Math.min(1, -s.resources.water / (waterGross * (1 - D.MODULES.recycler.recovery) + 1)) : 0;
      s.resources.water = 0;
    }

    // Food
    const rationF = plan.rations === 'reduced' ? D.REDUCED_RATIONS : 1;
    const foodNeed = D.FOOD_PER_CREW * n * T * rationF;
    const foodAvail = s.resources.food + ghFood;
    const foodEaten = Math.min(foodNeed, foodAvail);
    const fed = foodNeed > 0 ? foodEaten / foodNeed : 1;
    s.resources.food = foodAvail - foodEaten;

    report.production = { o2: o2Plant + ghO2, water: recovered + iceWater, food: ghFood, o2Plant, ghO2, recovered, iceWater };
    report.consumption = {
      o2: o2Need + o2Loss, water: waterGross + ghWater + washWater + leakWater, food: foodNeed,
      o2Loss, waterGross, ghWater, washWater, leakWater, o2Event,
    };
    if (selfSufficient) report.selfSufficient = true;
    report.hypoxia = hypoxia;
    report.dehydration = dehydration;

    // Crew: radiation and health
    const S = shielding(s);
    report.shielding = S;
    const medic = s.crew.find(c => c.role === 'medic');
    const medicWell = medic && isActive(medic) && medic.health > 50;
    const byDose = list => list.slice().sort((a, b) => a.dose - b.dose);
    const outdoorOk = workers.filter(c => !c.grounded && !revivedIds.includes(c.id));
    let extraDose = {};
    if (ch.discovery === 'investigate') {
      const sci = outdoorOk.find(c => c.role === 'scientist');
      const team = sci ? [sci].concat(byDose(outdoorOk.filter(c => c !== sci)).slice(0, 1)) : byDose(outdoorOk).slice(0, 2);
      for (const c of team) extraDose[c.id] = (extraDose[c.id] || 0) + D.DISCOVERY.dose;
    }
    let salvageTeam = [];
    if (ch.o2_rupture === 'salvage') {
      salvageTeam = byDose(outdoorOk).slice(0, 2);
      for (const c of salvageTeam) extraDose[c.id] = (extraDose[c.id] || 0) + D.O2_RUPTURE.salvageDose;
      s.totals.salvages += 1;
    }
    if (ch.spe === 'shelter') s.totals.shelters += 1;

    let careCount = 0;
    const habitatBonus = run.habitat * D.MODULES.habitat.health;
    for (const c of s.crew) {
      if (c.status === 'dead') {
        report.crew.push({ id: c.id, job: jobOf[c.id], status: 'dead', doseDelta: 0, healthDelta: 0, dose: c.dose, health: 0, exposure: 0 });
        continue;
      }
      const working = isActive(c) && !revivedIds.includes(c.id);
      const job = working ? jobOf[c.id] : 'medical';
      if (working && job === 'medical') careCount++;
      const outdoor = working ? D.JOBS[job].outdoor : 0;
      const exposure = outdoor + (1 - outdoor) * (1 - S);
      let dose = T * D.DOSE_RATE * exposure + (extraDose[c.id] || 0);
      if (ch.spe === 'shelter') dose += shelterBuilt ? D.SPE.shelterBuiltDose : D.SPE.shelterDose;
      if (ch.spe === 'work') dose += D.SPE.dose * exposure;
      c.dose += dose;

      let dh = 0;
      if (working) {
        const harms = [];
        if (rationF < 1) harms.push(['rations', D.HEALTH.reducedRations]);
        if (fed < 1) harms.push(['starvation', D.HEALTH.starvation * (1 - fed)]);
        if (power.habShort) harms.push(['cold', D.HEALTH.cold]);
        if (habFault) harms.push(['habFault', D.HAB_FAULT.health]);
        if (ch.spe === 'work') harms.push(['radiationSickness', D.HEALTH.speWork]);
        if (hypoxia > 0) harms.push(['hypoxia', D.HEALTH.hypoxia * hypoxia]);
        if (dehydration > 0) harms.push(['dehydration', D.HEALTH.dehydration * dehydration]);
        const comfortable = harms.length === 0;
        if (comfortable) dh += D.HEALTH.recovery;
        if (comfortable && job === 'medical') dh += D.HEALTH.rest;
        if (medicCaring) dh += D.HEALTH.care;
        if (medicWell) dh += D.HEALTH.medic;
        if (medbayOn && job === 'medical') dh += D.MODULES.medbay.heal;
        dh += habitatBonus;
        for (const [, x] of harms) dh -= x;
        if (harms.length) c.harm = harms.slice().sort((a, b) => b[1] - a[1])[0][0];
        c.health = clamp(c.health + dh, 0, 100);
      }
      report.crew.push({ id: c.id, job: working ? job : null, status: c.status, doseDelta: dose, healthDelta: dh, dose: c.dose, health: c.health, exposure });
    }

    // Down, dead and grounded
    for (const c of s.crew) {
      if (c.status === 'active' && !revivedIds.includes(c.id) && c.health <= 0) {
        if (c.revives >= D.REVIVE.maxRevives) {
          c.status = 'dead';
          report.deaths.push(c.id);
        } else {
          c.status = 'down';
          c.downTurns = 0;
          report.downs.push(c.id);
        }
      } else if (c.status === 'down' && !revivedIds.includes(c.id)) {
        c.downTurns += 1;
        if (c.downTurns >= D.REVIVE.window) {
          c.status = 'dead';
          report.deaths.push(c.id);
        }
      }
      if (c.status !== 'dead') c.grounded = c.dose > D.DOSE_LIMIT;
    }
    s.totals.downs += report.downs.length;
    s.totals.deaths += report.deaths.length;

    // Morale
    let dm = D.MORALE.baseline;
    if (leader) dm += D.LEADERSHIP.morale;
    dm += Math.min(D.MORALE.greenhouseMax, D.MORALE.perGreenhouse * harvesting);
    dm += D.MORALE.rest * careCount;
    dm += run.habitat * D.MODULES.habitat.morale;
    if (rationF < 1) dm += D.MORALE.reducedRations;
    if (plan.habMode === 'austerity') dm += D.MORALE.austerity;
    if (power.habShort) dm += D.MORALE.cold;
    if (ch.conflict === 'meeting') dm += D.MORALE.meeting;
    if (ch.conflict === 'push') dm += D.MORALE.push;
    if (ch.spe === 'shelter') dm += D.MORALE.shelter;
    if (ch.discovery === 'investigate') dm += D.MORALE.discovery;
    if (ch.o2_rupture === 'hide') dm += D.MORALE.hide;
    dm += D.MORALE.down * report.downs.length + D.MORALE.death * report.deaths.length;
    s.morale = clamp(s.morale + dm, 0, 100);
    report.moraleDelta = dm;

    // Science
    const sci = pts.science * (run.lab > 0 ? D.SCIENCE.lab : D.SCIENCE.noLab) +
      pts.eva * (run.rover > 0 ? D.SCIENCE.eva : D.SCIENCE.evaNoRover) +
      pts.farming * D.SCIENCE.farming +
      (ch.discovery === 'investigate' ? D.DISCOVERY.science : ch.discovery === 'log' ? D.DISCOVERY.logScience : 0);
    s.science += sci;
    report.science = sci + (report.expedition ? report.expedition.got.science : 0);

    // Construction: finish projects in order, leftover work becomes regolith bricks
    let cp = pts.construction;
    for (const p of s.projects) {
      if (cp <= 1e-9) break;
      const use = Math.min(p.work - p.progress, cp);
      p.progress += use;
      cp -= use;
    }
    s.projects = s.projects.filter(p => {
      if (p.progress < p.work - 1e-9) return true;
      if (p.type === 'kit') s.expedition.kits += 1; // a relay beacon kit waits at the base for someone to take it out
      else if (p.type === 'rankup') { // the new rank, its land and its limits arrive now; the next round announces it
        grantRank(s, rankOf(s) + 1);
        s.pending.rank = rankOf(s);
      } else if (own(D.GEAR, p.type)) s.gear[p.type] = gearOf(s, p.type) + 1; // a gear level is the whole crew's
      else if (p.type === 'launch') { // the samples go to Earth once a mission: a share of the map's science, capped, joins the base's
        s.launched = true;
        const map = Math.max(0, Number((s.expedition || {}).science) || 0);
        const bonus = Math.round(Math.min(D.COLONY.launch.cap, map * D.COLONY.launch.share));
        s.science += bonus;
        s.pending.launch = bonus;
        report.launch = { bonus };
      }
      else s.modules[p.type].count += 1;
      if (p.x != null) s.layout.push({ type: p.type, x: p.x, y: p.y });
      if (p.type === 'greenhouse') s.crops.push(0);
      s.totals.built += 1;
      report.completed.push(p.type);
      return false;
    });
    const regolith = Math.max(0, cp) * D.REGOLITH_PER_POINT;
    s.resources.materials += regolith;
    report.regolith = regolith;

    // Dust on the arrays
    const cleanBefore = s.cleanliness;
    s.cleanliness = clamp(s.cleanliness - (D.DUST_PER_TURN[weather] || 0) + pts.maintenance * D.CLEAN_PER_POINT, D.MIN_CLEANLINESS, 1);
    report.cleanDelta = s.cleanliness - cleanBefore;

    // Earth-independence bookkeeping
    s.totals.o2Used += o2Need;
    s.totals.o2Local += o2Plant + ghO2;
    s.totals.waterUsed += waterGross + ghWater;
    s.totals.waterLocal += recovered + iceWater;
    s.totals.foodUsed += foodEaten;
    s.totals.foodLocal += Math.min(ghFood, foodEaten);

    report.delta = {
      o2: s.resources.o2 - start.o2,
      water: s.resources.water - start.water,
      food: s.resources.food - start.food,
      spares: s.resources.spares - start.spares,
      materials: s.resources.materials - start.materials,
      wall: s.wallWater - start.wall,
      morale: dm,
    };
    report.after = {
      o2: s.resources.o2, water: s.resources.water, food: s.resources.food, spares: s.resources.spares,
      materials: s.resources.materials, wall: s.wallWater, morale: s.morale, cleanliness: s.cleanliness,
      shielding: shielding(s), science: s.science,
    };
    report.fed = fed;
    report.runway = runway(s, report);
    report.warnings = warnings(s, report);

    // Random outcomes (only when resolving a real turn with events on)
    const injuries = [], breakdowns = [];
    if (random && s.eventsOn) {
      const r = rng(s.seed, 'ops', s.turn);
      for (const c of s.crew) {
        if (!isActive(c)) continue;
        let p = D.INJURY[jobOf[c.id]] || 0;
        if (salvageTeam.includes(c) && p < D.O2_RUPTURE.salvageInjury) p = D.O2_RUPTURE.salvageInjury;
        if (p > 0 && r() < p) {
          c.health = clamp(c.health - D.INJURY_HEALTH, 0, 100);
          c.harm = 'injury';
          injuries.push(c.id);
          if (c.health <= 0) {
            if (c.revives >= D.REVIVE.maxRevives) { c.status = 'dead'; report.deaths.push(c.id); s.totals.deaths++; }
            else { c.status = 'down'; c.downTurns = 0; report.downs.push(c.id); s.totals.downs++; }
          }
        }
      }
      const protect = Math.min(D.MAINT_PROTECT_MAX, pts.maintenance * D.MAINT_PROTECT_PER_POINT);
      for (const type of D.MODULE_TYPES) {
        const working = activeCount(s, type);
        for (let i = 0; i < working; i++) {
          if (r() < D.BREAKDOWN[type] * D.DIFFICULTY[s.difficulty].breakdown * (1 - protect)) {
            s.modules[type].broken++;
            breakdowns.push(type);
          }
        }
      }
      const scientistOut = workers.some(c => c.role === 'scientist' && jobOf[c.id] === 'eva');
      s.pending.discovery = pts.eva > 0 && r() < (scientistOut ? D.DISCOVERY.scientistChance : D.DISCOVERY.chance);
    }
    s.pending.injuries = injuries;
    s.pending.breakdowns = breakdowns;
    report.injuries = injuries;
    report.breakdowns = breakdowns;
    return { state: s, report };
  }

  // The bank goes into the base's stocks; each collapse outside (recorded, or a co-op crew member still waiting for a
  // revive) costs that astronaut health and the crew morale, and a solar flare that caught them outside costs a dose.
  // Returns what the report shows.
  function applyExpedition(s) {
    const x = s.expedition;
    if (!x || !x.banked) return null;
    // The final advance has no next round to bank a backpack in (rollExpedition), so the last round's backpacks are banked
    // now, marked late, and count for the score and the debrief (spec §13.12). A co-op astronaut still collapsed outside
    // keeps theirs: rollExpedition leaves it where they fell.
    if (s.turn === turnsOf(s) - 1) {
      for (const id of Object.keys(x.carried || {})) {
        if (!Array.isArray(x.carried[id]) || (x.collapsed || {})[id]) continue;
        for (const it of x.carried[id]) if (isKit(it)) x.kits += 1; else bankItem(x.banked, id, it, true); // a kit is back at the base
        x.carried[id] = [];
      }
    }
    const goals = payGoals(s);
    const got = {};
    for (const k of BANK_RES) got[k] = Math.max(0, Number(x.banked[k]) || 0);
    for (const k of ['water', 'materials', 'spares', 'food', 'o2']) s.resources[k] += got[k];
    s.science += got.science;
    x.science += got.science;
    s.morale = clamp(s.morale + got.morale, 0, 100);
    const incidents = (x.incidents || []).map(i => ({ crewId: i.crewId, kind: i.kind }));
    for (const id of Object.keys(x.collapsed || {})) incidents.push({ crewId: id, kind: 'collapse' });
    // For the debrief (spec §3.10): the best science find of the mission so far, and, in a round with a solar flare, whom it
    // caught in the open and who was not caught (at the base or under cover), for each astronaut who could have been out.
    const top = x.banked.best;
    if (top && Number.isFinite(top.amount) && top.amount > (x.bestFind ? x.bestFind.amount : 0)) {
      x.bestFind = { crewId: top.crewId, kind: top.kind, res: 'science', amount: top.amount, region: Number.isInteger(top.region) ? top.region : 0 };
    }
    if (s.schedule && s.schedule[s.turn] && s.schedule[s.turn].spe) {
      for (const c of s.crew) {
        if (c.status !== 'active') continue;
        const st = x.stats[c.id] || (x.stats[c.id] = { finds: {} }), k = incidents.some(i => i.kind === 'flare' && i.crewId === c.id) ? 'flareHit' : 'flareCover';
        st[k] = (Number.isFinite(st[k]) ? st[k] : 0) + 1;
      }
    }
    for (const inc of incidents) {
      const c = s.crew.find(k => k.id === inc.crewId);
      if (!c || c.status !== 'active') continue;
      if (inc.kind === 'flare') { c.dose += D.DANGERS.flare.dose; continue; }
      c.health = clamp(c.health - D.EXPEDITION.collapse.health, 0, 100);
      s.morale = clamp(s.morale - D.EXPEDITION.collapse.morale, 0, 100);
    }
    return { got, lines: (x.banked.lines || []).map(l => Object.assign({}, l)), incidents, goals };
  }

  // The round's done goals pay out (spec §3.9). The advance brought their progress up to date first (src/goals.js, which
  // needs the world); this only reads the numbers it left. A reward goes into the bank with the haul, so it counts like a
  // delivery (a beacon kit joins the kits at the base); the report lists the goal and goalsDone keeps it for the debrief.
  // rollExpedition then clears the round's goals, paid or expired, so each pays once. Returns the report's list.
  function payGoals(s) {
    const x = s.expedition, paid = [], amount = v => (Number.isFinite(v) && v > 0 ? v : 0);
    for (const g of x.goals || []) {
      if (g.done !== true) continue;
      // A beacon kit only into the room left under the limit, kits being built counted (as canBuild does): one the limit
      // cuts comes as the materials to build it, and the report shows what was paid (R34).
      const reward = Object.assign({}, g.reward), kits = amount(reward.kits);
      const room = Math.max(0, D.EXPEDITION.beacon.max - kitsMade(s) - s.projects.filter(p => p.type === 'kit').length);
      if (kits > room) {
        reward.materials = amount(reward.materials) + (kits - room) * D.BUILDS.kit.materials;
        if (room > 0) reward.kits = room; else delete reward.kits;
      }
      for (const k of BANK_RES) x.banked[k] += amount(reward[k]);
      x.kits += amount(reward.kits);
      paid.push({ id: g.id, kind: g.kind, params: Object.assign({}, g.params), reward });
      x.goalsDone.push({ id: g.id, kind: g.kind, round: s.turn, params: Object.assign({}, g.params) });
    }
    return paid;
  }

  // After a round: the bank and the incidents are spent; what is still in a backpack is banked for the next round (a
  // one-round delay) and a beacon kit is back with the base's kits, except that a co-op astronaut still collapsed outside
  // leaves their load (kits too) where they fell. Everyone starts the next round at the base with a full suit, and the
  // rover comes home with whoever was driving it.
  function rollExpedition(s, endedTurn) {
    const x = s.expedition;
    if (!x) return;
    const next = freshBank();
    for (const crewId of Object.keys(x.carried || {})) {
      const items = x.carried[crewId];
      if (!Array.isArray(items) || !items.length) continue;
      const spot = (x.collapsed || {})[crewId];
      if (spot) x.drops.push({ id: endedTurn + ':' + crewId, x: spot.x, y: spot.y, items });
      else for (const it of items) if (isKit(it)) x.kits += 1; else bankItem(next, crewId, it, true); // a kit is back at the base
    }
    while (x.drops.length > D.EXPEDITION.maxDrops) x.drops.shift();
    x.banked = next;
    x.carried = {};
    x.incidents = [];
    x.goals = []; // paid or expired; the advance picks the next round's (src/goals.js)
    x.collapsed = {};
    x.benched = [];
    x.suits = {};
    x.refills = {};
    x.roverDriven = 0;
    if (x.rover && x.rover.driver) x.rover = null;
    x.flare = null; // a flare that had not hit yet is over with the round: everyone is home
    x.clock = 0;
    x.where = {};
  }

  function runway(s, report) {
    const got = (report.expedition && report.expedition.got) || {};
    const perSol = k => (report.delta[k] - (got[k] || 0)) / D.TURN_SOLS;
    const out = {};
    for (const k of ['o2', 'food']) {
      const d = perSol(k);
      out[k] = d >= 0 ? Infinity : Math.max(0, s.resources[k]) / -d;
    }
    const wNet = (report.production.water - report.consumption.water) / D.TURN_SOLS;
    out.water = wNet >= 0 ? Infinity : (Math.max(0, s.resources.water) + s.wallWater) / -wNet;
    return out;
  }

  function warnings(s, report) {
    const w = [];
    if (report.hypoxia > 0) w.push({ code: 'o2_out' });
    else if (report.runway.o2 < D.TURN_SOLS * 2) w.push({ code: 'o2_low' });
    if (report.dehydration > 0) w.push({ code: 'water_out' });
    else if (report.runway.water < D.TURN_SOLS * 2) w.push({ code: 'water_low' });
    if (report.autoDrained > 0) w.push({ code: 'wall_auto' });
    if (report.fed < 1) w.push({ code: 'food_out' });
    else if (report.runway.food < D.TURN_SOLS * 2) w.push({ code: 'food_low' });
    if (report.power.habShort) w.push({ code: 'hab_cold' });
    for (const type of D.SHED_ORDER) if (report.power.shed[type] > 0) w.push({ code: 'shed', module: type });
    if (report.greenhouse.cropsLost) w.push({ code: 'crops_lost' });
    if (report.unrepaired.length) w.push({ code: 'unrepaired', module: report.unrepaired[0] });
    for (const id of report.deaths) w.push({ code: 'death', crewId: id });
    for (const id of report.downs) w.push({ code: 'down', crewId: id });
    for (const c of s.crew) {
      if (c.status === 'down') w.push({ code: 'dying', crewId: c.id, turns: D.REVIVE.window - c.downTurns });
    }
    for (const c of report.crew) {
      if (c.status !== 'active') continue;
      if (c.dose > D.DOSE_LIMIT) w.push({ code: 'dose_over', crewId: c.id });
      else if (c.dose > D.DOSE_LIMIT * 0.85) w.push({ code: 'dose_high', crewId: c.id });
      if (c.health > 0 && c.health < 35) w.push({ code: 'health_low', crewId: c.id });
    }
    if (s.morale < 40) w.push({ code: 'morale_low' });
    return w;
  }

  function snapshot(s, report) {
    return {
      turn: s.turn,
      sol: s.sol,
      o2: Math.max(0, s.resources.o2),
      water: Math.max(0, s.resources.water),
      food: Math.max(0, s.resources.food),
      spares: s.resources.spares,
      materials: s.resources.materials,
      wall: s.wallWater,
      morale: s.morale,
      science: s.science,
      shielding: shielding(s),
      doses: s.crew.map(c => c.dose),
      health: s.crew.map(c => (c.status === 'dead' ? 0 : c.health)),
      status: s.crew.map(c => c.status),
      supply: report ? report.power.supply : null,
      load: report ? report.power.load : null,
      weather: report ? report.weather : null,
    };
  }

  function forecast(state, plan) {
    return simulate(state, plan, false).report;
  }

  function resolveTurn(state, plan) {
    const { state: s, report } = simulate(state, plan, true);
    rollExpedition(s, s.turn);
    s.turn += 1;
    s.sol += D.TURN_SOLS;

    if (!s.crew.some(isActive)) {
      const last = s.crew.find(c => report.deaths.includes(c.id) || report.downs.includes(c.id)) || s.crew[0];
      s.status = 'lost';
      s.endCause = { type: 'crew', reason: last.harm || 'health', crewId: last.id, sol: s.sol };
    } else if (s.turn >= turnsOf(s)) {
      s.status = 'success';
    }

    // Solo: if your astronaut died, you take over the first active crewmate. With nobody active the mission is over
    // (status 'lost' above), so nobody takes over and the pilot stays the astronaut you walked as.
    report.pilot = null;
    const pilot = s.pilot && s.crew.find(c => c.id === s.pilot);
    if (pilot && pilot.status === 'dead') {
      const next = s.crew.find(isActive) || null;
      report.pilot = { from: pilot.id, to: next ? next.id : null };
      if (next) s.pilot = next.id;
    }

    s.log.push({
      turn: report.turn, sol: report.sol, weather: report.weather,
      events: (state.events || []).map(e => e.type), choices: report.choices,
      repairs: report.repairs, breakdowns: report.breakdowns, injuries: report.injuries,
      started: report.started, completed: report.completed, scrapped: report.scrapped,
      revived: report.revived, downs: report.downs, deaths: report.deaths, requested: report.requested,
      shed: Object.keys(report.power.shed).filter(k => report.power.shed[k] > 0),
      habShort: report.power.habShort, autoDrained: report.autoDrained, fed: report.fed,
      hypoxia: report.hypoxia, dehydration: report.dehydration, science: report.science,
      solarShare: report.power.supply > 0 ? report.power.solarKw / report.power.supply : 0,
    });
    s.history.push(snapshot(s, report));
    if (s.status === 'active') beginTurn(s);
    else s.events = [];
    return { state: s, report };
  }

  function independenceOf(s) {
    const share = (a, b) => (b > 0 ? Math.min(1, a / b) : 0);
    const t = s.totals;
    return (share(t.o2Local, t.o2Used) + share(t.waterLocal, t.waterUsed) + share(t.foodLocal, t.foodUsed)) / 3;
  }

  function scoreMission(s) {
    const success = s.status === 'success';
    const survivors = s.crew.filter(c => c.status !== 'dead');
    const over = survivors.filter(c => c.dose > D.DOSE_LIMIT);
    const independence = independenceOf(s);
    // The map's science counts a share of itself, up to a cap (D.SCORE.map), beside the base's in full.
    const map = Math.min(s.science, Math.max(0, Number((s.expedition || {}).science) || 0));
    const counted = Math.min(D.SCORE.map.cap, map * D.SCORE.map.share);
    const science = s.science - map + counted;
    const parts = {
      // A lost crew leaves samples and instruments behind: only transmitted results count.
      science: Math.round(success ? science : science * D.SCORE.abortScience),
      health: Math.round(mean(survivors.map(c => c.health))),
      radiation: Math.round(mean(survivors.map(c => Math.max(0, D.DOSE_LIMIT - c.dose))) * D.SCORE.radiation),
      crew: Math.round(survivors.length * D.SCORE.survivor -
        over.reduce((sum, c) => sum + D.SCORE.grounded + (c.dose - D.DOSE_LIMIT) * D.SCORE.overDose, 0)),
      independence: Math.round(independence * D.SCORE.independence),
      depot: success ? s.depot.drops * D.SCORE.unusedDrop : 0,
      completion: success ? D.SCORE.completion : 0,
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    let grade = 'D';
    if (success) {
      for (const [g, min] of (s.quick ? D.QUICK.grades : D.SCORE.grades)) {
        if (total >= min) { grade = g; break; }
      }
    }
    // map: the map's science and what of it the science part counts, before a lost mission's halving (the debrief says so).
    return { total, parts, grade, independence, map: { found: map, counted } };
  }

  function achievements(s) {
    if (s.quick) return [];
    const success = s.status === 'success';
    const got = new Set();
    const maxDose = Math.max(...s.crew.filter(c => c.status !== 'dead').map(c => c.dose), 0);
    if (s.turn >= 1) got.add('first_sol');
    if (success) got.add('sol500');
    if (success && s.totals.downs === 0 && s.crew.every(c => c.status === 'active')) got.add('full_crew');
    if (s.totals.revives > 0) got.add('revived');
    if (success && s.schedule.some(t => t.weather === 'global')) got.add('storm_survivor');
    if (success && independenceOf(s) >= 0.6) got.add('closed_loop');
    if (s.totals.foodLocal >= 1000) got.add('green_thumb');
    if (success && maxDose < 150) got.add('lead_apron');
    if (s.totals.built >= 5) got.add('builder');
    if (s.modules.shield.count >= maxOf(s, 'shield')) got.add('fortress');
    if (s.totals.scrapped > 0) got.add('scrapper');
    if (success && s.totals.dropsUsed === 0) got.add('self_reliant');
    if (s.science >= 800) got.add('explorer');
    if (success && scoreMission(s).grade === 'S') got.add('grade_s');
    if (success && s.mass <= budgetFor(s.difficulty, s.crewSize) - 4) got.add('lightweight');
    if (s.totals.shelters >= 2) got.add('flare_dodger');
    if (success && s.totals.salvages > 0) got.add('oxygen_hero');
    if (success && s.coop) got.add('team_player');
    return D.ACHIEVEMENTS.filter(id => got.has(id));
  }

  // Engineering advice from Earth: the most urgent problems, in priority order.
  function advise(s, plan) {
    const f = forecast(s, plan);
    const remaining = (turnsOf(s) - s.turn) * D.TURN_SOLS;
    const out = [];
    if (f.power.habShort) out.push({ code: 'hab_cold' });
    if (f.hypoxia > 0) out.push({ code: 'o2_out' });
    else if (f.runway.o2 < remaining) out.push({ code: 'o2_runway', sols: Math.floor(f.runway.o2) });
    if (f.dehydration > 0) out.push({ code: 'water_out' });
    else if (f.runway.water < remaining) out.push({ code: 'water_runway', sols: Math.floor(f.runway.water) });
    if (f.fed < 1) out.push({ code: 'food_out' });
    else if (f.runway.food < remaining) out.push({ code: 'food_runway', sols: Math.floor(f.runway.food) });
    const down = s.crew.find(c => c.status === 'down');
    if (down && !f.revived.length) out.push({ code: 'crew_down', crewId: down.id });
    const turnsLeft = turnsOf(s) - s.turn;
    for (const c of f.crew) {
      const crew = s.crew.find(x => x.id === c.id);
      if (crew.status !== 'active' || crew.grounded) continue;
      if (crew.dose + c.doseDelta * turnsLeft > D.DOSE_LIMIT) { out.push({ code: 'dose_projection', crewId: c.id }); break; }
    }
    if (f.unrepaired.length) out.push({ code: 'broken', module: f.unrepaired[0] });
    const shed = D.SHED_ORDER.find(t => f.power.shed[t] > 0);
    if (shed) out.push({ code: 'power_shed', module: shed });
    const solarShare = f.power.supply > 0 ? f.power.solarKw / f.power.supply : 0;
    if (!s.quick && s.turn < D.GLOBAL_STORM_TURNS[1] && solarShare > 0.6) out.push({ code: 'storm_risk' });
    if (s.morale < 45) out.push({ code: 'morale' });
    if (s.resources.spares === 0 && activeCount(s, 'workshop') === 0) out.push({ code: 'spares' });
    if (!out.length) out.push({ code: 'all_good' });
    return out.slice(0, 3);
  }

  // Manifest-screen forecast: steady-state numbers for a proposed loadout.
  function summarizeLoadout(loadout, difficulty, crewSize, quick) {
    const budget = budgetFor(difficulty, crewSize, quick);
    const L = normalizeLoadout(loadout);
    const mass = loadoutMass(L);
    const s = buildState(L, 'MANIFEST', false, difficulty, crewSize);
    s.crops = s.crops.map(() => D.MODULES.greenhouse.growTurns);
    const plan = defaultPlan(s);
    plan.jobs.lena = 'maintenance';
    const f = simulate(s, plan, false).report;
    const storm = computePower(s, plan, 'global', seasonAt(0));
    const perSol = k => f.delta[k] / D.TURN_SOLS;
    const sols = {};
    for (const k of ['o2', 'food']) {
      const d = perSol(k);
      sols[k] = d >= 0 ? Infinity : s.resources[k] / -d;
    }
    const wNet = (f.production.water - f.consumption.water) / D.TURN_SOLS;
    sols.water = wNet >= 0 ? Infinity : s.resources.water / -wNet;
    sols.waterWithWall = wNet >= 0 ? Infinity : (s.resources.water + s.wallWater) / -wNet;
    const S0 = shielding(s);
    const length = quick ? D.QUICK.turns : D.TURNS;
    const doseIndoor = length * D.TURN_SOLS * D.DOSE_RATE * (1 - S0);
    const mission = length * D.TURN_SOLS;
    const warn = [];
    if (mass > budget + 1e-9) warn.push('over_budget');
    if (f.power.load < f.power.demand - 1e-9 || f.power.habShort) warn.push('power_short');
    if (storm.supply < f.power.habKw + (L.recycler ? D.MODULES.recycler.kw : 0)) warn.push('storm_risk');
    if (!L.recycler) warn.push('no_recycler');
    if (sols.o2 < mission) warn.push('o2_short');
    if (sols.waterWithWall < mission) warn.push('water_short');
    if (sols.food < mission) warn.push('food_short');
    if (doseIndoor > D.DOSE_LIMIT * 0.8) warn.push('dose_risk');
    if (!L.spares) warn.push('no_spares');
    if (!L.materials) warn.push('no_materials');
    if (!L.lab && !L.rover) warn.push('low_science');
    return {
      mass, budget, remaining: budget - mass, over: mass > budget + 1e-9,
      power: { clear: f.power.supply, storm: storm.supply, demand: f.power.demand, habKw: f.power.habKw },
      sols, shielding: S0, doseIndoor, warnings: warn, mission,
    };
  }

  return {
    createMission, turnsOf, resolveTurn, forecast, defaultPlan, scoreMission, achievements, advise,
    summarizeLoadout, validateLoadout, loadoutMass, normalizeLoadout,
    shielding, seasonAt, newMissionCode, rng, activeCount, independenceOf,
    buildSpots, touchesBase, canBuild, canRequest, difficultyOf, crewSizeOf, budgetFor, referenceKit, nextPlan,
    newExpedition, upgradeMission, repairExpedition, bankItem, isKit, kitItem,
    rankOf, landOf, onLand, landTiles, zoneOf, grantRank, maxOf, unlockRank, costOf,
  };
});
