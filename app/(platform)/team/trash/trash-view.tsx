"use client";

import { useActionState, useState, useTransition } from "react";
import { ActionForm } from "@/components/shared/action-form";
import { reportAction } from "@/components/shared/action-notice";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button, Field, FormActions, Input } from "@/components/shared/form";
import { Modal } from "@/components/shared/modal";
import { TabHead } from "@/components/shared/steps";
import { binNotice, isDue, PURGE_PHRASE } from "@/lib/accounts/bin";
import { EMPTY_FORM_STATE } from "@/lib/auth/form-state";
import { formatDateBoth } from "@/lib/format";
import { purgeAccount, restoreUser } from "../actions";

export type BinRow = {
  userId: string;
  fullName: string;
  deletedAt: string;
  purgeAfter: string;
  isStaff: boolean;
};

const ROW_ACTIONS = {
  display: "flex",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
} as const;

/**
 * السلّة: ما حُذف ولم يُمحَ.
 *
 * **والمحو وحده يُكتب بالحرف** (`ق-٢٢`): هو الفعل الوحيد في المنصة الذي لا
 * يُستدرَك، ونقرةٌ واحدة لا تكفي له. والاستعادة نقرةٌ لأنها ترجع بالحال إلى
 * ما كان.
 */
export function TrashView({ rows, canWrite }: { rows: BinRow[]; canWrite: boolean }) {
  const [busy, startTransition] = useTransition();
  const [purging, setPurging] = useState<BinRow | null>(null);
  const [state, action, pending] = useActionState(purgeAccount, EMPTY_FORM_STATE);

  const columns: Column<BinRow>[] = [
    { key: "fullName", header: "الاسم", sortable: true, primary: true, render: (r) => r.fullName },
    { key: "kind", header: "الصفة", render: (r) => (r.isStaff ? "إداريّ" : "مشارك") },
    { key: "deletedAt", header: "حُذف في", render: (r) => formatDateBoth(r.deletedAt) },
    { key: "left", header: "الحالة", sortable: true, render: (r) => binNotice(r.purgeAfter) },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            align: "end" as const,
            render: (r: BinRow) => (
              <span style={ROW_ACTIONS}>
                <Button
                  pending={busy}
                  onClick={() =>
                    startTransition(async () => reportAction(await restoreUser(r.userId)))
                  }
                >
                  استعِد
                </Button>
                {/* لا يُعرض ما لا يصحّ: القاعدة ترفض المحو قبل انقضاء المدّة. */}
                {isDue(r.purgeAfter) ? (
                  <Button variant="danger" onClick={() => setPurging(r)}>
                    امحُ الآن
                  </Button>
                ) : null}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <TabHead
        title="سلّة المحذوفات"
        lede="حسابات حُذفت ولم تُمحَ بعد. تُستعاد بنقرة ما دامت هنا، وبعد انقضاء مدّتها تُمحى محواً لا رجعة فيه — ويبقى سجلّ ما فعلته باسمٍ مطموس."
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.userId}
        total={rows.length}
        page={1}
        searchPlaceholder="ابحث بالاسم…"
        empty={{
          title: "السلّة فارغة",
          body: "لم يُحذف أي حساب. والحذف من شاشة «المشاركون في المنصة».",
        }}
      />

      <Modal open={purging !== null} title="محو الحساب نهائياً" onClose={() => setPurging(null)}>
        <p>
          يُمحى «{purging?.fullName}» محواً لا رجعة فيه: اسمه وجواله وبريده وإجاباته. ويبقى سجلّ
          ما فعله في المنصة، وأيامُ حفظه في برامجه — بلا اسم.
        </p>
        <ActionForm action={action} state={state}>
          <input type="hidden" name="userId" value={purging?.userId ?? ""} />
          <Field
            id="purge-confirm"
            label={`للتأكيد اكتب: ${PURGE_PHRASE}`}
            required
            error={state.fieldErrors?.["confirm"]}
          >
            <Input
              id="purge-confirm"
              name="confirm"
              autoComplete="off"
              required
              invalid={Boolean(state.fieldErrors?.["confirm"])}
            />
          </Field>
          <FormActions>
            <Button onClick={() => setPurging(null)}>إلغاء</Button>
            <Button type="submit" variant="danger" pending={pending}>
              امحُه نهائياً
            </Button>
          </FormActions>
        </ActionForm>
      </Modal>
    </>
  );
}
