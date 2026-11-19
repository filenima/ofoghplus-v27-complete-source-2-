'use strict';

/**
 * main.js — پروسهٔ اصلی Electron «حسابداری افق پلاس» (بازسازی R17-A)
 * ============================================================================
 * جریان اجرا — طراحی‌شده برای این که هرگز «کلیک شد ولی هیچ اتفاقی نیفتاد»
 * رخ ندهد:
 *
 *  ۱) app.setName در همان خط اول → پوشهٔ داده‌ها %APPDATA%\OfoghPlus می‌شود
 *     (ASCII و بدون فاصله) تا مسیرها هیچ‌وقت در taskkill/NSIS/لاگ‌ها نشکنند.
 *  ۲) قفل تک‌نمونه — اجرای دوم فقط پنجرهٔ موجود را جلو می‌آورد (یا می‌سازد).
 *  ۳) پنجرهٔ Splash فارسی بلافاصله باز می‌شود (کاربر همان لحظه چیزی می‌بیند).
 *  ۴) crash-handler سراسری (uncaughtException / unhandledRejection) → به‌جای
 *     مرگِ بی‌صدای پروسه، پنجرهٔ خطای فارسی با دکمهٔ «تلاش دوباره»،
 *     «باز کردن پوشهٔ لاگ»، «کپی اطلاعات خطا برای پشتیبانی» و «راهنما».
 *  ۵) چرخهٔ کرش (۲ بار کرشِ متوالی) → دفعهٔ بعد شتاب سخت‌افزاری GPU خاموش
 *     می‌شود (کارت‌های گرافیک قدیمی ویندوز ۷ رایج‌ترین علت مرگِ خاموش کرومیم‌اند).
 *  ۶) منوی «کمک ← تشخیص مشکلات» → چک‌لیست سلامت (server.js، node.exe،
 *     دیتابیس، پورت آزاد، فضای دیسک، ...) با گزارش فارسی و دکمهٔ کپی.
 *  ۷) خروج → taskkill مطمئن پروسهٔ node (بدون پروسهٔ یتیم در Task Manager).
 *
 * سازگار با Electron 22.3.27 (Win 7/8 — Node 16.17) و Electron مدرن
 * (Win 10/11) — بدون سینتکس جدید جاوااسکریپت.
 */

const { app, BrowserWindow, clipboard, dialog, Menu, shell, Tray, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

/* ─────────────────────────── نام و ثابت‌ها ─────────────────────────── */

// قبل از هر کاری که به userData وابسته است — نام ASCII و بدون فاصله.
// (بدون این، پوشهٔ داده‌ها «حسابداری افق پلاس» با فاصله می‌شد و مسیرهای
//  طولانی در spawn/taskkill/NSIS مستعد شکست هستند.)
try {
  app.setName('OfoghPlus');
} catch (e) {
  /* در حالت‌های خیلی غیرعادی نادیده گرفته می‌شود */
}
try {
  app.setAppUserModelId('ir.ofoghplus.hesabdari');
} catch (e) {
  /* فقط برای نوتیفیکیشن ویندوز ۱۰+ */
}

const serverManager = require('./server-manager');

const APP_NAME_FA = 'حسابداری افق پلاس';
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_MAX_BYTES = 2 * 1024 * 1024; // ۲ مگابایت
const LOG_KEEP = 3; // main.log + main.1.log + main.2.log

let mainWindow = null; // پنجرهٔ اصلی
let splashWindow = null; // پنجرهٔ بارگذاری
let errorWindow = null; // پنجرهٔ خطا
let guideWindow = null; // پنجرهٔ راهنمای رفع اشکال
let diagWindow = null; // پنجرهٔ تشخیص مشکلات
let tray = null; // آیکن کنار ساعت
let quitting = false; // در جریان خروج کامل
let closeToTrayAsked = false; // یک‌بار دربارهٔ بستن به tray پرسیده‌ایم؟
let lastErrorText = ''; // آخرین متن خطا (برای دکمهٔ کپی)
let lastErrorHint = ''; // آخرین راهنمای خطا
let isPortable = false; // نسخهٔ پرتابل (بدون نصب)

try {
  isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR); // electron-builder portable
} catch (e) {
  isPortable = false;
}

/* ─────────────────────────── لاگ چرخشی ─────────────────────────── */

/** اگر فایل از ۲MB گذشت: قدیمی‌ترین حذف، بقیه یک پله عقب (×۳ فایل) */
function rotateIfNeeded(base) {
  try {
    if (!fs.existsSync(base)) return;
    if (fs.statSync(base).size < LOG_MAX_BYTES) return;
    const b = base.slice(0, -4); // حذف پسوند .log
    try {
      fs.unlinkSync(b + '.2.log');
    } catch (e) {
      /* شاید وجود نداشته باشد */
    }
    try {
      fs.renameSync(b + '.1.log', b + '.2.log');
    } catch (e) {
      /* شاید وجود نداشته باشد */
    }
    try {
      fs.renameSync(base, b + '.1.log');
    } catch (e) {
      /* ignore */
    }
  } catch (e) {
    /* چرخش لاگ هرگز برنامه را نمی‌شکند */
  }
}

