"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NetflyDocuments from "./NetflyDocuments";
import { NETFLY_FIELDS, NETFLY_SECTIONS, NETFLY_DQ_REASONS, activeNetflyCall, netflyFlags, parseNetflyHandoff, validateNetflyCallClose, type NetflyCallClose, type NetflyField, type NetflyLiveCall } from "@/lib/netfly-ontake";
import { DEFAULT_DQ_REASONS } from "@/lib/statuses";
import "./netfly.css";
import "./netfly-workspace.css";

type Handoff = { note: string; at: string; by_name?: string; channel?: string };
type Detail = { file: { id: string; lead_no: string; claimant_name: string; phone: string; email: string }; actor_id: string; live_call: NetflyLiveCall | null; answers: { fields?: Record<string, string>; review?: any; handoffs?: Handoff[]; source_field_revisions?: { fields: Record<string, string>; at: string; source_id: string }[]; handoff_verification?: { status: string; note: string; source_revision: number; source_field_revision?: number; at: string; by_name?: string }; call_close?: NetflyCallClose & { source_revision: number; source_field_revision?: number; at: string; by_name?: string; followup_required: boolean } }; retainer: { id: string; file_name: string; created_at: string; url: string | null }[]; canReview: boolean };

const VERIFY_STEPS = [
  { title: "1. Welcome & contact", script: "Hi, [first name], this is [your name] with Turnbull, Moak & Pendergrass. Great to meet you. I wanted to welcome you to the firm. I'll confirm your contact information, gather a few details for your case manager, and explain what happens next. If you need to reach Turnbull, the firm's number is (205) 831-5040.", fields: ["contact_accuracy", "confirmed_name", "confirmed_phone", "confirmed_email"] },
  { title: "2. Accident & police", script: "I have the date and the account of what happened from your first intake. Let me confirm those with you, along with the police report or case number.", fields: ["accident_date", "incident_story", "police_report"] },
  { title: "3. Vehicle & medical care", script: "Was the car totaled or unable to be driven? Have you received care already, including an ambulance? We recommend getting checked promptly. Can you be evaluated today?", fields: ["totaled", "drivable", "seen_doctor", "ambulance", "first_provider", "treated_injuries", "care_today", "care_today_setting", "care_today_plan"] },
  { title: "4. Treatment plan", script: "Your case manager can help coordinate care. Would a location near home or work be easier? What days and times work for you? Do you have health insurance, and with which provider?", fields: ["treatment_location", "treatment_area", "treatment_time", "treatment_days", "treatment_availability", "health_insured", "health_carrier", "treatment_barrier"] },
  { title: "5. Insurance & pictures", script: "Has any insurance company contacted you? Do you have a claim number or pictures that would help your case manager?", fields: ["insurer_contact", "insurance_notes", "insurance_claim_number", "photos"] },
  { title: "6. Outcome & next steps", script: "Thanks so much for your patience. We'll get your case entered into the system and call you back within 24 to 48 hours.", fields: ["final_notes"] },
  { title: "7. After call: review file", script: "", fields: [] },
] as const;
const verifyIds = new Set<string>(VERIFY_STEPS.flatMap((step) => [...step.fields]));
const fieldById = new Map(NETFLY_FIELDS.map((field) => [field.id, field]));
const emptyCallClose: NetflyCallClose = { closeout_version: 2, completion: "" as NetflyCallClose["completion"], disposition: "" as NetflyCallClose["disposition"], dq_reason_key: "", assessment_reason: "", transfer_destination: "", transfer_outcome: "not_attempted", transfer_note: "", client_notified_48_business_hours: false, callback_promised_24_48_hours: false };
export default function NetflyFile({ fileKey }: { fileKey: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [section, setSection] = useState(0);
  const [workspaceTab, setWorkspaceTab] = useState<"call" | "netfly_intake">("call");
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
  const [showIncidentCorrections, setShowIncidentCorrections] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [callClose, setCallClose] = useState<NetflyCallClose>(emptyCallClose);
  const [callCloseDirty, setCallCloseDirty] = useState(false);
  const [callCloseBusy, setCallCloseBusy] = useState(false);
  const [dqDialogOpen, setDqDialogOpen] = useState(false);
  const [liveCall, setLiveCall] = useState<NetflyLiveCall | null>(null);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const liveCallRef = useRef<NetflyLiveCall | null>(null);
  const actorRef = useRef("");
  useEffect(() => { liveCallRef.current = liveCall; actorRef.current = detail?.actor_id || ""; }, [liveCall, detail?.actor_id]);
  async function load(forceCall = false) {
    try { const r = await fetch(`/api/netfly?file=${encodeURIComponent(fileKey)}`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); actorRef.current = d.actor_id; liveCallRef.current = d.live_call || null; setDetail(d); setLiveCall(d.live_call || null); setValues(d.answers?.fields || {}); setReviewNote(d.answers?.review?.note || ""); if (forceCall || !callCloseDirty) { const saved = d.answers?.call_close; setCallClose(saved ? { ...emptyCallClose, ...saved, closeout_version: 2, callback_promised_24_48_hours: saved.closeout_version === 2 && saved.callback_promised_24_48_hours === true } : emptyCallClose); setCallCloseDirty(false); } }
    catch (e: any) { setError(e.message || "NETFLY file did not load."); }
  }
  useEffect(() => { void load(); }, [fileKey]);
  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const current = liveCallRef.current;
        const own = !!current && current.by === actorRef.current && !!activeNetflyCall(current);
        const response = own
          ? await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "call_presence", file: fileKey, action: "refresh" }) })
          : await fetch(`/api/netfly?file=${encodeURIComponent(fileKey)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (mounted) { liveCallRef.current = body.live_call || null; if (body.actor_id) actorRef.current = body.actor_id; setLiveCall(body.live_call || null); }
      } catch (error: any) { if (mounted) { setLiveCall(null); setError(error.message || "Could not refresh call status."); } }
    }
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [fileKey]);
  async function markCall(action: "start" | "end") {
    setPresenceBusy(true); setError("");
    try { const response = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "call_presence", file: fileKey, action }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); liveCallRef.current = body.live_call || null; setLiveCall(body.live_call || null); }
    catch (error: any) { setError(error.message || "Call status did not save."); }
    finally { setPresenceBusy(false); }
  }
  async function save(id: string, value: string) {
    setSaveState(`Saving ${id}…`); setError("");
    try { const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "answer", file: fileKey, field: id, value }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); if (["confirmed_name", "confirmed_phone", "confirmed_email"].includes(id)) setDetail((old) => old ? { ...old, file: { ...old.file, [id === "confirmed_name" ? "claimant_name" : id === "confirmed_phone" ? "phone" : "email"]: value } } : old); setSaveState("Saved"); }
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
      transfer_destination: "", transfer_outcome: "not_attempted",
      transfer_note: "", client_notified_48_business_hours: false, callback_promised_24_48_hours: false,
    }));
    setCallCloseDirty(true);
    if (disposition === "appears_dq") setDqDialogOpen(true);
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
  const answered = [...verifyIds].filter((id) => values[id]?.trim()).length;
  const flags = netflyFlags(values);
  const latest = detail.retainer[0];
  const handoffs = detail.answers.handoffs || [];
  const originalHandoff = handoffs[0];
  const latestHandoff = handoffs.at(-1);
  const sourceRows = parseNetflyHandoff(latestHandoff?.note || "");
  const sourceFieldRevisions = detail.answers.source_field_revisions || [];
  const sourceFieldRows = Object.entries(sourceFieldRevisions.at(-1)?.fields || {});
  const checked = detail.answers.handoff_verification?.source_revision === handoffs.length &&
    (detail.answers.handoff_verification?.source_field_revision ?? 0) === sourceFieldRevisions.length && handoffs.length > 0;
  const callRecorded = detail.answers.call_close?.closeout_version === 2 && detail.answers.call_close?.source_revision === handoffs.length &&
    (detail.answers.call_close?.source_field_revision ?? 0) === sourceFieldRevisions.length &&
    handoffs.length > 0 && !callCloseDirty && !validateNetflyCallClose(detail.answers.call_close);
  const renderStep = (stepIndex: number) => {
    const current = VERIFY_STEPS[stepIndex];
    const sourceLabels = new Set(sourceRows.map((row) => row.label));
    const visible = current.fields.map((id) => fieldById.get(id)).filter((f): f is NetflyField => {
      if (!f || (f.when && !(stepIndex === 0 && f.id === "confirmed_name") && values[f.when.id] !== f.when.is)) return false;
      if (stepIndex === 0 && ["confirmed_name", "confirmed_phone", "confirmed_email"].includes(f.id)) {
        const existing = f.id === "confirmed_name" ? detail.file.claimant_name : f.id === "confirmed_phone" ? detail.file.phone : detail.file.email;
        return values.contact_accuracy === "Needs correction" || !existing;
      }
      if (stepIndex === 1 && !showIncidentCorrections && latestHandoff) {
        if (values[f.id]?.trim()) return true;
        const label = f.id === "accident_date" ? "Accident Date" : f.id === "incident_story" ? "Accident Summary" : "Case #";
        return !sourceLabels.has(label);
      }
      if (f.id === "care_today_setting") return values.care_today === "Yes";
      if (f.id === "care_today_plan") return values.care_today === "No" || values.care_today === "Not sure";
      if (f.id === "health_carrier") return values.health_insured === "Yes";
      return true;
    });
    return <div key={current.title} id={`nf-step-${stepIndex}`} className="nf-step-card">
    <section className="nf-panel nf-intake"><div className="nf-section-head"><p className="nf-eyebrow">Case-manager welcome call · original intake preserved</p><h2>{current.title}</h2><span aria-live="polite">{saveState}</span></div>{(viewMode !== "simple" || stepIndex === 0 || stepIndex === 5) && current.script && <div className="nf-script"><strong>Say</strong><p>{current.script}</p></div>}
      {stepIndex === 0 && <div className="nf-contact-readback"><strong>Confirm what we have</strong><p>Name: {detail.file.claimant_name || "Missing"}</p><p>Phone: {detail.file.phone || "Missing — add after the live transfer"}</p><p>Email: {detail.file.email || "Missing"}</p><p className="nf-muted">Ask for corrections only. The retainer was already signed.</p></div>}
      {stepIndex === 1 && <div className="nf-handoff-inline"><strong>Confirm date of loss, what happened, and the police case number</strong><p>Use the first intake below as your starting point. Add only missing or corrected facts.</p>{sourceRows.length ? <><div className="nf-source-grid">{sourceRows.filter((row) => ["Accident Date", "Accident Summary", "Case #", "Location"].includes(row.label)).map((row) => <div className="nf-source-item" key={row.label}><strong>{row.label}</strong><p>{row.value}</p></div>)}</div><details className="nf-history"><summary>See the full original note</summary><div className="nf-source-grid">{sourceRows.map((row) => <div className="nf-source-item" key={row.label}><strong>{row.label}</strong><p>{row.value}</p></div>)}</div></details></> : latestHandoff ? <p className="nf-source-note">{latestHandoff.note}</p> : <p className="nf-alert">No handoff note is on this file. Add it in File before the call continues.</p>}{latestHandoff && <button type="button" className="nf-secondary" onClick={() => setShowIncidentCorrections((old) => !old)}>{showIncidentCorrections ? "Hide correction fields" : "Add or correct incident details"}</button>}{sourceFieldRows.length > 0 && <details className="nf-history"><summary>{sourceFieldRows.length} original LawRuler form answers</summary><div className="nf-source-grid">{sourceFieldRows.map(([label, value]) => <div className="nf-source-item" key={label}><strong>{label}</strong><p>{value}</p></div>)}</div></details>}</div>}
      {visible.length > 0 && <div className="nf-questions">{visible.map((field) => <Question key={field.id} field={field} value={values[field.id] || ""} set={(value) => set(field.id, value)} save={(value) => save(field.id, value)} active={viewMode === "all" && activeQuestion === field.id} onEnter={() => setActiveQuestion(field.id)} />)}</div>}
      {stepIndex === 1 && latestHandoff && <div className="nf-handoff-check"><strong>{checked ? `Checked with client · ${detail.answers.handoff_verification?.status === "matches" ? "details match" : "changes recorded"}` : "Confirm NETFLY's note with the client"}</strong><p className="nf-muted">The first intake stays intact. If the client corrects anything, describe it and record the corrected answer above.</p><textarea className="nf-source-input" value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="What changed? Leave blank if the read-back matches." /><div className="nf-actions"><button className="nf-secondary" disabled={verificationBusy} onClick={() => void verifyHandoff("matches")}>Details match</button><button className="nf-primary" disabled={verificationBusy || verificationNote.trim().length < 5} onClick={() => void verifyHandoff("changes_recorded")}>Record changes</button></div></div>}
      {stepIndex === 2 && <div className="nf-care-prompt"><strong>Care today</strong><p>We recommend getting checked promptly. The ER is an option, or urgent care if the ER is not possible. For severe or worsening symptoms, call 911 or seek emergency care. Your case manager will use the plan you record above.</p></div>}
      {stepIndex === 4 && <NetflyDocuments fileKey={fileKey} canEdit={detail.canReview} />}
      {stepIndex === 6 && <div className="nf-call-block"><p className="nf-muted">Record completion and outcome separately. An apparent DQ stays on this signed file for supervisor review; it does not cancel representation.</p>
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
        {callClose.disposition && <p className="nf-muted">Record the call result below.</p>}
      </div>}
      {stepIndex === 6 && <div className="nf-call-block nf-finish-call"><strong>After the call: record the result</strong><label className="nf-inline-confirm"><input type="checkbox" checked={callClose.callback_promised_24_48_hours === true} onChange={(e) => updateCallClose("callback_promised_24_48_hours", e.target.checked)} /> I told the client we will call back within 24–48 hours.</label><button type="button" className="nf-primary" disabled={callCloseBusy || !callClose.disposition || !callClose.callback_promised_24_48_hours} onClick={() => void recordCallClose()}>{callCloseBusy ? "Recording…" : callRecorded ? "Update call result" : "Record call result"}</button>{callRecorded && <p className="nf-saved">Call result saved. A callback is needed within 24–48 hours. {callClose.completion === "incomplete" ? "Finish the missing details on the next call." : "Send the completed file for supervisor review below."}</p>}<p className="nf-muted">{callClose.completion === "incomplete" ? "This file stays open for the callback." : "The signed retainer, verified note, and call result stay together for review."}</p></div>}
      {stepIndex === 6 && <section className="nf-inline-retainer" aria-label="Original signed retainer">
        <h3>Already signed — review the NETFLY retainer</h3>
        <p>NETFLY collected this before the welcome call. Review the signed PDF after the call, before sending the completed file for supervisor review.</p>
        {latest ? <>
          <p className="nf-muted">{latest.file_name} · received {new Date(latest.created_at).toLocaleString()}</p>
          <div className="nf-actions">
            <button type="button" className="nf-primary" disabled={!latest.url} onClick={() => { setOpenedOriginalId(latest.id); setOriginalConfirmed(false); }}>Open signed PDF here</button>
            {latest.url && <a className="nf-secondary" href={latest.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpenedOriginalId(latest.id)}>Open in new tab</a>}
            <button type="button" className="nf-secondary" onClick={() => void load()}>Refresh PDF link</button>
          </div>
          {openedOriginalId === latest.id && latest.url && <div className="nf-pdf-preview"><iframe title="NETFLY original signed retainer" src={latest.url} referrerPolicy="no-referrer" /><p className="nf-muted">If the PDF cannot display here, open it in a new tab.</p></div>}
          {detail.answers.review?.retainer_reviewed_document_id === latest.id ? <p className="nf-saved">Signed PDF reviewed. Complete the file review below.</p> : openedOriginalId === latest.id && latest.url && <>
            <label className="nf-inline-confirm"><input type="checkbox" checked={originalConfirmed} onChange={(event) => setOriginalConfirmed(event.target.checked)} /> I checked the signed name, agreement, date and signature.</label>
            <button type="button" className="nf-primary" disabled={!originalConfirmed || !detail.canReview} onClick={() => void review("retainer_reviewed", latest.id)}>Record signed-PDF review</button>
          </>}
          {openedOriginalId === latest.id && <details className="nf-history nf-inline-issue"><summary>Something is wrong with the signed retainer</summary><p>Keep the original PDF. Describe the exact error for a supervisor; this is an exception to the welcome call.</p><textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="What is wrong with the name, date, signature or agreement?" /><button type="button" className="nf-secondary" disabled={reviewNote.trim().length < 5 || detail.answers.review?.retainer_reviewed_document_id !== latest.id} onClick={() => void review("correction_needed", latest.id)}>Flag original for supervisor correction</button>{detail.answers.review?.retainer_reviewed_document_id !== latest.id && <p className="nf-muted">Record that you inspected the signed PDF above first.</p>}</details>}
        </> : <div className="nf-actions"><p className="nf-alert">The signed PDF is missing. Upload NETFLY's original before marking it reviewed.</p><label className="nf-primary">{uploading ? "Uploading…" : "Upload signed PDF"}<input type="file" accept="application/pdf,.pdf" disabled={uploading} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label></div>}
      </section>}
      {stepIndex === 6 && <div className="nf-call-block"><button type="button" className="nf-primary" disabled={!latest || !checked || !callRecorded || callClose.completion !== "complete" || callClose.disposition === "callback_to_finish" || (detail.answers.review?.status === "correction_needed" || detail.answers.review?.retainer_reviewed_document_id !== latest.id)} onClick={() => void review("ready_for_review")}>{detail.answers.review?.status === "ready_for_review" ? "Ready for supervisor review" : "Send completed ontake to review"}</button></div>}
      {viewMode === "step" && <div className="nf-footer"><button className="nf-secondary" disabled={stepIndex === 0} onClick={() => setSection((i) => Math.max(0, i - 1))}>← Previous</button><button className="nf-primary" onClick={() => setSection((i) => Math.min(VERIFY_STEPS.length - 1, i + 1))} disabled={stepIndex === VERIFY_STEPS.length - 1}>Next step →</button></div>}</section>
    </div>;
  };
  return <main className="nf-page nf-workspace">
    <div className="nf-head"><div><Link href="/app/netfly" className="nf-back">← NETFLY files</Link><p className="nf-eyebrow">Signed transfer · {detail.file.lead_no}</p><h1>{detail.file.claimant_name}</h1><p>{detail.file.phone || "No phone"} · {detail.file.email || "No email"}</p></div><span className="nf-progress">Welcome &amp; verify</span></div>
    <div className="nf-live-status" role="status"><strong>{activeNetflyCall(liveCall) ? `On phone · ${liveCall!.by_name}` : "No agent marked on the phone"}</strong>
      {detail.canReview && (!activeNetflyCall(liveCall) ? <button type="button" className="nf-primary" disabled={presenceBusy} onClick={() => void markCall("start")}>I’m speaking with this client</button>
        : liveCall?.by === detail.actor_id ? <button type="button" className="nf-secondary" disabled={presenceBusy} onClick={() => void markCall("end")}>I’m off the call</button> : null)}</div>
    {(!latest || !handoffs.length) && <div className="nf-alert" role="status"><strong>Partial NETFLY file</strong><p>{!handoffs.length ? "NETFLY handoff note missing. " : ""}{!latest ? "Signed retainer PDF missing. " : ""}The file is held from review until both arrive.</p></div>}
    {error && <div className="nf-alert" role="alert">{error}</div>}
    {flags.length > 0 && <div className="nf-alert"><strong>Supervisor attention</strong>{flags.map((flag) => <p key={flag}>{flag}</p>)}<p>Finish the file and flag it. Do not auto-decline.</p></div>}
    <div className="nf-workspace-grid">
      <aside className="nf-review-rail" aria-label="Intake review">
        <div className="nf-rail-title"><strong>Case-manager guide</strong><span>Signed transfer</span></div>
        <div className="nf-rail-progress" role="status">{answered} case-manager details captured · {checked ? "Note verified" : "Verify note"} · {callRecorded ? "Outcome recorded" : "Record outcome"}{!latest ? " · Signed PDF needed" : ""}</div>
        <nav className="nf-rail-steps" aria-label="Welcome call sections">{VERIFY_STEPS.map((step, i) => <button type="button" key={step.title} aria-current={section === i ? "step" : undefined} className={section === i ? "active" : ""} onClick={() => { setWorkspaceTab("call"); setSection(i); if (step.fields[0]) setActiveQuestion(step.fields[0]); if (viewMode !== "step") document.getElementById(`nf-step-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{step.title}</button>)}</nav>
      </aside>
      <div className="nf-workspace-body">
        <div className="nf-workspace-tabs" role="tablist" aria-label="NETFLY file workspace">
          <button type="button" role="tab" aria-selected={workspaceTab === "call"} className={workspaceTab === "call" ? "active" : ""} onClick={() => setWorkspaceTab("call")}>Case-manager call</button>
          <button type="button" role="tab" aria-selected={workspaceTab === "netfly_intake"} className={workspaceTab === "netfly_intake" ? "active" : ""} onClick={() => setWorkspaceTab("netfly_intake")}>NETFLY intake</button>
        </div>
        {workspaceTab === "call" ? <>
        <div className={`nf-view-bar${headerCollapsed ? " nf-view-bar-collapsed" : ""}`}><div><strong>Welcome call · {detail.file.claimant_name}</strong>{!headerCollapsed && <span>Verify the first intake; ask only what is missing or changed.</span>}</div>{!headerCollapsed && <div className="nf-view-actions"><div className="nf-view-tabs" role="tablist" aria-label="Intake view">{([["all", "All questions"], ["simple", "Simple form"], ["step", "Training Mode"]] as const).map(([mode, label]) => <button type="button" key={mode} role="tab" aria-selected={viewMode === mode} className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>{label}</button>)}</div><button type="button" className="nf-command-toggle nf-secondary" aria-controls="netfly-command" aria-expanded={commandOpen} onClick={() => setCommandOpen(true)}>Command center</button></div>}<button type="button" className="nf-header-toggle" aria-expanded={!headerCollapsed} onClick={() => setHeaderCollapsed((old) => !old)}>{headerCollapsed ? "Show header" : "Hide header"}</button></div>
        {viewMode === "step" ? <>
          {renderStep(section)}
        </> : <div className={`nf-all-steps${viewMode === "simple" ? " nf-simple-steps" : ""}`}>{VERIFY_STEPS.map((_, i) => renderStep(i))}</div>}
        </> : <section className="nf-panel nf-archive" role="tabpanel" aria-label="NETFLY intake">
          <h2>NETFLY intake</h2>
          <p className="nf-muted">NETFLY's original note, mapped source answers, and the earlier questionnaire stay here for reference. Use Case-manager call for today's conversation.</p>
          {latestHandoff && <details className="nf-history" open><summary>Original handoff note and corrections ({handoffs.length})</summary>{handoffs.map((item, i) => <div className="nf-source-revision" key={`${item.at}-${i}`}><strong>{i === 0 ? "Original" : `Correction ${i}`} · {new Date(item.at).toLocaleString()}</strong><p>{item.note}</p></div>)}</details>}
          {sourceFieldRows.length > 0 && <details className="nf-history"><summary>LawRuler source answers ({sourceFieldRows.length})</summary><div className="nf-archive-answers">{sourceFieldRows.map(([label, value]) => <div key={label}><strong>{label}</strong><span>{value}</span></div>)}</div></details>}
          <h3>Earlier questionnaire</h3>
          {NETFLY_SECTIONS.map((group) => <details className="nf-history" key={group.id}><summary>{group.title.replace(/^\d+\.\s*/, "")}</summary><div className="nf-archive-answers">{group.fields.map((field) => <div key={field.id}><strong>{field.label}</strong><span>{values[field.id]?.trim() || "Not recorded"}</span></div>)}</div></details>)}
        </section>}
      </div>
      <aside id="netfly-command" className={`nf-command${commandOpen ? " nf-command-open" : ""}`} aria-label="Command center">
        <div className="nf-command-head"><div><strong>Command center</strong></div><button type="button" className="nf-command-close" onClick={() => setCommandOpen(false)} aria-label="Close Command center">×</button></div>
        <div className="nf-command-tabs" aria-label="Command center sections"><button type="button" className={commandTab === "file" ? "active" : ""} onClick={() => setCommandTab("file")}>File</button><button type="button" className={commandTab === "phone" ? "active" : ""} onClick={() => setCommandTab("phone")}>Phone</button><label className="nf-command-more">More tools<select aria-label="More command center tools" value={commandTab === "file" || commandTab === "phone" ? "" : commandTab} onChange={(event) => setCommandTab(event.target.value as "agreement" | "scripts")}><option value="">Choose…</option><option value="scripts">Scripts</option><option value="agreement">Agreement correction</option></select></label></div>
        {commandTab === "file" && <div className="nf-command-content">
    <div className="nf-retainer"><div><strong>Already signed with NETFLY</strong><p>{latest ? `Original PDF received ${new Date(latest.created_at).toLocaleString()} · ${detail.answers.review?.status || "Review needed"}` : "Original signed PDF missing — upload it before reviewing the agreement."}</p></div><div className="nf-actions"><label className="nf-secondary">{uploading ? "Uploading…" : "Upload signed PDF"}<input type="file" accept="application/pdf,.pdf" disabled={uploading} hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>{latest?.url && <a className="nf-secondary" href={latest.url} target="_blank" rel="noopener noreferrer">View signed PDF</a>}</div></div>
    {detail.retainer.length > 1 && <details className="nf-history"><summary>Earlier uploaded originals ({detail.retainer.length - 1})</summary>{detail.retainer.slice(1).map((d) => <p key={d.id}>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.file_name}</a> : d.file_name} · {new Date(d.created_at).toLocaleString()}</p>)}</details>}
    <section className="nf-panel nf-source"><div className="nf-source-heading"><div><p className="nf-eyebrow">Already collected by NETFLY</p><h2>Handoff note</h2><p className="nf-muted">Use this to verify the important facts. It is NETFLY's account, not the client's confirmed answers.</p></div>{latestHandoff && <span className="nf-source-time">Received {new Date(latestHandoff.at).toLocaleString()}</span>}</div>
      {sourceRows.length ? <div className="nf-source-grid">{sourceRows.map((row) => <div className="nf-source-item" key={row.label}><strong>{row.label}</strong><p>{row.value}</p></div>)}</div> : latestHandoff ? <p className="nf-source-note">{latestHandoff.note}</p> : <p className="nf-alert">No NETFLY handoff note is on this file yet. Add the note before the welcome call.</p>}
      {sourceFieldRows.length > 0 && <details className="nf-history"><summary>{sourceFieldRows.length} separate original form answers · {sourceFieldRevisions.length} source version(s)</summary><div className="nf-source-grid">{sourceFieldRows.map(([label, value]) => <div className="nf-source-item" key={label}><strong>{label}</strong><p>{value}</p></div>)}</div></details>}
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
        {commandTab === "phone" && <div className="nf-command-content"><h2>Phone</h2><p className="nf-muted">Check the active JustCall conversation before dialing so a second agent does not call this client at the same time. Close the welcome call with the 24–48-hour callback promise in the center intake.</p>{detail.file.phone && <p><strong>Client number:</strong> {detail.file.phone}</p>}</div>}
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
