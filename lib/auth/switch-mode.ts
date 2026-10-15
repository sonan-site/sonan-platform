"use server";

import { redirect } from "next/navigation";
import type { SessionMode } from "@/lib/auth/mode";
import { writeMode } from "@/lib/auth/mode-cookie";

/**
 * الانتقال بين وضعَي الجلسة — لمن يجمع الصفتين (`adr/0032`).
 *
 * **تجربةٌ لا صلاحية:** يكتب الكوكي ويعيد إلى باب الوضع، والصلاحيات كما هي —
 * فمن لا دور له لا تفتح له شاشة عملٍ في أي وضع.
 */
export async function switchMode(mode: SessionMode): Promise<void> {
  await writeMode(mode);
  // كلُّ وضعٍ إلى بابه: الطالب إلى «رحلتي» بلا مرورٍ بلوحةٍ تحوّله (ملاحظات الجوال م٨).
  redirect(mode === "participant" ? "/journey" : "/dashboard");
}
