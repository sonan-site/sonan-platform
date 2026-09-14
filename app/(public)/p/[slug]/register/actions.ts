"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { type FormState } from "@/lib/auth/form-state";
import { withinRateLimit } from "@/lib/auth/rate-limit";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

/**
 * التسجيل في برنامج.
 *
 * `[BR-ADM-01]` **إكمال الأسئلة الإلزامية = قبول فوري** بلا مراجعة يدوية.
 * فلا حالة «بانتظار القبول»: المشارك يُنشأ بحالة `registered` مباشرة.
 *
 * `[BR-CAP-01]` **انفتاح البرنامج تفرضه القاعدة** في سياسة الإدراج، لا هذا الملف.
 * الفحص هنا يعطي رسالة مفهومة؛ ولو نُسي، لرفضت السياسة الإدراج.
 */

const answerKey = /^q:([0-9a-f-]{36})$/;

export async function registerInProgram(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const programId = z.uuid().safeParse(form.get("programId"));
  const slug = String(form.get("slug") ?? "");
  if (!programId.success) return { error: "برنامج غير معروف." };

  const session = await getSession();
  if (session.status !== "active") {
    return { error: "سجّل الدخول أولاً ثم أعد المحاولة." };
  }

  if (!(await withinRateLimit("auth.register", session.userId))) {
    return { error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." };
  }

  const db = await createClient();

  const { data: state } = await db.rpc("fn_registration_state", {
    p_program_id: programId.data,
  });
  if (state !== "open") {
    return { error: "التسجيل غير مفتوح في هذا البرنامج الآن." };
  }

  const trackRaw = form.get("trackId");
  const trackParsed = z.uuid().nullable().safeParse(trackRaw ? String(trackRaw) : null);
  if (!trackParsed.success) return { error: "مسار غير معروف." };
  const trackId = trackParsed.data;

  // ── الأسئلة الإلزامية تُفحَص قبل الإنشاء، لا بعده ──
  const { data: questions } = await db
    .from("admission_questions")
    .select("id, question, is_required, track_id")
    .eq("program_id", programId.data)
    .is("deleted_at", null);

  const answers = new Map<string, string>();
  for (const [key, value] of form.entries()) {
    const match = answerKey.exec(key);
    if (match?.[1]) answers.set(match[1], String(value).trim());
  }
  if ([...answers.values()].some((a) => a.length > 2000)) {
    return { error: "إحدى الإجابات أطول من المسموح (٢٠٠٠ حرف)." };
  }

  const applicable = (questions ?? []).filter(
    (q) => q.track_id === null || q.track_id === trackId,
  );
  const missing = applicable.filter((q) => q.is_required && !answers.get(q.id));
  if (missing.length > 0) {
    return { error: `أجب عن الأسئلة الإلزامية: ${missing.map((q) => q.question).join(" · ")}` };
  }

  const { data: participant, error } = await db
    .from("participants")
    .insert({
      user_id: session.userId,
      program_id: programId.data,
      track_id: trackId,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = مسجَّل سلفاً. الفهرس الفريد هو من يمنع التكرار، لا فحصٌ سابق قد يسبقه غيره.
    // 23514 = اكتمل العدد أو المسار غير متاح — والقاعدة تسمّي أيّهما.
    if (error.code === "23505") return { error: "أنت مسجَّل في هذا البرنامج بالفعل." };
    if (error.code === "23514" && /اكتمل العدد|غير متاح/.test(error.message)) {
      return { error: `${error.message}.` };
    }
    return { error: "تعذّر إتمام التسجيل. أعد المحاولة." };
  }

  const rows = applicable
    .filter((q) => answers.get(q.id))
    .map((q) => ({
      participant_id: participant.id,
      question_id: q.id,
      answer: answers.get(q.id)!,
    }));

  // تسجيلٌ بلا إجاباته قبولٌ بلا شرطه — فالفشل هنا لا يُتجاوَز بصمت.
  if (rows.length > 0) {
    const saved = await db.from("admission_answers").insert(rows);
    if (saved.error) {
      return { error: "سُجِّلت، لكن تعذّر حفظ إجاباتك. تواصل مع إدارة البرنامج." };
    }
  }

  await db.rpc("fn_write_audit", {
    p_action: "participant_registered",
    p_entity_table: "participants",
    p_entity_id: participant.id,
    p_after: { program_id: programId.data, track_id: trackId },
  });

  redirect(`/p/${slug}?registered=1`);
}

