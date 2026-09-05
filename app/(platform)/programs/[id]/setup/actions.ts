"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toFieldErrors, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/db/server";
import { MAX_PLAN_DAYS } from "@/lib/plans/build";

/**
 * الإعداد السريع.
 *
 * **بلا فحص صلاحية هنا عن قصد:** `fn_quick_setup` تفحص `programs.write`
 * بنفسها، وهي التي تكتب. وفحصٌ ثانٍ هنا يوحي بأنه الحارس فيُغري بإسقاطه.
 */

const schema = z.object({
  programId: z.uuid(),
  lines: z
    .string()
    .transform((v) => v.split("\n").map((l) => l.trim()).filter((l) => l.length > 0))
    .refine((l) => l.length > 0, "الصق المادة — سطر لكل عنصر"),
  dayCount: z.coerce.number().int().min(1, "مدّة الخطة يوم فأكثر").max(MAX_PLAN_DAYS),
  restEvery: z.coerce.number().int().min(0).max(MAX_PLAN_DAYS).default(0),
  memorizeAmount: z.coerce.number().positive("المقدار عدد موجب"),
  reviewAmount: z.coerce.number().min(0),
  repeatAmount: z.coerce.number().min(0),
});

export async function quickSetup(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    programId: form.get("programId"),
    lines: form.get("lines") ?? "",
    dayCount: form.get("dayCount"),
    restEvery: form.get("restEvery") || 0,
    memorizeAmount: form.get("memorizeAmount"),
    reviewAmount: form.get("reviewAmount") || 0,
    repeatAmount: form.get("repeatAmount") || 0,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  // الواجبات الثلاثة المعتادة، ومن أدخل صفراً أسقط واجبه. والتفصيل بعدها
  // في شاشة المادة — هذه بداية لا سقف.
  const fields = [
    { label: "حفظ", kind: "ranged", amount: parsed.data.memorizeAmount },
    ...(parsed.data.reviewAmount > 0
      ? [{ label: "مراجعة", kind: "ranged", amount: parsed.data.reviewAmount }]
      : []),
    ...(parsed.data.repeatAmount > 0
      ? [{ label: "تكرار", kind: "counted", amount: parsed.data.repeatAmount }]
      : []),
  ];

  const db = await createClient();
  const { error } = await db.rpc("fn_quick_setup", {
    p_program_id: parsed.data.programId,
    p_lines: parsed.data.lines,
    p_fields: fields,
    p_day_count: parsed.data.dayCount,
    p_rest_every: parsed.data.restEvery,
  });

  if (error) {
    if (/لا صلاحية لك/.test(error.message)) return { error: "لا صلاحية لك على هذا البرنامج." };
    if (/ليس فارغاً/.test(error.message)) {
      return { error: "البرنامج مُعَدّ سلفاً. الإعداد السريع للبرنامج الفارغ وحده." };
    }
    if (/لا مسارات/.test(error.message)) {
      return { error: "أضِف مساراً واحداً على الأقل من صفحة البرنامج أولاً." };
    }
    if (/المادة مطلوبة|مدّة الخطة|واجب واحد/.test(error.message)) {
      return { error: error.message };
    }
    return { error: "تعذّر الإعداد. لم يُكتب شيء." };
  }

  revalidatePath(`/programs/${parsed.data.programId}`);
  redirect(`/programs/${parsed.data.programId}`);
}
