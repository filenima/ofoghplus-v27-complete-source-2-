// ============ API لاگ‌ها — GET (فیلتر+صفحه‌بندی) + DELETE (پاک‌سازی) ============
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/user-auth';
import { requireSuperAdmin } from '@/lib/platform-middleware';
import { auditLog } from '@/lib/auth';

/**
 * احراز هویت دوگانه — کاربر عادی (توکن نشست‌دار) یا سوپرادمین پلتفرم.
 * تب «لاگ‌های سیستم» پنل سوپرادمین با توکن پلتفرم صدا می‌زند؛ قبلاً فقط
 * requireUser پذیرفته می‌شد و پنل سوپرادمین همیشه 401 می‌گرفت.
 * - کاربر عادی: tenantId همیشه از نشست (پارامتر کلاینت نادیده گرفته می‌شود)
 * - سوپرادمین: اختیاریاً با ?tenantId= روی یک سازمان فیلتر می‌کند؛ بدون آن
 *   همهٔ لاگ‌های پلتفرم (شامل tenantId=null) برمی‌گردد
 */
async function resolveLogAccess(req: NextRequest, url: URL) {
  const userAuth = await requireUser(req);
  if (!('error' in userAuth)) {
    return { ok: true as const, tenantId: userAuth.user.tenantId, role: userAuth.user.role, userId: userAuth.user.userId, isSuperAdmin: false };
  }
  const adminAuth = await requireSuperAdmin(req);
  if (!('error' in adminAuth)) {
    const requestedTenant = url.searchParams.get('tenantId');
    return { ok: true as const, tenantId: requestedTenant || null, role: 'SUPER_ADMIN', userId: adminAuth.admin.id, isSuperAdmin: true };
  }
  // هیچ‌کدام معتبر نبود — خطای همان requireUser (پیام فارسی استاندارد)
  return { ok: false as const, error: userAuth.error };
}

export async function GET(req: NextRequest) {
 try {
  const url = new URL(req.url);
  // احراز هویت — کاربر (توکن + نشست فعال) یا سوپرادمین پلتفرم
  const auth = await resolveLogAccess(req, url);
  if (!auth.ok) return auth.error;

  const level = url.searchParams.get('level');
  const category = url.searchParams.get('category');
  const userId = url.searchParams.get('userId');
  const search = url.searchParams.get('search');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const parsedLimit = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Number.isFinite(parsedLimit)
? Math.min(Math.max(parsedLimit, 1), 200)
: 50;
  const parsedOffset = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0? parsedOffset: 0;

  // ساخت شرط‌های فیلتر — جداسازی داده‌ها:
  // SECURITY: برای کاربر عادی tenantId از نشست می‌آید (پارامتر کلاینت نادیده
  // گرفته می‌شود)؛ سوپرادمین فقط با فیلتر اختیاری tenantId محدود می‌شود و
  // بدون آن لاگ‌های سراسری پلتفرم را می‌بیند.
  const where: Record<string, unknown> = {};
  if (auth.isSuperAdmin) {
    if (auth.tenantId) where.tenantId = auth.tenantId;
  } else {
    where.tenantId = auth.tenantId;
  }

  if (level) where.level = level;
  if (category) where.category = category;
  if (userId) where.userId = userId;

  if (search) {
    where.message = { contains: search };
  }

  if (dateFrom || dateTo) {
    const timestampFilter: Record<string, Date> = {};
    if (dateFrom) timestampFilter.gte = new Date(dateFrom);
    if (dateTo) timestampFilter.lte = new Date(dateTo);
    where.timestamp = timestampFilter;
  }

  const [entries, total] = await Promise.all([
    db.logEntry.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.logEntry.count({ where }),
  ]);

  return NextResponse.json({ entries, total, limit, offset });
 } catch (error) {
  return NextResponse.json(
    { error: 'خطا در دریافت لاگ‌ها' },
    { status: 500 }
  );
 }
}

