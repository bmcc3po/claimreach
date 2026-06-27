"use client";
import { useState } from "react";
import { askAI } from "@/lib/ai";

// Grievous coaching console — pick a recent intake, get an AI QA review against
// doctrine (one-call close, control, no leading statements, completeness).
export default function GrievousConsole({ claims }: { claims: any[] }) {
  const [sel, setSel] = useState<any>(null);
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState("");

  async function runReview(c: any) {
    setSel(c); setReview(""); setBusy(true);
    const answers = JSON.stringify(c.answers ?? {}, null, 1).slice(0, 6000);
    const text = await askAI(
        "You are Grievous, a QA coach for legal intake. Review the intake against doctrine: no leading statements, all vital fields captured, control kept, claimant qualified correctly, completeness. Give (1) a score out of 100, (2) what went well, (3) gaps or risks, (4) one concrete coaching tip. Be concise.",
        `Claim type: ${c.claim_type}. Intake answers:

${answers}`
      );
      setReview(text || "Could not reach the reviewer (is the Mac relay up?).");
    setBusy(false);
  }

  async function askGrievous() {
    if (!ask.trim()) return;
    setAnswer(""); setBusy(true);
    const text = await askAI(
        "You are Grievous/Maverick, a sales+QA coach for a legal intake call center. Doctrine: one-call close, keep control, ask yes/no via the genie test, never lead the witness. Answer practically and briefly.",
        ask
      );
      setAnswer(text || "Could not reach Grievous (is the Mac relay up?).");
    setBusy(false);
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 2px" }}>⚡ Grievous</h1>
      <p className="muted" style={{ marginTop: 0 }}>QA coaching that reviews intakes against doctrine.</p>

      <div className="lead-grid">
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
              <button className="btn ghost sm" onClick={() => runReview(c)} disabled={busy}>Review</button>
            </div>
          ))}
        </div>

        <div>
          <div className="side-card">
            <h3>Coaching review</h3>
            {!sel && <p className="muted" style={{ fontSize: 13 }}>Pick an intake to get a doctrine review.</p>}
            {sel && busy && <p className="muted">Scoring {sel.leads?.lead_no}…</p>}
            {review && <div className="script" style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{review}</div>}
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
