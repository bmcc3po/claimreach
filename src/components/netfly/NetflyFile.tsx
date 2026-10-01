"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { NETFLY_FIELDS, NETFLY_SECTIONS, netflyFlags, parseNetflyHandoff, validateNetflyCallClose, type NetflyCallClose, type NetflyField } from "@/lib/netfly-ontake";
import { agreementChoice } from "@/lib/mva-call/agreement-choice";
import "./netfly.css";
import "./netfly-workspace.css";

type Handoff = { note: string; at: string; by_name?: string; channel?: string };
type Detail = { file: { id: string; lead_no: string; claimant_name: string; phone: string; email: string }; answers: { fields?: Record<string, string>; review?: any; handoffs?: Handoff[]; handoff_verification?: { status: string; note: string; source_revision: number; at: string; by_name?: string }; call_close?: NetflyCallClose & { source_revision: number; at: string; by_name?: string; followup_required: boolean } }; retainer: { id: string; file_name: string; created_at: string; url: string | null }[]; canReview: boolean };
type Correction = { name: string; email: string; city: string; state: string; accident_date: string; nv_variant: "tiered" | "flat"; nv_reason: string };
type CorrectionAgreement = { id: string; status: string; template_key: string; signer_name: string; email: string; sent_at: string; signed_at: string | null; agent_reviewed_at: string | null; completed_at: string | null; sign_url: string | null; client_pdf_url: string | null; final_pdf_url: string | null; packet_ready: boolean };

