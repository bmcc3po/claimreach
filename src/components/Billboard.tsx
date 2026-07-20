"use client";
import { useEffect, useState, useCallback } from "react";

// ============================================================================
// THE BILLBOARD. A wall display, read from across the room. Two 72-hour
// promises, live: files signed and racing to the firm, and e-signs sent that
// need a callback before they die. Nothing hides. In your face.
// ============================================================================

interface Clock {
  lead_id: string; lead_no: string; name: string; campaign: string;
  kind: "esign_chase" | "delivery"; label: string; tone: "ok" | "warn" | "urgent" | "overdue";
  hoursLeft: number; countdownText: string; stuckStage?: string; dueAt: string;
}
interface Summary {
  delivery_total: number; delivery_due_soon: number; delivery_overdue: number;
  esign_total: number; esign_due_soon: number; esign_overdue: number;
}

const TONE: Record<string, { bg: string; text: string; dot: string; ring: string }> = {
  ok:      { bg: "rgba(34,197,94,.08)",  text: "#4ade80", dot: "#22c55e", ring: "rgba(34,197,94,.25)" },
  warn:    { bg: "rgba(245,183,49,.10)", text: "#fbbf24", dot: "#f5b731", ring: "rgba(245,183,49,.30)" },
  urgent:  { bg: "rgba(249,115,22,.12)", text: "#fb923c", dot: "#f97316", ring: "rgba(249,115,22,.35)" },
  overdue: { bg: "rgba(239,68,68,.14)",  text: "#f87171", dot: "#ef4444", ring: "rgba(239,68,68,.45)" },
};

export default function Billboard() {
  const [items, setItems] = useState<Clock[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/sla-clocks");
      const text = await r.text();
      const d = text ? JSON.parse(text) : {};
      if (r.ok) { setItems(d.items ?? []); setSummary(d.summary ?? null); }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 60_000); return () => clearInterval(i); }, [load]);
  // Re-render every 30s so countdowns tick down between fetches.
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 30_000); return () => clearInterval(i); }, []);

  const delivery = items.filter((i) => i.kind === "delivery");
  const esign = items.filter((i) => i.kind === "esign_chase");

  return (
    <div className="bb-root">
      <style>{css}</style>

      <header className="bb-head">
        <div className="bb-brand">
          <span className="bb-live"><span className="bb-live-dot" /> LIVE</span>
          <h1>Delivery Board</h1>
          <p>Every signed file, every e-sign, on the clock. Nothing hides.</p>
        </div>
        <div className="bb-stamp">{new Date().toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
      </header>

      {summary && (
        <div className="bb-stats">
          <Stat n={summary.delivery_total} label="Signed, in flight" tone="ok" />
          <Stat n={summary.delivery_due_soon} label="Due within 24h" tone="warn" />
          <Stat n={summary.delivery_overdue} label="Overdue to firm" tone="overdue" big />
          <div className="bb-stat-div" />
          <Stat n={summary.esign_total} label="E-signs waiting" tone="ok" />
          <Stat n={summary.esign_overdue} label="E-signs dying" tone="overdue" />
        </div>
      )}

      <div className="bb-cols">
        <Column title="Racing to the firm" subtitle="Signed → deliver within 72h" rows={delivery} empty="No signed files in flight." />
        <Column title="Get them back on the line" subtitle="E-sign sent → 72h or it's gone" rows={esign} empty="No e-signs waiting." />
      </div>

      {loaded && items.length === 0 && (
        <div className="bb-clear">All clear. Nothing on the clock right now.</div>
      )}
    </div>
  );
}

function Stat({ n, label, tone, big }: { n: number; label: string; tone: string; big?: boolean }) {
  const t = TONE[tone];
  return (
    <div className={`bb-stat ${big ? "big" : ""}`} style={{ borderColor: n > 0 && tone === "overdue" ? t.ring : "transparent" }}>
      <div className="bb-stat-n" style={{ color: n > 0 ? t.text : "rgba(255,255,255,.28)" }}>{n}</div>
      <div className="bb-stat-l">{label}</div>
    </div>
  );
}

