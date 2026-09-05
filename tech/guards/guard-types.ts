import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Guard } from "./harness.ts";

const run = promisify(execFile);
const TYPES_PATH = "lib/db/database.types.ts";

/**
 * حارس الأنواع.
 *
 * **حدّ الدعوى:** يُعيد توليد أنواع القاعدة من المصدر الحيّ ويقابلها بالمُودَع.
 * انحرافهما يعني أن الكود يبرمج على مخطط لم يعد قائماً — والمترجم لا يكشفه
 * لأنه يصدّق الملف المُودَع.
 * **لا يكشف** صحّة استخدام الأنواع، ولا يغني عن `tsc`.
 *
 * **تعذّر الفحص مخالفة لا تخطٍّ** (`platform.md §١٢`: الفحص المتعذّر يُسجَّل
 * باسمه لا يُدَّعى). فغياب الرمز أو انقطاع الشبكة يُبقي البوّابة حمراء.
 */

export const guardTypes: Guard = {
  name: "guard-types",
  claim: "يقابل الأنواع المولَّدة بالمُودَعة. لا يكشف: صحّة استخدامها.",

  async run() {
    const project = process.env["SUPABASE_PROJECT_ID"] ?? "cdzkbcatygyaapvzhkjz";
    const token = process.env["SUPABASE_ACCESS_TOKEN"];
    const dbUrl = process.env["SUPABASE_DB_URL"];

    /**
     * مصدران للأنواع، والأول ما يتوفّر:
     *
     * - **رمز الوصول** يولّدها من المشروع البعيد. هذا مسار المطوّر.
     * - **عنوان القاعدة** يولّدها من القاعدة نفسها. هذا مسار CI، وهو أصحّ:
     *   يقابل الأنواع بالهجرات المدفوعة لا بحالة مشروع بعيد قد تسبقها.
     *
     * وغيابهما معاً مخالفة لا تخطٍّ — الفحص المتعذّر يُبقي البوّابة حمراء.
     */
    if (!token && !dbUrl) {
      return [
        {
          rule: "check-unavailable",
          file: TYPES_PATH,
          line: 1,
          message:
            "لا SUPABASE_ACCESS_TOKEN ولا SUPABASE_DB_URL فتعذّرت المقابلة. " +
            "الفحص المتعذّر يُسجَّل مخالفةً لا يُتخطّى.",
        },
      ];
    }

    let generated: string;
    try {
      // نشغّل ملف الأداة بـ node مباشرة: لا شل ولا امتداد .cmd،
      // فيعمل الحارس على ويندوز ولينكس بنفس السطر.
      const require_ = createRequire(import.meta.url);
      const cli = join(dirname(require_.resolve("supabase/package.json")), "dist", "supabase.js");
      const args = token
        ? ["gen", "types", "typescript", "--project-id", project]
        : ["gen", "types", "typescript", "--db-url", dbUrl!];
      const { stdout } = await run(process.execPath, [cli, ...args], {
        maxBuffer: 32 * 1024 * 1024,
      });
      generated = stdout;
    } catch (error) {
      const first = (error as Error).message.split("\n")[0] ?? "سبب غير معروف";
      return [
        {
          rule: "check-unavailable",
          file: TYPES_PATH,
          line: 1,
          message: `تعذّر توليد الأنواع: ${first}`,
        },
      ];
    }

    const committed = await readFile(TYPES_PATH, "utf8");
    const normalise = (value: string) => value.replace(/\r\n/g, "\n").trim();

    if (normalise(generated) !== normalise(committed)) {
      return [
        {
          rule: "generated-differs",
          file: TYPES_PATH,
          line: 1,
          message: "المولَّد يخالف المُودَع. شغّل `pnpm db:types` وأودِع الناتج.",
        },
      ];
    }

    return [];
  },
};
