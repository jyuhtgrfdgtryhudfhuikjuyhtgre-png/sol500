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

let win = null;
let server = null;
let port = 0;

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
  server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  port = server.address().port;
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
    createWindow();
    if (process.env.SOL_SMOKE) require('./smoke.js').run({ win, port, app, startOnline: null });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (server) server.close(); });
}
