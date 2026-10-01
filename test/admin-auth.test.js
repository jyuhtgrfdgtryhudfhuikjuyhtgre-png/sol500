'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAdminAuth } = require('../lib/admin-auth.js');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-auth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const PW = 'mars rocks 2026';

test('every start makes a new 128-bit key, and only this PC can use it', () => {
  const a = createAdminAuth();
  const b = createAdminAuth();
  assert.match(a.key, /^[0-9a-f]{32}$/);
  assert.notEqual(a.key, b.key);
  assert.equal(a.authorize('local', a.key), 'local');
  assert.equal(a.authorize('local', b.key), null);
  assert.equal(a.authorize('local', undefined), null);
  assert.equal(a.authorize('lan', a.key), null, 'another device cannot use the PC key');
  assert.equal(a.authorize('remote', a.key), null);
});

test('Wi-Fi access needs a password of 8 to 64 characters first', async () => {
  const a = createAdminAuth();
  assert.deepEqual(a.setEnabled(true), { error: 'noPassword' });
  assert.deepEqual(await a.setPassword('short'), { error: 'badPassword' });
  assert.deepEqual(await a.setPassword('x'.repeat(65)), { error: 'badPassword' });
  assert.deepEqual(await a.setPassword(12345678), { error: 'badPassword' });
  assert.deepEqual(await a.setPassword(PW), { ok: true });
  assert.deepEqual(a.setEnabled(true), { ok: true });
  assert.deepEqual(a.wifi(), { enabled: true, hasPassword: true, sessions: 0 });
});

test('a device logs in with the password and its session works for Wi-Fi only', async () => {
  const a = createAdminAuth();
  assert.deepEqual(await a.login(PW), { error: 'off' });
  await a.setPassword(PW);
  a.setEnabled(true);
  assert.deepEqual(await a.login('wrong password'), { error: 'badPassword' });
  assert.deepEqual(await a.login(null), { error: 'badPassword' });
  const s = await a.login(PW);
  assert.match(s.token, /^[0-9a-f]{32}$/);
  assert.equal(a.authorize('lan', s.token), 'lan');
  assert.equal(a.authorize('local', s.token), null);
  assert.equal(a.authorize('remote', s.token), null);
  assert.equal(a.wifi().sessions, 1);
});

test('sessions end after 8 hours, on a new password, and when access is switched off', async () => {
  let now = 1e12;
  const a = createAdminAuth({ now: () => now });
  await a.setPassword(PW);
  a.setEnabled(true);
  const s1 = await a.login(PW);
  now += 8 * 60 * 60 * 1000 - 1;
  assert.equal(a.authorize('lan', s1.token), 'lan');
  now += 1;
  assert.equal(a.authorize('lan', s1.token), null, 'expired');
  const s2 = await a.login(PW);
  await a.setPassword('a brand new one');
  assert.equal(a.authorize('lan', s2.token), null, 'a new password logs everyone out');
  const s3 = await a.login('a brand new one');
  a.setEnabled(false);
  a.setEnabled(true);
  assert.equal(a.authorize('lan', s3.token), null, 'switching off logs everyone out');
  const s4 = await a.login('a brand new one');
  a.logoutAll();
  assert.equal(a.authorize('lan', s4.token), null);
});

test('at most 20 sessions: the oldest is dropped', async () => {
  const a = createAdminAuth();
  await a.setPassword(PW);
  a.setEnabled(true);
  const first = await a.login(PW);
  for (let i = 0; i < 20; i++) await a.login(PW);
  assert.equal(a.wifi().sessions, 20);
  assert.equal(a.authorize('lan', first.token), null);
});

test('the settings survive a restart, the password itself is never stored, and sessions do not survive', async t => {
  const dir = tmp(t);
  const a = createAdminAuth({ dataDir: dir });
  await a.setPassword(PW);
  a.setEnabled(true);
  const s = await a.login(PW);
  const text = fs.readFileSync(path.join(dir, 'admin.json'), 'utf8');
  assert.ok(!text.includes(PW));
  const saved = JSON.parse(text);
  assert.deepEqual([saved.enabled, saved.N, saved.r, saved.p], [true, 16384, 8, 1]);
  assert.match(saved.salt, /^[0-9a-f]{32}$/);
  assert.match(saved.hash, /^[0-9a-f]{64}$/);
  const b = createAdminAuth({ dataDir: dir });
  assert.deepEqual(b.wifi(), { enabled: true, hasPassword: true, sessions: 0 });
  assert.equal(b.authorize('lan', s.token), null);
  assert.ok((await b.login(PW)).token);
});

test('a damaged admin.json switches Wi-Fi access off instead of crashing', async t => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'admin.json'), '{ nope');
  assert.deepEqual(createAdminAuth({ dataDir: dir }).wifi(), { enabled: false, hasPassword: false, sessions: 0 });
  fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify({ enabled: true, salt: '00', hash: 'abcd', N: 16384, r: 8, p: 1 }));
  const a = createAdminAuth({ dataDir: dir });
  assert.deepEqual(a.wifi(), { enabled: false, hasPassword: false, sessions: 0 }, 'invalid salt/hash length loads as OFF');
  assert.deepEqual(await a.login(PW), { error: 'off' });
  fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify({ enabled: true, salt: '0'.repeat(32), hash: 'a'.repeat(64), N: 3, r: 8, p: 1 }));
  const b = createAdminAuth({ dataDir: dir });
  assert.deepEqual(b.wifi(), { enabled: false, hasPassword: false, sessions: 0 }, 'invalid N loads as OFF');
});

test('a login that races a password change never gets a session', async () => {
  const a = createAdminAuth();
  await a.setPassword(PW);
  a.setEnabled(true);
  const pending = a.login(PW);
  await a.setPassword('a brand new one');
  const r = await pending;
  assert.equal(r.token, undefined);
  assert.equal(r.error, 'badPassword');
  assert.equal(a.wifi().sessions, 0);
});

test('a login that starts during a password change never keeps a session', async () => {
  const a = createAdminAuth();
  await a.setPassword(PW);
  a.setEnabled(true);
  const change = a.setPassword('a brand new one');
  const pending = a.login(PW);
  const r = await pending;
  await change;
  if (r.token) {
    assert.equal(a.authorize('lan', r.token), null);
  }
  assert.equal(a.wifi().sessions, 0);
});

test('a password typed with combining accents matches the same password typed precomposed', async () => {
  const a = createAdminAuth();
  const nfc = 'mật khẩu của tôi'.normalize('NFC');
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  assert.deepEqual(await a.setPassword(nfc), { ok: true });
  a.setEnabled(true);
  assert.ok((await a.login(nfd)).token);
});
