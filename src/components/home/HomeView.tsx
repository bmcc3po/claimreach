"use client";
// Home for the office. One question per panel: what needs me, what is
// slipping, what just moved, how the pipe looks, and what the team posted.
// Every row is a link to the file. Sections fold and remember it.
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { ago } from "@/lib/case-name";

export type Tone = "good" | "bad" | "warn" | "info" | "neut";
export interface HomeData {
  greeting: string;
  first: string;
  dateLabel: string;
  kpis: { newToday: number; newYesterday: number; open: number; signed7: number; needs: number };
  series: { label: string; n: number; today: boolean }[];
  needs: { key: string; name: string; why: string; tone: "bad" | "warn" }[];
  folds: { id: string; title: string; sub: string; rows: { key: string; name: string; right: string }[] }[];
  recent: { key: string; name: string; sub: string; status: string; tone: Tone; updated: string }[];
  boards: { id: string; title: string; description: string | null; canPost: boolean; posts: { title?: string | null; body: string; author_name?: string | null; created_at: string }[] }[];
}

function useFold(key: string, openByDefault = true): [boolean, () => void] {
  const [open, setOpen] = useState(openByDefault);
  useEffect(() => {
    try { const v = localStorage.getItem("cr-fold:" + key); if (v === "0" || v === "1") setOpen(v === "1"); } catch { /* ignore */ }
  }, [key]);
  const toggle = () => setOpen((o) => { try { localStorage.setItem("cr-fold:" + key, o ? "0" : "1"); } catch { /* ignore */ } return !o; });
  return [open, toggle];
}

// Relative times are worked out in the browser, after the first paint, so the
// server and the browser never disagree about "3m ago".
function Ago({ ts }: { ts: string }) {
  const [txt, setTxt] = useState("");
  useEffect(() => { setTxt(ago(ts)); const t = setInterval(() => setTxt(ago(ts)), 60000); return () => clearInterval(t); }, [ts]);
  return <span>{txt}</span>;
}

export default function HomeView({ data }: { data: HomeData }) {
  const k = data.kpis;
  const total14 = data.series.reduce((a, b) => a + b.n, 0);
  return (
    <div>
      <div className="cl-head">
        <div>
          <h1 className="cl-h1">{data.greeting}{data.first ? `, ${data.first}` : ""}</h1>
          <p className="cl-lede">{data.dateLabel}. {k.needs ? `${k.needs} ${k.needs === 1 ? "file needs" : "files need"} you.` : "Nothing is slipping."} {k.newToday ? `${k.newToday} new ${k.newToday === 1 ? "lead" : "leads"} today.` : ""}</p>
        </div>
        <div className="cl-acts">
          <a className="cl-btn" href="/intake"><Icon name="userplus" size={16} />Add lead</a>
          <a className="cl-btn" href="/leads"><Icon name="files" size={16} />All leads</a>
        </div>
      </div>

      <section className="cl-panel" aria-label="Today at a glance">
        <div className="cl-kpis">
          <a className="cl-kpi" href="/leads">
            <span className="cl-kpi-l">New today</span>
            <span className="cl-kpi-v">{k.newToday}</span>
            <span className="cl-kpi-f">{k.newYesterday} yesterday</span>
          </a>
          <a className="cl-kpi" href="/leads">
            <span className="cl-kpi-l">Open files</span>
            <span className="cl-kpi-v">{k.open}</span>
            <span className="cl-kpi-f">New or being contacted</span>
          </a>
          <a className="cl-kpi" href="/signed">
            <span className="cl-kpi-l">Signed, last 7 days</span>
            <span className="cl-kpi-v">{k.signed7}</span>
            <span className="cl-kpi-f">Clients, not leads</span>
          </a>
          <a className="cl-kpi" href="#needs">
            <span className="cl-kpi-l">{k.needs > 0 && <span className="cl-dot cl-bad" />}Needs you</span>
            <span className="cl-kpi-v">{k.needs}</span>
            <span className="cl-kpi-f">{k.needs ? "Past a deadline" : "All clear"}</span>
          </a>
        </div>
      </section>

      <div className="cl-grid">
        <div className="cl-col">
          <NeedsPanel rows={data.needs} />
          <SlippingPanel folds={data.folds} />
          <RecentPanel rows={data.recent} />
        </div>
        <div className="cl-col">
          <section className="cl-panel" aria-label="New leads, last 14 days">
            <div className="cl-ph"><span className="cl-ph-t">New leads</span><span className="cl-ph-r"><span className="cl-t2">Last 14 days</span></span></div>
            <div className="cl-chart">
              <div className="cl-chart-sum"><b>{total14}</b><span>in 14 days, {Math.round((total14 / 14) * 10) / 10} a day</span></div>
              <Bars series={data.series} />
              <div className="cl-chart-x"><span>{data.series[0]?.label}</span><span>Today</span></div>
            </div>
          </section>
          {data.boards.map((b) => <BoardPanel key={b.id} board={b} />)}
        </div>
      </div>
    </div>
  );
}

