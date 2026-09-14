"use client";

import { reportAction } from "@/components/shared/action-notice";
import { useActionState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/shared/data-table";
import {
  Messages,
  PageHead,
  Readiness,
  Step,
  StepForm,
} from "@/components/shared/steps";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth, formatNumber, formatPercent, toDateInput } from "@/lib/format";
import { kindIsScored, kindLabel, type ProgramKind } from "@/lib/programs/kinds";
import type { ReadinessItem } from "@/lib/programs/readiness";
import { REGISTRATION_LABEL, type RegistrationState } from "@/lib/programs/registration";
import { archiveTrack, createTrack, setProgramStatus, updateProgram, updateTrack } from "../actions";
import { InlineText } from "@/components/shared/inline-edit";

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

export type TrackRow = {
  id: string;
  name: string;
  description: string;
  capacity: number | null;
};

const META = {
  display: "grid",
  gap: "var(--space-2)",
  fontSize: "var(--text-sm)",
  marginBlockEnd: "var(--space-6)",
} as const;

export function ProgramView({
  readinessItems,
  emptyProgram,
  program,
  tracks,
  canWrite,
}: {
  readinessItems: ReadinessItem[];
  /** برنامج بلا مادة ولا واجبات — يُعرَض له الإعداد السريع. */
  emptyProgram: boolean;
  program: ProgramDetail;
  tracks: TrackRow[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(createTrack, EMPTY_FORM_STATE);
  const [editState, editAction, editPending] = useActionState(updateProgram, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const columns: Column<TrackRow>[] = [
    {
      key: "name",
      header: "المسار",
      sortable: true,
      primary: true,
      render: (t) =>
        canWrite ? (
          <InlineText
            label={`اسم المسار ${t.name}`}
            value={t.name}
            onSave={(name) => updateTrack(t.id, program.id, { name })}
          />
        ) : (
          t.name
        ),
    },
    {
      key: "description",
      header: "الوصف",
      render: (t) =>
        canWrite ? (
          <InlineText
            label={`وصف المسار ${t.name}`}
            value={t.description}
            allowEmpty
            maxInlineSize="22rem"
            onSave={(description) => updateTrack(t.id, program.id, { description })}
          />
        ) : (
          t.description || "—"
        ),
    },
    {
      key: "capacity",
      header: "السعة",
      align: "end",
      render: (t) =>
        canWrite ? (
          <InlineText
            label={`سعة المسار ${t.name} — فارغة لبلا سقف`}
            value={t.capacity === null ? "" : String(t.capacity)}
            allowEmpty
            latin
            maxInlineSize="6rem"
            onSave={(raw) =>
              updateTrack(t.id, program.id, { capacity: raw === "" ? null : Number(raw) })
            }
          />
        ) : t.capacity === null ? (
          "بلا سقف"
        ) : (
          formatNumber(t.capacity)
        ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "end" as const,
            render: (t: TrackRow) => (
              <Button
                pending={busy}
                onClick={() =>
                  startTransition(async () => reportAction(await archiveTrack(t.id, program.id)))
                }
              >
                أرشفة
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHead
        crumbs={[
          { href: "/programs", label: "البرامج" },
          { href: `/programs/${program.id}/content`, label: "ما يحفظه المشاركون" },
          { href: `/programs/${program.id}/plans`, label: "الخطط" },
          { href: `/programs/${program.id}/participants`, label: "المشاركون" },
        ]}
        title={program.name}
        lede="من هنا تُدير البرنامج كلّه: مساراته، ونشره، وما ينقصه قبل أن يُفتَح للناس."
      />

      <Readiness
        items={readinessItems}
        hrefOf={(fix) =>
          fix === "content"
            ? `/programs/${program.id}/content`
            : fix === "plans"
              ? `/programs/${program.id}/plans`
              : null
        }
      />

      {/* الإعداد السريع يظهر للفارغ وحده: زرٌّ يفتح شاشةً ترفض وعدٌ كاذب. */}
      {canWrite && emptyProgram ? (
        <Step
          n={0}
          title="ابدأ بالإعداد السريع"
          why="خمسة أسئلة تُنشئ المادة ونصيب المسارات وواجبات اليوم والخطة دفعة واحدة. وكلّها قابلة للتعديل بعدها — والتفصيل يبقى متاحاً لمن أراده."
          done={false}
          state={<span>البرنامج فارغ — والإعداد السريع أسرع طريق لتشغيله.</span>}
        >
          <Link href={`/programs/${program.id}/setup`}>
            <Button variant="primary">افتح الإعداد السريع</Button>
          </Link>
        </Step>
      ) : null}

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
          <StepForm title="بيانات البرنامج" action={editAction}>
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

      <Step
        n={1}
        title="المسارات"
        why="المسار مستوىً يختاره المسجِّل. ولكلٍّ نصيبه من المادة وخطته، فمن أراد مستوىً واحداً يكتفي بمسار واحد."
        done={tracks.length > 0}
        state={
          tracks.length === 0 ? (
            <span>لا مسارات — لن يجد المسجِّل ما يختاره.</span>
          ) : (
            <span>{formatNumber(tracks.length)} مساراً</span>
          )
        }
      >
        <DataTable
          columns={columns}
          rows={tracks}
          rowKey={(t) => t.id}
          total={tracks.length}
          page={1}
          searchPlaceholder="ابحث باسم المسار…"
          empty={{
            title: "لا مسارات بعد",
            body: canWrite ? "أضف أول مسار بالنموذج أدناه." : "لم تُضَف مسارات لهذا البرنامج.",
          }}
        />

        {canWrite ? (
          <StepForm title="أضِف مساراً" action={action}>
            <input type="hidden" name="programId" value={program.id} />

            <Field id="tname" label="اسم المسار" required error={state.fieldErrors?.["name"]}>
              <Input id="tname" name="name" required />
            </Field>

            <Field id="tdesc" label="الوصف">
              <Textarea id="tdesc" name="description" rows={2} />
            </Field>

            <Field
              id="tcap"
              label="سعة المسار"
              hint="اتركها فارغة لبلا سقف"
              error={state.fieldErrors?.["capacity"]}
            >
              <Input id="tcap" name="capacity" numeric latin />
            </Field>

            <Field id="tsort" label="الترتيب">
              <Input id="tsort" name="sortOrder" numeric latin defaultValue="0" />
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                أضِف
              </Button>
            </FormActions>
            <Messages state={state} />
          </StepForm>
        ) : null}
      </Step>
    </>
  );
}
