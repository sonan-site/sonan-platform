import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PARTICIPANT_STATUSES, PROGRAM_KIND_CODES, statusesOf } from "./kinds";

/**
 * حدّ الوعاء مفروضاً في القاعدة — `[BR-KIND-01]` · `adr/0024`.
 *
 * ما يُفحَص شيئان:
 *
 * 1. **الكتالوج يطابق القاعدة في الاتجاهين.** نمطٌ في القاعدة بلا تعريف
 *    يظهر في القائمة بلا تسمية، وتعريفٌ بلا وجود يُنتج قيمة تُرفَض عند الكتابة.
 * 2. **الحدّ مفروض بقيد لا بأدب واجهة.** `platform.md §٧`: ما يُفرض في
 *    التطبيق فقط غير مفروض.
 */

let db: Client;
let sectionId: string;

async function makeProgram(slug: string, kind: string): Promise<string> {
  const scored = kind === "competition";
  const { rows } = await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug, kind, passing_percentage, award_percentage)
     values ($1, $2, $3, $4::public.program_kind, $5, $6) returning id`,
    [sectionId, `برنامج ${slug}`, slug, kind, scored ? 80 : null, scored ? 90 : null],
  );
  return rows[0]!.id;
}

async function makeParticipant(programId: string, uid: string, status = "registered") {
  return db.query(
    `insert into public.participants (user_id, program_id, status)
     values ($1, $2, $3::public.participant_status)`,
    [uid, programId, status],
  );
}

const USER = "00000000-0000-4000-8000-0000000000d1";

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  const section = await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار الأنماط') returning id`,
  );
  sectionId = section.rows[0]!.id;

  await db.query(
    `insert into auth.users (id, email, aud, role)
     values ($1, 'kinds@test.local', 'authenticated', 'authenticated')`,
    [USER],
  );
});

