export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import SignOut from "@/components/SignOut";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

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
        <Logo height={30} />
        <div className="nav">
          <a href="/leads">Leads</a>
          <a href="/intake">Add lead</a>
          <span className="muted" style={{ marginLeft: 6 }}>{me.full_name ?? "Staff"}</span>
          <ThemeToggle />
          <SignOut />
        </div>
      </header>
      <div className="container">{children}</div>
    </div>
  );
}
