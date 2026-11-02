/**
 * خيارات سؤال القائمة من نصّ «سطرٌ لكل خيار» — توأم `fn_admission_options_valid` في القاعدة:
 * ٢–٣٠ خياراً، كلٌّ ١–٨٠ حرفاً مشذَّباً، بلا تكرار. والأسطر الفارغة تُهمل.
 */

export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 30;
export const OPTION_MAX_LENGTH = 80;

export function parseOptions(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** رسالة الخطأ، أو `null` حين تصلح الخيارات. */
export function optionsError(options: string[]): string | null {
  if (options.length < OPTIONS_MIN) return "اكتب خيارين فأكثر، سطراً لكل خيار.";
  if (options.length > OPTIONS_MAX) return `الخيارات ${OPTIONS_MAX} على الأكثر.`;
  if (options.some((o) => o.length > OPTION_MAX_LENGTH)) return `الخيار ${OPTION_MAX_LENGTH} حرفاً على الأكثر.`;
  if (new Set(options).size !== options.length) return "في الخيارات تكرار.";
  return null;
}
