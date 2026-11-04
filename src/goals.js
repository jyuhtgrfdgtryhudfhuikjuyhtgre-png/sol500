/*
 * SOL 500 — expedition goals (spec §3.9, M4d): what each round asks of the crew outside, and how far they have got.
 * Pure (no DOM), like src/expedition.js: ui.js runs it for solo play and the server for co-op, so both judge a goal the same
 * way, and a co-op player's game never reports one done: the server works it out from the mission (ruling R3).
 *
 * A goal is picked as its round starts and is judged from the mission state against what it was then (R3). `base` is how
 * long the list the goal watches was at the pick: the sites touched (x.sites), the regions visited, the landmarks
 * discovered, the structures used, the beacons placed or the fog's chunks. Each list only grows, in the order things
 * happened (and JSON keeps an object's keys in that order), so what lies past `base` happened since the pick. A haul
 * watches the round's bank instead, which holds only this round's deliveries (the advance empties it).
 * The advance (R4): advance() brings progress up to date, E.resolveTurn pays the done goals once (the engine only reads the
 * numbers here) and clears them, and advance() picks the next round's. Picking needs the world, so it lives here.
 *
 * A goal: { id: "G<turn>:<n>", kind, params, need, base, progress, done, reward }
 *   'survey' { tiles }: survey a science site at least `tiles` from the HQ · 'haul' { loads }: bring home loads of ice or
 *   metal (water or materials) · 'region': enter a kind of region the crew hasn't been in · 'landmark': discover one ·
 *   'structure': repair or salvage one · 'beacon' { tiles }: place one at least `tiles` out · 'chunks' { count }: explore
 *   chunks of fog for the first time. `need`: how many it takes (`progress` counts up to it); `reward`: what it pays,
 *   { science, morale, water, materials, kits } (a haul's grows with what its loads gave).
 *
 * API: pick(m) → the round's goals: picked once, as the round starts, from the kinds that can be done (offered); 1 a round,
 *        2 from round 5, by the mission code and the round
 *      offered(m) → [kind]: the kinds that can be done this round · make(m, kind) → a goal of that kind for this round
 *        (its id is pick's to give)
 *      update(m) → the goals, with progress, done and reward brought up to date from the mission (solo play calls it before
 *        showing them; the co-op server before every room frame, since a tab has no fog to judge an 'explore' goal with)
 *      advance(m, plan) → E.resolveTurn's { state, report }: the one way solo play and the server advance a round
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./worldgen.js'), require('./engine.js'), require('./fog.js'), require('./expedition.js'));
  else root.SolGoals = factory(root.SolData, root.SolWorldgen, root.SolEngine, root.SolFog, root.SolExpedition);
})(typeof self !== 'undefined' ? self : this, function (D, W, E, F, X) {
  'use strict';
  const G = D.GOALS, K = G.kinds, R = G.reach;
  const REPAIRED = ['wreck', 'array', 'weather', 'mast']; // repaired or salvaged: not a supply cache opened, nor a hab pod
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const out = p => Math.sqrt(p.x * p.x + p.y * p.y); // tiles from the HQ, for a point in world tiles
  const after = (list, g) => list.slice(g.base);    // what happened since the pick

  // ---------- what lies within reach of the HQ, worked out once per world (the world never changes) ----------
  // The science sites [{ id, d }] (finds, formations' surveys and landmarks' sites), the structures that can be repaired or
  // salvaged and the landmarks (ids), and the kinds of region other than the HQ's (sampled every 8 tiles).
  // ponytail: a world's first pick reads its 100 chunks round the HQ through the shared 256-chunk cache (15 ms median, 36 ms
  // at most, on the server as a room launches); read them past the cache if launches ever crowd out other rooms' chunks.
  const near = new Map(); // world seed → the above
  function nearOf(m) {
    const seed = W.seedOf(m.seed);
    let n = near.get(seed);
    if (n) return n;
    n = { sites: [], structures: [], landmarks: [], regions: [] };
    const site = (id, f) => { if (f.kind === 'science' && out(f) <= R) n.sites.push({ id, d: out(f) }); };
    const lo = Math.floor(-R / W.CHUNK), hi = Math.floor(R / W.CHUNK);
    for (let cy = lo; cy <= hi; cy++) for (let cx = lo; cx <= hi; cx++) {
      for (const f of X.findsIn(m, cx, cy)) site(cx + ',' + cy + ':' + f.n, f);
      for (const k of X.chunkAt(m, cx, cy).formations) k.sites.forEach((f, i) => site(k.id + ':' + i, f));
    }
    for (const l of W.landmarksNear(seed, -R, -R, R, R)) {
      l.sites.forEach((f, i) => site(l.id + ':' + i, f));
      if (out(l) <= R) n.landmarks.push(l.id);
    }
    for (const s of W.structuresNear(seed, -R, -R, R, R)) if (REPAIRED.includes(s.kind) && out(s) <= R) n.structures.push(s.id);
    const kinds = new Set();
    for (let y = -R; y <= R; y += 8) for (let x = -R; x <= R; x += 8) if (x * x + y * y <= R * R) kinds.add(W.REGIONS[W.regionAt(seed, x, y)]);
    kinds.delete(hqRegion(m));
    n.regions = [...kinds];
    if (near.size >= 64) near.clear();
    near.set(seed, n);
    return n;
  }
  // The HQ's region: the crew lives there, so it is never a region they haven't been in.
  const hqRegion = m => W.REGIONS[W.regionAt(W.seedOf(m.seed), 0, 0)];

  // A site the mission has touched, from its id as X.collect wrote it: a find, a formation's survey or a landmark's site.
  function siteOf(m, id) {
    let g = /^F(-?\d+),(-?\d+):0$/.exec(id);
    if (g) { const k = X.chunkAt(m, +g[1], +g[2]).formations[0]; return (k && k.sites[0]) || null; }
    if ((g = /^L(-?\d+),(-?\d+):(\d+)$/.exec(id))) { const l = W.landmarkAt(W.seedOf(m.seed), +g[1], +g[2]); return (l && l.sites[+g[3]]) || null; }
    return X.findById(m, id);
  }
  function structureKind(m, id) {
    const g = /^S(-?\d+),(-?\d+)$/.exec(id), s = g && W.structureAt(W.seedOf(m.seed), +g[1], +g[2]);
    return s ? s.kind : null;
  }
  // The base's own ground is not new: the HQ is the corner the four chunks round it share, and from the base zone the view
  // reaches no further, but it shows them only once round 1 has begun, after the pick.
  const HOME = ['0,0', '-1,0', '0,-1', '-1,-1'];
  // This round's deliveries of ice and metal (a wreck's and an array's materials too): not the backpacks the advance banked.
  const hauled = x => x.banked.lines.filter(l => !l.late && (l.res === 'water' || l.res === 'materials'));

  // ---------- the kinds ----------
  // base(x): the length of what the goal watches, at the pick · count(m, g): how much of it counts since · can(m, n, g):
  // whether it can be done this round (n: what lies within reach).
  const KINDS = {
    survey: {
      base: x => Object.keys(x.sites).length,
      count: (m, g) => after(Object.keys(m.expedition.sites), g).filter(id => { const f = siteOf(m, id); return !!f && f.kind === 'science' && out(f) >= g.params.tiles; }).length,
      can: (m, n, g) => n.sites.some(s => s.d >= g.params.tiles && !own(m.expedition.sites, s.id)),
    },
    haul: {
      base: () => 0,
      count: m => hauled(m.expedition).reduce((sum, l) => sum + l.loads, 0),
      can: () => true, // ice and metal lie everywhere outside the flat zone
    },
    region: {
      base: x => x.regions.length,
      count: (m, g) => {
        const x = m.expedition, before = x.regions.slice(0, g.base), hq = hqRegion(m);
        return after(x.regions, g).filter(r => W.REGIONS.includes(r) && r !== hq && !before.includes(r)).length;
      },
      can: (m, n) => n.regions.some(r => !m.expedition.regions.includes(r)),
    },
    landmark: {
      base: x => Object.keys(x.landmarks).length,
      count: (m, g) => after(Object.keys(m.expedition.landmarks), g).length,
      can: (m, n) => n.landmarks.some(id => !own(m.expedition.landmarks, id)),
    },
    structure: {
      base: x => Object.keys(x.structures).length,
      count: (m, g) => after(Object.keys(m.expedition.structures), g).filter(id => REPAIRED.includes(structureKind(m, id))).length,
      can: (m, n) => n.structures.some(id => !own(m.expedition.structures, id)),
    },
    // x.beacons: [{ x, y, by, round }] (spec §4), x and y in world tiles.
    beacon: {
      base: x => x.beacons.length,
      count: (m, g) => after(m.expedition.beacons, g).filter(b => !!b && out(b) >= g.params.tiles).length,
      can: m => m.expedition.kits > 0 && m.expedition.beacons.length < D.EXPEDITION.beacon.max,
    },
    chunks: {
      base: x => Object.keys(x.revealed).length,
      count: (m, g) => after(Object.keys(m.expedition.revealed), g).filter(k => F.KEY.test(k) && !HOME.includes(k)).length,
      can: () => true, // the world is endless
    },
  };

  function make(m, kind) {
    const k = K[kind], round = m.turn + 1, tiles = Math.min(G.tiles[2], G.tiles[0] + G.tiles[1] * round);
    const params = kind === 'survey' || kind === 'beacon' ? { tiles } : kind === 'haul' ? { loads: k.loads } : kind === 'chunks' ? { count: k.count } : {};
    let reward = Object.assign({}, k.reward);
    if (kind === 'survey') {
      const [lo, hi] = k.science, first = G.tiles[0] + G.tiles[1];
      reward = { science: lo + Math.round((hi - lo) * (tiles - first) / (G.tiles[2] - first)) };
    }
    if (kind === 'haul') reward = { water: 0, materials: 0 };
    return { id: '', kind, params, need: params.loads || params.count || 1, base: KINDS[kind].base(m.expedition), progress: 0, done: false, reward };
  }

  function offered(m) {
    const n = nearOf(m);
    return Object.keys(KINDS).filter(kind => KINDS[kind].can(m, n, make(m, kind)));
  }

  function pick(m) {
    const x = m && m.expedition;
    if (!x || m.status !== 'active' || x.goals.length) return x ? x.goals : [];
    const open = offered(m), seed = W.seedOf(m.seed);
    for (let i = 0; i < (m.turn + 1 >= G.two ? 2 : 1) && open.length; i++) {
      const g = make(m, open.splice(W.hash(seed, m.turn, i, 1500) % open.length, 1)[0]);
      g.id = 'G' + m.turn + ':' + i;
      x.goals.push(g);
    }
    return x.goals;
  }

  function update(m) {
    const x = m.expedition;
    for (const g of x.goals) {
      const n = KINDS[g.kind].count(m, g);
      g.progress = Math.min(g.need, n);
      g.done = n >= g.need;
      if (g.kind === 'haul') {
        // A quarter of what the loads gave, for at most the loads the goal asked for.
        const f = K.haul.bonus * Math.min(1, g.need / Math.max(1, n)), got = { water: 0, materials: 0 };
        for (const l of hauled(x)) got[l.res] += l.amount;
        g.reward = { water: Math.round(got.water * f), materials: Math.round(got.materials * f) };
      }
    }
    return x.goals;
  }

  function advance(m, plan) {
    update(m);
    const r = E.resolveTurn(m, plan);
    pick(r.state);
    return r;
  }

  return { pick, offered, make, update, advance };
});
