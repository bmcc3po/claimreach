export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import ProfileEditor from "@/components/ProfileEditor";

export default async function FirmProfile() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("*").eq("id", user!.id).maybeSingle();
  return <ProfileEditor me={me} email={user!.email ?? ""} />;
}
