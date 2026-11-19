import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const S = (v: any) => JSON.stringify(v, (k, x) => typeof x === "bigint" ? Number(x) : x);
async function main() {
  const g = await db.$queryRawUnsafe<any>("SELECT status, COUNT(*) as c FROM BlogPost GROUP BY status");
  console.log("BLOG_STATUS:", S(g));
  const drafts = await db.$queryRawUnsafe<any>("SELECT title, status, slug FROM BlogPost WHERE status NOT IN ('PUBLISHED') ORDER BY createdAt DESC LIMIT 200");
  console.log("NOT_PUBLISHED_COUNT:", drafts.length);
  drafts.forEach((d: any) => console.log("  DRAFT:", d.status, "—", d.title));
  const tbl = await db.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const counts: string[] = [];
  for (const t of tbl) {
    try {
      const r = await db.$queryRawUnsafe<any>(`SELECT COUNT(*) as c FROM "${t.name}"`);
      if (Number(r[0].c) > 0) counts.push(`${t.name}=${r[0].c}`);
    } catch {}
  }
  console.log("TABLE_COUNTS:", counts.join(", "));
  await db.$disconnect();
}
main();
