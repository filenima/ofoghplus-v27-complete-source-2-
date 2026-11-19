// ============================================================================
// scripts/tmp/qa-smart-doc-edge.ts — تست‌های لبهٔ «سند هوشمند» (Task R14-C)
// ----------------------------------------------------------------------------
// ۱) فایل دفتر کل نامتوازن (بدهکار ≠ بستانکار) → preview: balanced=false +
//    هشدار؛ commit: فایل رد می‌شود با دلیل فارسی
// ۲) override ستون‌ها (هدرهای غیرمستقیم: «روز»، «گردش»، «مبلغ نقدی»)
// ۳) تاریخ‌های خراب → هشدار + تاریخ امروز
// پاک‌سازی کامل در پایان.
// ============================================================================

import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const prisma = new PrismaClient({
  datasources: { db: { url: "file:/home/z/my-project/hooshhesab/db/custom.db" } },
});

async function main() {
  const stamp = Date.now().toString(36);
  const email = `qa-smartedge-${stamp}@hoosh.local`;

  const regRes = await fetch(`${BASE}/api/trial/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: `Qa!${stamp}Aa9`,
      name: "تست لبه سند هوشمند",
      companyName: `شرکت تست لبه ${stamp}`,
    }),
  });
  const reg = (await regRes.json()) as { success: boolean; token?: string; tenant?: { id: string }; error?: string };
  if (!reg.success || !reg.token || !reg.tenant) throw new Error(`trial/create failed: ${reg.error}`);
  const token = reg.token;
  const tenantId = reg.tenant.id;
  console.log(`✓ tenant لبه ساخته شد: ${tenantId}`);

  // کدینگ حداقلی
  const g = await prisma.accountGroup.create({
    data: { tenantId, code: "1", name: "دارایی‌ها", type: "BALANCE_SHEET", nature: "DEBIT", order: 1 },
  });
  await prisma.account.createMany({
    data: [
      { tenantId, code: "1101", name: "صندوق", groupId: g.id, nature: "DEBIT", balanceType: "GENERAL" },
      { tenantId, code: "4101", name: "درآمد فروش", groupId: g.id, nature: "CREDIT", balanceType: "GENERAL" },
    ],
  });

  // ---------- ۱) دفتر کل نامتوازن (بدهکار ۱۰۰ / بستانکار ۹۰) ----------
  const ledgerRows: Array<Array<string | number>> = [
    ["تاریخ سند", "شرح سند", "کد حساب", "بدهکار", "بستانکار"],
    ["1403/07/01", "فروش نقدی", "4101", 100000, 0],
    ["1403/07/01", "دریافت نقدی", "1101", 0, 90000], // ۱۰٫۰۰۰ کم — نامتوازن
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ledgerRows), "Ledger");
  const ledgerBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // ---------- ۲) فایل با هدرهای غیرمستقیم + تاریخ خراب ----------
  const weirdCsv = [
    "روز,گردش,مبلغ نقدی",
    "31/11/1403,فروش کالا,500000", // ۳۱ ماه ۱۱؟ معتبر جلالی است؛ ولی 32/13/1403 خراب است — بعدی
    "32/13/1403,فروش کالا,300000", // تاریخ کاملاً خراب → امروز + هشدار
    "1403/07/05,فروش کالا,200000",
  ].join("\n");

  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
    console.log(`✓ ${msg}`);
  };

  // ===== preview بدون override =====
  const f1 = new FormData();
  f1.append("mode", "preview");
  f1.append("options", JSON.stringify({}));
  f1.append("files", new Blob([new Uint8Array(ledgerBuf)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "دفتر-کل-نامتوازن.xlsx");
  f1.append("files", new Blob([weirdCsv], { type: "text/csv" }), "فروش-عجیب.csv");
  const p1 = (await (await fetch(`${BASE}/api/accounting/smart-doc`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f1,
  })).json()) as {
    success: boolean;
    files?: Array<{
      fileName: string; docType: string; balanced: boolean; warnings: string[];
      detectedColumns: Record<string, string>; rowCount: number; unmappedCount: number;
      totalDebitToman: number; totalCreditToman: number;
      sampleRows: Array<{ dateJalali: string; accountName: string | null }>;
    }>;
  };
  const ledger = p1.files?.find((f) => f.fileName.includes("نامتوازن"));
  const weird = p1.files?.find((f) => f.fileName.includes("عجیب"));
  assert(Boolean(ledger) && Boolean(weird), "هر دو فایل در preview آمده‌اند");
  assert(ledger!.docType === "ledger", `نوع دفتر = ledger (got ${ledger!.docType})`);
  assert(!ledger!.balanced, "دفتر نامتوازن شناسایی شد (balanced=false)");
  assert(ledger!.warnings.some((w) => w.includes("تراز نیست")), "هشدار «تراز نیست» موجود است");
  assert(ledger!.totalDebitToman === 100000 && ledger!.totalCreditToman === 90000, `جمع‌ها درست (۱۰۰k/۹۰k) — got ${ledger!.totalDebitToman}/${ledger!.totalCreditToman}`);
  assert(ledger!.detectedColumns.account === "کد حساب", "ستون حساب از هدر «کد حساب» تشخیص شد");
  // ستون صریح 4101 → درآمد فروش
  assert(ledger!.sampleRows.some((s) => s.accountName === "درآمد فروش"), "ردیف فروش به درآمد فروش نگاشت شد (حساب صریح)");

  assert(weird!.rowCount === 3, `۳ ردیف فایل عجیب (got ${weird!.rowCount})`);
  assert(weird!.warnings.some((w) => w.includes("تاریخ نامعتبر")), "هشدار تاریخ نامعتبر موجود است");
  // بدون ستون‌های شناخته‌شده → generic + fallback

  // ===== preview با columnOverrides: روز→date، مبلغ نقدی→amount =====
  const f2 = new FormData();
  f2.append("mode", "preview");
  f2.append(
    "options",
    JSON.stringify({
      files: {
        "فروش-عجیب.csv": {
          columnOverrides: { date: "روز", amount: "مبلغ نقدی", description: "گردش" },
        },
      },
    })
  );
  f2.append("files", new Blob([weirdCsv], { type: "text/csv" }), "فروش-عجیب.csv");
  const p2 = (await (await fetch(`${BASE}/api/accounting/smart-doc`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f2,
  })).json()) as {
    success: boolean;
    files?: Array<{ fileName: string; detectedColumns: Record<string, string>; rowCount: number; balanced: boolean; warnings: string[] }>;
  };
  const w2 = p2.files?.[0];
  assert(Boolean(w2), "preview با override برگشت");
  assert(w2!.detectedColumns.date === "روز", `override تاریخ اعمال شد (got ${w2!.detectedColumns.date})`);
  assert(w2!.detectedColumns.amount === "مبلغ نقدی", `override مبلغ اعمال شد (got ${w2!.detectedColumns.amount})`);
  assert(w2!.detectedColumns.description === "گردش", `override شرح اعمال شد (got ${w2!.detectedColumns.description})`);
  assert(!w2!.warnings.some((x) => x.includes("ستون تاریخ شناسایی نشد")), "هشدار «ستون تاریخ شناسایی نشد» رفع شد");

  // ===== commit: فایل نامتوازن رد، فایل عجیب (با override در options) ثبت =====
  const f3 = new FormData();
  f3.append("mode", "commit");
  f3.append(
    "options",
    JSON.stringify({
      files: {
        "فروش-عجیب.csv": { columnOverrides: { date: "روز", amount: "مبلغ نقدی", description: "گردش" } },
      },
    })
  );
  f3.append("files", new Blob([new Uint8Array(ledgerBuf)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "دفتر-کل-نامتوازن.xlsx");
  f3.append("files", new Blob([weirdCsv], { type: "text/csv" }), "فروش-عجیب.csv");
  const c1 = (await (await fetch(`${BASE}/api/accounting/smart-doc`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f3,
  })).json()) as {
    success: boolean;
    created?: Array<{ fileName: string; number: number }>;
    skipped?: Array<{ fileName: string; reason: string }>;
  };
  assert((c1.created ?? []).length === 1, `فقط فایل سالم ثبت شد (got ${(c1.created ?? []).length})`);
  assert((c1.skipped ?? []).some((s) => s.fileName.includes("نامتوازن") && s.reason.includes("تراز")), "فایل نامتوازن با دلیل «تراز نیست» رد شد");
  console.log(`  رد شده: ${c1.skipped?.map((s) => `${s.fileName} → ${s.reason}`).join(" | ")}`);

  const dbEntries = await prisma.journalEntry.findMany({ where: { tenantId }, include: { lines: true } });
  assert(dbEntries.length === 1, `۱ سند در DB (got ${dbEntries.length})`);
  const dr = dbEntries[0].lines.reduce((s, l) => s + Number(l.debit), 0);
  assert(dr === 10000000, `سند عجیب ۱٬۰۰۰٬۰۰۰ تومان × ۱۰ = ۱۰م ریال (got ${dr})`);

  // ---------- پاک‌سازی ----------
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
  await prisma.registrationGuard.deleteMany({ where: { lastIp: "127.0.0.1" } }).catch(() => {});
  console.log("\n✅✅✅ تست‌های لبه پاس شدند و پاک‌سازی کامل انجام شد");
}

main()
  .catch((err) => {
    console.error("❌ EDGE QA FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
