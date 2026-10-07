import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";

/**
 * رابط برنامج الحملة **المنشور** — أو لا شيء فتُعرض الصفحة الرئيسية كما هي.
 * وخطأ القاعدة يعني «لا حملة»: الصفحة الرئيسية لا تسقط لأجل مفتاح.
 */
export const getHomeFeatured = cache(async (): Promise<string | null> => {
  const db = await createClient();
  const { data, error } = await db.rpc("fn_home_featured");
  return error || typeof data !== "string" || data === "" ? null : data;
});
