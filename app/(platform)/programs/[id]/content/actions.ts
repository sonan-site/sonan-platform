"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";

/**
 * إعداد المادة والحقول والقوالب — كله إعداد برنامج، فصلاحيته `programs.write`
 * بنطاق البرنامج. لا رمز مستقل: رمزٌ بلا حارس يستهلكه صلاحية بصرية معكوسة.
 */

async function guard(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  return authz.ok ? null : { error: authz.message };
}

// ── المادة المرقَّمة ──

const bulkSchema = z.object({
  programId: z.uuid(),
  startAt: z.coerce.number().int().min(1, "رقم البداية عدد موجب"),
  lines: z
    .string()
    .transform((v) =>
      v
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    )
    .refine((l) => l.length > 0, "أدخل سطراً واحداً على الأقل"),
});

/** إدخال المادة سطراً سطراً: كل سطر وحدة، والترقيم متتابع من رقم البداية. */
export async function addContentUnits(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = bulkSchema.safeParse({
    programId: form.get("programId"),
    startAt: form.get("startAt"),
    lines: form.get("lines") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const rows = parsed.data.lines.map((label, i) => ({
    program_id: parsed.data.programId,
    sequence: parsed.data.startAt + i,
    label,
  }));

  const db = await createClient();
  const { error } = await db.from("content_units").insert(rows);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "رقم مستخدَم سلفاً في هذا البرنامج. غيّر رقم البداية."
          : "تعذّر إدخال المادة.",
    };
  }

  await db.rpc("fn_write_audit", {
    p_action: "content_units_added",
    p_entity_table: "content_units",
    p_after: { program_id: parsed.data.programId, count: rows.length },
  });

  revalidatePath(`/programs/${parsed.data.programId}/content`);
  return { notice: `أُدخلت ${rows.length} وحدة.` };
}

// ── مقاطع المسار ──

const FROZEN_RANGES = "بدأ مشاركو هذا المسار الإرسال، فنصيبه من المادة لا يُعدَّل الآن.";

const rangeSchema = z.object({
  programId: z.uuid(),
  trackId: z.uuid("اختر مساراً"),
  fromSequence: z.coerce.number().int().min(1, "بداية النصيب رقم من ١ فأكثر"),
  toSequence: z.coerce.number().int().min(1, "نهاية النصيب رقم من ١ فأكثر"),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

/**
 * `adr/0021` — المقطع. **منع التداخل قيدٌ في القاعدة** لا فحصٌ هنا:
 * التداخل يفسد الرتبة ويجعل وحدة تُحسب مرتين، والقيد يمنعه عند الكتابة.
 */
export async function addTrackRange(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = rangeSchema.safeParse({
    programId: form.get("programId"),
    trackId: form.get("trackId"),
    fromSequence: form.get("fromSequence"),
    toSequence: form.get("toSequence"),
    sortOrder: form.get("sortOrder") || 0,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  if (parsed.data.toSequence < parsed.data.fromSequence) {
    return { fieldErrors: { toSequence: "النهاية قبل البداية" } };
  }

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db.from("track_content_ranges").insert({
    track_id: parsed.data.trackId,
    from_sequence: parsed.data.fromSequence,
    to_sequence: parsed.data.toSequence,
    sort_order: parsed.data.sortOrder,
  });

  if (error) {
    return {
      error: /exclusion|overlap/i.test(error.message)
        ? "هذا النصيب يتداخل مع نصيب آخر لهذا المسار. اختر أرقاماً لا تتقاطع معه."
        : /ذوو إنجاز/.test(error.message)
          ? FROZEN_RANGES
          : "تعذّر إضافة النصيب.",
    };
  }

  revalidatePath(`/programs/${parsed.data.programId}/content`);
  return { notice: "أُضيف النصيب." };
}

export async function removeTrackRange(rangeId: string, programId: string): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  // المقطع يُقيَّد ببرنامج التصريح عبر مساره قبل أن يُمسّ.
  const { data: owned } = await db
    .from("track_content_ranges")
    .select("id, tracks!inner(program_id)")
    .eq("id", rangeId)
    .eq("tracks.program_id", programId)
    .maybeSingle();
  if (!owned) return { error: "تعذّر حذف النصيب." };

  const { data, error } = await db
    .from("track_content_ranges")
    .update({ deleted_at: nowIso() })
    .eq("id", rangeId)
    .is("deleted_at", null)
    .select("id");
  if (error && /ذوو إنجاز/.test(error.message)) return { error: FROZEN_RANGES };
  if (error || !data?.length) return { error: "تعذّر حذف النصيب." };

  revalidatePath(`/programs/${programId}/content`);
  return EMPTY_FORM_STATE;
}

// ── حقول الواجب ──

const fieldSchema = z.object({
  programId: z.uuid(),
  label: z.string().trim().min(2, "اسم الواجب مطلوب"),
  kind: z.enum(["ranged", "counted"]),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export async function addTaskField(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = fieldSchema.safeParse({
    programId: form.get("programId"),
    label: form.get("label"),
    kind: form.get("kind"),
    sortOrder: form.get("sortOrder") || 0,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db.from("task_fields").insert({
    program_id: parsed.data.programId,
    label: parsed.data.label,
    kind: parsed.data.kind,
    sort_order: parsed.data.sortOrder,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "هذا الاسم مستخدَم لواجب آخر في البرنامج." : "تعذّر إضافة الواجب.",
    };
  }

  revalidatePath(`/programs/${parsed.data.programId}/content`);
  return { notice: "أُضيف الواجب." };
}

// ── قوالب الأيام ──

export async function addDayTemplate(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ programId: z.uuid(), name: z.string().trim().min(2, "اسم شكل اليوم مطلوب") })
    .safeParse({ programId: form.get("programId"), name: form.get("name") });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db
    .from("day_templates")
    .insert({ program_id: parsed.data.programId, name: parsed.data.name });
  if (error) {
    return {
      error: error.code === "23505" ? "هذا الاسم مستخدَم لشكل يوم آخر." : "تعذّر إنشاء شكل اليوم.",
    };
  }

  revalidatePath(`/programs/${parsed.data.programId}/content`);
  return { notice: "أُنشئ شكل اليوم. أضف إليه الواجبات ومقاديرها." };
}

const templateFieldSchema = z.object({
  programId: z.uuid(),
  dayTemplateId: z.uuid("اختر شكل اليوم"),
  taskFieldId: z.uuid("اختر الواجب"),
  baseAmount: z.coerce.number().positive("المقدار عدد موجب"),
});

export async function addTemplateField(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = templateFieldSchema.safeParse({
    programId: form.get("programId"),
    dayTemplateId: form.get("dayTemplateId"),
    taskFieldId: form.get("taskFieldId"),
    baseAmount: form.get("baseAmount"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db.from("day_template_fields").insert({
    day_template_id: parsed.data.dayTemplateId,
    task_field_id: parsed.data.taskFieldId,
    base_amount: parsed.data.baseAmount,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "هذا الواجب مضاف لشكل اليوم سلفاً." : "تعذّر إضافة الواجب إلى شكل اليوم.",
    };
  }

  revalidatePath(`/programs/${parsed.data.programId}/content`);
  return { notice: "أُضيف الواجب إلى شكل اليوم." };
}
