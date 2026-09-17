import type { Metadata } from "next";
import { PRIVACY } from "@/lib/legal/terms";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "سياسة الخصوصية — منصة سنن" };

export default function PrivacyPage() {
  return <LegalPage title="سياسة الخصوصية" items={PRIVACY} />;
}
