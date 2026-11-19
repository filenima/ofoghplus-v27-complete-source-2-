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
import { QuickAnswer } from "@/components/seo/quick-answer";
import { JsonLd } from "@/components/seo/structured-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  ChevronLeft,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageCircle,
  Headphones,
} from "lucide-react";

// ============================================================
// app/contact/page.tsx — تماس با ما (R24-7 / Agent 2 — Local SEO)
// ------------------------------------------------------------
// صفحهٔ تماس ایندکس‌پذیر با:
//  • ContactPage JSON-LD + پیوند به LocalBusiness سراسری (NAP یکسان با فوتر)
//  • نقشهٔ گوگل (embed از تنظیمات سوپرادمین — google_maps_embed_url؛
//    fallback: مختصات دفتر مرکزی شیراز/زرقان)
//  • NAP کامل: نشانی، تلفن، ایمیل و ساعت کاری — مطابق generateLocalBusinessSchema
//  • بلوک «پاسخ کوتاه» (AEO) + لینک به هاب شهرها (/locations)
// ============================================================

const PAGE_TITLE = "تماس با ما — پشتیبانی حسابداری";
const PAGE_DESCRIPTION =
  "تماس با افق پلاس: تلفن ۰۷۱-۳۲۶۲۲۴۹۳ (شنبه تا پنجشنبه ۹ تا ۲۱)، ایمیل support@ofoghplus.ir، دفتر مرکزی شیراز/زرقان — پشتیبانی فارسی، تیکت و چت داخل برنامه";

