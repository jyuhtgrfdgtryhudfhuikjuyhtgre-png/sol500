'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseTunnelUrl, ensureBinary, start } = require('../app/tunnel.js');

test("the share link is read from cloudflared's banner, never its API address", () => {
  const log = 'INF Requesting new quick Tunnel on trycloudflare.com...\n' +
    'ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel"\n' +
    '|  https://quiet-river-sun-tiny.trycloudflare.com  |\n';
  assert.equal(parseTunnelUrl(log), 'https://quiet-river-sun-tiny.trycloudflare.com');
  assert.equal(parseTunnelUrl('nothing yet'), null);
});

test('a download that fails its checksum is never saved or run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-bin-'));
  const pin = { version: 'test', url: 'https://example.invalid/x.exe', sha256: '0'.repeat(64) };
  const fakeFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('evil').buffer });
  await assert.rejects(ensureBinary(dir, { pin, fetch: fakeFetch }), e => e.code === 'hashMismatch');
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('a good download is saved once and reused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol500-bin-'));
  const body = Buffer.from('pretend-binary');
  const pin = { version: 'test', url: 'x', sha256: crypto.createHash('sha256').update(body).digest('hex') };
  let calls = 0;
  const fakeFetch = async () => { calls++; return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) }; };
  const a = await ensureBinary(dir, { pin, fetch: fakeFetch });
  const b = await ensureBinary(dir, { pin, fetch: fakeFetch });
  assert.equal(a, b);
  assert.equal(calls, 1);
});

test('the host hears about it when the share link dies mid-game', async () => {
  const script = "console.error('|  https://brave-test-link.trycloudflare.com  |'); setTimeout(() => process.exit(3), 200);";
  let resolveExit;
  const exited = new Promise(r => { resolveExit = r; });
  const t = await start({ command: process.execPath, args: ['-e', script], onExit: e => resolveExit(e) });
  assert.equal(t.url, 'https://brave-test-link.trycloudflare.com');
  const err = await exited;
  assert.equal(err.code, 'exited');
});

test('stopping the link on purpose is not reported as a failure', async () => {
  const script = "console.log('https://calm-test-link.trycloudflare.com'); setInterval(() => {}, 1000);";
  let resolveExit;
  const exited = new Promise(r => { resolveExit = r; });
  const t = await start({ command: process.execPath, args: ['-e', script], onExit: e => resolveExit(e) });
  t.stop();
  assert.equal(await exited, null);
});

test('a tunnel that never prints a link times out cleanly', async () => {
  await assert.rejects(
    start({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], timeoutMs: 300 }),
    e => e.code === 'timeout');
});
