import type { Finding, Guard, SourceFile } from "./harness.ts";

/**
 * حارس الاكتمال — وفق `completeness-contract §٣`.
 *
 * **حدّ الدعوى:** يكشف **الوصلات الغائبة بنيوياً**: جدول بلا أعمدة نواة، جدول
 * بلا RLS في هجرة إنشائه، صفحة بلا مدخل تنقّل ولا تصريح، إجراء خادم لا يبدأ
 * بالتحقّق، جدول في القاعدة غير مسجَّل في المواصفة، وقاعدة عمل موثّقة بلا وسم
 * في الكود أو وسم بلا قاعدة.
 * **لا يكشف** صحّة المنطق ولا جودة السياسة — تلك للاختبارات والمراجعة.
 */

const CORE_COLUMNS = ["id", "created_at", "updated_at", "deleted_at"];

export const guardCompleteness: Guard = {
  name: "guard-completeness",
  claim:
    "يكشف الوصلات الغائبة بنيوياً بين الهجرات والمواصفة والصفحات والتنقّل. " +
    "لا يكشف: صحّة المنطق ولا جودة السياسة.",

  run(files) {
    const findings: Finding[] = [];
    const migrations = files.filter((f) => f.path.startsWith("supabase/migrations/"));
    const entities = files.find((f) => f.path === "docs/ENTITIES.md");
    const navigation = files.find((f) => f.path === "config/navigation.ts");

    // ── الجداول: أعمدة النواة و RLS في نفس هجرة الإنشاء ──
    const declared = new Set<string>();

    for (const migration of migrations) {
      const blocks = [
        ...migration.text.matchAll(
          /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g,
        ),
      ];

      for (const block of blocks) {
        const name = block[1];
        const body = block[2];
        if (!name || !body) continue;
        declared.add(name);
        const line = lineOf(migration, "create table", name);

        for (const column of CORE_COLUMNS) {
          if (!new RegExp(`^\\s*${column}\\b`, "m").test(body)) {
            findings.push({
              rule: "table-missing-core-column",
              file: migration.path,
              line,
              message: `الجدول «${name}» ينقصه العمود الإلزامي «${column}».`,
            });
          }
        }

        const rls = new RegExp(`alter table public\\.${name}\\s+enable row level security`);
        if (!rls.test(migration.text)) {
          findings.push({
            rule: "table-without-rls",
            file: migration.path,
            line,
            message: `الجدول «${name}» بلا RLS في هجرة إنشائه — مورد بلا حماية ولو لحظة.`,
          });
        }
      }
    }

    // ── المواصفة مقابل القاعدة ──
    if (entities) {
      for (const table of declared) {
        if (!entities.text.includes("`" + table + "`")) {
          findings.push({
            rule: "table-not-in-spec",
            file: "docs/ENTITIES.md",
            line: 1,
            message: `الجدول «${table}» في القاعدة وغير مسجَّل في المواصفة.`,
          });
        }
      }

      // ── قواعد الأعمال: الرمز الموثّق له وسم في الكود، والوسم له قاعدة ──
      const documented = new Set(
        [...entities.text.matchAll(/`(BR-[A-Z]+-\d+)`/g)].map((m) => m[1] as string),
      );

      const tagged = new Set<string>();
      for (const file of files) {
        if (file.path === "docs/ENTITIES.md") continue;
        if (file.path.startsWith("tech/guards/")) continue;
        for (const m of file.text.matchAll(/\b(BR-[A-Z]+-\d+)\b/g)) tagged.add(m[1] as string);
      }

      for (const code of documented) {
        if (!tagged.has(code)) {
          findings.push({
            rule: `rule-without-code:${code}`,
            file: "docs/ENTITIES.md",
            line: 1,
            message: `القاعدة «${code}» موثّقة بلا وسم تتبّع في الكود.`,
          });
        }
      }

      for (const code of tagged) {
        if (!documented.has(code)) {
          findings.push({
            rule: "code-without-rule",
            file: "docs/ENTITIES.md",
            line: 1,
            message: `الوسم «${code}» في الكود بلا قاعدة موثّقة في المواصفة.`,
          });
        }
      }
    }

    // ── الصفحات مقابل مصدر التنقّل ──
    if (navigation) {
      for (const file of files) {
        if (!/^app\/\(platform\)\/.+\/page\.tsx$/.test(file.path)) continue;
        const route =
          "/" + file.path.replace(/^app\/\(platform\)\//, "").replace(/\/page\.tsx$/, "");
        if (!navigation.text.includes(`"${route}"`)) {
          findings.push({
            rule: "page-without-nav-entry",
            file: file.path,
            line: 1,
            message: `الصفحة «${route}» بلا مدخل في config/navigation.ts ولا تصريح باستثنائها.`,
          });
        }
      }
    }

    // ── إجراءات الخادم تبدأ بالتحقّق ──
    for (const file of files) {
      if (!file.path.endsWith("actions.ts")) continue;
      if (!/\.(safeParse|parse)\s*\(/.test(file.text)) {
        findings.push({
          rule: "action-without-validation",
          file: file.path,
          line: 1,
          message:
            "إجراء خادم بلا تحقّق Zod. كل إجراء يبدأ بالتحقّق ثم الفحص رباعي الطبقات.",
        });
      }
    }

    return findings;
  },
};

function lineOf(file: SourceFile, needle: string, name: string): number {
  const index = file.lines.findIndex((line) => line.includes(needle) && line.includes(name));
  return index === -1 ? 1 : index + 1;
}
