#!/usr/bin/env bash
# ============================================================
# scripts/seo/fetch-page.sh — گیرندهٔ مقاوم صفحات برای ممیزی سئو
# (ایجنت ۱ — فنی): سرور dev سندباکس زیر فشار کامپایل‌های سنگین
# گاهی OOM می‌میرد؛ این اسکریپت در صورت قطعی، سرور را بالا می‌آورد
# و دوباره تلاش می‌کند. فقط برای «خواندن» است — هیچ چیزی نمی‌کشد
# مگر اینکه سرور از قبل مرده باشد.
# استفاده: fetch-page.sh /pricing > out.html
# ============================================================
PAGE="$1"
OUT="${2:-/dev/stdout}"
TRIES="${TRIES:-6}"

start_server() {
  cd /home/z/my-project || exit 1
  nohup env NODE_OPTIONS='--max-old-space-size=1024' TURBOPACK_MAX_WORKERS=1 \
    NEXT_TELEMETRY_DISABLED=1 bunx next dev -p 3000 -H 0.0.0.0 >> dev.log 2>&1 &
  disown
}

for i in $(seq 1 "$TRIES"); do
  code=$(curl -s -o "$OUT" -w "%{http_code}" --max-time 150 "http://localhost:3000$PAGE")
  if [ "$code" != "000" ]; then
    echo "$code" >&2
    exit 0
  fi
  # سرور مرده — ری‌استارت و تلاش مجدد
  start_server
  for j in $(seq 1 12); do
    sleep 10
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://localhost:3000/robots.txt)
    [ "$c" = "200" ] && break
  done
done
echo "000" >&2
exit 1
