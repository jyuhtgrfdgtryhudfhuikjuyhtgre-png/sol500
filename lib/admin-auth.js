'use strict';
/*
 * SOL 500 — who may use the admin panel.
 *   This PC:             the admin key. New on every start; only ever put into a page served to this PC.
 *   Other Wi-Fi devices: only while the host has switched Wi-Fi access on. They log in with a password (kept as an
 *                        scrypt hash in <dataDir>/admin.json) and get a session token for 8 hours.
 *   The share link:      never. lib/admin.js answers 404 before asking this module.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { readJson, writeJsonAtomic } = require('./jsonfile.js');

const scrypt = promisify(crypto.scrypt);
const COST = { N: 16384, r: 8, p: 1 };
const HASH_BYTES = 32;
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 20;
const OFF = { enabled: false, salt: null, hash: null, N: COST.N, r: COST.r, p: COST.p };

const digest = s => crypto.createHash('sha256').update(String(s == null ? '' : s)).digest();
// Constant-time compare that also hides the secret's length.
const sameSecret = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
const goodPassword = pw => typeof pw === 'string' && pw.length >= 8 && pw.length <= 64;

function createAdminAuth({ dataDir = null, key = null, now = Date.now, fsImpl = fs } = {}) {
  const adminKey = key || crypto.randomBytes(16).toString('hex');
  const file = dataDir ? path.join(dataDir, 'admin.json') : null;
  const sessions = new Map(); // token → expiry time, oldest first
  let settings = load();
  let epoch = 0;

  function load() {
    if (!file) return Object.assign({}, OFF);
    try {
      const s = readJson(file, null, fsImpl);
      if (s && typeof s.hash === 'string' && typeof s.salt === 'string' &&
          s.hash.match(/^[0-9a-f]{64}$/) && s.salt.match(/^[0-9a-f]{32}$/) &&
          s.N === COST.N && s.r === COST.r && s.p === COST.p) {
        return Object.assign({}, OFF, s, { enabled: !!s.enabled });
      }
    } catch (e) { /* unreadable: start with Wi-Fi access off */ }
    return Object.assign({}, OFF);
  }

  function persist() {
    if (!file) return;
    try { writeJsonAtomic(file, settings, fsImpl); } catch (e) { console.error('SOL 500: could not save the admin settings: ' + e.message); }
  }

  async function setPassword(pw) {
    if (typeof pw === 'string') pw = pw.normalize('NFC'); // combining-accent and precomposed typing are the same password
    if (!goodPassword(pw)) return { error: 'badPassword' };
    epoch++;
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(pw, salt, HASH_BYTES, COST);
    settings = Object.assign({}, settings, { salt: salt.toString('hex'), hash: hash.toString('hex'), N: COST.N, r: COST.r, p: COST.p });
    epoch++;
    sessions.clear();
    persist();
    return { ok: true };
  }

  function setEnabled(on) {
    if (on && !settings.hash) return { error: 'noPassword' };
    epoch++;
    settings = Object.assign({}, settings, { enabled: !!on });
    if (!on) sessions.clear();
    persist();
    return { ok: true };
  }

  async function login(pw) {
    if (!settings.enabled || !settings.hash) return { error: 'off' };
    if (typeof pw !== 'string') return { error: 'badPassword' };
    pw = pw.normalize('NFC');
    if (pw.length > 64) return { error: 'badPassword' };
    const snap = settings;
    const snapEpoch = epoch;
    const want = Buffer.from(snap.hash, 'hex');
    let got;
    try {
      got = await scrypt(pw, Buffer.from(snap.salt, 'hex'), HASH_BYTES, { N: snap.N, r: snap.r, p: snap.p });
    } catch (e) {
      return { error: 'badPassword' };
    }
    if (epoch !== snapEpoch) return !settings.enabled ? { error: 'off' } : { error: 'badPassword' };
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { error: 'badPassword' };
    if (!settings.enabled) return { error: 'off' }; // switched off while the hash was being worked out
    const t = now();
    for (const [tok, exp] of sessions) if (exp <= t) sessions.delete(tok);
    while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    const token = crypto.randomBytes(16).toString('hex');
    sessions.set(token, t + SESSION_MS);
    return { token, expiresAt: t + SESSION_MS };
  }

  function sessionValid(token) {
    if (typeof token !== 'string' || !sessions.has(token)) return false;
    if (sessions.get(token) <= now()) { sessions.delete(token); return false; }
    return true;
  }

  // What this request may do: 'local' (this PC), 'lan' (a logged-in Wi-Fi device) or null.
  function authorize(cls, token) {
    if (cls === 'local') return sameSecret(token, adminKey) ? 'local' : null;
    if (cls === 'lan') return settings.enabled && sessionValid(token) ? 'lan' : null;
    return null;
  }

  function wifi() {
    const t = now();
    return { enabled: !!settings.enabled, hasPassword: !!settings.hash, sessions: [...sessions.values()].filter(e => e > t).length };
  }

  return { key: adminKey, authorize, login, setPassword, setEnabled, logoutAll: () => sessions.clear(), wifi };
}

module.exports = { createAdminAuth };
