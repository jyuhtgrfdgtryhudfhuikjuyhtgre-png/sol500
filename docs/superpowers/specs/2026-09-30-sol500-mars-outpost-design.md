# SOL 500 — Mars Outpost · Design Spec

**Date:** 2026-09-30 · **Status:** approved in chat (design), building
**Context:** Hackathon entry (space-STEM challenge). Players aged 15–18. Mars only. EN/VI language toggle.

## 1. Problem & goal

Space-STEM content either hides the real engineering trade-offs or buries them in detail.
SOL 500 lets a student command a 4-person Mars outpost for a 500-sol surface stay and
*feel* the trade-offs between life support, radiation shielding, power and food — so that
when a mission fails, the student can say exactly why, in one sentence.

**Success criteria**
- A full run fits in one class period (10–20 min).
- A careless strategy usually fails; a thoughtful one usually succeeds (verified by bots over ≥1000 seeded runs).
- Every failure is explained by a cause chain plus a real-world lesson with a NASA source.
- Every number shown in the game is grounded in a cited source or clearly labelled as a game simplification.
- Runs by double-clicking one HTML file (offline); also published as a shareable link.

## 2. Game loop

1. **Payload manifest** — 30 t landed-mass budget. Habitat (8 t) is fixed; the player packs the rest.
   A live forecast shows sols of O₂/water/food, power margin (clear sky & dust storm) and projected radiation dose.
2. **Operations** — 20 turns × 25 sols = 500 sols. Each turn the player:
   - reads event cards (some ask for a decision),
   - assigns 4 crew to jobs,
   - toggles modules on/off, sets rations and habitat power mode,
   - optionally drains the water wall for emergency water,
   - reads the live forecast, then presses **Advance 25 sols**.
3. **Debrief** — outcome, cause chain, resource charts, score breakdown, lessons with sources, shareable mission code.

## 3. Simulation model (initial values; tuned by `tools/balance.js`)

### 3.1 Payload catalog
| id | item | mass (t) | effect | max |
|---|---|---|---|---|
| hab | Habitat (fixed) | 8.0 | 10 % shielding, 5 kW core load | 1 |
| solar | Solar array | 0.8 | 4 kW avg at mean Mars distance, clear sky; ×dust ×storm ×season | 10 |
| battery | Battery bank | 0.6 | lets 2 arrays deliver at night; uncovered arrays give 50 % | 6 |
| reactor | Fission reactor (Kilopower-class) | 3.0 | 10 kW constant | 2 |
| recycler | Water recycler (ECLSS) | 1.2 | recovers 93 % of used water; 1 kW | 1 |
| oxygen | O₂ plant (MOXIE-scale) | 1.0 | 1.8 kg O₂/sol from CO₂; 2.5 kW | 3 |
| icedrill | Ice-mining rig | 1.5 | 20 kg water/sol; 3 kW | 1 |
| greenhouse | Greenhouse | 1.5 | 2.0 kg food/sol when tended (after a 25-sol crop cycle), 0.3 kg O₂/sol, 1 kg water/sol, +morale; 4 kW | 3 |
| lab | Science lab | 1.2 | lab science ×3; 2 kW | 1 |
| rover | Pressurized rover | 2.0 | EVA science ×2.5; 1 kW | 1 |
| waterwall | Water-wall shielding | 2.0 | +12 % shielding; holds 2000 kg emergency water | 2 |
| spares | Spare-parts kit | 0.25 | one repair | 8 |
| food | Food pallet | 0.5 | 500 kg food | 12 |
| o2 | O₂ tank pallet | 0.5 | 350 kg O₂ (tank overhead) | 8 |
| water | Water pallet | 0.5 | 500 kg water | 8 |

### 3.2 Consumption (per crew per sol)
- O₂ 0.84 kg (NASA BVAD) · Food 1.8 kg packaged (ISS-style, incl. packaging) · Water 7 kg gross (BVAD 3.5 kg metabolic ×2 for hygiene).
- Reduced rations: 75 % food, −health, −morale.

### 3.3 Power
- Supply = arrays × 4 kW × cleanliness × storm factor × season factor (battery coverage rule) + reactors × 10 kW.
- Season: Ls starts at 60°, advances ~0.538°/sol. Solar factor = 1 + 0.19·cos(Ls − 251°). Northern winter (Ls 270–360) adds +1.5 kW heating. Dust-storm season Ls 180–360.
- Demand = hab core (5 kW normal / 3 kW austerity) + powered modules.
- Shortfall sheds modules in order: lab → rover → greenhouse → ice drill → O₂ plant → recycler. If the habitat itself is short: crew health −20 (cold).
- Unpowered greenhouse loses its crop (cycle restarts).
- Dust: cleanliness −6 %/turn (−15 % in a regional storm); maintenance cleans +20 % per worker-point.

