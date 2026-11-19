import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import * as React from "react";
import { readFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * GET /api/og — تولید داینامیک OG image به‌صورت PNG (satori/next-og)
 * =====================================================================
 * نکات سئو:
 * - خروجی PNG است (image/png) — SVG در شبکه‌های اجتماعی (توییتر، تلگرام،
 * لینکدین و...) پشتیبانی نمی‌شود و قبلاً تصویر پیش‌نمایشی نمایش داده نمی‌شد.
 * - فونت Vazirmatn (نسخه TTF کامل — عربی + لاتین) از assets/og-fonts
 * خوانده می‌شود؛ satori فقط TTF/OTF می‌پذیرد (WOFF2 پشتیبانی نمی‌شود)
 * تا متن فارسی با شکل‌دهی صحیح (حروف چسبیده) رندر شود.
 *
 * پارامترها:
 * - title (الزامی — پیش‌فرض «افق پلاس»)
 * - description (اختیاری)
 * - type: blog | landing | default
 * - category (اختیاری — فقط blog)
 * - date (اختیاری — فقط blog)
 */

type SatoriFont = {
 name: string;
 data: Buffer;
 weight: 400 | 700;
 style: "normal";
};

let fontsCache: SatoriFont[] | null = null;

/**
 * FIX(SEO S4/S5): فونت TTF در assets/og-fonts وجود ندارد و /api/og برای همهٔ
 * og:imageهای داینامیک سایت 500 می‌داد (satori فقط TTF/OTF می‌خواند —
 * «Unsupported OpenType signature wOF2»؛ WOFF2های کش next/font بی‌اثرند).
 * اگر TTF نبود، مسیر GET تصویر ایستای برند را برمی‌گرداند (نه 500).
 */
async function loadFonts(): Promise<SatoriFont[]> {
 if (fontsCache) return fontsCache;
 const dir = path.join(process.cwd(), "assets", "og-fonts");
 if (existsSync(dir)) {
 const [regular, bold] = await Promise.all([
 readFile(path.join(dir, "Vazirmatn-Regular.ttf")),
 readFile(path.join(dir, "Vazirmatn-Bold.ttf")),
 ]);
 fontsCache = [
 { name: "Vazirmatn", data: regular, weight: 400, style: "normal" },
 { name: "Vazirmatn", data: bold, weight: 700, style: "normal" },
 ];
 return fontsCache;
 }
 throw new Error("No Vazirmatn TTF in assets/og-fonts");
}

/** تصویر ایستای برند — fallback قطعی برای og:image (هرگز 500 نمی‌دهد) */
async function staticOgImage(): Promise<NextResponse> {
 const fallback = await readFile(path.join(process.cwd(), "public", "og-ofoghplus.png"));
 return new NextResponse(new Uint8Array(fallback), {
 status: 200,
 headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
 });
}

// رنگ‌های برند
const C = {
 ink: "#0f172a",
 gray: "#475569",
 subtle: "#6b7280",
 brand: "#4f46e5",
 brandLight: "#6366f1",
 bgA: "#ffffff",
 bgB: "#eef2ff",
 badgeBg: "#eef2ff",
 badgeBorder: "#c7d2fe",
};

export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const title = searchParams.get("title") || "افق پلاس"; // REBRAND(R14-A)
 const description = searchParams.get("description") || "";
 const type = searchParams.get("type") || "default";
 const category = searchParams.get("category");
 const date = searchParams.get("date");

 // بدون فونت TTF قابل‌استفاده → تصویر ایستای برند (هرگز 500 برای og:image)
 let fonts: SatoriFont[];
 try {
 fonts = await loadFonts();
 } catch {
 return await staticOgImage();
 }
 const el = React.createElement;

 // ---------- برند (هدر) ----------
 const brand = el(
 "div",
 {
 style: {
 display: "flex",
 flexDirection: "row-reverse", // RTL
 alignItems: "center",
 gap: "18px",
 marginBottom: "48px",
 },
 },
 el(
 "div",
 {
 style: {
 width: 68,
 height: 68,
 borderRadius: 18,
 backgroundImage: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandLight} 100%)`,
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 color: "#ffffff",
 fontSize: 36,
 fontWeight: 700,
 },
 },
 "ه"
 ),
 el(
 "div",
 { style: { display: "flex", flexDirection: "column" } },
 el(
 "div",
 { style: { fontSize: 30, fontWeight: 700, color: "#1e1b4b", textAlign: "right" } },
 "افق پلاس"
 ),
 el(
 "div",
 { style: { fontSize: 16, color: C.subtle, textAlign: "right", marginTop: 2 } },
 "نرم‌افزار حسابداری هوشمند ایرانی"
 )
 )
 );

 // ---------- بدنه بر اساس نوع ----------
 let body: React.ReactNode;

 if (type === "blog") {
 const catLabel = category || "مقاله";
 body = el(
 "div",
 { style: { display: "flex", flexDirection: "column", flex: 1 } },
 el(
 "div",
 {
 style: {
 display: "flex",
 alignSelf: "flex-start",
 padding: "8px 22px",
 borderRadius: 999,
 backgroundColor: C.badgeBg,
 border: `1px solid ${C.badgeBorder}`,
 color: C.brand,
 fontSize: 16,
 fontWeight: 700,
 marginBottom: 26,
 },
 },
 catLabel
 ),
 el(
 "div",
 {
 style: {
 fontSize: 52,
 fontWeight: 700,
 color: C.ink,
 textAlign: "right",
 lineHeight: 1.35,
 maxWidth: 1040,
 },
 },
 title
 ),
 description
? el(
 "div",
 {
 style: {
 fontSize: 24,
 color: C.gray,
 textAlign: "right",
 lineHeight: 1.6,
 marginTop: 22,
 maxWidth: 1000,
 },
 },
 description
 )
: null,
 date
? el(
 "div",
 { style: { fontSize: 18, color: C.subtle, marginTop: "auto", textAlign: "right" } },
 date
 )
: null
 );
 } else if (type === "landing") {
 body = el(
 "div",
 { style: { display: "flex", flexDirection: "column", flex: 1 } },
 el(
 "div",
 {
 style: {
 fontSize: 62,
 fontWeight: 700,
 color: C.ink,
 textAlign: "right",
 lineHeight: 1.3,
 maxWidth: 1040,
 },
 },
 title
 ),
 description
? el(
 "div",
 {
 style: {
 fontSize: 28,
 color: C.gray,
 textAlign: "right",
 lineHeight: 1.6,
 marginTop: 24,
 maxWidth: 1000,
 },
 },
 description
 )
: null,
 el(
 "div",
 {
 style: {
 display: "flex",
 alignSelf: "flex-start",
 marginTop: "auto",
 padding: "14px 34px",
 borderRadius: 14,
 backgroundImage: `linear-gradient(90deg, ${C.brand} 0%, ${C.brandLight} 100%)`,
 color: "#ffffff",
 fontSize: 22,
 fontWeight: 700,
 },
 },
 "شروع رایگان ۷ روزه"
 )
 );
 } else {
 body = el(
 "div",
 { style: { display: "flex", flexDirection: "column", flex: 1 } },
 el(
 "div",
 {
 style: {
 fontSize: 54,
 fontWeight: 700,
 color: C.ink,
 textAlign: "right",
 lineHeight: 1.35,
 maxWidth: 1040,
 },
 },
 title
 ),
 description
? el(
 "div",
 {
 style: {
 fontSize: 26,
 color: C.gray,
 textAlign: "right",
 lineHeight: 1.6,
 marginTop: 22,
 maxWidth: 1000,
 },
 },
 description
 )
: null
 );
 }

 // ---------- فوتر ----------
 const footer = el(
 "div",
 {
 style: {
 display: "flex",
 flexDirection: "row-reverse",
 justifyContent: "space-between",
 alignItems: "center",
 marginTop: 40,
 borderTop: "1px solid #e2e8f0",
 paddingTop: 24,
 },
 },
 el(
 "div",
 { style: { fontSize: 20, color: C.subtle, fontWeight: 700 } },
 "ofoghplus.ir" // REBRAND(R14-A): دامنهٔ canonical برند
 ),
 el(
 "div",
 { style: { fontSize: 16, color: C.subtle, textAlign: "right" } },
 "اتصال به سامانه مودیان | هوش مصنوعی | ۱۶ ماژول تخصصی"
 )
 );

 const markup = el(
 "div",
 {
 style: {
 width: "100%",
 height: "100%",
 display: "flex",
 flexDirection: "column",
 padding: "64px 80px 48px 80px",
 backgroundImage: `linear-gradient(135deg, ${C.bgA} 0%, ${C.bgB} 100%)`,
 fontFamily: "Vazirmatn",
 color: C.ink,
 },
 },
 brand,
 body,
 footer
 );

 return new ImageResponse(markup, {
 width: 1200,
 height: 630,
 fonts,
 debug: false,
 });
 } catch (error) {
 console.error("OG image error:", error);
 // FIX(SEO S4/S5): به‌جای 500، تصویر ایستای برند را برگردان
 try {
 return await staticOgImage();
 } catch {
 return new NextResponse("Error generating OG image", { status: 500 });
 }
 }
}
