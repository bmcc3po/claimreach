import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff, LEAD_CALL_COLS, caseSummaryRows, caseEmailHtml } from "@/lib/mva-call/server";
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";

export const runtime = "edge";

// POST /api/calls/email  { lead_id, to }
// Emails the case summary by hand. No SSN, no PDF: a link back to the file.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const leadId = String(b?.lead_id || "");
  const to = String(b?.to || "").trim().toLowerCase();
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "That email is not valid." }, { status: 400 });

  const { data: lead } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const { data: call } = await sb.from("intake_calls").select("answers").eq("lead_id", leadId)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();

  const origin = new URL(req.url).origin;
  const r = await sendEmail({
    to,
    subject: `Case: ${lead.claimant_name || lead.lead_no || "file"}`,
    html: caseEmailHtml({ title: lead.claimant_name || "Case summary", rows: caseSummaryRows(lead, call?.answers || {}), link: `${origin}/app/${lead.id}`, note: `Sent by ${me.name || "ClaimReach"}.` }),
  });
  if (!r.ok) return NextResponse.json({ error: r.error || "The email did not send." }, { status: 502 });
  await recordAudit({ firm_id: lead.firm_id, lead_id: lead.id, actor: me.id, actor_name: me.name ?? "Staff", category: "contact", description: `Emailed the case summary to ${to}.` });
  return NextResponse.json({ ok: true });
}
