import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { VOICE_BUCKET, VOICE_IMAGE_URL_TTL } from "@/lib/voices/image";
import { isVoiceKind, isVoiceStatus } from "@/lib/voices/voices";
import { VoicesView, type MyVoice } from "./voices-view";

/**
 * «صوتك» للطالب (adr/0054): يرسل رسالة، ويرى رسائله بحالها والرد عليها. والجديد من الردود يُعلَّم
 * «جديد» من هذه القراءة، ثم تُجعل مقروءة بإجراءٍ بعد الرسم فتختفي نقطة الرأس.
 */
export default async function VoicesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  // الصفحة التي جاء منها — زرّ الرأس يحملها (`document.referrer` لا يتغيّر في الانتقال الناعم).
  const raw = (await searchParams).from ?? "";
  const from = raw.startsWith("/") && !raw.startsWith("//") ? raw.slice(0, 200) : "";
  const session = await getSession();
  if (session.status !== "active") return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترسل رسالتك." />;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_my_voices");
  if (error) return <ErrorState body="تعذّر جلب رسائلك. أعد المحاولة." />;

  // روابط الصور دفعةً واحدة، بهوية الطالب — فالسياسة تحرسها كما تحرس الرفع (adr/0054).
  const paths = (data ?? []).flatMap((v) => (v.image_path ? [v.image_path] : []));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const signed = await db.storage.from(VOICE_BUCKET).createSignedUrls(paths, VOICE_IMAGE_URL_TTL);
    for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const voices: MyVoice[] = (data ?? []).flatMap((v) =>
    isVoiceKind(v.kind) && isVoiceStatus(v.status)
      ? [
          {
            id: v.id,
            kind: v.kind,
            title: v.title,
            body: v.body,
            status: v.status,
            createdAt: v.created_at,
            reply: v.reply,
            repliedAt: v.replied_at,
            replyNew: v.reply_unseen,
            team: v.team,
            imageUrl: v.image_path ? (urls.get(v.image_path) ?? null) : null,
          },
        ]
      : [],
  );
  return <VoicesView voices={voices} from={from} userId={session.userId} />;
}
