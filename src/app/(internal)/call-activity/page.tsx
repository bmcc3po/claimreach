export const runtime = "edge";

import { workArea, scopeWorkArea } from "@/lib/work-area";
import { redirect } from "next/navigation";
import { authUser } from "@/lib/auth-user";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { justcallInboundOutcomes, linkedCallActivity } from "@/lib/call-activity";
import { mondayOf, pacificDay, shiftWeek } from "@/lib/packet-worklist";
import CallActivityView from "@/components/CallActivityView";

export default async function CallActivityPage({ searchParams }: { searchParams: Promise<{ week?: string; area?: string }> }) {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("role,active").eq("id", user.id).maybeSingle();
  if (!me || me.active !== true || me.role !== "owner") redirect("/dashboard");
  const { week, area: requestedArea } = await searchParams;
  const area = workArea(requestedArea);
  const validWeek = !!week && /^\d{4}-\d{2}-\d{2}$/.test(week) && !Number.isNaN(Date.parse(`${week}T12:00:00Z`))
    && new Date(`${week}T12:00:00Z`).toISOString().slice(0, 10) === week;
  const monday = mondayOf(validWeek ? week! : pacificDay(new Date().toISOString()));
  const next = shiftWeek(monday, 1);
  const after = `${monday}T00:00:00Z`;
  const before = new Date(Date.parse(`${next}T00:00:00Z`) + 86400000).toISOString();
  const comms: any[] = [];
  let truncated = false;
  // The report contains only calls already linked to a file. An unmatched
  // provider event cannot be credited to an agent's case or callback.
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error } = await sb.from("communications")
      .select("id,lead_id,call_sid,channel,direction,agent_name,occurred_at,duration_sec")
      .eq("channel", "call").not("lead_id", "is", null)
      .gte("occurred_at", after).lt("occurred_at", before)
      .order("occurred_at", { ascending: false }).range(offset, offset + 499);
    if (error) throw new Error(`Could not load linked call activity: ${error.message}`);
    comms.push(...(data || []));
    if ((data || []).length < 500) break;
    if (offset === 4500) truncated = true;
  }
  const { data: callbacks, error: callbackError } = await sb.from("intake_calls")
    .select("id,lead_id,claim_id,agent_name,callback_at,created_at,disposition,status")
    .eq("disposition", "callback").not("callback_at", "is", null)
    .gte("callback_at", after).lt("callback_at", before)
    .order("callback_at", { ascending: true }).limit(1000);
  if (callbackError) throw new Error(`Could not load scheduled callbacks: ${callbackError.message}`);
  // JustCall's completed event carries an explicit inbound type (answered,
  // missed, voicemail). Read it only after the owner gate above and expose
  // only the derived outcome, never the raw event payload, to the page.
  const providerEvents: any[] = [];
  let outcomesIncomplete = false;
  const admin = supabaseAdmin();
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error } = await admin.from("webhook_events")
      .select("event_type,status,payload,created_at")
      .eq("event_type", "justcall.call.completed")
      .gte("created_at", after).lt("created_at", before)
      .order("created_at", { ascending: true }).range(offset, offset + 499);
    if (error) { outcomesIncomplete = true; break; }
    providerEvents.push(...(data || []));
    if ((data || []).length < 500) break;
    if (offset === 4500) outcomesIncomplete = true;
  }
  const ids = [...new Set([...comms.map((row) => row.lead_id), ...(callbacks || []).map((row) => row.lead_id)].filter(Boolean))];
  const leads: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await scopeWorkArea(sb.from("leads").select("id,lead_no,claimant_name,campaign,case_type").in("id", ids.slice(i, i + 100)).is("archived_at", null), area);
    if (error) throw new Error(`Could not load linked call files: ${error.message}`);
    leads.push(...(data || []));
  }
  const byLead = new Map(leads.map((lead) => [lead.id, lead]));
  const callbackRows = (callbacks || []).filter((row) => byLead.has(row.lead_id) && row.callback_at && pacificDay(row.callback_at) >= monday && pacificDay(row.callback_at) < next)
    .map((row) => {
      const lead = byLead.get(row.lead_id);
      return { id: row.id, leadNo: lead?.lead_no || "File", claimant: lead?.claimant_name || "Name missing",
        agent: row.agent_name || "Agent not recorded", callbackAt: row.callback_at, status: row.status || "" };
    });
  return <CallActivityView area={area} monday={monday} rows={linkedCallActivity(comms, leads, monday, justcallInboundOutcomes(providerEvents))} callbacks={callbackRows}
    truncated={truncated} callbacksTruncated={(callbacks || []).length === 1000} outcomesIncomplete={outcomesIncomplete} />;
}
