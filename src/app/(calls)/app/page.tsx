export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { packetsFor } from "@/lib/mva-call/esign";
import { docusealConfigured } from "@/lib/docuseal";
import { loadDeskWork } from "@/lib/mva-call/desk-data";
import Link from "next/link";
import CallsHome, { type HomeData, type HomeRow } from "@/components/calls/CallsHome";
import { netflyContext } from "@/lib/netfly-server";

export default async function AppHomePage() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("id, role, full_name").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");
  // NETFLY is a separate signed-transfer console, so use its own exact gate.
  let netflyAvailable = false;
  try {
    const netfly = await netflyContext();
    netflyAvailable = !!netfly?.actor.can("leads.edit");
  } catch {
    // A NETFLY lookup failure must not take the INNO Desk offline.
  }
  const { campaigns, firmById, campIds, pilot, allLeads, holds, queues, notes } = await loadDeskWork(sb, me.role);
  const setupCamps = me.role === "owner"
    ? campaigns.filter((c: any) => packetsFor((firmById.get(c.firm_id) as any)?.slug, c.case_type)) : [];
  const [tplRes, textRes] = await Promise.all([
    setupCamps.length ? sb.from("esign_templates").select("campaign_id, key").in("campaign_id", setupCamps.map((c: any) => c.id)).eq("provider", "docuseal") : { data: [], error: null },
    sb.from("communications").select("lead_id, phone_raw, phone_norm, body, occurred_at, leads(claimant_name, phone, campaign_id, archived_at)")
      .eq("channel", "sms").eq("direction", "inbound").gte("occurred_at", new Date(Date.now() - 3 * 86400000).toISOString())
      .order("occurred_at", { ascending: false }).limit(150),
  ]);
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

