import { ErrorState } from "@/components/shared/states";
import { createClient } from "@/lib/db/server";
import { authorizeRequest } from "@/lib/permissions/server";
import { HOME_FEATURED_KEY, parseHomeFeatured } from "@/lib/settings/home-featured";
import { getShowcase } from "@/lib/settings/showcase-server";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const authz = await authorizeRequest({ permission: "settings.read" });
  if (!authz.ok) {
    return <ErrorState title="غير مصرَّح" body={authz.message} />;
  }

  const canWrite = (await authorizeRequest({ permission: "settings.write" })).ok;
  const db = await createClient();
  const [{ slides }, featuredResult, programsResult] = await Promise.all([
    getShowcase(),
    // القيمة المخزّنة لا ما يراه الزائر: المسؤول يرى اختياره ولو كان البرنامج مسوّدة.
    db
      .from("settings")
      .select("value")
      .eq("key", HOME_FEATURED_KEY)
      .is("scope_program_id", null)
      .is("deleted_at", null)
      .maybeSingle(),
    db.from("programs").select("slug, name, status").is("deleted_at", null).order("sort_order"),
  ]);

  return (
    <SettingsView
      slides={slides}
      canWrite={canWrite}
      featuredSlug={parseHomeFeatured(featuredResult.data?.value).slug}
      programs={(programsResult.data ?? []).map((p) => ({
        slug: p.slug,
        name: p.name,
        published: p.status === "published",
      }))}
    />
  );
}