/** A panel heading that folds the panel. Anything on the right stays clickable on its own. */
export function PanelHead({ open, toggle, title, count, right }: { open: boolean; toggle: () => void; title: string; count?: number; right?: React.ReactNode }) {
  return (
    <div className="cl-ph">
      <button className="cl-ph-tog" onClick={toggle} aria-expanded={open}>
        <span className="cl-chev"><Icon name="chevron" size={16} /></span>
        <span className="cl-ph-t">{title}</span>
        {typeof count === "number" && <span className="cl-n">{count}</span>}
      </button>
      {right && <span className="cl-ph-r">{right}</span>}
    </div>
  );
}

function NeedsPanel({ rows }: { rows: HomeData["needs"] }) {
  const [open, toggle] = useFold("home-needs");
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section id="needs" className={`cl-panel${open ? "" : " cl-closed"}`}>
      <PanelHead open={open} toggle={toggle} title="Needs you" count={rows.length} right={<span className="cl-t2">Worst first</span>} />
      {open && (
        <div>
          {rows.length === 0 && <div className="cl-empty"><b>All clear</b>Every file is inside its deadline.</div>}
          {shown.map((r, i) => (
            <a key={r.key + i} className="cl-row" href={`/leads/${encodeURIComponent(r.key)}`}>
              <span className={`cl-dot cl-${r.tone}`} />
              <span className="cl-row-m"><span className="cl-t1">{r.name}</span><span className="cl-t2">{r.why}</span></span>
              <span className="cl-row-r"><span className="cl-mono">{r.key}</span><span className="cl-go"><Icon name="right" size={16} /></span></span>
            </a>
          ))}
          {rows.length > 6 && <div className="cl-more-row"><button className="cl-link" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button></div>}
        </div>
      )}
    </section>
  );
}

