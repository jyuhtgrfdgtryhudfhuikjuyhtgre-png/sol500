/*
 * SOL 500 — exploring on the surface (spec §3): finds, dropped loads and the parked rover on the ground; holding E to
 * collect, survey, pick up or revive; the suit, the rover's battery and delivering at the base; the dangers (spec §3.4:
 * the solar flare's countdown and the cover from it, dust devils, how far you see in a dust storm); and the HUD for all
 * of it. The rules live in src/expedition.js and src/dangers.js. This layer decides when to ask for them, through the
 * ui.js hook `exp` (solo play runs them on the spot, co-op sends them to the server), and draws what the mission says.
 * Browser-only (SolEva).
 *
 * The round's clock moves the dust devils and times the flare. In solo play it is this layer's own time, which stops
 * while the surface is hidden (like the suit) and is saved with the mission; in co-op it is the server's (data.clock).
 *
 * API: SolEva.create(env) → eva
 *        env: { t(key, params), hooks(), crewName(id), home(), drawRover(ctx, x, y), player(), now() → seconds,
 *               push(dx, dy) (a dust devil throws your astronaut that far, world px) }
 *      eva.el · eva.alert                           the HUD node and the flare's banner, for the surface overlay
 *      eva.sync(data) → { round, fresh }            round: a new round began; fresh: first look at this mission/seat
 *                                                   (data.clock, co-op only: { t: round seconds, at: env.now() then })
 *      eva.reset()                                  a new mission or room: forget the last one's suit, battery, collapse and hold
 *      eva.canMove(player, nx, ny) → may your astronaut step to (nx, ny)? (world px)
 *      eva.step(dt, player, world, moved, focus)    every frame: suit, battery, delivering, holds, dangers, the HUD
 *      eva.focusAt(x, y, player, world) → a focus on a find, a dropped load, a collapsed crewmate or the parked rover
 *      eva.holdable(focus) · eva.label(focus) · eva.start(focus) · eva.stop()       E / the action button
 *      eva.hasRoom() → does your backpack take another load?
 *      eva.act(type, player, payload) → Promise of the rules' answer (board, park) · eva.canister(player) (the button, or Q)
 *      eva.drawZone(ctx, x0, y0, x1, y1, world) the base zone, and every cover in view during a flare warning
 *      eva.sprites(x0, y0, x1, y1, world, time) → [{ y, draw(ctx) }] · eva.drawOver(ctx)
 *      eva.flareFx(player) → { warn: 0–1, flash: 0–1 }: the red edge of a flare countdown, the flash when it hits
 *      eva.view(player) → tiles you can see this round · eva.clock() → the round's clock (s) · eva.alerting()
 *      eva.suitBar(teammate) → 0–1, or null: the suit bar on a teammate's name tag (drawn by SolPaint's drawTags)
 *      eva.marks(world, px, py) → minimap markers · eva.report() → { suit (null while collapsed), driven } for positions
 *      eva.roverAtBay(player) · eva.driving() · eva.collapsed(crewId) · eva.state() (play-testing)
 */
