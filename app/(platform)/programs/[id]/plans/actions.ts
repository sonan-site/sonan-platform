"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import type { Json } from "@/lib/db/database.types";

/**
 * الخطة إعداد برنامج: صلاحيتها `programs.write` بنطاق البرنامج.
 *
 * **والكتابة كلها من دوالّ القاعدة** (`adr/0036`): `fn_create_plan` تنشئ،
 * و`fn_save_plan` تكتب القيم وتفحصها وتحفظ نسخة، و`fn_remove_custom_plan` تُرجع
 * المسار إلى الافتراضية. فالتحقّق والقفل في موضع واحد.
 */
async function guard(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  return authz.ok ? null : { error: authz.message };
}

const ARABIC = /[؀-ۿ]/;

/** رسائل دوالّ الخطة مكتوبةٌ بلغة المُعِدّ، فتُعرض كما هي. */
function planMessage(error: { message: string } | null, fallback: string): string {
  if (error && ARABIC.test(error.message)) return error.message.endsWith(".") ? error.message : `${error.message}.`;
  return fallback;
}

function plansPath(programId: string, planId?: string): void {
  revalidatePath(`/programs/${programId}/plans`);
  if (planId) revalidatePath(`/programs/${programId}/plans/${planId}`);
}

const ids = z.object({ programId: z.uuid(), trackId: z.uuid().nullable() });

/** الخطة الافتراضية للبرنامج — يرثها كل مسار بلا مخصّصة. */
export async function createDefaultPlan(programId: string): Promise<FormState & { planId?: string }> {
  if (!ids.safeParse({ programId, trackId: null }).success) return { error: "برنامج غير معروف." };
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_create_plan", {
    p_program_id: programId,
    p_track_id: null as unknown as string,
    p_copy: false,
  });
  if (error) return { error: planMessage(error, "تعذّر إنشاء الخطة.") };
  plansPath(programId);
  return { notice: "أُنشئت الخطة الافتراضية.", planId: data ?? undefined };
}

/** خطة مخصّصة لمسار — منسوخةً من الافتراضية أو فارغة. */
export async function customizeTrackPlan(
  programId: string,
  trackId: string,
  copy: boolean,
): Promise<FormState & { planId?: string }> {
  if (!ids.safeParse({ programId, trackId }).success) return { error: "مسار غير معروف." };
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_create_plan", {
    p_program_id: programId,
    p_track_id: trackId,
    p_copy: copy,
  });
  if (error) return { error: planMessage(error, "تعذّر تخصيص الخطة.") };
  plansPath(programId);
  return { notice: copy ? "خُصّصت للمسار خطة منسوخة من الافتراضية." : "خُصّصت للمسار خطة فارغة.", planId: data ?? undefined };
}

export async function revertTrackPlan(programId: string, planId: string): Promise<FormState> {
  if (!z.object({ programId: z.uuid(), planId: z.uuid() }).safeParse({ programId, planId }).success) {
    return { error: "خطة غير معروفة." };
  }
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db.rpc("fn_remove_custom_plan", { p_plan_id: planId });
  if (error) return { error: planMessage(error, "تعذّر الرجوع إلى الافتراضية.") };
  plansPath(programId, planId);
  return { notice: "رجع المسار إلى الخطة الافتراضية." };
}

const payloadSchema = z.object({
  day_count: z.number().int().min(1).max(366),
  values: z
    .array(
      z.object({
        day: z.number().int().min(1).max(366),
        field_id: z.uuid(),
        amount: z.number().int().positive().max(999_999).optional(),
        from: z.number().int().positive().max(999_999).optional(),
        to: z.number().int().positive().max(999_999).optional(),
        value: z.number().positive().max(9_999_999).optional(),
        repetition: z.number().int().min(1).max(1000).optional(),
      }),
    )
    .max(366 * 20, "الخطة أكبر من الحدّ: 20 حقلاً في كل يوم على الأكثر"),
});

const saveSchema = z.object({
  programId: z.uuid(),
  planId: z.uuid(),
  note: z.string().trim().max(200).optional(),
  /** النسخة التي بدأ منها المحرّر — يُرفض الحفظ إن حُفظت بعدها أحدث. */
  baseVersion: z.number().int().min(0).optional(),
  payload: payloadSchema,
});

