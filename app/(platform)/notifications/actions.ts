"use server";

import { createClient } from "@/lib/db/server";
import { markSeenSchema } from "@/lib/notifications/notifications";

/** فتح «تنبيهاتي» يَسِم ما عُرض حتى أحدثه — إجراءٌ بعد الرسم لا أثرٌ في القراءة (مراجعة الخطة م٥). */
export async function markNotificationsSeen(until: string): Promise<void> {
  const parsed = markSeenSchema.safeParse({ until });
  if (!parsed.success) return;
  const db = await createClient();
  await db.rpc("fn_mark_notifications_seen", { p_until: parsed.data.until });
}
