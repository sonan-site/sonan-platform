import { ErrorState } from "@/components/shared/states";
import { authorizeRequest } from "@/lib/permissions/server";
import { getShowcase } from "@/lib/settings/showcase-server";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const authz = await authorizeRequest({ permission: "settings.read" });
  if (!authz.ok) {
    return <ErrorState title="غير مصرَّح" body={authz.message} />;
  }

  const canWrite = (await authorizeRequest({ permission: "settings.write" })).ok;
  const { slides } = await getShowcase();

  return <SettingsView slides={slides} canWrite={canWrite} />;
}
