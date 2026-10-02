'use strict';
/*
 * SOL 500 — mission history for the admin panel: <dataDir>/history.json, newest first, at most `cap` records.
 * Without a dataDir (tests, or a server created from code) the history lives in memory only.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('../src/engine.js');
const D = require('../src/data.js');
const { readJson, writeJsonAtomic } = require('./jsonfile.js');

const MODES = ['solo', 'lan', 'online'];
const CAUSES = ['hypoxia', 'dehydration', 'starvation', 'cold', 'habFault', 'radiationSickness', 'injury', 'rations', 'health'];
const CSV_COLUMNS = ['endedAt', 'mode', 'missionCode', 'difficulty', 'crewSize', 'players', 'outcome', 'cause', 'score', 'grade', 'sols', 'achievements'];

const roleOf = id => (D.CREW.find(c => c.id === id) || {}).role || null;
const cleanName = n => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);

// A solo mission arrives from a browser that ran its own simulation: check its shape before scoring it.
function validMission(m) {
  if (!m || typeof m !== 'object' || m.version !== 2) return false;
  if (!['success', 'lost'].includes(m.status)) return false;
  if (typeof m.seed !== 'string' || !m.seed || m.seed.length > 24) return false;
  if (!Object.prototype.hasOwnProperty.call(D.DIFFICULTY, m.difficulty) || !D.CREW_SIZES.includes(m.crewSize)) return false;
  if (!Number.isInteger(m.turn) || m.turn < 1 || m.turn > D.TURNS) return false;
  if (![m.sol, m.science, m.mass].every(Number.isFinite)) return false;
  if (!Array.isArray(m.crew) || m.crew.length !== m.crewSize) return false;
  const ids = D.CREW.map(c => c.id);
  const crewOk = c => c && ids.includes(c.id) && Number.isFinite(c.health) && Number.isFinite(c.dose) && ['active', 'down', 'dead'].includes(c.status);
  if (!m.crew.every(crewOk)) return false;
  if (m.pilot != null && !(typeof m.pilot === 'string' && m.crew.some(c => c.id === m.pilot))) return false;
  if (!m.totals || !m.depot || !m.modules || !m.modules.shield || !Array.isArray(m.schedule)) return false;
  try { E.scoreMission(m); E.achievements(m); } catch (e) { return false; }
  return true;
}

// One history record. players: [{ name, crewId }], the co-op seats or the solo player.
function summarize(mission, { mode, players } = {}) {
  const score = E.scoreMission(mission);
  const reason = mission.endCause && mission.endCause.reason;
  return {
    id: crypto.randomBytes(6).toString('hex'),
    endedAt: new Date().toISOString(),
    mode: MODES.includes(mode) ? mode : 'solo',
    missionCode: String(mission.seed).slice(0, 24),
    difficulty: mission.difficulty,
    crewSize: mission.crewSize,
    players: (players || []).slice(0, 5).map(p => ({ name: cleanName(p.name) || '?', crewId: roleOf(p.crewId) ? p.crewId : null, role: roleOf(p.crewId) })),
    outcome: mission.status,
    cause: mission.status === 'lost' ? (CAUSES.includes(reason) ? reason : 'health') : null,
    score: score.total,
    grade: score.grade,
    sols: mission.sol,
    finds: {},
    distance: {},
    explore: { regions: 0, landmarks: 0, structures: 0, beacons: 0, goals: 0 },
    achievements: E.achievements(mission),
  };
}

function createHistory({ dataDir = null, cap = 2000, fsImpl = fs } = {}) {
  const file = dataDir ? path.join(dataDir, 'history.json') : null;
  let records = load();

  function load() {
    if (!file) return [];
    try {
      const list = readJson(file, [], fsImpl);
      if (Array.isArray(list)) return list.filter(r => r && typeof r.id === 'string').slice(0, cap);
    } catch (e) {
      // A transient read error (antivirus holding the file) says nothing about the content: keep the file as it is.
      if (e.code !== 'BAD_JSON') { console.error('SOL 500: could not read the mission history: ' + e.message); return []; }
    }
    try { fsImpl.renameSync(file, path.join(dataDir, 'history.corrupt-' + Date.now() + '.json')); } catch (e) { /* ignore */ }
    return [];
  }

  // A full disk or a read-only folder must never break a game: keep the records in memory and say so in the log.
  function persist() {
    if (!file) return;
    try { writeJsonAtomic(file, records, fsImpl); } catch (e) { console.error('SOL 500: could not save the mission history: ' + e.message); }
  }

  return {
    list: () => records.slice(),
    add(record) {
      records.unshift(record);
      if (records.length > cap) records.length = cap;
      persist();
      return record;
    },
    remove(id) {
      const before = records.length;
      records = records.filter(r => r.id !== id);
      if (records.length === before) return false;
      persist();
      return true;
    },
    clear() { records = []; persist(); },
  };
}

// Text cells starting with = + - @ (or a tab or CR) would run as formulas in Excel: prefix them with '.
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function toCSV(records) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const r of records) {
    rows.push(CSV_COLUMNS.map(k => {
      if (k === 'players') return csvCell((r.players || []).map(p => p.name + (p.role ? ' (' + p.role + ')' : '')).join('; '));
      if (k === 'achievements') return csvCell((r.achievements || []).join(' '));
      return csvCell(r[k]);
    }).join(','));
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}

module.exports = { createHistory, summarize, validMission, toCSV, CAUSES };
