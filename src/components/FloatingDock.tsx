"use client";
import { useState } from "react";
import { VitalsCard } from "./LeadSidebar";
import KnowledgePanel from "./KnowledgePanel";
import { askAI } from "@/lib/ai";

type PanelKey = "vitals" | "assist" | "grievous" | "maverick" | null;

export default function FloatingDock({ lead, claimId, claimType }: { lead: any; claimId?: string; claimType: string }) {
  const [open, setOpen] = useState<PanelKey>(null);
  const toggle = (k: PanelKey) => setOpen((cur) => (cur === k ? null : k));

  return (
    <>
      {open && (
        <div className="dock-pop">
          <div className="dock-pop-head">
            <strong>{open === "vitals" ? "Vitals" : open === "assist" ? "Agent assist" : open === "grievous" ? "Grievous — QA enforcer" : "Maverick — your coach"}</strong>
            <button className="dock-x" onClick={() => setOpen(null)}>✕</button>
          </div>
          <div className="dock-pop-body">
            {open === "vitals" && <VitalsCard lead={lead} />}
            {open === "assist" && <KnowledgePanel claimType={claimType} />}
            {open === "grievous" && <GrievousPanel leadId={lead.id} claimId={claimId} />}
            {open === "maverick" && <MaverickPanel claimType={claimType} />}
          </div>
        </div>
      )}
      <div className="dock">
        <button className={`dock-pill vitals ${open === "vitals" ? "active" : ""}`} onClick={() => toggle("vitals")}>📋 Vitals</button>
        <button className={`dock-pill assist ${open === "assist" ? "active" : ""}`} onClick={() => toggle("assist")}>🧭 Agent assist</button>
        <button className={`dock-pill maverick ${open === "maverick" ? "active" : ""}`} onClick={() => toggle("maverick")}>⚡ Ask Maverick</button>
        <button className={`dock-pill grievous ${open === "grievous" ? "active" : ""}`} onClick={() => toggle("grievous")}>🛡️ Grievous</button>
      </div>
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
          {review.verdict === "approved" && review.kind === "full" && <p className="save-msg ok" style={{ marginTop: 8 }}>✓ Approved, eSign unlocked.</p>}
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
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Maverick is your coach, the helper. Ask how to handle a caller, an objection, or a tricky moment.</p>
      <textarea rows={2} placeholder="e.g. caller is hesitant to share medical details…" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn sm" style={{ marginTop: 6 }} onClick={ask} disabled={busy}>{busy ? "Thinking…" : "Ask Maverick"}</button>
      {a && <div className="card" style={{ padding: 12, marginTop: 10, fontSize: 13.5, whiteSpace: "pre-wrap" }}>{a}</div>}
    </div>
  );
}
