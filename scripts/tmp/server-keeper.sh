#!/bin/bash
# server-keeper — نگه‌دارندهٔ سبک سرور dev در فشار حافظهٔ host
# هر ۲۰ ثانیه: اگر سرور مرده → ری‌استارت + یک curl به / (کامپایل تدریجی کش)
cd /home/z/my-project
while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ "$code" != "200" ]; then
    if ! pgrep -f "next-server" > /dev/null 2>&1; then
      echo "[$(date '+%H:%M:%S')] keeper: restarting server" >> /home/z/my-project/keeper.log
      setsid bash -c "setsid nohup env NODE_OPTIONS='--max-old-space-size=1024' TURBOPACK_MAX_WORKERS=1 NEXT_TELEMETRY_DISABLED=1 bunx next dev -p 3000 -H :: > /home/z/my-project/dev.log 2>&1 < /dev/null &" > /dev/null 2>&1
      sleep 15
    fi
  else
    # گرم‌نگه‌داشتن: اگر روت از کش می‌آید سریع است؛ اگر نه، کامپایل را کلید بزن
    curl -s -o /dev/null -w "" -m 120 http://127.0.0.1:3000/ 2>/dev/null &
  fi
  sleep 20
done
