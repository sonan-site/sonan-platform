"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/sign-out";
import styles from "./session-tools.module.css";
import { ThemeToggle } from "./theme-toggle";

/**
 * أدوات الجلسة في «حسابي» (ملاحظات الجوال ب٣): المظهر والخروج — للجميع، وهما للطالب
 * موضعهما الوحيد، فرأسه لا يحمل غير «حسابي» (`docs/UI-UX.md` س-٣ المعدَّلة).
 */
export function SessionTools() {
  return (
    <div className={styles.row}>
      <ThemeToggle withLabel className={styles.tool} />
      <form action={signOut}>
        <button type="submit" className={styles.tool}>
          <LogOut size={20} aria-hidden />
          تسجيل الخروج
        </button>
      </form>
    </div>
  );
}
