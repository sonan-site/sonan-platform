"use client";

import { useActionState, useCallback, useSyncExternalStore } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { updateMyName } from "@/app/(platform)/account/actions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { now, toDateInput } from "@/lib/format";
import { ARABIC_NAME, type NameParts } from "@/lib/validation/profile";
import styles from "./arabic-name-prompt.module.css";

/**
 * نافذة «اكتب اسمك بالحروف العربية» (`adr/0062`) — لمن في اسمه جزءٌ بغيرها.
 *
 * **لا تُوقف شيئاً:** «ليس الآن» يؤجّلها إلى يوم الرياض التالي، والرصد يمضي. ويوم التأجيل في
 * المتصفح، وفي الذاكرة إن حُجب — فتعود مع تحميل الصفحة التالي، ولا تحبس من لا يُخزّن متصفحه.
 */

const KEY = "arabic-name-later";
/** قبل قراءة المتصفح لا يُعرف التأجيل — فلا تُفتح النافذة ثم تُغلق في لمحة. */
const UNKNOWN = "?";

const riyadhDay = () => toDateInput(now());

const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
/** يوم التأجيل في الذاكرة أيضاً — فإن حُجب التخزين أُغلقت النافذة حتى يُعاد تحميل الصفحة (المراجعة م١). */
let memLater = "";
function readLater(): string {
  try {
    return window.localStorage.getItem(KEY) || memLater;
  } catch {
    return memLater;
  }
}

const FIELDS: { key: keyof NameParts; label: string }[] = [
  { key: "firstName", label: "الاسم الأول" },
  { key: "fatherName", label: "اسم الأب" },
  { key: "grandfatherName", label: "اسم الجد" },
  { key: "familyName", label: "اسم العائلة" },
];

export function ArabicNamePrompt({ name }: { name: NameParts }) {
  const later = useSyncExternalStore(subscribe, readLater, () => UNKNOWN);
  const [state, action, pending] = useActionState(updateMyName, EMPTY_FORM_STATE);

  const postpone = useCallback(() => {
    memLater = riyadhDay();
    try {
      window.localStorage.setItem(KEY, memLater);
    } catch {
      // التخزين محجوب: تبقى مغلقةً بالذاكرة حتى يُعاد تحميل الصفحة.
    }
    for (const l of listeners) l();
  }, []);

  // بعد الحفظ تُعاد الجلسة فيختفي المكوّن كله؛ و`notice` يُغلقها إلى ذلك الحين.
  const open = later !== UNKNOWN && later !== riyadhDay() && !state.notice;

  return (
    <Modal open={open} title="اكتب اسمك بالحروف العربية" onClose={postpone}>
      <p className={styles.lede}>
        تُكتب الأسماء في المنصة بالحروف العربية. اكتب اسمك الرباعي كما يُنطق — أو أجّل إلى الغد.
      </p>
      <ActionForm action={action} state={state} className={styles.form}>
        {FIELDS.map((f) => {
          const now = name[f.key];
          const arabic = ARABIC_NAME.test(now);
          return (
            <Field
              key={f.key}
              id={`arabic-${f.key}`}
              label={f.label}
              required
              hint={now && !arabic ? `المحفوظ الآن: ${now}` : undefined}
              error={state.fieldErrors?.[f.key]}
            >
              <Input
                id={`arabic-${f.key}`}
                name={f.key}
                defaultValue={arabic ? now : ""}
                lang="ar"
                dir="rtl"
                invalid={Boolean(state.fieldErrors?.[f.key])}
                // لا إكمال تلقائي: المتصفح يقترح الاسم اللاتيني المحفوظ.
                autoComplete="off"
                required
              />
            </Field>
          );
        })}
        {state.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}
        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>
            احفظ اسمي
          </Button>
          <Button onClick={postpone} disabled={pending}>
            ليس الآن
          </Button>
        </FormActions>
      </ActionForm>
    </Modal>
  );
}
