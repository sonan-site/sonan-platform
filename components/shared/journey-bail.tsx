import Link from "next/link";
import { EmptyState } from "@/components/shared/states";

/**
 * ما يُعرض للمشارك حين لا واجب له — **ومعه مخرج دائماً**.
 *
 * كانت ستّ حالات تقول «تواصل مع إدارة البرنامج» بلا وسيلة تواصل ولا رابط
 * رجوع، فيقف المشارك في صفحةٍ لا شيء فيها (`adr/0030`).
 */
export function JourneyBail({
  title,
  body,
  programName,
  programSlug,
  contact,
}: {
  title: string;
  body: string;
  programName: string;
  programSlug: string;
  /** جهة تواصل إدارة البرنامج — فارغة إن لم تُضبط بعد. */
  contact: string;
}) {
  return (
    <EmptyState
      kind="no-data"
      title={title}
      body={contact ? `${body} جهة التواصل: ${contact}` : body}
      action={
        <span style={{ display: "flex", gap: "var(--space-4)", fontSize: "var(--text-sm)" }}>
          <Link href="/journey">رحلتي</Link>
          <Link href={`/p/${programSlug}`}>صفحة {programName}</Link>
        </span>
      }
    />
  );
}
