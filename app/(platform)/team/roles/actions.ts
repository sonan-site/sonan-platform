"use server";

import { revalidatePath } from "next/cache";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import { PERMISSIONS, type PermissionCode } from "@/config/permissions";
import { z } from "@/lib/validation/z";

/**
 * الأدوار — إنشاؤها وتسميتها وتأشير صلاحياتها.
 *
 * **كان الدور يُقرأ ولا يُصنع:** `roles.write` معرَّفة ومحروسة في القاعدة بلا
 * شاشة، فالدور الوحيد دور البذرة النظامي، و«منسّق برنامج» الذي تَعِد به
 * الشاشة لا سبيل إليه (`adr/0031`).
 *
 * **والحارس في القاعدة:** لا يُنشئ إلا من يملك `roles.write`، ولا يمنح دوراً
 * صلاحيةً لا يملكها هو، ولا يُمسّ دورٌ نظاميّ — كلّه في سياسات الهجرة ٠٢٦،
 * وهذه الإجراءات تُعطي رسائله بلغة المستخدم.
 */

const nameSchema = z.object({ name: z.string().trim().min(2, "اسم الدور حرفان فأكثر").max(60, "اسم الدور طويل") });
const idSchema = z.uuid();

function denied(message: string): FormState {
  return { error: message };
}

export async function createRole(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = nameSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const authz = await authorizeRequest({ permission: "roles.write" });
  if (!authz.ok) return denied(authz.message);

  const db = await createClient();
  const { data, error } = await db
    .from("roles")
    .insert({ name: parsed.data.name })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return denied(error?.code === "23505" ? "لهذا الاسم دورٌ سلفاً." : "تعذّر إنشاء الدور.");
  }

  await db.rpc("fn_write_audit", {
    p_action: "role_created",
    p_entity_table: "roles",
    p_entity_id: data.id,
    p_after: { name: parsed.data.name },
  });

  revalidatePath("/team/roles");
  return { notice: "أُنشئ الدور. أشِّر صلاحياته أدناه." };
}

export async function renameRole(roleId: string, name: string): Promise<FormState> {
  const parsed = nameSchema.safeParse({ name });
  if (!idSchema.safeParse(roleId).success || !parsed.success) return denied("اسم غير صالح.");

  const authz = await authorizeRequest({ permission: "roles.write" });
  if (!authz.ok) return denied(authz.message);

  const db = await createClient();
  const { data, error } = await db
    .from("roles")
    .update({ name: parsed.data.name })
    .eq("id", roleId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return denied("تعذّر تغيير الاسم — الدور النظامي لا يُعدَّل.");

  revalidatePath("/team/roles");
  return { notice: "تغيّر اسم الدور." };
}

/**
 * تأشير صلاحية أو رفعها — صفٌّ حيّ أو محذوف حذفاً ليّناً.
 *
 * الحذف الليّن لا الحذف: من رُفعت عنه صلاحية يبقى أثرها في السجل، والسياسة
 * تسمح بالتحديث لا بالحذف.
 */
export async function setRolePermission(
  roleId: string,
  code: string,
  granted: boolean,
): Promise<FormState> {
  if (!idSchema.safeParse(roleId).success || !(code in PERMISSIONS)) return denied("صلاحية غير معروفة.");

  const authz = await authorizeRequest({ permission: "roles.write" });
  if (!authz.ok) return denied(authz.message);
  // لا يمنح أحدٌ ما لا يملكه — والقاعدة تفرضها كذلك في سياسة role_permissions.
  const holds = await authorizeRequest({ permission: code as PermissionCode });
  if (granted && !holds.ok) return denied("لا تمنح صلاحية لا تملكها أنت.");

  const db = await createClient();
  const { data: existing } = await db
    .from("role_permissions")
    .select("id, deleted_at")
    .eq("role_id", roleId)
    .eq("permission_code", code)
    .maybeSingle();

  const write = existing
    ? db
        .from("role_permissions")
        .update({ deleted_at: granted ? null : nowIso() })
        .eq("id", existing.id)
        .select("id")
    : granted
      ? db.from("role_permissions").insert({ role_id: roleId, permission_code: code }).select("id")
      : null;

  if (write) {
    const { data, error } = await write;
    if (error || !data?.length) {
      return denied("تعذّر تعديل الصلاحية — الدور النظامي لا تُعدَّل صلاحياته.");
    }
  }

  await db.rpc("fn_write_audit", {
    p_action: granted ? "role_permission_granted" : "role_permission_revoked",
    p_entity_table: "role_permissions",
    p_entity_id: existing?.id,
    p_after: { role_id: roleId, permission_code: code },
  });

  revalidatePath("/team/roles");
  return EMPTY_FORM_STATE;
}

/** الدور يُحذف حذفاً ليّناً، ولا يُحذف وهو مُسنَد — سحب الإسناد أولاً. */
export async function deleteRole(roleId: string): Promise<FormState> {
  if (!idSchema.safeParse(roleId).success) return denied("دور غير معروف.");

  const authz = await authorizeRequest({ permission: "roles.write" });
  if (!authz.ok) return denied(authz.message);

  const db = await createClient();
  const { count } = await db
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) return denied("الدور مُسنَد لأشخاص. اسحب إسناداته أولاً.");

  const { data, error } = await db
    .from("roles")
    .update({ deleted_at: nowIso() })
    .eq("id", roleId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return denied("تعذّر حذف الدور — الدور النظامي لا يُحذف.");

  await db.rpc("fn_write_audit", {
    p_action: "role_deleted",
    p_entity_table: "roles",
    p_entity_id: roleId,
  });

  revalidatePath("/team/roles");
  return { notice: "حُذف الدور." };
}
