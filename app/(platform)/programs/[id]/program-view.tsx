"use client";

import { useActionState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import {
  Messages,
  PageHead,
  Readiness,
  Step,
  StepForm,
} from "@/components/shared/steps";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth, formatNumber } from "@/lib/format";
import type { ReadinessItem } from "@/lib/programs/readiness";
import { REGISTRATION_LABEL, type RegistrationState } from "@/lib/programs/registration";
import { archiveTrack, createTrack, setProgramStatus } from "../actions";

export type ProgramDetail = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  status: "draft" | "published" | "closed";
  participantLabel: string;
  capacity: number | null;
  opensAt: string | null;
  closesAt: string | null;
  passingPercentage: number;
  awardPercentage: number;
  registration: RegistrationState;
};

export type TrackRow = {
  id: string;
  name: string;
  description: string;
  capacity: number | null;
};

const META = {
  display: "grid",
  gap: "var(--space-2)",
  fontSize: "var(--text-sm)",
  marginBlockEnd: "var(--space-6)",
} as const;

export function ProgramView({
  readinessItems,
  program,
  tracks,
  canWrite,
}: {
  readinessItems: ReadinessItem[];
  program: ProgramDetail;
  tracks: TrackRow[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(createTrack, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const columns: Column<TrackRow>[] = [
    { key: "name", header: "المسار", sortable: true, primary: true, render: (t) => t.name },
    { key: "description", header: "الوصف", render: (t) => t.description || "—" },
    {
      key: "capacity",
      header: "السعة",
      align: "end",
      render: (t) => (t.capacity === null ? "بلا سقف" : formatNumber(t.capacity)),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "end" as const,
            render: (t: TrackRow) => (
              <Button
                pending={busy}
                onClick={() =>
                  startTransition(async () => void (await archiveTrack(t.id, program.id)))
                }
              >
                أرشفة
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHead
        crumbs={[
          { href: "/programs", label: "البرامج" },
          { href: `/programs/${program.id}/content`, label: "ما يحفظه المشاركون" },
          { href: `/programs/${program.id}/plans`, label: "الخطط" },
          { href: `/programs/${program.id}/participants`, label: "المشاركون" },
        ]}
        title={program.name}
        lede="من هنا تُدير البرنامج كلّه: مساراته، ونشره، وما ينقصه قبل أن يُفتَح للناس."
      />

      <Readiness
        items={readinessItems}
        hrefOf={(fix) =>
          fix === "content"
            ? `/programs/${program.id}/content`
            : fix === "plans"
              ? `/programs/${program.id}/plans`
              : null
        }
      />

      <div style={META}>
        <span>
          الرابط: <code dir="ltr">{program.slug}</code>
        </span>
        <span>مسمّى المشارك: {program.participantLabel}</span>
        <span>
          السعة: {program.capacity === null ? "بلا سقف" : formatNumber(program.capacity)}
        </span>
        <span>
          نافذة التسجيل:{" "}
          {program.opensAt ? formatDateBoth(program.opensAt) : "بلا بداية محدَّدة"} —{" "}
          {program.closesAt ? formatDateBoth(program.closesAt) : "بلا نهاية محدَّدة"}
        </span>
        <span>حالة التسجيل: {REGISTRATION_LABEL[program.registration]}</span>
      </div>

      {canWrite ? (
        <div style={{ display: "flex", gap: "var(--space-3)", marginBlockEnd: "var(--space-8)" }}>
          {program.status !== "published" ? (
            <Button
              variant="primary"
              pending={busy}
              onClick={() =>
                startTransition(async () => void (await setProgramStatus(program.id, "published")))
              }
            >
              نشر البرنامج
            </Button>
          ) : null}
          {program.status === "published" ? (
            <Button
              pending={busy}
              onClick={() =>
                startTransition(async () => void (await setProgramStatus(program.id, "draft")))
              }
            >
              إعادة لمسوّدة
            </Button>
          ) : null}
          {program.status !== "closed" ? (
            <Button
              variant="danger"
              pending={busy}
              onClick={() =>
                startTransition(async () => void (await setProgramStatus(program.id, "closed")))
              }
            >
              إغلاق
            </Button>
          ) : null}
        </div>
      ) : null}

      <Step
        n={1}
        title="المسارات"
        why="المسار مستوىً يختاره المسجِّل. ولكلٍّ نصيبه من المادة وخطته، فمن أراد مستوىً واحداً يكتفي بمسار واحد."
        done={tracks.length > 0}
        state={
          tracks.length === 0 ? (
            <span>لا مسارات — لن يجد المسجِّل ما يختاره.</span>
          ) : (
            <span>{formatNumber(tracks.length)} مساراً</span>
          )
        }
      >
        <DataTable
          columns={columns}
          rows={tracks}
          rowKey={(t) => t.id}
          total={tracks.length}
          page={1}
          searchPlaceholder="ابحث باسم المسار…"
          empty={{
            title: "لا مسارات بعد",
            body: canWrite ? "أضف أول مسار بالنموذج أدناه." : "لم تُضَف مسارات لهذا البرنامج.",
          }}
        />

        {canWrite ? (
          <StepForm title="أضِف مساراً" action={action}>
            <input type="hidden" name="programId" value={program.id} />

            <Field id="tname" label="اسم المسار" required error={state.fieldErrors?.["name"]}>
              <Input id="tname" name="name" required />
            </Field>

            <Field id="tdesc" label="الوصف">
              <Textarea id="tdesc" name="description" rows={2} />
            </Field>

            <Field
              id="tcap"
              label="سعة المسار"
              hint="اتركها فارغة لبلا سقف"
              error={state.fieldErrors?.["capacity"]}
            >
              <Input id="tcap" name="capacity" numeric latin />
            </Field>

            <Field id="tsort" label="الترتيب">
              <Input id="tsort" name="sortOrder" numeric latin defaultValue="0" />
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                أضِف
              </Button>
            </FormActions>
            <Messages state={state} />
          </StepForm>
        ) : null}
      </Step>
    </>
  );
}
