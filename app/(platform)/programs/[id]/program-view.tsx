"use client";

import { reportAction } from "@/components/shared/action-notice";
import { useActionState, useTransition } from "react";
import Link from "next/link";
import {
  Messages,
  Readiness,
  StepForm,
} from "@/components/shared/steps";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth, formatNumber, formatPercent, toDateInput } from "@/lib/format";
import { kindIsScored, kindLabel, type ProgramKind } from "@/lib/programs/kinds";
import { FIX_TAB, type ReadinessItem } from "@/lib/programs/readiness";
import { REGISTRATION_LABEL, type RegistrationState } from "@/lib/programs/registration";
import { setProgramStatus, updateProgram } from "../actions";

export type ProgramDetail = {
  id: string;
  name: string;
  slug: string;
  summary: string;
  status: "draft" | "published" | "closed";
  participantLabel: string;
  capacity: number | null;
  opensAt: string | null;
  closesAt: string | null;
  kind: ProgramKind;
  /** فارغتان في غير المسابقة — والفراغ يُعرَض غياباً لا صفراً. */
  passingPercentage: number | null;
  awardPercentage: number | null;
  registration: RegistrationState;
};

const META = {
  display: "grid",
  gap: "var(--space-2)",
  fontSize: "var(--text-sm)",
  marginBlockEnd: "var(--space-6)",
} as const;

export function ProgramView({
  readinessItems,
  program,
  canWrite,
}: {
  readinessItems: ReadinessItem[];
  program: ProgramDetail;
  canWrite: boolean;
}) {
  const [editState, editAction, editPending] = useActionState(updateProgram, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();


  return (
    <>
      <Readiness
        items={readinessItems}
        hrefOf={(fix) => {
          const tab = FIX_TAB[fix as ReadinessItem["fix"]];
          return tab ? `/programs/${program.id}/${tab}` : null;
        }}
      />

      <div style={META}>
        <span>
          الصفحة المعلنة:{" "}
          <Link href={`/p/${program.slug}`} dir="ltr">
            /p/{program.slug}
          </Link>
        </span>
        <span>مسمّى المشارك: {program.participantLabel}</span>
        <span>
          السعة: {program.capacity === null ? "بلا سقف" : formatNumber(program.capacity)}
        </span>
        <span>
          نافذة التسجيل:{" "}
          {program.opensAt ? formatDateBoth(program.opensAt) : "بلا بداية محدَّدة"} —{" "}
          {program.closesAt ? formatDateBoth(program.closesAt) : "بلا نهاية محدَّدة"}
        </span>
        <span>حالة التسجيل: {REGISTRATION_LABEL[program.registration]}</span>
        <span>النمط: {kindLabel(program.kind)}</span>
        {/* العتبتان للمسابقة وحدها: كانتا تُكتبان في الإنشاء ولا تُقرآن أبداً. */}
        {kindIsScored(program.kind) ? (
          <>
            <span>
              عتبة الاجتياز:{" "}
              {program.passingPercentage === null
                ? "—"
                : formatPercent(program.passingPercentage / 100)}
            </span>
            <span>
              عتبة الجوائز:{" "}
              {program.awardPercentage === null
                ? "—"
                : formatPercent(program.awardPercentage / 100)}
            </span>
          </>
        ) : null}
      </div>

      {canWrite ? (
        <div style={{ display: "flex", gap: "var(--space-3)", marginBlockEnd: "var(--space-8)" }}>
          {program.status !== "published" ? (
            <Button
              variant="primary"
              pending={busy}
              onClick={() =>
                startTransition(async () => reportAction(await setProgramStatus(program.id, "published")))
              }
            >
              نشر البرنامج
            </Button>
          ) : null}
          {program.status === "published" ? (
            <Button
              pending={busy}
              onClick={() =>
                startTransition(async () => reportAction(await setProgramStatus(program.id, "draft")))
              }
            >
              إعادة لمسوّدة
            </Button>
          ) : null}
          {program.status !== "closed" ? (
            <Button
              variant="danger"
              pending={busy}
              onClick={() =>
                startTransition(async () => reportAction(await setProgramStatus(program.id, "closed")))
              }
            >
              إغلاق
            </Button>
          ) : null}
        </div>
      ) : null}

      {canWrite ? (
        <details style={{ marginBlockEnd: "var(--space-8)" }}>
          <summary style={{ cursor: "pointer", fontWeight: "var(--weight-medium)" }}>
            عدّل بيانات البرنامج
          </summary>
          <StepForm title="بيانات البرنامج" action={editAction} state={editState}>
            <input type="hidden" name="programId" value={program.id} />
            <Field id="pname" label="الاسم" required error={editState.fieldErrors?.["name"]}>
              <Input id="pname" name="name" defaultValue={program.name} required />
            </Field>
            <Field id="psummary" label="النبذة">
              <Textarea id="psummary" name="summary" rows={2} defaultValue={program.summary} />
            </Field>
            <Field
              id="pslug"
              label="رابط الصفحة المعلنة"
              hint={
                program.status === "draft"
                  ? "بحروف لاتينية صغيرة وأرقام وشرطات"
                  : "لا يتغيّر بعد النشر — من حفظه يصل إلى صفحة غير موجودة"
              }
              error={editState.fieldErrors?.["slug"]}
            >
              <Input
                id="pslug"
                name="slug"
                defaultValue={program.slug}
                latin
                disabled={program.status !== "draft"}
              />
            </Field>
            <Field
              id="plabel"
              label="مسمّى المشارك"
              required
              error={editState.fieldErrors?.["participantLabel"]}
            >
              <Input id="plabel" name="participantLabel" defaultValue={program.participantLabel} required />
            </Field>
            <Field id="pcap" label="السعة" hint="اتركها فارغة لبلا سقف" error={editState.fieldErrors?.["capacity"]}>
              <Input
                id="pcap"
                name="capacity"
                numeric
                latin
                defaultValue={program.capacity === null ? "" : String(program.capacity)}
              />
            </Field>
            <Field id="popens" label="فتح التسجيل" hint="اختياري">
              <Input
                id="popens"
                name="registrationOpensAt"
                type="date"
                latin
                defaultValue={program.opensAt ? toDateInput(program.opensAt) : ""}
              />
            </Field>
            <Field
              id="pcloses"
              label="إغلاق التسجيل"
              hint="اختياري"
              error={editState.fieldErrors?.["registrationClosesAt"]}
            >
              <Input
                id="pcloses"
                name="registrationClosesAt"
                type="date"
                latin
                defaultValue={program.closesAt ? toDateInput(program.closesAt) : ""}
              />
            </Field>
            {kindIsScored(program.kind) ? (
              <>
                <Field
                  id="ppass"
                  label="نسبة الاجتياز (٪)"
                  required
                  error={editState.fieldErrors?.["passingPercentage"]}
                >
                  <Input
                    id="ppass"
                    name="passingPercentage"
                    numeric
                    latin
                    defaultValue={program.passingPercentage ?? ""}
                    required
                  />
                </Field>
                <Field
                  id="paward"
                  label="نسبة استحقاق الجوائز (٪)"
                  required
                  error={editState.fieldErrors?.["awardPercentage"]}
                >
                  <Input
                    id="paward"
                    name="awardPercentage"
                    numeric
                    latin
                    defaultValue={program.awardPercentage ?? ""}
                    required
                  />
                </Field>
              </>
            ) : null}
            <FormActions>
              <Button type="submit" variant="primary" pending={editPending}>
                احفظ
              </Button>
            </FormActions>
            <Messages state={editState} />
          </StepForm>
        </details>
      ) : null}

    </>
  );
}
