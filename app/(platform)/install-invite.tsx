"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { PWAInstallElement } from "@khmyznikov/pwa-install";
import { Button } from "@/components/shared/form";
import { now } from "@/lib/format";
import styles from "./install-invite.module.css";

/**
 * دعوة «ثبّت المنصة على جهازك» (`adr/0063`) — شريطٌ عائمٌ أسفل صفحات المنصة لكل من دخل.
 *
 * - **Chrome وEdge (أندرويد والحاسوب):** «ثبّت» يفتح نافذة التثبيت الأصلية بضغطة.
 * - **الآيفون والآيباد وSafari على الماك:** لا يتيح Safari التثبيت من الصفحة، فـ«ثبّت» يفتح
 *   نافذة المكتبة بشكل iOS وفيها خطوتا «المشاركة ← إضافة إلى الشاشة الرئيسية».
 * - **المتصفحات الداخلية** (إنستغرام وأمثاله): نافذة المكتبة تطلب فتح الرابط في المتصفح أولاً.
 * - **لا تظهر** لمن فتح المنصة من أيقونتها، ولا حيث لا يُتاح التثبيت، ولا في الأيام السبعة بعد «ليس الآن».
 *
 * المكتبة (`@khmyznikov/pwa-install`) تُحمَّل بعد رسم الصفحة، فلا تُبطئ فتحها.
 */

const KEY = "install-later";
const LATER_DAYS = 7;
const DAY_MS = 86_400_000;

declare global {
  interface Window {
    /** يُمسكه سطر التخطيط الجذري قبل التحميل — `app/layout.tsx`. يُسلَّم للمكتبة مرةً ثم يُصفَّر. */
    __sonanInstall?: PWAInstallElement["externalPromptEvent"];
    /** حيث تحفظ المكتبة عرض Chrome الذي بيدها (اسمها في أنواعها `IWindow`)، وتصفّره إذا استُهلك. */
    defferedPromptEvent?: PWAInstallElement["externalPromptEvent"];
  }
}

/** Chrome وEdge وSamsung — متصفحاتٌ تعرض التثبيت بنفسها، فلا تُدعى إلا حين تعرضه. */
const chromium = () => "BeforeInstallPromptEvent" in window;

function standalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** لحظة التأجيل في الذاكرة أيضاً — فإن حُجب التخزين بقيت مخفيةً حتى يُعاد تحميل الصفحة. */
let memLater = 0;

function postponed(): boolean {
  let at = memLater;
  try {
    at = Number(window.localStorage.getItem(KEY)) || memLater;
  } catch {
    // التخزين محجوب: الذاكرة وحدها.
  }
  return at > 0 && now().getTime() - at < LATER_DAYS * DAY_MS;
}

function postpone() {
  memLater = now().getTime();
  try {
    window.localStorage.setItem(KEY, String(memLater));
  } catch {
    // التخزين محجوب: الذاكرة وحدها.
  }
}

/**
 * لغة نافذة المكتبة تتبع لغة الجهاز وحدها — والمنصة عربية، فجوالٌ بالإنجليزية يرى نافذة
 * إنجليزية. تقرأ المكتبة `navigator.language` مرةً واحدة عند الإلحاق، فيُظلَّل بالعربية
 * لحظتها ثم يُزال الظل فوراً، فلا يمسّ شيئاً غيرها.
 */
