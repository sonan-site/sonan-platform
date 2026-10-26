/**
 * محتوى واجهة الحملة — منطقٌ خالص يتشاركه **الواجهة والدليل** (`adr/0045` · خطة دليل المشارك · د)،
 * فلا يختلفان: العناصر بأنواعها، والمراحل (من المواعيد أو يدوية بحسب مصدر الجدول الزمني)، والمسارات
 * بجوائز مراكزها، وجهة التواصل.
 */
import { parseBlockContent, type BlockContent, type BlockType } from "./blocks";
import type { PageBlock, BlockData } from "./public-page-server";
import { scheduleRangeLabel, scheduleStatus, type ScheduleStatus } from "./schedule";

export type Blocks = { [K in BlockType]?: BlockContent[K][] };

/** العناصر الصالحة مجموعةً بنوعها، بترتيبها في الصفحة. */
export function collectBlocks(blocks: readonly PageBlock[]): Blocks {
  const out: Record<string, unknown[]> = {};
  for (const block of blocks) {
    const parsed = parseBlockContent(block.type, block.content);
    if (!parsed.ok) continue;
    (out[block.type] ??= []).push(parsed.content);
  }
  return out as Blocks;
}

export type Stage = {
  title: string;
  dates: string;
  note: string;
  status: ScheduleStatus | null;
};

/** المراحل: من مواعيد البرنامج حين يقول الجدول الزمني ذلك، وإلا كما كُتبت فيه. */
export function campaignStages(timeline: BlockContent["timeline"] | undefined, data: BlockData): Stage[] {
  if (timeline?.source === "schedule") {
    return data.schedule.map((e) => ({
      title: e.title,
      dates: scheduleRangeLabel(e),
      note: e.note,
      status: scheduleStatus(e, data.today),
    }));
  }
  return (timeline?.stages ?? []).map((s) => ({ title: s.title, dates: s.dates, note: s.note, status: null }));
}

export type CampaignTrack = {
  id: string;
  name: string;
  description: string;
  units: number;
  /** فارغ = بلا سقف — فلا شريط مقاعد. */
  capacity: number | null;
  remaining: number | null;
  prizes: { label: string; value: string }[];
  prizeNote: string;
};

/** المسارات بمقاعدها وجوائز مراكزها — الجوائز من عنصر «الجوائز» المنسوب إلى مساره. */
export function campaignTracks(data: BlockData, prizes: readonly BlockContent["prizes"][]): CampaignTrack[] {
  return data.tracks.map((t) => {
    const own = prizes.find((p) => p.trackId === t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      units: t.units,
      capacity: t.capacity,
      remaining: t.capacity === null ? null : Math.max(0, t.capacity - t.taken),
      prizes: own?.places ?? [],
      prizeNote: own?.note ?? "",
    };
  });
}

/**
 * جهة التواصل «التسمية: القيمة» — بنمطٍ محافظ: تسميةٌ بلا أرقامٍ ولا نقطتين، فلا يُقسَم رابطٌ عند
 * `https:`. وما لا يطابق يُعرض كاملاً بلا تسمية. والفارغ لا شيء.
 */
export function parseContact(contact: string | null | undefined): { label: string | null; value: string } | null {
  const text = (contact ?? "").trim();
  if (!text) return null;
  const m = /^([^:\d]{2,40})\s*[:：]\s*(.+)$/.exec(text);
  // مخطّط رابطٍ (`https:` · `mailto:`) ليس تسمية: لاتينيةٌ خالصة، أو قيمةٌ تبدأ بـ`//`.
  if (!m || /^[A-Za-z+.-]+$/.test(m[1]!.trim()) || m[2]!.startsWith("//")) return { label: null, value: text };
  return { label: m[1]!.trim(), value: m[2]!.trim() };
}

/** العدد بمعدوده: ١ «سؤال واحد» · ٢ «سؤالان» · ٣–١٠ «أسئلة» · ١١+ «سؤالاً» — والمئات بآخر رقمين. */
export function countWith(n: number, forms: { one: string; two: string; few: string; many: string; bare: string }, fmt: (v: number) => string): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const rest = n % 100;
  if (rest >= 3 && rest <= 10) return `${fmt(n)} ${forms.few}`;
  if (rest >= 11 || n < 100) return `${fmt(n)} ${forms.many}`;
  return `${fmt(n)} ${forms.bare}`;
}
