#!/usr/bin/env bash
# ============================================================================
# fetch-deps.sh — دانلود وابستگی‌های ران‌تایم ویندوز (بازسازی R17-A)
# ============================================================================
# چه چیزی دانلود/کش می‌کند (همه idempotent — دوباره اجرا کردن فقط چک می‌کند):
#   ۱) node.exe نسخهٔ مدرن (v20.18.1 x64)  → desktop/deps/node20-x64/
#   ۲) node.exe نسخهٔ Legacy  (v16.20.2 x64+x86) → desktop/deps/node16-x64|node16-x86/
#      (آخرین نودی که روی ویندوز ۷/۸ اجرا می‌شود)
#   ۳) VC++ Redistributable 2015-2022 (x64 + x86) → desktop/build/redist/
#      (الزام Electron 22 و node.exe روی ویندوزهای تمیز)
#
# دانلود Node از nodejs.org؛ اگر شکست خورد خودکار از آینهٔ npmmirror.com
# (قابل‌حضور در ایران) امتحان می‌کند. با متغیر NODE_MIRROR می‌توان آینه را
# دستی ست کرد.
#
# اگر اینترنت نبود: پیام راهنمای دقیق فارسی چاپ می‌شود و اسکریپت با کد 1
# می‌ایستد — هرگز بستهٔ ناقص ساخته نمی‌شود.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # → project root

NODE_MIRROR_PRIMARY="${NODE_MIRROR:-https://nodejs.org/dist}"
NODE_MIRROR_FALLBACK="https://npmmirror.com/mirrors/node"
VC_REDIST_X64_URL="https://aka.ms/vs/17/release/VC_redist.x64.exe"
VC_REDIST_X86_URL="https://aka.ms/vs/17/release/VC_redist.x86.exe"

NODE20_VER="20.18.1"
NODE16_VER="16.20.2"

# ─── ابزار دانلود با تلاش دوباره ───
fetch_any() { # fetch_any <url1|url2|...> <dest> <min-size> <اسم-فارسی>
  local urls="$1" dest="$2" min="$3" what="$4"
  if [ -f "$dest" ] && [ "$(stat -c%s "$dest" 2>/dev/null || echo 0)" -gt "$min" ]; then
    echo "  موجود: $dest"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  local IFS='|'
  for url in $urls; do
    echo "  دانلود $what از $url …"
    if curl -fSL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$dest.tmp" "$url"; then
      if [ "$(stat -c%s "$dest.tmp" 2>/dev/null || echo 0)" -gt "$min" ]; then
        mv "$dest.tmp" "$dest"
        echo "  ذخیره شد: $dest ($(du -h "$dest" | cut -f1))"
        return 0
      fi
    fi
    rm -f "$dest.tmp"
    echo "  شکست خورد — آینهٔ بعدی را امتحان می‌کنیم…"
  done
  echo ""
  echo "  خطا: دانلود $what ممکن نشد." >&2
  echo "  راهنما:" >&2
  echo "   ۱) اتصال اینترنت را بررسی کنید." >&2
  echo "   ۲) اگر nodejs.org مسدود است، آینه را دستی ست کنید:" >&2
  echo "      NODE_MIRROR=https://npmmirror.com/mirrors/node bash scripts/fetch-deps.sh" >&2
  echo "   ۳) اگر اصلاً اینترنت ندارید، این فایل‌ها را از یک سیستم دیگر دانلود و در همین مسیرها بگذارید:" >&2
  echo "      $dest" >&2
  return 1
}

echo "── وابستگی‌های دسکتاپ حسابداری افق پلاس ──"

# ── Node 20 (مدرن — Win10/11) ──
fetch_any \
  "$NODE_MIRROR_PRIMARY/v$NODE20_VER/win-x64/node.exe|$NODE_MIRROR_FALLBACK/v$NODE20_VER/win-x64/node.exe" \
  "desktop/deps/node20-x64/node.exe" 20000000 "Node $NODE20_VER (x64)"

# ── Node 16 (Legacy — Win7/8) ──
fetch_any \
  "$NODE_MIRROR_PRIMARY/v$NODE16_VER/win-x64/node.exe|$NODE_MIRROR_FALLBACK/v$NODE16_VER/win-x64/node.exe" \
  "desktop/deps/node16-x64/node.exe" 20000000 "Node $NODE16_VER (x64)"

fetch_any \
  "$NODE_MIRROR_PRIMARY/v$NODE16_VER/win-x86/node.exe|$NODE_MIRROR_FALLBACK/v$NODE16_VER/win-x86/node.exe" \
  "desktop/deps/node16-x86/node.exe" 18000000 "Node $NODE16_VER (x86)"

# ── VC++ Redistributable 2015-2022 (کش در desktop/build/redist) ──
fetch_any "$VC_REDIST_X64_URL" "desktop/build/redist/VC_redist.x64.exe" 1000000 "VC++ Redistributable x64" || {
  echo "  هشدار: VC_redist.x64 دانلود نشد — نصاب بدون آن هم ساخته می‌شود ولی روی" >&2
  echo "  ویندوزهای خیلی تمیز ممکن است node.exe اجرا نشود (برنامه در آن حالت به" >&2
  echo "  موتور داخلی خودش سوئیچ می‌کند و کار می‌کند، ولی بهتر است فایل را دستی بگذارید)." >&2
}
fetch_any "$VC_REDIST_X86_URL" "desktop/build/redist/VC_redist.x86.exe" 1000000 "VC++ Redistributable x86" || {
  echo "  هشدار: VC_redist.x86 دانلود نشد — برای ویندوز ۷ ۳۲بیتی توصیه می‌شود نصب شود." >&2
}

echo "── همهٔ وابستگی‌ها آماده است ──"
