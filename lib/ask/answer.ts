import Anthropic from "@anthropic-ai/sdk";
import { unsupportedNumbers } from "./guard";
import { systemPrompt, type AskSources, type Today } from "./prompt";

/**
 * سؤالٌ واحد إلى النموذج ثم الحارس (adr/0057). وحدةٌ بلا قاعدة: العميل يُحقن،
 * فتُختبر بلا شبكة.
 */

export const MAX_QUESTION = 500;
const MAX_TURNS = 6;

export type Refer = "none" | "student_affairs" | "voices";
export type Turn = { role: "user" | "assistant"; text: string };

export type Reply =
  | { kind: "answer"; text: string }
  | { kind: "refer"; refer: Refer }
  /** ردّه الحارس — يُعرض إحالةً، ويُحفظ تقريراً بجوابه. */
  | { kind: "blocked"; refer: "student_affairs"; draft: string }
  | { kind: "error" };

const SCHEMA = {
  type: "object",
  properties: {
    answered: { type: "boolean" },
    answer: { type: "string" },
    refer: { type: "string", enum: ["none", "student_affairs", "voices"] },
  },
  required: ["answered", "answer", "refer"],
  additionalProperties: false,
} as const;

type Output = { answered: boolean; answer: string; refer: Refer };
type Messages = Pick<Anthropic["messages"], "create">;

function isOutput(v: unknown): v is Output {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["answered"] === "boolean" &&
    typeof o["answer"] === "string" &&
    (o["refer"] === "none" || o["refer"] === "student_affairs" || o["refer"] === "voices")
  );
}

/** السجلّ يُقصّ من أوله ويبدأ بسؤال لا بجواب. */
export function trimHistory(history: Turn[]): Turn[] {
  const recent = history.filter((t) => t.text.trim()).slice(-MAX_TURNS);
  while (recent[0]?.role === "assistant") recent.shift();
  return recent.map((t) => ({ role: t.role, text: t.text.slice(0, 1500) }));
}

export async function ask(
  messages: Messages,
  model: string,
  sources: AskSources,
  today: Today,
  question: string,
  history: Turn[] = [],
): Promise<Reply> {
  const q = question.trim().slice(0, MAX_QUESTION);
  const system = systemPrompt(sources, today);

  let response: Anthropic.Message;
  try {
    response = await messages.create({
      model,
      max_tokens: 2000,
      // التعليمات والمصادر ثابتة بين الأسئلة فتُخزَّن مؤقتاً، والسؤال بعدها.
      cache_control: { type: "ephemeral" },
      system,
      // low أخطأ حالة التسجيل ٣ من ٨ في التجربة المستقلة، وmedium لم يخطئ.
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [...trimHistory(history).map((t) => ({ role: t.role, content: t.text })), { role: "user", content: q }],
    });
  } catch {
    return { kind: "error" };
  }

  // الرفض والقطع قبل قراءة المحتوى: لا يُعرض نصٌّ ناقص.
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    return { kind: "refer", refer: "student_affairs" };
  }
  const raw = response.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "refer", refer: "student_affairs" };
  }
  if (!isOutput(parsed)) return { kind: "refer", refer: "student_affairs" };

  const text = parsed.answer.trim();
  // سؤالُ استيضاحٍ يُعلَّم أحياناً «لم يُجب» وهو جواب (١ من ٨ في التجربة الحيّة، بجهدَي medium وhigh):
  // فما لا إحالة فيه وينتهي باستفهام يُعرض جواباً، ويمرّ بالحارس كغيره.
  const clarifying = !parsed.answered && parsed.refer === "none" && /[؟?]\s*$/.test(text);
  if ((!parsed.answered && !clarifying) || !text) {
    return { kind: "refer", refer: parsed.answered ? "student_affairs" : parsed.refer };
  }
  if (unsupportedNumbers(text, system, q).length > 0) {
    return { kind: "blocked", refer: "student_affairs", draft: text };
  }
  return { kind: "answer", text };
}
