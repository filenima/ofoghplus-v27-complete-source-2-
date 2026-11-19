// Inserts "extra" supplementary paragraphs before the FAQ of articles that
// need a higher word-count margin (appended right after the main additions).
import fs from "fs";
import path from "path";

const ADD_DIR = path.join(__dirname, "additions");
const CONTENT_DIR = path.join(__dirname, "..", "lib", "blog-content");

const jobs = [
  { file: "batch5.ts", slug: "tax-audit-defense-guide", addition: "tax-audit-extra.txt" },
  { file: "batch5.ts", slug: "performance-tax-return-guide", addition: "performance-extra.txt" },
  { file: "batch5.ts", slug: "acceptable-business-expenses-1405", addition: "expenses-extra.txt" },
  { file: "batch5.ts", slug: "e-invoice-rejection-reasons", addition: "e-invoice-extra.txt" },
  { file: "batch6.ts", slug: "gas-station-fuel-accounting", addition: "gas-station-extra.txt" },
];

const FAQ = "<h2>سؤالات متداول</h2>";

for (const job of jobs) {
  const filePath = path.join(CONTENT_DIR, job.file);
  let src = fs.readFileSync(filePath, "utf8");

  const slugIdx = src.indexOf(`slug: "${job.slug}"`);
  if (slugIdx === -1) throw new Error(`slug not found: ${job.slug}`);
  const contentStart = src.indexOf("content: `", slugIdx);
  const contentEnd = src.indexOf("`", contentStart + 10);

  let faqIdx = -1;
  for (let i = contentStart; i < contentEnd; i++) {
    if (src.startsWith(FAQ, i)) { faqIdx = i; break; }
  }
  if (faqIdx === -1) throw new Error(`FAQ heading not found in ${job.slug}`);

  const addition = fs.readFileSync(path.join(ADD_DIR, job.addition), "utf8").trim();
  if (src.includes(addition.slice(0, 80))) {
    console.log(`SKIP (already inserted): ${job.addition}`);
    continue;
  }

  if (addition.includes("`") || addition.includes("${")) {
    throw new Error(`addition contains backtick or template syntax: ${job.addition}`);
  }
  const visibleText = addition.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (/[0-9]/.test(visibleText)) {
    throw new Error(`addition contains English digits in text: ${job.addition}`);
  }
  if (/[\u4e00-\u9fff]/.test(addition)) {
    throw new Error(`addition contains Chinese characters: ${job.addition}`);
  }

  const insertion = addition + "\n\n";
  src = src.slice(0, faqIdx) + insertion + src.slice(faqIdx);
  fs.writeFileSync(filePath, src, "utf8");
  console.log(`INSERTED ${job.addition} -> ${job.file} (${job.slug})`);
}
console.log("Done.");
