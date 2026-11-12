'use strict';
// The Showcase's cards (src/showcase.js): who comes first, and that each one has its words and a real source.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/showcase.js');
const I = require('../src/i18n.js');

test('the code is the one QA mapped, and there are 17 cards, the first three rover (the physics engine, the brief\'s one mandatory item), flare, oxygen', () => {
  assert.equal(C.CODE, 'PAINT-QA-1');
  assert.equal(C.CARDS.length, 17);
  assert.deepEqual(C.CARDS.slice(0, 3).map(c => c.id), ['rover', 'flare', 'oxygen']);
  assert.ok(I.SOURCES[C.card('rover').source], 'the physics card cites its gravity');
  assert.equal(new Set(C.CARDS.map(c => c.id)).size, 17);
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
    seed: C.CODE, loadout: E.referenceKit(sc.difficulty, sc.crewSize, !c.full), difficulty: sc.difficulty, crewSize: sc.crewSize, events: false,
    pilot: D.CREW.find(x => x.role === 'commander').id, quick: !c.full, schedulePatch: c.schedule,
  });
  if (c.prepare) c.prepare(s, { E, Z, X });
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
    for (const p of stands(c)) assert.ok(standable(s, p) && tileAt(s, p) !== W.TILE.BASE, c.id + ' ' + p + ' is open ground, not a wall and not the base pad');
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

const inView = (s, [tx, ty], r, fn) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) fn(tx + x, ty + y); };

test("each ground stop paints its own region's photo under the view, not another region's", () => {
  const P = require('../src/surface-paint.js'), PHOTO = ['flagstone', 'sand', 'cobbles', 'dust', 'phoenix', 'grains']; // REGION_PHOTO in src/surface-paint.js
  const { c, s } = demo('ground'), view = D.DANGERS.view.clear;
  c.steps.forEach(p => {
    const reg = W.regionAt(W.seedOf(s.seed), p[0], p[1]);
    let n = 0, own = 0;
    inView(s, p, view, (x, y) => {
      const k = W.CHUNK, cx = Math.floor(x / k), cy = Math.floor(y / k), ch = X.chunkAt(s, cx, cy), r = W.regionOf(ch, x - cx * k, y - cy * k);
      n++;
      if (r === reg && P.photoOf(W.tileOf(ch, x - cx * k, y - cy * k), r) === PHOTO[reg]) own++;
    });
    assert.ok(own / n >= 0.9, 'stop ' + p + ' (' + W.REGIONS[reg] + '): ' + own + ' of ' + n + ' tiles show its photo');
  });
});

test('no stop has a landmark in view whose discovery card would open mid-scene, except the two scenes about a landmark', () => {
  for (const c of C.CARDS.filter(k => k.view === 'surface' && !['landmark', 'tube'].includes(k.id))) {
    const { s } = demo(c.id);
    for (const p of stands(c)) {
      const cx = Math.floor(p[0] / W.CHUNK), cy = Math.floor(p[1] / W.CHUNK);
      for (let j = cy - 2; j <= cy + 2; j++) for (let i = cx - 2; i <= cx + 2; i++) for (const l of X.chunkAt(s, i, j).landmarks) {
        assert.ok(Math.hypot(l.x - p[0], l.y - p[1]) > D.DANGERS.view.clear + 1, c.id + ' ' + p + ' sees ' + l.id);
      }
    }
  }
});

test("the crew card puts the Commander's and the Engineer's seconds for the same hold side by side, read from the rules", () => {
  const card = C.card('crew');
  for (const lang of ['en', 'vi']) {
    const a = X.holdSeconds('weather', 'commander'), b = X.holdSeconds('weather', 'engineer');
    assert.notEqual(a, b);
    const line = card.line((k, p) => I.t(lang, k, p), X);
    assert.ok(line.includes(String(a)) && line.includes(String(b)), lang + ': ' + line);
    assert.ok(I.STR[lang]['show.crew.holds']);
  }
});

// ---- M6 T9: the ranks, Fabricator and launch cards, then the pressurised rover's and the scout drone's ----
const M6IDS = ['ranks', 'fabricator', 'launch', 'cabin', 'drone'];
const gridOf = ([tx, ty]) => [tx - W.BASE_RECT.x, ty - W.BASE_RECT.y];

