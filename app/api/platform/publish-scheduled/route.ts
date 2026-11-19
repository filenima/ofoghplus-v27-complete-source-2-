import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { publishDueScheduledPosts, autoScheduleDrafts } from "@/lib/blog-scheduler";
import { pingSitemapEngines } from "@/lib/sitemap-ping";
import { pingIndexNowUrls, getIndexNowBaseUrl, blogUrlFromSlug } from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST|GET /api/platform/publish-scheduled — تریگر دستیِ زمان‌بند انتشار بلاگ
 * از پالت فرمان سوپرادمین (اکشن «انتشار فوری مقالهٔ بعدیِ سررسیده»).
 *
 * همان منطق /api/cron/publish-scheduled اما با احراز هویتِ سوپرادمین
 * (توکن پلتفرم) به‌جای CRON_SECRET — قبلاً پالت فرمان کرونِ بی‌احراز را
 * صدا می‌زد که در production با CRON_SECRET فعال، همیشه 401 می‌گرفت.
 *
 * query:
 *   ?autoschedule=1 — ابتدا به پیشنویس‌های بدون نوبت، نوبت می‌دهد
 *   ?dryRun=1      — فقط گزارش می‌دهد؛ چیزی منتشر/نوبت‌دهی نمی‌کند
 */
async function handle(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dryRun") === "1";

    // ─── حالت dry-run: فقط وضعیت صف — هیچ تغییری اعمال نمی‌شود ───
    if (dryRun) {
      const now = new Date();
      const [dueNow, scheduled, draftsNoSlot] = await Promise.all([
        db.blogPost.count({
          where: { status: "DRAFT", scheduledPublishAt: { lte: now } },
        }),
        db.blogPost.count({
          where: { status: "DRAFT", scheduledPublishAt: { not: null } },
        }),
        db.blogPost.count({
          where: { status: "DRAFT", scheduledPublishAt: null },
        }),
      ]);
      return NextResponse.json({
        success: true,
        dryRun: true,
        dueNow,
        scheduled,
        draftsNoSlot,
        message: dueNow > 0
          ? `${toPersian(dueNow)} پیشنویس سررسیده در صف انتشار است — با اجرای اصلی منتشر می‌شود`
          : "هیچ پیشنویس سررسیده‌ای در صف انتشار نیست — اجرای اصلی هیچ چیزی منتشر نمی‌کند",
        at: new Date().toISOString(),
      });
    }

    // نوبت‌دهی خودکار (اختیاری)
    let autoScheduleInfo: { scheduled: number; intervalDays: number } | null = null;
    if (searchParams.get("autoschedule") === "1") {
      autoScheduleInfo = await autoScheduleDrafts();
    }

    const result = await publishDueScheduledPosts();

    // پینگ sitemap برای پست‌های تازه (اختیاری — شکستش انتشار را نمی‌شکند)
    let sitemapPing: { pinged: string[]; failed: string[]; skipped: string[] } | null = null;
    if (result.published > 0) {
      try {
        sitemapPing = await pingSitemapEngines(result.published, req.url);
      } catch {
        /* پینگ اختیاری است */
      }
    }

    // پینگ IndexNow برای هر URL تازه‌منتشرشده (اختیاری)
    let indexNow: { ok?: number; failed?: number } | null = null;
    if (result.publishedSlugs && result.publishedSlugs.length > 0) {
      try {
        const base = await getIndexNowBaseUrl(req.url);
        const urls = result.publishedSlugs.map((slug) => blogUrlFromSlug(base, slug));
        indexNow = await pingIndexNowUrls(urls);
      } catch {
        /* پینگ اختیاری است — انتشار موفق مانده */
      }
    }

    return NextResponse.json({
      success: true,
      published: result.published,
      publishedSlugs: result.publishedSlugs,
      nextSlot: result.nextSlot,
      paused: result.paused,
      autoSchedule: autoScheduleInfo,
      sitemapPing,
      indexNow,
      message:
        result.published > 0
          ? `${toPersian(result.published)} مقاله منتشر شد`
          : "مقالهٔ سررسیده‌ای در صف نبود — نوبت بعدی سر زمانش منتشر می‌شود",
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Platform publish-scheduled error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای زمان‌بند انتشار" },
      { status: 500 }
    );
  }
}

function toPersian(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export const GET = handle;
export const POST = handle;
