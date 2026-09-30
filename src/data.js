/*
 * SOL 500 — game constants. Numbers only; all player-facing text lives in i18n.js.
 * Sources for the real-world values are listed in i18n.js (science notes) and the README.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
    TURN_SOLS: 25,
    TURNS: 20,
    MASS_BUDGET: 30, // tonnes of landed payload

    // Radiation — Curiosity RAD surface dose-equivalent rate (Hassler et al. 2014)
    DOSE_RATE: 0.64, // mSv per sol, unshielded
    DOSE_LIMIT: 300, // mSv surface budget per astronaut (game rule)
    CRUISE_DOSE: 660, // mSv for 2 × 180-day cruises at 1.84 mSv/day (Zeitlin et al. 2013)

    // Consumables per crew member per sol (NASA BVAD; ISS-style packaged food)
    O2_PER_CREW: 0.84,
    FOOD_PER_CREW: 1.8,
    WATER_PER_CREW: 7,
    REDUCED_RATIONS: 0.75,

    SPECIALIST_BONUS: 1.5,

    HAB: { mass: 8, shielding: 0.20, powerNormal: 5, powerAusterity: 3 },
    WINTER_HEATING: 1.5, // extra kW during northern winter

    // Seasons: areocentric solar longitude (Ls)
    LS_START: 60,
    LS_PER_SOL: 0.538,
    PERIHELION_LS: 251,
    SUN_VARIATION: 0.19, // Mars sunlight varies about ±19 % over its orbit

    SHIELD_CAP: 0.75,
    BERM_MAX: 0.40,
    BERM_PER_POINT: 0.04,

    STORM_FACTOR: { clear: 1, regional: 0.5, global: 0.08 },
    DUST_PER_TURN: { clear: 0.06, regional: 0.15, global: 0.25 },
    CLEAN_PER_POINT: 0.2,
    MIN_CLEANLINESS: 0.3,
    NIGHT_LOSS_UNCOVERED: 0.5, // arrays without battery cover only help in daylight

    ITEMS: {
      solar: { mass: 0.8, max: 10, kw: 4 },
      battery: { mass: 0.6, max: 6, covers: 2 },
      reactor: { mass: 3.0, max: 2, kw: 10 },
      recycler: { mass: 1.2, max: 1, kw: 1, recovery: 0.93 },
      oxygen: { mass: 1.0, max: 3, kw: 2.5, o2PerSol: 1.8 },
      icedrill: { mass: 1.5, max: 1, kw: 3, waterPerSol: 20 },
      greenhouse: { mass: 1.5, max: 3, kw: 4, foodPerSol: 2.0, o2PerSol: 0.3, waterPerSol: 1, growTurns: 1 },
      waterwall: { mass: 2.0, max: 2, kg: 2000, shielding: 0.15 },
      lab: { mass: 1.2, max: 1, kw: 2 },
      rover: { mass: 2.0, max: 1, kw: 1 },
      spares: { mass: 0.25, max: 8 },
      food: { mass: 0.5, max: 12, kg: 500 },
      o2: { mass: 0.5, max: 8, kg: 350 },
      water: { mass: 0.5, max: 8, kg: 500 },
    },
    ITEM_ORDER: ['solar', 'battery', 'reactor', 'recycler', 'oxygen', 'icedrill', 'greenhouse',
      'waterwall', 'lab', 'rover', 'spares', 'food', 'o2', 'water'],
    ITEM_GROUPS: {
      power: ['solar', 'battery', 'reactor'],
      life: ['recycler', 'oxygen', 'icedrill', 'greenhouse'],
      shield: ['waterwall'],
      science: ['lab', 'rover', 'spares'],
      supplies: ['food', 'o2', 'water'],
    },

    MODULE_TYPES: ['hab', 'solar', 'battery', 'reactor', 'recycler', 'oxygen', 'icedrill', 'greenhouse', 'lab', 'rover'],
    CONSUMERS: ['recycler', 'oxygen', 'icedrill', 'greenhouse', 'lab', 'rover'],
    SHED_ORDER: ['lab', 'rover', 'greenhouse', 'icedrill', 'oxygen', 'recycler'],
    REPAIR_ORDER: ['hab', 'recycler', 'oxygen', 'reactor', 'battery', 'solar', 'greenhouse', 'icedrill', 'lab', 'rover'],

    BREAKDOWN: {
      hab: 0.02, solar: 0.02, battery: 0.02, reactor: 0.015, recycler: 0.035,
      oxygen: 0.035, icedrill: 0.04, greenhouse: 0.025, lab: 0.02, rover: 0.03,
    },
    MAINT_PROTECT_PER_POINT: 0.25,
    MAINT_PROTECT_MAX: 0.6,
    REPAIRS_PER_POINT: 2,
    HAB_FAULT: { o2: 50, health: 10 },

    JOBS: {
      maintenance: { outdoor: 0.1 },
      farming: { outdoor: 0 },
      construction: { outdoor: 0.3 },
      science: { outdoor: 0 },
      eva: { outdoor: 0.3 },
      rest: { outdoor: 0 },
    },
    JOB_ORDER: ['maintenance', 'farming', 'construction', 'science', 'eva', 'rest'],
    SPECIALTY: { engineer: 'maintenance', botanist: 'farming', geologist: 'eva', physician: 'science' },
    CREW: [
      { id: 'lena', role: 'engineer' },
      { id: 'minh', role: 'botanist' },
      { id: 'diego', role: 'geologist' },
      { id: 'amara', role: 'physician' },
    ],

    GREENHOUSES_PER_FARMER: 2,
    UNTENDED_YIELD: 0.4,
    SCIENCE: { lab: 10, noLab: 3, eva: 20, evaNoRover: 8, farming: 1 },
    INJURY: { eva: 0.03, construction: 0.015 },
    INJURY_HEALTH: 30,
    HEALTH: { recovery: 5, rest: 15, physician: 3, reducedRations: 4, starvation: 35, cold: 20, speWork: 10 },
    MORALE: {
      start: 80, baseline: -3, perGreenhouse: 3, greenhouseMax: 6, rest: 4, reducedRations: -8,
      austerity: -6, cold: -10, conjunction: -8, earthMessage: 10, meeting: 12, push: -5, shelter: -2, discovery: 4,
    },
    AUSTERITY_WORK: 0.85,

    SPE: { dose: 40, shelterDose: 3, shelterWork: 0.88 },
    LEAK_O2: 60,
    PERCHLORATE_WASH_WATER: 150,
    DISCOVERY: { chance: 0.35, science: 45, logScience: 10, dose: 10 },
    CONFLICT_MORALE: 40,
    CONFLICT_CHANCE: 0.5,
    MEETING_WORK: 0.9,
    PUSH_WORK: 0.8,

    CONJUNCTION_TURN: 10,
    GLOBAL_STORM_CHANCE: 0.4,
    GLOBAL_STORM_TURNS: [10, 15],
    GLOBAL_STORM_LENGTH: 3,
    REGIONAL_STORM_CHANCE: { season: 0.3, calm: 0.08 },
    EXTRA_SPE_CHANCE: 0.06,
    DUST_DEVIL_CHANCE: 0.12,
    FLAVOR_CHANCE: 0.45,
    FLAVOR_WEIGHTS: { leak: 0.35, perchlorate: 0.35, earth_message: 0.3 },

    SCORE: {
      completion: 250,
      independence: 150,
      radiation: 0.5,
      abortScience: 0.5,
      grades: [['S', 1100], ['A', 900], ['B', 700], ['C', 500]],
    },

    RECOMMENDED: {
      solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, icedrill: 0, greenhouse: 1,
      waterwall: 1, lab: 1, rover: 0, spares: 4, food: 6, o2: 3, water: 3,
    },
  };
});
