/*
 * SOL 500 — everything on the surface drawn with Canvas 2D:
 *   the ground, as 256-px image chunks (4×4 tiles) painted from the world data. Decor that crosses a chunk edge is
 *   replayed by every chunk it touches, clipped to itself, so there are no seams; painting is seeded from
 *   (seed, chunk), so a deleted chunk is repainted with exactly the same picture;
 *   the fog over the view; the minimap's one-pixel-per-tile "mini" images of explored chunks;
 *   and the sprites: astronauts, name tags, rocks, the lander and status badges.
 *
 * API: SolPaint.createPainter(world, { canvas, cap, now }) → painter · SolPaint.drawFog(...) · SolPaint.decorFor(...)
 *      SolPaint.tileRGB(code, region) · SolPaint.REGION_COLORS · SolPaint.sprites
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./worldgen.js'), require('./fog.js'));
  else root.SolPaint = factory(root.SolWorldgen, root.SolFog);
})(typeof self !== 'undefined' ? self : this, function (W, F) {
  'use strict';
  const T = 64, IMG = 4, PX = IMG * T, CH = W.CHUNK, CAP = 160, MINI_CAP = 512;
  const TL = W.TILE;

  // ---------- colours ----------
  // Regolith looks different in each region; the other codes have one colour each.
  const REGION_GROUND = [[116, 58, 37], [67, 48, 43], [104, 82, 72], [134, 72, 44], [177, 158, 146], [59, 45, 44]];
  const UNDER_BOULDER = [TL.REGOLITH, TL.DUNE, TL.REGOLITH, TL.REGOLITH, TL.POLYGON, TL.LAVA];
  const CODE_RGB = [];
  CODE_RGB[TL.SAND] = [77, 49, 41];
  CODE_RGB[TL.DUNE] = [88, 57, 45];
  CODE_RGB[TL.BOULDER] = [76, 59, 55];
  CODE_RGB[TL.CLIFF] = [154, 92, 60];
  CODE_RGB[TL.RIM] = [164, 108, 76];
  CODE_RGB[TL.CRATER_FLOOR] = [88, 46, 31];
  CODE_RGB[TL.CANYON_FLOOR] = [104, 56, 36];
  CODE_RGB[TL.CANYON_WALL] = [62, 32, 23];
  CODE_RGB[TL.RAMP] = [142, 85, 54];
  CODE_RGB[TL.ICE] = [207, 227, 234];
  CODE_RGB[TL.POLYGON] = [177, 156, 144];
  CODE_RGB[TL.LAVA] = [59, 45, 44];
  CODE_RGB[TL.BASE] = [128, 70, 45];
  function tileRGB(code, region) {
    if (code === TL.REGOLITH || CODE_RGB[code] == null) return REGION_GROUND[region] || REGION_GROUND[0];
    return CODE_RGB[code];
  }
  // The map legend's swatch for each region: its usual ground (the one under its boulders), exactly as the minimap and the map paint it.
  const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  const REGION_COLORS = UNDER_BOULDER.map((code, region) => hex(tileRGB(code, region)));
  const channel = v => Math.min(255, Math.round(v));
  const css = (rgb, k) => 'rgb(' + channel(rgb[0] * k) + ',' + channel(rgb[1] * k) + ',' + channel(rgb[2] * k) + ')';
  const RAISED = new Uint8Array(32);
  for (const k of ['CLIFF', 'RIM', 'CANYON_WALL']) RAISED[TL[k]] = 1;
  // A gentle brightness drift across the ground. It comes from smooth noise, so tiles never show as a checkerboard.
  const shade = (world, tx, ty) => 0.96 + 0.08 * W.noise(world.seed, 920, tx, ty, 5);

  // ---------- one tile of ground ----------
  function paintTile(g, world, tx, ty) {
    const code = world.tile(tx, ty);
    if (RAISED[code]) return; // painted after the decor, in paintRaised
    const reg = world.region(tx, ty);
    const h = W.hash(world.seed, tx, ty, 900);
    const X = tx * T, Y = ty * T;
    // A boulder sits on its region's usual ground, drawn just like that ground (the rock goes on top in paintRaised).
    const look = code === TL.BOULDER ? UNDER_BOULDER[reg] : code;
    g.fillStyle = css(tileRGB(look, reg), shade(world, tx, ty));
    g.fillRect(X, Y, T, T);
    if (look === TL.DUNE) { // ripples across the wind; the ends line up with the next tile's, so they run on unbroken
      g.strokeStyle = 'rgba(140,96,74,0.45)';
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) { const y = Y + 8 + k * 16; g.beginPath(); g.moveTo(X, y); g.quadraticCurveTo(X + 32, y - 3 - ((h >>> (4 + k * 2)) & 3) * 2, X + T, y); g.stroke(); }
    } else if (look === TL.POLYGON) { // ground cracked into polygons by freezing and thawing
      g.strokeStyle = 'rgba(120,98,88,0.55)';
      g.lineWidth = 1.5;
      const a = 12 + ((h >>> 4) % 40), b = 12 + ((h >>> 10) % 40);
      g.beginPath(); g.moveTo(X + a, Y); g.lineTo(X + b, Y + T); g.moveTo(X, Y + b); g.lineTo(X + T, Y + a); g.stroke();
    } else if (look === TL.ICE) {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.5;
      drawIceCracks(g, X, Y);
    } else if (look === TL.LAVA) {
      g.fillStyle = 'rgba(20,14,14,0.5)';
      for (let k = 0; k < 6; k++) { const v = W.hash(world.seed, tx, ty, 901 + k); g.fillRect(X + (v % 60), Y + ((v >>> 8) % 60), 2 + ((v >>> 16) % 3), 2 + ((v >>> 20) % 3)); }
    } else if (code === TL.CANYON_FLOOR) {
      g.fillStyle = 'rgba(190,120,80,0.16)';
      g.fillRect(X, Y + 18, T, 5);
      g.fillRect(X, Y + 44, T, 4);
    } else if (code === TL.CRATER_FLOOR) {
      g.fillStyle = 'rgba(30,10,6,0.12)';
      g.fillRect(X, Y, T, T);
    } else if (code === TL.BASE) { // compacted regolith with the build grid's dashed lines
      const B = W.BASE_RECT;
      g.strokeStyle = 'rgba(255,220,190,0.12)';
      g.lineWidth = 1;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.moveTo(X, Y); g.lineTo(X + T, Y);
      g.moveTo(X, Y); g.lineTo(X, Y + T);
      if (tx === B.x + B.w - 1) { g.moveTo(X + T, Y); g.lineTo(X + T, Y + T); }
      if (ty === B.y + B.h - 1) { g.moveTo(X, Y + T); g.lineTo(X + T, Y + T); }
      g.stroke();
      g.setLineDash([]);
    }
  }

  // Things that stand up (mesa cliffs, crater rims, canyon walls, boulders) go on top of the decor.
  function paintRaised(g, world, tx, ty) {
    const code = world.tile(tx, ty);
    const X = tx * T, Y = ty * T;
    if (RAISED[code]) {
      g.fillStyle = css(tileRGB(code, world.region(tx, ty)), shade(world, tx, ty));
      g.fillRect(X, Y, T, T);
      const below = world.tile(tx, ty + 1) !== code, above = world.tile(tx, ty - 1) !== code;
      if (code === TL.CLIFF) {
        g.fillStyle = 'rgba(255,214,170,0.10)';
        g.fillRect(X, Y, T, T);
        if (above) { g.fillStyle = 'rgba(255,230,200,0.22)'; g.fillRect(X, Y, T, 3); }
        if (below) {
          g.fillStyle = '#4a2618';
          g.fillRect(X, Y + T - 22, T, 22);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(X, Y + T - 6, T, 6);
        }
      } else {
        if (above) { g.fillStyle = code === TL.RIM ? 'rgba(255,214,170,0.22)' : 'rgba(255,214,170,0.12)'; g.fillRect(X, Y, T, 4); }
        if (below) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X, Y + T - 10, T, 10); }
      }
    } else if (code === TL.BOULDER) {
      const h = W.hash(world.seed, tx, ty, 902);
      drawRock(g, { wx: tx, wy: ty, s: 0.7 + (h % 31) / 100, ox: ((h >>> 8) % 9) - 4, oy: ((h >>> 12) % 7) - 3 });
    }
  }

  // ---------- decor ----------
  const GROUND = new Uint8Array(32);
  for (const k of ['REGOLITH', 'SAND', 'DUNE', 'CRATER_FLOOR', 'CANYON_FLOOR', 'ICE', 'POLYGON', 'LAVA']) GROUND[TL[k]] = 1;
  const DECOR = [
    ['blotch', 'blotch', 'pebbles', 'pit'],   // Plains
    ['ripple', 'ripple', 'blotch'],           // Dune Sea
    ['pit', 'pit', 'pebbles', 'blotch'],      // Crater Field
    ['strata', 'pebbles', 'blotch'],          // Canyon Lands
    ['crack', 'frost', 'blotch'],             // Icy Plains
    ['vesicles', 'pebbles', 'blotch'],        // Volcanic Flanks
  ];
  // The decor that belongs to one image chunk. Each piece reaches at most 58 px from its centre, so it can only
  // spill into the next chunk; every chunk it touches replays it, clipped to itself.
  function decorFor(world, ix, iy) {
    const out = [];
    const n = 5 + (W.hash(world.seed, ix, iy, 910) % 6);
    for (let i = 0; i < n; i++) {
      const h = W.hash(world.seed, ix * 16 + i, iy, 911);
      const x = ix * PX + (h % PX), y = iy * PX + ((h >>> 8) % PX);
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (!GROUND[world.tile(tx, ty)]) continue;
      const kinds = DECOR[world.region(tx, ty)];
      out.push({ kind: kinds[(h >>> 16) % kinds.length], x, y, s: 8 + ((h >>> 20) % 28), h });
    }
    return out;
  }
  function drawDecor(g, d) {
    const x = d.x, y = d.y, s = d.s, h = d.h;
    if (d.kind === 'blotch') {
      g.fillStyle = h & 1 ? 'rgba(40,14,8,0.10)' : 'rgba(200,120,80,0.07)';
      g.beginPath(); g.ellipse(x, y, s * 1.4, s * 0.8, ((h >>> 3) % 7) * 0.4, 0, Math.PI * 2); g.fill();
    } else if (d.kind === 'pebbles') {
      g.fillStyle = h & 2 ? '#5a2a1b' : '#8f4d33';
      for (let k = 0; k < 6; k++) g.fillRect(x + ((h >>> (k * 3)) % 24) - 12, y + ((h >>> (k * 3 + 1)) % 16) - 8, 2 + (k & 1), 2);
    } else if (d.kind === 'pit') {
      g.fillStyle = 'rgba(40,14,8,0.25)';
      g.beginPath(); g.ellipse(x, y, s, s * 0.62, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(210,140,100,0.25)';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y + 1, s, s * 0.62, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
    } else if (d.kind === 'ripple') {
      g.strokeStyle = 'rgba(120,84,64,0.35)';
      g.lineWidth = 1.5;
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x - s * 1.5, y + k * 7); g.quadraticCurveTo(x, y + k * 7 - 5, x + s * 1.5, y + k * 7); g.stroke(); }
    } else if (d.kind === 'strata') {
      g.strokeStyle = 'rgba(214,160,110,0.22)';
      g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - s * 1.6, y + k * 6); g.lineTo(x + s * 1.6, y + k * 6 + 2); g.stroke(); }
    } else if (d.kind === 'crack') {
      g.strokeStyle = 'rgba(110,90,80,0.5)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - s / 3, y - 5); g.lineTo(x + s / 3, y + 4); g.lineTo(x + s, y - 2); g.stroke();
    } else if (d.kind === 'frost') {
      g.fillStyle = 'rgba(240,248,255,0.18)';
      g.beginPath(); g.ellipse(x, y, s * 1.2, s * 0.7, 0, 0, Math.PI * 2); g.fill();
    } else if (d.kind === 'vesicles') {
      g.fillStyle = 'rgba(15,10,10,0.45)';
      for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(x + ((h >>> (k * 2)) % 30) - 15, y + ((h >>> (k * 2 + 5)) % 20) - 10, 1.5 + (k & 1), 0, Math.PI * 2); g.fill(); }
    }
  }

  function paintChunk(world, ix, iy, canvas) {
    const g = canvas.getContext('2d');
    const tx0 = ix * IMG, ty0 = iy * IMG;
    g.setTransform(1, 0, 0, 1, -ix * PX, -iy * PX); // draw in world pixels
    for (let ty = ty0; ty < ty0 + IMG; ty++) for (let tx = tx0; tx < tx0 + IMG; tx++) paintTile(g, world, tx, ty);
    g.save();
    g.beginPath();
    g.rect(ix * PX, iy * PX, PX, PX);
    g.clip();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const d of decorFor(world, ix + dx, iy + dy)) drawDecor(g, d);
    g.restore();
    for (let ty = ty0; ty < ty0 + IMG; ty++) for (let tx = tx0; tx < tx0 + IMG; tx++) paintRaised(g, world, tx, ty);
  }

  // ---------- the painter: image chunks and mini images, with their caches ----------
  function createPainter(world, opts) {
    const o = opts || {};
    const makeCanvas = o.canvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
    const now = o.now || (() => performance.now());
    const cap = o.cap || CAP;
    const images = new Map(); // "ix,iy" → { c, ix, iy, used }
    const minis = new Map();  // "cx,cy" → { c, stamp, used }
    const miniWant = new Set();
    const times = [];
    let queue = [], view = null, need = 0, tick = 0, renders = 0;

    const inView = e => !!view && e.ix >= view[0] && e.ix <= view[2] && e.iy >= view[1] && e.iy <= view[3];
    // The cap never pushes out a chunk the current view needs: a very wide window just keeps more.
    function evictImages() {
      const limit = Math.max(cap, need);
      while (images.size > limit) {
        let oldest = null, oldestKey = null;
        for (const [k, e] of images) if (!inView(e) && (!oldest || e.used < oldest.used)) { oldest = e; oldestKey = k; }
        if (!oldestKey) return;
        images.delete(oldestKey);
      }
    }
    function retainView(x0, y0, x1, y1) {
      const a = Math.floor(x0 / PX) - 1, b = Math.floor(y0 / PX) - 1, c = Math.floor(x1 / PX) + 1, d = Math.floor(y1 / PX) + 1;
      view = [a, b, c, d];
      need = (c - a + 1) * (d - b + 1);
      for (const [k, e] of images) if (e.ix < a - 1 || e.ix > c + 1 || e.iy < b - 1 || e.iy > d + 1) images.delete(k);
      const mx = (a + c) / 2, my = (b + d) / 2, want = [];
      for (let iy = b; iy <= d; iy++) for (let ix = a; ix <= c; ix++) {
        if (!images.has(ix + ',' + iy)) want.push([ix, iy, (ix - mx) * (ix - mx) + (iy - my) * (iy - my)]);
      }
      want.sort((p, q) => p[2] - q[2]);
      queue = want;
      evictImages();
    }
    // Paints queued chunks until the deadline (but at least `atLeast` of them); returns how many it painted.
    function work(deadline, atLeast) {
      let n = 0;
      while (queue.length && (n < (atLeast || 0) || now() < deadline)) {
        const [ix, iy] = queue.shift();
        const k = ix + ',' + iy;
        if (images.has(k)) continue;
        const t0 = now();
        const c = makeCanvas(PX, PX);
        paintChunk(world, ix, iy, c);
        times.push(now() - t0);
        if (times.length > 200) times.shift();
        images.set(k, { c, ix, iy, used: ++tick });
        evictImages();
        n++;
      }
      return n;
    }
    function drawGround(ctx, x0, y0, x1, y1) {
      const a = Math.floor(x0 / PX), b = Math.floor(y0 / PX), c = Math.floor(x1 / PX), d = Math.floor(y1 / PX);
      for (let iy = b; iy <= d; iy++) for (let ix = a; ix <= c; ix++) {
        const e = images.get(ix + ',' + iy);
        if (e) {
          e.used = ++tick;
          // one extra pixel of overlap hides the hairline seam between neighbours at fractional zooms
          ctx.drawImage(e.c, 0, 0, PX, PX, ix * PX, iy * PX, PX + 1, PX + 1);
        } else flat(ctx, ix, iy);
      }
    }
    // A chunk not painted yet is drawn as flat tile colours from its data, so there are never holes.
    function flat(ctx, ix, iy) {
      for (let ty = iy * IMG; ty < iy * IMG + IMG; ty++) for (let tx = ix * IMG; tx < ix * IMG + IMG; tx++) {
        const cx = Math.floor(tx / CH), cy = Math.floor(ty / CH), data = world.peek(cx, cy);
        const lx = tx - cx * CH, ly = ty - cy * CH;
        ctx.fillStyle = css(data ? tileRGB(data.tiles[ly * CH + lx], W.regionOf(data, lx, ly)) : REGION_GROUND[0], 1);
        ctx.fillRect(tx * T, ty * T, T + 0.5, T + 0.5);
      }
    }

    // One pixel per tile, seen tiles only; redrawn when that chunk's fog changes.
    function renderMini(c, data, fogBits) {
      const g = c.getContext('2d');
      const img = g.createImageData(CH, CH), px = img.data;
      for (let ly = 0; ly < CH; ly++) for (let lx = 0; lx < CH; lx++) {
        const o4 = (ly * CH + lx) * 4;
        if (!F.has(fogBits, lx, ly)) { px[o4 + 3] = 0; continue; }
        const rgb = tileRGB(data.tiles[ly * CH + lx], W.regionOf(data, lx, ly));
        px[o4] = rgb[0]; px[o4 + 1] = rgb[1]; px[o4 + 2] = rgb[2]; px[o4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      renders++;
    }
    function mini(cx, cy, build) {
      const k = cx + ',' + cy;
      const fogBits = world.fogBits(cx, cy);
      if (!fogBits) return null;
      const st = world.fogStamp(k);
      let e = minis.get(k);
      if (e && e.stamp === st) { e.used = ++tick; return e.c; }
      const data = build ? world.dataFor(cx, cy) : world.peek(cx, cy);
      if (!data) { miniWant.add(k); return e ? e.c : null; }
      if (!e) { e = { c: makeCanvas(CH, CH), stamp: st, used: 0 }; minis.set(k, e); }
      renderMini(e.c, data, fogBits);
      e.stamp = st;
      e.used = ++tick;
      miniWant.delete(k);
      while (minis.size > MINI_CAP) {
        let oldest = null, oldestKey = null;
        for (const [mk, me] of minis) if (!oldest || me.used < oldest.used) { oldest = me; oldestKey = mk; }
        minis.delete(oldestKey);
      }
      return e.c;
    }
    // Builds queued mini images (far explored chunks the map wants) until the deadline, at least one per call.
    function workMinis(deadline) {
      let n = 0;
      for (const k of [...miniWant]) {
        if (n > 0 && now() >= deadline) break;
        miniWant.delete(k);
        const [cx, cy] = k.split(',').map(Number);
        mini(cx, cy, true);
        n++;
      }
      return n;
    }

    // Browser QA: a hash of a painted chunk's pixels proves a deleted chunk comes back identical.
    function chunkHash(ix, iy) {
      const e = images.get(ix + ',' + iy);
      if (!e) return null;
      const px = e.c.getContext('2d').getImageData(0, 0, PX, PX).data;
      let h = 2166136261;
      for (let i = 0; i < px.length; i++) h = Math.imul(h ^ px[i], 16777619);
      return (h >>> 0).toString(16).padStart(8, '0');
    }
    function stats() {
      const sorted = times.slice().sort((a, b) => a - b);
      return {
        images: images.size, cap: Math.max(cap, need), queue: queue.length, minis: minis.size, miniQueue: miniWant.size,
        renders, paintMedian: sorted.length ? sorted[sorted.length >> 1] : 0,
      };
    }
    return {
      retainView, work, drawGround, workMinis, chunkHash, stats,
      mini: (cx, cy) => mini(cx, cy, false),
      has: (ix, iy) => images.has(ix + ',' + iy),
      pending: () => queue.map(q => [q[0], q[1]]),
    };
  }

  // ---------- fog over the view ----------
  // Unseen tiles are covered; seen tiles outside your view radius are dimmed; tiles in view are clear.
  const FOG = '#120a0c';
  function drawFog(ctx, world, x0, y0, x1, y1, px, py, rad) {
    const tx0 = Math.floor(x0 / T), ty0 = Math.floor(y0 / T), tx1 = Math.floor(x1 / T), ty1 = Math.floor(y1 / T);
    ctx.fillStyle = FOG;
    for (let ty = ty0; ty <= ty1; ty++) {
      const ky = Math.floor(ty / CH), ly = ty - ky * CH;
      let run = null, kx = null, fogBits = null;
      for (let tx = tx0; tx <= tx1 + 1; tx++) {
        let hidden = false;
        if (tx <= tx1) {
          const cx = Math.floor(tx / CH);
          if (cx !== kx) { kx = cx; fogBits = world.fogBits(cx, ky); }
          hidden = !fogBits || !F.has(fogBits, tx - cx * CH, ly);
        }
        if (hidden && run === null) run = tx;
        else if (!hidden && run !== null) { ctx.fillRect(run * T, ty * T, (tx - run) * T, T + 0.5); run = null; }
      }
    }
    const g = ctx.createRadialGradient(px, py, Math.max(0, rad - T * 1.5), px, py, rad);
    g.addColorStop(0, 'rgba(10,6,8,0)');
    g.addColorStop(1, 'rgba(10,6,8,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  // ---------- sprites (moved from surface.js) ----------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // The two crack lines on an ice tile whose top-left corner is (X, Y) in world pixels, in the current stroke style:
  // the ice of the ground and the buried ice at the base look the same.
  function drawIceCracks(g, X, Y) {
    g.beginPath(); g.moveTo(X + 8, Y + 20); g.lineTo(X + 22, Y + 26); g.lineTo(X + 32, Y + 17); g.lineTo(X + 46, Y + 28); g.stroke();
    g.beginPath(); g.moveTo(X + 12, Y + 44); g.lineTo(X + 24, Y + 40); g.lineTo(X + 33, Y + 48); g.lineTo(X + 48, Y + 43); g.stroke();
  }

  function drawRock(ctx, d) {
    const cx = d.wx * T + T / 2 + (d.ox || 0), cy = d.wy * T + T / 2 + (d.oy || 0);
    const s = d.s;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 14 * s, 22 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4c3b37';
    ctx.beginPath(); ctx.ellipse(cx - 4 * s, cy + 4 * s, 20 * s, 14 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5e4a45';
    ctx.beginPath(); ctx.ellipse(cx + 10 * s, cy - 2 * s, 12 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6f5a54';
    ctx.beginPath(); ctx.ellipse(cx - 8 * s, cy - 1 * s, 7 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawLander(ctx, wx, wy) {
    const cx = wx * T + T / 2, cy = wy * T + T / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 22, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-18, 2); ctx.lineTo(-30, 22); ctx.moveTo(18, 2); ctx.lineTo(30, 22); ctx.moveTo(0, 6); ctx.lineTo(0, 22); ctx.stroke();
    ctx.fillStyle = '#c9c1b5';
    ctx.beginPath(); ctx.moveTo(-24, 4); ctx.lineTo(24, 4); ctx.lineTo(16, -14); ctx.lineTo(-16, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9aa7a';
    ctx.fillRect(-22, -2, 44, 5);
    ctx.fillStyle = '#86b8ea';
    ctx.fillRect(-12, -12, 7, 12); ctx.fillRect(5, -12, 7, 12);
    ctx.restore();
  }

  function badge(ctx, x, y, kind) {
    ctx.save();
    ctx.translate(x, y);
    if (kind === 'broken') {
      ctx.fillStyle = '#f46e5f';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a1214';
      ctx.fillRect(-1.5, -5.5, 3, 7); ctx.fillRect(-1.5, 3, 3, 2.6);
    } else {
      ctx.fillStyle = '#3a2e33';
      ctx.strokeStyle = '#9a877f';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f2b84f';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 1, 4.5, -Math.PI * 0.25, Math.PI * 1.25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 0); ctx.stroke();
    }
    ctx.restore();
  }

  // a: { x, y, dir, phase, moving, you, down, rover, working, color }. Name tags are queued in `tags`
  // and laid out by drawTags once every sprite is drawn.
  function drawAvatar(ctx, a, name, time, tags, roverImg) {
    const color = a.color || '#ccc';
    const x = a.x, y = a.y;
    const tag = (tx, ty, text, c, you) => { if (text) tags.push({ x: tx, y: ty, text, color: c, you }); };
    ctx.save();
    if (a.you) {
      const pulse = 0.55 + 0.45 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(140,188,236,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 12, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    if (a.rover) {
      if (roverImg) {
        ctx.save();
        if (a.dir === 'left') { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
        ctx.drawImage(roverImg, x - 34, y - 52, 68, 68);
        ctx.restore();
      }
      tag(x, y - 50, name, color, a.you);
      ctx.restore();
      return;
    }
    if (a.down) {
      ctx.translate(x, y - 6);
      ctx.fillStyle = '#e9e2d8';
      roundRect(ctx, -16, -6, 26, 12, 5); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-10, -6, 3, 12);
      ctx.fillStyle = '#f3eee7'; ctx.beginPath(); ctx.arc(14, 0, 8, 0, Math.PI * 2); ctx.fill();
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.fillStyle = `rgba(244,110,95,${0.6 + pulse * 0.4})`;
      ctx.fillRect(-2, -26, 4, 14); ctx.fillRect(-7, -21, 14, 4);
      ctx.restore();
      tag(x, y - 34, name, '#f46e5f', a.you);
      return;
    }
    const bob = a.moving ? Math.abs(Math.sin(a.phase)) * 2 : Math.sin(time * 2 + x) * 0.6;
    const swing = a.moving ? Math.sin(a.phase) * 4 : 0;
    // legs
    ctx.fillStyle = '#d6cec3';
    roundRect(ctx, x - 7, y - 11 + (swing > 0 ? 0 : 1), 6, 11 - (swing > 0 ? 0 : 1) + Math.max(0, swing * 0.3), 2); ctx.fill();
    roundRect(ctx, x + 1, y - 11 + (swing < 0 ? 0 : 1), 6, 11 - (swing < 0 ? 0 : 1) + Math.max(0, -swing * 0.3), 2); ctx.fill();
    ctx.fillStyle = '#6d6266';
    ctx.fillRect(x - 7, y - 2, 6, 2); ctx.fillRect(x + 1, y - 2, 6, 2);
    const by = y - 12 - bob;
    // backpack behind (visible from the sides and back)
    if (a.dir !== 'down') {
      ctx.fillStyle = '#9da3a9';
      const bx = a.dir === 'left' ? x + 4 : a.dir === 'right' ? x - 14 : x - 9;
      roundRect(ctx, bx, by - 18, a.dir === 'up' ? 18 : 10, 16, 3); ctx.fill();
    }
    // arms
    ctx.fillStyle = '#e1d9ce';
    roundRect(ctx, x - 13, by - 17 + swing * 0.5, 5, 12, 2.5); ctx.fill();
    roundRect(ctx, x + 8, by - 17 - swing * 0.5, 5, 12, 2.5); ctx.fill();
    // torso
    ctx.fillStyle = '#ece5db';
    roundRect(ctx, x - 9, by - 19, 18, 19, 5); ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x - 9, by - 9, 18, 3);
    if (a.dir === 'down') { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + 4, by - 14, 2.2, 0, Math.PI * 2); ctx.fill(); }
    // helmet
    const hy = by - 27;
    ctx.fillStyle = '#f4efe8';
    ctx.strokeStyle = '#b9afa4';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, hy, 10.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    roundRect(ctx, x - 3.5, hy - 12, 7, 3, 1.5); ctx.fill();
    if (a.dir !== 'up') {
      const ox = a.dir === 'left' ? -3 : a.dir === 'right' ? 3 : 0;
      const grad = ctx.createLinearGradient(x, hy - 6, x, hy + 6);
      grad.addColorStop(0, '#0e1a2b');
      grad.addColorStop(0.65, '#1f3c62');
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(x + ox, hy + 1, a.dir === 'down' ? 7.5 : 6, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x + ox - 1, hy, 4.5, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    }
    if (a.working) {
      const wob = Math.sin(time * 6) * 1.5;
      ctx.fillStyle = 'rgba(20,14,16,0.85)';
      ctx.beginPath(); ctx.arc(x + 15, hy - 14 + wob, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x + 15, hy - 14 + wob, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    tag(x, hy - 17, name, color, a.you);
  }

  // Name tags are laid out after all sprites so they never pile on top of each other.
  function drawTags(ctx, tags) {
    const placed = [];
    ctx.font = '600 10px "Be Vietnam Pro", system-ui, sans-serif';
    const list = tags.slice().sort((a, b) => (b.you - a.you) || (b.y - a.y));
    for (const tg of list) {
      const w = ctx.measureText(tg.text).width + 16;
      let y = tg.y;
      for (let i = 0; i < 6; i++) {
        const hit = placed.some(r => Math.abs(r.x - tg.x) < (r.w + w) / 2 + 2 && Math.abs(r.y - y) < 16);
        if (!hit) break;
        y -= 16;
      }
      placed.push({ x: tg.x, y, w });
      drawTag(ctx, tg.x, y, tg.text, tg.color, tg.you, w);
    }
    tags.length = 0;
  }

  function drawTag(ctx, x, y, text, color, you, w) {
    ctx.save();
    ctx.fillStyle = you ? 'rgba(140,188,236,0.92)' : 'rgba(20,14,16,0.78)';
    roundRect(ctx, x - w / 2, y - 14, w, 15, 7); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x - w / 2 + 7, y - 6.5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = you ? '#0c1a29' : '#f4e9df';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x - w / 2 + 12, y - 6.2);
    ctx.restore();
  }

  return {
    IMG, PX, REGION_COLORS, tileRGB, decorFor, createPainter, drawFog,
    sprites: { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks },
  };
});
