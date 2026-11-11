# SOL 500 v3 — Desktop App · Online Share Link · Endless World · Admin Panel

**Date:** 2026-10-01 · **Revision:** v3.1 (2026-10-01, evening) · **Status:** M1–M3 and M4a–M4d shipped (v3.6.0); M5 built and reviewed (3.7.0), QA passed (0 Critical, 0 Important open)
**Builds on:** `2026-09-30-sol500-mars-outpost-design.md` (v1/v2: engine, roles, LAN co-op, walkable outpost)
**Branches:** one `feat/…` branch per milestone, off `master`

**What v3.1 changed:**
- The fixed 96/128-tile map became an **endless world**. It is built in chunks, and chunks out of range are deleted and rebuilt identically.
- Exploring gains **regions, landmarks, random structures, expedition goals and relay beacons**.
- Each player now controls **exactly one astronaut**.
- The admin panel also works **in the browser on the host PC** and **on other Wi-Fi devices with a password**.
- Milestones are built **one at a time**.

## 0. Decisions (from the user)

| Question | Answer |
|---|---|
| App type | Windows desktop app: its own window, no Node install, hosts the server itself |
| "Host the server on web" | Share link from the host's PC (Cloudflare quick tunnel), no account |
| What exploring gives | Resources & finds · Shelter & survival · Dangers · Fog of war + minimap |
| How exploring ties into the mission | The **expedition layer**: explore in real time during each round's planning phase; banked finds count when the round advances |
| Admin panel | All three tabs: Game history · Live server control · Project progress |
| *v3.1:* Map size | **Endless.** Built from the mission code in chunks near the player. Out-of-range chunks are deleted and rebuilt identically when you return. |
| *v3.1:* Exploring extras | **Regions, landmarks, expedition goals, relay beacons,** and **random structures** "so it's not boring" |
| *v3.1:* "Only play as 1 player" | Each player controls **one astronaut**, picked at the start. AI walks the rest; you can still assign everyone's jobs. Multiplayer stays. |
| *v3.1:* Admin in the web | An **Admin button in the browser on the host PC**, and **other Wi-Fi devices with a password**. Never through the share link. |
| *v3.1:* Deadline / order | "Just do your very best", one milestone at a time: M2 → M3 → M4 → M5 |

## 1. Goals & success criteria

1. **App:** `SOL500-Setup.exe` installs and runs on Windows 10/11 without Node. Solo, Host and Join all work from the app. *(M1, done)*
2. **Online:** a friend on another network joins through the share link and sees teammates move smoothly, with a median position round-trip under 300 ms. The admin panel can't be reached through the link (automated test). *(M1, done: 193 ms)*
3. **Endless world:**
   - **Determinism:** the same mission code gives the same world on every computer and on the server. 1,000 random chunks built in shuffled order are byte-identical to the same chunks built in order, in Node and in the browser.
   - **Speed:** building one data chunk takes ≤ 4 ms and painting one image chunk takes ≤ 2 ms (median, dev laptop).
   - **Frame rate:** median ≥ 50 fps in a Chrome performance trace while driving the rover in a straight line for 2 minutes with 5 avatars on screen.
   - **Flat memory:** after driving 2,000 tiles out and back, the JS heap is within +20 MB of where it started, and the number of live chunks stays under its caps the whole way.
   - **Reachability:** on 300 seeds, every find, cave, structure and landmark within 128 tiles of the base can be reached on foot from the base.
4. **Exploring matters, without breaking balance:**
   - The debrief shows what was found and by whom.
   - Balance bots over 1,000 seeds keep the v2 targets: the naive bot succeeds < 35 % and the balanced bot > 70 %, both with and without exploring.
   - Exploring raises the "sloppy player, recommended kit" bot's success rate by 10–25 points.
   - An endless map can't be farmed: the per-round haul is capped by suit charges and backpack space, and the explorer bot's haul must plateau per suit charge. Once refills come in (beacons and pods refill once a round each), the reach per round grows by design, as §3.8 says.
   - The score counts the map's science (finds, sites, landmarks and goals' science) apart: a tenth of it, up to 55 points (`D.SCORE.map = { share: 0.1, cap: 55 }`), tallied in `expedition.science`. *(M4d, §13.12)*
5. **One astronaut:** in solo play you choose your astronaut once. There is no switching; the AI walks the others. If your astronaut dies you take over a surviving crewmate.
6. **Run length:** a solo mission without exploring still fits in 10–20 minutes. *(M4d, as measured, §13.12:)* with one suit charge a round it takes about 45–60 minutes. Full exploring with beacons, pods and goals takes about 2 hours, over several sittings (solo saves at every advance and every 4 s while exploring).
7. **Admin:**
   - Every finished mission (solo, LAN or online) is recorded.
   - The live view updates within 2 s.
   - Kick and close work.
   - The project tab shows the checklist, tests, commits and sources.
   - The panel opens from the browser on the host PC and, with the password, from another Wi-Fi device.
   - Every admin path returns 404 through the share link (automated tests).

**Non-goals:** Mac/Linux app builds, code signing, accounts or logins (other than the admin password), an always-online cloud server, player-vs-player play, changing the 20-round × 25-sol mission structure, HTTPS on the LAN.

## 2. The endless world (`src/worldgen.js`)

### 2.1 Coordinates and determinism
- World tiles are integers in both directions, and can be negative. Tiles are 64 px.
- The base's 9×5 build grid has its top-left at tile (−4, −2), so the HQ sits at (0, 0). The engine's build rules (`buildSpots`, `touchesBase`) still use grid coordinates and don't change; the surface converts.
- A **flat zone** of radius 12 tiles around the base never gets blocking terrain, finds, structures or landmarks.
- Every tile is a **pure function of (seed, x, y)**. Noise fields are evaluated per tile. Discrete features (craters, mesas, canyons, structures, landmarks) are placed **one per cell** on coarse grids, at a spot chosen by hashing (seed, cell x, cell y). A chunk looks up only the feature cells that can overlap it.
- So any chunk can be built in any order, on any client or on the server, with the same result. The world is never sent over the network.
- Integer hashing only (`Math.imul`); no `Math.random` and no floating-point accumulation across chunks.

### 2.2 Regions
The world is divided into regions using a jittered Voronoi diagram on a 224-tile grid, so a region is roughly 150–300 tiles across. Each cell's region type comes from a hash, except the base's cell, which is always **Plains**. Borders are dithered over about 6 tiles so colours blend.

