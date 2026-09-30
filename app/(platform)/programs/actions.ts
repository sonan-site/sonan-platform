"use server";

import { revalidatePath } from "next/cache";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { renumber } from "@/lib/programs/reorder";
import { userMessage } from "@/lib/db/messages";
import { programSchema, sectionSchema, trackSchema } from "@/lib/validation/programs";
import { z } from "@/lib/validation/z";

/** الترتيب في كل إجراء: تحقّق ← فحص رباعي الطبقات ← فعل ← تدقيق. */

export async function createSection(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = sectionSchema.safeParse({
    name: form.get("name"),
    parentId: form.get("parentId") || null,
    sortOrder: form.get("sortOrder") || 0,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const authz = await authorizeRequest({ permission: "sections.write" });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { error } = await db.from("sections").insert({
    name: parsed.data.name,
    parent_id: parsed.data.parentId,
    sort_order: parsed.data.sortOrder,
  });
  if (error) return { error: "تعذّر إنشاء القسم." };

  await db.rpc("fn_write_audit", {
    p_action: "section_created",
    p_entity_table: "sections",
    p_after: { name: parsed.data.name },
  });

  revalidatePath("/programs");
  return { notice: "أُنشئ القسم." };
}

export async function createProgram(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = programSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  // الإنشاء يشترط صلاحية **عامة**: لا نطاق لبرنامج لم يوجد بعد.
  const authz = await authorizeRequest({ permission: "programs.write", programId: null });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data, error } = await db
    .from("programs")
    .insert({
      section_id: parsed.data.sectionId,
      name: parsed.data.name,
      summary: parsed.data.summary,
      slug: parsed.data.slug,
      kind: parsed.data.kind,
      participant_label: parsed.data.participantLabel,
      contact: parsed.data.contact,
      capacity: parsed.data.capacity,
      registration_opens_at: parsed.data.registrationOpensAt,
      registration_closes_at: parsed.data.registrationClosesAt,
      passing_percentage: parsed.data.passingPercentage,
      award_percentage: parsed.data.awardPercentage,
    })
    .select("id")
    .single();

  if (error) {
    return {
      error: error.code === "23505" ? "الرابط مستخدَم في برنامج آخر." : "تعذّر إنشاء البرنامج.",
    };
  }

  await db.rpc("fn_write_audit", {
    p_action: "program_created",
    p_entity_table: "programs",
    p_entity_id: data.id,
    p_after: { name: parsed.data.name, slug: parsed.data.slug },
  });

  revalidatePath("/programs");
  return { notice: "أُنشئ البرنامج. أضف مساراته من صفحته." };
}

/** النشر والإغلاق فعلٌ إداري مسجَّل، لا حقلٌ يُعدَّل بصمت. */
export async function setProgramStatus(
  programId: string,
  status: "draft" | "published" | "closed",
): Promise<FormState> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data: before } = await db
    .from("programs")
    .select("status")
    .eq("id", programId)
    .maybeSingle();

  const { data, error } = await db
    .from("programs")
    .update({ status })
    .eq("id", programId)
    .select("id");
  if (error || !data?.length) {
    // حارس القاعدة يسمّي الناقص (الهجرة ٠٤٢) — تُمرَّر رسالته كما هي.
    const missing = error?.message.includes("لا يُنشر البرنامج قبل") ? `${error.message}.` : null;
    return { error: missing ?? "تعذّر تغيير الحالة." };
  }

  await db.rpc("fn_write_audit", {
    p_action: "program_status_changed",
    p_entity_table: "programs",
    p_entity_id: programId,
    p_before: before ?? undefined,
    p_after: { status },
  });

  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
  // النجاح يُقال: كان صامتاً فلا يعرف الناشر أشيءٌ وقع أم لا.
  return {
    notice:
      status === "published"
        ? "نُشر البرنامج — صفحته المعلنة مفتوحة للزوّار."
        : status === "draft"
          ? "أُعيد البرنامج مسوّدةً، فلا يراه الزوّار."
          : "أُغلق البرنامج، فلا تسجيل فيه بعد الآن.",
  };
}

