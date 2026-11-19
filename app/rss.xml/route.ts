import { db } from "@/lib/db";
import { getBrandName } from "@/lib/brand-interpolate";
import { getSiteUrl } from "@/lib/seo";

export const runtime = "nodejs";

// GET /rss.xml — تولید RSS Feed
// FIX(3-a باگ #۸): کوئری فقط فیلدهای لازم را می‌کشد؛ content از R14-K2 دوباره
// انتخاب می‌شود چون فید «محتوای کامل» دارد (GEO — خوانندگان فید و ربات‌های
// هوش مصنوعی متن کامل را نقل‌قول می‌کنند، نه خلاصه را). سقف ۲۰ آیتم +
// کش ۱ ساعته → هزینهٔ قابل‌قبول (میانگین مقاله ~۲۳KB؛ فید ≈ ۴۵۰KB).
// R14-K2 (ایجنت ۴):
//  - <content:encoded> با CDATA برای متن کامل مقاله (استاندارد RSS 2.0 module)
//  - description = خلاصه (excerpt) — همان رفتار قبلی برای خوانندگان فید
//  - pubDate از publishedAt واقعی + لینک‌های مطلق روی دامنهٔ برند (ofoghplus.ir)

/** ایمنی CDATA: «]]>» در محتوا باید شکسته شود — الگوی استاندارد جایگزینی */
function cdataSafe(text: string): string {
 return text.replace(/]]>/g, "]]]]><![CDATA[>");
}

export async function GET() {
 try {
 const posts = await db.blogPost.findMany({
 where: { status: "PUBLISHED" },
 orderBy: { publishedAt: "desc" },
 take: 20,
 select: {
 slug: true,
 title: true,
 excerpt: true,
 content: true,
 publishedAt: true,
 category: true,
 },
 });

 // Task 7-ج: دامنه از تنظیمات برندینگ سوپرادمین (وایت‌لیبل) — نه هاردکد
 const baseUrl = await getSiteUrl();

 // FIX(SEO-3c باگ ۱۲): <category> قبلاً کد خام دیتابیس (ACCOUNTING/TAX/...)
 // بود که برای خوانندهٔ فارسی فید بی‌معنا است. حالا برچسب فارسیِ همان
 // دسته‌بندیِ بلاگ درج می‌شود (با fallback روی کد قبلی).
 const CATEGORY_LABELS: Record<string, string> = {
 ACCOUNTING: "حسابداری",
 TAX: "مالیات",
 PAYROLL: "حقوق و دستمزد",
 TUTORIAL: "آموزش",
 EDUCATION: "آموزش",
 NEWS: "اخبار",
 MODIAN: "سامانه مودیان",
 };

 // FIX(SEO-3c باگ ۱۲): lastBuildDate کانال — سیگنال تازگی فید برای
 // خوانندگان/ربات‌ها (استاندارد RSS 2.0). جدیدترین pubDate آیتم‌ها.
 const lastBuildDate = posts[0]?.publishedAt?.toUTCString() || new Date().toUTCString();

 const items = posts
 .map((post) => {
 const link = `${baseUrl}/blog/${post.slug}`;
 // محتوای کامل — GEO: فید کامل = نقل‌قول مستقیم در خوانندگان/AI؛
 // اگر مقاله content نداشت (دادهٔ قدیمی) به خلاصه برمی‌گردیم.
 const full = post.content?.trim()
 ? cdataSafe(post.content)
 : cdataSafe(post.excerpt || "");
 const catLabel = CATEGORY_LABELS[post.category] || post.category;
 return ` <item>
 <title><![CDATA[${post.title}]]></title>
 <link>${link}</link>
 <guid isPermaLink="true">${link}</guid>
 <description><![CDATA[${post.excerpt || ""}]]></description>
 <content:encoded><![CDATA[${full}]]></content:encoded>
 <category>${catLabel}</category>
 <pubDate>${post.publishedAt?.toUTCString() || new Date().toUTCString()}</pubDate>
 </item>`;
 })
 .join("\n");

 const brand = await getBrandName();
 const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
 <channel>
 <title>بلاگ ${brand} — نرم‌افزار حسابداری هوشمند</title>
 <link>${baseUrl}/blog</link>
 <description>آموزش حسابداری، مالیات، حقوق و دستمزد و نکات کسب‌وکار</description>
 <language>fa-IR</language>
 <lastBuildDate>${lastBuildDate}</lastBuildDate>
 <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
${items}
 </channel>
</rss>`;

 return new Response(xml, {
 headers: {
 "Content-Type": "application/rss+xml; charset=utf-8",
 "Cache-Control": "public, max-age=3600",
 },
 });
 } catch (error) {
 console.error("RSS error:", error);
 return new Response("Error generating RSS feed", { status: 500 });
 }
}
