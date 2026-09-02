import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.server";
import type { Database } from "./database.types";

/**
 * الوحدة **الوحيدة** التي تحمل مفتاح service_role.
 *
 * `server-only` يجعل استيرادها من مكوّن عميل **يفشل عند البناء** لا وقت التشغيل —
 * والتبعية معلَنة في package.json كما يوجب platform.md 7.
 *
 * هذا العميل **يتجاوز RLS بالكامل**. لا يُستدعى إلا حيث يعجز عميل المستخدم:
 * كتابة إشعار لغيره، أو إجراء إداري مصرَّح به بقرار مرقّم. وكل استدعاء
 * مسؤولية كاتبه في فحص الصلاحية بنفسه — لأن القاعدة لن تفحصها عنه.
 */
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
