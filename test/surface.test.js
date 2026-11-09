'use strict';
// The walkable surface (src/surface.js) in a fake DOM, frame by frame: where your astronaut stands and what E does when
// exploring changes under them (a new mission, the rover, a collapse, a reload, a revive). The file is a browser script,
// so it runs in a vm sandbox with the globals the page gives it. The painter is a stub and the 2D context accepts every
// call: what it draws is checked in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/data.js');
const E = require('../src/engine.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');
const SW = require('../src/surface-world.js');
const P = require('../src/surface-paint.js');
const I = require('../src/i18n.js');
const Z = require('../src/dangers.js');

const T = 64;
const SOURCES = ['art.js', 'surface-map.js', 'surface-eva.js', 'surface.js'].map(f => [f, fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')]);
const plain = v => JSON.parse(JSON.stringify(v));
const flush = () => new Promise(r => setImmediate(r));
const ROVER_KIT = Object.assign({}, E.referenceKit('commander', 4), { rover: 1, waterwall: 0 });
const mission = o => E.createMission(Object.assign({ loadout: ROVER_KIT, events: false, pilot: 'minh' }, o));
const LOAD = { kind: 'metal', res: 'materials', amount: 40, id: '0,0:9', region: 0 };
const loads = n => Array.from({ length: n }, () => Object.assign({}, LOAD));
// The metal find nearest the HQ: its id and tile.
function metalFind(m) {
  let best = null;
  for (let cy = -2; cy <= 1; cy++) for (let cx = -2; cx <= 1; cx++) for (const f of X.findsIn(m, cx, cy)) {
    if (f.kind === 'metal' && (!best || f.x * f.x + f.y * f.y < best.x * best.x + best.y * best.y)) best = { id: cx + ',' + cy + ':' + f.n, x: f.x, y: f.y };
  }
  return best;
}

// While `rec.on`, every filled path is recorded as its box and fill style (path coordinates as given: world pixels for
// what the surface draws without a translate, such as name tags and suit bars).
const rec = { on: false, fills: [], box: null };
const grow = (x, y) => { const b = rec.box; rec.box = b ? { left: Math.min(b.left, x), right: Math.max(b.right, x), top: Math.min(b.top, y), bottom: Math.max(b.bottom, y) } : { left: x, right: x, top: y, bottom: y }; };
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 40 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'beginPath') return () => { rec.box = null; };
    if (k === 'moveTo' || k === 'lineTo') return (x, y) => grow(x, y);
    if (k === 'arcTo') return (x1, y1, x2, y2) => { grow(x1, y1); grow(x2, y2); };
    if (k === 'arc') return (x, y, r) => { grow(x - r, y - r); grow(x + r, y + r); };
    if (k === 'fill') return () => { if (rec.on && rec.box) rec.fills.push(Object.assign({ style: t.fillStyle }, rec.box)); };
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
const TAG_BOX = ['rgba(140,188,236,0.92)', 'rgba(20,14,16,0.78)'], SUIT_BAR = 'rgba(20,14,16,0.8)'; // src/surface-paint.js drawTag, drawSuitBar
const overlap = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
// The painter is a stub too. It notes when the ground is drawn (once for every frame that is drawn) and keeps the scale it was given.
function stubPainter(now) {
  const seen = { at: [], scale: 1 };
  const painter = new Proxy({}, {
    get: (t, k) => (k === 'stats' ? () => ({ paintMedian: 0 }) : k === 'drawGround' ? () => { seen.at.push(now()); } : k === 'setScale' ? s => { seen.scale = s; } : () => {}),
  });
  return { painter, seen };
}
function element(tag) {
  const n = { tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, listeners: {}, attrs: {}, hidden: false, className: '', textContent: '', innerHTML: '', isConnected: true, clientWidth: 160, clientHeight: 160 };
  n.append = (...cs) => { n.children.push(...cs); };
  n.appendChild = c => { n.children.push(c); return c; };
  n.addEventListener = (type, fn) => { (n.listeners[type] = n.listeners[type] || []).push(fn); };
  n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
  n.classList = { add() {}, remove() {} };
  n.focus = () => {};
  n.getContext = () => ctx;
  n.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 640 });
  return n;
}

// A page showing mission `m` as crew member `me`. Exploring actions run the rules' one table (Z.act) on the mission the page
// was last shown, then show it again: ui.js renders the same mission after a solo action, and a co-op room broadcasts a new copy
// (a JSON copy here). sent: the positions teammates are sent; calls: the exploring actions asked for. Like ui.js, the page
// is shown where its astronaut last stood (the solo save; `opts.lastPos` stands for the co-op server's position).
// `opts.dpr` is the screen's pixel ratio (1); `opts.lang` the player's language ('en'); `opts.gfx` the Display settings the page passes to update (setGfx changes them);
// `opts.paint` replaces SolPaint functions (to see what is drawn), `opts.expedition` SolExpedition ones (rules not written yet).
function page(m, me, opts) {
  const o = opts || {};
  let raf = null, clock = 0, cur = m, gfx = o.gfx, wobble = 7, resized = null;
  const on = {}, sent = [], calls = [], walks = [], queued = [];
  const { painter, seen } = stubPainter(() => clock);
  const win = {
    SolData: D, SolEngine: E, SolWorldgen: W, SolExpedition: Object.assign({}, X, o.expedition), SolDangers: Z, SolWorld: SW, SolPhysics: require('../src/physics.js'),
    SolPaint: Object.assign({}, P, o.paint, { createPainter: (world, popts) => { seen.scale = (popts && popts.scale) || 1; return painter; } }),
    document: { createElement: element, createTextNode: text => ({ text }), querySelector: () => null, hidden: false },
    location: { search: '?debug=chunks' }, performance: { now: () => clock }, devicePixelRatio: o.dpr || 1, Image: function () {},
    matchMedia: () => ({ matches: false }),
    ResizeObserver: function (fn) { this.observe = () => { resized = fn; }; }, // the page's `pg.resize()` is the browser telling it the stage changed
    addEventListener: (type, fn) => { (on[type] = on[type] || []).push(fn); },
    requestAnimationFrame: fn => { raf = fn; },
  };
  win.window = win.self = win;
  vm.createContext(win);
  for (const [f, code] of SOURCES) vm.runInContext(code, win, { filename: f });
  const S = win.SolSurface;
  const show = next => {
    cur = next;
    const shown = cur.coop ? plain(cur) : cur, plan = E.defaultPlan(shown);
    S.update({
      mission: shown, plan, forecast: E.forecast(shown, plan), controlId: me, canControl: () => true, crewName: id => id, t: (k, p) => I.t(o.lang || 'en', k, p), lang: o.lang || 'en', fog: null,
      lastPos: cur.coop ? o.lastPos || null : X.whereOf(cur, me), gfx,
    });
  };
  const hooks = {
    exp: (type, payload, pos) => {
      calls.push(type);
      const r = Z.act(cur, me, type, payload, pos);
      if (!r.error) show(cur);
      return Promise.resolve(r);
    },
    // What a solo save keeps every 2 s (ui.js does the same).
    suit: r => { if (!cur.coop) { X.setSuit(cur, me, r.suit); if (r.driven != null) X.setRoverDriven(cur, me, r.driven); Z.setClock(cur, r.clock); X.setWhere(cur, me, r.at); } },
    sendPos: pos => sent.push(plain(pos)),
    // Walking samples (ui.js counts the tiles in solo, as here; the co-op server counts them from positions).
    walk: (from, to, dt) => { walks.push(dt); if (!cur.coop) X.addDistance(cur, me, from, to, dt); },
    ping: o.ping, // co-op: `o.ping(x, y)` sends a ping (true when it went out)
    queueBuild: b => queued.push(b), canAdvance: () => false, // the HQ menu's builds, and its Advance button
  };
  const root = S.mount(hooks), canvas = root.children[0];
  show(m);
  return {
    sent, calls, walks, queued, show, qa: S.qa, probe: () => S.probe(), reset: () => S.reset(), remote: list => S.setRemote(list), ping: d => S.ping(d),
    canvas, overlay: root.children[1], seen, resize: () => resized(), setGfx(g) { gfx = g; show(cur); },
    step(secs) { for (let i = 0; i < Math.round(secs * 20); i++) { clock += 50; raf(clock); } },
    // `secs` of frames at `hz` with synthetic timestamps, as requestAnimationFrame gives them (the clock is the frame's exact time;
    // the timestamp wobbles by up to ±`jitter` ms); returns how many of them drew the ground.
    frames(hz, secs, jitter) {
      const drawn = seen.at.length, from = clock;
      for (let i = 1; i <= Math.round(hz * secs); i++) {
        clock = from + i * 1000 / hz;
        wobble = (Math.imul(wobble, 1664525) + 1013904223) >>> 0; // the same wobble every run
        raf(clock + (jitter || 0) * (wobble / 2147483648 - 1));
      }
      return seen.at.length - drawn;
    },
    // One more frame, with every filled path it draws recorded.
    frame() { rec.fills = []; rec.on = true; try { clock += 50; raf(clock); } finally { rec.on = false; } return rec.fills; },
    key(code, down) { for (const fn of on[down === false ? 'keyup' : 'keydown'] || []) fn({ code, repeat: false, target: {}, preventDefault() {} }); },
    // A tap on the ground at tile (tx, ty): click-to-walk.
    tap(tx, ty) {
      const [clientX, clientY] = S.probe().toScreen((tx + 0.5) * T, (ty + 0.5) * T);
      for (const fn of canvas.listeners.pointerdown) fn({ clientX, clientY, pointerId: 1 });
    },
  };
}

