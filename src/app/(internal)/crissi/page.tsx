export const runtime = "edge";
import { redirect } from "next/navigation";
import CrissiHub from "@/components/CrissiHub";
import { supabaseServer } from "@/lib/supabase-server";

// Crissi is the self-serve training hub. Any signed-in user can work through
// it; only owners and admins see the training records chapter.
export default async function CrissiPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("role").eq("id", user.id).maybeSingle();
  const isManager = me?.role === "owner" || me?.role === "admin";
  return <CrissiHub isManager={isManager} />;
}
