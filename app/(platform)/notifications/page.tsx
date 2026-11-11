import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { isNotificationKind, type MyNotification } from "@/lib/notifications/notifications";
import { NotificationsView } from "./notifications-view";

/**
 * «تنبيهاتي» (adr/0055): ما فعلته الإدارة ويخصّه — قرار طلب انتقاله ونشر النتائج. وغير المقروء يُعلَّم
 * «جديد» من هذه القراءة، ثم يُوسَم بإجراءٍ بعد الرسم فتختفي نقطة الجرس.
 */
export default async function NotificationsPage() {
  const session = await getSession();
  if (session.status !== "active") return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترى تنبيهاتك." />;

  const db = await createClient();
  const { data, error } = await db.rpc("fn_my_notifications");
  if (error) return <ErrorState body="تعذّر جلب تنبيهاتك. أعد المحاولة." />;
  // الإعلانات (الدفعة ٢) تُضمّ هنا بمصدرها — والآن إشعارات الأحداث وحدها.
  const notes: MyNotification[] = (data ?? []).flatMap((n) =>
    n.source === "event" && isNotificationKind(n.kind)
      ? [
          {
            id: n.id,
            kind: n.kind,
            participantId: n.participant_id,
            programName: n.program_name,
            trackName: n.track_name,
            decision: n.decision,
            fields: n.body,
            createdAt: n.created_at,
            unread: n.unread,
          },
        ]
      : [],
  );
  return <NotificationsView notes={notes} />;
}
