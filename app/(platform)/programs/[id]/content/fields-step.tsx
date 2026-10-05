"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { ActionForm } from "@/components/shared/action-form";
import { Button, Field, FormActions, Input, Select } from "@/components/shared/form";
import { InlineText } from "@/components/shared/inline-edit";
import { Card, Cards, Chip, ChipButton, Chips, Messages, Step, StepForm } from "@/components/shared/steps";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { repetitionText, type FieldKind, type PlanField } from "@/lib/plans/engine";
import { addTaskField, removeTaskField, renameTaskField, updateTaskField } from "./actions";
import styles from "./content.module.css";

export const KIND_LABEL: Record<FieldKind, string> = {
  ranged: "تراكمي",
  explicit: "نطاق صريح",
  counted: "عددي",
};

const KIND_HINT: Record<FieldKind, string> = {
  ranged: "مقدارٌ لكل يوم، ويبدأ حيث انتهى أمس — للحفظ.",
  explicit: "«من» و«إلى» لكل يوم كما هو — للربط والمراجعة اللذين يعودان على ما سبق.",
  counted: "رقمٌ لكل يوم بوحدة عدّ، لا يشير إلى موضع في المادة.",
};

/**
 * الخطوة الثالثة: حقول الخطة (`adr/0037`) — كتالوج البرنامج تشترك فيه خططه.
 * لكل حقل نوعٌ من ثلاثة، وخصائص: أساس، ومقيَّد بالأساس، ومرتبط بالمادة، وإلزامي،
 * ووحدة عدّ للعددي، وتكرارٌ افتراضي تُعبّأ به الأيام.
 */
