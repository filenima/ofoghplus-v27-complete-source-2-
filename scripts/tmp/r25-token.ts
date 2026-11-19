import { db } from "@/lib/db";
import crypto from "crypto";
async function main() {
  const user = await db.user.findUnique({ where: { username: "demo" } });
  if (!user) { console.log("no user"); return; }
  const secret = process.env.JWT_SECRET || "dev-only-ephemeral-secret-change-me";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ type: "user", id: user.id, tenantId: user.tenantId, role: user.role, iat: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  const token = `${header}.${body}.${sig}`;
  await db.userSession.create({ data: { userId: user.id, token, deviceFingerprint: "r25-test", deviceName: "تست راند ۲۵", ipAddress: "127.0.0.1", expiresAt: new Date(Date.now() + 24*3600*1000), isActive: true, lastUsedAt: new Date() } });
  console.log(token);
}
main().catch(e => { console.error(String(e).slice(0,500)); process.exit(1); });
