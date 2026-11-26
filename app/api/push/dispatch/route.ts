import { createHash, timingSafeEqual } from "node:crypto";
import { pushConfigured } from "@/lib/push/config";
import { dispatchPending } from "@/lib/push/dispatch";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { env } from "@/lib/env.server";

/**
 * مُرسِل إشعارات الجهاز (`adr/0064`) — تطلبه القاعدة وحدها عبر `pg_net`: عند إدراج إشعار، وبكنسة الساعة.
 *
 * - **خارج البوابة** (`proxy.ts`): لا جلسة لطالبه، فلو مرّ بها حُوِّل إلى الدخول.
 * - **حارسه السرّ** في ترويسة `x-push-secret`، يُقارن بتجزئتين بزمنٍ ثابت (ت٦).
 * - **لا يقبل مُدخلاً:** لا معرّفات ولا حدود — يعالج الطابور وحده، فلو تسرّب السرّ ما أتاح إلا تبكير
 *   إرسال ما فيه أصلاً.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (v: string) => createHash("sha256").update(v).digest();

function authorized(request: Request): boolean {
  const expected = env.PUSH_DISPATCH_SECRET;
  const given = request.headers.get("x-push-secret");
  if (!expected || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response(null, { status: 401 });
  if (!pushConfigured()) return new Response(null, { status: 503 });

  try {
    const result = await dispatchPending();
    // نفدت الميزانية وفي الطابور بقية: تنبيهٌ آخر بدل انتظار الكنسة (م٨).
    if (result.more) {
      const { error } = await createServiceRoleClient().rpc("fn_push_kick");
      if (error) console.error("push: تعذّر طلب دفعةٍ تالية", error.message);
    }
    return Response.json(result);
  } catch (e) {
    console.error("push: فشل الإرسال", e instanceof Error ? e.message : String(e));
    return new Response(null, { status: 500 });
  }
}