function log(line) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, 'main.log');
    rotateIfNeeded(file);
    fs.appendFileSync(file, '[' + new Date().toISOString() + '] ' + line + '\n', 'utf8');
  } catch (e) {
    /* لاگ هرگز برنامه را نمی‌شکند */
  }
}

/* ─────────────────────────── نشانگر چرخهٔ کرش ─────────────────────────── */

/** اگر برنامه دو بار پشت‌سرهم کرش کرده باشد، اجرای بعدی بدون GPU شروع می‌شود */
function crashMarkerPath() {
  return path.join(app.getPath('userData'), 'crash.count');
}

function readCrashCount() {
  try {
    return parseInt(fs.readFileSync(crashMarkerPath(), 'utf8'), 10) || 0;
  } catch (e) {
    return 0;
  }
}

function bumpCrashMarker() {
  try {
    fs.mkdirSync(path.dirname(crashMarkerPath()), { recursive: true });
    fs.writeFileSync(crashMarkerPath(), String(readCrashCount() + 1), 'utf8');
  } catch (e) {
    /* ignore */
  }
}

function resetCrashMarker() {
  try {
    fs.unlinkSync(crashMarkerPath());
  } catch (e) {
    /* ignore */
  }
}

/* ─────────────────────────── ابزارها ─────────────────────────── */

function appIcon() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.ico'),
  ];
  for (let i = 0; i < candidates.length; i++) {
    try {
      if (candidates[i] && fs.existsSync(candidates[i])) return nativeImage.createFromPath(candidates[i]);
    } catch (e) {
      /* ادامه */
    }
  }
  return nativeImage.createEmpty();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** اطلاعات کامل محیط — برای «کپی اطلاعات خطا برای پشتیبانی» */
function buildErrorReport(err, kind) {
  const lines = [];
  lines.push('نرم‌افزار: ' + APP_NAME_FA);
  lines.push('نسخه: ' + app.getVersion());
  lines.push('نوع خطا: ' + (kind || 'خطای سرور محلی'));
  try {
    lines.push('ویندوز: ' + os.release() + ' (' + os.arch() + ')');
  } catch (e) {
    /* ignore */
  }
  try {
    lines.push('Electron: ' + process.versions.electron + ' / Chromium: ' + process.versions.chrome + ' / Node: ' + process.versions.node);
  } catch (e) {
    /* ignore */
  }
  lines.push('زمان: ' + new Date().toISOString());
  lines.push('');
  if (err) {
    lines.push('پیام خطا:');
    lines.push(String(err && err.stack ? err.stack : err));
    lines.push('');
  }
  const tail = serverManager.tailServerLog(4000);
  if (tail) {
    lines.push('— آخرین خطوط لاگ سرور —');
    lines.push(tail);
  }
  return lines.join('\n');
}

