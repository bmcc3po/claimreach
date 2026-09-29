import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, parseDob, dobForForm } from "@/lib/mva-call/server";
import { completeIntake } from "@/lib/docuseal";
import { syncSubmission, ssnForForm } from "@/lib/mva-call/esign";
import { recordAudit } from "@/lib/audit";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided, getMatterEmergency, emergencySupersedes } from "@/lib/mva-call/signing-matter";
import { sameName } from "@/lib/linked-files";

export const runtime = "edge";

// POST /api/calls/esign/complete  { lead_id, dob, ssn }
// Intake is the second signer. DOB and SSN go onto the HIPAA pages, the date
// goes under the firm's signature, and the agreement completes. We keep the DOB and the last 4 only;
// the full SSN lives on the signed PDF in private storage, never in a column.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  const dob = parseDob(b?.dob);
  const ssn = ssnForForm(b?.ssn);
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  const context = await resolveSigningMatter(sb, leadId, { claimId: b?.claim_id });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const isMva = context.matter.claim.claim_type === "mva";
  if ((isMva || b?.dob) && !dob) return NextResponse.json({ error: "Date of birth should look like 04/12/1991." }, { status: 400 });
  if ((isMva || b?.ssn) && !ssn) return NextResponse.json({ error: "SSN should be all 9 digits or the last 4." }, { status: 400 });
  const selected = await getMatterAgreement(sb, context.lead, context.matter, b?.agreement_id);
  if (!selected.ok) return NextResponse.json({ error: selected.error }, { status: selected.status });
  const row = selected.row;
  if (!row) return NextResponse.json({ error: "No agreement was sent on this matter." }, { status: 404 });
  if (agreementIsVoided(row)) return NextResponse.json({ error: "This agreement was voided. Send its replacement before completing office details." }, { status: 409 });
  const emergency = await getMatterEmergency(sb, context.lead, context.matter);
  if (!emergency.ok) return NextResponse.json({ error: emergency.error }, { status: emergency.status });
  if (emergencySupersedes(row, emergency.row)) return NextResponse.json({ error: "A newer emergency packet supersedes this agreement. Prepare the DocuSeal re-sign first; the original stays in history." }, { status: 409 });
  const agreementPerson = row.injured_name || row.signer_name;
  if (agreementPerson && context.lead.claimant_name && !sameName(agreementPerson, context.lead.claimant_name)) return NextResponse.json({ error: `This agreement still names ${agreementPerson}, but the file now names ${context.lead.claimant_name}. Review it, then void and resend the corrected agreement before office completion.` }, { status: 409 });

  // Some firms require the full 9-digit SSN on the agreement (per-campaign
  // switch, Brett Sep 27). Enforced here so the rule holds from every screen.
  const digits = String(b?.ssn || "").replace(/\D/g, "");
  if (digits.length === 4) {
    if (context.campaignId) {
      const { data: campRow, error: campErr } = await sb.from("campaigns").select("ssn_require_full").eq("id", context.campaignId).maybeSingle();
      // The rule being UNREADABLE is not the same as the rule being off: fail
      // closed and let the agent retry (Astra review, Sep 27).
      if (campErr || !campRow) return NextResponse.json({ error: "Could not check this campaign's SSN rule. Try again in a moment." }, { status: 503 });
      if (campRow?.ssn_require_full === true) {
        return NextResponse.json({ error: "This firm requires the full 9-digit Social Security number. The last 4 is not enough on this campaign." }, { status: 400 });
      }
    }
  }

  if (row.status === "completed") return NextResponse.json({ ok: true, already: true });
  if (row.status !== "signed") return NextResponse.json({ error: "The PNC has not signed yet. This unlocks the moment they do." }, { status: 409 });
  if (!row.intake_submitter_id) return NextResponse.json({ error: "This agreement has no second signer to complete." }, { status: 409 });

  // Step 2 also dates the firm's line, on the office clock.
  const firmDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date());
  const res = await completeIntake(row.intake_submitter_id, { ...(dob ? { "Patient DOB": dobForForm(dob) } : {}), ...(ssn ? { "Patient SSN": ssn.printed } : {}), "Firm Date": firmDate });
  if (!res.ok) {
    const msg = res.status === 401 || res.status === 403
      ? "DocuSeal refused our key, so the DOB and SSN did not go on the agreement. Tell your admin: DOCUSEAL_API_KEY in Cloudflare is wrong or expired."
      : `DocuSeal did not take the DOB and SSN (${res.error}). Nothing changed. Press it again; if it fails twice, tell your admin.`;
    await recordAudit({ firm_id: row.firm_id, lead_id: leadId, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
      description: `Completing the agreement failed: ${msg}`.slice(0, 500), meta: { submission_id: row.submission_id, status: res.status ?? null, docuseal: res.error } });
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (dob || ssn) {
    const { error } = await sb.from("leads").update({ ...(dob ? { dob } : {}), ...(ssn ? { ssn_last4: ssn.last4 } : {}) }).eq("id", leadId);
    if (error) return NextResponse.json({ error: `The agreement is complete, but the file did not update: ${error.message}` }, { status: 500 });
  }

  await recordAudit({
    firm_id: row.firm_id, lead_id: leadId, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
    description: "Completed the agreement's office signer fields.", meta: { submission_id: row.submission_id },
  });
  const status = await syncSubmission(supabaseAdmin(), row, { actorName: me.name ?? "Agent", origin: new URL(req.url).origin });
  return NextResponse.json({ ok: true, status });
}
