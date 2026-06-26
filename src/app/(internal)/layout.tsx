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

  const initials = (me.full_name ?? "U").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div>
      <header className="appbar">
        <Logo height={38} onDark />
        <nav className="anav">
          <a href="/leads">Leads</a>
          <a href="/intake">Add lead</a>
        </nav>
        <div className="spacer" />
        <div className="roles">
          <button className="active">Agent</button>
          <button>QA</button>
          <button>BMC</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="aavatar">{initials}</div>
          <span style={{ fontSize: 13, color: "#c9d6e6" }}>{me.full_name ?? "Staff"}</span>
        </div>
        <ThemeToggle />
        <SignOut />
      </header>
      <div className="container">{children}</div>
    </div>
  );
}