test('a new mission (SolSurface.reset) starts with a full suit and battery, even with the same astronaut in the same round', async () => {
  const a = mission({ seed: 'SURF-A' });
  a.expedition.roverDriven = D.EXPEDITION.roverRange; // mission A's rover battery is flat
  const pg = page(a, 'minh');
  pg.qa.teleport(30, 4);
  pg.qa.suit(0);
  pg.step(0.3);
  await flush();
  assert.deepEqual(plain(a.expedition.benched), ['minh'], 'mission A: minh collapsed in round 1');
  // Back to the title, then mission B with the same astronaut: ui.js resets the surface, then shows the new mission.
  const b = mission({ seed: 'SURF-B' });
  pg.reset();
  pg.show(b);
  pg.step(0.2);
  assert.equal(pg.probe().eva.suit, D.EXPEDITION.suit, 'mission B: a full suit');
  assert.equal(pg.probe().eva.driven, 0, 'mission B: a full rover battery');
  pg.qa.teleport(0, 4);
  assert.equal(X.inBaseZone(pg.probe().player), false, 'one step outside the base zone');
  pg.step(4);
  await flush();
  assert.equal(pg.calls.filter(c => c === 'collapse').length, 1, 'only mission A asked for a collapse');
  assert.deepEqual(plain(b.expedition.incidents), [], 'mission B: no collapse');
  assert.ok(Math.abs(pg.probe().eva.suit - (D.EXPEDITION.suit - 4)) < 0.2, 'mission B: the suit drains from full: ' + pg.probe().eva.suit);
  assert.ok(b.expedition.suits.minh > 140, "mission B's saved suit is its own: " + b.expedition.suits.minh);
});

test("leaving a co-op room (SolSurface.reset) forgets its players: in the next mission their crewmates walk as the crew again", () => {
  const room = mission({ seed: 'ROOM-A', coop: true });
  const pg = page(room, 'minh');
  pg.remote([{ crewId: 'diego', x: 30 * T + 32, y: 4 * T + 32, dir: 'down', moving: false, rover: false, suit: 40 }]);
  pg.step(0.2);
  assert.deepEqual(Object.keys(pg.probe().remote), ['diego'], 'in the room, diego is another player');
  // Leave the room, then play solo: ui.js resets the surface (forgetFog), then shows the solo mission.
  pg.reset();
  pg.show(mission({ seed: 'SOLO-B' }));
  pg.step(0.2);
  assert.deepEqual(Object.keys(pg.probe().remote), [], "no player from the room is left standing on the solo mission's map");
  assert.ok(pg.probe().npcs.includes('diego'), 'diego walks as one of the crew again');
});

test('in the rover E gets you out, unless a crewmate to revive or a find your backpack has room for is right there', async () => {
  const m = mission({ seed: 'STUCK-1' });
  assert.equal(X.board(m, 'minh', X.bay(m)).ok, true);
  m.expedition.roverDriven = D.EXPEDITION.roverRange; // the battery is flat: the rover can't move
  m.expedition.carried.minh = loads(D.EXPEDITION.packRover - 1);
  const f = metalFind(m);
  const pg = page(m, 'minh');
  assert.equal(pg.probe().player.inRover, true, 'in the seat');
  pg.qa.teleport(f.x, f.y - 1); // facing the find, just below you
  pg.step(0.5);
  assert.equal(pg.probe().focusKey, 'f:' + f.id, 'room for one more load: E works on the find');
  m.expedition.carried.minh.push(Object.assign({}, LOAD));
  pg.step(0.1);
  assert.equal(pg.probe().focusKey, 'rover-exit', 'the backpack is full: E gets you out');
  assert.deepEqual(pg.calls, [], 'nothing asked yet');
  pg.key('KeyE');
  pg.key('KeyE', false);
  await flush();
  assert.equal(pg.probe().player.inRover, false, 'out on foot');
  assert.deepEqual(pg.calls, ['park'], 'the rover is parked');
  assert.ok(!(m.expedition.rover && m.expedition.rover.driver), 'nobody drives it');

  // Co-op: a crewmate down right in front of the rover comes first, even with a full backpack.
  const c = mission({ seed: 'STUCK-2', coop: true });
  assert.equal(X.board(c, 'minh', X.bay(c)).ok, true);
  c.expedition.roverDriven = D.EXPEDITION.roverRange;
  c.expedition.carried.minh = loads(D.EXPEDITION.packRover);
  assert.equal(X.collapse(c, 'diego', { x: 30 * T + 32, y: 5 * T + 32 }).ok, true);
  const pg2 = page(c, 'minh');
  pg2.qa.teleport(30, 4); // diego lies one tile below
  pg2.step(0.5);
  assert.equal(pg2.probe().focusKey, 'v:diego', 'E revives diego');
});

test('a co-op driver who collapses is out of the rover: it stays parked where they fell, and they get up on foot', async () => {
  const m = mission({ seed: 'COOP-R', coop: true });
  assert.equal(X.board(m, 'minh', X.bay(m)).ok, true);
  const pg = page(m, 'minh');
  assert.equal(pg.probe().player.inRover, true, 'driving');
  pg.qa.teleport(30, 4);
  pg.qa.suit(0);
  pg.step(0.3);
  await flush();
  const spot = plain(m.expedition.collapsed.minh);
  assert.ok(spot, 'minh collapsed');
  assert.deepEqual(plain(m.expedition.rover), spot, 'the server parked the rover where minh fell');
  pg.step(0.3);
  assert.equal(pg.probe().player.inRover, false, 'minh is out of the rover');
  assert.equal(pg.sent[pg.sent.length - 1].rover, false, 'teammates are told minh is on foot, so they draw only the parked rover');
  assert.equal(X.revive(m, 'diego', 'minh', spot).ok, true);
  pg.show(m);
  pg.step(0.3);
  assert.equal(pg.probe().player.inRover, false, 'revived on foot');
  assert.equal(pg.probe().focusKey, 'rover-parked', 'the parked rover is right there');
  pg.key('KeyE');
  pg.key('KeyE', false);
  await flush();
  assert.equal(m.expedition.rover.driver, 'minh', 'and boarding it works');
  assert.equal(pg.probe().player.inRover, true);
});

test('a collapsed co-op player facing the rover in its bay is not offered a drive, and E does not get them in', async () => {
  const m = mission({ seed: 'COOP-B', coop: true });
  const bay = X.bay(m), spot = { x: bay.x, y: bay.y - 34 }; // just north of the bay, outside the base zone
  assert.equal(X.inBaseZone(spot), false);
  assert.equal(X.collapse(m, 'minh', spot).ok, true);
  const pg = page(m, 'minh'); // lying where they fell, facing down: the bay is the tile they look at
  pg.step(0.2);
  const tile = m.layout.find(k => k.type === 'rover');
  assert.equal(pg.probe().focusKey, 's:' + tile.x + ',' + tile.y, 'the bay in front of them is just the bay: no "Drive the rover"');
  const sentBefore = pg.sent.length;
  pg.key('KeyE');
  pg.key('KeyE', false);
  pg.step(0.3);
  await flush();
  assert.deepEqual(pg.calls, [], 'no boarding is asked for');
  assert.equal(pg.probe().player.inRover, false, 'not in the rover, not even for a moment');
  assert.ok(pg.sent.slice(sentBefore).every(s => !s.rover), 'teammates are never told they are in the rover');
});

test('a co-op crew member who reloads while collapsed lies where they fell, and teammates are sent that spot', () => {
  const m = mission({ seed: 'COOP-L', coop: true });
  m.expedition.carried.minh = loads(1);
  const spot = { x: 30 * T + 32, y: 4 * T + 32 };
  assert.equal(X.collapse(m, 'minh', spot).ok, true);
  const pg = page(m, 'minh'); // a reload: a new page on the room's copy of the mission
  pg.step(0.3);
  const pr = pg.probe();
  assert.deepEqual([pr.player.x, pr.player.y], [spot.x, spot.y], 'at the collapse spot, not by the HQ');
  assert.equal(pr.player.inRover, false);
  assert.equal(pr.player.path, null);
  const last = pg.sent[pg.sent.length - 1];
  assert.deepEqual([last.x, last.y], [spot.x, spot.y], 'where the revive prompt is');
  const [sx] = pr.toScreen(spot.x, spot.y);
  assert.ok(Math.abs(sx - 480) < 1, 'the camera is on them: ' + sx);
});

test('a click-to-walk path ends when every step is refused: a collapsed co-op player lies still and does not walk on after a revive', async () => {
  const m = mission({ seed: 'COOP-W', coop: true });
  const pg = page(m, 'minh');
  pg.qa.teleport(30, 4);
  pg.step(0.2);
  pg.tap(36, 4); // walk six tiles east
  pg.step(0.2);
  assert.ok(pg.probe().player.path, 'walking east');
  pg.qa.suit(0);
  pg.step(0.3);
  await flush();
  assert.ok(m.expedition.collapsed.minh, 'minh collapsed on the way');
  pg.step(0.5);
  assert.equal(pg.probe().player.path, null, 'the walk is over');
  assert.equal(pg.sent[pg.sent.length - 1].moving, false, 'teammates are sent moving: false');
  pg.qa.hold('KeyD', true); // trying to walk while down
  pg.step(0.3);
  pg.qa.hold('KeyD', false);
  assert.equal(pg.sent[pg.sent.length - 1].moving, false, 'a held key while down still sends moving: false');
  const at = [pg.probe().player.x, pg.probe().player.y];
  assert.equal(X.revive(m, 'diego', 'minh', m.expedition.collapsed.minh).ok, true);
  pg.show(m);
  pg.step(1);
  assert.deepEqual([pg.probe().player.x, pg.probe().player.y], at, 'no walking on after the revive');
});

