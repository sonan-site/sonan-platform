"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { userMessage } from "@/lib/db/messages";
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
  // يُضاف في آخر الشكل — الترتيب يُعرض للمشارك، فلا يُترك لتساوي الصفر.
  const { count } = await db
    .from("day_template_fields")
    .select("id", { count: "exact", head: true })
    .eq("day_template_id", parsed.data.dayTemplateId)
    .is("deleted_at", null);
  const { error } = await db.from("day_template_fields").insert({
    day_template_id: parsed.data.dayTemplateId,
    task_field_id: parsed.data.taskFieldId,
    base_amount: parsed.data.baseAmount,
    sort_order: count ?? 0,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "هذا الواجب مضاف لشكل اليوم سلفاً." : "تعذّر إضافة الواجب إلى شكل اليوم.",
    };
  }

  revalidatePath(`/programs/${parsed.data.programId}/content`);
  return { notice: "أُضيف الواجب إلى شكل اليوم." };
}

// ══ التصحيح: تعديلٌ وحذف ══
// الحدود في القاعدة (الهجرة ٠٣٣): ما يُتلف عمل مشاركين أو أياماً قائمة يُرفض
// هناك برسالة بلغة المُعِدّ، وتصل هنا كما هي. والإجراء يقيّد المورد ببرنامجه
// ويعدّ الصفوف المتأثرة — فالرفض بالسياسة لا يُقرأ «تمّ».

type Db = Awaited<ReturnType<typeof createClient>>;

const idsSchema = z.object({ programId: z.uuid(), id: z.uuid() });

function contentPath(programId: string): void {
  revalidatePath(`/programs/${programId}/content`);
}

async function guarded(programId: string, id: string): Promise<{ denied: FormState } | { db: Db }> {
  if (!idsSchema.safeParse({ programId, id }).success) return { denied: { error: "عنصر غير معروف." } };
  const denied = await guard(programId);
  if (denied) return { denied };
  return { db: await createClient() };
}

export async function updateContentUnitLabel(
  unitId: string,
  programId: string,
  label: string,
): Promise<FormState> {
  const g = await guarded(programId, unitId);
  if ("denied" in g) return g.denied;
  const text = z.string().trim().min(1).max(500).safeParse(label);
  if (!text.success) return { error: "نصّ الوحدة مطلوب." };

  const { data, error } = await g.db
    .from("content_units")
    .update({ label: text.data })
    .eq("id", unitId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: userMessage(error, "تعذّر تعديل الوحدة.") };

  contentPath(programId);
  return { notice: "عُدِّلت الوحدة." };
}

export async function removeContentUnit(unitId: string, programId: string): Promise<FormState> {
  const g = await guarded(programId, unitId);
  if ("denied" in g) return g.denied;

  const { data, error } = await g.db
    .from("content_units")
    .update({ deleted_at: nowIso() })
    .eq("id", unitId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: userMessage(error, "تعذّر حذف الوحدة.") };

  contentPath(programId);
  return { notice: "حُذفت الوحدة." };
}

export async function renameTaskField(
  fieldId: string,
  programId: string,
  label: string,
): Promise<FormState> {
  const g = await guarded(programId, fieldId);
  if ("denied" in g) return g.denied;
  const text = z.string().trim().min(2).max(60).safeParse(label);
  if (!text.success) return { error: "اسم الواجب حرفان فأكثر." };

  const { data, error } = await g.db
    .from("task_fields")
    .update({ label: text.data })
    .eq("id", fieldId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) {
    return {
      error: userMessage(error, "تعذّر تعديل الواجب.", "هذا الاسم مستخدَم لواجب آخر في البرنامج."),
    };
  }

  contentPath(programId);
  return { notice: "عُدِّل اسم الواجب." };
}

export async function setTaskFieldKind(
  fieldId: string,
  programId: string,
  kind: "ranged" | "counted",
): Promise<FormState> {
  const g = await guarded(programId, fieldId);
  if ("denied" in g) return g.denied;
  if (kind !== "ranged" && kind !== "counted") return { error: "اختر النوع من القائمة." };

  const { data, error } = await g.db
    .from("task_fields")
    .update({ kind })
    .eq("id", fieldId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: userMessage(error, "تعذّر تغيير نوع الواجب.") };

  contentPath(programId);
  return { notice: "تغيّر نوع الواجب." };
}

export async function removeTaskField(fieldId: string, programId: string): Promise<FormState> {
  const g = await guarded(programId, fieldId);
  if ("denied" in g) return g.denied;

  const { data, error } = await g.db
    .from("task_fields")
    .update({ deleted_at: nowIso() })
    .eq("id", fieldId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: userMessage(error, "تعذّر حذف الواجب.") };

  contentPath(programId);
  return { notice: "حُذف الواجب." };
}

