/*
 * SOL 500 — the surface's model of the endless world: which 32×32 data chunks are live, what blocks a step,
 * short paths, the build queue and the fog the crew has seen. No DOM, so the Node tests cover all of it;
 * src/surface-paint.js draws what this module knows.
 *
 * Data chunks are made when the player comes within MAKE chunks and deleted beyond KEEP (the gap avoids churn
 * at the edge). The base's four chunks are always kept, and a hard cap drops the least recently used first.
 * A deleted chunk is rebuilt from (seed, cx, cy), so it comes back identical. Fog is kept apart and survives.
 *
 * API: SolWorld.create(missionSeed, { cap }) → world (the object returned at the bottom of create)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./worldgen.js'), require('./fog.js'));
  else root.SolWorld = factory(root.SolWorldgen, root.SolFog);
})(typeof self !== 'undefined' ? self : this, function (W, F) {
  'use strict';
  const CH = W.CHUNK;
  const MAKE = 2, KEEP = 3, CAP = 64;
  const PATH_HALF = 32; // click-to-walk searches a 64×64-tile box around the walker
  const BASE_CHUNKS = ['-1,-1', '0,-1', '-1,0', '0,0'];
  const key = (cx, cy) => cx + ',' + cy;
  const chunkOf = t => Math.floor(t / CH);
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function create(missionSeed, opts) {
    const cap = (opts && opts.cap) || CAP;
    const seed = W.seedOf(missionSeed);
    const data = new Map();      // key → { c: chunk, used }
    const fog = new Map();       // key → Uint8Array(128): the tiles seen
    const fogText = new Map();   // key → the last base64 sent or merged, so an unchanged value is skipped quickly
    const stamp = new Map();     // key → bumps whenever that chunk's fog changes (the painter redraws its mini image)
    const dirty = new Set();     // chunks with fog not yet handed out by takeFog()
    const pinned = new Set(BASE_CHUNKS);
    let overlay = new Set();
    let queue = [];
    let tick = 0, built = 0;

    // ---------- data chunks ----------
    function evictOver() {
      while (data.size > cap) {
        let oldest = null, oldestKey = null;
        for (const [k, e] of data) if (!pinned.has(k) && (!oldest || e.used < oldest.used)) { oldest = e; oldestKey = k; }
        if (!oldestKey) return;
        data.delete(oldestKey);
      }
    }
    function get(cx, cy) {
      const k = key(cx, cy);
      let e = data.get(k);
      if (e) { e.used = ++tick; return e.c; }
      e = { c: W.chunk(seed, cx, cy), used: ++tick };
      data.set(k, e);
      built++;
      evictOver();
      return e.c;
    }
    function peek(cx, cy) { const e = data.get(key(cx, cy)); return e ? e.c : null; }
    // For far chunks the map needs once (their mini image): never kept, so they can't push out the player's chunks.
    function dataFor(cx, cy) { return peek(cx, cy) || W.chunk(seed, cx, cy); }

    function tile(tx, ty) {
      const cx = chunkOf(tx), cy = chunkOf(ty);
      return get(cx, cy).tiles[(ty - cy * CH) * CH + (tx - cx * CH)];
    }
    function region(tx, ty) {
      const cx = chunkOf(tx), cy = chunkOf(ty);
      return W.regionOf(get(cx, cy), tx - cx * CH, ty - cy * CH);
    }
    // Base things the world doesn't know about (the HQ, the reactor, the lander, rocks on the build grid) block too.
    function setOverlay(tiles) { overlay = new Set(tiles.map(t => t[0] + ',' + t[1])); }
    const isBlocked = (tx, ty) => overlay.has(tx + ',' + ty) || W.BLOCKING[tile(tx, ty)] === 1;
    const speed = (tx, ty) => W.SPEED[tile(tx, ty)];

    // Breadth-first search inside a 64×64-tile box around the start. Returns the tile steps (start excluded),
    // [] when already there, or null.
    function findPath(sx, sy, gx, gy, allowGoalBlocked) {
      if (Math.abs(gx - sx) > PATH_HALF || Math.abs(gy - sy) > PATH_HALF) return null;
      const size = PATH_HALF * 2 + 1, ox = sx - PATH_HALF, oy = sy - PATH_HALF;
      const at = (x, y) => (y - oy) * size + (x - ox);
      const prev = new Int32Array(size * size).fill(-1);
      const q = new Int32Array(size * size);
      const start = at(sx, sy), goal = at(gx, gy);
      prev[start] = start;
      let head = 0, tail = 0;
      q[tail++] = start;
      while (head < tail) {
        const n = q[head++];
        if (n === goal) break;
        const x = ox + (n % size), y = oy + Math.floor(n / size);
        for (const [dx, dy] of STEPS) {
          const nx = x + dx, ny = y + dy;
          if (nx < ox || ny < oy || nx >= ox + size || ny >= oy + size) continue;
          const m = at(nx, ny);
          if (prev[m] !== -1) continue;
          if (!(allowGoalBlocked && m === goal) && isBlocked(nx, ny)) continue;
          prev[m] = n;
          q[tail++] = m;
        }
      }
      if (prev[goal] === -1) return null;
      const path = [];
      for (let n = goal; n !== start; n = prev[n]) path.unshift([ox + (n % size), oy + Math.floor(n / size)]);
      return path;
    }

    // Keeps the chunks near the player and queues the missing ones, nearest to where the player is heading first.
    function retain(tx, ty, hx, hy) {
      const pcx = chunkOf(tx), pcy = chunkOf(ty);
      for (const [k, e] of data) {
        if (!pinned.has(k) && Math.max(Math.abs(e.c.cx - pcx), Math.abs(e.c.cy - pcy)) > KEEP) data.delete(k);
      }
      const hcx = chunkOf(hx == null ? tx : hx), hcy = chunkOf(hy == null ? ty : hy);
      const want = [];
      for (let cy = pcy - MAKE; cy <= pcy + MAKE; cy++) for (let cx = pcx - MAKE; cx <= pcx + MAKE; cx++) {
        if (!data.has(key(cx, cy))) want.push([cx, cy, (cx - hcx) * (cx - hcx) + (cy - hcy) * (cy - hcy)]);
      }
      want.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
      queue = want;
    }
    // Builds at most one queued chunk; returns whether it built one.
    function work() {
      while (queue.length) {
        const [cx, cy] = queue.shift();
        if (data.has(key(cx, cy))) continue;
        get(cx, cy);
        return true;
      }
      return false;
    }

    // ---------- fog ----------
    function bits(cx, cy, make) {
      const k = key(cx, cy);
      let b = fog.get(k);
      if (!b && make) { b = F.empty(); fog.set(k, b); }
      return b || null;
    }
    const bump = k => stamp.set(k, (stamp.get(k) || 0) + 1);
    // Marks every tile within r tiles of (tx, ty) as seen; returns how many were new.
    function reveal(tx, ty, r) {
      let n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = tx + dx, y = ty + dy, cx = chunkOf(x), cy = chunkOf(y);
        if (F.set(bits(cx, cy, true), x - cx * CH, y - cy * CH)) {
          n++;
          const k = key(cx, cy);
          dirty.add(k);
          bump(k);
        }
      }
      return n;
    }
    function seen(tx, ty) {
      const cx = chunkOf(tx), cy = chunkOf(ty), b = fog.get(key(cx, cy));
      return !!b && F.has(b, tx - cx * CH, ty - cy * CH) === 1;
    }
    // The chunks newly seen since the last call, as { key: base64 }. Whole chunks are sent: merging is an OR,
    // so sending a bit twice is harmless.
    function takeFog() {
      const out = {};
      for (const k of dirty) { out[k] = F.encode(fog.get(k)); fogText.set(k, out[k]); }
      dirty.clear();
      return out;
    }
    // Merges fog from the saved mission or from teammates; returns the keys whose fog changed.
    function mergeFog(map) {
      const changed = [];
      if (!map || typeof map !== 'object') return changed;
      for (const k of Object.keys(map)) {
        const text = map[k];
        if (!F.KEY.test(k) || fogText.get(k) === text) continue;
        const incoming = F.decode(text);
        if (!incoming) continue;
        fogText.set(k, text);
        const b = fog.get(k);
        if (!b) { fog.set(k, incoming); changed.push(k); bump(k); continue; }
        if (F.orInto(b, incoming)) { changed.push(k); bump(k); }
      }
      return changed;
    }

    return {
      seed, get, peek, dataFor, tile, region, setOverlay, isBlocked, speed, findPath, retain, work,
      reveal, seen, takeFog, mergeFog,
      fogBits: (cx, cy) => bits(cx, cy, false),
      fogStamp: k => stamp.get(k) || 0,
      fogKeys: () => [...fog.keys()],
      liveKeys: () => [...data.keys()],
      stats: () => ({ data: data.size, cap, queue: queue.length, fog: fog.size, built }),
    };
  }

  return { create, chunkOf, MAKE, KEEP, CAP, PATH_HALF };
});
