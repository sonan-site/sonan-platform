"use server";

import { revalidatePath } from "next/cache";
import { type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { userMessage } from "@/lib/db/messages";
import { MAX_DAYS } from "@/lib/plans/engine";
import { z } from "@/lib/validation/z";

/**
 * الرصد من شاشة المشارك (`adr/0036` · `0037`).
 *
 * **بلا فحص صلاحية هنا عن قصد.** دوالّ الرصد تفحص بنفسها أن المستدعي صاحب
 * المشاركة وأنها تتبع الخطة، وأن اليوم يومه الحالي والتكرار بلغ عدده ونافذة
 * التراجع مفتوحة — وهي `security definer` فلا سياسة فوقها تفعل ذلك. وفحصٌ
 * ثانٍ هنا يوحي بأنه الحارس فيُغري بإسقاط الحارس الحقيقي.
 *
 * ورسائلها عربية كتبناها للمشارك («أكمل التكرار أولاً: ٣ من ١٥»)، فتُعرض كما هي.
 */

const target = z.object({
  participantId: z.uuid(),
  day: z.number().int().min(1).max(MAX_DAYS),
  fieldId: z.uuid(),
});

function refresh(participantId: string): void {
  revalidatePath(`/journey/${participantId}`);
  // واللوحة تعرض يومه وآخر رصد — فبلا إبطالها تبقى تقول ما مضى.
  revalidatePath("/dashboard");
}

/**
 * العدّاد: زائدٌ أو ناقصٌ واحداً، يُحفظ أولاً بأول فلا يضيع بتحديث الصفحة.
 * يُرجع العدد كما صار في القاعدة — وهو المرجع لا ما عدّته الشاشة.
 */
export async function countRepetition(input: {
  participantId: string;
  day: number;
  fieldId: string;
  delta: 1 | -1;
}): Promise<{ count?: number; error?: string }> {
  const parsed = target.extend({ delta: z.union([z.literal(1), z.literal(-1)]) }).safeParse(input);
  if (!parsed.success) return { error: "طلب غير صالح." };

  const db = await createClient();
  const { data, error } = await db.rpc("fn_count_repetition", {
    p_participant_id: parsed.data.participantId,
    p_day: parsed.data.day,
    p_field_id: parsed.data.fieldId,
    p_delta: parsed.data.delta,
  });
  if (error || data === null) return { error: userMessage(error, "تعذّر حفظ العدد.") };
  return { count: data };
}

/** رصد واجب — وبرصد آخر إلزاميٍّ في اليوم يُتمّ اليوم (`BR-PLAN-01`). */
export async function markField(input: { participantId: string; day: number; fieldId: string }): Promise<FormState> {
  const parsed = target.safeParse(input);
  if (!parsed.success) return { error: "طلب غير صالح." };

  const db = await createClient();
  const { error } = await db.rpc("fn_mark_field", {
    p_participant_id: parsed.data.participantId,
    p_day: parsed.data.day,
    p_field_id: parsed.data.fieldId,
  });
  if (error) return { error: userMessage(error, "تعذّر رصد الواجب.") };

  refresh(parsed.data.participantId);
  return { notice: "رُصد." };
}

/** التراجع عن رصد — في يومه التقويمي قبل وقت نهاية رصده. */
export async function undoMark(input: { participantId: string; day: number; fieldId: string }): Promise<FormState> {
  const parsed = target.safeParse(input);
  if (!parsed.success) return { error: "طلب غير صالح." };

  const db = await createClient();
  const { error } = await db.rpc("fn_undo_mark", {
    p_participant_id: parsed.data.participantId,
    p_day: parsed.data.day,
    p_field_id: parsed.data.fieldId,
  });
  if (error) return { error: userMessage(error, "تعذّر التراجع.") };

  refresh(parsed.data.participantId);
  return { notice: "أُلغي الرصد." };
}

/** «ابدأ واجب اليوم التالي» — بعد إتمام يومٍ اليوم، في حدود الحد اليومي. */
export async function openNextDay(participantId: string): Promise<FormState> {
  const parsed = z.uuid().safeParse(participantId);
  if (!parsed.success) return { error: "طلب غير صالح." };

  const db = await createClient();
  const { error } = await db.rpc("fn_open_next_day", { p_participant_id: parsed.data });
  if (error) return { error: userMessage(error, "تعذّر بدء اليوم التالي.") };

  refresh(parsed.data);
  return {};
}
