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

const { finishedMission } = require('./helpers/missions.js');
const K = srv => ({ 'x-admin-key': srv.adminKey });

test('solo missions from this PC and Wi-Fi devices are recorded; the share link and junk are refused', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const m = finishedMission();
  assert.equal((await call(port, 'local', 'POST', '/api/history/solo', { body: { mission: m, player: 'Linh' } })).status, 200);
  const lan = await call(port, 'lan', 'POST', '/api/history/solo', { body: { mission: m, player: 'Bảo' } });
  assert.equal(lan.status, 200, 'Wi-Fi devices record solo games even with Wi-Fi admin access off');
  assert.match(lan.json.id, /^[0-9a-f]{12}$/);
  assert.equal((await call(port, 'remote', 'POST', '/api/history/solo', { body: { mission: m } })).status, 404);
  assert.equal((await call(port, 'local', 'POST', '/api/history/solo', { body: { mission: Object.assign({}, m, { status: 'active' }) } })).status, 400);
  assert.equal((await call(port, 'local', 'GET', '/api/history/solo')).status, 404);
  const list = (await call(port, 'local', 'GET', '/api/admin/history', { headers: K(srv) })).json.records;
  assert.deepEqual(list.map(r => [r.mode, r.players[0].name]), [['solo', 'Bảo'], ['solo', 'Linh']]);
});

test('solo recording is slowed to 10 a minute per device', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call(port, 'lan', 'POST', '/api/history/solo', { body: { mission: null } })).status);
  assert.deepEqual(codes, [...Array(10).fill(400), 429]);
});

test('history can be listed, exported as CSV, and deleted one by one or all at once', async t => {
  const dir = tmp(t);
  const { srv, port } = await start({ dataDir: dir });
  t.after(() => srv.close());
  for (const name of ['A', 'B']) await call(port, 'local', 'POST', '/api/history/solo', { body: { mission: finishedMission(), player: name } });
  const csv = await call(port, 'local', 'GET', '/api/admin/history.csv', { headers: K(srv) });
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /attachment; filename="sol500-history\.csv"/);
  assert.equal(csv.text.split('\r\n').filter(Boolean).length, 3, 'header + 2 rows');
  const [first] = (await call(port, 'local', 'GET', '/api/admin/history', { headers: K(srv) })).json.records;
  assert.equal((await call(port, 'local', 'POST', '/api/admin/history/delete', { headers: K(srv), body: { id: first.id } })).status, 200);
  assert.equal((await call(port, 'local', 'POST', '/api/admin/history/delete', { headers: K(srv), body: { id: first.id } })).status, 404);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8')).length, 1);
  await call(port, 'local', 'POST', '/api/admin/history/clear', { headers: K(srv) });
  assert.deepEqual((await call(port, 'local', 'GET', '/api/admin/history', { headers: K(srv) })).json.records, []);
});

test('a co-op mission is recorded when it ends, as online when anyone came through the share link', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const host = (await call(port, 'local', 'POST', '/api/room/create', { body: { name: 'Host' } })).json;
  const far = (await call(port, 'remote', 'POST', '/api/room/join', { body: { code: host.code, name: '<i>Nguyễn Ánh</i>' } })).json;
  const act = (as, s, type, extra) => call(port, as, 'POST', '/api/room/act', { body: Object.assign({ code: s.code, player: s.playerId, token: s.token, type }, extra) });
  await act('local', host, 'claim', { crewId: 'lena' });
  await act('remote', far, 'claim', { crewId: 'minh' });
  assert.equal((await act('local', host, 'launch')).status, 200);
  let rec = [];
  for (let i = 0; i < 25 && !rec.length; i++) {
    await act('local', host, 'advance');
    rec = (await call(port, 'local', 'GET', '/api/admin/history', { headers: K(srv) })).json.records;
  }
  assert.equal(rec.length, 1);
  assert.equal(rec[0].mode, 'online');
  assert.deepEqual(rec[0].players.map(p => [p.name, p.role]), [['Host', 'engineer'], ['iNguyễn Ánh/i', 'biologist']], 'markup stripped, diacritics kept');
});

test('the live view shows rooms, players, recent events and the share link', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const host = (await call(port, 'local', 'POST', '/api/room/create', { body: { name: 'Linh' } })).json;
  await call(port, 'remote', 'POST', '/api/room/join', { body: { code: host.code, name: 'Far' } });
  let live = (await call(port, 'local', 'GET', '/api/admin/live', { headers: K(srv) })).json;
  assert.equal(live.role, 'local');
  assert.equal(live.port, port);
  assert.ok(Number.isInteger(live.uptime));
  assert.ok(Array.isArray(live.addresses));
  assert.equal(live.online, null);
  assert.deepEqual(live.rooms[0].players.map(p => [p.name, p.remote]), [['Linh', false], ['Far', true]]);
  assert.deepEqual(live.events.map(e => e.type), ['playerJoined', 'roomCreated'], 'newest first');
  assert.deepEqual(Object.keys(live.events[0]).sort(), ['at', 'code', 'name', 'remote', 'type']);
  assert.deepEqual(live.wifi, { enabled: false, hasPassword: false, sessions: 0 });
  srv.setOnline({ url: 'https://quiet-river.trycloudflare.com', qr: 'data:image/png;base64,AAAA' });
  live = (await call(port, 'local', 'GET', '/api/admin/live', { headers: K(srv) })).json;
  assert.deepEqual(live.online, { url: 'https://quiet-river.trycloudflare.com', qr: 'data:image/png;base64,AAAA' });
  srv.setOnline({ url: 'https://x.trycloudflare.com', qr: 'javascript:alert(1)' });
  assert.equal((await call(port, 'local', 'GET', '/api/admin/live', { headers: K(srv) })).json.online.qr, null, 'only data: images');
  srv.setOnline(null);
  assert.equal((await call(port, 'local', 'GET', '/api/admin/live', { headers: K(srv) })).json.online, null);
});