### 3.4 Crew & jobs
Crew: Lena Park (Engineer), Minh Tran (Botanist), Diego Ruiz (Geologist), Amara Okafor (Physician). Specialist at own job ×1.5.
| job | effect | outdoor time |
|---|---|---|
| Maintenance | cleans panels, reduces breakdowns, repairs (2 per worker-point, 1 spare kit each) | 15 % |
| Farming | tends 2 greenhouses per worker-point; untended 40 % | 0 |
| Construction | regolith berm +4 % shielding per worker-point (max +40 %) | 40 % |
| Lab science | 10 pts (3 without lab) | 0 |
| EVA | 20 pts with rover (8 without); 3 % injury risk | 40 % |
| Rest | +15 health, +4 morale | 0 |

Physician passively heals the crew +3/turn while healthy. Morale < 40 → productivity ×0.8; < 20 → ×0.6.

### 3.5 Radiation
- Surface dose rate 0.64 mSv/sol (Curiosity RAD, Hassler et al. 2014).
- Dose per turn = 25 × 0.64 × (outdoor + indoor × (1 − S)), S = habitat shielding (cap 75 %).
- Surface dose budget per astronaut: **300 mSv**. (Cruise adds ~660 mSv; a full mission ≈ 1 Sv vs NASA's 600 mSv career limit — a real unsolved problem.)
- Solar particle event: shelter (−12 % work, +3 mSv) or keep working (+40 mSv × (1 − S) indoors, +40 mSv outdoors, −10 health).

### 3.6 Events (seeded; schedule identical for the same mission code)
Regional dust storm (solar ×0.5) · Global dust storm (≈40 % of missions, 3 turns, solar ×0.15 — Opportunity 2018) ·
Dust devil cleans panels (Spirit) · Solar particle event (≥1 per mission) · Solar conjunction (turn 11, fixed: no Earth support, −morale) ·
Habitat micro-leak (patch with spare kit or lose O₂) · Perchlorate in greenhouse soil (wash with water or lose harvest) ·
Discovery after EVA (extra traverse: +science, +dose) · Message from Earth (+morale) · Crew conflict (morale < 40).
Breakdowns: each module unit ~2.5 %/turn, reduced up to 60 % by maintenance; they take effect at the start of the next turn.

### 3.7 Abort conditions (crew launches home early in the Mars Ascent Vehicle)
O₂ < 0 · water < 0 · any crew health ≤ 0 (starvation, cold, injury) · any crew over 300 mSv.

### 3.8 Score
Science + average final health + ½ × average radiation margin + 150 × Earth-independence share + 250 if the mission is completed. Letter grade S/A/B/C/D.

## 4. Architecture
- `src/data.js` — constants, catalog, crew, event definitions (numbers only, no text).
- `src/engine.js` — pure simulation: `createMission`, `forecast`, `resolveTurn`, `score`; seeded RNG streams per (seed, turn, purpose) so events do not depend on player choices. UMD (browser global + Node `require`).
- `src/i18n.js` — EN/VI strings, `t(key, params)`.
- `src/scene.js` — SVG outpost scene (modules, weather, sky).
- `src/charts.js` — SVG line charts for the debrief.
- `src/ui.js` — screens: title, manifest, operations, debrief, science notes.
- `src/style.css`, `index.html` — classic scripts (works from `file://`).
- `tools/build.js` — inlines everything into `dist/sol500.html`.
- `tools/balance.js` — bot strategies × 1000 seeds, prints success rates and failure causes.
- `test/*.test.js` — `node --test`.

## 5. Testing
- Unit tests for consumption, power shedding, battery coverage, radiation, repairs, abort conditions, determinism of seeds.
- Balance targets: naive bot success < 35 %; balanced bot success > 70 %; no single failure cause > 60 % of all failures.
- Browser QA: play full missions in Chrome (DevTools MCP), both languages, phone width.

## 6. Sources (shown in-game)
Hassler et al. 2014 (Science, surface radiation) · Zeitlin et al. 2013 (Science, cruise radiation) · NASA OCHMO radiation brief (600 mSv) ·
NASA BVAD (life-support baselines) · NASA ISS 98 % water recovery (2023) · NASA MOXIE final results (2023) · NASA Kilopower (2018) & Fission Surface Power ·
NASA Opportunity end of mission (2019) · JPL Spirit panel cleaning · Phoenix perchlorate · JPL solar conjunction · NASA Veggie · Mars DRA 5.0 (NASA SP-2009-566).
