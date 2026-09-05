"use client";

import { useActionState } from "react";
import { Button, Field, FormActions, Input, Textarea } from "@/components/shared/form";
import { EmptyState } from "@/components/shared/states";
import { Messages, PageHead, Step } from "@/components/shared/steps";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { quickSetup } from "./actions";

/**
 * الإعداد السريع — خمسة أسئلة بدل أحد عشر مفهوماً.
 *
 * لا يُغني عن الشاشة التفصيلية ولا يُخفيها: هو **بداية معقولة** تُعدَّل
 * بعدها. ومن أراد مساراتٍ بأنصبة مختلفة أو أشكال أيام متعدّدة يبدأ منها.
 */
export function SetupView({
  programId,
  programName,
  tracks,
}: {
  programId: string;
  programName: string;
  tracks: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(quickSetup, EMPTY_FORM_STATE);

  return (
    <>
      <PageHead
        crumbs={[
          { href: "/programs", label: "البرامج" },
          { href: `/programs/${programId}`, label: programName },
        ]}
        title="إعداد سريع"
        lede="خمسة أسئلة، ثم يصير البرنامج جاهزاً: المادة، ونصيب كل مسار منها، وواجبات اليوم، والخطة. وكلّها قابلة للتعديل بعدها."
      />

      {tracks.length === 0 ? (
        <EmptyState
          kind="no-data"
          title="أضِف مساراً أولاً"
          body="الإعداد السريع يبني خطة لكل مسار — وبلا مسار لا شيء يُبنى عليه."
        />
      ) : (
        <form action={action}>
          <input type="hidden" name="programId" value={programId} />

          <Step
            n={1}
            title="المادة"
            why="القائمة المرقَّمة لكل ما يُحفظ. الصقها من ملفك — سطر لكل حديث أو متن."
            done={false}
            state={
              <span>
                ستُوزَّع كاملةً على {formatNumber(tracks.length)}{" "}
                {tracks.length === 1 ? "مسار" : "مسارات"}، والتفريق يُضبَط لاحقاً.
              </span>
            }
          >
            <Field id="lines" label="الصق المادة" required error={state.fieldErrors?.lines}>
              <Textarea id="lines" name="lines" rows={10} required />
            </Field>
          </Step>

          <Step
            n={2}
            title="واجبات اليوم"
            why="الثلاثة المعتادة، بمقاديرها اليومية. من لا يريد واجباً يضع صفراً، ومن أراد غيرها يُضيفه بعد الإعداد."
            done={false}
            state={<span>«حفظ» و«مراجعة» تمتدّان في المادة، و«تكرار» عدد مستقلّ.</span>}
          >
            <Field
              id="memorizeAmount"
              label="حفظ — كم وحدة يومياً"
              required
              error={state.fieldErrors?.memorizeAmount}
            >
              <Input
                id="memorizeAmount"
                name="memorizeAmount"
                type="number"
                min={1}
                defaultValue={2}
                required
                numeric
              />
            </Field>

            <Field
              id="reviewAmount"
              label="مراجعة — كم وحدة يومياً"
              hint="صفر = بلا مراجعة."
              error={state.fieldErrors?.reviewAmount}
            >
              <Input
                id="reviewAmount"
                name="reviewAmount"
                type="number"
                min={0}
                defaultValue={3}
                numeric
              />
            </Field>

            <Field
              id="repeatAmount"
              label="تكرار — كم مرة يومياً"
              hint="عدد مستقلّ لا يتقدّم في المادة. صفر = بلا تكرار."
              error={state.fieldErrors?.repeatAmount}
            >
              <Input
                id="repeatAmount"
                name="repeatAmount"
                type="number"
                min={0}
                defaultValue={15}
                numeric
              />
            </Field>
          </Step>

          <Step
            n={3}
            title="الخطة"
            why="عدد الأيام وإيقاع الراحة. والخطة بلا تاريخ — كل مشارك يبدأ من يومه الأول أياً كان انضمامه."
            done={false}
            state={<span>تُبنى خطة مستقلّة لكل مسار، وتُحرَّر بعدها يوماً يوماً.</span>}
          >
            <Field
              id="dayCount"
              label="مدّة الخطة بالأيام"
              required
              error={state.fieldErrors?.dayCount}
            >
              <Input
                id="dayCount"
                name="dayCount"
                type="number"
                min={1}
                max={366}
                defaultValue={30}
                required
                numeric
              />
            </Field>

            <Field
              id="restEvery"
              label="راحة كل كم يوم"
              hint="صفر = بلا راحة. والراحة بالترتيب لا بيوم الأسبوع."
              error={state.fieldErrors?.restEvery}
            >
              <Input
                id="restEvery"
                name="restEvery"
                type="number"
                min={0}
                max={366}
                defaultValue={7}
                numeric
              />
            </Field>

            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                أعِدّ البرنامج
              </Button>
            </FormActions>

            <Messages state={state} />
          </Step>
        </form>
      )}
    </>
  );
}
