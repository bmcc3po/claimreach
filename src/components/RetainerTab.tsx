"use client";
import { useState, useEffect, useRef } from "react";
import { TOKEN_CATALOG } from "@/lib/retainer-tokens";
import PdfFieldEditor from "./PdfFieldEditor";

const STATUS_FLOW = ["draft", "sent", "viewed", "signed", "declined"];
const STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent for eSign", viewed: "Viewed", signed: "Signed", declined: "Declined" };

export default function RetainerTab({ leadId, role }: { leadId: string; role?: string }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [retainers, setRetainers] = useState<any[]>([]);
  const [tplId, setTplId] = useState("");
  const [preview, setPreview] = useState<any | null>(null);
  const [editingTpl, setEditingTpl] = useState(false);
  const [tplName, setTplName] = useState(""); const [tplBody, setTplBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(key: string) {
    const tok = `{{${key}}}`;
    const ta = bodyRef.current;
    if (!ta) { setTplBody((b) => b + tok); return; }
    const start = ta.selectionStart ?? tplBody.length;
    const end = ta.selectionEnd ?? tplBody.length;
    const next = tplBody.slice(0, start) + tok + tplBody.slice(end);
    setTplBody(next);
    requestAnimationFrame(() => { ta.focus(); const pos = start + tok.length; ta.setSelectionRange(pos, pos); });
  }
  const [msg, setMsg] = useState("");
  const [approved, setApproved] = useState(false);
  const [signerName, setSignerName] = useState(""); const [signerEmail, setSignerEmail] = useState(""); const [signerPhone, setSignerPhone] = useState("");
  const [sendVia, setSendVia] = useState("both");
  const [pdfTemplates, setPdfTemplates] = useState<any[]>([]);
  const [editPdfId, setEditPdfId] = useState<string | null>(null);
  const [editPdf, setEditPdf] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendPdfId, setSendPdfId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadPdfTemplates() {
    try { const r = await fetch("/api/pdf-templates"); const d = await r.json(); setPdfTemplates(d.templates ?? []); } catch {}
  }
  useEffect(() => { loadPdfTemplates(); }, []);

  async function uploadPdf(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("name", file.name.replace(/\.pdf$/i, ""));
    const r = await fetch("/api/pdf-templates", { method: "POST", body: fd });
    const d = await r.json(); setUploading(false);
    if (d.ok) { await loadPdfTemplates(); setEditPdfId(d.id); setEditPdf({ id: d.id, name: file.name.replace(/\.pdf$/i, ""), fields: [] }); }
    else alert(d.error || "Upload failed");
  }

  async function sendPdfRetainer() {
    if (!sendPdfId) { setMsg("Pick a PDF template to send."); return; }
    setMsg("Sending PDF retainer…");
    const r = await fetch("/api/esign", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "send_pdf_retainer", lead_id: leadId, pdf_template_id: sendPdfId, signer_name: signerName, signer_email: signerEmail, signer_phone: signerPhone, send_via: sendVia }) });
    const d = await r.json();
    if (d.ok) { setMsg("PDF retainer sent for signature."); load(); } else setMsg(d.error || "Send failed");
  }

  async function load() {
    const r = await fetch(`/api/retainer?lead_id=${leadId}`); const d = await r.json();
    setTemplates(d.templates ?? []); setRetainers(d.retainers ?? []);
    if (!tplId && d.templates?.[0]) setTplId(d.templates[0].id);
    if (d.lead) { setSignerName((p) => p || d.lead.claimant_name || `${d.lead.first_name ?? ""} ${d.lead.last_name ?? ""}`.trim()); setSignerEmail((p) => p || d.lead.email || ""); setSignerPhone((p) => p || d.lead.phone || ""); }
    try { const g = await fetch(`/api/grievous?lead_id=${leadId}`); const gd = await g.json(); setApproved(!!gd.approved); } catch {}
  }
  useEffect(() => { load(); }, [leadId]);

  // eSign gate: Grievous must approve first. Soft gate — owner/admin can override.
  async function sendForSign(id: string) {
    if (!approved) {
      const canOverride = role === "owner" || role === "admin";
      if (canOverride) {
        if (!confirm("Grievous has NOT approved this intake yet. As owner/admin you can override. Send anyway?")) return;
      } else {
        alert("Grievous must review and approve this intake before you can send the eSign. Open Grievous (bottom-right) and run a Full review.");
        return;
      }
    }
    setMsg("Sending to SignWell…");
    const r = await fetch("/api/esign", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "send_retainer", retainer_id: id, signer_name: signerName, signer_email: signerEmail, signer_phone: signerPhone, send_via: sendVia }) });
    const d = await r.json();
    if (d.ok) { setMsg("Sent. The client will receive it by " + (sendVia === "both" ? "email and text" : sendVia) + "."); load(); if (preview?.id === id) setPreview({ ...preview, status: "sent" }); }
    else setMsg(d.error || "Send failed");
  }

  async function generate() {
    if (!tplId) { setMsg("Create or pick a template first."); return; }
    const r = await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "generate", lead_id: leadId, template_id: tplId }) });
    const d = await r.json();
    if (r.ok) { setPreview(d.retainer); load(); setMsg("Generated, fields auto-filled from Contact + Intake."); }
    else setMsg(d.error || "Generate failed");
  }
  async function setStatus(id: string, status: string) {
    await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set_status", id, status }) });
    load(); if (preview?.id === id) setPreview({ ...preview, status });
  }
  async function saveTemplate() {
    if (!tplName || !tplBody) { setMsg("Template name and body required."); return; }
    const r = await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_template", name: tplName, body: tplBody }) });
    if (r.ok) { setEditingTpl(false); setTplName(""); setTplBody(""); load(); setMsg("Template saved."); }
  }

  if (editPdfId) {
    return <PdfFieldEditor templateId={editPdfId} initialName={editPdf?.name} initialFields={editPdf?.fields} onClose={() => { setEditPdfId(null); setEditPdf(null); loadPdfTemplates(); }} />;
  }

  if (editingTpl) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => setEditingTpl(false)}>← Back</button>
        <h3>New retainer template</h3>
        <p className="muted" style={{ fontSize: 13 }}>Write the agreement, then click a token to drop it where your cursor is. Tokens auto-fill from the file when you generate the retainer.</p>
        <input placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} style={{ marginBottom: 8 }} />

        <div className="token-bar">
          {TOKEN_CATALOG.map((g) => (
            <div className="token-group" key={g.group}>
              <span className="token-group-label">{g.group}</span>
              {g.tokens.map((t) => (
                <button key={t.key} type="button" className="token-chip" title={`{{${t.key}}}`} onClick={() => insertToken(t.key)}>{t.label}</button>
              ))}
            </div>
          ))}
        </div>

        <textarea ref={bodyRef} rows={14} placeholder="Retainer agreement body. Click tokens above to insert client + case data." value={tplBody} onChange={(e) => setTplBody(e.target.value)} />
        <div className="row" style={{ gap: 8, marginTop: 10 }}><button className="btn" onClick={saveTemplate}>Save template</button>{msg && <span className="muted" style={{ alignSelf: "center" }}>{msg}</span>}</div>
      </div>
    );
  }

  if (preview) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => setPreview(null)}>← Back to retainers</button>
        <div className="row" style={{ margin: "10px 0", gap: 8 }}>
          <span className="badge stage">{STATUS_LABEL[preview.status] ?? preview.status}</span>
          {approved ? <span className="badge signed">✓ Grievous approved</span> : <span className="badge dq">Grievous review required</span>}
          <span className="spacer" />
          {preview.status !== "signed" && preview.status !== "declined" && <button className="btn ghost" onClick={() => setStatus(preview.id, "signed")}>Mark signed manually</button>}
        </div>
        <div className="card" style={{ padding: 22, whiteSpace: "pre-wrap", fontFamily: "Georgia, serif", lineHeight: 1.55 }}>{preview.rendered_body}</div>

        {preview.status === "draft" && (
          <div className="card" style={{ padding: 16, marginTop: 12 }}>
            <div className="section-title">Send for signature (SignWell, certified)</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <input placeholder="Signer name" value={signerName} onChange={(e) => setSignerName(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
              <input placeholder="Signer email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} style={{ flex: 1, minWidth: 170 }} />
              <input placeholder="Signer phone" value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              <select value={sendVia} onChange={(e) => setSendVia(e.target.value)} style={{ width: "auto" }}>
                <option value="both">Email + text</option>
                <option value="email">Email only</option>
                <option value="sms">Text only</option>
              </select>
            </div>
            <button className="btn gold" onClick={() => sendForSign(preview.id)}>Send retainer for eSign</button>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>SignWell emails a secure, court-admissible signing link. Email is required; a text with the link is sent too when a phone is on file. Signature status updates here automatically.</p>
          </div>
        )}
        {msg && <p className="save-msg" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <select value={tplId} onChange={(e) => setTplId(e.target.value)} style={{ width: "auto" }}>
          {templates.length === 0 && <option value="">No templates yet</option>}
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn gold" onClick={generate} disabled={!tplId}>Generate retainer</button>
        <button className="btn ghost" onClick={() => setEditingTpl(true)}>+ New template</button>
        {msg && <span className="muted" style={{ alignSelf: "center" }}>{msg}</span>}
      </div>

      <div className="section-title">Retainers on this file</div>
      {retainers.length === 0 && <p className="muted" style={{ fontSize: 13 }}>None yet. Pick a template and generate, it auto-fills from Contact and Intake.</p>}
      {retainers.map((r) => (
        <div key={r.id} className="cd-event">
          <div><strong>{STATUS_LABEL[r.status] ?? r.status}</strong> <span className="muted">· {new Date(r.created_at).toLocaleDateString()}</span></div>
          <button className="btn ghost sm" onClick={() => setPreview(r)}>Open</button>
        </div>
      ))}

      <div className="section-title" style={{ marginTop: 24 }}>PDF retainers (upload + place fields)</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Upload your firm's real retainer PDF, then drag signature, date, and text boxes onto it and assign each to the client or the agent. This is the certified path through SignWell.</p>
      <input ref={fileInput} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdf(f); e.target.value = ""; }} />
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button className="btn" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "⬆ Upload PDF"}</button>
      </div>
      {pdfTemplates.map((t) => (
        <div key={t.id} className="cd-event">
          <div><strong>{t.name}</strong> <span className="muted">· {(t.fields?.length || 0)} fields · {t.page_count || 1} pages</span></div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost sm" onClick={() => { setEditPdfId(t.id); setEditPdf(t); }}>Edit fields</button>
            <button className={`btn sm ${sendPdfId === t.id ? "gold" : "ghost"}`} onClick={() => setSendPdfId(t.id)}>{sendPdfId === t.id ? "Selected" : "Select to send"}</button>
          </div>
        </div>
      ))}

      {sendPdfId && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div className="section-title">Send PDF retainer (SignWell, certified)</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input placeholder="Signer name" value={signerName} onChange={(e) => setSignerName(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
            <input placeholder="Signer email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} style={{ flex: 1, minWidth: 170 }} />
            <input placeholder="Signer phone" value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <select value={sendVia} onChange={(e) => setSendVia(e.target.value)} style={{ width: "auto" }}>
              <option value="both">Email + text</option>
              <option value="email">Email only</option>
              <option value="sms">Text only</option>
            </select>
          </div>
          <button className="btn gold" onClick={sendPdfRetainer}>Send for signature</button>
          {!approved && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Note: Grievous approval is required to send (owner/admin can override).</p>}
        </div>
      )}
    </div>
  );
}
