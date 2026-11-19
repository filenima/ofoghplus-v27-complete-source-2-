/* ============================================================
 * app/api/import/execute/route.ts — اجرای درون‌ریزی (Task 6)
 * ============================================================
 * POST /api/import/execute  (Content-Type: multipart/form-data)
 *
 * فیلدهای فرم:
 *   file          (File, الزامی) — xlsx / xls / xlsm / ods / csv / tsv / txt / json
 *   targetType    ("products" | "parties" | "accounts" | "journalEntries" | "stock"
 *                  — "journal" هم پذیرفته می‌شود) الزامی
 *   mapping       (JSON: { "فیلد هدف": ایندکس ستون }) — الزامی
 *                  ایندکس ستون عدد ۰-مبنا (رشتهٔ عددی هم پذیرفته می‌شود)؛
 *                  نام هدر ستون هم به‌عنوان مقدار پذیرفته می‌شود (نبض راهنما).
 *   dryRun        ("true" | "false") — پیش‌فرض false؛ true = اعتبارسنجی کامل
 *                  بدون هیچ نوشتن در دیتابیس
 *   updateExisting("true" | "false") — پیش‌فرض false؛ استراتژی تکراری‌ها:
 *                  false = رد (skip) / true = به‌روزرسانی
 *   autoSku       ("true" | "false") — پیش‌فرض true (فقط products)
 *   sheet         (نام شیت یا شمارهٔ ۱-مبنا) — اختیاری
 *   headerRow     (عدد ۱-مبنا) — اختیاری؛ ردیف هدر اجباری
 *
 * معماری:
 *  - «موجودی انبار» (stock) ایمپورتر بومی همین مسیر است (StockItem +
 *    StockMovement با نوع ADJUSTMENT در انبار انتخابی/پیش‌فرض).
 *  - ۴ نوع دیگر (products/parties/accounts/journalEntries) برای استفاده از
 *    موتور اثبات‌شدهٔ /api/import (کد یکتا، زنجیرهٔ چانک، موجودی، سال مالی،
 *    AuditLog و …) به‌صورت «فراخوانی داخلی» به همان مسیر JSON delegte
 *    می‌شوند — با حفظ احراز هویت کاربر (هدر Authorization پاس داده می‌شود).
 *
 * خروجی JSON:
 *   { success, mode: "validate"|"import", targetType, totalRows,
 *     created, updated, skipped, errors: [{row, message}],
 *     skippedRows: [{row, message}] }
 * ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/auth";
import { requireUser } from "@/lib/user-auth";
import { rateLimitCheck, getClientIp } from "@/lib/rate-limit";
import { assertRowLimit, assertFileSize, ImportFileError } from "@/lib/import-formats";
import {
  parseImportTableForExecute,
  normalizeAnalyzeTarget,
  STOCKABLE_FIELDS,
  type AnalyzeTarget,
} from "@/lib/import-analyze";
import { IMPORTABLE_FIELDS, normalizeDigits, type ApiImportEntity } from "@/lib/import-parser";
import { resolveDefaultWarehouse } from "@/lib/stock-movements";

export const runtime = "nodejs";

/* ---------- انواع ---------- */

interface ImportError {
  row: number;
  message: string;
}

interface ImporterResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
  skippedRows: ImportError[];
}

/* ---------- سازگاری هدف با entityType مسیر موجود ---------- */

/** هدف ویزارد → entityType مسیر /api/import (برای delegation) */
function delegatedEntity(target: AnalyzeTarget): ApiImportEntity | null {
  switch (target) {
    case "products":
      return "products";
    case "parties":
      return "parties";
    case "accounts":
      return "accounts";
    case "journalEntries":
      return "journalEntries";
    default:
      return null; // stock — ایمپورتر بومی
  }
}

/** فهرست سفید فیلدهای قابل نگاشت هر هدف */
function whitelistForTarget(target: AnalyzeTarget): readonly string[] {
  if (target === "stock") return STOCKABLE_FIELDS;
  return IMPORTABLE_FIELDS[target as ApiImportEntity];
}

/** فیلدهای الزامی هر هدف (برای پیش‌اعتبارسنجی نگاشت) */
function requiredFieldsForTarget(target: AnalyzeTarget): { key: string; label: string }[] {
  switch (target) {
    case "products":
      return [{ key: "name", label: "نام کالا" }];
    case "parties":
      return [{ key: "name", label: "نام" }];
    case "accounts":
      return [
        { key: "code", label: "کد حساب" },
        { key: "name", label: "نام حساب" },
      ];
    case "journalEntries":
      return [
        { key: "docNumber", label: "شماره سند" },
        { key: "accountCode", label: "کد حساب" },
      ];
    case "stock":
      return [{ key: "quantity", label: "تعداد / موجودی" }];
  }
}

