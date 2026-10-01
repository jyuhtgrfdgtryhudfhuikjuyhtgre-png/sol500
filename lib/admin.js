'use strict';
/*
 * SOL 500 — the admin panel's page and API (spec §8). Everything here answers 404 to the share link, and to other
 * Wi-Fi devices unless the host has switched Wi-Fi access on.
 *   GET  /admin                    the page; for this PC the server writes the admin key into it
 *   POST /api/admin/login          Wi-Fi devices: password → session token
 *   GET  /api/admin/whoami         who you are and the Wi-Fi access state
 *   POST /api/admin/wifi           set the password / switch Wi-Fi access (this PC only)
 *   POST /api/admin/wifi/logout    log out every Wi-Fi admin (this PC only)
 *   GET  /api/admin/history        finished missions, newest first
 *   GET  /api/admin/history.csv    the same as a CSV download
 *   POST /api/admin/history/delete remove one record {id}
 *   POST /api/admin/history/clear  remove every record
 *   GET  /api/admin/live           rooms, players, recent events, the share link
 *   POST /api/admin/kick           remove a player {code, playerId}
 *   POST /api/admin/close          close a room {code}
 *   GET  /api/admin/progress       the project progress snapshot
 *   POST /api/admin/progress/refresh  rebuild that snapshot (this PC only, from source)
 *   POST /api/history/solo         the game records a finished solo mission (this PC and Wi-Fi devices; 404 via the share link)
 */
const fs = require('node:fs');
const path = require('node:path');
const { send, readBody } = require('./http.js');
const { createAdminAuth } = require('./admin-auth.js');
const { createLimiter } = require('./limits.js');
const { spawn } = require('node:child_process');
const { createHistory, summarize, validMission, toCSV } = require('./history.js');

const ROOT = path.join(__dirname, '..');
const LOGGED = ['type', 'at', 'code', 'name', 'remote', 'round', 'sol', 'outcome', 'reason'];
const PAGE = path.join(ROOT, 'admin.html');
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com', "img-src 'self' data:", "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');

// Re-runs tools/progress.js. Inside the Electron app (from source) process.execPath is Electron itself, so
// ELECTRON_RUN_AS_NODE makes it behave like plain Node.
function runProgress(outFile) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'progress.js'), '--out', outFile], {
      cwd: ROOT, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }), stdio: 'ignore', windowsHide: true,
    });
    child.on('error', () => resolve(false));
    child.on('exit', code => resolve(code === 0));
  });
}

