import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { nowIso } from "../../lib/format/index.ts";

/**
 * نسخ القاعدة الحيّة وتجربة استعادتها — **يدويّ، خارج CI** (`platform.md §٥`).
 *
 *   pnpm db:backup              نسخةٌ كاملة إلى مجلد النسخ، ويُبقى أحدث ١٤
 *   pnpm db:backup -- --drill   نسخةٌ ثم استعادتها في قاعدة مؤقتة ومطابقتها بالحيّة
 *
 * **لماذا بأيدينا:** الخطة المجانية في Supabase لا تتيح تنزيل نسخها اليومية
 * ولا الاستعادة لنقطة زمنية. فالنسخة التي نملكها هي التي نأخذها.
 *
 * **والنسخة خارج المستودع عمداً:** فيها بيانات المشاركين وهوياتهم، والمستودع
 * عام. مجلدها `BACKUP_DIR` (افتراضاً `C:\dev\backups\sonan`) ولا يُرفع لأي خدمة.
 *
 * **والتجربة تقيس ما يهمّ:** عدد صفوف كل جدول في `public` و`auth` و`storage`،
 * وعدد الدوال والسياسات والمشغّلات في `public` — حيّاً ومستعاداً. أي فرقٍ يُفشلها.
 * وأخطاء `supabase_vault` متوقَّعة: امتدادٌ داخلي لـSupabase لا يوجد خارجها،
 * ولا نستعمله (جدوله فارغ — والتجربة تتحقق من ذلك).
 *
 * يحتاج أدوات PostgreSQL 17 (الإصدار نفسه في Supabase) — `PG_BIN`، افتراضاً
 * `C:\dev\tools\pgsql\bin`.
 */

const say = (line: string) => process.stdout.write(line + String.fromCharCode(10));

const URL = process.env.SUPABASE_DB_URL;
if (!URL) throw new Error("SUPABASE_DB_URL غير مضبوط.");

const PG_BIN = process.env.PG_BIN ?? "C:\\dev\\tools\\pgsql\\bin";
const BACKUP_DIR = process.env.BACKUP_DIR ?? "C:\\dev\\backups\\sonan";
const KEEP = 14;
const DRILL = process.argv.includes("--drill");
const bin = (name: string) => join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);

if (!existsSync(bin("pg_dump"))) throw new Error(`pg_dump غير موجود في ${PG_BIN} — اضبط PG_BIN.`);

// ══ النسخ ══
mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = nowIso().slice(0, 16).replace(/[:T]/g, "-");
const file = join(BACKUP_DIR, `sonan-${stamp}.dump`);
execFileSync(bin("pg_dump"), ["-Fc", "--no-owner", "--no-privileges", "-f", file, URL], { stdio: "inherit" });
say(`النسخة: ${file} (${Math.round(statSync(file).size / 1024)} KB)`);

const old = readdirSync(BACKUP_DIR)
  .filter((f) => /^sonan-.*\.dump$/.test(f))
  .sort()
  .reverse()
  .slice(KEEP);
for (const f of old) rmSync(join(BACKUP_DIR, f));
if (old.length) say(`حُذفت ${old.length} نسخة أقدم من أحدث ${KEEP}.`);

if (!DRILL) process.exit(0);

// ══ التجربة: قاعدة مؤقتة تُستعاد إليها النسخة ثم تُطابَق ══
const PORT = "54399";
const work = mkdtempSync(join(tmpdir(), "sonan-drill-"));
const data = join(work, "data");
const local = `postgres://postgres@localhost:${PORT}/restored`;
const psql = (sql: string, db = "postgres") =>
  execFileSync(bin("psql"), ["-h", "localhost", "-p", PORT, "-U", "postgres", "-d", db, "-qc", sql], { stdio: "pipe" });