/* ---------- اعتبارسنجی و اعمال نگاشت (field → columnIndex) ---------- */

function validateFieldMapping(
  mapping: unknown,
  target: AnalyzeTarget,
  headers: string[]
): { ok: true; byColumn: Map<number, string> } | { ok: false; error: string } {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return {
      ok: false,
      error: "ساختار mapping نامعتبر است — باید JSON آبجکتی از { «فیلد هدف»: ایندکس ستون } باشد",
    };
  }
  const whitelist = whitelistForTarget(target);
  const byColumn = new Map<number, string>();
  for (const [rawField, rawValue] of Object.entries(mapping as Record<string, unknown>)) {
    const field = String(rawField).trim();
    const value = String(rawValue ?? "").trim();
    if (!field || !value) continue;
    if (!whitelist.includes(field)) {
      return {
        ok: false,
        error: `فیلد هدف «${field.slice(0, 40)}» برای ${target} معتبر نیست — فیلدهای مجاز: ${whitelist.join("، ")}`,
      };
    }
    // مقدار: ایندکس عددی ۰-مبنا یا نام هدر
    let idx = -1;
    if (/^\d+$/.test(value)) {
      idx = Number(value);
    } else {
      idx = headers.findIndex((h) => h === value);
      if (idx < 0) {
        // هدر نرمال‌شده (ی/ک عربی، بدون فاصله)
        const norm = normalizeDigits(value).replace(/[\s\u200c_-]/g, "");
        idx = headers.findIndex(
          (h) => normalizeDigits(h).replace(/[\s\u200c_-]/g, "") === norm
        );
      }
    }
    if (!Number.isInteger(idx) || idx < 0 || idx >= headers.length) {
      return {
        ok: false,
        error: `ستون «${value.slice(0, 40)}» برای فیلد «${field}» در فایل پیدا نشد (ستون‌ها: ۰ تا ${headers.length - 1})`,
      };
    }
    byColumn.set(idx, field);
  }
  return { ok: true, byColumn };
}

/** اعمال نگاشت روی ردیف‌ها → آبجکت‌های { فیلد: مقدار } (مقادیر خالی حذف می‌شوند) */
function applyFieldMapping(
  rows: string[][],
  byColumn: Map<number, string>
): Record<string, unknown>[] {
  const entries = [...byColumn.entries()].sort((a, b) => a[0] - b[0]);
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [idx, field] of entries) {
      const v = row[idx];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out[field] = v;
      }
    }
    return out;
  });
}

/* ============================================================
 * ایمپورتر بومی «موجودی انبار» (stock)
 * ============================================================ */

function normKey(s: string): string {
  return s
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/[\s_\-.\u0640]/g, "")
    .replace(/\u064a/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/[\u0623\u0625\u0622]/g, "\u0627")
    .trim()
    .toLowerCase();
}

