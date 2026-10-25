import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { formatRegistrationNo } from "@/lib/programs/registration";
import { authorizeRequest } from "@/lib/permissions/server";
import { LateView, type LateRow } from "./late-view";

/**
 * قائمة المتأخرين (خطة دليل المشارك · الدفعة ب) — للرصد: من تأخّر يوماً فأكثر عن خطته، تنازلياً،
 * بجواله ومساره وآخر إنجازه. والحساب في القاعدة (`fn_program_late`) كقائمة المشاركين ورأس اليوم.
 */
export default async function LatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  // البحث في القائمة نفسها (مراجعة ب ١): بالاسم أو الجوال أو رقم التسجيل.
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const authz = await authorizeRequest({ permission: "participants.read", programId: id, resourceProgramId: id });
  if (!authz.ok) return <ErrorState title="غير مصرَّح" body={authz.message} />;

  const db = await createClient();
  const [programResult, lateResult, tracksResult] = await Promise.all([
    db.from("programs").select("registration_prefix").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.rpc("fn_program_late", { p_program_id: id }),
    db.from("tracks").select("id, name").eq("program_id", id).is("deleted_at", null).order("sort_order"),
  ]);
  if (programResult.error || lateResult.error || tracksResult.error) {
    return <ErrorState body="تعذّر جلب المتأخرين." />;
  }

  const prefix = programResult.data?.registration_prefix ?? null;
  const all: LateRow[] = (lateResult.data ?? []).map((r) => ({
    id: r.id,
    name: r.full_name ?? "—",
    phone: r.phone ?? null,
    registrationNo: formatRegistrationNo(prefix, r.registration_no),
    trackName: r.track_name,
    lateDays: r.late_days,
    lastDoneAt: r.last_done_at,
  }));
  const rows = q
    ? all.filter((r) => [r.name, r.phone ?? "", r.registrationNo ?? ""].some((v) => v.includes(q)))
    : all;
  // عدد المتأخرين لكل مسار — والمسار بلا متأخرين يُذكر بصفر.
  const perTrack = (tracksResult.data ?? []).map((t) => ({
    name: t.name,
    count: (lateResult.data ?? []).filter((r) => r.track_id === t.id).length,
  }));

  return <LateView programId={id} rows={rows} total={all.length} perTrack={perTrack} />;
}
