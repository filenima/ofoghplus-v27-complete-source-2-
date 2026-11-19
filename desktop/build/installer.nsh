; ============================================================================
; installer.nsh — اسکریپت سفارشی NSIS نصاب «حسابداری افق پلاس» (بازسازی R17-A)
; ============================================================================
; این فایل توسط electron-builder داخل Setup.exe تزریق می‌شود.
;
; کارها:
;   ۱) نصب بی‌صدای Visual C++ Redistributable 2015-2022 (x64 و x86)
;      — فایل‌ها توسط اسکریپت build از desktop/build/redist داخل
;        resources\redist باندل می‌شوند (extraResources).
;      — نصب با /install /quiet /norestart (بدون هیچ پنجرهٔ اضافه).
;      — کدهای خروج موفق: 0 (نصب شد)، 1638/5100 (از قبل نصب است)،
;        3010 (نصب شد، نیاز به ری‌استارت).
;      — اگر نصاب per-user بدون دسترسی ادمین اجرا شود و vcredist کد 740
;        بدهد، بی‌صدا رد می‌شود؛ خود برنامه به موتور داخلی (بدون نیاز به
;        VC++) سوئیچ می‌کند — کاربر هیچ خطایی نمی‌بیند.
;   ۲) اجرای خودکار هنگام روشن شدن ویندوز — فقط اگر نصاب با سوییچ
;      /AUTOSTART=1 اجرا شود (نصب بی‌صدای سازمانی). کاربر عادی می‌تواند
;      همین گزینه را بعداً از منوی کنار ساعت خودِ برنامه فعال کند.
;   ۳) uninstall کامل: کلید اجرای خودکار حذف می‌شود؛ داده‌های حسابداری
;      کاربر (AppData) دست‌نخورده می‌ماند و مسیرش به کاربر اعلام می‌شود.
;
; هیچ ExecShell/Exec با برنامهٔ کنسولی استفاده نشده است — هیچ پنجرهٔ
; CMD/PowerShell هرگز دیده نمی‌شود.
; ============================================================================

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

; متغیر سراسری NSIS (باید بیرون از macro/section تعریف شود)
Var /GLOBAL OfoghVcDir

; ─── برچسب‌های فارسی صفحات نصاب (در صورت نمایش DetailPrint) ───
LangString VcInstalling ${LANG_ENGLISH} "در حال نصب Visual C++ Redistributable (چند لحظه)..."
LangString VcOk ${LANG_ENGLISH} "Visual C++ Redistributable آماده شد."
LangString VcSkipped ${LANG_ENGLISH} "Visual C++ Redistributable از قبل نصب است یا لازم نیست."

!macro customInit
  ; همزیستی با نسخه‌های قبلی مجاز است — هیچ کاری نمی‌کنیم.
!macroend

!macro customInstall
  ; ── ۱) نصب VC++ Redistributable (بی‌صدا، بدون پنجره) ──
  ; محل جدید: resources\redist — محل قدیمی: resources\vcredist (سازگاری)
  StrCpy $OfoghVcDir "$INSTDIR\resources\redist"
  IfFileExists "$OfoghVcDir\VC_redist.x64.exe" ofogh_vc_found 0
    StrCpy $OfoghVcDir "$INSTDIR\resources\vcredist"
  ofogh_vc_found:

  ; ── x64 (فقط روی ویندوز ۶۴بیتی) ──
  ${If} ${RunningX64}
    IfFileExists "$OfoghVcDir\VC_redist.x64.exe" 0 ofogh_vc_x64_done
      DetailPrint "$(VcInstalling)"
      ExecWait '"$OfoghVcDir\VC_redist.x64.exe" /install /quiet /norestart' $0
      IntCmp $0 0 ofogh_vc_x64_ok 0 0
      IntCmp $0 1638 ofogh_vc_x64_ok 0 0
      IntCmp $0 3010 ofogh_vc_x64_ok 0 0
      IntCmp $0 5100 ofogh_vc_x64_ok 0 0
      DetailPrint "Visual C++ x64: کد خروج $0 (از قبل نصب است یا دسترسی کم است — برنامه بدون آن هم اجرا می‌شود)"
      Goto ofogh_vc_x64_done
    ofogh_vc_x64_ok:
      DetailPrint "$(VcOk)"
    ofogh_vc_x64_done:
  ${EndIf}

  ; ── x86 (روی همهٔ ویندوزها — برای موتور ۳۲بیتی نسخهٔ Legacy) ──
  IfFileExists "$OfoghVcDir\VC_redist.x86.exe" 0 ofogh_vc_x86_done
    DetailPrint "$(VcInstalling)"
    ExecWait '"$OfoghVcDir\VC_redist.x86.exe" /install /quiet /norestart' $0
    IntCmp $0 0 ofogh_vc_x86_ok 0 0
    IntCmp $0 1638 ofogh_vc_x86_ok 0 0
    IntCmp $0 3010 ofogh_vc_x86_ok 0 0
    IntCmp $0 5100 ofogh_vc_x86_ok 0 0
    DetailPrint "Visual C++ x86: کد خروج $0 (از قبل نصب است یا دسترسی کم است — برنامه بدون آن هم اجرا می‌شود)"
    Goto ofogh_vc_x86_done
  ofogh_vc_x86_ok:
    DetailPrint "$(VcOk)"
  ofogh_vc_x86_done:

  ; ── ۲) اجرای خودکار هنگام روشن شدن (فقط با سوییچ /AUTOSTART=1) ──
  ${GetOptions} $CMDLINE "/AUTOSTART=" $1
  ${IfNot} ${Errors}
    ${If} $1 == "1"
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OfoghPlus" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
      DetailPrint "اجرای خودکار هنگام روشن شدن ویندوز فعال شد."
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ; ── حذف کلید اجرای خودکار ──
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OfoghPlus"

  ; ── داده‌های حسابداری کاربر حذف نمی‌شود — فقط مسیرش اعلام می‌شود ──
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_TOPMOST \
    "داده‌های حسابداری شما (دیتابیس و تنظیمات) برای اطمینان در این مسیر نگه داشته شده است:$\r$\n$\r$\n$APPDATA\OfoghPlus$\r$\n$\r$\nمی‌خواهید این پوشه را الان باز کنید؟" \
    IDNO ofogh_uninstall_skip_open
    ExecShell "open" "$APPDATA\OfoghPlus"
  ofogh_uninstall_skip_open:
!macroend
