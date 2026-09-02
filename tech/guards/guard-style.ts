import { scan, type Finding, type Guard, type SourceFile } from "./harness.ts";

/**
 * حارس الأسلوب.
 *
 * **حدّ الدعوى:** يكشف مخالفات نصّية في المصدر — خاصية اتجاهية، قيمة لون أو
 * مسافة أو حجم خطّ مكتوبة مباشرة، إيموجي في الواجهة، مكتبة أيقونات ثانية،
 * وقتاً محيطاً خارج منفذه.
 * **لا يكشف** جمال التصميم، ولا صحّة اختيار الرمز، ولا التباين — تلك للمراجعة.
 */

/**
 * الحارس لا يمسح نفسه: كوده يحوي بالضرورة الأنماط التي يصطادها.
 * هذا **حدّ دعوى** لا استثناء — لا شيء يُسكَت، بل لا شيء يُدَّعى فحصه أصلاً.
 */
const SELF = "tech/guards/";

const IS_STYLE = (f: SourceFile) => f.ext === ".css" && !f.path.startsWith(SELF);
const IS_TSX = (f: SourceFile) => f.ext === ".tsx" && !f.path.startsWith(SELF);

export const guardStyle: Guard = {
  name: "guard-style",
  claim:
    "يكشف: الاتجاهية · القيم الخام · الإيموجي · مكتبة أيقونات ثانية · الوقت المحيط. " +
    "لا يكشف: جودة التصميم ولا التباين.",

  run(files) {
    const findings: Finding[] = [];

    // ── الاتجاهية: الصفحة عربية، والخصائص المنطقية تنعكس معها ──
    for (const f of files.filter(IS_STYLE)) {
      findings.push(
        ...scan(
          f,
          /\b(margin|padding|border)-(left|right)\s*:|(?<![-\w])(left|right)\s*:\s*(?!auto)|text-align\s*:\s*(left|right)\b/,
          "directional-property",
          (m) =>
            `خاصية اتجاهية «${m[0].trim()}». استخدم المنطقية: inline-start/end · text-align: start/end.`,
        ),
      );
    }

    // ── لون خام: خارج tokens.css لا لون إلا عبر رمز ──
    for (const f of files.filter((x) => IS_STYLE(x) || IS_TSX(x))) {
      findings.push(
        ...scan(
          f,
          /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/,
          "raw-color",
          (m) => `لون خام «${m[0]}». عرّفه رمزاً في config/tokens.css واستهلكه بـ var().`,
        ),
      );
    }

    // ── مقاس خام: المسافات من سلّم 4px، والنصّ من سلّم واحد ──
    // الشعرة (1px · 2px) مستثناة بحكم الطبيعة: حدّ ومخطط بؤرة، لا مسافة.
    for (const f of files.filter(IS_STYLE)) {
      findings.push(
        ...scan(
          f,
          /\b(padding|margin|gap|font-size)(?:-[a-z-]+)?\s*:\s*[^;]*?(?<!var\([^;)]{0,40})\b(?!0\b|1px|2px)\d+(?:\.\d+)?(px|rem|em)\b/,
          "raw-size",
          (m) => `مقاس خام في «${m[0].trim().slice(0, 44)}». خذه من سلّم --space-* أو --text-*.`,
        ),
      );
    }

    // ── الإيموجي ممنوع في الواجهة (محتوى المستخدم فقط) ──
    for (const f of files.filter(IS_TSX)) {
      findings.push(
        ...scan(
          f,
          /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u,
          "emoji-in-ui",
          (m) => `إيموجي «${m[0]}» في الواجهة. استخدم أيقونة Lucide.`,
        ),
      );
    }

    // ── مكتبة أيقونات ثانية ──
    for (const f of files.filter((x) => (x.ext === ".ts" || x.ext === ".tsx") && !x.path.startsWith(SELF))) {
      findings.push(
        ...scan(
          f,
          /from\s+["'](react-icons|@heroicons|phosphor-react|@phosphor-icons|@tabler\/icons|feather-icons)[^"']*["']/,
          "second-icon-library",
          (m) => `مكتبة أيقونات ثانية «${m[1]}». المعتمدة lucide-react وحدها.`,
        ),
      );
    }

    // ── الوقت المحيط: `new Date()` بلا وسائط و`Date.now()` ──
    // البناء بتاريخ صريح `new Date("2026-…")` مسموح: ليس وقتاً محيطاً.
    for (const f of files.filter((x) => (x.ext === ".ts" || x.ext === ".tsx") && !x.path.startsWith(SELF))) {
      findings.push(
        ...scan(
          f,
          /new\s+Date\s*\(\s*\)|Date\.now\s*\(\s*\)/,
          "native-date",
          (m) => `وقت محيط «${m[0]}» خارج منفذه. استخدم now() من lib/format.`,
        ),
      );
    }

    return findings;
  },
};
