"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { EXAM_DEFAULTS } from "@/lib/programs/exam-defaults";
import {
  addPlanDay,
  clearPlanDays,
  createExam,
  generatePlan,
  movePlanDay,
  removePlanDay,
  renameExam,
  updatePlanDay,
  uploadPlan,
} from "../actions";

export type DayRow = {
  id: string;
  dayNumber: number;
  dayType: "normal" | "rest" | "exam";
  templateId: string | null;
  multiplier: number;
  examName: string | null;
};

export type ExamRow = {
  id: string;
  name: string;
  examType: "remote" | "oral";
  stage: "interim" | "final";
  trackName: string | null;
};

const PANEL = { maxInlineSize: "34rem", marginBlockEnd: "var(--space-8)" } as const;
const H2 = { fontSize: "var(--text-lg)", marginBlockStart: "var(--space-10)" } as const;
const ERR = { color: "var(--color-danger)" } as const;
const OK = { color: "var(--color-success)" } as const;
const NOTE = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  marginBlockEnd: "var(--space-4)",
  maxInlineSize: "68ch",
} as const;
const META = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--space-4)",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  marginBlockEnd: "var(--space-6)",
} as const;

const DAY_TYPE_LABEL = { normal: "عادي", rest: "راحة", exam: "اختبار" } as const;

/**
 * خليّتان تُحرَّران في الجدول نفسه — «المقادير تُعدَّل هنا» في المخطَّط البصري.
 *
 * غير مُتحكَّم بهما، و`key` مربوط بالقيمة الخادمية: بعد كل حفظ تُعاد القيمة من
 * الخادم فيُعاد بناء الحقل عليها. وهذا يتجنّب مزامنة حالةٍ داخل أثر — وهي
 * المزامنة التي يمنعها `react-hooks`، ويمنعها لسبب.
 */
function MultiplierCell({
  day,
  planId,
  programId,
}: {
  day: DayRow;
  planId: string;
  programId: string;
}) {
  const [pending, startTransition] = useTransition();

  if (day.dayType !== "normal") return <>—</>;

  return (
    <Input
      key={day.multiplier}
      aria-label={`مضاعف اليوم ${formatNumber(day.dayNumber)}`}
      type="number"
      min={0.25}
      step={0.25}
      numeric
      disabled={pending}
      defaultValue={day.multiplier}
      style={{ maxInlineSize: "5.5rem" }}
      onBlur={(e) => {
        const next = Number(e.currentTarget.value);
        if (!Number.isFinite(next) || next <= 0 || next === day.multiplier) return;
        startTransition(
          async () =>
            void (await updatePlanDay(day.id, { amountMultiplier: next }, planId, programId)),
        );
      }}
    />
  );
}

function ExamNameCell({
  exam,
  planId,
  programId,
}: {
  exam: ExamRow;
  planId: string;
  programId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Input
      key={exam.name}
      aria-label={`اسم الاختبار ${exam.name}`}
      defaultValue={exam.name}
      disabled={pending}
      style={{ maxInlineSize: "14rem" }}
      onBlur={(e) => {
        const next = e.currentTarget.value.trim();
        if (next.length < 2 || next === exam.name) return;
        startTransition(
          async () => void (await renameExam(exam.id, next, planId, programId)),
        );
      }}
    />
  );
}

