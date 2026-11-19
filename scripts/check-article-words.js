// Word count checker for blog articles in batch files
import fs from "fs";
import path from "path";

const targets = [
  { file: "batch4.ts", slug: "treasury-management-guide" },
  { file: "batch4.ts", slug: "seasonality-cash-planning" },
  { file: "batch5.ts", slug: "tax-audit-defense-guide" },
  { file: "batch5.ts", slug: "performance-tax-return-guide" },
  { file: "batch5.ts", slug: "acceptable-business-expenses-1405" },
  { file: "batch5.ts", slug: "e-invoice-rejection-reasons" },
  { file: "batch6.ts", slug: "gas-station-fuel-accounting" },
];

function stripHtml(html) {
  return html
    .replace(/<img[^>]*>/g, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, " ")
    .replace(/&lt;/g, " ")
    .replace(/&gt;/g, " ");
}

function countWords(html) {
  const text = stripHtml(html);
  // Count Persian/Latin words (sequences of letters incl. ZWNJ)
  const matches = text.match(/[\p{L}\p{N}]+(?:[-'\u200c][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

function countNonNumericWords(html) {
  const text = stripHtml(html);
  const matches = text.match(/[\p{L}\p{N}]+(?:[-'\u200c][\p{L}\p{N}]+)*/gu) || [];
  return matches.filter((m) => !/^[\p{N}\u066C\u066B/٬,.]+$/u.test(m)).length;
}

for (const t of targets) {
  const p = path.join(__dirname, "..", "lib", "blog-content", t.file);
  const src = fs.readFileSync(p, "utf8");
  // find the article object by slug
  const slugIdx = src.indexOf(`slug: "${t.slug}"`);
  if (slugIdx === -1) { console.log(`${t.slug}: NOT FOUND`); continue; }
  const contentStart = src.indexOf("content: `", slugIdx);
  const contentEnd = src.indexOf("`", contentStart + 10);
  const content = src.slice(contentStart + 10, contentEnd);
  const wc = countWords(content);
  const wnn = countNonNumericWords(content);
  console.log(
    `${t.slug.padEnd(40)} ${String(wc).padStart(6)} words | ${String(wnn).padStart(6)} non-numeric | ` +
    (wc >= 3300 && wnn >= 3300 ? "OK" : `NEEDS MORE (target 3300+)`)
  );
}
