// ============ lib/funnel-events.ts — اتصال رویدادهای قیف به نقاط طبیعی محصول ============
//
// R28-6: داشبورد قیف/A-B (lib/funnel-ab.ts + /api/platform/analytics/funnel/ab-test)
// وجود داشت ولی «هیچ» رویدادی ثبت نمی‌شد — KPIهای استراتژی جذب قابل اثبات نبودند.
// این ماژول ثبتِ fire-and-forget است: خطای تحلیلی هرگز مسیر اصلی کاربر را نمی‌شکند.

import { trackFunnelStep, type FunnelStep } from "@/lib/funnel-ab";

/**
 * ثبت یک رویداد قیف — بدون await (مسیر اصلی منتظر نمی‌ماند) و بدون خطا.
 * @param userId شناسهٔ کاربر (null/empty = بی‌اثر)
 * @param step مرحلهٔ قیف (signup | trial_started | first_invoice | first_payment | paid)
 */
export function funnelEvent(
 userId: string | null | undefined,
 step: FunnelStep
): void {
 if (!userId) return;
 try {
 void trackFunnelStep(userId, step).catch(() => undefined);
 } catch {
 // تحلیلی — هرگز نباید خطا بدهد
 }
}