function attachInArabic(node: HTMLElement) {
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

export function InstallInvite() {
  const el = useRef<PWAInstallElement | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (standalone() || postponed()) return;
    let node: PWAInstallElement | null = null;
    let cancelled = false;
    const onPrompt = () => setAvailable(true);

    void import("@khmyznikov/pwa-install").then(() => {
      if (cancelled) return;
      const created = document.createElement("pwa-install") as PWAInstallElement;
      created.setAttribute("manifest-url", "/manifest.webmanifest");
      // النافذة لا تُفتح إلا بزرّنا، وبلا معرض لقطات (لا لقطات في التعريف).
      created.setAttribute("manual-apple", "");
      created.setAttribute("manual-chrome", "");
      created.setAttribute("disable-screenshots", "");
      // في Chrome وأمثاله لا «خطوات يدوية» بدل عرض المتصفح: من ثبّتها لا يُعرض عليه شيء،
      // فالخطوات تُريه تثبيت ما عنده (المراجعة م٢). وتبقى لـFirefox وأمثاله على أندرويد.
      if (chromium()) created.setAttribute("disable-android-fallback", "");
      // العرض يُستهلك مرة: يُسلَّم ويُصفَّر، فلا يُعاد عرضٌ ميت بعد التنقّل (المراجعة م١).
      created.externalPromptEvent = window.__sonanInstall ?? null;
      window.__sonanInstall = null;
      created.addEventListener("pwa-install-available-event", () => {
        // في Chrome: لا دعوة إلا والعرض بيد المكتبة — لا بمجرد وجود واجهة التثبيت الجديدة (المراجعة م٤).
        if (chromium() && !window.defferedPromptEvent && !created.externalPromptEvent) return;
        setAvailable(true);
      });
      created.addEventListener("pwa-install-success-event", () => setAvailable(false));
      // رفض نافذة Chrome يستهلك العرض: تُخفى البطاقة حتى يعرضه المتصفح من جديد (المراجعة م١).
      created.addEventListener("pwa-user-choice-result-event", () => {
        if (created.userChoiceResult === "dismissed") setAvailable(false);
      });
      created.addEventListener("pwa-install-fail-event", () => setAvailable(false));
      attachInArabic(created);
      node = el.current = created;
      // عرضٌ يُطلقه Chrome بعد التحميل: المكتبة تُمسكه (مستمعها أسبق)، وحدثها «متاح» لا يتكرر.
      window.addEventListener("beforeinstallprompt", onPrompt);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      node?.remove();
      el.current = null;
    };
  }, []);

  /**
   * الشريط يعوم فوق المحتوى فلا يدفعه (المراجعة م٣)، ولا يحجبه كذلك: ارتفاعه في `--install-bar`
   * فيرتفع فوقه كل لاصقٍ في الأسفل (زرّ اليوم · التنبيه)، ويُفسَح بقدره آخر الصفحة ليُبلَغ ما تحته.
   */
  const bar = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const node = bar.current;
    if (!available || !node) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--install-bar", `calc(${Math.ceil(node.getBoundingClientRect().height)}px + var(--space-2))`);
    };
    sync();
    const watch = new ResizeObserver(sync);
    watch.observe(node);
    document.body.style.setProperty("padding-block-end", "var(--install-bar)");
    return () => {
      watch.disconnect();
      root.style.removeProperty("--install-bar");
      document.body.style.removeProperty("padding-block-end");
    };
  }, [available]);

  if (!available) return null;

  const install = () => {
    const node = el.current;
    if (!node) return;
    // Chrome وEdge: النافذة الأصلية مباشرة (والإخفاق يُعلَن بحدثٍ لا برفض).
    const direct = !node.isAppleMobilePlatform && !node.isAppleDesktopPlatform && !node.isInAppBrowser && !node.isAndroidFallback;
    if (direct) {
      void node.install();
      return;
    }
    // وما عداهما نافذة الخطوات. Safari لا يُعلمنا بالإضافة، فمن رأى الخطوات تُؤجَّل
    // دعوته أسبوعاً — ومن أضافها يفتحها من الأيقونة فلا يراها أصلاً (المراجعة ت٢).
    node.showDialog(true);
    postpone();
  };

  const later = () => {
    postpone();
    setAvailable(false);
  };

  return (
    <aside ref={bar} className={styles.invite} aria-label="تثبيت المنصة">
      <Image className={styles.icon} src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div className={styles.text}>
        <strong>ثبّت منصة سنن على جهازك</strong>
        <span>تفتحها من أيقونتها بضغطة، كأي تطبيق.</span>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onClick={install}>
          ثبّت
        </Button>
        <Button onClick={later}>ليس الآن</Button>
      </div>
    </aside>
  );
}
