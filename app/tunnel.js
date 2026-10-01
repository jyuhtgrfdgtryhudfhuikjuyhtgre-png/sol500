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
const PROBE_TIMEOUT_MS = 5000;
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
  const res = await fetchImpl(pin.url, { redirect: 'follow', signal: opts.signal });
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
// opts.signal (AbortSignal) cancels the download or the start: the promise rejects with code 'cancelled'.
async function start(opts) {
  const signal = opts.signal;
  const cancelled = () => fail('opening the share link was cancelled', 'cancelled');
  let command = opts.command;
  if (!command) {
    try { command = await ensureBinary(opts.binDir, { onStatus: opts.onStatus, signal }); } catch (e) { throw signal && signal.aborted ? cancelled() : e; }
  }
  if (signal && signal.aborted) throw cancelled();
  const args = opts.args || ['tunnel', '--url', 'http://127.0.0.1:' + opts.port, '--no-autoupdate'];
  if (opts.onStatus) opts.onStatus({ state: 'starting' });
  return new Promise((resolve, reject) => {
    // With a signal, aborting kills the child (also after the link is up: stopping on purpose).
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal });
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
    child.on('error', err => {
      if (signal && signal.aborted) return; // the abort kills the child; 'exit' follows and rejects once it is gone
      clearTimeout(timer);
      if (!url) reject(fail(err.message, 'spawn'));
    });
    child.on('exit', code => {
      clearTimeout(timer);
      if (!url && signal && signal.aborted) { reject(cancelled()); return; }
      if (!url) { reject(fail('cloudflared stopped (exit ' + code + ')', 'exited', { log })); return; }
      if (opts.onExit) opts.onExit(stopped || (signal && signal.aborted) ? null : fail('the share link stopped (exit ' + code + ')', 'exited'));
    });
  });
}

// Polls <url>/api/info until it answers, so friends don't hit a DNS error on a brand-new tunnel name.
// Resolves true when reachable, false on timeout or cancel (opts.signal or opts.isCancelled); never rejects.
// Each probe gives up after PROBE_TIMEOUT_MS, so one hung request can't stall the start.
async function waitUntilReachable(url, opts = {}) {
  const { timeoutMs = 20000, intervalMs = 1000, isCancelled, signal } = opts;
  const fetchImpl = opts.fetch || fetch;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((isCancelled && isCancelled()) || (signal && signal.aborted)) return false;
    try {
      const probe = signal ? AbortSignal.any([signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)]) : AbortSignal.timeout(PROBE_TIMEOUT_MS);
      const res = await fetchImpl(url + '/api/info', { cache: 'no-store', signal: probe });
      if (res.ok) return true;
    } catch (e) { /* not resolvable yet */ }
    if (Date.now() + intervalMs > deadline) return false;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

module.exports = { start, ensureBinary, parseTunnelUrl, sha256File, waitUntilReachable, PINNED };
