"use server";

import { revalidatePath } from "next/cache";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { userMessage } from "@/lib/db/messages";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { identityInput, identitySchema } from "@/lib/validation/identity";
import { profileInput, profileSchema } from "@/lib/validation/profile";
import { z } from "@/lib/validation/z";

/**
 * تعديل الإدارة لبيانات المشارك (adr/0059). والسجلّ لا يُكتب هنا: مشغّلا الجدولين يسجّلان كل تعديلٍ
 * أيّاً كان طريقه، ويُشعران صاحبه.
 */

/** خرج التعديل عن شرط مشاركةٍ حيّة — يُعرض نصّه، ويُعاد الحفظ به نفسه تأكيداً (`SNFIT`). */
export type EditState = FormState & { confirm?: string };

export async function updateAccountProfile(
  userId: string,
  seenUpdatedAt: string,
  _prev: EditState,
  form: FormData,
): Promise<EditState> {
  if (!z.uuid().safeParse(userId).success) return { error: "حساب غير معروف." };
  const parsed = profileSchema.safeParse(profileInput(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const authz = await authorizeRequest({ permission: "users.write" });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { error } = await db.rpc("fn_admin_update_profile", {
    p_user_id: userId,
    p_data: parsed.data,
    p_seen_updated_at: seenUpdatedAt,
    // نصّ التنبيه الذي رآه الإداري — يحمله زرّ «احفظ رغم ذلك» وحده، والقاعدة تقارنه بالتنبيه الحالي.
    ...(typeof form.get("confirmed") === "string" && form.get("confirmed") ? { p_confirmed: String(form.get("confirmed")) } : {}),
  });
  // خطأٌ مع التأكيد: النموذج يُبقي ما كُتب على الخطأ وحده (`ActionForm`)، فيُعاد بالتأكيد كما هو.
  if (error?.code === "SNFIT") return { confirm: error.message, error: "لم يُحفظ بعد — راجع التنبيه ثم أكّد." };
  if (error) return { error: userMessage(error, "تعذّر حفظ البيانات. أعد المحاولة.") };

  revalidatePath(`/participants/${userId}`);
  revalidatePath("/participants");
  return { notice: "حُفظت البيانات. وما تغيّر منها يصل صاحبَ الحساب إشعارٌ بأسمائه." };
}

/**
 * الهوية: رقم الوثيقة **فارغاً يعني بلا تغيير** — فلا يُمحى رقمٌ مثبَّت فيعود مفتوحاً لصاحبه يكتب غيره.
 * وجوال وليّ الأمر كما في «هويتي»: الفارغ يُفرغه. والكتابة بصلاحية من يطلب (`identities.write`).
 */
export async function updateAccountIdentity(userId: string, _prev: FormState, form: FormData): Promise<FormState> {
  if (!z.uuid().safeParse(userId).success) return { error: "حساب غير معروف." };
  const parsed = identitySchema.safeParse(identityInput(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const authz = await authorizeRequest({ permission: "identities.write" });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data: profile } = await db.from("profiles").select("purge_after").eq("user_id", userId).maybeSingle();
  if (!profile) return { error: "حساب غير معروف." };
  if (profile.purge_after) return { error: "الحساب في سلّة المحذوفات — استعِده أولاً ثم عدّل هويته." };

  const row = {
    guardian_phone: parsed.data.guardian_phone,
    ...(parsed.data.national_id ? { national_id: parsed.data.national_id } : {}),
  };
  const { data: existing } = await db.from("profile_identities").select("id").eq("user_id", userId).maybeSingle();
  const { error } = existing
    ? await db.from("profile_identities").update(row).eq("id", existing.id)
    : await db.from("profile_identities").insert({ user_id: userId, ...row });
  if (error) {
    return { error: userMessage(error, "تعذّر حفظ الهوية.", "هذا الرقم مسجّلٌ لحسابٍ آخر — ابحث عنه برقم الوثيقة.") };
  }

  revalidatePath(`/participants/${userId}`);
  return { notice: "حُفظت الهوية. وما تغيّر منها يصل صاحبَ الحساب إشعارٌ بأسمائه." };
}
