"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso, riyadhDayEnd, riyadhDayStart } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import type { BankRow } from "@/lib/exams/bank-import";
import type { Json } from "@/lib/db/database.types";

/**
 * الاختبارات وبنك الأسئلة (`adr/0048`) — صلاحيتها `exams.manage` بنطاق البرنامج.
 *
 * **الإعدادات كلها تُخصَّص** (قرار الراعي): لا رقم ثابت في الكود، والقيم
 * الافتراضية تُعرض في النموذج وحده. والسؤال يُكتب بخياراته من `fn_save_question`
 * فيُفرض اتساقه في القاعدة، والملف من `fn_import_questions` كلّه أو لا شيء.
 */
async function guard(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({
    permission: "exams.manage",
    programId,
    resourceProgramId: programId,
  });
  return authz.ok ? null : { error: authz.message };
}

const ARABIC = /[؀-ۿ]/;

/** رسائل دوالّ البنك مكتوبةٌ بلغة المُعِدّ، فتُعرض كما هي. */
function bankMessage(error: { message: string } | null, fallback: string): string {
  if (error && ARABIC.test(error.message)) return error.message.endsWith(".") ? error.message : `${error.message}.`;
  return fallback;
}

function examsPath(programId: string): void {
  revalidatePath(`/programs/${programId}/exams`);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().pipe(schema).optional());
const optionalDay = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v === null || DAY.test(v), "اختر اليوم من التقويم");

const examSchema = z
  .object({
    programId: z.uuid(),
    examId: z.uuid().optional(),
    trackId: z.uuid().optional(),
    name: z.string().trim().min(2, "اسم الاختبار مطلوب").max(80, "الاسم لا يزيد عن 80 حرفاً"),
    examType: z.enum(["remote", "oral"]),
    stage: z.enum(["interim", "final"]),
    passPercentage: z.coerce.number().min(0, "بين 0 و100").max(100, "بين 0 و100"),
    questionCount: z.coerce.number().int().positive("عدد الأسئلة عدد موجب"),
    entryPercentage: optionalNumber(z.number().min(0, "بين 0 و100").max(100, "بين 0 و100")),
    prerequisiteExamId: z.uuid().optional(),
    secondsPerQuestion: optionalNumber(z.number().int().positive("عدد موجب")),
    maxSkips: optionalNumber(z.number().int().min(0, "صفر فأكثر")),
    maxAttempts: optionalNumber(z.number().int().min(1, "من 1 إلى 10").max(10, "من 1 إلى 10")),
    opensOn: optionalDay,
    closesOn: optionalDay,
    eligibilityOn: optionalDay,
    judgeCount: optionalNumber(z.number().int().positive("عدد موجب")),
    awardPercentage: optionalNumber(z.number().min(0, "بين 0 و100").max(100, "بين 0 و100")),
  })
  .refine((v) => v.examType !== "oral" || v.stage === "final", { path: ["stage"], message: "الشفهي نهائي دائماً" })
  .refine((v) => v.examType !== "remote" || v.secondsPerQuestion !== undefined, {
    path: ["secondsPerQuestion"],
    message: "زمن السؤال مطلوب للاختبار عن بعد",
  })
  .refine((v) => v.examType !== "remote" || v.maxAttempts !== undefined, {
    path: ["maxAttempts"],
    message: "عدد المحاولات مطلوب للاختبار عن بعد",
  })
  .refine((v) => v.examType !== "oral" || v.judgeCount !== undefined, {
    path: ["judgeCount"],
    message: "عدد المحكّمين مطلوب للشفهي",
  })
  .refine((v) => v.examType !== "oral" || v.awardPercentage !== undefined, {
    path: ["awardPercentage"],
    message: "نسبة أهلية الجائزة مطلوبة للشفهي",
  })
  .refine((v) => !v.opensOn || !v.closesOn || v.closesOn >= v.opensOn, {
    path: ["closesOn"],
    message: "الإغلاق لا يسبق الفتح",
  })
  .refine((v) => !v.examId || v.prerequisiteExamId !== v.examId, {
    path: ["prerequisiteExamId"],
    message: "الاختبار لا يشترط نفسه",
  });

