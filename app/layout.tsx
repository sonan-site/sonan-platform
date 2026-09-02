import type { ReactNode } from "react";
import "@/config/tokens.css";

export const metadata = {
  title: "منصة سنن",
  description: "منصة إدارة رحلة المشارك في برامج جمعية سنن التعليمية",
};

/**
 * يُطبّق السمة المحفوظة **قبل الرسم**. بدونه يرى من اختار الداكنة ومضةً بيضاء
 * في كل تحميل، لأن React لا يعمل قبل أول رسم.
 */
const APPLY_THEME = `try{var t=localStorage.getItem("sonan.theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