| Region | Look | Terrain mix | Finds and dangers (tuned in M4) | Real-world analogue (sourced in M3) |
|---|---|---|---|---|
| Plains | rust regolith | few boulders, small craters | balanced | Gale crater floor / Jezero plains |
| Dune Sea | dark basaltic sand | dunes everywhere, few blockers | few finds, more dust devils | Bagnold Dunes (Curiosity) |
| Crater Field | grey-brown, pitted | many craters with rims | science ×1.5, ice in crater floors | ancient cratered southern highlands |
| Canyon Lands | layered red and tan | canyon segments, mesas | layered-rock science, ice in canyons | Valles Marineris |
| Icy Plains | pale, polygon-cracked | flat, polygon ground, ice scarps | ice ×3, colder (suit drain +10 %) | Arcadia Planitia shallow ice; exposed ice scarps |
| Volcanic Flanks | dark lava rock | boulder fields, lava tubes | metal ×1.5, caves ×3 | Tharsis / Arsia Mons skylights |

- Entering a region for the first time shows its name and one real fact with its source, as a toast.
- Regions discovered count towards achievements and expedition goals.

### 2.3 Terrain and features
Tile codes are a `Uint8Array` with about 20 codes: regolith, sand, dune, boulder, cliff, rim, crater floor, canyon floor, canyon wall, ramp, ice, polygon ground, lava rock, tube floor, tube wall, skylight, structure floor, structure wall and base.

**Every blocking feature is bounded and spaced**, so open ground always stays connected:
- **Mesas:** blobs 4–14 tiles across, one per 48-tile cell at most, inset at least 6 tiles from the cell edges. They are solid obstacles; nothing is placed on top.
- **Craters:** radius 4–12, one per 64-tile cell at most (more in the Crater Field). Each has a blocking rim with 2–3 gaps and a walkable floor.
- **Canyons:** in Canyon Lands, a noise-guided segment 40–110 tiles long and 3–5 wide, one per 128-tile cell. Both walls block, there is a ramp at least every 24 tiles, and the ends are open.
- **Boulders:** single tiles. In a dense area they're thinned so no 2×2 block is fully solid.
- **Dunes** slow walking to ×0.7; the rover isn't slowed.
- **Precedence** when features overlap: landmark > structure > canyon > crater > mesa > boulders > noise.

**Local reachability check:** a find or structure entrance is only placed if a flood fill over its 96×96-tile window reaches it from the window border. The check is deterministic because the window is. The test suite checks reachability from the base over a 256×256 area on 300 seeds.

### 2.4 Finds (detailed in §3)
- Each data chunk places its finds with Poisson-disc sampling **inside** the chunk, 3 tiles from its edges, so neighbouring chunks never need to agree.
- How many and which kinds depend on the region and the distance ring:
  - inner: ≤ 20 tiles from the base;
  - middle: 20–40;
  - outer: 40–80;
  - far: > 80.
- Richness rises with distance and is capped at the far ring.
- Site ids are stable: `"<cx>,<cy>:<n>"`.

### 2.5 Chunks, streaming and "disappear and reappear"
**Data chunks** (`worldgen.chunk(seed, cx, cy)`):
- 32×32 tiles, holding `{ tiles, sites, structures, landmarkParts, region per tile (4-bit) }`, about 2 KB.
- **Made** when the player comes within 2 chunks of them. **Deleted** beyond 3 chunks (the gap avoids churn at the edge), so at most 7×7 = 49 are live around a player.
- The base's chunks are always kept.
- A hard cap of 64 live data chunks is enforced, dropping the least recently used first.

**Image chunks** (the ground painting):
- 4×4 tiles (256 world px), painted onto a 256×256 offscreen canvas at one canvas pixel per world pixel (256 KB each). The current ground is painted at the same scale and is scaled when drawn.
- **Kept** for the visible area plus a 1-chunk margin. **Deleted** once they are 2 chunks outside the view.
- Painted again on return, with exactly the same picture, because it's seeded from (seed, cx, cy).
- **No seams:** decor that crosses a chunk edge (blotches, small craters, tracks) is drawn by every chunk it touches. Each chunk replays its neighbours' decor, clipped to itself.
- A hard cap of 160 is enforced, about 40 MB at most. A typical 1080p view (≤ 1,700 × 950 world px) uses about 70 chunks, around 18 MB.

**Building without stutter:**
- Missing chunks are queued in order of distance from the point the player is heading to.
- Each frame builds at most one data chunk and paints image chunks until about 4 ms of the frame is used. An `idle` callback adds more when the browser is idle.
- A chunk that isn't painted yet is drawn as flat tile colours from its data, so there are never holes.

**What survives a chunk's deletion:**
- Everything the player changed is stored in mission state (sparse, per chunk): explored cells, emptied or partly used sites, used structures, placed beacons and discovered landmarks.
- A rebuilt chunk applies these on top, so the world looks exactly as you left it.

**Collision and paths:** `isBlocked(x, y)` reads the data chunk and builds it if needed. Click-to-walk uses BFS limited to a 64×64-tile box around the player. NPC crew stay inside the base's chunks.

**Debug overlay:** `?debug=chunks`, or F3 in dev, shows chunk borders, the live/cached counts, queue length and fps. QA uses it to prove that chunks are deleted and rebuilt.

### 2.6 Minimap and fog
- **Fog:** tiles start unseen. Seen tiles show the remembered terrain dimmed; tiles in view show it fully.
  - Explored cells are stored as one 1,024-bit set per touched data chunk (128 bytes, base64).
  - About 100 chunks explored in a long mission comes to ~17 KB.
- **Minimap:**
  - A 1 px-per-tile window centred on the player, 160×160 tiles, redrawn from the explored chunks.
  - It shows region colours, crew dots in role colours, discovered finds, structures, landmarks, beacons, the base, pings and the beacon route home.
  - **M** opens a full-screen map of everything explored, with pan and zoom.
- **Co-op:** fog is shared (§5).

## 3. Exploring — the expedition layer (`src/expedition.js`)

### 3.1 The loop
- Each round's planning phase is when players walk out ("go on EVA"), collect finds, and **deliver** them at the base.
- Delivered finds are **banked** and added to the mission when the round advances. The report shows lines like "+160 kg water — ice deposit, Icy Plains (Bao)".
- **Collecting:** stand next to a find and hold **E** or the action button. A load takes 3 s; a science survey takes 5 s.
- **Backpack:** 3 loads, or 8 while driving the rover.
- **At round end**, everyone is back at the base when the next round starts. Anything still in a backpack is banked automatically at the start of the next round, a one-round delay.

**Finds**
| Find | Where | Gives |
|---|---|---|
| Ice deposit | crater floors, canyons, Icy Plains | 3–6 loads × 40 kg water (by ring) |
| Metal-rich rock | anywhere outside the flat zone | 3–5 loads × 40 kg materials |
| Crashed cargo pod (fictional, from earlier uncrewed supply landers) | plains, dunes | 3 loads: a spare kit, 60 kg food, or an O₂ canister |
| Science site (layered rock, meteorite, old delta, methane vent) | mixed | one survey: 20 / 35 / 60 / 80 science |
| Cave | mesa and canyon walls, Volcanic Flanks | shelter |

