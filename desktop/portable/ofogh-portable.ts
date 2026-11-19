// ofogh-portable.ts — لانچر پرتابل جایگزین «حسابداری افق پلاس» (بازسازی R17-A)
// ============================================================================
// توجه: خروجی پرتابلِ اصلیِ پروژه با electron-builder ساخته می‌شود
// (desktop/package.json → dist:portable) — همان کد و همان اطمینانِ نصاب،
// بدون نصب و بدون هیچ پنجرهٔ کنسول. این فایل گزینهٔ دوم/حجم-کم برای
// کاربران Bun است و پنجرهٔ کنسول خودش را به‌عنوان پنل کنترل نگه می‌دارد
// (بستن پنجره = خروج کامل) — در سند پشتیبانی همین‌طور توضیح داده شده است.
//
// کامپایل: bun build --compile --target=bun-windows-x64 ofogh-portable.ts
//
// معماری (ترفند self-spawn):
//   نقش server: خود exe با env OFOGH_ROLE=server دوباره اجرا می‌شود و
//               باندل Next standalone (پوشهٔ server/ کنار exe) را بالا می‌آورد.
//   نقش launcher: پورت آزاد پیدا می‌کند → خودش را به‌صورت مخفی (بدون پنجرهٔ
//               CMD) spawn می‌کند → تا ۹۰ ثانیه /api/health را poll می‌کند →
//               مرورگر پیش‌فرض را باز می‌کند → کنسول ورودی نگه می‌دارد
//               (Ctrl+C = خروج کامل و کشتن پروسهٔ سرور).
//
// کنار exe باید باشد:
//   server/server.js      ← باندل Next standalone
//   server/.next/static/  ← فایل‌های استاتیک
//   server/public/        ← آیکن‌ها/تصاویر
//   server/db/custom.db   ← دیتابیس SQLite
//   server/seed.cjs       ← بذر کاربر admin (اختیاری)
//
// سازگاری: ویندوز ۱۰/۱۱ (runtime بِان). ویندوز ۷/۸ → از نسخهٔ Legacy
// (Electron 22 + Setup.exe) استفاده کنید.

const PORT_RANGE_START = 3456;
const PORT_RANGE_SIZE = 5;
const HEALTH_TIMEOUT_MS = 90_000;

function log(msg: string) {
  console.log(`[افق پلاس] ${msg}`);
}

async function ping(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function isPortFree(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(600),
    });
    // پورت اشغال — اگر سرور خودِ ماست (health OK) دوباره استفاده‌اش می‌کنیم
    return !(res.ok);
  } catch {
    return true; // هیچ‌کس جواب نمی‌دهد → آزاد
  }
}

async function findFreePort(): Promise<number> {
  for (let i = 0; i < PORT_RANGE_SIZE; i++) {
    const port = PORT_RANGE_START + i;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`هیچ پورت آزادی در بازهٔ ${PORT_RANGE_START}..${PORT_RANGE_START + PORT_RANGE_SIZE - 1} پیدا نشد`);
}

/* ─────────────────── نقش ۱: سرور ─────────────────── */
async function runServer() {
  const port = Number(process.env.OFOGH_PORT || PORT_RANGE_START);
  const serverDir = process.env.OFOGH_SERVER_DIR!;
  const dbPath = `${serverDir}/db/custom.db`.replace(/\\/g, "/");

  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.JWT_SECRET ||= "ofoghplus-desktop-local-secret-change-me";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  // در نسخهٔ پرتابل sharp نیست → بهینه‌سازی تصویر غیرفعال (فایل‌ها مستقیم سرو می‌شوند)
  process.env.NEXT_DESKTOP = "1";

  log(`سرور روی http://127.0.0.1:${port} ↑ (db: ${dbPath})`);
  // باندل standalone — import داینامیک تا Bun آن را در زمان کامپایل inline نکند
  await import(/* @vite-ignore */ `${serverDir}/server.js`);
}

/* ─────────────────── نقش ۲: لانچر ─────────────────── */
async function runLauncher() {
  const path = await import("node:path");
  const { spawn } = await import("node:child_process");
  const exeDir = path.dirname(process.execPath);
  const serverDir = path.join(exeDir, "server");
  const serverEntry = path.join(serverDir, "server.js");

  if (!await Bun.file(serverEntry).exists()) {
    console.error(`
╔══════════════════════════════════════════════════════════╗
║  باندل سرور پیدا نشد!                                     ║
║  پوشهٔ «server» باید کنار همین فایل exe باشد.             ║
║  مسیر جست‌وجو: ${serverDir.slice(0, 41).padEnd(41)}║
╚══════════════════════════════════════════════════════════╝`);
    process.exit(1);
  }

  log("در حال راه‌اندازی سرور محلی…");
  const port = await findFreePort();

  // spawn خودمان به‌صورت سرور — بدون پنجرهٔ جدید (windowsHide)
  const child = spawn(process.execPath, [], {
    env: {
      ...process.env,
      OFOGH_ROLE: "server",
      OFOGH_PORT: String(port),
      OFOGH_SERVER_DIR: serverDir,
      BUN_QUIET_DEBUG_LOGS: "1",
    },
    windowsHide: true, // ★ هیچ پنجرهٔ CMD باز نمی‌شود
    stdio: ["ignore", "inherit", "inherit"],
  });
  log(`پروسهٔ سرور pid=${child.pid} روی پورت ${port}`);

  // انتظار برای سلامت
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    if (await ping(port)) { ready = true; break; }
    await Bun.sleep(600);
  }

  if (ready) {
    log(`آماده است — مرورگر باز می‌شود: http://127.0.0.1:${port}`);
    // مرورگر پیش‌فرض ویندوز
    const { exec } = await import("node:child_process");
    exec(`start "" "http://127.0.0.1:${port}"`);
    console.log("\n  ┌────────────────────────────────────────────────┐");
    console.log(`  │  برنامه در حال اجراست: http://127.0.0.1:${port}   │`);
    console.log("  │  برای خروج کامل: این پنجره را ببندید یا Ctrl+C  │");
    console.log("  └────────────────────────────────────────────────┘\n");
    // نگه‌داشتن لانچر زنده — با بستنِ پنجره/Ctrl+C سرور هم کشته می‌شود
    await new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
      process.on("SIGINT", () => { child.kill(); resolve(); });
      process.on("SIGHUP", () => { child.kill(); resolve(); });
      process.on("exit", () => { try { child.kill(); } catch {} });
    });
  } else {
    console.error(`سرور در ${HEALTH_TIMEOUT_MS / 1000} ثانیه جواب نداد.
راه‌حل: پوشهٔ server را کامل کپی کنید؛ آنتی‌ویروس را بررسی کنید؛
لاگ بالا را به پشتیبانی بفرستید.`);
    child.kill();
    process.exit(1);
  }
}

/* ─────────────────── ورودی ─────────────────── */
if (process.env.OFOGH_ROLE === "server") {
  runServer().catch((e) => {
    console.error("[سرور] خطای مهلک:", e);
    process.exit(1);
  });
} else {
  runLauncher().catch((e) => {
    console.error("[افق پلاس] خطا:", e?.message ?? e);
    process.exit(1);
  });
}
