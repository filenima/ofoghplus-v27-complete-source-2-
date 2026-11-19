// ============================================================================
// scripts/rebrand-ofoghplus.ts — به‌روزرسانی برندینگ DB به «افق پلاس» (R14-A)
// ----------------------------------------------------------------------------
// REBRAND(R14-A): برند محصول «هوش» → «افق پلاس» (OfoghPlus) + دامنهٔ canonical
// جدید ofoghplus.ir (دامنهٔ قدیمی hoosh.nobatime.ir همچنان سرو می‌شود — دودامنه).
//
// نکتهٔ مهم: برندینگ در جدول SystemSettings با کلیدهای پیشونددار جداگانه ذخیره
// می‌شود (نه یک کلید JSON واحد) — مطابق خواندنِ getBrandingSettings:
//   branding_app_name / branding_site_name / branding_primary_color /
//   branding_logo_url / branding_footer_text / branding_domain
//
// این اسکریپت هر شش کلید را upsert می‌کند؛ قبل/بعد را چاپ می‌کند و
// Idempotent است (اجرای چندباره نتیجهٔ یکسان می‌دهد).
//
// اجرا:
//   DATABASE_URL="file:/home/z/my-project/hooshhesab/db/custom.db" \
//     bun run scripts/rebrand-ofoghplus.ts
//
// توجه: سرورِ در حال اجرا کش درون‌حافظه‌ای ۵ دقیقه‌ای دارد؛ پس از این اسکریپت
// یا ۵ دقیقه صبر کنید یا از پنل سوپرادمین (ذخیرهٔ برندینگ) کش را باطل کنید —
// یا PATCH /api/platform/settings/branding را با همین مقادیر صدا بزنید.
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCED_DB_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
if (
  !process.env.DATABASE_URL ||
  !process.env.DATABASE_URL.includes("hooshhesab")
) {
  process.env.DATABASE_URL = FORCED_DB_URL;
}

const prisma = new PrismaClient({ log: ["error", "warn"] });

// مقادیر برند جدید (R14-A) — هم‌راستا با DEFAULT_BRANDING در lib/system-settings.ts
const NEW_BRANDING = {
  branding_app_name: "افق پلاس",
  branding_site_name: "افق پلاس | نرم‌افزار حسابداری هوشمند",
  branding_primary_color: "#10b981",
  branding_logo_url: "",
  branding_footer_text: "",
  branding_domain: "ofoghplus.ir",
} as const;

const KEYS = Object.keys(NEW_BRANDING) as Array<keyof typeof NEW_BRANDING>;

async function main() {
  console.log("=".repeat(64));
  console.log("REBRAND(R14-A) — هوش → افق پلاس (OfoghPlus)");
  console.log(`DB: ${process.env.DATABASE_URL}`);
  console.log("=".repeat(64));

  // ─── BEFORE ───
  const before = await prisma.systemSettings.findMany({
    where: { key: { in: KEYS } },
  });
  const beforeMap = new Map(before.map((r) => [r.key, r.value]));
  console.log("\n— BEFORE —");
  for (const k of KEYS) {
    console.log(`  ${k} = ${JSON.stringify(beforeMap.get(k) ?? "(تنظیم‌نشده)")}`);
  }

  // ─── UPSERT ───
  for (const k of KEYS) {
    await prisma.systemSettings.upsert({
      where: { key: k },
      update: { value: NEW_BRANDING[k] },
      create: { key: k, value: NEW_BRANDING[k] },
    });
  }

  // ─── AFTER (خواندن مجدد از DB) ───
  const after = await prisma.systemSettings.findMany({
    where: { key: { in: KEYS } },
  });
  const afterMap = new Map(after.map((r) => [r.key, r.value]));
  console.log("\n— AFTER —");
  for (const k of KEYS) {
    console.log(`  ${k} = ${JSON.stringify(afterMap.get(k) ?? "(؟!)")}`);
  }

  // ─── VERIFY ───
  const allMatch = KEYS.every((k) => afterMap.get(k) === NEW_BRANDING[k]);
  console.log(
    `\nنتیجه: ${allMatch ? "✓ برندینگ DB با موفقیت «افق پلاس» شد" : "✗ ناهمخوانی!"}`
  );

  // شمارش رکوردهای برندینگ قدیمیِ احتمالی (باید ۱ از هر کلید باشد)
  const dupCheck = await prisma.systemSettings.groupBy({
    by: ["key"],
    where: { key: { in: KEYS } },
    _count: { _all: true },
  });
  const dups = dupCheck.filter((g) => g._count._all > 1);
  if (dups.length > 0) {
    console.warn("⚠ کلیدهای تکراری:", dups.map((d) => d.key).join(", "));
  }

  if (!allMatch) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("خطا در اجرای اسکریپت rebrand:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
