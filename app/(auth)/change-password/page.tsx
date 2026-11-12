import { redirect } from "next/navigation";
import { Button, FormActions } from "@/components/shared/form";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/sign-out";
import styles from "../layout.module.css";
import { ChangePasswordForm } from "./change-password-form";

/**
 * «اكتب كلمة مرورك الجديدة» — لمن دخل بكلمة مؤقتة أصدرها مشرف (`adr/0060`). لا تُفتح له شاشة قبلها،
 * ثم يتابع إلى وجهته. ومن دخل بها بعد انقضاء أجلها يُقال له ذلك ويخرج، فلا يعيّن شيئاً.
 */
export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const session = await getSession();

  if (session.status === "anonymous") redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (session.status !== "password_change") redirect(next);

  if (session.expired) {
    return (
      <>
        <h1 className={styles.title}>انتهت كلمة المرور المؤقتة</h1>
        <p className={styles.lede}>مضت مدّتها قبل أن تدخل بها. اطلب كلمةً جديدة من مشرفك ثم ادخل بها خلال يومين.</p>
        <form action={signOut}>
          <FormActions>
            <Button type="submit">خروج</Button>
          </FormActions>
        </form>
      </>
    );
  }

  return <ChangePasswordForm email={session.email} next={next} />;
}
