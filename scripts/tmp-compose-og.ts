import sharp from 'sharp';

const W = 1200, H = 630;
const R = 1128; // لبه راست محتوا (72px حاشیه)

async function main() {
  const bg = await sharp('/tmp/og-bg-raw.png')
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const overlay = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="dim" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#081527" stop-opacity="0.94"/>
        <stop offset="45%" stop-color="#0a1c33" stop-opacity="0.80"/>
        <stop offset="100%" stop-color="#0a1c33" stop-opacity="0.15"/>
      </linearGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f6c66b" stop-opacity="1"/>
        <stop offset="100%" stop-color="#e8a944" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#dim)"/>
    <rect x="0" y="0" width="${W}" height="6" fill="url(#gold)"/>

    <!-- بج -->
    <rect x="820" y="108" rx="26" width="308" height="52" fill="#12304A" fill-opacity="0.75" stroke="#f6c66b" stroke-opacity="0.6" stroke-width="1.5"/>
    <text x="974" y="143" font-family="Vazirmatn" font-size="23" font-weight="700" fill="#f6c66b" text-anchor="middle">نرم‌افزار حسابداری ابری</text>

    <!-- عنوان -->
    <text x="${R}" y="252" font-family="Vazirmatn" font-size="100" font-weight="700" fill="#ffffff" text-anchor="end">افق پلاس</text>

    <!-- زیرعنوان -->
    <text x="${R}" y="322" font-family="Vazirmatn" font-size="32" font-weight="400" fill="#d7e6f5" text-anchor="end">حسابداری، انبار، فاکتور رسمی و فروشگاه آنلاین</text>
    <text x="${R}" y="372" font-family="Vazirmatn" font-size="32" font-weight="400" fill="#d7e6f5" text-anchor="end">در یک پلتفرم ایرانی — اتصال به سامانه مودیان</text>

    <!-- دکمه CTA: از x=716 تا x=1128 -->
    <rect x="716" y="418" rx="16" width="412" height="64" fill="url(#gold)"/>
    <text x="922" y="460" font-family="Vazirmatn" font-size="28" font-weight="700" fill="#0a1c33" text-anchor="middle">شروع رایگان ۷ روزه — ofoghplus.ir</text>

    <!-- فوتر با کنتراست بهتر -->
    <rect x="0" y="${H - 76}" width="${W}" height="76" fill="#081527" fill-opacity="0.72"/>
    <rect x="0" y="${H - 76}" width="${W}" height="2" fill="#f6c66b" fill-opacity="0.35"/>
    <text x="${R}" y="${H - 30}" font-family="Vazirmatn" font-size="23" fill="#c9dcef" text-anchor="end">گزارش خرید و فروش  •  چک‌ها  •  مؤدیان  •  درون‌ریزی اکسل رایگان</text>
  </svg>`);

  const final = await sharp(bg)
    .composite([{ input: overlay }])
    .png({ compressionLevel: 9 })
    .toFile('/tmp/og-composed.png');
  console.log('composed', final.width, final.height, final.size);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
