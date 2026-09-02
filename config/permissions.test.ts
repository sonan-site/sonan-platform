import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSION_CODES,
  isPermissionCode,
  PERMISSIONS,
  PERMISSION_SECTIONS,
  permissionsBySection,
} from "./permissions";

describe("كتالوج الصلاحيات", () => {
  it("كل رمز بصيغة قسم.فعل، وقسمه معرَّف", () => {
    for (const code of ALL_PERMISSION_CODES) {
      expect(code, `الرمز ${code} ليس بصيغة قسم.فعل`).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(code.split(".")[0]).toBe(PERMISSIONS[code].section);
      expect(PERMISSION_SECTIONS).toHaveProperty(PERMISSIONS[code].section);
    }
  });

  it("لكل رمز مسمّى عربي غير فارغ", () => {
    for (const code of ALL_PERMISSION_CODES) {
      expect(PERMISSIONS[code].label.trim().length).toBeGreaterThan(0);
    }
  });

  it("لا قسم بلا رموز — قسم فارغ تصنيفٌ بلا محتوى", () => {
    for (const [section, codes] of Object.entries(permissionsBySection())) {
      expect(codes.length, `القسم ${section} بلا رموز`).toBeGreaterThan(0);
    }
  });

  it("يميّز الرمز المعروف من المجهول", () => {
    expect(isPermissionCode("users.read")).toBe(true);
    expect(isPermissionCode("users.destroy")).toBe(false);
  });
});
