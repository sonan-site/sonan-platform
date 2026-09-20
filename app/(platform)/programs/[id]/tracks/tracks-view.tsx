"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { InlineText } from "@/components/shared/inline-edit";
import { Messages, Step, StepForm } from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { archiveTrack, createTrack, updateTrack } from "../../actions";

export type TrackRow = {
  id: string;
  name: string;
  description: string;
  capacity: number | null;
};

/**
 * تبويب المسارات — **الخطوة الأولى في بناء البرنامج**.
 *
 * وبعد أول مسار يُعرَض **الإعداد السريع** طريقاً افتراضياً: خمسة أسئلة تبني
 * المادة ونصيب المسارات والواجبات والخطة دفعة واحدة، ومن أراد التفصيل فله
 * تبويب المادة (`adr/0029`).
 */
export function TracksView({
  programId,
  tracks,
  canWrite,
  canQuickSetup,
}: {
  programId: string;
  tracks: TrackRow[];
  canWrite: boolean;
  /** البرنامج بلا مادة ولا واجبات ولا أشكال — شرط `fn_quick_setup` نفسه. */
  canQuickSetup: boolean;
}) {
  const [state, action, pending] = useActionState(createTrack, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const columns: Column<TrackRow>[] = [
    {
      key: "name",
      header: "المسار",
      sortable: true,
      primary: true,
      render: (t) =>
        canWrite ? (
          <InlineText
            label={`اسم المسار ${t.name}`}
            value={t.name}
            onSave={(name) => updateTrack(t.id, programId, { name })}
          />
        ) : (
          t.name
        ),
    },
    {
      key: "description",
      header: "الوصف",
      render: (t) =>
        canWrite ? (
          <InlineText
            label={`وصف المسار ${t.name}`}
            value={t.description}
            allowEmpty
            maxInlineSize="22rem"
            onSave={(description) => updateTrack(t.id, programId, { description })}
          />
        ) : (
          t.description || "—"
        ),
    },
    {
      key: "capacity",
      header: "السعة",
      align: "end",
      render: (t) =>
        canWrite ? (
          <InlineText
            label={`سعة المسار ${t.name} — فارغة لبلا سقف`}
            value={t.capacity === null ? "" : String(t.capacity)}
            allowEmpty
            latin
            maxInlineSize="6rem"
            onSave={(raw) =>
              updateTrack(t.id, programId, {
                capacity: raw === "" ? null : Number(raw),
              })
            }
          />
        ) : t.capacity === null ? (
          "بلا سقف"
        ) : (
          formatNumber(t.capacity)
        ),
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
                  startTransition(async () => reportAction(await archiveTrack(t.id, programId)))
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
          <StepForm title="أضِف مساراً" action={action} state={state}>
            <input type="hidden" name="programId" value={programId} />

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

      {canWrite && canQuickSetup && tracks.length > 0 ? (
        <Step
          n={2}
          title="أعِدّ البرنامج سريعاً"
          why="خمسة أسئلة تُنشئ المادة ونصيب المسارات وواجبات اليوم والخطة دفعة واحدة. وكلّها قابلة للتعديل بعدها."
          done={false}
          state={<span>لم تُدخل المادة بعد — والإعداد السريع أقصر طريق إليها.</span>}
        >
          <FormActions>
            <Link href={`/programs/${programId}/setup`}>
              <Button variant="primary">افتح الإعداد السريع</Button>
            </Link>
          </FormActions>
          <p
            style={{
              fontSize: "var(--text-sm)",
              marginBlockStart: "var(--space-3)",
            }}
          >
            <Link href={`/programs/${programId}/content`}>أفضّل التفصيل</Link>
          </p>
        </Step>
      ) : null}
    </>
  );
}
