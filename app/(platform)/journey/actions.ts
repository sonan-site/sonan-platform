"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";

/**
 * إرسال اليوم.
 *
 * **بلا فحص صلاحية هنا عن قصد.** `fn_submit_day` تفحص بنفسها أن المستدعي هو
 * صاحب المشاركة وأنها تتبع الخطة — وهي `security definer` فلا سياسة فوقها
 * تفعل ذلك. وفحصٌ ثانٍ هنا يوحي بأنه هو الحارس، فيُغري بإسقاط الحارس الحقيقي.
 *
 * ولا تُرسَل أرقام: الحقول المُتَمّة وحدها. النطاق يُحسَب في القاعدة من الدالة
 * نفسها التي عرضته — «الواجهة عرض لا إدخال».
 *
 * و`participantId` **للإبطال وحده** لا للإرسال نيابةً: الدالة تشتقّ المشارك من
 * `auth.uid()` وتتجاهل ما يُمرَّر، فلا يُرسِل أحدٌ عن غيره ولو مرّر معرّفه.
 */
const schema = z.object({
  participantId: z.uuid(),
  planDayId: z.uuid(),
  doneFields: z.array(z.uuid()),
});

export async function submitDay(
  participantId: string,
  planDayId: string,
  doneFields: string[],
): Promise<FormState> {
  const parsed = schema.safeParse({ participantId, planDayId, doneFields });
  if (!parsed.success) return { error: "طلب غير صالح." };

  const db = await createClient();
  const { data, error } = await db.rpc("fn_submit_day", {
    p_plan_day_id: parsed.data.planDayId,
    p_done_fields: parsed.data.doneFields,
  });

  if (error) {
    if (/أُرسل هذا اليوم سلفاً/.test(error.message)) {
      return { error: "أُرسل هذا اليوم سلفاً. لا يُرسَل مرتين." };
    }
    if (/اليوم الجاري وحده/.test(error.message)) {
      return { error: "يُرسَل يومك الجاري وحده. السلسلة تمضي للأمام فقط." };
    }
    if (/الحساب موقوف/.test(error.message)) {
      return { error: "حسابك موقوف. راجع الإدارة." };
    }
    if (/لست مشاركاً|لا واجب في هذا اليوم/.test(error.message)) {
      return { error: "لا واجب لك في هذا اليوم." };
    }
    return { error: "تعذّر إرسال اليوم." };
  }
  // صفر قيمة كاذبة في JavaScript، والدالة لا تُرجعه أصلاً — تُخطئ. والفراغ رفض.
  if (data === null) return { error: "تعذّر إرسال اليوم." };

  revalidatePath(`/journey/${parsed.data.participantId}`);
  return { notice: "أُرسل اليوم." };
}
