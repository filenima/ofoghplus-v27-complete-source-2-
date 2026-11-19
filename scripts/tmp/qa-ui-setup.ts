import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/hooshhesab/db/custom.db" } } });
async function main() {
  const stamp = Date.now().toString(36);
  const email = `qa-smartui-${stamp}@hoosh.local`;
  const res = await fetch("http://localhost:3000/api/trial/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `Qa!${stamp}Aa9`, name: "تست UI سند هوشمند", companyName: `شرکت تست UI ${stamp}` }),
  });
  const j = (await res.json()) as { success: boolean; token?: string; tenant?: { id: string }; error?: string };
  if (!j.success || !j.token || !j.tenant) throw new Error(`setup failed: ${j.error}`);
  const tenantId = j.tenant.id;
  const groups = await Promise.all([
    prisma.accountGroup.create({ data: { tenantId, code: "1", name: "دارایی‌ها", type: "BALANCE_SHEET", nature: "DEBIT", order: 1 } }),
    prisma.accountGroup.create({ data: { tenantId, code: "5", name: "هزینه‌ها", type: "PROFIT_LOSS", nature: "DEBIT", order: 5 } }),
  ]);
  const g1 = groups[0], g5 = groups[1];
  await prisma.account.createMany({
    data: [
      { tenantId, code: "1101", name: "صندوق", groupId: g1.id, nature: "DEBIT", balanceType: "GENERAL" },
      { tenantId, code: "1102", name: "بانک ملت", groupId: g1.id, nature: "DEBIT", balanceType: "GENERAL" },
      { tenantId, code: "5101", name: "حقوق و دستمزد", groupId: g5.id, nature: "DEBIT", balanceType: "GENERAL" },
      { tenantId, code: "5199", name: "سایر حساب‌ها (موقت)", groupId: g5.id, nature: "DEBIT", balanceType: "GENERAL" },
    ],
  });
  // فایل تست اکسل برای آپلود UI
  const XLSX = await import("xlsx");
  const rows: Array<Array<string | number>> = [
    ["تاریخ", "شرح تراکنش", "بدهکار", "بستانکار", "مانده", "شماره پیگیری"],
    ["1403/05/01", "واریز مشتری — فروش کالا", "", 25000000, 125000000, "880001"],
    ["1403/05/02", "کارمزد انتقال", 12000, "", 124988000, "880002"],
    ["1403/05/03", "پرداخت حقوق و دستمزد", 6200000, "", 118788000, "880003"],
    ["1403/05/04", "واریز فروش نقدی", "", 4300000, 123088000, "880004"],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await (await import("fs")).promises.writeFile("/tmp/smart-doc-test.xlsx", buf);
  console.log(JSON.stringify({ token: j.token, tenantId, email }));
}
main().finally(() => prisma.$disconnect());
