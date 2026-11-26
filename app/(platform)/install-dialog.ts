import type { PWAInstallElement } from "@khmyznikov/pwa-install";

/**
 * نافذة خطوات التثبيت (`adr/0063`) — من شريط الدعوة، ومن «تنبيهاتي» لمن يحتاج التثبيت ليصله إشعار
 * (`adr/0064` · ت٢). المكتبة تُحمَّل عند الحاجة وحدها.
 */

/**
 * لغة نافذة المكتبة تتبع لغة الجهاز وحدها — والمنصة عربية، فجوالٌ بالإنجليزية يرى نافذة
 * إنجليزية. تقرأ المكتبة `navigator.language` مرةً واحدة عند الإلحاق، فيُظلَّل بالعربية
 * لحظتها ثم يُزال الظل فوراً، فلا يمسّ شيئاً غيرها.
 */
export function attachInArabic(node: HTMLElement) {
  let shadowed = false;
  try {
    Object.defineProperty(navigator, "language", { value: "ar", configurable: true });
    shadowed = true;
  } catch {
    // لا يُظلَّل في متصفحٍ نادر: تبقى النافذة بلغة الجهاز.
  }
  try {
    document.body.appendChild(node);
  } finally {
    if (shadowed) delete (navigator as { language?: string }).language;
  }
}

/** عنصر المكتبة بإعداداتنا: لا يُفتح إلا بزرّنا، وبلا معرض لقطات. لا يُلحق بالصفحة. */
export async function createInstallElement(): Promise<PWAInstallElement> {
  await import("@khmyznikov/pwa-install");
  const created = document.createElement("pwa-install") as PWAInstallElement;
  created.setAttribute("manifest-url", "/manifest.webmanifest");
  created.setAttribute("manual-apple", "");
  created.setAttribute("manual-chrome", "");
  created.setAttribute("disable-screenshots", "");
  return created;
}

/** يفتح خطوات التثبيت مباشرة — لمن في Safari الآيفون (لا عرض تثبيتٍ هناك يُنتظر). */
let steps: PWAInstallElement | null = null;

export async function openInstallSteps(): Promise<void> {
  // عنصرٌ واحد يُعاد فتحه — لا عنصرٌ جديد مع كل ضغطة (مراجعة البناء ت١٠).
  if (steps?.isConnected) {
    steps.showDialog(true);
    return;
  }
  const created = await createInstallElement();
  attachInArabic(created);
  steps = created;
  await (created as PWAInstallElement & { updateComplete?: Promise<unknown> }).updateComplete;
  created.showDialog(true);
}
