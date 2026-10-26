"use client";

import { createContext, useContext, type ReactNode } from "react";
import { RegisterSteps } from "@/components/shared/register-steps";
import styles from "./layout.module.css";

/**
 * بوابة تسجيل الحملة (ملحق `adr/0045` · قرار الراعي ٢٦ أكتوبر): صفحتا الحساب والدخول، حين وجهتهما
 * تسجيل برنامج الحملة، تُقرآن «بوابة تسجيل المسابقة» لا تسجيلاً عاماً في المنصة — باسمها، ومؤشّر
 * خطوات التسجيل نفسه، وموعد الإغلاق. وتزول بإطفاء مفتاح الحملة كالجلد كله.
 */
export type CampaignGate = {
  /** اسم برنامج الحملة كما في صفحته. */
  name: string;
  /** «يُغلق التسجيل …» والتسجيل مفتوح — وإلا فارغ. */
  closing: string | null;
};

const GateContext = createContext<CampaignGate | null>(null);

export function CampaignGateProvider({ gate, children }: { gate: CampaignGate | null; children: ReactNode }) {
  return <GateContext.Provider value={gate}>{children}</GateContext.Provider>;
}

/** البوابة حين الجلد جلد الحملة — وإلا فارغ فتبقى الصفحة كما هي. */
export const useCampaignGate = (): CampaignGate | null => useContext(GateContext);

/** رأس البوابة: اسم المسابقة · العنوان · الخطوات · الوصف · موعد الإغلاق. */
export function GateIntro({ gate, title, lede }: { gate: CampaignGate; title: string; lede: string }) {
  return (
    <>
      <p className={styles.gateEyebrow}>{gate.name}</p>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.steps}>
        <RegisterSteps done={0} />
      </div>
      <p className={styles.lede}>{lede}</p>
      {gate.closing ? <p className={styles.gateClosing}>{gate.closing}</p> : null}
    </>
  );
}
