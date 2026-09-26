export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { packetsFor } from "@/lib/mva-call/esign";
import { docusealConfigured } from "@/lib/docuseal";
import { DISPO_LABEL, type DispoCode } from "@/lib/mva-call/dispo";
import { APP_CASE_TYPES } from "@/lib/mva-call/links";
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
    sb.from("intake_calls").select("lead_id, callback_at, agent_name, reason, created_at, leads(claimant_name, phone)")
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
  const [leadRes, latestRes, tplRes] = await Promise.all([
    campIds.length
      ? sb.from("leads").select("id, lead_no, claimant_name, phone, campaign, created_at, last_called_at, marketing_source, claims(status, created_at)")
          .in("campaign_id", campIds).is("archived_at", null).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null } as any),
    cbLeadIds.length
      ? sb.from("intake_calls").select("lead_id, created_at").in("lead_id", cbLeadIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
    setupCamps.length
      ? sb.from("esign_templates").select("campaign_id, key").in("campaign_id", setupCamps.map((c: any) => c.id)).eq("provider", "docuseal")
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  // Open files: new or still being worked, newest first.
  if (leadRes.error) notes.push(`Open files did not load: ${leadRes.error.message}`);
  const firstStatus = (l: any) => {
    const cs = [...(l.claims ?? [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
    return cs[0]?.status as string | undefined;
  };
  const open: HomeRow[] = (leadRes.data ?? [])
    .filter((l: any) => ["new", "contacting", undefined].includes(firstStatus(l)))
    .map((l: any) => ({
      id: l.id, name: l.claimant_name, phone: l.phone,
      sub: [l.marketing_source, l.campaign].filter(Boolean).join(", "),
      at: l.last_called_at || l.created_at, tag: firstStatus(l) === "contacting" ? "Worked" : "New",
    }));

  // Call backs. Only the latest call on a file counts.
  if (cbRes.error) notes.push(`Call backs did not load: ${cbRes.error.message}`);
  const latestBy: Record<string, string> = {};
  for (const r of latestRes.data ?? []) if (!latestBy[r.lead_id]) latestBy[r.lead_id] = r.created_at;
  const callbacks: HomeRow[] = [];
  const seenCb = new Set<string>();
  for (const r of cbRes.data ?? []) {
    if (seenCb.has(r.lead_id) || latestBy[r.lead_id] !== r.created_at) continue;
    seenCb.add(r.lead_id);
    callbacks.push({ id: r.lead_id, name: (r as any).leads?.claimant_name, phone: (r as any).leads?.phone, sub: [r.reason, r.agent_name].filter(Boolean).join(", "), at: r.callback_at, due: r.callback_at, tag: "Call back" });
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
  return <CallsHome data={data} />;
}
