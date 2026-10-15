"use client";

import { MoonStar, Sun } from "lucide-react";
import { useStoredState } from "./use-stored-state";

export const THEME_KEY = "sonan.theme";

/**
 * اختيار السمة يُحفظ، والافتراض تفضيل النظام (`platform.md §١٠`).
 * السمة تُطبَّق قبل الرسم بسكربت في الترويسة، فلا ومضة بيضاء عند من اختار الداكنة.
 *
 * مكوّنٌ مشترك (ملاحظات الجوال ب٣): أيقونةٌ في الشريط الجانبي للإدارة، وزرٌّ بنصّه في «حسابي».
 */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useStoredState<"system" | "light" | "dark">(THEME_KEY, "system");

  const cycle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset["theme"] = next;
  };

  const label = theme === "dark" ? "التحويل للسمة الفاتحة" : "التحويل للسمة الداكنة";

  return (
    <button type="button" onClick={cycle} className={className} aria-label={withLabel ? undefined : label}>
      {theme === "dark" ? <Sun size={20} aria-hidden /> : <MoonStar size={20} aria-hidden />}
      {withLabel ? label : null}
    </button>
  );
}
