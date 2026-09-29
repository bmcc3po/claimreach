export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { packetsFor } from "@/lib/mva-call/esign";
import { docusealConfigured } from "@/lib/docuseal";
import { DISPO_LABEL, type DispoCode } from "@/lib/mva-call/dispo";
import { APP_CASE_TYPES } from "@/lib/mva-call/links";
import { acquisitionClaimForRow, isAcquisitionEligible, loadMvaAcquisitionHolds, type MvaAcquisitionSignal } from "@/lib/lawruler-mva-status";
import type { StatusDef } from "@/lib/statuses";
import Link from "next/link";
import CallsHome, { type HomeData, type HomeRow } from "@/components/calls/CallsHome";

// App home: what to work right now. Open files, call backs that are due,
// agreements out for signature, texts that came in, and what already got done.
// Every list loads side by side; nothing waits on a list it does not need.
export default async function AppHomePage() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");

  const days = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const [meRes, campRes, firmRes, cbRes, waitRes, doneRes, textRes] = await Promise.all([
    sb.from("app_users").select("id, role, full_name").eq("id", user.id).maybeSingle(),
    sb.from("campaigns").select("id, name, firm_id, case_type").in("case_type", APP_CASE_TYPES).eq("active", true).order("name"),
    sb.from("firms").select("id, slug, name"),
    // Call backs, soonest first.
    sb.from("intake_calls").select("lead_id, claim_id, campaign_id, callback_at, agent_name, reason, created_at, leads(id, firm_id, archived_at, claimant_name, phone, claims(id, lead_id, firm_id, campaign_id, claim_type, status))")
      .eq("disposition", "callback").not("callback_at", "is", null).gte("callback_at", days(3))
      .order("callback_at", { ascending: true }).limit(100),
    // Out for signature in the last three days.
    sb.from("esign_submissions").select("lead_id, status, signer_name, sent_at, via, leads(claimant_name, phone)")
      .in("status", ["sent", "opened"]).gte("sent_at", days(3)).order("sent_at", { ascending: false }).limit(100),
    // Done: calls that ended in the last two days.
    sb.from("intake_calls").select("lead_id, disposition, reason, agent_name, ended_at, leads(claimant_name, phone)")
      .eq("status", "ended").gte("ended_at", days(2)).order("ended_at", { ascending: false }).limit(100),
    // Texts that came in over the last three days.
    sb.from("communications").select("lead_id, phone_raw, phone_norm, body, occurred_at, leads(claimant_name, phone, campaign_id)")
      .eq("channel", "sms").eq("direction", "inbound").gte("occurred_at", days(3))
      .order("occurred_at", { ascending: false }).limit(150),
  ]);
  const me = meRes.data;
  if (!me) redirect("/firm-login");
  const notes: string[] = [];
  const campaigns = campRes.data ?? [];
  const campIds = campaigns.map((c: any) => c.id);
  const firmById = new Map((firmRes.data ?? []).map((f: any) => [f.id, f]));
  const cbLeadIds = Array.from(new Set((cbRes.data ?? []).map((r: any) => r.lead_id)));

  // Second wave: open files, the latest call on each call back, e-sign setup.
  const setupCamps = ["owner", "admin"].includes(me.role)
    ? campaigns.filter((c: any) => packetsFor((firmById.get(c.firm_id) as any)?.slug, c.case_type)) : [];
  const [leadRes, latestRes, tplRes, statusRes] = await Promise.all([
    campIds.length
      ? sb.from("leads").select("id, firm_id, archived_at, lead_no, claimant_name, phone, campaign, created_at, last_called_at, marketing_source, claims(id, lead_id, firm_id, campaign_id, campaign, claim_type, status, created_at)")
          .in("campaign_id", campIds).is("archived_at", null).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null } as any),
    cbLeadIds.length
      ? sb.from("intake_calls").select("lead_id, claim_id, campaign_id, created_at").in("lead_id", cbLeadIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
    setupCamps.length
      ? sb.from("esign_templates").select("campaign_id, key").in("campaign_id", setupCamps.map((c: any) => c.id)).eq("provider", "docuseal")
      : Promise.resolve({ data: [], error: null } as any),
    sb.from("statuses").select("*"),
  ]);

  const allLeads = new Map<string, any>();
  for (const row of cbRes.data || []) if ((row as any).leads?.id) allLeads.set(row.lead_id, (row as any).leads);
  for (const lead of leadRes.data || []) allLeads.set(lead.id, lead);
  const statuses = (statusRes.data || []) as StatusDef[];
  let holds = new Map<string, MvaAcquisitionSignal>(), eligibilityReady = !statusRes.error;
  try { holds = await loadMvaAcquisitionHolds(sb, [...allLeads.keys()]); }
  catch (error) { eligibilityReady = false; notes.push(error instanceof Error ? error.message : "Could not check external contact holds."); }
  if (statusRes.error) notes.push("Case statuses did not load. Contact queues are paused until they can be checked.");
  const eligible = (lead: any, claim: any) => eligibilityReady && isAcquisitionEligible(lead, claim, { statuses, holds });
  const reviews = [...holds.values()].filter(signal => signal.outcome === 'review_required' && allLeads.get(signal.lead_id)?.claims?.some((c: any) => c.id === signal.claim_id && c.firm_id === signal.firm_id));

  // Open files: new or still being worked, newest first.
  if (leadRes.error) notes.push(`Open files did not load: ${leadRes.error.message}`);
  const open: HomeRow[] = (leadRes.data ?? [])
    .flatMap((l: any) => (l.claims || []).filter((c: any) => campIds.includes(c.campaign_id) && ["new", "contacting"].includes(c.status) && eligible(l, c)).map((c: any) => ({
      id: l.id, name: l.claimant_name, phone: l.phone,
      sub: [l.marketing_source, c.campaign || l.campaign].filter(Boolean).join(", "),
      at: l.last_called_at || l.created_at, tag: c.status === "contacting" ? "Worked" : "New", href: `/app/${l.id}?claim=${c.id}`,
    })));

  // Call backs. Only the latest call on the exact matter counts.
  if (cbRes.error) notes.push(`Call backs did not load: ${cbRes.error.message}`);
  const latestBy: Record<string, string> = {};
  if (latestRes.error) notes.push("Latest call state did not load. Callbacks are paused until it can be checked.");
  for (const r of latestRes.data ?? []) {
    const claim = acquisitionClaimForRow(allLeads.get(r.lead_id), r);
    if (claim && !latestBy[claim.id]) latestBy[claim.id] = r.created_at;
  }
  const callbacks: HomeRow[] = [];
  const seenCb = new Set<string>();
  for (const r of cbRes.data ?? []) {
    const lead = allLeads.get(r.lead_id), claim = acquisitionClaimForRow(lead, r);
    if (latestRes.error || !claim || !eligible(lead, claim) || seenCb.has(claim.id) || latestBy[claim.id] !== r.created_at) continue;
    seenCb.add(claim.id);
    callbacks.push({ id: r.lead_id, name: lead.claimant_name, phone: lead.phone, sub: [r.reason, r.agent_name].filter(Boolean).join(", "), at: r.callback_at, due: r.callback_at, tag: "Call back", href: `/app/${r.lead_id}?claim=${claim.id}` });
  }

  if (waitRes.error) notes.push(`Agreements did not load: ${waitRes.error.message}`);
  const waiting: HomeRow[] = (waitRes.data ?? []).map((r: any) => ({ id: r.lead_id, name: r.leads?.claimant_name || r.signer_name, phone: r.leads?.phone, sub: `Sent by ${String(r.via || "").toLowerCase()}`, at: r.sent_at, tag: r.status === "opened" ? "Opened" : "Sent" }));

  if (doneRes.error) notes.push(`Finished calls did not load: ${doneRes.error.message}`);
  const done: HomeRow[] = (doneRes.data ?? []).filter((r: any) => r.lead_id).map((r: any) => ({
    id: r.lead_id, name: r.leads?.claimant_name, phone: r.leads?.phone,
    sub: [r.reason, r.agent_name].filter(Boolean).join(", "), at: r.ended_at,
    tag: DISPO_LABEL[r.disposition as DispoCode] || r.disposition || "Ended",
  }));

  // Texts: newest per caller. A number with no file yet still shows, so
  // nobody's reply gets lost.
  if (textRes.error) notes.push(`Texts did not load: ${textRes.error.message}`);
  const texts: HomeRow[] = [];
  const seenTx = new Set<string>();
  for (const r of textRes.data ?? []) {
    const lead = (r as any).leads;
    if (r.lead_id && lead?.campaign_id && !campIds.includes(lead.campaign_id)) continue;
    const k = r.lead_id || `p:${r.phone_norm}`;
    if (seenTx.has(k)) continue;
    seenTx.add(k);
    texts.push({
      id: r.lead_id || "", name: lead?.claimant_name || null, phone: lead?.phone || r.phone_raw,
      sub: String(r.body || "").slice(0, 90), at: r.occurred_at, tag: r.lead_id ? "Text" : "No file",
      href: r.lead_id ? `/app/${r.lead_id}?text=1` : null, newPhone: r.lead_id ? null : (r.phone_raw || r.phone_norm),
    });
  }

  // E-sign setup, for owners and admins, per campaign that has agreement files.
  const setup: HomeData["setup"] = [];
  for (const c of setupCamps) {
    const need = Object.keys(packetsFor((firmById.get(c.firm_id) as any)?.slug, c.case_type) || {}).length;
    const have = (tplRes.data ?? []).filter((t: any) => t.campaign_id === c.id).length;
    if (have < need) setup.push({ campaignId: c.id, name: c.name, have, need, docuseal: docusealConfigured() });
  }

  const data: HomeData = {
    me: { name: me.full_name || "", role: me.role },
    campaigns: campaigns.map((c: any) => ({ id: c.id, name: c.name, firm: (firmById.get(c.firm_id) as any)?.name || "", kind: c.case_type })),
    open, callbacks, waiting, done, texts, setup, notes,
  };
  return <>{reviews.length > 0 && <details className="side-card"><summary>LawRuler status needs review ({reviews.length})</summary><p>These source updates need an owner/admin review. Held matters are excluded from acquisition calls.</p><ul>{reviews.map(r => <li key={r.claim_id}><Link href={`/leads/${r.lead_id}?claim=${r.claim_id}`}>{allLeads.get(r.lead_id)?.claimant_name || 'Open matter'}</Link>: {r.source_status || 'Status missing'} — {r.reason}</li>)}</ul></details>}<CallsHome data={data} /></>;
}
