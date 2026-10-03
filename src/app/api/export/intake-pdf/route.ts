import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { resolveMatter } from "@/lib/matter";
import { loadIntakeBundle, buildIntakePdf, hasIntakeQuestions } from "@/lib/intake-render";
export const runtime = "edge";

// Exactly the displayed matter, through the caller's RLS session. The same
// renderer is used by delivery, including the compiled MVA call's nested data.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const p = new URL(req.url).searchParams;
  const user = await gateUser(sb);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const canReview = user.role === "agent" && user.can("intake.fill") && p.get("preview") === "1" && !!p.get("claim_id");
  if (!isInternalRole(user.role) || (!user.can("leads.export") && !canReview)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const leadId = p.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const { data: lead, error } = await sb.from("leads").select("id, campaign_id").eq("id", leadId).maybeSingle();
  if (error) return NextResponse.json({ error: `Could not read the file: ${error.message}` }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const m = await resolveMatter(sb, leadId, { claimId: p.get("claim_id"), campaignId: lead.campaign_id });
  if (!m.ok) return NextResponse.json({ error: m.error }, { status: m.status });
  try {
    const bundle = await loadIntakeBundle(sb, leadId, m.claim.id);
    if (!bundle || !hasIntakeQuestions(bundle)) return NextResponse.json({ error: "This matter's intake is not available yet." }, { status: 409 });
    const bytes = await buildIntakePdf(bundle);
    const safeName = String(bundle.lead.claimant_name || bundle.lead.lead_no || "intake").replace(/[^a-z0-9]+/gi, "_");
    return new Response(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${p.get("preview") === "1" ? "inline" : "attachment"}; filename="${safeName}_intake.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `The intake PDF could not be built: ${e?.message || "read failed"}. Nothing was downloaded.` }, { status: 500 });
  }
}
