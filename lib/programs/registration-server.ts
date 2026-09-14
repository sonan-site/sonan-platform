import "server-only";
import type { createClient } from "@/lib/db/server";
import type { RegistrationState } from "./registration";

const STATES = new Set<string>(["unpublished", "not_open_yet", "open", "full", "closed"]);

/**
 * حالة التسجيل **من القاعدة** لبرامج بعينها `[BR-CAP-01]`.
 *
 * الشاشات كانت تحسبها في TypeScript بعدد مسجَّلين مكتوبٍ صفراً، فلا يظهر
 * «اكتمل العدد» أبداً. والزائر لا يستطيع عدّ المشاركين أصلاً (سياسة الصفوف
 * تحجبهم)، فالعدّ الصادق لا يكون إلا في `fn_registration_state` — وهي نفسها
 * مصدر الإنفاذ في سياسة التسجيل. فالمعروض والمفروض من دالة واحدة.
 */
export async function registrationStates(
  db: Awaited<ReturnType<typeof createClient>>,
  programIds: string[],
): Promise<Map<string, RegistrationState>> {
  const entries = await Promise.all(
    programIds.map(async (id) => {
      const { data } = await db.rpc("fn_registration_state", { p_program_id: id });
      const state: RegistrationState =
        typeof data === "string" && STATES.has(data) ? (data as RegistrationState) : "closed";
      return [id, state] as const;
    }),
  );
  return new Map(entries);
}
