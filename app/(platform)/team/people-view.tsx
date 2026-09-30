"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { reportAction } from "@/components/shared/action-notice";
import { Modal } from "@/components/shared/modal";
import { ScreenActions } from "@/components/shared/screen-actions";
import { useActionState, useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Messages, Step, StepForm, TabHead } from "@/components/shared/steps";
import { formatNumber } from "@/lib/format";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth, formatRelative } from "@/lib/format";
import { inviteUser, restoreUser, suspendUser } from "./actions";

export type UserRow = {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  joinedAt: string;
  suspended: boolean;
  /** أسماء أدواره — الفارغة تعني أنه لا يملك شيئاً بعد. */
  roles: string[];
};

export type PendingInvite = { email: string; invitedAt: string };

export function PeopleView({
  rows,
  invites,
  canWrite,
}: {
  rows: UserRow[];
  /** دُعوا ولم يُفعّلوا حساباتهم — لا ملف لهم، فلا يظهرون في جدول الأعضاء. */
  invites: PendingInvite[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(inviteUser, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const [suspending, setSuspending] = useState<UserRow | null>(null);

  const columns: Column<UserRow>[] = [
    { key: "fullName", header: "الاسم", sortable: true, primary: true, render: (r) => r.fullName },
    { key: "phone", header: "الجوال", render: (r) => <span dir="ltr">{r.phone}</span> },
    {
      key: "roles",
      header: "الدور",
      render: (r) =>
        r.roles.length > 0 ? (
          r.roles.join(" · ")
        ) : (
          <Link href="/team/assignments">بلا دور — أسنِد</Link>
        ),
    },
    { key: "joinedAt", header: "منذ", render: (r) => formatDateBoth(r.joinedAt) },
    {
      key: "status",
      header: "الحالة",
      align: "center",
      render: (r) => (r.suspended ? "موقوف" : "نشط"),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "end" as const,
            render: (r: UserRow) => (
              <Button
                pending={busy}
                onClick={() =>
                  r.suspended
                    ? startTransition(async () => reportAction(await restoreUser(r.userId)))
                    : setSuspending(r)
                }
              >
                {r.suspended ? "إعادة تفعيل" : "إيقاف"}
              </Button>
            ),
          },
        ]
      : []),
  ];

  // مفتوحةٌ أوّلاً حين لا عضو بعد — الدعوة أوّل عملٍ في الشاشة.
  const [inviting, setInviting] = useState(rows.length === 0);

  return (
    <>
      {canWrite ? (
        <ScreenActions>
          <Button variant="primary" aria-expanded={inviting} onClick={() => setInviting(!inviting)}>
            <Plus size={16} aria-hidden />
            أرسِل دعوة
          </Button>
        </ScreenActions>
      ) : null}

      <TabHead
        title="الأعضاء"
        lede="من يعمل على المنصة بدورٍ مُسنَد. الدعوة تُرسِل بريداً يضبط فيه المدعوّ كلمة مروره، ثم يكتب بياناته — ولا يملك شيئاً حتى يُسنَد له دور. ومن أردت حذف حسابه اسحب دوره أولاً، ثم احذفه من «المشاركون في المنصة»."
      />

      {canWrite && inviting ? (
        <Step
          n={1}
          title="دعوة مستخدم"
          why="تُرسَل رسالة يضبط بها كلمته، ثم يكتب بياناته ويدخل. ولا يملك شيئاً حتى يُسنَد له دور — والدعوة وحدها لا تفتح باباً."
          done={rows.length > 0}
          state={
            rows.length === 0 ? (
              <span>لا مستخدمين بعد.</span>
            ) : (
              <span>{formatNumber(rows.length)} مستخدماً</span>
            )
          }
        >
          <StepForm title="أرسِل دعوة" action={action} state={state}>
            <Field id="fullName" label="الاسم" required error={state.fieldErrors?.["fullName"]}>
              <Input id="fullName" name="fullName" required />
            </Field>
            <Field id="email" label="البريد" required error={state.fieldErrors?.["email"]}>
              <Input id="email" name="email" type="email" latin required />
            </Field>
            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                أرسِل الدعوة
              </Button>
            </FormActions>
            <Messages state={state} />
          </StepForm>
        </Step>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={rows.length}
        page={1}
        searchPlaceholder="ابحث بالاسم…"
        empty={{
          title: "لا مستخدمين بعد",
          body: canWrite
            ? "ادعُ أول مستخدم من زرّ «أرسِل دعوة» في أعلى الشاشة."
            : "لم يُسجَّل أحد في المنصة بعد.",
        }}
      />
      {invites.length > 0 ? (
        <Step
          n={2}
          title="حسابات بلا ملفّ مكتمل"
          why="حسابٌ قائم بلا بيانات صاحبه: مدعوٌّ لم يفتح رسالته، أو داخلٌ بحساب Google لم يُكمل اسمه وجواله. ولا يظهر في جدول الأعضاء حتى يكتبها ويُسنَد له دور."
          done={false}
          state={<span>{formatNumber(invites.length)} حساباً</span>}
        >
          <ul style={{ fontSize: "var(--text-sm)", lineHeight: "var(--leading-relaxed)" }}>
            {invites.map((invite) => (
              <li key={invite.email}>
                <bdi dir="ltr">{invite.email}</bdi> — الحساب أُنشئ {formatRelative(invite.invitedAt)}
              </li>
            ))}
          </ul>
        </Step>
      ) : null}

      <Modal open={suspending !== null} title="إيقاف الحساب" onClose={() => setSuspending(null)}>
        <p>
          يُوقَف «{suspending?.fullName}»: تسقط صلاحياته في الحال، وتنقطع جلسته، ولا يدخل بعدها.
          وسجلّه يبقى، وتستطيع إعادة تفعيله متى شئت.
        </p>
        <FormActions>
          <Button onClick={() => setSuspending(null)}>إلغاء</Button>
          <Button
            variant="danger"
            pending={busy}
            onClick={() => {
              const row = suspending;
              if (!row) return;
              startTransition(async () => {
                reportAction(await suspendUser(row.userId));
                setSuspending(null);
              });
            }}
          >
            أوقِفه
          </Button>
        </FormActions>
      </Modal>

    </>
  );
}
