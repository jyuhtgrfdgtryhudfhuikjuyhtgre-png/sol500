'use strict';
/*
 * SOL 500 — a scripted explorer for the balance runs (spec §10). Each round one crew member goes out on one suit charge,
 * walks (or drives the rover) to the nearest finds, collects them through the real rules in src/expedition.js and
 * delivers them at the base. On the way it explores the fog within its view and visits the regions it walks into, as a
 * player's game does (see). It is a model, not a player: it moves in straight lines with a detour factor, never
 * sprints, and knows where every find within 128 tiles is. Holding E drains the suit at the walking rate (you step
 * out of the rover to work), and the rover drives at most roverRange tiles a round.
 * The dangers (spec §3.4) cost it what they cost a player who ignores them: it never dodges a dust devil, so on foot it
 * pays the devils' average toll on its suit, and it never runs for cover, so a solar flare that ends while it is out
 * hits it (through the real rules in src/dangers.js).
 * Played thoughtfully (`poi`), it also uses the points of interest near the base (spec §3.6, §3.7) as a thoughtful
 * player would: it collects the landmarks' and formations' sites like finds, opens supply caches, salvages wrecks and
 * solar arrays (picking up what did not fit), repairs weather stations, discovers a landmark once its centre is in view,
 * and fills its suit at a hab pod or a relay beacon when the next find would be out of reach. It goes after the round's
 * open goals (spec §3.9) when it can get there and back: a science site far enough out, a landmark, a structure to repair
 * or salvage (a comms mast too, which it otherwise leaves: it knows the map), a kind of region it hasn't visited, the
 * nearest chunk it hasn't explored; a haul it meets by hauling. And it takes a relay beacon kit out when one waits at
 * the base (spec §3.8), and places it on the first open ground PLACE tiles out or more, or as far as a beacon goal asks.
 *
 * API: haulRound(mission, crewId, poi) → { loads, seconds, time, flare: null | 'hit' | 'safe' } (call it before
 *      E.resolveTurn; it changes mission.expedition). loads are what it delivered; seconds the suit it used; time the
 *      seconds it was out on the round's clock, walking (or driving) and holding E.
 */
const D = require('../src/data.js');
const X = require('../src/expedition.js');
const Z = require('../src/dangers.js');
const W = require('../src/worldgen.js');
const F = require('../src/fog.js');
const G = require('../src/goals.js');

const T = 64, C = W.CHUNK;
const FOOT = 150 / T;              // tiles a second on foot (SPEED in src/surface.js)
const ROVER = FOOT * 2.6;          // in the rover (ROVER_X)
const DETOUR = 1.25;               // paths bend around rocks, rims and canyon walls
const SPAN = 4;                    // the explorer knows the finds in chunks −4..3 both ways (±128 tiles)
const HOME = { x: 0.5, y: 1.5 };   // the tile just south of the HQ, where it delivers (tile units)
// Dust devils hit a walker who never dodges this often (hits a second on foot), measured with src/dangers.js over 567
// straight 150 s walks in the Plains: 0.18 hits a walk in most rounds, 1.61 in a dust-devil round. The rover is immune.
const DEVIL_HITS = { quiet: 0.18 / 150, round: 1.61 / 150 };
const PULL = 0.35;                 // played thoughtfully, a goal's target counts as this much of its distance
const PLACE = 20;                  // and it places a relay beacon this many tiles out or more (a beacon goal: its distance)

