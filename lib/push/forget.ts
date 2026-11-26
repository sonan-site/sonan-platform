import "server-only";
import { cookies } from "next/headers";
import type { createClient } from "@/lib/db/server";
import { PUSH_ENDPOINT_COOKIE, isAllowedEndpoint } from "./shared";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * أجهزة الداخل كلها — إغلاق الحساب، أو كلمةٌ مؤقتة عُيّنت بدلها كلمته (`keepThisDevice`: يبقى الجهاز
 * الذي عيّنها منه، فصاحبه هو).
 */
export async function forgetAllDevices(db: Db, keepThisDevice = false): Promise<void> {
  const endpoint = keepThisDevice ? (await cookies()).get(PUSH_ENDPOINT_COOKIE)?.value : undefined;
  const { error } = await db.rpc("fn_push_unsubscribe_all", isAllowedEndpoint(endpoint) ? { p_keep_endpoint: endpoint } : {});
  if (error) console.error("push: تعذّر حذف أجهزة الحساب", error.message);
}
