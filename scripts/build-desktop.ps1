# ============================================================================
# build-desktop.ps1 — ساخت کامل هر سه خروجی دسکتاپ «حسابداری افق پلاس» (R17-A)
# ============================================================================
# اجرا از ریشهٔ پروژه (یا هر جای دیگر — خودش مسیر را پیدا می‌کند):
#   powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1
#
# پارامترها:
#   -Legacy     فقط نصاب ویندوز ۷/۸
#   -Modern     فقط نصاب مدرن + پرتابل
#   -SkipNext   بیلد Next را رد کن (باندل از قبل ساخته شده باشد)
#
# خروجی‌ها:
#   desktop\dist\OfoghPlus-Setup-<ver>.exe            → ویندوز ۱۰/۱۱ (NSIS x64)
#   desktop\dist\OfoghPlus-Portable-<ver>.exe         → ویندوز ۱۰/۱۱ (بدون نصب)
#   desktop\dist-legacy\OfoghPlus-Legacy-Setup-…exe   → ویندوز ۷ SP1/۸/۸.۱
#   desktop\dist*\SHA256SUMS.txt                      → کنترل سلامت فایل‌ها
#
# پیش‌نیازها: Bun (bun.sh) + اینترنت بار اول + ~۶GB فضا.
# هیچ پنجرهٔ CMD اضافه‌ای باز نمی‌شود.
# ============================================================================
[CmdletBinding()]
param(
  [switch]$Legacy,
  [switch]$Modern,
  [switch]$SkipNext
)
$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$DoModern = -not $Legacy            # پیش‌فرض: همه
$DoLegacy = -not $Modern
if ($Modern -and $Legacy) { $DoModern = $true; $DoLegacy = $true }

function Write-Step($msg) { Write-Host "`n-- $msg --" -ForegroundColor Yellow }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "  $msg" -ForegroundColor DarkYellow }
function Die($msg) {
  Write-Host ""
  Write-Host "خطا: $msg" -ForegroundColor Red
  Write-Host "اسکریپت متوقف شد. مشکل را رفع کنید و دوباره اجرا کنید (idempotent است)." -ForegroundColor Red
  exit 1
}

Write-Host "== حسابداری افق پلاس — ساخت نسخهٔ دسکتاپ ==" -ForegroundColor Cyan

# ─────────────── پیش‌نیازها ───────────────
Write-Step "۰/۵ بررسی پیش‌نیازها"
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Die "Bun نصب نیست. نصب آن: powershell -c `"`"irm bun.sh/install.ps1 | iex`"`""
}
Write-Ok "bun: $(bun --version)"

$AppVer = (Get-Content "$Root\desktop\package.json" -Raw | ConvertFrom-Json).version
if (-not $AppVer) { Die "نسخهٔ برنامه از desktop\package.json خوانده نشد" }
$BundleVer = "server-bundle-$AppVer"
Write-Ok "نسخهٔ بسته: $AppVer (شناسهٔ باندل: $BundleVer)"

