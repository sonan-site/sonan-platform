import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { CompleteProfileForm } from "./complete-profile-form";

/**
 * «أكمل حسابك» — لمن دخل بـ Google ولم يكتب جواله (`adr/0025`).
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

  return (
    <CompleteProfileForm email={session.email} suggestedName={session.suggestedName} next={next} />
  );
}
