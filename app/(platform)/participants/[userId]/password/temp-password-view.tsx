"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, FormActions } from "@/components/shared/form";
import { Muted, PageHead, Step } from "@/components/shared/steps";
import { formatDateTime } from "@/lib/format";
import { issueTempPassword, type IssueResult } from "./actions";
import styles from "./temp-password.module.css";

/**
 * شاشة الإصدار (adr/0060): لمن تُرسَل الكلمة، ثم الكلمة نفسها **مرّة** — تختفي بمغادرة الصفحة،
 * ولا تُستعاد إلا بإصدار غيرها يُبطلها.
 */
export function TempPasswordView({
  userId,
  fullName,
  phones,
  hasGoogle,
  hasPassword,
  isStaff,
  accountState,
  backHref,
}: {
  userId: string;
  fullName: string;
  /** الجوالان المسجّلان — إليهما وحدهما تُرسَل. */
  phones: { label: string; phone: string }[];
  hasGoogle: boolean;
  hasPassword: boolean;
  isStaff: boolean;
  accountState: "active" | "suspended" | "bin";
  backHref: string;
}) {
  const [result, setResult] = useState<IssueResult | null>(null);
  const [copied, setCopied] = useState<"password" | "message" | null>(null);
  const [pending, start] = useTransition();
  const issued = result?.ok ? result : null;

  const message = issued
    ? `كلمة المرور المؤقتة لحسابك في منصة سنن: ${issued.password}\n` +
      `ادخل بها من www.sonan.site/sign-in قبل ${formatDateTime(issued.expiresAt)}، وستُطلب منك بعدها كلمةٌ جديدة تختارها.`
    : "";

  async function copy(kind: "password" | "message", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

  return (
    <>
      <PageHead
        crumbs={[
          { href: "/dashboard", label: "لوحة المتابعة" },
          { href: backHref, label: "رجوع" },
        ]}
        title={`كلمة مرور مؤقتة — ${fullName}`}
        lede="لمن لا يصل حسابه: كلمةٌ ترسلها إليه، يدخل بها ثم يختار كلمته. تنتهي بعد يومين إن لم يدخل بها."
      />

      <Step
        n={1}
        title="لمن تُرسَل"
        why="الكلمة تفتح الحساب لمن يحملها — فلا تُرسَل إلا إلى رقمٍ مسجّلٍ فيه."
        done={phones.length > 0}
        state={<span>{phones.length > 0 ? "أرسلها إلى أحد هذه الأرقام وحدها" : "لا جوال مسجّل"}</span>}
      >
        {phones.length > 0 ? (
          <ul className={styles.phones}>
            {phones.map((p) => (
              <li key={p.label}>
                {p.label}: <span dir="ltr">{p.phone}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Muted>لا جوال في الحساب — تحقّق من صاحبه بطريقٍ آخر قبل أن ترسلها.</Muted>
        )}
        {hasGoogle ? (
          <p className={styles.note}>
            هذا الحساب يدخل بـ Google{hasPassword ? " وبكلمة مرور" : " وحده"}. أرشده أولاً إلى زرّ «الدخول بـ Google»؛
            فإن تعذّر عليه فأصدر له كلمة.
          </p>
        ) : null}
        {isStaff ? <p className={styles.note}>حساب فريق — لا يُصدر له إلا مدير المنصة.</p> : null}
      </Step>

      <Step
        n={2}
        title="الكلمة"
        why="تظهر مرّة واحدة هنا ولا تُحفظ في شيء. وإصدار غيرها يُبطلها."
        done={Boolean(issued)}
        state={<span>{issued ? `صالحة حتى ${formatDateTime(issued.expiresAt)}` : "لم تُصدر بعد"}</span>}
      >
        {accountState !== "active" ? (
          <Muted>الحساب موقوف أو في سلّة المحذوفات — أعِد تفعيله أولاً.</Muted>
        ) : (
          <>
            {issued ? (
              <div className={styles.issued}>
                <p className={styles.password} dir="ltr">
                  {issued.password}
                </p>
                <pre className={styles.message}>{message}</pre>
                <FormActions>
                  <Button type="button" onClick={() => copy("message", message)}>
                    <Copy size={16} aria-hidden /> {copied === "message" ? "نُسخت الرسالة" : "انسخ الرسالة"}
                  </Button>
                  <Button type="button" onClick={() => copy("password", issued.password)}>
                    <Copy size={16} aria-hidden /> {copied === "password" ? "نُسخت الكلمة" : "انسخ الكلمة وحدها"}
                  </Button>
                </FormActions>
              </div>
            ) : null}
            {result && !result.ok ? <p className={styles.error}>{result.error}</p> : null}
            <FormActions>
              <Button
                type="button"
                variant={issued ? undefined : "primary"}
                pending={pending}
                onClick={() =>
                  start(async () => {
                    setCopied(null);
                    setResult(
                      await issueTempPassword(userId).catch(() => ({ ok: false as const, error: "تعذّر الإصدار. أعد المحاولة." })),
                    );
                  })
                }
              >
                {issued ? "أصدر كلمةً أخرى بدلها" : "أصدر كلمة مؤقتة"}
              </Button>
            </FormActions>
          </>
        )}
      </Step>
    </>
  );
}
