"use client";

/**
 * معرض الجوامع — يستهلك الأربعة، وهو دليل القبول للحزمة الرابعة.
 *
 * **بلا مدخل في `config/navigation.ts` بقصد**: صفحة مرجعية للبناء لا للمستخدم،
 * تُفتح بالرابط المباشر. تصريحٌ يلزم لحارس الاكتمال (`completeness-contract §٢.ب`).
 */

import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { formatDateBoth, formatNumber, formatPercent } from "@/lib/format";

type Row = { id: string; name: string; track: string; done: number; status: string };

const ROWS: Row[] = [
  { id: "1", name: "عبدالله بن محمد", track: "المسار الأول", done: 0.92, status: "متوافق" },
  { id: "2", name: "سعد الحربي", track: "المسار الثاني", done: 0.61, status: "متعثّر" },
  { id: "3", name: "خالد العتيبي", track: "المسار الأول", done: 1.0, status: "سابق" },
  { id: "4", name: "فهد الشمري", track: "المسار الثالث", done: 0.78, status: "متوافق" },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "المشارك", sortable: true, primary: true, render: (r) => r.name },
  { key: "track", header: "المسار", sortable: true, render: (r) => r.track },
  {
    key: "done",
    header: "نسبة الإنجاز",
    align: "end",
    sortable: true,
    render: (r) => formatPercent(r.done),
  },
  { key: "status", header: "الحالة", align: "center", render: (r) => r.status },
];

export default function Showcase() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");

  const sectionStyle = { marginBlockEnd: "var(--space-12)" } as const;
  const headingStyle = {
    fontSize: "var(--text-xl)",
    fontWeight: "var(--weight-bold)",
    marginBlockEnd: "var(--space-4)",
  } as const;
  const noteStyle = {
    fontSize: "var(--text-sm)",
    color: "var(--color-text-muted)",
    marginBlockEnd: "var(--space-4)",
  } as const;

  return (
    <div>
      <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)" }}>
        معرض الجوامع
      </h1>
      <p style={noteStyle}>{formatDateBoth(new Date("2026-09-02T09:00:00Z"))}</p>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>الجدول الجامع</h2>
        <p style={noteStyle}>
          ترتيب متسلسل · فرز ثلاثي · بحث بتأخير · تحديد يميّز الصفحة عن كل النتائج ·
          الحالة كلها في الرابط · وبطاقات دون ١٠٢٤px.
        </p>
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          total={ROWS.length}
          page={1}
          searchPlaceholder="ابحث باسم المشارك…"
          selection={{
            selected,
            onChange: setSelected,
            allMatching,
            onSelectAllMatching: setAllMatching,
            actions: <Button variant="danger">إيقاف المحدَّد</Button>,
          }}
          empty={{ title: "لا مشاركون بعد", body: "لم يُسجَّل أحد في هذا البرنامج." }}
        />
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>النموذج الجامع</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          style={{ maxInlineSize: "32rem" }}
        >
          <Field
            id="name"
            label="اسم البرنامج"
            required
            hint="يظهر في بطاقة المتجر العام"
            error={submitted && !name ? "اسم البرنامج مطلوب" : undefined}
          >
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              invalid={submitted && !name}
            />
          </Field>

          <Field id="capacity" label="السعة الاستيعابية" hint="اتركه فارغاً لبلا سقف">
            <Input id="capacity" numeric latin />
          </Field>

          <Field id="kind" label="نمط البرنامج" required>
            <Select id="kind" required defaultValue="competition">
              <option value="competition">مسابقة</option>
              <option value="weekly">متابعة أسبوعية</option>
            </Select>
          </Field>

          <Field id="summary" label="النبذة">
            <Textarea id="summary" />
          </Field>

          <FormActions>
            <Button type="submit" variant="primary">
              حفظ
            </Button>
            <Button onClick={() => setSubmitted(false)}>إلغاء</Button>
            <Button pending>أثناء الإرسال</Button>
          </FormActions>
        </form>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>الحالات الثلاث</h2>
        <p style={noteStyle}>
          الفراغ يفرّق بين «لا بيانات» و«لا نتائج تصفية» — خلطهما يقول للمستخدم لا شيء
          هنا وعنده {formatNumber(100)} صفّ خلف مرشِّح نسيه.
        </p>
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <LoadingState rows={3} />
          <EmptyState
            kind="no-data"
            title="لا برامج بعد"
            body="ابدأ بإنشاء برنامج، ثم أضف مساراته وخطته."
            action={<Button variant="primary">إنشاء برنامج</Button>}
          />
          <EmptyState
            kind="no-results"
            title="لا نتائج مطابقة"
            body="لا صفّ يطابق البحث الحالي."
            action={<Button>مسح التصفية</Button>}
          />
          <ErrorState
            body="تعذّر الاتصال بالقاعدة. تحقّق من الشبكة ثم أعد المحاولة."
            action={<Button>إعادة المحاولة</Button>}
          />
        </div>
      </section>
    </div>
  );
}
