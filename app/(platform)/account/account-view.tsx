"use client";

import Link from "next/link";
import { reportAction } from "@/components/shared/action-notice";
import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { PhoneField, ProfileFields, type ProfileValues } from "@/components/shared/profile-fields";
import { Card, Cards, Messages, Muted, PageHead, Step, StepForm } from "@/components/shared/steps";
import { Modal } from "@/components/shared/modal";
import { SessionTools } from "@/components/shared/session-tools";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/auth/form-state";
import { formatDate, formatNumber } from "@/lib/format";
import { COUNTRIES, formatPhone } from "@/lib/profile/phone";
import { PARTICIPANT_STATUS_LABEL, type ParticipantStatus } from "@/lib/programs/kinds";
import {
  changePassword,
  closeMyAccount,
  updateMyIdentity,
  updateMyProfile,
  withdrawParticipation,
} from "./actions";
import { PasswordInput } from "@/components/shared/password-input";
import { ReadSection } from "./read-section";

type Section = "profile" | "identity" | "password";

const GENDER: Record<string, string> = { male: "ذكر", female: "أنثى" };
const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;

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
  home,
  participations,
  available,
}: {
  email: string;
  profile: ProfileValues;
  identity: { nationalId: string | null; guardianPhone: string | null };
  hasPassword: boolean;
  hasGoogle: boolean;
  isStaff: boolean;
  /** فتات الإدارة إلى «لوحة المتابعة» — والطالب بلا فتات: رجوعه في رأسه (ملاحظات الجوال ٢ · ٣). */
  home: { href: string; label: string } | null;
  participations: Participation[];
  available: AvailableProgram[];
}) {
  const [profileState, profileAction, profilePending] = useActionState(updateMyProfile, EMPTY_FORM_STATE);
  const [pwState, pwAction, pwPending] = useActionState(changePassword, EMPTY_FORM_STATE);
  const [idState, idAction, idPending] = useActionState(updateMyIdentity, EMPTY_FORM_STATE);
  const [closeState, closeAction, closePending] = useActionState(closeMyAccount, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  /**
   * القسم المفتوح للتعديل، وحالُ إجرائه لحظة فتحه. يبقى مفتوحاً ما لم يأتِ ردٌّ جديد، أو جاء
   * بخطأ (فيبقى ما كُتب)؛ ويُغلق بنجاحه في التصيير نفسه الذي يحمل القيم الجديدة — بلا تأثيرٍ
   * ولا ومضةٍ للقديم (مراجعة الخطة ٥). والإغلاق يُفكّ النموذج، فيعود بقيمه الحيّة عند فتحه.
   */
  const [open, setOpen] = useState<{ section: Section; at: FormState } | null>(null);
  const isOpen = (s: Section, st: FormState) =>
    open?.section === s && (st === open.at || Boolean(st.error) || Boolean(st.fieldErrors));
  const lastNotice = (s: Section, st: FormState) =>
    open?.section === s && st !== open.at && !isOpen(s, st) ? st.notice : undefined;
  // أخطاء محاولةٍ سابقة لا تعود حمراء عند إعادة الفتح — النموذج يبدأ نظيفاً (مراجعة التنفيذ ١).
  const fresh = (st: FormState): FormState => (st !== open?.at ? st : EMPTY_FORM_STATE);
  const saving = profilePending || idPending || pwPending;
  // التركيز يتبع القسم: إلى أول حقلٍ عند الفتح، وإلى زرّ القسم عند الإلغاء (مراجعة التنفيذ ٤).
  const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
  const edit = (section: Section, st: FormState, first: string) => {
    setOpen({ section, at: st });
    focusSoon(first);
  };
  const cancel = (section: Section) => {
    setOpen(null);
    focusSoon(`edit-${section}`);
  };
  const fullName = [profile.firstName, profile.fatherName, profile.grandfatherName, profile.familyName]
    .filter(Boolean)
    .join(" ");
  const [leaving, setLeaving] = useState<Participation | null>(null);

  const methods = [hasPassword ? "البريد وكلمة المرور" : null, hasGoogle ? "حساب Google" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHead
        crumbs={home ? [home] : []}
        title="حسابي"
        lede="بياناتك، وكلمة مرورك، والبرامج التي سجّلت فيها والمتاحة للتسجيل."
      />
      <SessionTools />

      {/* ══ ١ · بياناتي ══ */}
      <Step
        n={1}
        title="بياناتي"
        why="اسمك وجوالك وبياناتك كما تراها إدارة البرنامج."
        done
        state={<span>{email}</span>}
      >
        {/* `Muted` فقرةٌ بنفسها — ولفّها بفقرةٍ يُفسد التطابق بين الخادم والمتصفح. */}
        <Muted>طريقة الدخول: {methods || "—"}</Muted>
        {isOpen("profile", profileState) ? (
          <StepForm title="بياناتي" action={profileAction} state={profileState}>
            <ProfileFields values={profile} errors={fresh(profileState).fieldErrors} />
            <FormActions>
              <Button type="submit" variant="primary" pending={profilePending}>
                احفظ
              </Button>
              <Button onClick={() => cancel("profile")} disabled={profilePending}>
                إلغاء
              </Button>
            </FormActions>
            <Messages state={fresh(profileState)} />
          </StepForm>
        ) : (
          <ReadSection
            title="بياناتي"
            editId="edit-profile"
            disabled={saving}
            onEdit={() => edit("profile", profileState, "firstName")}
            notice={lastNotice("profile", profileState)}
            rows={[
              ["الاسم", fullName],
              ["الجنس", GENDER[profile.gender] ?? ""],
              ["تاريخ الميلاد", profile.birthDate ? formatDate(profile.birthDate) : ""],
              ["الجنسية", profile.nationality ? countryName(profile.nationality) : ""],
              ["الجوال", profile.phone ? <bdi dir="ltr">{formatPhone(profile.phone)}</bdi> : ""],
              ["جوال إضافي", profile.phoneSecondary ? <bdi dir="ltr">{formatPhone(profile.phoneSecondary)}</bdi> : ""],
            ]}
          />
        )}

        {/* هويتي (`adr/0047`) — تُشترط عند التسجيل في برنامجٍ يطلبها، ولا يراها كاملةً غير صاحبها. */}
        {isOpen("identity", idState) ? (
        <StepForm title="هويتي" action={idAction} state={idState}>
          <Muted>
            تطلبها بعض البرامج عند التسجيل. لا يراها كاملةً غيرك، وإدارة البرنامج تراها مقنّعة.
          </Muted>
          <Field
            id="nationalId"
            label="رقم الهوية أو الإقامة"
            hint={identity.nationalId ? "مثبَّت — لتصحيحه تواصل مع إدارة البرنامج" : "عشرة أرقام يبدأ بـ1 أو 2"}
            error={fresh(idState).fieldErrors?.["nationalId"]}
          >
            <Input
              id="nationalId"
              name="nationalId"
              inputMode="numeric"
              maxLength={10}
              latin
              defaultValue={identity.nationalId ?? ""}
              readOnly={Boolean(identity.nationalId)}
              invalid={Boolean(fresh(idState).fieldErrors?.["nationalId"])}
            />
          </Field>
          <PhoneField
            id="guardianPhone"
            label="جوال وليّ الأمر"
            hint="مطلوبٌ لمن هم دون الثامنة عشرة"
            value={identity.guardianPhone}
            error={fresh(idState).fieldErrors?.["guardianPhone"]}
            countryName="guardianPhoneCountry"
          />
          <FormActions>
            <Button type="submit" variant="primary" pending={idPending}>
              احفظ الهوية
            </Button>
            <Button onClick={() => cancel("identity")} disabled={idPending}>
              إلغاء
            </Button>
          </FormActions>
          <Messages state={fresh(idState)} />
        </StepForm>
        ) : (
          <ReadSection
            title="هويتي"
            editId="edit-identity"
            disabled={saving}
            onEdit={() => edit("identity", idState, identity.nationalId ? "guardianPhone" : "nationalId")}
            notice={lastNotice("identity", idState)}
            rows={[
              // كاملاً لصاحبه وحده — والإدارة تراه مقنّعاً (`adr/0047`).
              ["رقم الهوية أو الإقامة", identity.nationalId ? <bdi dir="ltr">{identity.nationalId}</bdi> : ""],
              ["جوال وليّ الأمر", identity.guardianPhone ? <bdi dir="ltr">{formatPhone(identity.guardianPhone)}</bdi> : ""],
            ]}
          >
            {identity.nationalId ? <Muted>الرقم مثبَّت — لتصحيحه تواصل مع إدارة البرنامج.</Muted> : null}
          </ReadSection>
        )}
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
        {isOpen("password", pwState) ? (
        <StepForm title={hasPassword ? "كلمة مرور جديدة" : "كلمة المرور"} action={pwAction} state={pwState}>
          {hasPassword ? (
            <Field id="current" label="كلمة المرور الحالية" required error={fresh(pwState).fieldErrors?.["current"]}>
              <PasswordInput id="current" name="current" autoComplete="current-password" required />
            </Field>
          ) : null}
          <Field
            id="password"
            label="الجديدة"
            required
            hint="8 أحرف فأكثر"
            error={fresh(pwState).fieldErrors?.["password"]}
          >
            <PasswordInput id="password" name="password" autoComplete="new-password" required />
          </Field>
          <Field id="confirm" label="تأكيدها" required error={fresh(pwState).fieldErrors?.["confirm"]}>
            <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
          </Field>
          <FormActions>
            <Button type="submit" variant="primary" pending={pwPending}>
              احفظ
            </Button>
            <Button onClick={() => cancel("password")} disabled={pwPending}>
              إلغاء
            </Button>
          </FormActions>
          <Messages state={fresh(pwState)} />
        </StepForm>
        ) : (
          <ReadSection
            title="كلمة المرور"
            editLabel={hasPassword ? "تغيير" : "إضافة"}
            editId="edit-password"
            disabled={saving}
            onEdit={() => edit("password", pwState, hasPassword ? "current" : "password")}
            notice={lastNotice("password", pwState)}
            rows={[["الحال", hasPassword ? "لحسابك كلمة مرور" : "بلا كلمة مرور — تدخل بـ Google"]]}
          />
        )}
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
