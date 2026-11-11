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
 *        env: { t(key, params), hooks(), crewName(id), home(), drawRover(ctx, x, y, kind), player(), now() → seconds,
 *               push(dx, dy) (a dust devil throws your astronaut that far, world px),
 *               team() → [{ crewId, x, y }] where the crew who count stand, you included (the commander's aura and route line) }
 *        hooks() is ui.js's: exp(type, payload, pos) runs the rules (above), suit(report) keeps the solo save,
 *        card({ type, id, kind, ... }) shows a point of interest's card (a Kestrel structure's story log, a hab pod's as you
 *        walk in, a landmark's discovery { by, science }, a formation's fact when you survey it), and goals() → [{ text, done,
 *        frac }] the round's goals for the HUD column (none without the hook)
 *      eva.el · eva.alert                           the HUD node and the flare's banner, for the surface overlay
 *      eva.sync(data) → { round, fresh }            round: a new round began; fresh: first look at this mission/seat
 *                                                   (data.clock, co-op only: { t: round seconds, at: env.now() then })
 *      eva.reset()                                  a new mission or room: forget the last one's suit, battery, collapse and hold
 *      eva.canMove(player, nx, ny) → may your astronaut step to (nx, ny)? (world px)
 *      eva.step(dt, player, world, moved, focus)    every frame: suit, battery, delivering, holds, dangers, the HUD
 *      eva.focusAt(x, y, player, world) → a focus on a find (or a landmark's or a formation's site, as one), a dropped load, a
 *        collapsed crewmate, the parked rover or the door
 *        of a Kestrel structure not used yet (kind 'kestrel')
 *      eva.holdable(focus) · eva.label(focus) · eva.start(focus) · eva.stop()       E / the action button
 *      eva.hasRoom() → does your backpack take another load?
 *      eva.act(type, player, payload) → Promise of the rules' answer (board, park) · eva.canister(player) (the button, or Q)
 *      eva.takeKit(player) (the button, or K) · eva.returnKit(player): a relay beacon kit from the base into your backpack, and back
 *      eva.drone(player) (the button, or F): pick the scout drone's target, or call it off · eva.aiming() · eva.cancelDrone() (Esc)
 *        eva.flyTo(player, x, y): the target picked on the ground or the map (world px) · eva.rings(player) → the map's reach ring
 *      eva.drawZone(ctx, x0, y0, x1, y1, world) the base zone, and every cover in view during a flare warning
 *      eva.sprites(x0, y0, x1, y1, world, time) → [{ y, draw(ctx) }] · eva.drawOver(ctx)
 *      eva.flareFx(player) → { warn: 0–1, flash: 0–1 }: the red edge of a flare countdown, the flash when it hits
 *      eva.view(player) → tiles you see from where you stand (Z.viewAt) · eva.clock() → the round's clock (s) · eva.alerting()
 *      eva.suitBar(teammate) → 0–1, or null: the suit bar on a teammate's name tag (drawn by SolPaint's drawTags)
 *      eva.marks(world, px, py) → minimap markers (live pings too) · eva.lines() → the maps' lines (the dashed route home, the
 *        commander's route line to his pings), world px
 *      eva.addPing({ x, y, by }) a ping to show for D.TEAM.ping.life s · eva.speed(player) → the commander's aura factor (1 or 1.1)
 *      eva.report() → { suit (null while collapsed), driven } for positions
 *      eva.roverAtBay(player) · eva.atBay(player, kind) · eva.driving() → the vehicle you drive ('rover' | 'cabin') or null
 *      eva.collapsed(crewId) · eva.state() (play-testing)
 * A player in a vehicle has inRover set, and vehicle 'cabin' in the pressurised rover (M6; none is the rover). Each vehicle
 * has its own battery; in the pressurised rover you breathe its air, so the suit does not drain.
 */
