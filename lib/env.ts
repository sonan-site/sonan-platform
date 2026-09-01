import { z } from "zod";

/**
 * مخطط متغيّرات البيئة.
 * وحدة نقيّة بلا أثر جانبي — تُستهلَك في lib/env.server.ts وفي الاختبارات.
 */

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "عنوان Supabase غير صالح" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "مفتاح anon مطلوب"),
});

export const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "مفتاح service_role مطلوب"),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): ServerEnv;
export function parseEnv(
  source: Record<string, string | undefined>,
  scope: "client",
): ClientEnv;
export function parseEnv(
  source: Record<string, string | undefined>,
  scope: "client" | "server" = "server",
): ClientEnv | ServerEnv {
  const schema = scope === "client" ? clientEnvSchema : serverEnvSchema;
  const result = schema.safeParse(source);

  if (!result.success) {
    const lines = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `متغيّرات البيئة ناقصة أو غير صالحة:\n${lines}\n\n` +
        `انسخ .env.example إلى .env واملأ القيم.`,
    );
  }

  return result.data;
}