test('the M6 cards come after the 12 M5 cards, are Full missions, and the M5 cards stay Quick', () => {
  assert.deepEqual(C.CARDS.slice(12).map(c => c.id), M6IDS);
  for (const c of C.CARDS.slice(0, 12)) assert.ok(!c.full, c.id + ' stays Quick');
  for (const id of M6IDS) { const { c, s } = demo(id); assert.equal(c.full, true); assert.notEqual(s.quick, true, id); }
  assert.equal(demo('flare').s.quick, true);
});

test('the M6 cards name a source or none, and their purpose lines are in both languages', () => {
  assert.equal(C.card('fabricator').source, 'm6Printing');
  assert.equal(C.card('launch').source, 'm6Samples');
  for (const id of M6IDS) for (const lang of ['en', 'vi']) for (const part of ['name', 'why']) assert.ok(I.STR[lang]['show.card.' + id + '.' + part], lang + id + part);
});

test('a rank scene stands inside a Station base, not on the old pad edge', () => {
  const { c, s } = demo('ranks'), [gx, gy] = gridOf(c.at);
  assert.equal(E.rankOf(s), 2);
  assert.ok(E.onLand(s, gx, gy), 'on the Station land');
  assert.ok(!E.onLand({ rank: 0 }, gx, gy), 'off the Camp land');
  assert.ok(!E.onLand({ rank: 0 }, gx, gy - 1) && !E.onLand({ rank: 0 }, gx, gy + 1) && !E.onLand({ rank: 0 }, gx - 1, gy) && !E.onLand({ rank: 0 }, gx + 1, gy), 'not on its edge either');
  assert.ok(s.layout.length > 1, 'the bigger land is built on');
  for (const b of s.layout) assert.ok(E.onLand(s, b.x, b.y));
  for (const lang of ['en', 'vi']) {
    const line = c.line((k, p) => I.t(lang, k, p), X);
    assert.ok(line.includes(I.t(lang, 'rank.station')), lang + ' ' + line);
  }
});

test('the Fabricator scene is a Station with a working Fabricator and gear already bought, and its rows can still be built', () => {
  const { c, s } = demo('fabricator');
  assert.equal(c.view, 'console');
  assert.equal(E.rankOf(s), 2);
  assert.ok(E.activeCount(s, 'fabricator') >= 1);
  assert.ok(Object.values(s.gear).some(v => v > 0));
  assert.ok(Object.keys(D.GEAR).some(l => E.canBuild(s, l).ok), 'a row can be queued');
});

test('the launch scene is a Colony with a working launch pad and the launch ready to queue', () => {
  const { c, s } = demo('launch');
  assert.equal(c.view, 'console');
  assert.equal(E.rankOf(s), 3);
  assert.ok(E.activeCount(s, 'launchpad') >= 1);
  assert.deepEqual(E.canBuild(s, 'launch'), { ok: true });
});

test('a card whose tier is off is not in the gallery, and comes back with it', () => {
  const ids = () => C.gallery().map(c => c.id);
  assert.deepEqual(ids(), C.CARDS.map(c => c.id));
  for (const [tier, id] of [['gear', 'fabricator'], ['colony', 'launch'], ['cabin', 'cabin'], ['drone', 'drone']]) {
    D.M6[tier] = false;
    try { assert.ok(!ids().includes(id), id + ' hidden'); assert.ok(ids().includes('ranks')); } finally { D.M6[tier] = true; }
    assert.ok(ids().includes(id));
  }
});

// ---- M6 T9 part 2: the pressurised rover's card and the scout drone's ----
const words = id => ['en', 'vi'].map(lang => I.STR[lang]['show.card.' + id + '.why'] || '');

