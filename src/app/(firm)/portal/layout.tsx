export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import SignOut from "@/components/SignOut";
import ThemeToggle from "@/components/ThemeToggle";
import SideNav from "@/components/SideNav";

export default async function FirmLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/firm-login");

  const { data: me } = await sb.from("app_users")
    .select("role, full_name, firm_id").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");
  if (me.role !== "firm") redirect("/leads");

  const { data: firm } = await sb.from("firms").select("name").eq("id", me.firm_id).maybeSingle();

  return (
    <SideNav
      active=""
      variant="firm"
      userName={me.full_name ?? "Firm"}
      role={firm?.name ?? "Firm"}
      topRight={<><ThemeToggle /><SignOut /></>}
    >
      {children}
    </SideNav>
  );
}