/* ─────────────────────────── پنجرهٔ Splash ─────────────────────────── */

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 330,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    transparent: false,
    backgroundColor: '#0f172a',
    show: true,
    skipTaskbar: false, // در نوار وظیفه دیده شود تا کاربر مطمئن شود باز شده
    icon: appIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js'),
    },
  });
  splashWindow.setMenu(null);
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderSplashHtml()));
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function renderSplashHtml() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,sans-serif; background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 55%,#4c1d95 100%); color:#f8fafc; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; user-select:none; }
  .logo { width:74px; height:74px; border-radius:20px; background:linear-gradient(135deg,#8b5cf6,#10b981); display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:900; box-shadow:0 12px 40px rgba(139,92,246,.45); }
  h1 { font-size:19px; font-weight:800; }
  .spinner { width:34px; height:34px; border-radius:50%; border:3px solid rgba(255,255,255,.18); border-top-color:#34d399; animation:spin .9s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  #msg { font-size:12.5px; color:#c7d2fe; min-height:18px; text-align:center; padding:0 24px; }
  .ver { position:absolute; bottom:12px; left:0; right:0; text-align:center; font-size:11px; color:#94a3b8; }
</style></head><body>
  <div class="logo">افق</div>
  <h1>${APP_NAME_FA}</h1>
  <div class="spinner"></div>
  <div id="msg">در حال آماده‌سازی سرور محلی…</div>
  <div class="ver">نسخهٔ ${app.getVersion()}</div>
<script>
  if (window.splashApi && window.splashApi.onProgress) {
    window.splashApi.onProgress(function (msg) {
      document.getElementById('msg').textContent = msg;
    });
  }
</script>
</body></html>`;
}

/* ─────────────────────────── پنجرهٔ خطا ─────────────────────────── */

function showErrorWindow(errText, hint) {
  lastErrorText = String(errText || 'خطای ناشناخته');
  lastErrorHint = String(hint || '');

  if (errorWindow && !errorWindow.isDestroyed()) {
    try {
      errorWindow.webContents.send('error-update', lastErrorText, lastErrorHint);
      errorWindow.show();
      errorWindow.focus();
    } catch (e) {
      /* ignore */
    }
    return;
  }

  errorWindow = new BrowserWindow({
    width: 660,
    height: 560,
    resizable: false,
    center: true,
    title: 'خطا در اجرای ' + APP_NAME_FA,
    backgroundColor: '#fef2f2',
    icon: appIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'error-preload.js'),
    },
  });
  errorWindow.setMenu(null);
  errorWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderErrorHtml()));
  errorWindow.on('closed', () => {
    errorWindow = null;
  });
}

function renderErrorHtml() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,sans-serif; background:#fef2f2; color:#7f1d1d; padding:24px; height:100vh; display:flex; flex-direction:column; gap:12px; }
  h1 { font-size:17px; display:flex; align-items:center; gap:10px; }
  .ic { width:38px; height:38px; border-radius:11px; background:#fee2e2; border:1px solid #fecaca; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:900; color:#dc2626; }
  .box { background:#fff; border:1px solid #fecaca; border-radius:14px; padding:14px 16px; font-size:13px; line-height:2; overflow:auto; flex:1; }
  #hint { margin-top:6px; }
  code { direction:ltr; display:block; text-align:left; font-size:11.5px; color:#991b1b; background:#fef2f2; border-radius:8px; padding:8px 10px; margin-top:8px; word-break:break-all; white-space:pre-wrap; }
  .row { display:flex; gap:8px; }
  button { border:0; border-radius:12px; padding:12px 10px; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer; }
  .retry { background:#dc2626; color:#fff; flex:1.2; }
  .retry:hover { background:#b91c1c; }
  .ghost { background:#fff; color:#7f1d1d; border:1px solid #fecaca !important; flex:1; }
  .ghost:hover { background:#fef2f2; }
</style></head><body>
  <h1><span class="ic">!</span> برنامه نتوانست شروع شود</h1>
  <div class="box">
    <b>چه اتفاقی افتاد؟</b><br>
    موتور داخلی برنامه راه‌اندازی نشد. داده‌های حسابداری شما سالم است و حذف نشده است.
    <div id="hint">${lastErrorHint || ''}</div>
    <code id="err">${escapeHtml(lastErrorText)}</code>
  </div>
  <div class="row">
    <button class="ghost" id="btnLogs">باز کردن پوشهٔ لاگ</button>
    <button class="ghost" id="btnGuide">راهنمای رفع مشکل</button>
    <button class="ghost" id="btnCopy">کپی اطلاعات خطا برای پشتیبانی</button>
    <button class="retry" id="btnRetry">تلاش دوباره</button>
  </div>
<script>
  function bind(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); }
  bind('btnRetry', function () { if (window.errorApi) window.errorApi.retry(); });
  bind('btnLogs', function () { if (window.errorApi) window.errorApi.openLogs(); });
  bind('btnGuide', function () { if (window.errorApi) window.errorApi.openGuide(); });
  bind('btnCopy', function () {
    if (window.errorApi) {
      window.errorApi.copyError();
      var el = document.getElementById('btnCopy');
      if (el) { el.textContent = 'کپی شد'; setTimeout(function () { el.textContent = 'کپی اطلاعات خطا برای پشتیبانی'; }, 1600); }
    }
  });
  if (window.errorApi && window.errorApi.onErrorUpdate) {
    window.errorApi.onErrorUpdate(function (e, err, hint) {
      document.getElementById('err').textContent = err || '';
      var h = document.getElementById('hint');
      if (h) h.innerHTML = hint || '';
    });
  }
</script>
</body></html>`;
}

/* ─────────────────────────── پنجرهٔ راهنما ─────────────────────────── */

function openGuide() {
  if (guideWindow && !guideWindow.isDestroyed()) {
    guideWindow.show();
    guideWindow.focus();
    return;
  }
  guideWindow = new BrowserWindow({
    width: 720,
    height: 640,
    center: true,
    title: 'راهنمای رفع مشکل — ' + APP_NAME_FA,
    backgroundColor: '#f8fafc',
    icon: appIcon(),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  guideWindow.setMenu(null);
  guideWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderGuideHtml()));
  guideWindow.on('closed', () => {
    guideWindow = null;
  });
}

function renderGuideHtml() {
  const items = [
    ['برنامه را بسته‌ام ولی دوباره باز نمی‌شود',
      'پروسهٔ قبلی در حافظه مانده است. از منوی کنار ساعت (پایین صفحه) روی «خروج کامل» بزنید، یا ویندوز را یک‌بار ری‌استارت کنید و دوباره اجرا کنید.'],
    ['ویندوز هشدار SmartScreen داد (Windows protected your PC)',
      'فایل نصب امضای دیجیتال ندارد. روی «More info» و سپس «Run anyway» کلیک کنید. این هشدار به معنای ویروس بودن برنامه نیست.'],
    ['آنتی‌ویروس فایل برنامه را قرنطینه یا حذف کرد',
      'پوشهٔ نصب (معمولاً C:\\Users\\نام‌کاربری\\AppData\\Local\\Programs\\OfoghPlus) و %APPDATA%\\OfoghPlus را در لیست استثنائات (Exclusions) آنتی‌ویروس قرار دهید و برنامه را دوباره نصب کنید.'],
    ['ویندوز ۷: پیام «api-ms-win-crt…dll not found» یا «VCRUNTIME140.dll missing»',
      'فایل‌های نصب Visual C++ را از مسیر نصب (پوشهٔ resources\\redist) به‌صورت دستی اجرا کنید یا هر دو به‌روزرسانی KB3126587 و KB3063858 ویندوز را نصب کنید و سپس برنامه را دوباره اجرا کنید.'],
    ['ویندوز ۷: برنامه اصلاً باز نمی‌شود و هیچ پیامی هم نمی‌دهد',
      'حتماً ویندوز ۷ با Service Pack 1 و به‌روزرسانی KB4474419 (پشتیبانی امضای SHA-2) نصب باشد. نسخهٔ «Legacy» مخصوص ویندوز ۷/۸ را نصب کرده باشید، نه نسخهٔ معمولی.'],
    ['صفحهٔ برنامه سفید ماند یا «اتصال رد شد» داد',
      'روی دکمهٔ «تلاش دوباره» بزنید. اگر تکرار شد از منوی کمک گزینهٔ «تشخیص مشکلات» را اجرا کنید و نتیجه را برای پشتیبانی کپی کنید.'],
    ['برنامه کند باز می‌شود (به‌خصوص اولین اجرا)',
      'طبیعی است؛ اولین اجرا دیتابیس را آماده‌سازی می‌کند و روی هارد دیسک‌های قدیمی تا یک دقیقه طول می‌کشد. اجراهای بعدی سریع است.'],
    ['رمز عبور اول برنامه چقدر است؟',
      'نام کاربری admin و رمز admin1234 است. بلافاصله بعد از ورود از تنظیمات، رمز را تغییر دهید.'],
    ['داده‌های من کجاست؟ حذف برنامه داده‌ها را پاک می‌کند؟',
      'داده‌ها در %APPDATA%\\OfoghPlus نگه‌داری می‌شود و حذف برنامه آن را پاک نمی‌کند. برای انتقال به سیستم دیگر همین پوشه را کپی کنید.'],
    ['می‌خواهم برنامه هنگام روشن شدن ویندوز خودکار اجرا شود',
      'روی آیکن برنامه در کنار ساعت (پایین راست) راست‌کلیک کنید و گزینهٔ «اجرای خودکار هنگام روشن شدن ویندوز» را فعال کنید.'],
  ];
  let rows = '';
  for (let i = 0; i < items.length; i++) {
    rows +=
      '<div class="qa"><div class="q">' + escapeHtml(items[i][0]) + '</div><div class="a">' +
      escapeHtml(items[i][1]) + '</div></div>';
  }
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,sans-serif; background:#f8fafc; color:#0f172a; padding:22px; }
  h1 { font-size:17px; margin-bottom:4px; }
  .sub { font-size:12px; color:#64748b; margin-bottom:16px; }
  .qa { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:10px; }
  .q { font-weight:700; font-size:13.5px; margin-bottom:6px; color:#1e293b; }
  .a { font-size:12.5px; line-height:2; color:#334155; }
</style></head><body>
  <h1>راهنمای رفع اشکال ${APP_NAME_FA}</h1>
  <div class="sub">اگر مشکل شما در این فهرست نبود، از منوی کمک گزینهٔ «تشخیص مشکلات» را اجرا کنید و گزارش آن را برای پشتیبانی بفرستید.</div>
  ${rows}
</body></html>`;
}

/* ─────────────────────────── پنجرهٔ تشخیص مشکلات ─────────────────────────── */

function openDiagnostics() {
  if (diagWindow && !diagWindow.isDestroyed()) {
    diagWindow.show();
    diagWindow.focus();
    runDiagnostics();
    return;
  }
  diagWindow = new BrowserWindow({
    width: 740,
    height: 660,
    center: true,
    title: 'تشخیص مشکلات — ' + APP_NAME_FA,
    backgroundColor: '#f8fafc',
    icon: appIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'diag-preload.js'),
    },
  });
  diagWindow.setMenu(null);
  diagWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderDiagShellHtml()));
  diagWindow.on('closed', () => {
    diagWindow = null;
  });
  // وقتی preload آماده شد نتیجهٔ اول را بفرست
  diagWindow.webContents.on('did-finish-load', () => runDiagnostics());
}

function runDiagnostics() {
  if (!diagWindow || diagWindow.isDestroyed()) return;
  try {
    diagWindow.webContents.send('diag-wait');
  } catch (e) {
    /* ignore */
  }
  serverManager
    .diagnose()
    .then((checks) => {
      if (!diagWindow || diagWindow.isDestroyed()) return;
      let okCount = 0;
      let failCount = 0;
      for (let i = 0; i < checks.length; i++) {
        if (checks[i].status === 'ok') okCount++;
        else if (checks[i].status === 'fail') failCount++;
      }
      let summary;
      if (failCount === 0) summary = 'وضعیت کلی: سالم — همهٔ بررسی‌های حیاتی موفق بودند.';
      else if (failCount <= 2) summary = 'وضعیت کلی: ' + failCount + ' مورد مشکل دارد — توضیح و راه‌حل هر ردیف را بخوانید.';
      else summary = 'وضعیت کلی: نصب ناقص به نظر می‌رسد — بهتر است برنامه را حذف و دوباره نصب کنید.';
      diagWindow.webContents.send('diag-report', { checks: checks, summary: summary });
    })
    .catch((e) => {
      if (!diagWindow || diagWindow.isDestroyed()) return;
      diagWindow.webContents.send('diag-report', {
        checks: [{ title: 'اجرای بررسی', status: 'fail', detail: String(e && e.message ? e.message : e), fix: '' }],
        summary: 'بررسی خود انجام نشد.',
      });
    });
}

function renderDiagShellHtml() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,sans-serif; background:#f8fafc; color:#0f172a; padding:20px; height:100vh; display:flex; flex-direction:column; gap:12px; }
  h1 { font-size:16px; }
  #summary { font-size:13px; background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; padding:10px 12px; }
  #list { flex:1; overflow:auto; }
  .row { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:11px 13px; margin-bottom:8px; }
  .t { display:flex; align-items:center; gap:8px; font-weight:700; font-size:13px; }
  .badge { font-size:11px; font-weight:800; border-radius:999px; padding:2px 10px; }
  .ok .badge { background:#dcfce7; color:#166534; }
  .warn .badge { background:#fef9c3; color:#854d0e; }
  .fail .badge { background:#fee2e2; color:#991b1b; }
  .d { font-size:12px; color:#475569; margin-top:5px; line-height:1.9; direction:ltr; text-align:left; word-break:break-all; }
  .f { font-size:12px; color:#1d4ed8; margin-top:4px; line-height:1.9; direction:rtl; }
  .row.wait { color:#64748b; }
  .actions { display:flex; gap:8px; }
  button { border:0; border-radius:11px; padding:11px 12px; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer; background:#4f46e5; color:#fff; }
  button:hover { background:#4338ca; }
  button.ghost { background:#fff; color:#334155; border:1px solid #cbd5e1 !important; }
</style></head><body>
  <h1>تشخیص مشکلات — ${APP_NAME_FA}</h1>
  <div id="summary">در حال بررسی سلامت برنامه… چند لحظه صبر کنید.</div>
  <div id="list"><div class="row wait">بررسی وجود فایل‌های حیاتی، دیتابیس، پورت شبکه و فضای دیسک…</div></div>
  <div class="actions">
    <button id="btnAgain">بررسی دوباره</button>
    <button class="ghost" id="btnCopy">کپی گزارش برای پشتیبانی</button>
    <button class="ghost" id="btnLogs">پوشهٔ لاگ‌ها</button>
  </div>
<script>
  var lastReport = null;
  var LABEL = { ok: 'سالم', warn: 'هشدار', fail: 'مشکل' };
  if (window.diagApi) {
    window.diagApi.onReport(function (e, report) {
      lastReport = report;
      var list = document.getElementById('list');
      document.getElementById('summary').textContent = report.summary;
      var html = '';
      for (var i = 0; i < report.checks.length; i++) {
        var c = report.checks[i];
        html += '<div class="row ' + c.status + '"><div class="t"><span class="badge">' +
          (LABEL[c.status] || c.status) + '</span>' + c.title + '</div>' +
          (c.detail ? '<div class="d">' + c.detail + '</div>' : '') +
          (c.fix ? '<div class="f">' + c.fix + '</div>' : '') + '</div>';
      }
      list.innerHTML = html;
    });
    window.diagApi.onWait(function () {
      document.getElementById('summary').textContent = 'در حال بررسی سلامت برنامه… چند لحظه صبر کنید.';
      document.getElementById('list').innerHTML = '<div class="row wait">در حال بررسی…</div>';
    });
    document.getElementById('btnAgain').addEventListener('click', function () { window.diagApi.rerun(); });
    document.getElementById('btnLogs').addEventListener('click', function () { window.diagApi.openLogs(); });
    document.getElementById('btnCopy').addEventListener('click', function () {
      window.diagApi.copyReport();
      var el = document.getElementById('btnCopy');
      el.textContent = 'کپی شد';
      setTimeout(function () { el.textContent = 'کپی گزارش برای پشتیبانی'; }, 1600);
    });
  }
</script>
</body></html>`;
}

/* ─────────────────────────── پنجرهٔ اصلی ─────────────────────────── */

function createMainWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    center: true,
    show: false, // اول لود شود بعد نمایش — بدون فلش سفید
    backgroundColor: '#f8fafc',
    title: APP_NAME_FA,
    icon: appIcon(),
    autoHideMenuBar: true, // منو با Alt ظاهر می‌شود
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false,
    },
  });
  mainWindow.loadURL(targetUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  // اگر رندرِ صفحه به هر دلیلی مرد (کرومیم) → به‌جای پنجرهٔ خاکستری، reload
  mainWindow.webContents.on('render-process-gone', () => {
    log('render-process-gone — بارگذاری مجدد پنجرهٔ اصلی');
    try {
      mainWindow.reload();
    } catch (e) {
      /* ignore */
    }
  });

  // خطای بارگذاری (سرور در میانهٔ کار رفت یا پورت عوض شد) → صفحهٔ خطا، نه صفحهٔ سفید
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (String(validatedURL || '').indexOf('http://127.0.0.1:') !== 0) return;
    log('did-fail-load: ' + errorCode + ' ' + errorDescription + ' ' + validatedURL);
    showErrorWindow(
      'صفحهٔ برنامه بارگذاری نشد (' + errorCode + ' — ' + (errorDescription || '') + ')',
      '<br><b>راه‌حل:</b> دکمهٔ «تلاش دوباره» را بزنید.'
    );
  });

  // لینک‌های خارجی در مرورگر پیش‌فرض باز شوند (نه داخل برنامه)
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:\/\//.test(u) && u.indexOf('http://127.0.0.1:') !== 0) {
      shell.openExternal(u);
    }
    return { action: 'deny' };
  });

  // جابه‌جایی/درگ خارج از سرور محلی بی‌اثر (امنیت)
  mainWindow.webContents.on('will-navigate', (e, u) => {
    if (u.indexOf('http://127.0.0.1:') !== 0) e.preventDefault();
  });

  mainWindow.on('close', (e) => {
    if (quitting) return;
    if (tray) {
      if (!closeToTrayAsked) {
        // یک‌بار بپرس: بستن به tray یا خروج کامل؟
        e.preventDefault();
        closeToTrayAsked = true;
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'question',
          title: 'بستن برنامه',
          message: 'می‌خواهید برنامه بسته شود یا در پس‌زمینه (کنار ساعت) بماند؟',
          detail: 'برنامهٔ پس‌زمینه همیشه در دسترس است و سریع‌تر باز می‌شود.',
          buttons: ['بمان در پس‌زمینه', 'خروج کامل'],
          defaultId: 0,
          cancelId: -1,
        });
        if (choice === 0) {
          mainWindow.hide();
          return;
        }
        if (choice === 1) {
          quitting = true;
          app.quit();
          return;
        }
        // Esc/انصراف: پنجره باز می‌ماند (چون preventDefault شده) — هیچ اتفاقی نمی‌افتد
        return;
      }
      // دفعات بعد: پیش‌فرضِ انتخابِ کاربر = رفتن به tray
      e.preventDefault();
      mainWindow.hide();
    }
    // اگر tray نبود (ساختش شکست خورده) پنجره واقعاً بسته می‌شود و
    // window-all-clocked خروج کامل را انجام می‌دهد — هیچ نمونهٔ نامرئی نمی‌ماند.
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Ctrl+Shift+I در نسخهٔ نصب‌شده غیرفعال (کاربر عادی گیج نمی‌شود)
  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (e, input) => {
      if (input.control && input.shift && (input.key === 'I' || input.key === 'i')) e.preventDefault();
    });
  }
}

