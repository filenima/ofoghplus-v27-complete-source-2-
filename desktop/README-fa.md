# نسخهٔ دسکتاپ آفلاین — حسابداری افق پلاس

نسخهٔ ویندوزی نرم‌افزار حسابداری افق پلاس؛ **کاملاً آفلاین**، با نصاب `Setup.exe` استاندارد (مثل هلو و محک) — بدون هیچ پنجرهٔ CMD یا PowerShell، در نصب و اجرا.

> این سند مخصوص نسخهٔ بازسازی‌شده (R17-A / بستهٔ 14.1.0) است که برای ریشه‌ای حل‌کردن مشکل «نصب می‌شد ولی باز نمی‌شود» بازنویسی شده است.

---

## سه نسخه — کدام را انتخاب کنم؟

| نسخه | فایل | سیستم‌عامل | نصب |
|---|---|---|---|
| **مدرن** | `OfoghPlus-Setup-<ver>.exe` | ویندوز ۱۰ و ۱۱ | دابل‌کلیک → Next → Install |
| **پرتابل** | `OfoghPlus-Portable-<ver>.exe` | ویندوز ۱۰ و ۱۱ | بدون نصب — خودِ فایل را اجرا کنید |
| **Legacy** | `OfoghPlus-Legacy-Setup-<ver>-x64.exe` و `…-ia32.exe` (۳۲بیتی) | ویندوز **۷ SP1** و ۸/۸.۱ | مثل مدرن |

> **ویندوز ۷:** حتماً **SP1** + به‌روزرسانی‌های **KB4474419** (امضای SHA-2) و **KB3126587/KB3063858** نصب باشد. Visual C++ 2015-2022 (x64 و x86) داخل نصاب هست و هنگام نصب **بی‌صدا** نصب می‌شود.

---

## معماری — چرا این‌بار مطمئن است؟

```
┌─────────────────────┐   spawn (کاملاً مخفی — بدون CMD)   ┌───────────────────────────┐
│  OfoghPlus.exe      │ ────────────────────────────────▶ │ موتور اجرا:               │
│  (Electron 33 مدرن  │                                   │  ۱) node.exe باندل‌شده     │
│   یا 22.3.27 برای   │ ◀──────────────────────────────── │  ۲) مسیر نجات: خودِ exe    │
│   ویندوز ۷/۸)       │    poll http://127.0.0.1:PORT      │     با ELECTRON_RUN_AS_NODE│
│  ───────────────    │        /api/health                 │     (بدون نیاز به VC++)    │
│  • splash فوری      │                                   │  ▼                        │
│  • صفحهٔ خطای فارسی  │                                   │  Next.js standalone       │
│    + «تلاش دوباره»  │                                   │  + SQLite (Prisma)        │
│  • منوی «تشخیص      │                                   │  + seed + polyfills       │
│    مشکلات»          │                                   └───────────────────────────┘
│  • tray کنار ساعت   │                                              ▲
└─────────────────────┘                        %APPDATA%\OfoghPlus ─ دیتابیس + لاگ‌ها
```

### محتویات بستهٔ نصبی (پوشهٔ `resources`)

| مسیر | چیست |
|---|---|
| `resources/server/` | باندل Next.js standalone (server.js + .next/static + public) + `db/custom.db` + `seed.cjs` + `node16-polyfills.cjs` |
| `resources/node/node.exe` | موتور Node باندل‌شده (v20 مدرن / v16.20.2 برای Legacy) + `NODE_VERSION` |
| `resources/node/node-ia32.exe` | فقط Legacy — برای ویندوز ۷ ۳۲بیتی واقعی |
| `resources/redist/VC_redist.x64.exe` + `VC_redist.x86.exe` | VC++ 2015-2022 — هنگام نصب بی‌صدا اجرا می‌شود |
| `resources/icon.png` | آیکن tray |

### کدام باگ‌های «نصب شد ولی باز نمی‌شد» چطور بسته شدند؟

