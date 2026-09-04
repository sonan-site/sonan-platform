import Link from "next/link";
import { PageHead } from "@/components/shared/steps";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

/** الحالات التي تتبع الخطة — مطابقة لـ`fn_follows_plan` في القاعدة. */
const FOLLOWS_PLAN = new Set(["registered", "memorizing", "qualified"]);

const STATUS_LABEL: Record<string, string> = {
  registered: "سُجِّل ولم يبدأ",
  memorizing: "في مرحلة الحفظ",
  qualified: "اجتاز التصفيات",
  not_qualified: "لم يجتز التصفيات",
  passed: "اجتاز النهائي",
  not_passed: "لم يجتز النهائي",
};

const CARD = {
  display: "block",
  padding: "var(--space-5)",
  marginBlockEnd: "var(--space-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  maxInlineSize: "34rem",
} as const;

/** رحلات المستخدم — مشاركاته في البرامج. مستخدم ↔ مشارك واحد إلى متعدد. */
export default async function JourneyListPage() {
  const session = await getSession();
  if (session.status !== "active") {
    return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترى رحلتك." />;
  }

  const db = await createClient();
  const { data, error } = await db
    .from("participants")
    .select("id, status, programs!inner(id, name, participant_label)")
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: false });

  if (error) return <ErrorState body="تعذّر جلب مشاركاتك." />;

  const rows = data ?? [];

  return (
    <>
      <PageHead
        crumbs={[{ href: "/dashboard", label: "لوحة المتابعة" }]}
        title="رحلتي"
        lede="واجبك اليومي في البرامج التي تشارك فيها. ما تحفظه اليوم يبدأ من حيث انتهيت أمس — فمن تأخّر يجد يومه حيث تركه، ولا يُقفَز به."
      />

      {rows.length === 0 ? (
        <EmptyState
          kind="no-data"
          title="لست مشاركاً في أي برنامج"
          body="تصفّح البرامج المعلنة وسجّل في أحدها، ثم يظهر واجبك اليومي هنا."
          action={<Link href="/">تصفّح البرامج</Link>}
        />
      ) : (
        rows.map((row) => {
          const program = row.programs as unknown as { id: string; name: string };
          return (
            <Link key={row.id} href={`/journey/${row.id}`} style={CARD}>
              <strong>{program.name}</strong>
              <span
                style={{
                  display: "block",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-muted)",
                  marginBlockStart: "var(--space-1)",
                }}
              >
                {STATUS_LABEL[row.status] ?? row.status}
                {FOLLOWS_PLAN.has(row.status) ? null : " · انتهت رحلتك"}
              </span>
            </Link>
          );
        })
      )}
    </>
  );
}
