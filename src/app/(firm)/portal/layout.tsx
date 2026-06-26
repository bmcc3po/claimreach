export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import SignOut from "@/components/SignOut";

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
        <div className="brand">ClaimReach <small>· Firm Portal</small></div>
        <div className="row">
          <a href="/portal">Docket</a>
          <SignOut />
        </div>
      </header>
      <div className="container">{children}</div>
    </div>
  );
}
