import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  getSiteUrl,
  type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { downloadsArticleHtml, downloadsFaqs } from "@/lib/hub-content/downloads";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { ReportDownloadButton } from "@/components/seo/report-download-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Building2, ChevronLeft, CloudCog, FileDown, FileText, MonitorDown, ShieldCheck, Sparkles, Store, Usb } from "lucide-react";

// ============================================================
// /downloads — گزارش‌های رایگان (لیدمگنت نرم)
// ============================================================
// ۳ گزارش مرجع → PDF قابل‌چاپ (بدون فرم/ایمیل — Save as PDF)
// سیگنال: برند + بازدید برگشتی + ارجاع طبیعی + E-E-A-T

export const dynamic = "force-dynamic";

const PAGE_TITLE = "گزارش‌های رایگان حسابداری — دانلود PDF بدون ایمیل";
const PAGE_DESCRIPTION =
  "سه گزارش مرجع افق پلاس: سامانه مودیان، راه‌اندازی حسابداری فروشگاه از صفر و مقایسهٔ حسابداری ابری — PDF رایگان بدون فرم و ایمیل";

const REPORTS = [
  {
    slug: "moadian-system-complete-guide",
    title: "مرجع کامل سامانه مودیان",
    desc: "از ثبت‌نام تا رفع مغایرت: مهلت‌ها، الگوهای الف/ب/ج، عیب‌یابی ردشدن صورتحساب و پیشگیری از ماده ۱۶۹ — برای همهٔ مودیان مشمول.",
    icon: ShieldCheck,
    tag: "پرتابرین",
    pages: "۱۲ بخش مرجعی",
  },
  {
    slug: "store-accounting-from-zero",
    title: "حسابداری فروشگاه از صفر تا مودیان",
    desc: "نقشهٔ راه هفته‌به‌هفتهٔ مهاجرت از دفتر کاغذی به سیستم واقعی: کدینگ ساده، روتین روزانه، انبار و اولین ارسال مودیان.",
    icon: Store,
    tag: "شروع سریع",
    pages: "برنامهٔ ۴ هفته‌ای",
  },
  {
    slug: "cloud-accounting-software-what-is-1404",
    title: "حسابداری ابری چیست؟ راهنمای انتخاب",
    desc: "مقایسهٔ ساختاری ابری و دسکتاپ با جدول هزینهٔ واقعی پنج‌ساله (TCO)، ریسک‌های هر مسیر و سوالات پیش از خرید از هر فروشنده.",
    icon: CloudCog,
    tag: "تصمیم پنج‌ساله",
    pages: "جدول‌های مقایسه",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent("گزارش‌های رایگان " + brand)}&description=${encodeURIComponent("PDF بدون ایمیل — مودیان، فروشگاه، ابری")}&type=report`;
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    keywords: interpolateBrand(
      ["دانلود رایگان گزارش مالیاتی", "PDF سامانه مودیان", "راهنمای حسابداری فروشگاه", "مقایسه نرم افزار حسابداری pdf"],
      brand
    ),
    authors: [{ name: interpolateBrand("افق پلاس", brand), url: `${siteUrl}/authors` }],
    alternates: { canonical: `${siteUrl}/downloads` },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: `${siteUrl}/downloads`,
      siteName: interpolateBrand("افق پلاس", brand),
      images: [{ url: ogImage, width: 1200, height: 630, alt: PAGE_TITLE }],
      locale: "fa_IR",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
  };
}

export default async function DownloadsPage() {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "خانه", url: siteUrl },
    { name: "گزارش‌های رایگان", url: `${siteUrl}/downloads` },
  ]);
  const faqSchema = generateFaqSchema(downloadsFaqs as FaqItem[], `${siteUrl}/downloads`);

  // ItemList schema — سه گزارش دانلودی
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${siteUrl}/downloads#list`,
    name: PAGE_TITLE,
    itemListElement: REPORTS.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.title,
      url: `${siteUrl}/blog/${r.slug}`,
    })),
  };

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold">{interpolateBrand("افق پلاس", brand)}</span>
          </Link>
          <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
            پلن‌ها و قیمت
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">گزارش‌های رایگان</span>
          </nav>

          <div className="mb-10">
            <Badge variant="secondary" className="mb-4 text-xs">
              <FileDown className="h-3 w-3" /> بدون فرم · بدون ایمیل · بدون تعهد
            </Badge>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              گزارش‌های مرجع {interpolateBrand("افق پلاس", brand)} — دانلود PDF رایگان
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              سه گزارش مرجعِ حسابداری و مالیات ایران، آمادهٔ چاپ و جلسه. نسخهٔ زندهٔ هر گزارش در بلاگ
              {" "}{interpolateBrand("افق پلاس", brand)} همیشه به‌روز است؛ نسخهٔ PDF برای میز جلسه و مرور آفلاین.
            </p>
          </div>

          {/* ─── کارت سه گزارش ─── */}
          <section aria-labelledby="reports" className="mb-12">
            <h2 id="reports" className="mb-5 text-xl font-extrabold text-foreground sm:text-2xl">
              سه گزارش قابل‌دانلود
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {REPORTS.map((r) => {
                const Icon = r.icon;
                return (
                  <Card key={r.slug} className="flex flex-col transition-shadow hover:shadow-lg">
                    <CardContent className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex items-center justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </span>
                        <Badge variant="outline" className="text-[10px] text-primary">{r.tag}</Badge>
                      </div>
                      <h3 className="text-sm font-bold leading-snug text-foreground">{r.title}</h3>
                      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{r.desc}</p>
                      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <BookOpen className="h-3 w-3" /> {r.pages}
                      </p>
                      <ReportDownloadButton slug={r.slug} title={r.title} brandName={brand} className="w-full" />
                      <Link
                        href={`/blog/${r.slug}`}
                        prefetch={false}
                        className="text-center text-[11px] font-medium text-primary hover:underline"
                      >
                        نسخهٔ زندهٔ همین گزارش در بلاگ
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* ─── Task 1-f: نسخه‌های دسکتاپ آفلاین ─── */}
          <section aria-labelledby="desktop" className="mb-12 scroll-mt-20" id="desktop-apps">
            <h2 id="desktop" className="mb-3 text-xl font-extrabold text-foreground sm:text-2xl">
              نسخهٔ دسکتاپ آفلاین — ویندوز ۷ تا ۱۱
            </h2>
            <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              مثل هلو و محک: نصاب <strong className="text-foreground">Setup.exe</strong> استاندارد، کاملاً آفلاین، بدون هیچ پنجرهٔ CMD.
              دیتابیس و مقالات و درگاه مودیان — همه داخل خود برنامه.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: MonitorDown,
                  title: "نسخهٔ مدرن",
                  sub: "ویندوز ۱۰ و ۱۱",
                  file: "OfoghPlus-Setup.exe",
                  desc: "نصاب استاندارد NSIS — دابل‌کلیک، نصب، آیکن دسکتاپ. شامل tray و نصب خودکار پیش‌نیازها.",
                  tag: "پیشنهاد ما",
                },
                {
                  icon: ShieldCheck,
                  title: "نسخهٔ Legacy",
                  sub: "ویندوز ۷ SP1 و ۸/۸.۱",
                  file: "OfoghPlus-Legacy-Setup.exe",
                  desc: "بر پایهٔ Electron 22 — آخرین نسخهٔ سازگار با ویندوز ۷. VC++ 2019 خودکار همراه نصب می‌شود. (x64 و ۳۲بیتی)",
                  tag: "ویندوز قدیمی",
                },
                {
                  icon: Usb,
                  title: "نسخهٔ پرتابل",
                  sub: "ویندوز ۱۰/۱۱ — بدون نصب",
                  file: "OfoghPlus-Portable.zip",
                  desc: "یک پوشه، بدون نصب و بدون دسترسی مدیر — مناسب فلش و اسنپ‌شات سریع. دابل‌کلیک روی OfoghPlus.exe.",
                  tag: "بدون نصب",
                },
              ].map((d) => {
                const DIcon = d.icon;
                return (
                  <Card key={d.title} className="flex flex-col transition-shadow hover:shadow-lg">
                    <CardContent className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex items-center justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                          <DIcon className="h-5 w-5" />
                        </span>
                        <Badge variant="outline" className="text-[10px] text-emerald-700">{d.tag}</Badge>
                      </div>
                      <h3 className="text-sm font-bold text-foreground">{d.title}</h3>
                      <p className="text-[11px] font-medium text-muted-foreground">{d.sub} · <span dir="ltr" className="font-mono">{d.file}</span></p>
                      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{d.desc}</p>
                      <a
                        href="https://github.com/filenima/hooshhesab1/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                      >
                        <FileDown className="h-4 w-4" /> دریافت نسخهٔ دسکتاپ
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
              💡 اگر فایلی در Releases نبود، از تب <strong>Actions → build-desktop → Run workflow</strong> هر سه فایل خودکار ساخته می‌شوند
              (راهنمای کامل: <span dir="ltr" className="font-mono">desktop/README-fa.md</span>). ورود اول نصب تازه: <strong dir="ltr">admin / admin1234</strong>
            </p>
          </section>

          {/* ─── محتوای بلند ─── */}
          <HubArticle html={downloadsArticleHtml} faqs={downloadsFaqs} faqTitle="پرسش‌های متداول گزارش‌ها" />
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {interpolateBrand("هوش", brand)} — نرم‌افزار حسابداری ابری هوشمند
          </div>
          <p>© {new Date().getFullYear()} — تمامی حقوق محفوظ است.</p>
        </div>
      </footer>
    </div>
  );
}