export async function renameDayTemplate(
  templateId: string,
  programId: string,
  name: string,
): Promise<FormState> {
  const g = await guarded(programId, templateId);
  if ("denied" in g) return g.denied;
  const text = z.string().trim().min(2).max(60).safeParse(name);
  if (!text.success) return { error: "اسم شكل اليوم حرفان فأكثر." };

  const { data, error } = await g.db
    .from("day_templates")
    .update({ name: text.data })
    .eq("id", templateId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) {
    return { error: userMessage(error, "تعذّر تعديل شكل اليوم.", "هذا الاسم مستخدَم لشكل يوم آخر.") };
  }

  contentPath(programId);
  return { notice: "عُدِّل اسم شكل اليوم." };
}

export async function removeDayTemplate(templateId: string, programId: string): Promise<FormState> {
  const g = await guarded(programId, templateId);
  if ("denied" in g) return g.denied;

  const { data, error } = await g.db
    .from("day_templates")
    .update({ deleted_at: nowIso() })
    .eq("id", templateId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: userMessage(error, "تعذّر حذف شكل اليوم.") };

  contentPath(programId);
  return { notice: "حُذف شكل اليوم." };
}

/** واجبات شكلٍ من برنامج التصريح، مرتّبة. الشكل من برنامج آخر ← لا شيء. */
async function templateFieldsOf(db: Db, templateId: string, programId: string) {
  const { data: owner } = await db
    .from("day_templates")
    .select("id")
    .eq("id", templateId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!owner) return null;
  const { data } = await db
    .from("day_template_fields")
    .select("id, task_field_id, sort_order")
    .eq("day_template_id", templateId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  return data ?? [];
}

export async function setTemplateFieldAmount(
  templateId: string,
  fieldId: string,
  programId: string,
  amount: number,
): Promise<FormState> {
  const g = await guarded(programId, templateId);
  if ("denied" in g) return g.denied;
  if (!(Number.isFinite(amount) && amount > 0)) return { error: "المقدار أكبر من صفر." };

  const rows = await templateFieldsOf(g.db, templateId, programId);
  const row = rows?.find((r) => r.task_field_id === fieldId);
  if (!row) return { error: "تعذّر تعديل المقدار." };

  const { data, error } = await g.db
    .from("day_template_fields")
    .update({ base_amount: amount })
    .eq("id", row.id)
    .select("id");
  if (error || !data?.length) return { error: userMessage(error, "تعذّر تعديل المقدار.") };

  contentPath(programId);
  return { notice: "عُدِّل المقدار. يسري على الأيام التي لم تُرسَل." };
}

export async function moveTemplateField(
  templateId: string,
  fieldId: string,
  programId: string,
  direction: "up" | "down",
): Promise<FormState> {
  const g = await guarded(programId, templateId);
  if ("denied" in g) return g.denied;

  const rows = await templateFieldsOf(g.db, templateId, programId);
  if (!rows) return { error: "تعذّر تحريك الواجب." };
  const index = rows.findIndex((r) => r.task_field_id === fieldId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= rows.length) return EMPTY_FORM_STATE;

  // إعادة ترقيمٍ صريحة لا تبديل: الترتيب القديم قد يكون صفراً للجميع، وتبديل صفرين لا يحرّك شيئاً.
  const order = [...rows];
  const moved = order[index]!;
  order[index] = order[target]!;
  order[target] = moved;
  for (const [position, row] of order.entries()) {
    if (row.sort_order === position) continue;
    const { error } = await g.db
      .from("day_template_fields")
      .update({ sort_order: position })
      .eq("id", row.id);
    if (error) return { error: "تعذّر تحريك الواجب." };
  }

  contentPath(programId);
  return EMPTY_FORM_STATE;
}

export async function removeTemplateField(
  templateId: string,
  fieldId: string,
  programId: string,
): Promise<FormState> {
  const g = await guarded(programId, templateId);
  if ("denied" in g) return g.denied;

  const rows = await templateFieldsOf(g.db, templateId, programId);
  const row = rows?.find((r) => r.task_field_id === fieldId);
  if (!row) return { error: "تعذّر إزالة الواجب من شكل اليوم." };

  const { data, error } = await g.db
    .from("day_template_fields")
    .update({ deleted_at: nowIso() })
    .eq("id", row.id)
    .select("id");
  if (error || !data?.length) {
    return { error: userMessage(error, "تعذّر إزالة الواجب من شكل اليوم.") };
  }

  contentPath(programId);
  return { notice: "أُزيل الواجب من شكل اليوم." };
}
