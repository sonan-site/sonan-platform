"use server";

import { z } from "@/lib/validation/z";
import { askQuestion, flagAnswer, type AskResult } from "@/lib/ask/ask-server";
import { MAX_QUESTION } from "@/lib/ask/answer";

/**
 * أفعال المساعد (adr/0057) — للزائر والطالب معاً، فلا تحقّق هوية: الحدّ والمفتاح والحارس في
 * `askQuestion` نفسها، والمدخل يُفحص هنا قبلها.
 */

const turn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1500) });
const askInput = z.object({
  slug: z.string().min(1).max(100),
  question: z.string().trim().min(1).max(MAX_QUESTION),
  history: z.array(turn).max(12),
});
const flagInput = z.object({
  slug: z.string().min(1).max(100),
  question: z.string().trim().min(1).max(MAX_QUESTION),
  answer: z.string().trim().min(1).max(2000),
});

export async function askAction(input: z.input<typeof askInput>): Promise<AskResult> {
  const parsed = askInput.safeParse(input);
  if (!parsed.success) return { kind: "refer", refer: "none" };
  return askQuestion(parsed.data.slug, parsed.data.question, parsed.data.history);
}

export async function flagAction(input: z.input<typeof flagInput>): Promise<boolean> {
  const parsed = flagInput.safeParse(input);
  if (!parsed.success) return false;
  return flagAnswer(parsed.data.slug, parsed.data.question, parsed.data.answer);
}
