import { describe, expect, it } from "vitest";
import { authorize, type AuthzChecker } from "./authorize";

const checker = (over: Partial<AuthzChecker> = {}): AuthzChecker => ({
  currentUserId: async () => "user-1",
  hasPermission: async () => true,
  ...over,
});

describe("الفاحص رباعي الطبقات", () => {
  it("يمرّر حين تنجح الطبقات الأربع", async () => {
    const r = await authorize({ permission: "users.read" }, checker());
    expect(r).toEqual({ ok: true, userId: "user-1" });
  });

  it("يرفض عند طبقة المصادقة ويسمّيها", async () => {
    const r = await authorize(
      { permission: "users.read" },
      checker({ currentUserId: async () => null }),
    );
    expect(r).toMatchObject({ ok: false, stage: "auth" });
  });

  it("يرفض عند طبقة الصلاحية ويسمّي الرمز", async () => {
    const r = await authorize(
      { permission: "roles.assign" },
      checker({ hasPermission: async () => false }),
    );
    expect(r).toMatchObject({ ok: false, stage: "permission" });
    if (!r.ok) expect(r.message).toContain("roles.assign");
  });

  it("يرفض مورداً خارج النطاق المصرَّح به", async () => {
    const r = await authorize(
      { permission: "settings.write", programId: "prog-a", resourceProgramId: "prog-b" },
      checker(),
    );
    expect(r).toMatchObject({ ok: false, stage: "scope" });
  });

  it("يقبل مورداً داخل النطاق نفسه", async () => {
    const r = await authorize(
      { permission: "settings.write", programId: "prog-a", resourceProgramId: "prog-a" },
      checker(),
    );
    expect(r.ok).toBe(true);
  });

  it("النطاق العام يشمل أي مورد", async () => {
    const r = await authorize(
      { permission: "settings.write", programId: null, resourceProgramId: "prog-z" },
      checker(),
    );
    expect(r.ok).toBe(true);
  });

  it("غياب نطاق المورد رفضٌ لا تساهل", async () => {
    const r = await authorize(
      { permission: "settings.write", resourceProgramId: null },
      checker(),
    );
    expect(r).toMatchObject({ ok: false, stage: "scope" });
  });

  it("يرفض عند طبقة الحالة برسالتها", async () => {
    const r = await authorize(
      { permission: "settings.write", state: () => false, stateMessage: "البرنامج مغلق" },
      checker(),
    );
    expect(r).toMatchObject({ ok: false, stage: "state", message: "البرنامج مغلق" });
  });

  it("يتوقّف عند أول طبقة ترفض ولا يتجاوزها", async () => {
    let stateChecked = false;
    const r = await authorize(
      {
        permission: "users.write",
        state: () => {
          stateChecked = true;
          return true;
        },
      },
      checker({ hasPermission: async () => false }),
    );
    expect(r).toMatchObject({ ok: false, stage: "permission" });
    expect(stateChecked, "طبقة الحالة نُفِّذت رغم رفض الصلاحية").toBe(false);
  });
});
