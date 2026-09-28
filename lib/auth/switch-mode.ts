"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MODE_COOKIE, type SessionMode } from "@/lib/auth/mode";

/**
 * الانتقال بين وضعَي الجلسة — لمن يجمع الصفتين (`adr/0032`).
 *
 * **تجربةٌ لا صلاحية:** يكتب الكوكي ويعيد إلى اللوحة، والصلاحيات كما هي —
 * فمن لا دور له لا تفتح له شاشة عملٍ في أي وضع.
 */
export async function switchMode(mode: SessionMode): Promise<void> {
  (await cookies()).set(MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/dashboard");
}
