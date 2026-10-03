'use strict';
const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.js');

function start() {
  return new Promise(resolve => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}
async function post(base, path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
const act = (base, s, type, payload) => post(base, '/api/room/act', Object.assign({ code: s.code, player: s.playerId, token: s.token, type }, payload || {}));

function openWs(base, s, token) {
  const q = new URLSearchParams({ code: s.code, player: s.playerId, token: token || s.token });
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws?' + q);
  ws.inbox = [];
  ws.waiters = [];
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    ws.inbox.push(msg);
    for (const w of ws.waiters.slice()) if (w.pred(msg)) { ws.waiters.splice(ws.waiters.indexOf(w), 1); w.resolve(msg); }
  });
  return ws;
}
function next(ws, pred, ms = 3000) {
  const hit = ws.inbox.find(pred);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    ws.waiters.push({ pred, resolve });
    setTimeout(() => reject(new Error('timed out waiting for a message')), ms).unref();
  });
}
const closed = ws => new Promise(resolve => {
  if (ws.readyState === WebSocket.CLOSED) resolve({ code: 1006 });
  else ws.addEventListener('close', e => resolve(e));
});
const isRoom = m => m.t === 'room';

test('opening the socket delivers the room straight away', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Linh' });
    const ws = openWs(base, host);
    const msg = await next(ws, isRoom);
    assert.equal(msg.d.code, host.code);
    assert.equal(msg.d.players[0].connected, true);
    ws.close();
  } finally { srv.close(); }
});

test('a socket with the wrong token is refused', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Linh' });
    const ws = openWs(base, host, 'wrong');
    await closed(ws);
    assert.equal(ws.inbox.length, 0);
  } finally { srv.close(); }
});

test('positions sent over the socket reach the other players', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    await act(base, guest, 'claim', { crewId: 'minh' });
    const hws = openWs(base, host);
    const gws = openWs(base, guest);
    await next(hws, isRoom);
    await next(gws, isRoom);
    gws.send(JSON.stringify({ t: 'pos', d: { x: 300, y: 200, dir: 'left', moving: true } }));
    const pos = await next(hws, m => m.t === 'pos' && m.d.some(p => p.crewId === 'minh'));
    assert.deepEqual(pos.d.find(p => p.crewId === 'minh'), { crewId: 'minh', x: 300, y: 200, dir: 'left', moving: true, rover: false });
    hws.close(); gws.close();
  } finally { srv.close(); }
});

test('junk on the socket is ignored and the connection stays usable', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    await act(base, guest, 'claim', { crewId: 'minh' });
    const hws = openWs(base, host);
    const gws = openWs(base, guest);
    await next(hws, isRoom);
    await next(gws, isRoom);
    for (const junk of ['not json', 'null', '{"t":"nope"}', '{"t":"pos","d":{"x":"a","y":{},"dir":"sideways"}}']) gws.send(junk);
    gws.send(JSON.stringify({ t: 'pos', d: { x: 50, y: 60 } }));
    const pos = await next(hws, m => m.t === 'pos' && m.d.some(p => p.crewId === 'minh' && p.x === 50));
    assert.equal(pos.d.find(p => p.crewId === 'minh').dir, 'down');
    hws.close(); gws.close();
  } finally { srv.close(); }
});

test('an oversized message closes only that socket', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    const hws = openWs(base, host);
    const gws = openWs(base, guest);
    await next(hws, isRoom);
    await next(gws, isRoom);
    gws.send('x'.repeat(70 * 1024));
    const ev = await closed(gws);
    assert.equal(ev.code, 1009);
    assert.equal(hws.readyState, WebSocket.OPEN, 'the host is unaffected');
    hws.close();
  } finally { srv.close(); }
});

test('a flood is cut to 30 messages per second', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    await act(base, host, 'claim', { crewId: 'lena' });
    const ws = openWs(base, host);
    await next(ws, isRoom);
    for (let i = 1; i <= 100; i++) ws.send(JSON.stringify({ t: 'pos', d: { x: i, y: 1 } }));
    await new Promise(r => setTimeout(r, 200));
    const q = new URLSearchParams({ code: host.code, player: host.playerId, token: host.token });
    const room = await (await fetch(base + '/api/room/state?' + q)).json();
    const x = room.positions.find(p => p.crewId === 'lena').x;
    assert.ok(x >= 1 && x <= 30, 'only the first 30 counted, got x=' + x);
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  } finally { srv.close(); }
});

test('a player who drops and reconnects keeps their seat', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    const g1 = openWs(base, guest);
    await next(g1, isRoom);
    g1.close();
    await closed(g1);
    const g2 = openWs(base, guest);
    const m = await next(g2, msg => msg.t === 'room' && msg.d.players.find(p => p.id === guest.playerId).connected);
    assert.equal(m.d.players.length, 2, 'no duplicate player');
    g2.close();
  } finally { srv.close(); }
});

