/*
 * SOL 500 — exploring on the surface (spec §3): finds, dropped loads and the parked rover on the ground; holding E to
 * collect, survey, pick up or revive; the suit, the rover's battery and delivering at the base; and the HUD for all of
 * it. The rules live in src/expedition.js. This layer decides when to ask for them, through the ui.js hook `exp` (solo
 * play runs them on the spot, co-op sends them to the server), and draws what the mission says. Browser-only (SolEva).
 *
 * API: SolEva.create(env) → eva
 *        env: { t(key, params), hooks(), crewName(id), home(), drawRover(ctx, x, y), player() }
 *      eva.el                                       the HUD node for the surface overlay
 *      eva.sync(data) → { round, fresh }            round: a new round began; fresh: first look at this mission/seat
 *      eva.reset()                                  a new mission or room: forget the last one's suit, battery, collapse and hold
 *      eva.canMove(player, nx, ny) → may your astronaut step to (nx, ny)? (world px)
 *      eva.step(dt, player, world, moved, focus)    every frame: suit, battery, delivering, holds, the HUD
 *      eva.focusAt(x, y, player, world) → a focus on a find, a dropped load, a collapsed crewmate or the parked rover
 *      eva.holdable(focus) · eva.label(focus) · eva.start(focus) · eva.stop()       E / the action button
 *      eva.hasRoom() → does your backpack take another load?
 *      eva.act(type, player) → Promise of the rules' answer (board, park) · eva.canister(player) (the button, or Q)
 *      eva.drawZone(ctx) · eva.sprites(x0, y0, x1, y1, world, time) → [{ y, draw(ctx) }] · eva.drawOver(ctx, remote)
 *      eva.marks(world, px, py) → minimap markers · eva.report() → { suit, driven } for the position message
 *      eva.roverAtBay(player) · eva.driving() · eva.collapsed(crewId) · eva.state() (play-testing)
 */
