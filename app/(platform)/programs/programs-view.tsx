"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { REGISTRATION_LABEL, type RegistrationState } from "@/lib/programs/registration";
import { createProgram, createSection } from "./actions";

export type SectionRow = { id: string; name: string; parentName: string | null };

export type ProgramRow = {
  id: string;
  name: string;
  sectionName: string;
  slug: string;
  kind: string;
  registration: RegistrationState;
  capacity: number | null;
};

const KIND_LABEL: Record<string, string> = {
  competition: "مسابقة",
  weekly_followup: "متابعة أسبوعية",
  remote_memorization: "حفظ عن بعد",
};

const PANEL = { maxInlineSize: "34rem", marginBlockEnd: "var(--space-8)" } as const;
const H2 = { fontSize: "var(--text-lg)" } as const;
const ERR = { color: "var(--color-danger)" } as const;
const OK = { color: "var(--color-success)" } as const;

export function ProgramsView({
  sections,
  programs,
  canWriteSections,
  canWritePrograms,
}: {
  sections: SectionRow[];
  programs: ProgramRow[];
  canWriteSections: boolean;
  canWritePrograms: boolean;
}) {
  const [sectionState, sectionAction, sectionPending] = useActionState(
    createSection,
    EMPTY_FORM_STATE,
  );
  const [programState, programAction, programPending] = useActionState(
    createProgram,
    EMPTY_FORM_STATE,
  );

  const columns: Column<ProgramRow>[] = [
    {
      key: "name",
      header: "البرنامج",
      sortable: true,
      primary: true,
      render: (p) => <Link href={`/programs/${p.id}`}>{p.name}</Link>,
    },
    { key: "section", header: "القسم", sortable: true, render: (p) => p.sectionName },
    { key: "kind", header: "النمط", render: (p) => KIND_LABEL[p.kind] ?? p.kind },
    {
      key: "registration",
      header: "التسجيل",
      align: "center",
      render: (p) => REGISTRATION_LABEL[p.registration],
    },
    {
      key: "capacity",
      header: "السعة",
      align: "end",
      render: (p) => (p.capacity === null ? "بلا سقف" : formatNumber(p.capacity)),
    },
  ];

  return (
    <>
      <h1>البرامج</h1>

      {canWriteSections ? (
        <section style={PANEL}>
          <h2 style={H2}>قسم جديد</h2>
          {sectionState.error ? <p style={ERR}>{sectionState.error}</p> : null}
          {sectionState.notice ? <p style={OK}>{sectionState.notice}</p> : null}

          <form action={sectionAction}>
            <Field id="sname" label="اسم القسم" required error={sectionState.fieldErrors?.["name"]}>
              <Input id="sname" name="name" required />
            </Field>

            <Field id="parentId" label="يتبع قسماً" hint="اتركه فارغاً لقسم رئيسي">
              <Select id="parentId" name="parentId" defaultValue="">
                <option value="">قسم رئيسي</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={sectionPending}>
                إنشاء القسم
              </Button>
            </FormActions>
          </form>
        </section>
      ) : null}

      {canWritePrograms && sections.length > 0 ? (
        <section style={PANEL}>
          <h2 style={H2}>برنامج جديد</h2>
          {programState.error ? <p style={ERR}>{programState.error}</p> : null}
          {programState.notice ? <p style={OK}>{programState.notice}</p> : null}

          <form action={programAction}>
            <Field
              id="sectionId"
              label="القسم"
              required
              error={programState.fieldErrors?.["sectionId"]}
            >
              <Select id="sectionId" name="sectionId" required defaultValue="">
                <option value="" disabled>
                  اختر قسماً
                </option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id="name"
              label="اسم البرنامج"
              required
              error={programState.fieldErrors?.["name"]}
            >
              <Input id="name" name="name" required />
            </Field>

            <Field
              id="slug"
              label="الرابط"
              required
              hint="حروف لاتينية صغيرة وشرطات — يظهر في عنوان الصفحة المعلنة"
              error={programState.fieldErrors?.["slug"]}
            >
              <Input id="slug" name="slug" latin required placeholder="sonan-1448" />
            </Field>

            <Field id="kind" label="النمط" required>
              <Select id="kind" name="kind" required defaultValue="competition">
                <option value="competition">مسابقة</option>
                <option value="weekly_followup">متابعة أسبوعية (محجوز)</option>
                <option value="remote_memorization">حفظ عن بعد (محجوز)</option>
              </Select>
            </Field>

            <Field
              id="participantLabel"
              label="مسمّى المشارك"
              required
              hint="متسابق لسنن، وقد يكون طالباً لغيرها"
              error={programState.fieldErrors?.["participantLabel"]}
            >
              <Input id="participantLabel" name="participantLabel" defaultValue="متسابق" required />
            </Field>

            <Field id="summary" label="النبذة" hint="تظهر في بطاقة المتجر العام">
              <Textarea id="summary" name="summary" />
            </Field>

            <Field
              id="capacity"
              label="السعة الاستيعابية"
              hint="اتركها فارغة لبلا سقف — بلوغها يُغلق التسجيل آلياً"
              error={programState.fieldErrors?.["capacity"]}
            >
              <Input id="capacity" name="capacity" numeric latin />
            </Field>

            <Field id="registrationOpensAt" label="فتح التسجيل" hint="اختياري">
              <Input id="registrationOpensAt" name="registrationOpensAt" type="date" latin />
            </Field>

            <Field
              id="registrationClosesAt"
              label="إغلاق التسجيل"
              hint="اختياري"
              error={programState.fieldErrors?.["registrationClosesAt"]}
            >
              <Input id="registrationClosesAt" name="registrationClosesAt" type="date" latin />
            </Field>

            <Field
              id="passingPercentage"
              label="نسبة الاجتياز"
              error={programState.fieldErrors?.["passingPercentage"]}
            >
              <Input
                id="passingPercentage"
                name="passingPercentage"
                numeric
                latin
                defaultValue="80"
              />
            </Field>

            <Field
              id="awardPercentage"
              label="نسبة استحقاق الجوائز"
              error={programState.fieldErrors?.["awardPercentage"]}
            >
              <Input id="awardPercentage" name="awardPercentage" numeric latin defaultValue="90" />
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={programPending}>
                إنشاء البرنامج
              </Button>
            </FormActions>
          </form>
        </section>
      ) : null}

      <DataTable
        columns={columns}
        rows={programs}
        rowKey={(p) => p.id}
        total={programs.length}
        page={1}
        searchPlaceholder="ابحث باسم البرنامج…"
        empty={{
          title: "لا برامج بعد",
          body:
            sections.length === 0
              ? "ابدأ بإنشاء قسم، ثم أنشئ البرنامج تحته."
              : "أنشئ أول برنامج بالنموذج أعلاه.",
        }}
      />
    </>
  );
}
