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

module.exports = { isRemote, clientIp, createLimiter };
