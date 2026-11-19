import { interpolateFaqsAsync } from "@/lib/brand-interpolate";
import { faqItems } from "@/lib/landing-config";
import { generateFaqSchema, getSiteUrl, safeJsonLd } from "@/lib/seo";

/**
 * lib/seo/faq-schema.tsx — FAQPage JSON-LD مطابق محتوای «قابل مشاهده»
 * ====================================================================
 * (AI-SEO Agent #5)
 *
 * منبع واحد سوالات: `faqItems` در lib/landing-config.ts — همان داده‌ای که
 * FAQSection (components/views/landing-dynamic.tsx، سکشن #faq) رندر
 * می‌کند. سیاست Google برای FAQ rich results: محتوای مارک‌شده باید در
 * صفحه قابل مشاهده باشد؛ به همین دلیل DEFAULT_FAQ_SCHEMA (که سوالاتش
 * روی لندینگ نمایش داده نمی‌شد) با همین بلوک در app/page.tsx جایگزین شد.
 *
 * درون‌یابی برند (interpolateFaqsAsync) مثل قبل اعمال می‌شود تا در
 * استقرارهای وایت‌لیبل نام برند درست درج شود. @id صفحه‌محور
 * (`${url}#faq`) طبق v20-S حفظ شده است.
 */
export async function LandingFaqJsonLd() {
	const [faqs, url] = await Promise.all([
		interpolateFaqsAsync(faqItems),
		getSiteUrl(),
	]);
	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: safeJsonLd(generateFaqSchema(faqs, url)) }}
		/>
	);
}
