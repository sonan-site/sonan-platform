import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { cache } from "react";
import { getSession } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { createClient } from "@/lib/db/server";
import { env } from "@/lib/env.server";
import { now } from "@/lib/format";
import { loadPublicProgram } from "@/lib/programs/public-page-server";
import { ask, type Reply, type Turn } from "./answer";
import type { AskSources, Today } from "./prompt";
import { buildSources } from "./sources";

/**
 * المساعد على الخادم (adr/0057): المفتاح ← الحدّ ← المصادر ← النموذج ← الحارس ← التقرير.
 *
 * **مفتاح الخدمة هنا لثلاثة لا غير:** قراءة إعدادات `ask.*` (الزائر لا يقرأ `settings`)، و`fn_rate_limit`
 * و`fn_ask_sources` و`fn_ask_report` — وكلها مغلقةٌ لـ `service_role` بقرار 0057. والمنشور العام
 * يُقرأ بعميل القارئ نفسه، فلا يرى المساعد ما لا يراه السائل.
 */

export type Audience = "visitor" | "student";

export type AskResult =
  | { kind: "answer"; text: string }
  | { kind: "refer"; refer: "none" | "student_affairs" | "voices" }
  | { kind: "unavailable" }
  | { kind: "limited" };

type Program = { id: string; slug: string; contact: string };

async function config(): Promise<{ enabled: boolean; model: string }> {
  // settings مغلقٌ دون مفتاح الخدمة — الدالّة تعيد السطرين وحدهما.
  const { data, error } = await createServiceRoleClient().rpc("fn_ask_config");
  if (error) console.error("ask: تعذّرت قراءة الإعداد", error.message);
  const row = data?.[0];
  return {
    // الإعداد الغائب أو التالف أو المتعذّر = موقوف: الافتراض الآمن يُفحَص لا يُفترَض.
    enabled: row?.enabled === true && Boolean(env.ANTHROPIC_API_KEY?.trim()),
    model: row?.model || "claude-haiku-5-5",
  };
}

/**
 * رابط المساعد لبرنامجٍ — أو لا شيء فلا يظهر زرّه: المساعد الموقوف (أو بلا مفتاح) لا مدخل له،
 * ولا يُعلن ما لا يعمل.
 */
export const askHref = cache(async (slug: string): Promise<string | undefined> =>
  (await config()).enabled ? `/p/${slug}/ask` : undefined,
);

/** دلو الزائر ملخّصُ عنوانه لا العنوان نفسه — السجلّ يميّز ولا يعرف. */
async function visitorKey(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const address = forwarded?.split(",")[0]?.trim() || "local";
  return createHash("sha256").update(`ask|${address}`).digest("hex").slice(0, 32);
}

async function hit(bucket: string, prefix: string): Promise<boolean> {
  const { data, error } = await createServiceRoleClient().rpc("fn_rate_limit", {
    p_bucket: bucket,
    p_setting_prefix: prefix,
  });
  return !error && data === true;
}

/** حدّ الزائر في الدقيقة واليوم، ثم سقف البرنامج اليومي — بهذا الترتيب، فالمُستنزِف لا يأكل سقف غيره. */
async function withinLimits(programId: string, kind: "ask" | "flag"): Promise<boolean> {
  const key = await visitorKey();
  if (!(await hit(`ask.${kind}.minute:${key}`, "ask.visitor_minute"))) return false;
  if (!(await hit(`ask.${kind}.day:${key}`, "ask.visitor_day"))) return false;
  return kind === "flag" || (await hit(`ask.program:${programId}`, "ask.program"));
}

async function audienceOf(slug: string): Promise<Audience> {
  const session = await getSession();
  return session.status === "active" && session.programSlugs.includes(slug) ? "student" : "visitor";
}

async function loadSources(slug: string): Promise<{ program: Program; sources: AskSources; today: Today } | null> {
  const db = await createClient();
  const page = await loadPublicProgram(db, slug);
  if (!page) return null;

  const [{ data: extra }, { data: ages }, { data: approved, error }] = await Promise.all([
    db.from("programs").select("require_identity, status").eq("id", page.id).maybeSingle(),
    db.from("tracks").select("id, min_age, max_age").eq("program_id", page.id).is("deleted_at", null),
    createServiceRoleClient().rpc("fn_ask_sources", { p_program_id: page.id }),
  ]);
  // المساعد للمنشور وحده — والمعاينة لا تستدعي نموذجاً.
  if (extra?.status !== "published" || error) return null;

  return {
    program: { id: page.id, slug, contact: page.data.contact },
    ...buildSources(page, { requireIdentity: extra.require_identity }, ages ?? [], approved ?? [], now()),
  };
}

async function report(programId: string, kind: "unanswered" | "flagged" | "blocked", audience: Audience, question: string, answer: string | null) {
  // فشل التقرير لا يُسقط الجواب: السائل أخذ جوابه، والتقرير تحسينٌ لا شرط.
  await createServiceRoleClient().rpc("fn_ask_report", {
    p_program_id: programId,
    p_kind: kind,
    p_audience: audience,
    p_question: question,
    ...(answer === null ? {} : { p_answer: answer }),
  });
}

/** الإحالة إلى «صوتك» للطالب الداخل وحده (ق٣-أ) — والزائر لا يدخلها، فيُحال إلى شؤون الطلاب. */
function referFor(refer: "none" | "student_affairs" | "voices", audience: Audience) {
  return refer === "voices" && audience === "visitor" ? "student_affairs" : refer;
}

export async function askQuestion(slug: string, question: string, history: Turn[]): Promise<AskResult> {
  const q = question.trim();
  if (!q) return { kind: "refer", refer: "none" };

  const cfg = await config();
  if (!cfg.enabled) return { kind: "unavailable" };
  const loaded = await loadSources(slug);
  if (!loaded) return { kind: "unavailable" };
  if (!(await withinLimits(loaded.program.id, "ask"))) return { kind: "limited" };

  const audience = await audienceOf(slug);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const reply: Reply = await ask(client.messages, cfg.model, loaded.sources, loaded.today, q, history);

  switch (reply.kind) {
    case "answer":
      return reply;
    case "blocked":
      await report(loaded.program.id, "blocked", audience, q, reply.draft);
      return { kind: "refer", refer: "student_affairs" };
    case "refer":
      // المُحال إلى شؤون الطلاب مادةٌ للتغذية — ومعه الشخصي أحياناً، فيُتجاهل من اللوحة.
      // والتقني («صوتك») والخارج عن الموضوع لا يُسجَّلان.
      if (reply.refer === "student_affairs") await report(loaded.program.id, "unanswered", audience, q, null);
      return { kind: "refer", refer: referFor(reply.refer, audience) };
    case "error":
      return { kind: "unavailable" };
  }
}

/** «الإجابة غير صحيحة» — تقريرٌ بالسؤال والجواب كما عُرض. */
export async function flagAnswer(slug: string, question: string, answer: string): Promise<boolean> {
  const q = question.trim().slice(0, 500);
  const a = answer.trim().slice(0, 2000);
  if (!q || !a) return false;
  const db = await createClient();
  const page = await loadPublicProgram(db, slug);
  if (!page) return false;
  if (!(await withinLimits(page.id, "flag"))) return false;
  await report(page.id, "flagged", await audienceOf(slug), q, a);
  return true;
}
