"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { userMessage } from "@/lib/db/messages";
import { authorizeRequest } from "@/lib/permissions/server";
import { parseSectionLines } from "@/lib/programs/material";

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
  startAt: z.coerce.number().int().min(1, "رقم البداية عدد موجب").max(100000, "رقم البداية 100٬000 على الأكثر"),
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

/**
 * إدخال النصوص سطراً سطراً من رقم البداية.
 *
 * **في المادة المقسّمة** الوحدات قائمة من أبوابها، فالسطور تكتب نصوصها ولا
 * تُنشئ وحدة (`fn_set_unit_labels`). **وفي المادة بلا أبواب** كل سطر وحدة جديدة،
 * كما كانت قبل `adr/0039`.
 */
export async function addContentUnits(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = bulkSchema.safeParse({
    programId: form.get("programId"),
    startAt: form.get("startAt"),
    lines: form.get("lines") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  if (await hasSections(parsed.data.programId)) {
    const db = await createClient();
    const { data, error } = await db.rpc("fn_set_unit_labels", {
      p_program_id: parsed.data.programId,
      p_start: parsed.data.startAt,
      p_labels: parsed.data.lines,
    });
    if (error) return { error: materialMessage(error, "تعذّر حفظ النصوص.") };
    revalidatePath(`/programs/${parsed.data.programId}/content`);
    return { notice: `حُفظت نصوص ${data ?? parsed.data.lines.length} وحدة.` };
  }

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

// ── الأبواب وصيغ العرض — adr/0039 ──

/**
 * إزاحة الأرقام تحت نصيب مسار يرفضها حارس الوحدة برسالةٍ عن وحدة واحدة.
 * وهنا الفعل تغييرُ باب، فتُقال بلغته وبالطريقين المفتوحين.
 */
const SHIFT_UNDER_TRACK =
  "هذا التغيير يُزيح أرقام وحدات داخل نصيب مسار، فيُنقل المسار إلى غير ما اختير له. أخرج تلك الوحدات من نصيب المسار أولاً، أو أضف الباب في آخر المادة.";

function materialMessage(error: { code?: string; message: string }, fallback: string): string {
  if (/داخل نصيب مسار/.test(error.message)) return SHIFT_UNDER_TRACK;
  if ((error.code === "22023" || error.code === "40001") && /[؀-ۿ]/.test(error.message)) return `${error.message}.`;
  return userMessage(error, fallback);
}

async function hasSections(programId: string): Promise<boolean> {
  const db = await createClient();
  const { count } = await db
    .from("material_sections")
    .select("id", { count: "exact", head: true })
    .eq("program_id", programId)
    .is("deleted_at", null);
  return (count ?? 0) > 0;
}

type SectionEntry = { id?: string; name: string; count: number };

/**
 * يقرأ الأبواب بترتيبها، ويطبّق عليها التعديل، ثم يكتب القائمة كاملة بدالتها
 * الواحدة — فهي التي تعيد الترقيم، ولا طريق غيرها لحجم الباب وموضعه.
 */
async function applySections(
  programId: string,
  change: (sections: SectionEntry[]) => SectionEntry[] | string,
  notice: string,
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error: readError } = await db
    .from("material_sections")
    .select("id, name, unit_count")
    .eq("program_id", programId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  if (readError) return { error: "تعذّر قراءة الأبواب." };

  const seen = data ?? [];
  const next = change(seen.map((s) => ({ id: s.id, name: s.name, count: s.unit_count })));
  if (typeof next === "string") return { error: next };

  // القائمة التي قُرئت تُرسل معها: إن تغيّرت قبل الكتابة رُفضت، فلا يُحذف ما أضافه غيرك.
  const { error } = await db.rpc("fn_set_material_sections", {
    p_program_id: programId,
    p_sections: next,
    p_expected: seen.map((s) => s.id),
  });
  if (error) return { error: materialMessage(error, "تعذّر حفظ الأبواب.") };

  revalidatePath(`/programs/${programId}/content`);
  return { notice };
}

const sectionLinesSchema = z.object({
  programId: z.uuid(),
  lines: z.string().trim().min(1, "الصق باباً واحداً على الأقل"),
});

/** أبوابٌ تُضاف في آخر المادة — سطرٌ لكل باب: اسمه ثم عدد وحداته. */
export async function addMaterialSections(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = sectionLinesSchema.safeParse({
    programId: form.get("programId"),
    lines: form.get("lines") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const lines = parseSectionLines(parsed.data.lines);
  if (!lines.ok) return { fieldErrors: { lines: lines.errors.slice(0, 3).join(" ") } };

  return applySections(
    parsed.data.programId,
    (sections) => {
      const taken = new Set(sections.map((s) => s.name));
      const clash = lines.rows.find((row) => taken.has(row.name));
      if (clash) return `الباب «${clash.name}» موجود في المادة.`;
      return [...sections, ...lines.rows];
    },
    lines.rows.length === 1 ? "أُضيف الباب." : `أُضيفت ${lines.rows.length} أبواب.`,
  );
}

export async function setMaterialSectionCount(
  sectionId: string,
  programId: string,
  count: number,
): Promise<FormState> {
  if (!idsSchema.safeParse({ programId, id: sectionId }).success) return { error: "باب غير معروف." };
  if (!Number.isInteger(count) || count < 1) return { error: "عدد الوحدات عدد صحيح موجب." };
  return applySections(
    programId,
    (sections) => sections.map((s) => (s.id === sectionId ? { ...s, count } : s)),
    "عُدِّل عدد وحدات الباب.",
  );
}

export async function moveMaterialSection(
  sectionId: string,
  programId: string,
  direction: "up" | "down",
): Promise<FormState> {
  if (!idsSchema.safeParse({ programId, id: sectionId }).success) return { error: "باب غير معروف." };
  return applySections(
    programId,
    (sections) => {
      const index = sections.findIndex((s) => s.id === sectionId);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= sections.length) return sections;
      const order = [...sections];
      [order[index], order[target]] = [order[target]!, order[index]!];
      return order;
    },
    "تغيّر ترتيب الأبواب.",
  );
}

export async function removeMaterialSection(sectionId: string, programId: string): Promise<FormState> {
  if (!idsSchema.safeParse({ programId, id: sectionId }).success) return { error: "باب غير معروف." };
  return applySections(
    programId,
    (sections) => sections.filter((s) => s.id !== sectionId),
    "حُذف الباب بوحداته.",
  );
}

/** الاسم وحده لا يُزيح رقماً، فيُكتب مباشرة لا عبر إعادة الترقيم. */
export async function renameMaterialSection(
  sectionId: string,
  programId: string,
  name: string,
): Promise<FormState> {
  const g = await guarded(programId, sectionId);
  if ("denied" in g) return g.denied;
  const text = z.string().trim().min(1).max(80).safeParse(name);
  if (!text.success) return { error: "اسم الباب مطلوب." };

  const { data, error } = await g.db
    .from("material_sections")
    .update({ name: text.data })
    .eq("id", sectionId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) {
    return { error: userMessage(error, "تعذّر تعديل اسم الباب.", "هذا الاسم لباب آخر في المادة.") };
  }

  contentPath(programId);
  return { notice: "عُدِّل اسم الباب." };
}

const formText = z
  .string()
  .trim()
  .max(30, "الصيغة 30 حرفاً على الأكثر")
  .transform((v) => (v.length === 0 ? null : v));

const formsSchema = z.object({
  programId: z.uuid(),
  sectionLabel: formText,
  singular: formText,
  one: formText,
  two: formText,
  few: formText,
  many: formText,
});

/** اسم القسم وصيغ الوحدة الخمس. الفارغ يُعرض بالصيغة العامة («الوحدة»). */
export async function saveMaterialForms(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = formsSchema.safeParse({
    programId: form.get("programId"),
    sectionLabel: form.get("sectionLabel") ?? "",
    singular: form.get("singular") ?? "",
    one: form.get("one") ?? "",
    two: form.get("two") ?? "",
    few: form.get("few") ?? "",
    many: form.get("many") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("programs")
    .update({
      section_label: parsed.data.sectionLabel,
      unit_singular: parsed.data.singular,
      unit_one: parsed.data.one,
      unit_two: parsed.data.two,
      unit_few: parsed.data.few,
      unit_many: parsed.data.many,
    })
    .eq("id", parsed.data.programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: "تعذّر حفظ الصيغ." };

  revalidatePath(`/programs/${parsed.data.programId}/content`);
  return { notice: "حُفظت الصيغ." };
}

// ── مقاطع المسار ──

const FROZEN_RANGES = "بدأ مشاركو هذا المسار الإرسال، فنصيبه من المادة لا يُعدَّل الآن.";

const rangeSchema = z.object({
  programId: z.uuid(),
  trackId: z.uuid("اختر مساراً"),
  fromSequence: z.coerce.number().int().min(1, "بداية النصيب رقم من 1 فأكثر"),
  toSequence: z.coerce.number().int().min(1, "نهاية النصيب رقم من 1 فأكثر"),
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

/**
 * خصائص الحقل (`adr/0037`) — من نموذج الإضافة والتعديل معاً. والقيود في القاعدة
 * (`chk_task_fields_properties`)، وهنا تُقال بلغة المُعِدّ قبل أن تُرسل.
 */
const fieldPropsSchema = z
  .object({
    label: z.string().trim().min(2, "اسم الواجب حرفان فأكثر").max(60),
    kind: z.enum(["ranged", "explicit", "counted"]),
    isBase: z.boolean(),
    isConstrained: z.boolean(),
    isMaterialLinked: z.boolean(),
    isRequired: z.boolean(),
    countUnit: z
      .string()
      .trim()
      .max(20, "وحدة العدّ 20 حرفاً على الأكثر")
      .transform((v) => (v === "" ? null : v)),
    defaultRepetition: z
      .union([z.literal(""), z.coerce.number().int().min(1, "التكرار 1 فأكثر").max(1000)])
      .transform((v) => (v === "" ? null : v)),
    sortOrder: z.coerce.number().int().min(0).default(0),
  })
  .refine((v) => !v.isBase || (v.kind === "ranged" && v.isMaterialLinked), {
    path: ["isBase"],
    message: "الحقل الأساس تراكميٌّ مرتبطٌ بالمادة",
  })
  .refine((v) => !v.isConstrained || (v.kind === "explicit" && v.isMaterialLinked), {
    path: ["isConstrained"],
    message: "التقييد بالأساس للنطاق الصريح المرتبط بالمادة",
  })
  .refine((v) => v.kind !== "counted" || v.countUnit !== null, {
    path: ["countUnit"],
    message: "اكتب وحدة العدّ: مرة · صفحة · وجه",
  });

function readFieldProps(form: FormData) {
  const kind = form.get("kind");
  return fieldPropsSchema.safeParse({
    label: form.get("label"),
    kind,
    isBase: form.get("isBase") === "on",
    isConstrained: form.get("isConstrained") === "on",
    // العددي لا يشير إلى موضع في المادة، فلا يرتبط بها مهما أُشّر.
    isMaterialLinked: kind !== "counted" && form.get("isMaterialLinked") === "on",
    isRequired: form.get("isRequired") === "on",
    countUnit: kind === "counted" ? (form.get("countUnit") ?? "") : "",
    defaultRepetition: form.get("defaultRepetition") ?? "",
    sortOrder: form.get("sortOrder") || 0,
  });
}

function fieldMessage(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505" && /idx_task_fields_base/.test(error.message)) return "في البرنامج حقل أساس سلفاً — واحدٌ لكل برنامج.";
  if (error.code === "23505") return "هذا الاسم مستخدَم لواجب آخر في البرنامج.";
  if (/chk_task_fields_properties/.test(error.message)) return "خصائص الحقل لا تجتمع مع نوعه.";
  return userMessage(error, fallback);
}

export async function addTaskField(_prev: FormState, form: FormData): Promise<FormState> {
  const programId = z.uuid().safeParse(form.get("programId"));
  if (!programId.success) return { error: "برنامج غير معروف." };
  const parsed = readFieldProps(form);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(programId.data);
  if (denied) return denied;

  const p = parsed.data;
  const db = await createClient();
  const { error } = await db.from("task_fields").insert({
    program_id: programId.data,
    label: p.label,
    kind: p.kind,
    sort_order: p.sortOrder,
    is_base: p.isBase,
    is_constrained: p.isConstrained,
    is_material_linked: p.isMaterialLinked,
    is_required: p.isRequired,
    count_unit: p.countUnit,
    default_repetition: p.defaultRepetition,
  });
  if (error) return { error: fieldMessage(error, "تعذّر إضافة الواجب.") };

  revalidatePath(`/programs/${programId.data}/content`);
  return { notice: "أُضيف الواجب." };
}

/** تعديل الحقل كاملاً — الاسم والنوع والخصائص. وما يُفسد قيم خطةٍ قائمة ترفضه القاعدة. */
export async function updateTaskField(_prev: FormState, form: FormData): Promise<FormState> {
  const ids = idsSchema.safeParse({ programId: form.get("programId"), id: form.get("fieldId") });
  if (!ids.success) return { error: "واجب غير معروف." };
  const parsed = readFieldProps(form);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(ids.data.programId);
  if (denied) return denied;

  const p = parsed.data;
  const db = await createClient();
  const { data, error } = await db
    .from("task_fields")
    .update({
      label: p.label,
      kind: p.kind,
      sort_order: p.sortOrder,
      is_base: p.isBase,
      is_constrained: p.isConstrained,
      is_material_linked: p.isMaterialLinked,
      is_required: p.isRequired,
      count_unit: p.countUnit,
      default_repetition: p.defaultRepetition,
    })
    .eq("id", ids.data.id)
    .eq("program_id", ids.data.programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: fieldMessage(error ?? { message: "" }, "تعذّر تعديل الواجب.") };

  contentPath(ids.data.programId);
  return { notice: "عُدِّل الواجب." };
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
  const { data: kindRow } = await db
    .from("task_fields")
    .select("kind")
    .eq("id", parsed.data.taskFieldId)
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!kindRow) return { error: "الواجب ليس من هذا البرنامج." };
  if (kindRow.kind === "explicit") {
    return { error: "النطاق الصريح لا يُعبّأ من شكل يوم: «من/إلى» تُدخل في الخطة نفسها." };
  }
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
  // النصّ اختياري منذ `adr/0039`: الفراغ يمحوه، والعرض يبقى بالباب ورقمه.
  const text = z.string().trim().max(500).safeParse(label);
  if (!text.success) return { error: "نصّ الوحدة 500 حرف على الأكثر." };

  const { data, error } = await g.db
    .from("content_units")
    .update({ label: text.data || null })
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
