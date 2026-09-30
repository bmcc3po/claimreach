"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./netfly.css";

type FileRow = { id: string; lead_no: string; claimant_name: string; phone: string; claims?: { answers?: any }[] };
export default function NetflyHome() {
  const router = useRouter();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", state: "", month_year: "", at_fault: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try { const r = await fetch("/api/netfly", { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setFiles(d.files || []); }
    catch (e: any) { setError(e.message || "NETFLY files did not load."); }
  }
  useEffect(() => { void load(); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/netfly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create", ...form }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      router.push(`/app/netfly/${d.file.lead_no}`);
    } catch (e: any) { setError(e.message || "Could not create the file."); setBusy(false); }
  }
  const set = (key: keyof typeof form, value: string) => setForm((old) => ({ ...old, [key]: value }));
  return <main className="nf-page">
    <div className="nf-head"><div><Link href="/app" className="nf-back">← Desk</Link><p className="nf-eyebrow">Turnbull, Moak &amp; Pendergrass</p><h1>NETFLY ONTAKE</h1><p>Secondary intake after NETFLY sends an already-signed retainer.</p></div></div>
    <div className="nf-columns"><section className="nf-panel"><h2>Start a transfer</h2><p className="nf-muted">Read back what NETFLY supplied. Missing details can be collected on the call.</p>
      <form onSubmit={create} className="nf-form"><label>Client name<input required value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label>Best phone<input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
      <label>Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
      <div className="nf-two"><label>Accident city<input value={form.city} onChange={(e) => set("city", e.target.value)} /></label><label>State<input value={form.state} onChange={(e) => set("state", e.target.value)} /></label></div>
      <label>Rough month and year<input placeholder="September 2026" value={form.month_year} onChange={(e) => set("month_year", e.target.value)} /></label>
      <label>Fault as NETFLY reported it<select value={form.at_fault} onChange={(e) => set("at_fault", e.target.value)}><option value="">Not supplied</option><option>Other driver</option><option>Client</option><option>Unclear</option></select></label>
      {error && <p className="nf-error" role="alert">{error}</p>}<button className="nf-primary" disabled={busy}>{busy ? "Creating…" : "Create NETFLY file"}</button></form></section>
      <section className="nf-panel"><h2>NETFLY files <small>{files.length}</small></h2><p className="nf-muted">Each file keeps its own intake and original signed-retainer evidence.</p>
      <div className="nf-list">{files.map((row) => { const saved = row.claims?.[0]?.answers?.netfly_secondary; return <Link key={row.id} href={`/app/netfly/${row.lead_no || row.id}`} className="nf-list-row"><span><strong>{row.claimant_name || "Name missing"}</strong><small>{row.lead_no} · {row.phone || "No phone"}</small></span><span className="nf-list-right">{saved?.review?.status === "correction_needed" ? "Correction needed" : saved?.review?.status === "retainer_reviewed" ? "Retainer reviewed" : "Work intake"} →</span></Link>; })}{files.length === 0 && <p className="nf-muted">No NETFLY files yet.</p>}</div></section></div>
  </main>;
}
