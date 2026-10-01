'use strict';
/*
 * SOL 500 — "Join game" in the desktop app. A friend pastes the host's share link or Wi-Fi address,
 * and the host's game opens in their normal browser (never inside the app window, which has window.solApp).
 * Only two kinds of address are accepted:
 *   https://<name>.trycloudflare.com      the share link (origin only)
 *   http://<private IPv4>:<port>          the Wi-Fi address shown in the host's lobby (a bare 192.168.1.20:5050 too)
 */
const TUNNEL_HOST = /^[a-z0-9-]+\.trycloudflare\.com$/;

function privateIPv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some(n => n > 255)) return false;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Returns the host's origin (no trailing slash), or null when the input is not a SOL 500 address.
function normalizeHostAddress(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s; // bare "192.168.1.20:5050"
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'https:') return TUNNEL_HOST.test(host) && !u.port ? 'https://' + host : null;
  if (u.protocol === 'http:') {
    const port = Number(u.port); // '' when missing (or the default :80, which SOL 500 never uses)
    return privateIPv4(host) && port >= 1 && port <= 65535 ? 'http://' + host + ':' + port : null;
  }
  return null;
}

// <origin>/?join=<CODE>, with the room code reduced to at most 6 capital letters (or left out).
function joinUrl(address, code) {
  const origin = normalizeHostAddress(address);
  if (!origin) return null;
  const clean = String(code == null ? '' : code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return origin + '/' + (clean ? '?join=' + clean : '');
}

module.exports = { normalizeHostAddress, joinUrl };
