"use client";

import { Button } from "@/components/shared/form";
import { ErrorState } from "@/components/shared/states";

/**
 * خطأ غير متوقَّع في أي صفحة — بالعربية، وبزرّ إعادة المحاولة.
 * بدونه يعرض الإطار صفحته الإنجليزية، ولا يعرف المستخدم ماذا يفعل.
 * ولا تُعرض تفاصيل الخطأ: نصّه تقني وقد يكشف ما لا يخصّ المستخدم.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ maxInlineSize: "34rem", marginInline: "auto", paddingBlock: "var(--space-10)", paddingInline: "var(--space-4)" }}>
      <ErrorState
        title="حدث خطأ غير متوقَّع"
        body="أعد المحاولة بعد لحظات. وإن تكرّر فأبلغ إدارة البرنامج."
        action={<Button onClick={() => reset()}>أعد المحاولة</Button>}
      />
    </div>
  );
}
