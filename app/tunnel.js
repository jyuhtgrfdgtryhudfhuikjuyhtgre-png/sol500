'use strict';
/*
 * SOL 500 — online share link through a Cloudflare quick tunnel:
 *   https://<random-words>.trycloudflare.com  →  this PC's game server.
 * cloudflared is downloaded once, checked against a pinned SHA-256 (app/cloudflared.json), and started per session.
 * Quick tunnels need no account; Cloudflare gives no uptime guarantee and allows 200 requests in flight.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const PINNED = require('./cloudflared.json');
const URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i;
const START_TIMEOUT_MS = 30000;
const fail = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

function parseTunnelUrl(text) {
  const m = String(text).match(URL_RE);
  return m ? m[0] : null;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('error', reject).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex')));
  });
}

async function ensureBinary(binDir, opts = {}) {
  const pin = opts.pin || PINNED;
  const fetchImpl = opts.fetch || fetch;
  const file = path.join(binDir, 'cloudflared-' + pin.version + '.exe');
  if (fs.existsSync(file) && (await sha256File(file)) === pin.sha256) return file;
  if (opts.onStatus) opts.onStatus({ state: 'downloading' });
  const res = await fetchImpl(pin.url, { redirect: 'follow' });
  if (!res.ok) throw fail('download failed: HTTP ' + res.status, 'download');
  const buf = Buffer.from(await res.arrayBuffer());
  if (crypto.createHash('sha256').update(buf).digest('hex') !== pin.sha256) throw fail('cloudflared failed its checksum', 'hashMismatch');
  fs.mkdirSync(binDir, { recursive: true });
  const part = file + '.part';
  fs.writeFileSync(part, buf);
  fs.renameSync(part, file);
  return file;
}

// Resolves { url, stop() } once Cloudflare hands out the address.
// onExit(error|null) fires later if the link stops: null when stop() was called, an error otherwise.
async function start(opts) {
  const command = opts.command || await ensureBinary(opts.binDir, { onStatus: opts.onStatus });
  const args = opts.args || ['tunnel', '--url', 'http://127.0.0.1:' + opts.port, '--no-autoupdate'];
  if (opts.onStatus) opts.onStatus({ state: 'starting' });
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    let log = '';
    let stopped = false;
    const timer = setTimeout(() => {
      if (url) return;
      child.kill();
      reject(fail('Cloudflare did not answer in time', 'timeout'));
    }, opts.timeoutMs || START_TIMEOUT_MS);
    const onData = d => {
      if (url) return;
      log = (log + d.toString('utf8')).slice(-8000);
      const found = parseTunnelUrl(log);
      if (!found) return;
      url = found;
      clearTimeout(timer);
      resolve({ url, stop: () => { stopped = true; child.kill(); } });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', err => { clearTimeout(timer); if (!url) reject(fail(err.message, 'spawn')); });
    child.on('exit', code => {
      clearTimeout(timer);
      if (!url) { reject(fail('cloudflared stopped (exit ' + code + ')', 'exited', { log })); return; }
      if (opts.onExit) opts.onExit(stopped ? null : fail('the share link stopped (exit ' + code + ')', 'exited'));
    });
  });
}

module.exports = { start, ensureBinary, parseTunnelUrl, sha256File, PINNED };
