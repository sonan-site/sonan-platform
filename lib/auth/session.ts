import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import { now } from "@/lib/format";
import { accountState, COMPLETENESS_COLUMNS, suggestedName } from "./account-state";
import { TEMP_PASSWORD_KEY, tempPasswordState } from "./temp-password";

/**
 * حالة الجلسة الحالية.
 *
 * **الصلاحيات تُقرأ حيّة من القاعدة** في كل طلب لا من داخل الرمز — فتغيير الدور
 * أو إيقاف الحساب ينفذ خلال طلب واحد، لا خلال عمر الرمز (`platform.md §٩`:
 * «ينفذ على الجلسات القائمة خلال دقيقة كحد أقصى»).
 *
 * **ومرّة واحدة للطلب:** الإطار والصفحة والفاحص كلهم يسألونها، وكان كلٌّ منهم
 * يدفع رحلة إلى خدمة المصادقة ونداءين للقاعدة. `cache` يجعلها تُحسب مرّة في
 * العرض الواحد، وتبقى حيّة بين طلب وآخر.
 */

export type SessionState =
  | { status: "anonymous" }
  | { status: "suspended"; userId: string }
  /**
   * دخل بكلمة مرور مؤقتة ولم يعيّن كلمته (`adr/0060`) — لا تُفتح له شاشة قبل ذلك.
   * و`expired`: دخل بها بعد انقضاء أجلها، فلا يعيّن شيئاً ويطلب غيرها.
   */
  | { status: "password_change"; userId: string; email: string; expired: boolean }
  /** دخل ولم يستكمل اسمه وجواله — لا تُفتح له شاشة قبل ذلك (`adr/0025`). */
  | {
      status: "incomplete";
      userId: string;
      email: string;
      /** الاسم الأول والعائلة كما أرسلهما Google — قيمٌ أولية تُعدَّل. */
      suggested: { first: string; family: string };
    }
  | {
      status: "active";
      userId: string;
      email: string;
      /** المفتاح: الرمز · القيمة: مجموعة النطاقات (null فيها = نطاق عام). */
      permissions: Map<string, Set<string | null>>;
      /** له مشاركة قائمة في برنامج — جارية أو منتهية. يُظهر «رحلتي» لصاحبها وحده. */
      isParticipant: boolean;
      /** روابط برامج مشاركاته — يُعرف بها إطار الطالب بلون الحملة (ملحق `adr/0045`). */
      programSlugs: string[];
    };

export const getSession = cache(async (): Promise<SessionState> => {
  const db = await createClient();

  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { status: "anonymous" };

  const [{ data: profile }, { data: rows }, { data: participations }] = await Promise.all([
    // الملف نفسه لا `fn_is_active`: غيابه أو نقصه «ناقص»، وحذفه الليّن «موقوف» —
    // والدالة تُرجع «لا» للحالتين فلا تفرّق بينهما.
    db.from("profiles").select(COMPLETENESS_COLUMNS).eq("user_id", auth.user.id).maybeSingle(),
    db.rpc("fn_my_permissions"),
    // مشاركاته برابط برنامجها — صفوفٌ قليلة، وفي الرحلة نفسها: «هل له مشاركة؟» و«هل إحداها في
    // برنامج الحملة؟» بلا رحلةٍ ثانية (مراجعة خطة الألوان م٦).
    db
      .from("participants")
      // باسم المفتاح: مفتاحٌ ثانٍ إلى البرامج يُفشل الربط الضمني بصمت فيختفي كل طالب (adr/0024).
      .select("programs!participants_program_id_fkey(slug)")
      .eq("user_id", auth.user.id)
      .is("deleted_at", null),
  ]);

  const state = accountState(profile);
  if (state === "suspended") return { status: "suspended", userId: auth.user.id };

  // من عليه تعيين كلمته لا يُفتح له غيرها (`adr/0060`) — بعد الإيقاف وقبل «أكمل حسابك»، فلا يملأ
  // بياناته من يحمل المؤقتة. والـ`amr` يُقرأ لصاحب العلامة وحده، وتعذّر قراءته خطأٌ يُعاد فيه
  // الطلب لا حكمٌ بانقضاء الأجل (مراجعة ٦).
  if ((auth.user.app_metadata?.[TEMP_PASSWORD_KEY] ?? null) !== null) {
    const { data: claims, error: claimsError } = await db.auth.getClaims();
    if (claimsError || !claims) throw new Error("تعذّر التحقق من جلستك. أعد المحاولة.");
    const temp = tempPasswordState(auth.user.app_metadata, claims.claims.amr, now().getTime());
    if (temp !== "none") {
      return { status: "password_change", userId: auth.user.id, email: auth.user.email ?? "", expired: temp === "expired" };
    }
  }

  if (state === "incomplete") {
    return {
      status: "incomplete",
      userId: auth.user.id,
      email: auth.user.email ?? "",
      suggested: suggestedName(auth.user.user_metadata),
    };
  }

  const permissions = new Map<string, Set<string | null>>();
  for (const row of rows ?? []) {
    const scopes = permissions.get(row.permission_code) ?? new Set<string | null>();
    scopes.add(row.scope_program_id);
    permissions.set(row.permission_code, scopes);
  }

  return {
    status: "active",
    userId: auth.user.id,
    email: auth.user.email ?? "",
    permissions,
    isParticipant: (participations ?? []).length > 0,
    // برنامجٌ مغلق تحجبه سياسته (د-١١) فيأتي فارغاً — يُسقط ولا تُسقط المشاركة معه.
    programSlugs: (participations ?? []).flatMap((p) => {
      const slug = (p.programs as unknown as { slug: string } | null)?.slug;
      return slug ? [slug] : [];
    }),
  };
});
