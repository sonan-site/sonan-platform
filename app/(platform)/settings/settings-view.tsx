"use client";

import { useActionState } from "react";
import { Button, Field, FormActions, Input, Select, Textarea } from "@/components/shared/form";
import { Messages, Muted, PageHead, StepForm } from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { MAX_SLIDES, type Slide } from "@/lib/settings/showcase";
import { saveHomeFeatured, saveShowcase } from "./actions";

type ProgramOption = { slug: string; name: string; published: boolean };

export function SettingsView({
  slides,
  canWrite,
  featuredSlug,
  programs,
}: {
  slides: Slide[];
  canWrite: boolean;
  featuredSlug: string | null;
  programs: ProgramOption[];
}) {
  const [state, action, pending] = useActionState(saveShowcase, EMPTY_FORM_STATE);
  const [homeState, homeAction, homePending] = useActionState(saveHomeFeatured, EMPTY_FORM_STATE);
  const featured = programs.find((p) => p.slug === featuredSlug) ?? null;

  return (
    <>
      <PageHead
        crumbs={[{ href: "/dashboard", label: "لوحة المتابعة" }]}
        title="الإعدادات"
        lede="ما يراه الزائر قبل أن يدخل."
      />

      {canWrite ? (
        <StepForm title="واجهة الحملة في الصفحة الرئيسية" action={homeAction} state={homeState}>
          <Muted>
            تعرض الصفحة الرئيسية واجهة برنامجٍ واحد بدل قائمة البرامج، حتى تُعيدها هنا. وتظهر متى كان
            البرنامج منشوراً.
          </Muted>
          <Field id="slug" label="البرنامج" error={homeState.fieldErrors?.["slug"]}>
            <Select id="slug" name="slug" defaultValue={featuredSlug ?? ""}>
              <option value="">لا حملة — قائمة البرامج</option>
              {programs.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.published ? p.name : `${p.name} — مسوّدة`}
                </option>
              ))}
            </Select>
          </Field>
          {featured && !featured.published ? (
            <Muted>«{featured.name}» مسوّدة: تبقى الصفحة الرئيسية قائمةَ البرامج حتى يُنشر.</Muted>
          ) : null}
          <Messages state={homeState} />
          <FormActions>
            <Button type="submit" variant="primary" pending={homePending}>
              احفظ الواجهة
            </Button>
          </FormActions>
        </StepForm>
      ) : (
        <Muted>
          الصفحة الرئيسية: {featured ? `واجهة «${featured.name}»` : "قائمة البرامج"}.
        </Muted>
      )}

      {canWrite ? (
        <StepForm title="شرائح واجهة الدخول" action={action} state={state}>
          <Muted>
            تتبدّل في نصف شاشة الدخول على الحاسوب. حتى {MAX_SLIDES} شرائح، والشريحة الفارغة لا
            تظهر. وبلا شرائح يظهر ترحيبٌ باسم المنصة.
          </Muted>

          {Array.from({ length: MAX_SLIDES }, (_, i) => (
            <fieldset key={i} style={{ border: 0, padding: 0, margin: 0 }}>
              <Field id={`title-${i}`} label={`الشريحة ${i + 1} — العنوان`} error={state.fieldErrors?.[`title-${i}`]}>
                <Input
                  id={`title-${i}`}
                  name={`title-${i}`}
                  defaultValue={slides[i]?.title ?? ""}
                  maxLength={60}
                  invalid={Boolean(state.fieldErrors?.[`title-${i}`])}
                />
              </Field>
              <Field id={`body-${i}`} label="النصّ" hint="اختياري" error={state.fieldErrors?.[`body-${i}`]}>
                <Textarea
                  id={`body-${i}`}
                  name={`body-${i}`}
                  rows={2}
                  defaultValue={slides[i]?.body ?? ""}
                  maxLength={200}
                  invalid={Boolean(state.fieldErrors?.[`body-${i}`])}
                />
              </Field>
            </fieldset>
          ))}

          <Messages state={state} />
          <FormActions>
            <Button type="submit" variant="primary" pending={pending}>
              احفظ الشرائح
            </Button>
          </FormActions>
        </StepForm>
      ) : slides.length > 0 ? (
        <ul>
          {slides.map((s, i) => (
            <li key={i}>
              <strong>{s.title}</strong>
              {s.body ? ` — ${s.body}` : null}
            </li>
          ))}
        </ul>
      ) : (
        <Muted>لا شرائح — تظهر في شاشة الدخول تحيةٌ باسم المنصة.</Muted>
      )}
    </>
  );
}
