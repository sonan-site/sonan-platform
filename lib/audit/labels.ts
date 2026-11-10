import { formatNumber } from "@/lib/format";

/**
 * تسميات سجل التدقيق — **ما يقرؤه المدير لا ما تخزّنه القاعدة**.
 *
 * السجل يخزّن رمز الفعل (`plan_days_built`) واسم الجدول (`plan_days`)، وكانت
 * الشاشة تعرضهما كما هما. والرمز يبقى في القاعدة لأنه ثابت يُبحث به؛ والتسمية
 * هنا لأنها لغة تتغيّر.
 *
 * رمزٌ بلا تسمية يُعرض «فعل إداري» لا رمزاً خاماً — واختبار الوحدة يُفشل
 * البناء إن ظهر في الكود فعلٌ جديد بلا تسمية.
 */

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  bootstrap_admin: "تهيئة المدير الأول",
  user_invited: "دعوة مستخدم",
  role_created: "إنشاء دور",
  role_deleted: "حذف دور",
  role_permission_granted: "منح صلاحية لدور",
  role_permission_revoked: "رفع صلاحية عن دور",
  auth_showcase_updated: "تعديل شرائح واجهة الدخول",
  user_suspended: "إيقاف حساب",
  user_restored: "إعادة تفعيل حساب",
  account_closed: "إغلاق حساب بطلب صاحبه",
  participation_withdrawn: "انسحاب من برنامج",
  exam_sorting_applied: "حسم الفرز للاختبار النهائي",
  evaluation_reopened: "إعادة فتح تقييم محكّم",
  exam_settings_changed: "تعديل إعدادات اختبار",
  qualification_corrected: "تصحيح فرز مشارك",
  session_judge_removed: "إخراج محكّم من لجنة",
  evaluation_marked: "تقييم محكّم لسؤال",
  participant_marked_absent: "تسجيل غياب مشارك عن جلسته",
  absence_cleared: "إلغاء غياب مشارك",
  tiebreak_recorded: "تسجيل جولة حسم تعادل",
  results_approved: "اعتماد نتائج مسار",
  results_approval_withdrawn: "سحب اعتماد نتائج مسار",
  results_published: "نشر نتائج مسار",
  results_publication_withdrawn: "سحب نشر نتائج مسار",
  exam_results_exported: "تصدير نتائج اختبار",
  accounts_exported: "تصدير قائمة الحسابات",
  role_assigned: "إسناد دور",
  role_revoked: "سحب دور",
  section_created: "إنشاء قسم",
  program_created: "إنشاء برنامج",
  program_status_changed: "تغيير حالة برنامج",
  program_updated: "تعديل بيانات برنامج",
  track_created: "إنشاء مسار",
  track_archived: "أرشفة مسار",
  content_units_added: "إدخال مادة",
  plan_days_built: "بناء أيام خطة",
  plan_days_cleared: "مسح أيام خطة",
  engine_setting_changed: "تعديل إعداد التقويم والتقدّم",
  plan_saved: "حفظ خطة",
  plan_created: "إنشاء خطة",
  plan_removed: "رجوع مسار إلى الخطة الافتراضية",
  engine_setting_inherited: "إرجاع إعداد مسار إلى الموروث",
  page_block_added: "إضافة عنصر للصفحة",
  page_block_removed: "حذف عنصر من الصفحة",
  page_block_updated: "تعديل عنصر في الصفحة",
  schedule_entry_added: "إضافة موعد للبرنامج",
  schedule_entry_removed: "حذف موعد من البرنامج",
  schedule_entry_updated: "تعديل موعد في البرنامج",
  voice_replied: "الرد على رسالة صوتك",
  voice_status_changed: "تغيير حال رسالة صوتك",
  voice_archived: "أرشفة رسالة صوتك",
  guide_update_added: "إضافة سطر لسجل تحديثات الدليل",
  guide_update_removed: "حذف سطر من سجل تحديثات الدليل",
  guide_update_updated: "تعديل سطر في سجل تحديثات الدليل",
  registration_window_updated: "تعديل نافذة التسجيل",
  program_eligibility_updated: "تعديل شروط التسجيل في برنامج",
  track_age_updated: "تعديل حدّ العمر في مسار",
  home_featured_updated: "تغيير واجهة الحملة في الصفحة الرئيسية",
  help_entry_added: "إضافة سؤال شائع",
  help_entry_removed: "حذف سؤال شائع",
  help_entry_updated: "تعديل سؤال شائع",
  ask_answer_added: "إضافة إجابة معتمدة للمساعد",
  ask_answer_updated: "تعديل إجابة معتمدة للمساعد",
  ask_answer_removed: "حذف إجابة معتمدة للمساعد",
  ask_report_resolved: "حلّ سؤالٍ للمساعد بإجابة معتمدة",
  ask_report_status_changed: "تغيير حال تقرير المساعد",
  participant_registered: "تسجيل مشارك",
  participant_status_changed: "تغيير حالة مشارك",
  participant_track_assigned: "إسناد مسار لمشارك",
  track_change_requested: "طلب تغيير مسار",
  track_change_approved: "قبول تغيير مسار",
  track_change_rejected: "رفض تغيير مسار",
  account_deleted: "حذف حساب إلى السلّة",
  account_restored: "استعادة حساب من السلّة",
  account_purged: "محو حساب نهائياً",
  rate_limit_exceeded: "محاولات كثيرة متتالية",
  rate_limit_misconfigured: "إعداد حدّ المحاولات ناقص",
};

