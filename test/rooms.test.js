'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRooms } = require('../lib/rooms.js');

function fakeClient() {
  return { got: [], closed: false, send(type, data) { this.got.push({ type, data }); }, close() { this.closed = true; } };
}

test('a client attached to a player hears every room change', () => {
  const R = createRooms();
  const { room, player } = R.create('Linh');
  const c = fakeClient();
  R.attach(room, player, c);
  assert.equal(c.got.at(-1).type, 'room');
  const r = R.act({ code: room.code, player: player.id, token: player.token, type: 'rename', name: 'Linh B' });
  assert.equal(r.status, 200);
  assert.equal(c.got.at(-1).data.players[0].name, 'Linh B');
});

test('positions reach other players in one throttled message', async () => {
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  const c = fakeClient();
  R.attach(room, host, c);
  R.act({ code: room.code, player: guest.id, token: guest.token, type: 'claim', crewId: 'minh' });
  R.position(room, guest, { x: 10, y: 20, dir: 'up' });
  R.position(room, guest, { x: 11, y: 21, dir: 'up' });
  await new Promise(r => setTimeout(r, 150));
  const pos = c.got.filter(m => m.type === 'pos');
  assert.equal(pos.length, 1);
  assert.deepEqual(pos[0].data.map(p => [p.crewId, p.x, p.y]), [['minh', 11, 21]]);
});

test("leaving closes that player's clients and an empty room disappears", () => {
  const R = createRooms();
  const { room, player } = R.create('Solo');
  const c = fakeClient();
  R.attach(room, player, c);
  R.act({ code: room.code, player: player.id, token: player.token, type: 'leave' });
  assert.equal(c.closed, true);
  assert.equal(R.auth(room.code, player.id, player.token), null);
});

test('a wrong token is not a player', () => {
  const R = createRooms();
  const { room, player } = R.create('Host');
  assert.equal(R.auth(room.code, player.id, 'nope'), null);
  assert.equal(R.act({ code: room.code, player: player.id, token: 'nope', type: 'rename' }).status, 403);
});

// A player whose tab is gone: no sockets and not heard from for longer than the 30 s grace period.
function makeAbsent(player, ms = 60000) { player.clients.clear(); player.lastSeen = Date.now() - ms; }

test('a rejoining player gets their astronaut back after the old seat dropped', () => {
  const R = createRooms();
  const { room } = R.create('Host');
  const { player: old } = R.join(room.code, 'Mai');
  assert.equal(R.act({ code: room.code, player: old.id, token: old.token, type: 'claim', crewId: 'minh' }).status, 200);
  R.position(room, old, { x: 10, y: 20 });
  makeAbsent(old);
  const { player: back } = R.join(room.code, 'Mai again');
  const r = R.act({ code: room.code, player: back.id, token: back.token, type: 'claim', crewId: 'minh' });
  assert.equal(r.status, 200);
  assert.equal(back.crewId, 'minh');
  assert.equal(old.crewId, null);
  assert.equal(room.settings.names.minh, 'Mai again');
  assert.equal(room.positions.minh, undefined);
});

test("an astronaut whose player is still here can't be taken", () => {
  const R = createRooms();
  const { room } = R.create('Host');
  const { player: a } = R.join(room.code, 'A');
  const { player: b } = R.join(room.code, 'B');
  R.act({ code: room.code, player: a.id, token: a.token, type: 'claim', crewId: 'minh' });
  a.clients.clear(); a.lastSeen = Date.now() - 5000; // a short blip is still "here"
  const r = R.act({ code: room.code, player: b.id, token: b.token, type: 'claim', crewId: 'minh' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'taken');
  assert.equal(a.crewId, 'minh');
});

test('a full room makes space by dropping the player gone longest, and stays full when everyone is here', () => {
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const guests = ['A', 'B', 'C', 'D'].map(n => R.join(room.code, n).player);
  assert.equal(R.join(room.code, 'Late').error, 'full');
  R.act({ code: room.code, player: host.id, token: host.token, type: 'claim', crewId: 'lena' });
  makeAbsent(guests[1], 40000);
  makeAbsent(host, 90000); // gone longest
  const j = R.join(room.code, 'Late');
  assert.ok(j.player, 'the newcomer gets in');
  assert.equal(room.players.length, 5);
  assert.ok(!room.players.includes(host), 'the player gone longest made room');
  assert.ok(room.players.includes(guests[1]));
  assert.equal(host.crewId, null);
  assert.equal(room.settings.names.lena, undefined);
  assert.notEqual(room.hostId, host.id, 'someone else hosts now');
  assert.ok(room.players.some(p => p.id === room.hostId));
  assert.equal(R.auth(room.code, host.id, host.token), null);
});

test("after leaving, a late position message can't bring the avatar back", () => {
  const R = createRooms();
  const { room } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  R.act({ code: room.code, player: guest.id, token: guest.token, type: 'claim', crewId: 'minh' });
  R.act({ code: room.code, player: guest.id, token: guest.token, type: 'leave' });
  assert.equal(R.position(room, guest, { x: 5, y: 5 }), 'noCrew');
  assert.equal(room.positions.minh, undefined);
});
