/**
 * ============ lib/offline/pure.ts ============
 * R24-5 — منطق خالصِ لایهٔ آفلاین (بدون DOM/IndexedDB — قابل تست با bun)
 * ============================================================================
 * همهٔ توابع این فایل «خالص» (pure) هستند تا موتور همگام‌سازی بدون مرورگر
 * قابل unit-test باشد (scripts/test-offline-logic.ts).
 *  - sortOutbox: ترتیب بازپخش صف (FIFO پایدار بر اساس createdAt + seq)
 *  - classifySyncStatus: دسته‌بندی پاسخ سرور هنگام بازپخش (موفق/تعارض/…)
 *  - buildOfflineInvoiceNumber: شمارهٔ محلی فاکتور آفلاین (OFF- + timestamp)
 *  - makeOutboxItem / bumpOutboxFailure: ساخت/به‌روزرسانی آیتم صف (بدون IO)
 */

/* ─── انواع مشترک لایهٔ آفلاین ─── */

/** آیتم صف همگام‌سازی — موجودیت 'outbox' در IndexedDB */
export interface OutboxItem {
  /** کلید autoIncrement — ترتیب درج */
  id?: number;
  /** URL کامل یا نسبی — مثل /api/invoices */
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** بدنهٔ JSON سریال‌شده (string) یا null */
  body: string | null;
  /** Content-Type بدنه (معمولاً application/json) */
  contentType: string | null;
  /** کلید ایدمپوتنت یکتا — هنگام بازپخش در هدر Idempotency-Key می‌رود */
  idempotencyKey: string;
  /** R26 — شناسهٔ درخواست سمت کلاینت (api-client) — همان idempotencyKey است؛
   * فراخوان apiFetch با آن پاسخ synthetic را به عملیات محلی پیوند می‌زند */
  clientRequestId?: string | null;
  /** پیوند به پیش‌نویس محلی (کلید localId در موجودیت 'invoices') */
  draftLocalId?: string | null;
  createdAt: number;
  /** شمارهٔ درج (tie-breaker پایدار برای createdAt یکسان) */
  seq: number;
  attempts: number;
  /** تعداد شکست‌های قطعی ۴xx */
  failCount?: number;
  lastError?: string | null;
  lastAttemptAt?: number;
}

/** وضعیت چرخهٔ عمر پیش‌نویس فاکتور آفلاین */
export type OfflineDraftStatus =
  | "offline-draft" // ساخته‌شده در حالت آفلاین — در انتظار همگام‌سازی
  | "syncing" // در حال ارسال به سرور
  | "synced" // سرور 2xx داد (serverId/serverNumber پر است)
  | "conflict" // سرور 409 داد — نیازمند بررسی دستی
  | "failed"; // خطای قطعی ۴xx دیگر — نیازمند بررسی دستی

/** پیش‌نویس فاکتور آفلاین — موجودیت 'invoices' در IndexedDB */
export interface OfflineInvoiceDraft {
  /** شناسهٔ محلی یکتا (crypto.randomUUID یا fallback) */
  localId: string;
  /** شمارهٔ محلی — OFF- + timestamp */
  number: string;
  status: OfflineDraftStatus;
  /** payload دقیق ارسالی به POST /api/invoices (بدون تغییر بازپخش می‌شود) */
  payload: Record<string, unknown>;
  /** نام طرف‌حساب برای نمایش سریع بدون بازکردن payload */
  partyName?: string | null;
  /** جمع ریالی برای نمایش در لیست */
  totalIrr: number;
  /** ISO date فاکتور */
  date: string;
  type: string;
  createdAt: number;
  syncedAt?: number | null;
  /** شناسهٔ فاکتور سمت سرور پس از sync موفق */
  serverId?: string | null;
  serverNumber?: string | null;
  /** پیام خطا/تعارض برای بررسی دستی */
  error?: string | null;
}

/* ─── ترتیب بازپخش صف ─── */

/**
 * ترتیب پایدارِ بازپخش: بر اساس createdAt صعودی؛ در تساوی، بر اساس seq
 * (شمارهٔ درج autoIncrement). تضمین می‌کند فاکتورها به همان ترتیبی که
 * کاربر زده بازپخش شوند — مستقل از ترتیب getAll خام IDB.
 */
export function sortOutbox<T extends { createdAt: number; seq?: number; id?: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    const sa = a.seq ?? a.id ?? 0;
    const sb = b.seq ?? b.id ?? 0;
    return sa - sb;
  });
}

/* ─── دسته‌بندی پاسخ سرور هنگام بازپخش ─── */

export type SyncOutcome =
  | "success" // 2xx — حذف از صف، پیش‌نویس synced
  | "conflict" // 409 — پیش‌نویس conflict برای بررسی دستی
  | "auth" // 401 — نشست منقضی؛ آیتم می‌ماند، بعد از ورود دوباره تلاش می‌شود
  | "client-error" // 4xx دیگر — قطعی؛ پیش‌نویس failed برای بررسی دستی
  | "retry"; // 5xx / خطای شبکه — آیتم در صف می‌ماند و بعداً تلاش می‌شود

/** دسته‌بندی کد وضعیت پاسخ سرور به سیاست همگام‌سازی */
export function classifySyncStatus(status: number): SyncOutcome {
  if (status >= 200 && status < 300) return "success";
  if (status === 409) return "conflict";
  if (status === 401) return "auth";
  if (status >= 400 && status < 500) return "client-error";
  return "retry"; // 5xx و هر چیز دیگر (0 = خطای شبکه)
}

