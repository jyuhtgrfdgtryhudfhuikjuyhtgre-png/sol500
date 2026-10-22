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
// `opts.dpr` is the screen's pixel ratio (1); `opts.gfx` the Display settings the page passes to update (setGfx changes them);
// `opts.paint` replaces SolPaint functions (to see what is drawn), `opts.expedition` SolExpedition ones (rules not written yet).
function page(m, me, opts) {
  const o = opts || {};
  let raf = null, clock = 0, cur = m, gfx = o.gfx, wobble = 7;
  const on = {}, sent = [], calls = [];
  const { painter, seen } = stubPainter(() => clock);
  const win = {
    SolData: D, SolEngine: E, SolWorldgen: W, SolExpedition: Object.assign({}, X, o.expedition), SolDangers: Z, SolWorld: SW,
    SolPaint: Object.assign({}, P, o.paint, { createPainter: (world, popts) => { seen.scale = (popts && popts.scale) || 1; return painter; } }),
    document: { createElement: element, createTextNode: text => ({ text }), querySelector: () => null, hidden: false },
    location: { search: '?debug=chunks' }, performance: { now: () => clock }, devicePixelRatio: o.dpr || 1, Image: function () {},
    matchMedia: () => ({ matches: false }),
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
      mission: shown, plan, forecast: E.forecast(shown, plan), controlId: me, canControl: () => true, crewName: id => id, t: (k, p) => I.t('en', k, p), lang: 'en', fog: null,
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
  };
  const root = S.mount(hooks), canvas = root.children[0];
  show(m);
  return {
    sent, calls, show, qa: S.qa, probe: () => S.probe(), reset: () => S.reset(), remote: list => S.setRemote(list),
    canvas, overlay: root.children[1], seen, setGfx(g) { gfx = g; show(cur); },
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
