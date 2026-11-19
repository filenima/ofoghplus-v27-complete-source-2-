import { PrismaClient } from '@prisma/client'
import { recordSlowQuery } from '@/lib/slow-query-tracker'

// افق پلاس — Prisma Client singleton
// بررسی عملکرد: query logging به‌طور پیش‌فرض غیرفعال است تا I/O و حافظه
// مصرف نشود. در صورت نیاز برای دیباگ، متغیر محیطی PRISMA_LOG=query
// را تنظیم کنید. برای ردیابی کوئری‌های کند (Slow Query Log) که در پنل
// سوپرادمین قابل مشاهده است، متغیر TRACK_SLOW_QUERIES=true را تنظیم کنید.
const enableQueryLog = process.env.PRISMA_LOG === 'query'
const trackSlowQueries = process.env.TRACK_SLOW_QUERIES === 'true'

// در حالت Slow Query Tracking از event emission برای query level استفاده
// می‌کنیم تا بتوانیم duration هر کوئری را بررسی کنیم.
const logConfig =
 enableQueryLog || trackSlowQueries
? [{ emit: 'stdout' as const, level: 'error' as const }, { emit: 'stdout' as const, level: 'warn' as const }, { emit: 'event' as const, level: 'query' as const }]
: ['error' as const, 'warn' as const]

/* ═══════════ Task 4: اپوک اسکیما + بازیابی کلاینت کهنه در dev ═══════════
 * بعد از «prisma generate / db:push»، سرور dev که روشن است ماژول قدیمی
 * @prisma/client را در حافظه نگه می‌دارد (require cache) و فیلدهای تازهٔ
 * اسکیما «Unknown field» می‌شوند تا ری‌استارت. این مکانیزم:
 *   ۱) با اپوک، singleton قدیمی را دور می‌ریزد؛
 *   ۲) اگر کلاینت تازه هم کهنه بود (فیلد نشانگر ندارد)، یک کپی تازه از
 *      کلاینت تولیدشده را require می‌کند (مسیر جدید = ماژول تازه).
 * فقط در dev فعال است؛ در production همیشه import اصلی استفاده می‌شود.
 */
const PRISMA_SCHEMA_EPOCH = 'task4-storefront-v2'
// فیلدهای نشانگر همین اپوک — اگر کلاینت این‌ها را نشناسد، کهنه است
// [model, field, mustNotBeList] — mustNotBeList برای روابط one-to-one است
// (رابطهٔ to-many بودن storefrontMeta قبلاً کل سیستم متا را بی‌صدا می‌شکست)
const EPOCH_MARKER_FIELDS: [model: string, field: string, mustNotBeList?: boolean][] = [
  ['Product', 'slug'],
  ['ProductCategory', 'imageUrl'],
  ['StorefrontProductMeta', 'weightGrams'],
  ['Product', 'storefrontMeta', true],
]

type PrismaClientCtor = typeof PrismaClient

/** آیا کلاینتِ داده، فیلدهای نشانگر این اپوک را می‌شناسد؟ */
function clientKnowsEpoch(client: PrismaClient): boolean {
  try {
    const rdm = (client as unknown as { _runtimeDataModel?: unknown })._runtimeDataModel
    if (!rdm || typeof rdm !== 'object') return true // نسخه‌های قدیمی — فرض تازه
    const models = (rdm as { models?: Record<string, { fields?: { name: string; isList?: boolean }[] }> }).models
    if (!models) return true
    return EPOCH_MARKER_FIELDS.every(([model, field, mustNotBeList]) => {
      const f = models[model]?.fields?.find((x) => x.name === field)
      if (!f) return false
      return mustNotBeList ? f.isList !== true : true
    })
  } catch {
    return true // خطای ساختاری — مداخله نکن
  }
}

/** ساخت کلاینت تازه از روی کپی aّز کلاینت تولیدشدهٔ prisma (فقط dev)
 * FIX(R24-8): دسترسی به ماژول‌های node از طریق process.getBuiltinModule —
 * (۱) Turbopack در خروجی ESM سرور require('module') را resolve نمی‌کرد و کل
 * سایت ۵۰۰ می‌شد؛ (۲) import استاتیک path/fs هم در گراف کلاینت (که از مسیرهای
 * تاریخی مثل site-content/price-experiments به db می‌رسد) خطای «not supported
 * in the Edge/Browser» می‌داد. getBuiltinModule برای باندلر نامرئی است، در
 * Bun و Node 22+ کار می‌کند و در مرورگر هرگز اجرا نمی‌شود (فقط dev سرور). */
