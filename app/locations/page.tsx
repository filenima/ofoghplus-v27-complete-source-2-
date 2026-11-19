import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  getSiteUrl,
  BUSINESS_PHONE,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_CITY,
} from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
// R24-7 (Agent 2): تنظیمات گوگل‌مپ سوپرادمین — لینک نقشه و iframe اختصاصی
import { getGoogleMapsReviewsSettings } from "@/lib/google-maps-reviews";
import { cities } from "@/lib/city-industry-data";
import { QuickAnswer } from "@/components/seo/quick-answer";
import { JsonLd } from "@/components/seo/structured-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  ChevronLeft,
  Sparkles,
  MapPin,
  Building2,
  Phone,
} from "lucide-react";

// ============================================================
// app/locations/page.tsx — محل استقرار و هاب شهرها (R24-7 / Agent 2)
// ------------------------------------------------------------
// صفحهٔ هاب Local SEO:
//  • NAP دفتر مرکزی + نقشهٔ گوگل (embed از تنظیمات سوپرادمین)
//  • لینک به همهٔ ۲۰ صفحهٔ شهر (/cities/{slug}) — بستن حلقهٔ لینک داخلی
//  • Service JSON-LD با areaServed = ایران + ارجاع به LocalBusiness سراسری
//  • BreadcrumbList + ItemList شهرها
// ============================================================

const PAGE_TITLE = "محل استقرار — نرم‌افزار حسابداری در شهرهای ایران";
const PAGE_DESCRIPTION =
  "دفتر مرکزی افق پلاس در شیراز است و کسب‌وکارهای ۲۰ شهر ایران (تهران، اصفهان، مشهد، تبریز و...) به‌صورت ابری پشتیبانی می‌شوند — بدون نیاز به نصب یا سرور محلی؛ مهاجرت و آموزش رایگان";

