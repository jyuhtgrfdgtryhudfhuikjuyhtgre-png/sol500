/*
 * SOL 500 — co-op client. Talks to server.js: JSON POSTs for actions, one WebSocket for live updates.
 * Works on the home network (ws://) and through the Cloudflare share link (wss://).
 * Session { code, playerId, token } lives in sessionStorage, so each browser tab is its own player.
 */
(function (root) {
  'use strict';
  const KEY = 'sol500.lan';
  let session = null;
  let ws = null;        // the live socket, or null
  let handlers = null;  // { onRoom, onStatus, onPos } while connected
  let retry = 0;
  let timer = null;
  let gen = 0;          // bumped by disconnect(): tells an in-flight recover() it is stale
  let hiddenAt = 0;

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

  function socketUrl() {
    const q = new URLSearchParams({ code: session.code, player: session.playerId, token: session.token });
    return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws?' + q.toString();
  }

  function connect(onRoom, onStatus, onPos) {
    if (!session) return;
    disconnect();
    handlers = { onRoom, onStatus, onPos };
    open();
  }

  function open() {
    timer = null;
    if (!session || !handlers) return;
    if (ws) { const old = ws; ws = null; old.close(); } // never leave two sockets open
    const h = handlers;
    const sock = new WebSocket(socketUrl());
    ws = sock;
    sock.onopen = () => { retry = 0; h.onStatus('open'); };
    sock.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (!msg) return;
      if (msg.t === 'room') h.onRoom(msg.d);
      else if (msg.t === 'pos') { if (h.onPos) h.onPos(msg.d); }
      else if (msg.t === 'event' && msg.d && (msg.d.kind === 'kicked' || msg.d.kind === 'closed')) gone();
    };
    sock.onclose = () => {
      if (ws !== sock) return; // closed on purpose
      ws = null;
      h.onStatus('error');
      recover();
    };
  }

  // A refused socket looks just like a network error, so ask the server whether this seat still exists.
  async function recover() {
    const s = session;
    const g = gen;
    if (!s || !handlers) return;
    try {
      const q = new URLSearchParams({ code: s.code, player: s.playerId, token: s.token });
      const r = await fetch('/api/room/state?' + q.toString(), { cache: 'no-store' });
      if (r.status === 403) { gone(); return; }
    } catch (e) { /* host unreachable for now: keep trying */ }
    if (g !== gen || session !== s || !handlers) return; // disconnected or reconnected meanwhile
    timer = setTimeout(open, Math.min(5000, 500 * Math.pow(2, retry++)));
  }

  function gone() {
    const h = handlers;
    disconnect();
    clear();
    if (h) h.onStatus('gone');
  }

  function disconnect() {
    gen++;
    clearTimeout(timer);
    timer = null;
    handlers = null;
    const s = ws;
    ws = null;
    if (s) s.close();
  }

  // After sleep or a silent Wi-Fi drop the browser can keep a dead socket without firing onclose: replace it.
  function refresh() {
    if (!session || !handlers) return;
    gen++;
    clearTimeout(timer);
    retry = 0;
    const old = ws;
    ws = null; // so its onclose is ignored
    if (old) old.close();
    open();
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 15000) refresh();
      hiddenAt = 0;
    });
  }

  function act(type, payload) {
    if (!session) return Promise.resolve({ error: 'noSession' });
    return post('/api/room/act', Object.assign({ code: session.code, player: session.playerId, token: session.token, type }, payload || {}));
  }

  function sendPos(pos) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'pos', d: pos }));
  }

  // Play-testing hook: drops the socket the way a Wi-Fi blip would, so reconnection can be checked in a real browser.
  function dropForTest() { if (ws) ws.close(); }

  // A finished solo game, for the host's admin panel. Fire and forget: the game never waits on it. The explored-map
  // bitsets (from M3) are dropped first so the mission stays far under the server's 64 KB limit.
  function recordSolo(mission, player) {
    const m = Object.assign({}, mission);
    if (m.expedition) m.expedition = Object.assign({}, m.expedition, { revealed: {} });
    return post('/api/history/solo', { mission: m, player: player || '' });
  }

  root.SolNet = { info, create, join, restore, clear, connect, disconnect, act, sendPos, dropForTest, recordSolo, session: () => session };
})(typeof self !== 'undefined' ? self : this);
