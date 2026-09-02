"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { withinRateLimit } from "@/lib/auth/rate-limit";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { revokeSessions, sendInvite } from "@/lib/mail";
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

  const origin = (await headers()).get("origin") ?? "";
  const sent = await sendInvite(parsed.data.email, `${origin}/auth/callback?next=/activate`);
  if (!sent.ok) return { error: `تعذّر إرسال الدعوة: ${sent.reason}` };

  const db = await createClient();
  await db.rpc("fn_write_audit", {
    p_action: "user_invited",
    p_entity_table: "profiles",
    p_after: { email: parsed.data.email, full_name: parsed.data.fullName },
  });

  revalidatePath("/users");
  return { notice: `أُرسلت الدعوة إلى ${parsed.data.email}.` };
}

/** الإيقاف = deleted_at + **إبطال الجلسات فوراً** (platform.md §٩). */
export async function suspendUser(userId: string): Promise<FormState> {
  const authz = await authorizeRequest({ permission: "users.write" });
  if (!authz.ok) return { error: authz.message };

  const session = await getSession();
  if (session.status === "active" && session.userId === userId) {
    return { error: "لا توقف حسابك بنفسك." };
  }

  const db = await createClient();
  const { data: before } = await db
    .from("profiles")
    .select("id, deleted_at")
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = await db
    .from("profiles")
    .update({ deleted_at: nowIso() })
    .eq("user_id", userId);
  if (error) return { error: "تعذّر إيقاف الحساب." };

  await revokeSessions(userId);
  await db.rpc("fn_write_audit", {
    p_action: "user_suspended",
    p_entity_table: "profiles",
    p_entity_id: before?.id ?? undefined,
    p_before: before ?? undefined,
    p_after: { deleted_at: "now" },
  });

  revalidatePath("/users");
  return EMPTY_FORM_STATE;
}

export async function restoreUser(userId: string): Promise<FormState> {
  const authz = await authorizeRequest({ permission: "users.write" });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { error } = await db.from("profiles").update({ deleted_at: null }).eq("user_id", userId);
  if (error) return { error: "تعذّر إعادة تفعيل الحساب." };

  await db.rpc("fn_write_audit", {
    p_action: "user_restored",
    p_entity_table: "profiles",
    p_after: { user_id: userId },
  });

  revalidatePath("/users");
  return EMPTY_FORM_STATE;
}
