"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import type { FilterLink } from "./filter-links";
import styles from "./filter-select.module.css";

/** مفاتيح تنقّلٍ داخل القائمة المغلقة — تغيّر قيمتها على Windows، فلا تنتقل الصفحة بها حتى Enter أو المغادرة. */
const BROWSE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
const UNKNOWN = "\u0000";

/**
 * مرشّحٌ قائمةً منسدلة مسمّاة — بديل صفوف الأزرار المستديرة حين تتعدّد الأبعاد (ملاحظة الراعي ١١ نوفمبر).
 *
 * يأخذ `FilterLink[]` التي يحسبها الخادم للتسميات، ويقرأ من رابط كل خيارٍ قيمةَ `param` وحدها. والرابط
 * يُبنى **لحظة الاختيار** من الرابط الحاليّ (`useSearchParams`) لا من رابطٍ محسوبٍ وقت الرسم — فقائمتان
 * تُغيَّران متتاليتين قبل وصول الصفحة لا تُلغي ثانيتُهما الأولى، ولا يضيع بحثٌ كُتب للتوّ.
 *
 * والصفحة تبدأ من أولها، و`clears` معاملاتٌ تسقط مع التغيير (وضع البحث يُسقط نصّه مثلاً).
 * ويُستعمل داخل `DataTable` (`controls`) فيقع تحت حدّ `Suspense` الذي يوجبه `useSearchParams`.
 */
export function FilterSelect({
  label,
  param,
  links,
  clears = [],
}: {
  label: string;
  param: string;
  links: FilterLink[];
  clears?: string[];
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const browsing = useRef(false);

  const options = links.map((l) => ({ label: l.label, value: new URL(l.href, "http://local").searchParams.get(param) }));
  const current = params.get(param);
  // قيمةٌ في الرابط لا خيار لها (برنامجٌ حُذف) تُقال صراحةً — لا يُعرض «الكل» والتصفية قائمة.
  const known = options.some((o) => o.value === current);
  const currentKey = known ? (current ?? "") : UNKNOWN;

  const [draft, setDraft] = useState(currentKey);
  const [lastKey, setLastKey] = useState(currentKey);
  // الرابط مصدر الحقيقة: تغيّره من الخارج (الرجوع، إزالة وسم) يُزامن القائمة — أثناء التصيير كما في الجدول.
  if (currentKey !== lastKey) {
    setLastKey(currentKey);
    setDraft(currentKey);
  }

  if (links.length === 0) return null;

  const commit = (key: string) => {
    browsing.current = false;
    if (key === currentKey || key === UNKNOWN) return;
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    for (const c of clears) next.delete(c);
    if (key) next.set(param, key);
    else next.delete(param);
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLSelectElement>) => {
    if (BROWSE_KEYS.has(e.key)) browsing.current = true;
    if (e.key === "Enter") commit(draft);
  };

  return (
    <div className={styles.field} aria-busy={pending || undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={draft}
        onPointerDown={() => (browsing.current = false)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setDraft(e.target.value);
          // بالفأرة واللمس يُنتقل فوراً؛ وبأسهم لوحة المفاتيح عند Enter أو مغادرة القائمة.
          if (!browsing.current) commit(e.target.value);
        }}
        onBlur={() => browsing.current && commit(draft)}
      >
        {known ? null : <option value={UNKNOWN}>اختيارٌ غير متاح</option>}
        {options.map((o) => (
          <option key={o.value ?? ""} value={o.value ?? ""}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** شريط المرشّحات: سطرٌ واحد يلتفّ على الجوال. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className={styles.bar}>{children}</div>;
}
