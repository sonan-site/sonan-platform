import { notFound, redirect } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { REGISTRATION_LABEL, type RegistrationState } from "@/lib/programs/registration";
import { RegisterForm, type QuestionRow, type TrackOption } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // التسجيل يشترط حساباً. الزائر يُنشئه أولاً — ومن له حساب يجد رابط الدخول
  // في الصفحة نفسها. والوجهة تُحفظ فيعود بعدها إلى حيث كان.
  const session = await getSession();
  const back = encodeURIComponent(`/p/${slug}/register`);
  // الناقص (دخل بـ Google ولم يكتب جواله) يُستكمل ثم يعود — لا يُعاد إلى إنشاء حساب له.
  if (session.status === "incomplete") redirect(`/complete-profile?next=${back}`);
  if (session.status !== "active") redirect(`/sign-up?next=${back}`);

  const db = await createClient();
  const { data: program, error } = await db
    .from("programs")
    .select("id, name, participant_label")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return <ErrorState body="تعذّر جلب البرنامج." />;
  if (!program) notFound();

  // [BR-CAP-01] — الحالة من القاعدة: هي مصدر الإنفاذ، فتُقرأ منها لا تُحسب هنا.
  const { data: state } = await db.rpc("fn_registration_state", { p_program_id: program.id });

  const { data: existing } = await db
    .from("participants")
    .select("id")
    .eq("program_id", program.id)
    .eq("user_id", session.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    return (
      <EmptyState
        kind="no-data"
        title="أنت مسجَّل بالفعل"
        body={`تسجيلك في «${program.name}» قائم. تابع واجبك اليومي من حسابك.`}
      />
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

  const [tracksResult, questionsResult] = await Promise.all([
    db
      .from("tracks")
      .select("id, name, description, capacity")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("sort_order"),
    db
      .from("admission_questions")
      .select("id, question, is_required, track_id")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const tracks: TrackOption[] = tracksResult.data ?? [];
  const questions: QuestionRow[] = (questionsResult.data ?? []).map((q) => ({
    id: q.id,
    question: q.question,
    required: q.is_required,
    trackId: q.track_id,
  }));

  return (
    <RegisterForm
      programId={program.id}
      slug={slug}
      participantLabel={program.participant_label}
      tracks={tracks}
      questions={questions}
    />
  );
}
