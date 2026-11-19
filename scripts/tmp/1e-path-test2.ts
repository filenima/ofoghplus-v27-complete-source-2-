import { PrismaClient } from "@prisma/client";
async function main() {
  for (const url of ["file:db/custom.db", "file:prisma/db/custom.db"]) {
    try {
      const prisma = new PrismaClient({ datasourceUrl: url });
      const n = await prisma.blogPost.count();
      console.log(url, "→ count:", n);
      await prisma.$disconnect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(url, "→ ERROR:", msg.split("\n").slice(-4).join(" | ").slice(0, 300));
    }
  }
}
main();
