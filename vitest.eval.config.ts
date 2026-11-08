import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[\/]$/, "");

/**
 * الاختبار الحيّ للمساعد (adr/0057) — `pnpm ask:eval`. **يدويٌّ لا في CI**: يستدعي النموذج الحقيقي
 * فيستهلك من رصيد المفتاح، ويقرأ المنشور من القاعدة الحيّة بمفتاح الزائر وحده.
 * `server-only` يُستبدل بفارغه كما يفعل خادم Next، ليُقرأ المنشور بالوحدة نفسها التي تقرؤه بها الصفحة.
 */
export default defineConfig({
  resolve: { alias: { "@": root, "server-only": `${root}/node_modules/server-only/empty.js` } },
  test: {
    include: ["**/*.eval.ts"],
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 60_000,
  },
});
