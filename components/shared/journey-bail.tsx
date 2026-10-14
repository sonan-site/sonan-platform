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
  registrationNo = null,
}: {
  title: string;
  body: string;
  programName: string;
  programSlug: string;
  /** جهة تواصل إدارة البرنامج — فارغة إن لم تُضبط بعد. */
  contact: string;
  /** رقم تسجيله — يُذكر للاستفسار (خطة واجهة الطالب ش١٠). */
  registrationNo?: string | null;
}) {
  return (
    <EmptyState
      kind="no-data"
      title={title}
      body={[body, registrationNo ? `رقم تسجيلك: \u2068${registrationNo}\u2069.` : "", contact ? `جهة التواصل: ${contact}` : ""].filter(Boolean).join(" ")}
      action={
        <span style={{ display: "flex", gap: "var(--space-4)", fontSize: "var(--text-sm)" }}>
          <Link href="/journey">رحلتي</Link>
          <Link href={`/p/${programSlug}`}>صفحة {programName}</Link>
        </span>
      }
    />
  );
}
