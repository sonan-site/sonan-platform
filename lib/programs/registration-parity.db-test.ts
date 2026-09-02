import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registrationState, type ProgramWindow } from "./registration";

/**
 * **اختبار تكافؤ** — `platform.md §١٢`.
 *
 * قاعدة `BR-CAP-01` مكرَّرة بالضرورة: في TypeScript للعرض، وفي SQL لأن الإنفاذ
 * لا يكون إلا في القاعدة. والمعيار يجيز التكرار عند تعذّر توحيده **بشرط اختبار
 * تكافؤ بمدخلات موحّدة** — لا بتعليق يقول «انتبه أن تُبقيهما متطابقتين».
 *
 * هذا الاختبار هو ذلك الشرط: مصفوفة حالات واحدة تُغذّى للاثنين، ويُقارَن الناتج.
 * انحراف أحدهما عن الآخر يُفشل البوّابة.
 */

let db: Client;
let sectionId: string;
const createdPrograms: string[] = [];

const HOUR = 60 * 60 * 1000;

type Case = {
  label: string;
  status: "draft" | "published" | "closed";
  capacity: number | null;
  opensOffsetMs: number | null;
  closesOffsetMs: number | null;
};

const CASES: Case[] = [
  { label: "مسوّدة", status: "draft", capacity: null, opensOffsetMs: null, closesOffsetMs: null },
  { label: "مغلق يدوياً", status: "closed", capacity: null, opensOffsetMs: null, closesOffsetMs: null },
  { label: "منشور بلا تواريخ", status: "published", capacity: null, opensOffsetMs: null, closesOffsetMs: null },
  { label: "قبل الفتح", status: "published", capacity: null, opensOffsetMs: HOUR, closesOffsetMs: null },
  { label: "بعد الإغلاق", status: "published", capacity: null, opensOffsetMs: null, closesOffsetMs: -HOUR },
  { label: "داخل النافذة", status: "published", capacity: null, opensOffsetMs: -HOUR, closesOffsetMs: HOUR },
  { label: "سعة غير مكتملة", status: "published", capacity: 5, opensOffsetMs: null, closesOffsetMs: null },
  { label: "مغلق يدوياً رغم نافذة مفتوحة", status: "closed", capacity: 5, opensOffsetMs: -HOUR, closesOffsetMs: HOUR },
  { label: "مسوّدة داخل النافذة", status: "draft", capacity: null, opensOffsetMs: -HOUR, closesOffsetMs: HOUR },
];

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const { rows } = await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار التكافؤ') returning id`,
  );
  sectionId = rows[0]!.id;
});

afterAll(async () => {
  if (createdPrograms.length > 0) {
    await db.query(`delete from public.programs where id = any($1)`, [createdPrograms]);
  }
  if (sectionId) await db.query(`delete from public.sections where id = $1`, [sectionId]);
  await db?.end();
});

describe("تكافؤ BR-CAP-01 بين TypeScript والقاعدة", () => {
  it.each(CASES)("$label", async (testCase) => {
    const opensAt =
      testCase.opensOffsetMs === null
        ? null
        : new Date(Date.parse("2026-01-01T00:00:00Z")).toISOString();

    // التواريخ تُحسب من «الآن» في الطرفين، فنأخذ الآن من القاعدة نفسها
    // ليكون المرجع واحداً ولا يتأرجح الاختبار بفارق ساعات الجهاز.
    const { rows: nowRows } = await db.query<{ at: Date }>("select now() as at");
    const dbNow = nowRows[0]!.at;

    const opens =
      testCase.opensOffsetMs === null
        ? null
        : new Date(dbNow.getTime() + testCase.opensOffsetMs).toISOString();
    const closes =
      testCase.closesOffsetMs === null
        ? null
        : new Date(dbNow.getTime() + testCase.closesOffsetMs).toISOString();
    void opensAt;

    const slug = `parity-${createdPrograms.length}-${testCase.status}`;
    const { rows } = await db.query<{ id: string }>(
      `insert into public.programs
         (section_id, name, slug, status, capacity, registration_opens_at, registration_closes_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [sectionId, testCase.label, slug, testCase.status, testCase.capacity, opens, closes],
    );
    const programId = rows[0]!.id;
    createdPrograms.push(programId);

    const { rows: sqlRows } = await db.query<{ state: string }>(
      `select public.fn_registration_state($1) as state`,
      [programId],
    );

    const input: ProgramWindow = {
      status: testCase.status,
      capacity: testCase.capacity,
      opensAt: opens,
      closesAt: closes,
      registeredCount: 0,
    };

    expect(sqlRows[0]?.state, "القاعدة تخالف TypeScript").toBe(
      registrationState(input, dbNow),
    );
  });
});
