import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import { readiness, type ReadinessInput, type ReadinessItem } from "./readiness";

/**
 * جاهزية البرنامج من القاعدة — صفٌّ واحد (`fn_program_readiness`، الهجرة ٠٤١).
 *
 * مُغلّفة بـ`cache`: التخطيط يقرؤها لشريط المعالج، والصفحة تقرؤها للوحة
 * الجاهزية، فتُنفَّذ مرة واحدة للطلب.
 */
export const programReadiness = cache(
  async (programId: string): Promise<{ input: ReadinessInput; items: ReadinessItem[]; participants: number } | null> => {
    const db = await createClient();
    const { data, error } = await db.rpc("fn_program_readiness", { p_program_id: programId });
    const row = data?.[0];
    if (error || !row) return null;

    const input: ReadinessInput = {
      tracks: row.tracks,
      tracksWithParts: row.tracks_with_parts,
      contentUnits: row.content_units,
      taskFields: row.task_fields,
      templatesWithFields: row.templates_with_fields,
      tracksWithPlanDays: row.tracks_with_plan_days,
      publicBlocks: row.public_blocks,
      published: row.published ?? false,
    };
    return { input, items: readiness(input), participants: row.participants };
  },
);
