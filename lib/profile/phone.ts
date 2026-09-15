import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

/**
 * الجوال بمفتاح الدولة — وحدة نقيّة تعمل في المتصفح والخادم معاً.
 *
 * **المكتبة لا الكتابة اليدوية:** طول الرقم وبدايته يختلفان في كل دولة، وقائمةٌ
 * مكتوبة باليد لكل الدول تخطئ في أولها. `libphonenumber-js` (بياناتها المصغّرة)
 * هي المرجع الذي تعتمده Google نفسها.
 *
 * **الصيغة المخزَّنة واحدة:** دولية `+9665…` (E.164). والقاعدة ترفض غيرها
 * (الهجرة ٠٣٦)، فكل ما يكتبه المستخدم يُطبَّع هنا قبل أن يصلها.
 */

/** الدولة الافتراضية ودول الخليج — تتقدّم القائمة، والباقي أبجدياً بالعربية. */
const FIRST: readonly CountryCode[] = ["SA", "AE", "KW", "QA", "BH", "OM"];

export type Country = { code: CountryCode; name: string; dial: string };

const regionNames = new Intl.DisplayNames(["ar"], { type: "region" });

function countryName(code: CountryCode): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export const COUNTRIES: readonly Country[] = (() => {
  const all = getCountries().map((code) => ({
    code,
    name: countryName(code),
    dial: `+${getCountryCallingCode(code)}`,
  }));
  const first = FIRST.map((code) => all.find((c) => c.code === code)!).filter(Boolean);
  const rest = all
    .filter((c) => !FIRST.includes(c.code))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  return [...first, ...rest];
})();

export const DEFAULT_COUNTRY: CountryCode = "SA";

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && COUNTRIES.some((c) => c.code === value);
}

/**
 * يطبّع ما كتبه المستخدم إلى الصيغة الدولية، أو `null` إن لم يصلح رقماً.
 *
 * يقبل ما يكتبه الناس فعلاً: `0501234567` · `501234567` · `966501234567` ·
 * `00966501234567` · `+966 50 123 4567` — كلها `+966501234567` مع السعودية.
 * ومن كتب مفتاح دولة أخرى صراحةً (`+971…`) يُحترَم ما كتب.
 */
export function normalizePhone(raw: string, country: CountryCode = DEFAULT_COUNTRY): string | null {
  let value = raw.replace(/[\s\-().]/g, "");
  if (!value) return null;

  // الأرقام الهندية والفارسية تُحوَّل لاتينية: كثيرون يكتبون بلوحة عربية.
  value = value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) =>
    String(d.charCodeAt(0) - 0x06f0),
  );

  if (value.startsWith("00")) value = `+${value.slice(2)}`;

  // مفتاح الدولة المختارة مكتوباً بلا «+»: `966501234567`.
  const dial = getCountryCallingCode(country);
  if (!value.startsWith("+") && value.startsWith(dial) && value.length > dial.length + 6) {
    value = `+${value}`;
  }

  const parsed = parsePhoneNumberFromString(value, country);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** عرضٌ مقروء للرقم المخزَّن: `+966 50 123 4567`. */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/** يفكّك الرقم المخزَّن إلى دولته ورقمه المحلي — لتعبئة الحقلين عند التعديل. */
export function splitPhone(e164: string | null | undefined): { country: CountryCode; national: string } {
  const parsed = e164 ? parsePhoneNumberFromString(e164) : undefined;
  if (!parsed?.country) return { country: DEFAULT_COUNTRY, national: "" };
  return { country: parsed.country, national: parsed.nationalNumber };
}
