import { createClient } from "@supabase/supabase-js";
import { now } from "@/lib/format";

/**
 * تسجيل ساعة النشاط من البوّابة (adr/0061): نداءٌ واحد لكل جلسة في الساعة، بعد إرسال الرد.
 *
 * **الحاجز في ذاكرة نسخة الخادم** (الجلسة، الساعة) يمنع تكرار النداء — والصحّة في القاعدة (سطرٌ فريد
 * لكل حساب في الساعة) ولو تعدّدت النسخ. يُحجز المفتاح عند النداء فلا تتسابق إليه طلبات الصفحة الواحدة،
 * ويُفكّ إن تعثّر **عابراً** (الشبكة · 5xx)، فلا يُضيّع ذلك الساعة (مراجعة م١). أما ردٌّ ثابت (دالّةٌ غائبة
 * أو خطأٌ فيها) فيبقى الحجز إلى الساعة التالية، فلا يصير كل طلبٍ نداءً فاشلاً (مراجعة الكود ح٢).
 * وبلا كوكي: الشروط تحصرها في الدخول والجلسة.
 */

/** الساعة الحالية رقماً (ساعات منذ ١٩٧٠) — مفتاح الحاجز. */
export function currentHour(at: Date = now()): number {
  return Math.floor(at.getTime() / 3_600_000);
}

/** جلساتٌ نُوديت لها هذه الساعة أو يجري نداؤها. يُفرَّغ مع كل ساعةٍ جديدة، فلا يكبر. */
export class TouchGate {
  private hour = -1;
  private readonly taken = new Set<string>();

  /** يحجز الجلسة لهذه الساعة — `false` إن سبق حجزها، فلا نداء. */
  take(sessionId: string, hour: number): boolean {
    if (hour !== this.hour) {
      this.hour = hour;
      this.taken.clear();
    }
    if (this.taken.has(sessionId)) return false;
    this.taken.add(sessionId);
    return true;
  }

  /** فشل النداء — يُفكّ الحجز فيُعاد مع الطلب التالي. */
  release(sessionId: string, hour: number): void {
    if (hour === this.hour) this.taken.delete(sessionId);
  }
}

const gate = new TouchGate();

/** يحجز ساعة الجلسة إن احتاجتها — ويُرجع الساعة، أو `null` فلا نداء. */
export function claimActivityTouch(sessionId: string | undefined): number | null {
  if (!sessionId) return null;
  const hour = currentHour();
  return gate.take(sessionId, hour) ? hour : null;
}

/**
 * النداء نفسه — وعده لـ`waitUntil`، لا يرفض أبداً.
 *
 * **عميلٌ معزول برمز الوصول** (مراجعة م٢): لا يجدّد الرمز ولا يمسّ الكوكيز. فلو جُدِّد بعد إرسال الرد
 * لاستُهلك رمز التجديد ولم تصل كوكيزه إلى المتصفح. و**فشله صامت**: الإحصاء لا يكسر صفحة.
 */
export function sendActivityTouch(sessionId: string, hour: number, accessToken: string | undefined): Promise<void> {
  if (!accessToken) {
    gate.release(sessionId, hour);
    return Promise.resolve();
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return Promise.resolve(db.rpc("fn_activity_touch")).then(
    ({ error, status }) => {
      if (error && (status === 0 || status >= 500)) gate.release(sessionId, hour);
    },
    () => gate.release(sessionId, hour),
  );
}
