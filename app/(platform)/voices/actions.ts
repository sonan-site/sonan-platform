"use server";

import { revalidatePath } from "next/cache";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { submitVoiceSchema } from "@/lib/voices/voices";

/** فتح «صوتك» يجعل الردود مقروءة — إجراءٌ لا أثرٌ جانبي في قراءة الصفحة (مراجعة البناء ٣). */
export async function markVoicesSeen(): Promise<void> {
  const db = await createClient();
  await db.rpc("fn_mark_voices_seen");
}

/** إرسال رسالة «صوتك» (adr/0054) — المشاركة والبرنامج تشتقّهما القاعدة، والحدّ اليومي فيها. */
export async function submitVoice(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = submitVoiceSchema.safeParse({
    kind: form.get("kind"),
    title: form.get("title"),
    body: form.get("body"),
    path: form.get("path") ?? undefined,
    ua: form.get("ua") ?? undefined,
    viewport: form.get("viewport") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const db = await createClient();
  const { error } = await db.rpc("fn_submit_voice", {
    p_kind: parsed.data.kind,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_context: { path: parsed.data.path, ua: parsed.data.ua, viewport: parsed.data.viewport },
  });
  if (error) {
    // رسالة القاعدة عربيةٌ مقصودة للحدّ اليومي وحده (تلميحه `voices_daily_limit`) — وغيرها عامّ.
    return { error: error.hint === "voices_daily_limit" ? error.message : "تعذّر إرسال رسالتك. أعد المحاولة." };
  }

  revalidatePath("/voices");
  return { notice: "وصلت رسالتك — تجد الرد هنا حين يصل." };
}
