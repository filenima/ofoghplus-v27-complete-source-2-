'use strict';

/**
 * error-preload.js — پل IPC پنجرهٔ خطا
 * دکمه‌ها: «تلاش دوباره»، «باز کردن پوشهٔ لاگ»، «کپی اطلاعات خطا برای پشتیبانی»، «راهنمای رفع مشکل»
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('errorApi', {
  retry: () => ipcRenderer.invoke('app:retry'),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
  openGuide: () => ipcRenderer.invoke('app:openGuide'),
  copyError: () => ipcRenderer.invoke('app:copyError'),
  onErrorUpdate: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('error-update', (e, err, hint) => cb(e, err, hint));
  },
});
