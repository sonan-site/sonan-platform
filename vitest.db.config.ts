import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// اختصار @/ نفسه المعرَّف في tsconfig — فالاستيراد واحد في الكود والاختبار.
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[\/]$/, "");

/**
 * اختبارات القاعدة — منفصلة عن اختبارات التطبيق.
 * ما يُنفَّذ في القاعدة يُختبَر في القاعدة (platform.md 13): اتصال مباشر
 * لا عبر REST، ليُفحَص ما لا تكشفه الواجهة — السياسات وRLS وامتيازات الدوال.
 */
/**
 * لا تُشغَّل إلا على قاعدة محلّية (adr/0043): الاختبارات تكتب صفوفاً ثم
 * تحذفها، وعلى القاعدة الحيّة تحجز مقاعد مشاركين حقيقيين أثناء التشغيل.
 * وغير المحلّية تُتخطّى بإعلان لا بصمت — وCI يُقلع قاعدته المحلّية فتجري هناك.
 */
const dbHost = (() => {
  try {
    return new URL(process.env.SUPABASE_DB_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
const isLocalDb = dbHost === "127.0.0.1" || dbHost === "localhost";
if (!isLocalDb) {
  console.warn(
    "⚠ اختبارات القاعدة تُخطّيت: SUPABASE_DB_URL ليس قاعدة محلّية (adr/0043). تجري في CI.",
  );
}

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    include: isLocalDb ? ["**/*.db-test.ts"] : [],
    passWithNoTests: !isLocalDb,
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
