export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { packetsFor } from "@/lib/mva-call/esign";
import { docusealConfigured } from "@/lib/docuseal";
import { APP_CASE_TYPES } from "@/lib/mva-call/links";
import { loadMvaAcquisitionHolds, type MvaAcquisitionSignal } from "@/lib/lawruler-mva-status";
import { buildDeskQueues, readDeskRows } from "@/lib/mva-call/desk-queue";
import type { StatusDef } from "@/lib/statuses";
import Link from "next/link";
import CallsHome, { type HomeData, type HomeRow } from "@/components/calls/CallsHome";
import { netflyContext } from "@/lib/netfly-server";

export default async function AppHomePage() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const [meRes, campRes, firmRes, statusRes] = await Promise.all([
    sb.from("app_users").select("id, role, full_name").eq("id", user.id).maybeSingle(),
    sb.from("campaigns").select("id, name, firm_id, case_type").in("case_type", APP_CASE_TYPES).eq("active", true).order("name"),
    sb.from("firms").select("id, slug, name"),
    sb.from("statuses").select("*"),
  ]);
  const me = meRes.data;
  if (!me) redirect("/firm-login");
  // NETFLY is a separate signed-transfer console, so use its own exact gate.
  let netflyAvailable = false;
  try {
    const netfly = await netflyContext();
    netflyAvailable = !!netfly?.actor.can("leads.edit");
  } catch {
    // A NETFLY lookup failure must not take the INNO Desk offline.
  }
  const notes: string[] = [];
  const pilot = me.role !== "owner";
  const firmById = new Map((firmRes.data ?? []).map((f: any) => [f.id, f]));
  const campaigns = (campRes.data ?? []).filter((c: any) => c.name !== "NETFLY ONTAKE" && (!pilot ||
    (c.name === "INNO MVA" && c.case_type === "mva" && (firmById.get(c.firm_id) as any)?.slug === "tmp")));
  const campIds = campaigns.map((c: any) => c.id);
  const setupCamps = me.role === "owner"
    ? campaigns.filter((c: any) => packetsFor((firmById.get(c.firm_id) as any)?.slug, c.case_type)) : [];
  const [leadRes, tplRes, textRes] = await Promise.all([
    campIds.length ? readDeskRows(() => sb.from("leads")
      .select("id, firm_id, external_id, archived_at, lead_no, claimant_name, phone, campaign_id, campaign, created_at, last_called_at, signed_at, marketing_source, claims(id, lead_id, firm_id, campaign_id, campaign, claim_type, status, created_at, updated_at)")
      .in("campaign_id", campIds).is("archived_at", null)) : { data: [], error: null },
    setupCamps.length ? sb.from("esign_templates").select("campaign_id, key").in("campaign_id", setupCamps.map((c: any) => c.id)).eq("provider", "docuseal") : { data: [], error: null },
    // Messages remain reachable outside the six work queues, including replies
    // on a closed file. No message changes the file's workflow status.
    sb.from("communications").select("lead_id, phone_raw, phone_norm, body, occurred_at, leads(claimant_name, phone, campaign_id, archived_at)")
      .eq("channel", "sms").eq("direction", "inbound").gte("occurred_at", new Date(Date.now() - 3 * 86400000).toISOString())
      .order("occurred_at", { ascending: false }).limit(150),
  ]);
  const leads = leadRes.data ?? [], allLeads = new Map<string, any>(leads.map((lead: any) => [lead.id, lead]));
  const leadIds = [...allLeads.keys()];
  // Batch the identity filters so a larger roster does not exceed URL limits.
  const calls: any[] = [], agreements: any[] = [];
  let acquisitionReady = !statusRes.error && !leadRes.error;
  let signingReady = !leadRes.error;
  for (let start = 0; start < leadIds.length; start += 100) {
    const ids = leadIds.slice(start, start + 100);
    const [callRes, agreementRes] = await Promise.all([
      readDeskRows(() => sb.from("intake_calls").select("id, lead_id, claim_id, campaign_id, status, disposition, callback_at, agent_name, reason, created_at").in("lead_id", ids)),
      readDeskRows(() => sb.from("esign_submissions").select("id, lead_id, claim_id, campaign_id, firm_id, pax_index, status, created_at, sent_at, signed_at, voided_at, replacement_requested_at, agent_reviewed_at, template_key").in("lead_id", ids)),
    ]);
    if (callRes.error) acquisitionReady = false;
    else calls.push(...callRes.data);
    if (agreementRes.error) signingReady = false;
    else agreements.push(...agreementRes.data);
  }
  if (campRes.error || firmRes.error) notes.push("Campaigns did not load. Do not assume your work queues are empty.");
  if (leadRes.error) notes.push("Files did not load. Retry before assuming there are no files to work.");
  if (!acquisitionReady) notes.push("Current call or status data did not load. Calling queues are paused until it can be checked.");
  if (!signingReady) notes.push("Agreements did not load. Signature-dependent queues may be incomplete; retry before assuming they are empty.");
  let holds = new Map<string, MvaAcquisitionSignal>();
  try { holds = await loadMvaAcquisitionHolds(sb, leadIds); }
  catch (error) { acquisitionReady = false; notes.push(error instanceof Error ? error.message : "Could not check external contact holds."); }
  const queues = buildDeskQueues({ leads, calls, agreements, campaignIds: campIds, statuses: (statusRes.data || []) as StatusDef[], holds, acquisitionReady: acquisitionReady && signingReady });
  const reviews = [...holds.values()].filter(signal => signal.outcome === "review_required" &&
    allLeads.get(signal.lead_id)?.claims?.some((c: any) => c.id === signal.claim_id && c.firm_id === signal.firm_id && campIds.includes(c.campaign_id)));

  if (textRes.error) notes.push("Texts did not load. Retry to check incoming replies.");
  const texts: HomeRow[] = [], seenTexts = new Set<string>();
  for (const row of textRes.data ?? []) {
    const lead = (row as any).leads;
    if (pilot && (!row.lead_id || !lead || lead.archived_at || !campIds.includes(lead.campaign_id))) continue;
    if (row.lead_id && lead?.campaign_id && !campIds.includes(lead.campaign_id)) continue;
    const key = row.lead_id || `p:${row.phone_norm}`;
    if (seenTexts.has(key)) continue;
    seenTexts.add(key);
    texts.push({ id: row.lead_id || "", name: lead?.claimant_name || null, phone: lead?.phone || row.phone_raw,
      sub: String(row.body || "").slice(0, 90), at: row.occurred_at, tag: row.lead_id ? "Text" : "No file",
      href: row.lead_id ? `/app/${row.lead_id}?text=1` : null, newPhone: row.lead_id ? null : row.phone_raw || row.phone_norm });
  }
  const setup: HomeData["setup"] = [];
  for (const campaign of setupCamps) {
    const need = Object.keys(packetsFor((firmById.get(campaign.firm_id) as any)?.slug, campaign.case_type) || {}).length;
    const have = (tplRes.data ?? []).filter((t: any) => t.campaign_id === campaign.id).length;
    if (have < need) setup.push({ campaignId: campaign.id, name: campaign.name, have, need, docuseal: docusealConfigured() });
  }
  const data: HomeData = { me: { name: me.full_name || "", role: me.role }, netflyAvailable,
    campaigns: campaigns.map((c: any) => ({ id: c.id, name: c.name, firm: (firmById.get(c.firm_id) as any)?.name || "", kind: c.case_type })),
    queues, texts, setup, notes };
  return <>{netflyAvailable && <div style={{ maxWidth: 1120, margin: "14px auto 0", padding: "0 16px" }}><Link href="/app/netfly" style={{ display: "inline-flex", padding: "10px 14px", borderRadius: 10, background: "#173a71", color: "white", fontWeight: 700, textDecoration: "none" }}>NETFLY ONTAKE →</Link></div>}{reviews.length > 0 && <details className="side-card"><summary>LawRuler status needs review ({reviews.length})</summary><p>These source updates need an owner review. Held matters are excluded from acquisition calls.</p><ul>{reviews.map(r => <li key={r.claim_id}><Link href={`${pilot ? "/app" : "/leads"}/${r.lead_id}?claim=${r.claim_id}`}>{allLeads.get(r.lead_id)?.claimant_name || "Open matter"}</Link>: {r.source_status || "Status missing"} - {r.reason}</li>)}</ul></details>}<CallsHome data={data} /></>;
}

