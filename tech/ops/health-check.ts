import { appendFileSync } from "node:fs";
import { now, nowIso } from "../../lib/format/index.ts";

/**
 * فحص جاهزية الموقع الحيّ — **كل ساعة من CI** (`.github/workflows/health.yml`).
 *
 *   node tech/ops/health-check.ts
 *
 * يقرأ ما يراه الزائر وحده، فلا يحتاج سرّاً واحداً (والمستودع عام).
 * والمقاعد في الواجهة تُقرأ من القاعدة عند كل طلب، فظهورها دليل أن القاعدة تستجيب.
 *
 * **يفشل** (فيصل بريدٌ من GitHub) عند: صفحةٍ لا تفتح، أو بطءٍ شديد، أو غياب زر التسجيل
 * ونافذته مفتوحة، أو غياب المقاعد. **ولا يفشل** لمسارٍ قارب الاكتمال: ذاك في الملخص
 * اليومي، لا تنبيهٌ يتكرّر كل ساعة.
 */

const SITE = process.env.HEALTH_SITE ?? "https://www.sonan.site";
const PROGRAM_SLUG = "sunan-competition-1448";

/** نهاية نافذة التسجيل (آخر ١٨ جمادى الآخرة ١٤٤٨ بتوقيت الرياض). بعدها لا يُطلب زرّ التسجيل. */
const REGISTRATION_UNTIL = new Date("2026-11-28T20:59:59.999Z");

const SLOW_MS = 8000;
const TIMEOUT_MS = 20000;

type Page = { path: string; status: number; ms: number; html: string };

const failures: string[] = [];
const lines: string[] = [];

async function get(path: string): Promise<Page> {
  const started = now().getTime();
  try {
    const res = await fetch(SITE + path, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "sonan-health-check" },
    });
    return { path, status: res.status, ms: now().getTime() - started, html: await res.text() };
  } catch (error) {
    return { path, status: 0, ms: now().getTime() - started, html: String(error) };
  }
}

const pages = await Promise.all(
  ["/", `/p/${PROGRAM_SLUG}/guide`, "/login", "/terms", "/privacy"].map(get),
);

for (const page of pages) {
  const ok = page.status === 200;
  lines.push(`${ok ? "✔" : "✘"} ${page.path} — ${page.status || "لا استجابة"} · ${page.ms}ms`);
  if (!ok) failures.push(`${page.path} لا تفتح (${page.status || page.html.slice(0, 120)})`);
  else if (page.ms > SLOW_MS) failures.push(`${page.path} بطيئة جداً (${page.ms}ms)`);
}

const home = pages[0];
if (home?.status === 200) {
  const registrationOpen = now().getTime() <= REGISTRATION_UNTIL.getTime();
  if (registrationOpen && !home.html.includes("سجّل الآن")) {
    failures.push("زرّ «سجّل الآن» غائب عن الواجهة ونافذة التسجيل مفتوحة");
  }

  // «متبقي 48 من 80 مقعداً» — من fn_public_tracks.
  const seats = [...home.html.matchAll(/متبقي (\d+) من (\d+)/g)].map((m) => ({
    left: Number(m[1]),
    capacity: Number(m[2]),
  }));
  if (seats.length === 0) {
    failures.push("المقاعد غائبة عن الواجهة — القاعدة لا تستجيب أو المسارات لم تُعرض");
  } else {
    const taken = seats.reduce((sum, s) => sum + (s.capacity - s.left), 0);
    lines.push(`المقاعد: ${seats.map((s) => `${s.left}/${s.capacity}`).join(" · ")} — المأخوذ ${taken}`);
  }
}

const report = [`فحص ${SITE} — ${nowIso()}`, ...lines];
if (failures.length) report.push("", "الإخفاقات:", ...failures.map((f) => `- ${f}`));
process.stdout.write(report.join("\n") + "\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.map((l) => (l ? `${l}  ` : "")).join("\n") + "\n");
}

process.exitCode = failures.length ? 1 : 0;
