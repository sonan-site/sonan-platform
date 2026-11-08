import { lastOpenDay, toDateInput } from "@/lib/format";
import type { PublicProgram } from "@/lib/programs/public-page-server";
import type { AskSources, Today } from "./prompt";

/**
 * مصادر المساعد من بيانات الصفحة المعلنة — **مصدرٌ واحد** للخادم وللاختبار الحيّ، فلا يُختبر غير
 * ما يُرسل. وحدة نقيّة: البيانات تُجلب قبلها.
 */
export function buildSources(
  page: PublicProgram,
  extra: { requireIdentity: boolean },
  ages: { id: string; min_age: number | null; max_age: number | null }[],
  approved: { question: string; answer: string }[],
  at: Date,
): { sources: AskSources; today: Today } {
  const d = page.data;
  const age = new Map(ages.map((t) => [t.id, t]));
  return {
    sources: {
      programName: d.programName,
      summary: d.programSummary,
      eligibility: d.eligibility ?? "",
      requireIdentity: extra.requireIdentity,
      tracks: d.tracks.map((t) => ({
        name: t.name,
        description: t.description,
        units: t.units,
        remaining: t.capacity === null ? null : Math.max(0, t.capacity - t.taken),
        minAge: age.get(t.id)?.min_age ?? null,
        maxAge: age.get(t.id)?.max_age ?? null,
      })),
      unitLabel: d.unitLabel,
      schedule: d.schedule.map((e) => ({ title: e.title, startsOn: e.startsOn, endsOn: e.endsOn, note: e.note })),
      faq: d.faq.map((f) => ({ question: f.question, answer: f.answer, category: f.category })),
      approved,
      contact: d.contact,
    },
    today: {
      day: toDateInput(at),
      registration: d.registration,
      lastOpenDay: d.closesAt ? lastOpenDay(d.closesAt) : null,
      opensOn: d.opensAt ? toDateInput(d.opensAt) : null,
    },
  };
}
