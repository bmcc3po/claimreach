export const runtime = "edge";
import CrissiHub from "@/components/CrissiHub";
import { supabaseServer } from "@/lib/supabase-server";
export default async function CrissiPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  const isManager = me?.role === "owner" || me?.role === "admin";
  return <CrissiHub isManager={isManager} />;
}