test("teammates' suit bars sit clear of every name tag, also where the tags of crew standing close push each other up", () => {
  const m = mission({ seed: 'TAGS-1', coop: true });
  const pg = page(m, 'minh');
  pg.qa.teleport(30, 4);
  const x = 30 * T + 32, y = 4 * T + 32;
  // Two teammates outside the base just east of you, side by side: three name tags that would sit on one line, so Diego's
  // is pushed up off yours and Amara's off his, bars and all.
  pg.remote([
    { crewId: 'diego', x: x + 48, y, dir: 'down', moving: false, rover: false, suit: 75 },
    { crewId: 'amara', x: x + 88, y, dir: 'down', moving: false, rover: false, suit: 40 },
  ]);
  pg.step(0.2);
  const fills = pg.frame();
  const tags = fills.filter(f => TAG_BOX.includes(f.style)), bars = fills.filter(f => f.style === SUIT_BAR);
  assert.equal(tags.length, 3, 'three name tags: yours and two teammates');
  assert.equal(bars.length, 2, "two suit bars, the teammates'");
  for (const b of bars) for (const tg of tags) assert.ok(!overlap(b, tg), 'the bar ' + JSON.stringify(b) + ' covers the name tag ' + JSON.stringify(tg));
  for (const b of bars) {
    const below = tags.filter(tg => Math.abs((tg.left + tg.right) / 2 - (b.left + b.right) / 2) < 1 && tg.top >= b.bottom);
    assert.ok(below.length && Math.min(...below.map(tg => tg.top)) - b.bottom <= 3, 'the bar sits right on top of its own tag: ' + JSON.stringify(b));
  }
});

// ---------- dangers (M4b) ----------

test('the view follows the weather: 8 tiles clear (10 in the rover), 5 in a regional dust storm, 3 in a global one; the fog lifts that far', () => {
  for (const [weather, foot, rover] of [['clear', 8, 10], ['regional', 5, 5], ['global', 3, 3]]) {
    const m = mission({ seed: 'VIEW-' + weather });
    m.schedule[m.turn].weather = weather;
    const pg = page(m, 'minh');
    pg.qa.teleport(60, 60);
    pg.step(0.1);
    assert.equal(pg.probe().view, foot, weather + ': on foot');
    const seen = pg.probe().seen;
    assert.equal(seen(60 + foot, 60), true, weather + ': ' + foot + ' tiles away is seen');
    assert.equal(seen(60 + foot + 1, 60), false, weather + ': one more is not');
    pg.qa.board(true);
    pg.step(0.1);
    assert.equal(pg.probe().view, rover, weather + ': in the rover');
  }
});

test('a reload mid-round puts you back where you stood; after a solo collapse you stay at the base', () => {
  const m = mission({ seed: 'BACK-1' });
  const pg = page(m, 'minh');
  pg.qa.teleport(9, 3);
  pg.step(2.2); // the layer reports where you stand every 2 s, and the solo save keeps it
  assert.deepEqual(X.whereOf(m, 'minh'), { x: 9 * T + 32, y: 3 * T + 32 });
  const again = page(plain(m), 'minh');
  assert.deepEqual([again.probe().player.x, again.probe().player.y], [9 * T + 32, 3 * T + 32], 'back where you stood, not by the HQ');
  X.collapse(m, 'minh', { x: 30 * T + 32, y: 4 * T + 32 });
  m.expedition.where.minh = { x: 30 * T + 32, y: 4 * T + 32 }; // saved before the layer sent you home
  const benched = page(plain(m), 'minh');
  const p = benched.probe().player;
  assert.ok(X.inBaseZone(p), 'a collapsed solo astronaut sits out the round at the base: ' + p.x + ',' + p.y);
  const coop = mission({ seed: 'BACK-2', coop: true });
  const seat = page(coop, 'minh', { lastPos: { x: 1300, y: 200 } });
  assert.deepEqual([seat.probe().player.x, seat.probe().player.y], [1300, 200], 'co-op: where the server last saw you');
});

test("a dust devil's throw slides you 2 tiles away from it, over a quarter of a second", () => {
  const m = mission({ seed: 'THROW-1' });
  m.schedule[m.turn].devil = true;
  // A formed devil whose middle passes close to the middle of an open tile, so a teleport puts you right in its way.
  let hit = null;
  for (let t = 30; t < 600 && !hit; t += 0.25) {
    for (const d of Z.devils(m, 30 * T, -60 * T, 120 * T, 60 * T, t)) {
      const tx = Math.floor(d.x / T), ty = Math.floor(d.y / T), cx = tx * T + 32, cy = ty * T + 32;
      if (d.a === 1 && Math.hypot(d.x - cx, d.y - cy) < 20 && !W.BLOCKING[X.chunkAt(m, Math.floor(tx / 32), Math.floor(ty / 32)).tiles[(ty - Math.floor(ty / 32) * 32) * 32 + tx - Math.floor(tx / 32) * 32]]) { hit = { d, t, tx, ty }; break; }
    }
  }
  assert.ok(hit, 'a devil to stand in');
  const pg = page(m, 'minh');
  pg.qa.ghost(true); // nothing in the way of the slide
  pg.qa.teleport(hit.tx, hit.ty);
  pg.qa.clock(hit.t);
  const from = [pg.probe().player.x, pg.probe().player.y];
  pg.step(0.05);
  assert.ok(pg.probe().push, 'thrown');
  pg.step(0.5);
  const to = [pg.probe().player.x, pg.probe().player.y];
  const moved = Math.hypot(to[0] - from[0], to[1] - from[1]);
  assert.ok(Math.abs(moved - 2 * T) < 6, 'about 2 tiles: ' + moved.toFixed(1) + ' px');
  assert.ok(Math.hypot(to[0] - hit.d.x, to[1] - hit.d.y) > Math.hypot(from[0] - hit.d.x, from[1] - hit.d.y), 'away from the devil');
  assert.equal(pg.probe().push, null, 'the slide is over');
});

test("a dust devil's throw stops at a wall: you are never left inside rock", () => {
  const m = mission({ seed: 'THROW-WALL' });
  m.schedule[m.turn].devil = true;
  const rock = (x, y) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T), cx = Math.floor(tx / 32), cy = Math.floor(ty / 32);
    return W.BLOCKING[X.chunkAt(m, cx, cy).tiles[(ty - cy * 32) * 32 + tx - cx * 32]] === 1;
  };
  // A formed devil just off the middle of an open tile, with rock less than 2 tiles beyond it, so its throw runs into the rock.
  let hit = null;
  for (let t = 30; t < 900 && !hit; t += 0.25) {
    for (const d of Z.devils(m, 30 * T, -60 * T, 120 * T, 60 * T, t)) {
      const tx = Math.floor(d.x / T), ty = Math.floor(d.y / T), cx = tx * T + 32, cy = ty * T + 32, len = Math.hypot(cx - d.x, cy - d.y);
      if (d.a !== 1 || len < 4 || len > 20 || rock(cx, cy)) continue;
      const ux = (cx - d.x) / len, uy = (cy - d.y) / len;
      if ([0.6, 1, 1.4, 1.8].some(k => rock(cx + ux * k * T, cy + uy * k * T))) { hit = { d, t, tx, ty }; break; }
    }
  }
  assert.ok(hit, 'a devil by a wall');
  const pg = page(m, 'minh');
  pg.qa.teleport(hit.tx, hit.ty);
  pg.qa.clock(hit.t);
  const from = pg.probe().player;
  pg.step(0.05);
  assert.ok(pg.probe().push, 'thrown');
  pg.step(0.5);
  const p = pg.probe().player;
  assert.equal(pg.probe().push, null, 'the slide is over');
  const feet = [[p.x - 10, p.y - 6], [p.x + 10, p.y - 6], [p.x - 10, p.y + 4], [p.x + 10, p.y + 4]]; // surface.js hitsWall
  assert.ok(feet.every(([x, y]) => !pg.probe().blocked(Math.floor(x / T), Math.floor(y / T))), 'not inside rock at ' + Math.round(p.x) + ',' + Math.round(p.y));
  assert.ok(Math.hypot(p.x - from.x, p.y - from.y) < 2 * T - 8, 'the rock stopped the throw short of 2 tiles');
});

// A formed devil just north of the middle of an open tile, with open ground 2 tiles south of it: its throw heads south, a full
// 2 tiles (from the HQ's doorstep that is out of the base zone). { t, tx, ty }: the round clock, and the tile to stand on.
function devilThrowingSouth(m) {
  const open = (tx, ty) => !W.BLOCKING[X.chunkAt(m, Math.floor(tx / 32), Math.floor(ty / 32)).tiles[(ty - Math.floor(ty / 32) * 32) * 32 + tx - Math.floor(tx / 32) * 32]];
  for (let t = 30; t < 900; t += 0.25) {
    for (const d of Z.devils(m, 30 * T, -60 * T, 120 * T, 60 * T, t)) {
      const tx = Math.floor(d.x / T), ty = Math.floor(d.y / T), north = ty * T + 32 - d.y;
      if (d.a === 1 && north > 8 && north < 20 && Math.abs(tx * T + 32 - d.x) < 4 && open(tx, ty) && open(tx, ty + 1) && open(tx, ty + 2)) return { t, tx, ty };
    }
  }
  return null;
}

