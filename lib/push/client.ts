import { pushIsMine, subscribePush, unsubscribePush } from "./actions";
import { isStandalone } from "./standalone";

export { isStandalone };

/**
 * إشعارات الجهاز في المتصفح (`adr/0064`): حال هذا الجهاز للداخل، وتفعيلها وإيقافها. والحال من الخادم
 * لا من المتصفح — فالجهاز قد يحمل اشتراك حساباتٍ أخرى (م٣).
 */

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function isIos(): boolean {
  const ua = navigator.userAgent;
  // الآيباد الحديث يقدّم نفسه «ماك» — ويُعرف بلمسه.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** إشعارات الويب على iOS من ١٦٫٤ — وما دونه لا يُدعى إلى التثبيت لأجلها (م١٢). */
function iosSupportsPush(): boolean {
  const m = /OS (\d+)_(\d+)/.exec(navigator.userAgent) ?? /Version\/(\d+)\.(\d+)/.exec(navigator.userAgent);
  if (!m) return true;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 16 || (major === 16 && minor >= 4);
}

function browserSupports(): boolean {
  return Boolean(VAPID_KEY) && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!VAPID_KEY) return "unsupported";
  // في Safari الآيفون لا `PushManager` أصلاً — فالحال تُعرف بالجهاز لا بفحص الدعم (م١٢).
  if (isIos()) {
    if (!iosSupportsPush()) return "unsupported";
    if (!isStandalone()) return "needs-install";
  }
  if (!browserSupports()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await currentSubscription();
  if (!sub || Notification.permission !== "granted") return "off";
  return (await pushIsMine(sub.endpoint)) ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

/**
 * التفعيل — **يُنادى من ضغطة زرّ مباشرة**: iOS لا يسأل الإذن إلا من فعل المستخدم، وطلب الإذن أول
 * ما فيها. واشتراك المتصفح القائم (لحسابٍ آخر على الجهاز) يُستعمل كما هو، إلا إن تغيّر المفتاح (ت٧).
 */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";

  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const key = keyBytes(VAPID_KEY);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  const json = sub.toJSON();
  const ok = await subscribePush({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
  return ok ? "on" : "off";
}

/** الإيقاف للداخل وحده — ويُلغي المتصفح اشتراكه إن لم يبقَ عليه حسابٌ آخر. */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (!sub) return "off";
  const remaining = await unsubscribePush(sub.endpoint);
  if (remaining === 0) await sub.unsubscribe().catch(() => undefined);
  return remaining === null ? "on" : "off";
}
