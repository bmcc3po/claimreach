import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { resolveMatter } from "@/lib/matter";
import { loadLawRulerProvenance } from "@/lib/lawruler-recovery";
import { importedOriginals, verifiedImportedPdfs } from "@/lib/imported-packet";
import { loadIntakeBundle, hasIntakeQuestions } from "@/lib/intake-render";
import { deliverLeadToFirm } from "@/lib/firm-delivery";
import { setClaimStatusForLeads } from "@/lib/claim-status";

export const runtime = "edge";
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "")) ? String(value) : "";

async function context(leadId: string, claimId: string) {
  const sb = await supabaseServer();
  const user = await gateUser(sb);
  if (!user) return { error: "unauthorized", status: 401 } as const;
  if (!["agent", "owner", "admin", "manager", "qa"].includes(user.role)) return { error: "forbidden", status: 403 } as const;
  const { data: lead, error: leadError } = await sb.from("leads").select("id,firm_id,archived_at,campaign_id").eq("id", leadId).maybeSingle();
  if (leadError || !lead) return { error: "File unavailable.", status: 404 } as const;
  const admin = supabaseAdmin();
  const matter = await resolveMatter(sb, leadId, { claimId, campaignId: lead.campaign_id, authoritativeDb: admin });
  if (!matter.ok) return { error: matter.error, status: matter.status } as const;
  if (!lead.firm_id || matter.claim.firm_id !== lead.firm_id || matter.claim.campaign !== "INNO MVA" || matter.claim.claim_type !== "mva") return { error: "This is not the selected INNO MVA matter.", status: 409 } as const;
  const provenance = await loadLawRulerProvenance(admin, leadId, claimId);
  if (!provenance?.sourceSignedReported) return { error: "LawRuler has not reported a signed packet for this matter.", status: 409 } as const;
  return { sb, admin, user, lead, matter, provenance };
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams;
  const leadId = uuid(query.get("lead_id"));
  const claimId = uuid(query.get("claim_id"));
  if (!leadId || !claimId) return NextResponse.json({ error: "Select a file and matter." }, { status: 400 });
  try {
    const c = await context(leadId, claimId);
    if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
    const originals = await importedOriginals(c.admin, c.lead.firm_id, leadId, claimId);
    const documents = await Promise.all(originals.map(async (row) => {
      const { data, error } = await c.admin.storage.from("case-docs").createSignedUrl(row.path, 300);
      return { id: row.id, name: row.name, kind: row.kind, url: error ? null : data?.signedUrl || null };
    }));
    return NextResponse.json({ status: c.matter.claim.status, documents, source_signed_at: c.provenance.sourceSignedAt });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "Could not inspect imported originals." }, { status: 409 }); }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const leadId = uuid(body.lead_id), claimId = uuid(body.claim_id);
  if (!leadId || !claimId) return NextResponse.json({ error: "Select a file and matter." }, { status: 400 });
  if (["confirmed_intake", "confirmed_signature", "confirmed_hipaa_hitech", "confirmed_criteria", "confirmed_send"].some((key) => body[key] !== true)) {
    return NextResponse.json({ error: "Open both PDFs and confirm the intake, signatures, HIPAA/HITECH pages, criteria, and recipient before sending." }, { status: 400 });
  }
  if (typeof body.expected_to !== "string" || !body.expected_to.trim() || !Array.isArray(body.expected_cc)) {
    return NextResponse.json({ error: "Refresh and confirm the firm's current recipient before sending." }, { status: 400 });
  }
  const c = await context(leadId, claimId);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  if (!["agent", "owner", "admin"].includes(c.user.role) || !c.user.can("claims.status")) return NextResponse.json({ error: "You cannot send this matter to the firm." }, { status: 403 });
  if (c.lead.archived_at) return NextResponse.json({ error: "Restore this archived file before sending." }, { status: 409 });
  if (!["external_signed_review", "signed_approved"].includes(String(c.matter.claim.status || ""))) return NextResponse.json({ error: "This imported matter is not awaiting review or delivery. Refresh its status." }, { status: 409 });
  try {
    const originals = await importedOriginals(c.admin, c.lead.firm_id, leadId, claimId);
    await verifiedImportedPdfs(c.admin, originals);
    const bundle = await loadIntakeBundle(c.admin, leadId, claimId);
    if (!bundle || !hasIntakeQuestions(bundle)) return NextResponse.json({ error: "The intake PDF has no questions. Finish the intake before sending." }, { status: 409 });

    // Store the human review and exact source hashes before changing a status.
    // This is an attestation of inspected originals, never a fabricated signature.
    const documentHashes = Object.fromEntries(originals.map((row) => [row.id, row.hash]));
    const audit = await c.admin.from("lead_activity").insert({ firm_id: c.lead.firm_id, lead_id: leadId,
      kind: "system", body: "Agent inspected the imported LawRuler original packet for firm handoff.",
      meta: { source: "claimreach", event: "imported_packet_review", claim_id: claimId, document_hashes: documentHashes,
        confirmed_intake: true, confirmed_signature: true, confirmed_hipaa_hitech: true, confirmed_criteria: true,
        reviewer_id: c.user.id, reviewer_name: c.user.name,
        source_signed_at: c.provenance.sourceSignedAt } });
    if (audit.error) throw new Error(`The packet review did not save: ${audit.error.message}`);
    const review = await c.admin.from("qa_reviews").insert({ lead_id: leadId, claim_id: claimId, firm_id: c.lead.firm_id,
      reviewer: c.user.id, reviewer_name: c.user.name || "Staff", g_qa_pass: "green", g_esign: "green", g_criteria: "green",
      decision: "approve", qa_note: "Imported LawRuler originals independently inspected; intake and packet pages confirmed before firm handoff." });
    if (review.error) throw new Error(`QA approval did not save: ${review.error.message}`);
    if (c.matter.claim.status === "external_signed_review") {
      const changed = await setClaimStatusForLeads({ leadIds: [leadId], claimIds: [claimId], status: "signed_approved",
        expectedStatus: "external_signed_review", actorId: c.user.id, actorName: c.user.name || "Staff",
        historical: true, suppressAutoDelivery: true });
      if (!changed.ok) throw new Error(`The imported signed status did not finish updating: ${changed.error}. No email was sent.`);
    }
    const result = await deliverLeadToFirm({ leadId, claimId, triggeredBy: "manual", actorName: c.user.name || "Staff",
      expectedTo: body.expected_to,
      expectedCc: body.expected_cc,
      includeOwner: true, additionalRecipients: Array.isArray(body.additional_recipients) ? body.additional_recipients.map(String) : [],
      importedPacket: true });
    if (!result.ok || result.skipped) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result);
  } catch (e: any) { return NextResponse.json({ error: e?.message || "Imported packet review failed. No email was sent." }, { status: 409 }); }
}