async function importStock(
  rows: Record<string, unknown>[],
  tenantId: string,
  req: NextRequest,
  fileName: string | undefined,
  updateExisting: boolean,
  dryRun: boolean
): Promise<ImporterResult> {
  const errors: ImportError[] = [];
  const skippedRows: ImportError[] = [];
  let skipped = 0;

  // ۱) پیش‌بارگذاری کالاها (کد + نام نرمال‌شده) — یک کوئری
  const products = await db.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, sku: true, name: true },
  });
  const productBySku = new Map<string, string>();
  const productByName = new Map<string, string>();
  for (const p of products) {
    if (p.sku && !productBySku.has(p.sku)) productBySku.set(p.sku, p.id);
    const nn = normKey(p.name ?? "");
    if (nn && !productByName.has(nn)) productByName.set(nn, p.id);
  }

  // ۲) پیش‌بارگذاری انبارها (نام + کد نرمال‌شده)
  const warehouses = await db.warehouse.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, code: true },
  });
  const warehouseByName = new Map<string, string>();
  for (const w of warehouses) {
    const nn = normKey(w.name ?? "");
    if (nn && !warehouseByName.has(nn)) warehouseByName.set(nn, w.id);
    if (w.code && !warehouseByName.has(normKey(w.code))) {
      warehouseByName.set(normKey(w.code), w.id);
    }
  }

  // ۳) انبار پیش‌فرض — فقط وقتی ستون انبار نگاشت نشده/خالی است
  let defaultWarehouseId: string | null = null;
  const needsDefault = rows.some((r) => !String(r.warehouse ?? "").trim());
  if (needsDefault) {
    if (warehouses.length > 0) {
      defaultWarehouseId = warehouses[0].id;
    } else if (!dryRun) {
      defaultWarehouseId = await resolveDefaultWarehouse(tenantId);
    }
  }

  // ۴) طبقه‌بندی ردیف‌ها (بدون کوئری سطر به سطر)
  interface StockOp {
    row: number;
    productId: string;
    warehouseId: string;
    quantity: number;
    unitCost: number | null;
  }
  const creates: StockOp[] = [];
  const updates: { op: StockOp; currentQuantity: number }[] = [];
  const seenPairs = new Set<string>(); // productId|warehouseId در همین فایل

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idx = i + 1;
    try {
      const sku = String(row.productSku ?? "").trim();
      const name = String(row.productName ?? "").trim();
      if (!sku && !name) {
        errors.push({
          row: idx,
          message: "کد یا نام کالا الزامی است — ستون «کد کالا» یا «نام کالا» را نگاشت کنید",
        });
        continue;
      }
      const productId = (sku ? productBySku.get(sku) : undefined) ?? (name ? productByName.get(normKey(name)) : undefined);
      if (!productId) {
        errors.push({
          row: idx,
          message: `کالا یافت نشد: «${(sku || name).slice(0, 50)}» — ابتدا کالا را در ماژول انبار ثبت کنید یا فایل کالاها را درون‌ریزی کنید`,
        });
        continue;
      }

      const warehouseRaw = String(row.warehouse ?? "").trim();
      let warehouseId: string | null;
      if (warehouseRaw) {
        warehouseId = warehouseByName.get(normKey(warehouseRaw)) ?? null;
        if (!warehouseId) {
          errors.push({
            row: idx,
            message: `انبار «${warehouseRaw.slice(0, 40)}» یافت نشد — ابتدا انبار را در ماژول انبار بسازید`,
          });
          continue;
        }
      } else {
        warehouseId = defaultWarehouseId;
        if (!warehouseId) {
          errors.push({ row: idx, message: "انبار پیش‌فرض سیستم در دسترس نیست — ستون انبار را نگاشت کنید" });
          continue;
        }
      }

      const qtyRaw = String(row.quantity ?? "").trim();
      if (!qtyRaw) {
        errors.push({ row: idx, message: "تعداد / موجودی الزامی است" });
        continue;
      }
      const quantity = Number(normalizeDigits(qtyRaw));
      if (!Number.isFinite(quantity)) {
        errors.push({ row: idx, message: `مقدار موجودی نامعتبر است: «${qtyRaw.slice(0, 20)}»` });
        continue;
      }
      if (quantity < 0) {
        errors.push({ row: idx, message: "موجودی نمی‌تواند منفی باشد" });
        continue;
      }
      const costRaw = String(row.unitCost ?? "").trim();
      const unitCost = costRaw ? Math.max(Number(normalizeDigits(costRaw)) || 0, 0) : null;

      const pairKey = `${productId}|${warehouseId}`;
      if (seenPairs.has(pairKey)) {
        errors.push({
          row: idx,
          message: `تکرار کالا/انبار در همین فایل (ردیف ${idx}) — هر کالا در هر انبار فقط یک ردیف می‌تواند داشته باشد`,
        });
        continue;
      }
      seenPairs.add(pairKey);

      creates.push({ row: idx, productId, warehouseId, quantity, unitCost });
    } catch (err) {
      errors.push({
        row: idx,
        message: err instanceof Error ? err.message : "خطا در آماده‌سازی ردیف موجودی",
      });
    }
  }

  // ۵) موجودی فعلی برای تشخیص ایجاد/به‌روزرسانی (یک کوئری)
  const productIds = [...new Set(creates.map((c) => c.productId))];
  const warehouseIds = [...new Set(creates.map((c) => c.warehouseId))];
  const existingItems = new Map<string, number>(); // productId|warehouseId → quantity
  if (productIds.length > 0 && warehouseIds.length > 0) {
    const items = await db.stockItem.findMany({
      where: { tenantId, productId: { in: productIds }, warehouseId: { in: warehouseIds } },
      select: { productId: true, warehouseId: true, quantity: true },
    });
    for (const it of items) {
      existingItems.set(`${it.productId}|${it.warehouseId}`, it.quantity);
    }
  }

  // جداکردن ایجاد از به‌روزرسانی
  const finalCreates: StockOp[] = [];
  for (const op of creates) {
    const current = existingItems.get(`${op.productId}|${op.warehouseId}`);
    if (current === undefined) {
      finalCreates.push(op);
    } else if (updateExisting) {
      updates.push({ op, currentQuantity: current });
    } else {
      skipped++;
      skippedRows.push({
        row: op.row,
        message: `موجودی از قبل ثبت شده (${current.toLocaleString("en-US")}) — برای تغییر، گزینهٔ «به‌روزرسانی موارد موجود» را فعال کنید`,
      });
    }
  }

  // ۶) dryRun — بدون هیچ نوشتن
  if (dryRun) {
    return {
      created: finalCreates.length,
      updated: updates.length,
      skipped,
      errors,
      skippedRows,
    };
  }

  // ۷) نوشتن گروهی (تراکنش‌های ۲۰۰تایی — الگوی بقیهٔ ایمپورترها)
  let created = 0;
  let updated = 0;
  const writeErrors: ImportError[] = [];
  const BATCH = 200;
  for (let i = 0; i < finalCreates.length; i += BATCH) {
    const batch = finalCreates.slice(i, i + BATCH);
    try {
      await db.$transaction(async (tx) => {
        for (const op of batch) {
          await tx.stockItem.create({
            data: {
              tenantId,
              productId: op.productId,
              warehouseId: op.warehouseId,
              quantity: op.quantity,
            },
          });
          if (op.quantity > 0) {
            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: op.productId,
                type: "IN",
                quantity: op.quantity,
                toWarehouseId: op.warehouseId,
                referenceType: "ADJUSTMENT",
                referenceId: "bulk-import",
                unitCost: op.unitCost !== null ? BigInt(Math.round(op.unitCost)) : null,
              },
            });
          }
        }
      });
      created += batch.length;
    } catch (err) {
      // fallback سطری — خطا به همان ردیف‌ها نسبت داده می‌شود
      for (const op of batch) {
        try {
          await db.stockItem.create({
            data: {
              tenantId,
              productId: op.productId,
              warehouseId: op.warehouseId,
              quantity: op.quantity,
            },
          });
          if (op.quantity > 0) {
            await db.stockMovement.create({
              data: {
                tenantId,
                productId: op.productId,
                type: "IN",
                quantity: op.quantity,
                toWarehouseId: op.warehouseId,
                referenceType: "ADJUSTMENT",
                referenceId: "bulk-import",
                unitCost: op.unitCost !== null ? BigInt(Math.round(op.unitCost)) : null,
              },
            });
          }
          created++;
        } catch {
          writeErrors.push({
            row: op.row,
            message: err instanceof Error ? err.message : "ثبت موجودی ناموفق بود",
          });
        }
      }
    }
  }
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    try {
      await db.$transaction(async (tx) => {
        for (const { op, currentQuantity } of batch) {
          const delta = op.quantity - currentQuantity;
          await tx.stockItem.update({
            where: {
              tenantId_productId_warehouseId: {
                tenantId,
                productId: op.productId,
                warehouseId: op.warehouseId,
              },
            },
            data: { quantity: op.quantity },
          });
          if (delta > 0) {
            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: op.productId,
                type: "IN",
                quantity: delta,
                toWarehouseId: op.warehouseId,
                referenceType: "ADJUSTMENT",
                referenceId: "bulk-import",
                unitCost: op.unitCost !== null ? BigInt(Math.round(op.unitCost)) : null,
              },
            });
          } else if (delta < 0) {
            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: op.productId,
                type: "OUT",
                quantity: Math.abs(delta),
                fromWarehouseId: op.warehouseId,
                referenceType: "ADJUSTMENT",
                referenceId: "bulk-import",
              },
            });
          }
        }
      });
      updated += batch.length;
    } catch (err) {
      for (const { op } of batch) {
        try {
          await db.stockItem.update({
            where: {
              tenantId_productId_warehouseId: {
                tenantId,
                productId: op.productId,
                warehouseId: op.warehouseId,
              },
            },
            data: { quantity: op.quantity },
          });
          updated++;
        } catch {
          writeErrors.push({
            row: op.row,
            message: err instanceof Error ? err.message : "به‌روزرسانی موجودی ناموفق بود",
          });
        }
      }
    }
  }

  // ۸) ثبت ممیزی (فقط اجرای واقعی)
  if (!dryRun) {
    await auditLog({
      tenantId,
      action: "BULK_IMPORT",
      entity: "Stock",
      entityId: "bulk",
      changes: {
        count: created,
        updated,
        skipped,
        errors: errors.length + writeErrors.length,
        total: rows.length,
        strategy: updateExisting ? "update" : "skip",
        fileName: fileName ?? null,
      },
      req,
    });
  }

  return {
    created,
    updated,
    skipped,
    errors: [...errors, ...writeErrors],
    skippedRows,
  };
}

