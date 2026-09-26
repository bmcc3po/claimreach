export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { LEAD_CALL_COLS, caseSummaryRows } from "@/lib/mva-call/server";
import PrintActions from "@/components/calls/PrintActions";

// The case on one page: print it from the phone (Share, Print) or email it.
// No SSN on this page, ever.
export default async function PrintCase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: lead } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", id).maybeSingle();
  if (!lead) notFound();
  const { data: call } = await sb.from("intake_calls").select("answers, disposition, reason, agent_name, updated_at")
    .eq("lead_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const { data: claim } = await sb.from("claims").select("status").eq("lead_id", id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  const rows = caseSummaryRows(lead, call?.answers || {});
  if (claim?.status) rows.splice(2, 0, { k: "Status", v: String(claim.status).replace(/_/g, " ") });
  if (call?.agent_name) rows.push({ k: "Intake by", v: call.agent_name });

  return (
    <div className="cc-print">
      <a className="cc-home-link cc-noprint" href={`/app/${id}`}>Back to the call</a>
      <h1>{lead.claimant_name || "Case summary"}</h1>
      <div className="cc-cue" style={{ marginTop: 0 }}>{lead.campaign || ""}{lead.lead_no ? `  ${lead.lead_no}` : ""}</div>
      <table><tbody>{rows.map((r) => <tr key={r.k}><td>{r.k}</td><td>{r.v}</td></tr>)}</tbody></table>
      <PrintActions leadId={id} />
    </div>
  );
}
