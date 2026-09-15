"use server";

import { revalidatePath } from "next/cache";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { SHOWCASE_KEY, showcaseInput, showcaseSchema } from "@/lib/settings/showcase";

/** شرائح واجهة الدخول — تحقّق ← صلاحية ← حفظ ← تدقيق. */
export async function saveShowcase(_prev: FormState, form: FormData): Promise<FormState> {
  const input = showcaseInput(form);
  const parsed = showcaseSchema.safeParse(input);
  if (!parsed.success) {
    // الخطأ على خانة الشريحة المعنيّة: `slides.1.title` ← `title-1`.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [, index, field] = issue.path;
      const key = typeof index === "number" && typeof field === "string" ? `${field}-${index}` : "_";
      fieldErrors[key] ??= issue.message;
    }
    return Object.keys(fieldErrors).length ? { fieldErrors } : { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const authz = await authorizeRequest({ permission: "settings.write" });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data, error } = await db
    .from("settings")
    .update({ value: parsed.data })
    .eq("key", SHOWCASE_KEY)
    .is("scope_program_id", null)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حفظ الشرائح. أعد المحاولة." };

  await db.rpc("fn_write_audit", {
    p_action: "auth_showcase_updated",
    p_entity_table: "settings",
    p_entity_id: data[0]?.id,
    p_after: parsed.data,
  });

  revalidatePath("/settings");
  return { notice: "حُفظت الشرائح. تظهر في شاشة الدخول الآن." };
}