/* ============================================================
 * فراخوانی داخلی موتور /api/import (JSON mode) برای ۴ نوع کتابخانه‌ای
 * ============================================================ */

const INTERNAL_BASE = `http://127.0.0.1:${process.env.PORT ?? "3000"}`;

async function delegateImport(
  entityType: ApiImportEntity,
  data: Record<string, unknown>[],
  opts: { dryRun: boolean; updateExisting: boolean; autoSku: boolean; fileName?: string },
  authorization: string | null
): Promise<ImporterResult> {
  const result: ImporterResult = { created: 0, updated: 0, skipped: 0, errors: [], skippedRows: [] };
  const CHUNK = 5000; // MAX_ROWS_PER_REQUEST مسیر موجود
  for (let start = 0; start < data.length; start += CHUNK) {
    const chunk = data.slice(start, start + CHUNK);
    const res = await fetch(`${INTERNAL_BASE}/api/import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify({
        entityType,
        data: chunk,
        duplicateStrategy: opts.updateExisting ? "update" : "skip",
        autoSku: opts.autoSku,
        mode: opts.dryRun ? "validate" : "import",
        fileName: opts.fileName,
      }),
      signal: AbortSignal.timeout(600_000),
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* بدنهٔ غیر JSON */
    }
    if (!res.ok || json.success !== true) {
      throw new Error(
        String(json.error ?? `خطای داخلی موتور درون‌ریزی (کد ${res.status}) — دوباره تلاش کنید`)
      );
    }
    result.created += Number(json.created ?? 0);
    result.updated += Number(json.updated ?? 0);
    result.skipped += Number(json.skipped ?? 0);
    const errs = Array.isArray(json.errors) ? (json.errors as { row?: number; message?: string }[]) : [];
    for (const e of errs) {
      result.errors.push({
        row: Number(e.row ?? 0) + start,
        message: String(e.message ?? "خطای نامشخص"),
      });
    }
    const skips = Array.isArray(json.skippedRows) ? (json.skippedRows as { row?: number; message?: string }[]) : [];
    for (const s of skips) {
      result.skippedRows.push({
        row: Number(s.row ?? 0) + start,
        message: String(s.message ?? ""),
      });
    }
  }
  return result;
}

/* ============================================================
 * Route
 * ============================================================ */

export async function POST(req: NextRequest) {
  try {
    /* ---------- احراز هویت ---------- */
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const tenantId = auth.user.tenantId;

    /* ---------- Rate limit ---------- */
    const ip = getClientIp(req);
    const rl = rateLimitCheck(`import-execute:${ip}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "درخواست بیش از حد. کمی بعد تلاش کنید." },
        { status: 429 }
      );
    }

    /* ---------- فرم ---------- */
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ success: false, error: "فرم مولتی‌پارت نامعتبر است" }, { status: 400 });
    }
    const fileEntry = form.get("file");
    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      return NextResponse.json(
        { success: false, error: "فایلی ارسال نشده است — فیلد «file» در فرم الزامی است" },
        { status: 400 }
      );
    }

    const targetRaw = String(form.get("targetType") ?? "").trim();
    const target = normalizeAnalyzeTarget(targetRaw);
    if (!target) {
      return NextResponse.json(
        {
          success: false,
          error: "نوع هدف نامعتبر است — یکی از products / parties / accounts / journalEntries / stock",
        },
        { status: 400 }
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await fileEntry.arrayBuffer());
    } catch {
      return NextResponse.json({ success: false, error: "خواندن محتوای فایل ناموفق بود" }, { status: 400 });
    }

    /* FIX(v42-OOM): بررسی حجم «قبل از پارس» — قبلاً سقف ۱۵MB فقط بعد از
     * ساخت کامل ماتریس ردیف‌ها اعمال می‌شد؛ فایل چندصدمگابایتی ابتدا کامل
     * در RAM بار می‌شد و روی سرور ۴GB کل سرویس را OOM می‌کرد. */
    try {
      assertFileSize(bytes);
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "فایل بیش از حد بزرگ است" },
        { status: 400 }
      );
    }

    /* ---------- پارس فایل (همان خط لولهٔ analyze — شیت/ردیف هدر) ---------- */
    const sheetEntry = form.get("sheet");
    const sheet = typeof sheetEntry === "string" && sheetEntry.trim() !== "" ? sheetEntry.trim() : undefined;
    const headerRowEntry = form.get("headerRow");
    let headerRow: number | undefined;
    if (typeof headerRowEntry === "string" && /^\d+$/.test(headerRowEntry.trim())) {
      const n = Number(headerRowEntry.trim());
      if (n >= 1 && n <= 1000) headerRow = n;
    }

    let parsed: { headers: string[]; rows: string[][]; totalRows: number };
    try {
      parsed = parseImportTableForExecute(bytes, fileEntry.name, { sheet, headerRow });
    } catch (err) {
      if (err instanceof ImportFileError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400 });
      }
      throw err;
    }
    try {
      assertRowLimit(parsed.totalRows);
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "فایل بیش از حد بزرگ است" },
        { status: 400 }
      );
    }
    if (parsed.totalRows === 0) {
      return NextResponse.json({ success: false, error: "داده‌ای برای وارد کردن وجود ندارد" }, { status: 400 });
    }

    /* ---------- نگاشت فیلد → ستون ---------- */
    const mappingRaw = form.get("mapping");
    if (typeof mappingRaw !== "string" || mappingRaw.trim() === "") {
      return NextResponse.json(
        { success: false, error: "نگاشت ستون‌ها ارسال نشده است — فیلد «mapping» الزامی است" },
        { status: 400 }
      );
    }
    let mappingParsed: unknown;
    try {
      mappingParsed = JSON.parse(mappingRaw);
    } catch {
      return NextResponse.json(
        { success: false, error: "mapping باید JSON معتبر باشد — مثال: {\"name\":0,\"salePrice\":2}" },
        { status: 400 }
      );
    }
    const v = validateFieldMapping(mappingParsed, target, parsed.headers);
    if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    const byColumn = v.byColumn;

    // پیش‌اعتبارسنجی فیلدهای الزامی
    const mappedFields = new Set(byColumn.values());
    const missing = requiredFieldsForTarget(target).filter((f) => !mappedFields.has(f.key));
    if (target === "stock") {
      // کالا با کد یا نام — حداقل یکی
      if (!mappedFields.has("productSku") && !mappedFields.has("productName")) {
        missing.push({ key: "productSku|productName", label: "کد کالا یا نام کالا (حداقل یکی)" });
      }
    }
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `فیلدهای الزامی نگاشت نشده‌اند: ${missing.map((m) => `«${m.label}»`).join("، ")}`,
        },
        { status: 400 }
      );
    }

    /* ---------- گزینه‌ها ---------- */
    const dryRun = String(form.get("dryRun") ?? "false") === "true";
    const updateExisting = String(form.get("updateExisting") ?? "false") === "true";
    const autoSku = String(form.get("autoSku") ?? "true") !== "false";

    /* ---------- ساخت ردیف‌های فیلدی ---------- */
    const data = applyFieldMapping(parsed.rows, byColumn);

    /* ---------- اجرا ---------- */
    let result: ImporterResult;
    if (target === "stock") {
      result = await importStock(
        data,
        tenantId,
        req,
        fileEntry.name.slice(0, 200),
        updateExisting,
        dryRun
      );
    } else {
      const entity = delegatedEntity(target)!;
      const authorization = req.headers.get("authorization");
      result = await delegateImport(
        entity,
        data,
        { dryRun, updateExisting, autoSku, fileName: fileEntry.name.slice(0, 200) },
        authorization
      );
    }

    return NextResponse.json({
      success: true,
      mode: dryRun ? "validate" : "import",
      targetType: target,
      totalRows: parsed.totalRows,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      skippedRows: result.skippedRows,
    });
  } catch (error) {
    console.error("Import execute error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error && error.message && !error.message.includes("fetch failed")
            ? error.message
            : "خطا در اجرای درون‌ریزی — ساختار فایل را بررسی کنید و دوباره تلاش کنید",
      },
      { status: 500 }
    );
  }
}
