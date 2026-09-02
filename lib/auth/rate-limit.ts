import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/db/server";

/**
 * حدّ المعدل. الحدود تُقرأ في القاعدة لا هنا — انظر الهجرة 009.
 *
 * **المعرّف مُلخَّص لا خام**: السجل يحتاج التمييز بين محاولة وأخرى، ولا يحتاج
 * معرفة صاحبها. تخزين البريد خاماً في جدول يقرؤه من يملك audit.read توسيعٌ
 * لدائرة من يرى بيانات شخصية بلا موجب.
 */
export async function withinRateLimit(
  action: "auth.login" | "auth.recovery" | "auth.invite" | "auth.register",
  identifier: string,
): Promise<boolean> {
  const digest = createHash("sha256").update(identifier.toLowerCase()).digest("hex").slice(0, 32);
  const db = await createClient();
  const { data, error } = await db.rpc("fn_rate_limit", {
    p_bucket: `${action}:${digest}`,
    p_setting_prefix: action,
  });
  // خطأ في الفحص = منع. الافتراض الآمن يُفحَص لا يُفترَض.
  if (error) return false;
  return data === true;
}
