"use client";
import { useState, useEffect } from "react";

interface Campaign { id: string; name: string; firm_id: string | null; case_type: string; intake_template: string | null; retainer_template_id: string | null; retainer_packet?: any[]; esign_required?: boolean; tier: string | null; bill_rate: number | null; active: boolean; firms?: { name: string } | null;
  firm_email?: string | null; firm_cc?: string | null; firm_reply_to?: string | null; firm_subject_tpl?: string | null; firm_body_tpl?: string | null;
  attach_intake_pdf?: boolean; attach_intake_csv?: boolean; attach_retainer?: boolean; attach_certificate?: boolean; firm_delivery_on?: boolean; }

export default function CampaignsManager({ initial, firms, retainerTemplates }: { initial: Campaign[]; firms: { id: string; name: string }[]; retainerTemplates: { id: string; name: string; kind?: "text" | "pdf" }[] }) {
  const [rows, setRows] = useState<Campaign[]>(initial);
  const [edit, setEdit] = useState<Partial<Campaign> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Every selectable form = built-in types + every PUBLISHED builder form (so a
  // seeded/imported form like Beta Motel appears here automatically).
  const [claimTypes, setClaimTypes] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/claim-types");
        const d = await r.json();
        if (Array.isArray(d.types)) setClaimTypes(d.types);
      } catch {}
    })();
  }, []);

  async function save() {
    if (!edit?.name?.trim() || !edit?.case_type?.trim()) { setMsg("Name and case type are required."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Save failed"); return; }
    const list = await (await fetch("/api/campaigns")).json();
    setRows(list.campaigns ?? []);
    setEdit(null);
  }
  async function deactivate(id: string) {
    if (!confirm("Deactivate this campaign? Existing leads keep their link; it just stops appearing for new leads.")) return;
    await fetch(`/api/campaigns?id=${id}`, { method: "DELETE" });
    setRows((rs) => rs.map((x) => x.id === id ? { ...x, active: false } : x));
  }

  return (
    <div className="side-card" style={{ maxWidth: 920 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Campaigns</h3>
        <button className="btn" onClick={() => setEdit({ name: "", case_type: "", active: true })}>+ New campaign</button>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>A campaign is one firm running one case type (e.g. "TMP MVA"). It carries the firm, type, intake form, default retainer, and billing so Add lead only needs a name and the campaign.</p>
      {msg && <p className="banner" style={{ margin: "8px 0" }}>{msg}</p>}

      <table className="docket">
        <thead><tr><th>Campaign</th><th>Firm</th><th>Type</th><th>Tier</th><th>Rate</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
              <td style={{ fontWeight: 600 }}>{c.name}</td>
              <td>{c.firms?.name || (firms.find((f) => f.id === c.firm_id)?.name) || "—"}</td>
              <td>{c.case_type}</td>
              <td>{c.tier || "—"}</td>
              <td>{c.bill_rate != null ? `$${c.bill_rate}` : "—"}</td>
              <td>{c.active ? <span className="badge count">active</span> : <span className="badge dq">inactive</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => setEdit({ ...c })}>Edit</button>
                <a className="btn ghost sm" href={`/api/export/answers-csv?campaign_id=${c.id}`} target="_blank" rel="noopener noreferrer" title="Download all intakes for this campaign as a CSV">Export intakes</a>
                {c.active && <button className="btn ghost sm danger" onClick={() => deactivate(c.id)}>Deactivate</button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No campaigns yet. Create one to route Add lead.</td></tr>}
        </tbody>
      </table>

      {edit && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, padding: "20px 22px" }}>
            <h3 style={{ marginTop: 0 }}>{edit.id ? "Edit campaign" : "New campaign"}</h3>
            <div className="grid2">
              <label>Campaign name<input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="TMP MVA" /></label>
              <label>Firm<select value={edit.firm_id ?? ""} onChange={(e) => setEdit({ ...edit, firm_id: e.target.value })}><option value="">Select firm…</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label>Case type<select value={edit.case_type ?? ""} onChange={(e) => setEdit({ ...edit, case_type: e.target.value })}>
                <option value="">Select case type…</option>
                {claimTypes.map((t) => <option key={t.value} value={t.value}>{t.label !== t.value ? `${t.label} (${t.value})` : t.value}</option>)}
              </select></label>
              <label>Intake template<select value={edit.intake_template ?? ""} onChange={(e) => setEdit({ ...edit, intake_template: e.target.value })}>
                <option value="">Same as case type ({edit.case_type || "—"})</option>
                {claimTypes.map((t) => <option key={t.value} value={t.value}>{t.label !== t.value ? `${t.label} (${t.value})` : t.value}</option>)}
              </select></label>
              <label>Default retainer<select value={edit.retainer_template_id ?? ""} onChange={(e) => setEdit({ ...edit, retainer_template_id: e.target.value })}><option value="">None (use packet below)</option>{retainerTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label>Tier<input value={edit.tier ?? ""} onChange={(e) => setEdit({ ...edit, tier: e.target.value })} placeholder="A" /></label>
              <label>Bill rate (per sign)<input type="number" step="0.01" value={edit.bill_rate ?? ""} onChange={(e) => setEdit({ ...edit, bill_rate: parseFloat(e.target.value) })} placeholder="0.00" /></label>
            </div>
            <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--script-bg)", borderRadius: 8 }}>
              <label className="chk" style={{ fontSize: 13.5, fontWeight: 600 }}>
                <input type="checkbox" checked={edit.esign_required !== false} onChange={(e) => setEdit({ ...edit, esign_required: e.target.checked })} />
                E-sign required
              </label>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{edit.esign_required !== false ? "Client signs a retainer. Uses the Signed: status track." : "No signature step. Uses the plain status track."}</div>
            </div>

            {edit.esign_required !== false && (
              <div style={{ marginTop: 14 }}>
                <div className="section-title" style={{ marginBottom: 6 }}>Retainer packet (signed together)</div>
                <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>The documents the client signs in one ceremony (retainer + HIPAA + HITECH). Pick text templates or uploaded PDF retainers. Leave empty to use the default retainer above.</p>
                {(edit.retainer_packet ?? []).map((doc: any, i: number) => (
                  <div key={i} className="row" style={{ gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <input value={doc.label ?? ""} onChange={(e) => { const p = [...(edit.retainer_packet ?? [])]; p[i] = { ...p[i], label: e.target.value }; setEdit({ ...edit, retainer_packet: p }); }} placeholder="Label (e.g. HIPAA)" style={{ width: 140 }} />
                    <select value={doc.id ?? ""} onChange={(e) => { const sel = retainerTemplates.find((t) => t.id === e.target.value); const p = [...(edit.retainer_packet ?? [])]; p[i] = { ...p[i], id: e.target.value, kind: sel?.kind || "text" }; setEdit({ ...edit, retainer_packet: p }); }}>
                      <option value="">Select document…</option>
                      {retainerTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button className="btn ghost sm danger" onClick={() => { const p = (edit.retainer_packet ?? []).filter((_: any, j: number) => j !== i); setEdit({ ...edit, retainer_packet: p }); }}>Remove</button>
                  </div>
                ))}
                <button className="btn ghost sm" onClick={() => setEdit({ ...edit, retainer_packet: [...(edit.retainer_packet ?? []), { kind: "text", id: "", label: "" }] })}>+ Add document</button>
              </div>
            )}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line, #e6e8ec)" }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="section-title" style={{ margin: 0 }}>Firm delivery</div>
                <label className="chk" style={{ fontSize: 13, fontWeight: 600 }}>
                  <input type="checkbox" checked={edit.firm_delivery_on === true} onChange={(e) => setEdit({ ...edit, firm_delivery_on: e.target.checked })} />
                  Auto-send on Ready/Sent to firm
                </label>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>When a file reaches a status flagged "Unlocks file for firm", ClaimReach emails the firm the selected documents. Turn the switch off to send only with the manual "Send to firm" button on the file. Requires RESEND_API_KEY + EMAIL_FROM in Cloudflare.</p>

              <div className="grid2" style={{ marginTop: 8 }}>
                <label>Firm email<input value={edit.firm_email ?? ""} onChange={(e) => setEdit({ ...edit, firm_email: e.target.value })} placeholder="intake@firm.com" /></label>
                <label>CC (comma-separated, optional)<input value={edit.firm_cc ?? ""} onChange={(e) => setEdit({ ...edit, firm_cc: e.target.value })} placeholder="paralegal@firm.com" /></label>
                <label>Reply-to (optional)<input value={edit.firm_reply_to ?? ""} onChange={(e) => setEdit({ ...edit, firm_reply_to: e.target.value })} placeholder="cases@innovativeintake.com" /></label>
              </div>

              <label style={{ display: "block", marginTop: 8 }}>Email subject
                <input value={edit.firm_subject_tpl ?? ""} onChange={(e) => setEdit({ ...edit, firm_subject_tpl: e.target.value })} placeholder="New signed file: {{contact.full_name}} ({{case.lead_no}})" />
              </label>
              <label style={{ display: "block", marginTop: 8 }}>Email body
                <textarea value={edit.firm_body_tpl ?? ""} onChange={(e) => setEdit({ ...edit, firm_body_tpl: e.target.value })} rows={5} placeholder="Hello, please find the attached signed file for {{contact.full_name}} ({{case.lead_no}})..." style={{ width: "100%", fontFamily: "inherit" }} />
              </label>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                Mail-merge tokens: <code>{"{{contact.full_name}}"}</code> <code>{"{{contact.first_name}}"}</code> <code>{"{{contact.phone}}"}</code> <code>{"{{contact.email}}"}</code> <code>{"{{case.lead_no}}"}</code> <code>{"{{case.type}}"}</code> <code>{"{{campaign.name}}"}</code>. Leave subject/body blank to use the default template.
              </div>

              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--script-bg)", borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Attachments to include</div>
                <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
                  <label className="chk" style={{ fontSize: 13 }}><input type="checkbox" checked={edit.attach_intake_pdf !== false} onChange={(e) => setEdit({ ...edit, attach_intake_pdf: e.target.checked })} /> Intake Q&amp;A (PDF)</label>
                  <label className="chk" style={{ fontSize: 13 }}><input type="checkbox" checked={edit.attach_intake_csv === true} onChange={(e) => setEdit({ ...edit, attach_intake_csv: e.target.checked })} /> Intake Q&amp;A (CSV)</label>
                  <label className="chk" style={{ fontSize: 13 }}><input type="checkbox" checked={edit.attach_retainer !== false} onChange={(e) => setEdit({ ...edit, attach_retainer: e.target.checked })} /> Signed retainer</label>
                  <label className="chk" style={{ fontSize: 13 }}><input type="checkbox" checked={edit.attach_certificate !== false} onChange={(e) => setEdit({ ...edit, attach_certificate: e.target.checked })} /> Certificate of signature</label>
                </div>
              </div>
            </div>

            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save campaign"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
