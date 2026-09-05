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
      // `--schema public` صراحةً في الطريقين: التوليد من عنوان القاعدة يشمل
      // كل المخططات غير النظامية (`graphql_public` منها)، والتوليد من
      // المشروع يتبع مخططاته المعروضة. فبلا تثبيت لا يتّفق المصدران أبداً.
      const args = token
        ? ["gen", "types", "typescript", "--schema", "public", "--project-id", project]
        : ["gen", "types", "typescript", "--schema", "public", "--db-url", dbUrl!];
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
      // **أين** يختلف لا أنه اختلف. رسالةٌ تقول «شغّل الأمر» لا تنفع في CI،
      // حيث لا يستطيع القارئ تشغيل شيء — ولا تنفع من يبحث عن السبب.
      const nl = String.fromCharCode(10);
      const left = normalise(committed).split(nl);
      const right = normalise(generated).split(nl);
      const at = left.findIndex((line, i) => line !== right[i]);
      const sample =
        at < 0
          ? `الطول مختلف: المُودَع ${left.length} سطراً والمولَّد ${right.length}.`
          : `أول اختلاف عند السطر ${at + 1}:
     المُودَع : ${left[at] ?? "(ينتهي)"}
     المولَّد: ${right[at] ?? "(ينتهي)"}`;

      return [
        {
          rule: "generated-differs",
          file: TYPES_PATH,
          line: at < 0 ? 1 : at + 1,
          message: `المولَّد يخالف المُودَع. شغّل \`pnpm db:types\` وأودِع الناتج.
     ${sample}`,
        },
      ];
    }

    return [];
  },
};