/** تعريف اختبار أو تعديل إعداداته — نموذجٌ واحد، و`examId` يفرّق بينهما. */
export async function saveExam(_prev: FormState, form: FormData): Promise<FormState> {
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const parsed = examSchema.safeParse({
    programId: form.get("programId"),
    examId: text("examId"),
    trackId: text("trackId"),
    name: form.get("name"),
    examType: form.get("examType"),
    stage: form.get("stage"),
    passPercentage: form.get("passPercentage"),
    questionCount: form.get("questionCount"),
    entryPercentage: text("entryPercentage"),
    prerequisiteExamId: text("prerequisiteExamId"),
    secondsPerQuestion: text("secondsPerQuestion"),
    maxSkips: text("maxSkips"),
    maxAttempts: text("maxAttempts"),
    opensOn: String(form.get("opensOn") ?? ""),
    closesOn: String(form.get("closesOn") ?? ""),
    eligibilityOn: String(form.get("eligibilityOn") ?? ""),
    judgeCount: text("judgeCount"),
    awardPercentage: text("awardPercentage"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const v = parsed.data;
  const denied = await guard(v.programId);
  if (denied) return denied;

  const remote = v.examType === "remote";
  const row = {
    track_id: v.trackId ?? null,
    name: v.name,
    stage: v.stage,
    pass_percentage: v.passPercentage,
    question_count: v.questionCount,
    entry_percentage: v.entryPercentage ?? null,
    prerequisite_exam_id: v.prerequisiteExamId ?? null,
    seconds_per_question: remote ? (v.secondsPerQuestion ?? null) : null,
    max_skips: remote ? (v.maxSkips ?? 0) : null,
    max_attempts: remote ? (v.maxAttempts ?? null) : null,
    opens_at: remote && v.opensOn ? riyadhDayStart(v.opensOn) : null,
    closes_at: remote && v.closesOn ? riyadhDayEnd(v.closesOn) : null,
    eligibility_at: !remote && v.eligibilityOn ? riyadhDayEnd(v.eligibilityOn) : null,
    judge_count: remote ? null : (v.judgeCount ?? null),
    award_percentage: remote ? null : (v.awardPercentage ?? null),
  };

  const db = await createClient();
  if (v.examId) {
    // النوع لا يتغيّر بعد التعريف: إعداداته غير إعدادات الآخر، والجلسات والمحاولات تتبعه.
    const { data, error } = await db
      .from("exams")
      .update(row)
      .eq("id", v.examId)
      .eq("program_id", v.programId)
      .eq("exam_type", v.examType)
      .is("deleted_at", null)
      .select("id");
    if (error) return { error: "تعذّر حفظ الإعدادات." };
    if ((data?.length ?? 0) === 0) return { error: "لم تُحفظ الإعدادات — تحقّق من صلاحيتك." };
    examsPath(v.programId);
    return { notice: "حُفظت إعدادات الاختبار." };
  }

  const { error } = await db.from("exams").insert({ ...row, program_id: v.programId, exam_type: v.examType });
  if (error) return { error: "تعذّر تعريف الاختبار." };
  examsPath(v.programId);
  return { notice: "عُرِّف الاختبار." };
}

// ── البنك ──

const questionSchema = z.object({
  track_id: z.uuid().nullable(),
  usage: z.enum(["remote", "oral", "both"]),
  unit_sequence: z.number().int().positive(),
  text: z.string().trim().min(3).max(1000),
  type: z.enum(["single", "multiple", "true_false", "open"]),
  score: z.number().positive().max(1000),
  answer: z.string().max(2000),
  tf_answer: z.enum(["صح", "خطأ"]).optional(),
  options: z.array(z.object({ text: z.string().max(300), correct: z.boolean() })).max(6),
});

/** سؤالٌ بخياراته — جديدٌ أو معدَّل. والقاعدة تفرض الاتساق وتقول الخطأ. */
export async function saveQuestion(
  programId: string,
  questionId: string | null,
  question: BankRow,
): Promise<FormState> {
  const ids = z.object({ programId: z.uuid(), questionId: z.uuid().nullable() }).safeParse({ programId, questionId });
  const parsed = questionSchema.safeParse(question);
  if (!ids.success || !parsed.success) return { error: "بيانات السؤال غير مكتملة." };
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db.rpc("fn_save_question", {
    p_program_id: programId,
    p_question_id: questionId as string,
    p_q: parsed.data as unknown as Json,
  });
  if (error) return { error: bankMessage(error, "تعذّر حفظ السؤال.") };
  examsPath(programId);
  return { notice: questionId ? "عُدِّل السؤال." : "أُضيف السؤال." };
}

/** ملف الأسئلة — قرأه المتصفح وفحصه، والقاعدة تعيد الفحص وتكتبه كلّه أو لا شيء. */
export async function importQuestions(programId: string, rows: BankRow[]): Promise<FormState> {
  if (!z.uuid().safeParse(programId).success) return { error: "برنامج غير معروف." };
  const parsed = z.array(questionSchema).min(1).max(2000).safeParse(rows);
  if (!parsed.success) return { error: "الملف غير صالح — أعد قراءته." };
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_import_questions", {
    p_program_id: programId,
    p_rows: parsed.data as unknown as Json,
  });
  if (error) return { error: bankMessage(error, "تعذّر الاستيراد — لم يُضف شيء.") };
  examsPath(programId);
  return { notice: `استُورد ${data ?? parsed.data.length} سؤالاً.` };
}

/** أرشفة سؤال — يخرج من السحب ويبقى لما سبق من محاولات. */
export async function archiveQuestion(programId: string, questionId: string): Promise<FormState> {
  if (!z.object({ p: z.uuid(), q: z.uuid() }).safeParse({ p: programId, q: questionId }).success) {
    return { error: "سؤال غير معروف." };
  }
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("questions")
    .update({ deleted_at: nowIso() })
    .eq("id", questionId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || (data?.length ?? 0) === 0) return { error: "تعذّرت أرشفة السؤال." };
  examsPath(programId);
  return EMPTY_FORM_STATE;
}

// ── معايير الخصم ──

const criterionSchema = z.object({
  programId: z.uuid(),
  label: z.string().trim().min(2, "اسم المعيار مطلوب").max(60, "لا يزيد عن 60 حرفاً"),
  deductionValue: z.coerce.number().positive("قيمة الخصم عدد موجب").max(1000, "قيمة كبيرة"),
});

export async function addCriterion(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = criterionSchema.safeParse({
    programId: form.get("programId"),
    label: form.get("label"),
    deductionValue: form.get("deductionValue"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { count } = await db
    .from("deduction_criteria")
    .select("id", { count: "exact", head: true })
    .eq("program_id", parsed.data.programId)
    .is("question_id", null)
    .is("deleted_at", null);
  const { error } = await db.from("deduction_criteria").insert({
    program_id: parsed.data.programId,
    label: parsed.data.label,
    deduction_value: parsed.data.deductionValue,
    sort_order: count ?? 0,
  });
  if (error) return { error: "تعذّرت إضافة المعيار." };
  examsPath(parsed.data.programId);
  return { notice: "أُضيف المعيار." };
}

export async function archiveCriterion(programId: string, criterionId: string): Promise<FormState> {
  if (!z.object({ p: z.uuid(), c: z.uuid() }).safeParse({ p: programId, c: criterionId }).success) {
    return { error: "معيار غير معروف." };
  }
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("deduction_criteria")
    .update({ deleted_at: nowIso() })
    .eq("id", criterionId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || (data?.length ?? 0) === 0) return { error: "تعذّر حذف المعيار." };
  examsPath(programId);
  return EMPTY_FORM_STATE;
}
