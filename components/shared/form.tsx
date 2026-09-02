import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import styles from "./form.module.css";

/**
 * جامع النموذج (`platform.md §١١.٦`).
 * لا نموذج يُبنى بعناصر خام — `guard-structure` يفشل عند `<input>` خارج هذا الجامع.
 */

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** يُعرَض **بعد أول إرسال** لا أثناء الكتابة (§١١.٦). */
  error?: string;
  children: ReactNode;
};

export function Field({ id, label, required, hint, error, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={`${styles.label} ${required ? styles.required : ""}`}>
        {label}
      </label>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
      {children}
      {error ? (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

type ControlExtras = { invalid?: boolean; numeric?: boolean; latin?: boolean };

function controlClass({ invalid, numeric, latin }: ControlExtras, extra?: string) {
  return [
    styles.control,
    invalid ? styles.invalid : "",
    numeric ? styles.numeric : "",
    latin ? styles.ltr : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Input({
  invalid,
  numeric,
  latin,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & ControlExtras) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      aria-required={rest.required || undefined}
      // الرقمي يفتح لوحة أرقام على الجوال
      inputMode={numeric ? "numeric" : rest.inputMode}
      className={controlClass({ invalid, numeric, latin }, className)}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      rows={rest.rows ?? 4}
      aria-invalid={invalid || undefined}
      aria-required={rest.required || undefined}
      className={controlClass({ invalid }, className)}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      aria-required={rest.required || undefined}
      className={controlClass({ invalid }, className)}
    >
      {children}
    </select>
  );
}

/** الإجراء الأساسي **جهة البداية** (§١١.٦). */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export function Button({
  variant = "secondary",
  pending,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  /** يُعطِّل الزر أثناء الإرسال — فلا إرسال مزدوج. */
  pending?: boolean;
}) {
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      disabled={rest.disabled || pending}
      aria-busy={pending || undefined}
      className={[styles.button, styles[variant], className ?? ""].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
