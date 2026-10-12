"use client";

import { useRouter } from "next/navigation";
import type { JudgeSheet } from "@/lib/exams/sheet";
import { SheetView } from "../../../../../judge/sheet-view";
import { replaceOralQuestion } from "../actions";

/** ورقة الإدارة: إدخالٌ عن المحكّم، واستبدال سؤالٍ لم يقيّمه أحد (الهجرة ٠٨٧). */
export function RetroSheet({
  programId,
  sessionId,
  participantId,
  judgeId,
  initial,
}: {
  programId: string;
  sessionId: string;
  participantId: string;
  judgeId: string;
  initial: JudgeSheet;
}) {
  const router = useRouter();
  return (
    <SheetView
      // الورقة تُبنى من الخادم بعد الاستبدال — فمفتاحها أسئلتها.
      key={initial.questions.map((q) => q.id).join()}
      sessionId={sessionId}
      participantId={participantId}
      judgeId={judgeId}
      initial={initial}
      onReplace={async (questionId) => {
        const r = await replaceOralQuestion(programId, sessionId, participantId, questionId);
        if (r.error) return r.error;
        router.refresh();
        return null;
      }}
    />
  );
}
