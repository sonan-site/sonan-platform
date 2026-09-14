import type { NextConfig } from "next";

// فحص البيئة عند تحميل الإعداد — أي قبل بدء البناء أو التطوير بأي شيء آخر.
// استيراد ثابت لا ديناميكي: next.config يُحمَّل تزامنياً ولا يقبل await علوياً.
import "./lib/env.server";

/**
 * ترويسات الأمان على كل استجابة.
 *
 * **`frame-ancestors 'none'` أهمّها:** أزرار الإدارة فعلٌ بنقرة واحدة (نشر،
 * إيقاف، سحب دور)، فصفحةٌ تضمّ المنصة في إطار خفيّ تستدرج المدير إلى نقرها.
 * ولا سياسة محتوى كاملة هنا: `script-src` صارم يحتاج رمزاً لكل طلب يكسر
 * التخزين، وقراره منفصل.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
