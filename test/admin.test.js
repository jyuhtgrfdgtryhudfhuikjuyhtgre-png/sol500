'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createServer } = require('../server.js');

function start(opts) {
  return new Promise(resolve => {
    const srv = createServer(opts);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}
function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-admin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
// Every test request really comes from this PC. The Host header and Cloudflare's header decide what it looks like:
//   local  = Host localhost; lan = Host is a LAN address (on a real network the socket is the LAN device's own);
//   remote = through the share link.
const AS = {
  local: port => ({ host: 'localhost:' + port }),
  lan: port => ({ host: '192.168.1.5:' + port }),
  remote: () => ({ host: 'quiet-river.trycloudflare.com', 'cf-connecting-ip': '203.0.113.7' }),
};
function call(port, as, method, p, { headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const h = Object.assign({}, AS[as](port), data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}, headers);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: h }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* the page or a CSV */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const PW = 'mars rocks 2026';
async function wifiOn(port, srv) {
  const r = await call(port, 'local', 'POST', '/api/admin/wifi', { headers: { 'x-admin-key': srv.adminKey }, body: { password: PW, enabled: true } });
  assert.equal(r.status, 200);
}

test('this PC gets the admin page with the key inside; Wi-Fi devices and the share link never see it', async t => {
  const { srv, port } = await start({ adminKey: 'k'.repeat(32) });
  t.after(() => srv.close());
  const local = await call(port, 'local', 'GET', '/admin');
  assert.equal(local.status, 200);
  assert.match(local.headers['content-type'], /text\/html/);
  assert.match(local.text, /<meta name="sol-admin-key" content="k{32}">/);
  assert.match(local.text, /<meta name="sol-admin-mode" content="local">/);
  assert.equal(local.headers['cache-control'], 'no-store');
  assert.match(local.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(local.headers['x-frame-options'], 'DENY');
  for (const as of ['lan', 'remote']) {
    const r = await call(port, as, 'GET', '/admin');
    assert.equal(r.status, 404, as);
    assert.ok(!r.text.includes('k'.repeat(32)), as);
  }
  assert.equal((await call(port, 'local', 'GET', '/admin.html')).status, 404, 'never served as a plain file');
});

test('the share link gets 404 from every admin path, even with the key and Wi-Fi access on', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  await wifiOn(port, srv);
  for (const [m, p] of [['GET', '/admin'], ['GET', '/api/admin/whoami'], ['POST', '/api/admin/login'], ['POST', '/api/admin/wifi'], ['GET', '/api/admin/nope']]) {
    const r = await call(port, 'remote', m, p, { headers: { 'x-admin-key': srv.adminKey }, body: m === 'POST' ? { password: PW } : null });
    assert.equal(r.status, 404, m + ' ' + p);
  }
});

test('this PC needs the key for the API', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  assert.match(srv.adminKey, /^[0-9a-f]{32}$/);
  assert.equal((await call(port, 'local', 'GET', '/api/admin/whoami')).status, 401);
  assert.equal((await call(port, 'local', 'GET', '/api/admin/whoami', { headers: { 'x-admin-key': 'wrong' } })).status, 401);
  const ok = await call(port, 'local', 'GET', '/api/admin/whoami', { headers: { 'x-admin-key': srv.adminKey } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { role: 'local', wifi: { enabled: false, hasPassword: false, sessions: 0 } });
  assert.equal((await call(port, 'local', 'GET', '/api/admin/nope', { headers: { 'x-admin-key': srv.adminKey } })).status, 404);
});

test('with Wi-Fi access on, another device logs in and uses the API, but cannot change the settings', async t => {
  const dir = tmp(t);
  const { srv, port } = await start({ dataDir: dir });
  t.after(() => srv.close());
  const K = { 'x-admin-key': srv.adminKey };
  assert.equal((await call(port, 'lan', 'POST', '/api/admin/login', { body: { password: PW } })).status, 404, 'off by default');
  assert.equal((await call(port, 'local', 'POST', '/api/admin/wifi', { headers: K, body: { enabled: true } })).json.error, 'noPassword');
  assert.equal((await call(port, 'local', 'POST', '/api/admin/wifi', { headers: K, body: { password: 'short' } })).status, 400);
  const on = await call(port, 'local', 'POST', '/api/admin/wifi', { headers: K, body: { password: PW, enabled: true } });
  assert.deepEqual(on.json, { enabled: true, hasPassword: true, sessions: 0 });
  const page = await call(port, 'lan', 'GET', '/admin');
  assert.equal(page.status, 200);
  assert.match(page.text, /<meta name="sol-admin-key" content="">/);
  assert.match(page.text, /<meta name="sol-admin-mode" content="lan">/);
  assert.equal((await call(port, 'lan', 'GET', '/api/admin/whoami', { headers: K })).status, 401, 'the PC key is no use from another device');
  assert.equal((await call(port, 'lan', 'POST', '/api/admin/login', { body: { password: 'wrong password' } })).status, 401);
  assert.equal((await call(port, 'local', 'POST', '/api/admin/login', { body: { password: PW } })).status, 400, 'this PC does not log in');
  const login = await call(port, 'lan', 'POST', '/api/admin/login', { body: { password: PW } });
  assert.equal(login.status, 200);
  const S = { 'x-admin-key': login.json.token };
  assert.equal((await call(port, 'lan', 'GET', '/api/admin/whoami', { headers: S })).json.role, 'lan');
  assert.equal((await call(port, 'lan', 'POST', '/api/admin/wifi', { headers: S, body: { enabled: false } })).status, 403);
  assert.equal((await call(port, 'lan', 'POST', '/api/admin/wifi/logout', { headers: S })).status, 403);
  assert.equal((await call(port, 'local', 'GET', '/api/admin/whoami', { headers: S })).status, 401, 'a session token is not the PC key');
  await call(port, 'local', 'POST', '/api/admin/wifi', { headers: K, body: { enabled: false } });
  assert.equal((await call(port, 'lan', 'GET', '/api/admin/whoami', { headers: S })).status, 404, 'switched off: gone again');
  assert.ok(!fs.readFileSync(path.join(dir, 'admin.json'), 'utf8').includes(PW), 'the password itself is never stored');
});

test('password guessing from another device is slowed to 5 tries a minute', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  await wifiOn(port, srv);
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call(port, 'lan', 'POST', '/api/admin/login', { body: { password: 'nope nope ' + i } })).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 429]);
});

test('the game learns it may show an Admin button only on this PC', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  assert.equal((await call(port, 'local', 'GET', '/api/info')).json.adminHere, true);
  assert.equal((await call(port, 'lan', 'GET', '/api/info')).json.adminHere, false);
  assert.equal((await call(port, 'remote', 'GET', '/api/info')).json.adminHere, false);
});

test('an admin request body over 64 KB is refused without crashing', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const r = await call(port, 'local', 'POST', '/api/admin/wifi', { headers: { 'x-admin-key': srv.adminKey }, body: { password: 'x'.repeat(70 * 1024) } });
  assert.equal(r.status, 413);
  assert.equal((await call(port, 'local', 'GET', '/api/info')).status, 200);
});