test('the cabin card rests on the Moon rover source, and its words never call that rover a Mars rover', () => {
  const c = C.card('cabin'), [en, vi] = words('cabin');
  assert.deepEqual([c.tier, c.source, c.view, c.board], ['cabin', 'm6Pressurized', 'surface', 'cabin']);
  assert.ok(I.SOURCES[c.source]);
  for (const lang of ['en', 'vi']) assert.ok(I.STR[lang]['show.card.cabin.name'], lang + ' name');
  assert.ok(/Japan/.test(en) && /Moon/.test(en) && /In the game/.test(en), en);
  assert.ok(!/Mars/.test(en) && !/sao Hỏa/.test(vi), 'the source is a Moon rover (ruling R8)');
  assert.ok(/xe thám hiểm điều áp/.test(vi) && /Mặt Trăng/.test(vi) && /Trong game/.test(vi), vi);
});

test('the cabin scene is an Outpost with a working Garage and pressurised rover, parked outside the base zone where the scene boards it', () => {
  const { c, s } = demo('cabin'), at = px(c.at);
  assert.ok(E.rankOf(s) >= 1, 'an Outpost or higher');
  assert.ok(E.activeCount(s, 'garage') >= 1 && E.activeCount(s, 'cabin') >= 1);
  assert.ok(X.bay(s, 'cabin'), 'it has a bay');
  assert.deepEqual(s.expedition.cabin, at, 'parked where the scene stands, in the shape the rules park it');
  assert.equal(X.inBaseZone(s, at, D.EXPEDITION.reach), false, 'outside the base zone, slack and all');
  assert.equal(X.left(s, 'cabin'), D.EXPEDITION.cabin.range, 'with a full battery');
  assert.equal(X.board(s, s.pilot, at, 'cabin').ok, true, 'within boarding reach');
  // The suit doesn't drain at the wheel: the seat's drain is 0 (the surface test steps time through the scene). The server
  // no longer holds a driver's level (R22: their reports go through, as a rover driver's do), so that is not asserted here.
  assert.equal(D.EXPEDITION.cabin.drain, 0);
});

test('the drone card rests on Ingenuity, and its words give NASA no line about dust storms or seasons', () => {
  const c = C.card('drone'), [en, vi] = words('drone');
  assert.deepEqual([c.tier, c.source, c.view, c.board], ['drone', 'm6Ingenuity', 'surface', undefined]);
  assert.ok(I.SOURCES[c.source]);
  for (const lang of ['en', 'vi']) assert.ok(I.STR[lang]['show.card.drone.name'], lang + ' name');
  assert.ok(/Ingenuity/.test(en) && /72/.test(en) && /aerial scout/.test(en) && /In the game/.test(en), en);
  assert.ok(/Ingenuity/.test(vi) && /72/.test(vi) && /Trong game/.test(vi) && /căn cứ/.test(vi) && /xe thám hiểm/.test(vi), vi);
  assert.ok(!/storm|dust|season|ground(ed|s)/i.test(en) && !/bão|bụi|mùa/i.test(vi), 'the storm rule names no source (sources.md)');
});

test('the drone scene can fly: on foot inside an Outpost base with a working Garage and drone, no storm, every flight left, fog in range', () => {
  const { c, s } = demo('drone'), at = px(c.at);
  assert.ok(E.rankOf(s) >= 1, 'an Outpost or higher');
  assert.ok(E.activeCount(s, 'garage') >= 1 && E.activeCount(s, 'drone') >= 1);
  assert.notEqual(s.schedule[s.turn].weather, 'global', 'no global dust storm');
  assert.equal(X.inBaseZone(s, at), true, 'inside the base zone');
  assert.equal(X.vehicleOf(s, s.pilot), null, 'on foot');
  assert.deepEqual(X.canFly(s, s.pilot, at), { ok: true, left: D.DRONE.flights });
  assert.ok(!c.board && !c.modal, 'the scene opens no card of its own: the first flight opens Ingenuity’s');
  // Fog all round: a flight to the edge of its range maps new ground.
  const r = X.fly(s, s.pilot, at, c.at[0] + D.DRONE.range - 1, c.at[1]);
  assert.equal(r.ok, true);
  assert.ok(Object.keys(r.fog).length > 0, 'new ground mapped');
  assert.equal(X.canFly(s, s.pilot, at).left, D.DRONE.flights - 1);
});
