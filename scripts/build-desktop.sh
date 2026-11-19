#!/usr/bin/env bash
# ============================================================================
# build-desktop.sh — ساخت کامل هر سه خروجی دسکتاپ «حسابداری افق پلاس» (R17-A)
# ============================================================================
# اجرا (از ریشهٔ پروژه یا از هر جای دیگر):
#   bash scripts/build-desktop.sh              # همهٔ خروجی‌ها (مدرن + پرتابل + Legacy)
#   bash scripts/build-desktop.sh --modern     # فقط نصاب مدرن + پرتابل
#   bash scripts/build-desktop.sh --legacy     # فقط نصاب Legacy (ویندوز ۷/۸)
#   bash scripts/build-desktop.sh --skip-next  # بیلد Next را رد کن (باندل از قبل ساخته شده)
#
# خروجی‌ها:
#   desktop/dist/OfoghPlus-Setup-<ver>.exe            → ویندوز ۱۰/۱۱ (NSIS x64)
#   desktop/dist/OfoghPlus-Portable-<ver>.exe         → ویندوز ۱۰/۱۱ (بدون نصب)
#   desktop/dist-legacy/OfoghPlus-Legacy-Setup-…exe   → ویندوز ۷ SP1/۸/۸.۱ (x64+ia32)
#   desktop/dist*/SHA256SUMS.txt                      → کنترل سلامت فایل‌ها
#
# مراحل:
#   ۰) fetch-deps.sh — node.exeها + VC++ redist (idempotent، با آینهٔ پشتیبان)
#   ۱) پچ Prisma برای ویندوز (binaryTargets) — بدون این، سرور روی ویندوز
#      نمی‌تواند بالا بیاید و دقیقاً همان باگ «نصب شد ولی باز نشد» برمی‌گردد!
#   ۲) بیلد Next.js با output: standalone و NEXT_DESKTOP=1
#   ۳) اسمبل باندل سرور در desktop/resources/server + دیتابیس + seed
#   ۴) چراغ سبزِ سلامت باندل (موتور Prisma ویندوز حتماً داخل باندل باشد)
#   ۵) electron-builder — سه خروجی
#
# پیش‌نیازها: bun، اینترنت (بار اول)، ~۶GB فضای آزاد.
# روی ویندوز هم با Git-Bash کار می‌کند؛ معادل PowerShell: build-desktop.ps1
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # → project root

ROOT="$(pwd)"
DO_MODERN=1
DO_LEGACY=1
SKIP_NEXT=0
for arg in "$@"; do
  case "$arg" in
    --modern|--modern-only) DO_MODERN=1; DO_LEGACY=0 ;;
    --legacy|--legacy-only) DO_MODERN=0; DO_LEGACY=1 ;;
    --skip-next) SKIP_NEXT=1 ;;
    --all) DO_MODERN=1; DO_LEGACY=1 ;;
    *) echo "آرگومان ناشناخته: $arg (مجاز: --modern / --legacy / --all / --skip-next)"; exit 1 ;;
  esac
done

bold() { echo -e "\e[1m$*\e[0m"; }
step() { bold "\n── $* ──"; }
die()  { echo ""; echo "خطا: $*" >&2; echo "اسکریپت متوقف شد. مشکل را رفع کنید و دوباره اجرا کنید (idempotent است)." >&2; exit 1; }

# ─────────────── پیش‌نیازها ───────────────
step "۰/۵ بررسی پیش‌نیازها"
command -v bun >/dev/null 2>&1 || die "bun نصب نیست. نصب: curl -fsSL https://bun.sh/install | bash"
echo "  bun: $(bun --version)"

# نسخهٔ برنامه از desktop/package.json
APP_VER="$(node -e "console.log(require('./desktop/package.json').version)" 2>/dev/null || bun -e "console.log(require('./desktop/package.json').version)")"
[ -n "$APP_VER" ] || die "نسخهٔ برنامه از desktop/package.json خوانده نشد"
BUNDLE_VER="server-bundle-$APP_VER"
echo "  نسخهٔ بسته: $APP_VER (شناسهٔ باندل: $BUNDLE_VER)"

# ─────────────── ۰) وابستگی‌های ران‌تایم ───────────────
step "۰/۵ دانلود وابستگی‌ها (node.exe / VC++ redist) — idempotent"
bash scripts/fetch-deps.sh || die "دانلود وابستگی‌ها ناقص ماند (پیام بالا را ببینید)"

