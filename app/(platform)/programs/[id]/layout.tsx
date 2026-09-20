import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/shared/states";
import { WizardBar } from "@/components/shared/wizard-bar";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { PROGRAM_STATUS_LABEL } from "@/lib/programs/kinds";
import { programReadiness } from "@/lib/programs/readiness-server";
import { nextStep } from "@/lib/programs/readiness";
import { ProgramTabs } from "./program-tabs";
import styles from "./layout.module.css";

/**
 * تخطيط شاشات البرنامج — **العنوان والتبويبات وخطوة المعالج فوق كل تبويب**.
 *
 * كانت أعمال البرنامج الستّة في عمود واحد، وترقيم الخطوات يبدأ من جديد في كل
 * شاشة، فلا يعرف المُعِدّ أين هو ولا ما التالي. هنا: تبويبٌ لكل عمل، وخطوةٌ
 * تالية **واحدة** ظاهرة في كل شاشة (`adr/0029`).
 */
export default async function ProgramLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authz = await authorizeRequest({
    permission: "programs.read",
    programId: id,
    resourceProgramId: id,
  });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const canWrite = (
    await authorizeRequest({ permission: "programs.write", programId: id, resourceProgramId: id })
  ).ok;
  const canReadParticipants = (
    await authorizeRequest({ permission: "participants.read", programId: id, resourceProgramId: id })
  ).ok;

  const db = await createClient();
  const [{ data: program }, ready] = await Promise.all([
    db.from("programs").select("id, name, status").eq("id", id).is("deleted_at", null).maybeSingle(),
    programReadiness(id),
  ]);
  if (!program) notFound();

  return (
    <>
      <div className={styles.head}>
        <p className={styles.crumbs}>
          <Link href="/programs">البرامج</Link>
        </p>
        <h1 className={styles.title}>
          {program.name}
          <span className={styles.status}>{PROGRAM_STATUS_LABEL[program.status]}</span>
        </h1>
      </div>

      <ProgramTabs programId={id} canWrite={canWrite} canReadParticipants={canReadParticipants} />

      {canWrite && ready ? (
        <WizardBar
          programId={id}
          done={ready.items.filter((i) => i.done).length}
          total={ready.items.length}
          step={nextStep(ready.items)}
        />
      ) : null}

      {children}
    </>
  );
}