test("a dust devil's hit that empties the suit collapses you where it caught you and throws nobody: the benched astronaut sits at the base", async () => {
  const devilRound = () => { const m = mission({ seed: 'THROW-COLLAPSE' }); m.schedule[m.turn].devil = true; return m; };
  const m = devilRound();
  const hit = devilThrowingSouth(m);
  assert.ok(hit, 'a devil to stand under');
  const pg = page(m, 'minh');
  pg.qa.suit(5); // the hit's 10 s empty it
  pg.qa.teleport(hit.tx, hit.ty);
  pg.qa.clock(hit.t);
  pg.step(0.05); // the hit and the collapse are asked for in the same frame
  assert.equal(pg.probe().push, null, 'a hit that empties the suit throws nobody');
  await flush(); // and the collapse is answered at the end of it: back at the base
  assert.deepEqual(plain(m.expedition.benched), ['minh'], 'minh collapsed');
  assert.equal(pg.probe().push, null, 'no throw is left to carry the benched astronaut off');
  pg.step(0.5);
  const p = pg.probe().player;
  assert.ok(X.inBaseZone(p), 'minh sits out the round at the base: ' + Math.round(p.x) + ',' + Math.round(p.y));

  // A hit that leaves suit still throws; and a throw still sliding when a new round puts you back at the HQ is over.
  const m2 = devilRound(), pg2 = page(m2, 'minh');
  pg2.qa.teleport(hit.tx, hit.ty);
  pg2.qa.clock(hit.t);
  pg2.step(0.05);
  assert.ok(pg2.probe().push, 'thrown');
  pg2.show(E.resolveTurn(m2, E.defaultPlan(m2)).state);
  assert.equal(pg2.probe().push, null, 'a new round starts you at the HQ with no throw left');
});

test("co-op: a dust devil's hit that leaves a sliver of suit throws, but the throw ends when the suit runs out: the body lies where the collapse is anchored", () => {
  const m = mission({ seed: 'THROW-COLLAPSE', coop: true });
  m.schedule[m.turn].devil = true;
  const hit = devilThrowingSouth(m);
  assert.ok(hit, 'a devil to stand under');
  const pg = page(m, 'minh');
  pg.qa.suit(10.06); // the hit's 10 s leave a sliver: the suit runs out a frame or two into the 0.25 s slide
  pg.qa.teleport(hit.tx, hit.ty);
  pg.qa.clock(hit.t);
  const from = pg.probe().player;
  pg.step(0.05);
  assert.ok(pg.probe().push, 'thrown: the hit leaves suit');
  for (let i = 0; i < 10 && !pg.calls.includes('collapse'); i++) pg.step(0.05);
  assert.deepEqual(pg.calls, ['collapse'], 'the suit ran out during the slide, and the collapse was asked for');
  pg.step(0.05); // the next frame
  assert.equal(pg.probe().push, null, 'the slide ended with the suit');
  pg.step(0.5);
  const spot = plain(m.expedition.collapsed.minh), p = pg.probe().player;
  assert.deepEqual([Math.round(p.x), Math.round(p.y)], [spot.x, spot.y], 'the body lies where the server anchored the collapse, where a crewmate can revive it');
  assert.ok(Math.hypot(p.x - from.x, p.y - from.y) < T, 'well short of a full throw');
});

test("the flare's banner takes the hint's place at the top of the surface", async () => {
  const m = mission({ seed: 'BANNER-1' });
  m.schedule[m.turn].spe = true;
  const pg = page(m, 'minh');
  pg.qa.teleport(6, 4);
  pg.step(0.1);
  await flush();
  assert.ok(m.expedition.flare, 'stepping outside started the flare');
  assert.equal(pg.probe().hint, true, 'the hint shows for the first seconds');
  assert.equal(pg.probe().alert, false);
  pg.qa.clock(m.expedition.flare.warn + 1);
  pg.step(0.1);
  assert.equal(pg.probe().alert, true, 'the countdown is up');
  assert.equal(pg.probe().hint, false, 'and the hint makes way');
});

// ---------- display settings (the graphics level, the FPS limit and the FPS readout) ----------

test("Best draws the canvas at the screen's pixel ratio (up to 4), Fast at 1; changing the level resizes it at once and sets the ground's scale", () => {
  const m = mission({ seed: 'GFX-1' });
  const size = pg => [pg.canvas.width, pg.canvas.height]; // the stage is 960 × 640
  const best = page(m, 'minh', { dpr: 3 });
  best.step(0.1);
  assert.deepEqual(size(best), [960 * 3, 640 * 3], 'Best: the stage size × 3');
  assert.equal(best.seen.scale, 2, 'and the ground is painted at 2×');
  best.setGfx({ quality: 'fast' }); // no frame in between
  assert.deepEqual(size(best), [960, 640], 'Best → Fast: × 1 at once');
  assert.equal(best.seen.scale, 1, 'and 1× ground at once');
  best.setGfx({ quality: 'best' });
  assert.deepEqual(size(best), [960 * 3, 640 * 3], 'Fast → Best: × 3 again at once');
  assert.equal(best.seen.scale, 2);
  const fast = page(m, 'minh', { dpr: 3, gfx: { quality: 'fast' } });
  fast.step(0.1);
  assert.deepEqual(size(fast), [960, 640], 'Fast: × 1');
  assert.equal(fast.seen.scale, 1, 'with 1× ground');
  const wide = page(m, 'minh', { dpr: 5 });
  wide.step(0.1);
  assert.deepEqual(size(wide), [960 * 4, 640 * 4], 'Best stops at × 4');
  const odd = page(m, 'minh', { dpr: 3, gfx: { quality: 'ultra' } });
  odd.step(0.1);
  assert.deepEqual(size(odd), [960 * 3, 640 * 3], 'a level the settings do not have is Best');
  assert.equal(odd.seen.scale, 2);
});

test('the dust in the air follows the weather and the graphics level: Best 39 / 165 / 330, Fast 13 / 55 / 110', () => {
  for (const [weather, best, fast] of [['clear', 39, 13], ['regional', 165, 55], ['global', 330, 110]]) {
    const m = mission({ seed: 'DUST-' + weather });
    m.schedule[m.turn].weather = weather;
    const pg = page(m, 'minh');
    pg.step(0.1);
    assert.equal(pg.probe().dust, best, weather + ', Best');
    pg.setGfx({ quality: 'fast' });
    pg.step(0.1);
    assert.equal(pg.probe().dust, fast, weather + ', Fast');
  }
});

test('the FPS limit is an average: 30 on a 60 Hz screen draws 30 frames a second, 60 on 60 Hz every frame despite jitter, 60 on 144 Hz just 60, Max every one', () => {
  const m = mission({ seed: 'CAP-1' });
  // A second of frames with synthetic timestamps, after half a second to settle: how many drew, and the gaps between the draws.
  const second = (cap, hz, jitter) => {
    const pg = page(m, 'minh', { gfx: { fpsCap: cap } });
    pg.frames(hz, 0.5, jitter);
    const from = pg.seen.at.length, n = pg.frames(hz, 1, jitter), at = pg.seen.at.slice(from);
    return { n, gaps: at.slice(1).map((t, i) => t - at[i]) };
  };
  const near = (got, want, slack, what) => assert.ok(Math.abs(got - want) <= slack, what + ': ' + got + ' frames, not ' + want + ' ± ' + slack);
  near(second(30, 60).n, 30, 1, 'a limit of 30 on 60 Hz');
  assert.equal(second(60, 60, 0.2).n, 60, 'a limit of 60 on 60 Hz draws every frame, with ±0.2 ms of jitter');
  near(second(60, 144).n, 60, 2, 'a limit of 60 on 144 Hz');
  assert.equal(second(0, 144).n, 144, 'Max on 144 Hz draws every callback');
  assert.equal(second(45, 144).n, 144, 'a limit the settings do not have is Max');
  // A long pause (a hidden tab draws nothing) leaves the schedule far behind: the limit holds after it, with no burst of frames.
  const paused = page(m, 'minh', { gfx: { fpsCap: 30 } });
  paused.frames(60, 0.5);
  paused.frames(0.1, 10); // one callback, ten seconds later
  near(paused.frames(60, 1), 30, 1, 'a limit of 30 on 60 Hz, a second after a ten-second pause');
  // Every other frame of a 60 Hz screen stays every other frame when the timestamps jitter: a frame that comes a fraction of a
  // millisecond early is not skipped and drawn a frame late, so the draws stay 33.3 ms apart.
  const { gaps } = second(30, 60, 0.2);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.01, 'evenly spaced draws, not ' + [...new Set(gaps.map(g => g.toFixed(1)))].join(' / ') + ' ms');
});

test('a new quality is drawn at once, even under an FPS limit: the resize cleared the canvas, so the next callback draws although no frame is due', () => {
  const m = mission({ seed: 'CAP-3' });
  const pg = page(m, 'minh', { gfx: { fpsCap: 30 } });
  // One callback of a 144 Hz screen, 7 ms after the last: 1 if it drew. At a limit of 30 a frame is due 33 ms after the one before.
  const one = () => pg.frames(144, 1 / 144);
  pg.frames(144, 0.5);
  let n = 0;
  while (!one()) assert.ok(++n < 5, 'a frame is drawn at least every five callbacks');
  assert.equal(one(), 0, 'the callback 7 ms after a drawn frame is skipped');
  pg.setGfx({ quality: 'fast', fpsCap: 30 });
  assert.equal(one(), 1, 'the callback 14 ms after it draws: the new quality resized the canvas, which cleared it');
});

