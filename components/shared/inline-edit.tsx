"use client";

import { useTransition } from "react";
import { reportAction } from "./action-notice";
import { Input } from "./form";
import type { FormState } from "@/lib/auth/form-state";

/**
 * حقلٌ يُعدَّل في موضعه ويُحفظ عند مغادرته — **الواحد** لكل تصحيح في الجداول والبطاقات.
 *
 * غير مُتحكَّم به، و`key` مربوط بالقيمة الخادمية: بعد الحفظ تُعاد القيمة من
 * الخادم فيُبنى الحقل عليها من جديد. فإن رُفض التعديل عاد النصّ القديم، وظهرت
 * رسالة الرفض — لا يبقى في الحقل ما لم يُحفظ.
 */
export function InlineText({
  label,
  value,
  onSave,
  maxInlineSize = "16rem",
  allowEmpty = false,
  latin = false,
}: {
  label: string;
  value: string;
  onSave: (next: string) => Promise<FormState>;
  maxInlineSize?: string;
  /** يُحفظ الفراغ — لحقلٍ فراغُه معنى («بلا سقف»، «بلا وصف»). */
  allowEmpty?: boolean;
  latin?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Input
      key={value}
      aria-label={label}
      defaultValue={value}
      disabled={pending}
      latin={latin}
      style={{ maxInlineSize }}
      onBlur={(e) => {
        const next = e.currentTarget.value.trim();
        if ((!next && !allowEmpty) || next === value) return;
        startTransition(async () => reportAction(await onSave(next)));
      }}
    />
  );
}

export function InlineNumber({
  label,
  value,
  onSave,
  min = 0.25,
  step = 0.25,
}: {
  label: string;
  value: number;
  onSave: (next: number) => Promise<FormState>;
  min?: number;
  step?: number;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Input
      key={value}
      aria-label={label}
      type="number"
      min={min}
      step={step}
      numeric
      defaultValue={value}
      disabled={pending}
      style={{ maxInlineSize: "5.5rem" }}
      onBlur={(e) => {
        const next = Number(e.currentTarget.value);
        if (!Number.isFinite(next) || next <= 0 || next === value) return;
        startTransition(async () => reportAction(await onSave(next)));
      }}
    />
  );
}
