import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, parseDob, dobForForm } from "@/lib/mva-call/server";
import { agreementChoice } from "@/lib/mva-call/agreement-choice";
import { packetsFor } from "@/lib/mva-call/esign";
import { stampPreview } from "@/lib/mva-call/preview";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { getIdentityMetadata } from "@/lib/mva-call/identity";

export const runtime = "edge";

// GET /api/calls/esign/preview?lead_id=&signer=&injured=&city=&today=&doi=
// The exact agreement she will get, with what the call filled in stamped where
// DocuSeal puts it, so the agent can check it before it goes out. Marked
// PREVIEW on every page. Nothing is sent and nothing is saved.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (k: string) => String(url.searchParams.get(k) || "").trim().slice(0, 120);
  const leadId = q("lead_id");
  const signer = q("signer");
  const injured = q("injured") || signer;
  const today = /^\d{2}\/\d{2}\/\d{4}$/.test(q("today")) ? q("today") : "";
  const doi = /^\d{2}\/\d{2}\/\d{4}$/.test(q("doi")) ? q("doi") : "";

  const context = await resolveSigningMatter(sb, leadId, { claimId: q("claim_id") || null });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.campaignId) return NextResponse.json({ error: "Choose this matter's campaign before previewing its agreement." }, { status: 409 });
  const { data: campaign, error: campaignError } = await sb.from("campaigns").select("id, firm_id").eq("id", context.campaignId).maybeSingle();
  if (campaignError) return NextResponse.json({ error: "The campaign could not be read. Try the preview again." }, { status: 503 });
  if (!campaign || (campaign.firm_id && campaign.firm_id !== context.lead.firm_id)) return NextResponse.json({ error: "This matter's campaign is not available for its firm." }, { status: 409 });
  const templates = await sb.from("esign_templates").select("key").eq("campaign_id", context.campaignId).eq("provider", "docuseal");
  if (templates.error) return NextResponse.json({ error: "Could not read this campaign's agreement setup." }, { status: 503 });
  const choice = agreementChoice(q("city"), q("nv_variant"), (templates.data ?? []).map((t: any) => String(t.key)));
  if (!choice.available || !choice.key) return NextResponse.json({ error: choice.error }, { status: !choice.key || choice.variantError ? 400 : 409 });
  if (q("template_key") && q("template_key") !== choice.key) return NextResponse.json({ error: "Choose a contract permitted for the state where the wreck happened." }, { status: 400 });
  const { data: firm, error: firmError } = await sb.from("firms").select("slug").eq("id", context.lead.firm_id).maybeSingle();
  if (firmError) return NextResponse.json({ error: "The firm could not be read. Try the preview again." }, { status: 500 });
  const packets = packetsFor(firm?.slug, context.matter.claim.claim_type ?? context.lead.case_type);
  if (!packets) return NextResponse.json({ error: "This campaign has no agreement set up to preview." }, { status: 404 });
  const key = choice.key;
  const packet = (packets as any)[key];
  if (!packet) return NextResponse.json({ error: "This campaign's selected agreement has no preview packet." }, { status: 404 });

  // Show early DOB and saved-SSN presence without decrypting identity into a
  // browser preview or accepting identity in URL/query parameters.
  const identity = await getIdentityMetadata(supabaseAdmin(), { leadId: context.lead.id, claimId: context.matter.claim.id, firmId: context.lead.firm_id });
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });
  const dob = parseDob(context.lead.dob);

  const src = await fetch(new URL(packet.path, url.origin));
  if (!src.ok) return NextResponse.json({ error: `Could not load the agreement file (${src.status}).` }, { status: 502 });
  const out = await stampPreview(new Uint8Array(await src.arrayBuffer()), packet, key, { signer, injured, today, doi, dob: dob ? dobForForm(dob) : undefined, ssnSaved: identity.identity.saved });
  return new Response(out as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="agreement-preview-${key.toLowerCase()}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
