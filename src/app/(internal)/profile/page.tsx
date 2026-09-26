export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import ProfileEditor from "@/components/ProfileEditor";
export default async function StaffProfile() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  const { data: me } = await sb.from("app_users").select("*").eq("id", user!.id).maybeSingle();
  return <ProfileEditor me={me} email={user!.email ?? ""} />;
}
