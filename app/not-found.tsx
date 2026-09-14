import Link from "next/link";
import { EmptyState } from "@/components/shared/states";

/** صفحة «غير موجود» — بالعربية. بدونها يعرض الإطار صفحته الإنجليزية. */
export default function NotFound() {
  return (
    <main style={{ maxInlineSize: "34rem", marginInline: "auto", paddingBlock: "var(--space-10)", paddingInline: "var(--space-4)" }}>
      <EmptyState
        kind="no-data"
        title="الصفحة غير موجودة"
        body="ربما تغيّر الرابط أو حُذفت الصفحة."
        action={<Link href="/">الصفحة الرئيسية</Link>}
      />
    </main>
  );
}
