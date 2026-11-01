import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { createServiceRoleClient } from "@/lib/db/service-role";

export type PurgeResult = {
  removed: number;
  failed: number;
  /** تعذّرت قراءة الطابور، أو بقي فيه ما يزيد على دفعةٍ واحدة — فالعدد غير معلوم. */
  incomplete: boolean;
};

/** حدّ `fn_storage_purge_pending` في الدفعة — وواجهة التخزين تحذف حتى ١٠٠٠ مسار في النداء. */
const BATCH = 1000;

/**
 * يحذف ملفات الممحوّين من طابور `storage_purge_queue` (adr/0054 د٤).
 *
 * SQL لا يحذف ملفاً (`storage.protect_delete`)، فالمحو يدوّن والخادم يحذف بواجهة التخزين.
 * **عميل الخدمة هنا وحده** في «صوتك»: الحذف لا سياسة له عمداً. والصلاحية تفحصها دالّتا الطابور
 * بعميل المستخدم قبل الحذف وبعده (`users.write`) — فلا يحذف من لا يملكها شيئاً.
 *
 * يُفرَّغ الطابور كلّه لا ملفات الممحوّ الأخير: ما فشل سابقاً يُستدرَك، وما دوّنه مجدوِلٌ يُحذف.
 */
export async function drainStoragePurge(db: SupabaseClient<Database>): Promise<PurgeResult> {
  const { data, error } = await db.rpc("fn_storage_purge_pending");
  if (error) return { removed: 0, failed: 0, incomplete: true };
  if (!data?.length) return { removed: 0, failed: 0, incomplete: false };

  const byBucket = new Map<string, string[]>();
  for (const { bucket, path } of data) byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);

  const admin = createServiceRoleClient();
  let removed = 0;
  let failed = 0;
  for (const [bucket, paths] of byBucket) {
    // الملفّ الغائب ليس فشلاً: واجهة التخزين تتجاهله، ويُشطب من الطابور كالمحذوف.
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) {
      failed += paths.length;
      continue;
    }
    const { error: doneError } = await db.rpc("fn_storage_purge_done", { p_bucket: bucket, p_paths: paths });
    if (doneError) failed += paths.length;
    else removed += paths.length;
  }
  return { removed, failed, incomplete: data.length >= BATCH };
}
