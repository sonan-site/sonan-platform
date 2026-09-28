import "server-only";
import { createClient } from "@/lib/db/server";
import { attentionItems, type AttentionItem, type AttentionRow } from "./attention";
import type { DutyRow } from "./duties";

/**
 * جلب اللوحة — ثلاثة نداءات، كلٌّ صفٌّ أو صفوفٌ جاهزة (الهجرة ٠٤٦).
 *
 * **ولا ترشيح بالصلاحية هنا:** الدوال الثلاث تُرشّح داخل القاعدة، فما يصل
 * الشاشة هو ما يملكه العارض. وأي ترشيحٍ ثانٍ في TypeScript يوهم بحمايةٍ
 * موضعها القاعدة.
 */

export type DashboardCounts = {
  programs: number;
  published: number;
  participants: number;
  roleHolders: number;
};

export async function staffAttention(): Promise<AttentionItem[]> {
  const db = await createClient();
  const { data, error } = await db.rpc("fn_attention_items");
  if (error || !data) return [];

  const rows: AttentionRow[] = data.map((r) => ({
    kind: r.kind,
    programId: r.program_id,
    programName: r.program_name,
    amount: r.amount,
  }));
  return attentionItems(rows);
}

export async function dashboardCounts(): Promise<DashboardCounts> {
  const db = await createClient();
  const { data, error } = await db.rpc("fn_dashboard_counts");
  const row = data?.[0];
  if (error || !row) return { programs: 0, published: 0, participants: 0, roleHolders: 0 };
  return {
    programs: row.programs,
    published: row.published,
    participants: row.participants,
    roleHolders: row.role_holders,
  };
}

export async function myDuties(): Promise<DutyRow[]> {
  const db = await createClient();
  const { data, error } = await db.rpc("fn_my_duties");
  if (error || !data) return [];

  return data.map((r) => ({
    participantId: r.participant_id,
    programName: r.program_name,
    programStatus: r.program_status,
    trackName: r.track_name,
    followsPlan: r.follows_plan,
    workDays: r.work_days,
    submittedDays: r.submitted_days,
    completeDays: r.complete_days,
    currentDay: r.current_day,
    lastSubmittedAt: r.last_submitted_at,
    proposedTrack: r.proposed_track,
    contact: r.contact,
  }));
}
