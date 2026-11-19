'use strict';

/**
 * splash-preload.js — پل امن IPC پنجرهٔ Splash (contextIsolation روشن است)
 * پیام‌های پیشرفتِ راه‌اندازی سرور از پروسهٔ اصلی به صفحه می‌رسد.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashApi', {
  onProgress: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('splash-progress', (e, msg) => cb(msg));
  },
});
