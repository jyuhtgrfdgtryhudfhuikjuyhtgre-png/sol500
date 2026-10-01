/*
 * SOL 500 — LAN co-op client. Talks to server.js: JSON POSTs for actions, Server-Sent Events for room updates.
 * Session { code, playerId, token } lives in sessionStorage, so each browser tab is its own player.
 */
(function (root) {
  'use strict';
  const KEY = 'sol500.lan';
  let es = null;
  let session = null;

  async function info() {
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      const r = await fetch('/api/info', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.lan ? j : null;
    } catch (e) {
      return null;
    }
  }

  async function post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) {
      return { error: 'network' };
    }
  }

  function save(s) {
    session = { code: s.code, playerId: s.playerId, token: s.token };
    try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch (e) { /* private mode: keep in memory */ }
  }

  function restore() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (s && s.code && s.playerId && s.token) session = s;
    } catch (e) { session = null; }
    return session;
  }

  function clear() {
    session = null;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  async function create(name) {
    const j = await post('/api/room/create', { name });
    if (j.code) save(j);
    return j;
  }

  async function join(code, name) {
    const j = await post('/api/room/join', { code: String(code || '').trim().toUpperCase(), name });
    if (j.code) save(j);
    return j;
  }

  function connect(onRoom, onStatus, onPos) {
    if (!session) return;
    disconnect();
    const q = new URLSearchParams({ code: session.code, player: session.playerId, token: session.token });
    es = new EventSource('/api/room/stream?' + q.toString());
    es.addEventListener('room', e => {
      try { onRoom(JSON.parse(e.data)); } catch (err) { /* ignore malformed frame */ }
    });
    es.addEventListener('pos', e => {
      try { if (onPos) onPos(JSON.parse(e.data)); } catch (err) { /* ignore malformed frame */ }
    });
    es.addEventListener('gone', () => {
      disconnect();
      clear();
      onStatus('gone');
    });
    es.onopen = () => onStatus('open');
    es.onerror = () => onStatus('error');
  }

  function disconnect() {
    if (es) { es.close(); es = null; }
  }

  function act(type, payload) {
    if (!session) return Promise.resolve({ error: 'noSession' });
    return post('/api/room/act', Object.assign({ code: session.code, player: session.playerId, token: session.token, type }, payload || {}));
  }

  root.SolNet = { info, create, join, restore, clear, connect, disconnect, act, session: () => session };
})(typeof self !== 'undefined' ? self : this);
