"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import {
  addContentUnits,
  addDayTemplate,
  addTaskField,
  addTemplateField,
  addTrackRange,
  removeTrackRange,
} from "./actions";

export type UnitRow = { id: string; sequence: number; label: string };
export type RangeRow = {
  id: string;
  trackId: string;
  trackName: string;
  from: number;
  to: number;
  sortOrder: number;
};
export type FieldRow = { id: string; label: string; kind: "ranged" | "counted"; sortOrder: number };
export type TemplateRow = {
  id: string;
  name: string;
  fields: { label: string; amount: number }[];
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

export function ContentView({
  programId,
  programName,
  units,
  unitCount,
  ranges,
  fields,
  templates,
  tracks,
}: {
  programId: string;
  programName: string;
  units: UnitRow[];
  unitCount: number;
  ranges: RangeRow[];
  fields: FieldRow[];
  templates: TemplateRow[];
  tracks: { id: string; name: string; unitCount: number }[];
}) {
  const [unitState, unitAction, unitPending] = useActionState(addContentUnits, EMPTY_FORM_STATE);
  const [rangeState, rangeAction, rangePending] = useActionState(addTrackRange, EMPTY_FORM_STATE);
  const [fieldState, fieldAction, fieldPending] = useActionState(addTaskField, EMPTY_FORM_STATE);
  const [tplState, tplAction, tplPending] = useActionState(addDayTemplate, EMPTY_FORM_STATE);
  const [tfState, tfAction, tfPending] = useActionState(addTemplateField, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const unitColumns: Column<UnitRow>[] = [
    {
      key: "sequence",
      header: "الرقم",
      align: "end",
      sortable: true,
      render: (u) => formatNumber(u.sequence),
    },
    { key: "label", header: "نصّ البداية", primary: true, render: (u) => u.label },
  ];

  const rangeColumns: Column<RangeRow>[] = [
    { key: "track", header: "المسار", sortable: true, primary: true, render: (r) => r.trackName },
    {
      key: "range",
      header: "المقطع",
      align: "end",
      render: (r) => `${formatNumber(r.from)} – ${formatNumber(r.to)}`,
    },
    {
      key: "length",
      header: "عدد الوحدات",
      align: "end",
      render: (r) => formatNumber(r.to - r.from + 1),
    },
    {
      key: "sort",
      header: "الترتيب",
      align: "center",
      sortable: true,
      render: (r) => formatNumber(r.sortOrder),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (r) => (
        <Button
          aria-label="حذف المقطع"
          variant="danger"
          pending={busy}
          onClick={() => startTransition(async () => void (await removeTrackRange(r.id, programId)))}
        >
          <Trash2 size={16} aria-hidden />
        </Button>
      ),
    },
  ];

  const fieldColumns: Column<FieldRow>[] = [
    { key: "label", header: "المسمّى", sortable: true, primary: true, render: (f) => f.label },
    {
      key: "kind",
      header: "النوع",
      align: "center",
      render: (f) => (f.kind === "ranged" ? "نطاقي" : "عددي"),
    },
    {
      key: "gen",
      header: "يدخل التوليد",
      align: "center",
      render: (f) => (f.kind === "ranged" ? "نعم" : "لا"),
    },
  ];

  return (
    <>
      <p style={{ fontSize: "var(--text-sm)", display: "flex", gap: "var(--space-4)" }}>
        <Link href="/programs">البرامج</Link>
        <Link href={`/programs/${programId}`}>{programName}</Link>
      </p>
      <h1>المادة والواجب اليومي</h1>

      {/* ── المادة المرقَّمة ── */}
      <h2 style={H2}>المادة المرقَّمة</h2>
      <p style={NOTE}>
        مرجع الحساب في كل حقل نطاقي. الوحدة اسمٌ لا نوع — حديث أو صفحة أو وجه، والبنية
        واحدة. المُدخَل الآن: {formatNumber(unitCount)} وحدة.
      </p>

      <section style={PANEL}>
        {unitState.error ? <p style={ERR}>{unitState.error}</p> : null}
        {unitState.notice ? <p style={OK}>{unitState.notice}</p> : null}

        <form action={unitAction}>
          <input type="hidden" name="programId" value={programId} />
          <Field
            id="startAt"
            label="رقم البداية"
            required
            hint="الترقيم متتابع من هنا"
            error={unitState.fieldErrors?.["startAt"]}
          >
            <Input
              id="startAt"
              name="startAt"
              numeric
              latin
              required
              defaultValue={String(unitCount + 1)}
            />
          </Field>
          <Field
            id="lines"
            label="الوحدات"
            required
            hint="سطر لكل وحدة — نصّ بدايتها"
            error={unitState.fieldErrors?.["lines"]}
          >
            <Textarea id="lines" name="lines" rows={6} required />
          </Field>
          <FormActions>
            <Button type="submit" variant="primary" pending={unitPending}>
              إدخال المادة
            </Button>
          </FormActions>
        </form>
      </section>

      <DataTable
        columns={unitColumns}
        rows={units}
        rowKey={(u) => u.id}
        total={units.length}
        page={1}
        searchPlaceholder="ابحث في المادة…"
        empty={{ title: "لا مادة بعد", body: "أدخل وحدات المادة بالنموذج أعلاه." }}
      />

      {/* ── مقاطع المسارات ── */}
      <h2 style={H2}>مقاطع المسارات</h2>
      <p style={NOTE}>
        نطاق المسار <strong>متفرّق لا متّصل</strong>: قد يجمع أبواباً غير متجاورة. والرتبة
        داخله تتبع <strong>الترتيب</strong> لا أرقام الوحدات — فقد يُقصَد تقديم باب متأخر
        في الترقيم. والمقاطع <strong>لا تتقاطع</strong>، والقاعدة ترفض التداخل.
      </p>

      <div style={{ ...NOTE, display: "grid", gap: "var(--space-1)" }}>
        {tracks.map((t) => (
          <span key={t.id}>
            {t.name}: {formatNumber(t.unitCount)} وحدة
          </span>
        ))}
      </div>

      {tracks.length > 0 ? (
        <section style={PANEL}>
          {rangeState.error ? <p style={ERR}>{rangeState.error}</p> : null}
          {rangeState.notice ? <p style={OK}>{rangeState.notice}</p> : null}

          <form action={rangeAction}>
            <input type="hidden" name="programId" value={programId} />
            <Field id="trackId" label="المسار" required error={rangeState.fieldErrors?.["trackId"]}>
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
              label="من وحدة"
              required
              error={rangeState.fieldErrors?.["fromSequence"]}
            >
              <Input id="fromSequence" name="fromSequence" numeric latin required />
            </Field>
            <Field
              id="toSequence"
              label="إلى وحدة"
              required
              error={rangeState.fieldErrors?.["toSequence"]}
            >
              <Input id="toSequence" name="toSequence" numeric latin required />
            </Field>
            <Field id="sortOrder" label="ترتيب المقطع" hint="الأصغر أولاً في تسلسل الحفظ">
              <Input id="sortOrder" name="sortOrder" numeric latin defaultValue="0" />
            </Field>
            <FormActions>
              <Button type="submit" variant="primary" pending={rangePending}>
                إضافة مقطع
              </Button>
            </FormActions>
          </form>
        </section>
      ) : (
        <p style={NOTE}>أضف مسارات للبرنامج أولاً.</p>
      )}

      <DataTable
        columns={rangeColumns}
        rows={ranges}
        rowKey={(r) => r.id}
        total={ranges.length}
        page={1}
        searchPlaceholder="ابحث بالمسار…"
        empty={{ title: "لا مقاطع بعد", body: "حدّد نطاق كل مسار من المادة." }}
      />

      {/* ── حقول الواجب ── */}
      <h2 style={H2}>حقول الواجب اليومي</h2>
      <p style={NOTE}>
        النوع مغلق (<strong>نطاقي</strong> أو <strong>عددي</strong>) والمسمّى حرّ:
        «حفظ» و«مراجعة» و«سرد» تسميات لحقول نطاقية، و«تكرار» تسمية لحقل عددي. والعددي
        لا يدخل التوليد إطلاقاً — مستقل يوماً بيوم.
      </p>

      <section style={PANEL}>
        {fieldState.error ? <p style={ERR}>{fieldState.error}</p> : null}
        {fieldState.notice ? <p style={OK}>{fieldState.notice}</p> : null}

        <form action={fieldAction}>
          <input type="hidden" name="programId" value={programId} />
          <Field id="label" label="المسمّى" required error={fieldState.fieldErrors?.["label"]}>
            <Input id="label" name="label" required placeholder="حفظ" />
          </Field>
          <Field id="kind" label="النوع" required>
            <Select id="kind" name="kind" required defaultValue="ranged">
              <option value="ranged">نطاقي — من وإلى، يدخل التوليد</option>
              <option value="counted">عددي — قيمة واحدة، مستقل يوماً بيوم</option>
            </Select>
          </Field>
          <Field id="fsort" label="الترتيب">
            <Input id="fsort" name="sortOrder" numeric latin defaultValue="0" />
          </Field>
          <FormActions>
            <Button type="submit" variant="primary" pending={fieldPending}>
              إضافة حقل
            </Button>
          </FormActions>
        </form>
      </section>

      <DataTable
        columns={fieldColumns}
        rows={fields}
        rowKey={(f) => f.id}
        total={fields.length}
        page={1}
        searchPlaceholder="ابحث بالمسمّى…"
        empty={{
          title: "لا حقول بعد",
          body: "تحديد الحقول خطوة سابقة إلزامية على بناء أي خطة.",
        }}
      />

      {/* ── قوالب الأيام ── */}
      <h2 style={H2}>قوالب الأيام</h2>
      <p style={NOTE}>
        القالب يُعرَّف مرة ويُطبَّق على أي عدد من الأيام. ومقدار الحقل في يوم =
        المقدار الأساسي هنا × مضاعف ذلك اليوم في الخطة.
      </p>

      <div style={{ ...NOTE, display: "grid", gap: "var(--space-2)" }}>
        {templates.length === 0 ? (
          <span>لا قوالب بعد.</span>
        ) : (
          templates.map((t) => (
            <span key={t.id}>
              <strong>{t.name}</strong>
              {t.fields.length === 0
                ? " — بلا حقول"
                : ` — ${t.fields
                    .map((f) => `${f.label} ${formatNumber(f.amount)}`)
                    .join(" · ")}`}
            </span>
          ))
        )}
      </div>

      <section style={PANEL}>
        {tplState.error ? <p style={ERR}>{tplState.error}</p> : null}
        {tplState.notice ? <p style={OK}>{tplState.notice}</p> : null}

        <form action={tplAction}>
          <input type="hidden" name="programId" value={programId} />
          <Field id="tplName" label="اسم القالب" required error={tplState.fieldErrors?.["name"]}>
            <Input id="tplName" name="name" required placeholder="يوم كامل" />
          </Field>
          <FormActions>
            <Button type="submit" variant="primary" pending={tplPending}>
              إنشاء قالب
            </Button>
          </FormActions>
        </form>
      </section>

      {templates.length > 0 && fields.length > 0 ? (
        <section style={PANEL}>
          {tfState.error ? <p style={ERR}>{tfState.error}</p> : null}
          {tfState.notice ? <p style={OK}>{tfState.notice}</p> : null}

          <form action={tfAction}>
            <input type="hidden" name="programId" value={programId} />
            <Field id="dayTemplateId" label="القالب" required>
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
            <Field id="taskFieldId" label="الحقل" required>
              <Select id="taskFieldId" name="taskFieldId" required defaultValue="">
                <option value="" disabled>
                  اختر حقلاً
                </option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} ({f.kind === "ranged" ? "نطاقي" : "عددي"})
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="baseAmount"
              label="المقدار الأساسي"
              required
              error={tfState.fieldErrors?.["baseAmount"]}
            >
              <Input id="baseAmount" name="baseAmount" numeric latin required />
            </Field>
            <FormActions>
              <Button type="submit" variant="primary" pending={tfPending}>
                إضافة الحقل للقالب
              </Button>
            </FormActions>
          </form>
        </section>
      ) : null}
    </>
  );
}
