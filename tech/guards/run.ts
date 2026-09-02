import { DECLARED_DEBT, EXCEPTIONS } from "./allowlist.ts";
import { guardCompleteness } from "./guard-completeness.ts";
import { guardPermissions } from "./guard-permissions.ts";
import { guardStructure } from "./guard-structure.ts";
import { guardStyle } from "./guard-style.ts";
import { guardTypes } from "./guard-types.ts";
import {
  collectFiles,
  parseMode,
  partition,
  printResults,
  type GuardResult,
} from "./harness.ts";

/**
 * مُشغّل الحرّاس.
 *
 * `--gate` (الافتراضي) يفشل عند أي مخالفة — يُشغَّل في `verify` والخطّاف وCI.
 * `--report` يجرد ولا يفشل — للمراجعة الدورية.
 *
 * **لا مبدأ إلزامي بلا مُشغِّل تلقائي** (`platform.md §١٣`): الحارس بلا زناد
 * توثيقٌ يوهم.
 */

const GUARDS = [guardStyle, guardStructure, guardPermissions, guardCompleteness, guardTypes];

const mode = parseMode(process.argv);
const files = await collectFiles(process.cwd());
const results: GuardResult[] = [];

for (const guard of GUARDS) {
  const raw = await guard.run(files);
  const split = partition(guard.name, raw, EXCEPTIONS, DECLARED_DEBT);
  results.push({ name: guard.name, claim: guard.claim, ...split });
}

process.exit(printResults(results, mode));
