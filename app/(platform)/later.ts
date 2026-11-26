import { now } from "@/lib/format";

const LATER_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * «ليس الآن» لشريطٍ عائم (`adr/0063` · `adr/0064`): يُخفيه سبعة أيام في هذا المتصفح. واللحظة في الذاكرة
 * أيضاً — فإن حُجب التخزين بقي مخفياً حتى يُعاد تحميل الصفحة.
 */
export function laterStore(key: string) {
  let memLater = 0;
  return {
    postponed(): boolean {
      let at = memLater;
      try {
        at = Number(window.localStorage.getItem(key)) || memLater;
      } catch {
        // التخزين محجوب: الذاكرة وحدها.
      }
      return at > 0 && now().getTime() - at < LATER_DAYS * DAY_MS;
    },
    postpone() {
      memLater = now().getTime();
      try {
        window.localStorage.setItem(key, String(memLater));
      } catch {
        // التخزين محجوب: الذاكرة وحدها.
      }
    },
  };
}
