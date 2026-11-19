import { NextRequest, NextResponse } from 'next/server';
import { readFile, readdir, stat, open } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { verifyToken } from '@/lib/platform-auth';

/**
 * ============================================================
 * دانلود سورس — نسخهٔ قطعه‌ای و قابل ادامه (v24-chunked)
 * ============================================================
 * مشکل اصلی: فایل ZIP کامل (~۴۰+MB) در یک استریم از سندباکس/گیت‌وی
 * رد می‌شد و وسط راه قطع می‌شد → «failed to download file».
 *
 * راه‌حل (خواستهٔ صریح مالک): تقسیم به قطعه‌های ۲ مگابایتی + ادامهٔ
 * خودکار پس از قطعی اینترنت + عدم ناقص‌ماندن دانلود.
 *
 * قرارداد API (همه با Bearer سوپرادمین):
 *   GET /api/download-source?meta=1
 *     → { fileName, size, chunkSize, totalChunks, version, mtime }
 *   GET /api/download-source?chunk=N   (0-based)
 *     → ۲MB باینری؛ ETag و Content-Length دقیق؛ Cache-Control برای
 *       اعتبارسنجی مجدد (304) اگر همان قطعه قبلاً گرفته شده باشد.
 *   GET /api/download-source           (بدون پارامتر — رفتار قدیمی)
 *     → کل فایل یک‌جا (سازگاری با قبلی؛ توصیه: از قطعه‌ای استفاده کنید)
 *
 * نام پیش‌فرض فایل سورس؛ اگر موجود نباشد، جدیدترین بستهٔ نسخه‌دار
 * (ofoghplus-v*-complete-source.zip) به‌صورت خودکار سرو می‌شود تا
 * اندپوینت هرگز به‌خاطر جابه‌جایی شمارهٔ نسخه، ۴۰۴ ندهد.
 */
const SOURCE_FINAL = 'hoshhesab-source-final.zip';

/** اندازهٔ هر قطعه — ۲ مگابایت (خواستهٔ مالک) */
const CHUNK_SIZE = 2 * 1024 * 1024;

async function resolveSourceZip(): Promise<{ file: string; versionLabel: string } | null> {
  const dir = path.join(process.cwd(), 'download');
  const finalPath = path.join(dir, SOURCE_FINAL);
  if (existsSync(finalPath)) {
    return { file: finalPath, versionLabel: SOURCE_FINAL };
  }
  if (!existsSync(dir)) return null;
  const names = await readdir(dir).catch(() => [] as string[]);
  // سازگاری با هر دو الگوی نام‌گذاری قدیمی/جدید
  const candidates = names
    .map((n) => {
      const m = n.match(/^(?:hooshhesab|ofoghplus)-v(\d+)-complete-source\.zip$/i);
      return m ? { n, v: Number(m[1] ?? 0) } : null;
    })
    .filter((x): x is { n: string; v: number } => !!x)
    .sort((a, b) => b.v - a.v);
  if (candidates.length === 0) return null;
  const best = candidates[0];
  return { file: path.join(dir, best.n), versionLabel: best.n };
}

/** احراز هویت سوپرادمین — Bearer header یا ?t= (برای لینک‌های مستقیم قطعه‌ها) */
function isSuperadmin(req: NextRequest): boolean {
  const tryToken = (raw: string | null | undefined): boolean => {
    if (!raw) return false;
    const payload = verifyToken(raw);
    return payload?.type === 'superadmin';
  };
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && tryToken(authHeader.substring(7))) return true;
  // حالت query — فقط برای دانلود مستقیم قطعه‌ها از تب جدید مرورگر
  // (تولید product محافظت می‌شود؛ در production کل اندپوینت قفل است)
  const q = req.nextUrl.searchParams.get('t');
  return tryToken(q);
}

export const dynamic = 'force-dynamic';

/**
 * FIX(R28-5): صفحهٔ دانلود مستقل (top-level) — ریشهٔ «failed to download file»:
 * دانلود از داخل iframe پیش‌نمایش توسط sandbox مرورگر بلاک می‌شود (حتی blob).
 * این صفحهٔ HTML خودکفا در «تب جدید» باز می‌شود (window.open از پنل) و آنجا
 * ذخیرهٔ فایل کاملاً مجاز است. ویژگی‌ها:
 *  - قطعه‌های ۲MB با retry + backoff نمایی (تا ۳۰ تلاش) — قطعی اینترنت را رد می‌کند
 *  - ذخیرهٔ قطعه‌ها در IndexedDB → بستن/رفرش تب = ادامه از همان‌جا
 *  - توقف خودکار در آفلاین و ادامهٔ خودکار در آنلاین (navigator.onLine)
 *  - اعتبارسنجی طول هر قطعه + حجم نهایی قبل از ذخیره (دانلود ناقص = خطا، نه فایل خراب)
 *  - نوار پیشرفت + سرعت + ETA + وضعیت فارسی
 */
