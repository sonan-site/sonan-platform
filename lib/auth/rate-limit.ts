import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/db/service-role";

/**
 * حدّ المعدل. الحدود تُقرأ في القاعدة لا هنا — انظر الهجرة 009.
 *
 * **يُستدعى بمفتاح الخدمة لا بمفتاح الزائر** (الهجرة ٠٢٦): كان مكشوفاً لـ anon
 * لأن الدخول يسبق المصادقة، فصار أي زائر يمسح العدّادات أو يملأ دلو غيره.
 *
 * **المعرّف مُلخَّص لا خام**: السجل يحتاج التمييز بين محاولة وأخرى، ولا يحتاج
 * معرفة صاحبها. تخزين البريد خاماً في جدول يقرؤه من يملك audit.read توسيعٌ
 * لدائرة من يرى بيانات شخصية بلا موجب.
 */

type Action = "auth.login" | "auth.recovery" | "auth.invite" | "auth.register";

function digest(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * عنوان الطالب. **دلو الدخول بريدٌ وعنوان معاً**: بالبريد وحده يقفل أيُّ أحد
 * حسابَ المدير بخمس محاولات خاطئة باسمه.
 */
async function clientAddress(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

async function bucketOf(action: Action, identifier: string): Promise<string> {
  const key = action === "auth.login" ? `${identifier}|${await clientAddress()}` : identifier;
  return `${action}:${digest(key)}`;
}

export async function withinRateLimit(action: Action, identifier: string): Promise<boolean> {
  const { data, error } = await createServiceRoleClient().rpc("fn_rate_limit", {
    p_bucket: await bucketOf(action, identifier),
    p_setting_prefix: action,
  });
  // خطأ في الفحص = منع. الافتراض الآمن يُفحَص لا يُفترَض.
  if (error) return false;
  return data === true;
}

/** الدخول الناجح يُفرغ دلوه، فلا تُحسب عليه محاولاته الخاطئة قبله. */
export async function clearRateLimit(action: Action, identifier: string): Promise<void> {
  await createServiceRoleClient().rpc("fn_rate_limit_clear", {
    p_bucket: await bucketOf(action, identifier),
  });
}
