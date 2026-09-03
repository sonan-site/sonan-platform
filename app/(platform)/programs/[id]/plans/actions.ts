"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { EXAM_DEFAULTS } from "@/lib/programs/exam-defaults";
import { generateDays, MAX_PLAN_DAYS, parseUploadedPlan, planIssues } from "@/lib/plans/build";
import { authorizeRequest } from "@/lib/permissions/server";

/**
 * الخطة إعداد برنامج: صلاحيتها `programs.write` بنطاق البرنامج — لا رمز
 * مستقل. ورمزٌ بلا حارس يستهلكه يُفشل `guard-permissions`.
 */
async function guard(programId: string): Promise<FormState | null> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  return authz.ok ? null : { error: authz.message };
}

/** عدد أيام الخطة الحيّة. البناء الجملي لا يقع على خطة مأهولة. */
async function liveDayCount(
  db: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<number> {
  const { count } = await db
    .from("plan_days")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId)
    .is("deleted_at", null);
  return count ?? 0;
}

// ── الخطة ──

const createSchema = z.object({
  programId: z.uuid(),
  trackId: z.uuid("اختر مساراً"),
  name: z.string().trim().min(2, "اسم الخطة مطلوب"),
});

export async function createPlan(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = createSchema.safeParse({
    programId: form.get("programId"),
    trackId: form.get("trackId"),
    name: form.get("name"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  const { error } = await db
    .from("plans")
    .insert({ track_id: parsed.data.trackId, name: parsed.data.name });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "للمسار خطة سلفاً. المسار خطة واحدة — افتحها وعدّلها."
          : "تعذّر إنشاء الخطة.",
    };
  }

  revalidatePath(`/programs/${parsed.data.programId}/plans`);
  return { notice: "أُنشئت الخطة. ابنِ أيامها." };
}

// ── البناء الجملي: توليد ورفع ──

const generateSchema = z.object({
  programId: z.uuid(),
  planId: z.uuid(),
  dayCount: z.coerce.number().int().min(1, "عدد الأيام واحد فأكثر").max(MAX_PLAN_DAYS),
  dayTemplateId: z.uuid("اختر قالباً"),
  amountMultiplier: z.coerce.number().positive("المضاعف عدد موجب").default(1),
  restEvery: z.coerce.number().int().min(0).max(MAX_PLAN_DAYS).default(0),
});

/**
 * التوليد بمعطيات — **على خطة فارغة وحدها**.
 *
 * البناء الجملي لا يمسّ خطة مأهولة: من ولّد فوق خطة قائمة فقد ترتيبها كلّه،
 * وقد يكون المشاركون قد بنوا عليه. التبديل قصدٌ يُعلَن بالمسح ثم البناء.
 */
export async function generatePlan(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = generateSchema.safeParse({
    programId: form.get("programId"),
    planId: form.get("planId"),
    dayCount: form.get("dayCount"),
    dayTemplateId: form.get("dayTemplateId"),
    amountMultiplier: form.get("amountMultiplier") || 1,
    restEvery: form.get("restEvery") || 0,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  if ((await liveDayCount(db, parsed.data.planId)) > 0) {
    return { error: "الخطة ليست فارغة. امسح أيامها قبل التوليد." };
  }

  const days = generateDays({
    dayCount: parsed.data.dayCount,
    dayTemplateId: parsed.data.dayTemplateId,
    amountMultiplier: parsed.data.amountMultiplier,
    restEvery: parsed.data.restEvery,
  });

  const issues = planIssues(days);
  if (issues.length > 0) return { error: issues[0] };

  return writeDays(db, parsed.data.programId, parsed.data.planId, days);
}

const uploadSchema = z.object({
  programId: z.uuid(),
  planId: z.uuid(),
  dayTemplateId: z.uuid("اختر قالباً"),
  text: z.string().min(1, "ألصق محتوى الملف"),
});

/** الرفع صورة من اليدوي: يُترجَم إلى الصفوف نفسها ثم يُحرَّر كأي خطة. */
export async function uploadPlan(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = uploadSchema.safeParse({
    programId: form.get("programId"),
    planId: form.get("planId"),
    dayTemplateId: form.get("dayTemplateId"),
    text: form.get("text"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();
  if ((await liveDayCount(db, parsed.data.planId)) > 0) {
    return { error: "الخطة ليست فارغة. امسح أيامها قبل الرفع." };
  }

  const result = parseUploadedPlan(parsed.data.text, parsed.data.dayTemplateId);
  if (!result.ok) {
    // الملف يُردّ كلّه: خطة نصفها مرفوع أسوأ من خطة لم تُرفع.
    const head = result.issues
      .slice(0, 5)
      .map((i) => (i.line > 0 ? `سطر ${i.line}: ${i.message}` : i.message))
      .join(" · ");
    const rest = result.issues.length > 5 ? ` (و${result.issues.length - 5} غيرها)` : "";
    return { error: `${head}${rest}` };
  }

  return writeDays(db, parsed.data.programId, parsed.data.planId, result.days);
}

/** الصفحتان معاً: القائمة تعرض «عدد الأيام»، فتبطل بتغيّرها لا بتغيّر الخطة وحدها. */
function revalidateBoth(programId: string, planId: string): void {
  revalidatePath(`/programs/${programId}/plans/${planId}`);
  revalidatePath(`/programs/${programId}/plans`);
}

async function writeDays(
  db: Awaited<ReturnType<typeof createClient>>,
  programId: string,
  planId: string,
  days: ReturnType<typeof generateDays>,
): Promise<FormState> {
  const { error } = await db.from("plan_days").insert(
    days.map((d) => ({
      plan_id: planId,
      day_number: d.dayNumber,
      day_type: d.dayType,
      day_template_id: d.dayTemplateId,
      amount_multiplier: d.amountMultiplier,
      exam_id: d.examId,
    })),
  );
  if (error) {
    return {
      error: /برنامج الخطة/.test(error.message) ? error.message : "تعذّر كتابة أيام الخطة.",
    };
  }

  await db.rpc("fn_write_audit", {
    p_action: "plan_days_built",
    p_entity_table: "plan_days",
    p_entity_id: planId,
    p_after: { count: days.length },
  });

  revalidateBoth(programId, planId);
  return { notice: `بُنيت ${days.length} يوماً.` };
}

// ── التحرير اليدوي ──

const daySchema = z
  .object({
    programId: z.uuid(),
    planId: z.uuid(),
    atNumber: z.coerce.number().int().min(1).optional(),
    dayType: z.enum(["normal", "rest", "exam"]),
    dayTemplateId: z.uuid("اختر قالباً").optional(),
    amountMultiplier: z.coerce.number().positive("المضاعف عدد موجب").default(1),
    examId: z.uuid("اختر اختباراً").optional(),
  })
  .refine((v) => v.dayType !== "normal" || !!v.dayTemplateId, {
    path: ["dayTemplateId"],
    message: "اليوم العادي يلزمه قالب",
  })
  .refine((v) => v.dayType !== "exam" || !!v.examId, {
    path: ["examId"],
    message: "يوم الاختبار يلزمه اختبار",
  });

export async function addPlanDay(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = daySchema.safeParse({
    programId: form.get("programId"),
    planId: form.get("planId"),
    atNumber: form.get("atNumber") || undefined,
    dayType: form.get("dayType"),
    dayTemplateId: form.get("dayTemplateId") || undefined,
    amountMultiplier: form.get("amountMultiplier") || 1,
    examId: form.get("examId") || undefined,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const db = await createClient();

  // الموضع الغائب يعني الآخر. الدالة تَقصُر ما تجاوز النهاية، لكن الرقم يُحسَب
  // هنا صراحةً: معامل الدالة إلزامي، وتمرير رقم مُصطنَع يُخفي القصد.
  const at = parsed.data.atNumber ?? (await liveDayCount(db, parsed.data.planId)) + 1;

  const { data, error } = await db.rpc("fn_plan_insert_day", {
    p_plan_id: parsed.data.planId,
    p_at_number: at,
    p_day_type: parsed.data.dayType,
    p_day_template_id:
      parsed.data.dayType === "normal" ? parsed.data.dayTemplateId : undefined,
    p_amount_multiplier: parsed.data.dayType === "normal" ? parsed.data.amountMultiplier : 1,
    p_exam_id: parsed.data.dayType === "exam" ? parsed.data.examId : undefined,
  });
  if (error) {
    return {
      error: /برنامج الخطة|الحدّ الأقصى/.test(error.message)
        ? error.message
        : "تعذّر إضافة اليوم.",
    };
  }
  // الدالة تُرجع فارغاً حين تُصفّي سياسة الصفوف الخطة: رفضٌ لا نجاح صامت.
  if (!data) return { error: "لا صلاحية لك على هذه الخطة." };

  revalidateBoth(parsed.data.programId, parsed.data.planId);
  return { notice: "أُضيف اليوم." };
}

/**
 * تعديل يومٍ قائم — القالب أو المضاعف.
 *
 * المخطَّط البصري ينصّ: «المقادير تُعدَّل هنا». والبديل — حذف اليوم وإعادة
 * إدراجه — يُزيح الخطة مرتين ويفقد اليوم هويّته، وبها تُربَط الإنجازات في `س٦`.
 * ولذلك التعديل في موضعه لا حولَه.
 */
export async function updatePlanDay(
  planDayId: string,
  patch: { dayTemplateId?: string; amountMultiplier?: number },
  planId: string,
  programId: string,
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  if (patch.amountMultiplier !== undefined && !(patch.amountMultiplier > 0)) {
    return { error: "المضاعف عدد موجب." };
  }
  if (patch.dayTemplateId === undefined && patch.amountMultiplier === undefined) {
    return EMPTY_FORM_STATE;
  }

  const db = await createClient();
  // النوع لا يُعدَّل هنا: قيد الاتساق يربطه بمراجعه، وتغييره تركيبٌ لا تعديل حقل.
  // `select` بعد `update` يكشف التصفية: سياسة الصفوف لا تُخطئ، تُرجع صفراً.
  const { data, error } = await db
    .from("plan_days")
    .update({
      ...(patch.dayTemplateId !== undefined ? { day_template_id: patch.dayTemplateId } : {}),
      ...(patch.amountMultiplier !== undefined
        ? { amount_multiplier: patch.amountMultiplier }
        : {}),
    })
    .eq("id", planDayId)
    .eq("day_type", "normal")
    .is("deleted_at", null)
    .select("id");

  if (error) {
    return { error: /برنامج الخطة/.test(error.message) ? error.message : "تعذّر تعديل اليوم." };
  }
  if ((data?.length ?? 0) === 0) return { error: "لم يُعدَّل اليوم — تحقّق من صلاحيتك." };

  revalidatePath(`/programs/${programId}/plans/${planId}`);
  return EMPTY_FORM_STATE;
}

export async function removePlanDay(
  planDayId: string,
  planId: string,
  programId: string,
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_plan_remove_day", { p_plan_day_id: planDayId });
  if (error) return { error: "تعذّر حذف اليوم." };
  if (!data) return { error: "لم يُحذف اليوم — تحقّق من صلاحيتك." };

  revalidateBoth(programId, planId);
  return EMPTY_FORM_STATE;
}

export async function movePlanDay(
  planDayId: string,
  toNumber: number,
  planId: string,
  programId: string,
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_plan_move_day", {
    p_plan_day_id: planDayId,
    p_to_number: toNumber,
  });
  if (error) return { error: "تعذّر نقل اليوم." };
  if (!data) return { error: "لم يُنقل اليوم." };

  revalidatePath(`/programs/${programId}/plans/${planId}`);
  return EMPTY_FORM_STATE;
}

/**
 * مسح أيام الخطة — حذف ليّن للجميع.
 *
 * **س٦ يقيّده:** حين تُبنى `achievements`، يُمنع المسح على خطة لها إنجاز
 * مسجَّل — عندئذٍ يصير المسح إتلافاً لعمل مشاركين لا تصحيحاً لخطة.
 */
export async function clearPlanDays(planId: string, programId: string): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const db = await createClient();
  const { data, error } = await db
    .from("plan_days")
    .update({ deleted_at: nowIso() })
    .eq("plan_id", planId)
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: "تعذّر مسح الأيام." };
  if ((data?.length ?? 0) === 0) return { error: "لم يُمسح شيء — تحقّق من صلاحيتك." };

  await db.rpc("fn_write_audit", {
    p_action: "plan_days_cleared",
    p_entity_table: "plan_days",
    p_entity_id: planId,
  });

  revalidateBoth(programId, planId);
  return { notice: `مُسحت ${data.length} يوماً.` };
}

// ── الاختبار: تعريفاً فقط (adr/0022) ──

const examSchema = z
  .object({
    programId: z.uuid(),
    planId: z.uuid(),
    trackId: z.uuid().optional(),
    name: z.string().trim().min(2, "اسم الاختبار مطلوب"),
    examType: z.enum(["remote", "oral"]),
    stage: z.enum(["interim", "final"]),
    passPercentage: z.coerce.number().min(0).max(100),
    questionCount: z.coerce.number().int().positive("عدد الأسئلة عدد موجب"),
    secondsPerQuestion: z.coerce.number().int().positive().optional(),
    maxSkips: z.coerce.number().int().min(0).optional(),
    judgeCount: z.coerce.number().int().positive().optional(),
    awardPercentage: z.coerce.number().min(0).max(100).optional(),
  })
  .refine((v) => v.examType !== "oral" || v.stage === "final", {
    path: ["stage"],
    message: "الشفهي نهائي دائماً",
  })
  .refine((v) => v.examType !== "remote" || v.secondsPerQuestion !== undefined, {
    path: ["secondsPerQuestion"],
    message: "زمن السؤال مطلوب للاختبار عن بعد",
  })
  .refine((v) => v.examType !== "oral" || v.judgeCount !== undefined, {
    path: ["judgeCount"],
    message: "عدد المحكمين مطلوب للشفهي",
  });

/**
 * تعريف اختبار — **بنيةً لا تدفّقاً** (adr/0022). لا أسئلة ولا جلسات ولا
 * تحكيم في المرحلة الأولى. يُبنى لأن يوم الاختبار في الخطة يشير إليه، ولولاه
 * لبقي `day_type = 'exam'` قيمةً لا تُبلَغ.
 */
export async function createExam(_prev: FormState, form: FormData): Promise<FormState> {
  const remote = form.get("examType") === "remote";
  const parsed = examSchema.safeParse({
    programId: form.get("programId"),
    planId: form.get("planId"),
    trackId: form.get("trackId") || undefined,
    name: form.get("name"),
    examType: form.get("examType"),
    stage: form.get("stage"),
    passPercentage: form.get("passPercentage") || EXAM_DEFAULTS.passPercentage,
    questionCount: form.get("questionCount") || EXAM_DEFAULTS.questionCount,
    secondsPerQuestion: remote ? form.get("secondsPerQuestion") || undefined : undefined,
    maxSkips: remote ? form.get("maxSkips") || EXAM_DEFAULTS.maxSkips : undefined,
    judgeCount: remote ? undefined : form.get("judgeCount") || undefined,
    awardPercentage: remote ? undefined : form.get("awardPercentage") || EXAM_DEFAULTS.awardPercentage,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const denied = await guard(parsed.data.programId);
  if (denied) return denied;

  const isRemote = parsed.data.examType === "remote";
  const db = await createClient();
  const { error } = await db.from("exams").insert({
    program_id: parsed.data.programId,
    track_id: parsed.data.trackId ?? null,
    name: parsed.data.name,
    exam_type: parsed.data.examType,
    stage: parsed.data.stage,
    pass_percentage: parsed.data.passPercentage,
    question_count: parsed.data.questionCount,
    seconds_per_question: isRemote ? (parsed.data.secondsPerQuestion ?? null) : null,
    max_skips: isRemote ? (parsed.data.maxSkips ?? EXAM_DEFAULTS.maxSkips) : null,
    judge_count: isRemote ? null : (parsed.data.judgeCount ?? null),
    award_percentage: isRemote ? null : (parsed.data.awardPercentage ?? null),
  });
  if (error) return { error: "تعذّر تعريف الاختبار." };

  revalidatePath(`/programs/${parsed.data.programId}/plans/${parsed.data.planId}`);
  return { notice: "عُرِّف الاختبار. أضِف له يوماً في الخطة." };
}

/**
 * تسمية الاختبار — المستهلِك الوحيد لسياسة `exams_update`.
 *
 * سياسةٌ بلا فعل يستهلكها تعني عملياً أن خطأً مطبعياً في اسم اختبار دائم.
 */
export async function renameExam(
  examId: string,
  name: string,
  planId: string,
  programId: string,
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;

  const trimmed = name.trim();
  if (trimmed.length < 2) return { error: "اسم الاختبار مطلوب." };

  const db = await createClient();
  const { data, error } = await db
    .from("exams")
    .update({ name: trimmed })
    .eq("id", examId)
    .is("deleted_at", null)
    .select("id");

  if (error) return { error: "تعذّر تعديل الاسم." };
  if ((data?.length ?? 0) === 0) return { error: "لم يُعدَّل الاسم — تحقّق من صلاحيتك." };

  revalidatePath(`/programs/${programId}/plans/${planId}`);
  return EMPTY_FORM_STATE;
}
