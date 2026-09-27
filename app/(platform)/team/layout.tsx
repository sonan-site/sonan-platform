import type { ReactNode } from "react";
import { ErrorState } from "@/components/shared/states";
import { WizardBar } from "@/components/shared/wizard-bar";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { teamNextStep } from "@/lib/team/steps";
import { TeamTabs } from "./team-tabs";
import styles from "./layout.module.css";

/**
 * تخطيط الفريق — **من يعمل على المنصة، وبأي صلاحية**.
 *
 * كان المستخدمون والأدوار شاشتين متباعدتين: الدعوة تقول «لا يملك شيئاً حتى
 * يُسنَد له دور» بلا رابط، وإنشاء الأدوار لا وجود له أصلاً. فصارت الثلاثة
 * تبويبات بترتيب العمل، وفوقها خطوته التالية (`adr/0031`).
 */
export default async function TeamLayout({ children }: { children: ReactNode }) {
  const canReadUsers = (await authorizeRequest({ permission: "users.read" })).ok;
  const canReadRoles = (await authorizeRequest({ permission: "roles.read" })).ok;
  if (!canReadUsers && !canReadRoles) {
    return <ErrorState title="غير مصرَّح" body="لا تملك صلاحية لهذا الإجراء." />;
  }

  const db = await createClient();
  const [people, roles, assignments] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    db.from("roles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    db.from("user_roles").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);

  const step = teamNextStep({
    people: people.count ?? 0,
    roles: roles.count ?? 0,
    assignments: assignments.count ?? 0,
  });

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>الفريق</h1>
      </div>

      <TeamTabs canReadUsers={canReadUsers} canReadRoles={canReadRoles} />

      <WizardBar
        base="/team"
        done={step.done}
        total={step.total}
        step={step.next}
        allDoneText="فريقك مكتمل — لكلٍّ دوره."
      />

      {children}
    </>
  );
}
