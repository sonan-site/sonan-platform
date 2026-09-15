import { redirect } from "next/navigation";
import { ErrorState } from "@/components/shared/states";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { registrationStates } from "@/lib/programs/registration-server";
import { AccountView, type AvailableProgram, type Participation } from "./account-view";

/**
 * «حسابي» — ما يراه المستخدم عند الدخول بتعريف `CONTEXT.md`: حسابه، والبرامج
 * المتاحة، والبرامج المسجَّل فيها فعلاً.
 */
export default async function AccountPage() {
  const session = await getSession();
  if (session.status !== "active") redirect("/sign-in");

  const db = await createClient();
  const [{ data: auth }, profileResult, participationsResult, programsResult] = await Promise.all([
    db.auth.getUser(),
    db.from("profiles").select("full_name, phone").eq("user_id", session.userId).maybeSingle(),
    db
      .from("participants")
      .select("id, status, program_id, programs!inner(name, slug), tracks(name)")
      .eq("user_id", session.userId)
      .is("deleted_at", null)
      .order("joined_at", { ascending: false }),
    db
      .from("programs")
      .select("id, name, summary, slug")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (profileResult.error || !profileResult.data || participationsResult.error) {
    return <ErrorState body="تعذّر جلب حسابك. أعد المحاولة." />;
  }

  const participations: Participation[] = (participationsResult.data ?? []).map((p) => {
    const program = p.programs as unknown as { name: string; slug: string };
    const track = p.tracks as unknown as { name: string } | null;
    return {
      id: p.id,
      programName: program.name,
      trackName: track?.name ?? null,
      status: p.status,
    };
  });

  // المتاحة: منشورةٌ مفتوحٌ تسجيلها، ولم يسجّل فيها.
  const joined = new Set((participationsResult.data ?? []).map((p) => p.program_id));
  const candidates = (programsResult.data ?? []).filter((p) => !joined.has(p.id));
  const states = await registrationStates(db, candidates.map((p) => p.id));
  const available: AvailableProgram[] = candidates
    .filter((p) => states.get(p.id) === "open")
    .map((p) => ({ id: p.id, name: p.name, summary: p.summary, slug: p.slug }));

  const providers = new Set((auth.user?.identities ?? []).map((i) => i.provider));

  return (
    <AccountView
      email={session.email}
      fullName={profileResult.data.full_name}
      phone={profileResult.data.phone}
      hasPassword={providers.has("email")}
      hasGoogle={providers.has("google")}
      isStaff={session.permissions.size > 0}
      participations={participations}
      available={available}
    />
  );
}