const VERIFY_STEPS = [
  { title: "1. Welcome & care", script: "Hi, my name is [your name] from Turnbull, Moak & Pendergrass. It's great to meet you. Let me be the first to welcome you to the firm. NETFLY has already sent us your signed agreement and what you told them. I'd like to check that we have it right, fill in any gaps, and answer your questions. Most importantly, have you seen a doctor yet to get checked out?", fields: ["seen_doctor", "first_provider", "first_visit", "ambulance", "treated_injuries", "other_pain", "still_treating", "current_provider", "last_appointment", "next_appointment"] },
  { title: "2. Verify their story", script: "Let me read back what NETFLY sent us so we don't make you repeat the whole story. I have your name as [spell name], and the accident as [date and location]. Is that right? What has changed, and what did we miss?", fields: ["confirmed_name", "name_confirmed", "dob", "mailing_address", "confirmed_phone", "confirmed_email", "accident_date", "road", "position", "incident_story", "fault", "passengers", "passenger_details"] },
  { title: "3. Fill the gaps", script: "I have most of the accident details already. I just want to check the pieces the case manager will need: the police report, the vehicles and insurance, your treatment plan, and whether anyone else is representing you.", fields: ["police_came", "police_report", "ticket", "other_insurer", "other_claim", "drivable", "totaled", "photos", "insurer_contact", "recorded_statement", "other_lawyer_talk", "other_lawyer_signed", "client_questions"] },
  { title: "4. Your assessment", script: "Thank you. I'm going to put my best assessment on the file for the legal team. I don't make the final decision on your case, but I want them to see why I think it may fit or what needs a closer look.", fields: [] },
  { title: "5. Meet the case manager", script: "While I have you on the phone, I just want to see if your case manager is at her desk to say hi. Would that be okay?", fields: ["final_notes"] },
] as const;
const verifyIds = new Set<string>(VERIFY_STEPS.flatMap((step) => [...step.fields]));
const fieldById = new Map(NETFLY_FIELDS.map((field) => [field.id, field]));
const emptyCallClose: NetflyCallClose = { assessment: "" as NetflyCallClose["assessment"], assessment_reason: "", transfer_destination: "", transfer_outcome: "" as NetflyCallClose["transfer_outcome"], transfer_note: "", client_notified_48_business_hours: false };
export default function NetflyFile({ fileKey }: { fileKey: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [section, setSection] = useState(0);
  const [viewMode, setViewMode] = useState<"step" | "all" | "simple">("step");
  const [commandTab, setCommandTab] = useState<"file" | "agreement" | "scripts" | "phone">("file");
  const [commandOpen, setCommandOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [openedOriginalId, setOpenedOriginalId] = useState<string | null>(null);
  const [originalConfirmed, setOriginalConfirmed] = useState(false);
  const [openedCorrectionId, setOpenedCorrectionId] = useState<string | null>(null);
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
  const [callCloseDirty, setCallCloseDirty] = useState(false);
  const [callCloseBusy, setCallCloseBusy] = useState(false);
  const [correction, setCorrection] = useState<Correction>({ name: "", email: "", city: "", state: "", accident_date: "", nv_variant: "tiered", nv_reason: "" });
  const [correctionDirty, setCorrectionDirty] = useState(false);
  const [correctionPreviewed, setCorrectionPreviewed] = useState(false);
  const [correctionPreviewUrl, setCorrectionPreviewUrl] = useState<string | null>(null);
  const [correctionAgreement, setCorrectionAgreement] = useState<CorrectionAgreement | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [officeDob, setOfficeDob] = useState("");
  const [officeSsn, setOfficeSsn] = useState("");
  async function load(forceCall = false) {
    try { const r = await fetch(`/api/netfly?file=${encodeURIComponent(fileKey)}`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setDetail(d); setValues(d.answers?.fields || {}); setReviewNote(d.answers?.review?.note || ""); if (!correctionDirty) setCorrection({ name: d.answers?.fields?.confirmed_name || d.file.claimant_name || "", email: d.answers?.fields?.confirmed_email || d.file.email || "", city: d.answers?.fields?.accident_city || "", state: d.answers?.fields?.accident_state || "", accident_date: d.answers?.fields?.accident_date || "", nv_variant: "tiered", nv_reason: "" }); if (forceCall || !callCloseDirty) { setCallClose(d.answers?.call_close ? { ...emptyCallClose, ...d.answers.call_close } : emptyCallClose); setCallCloseDirty(false); } const sr = await fetch(`/api/netfly/esign?file=${encodeURIComponent(fileKey)}`, { cache: "no-store" }); if (sr.ok) { const signing = await sr.json(); setCorrectionAgreement(signing.agreement || null); } else if (d.answers?.review?.status === "correction_needed") { const signing = await sr.json().catch(() => ({})); throw new Error(signing.error || "Could not check the corrected agreement. Refresh before continuing."); } }
    catch (e: any) { setError(e.message || "NETFLY file did not load."); }
  }
  useEffect(() => { void load(); }, [fileKey]);
  useEffect(() => () => { if (correctionPreviewUrl) URL.revokeObjectURL(correctionPreviewUrl); }, [correctionPreviewUrl]);
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
  const changeCorrection = <K extends keyof Correction>(key: K, value: Correction[K]) => { setCorrection((old) => ({ ...old, [key]: value })); setCorrectionDirty(true); setCorrectionPreviewed(false); setCorrectionPreviewUrl(null); };
  async function correctionAction(op: "preview" | "send" | "review" | "complete") {
    if (op === "send") {
      if (!correctionPreviewed) { setError("Open and inspect the corrected packet preview before sending it."); return; }
      const label = agreementChoice(`${correction.city}, ${correction.state}`, correction.nv_variant, ["TX", "FL", "NV", "NV_FLAT", "OTHER"]).label;
      if (!window.confirm(`Send the corrected ${label} retainer to ${correction.email}? The original signed PDF will remain on the file.`)) return;
    }
    setCorrectionBusy(true); setError("");
    try {
      const r = await fetch("/api/netfly/esign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, file: fileKey, ...correction, confirm: op === "send", agreement_id: correctionAgreement?.id, dob: officeDob, ssn: officeSsn }) });
      if (op === "preview" && r.ok) { setCorrectionPreviewUrl(URL.createObjectURL(await r.blob())); setCorrectionPreviewed(false); return; }
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Corrected agreement action failed.");
      if (op === "complete") setOfficeSsn("");
      await load();
    } catch (e: any) { setError(e.message || "Corrected agreement action failed. Refresh the agreement status before retrying."); }
    finally { setCorrectionBusy(false); }
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
  const callRecorded = detail.answers.call_close?.source_revision === handoffs.length && handoffs.length > 0 && !callCloseDirty;
  const correctedComplete = correctionAgreement?.status === "completed" && !!correctionAgreement.agent_reviewed_at && correctionAgreement.packet_ready;
  const renderStep = (stepIndex: number) => {
    const current = VERIFY_STEPS[stepIndex];
    const visible = current.fields.map((id) => fieldById.get(id)).filter((f): f is NetflyField => !!f && (!f.when || values[f.when.id] === f.when.is));
    return <div key={current.title} className="nf-step-card">
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
      {visible.length > 0 && <div className="nf-questions">{visible.map((field) => <Question key={field.id} field={field} value={values[field.id] || ""} set={(value) => set(field.id, value)} save={(value) => save(field.id, value)} />)}</div>}
      {stepIndex === 1 && latestHandoff && <div className="nf-handoff-check"><strong>{checked ? `Checked with client · ${detail.answers.handoff_verification?.status === "matches" ? "details match" : "changes recorded"}` : "Confirm NETFLY's note with the client"}</strong><p className="nf-muted">The first intake stays intact. If the client corrects anything, describe it and record the corrected answer above.</p><textarea className="nf-source-input" value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="What changed? Leave blank if the read-back matches." /><div className="nf-actions"><button className="nf-secondary" disabled={verificationBusy} onClick={() => void verifyHandoff("matches")}>Details match</button><button className="nf-primary" disabled={verificationBusy || verificationNote.trim().length < 5} onClick={() => void verifyHandoff("changes_recorded")}>Record changes</button></div></div>}
      {stepIndex === 3 && <div className="nf-call-block"><p className="nf-muted">Use the verified facts and any supervisor flags above. This is your provisional judgment for the legal team; it does not accept or decline a signed client.</p><div className="nf-options nf-assessment">{[["likely_case", "Likely a case"], ["needs_review", "Needs closer review"], ["unlikely_case", "May not be a case"]].map(([value, label]) => <button key={value} type="button" className={callClose.assessment === value ? "selected" : ""} onClick={() => updateCallClose("assessment", value as NetflyCallClose["assessment"])}>{label}</button>)}</div><label className="nf-call-label">What makes you think that?<textarea value={callClose.assessment_reason} onChange={(e) => updateCallClose("assessment_reason", e.target.value)} placeholder="Briefly explain the facts that support your judgment or need a legal review." /></label>{flags.length > 0 && <p className="nf-alert">These flags still require supervisor attention. Do not decline the client on this call.</p>}</div>}
      {stepIndex === 4 && <div className="nf-call-block"><p className="nf-muted">Ask permission, then use the existing phone/JustCall transfer controls. The destination is open for the agent to enter when known; choosing an outcome here does not place a call.</p><label className="nf-call-label">Case manager number or queue<input value={callClose.transfer_destination} onChange={(e) => updateCallClose("transfer_destination", e.target.value)} placeholder="Enter the number or JustCall queue when available" /></label><strong>What happened?</strong><div className="nf-options nf-assessment">{[["connected", "Connected live"], ["attempted_no_answer", "Attempted, no answer"], ["client_declined", "Client declined"], ["not_attempted", "Not attempted"]].map(([value, label]) => <button key={value} type="button" className={callClose.transfer_outcome === value ? "selected" : ""} onClick={() => updateCallClose("transfer_outcome", value as NetflyCallClose["transfer_outcome"])}>{label}</button>)}</div>{callClose.transfer_outcome === "client_declined" && <div className="nf-followup"><strong>Say</strong><p>Of course. Your case manager will call you within 48 business hours.</p><label><input type="checkbox" checked={callClose.client_notified_48_business_hours} onChange={(e) => updateCallClose("client_notified_48_business_hours", e.target.checked)} /> I told the client this</label></div>}<label className="nf-call-label">Transfer or follow-up note<textarea value={callClose.transfer_note} onChange={(e) => updateCallClose("transfer_note", e.target.value)} placeholder="Who did you try? If you could not try, why?" /></label><button className="nf-primary" disabled={callCloseBusy} onClick={() => void recordCallClose()}>{callCloseBusy ? "Recording…" : callRecorded ? "Update assessment and transfer result" : "Record assessment and transfer result"}</button>{callRecorded && <p className="nf-saved">Recorded by {detail.answers.call_close?.by_name || "agent"} at {new Date(detail.answers.call_close!.at).toLocaleString()}. {detail.answers.call_close?.followup_required ? "Case-manager follow-up still needed." : "Live introduction connected."}</p>}</div>}
      {stepIndex === 4 && <div className="nf-call-block nf-finish-call"><strong>Finish the welcome call</strong><p className="nf-muted">The signed retainer, note check, assessment and case-manager introduction stay together on this file.</p><button type="button" className="nf-primary" disabled={!latest || !checked || !callRecorded || (detail.answers.review?.status === "correction_needed" ? !correctedComplete : detail.answers.review?.retainer_reviewed_document_id !== latest.id)} onClick={() => void review("ready_for_review")}>{detail.answers.review?.status === "ready_for_review" ? "Ready for supervisor review" : "Send welcome call to review"}</button></div>}
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
        <div className="nf-rail-card"><strong>{detail.file.claimant_name}</strong><span>{detail.file.lead_no}</span><a href={`tel:${detail.file.phone}`}>{detail.file.phone || "No phone"}</a><span>{detail.file.email || "No email"}</span></div>
        <div className="nf-rail-card"><strong>Call progress</strong><span>{answered} details captured</span><span>{checked ? "NETFLY note verified" : "Verify NETFLY note"}</span><span>{callRecorded ? "Call outcome recorded" : "Record call outcome"}</span><span>{latest ? "Signed PDF on file" : "Signed PDF needed"}</span></div>
        <nav className="nf-rail-steps" aria-label="Welcome call sections">{VERIFY_STEPS.map((step, i) => <button type="button" key={step.title} aria-current={section === i ? "step" : undefined} className={section === i ? "active" : ""} onClick={() => { setSection(i); setViewMode("step"); }}>{step.title}</button>)}</nav>
      </aside>
      <div className="nf-workspace-body">
        <div className={`nf-view-bar${headerCollapsed ? " nf-view-bar-collapsed" : ""}`}><div><strong>Welcome call · {detail.file.claimant_name}</strong>{!headerCollapsed && <span>Verify the first intake; ask only what is missing or changed.</span>}</div>{!headerCollapsed && <div className="nf-view-actions"><div className="nf-view-tabs" role="tablist" aria-label="Intake view">{([["step", "Step by step"], ["all", "All questions"], ["simple", "Simple form"]] as const).map(([mode, label]) => <button type="button" key={mode} role="tab" aria-selected={viewMode === mode} className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>{label}</button>)}</div><button type="button" className="nf-command-toggle nf-secondary" aria-controls="netfly-command" aria-expanded={commandOpen} onClick={() => setCommandOpen(true)}>Command center</button></div>}<button type="button" className="nf-header-toggle" aria-expanded={!headerCollapsed} onClick={() => setHeaderCollapsed((old) => !old)}>{headerCollapsed ? "Show header" : "Hide header"}</button></div>
        {viewMode === "step" ? <>
    <nav className="nf-steps" aria-label="Welcome call steps">{VERIFY_STEPS.map((s, i) => <button key={s.title} className={i === section ? "active" : ""} onClick={() => setSection(i)}>{s.title}</button>)}</nav>
          {renderStep(section)}
        </> : <div className={`nf-all-steps${viewMode === "simple" ? " nf-simple-steps" : ""}`}>{VERIFY_STEPS.map((_, i) => renderStep(i))}</div>}
    <details key={viewMode} open={viewMode === "all" ? true : undefined} className="nf-history nf-extra"><summary>More details, only if missing or changed</summary><p className="nf-muted">NETFLY already completed intake. Open only the questions needed to resolve a gap or new information. {answered} answers have been saved on this file.</p>{NETFLY_SECTIONS.map((group) => { const extras = group.fields.filter((field) => !verifyIds.has(field.id) && (!field.when || values[field.when.id] === field.when.is)); return extras.length ? <div key={group.id}><h3>{group.title}</h3><div className="nf-questions">{extras.map((field) => <Question key={field.id} field={field} value={values[field.id] || ""} set={(value) => set(field.id, value)} save={(value) => save(field.id, value)} />)}</div></div> : null; })}</details>
      </div>
      <aside id="netfly-command" className={`nf-command${commandOpen ? " nf-command-open" : ""}`} aria-label="Command center">
        <div className="nf-command-head"><div><strong>Command center</strong><span>Contact, documents &amp; activity</span></div><button type="button" className="nf-command-close" onClick={() => setCommandOpen(false)} aria-label="Close Command center">×</button></div>
        <div className="nf-command-tabs" role="tablist" aria-label="Command center sections">{([["file", "File"], ["agreement", "Agreement"], ["scripts", "Scripts"], ["phone", "Phone"]] as const).map(([tab, label]) => <button type="button" key={tab} role="tab" aria-selected={commandTab === tab} className={commandTab === tab ? "active" : ""} onClick={() => setCommandTab(tab)}>{label}</button>)}</div>
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
      {(!latest || !checked || !callRecorded || detail.answers.review?.retainer_reviewed_document_id !== latest?.id) && <p className="nf-muted">To send for review, upload and review the signed PDF, verify the latest NETFLY note, and record your assessment and case-manager introduction result.</p>}
      <details className="nf-history nf-emergency"><summary>Break glass · Correct a signed retainer</summary><p>This is outside the normal NETFLY call. Open it only when the signed retainer has a real error, such as a misspelled name or wrong agreement. Review the original PDF first; it stays in history.</p><label>What is wrong?<textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Describe the exact error and correction needed." /></label><div className="nf-actions">{latest && <button className="nf-secondary" disabled={reviewNote.trim().length < 5 || detail.answers.review?.retainer_reviewed_document_id !== latest.id} onClick={() => review("correction_needed", latest.id)}>Flag original for correction</button>}</div>
        {detail.answers.review?.status === "correction_needed" && <div className="nf-call-block"><strong>Corrected TMP retainer</strong><p className="nf-muted">Check the corrected name, accident state and date, preview the exact packet, then confirm the email recipient. This is an exception, outside the welcome-call flow. The original signed PDF remains on this file.</p>
          {!correctionAgreement && <><div className="nf-questions"><label className="nf-call-label">Correct full name<input value={correction.name} onChange={(e) => changeCorrection("name", e.target.value)} /></label><label className="nf-call-label">Recipient email<input type="email" value={correction.email} onChange={(e) => changeCorrection("email", e.target.value)} /></label><label className="nf-call-label">Accident city<input value={correction.city} onChange={(e) => changeCorrection("city", e.target.value)} /></label><label className="nf-call-label">Accident state<input value={correction.state} onChange={(e) => changeCorrection("state", e.target.value)} placeholder="e.g. NV or Nevada" /></label><label className="nf-call-label">Accident date<input type="date" value={correction.accident_date} onChange={(e) => changeCorrection("accident_date", e.target.value)} /></label>{agreementChoice(`${correction.city}, ${correction.state}`, correction.nv_variant, ["TX", "FL", "NV", "NV_FLAT", "OTHER"]).state === "NV" && <label className="nf-call-label">Nevada agreement<select value={correction.nv_variant} onChange={(e) => changeCorrection("nv_variant", e.target.value as Correction["nv_variant"])}><option value="tiered">Tiered (standard)</option><option value="flat">Non-tiered (approval required)</option></select></label>}{correction.nv_variant === "flat" && <label className="nf-call-label">Who approved non-tiered?<input value={correction.nv_reason} onChange={(e) => changeCorrection("nv_reason", e.target.value)} /></label>}</div><p className="nf-muted">If the name or email changed, save the verified value in the call fields above first. The agreement must match the file.</p><div className="nf-actions"><button className="nf-secondary" disabled={correctionBusy} onClick={() => void correctionAction("preview")}>Preview corrected packet</button><button className="nf-primary" disabled={correctionBusy || !correctionPreviewed} onClick={() => void correctionAction("send")}>Send corrected link by email</button></div>{correctionPreviewUrl && <div className="nf-pdf-preview"><a href={correctionPreviewUrl} target="_blank" rel="noopener noreferrer">Open preview in a new tab</a><iframe title="Corrected agreement preview" src={correctionPreviewUrl} /><label><input type="checkbox" checked={correctionPreviewed} onChange={(e) => setCorrectionPreviewed(e.target.checked)} /> I checked the corrected name, accident date, packet and recipient.</label></div>}</>}
          {correctionAgreement && <div><p><strong>{correctionAgreement.status}</strong> · {correctionAgreement.signer_name} · {correctionAgreement.email}</p><div className="nf-actions"><button className="nf-secondary" disabled={correctionBusy} onClick={() => void load()}>Refresh signature status</button>{correctionAgreement.client_pdf_url && <><button type="button" className="nf-secondary" onClick={() => setOpenedCorrectionId(correctionAgreement.id)}>Open client-signed PDF here</button><a className="nf-secondary" href={correctionAgreement.client_pdf_url} target="_blank" rel="noopener noreferrer" onClick={() => setOpenedCorrectionId(correctionAgreement.id)}>Open in new tab</a></>}{correctionAgreement.final_pdf_url && <a className="nf-secondary" href={correctionAgreement.final_pdf_url} target="_blank" rel="noopener noreferrer">View completed packet</a>}</div>{openedCorrectionId === correctionAgreement.id && correctionAgreement.client_pdf_url && <div className="nf-pdf-preview"><iframe title="Corrected client-signed agreement" src={correctionAgreement.client_pdf_url} /><p className="nf-muted">If the PDF cannot display here, open it in a new tab above.</p></div>}{correctionAgreement.status === "signed" && !correctionAgreement.agent_reviewed_at && <button className="nf-primary" disabled={correctionBusy || !correctionAgreement.client_pdf_url || openedCorrectionId !== correctionAgreement.id} onClick={() => void correctionAction("review")}>I reviewed the client-signed PDF</button>}{correctionAgreement.status === "signed" && !!correctionAgreement.agent_reviewed_at && <div className="nf-questions"><p>Client signature reviewed. Finish the office fields on the HIPAA pages.</p><label className="nf-call-label">Date of birth<input type="date" value={officeDob} onChange={(e) => setOfficeDob(e.target.value)} /></label><label className="nf-call-label">SSN (all 9 digits or last 4)<input type="password" autoComplete="off" value={officeSsn} onChange={(e) => setOfficeSsn(e.target.value)} /></label><button className="nf-primary" disabled={correctionBusy || !officeDob || !officeSsn} onClick={() => void correctionAction("complete")}>Complete office signer</button></div>}{correctedComplete && <p className="nf-saved">The corrected packet is complete and stored. The original remains in history. You can now send the welcome call to review.</p>}</div>}</div>}
      </details>
      <p className="nf-muted">NETFLY already obtained the signed retainer. A corrected agreement is sent only when the uploaded original has a documented error.</p></section>
        </div>}
        {commandTab === "scripts" && <div className="nf-command-content"><h2>Call help</h2>
    <details className="nf-history"><summary>Caller objections / responses from the supplied script</summary><p><strong>Who is this?</strong> Recognize that they may have spoken with several people; explain the firm's follow-up role; return to the question where they paused.</p><p><strong>I gave this already.</strong> Acknowledge it and explain that the read-back catches incorrect names and numbers; return to that question.</p><p><strong>I only wanted the report / did not know I signed.</strong> Pause and bring in a supervisor if they dispute representation or want out. Record their concern without assuming consent.</p></details>
        </div>}
        {commandTab === "phone" && <div className="nf-command-content"><h2>Phone</h2><p className="nf-muted">Call the client or use your JustCall dialer. Record the case-manager introduction outcome in the last call step.</p>{detail.file.phone && <a className="nf-primary" href={`tel:${detail.file.phone}`}>Call {detail.file.claimant_name}</a>}{callClose.transfer_destination && <p><strong>Case manager destination:</strong> {callClose.transfer_destination}</p>}</div>}
      </aside>
    </div>
  </main>;
}

function Question({ field, value, set, save }: { field: NetflyField; value: string; set: (v: string) => void; save: (v: string) => void }) {
  return <div className="nf-question"><label htmlFor={`nf-${field.id}`}>{field.label}</label>{field.hint && <p className="nf-muted">{field.hint}</p>}
    {field.kind === "choice" ? <div className="nf-options">{(field.choices || []).map((choice) => <button key={choice} type="button" className={value === choice ? "selected" : ""} onClick={() => { set(choice); save(choice); }}>{choice}</button>)}</div>
    : field.kind === "long" ? <textarea id={`nf-${field.id}`} value={value} onChange={(e) => set(e.target.value)} onBlur={(e) => void save(e.target.value)} />
    : <input id={`nf-${field.id}`} type={field.kind === "date" ? "date" : field.kind === "tel" ? "tel" : field.kind === "email" ? "email" : "text"} value={value} onChange={(e) => set(e.target.value)} onBlur={(e) => void save(e.target.value)} />}</div>;
}
