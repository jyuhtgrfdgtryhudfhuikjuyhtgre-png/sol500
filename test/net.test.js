'use strict';
// The co-op client (src/net.js) in a vm sandbox with a fake WebSocket: which handler each frame from the server reaches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'net.js'), 'utf8');
// A tab with a saved seat, offline (fetch fails): its sockets are kept to feed frames to.
function client() {
  const sockets = [], saved = { 'sol500.lan': JSON.stringify({ code: 'ABCD', playerId: 'p1', token: 't' }) };
  class WebSocket { constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); } close() {} send(text) { this.sent.push(JSON.parse(text)); } }
  const sandbox = {
    WebSocket, URLSearchParams, setTimeout, clearTimeout, location: { protocol: 'http:', host: 'localhost:5073' },
    sessionStorage: { getItem: k => saved[k] || null, setItem() {}, removeItem() {} }, fetch: () => Promise.reject(new Error('offline')),
  };
  vm.runInNewContext(SOURCE, sandbox);
  return { N: sandbox.SolNet, sockets };
}
const frame = (sock, t, d) => sock.onmessage({ data: JSON.stringify({ t, d }) });
const plain = v => JSON.parse(JSON.stringify(v));

test("a discovery the server sends reaches the game's event handler; kicked and closed still end the seat, not the game", () => {
  const { N, sockets } = client();
  N.restore();
  const events = [], status = [];
  N.connect(() => {}, (s, k) => status.push([s, k]), () => {}, () => {}, d => events.push(d));
  frame(sockets[0], 'event', { kind: 'discover', landmark: 'L0,1', by: 'diego' });
  assert.deepEqual(plain(events), [{ kind: 'discover', landmark: 'L0,1', by: 'diego' }]);
  frame(sockets[0], 'event', { kind: 'kicked' });
  assert.deepEqual(status, [['gone', 'kicked']]);
  assert.equal(events.length, 1, 'kicked is not a game event');
});

test("a ping the server relays reaches the game's ping handler and no other, and a game that asks for none just doesn't hear it", () => {
  const { N, sockets } = client();
  N.restore();
  const got = { events: [], pings: [], pos: [] };
  N.connect(() => {}, () => {}, d => got.pos.push(d), () => {}, d => got.events.push(d), d => got.pings.push(d));
  frame(sockets[0], 'ping', { x: 640, y: -320, by: 'kai' });
  frame(sockets[0], 'ping', null);
  frame(sockets[0], 'event', { kind: 'discover', landmark: 'L0,1', by: 'diego' });
  assert.deepEqual(plain(got.pings), [{ x: 640, y: -320, by: 'kai' }], 'a ping with nothing in it is not one');
  assert.equal(got.events.length, 1, 'a ping is not a game event');
  assert.equal(got.pos.length, 0);
  N.connect(() => {}, () => {}, () => {}, () => {}, () => {}); // an older caller with five handlers
  frame(sockets[1], 'ping', { x: 1, y: 2, by: 'kai' });
});

test('sendPing puts the spot on the socket for the server to check, and says so when the socket is not open', () => {
  const { N, sockets } = client();
  N.restore();
  assert.equal(N.sendPing(5, 6), false, 'not connected');
  N.connect(() => {}, () => {}, () => {}, () => {}, () => {}, () => {});
  assert.equal(N.sendPing(5, 6), false, 'connecting');
  sockets[0].readyState = 1;
  assert.equal(N.sendPing(640, -320.5), true);
  assert.deepEqual(sockets[0].sent, [{ t: 'ping', d: { x: 640, y: -320.5 } }]);
});
