'use strict';

/**
 * seed.cjs — بذر اولیهٔ دیتابیس نسخهٔ دسکتاپ (Task 1-f)
 * ============================================================================
 * توسط server-manager قبل از بالا آمدن سرور اجرا می‌شود (node.exe مخفی).
 * - اگر دیتابیس از قبل کاربر دارد (بستهٔ کامل با دیتابیس واقعی) → هیچ کاری نمی‌کند.
 * - اگر دیتابیس تازه/خالی است → کاربر مدیر پیش‌فرض می‌سازد:
 *     نام کاربری: admin  |  رمز: admin1234  (باید بعداً عوض شود)
 * - از @prisma/clientِ همان باندلِ سرور استفاده می‌کند (standalone خودش را دارد).
 * - همهٔ خطاها لاگ می‌شوند ولی exit code صفر برمی‌گردد تا بوت سرور متوقف نشود.
 */

const fs = require('fs');
const path = require('path');

function log(msg) {
  try {
    const logDir = process.env.OFOGH_LOG_DIR || path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'seed.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {
    /* ignore */
  }
  console.log('[seed] ' + msg);
}

async function main() {
  let PrismaClient;
  try {
    // باندل standalone: node_modules کنار server.js
    ({ PrismaClient } = require(path.join(__dirname, 'node_modules', '@prisma', 'client')));
  } catch (e1) {
    try {
      ({ PrismaClient } = require('@prisma/client'));
    } catch (e2) {
      log('PrismaClient در دسترس نیست — seed رد شد: ' + e2.message);
      return;
    }
  }

  const prisma = new PrismaClient({ log: ['error'] });
  try {
    // کاربر مدیر هست؟
    const existingAdmin = await prisma.user.findFirst({
      where: { OR: [{ username: 'admin' }, { role: 'ADMIN' }] },
      select: { id: true, username: true },
    });
    if (existingAdmin) {
      log('کاربر مدیر از قبل موجود است («' + existingAdmin.username + '») — seed رد شد.');
      return;
    }

    // هر کاربری هست؟ (دیتابیس واقعیِ همراه بسته)
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      log('دیتابیس ' + userCount + ' کاربر دارد — seed رد شد.');
      return;
    }

    // bcryptjs داخل باندل است (وابستگی مستقیم پروژه)
    let hash;
    try {
      const bcrypt = require(path.join(__dirname, 'node_modules', 'bcryptjs'));
      hash = bcrypt.hashSync('admin1234', 10);
    } catch (e) {
      const bcrypt = require('bcryptjs');
      hash = bcrypt.hashSync('admin1234', 10);
    }

    // ساخت سازمان + کاربر مدیر پیش‌فرض
    const tenant = await prisma.tenant.create({
      data: {
        name: 'شرکت من',
        plan: 'enterprise',
        status: 'active',
      },
    });
    const userData = {
      username: 'admin',
      email: 'admin@local',
      password: hash,
      role: 'ADMIN',
      isActive: true,
      tenantId: tenant.id,
    };
    // mustChangePassword فقط اگر در schema باشد (بدون کرش روی schema قدیمی)
    try {
      await prisma.user.create({ data: { ...userData, mustChangePassword: true } });
    } catch (e) {
      await prisma.user.create({ data: userData });
    }
    log('کاربر مدیر ساخته شد: admin / admin1234 (باید تغییر کند)');
  } catch (e) {
    log('خطا (non-blocking): ' + (e && e.message ? e.message : e));
  } finally {
    try {
      await prisma.$disconnect();
    } catch (e) {
      /* ignore */
    }
  }
}

main().catch((e) => log('خطای نهایی: ' + e));
