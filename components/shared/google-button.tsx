"use client";

import { LogIn } from "lucide-react";
import { useState } from "react";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/db/browser";
import { Button } from "./form";
import styles from "./google-button.module.css";

/**
 * «المتابعة بحساب Google» — **الواحد** في صفحتي الدخول وإنشاء الحساب (`adr/0025`).
 *
 * يُبدأ من المتصفح: عميله يحفظ مُحقِّق PKCE في الكوكيز، فيتبادله مسار
 * `/auth/callback` القائم برمز Google كما يتبادل غيره. ومن دخل أول مرة بلا جوال
 * يحوّله التخطيط إلى «أكمل حسابك».
 */
export function GoogleButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setPending(true);
    setFailed(false);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    // عند النجاح يغادر المتصفح الصفحة إلى Google، فلا يُعاد الزر.
    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className={styles.wrap}>
      <Button type="button" pending={pending} onClick={() => void start()} className={styles.button}>
        <LogIn size={16} aria-hidden className={styles.icon} />
        المتابعة بحساب Google
      </Button>
      {failed ? (
        <p className={styles.error} role="alert">
          تعذّر الدخول بحساب Google الآن. استعمل البريد وكلمة المرور، أو أعد المحاولة بعد قليل.
        </p>
      ) : null}
      <div className={styles.divider} aria-hidden>
        <span>أو</span>
      </div>
    </div>
  );
}
