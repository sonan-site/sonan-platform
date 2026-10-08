"use client";

import { useMemo, useState, useTransition } from "react";
import { reportAction } from "@/components/shared/action-notice";
import { Button, Input, Select, Textarea } from "@/components/shared/form";
import { formatNumber } from "@/lib/format";
import { planIssues, type PlanDraft, type PlanField, type TrackShare } from "@/lib/plans/engine";
import {
  buildPrompt,
  mappingWarnings,
  normalizeName,
  parseCsv,
  parseExternalPlan,
  rolesFor,
  ROLE_LABEL,
  rowsToExternal,
  suggestMapping,
  type ColumnRole,
  type ImportResult,
  type Mapping,
} from "@/lib/plans/import";
import type { Material } from "@/lib/programs/material";
import { removeImportMapping, saveImportMapping } from "../actions";
import styles from "../plans.module.css";

export type SavedMapping = { id: string; name: string; mapping: Mapping };

/**
 * الاستيراد (`adr/0042`) — ملفٌ واحد يحمل الخطة كلها، بإحدى طريقين:
 *
 * - **JSON**: يُلصق، ومصدره المعتاد برومبتٌ تولّده المنصة لهذه الخطة.
 * - **Excel أو CSV**: يُقرأ في المتصفح فلا يُرفع، ثم تُعيَّن أعمدته.
 *
 * والنتيجة مسوّدةٌ تُعرض ملاحظاتها، ثم تُوضع في المحرّر — والحفظ بعدها كأي حفظ.
 */
