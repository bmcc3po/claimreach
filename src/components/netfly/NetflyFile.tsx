"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { NETFLY_FIELDS, NETFLY_SECTIONS, NETFLY_DQ_REASONS, netflyFlags, parseNetflyHandoff, validateNetflyCallClose, type NetflyCallClose, type NetflyField } from "@/lib/netfly-ontake";
import { DEFAULT_DQ_REASONS } from "@/lib/statuses";
import "./netfly.css";
import "./netfly-workspace.css";

type Handoff = { note: string; at: string; by_name?: string; channel?: string };
type Detail = { file: { id: string; lead_no: string; claimant_name: string; phone: string; email: string }; answers: { fields?: Record<string, string>; review?: any; handoffs?: Handoff[]; handoff_verification?: { status: string; note: string; source_revision: number; at: string; by_name?: string }; call_close?: NetflyCallClose & { source_revision: number; at: string; by_name?: string; followup_required: boolean } }; retainer: { id: string; file_name: string; created_at: string; url: string | null }[]; canReview: boolean };

const VERIFY_STEPS = [
  { title: "1. Welcome to the firm", script: "Hi, [first name], this is [your name] with Turnbull, Moak & Pendergrass. Great to meet you! I just wanted to jump on the phone to welcome you to the firm. I'm going to verify a few things, gather some brief additional details, and then we'll talk about next steps.", fields: ["seen_doctor", "first_provider", "first_visit", "ambulance", "treated_injuries", "other_pain", "still_treating", "current_provider", "last_appointment", "next_appointment"] },
  { title: "2. Verify their story", script: "I have your name as [spell name], and the accident listed as [date and location]. Is that right? I'll read back the key points; please stop me if anything has changed or is missing.", fields: ["confirmed_name", "name_confirmed", "dob", "mailing_address", "confirmed_phone", "confirmed_email", "accident_date", "road", "position", "incident_story", "fault", "passengers", "passenger_details"] },
  { title: "3. Fill the gaps", script: "I have most of the accident details already. I just want to check the pieces the case manager will need: the police report, the vehicles and insurance, your treatment plan, and whether anyone else is representing you.", fields: ["police_came", "police_report", "ticket", "other_insurer", "other_claim", "drivable", "totaled", "photos", "insurer_contact", "recorded_statement", "other_lawyer_talk", "other_lawyer_signed", "client_questions"] },
  { title: "4. Close the ontake", script: "Before we finish, I'll make sure the legal team knows what is complete and what needs follow-up. I don't make the final decision about your case.", fields: [] },
  { title: "5. Meet the case manager", script: "While I have you on the phone, I just want to see if your case manager is at her desk to say hi. Would that be okay?", fields: ["final_notes"] },
] as const;
const verifyIds = new Set<string>(VERIFY_STEPS.flatMap((step) => [...step.fields]));
const fieldById = new Map(NETFLY_FIELDS.map((field) => [field.id, field]));
const emptyCallClose: NetflyCallClose = { completion: "" as NetflyCallClose["completion"], disposition: "" as NetflyCallClose["disposition"], dq_reason_key: "", assessment_reason: "", transfer_destination: "", transfer_outcome: "" as NetflyCallClose["transfer_outcome"], transfer_note: "", client_notified_48_business_hours: false };
export default function NetflyFile({ fileKey }: { fileKey: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [section, setSection] = useState(0);
  const [viewMode, setViewMode] = useState<"step" | "all" | "simple">("all");
  const [activeQuestion, setActiveQuestion] = useState<string>(VERIFY_STEPS[0].fields[0]);
  const [commandTab, setCommandTab] = useState<"file" | "agreement" | "scripts" | "phone">("file");
  const [commandOpen, setCommandOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [openedOriginalId, setOpenedOriginalId] = useState<string | null>(null);
  const [originalConfirmed, setOriginalConfirmed] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [handoffDraft, setHandoffDraft] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [verificationNote, setVerificationNote] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [callClose, setCallClose] = useState<NetflyCallClose>(emptyCallClose);
  const [introDecision, setIntroDecision] = useState<"yes" | "no" | "not_attempted" | null>(null);
  const [callCloseDirty, setCallCloseDirty] = useState(false);
  const [callCloseBusy, setCallCloseBusy] = useState(false);
  const [dqDialogOpen, setDqDialogOpen] = useState(false);
  async function load(forceCall = false) {
    try { const r = await fetch(`/api/netfly?file=${encodeURIComponent(fileKey)}`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setDetail(d); setValues(d.answers?.fields || {}); setReviewNote(d.answers?.review?.note || ""); if (forceCall || !callCloseDirty) { setCallClose(d.answers?.call_close ? { ...emptyCallClose, ...d.answers.call_close } : emptyCallClose); setCallCloseDirty(false); } }
    catch (e: any) { setError(e.message || "NETFLY file did not load."); }
  }
  useEffect(() => { void load(); }, [fileKey]);
  async function save(id: string, value: string) {
    setSaveState(`Saving ${id}…`); setError("");
    try { const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "answer", file: fileKey, field: id, value }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setSaveState("Saved"); }
    catch (e: any) { setSaveState(""); setError(`${id}: ${e.message || "Save failed"}. Your answer remains on screen; retry before leaving.`); }
  }
  const set = (id: string, value: string) => setValues((old) => ({ ...old, [id]: value }));
  async function upload(file: File) {
    setUploading(true); setError("");
    try { const fd = new FormData(); fd.append("file_key", fileKey); fd.append("file", file); const r = await fetch("/api/netfly/retainer", { method: "POST", body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); await load(); }
    catch (e: any) { setError(e.message || "PDF upload failed."); } finally { setUploading(false); }
  }
  async function review(status: string, document_id = "") {
    setError("");
    try { const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "review", file: fileKey, status, document_id, note: reviewNote }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); await load(); }
    catch (e: any) { setError(e.message || "Review did not save."); }
  }
  async function addHandoff() {
    setHandoffBusy(true); setError("");
    try { const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "handoff", file: fileKey, note: handoffDraft }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setHandoffDraft(""); await load(); }
    catch (e: any) { setError(e.message || "Handoff note did not save. Your text remains here."); } finally { setHandoffBusy(false); }
  }
  async function verifyHandoff(status: "matches" | "changes_recorded") {
    setVerificationBusy(true); setError("");
    try { const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "verify_handoff", file: fileKey, status, note: status === "matches" ? "" : verificationNote }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); await load(); }
    catch (e: any) { setError(e.message || "Handoff check did not save. Your note remains here."); } finally { setVerificationBusy(false); }
  }
  const updateCallClose = <K extends keyof NetflyCallClose>(key: K, value: NetflyCallClose[K]) => {
    setCallClose((old) => ({ ...old, [key]: value })); setCallCloseDirty(true);
  };
  const chooseDisposition = (disposition: NetflyCallClose["disposition"]) => {
    setCallClose((old) => ({ ...old, disposition,
      dq_reason_key: disposition === "appears_dq" ? old.dq_reason_key : "",
      transfer_destination: "", transfer_outcome: "" as NetflyCallClose["transfer_outcome"],
      transfer_note: "", client_notified_48_business_hours: false,
    }));
    setIntroDecision(null);
    setCallCloseDirty(true);
    if (disposition === "appears_dq") setDqDialogOpen(true);
  };
  const chooseIntro = (choice: "yes" | "no" | "not_attempted") => {
    setIntroDecision(choice);
    setCallClose((old) => ({ ...old,
      transfer_outcome: choice === "no" ? "client_declined" : choice === "not_attempted" ? "not_attempted"
        : ["connected", "attempted_no_answer"].includes(old.transfer_outcome) ? old.transfer_outcome : "" as NetflyCallClose["transfer_outcome"],
      client_notified_48_business_hours: choice === "no" ? old.client_notified_48_business_hours : false,
    }));
    setCallCloseDirty(true);
  };
  async function recordCallClose() {
    const invalid = validateNetflyCallClose(callClose);
    if (invalid) { setError(invalid); return; }
    setCallCloseBusy(true); setError("");
    try {
      const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "call_close", file: fileKey, ...callClose }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      await load(true);
    } catch (e: any) { setError(e.message || "Call result did not save. Your choices remain on screen; retry."); }
    finally { setCallCloseBusy(false); }
  }
  if (!detail) return <main className="nf-page"><Link href="/app/netfly">← NETFLY files</Link><p>{error || "Loading NETFLY file…"}</p></main>;
  const answered = NETFLY_SECTIONS.flatMap((s) => s.fields).filter((f) => values[f.id]?.trim()).length;
  const flags = netflyFlags(values);
  const latest = detail.retainer[0];
  const handoffs = detail.answers.handoffs || [];
  const originalHandoff = handoffs[0];
  const latestHandoff = handoffs.at(-1);
  const sourceRows = parseNetflyHandoff(latestHandoff?.note || "");
  const checked = detail.answers.handoff_verification?.source_revision === handoffs.length && handoffs.length > 0;
  const callRecorded = detail.answers.call_close?.source_revision === handoffs.length && handoffs.length > 0 && !callCloseDirty && !validateNetflyCallClose(detail.answers.call_close);
  const needsIntroduction = callClose.completion === "complete" && callClose.disposition === "appears_qualified";
  const introStage = introDecision || (["connected", "attempted_no_answer"].includes(callClose.transfer_outcome) ? "yes" : callClose.transfer_outcome === "client_declined" ? "no" : callClose.transfer_outcome === "not_attempted" ? "not_attempted" : null);
  const renderStep = (stepIndex: number) => {
    const current = VERIFY_STEPS[stepIndex];
    const visible = current.fields.map((id) => fieldById.get(id)).filter((f): f is NetflyField => !!f && (!f.when || values[f.when.id] === f.when.is));
    return <div key={current.title} id={`nf-step-${stepIndex}`} className="nf-step-card">
    <section className="nf-panel nf-intake"><div className="nf-section-head"><p className="nf-eyebrow">Welcome call · verify changes, not a new intake</p><h2>{current.title}</h2><span aria-live="polite">{saveState}</span></div>{viewMode !== "simple" && <div className="nf-script"><strong>Say</strong><p>{current.script}</p></div>}
      {stepIndex === 0 && <section className="nf-inline-retainer" aria-label="Original signed retainer">
        <h3>Already signed — review the NETFLY retainer</h3>
        <p>NETFLY collected this before the welcome call. Review the signed PDF now, then verify the first intake below.</p>
        {latest ? <>
          <p className="nf-muted">{latest.file_name} · received {new Date(latest.created_at).toLocaleString()}</p>
          <div className="nf-actions">
            <button type="button" className="nf-primary" disabled={!latest.url} onClick={() => { setOpenedOriginalId(latest.id); setOriginalConfirmed(false); }}>Open signed PDF here</button>
            {latest.url && <a className="nf-secondary" href={latest.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpenedOriginalId(latest.id)}>Open in new tab</a>}
            <button type="button" className="nf-secondary" onClick={() => void load()}>Refresh PDF link</button>
          </div>
          {openedOriginalId === latest.id && latest.url && <div className="nf-pdf-preview"><iframe title="NETFLY original signed retainer" src={latest.url} referrerPolicy="no-referrer" /><p className="nf-muted">If the PDF cannot display here, open it in a new tab.</p></div>}
          {detail.answers.review?.retainer_reviewed_document_id === latest.id ? <p className="nf-saved">Signed PDF reviewed. Continue the welcome call.</p> : openedOriginalId === latest.id && latest.url && <>
            <label className="nf-inline-confirm"><input type="checkbox" checked={originalConfirmed} onChange={(event) => setOriginalConfirmed(event.target.checked)} /> I checked the signed name, agreement, date and signature.</label>
            <button type="button" className="nf-primary" disabled={!originalConfirmed || !detail.canReview} onClick={() => void review("retainer_reviewed", latest.id)}>Record signed-PDF review</button>
          </>}
        </> : <div className="nf-actions"><p className="nf-alert">The signed PDF is missing. Upload NETFLY's original before marking it reviewed.</p><label className="nf-primary">{uploading ? "Uploading…" : "Upload signed PDF"}<input type="file" accept="application/pdf,.pdf" disabled={uploading} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label></div>}
      </section>}
      {viewMode !== "simple" && stepIndex < 3 && <p className="nf-muted">Read back NETFLY's note in Command center → File. Record an answer only when a fact is missing, corrected, or needs detail.</p>}
      {visible.length > 0 && <div className="nf-questions">{visible.map((field) => <Question key={field.id} field={field} value={values[field.id] || ""} set={(value) => set(field.id, value)} save={(value) => save(field.id, value)} active={viewMode === "all" && activeQuestion === field.id} onEnter={() => setActiveQuestion(field.id)} />)}</div>}
      {stepIndex === 1 && latestHandoff && <div className="nf-handoff-check"><strong>{checked ? `Checked with client · ${detail.answers.handoff_verification?.status === "matches" ? "details match" : "changes recorded"}` : "Confirm NETFLY's note with the client"}</strong><p className="nf-muted">The first intake stays intact. If the client corrects anything, describe it and record the corrected answer above.</p><textarea className="nf-source-input" value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="What changed? Leave blank if the read-back matches." /><div className="nf-actions"><button className="nf-secondary" disabled={verificationBusy} onClick={() => void verifyHandoff("matches")}>Details match</button><button className="nf-primary" disabled={verificationBusy || verificationNote.trim().length < 5} onClick={() => void verifyHandoff("changes_recorded")}>Record changes</button></div></div>}
      {stepIndex === 3 && <div className="nf-call-block"><p className="nf-muted">Record completion and outcome separately. An apparent DQ stays on this signed file for supervisor review; it does not cancel representation.</p>
        <div className="nf-closeout"><strong>1. Is the ontake complete?</strong><div className="nf-options nf-options-binary" role="group" aria-label="Ontake completion">{[["complete", "Ontake complete"], ["incomplete", "Ontake not complete"]].map(([value, label]) => <button key={value} type="button" aria-pressed={callClose.completion === value} className={callClose.completion === value ? "selected" : ""} onClick={() => updateCallClose("completion", value as NetflyCallClose["completion"])}>{label}</button>)}</div></div>
        <div className="nf-closeout"><strong>2. What is the call outcome?</strong><div className="nf-options nf-options-binary" role="group" aria-label="NETFLY call outcome">
          <button type="button" aria-pressed={callClose.disposition === "appears_qualified"} className={callClose.disposition === "appears_qualified" ? "selected" : ""} onClick={() => chooseDisposition("appears_qualified")}>Appears to qualify</button>
          <button type="button" aria-pressed={callClose.disposition === "appears_dq"} className={callClose.disposition === "appears_dq" ? "selected" : ""} onClick={() => chooseDisposition("appears_dq")}>Appears to DQ</button>
          <button type="button" aria-pressed={callClose.disposition === "callback_to_finish"} className={callClose.disposition === "callback_to_finish" ? "selected" : ""} onClick={() => chooseDisposition("callback_to_finish")}>Client needs callback to finish</button>
          <button type="button" aria-pressed={callClose.disposition === "client_remorse"} className={callClose.disposition === "client_remorse" ? "selected" : ""} onClick={() => chooseDisposition("client_remorse")}>Client remorse</button>
        </div></div>
        {dqDialogOpen && <div className="nf-dq-overlay"><div className="nf-dq-dialog" role="dialog" aria-modal="true" aria-label="Reason for apparent DQ"><h3>Why does this appear to DQ?</h3><p>This is provisional for supervisor review. The signed retainer remains on file.</p><label className="nf-call-label">Reason<select autoFocus value={callClose.dq_reason_key} onChange={(e) => updateCallClose("dq_reason_key", e.target.value)}><option value="">Choose a reason</option>{DEFAULT_DQ_REASONS.filter((reason) => NETFLY_DQ_REASONS.includes(reason.key as typeof NETFLY_DQ_REASONS[number])).map((reason) => <option key={reason.key} value={reason.key}>{reason.label}</option>)}</select></label><div className="nf-actions"><button type="button" className="nf-secondary" onClick={() => { setDqDialogOpen(false); updateCallClose("disposition", "" as NetflyCallClose["disposition"]); }}>Cancel</button><button type="button" className="nf-primary" disabled={!callClose.dq_reason_key} onClick={() => setDqDialogOpen(false)}>Use this reason</button></div></div></div>}
        {callClose.disposition === "appears_dq" && callClose.dq_reason_key && <button type="button" className="nf-secondary" onClick={() => setDqDialogOpen(true)}>DQ reason: {DEFAULT_DQ_REASONS.find((reason) => reason.key === callClose.dq_reason_key)?.label || callClose.dq_reason_key} · Change</button>}
        {callClose.disposition && callClose.disposition !== "appears_qualified" && <label className="nf-call-label">What happened, and what should happen next?<textarea value={callClose.assessment_reason} onChange={(e) => updateCallClose("assessment_reason", e.target.value)} placeholder="Record the facts, callback plan, or the client's concern." /></label>}
        {flags.length > 0 && <p className="nf-alert">These flags need supervisor attention. Do not decline the client on this call.</p>}
        {!needsIntroduction && callClose.disposition && <button type="button" className="nf-primary" disabled={callCloseBusy} onClick={() => void recordCallClose()}>{callCloseBusy ? "Recording…" : "Record ontake result"}</button>}
        {callRecorded && !needsIntroduction && <p className="nf-saved">Result saved. {callClose.completion === "incomplete" ? "Keep this file open for follow-up." : "Send the completed file for supervisor review below."}</p>}
      </div>}
      {stepIndex === 4 && needsIntroduction && <div className="nf-call-block">
        <p className="nf-muted">Ask permission first. Choosing an answer here records the result; it does not place a call.</p>
        <strong>May I try to introduce you to your case manager now?</strong>
        <div className="nf-options nf-options-binary" role="group" aria-label="Client agreed to a live introduction">
          <button type="button" aria-pressed={introStage === "yes"} className={introStage === "yes" ? "selected" : ""} onClick={() => chooseIntro("yes")}>Yes · Try now</button>
          <button type="button" aria-pressed={introStage === "no"} className={introStage === "no" ? "selected" : ""} onClick={() => chooseIntro("no")}>No · Client declined</button>
        </div>
        <button type="button" className={`nf-unknown${introStage === "not_attempted" ? " selected" : ""}`} aria-pressed={introStage === "not_attempted"} onClick={() => chooseIntro("not_attempted")}>Could not offer the introduction</button>
        {introStage === "yes" && <>
          <label className="nf-call-label">Case manager number or queue<input value={callClose.transfer_destination} onChange={(e) => updateCallClose("transfer_destination", e.target.value)} placeholder="Enter the number or JustCall queue when available" /></label>
          <strong>After the attempt, what happened?</strong>
          <div className="nf-options nf-options-binary" role="group" aria-label="Live introduction result">
            <button type="button" aria-pressed={callClose.transfer_outcome === "connected"} className={callClose.transfer_outcome === "connected" ? "selected" : ""} onClick={() => updateCallClose("transfer_outcome", "connected")}>Connected live</button>
            <button type="button" aria-pressed={callClose.transfer_outcome === "attempted_no_answer"} className={callClose.transfer_outcome === "attempted_no_answer" ? "selected" : ""} onClick={() => updateCallClose("transfer_outcome", "attempted_no_answer")}>No answer</button>
          </div>
        </>}
        {introStage === "no" && <div className="nf-followup"><strong>Say</strong><p>Of course. Your case manager will call you within 48 business hours.</p><label><input type="checkbox" checked={callClose.client_notified_48_business_hours} onChange={(e) => updateCallClose("client_notified_48_business_hours", e.target.checked)} /> I told the client this</label></div>}
        {introStage && <><label className="nf-call-label">Transfer or follow-up note<textarea value={callClose.transfer_note} onChange={(e) => updateCallClose("transfer_note", e.target.value)} placeholder="Who did you try? If you could not try, why?" /></label><button className="nf-primary" disabled={callCloseBusy || (introStage === "yes" && !["connected", "attempted_no_answer"].includes(callClose.transfer_outcome))} onClick={() => void recordCallClose()}>{callCloseBusy ? "Recording…" : callRecorded ? "Update assessment and transfer result" : "Record assessment and transfer result"}</button></>}
        {callRecorded && <p className="nf-saved">Recorded by {detail.answers.call_close?.by_name || "agent"} at {new Date(detail.answers.call_close!.at).toLocaleString()}. {callClose.disposition === "callback_to_finish" ? "Callback needed to finish." : callClose.disposition === "appears_dq" || callClose.disposition === "client_remorse" ? "Supervisor review needed; signed retainer remains on file." : detail.answers.call_close?.followup_required ? "Case-manager follow-up still needed." : "Live introduction connected."}</p>}
      </div>}
      {stepIndex === 4 && <div className="nf-call-block nf-finish-call"><strong>Finish the welcome call</strong><p className="nf-muted">{callClose.completion === "incomplete" ? "This file remains open for a callback. Record the result above and finish the missing information on the next call." : "The signed retainer, verified note, and call result stay together for review."}</p><button type="button" className="nf-primary" disabled={!latest || !checked || !callRecorded || callClose.completion !== "complete" || callClose.disposition === "callback_to_finish" || (detail.answers.review?.status === "correction_needed" || detail.answers.review?.retainer_reviewed_document_id !== latest.id)} onClick={() => void review("ready_for_review")}>{detail.answers.review?.status === "ready_for_review" ? "Ready for supervisor review" : "Send completed ontake to review"}</button></div>}
      {viewMode === "step" && <div className="nf-footer"><button className="nf-secondary" disabled={stepIndex === 0} onClick={() => setSection((i) => Math.max(0, i - 1))}>← Previous</button><button className="nf-primary" onClick={() => setSection((i) => Math.min(VERIFY_STEPS.length - 1, i + 1))} disabled={stepIndex === VERIFY_STEPS.length - 1}>Next step →</button></div>}</section>
    </div>;
  };
  return <main className="nf-page nf-workspace">
    <div className="nf-head"><div><Link href="/app/netfly" className="nf-back">← NETFLY files</Link><p className="nf-eyebrow">Signed transfer · {detail.file.lead_no}</p><h1>{detail.file.claimant_name}</h1><p>{detail.file.phone || "No phone"} · {detail.file.email || "No email"}</p></div><span className="nf-progress">Welcome &amp; verify</span></div>
    {error && <div className="nf-alert" role="alert">{error}</div>}
    {flags.length > 0 && <div className="nf-alert"><strong>Supervisor attention</strong>{flags.map((flag) => <p key={flag}>{flag}</p>)}<p>Finish the file and flag it. Do not auto-decline.</p></div>}
    <div className="nf-workspace-grid">
      <aside className="nf-review-rail" aria-label="Intake review">
        <div className="nf-rail-title"><strong>Intake review</strong><span>Signed transfer</span></div>
        <div className="nf-rail-progress" role="status">{answered} details captured · {checked ? "Note verified" : "Verify note"} · {callRecorded ? "Outcome recorded" : "Record outcome"}{!latest ? " · Signed PDF needed" : ""}</div>
        <nav className="nf-rail-steps" aria-label="Welcome call sections">{VERIFY_STEPS.map((step, i) => <button type="button" key={step.title} aria-current={section === i ? "step" : undefined} className={section === i ? "active" : ""} onClick={() => { setSection(i); if (step.fields[0]) setActiveQuestion(step.fields[0]); if (viewMode !== "step") document.getElementById(`nf-step-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{step.title}</button>)}</nav>
      </aside>
      <div className="nf-workspace-body">
        <div className={`nf-view-bar${headerCollapsed ? " nf-view-bar-collapsed" : ""}`}><div><strong>Welcome call · {detail.file.claimant_name}</strong>{!headerCollapsed && <span>Verify the first intake; ask only what is missing or changed.</span>}</div>{!headerCollapsed && <div className="nf-view-actions"><div className="nf-view-tabs" role="tablist" aria-label="Intake view">{([["all", "All questions"], ["simple", "Simple form"], ["step", "Training Mode"]] as const).map(([mode, label]) => <button type="button" key={mode} role="tab" aria-selected={viewMode === mode} className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>{label}</button>)}</div><button type="button" className="nf-command-toggle nf-secondary" aria-controls="netfly-command" aria-expanded={commandOpen} onClick={() => setCommandOpen(true)}>Command center</button></div>}<button type="button" className="nf-header-toggle" aria-expanded={!headerCollapsed} onClick={() => setHeaderCollapsed((old) => !old)}>{headerCollapsed ? "Show header" : "Hide header"}</button></div>
        {viewMode === "step" ? <>
          {renderStep(section)}
        </> : <div className={`nf-all-steps${viewMode === "simple" ? " nf-simple-steps" : ""}`}>{VERIFY_STEPS.map((_, i) => renderStep(i))}</div>}
    <details key={viewMode} open={viewMode === "all" ? true : undefined} className="nf-history nf-extra"><summary>More details, only if missing or changed</summary><p className="nf-muted">NETFLY already completed intake. Open only the questions needed to resolve a gap or new information. {answered} answers have been saved on this file.</p>{NETFLY_SECTIONS.map((group) => { const extras = group.fields.filter((field) => !verifyIds.has(field.id) && (!field.when || values[field.when.id] === field.when.is)); return extras.length ? <div key={group.id}><h3>{group.title}</h3><div className="nf-questions">{extras.map((field) => <Question key={field.id} field={field} value={values[field.id] || ""} set={(value) => set(field.id, value)} save={(value) => save(field.id, value)} />)}</div></div> : null; })}</details>
      </div>
      <aside id="netfly-command" className={`nf-command${commandOpen ? " nf-command-open" : ""}`} aria-label="Command center">
        <div className="nf-command-head"><div><strong>Command center</strong></div><button type="button" className="nf-command-close" onClick={() => setCommandOpen(false)} aria-label="Close Command center">×</button></div>
        <div className="nf-command-tabs" aria-label="Command center sections"><button type="button" className={commandTab === "file" ? "active" : ""} onClick={() => setCommandTab("file")}>File</button><button type="button" className={commandTab === "phone" ? "active" : ""} onClick={() => setCommandTab("phone")}>Phone</button><label className="nf-command-more">More tools<select aria-label="More command center tools" value={commandTab === "file" || commandTab === "phone" ? "" : commandTab} onChange={(event) => setCommandTab(event.target.value as "agreement" | "scripts")}><option value="">Choose…</option><option value="scripts">Scripts</option><option value="agreement">Agreement correction</option></select></label></div>
        {commandTab === "file" && <div className="nf-command-content">
    <div className="nf-retainer"><div><strong>Already signed with NETFLY</strong><p>{latest ? `Original PDF received ${new Date(latest.created_at).toLocaleString()} · ${detail.answers.review?.status || "Review needed"}` : "Original signed PDF missing — upload it before reviewing the agreement."}</p></div><div className="nf-actions"><label className="nf-secondary">{uploading ? "Uploading…" : "Upload signed PDF"}<input type="file" accept="application/pdf,.pdf" disabled={uploading} hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>{latest?.url && <a className="nf-secondary" href={latest.url} target="_blank" rel="noopener noreferrer">View signed PDF</a>}</div></div>
    {detail.retainer.length > 1 && <details className="nf-history"><summary>Earlier uploaded originals ({detail.retainer.length - 1})</summary>{detail.retainer.slice(1).map((d) => <p key={d.id}>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.file_name}</a> : d.file_name} · {new Date(d.created_at).toLocaleString()}</p>)}</details>}
    <section className="nf-panel nf-source"><div className="nf-source-heading"><div><p className="nf-eyebrow">Already collected by NETFLY</p><h2>Handoff note</h2><p className="nf-muted">Use this to verify the important facts. It is NETFLY's account, not the client's confirmed answers.</p></div>{latestHandoff && <span className="nf-source-time">Received {new Date(latestHandoff.at).toLocaleString()}</span>}</div>
      {sourceRows.length ? <div className="nf-source-grid">{sourceRows.map((row) => <div className="nf-source-item" key={row.label}><strong>{row.label}</strong><p>{row.value}</p></div>)}</div> : latestHandoff ? <p className="nf-source-note">{latestHandoff.note}</p> : <p className="nf-alert">No NETFLY handoff note is on this file yet. Add the note before the welcome call.</p>}
      {originalHandoff && <details className="nf-history"><summary>{handoffs.length > 1 ? `Original note and ${handoffs.length - 1} later correction(s)` : "View the original note"}</summary>{handoffs.map((item, i) => <div className="nf-source-revision" key={`${item.at}-${i}`}><strong>{i === 0 ? "Original" : `Correction ${i}`} · {new Date(item.at).toLocaleString()}</strong><p>{item.note}</p></div>)}</details>}
      <details className="nf-history"><summary>{latestHandoff ? "Add a corrected NETFLY note" : "Paste the NETFLY handoff note"}</summary><p className="nf-muted">A new note is appended. The original stays on the file.</p><textarea className="nf-source-input" value={handoffDraft} onChange={(e) => setHandoffDraft(e.target.value)} placeholder="Paste the NETFLY accident intake note here" /><button className="nf-secondary" disabled={handoffBusy || handoffDraft.trim().length < 10} onClick={() => void addHandoff()}>{handoffBusy ? "Saving…" : "Save handoff note"}</button></details>
    </section>
        </div>}
        {commandTab === "agreement" && <div className="nf-command-content">
    <section className="nf-panel nf-review"><h2>Review the signed retainer</h2><p>NETFLY already obtained the signature. Open the uploaded PDF and check the name, agreement, signature and dates before marking it reviewed.</p>
      <div className="nf-actions"><button className="nf-secondary" onClick={() => review("needs_supervisor")}>Flag for supervisor</button></div>
      {(!latest || !checked || !callRecorded || detail.answers.review?.retainer_reviewed_document_id !== latest?.id) && <p className="nf-muted">To send a completed ontake for review, upload and review the signed PDF, verify NETFLY's note, and record completion and the call outcome.</p>}
      <details className="nf-history nf-emergency"><summary>Retainer error · Supervisor review</summary><p>If the signed original has an error, record the exact issue for a supervisor. The original PDF stays on the file. A supervisor will arrange any needed correction.</p><label>What is wrong?<textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Describe the exact error and correction needed." /></label><div className="nf-actions">{latest && <button className="nf-secondary" disabled={reviewNote.trim().length < 5 || detail.answers.review?.retainer_reviewed_document_id !== latest.id} onClick={() => review("correction_needed", latest.id)}>Flag original for correction</button>}</div></details>
      <p className="nf-muted">NETFLY already obtained the signed retainer. If the original needs correction, flag it for supervisor review.</p></section>
        </div>}
        {commandTab === "scripts" && <div className="nf-command-content"><h2>Call help</h2>
    <details className="nf-history"><summary>Caller objections / responses from the supplied script</summary><p><strong>Who is this?</strong> Recognize that they may have spoken with several people; explain the firm's follow-up role; return to the question where they paused.</p><p><strong>I gave this already.</strong> Acknowledge it and explain that the read-back catches incorrect names and numbers; return to that question.</p><p><strong>I only wanted the report / did not know I signed.</strong> Pause and bring in a supervisor if they dispute representation or want out. Record their concern without assuming consent.</p></details>
        </div>}
        {commandTab === "phone" && <div className="nf-command-content"><h2>Phone</h2><p className="nf-muted">Check the active JustCall conversation before dialing so a second agent does not call this client at the same time. Record the case-manager introduction result in the last call step.</p>{detail.file.phone && <p><strong>Client number:</strong> {detail.file.phone}</p>}{callClose.transfer_destination && <p><strong>Case manager destination:</strong> {callClose.transfer_destination}</p>}</div>}
      </aside>
    </div>
  </main>;
}

function Question({ field, value, set, save, active = false, onEnter }: { field: NetflyField; value: string; set: (v: string) => void; save: (v: string) => void; active?: boolean; onEnter?: () => void }) {
  const binary = field.kind === "choice" && ["Yes", "No"].every((choice) => field.choices?.includes(choice)) && (field.choices || []).every((choice) => ["Yes", "No", "Not sure"].includes(choice));
  const choose = (choice: string) => { set(choice); save(choice); };
  return <div className={`nf-question${active ? " nf-question-current" : ""}`} onFocusCapture={onEnter} onPointerDownCapture={onEnter}>{field.kind === "choice" ? <strong className="nf-question-label">{field.label}</strong> : <label htmlFor={`nf-${field.id}`}>{field.label}</label>}{field.hint && <p className="nf-muted">{field.hint}</p>}
    {field.kind === "choice" ? <div className={binary ? "nf-choice-group" : "nf-options"} role="group" aria-label={field.label}>{binary ? <><div className="nf-options nf-options-binary">{["Yes", "No"].map((choice) => <button key={choice} type="button" aria-pressed={value === choice} className={value === choice ? "selected" : ""} onClick={() => choose(choice)}>{choice}</button>)}</div>{field.choices?.includes("Not sure") && <button type="button" className={`nf-unknown${value === "Not sure" ? " selected" : ""}`} aria-pressed={value === "Not sure"} onClick={() => choose("Not sure")}>Not sure yet</button>}</> : (field.choices || []).map((choice) => <button key={choice} type="button" aria-pressed={value === choice} className={value === choice ? "selected" : ""} onClick={() => choose(choice)}>{choice}</button>)}</div>
    : field.kind === "long" ? <textarea id={`nf-${field.id}`} value={value} onChange={(e) => set(e.target.value)} onBlur={(e) => void save(e.target.value)} />
    : <input id={`nf-${field.id}`} type={field.kind === "date" ? "date" : field.kind === "tel" ? "tel" : field.kind === "email" ? "email" : "text"} value={value} onChange={(e) => set(e.target.value)} onBlur={(e) => void save(e.target.value)} />}</div>;
}
