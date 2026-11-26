import { useEffect, type RefObject } from "react";

/**
 * الشريط العائم أسفل الشاشة (`adr/0063` · `adr/0064`) يعوم فوق المحتوى فلا يدفعه، ولا يحجبه كذلك:
 * ارتفاعه في `--install-bar` فيرتفع فوقه كل لاصقٍ في الأسفل (زرّ اليوم · التنبيه)، ويُفسَح بقدره آخر
 * الصفحة ليُبلَغ ما تحته. ويُزال الاثنان باختفائه.
 */
export function useFloatingBar(bar: RefObject<HTMLElement | null>, shown: boolean) {
  useEffect(() => {
    const node = bar.current;
    if (!shown || !node) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--install-bar", `calc(${Math.ceil(node.getBoundingClientRect().height)}px + var(--space-2))`);
    };
    sync();
    const watch = new ResizeObserver(sync);
    watch.observe(node);
    document.body.style.setProperty("padding-block-end", "var(--install-bar)");
    return () => {
      watch.disconnect();
      root.style.removeProperty("--install-bar");
      document.body.style.removeProperty("padding-block-end");
    };
  }, [bar, shown]);
}
