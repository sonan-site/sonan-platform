import { z } from "zod";

/**
 * مخطط متغيّرات البيئة.
 * وحدة نقيّة بلا أثر جانبي — تُستهلَك في lib/env.server.ts وفي الاختبارات.
 */

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "عنوان Supabase غير صالح" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "مفتاح anon مطلوب"),
  // إشعارات الجهاز (adr/0064) — اختياري: غيابه يُخفي زرّ التفعيل وحده.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
});

export const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "مفتاح service_role مطلوب"),
  // اختياري عمداً (adr/0057): غيابه أو فراغه يُطفئ المساعد وحده ولا يُسقط المنصة.
  ANTHROPIC_API_KEY: z.string().optional(),
  // إشعارات الجهاز (adr/0064) — اختيارية كلها: غياب أيٍّ منها يُطفئ الإرسال وحده. و`PUSH_ENABLED=off`
  // مفتاح الإيقاف: المُرسِل يحجز ولا يرسل (م١٠).
  VAPID_PRIVATE_KEY: z.string().optional(),
  PUSH_DISPATCH_SECRET: z.string().optional(),
  PUSH_ENABLED: z.string().optional(),
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
