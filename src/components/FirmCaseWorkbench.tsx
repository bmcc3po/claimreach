"use client";
import { useState } from "react";
import { STAGES, STAGE_LABELS } from "@/lib/questionnaire";
import TierEditor from "./TierEditor";
import CallLog from "./CallLog";
import CrisisBot from "./CrisisBot";
import CaseDocuments from "./CaseDocuments";
import CaseMessages from "./CaseMessages";

export default function FirmCaseWorkbench({ lead, claims, activity, callLogs }: { lead: any; claims: any[]; activity: any[]; callLogs: any[] }) {
  const claim = claims[0] ?? {};
  const [stage, setStage] = useState(lead.stage);
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState("");
  const [reqInfo, setReqInfo] = useState("");
  const [msg, setMsg] = useState("");

  async function setStageVal(s: string) {
    setStage(s);
    await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "stage", lead_id: lead.id, stage: s }) }).catch(() => {});
  }
  async function sendNote(scope: string, body: string) {
    if (!body.trim()) return;
    const endpoint = scope === "request_info" ? "/api/request-info" : "/api/notes";
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id, claim_id: claim.id, scope, body }) }).catch(() => {});
  }

  const TABS = ["overview", "intake", "messages", "calls", "documents", "text client", "activity"];

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>{lead.lead_no}</h1>
        <span className="badge stage">{STAGE_LABELS[stage] ?? stage}</span>
        {lead.firm_ref_no && <span className="muted">Firm ref {lead.firm_ref_no}</span>}
        <div className="spacer" />
        <a className="btn ghost" href={`/api/export?format=neos&lead=${lead.id}`}>⬇ Export intake</a>
      </div>

      <div className="lead-grid">
        <div className="card" style={{ padding: 0 }}>
          <div className="tabs">
            {TABS.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          <div className="formbody">
            {tab === "overview" && (
              <div>
                <div className="section-title">Update stage</div>
                <select value={stage} onChange={(e) => setStageVal(e.target.value)} style={{ maxWidth: 320 }}>
                  {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>)}
                </select>
                <p className="muted" style={{ fontSize: 13 }}>Advance the case as your firm completes each step.</p>

                <div className="section-title" style={{ marginTop: 18 }}>Request more info from Innovative</div>
                <textarea rows={3} placeholder="What do you need? (sent to the intake team)" value={reqInfo} onChange={(e) => setReqInfo(e.target.value)} />
                <button className="btn" style={{ marginTop: 8 }} onClick={() => { sendNote("request_info", reqInfo); setReqInfo(""); }}>Send request</button>

                <div className="section-title" style={{ marginTop: 18 }}>Case note</div>
                <textarea rows={3} placeholder="Add a note to this case" value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { sendNote("case", note); setNote(""); }}>Add note</button>
              </div>
            )}
            {tab === "intake" && (
              <div>
                <div className="section-title">Intake answers</div>
                {Object.keys(claim.answers ?? {}).length === 0 && <p className="muted">No intake answers recorded yet.</p>}
                {Object.entries(claim.answers ?? {}).map(([k, v]) => (
                  <div key={k} className="vrow"><span className="vk">{k}</span><span className="vv">{String(v)}</span></div>
                ))}
              </div>
            )}
            {tab === "calls" && <CallLog leadId={lead.id} claimId={claim.id} initial={callLogs} />}
            {tab === "documents" && <CaseDocuments leadId={lead.id} claimId={claim.id} />}
            {tab === "messages" && <CaseMessages leadId={lead.id} claimId={claim.id} me="Firm" />}
            {tab === "text client" && (
              <div>
                <div className="section-title">Text the client</div>
                <textarea rows={3} placeholder="Message to the client (JustCall, comms-safety enforced)" value={msg} onChange={(e) => setMsg(e.target.value)} />
                <button className="btn" style={{ marginTop: 8 }} onClick={async () => {
                  await fetch("/api/justcall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "text", lead_id: lead.id, to: lead.phone, body: msg }) }).catch(() => {});
                  setMsg("");
                }}>Send text</button>
              </div>
            )}
            {tab === "activity" && (
              <div>
                {(activity ?? []).map((a, i) => (
                  <div key={i} className="post"><strong>{a.actor_name}</strong> <span className="muted">{a.description}</span><div className="pmeta">{new Date(a.created_at).toLocaleString()}</div></div>
                ))}
                {(!activity || activity.length === 0) && <p className="muted">No activity yet.</p>}
              </div>
            )}
          </div>
        </div>

        <div>
          <TierEditor claimId={claim.id} claimType={lead.case_type} letter={claim.tier_letter} number={claim.tier_number} />
          <CrisisBot trigger="inline" />
        </div>
      </div>
    </div>
  );
}
