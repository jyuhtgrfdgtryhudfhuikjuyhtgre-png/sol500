/*
 * SOL 500 — the walkable surface: your astronaut moves around the outpost, builds on tiles,
 * inspects and switches machines, drives the rover, and meets the rest of the crew, who walk to their jobs.
 * Canvas 2D + a small DOM overlay. It never changes the mission itself: every action goes through ui.js hooks,
 * so the surface and the mission console always show the same plan.
 *
 * API: SolSurface.mount(hooks) → element (persistent; re-attach it on every render)
 *      SolSurface.update({ mission, plan, forecast, controlId, canControl(id), crewName(id), t, lang })
 *      SolSurface.setRemote([{ crewId, x, y, dir, moving }])
 */
(function (root) {
  'use strict';
  const D = root.SolData, E = root.SolEngine, A = root.SolArt;
  const T = 64, PAD = 3;
  const GW = D.GRID.w + PAD * 2, GH = D.GRID.h + PAD * 2;
  const WW = GW * T, WH = GH * T;
  const SPEED = 150, SPRINT_X = 1.75, ROVER_X = 2.6, NPC_SPEED = 115;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
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
  const gridToWorld = (gx, gy) => [gx + PAD, gy + PAD];
  const worldToGrid = (wx, wy) => [wx - PAD, wy - PAD];
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
  function world() {
    const m = S.data && S.data.mission;
    if (!m) return null;
    if (S.worldSeed === m.seed + '|' + m.loadout.solar + '|' + m.crewSize && S.world) {
      refreshWorld(m);
      return S.world;
    }
    const r = seeded(m.seed + '|decor');
    const decor = [];
    const lander = { wx: 1, wy: 1 };
    const padTiles = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const [gx, gy] = worldToGrid(x, y);
      if (!inGrid(gx, gy) && !(x === lander.wx && y === lander.wy)) padTiles.push([x, y]);
    }
    for (let i = padTiles.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [padTiles[i], padTiles[j]] = [padTiles[j], padTiles[i]]; }
    const rocks = padTiles.slice(0, 11).filter(([x, y]) => !(y === PAD + D.GRID.hq[1] && (x < PAD || x >= PAD + D.GRID.w)));
    for (const [x, y] of rocks) decor.push({ kind: 'rock', wx: x, wy: y, s: 0.7 + r() * 0.6, v: r() });
    const craters = [];
    for (let i = 0; i < 14; i++) craters.push({ x: r() * WW, y: r() * WH, r: 12 + r() * 34 });
    S.world = { decor, lander, craters, rockSet: new Set(rocks.map(([x, y]) => tkey(x, y))) };
    S.worldSeed = m.seed + '|' + m.loadout.solar + '|' + m.crewSize;
    S.ground = null;
    S.player = null;
    S.npcs = {};
    refreshWorld(m);
    return S.world;
  }

  function refreshWorld(m) {
    const w = S.world;
    const blocked = new Set(w.rockSet);
    blocked.add(tkey(w.lander.wx, w.lander.wy));
    for (const [gx, gy] of m.terrain.rock) blocked.add(tkey(...gridToWorld(gx, gy)));
    // Crews walk between the machines; only the HQ and the reactor (radiation) are solid.
    const structAt = new Map();
    for (const tile of m.layout) {
      const [wx, wy] = gridToWorld(tile.x, tile.y);
      structAt.set(tkey(wx, wy), tile);
      if (tile.type === 'hab' || tile.type === 'reactor') blocked.add(tkey(wx, wy));
    }
    w.blocked = blocked;
    w.structAt = structAt;
    w.ice = new Set(m.terrain.ice.map(([x, y]) => tkey(x, y)));
    w.gridRock = new Set(m.terrain.rock.map(([x, y]) => tkey(x, y)));
  }

  function isBlocked(wx, wy) {
    if (wx < 0 || wy < 0 || wx >= GW || wy >= GH) return true;
    return S.world.blocked.has(tkey(wx, wy));
  }

  function hitsWall(x, y) {
    const pts = [[x - 10, y - 6], [x + 10, y - 6], [x - 10, y + 4], [x + 10, y + 4]];
    return pts.some(([px, py]) => isBlocked(Math.floor(px / T), Math.floor(py / T)));
  }

  // Breadth-first search over world tiles; returns tile-centre waypoints.
  function findPath(fromX, fromY, goalWx, goalWy, allowGoalBlocked) {
    const sx = clamp(Math.floor(fromX / T), 0, GW - 1), sy = clamp(Math.floor(fromY / T), 0, GH - 1);
    const goal = tkey(goalWx, goalWy);
    const prev = new Map([[tkey(sx, sy), null]]);
    const q = [[sx, sy]];
    let found = null;
    while (q.length) {
      const [x, y] = q.shift();
      if (tkey(x, y) === goal) { found = [x, y]; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = tkey(nx, ny);
        if (prev.has(k)) continue;
        if (isBlocked(nx, ny) && !(allowGoalBlocked && k === goal)) continue;
        prev.set(k, [x, y]);
        q.push([nx, ny]);
      }
    }
    if (!found) return null;
    const path = [];
    let cur = found;
    while (cur) { path.unshift(center(cur[0], cur[1])); cur = prev.get(tkey(cur[0], cur[1])); }
    path.shift();
    return path;
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
      player: null, npcs: {}, remote: {}, images: {}, particles: [], ground: null,
      world: null, worldSeed: null, data: null, focus: null, menuOpen: null,
      view: { w: 0, h: 0, zoom: 1, dpr: 1, camX: 0, camY: 0 }, time: 0, last: 0,
      lastSent: 0, lastSentKey: '', hintUntil: 14, touch: false,
    };
    S.touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    buildOverlay();
    bindInput();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el);
    requestAnimationFrame(loop);
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
    o.append(S.hint, S.stamina, S.prompt, S.menu, S.pad, S.btnAct, S.btnRun);
    S.btnAct.addEventListener('click', () => interact());
    const runOn = e => { e.preventDefault(); S.sprintHeld = true; S.btnRun.classList.add('on'); };
    const runOff = () => { S.sprintHeld = false; S.btnRun.classList.remove('on'); };
    S.btnRun.addEventListener('pointerdown', runOn);
    S.btnRun.addEventListener('pointerup', runOff);
    S.btnRun.addEventListener('pointerleave', runOff);
    S.pad.addEventListener('pointerdown', e => {
      S.joy.id = e.pointerId;
      S.pad.setPointerCapture(e.pointerId);
      joyMove(e);
    });
    S.pad.addEventListener('pointermove', e => { if (S.joy.id === e.pointerId) joyMove(e); });
    const joyEnd = () => { S.joy = { x: 0, y: 0, id: null }; S.knob.style.transform = ''; };
    S.pad.addEventListener('pointerup', joyEnd);
    S.pad.addEventListener('pointercancel', joyEnd);
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
      if (!S.player || !S.world) return;
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

  // ---------- data from ui.js ----------
  function update(data) {
    S.data = data;
    if (!data.mission) return;
    world();
    if (!S.player) {
      const [x, y] = spawnPoint();
      S.player = { x, y, dir: 'down', phase: 0, moving: false, stamina: 100, path: null, inRover: false, crewId: data.controlId };
    }
    S.player.crewId = data.controlId;
    S.canvas.setAttribute('aria-label', t('sf.aria'));
    S.hint.textContent = t(S.touch ? 'sf.hintTouch' : 'sf.hintKeys');
    S.btnAct.setAttribute('aria-label', t('sf.interact'));
    S.btnRun.setAttribute('aria-label', t('sf.sprint'));
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

  // ---------- simulation ----------
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!S.el.isConnected || document.hidden || !S.data || !S.data.mission) { S.last = ts; return; }
    const dt = Math.min(0.05, (ts - (S.last || ts)) / 1000);
    S.last = ts;
    S.time += dt;
    world();
    stepPlayer(dt);
    stepNpcs(dt);
    stepRemote(dt);
    stepFocus();
    draw();
    maybeSend(ts);
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
      const sp = SPEED * (sprinting ? SPRINT_X : 1) * (p.inRover ? ROVER_X : 1) * Math.min(1, len);
      const stuck = hitsWall(p.x, p.y);
      const mx = p.x + nx * sp * dt, my = p.y + ny * sp * dt;
      if (stuck || !hitsWall(mx, p.y)) p.x = clamp(mx, 12, WW - 12);
      if (stuck || !hitsWall(p.x, my)) p.y = clamp(my, 20, WH - 6);
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

  function quarry(rnd) {
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rnd() * GW), y = Math.floor(rnd() * GH);
      const [gx, gy] = worldToGrid(x, y);
      if (!inGrid(gx, gy) && !isBlocked(x, y)) { const [cx, cy] = center(x, y); return [cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 20]; }
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
    const me = controlledCrew();
    if (me && me.status !== 'dead') out.push({ id: me.id, role: me.role, x: S.player.x, y: S.player.y, dir: S.player.dir, phase: S.player.phase, moving: S.player.moving, you: true, down: me.status === 'down', rover: S.player.inRover });
    for (const [id, n] of Object.entries(S.npcs)) {
      const c = byId(id);
      if (!c || c.status === 'dead') continue;
      out.push({ id, role: c.role, x: n.x, y: n.y, dir: n.dir, phase: n.phase, moving: n.moving, down: c.status === 'down', working: n.working, job: n.job });
    }
    for (const [id, r] of Object.entries(S.remote)) {
      const c = byId(id);
      if (!c || c.status === 'dead') continue;
      out.push({ id, role: c.role, x: r.x, y: r.y, dir: r.dir, phase: r.phase, moving: r.moving, remote: true, down: c.status === 'down', rover: r.rover });
    }
    return out;
  }

  function focusAt(wx, wy) {
    const m = S.data.mission;
    const [gx, gy] = worldToGrid(wx, wy);
    const w = S.world;
    if (wx === w.lander.wx && wy === w.lander.wy) return { kind: 'lander', key: 'lander', wx, wy };
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
    if (w.gridRock.has(tkey(gx, gy))) return { kind: 'rock', key: 'r:' + gx + ',' + gy, gx, gy, wx, wy };
    return { kind: 'empty', key: 'e:' + gx + ',' + gy, gx, gy, wx, wy, ice: w.ice.has(tkey(gx, gy)) };
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
  function buildGround() {
    const m = S.data.mission;
    const c = document.createElement('canvas');
    c.width = WW;
    c.height = WH;
    const g = c.getContext('2d');
    const r = seeded(m.seed + '|ground');
    const shades = ['#6c3523', '#733a25', '#7a3e27', '#683322', '#70381f'];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      g.fillStyle = shades[Math.floor(r() * shades.length)];
      g.fillRect(x * T, y * T, T, T);
    }
    // soft noise blotches
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(40,14,8,0.10)' : 'rgba(200,120,80,0.07)';
      g.beginPath();
      g.ellipse(r() * WW, r() * WH, 8 + r() * 40, 5 + r() * 22, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    for (const cr of S.world.craters) {
      g.fillStyle = 'rgba(40,14,8,0.25)';
      g.beginPath(); g.ellipse(cr.x, cr.y, cr.r, cr.r * 0.62, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(210,140,100,0.25)';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(cr.x, cr.y + 1, cr.r, cr.r * 0.62, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.6 ? '#5a2a1b' : '#8f4d33';
      g.fillRect(r() * WW, r() * WH, 1.5 + r() * 1.5, 1.5 + r() * 1.5);
    }
    // the base pad: compacted regolith
    const px = PAD * T, py = PAD * T;
    g.fillStyle = 'rgba(230,170,120,0.07)';
    g.fillRect(px, py, D.GRID.w * T, D.GRID.h * T);
    g.strokeStyle = 'rgba(255,220,190,0.10)';
    g.lineWidth = 1;
    g.setLineDash([4, 6]);
    for (let x = 0; x <= D.GRID.w; x++) { g.beginPath(); g.moveTo(px + x * T, py); g.lineTo(px + x * T, py + D.GRID.h * T); g.stroke(); }
    for (let y = 0; y <= D.GRID.h; y++) { g.beginPath(); g.moveTo(px, py + y * T); g.lineTo(px + D.GRID.w * T, py + y * T); g.stroke(); }
    g.setLineDash([]);
    // ice tiles
    for (const [gx, gy] of m.terrain.ice) {
      const [wx, wy] = gridToWorld(gx, gy);
      const X = wx * T, Y = wy * T;
      g.fillStyle = '#8fb6c7';
      g.fillRect(X + 2, Y + 2, T - 4, T - 4);
      g.strokeStyle = '#e1f3fa';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X + 8, Y + 20); g.lineTo(X + 22, Y + 26); g.lineTo(X + 32, Y + 17); g.lineTo(X + 46, Y + 28); g.stroke();
      g.beginPath(); g.moveTo(X + 12, Y + 44); g.lineTo(X + 24, Y + 40); g.lineTo(X + 33, Y + 48); g.lineTo(X + 48, Y + 43); g.stroke();
    }
    // rover tracks
    g.strokeStyle = 'rgba(40,14,8,0.28)';
    g.lineWidth = 3;
    g.setLineDash([5, 4]);
    const [hx, hy] = center(...gridToWorld(D.GRID.hq[0], D.GRID.hq[1]));
    for (const off of [-6, 6]) {
      g.beginPath();
      g.moveTo(hx + off, hy + T * 2.6);
      g.bezierCurveTo(hx + 80 + off, WH - 40, WW - 140, WH - 90 + off, WW - 10, WH - 150 + off);
      g.stroke();
    }
    g.setLineDash([]);
    S.ground = c;
  }

  function drawRock(ctx, d) {
    const [cx, cy] = center(d.wx, d.wy);
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

  function drawLander(ctx) {
    const [cx, cy] = center(S.world.lander.wx, S.world.lander.wy);
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

  function drawAvatar(ctx, a, name) {
    const color = A.ROLE[a.role] || '#ccc';
    const x = a.x, y = a.y;
    ctx.save();
    if (a.you) {
      const pulse = 0.55 + 0.45 * Math.sin(S.time * 4);
      ctx.strokeStyle = `rgba(140,188,236,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 12, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    if (a.rover) {
      const img = moduleImage('rover', 1);
      if (ready(img)) {
        ctx.save();
        if (a.dir === 'left') { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
        ctx.drawImage(img, x - 34, y - 52, 68, 68);
        ctx.restore();
      }
      tag(ctx, x, y - 50, name, color, a.you);
      ctx.restore();
      return;
    }
    if (a.down) {
      ctx.translate(x, y - 6);
      ctx.fillStyle = '#e9e2d8';
      roundRect(ctx, -16, -6, 26, 12, 5); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-10, -6, 3, 12);
      ctx.fillStyle = '#f3eee7'; ctx.beginPath(); ctx.arc(14, 0, 8, 0, Math.PI * 2); ctx.fill();
      const pulse = 0.5 + 0.5 * Math.sin(S.time * 5);
      ctx.fillStyle = `rgba(244,110,95,${0.6 + pulse * 0.4})`;
      ctx.fillRect(-2, -26, 4, 14); ctx.fillRect(-7, -21, 14, 4);
      ctx.restore();
      tag(ctx, x, y - 34, name, '#f46e5f', a.you);
      return;
    }
    const bob = a.moving ? Math.abs(Math.sin(a.phase)) * 2 : Math.sin(S.time * 2 + x) * 0.6;
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
      const wob = Math.sin(S.time * 6) * 1.5;
      ctx.fillStyle = 'rgba(20,14,16,0.85)';
      ctx.beginPath(); ctx.arc(x + 15, hy - 14 + wob, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x + 15, hy - 14 + wob, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    tag(ctx, x, hy - 17, name, color, a.you);
  }

  function tag(ctx, x, y, text, color, you) {
    if (!text) return;
    S.tags.push({ x, y, text, color, you });
  }

  // Name tags are laid out after all sprites so they never pile on top of each other.
  function drawTags(ctx) {
    const placed = [];
    ctx.font = '600 10px "Be Vietnam Pro", system-ui, sans-serif';
    const list = S.tags.slice().sort((a, b) => (b.you - a.you) || (b.y - a.y));
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
    S.tags.length = 0;
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

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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

  function draw() {
    const ctx = S.ctx, v = S.view, m = S.data.mission, plan = S.data.plan, fc = S.data.forecast;
    if (!v.w) resize();
    if (!S.ground) buildGround();
    const p = S.player;
    const viewW = v.w / v.zoom, viewH = v.h / v.zoom;
    const targetX = clamp(p.x - viewW / 2, Math.min(0, (WW - viewW) / 2), Math.max(0, WW - viewW));
    const targetY = clamp(p.y - 20 - viewH / 2, Math.min(0, (WH - viewH) / 2), Math.max(0, WH - viewH));
    v.camX += (targetX - v.camX) * 0.15;
    v.camY += (targetY - v.camY) * 0.15;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3a1d14';
    ctx.fillRect(0, 0, S.canvas.width, S.canvas.height);
    const k = v.dpr * v.zoom;
    ctx.setTransform(k, 0, 0, k, -v.camX * k, -v.camY * k);
    ctx.drawImage(S.ground, 0, 0);

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
    for (const d of S.world.decor) sprites.push({ y: d.wy * T + T / 2 + 10, draw: () => drawRock(ctx, d) });
    for (const [gx, gy] of m.terrain.rock) {
      const [wx, wy] = gridToWorld(gx, gy);
      sprites.push({ y: wy * T + T / 2 + 10, draw: () => drawRock(ctx, { wx, wy, s: 1 }) });
    }
    sprites.push({ y: S.world.lander.wy * T + T / 2 + 22, draw: () => drawLander(ctx) });
    for (const a of avatars()) {
      let name = S.data.crewName(a.id);
      if (a.you) name = t('sf.you') + ' · ' + name;
      sprites.push({ y: a.y, draw: () => drawAvatar(ctx, a, name) });
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
    S.tags = [];
    for (const s of sprites) s.draw();
    drawTags(ctx);

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
    return {
      player: { x: S.player.x, y: S.player.y, dir: S.player.dir, inRover: S.player.inRover, stamina: S.player.stamina, path: S.player.path && S.player.path.length },
      lastTap: S.lastTap, focus: S.focus && S.focus.kind, menu: S.menuOpen, npcs: Object.keys(S.npcs), tileScreen, toScreen,
      remote: JSON.parse(JSON.stringify(S.remote)),
      blocked: (wx, wy) => isBlocked(wx, wy), path: (tx, ty) => findPath(S.player.x, S.player.y, tx, ty, true),
    };
  }

  root.SolSurface = { mount, update, setRemote, isMounted: () => !!S, probe };
})(typeof self !== 'undefined' ? self : this);
