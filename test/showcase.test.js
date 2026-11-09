'use strict';
// The Showcase's cards (src/showcase.js): who comes first, and that each one has its words and a real source.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/showcase.js');
const I = require('../src/i18n.js');

test('the code is the one QA mapped, and there are 12 cards, the first three flare, rover, oxygen', () => {
  assert.equal(C.CODE, 'PAINT-QA-1');
  assert.equal(C.CARDS.length, 12);
  assert.deepEqual(C.CARDS.slice(0, 3).map(c => c.id), ['flare', 'rover', 'oxygen']);
  assert.equal(new Set(C.CARDS.map(c => c.id)).size, 12);
});

test('every card has a name and a purpose in both languages', () => {
  for (const lang of ['en', 'vi']) for (const c of C.CARDS) for (const part of ['name', 'why']) {
    const k = 'show.card.' + c.id + '.' + part;
    assert.ok(I.STR[lang][k], lang + ' ' + k);
    assert.notEqual(I.t(lang, k), k);
  }
  for (const c of C.CARDS) assert.notEqual(I.STR.vi['show.card.' + c.id + '.why'], I.STR.en['show.card.' + c.id + '.why'], c.id + ' is translated');
});

test('a card that names a source names one in I.SOURCES, and a card has a view the game can open', () => {
  for (const c of C.CARDS) {
    assert.ok(c.source === null || I.SOURCES[c.source], c.id + ' source');
    assert.ok(['surface', 'console', 'modal'].includes(c.view), c.id + ' view');
    if (c.view === 'modal') assert.ok(c.modal, c.id + ' names its modal');
  }
});

test('card(id) finds a card, and nothing for an id that is not one', () => {
  assert.equal(C.card('rover').id, 'rover');
  assert.equal(C.card('nope'), undefined);
});

// ---- the scenes: each one is checked against the real world and rules of the Showcase's code ----
const D = require('../src/data.js');
const E = require('../src/engine.js');
const W = require('../src/worldgen.js');
const X = require('../src/expedition.js');
const Z = require('../src/dangers.js');

const T = 64;
const px = ([tx, ty]) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });
// The demo mission exactly as ui.js showScene builds it (same options, then the card's prepare), without the DOM.
function demo(id) {
  const c = C.card(id), sc = D.SHOWCASE;
  const s = E.createMission({
    seed: C.CODE, loadout: E.referenceKit(sc.difficulty, sc.crewSize, true), difficulty: sc.difficulty, crewSize: sc.crewSize, events: false,
    pilot: D.CREW.find(x => x.role === 'commander').id, quick: true, schedulePatch: c.schedule,
  });
  if (c.prepare) c.prepare(s, { Z, X });
  return { c, s };
}
const tileAt = (s, [tx, ty]) => {
  const k = W.CHUNK, cx = Math.floor(tx / k), cy = Math.floor(ty / k);
  return W.tileOf(X.chunkAt(s, cx, cy), tx - cx * k, ty - cy * k);
};
const standable = (s, p) => !W.BLOCKING[tileAt(s, p)] && tileAt(s, p) !== W.TILE.STRUCT_FLOOR;
const stands = c => (c.steps || [c.at]).filter(Boolean);
const WALK = 150; // px a second on foot (src/surface.js SPEED)

test('every surface scene stands on open ground in the Showcase code', () => {
  for (const c of C.CARDS.filter(k => k.view === 'surface')) {
    const { s } = demo(c.id);
    assert.ok(c.at, c.id + ' has a place to stand');
    for (const p of stands(c)) assert.ok(standable(s, p), c.id + ' ' + p + ' is not a wall');
  }
});

test('the flare scene starts within reach of a shelter and leaves 20 s at most', () => {
  const { c, s } = demo('flare'), f = s.expedition.flare;
  assert.ok(f, 'the warning is already running');
  const left = f.end - c.clock;
  assert.ok(c.clock >= f.warn, 'the flare is announced');
  assert.ok(left > 0 && left <= 20, 'time left ' + left);
  assert.equal(Z.shelterAt(s, px(c.at), 0), null, 'it starts in the open');
  // Walk the straight line home and count the distance to the first cover.
  const [x0, y0] = c.at, n = Math.ceil(Math.hypot(x0, y0));
  let d = null;
  for (let i = 0; i <= n && d === null; i++) if (Z.shelterAt(s, px([Math.round(x0 * (1 - i / n)), Math.round(y0 * (1 - i / n))]), 0)) d = i;
  assert.ok(d !== null && d * T / WALK < left, 'cover ' + d + ' tiles away is reached within ' + left + ' s');
  assert.ok(d * T / WALK > left / 4, 'and it is not next door');
});

