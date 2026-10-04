export const runtime = "edge";
import { notFound, redirect } from "next/navigation";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { LEAD_CALL_COLS, firmSpoken, fmtPhone, canHearRecordings } from "@/lib/mva-call/server";
import { DEFAULT_CALL_REASONS, MVA_DQ_KEYS, type Reason } from "@/lib/mva-call/dispo";
import { docusealConfigured } from "@/lib/docuseal";
import CallConsole from "@/components/calls/CallConsole";
import CanonicalUrl from "@/components/CanonicalUrl";
import { resolveLeadKey, leadKeyOf } from "@/lib/lead-key";
import { readLeadStory, storyTags, prefillFromStory } from "@/lib/mva-call/lead-story";
import { packetsFor } from "@/lib/mva-call/esign";
import { linkedFilesFor, paxParentId, sharedCrashFacts } from "@/lib/linked-files";
import { resolveMatter, matterRowsFilter } from "@/lib/matter";
import { getMatterAgreement, getMatterEmergency, emergencySupersedes } from "@/lib/mva-call/signing-matter";
import { joinUsAddress } from "@/lib/us-address";
import { rehearsalTemplates, syntheticName } from '@/lib/mva-call/rehearsal';
import RehearsalSetup from '@/components/calls/RehearsalSetup';

