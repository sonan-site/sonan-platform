"use client";

import { useActionState, useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth } from "@/lib/format";
import { inviteUser, restoreUser, suspendUser } from "./actions";

export type UserRow = {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  joinedAt: string;
  suspended: boolean;
};

export function UsersView({ rows, canWrite }: { rows: UserRow[]; canWrite: boolean }) {
  const [state, action, pending] = useActionState(inviteUser, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);

  const columns: Column<UserRow>[] = [
    { key: "fullName", header: "الاسم", sortable: true, primary: true, render: (r) => r.fullName },
    { key: "phone", header: "الجوال", render: (r) => <span dir="ltr">{r.phone}</span> },
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
                  startTransition(async () => {
                    await (r.suspended ? restoreUser(r.userId) : suspendUser(r.userId));
                  })
                }
              >
                {r.suspended ? "إعادة تفعيل" : "إيقاف"}
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <h1>المستخدمون</h1>

      {canWrite ? (
        <section style={{ marginBlockEnd: "var(--space-8)", maxInlineSize: "34rem" }}>
          <h2 style={{ fontSize: "var(--text-lg)" }}>دعوة مستخدم</h2>
          {state.error ? <p style={{ color: "var(--color-danger)" }}>{state.error}</p> : null}
          {state.notice ? <p style={{ color: "var(--color-success)" }}>{state.notice}</p> : null}

          <form action={action}>
            <Field id="fullName" label="الاسم" required error={state.fieldErrors?.["fullName"]}>
              <Input id="fullName" name="fullName" required />
            </Field>
            <Field id="email" label="البريد" required error={state.fieldErrors?.["email"]}>
              <Input id="email" name="email" type="email" latin required />
            </Field>
            <Field
              id="phone"
              label="الجوال"
              required
              hint="05xxxxxxxx"
              error={state.fieldErrors?.["phone"]}
            >
              <Input id="phone" name="phone" latin numeric required />
            </Field>
            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                إرسال الدعوة
              </Button>
            </FormActions>
          </form>
        </section>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={rows.length}
        page={1}
        searchPlaceholder="ابحث بالاسم…"
        selection={
          canWrite
            ? {
                selected,
                onChange: setSelected,
                allMatching,
                onSelectAllMatching: setAllMatching,
              }
            : undefined
        }
        empty={{
          title: "لا مستخدمين بعد",
          body: canWrite
            ? "ادعُ أول مستخدم بالنموذج أعلاه."
            : "لم يُسجَّل أحد في المنصة بعد.",
        }}
      />
    </>
  );
}
