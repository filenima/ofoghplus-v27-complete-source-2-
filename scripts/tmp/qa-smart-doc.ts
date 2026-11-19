// ============================================================================
// scripts/tmp/qa-smart-doc.ts — تست E2E «سند هوشمند» (Task R14-C)
// ----------------------------------------------------------------------------
// ۱) ساخت کاربر تریال تست (POST /api/trial/create)
// ۲) seed کدینگ حساب برای tenant تست (مستقیم با Prisma)
// ۳) ساخت فایل‌های تست: صورتحساب بانکی xlsx (۱۵ ردیف، هدر فارسی + تاریخ
//    شمسی با فرمت‌های مختلف) + لیست هزینه CSV
// ۴) POST /api/accounting/smart-doc mode=preview (چند فایل با هم) → راستی‌آزمایی
// ۵) POST mode=commit → راستی‌آزمایی JournalEntry/JournalLine در DB (DRAFT، ریال)
// ۶) پاک‌سازی کامل داده‌های تست (سند + خطوط + حساب‌ها + کاربر/tenant)
// اجرا: bun scripts/tmp/qa-smart-doc.ts
// ============================================================================

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const prisma = new PrismaClient({
  datasources: { db: { url: "file:/home/z/my-project/hooshhesab/db/custom.db" } },
});

