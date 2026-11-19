/**
 * ============ scripts/test-offline-logic.ts ============
 * R24-5 — unit-test منطق خالص لایهٔ آفلاین (بدون مرورگر — اجرا با bun)
 * ============================================================================
 * اجرا:  bun run scripts/test-offline-logic.ts
 * تست‌ها فقط توابع pure در lib/offline/pure.ts را می‌پوشانند:
 *  ۱) sortOutbox — ترتیب بازپخش FIFO پایدار (createdAt → seq → id)
 *  ۲) classifySyncStatus — سیاست پاسخ سرور (2xx/409/401/4xx/5xx)
 *  ۳) isEligibleForRetry — جریمهٔ backoff آیتم‌های شکست‌خورده
 *  ۴) buildOfflineInvoiceNumber — پیشوند OFF- + یکتایی
 *  ۵) makeOutboxItem / bumpOutboxFailure — ساخت و به‌روزرسانی آیتم صف
 *  ۶) safeParseJson — parse امن
 *  ۷) شبیه‌سازی چرخهٔ کامل: صف‌شدن → بازپخش با نتایج مختلف → وضعیت پیش‌نویس
 */

import {
  sortOutbox,
  classifySyncStatus,
  isEligibleForRetry,
  buildOfflineInvoiceNumber,
  makeOutboxItem,
  bumpOutboxFailure,
  safeParseJson,
  type OutboxItem,
  type OfflineDraftStatus,
} from "../lib/offline/pure";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function section(name: string): void {
  console.log(`\n■ ${name}`);
}

/* ─── ۱) ترتیب بازپخش صف ─── */
section("sortOutbox — ترتیب FIFO پایدار");
{
  const now = 1700000000000;
  const items: OutboxItem[] = [
    { ...makeOutboxItem({ url: "/api/invoices", method: "POST", body: {}, at: now + 3000 }), id: 3 },
    { ...makeOutboxItem({ url: "/api/invoices", method: "POST", body: {}, at: now + 1000 }), id: 1 },
    { ...makeOutboxItem({ url: "/api/invoices", method: "POST", body: {}, at: now + 2000 }), id: 2 },
  ];
  const sorted = sortOutbox(items);
  assert(
    sorted.map((i) => i.id).join(",") === "1,2,3",
    "مرتب‌سازی بر اساس createdAt صعودی (1→2→3)"
  );

  // تساوی createdAt → tie-breaker با seq (ترتیب درج)
  const same = sortOutbox([
    { ...makeOutboxItem({ url: "/a", method: "POST", body: {}, at: now }), id: 10 },
    { ...makeOutboxItem({ url: "/b", method: "POST", body: {}, at: now }), id: 11 },
  ]);
  assert(same[0].id === 10 && same[1].id === 11, "تساوی createdAt → ترتیب درج حفظ می‌شود");

  // seq صریح بر id اولویت دارد
  const seqTest = sortOutbox([
    { createdAt: now, seq: 9, id: 1 } as OutboxItem,
    { createdAt: now, seq: 2, id: 99 } as OutboxItem,
  ]);
  assert(seqTest[0].seq === 2, "seq صریح بر id اولویت دارد");

  // ورودی دست‌نخورده می‌ماند (بدون جهش آرایهٔ اصلی)
  const original = [
    { ...makeOutboxItem({ url: "/x", method: "POST", body: {}, at: now + 5 }), id: 2 },
    { ...makeOutboxItem({ url: "/y", method: "POST", body: {}, at: now }), id: 1 },
  ];
  sortOutbox(original);
  assert(original[0].id === 2 && original[1].id === 1, "آرایهٔ اصلی جهش نمی‌یابد (pure)");
}

/* ─── ۲) دسته‌بندی پاسخ سرور ─── */
section("classifySyncStatus — سیاست همگام‌سازی");
{
  assert(classifySyncStatus(200) === "success", "200 → success");
  assert(classifySyncStatus(201) === "success", "201 (ایجاد فاکتور) → success");
  assert(classifySyncStatus(204) === "success", "204 → success");
  assert(classifySyncStatus(299) === "success", "299 → success");
  assert(classifySyncStatus(409) === "conflict", "409 → conflict (بررسی دستی)");
  assert(classifySyncStatus(401) === "auth", "401 → auth (نشست منقضی)");
  assert(classifySyncStatus(400) === "client-error", "400 → client-error");
  assert(classifySyncStatus(403) === "client-error", "403 → client-error");
  assert(classifySyncStatus(404) === "client-error", "404 → client-error");
  assert(classifySyncStatus(429) === "client-error", "429 → client-error");
  assert(classifySyncStatus(500) === "retry", "500 → retry (موقت)");
  assert(classifySyncStatus(502) === "retry", "502 → retry");
  assert(classifySyncStatus(503) === "retry", "503 → retry");
}

