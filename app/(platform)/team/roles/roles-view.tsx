"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { InlineText } from "@/components/shared/inline-edit";
import { Modal } from "@/components/shared/modal";
import { ScreenActions } from "@/components/shared/screen-actions";
import { Messages, Muted, Step, StepForm, TabHead } from "@/components/shared/steps";
import {
  PERMISSIONS,
  PERMISSION_SECTIONS,
  type PermissionCode,
  type PermissionSection,
} from "@/config/permissions";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatNumber } from "@/lib/format";
import { createRole, deleteRole, renameRole, setRolePermission } from "./actions";

export type RoleRow = {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: PermissionCode[];
  assigned: number;
};

/** صلاحيات بلا شاشة بعد لا تُعرض — ذكرها يوحي بقدرة غير موجودة. */
const HIDDEN_SECTIONS = new Set<PermissionSection>(["attachments"]);

const SECTION_ENTRIES = Object.entries(
  Object.entries(PERMISSIONS).reduce<Record<string, PermissionCode[]>>((acc, [code, entry]) => {
    if (HIDDEN_SECTIONS.has(entry.section)) return acc;
    (acc[entry.section] ??= []).push(code as PermissionCode);
    return acc;
  }, {}),
);

export function RolesView({ roles, canWrite }: { roles: RoleRow[]; canWrite: boolean }) {
  const [state, action, pending] = useActionState(createRole, EMPTY_FORM_STATE);
  const [busy, startTransition] = useTransition();
  const [removing, setRemoving] = useState<RoleRow | null>(null);

  // مفتوحةٌ أوّلاً حين لا دور مخصَّص بعد — النظاميّ وحده لا يكفي فريقاً.
  const [adding, setAdding] = useState(roles.length <= 1);

  return (
    <>
      {canWrite ? (
        <ScreenActions>
          <Button variant="primary" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <Plus size={16} aria-hidden />
            أنشئ دوراً
          </Button>
        </ScreenActions>
      ) : null}

      <TabHead
        title="الأدوار"
        lede="الدور مجموعة صلاحيات تُسنَد لشخص. أنشئ ما يناسب عملكم — منسّق برنامج، أو مُعِدّ مادة — وأشِّر ما يملكه كلٌّ منهم."
      />

      <Step
        n={1}
        title="أدوار المنصة"
        why="الدور النظامي «مدير المنصة» يملك كل شيء ولا يُعدَّل. وما دونه تصنعه أنت بقدر الحاجة، ولا تمنح دوراً صلاحيةً لا تملكها أنت."
        done={roles.length > 1}
        state={
          roles.length > 1 ? (
            <span>{formatNumber(roles.length)} أدوار</span>
          ) : (
            <span>دور المنصة النظامي وحده — لا دور مخصَّص بعد.</span>
          )
        }
      >
        {roles.map((role) => (
          <section key={role.id} style={CARD}>
            <div style={HEAD}>
              <strong>
                {canWrite && !role.isSystem ? (
                  <InlineText
                    label={`اسم الدور ${role.name}`}
                    value={role.name}
                    onSave={(name) => renameRole(role.id, name)}
                  />
                ) : (
                  role.name
                )}
              </strong>
              <span style={META}>
                {role.isSystem
                  ? "نظامي — يُقرأ ولا يُعدَّل"
                  : `${formatNumber(role.assigned)} مُسنَداً`}
              </span>
              {canWrite && !role.isSystem ? (
                <Button aria-label={`احذف ${role.name}`} pending={busy} onClick={() => setRemoving(role)}>
                  <Trash2 size={16} aria-hidden />
                </Button>
              ) : null}
            </div>

            {SECTION_ENTRIES.map(([section, codes]) => (
              <div key={section} style={GROUP}>
                <span style={GROUP_TITLE}>{PERMISSION_SECTIONS[section as PermissionSection]}</span>
                {codes.map((code) => {
                  const on = role.isSystem || role.permissions.includes(code);
                  return (
                    <label key={code} style={ROW}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!canWrite || role.isSystem || busy}
                        onChange={(e) =>
                          startTransition(async () =>
                            reportAction(await setRolePermission(role.id, code, e.target.checked)),
                          )
                        }
                      />
                      {PERMISSIONS[code].label}
                    </label>
                  );
                })}
              </div>
            ))}
          </section>
        ))}

        {canWrite && adding ? (
          <StepForm title="أنشئ دوراً" action={action} state={state}>
            <Field id="rname" label="اسم الدور" required error={state.fieldErrors?.["name"]}>
              <Input id="rname" name="name" required placeholder="منسّق برنامج" />
            </Field>
            <FormActions>
              <Button type="submit" variant="primary" pending={pending}>
                أنشئ
              </Button>
            </FormActions>
            <Messages state={state} />
          </StepForm>
        ) : (
          <Muted>لا تملك صلاحية تعديل الأدوار — ما تراه للاطّلاع.</Muted>
        )}
      </Step>

      <Muted>
        بعد تأشير الصلاحيات، أسنِد الدور لأصحابه من <Link href="/team/assignments">الإسنادات</Link>.
      </Muted>

      <Modal open={removing !== null} title="حذف الدور" onClose={() => setRemoving(null)}>
        <p>يُحذف «{removing?.name}» ولا يعود يظهر في الإسناد. وسجلّ ما فعله أصحابه يبقى.</p>
        <FormActions>
          <Button onClick={() => setRemoving(null)}>إلغاء</Button>
          <Button
            variant="danger"
            pending={busy}
            onClick={() => {
              const role = removing;
              if (!role) return;
              startTransition(async () => {
                reportAction(await deleteRole(role.id));
                setRemoving(null);
              });
            }}
          >
            احذفه
          </Button>
        </FormActions>
      </Modal>
    </>
  );
}

const CARD = {
  padding: "var(--space-4)",
  marginBlockEnd: "var(--space-4)",
  background: "var(--color-surface-raised)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
} as const;

const HEAD = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  marginBlockEnd: "var(--space-3)",
} as const;

const META = { fontSize: "var(--text-sm)", color: "var(--color-text-muted)" } as const;

const GROUP = { marginBlockEnd: "var(--space-3)" } as const;

const GROUP_TITLE = {
  display: "block",
  fontSize: "var(--text-xs)",
  color: "var(--color-text-muted)",
  marginBlockEnd: "var(--space-1)",
} as const;

const ROW = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  fontSize: "var(--text-sm)",
  marginBlockEnd: "var(--space-1)",
} as const;