function Column({ title, subtitle, rows, empty }: { title: string; subtitle: string; rows: Clock[]; empty: string }) {
  return (
    <section className="bb-col">
      <div className="bb-col-head">
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>
      <div className="bb-list">
        {rows.length === 0 ? <div className="bb-empty">{empty}</div> :
          rows.map((c) => {
            const t = TONE[c.tone];
            return (
              <a key={c.lead_id + c.kind} href={`/leads/${c.lead_id}`} className="bb-row" style={{ background: t.bg, boxShadow: `inset 3px 0 0 ${t.dot}` }}>
                <div className="bb-row-main">
                  <div className="bb-row-name">{c.name} <span className="bb-row-no">{c.lead_no}</span></div>
                  <div className="bb-row-sub">{c.campaign}{c.stuckStage ? ` · ${c.stuckStage}` : ""}</div>
                </div>
                <div className="bb-row-clock" style={{ color: t.text }}>
                  <span className="bb-cd">{c.countdownText}</span>
                  {c.tone === "overdue" && <span className="bb-pulse" style={{ background: t.dot }} />}
                </div>
              </a>
            );
          })}
      </div>
    </section>
  );
}

const css = `
.bb-root { --ink:#0b0f17; --panel:#111725; --line:rgba(255,255,255,.07); --mut:rgba(255,255,255,.5);
  min-height:100vh; background:radial-gradient(120% 80% at 50% -10%, #16203a 0%, #0b0f17 55%); color:#fff;
  padding:28px 32px 40px; font-feature-settings:"tnum"; }
.bb-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:22px; }
.bb-brand h1 { font-size:34px; font-weight:800; letter-spacing:-.02em; margin:6px 0 4px; }
.bb-brand p { color:var(--mut); font-size:14px; margin:0; }
.bb-live { display:inline-flex; align-items:center; gap:7px; font-size:11px; font-weight:700; letter-spacing:.14em;
  color:#4ade80; }
.bb-live-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 0 rgba(34,197,94,.6);
  animation:bbpulse 2s infinite; }
@keyframes bbpulse { 0%{box-shadow:0 0 0 0 rgba(34,197,94,.5);} 70%{box-shadow:0 0 0 9px rgba(34,197,94,0);} 100%{box-shadow:0 0 0 0 rgba(34,197,94,0);} }
.bb-stamp { color:var(--mut); font-size:13px; font-variant-numeric:tabular-nums; padding-top:6px; }

.bb-stats { display:flex; align-items:stretch; gap:14px; margin-bottom:26px; flex-wrap:wrap; }
.bb-stat { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:16px 22px; min-width:150px; }
.bb-stat.big { min-width:180px; }
.bb-stat-n { font-size:44px; font-weight:800; line-height:1; letter-spacing:-.03em; }
.bb-stat.big .bb-stat-n { font-size:56px; }
.bb-stat-l { color:var(--mut); font-size:12.5px; margin-top:8px; font-weight:500; }
.bb-stat-div { width:1px; background:var(--line); margin:4px 6px; }

.bb-cols { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
@media (max-width:900px){ .bb-cols{ grid-template-columns:1fr; } .bb-brand h1{ font-size:26px; } }
.bb-col { background:rgba(17,23,37,.6); border:1px solid var(--line); border-radius:18px; padding:18px; }
.bb-col-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:12px; padding:0 4px; }
.bb-col-head h2 { font-size:16px; font-weight:700; margin:0; }
.bb-col-head span { color:var(--mut); font-size:12px; }
.bb-list { display:flex; flex-direction:column; gap:8px; }
.bb-row { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:14px 16px;
  border-radius:12px; text-decoration:none; color:inherit; transition:transform .08s ease; }
.bb-row:hover { transform:translateX(2px); }
.bb-row-name { font-size:15.5px; font-weight:650; }
.bb-row-no { color:var(--mut); font-weight:500; font-size:13px; margin-left:6px; }
.bb-row-sub { color:var(--mut); font-size:12.5px; margin-top:3px; }
.bb-row-clock { display:flex; align-items:center; gap:9px; font-weight:800; font-size:20px; letter-spacing:-.01em;
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.bb-pulse { width:9px; height:9px; border-radius:50%; animation:bbpulse2 1.1s infinite; }
@keyframes bbpulse2 { 0%,100%{opacity:1;} 50%{opacity:.3;} }
.bb-empty { color:var(--mut); font-size:13.5px; padding:22px 16px; text-align:center; }
.bb-clear { margin-top:22px; text-align:center; color:#4ade80; font-size:15px; font-weight:600; }
`;
