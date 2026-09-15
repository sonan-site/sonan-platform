import { redirect } from "next/navigation";
import type { ProfileValues } from "@/components/shared/profile-fields";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { CompleteProfileForm } from "./complete-profile-form";

/**
 * «أكمل حسابك» — لكل حساب ناقص: من دخل بـ Google، والمسجِّل بالبريد، والمدعوّ،
 * والحساب القديم الذي تنقصه البيانات الجديدة (`adr/0025`).
 * الداخل بحساب مكتمل يتابع إلى وجهته، وغير الداخل إلى الدخول.
 */
export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  const session = await getSession();

  if (session.status === "anonymous") redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (session.status !== "incomplete") redirect(next);

  // الملف القائم (إن وُجد) يعبّئ ما سبق إدخاله، وإلا فما أرسله Google.
  const db = await createClient();
  const { data: p } = await db
    .from("profiles")
    .select(
      "first_name, father_name, grandfather_name, family_name, gender, birth_date, nationality, phone, phone_secondary",
    )
    .eq("user_id", session.userId)
    .maybeSingle();

  const values: ProfileValues = {
    firstName: p?.first_name ?? session.suggested.first,
    fatherName: p?.father_name ?? "",
    grandfatherName: p?.grandfather_name ?? "",
    familyName: p?.family_name ?? session.suggested.family,
    gender: p?.gender ?? "",
    birthDate: p?.birth_date ?? "",
    nationality: p?.nationality ?? "",
    phone: p?.phone ?? null,
    phoneSecondary: p?.phone_secondary ?? null,
  };

  return <CompleteProfileForm email={session.email} values={values} next={next} />;
}
