/**
 * lib/seo/entity.ts — تکمیل سطح‌موجودیت (Entity-level) برای AI-SEO
 * =================================================================
 * مأموریت (Agent #5 — سئوی هوش مصنوعی):
 *
 * این ماژول «مکملِ» اسکیماهای موجود است (components/seo/structured-data.tsx
 * ← lib/seo.ts) و بلوک تکراری تولید نمی‌کند. خروجی آن یک @graph با «همان
 * @id» های موجودیت‌های اصلی است:
 *
 *   - Organization (#organization):
 *       knowsAbout (حوزه‌های تخصصی برای Knowledge Graph و AI Overviews)،
 *       alternateName «Ofogh Plus» (املای رسمی برند)، ایمیل پشتیبانی و
 *       پروفایل X — فقط برای برند اصلی (وایت‌لیبل خالی می‌ماند).
 *   - SoftwareApplication (#software):
 *       operatingSystem واقعی (PWA روی Web/Android/iOS — منبع: manifest.ts)،
 *       isAccessibleForFree (پلن رایگان/آزمایش) و AggregateOffer با قیمت
 *       واقعی پلن‌ها از منبع واحد lib/plans (getEffectivePlans — سازگار با
 *       ویرایش سوپرادمین).
 *
 * نکته فنی: پارسرهای JSON-LD (گوگل، بینگ و کراولرهای LLM) گراف‌های
 * چندتایی را بر اساس @id ادغام می‌کنند؛ بنابراین این بلوک فقط «فیلدهای
 * مفقود» را به موجودیت‌های موجود می‌افزاید و موجودیت جدید/تکراری نمی‌سازد.
 *
 * منبع قیمت: lib/plans-static.ts — پایه ۹,۷۵۰,۰۰۰ / حرفه‌ای ۱۴,۹۰۰,۰۰۰ /
 * سازمانی ۳۹,۹۰۰,۰۰۰ تومان سالانه. قیمت اسکیما با «ریال» (IRR ایزو) و
 * معادل تومان در description درج می‌شود تا هم ISO-4217 درست باشد و هم
 * برای کاربر فارسی‌زبان قابل فهم باشد.
 */

import { getEffectivePlans } from "@/lib/plans";
import { getBrandName } from "@/lib/brand-interpolate";
import { getSiteUrl, SITE_NAME } from "@/lib/seo";

/**
 * حوزه‌های تخصصی سازمان (knowsAbout) — سیگنال موجودیت برای موتورهای
 * generative. منبع: ماژول‌های واقعی محصول + صفحات صنایع سایت
 * (app/industries — طلافروشی، فروشگاه آنلاین، ...) و سامانه مودیان
 * (app/moadian-invoice). فقط موضوع‌هایی که واقعاً محتوایشان در سایت هست.
 */
export const KNOWS_ABOUT: string[] = [
	"نرم‌افزار حسابداری",
	"حسابداری ابری",
	"حسابداری طلا و جواهر",
	"حسابداری فروشگاهی و خرده‌فروشی",
	"فروشگاه آنلاین و تجارت الکترونیک",
	"فاکتور رسمی و سامانه مودیان مالیاتی",
	"صورتحساب الکترونیکی",
	"مالیات بر ارزش افزوده",
	"مدیریت انبار",
	"حقوق و دستمزد",
	"باشگاه مشتریان و CRM",
	"هوش مصنوعی و OCR فاکتور",
];

/**
 * getEntitySupplementSchema — گراف مکمل موجودیت‌ها (server-only؛ به
 * دیتابیس وصل است چون قیمت‌ها از getEffectivePlans می‌آیند).
 *
 * در خطا (DB down): offers حذف و بقیه فیلدها استاتیک برمی‌گردند —
 * هرگز رندر صفحه نباید به خاطر اسکیما fail شود.
 */
export async function getEntitySupplementSchema(): Promise<object> {
	const siteUrl = await getSiteUrl();
	const brandName = await getBrandName();
	const isPrimaryBrand = brandName === SITE_NAME;

	// پلن‌های پرداختیِ قابل‌نمایش — منبع واحد قیمت (پوشش‌های سوپرادمین اعمال شده)
	let paidPlans: { name: string; priceToman: number; priceRial: number }[] = [];
	try {
		paidPlans = (await getEffectivePlans())
			.filter((p) => !p.hidden && p.priceToman > 0)
			.map((p) => ({ name: p.name, priceToman: p.priceToman, priceRial: p.priceRial }));
	} catch {
		// بدون قیمت معتبر → offers emit نمی‌شود (سئوی امن)
	}

	// ---------- Organization: knowsAbout + هویت برند ----------
	const organization: Record<string, unknown> = {
		"@id": `${siteUrl}/#organization`,
		"@type": "Organization",
		name: brandName,
		url: siteUrl,
		logo: {
			"@type": "ImageObject",
			url: `${siteUrl}/logo.png`,
			width: 512,
			height: 512,
		},
		// املای رسمی لاتین برند — در کنار «OfoghPlus» موجود (ادغام @id)
		// به موتورها کمک می‌کند هر دو املا را به یک موجودیت گره بزنند.
		alternateName: ["Ofogh Plus"],
		knowsAbout: KNOWS_ABOUT,
	};
	if (isPrimaryBrand) {
		// فقط برند اصلی — وایت‌لیبل نباید NAP/پروفایل افق پلاس را به ارث ببرد
		organization.email = "support@ofoghplus.ir"; // منبع: lib/email-campaigns.ts
		organization.sameAs = ["https://x.com/ofoghplus"]; // هندل اعلام‌شده در twitter:site
	}

	// ---------- SoftwareApplication: پلتفرم‌ها + قیمت واقعی ----------
	const software: Record<string, unknown> = {
		"@id": `${siteUrl}/#software`,
		"@type": "SoftwareApplication",
		name: brandName,
		url: siteUrl,
		// PWA (app/manifest.ts — display: standalone) روی همه پلتفرم‌ها نصب می‌شود
		operatingSystem: ["Web", "Android", "iOS"],
		// پلن مینی/آزمایش ۷ روزه رایگان — isAccessibleForFree صادقانه true است
		isAccessibleForFree: true,
	};
	if (paidPlans.length > 0) {
		const lowToman = Math.min(...paidPlans.map((p) => p.priceToman));
		const highToman = Math.max(...paidPlans.map((p) => p.priceToman));
		const lowRial = Math.min(...paidPlans.map((p) => p.priceRial));
		const highRial = Math.max(...paidPlans.map((p) => p.priceRial));
		software.offers = {
			"@type": "AggregateOffer",
			name: `پلن‌های سالانه ${brandName}`,
			description: `قیمت سالانه — از ${lowToman.toLocaleString("fa-IR")} تا ${highToman.toLocaleString("fa-IR")} تومان`,
			lowPrice: String(lowRial),
			highPrice: String(highRial),
			priceCurrency: "IRR", // ریال (ISO-4217) — معادل تومان در description
			offerCount: String(paidPlans.length),
			url: `${siteUrl}/pricing`,
			offers: paidPlans.map((p) => ({
				"@type": "Offer",
				name: `پلن ${p.name} (سالانه — ${p.priceToman.toLocaleString("fa-IR")} تومان)`,
				price: String(p.priceRial),
				priceCurrency: "IRR",
				availability: "https://schema.org/InStock",
				url: `${siteUrl}/pricing`,
			})),
		};
	}

	return {
		"@context": "https://schema.org",
		"@graph": [organization, software],
	};
}
