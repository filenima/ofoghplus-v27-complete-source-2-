// ============================================================================
// scripts/redistribute-queue.ts — بازچینش صف انتشار با بازهٔ ۱ روزه (R14-E)
// ----------------------------------------------------------------------------
// پس از تولید ۴۷ مقالهٔ جدید (R14-E)، صف ۲۶۲+ پیش‌نویس داشت که با بازهٔ ۲روزه
// تا آوریل ۲۰۲۸ کشیده می‌شد. این اسکریپت همهٔ نوبت‌ها را با بازهٔ ۱روزه از
// فردا ساعت ۰۹:۰۰ تهران بازچینش می‌کند (۹ ماه جریان محتوای روزانه).
//
// Idempotent: اجرای مجدد کل صف را دوباره از فردا می‌چیند — امن.
// اجرا:
//   bun scripts/redistribute-queue.ts
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس)
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCED_DB_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;

const db = new PrismaClient({
  datasources: { db: { url: FORCED_DB_URL } },
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** فردا ساعت ۰۹:۰۰ تهران (UTC+03:30 — بدون DST از ۱۴۰۱) */
function nextRunAt9amTehran(): Date {
  const now = new Date();
  // الان به وقت تهران
  const tehranOffsetMs = 3.5 * 60 * 60 * 1000;
  const nowTehran = new Date(now.getTime() + tehranOffsetMs);
  // فردای تهران
  const tomorrow = new Date(nowTehran);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(9, 0, 0, 0);
  // برگرداندن به UTC
  return new Date(tomorrow.getTime() - tehranOffsetMs);
}

async function main() {
  const drafts = await db.blogPost.findMany({
    where: { status: "DRAFT" },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, slug: true, createdAt: true },
  });
  console.log("پیش‌نویس‌های صف:", drafts.length);

  const base = nextRunAt9amTehran();
  let i = 0;
  for (const d of drafts) {
    const slot = new Date(base.getTime() + i * DAY_MS);
    await db.blogPost.updateMany({
      where: { id: d.id, status: "DRAFT" },
      data: { scheduledPublishAt: slot, scheduleOrder: i + 1 },
    });
    i++;
  }
  console.log("بازچینش انجام شد:", i, "مقاله از", base.toISOString());
  const last = new Date(base.getTime() + (i - 1) * DAY_MS);
  console.log("آخرین نوبت:", last.toISOString());
}

main()
  .catch((e) => {
    console.error("خطا:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
