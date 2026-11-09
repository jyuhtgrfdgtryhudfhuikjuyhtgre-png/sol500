'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/i18n.js');

test('every English string has a Vietnamese twin and the other way round', () => {
  const en = Object.keys(I.STR.en);
  const vi = Object.keys(I.STR.vi);
  assert.deepEqual(en.filter(k => !(k in I.STR.vi)), [], 'missing in Vietnamese');
  assert.deepEqual(vi.filter(k => !(k in I.STR.en)), [], 'missing in English');
});

test('the admin panel has every string it uses, in both languages', () => {
  const keys = ['title.admin', 'admin.title', 'admin.back', 'admin.modeLocal', 'admin.modeLan', 'admin.tab.history', 'admin.tab.live', 'admin.tab.project',
    'admin.refresh', 'admin.error', 'admin.stale', 'admin.reload', 'admin.loading', 'admin.confirm', 'admin.delete',
    'admin.login.title', 'admin.login.body', 'admin.login.password', 'admin.login.go', 'admin.login.bad', 'admin.login.slow', 'admin.login.off',
    'admin.h.missions', 'admin.h.winRate', 'admin.h.best', 'admin.h.finds', 'admin.h.empty', 'admin.h.scoreChart', 'admin.h.score', 'admin.h.mission',
    'admin.h.outcomes', 'admin.h.causes', 'admin.h.noLosses', 'admin.h.table', 'admin.h.csv', 'admin.h.clear', 'admin.h.clearAsk', 'admin.h.deleteAsk', 'admin.h.details',
    'admin.col.date', 'admin.col.mode', 'admin.col.code', 'admin.col.players', 'admin.col.outcome', 'admin.col.cause', 'admin.col.score', 'admin.col.grade', 'admin.col.sols',
    'admin.mode.solo', 'admin.mode.lan', 'admin.mode.online', 'admin.outcome.success', 'admin.outcome.lost',
    'admin.d.title', 'admin.d.difficulty', 'admin.d.crew', 'admin.d.crewN', 'admin.d.achievements', 'admin.d.none', 'admin.d.noPlayers',
    'admin.l.uptime', 'admin.l.players', 'admin.l.rooms', 'admin.l.port', 'admin.l.addresses', 'admin.l.noAddresses', 'admin.l.share', 'admin.l.qr', 'admin.l.notSharing',
    'admin.l.stopSharing', 'admin.l.noRooms', 'admin.l.room', 'admin.l.roundSol', 'admin.l.host', 'admin.l.connected', 'admin.l.awaySince', 'admin.l.remote',
    'admin.l.noCrew', 'admin.l.kick', 'admin.l.kickAsk', 'admin.l.close', 'admin.l.closeAsk', 'admin.l.events', 'admin.l.noEvents', 'admin.l.time', 'admin.l.what',
    'admin.l.name', 'admin.l.astronaut', 'admin.l.status', 'admin.l.via',
    'admin.phase.lobby', 'admin.phase.manifest', 'admin.phase.ops', 'admin.phase.debrief',
    'admin.ev.roomCreated', 'admin.ev.playerJoined', 'admin.ev.playerReplaced', 'admin.ev.playerLeft', 'admin.ev.playerKicked', 'admin.ev.roundResolved',
    'admin.ev.missionEnded', 'admin.ev.roomClosed', 'admin.ev.soloRecorded',
    'admin.w.title', 'admin.w.body', 'admin.w.warn', 'admin.w.password', 'admin.w.again', 'admin.w.save', 'admin.w.saved', 'admin.w.mismatch', 'admin.w.short',
    'admin.w.needPassword', 'admin.w.access', 'admin.w.sessions', 'admin.w.logout', 'admin.w.how', 'admin.w.managed',
    'admin.p.empty', 'admin.p.generated', 'admin.p.features', 'admin.p.done', 'admin.p.tests', 'admin.p.failing', 'admin.p.commits', 'admin.p.lines',
    'admin.p.sources', 'admin.p.recent', 'admin.p.biggest', 'admin.p.refreshing', 'admin.p.failed', 'admin.p.hash', 'admin.p.subject',
    ...['hypoxia', 'dehydration', 'starvation', 'cold', 'habFault', 'radiationSickness', 'injury', 'rations', 'health'].map(c => 'admin.cause.' + c)];
  for (const lang of ['en', 'vi']) {
    const missing = keys.filter(k => !I.STR[lang][k]);
    assert.deepEqual(missing, [], 'missing in ' + lang);
  }
});

