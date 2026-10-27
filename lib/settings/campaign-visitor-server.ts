import "server-only";
import { cache } from "react";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

/**
 * حال الزائر في المسابقة (قرار الراعي ٢٧ أكتوبر): بلا حساب · له حسابٌ ولم يُكمل تسجيله · مسجَّلٌ برابط
 * رحلته. منه تقول الواجهة ورأس صفحات المسابقة الخطوة التالية بالضبط — لا «لوحتي» لمن لا لوحة له بعد.
 */
export type CampaignVisitor = "guest" | "account" | { journey: string };

export const getCampaignVisitor = cache(async (programSlug: string | null): Promise<CampaignVisitor> => {
  const session = await getSession();
  if (session.status === "anonymous") return "guest";
  if (!programSlug) return "account";
  const db = await createClient();
  const { data } = await db
    .from("participants")
    .select("id, programs!inner(slug)")
    .eq("programs.slug", programSlug)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? { journey: `/journey/${data.id}` } : "account";
});
