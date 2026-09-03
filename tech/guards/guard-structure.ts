import { scan, type Finding, type Guard } from "./harness.ts";

/**
 * حارس البنية.
 *
 * **حدّ الدعوى:** يكشف بناءً موازياً للجوامع — جدول خام، تخطيط موضعي،
 * عنصر تنقّل خارج مصدره — وتصديراً غير دالّة من ملف `"use server"`.
 * **لا يكشف** صحّة استخدام الجامع ولا اكتمال أعمدته — ذلك للمراجعة.
 */

/**
 * الحارس لا يمسح نفسه: كوده يحوي بالضرورة الأنماط التي يصطادها.
 * هذا **حدّ دعوى** لا استثناء — لا شيء يُسكَت، بل لا شيء يُدَّعى فحصه أصلاً.
 */
const SELF = "tech/guards/";

export const guardStructure: Guard = {
  name: "guard-structure",
  claim:
    "يكشف: <table> خام · تخطيط موضعي · <nav> خارج مصدره · تصدير غير دالّة من " +
    "ملف \"use server\". لا يكشف: صحّة استخدام الجامع.",

  run(files) {
    const findings: Finding[] = [];

    for (const f of files.filter((x) => x.ext === ".tsx" && !x.path.startsWith(SELF))) {
      findings.push(
        ...scan(f, /<table[\s>]/, "raw-table", () =>
          "جدول خام. استخدم DataTable من components/shared — الحالة في الرابط والبطاقات على الجوال مبنيّة فيه.",
        ),
      );
      findings.push(
        ...scan(f, /<nav[\s>]/, "nav-outside-source", () =>
          "عنصر تنقّل خارج التخطيط الجامع. مصدر التنقّل الوحيد config/navigation.ts.",
        ),
      );
    }

    // تخطيط موضعي: أي layout تحت app/ عدا الجذر يجب أن يمرّ بالتخطيط الجامع
    for (const f of files) {
      if (!f.path.startsWith("app/") || !f.path.endsWith("layout.tsx")) continue;
      if (f.path === "app/layout.tsx") continue;
      if (f.text.includes("AppLayout")) continue;
      findings.push({
        rule: "local-layout",
        file: f.path,
        line: 1,
        message: "تخطيط موضعي لا يمرّ بـ AppLayout. التخطيط الجامع واحد لا يُنسَخ.",
      });
    }

    // ── ملف `"use server"` لا يُصدِّر إلا دوالّ غير متزامنة ──
    // **عطبٌ يمرّ من `next build` ومن كل الاختبارات ثم يكسر الصفحة وقت
    // التشغيل.** وقع فعلاً على أربع شاشات مصادقة وشاشة الخطط، فتعذّر الدخول
    // إلى المنصة كلها. والقاعدة بنيوية فيُمسكها حارس لا مراجعة.
    for (const f of files) {
      if (f.ext !== ".ts" && f.ext !== ".tsx") continue;
      if (f.path.startsWith(SELF)) continue;
      if (!/^\s*["']use server["'];/m.test(f.text)) continue;

      const lines = f.text.split(String.fromCharCode(10));
      lines.forEach((line, index) => {
        const match = /^export\s+(?:const|let|var|class|function)\s/.exec(line);
        if (!match) return;
        if (/^export\s+async\s+function\s/.test(line)) return;
        findings.push({
          rule: "use-server-non-function-export",
          file: f.path,
          line: index + 1,
          message:
            "ملف \"use server\" يُصدِّر غير دالّة غير متزامنة. يكسر الصفحة وقت " +
            "التشغيل ولا يكشفه البناء — انقل القيمة إلى وحدة عادية.",
        });
      });
    }

    return findings;
  },
};
