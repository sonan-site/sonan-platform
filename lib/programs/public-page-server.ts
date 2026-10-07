import "server-only";
import type { createClient } from "@/lib/db/server";
import { now, toDateInput } from "@/lib/format";
import { isBlockType, type BlockType } from "./blocks";
import { registrationStates } from "./registration-server";
import type { RegistrationState } from "./registration";
import { composeSchedule, type ScheduleEntry } from "./schedule";

/**
 * بيانات الصفحة المعلنة لبرنامج — **مصدرٌ واحد** لعارض العناصر (`/p/[slug]`)
 * ولواجهة الحملة (`adr/0045`)، فلا يقرأ أحدهما ما لا يقرؤه الآخر.
 *
 * ولا شرط `status = 'published'` هنا: **RLS تحصره**. والمسوّدة يراها من له
 * `programs.read` بنطاقه — وهي المعاينة.
 */

export type PageBlock = {
  id: string;
  type: BlockType;
  content: unknown;
};

export type PublicTrack = {
  id: string;
  name: string;
  description: string;
  capacity: number | null;
  /** المأخوذ من مقاعد المسار — يُشتقّ منه المتبقي، ولا يُعرَض العدد نفسه. */
  taken: number;
  /** عدد وحدات المادة في نصيب المسار. */
  units: number;
};

export type BlockData = {
  slug: string;
  programName: string;
  programSummary: string;
  participantLabel: string;
  registration: RegistrationState;
  tracks: PublicTrack[];
  /** موعد إغلاق التسجيل — للعدّاد. فارغ = بلا موعد. */
  closesAt: string | null;
  /** مواعيد البرنامج مرتّبةً، والتسجيل المشتقّ بينها (`adr/0044`). */
  schedule: ScheduleEntry[];
  /** «اليوم» بالرياض `YYYY-MM-DD` — لحالة كل موعد. */
  today: string;
  faq: { id: string; question: string; answer: string; category: string }[];
  attachments: Map<string, string>;
};

export type PublicProgram = {
  id: string;
  name: string;
  summary: string;
  blocks: PageBlock[];
  data: BlockData;
};

type Db = Awaited<ReturnType<typeof createClient>>;

/** `null` = لا برنامج بهذا الرابط (أو محجوبٌ عن القارئ). ويرمي عند خطأ القاعدة. */
export async function loadPublicProgram(db: Db, slug: string): Promise<PublicProgram | null> {
  const { data: program, error } = await db
    .from("programs")
    .select("id, name, summary, participant_label, registration_opens_at, registration_closes_at")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error("public-program");
  if (!program) return null;

  const [blocksResult, tracksResult, faqResult, scheduleResult, states] = await Promise.all([
    db
      .from("page_blocks")
      .select("id, block_type, content")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("sort_order")
      // الفاصل نفسه الذي يرتّب به `moveBlock` — وإلا اختلف الفهرس عند التساوي.
      .order("created_at"),
    // المقاعد المتبقية وعدد الوحدات محسوبان في القاعدة — نداءٌ واحد لا نداء
    // لكل مسار، وعدّ المشاركين محجوبٌ عن الزائر بسياسته (الهجرة ٠٥٣).
    db.rpc("fn_public_tracks", { p_program_id: program.id }),
    db
      .from("help_entries")
      .select("id, question, answer, category")
      .eq("program_id", program.id)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    db
      .from("program_schedule")
      .select("id, title, starts_on, ends_on, note")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("starts_on"),
    // [BR-CAP-01]
    registrationStates(db, [program.id]),
  ]);

  const blocks: PageBlock[] = (blocksResult.data ?? [])
    .filter((b) => isBlockType(b.block_type))
    .map((b) => ({ id: b.id, type: b.block_type, content: b.content }));

  return {
    id: program.id,
    name: program.name,
    summary: program.summary,
    blocks,
    data: {
      slug,
      programName: program.name,
      programSummary: program.summary,
      participantLabel: program.participant_label,
      registration: states.get(program.id) ?? "closed",
      tracks: (tracksResult.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        capacity: t.capacity,
        taken: t.taken,
        units: t.units,
      })),
      closesAt: program.registration_closes_at,
      schedule: composeSchedule(
        (scheduleResult.data ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          startsOn: r.starts_on,
          endsOn: r.ends_on,
          note: r.note,
        })),
        { opensAt: program.registration_opens_at, closesAt: program.registration_closes_at },
      ),
      today: toDateInput(now()),
      faq: faqResult.data ?? [],
      // المرفقات تُوصَل عند بناء رفع الصور. حتى ذلك الحين عنصر الصورة يُتخطّى.
      attachments: new Map<string, string>(),
    },
  };
}
