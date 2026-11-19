/**
 * lib/cache.ts — In-memory TTL cache for افق پلاس
 *
 * Lightweight, dependency-free cache for hot, rarely-changing data
 * (currency rates, blog posts, feature flags, system settings).
 *
 * Design notes:
 * - Uses a single Map<string, CacheEntry> on the module scope.
 * - In Next.js production (standalone) each Node.js worker process
 * has its own cache. For shared cache across workers, plug in Redis
 * (lib/redis.ts already exists). This module is the fast L1 layer.
 * - Lazy eviction on read; periodic sweep every SWEEP_INTERVAL_MS.
 * - All public functions are safe to call from any route.
 */
export type CacheEntry<T> = {
 value: T;
 expiresAt: number; // epoch ms
};

// در dev هر route ماژول‌های خودش را جداگانه instantiate می‌کند — برای
// اشتراک کش بین همه‌ی routeها (و کارکرد cacheDeleteByPrefix در سطح
// سرور)، Map روی globalThis نگه داشته می‌شود؛ همان الگوی Prisma singleton
// در lib/db.ts. در production (single process) رفتار یکسان است.
const globalForCache = globalThis as unknown as {
 __hooshCacheStore?: Map<string, CacheEntry<unknown>>;
 __hooshCacheInflight?: Map<string, Promise<unknown>>;
 __hooshCacheEpoch?: number;
 lastSweepAt?: number;
};
const store: Map<string, CacheEntry<unknown>> =
 globalForCache.__hooshCacheStore?? new Map<string, CacheEntry<unknown>>();
globalForCache.__hooshCacheStore = store;

// FIX(R28-1 / cache-stampede): نقشهٔ پرومیس‌های در جریان — بدون این، N درخواست
// هم‌زمان روی کلیدِ منقضی‌شده N بار loader را صدا می‌زدند (thundering herd /
// cache stampede) و دیتابیس زیر بار لحظه‌ای می‌رفت. حالا فقط اولین درخواست
// loader را اجرا می‌کند؛ بقیه روی همان پرومیس wait می‌کنند. روی globalThis تا
// بین routeهای مختلفِ dev هم مشترک باشد (همان الگوی store بالا).
const inflight: Map<string, Promise<unknown>> =
 globalForCache.__hooshCacheInflight?? new Map<string, Promise<unknown>>();
globalForCache.__hooshCacheInflight = inflight;

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 min
let lastSweepAt = globalForCache.lastSweepAt?? 0;

// FIX(R28-10a / stale write-back): حذف از نقشهٔ inflight پرومیسِ قدیمی را لغو
// نمی‌کند — loaderِ در جریان پس از پایان، مقدار stale را دوباره کش می‌کرد حتی
// اگر وسط کار cacheDelete آمده بود. با «اپوک» سراسری: هر باطل‌سازی اپوک را
// بالا می‌برد و loader فقط در صورت تغییرنکردن اپوک از لحظهٔ شروع، نتیجه را
// کش می‌کند (الگوی generation در SWR/React Query).
let epoch: number = globalForCache.__hooshCacheEpoch?? 0;
function nextEpoch(): void {
 epoch++;
 globalForCache.__hooshCacheEpoch = epoch;
}

/** Returns true if the entry exists and has not expired. */
function isAlive(entry: CacheEntry<unknown> | undefined): entry is CacheEntry<unknown> {
 return!!entry && entry.expiresAt > Date.now();
}

/** Lazy sweep — drops expired entries. Runs at most once per SWEEP_INTERVAL_MS. */
function maybeSweep(): void {
 const now = Date.now();
 if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
 lastSweepAt = now;
 globalForCache.lastSweepAt = now;
 for (const [k, v] of store) {
 if (!isAlive(v)) store.delete(k);
 }
}

/**
 * Read a cached value.
 * @param key Cache key (use a stable, namespaced string like "currency:list")
 * @returns The cached value, or undefined if missing/expired.
 */
export function cacheGet<T>(key: string): T | undefined {
 const entry = store.get(key);
 if (!isAlive(entry)) {
 if (entry) store.delete(key);
 return undefined;
 }
 return entry.value as T;
}

/**
 * Write a value to the cache with a TTL.
 * @param key Cache key
 * @param value Value to cache
 * @param ttlMs Time-to-live in milliseconds (default 60s)
 */
export function cacheSet<T>(key: string, value: T, ttlMs: number = 60_000): void {
 if (ttlMs <= 0) return;
 store.set(key, { value, expiresAt: Date.now() + ttlMs });
 maybeSweep();
}

