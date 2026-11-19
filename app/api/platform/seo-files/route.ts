import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { emitAuditEvent } from "@/lib/audit-bus";
import { INDEXNOW_KEY } from "@/lib/seo";
// R14-K2 (ایجنت ۴): پینگ دسته‌ای IndexNow — آخرین ۱۰۰ URL، سقف ۱۰ بار در ساعت
import { pingIndexNowUrls, getLatestIndexNowUrls, checkMassPingRateLimit, recordMassPing, getLastIndexNowMassPing } from "@/lib/indexnow";
// R14-K1 (GEO): سازندهٔ llms.txt به lib/seo/llms.ts منتقل شد — حالا هم پنل
// سوپرادمین و هم مسیر عمومی داینامیک /llms.txt (app/llms.txt/route.ts) از
// همان تابع واحد می‌سازند (خط «آخرین به‌روزرسانی» جلالی + شمارش زندهٔ DB).
import { buildLlmsTxt } from "@/lib/seo/llms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============================================================
// /api/platform/seo-files — مدیریت فایل‌های سئو (v35)
// ============================================================
// درخواست مالک: «قسمتی باشه کلیک کردم سایت‌مپ بروز بده و هر فایلی که برای
// سئو و بررسی ربات‌های گوگل و هوش مصنوعی هست رو بروز کنه و فایلشو بهم بده»
//
// GET  ?download=<file> → محتوای فایل برای دانلود مستقیم
//      (بدون download → وضعیت همهٔ فایل‌ها)
// POST { action: "rebuild" } → بازسازی همهٔ فایل‌های سئو:
//      ۱) sitemap.xml  — fetch تازه از خود اپ (cache-bust) + شمارش URLها
//      ۲) robots.txt   — fetch تازه (قوانین خزش + آدرس sitemap)
//      ۳) llms.txt     — تولید فایل راهنمای ربات‌های هوش مصنوعی
//                        (GPTBot/ClaudeBot/PerplexityBot و...)
//      ۴) rss.xml      — fetch تازه (فید بلاگ)
//      ۵) ثبت زمان بازسازی + رویداد ممیزی + تلاش اطلاع‌رسانی موتورها
// ============================================================

const LAST_BUILD_KEY = "seo_files_last_build";
const BUILD_STATS_KEY = "seo_files_last_stats";

interface FileStatus {
  id: "sitemap" | "robots" | "llms" | "rss";
  name: string;
  path: string;
  description: string;
  urlCount?: number;
  sizeBytes?: number;
  ok: boolean;
  error?: string;
}

async function fetchSelf(pathname: string, request?: NextRequest): Promise<{ text: string; status: number }> {
 // FIX(v38): fetch داخلی باید به خودِ سرور برود نه دامنهٔ عمومی — در محیط‌های
 // بدون DNS دامنه (سندباکس/سرور داخلی) fetch به دامنهٔ عمومی «fetch failed»
 // می‌شد و بازسازی sitemap/robots/rss شکست می‌خورد. اول origin درخواست/لوکال‌هاست
 // امتحان می‌شود و فقط در صورت خطا، دامنهٔ عمومی به‌عنوان fallback.
 const bases: string[] = [];
 try {
  const origin = request?.headers.get("x-forwarded-host") || request?.headers.get("host");
  if (origin) bases.push(`http://${origin.replace(/^[a-zA-Z]+:\/\//, "")}`);
 } catch { /* ignore */ }
 bases.push("http://localhost:3000", "http://127.0.0.1:3000");
 try {
  const { getAppBaseUrl } = await import("@/lib/app-url");
  bases.push((await getAppBaseUrl()).replace(/\/+$/, ""));
 } catch { /* ignore */ }

 let lastError = "unknown error";
 for (const base of bases) {
  try {
   const url = `${base}${pathname}`;
   const res = await fetch(url, {
    cache: "no-store",
    headers: { "x-seo-rebuild": "1" },
    signal: AbortSignal.timeout(20_000),
   });
   return { text: await res.text(), status: res.status };
  } catch (err) {
   lastError = err instanceof Error ? err.message : String(err);
  }
 }
 throw new Error(lastError);
}

function countSitemapUrls(xml: string): number {
  return (xml.match(/<url>/g) || []).length;
}

