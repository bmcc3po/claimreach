"use client";
import { useEffect, useState } from "react";
import LawRulerSyncSummary from "./LawRulerSyncSummary";

async function json(url: string, body?: any) {
  const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

/** One case-level signing desk. Template construction belongs in campaign admin. */
export default function CaseSigning({ leadId, claimId, role }: { leadId: string; claimId?: string; role?: string }) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [emergency, setEmergency] = useState<any[]>([]);
  const [legacy, setLegacy] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [signer, setSigner] = useState({ name: "", phone: "", email: "", via: "Text", template: "" });
  const [reason, setReason] = useState("");
  const [link, setLink] = useState("");
  const q = new URLSearchParams({ lead_id: leadId, ...(claimId ? { claim_id: claimId } : {}) }).toString();
  async function load() {
    try {
      const file = await json(`/api/calls/file?${q}`);
      const loaded = await Promise.allSettled([json(`/api/calls/esign?${q}`), json(`/api/signable?${q}`), json(`/api/retainer?${q}`)]);
      const signing = loaded[0].status === "fulfilled" ? loaded[0].value : null;
      const fallback = loaded[1].status === "fulfilled" ? loaded[1].value : {};
      const old = loaded[2].status === "fulfilled" ? loaded[2].value : {};
      setData(file); setStatus(signing); setEmergency(fallback.docs || []); setLegacy(old.retainers || []); setUnassigned(fallback.legacy_docs || []);
      setError(loaded.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason?.message || "Could not read signing history.").join(" "));
      setSigner((s) => ({ ...s, name: s.name || file.lead?.name || "", phone: s.phone || file.contact?.phone || "", email: s.email || file.contact?.email || "", template: s.template || (signing?.templates?.length === 1 ? signing.templates[0].key : "") }));
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { void load(); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  async function action(url: string, body: any) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await json(url, { lead_id: leadId, claim_id: claimId, ...body });
      setMessage(result.warning || result.note || result.delivered || "Saved.");
      if (result.link) setLink(result.link);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  const mva = status?.case_type === "mva";
  const resume = `/app/${encodeURIComponent(data?.lead?.lead_no || leadId)}?claim=${encodeURIComponent(claimId || data?.claim_id || "")}`;
  const resign = status?.emergency?.needs_resign === true && status?.emergency?.status === "signed";
  const live = ["sent", "opened", "signed"].includes(status?.status) && !resign;
  const unavailable = busy || !status || !!data?.lead?.archived;
  return <section className="case-signing" aria-label="Documents and signing">
    <div className="case-signing-head"><div><h2>Agreement</h2><p className="muted">{data?.lead?.campaign || "This matter"} · DocuSeal</p></div><button className="btn ghost sm" disabled={busy} onClick={() => void load()}>Refresh status</button></div>
    {error && <p role="alert" className="save-msg warn">{error}</p>}
    {message && <p role="status" className="save-msg">{message}</p>}
    <LawRulerSyncSummary imported={data?.imported} />
    {!data && !error && <p>Loading this matter’s agreement…</p>}
    {data && <div className="case-signing-summary">
      <strong>{status?.emergency?.needs_resign ? "Emergency packet · DocuSeal re-sign needed" : status?.complete ? "Signed packet complete" : status?.status === "signed" ? "Client signed · office completion needed" : status?.status === "ready" ? "Ready to prepare" : status?.status || "Agreement status unavailable"}</strong>
      <p>The agreement and its history stay with this matter. Review the recipient and campaign before sending.</p>
      {mva ? <a className="btn" href={resume}>Open agreement in intake</a> : <>
        {!live && <div className="case-signing-fields">
          <label>Signer name<input value={signer.name} onChange={(e) => setSigner({ ...signer, name: e.target.value })} /></label>
          <label>Send by<select value={signer.via} onChange={(e) => setSigner({ ...signer, via: e.target.value })}><option>Text</option><option>Email</option></select></label>
          <label>{signer.via === "Email" ? "Signer email" : "Signer phone"}<input type={signer.via === "Email" ? "email" : "tel"} value={signer.via === "Email" ? signer.email : signer.phone} onChange={(e) => setSigner({ ...signer, [signer.via === "Email" ? "email" : "phone"]: e.target.value })} /></label>
          <label>Campaign agreement<select value={signer.template} onChange={(e) => setSigner({ ...signer, template: e.target.value })}><option value="">Choose agreement</option>{(status?.templates || []).map((t: any) => <option key={t.key} value={t.key}>{t.name || t.key}</option>)}</select></label>
        </div>}
        {!live && <button className="btn" disabled={unavailable || !signer.template || !signer.name.trim()} onClick={() => void action("/api/calls/esign", { template_key: signer.template, signer_name: signer.name, injured_name: signer.name, via: signer.via, phone: signer.phone, email: signer.email, emergency_resign: resign })}>{resign ? "Send DocuSeal re-sign" : "Send with DocuSeal"}</button>}
        {status?.status === "signed" && !status?.complete && !status?.emergency?.needs_resign && <button className="btn" disabled={unavailable} onClick={() => void action("/api/calls/esign/complete", { agreement_id: status.agreement_id })}>Finish office signing</button>}
      </>}
      {live && !status?.complete && <button className="btn ghost" disabled={unavailable} onClick={() => void action("/api/calls/esign/resend", { agreement_id: status.agreement_id })}>Resend current link</button>}
      {!status?.templates?.length && <p className="muted">This campaign needs a DocuSeal template configured before a new agreement can be sent.</p>}
    </div>}
    <h3>Agreement history</h3>
    {(data?.agreements || []).map((a: any) => <article className="case-document-row" key={a.id}>
      <div><strong>{a.name || "Agreement"}</strong><div className="muted">{a.signer} · {a.status}{a.signed ? ` · ${new Date(a.signed).toLocaleString()}` : ""}</div>{a.void_reason && <div>Void reason: {a.void_reason}</div>}{a.error && <p role="status">{a.error}</p>}</div>
      <div className="row">{a.signed_url && <a className="btn ghost sm" href={a.signed_url} target="_blank" rel="noreferrer">{a.status === "voided" ? "Voided copy" : "Signed PDF"}</a>}{a.cert_url && <a className="btn ghost sm" href={a.cert_url} target="_blank" rel="noreferrer">Audit trail</a>}{a.can_void && <button className="btn ghost sm" disabled={busy} onClick={() => { const why = window.prompt("Why is this agreement being voided? The original stays in history."); if (why?.trim()) void action("/api/calls/esign/void", { id: a.id, reason: why.trim() }); }}>Void</button>}</div>
    </article>)}
    {data && !data.agreements?.length && <p className="muted">No DocuSeal agreement on this matter yet.</p>}
    <details className="case-emergency"><summary>Emergency signing · DocuSeal unavailable</summary>
      <p>Use the campaign’s emergency packet during a provider outage. The original remains on file and is marked for a later DocuSeal re-sign.</p>
      <label>Why is emergency signing needed?<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the provider outage" /></label>
      <div className="case-signing-fields"><label>Signer name<input value={signer.name} onChange={(e) => setSigner({ ...signer, name: e.target.value })} /></label><label>Phone<input type="tel" value={signer.phone} onChange={(e) => setSigner({ ...signer, phone: e.target.value })} /></label><label>Email<input type="email" value={signer.email} onChange={(e) => setSigner({ ...signer, email: e.target.value })} /></label><label>Send by<select value={signer.via} onChange={(e) => setSigner({ ...signer, via: e.target.value })}><option>Text</option><option>Email</option></select></label></div>
      <button className="btn ghost" disabled={busy || !data || !!data.lead?.archived || reason.trim().length < 10 || !signer.name.trim()} onClick={() => void action("/api/esign", { op: "send_packet", method: "builtin", emergency_reason: reason.trim(), live_call: mva, signer_name: signer.name, signer_phone: signer.phone, signer_email: signer.email, send_via: signer.via === "Email" ? "email" : "sms" })}>Send emergency packet</button>
      {link && <p><a href={link} target="_blank" rel="noreferrer">Open emergency signing link</a></p>}
    </details>
    {emergency.length > 0 && <><h3>Other signing records</h3>{emergency.map((s) => <article key={s.id} className="case-document-row"><div><strong>{s.title}</strong><div className="muted">{s.provider || "Legacy"} · {s.status}{s.audit?.emergency ? " · DocuSeal re-sign required" : ""}</div></div><div className="row">{s.completed_pdf_url && <a className="btn ghost sm" href={s.completed_pdf_url} target="_blank" rel="noreferrer">Stored PDF</a>}{s.cert_pdf_url && <a className="btn ghost sm" href={s.cert_pdf_url} target="_blank" rel="noreferrer">Audit trail</a>}{["sent", "viewed"].includes(s.status) && <button className="btn ghost sm" disabled={busy} onClick={() => void action("/api/signable", { op: "cancel", id: s.id })}>Cancel pending packet</button>}</div></article>)}</>}
    {legacy.length > 0 && <details className="case-emergency"><summary>Legacy text retainers</summary><p>Historical records. Template editing and new signing are handled through campaign setup and DocuSeal.</p>{legacy.map((r) => <details key={r.id}><summary>{r.status} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : "Undated"}</summary><pre style={{ whiteSpace: "pre-wrap" }}>{r.rendered_body}</pre></details>)}</details>}
    {unassigned.length > 0 && <details className="case-emergency"><summary>Unassigned legacy documents on this file</summary><p>These originals are preserved but have not been assigned to this matter. They do not establish its current signing status.</p>{unassigned.map((s) => <div className="case-document-row" key={s.id}><span>{s.title} · {s.status}</span>{s.completed_pdf_url && <a className="btn ghost sm" href={s.completed_pdf_url} target="_blank" rel="noreferrer">Historical PDF</a>}</div>)}</details>}
    {["owner", "admin"].includes(role || "") && <p><a href="/settings/campaigns">Campaign signing setup</a> · <a href="/templates?tab=retainers">Template library</a></p>}
  </section>;
}
