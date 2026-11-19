// 1-e diag: mint a superadmin token with the dev secret + dump BlogPost counts
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function signToken(payload: Record<string, unknown>): string {
  const secret = process.env.JWT_SECRET || "dev-only-ephemeral-secret-change-me";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

async function main() {
  const admins = await db.superAdmin.findMany({ select: { id: true, username: true, isActive: true } });
  console.log("SuperAdmins:", JSON.stringify(admins, null, 1));

  const groups = await db.blogPost.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("BlogPost status groups:", JSON.stringify(groups));

  const scheduled = await db.blogPost.count({
    where: { status: "DRAFT", scheduledPublishAt: { not: null } },
  });
  console.log("Drafts WITH scheduledPublishAt:", scheduled);
  const draftNoSchedule = await db.blogPost.count({
    where: { status: "DRAFT", scheduledPublishAt: null },
  });
  console.log("Drafts WITHOUT scheduledPublishAt:", draftNoSchedule);

  const sample = await db.blogPost.findFirst({
    where: { status: "DRAFT", scheduledPublishAt: { not: null } },
    select: { id: true, title: true, scheduledPublishAt: true, coverImage: true, slug: true },
  });
  console.log("Sample scheduled draft:", JSON.stringify(sample, null, 1));

  if (admins.length > 0) {
    const token = signToken({ id: admins[0].id, type: "superadmin" });
    console.log("TOKEN=" + token);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
