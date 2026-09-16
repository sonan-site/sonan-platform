import { describe, expect, it } from "vitest";
import type { PermissionCode } from "./permissions";
import { listNavigation, visibleNavigation, type Viewer } from "./navigation";

const keys = (viewer: Viewer) => visibleNavigation(viewer).map((i) => i.key);
const perms = (...codes: PermissionCode[]) => new Set<PermissionCode>(codes);

const ADMIN_CODES = perms("users.read", "programs.read", "roles.read", "audit.read");

describe("التنقّل بحسب من يدخل", () => {
  it("**المدير بلا مشاركة لا يرى «رحلتي»** — مدخلٌ لا يخصّه", () => {
    expect(keys({ granted: ADMIN_CODES, isParticipant: false })).toEqual([
      "dashboard",
      "users",
      "programs",
      "roles",
      "audit",
      "account",
    ]);
  });

  it("المشارك بلا صلاحية يرى لوحته ورحلته فقط", () => {
    expect(keys({ granted: perms(), isParticipant: true })).toEqual(["dashboard", "journey", "account"]);
  });

  it("الموظف المشارك في برنامج يرى ما تسمح به صلاحياته ورحلته", () => {
    expect(keys({ granted: perms("programs.read"), isParticipant: true })).toEqual([
      "dashboard",
      "programs",
      "journey",
      "account",
    ]);
  });

  it("الحساب الجديد بلا صلاحية ولا مشاركة يرى لوحته فقط", () => {
    expect(keys({ granted: perms(), isParticipant: false })).toEqual(["dashboard", "account"]);
  });
});

describe("«حسابي» في الرأس وحده", () => {
  const visible = visibleNavigation({ granted: ADMIN_CODES, isParticipant: false });

  it("**لا يُكرَّر في القائمة ولا في الشريط السفلي** — الرأس يحمله على كل شاشة", () => {
    expect(listNavigation(visible).map((i) => i.key)).not.toContain("account");
  });

  it("ويبقى مدخلاً مسجَّلاً برابطه — فلكل صفحة مدخل", () => {
    expect(visible.find((i) => i.key === "account")?.href).toBe("/account");
  });
});
