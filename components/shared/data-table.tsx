"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { formatNumber } from "@/lib/format";
import styles from "./data-table.module.css";
import { EmptyState, ErrorState, LoadingState } from "./states";

/**
 * الجدول الجامع (`platform.md §١١.٤`). لا `<table>` خام في المنصة —
 * و`guard-structure` يفشل عند وجوده خارج هذا الملف.
 *
 * **كل الحالة في `searchParams`**: البحث والفرز والتصفية والصفحة. فالرابط
 * قابل للمشاركة، والعودة بزرّ المتصفح تُرجع ما كان، والتحديث لا يُفقد شيئاً.
 */

export const DEFAULT_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const ICON_SIZE = 14;

export type SortDirection = "asc" | "desc";

export type Column<T> = {
  key: string;
  header: string;
  align?: "start" | "end" | "center";
  /** الفرز ثلاثي: تصاعدي ← تنازلي ← بلا فرز. */
  sortable?: boolean;
  render: (row: T) => ReactNode;
  /** يظهر عنواناً للبطاقة على الجوال. واحد فقط لكل جدول. */
  primary?: boolean;
};

export type ActiveFilter = { key: string; label: string };

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** إجمالي النتائج عبر كل الصفحات — لا عدد الصفحة الحالية. */
  total: number;
  page: number;
  pageSize?: number;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
  searchPlaceholder?: string;
  /** وسوم التصفية النشطة، كلٌّ قابل للإزالة. */
  filters?: ActiveFilter[];
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (next: ReadonlySet<string>) => void;
    /** true = «كل النتائج» لا «كل الصفحة». تمييزٌ يوجبه §١١.٤. */
    allMatching: boolean;
    onSelectAllMatching: (value: boolean) => void;
    /** يُبنى من صلاحيات المستخدم — وما لا صلاحية له **لا يُمرَّر أصلاً**. */
    actions?: ReactNode;
  };
  empty: { title: string; body: string; action?: ReactNode };
};

