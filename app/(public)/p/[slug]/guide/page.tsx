import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { now, toDateInput } from "@/lib/format";
import { loadPublicProgram } from "@/lib/programs/public-page-server";
import { getHomeFeatured } from "@/lib/settings/home-featured-server";
import { CampaignGuide, type GuideExam, type GuideUpdate } from "../../../components/campaign/campaign-guide";

/**
 * دليل المشارك (خطة دليل المشارك · د · ملحق `adr/0045`) — لبرنامج الحملة. والبرنامج المنشور غير
 * المميّز يُحوَّل إلى صفحته؛ والمسوّدة تُعاد معاينتها لمن له نطاقها (RLS تحصرها).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "دليل المشارك" };

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createClient();

  let program;
  try {
    program = await loadPublicProgram(db, slug);
  } catch {
    return <ErrorState body="تعذّر جلب الدليل. أعد المحاولة." />;
  }
  if (!program) notFound();

  const featured = await getHomeFeatured();
  if (featured !== slug && program.data.registration !== "unpublished") redirect(`/p/${slug}`);

  const [examsResult, sectionsResult, updatesResult] = await Promise.all([
    db.rpc("fn_public_exams", { p_program_id: program.id }),
    db.rpc("fn_public_track_sections", { p_program_id: program.id }),
    // المحذوف صراحةً خارجاً — حامل programs.read يراه في سياسته فلا يصير «آخر تحديث» (مراجعة ج م١).
    db
      .from("guide_updates")
      .select("id, entry_date, body")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (examsResult.error || sectionsResult.error || updatesResult.error) {
    return <ErrorState body="تعذّر جلب الدليل. أعد المحاولة." />;
  }

  const sections = new Map<string, { name: string; units: number }[]>();
  for (const s of sectionsResult.data ?? []) {
    const list = sections.get(s.track_id) ?? [];
    list.push({ name: s.section_name, units: s.units });
    sections.set(s.track_id, list);
  }

  const exams: GuideExam[] = (examsResult.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    examType: e.exam_type === "oral" ? "oral" : "remote",
    trackId: e.track_id,
    entryPercentage: e.entry_percentage === null ? null : Number(e.entry_percentage),
    passPercentage: Number(e.pass_percentage),
    maxAttempts: e.max_attempts,
    questionCount: e.question_count,
    secondsPerQuestion: e.seconds_per_question,
    prerequisiteName: e.prerequisite_name,
    awardPercentage: e.award_percentage === null ? null : Number(e.award_percentage),
  }));

  const updates: GuideUpdate[] = (updatesResult.data ?? []).map((u) => ({ id: u.id, date: u.entry_date, body: u.body }));

  return (
    <CampaignGuide program={program} sections={sections} exams={exams} updates={updates} printedOn={toDateInput(now())} />
  );
}