### 3.2 Suit oxygen — one charge per round
- Each crew member starts every round with a full suit charge of **150 s outside**.
- Being inside the base zone (within 2 tiles of the habitat) **pauses** the drain but **does not refill** the suit.
- Sprinting doubles the drain. In the rover it's halved. The Icy Plains add 10 % (cold).
- **Refills outside the base:** a relay beacon (§3.8) or an abandoned hab pod (§3.7), each **once per crew member per round**.
- An **O₂ canister** from a pod gives a choice: use it now (+45 s suit time) or carry it home (+10 kg of base O₂; it was 30 until M4d's rebalance, §13.12).
- **At 0 s you collapse:**
  - In co-op, a teammate revives you by holding E for 4 s (2 s for the Medic). You get +30 s and stand up.
  - If nobody revives you before the round advances, a **collapse incident** is recorded: −20 health and −3 morale at advance. Anything you were carrying drops on that spot as a recoverable find.
  - In solo play nobody can revive you, so collapsing records the incident straight away and returns you to the base for the rest of the round. You can't go back out until the next round.

### 3.3 Role skills on the map
| Role | Skill |
|---|---|
| Scientist | surveys in half the time, +50 % science from sites and landmarks |
| Engineer | mines metal, salvages pods and wrecks, and repairs structures in half the time |
| Biologist | sees ice deposits and methane vents on the minimap from 16 tiles (others 8); collects ice in half the time |
| Medic | revives in half the time |
| Commander | pings draw a route line for everyone; crew within 5 tiles move 10 % faster |

*As built (M4d):* the aura also reaches crew on foot while the commander drives the rover; the driver gets none, because the aura speeds foot movement only. A 4-crew mission has no commander (`D.CREW_SIZES` is `[4, 5]`), so no aura and no route line.

### 3.4 Survival events on the map
- **Solar flare:** in rounds whose schedule has `spe`, a warning starts 30 s after the first crew member steps outside, timed by the server in co-op. A **60 s countdown** follows.
  - Shelter zones are the base zone, caves, lava-tube interiors, abandoned hab pods and the built storm-shelter module.
  - Crew outside shelter when the countdown ends get a **flare incident**: +15 mSv at advance, on top of whatever the SPE decision card chose.
- **O₂ rupture event:** canisters carried home count as base O₂, which offsets the loss. The decision card is unchanged.
- **Dust devils:**
  - Rounds whose schedule has `devil` spawn 3–5 devils near each explorer; other rounds spawn 0–1. The Dune Sea doubles both.
  - Their paths come from a seed plus the time since the round started (one shared clock), so every client draws them in the same place without syncing.
  - A hit pushes you 2 tiles and costs 10 s of suit time. The rover is immune.
- **Dust storms** (the existing weather) shrink how far you can see: 8 tiles when clear (10 in the rover), 5 in a regional storm, 3 in a global one. Beacons and lava-tube headlamps aren't affected.
- **Terrain:** dunes slow you down; cliffs, rims, canyon walls, tube walls, structure walls and boulders block you.

### 3.5 Team features
- Fog is shared: anything any crew member sees is revealed for everyone.
- **Ping:** press P or tap the minimap. Pings fade after 10 s.
- The HUD shows each teammate's suit level and what they're carrying.

### 3.6 Landmarks
- **Placement:** one per 256×256 landmark cell, with a 60 % chance, jittered inside the cell and **never within 60 tiles of the base**.
- Each landmark has a footprint of up to 40×40 tiles and overrides other features. Its kind is chosen by weight from its region.
- **Discovery:** the first time any crew member sees a landmark's centre:
  - a **discovery card** opens with a real fact and its NASA or peer-reviewed source (EN/VI);
  - a one-time reward is banked: science 80–150 (Scientist +50 %);
  - it counts towards achievements and expedition goals.
  - *As built (M4c):* the game asks when the centre comes into the view its fog shows, and the rules accept the claim from up to **15.5 tiles** from the centre: the rover's 10 tiles, 4 more on a star dune's crest and 1.5 of slack (`X.discover`). Weather and walking only shrink a view, so a real sighting is never refused. M4c counts discoveries in `x.stats[crewId].landmarks`; the achievements and goals are M4d.

| Landmark | Region weight | What's special |
|---|---|---|
| Ancient river delta | Plains, Crater Field | fan of layered sediment; 3 rich science sites (Jezero analogue) |
| Lava tube | Volcanic Flanks | enter through a skylight; inside is dark (headlamp light cone), a shelter, with ice and rare metal |
| Giant crater with central peak | Crater Field | rim 20 tiles across with gaps, floor ice, a peak survey |
| Methane vent | Canyon Lands, Plains | timed puffs on the map; a survey gives high science (Curiosity methane observations) |
| Exposed ice scarp | Icy Plains | a cliff of clean ice; many ice loads (HiRISE scarps) |
| Giant star dune | Dune Sea | climbable crest that widens your view radius while on top |

**Lava-tube interiors** are drawn under a "roof" that hides while you're inside, with a radial headlamp light. They're ordinary tiles in the same world, so there's no scene switch.

### 3.7 Random structures
*(Added on request, v3.1.)* These keep the endless world from being boring.

**Placement:**
- One per 64×64 structure cell, with a 25–45 % chance by region, jittered, and at least 20 tiles from the base.
- Each is stamped on flat ground with a footprint of 2×2 to 5×5 tiles.
- They are drawn as 3/4-view sprites in `src/art.js`, matching the base's modules.

**Built structures** come from the fictional **Kestrel Survey**, an earlier uncrewed robotic programme. Each has a one-off reward and a short story log (EN/VI) labelled "story, fictional".

| Structure | Interaction (hold E) | Reward |
|---|---|---|
| Supply cache | open, 3 s | 1–2 loads: O₂ canister, spare kit or food |
| Wrecked scout rover | salvage, 6 s (Engineer 3 s) | 2–3 metal loads + 1 spare kit |
| Weather station | repair, 6 s (Engineer 3 s) | reveals the fog within 24 tiles; +20 science; the top bar shows next round's weather in the round of the repair and the 3 after it *(as built; §13.11)* |
| Comms mast | repair, 6 s (Engineer 3 s) | marks the nearest landmark and all structures within 96 tiles on the minimap as "?" |
| Abandoned hab pod | walk in; the roof hides while you're inside | shelter zone; one suit refill per crew member per round; a story log |
| Dusty solar array | salvage, 5 s | 2 loads of materials |

**Natural formations** are scattered per chunk by region. They are scenery with real geology. About 1 in 3 is also a science site with a real fact:
- rock arch
- yardang ridges (wind-carved)
- hoodoos
- balanced rock
- ventifacts (wind-polished boulders)
- layered outcrop
- dark dust-devil tracks on the ground

**Decor variety:** each region has 4–6 prop variants (rock shapes, ripples, small craters, cracks), placed by the chunk's seed. That means no two screens look the same.

### 3.8 Relay beacons
- **Making a kit:** a beacon kit is a new build, made at the base through construction: 50 kg materials and 1.5 work points. Finished kits wait at the base.
- **Carrying one:** a kit takes one backpack slot.
- **Placing one:** hold E for 4 s on an open tile at least 12 tiles from the base and at least 10 tiles from another beacon. At most **6 beacons** can be placed per mission.
- **What a beacon does:**
  - Standing within 2 tiles **refills the suit once per crew member per round**.
  - It reveals the fog within 12 tiles.
  - It shows on the minimap.
  - A dashed **route home** connects the beacon chain to the base on the map and the minimap.
- **Why once per round:** without that limit an endless map could be farmed indefinitely in a single round, since rounds have no clock. With it, the reach per round grows with the number of beacons placed, which is the intended progression.

### 3.9 Expedition goals
- Each round shows **1 goal** in rounds 1–4 and **2 goals** from round 5. Goals are picked deterministically from the seed, the round and the state, and only from goals that can be achieved.
- *As built (M4d, `D.GOALS`, `src/goals.js`):* a haul is **4 loads**, a chunks goal **4 new chunks**, goals are looked for within **150 tiles** of the base, and a structure goal takes a **wreck, a solar array, a weather station or a comms mast** (not a supply cache or a hab pod).

| Goal | Reward |
|---|---|
| Survey a science site ≥ N tiles out, where N = min(120, 30 + 5 × round) | science 20–40 |
| Bring home K loads of ice or metal | a 25 % bonus on those loads |
| Enter a region you haven't visited (only offered if one lies within 150 tiles) | morale +2, science 15 |
| Discover a landmark | science 25 |
| Repair or salvage a structure | materials 40 kg |
| Place a beacon ≥ M tiles out | one free beacon kit |
| Explore K new chunks | science 15 |

- Progress shows in the HUD.
- Completed goals pay out at advance and appear in the round report. Uncompleted goals simply expire.

### 3.10 Debrief "Expedition" section
- Distance walked and finds per player.
- The single most valuable find.
- Regions visited, landmarks discovered, structures used, beacons placed and goals completed.
- A real-world lesson on in-situ resource utilisation (ISRU: using local ice and rock), with NASA sources added in M4 (see §14).

## 4. Engine integration (`src/engine.js`)

**New mission state:** `mission.expedition` is created by `createMission` for new missions.

```
{ v: 2,
  revealed:   { "<cx>,<cy>": <base64 1024-bit set> },
  sites:      { "<siteId>": loadsLeft },                  // only sites touched
  structures: { "<structId>": "used" | "repaired" },
  landmarks:  { "<landmarkId>": { by, round } },
  regions:    [regionIds visited],
  beacons:    [{ x, y, by, round }], kits: n,
  refills:    { "<crewId>": ["<beacon or pod id>", ...] },  // reset each round
  carried:    { crewId: [{ kind, amount, siteId }] },
  drops:      [{ x, y, items }],
  banked:     { water, materials, spares, food, o2, science, morale, lines: [...] },
  goals:      [{ id, kind, params, need, base, progress, done, reward }],  // this round's
  goalsDone:  [{ id, kind, round, params }],                  // every goal paid out this mission
  science:    <n>,                                            // the map's science, for the score (D.SCORE.map)
  bestFind:   null | { crewId, kind, res, amount, region },
  incidents:  [{ crewId, kind: 'collapse'|'flare' }],
  forecastUntil: <round> | -1,                               // the last round a repaired weather station forecasts the next round's weather
  stats:      { crewId: { distance, finds: { ice, metal, pod, science }, structures, landmarks, pods, flareHit, flareCover } } }
```

- **`resolveTurn`** applies the banked haul, goal rewards and incidents before simulating, and adds them to the report. Then it resets those, the refills and the goals, and picks the next round's goals. The carried items, stats and world changes persist. The engine only reads these numbers and doesn't depend on `worldgen.js`; goal checks that need the world run in `expedition.js`.
- **New mission field:** `mission.pilot`, the solo player's crewId (§4.1).
- **Weather station forecast** *(M4c, as built; §13.11)*: `x.forecastUntil` is a round number (`-1`: none), not rounds left, so nothing counts down at the advance. Repairing a weather station sets it to the round of the repair + 3: that round and the three after it. `X.forecastAhead(m)` returns next round's weather while `m.turn <= x.forecastUntil`, else `null`, and the top bar shows it as a dashed "Next round: …" chip beside this round's weather. `E.forecast`, the console's "Next 25 sols" panel, is unchanged.

**`src/expedition.js`** is pure UMD. The server uses it in co-op and `ui.js` uses it in solo play:
- `createExpedition(seed)`
- `collect(m, crewId, siteId, pos)`
- `deliver(m, crewId, pos)`
- `useCanister(m, crewId)`
- `revive(m, crewId, targetId, pos)`
- `collapse(m, crewId, pos)`
- `flare(m, crewIds)`
- `reveal(m, chunkKey, bits)`
- `interact(m, crewId, structId, pos)` → `{ ok, done: 'used' | 'repaired', items, left, fog }` *(M4c)*: a Kestrel structure after its hold; the loads that don't fit in the backpack wait at the door as a drop, and `fog` is what a weather station revealed
- `discover(m, crewId, landmarkId, pos)` → `{ ok, landmark, science }` *(M4c)*: the first sighting of a landmark's centre, claimed from up to 15.5 tiles (§3.6)
- `takeKit(m, crewId, pos)`, `returnKit(m, crewId, pos)` *(M4d)*: a beacon kit into the backpack at the base, and back
- `beaconSpot(m, crewId, pos)`, `placeBeacon(m, crewId, pos)`, `routeHome(m)` *(M4d)*: whether a beacon may go here, placing one, and the dashed chain of beacons to the base
- `refill(m, crewId, id, pos)` → `{ ok, suit }` *(M4c pods, M4d beacons)*: a full suit at a hab pod or a beacon (`id` is the pod's or the beacon's), once per pod or beacon for each crew member each round
- `holdSeconds(kind, role)`, `commanderOut(m, positions)`, `speedFactor(m, crewId, positions)`, `addDistance(m, crewId, from, to, dt)` *(M4d)*: the role's hold time, the commander's aura and route line, and the tiles walked
- `forecastAhead(m)` *(M4c)*: next round's weather while a repaired weather station forecasts it, else `null`
- `mastMarks(m)` → `[{ id, x, y, kind }]` *(M4c)*: what the repaired comms masts mark on the maps, in world tiles; worked out from the world each time, never stored

`src/goals.js` *(M4d)* holds the goals: `G.pick`, `G.offered`, `G.make`, `G.update(m)` (progress, run by the server and by solo play) and `G.advance`. It replaces the `goalProgress(m)` this section once planned.

Each looks up the world with `worldgen.chunk(seed, …)`, checks distance (1.5 tiles of tolerance), loads left and backpack space, and returns `{ error }` or `{ state }`. Pings aren't mission state: they travel as short-lived WebSocket messages (§5).

**Old saves:** a mission saved before v3 gets `expedition` (v: 2) and `pilot` added when it loads. The base grid is unchanged, so the world simply grows around it.

### 4.1 One astronaut per player
- **Solo:**
  - Starting a new mission adds a **"Choose your astronaut"** step: role cards with each crew member's skill. The choice is stored in `mission.pilot`.
  - The "Play as" switcher in the surface side panel is removed.
  - Jobs for everyone are still set from the console and the job list. The surface's crew menu still lets you assign jobs to the crewmate you're facing.
- **Takeover:** if the pilot dies, `pilot` moves to the first active crewmate, with a toast ("You are now Bao, Engineer"). If nobody is active, the surface just shows the base.
- **Co-op:** each seat already controls one crew member. If yours dies, the existing claim dialog offers the free active crew. If there are none, you watch.
- Old solo saves take `pilot` from the old saved `controlId`, or from the first active crew member.

## 5. Multiplayer & networking

**Transport:** WebSockets for both LAN and online play, using `ws` (npm), the server's only runtime dependency. Cloudflare quick tunnels don't support Server-Sent Events. *(M1, done)*

**Endpoint:** `/ws?code=&player=&token=`. HTTP POST `/api/room/act` stays for actions (create, join, claim, plan and expedition actions).

| Direction | Message | Notes |
|---|---|---|
| server→client | `room` | full public room on change |
| server→client | `pos` | all positions + suit level + carried count, throttled to 80 ms |
| server→client | `fog` | `{ "<cx>,<cy>": base64 }` diffs, OR-merged, throttled to 500 ms |
| server→client | `ping` | `{ t: 'ping', d: { x, y, by } }`: its own frame, not an `event`; `by` is the sender's crew id *(M4d)* |
| server→client | `event` | `flare` (start time), `discover` (landmark, by, science), `kicked`, `closed` |
| client→server | `pos` | at most every 110 ms; coordinates are unbounded integers |
| client→server | `reveal` | newly seen cells, per chunk |
| client→server | `ping` | x, y; at most 1 per second per player |

- The server pings every 20 s. Clients reconnect with backoff from 0.5 s to 5 s and get a full `room` message on reconnect.
- **Trust model:** this is a co-op game, so clients report their own suit level, collapses and flare exposure. Item actions (collect, deliver, revive, interact, discover, place, refill) are checked on the server against the last position it received and the world it generates itself.
- **Server world cache:** a shared LRU of at most 256 data chunks across all rooms.

**Server split** *(M1, done)*:

| File | Job |
|---|---|
| `server.js` | startup, CLI flags, static files, HTTP routing |
| `lib/rooms.js` | rooms, players, `apply()` actions, mission/plan/expedition handling |
| `lib/ws.js` | WebSocket upgrade, auth, fan-out, heartbeat |
| `lib/limits.js` | detects remote (tunnel), LAN and loopback requests; rate limits |
| `lib/history.js` | saves finished missions to `<dataDir>/history.json` (M2) |
| `lib/admin.js` | admin page, API, key, password and sessions (M2) |

## 6. Desktop app (`app/`) *(M1, done)*

- **Stack:** Electron and electron-builder. `npm run app` builds `dist-app/SOL500-Setup-<version>.exe`: an NSIS installer, per-user, with a Start-menu entry and a desktop shortcut.
- **`app/main.js`:**
  - takes a single-instance lock;
  - picks a port from 5050–5059;
  - starts the server in-process;
  - opens a `BrowserWindow` loading `http://localhost:<port>/?app=1` with `contextIsolation`, `sandbox`, and no `nodeIntegration`;
  - kills the tunnel on quit.
- **M2 changes:**
  - pass `dataDir: userData` to `createServer`;
  - call `server.setOnline(...)` when the share link starts and stops;
  - add sender checks to the `online:start`/`online:stop` IPC handlers.

  The preload does **not** need `adminKey()`, because the admin page gets its key from the server (§8).
- **Title screen** (app and browser on the host PC): Play solo · Host game · Join game · **Admin**.
- **Unchanged ways to play:** the browser via `node server.js` or `Play SOL 500.cmd`, and the offline `dist/sol500.html`. The offline file is solo-only, with no history or admin, but it does have the endless world.

## 7. Online share link (`app/tunnel.js`) *(M1, done)*

- **Host online** downloads a pinned `cloudflared` (SHA-256 checked) and spawns a quick tunnel. The app shows the link with Copy and a QR code. **Stop sharing** kills it.
- **Remote requests:** a request counts as remote if it has `Cf-Connecting-IP`, or a `*.trycloudflare.com` Host, or a non-private socket address. Admin endpoints and the admin page return 404 to remote requests. `/api/info` hides LAN addresses from them. Rate limits apply per client IP.
- **Global caps:** 40 rooms, 5 players per room, 100 WebSocket connections, 64 KB per request or message.

## 8. Admin panel (`admin.html`, `src/admin.js`)

### 8.1 Who can open it
Requests fall into three classes in `lib/limits.js`:
- **local:** a loopback socket, no `Cf-Connecting-IP`, and the Host header is `localhost`, `127.0.0.1` or `[::1]` with any port.
- **remote:** see §7.
- **LAN:** everything else.

| Class | `/admin` page | Admin API |
|---|---|---|
| local | served with the **admin key** in `<meta name="sol-admin-key">` | `X-Admin-Key: <key>` |
| LAN, Wi-Fi access **on** | served **without** a key; shows a login form | `X-Admin-Key: <session token>` after login |
| LAN, Wi-Fi access **off** | 404 | 404 |
| remote (share link) | 404, always | 404, always |

- **Admin key:** 128 random bits, new on every server start. It's only ever placed in a page for **local** requests. Checking the Host header defeats DNS rebinding, and other sites can't read the page because the server sends no CORS headers. The CLI also prints `http://localhost:<port>/admin`.
- **Key checks:** done in constant time (`crypto.timingSafeEqual` on equal-length buffers). A missing or wrong key gets 401.
- **Admin button:**
  - `/api/info` reports `{ adminHere: true }` only to local requests, and the title screen shows **Admin** when it's true.
  - In the app it opens `/admin` in the same window. In a browser it opens a new tab.
  - The admin page has a "Back to game" link.

### 8.2 Wi-Fi access with a password
- **Setting it up:** a **Wi-Fi access** card on the Live tab, with a password of 8–64 characters (typed twice) and an on/off switch. Only a local session can change the password or switch access on or off.
- **Storage:** `<dataDir>/admin.json` holds `{ enabled, salt, hash, N, r, p }`, an scrypt hash with a random 16-byte salt. The password itself is never stored or logged.
- **Login:** `POST /api/admin/login { password }` from LAN.
  - It's rate-limited to 5 tries per minute and 20 per hour per IP; going over gives 429.
  - Success returns a random 128-bit session token that expires after 8 hours. At most 20 sessions are kept, in memory only.
  - Server restarts, password changes and switching access off all end every LAN session.
- **What LAN admins can do:** everything except change the Wi-Fi access settings. They can't stop sharing either, since that only works in the app.
- **Honest warning in the card (EN/VI):** "Wi-Fi traffic is not encrypted. Use a password you don't use anywhere else."

### 8.3 Tab 1: Game history
- A finished mission (success or lost) is saved to `<dataDir>/history.json`:
  - written atomically (temp file + rename), with a copy fallback on Windows `EPERM`;
  - a corrupt file is moved aside as `history.corrupt-<ts>.json`;
  - capped at 2,000 records, oldest dropped first;
  - `dataDir` is the app's `userData` folder, or `./data/` when running from source (git-ignored).
- **Record:** `{ id, endedAt, mode: solo|lan|online, missionCode, difficulty, crewSize, players: [{ name, crewId, role }], outcome, cause, score, grade, sols, finds: { crewId: {...} }, distance: { crewId: tiles }, explore: { regions, landmarks, structures, beacons, goals }, achievements: [] }`. Fields before M4 hold `{}` or 0 (this now applies only to records written before 3.6.0).
- **`mode`:** `online` if any player connected through the tunnel.
- **Who records what:**
  - **Co-op games:** the server records them when the room's mission ends.
  - **Solo games** in the app, or in a browser served by this server, are recorded when the client POSTs `/api/history/solo { mission }`.
    - It's accepted from local and LAN requests, rate-limited to 10 per minute per IP, and refused from remote ones.
    - The server validates the mission and re-scores it with `E.scoreMission`.
    - The client drops the bulky `expedition.revealed` before posting, to stay under 64 KB.
  - This way a teacher's PC sees every student's solo game on the same Wi-Fi.
- **What the tab shows:**
  - Totals: missions, win rate, best score, total finds
  - Charts using `src/charts.js` and the dataviz rules: score per mission (line), wins vs losses and failure causes (bars)
  - A sortable table; clicking a row shows the debrief summary
  - Export CSV · delete one · clear all (with confirmation)
- **CSV export:** UTF-8 with a BOM; values are quoted, and text cells starting with `= + - @` are prefixed with `'` so spreadsheets don't run them as formulas.

### 8.4 Tab 2: Live server
Polls `/api/admin/live` every 2 s.
- Shows uptime, port, LAN addresses, share-link status (link + QR), players online, and the Wi-Fi access card.
- For each room: code, stage, round and sol, and each player's name, role, connected state, last seen and whether they're remote.
- **Actions:**
  - kick a player and close a room, both with confirmation;
  - stop sharing (in the app only, through IPC);
  - log out all Wi-Fi admins.
- A log of the last 100 events.

### 8.5 Tab 3: Project progress
Reads `progress.json`, which `tools/progress.js` makes.
- **Contents:** `{ generatedAt, features: [{ milestone, text, done }], tests: { total, pass, fail }, commits: { count, recent: [{ hash, date, subject }] }, code: { files: [{ path, lines }], total }, sources: [{ label, url }] }`.
- **Where the data comes from:**
  - Features come from §12 of this spec.
  - Tests come from `node --test` with the TAP reporter.
  - Commits come from `git log`.
  - Sources come from `src/i18n.js`.
- **When it's made:**
  - `npm run progress` makes it, and `npm run app` runs that automatically.
  - From source, a **Refresh** button re-runs it; it is local only and dev only.
  - The packaged app shows its build-day snapshot with the date.
  - `progress.json` is git-ignored.

## 9. File map (new and changed in M2–M5)

| File | Milestone | Job |
|---|---|---|
| `lib/history.js` | M2 | history store, summarize, CSV |
| `lib/admin.js` | M2 | admin page, API, key, Wi-Fi password, sessions |
| `lib/limits.js`, `lib/rooms.js`, `lib/ws.js`, `server.js` | M2 | request classes; room events, kick and close; ws hardening; wiring |
| `admin.html`, `src/admin.js`, `src/admin.css` | M2 | admin panel |
| `tools/progress.js` | M2 | makes `progress.json` |
| `src/worldgen.js` | M3 | endless world: regions, terrain, features, chunk API (UMD, pure) |
| `src/surface.js` + `src/surface-world.js` | M3 | chunk streaming, painting, culling, collision, minimap, fog, map screen; split so no file passes ~900 lines |
| `src/ui.js`, `src/engine.js` | M3 | Choose-your-astronaut step, `pilot`, takeover; title Admin button |
| `src/expedition.js` | M4 | exploring rules (UMD, pure) |
| `src/art.js` | M4 | structure, landmark and formation sprites |
| `src/engine.js`, `src/data.js` | M4 | banked haul, goals, beacon kit build, forecast bonus; `WORLD`, `EXPEDITION`, `STRUCTURES`, `LANDMARKS` constants |
| `src/i18n.js` | M2–M5 | EN + VI for everything new, and sources |
| `tools/balance.js` | M4 | explorer bot (haul model, beacons, goals) |

## 10. Testing

**Unit tests (`node --test`)**
- **worldgen:**
  - determinism in shuffled order, plus a hash of 1,000 chunks pinned in a test;
  - the flat zone is empty;
  - every blocking feature fits its size bounds;
  - reachability from the base over 256×256 on 300 seeds;
  - region distribution;
  - chunk build time.
- **expedition:**
  - collect, deliver, capacity and distance errors; the canister both ways; collapse drops; revive; flare;
  - reveal OR-merge;
  - interact with each structure kind; discover; beacon placement rules; refill once per round; goal picking and progress.
- **engine:** banked haul, goal rewards and incidents are applied once, reported, then reset; old saves get `expedition` and `pilot`; pilot takeover.
- **server:** WebSocket kick and close events; 503 at capacity; 404 on a non-`/ws` upgrade; per-seat cap; heartbeat; fog fan-out; expedition actions validated.
- **Request classes:**
  - the admin page and API return 404 with `Cf-Connecting-IP` or a trycloudflare Host, even with the key;
  - a LAN request with access off gets 404;
  - a LAN login gets rate-limited;
  - the key never appears for a Host other than localhost.
- **history:** atomic write, cap, corrupt-file recovery, solo POST refused when remote, CSV escaping.
- **progress:** parses the checklist and TAP output.

**Other checks**
- **Performance:**
  - a Chrome DevTools trace of a 2-minute straight rover drive, with a ≥ 50 fps median;
  - a heap snapshot before and after a 2,000-tile out-and-back trip, within +20 MB;
  - the `?debug=chunks` counts staying under their caps.
- **Balance:** `tools/balance.js` with an explorer bot over 1,000 seeds × 3 difficulties; the targets are in §1.4.
- **Browser QA** in Chrome DevTools:
  - a solo mission start to finish with exploring;
  - 2- and 5-player LAN;
  - a live share-link game;
  - all admin tabs from the host browser, plus Wi-Fi admin from a second device or a LAN address;
  - EN/VI;
  - phone width.
- **App QA:** build, install and launch the installer; Solo/Host/Join/Admin; Host online; reinstall over the old version; uninstall.

## 11. Milestones

Built **one at a time**. Each gets its own branch off `master`, its own written plan, subagent-driven tasks with reviews, browser QA, and a merge into `master` before the next starts.

1. **M1: App + online.** *Done, merged at `dc50358`.*
2. **M2: Admin panel.**
   - history recording (solo, LAN and online);
   - the three tabs;
   - progress generation;
   - the Admin button in the browser and the app;
   - Wi-Fi access with a password;
   - the M1 follow-ups for M2.
3. **M3: Endless world.**
   - worldgen with regions and terrain features;
   - chunk streaming with delete and rebuild;
   - painting and culling;
   - collision and paths;
   - minimap, map screen and shared fog;
   - region toasts with sources;
   - the debug overlay;
   - one-astronaut control.
4. **M4: Exploring.** Built as four parts (the user split it on 2026-10-05). Each part gets its own branch, plan, reviews, QA, merge and installer:
   - **M4a, expedition core (v3.3.0):**
     - finds and carrying;
     - suit O₂, collapse and revive;
     - rover parking and its battery;
     - the server's world cache and checked actions;
     - an explorer bot that keeps the balance targets.
   - **M4b, dangers (v3.4.0):** flares and shelters, caves, dust devils, and storms that shrink the view.
   - **M4c, points of interest (v3.5.0):** landmarks and discovery cards, random structures and formations, and their sources.
   - **M4d, progression and team (v3.6.0):**
     - relay beacons and the route home;
     - expedition goals;
     - role skills and pings;
     - the debrief section;
     - ISRU and other sources;
     - the final rebalance.
5. **M5: Polish.**
   - every string in EN + VI;
   - the M1 follow-ups for M5;
   - the final balance pass;
   - the offline build;
   - the installer rebuild;
   - help for the Windows warnings.

## 12. Feature checklist

### M1 — App + online
- [x] WebSocket transport through a real quick tunnel verified (spike)
- [x] Live updates on WebSockets (LAN + online); SSE removed
- [x] Server split into lib/ modules; existing tests still pass
- [x] Remote-request detection and rate limits
- [x] Desktop app window with built-in server
- [x] Host online share link with Copy + QR
- [x] Windows installer builds

### M2 — Admin panel
- [x] Admin key and local-only access
- [x] Admin button in the browser and the app
- [x] Wi-Fi admin access with a password
- [x] Mission history recorded (solo, LAN, online)
- [x] History tab with totals, charts, table, CSV
- [x] Live server tab with kick and close
- [x] Project progress tab and generator

### M3 — Endless world
- [x] Deterministic endless worldgen with regions
- [x] Terrain features with reachability guarantees
- [x] Chunk streaming: out-of-range chunks deleted and rebuilt identically
- [x] Smooth rendering at 50+ fps with flat memory
- [x] Minimap, full map and shared fog of war
- [x] Region discovery toasts with real sources
- [x] One astronaut per player (choose at start, takeover on death)

### M4 — Exploring
- [x] Collect, carry and deliver finds (M4a)
- [x] Finds counted at advance and in the report (M4a)
- [x] Suit oxygen, collapse and revive (M4a)
- [x] Rover parking and its battery (M4a)
- [x] Solar flare countdown and shelters (M4b)
- [x] Dust devils and storm visibility (M4b)
- [x] Display settings: graphics Best or Fast, an FPS limit and an FPS readout (M4b)
- [x] Landmarks with discovery cards (M4c)
- [x] Random structures and natural formations (M4c)
- [x] Relay beacons and the route home (M4d)
- [x] Expedition goals (M4d)
- [x] Role skills on the map and pings (M4d)
- [x] Debrief Expedition section and ISRU lesson (M4d)
- [x] Rebalanced with explorer bots (M4d)

### M5 — Polish
- [x] English + Vietnamese for every new screen
- [x] Offline single-file build updated
- [x] Final installer build tested

### M6 — Base ranks, the Garage and the Fabricator
- [x] Base ranks bought with materials: Camp, Outpost, Station, Colony, each with more land and room for buildings
- [x] The Fabricator and its four gear lines: suit tanks, backpack, rover cargo racks, tools
- [x] Colony: the sample-return launch and a self-sufficient base
- [x] The Garage and the pressurised rover
- [x] The scout drone

## 13. Refinements made while writing this spec (need the user's OK)

1. **Suit oxygen refills once per round, not at the base.** Rounds have no clock, so if the base refilled your suit, the best play would be emptying the map in round 1. With one charge per round, each EVA is a real decision. Standing at the base still pauses the drain.
2. **Revive only, no carrying.** A fallen crewmate is revived on the spot.
3. **Items still in a backpack at round end** are banked at the start of the next round instead of being lost.
4. **The server gains one dependency (`ws`).** *(M1, done)*
5. *v3.1:* **Beacons and hab pods refill once per crew member per round.** This stops endless-map farming (see §3.8).
6. *v3.1:* **Random built structures belong to a fictional programme (the "Kestrel Survey").** They are labelled "story, fictional" in the game so players never mistake them for real missions. Natural formations and landmarks use real science with sources.
7. *v3.1:* **Solo history is accepted from LAN devices too** (rate-limited). A teacher's or judge's PC then sees every solo game played on the same Wi-Fi.
8. *v3.1:* **The admin key is put into the page by the server** for local requests, instead of being passed through the app's preload. One mechanism serves both the browser and the app.
9. *M4a:* **The rover has a battery.**
   - It drives 400 tiles a round and recharges overnight.
   - Working on a find from the rover drains the suit at the walking rate, because you step out to work.
   - Without this, the explorer runs had the rover hauling about five times what a walker does: about 35 loads a round and about 5,500 science a mission.
   - Real Mars rovers are limited by their power in the same way.
10. *M4b:* **Dust devils are scattered per data chunk, not "near each explorer".** The user approved this on 2026-10-13 ("ok go").
   - §3.4 says a round whose schedule has `devil` spawns 3–5 devils near each explorer, other rounds 0–1, and the Dune Sea doubles both. Now every 32-tile data chunk holds that many at any time: 3–5 in a dust-devil round, 0–1 in other rounds, and twice as many in the Dune Sea. None comes within 16 tiles of the HQ.
   - A devil lasts 24 s (2 s to form, 2 to die down) and drifts 6–12 tiles along the round's wind, give or take 45°. It hits when its middle passes within 0.55 tiles of your feet once it has formed. The throw is a 0.25 s slide of 2 tiles that stops at walls, and 2 s of calm follow a hit. A hit still costs 10 s of suit, and the rover is immune, as §3.4 says.
   - Why: every screen draws the same devils from the mission code, the round and the round's clock, without knowing where anyone is, so nothing is synced. Devils near each explorer would need every screen to agree on where everyone stands.
   - Measured: about 1.7 devils within 12 tiles of you in a dust-devil round (0.23 in other rounds). A walker who never dodges is hit 1.61 times in a 150 s EVA in a dust-devil round, and 0.18 times in other rounds.
11. *M4c:* **The weather station's forecast is a chip beside this round's weather, not a console look-ahead.** The user approved this on 2026-10-21 ("yes that what i want").
   - §4 said `mission.forecastBonus` holds rounds left and `E.forecast` looks one extra round ahead while it's above 0. The console has no look-ahead to extend.
   - Now repairing a weather station sets `x.forecastUntil` to the round of the repair + 3 (a round number; `-1` for none). While `X.forecastAhead(m)` returns a weather, the top bar shows "Next round: {weather}" beside this round's weather chip, dashed and in that weather's colours. Nothing counts down at the advance.
   - It lives in the expedition state, which the save repair already covers: a save made before M4c loads with `forecastUntil` at `-1`.
12. *M4d:* **Calls the user left to Claude on 2026-10-27** ("just start, make the calls yourself"):
   - **"Take shelter" on the solar-storm card keeps its meaning at the base and doesn't protect crew on the surface.** The card decides the crew's day at the base: less work and a small dose. Anyone outside still needs cover from the map's flare (§3.4), and the card's hint says so in English and Vietnamese, so nobody thinks their astronaut outside is safe.
   - **The sloppy-bot target (§1.4) is measured where it has room: veteran.** On cadet and commander the sloppy bot already wins 98–100 % without exploring, so it can't gain 10 points there.
     - On veteran, exploring with M4d's beacons and goals must add 10–25 points (today it adds about 30). The balance runs choose the lever, for example a smaller veteran haul.
     - The rover kit is an exploring kit, so its large gain stays.
     - The hard targets stay: careless + explorer under 35 %, thoughtful + explorer over 70 %.
   - **An S grade stays special.** On commander over 1,000 runs:
     - about a quarter to a third of thoughtful explorers get an S;
     - under 10 % of sloppy explorers do;
     - a mission played without exploring keeps about the grades it got in 3.2.0, before exploring.
     - The balance runs choose how: new grade bands, or science counting less above a cap.
   - **The last round's backpack is banked at the final advance,** so it counts for the score and the debrief. Today it is lost.
   - **A Science note lists every fact and story log found this mission, with its source.** A card that another card replaced is then not lost (M4c's final review), and the ISRU sources live there too.
   - **Pings work in solo too:** P marks a spot on your own maps for 10 s. The commander's route line and speed aura count only while the commander (the 5th crew member) is outside.
   - **Beacons aren't flare cover.** §3.4's shelter list doesn't name them: they refill and reveal (§3.8).
   - **M4d is one milestone and one release (3.6.0),** built the way M4c was: a dry run, then the plan, then the build.
   - **Decided after the dry run's measurements (2026-11-02):**
     - **An O₂ canister carried home gives 10 kg of base O₂, not 30** (`D.EXPEDITION.canister.o2`, §3.2). On veteran the canisters were most of what exploring added for a sloppy player (about 30 points); at 10 kg it adds about 22, inside the 10–25 target.
     - **The map's science counts a tenth in the score, up to 55 points** (`D.SCORE.map`, §1.4). Without it nearly every thoughtful explorer got an S; now about 292 of 1,000 do on commander, and fewer than 100 of 1,000 sloppy explorers.
     - **The run length is as §1.6 says:** about 45–60 minutes with one suit charge a round, about 2 hours with full exploring. A mission with fewer rounds would change a §1 non-goal and the balance, so it waits for the user.
     - **`D.SCIENCE.eva` stays at 20,** for the user to decide. It carries the rover kit's grades without exploring, which are 3.2.0's.
   - **3.6.0 also ships the NASA photo floor, the rover physics, the "Why Mars?" story and the field guide** (the floor's branch, rebased onto M4d's), so the release gives the installed beta nothing less. Their design is in `docs/superpowers/specs/2026-11-03-sol500-rover-drive-design.md`.

## 14. Risks

| Risk | Plan |
|---|---|
| Chunk building or painting stutters on slow laptops | Budget of 1–2 chunks per frame, idle callbacks, flat-colour fallback, prefetch in the direction of travel; measured in M3 |
| Memory creeps up on long drives | Hard caps (64 data, 160 image chunks), LRU eviction, debug counters, a heap-snapshot test in QA |
| Features overlap and wall off areas | Bounded, spaced features; precedence order; local flood-fill check; 300-seed reachability test |
| Endless map makes exploring farmable | Per-round suit charges, backpack limits, refills once per round, capped richness; explorer bot plateau check |
| Clients disagree about the world | Integer-only hashing, a pinned 1,000-chunk hash test run in Node, and a QA check in Chrome |
| LAN admin password sent over plain HTTP | Clear warning, scrypt hashing, sessions, rate limits; access is off by default and never available through the share link |
| Quick tunnels have no uptime guarantee | Fine for play sessions; the status shows errors and offers a new link |
| Antivirus flags the unsigned app or the cloudflared download | Pinned version and hash check; documented "Run anyway" steps |
| Missions get too long with exploring | Suit time per round is tunable; exploring stays optional; measured in playtests |
| Region, landmark, ISRU, lava-tube and dust-devil facts | Real NASA or peer-reviewed sources are found and checked before any in-game claim is written; no invented citations |

## 15. Sources

- **Already in the game:** see the v1 spec §6.
- **Cloudflare quick-tunnel limits:** https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- **To be found and verified:**
  - **in M3:** region analogues (Gale and Jezero, the Bagnold Dunes, Valles Marineris, Arcadia Planitia ice, the Tharsis and Arsia Mons skylights);
  - **in M4:** landmarks and formations (the Jezero delta, lava tubes, methane at Gale, HiRISE ice scarps, yardangs, ventifacts, dust-devil tracks) and the ISRU lesson.

  Each will be added to `src/i18n.js` with its URL.
