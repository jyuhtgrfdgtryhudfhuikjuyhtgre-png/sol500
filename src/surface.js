/*
 * SOL 500 — the walkable surface: your astronaut walks around the outpost and out into the endless world, builds on
 * tiles, inspects and switches machines, drives the rover, and meets the rest of the crew, who walk to their jobs.
 * Canvas 2D + a small DOM overlay. It never changes the mission itself: every action goes through ui.js hooks,
 * so the surface and the mission console always show the same plan.
 * The world model is src/surface-world.js, the painting src/surface-paint.js, the minimap and map src/surface-map.js.
 *
 * API: SolSurface.mount(hooks) → element (persistent; re-attach it on every render)
 *      SolSurface.update({ mission, plan, forecast, controlId, canControl(id), crewName(id), t, lang, fog, clock, lastPos, gfx })
 *        clock: co-op only, the server's round clock { t: seconds, at: performance.now() / 1000 when it arrived }
 *        lastPos: { x, y } where your astronaut last stood this round (the solo save, or the co-op server), for a reload
 *        gfx: the Display settings { quality: 'best' | 'fast', fpsCap: 0 (Max) | 30 | 60, showFps }; a missing or unknown value is
 *          the default (Best, Max, no readout), and a new quality takes effect at once
 *      SolSurface.setRemote([{ crewId, x, y, dir, moving, rover, away }]) (away: that player's tab is gone; they still stand there)
 *      SolSurface.ping({ x, y, by }) a co-op ping from the server (world px; by: the sender's crew id)
 *      SolSurface.mergeFog({ "<cx>,<cy>": base64 }) · SolSurface.reset() (call when a new mission starts)
 * Hooks: queueBuild, cancelBuild, toggleModule, toggleScrap, setJob, openConsole, canAdvance, advance,
 *        sendPos(pos), reveal({ key: base64 }), enterRegion(regionId), reopenRegion(regionId),
 *        exp(type, payload, pos) → Promise of { ok } or { error } (exploring, see src/surface-eva.js),
 *        suit({ suit, driven, clock, at }) (every 2 s: what a solo save keeps),
 *        walk(from, to, dt) (about every 150 ms of the surface's clock: two samples of where you stood, { x, y, rover } in world
 *          px, and the seconds between them; solo counts the tiles walked from them, co-op's server from your positions),
 *        ping(x, y) → true when it went out to the co-op server (world px; solo has none, so the surface shows it itself)
 * Exploring on the map (finds, the suit, the backpack, the rover's battery, the dangers) is src/surface-eva.js.
 */
