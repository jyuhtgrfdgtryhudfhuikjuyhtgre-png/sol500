'use strict';
// The only bridge between the game page and the app. Everything else stays sandboxed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solApp', {
  info: () => ipcRenderer.invoke('app:info'),
  hostOnline: () => ipcRenderer.invoke('online:start'),
  stopOnline: () => ipcRenderer.invoke('online:stop'),
  openHost: (address, code) => ipcRenderer.invoke('join:open', { address, code }),
  onOnline: cb => { ipcRenderer.on('online:status', (_e, s) => cb(s)); },
});
