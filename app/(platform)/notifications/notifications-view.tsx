"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/shared/states";
import { formatDateTime } from "@/lib/format";
import { notificationMessage, type MyNotification } from "@/lib/notifications/notifications";
import { markNotificationsSeen } from "./actions";
import styles from "./notifications.module.css";

/** «تنبيهاتي»: الأحدث أولاً، والجديد معلَّم، وكلٌّ برابطٍ إلى رحلته في البرنامج الذي يخصّه. */
export function NotificationsView({ notes }: { notes: MyNotification[] }) {
  const router = useRouter();
  // «جديد» من القراءة الأولى: التحديث بعد الوسم يعيدها كلها مقروءة، والمكوّن باقٍ فيبقى الوسم ظاهراً
  // في هذه الزيارة (مراجعة البناء م١).
  const [fresh] = useState(() => new Set(notes.filter((n) => n.unread).map((n) => n.id)));

  // ما عُرض يُوسَم بعد الرسم حتى أحدثه — لا ما وصل بعده — ثم يُحدَّث الإطار فتختفي نقطة الجرس.
  const until = notes.some((n) => n.unread) ? notes[0]!.createdAt : null;
  useEffect(() => {
    if (!until) return;
    void markNotificationsSeen(until).then(() => router.refresh());
  }, [until, router]);

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>تنبيهاتي</h1>
        <p className={styles.lede}>ما يخصّك من الإدارة: قرار طلب انتقالك، ونشر النتائج.</p>
      </header>

      {notes.length === 0 ? (
        <EmptyState kind="no-data" title="لا تنبيهات بعد" body="حين تقرّر الإدارة في طلبك أو تنشر النتائج، تجد ذلك هنا." />
      ) : (
        <ul className={styles.list}>
          {notes.map((n) => {
            const { text, href } = notificationMessage(n);
            return (
              <li key={n.id} className={`${styles.item} ${fresh.has(n.id) ? styles.unread : ""}`}>
                <div className={styles.itemHead}>
                  <span className={styles.program}>{n.programName ?? "منصة سنن"}</span>
                  {fresh.has(n.id) ? <span className={styles.newTag}>جديد</span> : null}
                </div>
                <p className={styles.text}>{text}</p>
                <div className={styles.itemFoot}>
                  <span className={styles.meta}>{formatDateTime(n.createdAt)}</span>
                  {href ? (
                    <Link href={href} className={styles.link}>
                      افتح رحلتي
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
