import type { Metadata } from "next";

// FIX(SEO/GEO — باگ ایندکس مستندات داخلی): صفحهٔ /api/docs (مستندات عمومی
// API برای توسعه‌دهندگان) زیر مسیر /api/ است که در robots.txt «Disallow»
// شده — اما مسدودسازی robots فقط خزش را قطع می‌کند و اگر کسی به این صفحه
// لینک بدهد، همچنان ممکن است «Indexed, though blocked» شود. این صفحهٔ
// client-side است و متادیتا نمی‌تواند از خود page.tsx بیرون بیاید، پس
// این layout حداقلِ noindex را اضافه می‌کند (صفحهٔ توسعه‌دهنده‌ها از
// داخل اپ لینک می‌شود؛ ایندکس آن ارزش سئویی ندارد).
export const metadata: Metadata = {
  title: "مستندات API",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