export function ImportPanel({
  programId,
  programName,
  fields,
  tracks,
  track,
  material,
  lockedThrough,
  current,
  mappings,
  onApply,
}: {
  programId: string;
  programName: string;
  fields: PlanField[];
  /** كل مسارٍ يستعمل الخطة — عليها تُفحص. */
  tracks: TrackShare[];
  /** المسار المختار في المحرّر — عليه تُقرأ «من/إلى» ويُكتب البرومبت. */
  track: TrackShare | null;
  material: Material;
  lockedThrough: number;
  current: PlanDraft;
  mappings: SavedMapping[];
  onApply: (draft: PlanDraft) => void;
}) {
  const [mode, setMode] = useState<"json" | "file">("json");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [busy, startTransition] = useTransition();

  const prompt = useMemo(
    () => buildPrompt({ programName, material, fields, tracks: track ? [track] : tracks }),
    [programName, material, fields, track, tracks],
  );

  function readJson() {
    try {
      setResult(parseExternalPlan(JSON.parse(json), fields, material, track));
    } catch {
      setResult({ ok: false, errors: ["النصّ ليس JSON صالحاً. الصق ما أخرجته الأداة كما هو، بلا شرحٍ قبله ولا بعده."] });
    }
  }

  async function readFile(file: File) {
    setFileError(null);
    setResult(null);
    setFileName(file.name);
    try {
      let table: string[][];
      if (/\.csv$/i.test(file.name)) {
        table = parseCsv(await file.text());
      } else {
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = await readSheet(file);
        table = sheet.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
      }
      table = table.filter((r) => r.some((c) => c.trim() !== ""));
      if (table.length === 0) {
        setFileError("الملف فارغ.");
        return;
      }
      setRows(table);
      setMapping(suggestMapping(table[0]!, fields));
    } catch {
      setFileError("تعذّرت قراءة الملف. احفظه بصيغة xlsx أو csv وأعد المحاولة.");
    }
  }

  /**
   * القالب يُطبَّق بالعناوين — والمكرّر منها بترتيب ظهوره («من» تحت كل حقل).
   * والدور الذي لم يعد يصلح لنوع حقله، أو حقله المحذوف، يصير «تجاهل».
   */
  function applyTemplate(saved: SavedMapping) {
    if (!rows) return;
    const key = (header: string, nth: number) => `${normalizeName(header)}#${nth}`;
    const seen = new Map<string, number>();
    const nthOf = (header: string) => {
      const base = normalizeName(header);
      const nth = seen.get(base) ?? 0;
      seen.set(base, nth + 1);
      return nth;
    };
    const byHeader = new Map(saved.mapping.columns.map((c) => [key(c.header, nthOf(c.header)), c]));
    seen.clear();
    setMapping({
      headerRow: saved.mapping.headerRow,
      columns: rows[0]!.map((header) => {
        const hit = byHeader.get(key(header, nthOf(header)));
        const field = hit?.fieldId ? fields.find((f) => f.id === hit.fieldId) : null;
        const valid =
          hit && (hit.fieldId === null ? hit.role === "ignore" || hit.role === "day" : field && rolesFor(field).includes(hit.role));
        return valid ? { header, role: hit.role, fieldId: hit.fieldId } : { header, role: "ignore", fieldId: null };
      }),
    });
  }

  function readTable() {
    if (!rows || !mapping) return;
    setResult(parseExternalPlan(rowsToExternal(rows, mapping, fields), fields, material, track));
  }

  /** الأيام المقفلة كما هي في المحرّر — وإلا فالملف يغيّر ما أتمّه مشاركون. */
  function apply(draft: PlanDraft) {
    if (lockedThrough > 0) {
      const key = (d: PlanDraft, day: number) =>
        JSON.stringify(
          d.values
            .filter((v) => v.day === day)
            .map((v) => [v.fieldId, v.amount, v.from, v.to, v.value, v.repetition])
            .sort(),
        );
      for (let day = 1; day <= lockedThrough; day++) {
        if (key(draft, day) !== key(current, day)) {
          setResult({
            ok: false,
            errors: [`الملف يغيّر اليوم ${formatNumber(day)}، والأيام 1–${formatNumber(lockedThrough)} أتمّها مشاركون فلا تتغيّر.`],
          });
          return;
        }
      }
    }
    onApply(draft);
    reportAction({ notice: "وُضعت الخطة المستوردة في المحرّر. راجعها ثم احفظ." });
    setResult(null);
  }

  const issues = result?.ok ? planIssues(result.draft, fields, tracks) : [];
  const errors = issues.filter((i) => i.severity === "error");

  return (
    <div className={`${styles.tool} ${styles.importTool}`}>
      <h2 className={styles.toolTitle}>استيراد الخطة من ملف</h2>
      <div className={styles.row} role="group" aria-label="طريقة الاستيراد">
        <Button variant={mode === "json" ? "primary" : "secondary"} onClick={() => setMode("json")}>
          من الذكاء الاصطناعي (JSON)
        </Button>
        <Button variant={mode === "file" ? "primary" : "secondary"} onClick={() => setMode("file")}>
          من ملف Excel أو CSV
        </Button>
      </div>

      {mode === "json" ? (
        <>
          <p className={styles.hint}>
            1. انسخ البرومبت، وضعه مع ملف الخطة — بأي صيغة — في أداة ذكاء اصطناعي. 2. الصق هنا ما أخرجته. 3. اقرأ،
            ثم ضعها في المحرّر.
          </p>
          <div className={styles.row}>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(prompt);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "نُسخ البرومبت" : "انسخ البرومبت"}
            </Button>
          </div>
          <details>
            <summary className={styles.hint}>اعرض البرومبت</summary>
            <Textarea readOnly rows={10} value={prompt} aria-label="البرومبت" dir="rtl" />
          </details>
          <Textarea
            rows={6}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='{ "version": 1, "day_count": 40, "days": [ … ] }'
            aria-label="الخطة بصيغة JSON"
            dir="ltr"
          />
          <div className={styles.row}>
            <Button disabled={json.trim() === ""} onClick={readJson}>
              اقرأ
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.hint}>
            يُقرأ الملف في متصفحك ولا يُرفع. ثم حدّد لكل عمود دوره — والمقترح من عناوينه. وإن عبر نطاقٌ بابين وشُرح ذلك في
            عمود ملاحظات، فطريقه الذكاء الاصطناعي.
          </p>
          <input
            type="file"
            accept=".xlsx,.csv"
            aria-label="ملف الخطة"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          {fileError ? <p className={styles.bad}>{fileError}</p> : null}
          {rows && mapping ? (
            <>
              <p className={styles.hint}>
                «{fileName}» · {formatNumber(rows.length - (mapping.headerRow ? 1 : 0))} صفّاً
              </p>
              <label className={styles.label}>
                <span>
                  <input
                    type="checkbox"
                    checked={mapping.headerRow}
                    onChange={(e) => setMapping({ ...mapping, headerRow: e.target.checked })}
                  />{" "}
                  الصفّ الأول عناوين
                </span>
              </label>
              {mappings.length > 0 ? (
                <div className={styles.row}>
                  <Select
                    className={styles.select}
                    aria-label="قالب استيراد"
                    defaultValue=""
                    onChange={(e) => {
                      const saved = mappings.find((m) => m.id === e.target.value);
                      if (saved) applyTemplate(saved);
                    }}
                  >
                    <option value="" disabled>
                      طبّق قالباً محفوظاً
                    </option>
                    {mappings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                  {mappings.map((m) => (
                    <Button
                      key={m.id}
                      disabled={busy}
                      onClick={() => startTransition(async () => reportAction(await removeImportMapping(programId, m.id)))}
                    >
                      احذف «{m.name}»
                    </Button>
                  ))}
                </div>
              ) : null}
              <div className={styles.mapping}>
                {mapping.columns.map((col, i) => (
                  <label key={i} className={styles.label}>
                    {col.header || `العمود ${formatNumber(i + 1)}`}
                    <Select
                      className={styles.select}
                      value={`${col.role}|${col.fieldId ?? ""}`}
                      onChange={(e) => {
                        const [role, fieldId] = e.target.value.split("|") as [ColumnRole, string];
                        const columns = [...mapping.columns];
                        columns[i] = { ...col, role, fieldId: fieldId || null };
                        setMapping({ ...mapping, columns });
                      }}
                    >
                      <option value="ignore|">تجاهل</option>
                      <option value="day|">اليوم</option>
                      {fields.map((f) => (
                        <optgroup key={f.id} label={f.label}>
                          {rolesFor(f).map((role) => (
                            <option key={role} value={`${role}|${f.id}`}>
                              {f.label} — {ROLE_LABEL[role]}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
              {mappingWarnings(mapping, fields, material).map((w) => (
                <p key={w} className={styles.warn}>
                  {w}
                </p>
              ))}
              <div className={styles.row}>
                <Button onClick={readTable}>اقرأ</Button>
                <Input
                  className={styles.select}
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="اسم القالب"
                  aria-label="اسم القالب"
                />
                <Button
                  disabled={busy || templateName.trim() === ""}
                  onClick={() =>
                    startTransition(async () => reportAction(await saveImportMapping(programId, templateName, mapping)))
                  }
                >
                  احفظ التعيين قالباً
                </Button>
              </div>
            </>
          ) : null}
        </>
      )}

      {result ? (
        result.ok ? (
          <div className={styles.importResult}>
            {result.notes.map((note) => (
              <p key={note} className={styles.hint}>
                {note}
              </p>
            ))}
            {errors.length > 0 ? (
              <ul className={styles.issues}>
                {errors.slice(0, 8).map((e, i) => (
                  <li key={i} className={styles.bad}>
                    {e.message}
                  </li>
                ))}
                {errors.length > 8 ? <li>و{formatNumber(errors.length - 8)} غيرها.</li> : null}
              </ul>
            ) : (
              <p className={styles.ok}>لا ملاحظات تمنع الحفظ.</p>
            )}
            <div className={styles.row}>
              <Button variant="primary" onClick={() => apply(result.draft)}>
                ضعها في المحرّر
              </Button>
            </div>
          </div>
        ) : (
          <ul className={styles.issues}>
            {result.errors.map((e, i) => (
              <li key={i} className={styles.bad}>
                {e}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
