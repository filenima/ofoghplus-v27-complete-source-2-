'use strict';

/**
 * diag-preload.js — پل IPC پنجرهٔ «تشخیص مشکلات»
 * گزارش چک‌لیست سلامت را از پروسهٔ اصلی می‌گیرد.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diagApi', {
  rerun: () => ipcRenderer.invoke('app:diagRerun'),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
  copyReport: () => ipcRenderer.invoke('app:diagCopy', collectText()),
  onReport: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('diag-report', (e, report) => cb(e, report));
  },
  onWait: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('diag-wait', () => cb());
  },
});

/** متن قابل‌کپیِ گزارشِ روی صفحه (بدون وابستگی به DOMِ بیرون preload) */
function collectText() {
  try {
    const summary = document.getElementById('summary');
    const list = document.getElementById('list');
    const label = { ok: 'سالم', warn: 'هشدار', fail: 'مشکل' };
    const lines = ['گزارش تشخیص مشکلات — حسابداری افق پلاس'];
    if (summary) lines.push(summary.textContent || '');
    if (list) {
      const rows = list.querySelectorAll('.row');
      for (let i = 0; i < rows.length; i++) {
        const badge = rows[i].querySelector('.badge');
        const t = rows[i].querySelector('.t');
        const d = rows[i].querySelector('.d');
        const f = rows[i].querySelector('.f');
        let line = (badge ? '[' + (label[rows[i].className.replace('row ', '').trim()] || badge.textContent) + '] ' : '[؟] ') +
          (t ? t.textContent.replace(badge ? badge.textContent : '', '').trim() : '');
        if (d) line += ' — ' + (d.textContent || '').trim();
        if (f) line += ' | راه‌حل: ' + (f.textContent || '').trim();
        lines.push(line);
      }
    }
    return lines.join('\n');
  } catch (e) {
    return '';
  }
}
