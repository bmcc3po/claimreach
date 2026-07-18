export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import IntakeConsole from "@/components/IntakeConsole";

export default async function ConsolePage() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  let agentName = "";
  if (auth?.user) {
    const { data: me } = await sb.from("app_users").select("full_name").eq("id", auth.user.id).maybeSingle();
    agentName = (me?.full_name ?? "").split(" ")[0] || "";
  }
  return <IntakeConsole agentName={agentName} />;
}
