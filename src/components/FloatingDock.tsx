"use client";
import { useState } from "react";
import { VitalsCard } from "./LeadSidebar";
import KnowledgePanel from "./KnowledgePanel";
import Crissi from "./Crissi";
import { askAI } from "@/lib/ai";

type PanelKey = "vitals" | "assist" | "grievous" | "maverick" | "integrity" | null;

// One "Tools" pill bottom-right. Expands to a tray of tools; each opens its panel.
// Crissi is now one of the tray tools (no separate floating pill).
export default function FloatingDock({ lead, claimId, claimType }: { lead: any; claimId?: string; claimType: string }) {
  const [trayOpen, setTrayOpen] = useState(false);
  const [open, setOpen] = useState<PanelKey>(null);
  const [crissiOpen, setCrissiOpen] = useState(false);
  const pick = (k: PanelKey) => { setOpen(k); setTrayOpen(false); };

  return (
    <>
      {open && (
        <div className="dock-pop">
          <div className="dock-pop-head">
            <strong>{open === "vitals" ? "Vitals" : open === "assist" ? "Agent assist" : open === "grievous" ? "Grievous — QA enforcer" : open === "integrity" ? "Integrity — live story check" : "Maverick — your coach"}</strong>
            <button className="dock-x" onClick={() => setOpen(null)}>✕</button>
          </div>
          <div className="dock-pop-body">
            {open === "vitals" && <VitalsCard lead={lead} />}
            {open === "assist" && <KnowledgePanel claimType={claimType} />}
            {open === "integrity" && <IntegrityPanel leadId={lead.id} claimId={claimId} />}
            {open === "grievous" && <GrievousPanel leadId={lead.id} claimId={claimId} />}
            {open === "maverick" && <MaverickPanel claimType={claimType} />}
          </div>
        </div>
      )}

      {trayOpen && (
        <div className="dock-tray">
          <button className="dock-tray-item crissi" onClick={() => { setCrissiOpen(true); setTrayOpen(false); }}>🆘 <span>Crissi (crisis)</span></button>
          <button className="dock-tray-item" onClick={() => pick("vitals")}>📋 <span>Vitals</span></button>
          <button className="dock-tray-item" onClick={() => pick("assist")}>🧭 <span>Agent assist</span></button>
          <button className="dock-tray-item integrity" onClick={() => pick("integrity")}>🔎 <span>Integrity check</span></button>
          <button className="dock-tray-item maverick" onClick={() => pick("maverick")}>⚡ <span>Ask Maverick</span></button>
          <button className="dock-tray-item grievous" onClick={() => pick("grievous")}>🛡️ <span>Grievous</span></button>
        </div>
      )}

      <button className={`dock-tools-pill ${trayOpen ? "active" : ""}`} onClick={() => { setTrayOpen(!trayOpen); setOpen(null); }} aria-label="Tools" title="Tools">
        🔨
      </button>

      {/* Crissi lives in the tray now; mounted controlled, no separate FAB */}
      <Crissi trigger="fab" hideTrigger openExternal={crissiOpen} onCloseExternal={() => setCrissiOpen(false)} />
    </>
  );
}