export const AUDIT_TABLE_LABEL: Record<string, string> = {
  profiles: "حساب",
  user_roles: "إسناد دور",
  roles: "دور",
  role_permissions: "صلاحيات دور",
  sections: "قسم",
  programs: "برنامج",
  tracks: "مسار",
  content_units: "مادة",
  plan_days: "خطة",
  plans: "خطة",
  page_blocks: "الصفحة المعلنة",
  program_schedule: "مواعيد البرنامج",
  guide_updates: "سجل تحديثات الدليل",
  voices: "رسائل صوتك",
  help_entries: "الأسئلة الشائعة",
  ask_answers: "إجابات المساعد",
  ask_reports: "تقارير المساعد",
  participants: "مشارك",
  track_change_requests: "طلب تغيير مسار",
  rate_limit_events: "الدخول",
  settings: "الإعدادات",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? "فعل إداري";
}

export function auditTableLabel(table: string): string {
  return AUDIT_TABLE_LABEL[table] ?? "—";
}

const STATUS_LABEL: Record<string, string> = { active: "نشط", suspended: "موقوف", bin: "في سلّة المحذوفات" };
const DUPLICATE_LABEL: Record<string, string> = { identity: "مكرّر محتمل", phone: "جوال مشترك" };

/**
 * تفاصيل الفعل من `after` — ما يحتاج المدير معرفته ولا يقوله اسم الفعل. والتصدير أوّلها:
 * «بأي تصفية» شرطٌ في قرار الراعي، وسجلٌّ لا يُرى توثيقٌ يوهم (`platform.md §٨`).
 * فعلٌ بلا تفاصيل معروفة ⇐ «—».
 */
export function auditDetail(action: string, after: unknown): string {
  if (action !== "accounts_exported" || !after || typeof after !== "object") return "—";
  const a = after as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const count = num(a["count"]);
  const words = num(a["name_words"]);
  const status = text(a["status"]);
  // بلا بيانات أشخاص: البحث بالاسم بعدد كلماته، والجوال بآخر أربعة أرقام (الهجرة 20261110110000).
  const parts = [
    count === null ? null : `العدد: ${formatNumber(count)}`,
    words === null ? null : `بحثٌ بالاسم (${formatNumber(words)} ${words === 1 ? "كلمة" : "كلمات"})`,
    text(a["phone_tail"]) ? `الجوال: …${text(a["phone_tail"])}` : null,
    text(a["program"]) ? `البرنامج: ${text(a["program"])}` : null,
    status ? `الحالة: ${STATUS_LABEL[status] ?? status}` : null,
    text(a["duplicate"]) ? `التكرار: ${DUPLICATE_LABEL[text(a["duplicate"])!] ?? text(a["duplicate"])}` : null,
  ].filter((p) => p !== null);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