function createAdmin({
  dataDir = null, adminKey = null, rooms = null, history = createHistory(), progressFile = path.join(ROOT, 'progress.json'),
  allowProgressRefresh = false, info = () => ({ port: null, addresses: [] }),
} = {}) {
  const auth = createAdminAuth({ dataDir, key: adminKey });
  const startedAt = Date.now();
  const events = [];
  let online = null;
  let refreshing = null;
  const soloLimit = createLimiter({ limit: 10, windowMs: 60 * 1000 });
  const loginMinute = createLimiter({ limit: 5, windowMs: 60 * 1000 });
  const loginHour = createLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });
  const routes = new Map();

  function log(ev) {
    const entry = {};
    for (const k of LOGGED) if (ev[k] !== undefined) entry[k] = ev[k];
    events.unshift(entry);
    if (events.length > 100) events.length = 100;
  }

  // Room events from lib/rooms.js: a finished co-op mission goes into the history; everything goes into the log.
  function onRoomEvent(ev) {
    if (ev.type === 'missionEnded') {
      try { history.add(summarize(ev.mission, { mode: ev.mode, players: ev.players })); } catch (e) { console.error('SOL 500: could not record a mission: ' + e.message); }
    }
    log(ev);
  }

  function setOnline(o) {
    online = o && o.url ? { url: String(o.url), qr: typeof o.qr === 'string' && o.qr.startsWith('data:image/') ? o.qr : null } : null;
  }

  async function soloHistory(req, res, cls, ip) {
    if (req.method !== 'POST') { send(res, 404, { error: 'notFound' }); return; }
    if (!soloLimit.hit(ip)) { send(res, 429, { error: 'slowDown' }); return; }
    // Only a JSON post: a cross-origin text/plain "simple request" would skip the browser's preflight.
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) { send(res, 415, { error: 'badType' }); return; }
    const body = await readBody(req);
    if (!validMission(body.mission)) { send(res, 400, { error: 'badMission' }); return; }
    const m = body.mission;
    const rec = history.add(summarize(m, { mode: 'solo', players: [{ name: body.player || 'Solo', crewId: m.pilot || null }] }));
    log({ type: 'soloRecorded', at: Date.now(), name: rec.players[0].name, outcome: rec.outcome, remote: cls === 'lan' });
    send(res, 200, { ok: true, id: rec.id });
  }

  // who: 'admin' = this PC or a logged-in Wi-Fi admin; 'local' = this PC only.
  function route(method, p, who, fn) { routes.set(method + ' ' + p, { who, fn }); }

  function page(res, cls) {
    fs.readFile(PAGE, 'utf8', (err, html) => {
      if (err) { send(res, 404, { error: 'notFound' }); return; }
      const out = html
        .replace('<meta name="sol-admin-key" content="">', '<meta name="sol-admin-key" content="' + (cls === 'local' ? auth.key : '') + '">')
        .replace('<meta name="sol-admin-mode" content="">', '<meta name="sol-admin-mode" content="' + cls + '">');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP,
      });
      res.end(out);
    });
  }

  async function login(req, res, cls, ip) {
    if (cls !== 'lan') { send(res, 400, { error: 'notNeeded' }); return; }
    if (!loginMinute.hit(ip) || !loginHour.hit(ip)) { send(res, 429, { error: 'slowDown' }); return; }
    const body = await readBody(req);
    const r = await auth.login(body.password);
    if (r.error === 'off') { send(res, 404, { error: 'notFound' }); return; }
    if (r.error) { send(res, 401, { error: 'badPassword' }); return; }
    send(res, 200, r);
  }

  route('GET', '/api/admin/whoami', 'admin', ({ res, role }) => send(res, 200, { role, wifi: auth.wifi() }));
  route('POST', '/api/admin/wifi', 'local', async ({ res, body }) => {
    if (body.password != null) {
      const r = await auth.setPassword(body.password);
      if (r.error) { send(res, 400, r); return; }
    }
    if (body.enabled != null) {
      const r = auth.setEnabled(!!body.enabled);
      if (r.error) { send(res, 400, r); return; }
    }
    send(res, 200, auth.wifi());
  });
  route('POST', '/api/admin/wifi/logout', 'local', ({ res }) => { auth.logoutAll(); send(res, 200, auth.wifi()); });

  const done = (res, ok) => (ok ? send(res, 200, { ok: true }) : send(res, 404, { error: 'notFound' }));
  route('GET', '/api/admin/history', 'admin', ({ res }) => send(res, 200, { records: history.list() }));
  route('GET', '/api/admin/history.csv', 'admin', ({ res }) => {
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sol500-history.csv"', 'Cache-Control': 'no-store' });
    res.end(toCSV(history.list()));
  });
  route('POST', '/api/admin/history/delete', 'admin', ({ res, body }) => done(res, history.remove(String(body.id || ''))));
  route('POST', '/api/admin/history/clear', 'admin', ({ res }) => { history.clear(); done(res, true); });
  route('GET', '/api/admin/live', 'admin', ({ res, role }) => {
    const i = info();
    send(res, 200, {
      role, uptime: Math.round((Date.now() - startedAt) / 1000), port: i.port, addresses: i.addresses,
      online, rooms: rooms ? rooms.snapshot() : [], events: events.slice(), wifi: auth.wifi(),
    });
  });
  route('POST', '/api/admin/kick', 'admin', ({ res, body }) => done(res, !!rooms && rooms.kick(body.code, String(body.playerId || ''))));
  route('POST', '/api/admin/close', 'admin', ({ res, body }) => done(res, !!rooms && rooms.close(body.code)));
  route('GET', '/api/admin/progress', 'admin', ({ res }) => new Promise(resolve => {
    fs.readFile(progressFile, 'utf8', (err, text) => {
      let data = null;
      if (!err) { try { data = JSON.parse(text); } catch (e) { /* treat as missing */ } }
      if (data && typeof data === 'object') send(res, 200, Object.assign(data, { refreshable: allowProgressRefresh }));
      else send(res, 404, { error: 'noProgress', refreshable: allowProgressRefresh });
      resolve();
    });
  }));
  route('POST', '/api/admin/progress/refresh', 'local', async ({ res }) => {
    if (!allowProgressRefresh) { send(res, 409, { error: 'notAvailable' }); return; }
    if (refreshing) { send(res, 409, { error: 'busy' }); return; }
    refreshing = runProgress(progressFile);
    const ok = await refreshing;
    refreshing = null;
    if (ok) send(res, 200, { ok: true }); else send(res, 500, { error: 'failed' });
  });

  // true when the request was an admin request and has been answered.
  async function handle(req, res, url, cls, ip) {
    const p = url.pathname;
    if (p !== '/admin' && !p.startsWith('/api/admin/') && p !== '/api/history/solo') return false;
    const notFound = () => send(res, 404, { error: 'notFound' });
    if (cls === 'remote') { notFound(); return true; }
    if (p === '/api/history/solo') { await soloHistory(req, res, cls, ip); return true; }
    if (cls === 'lan' && !auth.wifi().enabled) { notFound(); return true; }
    if (req.method === 'GET' && p === '/admin') { page(res, cls); return true; }
    if (req.method === 'POST' && p === '/api/admin/login') { await login(req, res, cls, ip); return true; }
    const r = routes.get(req.method + ' ' + p);
    if (!r) { notFound(); return true; }
    const role = auth.authorize(cls, req.headers['x-admin-key']);
    if (!role) { send(res, 401, { error: 'unauthorized' }); return true; }
    if (r.who === 'local' && role !== 'local') { send(res, 403, { error: 'localOnly' }); return true; }
    const body = req.method === 'POST' ? await readBody(req) : null;
    await r.fn({ req, res, role, body, url });
    return true;
  }

  return { key: auth.key, handle, route, setOnline, onRoomEvent };
}

module.exports = { createAdmin };
