/*
 * SOL 500 — dangers outside (spec §3.4): solar flares and the shelters that cover you from them, dust devils, and how far
 * you can see in a dust storm; and the one table of exploring actions (act). Pure (no DOM), like src/expedition.js: the
 * server runs the flare in co-op and ui.js runs it in solo play, and every screen draws the same dust devils from the
 * mission code and the round's clock, without syncing.
 *
 * The round's clock counts seconds since the round began: in solo play it is the surface's own time (it stops while the
 * console is open, like the suit) and is saved with the mission; in co-op it is the server's, sent with each room frame.
 * Positions are world pixels { x, y } (64 px a tile, the HQ tile's corner at 0, 0).
 *
 * API: viewTiles(m, inRover) → tiles you can see around you this round (dust storms shrink it)
 *      viewAt(m, inRover, tile) → the same from the tile under you: a lava tube's headlamp ignores the storm, a star
 *        dune's crest sees further
 *      stormOf(m) → 'clear' | 'regional' | 'global': this round's dust storm (a global one grounds the scout drone)
 *      outside(m) → what waits outside this round, in the order the round's brief and the Expedition panel say it: 'flare'
 *        (a solar flare is due), 'devils' (a dust-devil round), 'storm' (a regional or global dust storm), 'rupture' (an O₂
 *        line rupture at the base: canisters carried home count)
 *      coversIn(m, x0, y0, x1, y1, peek) → [{ kind: 'shelter' | 'cave', x, y } | { kind: 'pod' | 'tube', id, x, y, box }]: the
 *        cover from a solar flare in that box (tile units): a point whose middle (x, y) is in it (DANGERS.shelter tiles from
 *        it count), or an interior whose box touches it ((x, y) is where its ring goes). peek(cx, cy) → a data chunk or null:
 *        the surface passes the chunks it holds (SolWorld's peek); the rules leave it out
 *      shelterAt(m, pos, slack, peek) → 'base' | 'shelter' | 'cave' | 'pod' | 'tube' | null: what covers you from a solar
 *        flare at pos
 *      slackOf(m) → the slack (tiles) the flare's verdict gives a position: EXPEDITION.reach in co-op (the server judges
 *        where it last saw you), 0 in solo play
 *      flareDue(m) → does a solar flare come this round (the schedule's spe)?
 *      flareStart(m, t) → { ok, flare } or { error }: someone stepped outside at round time t; the warning comes 30 s later
 *      flareEnd(m, spots, slack, t) → { ok, hit } or { error }: the flare hits. spots { crewId: pos } are the crew out on
 *        the map (the rest, and anyone sitting out the round after a solo collapse, are at the base); whoever has no cover
 *        (with slackOf(m) as the slack) gets a flare incident, counted at the advance
 *      setClock(m, t) · clockOf(m) → the solo round clock kept with the mission (it only goes up within a round)
 *      devils(m, x0, y0, x1, y1, t) → [{ id, x, y, a, dx, dy, spin }] in that box (world px) at round time t;
 *        a: 0–1, how formed it is (it fades in and out); (dx, dy): the way it drifts
 *      devilHit(m, pos, t) → the formed devil close enough to hit you at pos, or null
 *      act(m, crewId, type, body, pos, positions) → the rules' answer to one exploring action ({ ok, ... } or { error };
 *        'badAction' for one they do not have): the one table solo play and the co-op server both run (positions: where
 *        the crew stand, the server's, for a passenger's ride, M6)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'), require('./worldgen.js'), require('./engine.js'), require('./expedition.js'));
  else root.SolDangers = factory(root.SolData, root.SolWorldgen, root.SolEngine, root.SolExpedition);
})(typeof self !== 'undefined' ? self : this, function (D, W, E, X) {
  'use strict';
  const T = 64, CH = W.CHUNK;
  const Z = D.DANGERS, DV = Z.devils;
  const DUNES = W.REGIONS.indexOf('dunes');
  const okPos = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const round = m => (m && m.schedule && m.schedule[m.turn]) || null;
  // The round's dust storm: 'clear', 'regional' or 'global' (a global one grounds the scout drone, src/expedition.js fly).
  const stormOf = m => { const w = (round(m) || {}).weather; return w === 'regional' || w === 'global' ? w : 'clear'; };

  // ---------- how far you can see ----------
  function viewTiles(m, inRover) {
    const r = round(m), w = r ? r.weather : 'clear';
    if (w === 'global') return Z.view.global;
    if (w === 'regional') return Z.view.regional;
    return inRover ? Z.view.rover : Z.view.clear;
  }
  // The same from the tile under you (spec §3.4, §3.6): inside a lava tube (its floor or under its skylight) the headlamp
  // lights what clear weather shows, whatever the storm outside; a star dune's crest adds view.crest tiles to the weather's.
  function viewAt(m, inRover, tile) {
    if (tile === W.TILE.TUBE_FLOOR || tile === W.TILE.SKYLIGHT) return inRover ? Z.view.rover : Z.view.clear;
    return viewTiles(m, inRover) + (tile === W.TILE.CREST ? Z.view.crest : 0);
  }

  // ---------- what waits outside this round ----------
  // The surface's round brief and the console's Expedition panel both read this list, so a new danger is added here once;
  // each says it in its own words (eva.brief.<id>, eva.cond.<id>).
  function outside(m) {
    const r = round(m) || {}, out = [];
    if (flareDue(m)) out.push('flare');
    if (r.devil) out.push('devils');
    if (r.weather === 'regional' || r.weather === 'global') out.push('storm');
    if (m && (m.events || []).some(e => e.type === 'o2_rupture')) out.push('rupture');
    return out;
  }

  // ---------- shelter from a solar flare ----------
  // Every cover in the box (tile units, edges included): the built storm shelter (spec §3.4), then, chunk by chunk, the caves'
  // mouths (not those hidden under a point of interest's footprint), the abandoned hab pods and the lava tubes. shelterAt, the
  // surface's amber rings and its cover checks all read this one list. The shelter and a cave are points, listed when their
  // middle is in the box. A pod and a tube are interiors: the entry carries its id and its box (inclusive tiles), and is listed
  // when that box touches the query's; its (x, y) is where its ring goes, the middle of the pod's door or of the tube's
  // skylight. Every chunk a landmark's box (or a structure's apron) touches lists it, so each is added once, by id.
  // peek(cx, cy) → a data chunk or null; without it the chunks are built.
  const chunksOf = (m, peek) => peek || ((cx, cy) => X.chunkAt(m, cx, cy));
  function coversIn(m, x0, y0, x1, y1, peek) {
    const out = [], seen = new Set(), chunk = chunksOf(m, peek);
    const add = (kind, x, y) => { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) out.push({ kind, x, y }); };
    const room = (kind, id, [x, y], box) => {
      if (seen.has(id) || box[0] > x1 || box[2] + 1 < x0 || box[1] > y1 || box[3] + 1 < y0) return;
      seen.add(id);
      out.push({ kind, id, x: x + 0.5, y: y + 0.5, box });
    };
    const sh = E.activeCount(m, 'shelter') > 0 ? m.layout.find(k => k.type === 'shelter') : null;
    if (sh) add('shelter', sh.x + W.BASE_RECT.x + 0.5, sh.y + W.BASE_RECT.y + 0.5);
    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) {
      for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
        const c = chunk(cx, cy);
        if (!c) continue;
        for (const k of c.caves) if (!c.hidden.caves.includes(k.n)) add('cave', k.x + 0.5, k.y + 0.5);
        for (const s of c.structures) if (s.kind === 'pod') room('pod', s.id, [s.x, s.y], s.box);
        for (const l of c.landmarks) if (l.kind === 'tube') room('tube', l.id, l.skylight, l.box);
      }
    }
    return out;
  }
  // The base zone, or the first cover in the list that holds you: within DANGERS.shelter tiles of a point's middle, or
  // inside an interior. `slack` (tiles) widens each for a position sent a moment ago; `peek` is the lister's.
  function shelterAt(m, pos, slack, peek) {
    if (!m || !okPos(pos)) return null;
    const s = slack || 0, r = Z.shelter + s, fx = pos.x / T, fy = pos.y / T;
    if (X.inBaseZone(m, pos, s)) return 'base';
    for (const k of coversIn(m, fx - r, fy - r, fx + r, fy + r, peek)) {
      const dx = k.x - fx, dy = k.y - fy;
      if (k.box ? inside(m, k, fx, fy, s, peek) : dx * dx + dy * dy <= r * r) return k.kind;
    }
    return null;
  }
  // Inside an interior: in its box, widened by the slack. A tube's box also holds its wall and the plain ground round it, so
  // there you must be on its floor or under its skylight: on one of those tiles, or within the slack of one.
  function inside(m, k, fx, fy, s, peek) {
    const b = k.box;
    if (fx < b[0] - s || fx >= b[2] + 1 + s || fy < b[1] - s || fy >= b[3] + 1 + s) return false;
    if (k.kind !== 'tube') return true;
    const chunk = chunksOf(m, peek);
    for (let ty = Math.floor(fy - s); ty <= Math.floor(fy + s); ty++) {
      for (let tx = Math.floor(fx - s); tx <= Math.floor(fx + s); tx++) {
        const cx = Math.floor(tx / CH), cy = Math.floor(ty / CH), c = chunk(cx, cy), t = c && W.tileOf(c, tx - cx * CH, ty - cy * CH);
        if (t === W.TILE.TUBE_FLOOR || t === W.TILE.SKYLIGHT) return true;
      }
    }
    return false;
  }
  // The co-op server judges where it last saw you, a moment ago, so it gives you the slack every checked action gets; solo
  // play judges you where you are. The server, the solo verdict and the surface's banner all ask here, so they agree.
  const slackOf = m => (m && m.coop ? D.EXPEDITION.reach : 0);

  // ---------- the solar flare (spec §3.4) ----------
  function flareDue(m) { const r = round(m); return !!(r && r.spe); }
  function flareStart(m, t) {
    if (!m || m.status !== 'active' || !m.expedition) return { error: 'badPhase' };
    if (!flareDue(m)) return { error: 'noFlare' };
    if (!num(t) || t < 0) return { error: 'badTime' };
    const x = m.expedition;
    if (x.flare) return { error: 'started' };
    x.flare = { warn: t + Z.flare.delay, end: t + Z.flare.delay + Z.flare.countdown, over: false, hit: [] };
    return { ok: true, flare: x.flare };
  }
  function flareEnd(m, spots, slack, t) {
    if (!m || m.status !== 'active' || !m.expedition) return { error: 'badPhase' };
    const x = m.expedition, f = x.flare;
    if (!f || f.over) return { error: 'noFlare' };
    if (!num(t) || t < f.end - 0.5) return { error: 'early' };
    const hit = [];
    for (const id of Object.keys(spots || {})) {
      const c = m.crew.find(k => k.id === id);
      if (!c || c.status !== 'active' || hit.includes(id) || x.benched.includes(id)) continue; // sitting out the round at the base
      if (!okPos(spots[id]) || shelterAt(m, spots[id], slack)) continue;
      hit.push(id);
      x.incidents.push({ crewId: id, kind: 'flare' });
    }
    f.over = true;
    f.hit = hit;
    return { ok: true, hit };
  }

  // Solo play: the round's clock is kept with the mission (saved every 2 s with the suit), so a reload picks the countdown up.
  function setClock(m, t) {
    const x = m && m.expedition;
    if (!x || !num(t) || t < 0) return;
    x.clock = Math.max(num(x.clock) ? x.clock : 0, t);
  }
  const clockOf = m => (m && m.expedition && num(m.expedition.clock) ? m.expedition.clock : 0);

  // ---------- dust devils (spec §3.4) ----------
  // Every data chunk has a few devil slots. In each `life` window a slot holds a devil or not (a coin toss from the mission
  // code, the round, the chunk, the slot and the window), so the devils come and go but every screen agrees. A devil drifts
  // 6–12 tiles in a straight line, with the round's wind give or take 45°, and it never goes near the base. The numbers in
  // DANGERS.devils are devils a chunk: `quiet` in most rounds, `round` in a dust-devil round; the Dune Sea has twice as many.
  const regionMemo = new Map();
  function chunkRegion(seed, cx, cy) {
    const k = seed + ':' + cx + ',' + cy;
    let r = regionMemo.get(k);
    if (r === undefined) {
      r = W.regionAt(seed, cx * CH + CH / 2, cy * CH + CH / 2);
      if (regionMemo.size > 2048) regionMemo.clear();
      regionMemo.set(k, r);
    }
    return r;
  }
  const REACH = Math.ceil(DV.track[1] / 2) + 1; // how far (tiles) a devil gets from the tile it is centred on
  function devilsIn(seed, m, info, cx, cy, t, out) {
    const [lo, hi] = info.devil ? DV.round : DV.quiet;
    const slots = hi * (chunkRegion(seed, cx, cy) === DUNES ? DV.dunes : 1);
    if (!slots) return;
    const p = (lo + hi) / 2 / hi, life = DV.life;
    const h0 = W.hash(seed, cx, cy, 7000 + m.turn), wind = W.hash(seed, m.turn, 0, 7004) % 16;
    for (let i = 0; i < slots; i++) {
      const phase = W.unit(W.hash(h0, i, 0, 7001)) * life, k = Math.floor((t + phase) / life), age = t + phase - k * life;
      if (W.unit(W.hash(h0, i, k, 7002)) >= p) continue;
      const h = W.hash(h0, i, k, 7003);
      const len = DV.track[0] + (h >>> 16) % (DV.track[1] - DV.track[0] + 1);
      const dir = W.DIRS16[(wind + ((h >>> 24) % 5) + 14) % 16]; // the wind, give or take 45°
      const along = len * (age / life - 0.5);
      const tx = cx * CH + (h % CH) + 0.5 + dir[0] * along, ty = cy * CH + ((h >>> 8) % CH) + 0.5 + dir[1] * along;
      let a = Math.min(1, age / DV.fade, (life - age) / DV.fade);
      const home = Math.sqrt((tx - 0.5) * (tx - 0.5) + (ty - 0.5) * (ty - 0.5));
      a *= Math.max(0, Math.min(1, (home - DV.clear) / 2)); // it dies down before it reaches the base
      if (a <= 0) continue;
      out.push({ id: cx + ',' + cy + ':' + i + ':' + k, x: tx * T, y: ty * T, a, dx: dir[0], dy: dir[1], spin: h % 628 / 100 });
    }
  }
  function devils(m, x0, y0, x1, y1, t) {
    const out = [], info = round(m);
    if (!info || !m.expedition || m.status !== 'active' || !num(t)) return out;
    const seed = W.seedOf(m.seed), all = [];
    const cx0 = Math.floor((x0 / T - REACH) / CH), cx1 = Math.floor((x1 / T + REACH) / CH);
    const cy0 = Math.floor((y0 / T - REACH) / CH), cy1 = Math.floor((y1 / T + REACH) / CH);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) devilsIn(seed, m, info, cx, cy, t, all);
    for (const d of all) if (d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1) out.push(d);
    return out;
  }
  // A devil hits you when its middle passes within `radius` tiles of your feet, once it has fully formed (half faded in).
  function devilHit(m, pos, t) {
    if (!okPos(pos)) return null;
    const r = DV.radius * T;
    let best = null, bestD = r * r;
    for (const d of devils(m, pos.x - r, pos.y - r, pos.x + r, pos.y + r, t)) {
      const dd = (d.x - pos.x) * (d.x - pos.x) + (d.y - pos.y) * (d.y - pos.y);
      if (d.a >= 0.5 && dd <= bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  // ---------- the exploring actions, one table ----------
  // What each action a game asks for runs in the rules (src/expedition.js, and the flare here). body holds what only the
  // asking game knows: the find or the drop, its live suit level, how far the rover went, the round's clock. Solo play's hook
  // (ui.js) runs any of them on the spot; the co-op server runs those its players may send (EXPEDITION_ACTIONS in
  // lib/rooms.js), never the flare's two, because it times the flare itself. A new action is one line here.
  const ACTIONS = {
    collect: (m, id, b, pos) => X.collect(m, id, b.find, pos),
    deliver: (m, id, b, pos) => X.deliver(m, id, pos),
    canister: (m, id, b, pos) => X.useCanister(m, id, pos, b.suit),
    pickup: (m, id, b, pos) => X.pickUp(m, id, b.drop, pos),
    collapse: (m, id, b, pos) => X.collapse(m, id, pos, b.driven),
    revive: (m, id, b, pos) => X.revive(m, id, b.target, pos),
    board: (m, id, b, pos) => X.board(m, id, pos, b.kind), // kind: 'rover' (none) or 'cabin' (M6)
    park: (m, id, b, pos) => X.park(m, id, pos, b.driven, b.kind),
    ride: (m, id, b, pos, all) => X.ride(m, id, pos, all), // co-op's passenger (M6); all: where the crew stand (the server's)
    alight: (m, id) => X.alight(m, id),
    discover: (m, id, b, pos) => X.discover(m, id, b.landmark, pos),
    interact: (m, id, b, pos) => X.interact(m, id, b.structure, pos),
    refill: (m, id, b, pos) => X.refill(m, id, b.beacon || b.pod, pos), // a relay beacon's id ("B<i>") or a hab pod's
    takeKit: (m, id, b, pos) => X.takeKit(m, id, pos),
    returnKit: (m, id, b, pos) => X.returnKit(m, id, pos),
    placeBeacon: (m, id, b, pos) => X.placeBeacon(m, id, pos),
    fly: (m, id, b, pos) => X.fly(m, id, pos, b.tx, b.ty), // the scout drone, to tile (tx, ty)
    // Solo play's flare (spec §3.4): your first step outside starts it on the round's clock; at its end you are hit unless
    // you have cover (the rest of the crew is at the base, and so are you if you sit out the round after a collapse).
    flareStart: (m, id, b) => flareStart(m, b.t),
    flareEnd: (m, id, b, pos) => flareEnd(m, { [id]: pos }, slackOf(m), b.t),
  };
  function act(m, crewId, type, body, pos, positions) {
    const run = Object.prototype.hasOwnProperty.call(ACTIONS, type) ? ACTIONS[type] : null;
    return run ? run(m, crewId, body || {}, pos, positions) : { error: 'badAction' };
  }

  return { viewTiles, viewAt, outside, coversIn, shelterAt, slackOf, flareDue, flareStart, flareEnd, setClock, clockOf, devils, devilHit, act, stormOf };
});
