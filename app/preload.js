'use strict';
// The only bridge between the game page and the app. Everything else stays sandboxed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solApp', {
  info: () => ipcRenderer.invoke('app:info'),
});