/**
 * حدّ `Suspense` **هنا لا في الصفحات**.
 *
 * `useSearchParams` يوجب حدّاً عند التصيير المسبق. وضعه في كل صفحة يعني أن
 * أول من ينساه يكسر البناء — وهو خطأ لا يظهر إلا وقت البناء لا وقت الكتابة.
 * وضعه في الجامع يجعله مستحيل النسيان.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  return (
    <Suspense fallback={<LoadingState rows={Math.min(props.pageSize ?? DEFAULT_PAGE_SIZE, 8)} />}>
      <DataTableInner {...props} />
    </Suspense>
  );
}

function DataTableInner<T>({
  columns,
  rows,
  rowKey,
  total,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  status = "ready",
  errorMessage,
  searchPlaceholder = "بحث…",
  filters = [],
  selection,
  empty,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const sortKey = params.get("sort");
  const sortDir = (params.get("dir") as SortDirection | null) ?? null;
  const query = params.get("q") ?? "";

  const [searchDraft, setSearchDraft] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // الرابط هو مصدر الحقيقة. تغييره من الخارج (زرّ الرجوع) يُزامن الحقل.
  // التعديل **أثناء التصيير** لا في تأثير: React يعيد التصيير فوراً قبل الرسم،
  // فلا ومضة ولا تصيير متتالٍ. وهو النمط الموصى به لمواءمة الحالة مع مدخلاتها.
  if (query !== lastQuery) {
    setLastQuery(query);
    setSearchDraft(query);
  }

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // بحث واحد بتأخير 300ms — لا استعلام على كل حرف.
  const onSearch = (value: string) => {
    setSearchDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      push((next) => {
        if (value) next.set("q", value);
        else next.delete("q");
        next.delete("page"); // البحث يُعيد للصفحة الأولى
      });
    }, SEARCH_DEBOUNCE_MS);
  };

  const onSort = (key: string) => {
    push((next) => {
      if (sortKey !== key) {
        next.set("sort", key);
        next.set("dir", "asc");
      } else if (sortDir === "asc") {
        next.set("dir", "desc");
      } else {
        next.delete("sort");
        next.delete("dir");
      }
    });
  };

  const goToPage = (target: number) =>
    push((next) => {
      if (target <= 1) next.delete("page");
      else next.set("page", String(target));
    });

  const removeFilter = (key: string) =>
    push((next) => {
      next.delete(key);
      next.delete("page");
    });

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const firstOrdinal = (page - 1) * pageSize;

  const pageIds = useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selection?.selected.has(id));

  const primaryColumn = columns.find((c) => c.primary) ?? columns[0];
  const secondaryColumns = columns.filter((c) => c !== primaryColumn);

  const togglePage = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const id of pageIds) {
      if (allOnPageSelected) next.delete(id);
      else next.add(id);
    }
    selection.onChange(next);
    if (allOnPageSelected) selection.onSelectAllMatching(false);
  };

  const toggleRow = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
    selection.onSelectAllMatching(false);
  };

  const toolbar = (
    <div className={styles.toolbar}>
      <input
        type="search"
        value={searchDraft}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className={styles.search}
      />
      {filters.length > 0 ? (
        <div className={styles.chips}>
          {filters.map((f) => (
            <span key={f.key} className={styles.chip}>
              {f.label}
              <button
                type="button"
                onClick={() => removeFilter(f.key)}
                aria-label={`إزالة تصفية ${f.label}`}
                className={styles.chipRemove}
              >
                <X size={ICON_SIZE} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (status === "loading") {
    return (
      <div className={styles.root}>
        {toolbar}
        <LoadingState rows={Math.min(pageSize, 8)} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.root}>
        {toolbar}
        <ErrorState body={errorMessage ?? "حدث خطأ أثناء جلب البيانات."} />
      </div>
    );
  }

  if (rows.length === 0) {
    // الفارق الذي يوجبه §١١.٥: لا بيانات أصلاً، أم أخفتها التصفية؟
    const filtered = Boolean(query) || filters.length > 0;
    return (
      <div className={styles.root}>
        {toolbar}
        {filtered ? (
          <EmptyState
            kind="no-results"
            title="لا نتائج مطابقة"
            body="لا صفّ يطابق البحث أو التصفية الحالية. جرّب توسيعها أو مسحها."
            action={
              <button
                type="button"
                className={styles.selectAll}
                onClick={() =>
                  push((next) => {
                    next.delete("q");
                    for (const f of filters) next.delete(f.key);
                    next.delete("page");
                  })
                }
              >
                مسح البحث والتصفية
              </button>
            }
          />
        ) : (
          <EmptyState kind="no-data" title={empty.title} body={empty.body} action={empty.action} />
        )}
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {toolbar}

      {selection && selection.selected.size > 0 ? (
        <div className={styles.selectionBar}>
          <span className={styles.selectionCount}>
            {selection.allMatching
              ? `محدَّد: كل النتائج (${formatNumber(total)})`
              : `محدَّد: ${formatNumber(selection.selected.size)} في هذه الصفحة`}
          </span>
          {!selection.allMatching && allOnPageSelected && total > rows.length ? (
            <button
              type="button"
              className={styles.selectAll}
              onClick={() => selection.onSelectAllMatching(true)}
            >
              حدِّد كل النتائج ({formatNumber(total)})
            </button>
          ) : null}
          {selection.allMatching ? (
            <button
              type="button"
              className={styles.selectAll}
              onClick={() => {
                selection.onSelectAllMatching(false);
                selection.onChange(new Set());
              }}
            >
              إلغاء التحديد
            </button>
          ) : null}
          {selection.actions ? (
            <div className={styles.selectionActions}>{selection.actions}</div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {selection ? (
                <th scope="col" className={`${styles.th} ${styles.checkboxCell}`}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={togglePage}
                    aria-label="تحديد صفوف هذه الصفحة"
                  />
                </th>
              ) : null}
              <th scope="col" className={`${styles.th} ${styles.ordinal}`}>
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`${styles.th} ${alignClass(col.align)}`}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className={`${styles.sortButton} ${sortKey === col.key ? styles.sortActive : ""}`}
                    >
                      {col.header}
                      <SortIcon active={sortKey === col.key} direction={sortDir} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const id = rowKey(row);
              return (
                <tr key={id} className={styles.tr}>
                  {selection ? (
                    <td className={`${styles.td} ${styles.checkboxCell}`}>
                      <input
                        type="checkbox"
                        checked={selection.selected.has(id)}
                        onChange={() => toggleRow(id)}
                        aria-label="تحديد الصفّ"
                      />
                    </td>
                  ) : null}
                  {/* الترتيب متسلسل **عبر الصفحات** لا يبدأ من ١ في كل صفحة */}
                  <td className={`${styles.td} ${styles.ordinal}`}>
                    {formatNumber(firstOrdinal + i + 1)}
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className={`${styles.td} ${alignClass(col.align)}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.cards}>
        {rows.map((row, i) => (
          <article key={rowKey(row)} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardOrdinal}>{formatNumber(firstOrdinal + i + 1)}</span>
              <span>{primaryColumn?.render(row)}</span>
            </div>
            {secondaryColumns.map((col) => (
              <div key={col.key} className={styles.cardRow}>
                <span className={styles.cardLabel}>{col.header}</span>
                <span>{col.render(row)}</span>
              </div>
            ))}
          </article>
        ))}
      </div>

      <div className={styles.pagination}>
        <span className={styles.pageInfo}>
          {formatNumber(firstOrdinal + 1)}–{formatNumber(firstOrdinal + rows.length)} من{" "}
          {formatNumber(total)}
        </span>
        <div className={styles.pageButtons}>
          <button
            type="button"
            className={styles.pageButton}
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            السابق
          </button>
          <button
            type="button"
            className={styles.pageButton}
            disabled={page >= lastPage}
            onClick={() => goToPage(page + 1)}
          >
            التالي
          </button>
        </div>
      </div>
    </div>
  );
}

function alignClass(align: Column<unknown>["align"]): string {
  if (align === "end") return styles.alignEnd!;
  if (align === "center") return styles.alignCenter!;
  return styles.alignStart!;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection | null }) {
  if (!active || direction === null) return <ArrowUpDown size={ICON_SIZE} aria-hidden />;
  return direction === "asc" ? (
    <ArrowUp size={ICON_SIZE} aria-hidden />
  ) : (
    <ArrowDown size={ICON_SIZE} aria-hidden />
  );
}
