export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import ClaimIntake from "@/components/ClaimIntake";

export default async function IntakeEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: lead } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  // Resolve (or create) the active claim for this lead.
  let { data: claims } = await sb.from("claims").select("*").eq("lead_id", id).order("created_at");
  if (!claims || claims.length === 0) {
    const { data: created } = await sb.from("claims").insert({
      firm_id: lead.firm_id, lead_id: lead.id,
      claim_type: lead.case_type ?? "motel_trafficking", is_this_file: true,
    }).select("*").single();
    claims = created ? [created] : [];
  }
  const claim = claims![0];

  const { data: props } = await sb.from("claim_properties")
    .select("*").eq("claim_id", claim.id).order("sequence_order");

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Intake · {lead.lead_no}</h2>
        {lead.firm_ref_no && <span className="badge stage">TMP {lead.firm_ref_no}</span>}
        <div className="spacer" />
        <a className="btn ghost" href={`/leads/${lead.id}`}>Open full file →</a>
      </div>
      <ClaimIntake
        claimId={claim.id}
        firmId={lead.firm_id}
        initialAnswers={claim.answers ?? {}}
        initialProperties={props ?? []}
        claimantName={lead.claimant_name ?? undefined}
        claimantEmail={lead.email ?? undefined}
      />
    </div>
  );
}
