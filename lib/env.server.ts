import { parseEnv } from "./env";

/**
 * فحص الإقلاع. استيراد هذه الوحدة يُفشل التشغيل فوراً عند نقص متغيّر —
 * لا خطأً غامضاً لاحقاً وقت الطلب.
 */
export const env = parseEnv(process.env);
