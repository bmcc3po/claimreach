export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import SignOut from "@/components/SignOut";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await sb.from("app_users")
    .select("role, full_name, firm_id").eq("id", user.id).maybeSingle();
  if (!me || me.role === "firm") redirect("/portal");

  return (
    <div>
      <header className="app-header">
        <div className="brand">
          ClaimReach <small>· {me.full_name ?? "Staff"}</small>
        </div>
        <div className="row">
          <a href="/leads">Leads</a>
          <a href="/intake">Add lead</a>
          <SignOut />
        </div>
      </header>
      <div className="container">{children}</div>
    </div>
  );
}
