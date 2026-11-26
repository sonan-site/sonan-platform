"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/form";
import { enablePush, isStandalone, pushState } from "@/lib/push/client";
import { useFloatingBar } from "./floating-bar";
import { laterStore } from "./later";
import styles from "./install-invite.module.css";

const { postponed, postpone } = laterStore("push-later");

/**
 * دعوة «فعّل الإشعارات» (`adr/0064` · قرار الراعي ٢٦ نوفمبر) — لمن فتح المنصة من أيقونتها ولم يفعّلها:
 * شريطٌ عائم أسفل الشاشة بشكل دعوة التثبيت، ولا يجتمعان (من فتحها من الأيقونة لا يُدعى إلى تثبيتها).
 * لا يُطلب إذن الجهاز إلا بالضغط، ولا يظهر لمن رفضه من جهازه، و«ليس الآن» أسبوع.
 *
 * ويُحدِّث الإطار حين يصل إشعارٌ والمنصة مفتوحة — فتظهر نقطة الجرس (ت٨).
 */
export function PushInvite() {
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const bar = useRef<HTMLElement | null>(null);
  useFloatingBar(bar, shown);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === "push-received") router.refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    if (!isStandalone() || postponed()) return;
    let live = true;
    pushState()
      .then((s) => live && setShown(s === "off"))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!shown) return null;

  const enable = () => {
    setBusy(true);
    enablePush()
      .then((s) => {
        if (s !== "on") postpone();
        setShown(false);
      })
      .catch(() => setShown(false))
      .finally(() => setBusy(false));
  };

  const later = () => {
    postpone();
    setShown(false);
  };

  return (
    <aside ref={bar} className={styles.invite} aria-label="تفعيل الإشعارات">
      <Image className={styles.icon} src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div className={styles.text}>
        <strong>فعّل الإشعارات</strong>
        <span>تصلك تنبيهاتك على جهازك ولو كانت المنصة مغلقة.</span>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" pending={busy} onClick={enable}>
          فعّل
        </Button>
        <Button onClick={later}>ليس الآن</Button>
      </div>
    </aside>
  );
}
