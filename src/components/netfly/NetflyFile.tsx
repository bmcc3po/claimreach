"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { NETFLY_FIELDS, NETFLY_SECTIONS, netflyFlags, parseNetflyHandoff, type NetflyField } from "@/lib/netfly-ontake";
import "./netfly.css";

type Handoff = { note: string; at: string; by_name?: string; channel?: string };
type Detail = { file: { id: string; lead_no: string; claimant_name: string; phone: string; email: string }; answers: { fields?: Record<string, string>; review?: any; handoffs?: Handoff[]; handoff_verification?: { status: string; note: string; source_revision: number; at: string; by_name?: string } }; retainer: { id: string; file_name: string; created_at: string; url: string | null }[]; canReview: boolean };

const VERIFY_STEPS = [
  { title: "1. Welcome & confirm", script: "Welcome to Turnbull, Moak & Pendergrass. NETFLY already gathered your accident information and your signed agreement. I just want to confirm the key details and hear what has changed since then.", fields: ["confirmed_name", "name_confirmed", "confirmed_phone", "confirmed_email"] },
  { title: "2. Care & changes", script: "What has changed since you spoke with NETFLY? Most importantly, have you been able to get checked out, and where would treatment work best for you?", fields: ["seen_doctor", "first_provider", "first_visit", "other_pain", "still_treating", "current_provider", "next_appointment", "other_insurer", "other_claim", "insurance_notes", "photos"] },
  { title: "3. Next steps", script: "Let’s make sure you know what happens next. I’ll pass along any new details and questions to the firm.", fields: ["other_lawyer_signed", "client_questions", "final_notes"] },
] as const;
const verifyIds = new Set<string>(VERIFY_STEPS.flatMap((step) => [...step.fields]));
const fieldById = new Map(NETFLY_FIELDS.map((field) => [field.id, field]));
export default function NetflyFile({ fileKey }: { fileKey: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [section, setSection] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [handoffDraft, setHandoffDraft] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [verificationNote, setVerificationNote] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  async function load() {
    try { const r = await fetch(`/api/netfly?file=${encodeURIComponent(fileKey)}`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setDetail(d); setValues(d.answers?.fields || {}); setReviewNote(d.answers?.review?.note || ""); }
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
  if (!detail) return <main className="nf-page"><Link href="/app/netfly">← NETFLY files</Link><p>{error || "Loading NETFLY file…"}</p></main>;
  const current = VERIFY_STEPS[section];
  const visible = current.fields.map((id) => fieldById.get(id)).filter((f): f is NetflyField => !!f && (!f.when || values[f.when.id] === f.when.is));
  const answered = NETFLY_SECTIONS.flatMap((s) => s.fields).filter((f) => values[f.id]?.trim()).length;
  const flags = netflyFlags(values);
  const latest = detail.retainer[0];
  const handoffs = detail.answers.handoffs || [];
  const originalHandoff = handoffs[0];
  const latestHandoff = handoffs.at(-1);
  const sourceRows = parseNetflyHandoff(latestHandoff?.note || "");
  const checked = detail.answers.handoff_verification?.source_revision === handoffs.length && handoffs.length > 0;
  return <main className="nf-page">
    <div className="nf-head"><div><Link href="/app/netfly" className="nf-back">← NETFLY files</Link><p className="nf-eyebrow">Signed transfer · {detail.file.lead_no}</p><h1>{detail.file.claimant_name}</h1><p>{detail.file.phone || "No phone"} · {detail.file.email || "No email"}</p></div><span className="nf-progress">Welcome &amp; verify</span></div>
    {error && <div className="nf-alert" role="alert">{error}</div>}
    {flags.length > 0 && <div className="nf-alert"><strong>Supervisor attention</strong>{flags.map((flag) => <p key={flag}>{flag}</p>)}<p>Finish the file and flag it. Do not auto-decline.</p></div>}
    <div className="nf-retainer"><div><strong>Already signed with NETFLY</strong><p>{latest ? `Original PDF received ${new Date(latest.created_at).toLocaleString()} · ${detail.answers.review?.status || "Review needed"}` : "Original signed PDF missing — upload it before reviewing the agreement."}</p></div><div className="nf-actions"><label className="nf-secondary">{uploading ? "Uploading…" : "Upload signed PDF"}<input type="file" accept="application/pdf,.pdf" disabled={uploading} hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>{latest?.url && <a className="nf-secondary" href={latest.url} target="_blank" rel="noopener noreferrer">View signed PDF</a>}</div></div>
    {detail.retainer.length > 1 && <details className="nf-history"><summary>Earlier uploaded originals ({detail.retainer.length - 1})</summary>{detail.retainer.slice(1).map((d) => <p key={d.id}>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.file_name}</a> : d.file_name} · {new Date(d.created_at).toLocaleString()}</p>)}</details>}
    <section className="nf-panel nf-source"><div className="nf-source-heading"><div><p className="nf-eyebrow">Already collected by NETFLY</p><h2>Handoff note</h2><p className="nf-muted">Use this to verify the important facts. It is NETFLY's account, not the client's confirmed answers.</p></div>{latestHandoff && <span className="nf-source-time">Received {new Date(latestHandoff.at).toLocaleString()}</span>}</div>
      {sourceRows.length ? <div className="nf-source-grid">{sourceRows.map((row) => <div className="nf-source-item" key={row.label}><strong>{row.label}</strong><p>{row.value}</p></div>)}</div> : latestHandoff ? <p className="nf-source-note">{latestHandoff.note}</p> : <p className="nf-alert">No NETFLY handoff note is on this file yet. Add the note before the welcome call.</p>}
      {originalHandoff && <details className="nf-history"><summary>{handoffs.length > 1 ? `Original note and ${handoffs.length - 1} later correction(s)` : "View the original note"}</summary>{handoffs.map((item, i) => <div className="nf-source-revision" key={`${item.at}-${i}`}><strong>{i === 0 ? "Original" : `Correction ${i}`} · {new Date(item.at).toLocaleString()}</strong><p>{item.note}</p></div>)}</details>}
      <details className="nf-history"><summary>{latestHandoff ? "Add a corrected NETFLY note" : "Paste the NETFLY handoff note"}</summary><p className="nf-muted">A new note is appended. The original stays on the file.</p><textarea className="nf-source-input" value={handoffDraft} onChange={(e) => setHandoffDraft(e.target.value)} placeholder="Paste the NETFLY accident intake note here" /><button className="nf-secondary" disabled={handoffBusy || handoffDraft.trim().length < 10} onClick={() => void addHandoff()}>{handoffBusy ? "Saving…" : "Save handoff note"}</button></details>
      {latestHandoff && <div className="nf-handoff-check"><strong>{checked ? `Checked with client · ${detail.answers.handoff_verification?.status === "matches" ? "matches" : "changes recorded"}` : "After the welcome call, check NETFLY's information with the client"}</strong><p className="nf-muted">If something changed, describe it here and update the relevant answers below. The original NETFLY note remains visible.</p><textarea className="nf-source-input" value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} placeholder="What changed? Leave blank when everything matches." /><div className="nf-actions"><button className="nf-secondary" disabled={verificationBusy} onClick={() => void verifyHandoff("matches")}>Details match</button><button className="nf-primary" disabled={verificationBusy || verificationNote.trim().length < 5} onClick={() => void verifyHandoff("changes_recorded")}>Record changes</button></div></div>}
    </section>
    <nav className="nf-steps" aria-label="Welcome call steps">{VERIFY_STEPS.map((s, i) => <button key={s.title} className={i === section ? "active" : ""} onClick={() => setSection(i)}>{s.title}</button>)}</nav>
    <section className="nf-panel nf-intake"><div className="nf-section-head"><p className="nf-eyebrow">Welcome call · verify changes, not a new intake</p><h2>{current.title}</h2><span aria-live="polite">{saveState}</span></div><div className="nf-script"><strong>Say</strong><p>{current.script}</p></div>
      <div className="nf-questions">{visible.map((field) => <Question key={field.id} field={field} value={values[field.id] || ""} set={(value) => set(field.id, value)} save={(value) => save(field.id, value)} />)}</div>
      <div className="nf-footer"><button className="nf-secondary" disabled={section === 0} onClick={() => setSection((i) => Math.max(0, i - 1))}>← Previous</button><button className="nf-primary" onClick={() => setSection((i) => Math.min(VERIFY_STEPS.length - 1, i + 1))} disabled={section === VERIFY_STEPS.length - 1}>Next step →</button></div></section>
    <details className="nf-history nf-extra"><summary>More details, only if missing or changed</summary><p className="nf-muted">NETFLY already completed intake. Open only the questions needed to resolve a gap or new information. {answered} answers have been saved on this file.</p>{NETFLY_SECTIONS.map((group) => { const extras = group.fields.filter((field) => !verifyIds.has(field.id) && (!field.when || values[field.when.id] === field.when.is)); return extras.length ? <div key={group.id}><h3>{group.title}</h3><div className="nf-questions">{extras.map((field) => <Question key={field.id} field={field} value={values[field.id] || ""} set={(value) => set(field.id, value)} save={(value) => save(field.id, value)} />)}</div></div> : null; })}</details>
    <section className="nf-panel nf-review"><h2>Review &amp; correction</h2><p>The uploaded original stays on the file. A PDF is not treated as a verified signature until reviewed. An incorrect retainer remains visible for correction.</p>
      <label>Review note<textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="For a correction, describe exactly what is wrong." /></label>
      <div className="nf-actions">{detail.canReview && latest && <button className="nf-primary" onClick={() => review("retainer_reviewed", latest.id)}>Mark original reviewed</button>}
      {latest && <button className="nf-secondary" onClick={() => review("correction_needed", latest.id)}>Mark correction needed</button>}
      <button className="nf-secondary" onClick={() => review("needs_supervisor")}>Flag for supervisor</button>
      <button className="nf-secondary" disabled={!latest || !checked || detail.answers.review?.status === "correction_needed"} onClick={() => review("ready_for_review")}>Welcome call ready for review</button></div>
      {(!latest || !checked) && <p className="nf-muted">To send for review, upload the signed PDF and check the latest NETFLY handoff with the client.</p>}
      {detail.answers.review?.status === "correction_needed" && <p className="nf-alert">Correction is recorded. Preserve this original. A replacement e-sign must be sent through the approved TMP correction workflow after the right packet and client details are checked.</p>}
      <p className="nf-muted">No routine e-sign or automatic firm send is triggered by this intake. NETFLY cases remain in this separate work queue.</p></section>
    <details className="nf-history"><summary>Caller objections / responses from the supplied script</summary><p><strong>Who is this?</strong> Recognize that they may have spoken with several people; explain the firm's follow-up role; return to the question where they paused.</p><p><strong>I gave this already.</strong> Acknowledge it and explain that the read-back catches incorrect names and numbers; return to that question.</p><p><strong>I only wanted the report / did not know I signed.</strong> Pause and bring in a supervisor if they dispute representation or want out. Record their concern without assuming consent.</p></details>
  </main>;
}

function Question({ field, value, set, save }: { field: NetflyField; value: string; set: (v: string) => void; save: (v: string) => void }) {
  return <div className="nf-question"><label htmlFor={`nf-${field.id}`}>{field.label}</label>{field.hint && <p className="nf-muted">{field.hint}</p>}
    {field.kind === "choice" ? <div className="nf-options">{(field.choices || []).map((choice) => <button key={choice} type="button" className={value === choice ? "selected" : ""} onClick={() => { set(choice); save(choice); }}>{choice}</button>)}</div>
    : field.kind === "long" ? <textarea id={`nf-${field.id}`} value={value} onChange={(e) => set(e.target.value)} onBlur={(e) => void save(e.target.value)} />
    : <input id={`nf-${field.id}`} type={field.kind === "date" ? "date" : field.kind === "tel" ? "tel" : field.kind === "email" ? "email" : "text"} value={value} onChange={(e) => set(e.target.value)} onBlur={(e) => void save(e.target.value)} />}</div>;
}
