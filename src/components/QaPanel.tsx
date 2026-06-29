"use client";
import { useState, useEffect } from "react";
import { DEFAULT_DQ_REASONS, type DqReason } from "@/lib/statuses";

const GRADES = [
  { key: "green", label: "Green", cls: "good" },
  { key: "yellow", label: "Yellow", cls: "warn" },
  { key: "red", label: "Red", cls: "bad" },
];

function GradeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="qa-grade-row">
      <span className="qa-grade-label">{label}</span>
      <div className="qa-grade-pills">
        {GRADES.map((g) => (
          <button key={g.key} className={`qa-pill ${g.cls} ${value === g.key ? "on" : ""}`} onClick={() => onChange(g.key)}>{g.label}</button>
        ))}
      </div>
    </div>
  );
}

export default function QaPanel({ leadId, claimId }: { leadId: string; claimId?: string }) {
  const [gQa, setGQa] = useState(""); const [gEsign, setGEsign] = useState(""); const [gCrit, setGCrit] = useState("");
  const [cLead, setCLead] = useState(""); const [cComplete, setCComplete] = useState("");
  const [qaNote, setQaNote] = useState(""); const [agentNote, setAgentNote] = useState("");
  const [cards, setCards] = useState<any[]>([]);
  const [thread, setThread] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [reasons, setReasons] = useState<DqReason[]>(DEFAULT_DQ_REASONS);
  const [declineReason, setDeclineReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await (await fetch(`/api/qa?lead_id=${leadId}`)).json();
    setCards(r.cards ?? []); setThread(r.thread ?? []);
    try { const d = await (await fetch("/api/dq-reasons")).json(); if (d.reasons?.length) setReasons(d.reasons.filter((x: DqReason) => x.active !== false)); } catch {}
  }
  useEffect(() => { load(); }, [leadId]);

  const grievousCard = cards.find((c) => c.grader === "grievous");

  const anyRed = [gQa, gEsign, gCrit].includes("red");
  const gatesSet = gQa && gEsign && gCrit;

  async function submit(decision: string, dqReasonKey?: string) {
    if (!gatesSet) { setMsg("Set all three hard-gate checks first."); return; }
    if (decision === "approve" && anyRed) {
      setMsg("Cannot approve with a red hard gate. Route to WIP or Flag, or decline.");
      return;
    }
    setBusy(true); setMsg("");
    const r = await fetch("/api/qa", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "submit", lead_id: leadId, claim_id: claimId,
        g_qa_pass: gQa, g_esign: gEsign, g_criteria: gCrit, c_leading: cLead, c_complete: cComplete,
        qa_note: qaNote, agent_note: agentNote, decision, dq_reason_key: dqReasonKey ?? null,
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Could not submit"); return; }
    setMsg(`Routed: ${decision}. Status now ${d.status}.`);
    setDeclineReason(null);
    setTimeout(() => window.location.reload(), 800);
  }

  function onDecline() {
    // non-dismissable reason required
    setDeclineReason("");
  }

  async function postReply() {
    if (!reply.trim()) return;
    await fetch("/api/qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "thread", lead_id: leadId, body: reply }) });
    setReply(""); load();
  }

  return (
    <div className="qa-panel">
      {grievousCard && (
        <div className="qa-card grievous">
          <div className="qa-card-h">Grievous report card{grievousCard.created_at ? ` · ${new Date(grievousCard.created_at).toLocaleString()}` : ""}</div>
          <div className="qa-card-grid">
            {[["QA pass", grievousCard.qa_pass], ["eSign", grievousCard.esign], ["Criteria", grievousCard.criteria], ["Leading", grievousCard.leading], ["Complete", grievousCard.complete]].map(([k, v]) => (
              <div key={k as string} className="qa-card-cell"><span>{k}</span><b className={`qa-dot ${v === "green" ? "good" : v === "yellow" ? "warn" : v === "red" ? "bad" : ""}`}>{v || "—"}</b></div>
            ))}
          </div>
        </div>
      )}

      <div className="qa-section-title">Hard gates (any red blocks approve)</div>
      <GradeRow label="Is this QA pass?" value={gQa} onChange={setGQa} />
      <GradeRow label="Is the eSign accurate?" value={gEsign} onChange={setGEsign} />
      <GradeRow label="Meets criteria (transcript + intake)?" value={gCrit} onChange={setGCrit} />

      <div className="qa-section-title" style={{ marginTop: 16 }}>Coaching grades (internal, firm never sees)</div>
      <GradeRow label="Was there leading?" value={cLead} onChange={setCLead} />
      <GradeRow label="Was the intake complete?" value={cComplete} onChange={setCComplete} />

      <div className="qa-notes">
        <label>QA note (internal)<textarea value={qaNote} onChange={(e) => setQaNote(e.target.value)} rows={2} placeholder="General QA note." /></label>
        <label>Note to agent (firm never sees)<textarea value={agentNote} onChange={(e) => setAgentNote(e.target.value)} rows={2} placeholder="You were off script here; it seemed leading." /></label>
      </div>

      {msg && <div className="qa-msg">{msg}</div>}

      <div className="qa-actions">
        <button className="btn" disabled={busy || anyRed || !gatesSet} title={anyRed ? "A red hard gate blocks approval" : !gatesSet ? "Set all three hard gates first" : ""} onClick={() => submit("approve")}>Approve (unlock firm)</button>
        <button className="btn ghost" disabled={busy} onClick={() => submit("wip")}>Back to agent (WIP)</button>
        <button className="btn ghost" disabled={busy} onClick={() => submit("flag")}>Flag BMC</button>
        <button className="btn ghost danger" disabled={busy} onClick={onDecline}>Decline (drop letter)</button>
      </div>
      {anyRed && <p className="qa-gate-warn">A red hard gate is set. Approval is blocked. Route to WIP, Flag BMC, or Decline.</p>}

      {declineReason !== null && (
        <div className="modal-back">
          <div className="modal" style={{ maxWidth: 420, padding: "18px 20px" }}>
            <h3 style={{ marginTop: 0 }}>Decline reason</h3>
            <p className="muted" style={{ marginTop: 0 }}>Signed but does not qualify. Choose a reason (required); the firm will be told to send a drop letter.</p>
            <div className="status-reasons">
              {reasons.map((r) => (
                <button key={r.key} className="status-reason" disabled={busy} onClick={() => submit("decline", r.key)}>
                  {r.label}<span className="status-reason-cat">{r.category}</span>
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn ghost" disabled={busy} onClick={() => setDeclineReason(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="qa-section-title" style={{ marginTop: 20 }}>Internal thread (QA, Grievous, agent)</div>
      <div className="qa-thread">
        {thread.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No internal messages yet.</p>}
        {thread.map((t) => (
          <div key={t.id} className="qa-thread-msg">
            <div className="qa-thread-meta"><strong>{t.author_name}</strong> <span className="muted">{t.author_role} · {new Date(t.created_at).toLocaleString()}</span></div>
            <div>{t.body}</div>
          </div>
        ))}
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Message the agent / QA…" onKeyDown={(e) => { if (e.key === "Enter") postReply(); }} />
          <button className="btn ghost" onClick={postReply}>Send</button>
        </div>
      </div>
    </div>
  );
}
