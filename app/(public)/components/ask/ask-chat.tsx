"use client";

import Link from "next/link";
import { Flag, Send } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Turn } from "@/lib/ask/answer";
import type { AskResult } from "@/lib/ask/ask-server";
import campaign from "../campaign/campaign.module.css";
import styles from "./ask.module.css";
import { askAction, flagAction } from "./actions";

/**
 * المحادثة (adr/0057) — في صفحة المساعد وفي نافذته. الإحالة نصّها هنا لا عند النموذج: رقم التواصل
 * من المنشور، ورابط «صوتك» للطالب الداخل وحده — والخادم يحوّل إحالة الزائر التقنية إلى شؤون الطلاب.
 */

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; result: AskResult; question: string; flag: "idle" | "sent" | "failed" };

const EXAMPLES = [
  "ابني عمره 12، أي مسار يناسبه؟",
  "هل الحفظ حضوري؟",
  "متى الاختبار المرحلي؟",
  "هل التسجيل برسوم؟",
];

function replyText(r: AskResult, contact: string): string {
  switch (r.kind) {
    case "answer":
      return r.text;
    case "limited":
      return "أسئلة كثيرة متتالية. أعد المحاولة بعد قليل.";
    case "unavailable":
      return `المساعد غير متاح الآن. لأي استفسار تواصل مع ${contact}.`;
    case "refer":
      if (r.refer === "voices") return "يبدو أنها مشكلة تقنية في المنصة. أرسلها من «صوتك» ليعالجها الفريق.";
      if (r.refer === "none") return "أجيب عن أسئلة المسابقة وحدها.";
      return `لم أجد جواب هذا في المعلومات المنشورة. تواصل مع ${contact}.`;
  }
}

export function AskChat({
  slug,
  contact,
  panel = false,
}: {
  slug: string;
  contact: string;
  /** في النافذة: السجلّ يتمرّر وحده والنموذج ثابتٌ أسفلها. */
  panel?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const thread = useRef<HTMLDivElement>(null);

  // الجديد أسفل السجلّ — فيُنزَل إليه.
  useEffect(() => {
    const el = thread.current;
    if (panel && el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, panel]);

  function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    // السجلّ ما أُجيب وحده: الإحالة نصٌّ من الواجهة لا من النموذج.
    const history = messages.flatMap((m): Turn[] =>
      m.role === "user" ? [{ role: "user", text: m.text }] : m.result.kind === "answer" ? [{ role: "assistant", text: m.result.text }] : [],
    );
    setMessages((ms) => [...ms, { id: ++seq.current, role: "user", text: q }]);
    setDraft("");
    start(async () => {
      let result: AskResult;
      try {
        result = await askAction({ slug, question: q, history });
      } catch {
        result = { kind: "unavailable" };
      }
      setMessages((ms) => [...ms, { id: ++seq.current, role: "assistant", result, question: q, flag: "idle" }]);
    });
  }

  function flag(id: number) {
    const m = messages.find((x) => x.id === id);
    if (!m || m.role !== "assistant" || m.result.kind !== "answer") return;
    const answer = m.result.text;
    start(async () => {
      const ok = await flagAction({ slug, question: m.question, answer }).catch(() => false);
      setMessages((ms) => ms.map((x) => (x.id === id && x.role === "assistant" ? { ...x, flag: ok ? "sent" : "failed" } : x)));
    });
  }

  return (
    <div className={`${styles.chat} ${panel ? styles.chatPanel : ""}`}>
      <div ref={thread} className={styles.thread} aria-live="polite">
        {messages.length === 0 ? (
          <div className={styles.examples}>
            {EXAMPLES.map((q) => (
              <button key={q} type="button" className={styles.example} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className={`${styles.msg} ${styles.user}`}>
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`${styles.msg} ${styles.bot} ${m.result.kind === "answer" ? "" : styles.refer}`}>
              <p>{replyText(m.result, contact)}</p>
              {m.result.kind === "refer" && m.result.refer === "voices" ? (
                <Link className={styles.voices} href="/voices">
                  افتح «صوتك»
                </Link>
              ) : null}
              {m.result.kind === "answer" ? (
                m.flag === "idle" ? (
                  <button type="button" className={styles.flag} onClick={() => flag(m.id)} disabled={pending}>
                    <Flag size={14} aria-hidden /> الإجابة غير مفيدة
                  </button>
                ) : (
                  <span className={styles.flagged}>
                    {m.flag === "sent" ? "وصلت ملاحظتك، شكراً لك." : "تعذّر إرسال الملاحظة."}
                  </span>
                )
              ) : null}
            </div>
          ),
        )}
        {pending ? <p className={`${styles.msg} ${styles.bot} ${styles.wait}`}>لحظة…</p> : null}
      </div>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          className={styles.input}
          aria-label="سؤالك"
          rows={1}
          maxLength={500}
          placeholder="اكتب سؤالك هنا…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button type="submit" className={`${campaign.btn} ${campaign.gold} ${styles.send}`} disabled={pending || !draft.trim()}>
          <Send size={16} aria-hidden /> إرسال
        </button>
      </form>

      <p className={styles.note}>المساعد في مرحلة التجربة وقد يخطئ. المرجع الرسمي هو صفحة المسابقة و{contact}.</p>
    </div>
  );
}
