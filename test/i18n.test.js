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

test('the Plains fact cites a page from after the landing and claims nothing that page does not say', () => {
  // https://www.jpl.nasa.gov/news/touchdown-nasas-mars-perseverance-rover-safely-lands-on-red-planet/ (Feb. 18, 2021) says
  // "has touched down at Jezero Crater", "Some 28 miles (45 kilometers) wide" and "3.5 billion years ago the crater had its
  // own river delta and was filled with water". It does not say what the word "Jezero" means.
  assert.match(I.SOURCES.jezero.url, /\/touchdown-nasas-mars-perseverance-rover-safely-lands-on-red-planet\/$/);
  for (const lang of ['en', 'vi']) {
    const fact = I.STR[lang]['region.fact.plains'];
    assert.match(fact, /45/, lang + ': the width');
    assert.match(fact, /3[.,]5/, lang + ': the age');
    assert.doesNotMatch(fact, /slav/i, lang + ': the meaning of the name is not on that page');
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
