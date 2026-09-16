"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { Input } from "./form";
import styles from "./password-input.module.css";

/**
 * كلمة المرور بمعاينة — **الواحدة** في كل شاشة تُكتب فيها كلمة مرور.
 *
 * من يكتب كلمة مرور بلا رؤيتها يخطئ ولا يدري أين أخطأ، فيعيد الكتابة كلها.
 * والخانة تحمل `data-password` دائماً: `ActionForm` يمسح كلمات المرور عند فشل
 * الإرسال، ولو اعتمد على `type` وحده لبقيت المعروضة مكتوبة على الشاشة.
 */
export function PasswordInput({
  invalid,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { invalid?: boolean }) {
  const [shown, setShown] = useState(false);

  return (
    <div className={styles.wrap}>
      <Input
        {...rest}
        type={shown ? "text" : "password"}
        data-password=""
        invalid={invalid}
        className={styles.input}
      />
      <button
        type="button"
        className={styles.toggle}
        aria-label={shown ? "أخفِ كلمة المرور" : "أظهر كلمة المرور"}
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
      >
        {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  );
}
