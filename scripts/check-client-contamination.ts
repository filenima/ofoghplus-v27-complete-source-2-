// scripts/check-client-contamination.ts
// یافتن همهٔ مسیرهای گراف کلاینت که به lib/db می‌رسند (باندل مرورگر آلوده)
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project";
const DANGEROUS = ["lib/db.ts", "lib/plans.ts", "lib/system-settings.ts", "lib/seo.ts"];

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "skills", "upload", "download", "backups", "agent-ctx", "tool-results"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = walk(path.join(ROOT, "app")).concat(walk(path.join(ROOT, "components")), walk(path.join(ROOT, "hooks")), walk(path.join(ROOT, "lib")));

// build import graph: file -> imported files (resolved)
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.join(path.dirname(from), spec);
  else return null; // package
  for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const importers: Map<string, Set<string>> = new Map(); // file -> set of importers
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const re = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2] || m[3];
    const target = resolveImport(f, spec);
    if (target) {
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target)!.add(f);
    }
  }
}

// client entries: files with "use client" at top
const clientEntries = files.filter((f) => {
  const src = fs.readFileSync(f, "utf8");
  return /^\s*(["'])use client\1/.test(src.slice(0, 400));
});

// BFS from client entries forward (what do they reach)
function reachableFrom(entry: string): Map<string, string[]> {
  // returns file -> path (one shortest path) reachable from entry
  const visited = new Map<string, string[]>();
  const q: [string, string[]][] = [[entry, [entry]]];
  while (q.length) {
    const [f, p] = q.shift()!;
    if (visited.has(f)) continue;
    visited.set(f, p);
    const src = fs.readFileSync(f, "utf8");
    const re = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const spec = m[1] || m[2] || m[3];
      const t = resolveImport(f, spec);
      if (t && !visited.has(t)) q.push([t, [...p, t]]);
    }
  }
  return visited;
}

const dangerAbs = new Set(DANGEROUS.map((d) => path.join(ROOT, d)));
let found = 0;
for (const entry of clientEntries) {
  const reach = reachableFrom(entry);
  for (const [f, p] of reach) {
    if (dangerAbs.has(f)) {
      found++;
      const rel = (x: string) => path.relative(ROOT, x);
      console.log(`\n[!] ${rel(entry)} reaches ${rel(f)}:`);
      console.log("    " + p.map(rel).join("\n    → "));
      if (found > 25) { console.log("... (truncated)"); process.exit(0); }
    }
  }
}
console.log(found === 0 ? "\nCLEAN: هیچ مسیر کلاینتی به ماژول‌های سروری نمی‌رسد ✓" : `\nTOTAL: ${found} contamination paths`);
