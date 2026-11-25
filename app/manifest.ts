import type { MetadataRoute } from "next";

/**
 * تعريف المنصة تطبيقاً يُثبَّت على الجهاز (`adr/0063`). يكفي وحده لأن يعرض Chrome
 * وEdge التثبيت، ويُقرأ في iOS عند «إضافة إلى الشاشة الرئيسية».
 *
 * - **الاسم ثابت** «منصة سنن» لا «مسابقة سنن»: الأيقونة تبقى على الجهاز بعد انقضاء المسابقة.
 * - **البداية `/dashboard`**: من فتح الأيقونة بلا جلسة تردّه البوابة إلى الدخول ثم إليها.
 * - **اللون** خلفية الشعار نفسها (`app/icon.png`)، فشاشة الافتتاح والشريط من لون الأيقونة.
 *   والتعريف لا يقرأ رموز CSS، فاللون مكتوبٌ هنا نصاً.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "منصة سنن",
    short_name: "سنن",
    description: "منصة إدارة رحلة المشارك في برامج جمعية سنن التعليمية",
    lang: "ar",
    dir: "rtl",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#072c3a",
    theme_color: "#072c3a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
