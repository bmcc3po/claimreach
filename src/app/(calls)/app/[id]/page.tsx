export const runtime = "edge";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { LEAD_CALL_COLS, firmSpoken, fmtPhone, canHearRecordings } from "@/lib/mva-call/server";
import { DEFAULT_CALL_REASONS, MVA_DQ_KEYS, type Reason } from "@/lib/mva-call/dispo";
import { docusealConfigured } from "@/lib/docuseal";
import CallConsole from "@/components/calls/CallConsole";
import { readLeadStory, storyTags, prefillFromStory } from "@/lib/mva-call/lead-story";
import { packetsFor } from "@/lib/mva-call/esign";

export default async function CallPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ text?: string }> }) {
  const { id } = await params;
  const { text } = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("id, role, full_name").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");

  const { data: lead } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [{ data: firm }, liveRes, mainRes, reasonsRes, dqRes, ownersRes, tplRes, extraRes, lastRes] = await Promise.all([
    sb.from("firms").select("name, slug").eq("id", lead.firm_id).maybeSingle(),
    // Pick up this agent's own open call on this file only if it was touched in
    // the last 30 minutes (a refresh, a dropped signal). Anything older is a new
    // call with a fresh clock; its answers still carry over below.
    sb.from("intake_calls").select("id, answers, created_at").eq("lead_id", lead.id).eq("agent_id", me.id).eq("status", "live")
      .gte("updated_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("esign_submissions").select("status").eq("lead_id", lead.id).is("pax_index", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("call_dispo_reasons").select("dispo, key, label, sort").eq("active", true).order("sort"),
    sb.from("dq_reasons").select("key, label, active").in("key", MVA_DQ_KEYS),
    sb.from("app_users").select("full_name, email").eq("role", "owner").eq("active", true),
    sb.from("esign_templates").select("key").eq("campaign_id", lead.campaign_id ?? "00000000-0000-0000-0000-000000000000").eq("provider", "docuseal"),
    // What the marketer sent. vendor_fields arrives with migration 0098; until
    // then the retry below reads the rest without it.
    sb.from("leads").select("case_description, marketing_source, lawruler_ref_no, vendor_fields").eq("id", lead.id).maybeSingle(),
    sb.from("intake_calls").select("answers").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  let extra: any = extraRes.data;
  if (extraRes.error) {
    const { data } = await sb.from("leads").select("case_description, marketing_source, lawruler_ref_no").eq("id", lead.id).maybeSingle();
    extra = data;
  }
  const vf: any = extra?.vendor_fields && typeof extra.vendor_fields === "object" ? extra.vendor_fields : {};
  const story = readLeadStory(extra?.case_description, { doi: vf.doi, state: vf.accident_state, city: vf.accident_city });
  const marketer = vf.marketer && vf.marketer !== vf.channel ? vf.marketer : null;
  const channel = vf.channel || extra?.marketing_source || null;
  const leadCard = {
    from: [channel, marketer].filter(Boolean).join(" via ") + (extra?.lawruler_ref_no ? `${channel || marketer ? ", " : ""}LawRuler ${extra.lawruler_ref_no}` : ""),
    said: String(extra?.case_description || "").trim().slice(0, 1200),
    tags: storyTags(story),
  };

  // The last saved answers from this file, when this is a fresh call on an old file.
  let saved: any = liveRes.data?.answers ?? null;
  if (!saved) {
    const last = lastRes.data;
    saved = last?.answers && Object.keys(last.answers).length ? { ...last.answers, phase: "open" } : null;
  }
  // First call on a marketer lead: pre-pick what the lead already says.
  if (!saved) {
    const pre = prefillFromStory(story);
    if (pre) saved = { phase: "open", ...pre };
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
      canPreview: !!packetsFor(firm?.slug, lead.case_type),
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
        lead: leadCard.from || leadCard.said || leadCard.tags.length ? leadCard : null,
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