afterAll(async () => {
  if (sectionId) {
    const progs = `(select id from public.programs where section_id = '${sectionId}')`;
    await db.query(`delete from public.participants where program_id in ${progs}`);
    await db.query(`delete from public.exams where program_id in ${progs}`);
    await db.query(`delete from public.programs where section_id = $1`, [sectionId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
    await db.query(`delete from auth.users where id = $1`, [USER]);
  }
  await db?.end();
});

describe("الكتالوج يطابق القاعدة", () => {
  it("**أنماط القاعدة = مفاتيح الكتالوج، في الاتجاهين**", async () => {
    const { rows } = await db.query<{ v: string }>(
      `select enumlabel as v from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       where t.typname = 'program_kind' order by enumsortorder`,
    );
    expect(rows.map((r) => r.v).sort()).toEqual([...PROGRAM_KIND_CODES].sort());
  });

  it("حالات القاعدة = اتحاد حالات الكتالوج، في الاتجاهين", async () => {
    const { rows } = await db.query<{ v: string }>(
      `select enumlabel as v from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       where t.typname = 'participant_status' order by enumsortorder`,
    );
    expect(rows.map((r) => r.v).sort()).toEqual([...PARTICIPANT_STATUSES].sort());
    const union = new Set(PROGRAM_KIND_CODES.flatMap((k) => [...statusesOf(k)]));
    expect([...union].sort()).toEqual([...PARTICIPANT_STATUSES].sort());
  });
});

describe("الاختبار للمسابقة وحدها", () => {
  it("**اختبار في برنامج متابعة أسبوعية يُرفض**", async () => {
    const id = await makeProgram("kind-weekly-exam", "weekly_followup");
    await expect(
      db.query(
        `insert into public.exams
           (program_id, name, exam_type, stage, pass_percentage, question_count,
            seconds_per_question, max_skips)
         values ($1, 'تصفية', 'remote', 'interim', 80, 10, 60, 0)`,
        [id],
      ),
    ).rejects.toThrow(/لا يُعرَّف إلا في برنامج مسابقة/);
  });

  it("واختبار في المسابقة يُقبَل — لا نفي زائد", async () => {
    const id = await makeProgram("kind-comp-exam", "competition");
    const { rowCount } = await db.query(
      `insert into public.exams
         (program_id, name, exam_type, stage, pass_percentage, question_count,
          seconds_per_question, max_skips)
       values ($1, 'تصفية', 'remote', 'interim', 80, 10, 60, 0)`,
      [id],
    );
    expect(rowCount).toBe(1);
  });

  it("**ويوم الاختبار مُغلَق تعدّياً** — بلا قيد ثانٍ عليه", async () => {
    // القيد على `exams` وحده. ويوم الاختبار يوجب `exam_id` غير فارغ، والحارس
    // يوجب أن يكون من برنامج الخطة — فبلا اختبار لا يقوم اليوم. **يُختبَر لا يُفترَض.**
    const id = await makeProgram("kind-weekly-day", "weekly_followup");
    const track = await db.query<{ id: string }>(
      `insert into public.tracks (program_id, name) values ($1, 'م') returning id`,
      [id],
    );
    const plan = await db.query<{ id: string }>(
      `insert into public.plans (track_id, name) values ($1, 'خطة') returning id`,
      [track.rows[0]!.id],
    );
    // أي اختبار من برنامج آخر يُرفض بحارس المراجع، وبرنامجه لا يقبل اختباراً.
    const foreign = await db.query<{ id: string }>(
      `select id from public.exams limit 1`,
    );
    if (foreign.rowCount) {
      await expect(
        db.query(
          `insert into public.plan_days (plan_id, day_number, day_type, exam_id)
           values ($1, 1, 'exam', $2)`,
          [plan.rows[0]!.id, foreign.rows[0]!.id],
        ),
      ).rejects.toThrow();
    }
    await expect(
      db.query(
        `insert into public.plan_days (plan_id, day_number, day_type) values ($1, 1, 'exam')`,
        [plan.rows[0]!.id],
      ),
    ).rejects.toThrow(/chk_plan_days_type_consistency/i);

    await db.query(`delete from public.plans where id = $1`, [plan.rows[0]!.id]);
    await db.query(`delete from public.tracks where id = $1`, [track.rows[0]!.id]);
  });
});

describe("النمط يُختار مرّة", () => {
  it("**تغييره يُرفض ولو كان البرنامج فارغاً**", async () => {
    const id = await makeProgram("kind-immutable", "competition");
    await expect(
      db.query(`update public.programs set kind = 'weekly_followup' where id = $1`, [id]),
    ).rejects.toThrow(/يُختار مرّة/);
  });

  it("تعديل حقل آخر يمرّ — الحارس على النمط وحده", async () => {
    const id = await makeProgram("kind-rename", "competition");
    const { rowCount } = await db.query(
      `update public.programs set name = 'اسم جديد' where id = $1`,
      [id],
    );
    expect(rowCount).toBe(1);
  });
});

describe("حالة المشارك تتبع النمط", () => {
  it("**حالة تنافسية في غير المسابقة تُرفض**", async () => {
    const id = await makeProgram("kind-status-bad", "remote_memorization");
    await expect(makeParticipant(id, USER, "passed")).rejects.toThrow(/خاصة ببرامج المسابقة/);
  });

  it("الحالتان العامّتان تمرّان في النمطين غير التنافسيين", async () => {
    for (const [i, kind] of ["weekly_followup", "remote_memorization"].entries()) {
      const id = await makeProgram(`kind-status-ok-${i}`, kind);
      await makeParticipant(id, USER, "memorizing");
      const { rows } = await db.query<{ status: string }>(
        `select status from public.participants where program_id = $1`,
        [id],
      );
      expect(rows[0]?.status, kind).toBe("memorizing");
      await db.query(`delete from public.participants where program_id = $1`, [id]);
    }
  });

  it("الحالات الستّ تمرّ في المسابقة — لا كسر رجعي", async () => {
    const id = await makeProgram("kind-status-all", "competition");
    for (const status of PARTICIPANT_STATUSES) {
      await makeParticipant(id, USER, status);
      await db.query(`delete from public.participants where program_id = $1`, [id]);
    }
  });

  it("**نقل مشارك إلى حالة تنافسية بعد إنشائه يُرفض كذلك**", async () => {
    const id = await makeProgram("kind-status-update", "weekly_followup");
    await makeParticipant(id, USER, "registered");
    await expect(
      db.query(`update public.participants set status = 'qualified' where program_id = $1`, [id]),
    ).rejects.toThrow(/خاصة ببرامج المسابقة/);
    await db.query(`delete from public.participants where program_id = $1`, [id]);
  });
});

describe("العتبتان للمسابقة وحدها", () => {
  it("**غير المسابقة بعتبة يُرفض**", async () => {
    await expect(
      db.query(
        `insert into public.programs (section_id, name, slug, kind, passing_percentage, award_percentage)
         values ($1, 'ب', 'kind-thr-bad', 'weekly_followup', 80, null)`,
        [sectionId],
      ),
    ).rejects.toThrow(/chk_programs_thresholds_by_kind/i);
  });

  it("**والمسابقة بعتبة فارغة تُرفض** — الشرطية في الاتجاهين", async () => {
    await expect(
      db.query(
        `insert into public.programs (section_id, name, slug, kind, passing_percentage, award_percentage)
         values ($1, 'ب', 'kind-thr-null', 'competition', null, null)`,
        [sectionId],
      ),
    ).rejects.toThrow(/chk_programs_thresholds_by_kind/i);
  });

  it("والافتراضيان يُبقيان الإنشاء الصامت عاملاً في المسابقة", async () => {
    const { rowCount } = await db.query(
      `insert into public.programs (section_id, name, slug) values ($1, 'ب', 'kind-thr-default')`,
      [sectionId],
    );
    expect(rowCount).toBe(1);
  });
});
