import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ask, trimHistory } from "./answer";
import { numbersIn, unsupportedNumbers } from "./guard";
import { bothCalendars, days, registrationLine, sourcesText, systemPrompt, years, type AskSources, type Today } from "./prompt";

const S: AskSources = {
  programName: "مسابقة سنن",
  summary: "ملخص",
  eligibility: "المسابقة للذكور من 7 سنوات فأكثر.",
  requireIdentity: true,
  tracks: [
    { name: "المسار الأول", description: "الإيمان", units: 47, remaining: 65, minAge: 7, maxAge: 15 },
    { name: "المسار الخامس", description: "الكل", units: 229, remaining: 0, minAge: 15, maxAge: null },
  ],
  unitLabel: "حديثاً",
  schedule: [{ title: "الاختبار المرحلي", startsOn: "2026-12-01", endsOn: "2027-01-21", note: "عن بُعد." }],
  faq: [{ question: "هل الحفظ حضوري؟", answer: "عن بُعد.", category: "الحفظ" }],
  approved: [{ question: "هل الكتاب متاح PDF؟", answer: "مادة المسابقة مجتزأة، والكتاب كاملاً غير متاح." }],
  contact: "شؤون الطلاب: 0553088688",
};

const T: Today = { day: "2026-11-08", registration: "open", lastOpenDay: "2026-11-28", opensOn: "2026-11-04" };

function fake(response: Partial<Anthropic.Message> | Error) {
  const create = vi.fn(async (_params: unknown) => {
    if (response instanceof Error) throw response;
    return { stop_reason: "end_turn", content: [], ...response } as Anthropic.Message;
  });
  return { create } as unknown as Pick<Anthropic["messages"], "create"> & { create: typeof create };
}
const out = (o: unknown) =>
  ({ content: [{ type: "text", text: JSON.stringify(o), citations: null }] }) as unknown as Partial<Anthropic.Message>;

describe("التواريخ والأعداد", () => {
  it("هجري وميلادي بأرقام لاتينية", () => {
    expect(bothCalendars("2026-12-01")).toBe("21 جمادى الآخرة 1448هـ (1 ديسمبر 2026م)");
  });
  it("تمييز العدد", () => {
    expect([days(1), days(2), days(3), days(20)]).toEqual(["يوم واحد", "يومان", "3 أيام", "20 يوماً"]);
    expect([years(7), years(15)]).toEqual(["7 سنوات", "15 سنة"]);
  });
  it("**حالة التسجيل من حالة المنصة لا من التواريخ**", () => {
    expect(registrationLine(T)).toContain("(بعد 20 يوماً)");
    expect(registrationLine({ ...T, lastOpenDay: "2026-11-08" })).toContain("اليوم آخر يوم");
    expect(registrationLine({ ...T, registration: "full" })).toBe("مغلق لاكتمال العدد");
    expect(registrationLine({ ...T, registration: "not_open_yet" })).toMatch(/^لم يُفتح بعد، ويُفتح/);
  });
});

describe("المصادر", () => {
  it("تحمل الشروط والمسارات والمواعيد والأسئلة والتواصل", () => {
    const t = sourcesText(S);
    for (const w of ["للذكور", "47 حديثاً", "المقاعد ممتلئة", "الاختبار المرحلي", "هل الحفظ حضوري؟", "0553088688"]) {
      expect(t).toContain(w);
    }
  });
  it("**الإجابات المعتمدة واليوم في النظام**", () => {
    const p = systemPrompt(S, T);
    expect(p).toContain("<الإجابات_المعتمدة>");
    expect(p).toContain("مجتزأة");
    expect(p).toContain("<اليوم>اليوم 28 جمادى الأولى 1448هـ (8 نوفمبر 2026م)");
  });
});

describe("الحارس", () => {
  it("الأرقام لاتينيةً وبلا فواصل الآلاف", () => {
    expect([...numbersIn("٤٢٬٥٠٠ ريال و42,500 و75٪ و07")]).toEqual(["42500", "75", "7"]);
  });
  it("**رقمٌ لا أصل له يُمسك، وما في المصادر أو السؤال يمرّ**", () => {
    const src = sourcesText(S);
    expect(unsupportedNumbers("المسار الأول 47 حديثاً", src, "")).toEqual([]);
    expect(unsupportedNumbers("بعمر 16 يناسبه الخامس", src, "ابني عمره 16")).toEqual([]);
    expect(unsupportedNumbers("الاختبار في 5 ديسمبر", src, "")).toEqual(["5"]);
  });
});

describe("الإجابة", () => {
  it("إجابةٌ بأرقامٍ من المصادر تُعرض", async () => {
    const m = fake(out({ answered: true, answer: "المسار الأول 47 حديثاً.", refer: "none" }));
    expect(await ask(m, "x", S, T, "كم حديث؟")).toEqual({ kind: "answer", text: "المسار الأول 47 حديثاً." });
  });

  it("**السؤال وحده في رسالة المستخدم، والمصادر واليوم في النظام**", async () => {
    const m = fake(out({ answered: true, answer: "عن بعد.", refer: "none" }));
    await ask(m, "claude-haiku-5-5", S, T, "  حضوري؟  ");
    const params = m.create.mock.calls[0]![0] as Anthropic.MessageCreateParams;
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.system).toContain("<اليوم>");
    expect(params.messages.at(-1)).toEqual({ role: "user", content: "حضوري؟" });
  });

  it("**رقمٌ مخترَع ← يُردّ ويُحال**", async () => {
    const m = fake(out({ answered: true, answer: "الاختبار في 5 ديسمبر.", refer: "none" }));
    expect(await ask(m, "x", S, T, "متى؟")).toEqual({ kind: "blocked", refer: "student_affairs", draft: "الاختبار في 5 ديسمبر." });
  });

  it("الإحالة كما قرّرها النموذج", async () => {
    const tech = fake(out({ answered: false, answer: "", refer: "voices" }));
    expect(await ask(tech, "x", S, T, "ما يظهر الواجب")).toEqual({ kind: "refer", refer: "voices" });
    const off = fake(out({ answered: false, answer: "", refer: "none" }));
    expect(await ask(off, "x", S, T, "قصيدة")).toEqual({ kind: "refer", refer: "none" });
  });

  it("الرفض والقطع والنص التالف ← إحالة لا نصّ ناقص", async () => {
    for (const r of [
      { stop_reason: "refusal" },
      { stop_reason: "max_tokens", ...out({ answered: true, answer: "نص", refer: "none" }) },
      { content: [{ type: "text", text: "{نص", citations: null }] },
    ] as Partial<Anthropic.Message>[]) {
      expect(await ask(fake(r), "x", S, T, "س")).toEqual({ kind: "refer", refer: "student_affairs" });
    }
  });

  it("خطأ الخدمة ← خطأ", async () => {
    expect(await ask(fake(new Error("down")), "x", S, T, "س")).toEqual({ kind: "error" });
  });

  it("السجلّ يُقصّ ويبدأ بسؤال", () => {
    const h = trimHistory([
      { role: "assistant", text: "قديم" },
      ...Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `${i}` })),
    ]);
    expect(h[0]!.role).toBe("user");
    expect(h.length).toBeLessThanOrEqual(6);
  });
});
