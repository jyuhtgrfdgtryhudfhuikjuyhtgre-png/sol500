/*
 * SOL 500 — fog of war bitsets. One bit per tile, one 32×32 set (128 bytes) per data chunk, saved in
 * mission.expedition.revealed and shared in co-op as standard base64 under the chunk key "<cx>,<cy>".
 * Shared by the browser and the server; every input from the network is checked, never trusted.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolFog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SIZE = 32, BYTES = SIZE * SIZE / 8, CHARS = 172;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const VAL = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) VAL[B64.charCodeAt(i)] = i;
  const KEY = /^-?\d{1,6},-?\d{1,6}$/;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  const empty = () => new Uint8Array(BYTES);
  function has(bits, lx, ly) { const i = ly * SIZE + lx; return (bits[i >> 3] >> (i & 7)) & 1; }
  function set(bits, lx, ly) {
    const i = ly * SIZE + lx, b = 1 << (i & 7);
    if (bits[i >> 3] & b) return false;
    bits[i >> 3] |= b;
    return true;
  }
  function count(bits) {
    let n = 0;
    for (let i = 0; i < BYTES; i++) { let v = bits[i]; while (v) { v &= v - 1; n++; } }
    return n;
  }

  function encode(bits) {
    let s = '';
    for (let i = 0; i < BYTES; i += 3) {
      const two = i + 1 < BYTES, three = i + 2 < BYTES;
      const n = (bits[i] << 16) | ((two ? bits[i + 1] : 0) << 8) | (three ? bits[i + 2] : 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (two ? B64[(n >> 6) & 63] : '=') + (three ? B64[n & 63] : '=');
    }
    return s;
  }

  function decode(str) {
    if (typeof str !== 'string' || str.length !== CHARS || str.charCodeAt(CHARS - 1) !== 61 /* '=' */) return null;
    const out = new Uint8Array(BYTES);
    let o = 0;
    for (let i = 0; i < CHARS; i += 4) {
      const last = i === CHARS - 4;
      let n = 0;
      for (let k = 0; k < 4; k++) {
        if (last && k === 3) { n <<= 6; continue; }
        const code = str.charCodeAt(i + k);
        const v = code < 128 ? VAL[code] : -1;
        if (v < 0) return null;
        n = (n << 6) | v;
      }
      out[o++] = (n >> 16) & 255;
      out[o++] = (n >> 8) & 255;
      if (!last) out[o++] = n & 255;
    }
    return out;
  }

  function orInto(target, bits) {
    let changed = false;
    for (let i = 0; i < BYTES; i++) {
      const v = target[i] | bits[i];
      if (v !== target[i]) { target[i] = v; changed = true; }
    }
    return changed;
  }

  // Merges a { key: base64 } diff into a { key: base64 } map in place and returns only what changed.
  // Bad keys and values are skipped; `limit` (optional) caps how many chunks the map may hold.
  function mergeMap(map, diff, limit) {
    const changed = {};
    if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return changed;
    let size = Object.keys(map).length;
    for (const k of Object.keys(diff)) {
      if (!KEY.test(k)) continue;
      const bits = decode(diff[k]);
      if (!bits) continue;
      const had = own(map, k) ? decode(map[k]) : null;
      if (had) {
        if (orInto(had, bits)) { map[k] = encode(had); changed[k] = map[k]; }
        continue;
      }
      if (!own(map, k)) {
        if (limit != null && size >= limit) continue;
        size++;
      }
      map[k] = encode(bits);
      changed[k] = map[k];
    }
    return changed;
  }

  return { SIZE, BYTES, KEY, empty, has, set, count, encode, decode, orInto, mergeMap };
});
