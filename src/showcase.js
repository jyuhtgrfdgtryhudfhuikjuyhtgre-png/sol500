/*
 * SOL 500 — the Showcase's cards: the 12 features the presenter shows a judge, in the spec's order (§5). Each card names the
 * real moment its Show me sets up in the demo game (a throwaway mission on CODE); ui.js builds the mission and the gallery,
 * and SolSurface.scene puts the astronaut in place. Words are show.card.<id>.name / .why in i18n.js.
 *   view: 'surface' | 'console' (the Operations tab) | 'modal' (a dialog, named by `modal`, over the Operations screen)
 *   source: the I.SOURCES key the purpose line rests on, or null when it is about the game's own rule
 *   schedule: { turn: patch } for E.createMission's schedulePatch · at: [tx, ty] tile · board · suit · clock: SolSurface.scene's
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolShowcase = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // The mission code whose points of interest QA has mapped (.superpowers/sdd/qa-tools-m4c/qa/pois-PAINT-QA-1.json).
  const CODE = 'PAINT-QA-1';
  const CARDS = [
    { id: 'flare', source: 'hazards', view: 'surface', schedule: { 0: { spe: true } }, at: [14, 4] },
    { id: 'rover', source: null, view: 'surface', at: [8, 4], board: true },
    { id: 'oxygen', source: null, view: 'surface' },
    { id: 'beacons', source: 'relayJpl', view: 'surface' },
    { id: 'ground', source: 'photoJezero', view: 'surface' },
    { id: 'landmark', source: 'wildcat', view: 'surface' },
    { id: 'tube', source: 'pitCrater', view: 'surface' },
    { id: 'devils', source: 'devilTracks', view: 'surface', schedule: { 0: { devil: true, weather: 'regional' } } },
    { id: 'isru', source: 'veggie', view: 'console' },
    { id: 'crew', source: null, view: 'surface' },
    { id: 'story', source: 'apollo11', view: 'modal', modal: 'story' },
    { id: 'guide', source: null, view: 'modal', modal: 'guide' },
  ];
  const card = id => CARDS.find(c => c.id === id);
  return { CODE, CARDS, card };
});
