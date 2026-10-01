'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHostAddress, joinUrl } = require('../app/join.js');

test('a Cloudflare share link is kept as its origin only', () => {
  assert.equal(normalizeHostAddress('https://quiet-river-sun.trycloudflare.com'), 'https://quiet-river-sun.trycloudflare.com');
  assert.equal(normalizeHostAddress('https://quiet-river-sun.trycloudflare.com/'), 'https://quiet-river-sun.trycloudflare.com');
  assert.equal(normalizeHostAddress('https://quiet-river-sun.trycloudflare.com/some/path?join=ABCD#x'), 'https://quiet-river-sun.trycloudflare.com');
});

test('a home-network address keeps its port and drops the path', () => {
  assert.equal(normalizeHostAddress('http://192.168.1.20:5050'), 'http://192.168.1.20:5050');
  assert.equal(normalizeHostAddress('http://192.168.1.20:5050/?join=ABCD'), 'http://192.168.1.20:5050');
  assert.equal(normalizeHostAddress('http://10.0.0.7:5051'), 'http://10.0.0.7:5051');
  assert.equal(normalizeHostAddress('http://172.16.0.2:5050'), 'http://172.16.0.2:5050');
  assert.equal(normalizeHostAddress('http://172.31.255.254:65535'), 'http://172.31.255.254:65535');
  assert.equal(normalizeHostAddress('http://127.0.0.1:5050'), 'http://127.0.0.1:5050');
});

test('a bare Wi-Fi address with a port is read as http', () => {
  assert.equal(normalizeHostAddress('192.168.1.20:5050'), 'http://192.168.1.20:5050');
  assert.equal(normalizeHostAddress('10.1.2.3:5052/'), 'http://10.1.2.3:5052');
});

test('case and surrounding spaces do not matter', () => {
  assert.equal(normalizeHostAddress('  HTTPS://Quiet-River.TryCloudflare.COM/  '), 'https://quiet-river.trycloudflare.com');
  assert.equal(normalizeHostAddress('\tHTTP://192.168.1.20:5050\n'), 'http://192.168.1.20:5050');
});

test('anything that is not a share link or a home-network address is refused', () => {
  const bad = [
    '', '   ', null, undefined, 42,
    'http://8.8.8.8:5050',                          // public IP
    'http://172.32.0.1:5050', 'http://172.15.0.1:5050', 'http://192.169.1.1:5050', 'http://11.0.0.1:5050',
    'http://192.168.1.20',                          // http without a port
    '192.168.1.20',
    'http://192.168.1.20:0',
    'http://192.168.1.20:70000',
    'https://192.168.1.20:5050',                    // https only for the share link
    'http://quiet-river.trycloudflare.com',         // the share link is https
    'https://trycloudflare.com',
    'https://a.b.trycloudflare.com',
    'https://quiet-river.trycloudflare.com.evil.example',
    'https://evil.example/quiet-river.trycloudflare.com',
    'https://quiet-river.trycloudflare.com@evil.example',
    'https://user@quiet-river.trycloudflare.com',   // userinfo
    'http://user:pw@192.168.1.20:5050',
    'https://quiet-river.trycloudflare.com:8443',
    'http://localhost:5050',
    'http://example.com:5050',
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'ftp://192.168.1.20:5050',
    'http://[::1]:5050',
  ];
  for (const input of bad) assert.equal(normalizeHostAddress(input), null, 'should refuse ' + JSON.stringify(input));
});

test('the join link carries a clean room code, or none', () => {
  assert.equal(joinUrl('192.168.1.20:5050', 'abcd'), 'http://192.168.1.20:5050/?join=ABCD');
  assert.equal(joinUrl('https://quiet-river.trycloudflare.com/x', ' wxyz '), 'https://quiet-river.trycloudflare.com/?join=WXYZ');
  assert.equal(joinUrl('https://quiet-river.trycloudflare.com', ''), 'https://quiet-river.trycloudflare.com/');
  assert.equal(joinUrl('https://quiet-river.trycloudflare.com', undefined), 'https://quiet-river.trycloudflare.com/');
  assert.equal(joinUrl('https://quiet-river.trycloudflare.com', 'ab&x=1<'), 'https://quiet-river.trycloudflare.com/?join=ABX');
  assert.equal(joinUrl('https://quiet-river.trycloudflare.com', 'ABCDEFGHIJ'), 'https://quiet-river.trycloudflare.com/?join=ABCDEF');
  assert.equal(joinUrl('http://8.8.8.8:5050', 'ABCD'), null);
});
