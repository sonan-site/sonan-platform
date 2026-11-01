import { notFound } from "next/navigation";
import { PageHead } from "@/components/shared/steps";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { formatDateTime } from "@/lib/format";
import { formatRegistrationNo } from "@/lib/programs/registration";
import { VOICE_BUCKET, VOICE_IMAGE_URL_TTL } from "@/lib/voices/image";
import { isVoiceKind, isVoiceStatus, VOICE_KIND_LABEL } from "@/lib/voices/voices";
import { VoiceDetailView } from "./voice-detail-view";

/** رسالة «صوتك» بسياقها وهوية مرسِلها، والرد والحال (adr/0054). خارج النطاق = غير موجودة. */
export default async function VoiceDetailPage({ params }: { params: Promise<{ voiceId: string }> }) {
  const { voiceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(voiceId)) notFound();

  const db = await createClient();
  const { data, error } = await db.rpc("fn_voice_detail", { p_id: voiceId });
  if (error) return <ErrorState body="تعذّر جلب الرسالة." />;
  const v = data?.[0];
  if (!v || !isVoiceKind(v.kind) || !isVoiceStatus(v.status)) notFound();

  const ctx = (v.context ?? {}) as Record<string, unknown>;
  const text = (k: string) => (typeof ctx[k] === "string" ? (ctx[k] as string) : null);
  // الرابط بهوية المعالِج — سياسة القراءة تحصره في نطاقه، كـfn_voice_detail (adr/0054).
  const image = v.image_path ? (await db.storage.from(VOICE_BUCKET).createSignedUrl(v.image_path, VOICE_IMAGE_URL_TTL)).data : null;

  return (
    <>
      <PageHead
        crumbs={[{ href: "/inbox", label: "صوتك" }]}
        title={v.title}
        lede={`${VOICE_KIND_LABEL[v.kind]} · ${formatDateTime(v.created_at)}`}
      />
      <VoiceDetailView
        voice={{
          id: v.id,
          body: v.body,
          status: v.status,
          reply: v.reply,
          repliedAt: v.replied_at,
          repliedBy: v.replied_by_label,
          replySeen: v.reply_seen,
          sender: v.sender_name,
          phone: v.sender_phone,
          registrationNo: formatRegistrationNo(v.registration_prefix, v.registration_no),
          track: v.track_name,
          program: v.program_name,
          // السياق نصٌّ يُعرض كما هو — لا HTML (مراجعة الخطة م٧).
          path: text("path"),
          ua: text("ua"),
          viewport: text("viewport"),
          imageUrl: image?.signedUrl ?? null,
          imageFailed: Boolean(v.image_path) && !image?.signedUrl,
        }}
      />
    </>
  );
}
