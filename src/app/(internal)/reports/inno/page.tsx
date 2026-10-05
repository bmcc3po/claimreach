export const runtime = "edge";
export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { authUser } from "@/lib/auth-user";
import { supabaseServer } from "@/lib/supabase-server";
import { loadSignatureReport, reportPages } from "@/lib/signature-report-loader";
import SignatureReport from "@/components/SignatureReport";

export default async function InnoReportPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me, error } = await sb.from("app_users").select("role,active").eq("id", user.id).maybeSingle();
  if (error || !me || me.active !== true || me.role !== "owner") redirect("/dashboard");
  const campaigns = await reportPages(() => sb.from("campaigns").select("id,name,firm_id,firm_email")
    .eq("name", "INNO MVA").eq("case_type", "mva"));
  const { campaign: requested } = await searchParams;
  const campaign = requested ? campaigns.find(c => c.id === requested) : campaigns.length === 1 ? campaigns[0] : null;
  if (!campaign) return <section className="cl-panel" style={{ padding: 24 }}><h1 className="cl-h1">INNO MVA signatures</h1>
    <p>{campaigns.length ? "Choose the firm's campaign." : "No INNO MVA campaign is available."}</p>
    {campaigns.map(c => <p key={c.id}><a href={"/reports/inno?campaign=" + c.id}>{c.name} · {c.firm_email || "Recipient not configured"}</a></p>)}</section>;
  const { data: firm, error: firmError } = await sb.from("firms").select("name").eq("id", campaign.firm_id).single();
  if (firmError) throw new Error("Could not load the report's firm. Refresh to try again.");
  const rows = await loadSignatureReport(sb, campaign);
  return <SignatureReport rows={rows} firm={firm.name} generatedAt={new Date().toISOString()} />;
}