test('a resize asks for the next draw at once, even under an FPS limit: it cleared the canvas', () => {
  const m = mission({ seed: 'CAP-4' });
  const pg = page(m, 'minh', { gfx: { fpsCap: 30 } });
  const one = () => pg.frames(144, 1 / 144);
  pg.frames(144, 0.5);
  let n = 0;
  while (!one()) assert.ok(++n < 5, 'a frame is drawn at least every five callbacks');
  assert.equal(one(), 0, 'the callback 7 ms after a drawn frame is skipped');
  pg.resize(); // a window drag
  assert.equal(one(), 1, 'the next callback draws');
});

test('Fast never draws more pixels than Best on a zoomed-out browser (ratio 0.5), and is still 1 at 3', () => {
  const m = mission({ seed: 'GFX-2' });
  const px = (dpr, quality) => { const pg = page(m, 'minh', { dpr, gfx: { quality } }); pg.step(0.1); return pg.canvas.width * pg.canvas.height; };
  assert.ok(px(0.5, 'fast') <= px(0.5, 'best'), 'ratio 0.5: ' + px(0.5, 'fast') + ' against ' + px(0.5, 'best'));
  assert.equal(px(3, 'fast'), 960 * 640, 'ratio 3: Fast stays at 1');
});

test('the FPS limit does not slow the game: a skipped callback leaves its time to the next frame; the fps reading is the rate actually drawn', () => {
  const m = mission({ seed: 'CAP-2' });
  const run = cap => {
    const pg = page(m, 'minh', { gfx: { fpsCap: cap } });
    pg.qa.ghost(true);
    pg.qa.teleport(30, 4);
    pg.frames(60, 0.5);
    const x0 = pg.probe().player.x;
    pg.qa.hold('KeyD', true);
    pg.frames(60, 3);
    return { dx: pg.probe().player.x - x0, fps: pg.probe().fps };
  };
  const slow = run(30), free = run(0);
  assert.ok(free.dx > 300, 'three seconds of walking cover real ground: ' + free.dx);
  assert.ok(Math.abs(slow.dx - free.dx) < 10, 'the same ground at 30 fps: ' + slow.dx + ' against ' + free.dx);
  assert.equal(free.fps, 60);
  assert.equal(slow.fps, 30, 'the reading is the rate of the frames drawn, not of the callbacks');
});

test("the camera's ease and the dust's drift and sway keep real time: a 30 FPS limit and a 144 Hz screen look the same as 60 Hz", () => {
  const m = mission({ seed: 'REAL-1' });
  m.schedule[m.turn].weather = 'clear';
  // How far the camera trails a walker after a second of walking east: the astronaut's distance from the middle of the screen, in px.
  const trail = (hz, cap) => {
    const pg = page(m, 'minh', { gfx: { fpsCap: cap } });
    pg.qa.ghost(true);
    pg.qa.teleport(30, 4);
    pg.frames(hz, 0.5);
    pg.qa.hold('KeyD', true);
    pg.frames(hz, 1);
    const { player, toScreen } = pg.probe();
    return toScreen(player.x, player.y)[0] - 960 / 2; // the stage is 960 px wide
  };
  const at60 = trail(60, 0), limited = trail(60, 30), at144 = trail(144, 0);
  assert.ok(at60 > 12 && at60 < 30, 'the camera trails a walker by about 20 px at 60 Hz: ' + at60);
  assert.ok(Math.abs(limited - at60) < 3, 'a 30 FPS limit trails ' + limited + ' px against ' + at60 + ' at 60 Hz');
  assert.ok(Math.abs(at144 - at60) < 3, '144 Hz trails ' + at144 + ' px against ' + at60 + ' at 60 Hz');
  // The same grains of dust drift as far in a second at a 30 FPS limit as at 60 Hz (the wind of a clear sky is 18 px/s, and a grain adds 20 per unit of its size),
  // and sway as far up or down. The sway is a sine of the clock, so the second at 60 Hz starts 2π s after the one at 30 FPS, at the
  // same point of every grain's sway; the second at 30 FPS starts on a drawn frame, so it ends on one.
  const pg = page(m, 'minh', { gfx: { fpsCap: 30 } });
  const drift = secs => { const a = pg.probe(); pg.frames(60, secs); const b = pg.probe(); return b.dustX.map((x, i) => [x - a.dustX[i], b.dustY[i] - a.dustY[i]]); };
  pg.frames(60, 0.5);
  assert.ok(pg.frames(60, 1 / 60) || pg.frames(60, 1 / 60), 'one of any two callbacks draws');
  const d30 = drift(1);
  pg.setGfx({ fpsCap: 0 });
  pg.frames(60, 2 * Math.PI - 1);
  const d60 = drift(1);
  const both = d60.map((d, i) => [d, d30[i]]).filter(([a, b]) => a[0] > 0 && b[0] > 0); // a grain that went round the screen's edge says nothing
  assert.ok(both.length > 20, 'most of the 39 grains stay on screen for both seconds: ' + both.length);
  for (const [a, b] of both) assert.ok(Math.abs(b[0] / a[0] - 1) < 0.05, 'a grain drifts ' + b[0].toFixed(1) + ' px in a second at 30 FPS, ' + a[0].toFixed(1) + ' at 60 Hz');
  const swaying = both.filter(([a]) => Math.abs(a[1]) > 4); // at the turn of its sway a grain hardly moves up or down in a second
  assert.ok(swaying.length > 15, 'most grains sway more than 4 px in a second: ' + swaying.length);
  for (const [a, b] of swaying) assert.ok(Math.abs(b[1] / a[1] - 1) < 0.05, 'a grain sways ' + b[1].toFixed(1) + ' px in a second at 30 FPS, ' + a[1].toFixed(1) + ' at 60 Hz');
});

test('the FPS readout is hidden unless Show FPS is on; then it reads "<n> FPS", refreshed at most four times a second', () => {
  const m = mission({ seed: 'READ-1' });
  const chipOf = pg => pg.overlay.children.find(c => c.className === 'sf-fps');
  const off = page(m, 'minh');
  off.frames(60, 1);
  assert.ok(chipOf(off), 'the readout is in the surface overlay');
  assert.equal(chipOf(off).hidden, true, 'hidden with Show FPS off');
  assert.equal(chipOf(off).attrs['aria-hidden'], 'true', 'a visual readout only');
  const on = page(m, 'minh', { gfx: { showFps: true } });
  const chip = chipOf(on);
  let text = '', writes = 0;
  Object.defineProperty(chip, 'textContent', { get: () => text, set: v => { text = v; writes++; } });
  on.frames(60, 1);
  assert.equal(chip.hidden, false, 'shown with Show FPS on');
  assert.equal(text, '60 FPS');
  assert.ok(writes >= 1 && writes <= 4, 'rewritten ' + writes + ' times in a second');
  on.setGfx({ showFps: false });
  assert.equal(chip.hidden, true, 'hidden again when it is turned off');
  on.setGfx({ showFps: 1 });
  assert.equal(chip.hidden, false, 'any true value shows it');
});

// ---------- the points of interest (M4c) ----------

// The structure nearest the HQ that is not a hab pod.
function structureNear(m) {
  let s = null;
  for (let cy = -3; cy <= 2; cy++) for (let cx = -3; cx <= 2; cx++) for (const k of X.structuresIn(m, cx, cy)) {
    if (k.kind !== 'pod' && (!s || k.x * k.x + k.y * k.y < s.x * s.x + s.y * s.y)) s = k;
  }
  return s;
}

test('a Kestrel structure in view is drawn as the rules leave it: done once m.expedition.structures marks it', () => {
  const m = mission({ seed: 'POI-1' }), s = structureNear(m);
  assert.ok(s, 'a structure near the base');
  const pg = page(m, 'minh');
  pg.qa.teleport(s.x, s.y + 1); // just south of its door
  pg.step(1);
  const drawn = () => plain(pg.probe().pois).filter(i => i.art === 'kestrel' && i.x === s.box[0]).map(i => [i.id, i.opts]);
  assert.deepEqual(drawn(), [[s.kind, { done: false }]]);
  m.expedition.structures = Object.assign({}, m.expedition.structures, { [s.id]: 'used' });
  pg.show(m);
  pg.step(0.1);
  assert.deepEqual(drawn(), [[s.kind, { done: true }]]);
});

test("in a lava tube its roof hides and the dark closes in round your headlamp, from your view's radius; outside, the roof is back", () => {
  let found = null;
  for (let s = 0; s < 80 && !found; s++) for (let j = -2; j < 2 && !found; j++) for (let i = -2; i < 2 && !found; i++) {
    const l = W.landmarkAt(W.seedOf('TUBE-' + s), i, j);
    if (l && l.kind === 'tube') found = { seed: 'TUBE-' + s, l };
  }
  assert.ok(found, 'a lava tube near a base');
  const { seed, l } = found, darks = [];
  const pg = page(mission({ seed }), 'minh', { paint: { drawDark: (...a) => darks.push(a.slice(5)) } });
  const roof = () => plain(pg.probe().pois).filter(i => i.art === 'roof' && i.id === l.id).length;
  pg.qa.teleport(l.x, l.y); // the middle of its floor
  pg.step(1);
  assert.equal(pg.probe().tube, l.id);
  assert.equal(roof(), 0, 'no roof over you');
  const [px, py, rad] = darks[darks.length - 1];
  assert.deepEqual([px, py + 12, rad], [pg.probe().player.x, pg.probe().player.y, pg.probe().view * T], 'the dark round you, at your view');
  pg.qa.teleport(l.skylight[0] + (l.vert ? 1 : 0), l.skylight[1] + (l.vert ? 0 : 1)); // out through the skylight
  const before = darks.length;
  pg.step(0.5);
  assert.equal(pg.probe().tube, null);
  assert.equal(roof(), 1, 'its roof covers it again');
  assert.equal(darks.length, before, 'and the dark has gone');
});

