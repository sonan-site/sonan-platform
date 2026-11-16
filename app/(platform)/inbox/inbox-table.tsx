"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/shared/data-table";
import { formatDateTime } from "@/lib/format";
import { isVoiceKind, isVoiceStatus, VOICE_KIND_LABEL, VOICE_STATUS_STAFF } from "@/lib/voices/voices";

/**
 * جدول صندوق «صوتك» — مكوّن متصفح، لأن أعمدة `DataTable` دوالّ لا تعبر من الخادم (بلاغ ١٦ نوفمبر:
 * كانت الصفحة تسقط). يستلم الصفوف بياناتٍ محسوبة، ويرسمها هنا.
 */

export type InboxRow = {
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

const COLUMNS: Column<InboxRow>[] = [
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

export function InboxTable({ rows }: { rows: InboxRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      total={rows.length}
      page={1}
      empty={{ title: "لا رسائل", body: "لا رسالة بهذه المرشّحات." }}
    />
  );
}