# ─────────────── ۰) وابستگی‌های ران‌تایم ───────────────
Write-Step "۰/۵ دانلود وابستگی‌ها (node.exe / VC++ redist) — idempotent"
$NodeMirrors = @("https://nodejs.org/dist", "https://npmmirror.com/mirrors/node")
$Node20Ver = "20.18.1"; $Node16Ver = "16.20.2"
$Deps = @(
  @{ Urls = @("$NodeMirrors[0]/v$Node20Ver/win-x64/node.exe", "$NodeMirrors[1]/v$Node20Ver/win-x64/node.exe"); Dest = "desktop\deps\node20-x64\node.exe"; Min = 20000000; What = "Node $Node20Ver (x64)" },
  @{ Urls = @("$NodeMirrors[0]/v$Node16Ver/win-x64/node.exe", "$NodeMirrors[1]/v$Node16Ver/win-x64/node.exe"); Dest = "desktop\deps\node16-x64\node.exe"; Min = 20000000; What = "Node $Node16Ver (x64)" },
  @{ Urls = @("$NodeMirrors[0]/v$Node16Ver/win-x86/node.exe", "$NodeMirrors[1]/v$Node16Ver/win-x86/node.exe"); Dest = "desktop\deps\node16-x86\node.exe"; Min = 18000000; What = "Node $Node16Ver (x86)" },
  @{ Urls = @("https://aka.ms/vs/17/release/VC_redist.x64.exe"); Dest = "desktop\build\redist\VC_redist.x64.exe"; Min = 1000000; What = "VC++ Redistributable x64" },
  @{ Urls = @("https://aka.ms/vs/17/release/VC_redist.x86.exe"); Dest = "desktop\build\redist\VC_redist.x86.exe"; Min = 1000000; What = "VC++ Redistributable x86" }
)
foreach ($d in $Deps) {
  $destPath = Join-Path $Root $d.Dest
  if ((Test-Path $destPath) -and (Get-Item $destPath).Length -gt $d.Min) {
    Write-Ok "موجود: $($d.Dest)"
    continue
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $destPath -Parent) | Out-Null
  $done = $false
  foreach ($url in $d.Urls) {
    Write-Host "  دانلود $($d.What) از $url …"
    try {
      Invoke-WebRequest -Uri $url -OutFile "$destPath.tmp" -UseBasicParsing
      if ((Get-Item "$destPath.tmp").Length -gt $d.Min) {
        Move-Item -Force "$destPath.tmp" $destPath
        Write-Ok "ذخیره شد: $($d.Dest) ($([math]::Round((Get-Item $destPath).Length/1MB)) MB)"
        $done = $true; break
      }
    } catch { }
    if (Test-Path "$destPath.tmp") { Remove-Item -Force "$destPath.tmp" }
    Write-Warn2 "شکست خورد — آینهٔ بعدی…"
  }
  if (-not $done) {
    if ($d.Dest -like "*redist*") {
      Write-Warn2 "هشدار: $($d.What) دانلود نشد — نصاب بدون آن هم ساخته می‌شود ولی روی ویندوزهای خیلی تمیز توصیه می‌شود نصب باشد."
    } else {
      Die "دانلود $($d.What) ممکن نشد. اینترنت را بررسی کنید یا فایل را دستی در $($d.Dest) قرار دهید."
    }
  }
}

