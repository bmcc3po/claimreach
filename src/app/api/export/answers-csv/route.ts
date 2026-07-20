import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// GET /api/export/answers-csv?campaign_id=...  (or ?case_type=...)
// One row per claimant, columns = every intake question. For firm handoff.

const SKIP_KINDS = ["section", "script", "gate"];

// Choice fields store a code ("le30"); the firm needs the words the caller
// heard ("Within the last 30 days"). Console-generated fields carry the map.
function labelFor(field: any, v: any): any {
  if (v === undefined || v === null) return v;
  const choices = Array.isArray(field?.choices) ? field.choices : null;
  if (!choices) return v;
  if (Array.isArray(v)) return v.map((x) => choices.find((c: any) => c.value === x)?.label ?? x);
  return choices.find((c: any) => c.value === v)?.label ?? v;
}
function esc(v: any): string {
  const s = v === undefined || v === null ? "" : Array.isArray(v) ? v.join("; ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  let caseType = (url.searchParams.get("case_type") || "").toLowerCase();
  let campaignName = "";
  const admin = supabaseAdmin();

  if (campaignId) {
    const { data: c } = await admin.from("campaigns").select("name, case_type, intake_template").eq("id", campaignId).maybeSingle();
    if (c) { caseType = (c.intake_template || c.case_type || caseType).toLowerCase(); campaignName = c.name; }
  }
  if (!caseType) return NextResponse.json({ error: "campaign_id or case_type required" }, { status: 400 });

  // The questionnaire defines the columns.
  let fields: any[] = [];
  try { const { resolveIntakeFields } = await import("@/lib/forms"); fields = await resolveIntakeFields(sb, caseType); } catch {}
  if (!fields || fields.length === 0) { try { const { intakeForType } = await import("@/lib/questionnaire"); fields = intakeForType(caseType) as any[]; } catch {} }
  const cols = fields.filter((f) => !SKIP_KINDS.includes(f.kind));

  // The leads for this campaign (or case type).
  let q = admin.from("leads").select("id, lead_no, claimant_name, campaign, campaign_id, case_type, created_at, phone, email, mail_addr1, mail_city, mail_state, mail_zip");
  q = campaignId ? q.eq("campaign_id", campaignId) : q.eq("case_type", caseType);
  const { data: leads } = await q.order("created_at");
  const leadRows = leads ?? [];

  // Answers per lead.
  const ids = leadRows.map((l) => l.id);
  const answersByLead: Record<string, any> = {};
  if (ids.length) {
    const { data: claims } = await admin.from("claims").select("lead_id, answers").in("lead_id", ids);
    for (const c of claims ?? []) answersByLead[c.lead_id] = c.answers ?? {};
  }

  // Build CSV. Fixed lead columns first, then one column per question.
  const header = ["Lead #", "Claimant", "Campaign", "Created", ...cols.map((f) => f.label || f.id)];
  const lines = [header.map(esc).join(",")];
  for (const l of leadRows) {
    const a = answersByLead[l.id] || {};
    const row = [
      l.lead_no, l.claimant_name, l.campaign || campaignName, l.created_at ? new Date(l.created_at).toLocaleDateString() : "",
      ...cols.map((f) => labelFor(f, f.scope === "lead" ? (l as any)[f.id] : a[f.id])),
    ];
    lines.push(row.map(esc).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const nameSafe = (campaignName || caseType).replace(/[^a-z0-9]+/gi, "_");
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nameSafe}_intakes_${stamp}.csv"`,
    },
  });
}
