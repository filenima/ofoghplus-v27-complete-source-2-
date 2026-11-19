// Test: how does Prisma resolve a RELATIVE file: URL at runtime?
import { PrismaClient } from "@prisma/client";
async function count(label: string, url?: string) {
  try {
    const prisma = url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();
    const n = await prisma.blogPost.count();
    console.log(`${label} → BlogPost count: ${n}`);
    await prisma.$disconnect();
  } catch (e) {
    console.log(`${label} → ERROR:`, e instanceof Error ? e.message.slice(0, 120) : e);
  }
}
async function main() {
  // 1) default client (uses process.env.DATABASE_URL from .env → absolute sandbox path)
  await count("env(.env absolute)");
  // 2) explicit relative "file:db/custom.db" (cwd = project root)
  await count("explicit file:db/custom.db", "file:db/custom.db");
  // 3) explicit relative "file:prisma/db/custom.db" (skeleton)
  await count("explicit file:prisma/db/custom.db", "file:prisma/db/custom.db");
}
main();
