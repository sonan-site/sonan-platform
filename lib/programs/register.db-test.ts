import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `fn_register` وإسناد المسار — الهجرة ٠٣٢. `[BR-ADM-01]`
 *
 * التسجيل يُختبَر بدور `authenticated` وهويّة المسجِّل: السياسة ومشغّل السعة
 * جزءٌ مما يُفحص، والاختبار بمالك القاعدة يتجاوزهما.
 */

let db: Client;
let sectionId: string;
let programId: string;
let trackA: string;
let trackB: string;
let qGeneral: string;
let qTrackA: string;
let qOptional: string;

const PLAYER = "00000000-0000-4000-8000-0000000009a1";
const OTHER = "00000000-0000-4000-8000-0000000009a2";

/** يُنفَّذ بهوية المسجِّل داخل معاملة تُرجَع، ويُعيد ما يُقرأ قبل الإرجاع. */
async function asPlayer<T>(uid: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    return await work();
  } finally {
    await db.query("rollback");
  }
}

const register = (track: string | null, answers: Record<string, string>) =>
  db.query<{ id: string }>(`select public.fn_register($1, $2, $3::jsonb) as id`, [
    programId,
    track,
    JSON.stringify(answers),
  ]);

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();

  for (const [i, uid] of [PLAYER, OTHER].entries()) {
    await db.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`,
      [uid, `register-${i}@test.local`],
    );
    await db.query(
      `insert into public.profiles (user_id, full_name, phone) values ($1, 'مسجِّل', '+966500000000')`,
      [uid],
    );
  }

  sectionId = (await db.query<{ id: string }>(
    `insert into public.sections (name) values ('قسم اختبار التسجيل') returning id`,
  )).rows[0]!.id;
  programId = (await db.query<{ id: string }>(
    `insert into public.programs (section_id, name, slug, status)
     values ($1, 'برنامج التسجيل', 'register-test', 'published') returning id`,
    [sectionId],
  )).rows[0]!.id;
  const tracks = await db.query<{ id: string; name: string }>(
    `insert into public.tracks (program_id, name, sort_order) values ($1, 'أ', 0), ($1, 'ب', 1)
     returning id, name`,
    [programId],
  );
  trackA = tracks.rows.find((t) => t.name === "أ")!.id;
  trackB = tracks.rows.find((t) => t.name === "ب")!.id;

  const questions = await db.query<{ id: string; question: string }>(
    `insert into public.admission_questions (program_id, track_id, question, is_required, sort_order) values
       ($1, null, 'لماذا تلتحق؟', true, 0),
       ($1, $2,  'ما محفوظك في المسار أ؟', true, 1),
       ($1, null, 'ملاحظة اختيارية', false, 2)
     returning id, question`,
    [programId, trackA],
  );
  qGeneral = questions.rows.find((q) => q.question.startsWith("لماذا"))!.id;
  qTrackA = questions.rows.find((q) => q.question.includes("المسار أ"))!.id;
  qOptional = questions.rows.find((q) => q.question.startsWith("ملاحظة"))!.id;
});

afterAll(async () => {
  if (programId) {
    await db.query(
      `delete from public.audit_log where entity_id in (select id from public.participants where program_id = $1)`,
      [programId],
    );
    await db.query(
      `delete from public.admission_answers where participant_id in (select id from public.participants where program_id = $1)`,
      [programId],
    );
    await db.query(`delete from public.participants where program_id = $1`, [programId]);
    await db.query(`delete from public.admission_questions where program_id = $1`, [programId]);
    await db.query(`delete from public.tracks where program_id = $1`, [programId]);
    await db.query(`delete from public.programs where id = $1`, [programId]);
    await db.query(`delete from public.sections where id = $1`, [sectionId]);
  }
  await db.query(`delete from public.profiles where user_id = any($1::uuid[])`, [[PLAYER, OTHER]]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [[PLAYER, OTHER]]);
  await db?.end();
});

async function participantsCount(): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.participants where program_id = $1`,
    [programId],
  );
  return rows[0]!.n;
}

describe("التسجيل فعلٌ واحد `[BR-ADM-01]`", () => {
  it("**بلا إجابة إلزامية ← لا مشارك** — والرسالة تسمّي السؤال", async () => {
    await asPlayer(PLAYER, async () => {
      // نقطة حفظ: الرفض يُفسد المعاملة، والعدّ بعده يحتاج معاملة سليمة.
      await db.query("savepoint before_register");
      await expect(register(trackA, { [qGeneral]: "للحفظ" })).rejects.toThrow(/ما محفوظك في المسار أ/);
      await db.query("rollback to savepoint before_register");
      await db.query("reset role");
      expect(await participantsCount()).toBe(0);
    });
  });

  it("**بلا مسار في برنامج له مسارات ← رفض**", async () => {
    await asPlayer(PLAYER, async () => {
      await expect(register(null, { [qGeneral]: "للحفظ" })).rejects.toThrow(/اختر مسارك/);
    });
  });

  it("سؤال مسارٍ آخر لا يُشترط — المسار ب بلا سؤال خاصّ", async () => {
    await asPlayer(PLAYER, async () => {
      const { rows } = await register(trackB, { [qGeneral]: "للحفظ" });
      expect(rows[0]!.id).toBeTruthy();
    });
  });

  it("**التسجيل الكامل ← مشارك وإجاباته وتدقيقه معاً**", async () => {
    await asPlayer(PLAYER, async () => {
      const { rows } = await register(trackA, {
        [qGeneral]: "للحفظ",
        [qTrackA]: "جزء عمّ",
        [qOptional]: "",
      });
      const id = rows[0]!.id;
      // التحقّق بمالك القاعدة: المسجِّل لا يقرأ سجل التدقيق، وهذا صحيح.
      await db.query("reset role");
      const answers = await db.query(
        `select question_id from public.admission_answers where participant_id = $1`,
        [id],
      );
      expect(answers.rowCount).toBe(2);
      const audit = await db.query(
        `select 1 from public.audit_log where action = 'participant_registered' and entity_id = $1`,
        [id],
      );
      expect(audit.rowCount).toBe(1);
    });
  });

  it("إجابة أطول من ألفي حرف تُرفض", async () => {
    await asPlayer(PLAYER, async () => {
      await expect(
        register(trackA, { [qGeneral]: "أ".repeat(2001), [qTrackA]: "جزء" }),
      ).rejects.toThrow(/أطول من المسموح/);
    });
  });
});

describe("إسناد المسار تحت سعته", () => {
  it("**الإسناد لا يتجاوز سعة المسار** — لا باب خلفي", async () => {
    await db.query(`update public.tracks set capacity = 1 where id = $1`, [trackA]);
    try {
      await db.query(
        `insert into public.participants (user_id, program_id, track_id) values ($1, $2, $3)`,
        [PLAYER, programId, trackA],
      );
      await db.query(
        `insert into public.participants (user_id, program_id, track_id) values ($1, $2, null)`,
        [OTHER, programId],
      );
      await expect(
        db.query(
          `update public.participants set track_id = $1 where user_id = $2 and program_id = $3`,
          [trackA, OTHER, programId],
        ),
      ).rejects.toThrow(/اكتمل العدد في هذا المسار/);

      const { rowCount } = await db.query(
        `update public.participants set track_id = $1 where user_id = $2 and program_id = $3`,
        [trackB, OTHER, programId],
      );
      expect(rowCount).toBe(1);
    } finally {
      await db.query(`update public.tracks set capacity = null where id = $1`, [trackA]);
      await db.query(`delete from public.participants where program_id = $1`, [programId]);
    }
  });
});
