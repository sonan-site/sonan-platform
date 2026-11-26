"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isStandalone as standalone } from "@/lib/push/standalone";
import type { PWAInstallElement } from "@khmyznikov/pwa-install";
import { Button } from "@/components/shared/form";
import { useFloatingBar } from "./floating-bar";
import { attachInArabic, createInstallElement } from "./install-dialog";
import { laterStore } from "./later";
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


const { postponed, postpone } = laterStore("install-later");

export function InstallInvite() {
  const el = useRef<PWAInstallElement | null>(null);
  const [available, setAvailable] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (standalone() || postponed()) return;
    let node: PWAInstallElement | null = null;
    let cancelled = false;
    const onPrompt = () => setAvailable(true);

    void createInstallElement().then((created) => {
      if (cancelled) return;
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

  const bar = useRef<HTMLElement | null>(null);
  useFloatingBar(bar, available);

  // في «تنبيهاتي» سطرٌ يدعو إلى التثبيت لأجل الإشعارات — فلا يجتمعان (adr/0064 · مراجعة البناء م٢).
  if (!available || pathname === "/notifications") return null;

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
