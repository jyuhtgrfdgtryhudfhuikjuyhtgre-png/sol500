/*
 * SOL 500 — the Showcase's cards: the 12 features the presenter shows a judge, in the spec's order (§5). Each card names the
 * real moment its Show me sets up in the demo game (a throwaway mission on CODE); ui.js builds the mission and the gallery,
 * and SolSurface.scene puts the astronaut in place. Words are show.card.<id>.name / .why in i18n.js.
 *   view: 'surface' | 'console' (the Operations tab) | 'modal' (a dialog, named by `modal`, over the Operations screen)
 *   source: the I.SOURCES key the purpose line rests on, or null when it is about the game's own rule
 *   prepare(s, { Z, X }): runs once on the demo mission before the surface opens (Z the dangers, X the expedition rules); a throw
 *     shows show.failed · steps: [[tx, ty], ...]: the bar gets a Next button that moves the astronaut to the next one, round
 *   line(t, X) → text: a second line under the caption (X the expedition rules) · schedule: { turn: patch } for E.createMission's schedulePatch · at: [tx, ty] tile · board · suit · clock: SolSurface.scene's
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.SolShowcase = factory(root.SolData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  // The mission code whose points of interest QA has mapped (.superpowers/sdd/qa-tools-m4c/qa/pois-PAINT-QA-1.json).
  const CODE = 'PAINT-QA-1';
  // Where beacons go (tiles east of the HQ on the x axis: 13 and 24 are open ground, 11 apart, the third spot 11 further on).
  const BEACON_AT = [[13, 0], [24, 0]], BEACON_STAND = [35, 0];
  const tilePos = ([tx, ty]) => ({ x: (tx + 0.5) * D.TILE_PX, y: (ty + 0.5) * D.TILE_PX });
  // Stock three kits (a build project makes them, which takes a round), carry them out of the base zone by the rules, and place two.
  function placeBeacons(s, R) {
    const id = s.pilot, ok = r => { if (r.error) throw new Error(r.error); };
    s.expedition.kits = BEACON_AT.length + 1;
    for (let i = 0; i <= BEACON_AT.length; i++) ok(R.X.takeKit(s, id, tilePos([0, 0])));
    for (const p of BEACON_AT) ok(R.X.placeBeacon(s, id, tilePos(p)));
  }
  const CARDS = [
    // prepare starts the flare's warning at once (30 s delay + 60 s countdown ends it at 90 s); the clock at 70 leaves 20 s.
    // [28, 8] is 26 tiles from the base zone: about 11 s on foot.
    { id: 'flare', source: 'hazards', view: 'surface', schedule: { 0: { spe: true } }, at: [28, 8], clock: 70, prepare: (s, R) => { const r = R.Z.flareStart(s, 0); if (r.error) throw new Error(r.error); } },
    // [0, -4] is sand just outside the base pad and within the bay's reach (boarding asks the rules, which want you within 2 tiles).
    { id: 'rover', source: null, view: 'surface', at: [0, -4], board: true },
    // The Quick schedule's rupture, moved to the opening round; the Console shows the event with its two choices.
    { id: 'oxygen', source: null, view: 'console', schedule: { 0: { flavor: 'o2_rupture' } } },
    { id: 'beacons', source: 'relayJpl', view: 'surface', at: BEACON_STAND, prepare: placeBeacons },
    // One stop in each region, in the order of W.REGIONS: plains, dunes, craters, canyons, icy, volcanic. Each has its region's own photo
    // under the whole view and no landmark within 9 tiles (a discovery card would open mid-tour).
    { id: 'ground', source: 'photoJezero', view: 'surface', at: [34, 10], steps: [[34, 10], [402, 50], [-76, -340], [-360, 146], [184, 114], [-194, 432]] },
    // The delta at (68, 462): a few tiles south of its middle, well inside discovery range.
    { id: 'landmark', source: 'wildcat', view: 'surface', at: [68, 468] },
    // The skylight of the tube at (-176, 439): the way in.
    { id: 'tube', source: 'pitCrater', view: 'surface', at: [-182, 441] },
    // 18 tiles out (the devils keep 16 from the HQ); at 6 s a formed devil is 3.8 tiles away.
    { id: 'devils', source: 'devilTracks', view: 'surface', schedule: { 0: { devil: true, weather: 'regional' } }, at: [18, -15], clock: 6 },
    { id: 'isru', source: 'veggie', view: 'console' },
    // At the weather station's door (13, 48): the prompt shows the pilot's (the Commander's) hold, and line puts the Engineer's beside
    // it, both from the rules. The pilot is the commander, out on the map, so his aura shows too.
    { id: 'crew', source: null, view: 'surface', at: [13, 49], line: (t, X) => t('show.crew.holds', { a: X.holdSeconds('weather', 'commander'), b: X.holdSeconds('weather', 'engineer') }) },
    { id: 'story', source: 'apollo11', view: 'modal', modal: 'story' },
    { id: 'guide', source: null, view: 'modal', modal: 'guide' },
  ];
  const card = id => CARDS.find(c => c.id === id);
  return { CODE, CARDS, card };
});