async function main() {
  const stamp = Date.now().toString(36);
  const email = `qa-smartdoc-${stamp}@hoosh.local`;
  const password = `Qa!${stamp}Aa9`;

  // ---------- ۱) ساخت حساب تریال ----------
  const regRes = await fetch(`${BASE}/api/trial/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name: "تست سند هوشمند",
      companyName: `شرکت تست سند هوشمند ${stamp}`,
    }),
  });
  const reg = (await regRes.json()) as {
    success: boolean;
    token?: string;
    tenant?: { id: string; name: string };
    error?: string;
  };
  if (!reg.success || !reg.token || !reg.tenant) {
    throw new Error(`trial/create failed: ${reg.error ?? regRes.status}`);
  }
  const token = reg.token;
  const tenantId = reg.tenant.id;
  console.log(`✓ tenant تست ساخته شد: ${tenantId} (${email})`);

  // ---------- ۲) seed کدینگ حساب ----------
  const groups = await Promise.all(
    [
      { code: "1", name: "دارایی‌ها", type: "BALANCE_SHEET", nature: "DEBIT", order: 1 },
      { code: "2", name: "بدهی‌ها", type: "BALANCE_SHEET", nature: "CREDIT", order: 2 },
      { code: "4", name: "درآمدها", type: "PROFIT_LOSS", nature: "CREDIT", order: 4 },
      { code: "5", name: "هزینه‌ها", type: "PROFIT_LOSS", nature: "DEBIT", order: 5 },
    ].map((g) =>
      prisma.accountGroup.create({ data: { tenantId, ...g } })
    )
  );
  const gBy = (code: string) => groups.find((g) => g.code === code)!;
  const accDefs: Array<[string, string, string]> = [
    ["1101", "صندوق", "1"],
    ["1102", "بانک ملت", "1"],
    ["1103", "حساب‌های دریافتنی", "1"],
    ["2101", "حساب‌های پرداختنی", "2"],
    ["4101", "درآمد فروش", "4"],
    ["5101", "حقوق و دستمزد", "5"],
    ["5102", "هزینه اجاره", "5"],
    ["5103", "هزینه تاسیسات (آب و برق و گاز و تلفن)", "5"],
    ["5104", "کارمزد بانکی", "5"],
    ["5199", "سایر حساب‌ها (موقت)", "5"],
  ];
  const accounts = await Promise.all(
    accDefs.map(([code, name, g]) =>
      prisma.account.create({
        data: { tenantId, code, name, groupId: gBy(g).id, nature: gBy(g).nature, balanceType: "GENERAL" },
      })
    )
  );
  console.log(`✓ ${accounts.length} حساب کدینگ seed شد`);

  // ---------- ۳) فایل‌های تست ----------
  // ۳-الف) صورتحساب بانکی xlsx — ۱۵ ردیف، هدر فارسی، تاریخ شمسی (۳ فرمت + ارقام فارسی)
  const fa = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  const bankRows: Array<Array<string | number>> = [
    ["تاریخ", "شرح تراکنش", "بدهکار", "بستانکار", "مانده", "شماره پیگیری"],
    ["1403/05/01", "واریز مشتری — فروش کالا", "", 25000000, 125000000, "880001"],
    ["1403/05/02", "کارمزد انتقال", 12000, "", 124988000, "880002"],
    ["1403-05-03", "پرداخت اجاره دفتر", 8500000, "", 116488000, "880003"],
    [fa("1403/05/04"), "واریز فروش نقدی", "", 4300000, 120788000, "880004"],
    ["1403/05/05", "پرداخت حقوق و دستمزد", 62000000, "", 58788000, "880005"],
    ["1403/05/06", "واریز مشتری — شرکت پارس", "", 15700000, 74488000, "880006"],
    ["1403/05/07", "پرداخت قبض برق", 1850000, "", 72638000, "880007"],
    ["1403/05/08", "پرداخت قبض آب", 320000, "", 72318000, "880008"],
    ["1403/05/09", "واریز فروش خدمات", "", 9800000, 82118000, "880009"],
    ["1403/05/10", "پرداخت تلفن و اینترنت", 640000, "", 81478000, "880010"],
    ["1403/05/11", "خرید لوازم اداری", 2750000, "", 78728000, "880011"],
    ["1403/05/12", "واریز مشتری — فروشگاه آریا", "", 31200000, 109928000, "880012"],
    ["1403/05/13", "پرداخت بیمه", 4100000, "", 105828000, "880013"],
    ["1403/05/14", "پرداخت حمل و نقل باربری", 950000, "", 104878000, "880014"],
    ["1403/05/15", "واریز نقدی از صندوق", "", 5000000, 109878000, "880015"],
  ];
  const bankWb = XLSX.utils.book_new();
  const bankWs = XLSX.utils.aoa_to_sheet(bankRows);
  XLSX.utils.book_append_sheet(bankWb, bankWs, "Sheet1");
  const bankBuf = XLSX.write(bankWb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // ۳-ب) لیست هزینه CSV — هدر فارسی با ي عربی
  const expenseCsv = [
    "تاريخ,شرح,مبلغ",
    "1403/06/01,هزینه اجاره مغازه دوم,12000000",
    "1403/06/05,حقوق پرسنل,48000000",
    "1403/06/10,قبض گاز,780000",
    "1403/06/15,کارمزد بانکی,45000",
    "1403/06/20,تبلیغات اینستاگرام,3500000",
    "1403/06/25,خرید ناقص بدون مبلغ,", // ردیف ناقص — باید رد شود
    "1403/06/30,مشاوره مالیاتی,2500000",
  ].join("\n");

  // ---------- ۴) preview چند-فایلی ----------
  const form = new FormData();
  form.append("mode", "preview");
  form.append(
    "options",
    JSON.stringify({ defaultDescription: "اسناد ایمپورت تست — مرداد ۱۴۰۳" })
  );
  form.append("files", new Blob([new Uint8Array(bankBuf)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "صورتحساب-بانک-ملت.xlsx");
  form.append("files", new Blob([expenseCsv], { type: "text/csv" }), "لیست-هزینه-ها.csv");

  const prevRes = await fetch(`${BASE}/api/accounting/smart-doc`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const prev = (await prevRes.json()) as {
    success: boolean;
    error?: string;
    accounts?: Array<{ id: string; name: string }>;
    files?: Array<{
      fileName: string;
      docType: string;
      docTypeLabel: string;
      detectedColumns: Record<string, string>;
      rowCount: number;
      skippedRows: number;
      totalDebitToman: number;
      totalCreditToman: number;
      balanced: boolean;
      warnings: string[];
      unmappedCount: number;
      sampleRows: Array<{ accountName: string | null; mapped: boolean }>;
      accountBreakdown: Array<{ ruleLabel: string | null; accountName: string | null; count: number }>;
      counterAccountName: string | null;
      lineCount: number;
    }>;
  };
  if (!prevRes.ok || !prev.success) {
    throw new Error(`preview failed (${prevRes.status}): ${prev.error}`);
  }
  const prevFiles = prev.files ?? [];
  console.log("\n========== PREVIEW ==========");
  console.log(`accounts: ${prev.accounts?.length}`);
  for (const f of prevFiles) {
    console.log(`\n— ${f.fileName} [${f.docType} / ${f.docTypeLabel}]`);
    console.log(`  columns: ${JSON.stringify(f.detectedColumns)}`);
    console.log(`  rows: ${f.rowCount} (رد‌شده: ${f.skippedRows}) | lines: ${f.lineCount}`);
    console.log(`  بدهکار: ${f.totalDebitToman.toLocaleString("en-US")} | بستانکار: ${f.totalCreditToman.toLocaleString("en-US")} | تراز: ${f.balanced}`);
    console.log(`  counter: ${f.counterAccountName} | unmapped: ${f.unmappedCount}`);
    console.log(`  warnings: ${f.warnings.join(" | ") || "—"}`);
    console.log(`  breakdown: ${f.accountBreakdown.map((b) => `${b.ruleLabel ?? "?"}→${b.accountName ?? "؟"}(${b.count})`).join(" ، ")}`);
  }

  // راستی‌آزمایی preview
  const bankP = prevFiles.find((f) => f.fileName.includes("صورتحساب"));
  const expP = prevFiles.find((f) => f.fileName.includes("هزینه"));
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
    console.log(`✓ ${msg}`);
  };
  assert(Boolean(bankP), "فایل بانک در preview هست");
  assert(Boolean(expP), "فایل هزینه در preview هست");
  assert(bankP!.docType === "bank", `نوع سند بانک = bank (got ${bankP!.docType})`);
  assert(bankP!.detectedColumns.date === "تاریخ", "ستون تاریخ بانک درست");
  assert(bankP!.detectedColumns.description === "شرح تراکنش", "ستون شرح بانک درست");
  assert(bankP!.detectedColumns.debit === "بدهکار", "ستون بدهکار بانک درست");
  assert(bankP!.detectedColumns.credit === "بستانکار", "ستون بستانکار بانک درست");
  assert(bankP!.rowCount === 15, `۱۵ ردیف بانک (got ${bankP!.rowCount})`);
  assert(bankP!.balanced, "سند بانک تراز است (زوج متقابل)");
  assert(bankP!.counterAccountName === "بانک ملت", `حساب متقابل = بانک ملت (got ${bankP!.counterAccountName})`);
  // جمع جریان بانک: واریزها ۹۱م + برداشت‌ها ۸۱٫۱۲۲م = ۱۷۲٫۱۲۲م تومان (هر ردیف زوج دوجهته دارد)
  assert(bankP!.totalDebitToman === 172122000, `جمع بدهکار بانک = 172,122,000 (got ${bankP!.totalDebitToman})`);
  assert(bankP!.totalCreditToman === 172122000, `جمع بستانکار بانک = 172,122,000 (got ${bankP!.totalCreditToman})`);
  assert(bankP!.unmappedCount === 0, `همه قلم‌های بانک حساب دارند (got ${bankP!.unmappedCount})`);

  assert(expP!.rowCount === 6, `۶ ردیف هزینه (ردیف ناقص رد شده) (got ${expP!.rowCount})`);
  assert(expP!.skippedRows === 1, `۱ ردیف ناقص رد شد (got ${expP!.skippedRows})`);
  assert(expP!.balanced, "سند هزینه تراز است");
  const expTotal = 12000000 + 48000000 + 780000 + 45000 + 3500000 + 2500000;
  assert(expP!.totalDebitToman === expTotal, `جمع هزینه = ${expTotal} (got ${expP!.totalDebitToman})`);
  // تبلیغات → قاعده marketing حساب ندارد در کدینگ → unmapped یا fallback «سایر حساب‌ها (موقت)»
  assert(expP!.unmappedCount === 0, `قلم تبلیغات به fallback «سایر» رفت (got ${expP!.unmappedCount})`);

  // ---------- ۵) commit ----------
  const commitForm = new FormData();
  commitForm.append("mode", "commit");
  commitForm.append(
    "options",
    JSON.stringify({ defaultDescription: "اسناد ایمپورت تست — مرداد ۱۴۰۳" })
  );
  commitForm.append("files", new Blob([new Uint8Array(bankBuf)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "صورتحساب-بانک-ملت.xlsx");
  commitForm.append("files", new Blob([expenseCsv], { type: "text/csv" }), "لیست-هزینه-ها.csv");

  const commitRes = await fetch(`${BASE}/api/accounting/smart-doc`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: commitForm,
  });
  const commit = (await commitRes.json()) as {
    success: boolean;
    error?: string;
    message?: string;
    created?: Array<{ fileName: string; entryId: string; number: number; lineCount: number }>;
    skipped?: Array<{ fileName: string; reason: string }>;
  };
  if (!commitRes.ok || !commit.success) {
    throw new Error(`commit failed (${commitRes.status}): ${commit.error}`);
  }
  console.log("\n========== COMMIT ==========");
  console.log(`message: ${commit.message}`);
  for (const c of commit.created ?? []) {
    console.log(`✓ ${c.fileName} → سند #${c.number} (${c.lineCount} قلم) id=${c.entryId}`);
  }
  for (const s of commit.skipped ?? []) console.log(`✗ ${s.fileName}: ${s.reason}`);
  assert((commit.created ?? []).length === 2, "۲ سند ساخته شد (یکی به‌ازای هر فایل)");
  assert((commit.skipped ?? []).length === 0, "هیچ فایلی رد نشد");

  // راستی‌آزمایی DB
  const entries = await prisma.journalEntry.findMany({
    where: { tenantId },
    include: { lines: { include: { account: true } } },
    orderBy: { number: "asc" },
  });
  assert(entries.length === 2, `۲ JournalEntry در DB (got ${entries.length})`);
  for (const e of entries) {
    assert(e.status === "DRAFT", `سند #${e.number} وضعیت DRAFT دارد (got ${e.status})`);
    assert(e.type === "JOURNAL", `سند #${e.number} نوع JOURNAL`);
    assert(e.createdBy !== null, `سند #${e.number} createdBy دارد`);
    const dr = e.lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = e.lines.reduce((s, l) => s + Number(l.credit), 0);
    assert(dr === cr && dr > 0, `سند #${e.number} تراز در DB (بدهکار=بستانکار=${dr} ریال)`);
    assert(dr % 10 === 0, `سند #${e.number} مبالغ به ریال (×۱۰) ذخیره شده`);
    console.log(`  سند #${e.number}: ${e.lines.length} قلم | شرح: ${e.description} | تاریخ: ${e.date.toISOString().slice(0, 10)}`);
    for (const l of e.lines) {
      console.log(`    ${l.account.code} ${l.account.name} → بده ${Number(l.debit).toLocaleString("en-US")} / بستان ${Number(l.credit).toLocaleString("en-US")}`);
    }
  }
  // سند بانک: ۱٬۷۲۱٬۲۲۰٬۰۰۰ ریال بدهکار (= ۱۷۲٫۱۲۲م تومان × ۱۰)
  const bankEntry = entries.find((e) =>
    e.lines.some((l) => l.account.name === "بانک ملت" && Number(l.debit) === 910000000)
  );
  assert(Boolean(bankEntry), "سند بانک (خط بانک ملت بدهکار واریزها) ساخته شد");
  assert(bankEntry!.description.includes("اسناد ایمپورت تست"), "شرح پیش‌فرض روی سند اعمال شد");
  const bankDr = bankEntry!.lines.reduce((s, l) => s + Number(l.debit), 0);
  assert(bankDr === 1721220000, `سند بانک جمعش ۱٬۷۲۱٬۲۲۰٬۰۰۰ ریال (got ${bankDr})`);
  const bankAccLine = bankEntry!.lines.find((l) => l.account.name === "بانک ملت");
  assert(Boolean(bankAccLine), "خط حساب بانک ملت موجود است");
  assert(Number(bankAccLine!.debit) === 910000000, "بانک ملت بدهکار ۹۱۰م ریال (واریزها)");
  assert(Number(bankAccLine!.credit) === 811220000, "بانک ملت بستانکار ۸۱۱٫۲۲م ریال (برداشت‌ها)");

  // تاریخ سند بانک = شایع‌ترین تاریخ ردیف‌ها — هر ردیف یکتاست؛ اولین ۱۴۰۳/۰۵/۰۱ → 2024-07-22
  assert(bankEntry!.date.getUTCFullYear() === 2024, `سال سند بانک میلادی 2024 (got ${bankEntry!.date.toISOString()})`);

  // ---------- ۶) پاک‌سازی ----------
  await prisma.journalEntry.deleteMany({ where: { tenantId } });
  await prisma.documentSequence.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.accountGroup.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.fiscalYear.deleteMany({ where: { tenantId } });
  await prisma.license.deleteMany({ where: { tenantId } });
  await prisma.userSession.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  // RegistrationGuard ضدتقلب — ردیف این IP را هم پاک کن تا تست‌های بعدی آزاد باشند
  await prisma.registrationGuard.deleteMany({ where: { ip: "127.0.0.1" } }).catch(() => {});

  const leftovers = await prisma.journalEntry.count({ where: { tenantId } });
  assert(leftovers === 0, "پاک‌سازی کامل — هیچ سندی نماند");
  console.log("\n✅✅✅ همهٔ تست‌های E2E سند هوشمند پاس شدند و داده‌های تست پاک شدند");
}

main()
  .catch((err) => {
    console.error("❌ QA FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