/**
 * حفظ الخطة كاملة — من المحرّر أو الاستيراد أو التعبئة. والقاعدة تفحص على
 * كل مسار يستعملها، وتردّ الحفظ كله بأول ملاحظاتها إن وُجد خطأ.
 */
export async function savePlan(input: {
  programId: string;
  planId: string;
  note?: string;
  baseVersion?: number;
  payload: unknown;
}): Promise<FormState & { version?: number }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const big = parsed.error.issues.find((i) => i.code === "too_big" && i.path.length === 2);
    return { error: big?.message ?? "صيغة الخطة غير صالحة.", fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_save_plan", {
    p_plan_id: parsed.data.planId,
    p_payload: parsed.data.payload as unknown as Json,
    p_note: parsed.data.note ?? "حفظ",
    ...(parsed.data.baseVersion !== undefined ? { p_base_version: parsed.data.baseVersion } : {}),
  });
  if (error) return { error: planMessage(error, "تعذّر حفظ الخطة.") };
  plansPath(parsed.data.programId, parsed.data.planId);
  return { notice: `حُفظت الخطة — النسخة ${data ?? ""}.`, version: data ?? undefined };
}

export async function restorePlanVersion(
  programId: string,
  planId: string,
  versionId: string,
): Promise<FormState> {
  if (!z.object({ programId: z.uuid(), planId: z.uuid(), versionId: z.uuid() }).safeParse({ programId, planId, versionId }).success) {
    return { error: "نسخة غير معروفة." };
  }
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_restore_plan_version", { p_version_id: versionId });
  if (error) return { error: planMessage(error, "تعذّر الرجوع إلى النسخة.") };
  plansPath(programId, planId);
  return { notice: `رجعت الخطة إلى النسخة المختارة — وحُفظت نسخةً ${data ?? ""}.` };
}

// ── قوالب الاستيراد (adr/0042) ──

const mappingSchema = z.object({
  headerRow: z.boolean(),
  columns: z
    .array(
      z.object({
        header: z.string().max(200),
        role: z.enum(["ignore", "day", "amount", "from", "to", "value", "repetition", "section", "section_from", "section_to"]),
        fieldId: z.uuid().nullable(),
      }),
    )
    .min(1)
    .max(200),
});

/** يحفظ تعيين الأعمدة باسمٍ في البرنامج — والاسم نفسه يُحدَّث لا يتكرّر. */
export async function saveImportMapping(programId: string, name: string, mapping: unknown): Promise<FormState> {
  const parsed = z
    .object({ programId: z.uuid(), name: z.string().trim().min(1, "اسم القالب مطلوب").max(60), mapping: mappingSchema })
    .safeParse({ programId, name, mapping });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "قالب غير صالح." };
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data: existing } = await db
    .from("plan_import_mappings")
    .select("id")
    .eq("program_id", programId)
    .eq("name", parsed.data.name)
    .is("deleted_at", null)
    .maybeSingle();
  const { error } = existing
    ? await db.from("plan_import_mappings").update({ mapping: parsed.data.mapping as unknown as Json }).eq("id", existing.id)
    : await db
        .from("plan_import_mappings")
        .insert({ program_id: programId, name: parsed.data.name, mapping: parsed.data.mapping as unknown as Json });
  if (error) return { error: "تعذّر حفظ القالب." };
  revalidatePath(`/programs/${programId}/plans`, "layout");
  return { notice: existing ? "حُدِّث القالب." : "حُفظ القالب." };
}

export async function removeImportMapping(programId: string, mappingId: string): Promise<FormState> {
  if (!z.object({ programId: z.uuid(), mappingId: z.uuid() }).safeParse({ programId, mappingId }).success) {
    return { error: "قالب غير معروف." };
  }
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { data, error } = await db
    .from("plan_import_mappings")
    .update({ deleted_at: nowIso() })
    .eq("id", mappingId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حذف القالب." };
  revalidatePath(`/programs/${programId}/plans`, "layout");
  return { notice: "حُذف القالب." };
}
