import "server-only";
import { getSession } from "@/lib/auth/session";

/**
 * يدخل شاشة التحكيم من يحمل `exams.judge` بأي نطاق — عامّاً أو محصوراً
 * ببرنامج. وما بعد الدخول تحرسه دوالّ القاعدة: الجلسة جلستُه وبرنامجها برنامجُ
 * صلاحيته (`fn_is_session_judge`).
 */
export async function canJudge(): Promise<boolean> {
  const session = await getSession();
  return session.status === "active" && (session.permissions.get("exams.judge")?.size ?? 0) > 0;
}