export async function createTrack(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = trackSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: parsed.data.programId,
    resourceProgramId: parsed.data.programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  // الترتيب يُحسب ولا يُكتب بيد: خانةٌ يُملأ فيها رقمٌ أنتجت مساريْن برقمٍ واحد
  // في «برنامج المتون العلمية» — والجديد يلحق بآخر الصفّ ثم يُحرَّك بسهميه.
  const { data: last } = await db
    .from("tracks")
    .select("sort_order")
    .eq("program_id", parsed.data.programId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db.from("tracks").insert({
    program_id: parsed.data.programId,
    name: parsed.data.name,
    description: parsed.data.description,
    capacity: parsed.data.capacity,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) return { error: "تعذّر إنشاء المسار." };

  await db.rpc("fn_write_audit", {
    p_action: "track_created",
    p_entity_table: "tracks",
    p_after: { program_id: parsed.data.programId, name: parsed.data.name },
  });

  revalidatePath(`/programs/${parsed.data.programId}`);
  return { notice: "أُنشئ المسار." };
}

/**
 * حذف المسار — **بأثره عند المستخدم لا باسمه في القاعدة**.
 *
 * الفعل في القاعدة أرشفةٌ ناعمة (`deleted_at`)، وكان الزرّ يقول «أرشفة» —
 * فيَعِد بأرشيفٍ لا شاشة له ولا استعادة منه. والذي يقع عند المستخدم أن المسار
 * وخطته يخرجان من البرنامج، فهذا اسمه.
 */
export async function deleteTrack(trackId: string, programId: string): Promise<FormState> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  // المسار مقيَّد ببرنامج التصريح قبل حذفه.
  const { data: track } = await db
    .from("tracks")
    .select("id")
    .eq("id", trackId)
    .eq("program_id", programId)
    .maybeSingle();
  if (!track) return { error: "المسار غير موجود في هذا البرنامج." };

  // **المسار وخطته وأيامها وتدقيقها فعلٌ واحد في القاعدة** (الهجرة ٠٢٦): ثلاث
  // كتابات منفصلة كانت تترك خطةً حيّة لمسار محذوف إن فشلت آخرها.
  const { data, error } = await db.rpc("fn_archive_track", { p_track_id: trackId });
  if (error) {
    // رفضان بالرمز نفسه: مشاركون فيه الآن، أو سجلّ إنجاز لمن مرّوا به (الهجرة ٠٣٩).
    const message = error.message.includes("سجلّ إنجاز")
      ? "للمسار سجلّ إنجاز لمشاركين مرّوا به، فلا يُحذف."
      : error.code === "23514"
        ? "في المسار مشاركون — انقلهم قبل حذفه."
        : "تعذّر حذف المسار.";
    return { error: message };
  }
  if (data === null) return { error: "لم يُحذف المسار — تحقّق من صلاحيتك." };

  // ولا سطر تدقيقٍ هنا: `fn_archive_track` تكتبه بنفسها (`track_archived`)
  // في المعاملة نفسها — وكتابته ثانيةً سطران لفعلٍ واحد.
  revalidatePath(`/programs/${programId}`);
  return { notice: "حُذف المسار." };
}

/**
 * تحريك المسار في ترتيبه.
 *
 * وإعادة ترقيمٍ لا تبديل: `sort_order` كان يُكتب بيد في نموذج الإضافة، فوقع
 * مساران برقمٍ واحد فعلاً — وتبديل متساويين لا يحرّك شيئاً.
 */
export async function moveTrack(
  trackId: string,
  programId: string,
  direction: "up" | "down",
): Promise<FormState> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data, error } = await db
    .from("tracks")
    .select("id, sort_order")
    .eq("program_id", programId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");

  if (error || !data) return { error: "تعذّر تحريك المسار." };
  if (!(await renumber(db, "tracks", data, trackId, direction))) {
    return { error: "تعذّر تحريك المسار." };
  }

  revalidatePath(`/programs/${programId}`);
  return EMPTY_FORM_STATE;
}

// ══ التصحيح ══

/**
 * تعديل بيانات البرنامج — بالقواعد نفسها التي أنشأته (`programSchema`).
 *
 * القسم والنمط لا يتغيّران هنا: النمط يُختار مرّة (`BR-KIND-01`)، فيُقرآن من
 * القاعدة لا من النموذج. والرابط يتغيّر قبل النشر وحده، والقاعدة تفرض ذلك.
 */
