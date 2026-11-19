#!/bin/bash
# dev-watchdog-v40 — نگه‌دارندهٔ سرور dev «افق پلاس v21» در سندباکس ۴GB
# مسیر پروژه: /home/z/my-project (بعد از بازگردانی v20 در ریشه)
#
# منطق دو مرحله‌ای (v40-final):
#  فاز ۱ (warm-up — تا اولین 200 از روت /): آستانهٔ بازیافت ۳۰۵۰MB — اجازهٔ
#    کامپایل کامل صفحهٔ اصلی با حافظهٔ بالا؛ فقط جلوی OOM-kill واقعی گرفته می‌شود.
#    وقتی / یک بار 200 داد → /tmp/ofogh-warmed.flag ساخته می‌شود.
#  فاز ۲ (پایدار): آستانهٔ ۱۶۰۰MB + چک هر ۸ ثانیه — بازیافت تمیز و پیشگیرانه.
ROOT="/home/z/my-project"
LOG="$ROOT/watchdog.log"
WARMED=/tmp/ofogh-warmed.flag
log() { echo "[$(date '+H:%M:%S')] $*" >> "$LOG"; }

start_server() {
  log "starting dev server (orphan double-setsid)"
  # mini-services به‌صورت idempotent (پورت‌ها چک می‌شوند)
  (cd "$ROOT" && setsid nohup bash scripts/dev-services.sh > /dev/null 2>&1 < /dev/null &)
  cd "$ROOT" || return 1
  setsid bash -c "setsid nohup env NODE_OPTIONS='--max-old-space-size=1024' TURBOPACK_MAX_WORKERS=1 NEXT_TELEMETRY_DISABLED=1 bunx next dev -p 3000 -H :: > dev.log 2>&1 < /dev/null &" > /dev/null 2>&1 < /dev/null &
}

# جلوگیری از نمونهٔ دوم
LOCK=/tmp/ofogh-watchdog.lock
if [ -f "$LOCK" ] && kill -0 "$(cat $LOCK 2>/dev/null)" 2>/dev/null; then
  exit 0
fi
echo $$ > "$LOCK"

rss_mb() {
  local pid
  pid=$(pgrep -f "next-server" | head -1)
  [ -n "$pid" ] || echo 0
  [ -n "$pid" ] && awk '/VmRSS/ {print int($2/1024)}' "/proc/$pid/status" 2>/dev/null || echo 0
}

while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ "$code" != "200" ]; then
    if ! pgrep -f "next-server" > /dev/null 2>&1; then
      log "server dead (code=$code) — restarting"
      start_server
      for i in $(seq 1 24); do
        sleep 5
        c=$(curl -s -o /dev/null -w "%{http_code}" -m 8 http://127.0.0.1:3000/api/health 2>/dev/null)
        if [ "$c" = "200" ]; then log "server back up"; break; fi
      done
    fi
  fi

  # فاز تعیین آستانه — v40.4 (Task 4): حالت پایدار ۳۳۰۰MB
  # FIX(infra): آستانهٔ قبلی ۲۴۰۰MB از پیک کامپایل صفحهٔ اصلی (~۲.۹-۳.۱GB) کمتر بود →
  # بعد از هر بازیافت، اولین بازدید از / وسط کامپایل کشته می‌شد و اپ هرگز بالا
  # نمی‌آمد (حلقهٔ kill-loop). v40.4: هر دو فاز ۳۳۰۰MB — پیک مشاهده‌شدهٔ کامپایل
  # ~۳.۰۶GB است و در گرمِ کامل RSS زیر ۲.۴GB می‌ماند؛ ۳۳۰۰ فقط اجازهٔ کامل‌شدن
  # کامپایل را می‌دهد و در حالت idle سرور سبک است.
  if [ -f "$WARMED" ]; then
    LIMIT=3550; POLL=8
  else
    LIMIT=3550; POLL=4
    # تست گرم‌شدن روت اصلی
    hc=$(curl -s -o /dev/null -w "%{http_code}" -m 150 http://127.0.0.1:3000/ 2>/dev/null)
    if [ "$hc" = "200" ]; then
      touch "$WARMED"
      log "WARMED: home page compiled & served — switching to conservative mode"
    fi
  fi

  rss=$(rss_mb)
  if [ "${rss:-0}" -gt "$LIMIT" ]; then
    log "planned recycle: rss=${rss}MB (limit=$LIMIT)"
    pkill -f "next-server" 2>/dev/null
    sleep 5
  fi
  sleep $POLL
done
