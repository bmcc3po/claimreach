export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import BoardCard from "@/components/BoardCard";

export default async function FirmHome() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("full_name, firm_id, role").eq("id", user!.id).maybeSingle();
  const { data: firm } = await sb.from("firms").select("name").eq("id", me!.firm_id).maybeSingle();

  // Shared bulletin boards (one team). Firm can post to firm-enabled boards.
  const { data: boards } = await sb.from("boards").select("*").order("sort_order");
  const { data: bulletins } = await sb.from("bulletins").select("*").order("created_at", { ascending: false }).limit(40);
  const byBoard: Record<string, any[]> = {};
  for (const b of bulletins ?? []) (byBoard[b.board_id] ||= []).push(b);

  // RLS scopes to the firm.
  const { data: leads } = await sb.from("leads")
    .select("id, lead_no, firm_ref_no, stage, updated_at, claims(status, stage, supervisor_flag)")
    .order("updated_at", { ascending: false }).limit(500);

  const all = leads ?? [];
  const now = Date.now();
  const daysAgo = (d: string) => (now - new Date(d).getTime()) / 86400000;

  // Counters
  const total = all.length;
  const intakeInProgress = all.filter((l) => (l.claims ?? []).some((c: any) => ["new","contact_attempted","in_progress"].includes(c.status))).length;
  const qualified = all.filter((l) => (l.claims ?? []).some((c: any) => c.status === "qualified")).length;
  const signed = all.filter((l) => (l.claims ?? []).some((c: any) => c.status === "signed")).length;

  // Holes in the boat
  const agingIntake = all.filter((l) => (l.claims ?? []).some((c: any) => ["new","contact_attempted","in_progress"].includes(c.status)) && daysAgo(l.updated_at) > 2);
  const flagged = all.filter((l) => (l.claims ?? []).some((c: any) => c.supervisor_flag));
  const awaitingFirm = all.filter((l) => (l.claims ?? []).some((c: any) => c.status === "qualified") && daysAgo(l.updated_at) > 1);

  const kpis = [
    { v: total, l: "Total cases", sub: "in your docket" },
    { v: intakeInProgress, l: "Intake in progress", sub: "being worked" },
    { v: qualified, l: "Qualified", sub: "ready for firm" },
    { v: signed, l: "Signed / retained", sub: "active" },
  ];

  const holes = [
    { n: agingIntake.length, label: "Aging intake (2+ days)", tone: "flag", items: agingIntake },
    { n: awaitingFirm.length, label: "Awaiting firm reach-out", tone: "danger", items: awaitingFirm },
    { n: flagged.length, label: "Flagged for attention", tone: "danger", items: flagged },
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 2px" }}>{firm?.name ?? "Firm"} command center</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </p>

      <div className="dash-grid">
        {kpis.map((k) => (
          <div key={k.l} className="kpi"><div className="kv">{k.v}</div><div className="kl">{k.l}</div><div className="ksub">{k.sub}</div></div>
        ))}
      </div>

      <div className="dash-cols">
        <div>
          <div className="board">
            <div className="board-h"><h3>Holes in the boat</h3>
              <Link href="/portal/cases" className="btn ghost sm" style={{ marginLeft: "auto" }}>All cases →</Link>
            </div>
            <div className="board-body">
              {holes.every((h) => h.n === 0) && <p className="muted">All clear. Nothing needs attention.</p>}
              {holes.filter((h) => h.n > 0).map((h) => (
                <div key={h.label} style={{ marginBottom: 14 }}>
                  <div className="row" style={{ marginBottom: 6 }}>
                    <span className={`badge ${h.tone}`}>{h.n}</span>
                    <strong style={{ fontSize: 14 }}>{h.label}</strong>
                  </div>
                  {h.items.slice(0, 5).map((l: any) => (
                    <Link key={l.id} href={`/portal/cases/${l.id}`} className="post" style={{ display: "flex", gap: 10, textDecoration: "none", color: "inherit" }}>
                      <span style={{ fontWeight: 600 }}>{l.lead_no}</span>
                      <span className="muted">{l.firm_ref_no ?? "no ref"}</span>
                      <span className="spacer" />
                      <span className="muted" style={{ fontSize: 12 }}>{Math.floor(daysAgo(l.updated_at))}d</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="board">
            <div className="board-h"><h3>Quick links</h3></div>
            <div className="board-body">
              <div className="post"><Link href="/portal/cases">View all cases →</Link></div>
              <div className="post"><Link href="/portal/reports">Open reports →</Link></div>
              <div className="post"><Link href="/portal/resources">Local resources →</Link></div>
              <div className="post"><Link href="/portal/sop">Crisis SOP →</Link></div>
            </div>
          </div>
          {(boards ?? []).map((b) => (
            <BoardCard key={b.id} board={b} posts={byBoard[b.id] ?? []} canPost={b.post_roles.includes(me!.role)} />
          ))}
        </div>
      </div>
    </div>
  );
}
