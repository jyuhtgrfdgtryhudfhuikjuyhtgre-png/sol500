'use strict';
// The only bridge between the game page and the app. Everything else stays sandboxed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solApp', {
  info: () => ipcRenderer.invoke('app:info'),
  hostOnline: () => ipcRenderer.invoke('online:start'),
  stopOnline: () => ipcRenderer.invoke('online:stop'),
  onOnline: cb => { ipcRenderer.on('online:status', (_e, s) => cb(s)); },
});
