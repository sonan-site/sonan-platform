"use server";

import { headers } from "next/headers";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { withinRateLimit } from "@/lib/auth/rate-limit";
import { sendRecovery } from "@/lib/mail";
import { recoverySchema } from "@/lib/validation/auth";

const SAME_ANSWER =
  "إن كان البريد مسجَّلاً لدينا فستصلك رسالة خلال دقائق. تحقّق من صندوقك.";

export async function requestRecovery(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = recoverySchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  if (!(await withinRateLimit("auth.recovery", parsed.data.email))) {
    return { error: "طلبات كثيرة. انتظر قليلاً ثم أعد المحاولة." };
  }

  const origin = (await headers()).get("origin") ?? "";
  await sendRecovery(parsed.data.email, `${origin}/auth/callback?next=/activate`);

  // **الجواب واحد نجح الإرسال أم فشل**: تمييزهما يحوّل الصفحة إلى أداة تعدّ
  // البُرد المسجَّلة عندنا.
  return { notice: SAME_ANSWER };
}

export const initialState = EMPTY_FORM_STATE;