/**
 * آیا این آیتم صف الان «واجد تلاش مجدد» است؟
 * آیتم‌های جریمه‌شدهٔ ۴xx در بازهٔ backoff دوباره اجرا نمی‌شوند تا
 * رویدادهای sync پشت‌سرهم failCount را غیرواقعی بالا نبرند.
 */
export function isEligibleForRetry(
  item: Pick<OutboxItem, "failCount" | "lastAttemptAt">,
  now: number,
  backoffMs: number
): boolean {
  const failCount = item.failCount ?? 0;
  if (failCount <= 0) return true;
  if (!item.lastAttemptAt) return true;
  return now - item.lastAttemptAt >= backoffMs;
}

/* ─── شمارهٔ فاکتور آفلاین ─── */

/**
 * شمارهٔ محلی فاکتور آفلاین: «OFF-» + timestamp پایهٔ ۳۶.
 * پس از sync موفق، شمارهٔ واقعیِ سرور جایگزین نمایش می‌شود (serverNumber).
 */
export function buildOfflineInvoiceNumber(at: number = Date.now()): string {
  return `OFF-${at.toString(36).toUpperCase()}`;
}

/* ─── ساخت/به‌روزرسانی آیتم صف (بدون IO) ─── */

let outboxSeqCounter = 0;

/** ساخت آیتم صف جدید — تمام فیلدهای محاسباتی اینجا پر می‌شوند (R26: clientRequestId) */
export function makeOutboxItem(input: {
  url: string;
  method: OutboxItem["method"];
  body: unknown;
  contentType?: string | null;
  draftLocalId?: string | null;
  idempotencyKey?: string;
  clientRequestId?: string | null;
  at?: number;
}): OutboxItem {
  const bodyStr =
    input.body == null
      ? null
      : typeof input.body === "string"
        ? input.body
        : JSON.stringify(input.body);
  return {
    url: input.url,
    method: input.method,
    body: bodyStr,
    contentType: input.contentType ?? "application/json",
    idempotencyKey:
      input.idempotencyKey ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ofogh-${(input.at ?? Date.now()).toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 12)}`),
    clientRequestId: input.clientRequestId ?? null,
    draftLocalId: input.draftLocalId ?? null,
    createdAt: input.at ?? Date.now(),
    seq: ++outboxSeqCounter,
    attempts: 0,
    failCount: 0,
    lastError: null,
    lastAttemptAt: 0,
  };
}

/** به‌روزرسانی آیتم پس از یک تلاش ناموفق (بدون IO) */
export function bumpOutboxFailure(
  item: OutboxItem,
  error: string,
  at: number = Date.now()
): OutboxItem {
  return {
    ...item,
    attempts: (item.attempts ?? 0) + 1,
    failCount: (item.failCount ?? 0) + 1,
    lastError: error,
    lastAttemptAt: at,
  };
}

/* ─── Last-Write-Wins — حل تعارض نوشتن‌های آفلاین روی یک منبع (R26) ─── */

/**
 * R26 — Last-Write-Wins بین نوشتن‌های صف‌شده روی «یک منبع»:
 * اگر چند موتاسیون PUT/PATCH/DELETE آفلاین روی «همان URL» در صف باشد، فقط
 * «آخرین» (جدیدترین createdAt/seq) بازپخش می‌شود؛ قدیمی‌ها منسوخ می‌شوند و
 * در خروجی «superseded» برمی‌گردند تا موتور sync با تاییدِ همان منابع حذفشان کند.
 *  - POST هرگز ادغام نمی‌شود (هر POST یک منبع جدید است — مثل فاکتورهای جدا).
 *  - آیتم‌های دارای draftLocalId (فاکتور آفلاین) مستثنی‌اند — سیاست تعارض
 *    آن‌ها بررسی دستی (409 → 'conflict') است، نه LWW بی‌صدا.
 */
export function applyLastWriteWins<T extends OutboxItem>(
  items: T[]
): { replay: T[]; superseded: T[] } {
  const superseded: T[] = [];
  const latestByUrl = new Map<string, T>();

  for (const item of items) {
    const isLwwCandidate =
      !item.draftLocalId &&
      (item.method === "PUT" || item.method === "PATCH" || item.method === "DELETE");
    if (!isLwwCandidate) continue;

    const prev = latestByUrl.get(item.url);
    if (!prev) {
      latestByUrl.set(item.url, item);
      continue;
    }
    // مقایسهٔ ترتیب پایدار: createdAt → seq → id (بزرگ‌تر = جدیدتر)
    const rank = (x: T) =>
      `${String(x.createdAt).padStart(14, "0")}:${String(x.seq ?? x.id ?? 0).padStart(10, "0")}`;
    const [loser, winner] = rank(prev) > rank(item) ? [item, prev] : [prev, item];
    latestByUrl.set(item.url, winner);
    superseded.push(loser);
  }

  if (superseded.length === 0) return { replay: items, superseded };

  const supersededIds = new Set(
    superseded.map((x) => x.id).filter((x): x is number => x !== undefined)
  );
  const replay = items.filter((x) => !supersededIds.has(x.id));
  return { replay, superseded };
}

/* ─── کمکی: parse امن JSON — هرگز throw نمی‌کند ─── */

export function safeParseJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
