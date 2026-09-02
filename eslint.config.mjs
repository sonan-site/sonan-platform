import next from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

/**
 * بوّابة الأسلوب — الطبقة اللغوية.
 * القواعد البنيوية (الخصائص الاتجاهية · القيم الخام · الإيموجي · مكتبة أيقونات
 * ثانية · new Date خارج وحدة الوقت) تُفرَض بالحرّاس في tech/guards، لا هنا.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "docs/**", "db/**"],
  },
  ...next,
  {
    name: "sonan/strict",
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
];

export default config;
