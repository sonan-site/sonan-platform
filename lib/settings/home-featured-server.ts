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

/**
 * واجهة البرنامج: برنامج الحملة واجهته الصفحة الرئيسية، وغيره صفحته (خطة الألوان م٨).
 * فكل رابطٍ «إلى صفحة البرنامج» يمرّ من هنا — لا يصل أحدٌ إلى صفحة الكتل وللبرنامج واجهة.
 */
export async function programHomeHref(slug: string): Promise<string> {
  return (await getHomeFeatured()) === slug ? "/" : `/p/${slug}`;
}