| باگ قبلی | ریشه | رفع |
|---|---|---|
| کلیک می‌شد هیچی نمی‌شد | هیچ crash-handler نبود؛ هر استثنا = مرگ بی‌صدای پروسه | `uncaughtException`/`unhandledRejection` سراسری + صفحهٔ خطای فارسی با «تلاش دوباره»، «کپی اطلاعات خطا برای پشتیبانی»، «پوشهٔ لاگ» |
| سرور کرش می‌کرد و ۹۰ ثانیه معطل می‌ماندی | poll سلامت، مرگِ پروسهٔ node را نمی‌دید | fail-fast: بمیرد پروسه، همان لحظه پیام خطا با کد خروج + آخرین خطوط لاگ |
| VC++ redist در نصاب نبود (مسیر جست‌وجو اشتباه) | فایل در `build/vcredist` بود ولی بسته نمی‌شد | redist داخل `resources\redist` باندل؛ NSIS با `/install /quiet /norestart` نصبش می‌کند |
| node.exe به VC++ نصب‌شده نیاز داشت | ویندوز تمیز VC++ ندارد | probe خودکار: اگر node.exe اجرا نشد، خودِ exe برنامه با `ELECTRON_RUN_AS_NODE` اجرا می‌شود (بدون وابستگی) |
| موتور Prisma ویندوز در باندل نبود | `binaryTargets` در schema ست نشده بود | اسکریپت build پچ می‌زند + **چراغ سبز**: اگر `libquery_engine-windows.dll.node` در باندل نبود build متوقف می‌شود |
| پالی‌فیل‌های Node 16 فعال نمی‌شدند | فایل `NODE_VERSION` نوشته نمی‌شد | خود برنامه نسخهٔ node را از باینری probe می‌کند؛ فایل فقط جنبهٔ اطلاعاتی دارد |
| ویندوز ۷ ۳۲بیتی هیچ‌وقت کار نمی‌کرد | `node-ia32.exe` باندل نمی‌شد | در بیلد Legacy کنار نسخهٔ x64 گذاشته می‌شود |
| کرش‌لوپ GPU (گرافیک قدیمی ویندوز ۷) | باگ درایور GPU | بعد از دو کرش متوالی، اجرای بعدی خودکار بدون شتاب سخت‌افزاری شروع می‌شود |
| پورت اشغال → صفحهٔ سفید | پورت ثابت ۳۰۰۰ | بازهٔ ۳۴۵۶..۳۴۶۰ + تشخیص پروسهٔ یتیم + پیام فارسی دقیق |
| پروسهٔ node یتیم می‌ماند | در شکست، پروسه کشته نمی‌شد | کشتن پروسه در همهٔ مسیرهای شکست + `taskkill /T /F` در خروج |
| لاگ‌ها دیسک را پر می‌کردند | لاگ بی‌نهایت | چرخشی: هر فایل ۲ مگابایت × ۳ نسخه |
| نمونهٔ نامرئی، اجرای بعدی را می‌بلعید | tray می‌سوخت و برنامه زنده می‌ماند | اگر tray نباشد، بستن پنجره = خروج کامل؛ اجرای دوم پنجره را بازسازی می‌کند |

---

## دریافت و ساخت

### راه ۱ — از GitHub Actions (پیشنهادی؛ بدون نیاز به هیچ چیزی روی سیستم شما)

۱. ریپازیتوری → تب **Actions** → **build-desktop** → **Run workflow** (شمارهٔ نسخه دلخواه قابل ست است)
۲. حدود ۲۰ دقیقه صبر کنید (هر دو نصاب + پرتابل + SHA256SUMS ساخته می‌شوند)
۳. اجرای سبز → پایین صفحه **Artifacts**:
   - `OfoghPlus-Setup-windows10-11` — نصاب مدرن + پرتابل
   - `OfoghPlus-Legacy-Setup-windows7-8` — نصاب ویندوز ۷/۸ (x64 + ia32)
۴. برای انتشار عمومی: `git tag desktop-v14.1.0 && git push --tags` → یک **Release** کامل با هر سه فایل + SHA256SUMS ساخته می‌شود

### راه ۲ — ساخت روی ویندوز خودتان

```powershell
git clone <آدرس ریپازیتوری>
cd <پوشهٔ پروژه>
powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1
```
پایان: `desktop\dist\` و `desktop\dist-legacy\` آماده‌اند. (پیش‌نیاز: [Bun](https://bun.sh) — `irm bun.sh/install.ps1 | iex`)
پارامترها: `-Modern` فقط مدرن+پرتابل، `-Legacy` فقط ویندوز ۷/۸، `-SkipNext` ردکردن بیلد Next.

### راه ۳ — لینوکس/مک/Git-Bash

```bash
bash scripts/build-desktop.sh              # همهٔ خروجی‌ها
bash scripts/build-desktop.sh --modern     # فقط مدرن + پرتابل
bash scripts/build-desktop.sh --legacy     # فقط ویندوز ۷/۸
bash scripts/build-desktop.sh --skip-next  # بیلد Next از قبل هست
```

> اگر nodejs.org در دسترس نیست، اسکریپت خودکار از آینهٔ npmmirror دانلود می‌کند؛ یا `NODE_MIRROR=https://npmmirror.com/mirrors/node bash scripts/build-desktop.sh`

---

## ساختار کد دسکتاپ