# ─────────────── ۱) پچ Prisma برای ویندوز ───────────────
step "۱/۵ پچ Prisma برای ویندوز (binaryTargets) — حیاتی"
if grep -q 'binaryTargets' prisma/schema.prisma; then
  echo "  پچ از قبل اعمال شده — رد شد."
else
  sed -i.bak 's|provider = "prisma-client-js"|provider = "prisma-client-js"\n  binaryTargets = ["native", "windows"]|' prisma/schema.prisma
  rm -f prisma/schema.prisma.bak
  grep -q 'binaryTargets' prisma/schema.prisma || die "پچ Prisma اعمال نشد — فایل prisma/schema.prisma را بررسی کنید"
  echo "  پچ اعمال شد: binaryTargets = [\"native\", \"windows\"]"
fi

# ─────────────── ۲) بیلد Next.js ───────────────
if [ "$SKIP_NEXT" = "1" ]; then
  step "۲/۵ بیلد Next.js — رد شد (--skip-next)"
  [ -f ".next/standalone/server.js" ] || die "--skip-next داده شده ولی .next/standalone/server.js وجود ندارد؛ اول بدون این سوییچ اجرا کنید"
else
  step "۲/۵ بیلد Next.js (standalone) — چند دقیقه صبور باشید"
  bun install
  bunx prisma generate
  NEXT_DESKTOP=1 NODE_OPTIONS="--max-old-space-size=4096" bun run build
fi
[ -f ".next/standalone/server.js" ] || die ".next/standalone/server.js پیدا نشد — بیلد Next با موفقیت تمام نشده است"

# ─────────────── ۳) اسمبل باندل سرور ───────────────
step "۳/۵ اسمبل باندل سرور محلی"
SRV="$ROOT/desktop/resources/server"
rm -rf "$SRV"
mkdir -p "$SRV"

# ۳-۱) باندل standalone
cp -r "$ROOT/.next/standalone/." "$SRV/"
# ۳-۲) استاتیک و پابلیک (standalone این‌ها را شامل نمی‌شود)
rm -rf "$SRV/.next/static"
cp -r "$ROOT/.next/static" "$SRV/.next/static"
cp -r "$ROOT/public" "$SRV/public"
# ۳-۳) دیتابیس واقعی (همهٔ مقالات + دمو) + پشتیبان مقالات
mkdir -p "$SRV/db"
# WAL checkpoint تا فایل سالم و کامل کپی شود
if [ -f "$ROOT/db/custom.db-wal" ]; then
  bun -e "
    const { Database } = require('bun:sqlite');
    const db = new Database('db/custom.db');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.close();
  " || echo "  هشدار: WAL checkpoint انجام نشد (ادامه با فایل فعلی)"
fi
cp "$ROOT/db/custom.db" "$SRV/db/custom.db"
[ -f "$ROOT/db/blog-backup.json.gz" ] && cp "$ROOT/db/blog-backup.json.gz" "$SRV/db/"
# ۳-۴) seed + polyfills + VERSION
cp "$ROOT/desktop/resources-template/seed.cjs" "$SRV/seed.cjs"
cp "$ROOT/desktop/resources-template/node16-polyfills.cjs" "$SRV/node16-polyfills.cjs"
echo "$BUNDLE_VER" > "$SRV/VERSION"
# ۳-۵) آیکن برای tray
cp "$ROOT/desktop/build/icon.png" "$ROOT/desktop/resources/icon.png" 2>/dev/null || true

echo "  باندل سرور: $(du -sh "$SRV" | cut -f1)"

# ─────────────── ۴) چراغ سبز سلامت باندل ───────────────
step "۴/۵ بررسی سلامت باندل (قبل از ساختن نصاب)"
[ -f "$SRV/server.js" ]            || die "server.js در باندل نیست"
[ -f "$SRV/db/custom.db" ]         || die "دیتابیس در باندل نیست"
[ -f "$SRV/seed.cjs" ]             || die "seed.cjs در باندل نیست"
[ -f "$SRV/node16-polyfills.cjs" ] || die "node16-polyfills.cjs در باندل نیست"
# موتور Prisma ویندوز — بدون آن سرور روی ویندوز بالا نمی‌آید (ریشهٔ واقعی «باز نمی‌شود»)
# نام فایل در Prisma 5/6: libquery_engine-windows.dll.node (و در نسخه‌های قدیمی query_engine-windows.dll)
ENGINE_COUNT="$(find "$SRV" -name '*query_engine-windows*' 2>/dev/null | head -1)"
if [ -z "$ENGINE_COUNT" ]; then
  die "موتور Prisma ویندوز (libquery_engine-windows.dll.node) در باندل نیست!
  علت: پچ binaryTargets (مرحلهٔ ۱) اعمال نشده یا bun install بعد از آن اجرا نشده.
  راه‌حل: مراحل ۱ و ۲ را دوباره اجرا کنید (بدون --skip-next)."
