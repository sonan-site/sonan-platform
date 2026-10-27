"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MODE_COOKIE, isSessionMode } from "@/lib/auth/mode";
import { createClient } from "@/lib/db/server";

/** الخروج يعيد صاحبه إلى **بابه**: الإدارة إلى بوابتها، والمشارك إلى بوابته. */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  const mode = jar.get(MODE_COOKIE)?.value;
  const gate = isSessionMode(mode) && mode === "staff" ? "/admin" : "/sign-in";

  const db = await createClient();
  await db.auth.signOut();
  jar.delete(MODE_COOKIE);

  redirect(gate);
}

/**
 * «لست أنت؟ خروج» في صفحات المسابقة (قرار الراعي ٢٧ أكتوبر): يُنهي الجلسة ويعيد إلى الواجهة، فيدخل
 * بحسابٍ آخر أو ينشئه — وليّ أمرٍ يسجّل أبناءه، أو جوالٌ مشترك.
 */
export async function signOutToCampaign(): Promise<void> {
  const jar = await cookies();
  const db = await createClient();
  await db.auth.signOut();
  jar.delete(MODE_COOKIE);
  redirect("/");
}
