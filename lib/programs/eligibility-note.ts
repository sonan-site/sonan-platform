/**
 * سطر شروط الأهلية قبل إنشاء الحساب — في واجهة الحملة وبوابة التسجيل (قرار الراعي ٥ نوفمبر).
 *
 * **من إعدادات البرنامج لا مكتوبٌ باليد:** `fn_register` يفرض العمر والجنس والجوال من الأعمدة
 * نفسها، فلا يقول السطر غير ما تفرضه القاعدة. وبلا شرطٍ من الثلاثة لا سطر.
 */
export type EligibilityRules = {
  minAge: number | null;
  allowedGender: "male" | "female" | null;
  requireSaudiPhone: boolean;
};

/** «٣ سنوات» إلى «١٠ سنوات»، وما عداها «سنة» — بأرقام المنصة اللاتينية. */
function years(n: number): string {
  return n >= 3 && n <= 10 ? `${n} سنوات` : `${n} سنة`;
}

export function eligibilityNote(rules: EligibilityRules): string | null {
  const who = [
    rules.allowedGender === "male" ? "للذكور" : rules.allowedGender === "female" ? "للإناث" : null,
    rules.minAge ? `من ${years(rules.minAge)} فأكثر` : null,
  ].filter(Boolean);

  if (who.length > 0) {
    return `المسابقة ${who.join(" ")}${rules.requireSaudiPhone ? "، وتشترط رقم جوال سعودي." : "."}`;
  }
  return rules.requireSaudiPhone ? "تشترط المسابقة رقم جوال سعودي." : null;
}
