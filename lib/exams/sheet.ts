/**
 * ورقة تقييم المحكّم كما يُرسلها `fn_judge_sheet` (`adr/0048`).
 * الأسئلة بجوابها للمحكّم، ومعايير الخصم لكل سؤال، وما علّمه هو.
 */

export type SheetCriterion = { id: string; label: string; value: number };

export type SheetQuestion = {
  id: string;
  text: string;
  answer: string;
  score: number;
  evaluated: boolean;
  marked: string[];
  criteria: SheetCriterion[];
};

export type JudgeSheet = {
  participant: { name: string; registrationNo: number | null };
  approved: boolean;
  total: number;
  max: number;
  questions: SheetQuestion[];
};

const num = (v: unknown) => Number(v ?? 0);

export function parseSheet(raw: unknown): JudgeSheet {
  if (!raw || typeof raw !== "object") throw new Error("sheet missing");
  const r = raw as Record<string, unknown>;
  const p = (r.participant ?? {}) as Record<string, unknown>;
  if (!Array.isArray(r.questions)) throw new Error("sheet questions missing");
  return {
    participant: {
      name: String(p.name ?? ""),
      registrationNo: p.registration_no === null || p.registration_no === undefined ? null : num(p.registration_no),
    },
    approved: r.approved === true,
    total: num(r.total),
    max: num(r.max),
    questions: (r.questions as Record<string, unknown>[]).map((q) => ({
      id: String(q.id),
      text: String(q.text ?? ""),
      answer: String(q.answer ?? ""),
      score: num(q.score),
      evaluated: q.evaluated === true,
      marked: Array.isArray(q.marked) ? (q.marked as unknown[]).map(String) : [],
      criteria: Array.isArray(q.criteria)
        ? (q.criteria as Record<string, unknown>[]).map((c) => ({ id: String(c.id), label: String(c.label ?? ""), value: num(c.value) }))
        : [],
    })),
  };
}

/** درجة سؤالٍ عند المحكّم: درجته ناقصاً ما علّمه، لا تنزل عن صفر — كالقاعدة. */
export function questionScore(q: SheetQuestion): number {
  const off = q.criteria.filter((c) => q.marked.includes(c.id)).reduce((s, c) => s + c.value, 0);
  return Math.max(0, q.score - off);
}
