import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

/**
 * الهيكل المشترك للحرّاس.
 *
 * `platform.md §١٣`: كل حارس **يعلن حدّ دعواه في ترويسته**، وله **وضعان**
 * (`--gate` يفشل · `--report` يجرد) و**قائمتان**:
 *   • **استثناء مشروع** — يُسكِت المخالفة، بحجّته وبشرط انقضائه.
 *   • **دَين معلَن** — يُوثّق المخالفة و**يُبقي البوّابة حمراء**. الدَّين لا يُسكِت،
 *     وإلا صار الإعلان بابَ تهرّب: تُكتب سطراً فتمرّ إلى الأبد.
 */

export type Mode = "gate" | "report";

export type Finding = {
  rule: string;
  file: string;
  line: number;
  message: string;
};

export type GuardResult = {
  name: string;
  claim: string;
  findings: Finding[];
  /** مخالفات صمتت باستثناء مشروع — تُعرَض في `--report` ولا تُفشل. */
  excused: Finding[];
  /** مخالفات موثّقة كدَين — تُعرَض **وتُفشل**. */
  debt: Finding[];
};

export type Guard = {
  name: string;
  /** حدّ الدعوى: ما يكشفه وما **لا** يكشفه. */
  claim: string;
  run: (files: SourceFile[]) => Promise<Finding[]> | Finding[];
};

export type SourceFile = {
  /** مسار نسبي بفواصل `/` مهما كان النظام. */
  path: string;
  ext: string;
  text: string;
  lines: string[];
};

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "public",
  ".claude",
]);

const READ_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".sql", ".md", ".mjs", ".json"]);

export async function collectFiles(root: string): Promise<SourceFile[]> {
  const out: SourceFile[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".githooks") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(full);
        continue;
      }
      const ext = extname(entry.name);
      if (!READ_EXTENSIONS.has(ext)) continue;
      const text = await readFile(full, "utf8");
      out.push({
        path: relative(root, full).split(sep).join("/"),
        ext,
        text,
        lines: text.split(/\r?\n/),
      });
    }
  }

  await walk(root);
  return out;
}

/** يبحث عن نمط في ملف ويُرجع كل إصابة بسطرها. */
export function scan(
  file: SourceFile,
  pattern: RegExp,
  rule: string,
  message: (match: RegExpExecArray) => string,
): Finding[] {
  const findings: Finding[] = [];
  file.lines.forEach((line, index) => {
    const re = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      findings.push({
        rule,
        file: file.path,
        line: index + 1,
        message: message(match),
      });
      if (match[0] === "") break;
    }
  });
  return findings;
}

export type ListEntry = {
  guard: string;
  rule: string;
  /** بادئة مسار. المطابقة بالبادئة لا بالتساوي، فيصلح للمجلد والملف. */
  path: string;
  reason: string;
  /** شرط الانقضاء — متى يسقط هذا الاستثناء. إلزامي: استثناء بلا شرط أبديّ. */
  until?: string;
};

function matches(entry: ListEntry, guardName: string, f: Finding): boolean {
  return (
    entry.guard === guardName &&
    entry.rule === f.rule &&
    f.file.startsWith(entry.path)
  );
}

export function partition(
  guardName: string,
  findings: Finding[],
  exceptions: ListEntry[],
  debts: ListEntry[],
): { findings: Finding[]; excused: Finding[]; debt: Finding[] } {
  const excused: Finding[] = [];
  const debt: Finding[] = [];
  const rest: Finding[] = [];

  for (const f of findings) {
    if (exceptions.some((e) => matches(e, guardName, f))) excused.push(f);
    else if (debts.some((d) => matches(d, guardName, f))) debt.push(f);
    else rest.push(f);
  }
  return { findings: rest, excused, debt };
}

export function parseMode(argv: string[]): Mode {
  return argv.includes("--report") ? "report" : "gate";
}

export function printResults(results: GuardResult[], mode: Mode): number {
  let failing = 0;

  for (const r of results) {
    const hard = r.findings.length + r.debt.length;
    failing += hard;

    const mark = hard === 0 ? "✔" : "✖";
    console.warn(`\n${mark} ${r.name}`);
    console.warn(`   ${r.claim}`);

    for (const f of r.findings) {
      console.warn(`   ✖ ${f.file}:${f.line} · ${f.rule}\n     ${f.message}`);
    }
    for (const f of r.debt) {
      console.warn(`   ✖ [دَين معلَن] ${f.file}:${f.line} · ${f.rule}\n     ${f.message}`);
    }
    if (mode === "report") {
      for (const f of r.excused) {
        console.warn(`   ▪ [استثناء] ${f.file}:${f.line} · ${f.rule}`);
      }
    }
  }

  if (failing === 0) {
    console.warn("\n✔ الحرّاس كلهم خُضر.\n");
    return 0;
  }

  console.warn(
    `\n✖ ${failing} مخالفة. ` +
      (mode === "gate"
        ? "البوّابة حمراء.\n"
        : "وضع التقرير — لا فشل، لكن البوّابة ستحمرّ.\n"),
  );
  return mode === "gate" ? 1 : 0;
}
