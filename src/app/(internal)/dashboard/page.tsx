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

  const kpis = [
    { v: newLeads ?? 0, l: "New leads" },
    { v: openClaims ?? 0, l: "Waiting to complete" },
    { v: 0, l: "Upcoming callbacks" },
    { v: 0, l: "Open flags" },
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 4px" }}>Welcome back{me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>

      <div className="dash-grid">
        {kpis.map((k) => (
          <div key={k.l} className="kpi"><div className="kv">{k.v}</div><div className="kl">{k.l}</div></div>
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
