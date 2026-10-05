"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { Button, Input, Select } from "@/components/shared/form";
import { TabHead } from "@/components/shared/steps";
import { formatDateTime, formatNumber, toLatinDigits } from "@/lib/format";
import {
  dayTasks,
  fieldLines,
  MAX_DAYS,
  planIssues,
  repetitionText,
  toPayload,
  valueAt,
  type PlanDraft,
  type PlanField,
  type PlanValue,
  type TrackShare,
} from "@/lib/plans/engine";
import type { Material } from "@/lib/programs/material";
import { restorePlanVersion, savePlan } from "../actions";
import styles from "../plans.module.css";
import { ImportPanel, type SavedMapping } from "./import-panel";

export type VersionRow = { id: string; number: number; note: string; at: string };
export type TemplateOption = { id: string; name: string; fields: { fieldId: string; amount: number }[] };

const KIND_LABEL: Record<PlanField["kind"], string> = {
  ranged: "تراكمي",
  explicit: "نطاق صريح",
  counted: "عددي",
};

/** رقمٌ من خانة: لاتيني، صحيح موجب، أو `undefined` للفارغ. */
function parseCount(raw: string): number | undefined {
  const text = toLatinDigits(raw).trim();
  if (text === "") return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

function rangeDays(from: number, to: number, max: number): number[] {
  const a = Math.max(1, Math.min(from, to));
  const b = Math.min(max, Math.max(from, to));
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
}

/**
 * محرّر الخطة — تُحرَّر في المتصفح كاملةً وتُحفظ دفعة واحدة.
 *
 * الملاحظات تظهر وأنت تكتب (`lib/plans/engine`)، والحفظ يمرّ بفحص القاعدة
 * نفسه (`fn_save_plan`). والأيام التي أتمّها مشاركٌ مقفلة لا تُعدَّل.
 */
export function PlanEditor({
  programId,
  plan,
  initial,
  fields,
  tracks,
  material,
  lockedThrough,
  versions,
  templates,
  programName,
  mappings,
}: {
  programId: string;
  plan: { id: string; name: string; scope: string };
  initial: PlanDraft;
  fields: PlanField[];
  /** المسارات التي تستعمل الخطة — تُفحص على نصيب كلٍّ منها. */
  tracks: TrackShare[];
  material: Material;
  lockedThrough: number;
  versions: VersionRow[];
  templates: TemplateOption[];
  programName: string;
  /** قوالب الاستيراد المحفوظة في البرنامج. */
  mappings: SavedMapping[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? "");
  const [previewDay, setPreviewDay] = useState(Math.min(Math.max(lockedThrough + 1, 1), Math.max(initial.dayCount, 1)));

  const track = tracks.find((t) => t.id === trackId) ?? tracks[0] ?? null;
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ar")),
    [fields],
  );
  // ما بعد عدد الأيام يبقى في الحالة ولا يُحسب: إنقاص العدد ثم زيادته لا يمحو ما كُتب.
  const effective = useMemo(
    () => ({ dayCount: draft.dayCount, values: draft.values.filter((v) => v.day <= draft.dayCount) }),
    [draft],
  );
  const issues = useMemo(() => planIssues(effective, fields, tracks), [effective, fields, tracks]);
  // خطأ اليوم المقفل لا يحجب الحفظ: لا يملك المحرّر تصحيحه، والقاعدة تتجاوزه كذلك.
  const errors = issues.filter((i) => i.severity === "error" && (i.day === null || i.day > lockedThrough));
  const warnings = issues.filter((i) => i.severity === "warning");
  const cellIssues = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of issues) {
      if (issue.day === null) continue;
      const key = `${issue.day}|${issue.fieldId ?? ""}`;
      map.set(key, [...(map.get(key) ?? []), issue.message]);
    }
    return map;
  }, [issues]);

  // تحذير قبل مغادرة صفحةٍ فيها ما لم يُحفظ.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(next: (d: PlanDraft) => PlanDraft) {
    setDraft((d) => next(d));
    setDirty(true);
    setServerError(null);
  }

  /** يكتب قيمة خانة — والفارغ كله يحذف القيمة من اليوم. */
  function setCell(day: number, fieldId: string, patch: Partial<PlanValue>) {
    if (day <= lockedThrough) return;
    update((d) => {
      const rest = d.values.filter((v) => !(v.day === day && v.fieldId === fieldId));
      const current = valueAt(d, fieldId, day) ?? { day, fieldId };
      const merged: PlanValue = { ...current, ...patch, day, fieldId };
      for (const key of ["amount", "from", "to", "value", "repetition"] as const) {
        if (merged[key] === undefined) delete merged[key];
      }
      const empty =
        merged.amount === undefined && merged.from === undefined && merged.to === undefined && merged.value === undefined;
      return { ...d, values: empty ? rest : [...rest, merged] };
    });
  }

  function setDayCount(count: number) {
    const next = Math.max(Math.max(lockedThrough, 1), Math.min(MAX_DAYS, Math.trunc(count)));
    update((d) => ({ ...d, dayCount: next }));
  }

  function fillField(field: PlanField, quantity: number, from: number, to: number) {
    update((d) => {
      const days = rangeDays(from, to, d.dayCount).filter((day) => day > lockedThrough);
      const rest = d.values.filter((v) => !(v.fieldId === field.id && days.includes(v.day)));
      const added = days.map((day): PlanValue => {
        const old = valueAt(d, field.id, day);
        const repetition = old?.repetition ?? field.defaultRepetition ?? undefined;
        const base: PlanValue = field.kind === "counted" ? { day, fieldId: field.id, value: quantity } : { day, fieldId: field.id, amount: quantity };
        return repetition ? { ...base, repetition } : base;
      });
      return { ...d, values: [...rest, ...added] };
    });
  }

  function fillTemplate(template: TemplateOption, multiplier: number, from: number, to: number) {
    for (const tf of template.fields) {
      const field = fields.find((f) => f.id === tf.fieldId);
      if (!field || field.kind === "explicit") continue;
      fillField(field, Math.max(1, Math.round(tf.amount * multiplier)), from, to);
    }
  }

  function fillRepetition(field: PlanField, count: number | undefined, from: number, to: number) {
    update((d) => {
      const days = new Set(rangeDays(from, to, d.dayCount).filter((day) => day > lockedThrough));
      return {
        ...d,
        values: d.values.map((v) => {
          if (v.fieldId !== field.id || !days.has(v.day)) return v;
          const next = { ...v };
          if (count === undefined) delete next.repetition;
          else next.repetition = count;
          return next;
        }),
      };
    });
  }

  function save() {
    startSave(async () => {
      let result: Awaited<ReturnType<typeof savePlan>>;
      try {
        result = await savePlan({
          programId,
          planId: plan.id,
          baseVersion: versions[0]?.number ?? 0,
          payload: toPayload(effective),
        });
      } catch {
        setServerError("تعذّر إرسال الخطة — قد تكون أكبر من حدّ الإرسال. جرّب مرة أخرى.");
        return;
      }
      if (result.error) {
        setServerError(result.error);
        return;
      }
      reportAction(result);
      setDirty(false);
      router.refresh();
    });
  }

  const days = Array.from({ length: draft.dayCount }, (_, i) => i + 1);
  const preview = track && draft.dayCount > 0 ? dayTasks(effective, fields, track, material, previewDay) : [];

  return (
    <>
      <TabHead
        title={plan.name}
        lede="أيامٌ مرقّمة بلا تواريخ، وفي كل يوم قيمةٌ لكل حقل له فيه نشاط. والمشارك لا ينتقل ليوم حتى يُتمّ ما قبله."
      />

      <div className={styles.bar}>
        <div className={styles.barInfo}>
          <span className={styles.chip}>{plan.scope}</span>
          <span className={styles.chip}>
            يستعملها: {tracks.length > 0 ? tracks.map((t) => t.name).join("، ") : "لا مسار"}
          </span>
          <label className={styles.label}>
            عدد الأيام
            <Input
              type="number"
              min={Math.max(lockedThrough, 1)}
              max={MAX_DAYS}
              numeric
              className={styles.num}
              value={draft.dayCount || ""}
              onChange={(e) => {
                const value = parseCount(e.target.value);
                if (value !== undefined && Number.isFinite(value)) setDayCount(value);
              }}
              aria-label="عدد أيام الخطة"
            />
          </label>
          {lockedThrough > 0 ? <span className={styles.chip}>المقفل ١–{formatNumber(lockedThrough)}</span> : null}
          {errors.length > 0 ? (
            <span className={`${styles.chip} ${styles.chipBad}`}>{formatNumber(errors.length)} ملاحظات تمنع الحفظ</span>
          ) : warnings.length > 0 ? (
            <span className={`${styles.chip} ${styles.chipWarn}`}>{warnings[0]!.message}</span>
          ) : draft.dayCount > 0 ? (
            <span className={styles.chip}>سليمة</span>
          ) : null}
          {dirty ? <span className={`${styles.chip} ${styles.chipWarn}`}>تعديلات لم تُحفظ</span> : null}
        </div>
        <Button variant="primary" pending={saving} disabled={!dirty || errors.length > 0 || draft.dayCount < 1} onClick={save}>
          احفظ الخطة
        </Button>
      </div>

      {serverError ? <p className={styles.bad}>{serverError}</p> : null}
      {errors.length > 0 ? (
        <ul className={styles.issues}>
          {errors.slice(0, 8).map((e, i) => (
            <li key={i} className={styles.bad}>
              {e.message}
            </li>
          ))}
          {errors.length > 8 ? <li>و{formatNumber(errors.length - 8)} غيرها — مظلّلة في الجداول.</li> : null}
        </ul>
      ) : null}

      {fields.length === 0 ? (
        <p className={styles.warn}>
          لا حقول بعد. سمِّ واجبات اليوم من <Link href={`/programs/${programId}/content`}>تبويب المادة</Link> أولاً.
        </p>
      ) : null}

      <div className={styles.tools}>
        <ImportPanel
          programId={programId}
          programName={programName}
          fields={fields}
          tracks={tracks}
          track={track}
          material={material}
          lockedThrough={lockedThrough}
          current={draft}
          mappings={mappings}
          onApply={(next) =>
            update((d) => ({
              dayCount: Math.max(next.dayCount, lockedThrough),
              // الأيام المقفلة من المحرّر كما هي — والمستورد ما بعدها.
              values: [...d.values.filter((v) => v.day <= lockedThrough), ...next.values.filter((v) => v.day > lockedThrough)],
            }))
          }
        />
        <TemplateTool templates={templates} dayCount={draft.dayCount} onApply={fillTemplate} />
        <FieldTool fields={sortedFields} dayCount={draft.dayCount} onApply={fillField} />
        <RepetitionTool fields={sortedFields} dayCount={draft.dayCount} onApply={fillRepetition} />
      </div>

      {track && draft.dayCount > 0 ? (
        <section className={styles.preview} aria-label="معاينة يوم">
          <div className={styles.previewHead}>
            <strong>ما يراه المشارك في اليوم</strong>
            <Select
              className={styles.select}
              aria-label="اليوم"
              value={previewDay}
              onChange={(e) => setPreviewDay(Number(e.target.value))}
            >
              {days.map((day) => (
                <option key={day} value={day}>
                  اليوم {formatNumber(day)}
                </option>
              ))}
            </Select>
            {tracks.length > 1 ? (
              <Select className={styles.select} aria-label="المسار" value={trackId} onChange={(e) => setTrackId(e.target.value)}>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
          {preview.length === 0 ? (
            <p>لا نشاط في هذا اليوم.</p>
          ) : (
            preview.map((task) => (
              <div key={task.field.id} className={styles.previewTask}>
                <div className={styles.previewName}>
                  {task.field.label}
                  {task.field.isRequired ? "" : " — اختياري"}
                </div>
                {task.lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {task.repetition ? <div>كرّره {repetitionText(task.repetition)}</div> : null}
              </div>
            ))
          )}
        </section>
      ) : null}

      {sortedFields.map((field) => (
        <details key={field.id} className={styles.field} open={sortedFields.length <= 3}>
          <summary className={styles.fieldHead}>
            <span className={styles.fieldName}>{field.label}</span>
            <span className={styles.chip}>{KIND_LABEL[field.kind]}</span>
            {field.isBase ? <span className={styles.chip}>أساس</span> : null}
            {field.isConstrained ? <span className={styles.chip}>مقيَّد بالأساس</span> : null}
            <span className={styles.chip}>
              {formatNumber(effective.values.filter((v) => v.fieldId === field.id).length)} يوماً
            </span>
          </summary>
          <div className={styles.fieldBody}>
            {draft.dayCount === 0 ? (
              <p className={styles.hint}>اكتب عدد أيام الخطة أعلاه أولاً.</p>
            ) : (
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>اليوم</th>
                      {field.kind === "ranged" ? <th>المقدار</th> : null}
                      {field.kind === "explicit" ? (
                        <>
                          <th>من</th>
                          <th>إلى</th>
                        </>
                      ) : null}
                      {field.kind === "counted" ? <th>القيمة{field.countUnit ? ` (${field.countUnit})` : ""}</th> : null}
                      <th>التكرار</th>
                      <th>{track ? `النصّ — ${track.name}` : "النصّ"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day) => {
                      const v = valueAt(draft, field.id, day);
                      const locked = day <= lockedThrough;
                      const notes = [...(cellIssues.get(`${day}|${field.id}`) ?? []), ...(cellIssues.get(`${day}|`) ?? [])];
                      const num = (key: "amount" | "from" | "to" | "value") => (
                        <Input
                          className={styles.num}
                          numeric
                          disabled={locked}
                          aria-label={`${field.label}، اليوم ${day}`}
                          value={v?.[key] ?? ""}
                          onChange={(e) => setCell(day, field.id, { [key]: parseCount(e.target.value) })}
                        />
                      );
                      return (
                        <tr key={day} className={notes.length > 0 ? styles.rowBad : undefined}>
                          <td>
                            {formatNumber(day)}
                            {locked ? <span className={styles.locked}>مقفل</span> : null}
                          </td>
                          {field.kind === "ranged" ? <td>{num("amount")}</td> : null}
                          {field.kind === "explicit" ? (
                            <>
                              <td>{num("from")}</td>
                              <td>{num("to")}</td>
                            </>
                          ) : null}
                          {field.kind === "counted" ? <td>{num("value")}</td> : null}
                          <td>
                            <Input
                              className={styles.num}
                              numeric
                              disabled={locked || !v}
                              aria-label={`تكرار ${field.label}، اليوم ${day}`}
                              value={v?.repetition ?? ""}
                              onChange={(e) => setCell(day, field.id, { repetition: parseCount(e.target.value) })}
                            />
                          </td>
                          <td className={styles.text}>
                            {track ? fieldLines(effective, field, track, material, day).join(" + ") : ""}
                            {notes.map((note) => (
                              <div key={note} className={styles.cellError}>
                                {note}
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      ))}

      <Versions programId={programId} planId={plan.id} versions={versions} dirty={dirty} />
    </>
  );
}

function DayRange({
  dayCount,
  from,
  to,
  setFrom,
  setTo,
}: {
  dayCount: number;
  from: number;
  to: number;
  setFrom: (n: number) => void;
  setTo: (n: number) => void;
}) {
  return (
    <>
      <label className={styles.label}>
        من اليوم
        <Input className={styles.num} numeric type="number" min={1} max={dayCount} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} />
      </label>
      <label className={styles.label}>
        إلى اليوم
        <Input className={styles.num} numeric type="number" min={1} max={dayCount} value={to} onChange={(e) => setTo(Number(e.target.value) || 1)} />
      </label>
    </>
  );
}

function TemplateTool({
  templates,
  dayCount,
  onApply,
}: {
  templates: TemplateOption[];
  dayCount: number;
  onApply: (t: TemplateOption, multiplier: number, from: number, to: number) => void;
}) {
  const [id, setId] = useState(templates[0]?.id ?? "");
  const [multiplier, setMultiplier] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(dayCount || 1);
  const template = templates.find((t) => t.id === id);
  return (
    <div className={styles.tool}>
      <h2 className={styles.toolTitle}>تعبئة من شكل يوم</h2>
      <p className={styles.hint}>مقدار كل حقل = مقداره في الشكل × المضاعف. ولا تُعبّأ النطاقات الصريحة.</p>
      {templates.length === 0 ? (
        <p className={styles.hint}>لا أشكال أيام — عرّفها في تبويب المادة.</p>
      ) : (
        <div className={styles.row}>
          <label className={styles.label}>
            الشكل
            <Select className={styles.select} value={id} onChange={(e) => setId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.label}>
            المضاعف
            <Input className={styles.num} numeric type="number" min={0.25} step={0.25} value={multiplier} onChange={(e) => setMultiplier(Number(e.target.value) || 1)} />
          </label>
          <DayRange dayCount={dayCount} from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <Button disabled={!template || dayCount === 0} onClick={() => template && onApply(template, multiplier, from, to)}>
            عبّئ
          </Button>
        </div>
      )}
    </div>
  );
}

function FieldTool({
  fields,
  dayCount,
  onApply,
}: {
  fields: PlanField[];
  dayCount: number;
  onApply: (f: PlanField, quantity: number, from: number, to: number) => void;
}) {
  const fillable = fields.filter((f) => f.kind !== "explicit");
  const [id, setId] = useState(fillable[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(dayCount || 1);
  const field = fillable.find((f) => f.id === id);
  return (
    <div className={styles.tool}>
      <h2 className={styles.toolTitle}>تعبئة حقل</h2>
      <p className={styles.hint}>كميةٌ واحدة لأيامٍ متتالية، ثم عدّل الأيام المختلفة في الجدول.</p>
      <div className={styles.row}>
        <label className={styles.label}>
          الحقل
          <Select className={styles.select} value={id} onChange={(e) => setId(e.target.value)}>
            {fillable.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.label}>
          الكمية في اليوم
          <Input className={styles.num} numeric type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
        </label>
        <DayRange dayCount={dayCount} from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Button disabled={!field || dayCount === 0} onClick={() => field && onApply(field, quantity, from, to)}>
          عبّئ
        </Button>
      </div>
    </div>
  );
}

function RepetitionTool({
  fields,
  dayCount,
  onApply,
}: {
  fields: PlanField[];
  dayCount: number;
  onApply: (f: PlanField, count: number | undefined, from: number, to: number) => void;
}) {
  const [id, setId] = useState(fields[0]?.id ?? "");
  const [count, setCount] = useState("");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(dayCount || 1);
  const field = fields.find((f) => f.id === id);
  return (
    <div className={styles.tool}>
      <h2 className={styles.toolTitle}>التكرار</h2>
      <p className={styles.hint}>يُكتب على الأيام التي للحقل فيها قيمة. والفارغ يمحوه — فلا عدّاد.</p>
      <div className={styles.row}>
        <label className={styles.label}>
          الحقل
          <Select className={styles.select} value={id} onChange={(e) => setId(e.target.value)}>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.label}>
          المرات
          <Input className={styles.num} numeric type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <DayRange dayCount={dayCount} from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Button
          disabled={!field || dayCount === 0}
          onClick={() => field && onApply(field, count === "" ? undefined : Math.max(1, Number(count)), from, to)}
        >
          اكتب
        </Button>
      </div>
    </div>
  );
}

function Versions({
  programId,
  planId,
  versions,
  dirty,
}: {
  programId: string;
  planId: string;
  versions: VersionRow[];
  dirty: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <section className={styles.tool} aria-label="النسخ">
      <h2 className={styles.toolTitle}>النسخ</h2>
      <p className={styles.hint}>كل حفظٍ نسخة. والرجوع إلى نسخة حفظٌ جديد بقيمها، ويُرفض إن غيّر يوماً مقفلاً.</p>
      {versions.length === 0 ? (
        <p className={styles.hint}>لا نسخ بعد.</p>
      ) : (
        <ul className={styles.versions}>
          {versions.map((v) => (
            <li key={v.id}>
              <span>
                النسخة {formatNumber(v.number)} · {formatDateTime(v.at)} · {v.note}
              </span>
              <Button
                disabled={busy || dirty}
                title={dirty ? "احفظ تعديلاتك أو تخلَّ عنها أولاً" : undefined}
                onClick={() =>
                  startTransition(async () => {
                    reportAction(await restorePlanVersion(programId, planId, v.id));
                    router.refresh();
                  })
                }
              >
                رجوع
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
