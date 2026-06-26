export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import BoardCard from "@/components/BoardCard";
import QuoteBanner from "@/components/QuoteBanner";

export default async function Dashboard() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role, full_name").eq("id", user!.id).maybeSingle();
  const role = me?.role ?? "agent";

  // Counters
  const { count: newLeads } = await sb.from("leads").select("id", { count: "exact", head: true });
  const { count: openClaims } = await sb.from("claims").select("id", { count: "exact", head: true })
    .in("status", ["new", "contact_attempted", "in_progress"]);

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
    .in("status", ["new", "contact_attempted"]).lt("updated_at", dayAgo).limit(10);

  const attention: { icon: string; title: string; sub: string; lead_id: string }[] = [];
  for (const c of flagged ?? []) attention.push({
    icon: "⚑", title: `Supervisor flag — ${(c as any).leads?.claimant_name ?? "claim"}`,
    sub: `${c.campaign ?? "claim"} flagged for review.`, lead_id: c.lead_id,
  });
  for (const c of idle ?? []) attention.push({
    icon: "⏳", title: `Idle over 24h — ${(c as any).leads?.claimant_name ?? "claim"}`,
    sub: `Still ${c.status.replace("_", " ")}, no movement in a day.`, lead_id: c.lead_id,
  });

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

      <div className="dash-grid six">
        {kpis.map((k) => (
          <div key={k.l} className="kpi"><div className="kv">{k.v}</div><div className="kl">{k.l}</div><div className="ksub">{k.sub}</div></div>
        ))}
      </div>

      <div className="dash-cols">
        <div>
          {(boards ?? []).map((b) => (
            <BoardCard key={b.id} board={b} posts={byBoard[b.id] ?? []} canPost={b.post_roles.includes(role)} />
          ))}
        </div>
        <div>
          <QuoteBanner />
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
