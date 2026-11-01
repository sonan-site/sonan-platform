import Link from "next/link";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHead } from "@/components/shared/steps";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { formatDateTime } from "@/lib/format";
import { formatRegistrationNo } from "@/lib/programs/registration";
import { currentViewer } from "@/lib/permissions/granted";
import styles from "./inbox.module.css";
import { isVoiceKind, isVoiceStatus, VOICE_KIND_LABEL, VOICE_STATUS_STAFF, VOICE_KINDS, VOICE_STATUSES } from "@/lib/voices/voices";

/**
 * صندوق «صوتك» للإدارة (adr/0054): رسائل الطلاب بنطاق الصلاحية — الجديدة أولاً — بمرشّحات الحال
 * والنوع، والبرنامج حين يأتي من «ما يحتاج انتباهك». وهوية المرسِل من `fn_inbox_list` وإن لم يملك
 * القارئ `participants.read` (مراجعة الخطة ح٢).
 */

type Row = {
  id: string;
  kind: string;
  title: string;
  status: string;
  createdAt: string;
  hasReply: boolean;
  programName: string | null;
  sender: string;
  registrationNo: string | null;
  track: string | null;
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; program?: string }>;
}) {
  const viewer = await currentViewer();
  if (!viewer.granted.has("voices.manage")) return <ErrorState title="غير مصرَّح" body="لا تملك صلاحية «صوتك»." />;

  const sp = await searchParams;
  const status = isVoiceStatus(sp.status) ? sp.status : null;
  const kind = isVoiceKind(sp.kind) ? sp.kind : null;
  const program = sp.program && /^[0-9a-f-]{36}$/i.test(sp.program) ? sp.program : null;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_inbox_list", {
    p_status: status ?? undefined,
    p_kind: kind ?? undefined,
    p_program_id: program ?? undefined,
  });
  if (error) return <ErrorState body="تعذّر جلب الرسائل." />;

  const rows: Row[] = (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    createdAt: r.created_at,
    hasReply: r.has_reply,
    programName: r.program_name,
    sender: r.sender_name,
    registrationNo: formatRegistrationNo(r.registration_prefix, r.registration_no),
    track: r.track_name,
  }));

  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const next = { status, kind, program, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/inbox?${s}` : "/inbox";
  };

  const columns: Column<Row>[] = [
    {
      key: "title",
      header: "الرسالة",
      primary: true,
      render: (r) => <Link href={`/inbox/${r.id}`}>{r.title}</Link>,
    },
    { key: "kind", header: "النوع", render: (r) => (isVoiceKind(r.kind) ? VOICE_KIND_LABEL[r.kind] : r.kind) },
    {
      key: "sender",
      header: "المرسِل",
      render: (r) => [r.sender, r.registrationNo, r.track].filter(Boolean).join(" · "),
    },
    { key: "program", header: "البرنامج", render: (r) => r.programName ?? "—" },
    {
      key: "status",
      header: "الحال",
      render: (r) => `${isVoiceStatus(r.status) ? VOICE_STATUS_STAFF[r.status] : r.status}${r.hasReply ? " · رُدّ عليها" : ""}`,
    },
    { key: "at", header: "الوقت", render: (r) => formatDateTime(r.createdAt) },
  ];

  return (
    <>
      <PageHead crumbs={[]} title="صوتك" lede="رسائل الطلاب: استفسار · ملاحظة · اقتراح · مشكلة تقنية · شكوى. ردّك يراه الطالب باسم فريق البرنامج." />
      {/* مرشّحاتٌ روابط لا عنصر تنقّل (`nav-outside-source`). */}
      <div className={styles.filters} role="group" aria-label="الحال">
        <Link href={href({ status: null })} aria-current={!status ? "true" : undefined}>
          الكل
        </Link>
        {VOICE_STATUSES.map((s) => (
          <Link key={s} href={href({ status: s })} aria-current={status === s ? "true" : undefined}>
            {VOICE_STATUS_STAFF[s]}
          </Link>
        ))}
      </div>
      <div className={styles.filters} role="group" aria-label="النوع">
        <Link href={href({ kind: null })} aria-current={!kind ? "true" : undefined}>
          كل الأنواع
        </Link>
        {VOICE_KINDS.map((k) => (
          <Link key={k} href={href({ kind: k })} aria-current={kind === k ? "true" : undefined}>
            {VOICE_KIND_LABEL[k]}
          </Link>
        ))}
        {program ? <Link href={href({ program: null })}>{rows[0]?.programName ?? "برنامجٌ واحد"} · اعرض كل البرامج</Link> : null}
      </div>
      {rows.length >= 300 ? <p className={styles.note}>تُعرض أحدث ٣٠٠ رسالة — ضيّق بالمرشّحات لترى ما قبلها.</p> : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={rows.length}
        page={1}
        empty={{ title: "لا رسائل", body: "لا رسالة بهذه المرشّحات." }}
      />
    </>
  );
}
