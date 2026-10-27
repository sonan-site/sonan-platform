import Link from "next/link";
import { EmptyState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { now } from "@/lib/format";
import { getHomeFeatured } from "@/lib/settings/home-featured-server";

/**
 * «لست مشاركاً في أي برنامج» — وحين تكون المسابقة واجهة المنصة وتسجيلها مفتوحاً، فمن أنشأ حسابه ولم
 * يُكمل تسجيله يُقال له خطوته التالية بزرٍّ واحد، لا «تصفّح البرامج» (قرار الراعي ٢٧ أكتوبر: طالبٌ
 * أنشأ حسابه وخرج، فعاد من «لوحتي» إلى صفحةٍ عامة لا تذكر المسابقة).
 */
export async function NoParticipation() {
  const featured = await getHomeFeatured();
  if (featured) {
    const db = await createClient();
    const { data } = await db
      .from("programs")
      .select("name, slug, registration_opens_at, registration_closes_at")
      .eq("slug", featured)
      .maybeSingle();
    const at = now();
    const open =
      data &&
      (!data.registration_opens_at || at >= new Date(data.registration_opens_at)) &&
      (!data.registration_closes_at || at < new Date(data.registration_closes_at));
    if (data && open) {
      return (
        <EmptyState
          kind="no-data"
          title={`أكمل تسجيلك في ${data.name}`}
          body="أنشأت حسابك، وبقي أن تكمل بياناتك وتختار مسارك — ثم يظهر واجبك اليومي في «رحلتي»."
          action={<Link href={`/p/${data.slug}/register`}>أكمل تسجيلك</Link>}
        />
      );
    }
  }
  return (
    <EmptyState
      kind="no-data"
      title="لست مشاركاً في أي برنامج"
      body="تصفّح البرامج المعلنة وسجّل في أحدها، ثم يظهر واجبك اليومي في «رحلتي»."
      action={<Link href="/">تصفّح البرامج</Link>}
    />
  );
}
