export const runtime = "edge";
// ARCHIVED: the old "Take a call" firm picker and forms. The menu item now
// opens the App (/app?new=1). Kept here so nothing is lost; not linked anywhere.
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import IntakeConsole from "@/components/IntakeConsole";

export default async function ConsolePage() {
  const sb = await supabaseServer();
  const { data: auth } = await authUser();
  let agentName = "";
  if (auth?.user) {
    const { data: me } = await sb.from("app_users").select("full_name").eq("id", auth.user.id).maybeSingle();
    agentName = (me?.full_name ?? "").split(" ")[0] || "";
  }
  return <IntakeConsole agentName={agentName} />;
}
