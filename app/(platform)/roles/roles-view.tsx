"use client";

import { useActionState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Select } from "@/components/shared/form";
import { PERMISSIONS, type PermissionCode } from "@/config/permissions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { assignRole, revokeRole } from "./actions";

export type RoleRow = { id: string; name: string; isSystem: boolean; codes: string[] };
export type AssignmentRow = {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  scope: string;
};

export function RolesView({
  roles,
  assignments,
  people,
  canAssign,
}: {
  roles: RoleRow[];
  assignments: AssignmentRow[];
  people: { userId: string; name: string }[];
  canAssign: boolean;
}) {
  const [state, action, pending] = useActionState(assignRole, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();

  const roleColumns: Column<RoleRow>[] = [
    { key: "name", header: "الدور", sortable: true, primary: true, render: (r) => r.name },
    {
      key: "kind",
      header: "النوع",
      align: "center",
      render: (r) => (r.isSystem ? "دور نظام" : "دور مخصَّص"),
    },
    {
      key: "count",
      header: "عدد الصلاحيات",
      align: "end",
      sortable: true,
      render: (r) => formatNumber(r.codes.length),
    },
    {
      key: "codes",
      header: "الصلاحيات",
      render: (r) => (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          {r.codes
            .map((c) => PERMISSIONS[c as PermissionCode]?.label ?? c)
            .join(" · ")}
        </span>
      ),
    },
  ];

  const assignmentColumns: Column<AssignmentRow>[] = [
    { key: "user", header: "المستخدم", sortable: true, primary: true, render: (a) => a.userName },
    { key: "role", header: "الدور", sortable: true, render: (a) => a.roleName },
    { key: "scope", header: "النطاق", render: (a) => a.scope },
    ...(canAssign
      ? [
          {
            key: "actions",
            header: "",
            align: "end" as const,
            render: (a: AssignmentRow) => (
              <Button
                pending={busy}
                onClick={() => startTransition(async () => void (await revokeRole(a.id, a.userId)))}
              >
                سحب
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <h1>الأدوار والصلاحيات</h1>

      <DataTable
        columns={roleColumns}
        rows={roles}
        rowKey={(r) => r.id}
        total={roles.length}
        page={1}
        searchPlaceholder="ابحث باسم الدور…"
        empty={{ title: "لا أدوار", body: "لم يُنشأ دور بعد." }}
      />

      <h2 style={{ marginBlockStart: "var(--space-10)", fontSize: "var(--text-lg)" }}>
        الإسناد
      </h2>

      {canAssign ? (
        <section style={{ maxInlineSize: "34rem", marginBlockEnd: "var(--space-6)" }}>
          {state.error ? <p style={{ color: "var(--color-danger)" }}>{state.error}</p> : null}
          {state.notice ? <p style={{ color: "var(--color-success)" }}>{state.notice}</p> : null}

          <form action={action}>
            <Field id="userId" label="المستخدم" required>
              <Select id="userId" name="userId" required defaultValue="">
                <option value="" disabled>
                  اختر مستخدماً
                </option>
                {people.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="roleId" label="الدور" required>
              <Select id="roleId" name="roleId" required defaultValue="">
                <option value="" disabled>
                  اختر دوراً
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                إسناد
              </Button>
            </FormActions>
          </form>
        </section>
      ) : null}

      <DataTable
        columns={assignmentColumns}
        rows={assignments}
        rowKey={(a) => a.id}
        total={assignments.length}
        page={1}
        searchPlaceholder="ابحث بالمستخدم…"
        empty={{ title: "لا إسنادات", body: "لم يُسنَد دور لأحد بعد." }}
      />
    </>
  );
}
