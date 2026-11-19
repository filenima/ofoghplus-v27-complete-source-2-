#!/bin/bash
# ============================================================
# package-source.sh — ساخت zip کامل سورس هوش‌حساب برای تحویل
# ============================================================
# استفاده: bash scripts/package-source.sh [نسخه]   (پیش‌فرض: v31)
# خروجی: download/hooshhesab-<نسخه>-complete-source.zip
#
# شامل: کل سورس (app/components/lib/hooks/prisma/db/mini-services/
#   scripts/public) + دیتابیس با همهٔ مقالات + پیکربندی‌ها + .env + worklog
# بدون: node_modules ریشه (بعد از unzip: `bun install`)، کش‌های build
#   (.next/.turbo)، .git، لاگ‌ها، tool-results، zipهای قبلی download
# node_modules سرویس‌های کوچک (chat/modian/audit/seo-worker) حفظ می‌شود
# تا mini-services بدون نصب هم بالا بیایند (الگوی zipهای قبلی).
#
# قابل اجرای مکرر — برای تازه‌سازی zip بعد از تولید مقالات جدید کافی
# است دوباره اجرا شود (کرون webDevReview هم همین کار را می‌کند).
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="${1:-v37}"
OUT="download/hooshhesab-${VERSION}-complete-source.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "[package] staging source (${VERSION})..."
rsync -a \
  --exclude '/node_modules' \
  --exclude '/.next' \
  --exclude '/.turbo' \
  --exclude '/.git' \
  --exclude '/dist' \
  --exclude '/tool-results' \
  --exclude '/download' \
  --exclude '/upload' \
  --exclude '/skills' \
  --exclude '/.env.local' \
  --exclude '*.log' \
  --exclude 'check-*-tmp.cjs' \
  --exclude '.DS_Store' \
  --exclude '*.zip' \
  --exclude '/public/downloads' \
  --exclude '*.apk' \
  --exclude '.gradle' \
  --exclude 'app/build' \
  --exclude '/.tmp-*' \
  --exclude '/.tmpq' \
  --exclude '/desktop/node_modules' \
  --exclude '/desktop/node-runtime/node.exe' \
  --exclude '/desktop/dist/win-unpacked' \
  ./ "$STAGE/hooshhesab/"

# FIX(1-e): ۱) WAL-checkpoint قبل از بسته‌بندی — تا فایل اصلی custom.db
# خودکفا باشد حتی اگر -wal در پروسهٔ zip جا بماند (تست‌شده با bun:sqlite).
# ۲) مسیر .env قابل حمل و «درست»: قبلاً file:../db/custom.db نوشته می‌شد که
# بیرون از ریشهٔ پروژه resolve می‌شد (در استقرار کاربر → دیتابیس غایب →
# بلاگ خالی!). حالا file:db/custom.db نسبی — و next.config در بوت آن را
# مطلق می‌کند + instrumentation.ts سلامتش را با شمارش مقاله تایید می‌کند.
PRJ_DB="${ROOT}/db/custom.db"
if [ -f "$PRJ_DB" ]; then
  echo "[package] WAL checkpoint on db/custom.db ..."
  (cd "$ROOT" && bun -e 'import {Database} from "bun:sqlite"; const db=new Database("db/custom.db"); db.run("PRAGMA wal_checkpoint(TRUNCATE)"); db.close();' ) >/dev/null 2>&1 || true
fi

# .env قابل حمل: مسیر مطلق سندباکس/ماشین فعلی → مسیر نسبی درست از ریشهٔ
# پروژه. self-heal بوت (instrumentation) آن را به مسیر مطلق ماشین مقصد
# تبدیل و صحت‌سنجی می‌کند. JWT_SECRET دست‌نخورده می‌ماند (با داده‌های
# دیتابیس هماهنگ است).
if [ -f "$STAGE/hooshhesab/.env" ]; then
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:db/custom.db"|' "$STAGE/hooshhesab/.env"
fi

# گزارش جامع راند ۱۰ — داخل ریشهٔ بسته (download/ در zip نیست)
# گزارش جامع راند ۱۱ — داخل ریشهٔ بسته (download/ در zip نیست)
for REPORT in "./گزارش-جامع-راند-۱۶.md" "./گزارش-جامع-راند-۱۲.md" "./گزارش-جامع-راند-۱۱.md" "./گزارش-جامع-راند-۱۰.md"; do
  if [ -f "$REPORT" ]; then
    cp "$REPORT" "$STAGE/hooshhesab/" 2>/dev/null || true
  fi
done

echo "[package] writing zip..."
mkdir -p download
rm -f "$OUT"
(cd "$STAGE" && zip -qr - hooshhesab) > "$OUT"

# FIX(1-e): تایید سلامت بسته — دیتابیس واقعی + پشتیبان مقالات + .env درست
DB_IN_ZIP=$(unzip -l "$OUT" | grep -c "hooshhesab/db/custom.db" || true)
BACKUP_IN_ZIP=$(unzip -l "$OUT" | grep -c "hooshhesab/db/blog-backup.json.gz" || true)
if [ "${DB_IN_ZIP:-0}" -lt 1 ]; then
  echo "[package] ⚠️ هشدار: db/custom.db در zip نیست!"
else
  DB_SIZE=$(unzip -l "$OUT" | grep "hooshhesab/db/custom.db" | awk '{print $1}')
  echo "[package] ✓ db/custom.db داخل zip ($DB_SIZE bytes)"
fi
if [ "${BACKUP_IN_ZIP:-0}" -lt 1 ]; then
  echo "[package] ⚠️ هشدار: db/blog-backup.json.gz در zip نیست!"
else
  echo "[package] ✓ db/blog-backup.json.gz داخل zip"
fi

SIZE=$(du -h "$OUT" | cut -f1)
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "[package] ✓ $OUT  ($SIZE, $FILES files)"
echo "[package] برای اجرا بعد از unzip: bun install && bun run db:push (در صورت نیاز) && bun run dev"
