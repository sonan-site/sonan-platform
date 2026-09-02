"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { registerInProgram } from "./actions";

export type QuestionRow = {
  id: string;
  question: string;
  required: boolean;
  trackId: string | null;
};

export type TrackOption = { id: string; name: string; description: string; capacity: number | null };

const ERR = { color: "var(--color-danger)" } as const;
const NOTE = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  marginBlockEnd: "var(--space-6)",
} as const;

export function RegisterForm({
  programId,
  slug,
  participantLabel,
  tracks,
  questions,
}: {
  programId: string;
  slug: string;
  participantLabel: string;
  tracks: TrackOption[];
  questions: QuestionRow[];
}) {
  const [state, action, pending] = useActionState(registerInProgram, EMPTY_FORM_STATE);
  const [trackId, setTrackId] = useState<string>(tracks[0]?.id ?? "");

  // السؤال العام يظهر دائماً، والخاص بمسار يظهر عند اختياره — فلا يُطالَب
  // المسجِّل بسؤال لا يخصّه.
  const visible = questions.filter((q) => q.trackId === null || q.trackId === trackId);

  return (
    <>
      <h1>التسجيل</h1>
      <p style={NOTE}>
        أكمل الأسئلة الإلزامية ليكتمل تسجيلك بصفة {participantLabel} — القبول فوري بلا
        مراجعة.
      </p>

      {state.error ? <p style={ERR}>{state.error}</p> : null}

      <form action={action} style={{ maxInlineSize: "34rem" }}>
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="slug" value={slug} />

        {tracks.length > 0 ? (
          <Field id="trackId" label="المسار" required>
            <Select
              id="trackId"
              name="trackId"
              required
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.capacity !== null ? ` — السعة ${formatNumber(t.capacity)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {visible.map((q) => (
          <Field key={q.id} id={`q:${q.id}`} label={q.question} required={q.required}>
            <Textarea id={`q:${q.id}`} name={`q:${q.id}`} rows={2} required={q.required} />
          </Field>
        ))}

        {visible.length === 0 && tracks.length === 0 ? (
          <Field id="confirm" label="تأكيد الرغبة في الالتحاق" required>
            <Input id="confirm" name="confirm" defaultValue="نعم" readOnly />
          </Field>
        ) : null}

        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            إتمام التسجيل
          </Button>
        </FormActions>
      </form>
    </>
  );
}