export default async function CallPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ text?: string; claim?: string; review?: string }> }) {
  const { id: key } = await params;
  const { text, claim: claimParam, review } = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("app_users").select("id, role, full_name").eq("id", user.id).maybeSingle();
  if (!me) redirect("/firm-login");

  // /app/TMP-1042 or the long internal ID.
  const id = await resolveLeadKey(sb, key);
  if (!id) notFound();
  const { data: lead } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", id).maybeSingle();
  if (!lead) notFound();
  // The pilot staff console is exclusively the TMP INNO MVA campaign. Check
  // before resolving or creating a matter, and before the admin open stamp.
  if (me.role !== "owner") {
    const { data: pilotCampaign } = await sb.from("campaigns")
      .select("id, firm_id").eq("name", "INNO MVA").eq("case_type", "mva")
      .eq("active", true).eq("firm_id", lead.firm_id).limit(2);
    const { data: pilotFirm } = await sb.from("firms")
      .select("slug").eq("id", lead.firm_id).maybeSingle();
    if (pilotFirm?.slug !== "tmp" || pilotCampaign?.length !== 1
      || lead.campaign_id !== pilotCampaign[0].id || lead.archived_at) notFound();
  }
  // This console runs the MVA car-wreck script. A Motel or any other case type
  // opened here got read the wrong script (Astra audit, Sep 27): those files
  // belong on their own case page.
  // Speed to lead, open side: first staff open of the file stamps it — AFTER
  // the redirect decisions, so a bounce off this page is not "opened"
  // (Astra round 5: the stamp fired during render, before redirects).

  // ONE matter for this call, pinned for its whole life: autosave, dispo,
  // signing and delivery all carry this claim id (Astra round 6). A file with
  // several matters and no single match asks which one; a legacy file with
  // no claim gets its MVA claim now, the way the case page does.
  const authoritativeDb = supabaseAdmin();
  let matter = await resolveMatter(sb, lead.id, { claimId: claimParam || null, campaignId: lead.campaign_id ?? null, authoritativeDb });
  if (!matter.ok && !matter.ambiguous && matter.status === 409 && !claimParam && lead.case_type === "mva") {
    await sb.from("claims").insert({ firm_id: lead.firm_id, lead_id: lead.id, claim_type: "mva", campaign: lead.campaign, campaign_id: lead.campaign_id, status: "new", is_this_file: true, created_by: me.id });
    matter = await resolveMatter(sb, lead.id, { campaignId: lead.campaign_id ?? null, authoritativeDb });
  }
  if (!matter.ok) {
    if (matter.ambiguous) {
      return (
        <div className="cl-body" style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px" }}>
          <h1 style={{ fontSize: 20 }}>Which matter is this call for?</h1>
          <p className="muted">{lead.claimant_name || "This file"} has more than one matter. Pick the one you are working so the answers, the agreement and the status all land on it.</p>
          {(matter.candidates ?? []).map((c) => (
            <a key={c.id} className="cl-btn" style={{ display: "block", margin: "8px 0" }} href={`/app/${leadKeyOf(lead)}?claim=${c.id}`}>
              {c.campaign || c.claim_type || "Matter"}{c.status ? ` (${c.status})` : ""}
            </a>
          ))}
        </div>
      );
    }
    notFound();
  }
  const claim = matter.claim;
  if (me.role !== "owner" && (claim.campaign_id !== lead.campaign_id || claim.firm_id !== lead.firm_id)) notFound();
  if (claim.claim_type !== "mva") redirect(`/leads/${leadKeyOf(lead)}?claim=${claim.id}`);
  if (lead.archived_at) redirect(`/leads/${leadKeyOf(lead)}?claim=${claim.id}`);
  const singleMatter = matter.sole;
  const campaignId = claim.campaign_id ?? (singleMatter ? lead.campaign_id : null);
  try { await authoritativeDb.from("leads").update({ first_opened_at: new Date().toISOString(), first_opened_by: user.id }).eq("id", lead.id).is("first_opened_at", null); } catch {}

  const [{ data: firm }, liveRes, mainRes, reasonsRes, dqRes, ownersRes, tplRes, campRes, extraRes, lastRes, routeRes, signedDispoRes] = await Promise.all([
    sb.from("firms").select("name, slug").eq("id", lead.firm_id).maybeSingle(),
    // Pick up this agent's own open call on this file only if it was touched in
    // the last 30 minutes (a refresh, a dropped signal). Anything older is a new
    // call with a fresh clock; its answers still carry over below.
    sb.from("intake_calls").select("id, answers, created_at").eq("lead_id", lead.id).eq("agent_id", me.id).eq("status", "live")
      .or(matterRowsFilter(matter))
      .gte("updated_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    getMatterAgreement(sb, lead, matter),
    sb.from("call_dispo_reasons").select("dispo, key, label, sort").eq("active", true).order("sort"),
    sb.from("dq_reasons").select("key, label, active").in("key", MVA_DQ_KEYS),
    sb.from("app_users").select("full_name, email").eq("role", "owner").eq("active", true),
    sb.from("esign_templates").select("key").eq("campaign_id", campaignId ?? "00000000-0000-0000-0000-000000000000").eq("provider", "docuseal"),
    sb.from("campaigns").select("ssn_require_full").eq("id", campaignId ?? "00000000-0000-0000-0000-000000000000").maybeSingle(),
    // What the marketer sent. vendor_fields arrives with migration 0098; until
    // then the retry below reads the rest without it.
    sb.from("leads").select("case_description, marketing_source, lawruler_ref_no, vendor_fields").eq("id", lead.id).maybeSingle(),
    sb.from("intake_calls").select("answers").eq("lead_id", lead.id).or(matterRowsFilter(matter)).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // Firm lines for a 3-way: routing rules on this firm with a transfer number.
    sb.from("routing_rules").select("destination_name, transfer_number, case_type").eq("firm_id", lead.firm_id).eq("active", true).not("transfer_number", "is", null),
    sb.from("intake_calls").select("id").eq("lead_id", lead.id).eq("claim_id", claim.id).eq("agent_id", me.id)
      .eq("disposition", "signed").not("ended_at", "is", null).order("ended_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const threeWay = (routeRes.data ?? [])
    .filter((r: any) => !r.case_type || r.case_type === claim.claim_type)
    .map((r: any) => ({ label: r.destination_name || "Firm line", number: String(r.transfer_number) }));
  if (signedDispoRes.error) throw new Error("Could not check whether this signed call already reached the final handoff. Refresh before continuing.");
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

  // The last saved answers for THIS matter, when this is a fresh call on an
  // old file: the answers autosave filed on the pinned claim; a single-matter
  // legacy file falls back to its latest call.
  const canonical = (claim.answers as any)?.mva_call;
  let saved: any = canonical && typeof canonical === "object" && !Array.isArray(canonical) ? canonical : (liveRes.data?.answers ?? null);
  if (!saved) {
    const own = (claim.answers as any)?.mva_call;
    const last = own && typeof own === "object" && Object.keys(own).length ? own : (singleMatter ? lastRes.data?.answers : null);
    saved = last && Object.keys(last).length ? { ...last } : null;
  }
  // A passenger's first call opens with the SHARED crash facts from the call
  // that opened their file — the date, the city, whether police came. Fault,
  // injuries, representation and everything personal start blank: that is
  // THEIR intake (Astra round 6: the driver's at-fault answer was copied
  // onto the passenger as their own).
  if (!saved && paxParentId(lead.external_id)) {
    const { data: origin } = await sb.from("esign_submissions").select("call_id").eq("lead_id", lead.id).or(matterRowsFilter(matter))
      .not("pax_index", "is", null).not("call_id", "is", null).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (origin?.call_id) {
      const { data: pc } = await sb.from("intake_calls").select("answers").eq("id", origin.call_id).maybeSingle();
      const shared = sharedCrashFacts((pc?.answers as any)?.story);
      if (shared) saved = { phase: "open", story: { ...shared, seat: "Passenger" } };
    }
  }
  // First call on a marketer lead: pre-pick what the lead already says.
  if (!saved && singleMatter) {
    const pre = prefillFromStory(story);
    if (pre) saved = { phase: "open", ...pre };
  }
  // The home address on the record, one line. Cell, email and home address
  // are hard-mapped to the record on every screen (Brett, Sep 28); the
  // console binds to these, never to an old call's copy.
  const onFile = (lead as any).mail_city || (lead as any).mail_state
    ? joinUsAddress({ street: (lead as any).mail_addr1, city: (lead as any).mail_city, state: (lead as any).mail_state, zip: (lead as any).mail_zip })
    : String((lead as any).mail_addr1 || "").trim();
  // Other files on this same wreck (the driver's, other passengers'), shown on
  // the caller card so "how's Niko doing?" is right there.
  const linked = await linkedFilesFor(sb, lead as any);

  const pax: Record<string, string> = {};
  if (liveRes.data?.id) {
    const { data: prows } = await sb.from("esign_submissions").select("pax_index, status").eq("call_id", liveRes.data.id).not("pax_index", "is", null).neq("status", "voided").order("created_at", { ascending: true });
    for (const r of prows ?? []) pax[String(r.pax_index)] = r.status === "completed" ? "signed" : r.status;
  }

  const byDispo = (code: "esign" | "callback" | "ni"): Reason[] => {
    if (reasonsRes.error || !reasonsRes.data?.length) return DEFAULT_CALL_REASONS[code];
    return reasonsRes.data.filter((r: any) => r.dispo === code).map((r: any) => ({ key: r.key, label: r.label }));
  };
  const dqRows = (dqRes.data ?? []).filter((r: any) => r.active);
  const dq: Reason[] = MVA_DQ_KEYS.map((k) => dqRows.find((r: any) => r.key === k)).filter(Boolean).map((r: any) => ({ key: r.key, label: r.label }));

  if (!mainRes.ok) throw new Error(mainRes.error);
  const emergency = await getMatterEmergency(sb, lead, matter);
  if (!emergency.ok) throw new Error(emergency.error);
  const mainStatus = mainRes.row?.status;
  const from = process.env.JUSTCALL_DEFAULT_FROM || "";
  if (tplRes.error) throw new Error('Could not read agreement templates. Refresh before sending.');
  const rehearsal = rehearsalTemplates(tplRes.data ?? [], lead);

  return (
    <>
    <CanonicalUrl path={`/app/${leadKeyOf(lead)}`} />
    {rehearsal.rehearsal ? <p role="status" style={{ padding: 14, background: '#fff8db' }}><strong>NONBINDING TEST FILE.</strong> This file uses dummy signing documents and approved test contacts only.</p>
      : me.role === 'owner' && campaignId && syntheticName(lead.claimant_name) && !paxParentId(lead.external_id) ? <RehearsalSetup leadId={lead.id} campaignId={campaignId} active={false} /> : null}
    <CallConsole init={{
      leadId: lead.id,
      claimId: claim.id,
      callId: liveRes.data?.id ?? signedDispoRes.data?.id ?? null,
      signedDispoDone: !!signedDispoRes.data && !liveRes.data,
      baseAnswers: saved || {},
      agreementId: mainRes.row?.id ?? null,
      emergency: emergency.row ? { needsResign: emergencySupersedes(mainRes.row, emergency.row), status: emergency.row.status } : null,
      openText: text === "1",
      openReview: !!review,
      canPreview: !!packetsFor(firm?.slug, claim.claim_type),
      ssnRequireFull: campRes?.data?.ssn_require_full === true,
      threeWay,
      linked,
      startedAt: liveRes.data?.created_at ? Date.parse(liveRes.data.created_at) : Date.now(),
      props: {
        callerName: lead.claimant_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "",
        callerPhone: lead.phone || "",
        callerEmail: lead.email || "",
        homeAddress: onFile,
        campaign: claim.campaign || (singleMatter ? lead.campaign : "") || "",
        leadNo: lead.lead_no || "",
        agentName: me.full_name || "",
        agentRole: me.role,
        firmSpoken: firmSpoken(firm?.name),
        textFrom: from ? fmtPhone(from) : "",
        saved,
        canHear: canHearRecordings(me.role),
        showFees: firm?.slug === "tmp" && claim.claim_type === "mva",
        lead: leadCard.from || leadCard.said || leadCard.tags.length ? leadCard : null,
        reasons: { esign: byDispo("esign"), callback: byDispo("callback"), ni: byDispo("ni"), dq },
        notifyDefaults: (ownersRes.data ?? []).filter((o: any) => o.email).map((o: any) => ({ who: o.full_name || o.email, how: o.email })),
        esign: {
          status: !mainStatus ? "ready" : mainStatus === "completed" ? "signed" : ["failed", "declined", "expired", "voided"].includes(mainStatus) ? "ready" : mainStatus,
          configured: docusealConfigured() && rehearsal.templates.length > 0,
          templateKeys: rehearsal.templates.map((t: any) => String(t.key)),
          templateKey: mainRes.row?.template_key ?? null,
          pax,
        },
      },
    }} />
    </>
  );
}
