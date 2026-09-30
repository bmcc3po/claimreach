"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { NETFLY_SECTIONS, netflyFlags, type NetflyField } from "@/lib/netfly-ontake";
import "./netfly.css";

type Detail = { file: { id: string; lead_no: string; claimant_name: string; phone: string; email: string }; answers: { fields?: Record<string, string>; review?: any }; retainer: { id: string; file_name: string; created_at: string; url: string | null }[]; canReview: boolean };
export default function NetflyFile({ fileKey }: { fileKey: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [section, setSection] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
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
  if (!detail) return <main className="nf-page"><Link href="/app/netfly">← NETFLY files</Link><p>{error || "Loading NETFLY file…"}</p></main>;
  const current = NETFLY_SECTIONS[section];
  const visible = current.fields.filter((f) => !f.when || values[f.when.id] === f.when.is);
  const answered = NETFLY_SECTIONS.flatMap((s) => s.fields).filter((f) => values[f.id]?.trim()).length;
  const flags = netflyFlags(values);
  const latest = detail.retainer[0];
  return <main className="nf-page">
    <div className="nf-head"><div><Link href="/app/netfly" className="nf-back">← NETFLY files</Link><p className="nf-eyebrow">Secondary intake · {detail.file.lead_no}</p><h1>{detail.file.claimant_name}</h1><p>{detail.file.phone || "No phone"} · {detail.file.email || "No email"}</p></div><span className="nf-progress">{answered} answers saved</span></div>
    {error && <div className="nf-alert" role="alert">{error}</div>}
    {flags.length > 0 && <div className="nf-alert"><strong>Supervisor attention</strong>{flags.map((flag) => <p key={flag}>{flag}</p>)}<p>Finish the file and flag it. Do not auto-decline.</p></div>}
    <div className="nf-retainer"><div><strong>Signed retainer from NETFLY</strong><p>{latest ? `Received ${new Date(latest.created_at).toLocaleString()} · ${detail.answers.review?.status || "Review needed"}` : "Missing — upload the original PDF before review."}</p></div><div className="nf-actions"><label className="nf-secondary">{uploading ? "Uploading…" : "Upload signed PDF"}<input type="file" accept="application/pdf,.pdf" disabled={uploading} hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>{latest?.url && <a className="nf-secondary" href={latest.url} target="_blank" rel="noopener noreferrer">View original PDF</a>}</div></div>
    {detail.retainer.length > 1 && <details className="nf-history"><summary>Earlier uploaded originals ({detail.retainer.length - 1})</summary>{detail.retainer.slice(1).map((d) => <p key={d.id}>{d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.file_name}</a> : d.file_name} · {new Date(d.created_at).toLocaleString()}</p>)}</details>}
    <nav className="nf-steps" aria-label="NETFLY intake sections">{NETFLY_SECTIONS.map((s, i) => <button key={s.id} className={i === section ? "active" : ""} onClick={() => setSection(i)}>{s.title}</button>)}</nav>
    <section className="nf-panel nf-intake"><div className="nf-section-head"><p className="nf-eyebrow">NETFLY ONTAKE</p><h2>{current.title}</h2><span aria-live="polite">{saveState}</span></div>{current.script && <div className="nf-script"><strong>Say</strong><p>{current.script}</p></div>}
      <div className="nf-questions">{visible.map((field) => <Question key={field.id} field={field} value={values[field.id] || ""} set={(value) => set(field.id, value)} save={(value) => save(field.id, value)} />)}</div>
      <div className="nf-footer"><button className="nf-secondary" disabled={section === 0} onClick={() => setSection((i) => Math.max(0, i - 1))}>← Previous</button><button className="nf-primary" onClick={() => setSection((i) => Math.min(NETFLY_SECTIONS.length - 1, i + 1))} disabled={section === NETFLY_SECTIONS.length - 1}>Next section →</button></div></section>
    <section className="nf-panel nf-review"><h2>Review &amp; correction</h2><p>The uploaded original stays on the file. A PDF is not treated as a verified signature until reviewed. An incorrect retainer remains visible for correction.</p>
      <label>Review note<textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="For a correction, describe exactly what is wrong." /></label>
      <div className="nf-actions">{detail.canReview && latest && <button className="nf-primary" onClick={() => review("retainer_reviewed", latest.id)}>Mark original reviewed</button>}
      {latest && <button className="nf-secondary" onClick={() => review("correction_needed", latest.id)}>Mark correction needed</button>}
      <button className="nf-secondary" onClick={() => review("needs_supervisor")}>Flag for supervisor</button>
      <button className="nf-secondary" onClick={() => review("ready_for_review")}>Intake ready for review</button></div>
      {detail.answers.review?.status === "correction_needed" && <p className="nf-alert">Correction is recorded. Preserve this original. A replacement e-sign must be sent through the approved TMP correction workflow after the right packet and client details are checked.</p>}
      <p className="nf-muted">No routine e-sign or automatic firm send is triggered by this intake. NETFLY cases remain in this separate work queue.</p></section>
    <details className="nf-history"><summary>Caller objections / responses from the supplied script</summary><p><strong>Who is this?</strong> Recognize that they may have spoken with several people; explain the firm's follow-up role; return to the question where they paused.</p><p><strong>I gave this already.</strong> Acknowledge it and explain that the read-back catches incorrect names and numbers; return to that question.</p><p><strong>I only wanted the report / did not know I signed.</strong> Pause and bring in a supervisor if they dispute representation or want out. Record their concern without assuming consent.</p></details>
  </main>;
}

function Question({ field, value, set, save }: { field: NetflyField; value: string; set: (v: string) => void; save: (v: string) => void }) {
  return <div className="nf-question"><label htmlFor={`nf-${field.id}`}>{field.label}</label>{field.hint && <p className="nf-muted">{field.hint}</p>}
    {field.kind === "choice" ? <div className="nf-options">{(field.choices || []).map((choice) => <button key={choice} type="button" className={value === choice ? "selected" : ""} onClick={() => { set(choice); save(choice); }}>{choice}</button>)}</div>
    : field.kind === "long" ? <textarea id={`nf-${field.id}`} value={value} onChange={(e) => set(e.target.value)} onBlur={(e) => { if (e.target.value !== value || e.target.value) void save(e.target.value); }} />
    : <input id={`nf-${field.id}`} type={field.kind === "date" ? "date" : field.kind === "tel" ? "tel" : field.kind === "email" ? "email" : "text"} value={value} onChange={(e) => set(e.target.value)} onBlur={(e) => void save(e.target.value)} />}</div>;
}
