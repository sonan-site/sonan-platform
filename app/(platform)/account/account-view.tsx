"use client";

import Link from "next/link";
import { reportAction } from "@/components/shared/action-notice";
import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { PhoneField, ProfileFields, type ProfileValues } from "@/components/shared/profile-fields";
import { Card, Cards, Messages, Muted, PageHead, Step, StepForm } from "@/components/shared/steps";
import { Modal } from "@/components/shared/modal";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { PARTICIPANT_STATUS_LABEL, type ParticipantStatus } from "@/lib/programs/kinds";
import {
  changePassword,
  closeMyAccount,
  updateMyIdentity,
  updateMyProfile,
  withdrawParticipation,
} from "./actions";
import { PasswordInput } from "@/components/shared/password-input";

export type Participation = {
  id: string;
  programName: string;
  trackName: string | null;
  status: ParticipantStatus;
};

export type AvailableProgram = { id: string; name: string; summary: string; slug: string };

export function AccountView({
  email,
  profile,
  identity,
  hasPassword,
  hasGoogle,
  isStaff,
  participations,
  available,
}: {
  email: string;
  profile: ProfileValues;
  identity: { nationalId: string | null; guardianPhone: string | null };
  hasPassword: boolean;
  hasGoogle: boolean;
  isStaff: boolean;
  participations: Participation[];
  available: AvailableProgram[];
}) {
  const [profileState, profileAction, profilePending] = useActionState(updateMyProfile, EMPTY_FORM_STATE);
  const [pwState, pwAction, pwPending] = useActionState(changePassword, EMPTY_FORM_STATE);
  const [idState, idAction, idPending] = useActionState(updateMyIdentity, EMPTY_FORM_STATE);
  const [closeState, closeAction, closePending] = useActionState(closeMyAccount, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const [leaving, setLeaving] = useState<Participation | null>(null);

  const methods = [hasPassword ? "البريد وكلمة المرور" : null, hasGoogle ? "حساب Google" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHead
        crumbs={[{ href: "/dashboard", label: "لوحة المتابعة" }]}
        title="حسابي"
        lede="بياناتك، وكلمة مرورك، والبرامج التي سجّلت فيها والمتاحة للتسجيل."
      />

      {/* ══ ١ · بياناتي ══ */}
      <Step
        n={1}
        title="بياناتي"
        why="اسمك وجوالك وبياناتك كما تراها إدارة البرنامج. عدّل ما شئت ثم احفظ."
        done
        state={<span>{email}</span>}
      >
        <p>
          <Muted>طريقة الدخول: {methods || "—"}</Muted>
        </p>
        <StepForm title="بياناتي" action={profileAction} state={profileState}>
          <ProfileFields values={profile} errors={profileState.fieldErrors} />
          <FormActions>
            <Button type="submit" variant="primary" pending={profilePending}>
              احفظ
            </Button>
          </FormActions>
          <Messages state={profileState} />
        </StepForm>

        {/* هويتي (`adr/0047`) — تُشترط عند التسجيل في برنامجٍ يطلبها، ولا يراها كاملةً غير صاحبها. */}
        <StepForm title="هويتي" action={idAction} state={idState}>
          <Muted>
            تطلبها بعض البرامج عند التسجيل. لا يراها كاملةً غيرك، وإدارة البرنامج تراها مقنّعة.
          </Muted>
          <Field
            id="nationalId"
            label="رقم الهوية أو الإقامة"
            hint={identity.nationalId ? "مثبَّت — لتصحيحه تواصل مع إدارة البرنامج" : "عشرة أرقام يبدأ بـ1 أو 2"}
            error={idState.fieldErrors?.["nationalId"]}
          >
            <Input
              id="nationalId"
              name="nationalId"
              inputMode="numeric"
              maxLength={10}
              latin
              defaultValue={identity.nationalId ?? ""}
              readOnly={Boolean(identity.nationalId)}
              invalid={Boolean(idState.fieldErrors?.["nationalId"])}
            />
          </Field>
          <PhoneField
            id="guardianPhone"
            label="جوال وليّ الأمر"
            hint="مطلوبٌ لمن هم دون الثامنة عشرة"
            value={identity.guardianPhone}
            error={idState.fieldErrors?.["guardianPhone"]}
            countryName="guardianPhoneCountry"
          />
          <FormActions>
            <Button type="submit" variant="primary" pending={idPending}>
              احفظ الهوية
            </Button>
          </FormActions>
          <Messages state={idState} />
        </StepForm>
      </Step>

      {/* ══ ٢ · كلمة المرور ══ */}
      <Step
        n={2}
        title={hasPassword ? "تغيير كلمة المرور" : "إضافة كلمة مرور"}
        why={
          hasPassword
            ? "اكتب الحالية ثم الجديدة. لا تُغيَّر بالجلسة وحدها — فمن فتح جهازك لا يغيّرها."
            : "تدخل اليوم بحساب Google. أضف كلمة مرور لتستطيع الدخول ببريدك أيضاً."
        }
        done
        state={<span>{hasPassword ? "لحسابك كلمة مرور" : "بلا كلمة مرور"}</span>}
      >
        <StepForm title={hasPassword ? "كلمة مرور جديدة" : "كلمة المرور"} action={pwAction} state={pwState}>
          {hasPassword ? (
            <Field id="current" label="كلمة المرور الحالية" required error={pwState.fieldErrors?.["current"]}>
              <PasswordInput id="current" name="current" autoComplete="current-password" required />
            </Field>
          ) : null}
          <Field
            id="password"
            label="الجديدة"
            required
            hint="8 أحرف فأكثر"
            error={pwState.fieldErrors?.["password"]}
          >
            <PasswordInput id="password" name="password" autoComplete="new-password" required />
          </Field>
          <Field id="confirm" label="تأكيدها" required error={pwState.fieldErrors?.["confirm"]}>
            <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
          </Field>
          <FormActions>
            <Button type="submit" variant="primary" pending={pwPending}>
              احفظ
            </Button>
          </FormActions>
          <Messages state={pwState} />
        </StepForm>
      </Step>

      {/* ══ ٣ · برامجي ══ */}
      <Step
        n={3}
        title="برامجي ومساراتي"
        why="البرامج التي سجّلت فيها، ومسارك وحالتك في كلٍّ منها."
        done={participations.length > 0}
        state={
          participations.length === 0 ? (
            <span>لم تسجّل في برنامج.</span>
          ) : (
            <span>{formatNumber(participations.length)} برنامجاً</span>
          )
        }
      >
        {participations.length === 0 ? (
          <Muted>اختر من البرامج المتاحة أدناه.</Muted>
        ) : (
          <Cards>
            {participations.map((p) => (
              <Card key={p.id} name={p.programName} meta={PARTICIPANT_STATUS_LABEL[p.status]}>
                <Muted>المسار: {p.trackName ?? "لم يُحدَّد"}</Muted>
                <p>
                  <Link href={`/journey/${p.id}`}>افتح رحلتي</Link>
                </p>
                <Button pending={busy} onClick={() => setLeaving(p)}>
                  انسحب من البرنامج
                </Button>
              </Card>
            ))}
          </Cards>
        )}
      </Step>

      {/* ══ ٤ · البرامج المتاحة ══ */}
      <Step
        n={4}
        title="البرامج المتاحة"
        why="برامج التسجيل فيها مفتوح الآن، ولم تسجّل فيها."
        done={available.length > 0}
        state={
          available.length === 0 ? (
            <span>لا برامج مفتوحة الآن.</span>
          ) : (
            <span>{formatNumber(available.length)} برنامجاً</span>
          )
        }
      >
        {available.length === 0 ? (
          <Muted>تابع إعلانات الجمعية.</Muted>
        ) : (
          <Cards>
            {available.map((p) => (
              <Card key={p.id} name={p.name}>
                {p.summary ? <Muted>{p.summary}</Muted> : null}
                <p>
                  <Link href={`/p/${p.slug}`}>اعرف البرنامج وسجّل</Link>
                </p>
              </Card>
            ))}
          </Cards>
        )}
      </Step>

      {/* ══ ٥ · إغلاق الحساب ══ */}
      <Step
        n={5}
        title="إغلاق الحساب"
        why="تخرج من برامجك كلها، ولا تستطيع الدخول بعدها. سجلّك يبقى محفوظاً ولا يُمحى، وإعادة فتح الحساب من إدارة المنصة."
        done={false}
        state={<span>حسابك مفتوح</span>}
      >
        {isStaff ? (
          <Muted>لديك دور إداري في المنصة. اطلب سحب أدوارك أولاً، ثم تستطيع إغلاق حسابك.</Muted>
        ) : (
          <StepForm title="أغلق حسابي" action={closeAction} state={closeState}>
            <Field
              id="confirm-close"
              label="للتأكيد اكتب: أغلق حسابي"
              required
              error={closeState.fieldErrors?.["confirm"]}
            >
              <Input id="confirm-close" name="confirm" autoComplete="off" required />
            </Field>
            <FormActions>
              <Button type="submit" variant="danger" pending={closePending}>
                أغلق الحساب
              </Button>
            </FormActions>
            <Messages state={closeState} />
          </StepForm>
        )}
      </Step>
      <Modal open={leaving !== null} title="الانسحاب من البرنامج" onClose={() => setLeaving(null)}>
        <p>
          تخرج من «{leaving?.programName}» فلا يظهر لك واجبه اليومي بعد اليوم. وسجلّك يبقى محفوظاً،
          ومقعدك يتحرّر لغيرك. ولك أن تسجّل فيه من جديد ما دام التسجيل مفتوحاً.
        </p>
        <FormActions>
          <Button onClick={() => setLeaving(null)}>إلغاء</Button>
          <Button
            variant="danger"
            pending={busy}
            onClick={() => {
              const row = leaving;
              if (!row) return;
              startTransition(async () => {
                reportAction(await withdrawParticipation(row.id));
                setLeaving(null);
              });
            }}
          >
            انسحب
          </Button>
        </FormActions>
      </Modal>

    </>
  );
}
