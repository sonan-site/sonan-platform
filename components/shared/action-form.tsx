"use client";

import { startTransition, useEffect, useRef, type FormEvent, type FormHTMLAttributes } from "react";
import type { FormState } from "@/lib/auth/form-state";

/**
 * نموذج إجراء **لا يمسح ما كُتب إن فشل الحفظ**.
 *
 * React يُفرغ النموذج بعد كل إجراء، نجح أو فشل — فمن أخطأ في خانة يعيد كتابة
 * الكل. هنا يُرسَل الإجراء يدوياً، ويُفرَّغ النموذج **بعد النجاح وحده**. وعند
 * الخطأ تُمسح كلمات المرور فقط: لا تبقى مكتوبة على شاشة قد يراها غيره.
 *
 * `action` يبقى على العنصر: قبل تحميل السكربت يُرسل React النموذج بطريقته
 * الآمنة، ولا تتسرّب الحقول إلى العنوان.
 */
export function ActionForm({
  action,
  state,
  children,
  ...rest
}: Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (payload: FormData) => void;
  state: FormState;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    const form = ref.current;
    if (!submitted.current || !form) return;
    submitted.current = false;

    if (state.error || state.fieldErrors) {
      // `data-password` لا `type`: الخانة المعروضة بالعين نوعها `text` حينها.
      for (const input of form.querySelectorAll<HTMLInputElement>(
        'input[type="password"], input[data-password]',
      )) {
        input.value = "";
      }
    } else {
      form.reset();
    }
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const payload = new FormData(event.currentTarget, submitter);
    submitted.current = true;
    startTransition(() => action(payload));
  }

  return (
    <form {...rest} ref={ref} action={action} onSubmit={onSubmit}>
      {children}
    </form>
  );
}