export function FieldsStep({ programId, fields }: { programId: string; fields: PlanField[] }) {
  const [state, action, pending] = useActionState(addTaskField, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const hasBase = fields.some((f) => f.isBase);

  return (
    <Step
      n={3}
      title="واجبات اليوم"
      why="ما يفعله المشارك كل يوم. لكل واجب نوعٌ من ثلاثة: تراكمي يتقدّم في المادة، ونطاقٌ صريح يعود على ما سبق، وعددي. والحفظ هو «الأساس» الذي يُقاس به التقدّم."
      done={fields.length > 0}
      state={
        fields.length === 0 ? (
          <span>لم تُسمَّ واجبات بعد.</span>
        ) : (
          <span>
            {formatNumber(fields.length)} واجبات{hasBase ? "" : " · بلا حقل أساس بعد"}
          </span>
        )
      }
    >
      <Cards>
        {fields.map((f) => (
          <Card
            key={f.id}
            name={
              <InlineText
                label={`اسم الواجب ${f.label}`}
                value={f.label}
                maxInlineSize="12rem"
                onSave={(next) => renameTaskField(f.id, programId, next)}
              />
            }
            meta={
              <ChipButton
                label={`حذف الواجب ${f.label}`}
                disabled={busy}
                onClick={() => startTransition(async () => reportAction(await removeTaskField(f.id, programId)))}
              >
                <Trash2 size={14} aria-hidden />
              </ChipButton>
            }
          >
            <Chips>
              <Chip>{KIND_LABEL[f.kind]}</Chip>
              {f.isBase ? <Chip>أساس</Chip> : null}
              {f.isConstrained ? <Chip>مقيَّد بالأساس</Chip> : null}
              {f.kind !== "counted" && !f.isMaterialLinked ? <Chip>أرقام مجرّدة</Chip> : null}
              <Chip>{f.isRequired ? "إلزامي" : "اختياري"}</Chip>
              {f.countUnit ? <Chip>بالـ{f.countUnit}</Chip> : null}
              {f.defaultRepetition ? <Chip>يُكرَّر {repetitionText(f.defaultRepetition)}</Chip> : null}
            </Chips>
            <EditField programId={programId} field={f} />
          </Card>
        ))}
      </Cards>

      <StepForm title="إضافة واجب" action={action} state={state}>
        <input type="hidden" name="programId" value={programId} />
        <PropsFields state={state} field={null} order={fields.length} hasBase={hasBase} />
        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            أضِف الواجب
          </Button>
        </FormActions>
        <Messages state={state} />
      </StepForm>
    </Step>
  );
}

function EditField({ programId, field }: { programId: string; field: PlanField }) {
  const [state, action, pending] = useActionState(updateTaskField, EMPTY_FORM_STATE);
  return (
    <details className={styles.edit}>
      <summary>تعديل الخصائص</summary>
      <ActionForm action={action} state={state} className={styles.editForm}>
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="fieldId" value={field.id} />
        <PropsFields state={state} field={field} order={field.sortOrder} hasBase={false} />
        <FormActions>
          <Button type="submit" pending={pending}>
            احفظ
          </Button>
        </FormActions>
        <Messages state={state} />
      </ActionForm>
    </details>
  );
}

/** حقول الخصائص — مشتركة بين الإضافة والتعديل. */
function PropsFields({
  state,
  field,
  order,
  hasBase,
}: {
  state: FormState;
  field: PlanField | null;
  order: number;
  /** في الإضافة: للبرنامج أساسٌ فلا يُقترح أساسٌ ثانٍ. */
  hasBase: boolean;
}) {
  const [kind, setKind] = useState<FieldKind>(field?.kind ?? "ranged");
  const id = (name: string) => `${field?.id ?? "new"}-${name}`;
  const err = state.fieldErrors ?? {};
  return (
    <>
      <Field id={id("label")} label="الاسم" required hint="كما يراه المشارك: حفظ · ربط · مراجعة · سرد." error={err.label}>
        <Input id={id("label")} name="label" defaultValue={field?.label ?? ""} required />
      </Field>
      <Field id={id("kind")} label="النوع" required hint={KIND_HINT[kind]} error={err.kind}>
        <Select id={id("kind")} name="kind" value={kind} onChange={(e) => setKind(e.target.value as FieldKind)}>
          <option value="ranged">تراكمي — مقدار يبدأ حيث انتهى أمس</option>
          <option value="explicit">نطاق صريح — «من» و«إلى» لكل يوم</option>
          <option value="counted">عددي — قيمة بوحدة عدّ</option>
        </Select>
      </Field>
      {kind === "counted" ? (
        <Field id={id("countUnit")} label="وحدة العدّ" required hint="مرة · صفحة · وجه" error={err.countUnit}>
          <Input id={id("countUnit")} name="countUnit" defaultValue={field?.countUnit ?? "مرة"} maxLength={20} />
        </Field>
      ) : null}
      <Field
        id={id("defaultRepetition")}
        label="التكرار الافتراضي"
        hint="اختياري. تُعبّأ به أيام الخطة، ويعدّه المشارك بالعدّاد قبل أن يُتمّ."
        error={err.defaultRepetition}
      >
        <Input
          id={id("defaultRepetition")}
          name="defaultRepetition"
          type="number"
          min={1}
          max={1000}
          numeric
          defaultValue={field?.defaultRepetition ?? ""}
        />
      </Field>
      <Field id={id("sortOrder")} label="ترتيب العرض" error={err.sortOrder}>
        <Input id={id("sortOrder")} name="sortOrder" type="number" min={0} numeric defaultValue={order} />
      </Field>
      <div className={styles.checks}>
        {kind !== "counted" ? (
          <label>
            <input type="checkbox" name="isMaterialLinked" defaultChecked={field?.isMaterialLinked ?? true} /> مرتبط بالمادة
          </label>
        ) : null}
        {kind === "ranged" ? (
          <label>
            <input type="checkbox" name="isBase" defaultChecked={field ? field.isBase : !hasBase} /> حقل أساس
          </label>
        ) : null}
        {kind === "explicit" ? (
          <label>
            <input type="checkbox" name="isConstrained" defaultChecked={field?.isConstrained ?? true} /> مقيَّد بالأساس
          </label>
        ) : null}
        <label>
          <input type="checkbox" name="isRequired" defaultChecked={field?.isRequired ?? true} /> إلزامي للإتمام
        </label>
        {err.isBase || err.isConstrained ? <p className={styles.fieldError}>{err.isBase ?? err.isConstrained}</p> : null}
      </div>
    </>
  );
}
