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
export function GoogleButton({
  next,
  mode = "participant",
  label = "المتابعة بحساب Google",
  reauth = false,
}: {
  next: string;
  /** وضع الجلسة الذي يكتبه الباب — يُحمَل في الوجهة ليكتبه مسار الاستدعاء. */
  mode?: "participant" | "staff";
  label?: string;
  /**
   * إعادة دخولٍ من داخل المنصة (ب٢ · `adr/0051`): بلا فاصل «أو»، ويُطلب من Google اختيار
   * الحساب صراحةً — فلا تكتمل بنقرةٍ على جهازٍ بقي Google مفتوحاً فيه بحسابٍ آخر.
   */
  reauth?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setPending(true);
    setFailed(false);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      safeNext(next),
    )}&mode=${mode}`;
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, ...(reauth ? { queryParams: { prompt: "select_account" } } : {}) },
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
        {label}
        <LogIn size={16} aria-hidden className={styles.icon} />
      </Button>
      {failed ? (
        <p className={styles.error} role="alert">
          تعذّر الدخول بحساب Google الآن. استعمل البريد وكلمة المرور، أو أعد المحاولة بعد قليل.
        </p>
      ) : null}
      {reauth ? null : (
        <div className={styles.divider} aria-hidden>
          <span>أو</span>
        </div>
      )}
    </div>
  );
}
