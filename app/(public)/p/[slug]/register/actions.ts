"use server";

import { redirect } from "next/navigation";
import { z } from "@/lib/validation/z";
import { type FormState } from "@/lib/auth/form-state";
import { writeMode } from "@/lib/auth/mode-cookie";
import { withinRateLimit } from "@/lib/auth/rate-limit";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { userMessage } from "@/lib/db/messages";
import { normalizePhone } from "@/lib/profile/phone";
import { normalizeNationalId } from "@/lib/validation/identity";

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
  const slugRaw = String(form.get("slug") ?? "");
  const slug = /^[a-z0-9-]{1,80}$/.test(slugRaw) ? slugRaw : "";
  if (!programId.success) return { error: "برنامج غير معروف." };

  const session = await getSession();
  if (session.status === "incomplete") {
    return { error: "أكمل حسابك (الاسم والجوال) أولاً ثم أعد المحاولة." };
  }
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
  const { data: participantId, error } = await db.rpc("fn_register", {
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

  // **التسجيل بابٌ يكتب وضع المشارك** (`adr/0032` بقرار الراعي ١٤ أكتوبر): الإداريّ
  // الذي يسجّل طالباً يُفتح له واجبه بإطار الطالب، ومفتاح «انتقل إلى الإدارة» قائم.
  await writeMode("participant");

  // **ينتهي التسجيل حيث يبدأ العمل** (`adr/0030`): كان يعود إلى الصفحة العامة،
  // وهي قد تكون بلا عناصر فلا يرى المسجِّل خبراً ولا رابطاً.
  redirect(participantId ? `/journey/${participantId}?joined=1` : slug ? `/p/${slug}?registered=1` : "/journey");
}


/**
 * «بياناتك لهذه المسابقة» (رحلة التسجيل ت٦): يُستكمل ما تطلبه المسابقة **في صفحة التسجيل**
 * — اسم الجد · الجوال السعودي · رقم الهوية · جوال الوليّ — ثم تعود الصفحة نفسها بمسارها
 * فتُعاد الموانع من القاعدة.
 *
 * **يُكتب المُرسَل وحده** (المراجعة ح١): `upsert` بالصف كاملاً كان يمحو الرقم المثبَّت فيرفضه
 * حارسه، أو يمحو جوال الوليّ. والرقم بإدخالٍ مزدوج لأنه لا يُغيَّر بعد حفظه (م٥).
 */
export async function completeForRegistration(_prev: FormState, form: FormData): Promise<FormState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const slug = /^[a-z0-9-]{1,80}$/.test(get("slug")) ? get("slug") : "";
  const track = /^[0-9a-f-]{36}$/.test(get("track")) ? get("track") : "";
  if (!slug) return { error: "برنامج غير معروف." };

  const session = await getSession();
  if (session.status !== "active") return { error: "انتهت جلستك. سجّل الدخول من جديد." };
  const fieldErrors: Record<string, string> = {};
  const profile: { grandfather_name?: string; phone?: string } = {};
  const identity: { national_id?: string; guardian_phone?: string } = {};

  if (form.has("grandfatherName")) {
    const v = get("grandfatherName");
    if (v.length < 2 || v.length > 40) fieldErrors["grandfatherName"] = "اكتب اسم جدّك";
    else profile.grandfather_name = v;
  }
  if (form.has("phone")) {
    const v = normalizePhone(get("phone"), "SA");
    if (!v || !/^\+9665[0-9]{8}$/.test(v)) fieldErrors["phone"] = "جوالٌ سعودي يبدأ بـ05";
    else profile.phone = v;
  }
  if (form.has("nationalId")) {
    const v = normalizeNationalId(get("nationalId"));
    if (!/^[12][0-9]{9}$/.test(v)) fieldErrors["nationalId"] = "رقم الهوية عشرة أرقام يبدأ بـ1 للمواطن أو 2 للمقيم";
    else if (v !== normalizeNationalId(get("nationalIdConfirm"))) fieldErrors["nationalIdConfirm"] = "الرقمان غير متطابقين";
    else identity.national_id = v;
  }
  if (form.has("guardianPhone")) {
    const v = normalizePhone(get("guardianPhone"), "SA");
    if (!v) fieldErrors["guardianPhone"] = "جوال وليّ الأمر غير صحيح";
    else identity.guardian_phone = v;
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  // الحدّ بعد التحقق المحلي — فأخطاء الكتابة لا تستنزف المحاولات. ويحدّ كشف «الرقم مستعمل».
  if (!(await withinRateLimit("auth.register", `identity:${session.userId}`))) {
    return { error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." };
  }

  const db = await createClient();
  if (Object.keys(profile).length > 0) {
    const { data, error } = await db
      .from("profiles")
      .update(profile)
      .eq("user_id", session.userId)
      .is("deleted_at", null)
      .select("id");
    if (error || !data?.length) return { error: "تعذّر حفظ بياناتك. أعد المحاولة." };
  }
  if (Object.keys(identity).length > 0) {
    // صفٌّ أُرشف (حذفٌ ليّن) لا يُحدَّث صامتاً — الدالة تتجاهله فيعود الطالب إلى النموذج بلا خبر.
    const { data: existing } = await db
      .from("profile_identities")
      .select("deleted_at")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (existing?.deleted_at) return { error: "هويتك مؤرشفة — تواصل مع إدارة البرنامج." };
    // `upsert` بالأعمدة المرسلة وحدها: يُدرج أو يحدّثها بلا سباقٍ بين الفحص والإدراج، ولا يمسّ
    // ما لم يُرسل (الرقم المثبَّت · جوال الوليّ — المراجعة ح١).
    const { error } = await db
      .from("profile_identities")
      .upsert({ user_id: session.userId, ...identity }, { onConflict: "user_id" });
    if (error) {
      const taken = error.code === "23505" && /national_id/.test(error.message);
      if (taken) return { fieldErrors: { nationalId: "هذا الرقم مسجّلٌ لحسابٍ آخر — تواصل مع إدارة البرنامج" } };
      return { error: userMessage(error, "تعذّر حفظ هويتك. أعد المحاولة.") };
    }
  }

  redirect(`/p/${slug}/register${track ? `?track=${track}` : ""}`);
}
