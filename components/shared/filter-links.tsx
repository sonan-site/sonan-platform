import Link from "next/link";
import styles from "./filter-links.module.css";

/** خيار تصفيةٍ رابطاً — الرابط يحمل البحث والفرز معه، والصفحة تقرؤه. */
export type FilterLink = { label: string; href: string; current: boolean };

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * الرابط نفسه ببحثه وتصفيته وفرزه، مع ما يُبدَّل (`null` يحذف)، **وبلا رقم الصفحة** — فالتصفية
 * تبدأ من أولها، وإعادة التوجيه من صفحةٍ تجاوزت النتائج تعود إليها.
 */
export function hrefWith(path: string, params: SearchParams, patch: Record<string, string | null> = {}): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || Object.hasOwn(patch, key) || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) next.append(key, v);
  }
  for (const [key, value] of Object.entries(patch)) if (value) next.set(key, value);
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * مرشّحاتٌ روابط لا عنصر تنقّل (`nav-outside-source`) — على نمط مرشّحات «صوتك».
 * تناسب الخيارات القليلة؛ وما زاد على ثمانية تقريباً يحتاج قائمةً منسدلة.
 */
export function FilterLinks({ label, links }: { label: string; links: FilterLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className={styles.filters} role="group" aria-label={label}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.current ? "true" : undefined}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}