export async function updateProgram(_prev: FormState, form: FormData): Promise<FormState> {
  const programId = z.uuid().safeParse(form.get("programId"));
  if (!programId.success) return { error: "برنامج غير معروف." };

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId: programId.data,
    resourceProgramId: programId.data,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data: current } = await db
    .from("programs")
    .select("section_id, kind, status, slug")
    .eq("id", programId.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { error: "البرنامج غير موجود." };

  const parsed = programSchema.safeParse({
    ...Object.fromEntries(form),
    sectionId: current.section_id,
    kind: current.kind,
    slug: current.status === "draft" ? (form.get("slug") ?? current.slug) : current.slug,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const { data, error } = await db
    .from("programs")
    .update({
      name: parsed.data.name,
      summary: parsed.data.summary,
      slug: parsed.data.slug,
      participant_label: parsed.data.participantLabel,
      contact: parsed.data.contact,
      capacity: parsed.data.capacity,
      registration_opens_at: parsed.data.registrationOpensAt,
      registration_closes_at: parsed.data.registrationClosesAt,
      passing_percentage: parsed.data.passingPercentage,
      award_percentage: parsed.data.awardPercentage,
    })
    .eq("id", programId.data)
    .select("id");

  if (error || !data?.length) {
    return { error: userMessage(error, "تعذّر حفظ بيانات البرنامج.", "الرابط مستخدَم في برنامج آخر.") };
  }

  await db.rpc("fn_write_audit", {
    p_action: "program_updated",
    p_entity_table: "programs",
    p_entity_id: programId.data,
    p_after: { name: parsed.data.name, slug: parsed.data.slug },
  });

  revalidatePath("/programs");
  revalidatePath(`/programs/${programId.data}`);
  return { notice: "حُفظت بيانات البرنامج." };
}

const trackPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  capacity: z.number().int().positive().nullable().optional(),
});

export async function updateTrack(
  trackId: string,
  programId: string,
  patch: { name?: string; description?: string; capacity?: number | null },
): Promise<FormState> {
  if (!z.object({ trackId: z.uuid(), programId: z.uuid() }).safeParse({ trackId, programId }).success) {
    return { error: "مسار غير معروف." };
  }
  const parsed = trackPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      error:
        patch.capacity !== undefined
          ? "السعة عدد صحيح موجب، أو اتركها فارغة لبلا سقف."
          : "اسم المسار حرفان فأكثر.",
    };
  }

  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data, error } = await db
    .from("tracks")
    .update(parsed.data)
    .eq("id", trackId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("id");
  if (error || !data?.length) return { error: userMessage(error, "تعذّر تعديل المسار.") };

  revalidatePath(`/programs/${programId}`);
  return { notice: "عُدِّل المسار." };
}

/**
 * ترتيب البرنامج في المتجر العام.
 *
 * **بصلاحية عامة لا بنطاق برنامج:** الترتيب يمسّ الواجهة كلها، فمنسّقُ برنامجٍ
 * واحد لا يقدّم برنامجه على غيره. وإعادةُ ترقيمٍ صريحة لا تبديل — الأرقام
 * كلها صفرٌ قبل أول ترتيب، وتبديل صفرين لا يحرّك شيئاً.
 */
export async function moveProgram(
  programId: string,
  direction: "up" | "down",
): Promise<FormState> {
  if (!z.uuid().safeParse(programId).success) return { error: "برنامج غير معروف." };

  const authz = await authorizeRequest({ permission: "programs.write", programId: null });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  const { data, error: readError } = await db
    .from("programs")
    .select("id, sort_order")
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at", { ascending: false });

  // خطأ القراءة أو برنامجٌ غاب: كان يُبلَّغ نجاحاً صامتاً فلا يعرف الضاغط.
  if (readError || !data) return { error: "تعذّر تغيير الترتيب." };
  const rows = data;
  const index = rows.findIndex((p) => p.id === programId);
  if (index === -1) return { error: "تعذّر تغيير الترتيب." };
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return EMPTY_FORM_STATE;

  const order = [...rows];
  order[index] = order[target]!;
  order[target] = rows[index]!;

  for (const [position, row] of order.entries()) {
    if (row.sort_order === position) continue;
    const { error } = await db.from("programs").update({ sort_order: position }).eq("id", row.id);
    if (error) return { error: "تعذّر تغيير الترتيب." };
  }

  revalidatePath("/programs/publish");
  revalidatePath("/");
  return EMPTY_FORM_STATE;
}
