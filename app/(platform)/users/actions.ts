"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { withinRateLimit } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { sendInvite, setSignInBlocked } from "@/lib/mail";
import { authorizeRequest } from "@/lib/permissions/server";
import { inviteSchema } from "@/lib/validation/auth";

/**
 * كل إجراء هنا يمرّ بالترتيب نفسه:
 *   تحقّق Zod ← فحص رباعي الطبقات ← الفعل ← تدقيق.
 * `completeness-contract §٢.ب`: «كل إجراء خادم يبدأ بالتحقّق ثم الفحص».
 */

export async function inviteUser(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = inviteSchema.safeParse({
    email: form.get("email"),
    fullName: form.get("fullName"),
    phone: form.get("phone"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const authz = await authorizeRequest({ permission: "users.write" });
  if (!authz.ok) return { error: authz.message };

  if (!(await withinRateLimit("auth.invite", authz.userId))) {
    return { error: "دعوات كثيرة في وقت قصير. انتظر قليلاً." };
  }

  // الأصل موثوق هنا: Next يرفض إجراء الخادم إن خالف `Origin` مضيفَ الطلب.
  const origin = (await headers()).get("origin") ?? "";
  const sent = await sendInvite(parsed.data.email, `${origin}/auth/callback?next=/activate`, {
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
  });
  // سبب المزوّد لا يُعرض: نصّه إنجليزي، ويكشف إن كان البريد مسجَّلاً سلفاً.
  if (!sent.ok) return { error: "تعذّر إرسال الدعوة. تحقّق من البريد أو أعد المحاولة بعد قليل." };

  const db = await createClient();
  await db.rpc("fn_write_audit", {
    p_action: "user_invited",
    p_entity_table: "profiles",
    p_after: { email: parsed.data.email, full_name: parsed.data.fullName },
  });

  revalidatePath("/users");
  return { notice: `أُرسلت الدعوة إلى ${parsed.data.email}.` };
}

/**
 * الإيقاف طبقتان: `deleted_at` تُسقط الصلاحيات في القاعدة **في الطلب نفسه**
 * (الهجرة ٠٢٦)، والحظر يمنع تجديد الجلسة فلا تعيش بعد عمر رمزها.
 */
export async function suspendUser(userId: string): Promise<FormState> {
  if (!z.uuid().safeParse(userId).success) return { error: "مستخدم غير معروف." };

  const authz = await authorizeRequest({ permission: "users.write" });
  if (!authz.ok) return { error: authz.message };

  if (authz.userId === userId) return { error: "لا توقف حسابك بنفسك." };

  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .update({ deleted_at: nowIso() })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: "تعذّر إيقاف الحساب." };
  if (!data?.length) return { error: "لم يُوقَف الحساب — ربما كان موقوفاً سلفاً." };

  const blocked = await setSignInBlocked(userId, true);
  await db.rpc("fn_write_audit", {
    p_action: "user_suspended",
    p_entity_table: "profiles",
    p_entity_id: data[0]!.id,
    p_after: { sign_in_blocked: blocked.ok },
  });

  revalidatePath("/users");
  // الصلاحيات سقطت على كل حال؛ ما تعذّر هو قطع الجلسة القائمة فوراً.
  return blocked.ok
    ? EMPTY_FORM_STATE
    : { error: "أُوقف الحساب، لكن تعذّر قطع جلسته القائمة. ستنتهي خلال ساعة." };
}

export async function restoreUser(userId: string): Promise<FormState> {
  if (!z.uuid().safeParse(userId).success) return { error: "مستخدم غير معروف." };

  const authz = await authorizeRequest({ permission: "users.write" });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .update({ deleted_at: null })
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .select("id");
  if (error) return { error: "تعذّر إعادة تفعيل الحساب." };
  if (!data?.length) return { error: "لم يُعَد تفعيل الحساب — ربما كان نشطاً." };

  const unblocked = await setSignInBlocked(userId, false);
  if (!unblocked.ok) {
    return { error: "أُعيد تفعيل الحساب، لكن تعذّر رفع منع الدخول. أعد المحاولة." };
  }

  await db.rpc("fn_write_audit", {
    p_action: "user_restored",
    p_entity_table: "profiles",
    p_entity_id: data[0]!.id,
  });

  revalidatePath("/users");
  return EMPTY_FORM_STATE;
}
