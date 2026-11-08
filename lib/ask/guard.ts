import { toLatinDigits } from "@/lib/format";

/**
 * حارس ما قبل الإرسال (adr/0057): **كل رقمٍ في الجواب يرد في المصادر أو في السؤال.**
 *
 * التاريخ رقمٌ أيضاً (اليوم والسنة)، فالفحص واحد. وأخطر خطأ للمساعد رقمٌ أو موعدٌ
 * مخترَع — يقرؤه ولي الأمر فيبني عليه. وما لا يُمسك هنا (صياغةٌ مضلِّلة بلا رقم)
 * يبقى لزرّ البلاغ.
 */

const NUMBER = /\d+(?:[.,٫]\d+)*/g;

/** الأرقام في النص، لاتينيةً وبلا فواصل الآلاف: «42,500» و«٤٢٬٥٠٠» ← «42500». */
export function numbersIn(text: string): Set<string> {
  const latin = toLatinDigits(text).replace(/[٬]/g, ",");
  const out = new Set<string>();
  for (const m of latin.matchAll(NUMBER)) {
    const n = m[0].replace(/,(?=\d{3}\b)/g, "").replace(/[٫,]/g, ".");
    out.add(n.replace(/^0+(?=\d)/, ""));
  }
  return out;
}

/** الأرقام في الجواب التي لا أصل لها — فارغة = يمرّ. */
export function unsupportedNumbers(answer: string, sources: string, question: string): string[] {
  const known = new Set([...numbersIn(sources), ...numbersIn(question)]);
  return [...numbersIn(answer)].filter((n) => !known.has(n));
}
