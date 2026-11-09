import { z } from "@/lib/validation/z";

/**
 * «تنبيهاتي» (adr/0055) — نصّ إشعار الحدث ورابطه، في موضعٍ واحد. القاعدة تحمل النوع والقرار واسم
 * المسار (`fn_my_notifications`)، ولا تحمل نتيجةً — فالنتيجة تُقرأ في «رحلتي» من مصدرها.
 */

export const NOTIFICATION_KINDS = ["track_change_decided", "results_published"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const isNotificationKind = (v: unknown): v is NotificationKind =>
  typeof v === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(v);

export type MyNotification = {
  id: string;
  kind: NotificationKind;
  participantId: string | null;
  programName: string | null;
  trackName: string | null;
  decision: string | null;
  /** كما جاء من القاعدة بدقّتها — حدّ الوسم (`fn_mark_notifications_seen`). */
  createdAt: string;
  /** لم يُقرأ قبل هذه الزيارة. */
  unread: boolean;
};

const track = (name: string | null, fallback: string) => (name ? `مسار «${name}»` : fallback);

/** نصّ الإشعار ووجهته — رحلته في البرنامج الذي يخصّه، ولا وجهة لمشاركةٍ حُذفت. */
export function notificationMessage(n: MyNotification): { text: string; href: string | null } {
  const href = n.participantId ? `/journey/${n.participantId}` : null;
  switch (n.kind) {
    case "track_change_decided": {
      const to = track(n.trackName, "المسار المطلوب");
      return { text: n.decision === "approved" ? `قُبل طلب انتقالك إلى ${to}` : `لم يُقبل طلب انتقالك إلى ${to}`, href };
    }
    case "results_published":
      return { text: `نُشرت نتائج ${track(n.trackName, "مسارك")} — اطّلع على نتيجتك`, href };
  }
}

/** حدّ الوسم: طابعٌ زمنيٌّ صالح كما أرسلته القاعدة — لا يُعاد بناؤه فتسقط أجزاء الثانية. */
export const isTimestamp = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

export const markSeenSchema = z.object({ until: z.string().refine(isTimestamp) });
