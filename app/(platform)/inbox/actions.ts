"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/validation/z";
import { EMPTY_FORM_STATE, toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { replyVoiceSchema, VOICE_STATUSES } from "@/lib/voices/voices";

/**
 * معالجة «صوتك» (adr/0054). الصلاحية بنطاق برنامج الرسالة تفحصها القاعدة (`fn_voice_guard`)، فلا
 * يُحتاج حارسٌ هنا يكرّرها — ورسالةٌ خارج النطاق تُرفض كأنها غير موجودة.
 */

function refresh(id: string) {
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${id}`);
}

export async function replyVoice(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = replyVoiceSchema.safeParse({
    id: form.get("id"),
    reply: form.get("reply"),
    close: form.get("close") === "on",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const db = await createClient();
  const { error } = await db.rpc("fn_reply_voice", {
    p_id: parsed.data.id,
    p_reply: parsed.data.reply,
    p_close: parsed.data.close,
  });
  if (error) return { error: "تعذّر حفظ الرد." };
  refresh(parsed.data.id);
  return { notice: parsed.data.close ? "حُفظ الرد وأُغلقت الرسالة." : "حُفظ الرد — يراه الطالب في «صوتك»." };
}

const statusSchema = z.object({ id: z.uuid(), status: z.enum(VOICE_STATUSES) });

export async function setVoiceStatus(id: string, status: string): Promise<FormState> {
  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { error: "حالٌ غير معروفة." };
  const db = await createClient();
  const { error } = await db.rpc("fn_set_voice_status", { p_id: parsed.data.id, p_status: parsed.data.status });
  if (error) return { error: "تعذّر تغيير الحال." };
  refresh(parsed.data.id);
  return EMPTY_FORM_STATE;
}

export async function archiveVoice(id: string): Promise<FormState> {
  if (!z.uuid().safeParse(id).success) return { error: "رسالة غير معروفة." };
  const db = await createClient();
  const { error } = await db.rpc("fn_archive_voice", { p_id: id });
  if (error) return { error: "تعذّرت الأرشفة." };
  revalidatePath("/inbox");
  return { notice: "أُرشفت الرسالة." };
}