function downloaderHtml(): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>دانلود سورس — افق پلاس</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; background: #0b1220; color: #e5e7eb; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .card { width: 100%; max-width: 640px; background: #111a2e; border: 1px solid #1f2b47; border-radius: 16px; padding: 28px 24px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  h1 { font-size: 18px; margin-bottom: 6px; color: #fff; }
  .sub { font-size: 13px; color: #93a4c3; margin-bottom: 20px; }
  .bar { height: 14px; background: #0b1220; border-radius: 999px; overflow: hidden; border: 1px solid #1f2b47; }
  .fill { height: 100%; width: 0%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 999px; transition: width .25s ease; }
  .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; font-size: 12px; color: #9fb0ce; }
  .chip { background: #0b1220; border: 1px solid #1f2b47; border-radius: 8px; padding: 4px 10px; }
  .status { margin-top: 16px; font-size: 13px; min-height: 20px; color: #a5b4fc; }
  .err { color: #f87171; }
  .ok { color: #34d399; }
  button { margin-top: 18px; width: 100%; padding: 12px; border: 0; border-radius: 10px; background: #10b981; color: #052e21; font-weight: 700; font-size: 14px; cursor: pointer; font-family: inherit; }
  button:disabled { opacity: .5; cursor: default; }
  .hint { margin-top: 14px; font-size: 11.5px; color: #64748b; line-height: 1.9; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #34d399; margin-left: 6px; animation: pulse 1.2s infinite; }
  .dot.off { background: #f87171; animation: none; }
  @keyframes pulse { 50% { opacity: .35; } }
</style>
</head>
<body>
<div class="card">
  <h1>دانلود بستهٔ کامل سورس</h1>
  <div class="sub">دانلود قطعه‌ای ۲ مگابایتی با ادامهٔ خودکار — این تب را نبندید؛ اگر اینترنت قطع شد، خودش از همان‌جا ادامه می‌دهد.</div>
  <div class="bar"><div class="fill" id="fill"></div></div>
  <div class="stats">
    <span class="chip" id="pct">۰٪</span>
    <span class="chip" id="done">— از — قطعه</span>
    <span class="chip" id="speed">—</span>
    <span class="chip" id="eta">—</span>
    <span class="chip" id="net"><span class="dot" id="netdot"></span><span id="nettxt">آنلاین</span></span>
  </div>
  <div class="status" id="status">آماده‌سازی…</div>
  <button id="save" disabled>در حال دانلود…</button>
  <div class="hint">
    • هر قطعه ۲MB است و پس از دریافت در حافظهٔ مرورگر (IndexedDB) ذخیره می‌شود — رفرش یا قطعی اینترنت، دانلود را از صفر شروع نمی‌کند.<br/>
    • پس از پایان، دکمهٔ «ذخیرهٔ فایل» فعال می‌شود؛ حجم نهایی قبل از ذخیره کنترل می‌شود تا فایل ناقص ذخیره نشود.
  </div>
</div>
<script>
(function () {
  var qs = new URLSearchParams(location.search);
  var TOKEN = qs.get('t') || '';
  function api(q) { return '/api/download-source?' + q + (TOKEN ? '&t=' + encodeURIComponent(TOKEN) : ''); }
  function fa(n) { return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
  function fmtMB(b) { return (b / 1048576).toFixed(1); }
  var $ = function (id) { return document.getElementById(id); };
  var fill = $('fill'), pct = $('pct'), doneEl = $('done'), speedEl = $('speed'), etaEl = $('eta'),
      statusEl = $('status'), saveBtn = $('save'), netdot = $('netdot'), nettxt = $('nettxt');

  function setStatus(msg, cls) { statusEl.textContent = msg; statusEl.className = 'status ' + (cls || ''); }
  function net() {
    var on = navigator.onLine;
    netdot.className = 'dot' + (on ? '' : ' off');
    nettxt.textContent = on ? 'آنلاین' : 'آفلاین — منتظر اتصال…';
    return on;
  }
  window.addEventListener('online', net); window.addEventListener('offline', net); net();

  // ─── IndexedDB (ادامهٔ دانلود بعد از رفرش/قطعی) ───
  var dbp = new Promise(function (res, rej) {
    var rq = indexedDB.open('ofogh-source-dl-page', 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore('chunks'); };
    rq.onsuccess = function () { res(rq.result); };
    rq.onerror = function () { rej(rq.error); };
  });
  function idbGet(key) { return dbp.then(function (d) { return new Promise(function (res, rej) {
    var r = d.transaction('chunks').objectStore('chunks').get(key);
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  }); }); }
  function idbPut(key, val) { return dbp.then(function (d) { return new Promise(function (res, rej) {
    var t = d.transaction('chunks', 'readwrite');
    t.objectStore('chunks').put(val, key);
    t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); };
  }); }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitOnline() { return net() ? Promise.resolve() : new Promise(function (r) { window.addEventListener('online', r, { once: true }); }); }

  var MAX_TRIES = 30;
  async function fetchChunk(idx, meta) {
    for (var attempt = 1; ; attempt++) {
      await waitOnline();
      try {
        var res = await fetch(api('chunk=' + idx), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var buf = await res.arrayBuffer();
        var expected = Math.min(meta.chunkSize, meta.size - idx * meta.chunkSize);
        if (buf.byteLength !== expected) throw new Error('طول قطعه ناقص');
        return buf;
      } catch (e) {
        if (attempt >= MAX_TRIES) throw e;
        var wait = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 5)));
        setStatus('قطع شد — تلاش مجدد ' + fa(attempt) + ' از ' + fa(MAX_TRIES) + ' برای قطعهٔ ' + fa(idx + 1) + ' (‌' + fa(Math.round(wait / 1000)) + ' ثانیه…)‌', 'err');
        await sleep(wait);
      }
    }
  }

  async function run() {
    try {
      setStatus('دریافت اطلاعات بسته…');
      var mres = await fetch(api('meta=1'), { cache: 'no-store' });
      if (!mres.ok) throw new Error('meta HTTP ' + mres.status);
      var meta = await mres.json();
      if (!meta || !meta.success) throw new Error('متادیتا نامعتبر');
      var total = meta.totalChunks, size = meta.size;
      doneEl.textContent = fa(0) + ' از ' + fa(total) + ' قطعه';

      var t0 = Date.now(), got = 0, runBytes = 0, parts = new Array(total), doneCount = 0;
      // قطعه‌های قبلی از IDB
      for (var i = 0; i < total; i++) {
        var prev = await idbGet(meta.version + '#' + i);
        if (prev && prev.byteLength === Math.min(meta.chunkSize, size - i * meta.chunkSize)) {
          parts[i] = prev; doneCount++; got += prev.byteLength;
        }
      }
      if (doneCount > 0) setStatus('ادامهٔ دانلود از قطعهٔ ' + fa(doneCount + 1) + ' (ذخیره‌شدهٔ قبلی)…');

      for (var i = 0; i < total; i++) {
        if (parts[i]) continue;
        var buf = await fetchChunk(i, meta);
        await idbPut(meta.version + '#' + i, buf);
        parts[i] = buf; doneCount++; got += buf.byteLength; runBytes += buf.byteLength;
        var elapsed = (Date.now() - t0) / 1000 || 1;
        var bps = runBytes / elapsed;
        var remaining = size - got;
        fill.style.width = (got / size * 100).toFixed(1) + '%';
        pct.textContent = fa((got / size * 100).toFixed(0)) + '٪';
        doneEl.textContent = fa(doneCount) + ' از ' + fa(total) + ' قطعه';
        speedEl.textContent = fmtMB(bps) + ' MB/s';
        etaEl.textContent = remaining > 0 ? fa(Math.max(1, Math.round(remaining / Math.max(bps, 1)))) + ' ثانیه' : '—';
        setStatus('در حال دانلود قطعهٔ ' + fa(i + 1) + ' از ' + fa(total) + '…');
      }

      // اعتبارسنجی حجم نهایی — دانلود ناقص هرگز ذخیره نمی‌شود
      var totalBytes = parts.reduce(function (a, b) { return a + b.byteLength; }, 0);
      if (totalBytes !== size) throw new Error('حجم نهایی نامعتبر: ' + totalBytes + ' ≠ ' + size);

      setStatus('دانلود کامل شد — ' + fmtMB(size) + ' MB آمادهٔ ذخیره است.', 'ok');
      saveBtn.disabled = false;
      saveBtn.textContent = 'ذخیرهٔ فایل (' + fmtMB(size) + ' MB)';
      saveBtn.onclick = function () {
        var blob = new Blob(parts, { type: 'application/zip' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = meta.fileName;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        setStatus('فایل ذخیره شد ✓ (' + meta.fileName + ')', 'ok');
      };
    } catch (e) {
      setStatus('خطا: ' + (e && e.message ? e.message : e) + ' — صفحه را رفرش کنید؛ قطعه‌های گرفته‌شده حفظ می‌شوند.', 'err');
      saveBtn.disabled = false;
      saveBtn.textContent = 'تلاش دوباره';
      saveBtn.onclick = function () { location.reload(); };
    }
  }
  run();
})();
</script>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  try {
    // ─── PRODUCTION GUARD: در محیط production این اندپوینت به‌کلی غیرفعال است ───
    // سورس‌کد محصول تجاری است — فقط برای dev/testing در دسترس است.
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SOURCE_DOWNLOAD !== '1') {
      return NextResponse.json(
        { success: false, error: 'این قابلیت در محیط production غیرفعال است' },
        { status: 404 }
      );
    }

    // ─── SECURITY: فقط سوپرادمین ───
    if (!isSuperadmin(req)) {
      return NextResponse.json(
        { success: false, error: 'دسترسی فقط برای مدیر پلتفرم مجاز است' },
        { status: 403 }
      );
    }

    const resolved = await resolveSourceZip();
    if (!resolved) {
      return NextResponse.json(
        { error: 'فایل ZIP یافت نشد. لطفاً دوباره تلاش کنید.' },
        { status: 404 }
      );
    }

    /* ─────────── ۰) صفحهٔ دانلود مستقل (top-level — تب جدید) ───────────
     FIX(R28-5): دانلود داخل iframe پیش‌نمایش بلاک می‌شود؛ این صفحه در تب
     جدید باز می‌شود و ذخیرهٔ فایل آنجا مجاز است. */
    if (req.nextUrl.searchParams.get('page') === '1') {
      return new NextResponse(downloaderHtml(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Frame-Options': 'SAMEORIGIN',
        },
      });
    }

    const meta = await stat(resolved.file);
    const totalChunks = Math.max(1, Math.ceil(meta.size / CHUNK_SIZE));

    /* ─────────── ۱) متادیتا — برای UI دانلود قطعه‌ای ─────────── */
    if (req.nextUrl.searchParams.get('meta') === '1') {
      return NextResponse.json(
        {
          success: true,
          fileName: resolved.versionLabel,
          size: meta.size,
          chunkSize: CHUNK_SIZE,
          totalChunks,
          mtime: meta.mtimeMs,
          // ETag پایه — کلاینت با ترکیب fileName+size+mtime پیشرفت را invalidate می‌کند
          version: `${resolved.versionLabel}:${meta.size}:${Math.floor(meta.mtimeMs)}`,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    /* ─────────── ۲) یک قطعهٔ مشخص (۰-based) ─────────── */
    const chunkParam = req.nextUrl.searchParams.get('chunk');
    if (chunkParam !== null) {
      const idx = Number(chunkParam);
      if (!Number.isInteger(idx) || idx < 0 || idx >= totalChunks) {
        return NextResponse.json(
          { success: false, error: `شمارهٔ قطعه نامعتبر است (۰ تا ${totalChunks - 1})` },
          { status: 400 }
        );
      }
      const start = idx * CHUNK_SIZE;
      const length = Math.min(CHUNK_SIZE, meta.size - start);
      const etag = `"${resolved.versionLabel}-${meta.size}-${idx}"`;

      // 304 — قطعهٔ یکسان قبلاً گرفته شده (کلاینت خودش If-None-Match می‌فرستد)
      if (req.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag } });
      }

      // خواندن «فقط همان بازه» — بدون بارگذاری کل فایل در حافظه
      const fh = await open(resolved.file, 'r');
      try {
        const buf = Buffer.allocUnsafe(length);
        const { bytesRead } = await fh.read(buf, 0, length, start);
        const body = bytesRead === length ? buf : buf.subarray(0, bytesRead);
        return new NextResponse(new Uint8Array(body), {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(body.byteLength),
            ETag: etag,
            // قطعه‌های تیک‌خورده immutable نیستند (فایل ممکن است عوض شود)؛
            // اما ETag اجازهٔ 304 می‌دهد → پس از قطعی اینترنت، قطعه‌های کامل
            // گرفته‌شده دوباره دانلود نمی‌شوند.
            'Cache-Control': 'no-cache, must-revalidate',
            'X-Chunk-Index': String(idx),
            'X-Chunk-Total': String(totalChunks),
            'Content-Disposition': `attachment; filename="${resolved.versionLabel}.part-${String(idx + 1).padStart(3, '0')}"`,
          },
        });
      } finally {
        await fh.close();
      }
    }

    /* ─────────── ۳) دانلود کامل یک‌جا (سازگاری با قبل) ─────────── */
    const fileBuffer = await readFile(resolved.file);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${resolved.versionLabel}"`,
        'Content-Length': fileBuffer.byteLength.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Total-Chunks': String(totalChunks),
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'خطا در دانلود فایل' }, { status: 500 });
  }
}
