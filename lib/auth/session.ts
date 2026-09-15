import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import { accountState, suggestedName } from "./account-state";

/**
 * حالة الجلسة الحالية.
 *
 * **الصلاحيات تُقرأ حيّة من القاعدة** في كل طلب لا من داخل الرمز — فتغيير الدور
 * أو إيقاف الحساب ينفذ خلال طلب واحد، لا خلال عمر الرمز (`platform.md §٩`:
 * «ينفذ على الجلسات القائمة خلال دقيقة كحد أقصى»).
 *
 * **ومرّة واحدة للطلب:** الإطار والصفحة والفاحص كلهم يسألونها، وكان كلٌّ منهم
 * يدفع رحلة إلى خدمة المصادقة ونداءين للقاعدة. `cache` يجعلها تُحسب مرّة في
 * العرض الواحد، وتبقى حيّة بين طلب وآخر.
 */

export type SessionState =
  | { status: "anonymous" }
  | { status: "suspended"; userId: string }
  /** دخل ولم يستكمل اسمه وجواله — لا تُفتح له شاشة قبل ذلك (`adr/0025`). */
  | { status: "incomplete"; userId: string; email: string; suggestedName: string }
  | {
      status: "active";
      userId: string;
      email: string;
      /** المفتاح: الرمز · القيمة: مجموعة النطاقات (null فيها = نطاق عام). */
      permissions: Map<string, Set<string | null>>;
      /** له مشاركة قائمة في برنامج — جارية أو منتهية. يُظهر «رحلتي» لصاحبها وحده. */
      isParticipant: boolean;
    };

export const getSession = cache(async (): Promise<SessionState> => {
  const db = await createClient();

  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { status: "anonymous" };

  const [{ data: profile }, { data: rows }, { count: participations }] = await Promise.all([
    // الملف نفسه لا `fn_is_active`: غيابه «ناقص»، وحذفه الليّن «موقوف» — والدالة
    // تُرجع «لا» للحالتين فلا تفرّق بينهما.
    db.from("profiles").select("deleted_at").eq("user_id", auth.user.id).maybeSingle(),
    db.rpc("fn_my_permissions"),
    // عدٌّ لا جلب: السؤال «هل له مشاركة؟» لا «ما مشاركاته؟».
    db
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.user.id)
      .is("deleted_at", null),
  ]);

  const state = accountState(profile);
  if (state === "incomplete") {
    return {
      status: "incomplete",
      userId: auth.user.id,
      email: auth.user.email ?? "",
      suggestedName: suggestedName(auth.user.user_metadata),
    };
  }
  if (state === "suspended") return { status: "suspended", userId: auth.user.id };

  const permissions = new Map<string, Set<string | null>>();
  for (const row of rows ?? []) {
    const scopes = permissions.get(row.permission_code) ?? new Set<string | null>();
    scopes.add(row.scope_program_id);
    permissions.set(row.permission_code, scopes);
  }

  return {
    status: "active",
    userId: auth.user.id,
    email: auth.user.email ?? "",
    permissions,
    isParticipant: (participations ?? 0) > 0,
  };
});
