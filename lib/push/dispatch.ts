import "server-only";
import webpush, { WebPushError } from "web-push";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { env } from "@/lib/env.server";
import { CONTACT_EMAIL } from "@/lib/legal/terms";
import { pushConfigured, pushReady } from "./config";
import { now } from "@/lib/format";
import { classifyPushFailure, isAllowedEndpoint, pushPayload, type ClaimedNotification } from "./shared";

/**
 * المُرسِل (`adr/0064`): يحجز ما لم يُرسَل من الإشعارات ويرسله إلى أجهزة أصحابها، في حلقةٍ بميزانية
 * وقت (م٨). يُستدعى من `app/api/push/dispatch` وحده — بتنبيهٍ من القاعدة عند الإدراج، أو بكنسة الساعة.
 */

const BATCH = 25;
const PARALLEL = 10;
/** لا تُحجز دفعةٌ بعده. */
const BUDGET_MS = 30_000;
/** لا يبدأ إرسالٌ بعده — وما لم يبدأ يعود إلى الطابور (مراجعة البناء ت٢)، فلا يُقتل الطلب عند `maxDuration` وفي يده محجوز. */
const HARD_STOP_MS = 48_000;
const SEND_TIMEOUT_MS = 5_000;
const TTL_SECONDS = 86_400;
const STALE_FAILURE_DAYS = 7;

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

export type DispatchResult = { claimed: number; sent: number; gone: number; failed: number; more: boolean };

export async function dispatchPending(): Promise<DispatchResult> {
  const db = createServiceRoleClient();
  const result: DispatchResult = { claimed: 0, sent: 0, gone: 0, failed: 0, more: false };
  const enabled = pushReady();
  if (!pushConfigured()) return result;
  if (enabled) {
    // `subject` بريدٌ صالح — Apple تردّ ٤٠٣ بدونه (م١٢).
    webpush.setVapidDetails(`mailto:${CONTACT_EMAIL}`, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  }
  const started = now().getTime();

  while (now().getTime() - started < BUDGET_MS) {
    const { data, error } = await db.rpc("fn_push_claim", { p_limit: BATCH });
    if (error) throw new Error(`fn_push_claim: ${error.message}`);
    const rows = (data ?? []) as Array<ClaimedNotification & { deliver: boolean }>;
    // يُعاد كل ما حُجز، فالفارغ يعني أن الطابور فرغ (أو أن ما بقي محجوزٌ لطلبٍ موازٍ).
    if (rows.length === 0) break;
    result.claimed += rows.length;
    const claimed = rows.filter((n) => n.deliver);
    // مفتاح الإيقاف: يُحجز ولا يُرسل — فلا يتراكم ما يُرسَل دفعةً عند الإعادة (م١٠).
    if (!enabled) continue;

    const recipients = [...new Set(claimed.map((n) => n.recipient_id))];
    const { data: subs, error: subsError } = await db
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", recipients);
    if (subsError) throw new Error(`push_subscriptions: ${subsError.message}`);

    const jobs: Array<{ sub: Subscription; body: string; note: string }> = [];
    for (const n of claimed) {
      const payload = pushPayload(n);
      if (!payload) continue;
      const body = JSON.stringify(payload);
      for (const sub of (subs ?? []) as Subscription[]) if (sub.user_id === n.recipient_id) jobs.push({ sub, body, note: n.id });
    }
    const unstarted = await runLimited(jobs, PARALLEL, started + HARD_STOP_MS, (job) => sendOne(db, job.sub, job.body, result));
    if (unstarted.length > 0) {
      // ما لم يبدأ إرساله لأيٍّ من أجهزة صاحبه يعود إلى الطابور — وما بدأ لبعضها لا يعود فلا يتكرر.
      const begun = new Set(jobs.filter((j) => !unstarted.includes(j)).map((j) => j.note));
      const back = [...new Set(unstarted.map((j) => j.note))].filter((id) => !begun.has(id));
      if (back.length > 0) {
        const { error: backError } = await db.from("notifications").update({ pushed_at: null }).in("id", back);
        if (backError) console.error("push: تعذّر إعادة ما لم يُرسل إلى الطابور", backError.message);
      }
      result.more = true;
      break;
    }
  }

  result.more ||= now().getTime() - started >= BUDGET_MS;
  if (enabled) await dropStaleFailures(db);
  return result;
}

type Db = ReturnType<typeof createServiceRoleClient>;

async function sendOne(db: Db, sub: Subscription, body: string, result: DispatchResult): Promise<void> {
  // صنو قيد القاعدة — لا يُطلب عنوانٌ خارج خدمات الإشعار ولو وُجد صفّه (م٢).
  if (!isAllowedEndpoint(sub.endpoint)) {
    await db.from("push_subscriptions").delete().eq("id", sub.id);
    result.gone += 1;
    return;
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
      TTL: TTL_SECONDS,
      urgency: "normal",
      timeout: SEND_TIMEOUT_MS,
    });
    result.sent += 1;
    await db.from("push_subscriptions").update({ last_success_at: now().toISOString(), failing_since: null }).eq("id", sub.id);
  } catch (e) {
    const status = e instanceof WebPushError ? e.statusCode : undefined;
    const kind = classifyPushFailure(status);
    if (kind === "gone") {
      result.gone += 1;
      await db.from("push_subscriptions").delete().eq("id", sub.id);
      return;
    }
    result.failed += 1;
    if (kind === "config") {
      // خطأٌ عندنا لا عند الجهاز: يُسجَّل ولا يُحتسب عليه (م١).
      console.error("push: ردٌّ يدلّ على خطأ إعداد", status, e instanceof WebPushError ? e.body : String(e));
      return;
    }
    await db
      .from("push_subscriptions")
      .update({ failing_since: now().toISOString() })
      .eq("id", sub.id)
      .is("failing_since", null);
  }
}

/** ما فشل عابراً سبعة أيام متصلة يُحذف — بالمدة لا بالعدد (م١). */
async function dropStaleFailures(db: Db): Promise<void> {
  const cutoff = new Date(now().getTime() - STALE_FAILURE_DAYS * 86_400_000).toISOString();
  const { error } = await db.from("push_subscriptions").delete().lt("failing_since", cutoff);
  if (error) console.error("push: تعذّر حذف الاشتراكات المتعثّرة", error.message);
}

/** تزامنٌ محدود: `limit` إرسالاتٍ معاً لا أكثر (م٨)، ولا يبدأ شيءٌ بعد `deadline`. يُعيد ما لم يبدأ. */
async function runLimited<T>(items: T[], limit: number, deadline: number, work: (item: T) => Promise<void>): Promise<T[]> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && now().getTime() < deadline) {
      const item = items[next++]!;
      await work(item);
    }
  });
  await Promise.all(lanes);
  return items.slice(next);
}
