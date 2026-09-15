/**
 * حالة الحساب من ملفه — وحدة نقيّة.
 *
 * **ثلاث لا اثنتان** (`adr/0025`): الحساب بلا ملفٍ لم يكن «موقوفاً» بل **ناقصاً** —
 * دخل بـ Google ولم يكتب جواله بعد. وخلطهما كان يعرض على صاحبه صفحة إيقاف لم
 * يستحقّها، ولا يقول له ما ينقصه.
 */

export type AccountState = "active" | "suspended" | "incomplete";

export function accountState(profile: { deleted_at: string | null } | null): AccountState {
  if (!profile) return "incomplete";
  return profile.deleted_at === null ? "active" : "suspended";
}

/** الاسم الذي يقترحه مزوّد الدخول — Google يرسله `full_name` أو `name`. */
export function suggestedName(metadata: Record<string, unknown> | undefined): string {
  const value = metadata?.["full_name"] ?? metadata?.["name"];
  return typeof value === "string" ? value.trim() : "";
}