/**
 * Read from cache, or compute and store the value.
 *
 * @example
 * const rates = await cacheGetOrSet("currency:list", () => fetchRates(), 60_000);
 *
 * @param key Cache key
 * @param loader Async function that produces the value when cache misses
 * @param ttlMs TTL in milliseconds
 */
export async function cacheGetOrSet<T>(
 key: string,
 loader: () => Promise<T>,
 ttlMs: number = 60_000
): Promise<T> {
 const cached = cacheGet<T>(key);
 if (cached!== undefined) return cached;

 // FIX(R28-1 / cache-stampede): اگر پرومیس در جریان برای این کلید وجود دارد،
 // همان را برگردان — loader فقط یک‌بار در هر موج هم‌زمانی اجرا می‌شود.
 const existing = inflight.get(key);
 if (existing) {
 return existing as Promise<T>;
 }

 const gen = epoch;
 const p = (async () => {
 try {
 const value = await loader();
 // FIX(R28-10a): اگر وسط کارِ loader باطل‌سازی رخ داده باشد، نتیجهٔ
 // stale کش نمی‌شود — مقدار به فراخوان فعلی برگردانده می‌شود اما در
 // کش نمی‌ماند تا خوانندهٔ بعدی دادهٔ تازه بگیرد.
 if (epoch === gen) cacheSet(key, value, ttlMs);
 return value;
 } finally {
 // پرومیس تمام‌شده (موفق یا ناموفق) از نقشهٔ در جریان حذف می‌شود تا
 // خطای گذرا برای همیشه کش نشود و تلاش بعدی دوباره loader را اجرا کند.
 inflight.delete(key);
 }
 })();

 inflight.set(key, p);
 return p;
}

/** Invalidate a single cache key. */
export function cacheDelete(key: string): void {
 store.delete(key);
 // FIX(R28-1): باطل‌سازی باید پرومیسِ در جریان را هم کنار بزند — وگرنه
 // loaderِ قدیمی پس از پایان، مقدار stale را دوباره کش می‌کرد.
 inflight.delete(key);
 // FIX(R28-10a): اپوک بالا می‌رود تا loader قدیمی نتیجه‌اش write-back نشود.
 nextEpoch();
}

/** Invalidate all keys matching a prefix (e.g. "currency:"). */
export function cacheDeleteByPrefix(prefix: string): void {
 if (!prefix) return;
 for (const k of store.keys()) {
 if (k.startsWith(prefix)) store.delete(k);
 }
 for (const k of inflight.keys()) {
 if (k.startsWith(prefix)) inflight.delete(k);
 }
 nextEpoch();
}

/**
 * باطل‌سازی کش داشبورد یک tenant — بعد از موتاسیون‌های مالی (فاکتور/سند/بانک/پرداخت)
 * تا اعداد داشبورد بلافاصله به‌روز شوند (TTL ۳۰ ثانیه فقط برای read-heavy بودن است).
 */
export function invalidateDashboardCache(tenantId: string): void {
 if (!tenantId) return;
 cacheDelete(`dashboard:main:${tenantId}`);
 cacheDelete(`dashboard:cross:${tenantId}`);
 // Task 4 — تحلیل «سود و ضرر کالاها»: کلیدها پسوند period دارند (month/…)
 // بنابراین با پیشوند باطل می‌شوند تا بعد از ثبت فاکتور، اعداد فوری تازه شوند.
 cacheDeleteByPrefix(`dashboard:product-profit:${tenantId}:`);
}

/** Clear the entire cache (mostly for tests). */
export function cacheClear(): void {
 store.clear();
 inflight.clear();
 nextEpoch();
}

/** Internal stats — useful for /api/health/detailed. */
export function cacheStats(): { size: number; sweepIntervalMs: number; inflight: number } {
 return { size: store.size, sweepIntervalMs: SWEEP_INTERVAL_MS, inflight: inflight.size };
}

/**
 * Standard TTL presets (milliseconds) for common data categories.
 * Tune these based on observed staleness tolerance vs. database load.
 */
export const CACHE_TTL = {
 /** 10 seconds — for data that can be slightly stale but should refresh fast. */
 SHORT: 10_000,
 /** 1 minute — default for most list endpoints. */
 STANDARD: 60_000,
 /** 5 minutes — for reference data (currencies, feature flags). */
 MEDIUM: 5 * 60_000,
 /** 1 hour — for very stable data (blog posts, public marketing content). */
 LONG: 60 * 60_000,
} as const;