(function (root) {
  'use strict';
  const D = root.SolData, E = root.SolEngine, W = root.SolWorldgen, X = root.SolExpedition, Z = root.SolDangers, P = root.SolPaint, SW = root.SolWorld, A = root.SolArt, PH = root.SolPhysics;
  const { drawFind, drawDrop, drawRing, drawDevil, drawBeacon, drawPing, roundRect } = P.sprites;
  const XD = D.EXPEDITION, ZD = D.DANGERS;
  const T = 64, ICY = W.REGIONS.indexOf('icy');
  const REACH = 0.9 * T;                        // how close the spot you look at must be to a find
  const COLORS = { ice: '#9fd3ea', metal: '#d9b46a', pod: '#ece5db', science: '#6fa8ff' };
  const BEACON = '#ffcf7a';                      // a relay beacon's light: its mark and the route home on the maps
  const VEHICLES = ['rover', 'cabin'], PARKED = { rover: '#e9e2d8', cabin: '#4fd0c4' }; // a parked vehicle's mark on the maps
  const kindOf = p => (p && p.inRover ? (p.vehicle === 'cabin' ? 'cabin' : 'rover') : null); // the vehicle you are in
  const rangeOf = k => (k === 'cabin' ? XD.cabin.range : XD.roverRange);
  const RES_ICON = { water: 'water', materials: 'materials', food: 'food', o2: 'o2', spares: 'spares', science: 'science', kit: 'kit' };
  // No message when these are refused: they are retried, or harmless (a discovery is asked for when a landmark comes into
  // view, a refill as you walk into a hab pod; 'known' only means a crewmate saw it first).
  const QUIET = ['deliver', 'collapse', 'park', 'flareStart', 'flareEnd', 'discover', 'refill',
    'alight']; // M6: a passenger the driver's park has just let out is out already
  const VERDICT = 8;                             // seconds the flare's verdict stays on the banner
  const INSIDE = { cave: 'eva.inCave', tube: 'eva.inTube', pod: 'eva.inPod' }; // the note while you are in cover out there
  // What holding E does at a Kestrel structure's door (the hab pod has no hold: you walk in).
  const VERB = { cache: 'eva.open', wreck: 'eva.salvage', array: 'eva.salvage', weather: 'eva.repair', mast: 'eva.repair' };
  // A chunk's finds or caves less those under a point of interest's footprint (its `hidden`), as X.findsIn / X.cavesIn
  // give them: never drawn, marked, smelled or offered.
  const visible = (c, k) => (c.hidden[k].length ? c[k].filter(o => !c.hidden[k].includes(o.n)) : c[k]);
  // What can be collected in a chunk, with its id: its finds ("<cx>,<cy>:<n>") and the sites lying in it of the landmarks and
  // formations it lists ("L<i>,<j>:<n>", "F<cx>,<cy>:0"). A landmark is listed by every chunk its box touches, so each chunk
  // takes only the sites in it, and a site comes once.
  function sitesIn(c, cx, cy) {
    const out = visible(c, 'finds').map(f => [cx + ',' + cy + ':' + f.n, f]);
    for (const k of c.landmarks.concat(c.formations)) {
      for (const f of k.sites) if (SW.chunkOf(f.x) === cx && SW.chunkOf(f.y) === cy) out.push([k.id + ':' + f.n, f]);
    }
    return out;
  }

  // The scout drone in flight, over everything: its shadow on the ground at (x, y), and above it its legs, body and mast with
  // two rotors, one over the other, turning opposite ways (Ingenuity's). `time` (s) turns them.
  function drawDrone(ctx, x, y, time) {
    const h = y - 52, a = time * 40;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b1d1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 9, h + 11); ctx.lineTo(x - 4, h + 4); ctx.moveTo(x + 9, h + 11); ctx.lineTo(x + 4, h + 4); ctx.moveTo(x, h); ctx.lineTo(x, h - 17); ctx.stroke();
    ctx.fillStyle = '#e8e2d6';
    roundRect(ctx, x - 6, h - 4, 12, 9, 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,226,214,0.9)';
    ctx.lineWidth = 2.5;
    for (const [dy, s] of [[-12, 1], [-17, -1]]) {
      const c = Math.cos(a * s) * 22, d = Math.sin(a * s) * 5;
      ctx.beginPath(); ctx.moveTo(x - c, h + dy - d); ctx.lineTo(x + c, h + dy + d); ctx.stroke();
    }
    ctx.restore();
  }

  function create(env) {
    const t = (k, p) => env.t(k, p);
    const wall = () => (env.now ? env.now() : 0);
    let data = null, me = null, turn = null, wasDown = false;
    let suit = XD.suit, dv = { rover: 0, cabin: 0 }, seat = null, hold = null, keyHeld = false; // dv: each vehicle's tiles this round
    let now = 0, deliverAt = -1e9, collapseAt = -1e9, reportAt = -1e9, marksAt = -1e9, marksCache = [], refillAt = -1e9, inPod = null;
    let soloClock = 0, coopClock = null, hitAt = -1e9, flareAskAt = -1e9, flareEndAt = -1e9, warned = false;
    let note = null;                               // { text, cls, until }
    let briefed = null;                            // the round brief while its note runs: { until, covered } (a card over the HUD hid it)
    let peek = null;                               // the chunks the surface holds (SolWorld's peek), from the last frame
    let asked = {};                                // landmark id → when its discovery was answered (Infinity while asked)
    let told = [];                                 // the beacons and pods whose "already refilled" was said this round
    let pings = [];                                // the live pings (spec §3.5): { x, y, by, at }, `at` on the wall clock
    let goals = [], goalsAt = -1e9;                // the round's goals as ui.js last gave them (renderGoals), and when
    let aim = false, flight = null;                // the scout drone: picking its target; its flight { x0, y0, x1, y1, t } (world px)

    const mission = () => (data && data.mission) || null;
    const exp = () => mission().expedition;
    // The suit's size this mission (Fabricator tanks), and the level under which a canister's 45 s all fit.
    const suitMax = () => (mission() ? X.suitMax(mission()) : XD.suit);
    const canBelow = () => suitMax() - XD.canister.suit;
    const crew = () => (mission() && me ? mission().crew.find(c => c.id === me) || null : null);
    const pack = () => (me && Array.isArray(exp().carried[me]) ? exp().carried[me] : []);
    const collapsed = id => !!(mission() && mission().expedition && mission().expedition.collapsed[id]);
    const benched = () => !!(me && exp().benched.includes(me));
    const live = () => { const m = mission(), c = crew(); return !!m && !!m.expedition && m.status === 'active' && !!c && c.status === 'active'; };
    const hasRoom = () => live() && pack().length < X.capacity(mission(), me);
    const at = p => ({ x: Math.round(p.x), y: Math.round(p.y) });
    const near2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
    const secs = s => (Math.round(s * 10) / 10).toLocaleString(shown.lang === 'vi' ? 'vi-VN' : 'en-US'); // 1.5, or 1,5 in Vietnamese (R31)
    const clock = () => (coopClock ? coopClock.t + (wall() - coopClock.at) : soloClock);
    const driven = () => dv[seat || 'rover'];      // the battery of the vehicle you were in last frame (the rover's on foot)
    const flat = p => { const k = kindOf(p); return !!k && dv[k] >= rangeOf(k); };
    // In the pressurised rover (M6): its driver, or co-op's passenger while the rules have them in its seat (expedition.riders).
    const inCabin = p => kindOf(p) === 'cabin' || (!!me && !!mission() && !!mission().expedition && !!(exp().riders || {})[me]);
    function say(text, cls, s) { note = { text, cls: cls || '', until: now + (s || 3) }; }
    // A point of interest's card over the surface (ui.js shows each once a mission): { type: 'log' | ..., id, kind }.
    const card = c => { const h = env.hooks(); if (h && h.card) h.card(c); };

    // ---------- the team: pings and the commander (spec §3.3, §3.5) ----------
    // Where the crew stand ([{ crewId, x, y }], world px), as the surface knows it: you, and the teammates who count.
    const team = () => (env.team ? env.team() || [] : []);
    // A ping: a spot a crewmate (or you) pointed out, { x, y } in world px and `by` their crew id. It lasts D.TEAM.ping.life
    // seconds of the wall clock, so it fades on time while the surface is hidden too; the newest 50 are kept.
    function addPing(d) {
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y) || typeof d.by !== 'string') return;
      const t0 = wall();
      pings = pings.filter(q => t0 - q.at < D.TEAM.ping.life).concat([{ x: d.x, y: d.y, by: d.by, at: t0 }]).slice(-50);
    }
    // The live pings with how far each has faded (1 new, 0 gone) and its age in seconds.
    function livePings() {
      const t0 = wall(), life = D.TEAM.ping.life;
      return pings.filter(q => t0 - q.at < life).map(q => ({ x: q.x, y: q.y, by: q.by, age: t0 - q.at, fade: 1 - (t0 - q.at) / life }));
    }
    const pingColor = id => { const c = mission() && mission().crew.find(k => k.id === id); return (c && A.ROLE[c.role]) || '#cccccc'; };
    const pingMarks = () => (mission() ? livePings().map(q => ({ x: q.x, y: q.y, color: pingColor(q.by), ping: true, label: env.crewName(q.by), alpha: q.fade })) : []);
    // How much faster you move: the commander's aura (X.speedFactor) while he is out and you are within his reach, on foot (a
    // rover keeps its own speed). A crew of 4 has no commander, so never.
    const speed = p => (live() && !collapsed(me) && !(p && p.inRover) ? X.speedFactor(mission(), me, team()) : 1);

    // ---------- the HUD ----------
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const el = node('div', 'sf-eva');
    const meter = () => { const row = node('div', 'sf-suit'), k = node('span', 'k'), bar = node('span', 'bar'), fill = node('i'), v = node('b'); bar.appendChild(fill); row.append(k, bar, v); return { row, k, fill, v }; };
    const suitM = meter(), battM = meter();
    battM.row.classList.add('batt');
    const physEl = node('span', 'phys'); // while driving: the speed, and how far the rover needs to stop on Mars and on Earth
    battM.row.appendChild(physEl);
    const packEl = node('div', 'sf-pack');
    const canBtn = node('button', 'sf-can');
    canBtn.type = 'button';
    canBtn.addEventListener('click', () => canister(env.player && env.player()));
    // A relay beacon kit waiting at the base (x.kits) goes into your backpack with a button there (or K), and back with another.
    const kitBtn = node('button', 'sf-kit'), backBtn = node('button', 'sf-kitback');
    kitBtn.type = backBtn.type = 'button';
    kitBtn.addEventListener('click', () => takeKit(env.player && env.player()));
    backBtn.addEventListener('click', () => returnKit(env.player && env.player()));
    // The scout drone (M6): with a working drone, its button (or F) asks for a target, or says why it can't fly.
    const droneBtn = node('button', 'sf-drone');
    droneBtn.type = 'button';
    droneBtn.addEventListener('click', () => drone(env.player && env.player()));
    const auraEl = node('p', 'sf-aura');           // the commander's aura, while it speeds you up
    auraEl.hidden = true;
    // The round's goals (spec §3.9), under the backpack, where they stay put while the buttons and notes below come and go.
    const goalsEl = node('div', 'sf-goals'), goalsCap = node('b'), goalsList = node('ul');
    goalsEl.append(goalsCap, goalsList);
    goalsEl.hidden = true;
    const noteEl = node('p', 'sf-evanote');
    noteEl.setAttribute('role', 'status');
    el.append(suitM.row, battM.row, packEl, goalsEl, canBtn, kitBtn, backBtn, droneBtn, auraEl, noteEl);
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

    // Are you under cover from the flare? The banner and the red edge ask with the slack the verdict gives (Z.slackOf: the
    // co-op server's, none in solo play), so they agree with it. Like the in-cave note, it reads the chunks the surface
    // holds, so asking every frame never builds one.
    const covered = p => !!(p && Z.shelterAt(mission(), p, Z.slackOf(mission()), peek));
    // A landmark is discovered the first time anyone sees its centre (spec §3.6): here, when that tile comes into your view
    // as the fog's does (within viewOf(p) tiles of the tile under you; the rules allow 15.5). It is asked once while the
    // answer is out, and again 3 s after a refusal while it is still in view and undiscovered. Its card opens on the ok; in
    // co-op the server's event opens it on every tab as well (ui.js shows it once).
    function sight(p) {
      const x = exp(), tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), r = viewOf(p);
      for (let cy = SW.chunkOf(ty) - 1; cy <= SW.chunkOf(ty) + 1; cy++) for (let cx = SW.chunkOf(tx) - 1; cx <= SW.chunkOf(tx) + 1; cx++) {
        const c = peek && peek(cx, cy);
        if (c) for (const l of c.landmarks) {
          if (x.landmarks[l.id] || now - (asked[l.id] == null ? -1e9 : asked[l.id]) < 3) continue;
          if ((l.x - tx) * (l.x - tx) + (l.y - ty) * (l.y - ty) > r * r) continue;
          asked[l.id] = Infinity;
          const by = me;
          act('discover', p, { landmark: l.id }).then(res => {
            asked[l.id] = now;
            if (res.ok) card({ type: 'landmark', id: l.id, kind: l.kind, by, science: res.science });
          });
        }
      }
    }
    // The hab pod you stand in (the painter's "inside": the tile under you is in its 5×5 box), from the chunks the surface
    // holds: the chunk of that tile lists it.
    function podAt(p) {
      const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), c = peek && peek(SW.chunkOf(tx), SW.chunkOf(ty));
      if (c) for (const s of c.structures) if (s.kind === 'pod' && tx >= s.box[0] && tx <= s.box[2] && ty >= s.box[1] && ty <= s.box[3]) return s;
      return null;
    }
    // Tiles you see from where you stand (Z.viewAt): the weather's view, a lava tube's headlamp, a star dune's crest. The
    // tile under you comes from the chunks the surface holds; before the first frame, or off them, it is open ground.
    function viewOf(p) {
      const tx = p ? Math.floor(p.x / T) : 0, ty = p ? Math.floor(p.y / T) : 0, cx = SW.chunkOf(tx), cy = SW.chunkOf(ty);
      const c = p && peek ? peek(cx, cy) : null;
      return Z.viewAt(mission(), !!(p && p.inRover), c ? W.tileOf(c, tx - cx * W.CHUNK, ty - cy * W.CHUNK) : null);
    }
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
        // The pressurised rover is no cover (M6): out in the open it says so.
        return { cls: safe ? 'ok' : 'crit', msg: t(safe ? 'eva.flare.covered' : inCabin(p) ? 'eva.cabinFlare' : 'eva.flare.run'), left: Math.ceil(f.end - rt - 1e-6) };
      }
      if (rt >= f.end + VERDICT) return null;
      const hit = f.hit.includes(me);
      return { cls: hit ? 'crit' : 'ok', msg: t(hit ? 'eva.flare.hit' : 'eva.flare.missed', { d: ZD.flare.dose }), left: null };
    }

    function statusNote(p) {
      if (!me || !mission()) return null;
      if (collapsed(me)) return { text: t('eva.collapsedCoop'), cls: 'crit' };
      if (benched()) return { text: t('eva.benched'), cls: 'warn' };
      if (flat(p)) return { text: t(kindOf(p) === 'cabin' ? 'eva.cabinFlat' : 'eva.flat'), cls: 'warn' };
      const atBase = !!p && X.inBaseZone(mission(), p);
      if (live() && pack().length >= X.capacity(mission(), me) && !atBase) return { text: t(pack().some(i => !E.isKit(i)) ? 'eva.full' : 'eva.fullKits'), cls: '' }; // kits are placed, not delivered
      if (live() && inCabin(p) && !hold && !atBase) return { text: t('eva.cabinAir'), cls: 'ok' };
      if (live() && suit <= suitMax() * 0.2 && !atBase) return { text: t('eva.low'), cls: 'crit' };
      const cover = live() && p && !atBase ? INSIDE[Z.shelterAt(mission(), p, 0, peek)] : null;
      if (cover) return { text: t(cover), cls: 'ok' };
      return null;
    }
    // The canister button shows only when breathing one now is worth it: outside, on your feet, and with room for all 45 s.
    const canBreathe = p => live() && !collapsed(me) && !benched() && pack().some(i => i.canister) && suit <= canBelow() && !(p && X.inBaseZone(mission(), p));
    // The round's goals from ui.js's goals hook ([{ text, done, frac }], frac 0–1; text has "(p/n)" when it needs more than
    // one), asked twice a second: a line each with a thin bar, a done one ticked. No hook or no goals: no block.
    function renderGoals() {
      if (now - goalsAt >= 0.5) {
        goalsAt = now;
        const h = env.hooks(), g = h && typeof h.goals === 'function' ? h.goals() : null;
        goals = Array.isArray(g) ? g.filter(q => q && typeof q.text === 'string') : [];
      }
      prop('gl', JSON.stringify(goals) + '|' + (shown.lang || ''), () => {
        goalsEl.hidden = !goals.length;
        goalsCap.textContent = t('goal.title');
        goalsList.textContent = '';
        for (const q of goals) {
          const li = node('li', q.done ? 'done' : null, (q.done ? '✓ ' : '') + q.text), bar = node('span', 'bar'), fill = node('i');
          fill.style.width = Math.round(100 * (q.done ? 1 : Math.max(0, Math.min(1, Number(q.frac) || 0)))) + '%';
          bar.appendChild(fill);
          li.appendChild(bar);
          goalsList.appendChild(li);
        }
      });
    }

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
      const atBase = !!p && X.inBaseZone(mission(), p);
      text(suitM.k, 'sk', t('eva.suit'));
      const seconds = t('eva.secs', { s: Math.ceil(suit) }); // one unit, paused or not
      text(suitM.v, 'sv', (atBase && !benched()) || (inCabin(p) && !hold) ? t('eva.paused', { v: seconds }) : seconds);
      prop('sw', (100 * Math.min(1, suit / suitMax())).toFixed(1) + '%', v => { suitM.fill.style.width = v; });
      const f = suit / suitMax();
      prop('sc', 'sf-suit' + (f <= 0.2 ? ' crit' : f <= 0.4 ? ' warn' : ''), v => { suitM.row.className = v; });
      const kind = kindOf(p); // the battery and the physics of the vehicle you are in
      prop('bh', !kind, v => { battM.row.hidden = v; });
      if (kind) {
        const range = rangeOf(kind), left = Math.max(0, range - dv[kind]), spec = kind === 'cabin' ? PH.CABIN : PH.ROVER;
        text(battM.k, 'bk', t(kind === 'cabin' ? 'eva.cabinBattery' : 'eva.battery'));
        text(battM.v, 'bv', Math.floor(left) + ' ' + t(Math.floor(left) === 1 ? 'eva.tiles1' : 'eva.tiles'));
        prop('bw', (100 * left / range).toFixed(1) + '%', v => { battM.fill.style.width = v; });
        const v = p.car ? p.car.speed : 0;
        text(physEl, 'bp', t('eva.drive', { kmh: Math.round(v / PH.PX_PER_M * 3.6), m: secs(PH.stopDistance(v, PH.MARS_G, spec)), e: secs(PH.stopDistance(v, PH.EARTH_G, spec)) }));
      }
      const items = live() || collapsed(me) ? pack() : [], cap = X.capacity(mission(), me);
      prop('pk', items.map(i => i.res + (i.canister ? '*' : '')).join(',') + '|' + cap + '|' + (shown.lang || ''), () => {
        packEl.textContent = '';
        const kitN = items.filter(E.isKit).length; // a kit is counted apart from the loads
        packEl.setAttribute('aria-label', kitN ? t('eva.packKit', { n: items.length - kitN, k: kitN, m: cap }) : t('eva.pack', { n: items.length, m: cap }));
        for (let i = 0; i < cap; i++) {
          const it = items[i], slot = node('span', 'slot' + (it ? ' full' : ''));
          if (it) { slot.innerHTML = A.icon(RES_ICON[it.res] || 'materials', 14); slot.title = E.isKit(it) ? t('mod.kit') : t('haul.' + it.res, { n: it.amount }); }
          packEl.appendChild(slot);
        }
      });
      renderGoals();
      prop('ch', !canBreathe(p), v => { canBtn.hidden = v; });
      text(canBtn, 'ct', t('eva.useCanister', { s: XD.canister.suit }));
      const kitHere = atBase && live() && !collapsed(me) && !benched(), kits = Number(exp().kits) || 0;
      prop('kh', !(kitHere && kits > 0 && hasRoom()), v => { kitBtn.hidden = v; });
      text(kitBtn, 'kt', t('eva.takeKit', { n: kits }));
      prop('rh', !(kitHere && pack().some(E.isKit)), v => { backBtn.hidden = v; });
      text(backBtn, 'rt', t('eva.returnKit'));
      // The drone's button: hidden without a working drone; while it can't fly, it says why (the rules' own refusal).
      const dc = droneCheck(p);
      if (aim && !dc.ok) aim = false; // you walked out of the base zone, or the round's flights ran out, while picking
      prop('dh', !live() || collapsed(me) || benched() || dc.error === 'noDrone', v => { droneBtn.hidden = v; });
      text(droneBtn, 'dt', aim ? t('eva.droneCancel') : flight ? t('eva.droneFlying') : dc.ok ? t('eva.droneFly', { n: dc.left }) : t('eva.err.' + dc.error));
      prop('dd', !aim && (!!flight || !dc.ok), v => { droneBtn.disabled = v; });
      const aura = speed(p) > 1, lead = aura && crew().role === 'commander', pct = Math.round((D.SKILLS.commander.auraSpeed - 1) * 100);
      prop('uh', !aura, v => { auraEl.hidden = v; });
      if (aura) text(auraEl, 'ut', lead ? t('eva.auraLead', { p: pct, n: D.SKILLS.commander.auraRange }) : t('eva.aura', { p: pct }));
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
        // A ride refused for its one seat (M6) is not a full backpack.
        if (res.error && !QUIET.includes(type)) say(t('eva.err.' + (type === 'ride' && res.error === 'full' ? 'seatTaken' : res.error), { s: canBelow() }), 'warn');
        return res;
      }, () => { if (!QUIET.includes(type)) say(t('eva.err.net'), 'warn'); return { error: 'net' }; });
    }

    // Breathes an O₂ canister from your backpack (the button, or Q): +45 s of suit now. The rules get your live suit level,
    // not the one last reported, so the 45 s are added to what you really have.
    function canister(p) {
      if (!live() || !pack().some(i => i.canister)) return;
      act('canister', p, { suit: Math.round(suit * 10) / 10 }).then(r => {
        if (!r.ok) return;
        suit = Number.isFinite(r.suit) ? r.suit : Math.min(suitMax(), suit + XD.canister.suit);
        say(t('eva.breathed', { s: XD.canister.suit }), 'ok');
      });
    }

    // Takes a relay beacon kit waiting at the base into your backpack (the button, or K), or puts one back. Only in the base
    // zone, where the buttons show: K pressed out on the map does nothing.
    function takeKit(p) {
      if (!live() || !X.inBaseZone(mission(), p) || !(exp().kits > 0)) return;
      act('takeKit', p).then(r => { if (r.ok) say(t('eva.tookKit', { n: XD.beacon.base }), 'ok', 6); });
    }
    function returnKit(p) {
      if (!live() || !X.inBaseZone(mission(), p) || !pack().some(E.isKit)) return;
      act('returnKit', p).then(r => { if (r.ok) say(t('eva.returnedKit'), 'ok', 3); });
    }

    // The scout drone (spec §4.2, M6). The button (or F) asks for a target, again calls it off (or Esc); a tap on the ground or
    // on the map (flyTo) picks it. The rules fly it at once (X.fly, its fog comes as a beacon's does); here it is drawn there
    // and back over everything, as it flies over cliffs and walls, in D.DRONE.drawn seconds. One flight at a time.
    const droneCheck = p => (live() ? X.canFly(mission(), me, p ? at(p) : null) : { error: 'badPhase' });
    function drone(p) {
      if (aim) { aim = false; return; }
      if (flight || !droneCheck(p).ok) return;
      aim = true;
      say(t('eva.droneAim'), '', 8);
    }
    function cancelDrone() { aim = false; }
    // A target past the drone's range is brought in along the line to it, D.EXPEDITION.reach short of the range, so it is in
    // range of where the co-op server last saw you too; half a tile's diagonal more, since the target then snaps to a tile's
    // middle. (wx, wy): world px.
    function flyTo(p, wx, wy) {
      if (!aim || !p) return;
      aim = false;
      const dx = wx - p.x, dy = wy - p.y, d = Math.hypot(dx, dy) / T, max = D.DRONE.range - XD.reach - Math.SQRT1_2, k = d > max ? max / d : 1;
      const tx = Math.floor((p.x + dx * k) / T), ty = Math.floor((p.y + dy * k) / T);
      flight = { x0: p.x, y0: p.y, x1: (tx + 0.5) * T, y1: (ty + 0.5) * T, t: 0 };
      act('fly', p, { tx, ty }).then(r => {
        if (!r.ok) { flight = null; return; }
        say(t('eva.droneFlew', { n: D.DRONE.reveal }), 'ok', 4);
      });
    }
    // Where the drone is now (world px), or null: out to its target in the first half of the flight, back to you in the second.
    function dronePos() {
      if (!flight) return null;
      const p = env.player && env.player(), f = flight.t / D.DRONE.drawn, back = f > 0.5, k = back ? 2 - 2 * f : 2 * f, e = k * k * (3 - 2 * k);
      const hx = back && p ? p.x : flight.x0, hy = back && p ? p.y : flight.y0;
      return { x: hx + (flight.x1 - hx) * e, y: hy + (flight.y1 - hy) * e };
    }

    // What is waiting outside this round (Z.outside), said once a round when you first look at it.
    function brief(m) {
      const params = { storm: { n: Z.viewTiles(m, false) } };
      const list = Z.outside(m).map(k => t('eva.brief.' + k, params[k]));
      briefed = list.length ? { until: now + 8, covered: false } : null;
      if (list.length) { say(t('eva.brief', { list: list.join(', ') }), 'warn', 8); briefed.note = note; }
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
        const first = turn == null, newRound = !first && m.turn !== turn;
        round = !first && m.turn !== turn && id === me;
        fresh = !round;
        turn = m.turn;
        me = id;
        suit = me ? X.suitOf(m, me) : suitMax();
        dv = { rover: 0, cabin: 0 };
        hold = null;
        told = [];
        aim = false;
        collapseAt = hitAt = flareAskAt = flareEndAt = -1e9;
        wasDown = !!(me && m.expedition.collapsed[me]);
        if (round) soloClock = 0;
        else if (first) soloClock = Z.clockOf(m); // a reload picks the round's clock up where it was saved
        warned = !!(m.expedition.flare && clock() >= m.expedition.flare.warn); // a warning already under way is not said again
        if (first || newRound) brief(m); // at an advance whoever's seat it is
      }
      const down = !!(me && m.expedition.collapsed[me]);
      if (wasDown && !down && me) { suit = X.suitOf(m, me); say(t('eva.revived', { s: XD.reviveSuit }), 'ok', 4); }
      wasDown = down;
      if (down || benched()) suit = 0;
      for (const k of VEHICLES) dv[k] = Math.max(dv[k], Number(m.expedition[k + 'Driven']) || 0); // it only ever goes up within a round
      shown.lang = d.lang;
      return { round, fresh };
    }

    // A new mission or room (SolSurface.reset): nothing of the last one's exploring carries over, so the next sync is a
    // fresh look even with the same astronaut in the same round.
    function reset() {
      data = me = turn = hold = note = coopClock = peek = briefed = null;
      wasDown = keyHeld = warned = false;
      suit = XD.suit;
      dv = { rover: 0, cabin: 0 };
      seat = null;
      soloClock = 0;
      deliverAt = collapseAt = reportAt = marksAt = hitAt = flareAskAt = flareEndAt = refillAt = goalsAt = -1e9;
      inPod = flight = null;
      aim = false;
      asked = {};
      told = [];
      marksCache = [];
      pings = [];
      goals = [];
    }

    // ---------- every frame ----------
    function canMove(p, nx, ny) {
      if (!me || !mission() || !mission().expedition) return true;
      if (collapsed(me)) return false;
      const atBase = X.inBaseZone(mission(), p);
      if (benched() && atBase && !X.inBaseZone(mission(), { x: nx, y: ny })) return false; // solo: back out next round
      if (!atBase && suit <= 0) return false;
      if (flat(p)) return false;
      return true;
    }

    function step(dt, p, world, moved, focus) {
      now += dt;
      peek = world.peek;
      if (flight && (flight.t += dt) >= D.DRONE.drawn) flight = null;
      const m = mission();
      if (briefed) { // a card over the HUD hides the note: say it again when the card closes
        const h = env.hooks(), up = !!(h && h.cardUp && h.cardUp());
        if (up) briefed.covered = true; // seen only once the card is gone, however long it stays
        else if (now >= briefed.until && !briefed.covered) briefed = null;
        else if (briefed.covered && m) { if (note && note !== briefed.note && now < note.until) briefed = null; else brief(m); } // a newer note wins
      }
      if (m && m.expedition && m.status === 'active' && !coopClock) soloClock += dt;
      seat = kindOf(p);
      if (live()) {
        const x = m.expedition, atBase = X.inBaseZone(m, p), out = !atBase && !collapsed(me) && !benched();
        // The battery counts the tiles driven, more for each one boosted or over rocks (p.drain, set as the rover moves).
        if (seat && moved > 0) dv[seat] = Math.min(rangeOf(seat), dv[seat] + moved / T * (p.drain || 1));
        if (out) {
          // You step out of the vehicle to work; in the pressurised rover you breathe its air (drain 0).
          let k = inCabin(p) && !hold ? XD.cabin.drain : p.inRover && !hold ? XD.drain.rover : 1;
          if (p.sprinting) k *= XD.drain.sprint;
          if (world.region(Math.floor(p.x / T), Math.floor(p.y / T)) === ICY) k *= XD.drain.icy;
          suit = Math.max(0, suit - dt * k);
          // A dust devil that catches you on foot throws you aside and takes suit time (spec §3.4); the rover is immune. A hit
          // that empties the suit throws nobody: you collapse where it caught you, which is where the server anchors it.
          const d = !p.inRover && !inCabin(p) && now - hitAt > ZD.devils.calm ? Z.devilHit(m, p, clock()) : null;
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
            act('collapse', p, { driven: Math.round(driven() * 10) / 10 }).then(r => {
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
        // An abandoned hab pod (spec §3.7): walking in fills your suit, once per pod a round (x.refills, C3), and its story log
        // opens (ui.js shows each once a mission).
        const pod = out ? podAt(p) : null, had = x.refills[me] || [];
        if (pod && pod.id !== inPod) card({ type: 'log', id: pod.id, kind: 'pod' });
        inPod = pod ? pod.id : null;
        if (pod && !had.includes(pod.id) && now - refillAt > 2) {
          refillAt = now;
          act('refill', p, { pod: pod.id }).then(r => {
            if (!r.ok) return;
            suit = r.suit;
            say(t('eva.refilled', { s: Math.round(r.suit) }), 'ok', 4);
          });
        }
        // A relay beacon (spec §3.8): within its refill tiles your suit is filled, once at each beacon a round (x.refills, shared
        // with the pods). Only when that gives a canister's worth or more: walking out past it with a nearly full suit would
        // spend this round's refill before the way home.
        if (out && suit <= canBelow()) {
          const r2 = (XD.beacon.refill * T) * (XD.beacon.refill * T);
          const reach = x.beacons.map((b, j) => (near2((b.x + 0.5) * T, (b.y + 0.5) * T, p.x, p.y) <= r2 ? 'B' + j : null)).filter(Boolean);
          const id = reach.find(b => !had.includes(b));
          if (id && now - refillAt > 2) {
            refillAt = now;
            act('refill', p, { beacon: id }).then(r => {
              if (!r.ok) return;
              suit = r.suit;
              say(t('eva.refilledBeacon', { name: beaconName(id), s: Math.round(r.suit) }), 'ok', 4);
            });
          }
          // A beacon or a hab pod that has already refilled your suit this round says so, once each a round (R27): the rules'
          // 'refilled' is a quiet answer the surface never asks for, and a low suit there should know why nothing comes.
          // Not while a refill just asked for is on its way back: in co-op the room frame can show it spent before the answer lands.
          const spent = id || now - refillAt <= 2 ? null : reach.concat(pod ? [pod.id] : []).find(k => had.includes(k) && !told.includes(k));
          if (spent) {
            told.push(spent);
            say(spent[0] === 'B' ? t('eva.refillUsed', { name: beaconName(spent) }) : t('eva.refillUsedPod'), 'warn', 5);
          }
        }
        if (out) sight(p);
        // The rules refuse anything while you are down, and never bank a beacon kit: a pack of kits only is not delivered.
        if (atBase && pack().some(it => !E.isKit(it)) && !collapsed(me) && now - deliverAt > 1.5) {
          deliverAt = now;
          // A kit left in the pack gets no line here (R30): its slot and the "Put the beacon kit back" button show it stays.
          act('deliver', p).then(r => {
            if (!r.ok) return;
            const n = r.items.length;
            say(t(n === 1 ? 'eva.delivered1' : 'eva.delivered', { n }), 'ok', 4);
          });
        }
        if (hold) {
          if (p.moving || !focus || focus.key !== hold.f.key) hold = null;
          else if ((hold.t += dt) >= hold.dur) finish(p);
        }
        if (now - reportAt > 2) {
          reportAt = now;
          const h = env.hooks();
          // Solo saves keep the suit, the rover's distance, the round's clock and where you stand (co-op ignores them).
          if (h && h.suit) h.suit({ suit, driven: seat ? driven() : null, clock: clock(), at: at(p) });
        }
      }
      renderHud(p);
    }

    function finish(p) {
      const f = hold.f;
      hold = null;
      const ask = f.kind === 'find' ? act('collect', p, { find: f.id })
        : f.kind === 'drop' ? act('pickup', p, { drop: f.id })
          : f.kind === 'kestrel' ? act('interact', p, { structure: f.id })
            : f.kind === 'beacon' ? act('placeBeacon', p)
              : act('revive', p, { target: f.id });
      ask.then(r => {
        if (!r.ok) return;
        if (f.kind === 'kestrel') return used(f.struct, r);
        // Its fog is in the mission's (solo) or comes as any fog does (co-op), as a repaired weather station's: the maps show
        // it, so the note says only what the beacon does for a suit (R28: two lines of the HUD column).
        if (f.kind === 'beacon') return say(t('eva.placed', { name: beaconName(r.beacon), r: XD.beacon.refill }), 'ok', 6);
        if (f.kind === 'find') {
          say(r.item ? t('haul.' + r.item.res, { n: r.item.amount }) : t('eva.collected'), 'ok', 2);
          // A formation's survey: its real fact and source, once per formation (spec §3.7).
          if (f.id[0] === 'F') card({ type: 'formation', id: f.id.split(':')[0], kind: f.find.sub });
        } else if (f.kind === 'drop') say(t('eva.pickedUp'), 'ok', 2);
        else say(t('eva.revivedThem', { name: env.crewName(f.id) }), 'ok', 3);
        if (f.kind === 'find' && keyHeld && live()) hold = { f, t: 0, dur: hold0(f) }; // keep going while E is held
      });
    }

    // A Kestrel structure opened, salvaged or repaired (X.interact): its loads are in your backpack and what did not fit waits
    // at its door as a drop (C2); a weather station's fog is in the mission's (solo) or comes as any fog does (co-op), and a
    // mast's marks are read by the maps. Its story log opens: a structure is used once, so this is the first time.
    function used(s, r) {
      const said = (r.items || []).map(i => t('haul.' + i.res, { n: i.amount }));
      if (r.left) said.push(t('eva.atDoor', { n: r.left }));
      if (s.kind === 'weather') said.push(t('eva.repairedWeather', { n: D.STRUCTURES.kinds.weather.science }));
      if (s.kind === 'mast') said.push(t('eva.repairedMast'));
      say(said.join(' · '), 'ok', 5);
      card({ type: 'log', id: s.id, kind: s.kind });
    }

    // ---------- what you can work on ----------
    // Every hold's seconds come from the rules' one function (X.holdSeconds), with your role's skill (spec §3.3).
    const holdKind = f => (f.kind === 'find' ? f.find.kind : f.kind === 'drop' ? 'pickup' : f.kind === 'kestrel' ? f.struct.kind : f.kind === 'beacon' ? 'beacon' : 'revive');
    const hold0 = f => X.holdSeconds(holdKind(f), crew() && crew().role, mission());
    const holdable = f => !!f && (f.kind === 'find' || (f.kind === 'drop' && hasRoom()) || f.kind === 'revive' || f.kind === 'kestrel' || (f.kind === 'beacon' && !!f.spot.ok));
    // A relay beacon by its id "B<i>": "Beacon <i + 1>".
    const beaconName = id => t('eva.beaconName', { n: Number(String(id).slice(1)) + 1 });
    // Where the relay beacon you carry would go (spec §3.8): the tile under you, as the rules judge it (X.beaconSpot changes
    // nothing; a co-op server's refusal drops the tiles still to go, so the prompt asks here). On foot and out of the base zone.
    function beaconFocus(p) {
      const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), spot = X.beaconSpot(mission(), me, at(p));
      return { kind: 'beacon', key: 'b:' + tx + ',' + ty + ':' + (spot.error || 'ok'), spot, wx: tx, wy: ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T };
    }

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
        for (const [id, f] of sitesIn(c, cx, cy)) {
          if (X.loadsLeft(m, f, id) <= 0) continue;
          consider((f.x + 0.5) * T, (f.y + 0.5) * T, { kind: 'find', key: 'f:' + id, id, find: f, wx: f.x, wy: f.y, x: (f.x + 0.5) * T, y: (f.y + 0.5) * T });
        }
        // A Kestrel structure is used from its door, once (x.structures). Up to 4 chunks list one: the same door again changes nothing.
        for (const s of c.structures) {
          if (!VERB[s.kind] || x.structures[s.id]) continue;
          consider((s.x + 0.5) * T, (s.y + 0.5) * T, { kind: 'kestrel', key: 's:' + s.id, id: s.id, struct: s, x: (s.x + 0.5) * T, y: (s.y + 0.5) * T });
        }
      }
      for (const d of x.drops) consider(d.x, d.y, { kind: 'drop', key: 'd:' + d.id, id: d.id, x: d.x, y: d.y });
      if (m.coop) for (const id of Object.keys(x.collapsed)) {
        if (id === me) continue;
        const s = x.collapsed[id];
        consider(s.x, s.y, { kind: 'revive', key: 'v:' + id, id, x: s.x, y: s.y - 10 });
      }
      for (const k of VEHICLES) { // a parked vehicle: E boards the nearer
        const v = x[k];
        if (v && !v.driver && !p.inRover) consider(v.x, v.y, { kind: 'rover', key: k + '-parked', vehicle: k, parked: true, x: v.x, y: v.y });
      }
      // With nothing else to work on, the beacon kit you carry: the tile under you is where it would stand.
      if (!best && !p.inRover && !X.inBaseZone(m, p) && pack().some(E.isKit)) return beaconFocus(p);
      return best;
    }

    function label(f) {
      const role = crew() && crew().role;
      if (f.kind === 'find') {
        const what = t('find.' + f.find.kind) + (f.find.sub ? ' · ' + t('sci.' + f.find.sub) : '');
        return t(f.find.kind === 'science' ? 'eva.survey' : 'eva.collect', { what, s: secs(X.holdSeconds(f.find.kind, role, mission())) });
      }
      if (f.kind === 'drop') return !hasRoom() ? t('eva.err.full') : t('eva.pickup', { s: secs(X.holdSeconds('pickup', role, mission())) });
      if (f.kind === 'kestrel') return t(VERB[f.struct.kind], { what: t('ks.' + f.struct.kind + '.name'), s: secs(X.holdSeconds(f.struct.kind, role, mission())) });
      if (f.kind === 'revive') return t('eva.revive', { name: env.crewName(f.id), s: secs(X.holdSeconds('revive', role, mission())) });
      if (f.kind === 'rover') return t(f.vehicle === 'cabin' ? 'sf.boardCabin' : 'sf.boardRover');
      if (f.kind === 'beacon') {
        const s = f.spot, more = Math.max(1, Math.ceil(s.need - 1e-9)); // whole tiles, at least one more
        if (s.ok) return t('eva.placeBeacon', { s: secs(X.holdSeconds('beacon', role, mission())) });
        if (s.error === 'nearBase') return t(more === 1 ? 'eva.beaconNearBase1' : 'eva.beaconNearBase', { n: more });
        if (s.error === 'nearBeacon') return t(more === 1 ? 'eva.beaconNearBeacon1' : 'eva.beaconNearBeacon', { name: beaconName(s.beacon), n: more });
        if (s.error === 'limit') return t('eva.beaconLimit', { n: XD.beacon.max });
        return t('eva.err.' + s.error);
      }
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
    // The base zone: where the suit pauses and loads are delivered (the rank's, E.zoneOf: 5 × 5 tiles round the HQ at a
    // Camp). While a flare's warning runs, it and every cover in view (Z.coversIn, from the chunks the surface holds) pulse amber.
    function drawZone(ctx, x0, y0, x1, y1, world) {
      if (!mission() || !mission().expedition) return;
      const m = mission(), r = (E.zoneOf(m) + 0.5) * T, warn = warning(), pulse = 0.5 + 0.5 * Math.sin(now * 6);
      ctx.save();
      ctx.strokeStyle = warn ? 'rgba(242,184,79,' + (0.55 + 0.4 * pulse).toFixed(3) + ')' : 'rgba(140,188,236,0.35)';
      ctx.lineWidth = warn ? 3 : 2;
      ctx.setLineDash([10, 8]);
      roundRect(ctx, T / 2 - r, T / 2 - r, 2 * r, 2 * r, 18);
      ctx.stroke();
      ctx.setLineDash([]);
      if (warn && world) {
        ctx.strokeStyle = 'rgba(242,184,79,' + (0.5 + 0.45 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 3;
        for (const k of Z.coversIn(m, x0 / T - 1, y0 / T - 1, x1 / T + 1, y1 / T + 1, world.peek)) {
          ctx.beginPath(); ctx.ellipse(k.x * T, k.y * T + 6, 26 + 5 * pulse, 12 + 2 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
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
        for (const [id, f] of sitesIn(c, cx, cy)) {
          if (f.x < tx0 || f.x > tx1 || f.y < ty0 || f.y > ty1) continue;
          if (X.loadsLeft(m, f, id) <= 0) continue;
          const fx = (f.x + 0.5) * T, fy = (f.y + 0.5) * T;
          out.push({ y: fy + 12, draw: ctx => drawFind(ctx, f, fx, fy, time) });
        }
      }
      const inView = (px, py) => px > x0 - T && px < x1 + T && py > y0 - T && py < y1 + 2 * T;
      for (const d of x.drops) if (inView(d.x, d.y)) out.push({ y: d.y + 8, draw: ctx => drawDrop(ctx, d.x, d.y) });
      // Relay beacons stand for good, their light dim while your refill there is used this round.
      const had = (me && x.refills[me]) || [];
      x.beacons.forEach((b, i) => {
        const bx = (b.x + 0.5) * T, by = (b.y + 0.5) * T, spent = had.includes('B' + i);
        if (inView(bx, by)) out.push({ y: by + 6, draw: ctx => drawBeacon(ctx, bx, by, time, spent) });
      });
      for (const k of VEHICLES) {
        const r = x[k];
        if (r && !r.driver && inView(r.x, r.y)) out.push({ y: r.y + 10, draw: ctx => env.drawRover(ctx, r.x, r.y, k) });
      }
      // Dust devils: every screen draws the same ones from the round's clock. Past the edge of your view they fade out, so in
      // a dust storm one can be on you before you see it.
      const pl = env.player && env.player(), view = viewOf(pl);
      for (const d of Z.devils(m, x0 - T, y0 - T, x1 + T, y1 + 2 * T, clock())) {
        const dist = pl ? Math.sqrt(near2(d.x, d.y, pl.x, pl.y)) / T : 0;
        const a = d.a * Math.max(0, Math.min(1, (view + 1 - dist) / 2));
        if (a > 0.02) out.push({ y: d.y, draw: ctx => drawDevil(ctx, d, time, a) });
      }
      return out;
    }

    // Over the fog: the pings (seen wherever they are), the drone in flight, then the hold ring.
    function drawOver(ctx) {
      for (const q of livePings()) drawPing(ctx, q.x, q.y, pingColor(q.by), env.crewName(q.by), q.fade, q.age);
      const d = dronePos();
      if (d) drawDrone(ctx, d.x, d.y, now);
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
    // A vehicle is in its bay when nobody drives it, it is not parked out on the map and you are not in it.
    const atBay = (p, kind) => !!mission() && !!mission().expedition && !exp()[kind] && kindOf(p) !== kind;
    // A teammate's suit level (co-op positions carry it), 0–1, for the bar on their name tag; none at the base or when full.
    const suitBar = r => (r.suit == null || r.suit >= suitMax() || X.inBaseZone(mission(), r) ? null : r.suit / suitMax());

    // Minimap and map markers: finds you have seen (the biologist senses ice and methane vents further), cave mouths you
    // have seen, dropped loads, the parked vehicles. Rebuilt at most every 150 ms.
    function marks(world, px, py) {
      if (!mission() || !mission().expedition || !world) return [];
      if (now - marksAt < 0.15) return marksCache.concat(liveMarks());
      marksAt = now;
      const m = mission(), x = exp(), out = [];
      const sniff = ((D.SKILLS[crew() && crew().role] || {}).sight) || 0;
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      for (let cy = SW.chunkOf(ty - 80); cy <= SW.chunkOf(ty + 79); cy++) for (let cx = SW.chunkOf(tx - 80); cx <= SW.chunkOf(tx + 79); cx++) {
        const c = world.peek(cx, cy);
        if (!c) continue;
        for (const [id, f] of sitesIn(c, cx, cy)) {
          if (X.loadsLeft(m, f, id) <= 0) continue;
          const smelt = sniff && (f.kind === 'ice' || f.sub === 'vent') && near2(f.x, f.y, tx, ty) <= sniff * sniff;
          if (smelt || world.seen(f.x, f.y)) out.push({ x: (f.x + 0.5) * T, y: (f.y + 0.5) * T, color: COLORS[f.kind] });
        }
        for (const k of visible(c, 'caves')) if (world.seen(k.x, k.y)) out.push({ x: (k.x + 0.5) * T, y: (k.y + 0.5) * T, color: '#1a0d0a', ring: '#e8c9a8' });
      }
      for (const d of x.drops) out.push({ x: d.x, y: d.y, color: '#f46e5f' });
      for (const k of VEHICLES) if (x[k] && !x[k].driver) out.push({ x: x[k].x, y: x[k].y, color: PARKED[k], square: true });
      for (const b of x.beacons) out.push({ x: (b.x + 0.5) * T, y: (b.y + 0.5) * T, color: BEACON, beacon: true }); // its reveal lit them
      marksCache = out;
      return out.concat(liveMarks());
    }
    // What moves on the maps between rebuilds: the live pings, and the drone in flight (pale, edged in dark).
    const liveMarks = () => { const d = dronePos(); return pingMarks().concat(d ? [{ x: d.x, y: d.y, color: '#e8e2d6', ring: '#120a0c' }] : []); };
    // While you pick the drone's target, the full map rings the reach it may fly to (world px).
    const rings = p => (aim && p ? [{ x: p.x, y: p.y, r: D.DRONE.range * T, color: '#e8e2d6' }] : []);
    // The maps' lines: the dashed route home (X.routeHome), each beacon to the nearest of the HQ and the older beacons nearer home.
    function lines() {
      const m = mission();
      if (!m || !m.expedition) return [];
      const px = v => (v + 0.5) * T;
      const out = X.routeHome(m).map(l => ({ x0: px(l.x0), y0: px(l.y0), x1: px(l.x1), y1: px(l.y1), color: BEACON, dash: [3, 2] }));
      // The commander's route line (spec §3.5, §13.12): while he is out, a dashed line from him to each of his live pings.
      const lead = X.commanderOut(m, team());
      if (lead) for (const q of livePings()) if (q.by === lead.id) out.push({ x0: lead.x, y0: lead.y, x1: q.x, y1: q.y, color: A.ROLE.commander, width: 2, dash: [6, 3], alpha: q.fade });
      return out;
    }

    return {
      el, alert, sync, reset, canMove, step, focusAt, holdable, hasRoom, label, start, stop, act, canister, takeKit, returnKit, drawZone, sprites, drawOver,
      flareFx, suitBar, marks, lines, clock, addPing, speed, drone, cancelDrone, flyTo, rings,
      aiming: () => aim,
      view: viewOf,
      alerting: () => !alert.hidden,
      // While you are down your suit is not sent: a position in flight could undo a revive the server has just made.
      report: () => ({ suit: collapsed(me) ? null : Math.round(suit * 10) / 10, driven: Math.round(driven() * 10) / 10 }),
      roverAtBay: p => atBay(p, 'rover'),
      atBay,
      driving: () => (me && mission() && mission().expedition ? VEHICLES.find(k => exp()[k] && exp()[k].driver === me) || null : null),
      collapsed,
      state: () => ({ suit, driven: driven(), hold: hold && hold.f.key, collapsed: collapsed(me), benched: !!me && !!mission() && benched(), pack: me && mission() ? pack().length : 0, clock: clock() }),
      qaSuit: s => { suit = Math.max(0, Math.min(suitMax(), Number(s) || 0)); }, // play-testing: jump the suit level
      qaClock: s => { soloClock = Math.max(0, Number(s) || 0); },              // play-testing: jump the solo round clock
    };
  }

  root.SolEva = { create };
})(typeof self !== 'undefined' ? self : this);
