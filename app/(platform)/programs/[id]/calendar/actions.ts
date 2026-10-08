"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { nowIso } from "@/lib/format";
import { authorizeRequest } from "@/lib/permissions/server";
import { ENGINE_KEYS, type EngineKey } from "@/lib/programs/engine-settings";
import type { Json } from "@/lib/db/database.types";
import { scheduleEntrySchema } from "@/lib/validation/programs";

/**
 * التقويم وقواعد التقدّم (`adr/0038`) — إعداد برنامج، فصلاحيته `programs.write`.
 * والكتابة كلها من `fn_set_engine_setting`: ما يُكتب يُحكم به على أيام مضت،
 * فلا طريق حول دالته.
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

/** حرّاس الدالة يرفضون برسائل كتبناها، فتُعرض كما هي. وغيرها رسالة عامة. */
function settingMessage(error: { message: string } | null, fallback: string): string {
  if (error && ARABIC.test(error.message)) return error.message.endsWith(".") ? error.message : `${error.message}.`;
  return fallback;
}

function calendarPath(programId: string): void {
  revalidatePath(`/programs/${programId}/calendar`);
}

const scopeSchema = z.object({
  programId: z.uuid(),
  trackId: z
    .union([z.uuid(), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  key: z.enum(ENGINE_KEYS),
});

async function write(
  programId: string,
  trackId: string | null,
  key: EngineKey,
  value: Json,
  notice: string,
): Promise<FormState> {
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_set_engine_setting", {
    p_program_id: programId,
    p_track_id: trackId as string,
    p_key: key,
    p_value: value,
  });
  if (error) return { error: settingMessage(error, "تعذّر حفظ الإعداد.") };
  calendarPath(programId);
  return { notice };
}

/** نموذج إعدادٍ واحد: القيمة في `value`، وأيام العمل في `day` مكرّراً. */
export async function saveEngineSetting(_prev: FormState, form: FormData): Promise<FormState> {
  const scope = scopeSchema.safeParse({
    programId: form.get("programId"),
    trackId: form.get("trackId") ?? "",
    key: form.get("key"),
  });
  if (!scope.success) return { fieldErrors: toFieldErrors(scope.error.issues) };
  const { programId, trackId, key } = scope.data;
  const raw = String(form.get("value") ?? "").trim();

  switch (key) {
    case "start_date": {
      if (raw !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { fieldErrors: { value: "تاريخ غير صالح" } };
      return write(programId, trackId, key, raw === "" ? null : raw, raw === "" ? "أُزيل تاريخ البداية." : "حُفظ تاريخ البداية.");
    }
    case "work_days": {
      const days = form
        .getAll("day")
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (days.length === 0) return { fieldErrors: { value: "اختر يوم عمل واحداً على الأقل" } };
      return write(programId, trackId, key, days, "حُفظت أيام العمل.");
    }
    case "deadline": {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return { fieldErrors: { value: "الوقت ساعة ودقيقة" } };
      return write(programId, trackId, key, raw, "حُفظ وقت نهاية الرصد.");
    }
    case "daily_limit": {
      const limit = Number(raw);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        return { fieldErrors: { value: "الحد اليومي بين 1 و20" } };
      }
      return write(programId, trackId, key, limit, "حُفظ الحد اليومي.");
    }
    case "credit_enabled":
    case "compensation_enabled": {
      const on = form.get("value") === "on";
      return write(programId, trackId, key, on, on ? "فُعّل." : "عُطّل.");
    }
    case "progress_measure": {
      if (raw !== "units" && raw !== "days") return { fieldErrors: { value: "اختر المقياس" } };
      return write(programId, trackId, key, raw, "حُفظ المقياس.");
    }
    case "exceptions":
      return { error: "أيام التوقف تُضاف وتُحذف يوماً يوماً." };
  }
}

/** أيام التوقف في النطاق — للبرنامج، أو للمسار الذي خصّصها. */
async function exceptionsOf(programId: string, trackId: string | null): Promise<string[] | null> {
  const db = await createClient();
  let query = db
    .from("calendar_exceptions")
    .select("off_date")
    .eq("program_id", programId)
    .is("deleted_at", null);
  query = trackId ? query.eq("track_id", trackId) : query.is("track_id", null);
  const { data, error } = await query;
  if (error) return null;
  return (data ?? []).map((r) => r.off_date);
}

