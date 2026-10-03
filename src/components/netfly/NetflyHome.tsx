"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { extractNetflyEmail } from "@/lib/netfly-handoff";
import NetflyDeliverySettings, { type NetflyDeliveryConfig } from './NetflyDeliverySettings';
import "./netfly.css";

type FileRow = { id: string; lead_no: string; claimant_name: string; phone: string; created_at: string; missing_source: string[];
  live_call: { by_name: string; expires_at: string } | null; claims?: { answers?: any; firm_sent_at?: string }[] };
export default function NetflyHome() {
  const router = useRouter();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [delivery, setDelivery] = useState<NetflyDeliveryConfig | null>(null);
  const [receiving, setReceiving] = useState<{ configured: boolean; address: string; latest?: { status: string; error?: string; created_at: string }; check_error?: string } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", source_note: "" });
  const editedContacts = useRef(new Set<"name" | "phone" | "email">());
  const extracted = useMemo(() => extractNetflyEmail(form.source_note), [form.source_note]);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try { const r = await fetch("/api/netfly", { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setFiles(d.files || []); setReceiving(d.receiving || null); setDelivery(d.delivery || null); setLoadError(""); }
    catch (e: any) { setLoadError(e.message || "NETFLY files did not load."); }
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 20_000); return () => window.clearInterval(timer); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create", ...form }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      router.push(`/app/netfly/${d.file.lead_no}`);
    } catch (e: any) { setError(e.message || "Could not create the file."); setBusy(false); }
  }
  function setContact(key: "name" | "phone" | "email", value: string) {
    editedContacts.current.add(key);
    setForm(old => ({ ...old, [key]: value }));
  }
  function setNote(source_note: string) {
    const fields = extractNetflyEmail(source_note).fields;
    setForm(old => ({ ...old, source_note,
      name: editedContacts.current.has("name") ? old.name : fields.confirmed_name || "",
      phone: editedContacts.current.has("phone") ? old.phone : fields.confirmed_phone || "",
      email: editedContacts.current.has("email") ? old.email : fields.confirmed_email || "",
    }));
  }
  const sentFiles = files.filter(row => !!row.claims?.[0]?.firm_sent_at);
  const pending = files.filter(row => !row.claims?.[0]?.firm_sent_at && !row.claims?.[0]?.answers?.netfly_secondary?.call_close);
  const other = files.filter(row => !row.claims?.[0]?.firm_sent_at && !!row.claims?.[0]?.answers?.netfly_secondary?.call_close);
  const renderRows = (rows: FileRow[]) => rows.map((row) => { const saved = row.claims?.[0]?.answers?.netfly_secondary; const close = saved?.call_close;
    const sentAt = row.claims?.[0]?.firm_sent_at;
    const days = sentAt ? Math.max(0, Math.ceil((Date.parse(sentAt) + 7 * 86400000 - Date.now()) / 86400000)) : 0;
    const label = sentAt ? `Sent to firm · ${new Date(sentAt).toLocaleString()} · ${days ? `${days}d in return window` : 'Return window ended'}` : row.missing_source?.length ? `Partial · needs ${row.missing_source.map(value => value === "handoff_note" ? "handoff note" : "signed PDF").join(" + ")}`
      : saved?.review?.status === "correction_needed" ? "Correction needed" : close?.disposition === "callback_to_finish" || close?.completion === "incomplete" ? "Callback to finish ontake" : close?.disposition === "appears_dq" ? "Appears DQ · supervisor review" : close?.disposition === "client_remorse" ? "Client remorse · supervisor review" : saved?.review?.status === "ready_for_review" ? "Ready for review" : close?.disposition === "appears_qualified" && close?.followup_required ? "Callback needed" : saved?.review?.status === "retainer_reviewed" ? "Retainer reviewed" : "Welcome call needed";
    return <Link key={row.id} href={`/app/netfly/${row.lead_no || row.id}`} className={`nf-list-row${row.missing_source?.length ? " nf-partial-row" : ""}`}><span><strong>{row.claimant_name || "Name missing"}</strong><small>{row.lead_no} · {row.phone || "Phone added at live transfer"}</small></span><span className="nf-list-right">{row.live_call && <b className="nf-on-phone">On phone · {row.live_call.by_name}</b>}{close?.callback_due_at && <b>Callback due {new Date(close.callback_due_at).toLocaleString()}</b>}<span>{label} →</span></span></Link>; });
  return <main className="nf-page nf-home">
    <div className="nf-head"><div><Link href="/app" className="nf-back">← Desk</Link><p className="nf-eyebrow">Turnbull, Moak &amp; Pendergrass</p><h1>NETFLY ONTAKE</h1><p>Already signed. Welcome the client, verify NETFLY's handoff, and handle what changed.</p><a className="nf-secondary nf-mobile-create" href="#netfly-create">Create NETFLY file</a></div></div>
    {receiving && <section className="nf-panel nf-receiving" aria-label="Automatic NETFLY email import"><strong>Automatic email import</strong><p>{receiving.configured ? <>Have NETFLY send “New Signing” emails to <b>{receiving.address}</b>. New files appear below; missing details stay visible for follow-up.</> : 'Receiving setup needs owner attention. You can still paste an email below.'}</p>{receiving.latest && <p className={receiving.latest.status === 'received' ? 'nf-saved' : 'nf-alert'}>Latest attempt · {new Date(receiving.latest.created_at).toLocaleString()}: {receiving.latest.status === 'received' ? 'Imported.' : receiving.latest.error || 'Import needs attention. The original email remains in Resend.'}</p>}{receiving.check_error && <p className="nf-alert">{receiving.check_error}</p>}</section>}
    {delivery && <NetflyDeliverySettings delivery={delivery} onSaved={setDelivery} />}
    <div className="nf-columns"><section id="netfly-create" className="nf-panel nf-create"><h2>Create a NETFLY file</h2><p className="nf-muted">Paste the whole email. Check the contact details, then open the file to welcome your client.</p>
      <form onSubmit={create} className="nf-form">
      <label>Paste the NETFLY email<textarea maxLength={20000} disabled={busy} value={form.source_note} onChange={(e) => setNote(e.target.value)} placeholder="Agent notes, Contact Information, Signed Agreement — paste it all here. If it has not arrived, enter the client's name below to start a partial file." /></label>
      {!!extracted.candidates.length && <p className="nf-saved" role="status">{extracted.candidates.length} details found. They will fill the file for you to confirm with the client.</p>}
      {extracted.warnings.map(warning => <p className="nf-alert" key={warning}>{warning}</p>)}
      <label>Client name<input required disabled={busy} value={form.name} onChange={(e) => setContact("name", e.target.value)} /></label>
      <label>Best phone<input type="tel" disabled={busy} value={form.phone} onChange={(e) => setContact("phone", e.target.value)} /></label>
      <label>Email<input type="email" disabled={busy} value={form.email} onChange={(e) => setContact("email", e.target.value)} /></label>
      <p className="nf-muted">The original email stays on the file. Upload the signed PDF there before final review.</p>
      {error && <p className="nf-error" role="alert">{error}</p>}<button className="nf-primary" disabled={busy}>{busy ? "Creating…" : "Create NETFLY file"}</button></form></section>
      <section className="nf-panel nf-files"><h2>NETFLY files <small>{files.length}</small></h2><p className="nf-muted">Each file keeps its own intake and original signed-retainer evidence.</p>
      {loadError && <p className="nf-error" role="alert">{loadError}</p>}
      <div className="nf-list"><h3 className="nf-list-heading">New NETFLY · welcome call needed <span>{pending.length}</span></h3>{renderRows(pending)}<h3 className="nf-list-heading">Follow-up and ready to send <span>{other.length}</span></h3>{renderRows(other)}<h3 className="nf-list-heading">Sent to firm <span>{sentFiles.length}</span></h3>{renderRows(sentFiles)}{files.length === 0 && <p className="nf-muted">No NETFLY files yet.</p>}</div></section></div>
  </main>;
}
