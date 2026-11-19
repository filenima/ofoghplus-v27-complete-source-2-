// 1-e test: simulate the deployment scenarios for lib/db-selfcheck
import { ensureDatabaseUrl } from "../../lib/db-selfcheck";

async function scenario(name: string, url: string | undefined) {
  const prev = process.env.DATABASE_URL;
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
  const res = await ensureDatabaseUrl();
  console.log(`\n=== ${name} ===`);
  console.log(`  env was: ${res.originalUrl}`);
  console.log(`  originalCount: ${res.originalCount} | projectCount: ${res.projectCount}`);
  console.log(`  ok: ${res.ok} | fixed: ${res.fixed} | final: ${res.finalUrl}`);
  console.log(`  reason: ${res.reason}`);
  if (prev === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = prev;
}

async function main() {
  // ۱) سناریوی سالمِ سندباکس: مسیر مطلق درست
  await scenario("healthy absolute (sandbox)", "file:/home/z/my-project/db/custom.db");
  // ۲) سناریوی استقرار خراب: مسیر مطلق ماشین قبلی که اینجا نیست
  await scenario("stale absolute (deploy)", "file:/srv/old-machine/db/custom.db");
  // ۳) سناریوی بستهٔ قبلی: مسیر نسبی غلط file:../db/custom.db
  await scenario("old packaged relative ../db", "file:../db/custom.db");
  // ۴) مسیر نسبی درستِ جدید: file:db/custom.db (runtime Prisma بازش نمی‌کند)
  await scenario("new packaged relative db/", "file:db/custom.db");
  // ۵) postgres — هرگز دست نمی‌خورد
  await scenario("postgres untouched", "postgresql://user:pass@localhost:5432/db");
}
main();
