import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, signSfCustomerToken } from "@/lib/storefront-auth";
import {
  STOREFRONT_CUSTOMER_COOKIE,
  STOREFRONT_CUSTOMER_TOKEN_TTL_MS,
} from "@/lib/storefront";
import { hashPassword } from "@/lib/platform-auth";
import { toEnglishDigits } from "@/lib/persian";
import { rateLimitCheck, buildRateLimitResponse, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/storefront/[slug]/customer/register — ثبت‌نام مشتری فروشگاه با ایمیل
// جدول سبک StorefrontCustomer (مستقل از User اصلی) — رمز bcrypt.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const rl = rateLimitCheck(`sf-register:${getClientIp(req)}`, 8, 60 * 60_000);
    if (!rl.ok) {
      return await buildRateLimitResponse(rl, "ثبت‌نام‌های بیش از حد مجاز. کمی بعد تلاش کنید.");
    }

    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json(
        { success: false, error: "فروشگاه یافت نشد یا فعال نیست" },
        { status: 404 }
      );
    }
    // Task 3-d — تعلیق سوپرادمینی: ثبت‌نام مشتری در فروشگاه معلق بسته است
    if (storefront.status === "suspended") {
      return NextResponse.json(
        { success: false, error: "این فروشگاه موقتاً تعلیق شده است" },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "درخواست نامعتبر" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const name = String(b.name ?? "").trim();
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { success: false, error: "نام باید ۲ تا ۸۰ نویسه باشد" },
        { status: 400 }
      );
    }
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "ایمیل معتبر وارد کنید" },
        { status: 400 }
      );
    }
    const password = String(b.password ?? "");
    if (password.length < 6 || password.length > 100) {
      return NextResponse.json(
        { success: false, error: "رمز عبور باید حداقل ۶ نویسه باشد" },
        { status: 400 }
      );
    }
    const phoneRaw = b.phone === undefined || b.phone === null ? "" : toEnglishDigits(String(b.phone)).replace(/[\s-]/g, "");
    if (phoneRaw && !/^\+?\d{8,15}$/.test(phoneRaw)) {
      return NextResponse.json(
        { success: false, error: "شماره تماس معتبر نیست" },
        { status: 400 }
      );
    }

    const existing = await db.storefrontCustomer.findUnique({
      where: { storefrontId_email: { storefrontId: storefront.id, email } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "این ایمیل قبلاً ثبت شده است — وارد شوید" },
        { status: 409 }
      );
    }

    const customer = await db.storefrontCustomer.create({
      data: {
        storefrontId: storefront.id,
        email,
        password: await hashPassword(password),
        name,
        phone: phoneRaw || null,
      },
      select: { id: true, name: true, email: true },
    });

    const token = signSfCustomerToken(customer.id, storefront.id);
    const res = NextResponse.json({
      success: true,
      customer: { id: customer.id, name: customer.name, email: customer.email },
      message: "ثبت‌نام با موفقیت انجام شد",
    });
    res.cookies.set(STOREFRONT_CUSTOMER_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(STOREFRONT_CUSTOMER_TOKEN_TTL_MS / 1000),
    });
    return res;
  } catch (error) {
    console.error("[storefront register] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در ثبت‌نام — لطفاً دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
