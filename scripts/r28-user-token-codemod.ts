// Codemod R28-4 — migrate raw verifyToken user checks to session-aware verifyUserSession
// SAFE: only rewrites call sites whose immediate next check gates on type === "user".
// Superadmin/portal call sites in the same file are left untouched.
// Usage: bun scripts/r28-user-token-codemod.ts [--dry]
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const DRY = process.argv.includes("--dry");

const files = execSync(`grep -rln 'verifyToken' app/api --include=route.ts`, {
  cwd: "/home/z/my-project",
})
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);

let migrated = 0;
const skipped: string[] = [];
const details: string[] = [];

// Pattern 1: const X = verifyToken(ARG); ... if (!X || X.type!== "user")
const CALL_AND_CHECK =
  /(=\s*)verifyToken\(([^;]+?)\)(;)(\s*(?:\/\/[^\n]*\n\s*)?)if\s*\(\s*!(\w+)\s*\|\|\s*\5\.type\s*!==\s*["']user["']\s*\)/g;

// Pattern 2: const X = verifyToken(ARG); ... if (X?.type !== "user" || !X)
const CALL_AND_CHECK2 =
  /(=\s*)verifyToken\(([^;]+?)\)(;)(\s*(?:\/\/[^\n]*\n\s*)?)if\s*\(\s*(\w+)\??\.type\s*!==\s*["']user["']\s*\|\|\s*!\5\s*\)/g;

for (const rel of files) {
  const path = `/home/z/my-project/${rel}`;
  let src = readFileSync(path, "utf8");

  if (!/type\s*[!=]==?\s*["']user["']/.test(src)) {
    skipped.push(rel + " (no user-type gate)");
    continue;
  }
  if (src.includes("verifyUserSession")) {
    skipped.push(rel + " (already migrated)");
    continue;
  }
  if (/requireUser|getAuthContext|requireTenant|requireAuth\b/.test(src)) {
    skipped.push(rel + " (uses session-aware helper)");
    continue;
  }

  const before = src;
  let count = 0;

  src = src.replace(CALL_AND_CHECK, (_m, eq, arg, semi, gap, varName) => {
    count++;
    return `${eq}await verifyUserSession(${arg})${semi}${gap}if (!${varName})`;
  });
  src = src.replace(CALL_AND_CHECK2, (_m, eq, arg, semi, gap, varName) => {
    count++;
    return `${eq}await verifyUserSession(${arg})${semi}${gap}if (!${varName})`;
  });

  if (count > 0) {
    // Add import after the platform-auth import line (or after first import)
    if (!src.includes('from "@/lib/user-token"')) {
      if (/import\s*\{[^}]*verifyToken[^}]*\}\s*from\s*["']@\/lib\/platform-auth["'];?\n/.test(src)) {
        src = src.replace(
          /(import\s*\{[^}]*\}\s*from\s*["']@\/lib\/platform-auth["'];?\n)/,
          '$1import { verifyUserSession } from "@/lib/user-token";\n'
        );
      } else {
        src = src.replace(/^(import[^\n]*\n)/, '$1import { verifyUserSession } from "@/lib/user-token";\n');
      }
    }
    migrated++;
    details.push(`${rel} (${count} call sites)`);
    if (!DRY) writeFileSync(path, src);
  } else {
    skipped.push(rel + " (pattern not found — needs manual review)");
  }
}

console.log(`migrated files: ${migrated}`);
console.log(`skipped: ${skipped.length}`);
for (const s of skipped) console.log("  SKIP " + s);
for (const d of details) console.log("  DONE " + d);