function TemplateCell({
  day,
  templates,
  planId,
  programId,
}: {
  day: DayRow;
  templates: { id: string; name: string }[];
  planId: string;
  programId: string;
}) {
  const [pending, startTransition] = useTransition();

  if (day.dayType === "rest") return <>بلا واجب</>;
  if (day.dayType === "exam") return <>{day.examName}</>;

  return (
    <Select
      key={day.templateId ?? ""}
      aria-label={`قالب اليوم ${formatNumber(day.dayNumber)}`}
      disabled={pending}
      defaultValue={day.templateId ?? ""}
      style={{ maxInlineSize: "12rem" }}
      onChange={(e) => {
        const next = e.target.value;
        if (!next || next === day.templateId) return;
        startTransition(
          async () =>
            void (await updatePlanDay(day.id, { dayTemplateId: next }, planId, programId)),
        );
      }}
    >
      {/* قالبٌ حُذف بعد إسناده: يُسمّى صراحةً، فالسقوط على أول خيار كذبٌ صامت. */}
      {day.templateId && !templates.some((t) => t.id === day.templateId) ? (
        <option value={day.templateId}>قالب محذوف</option>
      ) : null}
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}

export function PlanView({
  programId,
  programName,
  planId,
  planName,
  trackName,
  days,
  templates,
  exams,
  tracks,
}: {
  programId: string;
  programName: string;
  planId: string;
  planName: string;
  trackName: string;
  days: DayRow[];
  templates: { id: string; name: string }[];
  exams: ExamRow[];
  tracks: { id: string; name: string }[];
}) {
  const [genState, genAction, genPending] = useActionState(generatePlan, EMPTY_FORM_STATE);
  const [upState, upAction, upPending] = useActionState(uploadPlan, EMPTY_FORM_STATE);
  const [dayState, dayAction, dayPending] = useActionState(addPlanDay, EMPTY_FORM_STATE);
  const [examState, examAction, examPending] = useActionState(createExam, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const [newDayType, setNewDayType] = useState<"normal" | "rest" | "exam">("normal");
  const [examType, setExamType] = useState<"remote" | "oral">("remote");

  const isEmpty = days.length === 0;
  const restCount = days.filter((d) => d.dayType === "rest").length;
  const examCount = days.filter((d) => d.dayType === "exam").length;
  const last = days.length;

  const dayColumns: Column<DayRow>[] = [
    {
      key: "number",
      header: "اليوم",
      align: "end",
      sortable: true,
      primary: true,
      render: (d) => formatNumber(d.dayNumber),
    },
    {
      key: "type",
      header: "النوع",
      align: "center",
      render: (d) => DAY_TYPE_LABEL[d.dayType],
    },
    {
      key: "what",
      header: "المحتوى",
      render: (d) => (
        <TemplateCell day={d} templates={templates} planId={planId} programId={programId} />
      ),
    },
    {
      key: "multiplier",
      header: "المضاعف",
      align: "end",
      render: (d) => <MultiplierCell day={d} planId={planId} programId={programId} />,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (d) => (
        <span style={{ display: "inline-flex", gap: "var(--space-1)" }}>
          <Button
            aria-label="تقديم اليوم"
            variant="secondary"
            disabled={d.dayNumber === 1}
            pending={busy}
            onClick={() =>
              startTransition(
                async () =>
                  void (await movePlanDay(d.id, d.dayNumber - 1, planId, programId)),
              )
            }
          >
            <ChevronUp size={16} aria-hidden />
          </Button>
          <Button
            aria-label="تأخير اليوم"
            variant="secondary"
            disabled={d.dayNumber === last}
            pending={busy}
            onClick={() =>
              startTransition(
                async () =>
                  void (await movePlanDay(d.id, d.dayNumber + 1, planId, programId)),
              )
            }
          >
            <ChevronDown size={16} aria-hidden />
          </Button>
          <Button
            aria-label="حذف اليوم"
            variant="danger"
            pending={busy}
            onClick={() =>
              startTransition(async () => void (await removePlanDay(d.id, planId, programId)))
            }
          >
            <Trash2 size={16} aria-hidden />
          </Button>
        </span>
      ),
    },
  ];

  const examColumns: Column<ExamRow>[] = [
    {
      key: "name",
      header: "الاختبار",
      primary: true,
      render: (e) => <ExamNameCell exam={e} planId={planId} programId={programId} />,
    },
    {
      key: "type",
      header: "النوع",
      align: "center",
      render: (e) => (e.examType === "remote" ? "عن بعد" : "شفهي حضوري"),
    },
    {
      key: "stage",
      header: "المرحلة",
      align: "center",
      render: (e) => (e.stage === "interim" ? "مرحلي" : "نهائي"),
    },
    {
      key: "track",
      header: "المسار",
      render: (e) => e.trackName ?? "كل المسارات",
    },
  ];

  return (
    <>
      <p style={{ fontSize: "var(--text-sm)", display: "flex", gap: "var(--space-4)" }}>
        <Link href="/programs">البرامج</Link>
        <Link href={`/programs/${programId}`}>{programName}</Link>
        <Link href={`/programs/${programId}/plans`}>الخطط</Link>
      </p>
      <h1>{planName}</h1>

      <div style={META}>
        <span>المسار: {trackName}</span>
        <span>الأيام: {formatNumber(days.length)}</span>
        <span>الراحة: {formatNumber(restCount)}</span>
        <span>الاختبارات: {formatNumber(examCount)}</span>
      </div>

      <DataTable
        columns={dayColumns}
        rows={days}
        rowKey={(d) => d.id}
        total={days.length}
        page={1}
        pageSize={days.length || 1}
        empty={{
          title: "الخطة بلا أيام",
          body: "ابنِها بالتوليد أو بالرفع أو يوماً يوماً من النماذج أدناه.",
        }}
      />

      {/* ══ البناء الجملي — على خطة فارغة وحدها ══ */}
      {isEmpty ? (
        <>
          <h2 style={H2}>البناء بالتوليد</h2>
          <p style={NOTE}>
            قالب واحد يتكرّر بإيقاع راحة دوري. والراحة بالترتيب لا بيوم الأسبوع — الخطة بلا
            تاريخ بدء. من أراد راحة يوم بعينه، حرّكها بعد التوليد.
          </p>
          {templates.length === 0 ? (
            <p style={ERR}>
              لا قوالب في هذا البرنامج.{" "}
              <Link href={`/programs/${programId}/content`}>عرّف قالباً أولاً</Link>.
            </p>
          ) : (
            <form action={genAction} style={PANEL}>
              <input type="hidden" name="programId" value={programId} />
              <input type="hidden" name="planId" value={planId} />

              <Field id="dayCount" label="عدد الأيام" required error={genState.fieldErrors?.dayCount}>
                <Input id="dayCount" name="dayCount" type="number" min={1} max={366} required
                       defaultValue={30} numeric />
              </Field>

              <Field id="dayTemplateId" label="قالب اليوم العادي" required
                     error={genState.fieldErrors?.dayTemplateId}>
                <Select id="dayTemplateId" name="dayTemplateId" required defaultValue="">
                  <option value="" disabled>
                    اختر قالباً
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field id="amountMultiplier" label="مضاعف المقدار"
                     hint="مقدار الحقل = الأساسي في القالب × هذا الرقم."
                     error={genState.fieldErrors?.amountMultiplier}>
                <Input id="amountMultiplier" name="amountMultiplier" type="number" min={0.25}
                       step={0.25} defaultValue={1} numeric />
              </Field>

              <Field id="restEvery" label="راحة كل كم يوم" hint="صفر = بلا راحة."
                     error={genState.fieldErrors?.restEvery}>
                <Input id="restEvery" name="restEvery" type="number" min={0} max={366}
                       defaultValue={0} numeric />
              </Field>

              <FormActions>
                <Button type="submit" pending={genPending}>
                  ولّد الخطة
                </Button>
              </FormActions>

              {genState.error ? <p style={ERR}>{genState.error}</p> : null}
              {genState.notice ? <p style={OK}>{genState.notice}</p> : null}
            </form>
          )}

          <h2 style={H2}>البناء بالرفع</h2>
          <p style={NOTE}>
            سطر لكل يوم: النوع ثم فاصلة ثم المضاعف. المقبول <bdi>عادي</bdi> و<bdi>راحة</bdi>،
            ورقم اليوم من ترتيب السطر لا من عمود. أيام الاختبار تُضاف بعد الرفع.
          </p>
          {templates.length > 0 ? (
            <form action={upAction} style={PANEL}>
              <input type="hidden" name="programId" value={programId} />
              <input type="hidden" name="planId" value={planId} />

              <Field id="upTemplate" label="قالب اليوم العادي" required
                     error={upState.fieldErrors?.dayTemplateId}>
                <Select id="upTemplate" name="dayTemplateId" required defaultValue="">
                  <option value="" disabled>
                    اختر قالباً
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field id="text" label="محتوى الملف" required error={upState.fieldErrors?.text}>
                <Textarea id="text" name="text" rows={8} required
                          placeholder={"عادي,1\nعادي,1\nراحة"} />
              </Field>

              <FormActions>
                <Button type="submit" pending={upPending}>
                  ارفع الخطة
                </Button>
              </FormActions>

              {upState.error ? <p style={ERR}>{upState.error}</p> : null}
              {upState.notice ? <p style={OK}>{upState.notice}</p> : null}
            </form>
          ) : null}
        </>
      ) : null}

      {/* ══ التحرير اليدوي ══ */}
      <h2 style={H2}>إضافة يوم</h2>
      <p style={NOTE}>
        اليوم يُدرَج في موضعه وما بعده يُزاح. اترك الموضع فارغاً ليُضاف في الآخر.
      </p>
      <form action={dayAction} style={PANEL}>
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="planId" value={planId} />

        <Field id="dayType" label="نوع اليوم" required>
          <Select
            id="dayType"
            name="dayType"
            value={newDayType}
            onChange={(e) => setNewDayType(e.target.value as typeof newDayType)}
          >
            <option value="normal">عادي</option>
            <option value="rest">راحة</option>
            <option value="exam">اختبار</option>
          </Select>
        </Field>

        <Field id="atNumber" label="الموضع" hint={`من ١ إلى ${formatNumber(last + 1)}.`}>
          <Input id="atNumber" name="atNumber" type="number" min={1} max={last + 1}
                 placeholder="الآخر" numeric />
        </Field>

        {newDayType === "normal" ? (
          <>
            <Field id="dayTemplate" label="القالب" required
                   error={dayState.fieldErrors?.dayTemplateId}>
              <Select id="dayTemplate" name="dayTemplateId" required defaultValue="">
                <option value="" disabled>
                  اختر قالباً
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="dayMultiplier" label="مضاعف المقدار"
                   error={dayState.fieldErrors?.amountMultiplier}>
              <Input id="dayMultiplier" name="amountMultiplier" type="number" min={0.25}
                     step={0.25} defaultValue={1} numeric />
            </Field>
          </>
        ) : null}

        {newDayType === "exam" ? (
          <Field id="examId" label="الاختبار" required error={dayState.fieldErrors?.examId}>
            {exams.length === 0 ? (
              <p style={ERR}>لا اختبارات معرَّفة. عرّف اختباراً في القسم الأخير أولاً.</p>
            ) : (
              <Select id="examId" name="examId" required defaultValue="">
                <option value="" disabled>
                  اختر اختباراً
                </option>
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <FormActions>
          <Button type="submit" pending={dayPending}>
            أضِف اليوم
          </Button>
          {!isEmpty ? (
            <Button
              type="button"
              variant="danger"
              pending={busy}
              onClick={() =>
                startTransition(async () => void (await clearPlanDays(planId, programId)))
              }
            >
              امسح كل الأيام
            </Button>
          ) : null}
        </FormActions>

        {dayState.error ? <p style={ERR}>{dayState.error}</p> : null}
        {dayState.notice ? <p style={OK}>{dayState.notice}</p> : null}
      </form>

      {/* ══ الاختبار: تعريفاً فقط ══ */}
      <h2 style={H2}>الاختبارات</h2>
      <p style={NOTE}>
        تعريفاً فقط في هذه المرحلة (<code>adr/0022</code>): بنك الأسئلة والجلسات والتحكيم
        والنتائج في المرحلة الثانية. يُعرَّف هنا ليشير إليه يوم الاختبار في الخطة. واختبارٌ
        بمسار محدَّد يتقدّم على اختبار بمسار فارغ.
      </p>

      <DataTable
        columns={examColumns}
        rows={exams}
        rowKey={(e) => e.id}
        total={exams.length}
        page={1}
        empty={{ title: "لا اختبارات معرَّفة", body: "عرّف اختباراً من النموذج أدناه." }}
      />

      <form action={examAction} style={{ ...PANEL, marginBlockStart: "var(--space-6)" }}>
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="planId" value={planId} />

        <Field id="examName" label="اسم الاختبار" required error={examState.fieldErrors?.name}>
          <Input id="examName" name="name" required />
        </Field>

        <Field id="examType" label="النوع" required>
          <Select
            id="examType"
            name="examType"
            value={examType}
            onChange={(e) => setExamType(e.target.value as typeof examType)}
          >
            <option value="remote">عن بعد</option>
            <option value="oral">شفهي حضوري</option>
          </Select>
        </Field>

        <Field id="stage" label="المرحلة" required error={examState.fieldErrors?.stage}
               hint={examType === "oral" ? "الشفهي نهائي دائماً." : undefined}>
          <Select id="stage" name="stage" defaultValue={examType === "oral" ? "final" : "interim"}
                  key={examType}>
            {examType === "oral" ? null : <option value="interim">مرحلي</option>}
            <option value="final">نهائي</option>
          </Select>
        </Field>

        <Field id="examTrack" label="المسار" hint="اتركه فارغاً ليسري على كل المسارات.">
          <Select id="examTrack" name="trackId" defaultValue="">
            <option value="">كل المسارات</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="passPercentage" label="نسبة الاجتياز"
               error={examState.fieldErrors?.passPercentage}>
          <Input id="passPercentage" name="passPercentage" type="number" min={0} max={100}
                 defaultValue={EXAM_DEFAULTS.passPercentage} numeric />
        </Field>

        <Field id="questionCount" label="عدد الأسئلة" required
               error={examState.fieldErrors?.questionCount}>
          <Input id="questionCount" name="questionCount" type="number" min={1}
                 defaultValue={EXAM_DEFAULTS.questionCount} numeric />
        </Field>

        {examType === "remote" ? (
          <>
            <Field id="secondsPerQuestion" label="زمن السؤال بالثواني" required
                   error={examState.fieldErrors?.secondsPerQuestion}>
              <Input id="secondsPerQuestion" name="secondsPerQuestion" type="number" min={1}
                     defaultValue={EXAM_DEFAULTS.secondsPerQuestion} numeric />
            </Field>
            <Field id="maxSkips" label="حدّ تغيير السؤال" error={examState.fieldErrors?.maxSkips}>
              <Input id="maxSkips" name="maxSkips" type="number" min={0}
                     defaultValue={EXAM_DEFAULTS.maxSkips} numeric />
            </Field>
          </>
        ) : (
          <>
            <Field id="judgeCount" label="عدد المحكمين" required
                   error={examState.fieldErrors?.judgeCount}>
              <Input id="judgeCount" name="judgeCount" type="number" min={1}
                     defaultValue={EXAM_DEFAULTS.judgeCount} numeric />
            </Field>
            <Field id="awardPercentage" label="نسبة استحقاق الجوائز"
                   error={examState.fieldErrors?.awardPercentage}>
              <Input id="awardPercentage" name="awardPercentage" type="number" min={0} max={100}
                     defaultValue={EXAM_DEFAULTS.awardPercentage} numeric />
            </Field>
          </>
        )}

        <FormActions>
          <Button type="submit" pending={examPending}>
            عرّف الاختبار
          </Button>
        </FormActions>

        {examState.error ? <p style={ERR}>{examState.error}</p> : null}
        {examState.notice ? <p style={OK}>{examState.notice}</p> : null}
      </form>
    </>
  );
}
