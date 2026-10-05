"use client";

import { reportAction } from "@/components/shared/action-notice";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { InlineNumber, InlineText } from "@/components/shared/inline-edit";
import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormActions, Input, Select } from "@/components/shared/form";
import {
  Card,
  Cards,
  Chip,
  ChipButton,
  Chips,
  Messages,
  Muted,
  TabHead,
  Step,
  StepForm,
} from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import type { PlanField } from "@/lib/plans/engine";
import type { Material } from "@/lib/programs/material";
import {
  addDayTemplate,
  addTemplateField,
  addTrackRange,
  moveTemplateField,
  removeDayTemplate,
  removeTemplateField,
  removeTrackRange,
  renameDayTemplate,
  setTemplateFieldAmount,
} from "./actions";
import styles from "./content.module.css";
import { FieldsStep } from "./fields-step";
import { MaterialStep, type UnitRow } from "./material-step";

export type { UnitRow };
/** حقول الخطة بخصائصها (`adr/0037`) — كتالوج البرنامج. */
export type FieldRow = PlanField;
export type TrackRow = {
  id: string;
  name: string;
  unitCount: number;
  /** `text` بالباب ورقمه فيه — فارغ في مادة بلا أبواب. */
  parts: { id: string; from: number; to: number; text: string }[];
};
export type TemplateRow = {
  id: string;
  name: string;
  fields: { fieldId: string; label: string; kind: PlanField["kind"]; amount: number }[];
};
/** `text` نصّ المقطع بالباب ورقمه — وإن فرغ عُرضت الأرقام ونصوص الوحدات. */
export type PreviewPart = { from: number; to: number; fromLabel: string; toLabel: string; text: string };
export type PreviewTask = {
  label: string;
  kind: PlanField["kind"];
  amount: number;
  parts: PreviewPart[];
};

