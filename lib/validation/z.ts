import { z } from "zod";
import { formatNumber } from "@/lib/format";

/**
 * `z` بلغة المُعِدّ — **المدخل الوحيد إلى Zod** في التطبيق.
 *
 * كل قاعدة بلا رسالة مكتوبة كانت تُظهر رسالة Zod الافتراضية بالإنجليزية تحت
 * الحقل: «Too big: expected number to be <=366». ولغة Zod العربية المدمجة
 * تقنية كذلك: «يفترض إدخال string». فالرسائل هنا تقول **ما يفعله المستخدم**،
 * والرسالة المكتوبة على القاعدة نفسها تتقدّم عليها دائماً.
 *
 * حارس البنية يمنع استيراد `zod` مباشرة خارج هذا الملف — فلا تفلت قاعدةٌ بلا
 * هذا الإعداد مهما كان ترتيب تحميل الوحدات.
 */

type Issue = Parameters<NonNullable<z.core.$ZodConfig["customError"]>>[0];

export function arabicMessage(issue: Issue): string {
  switch (issue.code) {
    case "invalid_type":
      if (issue.input === undefined || issue.input === null || issue.input === "") {
        return "هذا الحقل مطلوب";
      }
      return issue.expected === "number" || issue.expected === "int"
        ? "أدخل رقماً"
        : "القيمة غير صالحة";

    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string") {
        return min <= 1 ? "هذا الحقل مطلوب" : `لا يقلّ عن ${formatNumber(min)} أحرف`;
      }
      if (issue.origin === "array" || issue.origin === "set") {
        return min <= 1 ? "اختر عنصراً واحداً على الأقل" : `اختر ${formatNumber(min)} عناصر على الأقل`;
      }
      return issue.inclusive
        ? `أقلّ قيمة مسموحة ${formatNumber(min)}`
        : `يجب أن يكون أكبر من ${formatNumber(min)}`;
    }

    case "too_big": {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return `لا يزيد عن ${formatNumber(max)} حرفاً`;
      if (issue.origin === "array" || issue.origin === "set") {
        return `لا يزيد عن ${formatNumber(max)} عنصراً`;
      }
      return issue.inclusive
        ? `أكبر قيمة مسموحة ${formatNumber(max)}`
        : `يجب أن يكون أقلّ من ${formatNumber(max)}`;
    }

    case "invalid_value":
      return "اختر من القائمة";

    case "invalid_format":
      if (issue.format === "email") return "البريد غير صحيح";
      if (issue.format === "uuid" || issue.format === "guid") return "اختر من القائمة";
      return "الصيغة غير صحيحة";

    default:
      return "القيمة غير صالحة";
  }
}

z.config({ customError: arabicMessage });

export { z };
