'use strict';
/*
 * SOL 500 desktop app: starts the game server inside the app, then shows the game in its own window.
 * Friends on the same Wi-Fi (or through the share link) connect to this same server.
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('../server.js');
const { pickPort } = require('./port.js');
const QRCode = require('qrcode');
const tunnel = require('./tunnel.js');
const { joinUrl } = require('./join.js');

let win = null;
let server = null;
let port = 0;
let online = null;   // { url, stop } while sharing
let starting = null; // the pending start, so a double click can't open two tunnels

function sendStatus(s) {
  // The admin panel's Live tab shows the share link too.
  if (server && server.setOnline) server.setOnline(s.state === 'on' ? { url: s.url, qr: s.qr } : null);
  if (win && !win.isDestroyed()) win.webContents.send('online:status', s);
}

let generation = 0;  // bumped by stopOnline(), so a start still in flight knows it was cancelled
let abort = new AbortController(); // one per generation: stopOnline() aborts the download, the start and the probe
const fail = (message, code) => Object.assign(new Error(message), { code });

async function doStartOnline() {
  if (!online) {
    const gen = generation;
    const signal = abort.signal;
    let t = null;
    t = await tunnel.start({
      port,
      signal,
      binDir: path.join(app.getPath('userData'), 'bin'),
      onStatus: s => { if (gen === generation) sendStatus(s); },
      onExit: err => { if (online !== t) return; online = null; sendStatus({ state: 'off', error: err ? err.code : null }); },
    });
    if (gen !== generation) { t.stop(); sendStatus({ state: 'off', error: null }); return { error: 'cancelled' }; }
    online = t;
    // New quick-tunnel names can take a few seconds to resolve: don't announce the link before it answers.
    sendStatus({ state: 'starting' });
    await tunnel.waitUntilReachable(t.url, { signal });
    if (gen !== generation) return { error: 'cancelled' };
    if (online !== t) throw fail('the share link stopped while it was opening', 'exited');
  }
  const qr = await QRCode.toDataURL(online.url, { margin: 1, width: 240, color: { dark: '#1b1417', light: '#ffffff' } });
  sendStatus({ state: 'on', url: online.url, qr });
  return { url: online.url, qr };
}

function startOnline() {
  if (!starting) starting = doStartOnline().finally(() => { starting = null; });
  return starting;
}

function stopOnline() {
  generation++;
  abort.abort();
  abort = new AbortController();
  const o = online;
  online = null;
  if (o) o.stop();
  sendStatus({ state: 'off', error: null });
}

// Check mode: host a room in the window and press "Host online" like a player would.
function uiStartOnline() {
  return win.webContents.executeJavaScript(`(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const until = async (sel, ms) => { for (let t = 0; t < ms; t += 200) { const el = document.querySelector(sel); if (el) return el; await wait(200); } return null; };
    document.querySelector('[data-k="host-game"]').click(); await wait(200);
    const name = document.getElementById('lan-me'); name.value = 'Host'; name.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-k="lan-host"]').click();
    const btn = await until('[data-k="online-start"]', 5000);
    if (!btn) return { error: 'no online button in the lobby' };
    btn.click();
    const link = await until('[data-k="online-url"]', 120000);
    if (!link) return { error: (SolUI.store.online && SolUI.store.online.error) || 'no link' };
    const chip = document.querySelector('[data-k="online-chip"]'); // the topbar chip opens the link dialog
    if (chip) { chip.click(); await wait(500); }
    return { url: link.textContent, room: SolUI.store.room && SolUI.store.room.code, dialog: SolUI.store.modal === 'online' && !!document.querySelector('.modal [data-k="online-url"]') };
  })()`);
}

const sizeFile = () => path.join(app.getPath('userData'), 'window.json');
function loadSize() { try { return JSON.parse(fs.readFileSync(sizeFile(), 'utf8')); } catch (e) { return null; } }
function saveSize() {
  try {
    if (win && !win.isMinimized() && !win.isMaximized()) {
      const { width, height } = win.getBounds();
      fs.writeFileSync(sizeFile(), JSON.stringify({ width, height }));
    }
  } catch (e) { /* not critical */ }
}

async function startServer() {
  port = await pickPort();
  server = createServer({ dataDir: app.getPath('userData'), allowProgressRefresh: !app.isPackaged });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  port = server.address().port;
}

// Only pages from this app's own server (the game or its admin panel) may drive the app.
function fromGame(e) {
  const from = (e.senderFrame && e.senderFrame.url) || (e.sender && e.sender.getURL()) || '';
  return from.startsWith('http://localhost:' + port + '/');
}

function createWindow() {
  const size = loadSize();
  win = new BrowserWindow({
    width: size ? size.width : 1280, height: size ? size.height : 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#1b1417', title: 'SOL 500', show: false,
    icon: path.join(__dirname, '..', 'icons', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  const origin = 'http://localhost:' + port;
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin + '/')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url); // science sources open in the normal browser
    return { action: 'deny' };
  });
  win.once('ready-to-show', () => win.show());
  win.on('close', saveSize);
  win.loadURL(origin + '/?app=1');
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0); // a second double-click: the first window gets focused instead
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    try {
      await startServer();
    } catch (e) {
      dialog.showErrorBox('SOL 500', 'The game server could not start: ' + e.message);
      app.exit(1);
      return;
    }
    ipcMain.handle('app:info', () => ({ port }));
    ipcMain.handle('online:start', async e => {
      if (!fromGame(e)) return { error: 'forbidden' };
      try {
        return await startOnline();
      } catch (e) {
        const error = e.code || 'failed';
        sendStatus({ state: 'off', error: error === 'cancelled' ? null : error }); // Cancel is not a failure
        return { error };
      }
    });
    ipcMain.handle('online:stop', e => { if (!fromGame(e)) return { error: 'forbidden' }; stopOnline(); return { ok: true }; });
    // "Join game": the host's game opens in the friend's normal browser, never in this window (it has window.solApp).
    ipcMain.handle('join:open', async (e, req) => {
      if (!fromGame(e)) return { error: 'forbidden' };
      const url = joinUrl(req && req.address, req && req.code);
      if (!url) return { error: 'badAddr' };
      try { await shell.openExternal(url); } catch (err) { return { error: 'openFailed' }; }
      return { ok: true };
    });
    createWindow();
    if (process.env.SOL_SMOKE) require('./smoke.js').run({ win, port, app, startOnline: uiStartOnline });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { stopOnline(); if (server) server.close(); });
}
