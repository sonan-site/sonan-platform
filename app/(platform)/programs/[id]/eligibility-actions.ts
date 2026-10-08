"use server";

import { revalidatePath } from "next/cache";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { eligibilitySchema } from "@/lib/validation/programs";

/** أهلية البرنامج ورقم التسجيل (`adr/0047`) — تُفرض في `fn_register`، وهنا تُضبط. */
export async function saveEligibility(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = eligibilitySchema.safeParse({
    programId: form.get("programId"),
    minAge: form.get("minAge") ?? "",
    allowedGender: form.get("allowedGender") ?? "",
    requireSaudiPhone: form.get("requireSaudiPhone") === "on",
    requireIdentity: form.get("requireIdentity") === "on",
    registrationPrefix: form.get("registrationPrefix") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const v = parsed.data;

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: v.programId,
    resourceProgramId: v.programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const row = {
    min_age: v.minAge,
    allowed_gender: v.allowedGender,
    require_saudi_phone: v.requireSaudiPhone,
    require_identity: v.requireIdentity,
    registration_prefix: v.registrationPrefix,
  };
  const { error } = await db.from("programs").update(row).eq("id", v.programId);
  if (error) return { error: "تعذّر حفظ شروط التسجيل." };

  await db.rpc("fn_write_audit", {
    p_action: "program_eligibility_updated",
    p_entity_table: "programs",
    p_entity_id: v.programId,
    p_after: row,
  });
  revalidatePath(`/programs/${v.programId}`);
  return { notice: "حُفظت شروط التسجيل." };
}
