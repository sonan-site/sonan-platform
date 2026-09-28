import { formatNumber, now, toDate } from "@/lib/format";

/**
 * سلّة المحذوفات — منطقٌ خالص (`adr/0034`).
 *
 * الحساب المحذوف يبقى مدّةً يُستعاد فيها، ثم يُمحى محواً لا رجعة فيه. وما هنا
 * حسابُ ما بقي من المدّة ولغتُها — والمدّة نفسها في «الإعدادات» لا في الرمز،
 * فالقاعدة تقرؤها وقتَ الحذف.
 */

/** ما تقوله القاعدة إن غاب الإعداد — والإعداد هو المصدر. */
export const DEFAULT_RETENTION_DAYS = 30;

/** ما لا يُستدرَك يُكتب بالحرف لا يُنقَر. */
export const PURGE_PHRASE = "امحُ نهائياً";

/** الصفة التي تحلّ محلّ الاسم بعد المحو — نظيرها في `fn_purge_account`. */
export function deletedLabel(isStaff: boolean): string {
  return isStaff ? "إداريّ محذوف" : "مشارك محذوف";
}

/**
 * ما بقي من المدّة بالأيام، صاعداً إلى فوق: من بقي له ساعةٌ فله «يوم» لا «صفر».
 * والسالب يعني انقضاءها.
 */
export function daysLeft(purgeAfter: string | Date, from: Date = now()): number {
  const ms = toDate(purgeAfter).getTime() - from.getTime();
  return Math.ceil(ms / 86_400_000);
}

export function isDue(purgeAfter: string | Date, from: Date = now()): boolean {
  return daysLeft(purgeAfter, from) <= 0;
}

/** «يوم» و«يومان» و«أيام» و«يوماً» — العربية تعدّ على أربعة وجوه. */
function days(count: number): string {
  if (count === 1) return "يوم واحد";
  if (count === 2) return "يومين";
  if (count <= 10) return `${formatNumber(count)} أيام`;
  return `${formatNumber(count)} يوماً`;
}

/** سطر الحالة في السلّة — خبرٌ واحد لا جدول. */
export function binNotice(purgeAfter: string | Date, from: Date = now()): string {
  const left = daysLeft(purgeAfter, from);
  return left <= 0 ? "انقضت مدّته — يُمحى الآن" : `يُمحى بعد ${days(left)}`;
}