const known = new Map();           // mission code → the finds near the base, in tile units
function findsNear(m) {
  let list = known.get(m.seed);
  if (list) return list;
  list = [];
  for (let cy = -SPAN; cy < SPAN; cy++) for (let cx = -SPAN; cx < SPAN; cx++) {
    for (const f of X.findsIn(m, cx, cy)) list.push({ id: cx + ',' + cy + ':' + f.n, x: f.x + 0.5, y: f.y + 0.5, kind: f.kind });
  }
  if (known.size > 64) known.clear();
  known.set(m.seed, list);
  return list;
}
// The points of interest near the base, the same way (tile units): the sites of landmarks and formations, the structures
// it uses, the comms masts (only for a goal), the hab pods (the middle of the floor), the landmarks' centres, and the
// region every 8 tiles (where to walk for a region goal).
const knownPoi = new Map();
function poiNear(m) {
  let p = knownPoi.get(m.seed);
  if (p) return p;
  p = { sites: [], structures: [], masts: [], pods: [], landmarks: [], regions: [] };
  const seen = new Set(), at = (k, kind, dy) => ({ id: k.id, x: k.x + 0.5, y: k.y + 0.5 + (dy || 0), kind });
  for (let cy = -SPAN; cy < SPAN; cy++) for (let cx = -SPAN; cx < SPAN; cx++) {
    for (const l of X.landmarksIn(m, cx, cy)) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      p.landmarks.push(at(l, 'landmark'));
      l.sites.forEach((s, n) => p.sites.push(Object.assign(at(s, s.kind), { id: l.id + ':' + n, site: s })));
    }
    for (const s of X.structuresIn(m, cx, cy)) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      if (s.kind === 'pod') p.pods.push(at(s, 'pod', -2));
      else (s.kind === 'mast' ? p.masts : p.structures).push(at(s, s.kind));
    }
    for (const f of X.chunkAt(m, cx, cy).formations) for (const s of f.sites) p.sites.push(Object.assign(at(s, s.kind), { id: f.id + ':0', site: s }));
  }
  const seed = W.seedOf(m.seed), R = SPAN * C;
  for (let y = 4 - R; y < R; y += 8) for (let x = 4 - R; x < R; x += 8) p.regions.push({ id: 'R' + x + ',' + y, x: x + 0.5, y: y + 0.5, kind: 'visit', region: W.REGIONS[W.regionAt(seed, x, y)] });
  if (knownPoi.size > 64) knownPoi.clear();
  knownPoi.set(m.seed, p);
  return p;
}
const px = p => ({ x: p.x * T, y: p.y * T });
const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * DETOUR;

// What a player's game does as they walk (src/surface.js, explore): every tile within `view` of them is explored for good
// (the shared fog, x.revealed, capped as ui.js caps it) and a region they walk into is visited (x.regions, as ui.js's
// enterRegion does in solo play). `at` is a point in tile units.
// ponytail: a chunk it sees gets one bit, the seen tile nearest the walker, not the whole disc of view: the goals count
// chunks, not tiles. Reveal the disc (src/surface-world.js, reveal) if anything ever counts tiles.
function see(m, at, view) {
  const x = m.expedition, tx = Math.floor(at.x), ty = Math.floor(at.y), cx = Math.floor(tx / C), cy = Math.floor(ty / C);
  const region = W.REGIONS[W.regionOf(X.chunkAt(m, cx, cy), tx - cx * C, ty - cy * C)];
  if (!x.regions.includes(region)) x.regions.push(region);
  for (let ky = Math.floor((ty - view) / C); ky <= Math.floor((ty + view) / C); ky++) {
    for (let kx = Math.floor((tx - view) / C); kx <= Math.floor((tx + view) / C); kx++) {
      const key = kx + ',' + ky;
      if (Object.prototype.hasOwnProperty.call(x.revealed, key)) continue;
      const nx = Math.max(kx * C, Math.min(kx * C + C - 1, tx)), ny = Math.max(ky * C, Math.min(ky * C + C - 1, ty));
      if ((nx - tx) * (nx - tx) + (ny - ty) * (ny - ty) > view * view) continue;
      const bits = F.empty();
      F.set(bits, nx - kx * C, ny - ky * C);
      F.mergeMap(x.revealed, { [key]: F.encode(bits) }, 4096);
    }
  }
}
// Sees along a straight walk from a to b, a look every half view.
function walkSees(m, a, b, view) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, view / 2)));
  for (let i = 1; i <= n; i++) see(m, { x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }, view);
}