| فایل | نقش |
|---|---|
| `src/main.js` | پروسهٔ اصلی: splash، crash-handler، منو (کمک ← تشخیص مشکلات)، tray، لاگ چرخشی، قفل تک‌نمونه |
| `src/server-manager.js` | اجرای مخفی سرور: انتخاب موتور (node.exe یا مسیر نجات)، پورت آزاد، health-check با fail-fast، ری‌استارت با backoff، `diagnose()` |
| `src/splash-preload.js` / `error-preload.js` / `diag-preload.js` | پل‌های امن IPC (contextIsolation) |
| `build/installer.nsh` | نصب بی‌صدای VC++ (x64+x86)، اجرای خودکار اختیاری (`/AUTOSTART=1`)، پاک‌سازی کامل هنگام حذف |
| `electron-builder.legacy.yml` | کانفیگ نسخهٔ ویندوز ۷/۸ (Electron 22.3.27، x64+ia32) — از خود `desktop/` اجرا می‌شود |
| `resources-template/` | `seed.cjs` (کاربر admin اولیه) و `node16-polyfills.cjs` (پالی‌فیل‌های Node 16) |
| `portable/ofogh-portable.ts` | لانچر پرتابل جایگزین مبتنی بر Bun (گزینهٔ دوم؛ خروجی اصلی پرتابل با electron-builder ساخته می‌شود) |
| `scripts/fetch-deps.sh` | دانلود idempotent وابستگی‌ها (node.exeها + VC++ با آینهٔ پشتیبان) |
| `scripts/build-desktop.sh` / `.ps1` | ارکستراتور کامل build (پچ Prisma → بیلد → اسمبل → چراغ سبز → سه خروجی → SHA256SUMS) |

### نکات فنی مهم

- **پچ Prisma (حیاتی):** قبل از هر build دسکتاپ، `binaryTargets = ["native", "windows"]` به `prisma/schema.prisma` اضافه می‌شود و بعد `bun install` اجرا می‌شود؛ در پایان build وجود `libquery_engine-windows.dll.node` در باندل **چک می‌شود** — بدون آن سرور روی ویندوز بالا نمی‌آید.
- **موتور اجرا با اولویت:** ۱) `resources/node/node.exe` اگر واقعاً اجرا شود (probe با `--version`) ۲) خودِ exe برنامه با `ELECTRON_RUN_AS_NODE=1` (همیشه کار می‌کند، حتی بدون VC++).
- **دیتابیس:** همیشه در `%APPDATA%\OfoghPlus\data\custom.db` کپی می‌شود (پوشهٔ Program Files فقط-خواندنی است).
- **لاگ‌ها:** `%APPDATA%\OfoghPlus\logs\` — `main.log`، `server-manager.log`، `server.log`، `seed.log` — هر کدام حداکثر ۲ مگابایت × ۳ نسخهٔ چرخشی.

---

## ورود اول

| | |
|---|---|
| نام کاربری | `admin` |
| رمز عبور | `admin1234` |

> بلافاصله بعد از ورود از تنظیمات رمز را عوض کنید. اگر دیتابیس همراه بسته داده داشته باشد، کاربران قبلی معتبرند.

---

## رفع اشکال سریع

- **SmartScreen**: More info ← Run anyway (تا خرید گواهی Code Signing).
- **آنتی‌ویروس**: پوشهٔ نصب و `%APPDATA%\OfoghPlus` را در استثنائات بگذارید.
- **ویندوز ۷ بدون VC++**: `resources\redist\VC_redist.*.exe` را از مسیر نصب دستی اجرا کنید.
- **هر مشکل دیگر**: منوی **کمک ← تشخیص مشکلات** ← «کپی گزارش برای پشتیبانی».

سند کامل ۱۷ سناریو: [`TROUBLESHOOTING-fa.md`](./TROUBLESHOOTING-fa.md) — چک‌لیست انتشار: [`BUILD-CHECKLIST-fa.md`](./BUILD-CHECKLIST-fa.md)

---

## به‌روزرسانی و حذف

- **به‌روزرسانی:** نسخهٔ جدید را روی قبلی نصب کنید — داده‌ها در AppData جدا و حفظ می‌شوند.
- **حذف:** Uninstall داده‌های حسابداری را پاک **نمی‌کند** (مسیرش هنگام حذف نشان داده می‌شود). حذف کامل: بعد از Uninstall پوشهٔ `%APPDATA%\OfoghPlus` را پاک کنید.
- **انتقال به سیستم دیگر:** برنامه را ببندید → پوشهٔ `%APPDATA%\OfoghPlus` را در همان مسیر سیستم جدید کپی کنید.
