"use client";

import { Check, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import {
  addContentUnits,
  addDayTemplate,
  addTaskField,
  addTemplateField,
  addTrackRange,
  removeTrackRange,
} from "./actions";
import styles from "./content.module.css";

export type UnitRow = { id: string; sequence: number; label: string };
export type FieldRow = { id: string; label: string; kind: "ranged" | "counted" };
export type TrackRow = {
  id: string;
  name: string;
  unitCount: number;
  parts: { id: string; from: number; to: number }[];
};
export type TemplateRow = {
  id: string;
  name: string;
  fields: { fieldId: string; label: string; kind: "ranged" | "counted"; amount: number }[];
};
export type PreviewPart = { from: number; to: number; fromLabel: string; toLabel: string };
export type PreviewTask = {
  label: string;
  kind: "ranged" | "counted";
  amount: number;
  parts: PreviewPart[];
};

/** خطوة واحدة من الأربع: رقمها، وعنوانها، وسطرُ «لماذا»، وحالتها. */
function Step({
  n,
  title,
  why,
  done,
  state,
  children,
}: {
  n: number;
  title: string;
  why: string;
  done: boolean;
  state: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.step}>
      <header className={styles.stepHead}>
        <span className={`${styles.stepNum} ${done ? styles.stepNumDone : ""}`}>
          {done ? <Check size={16} aria-hidden /> : formatNumber(n)}
        </span>
        <div>
          <h2 className={styles.stepTitle}>{title}</h2>
          <p className={styles.stepWhy}>{why}</p>
        </div>
      </header>

      <div className={`${styles.state} ${done ? styles.stateDone : styles.stateEmpty}`}>
        {state}
      </div>

      {children}
    </section>
  );
}

function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state.error ? <p className={styles.msgError}>{state.error}</p> : null}
      {state.notice ? <p className={styles.msgOk}>{state.notice}</p> : null}
    </>
  );
}

