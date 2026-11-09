/*
 * SOL 500 — everything on the surface drawn with Canvas 2D:
 *   the ground, as 256-px image chunks (4×4 tiles) painted from the world data. Decor that crosses a chunk edge is
 *   replayed by every chunk it touches, clipped to itself, so there are no seams; painting is seeded from
 *   (seed, chunk), so a deleted chunk is repainted with exactly the same picture; cave mouths are part of the ground;
 *   the fog over the view; the minimap's one-pixel-per-tile "mini" images of explored chunks;
 *   and the sprites: astronauts, name tags, rocks, the lander, status badges, finds and dust devils.
 *
 * API: SolPaint.createPainter(world, { canvas, cap, now, scale }) → painter · SolPaint.drawFog(...) · SolPaint.decorFor(...)
 *      SolPaint.tileRGB(code, region) · SolPaint.REGION_COLORS · SolPaint.sprites
 *      SolPaint.scenery(chunks, { at, done, tube }) → the points of interest's sprites and decals (see there)
 *      SolPaint.tubeAt(chunks, at, under) → the lava tube you are inside, or null · SolPaint.drawDark(...): its headlamp's dark
 *      scale (default 1): the ground is painted at this many canvas pixels per world pixel, so each chunk image is scale·256 px
 *      square (the Display settings' Best level paints at 2); painter.setScale(s) changes it while playing.
 *      SolPaint.photoOf(code, region) → the NASA photo a ground is painted with (src/ground-photos.js), or null
 *      SolPaint.tileable(src, low, N, O, gain) → a photo made to repeat without a seam · painter.refresh(): repaint every chunk
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./worldgen.js'), require('./fog.js'), null);
  else root.SolPaint = factory(root.SolWorldgen, root.SolFog, root.SolGroundPhotos);
})(typeof self !== 'undefined' ? self : this, function (W, F, GP) {
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
  // The points of interest (M4c): a delta's pale layered sediment, an ice scarp's dusty top, a star dune's sunlit crest, a
  // lava tube's basalt floor and walls and the sunlit floor under its skylight, a hab pod's deck, and a Kestrel structure's
  // footprint in the programme's teal (the minimap's colour: the ground under its sprite is painted as the region's own).
  CODE_RGB[TL.SEDIMENT] = [150, 102, 74];
  CODE_RGB[TL.SCARP] = [176, 184, 188];
  CODE_RGB[TL.CREST] = [122, 82, 61];
  CODE_RGB[TL.TUBE_FLOOR] = [48, 37, 36];
  CODE_RGB[TL.TUBE_WALL] = [74, 58, 55];
  CODE_RGB[TL.SKYLIGHT] = [118, 82, 62];
  CODE_RGB[TL.STRUCT_FLOOR] = [106, 100, 96];
  CODE_RGB[TL.STRUCT_WALL] = [74, 151, 142];
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
  for (const k of ['CLIFF', 'RIM', 'CANYON_WALL', 'SCARP', 'TUBE_WALL']) RAISED[TL[k]] = 1;
  // A gentle brightness drift across the ground. It comes from smooth noise, so tiles never show as a checkerboard.
  const shade = (world, tx, ty) => 0.96 + 0.08 * W.noise(world.seed, 920, tx, ty, 5);

  // ---------- the ground's real NASA photos (src/ground-photos.js) ----------
  // Each ground is painted in its own colour as before, then a real photo over it: a little of the photo's colour, and all of
  // its light and dark as 'overlay' (so the ground keeps its colour on average), that detail twice: as cut, and turned 37° and
  // enlarged, so the repeat does not show. repeat: the world px one copy of the photo spans; gain: how strong its detail is;
  // tint: how much of its own colour shows. Bare ice, an ice scarp and a hab pod's deck have no photo. Until the photos are
  // ready (and always in Node), the ground is painted without them.
  const PHOTO = {
    flagstone: { repeat: 300, gain: 1.7, tint: 0.30 }, // Jezero Crater's floor: the Plains and the base
    cobbles: { repeat: 280, gain: 1.5, tint: 0.30 },   // a field of rocks: the Crater Field, rims, ramps and cliffs
    sand: { repeat: 190, gain: 1.8, tint: 0.25 },      // windblown sand: the Dune Sea, sand and star dunes' crests
    dust: { repeat: 360, gain: 2.6, tint: 0.25 },      // fine dust: the Canyon Lands, crater and canyon floors, delta beds
    grains: { repeat: 200, gain: 0.9, tint: 0.20 },    // dark basalt grains: the Volcanic Flanks and lava tubes
    phoenix: { repeat: 300, gain: 1.5, tint: 0.25 },   // the polygon ground round the Phoenix lander: the Icy Plains
  };
  const REGION_PHOTO = ['flagstone', 'sand', 'cobbles', 'dust', 'phoenix', 'grains'];
  const CODE_PHOTO = [];
  for (const [k, p] of [['SAND', 'sand'], ['DUNE', 'sand'], ['CREST', 'sand'], ['CLIFF', 'cobbles'], ['RIM', 'cobbles'], ['RAMP', 'cobbles'],
    ['CRATER_FLOOR', 'dust'], ['CANYON_FLOOR', 'dust'], ['CANYON_WALL', 'dust'], ['SEDIMENT', 'dust'], ['SKYLIGHT', 'dust'],
    ['POLYGON', 'phoenix'], ['LAVA', 'grains'], ['TUBE_FLOOR', 'grains'], ['TUBE_WALL', 'grains'], ['BASE', 'flagstone']]) CODE_PHOTO[TL[k]] = p;
  function photoOf(code, region) {
    if (code === TL.BOULDER || code === TL.STRUCT_WALL) code = UNDER_BOULDER[region]; // painted as the ground they sit on
    if (code === TL.REGOLITH) return REGION_PHOTO[region] || REGION_PHOTO[0];
    return CODE_PHOTO[code] || null;
  }

  // A photo made to repeat without a seam. src: its pixels (RGBA, S×S with S = N + O); low: the same picture blurred down to
  // its lighting. The lighting is divided out (so one side is not darker than the other), then the first O columns and rows
  // are cross-faded with the ones N further on, so the last pixel runs on into the first. Returns its colour and its detail,
  // both N×N RGBA; the detail is grey, 128 + (brightness − the mean) × gain, a little stronger where the fade flattened it.
  const smooth = t => t * t * (3 - 2 * t);
  function tileable(src, low, N, O, gain) {
    const S = N + O, mean = [0, 0, 0];
    for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) mean[k] += src[i * 4 + k] / (S * S);
    const flat = new Float32Array(S * S * 3);
    for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) flat[i * 3 + k] = src[i * 4 + k] * mean[k] / Math.max(8, low[i * 4 + k]);
    const fade = v => (v < O ? smooth(v / O) : 1); // the weight of the pixel itself; the rest comes from the one N further on
    const cols = new Float32Array(N * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < N; x++) {
      const w = fade(x);
      for (let k = 0; k < 3; k++) cols[(y * N + x) * 3 + k] = flat[(y * S + x) * 3 + k] * w + (w < 1 ? flat[(y * S + x + N) * 3 + k] * (1 - w) : 0);
    }
    const out = new Float32Array(N * N * 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const w = fade(y);
      for (let k = 0; k < 3; k++) out[(y * N + x) * 3 + k] = cols[(y * N + x) * 3 + k] * w + (w < 1 ? cols[((y + N) * N + x) * 3 + k] * (1 - w) : 0);
    }
    const light = i => 0.3 * out[i * 3] + 0.59 * out[i * 3 + 1] + 0.11 * out[i * 3 + 2];
    let meanL = 0;
    for (let i = 0; i < N * N; i++) meanL += light(i) / (N * N);
    const col = new Uint8ClampedArray(N * N * 4), lum = new Uint8ClampedArray(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, boost = 1 + 0.35 * (1 - 2 * Math.min(Math.abs(fade(x) - 0.5), Math.abs(fade(y) - 0.5)));
      for (let k = 0; k < 3; k++) col[i * 4 + k] = out[i * 3 + k];
      lum[i * 4] = lum[i * 4 + 1] = lum[i * 4 + 2] = 128 + (light(i) - meanL) * gain * boost;
      col[i * 4 + 3] = lum[i * 4 + 3] = 255;
    }
    return { col, lum };
  }

  // The photos once decoded and made seamless, { name: { col: [pattern] or null, lum: [as cut, turned] } }; null until all are.
  // They start loading as soon as this file runs in a browser, one photo a task so no frame waits long; a photo that fails
  // leaves its grounds plain. The painters made meanwhile are refreshed when they arrive.
  let photos = null;
  const photosWanted = [];
  function photoPatterns(px, N, repeat) {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.putImageData(new ImageData(px, N, N), 0, 0);
    const a = g.createPattern(c, 'repeat'), b = g.createPattern(c, 'repeat'), k = repeat / N;
    a.setTransform(new DOMMatrix().scaleSelf(k));
    b.setTransform(new DOMMatrix().rotateSelf(37).scaleSelf(k * 1.73));
    return [a, b];
  }
  // The photos are made seamless when the page is idle, so a frame never waits for it (the generator of src/ground-photos.js is not
  // in the repository, so they are not shipped seamless); without requestIdleCallback, a short timer.
  const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 50));
  function loadPhotos(urls) {
    const N = 512, O = 112, S = N + O, names = Object.keys(PHOTO).filter(n => urls[n]), out = {};
    const next = i => {
      if (i === names.length) { photos = out; photosWanted.splice(0).forEach(fn => fn()); return; }
      const name = names[i], p = PHOTO[name], img = new Image(), go = () => setTimeout(() => next(i + 1), 0);
      img.onload = () => idle(() => {
        try {
          const c = document.createElement('canvas'), tiny = document.createElement('canvas');
          c.width = c.height = S;
          tiny.width = tiny.height = 5;
          const g = c.getContext('2d', { willReadFrequently: true }), tg = tiny.getContext('2d');
          g.drawImage(img, 0, 0, S, S);
          const src = g.getImageData(0, 0, S, S).data;
          tg.imageSmoothingQuality = g.imageSmoothingQuality = 'high';
          tg.drawImage(c, 0, 0, 5, 5);
          g.drawImage(tiny, 0, 0, S, S); // the photo's lighting: shrunk to 5×5 and blown back up
          const t = tileable(src, g.getImageData(0, 0, S, S).data, N, O, p.gain);
          out[name] = { col: p.tint ? photoPatterns(t.col, N, p.repeat) : null, lum: photoPatterns(t.lum, N, p.repeat) };
        } catch (e) { /* this photo's grounds stay plain */ }
        go();
      });
      img.onerror = go;
      img.src = urls[name];
    };
    next(0);
  }
  if (GP && typeof document !== 'undefined' && typeof Image === 'function') loadPhotos(GP);
  // Lays a ground's photo over the colour already painted there.
  function photoOver(g, name, x, y, w, h) {
    const p = photos && name && photos[name];
    if (!p) return;
    if (p.col) { g.globalAlpha = PHOTO[name].tint; g.fillStyle = p.col[0]; g.fillRect(x, y, w, h); }
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 1; g.fillStyle = p.lum[0]; g.fillRect(x, y, w, h);
    g.globalAlpha = 0.45; g.fillStyle = p.lum[1]; g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ---------- one tile of ground ----------
  // The ground a boulder or a Kestrel structure's footprint stands on: the most of its eight neighbours that are open ground
  // (the first found on a tie), so it never shows as a square of another ground; its region's usual ground when it has none.
  const NOT_AROUND = new Uint8Array(32);
  for (const k of ['BOULDER', 'STRUCT_WALL', 'STRUCT_FLOOR', 'BASE', 'CLIFF', 'RIM', 'CANYON_WALL', 'SCARP', 'TUBE_WALL']) NOT_AROUND[TL[k]] = 1;
  function groundRound(world, tx, ty, reg) {
    const n = new Uint8Array(32);
    let best = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = dx || dy ? world.tile(tx + dx, ty + dy) : TL.BOULDER;
      if (NOT_AROUND[c]) continue;
      if (++n[c] > (best < 0 ? 0 : n[best])) best = c;
    }
    return best < 0 ? UNDER_BOULDER[reg] : best;
  }
  function paintTile(g, world, tx, ty) {
    const code = world.tile(tx, ty);
    if (RAISED[code]) return; // painted after the decor, in paintRaised
    const reg = world.region(tx, ty);
    const h = W.hash(world.seed, tx, ty, 900);
    const X = tx * T, Y = ty * T;
    // A boulder is drawn on the ground round it (the rock goes on top in paintRaised), and so is a Kestrel structure's
    // footprint (the surface draws its sprite on top).
    const look = code === TL.BOULDER || code === TL.STRUCT_WALL ? groundRound(world, tx, ty, reg) : code;
    g.fillStyle = css(tileRGB(look, reg), shade(world, tx, ty));
    g.fillRect(X, Y, T, T);
    photoOver(g, photoOf(look, reg), X, Y, T, T);
    if (look === TL.DUNE || look === TL.CREST) { // ripples across the wind; the ends line up with the next tile's, so they run on unbroken
      g.strokeStyle = look === TL.CREST ? 'rgba(92,60,46,0.35)' : 'rgba(140,96,74,0.45)'; // on the sunlit crest they lie in shade
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
    } else if (look === TL.LAVA || look === TL.TUBE_FLOOR) {
      g.fillStyle = 'rgba(20,14,14,0.5)';
      for (let k = 0; k < 6; k++) { const v = W.hash(world.seed, tx, ty, 901 + k); g.fillRect(X + (v % 60), Y + ((v >>> 8) % 60), 2 + ((v >>> 16) % 3), 2 + ((v >>> 20) % 3)); }
    } else if (code === TL.CANYON_FLOOR) {
      g.fillStyle = 'rgba(190,120,80,0.16)';
      g.fillRect(X, Y + 18, T, 5);
      g.fillRect(X, Y + 44, T, 4);
    } else if (code === TL.CRATER_FLOOR) {
      g.fillStyle = 'rgba(30,10,6,0.12)';
      g.fillRect(X, Y, T, T);
    } else if (code === TL.SEDIMENT) { // a delta's beds: pale bands that run on from tile to tile across the fan
      g.fillStyle = 'rgba(236,196,156,0.16)';
      g.fillRect(X, Y + 10, T, 3);
      g.fillRect(X, Y + 30, T, 2);
      g.fillRect(X, Y + 49, T, 3);
    } else if (code === TL.STRUCT_FLOOR) { // a hab pod's deck: a plate a tile, split down the middle
      g.strokeStyle = 'rgba(30,24,24,0.4)';
      g.lineWidth = 2;
      g.strokeRect(X + 1, Y + 1, T - 2, T - 2);
      g.beginPath(); g.moveTo(X + T / 2, Y); g.lineTo(X + T / 2, Y + T); g.stroke();
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
    if (world.caveAt && world.caveAt(tx, ty)) { // the shade a cave throws out of its mouth (the arch is on the wall above)
      g.fillStyle = 'rgba(12,5,4,0.4)';
      g.beginPath(); g.ellipse(X + T / 2, Y + 3, 23, 10, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // Things that stand up (mesa cliffs, crater rims, canyon walls, ice scarps, lava tubes' walls, boulders) go on top of the decor.
  function paintRaised(g, world, tx, ty) {
    const code = world.tile(tx, ty);
    const X = tx * T, Y = ty * T;
    if (RAISED[code]) {
      const reg = world.region(tx, ty);
      g.fillStyle = css(tileRGB(code, reg), shade(world, tx, ty));
      g.fillRect(X, Y, T, T);
      photoOver(g, photoOf(code, reg), X, Y, T, T);
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
      } else if (code === TL.SCARP) { // a cliff of ice under a dusty top: a bright edge, its face clean blue ice with streaks
        if (above) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(X, Y, T, 3); }
        if (below) {
          g.fillStyle = '#6f9fb8';
          g.fillRect(X, Y + T - 30, T, 30);
          g.fillStyle = 'rgba(235,250,255,0.35)';
          for (const dx of [9, 30, 47]) g.fillRect(X + dx, Y + T - 28, 2, 20);
          g.fillStyle = 'rgba(10,30,45,0.35)';
          g.fillRect(X, Y + T - 6, T, 6);
        }
      } else { // a crater's rim, a canyon's wall, a lava tube's wall
        if (above) { g.fillStyle = code === TL.RIM ? 'rgba(255,214,170,0.22)' : 'rgba(255,214,170,0.12)'; g.fillRect(X, Y, T, 4); }
        if (below) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X, Y + T - 10, T, 10); }
      }
      if (below && world.caveAt && world.caveAt(tx, ty + 1)) drawCaveMouth(g, X, Y); // a cave opens at the foot of this face
    } else if (code === TL.BOULDER) {
      const h = W.hash(world.seed, tx, ty, 902);
      drawRock(g, { wx: tx, wy: ty, s: 0.7 + (h % 31) / 100, ox: ((h >>> 8) % 9) - 4, oy: ((h >>> 12) % 7) - 3 });
    }
  }

  // A cave's mouth: a dark arch at the foot of the wall tile whose corner is (X, Y), with a lit rim and a few fallen stones.
  function drawCaveMouth(g, X, Y) {
    const cx = X + T / 2, base = Y + T;
    g.fillStyle = '#140a08';
    g.beginPath(); g.moveTo(cx - 19, base); g.bezierCurveTo(cx - 19, base - 31, cx + 19, base - 31, cx + 19, base); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,214,170,0.3)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 22, base); g.bezierCurveTo(cx - 22, base - 35, cx + 22, base - 35, cx + 22, base); g.stroke();
    g.fillStyle = '#6a4434';
    for (const [dx, w] of [[-27, 6], [21, 5], [-16, 3], [13, 3]]) g.fillRect(cx + dx, base - 4, w, 3);
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

  // The world's decor props (src/worldgen.js, M4c: whole tiles, the kinds above plus `rock`) on the tiles of image chunk
  // (ix, iy) and the ring round it, whose flat ones can spill in. None without the world's data chunks (a fake world).
  function propsNear(world, ix, iy) {
    if (!world.get) return [];
    const x0 = ix * IMG - 1, y0 = iy * IMG - 1, x1 = x0 + IMG + 1, y1 = y0 + IMG + 1, out = [];
    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
      for (const p of world.get(cx, cy).props) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(p);
    }
    return out;
  }

  function paintChunk(world, ix, iy, canvas, scale) {
    const g = canvas.getContext('2d');
    const tx0 = ix * IMG, ty0 = iy * IMG, props = propsNear(world, ix, iy);
    g.setTransform(scale, 0, 0, scale, -ix * PX * scale, -iy * PX * scale); // draw in world pixels, `scale` canvas pixels each
    for (let ty = ty0; ty < ty0 + IMG; ty++) for (let tx = tx0; tx < tx0 + IMG; tx++) paintTile(g, world, tx, ty);
    g.save();
    g.beginPath();
    g.rect(ix * PX, iy * PX, PX, PX);
    g.clip();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const d of decorFor(world, ix + dx, iy + dy)) drawDecor(g, d);
    for (const p of props) {
      if (p.kind === 'rock') continue;
      const h = W.hash(world.seed, p.x, p.y, 912);
      drawDecor(g, { kind: p.kind, x: p.x * T + T / 2, y: p.y * T + T / 2, s: 8 + ((h >>> 20) % 28), h });
    }
    g.restore();
    for (let ty = ty0; ty < ty0 + IMG; ty++) for (let tx = tx0; tx < tx0 + IMG; tx++) paintRaised(g, world, tx, ty);
    for (const p of props) { // a small rock stands up, as a boulder does; it stays inside its tile
      if (p.kind !== 'rock' || p.x < tx0 || p.x >= tx0 + IMG || p.y < ty0 || p.y >= ty0 + IMG) continue;
      const h = W.hash(world.seed, p.x, p.y, 912);
      drawRock(g, { wx: p.x, wy: p.y, s: 0.4 + (h % 16) / 100, ox: ((h >>> 8) % 9) - 4, oy: ((h >>> 12) % 7) - 3 });
    }
  }

  // ---------- the painter: image chunks and mini images, with their caches ----------
  function createPainter(world, opts) {
    const o = opts || {};
    const makeCanvas = o.canvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
    const now = o.now || (() => performance.now());
    const cap = o.cap || CAP;
    const images = new Map(); // "ix,iy" → { c, ix, iy, used, stale } (stale: drawn until it is repainted)
    const minis = new Map();  // "cx,cy" → { c, stamp, used }
    const miniWant = new Set();
    const times = [];
    let queue = [], view = null, need = 0, tick = 0, frameTick = 0, renders = 0, scale = o.scale || 1;

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
    // The chunks of the view (and its margin) that have no image yet or a stale one, the ones nearest the middle first.
    const fresh = k => { const e = images.get(k); return !!e && !e.stale; };
    function wanted() {
      const [a, b, c, d] = view, mx = (a + c) / 2, my = (b + d) / 2, want = [];
      for (let iy = b; iy <= d; iy++) for (let ix = a; ix <= c; ix++) {
        if (!fresh(ix + ',' + iy)) want.push([ix, iy, (ix - mx) * (ix - mx) + (iy - my) * (iy - my)]);
      }
      return want.sort((p, q) => p[2] - q[2]);
    }
    function retainView(x0, y0, x1, y1) {
      const a = Math.floor(x0 / PX) - 1, b = Math.floor(y0 / PX) - 1, c = Math.floor(x1 / PX) + 1, d = Math.floor(y1 / PX) + 1;
      view = [a, b, c, d];
      need = (c - a + 1) * (d - b + 1);
      for (const [k, e] of images) if (e.ix < a - 1 || e.ix > c + 1 || e.iy < b - 1 || e.iy > d + 1) images.delete(k);
      queue = wanted();
      evictImages();
    }
    // The graphics level changed, so every image is the wrong size: drop them all and queue the view again at the new scale.
    // Until a chunk is repainted, flat() covers it.
    function setScale(s) {
      if (s === scale) return;
      scale = s;
      images.clear();
      queue = view ? wanted() : [];
    }
    // The NASA photos arrived: every chunk is repainted with them, each one still drawn as it was until then.
    function refresh() {
      for (const e of images.values()) e.stale = true;
      queue = view ? wanted() : [];
    }
    if (!photos && GP && typeof document !== 'undefined') photosWanted.push(refresh);
    // Paints queued chunks until the deadline (but at least `atLeast` of them); returns how many it painted.
    function work(deadline, atLeast) {
      let n = 0;
      while (queue.length && (n < (atLeast || 0) || now() < deadline)) {
        const [ix, iy] = queue.shift();
        const k = ix + ',' + iy;
        if (fresh(k)) continue;
        const t0 = now();
        const c = makeCanvas(PX * scale, PX * scale);
        paintChunk(world, ix, iy, c, scale);
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
          ctx.drawImage(e.c, 0, 0, PX * scale, PX * scale, ix * PX, iy * PX, PX + 1, PX + 1);
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
        for (const [mk, me] of minis) if (me.used <= frameTick && (!oldest || me.used < oldest.used)) { oldest = me; oldestKey = mk; } // never one drawn this frame
        if (!oldestKey) break;
        minis.delete(oldestKey);
      }
      return e.c;
    }
    // Builds queued mini images (far explored chunks the map wants) until the deadline, at least one per call.
    function workMinis(deadline) {
      frameTick = tick; // the map's frame starts here: a mini used from now on stays
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
      const px = e.c.getContext('2d').getImageData(0, 0, e.c.width, e.c.height).data; // the whole image, whatever its scale
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
      retainView, setScale, refresh, work, drawGround, workMinis, chunkHash, stats,
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

  // ---------- the points of interest (M4c) ----------
  // What the surface draws over the ground for the points of interest in `chunks` (the data chunks round the view), each
  // once: a landmark is listed by every chunk its box touches, a structure by every chunk its apron touches. An item is
  // { art, id, opts, x, y, w, h, depth }: the SolArt drawing (kestrel, formation, prop, or 'puff', the vent's puff), the
  // box it fills in tiles, and the world-pixel y it is sorted by among the sprites, or null for a decal flat on the
  // ground, drawn under every sprite. o: { at: [tx, ty] the tile you stand on, done(id): that structure is used or repaired,
  // tube: the lava tube you are inside (tubeAt), or none }.
  const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  const feet = b => (b[3] + 1) * T - 6; // the bottom of a box's last row, where a module's feet are sorted too
  // The lava tube you are inside: the one whose box holds the tile you stand on, when that tile (`under`) is its floor or
  // its skylight. Its open ring and its walls are outside (the walls can't be stood on).
  function tubeAt(chunks, at, under) {
    if (under !== TL.TUBE_FLOOR && under !== TL.SKYLIGHT) return null;
    for (const c of chunks) for (const l of c.landmarks) if (l.kind === 'tube' && inBox(l.box, at[0], at[1])) return l;
    return null;
  }
  function scenery(chunks, o) {
    const out = [], seen = new Set(), [ax, ay] = o.at;
    const once = id => !seen.has(id) && !!seen.add(id);
    for (const c of chunks) {
      // A structure is a square as wide as its footprint, standing on the footprint's bottom edge. The hab pod is its room
      // while you stand inside its box, sorted by its top edge so whoever is in there is drawn over it; its roof otherwise.
      for (const s of c.structures) {
        if (!once(s.id)) continue;
        const b = s.box, w = b[2] - b[0] + 1, inside = s.kind === 'pod' && inBox(b, ax, ay);
        const opts = s.kind === 'pod' ? { inside } : { done: !!o.done(s.id) };
        out.push({ art: 'kestrel', id: s.kind, opts, x: b[0], y: b[3] + 1 - w, w, h: w, depth: inside ? b[1] * T : feet(b) });
      }
      // A formation fills its square; the dust-devil tracks are dark lanes on the ground.
      for (const f of c.formations) {
        const b = f.box, n = b[2] - b[0] + 1;
        out.push({ art: 'formation', id: f.kind, opts: null, x: b[0], y: b[1], w: n, h: n, depth: f.kind === 'deviltracks' ? null : feet(b) });
      }
      // The methane vent is a low mound on its survey's tile, its puff rising from it. A lava tube's roof covers its walls and
      // floor (its box but the open ring round it), with the skylight's pit on it, while you are outside; inside, both hide.
      for (const l of c.landmarks) {
        if (!once(l.id)) continue;
        if (l.kind === 'methane') {
          const at = { x: l.x - 0.5, y: l.y - 1, w: 2, h: 2 };
          out.push(Object.assign({ art: 'prop', id: 'vent', opts: null, depth: null }, at));
          out.push(Object.assign({ art: 'puff', id: 'vent', opts: null, depth: (l.y + 1) * T - 6 }, at));
        } else if (l.kind === 'tube' && !(o.tube && o.tube.id === l.id)) {
          const r = [l.box[0] + 1, l.box[1] + 1, l.box[2] - 1, l.box[3] - 1];
          out.push({ art: 'roof', id: l.id, opts: null, x: r[0], y: r[1], w: r[2] - r[0] + 1, h: r[3] - r[1] + 1, depth: feet(r) });
          out.push({ art: 'prop', id: 'skylight', opts: null, x: l.skylight[0] - 0.5, y: l.skylight[1] - 0.5, w: 2, h: 2, depth: feet(r) + 1 });
        }
      }
    }
    return out;
  }
  // A lava tube's roof (scenery's item: its box in tiles): a long ridge of basalt, lit along its top, its south face in shade.
  function drawRoof(ctx, it) {
    const X = it.x * T, Y = it.y * T, w = it.w * T, h = it.h * T;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; roundRect(ctx, X - 2, Y + 10, w + 4, h, 18); ctx.fill(); // its shadow on the ground
    ctx.fillStyle = '#4e3c39'; roundRect(ctx, X, Y, w, h, 16); ctx.fill();
    ctx.fillStyle = '#35282a'; roundRect(ctx, X, Y + h - 24, w, 24, 10); ctx.fill(); // the south face
    ctx.fillStyle = 'rgba(255,214,170,0.14)'; roundRect(ctx, X + 8, Y + 5, w - 16, 7, 3); ctx.fill(); // the lit top
  }
  // Inside a lava tube it is dark but for your headlamp: clear round you (px, py), nearly black from `rad` world pixels out.
  function drawDark(ctx, x0, y0, x1, y1, px, py, rad) {
    const r = rad * 0.6; // a pool of light: nearly black at 60 % of the headlamp's reach (M5: the old fall-off never got dark)
    const g = ctx.createRadialGradient(px, py, r * 0.25, px, py, r);
    g.addColorStop(0, 'rgba(5,3,4,0)');
    g.addColorStop(1, 'rgba(5,3,4,0.97)');
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

  // a: { x, y, dir, phase, moving, you, down, rover, working, color, bar }. Name tags are queued in `tags`
  // and laid out by drawTags once every sprite is drawn; `bar` (0–1, a teammate's suit level) rides on top of the tag.
  // The rover (2026-11-03, the science rover the user picked): seen from above, 128 px (2 tiles) long, nose along its
  // heading (radians, 0 = east), so it turns to any angle. (x, y) is its middle; odo (px driven) rolls its treads; moving
  // lights its headlights; color is the stripe, the driver's crew colour (null when parked: the programme's orange).
  const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  function roverWheel(ctx, x, y, odo) {
    ctx.fillStyle = '#262122';
    roundRect(ctx, x - 14, y - 7.5, 28, 15, 5); ctx.fill();
    ctx.save();
    roundRect(ctx, x - 14, y - 7.5, 28, 15, 5); ctx.clip();
    const off = ((odo % 6) + 6) % 6;
    ctx.strokeStyle = 'rgba(120,110,105,.6)'; ctx.lineWidth = 2;
    for (let k = -20; k < 20; k += 6) { ctx.beginPath(); ctx.moveTo(x + k - off, y - 7.5); ctx.lineTo(x + k - off, y + 7.5); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    roundRect(ctx, x - 12, y - 6.5, 24, 3, 2); ctx.fill();
  }
  function drawRoverTop(ctx, x, y, heading, odo, moving, color) {
    ctx.save(); // its shadow, thrown south-east by the low sun, like the rocks': a soft edge from two layers (a blur filter costs a layer a frame)
    ctx.translate(x + 9, y + 11); ctx.rotate(heading);
    ctx.fillStyle = 'rgba(10,4,2,.2)'; roundRect(ctx, -64, -46, 128, 92, 18); ctx.fill();
    ctx.fillStyle = 'rgba(10,4,2,.3)'; roundRect(ctx, -58, -40, 116, 80, 14); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(x, y); ctx.rotate(heading);
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#8f9399'; ctx.lineWidth = 4; ctx.lineCap = 'round'; // the rocker-bogie arms
      ctx.beginPath(); ctx.moveTo(-46, s * 37); ctx.lineTo(-20, s * 27); ctx.lineTo(0, s * 37); ctx.moveTo(-20, s * 27); ctx.lineTo(18, s * 27); ctx.lineTo(46, s * 37); ctx.stroke();
      for (const wx of [-46, 0, 46]) roverWheel(ctx, wx, s * 39, odo);
    }
    ctx.fillStyle = '#55595f'; roundRect(ctx, -72, -13, 26, 26, 6); ctx.fill(); // the power unit, finned
    ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 2;
    for (let k = -10; k <= 10; k += 5) { ctx.beginPath(); ctx.moveTo(-72, k); ctx.lineTo(-46, k); ctx.stroke(); }
    const body = ctx.createLinearGradient(-44, -28, 44, 28);
    body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#bfc3c8');
    ctx.fillStyle = body; roundRect(ctx, -44, -28, 92, 56, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(80,85,92,.45)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -28); ctx.lineTo(-10, 28); ctx.moveTo(22, -28); ctx.lineTo(22, 28); ctx.stroke();
    ctx.fillStyle = '#c99a3c'; roundRect(ctx, -6, -20, 24, 16, 3); ctx.fill(); // gold foil
    ctx.fillStyle = color || '#ff9a5c'; roundRect(ctx, -44, -28, 92, 5, 3); ctx.fill(); // the crew stripe
    ctx.fillStyle = '#e9eaec'; ctx.strokeStyle = '#8f9399'; ctx.lineWidth = 1.5; // the dish
    ctx.beginPath(); ctx.arc(-26, 14, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); for (let k = 0; k < 6; k++) { ctx.moveTo(-26, 14); ctx.lineTo(-26 + Math.cos(k) * 11, 14 + Math.sin(k) * 11); } ctx.stroke();
    ctx.strokeStyle = '#7d8187'; ctx.lineWidth = 3.5; // the arm, folded
    ctx.beginPath(); ctx.moveTo(40, 18); ctx.lineTo(58, 10); ctx.lineTo(56, -2); ctx.stroke();
    ctx.fillStyle = '#55595f'; ctx.beginPath(); ctx.arc(56, -2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d6d8db'; ctx.beginPath(); ctx.arc(30, -14, 7, 0, Math.PI * 2); ctx.fill(); // the mast and its cameras
    ctx.fillStyle = '#2a2e35'; roundRect(ctx, 30, -22, 15, 16, 3); ctx.fill();
    ctx.fillStyle = '#5fa8ff';
    for (const yy of [-18, -10]) { ctx.beginPath(); ctx.arc(43, yy, 2.2, 0, Math.PI * 2); ctx.fill(); }
    for (const s of [-1, 1]) { // the headlights, and their beams on the ground while it drives
      if (moving) {
        const beam = ctx.createRadialGradient(47, s * 16, 4, 47, s * 16, 120);
        beam.addColorStop(0, 'rgba(255,240,200,.3)'); beam.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(47, s * 16); ctx.arc(47, s * 16, 120, -0.35, 0.35); ctx.fill();
      }
      ctx.fillStyle = '#fff4cf'; ctx.beginPath(); ctx.arc(47, s * 16, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawAvatar(ctx, a, name, time, tags) {
    const color = a.color || '#ccc';
    const x = a.x, y = a.y;
    const tag = (tx, ty, text, c, you) => { if (text) tags.push({ x: tx, y: ty, text, color: c, you, bar: a.bar == null ? null : a.bar }); };
    if (a.rover) { // in the rover: the rover is all that shows, its middle a little above where the driver stands
      drawRoverTop(ctx, x, y - 10, a.heading == null ? DIR_ANGLE[a.dir] || 0 : a.heading, a.odo || 0, !!a.moving, color);
      tag(x, y - 78, name, color, a.you);
      return;
    }
    ctx.save();
    if (a.you) {
      const pulse = 0.55 + 0.45 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(140,188,236,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 12, 4.5, 0, 0, Math.PI * 2); ctx.fill();
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

  // ---------- finds (spec §3.1) ----------
  // A find on its tile, (cx, cy) = the tile's centre in world pixels; `time` makes the science flag wave.
  const FIND_GLOW = { ice: '159,211,234', metal: '217,180,106', pod: '236,229,219', science: '111,168,255' };
  function drawFind(ctx, f, cx, cy, time) {
    ctx.save();
    // A soft glow that breathes, so a find stands out from the rocks around it.
    ctx.fillStyle = 'rgba(' + FIND_GLOW[f.kind] + ',' + (0.14 + 0.08 * Math.sin(time * 2.5 + f.x)).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(cx, cy + 12, 28, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 14, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
    if (f.kind === 'ice') { // pale blue crystals on a frosty patch
      ctx.fillStyle = 'rgba(225,243,250,0.35)';
      ctx.beginPath(); ctx.ellipse(cx, cy + 10, 24, 9, 0, 0, Math.PI * 2); ctx.fill();
      for (const [dx, h, w] of [[-10, 18, 8], [2, 26, 10], [12, 15, 7]]) {
        ctx.fillStyle = '#9fd3ea';
        ctx.beginPath(); ctx.moveTo(cx + dx - w / 2, cy + 12); ctx.lineTo(cx + dx, cy + 12 - h); ctx.lineTo(cx + dx + w / 2, cy + 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.moveTo(cx + dx - 1, cy + 10); ctx.lineTo(cx + dx, cy + 14 - h); ctx.lineTo(cx + dx + 1.5, cy + 10); ctx.closePath(); ctx.fill();
      }
    } else if (f.kind === 'metal') { // a dark rock with bright metal grains
      ctx.fillStyle = '#3b3433';
      ctx.beginPath(); ctx.ellipse(cx - 3, cy + 4, 18, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4d4544';
      ctx.beginPath(); ctx.ellipse(cx + 8, cy, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9b46a';
      for (const [dx, dy] of [[-9, 0], [-2, 7], [6, -3], [11, 3], [-12, 8]]) ctx.fillRect(cx + dx, cy + dy, 3, 2);
      ctx.fillStyle = '#c9d2da';
      for (const [dx, dy] of [[-5, -4], [3, 2], [9, -6]]) ctx.fillRect(cx + dx, cy + dy, 2, 2);
    } else if (f.kind === 'pod') { // a cargo pod on its side, with its torn parachute
      ctx.strokeStyle = '#e9874a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + 10, cy + 2); ctx.quadraticCurveTo(cx + 26, cy - 14, cx + 20, cy + 12); ctx.stroke();
      ctx.fillStyle = '#ece5db';
      roundRect(ctx, cx - 18, cy - 6, 30, 18, 8); ctx.fill();
      ctx.fillStyle = '#b8aea2';
      roundRect(ctx, cx - 18, cy + 6, 30, 6, 3); ctx.fill();
      ctx.fillStyle = '#e9874a';
      ctx.fillRect(cx - 6, cy - 6, 5, 18);
    } else { // a science site: an outcrop with a survey flag
      ctx.fillStyle = f.sub === 'meteorite' ? '#2c2a2e' : '#7a5442';
      ctx.beginPath(); ctx.ellipse(cx - 4, cy + 6, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
      if (f.sub === 'layered' || f.sub === 'delta') {
        ctx.strokeStyle = f.sub === 'delta' ? 'rgba(130,190,220,0.7)' : 'rgba(230,190,140,0.75)';
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(cx - 16, cy + 2 + k * 4); ctx.lineTo(cx + 8, cy + 3 + k * 4); ctx.stroke(); }
      } else if (f.sub === 'vent') {
        ctx.fillStyle = 'rgba(235,225,215,0.35)';
        const w = Math.sin(time * 2) * 2;
        ctx.beginPath(); ctx.ellipse(cx - 4 + w, cy - 6, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#d6cec3';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + 12, cy + 12); ctx.lineTo(cx + 12, cy - 22); ctx.stroke();
      ctx.fillStyle = '#6fa8ff';
      const wave = Math.sin(time * 3) * 2;
      ctx.beginPath(); ctx.moveTo(cx + 12, cy - 22); ctx.lineTo(cx + 26, cy - 18 + wave); ctx.lineTo(cx + 12, cy - 13); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // A load someone dropped when their suit ran out: a backpack with a red tag. (x, y) in world pixels.
  function drawDrop(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 8, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9da3a9';
    roundRect(ctx, x - 10, y - 12, 20, 20, 4); ctx.fill();
    ctx.fillStyle = '#7d848b';
    roundRect(ctx, x - 7, y - 4, 14, 8, 2); ctx.fill();
    ctx.fillStyle = '#f46e5f';
    ctx.fillRect(x + 6, y - 16, 5, 8);
    ctx.restore();
  }

  // A relay beacon (spec §3.8): a mast on three legs with the outpost's teal band and its light on top, which flashes once
  // every 2 s; `spent` (your refill there is used this round) leaves the light dark. (x, y) is its foot, in world pixels.
  function drawBeacon(ctx, x, y, time, spent) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8b9097';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 40); ctx.lineTo(x, y);
    ctx.moveTo(x, y - 14); ctx.lineTo(x - 10, y + 3);
    ctx.moveTo(x, y - 14); ctx.lineTo(x + 10, y + 3);
    ctx.stroke();
    ctx.fillStyle = '#4fd0c4';
    ctx.fillRect(x - 4, y - 30, 8, 5);
    const flash = spent ? 0 : Math.pow(Math.max(0, Math.sin(time * Math.PI)), 8);
    if (flash > 0.02) {
      ctx.fillStyle = 'rgba(255,207,122,' + (0.45 * flash).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y - 43, 11, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = spent ? '#5d5355' : '#ffcf7a';
    ctx.beginPath(); ctx.arc(x, y - 43, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // A ping (spec §3.5) on the ground: a ring that opens out from the spot every 1.5 s round a pin, in the sender's colour,
  // with their name over it; `fade` (1 new, 0 gone) dims it all. (x, y) is the spot, in world pixels; `age` its seconds.
  function drawPing(ctx, x, y, color, name, fade, age) {
    const a = Math.max(0, Math.min(1, fade)), k = (age % 1.5) / 1.5;
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a * (1 - k);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y, 10 + 30 * k, 5 + 15 * k, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(20,14,16,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 7, y - 16); ctx.arc(x, y - 18, 7, Math.PI * 0.8, Math.PI * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = '600 11px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeText(name, x, y - 30);
    ctx.fillText(name, x, y - 30);
    ctx.restore();
  }

  // How far a hold of E has got: a ring that fills clockwise. (x, y) is its centre in world pixels.
  function drawRing(ctx, x, y, frac) {
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,14,16,0.75)';
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#8cbcec';
    ctx.beginPath(); ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac))); ctx.stroke();
    ctx.restore();
  }

  // A dust devil (spec §3.4): a spinning funnel of dust over its shadow. (d.x, d.y) is where it touches the ground, in world
  // pixels; d.spin varies each devil's phase; `alpha` fades it in and out (and past the edge of your view).
  function drawDevil(ctx, d, time, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(d.x, d.y + 3, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
    const spin = time * 7 + d.spin;
    for (let k = 0; k < 8; k++) {
      const h = k / 7, y = d.y - 4 - h * 78, w = 7 + h * h * 26;
      const sway = Math.sin(spin * 0.35 + k * 0.7) * (2 + h * 7);
      ctx.fillStyle = 'rgba(201,142,98,' + (0.42 - h * 0.26).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(d.x + sway, y, w, 3 + h * 5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(232,190,150,0.75)'; // grit thrown round its foot
    for (let k = 0; k < 6; k++) {
      const a = spin + k * 1.05, r = 14 + (k % 3) * 5;
      ctx.fillRect(d.x + Math.cos(a) * r, d.y - 6 + Math.sin(a) * r * 0.35, 2, 2);
    }
    ctx.restore();
  }

  // A teammate's suit level: a small bar above their name tag, from green through amber to red.
  function drawSuitBar(ctx, x, y, frac) {
    const f = Math.max(0, Math.min(1, frac));
    ctx.save();
    ctx.fillStyle = 'rgba(20,14,16,0.8)';
    roundRect(ctx, x - 15, y, 30, 5, 2.5); ctx.fill();
    ctx.fillStyle = f > 0.4 ? '#4fd0c4' : f > 0.15 ? '#e9a13b' : '#f46e5f';
    roundRect(ctx, x - 15, y, 30 * f, 5, 2.5); ctx.fill();
    ctx.restore();
  }

  // Name tags are laid out after all sprites so they never pile on top of each other. A teammate's suit bar sits on top
  // of their tag (5 px and 2 px clear), so it counts as part of the tag and moves up with it when the tag is pushed up.
  function drawTags(ctx, tags) {
    const placed = [];
    ctx.font = '600 10px "Be Vietnam Pro", system-ui, sans-serif';
    const list = tags.slice().sort((a, b) => (b.you ? 1 : 0) - (a.you ? 1 : 0) || (b.y - a.y));
    for (const tg of list) {
      const w = ctx.measureText(tg.text).width + 16, up = tg.bar == null ? 0 : 7;
      let y = tg.y;
      for (let i = 0; i < 6; i++) { // a tag spans y - 14 - up to y + 1; two keep 1 px apart
        const hit = placed.some(r => Math.abs(r.x - tg.x) < (r.w + w) / 2 + 2 && y - 14 - up < r.y + 2 && r.y - 14 - r.up < y + 2);
        if (!hit) break;
        y -= 16 + up; // the tag's whole height, its suit bar too
      }
      placed.push({ x: tg.x, y, w, up });
      if (tg.bar != null) drawSuitBar(ctx, tg.x, y - 21, tg.bar);
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
    IMG, PX, REGION_COLORS, tileRGB, photoOf, tileable, decorFor, createPainter, drawFog, drawDark, scenery, tubeAt,
    sprites: { drawAvatar, drawRoverTop, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks, drawFind, drawDrop, drawBeacon, drawPing, drawRing, drawSuitBar, drawDevil, drawRoof },
  };
});
