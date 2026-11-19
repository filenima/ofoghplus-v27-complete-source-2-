"use client";

/**
 * ============================================================
 * UniversalImportDialog — v20-E / R28-8: درون‌ریزی همه‌جا
 * ============================================================
 * پوشش نازکِ Dialog دور کامپوننت کامل ویزارد درون‌ریزی
 * (ImportColumnMapper — پارس اکسل/CSV/JSON، نگاشت دستی ستون‌ها،
 * شیت‌های چندگانه، انتخاب ردیف سرستون، مقادیر پیش‌فرض، پیش‌تنظیم‌های
 * نام‌دار، پیش‌بینی نتیجه (dryRun) و استراتژی تکراری).
 *
 * هدف: همان ویزارد حرفه‌ای ماژول «واردات و صادرکرد داده» از دل
 * هر ماژول دیگری (انبار، فاکتورها، CRM، حساب‌ها، چک‌ها، کارکنان…)
 * بدون کپی‌کد — موجودیت از بیرون «قفل» می‌شود (fixedEntity) تا
 * کاربر همان داده‌ای را وارد کند که از این ماژول انتظار دارد.
 *
 * Props:
 *   open / onOpenChange  — کنترل دیالوگ (مثل هر Dialog دیگر)
 *   entity               — نوع دادهٔ API: products | parties | invoices |
 *                          accounts | journalEntries | checks | employees
 *                          («parties» داخل mapper به «customers» ترجمه می‌شود)
 *   onImported           — بعد از هر ایمپورت کامل (برای تازه‌کردن لیست ماژول)
 * ============================================================
 */

import * as React from "react";
import { UploadCloud } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportColumnMapper, type MapperEntity } from "@/components/ux/import-column-mapper";
import { useToast } from "@/hooks/use-toast";

/** نوع دادهٔ سمت API (قرارداد POST /api/import) */
export type UniversalImportEntity =
  | "products"
  | "parties"
  | "invoices"
  | "accounts"
  | "journalEntries"
  | "checks"
  | "employees";

export interface UniversalImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** موجودیت هدف درون‌ریزی — از بیرون قفل می‌شود */
  entity: UniversalImportEntity;
  /** بعد از ایمپورت (تازه‌کردن لیست ماژول فراخواننده) */
  onImported?: () => void;
}

/** عنوان و توضیح دیالوگ برای هر موجودیت (فارسی) */
const DIALOG_META: Record<UniversalImportEntity, { title: string; description: string }> = {
  products: {
    title: "وارد کردن کالاها از فایل",
    description:
      "اکسل (XLSX/XLSM/XLSB/XLS)، ODS، CSV، TSV، TXT و JSON — خروجی هلو/سپیدار/محک مستقیم پذیرفته می‌شود؛ هر ستون را دستی نگاشت کنید، ردیف سرستون را انتخاب کنید و نگاشت را با نام ذخیره کنید.",
  },
  parties: {
    title: "وارد کردن مشتریان",
    description:
      "لیست مشتریان/طرف‌حساب‌ها را از فایل وارد کنید — ستون‌ها را خودتان به فیلدهای هدف نگاشت دهید، مقادیر پیش‌فرض بدهید و قبل از ثبت، پیش‌بینی نتیجه (جدید/به‌روز/تکراری) را ببینید.",
  },
  invoices: {
    title: "وارد کردن فاکتورها",
    description:
      "فاکتورهای فروش و خرید را از فایل وارد کنید — شماره، تاریخ، مشتری و اقلام با نگاشت دستی ستون‌ها.",
  },
  accounts: {
    title: "وارد کردن حساب‌ها",
    description:
      "کدینگ حساب‌ها (کل/معین/تفصیلی) را با کد، نام، ماهیت و مانده اولیه از فایل وارد کنید.",
  },
  journalEntries: {
    title: "وارد کردن اسناد حسابداری",
    description:
      "اسناد حسابداری را ردیف‌به‌ردیف وارد کنید — هر ردیف: شماره سند، کد حساب، بدهکار/بستانکار.",
  },
  checks: {
    title: "وارد کردن چک‌ها",
    description:
      "چک‌های دریافتنی و پرداختنی را با شماره، مبلغ، سررسید و بانک از فایل وارد کنید.",
  },
  employees: {
    title: "وارد کردن کارکنان",
    description:
      "فهرست کارکنان را با کد ملی، سمت، حقوق پایه و شماره شبا از فایل وارد کنید.",
  },
};

/** entity سمت API → entity داخلی mapper (فقط «parties» → «customers») */
function toMapperEntity(entity: UniversalImportEntity): MapperEntity {
  return (entity === "parties" ? "customers" : entity) as MapperEntity;
}

export function UniversalImportDialog({
  open,
  onOpenChange,
  entity,
  onImported,
}: UniversalImportDialogProps) {
  const { toast } = useToast();
  const meta = DIALOG_META[entity];
  const mapperEntity = React.useMemo(() => toMapperEntity(entity), [entity]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* واکنش‌گرا: موبایل ~۹۵٪ عرض صفحه؛ تبلت/لپ‌تاپ پله‌ای بازتر — بدون بیرون‌زدگی
          (نکته: base کلاس sm:max-w-lg دارد؛ برای باز کردن عرض باید همان variant بازنویسی شود) */}
      <DialogContent
        className="w-[95vw] max-w-[95vw] gap-3 sm:max-w-2xl md:max-w-4xl lg:max-w-5xl max-h-[92dvh] overflow-y-auto p-4 sm:p-5"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-primary" />
            {meta.title}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>
        <ImportColumnMapper
          entity={mapperEntity}
          /* موجودیت قفل است — سلکتور داخلی مخفی می‌شود */
          fixedEntity
          /* فراخوانی نمی‌شود (fixedEntity) ولی قرارداد کامپوننت کنترل‌شده حفظ می‌شود */
          onEntityChange={() => {
            /* موجودیت قفل است */
          }}
          onImported={() => {
            toast({
              title: "لیست در حال به‌روزرسانی است",
              description: "داده‌های تازه واردشده چند لحظه بعد در لیست نمایش داده می‌شوند.",
            });
            onImported?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
