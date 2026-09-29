"use client";

import { reportAction } from "@/components/shared/action-notice";
import { Modal } from "@/components/shared/modal";
import { useActionState, useState, useTransition } from "react";
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
  contact: string;
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
  missing,
  program,
  canWrite,
}: {
  readinessItems: ReadinessItem[];
  /** ما يمنع النشر، من حارس القاعدة نفسه — لا يُشتقّ هنا ثانيةً. */
  missing: string[];
  program: ProgramDetail;
  canWrite: boolean;
}) {
  const [editState, editAction, editPending] = useActionState(updateProgram, EMPTY_FORM_STATE);
  const [confirming, setConfirming] = useState<"published" | "closed" | null>(null);

  /**
   * النشر مشروط بالجاهزية، والقاعدة تمنعه. والزرّ يقول ذلك قبل الضغط —
   * **بقائمة الحارس نفسها**: كانت تُشتقّ هنا من لوحة الجاهزية فتختلف عنها
   * تسميةً وعدداً، فيقول زرٌّ «ينقص سبعة» وتقول شاشة النشر «ينقص خمسة».
   */
  const ready = missing.length === 0;
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
          جهة تواصل المشاركين: {program.contact || "لم تُحدَّد — والمشارك المتعثّر لا يجد من يسأل"}
        </span>
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
              disabled={!ready}
              title={ready ? undefined : `ينقص: ${missing.join(" · ")}`}
              onClick={() => setConfirming("published")}
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
            <Button variant="danger" pending={busy} onClick={() => setConfirming("closed")}>
              إغلاق
            </Button>
          ) : null}
          {program.status !== "published" && !ready ? (
            <p style={{ alignSelf: "center", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
              ينقص قبل النشر: {missing.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={confirming !== null}
        title={confirming === "closed" ? "إغلاق البرنامج" : "نشر البرنامج"}
        onClose={() => setConfirming(null)}
      >
        <p>
          {confirming === "closed"
            ? "يُغلق التسجيل فلا يسجّل أحد بعده، ويبقى المسجَّلون ورحلاتهم كما هي. ويمكنك إعادة فتحه بالنشر."
            : `تُفتَح صفحة البرنامج للزوّار على /p/${program.slug}، ويُفتَح التسجيل بحسب نافذته وسعته.`}
        </p>
        <FormActions>
          <Button onClick={() => setConfirming(null)}>إلغاء</Button>
          <Button
            variant={confirming === "closed" ? "danger" : "primary"}
            pending={busy}
            onClick={() => {
              const target = confirming;
              if (!target) return;
              startTransition(async () => {
                reportAction(await setProgramStatus(program.id, target));
                setConfirming(null);
              });
            }}
          >
            {confirming === "closed" ? "أغلقه" : "انشره"}
          </Button>
        </FormActions>
      </Modal>

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
            <Field id="psummary" label="النبذة" span="full">
              <Textarea id="psummary" name="summary" rows={2} defaultValue={program.summary} />
            </Field>
            {/* بلا هذا الحقل لا سبيل لضبط جهة التواصل، ويُمحى ما في القاعدة مع كل حفظ. */}
            <Field
              id="pcontact"
              label="جهة تواصل المشاركين"
              hint="بريد أو رقم أو رابط — يظهر للمشارك حين يعترضه ما لا يحلّه بنفسه"
              error={editState.fieldErrors?.["contact"]}
            >
              <Input id="pcontact" name="contact" defaultValue={program.contact} />
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
