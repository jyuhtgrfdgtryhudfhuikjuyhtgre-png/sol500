'use strict';
/*
 * SOL 500 — a scripted explorer for the balance runs (spec §10). Each round one crew member goes out on one suit charge,
 * walks (or drives the rover) to the nearest finds, collects them through the real rules in src/expedition.js and
 * delivers them at the base. It is a model, not a player: it moves in straight lines with a detour factor, never
 * sprints, and knows where every find within 128 tiles is. Holding E drains the suit at the walking rate (you step
 * out of the rover to work), and the rover drives at most roverRange tiles a round.
 * The dangers (spec §3.4) cost it what they cost a player who ignores them: it never dodges a dust devil, so on foot it
 * pays the devils' average toll on its suit, and it never runs for cover, so a solar flare that ends while it is out
 * hits it (through the real rules in src/dangers.js).
 * Played thoughtfully (`poi`), it also uses the points of interest near the base (spec §3.6, §3.7) as a thoughtful
 * player would: it collects the landmarks' and formations' sites like finds, opens supply caches, salvages wrecks and
 * solar arrays (picking up what did not fit), repairs weather stations, discovers a landmark once its centre is in view,
 * and fills its suit at a hab pod when the next find would be out of reach. Comms masts it leaves: it knows the map.
 *
 * API: haulRound(mission, crewId, poi) → { loads, seconds, flare: null | 'hit' | 'safe' } (call it before E.resolveTurn;
 *      it changes mission.expedition). loads are what it delivered; seconds the suit it used.
 */
const D = require('../src/data.js');
const X = require('../src/expedition.js');
const Z = require('../src/dangers.js');

const T = 64;
const FOOT = 150 / T;              // tiles a second on foot (SPEED in src/surface.js)
const ROVER = FOOT * 2.6;          // in the rover (ROVER_X)
const DETOUR = 1.25;               // paths bend around rocks, rims and canyon walls
const SPAN = 4;                    // the explorer knows the finds in chunks −4..3 both ways (±128 tiles)
const HOME = { x: 0.5, y: 1.5 };   // the tile just south of the HQ, where it delivers (tile units)
// Dust devils hit a walker who never dodges this often (hits a second on foot), measured with src/dangers.js over 567
// straight 150 s walks in the Plains: 0.18 hits a walk in most rounds, 1.61 in a dust-devil round. The rover is immune.
const DEVIL_HITS = { quiet: 0.18 / 150, round: 1.61 / 150 };

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
// it uses, the hab pods (the middle of the floor) and the landmarks' centres.
const knownPoi = new Map();
function poiNear(m) {
  let p = knownPoi.get(m.seed);
  if (p) return p;
  p = { sites: [], structures: [], pods: [], landmarks: [] };
  const seen = new Set(), at = (k, kind, dy) => ({ id: k.id, x: k.x + 0.5, y: k.y + 0.5 + (dy || 0), kind });
  for (let cy = -SPAN; cy < SPAN; cy++) for (let cx = -SPAN; cx < SPAN; cx++) {
    for (const l of X.landmarksIn(m, cx, cy)) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      p.landmarks.push(at(l, 'landmark'));
      l.sites.forEach((s, n) => p.sites.push(Object.assign(at(s, s.kind), { id: l.id + ':' + n, site: s })));
    }
    for (const s of X.structuresIn(m, cx, cy)) {
      if (seen.has(s.id) || s.kind === 'mast') continue;
      seen.add(s.id);
      if (s.kind === 'pod') p.pods.push(at(s, 'pod', -2));
      else p.structures.push(at(s, s.kind));
    }
    for (const f of X.chunkAt(m, cx, cy).formations) for (const s of f.sites) p.sites.push(Object.assign(at(s, s.kind), { id: f.id + ':0', site: s }));
  }
  if (knownPoi.size > 64) knownPoi.clear();
  knownPoi.set(m.seed, p);
  return p;
}
const px = p => ({ x: p.x * T, y: p.y * T });
const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * DETOUR;