test("leaving closes the player's socket", async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    const gws = openWs(base, guest);
    await next(gws, isRoom);
    await act(base, guest, 'leave');
    await closed(gws);
    assert.equal(gws.readyState, WebSocket.CLOSED);
  } finally { srv.close(); }
});

test('live updates no longer use Server-Sent Events', async () => {
  const { srv, base } = await start();
  try {
    assert.equal((await fetch(base + '/api/room/stream?code=X&player=Y&token=Z')).status, 404);
  } finally { srv.close(); }
});

test('a client that resets mid-upgrade does not crash the server', async () => {
  const { srv, base } = await start();
  try {
    const net = require('node:net');
    const sock = net.connect(srv.address().port, '127.0.0.1');
    sock.on('error', () => {});
    await new Promise(r => sock.on('connect', r));
    sock.write('GET /ws?code=X&player=Y&token=Z HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
    if (sock.resetAndDestroy) sock.resetAndDestroy(); else sock.destroy();
    await new Promise(r => setTimeout(r, 100));
    assert.equal((await fetch(base + '/api/info')).status, 200);
  } finally { srv.close(); }
});

// WebSocket hardening tests (Task 7)
const WsClient = require('ws');
const { attachWebSocket } = require('../lib/ws.js');
const { createRooms } = require('../lib/rooms.js');

function bare(t, opts) {
  return new Promise(resolve => {
    const rooms = createRooms();
    const srv = http.createServer((req, res) => { res.writeHead(404); res.end(); });
    const live = attachWebSocket(srv, rooms, opts);
    t.after(() => { live.shutdown(); srv.close(); });
    srv.listen(0, '127.0.0.1', () => resolve({ rooms, port: srv.address().port }));
  });
}
const seatPath = (room, p) => '/ws?' + new URLSearchParams({ code: room.code, player: p.id, token: p.token });
function upgradeStatus(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13' } });
    req.on('response', res => { res.resume(); resolve(res.statusCode); });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    req.on('error', reject);
    req.end();
  });
}
const wsOpen = ws => new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
const wsClosed = ws => new Promise(resolve => ws.once('close', code => resolve(code)));

test('a full server answers 503, and an upgrade anywhere but /ws gets 404', async t => {
  const { rooms, port } = await bare(t, { maxConnections: 1 });
  const { room, player } = rooms.create('Host');
  const ws = new WsClient('ws://127.0.0.1:' + port + seatPath(room, player));
  await wsOpen(ws);
  assert.equal(await upgradeStatus(port, seatPath(room, player)), 503);
  assert.equal(await upgradeStatus(port, '/nope'), 404);
  ws.close();
});

test('one seat can hold three sockets but not a fourth', async t => {
  const { rooms, port } = await bare(t, {});
  const { room, player } = rooms.create('Host');
  const url = 'ws://127.0.0.1:' + port + seatPath(room, player);
  const socks = [new WsClient(url), new WsClient(url), new WsClient(url)];
  await Promise.all(socks.map(wsOpen));
  assert.equal(await upgradeStatus(port, seatPath(room, player)), 503);
  socks[0].close();
  for (let i = 0; i < 50 && player.clients.size > 2; i++) await new Promise(r => setTimeout(r, 20));
  assert.equal(await upgradeStatus(port, seatPath(room, player)), 101, 'a slot is free again');
  socks.slice(1).forEach(s => s.close());
});

test('a socket that stops answering pings is dropped; one that answers stays', async t => {
  const { rooms, port } = await bare(t, { heartbeatMs: 50 });
  const { room, player } = rooms.create('Host');
  const url = 'ws://127.0.0.1:' + port + seatPath(room, player);
  const silent = new WsClient(url, { autoPong: false });
  const healthy = new WsClient(url);
  await Promise.all([wsOpen(silent), wsOpen(healthy)]);
  assert.equal(await wsClosed(silent), 1006, 'terminated, not closed politely');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(healthy.readyState, WsClient.OPEN);
  healthy.close();
});

test('fog revealed over the socket reaches the other players', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    await act(base, host, 'claim', { crewId: 'lena' });
    await act(base, guest, 'claim', { crewId: 'minh' });
    await act(base, host, 'launch');
    const hws = openWs(base, host), gws = openWs(base, guest);
    await next(hws, isRoom);
    await next(gws, isRoom);
    const bits = new Uint8Array(128);
    bits[0] = 1;
    const text = Buffer.from(bits).toString('base64');
    gws.send(JSON.stringify({ t: 'reveal', d: { '-2,3': text } }));
    const fog = await next(hws, m => m.t === 'fog' && m.d['-2,3']);
    assert.equal(fog.d['-2,3'], text);
    hws.close();
    gws.close();
  } finally { srv.close(); }
});
