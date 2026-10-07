"use client";

import { Field, Input, Select, Textarea } from "@/components/shared/form";
import styles from "@/components/shared/form.module.css";
import type { FormState } from "@/lib/auth/form-state";
import { BLOCK_ROWS, type BlockType } from "@/lib/programs/blocks";
import { formatNumber } from "@/lib/format";

/**
 * حقول محتوى العنصر — **واحدةٌ للإضافة والتعديل**.
 *
 * كانت الحقول مكتوبةً في نموذج الإضافة وحده ولا تعديل في المنصة أصلاً. ومشاركتها
 * هنا تمنع أن يفترق النموذجان بحقلٍ ينساه أحدهما — وهو ما يقع حتماً مع ثلاثة
 * عشر نوعاً.
 *
 * **والقوائم صفوفٌ ثابتة العدد** يُسقَط فارغها عند الحفظ (`lib/programs/block-input.ts`)،
 * فلا أزرار «أضِف صفّاً» تُدار بحالة، ولا نموذجٌ يفقد ما كُتب فيه حين يفشل الحفظ.
 */

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function list(values: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const raw = values[key];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

function strings(values: Record<string, unknown>, key: string): string[] {
  const raw = values[key];
  return Array.isArray(raw) ? raw.map((v) => (typeof v === "string" ? v : "")) : [];
}

/** تلميح العناصر التي تُملأ من بيانات البرنامج نفسه. */
const HINT: Partial<Record<BlockType, string>> = {
  tracks: "تُعرض مسارات البرنامج كما أدخلتها",
  faq: "تُعرض الأسئلة الشائعة المنشورة في تبويبها",
  registration: "يُفتح الزر حين يكون التسجيل مفتوحاً",
  countdown: "يعدّ إلى موعد إغلاق التسجيل في بيانات البرنامج",
};

export function BlockFields({
  scope,
  type,
  values,
  state,
  tracks = [],
}: {
  /** «إضافة» أو «تعديل» — النموذجان مُركَّبان معاً، فالمعرّف بالنوع وحده يتكرّر. */
  scope: string;
  type: BlockType;
  values: Record<string, unknown>;
  state: FormState;
  /** مسارات البرنامج — لربط الجوائز بمسارها. */
  tracks?: { id: string; name: string }[];
}) {
  const id = (name: string) => `${scope}-${type}-${name}`;
  const err = (name: string) => state.fieldErrors?.[name];

  const heading = (label = "العنوان", hint?: string) => (
    <Field id={id("heading")} label={label} hint={hint}>
      <Input id={id("heading")} name="heading" defaultValue={text(values["heading"])} />
    </Field>
  );

  switch (type) {
    case "header":
      return (
        <>
          <Field id={id("title")} label="العنوان" required error={err("title")}>
            <Input id={id("title")} name="title" defaultValue={text(values["title"])} required />
          </Field>
          <Field id={id("subtitle")} label="النبذة">
            <Input id={id("subtitle")} name="subtitle" defaultValue={text(values["subtitle"])} />
          </Field>
        </>
      );

    case "hero":
      return (
        <>
          <Field id={id("title")} label="العنوان" required error={err("title")} span="full">
            <Input id={id("title")} name="title" defaultValue={text(values["title"])} required />
          </Field>
          <Field id={id("subtitle")} label="الوصف" span="full">
            <Textarea
              id={id("subtitle")}
              name="subtitle"
              rows={3}
              defaultValue={text(values["subtitle"])}
            />
          </Field>
          <Field id={id("primaryLabel")} label="الزر الأول" hint="اتركه فارغاً لبلا زر">
            <Input
              id={id("primaryLabel")}
              name="primaryLabel"
              defaultValue={text(values["primaryLabel"])}
            />
          </Field>
          <Field id={id("primaryHref")} label="وجهة الزر الأول" hint="رابط أو مرساة مثل ‎#tracks">
            <Input
              id={id("primaryHref")}
              name="primaryHref"
              latin
              defaultValue={text(values["primaryHref"])}
            />
          </Field>
          <Field id={id("secondaryLabel")} label="الزر الثاني">
            <Input
              id={id("secondaryLabel")}
              name="secondaryLabel"
              defaultValue={text(values["secondaryLabel"])}
            />
          </Field>
          <Field id={id("secondaryHref")} label="وجهة الزر الثاني">
            <Input
              id={id("secondaryHref")}
              name="secondaryHref"
              latin
              defaultValue={text(values["secondaryHref"])}
            />
          </Field>
        </>
      );

    case "free_text":
      return (
        <>
          {heading("عنوان الفقرة")}
          <Field id={id("text")} label="النص" required error={err("text")} span="full">
            <Textarea
              id={id("text")}
              name="text"
              rows={5}
              defaultValue={text(values["text"])}
              required
            />
          </Field>
        </>
      );

    case "countdown":
      return (
        <>
          {heading("العنوان", "يعدّ إلى موعد إغلاق التسجيل في بيانات البرنامج")}
          <Field id={id("endedText")} label="نصّ ما بعد الإغلاق">
            <Input
              id={id("endedText")}
              name="endedText"
              defaultValue={text(values["endedText"])}
            />
          </Field>
        </>
      );

    case "stats": {
      const items = list(values, "items");
      return (
        <>
          {heading("العنوان", "اختياري")}
          {Array.from({ length: BLOCK_ROWS.stats }, (_, i) => (
            <Field key={i} id={id(`stat-${i}`)} label={`الرقم ${formatNumber(i + 1)}`}>
              <span className={styles.inline}>
                <Input
                  id={id(`stat-${i}`)}
                  name={`stat-${i}-value`}
                  placeholder="٥"
                  defaultValue={text(items[i]?.["value"])}
                />
                <Input
                  name={`stat-${i}-label`}
                  aria-label={`تسمية الرقم ${formatNumber(i + 1)}`}
                  placeholder="مسارات"
                  defaultValue={text(items[i]?.["label"])}
                />
              </span>
            </Field>
          ))}
        </>
      );
    }

    case "timeline": {
      const stages = list(values, "stages");
      return (
        <>
          {heading()}
          <Field
            id={id("source")}
            label="المصدر"
            hint="مواعيد البرنامج تُعرض بتواريخها الحقيقية هجرياً وميلادياً، وتُدار من تبويب التقويم"
            span="full"
          >
            <Select id={id("source")} name="source" defaultValue={text(values["source"]) || "manual"}>
              <option value="manual">مراحل تُكتب هنا</option>
              <option value="schedule">مواعيد البرنامج</option>
            </Select>
          </Field>
          {Array.from({ length: BLOCK_ROWS.timeline }, (_, i) => (
            <Field
              key={i}
              id={id(`stage-${i}`)}
              label={`المرحلة ${formatNumber(i + 1)}`}
              span="full"
            >
              <span className={styles.inline}>
                <Input
                  id={id(`stage-${i}`)}
                  name={`stage-${i}-title`}
                  placeholder="التسجيل"
                  defaultValue={text(stages[i]?.["title"])}
                />
                <Input
                  name={`stage-${i}-dates`}
                  aria-label={`تاريخ المرحلة ${formatNumber(i + 1)}`}
                  placeholder="٩ – ١٧ ربيع الآخر"
                  defaultValue={text(stages[i]?.["dates"])}
                />
                <Input
                  name={`stage-${i}-note`}
                  aria-label={`شرح المرحلة ${formatNumber(i + 1)}`}
                  placeholder="أو حتى اكتمال المقاعد"
                  defaultValue={text(stages[i]?.["note"])}
                />
              </span>
            </Field>
          ))}
        </>
      );
    }

    case "tracks":
      return (
        <>
          {heading("العنوان", HINT.tracks)}
          <Field id={id("showCapacity")} label="اعرض المقاعد" hint="المتبقي من سعة كل مسار">
            <input
              id={id("showCapacity")}
              name="showCapacity"
              type="checkbox"
              defaultChecked={values["showCapacity"] === true}
            />
          </Field>
          <Field id={id("showUnits")} label="اعرض عدد الوحدات" hint="نصيب المسار من المادة">
            <input
              id={id("showUnits")}
              name="showUnits"
              type="checkbox"
              defaultChecked={values["showUnits"] === true}
            />
          </Field>
        </>
      );

    case "prizes": {
      const places = list(values, "places");
      return (
        <>
          {heading()}
          <Field id={id("trackId")} label="المسار" hint="جوائز مسارٍ بعينه، أو عامة للبرنامج">
            <Select id={id("trackId")} name="trackId" defaultValue={text(values["trackId"])}>
              <option value="">عامة</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          {Array.from({ length: BLOCK_ROWS.prizes }, (_, i) => (
            <Field key={i} id={id(`place-${i}`)} label={`المركز ${formatNumber(i + 1)}`}>
              <span className={styles.inline}>
                <Input
                  id={id(`place-${i}`)}
                  name={`place-${i}-label`}
                  placeholder="المركز الأول"
                  defaultValue={text(places[i]?.["label"])}
                />
                <Input
                  name={`place-${i}-value`}
                  aria-label={`جائزة المركز ${formatNumber(i + 1)}`}
                  placeholder="١٠٠٠"
                  defaultValue={text(places[i]?.["value"])}
                />
              </span>
            </Field>
          ))}
          <Field id={id("note")} label="شرط الاستحقاق" span="full">
            <Textarea id={id("note")} name="note" rows={2} defaultValue={text(values["note"])} />
          </Field>
        </>
      );
    }

    case "terms": {
      const items = strings(values, "items");
      return (
        <>
          {heading()}
          {Array.from({ length: BLOCK_ROWS.terms }, (_, i) => (
            <Field key={i} id={id(`term-${i}`)} label={`الشرط ${formatNumber(i + 1)}`} span="full">
              <Input id={id(`term-${i}`)} name={`term-${i}`} defaultValue={items[i] ?? ""} />
            </Field>
          ))}
        </>
      );
    }

    case "registration":
      return (
        <>
          {heading("العنوان", HINT.registration)}
          <Field id={id("buttonLabel")} label="نصّ الزر">
            <Input
              id={id("buttonLabel")}
              name="buttonLabel"
              defaultValue={text(values["buttonLabel"]) || "سجّل في البرنامج"}
            />
          </Field>
        </>
      );

    case "faq":
      return heading("العنوان", HINT.faq);

    case "cta":
      return (
        <>
          {heading("العنوان")}
          <Field id={id("text")} label="النص" required error={err("text")} span="full">
            <Textarea
              id={id("text")}
              name="text"
              rows={3}
              defaultValue={text(values["text"])}
              required
            />
          </Field>
          <Field id={id("buttonLabel")} label="نصّ الزر" hint="اتركه فارغاً لبلا زر">
            <Input
              id={id("buttonLabel")}
              name="buttonLabel"
              defaultValue={text(values["buttonLabel"])}
            />
          </Field>
          <Field id={id("buttonHref")} label="وجهة الزر">
            <Input
              id={id("buttonHref")}
              name="buttonHref"
              latin
              defaultValue={text(values["buttonHref"])}
            />
          </Field>
        </>
      );

    case "image":
      return (
        <Field id={id("alt")} label="وصف الصورة">
          <Input id={id("alt")} name="alt" defaultValue={text(values["alt"])} />
        </Field>
      );
  }
}
