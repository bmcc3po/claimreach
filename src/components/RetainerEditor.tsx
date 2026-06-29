"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const CASE_TYPES = ["any", "motel_trafficking", "bard_powerport", "pfas", "medmal", "mva"];
const MERGE_FIELDS = [
  { tok: "contact.full_name", label: "Client name" },
  { tok: "contact.first_name", label: "First name" },
  { tok: "contact.last_name", label: "Last name" },
  { tok: "contact.phone", label: "Phone" },
  { tok: "contact.email", label: "Email" },
  { tok: "contact.address", label: "Address" },
  { tok: "contact.dob", label: "Date of birth" },
  { tok: "case.lead_no", label: "File number" },
  { tok: "case.type", label: "Case type" },
  { tok: "case.handling_attorney", label: "Handling attorney" },
  { tok: "case.referring_attorney", label: "Referring attorney" },
  { tok: "today", label: "Today's date" },
];

// Sample values for the live preview so you see a realistic rendering.
const PREVIEW: Record<string, string> = {
  "contact.full_name": "Jane A. Doe", "contact.first_name": "Jane", "contact.last_name": "Doe",
  "contact.phone": "(702) 555-0142", "contact.email": "jane.doe@email.com",
  "contact.address": "123 Main St, Las Vegas, NV 89101", "contact.dob": "04/12/1986",
  "case.lead_no": "TMP-00123", "case.type": "mva", "case.handling_attorney": "R. Turnbull",
  "case.referring_attorney": "", "today": new Date().toLocaleDateString(),
};
function renderPreview(body: string) {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => PREVIEW[k] ?? `[${k}]`);
}

export default function RetainerEditor({ id }: { id: string }) {
  const router = useRouter();
  const isNew = id === "new";
  const [name, setName] = useState("");
  const [caseType, setCaseType] = useState("any");
  const [isDefault, setIsDefault] = useState(false);
  const [body, setBody] = useState("");
  const [aiDesc, setAiDesc] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const d = await (await fetch(`/api/retainer-templates?id=${id}`)).json();
        const t = d.template;
        if (t) { setName(t.name || ""); setCaseType(t.case_type || "any"); setIsDefault(!!t.is_default); setBody(t.body || ""); }
      } catch {}
    })();
  }, [id, isNew]);

  function insert(tok: string) {
    setBody((b) => b + (b && !b.endsWith(" ") && !b.endsWith("\n") ? " " : "") + `{{${tok}}}`);
  }

  async function aiDraft() {
    if (!aiDesc.trim()) { setMsg("Describe the retainer first."); return; }
    setAiBusy(true); setMsg("Drafting… this can take up to a minute.");
    try {
      const r = await fetch("/api/retainer/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: aiDesc, caseType: caseType === "any" ? "" : caseType }) });
      const d = await r.json();
      if (d.body) { setBody(d.body); setMsg("AI drafted the retainer. Review and edit, then save."); }
      else setMsg(d.error || "AI returned nothing. Try rephrasing.");
    } catch { setMsg("Request failed. Check the AI connection."); }
    finally { setAiBusy(false); }
  }

  async function save() {
    if (!name.trim() || !body.trim()) { setMsg("Name and body are required."); return; }
    setBusy(true); setMsg("");
    const r = await fetch("/api/retainer", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save_template", id: isNew ? undefined : id, name, body, case_type: caseType === "any" ? null : caseType, is_default: isDefault }) });
    setBusy(false);
    if (r.ok) router.push("/templates?tab=retainers");
    else { const d = await r.json(); setMsg(d.error || "Save failed"); }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <a href="/templates?tab=retainers" className="muted" style={{ fontSize: 13, textDecoration: "none" }}>← Retainers</a>
          <h1 style={{ margin: "4px 0 0" }}>{isNew ? "New retainer template" : "Edit retainer template"}</h1>
        </div>
        <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save retainer"}</button>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <label style={{ flex: 1, minWidth: 220 }}>Template name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="MVA Standard Retainer" /></label>
        <label>Case type<select value={caseType} onChange={(e) => setCaseType(e.target.value)}>{CASE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="chk" style={{ marginBottom: 8 }}><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Default for this type</label>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: "var(--accent)" }}>
        <div className="section-title">✨ Let AI draft this retainer</div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Describe the case and any special terms. AI writes the body and inserts merge fields automatically.</p>
        <textarea value={aiDesc} onChange={(e) => setAiDesc(e.target.value)} rows={3} placeholder="e.g. Standard 40% contingency MVA retainer for Turnbull Moak, with lien language and a 3-day cancellation clause." style={{ width: "100%" }} />
        <button className="btn" style={{ marginTop: 8 }} disabled={aiBusy} onClick={aiDraft}>{aiBusy ? "Drafting…" : "Draft with AI"}</button>
        {msg && <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>{msg}</span>}
      </div>

      <div className="section-title" style={{ marginBottom: 6 }}>Insert merge field</div>
      <div className="merge-row">
        {MERGE_FIELDS.map((m) => <button key={m.tok} className="merge-chip" onClick={() => insert(m.tok)} title={`{{${m.tok}}}`}>{m.label}</button>)}
      </div>

      <div className="retainer-split">
        <div>
          <div className="section-title" style={{ marginBottom: 6 }}>Retainer body</div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={26} placeholder="Write or AI-draft the retainer. Use the merge buttons above to insert client and case fields." style={{ width: "100%", fontFamily: "Georgia, serif", lineHeight: 1.55 }} />
        </div>
        <div>
          <div className="section-title" style={{ marginBottom: 6 }}>Live preview</div>
          <div className="retainer-preview">{renderPreview(body) || <span className="muted">Your retainer will preview here as you type, with sample client data filled in.</span>}</div>
        </div>
      </div>
    </div>
  );
}
