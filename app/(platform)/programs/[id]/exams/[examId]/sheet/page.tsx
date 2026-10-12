import Link from "next/link";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { parseSheet } from "@/lib/exams/sheet";
import { authorizeRequest } from "@/lib/permissions/server";
import { z } from "@/lib/validation/z";
import { RetroSheet } from "./retro-sheet";

/**
 * إدخال ورقة محكّمٍ ورقية باسمه (`adr/0048`) — البديل عند تعطّل جوالٍ أو شبكة.
 * الورقة نفسها التي يراها المحكّم، والسبب إلزاميٌّ يُسجَّل مع كل سؤال.
 */
export const maxDuration = 60;

export default async function RetroSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; examId: string }>;
  searchParams: Promise<{ session?: string; participant?: string; judge?: string }>;
}) {
  const { id, examId } = await params;
  const q = await searchParams;
  const parsed = z.object({ session: z.uuid(), participant: z.uuid(), judge: z.uuid() }).safeParse(q);
  if (!parsed.success) return <ErrorState body="ورقة غير معروفة." />;

  const authz = await authorizeRequest({ permission: "exams.manage", programId: id, resourceProgramId: id });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_judge_sheet", {
    p_session_id: parsed.data.session,
    p_participant_id: parsed.data.participant,
    p_judge_id: parsed.data.judge,
  });
  if (error) return <ErrorState body="تعذّر جلب الورقة." />;
  let sheet;
  try {
    sheet = parseSheet(data);
  } catch {
    return <ErrorState body="تعذّرت قراءة الورقة." />;
  }

  return (
    <>
      <p>
        <Link href={`/programs/${id}/exams/${examId}`}>الاختبار النهائي</Link>
      </p>
      <RetroSheet
        programId={id}
        sessionId={parsed.data.session}
        participantId={parsed.data.participant}
        judgeId={parsed.data.judge}
        initial={sheet}
      />
    </>
  );
}
