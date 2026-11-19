"use client";

// ═══════════════════════════════════════════════════════════════════
// R17-C — نوار «حالت ویرایش مالک» روی سایت عمومی فروشگاه
// وقتی مالک با ?edit=1 سایت خودش را باز کند، این نوار پایین صفحه می‌نشیند:
// ذخیرهٔ تغییرات / تاریخچهٔ تغییرات و بازگردانی / خروج / راهنما.
// تغییرات هر بخش از شیت مشترک ویرایش می‌شود.
// ═══════════════════════════════════════════════════════════════════

import * as React from "react";
import { Loader2, Pencil, Save, LogOut, Info, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function OnSiteOwnerEditBar({
  saving,
  dirty,
  templateIsV2,
  exitArmed,
  onSave,
  onExit,
  onHistory,
  historyLoading,
}: {
  saving: boolean;
  dirty: boolean;
  /** آیا قالب فعلی از ۵ قالب سینمایی v2 است (ویرایش کلیکی فقط روی همین‌ها فعال است) */
  templateIsV2: boolean;
  /** کلیک اول خروج با تغییرات ذخیره‌نشده → دکمه قرمز «خروج بدون ذخیره» می‌شود */
  exitArmed: boolean;
  onSave: () => void;
  onExit: () => void;
  /** R26 — بازکردن تاریخچهٔ تغییرات و بازگردانی */
  onHistory: () => void;
  historyLoading?: boolean;
}) {
  return (
    <>
      {/* فاصلهٔ انتهایی تا نوار، محتوا را نپوشاند */}
      <div className="h-20" aria-hidden="true" />
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-amber-400 bg-zinc-950/95 text-white shadow-2xl backdrop-blur"
        dir="rtl"
        role="region"
        aria-label="نوار ویرایش مالک فروشگاه"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 sm:gap-3">
          <Badge className="gap-1.5 rounded-full bg-amber-400 text-zinc-950 hover:bg-amber-400">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            حالت ویرایش مالک
          </Badge>
          <span className="hidden min-w-0 flex-1 text-xs leading-5 text-zinc-300 sm:block">
            {templateIsV2
              ? "روی دکمهٔ «ویرایش» هر بخش کلیک کنید، تغییر را همان‌جا ببینید و ذخیره کنید."
              : "قالب فعلی شما از نسل قبل است — ویرایش کلیکی روی ۵ قالب سینمایی (سبزینه، رز سرد، فیروزه‌ساز، کهربا، بازار پلاس) فعال است. از پنل مدیریت، در تب «ساخت هوشمند» قالب جدید انتخاب کنید."}
          </span>
          {dirty ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              تغییرات ذخیره‌نشده
            </span>
          ) : null}
          <div className="mr-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white"
              onClick={onHistory}
              disabled={historyLoading}
            >
              {historyLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <History className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              تاریخچهٔ تغییرات
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={
                exitArmed && dirty
                  ? "gap-1.5 rounded-full border-red-400 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                  : "gap-1.5 rounded-full border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white"
              }
              onClick={onExit}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {exitArmed && dirty ? "خروج بدون ذخیره" : "خروج از ویرایش"}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-full bg-emerald-600 font-bold hover:bg-emerald-700"
              onClick={onSave}
              disabled={saving || !dirty}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
              ذخیرهٔ تغییرات
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
