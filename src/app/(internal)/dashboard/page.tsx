export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import BoardCard from "@/components/BoardCard";
import DailyRail from "@/components/DailyRail";
import { computeAlerts } from "@/lib/alerts";

export default async function Dashboard() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role, full_name").eq("id", user!.id).maybeSingle();
  const role = me?.role ?? "agent";

  // SLA alerts (dragging files) — only for internal roles.
  const alerts = role === "firm" ? [] : await computeAlerts();

  // Counters (new status model: pre-QA intake statuses).
  const { count: newLeads } = await sb.from("leads").select("id", { count: "exact", head: true });
  const { count: openClaims } = await sb.from("claims").select("id", { count: "exact", head: true })
    .in("status", ["new", "contacting"]);

  // Boards + posts
  const { data: boards } = await sb.from("boards").select("*").order("sort_order");
  const { data: bulletins } = await sb.from("bulletins").select("*").order("created_at", { ascending: false }).limit(60);
  const byBoard: Record<string, any[]> = {};
  for (const b of bulletins ?? []) (byBoard[b.board_id] ||= []).push(b);

  // Needs Attention feed — supervisor-flagged claims + stale in-progress.
  const { data: flagged } = await sb.from("claims")
    .select("id, lead_id, campaign, supervisor_flag, status, updated_at, leads(claimant_name)")
    .eq("supervisor_flag", true).limit(10);
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: idle } = await sb.from("claims")
    .select("id, lead_id, campaign, status, updated_at, leads(claimant_name)")
    .in("status", ["new", "contacting"]).lt("updated_at", dayAgo).limit(10);

  const attention: { icon: string; title: string; sub: string; lead_id: string }[] = [];
  for (const c of flagged ?? []) attention.push({
    icon: "⚑", title: `Supervisor flag — ${(c as any).leads?.claimant_name ?? "claim"}`,
    sub: `${c.campaign ?? "claim"} flagged for review.`, lead_id: c.lead_id,
  });
  for (const c of idle ?? []) attention.push({
    icon: "⏳", title: `Idle over 24h — ${(c as any).leads?.claimant_name ?? "claim"}`,
    sub: `Still ${c.status.replace("_", " ")}, no movement in a day.`, lead_id: c.lead_id,
  });

  // Holes in the boat (the four priorities): aging intake, high-tier needing
  // action, aging at any stage, qualified-but-firm-hasn't-reached-out.
  const twoDayAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  const { data: agingIntake } = await sb.from("claims")
    .select("lead_id, status, updated_at, leads(claimant_name, lead_no)")
    .in("status", ["new", "contacting"]).lt("updated_at", twoDayAgo).limit(12);
  const { data: highTier } = await sb.from("claims")
    .select("lead_id, tier, tier_letter, tier_number, status, leads(claimant_name, lead_no)")
    .in("tier_letter", ["A", "B"]).in("status", ["new", "contacting", "qa", "signed_qa", "approved"]).limit(12);
  const { data: awaitingFirm } = await sb.from("claims")
    .select("lead_id, status, updated_at, leads(claimant_name, lead_no)")
    .in("status", ["approved", "signed_approved"]).lt("updated_at", new Date(Date.now() - 86400000).toISOString()).limit(12);

  const holes = [
    { n: (agingIntake ?? []).length, label: "Aging intake (2+ days)", tone: "flag", items: agingIntake ?? [] },
    { n: (highTier ?? []).length, label: "High-tier needing action", tone: "danger", items: highTier ?? [] },
    { n: (awaitingFirm ?? []).length, label: "Qualified, awaiting firm", tone: "danger", items: awaitingFirm ?? [] },
  ];

  const kpis = [
    { v: newLeads ?? 0, l: "New leads", sub: "in pipeline" },
    { v: openClaims ?? 0, l: "Waiting to complete", sub: "active claims" },
    { v: "4:12", l: "Avg call time", sub: "this week" },
    { v: "31%", l: "Success rate", sub: "signed / reached" },
    { v: 0, l: "Upcoming callbacks", sub: "scheduled" },
    { v: "8.4%", l: "Pickup rate", sub: "human answers" },
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 4px" }}>Welcome back{me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      <DailyRail />

      {alerts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Needs attention now</h3>
            <span className="badge dq" style={{ marginLeft: 8 }}>{alerts.length}</span>
          </div>
          <div className="alert-grid">
            {alerts.slice(0, 12).map((a, i) => (
              <a key={i} href={`/leads/${a.lead_id}`} className={`alert-card ${a.severity}`}>
                <div className="alert-title">{a.title}</div>
                <div className="alert-sub">{a.sub}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="dash-grid six">
        {kpis.map((k) => (
          <div key={k.l} className="kpi"><div className="kv">{k.v}</div><div className="kl">{k.l}</div><div className="ksub">{k.sub}</div></div>
        ))}
      </div>

      <div className="board" style={{ marginBottom: 16 }}>
        <div className="board-h"><h3>Holes in the boat</h3>
          <a href="/leads" className="btn ghost sm" style={{ marginLeft: "auto" }}>All leads →</a>
        </div>
        <div className="board-body">
          {holes.every((h) => h.n === 0) && <p className="muted">All clear. Nothing slipping.</p>}
          <div className="holes-grid">
            {holes.filter((h) => h.n > 0).map((h) => (
              <div key={h.label} className="hole-col">
                <div className="row" style={{ marginBottom: 8 }}>
                  <span className={`badge ${h.tone}`}>{h.n}</span>
                  <strong style={{ fontSize: 13.5 }}>{h.label}</strong>
                </div>
                {h.items.slice(0, 5).map((c: any, i: number) => (
                  <a key={i} href={`/leads/${c.lead_id}`} className="post" style={{ display: "flex", gap: 8, textDecoration: "none", color: "inherit", padding: "6px 0" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.leads?.lead_no ?? "—"}</span>
                    <span className="muted" style={{ fontSize: 13 }}>{c.leads?.claimant_name ?? "—"}</span>
                    {c.tier && <span className="spacer" />}
                    {c.tier && <span className="badge gold" style={{ fontSize: 10 }}>{c.tier}</span>}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-cols">
        <div>
          {(boards ?? []).map((b) => (
            <BoardCard key={b.id} board={b} posts={byBoard[b.id] ?? []} canPost={b.post_roles.includes(role)} />
          ))}
        </div>
        <div>
          <div className="board">
            <div className="board-h"><h3>Needs attention</h3>
              {attention.length > 0 && <span className="badge dq" style={{ marginLeft: "auto" }}>{attention.length}</span>}
            </div>
            <div className="board-body">
              {attention.length === 0 && <p className="muted">All clear. Nothing flagged.</p>}
              {attention.map((a, i) => (
                <a key={i} href={`/leads/${a.lead_id}`} className="post" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                  <strong>{a.icon} {a.title}</strong>
                  <div className="pmeta">{a.sub}</div>
                </a>
              ))}
            </div>
          </div>
          <div className="board">
            <div className="board-h"><h3>Quick links</h3></div>
            <div className="board-body">
              <div className="post"><a href="/leads">View all leads →</a></div>
              <div className="post"><a href="/intake">Add a new lead →</a></div>
              <div className="post"><a href="/maverick">Open Grievous →</a></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
