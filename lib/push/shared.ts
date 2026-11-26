import { isNotificationKind, notificationMessage } from "@/lib/notifications/notifications";

/**
 * إشعارات الجهاز (`adr/0064`) — ما يشترك فيه المُرسِل والإجراءات والاختبار، بلا أثرٍ جانبي.
 */

/** مفتاح الكوكي الذي يحمل عنوان هذا الجهاز، فيحذفه الخروج من الخادم بلا اعتمادٍ على المتصفح (م٤). */
export const PUSH_ENDPOINT_COOKIE = "push-endpoint";

/**
 * خدمات الإشعار المعروفة وحدها — صنو `fn_push_endpoint_allowed` في القاعدة (م٢): المُرسِل يطلب
 * العنوان من خادمنا، فلا يطلب إلا هذه.
 */
const ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)\/[A-Za-z0-9._~:/?=&%+,!*-]+$/;

export const isAllowedEndpoint = (v: unknown): v is string => typeof v === "string" && v.length <= 1024 && ENDPOINT.test(v);

export type PushDevice = "ios" | "android" | "desktop" | "other";

/** نوع الجهاز وحده لا وصف متصفحه (م١١). */
export function deviceFromUserAgent(ua: string | null | undefined): PushDevice {
  if (!ua) return "other";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "desktop";
  return "other";
}

/**
 * ما يُفعل بالاشتراك بعد ردّ خدمة الإشعار (م١):
 * - `gone` (٤٠٤ · ٤١٠): الجهاز ألغى الاشتراك — يُحذف.
 * - `config` (٤٠٠ · ٤٠١ · ٤٠٣ · ٤١٣): خطأٌ عندنا (المفاتيح أو الحمولة) — يُسجَّل ولا يُحتسب على الجهاز،
 *   وإلا محا خطأ إعدادٍ واحد أجهزة الجميع.
 * - `transient` (٤٢٩ · ٥xx · انقطاع): عابر — يُحذف بعد سبعة أيام متصلة لا بالعدد.
 */
export function classifyPushFailure(status: number | undefined): "gone" | "config" | "transient" {
  if (status === 404 || status === 410) return "gone";
  if (status === 400 || status === 401 || status === 403 || status === 413) return "config";
  return "transient";
}

/** صفّ من `fn_push_claim` — حقول «تنبيهاتي» نفسها. */
export type ClaimedNotification = {
  id: string;
  recipient_id: string;
  kind: string;
  track_name: string | null;
  decision: string | null;
  body: string | null;
  created_at: string;
};

export type PushPayload = { title: string; body: string; url: string; tag: string };

/**
 * حمولة الإشعار: نصّه نصّ «تنبيهاتي» نفسه (`notificationMessage`) فلا يتباينان، ووجهته «تنبيهاتي» —
 * فتحها يَسِم المقروء كما اليوم. ونوعٌ لا تعرفه الواجهة لا يُرسَل.
 */
export function pushPayload(n: ClaimedNotification): PushPayload | null {
  if (!isNotificationKind(n.kind)) return null;
  const { text } = notificationMessage({
    id: n.id,
    kind: n.kind,
    participantId: null,
    programName: null,
    trackName: n.track_name,
    decision: n.decision,
    fields: n.body,
    createdAt: n.created_at,
    unread: true,
  });
  return { title: "منصة سنن", body: text, url: "/notifications", tag: n.id };
}
