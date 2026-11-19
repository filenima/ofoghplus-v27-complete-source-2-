'use strict';

/**
 * preload.js — پل امن IPC پنجرهٔ اصلی (contextIsolation روشن است)
 * فقط APIهای بی‌خطر به صفحه داده می‌شوند.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ofoghDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: ipcRenderer.invoke('app:version'),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
});
