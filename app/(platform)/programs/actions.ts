"use server";

import { revalidatePath } from "next/cache";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import { programSchema, sectionSchema, trackSchema } from "@/lib/validation/programs";

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

  const { error } = await db.from("programs").update({ status }).eq("id", programId);
  if (error) return { error: "تعذّر تغيير الحالة." };

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
  const { error } = await db.from("tracks").update({ deleted_at: nowIso() }).eq("id", trackId);
  if (error) return { error: "تعذّر أرشفة المسار." };

  await db.rpc("fn_write_audit", {
    p_action: "track_archived",
    p_entity_table: "tracks",
    p_entity_id: trackId,
  });

  revalidatePath(`/programs/${programId}`);
  return EMPTY_FORM_STATE;
}
