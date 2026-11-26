/*
 * عامل إشعارات منصة سنن (adr/0064). يعرض ما يصل من إشعارات الجهاز، ويفتح المنصة عند الضغط عليها.
 *
 * - لا يعترض الطلبات (لا `fetch`) ولا يخزّن شيئاً: لا صفحةٌ قديمة ولا بياناتٌ مخبّأة.
 * - كل `push` ينتهي بإشعارٍ معروض ولو فشلت قراءة حمولته — iOS يلغي اشتراك من يتلقّى بلا عرض (م١٢).
 */

const FALLBACK = { title: "منصة سنن", body: "لديك تنبيهٌ جديد", url: "/notifications", tag: "sonan" };

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // يتولّى النوافذ المفتوحة فوراً، فيقدر على توجيهها عند الضغط (م١٢).
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.body === "string") {
      return {
        title: typeof data.title === "string" ? data.title : FALLBACK.title,
        body: data.body,
        url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : FALLBACK.url,
        tag: typeof data.tag === "string" ? data.tag : FALLBACK.tag,
      };
    }
  } catch (e) {
    // حمولةٌ لا تُقرأ: النصّ الاحتياطي.
  }
  return FALLBACK;
}

self.addEventListener("push", (event) => {
  const note = readPayload(event);
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(note.title, {
        body: note.body,
        tag: note.tag,
        icon: "/icons/icon-192.png",
        // وسمٌ جديدٌ لكل إشعار، والمعاد (تعديل البيانات المتلاحق) ينبّه من جديد لا يستبدل صامتاً.
        renotify: true,
        lang: "ar",
        dir: "rtl",
        data: { url: note.url },
      });
      // المنصة مفتوحة: تُحدَّث نقطة الجرس (ت٨).
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) client.postMessage({ type: "push-received" });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || FALLBACK.url;
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const mine = open.find((client) => new URL(client.url).origin === self.location.origin);
      if (mine) {
        try {
          const focused = await mine.focus();
          await (focused || mine).navigate(target);
          return;
        } catch (e) {
          // نافذةٌ لا يتحكّم فيها العامل بعد (م١٢): تبقى في المقدّمة كما هي، ولا تُفتح ثانية (مراجعة البناء ت٨).
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
