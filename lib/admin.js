'use strict';
/*
 * SOL 500 — the admin panel's page and API (spec §8). Everything here answers 404 to the share link, and to other
 * Wi-Fi devices unless the host has switched Wi-Fi access on.
 *   GET  /admin                    the page; for this PC the server writes the admin key into it
 *   POST /api/admin/login          Wi-Fi devices: password → session token
 *   GET  /api/admin/whoami         who you are and the Wi-Fi access state
 *   POST /api/admin/wifi           set the password / switch Wi-Fi access (this PC only)
 *   POST /api/admin/wifi/logout    log out every Wi-Fi admin (this PC only)
 */
const fs = require('node:fs');
const path = require('node:path');
const { send, readBody } = require('./http.js');
const { createAdminAuth } = require('./admin-auth.js');
const { createLimiter } = require('./limits.js');

const PAGE = path.join(__dirname, '..', 'admin.html');
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com', "img-src 'self' data:", "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');

function createAdmin({ dataDir = null, adminKey = null } = {}) {
  const auth = createAdminAuth({ dataDir, key: adminKey });
  const loginMinute = createLimiter({ limit: 5, windowMs: 60 * 1000 });
  const loginHour = createLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });
  const routes = new Map();

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

  // true when the request was an admin request and has been answered.
  async function handle(req, res, url, cls, ip) {
    const p = url.pathname;
    if (p !== '/admin' && !p.startsWith('/api/admin/')) return false;
    const notFound = () => send(res, 404, { error: 'notFound' });
    if (cls === 'remote') { notFound(); return true; }
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

  return { key: auth.key, handle, route };
}

module.exports = { createAdmin };
