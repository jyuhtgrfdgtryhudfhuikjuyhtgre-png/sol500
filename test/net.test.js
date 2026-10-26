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
  class WebSocket { constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); } close() {} send() {} }
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
