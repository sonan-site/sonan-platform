import { cookies } from "next/headers";
import { MODE_COOKIE, type SessionMode } from "@/lib/auth/mode";

/**
 * يكتب وضع الجلسة (`adr/0032`) — بخياراتٍ واحدة لكل باب يكتبه: الدخول، والتبديل،
 * والتسجيل في برنامج. للخادم وحده (أفعالٌ ومسارات).
 */
export async function writeMode(mode: SessionMode): Promise<void> {
  (await cookies()).set(MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
