'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRooms } = require('../lib/rooms.js');

function fakeClient() {
  return { got: [], closed: false, kind: undefined, send(type, data) { this.got.push({ type, data }); }, close(kind) { this.closed = true; this.kind = kind; } };
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

test("when a dropped player's grace period ends, everyone hears their seat can be taken back", t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e12 });
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  const hc = fakeClient();
  const gc = fakeClient();
  R.attach(room, host, hc);
  R.attach(room, guest, gc);
  R.detach(room, guest, gc);
  hc.got.length = 0;
  t.mock.timers.tick(31000);
  const last = hc.got.filter(m => m.type === 'room').at(-1);
  assert.ok(last, 'a room update went out');
  assert.equal(last.data.players.find(p => p.id === guest.id).connected, false);
});

const say = (R, room, p, type, extra) => R.act(Object.assign({ code: room.code, player: p.id, token: p.token, type }, extra));

test('the admin hears rooms open, players come and go, and empty rooms close', () => {
  const events = [];
  const R = createRooms({ onEvent: e => events.push(e) });
  const { room, player: host } = R.create('Linh');
  const { player: guest } = R.join(room.code, 'Bao', { remote: true });
  say(R, room, guest, 'leave');
  say(R, room, host, 'leave');
  assert.deepEqual(events.map(e => [e.type, e.name || e.reason]), [
    ['roomCreated', 'Linh'], ['playerJoined', 'Bao'], ['playerLeft', 'Bao'], ['playerLeft', 'Linh'], ['roomClosed', 'empty'],
  ]);
  assert.ok(events.every(e => e.code === room.code && typeof e.at === 'number'));
  assert.equal(events[0].remote, false);
  assert.equal(events[1].remote, true);
});

test('a room anyone joined through the share link counts as online for good', () => {
  const R = createRooms();
  const { room } = R.create('Host');
  assert.equal(room.everRemote, false);
  const { player: far } = R.join(room.code, 'Far', { remote: true });
  say(R, room, far, 'leave');
  assert.equal(room.everRemote, true);
});

test('a broken event listener never breaks the game', () => {
  const R = createRooms({ onEvent: () => { throw new Error('boom'); } });
  const { room } = R.create('Host');
  assert.ok(R.join(room.code, 'Guest').player);
});

test('kicking a player closes their tabs with "kicked" and frees their astronaut', () => {
  const events = [];
  const R = createRooms({ onEvent: e => events.push(e) });
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  say(R, room, guest, 'claim', { crewId: 'minh' });
  const gc = fakeClient();
  const hc = fakeClient();
  R.attach(room, guest, gc);
  R.attach(room, host, hc);
  assert.equal(R.kick(room.code, guest.id), true);
  assert.equal(gc.closed, true);
  assert.equal(gc.kind, 'kicked');
  assert.equal(hc.closed, false);
  assert.equal(R.auth(room.code, guest.id, guest.token), null);
  assert.equal(room.settings.names.minh, undefined);
  assert.deepEqual(hc.got.at(-1).data.players.map(p => p.name), ['Host']);
  assert.equal(events.at(-1).type, 'playerKicked');
  assert.equal(events.at(-1).name, 'Guest');
  assert.equal(R.kick(room.code, 'nobody'), false);
  assert.equal(R.kick('ZZZZ', host.id), false);
});

test('kicking the only player who is not ready lets the round go ahead', () => {
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  say(R, room, host, 'claim', { crewId: 'lena' });
  say(R, room, guest, 'claim', { crewId: 'minh' });
  assert.equal(say(R, room, host, 'launch').status, 200);
  say(R, room, host, 'ready', { ready: true });
  assert.equal(room.mission.turn, 0);
  R.kick(room.code, guest.id);
  assert.equal(room.mission.turn, 1);
});

