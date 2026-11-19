import { PrismaClient } from "@prisma/client";
async function main() {
  try {
    const p = new PrismaClient({ datasourceUrl: "file:/home/z/my-project/prisma/db/custom.db" });
    const n = await p.blogPost.count();
    console.log("prisma/db/custom.db (skeleton) BlogPost count:", n);
    await p.$disconnect();
  } catch (e) {
    console.log("skeleton probe ERROR:", e instanceof Error ? e.message.split("\n").slice(-2).join(" | ") : e);
  }
}
main();
