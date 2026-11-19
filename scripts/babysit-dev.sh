#!/bin/bash
# babysit-dev.sh — نگهبان سرور dev سندباکس (R16)
# چرا: سندباکس ۴GB است و کامپایل سردِ روت اصلی گاهی next-server را
# با OOM می‌کشد. این نگهبان هر ۲۰ ثانیه سلامت را چک می‌کند و اگر
# سرور مرده باشد دوباره `bun run dev` را بالا می‌آورد (کش گرم → بوت سریع).
# الگوی مستند scripts/dev-services.sh: درخت فرزندانِ setsid زنده می‌مانند.
LOG="/tmp/babysit-dev.log"
cd /home/z/my-project/hooshhesab
while true; do
  if ! curl -s -m 3 "http://127.0.0.1:3000/api/health" > /dev/null 2>&1; then
    echo "[$(date -u +%H:%M:%S)] server down — restarting bun run dev" >> "$LOG"
    (setsid nohup bash scripts/dev-services.sh > /dev/null 2>&1 < /dev/null &)
    (setsid nohup env NODE_OPTIONS='--max-old-space-size=2048' TURBOPACK_MAX_WORKERS=1 NEXT_TELEMETRY_DISABLED=1 bunx next dev -p 3000 -H 0.0.0.0 > /tmp/hoosh-babysit.log 2>&1 < /dev/null &)
    sleep 90 # فرصت بوت/کامپایل
  fi
  sleep 20
done
