"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/shared/form";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push/client";
import { openInstallSteps } from "../install-dialog";
import styles from "./notifications.module.css";

/**
 * إشعارات هذا الجهاز (`adr/0064`) — سطرٌ أعلى «تنبيهاتي» بحسب الحال. الإذن لا يُطلب إلا بضغط الزرّ:
 * iOS يشترطه، والطلب المفاجئ يُرفض غالباً فلا يُعاد.
 */
export function PushPanel() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    pushState()
      .then((s) => live && setState(s))
      .catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);

  if (!state || state === "unsupported") return null;

  const run = (work: () => Promise<PushState>) => {
    setBusy(true);
    setFailed(false);
    work()
      .then(setState)
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  return (
    <section className={styles.push} aria-label="إشعارات هذا الجهاز">
      {state === "on" ? (
        <>
          <p>الإشعارات مفعّلة على هذا الجهاز: يصلك كل تنبيهٍ جديد ولو كانت المنصة مغلقة.</p>
          <Button pending={busy} onClick={() => run(disablePush)}>
            أوقفها
          </Button>
        </>
      ) : state === "off" ? (
        <>
          <p>فعّل الإشعارات ليصلك كل تنبيهٍ جديد على هذا الجهاز ولو كانت المنصة مغلقة.</p>
          <Button variant="primary" pending={busy} onClick={() => run(enablePush)}>
            فعّل على هذا الجهاز
          </Button>
        </>
      ) : state === "denied" ? (
        <p>إشعارات المنصة موقوفةٌ من إعدادات جهازك. فعّلها من هناك ليصلك كل تنبيهٍ جديد.</p>
      ) : (
        <>
          <p>لتصلك الإشعارات على الآيفون، ثبّت المنصة على شاشتك الرئيسية ثم افتحها من أيقونتها.</p>
          <Button onClick={() => void openInstallSteps()}>طريقة التثبيت</Button>
        </>
      )}
      {failed ? <p className={styles.pushError}>تعذّر ذلك. أعد المحاولة.</p> : null}
    </section>
  );
}