export function ContentView({
  programId,
  programName,
  units,
  tracks,
  fields,
  templates,
  previews,
}: {
  programId: string;
  programName: string;
  units: UnitRow[];
  tracks: TrackRow[];
  fields: FieldRow[];
  templates: TemplateRow[];
  previews: Record<string, PreviewTask[]>;
}) {
  const [unitState, unitAction, unitPending] = useActionState(addContentUnits, EMPTY_FORM_STATE);
  const [partState, partAction, partPending] = useActionState(addTrackRange, EMPTY_FORM_STATE);
  const [fieldState, fieldAction, fieldPending] = useActionState(addTaskField, EMPTY_FORM_STATE);
  const [tplState, tplAction, tplPending] = useActionState(addDayTemplate, EMPTY_FORM_STATE);
  const [tfState, tfAction, tfPending] = useActionState(addTemplateField, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const [showUnits, setShowUnits] = useState(false);
  const [track, setTrack] = useState(tracks[0]?.id ?? "");
  const [template, setTemplate] = useState(templates[0]?.id ?? "");

  const nextNumber = units.length === 0 ? 1 : Math.max(...units.map((u) => u.sequence)) + 1;
  const hasParts = tracks.some((t) => t.parts.length > 0);
  const ready = units.length > 0 && hasParts && fields.length > 0 && templates.length > 0;

  const previewTasks = previews[`${track}:${template}`] ?? [];
  const shownTrack = tracks.find((t) => t.id === track);

  const unitColumns: Column<UnitRow>[] = [
    {
      key: "sequence",
      header: "الرقم",
      align: "end",
      sortable: true,
      render: (u) => formatNumber(u.sequence),
    },
    { key: "label", header: "النصّ", primary: true, render: (u) => u.label },
  ];

  return (
    <>
      <p style={{ fontSize: "var(--text-sm)", display: "flex", gap: "var(--space-4)" }}>
        <Link href="/programs">البرامج</Link>
        <Link href={`/programs/${programId}`}>{programName}</Link>
      </p>

      <header className={styles.head}>
        <h1 className={styles.title}>ما يحفظه المشاركون</h1>
        <p className={styles.lede}>
          أربع خطوات: تُدخل المادة، ثم تحدّد نصيب كل مسار منها، ثم تسمّي واجبات اليوم،
          ثم تجمعها في شكل يوم. وتحتها معاينة تُريك ما سيراه المشارك.
        </p>
      </header>

      {/* ══ المعاينة أولاً: النتيجة قبل التفاصيل ══ */}
      {ready ? (
        <section className={styles.preview}>
          <div className={styles.previewHead}>
            <h2 className={styles.previewTitle}>ما سيراه المشارك في يومه الأول</h2>
          </div>
          <p className={styles.previewWhy}>
            محسوبة بالطريقة نفسها التي تعمل بها المنصة — لا تقريباً.
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
                          من {formatNumber(p.from)}
                          {p.fromLabel ? ` · ${p.fromLabel}` : null} إلى {formatNumber(p.to)}
                          {p.toLabel ? ` · ${p.toLabel}` : null}
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

      {/* ══ ١ · المادة ══ */}
      <Step
        n={1}
        title="المادة"
        why="القائمة المرقَّمة لكل ما يمكن حفظه في هذا البرنامج — حديثاً حديثاً أو متناً متناً. الترقيم هو ما يُبنى عليه كل شيء بعده."
        done={units.length > 0}
        state={
          units.length === 0 ? (
            <span>لم تُدخل المادة بعد.</span>
          ) : (
            <>
              <span>
                {formatNumber(units.length)} عنصراً · من {formatNumber(units[0]!.sequence)} إلى{" "}
                {formatNumber(units[units.length - 1]!.sequence)}
              </span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => setShowUnits((v) => !v)}
              >
                {showUnits ? "أخفِ القائمة" : "اعرض القائمة"}
              </button>
            </>
          )
        }
      >
        {showUnits && units.length > 0 ? (
          <DataTable
            columns={unitColumns}
            rows={units}
            rowKey={(u) => u.id}
            total={units.length}
            page={1}
            empty={{ title: "لا مادة", body: "أدخلها من النموذج أدناه." }}
          />
        ) : null}

        <form action={unitAction} className={styles.form}>
          <p className={styles.formTitle}>إضافة</p>
          <input type="hidden" name="programId" value={programId} />

          <Field
            id="lines"
            label="الصق القائمة — سطر لكل عنصر"
            required
            hint="مثال: كل سطر أول كلمات الحديث أو اسم المتن."
            error={unitState.fieldErrors?.lines}
          >
            <Textarea id="lines" name="lines" rows={6} required />
          </Field>

          <Field
            id="startAt"
            label="يبدأ الترقيم من"
            hint={`التالي المتاح: ${formatNumber(nextNumber)}`}
            error={unitState.fieldErrors?.startAt}
          >
            <Input
              id="startAt"
              name="startAt"
              type="number"
              min={1}
              defaultValue={nextNumber}
              numeric
            />
          </Field>

          <FormActions>
            <Button type="submit" variant="primary" pending={unitPending}>
              أضِف
            </Button>
          </FormActions>
          <Messages state={unitState} />
        </form>
      </Step>

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
        <div className={styles.cards}>
          {tracks.map((t) => (
            <div key={t.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardName}>{t.name}</span>
                <span className={styles.cardMeta}>{formatNumber(t.unitCount)} وحدة</span>
              </div>
              {t.parts.length === 0 ? (
                <p className={styles.none}>بلا نصيب — لن يرى مشاركوه واجباً</p>
              ) : (
                <div className={styles.chips}>
                  {t.parts.map((p) => (
                    <span key={p.id} className={styles.chip}>
                      {formatNumber(p.from)} – {formatNumber(p.to)}
                      <button
                        type="button"
                        aria-label={`حذف الجزء ${p.from} إلى ${p.to}`}
                        className={styles.chipRemove}
                        disabled={busy}
                        onClick={() =>
                          startTransition(async () => void (await removeTrackRange(p.id, programId)))
                        }
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {tracks.length > 0 && units.length > 0 ? (
          <form action={partAction} className={styles.form}>
            <p className={styles.formTitle}>إضافة جزء</p>
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
          </form>
        ) : null}
      </Step>

      {/* ══ ٣ · واجبات اليوم ══ */}
      <Step
        n={3}
        title="واجبات اليوم"
        why="سمِّ ما يفعله المشارك كل يوم. النوع نوعان لا ثالث: واجبٌ يمتدّ في المادة «من… إلى…» فيتقدّم يوماً بعد يوم، وواجبٌ بعدد مستقلّ لا علاقة له بالترقيم."
        done={fields.length > 0}
        state={
          fields.length === 0 ? (
            <span>لم تُسمَّ واجبات بعد.</span>
          ) : (
            <span>{formatNumber(fields.length)} واجباً</span>
          )
        }
      >
        <div className={styles.cards}>
          {fields.map((f) => (
            <div key={f.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardName}>{f.label}</span>
              </div>
              <p className={styles.cardMeta}>
                {f.kind === "ranged"
                  ? "يمتدّ في المادة — يبدأ من حيث انتهى أمس"
                  : "عدد مستقلّ — لا يتقدّم في المادة"}
              </p>
            </div>
          ))}
        </div>

        <form action={fieldAction} className={styles.form}>
          <p className={styles.formTitle}>إضافة واجب</p>
          <input type="hidden" name="programId" value={programId} />

          <Field
            id="label"
            label="الاسم"
            required
            hint="كما يراه المشارك: حفظ · مراجعة · تكرار · سرد."
            error={fieldState.fieldErrors?.label}
          >
            <Input id="label" name="label" required />
          </Field>

          <Field id="kind" label="النوع" required error={fieldState.fieldErrors?.kind}>
            <Select id="kind" name="kind" defaultValue="ranged">
              <option value="ranged">يمتدّ في المادة (من… إلى…)</option>
              <option value="counted">عدد مستقلّ</option>
            </Select>
          </Field>

          <Field id="sortOrder2" label="ترتيب العرض" error={fieldState.fieldErrors?.sortOrder}>
            <Input
              id="sortOrder2"
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={fields.length}
              numeric
            />
          </Field>

          <FormActions>
            <Button type="submit" variant="primary" pending={fieldPending}>
              أضِف الواجب
            </Button>
          </FormActions>
          <Messages state={fieldState} />
        </form>
      </Step>

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
        <div className={styles.cards}>
          {templates.map((t) => (
            <div key={t.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardName}>{t.name}</span>
                <span className={styles.cardMeta}>{formatNumber(t.fields.length)} واجب</span>
              </div>
              {t.fields.length === 0 ? (
                <p className={styles.none}>بلا واجبات — أضِفها أدناه</p>
              ) : (
                <div className={styles.chips}>
                  {t.fields.map((f) => (
                    <span key={f.fieldId} className={styles.chip}>
                      {f.label} · {formatNumber(f.amount)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <form action={tplAction} className={styles.form}>
          <p className={styles.formTitle}>شكل جديد</p>
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
        </form>

        {templates.length > 0 && fields.length > 0 ? (
          <form action={tfAction} className={styles.form}>
            <p className={styles.formTitle}>إضافة واجب إلى شكل</p>
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
                {fields.map((f) => (
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
          </form>
        ) : null}
      </Step>
    </>
  );
}
