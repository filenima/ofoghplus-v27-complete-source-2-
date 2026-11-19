import { DEFAULT_BRANDING, getBrandingSettings } from "@/lib/system-settings";
import { getCanonicalDomain, isBrandDomain } from "@/lib/domains";

/**
 * lib/app-url.ts — آدرس پایه‌ی اپ برای ساخت لینک (ایمیل‌ها، دعوت‌ها، ...)
 *
 * REBRAND(R14-A) — استراتژی دودامنه:
 * 1) متغیر محیطی NEXT_PUBLIC_APP_URL (اگر تنظیم شده باشد)
 * 2) هدرهای Host/x-forwarded-host درخواست — فقط اگر یکی از دامنه‌های برند
 *    باشد (ofoghplus.ir یا hoosh.nobatime.ir) → هر دو دامنه لینکِ خودشان
 *    را می‌گیرند و کاربر روی همان دامنه می‌ماند
 * 3) دامنه‌ی برندینگ از SystemSettings (https://{domain}) — قابل تغییر در پنل سوپرادمین
 * 4) پیش‌فرض: دامنهٔ canonical برند (https://ofoghplus.ir)
 */
export async function getAppBaseUrl(request?: Request): Promise<string> {
	const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
	if (envUrl) return envUrl.replace(/\/+$/, "");

	// ۲) هاست درخواست — فقط دامنه‌های برند (پشتیبانی دودامنه)
	try {
		if (request) {
			const rawHost =
				request.headers.get("x-forwarded-host") || request.headers.get("host");
			// x-forwarded-host ممکن است کاما-جدا باشد — اولین مقدار
			const host = rawHost?.split(",")[0]?.trim();
			if (host && isBrandDomain(host)) return `https://${host}`;
		}
	} catch {
		// ignore — fallback به دامنهٔ برندینگ
	}

	// ۳) دامنه‌ی برندینگ از SystemSettings
	try {
		const branding = await getBrandingSettings();
		const domain = branding.domain?.trim().replace(/^[a-zA-Z]+:\/\//, "").replace(/\/+$/, "");
		if (domain) return `https://${domain}`;
	} catch {
		// ignore — fallback به canonical
	}

	// ۴) دامنهٔ canonical (ofoghplus.ir) — هم‌ارزش DEFAULT_BRANDING.domain
	return `https://${getCanonicalDomain()}`;
}
