#!/bin/bash
# ============================================================
# package-source-r19.sh — بستهٔ کامل «افق پلاس» v19
# ساختار درست: پروژه در ریشهٔ zip (مثل v17) — رفع خرابی v18
# که به‌اشتباه فقط پوشهٔ زامبی hooshhesab/ را بسته بود.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="${1:-v19}"
OUT="download/ofoghplus-${VERSION}-complete-source.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "[pkg] WAL checkpoint ..."
bun -e 'import {Database} from "bun:sqlite"; const db=new Database("db/custom.db"); db.run("PRAGMA wal_checkpoint(TRUNCATE)"); db.close();' >/dev/null 2>&1 || true

echo "[pkg] staging (root-level layout) ..."
rsync -a \
  --exclude '/node_modules' \
  --exclude '/.next' \
  --exclude '/.turbo' \
  --exclude '/.git' \
  --exclude '/dist' \
  --exclude '/tool-results' \
  --exclude '/download' \
  --exclude '/upload' \
  --exclude '/.env.local' \
  --exclude '*.log' \
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
  --exclude '/desktop/dist' \
  --exclude '/.rag-research' \
  --exclude '/.zscripts' \
  --exclude '/.qa-superadmin-apis.md' \
  --exclude '/agent-ctx' \
  ./ "$STAGE/"

# .env قابل حمل
if [ -f "$STAGE/.env" ]; then
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL="file:db/custom.db"|' "$STAGE/.env"
fi

echo "[pkg] zipping ..."
mkdir -p download
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$ROOT/$OUT" .)

# ── راستی‌آزمایی ساختار ──
echo "[pkg] verification:"
for MUST in \
  "app/shop" \
  "components/storefront/aurora/aurora-template.tsx" \
  "components/storefront/aurora/aurora.css" \
  "app/api/storefront" \
  "docs/marketing-outreach-texts-fa.md" \
  "docs/ADMIN-PANEL-UPGRADE-PROPOSALS-R19.md" \
  "lib/plans.ts" \
  "prisma/schema.prisma" \
  "db/custom.db" \
  "db/blog-backup.json.gz" \
  "package.json" \
  "استراتژی-جذب-نسخه-۵.md" \
  "گزارش-جامع-راند-۲۲.md"; do
  N=$(unzip -l "$OUT" | grep -c " $MUST\$" || true)
  if [ "${N:-0}" -ge 1 ]; then
    echo "  ✓ $MUST"
  else
    # ممکن است unzip -l با سایز پیش بیاید — تطبیق شل‌تر
    N2=$(unzip -l "$OUT" | grep -c "$MUST" || true)
    if [ "${N2:-0}" -ge 1 ]; then echo "  ✓ $MUST (fuzzy)"; else echo "  ✗ MISSING: $MUST"; fi
  fi
done

SIZE=$(du -h "$OUT" | cut -f1)
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "[pkg] ✓ $OUT ($SIZE, $FILES files)"

cp -f "$OUT" "upload/ofoghplus-${VERSION}-complete-source.zip"
echo "[pkg] ✓ copied to upload/"
