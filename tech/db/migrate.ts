import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

/**
 * مُشغّل الهجرات.
 *
 * حدّ الدعوى: يطبّق ملفات supabase/migrations بالترتيب على مخطط `sunan` وحده،
 * ويتتبّعها في sunan.schema_migrations. **لا يقرأ ولا يكتب خارج هذا المخطط.**
 *
 * لماذا مُشغّل خاص بدل `supabase db push` (adr/0019): المشروع يستضيف تطبيقاً
 * آخر في public، وسجل هجرات Supabase مشترك بينهما. خلط التاريخين يجعل تراجع
 * أحدهما يُربك الآخر. وأمر `db reset` الأصلي يُسقط القاعدة كلها — أي التطبيق
 * الآخر معها.
 */

const SCHEMA = "sunan";
const MIGRATIONS_DIR = "supabase/migrations";
const SEED_FILE = "supabase/seed.sql";

// حارس داخلي: أي عبارة تمسّ مخططاً غير مخططنا تُجهض التنفيذ.
// المُشغّل يحرس نفسه — لا يعتمد على انتباه من يكتب الهجرة.
const FOREIGN_SCHEMA = /\b(drop|truncate|alter)\s+(schema|table)\s+(?:if\s+exists\s+)?(public|auth|storage)\b/i;

type Applied = { version: string; checksum: string };

function checksum(body: string): string {
  return createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  const url = process.env.SUPABASE_DB_URL;

  if (!url) {
    fail(
      "SUPABASE_DB_URL غير مضبوط.\n" +
        "  انسخ .env.example إلى .env، وخذ سلسلة الاتصال من:\n" +
        "  Supabase > Project Settings > Database > Connection string > URI",
    );
  }

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) fail(`لا هجرات في ${MIGRATIONS_DIR}`);

  const bodies = new Map<string, string>();
  for (const file of files) {
    const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    const offending = FOREIGN_SCHEMA.exec(body);
    if (offending) {
      fail(
        `الهجرة ${file} تمسّ مخططاً خارج ${SCHEMA}:\n  ${offending[0]}\n` +
          `  هذا المشروع يستضيف تطبيقاً آخر. لا هجرة تخرج عن مخططنا.`,
      );
    }
    bodies.set(file, body);
  }

  const db = new Client({ connectionString: url });
  await db.connect();

  try {
    if (reset) {
      console.warn(`▶ إسقاط مخطط ${SCHEMA} وإعادة بنائه — public لا يُمَسّ.`);
      await db.query(`drop schema if exists ${SCHEMA} cascade`);
    }

    await db.query(`create schema if not exists ${SCHEMA}`);
    await db.query(`
      create table if not exists ${SCHEMA}.schema_migrations (
        version    text primary key,
        applied_at timestamptz not null default now(),
        checksum   text not null
      )`);

    const { rows } = await db.query<Applied>(
      `select version, checksum from ${SCHEMA}.schema_migrations`,
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    // هجرة نُفِّذت ثم عُدِّلت = انحراف صامت. التصحيح بهجرة جديدة لا بتحرير قديمة.
    for (const [version, sum] of applied) {
      const body = bodies.get(version);
      if (body && checksum(body) !== sum) {
        fail(
          `الهجرة ${version} عُدِّلت بعد تنفيذها.\n` +
            `  الهجرات للأمام فقط — أنشئ هجرة جديدة تصحّح، ولا تحرّر منفَّذة.`,
        );
      }
    }

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = bodies.get(file)!;
      process.stdout.write(`  ${file} … `);
      await db.query("begin");
      try {
        await db.query(body);
        await db.query(
          `insert into ${SCHEMA}.schema_migrations (version, checksum) values ($1, $2)`,
          [file, checksum(body)],
        );
        await db.query("commit");
        console.warn("تمّت");
        count += 1;
      } catch (error) {
        await db.query("rollback");
        console.error("فشلت");
        throw error;
      }
    }

    console.warn(count === 0 ? "▪ لا هجرات معلّقة." : `✔ ${count} هجرة نُفِّذت.`);

    if (reset) {
      const seed = await readFile(SEED_FILE, "utf8");
      if (FOREIGN_SCHEMA.test(seed)) fail("البذرة تمسّ مخططاً خارجياً.");
      await db.query(seed);
      console.warn("✔ البذرة نُفِّذت.");
    }
  } finally {
    await db.end();
  }
}

await main();
