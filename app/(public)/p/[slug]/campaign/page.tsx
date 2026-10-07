import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { CampaignLanding } from "../../../components/campaign/campaign-landing";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { loadPublicProgram } from "@/lib/programs/public-page-server";

/**
 * معاينة واجهة الحملة لبرنامجٍ بعينه (`adr/0045`) — قبل أن يُشغَّل مفتاحها.
 * والمسوّدة لا يراها إلا من له نطاقها: **RLS تحصرها** كما تحصر صفحتها.
 */

export const dynamic = "force-dynamic";

export default async function CampaignPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createClient();

  let program;
  try {
    program = await loadPublicProgram(db, slug);
  } catch {
    return <ErrorState body="تعذّر جلب الواجهة. أعد المحاولة." />;
  }
  if (!program) notFound();

  const session = await getSession();
  return <CampaignLanding program={program} signedIn={session.status === "active"} />;
}
