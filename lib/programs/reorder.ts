import "server-only";
import type { createClient } from "@/lib/db/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** الجداول التي تُرتَّب صفوفها بيد المستخدم — ولكلٍّ `sort_order` بلا قيد فريد. */
type Ordered = "page_blocks" | "help_entries" | "tracks";

/**
 * إعادة ترقيمٍ صريحة لا تبديل.
 *
 * **والعلّة مثبتة لا محتملة:** `sort_order` افتراضه صفر ولا قيد فريد عليه، فكل
 * صفٍّ لم يُنشأ من الشاشة يحمل صفراً — وتبديل صفرين لا يحرّك شيئاً. وهو ما
 * تتجنّبه `moveTemplateField` صراحةً منذ بنائها.
 *
 * وليست حكراً على شاشة: المسارات وعناصر الصفحة والأسئلة الشائعة تُرتَّب كلها،
 * فالقاعدة واحدة في موضع واحد.
 */
export async function renumber<T extends { id: string; sort_order: number }>(
  db: Db,
  table: Ordered,
  rows: T[],
  id: string,
  direction: "up" | "down",
): Promise<boolean> {
  const index = rows.findIndex((r) => r.id === id);
  // **الغائب ليس «عند الحافة»:** صفٌّ حُذف من شاشةٍ أخرى كان يُبلَّغ نجاحاً صامتاً.
  if (index === -1) return false;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return true;

  const order = [...rows];
  order[index] = order[target]!;
  order[target] = rows[index]!;

  for (const [position, row] of order.entries()) {
    if (row.sort_order === position) continue;
    const { error } = await db.from(table).update({ sort_order: position }).eq("id", row.id);
    if (error) return false;
  }
  return true;
}
