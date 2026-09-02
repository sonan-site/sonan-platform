import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// اختصار @/ نفسه المعرَّف في tsconfig — فالاستيراد واحد في الكود والاختبار.
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[\/]$/, "");

/**
 * اختبارات القاعدة — منفصلة عن اختبارات التطبيق.
 * ما يُنفَّذ في القاعدة يُختبَر في القاعدة (platform.md 13): اتصال مباشر
 * لا عبر REST، ليُفحَص ما لا تكشفه الواجهة — السياسات وRLS وامتيازات الدوال.
 */
export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    include: ["**/*.db-test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
