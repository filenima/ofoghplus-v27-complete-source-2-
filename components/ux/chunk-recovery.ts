/**
 * chunk-recovery — ابزار مشترکِ بازیابی خودکار خطای ChunkLoadError
 * ============================================================================
 * باگ بحرانی: وقتی سرور dev/استقرار ری‌استارت می‌شود یا تب کاربر stale است،
 * URL چانک‌های lazy عدد 404 برمی‌گرداند (ChunkLoadError). قبلاً این خطا به
 * SentryErrorBoundary می‌رسید و صفحهٔ بن‌بست «خطایی رخ داد» نشان می‌داد؛
 * در حالی که راه‌حل فقط یک `window.location.reload()` بعد از رسیدن سرور است.
 *
 * این ماژول (بدون وابستگی به React) سه چیز فراهم می‌کند:
 *  ۱) isChunkLoadError — تشخیص خطای چانک (JS/CSS)
 *  ۲) serverHealthy / waitForServer — بررسی سبک HEAD و انتظار برای بالا آمدن سرور
 *  ۳) گارد reload — «حداکثر یک‌بار در عمر صفحه» و «حداکثر ۳ بار در نشست»
 *     (sessionStorage) تا حلقهٔ بی‌نهایت reload هرگز رخ ندهد.
 *
 * استفاده‌کنندگان: sentry-error-boundary.tsx، module-load-error.tsx،
 * retryLazy در app-shell.tsx.
 */

/** شمارندهٔ reload خودکار در نشست — key طبق قرارداد __ofogh_chunk_reload_count__ */
export const CHUNK_RELOAD_COUNT_KEY = "__ofogh_chunk_reload_count__";
/** فلگ روی window — فقط یک recovery فعال در هر بارگذاری صفحه */
const CHUNK_RELOAD_FLAG = "__ofogh_chunk_reload_scheduled__";
/** سقف reload خودکار در هر نشست مرورگر */
export const MAX_CHUNK_AUTO_RELOADS = 3;

/** تشخیص خطای بارگذاری چانک (JS یا CSS) از نام/پیام خطا */
export function isChunkLoadError(err: unknown): boolean {
	if (!err) return false;
	const e = err as { name?: unknown; message?: unknown };
	const name = typeof e.name === "string" ? e.name : "";
	const message = typeof e.message === "string" ? e.message : "";
	return (
		name === "ChunkLoadError" ||
		/loading chunk/i.test(message) ||
		/loading css chunk/i.test(message) ||
		/failed to fetch/i.test(message) ||
		/importing a module script failed/i.test(message) ||
		/error loading dynamically imported module/i.test(message)
	);
}

/** شمارندهٔ فعلی reload خودکار در این نشست (در صورت خطای storage → ۰) */
export function chunkReloadCount(): number {
	try {
		return Number(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) || "0") || 0;
	} catch {
		return 0;
	}
}

/** افزایش شمارندهٔ reload خودکار */
export function bumpChunkReloadCount(): void {
	try {
		sessionStorage.setItem(
			CHUNK_RELOAD_COUNT_KEY,
			String(chunkReloadCount() + 1)
		);
	} catch {
		/* ignore */
	}
}

/** ریست دستی شمارنده (فقط با کلیک کاربر — هرگز خودکار) */
export function resetChunkReloadCount(): void {
	try {
		sessionStorage.removeItem(CHUNK_RELOAD_COUNT_KEY);
	} catch {
		/* ignore */
	}
}

/**
 * رزرو اسلات recovery — دقیقاً یک‌بار در عمر صفحه (حتی اگر چند boundary
 * همزمان خطای chunk بگیرند، فقط یک فلوی reload فعال می‌شود).
 */
export function claimChunkReloadSlot(): boolean {
	if (typeof window === "undefined") return false;
	const w = window as unknown as Record<string, unknown>;
	if (w[CHUNK_RELOAD_FLAG]) return false;
	w[CHUNK_RELOAD_FLAG] = true;
	return true;
}

/** آزادسازی اسلات (وقتی انتظار برای سرور بی‌نتیجه ماند تا تلاش بعدی ممکن باشد) */
export function releaseChunkReloadSlot(): void {
	if (typeof window === "undefined") return;
	const w = window as unknown as Record<string, unknown>;
	delete w[CHUNK_RELOAD_FLAG];
}

/** بررسی سلامت سرور — یک درخواست سبک HEAD به فایل استاتیک */
export async function serverHealthy(timeoutMs = 4000): Promise<boolean> {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetch("/manifest.webmanifest", {
				method: "HEAD",
				cache: "no-store",
				signal: ctrl.signal,
			});
			return res.ok;
		} finally {
			clearTimeout(t);
		}
	} catch {
		return false;
	}
}

/** منتظر ماندن برای سلامت سرور — هر ۳ ثانیه یک بررسی، حداکثر maxWaitMs */
export async function waitForServer(maxWaitMs = 90_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < maxWaitMs) {
		if (await serverHealthy()) return true;
		await new Promise((r) => setTimeout(r, 3000));
	}
	return await serverHealthy();
}

/**
 * زمان‌بندی یک reload سراسریِ گاردشده — برای فراخوانی از خارج از React
 * (مثلاً retryLazy در app-shell). فقط یک‌بار در عمر صفحه و تا سقف نشست
 * اجرا می‌شود؛ فقط وقتی reload می‌کند که سرور پاسخ‌گو باشد.
 *
 * @returns true اگر این فراخوانی صاحب فلوی reload شد.
 */
export function scheduleChunkReload(
	reason = "chunk-error",
	maxWaitMs = 60_000
): boolean {
	if (typeof window === "undefined") return false;
	if (chunkReloadCount() >= MAX_CHUNK_AUTO_RELOADS) return false;
	if (!claimChunkReloadSlot()) return false;
	void (async () => {
		try {
			const ok = await waitForServer(maxWaitMs);
			if (ok) {
				bumpChunkReloadCount();
				// چند صد میلی‌ثانیه صبر تا لاگ‌ها/گزارش‌ها flush شوند
				await new Promise((r) => setTimeout(r, 300));
				window.location.reload();
			} else {
				// سرور نیامد — اسلات آزاد تا خطای بعدی بتواند دوباره تلاش کند
				console.warn(`[chunk-recovery] server unreachable (${reason}) — retry deferred`);
				releaseChunkReloadSlot();
			}
		} catch {
			releaseChunkReloadSlot();
		}
	})();
	return true;
}