test('kick and close reach the players over their live sockets', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const host = (await call(port, 'local', 'POST', '/api/room/create', { body: { name: 'Host' } })).json;
  const guest = (await call(port, 'local', 'POST', '/api/room/join', { body: { code: host.code, name: 'Guest' } })).json;
  const open = s => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws?' + new URLSearchParams({ code: s.code, player: s.playerId, token: s.token }));
    ws.got = [];
    ws.done = new Promise(resolve => ws.addEventListener('close', resolve));
    ws.ready = new Promise(resolve => ws.addEventListener('message', resolve, { once: true }));
    ws.addEventListener('message', e => ws.got.push(JSON.parse(e.data)));
    return ws;
  };
  const hws = open(host);
  const gws = open(guest);
  await Promise.all([hws.ready, gws.ready]);
  assert.equal((await call(port, 'local', 'POST', '/api/admin/kick', { headers: K(srv), body: { code: host.code, playerId: guest.playerId } })).status, 200);
  await gws.done;
  assert.deepEqual(gws.got.at(-1), { t: 'event', d: { kind: 'kicked' } });
  assert.equal((await call(port, 'local', 'POST', '/api/admin/kick', { headers: K(srv), body: { code: host.code, playerId: guest.playerId } })).status, 404);
  assert.equal((await call(port, 'local', 'POST', '/api/admin/close', { headers: K(srv), body: { code: host.code } })).status, 200);
  await hws.done;
  assert.deepEqual(hws.got.at(-1), { t: 'event', d: { kind: 'closed' } });
  assert.equal((await call(port, 'local', 'POST', '/api/admin/close', { headers: K(srv), body: { code: host.code } })).status, 404);
  const types = (await call(port, 'local', 'GET', '/api/admin/live', { headers: K(srv) })).json.events.map(e => e.type);
  assert.deepEqual(types.slice(0, 2), ['roomClosed', 'playerKicked']);
});

test('project progress is read from the snapshot file; refreshing it is for a developer on this PC only', async t => {
  const dir = tmp(t);
  const file = path.join(dir, 'progress.json');
  const { srv, port } = await start({ progressFile: file });
  t.after(() => srv.close());
  const none = await call(port, 'local', 'GET', '/api/admin/progress', { headers: K(srv) });
  assert.deepEqual([none.status, none.json], [404, { error: 'noProgress', refreshable: false }]);
  fs.writeFileSync(file, JSON.stringify({ generatedAt: '2026-10-01T00:00:00.000Z', features: [] }));
  const got = await call(port, 'local', 'GET', '/api/admin/progress', { headers: K(srv) });
  assert.deepEqual(got.json, { generatedAt: '2026-10-01T00:00:00.000Z', features: [], refreshable: false });
  assert.deepEqual((await call(port, 'local', 'POST', '/api/admin/progress/refresh', { headers: K(srv) })).json, { error: 'notAvailable' });
});

test('solo records are only taken from JSON posts, so another web page cannot forge them', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const m = finishedMission();
  const text = await call(port, 'lan', 'POST', '/api/history/solo', { headers: { 'content-type': 'text/plain' }, body: { mission: m } });
  assert.equal(text.status, 415);
  assert.deepEqual(text.json, { error: 'badType' });
  const cs = await call(port, 'lan', 'POST', '/api/history/solo', { headers: { 'content-type': 'application/json; charset=utf-8' }, body: { mission: m } });
  assert.equal(cs.status, 200);
});

test('a solo post whose pilot is not one of its crew is refused, and nothing is recorded', async t => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const m = finishedMission();
  for (const pilot of ['p'.repeat(5000), { a: 1 }, 'kai']) {
    const r = await call(port, 'local', 'POST', '/api/history/solo', { body: { mission: Object.assign({}, m, { pilot }) } });
    assert.equal(r.status, 400);
  }
  const ok = await call(port, 'local', 'POST', '/api/history/solo', { body: { mission: Object.assign({}, m, { pilot: 'diego' }) } });
  assert.equal(ok.status, 200);
  const list = (await call(port, 'local', 'GET', '/api/admin/history', { headers: K(srv) })).json.records;
  assert.deepEqual(list.map(r => r.players[0].crewId), ['diego']);
});
