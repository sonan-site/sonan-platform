import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { FIELD_CHANGE_ACTIONS, fieldChanges } from "@/lib/accounts/field-changes";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { z } from "@/lib/validation/z";
import { AccountEditView, type HistoryRow } from "./account-edit-view";

/**
 * تعديل الإدارة لبيانات مشارك (adr/0059) — من «المشاركون في المنصة» لحامل `users.write`.
 *
 * البيانات الستّ، والهوية لحامل `identities.write`، وسجلّ تعديلات هذا الحساب لحامل `audit.read` — بيد
 * صاحبه أو بيد الإدارة، فلا تكون الإدارة غائبةً عمّا تغيّر.
 */
export default async function AccountEditPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) notFound();

  const authz = await authorizeRequest({ permission: "users.write" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;
  const [canReadUsers, canEditIdentity, canReadAudit] = await Promise.all([
    authorizeRequest({ permission: "users.read" }).then((r) => r.ok),
    authorizeRequest({ permission: "identities.write" }).then((r) => r.ok),
    authorizeRequest({ permission: "audit.read" }).then((r) => r.ok),
  ]);
  if (!canReadUsers) return <ErrorState title="غير مصرَّح" body="تعديل الحساب يحتاج قراءة الحسابات أيضاً." />;

  const db = await createClient();
  const { data: profile, error } = await db
    .from("profiles")
    .select(
      "id, full_name, first_name, father_name, grandfather_name, family_name, gender, birth_date, nationality, phone, phone_secondary, deleted_at, purge_after, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return <ErrorState body="تعذّر جلب الحساب. أعد المحاولة." />;
  if (!profile) notFound();

  const [identityResult, historyResult] = await Promise.all([
    // مقنّعاً لحامل users.read، وكاملاً لحامل identities.read — كما في كل شاشةٍ إدارية (adr/0047).
    db.rpc("fn_identity_masked", { p_user_id: userId }),
    canReadAudit
      ? db
          .from("audit_log")
          .select("id, action, actor_label, updated_at, before, after")
          .in("action", [...FIELD_CHANGE_ACTIONS])
          .or(`and(action.eq.profile_changed,entity_id.eq.${profile.id}),and(action.eq.identity_changed,entity_id.eq.${userId})`)
          .order("updated_at", { ascending: false })
          .limit(50)
      : null,
  ]);
  // تعذّر جلبها لا يُقال «بلا رقم وثيقة» — يُقال تعذّر.
  if (identityResult.error) return <ErrorState body="تعذّر جلب هوية الحساب. أعد المحاولة." />;
  const identity = identityResult.data?.[0] ?? null;

  // القيم لمن يقرأ الحسابات — والصفحة تشترطه، فتُعرض كاملة.
  const history: HistoryRow[] | null = historyResult
    ? (historyResult.data ?? []).map((r) => {
        const after = (r.after ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          at: r.updated_at,
          actor: r.actor_label ?? "—",
          byAdmin: after["by_admin"] === true,
          changes: fieldChanges(r.before, r.after, true),
          outOfTrack: after["out_of_track"] === true,
          outOfGender: after["out_of_gender"] === true,
        };
      })
    : null;

  return (
    <AccountEditView
      userId={userId}
      fullName={profile.full_name}
      status={profile.purge_after ? "bin" : profile.deleted_at ? "suspended" : "active"}
      seenUpdatedAt={profile.updated_at}
      profile={{
        firstName: profile.first_name ?? "",
        fatherName: profile.father_name ?? "",
        grandfatherName: profile.grandfather_name ?? "",
        familyName: profile.family_name ?? "",
        gender: profile.gender ?? "",
        birthDate: profile.birth_date ?? "",
        nationality: profile.nationality ?? "",
        phone: profile.phone,
        phoneSecondary: profile.phone_secondary,
      }}
      identity={{
        nationalId: identity?.national_id ?? null,
        isFull: identity?.is_full ?? false,
        guardianPhone: identity?.guardian_phone ?? null,
      }}
      canEditIdentity={canEditIdentity}
      history={history}
      historyError={Boolean(historyResult?.error)}
    />
  );
}
