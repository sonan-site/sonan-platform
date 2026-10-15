"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/sign-out";
import styles from "./session-tools.module.css";

/**
 * أدوات الجلسة في «حسابي» (ملاحظات الجوال ب٣): الخروج — للجميع، وهو للطالب موضعه الوحيد،
 * فرأسه يحمل المظهر و«حسابي» وحدهما (`docs/UI-UX.md` س-٣ المعدَّلة · قرار الراعي ١٥ أكتوبر).
 */
export function SessionTools() {
  return (
    <div className={styles.row}>
      <form action={signOut}>
        <button type="submit" className={styles.tool}>
          <LogOut size={20} aria-hidden />
          تسجيل الخروج
        </button>
      </form>
    </div>
  );
}