/* ─────────────────────────── Tray و منو ─────────────────────────── */

function buildAppMenu() {
  const template = [
    {
      label: 'فایل',
      submenu: [
        { label: 'نمایش پنجرهٔ برنامه', click: () => showMainWindow() },
        { label: 'تشخیص مشکلات', click: () => openDiagnostics() },
        { type: 'separator' },
        {
          label: 'خروج کامل',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'کمک',
      submenu: [
        { label: 'تشخیص مشکلات', accelerator: 'CmdOrCtrl+Shift+D', click: () => openDiagnostics() },
        { label: 'راهنمای رفع اشکال', click: () => openGuide() },
        { label: 'پوشهٔ لاگ‌ها', click: () => shell.openPath(LOG_DIR) },
        { type: 'separator' },
        {
          label: 'درباره ' + APP_NAME_FA,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'درباره برنامه',
              message: APP_NAME_FA,
              detail:
                'نسخهٔ ' + app.getVersion() + '\n' +
                'نسخهٔ دسکتاپ آفلاین — داده‌ها روی همین سیستم نگه‌داری می‌شود.\n' +
                'پوشهٔ داده‌ها: ' + app.getPath('userData'),
              buttons: ['بستن'],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  try {
    tray = new Tray(appIcon());
    tray.setToolTip(APP_NAME_FA);

    const rebuild = () => {
      const autostartOn = isAutostartEnabled(); // هر بار تازه خوانده شود
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'نمایش برنامه', click: () => showMainWindow() },
          { label: 'تشخیص مشکلات', click: () => openDiagnostics() },
          { label: 'راهنمای رفع اشکال', click: () => openGuide() },
          { type: 'separator' },
          {
            label: 'اجرای خودکار هنگام روشن شدن ویندوز',
            type: 'checkbox',
            checked: autostartOn,
            enabled: !isPortable,
            click: (menuItem) => setAutostart(menuItem.checked),
          },
          { type: 'separator' },
          {
            label: 'پوشهٔ لاگ‌ها',
            click: () => shell.openPath(LOG_DIR),
          },
          { type: 'separator' },
          {
            label: 'خروج کامل',
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ])
      );
    };
    rebuild();

    tray.on('double-click', () => showMainWindow());
    tray.on('right-click', rebuild); // وضعیت تیکِ autostart همیشه تازه باشد
  } catch (e) {
    tray = null;
    log('tray ساخته نشد: ' + (e && e.message));
  }
}

function isAutostartEnabled() {
  try {
    if (isPortable) return false;
    const s = app.getLoginItemSettings();
    return Boolean(s && s.openAtLogin);
  } catch (e) {
    return false;
  }
}

function setAutostart(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    log('اجرای خودکار هنگام روشن شدن: ' + (enabled ? 'فعال' : 'غیرفعال'));
  } catch (e) {
    log('تغییر اجرای خودکار ممکن نشد: ' + (e && e.message));
  }
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  if (serverManager.status === 'ready' && serverManager.baseUrl) {
    createMainWindow(serverManager.baseUrl);
    return;
  }
  // سرور هنوز آماده نیست — splash یا صفحهٔ خطا را جلو بیاور (نه هیچ‌کاری نکردن)
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.show();
    splashWindow.focus();
    return;
  }
  if (errorWindow && !errorWindow.isDestroyed()) {
    errorWindow.show();
    errorWindow.focus();
    return;
  }
  // هیچ پنجره‌ای نیست و سرور هم نیست → بوت مجدد (کمربند نجات)
  bootServer(false);
}

/* ─────────────────────────── IPC ─────────────────────────── */

ipcMain.handle('app:logsDir', () => LOG_DIR);
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:openLogs', () => shell.openPath(LOG_DIR));
ipcMain.handle('app:openGuide', () => {
  openGuide();
  return true;
});
ipcMain.handle('app:retry', () => {
  if (errorWindow && !errorWindow.isDestroyed()) errorWindow.close();
  bootServer(true);
  return true;
});
ipcMain.handle('app:copyError', () => {
  clipboard.writeText(buildErrorReport(lastErrorText, 'خطای گزارش‌شده') + '\n\nمتن خطا:\n' + lastErrorText);
  return true;
});
ipcMain.handle('app:diagRerun', () => {
  runDiagnostics();
  return true;
});
ipcMain.handle('app:diagCopy', (event, reportText) => {
  clipboard.writeText(
    String(reportText || '') || buildErrorReport('', 'گزارش تشخیص مشکلات')
  );
  return true;
});
ipcMain.handle('app:diagReport', () => buildErrorReport('', 'گزارش تشخیص مشکلات'));

/* ─────────────────────────── بوت سرور ─────────────────────────── */

// شنونده‌ها یک‌بار و برای همیشه وصل می‌شوند (نه در هر retry دوباره)
serverManager.on('progress', (msg) => {
  if (splashWindow && !splashWindow.isDestroyed() && splashWindow.webContents) {
    try {
      splashWindow.webContents.send('splash-progress', msg);
    } catch (e) {
      /* ignore */
    }
  }
  log('progress: ' + msg);
});

serverManager.on('ready', (baseUrl) => {
  log('ready: ' + baseUrl);
  resetCrashMarker(); // اجرای موفق = پاک‌کردن نشانگر چرخهٔ کرش
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  if (errorWindow && !errorWindow.isDestroyed()) errorWindow.close(); // ری‌استارت بعد از خطا موفق شد
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow(baseUrl);
  else mainWindow.loadURL(baseUrl);
});

serverManager.on('failed', (err) => {
  log('FAILED: ' + err);
  bumpCrashMarker();
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  showErrorWindow(
    String(err || 'خطای ناشناخته'),
    '<br><b>راه‌حل‌های سریع:</b><br>' +
      '۱) دکمهٔ «تلاش دوباره» را بزنید.<br>' +
      '۲) اگر تکرار شد از منوی کمک «تشخیص مشکلات» را اجرا و گزارش را برای پشتیبانی بفرستید.<br>' +
      '۳) آنتی‌ویروس را موقتاً غیرفعال کنید و دوباره امتحان کنید.<br>' +
      '۴) ویندوز ۷ بدون SP1 پشتیبانی نمی‌شود — همهٔ به‌روزرسانی‌ها را نصب کنید.'
  );
});

function bootServer(isRetry) {
  if (serverManager.status === 'starting') {
    log('بوت در جریان است — درخواست تکراری نادیده گرفته شد.');
    return;
  }
  if (!splashWindow || splashWindow.isDestroyed()) createSplash();
  const p = isRetry ? serverManager.restart() : serverManager.start(0);
  p.catch((e) => {
    log('استثنای بوت: ' + (e && e.stack ? e.stack : e));
    serverManager.emit('failed', e && e.message ? e.message : e);
  });
}

/* ─────────────────────────── crash handler سراسری ─────────────────────────── */

function handleFatalError(err, kind) {
  try {
    log('FATAL(' + kind + '): ' + (err && err.stack ? err.stack : err));
  } catch (e) {
    /* ignore */
  }
  bumpCrashMarker();
  const text = String(err && err.message ? err.message : err);
  try {
    showErrorWindow(
      text,
      '<br><b>برنامه با خطای داخلی مواجه شد.</b> جزئیات کامل در پوشهٔ لاگ ذخیره شده است.<br>' +
        'دکمهٔ «تلاش دوباره» را بزنید؛ اگر تکرار شد گزارش را برای پشتیبانی کپی کنید.'
    );
  } catch (e) {
    // آخرین حصار — اگر خود Electron هم در حال مرگ باشد
    try {
      dialog.showErrorBox(APP_NAME_FA, 'برنامه با خطای غیرمنتظره مواجه شد و باید بسته شود.\n\n' + text);
    } catch (e2) {
      /* ignore */
    }
  }
}

process.on('uncaughtException', (err) => {
  handleFatalError(err, 'uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  handleFatalError(reason, 'unhandledRejection');
});

/* ─────────────────────────── چرخهٔ عمر برنامه ─────────────────────────── */

// اگر دوبار کرش متوالی داشته‌ایم، این اجرا بدون شتاب GPU شروع می‌شود
// (کارت‌های گرافیک قدیمی ویندوز ۷ — رایج‌ترین علتِ مرگِ بی‌صدای کرومیم)
const startupCrashCount = readCrashCount();
if (startupCrashCount >= 2) {
  try {
    app.disableHardwareAcceleration();
    log('شناسایی چرخهٔ کرش (' + startupCrashCount + ' بار) — شتاب سخت‌افزاری برای این اجرا خاموش شد.');
  } catch (e) {
    /* ignore */
  }
}

// قفل تک‌نمونه — مهم‌ترین ضدِّ «کلیک کردم هیچی نشد» (نمونهٔ دوم فقط جلو می‌آورد)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(() => {
    log('=== شروع ' + APP_NAME_FA + ' v' + app.getVersion() + ' (electron ' + process.versions.electron + ') ===');
    buildAppMenu();
    createTray();
    bootServer(false);
  });

  app.on('window-all-closed', () => {
    // اگر tray نبود هیچ راه برگشتی وجود ندارد → خروج کامل.
    // (با tray برنامه زنده می‌ماند؛ خروج از منوی tray)
    if (!tray) {
      quitting = true;
      app.quit();
    }
  });
}

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', () => {
  log('خروج — توقف سرور…');
  try {
    serverManager.stop();
  } catch (e) {
    log('خطا در توقف سرور: ' + (e && e.message));
  }
});

// آخرین تور — مطمئن‌ترین راه کشتن پروسهٔ node در ویندوز
process.on('exit', () => {
  try {
    serverManager.stop();
  } catch (e) {
    /* ignore */
  }
});
