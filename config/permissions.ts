/**
 * كتالوج الصلاحيات — **ثابت في الكود**، والأدوار حرّة في القاعدة (adr/0006).
 *
 * لا رمز يدخل هنا بلا حارس يستهلكه، ولا مستهلَك خارج هذا الملف —
 * يقابلهما `guard-permissions` بالمصدر الحيّ ويفشل عند أي اختلاف.
 * الممنوح بلا حارس صلاحيةٌ بصرية معكوسة: تبدو ممنوحة ولا تفعل شيئاً.
 */

export const PERMISSION_SECTIONS = {
  users: "المستخدمون",
  identities: "الهويات",
  roles: "الأدوار",
  settings: "الإعدادات",
  attachments: "المرفقات",
  audit: "سجل التدقيق",
  sections: "الأقسام",
  programs: "البرامج",
  participants: "المشاركون",
} as const;

export type PermissionSection = keyof typeof PERMISSION_SECTIONS;

type Entry = { section: PermissionSection; label: string };

export const PERMISSIONS = {
  "users.read": { section: "users", label: "عرض المستخدمين" },
  "users.write": { section: "users", label: "تعديل المستخدمين وإيقافهم وحذفهم" },
  // رقم الهوية بيانٌ حسّاس (adr/0047): `users.read` يراه مقنّعاً، وهذان كاملاً وتصحيحاً.
  "identities.read": { section: "identities", label: "عرض أرقام الهويات كاملة" },
  "identities.write": { section: "identities", label: "تصحيح أرقام الهويات" },

  "roles.read": { section: "roles", label: "عرض الأدوار وصلاحياتها" },
  "roles.write": { section: "roles", label: "إنشاء الأدوار وتعديل صلاحياتها" },
  "roles.assign": { section: "roles", label: "إسناد الأدوار للمستخدمين" },

  "settings.read": { section: "settings", label: "عرض الإعدادات" },
  "settings.write": { section: "settings", label: "تعديل الإعدادات" },

  "attachments.read": { section: "attachments", label: "عرض مرفقات الآخرين" },
  "attachments.write": { section: "attachments", label: "تعديل مرفقات الآخرين" },

  "audit.read": { section: "audit", label: "قراءة سجل التدقيق" },

  "sections.read": { section: "sections", label: "عرض الأقسام" },
  "sections.write": { section: "sections", label: "إنشاء الأقسام وتعديلها" },

  "programs.read": { section: "programs", label: "عرض البرامج غير المنشورة" },
  "programs.write": { section: "programs", label: "إنشاء البرامج والمسارات وتعديلها" },

  "participants.read": { section: "participants", label: "عرض المشاركين وإجاباتهم" },
  "participants.write": {
    section: "participants",
    label: "تعديل المشاركين والبتّ في طلبات تغيير المسار",
  },
} as const satisfies Record<string, Entry>;

export type PermissionCode = keyof typeof PERMISSIONS;

export const ALL_PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

/** يقابل ما في القاعدة بما في الكود. يستهلكه حارس الصلاحيات واختباراته. */
export function isPermissionCode(value: string): value is PermissionCode {
  return value in PERMISSIONS;
}

export function permissionsBySection(): Record<PermissionSection, PermissionCode[]> {
  const out = {} as Record<PermissionSection, PermissionCode[]>;
  for (const key of Object.keys(PERMISSION_SECTIONS) as PermissionSection[]) {
    out[key] = ALL_PERMISSION_CODES.filter((c) => PERMISSIONS[c].section === key);
  }
  return out;
}
