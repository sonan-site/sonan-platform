"use server";

import { revalidatePath } from "next/cache";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
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
  if (error || !data?.length) return { error: "تعذّر تغيير الحالة." };

  await db.rpc("fn_write_audit", {
    p_action: "program_status_changed",
    p_entity_table: "programs",
    p_entity_id: programId,
    p_before: before ?? undefined,
    p_after: { status },
  });

  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
  return EMPTY_FORM_STATE;
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
  const { error } = await db.from("tracks").insert({
    program_id: parsed.data.programId,
    name: parsed.data.name,
    description: parsed.data.description,
    capacity: parsed.data.capacity,
    sort_order: parsed.data.sortOrder,
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

export async function archiveTrack(trackId: string, programId: string): Promise<FormState> {
  const authz = await authorizeRequest({
    permission: "programs.write",
    programId,
    resourceProgramId: programId,
  });
  if (!authz.ok) return { error: authz.message };

  const db = await createClient();
  // المسار مقيَّد ببرنامج التصريح قبل أرشفته.
  const { data: track } = await db
    .from("tracks")
    .select("id")
    .eq("id", trackId)
    .eq("program_id", programId)
    .maybeSingle();
  if (!track) return { error: "المسار غير موجود في هذا البرنامج." };

  // **المسار وخطته وأيامها وتدقيقها فعلٌ واحد في القاعدة** (الهجرة ٠٢٦): ثلاث
  // كتابات منفصلة كانت تترك خطةً حيّة لمسار مؤرشَف إن فشلت آخرها.
  const { data, error } = await db.rpc("fn_archive_track", { p_track_id: trackId });
  if (error) {
    // رفضان بالرمز نفسه: مشاركون فيه الآن، أو سجلّ إنجاز لمن مرّوا به (الهجرة ٠٣٩).
    const message = error.message.includes("سجلّ إنجاز")
      ? "للمسار سجلّ إنجاز لمشاركين مرّوا به، فلا يُؤرشَف."
      : error.code === "23514"
        ? "في المسار مشاركون — انقلهم قبل أرشفته."
        : "تعذّر أرشفة المسار.";
    return { error: message };
  }
  if (data === null) return { error: "لم يُؤرشَف المسار — تحقّق من صلاحيتك." };

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
