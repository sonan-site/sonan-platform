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
  auth_showcase_updated: "تعديل شرائح واجهة الدخول",
  user_suspended: "إيقاف حساب",
  user_restored: "إعادة تفعيل حساب",
  account_closed: "إغلاق حساب بطلب صاحبه",
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
  page_block_added: "إضافة عنصر للصفحة",
  page_block_removed: "حذف عنصر من الصفحة",
  participant_registered: "تسجيل مشارك",
  participant_status_changed: "تغيير حالة مشارك",
  participant_track_assigned: "إسناد مسار لمشارك",
  track_change_requested: "طلب تغيير مسار",
  track_change_approved: "قبول تغيير مسار",
  track_change_rejected: "رفض تغيير مسار",
  rate_limit_exceeded: "محاولات كثيرة متتالية",
  rate_limit_misconfigured: "إعداد حدّ المحاولات ناقص",
};

export const AUDIT_TABLE_LABEL: Record<string, string> = {
  profiles: "حساب",
  user_roles: "إسناد دور",
  sections: "قسم",
  programs: "برنامج",
  tracks: "مسار",
  content_units: "مادة",
  plan_days: "خطة",
  page_blocks: "الصفحة المعلنة",
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
