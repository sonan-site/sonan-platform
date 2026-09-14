"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import { assignRoleSchema } from "@/lib/validation/auth";

/**
 * الإسناد. **BR-ROLE-01 مفروضة في القاعدة** عبر سياسة user_roles التي تستدعي
 * fn_can_grant_role: لا يمنح أحد نفسه، ولا يمنح ما لا يملك. الفحص هنا طبقة
 * أولى تُعطي رسالة مفهومة؛ والقاعدة هي الطبقة التي لا تُلتَفّ.
 */
export async function assignRole(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = assignRoleSchema.safeParse({
    userId: form.get("userId"),
    roleId: form.get("roleId"),
    scopeProgramId: form.get("scopeProgramId") || null,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const authz = await authorizeRequest({
    permission: "roles.assign",
    programId: parsed.data.scopeProgramId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { error } = await db.from("user_roles").insert({
    user_id: parsed.data.userId,
    role_id: parsed.data.roleId,
    scope_program_id: parsed.data.scopeProgramId,
  });

  if (error) {
    // رفض السياسة = محاولة منح ما لا يملكه المُسنِد، أو منح نفسه.
    return {
      error:
        error.code === "23505"
          ? "هذا الدور مُسنَد له سلفاً."
          : "تعذّر إسناد الدور: لا تمنح نفسك دوراً، ولا دوراً فيه صلاحية لا تملكها.",
    };
  }

  // لا إبطال جلسات: الصلاحيات تُقرأ حيّة من القاعدة في كل طلب، فالتغيير ينفذ فوراً.
  await db.rpc("fn_write_audit", {
    p_action: "role_assigned",
    p_entity_table: "user_roles",
    p_after: parsed.data,
  });

  revalidatePath("/roles");
  return { notice: "أُسنِد الدور." };
}

export async function revokeRole(assignmentId: string): Promise<FormState> {
  if (!z.uuid().safeParse(assignmentId).success) return { error: "إسناد غير معروف." };

  const authz = await authorizeRequest({ permission: "roles.assign" });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data, error } = await db
    .from("user_roles")
    .update({ deleted_at: nowIso() })
    .eq("id", assignmentId)
    .is("deleted_at", null)
    .select("id");

  if (error || !data?.length) {
    return { error: "تعذّر سحب الدور: لا تسحب دورك أنت، ولا دوراً فيه صلاحية لا تملكها." };
  }

  await db.rpc("fn_write_audit", {
    p_action: "role_revoked",
    p_entity_table: "user_roles",
    p_entity_id: assignmentId,
  });

  revalidatePath("/roles");
  return EMPTY_FORM_STATE;
}
