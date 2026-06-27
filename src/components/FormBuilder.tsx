"use client";
import { useState, useEffect } from "react";
import type { Field, FieldKind } from "@/lib/questionnaire";
import FieldRenderer from "./FieldRenderer";

const KINDS: { kind: FieldKind; label: string }[] = [
  { kind: "section", label: "Section header" },
  { kind: "script", label: "Read-aloud script" },
  { kind: "text", label: "Short text" },
  { kind: "longtext", label: "Long text" },
  { kind: "bool", label: "Yes / No" },
  { kind: "select", label: "Dropdown (one)" },
  { kind: "multiselect", label: "Checkboxes (many)" },
  { kind: "int", label: "Number" },
  { kind: "date", label: "Date" },
  { kind: "monthyear", label: "Month / Year" },
  { kind: "phone", label: "Phone" },
  { kind: "email", label: "Email" },
  { kind: "facility_lookup", label: "Facility (Google verify)" },
  { kind: "property_lookup", label: "Property (Google verify)" },
  { kind: "gate", label: "Gate (DQ / safety)" },
];

function blankField(kind: FieldKind): Field {
  const id = `f_${Math.random().toString(36).slice(2, 8)}`;
  const base: Field = { id, scope: "lead", kind, label: kind === "section" ? "New section" : "New question" };
  if (kind === "script") base.script = "Read this verbatim…";
  if (kind === "gate") base.gateType = "dq";
  if (kind === "select" || kind === "multiselect") base.options = ["Option 1", "Option 2"];
  return base;
}

