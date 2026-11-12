import "server-only";
import { createClient } from "@/lib/db/server";
import { clearTempPassword } from "./admin";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * ختام الكلمة المؤقتة بعد أن يعيّن صاحب الحساب كلمته (adr/0060) — من «اكتب كلمتك» ومن رابط الاسترجاع
 * معاً (مراجعة ١): رفع العلامة، ثم إغلاق جلساته الأخرى، ثم السجلّ. والكلمة تُعيَّن قبله دائماً، فلا تُرفع
 * العلامة والمؤقتة قائمة.
 */
export async function finishTempPassword(db: Db, userId: string): Promise<boolean> {
  const cleared = await clearTempPassword(userId);
  if (!cleared.ok) return false;

  // من عرف المؤقتة ودخل بها لا يبقى داخلاً — وفشل الإغلاق يُدوَّن في السجلّ لا يُبتلع (مراجعة ٧).
  const { error: outError } = await db.auth.signOut({ scope: "others" });
  if (outError) console.error("temp password: تعذّر إغلاق الجلسات الأخرى", outError.message);

  const { data: profile } = await db.from("profiles").select("id").eq("user_id", userId).maybeSingle();
  const { error: auditError } = await db.rpc("fn_write_audit", {
    p_action: "temp_password_replaced",
    p_entity_table: "profiles",
    ...(profile ? { p_entity_id: profile.id } : {}),
    p_after: { user_id: userId, others_signed_out: !outError },
  });
  if (auditError) console.error("temp password: تعذّر تسجيل التعيين", auditError.message);
  return true;
}
