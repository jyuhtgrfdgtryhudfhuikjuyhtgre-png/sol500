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
    MASS_BUDGET: 30, // tonnes of landed payload (commander difficulty)

    DIFFICULTY: {
      cadet: { budget: 32, breakdown: 1.0, globalStorm: 0.3, flavor: 0.4, drops: 4 },
      commander: { budget: 30, breakdown: 1.8, globalStorm: 0.5, flavor: 0.5, drops: 3 },
      veteran: { budget: 28, breakdown: 2.3, globalStorm: 0.7, flavor: 0.6, drops: 2 },
    },
    DEFAULT_DIFFICULTY: 'commander',

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

    STORM_FACTOR: { clear: 1, regional: 0.5, global: 0.08 },
    DUST_PER_TURN: { clear: 0.06, regional: 0.15, global: 0.25 },
    CLEAN_PER_POINT: 0.2,
    MIN_CLEANLINESS: 0.3,
    NIGHT_LOSS_UNCOVERED: 0.5, // arrays without battery cover only help in daylight

    // Payload manifest (delivered by the lander)
    ITEMS: {
      solar: { mass: 0.8, max: 10 },
      battery: { mass: 0.6, max: 6 },
      reactor: { mass: 3.0, max: 2 },
      recycler: { mass: 1.2, max: 1 },
      oxygen: { mass: 1.0, max: 3 },
      icedrill: { mass: 1.5, max: 1 },
      greenhouse: { mass: 1.5, max: 3 },
      waterwall: { mass: 2.0, max: 2, kg: 2000, shielding: 0.15 },
      lab: { mass: 1.2, max: 1 },
      rover: { mass: 2.0, max: 1 },
      spares: { mass: 0.25, max: 8 },
      materials: { mass: 0.5, max: 10, kg: 500 },
      food: { mass: 0.5, max: 12, kg: 500 },
      o2: { mass: 0.5, max: 8, kg: 350 },
      water: { mass: 0.5, max: 8, kg: 500 },
    },
    ITEM_ORDER: ['solar', 'battery', 'reactor', 'recycler', 'oxygen', 'icedrill', 'greenhouse',
      'waterwall', 'lab', 'rover', 'spares', 'materials', 'food', 'o2', 'water'],
    ITEM_GROUPS: {
      power: ['solar', 'battery', 'reactor'],
      life: ['recycler', 'oxygen', 'icedrill', 'greenhouse'],
      shield: ['waterwall'],
      science: ['lab', 'rover', 'spares', 'materials'],
      supplies: ['food', 'o2', 'water'],
    },

    // Every structure that can exist at the outpost
    MODULES: {
      hab: { kw: 0, max: 1 },
      solar: { kw: 0, gen: 4, max: 12 },
      battery: { kw: 0, covers: 2, max: 8 },
      reactor: { kw: 0, gen: 10, max: 2 },
      recycler: { kw: 1, recovery: 0.93, max: 1 },
      oxygen: { kw: 2.5, o2PerSol: 1.8, max: 3 },
      icedrill: { kw: 3, waterPerSol: 20, max: 3 },
      greenhouse: { kw: 4, foodPerSol: 2.0, o2PerSol: 0.3, waterPerSol: 1, growTurns: 1, max: 4 },
      lab: { kw: 2, max: 1 },
      rover: { kw: 1, max: 1 },
      habitat: { kw: 1.5, morale: 2, health: 3, max: 2 },
      medbay: { kw: 1, heal: 3, max: 1 },
      workshop: { kw: 1, max: 1 },
      comms: { kw: 0.5, max: 1 },
      shelter: { kw: 0, max: 1 },
      shield: { kw: 0, shielding: 0.05, max: 8 },
    },
    MODULE_TYPES: ['hab', 'solar', 'battery', 'reactor', 'recycler', 'oxygen', 'icedrill', 'greenhouse',
      'lab', 'rover', 'habitat', 'medbay', 'workshop', 'comms', 'shelter', 'shield'],
    CONSUMERS: ['recycler', 'oxygen', 'icedrill', 'greenhouse', 'lab', 'rover', 'habitat', 'medbay', 'workshop', 'comms'],
    SHED_ORDER: ['lab', 'rover', 'comms', 'workshop', 'habitat', 'medbay', 'greenhouse', 'icedrill', 'oxygen', 'recycler'],
    REPAIR_ORDER: ['hab', 'recycler', 'oxygen', 'reactor', 'battery', 'solar', 'greenhouse', 'icedrill',
      'medbay', 'habitat', 'workshop', 'comms', 'lab', 'rover'],
    PLACED: ['solar', 'battery', 'reactor', 'recycler', 'oxygen', 'icedrill', 'greenhouse', 'lab', 'rover',
      'habitat', 'medbay', 'workshop', 'comms', 'shelter'],

    // Structures the crew can build on Mars (materials in kg, work in construction points)
    BUILDS: {
      solar: { materials: 250, work: 1 },
      battery: { materials: 200, work: 0.5 },
      greenhouse: { materials: 400, work: 2 },
      oxygen: { materials: 350, work: 2 },
      recycler: { materials: 400, work: 2 },
      icedrill: { materials: 400, work: 2 },
      shield: { materials: 100, work: 1 },
      habitat: { materials: 600, work: 3 },
      medbay: { materials: 400, work: 2 },
      workshop: { materials: 300, work: 1.5 },
      lab: { materials: 500, work: 2 },
      comms: { materials: 300, work: 1 },
      shelter: { materials: 300, work: 1.5 },
      kit: { materials: 50, work: 1.5 }, // a relay beacon kit (spec §3.8): no tile, it waits at the base (expedition.kits)
    },
    BUILD_ORDER: ['shield', 'solar', 'battery', 'greenhouse', 'oxygen', 'recycler', 'icedrill',
      'habitat', 'medbay', 'workshop', 'shelter', 'comms', 'lab'],
    REGOLITH_PER_POINT: 100, // kg of materials from leftover construction work
    REPAIR_MATERIALS: 100, // kg per repair when there are no spare kits

    GRID: { w: 9, h: 5, hq: [4, 2], ice: 3, rock: 4 },

    BREAKDOWN: {
      hab: 0.02, solar: 0.02, battery: 0.02, reactor: 0.015, recycler: 0.035, oxygen: 0.035,
      icedrill: 0.04, greenhouse: 0.025, lab: 0.02, rover: 0.03, habitat: 0.01, medbay: 0.015,
      workshop: 0.015, comms: 0.015, shelter: 0, shield: 0,
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
      medical: { outdoor: 0 },
    },
    JOB_ORDER: ['maintenance', 'construction', 'farming', 'science', 'eva', 'medical'],
    OUTDOOR_JOBS: ['maintenance', 'construction', 'eva'],
    SPECIALTY: {
      engineer: ['maintenance', 'construction'],
      biologist: ['farming'],
      scientist: ['science', 'eva'],
      medic: ['medical'],
      commander: [],
    },
    DEFAULT_JOB: { engineer: 'maintenance', biologist: 'farming', scientist: 'eva', medic: 'medical', commander: 'construction' },
    CREW: [
      { id: 'lena', role: 'engineer' },
      { id: 'minh', role: 'biologist' },
      { id: 'diego', role: 'scientist' },
      { id: 'amara', role: 'medic' },
      { id: 'kai', role: 'commander' },
    ],
    CREW_SIZES: [4, 5],
    DEFAULT_CREW: 4,
    CREW5_BUDGET: 2, // a five-person crew flies a heavier lander
    CREW5_EXTRA: { food: 2, o2: 1 }, // added to the reference kit for a fifth astronaut
    LEADERSHIP: { work: 1.1, morale: 3 },

    GREENHOUSES_PER_FARMER: 2,
    UNTENDED_YIELD: 0.4,
    SCIENCE: { lab: 10, noLab: 3, eva: 20, evaNoRover: 8, farming: 1 },
    INJURY: { eva: 0.03, construction: 0.015 },
    INJURY_HEALTH: 30,
    HEALTH: {
      recovery: 5, rest: 15, care: 6, medic: 3, reducedRations: 4, starvation: 35,
      cold: 20, speWork: 10, hypoxia: 50, dehydration: 40,
    },
    REVIVE: { window: 5, health: 40, maxRevives: 1 },
    MORALE: {
      start: 80, baseline: -3, perGreenhouse: 3, greenhouseMax: 6, rest: 4, reducedRations: -8,
      austerity: -6, cold: -10, conjunction: -8, earthMessage: 10, meeting: 12, push: -5, shelter: -2,
      discovery: 4, hide: -4, down: -6, death: -20, drop: 3,
    },
    AUSTERITY_WORK: 0.85,

    SPE: { dose: 40, shelterDose: 3, shelterWork: 0.88, shelterBuiltDose: 1, shelterBuiltWork: 0.96 },
    PERCHLORATE_WASH_WATER: 150,
    WATER_LEAK: 300,
    O2_RUPTURE: { hideLoss: 80, hideWork: 0.6, salvageLoss: 150, salvageGain: 300, salvageDose: 12, salvageInjury: 0.2 },
    DISCOVERY: { chance: 0.35, scientistChance: 0.5, science: 45, logScience: 10, dose: 10 },
    CONFLICT_MORALE: 40,
    CONFLICT_CHANCE: 0.5,
    MEETING_WORK: 0.9,
    PUSH_WORK: 0.8,

    // Orbital supply depot (Earth support)
    DEPOT: {
      drops: 3,
      leadTurns: 2,
      commsLeadTurns: 1,
      amounts: { food: 400, water: 600, materials: 500 },
      delayChance: 0.25,
    },

    CONJUNCTION_TURN: 10,
    GLOBAL_STORM_CHANCE: 0.4,
    GLOBAL_STORM_TURNS: [10, 15],
    GLOBAL_STORM_LENGTH: 3,
    REGIONAL_STORM_CHANCE: { season: 0.3, calm: 0.08 },
    EXTRA_SPE_CHANCE: 0.06,
    DUST_DEVIL_CHANCE: 0.12,
    FLAVOR_CHANCE: 0.5,
    FLAVOR_WEIGHTS: { o2_rupture: 0.2, water_leak: 0.25, perchlorate: 0.2, earth_message: 0.15, discovery: 0.2 },

    SCORE: {
      completion: 250,
      independence: 150,
      radiation: 0.75,
      survivor: 50,
      grounded: 250, // career over: flight surgeons retire an astronaut who passes the budget
      overDose: 2, // extra points lost per mSv above the budget
      unusedDrop: 25,
      abortScience: 0.5,
      grades: [['S', 1400], ['A', 1200], ['B', 1000], ['C', 800]],
    },

    // Exploring (spec §3). Seconds are real time on the surface; distances are world tiles (the HQ is tile 0, 0).
    EXPEDITION: {
      suit: 150,                // a full suit: seconds outside the base zone, per crew member per round
      drain: { sprint: 2, rover: 0.5, icy: 1.1 }, // drain factors: sprinting, driving the rover, the cold Icy Plains
      baseZone: 2,              // tiles around the HQ either way: the suit pauses here and finds are delivered here
      reach: 1.5,               // tiles of slack on every action checked against a position
      pack: 3, packRover: 8,    // loads you can carry on foot and in the rover
      hold: { load: 3, survey: 5, pickup: 3, revive: 4 }, // seconds of holding E
      canister: { suit: 45, o2: 30 }, // an O₂ canister: +45 s of suit now, or +30 kg of base O₂ if carried home
      reviveSuit: 30,           // a revived crew member stands up with this much suit
      collapse: { health: 20, morale: 3 }, // an empty suit outside: lost at the next advance
      roverHome: 6,             // a rover left within this many tiles of the HQ goes back to its bay
      roverRange: 400,          // tiles the rover's battery drives per round (it recharges overnight)
      maxDrops: 40,             // dropped loads kept in the mission (the oldest go first)
      // Relay beacons (spec §3.8): seconds of holding E to place one; tiles it stands at least from the HQ and from another
      // beacon; the most a mission places; tiles from it that refill a suit (once a round each) and that it reveals. A kit
      // is built like a module (BUILDS.kit) and takes one backpack slot.
      beacon: { hold: 4, base: 12, apart: 10, max: 6, refill: 2, reveal: 12 },
    },
    // Dangers outside (spec §3.4, M4b). Seconds run on the round's clock: your surface's real time in solo play (it stops
    // while the console is open, like the suit), the server's clock in co-op. Distances are world tiles.
    DANGERS: {
      flare: { delay: 30, countdown: 60, dose: 15 }, // the warning comes 30 s after the first step outside; 60 s to take cover
      shelter: 0.9,             // tiles from the middle of a cave's mouth, or of the storm shelter's tile, that count as cover
      view: { clear: 8, rover: 10, regional: 5, global: 3, crest: 4 }, // tiles you can see around you; dust storms shrink it, a star dune's crest adds `crest`
      devils: {
        quiet: [0, 1], round: [3, 5], dunes: 2, // devils a chunk in most rounds and in a dust-devil round; the Dune Sea doubles both
        life: 24, fade: 2, track: [6, 12], // a devil lasts 24 s (2 s to form, 2 to die down) and drifts 6–12 tiles in a line
        radius: 0.55, push: 2, suit: 10, // a hit: within 0.55 tiles, it throws you 2 tiles and costs 10 s of suit
        calm: 2,                  // seconds after a hit before the next one can land
        clear: 16,                // tiles round the HQ where no devil goes
      },
    },
    // What one load of each find gives (spec §3.1). Arrays run inner, middle, outer, far (worldgen RINGS).
    FINDS: {
      ice: { loads: [3, 4, 5, 6], res: 'water', kg: 40 },
      metal: { loads: [3, 4, 4, 5], res: 'materials', kg: 40 },
      pod: { loads: [3, 3, 3, 3], food: 60 },   // each load: a spare kit, 60 kg of food or an O₂ canister
      science: { loads: [1, 1, 1, 1], science: [20, 35, 60, 80], craters: 1.5 },
    },
    // Points of interest (spec §3.6, §3.7, M4c). src/worldgen.js places them from these numbers. Distances are world
    // tiles, `regions` are worldgen REGIONS names, and `fact` (lm.<id>, fm.<id>) and `log` (ks.<id>) are i18n.js keys.
    // Landmarks: one per 256×256 cell with a 60 % chance; the footprint (at most 40×40) never comes within 60 tiles of
    // the HQ. Its kind is picked from the kinds of the region at its centre, all equally likely. Discovering one banks
    // 80–150 science (the Scientist gets +50 %). `sites` are the finds it holds: the delta's three rich surveys, the ice
    // and rare metal inside a lava tube, the giant crater's floor ice and peak survey, the vent's survey, the scarp's ice.
    LANDMARKS: {
      cell: 256, chance: 0.6, clear: 60, size: 40, science: [80, 150],
      kinds: {
        delta: { regions: ['plains', 'craters'], sites: ['science', 'science', 'science'], fact: 'lm.delta' },
        tube: { regions: ['volcanic'], sites: ['ice', 'metal'], fact: 'lm.tube' },
        crater: { regions: ['craters'], radius: 10, sites: ['ice', 'ice', 'science'], fact: 'lm.crater' },
        methane: { regions: ['canyons', 'plains'], sites: ['science'], fact: 'lm.methane' },
        scarp: { regions: ['icy'], sites: ['ice', 'ice', 'ice', 'ice'], fact: 'lm.scarp' },
        stardune: { regions: ['dunes'], sites: [], fact: 'lm.stardune' },
      },
    },
    // Kestrel Survey structures (fictional): one per 64×64 cell with a chance by region, at least 20 tiles from the HQ,
    // `size` tiles wide and deep. `hold` is the seconds of holding E (the Engineer's own in `engineer`); the pod has
    // none, you walk in. Rewards: a cache's loads, a wreck's metal loads and spare kit, the weather station's fog reveal
    // (tiles), science and forecast rounds, the mast's marks (tiles), the array's loads. A pod refills a suit once a round
    // for each crew member, as a relay beacon does (src/expedition.js, refill).
    STRUCTURES: {
      cell: 64, clear: 20,
      chance: { plains: 0.45, dunes: 0.25, craters: 0.35, canyons: 0.3, icy: 0.35, volcanic: 0.3 },
      kinds: {
        cache: { size: [2, 2], hold: 3, loads: [1, 2], log: 'ks.cache' },
        wreck: { size: [3, 2], hold: 6, engineer: 3, metal: [2, 3], spares: 1, log: 'ks.wreck' },
        weather: { size: [2, 2], hold: 6, engineer: 3, reveal: 24, science: 20, forecast: 3, log: 'ks.weather' },
        mast: { size: [2, 2], hold: 6, engineer: 3, marks: 96, log: 'ks.mast' },
        pod: { size: [5, 5], log: 'ks.pod' },
        array: { size: [4, 2], hold: 5, materials: 2, log: 'ks.array' },
      },
    },
    // Natural formations: scenery with real geology, scattered per chunk in the regions listed: a chunk holds one with
    // `chance`. About 1 in 3 is also a science site. `size` is the side of its square in tiles (art draws each sprite
    // that wide); none of them blocks, and the dust-devil tracks are a flat mark on the ground.
    FORMATIONS: {
      chance: 0.75, science: 1 / 3,
      kinds: {
        arch: { regions: ['canyons', 'craters'], size: 3, fact: 'fm.arch' },
        yardang: { regions: ['plains', 'volcanic'], size: 3, fact: 'fm.yardang' },
        hoodoo: { regions: ['canyons'], size: 2, fact: 'fm.hoodoo' },
        balanced: { regions: ['plains', 'craters', 'icy'], size: 2, fact: 'fm.balanced' },
        ventifact: { regions: ['plains', 'dunes', 'volcanic'], size: 2, fact: 'fm.ventifact' },
        layered: { regions: ['canyons', 'craters'], size: 3, fact: 'fm.layered' },
        deviltracks: { regions: ['plains', 'dunes', 'icy'], size: 3, fact: 'fm.deviltracks' },
      },
    },
    // Decor (spec §3.7): props scattered by each chunk's seed, `props` darts a chunk. Scenery only: nothing blocks or is
    // picked up. 4–6 kinds per region: the painter's own decor (src/surface-paint.js) and `rock`, a small rock standing up.
    DECOR: {
      props: 12,
      kinds: {
        plains: ['pebbles', 'pit', 'blotch', 'crack', 'rock'],
        dunes: ['ripple', 'blotch', 'pebbles', 'pit'],
        craters: ['pit', 'pebbles', 'blotch', 'crack', 'rock'],
        canyons: ['strata', 'pebbles', 'blotch', 'crack', 'rock'],
        icy: ['crack', 'frost', 'blotch', 'pit', 'pebbles'],
        volcanic: ['vesicles', 'pebbles', 'blotch', 'crack', 'rock'],
      },
    },
    // Role skills on the map (spec §3.3): factors on how long you hold E, and the scientist's extra science.
    SKILLS: {
      scientist: { science: 0.5, scienceBonus: 1.5 },
      engineer: { metal: 0.5, pod: 0.5 },
      biologist: { ice: 0.5, sight: 16 },
      medic: { revive: 0.5 },
    },

    ACHIEVEMENTS: ['first_sol', 'sol500', 'full_crew', 'revived', 'storm_survivor', 'closed_loop',
      'green_thumb', 'lead_apron', 'builder', 'fortress', 'scrapper', 'self_reliant', 'explorer',
      'grade_s', 'lightweight', 'flare_dodger', 'oxygen_hero', 'team_player'],

    RECOMMENDED: {
      solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, icedrill: 0, greenhouse: 1,
      waterwall: 1, lab: 1, rover: 0, spares: 3, materials: 1, food: 6, o2: 3, water: 3,
    },
    REFERENCE_KITS: {
      cadet: {
        solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, icedrill: 0, greenhouse: 1,
        waterwall: 1, lab: 1, rover: 0, spares: 4, materials: 2, food: 7, o2: 3, water: 3,
      },
      commander: {
        solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, icedrill: 0, greenhouse: 1,
        waterwall: 1, lab: 1, rover: 0, spares: 3, materials: 1, food: 6, o2: 3, water: 3,
      },
      veteran: {
        solar: 4, battery: 2, reactor: 1, recycler: 1, oxygen: 1, icedrill: 0, greenhouse: 1,
        waterwall: 1, lab: 0, rover: 0, spares: 3, materials: 1, food: 6, o2: 2, water: 3,
      },
    },
  };
});
