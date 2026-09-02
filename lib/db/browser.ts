import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * عميل المتصفح. يحمل مفتاح anon وحده — وكل حماية فعلية في القاعدة عبر RLS.
 * المتغيّرات تُستبدل حرفياً وقت البناء، والبناء نفسه يفشل عند نقصها
 * لأن next.config يستورد lib/env.server.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
