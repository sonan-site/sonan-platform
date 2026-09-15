import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import { parseShowcase, type Showcase } from "./showcase";

/** الشرائح لشاشة الدخول. خطأ القاعدة لا يمنع الدخول — يعني «لا شرائح». */
export const getShowcase = cache(async (): Promise<Showcase> => {
  const db = await createClient();
  const { data, error } = await db.rpc("fn_auth_showcase");
  return error ? { slides: [] } : parseShowcase(data);
});
