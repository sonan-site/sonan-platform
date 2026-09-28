import { cookies } from "next/headers";
import { PageHead } from "@/components/shared/steps";
import { ErrorState } from "@/components/shared/states";
import { visibleNavigation } from "@/config/navigation";
import { MODE_COOKIE, resolveMode } from "@/lib/auth/mode";
import { getSession } from "@/lib/auth/session";
import { dashboardCounts, myDuties, staffAttention } from "@/lib/dashboard/server";
import { currentViewer } from "@/lib/permissions/granted";
import { ParticipantView } from "./participant-view";
import { StaffView } from "./staff-view";

/**
 * اللوحة **تتبع وضع الجلسة** كما تتبعه القائمة الجانبية: من دخل من بوابة
 * الإدارة يجد ما ينتظر قراره، ومن دخل من بوابة المشاركين يجد واجبه.
 *
 * وكانت صفحة توجيهٍ تخلط الاثنين: بطاقةُ واجبٍ يوميّ فوق بطاقة «البرامج»،
 * فمن يُدير في ساعة عمله يجد واجبه الشخصي في شاشة عمله.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (session.status !== "active") {
    return <ErrorState title="غير مصرَّح" body="سجّل الدخول لترى ما يخصّك." />;
  }

  const viewer = await currentViewer();
  const mode = resolveMode((await cookies()).get(MODE_COOKIE)?.value, viewer.granted.size > 0);

  if (mode === "participant") {
    const duties = await myDuties();
    return (
      <>
        <PageHead crumbs={[]} title="لوحة المتابعة" lede="واجبك اليوم، وأين وصلت فيه." />
        <ParticipantView duties={duties} />
      </>
    );
  }

  const [attention, counts] = await Promise.all([staffAttention(), dashboardCounts()]);

  /**
   * المداخل من مصدر التنقّل الواحد لا من قائمة مكتوبة هنا: مدخلٌ يُضاف أو
   * يُعاد تسميته هناك يظهر هنا بلا مسّ. ولوحة المتابعة نفسها تُستثنى —
   * وكذلك ما موضعه رأس الصفحة.
   */
  const entries = visibleNavigation({ ...viewer, mode: "staff" }).filter(
    (item) => item.key !== "dashboard" && !item.headerOnly,
  );

  return (
    <>
      <PageHead
        crumbs={[]}
        title="لوحة المتابعة"
        lede="ما ينتظر قرارك أو إصلاحك اليوم، ثم أبواب عملك."
      />
      <StaffView attention={attention} entries={entries} counts={counts} />
    </>
  );
}
