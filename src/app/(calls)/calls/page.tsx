export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { packetsFor } from "@/lib/mva-call/esign";
import { docusealConfigured } from "@/lib/docuseal";
import { DISPO_LABEL, type DispoCode } from "@/lib/mva-call/dispo";
import CallsHome, { type HomeData, type HomeRow } from "@/components/calls/CallsHome";

// Calls home: what to work right now. Open files, call backs that are due,
// agreements out for signature, and what already got done.
export default async function CallsHomePage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("id, role, full_name").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");

  const { data: camps } = await sb.from("campaigns").select("id, name, firm_id, case_type").eq("case_type", "mva").eq("active", true).order("name");
  const campaigns = camps ?? [];
  const campIds = campaigns.map((c: any) => c.id);
  const { data: firms } = await sb.from("firms").select("id, slug, name");
  const firmById = new Map((firms ?? []).map((f: any) => [f.id, f]));
  const notes: string[] = [];

  // Open files: new or still being worked, newest first.
  let open: HomeRow[] = [];
  if (campIds.length) {
    const { data: leads, error } = await sb.from("leads")
      .select("id, lead_no, claimant_name, phone, campaign, created_at, last_called_at")
      .in("campaign_id", campIds).is("archived_at", null).order("created_at", { ascending: false }).limit(200);
    if (error) notes.push(`Open files did not load: ${error.message}`);
    const ids = (leads ?? []).map((l: any) => l.id);
    const statusBy: Record<string, string> = {};
    if (ids.length) {
      const { data: claims } = await sb.from("claims").select("lead_id, status, created_at").in("lead_id", ids).order("created_at", { ascending: true });
      for (const c of claims ?? []) if (!statusBy[c.lead_id]) statusBy[c.lead_id] = c.status;
    }
    open = (leads ?? []).filter((l: any) => ["new", "contacting", undefined].includes(statusBy[l.id]))
      .map((l: any) => ({ id: l.id, name: l.claimant_name, phone: l.phone, sub: l.campaign, at: l.last_called_at || l.created_at, tag: statusBy[l.id] === "contacting" ? "Worked" : "New" }));
  }

  // Call backs, soonest first. Only the latest call on a file counts.
  let callbacks: HomeRow[] = [];
  {
    const { data, error } = await sb.from("intake_calls")
      .select("lead_id, callback_at, agent_name, reason, created_at, leads(claimant_name, phone)")
      .eq("disposition", "callback").not("callback_at", "is", null)
      .gte("callback_at", new Date(Date.now() - 3 * 86400000).toISOString())
      .order("callback_at", { ascending: true }).limit(100);
    if (error) notes.push(`Call backs did not load: ${error.message}`);
    const leadIds = Array.from(new Set((data ?? []).map((r: any) => r.lead_id)));
    const latestBy: Record<string, string> = {};
    if (leadIds.length) {
      const { data: latest } = await sb.from("intake_calls").select("lead_id, created_at").in("lead_id", leadIds).order("created_at", { ascending: false });
      for (const r of latest ?? []) if (!latestBy[r.lead_id]) latestBy[r.lead_id] = r.created_at;
    }
    const seen = new Set<string>();
    for (const r of data ?? []) {
      if (seen.has(r.lead_id) || latestBy[r.lead_id] !== r.created_at) continue;
      seen.add(r.lead_id);
      callbacks.push({ id: r.lead_id, name: (r as any).leads?.claimant_name, phone: (r as any).leads?.phone, sub: [r.reason, r.agent_name].filter(Boolean).join(", "), at: r.callback_at, due: r.callback_at, tag: "Call back" });
    }
  }

  // Out for signature in the last three days.
  let waiting: HomeRow[] = [];
  {
    const { data, error } = await sb.from("esign_submissions")
      .select("lead_id, status, signer_name, sent_at, via, leads(claimant_name, phone)")
      .in("status", ["sent", "opened"]).gte("sent_at", new Date(Date.now() - 3 * 86400000).toISOString())
      .order("sent_at", { ascending: false }).limit(100);
    if (error) notes.push(`Agreements did not load: ${error.message}`);
    waiting = (data ?? []).map((r: any) => ({ id: r.lead_id, name: r.leads?.claimant_name || r.signer_name, phone: r.leads?.phone, sub: `Sent by ${String(r.via || "").toLowerCase()}`, at: r.sent_at, tag: r.status === "opened" ? "Opened" : "Sent" }));
  }

  // Done: calls that ended in the last two days.
  let done: HomeRow[] = [];
  {
    const { data, error } = await sb.from("intake_calls")
      .select("lead_id, disposition, reason, agent_name, ended_at, leads(claimant_name, phone)")
      .eq("status", "ended").gte("ended_at", new Date(Date.now() - 2 * 86400000).toISOString())
      .order("ended_at", { ascending: false }).limit(100);
    if (error) notes.push(`Finished calls did not load: ${error.message}`);
    done = (data ?? []).filter((r: any) => r.lead_id).map((r: any) => ({
      id: r.lead_id, name: r.leads?.claimant_name, phone: r.leads?.phone,
      sub: [r.reason, r.agent_name].filter(Boolean).join(", "), at: r.ended_at,
      tag: DISPO_LABEL[r.disposition as DispoCode] || r.disposition || "Ended",
    }));
  }

  // E-sign setup, for owners and admins, per campaign that has agreement files.
  const setup: HomeData["setup"] = [];
  if (["owner", "admin"].includes(me.role)) {
    for (const c of campaigns) {
      const packets = packetsFor((firmById.get(c.firm_id) as any)?.slug, c.case_type);
      if (!packets) continue;
      const { data: rows } = await sb.from("esign_templates").select("key").eq("campaign_id", c.id).eq("provider", "docuseal");
      const have = (rows ?? []).length, need = Object.keys(packets).length;
      if (have < need) setup.push({ campaignId: c.id, name: c.name, have, need, docuseal: docusealConfigured() });
    }
  }

  const data: HomeData = {
    me: { name: me.full_name || "", role: me.role },
    campaigns: campaigns.map((c: any) => ({ id: c.id, name: c.name, firm: (firmById.get(c.firm_id) as any)?.name || "" })),
    open, callbacks, waiting, done, setup, notes,
  };
  return <CallsHome data={data} />;
}
