import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/config/tokens.css";
import { getHomeFeatured } from "@/lib/settings/home-featured-server";

/**
 * اسم الموقع في التبويب: «مسابقة سنن» ما دامت المسابقة واجهة المنصة (قرار الراعي ٢٧ أكتوبر ·
 * `adr/0045`)، و«منصة سنن» بعد إطفاء مفتاحها — يزول بزوالها كالجلد كله. والأيقونة `app/icon.png`
 * (رمز شعار الجمعية) ثابتةٌ في الحالين.
 */
export async function generateMetadata(): Promise<Metadata> {
  const name = (await getHomeFeatured()) ? "مسابقة سنن" : "منصة سنن";
  return {
    title: { default: name, template: `%s · ${name}` },
    description: "منصة إدارة رحلة المشارك في برامج جمعية سنن التعليمية",
  };
}

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
