import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
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
          },
        ]
      : [],
  );
  return <VoicesView voices={voices} from={from} />;
}
