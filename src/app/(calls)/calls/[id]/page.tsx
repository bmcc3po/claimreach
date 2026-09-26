export const runtime = "edge";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { LEAD_CALL_COLS, firmSpoken, fmtPhone, canHearRecordings } from "@/lib/mva-call/server";
import { DEFAULT_CALL_REASONS, MVA_DQ_KEYS, type Reason } from "@/lib/mva-call/dispo";
import { docusealConfigured } from "@/lib/docuseal";
import CallConsole from "@/components/calls/CallConsole";

export default async function CallPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ text?: string }> }) {
  const { id } = await params;
  const { text } = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("id, role, full_name").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");

  const { data: lead } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [{ data: firm }, liveRes, mainRes, reasonsRes, dqRes, ownersRes, tplRes] = await Promise.all([
    sb.from("firms").select("name, slug").eq("id", lead.firm_id).maybeSingle(),
    // Pick up this agent's own open call on this file (a refresh, a dropped signal).
    sb.from("intake_calls").select("id, answers, created_at").eq("lead_id", lead.id).eq("agent_id", me.id).eq("status", "live")
      .gte("created_at", new Date(Date.now() - 12 * 3600 * 1000).toISOString()).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("esign_submissions").select("status").eq("lead_id", lead.id).is("pax_index", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("call_dispo_reasons").select("dispo, key, label, sort").eq("active", true).order("sort"),
    sb.from("dq_reasons").select("key, label, active").in("key", MVA_DQ_KEYS),
    sb.from("app_users").select("full_name, email").eq("role", "owner").eq("active", true),
    sb.from("esign_templates").select("key").eq("campaign_id", lead.campaign_id ?? "00000000-0000-0000-0000-000000000000").eq("provider", "docuseal"),
  ]);

  // The last saved answers from this file, when this is a fresh call on an old file.
  let saved: any = liveRes.data?.answers ?? null;
  if (!saved) {
    const { data: last } = await sb.from("intake_calls").select("answers").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    saved = last?.answers && Object.keys(last.answers).length ? { ...last.answers, phase: "open" } : null;
  }

  const pax: Record<string, string> = {};
  if (liveRes.data?.id) {
    const { data: prows } = await sb.from("esign_submissions").select("pax_index, status").eq("call_id", liveRes.data.id).not("pax_index", "is", null);
    for (const r of prows ?? []) pax[String(r.pax_index)] = r.status === "completed" ? "signed" : r.status;
  }

  const byDispo = (code: "esign" | "callback" | "ni"): Reason[] => {
    if (reasonsRes.error || !reasonsRes.data?.length) return DEFAULT_CALL_REASONS[code];
    return reasonsRes.data.filter((r: any) => r.dispo === code).map((r: any) => ({ key: r.key, label: r.label }));
  };
  const dqRows = (dqRes.data ?? []).filter((r: any) => r.active);
  const dq: Reason[] = MVA_DQ_KEYS.map((k) => dqRows.find((r: any) => r.key === k)).filter(Boolean).map((r: any) => ({ key: r.key, label: r.label }));

  const mainStatus = mainRes.data?.status;
  const from = process.env.JUSTCALL_DEFAULT_FROM || "";

  return (
    <CallConsole init={{
      leadId: lead.id,
      callId: liveRes.data?.id ?? null,
      openText: text === "1",
      startedAt: liveRes.data?.created_at ? Date.parse(liveRes.data.created_at) : Date.now(),
      props: {
        callerName: lead.claimant_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "",
        callerPhone: lead.phone || "",
        callerEmail: lead.email || "",
        agentName: me.full_name || "",
        firmSpoken: firmSpoken(firm?.name),
        textFrom: from ? fmtPhone(from) : "",
        saved,
        canHear: canHearRecordings(me.role),
        showFees: firm?.slug === "tmp" && lead.case_type === "mva",
        reasons: { esign: byDispo("esign"), callback: byDispo("callback"), ni: byDispo("ni"), dq },
        notifyDefaults: (ownersRes.data ?? []).filter((o: any) => o.email).map((o: any) => ({ who: o.full_name || o.email, how: o.email })),
        esign: {
          status: !mainStatus ? "ready" : mainStatus === "completed" ? "signed" : ["failed", "declined", "expired"].includes(mainStatus) ? "ready" : mainStatus,
          configured: docusealConfigured() && (tplRes.data ?? []).length > 0,
          pax,
        },
      },
    }} />
  );
}