test("the maps are given the points of interest's marks: a landmark once it is discovered, and the masts' '?' once the rules give them", () => {
  const m = mission({ seed: 'POI-2' }), seed = W.seedOf(m.seed);
  let l = null;
  for (let j = -2; j < 2 && !l; j++) for (let i = -2; i < 2 && !l; i++) l = W.landmarkAt(seed, i, j);
  assert.ok(l, 'a landmark near the base');
  const poi = pg => plain(pg.probe().marks).filter(k => k.diamond || k.text);
  const bare = page(m, 'minh'); // rules with no X.mastMarks yet
  bare.step(0.1);
  assert.deepEqual(poi(bare), [], 'nothing discovered, no masts');
  m.expedition.landmarks = { [l.id]: { by: 'minh', round: 1 } };
  bare.show(m);
  bare.step(0.1);
  assert.deepEqual(poi(bare).map(k => [k.x, k.y, k.diamond]), [[(l.x + 0.5) * T, (l.y + 0.5) * T, true]]);
  const pg = page(m, 'minh', { expedition: { mastMarks: () => [{ id: 'S5,5', x: 330, y: 340, kind: 'wreck' }] } });
  pg.step(0.1);
  assert.deepEqual(poi(pg).map(k => k.text || 'diamond'), ['diamond', '?']);
});

// ---------- relay beacons, pings and the team (M4d) ----------
test('K at the base takes a relay beacon kit that waits there into the backpack; out on the map it does nothing', async () => {
  const m = mission({ seed: 'KIT-K' });
  m.expedition.kits = 1;
  const pg = page(m, 'minh');
  pg.qa.teleport(9, 1); // outside the base zone
  pg.step(0.1);
  pg.key('KeyK');
  await flush();
  assert.deepEqual(pg.calls, [], 'out on the map: nothing asked');
  pg.qa.teleport(0, 1);
  pg.step(0.1);
  pg.key('KeyK');
  await flush();
  assert.deepEqual(pg.calls, ['takeKit']);
  assert.equal(m.expedition.kits, 0);
  assert.ok(E.isKit(m.expedition.carried.minh[0]), 'the kit is in the backpack');
});

test("E where a relay beacon cannot go opens no menu: the prompt has already said why", () => {
  const m = mission({ seed: 'KIT-E' });
  m.expedition.carried.minh = [E.kitItem()];
  const pg = page(m, 'minh');
  pg.qa.teleport(6, 9); // out of the base zone, too close to the base for a beacon
  pg.step(0.2);
  assert.equal(pg.probe().focus, 'beacon');
  pg.key('KeyE');
  pg.key('KeyE', false);
  assert.equal(pg.probe().menu, null, 'no menu');
});

const pingsOf = pg => plain(pg.probe().marks).filter(k => k.ping).map(k => [k.x, k.y, k.label]);
test('P pings where you stand: solo shows it on your own maps at once, without the network; at most one a second', () => {
  const pg = page(mission({ seed: 'PING-1' }), 'minh');
  pg.qa.teleport(6, 3);
  pg.step(0.1);
  pg.key('KeyP');
  pg.step(0.2);
  assert.deepEqual(pingsOf(pg), [[6.5 * T, 3.5 * T, 'minh']]);
  pg.key('KeyP');
  pg.step(0.2);
  assert.equal(pingsOf(pg).length, 1, 'a second press within the second: nothing');
  pg.step(1);
  pg.key('KeyP');
  pg.step(0.2);
  assert.equal(pingsOf(pg).length, 2);
});

test("co-op: P sends the ping and draws nothing itself; the server's echo (SolSurface.ping) draws it, the sender's too", () => {
  const sent = [];
  const pg = page(mission({ seed: 'PING-2', coop: true }), 'minh', { ping: (x, y) => { sent.push([x, y]); return true; } });
  pg.qa.teleport(6, 3);
  pg.step(0.1);
  pg.key('KeyP');
  pg.step(0.2);
  assert.deepEqual(sent, [[6.5 * T, 3.5 * T]]);
  assert.deepEqual(pingsOf(pg), [], 'nothing until the echo');
  pg.ping({ x: 6.5 * T, y: 3.5 * T, by: 'minh' });
  pg.ping({ x: 900, y: 40, by: 'diego' });
  pg.step(0.2);
  assert.deepEqual(pingsOf(pg), [[6.5 * T, 3.5 * T, 'minh'], [900, 40, 'diego']]);
});

test("the commander's aura speeds his walk by 10 % once he is out of the base zone; a crew of 4 has none", () => {
  const walked = (crewSize, pilot) => {
    const pg = page(mission({ seed: 'AURA-1', loadout: E.referenceKit('commander', crewSize), crewSize, pilot }), pilot);
    pg.qa.teleport(20, 38); // open ground of normal speed to the east
    pg.step(0.1);
    const x0 = pg.probe().player.x;
    pg.qa.hold('KeyD', true);
    pg.step(1);
    pg.qa.hold('KeyD', false);
    return pg.probe().player.x - x0;
  };
  const plainWalk = walked(4, 'minh'), led = walked(5, 'kai');
  assert.ok(plainWalk > 100, 'walked east: ' + plainWalk);
  assert.ok(Math.abs(led / plainWalk - D.SKILLS.commander.auraSpeed) < 0.01, 'the commander walks 10 % further: ' + led / plainWalk);
});

test("co-op: a teammate whose tab is gone counts for nobody's aura or route line, though they still stand where they left", () => {
  const pg = page(mission({ seed: 'AURA-2', loadout: E.referenceKit('commander', 5), crewSize: 5, coop: true }), 'minh');
  const kai = { crewId: 'kai', x: 30 * T, y: 4 * T, dir: 'down', moving: false, rover: false };
  pg.remote([kai]);
  pg.step(0.2);
  assert.deepEqual(plain(pg.probe().team).map(q => q.crewId), ['minh', 'kai']);
  pg.remote([Object.assign({ away: true }, kai)]);
  pg.step(0.2);
  assert.deepEqual(plain(pg.probe().team).map(q => q.crewId), ['minh'], 'away: not in the team');
  assert.deepEqual(Object.keys(pg.probe().remote), ['kai'], 'still drawn where he stood');
});

test('solo: the tiles you walk reach the rules about every 150 ms of the surface clock; a jump and a ride in the rover count for nothing', () => {
  const m = mission({ seed: 'WALK-1' }), pg = page(m, 'minh');
  const dist = () => (m.expedition.stats.minh || {}).distance || 0;
  pg.qa.teleport(20, 38); // open ground of normal speed to the east, far from the base: a jump
  pg.step(0.5);
  assert.equal(dist(), 0, 'the teleport counted for nothing');
  const x0 = pg.probe().player.x;
  pg.qa.hold('KeyD', true);
  pg.step(1);
  pg.qa.hold('KeyD', false);
  pg.step(0.5);
  const walked = (pg.probe().player.x - x0) / T;
  assert.ok(walked > 2, 'walked east: ' + walked);
  assert.ok(Math.abs(dist() - walked) < 1e-6, 'the tiles walked: ' + dist() + ' of ' + walked);
  assert.ok(pg.walks.length >= 10 && pg.walks.every(dt => dt > 0.11 && dt < 0.25), 'samples at the co-op cadence: ' + pg.walks.join());
  // the same drive in the rover: no tiles walked (it has its own odometer)
  const r = mission({ seed: 'WALK-2' });
  assert.equal(X.board(r, 'minh', X.bay(r)).ok, true);
  const pr = page(r, 'minh');
  pr.qa.teleport(20, 38);
  pr.step(0.5);
  const rx = pr.probe().player.x;
  pr.qa.hold('KeyD', true);
  pr.step(1);
  pr.qa.hold('KeyD', false);
  pr.step(0.5);
  assert.ok(pr.probe().player.inRover && pr.probe().player.x - rx > 2 * T, 'driven east: ' + (pr.probe().player.x - rx));
  assert.equal((r.expedition.stats.minh || {}).distance || 0, 0);
});

// The menu's buttons as [label, sub-label, disabled], from the last time it was drawn.
const menuButtons = pg => {
  const menu = pg.overlay.children.find(n => n.className === 'sf-menu');
  const body = menu.children.filter(n => n.className === 'sf-mbody').pop();
  return body.children.filter(n => /^sf-mbtn/.test(n.className)).map(b => {
    const txt = b.children.find(n => n.className === 'sf-mtxt');
    return [txt.children[0].textContent, txt.children[1] ? txt.children[1].textContent : '', b.disabled, b];
  });
};
test("the HQ's menu builds a relay beacon kit, as it adds a shield layer: its cost, or why not", () => {
  const m = mission({ seed: 'HQ-KIT' }), pg = page(m, 'minh');
  const hq = m.layout.find(k => k.type === 'hab');
  pg.qa.teleport(hq.x + W.BASE_RECT.x, hq.y + W.BASE_RECT.y - 0.65); // on the south edge of the module north of the HQ, facing it
  pg.step(0.2);
  assert.equal(pg.probe().focusKey, 'hq');
  pg.key('KeyE');
  pg.key('KeyE', false);
  const kit = () => menuButtons(pg).find(b => b[0] === I.t('en', 'sf.kitAdd'));
  assert.deepEqual(kit().slice(0, 3), [I.t('en', 'sf.kitAdd'), I.t('en', 'bld.cost', { kg: D.BUILDS.kit.materials, w: D.BUILDS.kit.work }), false]);
  for (const fn of kit()[3].listeners.click) fn({});
  assert.deepEqual(plain(pg.queued), [{ type: 'kit' }]);
  m.resources.materials = 10;
  pg.show(m);
  pg.key('Escape');
  pg.key('KeyE');
  pg.key('KeyE', false);
  assert.deepEqual(kit().slice(1, 3), [I.t('en', 'bld.why.materials'), true], 'too little material: why, and no button');
  m.resources.materials = 500;
  m.expedition.kits = D.EXPEDITION.beacon.max;
  pg.show(m);
  pg.key('Escape');
  pg.key('KeyE');
  pg.key('KeyE', false);
  assert.deepEqual(kit().slice(1, 3), [I.t('en', 'bld.why.maxKit', { max: D.EXPEDITION.beacon.max }), true], "all kits made: the kit's own reason");
});

