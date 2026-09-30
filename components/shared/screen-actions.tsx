"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** مرساة أفعال الشاشة — تُعرَض في سطر التبويبات، وتُملأ من الصفحة. */
export const SCREEN_ACTIONS_ID = "screen-actions";

/**
 * المرساة تُركَّب في اللقطة نفسها التي تُركَّب فيها الصفحة — فتُقرأ فارغةً في
 * أول تصيير. والاشتراك يجري **بعد** إسناد اللقطة إلى الشجرة، فيُعاد السؤال
 * حينها وتُوجَد. ولولاه لبقي الزرّ غائباً عند الوصول من شاشة خارج التخطيط.
 */
const subscribe = (onStoreChange: () => void) => {
  onStoreChange();
  return () => {};
};
const host = () => document.getElementById(SCREEN_ACTIONS_ID);
const noHost = () => null;

/**
 * **فعل الشاشة في سطر تبويباتها** (`ق-٢٤`).
 *
 * التبويبات في التخطيط والفعل في الصفحة، ولا تُمرَّر خصائص من صفحةٍ إلى
 * تخطيطها — فالفعل يُكتب حيث تعيش حالته، ويُعرَض حيث يُنتظر، ببوّابة.
 *
 * ولا يظهر قبل الترطيب: زرٌّ لا يعمل حتى يُحمَّل السكربت **زرٌّ يَعِد بما لا
 * يفعل** (`ق-٢٠`) — والسطر يحجز ارتفاعه فلا يقفز ما تحته حين يظهر.
 */
export function ScreenActions({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(subscribe, host, noHost);
  return target ? createPortal(children, target) : null;
}
