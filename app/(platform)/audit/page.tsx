import { hrefWith, type FilterLink, type SearchParams } from "@/components/shared/filter-links";
import { ErrorState } from "@/components/shared/states";
import { FIELD_CHANGE_ACTIONS } from "@/lib/accounts/field-changes";
import { auditActionLabel, auditDetail, auditTableLabel } from "@/lib/audit/labels";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { AuditView, type AuditRow } from "./audit-view";

/** `?kind=data` — تعديلات البيانات وحدها. وبدونه أفعال الإدارة بلاها: تعديلات المشاركين لا تدفعها خارج الشاشة. */
const DATA_KIND = "data";
const FIELD_ACTIONS = `(${FIELD_CHANGE_ACTIONS.join(",")})`;

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const authz = await authorizeRequest({ permission: "audit.read" });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;
  // قيم البيانات (قديمها وجديدها) لمن يقرأ الحسابات أيضاً — ولغيره أسماء الحقول (adr/0059).
  const canReadUsers = (await authorizeRequest({ permission: "users.read" })).ok;
  const params = await searchParams;
  const dataOnly = params.kind === DATA_KIND;

  const db = await createClient();
  const base = db.from("audit_log").select("id, action, entity_table, entity_id, actor_id, actor_label, created_at, updated_at, before, after");
  const { data, error } = await (dataOnly
    ? base.in("action", [...FIELD_CHANGE_ACTIONS])
    : base.not("action", "in", FIELD_ACTIONS)
  )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return <ErrorState body="تعذّر جلب السجل." />;

  /**
   * الفاعل من **تسميته المختومة** لحظة الفعل (الهجرة ٠٤٨) — فلا يُستعار الاسم
   * من جدولٍ قد يزول، ولا يحتاج قارئُ السجلّ صلاحيةَ قراءة المستخدمين.
   * والصفوف القديمة بلا تسمية تُحَلّ كما كانت، ثم يبقى الاحتياط لما لا يُحَلّ.
   */
  const actorIds = [
    ...new Set(
      (data ?? [])
        .filter((r) => !r.actor_label && r.actor_id)
        .map((r) => r.actor_id as string),
    ),
  ];
  const { data: people } = actorIds.length
    ? await db.from("profiles").select("user_id, full_name").in("user_id", actorIds)
    : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.user_id, p.full_name]));

  // صاحب الحساب المعدَّل يُقرأ لحظة العرض لا يُخزَّن — ولمن يقرأ الحسابات وحده (سياسة profiles_read).
  const changed = (data ?? []).filter((r) => (FIELD_CHANGE_ACTIONS as readonly string[]).includes(r.action) && r.entity_id);
  const idsOf = (action: string) => [...new Set(changed.filter((r) => r.action === action).map((r) => r.entity_id as string))];
  const profileIds = idsOf("profile_changed");
  const userIds = idsOf("identity_changed");
  const { data: owners } =
    canReadUsers && changed.length
      ? await db
          .from("profiles")
          .select("id, user_id, full_name")
          .or(`id.in.(${profileIds.join(",") || "00000000-0000-0000-0000-000000000000"}),user_id.in.(${userIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
      : { data: [] };
  const ownerOf = new Map<string, string>();
  for (const o of owners ?? []) {
    ownerOf.set(o.id, o.full_name);
    ownerOf.set(o.user_id, o.full_name);
  }

  const rows: AuditRow[] = (data ?? []).map((r) => {
    const owner = r.entity_id ? ownerOf.get(r.entity_id) : undefined;
    const detail = auditDetail(r.action, r.after, r.before, canReadUsers);
    return {
      id: r.id,
      action: auditActionLabel(r.action),
      entityTable: auditTableLabel(r.entity_table),
      detail: owner ? `${owner} · ${detail}` : detail,
      actor: r.actor_label ?? (r.actor_id ? (nameOf.get(r.actor_id) ?? "مستخدم") : "المنصة"),
      // سطر التعديل المدموج بوقت آخر تغييرٍ فيه — لا بأوّله.
      at: (FIELD_CHANGE_ACTIONS as readonly string[]).includes(r.action) ? r.updated_at : r.created_at,
    };
  });

  const kindLinks: FilterLink[] = [
    { label: "أفعال الإدارة", href: hrefWith("/audit", params, { kind: null }), current: !dataOnly },
    { label: "تعديلات البيانات", href: hrefWith("/audit", params, { kind: DATA_KIND }), current: dataOnly },
  ];

  return <AuditView rows={rows} kindLinks={kindLinks} dataOnly={dataOnly} />;
}