test('every region has a name and a real fact with a checked source, in both languages', () => {
  const W = require('../src/worldgen.js');
  for (const id of W.REGIONS) {
    for (const lang of ['en', 'vi']) {
      assert.ok(I.STR[lang]['region.' + id], lang + ' name of ' + id);
      assert.ok(I.STR[lang]['region.fact.' + id], lang + ' fact for ' + id);
    }
    assert.notEqual(I.STR.vi['region.fact.' + id], I.STR.en['region.fact.' + id], 'translated: ' + id);
    const src = I.SOURCES[I.REGION_SOURCES[id]];
    assert.ok(src && src.label && /^https:\/\//.test(src.url), 'source for ' + id);
  }
  for (const lang of ['en', 'vi']) {
    assert.ok(I.NOTES[lang].some(n => W.REGIONS.every(id => n.src.includes(I.REGION_SOURCES[id]))), lang + ': the science notes list the region sources');
  }
});

test('the ground photos are credited: a Science note in each language cites every NASA photo the surface is painted with', () => {
  const fs = require('node:fs'), path = require('node:path');
  const header = fs.readFileSync(path.join(__dirname, '..', 'src', 'ground-photos.js'), 'utf8').split('*/')[0];
  const pias = [...new Set(header.match(/PIA\d{5}/g))];
  assert.equal(pias.length, 6, 'the six photos named in src/ground-photos.js');
  for (const lang of ['en', 'vi']) {
    const note = I.NOTES[lang].find(n => pias.every(p => n.src.some(id => I.SOURCES[id] && I.SOURCES[id].label.includes('(' + p + ')'))));
    assert.ok(note, lang + ': a note cites ' + pias.join(', '));
    for (const id of note.src) assert.match(I.SOURCES[id].url, /^https:\/\/science\.nasa\.gov\/photojournal\/[a-z0-9-]+\/$/, id);
  }
});

test("the user's three NASA links are in the Science notes in both languages: designer plants, the OSDR space biology repository and a study from it, and Mars Trek", () => {
  const want = {
    designerPlants: /^https:\/\/www\.nasa\.gov\/news-release\/nasa-designer-plants-on-mars\/$/,
    osdr: /^https:\/\/osdr\.nasa\.gov\/bio\/repo\/search\?q=&data_source=cgene,alsda,esa&data_type=study$/,
    osdrCara: /^https:\/\/osdr\.nasa\.gov\/bio\/repo\/data\/studies\/OSD-678$/,
    marsTrek: /^https:\/\/trek\.nasa\.gov\/mars\/$/,
  };
  for (const [id, re] of Object.entries(want)) {
    assert.ok(I.SOURCES[id] && I.SOURCES[id].label, id);
    assert.match(I.SOURCES[id].url, re, id + ': the page itself, with no tracking parameters');
    for (const lang of ['en', 'vi']) assert.ok(I.NOTES[lang].some(n => n.src.includes(id)), lang + ': a note cites ' + id);
  }
  assert.deepEqual(I.NOTES.vi.map(n => n.src), I.NOTES.en.map(n => n.src), 'the Vietnamese notes cite what the English ones do, in order');
});

test('"Driving on Mars" gives the rover\'s mass in kilograms and its weight in newtons (mass × g), in both languages', () => {
  // The note teaches that weight changes with gravity; kilograms measure mass, which does not.
  const PH = require('../src/physics.js'), i = I.NOTES.en.findIndex(n => n.title === 'Driving on Mars');
  assert.deepEqual([PH.MARS_G, PH.EARTH_G].map(g => Number((PH.ROVER.mass * g).toPrecision(2))), [3800, 10000], '1,025 kg × g, to 2 figures');
  const want = { en: ['has the mass of Perseverance, 1,025 kg', '3,800 newtons on Mars', '10,000 on Earth'], vi: ['có khối lượng bằng Perseverance, 1.025 kg', '3.800 niutơn trên sao Hỏa', '10.000 niutơn trên Trái Đất'] };
  for (const [lang, parts] of Object.entries(want)) for (const p of parts) assert.ok(I.NOTES[lang][i].body.includes(p), lang + ': ' + p);
});

test('the Plains fact cites a page from after the landing and claims nothing that page does not say', () => {
  // https://www.jpl.nasa.gov/news/touchdown-nasas-mars-perseverance-rover-safely-lands-on-red-planet/ (Feb. 18, 2021) says
  // "has touched down at Jezero Crater", "Some 28 miles (45 kilometers) wide" and "3.5 billion years ago the crater had its
  // X
  assert.match(I.SOURCES.jezero.url, /\/touchdown-nasas-mars-perseverance-rover-safely-lands-on-red-planet\/$/);
  for (const lang of ['en', 'vi']) {
    const fact = I.STR[lang]['region.fact.plains'];
    assert.match(fact, /45/, lang + ': the width');
    assert.match(fact, /3[.,]5/, lang + ': the age');
    assert.match(fact, /slav/i, lang + ': the meaning of the name, which the second source says');
  }
});

// ---------- points of interest (M4c) ----------

test("the flare's warnings name every cover out on the map, and each has its own in-cover note, in both languages", () => {
  const cover = { en: ['cave', 'lava tube', 'hab pod', 'storm shelter'], vi: ['hang', 'ống dung nham', 'khoang sinh hoạt', 'hầm trú bão'] };
  for (const lang of ['en', 'vi']) {
    for (const k of ['eva.flare.run', 'eva.flare.warned']) for (const w of cover[lang]) assert.ok(I.STR[lang][k].includes(w), lang + ' ' + k + ': ' + w);
    for (const k of ['eva.inCave', 'eva.inTube', 'eva.inPod']) assert.ok(I.STR[lang][k], lang + ' ' + k);
  }
});

test("the Kestrel structures' prompts, notes and report lines have their strings in both languages", () => {
  const keys = ['eva.open', 'eva.salvage', 'eva.repair', 'eva.atDoor', 'eva.repairedWeather', 'eva.repairedMast', 'eva.refilled', ...['cache', 'wreck', 'weather', 'array'].map(k => 'find.' + k)];
  for (const lang of ['en', 'vi']) assert.deepEqual(keys.filter(k => !I.STR[lang][k]), [], 'missing in ' + lang);
});

test("every error the exploring rules can give has a string, so co-op never turns one into 'no answer from the server'", () => {
  // src/ui.js passes a co-op error on only when eva.err.<code> exists (else 'net'): the surface must know 'known' and
  // 'refilled' to stay quiet on them. The flare's own errors are solo play's, never sent to a server.
  const fs = require('node:fs'), path = require('node:path');
  const codes = [...new Set([...fs.readFileSync(path.join(__dirname, '..', 'src', 'expedition.js'), 'utf8').matchAll(/error: '(\w+)'/g)].map(g => g[1]))];
  assert.ok(['noLandmark', 'known', 'noStructure', 'badKind', 'done', 'refilled'].every(c => codes.includes(c)), 'the points of interest\'s codes are read');
  for (const lang of ['en', 'vi']) assert.deepEqual(codes.filter(c => !I.STR[lang]['eva.err.' + c]), [], 'missing in ' + lang);
});

test("the discovery and formation cards and a discovery's report line have their strings in both languages; the discovery names the finder", () => {
  for (const lang of ['en', 'vi']) {
    assert.deepEqual(['disc.new', 'disc.by', 'disc.formation', 'find.landmark'].filter(k => !I.STR[lang][k]), [], 'missing in ' + lang);
    assert.match(I.STR[lang]['disc.by'], /\{name\}/, lang);
  }
});

test("the weather station's forecast chip has its strings in both languages, naming the weather", () => {
  for (const lang of ['en', 'vi']) {
    assert.match(I.STR[lang]['eva.forecast'], /\{w\}/, lang);
    assert.ok(I.STR[lang]['eva.forecastBy'], lang);
  }
});

// ---------- M4d hud: the ISRU lesson and its sources ----------

test('the ISRU lesson and its sources are in both languages; the sources are NASA pages with a label and a date or a name', () => {
  for (const lang of ['en', 'vi']) {
    assert.ok(I.STR[lang]['lesson.isruMars.title'] && I.STR[lang]['lesson.isruMars.body'], lang);
    // the numbers sources.md A copied from NASA, in both languages: 122 g, 16 runs, 2021, 2023, 12 g an hour, 98 %
    for (const n of ['122', '16', '2021', '2023', '12', '98']) assert.ok(I.STR[lang]['lesson.isruMars.body'].includes(n), lang + ' ' + n);
  }
  assert.notEqual(I.STR.vi['lesson.isruMars.body'], I.STR.en['lesson.isruMars.body']);
  for (const id of ['isru', 'moxie', 'moxieInstruments', 'iceMap', 'lroIce', 'protonCeramics']) {
    const s = I.SOURCES[id];
    assert.ok(s && /\S/.test(s.label) && /^https:\/\/(www\.nasa\.gov|science\.nasa\.gov|www\.jpl\.nasa\.gov)\//.test(s.url), id);
  }
  assert.match(I.SOURCES.lroIce.label, /chemistry only/, 'the lunar page is only for the water-splitting chemistry (sources.md L2)');
  assert.match(I.SOURCES.protonCeramics.label, /research-fellowship project/, 'and a student project is not a NASA plan');
});

// ---------- M4d words: no draft left ----------

test("the solar-storm card's Take shelter hint says crew out on the surface still need cover from the flare (spec §13.12)", () => {
  // The card decides the day at the base; the map's flare is a danger of its own (§3.4), so nobody thinks their astronaut is safe.
  assert.match(I.STR.en['ev.spe.shelter.hint'], /surface.*cover/);
  assert.match(I.STR.vi['ev.spe.shelter.hint'], /bề mặt.*trú ẩn/);
});

test('every Vietnamese string keeps exactly the placeholders of its English twin', () => {
  const holes = s => [...new Set(String(s).match(/\{\w+\}/g) || [])].sort().join(' ');
  assert.deepEqual(Object.keys(I.STR.en).filter(k => holes(I.STR.en[k]) !== holes(I.STR.vi[k])), []);
});

test("the hints' · separator has a space on each side, in both languages", () => {
  for (const lang of ['en', 'vi']) assert.deepEqual(Object.keys(I.STR[lang]).filter(k => /\S·|·\S/.test(I.STR[lang][k])), [], lang);
});

test('no string in either language is still a draft, and no comment marks one as a draft', () => {
  const draft = /dry run|draft|nháp/i;
  for (const lang of ['en', 'vi']) assert.deepEqual(Object.keys(I.STR[lang]).filter(k => draft.test(I.STR[lang][k])), [], lang);
  const fs = require('node:fs'), path = require('node:path');
  const lines = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.js'), 'utf8').split('\n');
  assert.deepEqual(lines.map((l, i) => (i + 1) + ': ' + l.trim()).filter(l => draft.test(l)), [], 'src/i18n.js');
});

// R28: a new note in the surface's HUD column (210 px, 12 px Be Vietnam Pro) fits in two lines in English and three in
// Vietnamese, its placeholders filled. The browser pass measured about 28-32 characters a line; words wrap here at 28.
const linesAt28 = s => s.split(' ').reduce((out, w) => {
  if (out.length && (out[out.length - 1] + ' ' + w).length <= 28) out[out.length - 1] += ' ' + w;
  else out.push(w);
  return out;
}, []).length;

test("the surface's new HUD notes fit its 210 px column, their placeholders filled: two lines in English, three in Vietnamese (R28)", () => {
  const B = require('../src/data.js').EXPEDITION.beacon;
  for (const [lang, most] of [['en', 2], ['vi', 3]]) {
    assert.match(I.STR[lang]['eva.placed'], /\{r\}/, 'a placed beacon still says how near it refills a suit');
    assert.match(I.STR[lang]['eva.tookKit'], /\{n\}/, 'a packed kit still says how far out it goes');
    const name = I.t(lang, 'eva.beaconName', { n: B.max });
    const notes = { 'eva.placed': { name, r: B.refill }, 'eva.tookKit': { n: B.base }, 'eva.refillUsed': { name }, 'eva.refillUsedPod': {} };
    for (const [k, p] of Object.entries(notes)) {
      const s = I.t(lang, k, p);
      assert.ok(!/\{\w+\}/.test(s) && linesAt28(s) <= most, lang + ' ' + k + ', ' + linesAt28(s) + ' lines: ' + s);
    }
  }
});

test('the "Why Mars?" story has the same pages and sources in both languages, every source a NASA page', () => {
  assert.equal(I.STORY.en.length, 6);
  assert.deepEqual(I.STORY.vi.map(p => p.src), I.STORY.en.map(p => p.src));
  for (const lang of ['en', 'vi']) for (const p of I.STORY[lang]) {
    assert.ok(p.title && p.body.length > 100, lang + ': ' + p.title);
    for (const id of p.src) assert.match(I.SOURCES[id].url, /^https:\/\/([a-z0-9-]+\.)*nasa\.gov\//, id); // nasa.gov, science., jpl., ntrs.
  }
});

// M5 words: the check that fails on an empty value or a missing key, and one word for each thing in Vietnamese.
const allText = lang => [...Object.values(I.STR[lang]), ...I.NOTES[lang].flatMap(n => [n.title, n.body]), ...I.STORY[lang].flatMap(n => [n.title, n.body])];
const viText = allText('vi').join('\n').toLowerCase();

test('every key exists in both languages, and no value is empty', () => {
  for (const lang of ['en', 'vi']) {
    const other = lang === 'en' ? 'vi' : 'en';
    assert.deepEqual(Object.keys(I.STR[lang]).filter(k => !(k in I.STR[other])), [], 'missing in ' + other);
    assert.deepEqual(Object.keys(I.STR[lang]).filter(k => typeof I.STR[lang][k] !== 'string' || !I.STR[lang][k].trim()), [], 'empty in ' + lang);
    for (const list of [I.NOTES[lang], I.STORY[lang]]) for (const p of list) assert.ok(p.title.trim() && p.body.trim(), lang + ': ' + p.title);
  }
  assert.equal(I.NOTES.en.length, I.NOTES.vi.length);
  assert.equal(I.STORY.en.length, I.STORY.vi.length);
});

test('every {placeholder} in English is in the Vietnamese', () => {
  const ph = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const k of Object.keys(I.STR.en)) assert.deepEqual(ph(I.STR.vi[k] || ''), ph(I.STR.en[k]), k);
});

test('the Vietnamese says xe thám hiểm, never xe tự hành', () => assert.ok(!viText.includes('xe tự hành')));

test('the Vietnamese has one word each for the base, the beacon and methane', () => {
  for (const w of ['trụ sở', 'trạm tiếp sóng', 'mê-tan']) assert.ok(!viText.includes(w), w);
});

test('"Regions of Mars" comes before "What is simplified" in both languages', () => {
  for (const lang of ['en', 'vi']) {
    const titles = I.NOTES[lang].map(n => n.title), i = titles.findIndex(x => /^(Regions of Mars|Các vùng của sao Hỏa)$/.test(x)), j = titles.findIndex(x => /^(What is simplified|Điều gì đã được đơn giản hóa)$/.test(x));
    assert.ok(i >= 0 && j >= 0 && i < j, lang);
    assert.equal(j, titles.length - 1, lang + ': the disclaimer stays last');
  }
});

test('every I.SOURCES label has a Vietnamese form', () => {
  assert.deepEqual(Object.keys(I.SOURCES).filter(id => !(I.SOURCE_VI[id] || '').trim()), []);
  assert.deepEqual(Object.keys(I.SOURCE_VI).filter(id => !I.SOURCES[id]), [], 'no stray ids');
  assert.equal(I.srcLabel('vi', 'jezero'), I.SOURCE_VI.jezero);
  assert.equal(I.srcLabel('en', 'jezero'), I.SOURCES.jezero.label);
});

test('the Plains fact has a second source that says what Jezero means; the five role facts each have a source', () => {
  // https://science.nasa.gov/resource/how-does-nasa-name-things-on-mars-mars-report-june-2023/ says "Jezero ... which means lake in many Slavic languages".
  assert.equal(I.REGION_EXTRA_SOURCES.plains, 'marsNames');
  assert.match(I.SOURCES.marsNames.url, /how-does-nasa-name-things-on-mars-mars-report-june-2023\/$/);
  for (const [role, id] of Object.entries(I.ROLE_SOURCES)) for (const lang of ['en', 'vi']) {
    assert.ok(I.STR[lang]['role.' + role + '.fact'], lang + ' ' + role);
    assert.ok(I.SOURCES[id] && I.srcLabel(lang, id), id);
    assert.ok(I.STR[lang]['role.' + role + '.fact'].split(/s+/).length < 40, role + ' is short');
  }
  assert.ok(I.STR.en['role.commander.seat'] && I.STR.vi['role.commander.seat']);
  assert.doesNotMatch(I.STR.en['item.battery.fact'], /dark/, 'the page says the length of the day, not that half of it is dark');
});

test('help.11 takes its numbers from the data, and the summed report lines read right for any count', () => {
  for (const lang of ['en', 'vi']) assert.deepEqual([...I.STR[lang]['help.11'].matchAll(/{(w+)}/g)].map(m => m[1]).sort(), ['c', 'd', 's'], lang);
  assert.doesNotMatch(I.STR.en['haul.spares'] + I.STR.en['haul.o2'], /spare kit(?!s)|(a canister)/);
  assert.doesNotMatch(I.STR.en['eva.cond.flare'] + I.STR.en['eva.cond.flareHit'], /first of you|each/);
});