test("in Vietnamese the surface's build menus write a cost's numbers as the console does: 1,5 công, not 1.5 (R31)", () => {
  const m = mission({ seed: 'HQ-KIT' }), pg = page(m, 'minh', { lang: 'vi' }), vi = (k, p) => I.t('vi', k, p);
  const hq = m.layout.find(k => k.type === 'hab');
  pg.qa.teleport(hq.x + W.BASE_RECT.x, hq.y + W.BASE_RECT.y - 0.65);
  pg.step(0.2);
  pg.key('KeyE');
  pg.key('KeyE', false);
  const sub = label => menuButtons(pg).find(b => b[0] === vi(label))[1];
  assert.equal(sub('sf.kitAdd'), vi('bld.cost', { kg: '50', w: '1,5' }), "the HQ menu's kit");
  assert.equal(sub('bld.shieldAdd'), vi('bld.cost', { kg: '100', w: '1' }), "the HQ menu's shield layer");
  pg.key('Escape');
  const [gx, gy] = E.buildSpots(m, 'battery', [])[0];
  pg.qa.teleport(gx + W.BASE_RECT.x, gy + W.BASE_RECT.y - 0.35); // in the top of an empty spot, facing down into it
  pg.step(0.2);
  assert.equal(pg.probe().focusKey, 'e:' + gx + ',' + gy);
  pg.key('KeyE');
  pg.key('KeyE', false);
  const menu = pg.overlay.children.find(n => n.className === 'sf-menu');
  const grid = menu.children.filter(n => n.className === 'sf-mbody').pop().children.find(n => n.className === 'sf-mgrid');
  const battery = grid.children.map(b => b.children.find(n => n.className === 'sf-mtxt').children).find(c => c[0].textContent === vi('mod.battery'));
  assert.equal(battery[1].textContent, vi('bld.cost', { kg: '200', w: '0,5' }), "the build grid's battery");
});

test('with a beacon kit in the pack, E at a module outside the base zone still opens it: the beacon prompt is for when nothing else is in reach', () => {
  const m = mission({ seed: 'HQ-KIT' }), pg = page(m, 'minh');
  m.expedition.carried.minh = [E.kitItem()];
  m.layout = m.layout.filter(k => !(k.x === 8 && k.y === 2)).concat([{ type: 'solar', x: 8, y: 2 }]);
  pg.show(m);
  pg.qa.teleport(8 + W.BASE_RECT.x, 2 + W.BASE_RECT.y - 0.65);
  pg.step(0.2);
  assert.equal(pg.probe().focusKey, 's:8,2');
  pg.key('KeyE');
  pg.key('KeyE', false);
  const menu = pg.overlay.children.find(n => n.className === 'sf-menu');
  assert.match(menu.children.filter(n => n.className === 'sf-mbody').pop().children.find(n => /^sf-note/.test(n.className)).textContent, /kW/, "the module's menu");
  pg.key('Escape');
  pg.qa.teleport(30, 30);
  pg.step(0.2);
  assert.match(pg.probe().focusKey, /^b:/, 'out on open ground the beacon prompt is back');
});

test("in Vietnamese the surface's menus write a build's progress and a module's power as the console does: 0,5 / 1,5 and +13,0 kW (R31)", () => {
  const m = mission({ seed: 'HQ-KIT' }), pg = page(m, 'minh', { lang: 'vi' }), vi = (k, p) => I.t('vi', k, p);
  const [gx, gy] = E.buildSpots(m, 'battery', [])[1];
  m.projects.push({ type: 'workshop', x: gx, y: gy, progress: 0.5, work: 1.5 });
  pg.show(m);
  const notes = (tx, ty, off) => { // the menu's notes, facing the tile (tx, ty) of the base grid from the north
    pg.key('Escape');
    pg.qa.teleport(tx + W.BASE_RECT.x, ty + W.BASE_RECT.y - (off || 0.65));
    pg.step(0.2);
    pg.key('KeyE');
    pg.key('KeyE', false);
    const menu = pg.overlay.children.find(n => n.className === 'sf-menu');
    return menu.children.filter(n => n.className === 'sf-mbody').pop().children.filter(n => /^sf-note/.test(n.className)).map(n => n.textContent);
  };
  assert.equal(notes(gx, gy)[0], vi('bld.progress', { p: '0,5', w: '1,5' }), 'a build in progress');
  const solar = m.layout.find(k => k.type === 'solar' && k.x === 3 && k.y === 1), reactor = m.layout.find(k => k.type === 'reactor');
  assert.match(notes(solar.x, solar.y)[0], /^\+\d+,\d kW · /, 'a solar array');
  assert.match(notes(reactor.x, reactor.y)[0], /^\+\d+,\d kW$/, 'the reactor');
  const oxygen = m.layout.find(k => k.type === 'oxygen');
  assert.match(notes(oxygen.x, oxygen.y)[0], / · 2,5 kW$/, 'a consumer: the oxygen plant');
  m.resources.materials = 1234;
  pg.show(m);
  const [ex, ey] = E.buildSpots(m, 'battery', [])[0];
  assert.equal(notes(ex, ey, 0.35).pop(), vi('hud.materials') + ': 1.234 kg', "the build grid's stock");
});

// ---------- the rover drives by the physics engine (2026-11-03): steering, the boost, climbing, a crewmate's rover ----------
const PH = require('../src/physics.js');
function inRover(seed) {
  const m = mission({ seed });
  assert.equal(X.board(m, 'minh', X.bay(m)).ok, true);
  return { m, pg: page(m, 'minh') };
}
// The west end of a run of n tiles in one row with nothing that blocks a walker and nothing rough, away from the base.
function openRow(seed, n) {
  const w = SW.create(seed), ok = (x, y) => !W.BLOCKING[w.tile(x, y)] && !w.rough(x, y);
  for (let y = 5; y < 90; y++) for (let x = 6, run = 0; x < 300; x++) { run = ok(x, y) ? run + 1 : 0; if (run === n) return [x - n + 1, y]; }
  return null;
}

test('in the rover a new direction turns it smoothly, no faster than its wheels grip, and it gathers speed gently', () => {
  const { m, pg } = inRover('DRIVE-1');
  const [x, y] = openRow(m.seed, 12);
  pg.qa.teleport(x + 6, y);
  pg.step(0.1);
  assert.equal(pg.probe().player.heading, 0, 'a new mission\'s rover faces east');
  pg.key('KeyS');
  pg.step(0.1);
  const { heading, speed } = pg.probe().player;
  assert.ok(Math.abs(heading - PH.ROVER.turn * 0.1) < 1e-9, 'turned 0.36 rad of the way south, not snapped: ' + heading);
  assert.ok(speed > 0 && speed <= PH.grip() * PH.PX_PER_M * 0.1, 'and speeds up no harder than grip allows: ' + speed);
  pg.key('KeyS', false);
});

test('Shift opens up the rover 1.6 times, and the battery counts each boosted tile twice', () => {
  const { m, pg } = inRover('DRIVE-2');
  const [x, y] = openRow(m.seed, 48);
  pg.qa.teleport(x + 1, y);
  pg.key('KeyD');
  pg.step(3);
  const window = () => { const a = pg.probe(); pg.step(0.5); const b = pg.probe(); return (b.eva.driven - a.eva.driven) / ((b.player.x - a.player.x) / T); };
  assert.ok(Math.abs(pg.probe().player.speed - 390) < 1e-6, 'its top speed: ' + pg.probe().player.speed);
  const plain = window();
  pg.key('ShiftLeft');
  pg.step(3);
  assert.ok(Math.abs(pg.probe().player.speed - 390 * 1.6) < 1e-6, 'boosted: ' + pg.probe().player.speed);
  const boosted = window();
  assert.ok(Math.abs(plain - 1) < 0.01 && Math.abs(boosted - 2) < 0.01, 'battery per tile: ' + plain + ', then ' + boosted);
});

test('the rover climbs over a boulder that stops you on foot', () => {
  const m = mission({ seed: 'DRIVE-3' }), w = SW.create(m.seed), open = (x, y) => !W.BLOCKING[w.tile(x, y)];
  let at = null;
  for (let r = 6; r < 120 && !at; r++) for (let x = -r; x <= r && !at; x++) for (const y of [-r, r]) {
    if (w.tile(x, y) === W.TILE.BOULDER && [-3, -2, -1, 1, 2, 3].every(d => open(x + d, y) && !w.rough(x + d, y))) { at = [x, y]; break; }
  }
  assert.ok(at, 'a lone boulder with open ground either side');
  const [bx, by] = at, run = pg => { pg.qa.teleport(bx - 3, by); pg.step(0.1); pg.key('KeyD'); pg.step(3); pg.key('KeyD', false); return pg.probe().player.x; };
  const walker = page(mission({ seed: 'DRIVE-3' }), 'minh');
  assert.ok(run(walker) < bx * T, 'on foot you stop at it: ' + run(walker));
  assert.equal(X.board(m, 'minh', X.bay(m)).ok, true);
  const pg = page(m, 'minh'), before = pg.probe().eva.driven;
  assert.ok(run(pg) > (bx + 1) * T, 'the rover drives over it');
  // The battery counts the tiles it drove, and the boulder's tile twice (roverDrain.rough): about a tile's worth more than the
  // road. About: the rough rate applies to whole 150 ms windows of the battery's count, so one tile counts 0.5 to 1.5 more.
  const extra = pg.probe().eva.driven - before - (pg.probe().player.x - (bx - 2.5) * T) / T;
  assert.ok(extra > 0.4 && extra < 1.6, 'over the boulder the battery counted ' + extra.toFixed(2) + ' tiles more (rough: ×' + D.EXPEDITION.roverDrain.rough + ')');
});

