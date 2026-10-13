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
 *
 * API: haulRound(mission, crewId) → { loads, seconds, flare: null | 'hit' | 'safe' } (call it before E.resolveTurn; it
 *      changes mission.expedition)
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
const px = p => ({ x: p.x * T, y: p.y * T });
const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * DETOUR;

function haulRound(m, crewId) {
  const c = m.crew.find(k => k.id === crewId);
  if (!c || c.status !== 'active' || m.status !== 'active') return { loads: 0, seconds: 0, flare: null };
  const x = m.expedition;
  const bay = X.bay(m);
  const rover = !!bay && !!X.board(m, crewId, bay).ok;
  const speed = rover ? ROVER : FOOT, drain = rover ? D.EXPEDITION.drain.rover : 1;
  const toll = (m.schedule[m.turn].devil ? DEVIL_HITS.round : DEVIL_HITS.quiet) * D.DANGERS.devils.suit; // suit s a second on foot
  const cap = X.capacity(m, crewId);
  let suit = D.EXPEDITION.suit, here = HOME, loads = 0, carried = 0, clock = 0, flare = null;
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
    battery -= dist;
    clock += travel + hold;
    here = to;
  }
  // Loads left are read once a round and counted down here, so the nearest-find search stays cheap.
  const pool = findsNear(m).map(f => ({ f, left: X.findById(m, f.id).left })).filter(p => p.left > 0);
  const home = () => { if (carried) { X.deliver(m, crewId, px(HOME)); loads += carried; carried = 0; } };
  for (;;) {
    let best = null, bestD = Infinity;
    for (const p of pool) {
      if (p.left <= 0) continue;
      const dd = far(here, p.f);
      if (dd < bestD) { bestD = dd; best = p; }
    }
    if (!best) break;
    const hold = X.holdSeconds(best.f.kind, c.role);
    const back = far(best.f, HOME);
    if (cost(bestD + back, hold) > suit || bestD + back > battery) break;
    if (Z.flareDue(m) && !x.flare) Z.flareStart(m, clock); // the first step outside starts the flare's warning
    go(best.f, hold);
    if (!X.collect(m, crewId, best.f.id, px(best.f)).ok) break;
    best.left--;
    carried++;
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
  return { loads, seconds: D.EXPEDITION.suit - suit, flare };
}

module.exports = { haulRound, findsNear };
