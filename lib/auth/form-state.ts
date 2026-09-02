/** حالة موحّدة لإجراءات النماذج: نجاح صامت، أو خطأ عام، أو أخطاء بالحقل. */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  notice?: string;
};

export const EMPTY_FORM_STATE: FormState = {};

/** يحوّل أخطاء Zod إلى خريطة حقل ← رسالة، فتُعرَض كلٌّ أسفل حقلها (§١١.٦). */
export function toFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}
