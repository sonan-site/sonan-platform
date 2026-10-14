"use server";

import { cookies, headers } from "next/headers";
import { DEFAULT_LANDING, safeNext } from "@/lib/auth/safe-next";
import { NEXT_COOKIE } from "@/lib/auth/next-cookie";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
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

  // الوجهة (صفحة التسجيل مثلاً) تُحفظ في كوكيٍّ قصير يقرؤه التفعيل — لا في رابط الرسالة،
  // فلا تتغيّر قائمة الروابط المسموحة في Supabase (رحلة التسجيل ت٤ · المراجعة م١).
  const next = safeNext(form.get("next"));
  const jar = await cookies();
  if (next !== DEFAULT_LANDING) jar.set(NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 });
  else jar.delete(NEXT_COOKIE);

  const origin = (await headers()).get("origin") ?? "";
  await sendRecovery(parsed.data.email, `${origin}/auth/link?next=/activate`);

  // **الجواب واحد نجح الإرسال أم فشل**: تمييزهما يحوّل الصفحة إلى أداة تعدّ
  // البُرد المسجَّلة عندنا.
  return { notice: SAME_ANSWER };
}

