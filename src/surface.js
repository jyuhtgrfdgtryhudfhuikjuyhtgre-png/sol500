/*
 * SOL 500 — the walkable surface: your astronaut walks around the outpost and out into the endless world, builds on
 * tiles, inspects and switches machines, drives the rover, and meets the rest of the crew, who walk to their jobs.
 * Canvas 2D + a small DOM overlay. It never changes the mission itself: every action goes through ui.js hooks,
 * so the surface and the mission console always show the same plan.
 * The world model is src/surface-world.js, the painting src/surface-paint.js, the minimap and map src/surface-map.js.
 *
 * API: SolSurface.mount(hooks) → element (persistent; re-attach it on every render)
 *      SolSurface.update({ mission, plan, forecast, controlId, canControl(id), crewName(id), t, lang, fog })
 *      SolSurface.setRemote([{ crewId, x, y, dir, moving, rover }])
 *      SolSurface.mergeFog({ "<cx>,<cy>": base64 }) · SolSurface.reset() (call when a new mission starts)
 * Hooks: queueBuild, cancelBuild, toggleModule, toggleScrap, setJob, openConsole, canAdvance, advance,
 *        sendPos(pos), reveal({ key: base64 }), enterRegion(regionId), reopenRegion(regionId)
 */
(function (root) {
  'use strict';
  const D = root.SolData, E = root.SolEngine, A = root.SolArt, W = root.SolWorldgen, SW = root.SolWorld, P = root.SolPaint, SM = root.SolMap;
  const { drawAvatar, drawTags, roundRect, badge, drawRock, drawLander, drawIceCracks } = P.sprites;
  const T = 64;
  const BASE = W.BASE_RECT;
  const LANDER = [-6, -4];
  const SPEED = 150, SPRINT_X = 1.75, ROVER_X = 2.6, NPC_SPEED = 115;
  const VIEW_FOOT = 8, VIEW_ROVER = 10; // tiles you can see around you (dust storms will shrink this in M4)
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

  // ---------- world model ----------
  // A mission (by its code) gets its own world, painter and fog; reset() forces a fresh one for a new mission.
  function world() {
    const m = S.data && S.data.mission;
    if (!m) return null;
    if (S.world && S.worldSeed === m.seed) return S.world;
    S.world = SW.create(m.seed);
    S.painter = P.createPainter(S.world);
    S.map.attach(S.world, S.painter);
    S.worldSeed = m.seed;
    S.world.reveal(0, 0, W.FLAT_RADIUS); // the crew knows their own base
    S.player = null;
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

  const isBlocked = (wx, wy) => S.world.isBlocked(wx, wy);

  function hitsWall(x, y) {
    const pts = [[x - 10, y - 6], [x + 10, y - 6], [x - 10, y + 4], [x + 10, y + 4]];
    return pts.some(([px, py]) => isBlocked(Math.floor(px / T), Math.floor(py / T)));
  }

  // Breadth-first search over world tiles inside a 64×64-tile box around the walker; returns tile-centre waypoints.
  function findPath(fromX, fromY, goalWx, goalWy, allowGoalBlocked) {
    const steps = S.world.findPath(Math.floor(fromX / T), Math.floor(fromY / T), goalWx, goalWy, allowGoalBlocked);
    return steps && steps.map(([x, y]) => center(x, y));
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
    S.player = { x, y, dir: 'down', phase: 0, moving: false, stamina: 100, path: null, inRover: false, crewId: S.data.controlId };
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
      lastSent: 0, lastSentKey: '', hintUntil: 14, touch: false,
      region: null, seenAt: [NaN, NaN, 0], fogSent: 0, debug: DEBUG, debugAt: 0, lang: null, qa: { ghost: false, speed: 1 },
    };
    S.touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    S.map = SM.create({ t: (k, p) => t(k, p), onOpen: () => S.keys.clear(), onClose: () => S.canvas.focus({ preventScroll: true }) });
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

  function resize() {
    const r = S.el.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    S.view.w = r.width;
    S.view.h = r.height;
    S.view.dpr = dpr;
    S.view.zoom = clamp(r.width / (T * 10.5), 0.62, 1.55);
    S.canvas.width = Math.max(1, Math.round(r.width * dpr));
    S.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  function t(k, p) { return S.data ? S.data.t(k, p) : k; }

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
    o.append(S.hint, S.stamina, S.regionChip, S.map.minimap, S.prompt, S.menu, S.pad, S.btnAct, S.btnRun, S.debugBox, S.map.el);
    S.btnAct.addEventListener('click', () => interact());
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
    window.addEventListener('pointerup', e => { joyEnd(e); runOff(e); });
    window.addEventListener('pointercancel', e => { joyEnd(e); runOff(e); });
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
    });
    window.addEventListener('blur', () => S.keys.clear());
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
      const path = findPath(S.player.x, S.player.y, tx, ty, goalBlocked);
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
    Object.assign(p, { x, y, dir: (from && from.dir) || 'down', path: null, inRover: false, autoFocus: null, faceTo: null });
    delete S.npcs[id];
    S.pendingAuto = null;
    S.camSnap = true;
  }

  // ---------- data from ui.js ----------
  function update(data) {
    S.data = data;
    if (!data.mission) return;
    world();
    refreshWorld(data.mission);
    if (data.fog) S.world.mergeFog(data.fog);
    ensurePlayer();
    if (data.controlId && S.player.crewId !== data.controlId) moveToCrewmate(data.controlId);
    S.player.crewId = data.controlId;
    S.canvas.setAttribute('aria-label', t('sf.aria'));
    S.hint.textContent = t(S.touch ? 'sf.hintTouch' : 'sf.hintKeys');
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
      next[p.crewId] = { x: prev ? prev.x : p.x, y: prev ? prev.y : p.y, tx: p.x, ty: p.y, dir: p.dir || 'down', moving: !!p.moving, rover: !!p.rover, phase: prev ? prev.phase : 0, at: now };
    }
    S.remote = next;
  }

  // Fog a teammate revealed (co-op). ui.js keeps it too, so a rebuilt world gets it back through update().
  function mergeFog(map) { if (S && S.world) S.world.mergeFog(map); }

  // ---------- simulation ----------
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!S.el.isConnected || document.hidden || !S.data || !S.data.mission) { S.last = ts; return; }
    const t0 = performance.now();
    const raw = ts - (S.last || ts);
    if (raw > 0) S.fps += (1000 / raw - S.fps) * 0.05;
    const dt = Math.min(0.05, raw / 1000);
    S.last = ts;
    S.time += dt;
    world();
    ensurePlayer();
    stepPlayer(dt);
    stepNpcs(dt);
    stepRemote(dt);
    stepFocus();
    stream(t0);
    explore(ts);
    draw();
    const st = mapState();
    S.map.drawMini(st, ts);
    S.map.frame(st, performance.now() + 6);
    if (S.debug && ts - S.debugAt > 250) { S.debugAt = ts; drawDebugText(); }
    maybeSend(ts);
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

  // What you can see becomes explored, and a new region shows its name. New fog goes out once a second.
  function explore(ts) {
    const p = S.player, me = controlledCrew();
    if (!me || me.status === 'dead') return;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), r = p.inRover ? VIEW_ROVER : VIEW_FOOT;
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
    if (!S.player) return { px: 0, py: 0, crew: [] };
    return { px: S.player.x, py: S.player.y, crew: avatars().map(a => ({ x: a.x, y: a.y, color: a.color, you: !!a.you })) };
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

  function stepPlayer(dt) {
    const p = S.player;
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
        if (d < 6) {
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
        } else { vx = dx / d; vy = dy / d; }
      }
    } else {
      p.path = null;
    }
    const len = Math.hypot(vx, vy);
    const moving = len > 0.05;
    const sprinting = moving && (S.keys.has('Shift') || S.sprintHeld) && p.stamina > 4 && !p.inRover;
    p.stamina = clamp(p.stamina + (sprinting ? -32 : 18) * dt, 0, 100);
    if (moving) {
      const nx = vx / Math.max(1, len), ny = vy / Math.max(1, len);
      const ground = p.inRover ? 1 : S.world.speed(Math.floor(p.x / T), Math.floor(p.y / T)); // dunes slow walking
      const sp = SPEED * (sprinting ? SPRINT_X : 1) * (p.inRover ? ROVER_X : 1) * ground * S.qa.speed * Math.min(1, len);
      const stuck = hitsWall(p.x, p.y);
      const mx = p.x + nx * sp * dt, my = p.y + ny * sp * dt;
      if (S.qa.ghost || stuck || !hitsWall(mx, p.y)) p.x = mx;
      if (S.qa.ghost || stuck || !hitsWall(p.x, my)) p.y = my;
      if (Math.abs(nx) > Math.abs(ny)) p.dir = nx > 0 ? 'right' : 'left'; else p.dir = ny > 0 ? 'down' : 'up';
      p.phase += dt * sp / 26;
      S.hintUntil = Math.min(S.hintUntil, S.time + 3);
    }
    p.moving = moving;
    p.sprinting = sprinting;
    S.staminaFill.style.width = p.stamina.toFixed(0) + '%';
    S.stamina.hidden = p.stamina >= 99.5 && !sprinting;
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

  function stepRemote(dt) {
    for (const r of Object.values(S.remote)) {
      const k = Math.min(1, dt * 10);
      const dx = r.tx - r.x, dy = r.ty - r.y;
      r.x += dx * k;
      r.y += dy * k;
      if (Math.hypot(dx, dy) > 1) r.phase += dt * 6;
    }
  }

  function maybeSend(ts) {
    if (!S.hooks.sendPos || ts - S.lastSent < 110) return;
    const p = S.player;
    const k = Math.round(p.x) + ',' + Math.round(p.y) + ',' + p.dir + ',' + p.moving + ',' + p.inRover;
    if (k === S.lastSentKey && ts - S.lastSent < 2000) return;
    S.lastSent = ts;
    S.lastSentKey = k;
    S.hooks.sendPos({ x: Math.round(p.x), y: Math.round(p.y), dir: p.dir, moving: p.moving, rover: p.inRover });
  }

  // ---------- what the player is looking at ----------
  function avatars() {
    const m = S.data.mission;
    const out = [];
    const byId = id => m.crew.find(c => c.id === id);
    const color = role => A.ROLE[role] || '#ccc';
    const me = controlledCrew();
    if (me && me.status !== 'dead') out.push({ id: me.id, role: me.role, color: color(me.role), x: S.player.x, y: S.player.y, dir: S.player.dir, phase: S.player.phase, moving: S.player.moving, you: true, down: me.status === 'down', rover: S.player.inRover });
    for (const [id, n] of Object.entries(S.npcs)) {
      const c = byId(id);
      if (!c || c.status === 'dead') continue;
      out.push({ id, role: c.role, color: color(c.role), x: n.x, y: n.y, dir: n.dir, phase: n.phase, moving: n.moving, down: c.status === 'down', working: n.working, job: n.job });
    }
    for (const [id, r] of Object.entries(S.remote)) {
      const c = byId(id);
      if (!c || c.status === 'dead') continue;
      out.push({ id, role: c.role, color: color(c.role), x: r.x, y: r.y, dir: r.dir, phase: r.phase, moving: r.moving, remote: true, down: c.status === 'down', rover: r.rover });
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
      if (tile.type === 'rover') return { kind: 'rover', key: 'rover', gx, gy, wx, wy, type: 'rover' };
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
    if (!f) f = focusAt(Math.floor(lx / T), Math.floor(ly / T));
    if (!f || f.kind === 'empty') {
      const under = focusAt(Math.floor(p.x / T), Math.floor((p.y - 4) / T));
      if (under && (!f || under.kind !== 'empty' || !f)) f = under || f;
    }
    if (p.inRover) f = { kind: 'rover', key: 'rover-exit', driving: true };
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
      default: return '';
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
    S.hint.hidden = S.time > S.hintUntil;
  }

  // ---------- interaction menu ----------
  function interact() {
    const me = controlledCrew();
    if (!me || me.status !== 'active') return;
    if (S.menuOpen) { closeMenu(); return; }
    if (!S.focus) return;
    if (S.focus.kind === 'rover') { toggleRover(); return; }
    openMenu();
  }

  function toggleRover() {
    const p = S.player;
    if (p.inRover) {
      p.inRover = false;
      const m = S.data.mission;
      const bay = m.layout.find(x => x.type === 'rover');
      refreshWorld(m);
      if (hitsWall(p.x, p.y) && bay) { const sp = spotNear(bay.x, bay.y, Math.random); if (sp) { p.x = sp[0]; p.y = sp[1]; } }
    } else {
      const m = S.data.mission;
      if (m.modules.rover.count - m.modules.rover.broken <= 0) { openMenu(); return; }
      p.inRover = true;
      refreshWorld(m);
    }
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
        const why = !chk.ok ? t('bld.why.' + chk.reason) : !here ? t('bld.why.space') : t('bld.cost', { kg: spec.materials, w: spec.work });
        grid.appendChild(numbered(mbtn(t('mod.' + ty), why, () => { H.queueBuild({ type: ty, x: f.gx, y: f.gy }); closeMenu(); },
          { disabled: !chk.ok || !here, icon: A.module(ty, 34) })));
      }
      body.appendChild(grid);
      note(t('hud.materials') + ': ' + Math.round(m.resources.materials) + ' kg', 'faint');
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
      note(t('bld.progress', { p: pr.progress.toFixed(1), w: pr.work }));
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
      body.appendChild(numbered(mbtn(t('bld.shieldAdd'), chk.ok ? t('bld.cost', { kg: D.BUILDS.shield.materials, w: D.BUILDS.shield.work }) : t('bld.why.' + chk.reason),
        () => { H.queueBuild({ type: 'shield' }); renderMenu(); }, { disabled: !chk.ok, icon: A.icon('shield', 18) })));
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
        note((running ? t('sys.running', { n: running }) : t('sf.unpowered')) + ' · ' + D.MODULES[ty].kw + ' kW', running ? 'ok' : 'warn');
        body.appendChild(numbered(mbtn(t('sf.switch') + ': ' + (on ? t('common.on') : t('common.off')), t('mod.' + ty) + ' ×' + mod.count,
          () => { H.toggleModule(ty); renderMenu(); }, { on, icon: A.icon('power_off', 18) })));
      } else if (ty === 'solar') {
        note('+' + fc.power.solarKw.toFixed(1) + ' kW · ' + t('pow.dust', { p: Math.round(m.cleanliness * 100) }));
      } else if (ty === 'reactor') {
        note('+' + fc.power.reactorKw.toFixed(1) + ' kW');
      }
      if (ty === 'rover' && mod.count - mod.broken > 0) body.appendChild(numbered(mbtn(t('sf.boardRover'), t('sf.roverSub'), () => { closeMenu(); toggleRover(); }, { primary: true, icon: A.icon('eva', 18) })));
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

  function draw() {
    const ctx = S.ctx, v = S.view, m = S.data.mission, plan = S.data.plan, fc = S.data.forecast;
    if (!v.w) resize();
    const p = S.player;
    const viewW = v.w / v.zoom, viewH = v.h / v.zoom;
    // The camera follows you anywhere: the world has no edges.
    const targetX = p.x - viewW / 2, targetY = p.y - 20 - viewH / 2;
    if (S.camSnap) { v.camX = targetX; v.camY = targetY; S.camSnap = false; }
    v.camX += (targetX - v.camX) * 0.15;
    v.camY += (targetY - v.camY) * 0.15;
    const x0 = v.camX, y0 = v.camY, x1 = x0 + viewW, y1 = y0 + viewH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3a1d14';
    ctx.fillRect(0, 0, S.canvas.width, S.canvas.height);
    const k = v.dpr * v.zoom;
    ctx.setTransform(k, 0, 0, k, -v.camX * k, -v.camY * k);
    S.painter.drawGround(ctx, x0, y0, x1, y1);

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
      if (tile.type === 'rover' && (p.inRover || Object.values(S.remote).some(r => r.rover))) continue;
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
    const roverImg = moduleImage('rover', 1);
    for (const a of avatars()) {
      if (a.x < x0 - T * 2 || a.x > x1 + T * 2 || a.y < y0 - T || a.y > y1 + T * 3) continue; // off screen
      let name = S.data.crewName(a.id);
      if (a.you) name = t('sf.you') + ' · ' + name;
      sprites.push({ y: a.y, draw: () => drawAvatar(ctx, a, name, S.time, S.tags, ready(roverImg) ? roverImg : null) });
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
    sprites.sort((a, b) => a.y - b.y);
    for (const s of sprites) s.draw();
    // the fog over what you can't see, then the name tags on top of it
    P.drawFog(ctx, S.world, x0, y0, x1, y1, p.x, p.y - 12, (p.inRover ? VIEW_ROVER : VIEW_FOOT) * T);
    drawTags(ctx, S.tags);
    if (S.debug) drawChunkBorders(ctx, x0, y0, x1, y1);

    // weather, in screen space
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const weather = m.schedule[m.turn] ? m.schedule[m.turn].weather : 'clear';
    const tint = weather === 'global' ? 'rgba(110,52,22,0.46)' : weather === 'regional' ? 'rgba(180,110,60,0.22)' : null;
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, v.w, v.h); }
    const want = weather === 'global' ? 220 : weather === 'regional' ? 110 : 26;
    while (S.particles.length < want) S.particles.push({ x: Math.random() * v.w, y: Math.random() * v.h, s: 0.6 + Math.random() * 1.8, a: 0.15 + Math.random() * 0.4 });
    if (S.particles.length > want) S.particles.length = want;
    const wind = weather === 'global' ? 160 : weather === 'regional' ? 90 : 18;
    ctx.fillStyle = '#e7b88a';
    for (const q of S.particles) {
      q.x += (wind + q.s * 20) * 0.016;
      q.y += Math.sin(S.time + q.s * 3) * 0.3;
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
  }

  // Read-only snapshot for automated play-testing.
  function probe() {
    if (!S || !S.player) return null;
    const toScreen = (x, y) => [(x - S.view.camX) * S.view.zoom, (y - S.view.camY) * S.view.zoom];
    const tileScreen = (gx, gy) => { const [wx, wy] = gridToWorld(gx, gy); return toScreen(wx * T + T / 2, wy * T + T / 2); };
    const tx = Math.floor(S.player.x / T), ty = Math.floor(S.player.y / T);
    return {
      player: { x: S.player.x, y: S.player.y, dir: S.player.dir, inRover: S.player.inRover, stamina: S.player.stamina, path: S.player.path && S.player.path.length },
      lastTap: S.lastTap, focus: S.focus && S.focus.kind, menu: S.menuOpen, npcs: Object.keys(S.npcs), tileScreen, toScreen,
      npcAt: Object.fromEntries(Object.entries(S.npcs).map(([id, n]) => [id, [n.x, n.y]])),
      remote: JSON.parse(JSON.stringify(S.remote)),
      blocked: (wx, wy) => isBlocked(wx, wy), path: (gx, gy) => findPath(S.player.x, S.player.y, gx, gy, true),
      tile: [tx, ty], region: S.region == null ? null : W.REGIONS[S.region], fps: Math.round(S.fps), mapOpen: S.map.isOpen(),
      world: S.world && S.world.stats(), paint: S.painter && S.painter.stats(), seen: (x, y) => S.world.seen(x, y),
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
  };

  root.SolSurface = Object.assign({ mount, update, setRemote, mergeFog, reset, isMounted: () => !!S, probe }, DEBUG ? { qa } : {});
})(typeof self !== 'undefined' ? self : this);
