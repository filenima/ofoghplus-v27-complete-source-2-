#!/bin/bash
# package-v20 — بسته‌بندی نسخهٔ v20 افق پلاس
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="v25"
OUT="download/ofoghplus-${VERSION}-complete-source.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "[v25] staging..."
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
  --exclude '/agent-ctx' \
  ./ "$STAGE/ofoghplus/"

# WAL checkpoint تا custom.db خودکفا باشد
PRJ_DB="${ROOT}/db/custom.db"
if [ -f "$PRJ_DB" ]; then
  echo "[v25] WAL checkpoint..."
  (cd "$ROOT" && bun -e 'import {Database} from "bun:sqlite"; const db=new Database("db/custom.db"); db.run("PRAGMA wal_checkpoint(TRUNCATE)"); db.close();' ) >/dev/null 2>&1 || true
fi

# .env قابل حمل
if [ -f "$STAGE/ofoghplus/.env" ]; then
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:db/custom.db"|' "$STAGE/ofoghplus/.env"
fi

echo "[v25] writing zip..."
mkdir -p download upload
rm -f "$OUT"
(cd "$STAGE" && zip -qr - ofoghplus) > "$OUT"

# راستی‌آزمایی
DB_IN_ZIP=$(unzip -l "$OUT" | grep -c "ofoghplus/db/custom.db" || true)
BACKUP_IN_ZIP=$(unzip -l "$OUT" | grep -c "ofoghplus/db/blog-backup.json.gz" || true)
NEW_API=$(unzip -l "$OUT" | grep -cE "reviews/route.ts|manage/products|manage/categories|files/upload" || true)
if [ "${DB_IN_ZIP:-0}" -lt 1 ] || [ "${BACKUP_IN_ZIP:-0}" -lt 1 ]; then
  echo "FATAL: db/backup missing in zip"; exit 1
fi
SIZE=$(stat -c%s "$OUT")
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "[v25] OK: $OUT — $FILES files — $((SIZE/1024/1024))MB — db=$DB_IN_ZIP backup=$BACKUP_IN_ZIP newApis=$NEW_API"

cp -f "$OUT" "upload/ofoghplus-${VERSION}-complete-source.zip"
echo "[v25] copied to upload/"
md5sum "$OUT" "upload/ofoghplus-${VERSION}-complete-source.zip"
