#!/bin/bash
# dev-watchdog-r19 — نگه‌دارندهٔ سرور dev «افق پلاس» در سندباکس ۴GB
# پایدارسازی راند ۱۹:
#  - تایم‌اوت هلت ۶۰ ثانیه (کامپایل سرد Turbopack تا ~۳۰ ثانیه طول می‌کشد)
#  - آستانهٔ ۴ خطای متوالی قبل از ری‌استارت (ضد فلپ)
#  - حافظهٔ ۲۰۴۸MB (الگوی اثبات‌شده)
#  - double-setsid orphan — بین فراخوانی‌های ابزار زنده می‌ماند
ROOT="/home/z/my-project"
LOG="$ROOT/watchdog.log"
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }

start_server() {
  log "starting dev server (orphan double-setsid, 1024MB)"
  cd "$ROOT" || return 1
  setsid bash -c "setsid nohup env NODE_OPTIONS='--max-old-space-size=1024' TURBOPACK_MAX_WORKERS=1 NEXT_TELEMETRY_DISABLED=1 bunx next dev -p 3000 -H 0.0.0.0 > dev.log 2>&1 < /dev/null &" > /dev/null 2>&1 < /dev/null &
}

FAILS=0
mkdir -p "$ROOT"
while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 60 http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ "$code" = "200" ]; then
    FAILS=0
  else
    FAILS=$((FAILS + 1))
    log "health miss #$FAILS (code=$code)"
    if [ "$FAILS" -ge 4 ]; then
      log "threshold reached — killing strays and restarting"
      pkill -f "next dev" 2>/dev/null
      pkill -f "next-server" 2>/dev/null
      sleep 3
      start_server
      FAILS=0
      # انتظار حداکثر ۱۸۰ ثانیه برای بالا آمدن (کامپایل سرد)
      for i in $(seq 1 36); do
        sleep 5
        c=$(curl -s -o /dev/null -w "%{http_code}" -m 60 http://127.0.0.1:3000/api/health 2>/dev/null)
        if [ "$c" = "200" ]; then log "server back up"; break; fi
      done
    fi
  fi
  sleep 15
done