function createDevFreshClient(): PrismaClient | null {
  if (process.env.NODE_ENV === 'production') return null
  try {
    // ماژول‌های node بدون آنالیز باندلر — در محیط‌های فاقد آن null برمی‌گردد
    const gbm = (process as unknown as { getBuiltinModule?: <T = any>(id: string) => T | null }).getBuiltinModule
    if (typeof gbm !== 'function') return null
    const pathMod = gbm<typeof import('path')>('path')
    const fsMod = gbm<typeof import('fs')>('fs')
    const moduleMod = gbm<typeof import('module')>('module')
    if (!pathMod?.join || !fsMod?.existsSync || typeof moduleMod?.createRequire !== 'function') return null
    const anchor = pathMod.join(process.cwd(), 'package.json')
    const nodeRequire = moduleMod.createRequire(anchor)

    // مسیر کلاینت تولیدشدهٔ پیش‌فرض: node_modules/.prisma/client
    const genDir = pathMod.join(process.cwd(), 'node_modules', '.prisma', 'client')
    if (!fsMod.existsSync(pathMod.join(genDir, 'index.js'))) return null

    // کپی با نام اپوک — مسیر تازه یعنی ماژول تازه در require cache
    const copyDir = pathMod.join(process.cwd(), 'node_modules', '.prisma', `client-${PRISMA_SCHEMA_EPOCH}`)
    if (!fsMod.existsSync(copyDir)) {
      fsMod.cpSync(genDir, copyDir, { recursive: true })
    }
    // پاک‌سازی کپی‌های اپوک‌های دیگر (قدیمی)
    try {
      const prismaRoot = pathMod.join(process.cwd(), 'node_modules', '.prisma')
      for (const name of fsMod.readdirSync(prismaRoot)) {
        if (name.startsWith('client-') && name !== `client-${PRISMA_SCHEMA_EPOCH}`) {
          fsMod.rmSync(pathMod.join(prismaRoot, name), { recursive: true, force: true })
        }
      }
    } catch {
      /* پاک‌سازی بهترین تلاش است */
    }

    const fresh = nodeRequire(pathMod.join(copyDir, 'index.js')) as {
      PrismaClient?: PrismaClientCtor
    }
    const Ctor = fresh?.PrismaClient
    if (typeof Ctor !== 'function') return null
    return new Ctor({ log: [...logConfig] }) as PrismaClient
  } catch {
    return null
  }
}

const globalForPrisma = globalThis as unknown as {
 prisma: PrismaClient | undefined
 prismaEpoch?: string
}

let dbInstance: PrismaClient | undefined

// singleton موجود فقط وقتی قابل استفاده است که هم اپوکِ فعلی را داشته باشد هم
// فیلدهای نشانگر را بشناسد (سرورِ روشن‌مانده ممکن است کلاینت کهنه با برچسب
// اپوکِ قدیمی — یا رابطهٔ آرایه‌ای — در global نگه داشته باشد)
if (
  globalForPrisma.prisma &&
  globalForPrisma.prismaEpoch === PRISMA_SCHEMA_EPOCH &&
  clientKnowsEpoch(globalForPrisma.prisma)
) {
  dbInstance = globalForPrisma.prisma
} else {
  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect().catch(() => undefined)
    globalForPrisma.prisma = undefined
  }
  dbInstance = new PrismaClient({ log: [...logConfig] })
  // dev — اگر کلاینت اصلی کهنه بود (سرور قبل از generate روشن مانده)،
  // نسخهٔ تازهٔ کپی‌شده را جایگزین می‌کنیم تا بدون ری‌استارت کار کند
  if (process.env.NODE_ENV !== 'production' && !clientKnowsEpoch(dbInstance)) {
    console.log('[db] prisma client stale after schema change — loading fresh copy (dev-only)')
    const fresh = createDevFreshClient()
    if (fresh && clientKnowsEpoch(fresh)) {
      void dbInstance.$disconnect().catch(() => undefined)
      dbInstance = fresh
    } else {
      console.warn('[db] fresh prisma copy unavailable — fields added this epoch may fail until server restart')
    }
  }
}

export const db = dbInstance

// در dev یک singleton در global نگه می‌داریم تا هات‌ریلود چندین کانکشن نسازد.
if (process.env.NODE_ENV!== 'production') {
 globalForPrisma.prisma = db
 globalForPrisma.prismaEpoch = PRISMA_SCHEMA_EPOCH
}

// ─── Slow Query Tracking ───
// وقتی فعال باشد، Prisma برای هر کوئری یک event emits می‌کند. ما فقط
// کوئری‌های طولانی‌تر از ۱۰۰ms را در buffer ذخیره می‌کنیم.
if (trackSlowQueries) {
 try {
  ;(db as any).$on('query', (e: { query: string; duration: number; params?: string }) => {
   if (typeof e?.duration === 'number' && e.duration >= 100) {
    // تلاش برای تشخیص model و operation از روی query (heuristic)
    const queryStr = (e.query || '').toString()
    const opMatch = queryStr.match(/^(\w+)/)
    const modelMatch = queryStr.match(/"(?:defaultDb"\.)?(\w+)"/)
    recordSlowQuery({
     query: queryStr,
     duration: e.duration,
     operation: opMatch?.[1]?.toUpperCase(),
     model: modelMatch?.[1],
     params: e.params as string | undefined,
    })
   }
  })
 } catch {
  /* ignore — اگر $on در دسترس نبود، نادیده می‌گیریم */
 }
}
// R15-C: nudge cache
