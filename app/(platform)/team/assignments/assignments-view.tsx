"use client";

import { Plus } from "lucide-react";
import { reportAction } from "@/components/shared/action-notice";
import { useActionState, useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ScreenActions } from "@/components/shared/screen-actions";
import { Messages, Step, StepForm, TabHead } from "@/components/shared/steps";
import { Button, Field, FormActions, Select } from "@/components/shared/form";
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


export function AssignmentsView({
  roles,
  assignments,
  people,
  programs,
  canAssign,
}: {
  roles: RoleRow[];
  assignments: AssignmentRow[];
  people: { userId: string; name: string }[];
  programs: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const [state, action, pending] = useActionState(assignRole, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();


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
                onClick={() => startTransition(async () => reportAction(await revokeRole(a.id)))}
              >
                سحب
              </Button>
            ),
          },
        ]
      : []),
  ];

  // مفتوحةٌ أوّلاً حين لا إسناد بعد — ولا أحد يملك شيئاً حتى يُسنَد.
  const [adding, setAdding] = useState(assignments.length === 0);

  return (
    <>
      {canAssign ? (
        <ScreenActions>
          <Button variant="primary" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <Plus size={16} aria-hidden />
            أسنِد دوراً
          </Button>
        </ScreenActions>
      ) : null}

      <TabHead
        title="إسناد الأدوار"
        lede="الدور بلا إسناد لا يفعل شيئاً. والإسناد على المنصة كلها، أو محصوراً ببرنامج واحد — فمنسّق برنامج لا يرى غيره."
      />

      <Step
        n={1}
        title="إسناد الأدوار"
        why="الدور بلا إسناد لا يفعل شيئاً. ولا تُسنِد ما لا تملكه أنت — المنصة تمنع تمرير صلاحية أوسع من صلاحيتك."
        done={assignments.length > 0}
        state={
          assignments.length === 0 ? (
            <span>لا إسنادات — لا أحد يملك شيئاً بعد.</span>
          ) : (
            <span>{formatNumber(assignments.length)} إسناداً</span>
          )
        }
      >
        {canAssign && adding ? (
          <StepForm title="أسنِد دوراً" action={action} state={state}>
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
            <Field
              id="scopeProgramId"
              label="النطاق"
              hint="برنامج واحد: يعمل صاحب الدور عليه وحده"
              error={state.fieldErrors?.["scopeProgramId"]}
            >
              <Select id="scopeProgramId" name="scopeProgramId" defaultValue="">
                <option value="">المنصة كلها</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                أسنِد
              </Button>
            </FormActions>
            <Messages state={state} />
          </StepForm>
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
      </Step>
    </>
  );
}