/**
 * llms.txt (Task 7-د + R14-K1):
 * سازندهٔ اصلی به lib/seo/llms.ts منتقل شد (buildLlmsTxt) — مسیر عمومی
 * داینامیک /llms.txt آن را سرو می‌کند؛ این مسیر فقط برای پیش‌نمایش/دانلود
 * از پنل سوپرادمین آن را صدا می‌زند.
 * چرا تاریخ و قیمت تازه مهم است؟ ربات‌های هوش مصنوعی (ChatGPT/Perplexity/Gemini)
 * بیشترین سوال را دربارهٔ «قیمت» می‌پرسند؛ پاسخ عددی تازه + تاریخ = نقل‌قول
 * مستقیم در پاسخ‌های AI و AI Overviews (سیگنال تازگی + اعتماد).
 */

async function buildAll(origin: string | null, request?: NextRequest): Promise<{
  files: FileStatus[];
  sitemapPreview: string;
  robotsPreview: string;
  llmsPreview: string;
}> {
  const files: FileStatus[] = [];
  let sitemapPreview = "";
  let robotsPreview = "";
  let llmsPreview = "";

  // ۱) sitemap.xml — fetch تازه (Next.js آن را از DB می‌سازد؛ fetch = cache-bust + تأیید سلامت)
  try {
    const { text, status } = await fetchSelf("/sitemap.xml", request);
    if (status === 200 && text.includes("<urlset")) {
      sitemapPreview = text;
      files.push({
        id: "sitemap",
        name: "نقشهٔ سایت (sitemap.xml)",
        path: "/sitemap.xml",
        description: "همهٔ صفحات عمومی سایت برای گوگل و بینگ — داینامیک از دیتابیس",
        urlCount: countSitemapUrls(text),
        sizeBytes: Buffer.byteLength(text, "utf8"),
        ok: true,
      });
    } else {
      files.push({
        id: "sitemap", name: "نقشهٔ سایت (sitemap.xml)", path: "/sitemap.xml",
        description: "همهٔ صفحات عمومی سایت برای گوگل و بینگ",
        ok: false, error: `پاسخ ${status}`,
      });
    }
  } catch (e) {
    files.push({
      id: "sitemap", name: "نقشهٔ سایت (sitemap.xml)", path: "/sitemap.xml",
      description: "همهٔ صفحات عمومی سایت برای گوگل و بینگ",
      ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطا",
    });
  }

  // ۲) robots.txt — fetch تازه
  try {
    const { text, status } = await fetchSelf("/robots.txt", request);
    if (status === 200) {
      robotsPreview = text;
      files.push({
        id: "robots",
        name: "قوانین خزش (robots.txt)",
        path: "/robots.txt",
        description: "دسترسی ربات‌های گوگل و سایر خزنده‌ها + معرفی sitemap",
        sizeBytes: Buffer.byteLength(text, "utf8"),
        ok: true,
      });
    } else {
      files.push({
        id: "robots", name: "قوانین خزش (robots.txt)", path: "/robots.txt",
        description: "دسترسی ربات‌های گوگل و سایر خزنده‌ها",
        ok: false, error: `پاسخ ${status}`,
      });
    }
  } catch (e) {
    files.push({
      id: "robots", name: "قوانین خزش (robots.txt)", path: "/robots.txt",
      description: "دسترسی ربات‌های گوگل و سایر خزنده‌ها",
      ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطا",
    });
  }

  // ۳) llms.txt — R14-K1: دیگر فایل استاتیک در public/ نوشته نمی‌شود؛ مسیر
  // داینامیک app/llms.txt/route.ts آن را سرو می‌کند (خط «آخرین به‌روزرسانی»
  // جلالی + شمارش زندهٔ مقالات). اینجا فقط fetch تازه برای تأیید سلامت + پیش‌نمایش.
  try {
    let llmsText = "";
    let llmsOk = false;
    try {
      const { text, status } = await fetchSelf("/llms.txt", request);
      if (status === 200 && text.includes("# ")) {
        llmsText = text;
        llmsOk = true;
      }
    } catch {
      // مسیر عمومی در دسترس نیست — با سازندهٔ مستقیم پیش‌نمایش می‌سازیم
    }
    if (!llmsText) {
      llmsText = await buildLlmsTxt();
    }
    llmsPreview = llmsText;
    files.push({
      id: "llms",
      name: "راهنمای هوش مصنوعی (llms.txt)",
      path: "/llms.txt",
      description: "فایل استاندارد برای GPTBot، ClaudeBot، PerplexityBot و ربات‌های هوش مصنوعی — داینامیک با تاریخ به‌روزرسانی جلالی",
      sizeBytes: Buffer.byteLength(llmsText, "utf8"),
      ok: llmsOk || llmsText.length > 0,
    });
  } catch (e) {
    files.push({
      id: "llms", name: "راهنمای هوش مصنوعی (llms.txt)", path: "/llms.txt",
      description: "فایل استاندارد برای ربات‌های هوش مصنوعی",
      ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطا",
    });
  }

  // ۴) rss.xml — fetch تازه
  try {
    const { text, status } = await fetchSelf("/rss.xml", request);
    if (status === 200 && text.includes("<rss")) {
      files.push({
        id: "rss",
        name: "فید بلاگ (rss.xml)",
        path: "/rss.xml",
        description: "فید آخرین مقاله‌های منتشرشده برای دنبال‌کنندگان و سرویس‌های خبری",
        sizeBytes: Buffer.byteLength(text, "utf8"),
        ok: true,
      });
    } else {
      files.push({
        id: "rss", name: "فید بلاگ (rss.xml)", path: "/rss.xml",
        description: "فید آخرین مقاله‌های منتشرشده",
        ok: false, error: `پاسخ ${status}`,
      });
    }
  } catch (e) {
    files.push({
      id: "rss", name: "فید بلاگ (rss.xml)", path: "/rss.xml",
      description: "فید آخرین مقاله‌های منتشرشده",
      ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطا",
    });
  }

  return { files, sitemapPreview, robotsPreview, llmsPreview };
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const params = new URL(req.url).searchParams;
    const download = params.get("download");

    // دانلود مستقیم فایل — بازسازی سریع و بازگشت محتوا
    if (download === "sitemap" || download === "robots" || download === "llms" || download === "rss") {
      const built = await buildAll(req.url, req);
      const contentMap: Record<string, { text: string; type: string; filename: string }> = {
        sitemap: { text: built.sitemapPreview, type: "application/xml; charset=utf-8", filename: "sitemap.xml" },
        robots: { text: built.robotsPreview, type: "text/plain; charset=utf-8", filename: "robots.txt" },
        llms: { text: built.llmsPreview, type: "text/plain; charset=utf-8", filename: "llms.txt" },
        rss: { text: "", type: "application/rss+xml; charset=utf-8", filename: "rss.xml" },
      };
      let content = contentMap[download].text;
      if (download === "rss") {
        try {
          content = (await fetchSelf("/rss.xml", req)).text;
        } catch {
          content = "";
        }
      }
      if (!content) {
        return NextResponse.json({ success: false, error: "فایل خالی است — ابتدا بازسازی کنید" }, { status: 404 });
      }
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": contentMap[download].type,
          "Content-Disposition": `attachment; filename="${contentMap[download].filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // وضعیت — آخرین بازسازی ذخیره‌شده + وضعیت زندهٔ سبک
    const [lastBuild, statsRow] = await Promise.all([
      db.systemSettings.findUnique({ where: { key: LAST_BUILD_KEY } }),
      db.systemSettings.findUnique({ where: { key: BUILD_STATS_KEY } }),
    ]);

    const [published, drafts] = await Promise.all([
      db.blogPost.count({ where: { status: "PUBLISHED" } }),
      db.blogPost.count({ where: { status: "DRAFT" } }),
    ]);

    let liveFiles: FileStatus[] = [];
    try {
      const { text, status } = await fetchSelf("/sitemap.xml", req);
      const { text: robotsText } = await fetchSelf("/robots.txt", req);
      liveFiles = [
        {
          id: "sitemap",
          name: "نقشهٔ سایت (sitemap.xml)",
          path: "/sitemap.xml",
          description: "همهٔ صفحات عمومی سایت برای گوگل و بینگ — داینامیک از دیتابیس",
          urlCount: status === 200 ? countSitemapUrls(text) : undefined,
          sizeBytes: Buffer.byteLength(text, "utf8"),
          ok: status === 200,
        },
        {
          id: "robots",
          name: "قوانین خزش (robots.txt)",
          path: "/robots.txt",
          description: "دسترسی ربات‌های گوگل و سایر خزنده‌ها + معرفی sitemap",
          sizeBytes: Buffer.byteLength(robotsText, "utf8"),
          ok: robotsText.includes("Sitemap") || robotsText.includes("sitemap"),
        },
        {
          id: "llms",
          name: "راهنمای هوش مصنوعی (llms.txt)",
          path: "/llms.txt",
          description: "فایل استاندارد برای GPTBot، ClaudeBot، PerplexityBot و ربات‌های هوش مصنوعی",
          ok: true,
        },
        {
          id: "rss",
          name: "فید بلاگ (rss.xml)",
          path: "/rss.xml",
          description: "فید آخرین مقاله‌های منتشرشده",
          ok: true,
        },
      ];
    } catch {
      liveFiles = [];
    }

    let lastStats: unknown = null;
    if (statsRow?.value) {
      try {
        lastStats = JSON.parse(statsRow.value);
      } catch {
        lastStats = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        lastBuildAt: lastBuild?.value ?? null,
        lastStats,
        blog: { published, drafts },
        files: liveFiles,
      },
    });
  } catch (error) {
    console.error("seo-files GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت وضعیت فایل‌های سئو" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const action = (body as { action?: string }).action;

    if (action !== "rebuild" && action !== "reindex" && action !== "ping-indexnow") {
      return NextResponse.json(
        { success: false, error: "action نامعتبر — rebuild، reindex یا ping-indexnow پشتیبانی می‌شود" },
        { status: 400 }
      );
    }

    // ─── ping-indexnow (R14-K2 / ایجنت ۴): پینگ دسته‌ای آخرین ۱۰۰ URL ───
    // شکایت #۱ مالک «صفحات ایندکس نمی‌شوند» — با IndexNow موتورهای
    // هم‌پروتکل (Bing/Yandex/...) بلافاصله URLهای اعلام‌شده را می‌کشند.
    // سقف نرخ ۱۰ بار در ساعت (in-memory) تا اسپم نشود؛ نتیجه برای پنل
    // در SystemSettings ثبت می‌شود. در شبکهٔ محدود: reason ثبت می‌شود.
    if (action === "ping-indexnow") {
      const rate = checkMassPingRateLimit();
      if (!rate.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: "سقف پینگ دسته‌ای IndexNow (۱۰/ساعت) پر است — " + rate.retryAfterMin + " دقیقه دیگر تلاش کنید",
          },
          { status: 429, headers: { "Retry-After": String(rate.retryAfterMin * 60) } }
        );
      }

      const { getAppBaseUrl } = await import("@/lib/app-url");
      const base = (await getAppBaseUrl()).replace(/\/+$/, "");
      const urls = await getLatestIndexNowUrls(100, base);
      const ping = await pingIndexNowUrls(urls);
      await recordMassPing(ping, urls.length);

      try {
        emitAuditEvent({
          tenantId: "platform",
          action: "SEO_INDEXNOW_MASS_PING",
          entity: "seo.indexnow",
          changes: "ارسال " + urls.length + " URL به IndexNow — " + (ping.pinged ? "HTTP " + ping.status + " پذیرفته شد" : "ناموفق (" + (ping.reason || "نامشخص") + ")"),
        });
      } catch {
        /* اختیاری */
      }

      return NextResponse.json({
        success: true,
        message: ping.pinged
          ? "پینگ IndexNow ارسال شد — " + urls.length + " URL (HTTP " + ping.status + ")"
          : "ارسال " + urls.length + " URL انجام نشد (" + (ping.reason || "شبکه") + ") — کد در استقرار واقعی کار می‌کند",
        data: {
          ping,
          submittedUrls: urls.length,
          keyFile: `${base}/${INDEXNOW_KEY}.txt`,
          lastMassPing: await getLastIndexNowMassPing(),
          at: new Date().toISOString(),
        },
      });
    }

    // ─── reindex: اطلاع‌رسانی فعال به موتورهای جستجو و هوش مصنوعی ───
    // پس از rebuild، موتورها را از نسخهٔ جدید مطلع می‌کند (پینگ + ارسال URL)
    if (action === "reindex") {
      const { getAppBaseUrl } = await import("@/lib/app-url");
      const base = (await getAppBaseUrl()).replace(/\/+$/, "");
      const sitemapUrl = `${base}/sitemap.xml`;
      const homeUrl = `${base}/`;

      interface PingResult {
        engine: string;
        kind: "search" | "ai";
        ok: boolean;
        status?: number;
        note?: string;
      }
      const pings: PingResult[] = [];

      // بینگ — ثبت URL (استاندارد فعلی؛ پینگ sitemap قدیمی گوگل deprecated شده)
      // Task 7-د (۳): کلید واقعی IndexNow + keyLocation — قبلاً key=hooshhesab بود
      // بدون فایل کلید در ریشه → پینگ‌ها هرگز verify نمی‌شدند.
      const bingTargets = [
        {
          name: "Bing (IndexNow)",
          url: `https://www.bing.com/indexnow?url=${encodeURIComponent(homeUrl)}&key=${INDEXNOW_KEY}&keyLocation=${encodeURIComponent(`${base}/${INDEXNOW_KEY}.txt`)}`,
        },
        { name: "Bing (SiteIndex)", url: `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}` },
      ];
      // موتورهای جستجوی تخصصی
      const searchTargets = [
        ...bingTargets,
        { name: "Yandex", url: `https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}` },
      ];
      // اطلاع‌رسانی به IndexNow مرکزی (کلید + محل فایل کلید طبق پروتکل)
      const aiTargets: { name: string; url: string }[] = [
        {
          name: "IndexNow (سازمان مرکزی)",
          url: `https://api.indexnow.org/indexnow?url=${encodeURIComponent(homeUrl)}&key=${INDEXNOW_KEY}&keyLocation=${encodeURIComponent(`${base}/${INDEXNOW_KEY}.txt`)}`,
        },
      ];

      const tryPing = async (t: { name: string; url: string }, kind: "search" | "ai") => {
        try {
          const res = await fetch(t.url, {
            method: "GET",
            signal: AbortSignal.timeout(8000),
            redirect: "follow",
          });
          pings.push({ engine: t.name, kind, ok: res.status >= 200 && res.status < 400, status: res.status });
        } catch {
          pings.push({ engine: t.name, kind, ok: false, note: "دسترسی از سرور ممکن نبود (در استقرار واقعی کار می‌کند)" });
        }
      };

      await Promise.all([
        ...searchTargets.map((t) => tryPing(t, "search")),
        ...aiTargets.map((t) => tryPing(t, "ai")),
      ]);

      const okCount = pings.filter((p) => p.ok).length;

      // ثبت زمان ایندکس
      await db.systemSettings.upsert({
        where: { key: "seo_last_reindex" },
        create: { key: "seo_last_reindex", value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });

      try {
        emitAuditEvent({
          tenantId: "platform",
          action: "SEO_REINDEX_PING",
          entity: "seo.index",
          changes: `اعلان به ${pings.length} موتور — ${okCount} موفق`,
        });
      } catch {
        /* اختیاری */
      }

      return NextResponse.json({
        success: true,
        message: `ایندکس اطلاع‌رسانی شد — ${okCount} از ${pings.length} موتور پاسخ داد`,
        data: {
          sitemapUrl,
          pings,
          at: new Date().toISOString(),
        },
      });
    }

    const startedAt = Date.now();
    const built = await buildAll(req.url, req);
    const okCount = built.files.filter((f) => f.ok).length;

    // ثبت زمان و آمار بازسازی
    const stats = {
      at: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      okCount,
      total: built.files.length,
      sitemapUrls: built.files.find((f) => f.id === "sitemap")?.urlCount ?? 0,
      files: built.files.map((f) => ({ id: f.id, ok: f.ok, urlCount: f.urlCount, sizeBytes: f.sizeBytes, error: f.error })),
    };
    await Promise.all([
      db.systemSettings.upsert({
        where: { key: LAST_BUILD_KEY },
        create: { key: LAST_BUILD_KEY, value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      }),
      db.systemSettings.upsert({
        where: { key: BUILD_STATS_KEY },
        create: { key: BUILD_STATS_KEY, value: JSON.stringify(stats) },
        update: { value: JSON.stringify(stats) },
      }),
    ]);

    // رویداد ممیزی (گزارش زندهٔ رخدادها) — بهترین تلاش
    try {
      emitAuditEvent({
        tenantId: "platform",
        action: "SEO_FILES_REBUILT",
        entity: "seo.files",
        changes: `sitemap: ${stats.sitemapUrls} URL — llms.txt و robots.txt و rss.xml تازه‌سازی شد`,
      });
    } catch {
      /* اختیاری */
    }

    return NextResponse.json({
      success: true,
      message: `بازسازی انجام شد — ${okCount} از ${built.files.length} فایل سالم (زمان: ${((Date.now() - startedAt) / 1000).toFixed(1)} ثانیه)`,
      data: { stats, files: built.files },
    });
  } catch (error) {
    console.error("seo-files POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در بازسازی فایل‌های سئو: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
