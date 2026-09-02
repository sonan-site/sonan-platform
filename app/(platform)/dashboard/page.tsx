import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

const NOTE = {
  color: "var(--color-text-muted)",
  maxInlineSize: "68ch",
  marginBlockEnd: "var(--space-6)",
} as const;

const CARD = {
  display: "block",
  padding: "var(--space-5)",
  marginBlockEnd: "var(--space-3)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  maxInlineSize: "34rem",
} as const;

const SUB = {
  display: "block",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  marginBlockStart: "var(--space-1)",
} as const;

/**
 * صفحة التوجيه لا الإحصاء.
 *
 * الإحصائيات `س١٢` من المرحلة الثانية (`adr/0022`). وما هنا يمنع أسوأ من
 * غيابها: صفحةَ هبوطٍ ميتة تستقبل كل داخل. فالمشارك يجد رحلته، والإداري يجد
 * برامجه، ومن ليس هذا ولا ذاك يجد سبباً مكتوباً لا فراغاً.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (session.status !== "active") {
    return (
      <>
        <h1>لوحة المتابعة</h1>
        <p style={NOTE}>سجّل الدخول لترى ما يخصّك.</p>
      </>
    );
  }

  const db = await createClient();
  const { data: participations } = await db
    .from("participants")
    .select("id, programs!inner(name)")
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: false });

  const mine = participations ?? [];
  const manages = session.permissions.has("programs.read");

  return (
    <>
      <h1>لوحة المتابعة</h1>
      <p style={NOTE}>
        الإحصائيات ومؤشّرات المتابعة من المرحلة الثانية. وما هنا مداخل ما يخصّك اليوم.
      </p>

      {mine.map((row) => {
        const program = row.programs as unknown as { name: string };
        return (
          <Link key={row.id} href={`/journey/${row.id}`} style={CARD}>
            <strong>واجبك اليومي — {program.name}</strong>
            <span style={SUB}>افتح رحلتك وأرسِل إتمام يومك</span>
          </Link>
        );
      })}

      {manages ? (
        <Link href="/programs" style={CARD}>
          <strong>البرامج</strong>
          <span style={SUB}>الأقسام والمسارات والمادة والخطط والمشاركون</span>
        </Link>
      ) : null}

      {mine.length === 0 && !manages ? (
        <p style={NOTE}>
          لست مشاركاً في برنامج، ولا لك صلاحية إدارية. تصفّح{" "}
          <Link href="/">البرامج المعلنة</Link> وسجّل في أحدها.
        </p>
      ) : null}
    </>
  );
}
