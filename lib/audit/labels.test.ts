import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_LABEL, AUDIT_TABLE_LABEL, auditDetail } from "./labels";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const sources = [...files("app"), ...files("supabase/migrations")]
  .filter((f) => /\.(ts|tsx|sql)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

describe("تسميات سجل التدقيق", () => {
  it("**كل فعل يُكتب في السجل له تسمية** — لا رمز خام في شاشة المدير", () => {
    const written = new Set<string>();
    for (const m of sources.matchAll(/p_action:\s*"([a-z_]+)"/g)) written.add(m[1]!);
    for (const m of sources.matchAll(/fn_write_audit\(\s*'([a-z_]+)'/g)) written.add(m[1]!);
    for (const m of sources.matchAll(/values\s*\(\s*null,\s*'([a-z_]+)'/g)) written.add(m[1]!);
    // الفعل المركّب من القرار: قبول ورفض.
    written.add("track_change_approved");
    written.add("track_change_rejected");

    expect([...written].filter((a) => !AUDIT_ACTION_LABEL[a])).toEqual([]);
  });

  it("كل جدول يُكتب عليه تدقيق له تسمية", () => {
    const tables = new Set<string>();
    for (const m of sources.matchAll(/p_entity_table:\s*"([a-z_]+)"/g)) tables.add(m[1]!);
    expect([...tables].filter((t) => !AUDIT_TABLE_LABEL[t])).toEqual([]);
  });
});

describe("تفاصيل الفعل في السجل", () => {
  it("**تصدير الحسابات يُرى بعدده وتصفيته** — «بأي تصفية» شرط القرار", () => {
    expect(
      auditDetail("accounts_exported", { count: 12, name_words: 2, phone_tail: null, program: "بلا برنامج", status: "active" }),
    ).toBe("العدد: 12 · بحثٌ بالاسم (2 كلمات) · البرنامج: بلا برنامج · الحالة: نشط");
    expect(auditDetail("accounts_exported", { count: 1, phone_tail: "8688" })).toBe("العدد: 1 · الجوال: …8688");
    expect(auditDetail("accounts_exported", { count: 22, duplicate: "identity" })).toBe("العدد: 22 · التكرار: مكرّر محتمل");
  });

  it("وبلا تصفية ⇐ العدد وحده", () => {
    expect(auditDetail("accounts_exported", { count: 300 })).toBe("العدد: 300");
  });

  it("**البحث برقم الوثيقة**: وُجد أم لا — بلا الرقم", () => {
    expect(auditDetail("identity_searched", { found: true })).toBe("وُجد حساب");
    expect(auditDetail("identity_searched", { found: false })).toBe("لا حساب بهذا الرقم");
    expect(auditDetail("accounts_exported", { count: 1, by_document: true })).toBe("العدد: 1 · بحثٌ برقم وثيقة");
  });

  it("وفعلٌ آخر، أو `after` فارغ ⇐ «—»", () => {
    expect(auditDetail("role_assigned", { count: 1 })).toBe("—");
    expect(auditDetail("accounts_exported", null)).toBe("—");
  });
});
