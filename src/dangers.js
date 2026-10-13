/*
 * SOL 500 — dangers outside (spec §3.4): solar flares and the shelters that cover you from them, dust devils, and how far
 * you can see in a dust storm. Pure (no DOM), like src/expedition.js: the server runs the flare in co-op and ui.js runs it
 * in solo play, and every screen draws the same dust devils from the mission code and the round's clock, without syncing.
 *
 * The round's clock counts seconds since the round began: in solo play it is the surface's own time (it stops while the
 * console is open, like the suit) and is saved with the mission; in co-op it is the server's, sent with each room frame.
 * Positions are world pixels { x, y } (64 px a tile, the HQ tile's corner at 0, 0).
 *
 * API: viewTiles(m, inRover) → tiles you can see around you this round (dust storms shrink it)
 *      shelterAt(m, pos, slack) → 'base' | 'shelter' | 'cave' | null: what covers you from a solar flare at pos
 *      cavesNear(m, fx, fy, r) → caves whose mouth's middle is within r tiles of (fx, fy) (tile units)
 *      flareDue(m) → does a solar flare come this round (the schedule's spe)?
 *      flareStart(m, t) → { ok, flare } or { error }: someone stepped outside at round time t; the warning comes 30 s later
 *      flareEnd(m, spots, slack, t) → { ok, hit } or { error }: the flare hits. spots { crewId: pos } are the crew out on
 *        the map (the rest, and anyone sitting out the round after a solo collapse, are at the base); whoever has no cover
 *        gets a flare incident, counted at the advance
 *      setClock(m, t) · clockOf(m) → the solo round clock kept with the mission (it only goes up within a round)
 *      devils(m, x0, y0, x1, y1, t) → [{ id, x, y, a, dx, dy, spin }] in that box (world px) at round time t;
 *        a: 0–1, how formed it is (it fades in and out); (dx, dy): the way it drifts
 *      devilHit(m, pos, t) → the formed devil close enough to hit you at pos, or null
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

  // ---------- how far you can see ----------
  function viewTiles(m, inRover) {
    const r = round(m), w = r ? r.weather : 'clear';
    if (w === 'global') return Z.view.global;
    if (w === 'regional') return Z.view.regional;
    return inRover ? Z.view.rover : Z.view.clear;
  }

  // ---------- shelter from a solar flare ----------
  function cavesNear(m, fx, fy, r) {
    const out = [];
    for (let cy = Math.floor((fy - r) / CH); cy <= Math.floor((fy + r) / CH); cy++) {
      for (let cx = Math.floor((fx - r) / CH); cx <= Math.floor((fx + r) / CH); cx++) {
        for (const k of X.cavesIn(m, cx, cy)) {
          const dx = k.x + 0.5 - fx, dy = k.y + 0.5 - fy;
          if (dx * dx + dy * dy <= r * r) out.push(k);
        }
      }
    }
    return out;
  }
  // The base zone, the built storm shelter (spec §3.4) or a cave's mouth. `slack` (tiles) widens each for a position sent a
  // moment ago. Lava tubes and hab pods (M4c) join the list here.
  function shelterAt(m, pos, slack) {
    if (!m || !okPos(pos)) return null;
    const s = slack || 0, r = Z.shelter + s;
    if (X.inBaseZone(pos, s)) return 'base';
    const sh = E.activeCount(m, 'shelter') > 0 ? m.layout.find(k => k.type === 'shelter') : null;
    if (sh) {
      const dx = pos.x / T - (sh.x + W.BASE_RECT.x + 0.5), dy = pos.y / T - (sh.y + W.BASE_RECT.y + 0.5);
      if (dx * dx + dy * dy <= r * r) return 'shelter';
    }
    if (cavesNear(m, pos.x / T, pos.y / T, r).length) return 'cave';
    return null;
  }

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

  return { viewTiles, shelterAt, cavesNear, flareDue, flareStart, flareEnd, setClock, clockOf, devils, devilHit };
});