/* ─── ۳) جریمهٔ backoff ─── */
section("isEligibleForRetry — backoff");
{
  const now = 1700000000000;
  assert(isEligibleForRetry({ failCount: 0, lastAttemptAt: 0 }, now, 30000), "بدون شکست → واجد تلاش");
  assert(
    isEligibleForRetry({ failCount: 2, lastAttemptAt: now - 31000 }, now, 30000),
    "شکست قدیمی‌تر از backoff → واجد تلاش مجدد"
  );
  assert(
    !isEligibleForRetry({ failCount: 2, lastAttemptAt: now - 5000 }, now, 30000),
    "شکست تازه (داخل بازهٔ backoff) → صبر"
  );
  assert(
    isEligibleForRetry({ failCount: 3, lastAttemptAt: 0 }, now, 30000),
    "شکست بدون lastAttemptAt → واجد تلاش"
  );
}

/* ─── ۴) شمارهٔ فاکتور آفلاین ─── */
section("buildOfflineInvoiceNumber — OFF- + timestamp");
{
  const n1 = buildOfflineInvoiceNumber(1700000000000);
  assert(n1.startsWith("OFF-"), `پیشوند OFF- (دریافت: ${n1})`);
  assert(n1 === "OFF-LOYW3V28", "قالب پایهٔ ۳۶timestamp پایدار است (OFF-LOYW3V28)");
  const a = buildOfflineInvoiceNumber(1700000000001);
  const b = buildOfflineInvoiceNumber(1700000000002);
  assert(a !== b, "شماره‌های متوالی یکتا هستند");
  // یکتایی در ۱۰۰۰ تولید پیاپی
  const seen = new Set<string>();
  let unique = true;
  for (let i = 0; i < 1000; i++) {
    const n = buildOfflineInvoiceNumber(Date.now() + i);
    if (seen.has(n)) unique = false;
    seen.add(n);
  }
  assert(unique, "۱۰۰۰ تولید پیاپی بدون تداخل");
}

/* ─── ۵) ساخت/به‌روزرسانی آیتم صف ─── */
section("makeOutboxItem / bumpOutboxFailure");
{
  const item = makeOutboxItem({
    url: "/api/invoices",
    method: "POST",
    body: { type: "SALE", items: [{ quantity: 2 }] },
    draftLocalId: "loc-1",
  });
  assert(item.body === JSON.stringify({ type: "SALE", items: [{ quantity: 2 }] }), "body JSON سریال می‌شود");
  assert(item.contentType === "application/json", "contentType پیش‌فرض application/json");
  assert(item.attempts === 0 && item.failCount === 0, "شروع با attempts=0 و failCount=0");
  assert(item.draftLocalId === "loc-1", "پیوند به پیش‌نویس محلی برقرار است");
  assert(typeof item.idempotencyKey === "string" && item.idempotencyKey.length > 8, "کلید ایدمپوتنت تولید شد");
  assert(typeof item.seq === "number" && item.seq > 0, "seq ترتیب درج دارد");

  const raw = makeOutboxItem({ url: "/x", method: "POST", body: null });
  assert(raw.body === null, "body null برای درخواست بدون بدنه");
  const asStr = makeOutboxItem({ url: "/y", method: "DELETE", body: '{"a":1}' });
  assert(asStr.body === '{"a":1}', "body string دست‌نخورده می‌ماند (بدون دوباره‌JSON)");

  const bumped = bumpOutboxFailure(item, "HTTP 409", 1700000009999);
  assert(bumped.attempts === 1 && bumped.failCount === 1, "تلاش و شکست شمرده شد");
  assert(bumped.lastError === "HTTP 409" && bumped.lastAttemptAt === 1700000009999, "خطا و زمان ثبت شد");
  assert(item.attempts === 0, "آیتم اصلی جهش نمی‌یابد (pure)");
}