test('closing a room tells every tab "closed" and removes it', () => {
  const events = [];
  const R = createRooms({ onEvent: e => events.push(e) });
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  const hc = fakeClient();
  const gc = fakeClient();
  R.attach(room, host, hc);
  R.attach(room, guest, gc);
  assert.equal(R.close(room.code), true);
  assert.deepEqual([hc.kind, gc.kind], ['closed', 'closed']);
  assert.equal(R.rooms.has(room.code), false);
  const last = events.at(-1);
  assert.deepEqual(last, { type: 'roomClosed', at: last.at, code: room.code, reason: 'admin' });
  assert.equal(R.close(room.code), false);
});

test('the live view lists rooms with their players, roles and where they connect from, and no tokens', () => {
  const R = createRooms();
  const { room, player: host } = R.create('Linh');
  const { player: far } = R.join(room.code, 'Far', { remote: true });
  say(R, room, far, 'claim', { crewId: 'diego' });
  const [snap] = R.snapshot();
  assert.equal(snap.code, room.code);
  assert.equal(snap.phase, 'lobby');
  assert.equal(snap.round, null);
  assert.equal(snap.everRemote, true);
  assert.deepEqual(snap.players.map(p => [p.name, p.host, p.role, p.remote, p.connected]), [
    ['Linh', true, null, false, true], ['Far', false, 'scientist', true, true],
  ]);
  const json = JSON.stringify(R.snapshot());
  assert.equal(json.includes(host.token) || json.includes(far.token), false);
});

test('a finished co-op mission is reported once, with its players and whether it was online', () => {
  const events = [];
  const R = createRooms({ onEvent: e => events.push(e) });
  const { room, player: host } = R.create('Host');
  const { player: far } = R.join(room.code, 'Far', { remote: true });
  say(R, room, host, 'claim', { crewId: 'lena' });
  say(R, room, far, 'claim', { crewId: 'minh' });
  say(R, room, host, 'launch');
  for (let i = 0; i < 25 && room.phase === 'ops'; i++) say(R, room, host, 'advance');
  assert.equal(room.phase, 'debrief');
  const ended = events.filter(e => e.type === 'missionEnded');
  assert.equal(ended.length, 1);
  assert.equal(ended[0].mode, 'online');
  assert.ok(['success', 'lost'].includes(ended[0].outcome));
  assert.equal(ended[0].mission.status, ended[0].outcome);
  assert.deepEqual(ended[0].players, [{ name: 'Host', crewId: 'lena' }, { name: 'Far', crewId: 'minh' }]);
  assert.equal(events.filter(e => e.type === 'roundResolved').length, room.mission.turn);
});

test("when a dropped player's grace period ends mid-round, the players still here are not kept waiting", t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e12 });
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  say(R, room, host, 'claim', { crewId: 'lena' });
  say(R, room, guest, 'claim', { crewId: 'minh' });
  say(R, room, host, 'launch');
  const hc = fakeClient();
  const gc = fakeClient();
  R.attach(room, host, hc);
  R.attach(room, guest, gc);
  say(R, room, host, 'ready', { ready: true });
  R.detach(room, guest, gc);
  assert.equal(room.mission.turn, 0, 'still waiting during the grace period');
  t.mock.timers.tick(31000);
  assert.equal(room.mission.turn, 1);
});

test('during a mission nobody can take over a crew member who has died, but a living one is fine', () => {
  const R = createRooms();
  const { room, player: host } = R.create('Host');
  const { player: guest } = R.join(room.code, 'Guest');
  say(R, room, host, 'claim', { crewId: 'lena' });
  say(R, room, guest, 'claim', { crewId: 'minh' });
  assert.equal(say(R, room, host, 'launch').status, 200);
  room.mission.crew.find(c => c.id === 'minh').status = 'dead';
  const r = say(R, room, guest, 'claim', { crewId: 'minh' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'deadCrew');
  assert.equal(say(R, room, guest, 'claim', { crewId: 'diego' }).status, 200);
  assert.equal(guest.crewId, 'diego');
});
