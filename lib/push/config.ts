import "server-only";
import { env } from "@/lib/env.server";

/**
 * إشعارات الجهاز جاهزةٌ ومفعّلة (`adr/0064`): المفاتيح الثلاثة موجودة، ولم تُطفأ بمفتاح الإيقاف. قيمةٌ
 * واحدة للمُرسِل والواجهة معاً (مراجعة البناء م١) — فلا يُدعى أحدٌ إلى تفعيل ما لا يُرسَل.
 */
export function pushReady(): boolean {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.PUSH_DISPATCH_SECRET) && env.PUSH_ENABLED !== "off";
}

/** المفاتيح موجودة — المسار يعمل، ولو أُطفئ الإرسال (يحجز ولا يرسل). */
export function pushConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.PUSH_DISPATCH_SECRET);
}
