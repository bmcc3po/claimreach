import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requirePerm } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { STANDARD_FIELDS, STD_LEAD_COLS, STD_CLAIM_COLS, standardFromRows } from "@/lib/standard-fields";

export const runtime = "edge";

// GET /api/export/standard[?campaign_id=][&since=YYYY-MM-DD]
// One CSV row per matter, every standard field, in the standard order with
// the standard names as the header (Brett, Sep 28: the same names every
// webhook carries, so an import on the other side is mapped once).
// Staff with the Export leads permission; read through the caller's session.
function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function chunked<T>(ids: string[], size: number, run: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await run(ids.slice(i, i + size))));
  return out;
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const gate = await requirePerm(sb, "leads.export");
  if (!gate.ok) return new Response(gate.error, { status: gate.status });
  if (!isInternalRole(gate.user.role)) return new Response("forbidden", { status: 403 });

  const url = new URL(req.url);
  const campaignId = (url.searchParams.get("campaign_id") || "").replace(/[^0-9a-f-]/gi, "");
  const since = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("since") || "") ? url.searchParams.get("since")! : "";

  let lq = sb.from("leads").select(STD_LEAD_COLS).is("archived_at", null);
  if (campaignId) lq = lq.eq("campaign_id", campaignId);
  if (since) lq = lq.gte("created_at", since);
  const { data: leads, error } = await lq.order("created_at", { ascending: false }).limit(5000);
  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 });
  const leadIds = (leads ?? []).map((l: any) => l.id);

  const [claims, subs, calls, statusRes, firmRes] = await Promise.all([
    chunked(leadIds, 150, async (p) => (await sb.from("claims").select(STD_CLAIM_COLS).in("lead_id", p)).data ?? []),
    chunked(leadIds, 150, async (p) => (await sb.from("esign_submissions").select("lead_id, claim_id, campaign_id, template_key, status, sent_at, signed_at, completed_at, sent_by, created_at")
      .in("lead_id", p).is("pax_index", null).neq("status", "voided").order("created_at", { ascending: false })).data ?? []),
    chunked(leadIds, 150, async (p) => (await sb.from("intake_calls").select("lead_id, claim_id, disposition, reason, callback_at, ended_at, agent_name")
      .in("lead_id", p).eq("status", "ended").order("ended_at", { ascending: false, nullsFirst: false })).data ?? []),
    sb.from("statuses").select("key, label"),
    sb.from("firms").select("id, name"),
  ]);
  const staffIds = Array.from(new Set((subs as any[]).map((s) => s.sent_by).filter(Boolean)));
  const staff = staffIds.length ? ((await sb.from("app_users").select("id, full_name").in("id", staffIds)).data ?? []) : [];
  const nameOf = new Map((staff as any[]).map((u) => [u.id, u.full_name]));
  const labelOf = new Map((statusRes.data ?? []).map((s: any) => [s.key, s.label]));
  const firmOf = new Map((firmRes.data ?? []).map((f: any) => [f.id, f.name]));

  const claimsByLead = new Map<string, any[]>();
  for (const c of claims as any[]) (claimsByLead.get(c.lead_id) ?? claimsByLead.set(c.lead_id, []).get(c.lead_id)!).push(c);
  // Newest first already; the first match per matter wins.
  const pick = (rows: any[], leadId: string, claim: any, single: boolean) =>
    rows.find((r) => r.lead_id === leadId && (claim ? (r.claim_id === claim.id || (single && !r.claim_id)) : true)) ?? null;

  const lines = [STANDARD_FIELDS.map((f) => f.key).join(",")];
  for (const lead of leads ?? []) {
    const list = claimsByLead.get((lead as any).id) ?? [];
    const matters = list.length ? list : [null];
    for (const claim of matters) {
      const single = list.length <= 1;
      const sub = pick(subs as any[], (lead as any).id, claim, single);
      const rec = standardFromRows({
        lead, claim, firmName: firmOf.get((lead as any).firm_id) ?? null,
        statusLabel: claim ? labelOf.get(claim.status) ?? null : null,
        submission: sub, signingAgent: sub?.sent_by ? nameOf.get(sub.sent_by) ?? null : null,
        lastCall: pick(calls as any[], (lead as any).id, claim, single),
      });
      lines.push(STANDARD_FIELDS.map((f) => csvEscape(rec[f.key])).join(","));
    }
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="claimreach-standard-${stamp}.csv"` },
  });
}
