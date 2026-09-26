import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import SideNav from "@/components/SideNav";
import NotifyBell from "@/components/NotifyBell";
import { resolveFirmHome } from "@/lib/firm-home";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  // First sign-in: the starter password has to be replaced before anything else.
  if ((user.app_metadata as any)?.must_change_password) redirect("/set-password");

  const { data: me } = await sb.from("app_users")
    .select("role, full_name, firm_id").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");
  if (me.role === "firm") {
    redirect((await resolveFirmHome(sb, { role: me.role, email: user.email })) ?? "/portal");
  }

  return (
    <SideNav
      userName={me.full_name ?? "Staff"}
      role={me.role}
      topRight={<NotifyBell />}
    >
      {children}
    </SideNav>
  );
}
