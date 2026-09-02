import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env.server";
import type { Database } from "./database.types";

/**
 * عميل الخادم بهوية المستخدم. يمرّ بـ RLS كأي عميل —
 * لا يتجاوزها. تجاوزها حكرٌ على وحدة service-role المعزولة.
 */
export async function createClient() {
  const store = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) {
              store.set(name, value, options);
            }
          } catch {
            // يقع في مكوّن خادم لا يملك تعديل الكوكيز. الـ middleware يتكفّل بالتجديد.
          }
        },
      },
    },
  );
}