export function ContentView({
  programId,
  material,
  unsectioned,
  units,
  unitSummary,
  unitPage,
  tracks,
  fields,
  templates,
  previews,
}: {
  programId: string;
  material: Material;
  unsectioned: number;
  /** صفحة واحدة من المادة لا كلها — المادة قد تبلغ آلاف الوحدات. */
  units: UnitRow[];
  unitSummary: { count: number; first: number | null; last: number | null };
  unitPage: number;
  tracks: TrackRow[];
  fields: FieldRow[];
  templates: TemplateRow[];
  previews: Record<string, PreviewTask[]>;
}) {
  const [partState, partAction, partPending] = useActionState(addTrackRange, EMPTY_FORM_STATE);
  const [tplState, tplAction, tplPending] = useActionState(addDayTemplate, EMPTY_FORM_STATE);
  const [tfState, tfAction, tfPending] = useActionState(addTemplateField, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const [track, setTrack] = useState(tracks[0]?.id ?? "");
  const [template, setTemplate] = useState(templates[0]?.id ?? "");

  const hasParts = tracks.some((t) => t.parts.length > 0);
  const ready = unitSummary.count > 0 && hasParts && fields.length > 0 && templates.length > 0;

  const previewTasks = previews[`${track}:${template}`] ?? [];
  const shownTrack = tracks.find((t) => t.id === track);

  return (
    <>
      <TabHead title="ما يحفظه المشاركون" lede="أربع خطوات: تُدخل المادة، ثم تحدّد نصيب كل مسار منها، ثم تسمّي واجبات اليوم، ثم تجمعها في شكل يوم. وتحتها معاينة تُريك ما سيراه المشارك." />

      <MaterialStep
        programId={programId}
        material={material}
        unsectioned={unsectioned}
        units={units}
        unitSummary={unitSummary}
        unitPage={unitPage}
      />

      {/* ══ ٢ · نصيب كل مسار ══ */}
      <Step
        n={2}
        title="نصيب كل مسار من المادة"
        why="المسار قد يأخذ المادة كلها أو أجزاء متفرّقة منها. والأجزاء لا تتداخل — الوحدة الواحدة لا تُحسب مرتين."
        done={hasParts}
        state={
          tracks.length === 0 ? (
            <span>لا مسارات في هذا البرنامج — أضِفها من صفحة البرنامج أولاً.</span>
          ) : hasParts ? (
            <span>
              {formatNumber(tracks.filter((t) => t.parts.length > 0).length)} من{" "}
              {formatNumber(tracks.length)} مسارات لها نصيب محدَّد
            </span>
          ) : (
            <span>لم يُحدَّد نصيب أي مسار بعد.</span>
          )
        }
      >
        <Cards>
          {tracks.map((t) => (
            <Card key={t.id} name={t.name} meta={`${formatNumber(t.unitCount)} وحدة`}>
              {t.parts.length === 0 ? (
                <Muted>بلا نصيب — لن يرى مشاركوه واجباً</Muted>
              ) : (
                <Chips>
                  {t.parts.map((p) => (
                    <Chip key={p.id}>
                      <span>
                        {formatNumber(p.from)} – {formatNumber(p.to)}
                        {p.text ? <span className={styles.partText}>{p.text}</span> : null}
                      </span>
                      <ChipButton
                        label={`حذف الجزء ${p.from} إلى ${p.to}`}
                        disabled={busy}
                        onClick={() =>
                          startTransition(async () => reportAction(await removeTrackRange(p.id, programId)))
                        }
                      >
                        <Trash2 size={14} aria-hidden />
                      </ChipButton>
                    </Chip>
                  ))}
                </Chips>
              )}
            </Card>
          ))}
        </Cards>

        {tracks.length > 0 && unitSummary.count > 0 ? (
          <StepForm title="إضافة جزء" action={partAction} state={partState}>
            <input type="hidden" name="programId" value={programId} />

            <Field id="trackId" label="المسار" required error={partState.fieldErrors?.trackId}>
              <Select id="trackId" name="trackId" required defaultValue="">
                <option value="" disabled>
                  اختر مساراً
                </option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id="fromSequence"
              label="من الرقم"
              required
              error={partState.fieldErrors?.fromSequence}
            >
              <Input id="fromSequence" name="fromSequence" type="number" min={1} required numeric />
            </Field>

            <Field
              id="toSequence"
              label="إلى الرقم"
              required
              error={partState.fieldErrors?.toSequence}
            >
              <Input id="toSequence" name="toSequence" type="number" min={1} required numeric />
            </Field>

            <Field
              id="sortOrder"
              label="ترتيب هذا الجزء"
              hint="يُحفظ الأصغر أولاً. يفيد إن أردت تقديم باب متأخر في الترقيم."
              error={partState.fieldErrors?.sortOrder}
            >
              <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={0} numeric />
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={partPending}>
                أضِف الجزء
              </Button>
            </FormActions>
            <Messages state={partState} />
          </StepForm>
        ) : null}
      </Step>

      {/* ══ ٣ · واجبات اليوم ══ */}
      <FieldsStep programId={programId} fields={fields} />

      {/* ══ ٤ · شكل اليوم ══ */}
      <Step
        n={4}
        title="شكل اليوم"
        why="اجمع الواجبات ومقاديرها في شكل واحد يتكرّر. تعرّفه مرة وتستعمله في كل أيام الخطة، ويبقى تعديل اليوم المفرد ممكناً."
        done={templates.some((t) => t.fields.length > 0)}
        state={
          templates.length === 0 ? (
            <span>لم يُعرَّف شكل يوم بعد.</span>
          ) : (
            <span>
              {formatNumber(templates.length)} شكلاً ·{" "}
              {formatNumber(templates.filter((t) => t.fields.length > 0).length)} منها فيه واجبات
            </span>
          )
        }
      >
        <Cards>
          {templates.map((t) => (
            <Card
              key={t.id}
              name={
                <InlineText
                  label={`اسم شكل اليوم ${t.name}`}
                  value={t.name}
                  maxInlineSize="12rem"
                  onSave={(next) => renameDayTemplate(t.id, programId, next)}
                />
              }
              meta={
                <ChipButton
                  label={`حذف شكل اليوم ${t.name}`}
                  disabled={busy}
                  onClick={() => startTransition(async () => reportAction(await removeDayTemplate(t.id, programId)))}
                >
                  <Trash2 size={14} aria-hidden />
                </ChipButton>
              }
            >
              {t.fields.length === 0 ? (
                <Muted>بلا واجبات — أضِفها أدناه</Muted>
              ) : (
                <Chips>
                  {t.fields.map((f, index) => (
                    <Chip key={f.fieldId}>
                      {f.label}
                      <InlineNumber
                        label={`مقدار ${f.label} في ${t.name}`}
                        value={f.amount}
                        onSave={(next) => setTemplateFieldAmount(t.id, f.fieldId, programId, next)}
                      />
                      <ChipButton
                        label={`تقديم ${f.label}`}
                        disabled={busy || index === 0}
                        onClick={() =>
                          startTransition(async () => reportAction(await moveTemplateField(t.id, f.fieldId, programId, "up")))
                        }
                      >
                        <ChevronUp size={14} aria-hidden />
                      </ChipButton>
                      <ChipButton
                        label={`تأخير ${f.label}`}
                        disabled={busy || index === t.fields.length - 1}
                        onClick={() =>
                          startTransition(async () => reportAction(await moveTemplateField(t.id, f.fieldId, programId, "down")))
                        }
                      >
                        <ChevronDown size={14} aria-hidden />
                      </ChipButton>
                      <ChipButton
                        label={`إزالة ${f.label} من ${t.name}`}
                        disabled={busy}
                        onClick={() =>
                          startTransition(async () => reportAction(await removeTemplateField(t.id, f.fieldId, programId)))
                        }
                      >
                        <Trash2 size={14} aria-hidden />
                      </ChipButton>
                    </Chip>
                  ))}
                </Chips>
              )}
            </Card>
          ))}
        </Cards>

        <StepForm title="شكل جديد" action={tplAction} state={tplState}>
          <input type="hidden" name="programId" value={programId} />
          <Field
            id="name"
            label="الاسم"
            required
            hint="مثال: يوم كامل · حفظ فقط · يوم خفيف."
            error={tplState.fieldErrors?.name}
          >
            <Input id="name" name="name" required />
          </Field>
          <FormActions>
            <Button type="submit" variant="primary" pending={tplPending}>
              أنشئ
            </Button>
          </FormActions>
          <Messages state={tplState} />
        </StepForm>

        {templates.length > 0 && fields.length > 0 ? (
          <StepForm title="إضافة واجب إلى شكل" action={tfAction} state={tfState}>
            <input type="hidden" name="programId" value={programId} />

            <Field
              id="dayTemplateId"
              label="الشكل"
              required
              error={tfState.fieldErrors?.dayTemplateId}
            >
              <Select id="dayTemplateId" name="dayTemplateId" required defaultValue="">
                <option value="" disabled>
                  اختر شكلاً
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="taskFieldId" label="الواجب" required error={tfState.fieldErrors?.taskFieldId}>
              <Select id="taskFieldId" name="taskFieldId" required defaultValue="">
                <option value="" disabled>
                  اختر واجباً
                </option>
                {/* النطاق الصريح لا يُعبّأ من شكل يوم: «من/إلى» لا تُشتقّ من مقدار. */}
                {fields.filter((f) => f.kind !== "explicit").map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id="baseAmount"
              label="المقدار في اليوم"
              required
              hint="كم وحدة من المادة، أو كم مرة للواجب العددي."
              error={tfState.fieldErrors?.baseAmount}
            >
              <Input
                id="baseAmount"
                name="baseAmount"
                type="number"
                min={1}
                defaultValue={1}
                required
                numeric
              />
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={tfPending}>
                أضِف
              </Button>
            </FormActions>
            <Messages state={tfState} />
          </StepForm>
        ) : null}
      </Step>
      {/* ══ المعاينة بعد الخطوات: نتيجة ما أدخلتَه أعلاه ══ */}
      {ready ? (
        <section className={styles.preview}>
          <div className={styles.previewHead}>
            <h2 className={styles.previewTitle}>ما سيراه المشارك في يومه الأول</h2>
          </div>
          <p className={styles.previewWhy}>
            هذا بالضبط ما سيظهر للمشارك.
          </p>

          {tracks.length > 1 || templates.length > 1 ? (
            <div className={styles.picker}>
              {tracks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.pickerBtn} ${t.id === track ? styles.pickerOn : ""}`}
                  onClick={() => setTrack(t.id)}
                >
                  {t.name}
                </button>
              ))}
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.pickerBtn} ${t.id === template ? styles.pickerOn : ""}`}
                  onClick={() => setTemplate(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.day}>
            <p className={styles.dayLabel}>
              اليوم {formatNumber(1)} · {shownTrack?.name ?? "—"}
            </p>
            {previewTasks.length === 0 ? (
              <p className={styles.none}>لا واجب — شكل اليوم بلا واجبات بعد.</p>
            ) : (
              previewTasks.map((task) => (
                <div key={task.label} className={styles.task}>
                  <div className={styles.taskName}>{task.label}</div>
                  <div className={styles.taskRange}>
                    {task.kind === "counted" ? (
                      <>العدد: {formatNumber(task.amount)}</>
                    ) : task.parts.length === 0 ? (
                      <span className={styles.none}>لم تُحدَّد أجزاء هذا المسار بعد</span>
                    ) : (
                      task.parts.map((p) => (
                        <div key={`${p.from}-${p.to}`}>
                          {p.text ? (
                            p.text
                          ) : (
                            <>
                              من {formatNumber(p.from)}
                              {p.fromLabel ? ` · ${p.fromLabel}` : null} إلى {formatNumber(p.to)}
                              {p.toLabel ? ` · ${p.toLabel}` : null}
                            </>
                          )}
                        </div>
                      ))
                    )}
                    {task.parts.length > 1 ? (
                      <span className={styles.split}>
                        جزآن — لأن نصيب هذا المسار من المادة غير متّصل
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

    </>
  );
}
