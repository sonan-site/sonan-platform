"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { InlineNumber, InlineText } from "@/components/shared/inline-edit";
import { Modal } from "@/components/shared/modal";
import { Card, Cards, ChipButton, Messages, Muted, Step, StepForm } from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { GENERIC_FORMS, samples, sectionsTotal, unitText, type Material } from "@/lib/programs/material";
import {
  addContentUnits,
  addMaterialSections,
  moveMaterialSection,
  removeContentUnit,
  removeMaterialSection,
  renameMaterialSection,
  saveMaterialForms,
  setMaterialSectionCount,
  updateContentUnitLabel,
} from "./actions";
import styles from "./content.module.css";

export type UnitRow = { id: string; sequence: number; label: string | null; sectioned: boolean };

/**
 * الخطوة الأولى: المادة بأبوابها (`adr/0039`).
 *
 * **الأبواب بأحجامها تولّد الوحدات وأرقامها المتّصلة**، والنصّ لكل وحدة اختياري.
 * ومادةٌ بلا أبواب تعمل كما كانت: سطرٌ لكل وحدة.
 */
export function MaterialStep({
  programId,
  material,
  unsectioned,
  units,
  unitSummary,
  unitPage,
}: {
  programId: string;
  material: Material;
  /** وحدات بلا باب في مادة مقسّمة — بقيّة مادةٍ لُصقت قبل تقسيمها. */
  unsectioned: number;
  /** صفحة واحدة من المادة لا كلها — المادة قد تبلغ آلاف الوحدات. */
  units: UnitRow[];
  unitSummary: { count: number; first: number | null; last: number | null };
  unitPage: number;
}) {
  const [sectionState, sectionAction, sectionPending] = useActionState(addMaterialSections, EMPTY_FORM_STATE);
  const [formsState, formsAction, formsPending] = useActionState(saveMaterialForms, EMPTY_FORM_STATE);
  const [unitState, unitAction, unitPending] = useActionState(addContentUnits, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const [showUnits, setShowUnits] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string; count: number } | null>(null);

  const { sections, forms } = material;
  const sectioned = sections.length > 0;
  const total = sectionsTotal(sections);
  const nextNumber = (unitSummary.last ?? 0) + 1;
  const examples = useMemo(() => samples(material), [material]);

  const unitColumns: Column<UnitRow>[] = [
    {
      key: "sequence",
      header: "الرقم",
      align: "end",
      render: (u) => formatNumber(u.sequence),
    },
    ...(sectioned
      ? [
          {
            key: "place",
            header: "موضعه",
            render: (u: UnitRow) => unitText(material, u.sequence),
          } satisfies Column<UnitRow>,
        ]
      : []),
    {
      key: "label",
      header: sectioned ? "النصّ — اختياري" : "النصّ",
      primary: true,
      render: (u) => (
        <InlineText
          label={`نصّ الوحدة ${u.sequence}`}
          value={u.label ?? ""}
          maxInlineSize="28rem"
          allowEmpty
          onSave={(next) => updateContentUnitLabel(u.id, programId, next)}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      // وحدة الباب تتبع عدده: تُحذف بإنقاصه لا من هنا.
      render: (u) =>
        u.sectioned ? null : (
          <ChipButton
            label={`حذف الوحدة ${u.sequence}`}
            disabled={busy}
            onClick={() => startTransition(async () => reportAction(await removeContentUnit(u.id, programId)))}
          >
            <Trash2 size={14} aria-hidden />
          </ChipButton>
        ),
    },
  ];

  return (
    <Step
      n={1}
      title="المادة"
      why="أبواب المادة بأحجامها، ومنها تُرقَّم الوحدات ترقيماً متّصلاً يُبنى عليه كل شيء بعده. ونصّ كل وحدة اختياري."
      done={unitSummary.count > 0}
      state={
        unitSummary.count === 0 ? (
          <span>لم تُدخل المادة بعد.</span>
        ) : (
          <>
            <span>
              {sectioned ? `${formatNumber(sections.length)} أبواب · ` : null}
              {formatNumber(unitSummary.count)} وحدة · من {formatNumber(unitSummary.first ?? 0)} إلى{" "}
              {formatNumber(unitSummary.last ?? 0)}
            </span>
            <button type="button" className={styles.chipRemove} onClick={() => setShowUnits((v) => !v)}>
              {showUnits ? "أخفِ الوحدات" : "اعرض الوحدات"}
            </button>
          </>
        )
      }
    >
      {sectioned ? (
        <Cards>
          {sections.map((section, index) => (
            <Card
              key={section.id}
              name={
                <InlineText
                  label={`اسم الباب ${section.name}`}
                  value={section.name}
                  maxInlineSize="12rem"
                  onSave={(next) => renameMaterialSection(section.id, programId, next)}
                />
              }
              meta={
                <span className={styles.sectionActions}>
                  <ChipButton
                    label={`تقديم ${section.name}`}
                    disabled={busy || index === 0}
                    onClick={() =>
                      startTransition(async () => reportAction(await moveMaterialSection(section.id, programId, "up")))
                    }
                  >
                    <ChevronUp size={14} aria-hidden />
                  </ChipButton>
                  <ChipButton
                    label={`تأخير ${section.name}`}
                    disabled={busy || index === sections.length - 1}
                    onClick={() =>
                      startTransition(async () => reportAction(await moveMaterialSection(section.id, programId, "down")))
                    }
                  >
                    <ChevronDown size={14} aria-hidden />
                  </ChipButton>
                  <ChipButton
                    label={`حذف ${section.name}`}
                    disabled={busy}
                    onClick={() => setRemoving({ id: section.id, name: section.name, count: section.count })}
                  >
                    <Trash2 size={14} aria-hidden />
                  </ChipButton>
                </span>
              }
            >
              <div className={styles.sectionCount}>
                <span>عدد الوحدات</span>
                <InlineNumber
                  label={`عدد وحدات ${section.name}`}
                  value={section.count}
                  min={1}
                  step={1}
                  onSave={(next) => setMaterialSectionCount(section.id, programId, next)}
                />
              </div>
              <Muted>
                الأرقام المتّصلة {formatNumber(section.start)}–{formatNumber(section.start + section.count - 1)}
              </Muted>
            </Card>
          ))}
        </Cards>
      ) : unitSummary.count > 0 ? (
        <Muted>
          المادة بلا أبواب: {formatNumber(unitSummary.count)} وحدة مرقّمة. أضف أبوابها أدناه، فتضمّ الأبواب
          وحداتها القائمة بترتيبها ونصوصها.
        </Muted>
      ) : null}

      {sectioned && unsectioned > 0 ? (
        <p className={styles.warn}>
          {formatNumber(unsectioned)} وحدة بلا باب بعد آخر باب (الأرقام بعد {formatNumber(total)}). أضف باباً
          يضمّها، أو احذفها من قائمة الوحدات.
        </p>
      ) : null}

      {showUnits && unitSummary.count > 0 ? (
        <DataTable
          columns={unitColumns}
          rows={units}
          rowKey={(u) => u.id}
          total={unitSummary.count}
          page={unitPage}
          empty={{ title: "لا مادة", body: "أدخلها من النماذج أدناه." }}
        />
      ) : null}

      <StepForm title="إضافة أبواب" action={sectionAction} state={sectionState}>
        <input type="hidden" name="programId" value={programId} />
        <Field
          id="sectionLines"
          label="سطرٌ لكل باب: اسمه ثم عدد وحداته"
          required
          hint={`تُضاف في آخر المادة. مثال: «الإيمان 47» ثم «الطهارة 44» في السطر التالي.`}
          error={sectionState.fieldErrors?.lines}
          span="full"
        >
          <Textarea id="sectionLines" name="lines" rows={4} required />
        </Field>
        <FormActions>
          <Button type="submit" variant="primary" pending={sectionPending}>
            أضِف
          </Button>
        </FormActions>
        <Messages state={sectionState} />
      </StepForm>

      <StepForm title="صيغ العرض" action={formsAction} state={formsState}>
        <input type="hidden" name="programId" value={programId} />
        <p className={styles.formsWhy}>
          منها تُصاغ نطاقات المشارك: «من الحديث 46 من باب الإيمان إلى الحديث 2 من باب الطهارة (4 أحاديث)».
          والفارغ يُعرض بالصيغة العامة «{GENERIC_FORMS.singular}».
        </p>
        <Field id="sectionLabel" label="اسم القسم" hint="باب · سورة · فصل" error={formsState.fieldErrors?.sectionLabel}>
          <Input id="sectionLabel" name="sectionLabel" defaultValue={forms.sectionLabel ?? ""} maxLength={30} />
        </Field>
        <Field id="singular" label="الوحدة مفردةً" hint="الحديث" error={formsState.fieldErrors?.singular}>
          <Input id="singular" name="singular" defaultValue={forms.singular ?? ""} maxLength={30} />
        </Field>
        <Field id="one" label="مع 1" hint="حديث واحد" error={formsState.fieldErrors?.one}>
          <Input id="one" name="one" defaultValue={forms.one ?? ""} maxLength={30} />
        </Field>
        <Field id="two" label="مع 2" hint="حديثان" error={formsState.fieldErrors?.two}>
          <Input id="two" name="two" defaultValue={forms.two ?? ""} maxLength={30} />
        </Field>
        <Field id="few" label="مع 3 إلى 10" hint="أحاديث" error={formsState.fieldErrors?.few}>
          <Input id="few" name="few" defaultValue={forms.few ?? ""} maxLength={30} />
        </Field>
        <Field id="many" label="مع 11 فأكثر" hint="حديثاً" error={formsState.fieldErrors?.many}>
          <Input id="many" name="many" defaultValue={forms.many ?? ""} maxLength={30} />
        </Field>
        {examples.length > 0 ? (
          <div className={styles.samples}>
            <p className={styles.samplesTitle}>كما سيقرؤها المشارك:</p>
            <ul>
              {examples.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <FormActions>
          <Button type="submit" variant="primary" pending={formsPending}>
            احفظ الصيغ
          </Button>
        </FormActions>
        <Messages state={formsState} />
      </StepForm>

      <StepForm title={sectioned ? "نصوص الوحدات — اختياري" : "إضافة وحدات"} action={unitAction} state={unitState}>
        <input type="hidden" name="programId" value={programId} />
        <Field
          id="lines"
          label={sectioned ? "الصق النصوص — سطر لكل وحدة" : "الصق القائمة — سطر لكل عنصر"}
          required
          hint={
            sectioned
              ? "أول كلمات كل حديث مثلاً. تُكتب على الوحدات القائمة من رقم البداية، ولا تُنشئ وحدة."
              : "مثال: كل سطر أول كلمات الحديث أو اسم المتن."
          }
          error={unitState.fieldErrors?.lines}
          span="full"
        >
          <Textarea id="lines" name="lines" rows={6} required />
        </Field>

        <Field
          id="startAt"
          label="يبدأ من الرقم"
          hint={sectioned ? "الرقم المتّصل لأول سطر." : `التالي المتاح: ${formatNumber(nextNumber)}`}
          error={unitState.fieldErrors?.startAt}
        >
          <Input
            id="startAt"
            name="startAt"
            type="number"
            min={1}
            defaultValue={sectioned ? 1 : nextNumber}
            numeric
          />
        </Field>

        <FormActions>
          <Button type="submit" variant="primary" pending={unitPending}>
            {sectioned ? "احفظ النصوص" : "أضِف"}
          </Button>
        </FormActions>
        <Messages state={unitState} />
      </StepForm>

      <Modal open={removing !== null} title="حذف الباب" onClose={() => setRemoving(null)}>
        <p>
          يُحذف «{removing?.name}» بوحداته ({formatNumber(removing?.count ?? 0)}) ونصوصها، وتتقدّم أرقام الأبواب
          بعده. ويُرفض الحذف إن كانت وحدات تُزاح داخل نصيب مسار.
        </p>
        <FormActions>
          <Button
            variant="danger"
            pending={busy}
            onClick={() => {
              const target = removing;
              if (!target) return;
              setRemoving(null);
              startTransition(async () => reportAction(await removeMaterialSection(target.id, programId)));
            }}
          >
            احذف الباب
          </Button>
          <Button onClick={() => setRemoving(null)}>تراجع</Button>
        </FormActions>
      </Modal>
    </Step>
  );
}
