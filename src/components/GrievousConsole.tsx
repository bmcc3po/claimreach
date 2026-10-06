"use client";
import { useState } from "react";
import { askAI } from "@/lib/ai";
import { ALL_LINERS } from "@/lib/silver-liners";
import FileQaCheck from "./calls/FileQaCheck";

// Grievous coaching console — pick a recent intake, get an AI QA review against
// doctrine (one-call close, control, no leading statements, completeness).
export default function GrievousConsole({ claims }: { claims: any[] }) {
  const [sel, setSel] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState("");

  async function askGrievous() {
    if (!ask.trim()) return;
    setAnswer(""); setBusy(true);
    const text = await askAI(
        `You are Grievous/Maverick, a sales+QA coach for a legal intake call center. Doctrine: one-call close, keep control, ask yes/no via the genie test, never lead the witness. You also know the Silver Liners — hopeful one-liners agents can use with callers: ${ALL_LINERS.slice(0,60).map((l)=>l.line).join(" | ")}. Answer practically and briefly.`,
        ask
      );
      setAnswer(text || "Could not reach Grievous (is the Mac relay up?).");
    setBusy(false);
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 2px" }}>⚡ Grievous</h1>
      <p className="muted" style={{ marginTop: 0 }}>Review an INNO MVA or NETFLY file, confirm the facts, and leave an audit trail.</p>
      <p><a href="/leads/archive">Test files &amp; archive</a> · <a href="/packets">Operator work list</a></p>

      <div className="lead-grid grievous-grid">
        <div>
          <div className="section-title">Recent intakes to review</div>
          {claims.length === 0 && <p className="muted">No intakes to review yet.</p>}
          {claims.map((c) => (
            <div key={c.id} className="qcard row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong style={{ fontSize: 13.5 }}>{c.leads?.lead_no ?? "—"}</strong>
                <span className="muted" style={{ marginLeft: 8 }}>{c.leads?.claimant_name ?? "—"}</span>
                <div className="pmeta" style={{ fontSize: 12, color: "var(--ink-soft)" }}>{c.claim_type} · {c.campaign ?? "—"}</div>
              </div>
              <button className="btn ghost sm" onClick={() => setSel(c)}>Review</button>
            </div>
          ))}
        </div>

        <div>
          <div className="side-card">
            <h3>File review</h3>
            {!sel && <p className="muted" style={{ fontSize: 13 }}>Choose a file. Findings are advisory; a person decides the next step.</p>}
            {sel && <><a href={`/app/${sel.leads?.lead_no || sel.lead_id}?claim=${sel.id}`}>Open {sel.leads?.lead_no} →</a><FileQaCheck key={sel.id} leadId={sel.lead_id} claimId={sel.id} /></>}
          </div>
          <div className="side-card">
            <h3>Ask Grievous</h3>
            <textarea rows={2} placeholder="How do I handle 'I need to ask my spouse'?" value={ask} onChange={(e) => setAsk(e.target.value)} />
            <button className="btn" style={{ marginTop: 8 }} onClick={askGrievous} disabled={busy}>Ask</button>
            {answer && <div className="script" style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 10 }}>{answer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