function haulRound(m, crewId, poi) {
  const c = m.crew.find(k => k.id === crewId);
  if (!c || c.status !== 'active' || m.status !== 'active') return { loads: 0, seconds: 0, flare: null };
  const x = m.expedition;
  const bay = X.bay(m);
  const rover = !!bay && !!X.board(m, crewId, bay).ok;
  const speed = rover ? ROVER : FOOT, drain = rover ? D.EXPEDITION.drain.rover : 1;
  const toll = (m.schedule[m.turn].devil ? DEVIL_HITS.round : DEVIL_HITS.quiet) * D.DANGERS.devils.suit; // suit s a second on foot
  const cap = X.capacity(m, crewId), view = Z.viewTiles(m, rover);
  let suit = D.EXPEDITION.suit, used = 0, here = HOME, loads = 0, carried = 0, clock = 0, flare = null;
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
      flare = Z.flareEnd(m, { [crewId]: px(at) }, 0, f.end).hit.length ? 'hit' : 'safe';
    }
    suit -= cost(dist, hold);
    used += cost(dist, hold);
    battery -= dist;
    clock += travel + hold;
    here = to;
  }
  // What it can do this round, with the loads left read once and counted down here, so the nearest search stays cheap:
  // collect a find (or a site), use a structure, pick up what a structure left at its door, discover a landmark.
  const pool = findsNear(m).map(f => ({ f, left: X.findById(m, f.id).left, use: 'collect' }));
  const P = poi ? poiNear(m) : null;
  if (P) {
    for (const s of P.sites) pool.push({ f: s, left: X.loadsLeft(m, s.site, s.id), use: 'collect' });
    for (const s of P.structures) if (!x.structures[s.id]) pool.push({ f: s, left: 1, use: 'interact' });
    for (const l of P.landmarks) if (!x.landmarks[l.id]) pool.push({ f: l, left: 1, use: 'discover' });
  }
  // Where it acts: a landmark's centre only has to come into view.
  const spot = p => {
    if (p.use !== 'discover') return p.f;
    const d = Math.hypot(p.f.x - here.x, p.f.y - here.y), k = d > view - 0.5 ? (view - 0.5) / d : 1;
    return { x: p.f.x + (here.x - p.f.x) * k, y: p.f.y + (here.y - p.f.y) * k };
  };
  const holdOf = p => (p.use === 'discover' ? 0 : X.holdSeconds(p.use === 'pickup' ? 'pickup' : p.f.kind, c.role));
  // A hab pod it can reach now, not used this round, and the way home from it in the battery (its suit will be full).
  const podFor = () => {
    let best = null, bestD = Infinity;
    for (const k of P ? P.pods : []) {
      const d = far(here, k);
      if (d < bestD && !(x.refills[crewId] || []).includes(k.id) && cost(d, 0) <= suit && d + far(k, HOME) <= battery) { best = k; bestD = d; }
    }
    return best;
  };
  const home = () => { if (carried) { X.deliver(m, crewId, px(HOME)); loads += carried; carried = 0; } };
  for (;;) {
    let best = null, bestD = Infinity, to = null;
    for (const p of pool) {
      if (p.left <= 0) continue;
      const s = spot(p), dd = far(here, s);
      if (dd < bestD) { bestD = dd; best = p; to = s; }
    }
    if (!best) break;
    const hold = holdOf(best);
    const back = far(to, HOME);
    if (cost(bestD + back, hold) > suit || bestD + back > battery) {
      const pod = cost(bestD + back, hold) > suit && podFor(); // played thoughtfully, it fills its suit and goes on
      if (!pod) break;
      go(pod, 0);
      if (!X.refill(m, crewId, pod.id, px(pod)).ok) break;
      suit = D.EXPEDITION.suit;
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
    } else if (!X.discover(m, crewId, best.f.id, at).ok) break;
    best.left--;
    if (carried >= cap) { go(HOME, 0); home(); }
  }
  if (here !== HOME) go(HOME, 0);
  home();
  if (x.flare && !x.flare.over) { Z.flareEnd(m, {}, 0, x.flare.end); flare = 'safe'; } // it ends with the explorer home
  if (rover) {
    X.setRoverDriven(m, crewId, (Number(x.roverDriven) || 0) + range - battery);
    X.park(m, crewId, px(HOME));
  }
  x.suits[crewId] = Math.max(0, suit);
  return { loads, seconds: used, flare };
}

module.exports = { haulRound, findsNear, poiNear, DEVIL_HITS };
