import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export default async function Home() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("role").eq("id", user.id).maybeSingle();
  redirect(me?.role === "firm" ? "/portal" : "/leads");
}