(function (root) {
  'use strict';
  const D = root.SolData, W = root.SolWorldgen, X = root.SolExpedition, Z = root.SolDangers, P = root.SolPaint, SW = root.SolWorld, A = root.SolArt;
  const { drawFind, drawDrop, drawRing, drawDevil, roundRect } = P.sprites;
  const XD = D.EXPEDITION, ZD = D.DANGERS;
  const T = 64, ICY = W.REGIONS.indexOf('icy');
  const REACH = 0.9 * T;                        // how close the spot you look at must be to a find
  const COLORS = { ice: '#9fd3ea', metal: '#d9b46a', pod: '#ece5db', science: '#6fa8ff' };
  const RES_ICON = { water: 'water', materials: 'materials', food: 'food', o2: 'o2', spares: 'spares', science: 'science' };
  // No message when these are refused: they are retried, or harmless.
  const QUIET = ['deliver', 'collapse', 'park', 'flareStart', 'flareEnd'];
  const CAN_BELOW = XD.suit - XD.canister.suit;  // a canister is breathed only when all of its 45 s fit in the suit
  const VERDICT = 8;                             // seconds the flare's verdict stays on the banner

  function create(env) {
    const t = (k, p) => env.t(k, p);
    const wall = () => (env.now ? env.now() : 0);
    let data = null, me = null, turn = null, wasDown = false;
    let suit = XD.suit, driven = 0, hold = null, keyHeld = false;
    let now = 0, deliverAt = -1e9, collapseAt = -1e9, reportAt = -1e9, marksAt = -1e9, marksCache = [];
    let soloClock = 0, coopClock = null, hitAt = -1e9, flareAskAt = -1e9, flareEndAt = -1e9, warned = false;
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
    const clock = () => (coopClock ? coopClock.t + (wall() - coopClock.at) : soloClock);
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
    // The flare's banner: what to do is announced when it changes; the seconds tick on their own, unannounced.
    const alert = node('div', 'sf-alert');
    alert.hidden = true;
    const alertMsg = node('span', 'msg'), alertSecs = node('b');
    alertMsg.setAttribute('role', 'status');
    alertSecs.setAttribute('aria-hidden', 'true');
    alert.append(alertMsg, alertSecs);
    const shown = {};
    const text = (n, k, v) => { if (shown[k] !== v) { shown[k] = v; n.textContent = v; } };
    const prop = (k, v, set) => { if (shown[k] !== v) { shown[k] = v; set(v); } };

    // Are you under cover from the flare? In co-op the server judges with the slack every checked action gets (it knows
    // where you were a moment ago), so the banner and the red edge ask the same; solo has none.
    const covered = p => !!(p && Z.shelterAt(mission(), p, mission().coop ? XD.reach : 0));
    // The flare as your astronaut sees it: null, or { cls, msg, left (seconds, or null) } for the banner.
    function flareView(p) {
      const m = mission(), f = m && m.expedition && m.expedition.flare;
      if (!f || !me) return null;
      const rt = clock();
      if (!f.over) {
        if (rt < f.warn) return null;
        if (rt >= f.end) return { cls: 'crit', msg: t('eva.flare.now'), left: null };
        const safe = covered(p);
        // − 1e-6: float noise (263.182 − 203.182 is 60.00000000000003) must not round a whole second up to 61.
        return { cls: safe ? 'ok' : 'crit', msg: t(safe ? 'eva.flare.covered' : 'eva.flare.run'), left: Math.ceil(f.end - rt - 1e-6) };
      }
      if (rt >= f.end + VERDICT) return null;
      const hit = f.hit.includes(me);
      return { cls: hit ? 'crit' : 'ok', msg: t(hit ? 'eva.flare.hit' : 'eva.flare.missed', { d: ZD.flare.dose }), left: null };
    }

    function statusNote(p) {
      if (!me || !mission()) return null;
      if (collapsed(me)) return { text: t('eva.collapsedCoop'), cls: 'crit' };
      if (benched()) return { text: t('eva.benched'), cls: 'warn' };
      if (p && p.inRover && driven >= XD.roverRange) return { text: t('eva.flat'), cls: 'warn' };
      const atBase = !!p && X.inBaseZone(p);
      if (live() && pack().length >= X.capacity(mission(), me) && !atBase) return { text: t('eva.full'), cls: '' };
      if (live() && suit <= XD.suit * 0.2 && !atBase) return { text: t('eva.low'), cls: 'crit' };
      if (live() && p && !atBase && Z.shelterAt(mission(), p, 0) === 'cave') return { text: t('eva.inCave'), cls: 'ok' };
      return null;
    }
    // The canister button shows only when breathing one now is worth it: outside, on your feet, and with room for all 45 s.
    const canBreathe = p => live() && !collapsed(me) && !benched() && pack().some(i => i.canister) && suit <= CAN_BELOW && !(p && X.inBaseZone(p));

    function renderHud(p) {
      const hide = !me || !mission() || !mission().expedition || mission().status !== 'active';
      prop('hide', hide, v => { el.hidden = v; });
      const fv = hide ? null : flareView(p);
      prop('ah', !fv, v => { alert.hidden = v; });
      if (fv) {
        prop('ac', 'sf-alert ' + fv.cls, v => { alert.className = v; });
        text(alertMsg, 'am', fv.msg);
        text(alertSecs, 'as', fv.left == null ? '' : t('eva.secs', { s: fv.left }));
      }
      if (hide) return;
      const atBase = !!p && X.inBaseZone(p);
      text(suitM.k, 'sk', t('eva.suit'));
      const seconds = t('eva.secs', { s: Math.ceil(suit) }); // one unit, paused or not
      text(suitM.v, 'sv', atBase && !benched() ? t('eva.paused', { v: seconds }) : seconds);
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
      prop('ch', !canBreathe(p), v => { canBtn.hidden = v; });
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
        if (res.error && !QUIET.includes(type)) say(t('eva.err.' + res.error, { s: CAN_BELOW }), 'warn');
        return res;
      }, () => { if (!QUIET.includes(type)) say(t('eva.err.net'), 'warn'); return { error: 'net' }; });
    }

    // Breathes an O₂ canister from your backpack (the button, or Q): +45 s of suit now. The rules get your live suit level,
    // not the one last reported, so the 45 s are added to what you really have.
    function canister(p) {
      if (!live() || !pack().some(i => i.canister)) return;
      act('canister', p, { suit: Math.round(suit * 10) / 10 }).then(r => {
        if (!r.ok) return;
        suit = Number.isFinite(r.suit) ? r.suit : Math.min(XD.suit, suit + XD.canister.suit);
        say(t('eva.breathed', { s: XD.canister.suit }), 'ok');
      });
    }

    // What is waiting outside this round, said once a round when you first look at it.
    function brief(m) {
      const r = m.schedule && m.schedule[m.turn];
      if (!r) return;
      const list = [];
      if (Z.flareDue(m)) list.push(t('eva.brief.flare'));
      if (r.devil) list.push(t('eva.brief.devils'));
      if (r.weather === 'regional' || r.weather === 'global') list.push(t('eva.brief.storm', { n: Z.viewTiles(m, false) }));
      if ((m.events || []).some(e => e.type === 'o2_rupture')) list.push(t('eva.brief.rupture'));
      if (list.length) say(t('eva.brief', { list: list.join(', ') }), 'warn', 8);
    }

    // ---------- each new look at the mission ----------
    function sync(d) {
      data = d;
      coopClock = d.clock && Number.isFinite(d.clock.t) && Number.isFinite(d.clock.at) ? d.clock : null;
      const m = d.mission;
      if (!m || !m.expedition) return { round: false, fresh: false };
      const id = d.controlId || null;
      let round = false, fresh = false;
      if (m.turn !== turn || id !== me) {
        const first = turn == null;
        round = !first && m.turn !== turn && id === me;
        fresh = !round;
        turn = m.turn;
        me = id;
        suit = me ? X.suitOf(m, me) : XD.suit;
        driven = Number(m.expedition.roverDriven) || 0;
        hold = null;
        collapseAt = hitAt = flareAskAt = flareEndAt = -1e9;
        wasDown = !!(me && m.expedition.collapsed[me]);
        if (round) soloClock = 0;
        else if (first) soloClock = Z.clockOf(m); // a reload picks the round's clock up where it was saved
        warned = !!(m.expedition.flare && clock() >= m.expedition.flare.warn); // a warning already under way is not said again
        if (first || round) brief(m);
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
      data = me = turn = hold = note = coopClock = null;
      wasDown = keyHeld = warned = false;
      suit = XD.suit;
      driven = soloClock = 0;
      deliverAt = collapseAt = reportAt = marksAt = hitAt = flareAskAt = flareEndAt = -1e9;
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
      const m = mission();
      if (m && m.expedition && m.status === 'active' && !coopClock) soloClock += dt;
      if (live()) {
        const x = m.expedition, atBase = X.inBaseZone(p), out = !atBase && !collapsed(me) && !benched();
        if (p.inRover && moved > 0) driven = Math.min(XD.roverRange, driven + moved / T);
        if (out) {
          let k = p.inRover && !hold ? XD.drain.rover : 1;   // you step out of the rover to work
          if (p.sprinting) k *= XD.drain.sprint;
          if (world.region(Math.floor(p.x / T), Math.floor(p.y / T)) === ICY) k *= XD.drain.icy;
          suit = Math.max(0, suit - dt * k);
          // A dust devil that catches you on foot throws you aside and takes suit time (spec §3.4); the rover is immune. A hit
          // that empties the suit throws nobody: you collapse where it caught you, which is where the server anchors it.
          const d = !p.inRover && now - hitAt > ZD.devils.calm ? Z.devilHit(m, p, clock()) : null;
          if (d) {
            hitAt = now;
            hold = null;
            suit = Math.max(0, suit - ZD.devils.suit);
            let dx = p.x - d.x, dy = p.y - d.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1) { dx = d.dx; dy = d.dy; } else { dx /= len; dy /= len; }
            if (env.push && suit > 0) env.push(dx * ZD.devils.push * T, dy * ZD.devils.push * T);
            say(t('eva.devil', { s: ZD.devils.suit }), 'warn', 4);
          }
          if (suit <= 0 && now - collapseAt > 3) {
            collapseAt = now;
            hold = null;
            act('collapse', p, { driven: Math.round(driven * 10) / 10 }).then(r => {
              if (r.benched) { env.home(); say(t('eva.collapsedSolo'), 'crit', 8); }
            });
          }
        }
        // Solo play times its own solar flare: the first step outside starts the warning, and its end checks your cover.
        // In co-op the server does both.
        if (!m.coop) {
          if (out && Z.flareDue(m) && !x.flare && now - flareAskAt > 1) { flareAskAt = now; act('flareStart', p, { t: clock() }); }
          if (x.flare && !x.flare.over && clock() >= x.flare.end && now - flareEndAt > 1) { flareEndAt = now; act('flareEnd', p, { t: clock() }); }
        }
        if (x.flare && !x.flare.over && !warned && clock() >= x.flare.warn) {
          warned = true;
          say(t('eva.flare.warned', { s: ZD.flare.countdown }), 'crit', 6);
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
          // Solo saves keep the suit, the rover's distance, the round's clock and where you stand (co-op ignores them).
          if (h && h.suit) h.suit({ suit, driven: p.inRover ? driven : null, clock: clock(), at: at(p) });
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
    const warning = () => { const f = mission() && mission().expedition && mission().expedition.flare; return !!f && !f.over && clock() >= f.warn; };
    // The base zone: where the suit pauses and loads are delivered (5 × 5 tiles around the HQ). While a flare's warning
    // runs, it and every other cover in view (cave mouths, the storm shelter) pulse amber.
    function drawZone(ctx, x0, y0, x1, y1, world) {
      if (!mission() || !mission().expedition) return;
      const m = mission(), r = (XD.baseZone + 0.5) * T, warn = warning(), pulse = 0.5 + 0.5 * Math.sin(now * 6);
      ctx.save();
      ctx.strokeStyle = warn ? 'rgba(242,184,79,' + (0.55 + 0.4 * pulse).toFixed(3) + ')' : 'rgba(140,188,236,0.35)';
      ctx.lineWidth = warn ? 3 : 2;
      ctx.setLineDash([10, 8]);
      roundRect(ctx, T / 2 - r, T / 2 - r, 2 * r, 2 * r, 18);
      ctx.stroke();
      ctx.setLineDash([]);
      if (warn && world) {
        const spots = [];
        for (let cy = SW.chunkOf(Math.floor(y0 / T) - 1); cy <= SW.chunkOf(Math.floor(y1 / T) + 1); cy++) {
          for (let cx = SW.chunkOf(Math.floor(x0 / T) - 1); cx <= SW.chunkOf(Math.floor(x1 / T) + 1); cx++) {
            const c = world.peek(cx, cy);
            if (c) for (const k of c.caves) spots.push([(k.x + 0.5) * T, (k.y + 0.5) * T]);
          }
        }
        const sh = m.modules.shelter && m.modules.shelter.count > 0 ? m.layout.find(k => k.type === 'shelter') : null;
        if (sh) spots.push([(sh.x + W.BASE_RECT.x + 0.5) * T, (sh.y + W.BASE_RECT.y + 0.5) * T]);
        ctx.strokeStyle = 'rgba(242,184,79,' + (0.5 + 0.45 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 3;
        for (const [cx, cy] of spots) {
          if (cx < x0 - T || cx > x1 + T || cy < y0 - T || cy > y1 + T) continue;
          ctx.beginPath(); ctx.ellipse(cx, cy + 6, 26 + 5 * pulse, 12 + 2 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
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
      // Dust devils: every screen draws the same ones from the round's clock. Past the edge of your view they fade out, so in
      // a dust storm one can be on you before you see it.
      const pl = env.player && env.player(), view = Z.viewTiles(m, !!(pl && pl.inRover));
      for (const d of Z.devils(m, x0 - T, y0 - T, x1 + T, y1 + 2 * T, clock())) {
        const dist = pl ? Math.sqrt(near2(d.x, d.y, pl.x, pl.y)) / T : 0;
        const a = d.a * Math.max(0, Math.min(1, (view + 1 - dist) / 2));
        if (a > 0.02) out.push({ y: d.y, draw: ctx => drawDevil(ctx, d, time, a) });
      }
      return out;
    }

    // Over the fog: the hold ring.
    function drawOver(ctx) {
      if (hold) drawRing(ctx, hold.f.x, hold.f.y - 40, hold.t / hold.dur);
    }
    // The flare on the whole screen: a red edge that grows through the countdown while you are in the open, then a flash.
    function flareFx(p) {
      const m = mission(), f = m && m.expedition && m.expedition.flare;
      if (!f || !me) return { warn: 0, flash: 0 };
      const rt = clock(), counting = !f.over && rt >= f.warn && rt < f.end;
      const warn = counting && !covered(p) ? Math.max(0, Math.min(1, (rt - f.warn) / ZD.flare.countdown)) : 0;
      const flash = rt >= f.end && rt < f.end + 1.5 ? 1 - (rt - f.end) / 1.5 : 0;
      return { warn, flash };
    }
    // A teammate's suit level (co-op positions carry it), 0–1, for the bar on their name tag; none at the base or when full.
    const suitBar = r => (r.suit == null || r.suit >= XD.suit || X.inBaseZone(r) ? null : r.suit / XD.suit);

    // Minimap and map markers: finds you have seen (the biologist senses ice and methane vents further), cave mouths you
    // have seen, dropped loads, the parked rover. Rebuilt at most every 150 ms.
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
        for (const k of c.caves) if (world.seen(k.x, k.y)) out.push({ x: (k.x + 0.5) * T, y: (k.y + 0.5) * T, color: '#1a0d0a', ring: '#e8c9a8' });
      }
      for (const d of x.drops) out.push({ x: d.x, y: d.y, color: '#f46e5f' });
      if (x.rover && !x.rover.driver) out.push({ x: x.rover.x, y: x.rover.y, color: '#e9e2d8', square: true });
      marksCache = out;
      return out;
    }

    return {
      el, alert, sync, reset, canMove, step, focusAt, holdable, hasRoom, label, start, stop, act, canister, drawZone, sprites, drawOver,
      flareFx, suitBar, marks, clock,
      view: p => Z.viewTiles(mission(), !!(p && p.inRover)),
      alerting: () => !alert.hidden,
      // While you are down your suit is not sent: a position in flight could undo a revive the server has just made.
      report: () => ({ suit: collapsed(me) ? null : Math.round(suit * 10) / 10, driven: Math.round(driven * 10) / 10 }),
      roverAtBay: p => !!mission() && !!mission().expedition && !exp().rover && !(p && p.inRover),
      driving: () => !!(me && mission() && mission().expedition && exp().rover && exp().rover.driver === me),
      collapsed,
      state: () => ({ suit, driven, hold: hold && hold.f.key, collapsed: collapsed(me), benched: !!me && !!mission() && benched(), pack: me && mission() ? pack().length : 0, clock: clock() }),
      qaSuit: s => { suit = Math.max(0, Math.min(XD.suit, Number(s) || 0)); }, // play-testing: jump the suit level
      qaClock: s => { soloClock = Math.max(0, Number(s) || 0); },              // play-testing: jump the solo round clock
    };
  }

  root.SolEva = { create };
})(typeof self !== 'undefined' ? self : this);
