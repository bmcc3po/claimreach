export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { resolveFirmHome } from "@/lib/firm-home";

export default async function Home() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("role").eq("id", user.id).maybeSingle();
  redirect((await resolveFirmHome(sb, { role: me?.role, email: user.email })) ?? "/firm-login");
}
