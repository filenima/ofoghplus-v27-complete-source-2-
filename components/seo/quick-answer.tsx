import * as React from "react";
import { Zap } from "lucide-react";

// ============================================================
// components/seo/quick-answer.tsx — بلوک «پاسخ کوتاه» (AEO / R24-7 Agent 4)
// ------------------------------------------------------------
// پاسخ مستقیم ۴۰-۶۰ کلمه‌ای بلافاصله بعد از H1 — برای موتورهای پاسخ‌گو
// (Google AI Overviews، ChatGPT، Perplexity) و جستجوی صوتی.
//
// • RTL + استایل برند (بدون رنگ indigo/blue جدید — از متغیرهای شادcn)
// • کلاس speakable-summary — همان سلکتوری که generateSpeakableSchema
//   به‌عنوان بخش «قابل‌قرائت» معرفی می‌کند (cssSelector: .speakable-summary)
// • با withSchema=true یک Question/Answer JSON-LD سبک هم تزریق می‌کند —
//   فقط برای صفحاتی که FAQPage ندارند (از تکرار اسکیما جلوگیری شود)
// ============================================================

export interface QuickAnswerProps {
  /** پاسخ کوتاه ۴۰-۶۰ کلمه‌ای — مستقیم و بدون مقدمه */
  answer: string;
  /** عنوان/پرسش صفحه — برای اسکیما و aria */
  question: string;
  /** تزریق Question/Answer JSON-LD — فقط وقتی صفحه FAQPage ندارد */
  withSchema?: boolean;
  /** متن برچسب — پیش‌فرض «پاسخ کوتاه» */
  label?: string;
}

export function QuickAnswer({
  answer,
  question,
  withSchema = false,
  label = "پاسخ کوتاه",
}: QuickAnswerProps) {
  // FIX(SEO-3c باگ ۱۱): «Question» تنها و ریشه‌ای در JSON-LD برای گوگل معتبر
  // نیست — طبق مستندات، Question باید داخل FAQPage.mainEntity باشد تا برای
  // نتیجهٔ غنی (rich result) واجد شرط شود. حالا همان Question داخل FAQPage
  // تکی wrap می‌شود (این کامپوننت فقط در صفحاتی با withSchema=true می‌آید که
  // FAQPage دیگری ندارند — ضد تکرار حفظ شده).
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      },
    ],
  };

  return (
    <section
      aria-label={label}
      className="speakable-summary mt-5 rounded-xl border border-primary/25 bg-primary/[0.06] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Zap className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-primary">
            {label}
          </p>
          <p className="text-sm leading-7 text-foreground sm:text-[15px] sm:leading-8">
            {answer}
          </p>
        </div>
      </div>
      {withSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      )}
    </section>
  );
}
