import { notFound } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { formatPhone } from "@/lib/profile/phone";
import { z } from "@/lib/validation/z";
import { TempPasswordView } from "./temp-password-view";

/**
 * كلمة مرور مؤقتة لحساب (adr/0060) — من شاشة الحساب ومن مشاركي البرنامج. **الإذن من القاعدة**:
 * `fn_temp_password_target` لا تُعيد شيئاً لمن لا يُصدر لهذا الحساب، فلا يرى جوالاته من لا شأن له بها.
 */
export default async function TempPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) notFound();

  const db = await createClient();
  const { data, error } = await db.rpc("fn_temp_password_target", { p_user_id: userId });
  if (error?.code === "42501") {
    return <ErrorState title="غير مصرَّح" body="لا تملك إصدار كلمة مرور مؤقتة لهذا الحساب." />;
  }
  if (error) return <ErrorState body="تعذّر جلب الحساب. أعد المحاولة." />;
  const target = data?.[0];
  if (!target) notFound();

  // الرجوع إلى حيث جاء: مشاركو برنامجه أو شاشة حسابه — وما عداهما لا يُتّبع.
  const back = (await searchParams).back ?? "";
  const backHref = /^\/programs\/[0-9a-f-]{36}\/participants$/.test(back) ? back : `/participants/${userId}`;

  return (
    <TempPasswordView
      userId={userId}
      fullName={target.full_name || "حسابٌ بلا اسم"}
      phones={[
        { label: "جواله", phone: target.phone },
        { label: "جوال وليّ أمره", phone: target.guardian_phone },
      ].flatMap((p) => (p.phone ? [{ label: p.label, phone: formatPhone(p.phone) }] : []))}
      hasGoogle={target.has_google}
      hasPassword={target.has_password}
      isStaff={target.is_staff}
      accountState={target.account_state as "active" | "suspended" | "bin"}
      backHref={backHref}
    />
  );
}
