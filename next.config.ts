import type { NextConfig } from "next";

// فحص البيئة عند تحميل الإعداد — أي قبل بدء البناء أو التطوير بأي شيء آخر.
// استيراد ثابت لا ديناميكي: next.config يُحمَّل تزامنياً ولا يقبل await علوياً.
import "./lib/env.server";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
