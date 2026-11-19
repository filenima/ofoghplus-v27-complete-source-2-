/**
 * lib/seo/local-schema.ts — اسکیمای سئوی محلی (Agent3-Local)
 * ===================================================================
 * بازسازی R28-12: این ماژول توسط صفحات شهر/صنعت/بانک:
 *   - app/cities/[city]/page.tsx
 *   - app/cities/[city]/industries/[industry]/page.tsx
 *   - app/cities/[city]/industries/[industry]/banks/[bank]/page.tsx
 * لازم است (قبلاً ۵۰۰/Module not found می‌دادند). قرارداد تابع‌ها از
 * همان call-siteها و کامنت‌های «Agent3-Local» آن‌ها استخراج شده است:
 *
 *  - getLocalSeoSameAs(brand): منبع واحد sameAs (تنظیمات گوگل‌مپِ
 *    سوپرادمین — الگوی components/seo/structured-data.tsx). در خطا/خالی
 *    آرایهٔ خالی برمی‌گردد؛ لینک تأییدنشده سیگنال منفی Knowledge Graph است.
 *
 *  - generateCityProfessionalServiceSchema({...}): موجودیت ProfessionalService
 *    ویژهٔ همین شهر — name=برند، areaServed=شهر+استان، inLanguage=fa،
 *    telephone/sameAs منبع واحد؛ @id صفحه‌محور + parentOrganization →
 *    LocalBusiness سراسری (بدون تداخل @id). با industry حاضر، makesOffer
 *    ارجاع‌دار به همین صنعت (و در صفحهٔ بانک، توصیف بانک) ساخته می‌شود.
 *
 * همهٔ توابع server-safe و بدون state هستند؛ هرگز رندر صفحه به خاطر
 * اسکیما نباید fail شود (الگوی entity.ts).
 */

import { getGoogleMapsReviewsSettings, getSameAsProfileUrls } from "@/lib/google-maps-reviews";
import { BUSINESS_PHONE } from "@/lib/seo";
import type { CityData, IndustryInfo, BankData } from "@/lib/city-industry-data";

/**
 * منبع واحد پروفایل‌های بیرونی برای sameAs — فقط تنظیمات گوگل‌مپِ
 * سوپرادمین (گوگل‌مپ/Bing/دایرکتوری/لینکدین/آپارات). پارامتر brand برای
 * سازگاری با call-siteها نگه داشته شده؛ sameAs هاردکد برند تزریق نمی‌شود
 * (FIX(v42-seo): لینک تأییدنشده سیگنال منفی است).
 */
export async function getLocalSeoSameAs(_brand: string): Promise<string[]> {
  try {
    const gmaps = await getGoogleMapsReviewsSettings();
    return getSameAsProfileUrls(gmaps);
  } catch {
    // DB در دسترس نیست — sameAs خالی بهتر از sameAs نامعتبر است
    return [];
  }
}

export interface CitySchemaInput {
  brand: string;
  siteUrl: string;
  pageUrl: string;
  city: CityData;
  industry?: IndustryInfo;
  bank?: BankData;
  sameAs?: string[];
}

/**
 * ProfessionalService ویژهٔ شهر (و در صورت وجود، صنعت/بانک همان صفحه).
 * @id صفحه‌محور است تا با LocalBusiness سراسری (#localbusiness) ادغام نشود؛
 * والد با parentOrganization ارجاع داده می‌شود.
 */
export function generateCityProfessionalServiceSchema(input: CitySchemaInput): Record<string, unknown> {
  const { brand, siteUrl, pageUrl, city, industry, bank, sameAs } = input;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${pageUrl}#professionalservice`,
    name: brand,
    url: pageUrl,
    inLanguage: "fa",
    telephone: BUSINESS_PHONE,
    image: `${siteUrl}/logo.png`,
    areaServed: [
      {
        "@type": "City",
        name: city.name,
        url: `${siteUrl}/cities/${city.slug}`,
      },
      {
        "@type": "AdministrativeArea",
        name: `استان ${city.province}`,
      },
    ],
    // ارجاع به موجودیت تجاری سراسری (ادغام گراف بدون تصادم @id)
    parentOrganization: { "@id": `${siteUrl}/#localbusiness` },
  };

  if (Array.isArray(sameAs) && sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  // makesOffer فقط وقتی «این صفحه» دربارهٔ یک صنعت است (صفحهٔ شهر: موجودیت
  // خالص شهر) — و در صفحهٔ بانک، توصیف بانکِ مورد استفادهٔ همین صنف/شهر
  if (industry) {
    const offerName = `نرم‌افزار حسابداری ${industry.name} در ${city.name}`;
    const offer: Record<string, unknown> = {
      "@type": "Offer",
      name: offerName,
      url: pageUrl,
      itemOffered: {
        "@type": "Service",
        name: offerName,
        serviceType: `حسابداری و صدور فاکتور برای ${industry.name}`,
        areaServed: { "@type": "City", name: city.name },
        provider: { "@id": `${pageUrl}#professionalservice` },
      },
    };
    if (bank) {
      offer.description = `اتصال بانکی و مغایرت‌گیری با ${bank.name} برای کسب‌وکارهای ${industry.name} در ${city.name}`;
    }
    schema.makesOffer = offer;
  }

  return schema;
}
