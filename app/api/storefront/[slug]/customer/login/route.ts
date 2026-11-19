import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorefrontBySlug, signSfCustomerToken } from "@/lib/storefront-auth";
import { STOREFRONT_CUSTOMER_COOKIE, STOREFRONT_CUSTOMER_TOKEN_TTL_MS } from "@/lib/storefront";
import { verifyPassword } from "@/lib/platform-auth";
import { rateLimitCheck, buildRateLimitResponse, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/storefront/[slug]/customer/login — ورود مشتری با ایمیل + رمز عبور
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // ۱۰ تلاش در ۱۵ دقیقه — ضد brute-force
    const rl = rateLimitCheck(`sf-login:${getClientIp(req)}`, 10, 15 * 60_000);
    if (!rl.ok) {
      return await buildRateLimitResponse(rl, "تلاش‌های ورود بیش از حد مجاز است. کمی بعد تلاش کنید.");
    }

    const { slug } = await params;
    const storefront = await getStorefrontBySlug(slug);
    if (!storefront || !storefront.isActive) {
      return NextResponse.json(
        { success: false, error: "فروشگاه یافت نشد یا فعال نیست" },
        { status: 404 }
      );
    }
    // Task 3-d — تعلیق سوپرادمینی: ورود مشتری در فروشگاه معلق بسته است
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
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "ایمیل و رمز عبور را وارد کنید" },
        { status: 400 }
      );
    }

    const customer = await db.storefrontCustomer.findUnique({
      where: { storefrontId_email: { storefrontId: storefront.id, email } },
      select: { id: true, name: true, email: true, password: true },
    });
    if (!customer || !(await verifyPassword(password, customer.password))) {
      return NextResponse.json(
        { success: false, error: "ایمیل یا رمز عبور اشتباه است" },
        { status: 401 }
      );
    }

    const token = signSfCustomerToken(customer.id, storefront.id);
    const res = NextResponse.json({
      success: true,
      customer: { id: customer.id, name: customer.name, email: customer.email },
      message: "خوش آمدید",
    });
    res.cookies.set(STOREFRONT_CUSTOMER_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(STOREFRONT_CUSTOMER_TOKEN_TTL_MS / 1000),
    });
    return res;
  } catch (error) {
    console.error("[storefront login] error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "خطا در ورود — لطفاً دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
