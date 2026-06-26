export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import SignOut from "@/components/SignOut";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default async function FirmLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/firm-login");

  const { data: me } = await sb.from("app_users")
    .select("role, full_name").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");
  if (me.role !== "firm") redirect("/leads");

  return (
    <div>
      <header className="app-header">
        <Logo height={26} onDark />
        <div className="nav">
          <span className="badge stage">Firm Portal</span>
          <a href="/portal">Docket</a>
          <ThemeToggle />
          <SignOut />
        </div>
      </header>
      <div className="container">{children}</div>
    </div>
  );
}
