import type { ReactNode } from "react";

export const metadata = {
  title: "منصة مسابقة سنن",
  description: "منصة إدارة رحلة المشارك في برامج جمعية سنن التعليمية",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