/* ─── ۶) parse امن ─── */
section("safeParseJson");
{
  assert(safeParseJson('{"ok":true}')?.ok === true, "JSON سالم parse می‌شود");
  assert(safeParseJson("not-json") === null, "JSON خراب → null (بدون throw)");
  assert(safeParseJson(null) === null, "null → null");
  assert(safeParseJson(undefined) === null, "undefined → null");
  assert(safeParseJson("") === null, "رشتهٔ خالی → null");
}

/* ─── ۷) شبیه‌سازی چرخهٔ کامل صف ─── */
section("شبیه‌سازی چرخهٔ کامل — صف‌شدن تا وضعیت نهایی");
{
  const now = 1700000000000;
  // سه فاکتور آفلاین پشت‌سرهم
  const queue: OutboxItem[] = [
    makeOutboxItem({ url: "/api/invoices", method: "POST", body: { n: 1 }, draftLocalId: "d1", at: now }),
    makeOutboxItem({ url: "/api/invoices", method: "POST", body: { n: 2 }, draftLocalId: "d2", at: now + 1000 }),
    makeOutboxItem({ url: "/api/invoices", method: "POST", body: { n: 3 }, draftLocalId: "d3", at: now + 2000 }),
  ];

  // بازپخش به‌ترتیب با نتایج: 201 / 409 / 500
  const outcomes: Array<{ status: number; expectedDraft: OfflineDraftStatus }> = [
    { status: 201, expectedDraft: "synced" },
    { status: 409, expectedDraft: "conflict" },
    { status: 500, expectedDraft: "offline-draft" },
  ];
  const drafts = new Map<string, OfflineDraftStatus>([
    ["d1", "offline-draft"],
    ["d2", "offline-draft"],
    ["d3", "offline-draft"],
  ]);
  const remaining: OutboxItem[] = [];

  const ordered = sortOutbox(queue);
  assert(
    ordered.map((i) => (safeParseJson<{ n: number }>(i.body)?.n)).join(",") === "1,2,3",
    "بازپخش به همان ترتیب ثبت کاربر (1،2،3)"
  );

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const outcome = classifySyncStatus(outcomes[i].status);
    if (outcome === "success") {
      // حذف از صف مجاز است (تایید 2xx)
      drafts.set(item.draftLocalId!, "synced");
    } else if (outcome === "conflict") {
      // حذف از صف + پیش‌نویس conflict (داده محلی زنده می‌ماند)
      drafts.set(item.draftLocalId!, "conflict");
    } else if (outcome === "client-error") {
      drafts.set(item.draftLocalId!, "failed");
    } else {
      // retry — آیتم در صف می‌ماند (بدون حذف!) — زمان تلاش: پایان دور اول
      remaining.push(bumpOutboxFailure(item, `HTTP ${outcomes[i].status}`, now + 3000));
    }
  }

  assert(drafts.get("d1") === "synced", "فاکتور ۱ (201) → synced");
  assert(drafts.get("d2") === "conflict", "فاکتور ۲ (409) → conflict برای بررسی دستی");
  assert(drafts.get("d3") === "offline-draft", "فاکتور ۳ (500) → در صف می‌ماند (offline-draft)");
  assert(remaining.length === 1 && remaining[0].failCount === 1, "آیتم ۵xx در صف ماند و جریمه شد");
  assert(remaining[0].body !== null && safeParseJson<{ n: number }>(remaining[0].body)?.n === 3, "payload آیتم مانده دست‌نخورده است");

  // دور دوم: آیتم مانده هنوز داخل backoff است
  const later = now + 5000;
  assert(!isEligibleForRetry(remaining[0], later, 30000), "دور دوم بلافاصله → هنوز backoff");
  const muchLater = now + 40000;
  assert(isEligibleForRetry(remaining[0], muchLater, 30000), "بعد از expiry backoff → تلاش مجدد مجاز");
}

/* ─── گزارش ─── */
console.log(`\n${"═".repeat(52)}`);
console.log(`نتیجه: ${passed} پاس — ${failed} شکست`);
console.log("═".repeat(52));
if (failed > 0) process.exit(1);
