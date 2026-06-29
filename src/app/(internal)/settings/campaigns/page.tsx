export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import CampaignsManager from "@/components/CampaignsManager";

export default async function CampaignsSettingsPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) redirect("/settings");

  const { data: campaigns } = await sb.from("campaigns").select("*, firms(name)").order("name");
  const { data: firms } = await sb.from("firms").select("id, name").order("name");
  const { data: retainerTemplates } = await sb.from("retainer_templates").select("id, name").order("name");

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Campaigns</h2>
      <p className="muted" style={{ marginTop: 0, maxWidth: 720 }}>Each campaign is one firm running one case type. Add lead picks a campaign and inherits the firm, type, intake form, retainer, and billing.</p>
      <CampaignsManager initial={campaigns ?? []} firms={firms ?? []} retainerTemplates={retainerTemplates ?? []} />
    </div>
  );
}
