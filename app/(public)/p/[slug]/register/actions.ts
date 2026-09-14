"use server";

import { redirect } from "next/navigation";
import { z } from "@/lib/validation/z";
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

  const answers: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    const match = answerKey.exec(key);
    if (match?.[1]) answers[match[1]] = String(value).trim();
  }

  // المشارك وإجاباته وتدقيقه **فعلٌ واحد في القاعدة** يفرض الأسئلة الإلزامية
  // واختيار المسار (الهجرة ٠٣٢) — لا خطواتٌ هنا يُترك نصفها عند فشل آخرها.
  const { error } = await db.rpc("fn_register", {
    p_program_id: programId.data,
    // الأنواع المولَّدة لا تعرف الفراغ في وسائط الدوال، والقاعدة تقبله: «بلا مسار»
    // حين لا مسارات للبرنامج — وترفضه برسالتها حين تكون.
    p_track_id: trackParsed.data as string,
    p_answers: answers,
  });

  if (error) {
    // 23505 = مسجَّل سلفاً. الفهرس الفريد هو من يمنع التكرار، لا فحصٌ سابق قد يسبقه غيره.
    if (error.code === "23505") return { error: "أنت مسجَّل في هذا البرنامج بالفعل." };
    // 23514 = رسائل كتبتها القاعدة بلغة المسجِّل: السعة، والمسار، والأسئلة الناقصة.
    if (error.code === "23514") return { error: `${error.message}.` };
    return { error: "تعذّر إتمام التسجيل. أعد المحاولة." };
  }

  redirect(`/p/${slug}?registered=1`);
}

