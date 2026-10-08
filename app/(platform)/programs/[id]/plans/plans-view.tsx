"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select } from "@/components/shared/form";
import { InlineText } from "@/components/shared/inline-edit";
import { Modal } from "@/components/shared/modal";
import { Messages, Muted, Step, StepForm, TabHead } from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { EXAM_DEFAULTS } from "@/lib/programs/exam-defaults";
import { createDefaultPlan, createExam, customizeTrackPlan, renameExam, revertTrackPlan } from "./actions";
import styles from "./plans.module.css";

export type PlanSummary = {
  id: string;
  trackId: string | null;
  name: string;
  dayCount: number;
  lockedThrough: number;
  issues: { trackId: string | null; severity: "error" | "warning"; message: string }[];
};

export type TrackPlanRow = {
  trackId: string;
  trackName: string;
  /** خطته المخصّصة — وبلا مخصّصة يرث الافتراضية. */
  custom: PlanSummary | null;
  planId: string | null;
  dayCount: number;
  errors: number;
  warnings: string[];
};

export type ExamRow = {
  id: string;
  name: string;
  type: "remote" | "oral";
  stage: "interim" | "final";
  trackName: string | null;
  questionCount: number;
};

export function PlansView({
  programId,
  defaultPlan,
  rows,
  tracks,
  exams,
}: {
  programId: string;
  defaultPlan: PlanSummary | null;
  rows: TrackPlanRow[];
  tracks: { id: string; name: string }[];
  /** `null` لنمطٍ بلا اختبارات `[BR-KIND-01]`. */
  exams: ExamRow[] | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [customizing, setCustomizing] = useState<TrackPlanRow | null>(null);

  const base = `/programs/${programId}/plans`;
  const defaultErrors = defaultPlan?.issues.filter((i) => i.severity === "error").length ?? 0;

  const columns: Column<TrackPlanRow>[] = [
    { key: "track", header: "المسار", primary: true, render: (r) => r.trackName },
    {
      key: "plan",
      header: "خطته",
      render: (r) =>
        r.custom ? (
          <Link href={`${base}/${r.custom.id}`}>مخصّصة — {r.custom.name}</Link>
        ) : defaultPlan ? (
          <span>يرث الافتراضية</span>
        ) : (
          <Muted>بلا خطة</Muted>
        ),
    },
    {
      key: "days",
      header: "الأيام",
      align: "end",
      render: (r) => (r.planId ? formatNumber(r.dayCount) : "—"),
    },
    {
      key: "state",
      header: "الحالة",
      render: (r) =>
        !r.planId || r.dayCount === 0 ? (
          <span className={styles.warn}>بلا أيام</span>
        ) : r.errors > 0 ? (
          <span className={styles.bad}>{formatNumber(r.errors)} ملاحظات تمنع الحفظ</span>
        ) : r.warnings.length > 0 ? (
          <span className={styles.warn} title={r.warnings.join("\n")}>
            {r.warnings[0]}
          </span>
        ) : (
          <span className={styles.ok}>سليمة</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (r) =>
        r.custom ? (
          <Button
            disabled={busy || r.custom.lockedThrough > 0}
            title={r.custom.lockedThrough > 0 ? "أتمّ مشاركون أياماً منها" : undefined}
            onClick={() =>
              startTransition(async () => reportAction(await revertTrackPlan(programId, r.custom!.id)))
            }
          >
            الرجوع للافتراضية
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => setCustomizing(r)}>
            خطة مخصّصة
          </Button>
        ),
    },
  ];

  return (
    <>
      <TabHead
        title="الخطط"
        lede="الخطة أيامٌ مرقّمة بلا تواريخ، في كل يوم قيمةٌ لكل حقل. للبرنامج خطة افتراضية يرثها كل مسار، ولأي مسار خطة مخصّصة تحلّ محلّها فيه."
      />

      <Step
        n={1}
        title="الخطة الافتراضية"
        why="تُبنى مرة ويرثها كل مسار. وتُفحص على نصيب كل مسار يستعملها — فإن اختلفت أحجام الأنصبة احتاج المسار خطة مخصّصة."
        done={Boolean(defaultPlan && defaultPlan.dayCount > 0 && defaultErrors === 0)}
        state={
          !defaultPlan ? (
            <span>لم تُنشأ بعد.</span>
          ) : (
            <span>
              {formatNumber(defaultPlan.dayCount)} يوماً
              {defaultPlan.lockedThrough > 0 ? ` · المقفل 1–${formatNumber(defaultPlan.lockedThrough)}` : ""}
              {defaultErrors > 0 ? ` · ${formatNumber(defaultErrors)} ملاحظات تمنع الحفظ` : ""}
            </span>
          )
        }
      >
        {defaultPlan ? (
          <FormActions>
            <Link className={styles.open} href={`${base}/${defaultPlan.id}`}>
              افتح الخطة الافتراضية
            </Link>
          </FormActions>
        ) : (
          <FormActions>
            <Button
              variant="primary"
              pending={busy}
              onClick={() =>
                startTransition(async () => {
                  const result = await createDefaultPlan(programId);
                  reportAction(result);
                  if (result.planId) router.push(`${base}/${result.planId}`);
                })
              }
            >
              أنشئ الخطة الافتراضية
            </Button>
          </FormActions>
        )}
        {defaultPlan && defaultPlan.issues.length > 0 ? (
          <ul className={styles.issues}>
            {defaultPlan.issues.slice(0, 6).map((issue, i) => (
              <li key={i} className={issue.severity === "error" ? styles.bad : styles.warn}>
                {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </Step>

      <Step
        n={2}
        title="خطة كل مسار"
        why="المسار يرث الافتراضية ما لم تُخصَّص له خطة. والخطة الفعلية لمسارٍ أتمّ أحد مشاركيه يوماً منها لا تتغيّر."
        done={rows.length > 0 && rows.every((r) => r.planId && r.dayCount > 0 && r.errors === 0)}
        state={
          rows.length === 0 ? (
            <span>لا مسارات بعد — أضِفها من تبويب المسارات.</span>
          ) : (
            <span>
              {formatNumber(rows.filter((r) => r.custom).length)} مخصّصة من {formatNumber(rows.length)} مسارات
            </span>
          )
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.trackId}
          total={rows.length}
          page={1}
          empty={{ title: "لا مسارات", body: "أضِف مسارات البرنامج أولاً." }}
        />
      </Step>

      {exams ? <ExamsSection programId={programId} exams={exams} tracks={tracks} /> : null}

      <Modal open={customizing !== null} title="خطة مخصّصة" onClose={() => setCustomizing(null)}>
        <p>
          تحلّ خطةٌ مخصّصة محلّ الافتراضية في «{customizing?.trackName}» وحده. ابدأها بنسخ الافتراضية ثم
          عدّل ما يختلف، أو ابدأها فارغة.
        </p>
        <FormActions>
          <Button
            variant="primary"
            pending={busy}
            disabled={!defaultPlan}
            onClick={() => {
              const target = customizing;
              if (!target) return;
              setCustomizing(null);
              startTransition(async () => {
                const result = await customizeTrackPlan(programId, target.trackId, true);
                reportAction(result);
                if (result.planId) router.push(`${base}/${result.planId}`);
              });
            }}
          >
            انسخ الافتراضية
          </Button>
          <Button
            onClick={() => {
              const target = customizing;
              if (!target) return;
              setCustomizing(null);
              startTransition(async () => {
                const result = await customizeTrackPlan(programId, target.trackId, false);
                reportAction(result);
                if (result.planId) router.push(`${base}/${result.planId}`);
              });
            }}
          >
            ابدأ فارغة
          </Button>
        </FormActions>
      </Modal>
    </>
  );
}

const EXAM_TYPE = { remote: "عن بعد", oral: "شفهي حضوري" } as const;
const EXAM_STAGE = { interim: "مرحلي", final: "نهائي" } as const;

/**
 * الاختبارات تعريفاً — خارج الخطة (`adr/0040`). لا تشغل يوم خطة، ووحدتها في
 * المرحلة الثانية تقرأ نسبة الإنجاز من المحرّك. وللمسابقة وحدها `[BR-KIND-01]`.
 */
function ExamsSection({
  programId,
  exams,
  tracks,
}: {
  programId: string;
  exams: ExamRow[];
  tracks: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createExam, EMPTY_FORM_STATE);
  const [examType, setExamType] = useState<"remote" | "oral">("remote");

  const columns: Column<ExamRow>[] = [
    {
      key: "name",
      header: "الاختبار",
      primary: true,
      render: (e) => (
        <InlineText label={`اسم ${e.name}`} value={e.name} onSave={(next) => renameExam(e.id, next, programId)} />
      ),
    },
    { key: "type", header: "النوع", render: (e) => EXAM_TYPE[e.type] },
    { key: "stage", header: "المرحلة", render: (e) => EXAM_STAGE[e.stage] },
    { key: "track", header: "المسار", render: (e) => e.trackName ?? "كل المسارات" },
    { key: "count", header: "الأسئلة", align: "end", render: (e) => formatNumber(e.questionCount) },
  ];

  return (
    <Step
      n={3}
      title="الاختبارات"
      why="تعريف الاختبار باسمه ونوعه وأسئلته. والاختبار لا يشغل يوماً في الخطة: يقرأ نسبة إنجاز المشارك متى طلبها."
      done={exams.length > 0}
      state={<span>{exams.length === 0 ? "لا اختبارات معرَّفة." : `${formatNumber(exams.length)} اختبارات`}</span>}
    >
      {exams.length > 0 ? (
        <DataTable
          columns={columns}
          rows={exams}
          rowKey={(e) => e.id}
          total={exams.length}
          page={1}
          empty={{ title: "لا اختبارات", body: "" }}
        />
      ) : null}

      <StepForm title="تعريف اختبار" action={action} state={state}>
        <input type="hidden" name="programId" value={programId} />
        <Field id="examName" label="اسم الاختبار" required error={state.fieldErrors?.name}>
          <Input id="examName" name="name" required />
        </Field>
        <Field id="examType" label="النوع" required>
          <Select
            id="examType"
            name="examType"
            value={examType}
            onChange={(e) => setExamType(e.target.value as "remote" | "oral")}
          >
            <option value="remote">عن بعد</option>
            <option value="oral">شفهي حضوري</option>
          </Select>
        </Field>
        <Field id="stage" label="المرحلة" required error={state.fieldErrors?.stage}>
          <Select id="stage" name="stage" key={examType} defaultValue={examType === "oral" ? "final" : "interim"}>
            {examType === "oral" ? null : <option value="interim">مرحلي</option>}
            <option value="final">نهائي</option>
          </Select>
        </Field>
        <Field id="examTrack" label="المسار" hint="فارغ = كل المسارات.">
          <Select id="examTrack" name="trackId" defaultValue="">
            <option value="">كل المسارات</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="passPercentage" label="نسبة الاجتياز" error={state.fieldErrors?.passPercentage}>
          <Input id="passPercentage" name="passPercentage" type="number" min={0} max={100} defaultValue={EXAM_DEFAULTS.passPercentage} numeric />
        </Field>
        <Field id="questionCount" label="عدد الأسئلة" required error={state.fieldErrors?.questionCount}>
          <Input id="questionCount" name="questionCount" type="number" min={1} defaultValue={EXAM_DEFAULTS.questionCount} numeric />
        </Field>
        {examType === "remote" ? (
          <>
            <Field id="secondsPerQuestion" label="زمن السؤال بالثواني" required error={state.fieldErrors?.secondsPerQuestion}>
              <Input id="secondsPerQuestion" name="secondsPerQuestion" type="number" min={1} defaultValue={EXAM_DEFAULTS.secondsPerQuestion} numeric />
            </Field>
            <Field id="maxSkips" label="حدّ تغيير السؤال" error={state.fieldErrors?.maxSkips}>
              <Input id="maxSkips" name="maxSkips" type="number" min={0} defaultValue={EXAM_DEFAULTS.maxSkips} numeric />
            </Field>
          </>
        ) : (
          <>
            <Field id="judgeCount" label="عدد المحكمين" required error={state.fieldErrors?.judgeCount}>
              <Input id="judgeCount" name="judgeCount" type="number" min={1} defaultValue={EXAM_DEFAULTS.judgeCount} numeric />
            </Field>
            <Field id="awardPercentage" label="نسبة استحقاق الجوائز" error={state.fieldErrors?.awardPercentage}>
              <Input id="awardPercentage" name="awardPercentage" type="number" min={0} max={100} defaultValue={EXAM_DEFAULTS.awardPercentage} numeric />
            </Field>
          </>
        )}
        <FormActions>
          <Button type="submit" pending={pending}>
            عرّف الاختبار
          </Button>
        </FormActions>
        <Messages state={state} />
      </StepForm>
    </Step>
  );
}
