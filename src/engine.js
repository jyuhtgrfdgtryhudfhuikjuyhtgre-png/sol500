/*
 * SOL 500 — pure simulation engine (no DOM). Works as a browser global (SolEngine) and a Node module.
 *
 * Mission state (plain JSON):
 *   { seed, eventsOn, turn, sol, status: 'active'|'success'|'aborted', abortCause,
 *     loadout, modules: { type: { count, broken } }, crops: [age...],
 *     resources: { o2, water, food, spares }, wallWater, berm, cleanliness, morale,
 *     crew: [{ id, role, health, dose, harm }], science, totals, schedule, events, pending, history }
 *
 * Plan (the player's decisions for one turn):
 *   { jobs: { crewId: job }, modulesOn: { type: bool }, rations: 'full'|'reduced',
 *     habMode: 'normal'|'austerity', choices: { eventType: option }, drainWall: kg }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.SolEngine = factory(root.SolData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  // ---------- helpers ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

  function hashString(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }

  // Independent random streams per (seed, purpose, turn) keep the event schedule
  // identical for everyone who plays the same mission code, whatever they decide.
  function rng(...parts) {
    let a = hashString(parts.join('|'));
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickWeighted(r, weights) {
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let x = r() * total;
    for (const k of keys) {
      x -= weights[k];
      if (x <= 0) return k;
    }
    return keys[keys.length - 1];
  }

  function newMissionCode(random) {
    const r = random || Math.random;
    const words = ['ARES', 'JEZERO', 'GALE', 'THARSIS', 'HELLAS', 'ELYSIUM', 'UTOPIA', 'ACIDALIA'];
    return words[Math.floor(r() * words.length)] + '-' + String(Math.floor(r() * 9000) + 1000);
  }

  // ---------- seasons ----------
  function seasonAt(sol) {
    const ls = (D.LS_START + sol * D.LS_PER_SOL) % 360;
    return {
      ls,
      solarFactor: 1 + D.SUN_VARIATION * Math.cos(((ls - D.PERIHELION_LS) * Math.PI) / 180),
      dustSeason: ls >= 180,
      winter: ls >= 270,
    };
  }

  // ---------- loadout ----------
  function normalizeLoadout(loadout) {
    const L = {};
    for (const id of D.ITEM_ORDER) L[id] = Math.max(0, Math.floor(Number((loadout || {})[id]) || 0));
    return L;
  }

  function loadoutMass(loadout) {
    const L = normalizeLoadout(loadout);
    let mass = D.HAB.mass;
    for (const id of D.ITEM_ORDER) mass += L[id] * D.ITEMS[id].mass;
    return Math.round(mass * 1000) / 1000;
  }

  function validateLoadout(loadout) {
    const L = normalizeLoadout(loadout);
    const errors = [];
    for (const id of D.ITEM_ORDER) if (L[id] > D.ITEMS[id].max) errors.push('too_many:' + id);
    const mass = loadoutMass(L);
    if (mass > D.MASS_BUDGET + 1e-9) errors.push('over_budget');
    return { ok: errors.length === 0, errors, mass };
  }

  // ---------- event schedule ----------
  function buildSchedule(seed, eventsOn) {
    const turns = [];
    for (let t = 0; t < D.TURNS; t++) {
      turns.push({ weather: 'clear', spe: false, devil: false, flavor: null, conjunction: t === D.CONJUNCTION_TURN });
    }
    if (!eventsOn) return turns;
    const r = rng(seed, 'schedule');
    if (r() < D.GLOBAL_STORM_CHANCE) {
      const [lo, hi] = D.GLOBAL_STORM_TURNS;
      const start = lo + Math.floor(r() * (hi - lo + 1));
      for (let k = 0; k < D.GLOBAL_STORM_LENGTH && start + k < D.TURNS; k++) turns[start + k].weather = 'global';
    }
    turns[3 + Math.floor(r() * 15)].spe = true; // at least one solar particle event
    for (let t = 1; t < D.TURNS; t++) {
      const season = seasonAt(t * D.TURN_SOLS);
      const pStorm = season.dustSeason ? D.REGIONAL_STORM_CHANCE.season : D.REGIONAL_STORM_CHANCE.calm;
      if (r() < pStorm && turns[t].weather === 'clear') turns[t].weather = 'regional';
      if (r() < D.EXTRA_SPE_CHANCE) turns[t].spe = true;
      if (r() < D.DUST_DEVIL_CHANCE && turns[t].weather === 'clear') turns[t].devil = true;
      if (r() < D.FLAVOR_CHANCE && t >= 2) turns[t].flavor = pickWeighted(r, D.FLAVOR_WEIGHTS);
    }
    return turns;
  }

  // ---------- mission ----------
  function buildState(loadout, seed, eventsOn) {
    const L = normalizeLoadout(loadout);
    const modules = { hab: { count: 1, broken: 0 } };
    for (const type of D.MODULE_TYPES) if (type !== 'hab') modules[type] = { count: L[type], broken: 0 };
    return {
      version: 1,
      seed: String(seed),
      eventsOn: !!eventsOn,
      turn: 0,
      sol: 0,
      status: 'active',
      abortCause: null,
      loadout: L,
      modules,
      crops: new Array(L.greenhouse).fill(0),
      resources: {
        o2: L.o2 * D.ITEMS.o2.kg,
        water: L.water * D.ITEMS.water.kg,
        food: L.food * D.ITEMS.food.kg,
        spares: L.spares,
      },
      wallWater: L.waterwall * D.ITEMS.waterwall.kg,
      berm: 0,
      cleanliness: 1,
      morale: D.MORALE.start,
      crew: D.CREW.map(c => ({ id: c.id, role: c.role, health: 100, dose: 0, harm: null })),
      science: 0,
      totals: { o2Used: 0, o2Local: 0, waterUsed: 0, waterLocal: 0, foodUsed: 0, foodLocal: 0 },
      schedule: buildSchedule(String(seed), !!eventsOn),
      events: [],
      pending: { discovery: false, injuries: [], breakdowns: [] },
      history: [],
      log: [],
    };
  }

  function createMission(opts) {
    const o = opts || {};
    const v = validateLoadout(o.loadout);
    if (!v.ok) throw new Error('Invalid loadout: ' + v.errors.join(', '));
    const s = buildState(o.loadout, o.seed || newMissionCode(), o.events !== false);
    beginTurn(s);
    s.history.push(snapshot(s, null));
    return s;
  }

  function shielding(s) {
    const wallCap = s.loadout.waterwall * D.ITEMS.waterwall.kg;
    const wall = wallCap > 0 ? D.ITEMS.waterwall.shielding * s.loadout.waterwall * (s.wallWater / wallCap) : 0;
    return clamp(D.HAB.shielding + wall + s.berm, 0, D.SHIELD_CAP);
  }

  function activeCount(s, type) {
    const m = s.modules[type];
    return m ? Math.max(0, m.count - m.broken) : 0;
  }

  function defaultPlan(s) {
    const jobs = {};
    for (const c of s.crew) {
      let job = D.SPECIALTY[c.role];
      if (job === 'farming' && s.modules.greenhouse.count === 0) job = 'maintenance';
      jobs[c.id] = job;
    }
    const modulesOn = {};
    for (const type of D.CONSUMERS) modulesOn[type] = true;
    const choices = {};
    for (const e of s.events || []) if (e.options) choices[e.type] = e.options[0];
    return { jobs, modulesOn, rations: 'full', habMode: 'normal', choices, drainWall: 0 };
  }

  // ---------- turn start: reveal events ----------
  function beginTurn(s) {
    const info = s.schedule[s.turn];
    const ev = [];
    if (s.turn === 0) ev.push({ type: 'landing' });
    if (s.turn > 0) {
      const now = seasonAt(s.sol);
      const before = seasonAt(s.sol - D.TURN_SOLS);
      if (now.dustSeason && !before.dustSeason) ev.push({ type: 'dust_season' });
      if (now.winter && !before.winter) ev.push({ type: 'winter' });
    }
    for (const b of s.pending.breakdowns) ev.push({ type: 'breakdown', module: b });
    for (const id of s.pending.injuries) ev.push({ type: 'injury', crewId: id });
    if (info.weather === 'global') {
      const first = s.turn === 0 || s.schedule[s.turn - 1].weather !== 'global';
      ev.push({ type: 'dust_global', first });
    } else if (info.weather === 'regional') {
      ev.push({ type: 'dust_regional' });
    }
    if (info.devil) {
      ev.push({ type: 'dust_devil' });
      s.cleanliness = 1;
    }
    if (info.conjunction) {
      ev.push({ type: 'conjunction' });
      s.morale = clamp(s.morale + D.MORALE.conjunction, 0, 100);
    }
    if (info.spe) ev.push({ type: 'spe', options: ['shelter', 'work'] });
    if (info.flavor) {
      let f = info.flavor;
      if (f === 'perchlorate' && s.modules.greenhouse.count === 0) f = 'earth_message';
      if (f === 'leak') ev.push({ type: 'leak', options: ['patch', 'ignore'] });
      else if (f === 'perchlorate') ev.push({ type: 'perchlorate', options: ['wash', 'hydro'] });
      else {
        ev.push({ type: 'earth_message' });
        s.morale = clamp(s.morale + D.MORALE.earthMessage, 0, 100);
      }
    }
    if (s.pending.discovery) ev.push({ type: 'discovery', options: ['traverse', 'log'] });
    if (s.eventsOn && s.turn > 0 && s.morale < D.CONFLICT_MORALE && rng(s.seed, 'conflict', s.turn)() < D.CONFLICT_CHANCE) {
      ev.push({ type: 'conflict', options: ['meeting', 'push'] });
    }
    s.pending = { discovery: false, injuries: [], breakdowns: [] };
    s.events = ev;
  }

  function resolveChoices(s, plan) {
    const out = { spe: null, leak: null, perchlorate: null, discovery: null, conflict: null };
    for (const e of s.events || []) {
      if (!e.options) continue;
      const wanted = (plan.choices || {})[e.type];
      out[e.type] = e.options.includes(wanted) ? wanted : e.options[0];
    }
    if (out.leak === 'patch' && s.resources.spares < 1) out.leak = 'ignore';
    if (out.perchlorate === 'wash' && s.resources.water < D.PERCHLORATE_WASH_WATER) out.perchlorate = 'hydro';
    return out;
  }

  // ---------- power ----------
  function computePower(s, plan, weather, season) {
    const stormFactor = D.STORM_FACTOR[weather] || 1;
    const solarN = activeCount(s, 'solar');
    const covered = Math.min(solarN, activeCount(s, 'battery') * D.ITEMS.battery.covers);
    const perArray = D.ITEMS.solar.kw * season.solarFactor * stormFactor * s.cleanliness;
    const solarKw = perArray * (covered + D.NIGHT_LOSS_UNCOVERED * (solarN - covered));
    const reactorKw = activeCount(s, 'reactor') * D.ITEMS.reactor.kw;
    const supply = solarKw + reactorKw;
    const habKw = (plan.habMode === 'austerity' ? D.HAB.powerAusterity : D.HAB.powerNormal) +
      (season.winter ? D.WINTER_HEATING : 0);

    const running = {}, requested = {}, shed = {};
    let demand = habKw;
    for (const type of D.CONSUMERS) {
      const on = (plan.modulesOn || {})[type] !== false;
      const n = on ? activeCount(s, type) : 0;
      running[type] = n;
      requested[type] = n;
      shed[type] = 0;
      demand += n * D.ITEMS[type].kw;
    }
    let load = demand;
    for (const type of D.SHED_ORDER) {
      while (load > supply + 1e-9 && running[type] > 0) {
        running[type]--;
        shed[type]++;
        load -= D.ITEMS[type].kw;
      }
    }
    return {
      supply, solarKw, reactorKw, habKw, demand, load, running, requested, shed,
      habShort: supply + 1e-9 < habKw,
      margin: supply - load,
      stormFactor, solarFactor: season.solarFactor, cleanliness: s.cleanliness,
      solarN, covered,
    };
  }

  // ---------- one turn ----------
  function simulate(state, plan, random) {
    if (state.status !== 'active') throw new Error('The mission is over.');
    const s = clone(state);
    const T = D.TURN_SOLS;
    const n = s.crew.length;
    const info = s.schedule[s.turn];
    const weather = info.weather;
    const season = seasonAt(s.sol);
    const ch = resolveChoices(s, plan);
    const start = { o2: s.resources.o2, water: s.resources.water, food: s.resources.food, spares: s.resources.spares, wall: s.wallWater };
    const report = {
      turn: s.turn, sol: s.sol, weather, season, choices: ch, repairs: [], warnings: [],
      production: {}, consumption: {}, delta: {}, crew: [], power: null, science: 0,
    };

    // Work capacity
    let workFactor = s.morale < 20 ? 0.6 : s.morale < 40 ? 0.8 : 1;
    if (plan.habMode === 'austerity') workFactor *= D.AUSTERITY_WORK;
    if (ch.spe === 'shelter') workFactor *= D.SPE.shelterWork;
    if (ch.conflict === 'meeting') workFactor *= D.MEETING_WORK;
    if (ch.conflict === 'push') workFactor *= D.PUSH_WORK;
    const pts = { maintenance: 0, farming: 0, construction: 0, science: 0, eva: 0, rest: 0 };
    const jobOf = {};
    for (const c of s.crew) {
      let job = (plan.jobs || {})[c.id];
      if (!D.JOBS[job]) job = 'rest';
      jobOf[c.id] = job;
      const spec = D.SPECIALTY[c.role] === job ? D.SPECIALIST_BONUS : 1;
      const fit = c.health < 30 ? 0.5 : 1;
      pts[job] += spec * fit * workFactor;
    }
    report.workFactor = workFactor;
    report.points = pts;

    // Event costs paid up front
    if (ch.leak === 'patch') s.resources.spares -= 1;

    // Scrap modules for spare parts (someone has to be on maintenance to strip them)
    const scrapped = [];
    if (pts.maintenance > 0) {
      for (const type of plan.scrap || []) {
        const m = s.modules[type];
        if (!m || type === 'hab' || m.count <= 0) continue;
        m.count--;
        if (m.broken > 0) m.broken--;
        if (type === 'greenhouse') s.crops.sort((a, b) => b - a).pop();
        s.resources.spares++;
        scrapped.push(type);
      }
    }
    report.scrapped = scrapped;

    // Repairs: maintenance crew + spare kits
    let capacity = Math.floor(pts.maintenance * D.REPAIRS_PER_POINT + 1e-9);
    for (const type of D.REPAIR_ORDER) {
      const m = s.modules[type];
      while (m && m.broken > 0 && capacity > 0 && s.resources.spares > 0) {
        m.broken--;
        s.resources.spares--;
        capacity--;
        report.repairs.push(type);
      }
    }
    report.unrepaired = D.REPAIR_ORDER.filter(t => s.modules[t] && s.modules[t].broken > 0);

    // Player drains the water wall
    const drain = clamp(Number(plan.drainWall) || 0, 0, s.wallWater);
    s.wallWater -= drain;
    s.resources.water += drain;
    report.drained = drain;

    // Power
    const power = computePower(s, plan, weather, season);
    report.power = power;
    const run = power.running;
    const habFault = s.modules.hab.broken > 0;

    // Greenhouses: oldest crops keep the power first
    s.crops.sort((a, b) => b - a);
    const ghRun = run.greenhouse;
    let harvesting = 0;
    for (let i = 0; i < ghRun; i++) if (s.crops[i] >= D.ITEMS.greenhouse.growTurns) harvesting++;
    const tended = Math.min(harvesting, pts.farming * D.GREENHOUSES_PER_FARMER);
    let ghFood = D.ITEMS.greenhouse.foodPerSol * T * (tended + D.UNTENDED_YIELD * (harvesting - tended));
    if (ch.perchlorate === 'hydro') ghFood = 0;
    const cropsLost = s.crops.some((age, i) => i >= ghRun && age > 0);
    for (let i = 0; i < s.crops.length; i++) s.crops[i] = i < ghRun ? s.crops[i] + 1 : 0;
    const ghO2 = ghRun * D.ITEMS.greenhouse.o2PerSol * T;
    const ghWater = ghRun * D.ITEMS.greenhouse.waterPerSol * T;
    report.greenhouse = { running: ghRun, harvesting, tended, cropsLost };

    // Oxygen
    const o2Need = D.O2_PER_CREW * n * T;
    const o2Plant = run.oxygen * D.ITEMS.oxygen.o2PerSol * T;
    const o2Loss = (ch.leak === 'ignore' ? D.LEAK_O2 : 0) + (habFault ? D.HAB_FAULT.o2 : 0);
    s.resources.o2 += o2Plant + ghO2 - o2Need - o2Loss;

    // Water
    const waterGross = D.WATER_PER_CREW * n * T;
    const recovered = run.recycler > 0 ? waterGross * D.ITEMS.recycler.recovery : 0;
    const iceWater = run.icedrill * D.ITEMS.icedrill.waterPerSol * T;
    const washWater = ch.perchlorate === 'wash' ? D.PERCHLORATE_WASH_WATER : 0;
    s.resources.water += iceWater + recovered - waterGross - ghWater - washWater;
    let autoDrained = 0;
    if (s.resources.water < 0 && s.wallWater > 0) {
      autoDrained = Math.min(-s.resources.water, s.wallWater);
      s.wallWater -= autoDrained;
      s.resources.water += autoDrained;
    }
    report.autoDrained = autoDrained;

    // Food
    const rationF = plan.rations === 'reduced' ? D.REDUCED_RATIONS : 1;
    const foodNeed = D.FOOD_PER_CREW * n * T * rationF;
    const foodAvail = s.resources.food + ghFood;
    const foodEaten = Math.min(foodNeed, foodAvail);
    const fed = foodNeed > 0 ? foodEaten / foodNeed : 1;
    s.resources.food = foodAvail - foodEaten;

    report.production = { o2: o2Plant + ghO2, water: recovered + iceWater, food: ghFood, o2Plant, ghO2, recovered, iceWater };
    report.consumption = { o2: o2Need + o2Loss, water: waterGross + ghWater + washWater, food: foodNeed, o2Loss, waterGross, ghWater, washWater };

    // Crew: radiation, health
    const S = shielding(s);
    report.shielding = S;
    const physician = s.crew.find(c => c.role === 'physician');
    const physicianActive = physician && physician.health > 50;
    let traverseCrew = [];
    if (ch.discovery === 'traverse') {
      const geo = s.crew.find(c => c.role === 'geologist');
      const partner = s.crew.filter(c => c !== geo).sort((a, b) => a.dose - b.dose)[0];
      traverseCrew = [geo.id, partner.id];
    }
    let restCount = 0;
    for (const c of s.crew) {
      const job = jobOf[c.id];
      if (job === 'rest') restCount++;
      const outdoor = D.JOBS[job].outdoor;
      const exposure = outdoor + (1 - outdoor) * (1 - S);
      let dose = T * D.DOSE_RATE * exposure;
      if (ch.spe === 'shelter') dose += D.SPE.shelterDose;
      if (ch.spe === 'work') dose += D.SPE.dose * exposure;
      if (traverseCrew.includes(c.id)) dose += D.DISCOVERY.dose;

      let dh = 0;
      const harms = [];
      if (fed >= 1 && !power.habShort) dh += D.HEALTH.recovery;
      if (job === 'rest') dh += D.HEALTH.rest;
      if (physicianActive) dh += D.HEALTH.physician;
      if (rationF < 1) { dh -= D.HEALTH.reducedRations; harms.push(['rations', D.HEALTH.reducedRations]); }
      if (fed < 1) { const x = D.HEALTH.starvation * (1 - fed); dh -= x; harms.push(['starvation', x]); }
      if (power.habShort) { dh -= D.HEALTH.cold; harms.push(['cold', D.HEALTH.cold]); }
      if (habFault) { dh -= D.HAB_FAULT.health; harms.push(['habFault', D.HAB_FAULT.health]); }
      if (ch.spe === 'work') { dh -= D.HEALTH.speWork; harms.push(['radiationSickness', D.HEALTH.speWork]); }

      c.dose += dose;
      c.health = clamp(c.health + dh, 0, 100);
      if (harms.length) c.harm = harms.sort((a, b) => b[1] - a[1])[0][0];
      report.crew.push({ id: c.id, job, doseDelta: dose, healthDelta: dh, dose: c.dose, health: c.health, exposure });
    }

    // Morale
    let dm = D.MORALE.baseline;
    dm += Math.min(D.MORALE.greenhouseMax, D.MORALE.perGreenhouse * harvesting);
    dm += D.MORALE.rest * restCount;
    if (rationF < 1) dm += D.MORALE.reducedRations;
    if (plan.habMode === 'austerity') dm += D.MORALE.austerity;
    if (power.habShort) dm += D.MORALE.cold;
    if (ch.conflict === 'meeting') dm += D.MORALE.meeting;
    if (ch.conflict === 'push') dm += D.MORALE.push;
    if (ch.spe === 'shelter') dm += D.MORALE.shelter;
    if (ch.discovery === 'traverse') dm += D.MORALE.discovery;
    s.morale = clamp(s.morale + dm, 0, 100);
    report.moraleDelta = dm;

    // Science
    const sci = pts.science * (run.lab > 0 ? D.SCIENCE.lab : D.SCIENCE.noLab) +
      pts.eva * (run.rover > 0 ? D.SCIENCE.eva : D.SCIENCE.evaNoRover) +
      pts.farming * D.SCIENCE.farming +
      (ch.discovery === 'traverse' ? D.DISCOVERY.science : ch.discovery === 'log' ? D.DISCOVERY.logScience : 0);
    s.science += sci;
    report.science = sci;

    // Construction and dust
    const bermBefore = s.berm;
    s.berm = Math.min(D.BERM_MAX, s.berm + pts.construction * D.BERM_PER_POINT);
    report.bermDelta = s.berm - bermBefore;
    const cleanBefore = s.cleanliness;
    s.cleanliness = clamp(s.cleanliness - (D.DUST_PER_TURN[weather] || 0) + pts.maintenance * D.CLEAN_PER_POINT, D.MIN_CLEANLINESS, 1);
    report.cleanDelta = s.cleanliness - cleanBefore;

    // Earth-independence bookkeeping
    s.totals.o2Used += o2Need;
    s.totals.o2Local += o2Plant + ghO2;
    s.totals.waterUsed += waterGross + ghWater;
    s.totals.waterLocal += recovered + iceWater;
    s.totals.foodUsed += foodEaten;
    s.totals.foodLocal += Math.min(ghFood, foodEaten);

    report.delta = {
      o2: s.resources.o2 - start.o2,
      water: s.resources.water - start.water,
      food: s.resources.food - start.food,
      spares: s.resources.spares - start.spares,
      wall: s.wallWater - start.wall,
      morale: dm,
    };
    report.after = { o2: s.resources.o2, water: s.resources.water, food: s.resources.food, spares: s.resources.spares, wall: s.wallWater, morale: s.morale, berm: s.berm, cleanliness: s.cleanliness };
    report.fed = fed;
    report.runway = runway(s, report);
    report.warnings = warnings(s, report);

    // Random outcomes (only when resolving a real turn with events on)
    const injuries = [], breakdowns = [];
    if (random && s.eventsOn) {
      const r = rng(s.seed, 'ops', s.turn);
      for (const c of s.crew) {
        const p = D.INJURY[jobOf[c.id]] || 0;
        if (p > 0 && r() < p) {
          c.health = clamp(c.health - D.INJURY_HEALTH, 0, 100);
          c.harm = 'injury';
          injuries.push(c.id);
        }
      }
      const protect = Math.min(D.MAINT_PROTECT_MAX, pts.maintenance * D.MAINT_PROTECT_PER_POINT);
      for (const type of D.MODULE_TYPES) {
        const working = activeCount(s, type);
        for (let i = 0; i < working; i++) {
          if (r() < D.BREAKDOWN[type] * (1 - protect)) {
            s.modules[type].broken++;
            breakdowns.push(type);
          }
        }
      }
      s.pending.discovery = pts.eva > 0 && r() < D.DISCOVERY.chance;
    }
    s.pending.injuries = injuries;
    s.pending.breakdowns = breakdowns;
    report.injuries = injuries;
    report.breakdowns = breakdowns;
    return { state: s, report };
  }

  function runway(s, report) {
    const perSol = k => report.delta[k] / D.TURN_SOLS;
    const out = {};
    for (const k of ['o2', 'water', 'food']) {
      const d = perSol(k);
      out[k] = d >= 0 ? Infinity : Math.max(0, s.resources[k]) / -d;
    }
    // Water can fall back on the wall reserve
    if (out.water !== Infinity) {
      const d = perSol('water') - report.autoDrained / D.TURN_SOLS;
      out.water = d >= 0 ? Infinity : (Math.max(0, s.resources.water) + s.wallWater) / -d;
    }
    return out;
  }

  function warnings(s, report) {
    const w = [];
    if (s.resources.o2 < 0) w.push({ code: 'o2_out' });
    else if (report.runway.o2 < D.TURN_SOLS * 2) w.push({ code: 'o2_low' });
    if (s.resources.water < 0) w.push({ code: 'water_out' });
    else if (report.runway.water < D.TURN_SOLS * 2) w.push({ code: 'water_low' });
    if (report.autoDrained > 0) w.push({ code: 'wall_auto' });
    if (report.fed < 1) w.push({ code: 'food_out' });
    else if (report.runway.food < D.TURN_SOLS * 2) w.push({ code: 'food_low' });
    if (report.power.habShort) w.push({ code: 'hab_cold' });
    for (const type of D.SHED_ORDER) if (report.power.shed[type] > 0) w.push({ code: 'shed', module: type });
    if (report.greenhouse.cropsLost) w.push({ code: 'crops_lost' });
    if (report.unrepaired.length) w.push({ code: 'unrepaired', module: report.unrepaired[0] });
    for (const c of report.crew) {
      if (c.dose > D.DOSE_LIMIT) w.push({ code: 'dose_over', crewId: c.id });
      else if (c.dose > D.DOSE_LIMIT * 0.85) w.push({ code: 'dose_high', crewId: c.id });
      if (c.health <= 0) w.push({ code: 'health_zero', crewId: c.id });
      else if (c.health < 35) w.push({ code: 'health_low', crewId: c.id });
    }
    if (s.morale < 40) w.push({ code: 'morale_low' });
    return w;
  }

  function snapshot(s, report) {
    return {
      turn: s.turn,
      sol: s.sol,
      o2: Math.max(0, s.resources.o2),
      water: Math.max(0, s.resources.water),
      food: Math.max(0, s.resources.food),
      spares: s.resources.spares,
      wall: s.wallWater,
      morale: s.morale,
      science: s.science,
      shielding: shielding(s),
      doses: s.crew.map(c => c.dose),
      health: s.crew.map(c => c.health),
      supply: report ? report.power.supply : null,
      load: report ? report.power.load : null,
      weather: report ? report.weather : null,
    };
  }

  function forecast(state, plan) {
    return simulate(state, plan, false).report;
  }

  function resolveTurn(state, plan) {
    const { state: s, report } = simulate(state, plan, true);
    s.turn += 1;
    s.sol += D.TURN_SOLS;

    let cause = null;
    if (s.resources.o2 < 0) cause = { type: 'o2' };
    else if (s.resources.water < 0) cause = { type: 'water' };
    if (!cause) {
      const sick = s.crew.find(c => c.health <= 0);
      if (sick) cause = { type: 'health', crewId: sick.id, reason: sick.harm || 'health' };
    }
    if (!cause) {
      const hot = s.crew.find(c => c.dose > D.DOSE_LIMIT);
      if (hot) cause = { type: 'radiation', crewId: hot.id };
    }
    if (cause) {
      s.status = 'aborted';
      s.abortCause = Object.assign(cause, { sol: s.sol });
    } else if (s.turn >= D.TURNS) {
      s.status = 'success';
    }

    s.log.push({
      turn: report.turn, sol: report.sol, weather: report.weather,
      events: (state.events || []).map(e => e.type), choices: report.choices,
      repairs: report.repairs, breakdowns: report.breakdowns, injuries: report.injuries,
      shed: Object.keys(report.power.shed).filter(k => report.power.shed[k] > 0),
      habShort: report.power.habShort, autoDrained: report.autoDrained, fed: report.fed,
      solarShare: report.power.supply > 0 ? report.power.solarKw / report.power.supply : 0,
    });
    s.history.push(snapshot(s, report));
    if (s.status === 'active') beginTurn(s);
    else s.events = [];
    return { state: s, report };
  }

  function scoreMission(s) {
    const share = (a, b) => (b > 0 ? Math.min(1, a / b) : 0);
    const t = s.totals;
    const independence = (share(t.o2Local, t.o2Used) + share(t.waterLocal, t.waterUsed) + share(t.foodLocal, t.foodUsed)) / 3;
    const avgHealth = mean(s.crew.map(c => c.health));
    const avgMargin = mean(s.crew.map(c => Math.max(0, D.DOSE_LIMIT - c.dose)));
    const success = s.status === 'success';
    const parts = {
      // An aborted crew leaves samples and instruments behind: only transmitted results count.
      science: Math.round(success ? s.science : s.science * D.SCORE.abortScience),
      health: Math.round(avgHealth),
      radiation: Math.round(avgMargin * D.SCORE.radiation),
      independence: Math.round(independence * D.SCORE.independence),
      completion: success ? D.SCORE.completion : 0,
    };
    const total = parts.science + parts.health + parts.radiation + parts.independence + parts.completion;
    let grade = 'D';
    if (success) {
      for (const [g, min] of D.SCORE.grades) {
        if (total >= min) { grade = g; break; }
      }
    }
    return { total, parts, grade, independence };
  }

  // Manifest-screen forecast: steady-state numbers for a proposed loadout.
  function summarizeLoadout(loadout) {
    const L = normalizeLoadout(loadout);
    const mass = loadoutMass(L);
    const s = buildState(L, 'MANIFEST', false);
    s.crops = s.crops.map(() => D.ITEMS.greenhouse.growTurns);
    const plan = defaultPlan(s);
    const f = simulate(s, plan, false).report;
    const storm = computePower(s, plan, 'global', seasonAt(0));
    const perSol = k => f.delta[k] / D.TURN_SOLS;
    const sols = {};
    for (const k of ['o2', 'food']) {
      const d = perSol(k);
      sols[k] = d >= 0 ? Infinity : s.resources[k] / -d;
    }
    const wNet = (f.production.water - f.consumption.water) / D.TURN_SOLS;
    sols.water = wNet >= 0 ? Infinity : s.resources.water / -wNet;
    sols.waterWithWall = wNet >= 0 ? Infinity : (s.resources.water + s.wallWater) / -wNet;
    const S0 = shielding(s);
    const doseIndoor = D.TURNS * D.TURN_SOLS * D.DOSE_RATE * (1 - S0);
    const mission = D.TURNS * D.TURN_SOLS;
    const warn = [];
    if (mass > D.MASS_BUDGET + 1e-9) warn.push('over_budget');
    if (f.power.load < f.power.demand - 1e-9 || f.power.habShort) warn.push('power_short');
    if (storm.supply < f.power.habKw + (L.recycler ? D.ITEMS.recycler.kw : 0)) warn.push('storm_risk');
    if (!L.recycler) warn.push('no_recycler');
    if (sols.o2 < mission) warn.push('o2_short');
    if (sols.waterWithWall < mission) warn.push('water_short');
    if (sols.food < mission) warn.push('food_short');
    if (doseIndoor > D.DOSE_LIMIT * 0.8) warn.push('dose_risk');
    if (!L.spares) warn.push('no_spares');
    if (!L.lab && !L.rover) warn.push('low_science');
    return {
      mass, budget: D.MASS_BUDGET, remaining: D.MASS_BUDGET - mass, over: mass > D.MASS_BUDGET + 1e-9,
      power: { clear: f.power.supply, storm: storm.supply, demand: f.power.demand, habKw: f.power.habKw },
      sols, shielding: S0, doseIndoor, warnings: warn, mission,
    };
  }

  return {
    createMission, resolveTurn, forecast, defaultPlan, scoreMission,
    summarizeLoadout, validateLoadout, loadoutMass, normalizeLoadout,
    shielding, seasonAt, newMissionCode, rng, activeCount,
  };
});
