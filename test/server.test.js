'use strict';
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

async function act(base, s, type, payload) {
  return post(base, '/api/room/act', Object.assign({ code: s.code, player: s.playerId, token: s.token, type }, payload || {}));
}

async function state(base, s) {
  const q = new URLSearchParams({ code: s.code, player: s.playerId, token: s.token });
  const r = await fetch(base + '/api/room/state?' + q);
  return r.json();
}

test('five players can join a room and a sixth is turned away', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Linh' });
    assert.ok(host.code);
    for (let i = 0; i < 4; i++) {
      const p = await post(base, '/api/room/join', { code: host.code, name: 'P' + i });
      assert.ok(p.playerId, 'player ' + i + ' should join');
    }
    const sixth = await post(base, '/api/room/join', { code: host.code, name: 'Late' });
    assert.equal(sixth.error, 'full');
    const room = await state(base, host);
    assert.equal(room.players.length, 5);
  } finally {
    srv.close();
  }
});

test('joining a room that does not exist fails cleanly', async () => {
  const { srv, base } = await start();
  try {
    const r = await post(base, '/api/room/join', { code: 'ZZZZ', name: 'X' });
    assert.equal(r.error, 'noRoom');
  } finally {
    srv.close();
  }
});

test('a co-op mission launches, each player sets their own job, and the round resolves when all are ready', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    assert.equal((await act(base, host, 'settings', { crewSize: 5 })).ok, true);
    assert.equal((await act(base, host, 'claim', { crewId: 'lena' })).ok, true);
    assert.equal((await act(base, guest, 'claim', { crewId: 'diego' })).ok, true);
    assert.equal((await act(base, guest, 'claim', { crewId: 'lena' })).error, 'taken');
    assert.equal((await act(base, guest, 'launch')).error, 'onlyHost');
    await act(base, host, 'phase', { phase: 'manifest' });
    assert.equal((await act(base, host, 'launch')).ok, true);

    let room = await state(base, host);
    assert.equal(room.phase, 'ops');
    assert.equal(room.mission.crew.length, 5);
    assert.equal(room.mission.coop, true);
    assert.equal(room.settings.names.diego, 'Guest');

    assert.equal((await act(base, guest, 'job', { crewId: 'diego', job: 'science' })).ok, true);
    assert.equal((await act(base, guest, 'job', { crewId: 'lena', job: 'science' })).error, 'notYours');
    assert.equal((await act(base, host, 'job', { crewId: 'amara', job: 'science' })).ok, true, 'host runs unclaimed crew');

    await act(base, host, 'plan', { patch: { rations: 'reduced', evil: 1 } });
    room = await state(base, host);
    assert.equal(room.plan.rations, 'reduced');
    assert.equal(room.plan.evil, undefined);
    assert.equal(room.plan.jobs.diego, 'science');

    await act(base, host, 'ready', { ready: true });
    room = await state(base, host);
    assert.equal(room.mission.turn, 0, 'waits for the guest');
    await act(base, guest, 'ready', { ready: true });
    room = await state(base, host);
    assert.equal(room.mission.turn, 1);
    assert.ok(room.lastReport);
    assert.equal(room.plan.jobs.diego, 'science', 'jobs carry over to the next round');
    assert.ok(room.players.every(p => !p.ready));
  } finally {
    srv.close();
  }
});

test('players share where their astronauts are standing', async () => {
  const { srv, base } = await start();
  try {
    const host = await post(base, '/api/room/create', { name: 'Host' });
    const guest = await post(base, '/api/room/join', { code: host.code, name: 'Guest' });
    await act(base, guest, 'claim', { crewId: 'minh' });
    const r = await act(base, guest, 'pos', { x: 321, y: 222, dir: 'left', moving: true });
    assert.equal(r.ok, true);
    const bad = await act(base, host, 'pos', { x: 1, y: 1 });
    assert.equal(bad.error, 'noCrew', 'players without a crew member have no astronaut');
    const room = await state(base, host);
    assert.deepEqual(room.positions.map(p => [p.crewId, p.x, p.y, p.dir]), [['minh', 321, 222, 'left']]);
  } finally {
    srv.close();
  }
});

test('the server hands out the game files but nothing else from the computer', async () => {
  const { srv, base } = await start();
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/src/engine.js')).status, 200);
    assert.equal((await fetch(base + '/src/surface.js')).status, 200);
    const mf = await fetch(base + '/manifest.webmanifest');
    assert.equal(mf.status, 200);
    assert.match(mf.headers.get('content-type'), /manifest\+json/);
    assert.equal((await fetch(base + '/sw.js')).status, 200);
    const icon = await fetch(base + '/icons/icon-192.png');
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(base + '/icons/../server.js')).status, 404);
    assert.equal((await fetch(base + '/server.js')).status, 404);
    assert.equal((await fetch(base + '/src/../server.js')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
    const info = await (await fetch(base + '/api/info')).json();
    assert.equal(info.lan, true);
    assert.equal(info.maxPlayers, 5);
  } finally {
    srv.close();
  }
});
