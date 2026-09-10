import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * وحدانية الارتباط بين الجداول.
 *
 * **العطب الذي أنشأ هذا الملف:** أُضيف مفتاح مركّب `(track_id, program_id)`
 * على `participants` ليمنع إسناد مشارك إلى مسار من برنامج آخر، وبقي المفتاح
 * المفرد `(track_id)` معه. فصار للجدول طريقان إلى `tracks`.
 *
 * وواجهة REST تشتقّ ارتباطاتها من المفاتيح: مفتاحان إلى الجدول نفسه يجعلانها
 * لا تدري أيّهما يُقصَد، **فترفض الاستعلام كلّه**. وشاشة «رحلتي» عرضت «تعذّر
 * جلب مشاركتك» بلا خلل في البيانات ولا في السياسات ولا في الكود.
 *
 * ولم يمسكه شيء: `tsc` لا يرى المفاتيح، والحرّاس لا يقرؤون العلاقات،
 * والاختبارات القاعدية تستعلم بـSQL مباشر لا بواجهة REST.
 *
 * **القاعدة المفحوصة: لا مفتاحان يتقاسمان عموداً.** وليست «لا مفتاحان» —
 * فـ`track_change_requests` تحمل `from_track_id` و`to_track_id`، وكلاهما إلى
 * `tracks` بعمودين مختلفين. وذاك ارتباط مزدوج **مقصود**، يُسمّى في الاستعلام
 * صراحةً ولا يُخطئ فيه أحد. أما تقاسم عمودٍ فطريقان إلى الشيء نفسه، وهو
 * الزائد الذي يقع سهواً.
 *
 * والفحص بنيوي بلا اسم جدول مكتوب — والجدول القادم يدخله وحده.
 */

let db: Client;

beforeAll(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير مضبوط — اختبارات القاعدة لا تُتخطّى.");
  db = new Client({ connectionString: url });
  await db.connect();
});

afterAll(async () => {
  await db?.end();
});

describe("طريق واحد بين كل جدولين", () => {
  it("**لا مفتاحان يتقاسمان عموداً** — الغموض يُفشل الاستعلام لا يُحذّر منه", async () => {
    const { rows } = await db.query<{ child: string; parent: string; names: string }>(
      `with fks as (
         select
           child.relname as child,
           parent.relname as parent,
           c.conname,
           c.conkey
         from pg_constraint c
         join pg_class child on child.oid = c.conrelid
         join pg_class parent on parent.oid = c.confrelid
         join pg_namespace n on n.oid = child.relnamespace
         join pg_namespace pn on pn.oid = parent.relnamespace
         where c.contype = 'f' and n.nspname = 'public' and pn.nspname = 'public'
       )
       select a.child, a.parent, a.conname || ' · ' || b.conname as names
       from fks a
       join fks b
         on a.child = b.child and a.parent = b.parent and a.conname < b.conname
       where a.conkey && b.conkey`,
    );

    const doubled = rows.map((r) => `${r.child} → ${r.parent} (${r.names})`);
    expect(
      doubled,
      `طريقان أو أكثر بين جدولين — واجهة REST ترفض أي استعلام يربطهما:\n${doubled.join("\n")}`,
    ).toEqual([]);
  });

  it("مفتاح مسار المشارك مركّب وحده — يمنع مساراً من برنامج آخر", async () => {
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_constraintdef(c.oid) as def
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_class f on f.oid = c.confrelid
       where t.relname = 'participants' and f.relname = 'tracks' and c.contype = 'f'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.def).toContain("(track_id, program_id)");
  });
});
