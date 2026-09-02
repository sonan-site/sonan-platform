import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// اختصار @/ نفسه المعرَّف في tsconfig — فالاستيراد واحد في الكود والاختبار.
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[\/]$/, "");

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "**/*.db-test.ts"],
  },
});