function GrievousPanel({ leadId, claimId }: { leadId: string; claimId?: string }) {
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<any | null>(null);
  const [err, setErr] = useState("");
  async function grade(kind: "quick" | "full") {
    if (!claimId) { setErr("No claim to grade yet."); return; }
    setBusy(true); setErr(""); setReview(null);
    try {
      const r = await fetch("/api/grievous", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "review", lead_id: leadId, claim_id: claimId, kind }) });
      const d = await r.json();
      if (d.review) setReview(d.review); else setErr(d.error || "Grievous failed.");
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setBusy(false);
  }
  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Grievous is the hard-ass. He grades the intake against doctrine. A FULL approval is required before you can send the eSign.</p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost sm" onClick={() => grade("quick")} disabled={busy}>{busy ? "…" : "Quick check"}</button>
        <button className="btn sm" onClick={() => grade("full")} disabled={busy}>{busy ? "Grading…" : "Full review & approve"}</button>
      </div>
      {err && <p className="save-msg warn" style={{ marginTop: 10 }}>{err}</p>}
      {review && (
        <div className="grievous-result" style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className={`badge ${review.verdict === "approved" ? "signed" : review.verdict === "rejected" ? "dq" : "count"}`}>{review.verdict}</span>
            {review.score != null && <span className="muted" style={{ fontSize: 12 }}>Score {review.score}/100</span>}
          </div>
          {review.summary && <p style={{ fontSize: 13, margin: "8px 0" }}>{review.summary}</p>}
          {Array.isArray(review.issues) && review.issues.length > 0 && (
            <ul className="bible-list">{review.issues.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}

function MaverickPanel({ claimType }: { claimType: string }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [busy, setBusy] = useState(false);
  async function ask() {
    if (!q.trim()) return;
    setBusy(true); setA("");
    const system = `You are Maverick, a supportive, sharp intake/closing COACH (Straight Line persuasion spine). You help the agent handle the caller with warmth and skill. Be encouraging and practical, never punitive. Current campaign: ${claimType}.`;
    const ans = await askAI(system, q);
    setA(ans || "Maverick is unavailable right now. Try again.");
    setBusy(false);
  }
  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Maverick is your coach. Ask how to handle a caller, an objection, or a tricky moment.</p>
      <textarea rows={2} placeholder="e.g. caller is hesitant to share medical details…" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn sm" style={{ marginTop: 6 }} onClick={ask} disabled={busy}>{busy ? "Thinking…" : "Ask Maverick"}</button>
      {a && <div className="card" style={{ padding: 12, marginTop: 10, fontSize: 13.5, whiteSpace: "pre-wrap" }}>{a}</div>}
    </div>
  );
}

function IntegrityPanel({ leadId, claimId }: { leadId: string; claimId?: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any | null>(null);
  const [err, setErr] = useState("");
  async function run() {
    if (!claimId) { setErr("No claim to check yet."); return; }
    setBusy(true); setErr(""); setRes(null);
    try {
      const r = await fetch("/api/integrity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: claimId }) });
      const d = await r.json();
      if (d.result) setRes(d.result); else setErr(d.error || "Integrity check failed.");
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setBusy(false);
  }
  const count = res ? (res.story_holes?.length || 0) + (res.fraud_flags?.length || 0) : 0;
  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Live check: spelling, grammar, story holes & contradictions, and fraud / weak-case signals. Run it before you wrap the call.</p>
      <button className="btn sm" onClick={run} disabled={busy}>{busy ? "Checking…" : "🔎 Run integrity check"}</button>
      {err && <p className="save-msg warn" style={{ marginTop: 10 }}>{err}</p>}
      {res && (
        <div style={{ marginTop: 12 }}>
          {res.overall && <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>{res.overall}</p>}
          {count === 0 && <p className="save-msg ok">✓ No story holes or fraud flags found.</p>}

          {res.story_holes?.length > 0 && (
            <div className="integ-block">
              <div className="integ-head holes">🕳️ Story holes ({res.story_holes.length})</div>
              {res.story_holes.map((h: any, i: number) => (
                <div key={i} className="integ-item">
                  <div className="integ-issue">{h.issue}</div>
                  {h.ask && <div className="integ-ask">Ask: "{h.ask}"</div>}
                </div>
              ))}
            </div>
          )}

          {res.fraud_flags?.length > 0 && (
            <div className="integ-block">
              <div className="integ-head fraud">🚩 Fraud / weak-case flags ({res.fraud_flags.length})</div>
              {res.fraud_flags.map((f: any, i: number) => (
                <div key={i} className="integ-item">
                  <div className="integ-issue"><span className={`sev ${f.severity}`}>{f.severity}</span> {f.flag}</div>
                  {f.why && <div className="muted" style={{ fontSize: 12 }}>{f.why}</div>}
                </div>
              ))}
            </div>
          )}

          {(res.spelling?.length > 0 || res.grammar?.length > 0) && (
            <div className="integ-block">
              <div className="integ-head fix">✏️ Spelling & grammar ({(res.spelling?.length || 0) + (res.grammar?.length || 0)})</div>
              {[...(res.spelling || []), ...(res.grammar || [])].map((s: any, i: number) => (
                <div key={i} className="integ-item">
                  <div className="muted" style={{ fontSize: 11 }}>{s.field}</div>
                  <div className="integ-fix">{s.fix}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