(function (root) {
  'use strict';
  const D = root.SolData, W = root.SolWorldgen, X = root.SolExpedition, P = root.SolPaint, SW = root.SolWorld, A = root.SolArt;
  const { drawFind, drawDrop, drawRing, drawSuitBar, roundRect } = P.sprites;
  const XD = D.EXPEDITION;
  const T = 64, ICY = W.REGIONS.indexOf('icy');
  const REACH = 0.9 * T;                        // how close the spot you look at must be to a find
  const COLORS = { ice: '#9fd3ea', metal: '#d9b46a', pod: '#ece5db', science: '#6fa8ff' };
  const RES_ICON = { water: 'water', materials: 'materials', food: 'food', o2: 'o2', spares: 'spares', science: 'science' };
  const QUIET = ['deliver', 'collapse', 'park'];    // no message when these are refused (they are retried or harmless)

  function create(env) {
    const t = (k, p) => env.t(k, p);
    let data = null, me = null, turn = null, wasDown = false;
    let suit = XD.suit, driven = 0, hold = null, keyHeld = false;
    let now = 0, deliverAt = -1e9, collapseAt = -1e9, reportAt = -1e9, marksAt = -1e9, marksCache = [];
    let note = null;                               // { text, cls, until }

    const mission = () => (data && data.mission) || null;
    const exp = () => mission().expedition;
    const crew = () => (mission() && me ? mission().crew.find(c => c.id === me) || null : null);
    const pack = () => (me && Array.isArray(exp().carried[me]) ? exp().carried[me] : []);
    const collapsed = id => !!(mission() && mission().expedition && mission().expedition.collapsed[id]);
    const benched = () => !!(me && exp().benched.includes(me));
    const live = () => { const m = mission(), c = crew(); return !!m && !!m.expedition && m.status === 'active' && !!c && c.status === 'active'; };
    const hasRoom = () => live() && pack().length < X.capacity(mission(), me);
    const at = p => ({ x: Math.round(p.x), y: Math.round(p.y) });
    const near2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
    const secs = s => (Math.round(s * 10) / 10).toString();
    function say(text, cls, s) { note = { text, cls: cls || '', until: now + (s || 3) }; }

    // ---------- the HUD ----------
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const el = node('div', 'sf-eva');
    const meter = () => { const row = node('div', 'sf-suit'), k = node('span', 'k'), bar = node('span', 'bar'), fill = node('i'), v = node('b'); bar.appendChild(fill); row.append(k, bar, v); return { row, k, fill, v }; };
    const suitM = meter(), battM = meter();
    battM.row.classList.add('batt');
    const packEl = node('div', 'sf-pack');
    const canBtn = node('button', 'sf-can');
    canBtn.type = 'button';
    canBtn.addEventListener('click', () => canister(env.player && env.player()));
    const noteEl = node('p', 'sf-evanote');
    noteEl.setAttribute('role', 'status');
    el.append(suitM.row, battM.row, packEl, canBtn, noteEl);
    const shown = {};
    const text = (n, k, v) => { if (shown[k] !== v) { shown[k] = v; n.textContent = v; } };
    const prop = (k, v, set) => { if (shown[k] !== v) { shown[k] = v; set(v); } };

    function statusNote(p) {
      if (!me || !mission()) return null;
      if (collapsed(me)) return { text: t('eva.collapsedCoop'), cls: 'crit' };
      if (benched()) return { text: t('eva.benched'), cls: 'warn' };
      if (p && p.inRover && driven >= XD.roverRange) return { text: t('eva.flat'), cls: 'warn' };
      if (live() && pack().length >= X.capacity(mission(), me) && !(p && X.inBaseZone(p))) return { text: t('eva.full'), cls: '' };
      if (live() && suit <= XD.suit * 0.2 && !(p && X.inBaseZone(p))) return { text: t('eva.low'), cls: 'crit' };
      return null;
    }

    function renderHud(p) {
      const hide = !me || !mission() || !mission().expedition || mission().status !== 'active';
      prop('hide', hide, v => { el.hidden = v; });
      if (hide) return;
      const atBase = !!p && X.inBaseZone(p);
      text(suitM.k, 'sk', t('eva.suit'));
      text(suitM.v, 'sv', atBase && !benched() ? t('eva.paused', { s: Math.ceil(suit) }) : Math.ceil(suit) + ' s');
      prop('sw', (100 * suit / XD.suit).toFixed(1) + '%', v => { suitM.fill.style.width = v; });
      const f = suit / XD.suit;
      prop('sc', 'sf-suit' + (f <= 0.2 ? ' crit' : f <= 0.4 ? ' warn' : ''), v => { suitM.row.className = v; });
      const inRover = !!(p && p.inRover);
      prop('bh', !inRover, v => { battM.row.hidden = v; });
      if (inRover) {
        const left = Math.max(0, XD.roverRange - driven);
        text(battM.k, 'bk', t('eva.battery'));
        text(battM.v, 'bv', Math.floor(left) + ' ' + t('eva.tiles'));
        prop('bw', (100 * left / XD.roverRange).toFixed(1) + '%', v => { battM.fill.style.width = v; });
      }
      const items = live() || collapsed(me) ? pack() : [], cap = X.capacity(mission(), me);
      prop('pk', items.map(i => i.res + (i.canister ? '*' : '')).join(',') + '|' + cap + '|' + (shown.lang || ''), () => {
        packEl.textContent = '';
        packEl.setAttribute('aria-label', t('eva.pack', { n: items.length, m: cap }));
        for (let i = 0; i < cap; i++) {
          const it = items[i], slot = node('span', 'slot' + (it ? ' full' : ''));
          if (it) { slot.innerHTML = A.icon(RES_ICON[it.res] || 'materials', 14); slot.title = t('haul.' + it.res, { n: it.amount }); }
          packEl.appendChild(slot);
        }
      });
      prop('ch', !(live() && items.some(i => i.canister)), v => { canBtn.hidden = v; });
      text(canBtn, 'ct', t('eva.useCanister', { s: XD.canister.suit }));
      const n = note && note.until > now ? note : statusNote(p);
      text(noteEl, 'nt', n ? n.text : '');
      prop('nc', 'sf-evanote' + (n && n.cls ? ' ' + n.cls : ''), v => { noteEl.className = v; });
      prop('nh', !n, v => { noteEl.hidden = v; });
    }

    // ---------- asking the rules (through ui.js) ----------
    function act(type, p, payload) {
      const h = env.hooks();
      if (!h || !h.exp) return Promise.resolve({ error: 'net' });
      return Promise.resolve(h.exp(type, payload || {}, p ? at(p) : null)).then(r => {
        const res = r || { error: 'net' };
        if (res.error && !QUIET.includes(type)) say(t('eva.err.' + res.error), 'warn');
        return res;
      }, () => { if (!QUIET.includes(type)) say(t('eva.err.net'), 'warn'); return { error: 'net' }; });
    }

    // Breathes an O₂ canister from your backpack (the button, or Q): +45 s of suit now.
    function canister(p) {
      if (!live() || !pack().some(i => i.canister)) return;
      act('canister', p).then(r => {
        if (!r.ok) return;
        suit = Number.isFinite(r.suit) ? r.suit : Math.min(XD.suit, suit + XD.canister.suit);
        say(t('eva.breathed', { s: XD.canister.suit }), 'ok');
      });
    }

    // ---------- each new look at the mission ----------
    function sync(d) {
      data = d;
      const m = d.mission;
      if (!m || !m.expedition) return { round: false, fresh: false };
      const id = d.controlId || null;
      let round = false, fresh = false;
      if (m.turn !== turn || id !== me) {
        round = turn != null && m.turn !== turn && id === me;
        fresh = !round;
        turn = m.turn;
        me = id;
        suit = me ? X.suitOf(m, me) : XD.suit;
        driven = Number(m.expedition.roverDriven) || 0;
        hold = null;
        collapseAt = -1e9;
        wasDown = !!(me && m.expedition.collapsed[me]);
      }
      const down = !!(me && m.expedition.collapsed[me]);
      if (wasDown && !down && me) { suit = X.suitOf(m, me); say(t('eva.revived', { s: XD.reviveSuit }), 'ok', 4); }
      wasDown = down;
      if (down || benched()) suit = 0;
      driven = Math.max(driven, Number(m.expedition.roverDriven) || 0); // it only ever goes up within a round
      shown.lang = d.lang;
      return { round, fresh };
    }

    // A new mission or room (SolSurface.reset): nothing of the last one's exploring carries over, so the next sync is a
    // fresh look even with the same astronaut in the same round.
    function reset() {
      data = me = turn = hold = note = null;
      wasDown = keyHeld = false;
      suit = XD.suit;
      driven = 0;
      deliverAt = collapseAt = reportAt = marksAt = -1e9;
      marksCache = [];
    }

    // ---------- every frame ----------
    function canMove(p, nx, ny) {
      if (!me || !mission() || !mission().expedition) return true;
      if (collapsed(me)) return false;
      const atBase = X.inBaseZone(p);
      if (benched() && atBase && !X.inBaseZone({ x: nx, y: ny })) return false; // solo: back out next round
      if (!atBase && suit <= 0) return false;
      if (p.inRover && driven >= XD.roverRange) return false;
      return true;
    }

    function step(dt, p, world, moved, focus) {
      now += dt;
      if (live()) {
        const atBase = X.inBaseZone(p);
        if (p.inRover && moved > 0) driven = Math.min(XD.roverRange, driven + moved / T);
        if (!atBase && !collapsed(me) && !benched()) {
          let k = p.inRover && !hold ? XD.drain.rover : 1;   // you step out of the rover to work
          if (p.sprinting) k *= XD.drain.sprint;
          if (world.region(Math.floor(p.x / T), Math.floor(p.y / T)) === ICY) k *= XD.drain.icy;
          suit = Math.max(0, suit - dt * k);
          if (suit <= 0 && now - collapseAt > 3) {
            collapseAt = now;
            hold = null;
            act('collapse', p).then(r => {
              if (r.benched) { env.home(); say(t('eva.collapsedSolo'), 'crit', 8); }
            });
          }
        }
        if (atBase && pack().length && !collapsed(me) && now - deliverAt > 1.5) { // the rules refuse anything while you are down
          deliverAt = now;
          const n = pack().length;
          act('deliver', p).then(r => { if (r.ok) say(t(n === 1 ? 'eva.delivered1' : 'eva.delivered', { n }), 'ok', 4); });
        }
        if (hold) {
          if (p.moving || !focus || focus.key !== hold.f.key) hold = null;
          else if ((hold.t += dt) >= hold.dur) finish(p);
        }
        if (now - reportAt > 2) {
          reportAt = now;
          const h = env.hooks();
          if (h && h.suit) h.suit(suit, p.inRover ? driven : null);
        }
      }
      renderHud(p);
    }

    function finish(p) {
      const f = hold.f;
      hold = null;
      const ask = f.kind === 'find' ? act('collect', p, { find: f.id })
        : f.kind === 'drop' ? act('pickup', p, { drop: f.id })
          : act('revive', p, { target: f.id });
      ask.then(r => {
        if (!r.ok) return;
        if (f.kind === 'find') say(r.item ? t('haul.' + r.item.res, { n: r.item.amount }) : t('eva.collected'), 'ok', 2);
        else if (f.kind === 'drop') say(t('eva.pickedUp'), 'ok', 2);
        else say(t('eva.revivedThem', { name: env.crewName(f.id) }), 'ok', 3);
        if (f.kind === 'find' && keyHeld && live()) hold = { f, t: 0, dur: hold0(f) }; // keep going while E is held
      });
    }

    // ---------- what you can work on ----------
    function hold0(f) {
      const role = crew() && crew().role;
      return X.holdSeconds(f.kind === 'find' ? f.find.kind : f.kind === 'drop' ? 'pickup' : 'revive', role);
    }
    const holdable = f => !!f && (f.kind === 'find' || f.kind === 'drop' || f.kind === 'revive');

    function focusAt(lx, ly, p, world) {
      if (!live() || collapsed(me) || benched()) return null;
      const m = mission(), x = exp();
      let best = null, bestD = REACH * REACH;
      const consider = (px, py, f) => {
        const d = Math.min(near2(px, py, lx, ly), near2(px, py, p.x, p.y - 8));
        if (d < bestD) { bestD = d; best = f; }
      };
      const ccx = SW.chunkOf(Math.floor(p.x / T)), ccy = SW.chunkOf(Math.floor(p.y / T));
      for (let cy = ccy - 1; cy <= ccy + 1; cy++) for (let cx = ccx - 1; cx <= ccx + 1; cx++) {
        const c = world.peek(cx, cy);
        if (!c) continue;
        for (const f of c.finds) {
          const id = cx + ',' + cy + ':' + f.n;
          if (X.loadsLeft(m, f, id) <= 0) continue;
          consider((f.x + 0.5) * T, (f.y + 0.5) * T, { kind: 'find', key: 'f:' + id, id, find: f, wx: f.x, wy: f.y, x: (f.x + 0.5) * T, y: (f.y + 0.5) * T });
        }
      }
      for (const d of x.drops) consider(d.x, d.y, { kind: 'drop', key: 'd:' + d.id, id: d.id, x: d.x, y: d.y });
      if (m.coop) for (const id of Object.keys(x.collapsed)) {
        if (id === me) continue;
        const s = x.collapsed[id];
        consider(s.x, s.y, { kind: 'revive', key: 'v:' + id, id, x: s.x, y: s.y - 10 });
      }
      if (x.rover && !x.rover.driver && !p.inRover) consider(x.rover.x, x.rover.y, { kind: 'rover', key: 'rover-parked', parked: true, x: x.rover.x, y: x.rover.y });
      return best;
    }

    function label(f) {
      const role = crew() && crew().role;
      if (f.kind === 'find') {
        const what = t('find.' + f.find.kind) + (f.find.sub ? ' · ' + t('sci.' + f.find.sub) : '');
        return t(f.find.kind === 'science' ? 'eva.survey' : 'eva.collect', { what, s: secs(X.holdSeconds(f.find.kind, role)) });
      }
      if (f.kind === 'drop') return t('eva.pickup', { s: secs(X.holdSeconds('pickup', role)) });
      if (f.kind === 'revive') return t('eva.revive', { name: env.crewName(f.id), s: secs(X.holdSeconds('revive', role)) });
      if (f.kind === 'rover') return t('sf.boardRover');
      return '';
    }

    function start(f) {
      if (!holdable(f) || !live()) return false;
      keyHeld = true;
      if (!hold || hold.f.key !== f.key) hold = { f, t: 0, dur: hold0(f) };
      return true;
    }
    function stop() { keyHeld = false; hold = null; }

    // ---------- drawing ----------
    // The base zone: where the suit pauses and loads are delivered (5 × 5 tiles around the HQ).
    function drawZone(ctx) {
      if (!mission() || !mission().expedition) return;
      const r = (XD.baseZone + 0.5) * T;
      ctx.save();
      ctx.strokeStyle = 'rgba(140,188,236,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      roundRect(ctx, T / 2 - r, T / 2 - r, 2 * r, 2 * r, 18);
      ctx.stroke();
      ctx.restore();
    }

    function sprites(x0, y0, x1, y1, world, time) {
      const out = [];
      if (!mission() || !mission().expedition) return out;
      const m = mission(), x = exp();
      const tx0 = Math.floor(x0 / T) - 1, ty0 = Math.floor(y0 / T) - 1, tx1 = Math.floor(x1 / T) + 1, ty1 = Math.floor(y1 / T) + 1;
      for (let cy = SW.chunkOf(ty0); cy <= SW.chunkOf(ty1); cy++) for (let cx = SW.chunkOf(tx0); cx <= SW.chunkOf(tx1); cx++) {
        const c = world.peek(cx, cy);
        if (!c) continue;
        for (const f of c.finds) {
          if (f.x < tx0 || f.x > tx1 || f.y < ty0 || f.y > ty1) continue;
          if (X.loadsLeft(m, f, cx + ',' + cy + ':' + f.n) <= 0) continue;
          const fx = (f.x + 0.5) * T, fy = (f.y + 0.5) * T;
          out.push({ y: fy + 12, draw: ctx => drawFind(ctx, f, fx, fy, time) });
        }
      }
      const inView = (px, py) => px > x0 - T && px < x1 + T && py > y0 - T && py < y1 + 2 * T;
      for (const d of x.drops) if (inView(d.x, d.y)) out.push({ y: d.y + 8, draw: ctx => drawDrop(ctx, d.x, d.y) });
      if (x.rover && !x.rover.driver && inView(x.rover.x, x.rover.y)) {
        const r = x.rover;
        out.push({ y: r.y + 10, draw: ctx => env.drawRover(ctx, r.x, r.y) });
      }
      return out;
    }

    // Over the fog: the hold ring, and teammates' suit bars (co-op positions carry them).
    function drawOver(ctx, remote) {
      if (hold) drawRing(ctx, hold.f.x, hold.f.y - 40, hold.t / hold.dur);
      for (const r of Object.values(remote || {})) {
        if (r.suit == null || r.suit >= XD.suit || X.inBaseZone(r)) continue;
        drawSuitBar(ctx, r.x, r.y - (r.rover ? 78 : 66), r.suit / XD.suit);
      }
    }

    // Minimap and map markers: finds you have seen (the biologist senses ice and methane vents further), dropped loads,
    // the parked rover. Rebuilt at most every 150 ms.
    function marks(world, px, py) {
      if (!mission() || !mission().expedition || !world) return [];
      if (now - marksAt < 0.15) return marksCache;
      marksAt = now;
      const m = mission(), x = exp(), out = [];
      const sniff = ((D.SKILLS[crew() && crew().role] || {}).sight) || 0;
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      for (let cy = SW.chunkOf(ty - 80); cy <= SW.chunkOf(ty + 79); cy++) for (let cx = SW.chunkOf(tx - 80); cx <= SW.chunkOf(tx + 79); cx++) {
        const c = world.peek(cx, cy);
        if (!c) continue;
        for (const f of c.finds) {
          if (X.loadsLeft(m, f, cx + ',' + cy + ':' + f.n) <= 0) continue;
          const smelt = sniff && (f.kind === 'ice' || f.sub === 'vent') && near2(f.x, f.y, tx, ty) <= sniff * sniff;
          if (smelt || world.seen(f.x, f.y)) out.push({ x: (f.x + 0.5) * T, y: (f.y + 0.5) * T, color: COLORS[f.kind] });
        }
      }
      for (const d of x.drops) out.push({ x: d.x, y: d.y, color: '#f46e5f' });
      if (x.rover && !x.rover.driver) out.push({ x: x.rover.x, y: x.rover.y, color: '#e9e2d8', square: true });
      marksCache = out;
      return out;
    }

    return {
      el, sync, reset, canMove, step, focusAt, holdable, hasRoom, label, start, stop, act, canister, drawZone, sprites, drawOver, marks,
      report: () => ({ suit: Math.round(suit * 10) / 10, driven: Math.round(driven * 10) / 10 }),
      roverAtBay: p => !!mission() && !!mission().expedition && !exp().rover && !(p && p.inRover),
      driving: () => !!(me && mission() && mission().expedition && exp().rover && exp().rover.driver === me),
      collapsed,
      state: () => ({ suit, driven, hold: hold && hold.f.key, collapsed: collapsed(me), benched: !!me && !!mission() && benched(), pack: me && mission() ? pack().length : 0 }),
      qaSuit: s => { suit = Math.max(0, Math.min(XD.suit, Number(s) || 0)); }, // play-testing: jump the suit level
    };
  }

  root.SolEva = { create };
})(typeof self !== 'undefined' ? self : this);