// مختصات دفتر — منبع واحد با generateLocalBusinessSchema (lib/seo.ts)
const HQ_LAT = 29.5918;
const HQ_LNG = 52.5837;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const url = `${siteUrl}/locations`;
  const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent(
    interpolateBrand("محل استقرار هوش — شیراز و ۲۰ شهر ایران", brand)
  )}&type=listing`;
  return {
    title: PAGE_TITLE,
    description: interpolateBrand(PAGE_DESCRIPTION, brand),
    keywords: [
      "محل استقرار افق پلاس",
      interpolateBrand("دفتر هوش", brand),
      "نرم‌افزار حسابداری شیراز",
      "پشتیبانی شهرستان",
      "حسابداری ابری ایران",
    ],
    alternates: { canonical: url },
    openGraph: {
      title: PAGE_TITLE,
      description: interpolateBrand(PAGE_DESCRIPTION, brand),
      url,
      type: "website",
      locale: "fa_IR",
      siteName: brand,
      images: [{ url: ogImage, width: 1200, height: 630, alt: PAGE_TITLE }],
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_TITLE,
      description: interpolateBrand(PAGE_DESCRIPTION, brand),
      images: [ogImage],
    },
    robots: { index: true, follow: true },
    // FIX(Task 6-c — Local SEO): سیگنال‌های جغرافیایی متا برای دفتر مرکزی —
    // geo.region / geo.placename / geo.position / ICBM هماهنگ با
    // GeoCoordinates در LocalBusiness سراسری (lib/seo.ts) و نقشهٔ embed
    other: {
      "geo.region": "IR",
      "geo.placename": "شیراز",
      "geo.position": `${HQ_LAT};${HQ_LNG}`,
      ICBM: `${HQ_LAT}, ${HQ_LNG}`,
    },
  };
}

export default async function LocationsPage() {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const url = `${siteUrl}/locations`;
  const gmaps = await getGoogleMapsReviewsSettings();
  const mapEmbedSrc =
    gmaps.embedUrl ||
    `https://maps.google.com/maps?q=${HQ_LAT},${HQ_LNG}&z=15&output=embed`;

  // ─── JSON-LD ───
  // Service با areaServed کامل — سیگنال Local برای پرس‌وجوهای شهرمحور؛
  // provider به همان LocalBusiness سراسری اشاره می‌کند (بدون @id تکراری)
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${url}#service`,
    name: interpolateBrand("نرم‌افزار حسابداری ابری هوش برای شهرهای ایران", brand),
    serviceType: "Accounting software",
    description: interpolateBrand(PAGE_DESCRIPTION, brand),
    provider: { "@id": `${siteUrl}/#localbusiness` },
    areaServed: [
      { "@type": "Country", name: "ایران" },
      ...cities.map((c) => ({
        "@type": "City",
        name: c.name,
        url: `${siteUrl}/cities/${c.slug}`,
      })),
    ],
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: siteUrl,
      servicePhone: BUSINESS_PHONE,
      availableLanguage: ["fa"],
    },
  };
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: interpolateBrand("شهرهای تحت پوشش هوش", brand),
    numberOfItems: cities.length,
    itemListElement: cities.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: `${siteUrl}/cities/${c.slug}`,
    })),
  };
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "خانه", url: siteUrl },
    { name: "محل استقرار", url },
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <JsonLd data={serviceSchema} />
      <JsonLd data={itemListSchema} />
      <JsonLd data={breadcrumbSchema} />

      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            prefetch={false}
          >
            <ArrowRight className="h-4 w-4" /> صفحه اصلی
          </Link>
          <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold">{brand}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">محل استقرار</span>
          </nav>

          <div className="mb-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="h-6 w-6" />
              </div>
              <Badge variant="secondary" className="text-xs">۲۰ شهر · پشتیبانی ابری</Badge>
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              {interpolateBrand("محل استقرار هوش — شیراز و شهرهای ایران", brand)}
            </h1>
            <QuickAnswer
              question={interpolateBrand("دفتر هوش کجاست و در چه شهرهایی پشتیبانی می‌کنید؟", brand)}
              answer={interpolateBrand(
                "دفتر مرکزی هوش در شیراز، زرقان، خیابان اصلی، پلاک ۲۴۸ است و تلفن ۰۷۱-۳۲۶۲۲۴۹۳ پاسخ‌گوی شنبه تا پنجشنبه (۹ تا ۲۱) است. نرم‌افزار کاملاً ابری است و کسب‌وکارهای ۲۰ شهر ایران — از تهران و اصفهان تا مشهد و تبریز — بدون نصب یا سرور محلی از همان پشتیبانی و آموزش رایگان بهره می‌برند.",
                brand
              )}
              withSchema
            />
          </div>

          {/* دفتر مرکزی + نقشه */}
          <Card className="mb-10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Building2 className="h-4 w-4 text-primary" />
                دفتر مرکزی — شیراز
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm leading-relaxed">
                <p className="font-bold text-foreground">{brand}</p>
                <p className="text-muted-foreground">
                  شیراز، زرقان، خیابان اصلی، پلاک ۲۴۸، طبقه ۶، واحد ۱۲
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 text-primary" />
                  <span dir="ltr">{BUSINESS_PHONE_DISPLAY}</span>
                  <span className="text-xs">(شنبه تا پنجشنبه، ۹ صبح تا ۹ شب)</span>
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <iframe
                  src={mapEmbedSrc}
                  title={interpolateBrand("نقشهٔ دفتر مرکزی هوش در شیراز/زرقان", brand)}
                  width="100%"
                  height="320"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0, display: "block" }}
                />
              </div>
              {gmaps.mapsUrl && (
                <a
                  href={gmaps.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  مشاهده در Google Maps
                  <ChevronLeft className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>

          {/* شهرهای تحت پوشش */}
          <section aria-labelledby="cities-heading" className="mb-10">
            <h2 id="cities-heading" className="text-lg font-bold text-foreground">
              شهرهای تحت پوشش
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {interpolateBrand(
                "پشتیبانی محلی، آموزش اختصاصی و مهاجرت رایگان داده در هر ۲۰ شهر — نرم‌افزار هوش ابری است و در همهٔ شهرها بدون نصب کار می‌کند:",
                brand
              )}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cities.map((city) => (
                <Link key={city.slug} href={`/cities/${city.slug}`} prefetch={false} className="group">
                  <div className="flex h-full items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                        {city.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">استان {city.province}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* لینک‌های داخلی */}
          <section aria-label="صفحات مرتبط" className="grid gap-4 sm:grid-cols-3">
            {[
              { href: "/contact", title: "تماس با ما", desc: "تلفن، ایمیل و نشانی کامل" },
              { href: "/cities", title: "هاب شهرها", desc: "راهنمای کامل انتخاب در شهرهای ایران" },
              { href: "/pricing", title: "قیمت و پلن‌ها", desc: "۷ روز آزمایش رایگان — بدون کارت بانکی" },
            ].map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} className="group">
                <div className="h-full rounded-xl border border-border/70 bg-card p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                  <h2 className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">{l.title}</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{l.desc}</p>
                </div>
              </Link>
            ))}
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>
            {brand} — ایران، شیراز · تلفن: {BUSINESS_PHONE_DISPLAY}
          </p>
          <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">
            صفحه اصلی
          </Link>
        </div>
      </footer>
    </div>
  );
}
