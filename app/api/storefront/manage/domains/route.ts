import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { validateStorefrontSlug, RESERVED_STOREFRONT_SLUGS } from "@/lib/storefront";
import { suggestStoreSlugCandidates, suggestDomainCandidates, STOREFRONT_BASE_DOMAIN } from "@/lib/storefront-wizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** اسلاگ‌های رزروشدهٔ پلتفرم — ساب‌دامنهٔ هم‌نامشان قابل تخصیص نیست */
const RESERVED_HINT = RESERVED_STOREFRONT_SLUGS;

/**
 * GET /api/storefront/manage/domains?name=...&type=...
 * پیشنهاد اسلاگ/دامنهٔ کوتاه + بررسی «آزاد بودن»:
 *  - اسلاگ پلتفرم (slug): بررسی DB (رزرو نشده توسط فروشگاه دیگر)
 *  - دامنهٔ سفارشی (مثل my-shop.ir): بررسی DNS — اگر رکورد A/NS نداشت «احتمالاً آزاد»
 *    (بررسی نهایی ثبت دامنه همیشه از طریق ثبت‌کننده رسمی است — این فقط غربال اولیه)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const name = String(req.nextUrl.searchParams.get("name") ?? "").trim();
    const type = String(req.nextUrl.searchParams.get("type") ?? "general").trim();
    if (name.length < 2) {
      return NextResponse.json({ success: false, error: "نام کسب‌وکار را وارد کنید" }, { status: 400 });
    }

    const slugCandidates = suggestStoreSlugCandidates(name, type);
    const domainCandidates = suggestDomainCandidates(name, type);

    // بررسی آزاد بودن اسلاگ‌ها در پلتفرم
    const taken = new Set(
      (
        await db.storefront.findMany({
          where: { slug: { in: slugCandidates }, tenantId: { not: tenantId } },
          select: { slug: true },
        })
      ).map((s) => s.slug)
    );

    // بررسی دامنه‌های پیشنهادی:
    //  • ساب‌دامنهٔ رایگان پلتفرم (*.ofoghplus.ir): wildcard DNS دارد، پس DNS همیشه
    //    «رکورد دارد» نشان می‌داد و همهٔ پیشنهادها به‌اشتباه «ثبت‌شده» دیده می‌شدند.
    //    در دسترس بودنِ واقعی = آزاد بودن «اسلاگ» روی پلتفرم (بررسی DB).
    //  • دامنهٔ سفارشی واقعی: غربال اولیهٔ DNS (A/NS) — ثبت نهایی همیشه از
    //    طریق ثبت‌کنندهٔ رسمی است.
    const dnsResults = await Promise.all(
      domainCandidates.slice(0, 6).map(async (d) => {
        const hostname = d.replace(/^https?:\/\//, "").split("/")[0];
        const subdomain = hostname.endsWith(`.${STOREFRONT_BASE_DOMAIN}`)
          ? hostname.slice(0, -(STOREFRONT_BASE_DOMAIN.length + 1))
          : null;
        if (subdomain !== null) {
          const slugFree = !taken.has(subdomain) && !RESERVED_HINT.has(subdomain);
          return {
            domain: hostname,
            available: slugFree,
            note: slugFree
              ? "آزاد است — با انتخاب این نام، فروشگاه شما روی همین آدرس بالا می‌آید"
              : "این نام روی پلتفرم گرفته شده است — گزینهٔ دیگری انتخاب کنید",
          };
        }
        let available: boolean | null = null; // null = نامشخص (خطای شبکه)
        let note = "";
        try {
          const anyRecord = await dns.resolve(hostname, "A").catch(() => null);
          const nsRecord = await dns.resolveNs(hostname).catch(() => null);
          if (anyRecord || nsRecord) {
            available = false;
            note = "این دامنه رکورد دارد — به نام شخص دیگری ثبت شده است";
          } else {
            available = true;
            note = "احتمالاً آزاد است — ثبت نهایی از طریق ثبت‌کنندهٔ رسمی";
          }
        } catch {
          available = null;
          note = "بررسی ممکن نشد — با ثبت‌کنندهٔ رسمی چک کنید";
        }
        return { domain: hostname, available, note };
      })
    );

    return NextResponse.json({
      success: true,
      slugCandidates: slugCandidates.map((s) => ({ slug: s, available: !taken.has(s) })),
      domainCandidates: dnsResults,
      baseDomain: STOREFRONT_BASE_DOMAIN,
      customDomainHint: "اگر دامنهٔ خودتان را دارید، در تنظیمات «دامنهٔ اختصاصی» وارد کنید تا پس از تأیید مالکیت (رکورد DNS) به فروشگاه شما وصل شود.",
    });
  } catch (error) {
    console.error("[storefront domains GET] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در بررسی دامنه‌ها" }, { status: 500 });
  }
}

/** PUT — ذخیرهٔ اسلاگ انتخابی یا دامنهٔ اختصاصی */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const storefront = await db.storefront.findUnique({ where: { tenantId }, select: { id: true, slug: true } });
    if (!storefront) {
      return NextResponse.json({ success: false, error: "ابتدا فروشگاه را با ویزارد بسازید" }, { status: 404 });
    }

    if (b.slug !== undefined) {
      const v = validateStorefrontSlug(String(b.slug));
      if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
      const taken = await db.storefront.findFirst({
        where: { slug: v.slug, tenantId: { not: tenantId } },
        select: { id: true },
      });
      if (taken) return NextResponse.json({ success: false, error: "این نام قبلاً گرفته شده است" }, { status: 409 });
      await db.storefront.update({ where: { id: storefront.id }, data: { slug: v.slug } });
    }

    if (b.customDomain !== undefined) {
      const raw = String(b.customDomain ?? "").trim().toLowerCase()
        .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      if (raw && !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(raw)) {
        return NextResponse.json({ success: false, error: "قالب دامنه معتبر نیست (مثال: my-shop.ir)" }, { status: 400 });
      }
      await db.storefront.update({ where: { id: storefront.id }, data: { customDomain: raw || null } });
    }

    return NextResponse.json({ success: true, message: "ذخیره شد" });
  } catch (error) {
    console.error("[storefront domains PUT] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "خطا در ذخیرهٔ دامنه" }, { status: 500 });
  }
}