// مختصات دفتر — منبع واحد با generateLocalBusinessSchema (lib/seo.ts)
const HQ_LAT = 29.5918;
const HQ_LNG = 52.5837;

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const url = `${siteUrl}/contact`;
  const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent(
    interpolateBrand("تماس با هوش — پشتیبانی حسابداری", brand)
  )}&type=listing`;
  return {
    title: PAGE_TITLE,
    description: interpolateBrand(PAGE_DESCRIPTION, brand),
    keywords: [
      "تماس با افق پلاس",
      interpolateBrand("تلفن پشتیبانی هوش", brand),
      "شماره تماس حسابداری",
      "پشتیبانی نرم افزار حسابداری",
      "نشانی دفتر شیراز",
    ],
    alternates: { canonical: url },
    openGraph: {
      title: interpolateBrand("تماس با هوش — پشتیبانی حسابداری", brand),
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
  };
}

export default async function ContactPage() {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const url = `${siteUrl}/contact`;
  // تنظیمات نقشهٔ سوپرادمین (embed اختصاصی یا لینک پروفایل گوگل)
  const gmaps = await getGoogleMapsReviewsSettings();
  const mapEmbedSrc =
    gmaps.embedUrl ||
    `https://maps.google.com/maps?q=${HQ_LAT},${HQ_LNG}&z=15&output=embed`;

  // ─── JSON-LD: ContactPage + BreadcrumbList ───
  const contactPageSchema = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "@id": `${url}#webpage`,
    url,
    name: interpolateBrand("تماس با هوش — پشتیبانی حسابداری", brand),
    description: interpolateBrand(PAGE_DESCRIPTION, brand),
    inLanguage: "fa-IR",
    isPartOf: { "@id": `${siteUrl}/#website` },
    about: { "@id": `${siteUrl}/#localbusiness` },
    // NAP — منبع واحد با generateLocalBusinessSchema (سازگاری کامل برای Local Pack)
    mainEntity: {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: brand,
      telephone: BUSINESS_PHONE,
      email: "support@ofoghplus.ir",
      address: {
        "@type": "PostalAddress",
        addressCountry: "IR",
        addressRegion: "فارس",
        addressLocality: BUSINESS_CITY,
        streetAddress: "شیراز، زرقان، خیابان اصلی، پلاک ۲۴۸، طبقه ۶، واحد ۱۲",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: HQ_LAT,
        longitude: HQ_LNG,
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        telephone: BUSINESS_PHONE,
        email: "support@ofoghplus.ir",
        availableLanguage: ["Persian"],
        hoursAvailable: {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
          opens: "09:00",
          closes: "21:00",
        },
      },
    },
  };
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "خانه", url: siteUrl },
    { name: "تماس با ما", url },
  ]);

  const contactChannels = [
    {
      icon: Phone,
      title: "تلفن پشتیبانی",
      value: BUSINESS_PHONE_DISPLAY,
      note: "شنبه تا پنجشنبه، ۹ صبح تا ۹ شب",
      href: `tel:${BUSINESS_PHONE}`,
      cta: "تماس مستقیم",
    },
    {
      icon: Mail,
      title: "ایمیل",
      value: "support@ofoghplus.ir",
      note: "پاسخ‌گویی زیر ۲۴ ساعت کاری",
      href: "mailto:support@ofoghplus.ir",
      cta: "ارسال ایمیل",
    },
    {
      icon: MessageCircle,
      title: "تیکت و چت داخل برنامه",
      value: "پنل کاربری",
      note: "سریع‌ترین مسیر برای مشکلات فنی — با تاریخچهٔ کامل",
      href: "/",
      cta: "ورود به برنامه",
    },
    {
      icon: Headphones,
      title: "پشتیبانی سازمانی",
      value: "۲۴/۷",
      note: "پلن سازمانی — مدیر موفقیت اختصاصی",
      href: "/pricing",
      cta: "مشاهدهٔ پلن‌ها",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <JsonLd data={contactPageSchema} />
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
            <span className="text-foreground">تماس با ما</span>
          </nav>

          <div className="mb-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Phone className="h-6 w-6" />
              </div>
              <Badge variant="secondary" className="text-xs">پشتیبانی فارسی</Badge>
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              {interpolateBrand("تماس با هوش — پشتیبانی حسابداری", brand)}
            </h1>
            <QuickAnswer
              question={interpolateBrand("چگونه با هوش تماس بگیریم؟", brand)}
              answer={interpolateBrand(
                "برای تماس با هوش تلفن ۰۷۱-۳۲۶۲۲۴۹۳ (شنبه تا پنجشنبه، ۹ صبح تا ۹ شب)، ایمیل support@ofoghplus.ir یا تیکت و چت داخل برنامه در دسترس است. دفتر مرکزی در شیراز، زرقان، خیابان اصلی، پلاک ۲۴۸ قرار دارد و مهاجرت داده و آموزش برای همهٔ مشتریان رایگان است.",
                brand
              )}
              withSchema
            />
          </div>

          {/* کانال‌های تماس */}
          <div className="mb-10 grid gap-4 sm:grid-cols-2">
            {contactChannels.map((ch) => (
              <Card key={ch.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ch.icon className="h-4.5 w-4.5" />
                    </span>
                    {ch.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-bold text-foreground" dir="ltr">{ch.value}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ch.note}</p>
                  <Link
                    href={ch.href}
                    prefetch={false}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    {ch.cta}
                    <ChevronLeft className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* نشانی + نقشه */}
          <section aria-labelledby="address-heading" className="mb-10">
            <Card>
              <CardHeader>
                <CardTitle id="address-heading" className="flex items-center gap-2 text-base font-bold">
                  <MapPin className="h-4 w-4 text-primary" />
                  نشانی دفتر مرکزی
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm leading-relaxed">
                  <p className="font-bold text-foreground">
                    {brand} — {BUSINESS_CITY}
                  </p>
                  <p className="text-muted-foreground">
                    شیراز، زرقان، خیابان اصلی، پلاک ۲۴۸، طبقه ۶، واحد ۱۲
                  </p>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 text-primary" />
                    شنبه تا پنجشنبه، ۹ صبح تا ۹ شب
                  </p>
                </div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <iframe
                    src={mapEmbedSrc}
                    title={interpolateBrand("نقشهٔ محل دفتر هوش در شیراز/زرقان", brand)}
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
          </section>

          {/* لینک‌های داخلی — لینک‌سازی محلی */}
          <section aria-label="صفحات مرتبط" className="grid gap-4 sm:grid-cols-3">
            {[
              { href: "/locations", title: "محل استقرار و شهرها", desc: "پشتیبانی محلی در ۲۰ شهر ایران" },
              { href: "/pricing", title: "قیمت و پلن‌ها", desc: "۷ روز آزمایش رایگان — بدون کارت بانکی" },
              { href: "/tutorials", title: "آموزش‌های گام‌به‌گام", desc: "راهنمای شروع کار و پاسخ به سوالات رایج" },
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
