import type { Metadata } from "next";
import { TERMS } from "@/lib/legal/terms";
import { LegalPage } from "../legal";

export const metadata: Metadata = { title: "شروط الاستخدام — منصة سنن" };

export default function TermsPage() {
  return <LegalPage title="شروط الاستخدام" items={TERMS} />;
}
