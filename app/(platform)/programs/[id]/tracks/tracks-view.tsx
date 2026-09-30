"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { InlineText } from "@/components/shared/inline-edit";
import { Modal } from "@/components/shared/modal";
import { ScreenActions } from "@/components/shared/screen-actions";
import { Messages, Step, StepForm } from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { createTrack, deleteTrack, moveTrack, updateTrack } from "../../actions";

const ICON = 14;

/** أزرار الصفّ في سطرٍ واحد بفواصلها — كما في شاشة النشر. */
const ROW_ACTIONS = {
  display: "flex",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
  flexWrap: "wrap",
} as const;

export type TrackRow = {
  id: string;
  name: string;
  description: string;
  capacity: number | null;
  /** المشاركون فيه الآن — وجودهم يمنع الحذف، فيُعطَّل زرّه بسببه (`ق-٢٠`). */
  participants: number;
  /** خططه — تُحذف معه، والنافذة تقول ذلك قبل أن يقرّ. */
  plans: number;
};

/** سبب منع الحذف، أو `null` حين لا مانع — نصٌّ واحد للزرّ وللنافذة. */
function blocker(t: TrackRow): string | null {
  return t.participants === 0
    ? null
    : `في المسار ${formatNumber(t.participants)} مشاركاً — انقلهم قبل حذفه`;
}

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
  const [deleting, setDeleting] = useState<TrackRow | null>(null);
  // بطاقة الإضافة تظهر بطلبها (`ق-٢٤`) — ومفتوحةٌ أوّلاً لمن لا مسار له.
  const [adding, setAdding] = useState(tracks.length === 0);

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
            render: (t: TrackRow) => {
              const i = tracks.findIndex((r) => r.id === t.id);
              const why = blocker(t);
              return (
                <span style={ROW_ACTIONS}>
                  <Button
                    aria-label={`قدّم ${t.name}`}
                    disabled={i === 0}
                    pending={busy}
                    onClick={() =>
                      startTransition(async () =>
                        reportAction(await moveTrack(t.id, programId, "up")),
                      )
                    }
                  >
                    <ChevronUp size={ICON} aria-hidden />
                  </Button>
                  <Button
                    aria-label={`أخّر ${t.name}`}
                    disabled={i === tracks.length - 1}
                    pending={busy}
                    onClick={() =>
                      startTransition(async () =>
                        reportAction(await moveTrack(t.id, programId, "down")),
                      )
                    }
                  >
                    <ChevronDown size={ICON} aria-hidden />
                  </Button>
                  {/* المعطَّل يقول سببه (`ق-٢٠`) — لا يُرفض بعد النقر. */}
                  <Button
                    aria-label={`احذف ${t.name}`}
                    variant="danger"
                    title={why ?? undefined}
                    disabled={why !== null}
                    onClick={() => setDeleting(t)}
                  >
                    <Trash2 size={ICON} aria-hidden />
                  </Button>
                </span>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <>
      {canWrite ? (
        <ScreenActions>
          <Button variant="primary" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <Plus size={16} aria-hidden />
            أضِف مساراً
          </Button>
        </ScreenActions>
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
            body: canWrite
              ? "أضف أول مسار من زرّ «أضِف مساراً» في أعلى الشاشة."
              : "لم تُضَف مسارات لهذا البرنامج.",
          }}
        />

        {canWrite && adding ? (
          <StepForm title="أضِف مساراً" action={action} state={state}>
            <input type="hidden" name="programId" value={programId} />

            <Field id="tname" label="اسم المسار" required error={state.fieldErrors?.["name"]}>
              <Input id="tname" name="name" required />
            </Field>

            <Field id="tdesc" label="الوصف" span="full">
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

            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                أضِف
              </Button>
            </FormActions>
            <Messages state={state} />
          </StepForm>
        ) : null}
      </Step>

      <Modal open={deleting !== null} title="حذف المسار" onClose={() => setDeleting(null)}>
        <p>
          يخرج «{deleting?.name}» من البرنامج، فلا يجده المسجِّل ولا يُختار بعدها.
          {deleting && deleting.plans > 0
            ? ` وتخرج معه ${formatNumber(deleting.plans)} خطةً مبنيّةً عليه.`
            : ""}
        </p>
        <FormActions>
          <Button
            variant="danger"
            pending={busy}
            onClick={() => {
              const target = deleting;
              if (!target) return;
              setDeleting(null);
              startTransition(async () => reportAction(await deleteTrack(target.id, programId)));
            }}
          >
            احذف المسار
          </Button>
          <Button onClick={() => setDeleting(null)}>تراجع</Button>
        </FormActions>
      </Modal>

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