function SlippingPanel({ folds }: { folds: HomeData["folds"] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="cl-panel" aria-label="Slipping">
      <div className="cl-ph"><span className="cl-ph-t">Slipping</span><span className="cl-ph-r"><span className="cl-t2">Click a line to see the files</span></span></div>
      {folds.map((f) => {
        const on = openId === f.id && f.rows.length > 0;
        return (
          <div key={f.id} className="cl-fold">
            <button className="cl-fold-h" onClick={() => setOpenId(on ? null : f.id)} aria-expanded={on} disabled={!f.rows.length}>
              <span className={`cl-chev${on ? "" : " cl-closed"}`} style={{ visibility: f.rows.length ? "visible" : "hidden" }}><Icon name="chevron" size={16} /></span>
              <span className="cl-fold-t">{f.title}<span className="cl-fold-s">{f.sub}</span></span>
              <span className={`cl-fold-n${f.rows.length ? "" : " cl-zero"}`}>{f.rows.length}</span>
            </button>
            {on && (
              <div className="cl-fold-b">
                {f.rows.map((r, i) => (
                  <a key={r.key + i} className="cl-row" href={`/leads/${encodeURIComponent(r.key)}`}>
                    <span className="cl-row-m"><span className="cl-t1">{r.name}</span></span>
                    <span className="cl-row-r"><span>{r.right}</span><span className="cl-mono">{r.key}</span><span className="cl-go"><Icon name="right" size={16} /></span></span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function RecentPanel({ rows }: { rows: HomeData["recent"] }) {
  const [open, toggle] = useFold("home-recent");
  return (
    <section className={`cl-panel${open ? "" : " cl-closed"}`}>
      <PanelHead open={open} toggle={toggle} title="Just moved" right={<a className="cl-link" href="/leads">All leads</a>} />
      {open && (
        <div>
          {rows.length === 0 && <div className="cl-empty">No files yet.</div>}
          {rows.map((r) => (
            <a key={r.key} className="cl-row" href={`/leads/${encodeURIComponent(r.key)}`}>
              <span className="cl-row-m"><span className="cl-t1">{r.name}</span><span className="cl-t2">{r.sub}</span></span>
              <span className="cl-row-r">
                <span className="cl-status" style={{ minWidth: 150 }}><span className={`cl-dot cl-${r.tone}`} />{r.status}</span>
                <span style={{ minWidth: 64, textAlign: "right" }}><Ago ts={r.updated} /></span>
                <span className="cl-go"><Icon name="right" size={16} /></span>
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function Bars({ series }: { series: HomeData["series"] }) {
  const max = Math.max(1, ...series.map((s) => s.n));
  const w = 100 / Math.max(1, series.length);
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={series.map((s) => `${s.label}: ${s.n}`).join(", ")}>
      {series.map((s, i) => {
        const h = s.n ? Math.max(2, (s.n / max) * 38) : 0.8;
        return (
          <rect key={i} x={i * w + w * 0.18} y={40 - h} width={w * 0.64} height={h} rx={0.9}
            fill={s.today ? "var(--cl-gold)" : s.n ? "var(--cl-bar-hi)" : "var(--cl-bar)"} opacity={s.today || !s.n ? 1 : 0.82}>
            <title>{`${s.label}: ${s.n}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function BoardPanel({ board }: { board: HomeData["boards"][number] }) {
  const [open, toggle] = useFold("board-" + board.id);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [list, setList] = useState(board.posts);
  const [all, setAll] = useState(false);

  async function post() {
    if (!body.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/bulletins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ board_id: board.id, title, body }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || "That did not post. Try again."); return; }
      setList((l) => [{ title, body, author_name: "You", created_at: new Date().toISOString() }, ...l]);
      setBody(""); setTitle(""); setWriting(false);
    } catch { setErr("That did not post. Check the connection and try again."); }
    finally { setBusy(false); }
  }
  const shown = all ? list : list.slice(0, 3);
  return (
    <section className={`cl-panel${open ? "" : " cl-closed"}`}>
      <PanelHead open={open} toggle={toggle} title={board.title} count={list.length}
        right={board.canPost && open ? <button className="cl-link" onClick={() => setWriting((w) => !w)}>{writing ? "Cancel" : "Post"}</button> : null} />
      {open && (
        <div>
          {writing && (
            <div className="cl-compose">
              <input className="cl-input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className="cl-area" rows={3} placeholder="Write a post" value={body} onChange={(e) => setBody(e.target.value)} />
              {err && <div className="cl-t2 cl-tone-bad" style={{ whiteSpace: "normal" }}>{err}</div>}
              <div className="cl-acts"><button className="cl-btn cl-gold cl-sm" onClick={post} disabled={busy || !body.trim()}>{busy ? "Posting" : "Post"}</button></div>
            </div>
          )}
          {list.length === 0 && <div className="cl-empty">Nothing posted yet.</div>}
          {shown.map((p, i) => (
            <div key={i} className="cl-post">
              {p.title && <div className="cl-post-t">{p.title}</div>}
              <div className="cl-post-b">{p.body}</div>
              <div className="cl-post-m">{p.author_name ?? "Staff"}, <Ago ts={p.created_at} /></div>
            </div>
          ))}
          {list.length > 3 && <div className="cl-more-row"><button className="cl-link" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${list.length}`}</button></div>}
        </div>
      )}
    </section>
  );
}