export default function FormBuilder({ formId }: { formId?: string }) {
  const [name, setName] = useState("");
  const [claimType, setClaimType] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [id, setId] = useState<string | undefined>(formId);
  const [status, setStatus] = useState("draft");
  const [sel, setSel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => { if (formId) (async () => {
    const r = await fetch("/api/forms"); const d = await r.json();
    const f = (d.forms ?? []).find((x: any) => x.id === formId);
    if (f) { setName(f.name); setClaimType(f.claim_type); setDescription(f.description ?? ""); setFields(f.fields ?? []); setId(f.id); setStatus(f.status); }
  })(); }, [formId]);

  function addField(kind: FieldKind) {
    const f = blankField(kind);
    setFields((arr) => { const next = [...arr, f]; setSel(next.length - 1); return next; });
  }
  function update(i: number, patch: Partial<Field>) {
    setFields((arr) => arr.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }
  function move(i: number, dir: -1 | 1) {
    setFields((arr) => {
      const next = [...arr]; const j = i + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSel((s) => s === i ? i + dir : s);
  }
  function remove(i: number) {
    setFields((arr) => arr.filter((_, idx) => idx !== i));
    setSel(null);
  }

  async function save(publish = false) {
    if (!name.trim() || !claimType.trim()) { setMsg("Name and claim type are required."); return; }
    setSaving(true); setMsg("");
    const r = await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", id, claim_type: claimType.trim().toLowerCase(), name, description, fields }) });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error || "Save failed"); setSaving(false); return; }
    setId(d.id);
    if (publish) {
      await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "publish", id: d.id }) });
      setStatus("published"); setMsg("Published. Live for new intakes of this claim type.");
    } else setMsg("Saved as draft.");
    setSaving(false);
  }

  const selField = sel != null ? fields[sel] : null;

  if (showPreview) {
    return (
      <div>
        <button className="btn ghost sm" onClick={() => setShowPreview(false)}>← Back to builder</button>
        <div className="card" style={{ padding: 22, marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>{name || "Untitled form"}</h2>
          {description && <p className="muted">{description}</p>}
          <FormPreview fields={fields} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <input placeholder="Form name (e.g. PFAS Intake)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <input placeholder="Claim type key (e.g. pfas)" value={claimType} onChange={(e) => setClaimType(e.target.value)} style={{ width: 200 }} />
        {status === "published" ? <span className="badge signed">Published</span> : <span className="badge count">Draft</span>}
      </div>
      <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 14 }} />

      <div className="builder">
        {/* Field list */}
        <div className="builder-list">
          <div className="section-title">Fields</div>
          {fields.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Add fields from the right. Start with a Section header.</p>}
          {fields.map((f, i) => (
            <div key={f.id} className={`builder-row ${sel === i ? "active" : ""} ${f.kind === "section" ? "is-section" : ""}`} onClick={() => setSel(i)}>
              <span className="builder-kind">{f.kind === "section" ? "§" : f.kind === "gate" ? "⛔" : f.kind === "script" ? "📢" : "•"}</span>
              <span className="builder-label">{f.label || "(untitled)"}</span>
              <span className="builder-tools" onClick={(e) => e.stopPropagation()}>
                <button className="btn ghost sm" onClick={() => move(i, -1)}>↑</button>
                <button className="btn ghost sm" onClick={() => move(i, 1)}>↓</button>
                <button className="btn ghost sm" onClick={() => remove(i)}>✕</button>
              </span>
            </div>
          ))}
        </div>

        {/* Inspector / add */}
        <div className="builder-inspect">
          <div className="section-title">Add field</div>
          <div className="builder-kinds">
            {KINDS.map((k) => <button key={k.kind} className="chip" onClick={() => addField(k.kind)}>{k.label}</button>)}
          </div>

          {selField && (
            <div className="card" style={{ padding: 14, marginTop: 14 }}>
              <div className="section-title">Edit field</div>
              <label className="fld-label">Label</label>
              <input value={selField.label} onChange={(e) => update(sel!, { label: e.target.value })} />

              {selField.kind === "script" && (<><label className="fld-label">Script (read verbatim)</label>
                <textarea rows={3} value={selField.script ?? ""} onChange={(e) => update(sel!, { script: e.target.value })} /></>)}

              {(selField.kind === "select" || selField.kind === "multiselect") && (<><label className="fld-label">Options (one per line)</label>
                <textarea rows={4} value={(selField.options ?? []).join("\n")} onChange={(e) => update(sel!, { options: e.target.value.split("\n").filter(Boolean) })} /></>)}

              {selField.kind === "gate" && (<><label className="fld-label">Gate type</label>
                <select value={selField.gateType ?? "dq"} onChange={(e) => update(sel!, { gateType: e.target.value as any })}>
                  <option value="dq">DQ (disqualify)</option><option value="safety">Safety</option>
                  <option value="supervisor">Supervisor</option><option value="end_intake">End intake</option>
                </select></>)}

              {selField.kind === "facility_lookup" && (<><label className="fld-label">Paired city/state field id (optional)</label>
                <input value={selField.locField ?? ""} onChange={(e) => update(sel!, { locField: e.target.value })} placeholder="e.g. facility1_loc" /></>)}

              {selField.kind !== "section" && selField.kind !== "script" && (
                <><label className="fld-label">Scope</label>
                <select value={selField.scope} onChange={(e) => update(sel!, { scope: e.target.value as any })}>
                  <option value="lead">Once per claimant (lead)</option>
                  <option value="property">Repeats per property/item</option>
                </select>
                <label className="fld-row"><input type="checkbox" checked={!!selField.vital} onChange={(e) => update(sel!, { vital: e.target.checked })} /> Vital field</label>
                <label className="fld-label">Agent note (not read aloud)</label>
                <input value={selField.agentNote ?? ""} onChange={(e) => update(sel!, { agentNote: e.target.value })} /></>
              )}
              <div className="fld-label" style={{ color: "var(--ink-faint)" }}>Field id: <code>{selField.id}</code></div>
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
        <button className="btn gold" onClick={() => save(true)} disabled={saving}>Save & publish</button>
        <button className="btn ghost" onClick={() => setShowPreview(true)} disabled={fields.length === 0}>Preview</button>
        {msg && <span className="muted" style={{ alignSelf: "center" }}>{msg}</span>}
      </div>
    </div>
  );
}

// Lightweight live preview — renders the built fields with the real FieldRenderer.
function FormPreview({ fields }: { fields: Field[] }) {
  const [vals, setVals] = useState<Record<string, any>>({});
  return (
    <div>
      {fields.map((f) => {
        if (f.kind === "section") return <div key={f.id} className="section-title" style={{ fontSize: 15, marginTop: 18 }}>{f.label}</div>;
        if (f.kind === "script") return <div key={f.id} className="script" style={{ margin: "8px 0" }}>{f.script}</div>;
        if (f.kind === "gate") return <div key={f.id} className="gate" style={{ margin: "8px 0" }}>⛔ {f.label} <span className="muted">({f.gateType})</span></div>;
        return (
          <div key={f.id} className="field" style={{ marginBottom: 12 }}>
            <label className="fld-label">{f.label}{f.vital && <span className="badge gold" style={{ marginLeft: 6, fontSize: 10 }}>vital</span>}</label>
            <FieldRenderer field={f} value={vals[f.id]} onChange={(v) => setVals((s) => ({ ...s, [f.id]: v }))} onSetField={(id, v) => setVals((s) => ({ ...s, [id]: v }))} />
            {f.agentNote && <div className="muted" style={{ fontSize: 12 }}>{f.agentNote}</div>}
          </div>
        );
      })}
      {fields.length === 0 && <p className="muted">No fields yet.</p>}
    </div>
  );
}