# ─────────────── ۱) پچ Prisma برای ویندوز ───────────────
Write-Step "۱/۵ پچ Prisma برای ویندوز (binaryTargets) — حیاتی"
$schemaPath = Join-Path $Root "prisma\schema.prisma"
$schema = Get-Content $schemaPath -Raw
if ($schema -match "binaryTargets") {
  Write-Ok "پچ از قبل اعمال شده — رد شد."
} else {
  $schema = $schema -replace 'provider = "prisma-client-js"', "provider = `"prisma-client-js`"`n  binaryTargets = [`"native`", `"windows`"]"
  Set-Content -Path $schemaPath -Value $schema -Encoding UTF8 -NoNewline
  if (-not ((Get-Content $schemaPath -Raw) -match "binaryTargets")) { Die "پچ Prisma اعمال نشد" }
  Write-Ok "پچ اعمال شد: binaryTargets = [native, windows]"
}

# ─────────────── ۲) بیلد Next.js ───────────────
if ($SkipNext) {
  Write-Step "۲/۵ بیلد Next.js — رد شد (-SkipNext)"
  if (-not (Test-Path "$Root\.next\standalone\server.js")) { Die "-SkipNext داده شده ولی .next\standalone\server.js وجود ندارد" }
} else {
  Write-Step "۲/۵ بیلد Next.js (standalone) — چند دقیقه صبور باشید"
  bun install
  bunx prisma generate
  $env:NEXT_DESKTOP = "1"
  $env:NODE_OPTIONS = "--max-old-space-size=4096"
  bun run build
  Remove-Item Env:NEXT_DESKTOP -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
}
if (-not (Test-Path "$Root\.next\standalone\server.js")) { Die ".next\standalone\server.js پیدا نشد — بیلد Next کامل نشده" }

# ─────────────── ۳) اسمبل باندل سرور ───────────────
Write-Step "۳/۵ اسمبل باندل سرور محلی"
$Srv = "$Root\desktop\resources\server"
if (Test-Path $Srv) { Remove-Item -Recurse -Force $Srv }
New-Item -ItemType Directory -Force -Path $Srv | Out-Null

Copy-Item -Recurse -Force "$Root\.next\standalone\*" $Srv
if (Test-Path "$Srv\.next\static") { Remove-Item -Recurse -Force "$Srv\.next\static" }
Copy-Item -Recurse -Force "$Root\.next\static" "$Srv\.next\static"
Copy-Item -Recurse -Force "$Root\public" "$Srv\public"
New-Item -ItemType Directory -Force -Path "$Srv\db" | Out-Null

# WAL checkpoint تا فایل دیتابیس سالم و کامل کپی شود
if (Test-Path "$Root\db\custom.db-wal") {
  try {
    bun -e "const{Database}=require('bun:sqlite');const db=new Database('db/custom.db');db.exec('PRAGMA wal_checkpoint(TRUNCATE);');db.close();"
  } catch { Write-Warn2 "WAL checkpoint انجام نشد (ادامه با فایل فعلی)" }
}
Copy-Item -Force "$Root\db\custom.db" "$Srv\db\custom.db"
if (Test-Path "$Root\db\blog-backup.json.gz") { Copy-Item -Force "$Root\db\blog-backup.json.gz" "$Srv\db\" }

Copy-Item -Force "$Root\desktop\resources-template\seed.cjs" "$Srv\seed.cjs"
Copy-Item -Force "$Root\desktop\resources-template\node16-polyfills.cjs" "$Srv\node16-polyfills.cjs"
Set-Content -Path "$Srv\VERSION" -Value $BundleVer -Encoding ascii
try { Copy-Item -Force "$Root\desktop\build\icon.png" "$Root\desktop\resources\icon.png" } catch {}

Write-Ok "باندل سرور: $([math]::Round(((Get-ChildItem $Srv -Recurse | Measure-Object Length -Sum).Sum)/1MB)) MB"

# ─────────────── ۴) چراغ سبز سلامت باندل ───────────────
Write-Step "۴/۵ بررسی سلامت باندل (قبل از ساختن نصاب)"
foreach ($f in @("server.js", "db\custom.db", "seed.cjs", "node16-polyfills.cjs")) {
  if (-not (Test-Path (Join-Path $Srv $f))) { Die "$f در باندل نیست" }
}
# نام فایل در Prisma 5/6: libquery_engine-windows.dll.node (نسخه‌های قدیمی: query_engine-windows.dll)
$engine = Get-ChildItem $Srv -Recurse -Filter "*query_engine-windows*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $engine) {
  Die "موتور Prisma ویندوز (libquery_engine-windows.dll.node) در باندل نیست!`nعلت: پچ binaryTargets (مرحلهٔ ۱) اعمال نشده یا bun install بعد از آن اجرا نشده.`nراه‌حل: مراحل ۱ و ۲ را دوباره اجرا کنید (بدون -SkipNext)."
}
Write-Ok "موتور Prisma ویندوز: $($engine.Name) — تایید شد"

# ─────────────── ۵) electron-builder ───────────────
function Prepare-ModernNode {
  New-Item -ItemType Directory -Force -Path "$Root\desktop\resources\node", "$Root\desktop\resources\redist" | Out-Null
  Copy-Item -Force "$Root\desktop\deps\node20-x64\node.exe" "$Root\desktop\resources\node\node.exe"
  Set-Content -Path "$Root\desktop\resources\node\NODE_VERSION" -Value "v$Node20Ver" -Encoding ascii
  if (Test-Path "$Root\desktop\build\redist\VC_redist.x64.exe") { Copy-Item -Force "$Root\desktop\build\redist\VC_redist.x64.exe" "$Root\desktop\resources\redist\" }
  if (Test-Path "$Root\desktop\build\redist\VC_redist.x86.exe") { Copy-Item -Force "$Root\desktop\build\redist\VC_redist.x86.exe" "$Root\desktop\resources\redist\" }
  if (Test-Path "$Root\desktop\resources\node16") { Remove-Item -Recurse -Force "$Root\desktop\resources\node16" }
}

function Prepare-LegacyNode {
  New-Item -ItemType Directory -Force -Path "$Root\desktop\resources\node", "$Root\desktop\resources\redist" | Out-Null
  Copy-Item -Force "$Root\desktop\deps\node16-x64\node.exe" "$Root\desktop\resources\node\node.exe"
  Copy-Item -Force "$Root\desktop\deps\node16-x86\node.exe" "$Root\desktop\resources\node\node-ia32.exe"
  Set-Content -Path "$Root\desktop\resources\node\NODE_VERSION" -Value "v$Node16Ver" -Encoding ascii
  if (Test-Path "$Root\desktop\build\redist\VC_redist.x64.exe") { Copy-Item -Force "$Root\desktop\build\redist\VC_redist.x64.exe" "$Root\desktop\resources\redist\" }
  if (Test-Path "$Root\desktop\build\redist\VC_redist.x86.exe") { Copy-Item -Force "$Root\desktop\build\redist\VC_redist.x86.exe" "$Root\desktop\resources\redist\" }
}

function Make-Sums($dir) {
  if (-not (Test-Path $dir)) { return }
  $lines = @()
  Get-ChildItem $dir -Include *.exe, *.zip -Recurse | ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    $lines += "$($hash.ToLower())  $($_.Name)"
  }
  if ($lines.Count -gt 0) {
    Set-Content -Path (Join-Path $dir "SHA256SUMS.txt") -Value $lines -Encoding ascii
    Write-Ok "کنترل سلامت: $dir\SHA256SUMS.txt"
  }
}

if ($DoModern) {
  Write-Step "۵/۵ الف) نصاب مدرن + پرتابل (ویندوز ۱۰/۱۱)"
  Prepare-ModernNode
  Push-Location "$Root\desktop"
  try {
    bun install
    bunx electron-builder --win nsis portable --x64
  } finally { Pop-Location }
  Make-Sums "$Root\desktop\dist"
  Write-Host "نصاب مدرن آماده است:" -ForegroundColor Green
  Get-ChildItem "$Root\desktop\dist" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.Name)  ($([math]::Round($_.Length/1MB)) MB)" }
}

if ($DoLegacy) {
  Write-Step "۵/۵ ب) نصاب Legacy (ویندوز ۷ SP1/۸/۸.۱) — Electron 22.3.27"
  Prepare-LegacyNode
  Push-Location "$Root\desktop"
  try {
    bun install
    bunx electron-builder --win nsis --x64 --ia32 --config electron-builder.legacy.yml
  } finally { Pop-Location }
  Make-Sums "$Root\desktop\dist-legacy"
  Write-Host "نصاب Legacy آماده است:" -ForegroundColor Green
  Get-ChildItem "$Root\desktop\dist-legacy" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.Name)  ($([math]::Round($_.Length/1MB)) MB)" }
}

Write-Host ""
Write-Host "== تمام! خروجی‌ها آمادهٔ نصب روی ویندوز هستند — بدون هیچ پنجرهٔ CMD/PowerShell ==" -ForegroundColor Green
Write-Host "تست پیش از انتشار را فراموش نکنید: desktop\BUILD-CHECKLIST-fa.md"