export async function DELETE(req: NextRequest) {
 try {
  const url = new URL(req.url);
  // FIX(H4): پاک‌سازی لاگ‌ها قبلاً فقط احراز هویت tenant داشت — هر کاربری با هر
  // نقشی (حتی VIEWER) می‌توانست DELETE /api/logs?all=true بزند و audit-trail
  // tenant را پاک کند. حالا requireUser + نقش ADMIN (یا سوپرادمین پلتفرم)
  // + اسکوپ اجباری tenant برای کاربران عادی.
  const auth = await resolveLogAccess(req, url);
  if (!auth.ok) return auth.error;
  const { role, userId, isSuperAdmin } = auth;
  const tenantId = isSuperAdmin ? url.searchParams.get('tenantId') : auth.tenantId;
  if (!isSuperAdmin && role!== 'ADMIN') {
    return NextResponse.json(
      { error: 'پاک‌سازی لاگ‌ها فقط برای مدیر سیستم مجاز است' },
      { status: 403 }
    );
  }

  const level = url.searchParams.get('level');
  const category = url.searchParams.get('category');
  const olderThan = url.searchParams.get('olderThan'); // ISO date
  const all = url.searchParams.get('all');

  // امنیت: فقط با فیلتر مشخص پاک شود (مگر all=true)
  if (!all &&!level &&!category &&!olderThan) {
    return NextResponse.json(
      { error: 'حداقل یک فیلتر مشخص کنید یا all=true بگذارید' },
      { status: 400 }
    );
  }

  // SECURITY: پاک‌سازی دسته‌های SECURITY/AUTH مجاز نیست — ردپای امنیتی باید
  // بماند (مهاجم/کاربر نتواند evidence پاک کند)
  if (category && ['SECURITY', 'AUTH'].includes(category.toUpperCase())) {
    return NextResponse.json(
      { error: 'پاک‌سازی لاگ‌های دسته SECURITY/AUTH مجاز نیست' },
      { status: 403 }
    );
  }

  // همیشه فیلتر tenantId برای جداسازی داده‌ها — all=true فقط یعنی
  // «همه لاگ‌های همین tenant»؛ حذف بین-tenantی وجود ندارد.
  // سوپرادمین: با ?tenantId= لاگ‌های همان سازمان؛ بدون آن فقط لاگ‌های
  // پلتفرم (tenantId=null) پاک می‌شود — هرگز پاک‌سازی سراسری همهٔ tenantها.
  // دسته‌های SECURITY/AUTH همیشه از پاک‌سازی all-level مستثنی می‌مانند.
  const where: Record<string, unknown> = {
    category: { notIn: ['SECURITY', 'AUTH'] },
  };
  if (isSuperAdmin) {
    // Prisma: مقدار null یعنی «IS NULL» — لاگ‌های سطح پلتفرم
    where.tenantId = tenantId || null;
  } else {
    where.tenantId = tenantId;
  }
  if (level) where.level = level;
  if (category) where.category = category;
  if (olderThan) where.timestamp = { lt: new Date(olderThan) };

  const result = await db.logEntry.deleteMany({ where });

  // ثبت رویداد پاک‌سازی در audit trail (خود auditLog حذف نمی‌شود) —
  // سوپرادمین: PlatformAuditLog؛ کاربر tenant: auditLog همان سازمان
  if (isSuperAdmin) {
    await db.platformAuditLog.create({
      data: {
        superAdminId: userId,
        action: 'LOGS_PURGE',
        entity: 'LogEntry',
        details: JSON.stringify({ deleted: result.count, level, category, olderThan, all: Boolean(all), tenantId }),
        ipAddress: req.headers.get('x-forwarded-for') || null,
      },
    }).catch(() => undefined);
  } else {
    await auditLog({
      tenantId: auth.tenantId,
      userId,
      action: 'LOGS_PURGE',
      entity: 'LogEntry',
      changes: { deleted: result.count, level, category, olderThan, all: Boolean(all) },
      req,
    });
  }

  return NextResponse.json({ deleted: result.count });
 } catch (error) {
  return NextResponse.json(
    { error: 'خطا در پاک‌سازی لاگ‌ها' },
    { status: 500 }
  );
 }
}
