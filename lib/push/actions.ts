"use server";

import { cookies, headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { z } from "@/lib/validation/z";
import { PUSH_ENDPOINT_COOKIE, deviceFromUserAgent, isAllowedEndpoint } from "./shared";

/**
 * تفعيل إشعارات الجهاز وإيقافها (`adr/0064`) — للداخل على هذا الجهاز وحده. والكتابة بدوال القاعدة
 * (`fn_push_*`) التي تأخذ الحساب من الجلسة.
 */

const endpointSchema = z.string().refine(isAllowedEndpoint);
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  p256dh: z.string().min(40).max(200),
  auth: z.string().min(10).max(100),
});

const YEAR_SECONDS = 365 * 86_400;

/** يُحفظ عنوان هذا الجهاز في كوكي لا يقرؤه المتصفح، فتُبقي الكلمةُ المؤقتة هذا الجهاز وحده (م٤). */
async function rememberEndpoint(endpoint: string) {
  const jar = await cookies();
  jar.set(PUSH_ENDPOINT_COOKIE, endpoint, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: YEAR_SECONDS,
  });
}

export async function subscribePush(input: { endpoint: string; p256dh: string; auth: string }): Promise<boolean> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return false;
  const session = await getSession();
  if (session.status !== "active") return false;

  const device = deviceFromUserAgent((await headers()).get("user-agent"));
  const db = await createClient();
  const { error } = await db.rpc("fn_push_subscribe", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
    p_device: device,
  });
  if (error) {
    console.error("push: تعذّر التفعيل", error.message);
    return false;
  }
  await rememberEndpoint(parsed.data.endpoint);
  return true;
}

/** يُعيد عدد من بقي على هذا الجهاز من حساباتٍ أخرى — فإن لم يبقَ أحد ألغى المتصفح اشتراكه. */
export async function unsubscribePush(endpoint: string): Promise<number | null> {
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("fn_push_unsubscribe", { p_endpoint: parsed.data });
  if (error) {
    console.error("push: تعذّر الإيقاف", error.message);
    return null;
  }
  return data ?? 0;
}

/** أمفعّلٌ هذا الجهاز للداخل؟ — من الخادم لا من المتصفح، فالجهاز قد يحمل حساباتٍ أخرى (م٣). */
export async function pushIsMine(endpoint: string): Promise<boolean> {
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return false;
  const db = await createClient();
  const { data } = await db.rpc("fn_push_is_mine", { p_endpoint: parsed.data });
  return data === true;
}
