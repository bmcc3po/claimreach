import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff, parseDob, dobForForm } from "@/lib/mva-call/server";
import { completeIntake } from "@/lib/docuseal";
import { syncSubmission, ssnForForm } from "@/lib/mva-call/esign";
import { recordAudit } from "@/lib/audit";

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
  if (!dob) return NextResponse.json({ error: "Date of birth should look like 04/12/1991." }, { status: 400 });
  if (!ssn) return NextResponse.json({ error: "SSN should be all 9 digits or the last 4." }, { status: 400 });

  const { data: row } = await sb.from("esign_submissions").select("*")
    .eq("lead_id", leadId).is("pax_index", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return NextResponse.json({ error: "No agreement was sent on this file." }, { status: 404 });
  if (row.status === "completed") return NextResponse.json({ ok: true, already: true });
  if (row.status !== "signed") return NextResponse.json({ error: "She has not signed yet. This unlocks the moment she does." }, { status: 409 });
  if (!row.intake_submitter_id) return NextResponse.json({ error: "This agreement has no second signer to complete." }, { status: 409 });

  // Step 2 also dates the firm's line, on the office clock.
  const firmDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date());
  const res = await completeIntake(row.intake_submitter_id, { "Patient DOB": dobForForm(dob), "Patient SSN": ssn.printed, "Firm Date": firmDate });
  if (!res.ok) return NextResponse.json({ error: `DocuSeal did not take it: ${res.error}` }, { status: 502 });

  const { error } = await sb.from("leads").update({ dob, ssn_last4: ssn.last4 }).eq("id", leadId);
  if (error) return NextResponse.json({ error: `The agreement is complete, but the file did not update: ${error.message}` }, { status: 500 });

  await recordAudit({
    firm_id: row.firm_id, lead_id: leadId, actor: me.id, actor_name: me.name ?? "Agent", category: "retainer",
    description: "Completed the agreement as second signer (DOB and SSN added).", meta: { submission_id: row.submission_id },
  });
  const status = await syncSubmission(supabaseAdmin(), row, { actorName: me.name ?? "Agent", origin: new URL(req.url).origin });
  return NextResponse.json({ ok: true, status });
}