test("a crewmate's rover turns on your screen the way it moves, and keeps its heading standing still", () => {
  const { pg } = inRover('DRIVE-4');
  const r = (x, y, moving) => pg.remote([{ crewId: 'diego', x, y, rover: true, moving, dir: 'down' }]);
  r(640, 640, true);
  r(740, 640, true);
  assert.equal(pg.probe().remote.diego.heading, 0, 'east');
  r(740, 740, true);
  assert.equal(pg.probe().remote.diego.heading, Math.PI / 2, 'then south');
  r(740, 740, false);
  assert.equal(pg.probe().remote.diego.heading, Math.PI / 2, 'parked, it still faces south');
});

// A run of n open, smooth tiles in one row (the rows either side too) that ends at a tile the rover can't cross: [x0, y, wallX].
function rowToWall(seed, n) {
  const w = SW.create(seed), open = (x, y) => !W.BLOCKING[w.tile(x, y)] && !w.rough(x, y);
  for (let y = 8; y < 200; y++) for (let x = 8, run = 0; x < 400; x++) {
    if (open(x, y) && open(x, y - 1) && open(x, y + 1)) run++;
    else { if (run >= n && w.isBlocked(x, y, true)) return [x - run, y, x]; run = 0; }
  }
  return null;
}

test('a rover driven into a wall stops dead: no speed is left for the HUD, the crew or its turns', () => {
  const { m, pg } = inRover('WALL-1');
  const [, y, wx] = rowToWall(m.seed, 14);
  pg.qa.teleport(wx - 12, y);
  pg.step(0.2);
  pg.key('KeyD');
  pg.step(4);
  const p = pg.probe().player;
  assert.ok(p.x < wx * T, 'it stops short of the wall: ' + p.x);
  assert.equal(p.speed, 0, 'and stands still, not at ' + p.speed + ' px/s');
  pg.key('KeyD', false);
});

// The drawn rover reaches about 61 px past its middle, which is drawn 10 px above its feet (F13).
const FRONT = 61;
// A column of n open tiles, away from the base, that ends at a wall to its north: [x, wall tile row, row of the south end].
function colToWall(seed, n) {
  const w = SW.create(seed), open = (x, y) => !W.BLOCKING[w.tile(x, y)] && !w.rough(x, y);
  for (let x = 8; x < 300; x++) for (let y = 400, run = 0; y > 8; y--) {
    if (open(x, y) && open(x - 1, y) && open(x + 1, y)) run++;
    else { if (run >= n && w.isBlocked(x, y, true)) return [x, y, y + run]; run = 0; }
  }
  return null;
}
test('the nose probe stops the rover before the drawn front reaches a wall, east and north', () => {
  const { m, pg } = inRover('WALL-1');
  const [, y, wx] = rowToWall(m.seed, 14);
  pg.qa.teleport(wx - 12, y);
  pg.step(0.2);
  pg.key('KeyD');
  pg.step(4);
  let p = pg.probe().player;
  assert.ok(p.x + FRONT <= wx * T, 'east: the front is at ' + (p.x + FRONT) + ', the wall at ' + wx * T);
  pg.key('KeyD', false);
  const c = colToWall(m.seed, 14);
  assert.ok(c, 'a column ending at a wall');
  const [cx, wy, sy] = c;
  pg.qa.teleport(cx, sy - 2);
  pg.step(0.2);
  pg.key('KeyW');
  pg.step(6);
  p = pg.probe().player;
  assert.ok(p.y - 10 - FRONT >= (wy + 1) * T, 'north: the front is at ' + (p.y - 10 - FRONT) + ', the wall ends at ' + (wy + 1) * T);
  pg.key('KeyW', false);
});

test('a rover still drives north through a 1-tile gap between two rocks with the longer nose', () => {
  const w = SW.create('GAP-1'), open = (x, y) => !W.BLOCKING[w.tile(x, y)] && !w.rough(x, y) && !w.isBlocked(x, y, true);
  let gap = null;
  for (let x = 12; x < 300 && !gap; x++) for (let y = 12; y < 300; y++) {
    if (open(x, y) && w.isBlocked(x - 1, y, true) && w.isBlocked(x + 1, y, true) && [-2, -1, 1, 2].every(d => open(x, y + d))) { gap = [x, y]; break; }
  }
  assert.ok(gap, 'a 1-tile gap in this seed');
  const { pg } = inRover('GAP-1');
  pg.qa.teleport(gap[0], gap[1] + 2);
  pg.step(0.2);
  pg.key('KeyW');
  pg.step(5);
  const p = pg.probe().player;
  assert.ok(p.y < (gap[1] - 1) * T, 'through the gap (tile row ' + gap[1] + '), now at row ' + p.y / T);
  pg.key('KeyW', false);
});

test('click-to-drive to a spot by a wall ends there, not pushing at the wall for ever', () => {
  const { m, pg } = inRover('WALL-1');
  const [, y, wx] = rowToWall(m.seed, 14);
  pg.qa.teleport(wx - 10, y);
  pg.step(0.2);
  const [clientX, clientY] = pg.probe().toScreen(wx * T - 10, (y + 0.5) * T); // 10 px short of the wall: the nose stops it 40 px off
  for (const fn of pg.canvas.listeners.pointerdown) fn({ clientX, clientY, pointerId: 1 });
  pg.step(8);
  const p = pg.probe().player;
  assert.ok(!p.path, 'the route is over: ' + p.path);
  assert.equal(p.speed, 0);
});

test('click-to-drive brakes for the spot tapped: the rover stops there, at 20 or 60 fps, plain or boosted', () => {
  for (const [hz, boost] of [[20, false], [60, false], [60, true]]) {
    const { m, pg } = inRover('DRIVE-5');
    const [x, y] = openRow(m.seed, 16);
    pg.qa.teleport(x + 1, y);
    pg.frames(hz, 0.2);
    if (boost) pg.key('ShiftLeft');
    pg.tap(x + 11, y);
    pg.frames(hz, 8);
    const p = pg.probe().player, off = (p.x - (x + 11.5) * T) / T;
    assert.ok(!p.path && p.speed === 0, hz + ' fps: arrived and stopped');
    assert.ok(off <= 0.25 && off > -0.75, hz + ' fps' + (boost ? ', boosted' : '') + ': rests ' + off.toFixed(2) + ' tiles from the spot');
    if (boost) pg.key('ShiftLeft', false);
  }
});

test('a find tapped from the rover is in front of it when it stops, so E collects it', () => {
  const m = mission({ seed: 'FIND-1' }), w = SW.create(m.seed);
  const clear = (x, y) => !w.isBlocked(x, y) && !w.rough(x, y) && !w.isBlocked(x, y - 1) && !w.isBlocked(x, y + 1);
  let f = null;
  for (let cy = -3; cy <= 2 && !f; cy++) for (let cx = -3; cx <= 2 && !f; cx++) for (const g of X.findsIn(m, cx, cy)) {
    if (Math.hypot(g.x, g.y) > 14 && [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4].every(d => clear(g.x + d, g.y))) { f = g; break; }
  }
  assert.ok(f, 'a find with open ground to its west');
  assert.equal(X.board(m, 'minh', X.bay(m)).ok, true);
  const pg = page(m, 'minh');
  pg.qa.teleport(f.x - 7, f.y);
  pg.frames(60, 0.3);
  pg.tap(f.x, f.y);
  pg.frames(60, 8);
  assert.ok(pg.probe().player.x < (f.x + 0.5) * T, 'the rover stops short of it, not past it: ' + pg.probe().player.x);
  assert.equal(pg.probe().focus, 'find', 'and the find is what E acts on, not getting out');
});

test("a crewmate who boards the rover is drawn the way it was parked, not turned to where they were walking", () => {
  const { pg } = inRover('DRIVE-6');
  pg.step(0.1);
  const parked = pg.probe().player.heading;
  pg.remote([{ crewId: 'diego', x: 640, y: 600, rover: false, moving: true, dir: 'down' }]);
  pg.remote([{ crewId: 'diego', x: 640, y: 640, rover: true, moving: false, dir: 'down' }]);
  assert.equal(pg.probe().remote.diego.heading, parked, 'the rover still faces ' + parked);
});

test("the rover's dust is as thick at 30 fps as at 144: it is thrown up by the second, not by the frame", () => {
  const count = hz => {
    const { m, pg } = inRover('DRIVE-7');
    const [x, y] = openRow(m.seed, 40);
    pg.qa.teleport(x + 1, y);
    pg.frames(hz, 0.2);
    pg.key('KeyD');
    pg.frames(hz, 3);
    const n = pg.probe().roverDust;
    pg.key('KeyD', false);
    return n;
  };
  const slow = count(30), fast = count(144);
  assert.ok(slow > 20 && Math.abs(fast / slow - 1) < 0.3, '30 fps: ' + slow + ' grains, 144 fps: ' + fast);
});
