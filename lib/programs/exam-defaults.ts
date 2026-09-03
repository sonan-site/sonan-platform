/**
 * افتراضات نموذج تعريف الاختبار — في موضع واحد.
 *
 * **خارج ملف الأفعال قصداً.** ملف `"use server"` لا يُصدِّر إلا دوالّ غير
 * متزامنة، وتصدير كائن منه يكسر الصفحة **وقت التشغيل** لا وقت البناء. فالقيم
 * المشتركة بين الفعل والشاشة تسكن وحدة عادية.
 */
export const EXAM_DEFAULTS = {
  passPercentage: 80,
  questionCount: 20,
  secondsPerQuestion: 60,
  maxSkips: 0,
  judgeCount: 3,
  awardPercentage: 90,
} as const;
