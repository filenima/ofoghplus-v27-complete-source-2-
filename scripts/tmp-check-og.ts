import { db } from "../lib/db";
async function main() {
  const rows = await db.systemSettings.findMany();
  rows.filter((r: any) => /og|seo|brand/i.test(r.key)).forEach((r: any) => console.log(r.key, "=", String(r.value).slice(0, 150)));
}
main().finally(() => db.$disconnect());