test('the landmark scene stands within discovery range of an undiscovered landmark', () => {
  const { c, s } = demo('landmark'), cx = Math.floor(c.at[0] / W.CHUNK), cy = Math.floor(c.at[1] / W.CHUNK);
  const ls = [];
  for (let j = cy - 2; j <= cy + 2; j++) for (let i = cx - 2; i <= cx + 2; i++) ls.push(...X.chunkAt(s, i, j).landmarks);
  const found = [...new Map(ls.filter(l => Math.hypot(l.x - c.at[0], l.y - c.at[1]) < 12).map(l => [l.id, l])).values()]; // a chunk lists every landmark its box touches
  assert.equal(found.length, 1, 'one landmark is near');
  const l = found[0];
  assert.equal(I.LANDMARK_SOURCES[l.kind], c.source, 'the card cites the source of this kind of landmark');
  assert.ok(!s.expedition.landmarks[l.id], 'undiscovered');
  assert.equal(X.discover(s, s.pilot, l.id, px(c.at)).ok, true);
});

test('the tube scene stands at a lava tube mouth', () => {
  const { c, s } = demo('tube');
  assert.equal(tileAt(s, c.at), W.TILE.SKYLIGHT, 'on the skylight, the way in');
  assert.equal(Z.shelterAt(s, px(c.at), 0), 'tube');
  assert.equal(I.LANDMARK_SOURCES.tube, c.source);
});

test('the oxygen scene opens with the o2_rupture event and its two options', () => {
  const { c, s } = demo('oxygen');
  assert.equal(c.view, 'console');
  const e = s.events.find(x => x.type === 'o2_rupture');
  assert.deepEqual(e.options, ['hide', 'salvage']);
  for (const o of e.options) for (const lang of ['en', 'vi']) assert.ok(I.STR[lang]['ev.o2_rupture.' + o], lang + ' ' + o);
});

test('the rover scene loadout holds the rover, and it can be boarded where the scene stands', () => {
  const { c, s } = demo('rover');
  assert.ok(s.modules.rover.count >= 1);
  assert.equal(c.board, true);
  assert.equal(X.board(s, s.pilot, px(c.at)).ok, true);
});

test('the beacons scene has beacons placed by the rules, a kit in the pack and a legal spot to stand', () => {
  const { c, s } = demo('beacons'), x = s.expedition;
  assert.ok(x.beacons.length >= 2, 'beacons stand');
  assert.equal(X.routeHome(s).length, x.beacons.length, 'the route home shows every link');
  assert.ok(x.carried[s.pilot].some(E.isKit), 'a kit in the backpack');
  assert.equal(X.beaconSpot(s, s.pilot, px(c.at)).ok, true);
});

test('the ground scene steps through six tiles, one in each region', () => {
  const { c, s } = demo('ground');
  assert.equal(c.steps.length, 6);
  assert.deepEqual(c.at, c.steps[0]);
  assert.deepEqual(c.steps.map(p => W.regionAt(W.seedOf(s.seed), p[0], p[1])).sort(), [0, 1, 2, 3, 4, 5]);
});

test('the devils scene is a dust-devil round in a storm with a formed devil in sight and none on top of you', () => {
  const { c, s } = demo('devils'), r = s.schedule[s.turn], p = px(c.at);
  assert.ok(r.devil && r.weather === 'regional');
  assert.ok(Math.hypot(c.at[0], c.at[1]) > D.DANGERS.devils.clear, 'beyond the calm round the base');
  const view = Z.viewTiles(s, false) * T;
  const seen = Z.devils(s, p.x - view, p.y - view, p.x + view, p.y + view, c.clock).filter(d => d.a >= 0.5);
  assert.ok(seen.length >= 1, 'a devil is in view');
  assert.equal(Z.devilHit(s, p, c.clock), null);
});

test('the crew scene stands at a structure the rules let you work, where the Engineer would be quicker', () => {
  const { c, s } = demo('crew'), K = D.STRUCTURES.kinds.weather;
  assert.ok(K.engineer < K.hold);
  assert.equal(X.interact(s, s.pilot, 'S0,0', px(c.at)).ok, true);
});

test('a purpose line is one or two plain sentences in both languages', () => {
  for (const lang of ['en', 'vi']) for (const c of C.CARDS) {
    const why = I.STR[lang]['show.card.' + c.id + '.why'];
    assert.ok((why.match(/[.!?](\s|$)/g) || []).length <= 2, lang + ' ' + c.id + ' is at most two sentences');
  }
  for (const c of C.CARDS) assert.ok(!/xe tự hành|trạm tiếp sóng|\bbase\b/.test(I.STR.vi['show.card.' + c.id + '.why']), c.id + ' uses the agreed Vietnamese terms');
});

test('the rover stops in more room on Mars than on Earth, so the readout the rover card promises has something to say', () => {
  const PH = require('../src/physics.js');
  assert.ok(PH.stopDistance(300) > PH.stopDistance(300, PH.EARTH_G));
});