const exceptionSchema = z.object({
  programId: z.uuid(),
  trackId: z
    .union([z.uuid(), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختر التاريخ"),
});

export async function addCalendarException(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = exceptionSchema.safeParse({
    programId: form.get("programId"),
    trackId: form.get("trackId") ?? "",
    date: form.get("date") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const { programId, trackId, date } = parsed.data;

  const denied = await guard(programId);
  if (denied) return denied;
  const current = await exceptionsOf(programId, trackId);
  if (!current) return { error: "تعذّر قراءة أيام التوقف." };
  if (current.includes(date)) return { error: "هذا اليوم في القائمة." };
  return write(programId, trackId, "exceptions", [...current, date].sort(), "أُضيف يوم التوقف.");
}

export async function removeCalendarException(
  programId: string,
  trackId: string | null,
  date: string,
): Promise<FormState> {
  const parsed = exceptionSchema.safeParse({ programId, trackId: trackId ?? "", date });
  if (!parsed.success) return { error: "يوم غير معروف." };
  const denied = await guard(programId);
  if (denied) return denied;
  const current = await exceptionsOf(programId, parsed.data.trackId);
  if (!current) return { error: "تعذّر قراءة أيام التوقف." };
  return write(
    programId,
    parsed.data.trackId,
    "exceptions",
    current.filter((d) => d !== date),
    "حُذف يوم التوقف.",
  );
}

const trackKeySchema = z.object({ programId: z.uuid(), trackId: z.uuid(), key: z.enum(ENGINE_KEYS) });

/** يخصّص الإعداد للمسار بنسخ قيمة البرنامج، فيُعدَّل بعدها وحده. */
export async function customizeEngineSetting(
  programId: string,
  trackId: string,
  key: EngineKey,
): Promise<FormState> {
  const parsed = trackKeySchema.safeParse({ programId, trackId, key });
  if (!parsed.success) return { error: "إعداد غير معروف." };
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_customize_engine_setting", { p_track_id: trackId, p_key: key });
  if (error) return { error: settingMessage(error, "تعذّر التخصيص.") };
  calendarPath(programId);
  return { notice: "خُصّص الإعداد لهذا المسار." };
}

export async function inheritEngineSetting(
  programId: string,
  trackId: string,
  key: EngineKey,
): Promise<FormState> {
  const parsed = trackKeySchema.safeParse({ programId, trackId, key });
  if (!parsed.success) return { error: "إعداد غير معروف." };
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db.rpc("fn_inherit_engine_setting", { p_track_id: trackId, p_key: key });
  if (error) return { error: settingMessage(error, "تعذّر الإرجاع.") };
  calendarPath(programId);
  return { notice: "رجع الإعداد إلى الموروث من البرنامج." };
}

// ══ مواعيد البرنامج (`adr/0044`) ══
// جدولٌ بسياساته لا إعداد محرّك: ما يُكتب هنا يُعرض ولا يُحكم به على يوم.

export async function addScheduleEntry(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = scheduleEntrySchema.safeParse({
    programId: form.get("programId"),
    title: form.get("title") ?? "",
    startsOn: form.get("startsOn") ?? "",
    endsOn: form.get("endsOn") ?? "",
    note: form.get("note") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const { programId, title, startsOn, endsOn, note } = parsed.data;

  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { error } = await db
    .from("program_schedule")
    .insert({ program_id: programId, title, starts_on: startsOn, ends_on: endsOn, note });
  if (error) return { error: "تعذّر إضافة الموعد." };

  await db.rpc("fn_write_audit", {
    p_action: "schedule_entry_added",
    p_entity_table: "program_schedule",
    p_after: { program_id: programId, title, starts_on: startsOn, ends_on: endsOn },
  });
  calendarPath(programId);
  return { notice: "أُضيف الموعد." };
}

export async function removeScheduleEntry(programId: string, entryId: string): Promise<FormState> {
  const parsed = z.object({ programId: z.uuid(), entryId: z.uuid() }).safeParse({ programId, entryId });
  if (!parsed.success) return { error: "موعد غير معروف." };
  const denied = await guard(programId);
  if (denied) return denied;
  const db = await createClient();
  const { data, error } = await db
    .from("program_schedule")
    .update({ deleted_at: nowIso() })
    .eq("id", entryId)
    .eq("program_id", programId)
    .is("deleted_at", null)
    .select("title")
    .maybeSingle();
  if (error || !data) return { error: "تعذّر حذف الموعد." };

  await db.rpc("fn_write_audit", {
    p_action: "schedule_entry_removed",
    p_entity_table: "program_schedule",
    p_entity_id: entryId,
    p_before: { program_id: programId, title: data.title },
  });
  calendarPath(programId);
  return { notice: "حُذف الموعد." };
}