fi
echo "  موتور Prisma ویندوز: $(basename "$ENGINE_COUNT") — تایید شد"

# ─────────────── ۵) electron-builder ───────────────
prepare_modern_node() {
  mkdir -p "$ROOT/desktop/resources/node" "$ROOT/desktop/resources/redist"
  cp "$ROOT/desktop/deps/node20-x64/node.exe" "$ROOT/desktop/resources/node/node.exe"
  echo "v20.18.1" > "$ROOT/desktop/resources/node/NODE_VERSION"
  [ -f "$ROOT/desktop/build/redist/VC_redist.x64.exe" ] && cp "$ROOT/desktop/build/redist/VC_redist.x64.exe" "$ROOT/desktop/resources/redist/"
  [ -f "$ROOT/desktop/build/redist/VC_redist.x86.exe" ] && cp "$ROOT/desktop/build/redist/VC_redist.x86.exe" "$ROOT/desktop/resources/redist/"
  # در باندل مدرن node16 اضافه نیست (حجم)
  rm -rf "$ROOT/desktop/resources/node16"
}

prepare_legacy_node() {
  mkdir -p "$ROOT/desktop/resources/node" "$ROOT/desktop/resources/redist"
  cp "$ROOT/desktop/deps/node16-x64/node.exe" "$ROOT/desktop/resources/node/node.exe"
  # برای ویندوز ۷ ۳۲بیتی واقعی
  cp "$ROOT/desktop/deps/node16-x86/node.exe" "$ROOT/desktop/resources/node/node-ia32.exe"
  echo "v16.20.2" > "$ROOT/desktop/resources/node/NODE_VERSION"
  [ -f "$ROOT/desktop/build/redist/VC_redist.x64.exe" ] && cp "$ROOT/desktop/build/redist/VC_redist.x64.exe" "$ROOT/desktop/resources/redist/"
  [ -f "$ROOT/desktop/build/redist/VC_redist.x86.exe" ] && cp "$ROOT/desktop/build/redist/VC_redist.x86.exe" "$ROOT/desktop/resources/redist/"
}

make_sums() { # make_sums <پوشهٔ خروجی>
  local dir="$1"
  [ -d "$dir" ] || return 0
  ( cd "$dir" && sha256sum *.exe *.zip 2>/dev/null > SHA256SUMS.txt || true )
  [ -f "$dir/SHA256SUMS.txt" ] && echo "  کنترل سلامت: $dir/SHA256SUMS.txt"
}

if [ "$DO_MODERN" = "1" ]; then
  step "۵/۵ الف) نصاب مدرن + پرتابل (ویندوز ۱۰/۱۱)"
  prepare_modern_node
  (
    cd "$ROOT/desktop"
    bun install || npm install
    bunx electron-builder --win nsis portable --x64 || npx electron-builder --win nsis portable --x64
  ) || die "ساخت نسخهٔ مدرن شکست خورد"
  make_sums "$ROOT/desktop/dist"
  bold "نصاب مدرن آماده است:"
  ls -lh "$ROOT/desktop/dist/" 2>/dev/null || true
fi

if [ "$DO_LEGACY" = "1" ]; then
  step "۵/۵ ب) نصاب Legacy (ویندوز ۷ SP1/۸/۸.۱) — Electron 22.3.27"
  prepare_legacy_node
  (
    cd "$ROOT/desktop"
    bun install || npm install
    bunx electron-builder --win nsis --x64 --ia32 --config electron-builder.legacy.yml || \
      npx electron-builder --win nsis --x64 --ia32 --config electron-builder.legacy.yml
  ) || die "ساخت نسخهٔ Legacy شکست خورد"
  make_sums "$ROOT/desktop/dist-legacy"
  bold "نصاب Legacy آماده است:"
  ls -lh "$ROOT/desktop/dist-legacy/" 2>/dev/null || true
fi

echo ""
bold "تمام! خروجی‌ها آمادهٔ نصب روی ویندوز هستند — بدون هیچ پنجرهٔ CMD/PowerShell."
echo "تست پیش از انتشار را فراموش نکنید: desktop/BUILD-CHECKLIST-fa.md"
