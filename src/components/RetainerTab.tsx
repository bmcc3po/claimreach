"use client";
import { useState, useEffect, useRef } from "react";
import { TOKEN_CATALOG } from "@/lib/retainer-tokens";
import PdfFieldEditor from "./PdfFieldEditor";

const STATUS_FLOW = ["draft", "sent", "viewed", "signed", "declined"];
const STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent for eSign", viewed: "Viewed", signed: "Signed", declined: "Declined" };

export default function RetainerTab({ leadId, claimId, role }: { leadId: string; claimId?: string; role?: string }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [retainers, setRetainers] = useState<any[]>([]);
  const [tplId, setTplId] = useState("");
  const [preview, setPreview] = useState<any | null>(null);
  const [editingTpl, setEditingTpl] = useState(false);
  const [tplName, setTplName] = useState(""); const [tplBody, setTplBody] = useState("");
  const [tplCaseType, setTplCaseType] = useState("any"); const [tplDefault, setTplDefault] = useState(false);
  const [tplEditId, setTplEditId] = useState<string | null>(null);
  const [leadCaseType, setLeadCaseType] = useState("");
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
  const [method, setMethod] = useState<"signwell" | "builtin">("builtin");
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

  const [signables, setSignables] = useState<any[]>([]);
  const [pdfMethod, setPdfMethod] = useState<"builtin" | "signwell">("builtin");
  const [override, setOverride] = useState(false);
  const [runningGrievous, setRunningGrievous] = useState(false);
  const canOverrideRole = role === "owner" || role === "admin";
  async function loadSignables() {
    try { const d = await (await fetch(`/api/signable?lead_id=${leadId}`)).json(); setSignables(d.docs ?? []); } catch {}
  }
  useEffect(() => { loadSignables(); }, [leadId]);
  async function runGrievous() {
    setRunningGrievous(true); setMsg("Running Grievous review on this file…");
    try {
      const r = await fetch("/api/grievous", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: claimId, kind: "full" }) });
      const d = await r.json();
      if (d.verdict) {
        const ok = d.verdict === "approved";
        setApproved(ok);
        setMsg(ok ? "Grievous approved this file. You can send now." : `Grievous: ${d.verdict}. ${d.summary || "Check the QA tab for the report."}`);
      } else setMsg(d.error || "Grievous review could not run.");
    } catch { setMsg("Grievous review failed to run."); }
    finally { setRunningGrievous(false); }
  }
  async function sendPdfRetainer() {
    if (!sendPdfId) { setMsg("Pick a PDF template to send."); return; }
    if (!approved && !override) { setMsg("Grievous hasn't approved this file. Run a Grievous review, or check Override (owner/admin)."); return; }
    setMsg(pdfMethod === "builtin" ? "Sending PDF retainer via in-house e-sign…" : "Sending PDF retainer via SignWell…");
    const r = await fetch("/api/esign", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "send_pdf_retainer", lead_id: leadId, pdf_template_id: sendPdfId, signer_name: signerName, signer_email: signerEmail, signer_phone: signerPhone, send_via: sendVia, certified: pdfMethod === "signwell", method: pdfMethod, override }) });
    const d = await r.json();
    if (d.ok) { setMsg(pdfMethod === "builtin" ? `Sent. In-house signing link created (envelope ${d.envelope_id || ""}).` : "PDF retainer sent via SignWell."); load(); loadSignables(); } else setMsg(d.error || "Send failed");
  }

  async function load() {
    const r = await fetch(`/api/retainer?lead_id=${leadId}`); const d = await r.json();
    const tpls = d.templates ?? [];
    setTemplates(tpls); setRetainers(d.retainers ?? []);
    const ct = d.lead?.case_type || "";
    setLeadCaseType(ct);
    if (!tplId && tpls.length) {
      // Prefer the default template for this case type, then any default, then first.
      const typeDefault = tpls.find((t: any) => t.case_type === ct && t.is_default);
      const anyDefault = tpls.find((t: any) => t.is_default && !t.case_type);
      const typeMatch = tpls.find((t: any) => t.case_type === ct);
      setTplId((typeDefault || anyDefault || typeMatch || tpls[0]).id);
    }
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

  // Built-in (non-certified): create a signable doc from the retainer body and
  // text the client our /sign/[id] link.
  async function sendBuiltin(id: string) {
    if (!approved && !(role === "owner" || role === "admin")) {
      alert("Grievous must approve this intake before sending. Open Grievous and run a Full review."); return;
    }
    if (!signerPhone) { setMsg("A phone number is required to text the signing link."); return; }
    setMsg("Creating signing link…");
    const body = preview?.rendered_body || "";
    const r = await fetch("/api/signable", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", lead_id: leadId, title: "Retainer Agreement", doc_type: "retainer", certified: false, body_html: body, signer_name: signerName, signer_phone: signerPhone, retainer_id: id }) });
    const d = await r.json();
    if (!d.ok) { setMsg(d.error || "Could not create signing link"); return; }
    // text the link via JustCall
    try {
      await fetch("/api/justcall/action", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "sms", lead_id: leadId, to: signerPhone, body: `Please review and sign your retainer agreement here: ${d.link}` }) });
    } catch {}
    // mark the retainer sent
    await setStatus(id, "sent");
    setMsg("Signing link texted to the client.");
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
    const r = await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_template", id: tplEditId, name: tplName, body: tplBody, case_type: tplCaseType, is_default: tplDefault }) });
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

        <div className="row" style={{ gap: 12, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
            Case type
            <select value={tplCaseType} onChange={(e) => setTplCaseType(e.target.value)} style={{ width: "auto", fontWeight: 400, color: "var(--ink)" }}>
              <option value="any">Any case type</option>
              <option value="motel_trafficking">motel_trafficking</option>
              <option value="bard_powerport">bard_powerport</option>
              <option value="pfas">pfas</option>
              <option value="medmal">medmal</option>
              <option value="mva">mva</option>
              {leadCaseType && !["motel_trafficking","bard_powerport","pfas","medmal","mva"].includes(leadCaseType) && <option value={leadCaseType}>{leadCaseType}</option>}
            </select>
          </label>
          <label className="chk" style={{ alignSelf: "flex-end", marginBottom: 6 }}>
            <input type="checkbox" checked={tplDefault} onChange={(e) => setTplDefault(e.target.checked)} /> Default for this case type
          </label>
        </div>

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
            <div className="section-title">Send for signature</div>
            <div className="esign-method">
              <button className={`esign-method-opt ${method === "builtin" ? "on" : ""}`} onClick={() => setMethod("builtin")}>
                <strong>Built-in signer (default)</strong>
                <span>Texts the client a link to sign on our own page. Use for most retainers.</span>
              </button>
              <button className={`esign-method-opt ${method === "signwell" ? "on" : ""}`} onClick={() => setMethod("signwell")}>
                <strong>Certified (SignWell)</strong>
                <span>Court-admissible, full audit trail. Choose when you need certified.</span>
              </button>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <input placeholder="Signer name" value={signerName} onChange={(e) => setSignerName(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
              {method === "signwell" && <input placeholder="Signer email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} style={{ flex: 1, minWidth: 170 }} />}
              <input placeholder="Signer phone" value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              {method === "signwell" && (
                <select value={sendVia} onChange={(e) => setSendVia(e.target.value)} style={{ width: "auto" }}>
                  <option value="both">Email + text</option>
                  <option value="email">Email only</option>
                  <option value="sms">Text only</option>
                </select>
              )}
            </div>
            <button className="btn gold" onClick={() => method === "signwell" ? sendForSign(preview.id) : sendBuiltin(preview.id)}>
              {method === "signwell" ? "Send retainer for eSign" : "Text client our signing link"}
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {method === "signwell"
                ? "SignWell emails a secure, court-admissible signing link (and texts it too when a phone is on file). Status updates here automatically."
                : "We text the client a link to sign this retainer on our own page. Faster, but not a certified eSignature. Use SignWell for binding retainers."}
            </p>
          </div>
        )}
        {msg && <p className="save-msg" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    );
  }

  async function deleteRetainer(id: string) {
    if (!confirm("Delete this retainer from the file? This cannot be undone.")) return;
    const r = await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "delete", id, lead_id: leadId }) });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error || "Delete failed"); return; }
    load();
  }
  async function deleteTemplate() {
    if (!tplId) { setMsg("Pick a template to delete first."); return; }
    const name = templates.find((t) => t.id === tplId)?.name || "this template";
    if (!confirm(`Delete the retainer template "${name}"? It will no longer be available on any file.`)) return;
    const r = await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "delete_template", id: tplId }) });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error || "Delete failed"); return; }
    setTplId("");
    load();
  }
  async function deletePdf(id: string, name: string) {
    if (!confirm(`Delete PDF template "${name}"? This removes the uploaded file too.`)) return;
    const r = await fetch("/api/pdf-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "delete", id }) });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error || "Delete failed"); return; }
    if (sendPdfId === id) setSendPdfId("");
    loadPdfTemplates();
  }

  return (
    <div>
      {signables.filter((s) => s.provider === "builtin").length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="section-title">In-house signing status</div>
          <table className="docket" style={{ marginTop: 8 }}>
            <thead><tr><th>Document</th><th>Envelope</th><th>Status</th><th>Signer IP</th><th>Sender IP</th><th>Signed</th><th></th></tr></thead>
            <tbody>
              {signables.filter((s) => s.provider === "builtin").map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.title}</td>
                  <td className="muted">{s.envelope_id || "—"}</td>
                  <td><span className={`badge ${s.status === "signed" ? "count" : s.status === "viewed" ? "stage" : "flag"}`}>{s.status}</span></td>
                  <td className="muted">{s.signed_ip || "—"}</td>
                  <td className="muted">{s.sender_ip || "—"}</td>
                  <td className="muted">{s.signed_at ? new Date(s.signed_at).toLocaleString() : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {s.status !== "signed" && <a className="btn ghost sm" href={`/sign/${s.id}`} target="_blank" rel="noopener noreferrer">Open link</a>}
                    {s.completed_pdf_url && <a className="btn ghost sm" href={s.completed_pdf_url} target="_blank" rel="noopener noreferrer">Signed PDF</a>}
                    {s.cert_pdf_url && <a className="btn ghost sm" href={s.cert_pdf_url} target="_blank" rel="noopener noreferrer">Certificate</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <select value={tplId} onChange={(e) => setTplId(e.target.value)} style={{ width: "auto" }}>
          {templates.length === 0 && <option value="">No templates yet</option>}
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.case_type ? ` · ${t.case_type}` : ""}{t.is_default ? " (default)" : ""}</option>)}
        </select>
        <button className="btn gold" onClick={generate} disabled={!tplId}>Generate retainer</button>
        <button className="btn ghost" onClick={() => { setTplEditId(null); setTplName(""); setTplBody(""); setTplCaseType(leadCaseType || "any"); setTplDefault(false); setEditingTpl(true); }}>+ New template</button>
        {tplId && <button className="btn ghost sm danger" onClick={deleteTemplate}>Delete template</button>}
        {msg && <span className="muted" style={{ alignSelf: "center" }}>{msg}</span>}
      </div>

      <div className="section-title">Retainers on this file</div>
      {retainers.length === 0 && <p className="muted" style={{ fontSize: 13 }}>None yet. Pick a template and generate, it auto-fills from Contact and Intake.</p>}
      {retainers.map((r) => (
        <div key={r.id} className="cd-event">
          <div><strong>{STATUS_LABEL[r.status] ?? r.status}</strong> <span className="muted">· {new Date(r.created_at).toLocaleDateString()}</span></div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost sm" onClick={() => setPreview(r)}>Open</button>
            <button className="btn ghost sm danger" onClick={() => deleteRetainer(r.id)}>Delete</button>
          </div>
        </div>
      ))}

      <div className="section-title" style={{ marginTop: 24 }}>PDF retainers (upload + place fields)</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Upload your firm's real retainer PDF, then drag signature, date, and text boxes onto it and assign each to the client or the agent. Send in-house (default) or certified through SignWell.</p>
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
            <button className="btn ghost sm danger" onClick={() => deletePdf(t.id, t.name)}>Delete</button>
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
          <div className="esign-method" style={{ marginBottom: 10 }}>
            <button className={`esign-method-opt ${pdfMethod === "builtin" ? "on" : ""}`} onClick={() => setPdfMethod("builtin")}>
              <strong>In-house e-sign (default)</strong>
              <span>Client signs on our page; signature stamped onto the PDF, IPs and certificate recorded.</span>
            </button>
            <button className={`esign-method-opt ${pdfMethod === "signwell" ? "on" : ""}`} onClick={() => setPdfMethod("signwell")}>
              <strong>Certified (SignWell)</strong>
              <span>Court-admissible certified signature. Requires signer email.</span>
            </button>
          </div>
          <button className="btn gold" onClick={sendPdfRetainer}>Send for signature</button>
          {!approved && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--st-warn-bg)", border: "1px solid var(--st-warn-bd)", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--st-warn)", marginBottom: 8 }}>Grievous hasn't approved this file yet.</div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn ghost sm" disabled={runningGrievous} onClick={runGrievous}>{runningGrievous ? "Running…" : "Run Grievous review"}</button>
                {canOverrideRole && (
                  <label className="chk" style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Override and send anyway (owner/admin)
                  </label>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
