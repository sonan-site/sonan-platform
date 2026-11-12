"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { PhoneField, ProfileFields, type ProfileValues } from "@/components/shared/profile-fields";
import { Messages, Muted, PageHead, Step, StepForm } from "@/components/shared/steps";
import type { FieldChange } from "@/lib/accounts/field-changes";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateTime } from "@/lib/format";
import { updateAccountIdentity, updateAccountProfile, type EditState } from "./actions";
import styles from "./account-edit.module.css";

export type HistoryRow = {
  id: string;
  at: string;
  actor: string;
  byAdmin: boolean;
  changes: FieldChange[];
  outOfTrack: boolean;
  outOfGender: boolean;
};

const STATUS: Record<"active" | "suspended" | "bin", string> = {
  active: "نشط",
  suspended: "موقوف",
  bin: "في سلّة المحذوفات — يُستعاد أولاً ثم يُعدَّل",
};

export function AccountEditView({
  userId,
  fullName,
  email,
  status,
  seenUpdatedAt,
  profile,
  identity,
  canEditIdentity,
  canIssueTempPassword,
  history,
  historyError,
}: {
  userId: string;
  fullName: string;
  /** بريد الدخول للقراءة — تعديله يغيّر باب الدخول، فليس هنا. `null`: تعذّر جلبه. */
  email: string | null;
  status: "active" | "suspended" | "bin";
  /** لحظة قراءة الملف — يُرفض الحفظ إن تغيّر بعدها (تعديلٌ متزامن من صاحبه). */
  seenUpdatedAt: string;
  profile: ProfileValues;
  /** الرقم مقنّعاً أو كاملاً بحسب `identities.read` (`fn_identity_masked`). */
  identity: { nationalId: string | null; isFull: boolean; guardianPhone: string | null };
  canEditIdentity: boolean;
  canIssueTempPassword: boolean;
  /** `null` لمن لا يقرأ السجلّ. */
  history: HistoryRow[] | null;
  historyError: boolean;
}) {
  const [profileState, profileAction, profilePending] = useActionState<EditState, FormData>(
    updateAccountProfile.bind(null, userId, seenUpdatedAt),
    EMPTY_FORM_STATE,
  );
  const [idState, idAction, idPending] = useActionState(updateAccountIdentity.bind(null, userId), EMPTY_FORM_STATE);
  const binned = status === "bin";

  return (
    <>
      <PageHead
        crumbs={[
          { href: "/dashboard", label: "لوحة المتابعة" },
          { href: "/participants", label: "المشاركون في المنصة" },
        ]}
        title={fullName || "حسابٌ بلا اسم"}
        lede="تعديل الإدارة لبيانات هذا الحساب. كل تعديلٍ يُسجَّل، ويصل صاحبَه إشعارٌ بأسماء ما عُدِّل."
      />
      <p>
        بريد الدخول: <span dir="ltr">{email ?? "تعذّر جلبه"}</span>
      </p>
      {canIssueTempPassword && !binned ? (
        <p>
          <Link href={`/participants/${userId}/password`}>لا يصل حسابه؟ أصدر له كلمة مرور مؤقتة ←</Link>
        </p>
      ) : null}

      <Step n={1} title="البيانات" why="الاسم والجنس والميلاد والجنسية والجوالان — كما يراها في «حسابي»." done={!binned} state={<span>{STATUS[status]}</span>}>
        {binned ? (
          <Muted>الحساب في سلّة المحذوفات — استعِده من «المشاركون في المنصة» ثم عدّل بياناته.</Muted>
        ) : (
          <StepForm title="البيانات" action={profileAction} state={profileState}>
            <ProfileFields values={profile} errors={profileState.fieldErrors} />
            {profileState.confirm ? (
              <div className={styles.confirm} role="alert">
                <p>بهذا التعديل يخرج عن شرط مشاركته: {profileState.confirm}.</p>
                <p>لا يُنقل من مساره تلقائياً — النقل قرارٌ منفصل.</p>
              </div>
            ) : null}
            {/* الأساسي أولاً: Enter في خانةٍ يُرسل بأول زرّ، فلا يؤكّد التنبيه بلا قصد. */}
            <FormActions>
              <Button type="submit" variant="primary" pending={profilePending}>
                احفظ البيانات
              </Button>
              {profileState.confirm ? (
                <Button type="submit" name="confirmed" value={profileState.confirm} variant="danger" pending={profilePending}>
                  احفظ رغم ذلك
                </Button>
              ) : null}
            </FormActions>
            <Messages state={profileState} />
          </StepForm>
        )}
      </Step>

      <Step
        n={2}
        title="الهوية"
        why="رقم الوثيقة وجوال وليّ الأمر. الرقم لا يُمحى من هنا: يُترك فارغاً فيبقى كما هو."
        done={Boolean(identity.nationalId)}
        state={
          <span>
            {identity.nationalId ? <bdi dir="ltr">{identity.nationalId}</bdi> : "بلا رقم وثيقة"}
            {identity.nationalId && !identity.isFull ? " (مقنّع)" : null}
          </span>
        }
      >
        {!canEditIdentity ? (
          <Muted>تصحيح الهوية لحامل صلاحية «تصحيح أرقام الهويات» وحده.</Muted>
        ) : binned ? (
          <Muted>الحساب في سلّة المحذوفات — يُستعاد أولاً.</Muted>
        ) : (
          <StepForm title="الهوية" action={idAction} state={idState}>
            <Field
              id="nationalId"
              label="رقم الوثيقة الجديد"
              hint={identity.nationalId ? "اتركه فارغاً ليبقى الرقم الحالي" : "رقم الهوية أو الإقامة أو الجواز كما هو فيها"}
              error={idState.fieldErrors?.["nationalId"]}
            >
              <Input
                id="nationalId"
                name="nationalId"
                autoCapitalize="characters"
                maxLength={30}
                latin
                autoComplete="off"
                invalid={Boolean(idState.fieldErrors?.["nationalId"])}
              />
            </Field>
            <PhoneField
              id="guardianPhone"
              label="جوال وليّ الأمر"
              hint="فارغاً يُفرَّغ"
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
        )}
      </Step>

      {history === null ? null : (
        <Step
          n={3}
          title="سجلّ تعديلات هذا الحساب"
          why="ما تغيّر في بياناته بعد استكمالها — بيد صاحبه أو بيد الإدارة. وآخر خمسين تعديلاً."
          done={history.length > 0}
          state={<span>{historyError ? "تعذّر جلب السجلّ" : history.length ? `${history.length} تعديل` : "لا تعديل بعد"}</span>}
        >
          {history.length === 0 ? null : (
            <ol className={styles.history}>
              {history.map((h) => (
                <li key={h.id}>
                  <p className={styles.historyHead}>
                    {formatDateTime(h.at)} · {h.byAdmin ? `بيد الإدارة (${h.actor})` : "بيد صاحبه"}
                    {h.outOfTrack ? <span className={styles.flag}> · صار خارج سنّ مساره</span> : null}
                    {h.outOfGender ? <span className={styles.flag}> · صار خارج شرط الجنس في برنامجه</span> : null}
                  </p>
                  <ul>
                    {h.changes.map((c) => (
                      <li key={c.label}>
                        {c.label}
                        {c.from !== null && c.to !== null ? (
                          <>
                            : <bdi>{c.from}</bdi> ← <bdi>{c.to}</bdi>
                          </>
                        ) : c.label === "رقم الوثيقة" ? (
                          " — تغيّر (لا يُحفظ الرقم في السجلّ)"
                        ) : (
                          " — مُحيت قيمته مع الحساب"
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Step>
      )}
    </>
  );
}