(function (root) {
  'use strict';
  const D = root.SolData, E = root.SolEngine, A = root.SolArt, W = root.SolWorldgen, SW = root.SolWorld, P = root.SolPaint, SM = root.SolMap, EV = root.SolEva, PH = root.SolPhysics;
  const { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks } = P.sprites;
  const T = 64;
  const BASE = W.BASE_RECT;
  const LANDER = [-6, -4];
  const SPEED = 150, SPRINT_X = 1.75, NPC_SPEED = 115; // the rover's top speed is src/physics.js's ROVER.top (390 px/s)
  const NOSE = 61; // px ahead of the drawn rover's middle (10 px above its feet): its front, kept out of walls so the drawn rover never drives into one
  const PUSH_TIME = 0.25; // seconds a dust devil's throw takes (a slide that stops at walls)
  const WALK_GAP = 0.15; // seconds between two walking samples (the walk hook), about co-op's position cadence (110 ms or more)
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const DEBUG = /[?&]debug=chunks\b/.test((root.location && root.location.search) || '');
  const tkey = (x, y) => x + ',' + y;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let S = null;

  // ---------- helpers ----------
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return function () {
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
    // The 9×5 build grid sits with its top-left at world tile (−4, −2), so the HQ is at (0, 0).
  const gridToWorld = (gx, gy) => [gx + BASE.x, gy + BASE.y];
  const worldToGrid = (wx, wy) => [wx - BASE.x, wy - BASE.y];
  const inGrid = (gx, gy) => gx >= 0 && gy >= 0 && gx < D.GRID.w && gy < D.GRID.h;
  const center = (wx, wy) => [wx * T + T / 2, wy * T + T / 2];

  function image(svg) {
    const img = new Image();
    const xml = svg.includes('xmlns=') ? svg : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    return img;
  }
  function moduleImage(type, clean) {
    const b = type === 'solar' ? Math.round((clean == null ? 1 : clean) * 10) / 10 : 1;
    const k = type + '|' + b;
    if (!S.images[k]) S.images[k] = image(A.module(type, 128, { clean: b }));
    return S.images[k];
  }
  function ready(img) { return img && img.complete && img.naturalWidth > 0; }

  // The points of interest in the live data chunks under the view, grown by 4 tiles for the sprites that stand up into it
  // (src/surface-paint.js scenery). A structure is done once the rules mark it used or repaired (m.expedition.structures).
  // S.tube is the lava tube you are inside, whose roof hides while the dark closes in round your headlamp.
  function pointsOfInterest(x0, y0, x1, y1, m) {
    const C = W.CHUNK * T, chunks = [], marked = (m.expedition && m.expedition.structures) || {};
    for (let cy = Math.floor((y0 - 4 * T) / C); cy <= Math.floor((y1 + 4 * T) / C); cy++) {
      for (let cx = Math.floor((x0 - 4 * T) / C); cx <= Math.floor((x1 + 4 * T) / C); cx++) { const c = S.world.peek(cx, cy); if (c) chunks.push(c); }
    }
    const at = [Math.floor(S.player.x / T), Math.floor(S.player.y / T)];
    S.tube = P.tubeAt(chunks, at, S.world.tile(at[0], at[1]));
    S.pois = P.scenery(chunks, { at, done: id => !!marked[id], tube: S.tube });
    return S.pois;
  }
  // One point of interest's SolArt drawing, made into an image once per look and size (the vent's puff: a 3 s loop in 24
  // steps); a lava tube's roof is drawn on the canvas.
  function drawArt(ctx, it) {
    if (it.art === 'roof') return P.sprites.drawRoof(ctx, it);
    const o = it.opts || {}, step = it.art === 'puff' ? Math.floor(S.time / 3 * 24) % 24 : 0;
    const k = it.art + '|' + it.id + '|' + (o.done ? 1 : 0) + (o.inside ? 1 : 0) + '|' + step + '|' + it.w;
    if (!S.images[k]) S.images[k] = image(it.art === 'puff' ? A.ventPuff(step / 24, it.w * 128) : A[it.art](it.id, it.w * 128, it.opts));
    if (ready(S.images[k])) ctx.drawImage(S.images[k], it.x * T, it.y * T, it.w * T, it.h * T);
  }

  // ---------- world model ----------
  // A mission (by its code) gets its own world, painter and fog; reset() forces a fresh one for a new mission.
  function world() {
    const m = S.data && S.data.mission;
    if (!m) return null;
    if (S.world && S.worldSeed === m.seed) return S.world;
    S.world = SW.create(m.seed);
    S.painter = P.createPainter(S.world, { scale: groundScale() });
    S.map.attach(S.world, S.painter);
    S.worldSeed = m.seed;
    S.world.reveal(0, 0, W.FLAT_RADIUS); // the crew knows their own base
    S.player = null;
    S.walk = null;
    S.npcs = {};
    S.region = null;
    S.seenAt = [NaN, NaN, 0];
    S.camSnap = true;
    refreshWorld(m);
    return S.world;
  }

  function reset() {
    if (!S) return;
    S.world = null;
    S.worldSeed = null;
    S.remote = {}; // the last room's players: this room's (if any) come with its next positions
    S.eva.reset(); // and the exploring layer: the old mission's suit, battery and collapse stay with it
  }

  // The base's own blockers (the HQ, the reactor, the lander, rocks on the build grid) and the grid lookups.
  function refreshWorld(m) {
    const blocked = [LANDER];
    for (const [gx, gy] of m.terrain.rock) blocked.push(gridToWorld(gx, gy));
    // Crews walk between the machines; only the HQ and the reactor (radiation) are solid.
    for (const tile of m.layout) if (tile.type === 'hab' || tile.type === 'reactor') blocked.push(gridToWorld(tile.x, tile.y));
    S.world.setOverlay(blocked);
    S.base = {
      ice: new Set(m.terrain.ice.map(([x, y]) => tkey(x, y))),
      gridRock: new Set(m.terrain.rock.map(([x, y]) => tkey(x, y))),
    };
  }

  const isBlocked = (wx, wy, rover) => S.world.isBlocked(wx, wy, rover); // rover: it drives over rocks and crater rims

  function hitsWall(x, y, rover) {
    const pts = [[x - 10, y - 6], [x + 10, y - 6], [x - 10, y + 4], [x + 10, y + 4]];
    return pts.some(([px, py]) => isBlocked(Math.floor(px / T), Math.floor(py / T), rover));
  }

  // Breadth-first search over world tiles inside a 64×64-tile box around the walker; returns tile-centre waypoints.
  function findPath(fromX, fromY, goalWx, goalWy, allowGoalBlocked, rover) {
    const steps = S.world.findPath(Math.floor(fromX / T), Math.floor(fromY / T), goalWx, goalWy, allowGoalBlocked, rover);
    return steps && steps.map(([x, y]) => center(x, y));
  }

  // On a route, a rover lets go once it needs all the road left to stop, so it stops at the end of it, not past it. Letting
  // go brakes with the wheels' full grip plus rolling resistance, a little more than PH.stopDistance counts: it stops short.
  function brakesNow(p, d) {
    let left = d;
    for (let i = 1; i < p.path.length; i++) left += Math.hypot(p.path[i][0] - p.path[i - 1][0], p.path[i][1] - p.path[i - 1][1]);
    return PH.stopDistance(p.car.speed) * PH.PX_PER_M * S.eva.speed(p) * S.qa.speed >= left - 8;
  }

  function spotNear(gx, gy, rnd) {
    const [wx, wy] = gx == null ? [0, 0] : gridToWorld(gx, gy);
    const options = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [wx + dx, wy + dy]).filter(([x, y]) => !isBlocked(x, y));
    if (!options.length) return null;
    const [x, y] = options[Math.floor(rnd() * options.length)];
    const [cx, cy] = center(x, y);
    return [cx + (rnd() - 0.5) * 20, cy + (rnd() - 0.5) * 14];
  }

  function spawnPoint() {
    const [hx, hy] = gridToWorld(D.GRID.hq[0], D.GRID.hq[1]);
    for (const [dx, dy] of [[0, 1], [1, 1], [-1, 1], [0, 2], [1, 0], [-1, 0], [2, 1], [-2, 1], [0, -1]]) {
      if (!isBlocked(hx + dx, hy + dy)) return center(hx + dx, hy + dy);
    }
    return center(hx, hy + 2);
  }

  // Your astronaut appears beside the HQ when a mission (or a fresh world) starts.
  function ensurePlayer() {
    if (S.player) return;
    const [x, y] = spawnPoint();
    S.player = { x, y, dir: 'down', phase: 0, moving: false, stamina: 100, path: null, inRover: false, crewId: S.data.controlId, car: null, odo: 0 };
    S.roverHeading = 0; // where the rover faces (0 = east), driven or parked: a new mission's waits at its bay facing east
    S.fx = { dust: [], tracks: {} }; // the rovers' dust and wheel tracks (roverFx)
  }

  // ---------- setup ----------
  function mount(hooks) {
    if (S) { S.hooks = hooks; return S.el; }
    const el = document.createElement('div');
    el.className = 'sf-root';
    const canvas = document.createElement('canvas');
    canvas.className = 'sf-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    const overlay = document.createElement('div');
    overlay.className = 'sf-overlay';
    el.append(canvas, overlay);
    S = {
      el, canvas, ctx: canvas.getContext('2d'), overlay, hooks,
      keys: new Set(), joy: { x: 0, y: 0, id: null }, sprintHeld: false,
      player: null, npcs: {}, remote: {}, images: {}, particles: [], tags: [],
      world: null, painter: null, map: null, base: null, worldSeed: null, data: null, focus: null, menuOpen: null,
      view: { w: 0, h: 0, zoom: 1, dpr: 1, camX: 0, camY: 0 }, time: 0, last: 0, fps: 60, camSnap: true,
      gfx: { quality: 'best', fpsCap: 0, showFps: false }, nextDraw: 0, fpsAt: -Infinity,
      lastSent: 0, lastSentKey: '', hintUntil: 14, touch: false,
      region: null, seenAt: [NaN, NaN, 0], fogSent: 0, debug: DEBUG, debugAt: 0, lang: null, qa: { ghost: false, speed: 1 }, pingAt: -Infinity, walk: null,
    };
    S.touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    S.map = SM.create({ t: (k, p) => t(k, p), onOpen: () => S.keys.clear(), onClose: () => S.canvas.focus({ preventScroll: true }), onPing: (x, y) => ping(x, y) });
    S.eva = EV.create({
      t: (k, p) => t(k, p), hooks: () => S.hooks, crewName: id => S.data.crewName(id), player: () => S.player, home: goHome,
      drawRover: (ctx, x, y) => P.sprites.drawRoverTop(ctx, x, y - 10, S.roverHeading || 0, 0, false, null), // parked, as it was left
      now: () => performance.now() / 1000,
      push: (dx, dy) => { if (S.player) S.player.push = { x: dx, y: dy, left: PUSH_TIME }; },
      team: () => team(),
    });
    buildOverlay();
    bindInput();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el);
    requestAnimationFrame(loop);
    // When the browser is idle, paint more of the ground than the frame budget allows.
    if (window.requestIdleCallback) {
      const idle = d => {
        if (S.painter && S.el.isConnected && !document.hidden) S.painter.work(performance.now() + Math.max(0, d.timeRemaining() - 1), 0);
        window.requestIdleCallback(idle, { timeout: 500 });
      };
      window.requestIdleCallback(idle, { timeout: 500 });
    }
    return el;
  }

  // The Display settings' graphics level: Best draws at the screen's own pixel ratio (up to 4) and paints the ground chunks at 2×
  // (and has more dust, see draw); Fast draws one canvas pixel to a CSS pixel and paints the ground at 1×.
  const groundScale = () => (S.gfx.quality === 'best' ? 2 : 1);
  function resize() {
    const r = S.el.getBoundingClientRect();
    const dpr = S.gfx.quality === 'fast' ? 1 : Math.min(4, window.devicePixelRatio || 1);
    S.view.w = r.width;
    S.view.h = r.height;
    S.view.dpr = dpr;
    S.view.zoom = clamp(r.width / (T * 10.5), 0.62, 1.55);
    S.canvas.width = Math.max(1, Math.round(r.width * dpr));
    S.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  function t(k, p) { return S.data ? S.data.t(k, p) : k; }
  // A number as the console writes it (ui.js's nf), d decimals: 1.5 in English, 1,5 in Vietnamese (R31).
  function nf(v, d) {
    return v.toLocaleString(S.data && S.data.lang === 'vi' ? 'vi-VN' : 'en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }
  const cost = spec => t('bld.cost', { kg: nf(spec.materials), w: nf(spec.work, spec.work % 1 ? 1 : 0) }); // as the console's build buttons

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildOverlay() {
    const o = S.overlay;
    S.hint = el('div', 'sf-hint');
    S.prompt = el('div', 'sf-prompt');
    S.prompt.hidden = true;
    S.menu = el('div', 'sf-menu');
    S.menu.hidden = true;
    S.menu.setAttribute('role', 'dialog');
    S.stamina = el('div', 'sf-stamina');
    S.staminaFill = el('span');
    S.stamina.appendChild(S.staminaFill);
    // touch controls
    S.pad = el('div', 'sf-joy');
    S.knob = el('span', 'sf-knob');
    S.pad.appendChild(S.knob);
    S.btnAct = el('button', 'sf-btn sf-act', 'E');
    S.btnAct.type = 'button';
    S.btnRun = el('button', 'sf-btn sf-run', '»');
    S.btnRun.type = 'button';
    // The name of the region you are in; selecting it shows that region's card (and its real NASA fact) again.
    S.regionChip = el('button', 'sf-region');
    S.regionChip.type = 'button';
    S.regionChip.setAttribute('data-k', 'region-chip'); // a re-render restores the focus by data-k
    S.regionChip.hidden = true;
    S.regionChip.addEventListener('click', () => { if (S.region != null && S.hooks.reopenRegion) S.hooks.reopenRegion(W.REGIONS[S.region]); });
    S.debugBox = el('pre', 'sf-debug');
    S.debugBox.hidden = !S.debug;
    // The Display settings' FPS readout, under the minimap: a visual extra, so it is hidden from assistive technology.
    S.fpsEl = el('div', 'sf-fps');
    S.fpsEl.hidden = true;
    S.fpsEl.setAttribute('aria-hidden', 'true');
    o.append(S.hint, S.stamina, S.regionChip, S.eva.el, S.eva.alert, S.map.minimap, S.map.openBtn, S.fpsEl, S.prompt, S.menu, S.pad, S.btnAct, S.btnRun, S.debugBox, S.map.el);
    // The action button is held for finds, like E: it acts when pressed and lets go of a hold when released.
    S.btnAct.addEventListener('pointerdown', e => { e.preventDefault(); S.actId = e.pointerId; interact(); });
    S.btnAct.addEventListener('click', e => { if (e.detail === 0) interact(); }); // Enter or Space on the focused button
    const actOff = e => { if (e.pointerId !== S.actId) return; S.actId = null; S.eva.stop(); };
    // The stick and the sprint button follow their finger on the window, filtered by its pointer id: a re-render moves this
    // node into a new stage, which releases the pad's pointer capture, and the finger can then slide off or lift anywhere.
    // The pad has no move/up/cancel handlers of its own, so nothing is handled twice.
    const runOn = e => { e.preventDefault(); S.runId = e.pointerId; S.sprintHeld = true; S.btnRun.classList.add('on'); };
    const runOff = e => { if (e.pointerId !== S.runId) return; S.runId = null; S.sprintHeld = false; S.btnRun.classList.remove('on'); };
    S.btnRun.addEventListener('pointerdown', runOn);
    S.btnRun.addEventListener('pointerleave', runOff);
    S.pad.addEventListener('pointerdown', e => {
      S.joy.id = e.pointerId;
      S.pad.setPointerCapture(e.pointerId);
      joyMove(e);
    });
    const joyEnd = e => { if (S.joy.id !== e.pointerId) return; S.joy = { x: 0, y: 0, id: null }; S.knob.style.transform = ''; };
    window.addEventListener('pointermove', e => { if (S.joy.id === e.pointerId) joyMove(e); });
    window.addEventListener('pointerup', e => { joyEnd(e); runOff(e); actOff(e); });
    window.addEventListener('pointercancel', e => { joyEnd(e); runOff(e); actOff(e); });
  }

  function joyMove(e) {
    const r = S.pad.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 14;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    S.joy.x = dx / max;
    S.joy.y = dy / max;
    S.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (S.player) S.player.path = null;
  }

  function typing(e) {
    const tg = e.target;
    return tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable);
  }

  function bindInput() {
    const MOVE = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
    window.addEventListener('keydown', e => {
      if (!S.el.isConnected || typing(e) || document.querySelector('.modal-back')) return;
      // F3 first, even with the map open: the debug overlay toggles (once, however long it is held) and the browser's find bar never opens.
      if (e.code === 'F3') { if (!e.repeat) { S.debug = !S.debug; S.debugBox.hidden = !S.debug; } e.preventDefault(); return; }
      if (S.map.isOpen()) { if (S.map.key(e)) e.preventDefault(); return; }
      if (e.code === 'KeyM' && !e.repeat) { openMap(); e.preventDefault(); return; }
      if (MOVE[e.code]) { S.keys.add(e.code); if (S.player) S.player.path = null; e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') S.keys.add('Shift');
      if (e.code === 'KeyE' && !e.repeat) { interact(); e.preventDefault(); }
      if (e.code === 'KeyQ' && !e.repeat) { S.eva.canister(S.player); e.preventDefault(); }
      if (e.code === 'KeyK' && !e.repeat) { S.eva.takeKit(S.player); e.preventDefault(); }
      if (e.code === 'KeyP' && !e.repeat && S.player) { ping(S.player.x, S.player.y); e.preventDefault(); }
      if (e.code === 'Escape' && S.menuOpen) { closeMenu(); e.preventDefault(); }
      if (e.code === 'KeyC' && !e.repeat && S.hooks.openConsole) S.hooks.openConsole();
      if (S.menuOpen && /^Digit[1-9]$/.test(e.code)) {
        const btns = [...S.menu.querySelectorAll('button[data-n]:not(:disabled)')];
        const b = btns[Number(e.code.slice(5)) - 1];
        if (b) { b.click(); e.preventDefault(); }
      }
    });
    window.addEventListener('keyup', e => {
      S.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') S.keys.delete('Shift');
      if (e.code === 'KeyE') S.eva.stop();
    });
    window.addEventListener('blur', () => { S.keys.clear(); S.eva.stop(); });
    S.canvas.addEventListener('pointerdown', e => {
      if (!S.player || !S.world || S.map.isOpen()) return;
      S.canvas.focus({ preventScroll: true });
      const r = S.canvas.getBoundingClientRect();
      const wx = (e.clientX - r.left) / S.view.zoom + S.view.camX;
      const wy = (e.clientY - r.top) / S.view.zoom + S.view.camY;
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      // Tap a crew member to talk to them
      const crewHit = avatars().find(a => !a.you && Math.hypot(a.x - wx, a.y - 18 - wy) < 26);
      const goalBlocked = isBlocked(tx, ty);
      const path = findPath(S.player.x, S.player.y, tx, ty, goalBlocked, S.player.inRover);
      S.lastTap = { tx, ty, goalBlocked, found: !!path };
      if (path) {
        if (goalBlocked) path.pop();
        else if (path.length) path[path.length - 1] = [wx, wy];
        else path.push([wx, wy]);
        const auto = crewHit ? { kind: 'crew', id: crewHit.id } : { tile: [tx, ty] };
        if (path.length) { S.player.path = path; S.player.autoFocus = auto; }
        else { S.player.path = null; S.pendingAuto = auto; }
        // Face the thing we are walking to, so the focus lands on it when we arrive.
        const last = path.length ? path[path.length - 1] : [S.player.x, S.player.y];
        S.player.faceTo = [tx * T + T / 2, ty * T + T / 2, last];
      }
      S.hintUntil = 0;
    });
  }

  function openMap() {
    if (!S.world || !S.player) return;
    S.map.open(mapState());
  }

  // A takeover (your astronaut died) or a claim (co-op): you are now this crewmate, standing where they stood (their walk at the
  // base, or where their player had them), not where the astronaut before you was. Their NPC goes with them.
  function moveToCrewmate(id) {
    const p = S.player, from = S.npcs[id] || S.remote[id];
    const [x, y] = from ? [from.x, from.y] : spawnPoint();
    Object.assign(p, { x, y, dir: (from && from.dir) || 'down', path: null, push: null, inRover: false, autoFocus: null, faceTo: null });
    delete S.npcs[id];
    S.pendingAuto = null;
    S.camSnap = true;
  }

  // A new round, or a solo collapse: your astronaut is back by the HQ, out of the rover (whoever drove it brought it home).
  function goHome() {
    const p = S.player;
    if (!p) return;
    const [x, y] = spawnPoint();
    Object.assign(p, { x, y, dir: 'down', path: null, push: null, inRover: false, autoFocus: null, faceTo: null });
    S.pendingAuto = null;
    S.camSnap = true;
    if (S.menuOpen) closeMenu();
  }

  // ---------- data from ui.js ----------
  // The Display settings. A missing or unknown value is the default (Best, Max, no readout). A new quality is applied at once: the
  // canvas is resized and the ground is painted again at the new scale, with no reload.
  function applyGfx(g) {
    const gfx = g || {}, quality = gfx.quality === 'fast' ? 'fast' : 'best', changed = quality !== S.gfx.quality;
    S.gfx = { quality, fpsCap: gfx.fpsCap === 30 || gfx.fpsCap === 60 ? gfx.fpsCap : 0, showFps: !!gfx.showFps };
    S.fpsEl.hidden = !S.gfx.showFps;
    if (!changed) return;
    resize();
    if (S.painter) S.painter.setScale(groundScale());
    S.nextDraw = 0; // the next callback draws, even under a limit: the resize cleared the canvas
  }

  function update(data) {
    S.data = data;
    applyGfx(data.gfx);
    if (!data.mission) return;
    world();
    refreshWorld(data.mission);
    if (data.fog) S.world.mergeFog(data.fog);
    ensurePlayer();
    if (data.controlId && S.player.crewId !== data.controlId) moveToCrewmate(data.controlId);
    S.player.crewId = data.controlId;
    const look = S.eva.sync(data);
    const down = S.eva.collapsed(data.controlId) ? data.mission.expedition.collapsed[data.controlId] : null; // co-op: waiting for a revive
    const back = data.lastPos && Number.isFinite(data.lastPos.x) && Number.isFinite(data.lastPos.y) ? data.lastPos : null;
    const place = spot => {
      Object.assign(S.player, { x: spot.x, y: spot.y, path: null, push: null, autoFocus: null, faceTo: null });
      S.pendingAuto = null;
      S.camSnap = true;
    };
    if (look.round) goHome();
    else if (look.fresh && down) place(down); // a reload (or a new seat) while down: you lie where you fell, where teammates can revive you
    else if (look.fresh) {
      // A reload (or a new seat) mid-round: back where you stood (the solo save, or where the server last saw you), not a free
      // walk home. After a solo collapse you are already home, where you sit out the round.
      if (back && !S.eva.state().benched) place(back);
      if (S.eva.driving()) { S.player.inRover = true; S.player.car = null; } // back in the seat you left (a reload while driving), from rest
    }
    if (down) S.player.inRover = false; // a collapse parks the rover where you fell (X.collapse): you are never left in it
    S.canvas.setAttribute('aria-label', t('sf.aria'));
    S.hintKey = null; // the next frame writes the key hint in the language of the moment, on foot or in the rover
    S.btnAct.setAttribute('aria-label', t('sf.interact'));
    S.btnRun.setAttribute('aria-label', t('sf.sprint'));
    if (data.lang !== S.lang) {
      S.lang = data.lang;
      S.map.relabel();
      if (S.region != null) showRegionName();
    }
    if (S.menuOpen) renderMenu();
  }

  function setRemote(list) {
    const now = performance.now();
    const next = {};
    for (const p of list || []) {
      if (!p.crewId || (S.data && p.crewId === S.data.controlId)) continue;
      const prev = S.remote[p.crewId];
      // A rover's heading comes from how its relayed position moves (no new network field); standing still keeps it, and a
      // crewmate who has just got in is drawn the way the rover was parked.
      const shift = prev && prev.rover && p.rover ? Math.hypot(p.x - prev.tx, p.y - prev.ty) : 0;
      const heading = shift > 1 ? Math.atan2(p.y - prev.ty, p.x - prev.tx) : p.rover ? (prev && prev.heading != null ? prev.heading : S.roverHeading) : null;
      if (p.rover && heading != null) S.roverHeading = heading; // so it is parked as its driver left it
      next[p.crewId] = {
        x: prev ? prev.x : p.x, y: prev ? prev.y : p.y, tx: p.x, ty: p.y, dir: p.dir || 'down', moving: !!p.moving, rover: !!p.rover, heading, shown: prev ? prev.shown : null, odo: prev ? prev.odo || 0 : 0,
        phase: prev ? prev.phase : 0, at: now, suit: Number.isFinite(p.suit) ? p.suit : null, load: p.load || 0, away: !!p.away,
      };
    }
    S.remote = next;
  }

  // Fog a teammate revealed (co-op). ui.js keeps it too, so a rebuilt world gets it back through update().
  function mergeFog(map) { if (S && S.world) S.world.mergeFog(map); }

  // A ping (spec §3.5): P (where you stand), or a tap on the minimap or the map. Solo shows it on your own maps at once and
  // never touches the network; co-op sends it (the hook says whether it went out), and every tab, this one too, draws the
  // server's echo (SolSurface.ping). One a second at most, as the server allows (D.TEAM.ping.gap).
  function ping(x, y) {
    const m = S.data && S.data.mission;
    if (!m || m.status !== 'active' || S.time - S.pingAt < D.TEAM.ping.gap) return;
    S.pingAt = S.time;
    const px = Math.round(x), py = Math.round(y);
    if (S.hooks.ping && S.hooks.ping(px, py)) return;
    S.eva.addPing({ x: px, y: py, by: S.data.controlId });
  }
  // Where the crew who count stand, for the commander's aura and his route line (X.speedFactor, X.commanderOut): you, and in
  // co-op the players whose tab is connected (a dropped one's last position stays in the room until the round ends; ui.js
  // marks it `away`); in solo the crew walking round the outpost, who are your team.
  function team() {
    if (!S.player || !S.data || !S.data.mission) return [];
    const out = [{ crewId: S.data.controlId, x: S.player.x, y: S.player.y }];
    if (S.data.mission.coop) { for (const [id, r] of Object.entries(S.remote)) if (!r.away) out.push({ crewId: id, x: r.x, y: r.y }); }
    else for (const [id, n] of Object.entries(S.npcs)) out.push({ crewId: id, x: n.x, y: n.y });
    return out;
  }

  // ---------- simulation ----------
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!S.el.isConnected || document.hidden || !S.data || !S.data.mission) { S.last = ts; return; }
    // The FPS limit (Display settings): at most that many frames a second on average. The callbacks in between are skipped and leave
    // S.last alone, so the next frame's dt covers their time. A frame is due when the one before it was due plus one period, not when
    // that one was drawn (60 on a 144 Hz screen would average 48), and it may come 1 ms early (a 60 on a 60 Hz screen draws every
    // frame although the timestamps jitter).
    if (S.gfx.fpsCap) {
      if (ts + 1 < S.nextDraw) return;
      S.nextDraw = Math.max(S.nextDraw + 1000 / S.gfx.fpsCap, ts);
    }
    const t0 = performance.now();
    const raw = ts - (S.last || ts);
    if (raw > 0) S.fps += (1000 / raw - S.fps) * 0.05;
    const dt = Math.min(0.05, raw / 1000);
    S.last = ts;
    S.time += dt;
    world();
    ensurePlayer();
    const moved = stepPlayer(dt);
    stepNpcs(dt);
    stepRemote(dt);
    roverFx(dt);
    stepFocus();
    S.eva.step(dt, S.player, S.world, moved, S.focus);
    stream(t0);
    explore(ts);
    draw(dt);
    const st = mapState();
    S.map.drawMini(st, ts);
    S.map.frame(st, performance.now() + 6);
    if (S.debug && ts - S.debugAt > 250) { S.debugAt = ts; drawDebugText(); }
    if (S.gfx.showFps && ts - S.fpsAt >= 250) { S.fpsAt = ts; S.fpsEl.textContent = t('display.fps', { n: Math.round(S.fps) }); } // four times a second at most
    maybeSend(ts);
    walkSample();
  }

  // Chunk streaming: keep the data near you (at most one new chunk a frame, the ones ahead of you first)
  // and paint ground until about 4 ms of this frame are used (always at least one chunk, so nothing stalls).
  function stream(t0) {
    const p = S.player;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    const [dx, dy] = p.moving ? DIRS[p.dir] : [0, 0];
    S.world.retain(tx, ty, tx + dx * 2 * W.CHUNK, ty + dy * 2 * W.CHUNK);
    S.world.work();
    const v = S.view, viewW = v.w / v.zoom, viewH = v.h / v.zoom;
    S.painter.retainView(v.camX, v.camY, v.camX + viewW, v.camY + viewH);
    S.painter.work(t0 + 4, 1);
  }

  function showRegionName() {
    const name = t('region.' + W.REGIONS[S.region]);
    S.regionChip.hidden = false;
    S.regionChip.textContent = name;
    S.regionChip.setAttribute('aria-label', t('region.reread', { name }));
  }

  // What you can see becomes explored, and a new region shows its name. New fog goes out once a second. How far you see
  // depends on the round's weather: dust storms shrink it (spec §3.4).
  function explore(ts) {
    const p = S.player, me = controlledCrew();
    if (!me || me.status === 'dead') return;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), r = S.eva.view(p);
    if (tx !== S.seenAt[0] || ty !== S.seenAt[1] || r !== S.seenAt[2]) {
      S.seenAt = [tx, ty, r];
      S.world.reveal(tx, ty, r);
      const reg = S.world.region(tx, ty);
      if (reg !== S.region) {
        S.region = reg;
        showRegionName();
        if (S.hooks.enterRegion) S.hooks.enterRegion(W.REGIONS[reg]);
      }
    }
    if (ts - S.fogSent > 1000) {
      S.fogSent = ts;
      const diff = S.world.takeFog();
      if (S.hooks.reveal && Object.keys(diff).length) S.hooks.reveal(diff);
    }
  }

  function mapState() {
    if (!S.player) return { px: 0, py: 0, crew: [], marks: [], lines: [] };
    return {
      px: S.player.x, py: S.player.y, crew: avatars().map(a => ({ x: a.x, y: a.y, color: a.color, you: !!a.you })),
      marks: S.eva.marks(S.world, S.player.x, S.player.y).concat(poiMarks()), lines: S.eva.lines(),
    };
  }
  // The maps' marks for the points of interest (src/surface-map.js poiMarks), made again only when what they show changes:
  // the landmarks discovered, the structures used or repaired (a repaired mast adds "?" marks: X.mastMarks, when the rules have it).
  function poiMarks() {
    const m = S.data.mission, x = m.expedition || {}, X = root.SolExpedition;
    const key = m.seed + '|' + Object.keys(x.landmarks || {}).join() + '|' + JSON.stringify(x.structures || {});
    if (S.poiKey !== key) { S.poiKey = key; S.poiMarks = SM.poiMarks(S.world.seed, x, X && X.mastMarks ? X.mastMarks(m) : []); }
    return S.poiMarks;
  }

  function drawDebugText() {
    const tx = Math.floor(S.player.x / T), ty = Math.floor(S.player.y / T);
    S.debugBox.textContent = SM.debugText({
      fps: Math.round(S.fps), world: S.world.stats(), paint: S.painter.stats(),
      tile: [tx, ty], chunk: [SW.chunkOf(tx), SW.chunkOf(ty)], region: S.region == null ? '-' : W.REGIONS[S.region],
    });
  }

  function controlledCrew() {
    const m = S.data.mission;
    return m.crew.find(c => c.id === S.data.controlId) || null;
  }

  // Moves your astronaut; returns how far (world px) they moved this frame (the rover's battery counts it).
  function stepPlayer(dt) {
    const p = S.player, ox = p.x, oy = p.y;
    const me = controlledCrew();
    const canMove = me && me.status === 'active';
    let vx = 0, vy = 0;
    if (canMove) {
      if (S.keys.has('KeyW') || S.keys.has('ArrowUp')) vy -= 1;
      if (S.keys.has('KeyS') || S.keys.has('ArrowDown')) vy += 1;
      if (S.keys.has('KeyA') || S.keys.has('ArrowLeft')) vx -= 1;
      if (S.keys.has('KeyD') || S.keys.has('ArrowRight')) vx += 1;
      if (!vx && !vy && (S.joy.x || S.joy.y)) { vx = S.joy.x; vy = S.joy.y; }
      if (!vx && !vy && p.path && p.path.length) {
        const [tx, ty] = p.path[0];
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        if (d < (p.inRover ? 30 : 6)) { // a rover sweeps through its turns: near enough is enough
          p.path.shift();
          if (!p.path.length) {
            p.path = null;
            if (p.faceTo) {
              const fx = p.faceTo[0] - p.x, fy = p.faceTo[1] - (p.y - 8);
              if (Math.abs(fx) > 4 || Math.abs(fy) > 4) p.dir = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 'right' : 'left') : (fy > 0 ? 'down' : 'up');
              p.faceTo = null;
            }
            if (p.autoFocus) { S.pendingAuto = p.autoFocus; p.autoFocus = null; }
          }
        } else if (!(p.inRover && p.car && brakesNow(p, d))) { vx = dx / d; vy = dy / d; }
      }
    } else {
      p.path = null;
    }
    const len = Math.hypot(vx, vy);
    let moving = len > 0.05;
    const sprinting = moving && (S.keys.has('Shift') || S.sprintHeld) && p.stamina > 4 && !p.inRover;
    p.stamina = clamp(p.stamina + (sprinting ? -32 : 18) * dt, 0, 100);
    if (p.inRover) {
      // The rover drives by the physics engine (src/physics.js): it turns toward the way you push and speeds up, brakes and
      // turns only as hard as its wheels grip in Mars' gravity. Shift opens up its governor; boulders and crater rims are
      // rough ground it creeps over. The battery counts each tile boosted, or rough, twice (p.drain, src/surface-eva.js).
      if (!p.car) p.car = { heading: S.roverHeading || 0, speed: 0 };
      const turnedFrom = p.car.heading;
      const rough = S.world.rough(Math.floor(p.x / T), Math.floor(p.y / T)), boost = moving && (S.keys.has('Shift') || S.sprintHeld);
      const step = PH.drive(p.car, { x: vx, y: vy }, dt, { boost, rough }) * S.eva.speed(p) * S.qa.speed; // the commander's aura
      const RD = D.EXPEDITION.roverDrain;
      p.drain = (boost && p.car.speed > 1 ? RD.boost : 1) * (rough ? RD.rough : 1);
      S.roverHeading = p.car.heading;
      moving = p.car.speed > 4;
      if (step > 0) {
        const hx = Math.cos(p.car.heading), hy = Math.sin(p.car.heading), mx = p.x + hx * step, my = p.y + hy * step;
        const stuck = hitsWall(p.x, p.y, true);
        const ok = (x, y) => S.qa.ghost || ((stuck || (!hitsWall(x, y, true) && !isBlocked(Math.floor((x + hx * NOSE) / T), Math.floor((y - 10 + hy * NOSE) / T), true))) && S.eva.canMove(p, x, y));
        // A move along an axis the rover isn't heading on is no move, so it can't count as allowed: head-on into a wall,
        // both are refused and the rover stops dead, with no speed left to show, send or turn with.
        const okX = Math.abs(hx) > 1e-6 && ok(mx, p.y);
        if (okX) p.x = mx;
        const okY = Math.abs(hy) > 1e-6 && ok(p.x, my);
        if (okY) p.y = my;
        if (!okX && !okY) { p.car.speed = 0; moving = false; p.path = null; } // against a wall, or the battery is flat
        p.odo = (p.odo || 0) + Math.hypot(p.x - ox, p.y - oy); // the wheels turn as far as it really went
      }
      if (step > 0 || p.car.heading !== turnedFrom) { // you face the way it does once it turns or moves (E acts there)
        const c = Math.cos(p.car.heading), s = Math.sin(p.car.heading);
        p.dir = Math.abs(c) > Math.abs(s) ? (c > 0 ? 'right' : 'left') : (s > 0 ? 'down' : 'up');
      }
      if (moving) S.hintUntil = Math.min(S.hintUntil, S.time + 3);
    } else if (moving) {
      const nx = vx / Math.max(1, len), ny = vy / Math.max(1, len);
      const ground = S.world.speed(Math.floor(p.x / T), Math.floor(p.y / T)); // dunes slow walking
      const sp = SPEED * (sprinting ? SPRINT_X : 1) * ground * S.eva.speed(p) * S.qa.speed * Math.min(1, len); // the commander's aura
      const stuck = hitsWall(p.x, p.y);
      const mx = p.x + nx * sp * dt, my = p.y + ny * sp * dt;
      // A step is allowed if nothing blocks it and the exploring rules agree (an empty suit, a flat rover battery).
      const ok = (x, y) => S.qa.ghost || ((stuck || !hitsWall(x, y)) && S.eva.canMove(p, x, y));
      const okX = ok(mx, p.y);
      if (okX) p.x = mx;
      const okY = ok(p.x, my);
      if (okY) p.y = my;
      // Both refused (you are down, out of suit or battery, or in a corner): you stand still, and a click-to-walk ends here.
      if (!okX && !okY) { moving = false; p.path = null; }
      if (Math.abs(nx) > Math.abs(ny)) p.dir = nx > 0 ? 'right' : 'left'; else p.dir = ny > 0 ? 'down' : 'up';
      p.phase += dt * sp / 26;
      S.hintUntil = Math.min(S.hintUntil, S.time + 3);
    }
    // A throw obeys the exploring rules like a step: once the suit is out it ends where the collapse was asked for, not 2 tiles on.
    if (p.push && !S.eva.canMove(p, p.x + p.push.x, p.y + p.push.y)) p.push = null;
    if (p.push) { // a dust devil throws you aside (spec §3.4): a short slide that stops at walls and ends a click-to-walk
      const k = Math.min(1, dt / p.push.left), sx = p.push.x * k, sy = p.push.y * k;
      if (S.qa.ghost || !hitsWall(p.x + sx, p.y)) p.x += sx;
      if (S.qa.ghost || !hitsWall(p.x, p.y + sy)) p.y += sy;
      p.push.x -= sx;
      p.push.y -= sy;
      p.push.left -= dt;
      p.path = null;
      if (p.push.left <= 0) p.push = null;
    }
    p.moving = moving;
    p.sprinting = sprinting;
    S.staminaFill.style.width = p.stamina.toFixed(0) + '%';
    S.stamina.hidden = p.stamina >= 99.5 && !sprinting;
    return Math.hypot(p.x - ox, p.y - oy);
  }

  function jobTarget(c, job, rnd) {
    const m = S.data.mission;
    const tiles = type => m.layout.filter(x => x.type === type);
    const pick = list => list[Math.floor(rnd() * list.length)];
    const hq = D.GRID.hq;
    if (job === 'maintenance') {
      const broken = m.layout.filter(x => m.modules[x.type] && m.modules[x.type].broken > 0 && x.type !== 'hab');
      const pool = broken.length ? broken : m.layout.filter(x => ['solar', 'battery', 'recycler', 'oxygen', 'reactor'].includes(x.type));
      const tl = pick(pool);
      return tl ? spotNear(tl.x, tl.y, rnd) : spotNear(hq[0], hq[1], rnd);
    }
    if (job === 'construction') {
      const pr = m.projects.find(x => x.x != null) || (S.data.plan.builds || []).find(x => x.x != null);
      if (pr) return spotNear(pr.x, pr.y, rnd);
      return quarry(rnd);
    }
    if (job === 'farming' && tiles('greenhouse').length) { const g = pick(tiles('greenhouse')); return spotNear(g.x, g.y, rnd); }
    if (job === 'science' && tiles('lab').length) { const l = tiles('lab')[0]; return spotNear(l.x, l.y, rnd); }
    if (job === 'eva') return quarry(rnd);
    return spotNear(hq[0], hq[1], rnd);
  }

  // The crew who aren't you stay at the base: EVA work happens on the open ring 6–11 tiles from the HQ.
  function quarry(rnd) {
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(rnd() * 23) - 11, y = Math.floor(rnd() * 23) - 11, d2 = x * x + y * y;
      if (d2 < 36 || d2 > 121 || isBlocked(x, y)) continue;
      const [cx, cy] = center(x, y);
      return [cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 20];
    }
    return spawnPoint();
  }

  function stepNpcs(dt) {
    const m = S.data.mission;
    const controlled = new Set([S.data.controlId, ...Object.keys(S.remote)]);
    for (const c of m.crew) {
      if (controlled.has(c.id)) { delete S.npcs[c.id]; continue; }
      let n = S.npcs[c.id];
      if (!n) {
        const [x, y] = spawnPoint();
        n = S.npcs[c.id] = { x: x + (Math.random() - 0.5) * 50, y: y + Math.random() * 10, dir: 'down', phase: 0, path: null, wait: Math.random() * 1.5, job: null, rnd: seeded(c.id + m.seed), working: false };
      }
      if (c.status !== 'active') { n.path = null; n.moving = false; continue; }
      const job = (S.data.plan.jobs || {})[c.id];
      if (job !== n.job) { n.job = job; n.path = null; n.wait = 0; }
      if (!n.path) {
        n.wait -= dt;
        n.moving = false;
        n.working = n.wait > 0 && n.arrived;
        if (n.wait <= 0) {
          const tgt = jobTarget(c, job, n.rnd);
          const path = tgt && findPath(n.x, n.y, Math.floor(tgt[0] / T), Math.floor(tgt[1] / T), false);
          if (path) { if (path.length) path[path.length - 1] = tgt; else path.push(tgt); n.path = path; n.arrived = false; }
          else n.wait = 1.5;
        }
        continue;
      }
      const [tx, ty] = n.path[0];
      const dx = tx - n.x, dy = ty - n.y, d = Math.hypot(dx, dy);
      if (d < 5) {
        n.path.shift();
        if (!n.path.length) { n.path = null; n.wait = 4 + n.rnd() * 6; n.arrived = true; }
        continue;
      }
      const sp = NPC_SPEED * (job === 'eva' ? 1.1 : 1);
      n.x += dx / d * sp * dt;
      n.y += dy / d * sp * dt;
      if (Math.abs(dx) > Math.abs(dy)) n.dir = dx > 0 ? 'right' : 'left'; else n.dir = dy > 0 ? 'down' : 'up';
      n.phase += dt * sp / 26;
      n.moving = true;
    }
  }

  // Dust and wheel tracks behind every rover that moves (a local effect, never sent). The dust flies up and falls back
  // under Mars' gravity (src/physics.js); the tracks, two lines of the last TRACKS points, fade as newer ones are laid.
  const TRACKS = 240, TRACK_GAP = 8;
  function roverFx(dt) {
    const fx = S.fx, list = [], due = fx.due || (fx.due = {});
    if (S.player.inRover && S.player.car) list.push(['me', S.player.x, S.player.y, S.player.car.heading, S.player.moving]);
    for (const [id, r] of Object.entries(S.remote)) if (r.rover && r.heading != null) list.push([id, r.x, r.y, r.heading, r.moving]);
    for (const [id, x, y, h, moving] of list) {
      if (!moving) continue;
      const c = Math.cos(h), s = Math.sin(h), at = (lx, ly) => [x + c * lx - s * ly, y - 10 + s * lx + c * ly];
      // A grain from each back wheel 60 times a second, whatever the frame rate (the same dust on a 30 Hz and a 144 Hz screen).
      for (due[id] = Math.min((due[id] || 0) + dt * 60, 4); due[id] >= 1 && fx.dust.length < 160; due[id]--) for (const side of [-1, 1]) {
        const [dx, dy] = at(-58, side * 39);
        fx.dust.push({ x: dx, y: dy, z: 0.01, vx: -c * 40 + (Math.random() - 0.5) * 50, vy: -s * 40 + (Math.random() - 0.5) * 50, vz: 0.5 + Math.random(), r: 3 + Math.random() * 3, age: 0 });
      }
      const trail = fx.tracks[id] = fx.tracks[id] || [], last = trail[trail.length - 1];
      if (!last || Math.hypot(last.x - x, last.y - y) > TRACK_GAP) {
        trail.push({ x, y, l: at(0, -39), r: at(0, 39) });
        if (trail.length > TRACKS) trail.shift();
      }
    }
    fx.dust = fx.dust.filter(d => { d.age += dt; d.r += dt * 9; return PH.dust(d, dt) && d.age < 1.6; });
  }
  function drawTracks(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 11;
    for (const trail of Object.values(S.fx.tracks)) for (let band = 0; band < 6; band++) { // six shades, the oldest faintest
      const from = Math.max(1, Math.floor(trail.length * band / 6)), to = Math.floor(trail.length * (band + 1) / 6);
      ctx.strokeStyle = 'rgba(38,18,10,' + (0.05 + 0.03 * band).toFixed(2) + ')';
      ctx.beginPath();
      for (let i = from; i < to; i++) for (const side of ['l', 'r']) {
        const a = trail[i - 1][side], b = trail[i][side];
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 40) continue; // a jump: a teleport, a new round
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawDust(ctx) {
    for (const d of S.fx.dust) {
      ctx.fillStyle = 'rgba(196,142,104,' + (0.34 * (1 - d.age / 1.6)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(d.x, d.y - d.z * PH.PX_PER_M, d.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function stepRemote(dt) {
    for (const r of Object.values(S.remote)) {
      const k = Math.min(1, dt * 10);
      const dx = r.tx - r.x, dy = r.ty - r.y;
      r.x += dx * k;
      r.y += dy * k;
      if (r.heading != null) { // the drawn heading eases toward the relayed one, the short way round
        if (r.shown == null) r.shown = r.heading;
        const d = r.heading - r.shown;
        r.shown += (d - Math.round(d / (2 * Math.PI)) * 2 * Math.PI) * k;
      }
      if (Math.hypot(dx, dy) > 1) r.phase += dt * 6;
      if (r.rover) r.odo = (r.odo || 0) + Math.hypot(dx, dy) * k; // its wheels roll as far as it moves
    }
  }

  function maybeSend(ts) {
    if (!S.hooks.sendPos || ts - S.lastSent < 110) return;
    const p = S.player;
    const ev = S.eva.report();
    const k = Math.round(p.x) + ',' + Math.round(p.y) + ',' + p.dir + ',' + p.moving + ',' + p.inRover + ',' + (ev.suit == null ? '-' : Math.ceil(ev.suit)) + ',' + Math.floor(ev.driven);
    if (k === S.lastSentKey && ts - S.lastSent < 2000) return;
    S.lastSent = ts;
    S.lastSentKey = k;
    // The suit level travels with the position (teammates see it), except while you are down; the driver also says how far
    // the rover has gone, and `rover: false` from the driver parks it there even if the park action was lost.
    S.hooks.sendPos({ x: Math.round(p.x), y: Math.round(p.y), dir: p.dir, moving: p.moving, rover: p.inRover, suit: ev.suit == null ? undefined : ev.suit, driven: p.inRover ? ev.driven : undefined });
  }
  // Walked distance (spec §3.10, R5): where you stand goes to the walk hook every WALK_GAP seconds of the surface's clock, with
  // where you stood before, the way co-op's positions reach the server. Solo's rules count the tiles (X.addDistance: a jump or a
  // ride in the rover counts for nothing), and a hidden tab's clock stands still, so nothing is counted for time not walked.
  function walkSample() {
    const p = S.player, w = S.walk;
    if (!S.hooks.walk || (w && S.time - w.t < WALK_GAP)) return;
    const at = { x: p.x, y: p.y, rover: !!p.inRover };
    if (w) S.hooks.walk(w.at, at, S.time - w.t);
    S.walk = { at, t: S.time };
  }

  // ---------- what the player is looking at ----------
  function avatars() {
    const m = S.data.mission;
    const out = [];
    const byId = id => m.crew.find(c => c.id === id);
    const color = role => A.ROLE[role] || '#ccc';
    const me = controlledCrew();
    if (me && me.status !== 'dead') out.push({ id: me.id, role: me.role, color: color(me.role), x: S.player.x, y: S.player.y, dir: S.player.dir, phase: S.player.phase, moving: S.player.moving, you: true, down: me.status === 'down' || S.eva.collapsed(me.id), rover: S.player.inRover, heading: S.player.inRover && S.player.car ? S.player.car.heading : null, odo: S.player.odo || 0 });
    for (const [id, n] of Object.entries(S.npcs)) {
      const c = byId(id);
      if (!c || c.status === 'dead') continue;
      out.push({ id, role: c.role, color: color(c.role), x: n.x, y: n.y, dir: n.dir, phase: n.phase, moving: n.moving, down: c.status === 'down', working: n.working, job: n.job });
    }
    for (const [id, r] of Object.entries(S.remote)) {
      const c = byId(id);
      if (!c || c.status === 'dead') continue;
      out.push({ id, role: c.role, color: color(c.role), x: r.x, y: r.y, dir: r.dir, phase: r.phase, moving: r.moving, remote: true, down: c.status === 'down' || S.eva.collapsed(id), rover: r.rover, heading: r.shown != null ? r.shown : r.heading, odo: r.odo, bar: S.eva.suitBar(r) });
    }
    return out;
  }

  function focusAt(wx, wy) {
    const m = S.data.mission;
    const [gx, gy] = worldToGrid(wx, wy);
    if (wx === LANDER[0] && wy === LANDER[1]) return { kind: 'lander', key: 'lander', wx, wy };
    if (!inGrid(gx, gy)) return null;
    const tile = m.layout.find(x => x.x === gx && x.y === gy);
    if (tile) {
      if (tile.type === 'hab') return { kind: 'hq', key: 'hq', gx, gy, wx, wy };
      // The rover in its bay is something to drive, unless you are down (co-op, waiting for a revive): then it is just the bay.
      const drivable = S.eva.roverAtBay(S.player) && !S.eva.collapsed(S.data.controlId);
      if (tile.type === 'rover') return drivable ? { kind: 'rover', key: 'rover', gx, gy, wx, wy, type: 'rover' } : { kind: 'structure', key: 's:' + gx + ',' + gy, gx, gy, wx, wy, type: 'rover' };
      return { kind: 'structure', key: 's:' + gx + ',' + gy, gx, gy, wx, wy, type: tile.type };
    }
    const pr = m.projects.find(x => x.x === gx && x.y === gy);
    if (pr) return { kind: 'project', key: 'p:' + gx + ',' + gy, gx, gy, wx, wy, project: pr };
    const bi = (S.data.plan.builds || []).findIndex(b => b.x === gx && b.y === gy);
    if (bi >= 0) return { kind: 'queued', key: 'q:' + gx + ',' + gy, gx, gy, wx, wy, index: bi };
    if (S.base.gridRock.has(tkey(gx, gy))) return { kind: 'rock', key: 'r:' + gx + ',' + gy, gx, gy, wx, wy };
    return { kind: 'empty', key: 'e:' + gx + ',' + gy, gx, gy, wx, wy, ice: S.base.ice.has(tkey(gx, gy)) };
  }

  function stepFocus() {
    const p = S.player;
    let f = null;
    if (S.pendingAuto) {
      const a = S.pendingAuto;
      S.pendingAuto = null;
      if (a.kind === 'crew') f = { kind: 'crew', key: 'c:' + a.id, id: a.id };
      else f = focusAt(a.tile[0], a.tile[1]);
      if (f) { S.focus = f; openMenu(); return; }
    }
    // An open menu stays put until the player walks away.
    if (S.menuOpen && !p.moving) { renderPrompt(); return; }
    const [dx, dy] = DIRS[p.dir];
    const lx = p.x + dx * 38, ly = p.y - 8 + dy * 34;
    const crew = avatars().find(a => !a.you && !a.remote && Math.hypot(a.x - lx, a.y - ly) < 30);
    if (crew) f = { kind: 'crew', key: 'c:' + crew.id, id: crew.id };
    const ef = S.eva.focusAt(lx, ly, p, S.world); // a find, a dropped load, a crewmate down outside, the parked rover
    if (!f && !(ef && ef.kind === 'beacon')) f = ef;
    if (!f) f = focusAt(Math.floor(lx / T), Math.floor(ly / T));
    if (!f || f.kind === 'empty') {
      const under = focusAt(Math.floor(p.x / T), Math.floor((p.y - 4) / T));
      if (under && (!f || under.kind !== 'empty' || !f)) f = under || f;
    }
    // A beacon can't stand near the base, so its prompt comes only when the surface itself has nothing here (the brief's "only when nothing else is in reach").
    if (!f && ef) f = ef;
    // In the rover, E gets you out, unless there is work right there: a crewmate to revive, or a find or a dropped load your
    // backpack has room for (you step out to work on it and get back in). A full backpack never keeps you in a flat rover.
    if (p.inRover) f = ef && S.eva.holdable(ef) && (ef.kind === 'revive' || S.eva.hasRoom()) ? ef : { kind: 'rover', key: 'rover-exit', driving: true };
    const changed = (f && f.key) !== (S.focus && S.focus.key);
    S.focus = f;
    if (changed && S.menuOpen) closeMenu();
    renderPrompt();
  }

  function focusLabel(f) {
    if (!f) return '';
    switch (f.kind) {
      case 'hq': return t('mod.hab');
      case 'rover': return f.driving ? t('sf.exitRover') : t('sf.boardRover');
      case 'structure': return t('mod.' + f.type);
      case 'project': return t('mod.' + f.project.type) + ' · ' + t('bld.projects');
      case 'queued': return t('mod.' + S.data.plan.builds[f.index].type) + ' · ' + t('bld.queue');
      case 'rock': return t('map.rock');
      case 'lander': return t('sf.lander');
      case 'crew': return S.data.crewName(f.id);
      case 'empty': return t('sf.buildHere') + (f.ice ? ' · ' + t('map.ice') : '');
      default: return S.eva.label(f);
    }
  }

  function renderPrompt() {
    const f = S.focus;
    const show = !!f && !S.menuOpen && controlledCrew() && controlledCrew().status === 'active';
    S.prompt.hidden = !show;
    if (show) {
      const label = focusLabel(f);
      if (S.prompt.dataset.label !== label) {
        S.prompt.dataset.label = label;
        S.prompt.textContent = '';
        const k = el('kbd', null, S.touch ? '◉' : 'E');
        S.prompt.append(k, document.createTextNode(' ' + label));
      }
    }
    const hintKey = S.player && S.player.inRover ? (S.touch ? 'sf.hintRoverTouch' : 'sf.hintRover') : (S.touch ? 'sf.hintTouch' : 'sf.hintKeys');
    if (S.hintKey !== hintKey) { S.hintKey = hintKey; S.hint.textContent = t(hintKey); }
    S.hint.hidden = S.time > S.hintUntil || S.eva.alerting(); // the flare's banner takes the hint's place
  }

  // ---------- interaction menu ----------
  function interact() {
    const me = controlledCrew();
    if (!me || me.status !== 'active') return;
    if (S.menuOpen) { closeMenu(); return; }
    if (!S.focus) return;
    if (S.eva.holdable(S.focus)) { S.eva.start(S.focus); return; }
    if (S.focus.kind === 'rover') { toggleRover(); return; }
    if (S.focus.kind === 'beacon') return; // where a beacon cannot go: the prompt says why, and there is no menu
    openMenu();
  }

  // Getting in and out of the rover goes through the exploring rules: one driver at a time, it stays where you leave it
  // (or goes back to its bay at the outpost), and its battery drives roverRange tiles a round.
  function toggleRover() {
    const p = S.player, m = S.data.mission;
    if (p.inRover) {
      p.inRover = false;
      p.car = null; // parked: S.roverHeading keeps the way it faces
      refreshWorld(m);
      if (hitsWall(p.x, p.y)) { const sp = freeSpot(p.x, p.y); if (sp) { p.x = sp[0]; p.y = sp[1]; } }
      S.eva.act('park', p, { driven: S.eva.report().driven }); // with the last bit of driving, so the battery is saved right
      return;
    }
    if (m.modules.rover.count - m.modules.rover.broken <= 0) { openMenu(); return; }
    if (S.eva.collapsed(S.data.controlId)) return; // down (co-op): you can't get in, not even until the server says no
    p.inRover = true; // at once, so it feels immediate; in co-op the server may say someone else has it
    p.car = { heading: S.roverHeading || 0, speed: 0 }; // it faces the way it was left
    S.hintUntil = S.time + 12; // the rover's own key hint
    refreshWorld(m);
    S.eva.act('board', p).then(r => { if (r.error && p.inRover) { p.inRover = false; refreshWorld(S.data.mission); } });
  }
  // The nearest open spot to stand on, within 3 tiles of (x, y) (world px), for getting out of the rover by a rock.
  function freeSpot(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const c = center(tx + dx, ty + dy);
      if (!hitsWall(c[0], c[1])) return c;
    }
    return null;
  }

  function openMenu() {
    S.menuOpen = S.focus && S.focus.key;
    renderMenu();
    S.prompt.hidden = true;
  }
  function closeMenu() {
    S.menuOpen = null;
    S.menu.hidden = true;
    S.menu.textContent = '';
    S.canvas.focus({ preventScroll: true });
  }

  function mbtn(label, sub, onClick, opts) {
    const o = opts || {};
    const b = el('button', 'sf-mbtn' + (o.primary ? ' primary' : '') + (o.on ? ' on' : ''));
    b.type = 'button';
    b.disabled = !!o.disabled;
    if (o.icon) { const i = el('span', 'sf-ico'); i.innerHTML = o.icon; b.appendChild(i); }
    const txt = el('span', 'sf-mtxt');
    txt.appendChild(el('b', null, label));
    if (sub) txt.appendChild(el('small', null, sub));
    b.appendChild(txt);
    b.addEventListener('click', () => { onClick(); });
    return b;
  }

  function renderMenu() {
    const f = S.focus;
    const m = S.data.mission, plan = S.data.plan, fc = S.data.forecast, H = S.hooks;
    if (!f || !m) { closeMenu(); return; }
    const menu = S.menu;
    menu.textContent = '';
    menu.hidden = false;
    const head = el('div', 'sf-mhead');
    head.appendChild(el('b', null, focusLabel(f)));
    const x = el('button', 'sf-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', t('common.close'));
    x.addEventListener('click', closeMenu);
    head.appendChild(x);
    menu.appendChild(head);
    const body = el('div', 'sf-mbody');
    menu.appendChild(body);
    let n = 0;
    const numbered = b => { if (!b.disabled) b.dataset.n = String(++n); return b; };
    const note = (text, cls) => body.appendChild(el('p', 'sf-note ' + (cls || ''), text));

    if (f.kind === 'empty') {
      const pending = plan.builds || [];
      if (!E.touchesBase(m, f.gx, f.gy, pending)) { note(t('sf.notConnected'), 'warn'); return; }
      if (f.ice) note(t('sf.iceOnly'));
      const types = D.BUILD_ORDER.filter(ty => ty !== 'shield' && (f.ice ? ty === 'icedrill' : ty !== 'icedrill'));
      const grid = el('div', 'sf-mgrid');
      for (const ty of types) {
        const spots = E.buildSpots(m, ty, pending);
        const here = spots.some(([sx, sy]) => sx === f.gx && sy === f.gy);
        const chk = E.canBuild(m, ty, pending);
        const spec = D.BUILDS[ty];
        const why = !chk.ok ? t('bld.why.' + chk.reason) : !here ? t('bld.why.space') : cost(spec);
        grid.appendChild(numbered(mbtn(t('mod.' + ty), why, () => { H.queueBuild({ type: ty, x: f.gx, y: f.gy }); closeMenu(); },
          { disabled: !chk.ok || !here, icon: A.module(ty, 34) })));
      }
      body.appendChild(grid);
      note(t('hud.materials') + ': ' + nf(m.resources.materials) + ' kg', 'faint');
      return;
    }
    if (f.kind === 'queued') {
      const b = plan.builds[f.index];
      note(t('sf.planned', { name: t('mod.' + b.type) }));
      body.appendChild(numbered(mbtn(t('sf.cancel'), '+' + D.BUILDS[b.type].materials + ' kg', () => { H.cancelBuild(f.index); closeMenu(); })));
      return;
    }
    if (f.kind === 'project') {
      const pr = f.project;
      note(t('bld.progress', { p: nf(pr.progress, 1), w: nf(pr.work, 1) }));
      const bar = el('div', 'bar accent');
      const s = el('span');
      s.style.width = (pr.progress / pr.work * 100).toFixed(0) + '%';
      bar.appendChild(s);
      body.appendChild(bar);
      if (!fc.points.construction) note(t('bld.needBuilders'), 'warn');
      return;
    }
    if (f.kind === 'rock') { note(t('sf.rockTile')); return; }
    if (f.kind === 'lander') { note(t('sf.landerBody')); return; }
    if (f.kind === 'crew') {
      const c = m.crew.find(x => x.id === f.id);
      note(t('role.' + c.role) + ' · ' + Math.round(c.health) + ' HP · ' + Math.round(c.dose) + ' mSv');
      if (c.status === 'down') { note(t('crew.down', { n: D.REVIVE.window - c.downTurns }), 'crit'); }
      const allowed = S.data.canControl(c.id) && c.status === 'active';
      if (!allowed) { note(t('sf.notYourCrew'), 'faint'); }
      const grid = el('div', 'sf-mgrid');
      for (const job of D.JOB_ORDER) {
        const blocked = !allowed || (c.grounded && D.OUTDOOR_JOBS.includes(job));
        const spec = D.SPECIALTY[c.role].includes(job);
        grid.appendChild(numbered(mbtn(t('job.' + job) + (spec ? ' ★' : ''), t('job.' + job + '.hint'), () => { H.setJob(c.id, job); renderMenu(); },
          { disabled: blocked, on: plan.jobs[c.id] === job, icon: A.icon(job, 18) })));
      }
      body.appendChild(grid);
      return;
    }
    if (f.kind === 'hq') {
      const decisions = (m.events || []).filter(e => e.options && !((plan.answered || {})[e.type])).length;
      note(t('sf.hqLayers', { n: m.modules.shield.count }) + ' · ' + t('hud.shield') + ' ' + Math.round(E.shielding(m) * 100) + ' %');
      if (m.modules.hab.broken) note(t('sf.broken'), 'crit');
      const chk = E.canBuild(m, 'shield', plan.builds || []);
      body.appendChild(numbered(mbtn(t('sf.console'), t('sf.consoleSub'), () => { closeMenu(); H.openConsole(); }, { icon: A.icon('book', 18) })));
      body.appendChild(numbered(mbtn(t('bld.shieldAdd'), chk.ok ? cost(D.BUILDS.shield) : t('bld.why.' + chk.reason),
        () => { H.queueBuild({ type: 'shield' }); renderMenu(); }, { disabled: !chk.ok, icon: A.icon('shield', 18) })));
      // A relay beacon kit takes no tile either (spec §3.8): built here like a shield layer, it waits at the base.
      if (m.expedition) {
        const kit = E.canBuild(m, 'kit', plan.builds || []);
        const why = kit.reason === 'max' ? t('bld.why.maxKit', { max: D.EXPEDITION.beacon.max }) : t('bld.why.' + kit.reason); // as the console's kit button
        body.appendChild(numbered(mbtn(t('sf.kitAdd'), kit.ok ? cost(D.BUILDS.kit) : why,
          () => { H.queueBuild({ type: 'kit' }); renderMenu(); }, { disabled: !kit.ok, icon: A.icon('kit', 18) })));
      }
      if (decisions) note(t('sf.decisions', { n: decisions }), 'warn');
      body.appendChild(numbered(mbtn(t('ops.advance'), '', () => { closeMenu(); H.advance(); }, { primary: true, disabled: !H.canAdvance(), icon: A.icon('chevron', 18) })));
      return;
    }
    if (f.kind === 'structure' || f.kind === 'rover') {
      const ty = f.type;
      const mod = m.modules[ty];
      if (mod.broken) note(t('sf.broken'), 'crit');
      const consumer = D.CONSUMERS.includes(ty);
      const on = (plan.modulesOn || {})[ty] !== false;
      if (consumer) {
        const running = fc.power.running[ty];
        note((running ? t('sys.running', { n: running }) : t('sf.unpowered')) + ' · ' + nf(D.MODULES[ty].kw, 1) + ' kW', running ? 'ok' : 'warn');
        body.appendChild(numbered(mbtn(t('sf.switch') + ': ' + (on ? t('common.on') : t('common.off')), t('mod.' + ty) + ' ×' + mod.count,
          () => { H.toggleModule(ty); renderMenu(); }, { on, icon: A.icon('power_off', 18) })));
      } else if (ty === 'solar') {
        note('+' + nf(fc.power.solarKw, 1) + ' kW · ' + t('pow.dust', { p: Math.round(m.cleanliness * 100) }));
      } else if (ty === 'reactor') {
        note('+' + nf(fc.power.reactorKw, 1) + ' kW');
      }
      if (ty === 'rover' && mod.count - mod.broken > 0 && S.eva.roverAtBay(S.player) && !S.eva.collapsed(S.data.controlId)) body.appendChild(numbered(mbtn(t('sf.boardRover'), t('sf.roverSub'), () => { closeMenu(); toggleRover(); }, { primary: true, icon: A.icon('eva', 18) })));
      const scrapping = (plan.scrap || []).includes(ty);
      body.appendChild(numbered(mbtn(scrapping ? t('sys.scrapQueued') : t('sys.scrap'), fc.points.maintenance ? '' : t('sys.scrapNeed'),
        () => { H.toggleScrap(ty); renderMenu(); }, { on: scrapping, disabled: !fc.points.maintenance && !scrapping, icon: A.icon('scrap', 18) })));
    }
  }

  // ---------- drawing ----------
  // ?debug=chunks or F3: data chunk borders (yellow, 32 tiles) and image chunk borders (blue, 4 tiles).
  function drawChunkBorders(ctx, x0, y0, x1, y1) {
    const lines = (size, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width / S.view.zoom;
      ctx.beginPath();
      for (let x = Math.floor(x0 / size) * size; x <= x1; x += size) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.floor(y0 / size) * size; y <= y1; y += size) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    };
    ctx.save();
    lines(P.PX, 'rgba(140,188,236,0.3)', 1);
    lines(W.CHUNK * T, 'rgba(255,220,80,0.8)', 2);
    ctx.restore();
  }

  function draw(dt = 1 / 60) { // dt: the seconds since the last frame (it moves the camera and the dust at the same speed at any frame rate)
    const ctx = S.ctx, v = S.view, m = S.data.mission, plan = S.data.plan, fc = S.data.forecast;
    if (!v.w) resize();
    const p = S.player;
    const viewW = v.w / v.zoom, viewH = v.h / v.zoom;
    // The camera follows you anywhere: the world has no edges.
    const targetX = p.x - viewW / 2, targetY = p.y - 20 - viewH / 2;
    if (S.camSnap) { v.camX = targetX; v.camY = targetY; S.camSnap = false; }
    const ease = 1 - Math.pow(0.85, dt * 60); // the camera closes 0.15 of the gap a frame at 60 Hz: the same share of it per second at any rate
    v.camX += (targetX - v.camX) * ease;
    v.camY += (targetY - v.camY) * ease;
    const x0 = v.camX, y0 = v.camY, x1 = x0 + viewW, y1 = y0 + viewH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3a1d14';
    ctx.fillRect(0, 0, S.canvas.width, S.canvas.height);
    const k = v.dpr * v.zoom;
    ctx.setTransform(k, 0, 0, k, -v.camX * k, -v.camY * k);
    S.painter.drawGround(ctx, x0, y0, x1, y1);
    drawTracks(ctx); // the rovers' wheel tracks lie on the ground, under everything else
    // the points of interest: their decals lie flat on the ground, under everything; the rest are sorted with the sprites
    const pois = pointsOfInterest(x0, y0, x1, y1, m);
    for (const it of pois) if (it.depth == null) drawArt(ctx, it);
    drawDust(ctx);
    S.eva.drawZone(ctx, x0, y0, x1, y1, S.world);

    // buried ice at the base: the only cue for where the ice drill can go
    ctx.save();
    ctx.fillStyle = '#8fb6c7';
    ctx.strokeStyle = '#e1f3fa';
    ctx.lineWidth = 1.5;
    for (const [gx, gy] of m.terrain.ice) {
      const [wx, wy] = gridToWorld(gx, gy);
      const X = wx * T, Y = wy * T;
      ctx.fillRect(X + 2, Y + 2, T - 4, T - 4);
      drawIceCracks(ctx, X, Y);
    }
    ctx.restore();

    // HQ shield layers and water wall
    const [hwx, hwy] = gridToWorld(D.GRID.hq[0], D.GRID.hq[1]);
    const [hcx, hcy] = center(hwx, hwy);
    for (let i = m.modules.shield.count; i >= 1; i--) {
      ctx.fillStyle = i % 2 ? '#8e4a2c' : '#9b5433';
      ctx.strokeStyle = 'rgba(60,20,10,0.5)';
      ctx.beginPath(); ctx.ellipse(hcx, hcy + 18, 30 + i * 5, 12 + i * 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (m.wallWater > 0) {
      ctx.strokeStyle = 'rgba(95,180,255,0.55)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(hcx, hcy - 2, 31, 27, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // queued builds and focus highlight
    for (const b of plan.builds || []) {
      if (b.x == null) continue;
      const [wx, wy] = gridToWorld(b.x, b.y);
      ctx.fillStyle = 'rgba(140,188,236,0.14)';
      ctx.strokeStyle = '#8cbcec';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      roundRect(ctx, wx * T + 4, wy * T + 4, T - 8, T - 8, 6); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }
    const f = S.focus;
    if (f && f.wx != null && !S.player.inRover) {
      const glow = 0.5 + 0.5 * Math.sin(S.time * 5);
      ctx.strokeStyle = `rgba(183,214,245,${0.55 + glow * 0.4})`;
      ctx.lineWidth = 2.5;
      roundRect(ctx, f.wx * T + 3, f.wy * T + 3, T - 6, T - 6, 8); ctx.stroke();
    }

    // sprites sorted by depth
    const sprites = [];
    const brokenLeft = {};
    for (const ty of D.MODULE_TYPES) brokenLeft[ty] = m.modules[ty].broken;
    const runningLeft = Object.assign({}, fc.power.running);
    for (const tile of m.layout) {
      if (tile.type === 'rover' && !S.eva.roverAtBay(p)) continue; // driven, or parked out on the map
      const [wx, wy] = gridToWorld(tile.x, tile.y);
      let status = null;
      if (brokenLeft[tile.type] > 0) { brokenLeft[tile.type]--; status = 'broken'; }
      else if (D.CONSUMERS.includes(tile.type)) { if (runningLeft[tile.type] > 0) runningLeft[tile.type]--; else status = 'off'; }
      sprites.push({ y: wy * T + T - 6, draw: () => {
        const img = moduleImage(tile.type, m.cleanliness);
        const big = tile.type === 'hab' ? 1.3 : 1;
        if (ready(img)) {
          ctx.globalAlpha = status === 'off' ? 0.6 : 1;
          ctx.drawImage(img, wx * T + T / 2 - T * big / 2, wy * T + T - T * big, T * big, T * big);
          ctx.globalAlpha = 1;
        }
        if (status) badge(ctx, wx * T + T - 10, wy * T + 12, status);
      } });
    }
    for (const pr of m.projects) {
      if (pr.x == null) continue;
      const [wx, wy] = gridToWorld(pr.x, pr.y);
      sprites.push({ y: wy * T + T - 6, draw: () => {
        const sc = moduleImage('scaffold', 1), ghost = moduleImage(pr.type, 1);
        if (ready(ghost)) { ctx.globalAlpha = 0.4; ctx.drawImage(ghost, wx * T, wy * T, T, T); ctx.globalAlpha = 1; }
        if (ready(sc)) ctx.drawImage(sc, wx * T, wy * T, T, T);
        ctx.fillStyle = '#140e10'; roundRect(ctx, wx * T + 8, wy * T + T - 7, 48, 4, 2); ctx.fill();
        ctx.fillStyle = '#8cbcec'; roundRect(ctx, wx * T + 8, wy * T + T - 7, 48 * pr.progress / pr.work, 4, 2); ctx.fill();
      } });
    }
    for (const [gx, gy] of m.terrain.rock) {
      const [wx, wy] = gridToWorld(gx, gy);
      sprites.push({ y: wy * T + T / 2 + 10, draw: () => drawRock(ctx, { wx, wy, s: 1 }) });
    }
    sprites.push({ y: LANDER[1] * T + T / 2 + 22, draw: () => drawLander(ctx, LANDER[0], LANDER[1]) });
    for (const a of avatars()) {
      if (a.x < x0 - T * 2 || a.x > x1 + T * 2 || a.y < y0 - T || a.y > y1 + T * 3) continue; // off screen
      let name = S.data.crewName(a.id);
      if (a.you) name = t('sf.you') + ' · ' + name;
      // Someone lying down is drawn after what stands at the same spot, so a fallen driver is not hidden by the parked rover.
      sprites.push({ y: a.y + (a.down ? 24 : 0), draw: () => drawAvatar(ctx, a, name, S.time, S.tags) });
    }
    // lost crew are remembered with a small flag beside the HQ
    m.crew.filter(c => c.status === 'dead').forEach((c, i) => {
      const fx = hcx - 44 - i * 14, fy = hcy + 30;
      sprites.push({ y: fy, draw: () => {
        ctx.strokeStyle = '#cbbfae'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 22); ctx.stroke();
        ctx.fillStyle = A.ROLE[c.role]; ctx.fillRect(fx, fy - 22, 10, 7);
      } });
    });
    for (const it of pois) if (it.depth != null) sprites.push({ y: it.depth, draw: () => drawArt(ctx, it) });
    for (const s of S.eva.sprites(x0, y0, x1, y1, S.world, S.time)) sprites.push(s);
    sprites.sort((a, b) => a.y - b.y);
    for (const s of sprites) s.draw(ctx); // the exploring layer's sprites take the context; the others close over it
    // the fog over what you can't see, then the name tags (with teammates' suit bars) on top of it
    P.drawFog(ctx, S.world, x0, y0, x1, y1, p.x, p.y - 12, S.eva.view(p) * T);
    if (S.tube) P.drawDark(ctx, x0, y0, x1, y1, p.x, p.y - 12, S.eva.view(p) * T); // inside a lava tube: your headlamp's light
    drawTags(ctx, S.tags);
    S.eva.drawOver(ctx);
    if (S.debug) drawChunkBorders(ctx, x0, y0, x1, y1);

    // weather, in screen space
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const weather = m.schedule[m.turn] ? m.schedule[m.turn].weather : 'clear';
    const tint = weather === 'global' ? 'rgba(110,52,22,0.46)' : weather === 'regional' ? 'rgba(180,110,60,0.22)' : null;
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, v.w, v.h); }
    // Best has 1.5 times the dust there was before, Fast half of it: 39 / 165 / 330 and 13 / 55 / 110 grains.
    const want = Math.round((S.gfx.quality === 'best' ? 1.5 : 0.5) * (weather === 'global' ? 220 : weather === 'regional' ? 110 : 26));
    while (S.particles.length < want) S.particles.push({ x: Math.random() * v.w, y: Math.random() * v.h, s: 0.6 + Math.random() * 1.8, a: 0.15 + Math.random() * 0.4 });
    if (S.particles.length > want) S.particles.length = want;
    const wind = weather === 'global' ? 160 : weather === 'regional' ? 90 : 18;
    ctx.fillStyle = '#e7b88a';
    for (const q of S.particles) {
      q.x += (wind + q.s * 20) * dt;
      q.y += Math.sin(S.time + q.s * 3) * 18 * dt;
      if (q.x > v.w + 4) { q.x = -4; q.y = Math.random() * v.h; }
      ctx.globalAlpha = q.a;
      ctx.fillRect(q.x, q.y, q.s * 1.6, q.s);
    }
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,5,8,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, v.w, v.h);
    // A solar flare's countdown, out in the open: a red edge that grows and beats faster as it runs out; then the flash.
    const fx = S.eva.flareFx(p);
    if (fx.warn > 0) {
      const beat = 0.6 + 0.4 * Math.sin(S.time * (4 + 6 * fx.warn));
      const rg = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.3, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.72);
      rg.addColorStop(0, 'rgba(200,30,20,0)');
      rg.addColorStop(1, 'rgba(200,30,20,' + (0.15 + 0.3 * fx.warn * beat).toFixed(3) + ')');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, v.w, v.h);
    }
    if (fx.flash > 0) {
      ctx.fillStyle = 'rgba(255,244,214,' + (0.8 * fx.flash).toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
  }

  // Read-only snapshot for automated play-testing.
  function probe() {
    if (!S || !S.player) return null;
    const toScreen = (x, y) => [(x - S.view.camX) * S.view.zoom, (y - S.view.camY) * S.view.zoom];
    const tileScreen = (gx, gy) => { const [wx, wy] = gridToWorld(gx, gy); return toScreen(wx * T + T / 2, wy * T + T / 2); };
    const tx = Math.floor(S.player.x / T), ty = Math.floor(S.player.y / T);
    return {
      player: { x: S.player.x, y: S.player.y, dir: S.player.dir, inRover: S.player.inRover, stamina: S.player.stamina, path: S.player.path && S.player.path.length, heading: S.player.car ? S.player.car.heading : null, speed: S.player.car ? S.player.car.speed : 0 },
      lastTap: S.lastTap, focus: S.focus && S.focus.kind, menu: S.menuOpen, npcs: Object.keys(S.npcs), tileScreen, toScreen,
      npcAt: Object.fromEntries(Object.entries(S.npcs).map(([id, n]) => [id, [n.x, n.y]])),
      remote: JSON.parse(JSON.stringify(S.remote)),
      blocked: (wx, wy) => isBlocked(wx, wy), path: (gx, gy) => findPath(S.player.x, S.player.y, gx, gy, true, S.player.inRover),
      tile: [tx, ty], region: S.region == null ? null : W.REGIONS[S.region], fps: Math.round(S.fps), mapOpen: S.map.isOpen(),
      world: S.world && S.world.stats(), paint: S.painter && S.painter.stats(), seen: (x, y) => S.world.seen(x, y),
      eva: S.eva.state(), focusKey: S.focus && S.focus.key, view: S.eva.view(S.player), push: S.player.push ? Object.assign({}, S.player.push) : null,
      hint: !S.hint.hidden, alert: S.eva.alerting(), dust: S.particles.length, roverDust: S.fx ? S.fx.dust.length : 0, dustX: S.particles.map(q => q.x), dustY: S.particles.map(q => q.y),
      pois: JSON.parse(JSON.stringify(S.pois || [])), tube: S.tube ? S.tube.id : null, // the last frame's points of interest
      marks: JSON.parse(JSON.stringify(mapState().marks)), // what the maps mark
      lines: JSON.parse(JSON.stringify(mapState().lines)), team: JSON.parse(JSON.stringify(team())), // the maps' lines; who counts for the aura
    };
  }

  // Browser QA helpers, only with ?debug=chunks: hold keys, board the rover anywhere, drive through rocks,
  // speed up, jump, and hash a painted image chunk to prove a deleted chunk comes back identical.
  const qa = {
    hold(code, on) { if (on) S.keys.add(code); else S.keys.delete(code); },
    board(on) { S.player.inRover = on !== false; },
    ghost(on) { S.qa.ghost = !!on; },
    speed(x) { S.qa.speed = Math.max(0.1, Number(x) || 1); },
    chunkHash(ix, iy) { return S.painter.chunkHash(ix, iy); },
    teleport(tx, ty) { S.player.x = tx * T + T / 2; S.player.y = ty * T + T / 2; S.player.path = null; S.camSnap = true; },
    suit(s) { S.eva.qaSuit(s); },
    clock(s) { S.eva.qaClock(s); }, // solo: jump the round's clock (a flare's warning, its end)
  };

  root.SolSurface = Object.assign({ mount, update, setRemote, mergeFog, reset, isMounted: () => !!S, probe, ping: d => { if (S) S.eva.addPing(d); } }, DEBUG ? { qa } : {});
})(typeof self !== 'undefined' ? self : this);
