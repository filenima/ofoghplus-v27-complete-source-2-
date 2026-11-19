/**
 * scripts/build-og-image.ts — ساخت تصویر OG سینمایی «افق پلاس» (1200×630)
 * ============================================================================
 * ورودی:  assets/og-src/og-bg.png   (پس‌زمینهٔ سینمایی — قابل تعویض)
 * خروجی:  public/og-ofoghplus.png  (نام جدید — R25: کش تلگرام با نام فایل می‌سازد؛
 *          کوئری‌استرینگ ?v= را نادیده می‌گیرد، پس نام فایل عوض شد)
 *          + بازنویسی public/og-image.png (مسیر قدیمی برای لینک‌های قبلی)
 *
 * متن‌ها از آرگومان‌های CLI هم قابل override هستند تا ادمین/اسکریپت
 * بتواند نسخه‌های مختلف بسازد:
 *   bun scripts/build-og-image.ts --title "..." --subtitle "..." --cta "..."
 *
 * فونت: assets/og-fonts/Vazirmatn-*.ttf (رندر متن فارسی با sharp/SVG)
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();
const BG = path.join(ROOT, "assets/og-src/og-bg.png");
const OUT = path.join(ROOT, "public/og-ofoghplus.png");
const OUT_LEGACY = path.join(ROOT, "public/og-image.png");
const FONT_BOLD = fs.readFileSync(path.join(ROOT, "assets/og-fonts/Vazirmatn-Bold.ttf")).toString("base64");
const FONT_REG = fs.readFileSync(path.join(ROOT, "assets/og-fonts/Vazirmatn-Regular.ttf")).toString("base64");

// ---- پارامترهای CLI ----
const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const W = 1200, H = 630;

async function main() {
  if (!fs.existsSync(BG)) {
    console.error("MISSING BG:", BG);
    process.exit(1);
  }

  const title = arg("title", "افق پلاس");
  const kicker = arg("kicker", "نرم‌افزار حسابداری ابری");
  const subtitle = arg(
    "subtitle",
    "حسابداری، انبار، فاکتور رسمی مودیان و فروشگاه آنلاین"
  );
  const subtitle2 = arg("subtitle2", "همهٔ کسب‌وکار شما در یک پلتفرم ایرانیِ ابری");
  const cta = arg("cta", "۷ روز رایگان · ofoghplus.ir");
  const ctaNote = arg("ctaNote", "بدون نیاز به کارت بانکی — راه‌اندازی در ۲ دقیقه");
  const chips = arg("chips", "گزارش خرید و فروش|چک‌ها|سامانهٔ مودیان|درون‌ریزی اکسل|فروشگاه آنلاین").split("|");

  // 1) پس‌زمینه: cover به 1200×630 + کمی بلور ملایم ناحیهٔ متن (RTL — سمت راست)
  const bgResized = await sharp(BG).resize(W, H, { fit: "cover", position: "centre" }).toBuffer();

  // گرادیان تیره از راست (متن فارسی راست‌چین است) + پایین
  const gradientSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gRight" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#020617" stop-opacity="0.05"/>
        <stop offset="45%" stop-color="#020617" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#020617" stop-opacity="0.92"/>
      </linearGradient>
      <linearGradient id="gBottom" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="60%" stop-color="#020617" stop-opacity="0"/>
        <stop offset="100%" stop-color="#020617" stop-opacity="0.65"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#gRight)"/>
    <rect width="${W}" height="${H}" fill="url(#gBottom)"/>
  </svg>`;

  // 2) لایهٔ متن فارسی (RTL) — SVG با فونت embedded
  // چیپ‌ها با عرض متغیر (متن‌ها طول متفاوت دارند) — از راست به چپ
  const chipH = 46, chipFont = 18, chipGap = 12, chipY = 540;
  let cursorX = 1188; // لبهٔ راست
  const chipEls = chips
    .map((c) => {
      const w = Math.round(c.length * (chipFont * 0.52)) + 40;
      const x2 = cursorX;
      const x1 = x2 - w;
      cursorX = x1 - chipGap;
      return `<g><rect x="${x1}" y="${chipY}" width="${w}" height="${chipH}" rx="23" fill="#10b981" fill-opacity="0.15" stroke="#34d399" stroke-opacity="0.45" stroke-width="1"/>
      <text x="${(x1 + x2) / 2}" y="${chipY + 30}" font-family="Vazirmatn" font-size="${chipFont}" font-weight="400" fill="#a7f3d0" text-anchor="middle" direction="rtl">${esc(c)}</text></g>`;
    })
    .join("");

  // ---- اندازه‌گیری دقیق عرض متن (ink bbox) — با رندر جداگانه + trim ----
  // چرا: تخمین طول فارسی خطاپذیر است و باعث بریدگی می‌شود؛ trim بکساید sharp
  // عرض واقعی جوهر را می‌دهد و متن middle-anchor دقیقاً جایگذاری می‌شود.
  async function measureText(text: string, fs: number, weight: 400 | 700): Promise<number> {
    const pad = Math.ceil(fs * 1.2);
    const cw = Math.ceil(text.length * fs * 1.4) + pad * 2; // بوم سخاو‌گانه
    const svg = `<svg width="${cw}" height="${fs * 3}" xmlns="http://www.w3.org/2000/svg">
      <style>@font-face { font-family: 'Vazirmatn'; font-weight: ${weight}; src: url(data:font/ttf;base64,${weight === 700 ? FONT_BOLD : FONT_REG}); }</style>
      <text x="${cw / 2}" y="${fs * 2}" font-family="Vazirmatn" font-size="${fs}" font-weight="${weight}" fill="#fff" text-anchor="middle" direction="rtl">${esc(text)}</text>
    </svg>`;
    const { info } = await sharp(Buffer.from(svg))
      .png()
      .trim({ threshold: 1 })
      .toBuffer({ resolveWithObject: true });
    return info.width;
  }

  const R_EDGE = 1148; // لبهٔ امن راست (حاشیهٔ ~۵۰px برای اورهنگ گلیف)
  const [titleW, sub1W, sub2W, ctaNoteW] = await Promise.all([
    measureText(title, 100, 700),
    measureText(subtitle, 30, 400),
    measureText(subtitle2, 24, 400),
    measureText(ctaNote, 19, 400),
  ]);
  const titleX = R_EDGE - titleW / 2;
  const sub1X = R_EDGE - sub1W / 2;
  const sub2X = R_EDGE - sub2W / 2;
  const ctaNoteX = R_EDGE - ctaNoteW / 2;

  const textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        @font-face { font-family: 'Vazirmatn'; font-weight: 700; src: url(data:font/ttf;base64,${FONT_BOLD}); }
        @font-face { font-family: 'Vazirmatn'; font-weight: 400; src: url(data:font/ttf;base64,${FONT_REG}); }
      </style>
      <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#fbbf24"/>
        <stop offset="55%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#fde68a"/>
      </linearGradient>
    </defs>

    <!-- kicker — بالای عنوان -->
    <rect x="905" y="102" width="283" height="46" rx="23" fill="#10b981" fill-opacity="0.18" stroke="#34d399" stroke-opacity="0.5" stroke-width="1.2"/>
    <text x="1046" y="133" font-family="Vazirmatn" font-size="19" font-weight="400" fill="#6ee7b7" text-anchor="middle" direction="rtl">${esc(kicker)}</text>

    <!-- عنوان اصلی -->
    <text x="${titleX}" y="252" font-family="Vazirmatn" font-size="100" font-weight="700" fill="url(#titleGrad)" text-anchor="middle" direction="rtl">${esc(title)}</text>

    <!-- زیرعنوان -->
    <text x="${sub1X}" y="318" font-family="Vazirmatn" font-size="30" font-weight="400" fill="#e2e8f0" text-anchor="middle" direction="rtl">${esc(subtitle)}</text>
    <text x="${sub2X}" y="360" font-family="Vazirmatn" font-size="24" font-weight="400" fill="#94a3b8" text-anchor="middle" direction="rtl">${esc(subtitle2)}</text>

    <!-- خط تاکیدی زیر عنوان -->
    <rect x="948" y="386" width="200" height="5" rx="2.5" fill="#10b981"/>

    <!-- CTA -->
    <rect x="798" y="414" width="390" height="60" rx="14" fill="#f59e0b"/>
    <text x="993" y="453" font-family="Vazirmatn" font-size="25" font-weight="700" fill="#1c1917" text-anchor="middle" direction="rtl">${esc(cta)}</text>
    <text x="${ctaNoteX}" y="498" font-family="Vazirmatn" font-size="19" font-weight="400" fill="#cbd5e1" text-anchor="middle" direction="rtl">${esc(ctaNote)}</text>

    <!-- چیپ‌های ویژگی -->
    ${chipEls}
  </svg>`;

  const composed = await sharp(bgResized)
    .composite([
      { input: Buffer.from(gradientSvg), top: 0, left: 0 },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ])
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(OUT, composed);
  // مسیر قدیمی هم بازنویسی می‌شود تا اگر تلگرام/واتساپ دوباره همان URL را
  // خواندند، تصویر درست (افق پلاس) را ببینند نه نسخهٔ کش‌شدهٔ «هوش حساب»
  fs.writeFileSync(OUT_LEGACY, composed);

  console.log("OG image built:", OUT, composed.size, "bytes (+ legacy og-image.png)");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
