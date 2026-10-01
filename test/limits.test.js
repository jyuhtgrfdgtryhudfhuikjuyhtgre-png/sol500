'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isRemote, clientIp, createLimiter, requestClass } = require('../lib/limits.js');

const req = (addr, headers) => ({ socket: { remoteAddress: addr }, headers: headers || {} });

test('the host PC and the home Wi-Fi are local', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.1.20', '10.0.0.5', '172.16.0.2', '172.31.9.9', '::ffff:192.168.0.7', 'fe80::1', 'fd12::3'])
    assert.equal(isRemote(req(a, { host: 'localhost:5050' })), false, a);
});

test('anything that came through the share link is remote, even though cloudflared connects from this PC', () => {
  assert.equal(isRemote(req('127.0.0.1', { 'cf-connecting-ip': '203.0.113.7' })), true);
  assert.equal(isRemote(req('127.0.0.1', { host: 'quiet-river.trycloudflare.com' })), true);
  assert.equal(isRemote(req('203.0.113.7', {})), true);
  assert.equal(isRemote(req('172.32.0.1', {})), true, '172.32/16 is public');
});

test("a visitor's address comes from Cloudflare's header when there is one", () => {
  assert.equal(clientIp(req('127.0.0.1', { 'cf-connecting-ip': '198.51.100.4' })), '198.51.100.4');
  assert.equal(clientIp(req('::ffff:192.168.1.9', {})), '192.168.1.9');
});

test('the limiter allows the limit per window, per key, then resets', () => {
  let t = 1000;
  const L = createLimiter({ limit: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([L.hit('a'), L.hit('a'), L.hit('a'), L.hit('a')], [true, true, true, false]);
  assert.equal(L.hit('b'), true, 'other keys have their own count');
  t += 1000;
  assert.equal(L.hit('a'), true, 'a new window starts fresh');
});

test('this PC asking for localhost is local; the same PC under any other name is not', () => {
  for (const host of ['localhost:5050', 'LOCALHOST:5051', '127.0.0.1:5050', '[::1]:5050', 'localhost'])
    assert.equal(requestClass(req('127.0.0.1', { host })), 'local', host);
  assert.equal(requestClass(req('::1', { host: 'localhost:5050' })), 'local');
  assert.equal(requestClass(req('::ffff:127.0.0.1', { host: 'localhost:5050' })), 'local');
  assert.equal(requestClass(req('127.0.0.1', { host: 'evil.example:5050' })), 'lan', 'a page re-pointed at 127.0.0.1 (DNS rebinding) is not local');
  assert.equal(requestClass(req('127.0.0.1', {})), 'lan', 'no Host header is not local');
  assert.equal(requestClass(req('127.0.0.1', { host: '[::1' })), 'lan', 'a broken IPv6 Host is not local');
});

test('other Wi-Fi devices are lan; the share link and the internet are remote', () => {
  assert.equal(requestClass(req('192.168.1.20', { host: '192.168.1.5:5050' })), 'lan');
  assert.equal(requestClass(req('192.168.1.20', { host: 'localhost:5050' })), 'lan', 'a LAN device cannot claim to be localhost');
  assert.equal(requestClass(req('127.0.0.1', { host: 'localhost:5050', 'cf-connecting-ip': '203.0.113.7' })), 'remote');
  assert.equal(requestClass(req('127.0.0.1', { host: 'Quiet-River.TryCloudflare.com:443' })), 'remote');
  assert.equal(requestClass(req('203.0.113.7', { host: 'localhost:5050' })), 'remote');
  assert.equal(requestClass(req('', {})), 'remote', 'no socket address at all is not trusted');
});
