'use strict';
/*
 * SOL 500 — who is calling, and how often. Requests that arrive through the Cloudflare share link
 * reach us from cloudflared on this same PC, so the socket address alone can't be trusted:
 * Cloudflare's own header and the trycloudflare host name mark them as remote.
 */
const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^::1$/, /^fe80:/i, /^f[cd][0-9a-f]{0,2}:/i];

function socketAddress(req) {
  const a = String((req.socket && req.socket.remoteAddress) || '');
  return a.startsWith('::ffff:') ? a.slice(7) : a;
}

function isRemote(req) {
  const h = req.headers || {};
  if (h['cf-connecting-ip']) return true;
  const host = String(h.host || '').toLowerCase().replace(/:\d+$/, '');
  if (host.endsWith('.trycloudflare.com')) return true;
  const a = socketAddress(req);
  return !PRIVATE.some(re => re.test(a));
}

function clientIp(req) {
  const h = req.headers || {};
  return String(h['cf-connecting-ip'] || socketAddress(req) || 'unknown');
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// The Host header without its port: "localhost:5050" → "localhost", "[::1]:5050" → "[::1]".
function hostName(req) {
  const host = String((req.headers || {}).host || '').trim().toLowerCase();
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.replace(/:\d+$/, '');
}

function isLoopback(req) {
  const a = socketAddress(req);
  return /^127\./.test(a) || a === '::1';
}

// Who is asking, for the admin panel:
//   'remote': through the share link, or from outside the home network (see isRemote)
//   'local':  this PC, addressed as localhost. Checking the Host header stops a web page that points its own
//             domain at 127.0.0.1 (DNS rebinding) from passing as this PC.
//   'lan':    everything else, i.e. other devices on the home Wi-Fi.
function requestClass(req) {
  if (isRemote(req)) return 'remote';
  if (isLoopback(req) && LOCAL_HOSTS.includes(hostName(req))) return 'local';
  return 'lan';
}

// Fixed-window counter per key. Old windows are dropped lazily so the map can't grow forever.
function createLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return {
    hit(key) {
      const t = now();
      let e = hits.get(key);
      if (!e || t - e.start >= windowMs) { e = { start: t, n: 0 }; hits.set(key, e); }
      e.n++;
      if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      return e.n <= limit;
    },
  };
}

module.exports = { isRemote, clientIp, createLimiter, requestClass };
