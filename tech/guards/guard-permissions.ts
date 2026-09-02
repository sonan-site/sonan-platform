import { ALL_PERMISSION_CODES, isPermissionCode } from "../../config/permissions.ts";
import type { Finding, Guard } from "./harness.ts";

/**
 * حارس الصلاحيات.
 *
 * **حدّ الدعوى:** يقابل الكتالوج بالمصدر الحيّ في اتجاهين — رمز في الكتالوج
 * بلا مستهلك، ورمز مستهلَك خارج الكتالوج. المقابلة على **الكود وهجرات القاعدة
 * معاً**، لأن أكثر الرموز تُستهلَك في سياسات RLS لا في التطبيق.
 * **لا يكشف** صحّة السياسة ولا تساهلها — ذلك للمراجعة واختبارات القاعدة.
 */

const CONSUMER_PATTERN = /['"]([a-z]+\.[a-z]+)['"]/g;

export const guardPermissions: Guard = {
  name: "guard-permissions",
  claim:
    "يقابل config/permissions.ts بالكود والهجرات. الرمز اليتيم يُكشَف في الاثنين، " +
    "والرمز خارج الكتالوج يُكشَف في SQL وحده — لأن نمط «س.ص» في TypeScript يلتقط " +
    "نصوصاً كثيرة، فالحكم عليه يُنتج بلاغات كاذبة. لا يكشف: صحّة السياسة ولا تساهلها.",

  run(files) {
    const findings: Finding[] = [];
    const consumed = new Map<string, string>();

    const sources = files.filter(
      (f) =>
        (f.ext === ".ts" || f.ext === ".tsx" || f.ext === ".sql") &&
        f.path !== "config/permissions.ts" &&
        !f.path.startsWith("tech/guards/"),
    );

    for (const f of sources) {
      // في SQL: fn_has_permission('code', …) — وفي الكود: permission: "code"
      const relevant = f.ext === ".sql"
        ? [...f.text.matchAll(/fn_has_permission\s*\(\s*'([^']+)'/g)].map((m) => m[1]!)
        : [...f.text.matchAll(CONSUMER_PATTERN)].map((m) => m[1]!);

      for (const code of relevant) {
        // في الكود، النمط `x.y` يلتقط نصوصاً كثيرة. لا نحكم إلا على ما يشبه رمزاً.
        if (f.ext !== ".sql" && !isPermissionCode(code)) continue;
        if (!consumed.has(code)) consumed.set(code, f.path);
      }
    }

    for (const code of ALL_PERMISSION_CODES) {
      if (!consumed.has(code)) {
        findings.push({
          rule: "code-without-consumer",
          file: "config/permissions.ts",
          line: 1,
          message: `الرمز «${code}» في الكتالوج بلا حارس يستهلكه — صلاحية بصرية معكوسة: تُمنَح ولا تفعل شيئاً.`,
        });
      }
    }

    for (const [code, path] of consumed) {
      if (!isPermissionCode(code)) {
        findings.push({
          rule: "consumer-without-code",
          file: path,
          line: 1,
          message: `الرمز «${code}» مستهلَك ولا وجود له في الكتالوج — فحصٌ لا يمرّ أبداً.`,
        });
      }
    }

    return findings;
  },
};
