export const runtime = "edge";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { computeAlerts, type Alert } from "@/lib/alerts";
import { resolveStatus } from "@/lib/statuses";
import { caseName, prettyPhone } from "@/lib/case-name";
import HomeView, { type HomeData } from "@/components/home/HomeView";
import { caseFileHref } from "@/lib/mva-call/links";

// Days, "today" and the greeting follow the office clock, not the server's.
const TZ = "America/Chicago";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const WHY: Record<Alert["kind"], string> = {
  no_contact: "No contact yet",
  qa_stuck: "Stuck in QA",
  signed_unreviewed: "Signed, not reviewed",
  stage_stale: "No movement",
};

export default async function Dashboard() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  const { data: me } = await sb.from("app_users").select("role, full_name").eq("id", user!.id).maybeSingle();
  const role = me?.role ?? "agent";
  const pilot = role !== "owner";
  const { data: pilotCampaigns } = pilot
    ? await sb.from("campaigns").select("id, firms(slug)").eq("name", "INNO MVA").eq("case_type", "mva").eq("active", true).limit(2)
    : { data: null };
  const matches = (pilotCampaigns ?? []).filter((c: any) => c.firms?.slug === "tmp");
  const pilotCampaignId = matches.length === 1 ? matches[0].id : "00000000-0000-0000-0000-000000000000";
  const scopeLead = (q: any) => pilot ? q.eq("campaign_id", pilotCampaignId) : q;
  const scopeClaim = (q: any) => pilot ? q.eq("campaign_id", pilotCampaignId) : q;

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000).toISOString();
  const twoDayAgo = new Date(now.getTime() - 2 * 86400000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const since = new Date(now.getTime() - 15 * 86400000).toISOString();

  // Everything below is independent, so it loads side by side.
  const [
    alerts,
    { count: openClaims },
    signedWeek,
    { data: created },
    { data: recent },
    { data: statuses },
    { data: boards },
    { data: bulletins },
    { data: flagged },
    { data: agingIntake },
    { data: highTier },
    { data: awaitingFirm },
  ] = await Promise.all([
    computeAlerts(sb).catch(() => [] as Alert[]),
    scopeClaim(sb.from("claims").select("id, leads!inner(archived_at)", { count: "exact", head: true }).is("leads.archived_at", null).in("status", ["new", "contacting"])),
    scopeLead(sb.from("leads").select("id", { count: "exact", head: true }).gte("signed_at", weekAgo).is("archived_at", null)),
    scopeLead(sb.from("leads").select("id, created_at").gte("created_at", since).is("archived_at", null).limit(5000)),
    scopeLead(sb.from("leads").select("id, lead_no, claimant_name, phone, case_type, updated_at, claims(id, status, campaign, campaign_id)")
      .is("archived_at", null).order("updated_at", { ascending: false }).limit(8)),
    sb.from("statuses").select("*").eq("active", true),
    pilot ? Promise.resolve({ data: [] }) : sb.from("boards").select("*").order("sort_order"),
    pilot ? Promise.resolve({ data: [] }) : sb.from("bulletins").select("*").order("created_at", { ascending: false }).limit(60),
    scopeClaim(sb.from("claims").select("id, lead_id, campaign, leads!inner(claimant_name, lead_no, archived_at)").is("leads.archived_at", null).eq("supervisor_flag", true).limit(10)),
    scopeClaim(sb.from("claims").select("id, lead_id, updated_at, leads!inner(claimant_name, lead_no, archived_at)")
      .is("leads.archived_at", null).in("status", ["new", "contacting"]).lt("updated_at", twoDayAgo).order("updated_at", { ascending: true }).limit(12)),
    scopeClaim(sb.from("claims").select("id, lead_id, tier, tier_letter, tier_number, leads!inner(claimant_name, lead_no, archived_at)")
      .is("leads.archived_at", null).in("tier_letter", ["A", "B"]).in("status", ["new", "contacting", "qa", "signed_qa", "approved"]).limit(12)),
    scopeClaim(sb.from("claims").select("id, lead_id, updated_at, leads!inner(claimant_name, lead_no, archived_at)")
      .is("leads.archived_at", null).in("status", ["approved", "signed_approved"]).lt("updated_at", dayAgo).order("updated_at", { ascending: true }).limit(12)),
  ]);

  const allowedAlertIds = new Set<string>();
  const alertClaimIds = new Map<string, string>();
  if (pilot) {
    const { data: allowed } = await sb.from("leads").select("id, claims(id, campaign_id)").eq("campaign_id", pilotCampaignId).is("archived_at", null).limit(1000);
    for (const row of allowed ?? []) {
      allowedAlertIds.add(row.id);
      const claims = (row.claims ?? []).filter((c: any) => c.campaign_id === pilotCampaignId);
      // A lead-level alert does not identify a sibling matter. Preserve an
      // exact sole match; otherwise let the Desk's matter chooser ask.
      if (claims.length === 1) alertClaimIds.set(row.id, claims[0].id);
    }
  }
  const visibleAlerts = pilot ? alerts.filter(a => allowedAlertIds.has(a.lead_id)) : alerts;

  // New leads per day for the last 14 office days.
  const perDay: Record<string, number> = {};
  for (const r of created ?? []) { const k = dayKey(new Date(r.created_at)); perDay[k] = (perDay[k] ?? 0) + 1; }
  const series: HomeData["series"] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    series.push({
      label: d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" }),
      n: perDay[dayKey(d)] ?? 0,
      today: i === 0,
    });
  }
  const newToday = series[13]?.n ?? 0;
  const newYesterday = series[12]?.n ?? 0;

  const leadKey = (l: any, id: string) => l?.lead_no || id;
  const nameOf = (l: any) => l?.claimant_name || "No name yet";
  const hrs = (ts?: string | null) => (ts ? Math.max(0, Math.round((now.getTime() - new Date(ts).getTime()) / 3600000)) : 0);
  const waited = (ts?: string | null) => { const h = hrs(ts); return h >= 48 ? `${Math.round(h / 24)} days` : `${h}h`; };

  const needs: HomeData["needs"] = [
    ...(flagged ?? []).map((c: any) => ({ key: leadKey(c.leads, c.lead_id), href: caseFileHref(role, leadKey(c.leads, c.lead_id), c.id), name: nameOf(c.leads), why: "Flagged for a supervisor", tone: "bad" as const })),
    ...visibleAlerts.map((a) => {
      const name = String(a.title || "").split(/\s+[—-]\s+/).slice(1).join(" ") || a.lead_no || "File";
      return { key: a.lead_no || a.lead_id, href: caseFileHref(role, a.lead_no || a.lead_id, alertClaimIds.get(a.lead_id)), name, why: `${WHY[a.kind] ?? "Needs a look"}, ${a.hours >= 48 ? `${Math.round(a.hours / 24)} days` : `${a.hours}h`}`, tone: a.severity === "bad" ? "bad" as const : "warn" as const };
    }),
  ];

  const folds: HomeData["folds"] = [
    { id: "aging", title: "Waiting 2+ days for a first call", sub: "New or being contacted, nothing has moved",
      rows: (agingIntake ?? []).map((c: any) => ({ key: leadKey(c.leads, c.lead_id), href: caseFileHref(role, leadKey(c.leads, c.lead_id), c.id), name: nameOf(c.leads), right: waited(c.updated_at) })) },
    { id: "tier", title: "High tier, still open", sub: "Tier A and B files that are not signed yet",
      rows: (highTier ?? []).map((c: any) => ({ key: leadKey(c.leads, c.lead_id), href: caseFileHref(role, leadKey(c.leads, c.lead_id), c.id), name: nameOf(c.leads), right: c.tier || [c.tier_letter, c.tier_number].filter(Boolean).join("") })) },
    { id: "firm", title: "Qualified, waiting on the firm", sub: "Approved more than a day ago",
      rows: (awaitingFirm ?? []).map((c: any) => ({ key: leadKey(c.leads, c.lead_id), href: caseFileHref(role, leadKey(c.leads, c.lead_id), c.id), name: nameOf(c.leads), right: waited(c.updated_at) })) },
  ];

  const recentRows: HomeData["recent"] = (recent ?? []).map((l: any) => {
    const c = (l.claims ?? []).find((row: any) => !pilot || row.campaign_id === pilotCampaignId) ?? {};
    const def = resolveStatus(c.status || "new", (statuses ?? []) as any);
    return {
      key: l.lead_no || l.id,
      href: caseFileHref(role, l.lead_no || l.id, c.id),
      name: l.claimant_name || "No name yet",
      sub: [caseName(c.campaign, l.case_type), prettyPhone(l.phone), l.lead_no].filter(Boolean).join("   "),
      status: def.label,
      tone: def.tone,
      updated: l.updated_at,
    };
  });

  const byBoard: Record<string, any[]> = {};
  for (const b of bulletins ?? []) (byBoard[b.board_id] ||= []).push(b);

  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  const data: HomeData = {
    links: pilot ? { add: "/app?new=1", all: "/app", fresh: "/app?tab=new", open: "/app?tab=calling", signed: "/app?tab=signed" }
      : { add: "/intake", all: "/leads", fresh: "/leads", open: "/leads", signed: "/signed" },
    greeting: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening",
    first: (me?.full_name || "").split(" ")[0] || "",
    dateLabel: now.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }),
    kpis: { newToday, newYesterday, open: openClaims ?? 0, signed7: signedWeek.error ? 0 : (signedWeek.count ?? 0), needs: needs.length },
    series,
    needs,
    folds,
    recent: recentRows,
    boards: (boards ?? []).map((b: any) => ({
      id: b.id, title: b.title, description: b.description ?? null,
      canPost: Array.isArray(b.post_roles) && b.post_roles.includes(role),
      posts: byBoard[b.id] ?? [],
    })),
  };

  return <HomeView data={data} />;
}
