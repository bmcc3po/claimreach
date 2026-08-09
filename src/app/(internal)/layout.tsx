import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import SignOut from "@/components/SignOut";
import ThemeToggle from "@/components/ThemeToggle";
import SideNav from "@/components/SideNav";
import NotifyBell from "@/components/NotifyBell";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await sb.from("app_users")
    .select("role, full_name, firm_id").eq("id", user.id).maybeSingle();
  if (!me || me.role === "firm") redirect("/portal");

  return (
    <SideNav
      active=""
      userName={me.full_name ?? "Staff"}
      role={me.role}
      topRight={<><NotifyBell /><ThemeToggle /><SignOut /></>}
    >
      {children}
    </SideNav>
  );
}