function haulRound(m, crewId, poi) {
  const c = m.crew.find(k => k.id === crewId);
  if (!c || c.status !== 'active' || m.status !== 'active') return { loads: 0, seconds: 0, time: 0, flare: null };
  const x = m.expedition;
  const bay = X.bay(m);
  const rover = !!bay && !!X.board(m, crewId, bay).ok;
  const speed = rover ? ROVER : FOOT, drain = rover ? D.EXPEDITION.drain.rover : 1;
  const toll = (m.schedule[m.turn].devil ? DEVIL_HITS.round : DEVIL_HITS.quiet) * D.DANGERS.devils.suit; // suit s a second on foot
  const cap = X.capacity(m, crewId), view = Z.viewTiles(m, rover);
  let suit = X.suitMax(m), used = 0, here = HOME, loads = 0, carried = 0, clock = 0, flare = null;
  const range = rover ? X.roverLeft(m) : Infinity;
  let battery = range;
  // What a leg of `dist` tiles and `hold` seconds of work costs the suit. Work is on foot, even from the rover.
  const cost = (dist, hold) => dist / speed * drain + hold + ((rover ? 0 : dist / speed) + hold) * toll;
  // Goes to `to` and works there for `hold` seconds. A flare that ends on the way hits it where it is by then.
  function go(to, hold) {
    const dist = far(here, to), travel = dist / speed, f = x.flare;
    if (f && !f.over && clock + travel + hold >= f.end) {
      const k = travel > 0 ? Math.max(0, Math.min(1, (f.end - clock) / travel)) : 1;
      const at = { x: here.x + (to.x - here.x) * k, y: here.y + (to.y - here.y) * k };
      flare = Z.flareEnd(m, { [crewId]: px(at) }, Z.slackOf(m), f.end).hit.length ? 'hit' : 'safe';
    }
    suit -= cost(dist, hold);
    used += cost(dist, hold);
    battery -= dist;
    clock += travel + hold;
    walkSees(m, here, to, view);
    here = to;
  }
  see(m, HOME, view); // the base's own view, and its region
  // What it can do this round, with the loads left read once and counted down here, so the nearest search stays cheap:
  // collect a find (or a site), use a structure, pick up what a structure left at its door, discover a landmark.
  const pool = findsNear(m).map(f => ({ f, left: X.findById(m, f.id).left, use: 'collect' }));
  const P = poi ? poiNear(m) : null;
  if (P) {
    for (const s of P.sites) pool.push({ f: s, left: X.loadsLeft(m, s.site, s.id), use: 'collect' });
    for (const s of P.structures) if (!x.structures[s.id]) pool.push({ f: s, left: 1, use: 'interact' });
    for (const l of P.landmarks) if (!x.landmarks[l.id]) pool.push({ f: l, left: 1, use: 'discover' });
  }
  // Played thoughtfully, it goes after the round's open goals (spec §3.9): a goal's target counts as PULL of its distance,
  // so it goes there first unless something else is much nearer, and only if it can get there and back (a goal's target
  // it can't reach waits for a refill). The targets: a science site far enough out (survey), a landmark (discover), a
  // structure to repair or salvage, a comms mast too (structure), a spot in a kind of region it hasn't visited (region),
  // the nearest chunk it hasn't explored (chunks). A haul it meets by hauling. The goals are judged again (G.update)
  // after it acts on one, never trusted from here.
  const out = p => Math.hypot(p.x - 0.5, p.y - 0.5); // tiles from the HQ tile, for a point in tile units
  const hq = W.REGIONS[W.regionAt(W.seedOf(m.seed), 0, 0)];
  // Played thoughtfully, it takes a relay beacon kit out when one waits at the base (spec §3.8): it fills a backpack slot
  // until it places it (see placeHere), and one it brings back goes back to the base at the advance.
  let kit = !!P && x.kits > 0 && x.beacons.length < D.EXPEDITION.beacon.max && !!X.takeKit(m, crewId, px(HOME)).ok;
  let open = [];
  const visit = (f, use) => ({ f, left: 1, use: use || 'visit', goal: true, only: true });
  function refreshGoals() {
    open = G.update(m).filter(g => !g.done);
    const has = kind => open.find(g => g.kind === kind);
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].only && pool[i].left > 0) pool.splice(i, 1);
    const survey = has('survey'), beacon = kit && has('beacon');
    for (const p of pool) {
      p.goal = (!!survey && p.use === 'collect' && p.f.kind === 'science' && out(p.f) >= survey.params.tiles) ||
        (!!has('landmark') && p.use === 'discover') || (!!has('structure') && p.use === 'interact' && p.f.kind !== 'cache') ||
        (!!beacon && p.use !== 'discover' && out(p.f) >= beacon.params.tiles + 1); // somewhere to place it, far enough out
    }
    if (has('structure')) for (const s of P.masts) if (!x.structures[s.id]) pool.push(visit(s, 'interact'));
    if (has('region')) {
      let best = null, bd = Infinity;
      for (const r of P.regions) {
        if (r.region === hq || x.regions.includes(r.region)) continue;
        const d = Math.hypot(r.x - here.x, r.y - here.y);
        if (d < bd) { bd = d; best = r; }
      }
      if (best) pool.push(visit(best));
    }
    if (has('chunks')) {
      let best = null, bd = Infinity;
      for (let cy = -SPAN; cy < SPAN; cy++) for (let cx = -SPAN; cx < SPAN; cx++) {
        if (Object.prototype.hasOwnProperty.call(x.revealed, cx + ',' + cy)) continue;
        const p = { x: Math.max(cx * C + 1, Math.min(cx * C + C - 1, here.x)), y: Math.max(cy * C + 1, Math.min(cy * C + C - 1, here.y)) };
        const d = Math.hypot(p.x - here.x, p.y - here.y);
        if (d < bd) { bd = d; best = { id: 'C' + cx + ',' + cy, x: p.x, y: p.y, kind: 'visit' }; }
      }
      if (best) pool.push(visit(best));
    }
  }
  if (P) refreshGoals();
  // Where it acts: a landmark's centre only has to come into view.
  const spot = p => {
    if (p.use !== 'discover') return p.f;
    const d = Math.hypot(p.f.x - here.x, p.f.y - here.y), k = d > view - 0.5 ? (view - 0.5) / d : 1;
    return { x: p.f.x + (here.x - p.f.x) * k, y: p.f.y + (here.y - p.f.y) * k };
  };
  const holdOf = p => (p.use === 'discover' || p.use === 'visit' ? 0 : X.holdSeconds(p.use === 'pickup' ? 'pickup' : p.f.kind, c.role, m));
  // A hab pod or a relay beacon it can reach now, not used this round, and the way home from it in the battery (its suit
  // will be full).
  const podFor = () => {
    let best = null, bestD = Infinity;
    const spots = (P ? P.pods : []).concat(x.beacons.map((b, i) => ({ id: 'B' + i, x: b.x + 0.5, y: b.y + 0.5 })));
    for (const k of spots) {
      const d = far(here, k);
      if (d < bestD && !(x.refills[crewId] || []).includes(k.id) && cost(d, 0) <= suit && d + far(k, HOME) <= battery) { best = k; bestD = d; }
    }
    return best;
  };
  // Played thoughtfully, it places the kit it carries on the first open ground (the rules' beaconSpot) PLACE tiles out or
  // more, or as far as an open beacon goal asks, when it can still get home after the hold.
  function placeHere() {
    const goal = open.find(g => g.kind === 'beacon'), sp = X.beaconSpot(m, crewId, px(here));
    const hold = X.holdSeconds('beacon', c.role, m);
    if (sp.error || Math.hypot(sp.x, sp.y) < (goal ? goal.params.tiles : PLACE) || cost(far(here, HOME), hold) > suit) return;
    go(here, hold);
    if (!X.placeBeacon(m, crewId, px(here)).ok) return;
    kit = false;
    if (goal) refreshGoals();
  }
  // Delivers at the base: only what the rules banked counts. A refused delivery leaves the backpack full, so it stops.
  const home = () => {
    if (!carried) return;
    const r = X.deliver(m, crewId, px(HOME));
    if (!r.ok) return;
    loads += r.items.length;
    carried = 0;
  };
  for (;;) {
    let best = null, bestD = Infinity, score = Infinity, to = null;
    for (const p of pool) {
      if (p.left <= 0 || p.wait) continue;
      const s = spot(p), dd = far(here, s), sc = p.goal ? dd * PULL : dd;
      if (sc < score) { score = sc; bestD = dd; best = p; to = s; }
    }
    if (!best) break;
    const hold = holdOf(best);
    const back = far(to, HOME);
    if (cost(bestD + back, hold) > suit || bestD + back > battery) {
      if (best.goal) { best.wait = true; continue; } // not within reach now: after a refill, perhaps
      const pod = cost(bestD + back, hold) > suit && podFor(); // played thoughtfully, it fills its suit and goes on
      if (!pod) break;
      go(pod, 0);
      if (!X.refill(m, crewId, pod.id, px(pod)).ok) break;
      suit = X.suitMax(m);
      for (const p of pool) p.wait = false;
      continue;
    }
    if (Z.flareDue(m) && !x.flare) Z.flareStart(m, clock); // the first step outside starts the flare's warning
    go(to, hold);
    const at = px(to);
    if (best.use === 'collect') {
      if (!X.collect(m, crewId, best.f.id, at).ok) break;
      carried++;
    } else if (best.use === 'interact' || best.use === 'pickup') {
      const r = best.use === 'interact' ? X.interact(m, crewId, best.f.id, at) : X.pickUp(m, crewId, best.f.id, at);
      if (!r.ok) break;
      carried += r.items.length;
      if (r.left && best.use === 'pickup') best.left++;
      else if (r.left) pool.push({ f: best.f, left: 1, use: 'pickup' }); // the drop's id is the structure's
    } else if (best.use === 'discover' && !X.discover(m, crewId, best.f.id, at).ok) break;
    best.left--;
    if (best.goal) refreshGoals();
    if (kit) placeHere();
    if (carried + (kit ? 1 : 0) >= cap) { go(HOME, 0); home(); }
  }
  if (here !== HOME) go(HOME, 0);
  home();
  if (x.flare && !x.flare.over) { Z.flareEnd(m, {}, Z.slackOf(m), x.flare.end); flare = 'safe'; } // it ends with the explorer home
  if (rover) {
    X.setRoverDriven(m, crewId, (Number(x.roverDriven) || 0) + range - battery);
    X.park(m, crewId, px(HOME));
  }
  x.suits[crewId] = Math.max(0, suit);
  return { loads, seconds: used, time: clock, flare };
}

module.exports = { haulRound, findsNear, poiNear, DEVIL_HITS };
