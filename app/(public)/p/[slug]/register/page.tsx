import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { parseBlockContent, pickGuide } from "@/lib/programs/blocks";
import { formatRegistrationNo, REGISTRATION_LABEL, type RegistrationState } from "@/lib/programs/registration";
import { NeedsForm, type NeedCode } from "./needs-form";
import { RegisterForm, type QuestionRow, type TrackOption } from "./register-form";
import styles from "./register.module.css";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ track?: string }>;
}) {
  const { slug } = await params;
  // المسار المختار في الواجهة يُحمل في الرابط ويبقى معه في كل باب (رحلة التسجيل ت١).
  const wantedTrack = /^[0-9a-f-]{36}$/.test((await searchParams).track ?? "") ? (await searchParams).track! : null;

  // التسجيل يشترط حساباً. الزائر يُنشئه أولاً — ومن له حساب يجد رابط الدخول
  // في الصفحة نفسها. والوجهة تُحفظ فيعود بعدها إلى حيث كان.
  const session = await getSession();
  const back = encodeURIComponent(`/p/${slug}/register${wantedTrack ? `?track=${wantedTrack}` : ""}`);
  // الناقص (دخل بـ Google ولم يكتب جواله) يُستكمل ثم يعود — لا يُعاد إلى إنشاء حساب له.
  if (session.status === "incomplete") redirect(`/complete-profile?next=${back}`);
  if (session.status !== "active") redirect(`/sign-up?next=${back}`);

  const db = await createClient();
  const { data: program, error } = await db
    .from("programs")
    .select("id, name, participant_label, registration_prefix")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return <ErrorState body="تعذّر جلب البرنامج." />;
  if (!program) notFound();

  // [BR-CAP-01] — الحالة من القاعدة: هي مصدر الإنفاذ، فتُقرأ منها لا تُحسب هنا.
  const { data: state } = await db.rpc("fn_registration_state", { p_program_id: program.id });

  const { data: existing } = await db
    .from("participants")
    .select("id, registration_no, tracks(name)")
    .eq("program_id", program.id)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .maybeSingle();

  // المسجَّل يجد بطاقة تسجيله بجلد صفحة التسجيل نفسها، وزرّه إلى واجبه مباشرة (د-١٠ · ر٥).
  if (existing) {
    const track = existing.tracks as unknown as { name: string } | null;
    const no = formatRegistrationNo(program.registration_prefix, existing.registration_no);
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>{program.name}</p>
          <h1 className={styles.title}>أنت مسجَّل بالفعل</h1>
          <p className={styles.lede}>تسجيلك قائم، وواجبك اليومي في رحلتك.</p>
        </header>
        <dl className={styles.card}>
          {no ? (
            <div className={styles.cardRow}>
              <dt>رقم التسجيل</dt>
              <dd>
                <bdi dir="ltr">{no}</bdi>
              </dd>
            </div>
          ) : null}
          <div className={styles.cardRow}>
            <dt>المسار</dt>
            <dd>{track?.name ?? "لم يُحدَّد بعد"}</dd>
          </div>
        </dl>
        <Link href={`/journey/${existing.id}`} className={styles.submit}>
          افتح رحلتي
        </Link>
        <Link href={`/p/${slug}`} className={styles.backLink}>
          صفحة {program.name}
        </Link>
      </div>
    );
  }

  if (state !== "open") {
    return (
      <EmptyState
        kind="no-data"
        title="التسجيل غير مفتوح"
        body={`حالة التسجيل الآن: ${REGISTRATION_LABEL[(state ?? "closed") as RegistrationState]}.`}
      />
    );
  }

  // الأهلية (`adr/0047`): الموانع كلها تُعرض قبل النموذج — من الدالة نفسها
  // التي يرفض بها التسجيل، فلا يختلف المعروض عن المفروض.
  // ما يُستكمل يُطلب هنا، وما لا يُستكمل يُقال بلا إحالة (رحلة التسجيل ت٦) — والرموز من الدالة
  // نفسها التي يرفض بها التسجيل.
  const { data: needs, error: needsError } = await db.rpc("fn_registration_needs", { p_program_id: program.id });
  if (needsError) return <ErrorState body="تعذّر التحقق من شروط التسجيل. أعد تحميل الصفحة." />;
  const fixable = new Set<NeedCode>(["saudi_phone", "grandfather_name", "national_id", "guardian_phone"]);
  const hard = (needs ?? []).filter((n) => !fixable.has(n.code as NeedCode));
  if (hard.length > 0) {
    return (
      <EmptyState
        kind="no-data"
        title="لا يتاح لك التسجيل في هذه المسابقة"
        body={hard.map((n) => n.message).join(" · ")}
        action={<Link href={`/p/${slug}`}>صفحة المسابقة</Link>}
      />
    );
  }
  if ((needs ?? []).length > 0) {
    return (
      <NeedsForm
        programName={program.name}
        slug={slug}
        track={wantedTrack ?? ""}
        needs={(needs ?? []).map((n) => n.code as NeedCode)}
      />
    );
  }

  const [tracksResult, questionsResult] = await Promise.all([
    // المقاعد المتبقية من القاعدة — عدّ المشاركين محجوبٌ عن المسجِّل بسياسته.
    db.rpc("fn_public_tracks", { p_program_id: program.id }),
    db
      .from("admission_questions")
      .select("id, question, is_required, track_id, kind")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
  ]);

  const tracks: TrackOption[] = (tracksResult.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    capacity: t.capacity,
    remaining: t.capacity === null ? null : Math.max(0, t.capacity - t.taken),
  }));
  const questions: QuestionRow[] = (questionsResult.data ?? []).map((q) => ({
    id: q.id,
    question: q.question,
    required: q.is_required,
    kind: q.kind,
    trackId: q.track_id,
  }));

  // يُقبل المسار إن كان من مسارات البرنامج وفيه مقعد — وإلا يُترك الاختيار للطالب.
  const initialTrack = tracks.find((t) => t.id === wantedTrack && t.remaining !== 0)?.id ?? "";

  // دليل المشارك في قسم الإقرار — من عنصر الدعوة نفسه الذي تعرضه الواجهة (أ٥). تعذّره يُخفي الرابط وحده.
  const { data: ctaRows } = await db
    .from("page_blocks")
    .select("content")
    .eq("program_id", program.id)
    .eq("block_type", "cta")
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  const ctas = (ctaRows ?? []).flatMap((r) => {
    const parsed = parseBlockContent("cta", r.content);
    return parsed.ok ? [parsed.content as { buttonHref: string; buttonLabel: string; heading: string }] : [];
  });
  const guide = pickGuide(ctas);

  return (
    <RegisterForm
      guide={guide ? { href: guide.buttonHref, label: guide.buttonLabel || "اقرأ دليل المشارك" } : null}
      programId={program.id}
      programName={program.name}
      initialTrack={initialTrack}
      slug={slug}
      participantLabel={program.participant_label}
      tracks={tracks}
      questions={questions}
    />
  );
}
