// ============================================================
// scripts/seo/check-internal-links.ts — اسکن لینک‌های داخلی شکسته (R24-7 / Agent 5)
// ------------------------------------------------------------
// همهٔ الگوهای href="/..." (و Link href) در app/ و components/ را جمع
// می‌کند و با روت‌های واقعی app/ + فایل‌های public/ تطبیق می‌دهد.
//
// اجرا: bun scripts/seo/check-internal-links.ts
// خروجی: فهرست لینک‌های داخلی که به روت/فایل موجود اشاره نمی‌کنند.
// ============================================================

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, relative } from "path";

const ROOT = join(process.cwd());
const APP = join(ROOT, "app");
const PUBLIC = join(ROOT, "public");

// ---------- ۱) جمع‌آوری روت‌های اپ (page.tsx / route.ts) ----------
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const allAppFiles = walk(APP);
const staticRoutes = new Set<string>();
const dynamicRoutes: { segments: string[] }[] = [];

for (const f of allAppFiles) {
  const rel = relative(APP, f).split("\\").join("/");
  if (rel === "layout.tsx" || rel === "error.tsx" || rel === "not-found.tsx" || rel === "loading.tsx" || rel === "template.tsx" || rel === "page.original.tsx") continue;
  const m = rel.match(/^(.*\/)?(page|route)\.tsx?$/);
  if (!m) continue;
  const dirPart = m[1] ? m[1].replace(/\/$/, "") : "";
  const segs = dirPart ? dirPart.split("/") : [];
  if (segs.some((s) => s.startsWith("(") && s.endsWith(")"))) continue; // route groups → مسیر واقعی ندارد
  let path = "/" + segs
    .map((s) => (s.startsWith("[") && s.endsWith("]") ? "*" : s))
    .join("/");
  path = path.replace(/\/+/g, "/");
  if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "") path = "/";
  if (path.includes("*")) {
    dynamicRoutes.push({ segments: path.split("/") });
  } else {
    staticRoutes.add(path);
  }
}

// فایل‌های public و روت‌های ماشینی شناخته‌شده
const specialPaths = new Set<string>([
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/rss.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/logo.png",
  "/logo.svg",
  "/og-image.png",
  "/apple-touch-icon.png",
  "/icon-32.svg",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/favicon.ico",
  "/sw.js",
  "/offline.html",
]);

function publicFileExists(urlPath: string): boolean {
  const clean = urlPath.split("?")[0].split("#")[0];
  if (clean === "/" || clean === "") return true;
  return existsSync(join(PUBLIC, clean.replace(/^\//, "")));
}

// ---------- ۲) تطبیق URL با روت‌ها ----------
function routeMatches(url: string): boolean {
  const clean = url.split("?")[0].split("#")[0];
  if (clean === "" || clean === "/") return true;
  if (specialPaths.has(clean)) return true;
  if (publicFileExists(clean)) return true;
  if (clean.startsWith("/api/")) return true; // API روت‌ها را جداگانه بررسی می‌کنیم (خیلی زیادند)
  if (staticRoutes.has(clean)) return true;
  const parts = clean.split("/").filter(Boolean);
  for (const dr of dynamicRoutes) {
    const segs = dr.segments.filter(Boolean);
    if (segs.length !== parts.length && !segs.includes("*")) continue;
    let ok = true;
    for (let i = 0; i < Math.min(segs.length, parts.length); i++) {
      if (segs[i] === "*") continue;
      if (segs[i] !== parts[i]) { ok = false; break; }
    }
    if (ok && segs.length === parts.length) return true;
    // catch-all آخرین بخش *
    if (ok && segs.length > 0 && segs[segs.length - 1] === "*" && parts.length >= segs.length - 1) return true;
  }
  return false;
}

// ---------- ۳) جمع‌آوری href از سورس ----------
const SRC_DIRS = [join(ROOT, "app"), join(ROOT, "components"), join(ROOT, "lib")];
const HREF_RE = /(?:href|to)=["']([^"']+)["']/g;
const seen = new Map<string, Set<string>>(); // url → فایل‌ها

for (const dir of SRC_DIRS) {
  for (const f of walk(dir)) {
    if (!/\.(tsx?|jsx?|mjs)$/.test(f)) continue;
    if (f.includes(join("app", "api")) || f.includes("node_modules")) continue;
    const rel = relative(ROOT, f);
    const src = readFileSync(f, "utf8");
    let m: RegExpExecArray | null;
    HREF_RE.lastIndex = 0;
    while ((m = HREF_RE.exec(src)) !== null) {
      const url = m[1].trim();
      if (!url.startsWith("/")) continue;
      if (url.startsWith("/api/") || url.startsWith("/uploads/") || url.startsWith("/banners/")) {
        if (!url.includes("..")) continue; // مسیرهای سرویس/فایل — معتبر
      }
      if (url.startsWith("http") || url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("data:")) continue;
      if (!seen.has(url)) seen.set(url, new Set());
      seen.get(url)!.add(rel);
    }
  }
}

// ---------- ۴) گزارش ----------
const broken: Array<{ url: string; files: string[] }> = [];
for (const [url, files] of [...seen.entries()].sort()) {
  if (!routeMatches(url)) broken.push({ url, files: [...files].sort() });
}

if (broken.length === 0) {
  console.log("✅ هیچ لینک داخلی شکسته‌ای پیدا نشد.");
} else {
  console.log(`⛔ ${broken.length} لینک داخلی شکسته:\n`);
  for (const b of broken) {
    console.log(`  ${b.url}`);
    for (const f of b.files.slice(0, 4)) console.log(`      -> ${f}${b.files.length > 4 ? ` (+${b.files.length - 4} فایل دیگر)` : ""}`);
  }
}
console.log(`\n[scan] روت‌های استاتیک: ${staticRoutes.size} · داینامیک: ${dynamicRoutes.length} · URL بررسی‌شده: ${seen.size}`);