// أدوار Supabase التي تذكرها السياسات والمنح — تُنشأ بلا دخول ليُستعاد ما يذكرها.
const ROLES = [
  "anon", "authenticated", "service_role", "authenticator", "supabase_admin", "supabase_auth_admin",
  "supabase_storage_admin", "dashboard_user", "pgbouncer", "supabase_realtime_admin",
  "supabase_replication_admin", "supabase_read_only_user", "supabase_functions_admin",
];

const TABLES = `select table_schema s, table_name t from information_schema.tables
  where table_type = 'BASE TABLE' and table_schema in ('public', 'auth', 'storage', 'supabase_migrations')
  order by 1, 2`;

async function census(url: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const rows = new Map<string, number>();
  for (const { s, t } of (await c.query<{ s: string; t: string }>(TABLES)).rows) {
    rows.set(`${s}.${t}`, Number((await c.query(`select count(*) n from "${s}"."${t}"`)).rows[0].n));
  }
  const one = async (sql: string) => Number((await c.query(sql)).rows[0].n);
  const shape = {
    functions: await one(`select count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where nspname = 'public'`),
    policies: await one(`select count(*) n from pg_policies where schemaname = 'public'`),
    triggers: await one(`select count(*) n from pg_trigger t join pg_class c on c.oid = t.tgrelid
                         join pg_namespace n on n.oid = c.relnamespace where nspname = 'public' and not tgisinternal`),
  };
  const vault = url === URL ? await one(`select count(*) n from vault.secrets`) : 0;
  await c.end();
  return { rows, shape, vault };
}

let failed = false;
try {
  execFileSync(bin("initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"], { stdio: "pipe" });
  // `ignore` لا `pipe`: الخادم يرث مخارج pg_ctl ويبقيها مفتوحة، فينتظره الاستدعاء إلى الأبد.
  execFileSync(bin("pg_ctl"), ["-D", data, "-o", `-p ${PORT} -c listen_addresses=localhost`, "-l", join(work, "pg.log"), "-w", "start"], { stdio: "ignore" });
  for (const r of ROLES) psql(`create role ${r} nologin`);
  psql("create database restored");

  const restore = spawnSync(bin("pg_restore"), ["-h", "localhost", "-p", PORT, "-U", "postgres", "-d", "restored", "--no-owner", "--no-privileges", file], { encoding: "utf8" });
  const errors = restore.stderr.split(/\r?\n/).filter((l) => l.includes("error:"));
  const unexpected = errors.filter((l) => !/supabase_vault|vault\.secrets/.test(l));
  say(`أخطاء الاستعادة: ${errors.length} (غير المتوقَّع منها: ${unexpected.length})`);
  for (const l of unexpected) say(`  ${l}`);

  const live = await census(URL);
  const back = await census(local);
  if (live.vault > 0) say(`تنبيه: vault.secrets فيه ${live.vault} صفاً لا تحملها الاستعادة خارج Supabase.`);

  let rows = 0;
  const diffs: string[] = [];
  for (const [k, n] of live.rows) {
    if (back.rows.get(k) !== n) diffs.push(`${k}: حيّ ${n} · مستعاد ${back.rows.get(k) ?? "غائب"}`);
    else rows += n;
  }
  for (const k of Object.keys(live.shape) as (keyof typeof live.shape)[]) {
    if (live.shape[k] !== back.shape[k]) diffs.push(`${k}: حيّ ${live.shape[k]} · مستعاد ${back.shape[k]}`);
  }
  for (const d of diffs) say(`فرق: ${d}`);
  say(`جداول: ${live.rows.size} · صفوف متطابقة: ${rows} · دوال ${back.shape.functions} · سياسات ${back.shape.policies} · مشغّلات ${back.shape.triggers}`);

  failed = diffs.length > 0 || unexpected.length > 0 || live.vault > 0;
  say(failed ? "التجربة: فشلت" : "التجربة: نجحت — النسخة تُستعاد كاملة");
} finally {
  spawnSync(bin("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "pipe" });
  rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
