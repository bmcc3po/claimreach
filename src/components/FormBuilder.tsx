"use client";
import { useState, useEffect } from "react";
import type { Field, FieldKind, ShowIf, Condition } from "@/lib/questionnaire";
import { fieldVisible } from "@/lib/questionnaire";
import { TEMPLATES } from "@/lib/form-templates";
import FieldRenderer from "./FieldRenderer";

const KINDS: { kind: FieldKind; label: string }[] = [
  { kind: "section", label: "Section" }, { kind: "script", label: "Script" },
  { kind: "text", label: "Short text" }, { kind: "longtext", label: "Long text" },
  { kind: "bool", label: "Yes / No" }, { kind: "select", label: "Dropdown" },
  { kind: "multiselect", label: "Checkboxes" }, { kind: "int", label: "Number" },
  { kind: "date", label: "Date" }, { kind: "monthyear", label: "Month/Year" },
  { kind: "phone", label: "Phone" }, { kind: "email", label: "Email" },
  { kind: "facility_lookup", label: "Facility (verify)" }, { kind: "property_lookup", label: "Property (verify)" },
  { kind: "gate", label: "Gate (DQ)" },
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
  const [aiOpen, setAiOpen] = useState(false);
  const [aiDesc, setAiDesc] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saved, setSaved] = useState<any[]>([]);

  useEffect(() => { if (formId) (async () => {
    const r = await fetch("/api/forms"); const d = await r.json();
    const f = (d.forms ?? []).find((x: any) => x.id === formId);
    if (f) { setName(f.name); setClaimType(f.claim_type); setDescription(f.description ?? ""); setFields(f.fields ?? []); setId(f.id); setStatus(f.status); }
  })(); }, [formId]);

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/saved-questions"); const d = await r.json(); setSaved(d.questions ?? []); } catch {}
  })(); }, []);

  function addField(kind: FieldKind) {
    const f = blankField(kind);
    setFields((arr) => { const next = [...arr, f]; setSel(next.length - 1); return next; });
  }
  function update(i: number, patch: Partial<Field>) { setFields((arr) => arr.map((f, idx) => idx === i ? { ...f, ...patch } : f)); }
  function move(i: number, dir: -1 | 1) {
    setFields((arr) => { const next = [...arr]; const j = i + dir; if (j < 0 || j >= next.length) return arr; [next[i], next[j]] = [next[j], next[i]]; return next; });
    setSel((s) => s === i ? i + dir : s);
  }
  function remove(i: number) { setFields((arr) => arr.filter((_, idx) => idx !== i)); setSel(null); }

  function loadTemplate(tid: string) {
    const t = TEMPLATES.find((x) => x.id === tid); if (!t) return;
    // clone with fresh ids? keep ids (they're referenced by showIf) — only clone if collision
    setFields((arr) => [...arr, ...t.fields.map((f) => ({ ...f }))]);
    setMsg(`Added "${t.name}" (${t.fields.length} fields).`);
  }

  async function aiBuild(mode: "form" | "questions") {
    if (!aiDesc.trim()) return;
    setAiBusy(true); setMsg("");
    const existingLabels = fields.filter((f) => f.kind === "section").map((f) => f.label).join(", ");
    const r = await fetch("/api/forms/ai", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, description: aiDesc, existingLabels }) });
    const d = await r.json();
    setAiBusy(false);
    if (d.fields && d.fields.length) {
      setFields((arr) => mode === "form" ? d.fields : [...arr, ...d.fields]);
      setAiOpen(false); setAiDesc("");
      setMsg(`AI added ${d.fields.length} fields. Review and edit.`);
    } else {
      setMsg(d.error ? `AI: ${d.error}` : "AI returned nothing. Try rephrasing.");
    }
  }

  async function saveQuestion(f: Field) {
    const r = await fetch("/api/saved-questions", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: f.label, field: f, tags: [f.kind] }) });
    if (r.ok) { const d = await r.json(); setSaved((s) => [d.question, ...s]); setMsg("Saved to your question library."); }
  }
  function insertSaved(q: any) {
    const f = { ...q.field, id: `f_${Math.random().toString(36).slice(2, 8)}` };
    setFields((arr) => { const next = [...arr, f]; setSel(next.length - 1); return next; });
  }

  async function save(publish = false) {
    if (!name.trim() || !claimType.trim()) { setMsg("Name and claim type are required."); return; }
    setSaving(true); setMsg("");
    const r = await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", id, claim_type: claimType.trim().toLowerCase(), name, description, fields }) });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error || "Save failed"); setSaving(false); return; }
    setId(d.id);
    if (publish) { await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "publish", id: d.id }) }); setStatus("published"); setMsg("Published. Live for new intakes of this claim type."); }
    else setMsg("Saved as draft.");
    setSaving(false);
  }

  const selField = sel != null ? fields[sel] : null;
  // fields BEFORE the selected one — valid targets for a condition
  const earlierAnswerFields = sel != null ? fields.slice(0, sel).filter((f) => !["section", "script", "gate"].includes(f.kind)) : [];

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
      <div className="row" style={{ flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <input placeholder="Form name (e.g. PFAS Intake)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <input placeholder="Claim type key (e.g. pfas)" value={claimType} onChange={(e) => setClaimType(e.target.value)} style={{ width: 180 }} />
        {status === "published" ? <span className="badge signed">Published</span> : <span className="badge count">Draft</span>}
      </div>
      <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 12 }} />

      {/* Top toolbar: AI + templates */}
      <div className="builder-toolbar">
        <button className="btn gold sm" onClick={() => setAiOpen((v) => !v)}>✨ Let AI build this form</button>
        <select className="sm" style={{ width: "auto" }} defaultValue="" onChange={(e) => { if (e.target.value) { loadTemplate(e.target.value); e.target.value = ""; } }}>
          <option value="">+ Start from template…</option>
          {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {saved.length > 0 && (
          <select className="sm" style={{ width: "auto" }} defaultValue="" onChange={(e) => { const q = saved.find((x) => x.id === e.target.value); if (q) { insertSaved(q); e.target.value = ""; } }}>
            <option value="">+ Insert saved question…</option>
            {saved.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
          </select>
        )}
      </div>

      {aiOpen && (
        <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: "var(--accent)" }}>
          <div className="section-title">✨ Describe the intake, AI drafts it</div>
          <textarea rows={3} placeholder="e.g. PFAS water contamination. 12 qualifying diagnoses (kidney cancer, testicular cancer, ulcerative colitis, thyroid disease…), diagnosed 1995 or later. 3 DQ gates: currently represented, signed with another firm, prior CL/PFAS signup. Capture diagnosis, diagnosis date, exposure location/duration." value={aiDesc} onChange={(e) => setAiDesc(e.target.value)} />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={() => aiBuild("form")} disabled={aiBusy}>{aiBusy ? "Building…" : "Build full form"}</button>
            <button className="btn ghost" onClick={() => aiBuild("questions")} disabled={aiBusy}>Just add these questions</button>
            <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>Review everything AI generates before publishing.</span>
          </div>
        </div>
      )}

      <div className="builder">
        <div className="builder-list">
          <div className="section-title">Fields</div>
          {fields.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Add fields from the right, start from a template, or let AI build it.</p>}
          {fields.map((f, i) => (
            <div key={f.id} className={`builder-row ${sel === i ? "active" : ""} ${f.kind === "section" ? "is-section" : ""}`} onClick={() => setSel(i)}>
              <span className="builder-kind">{f.kind === "section" ? "§" : f.kind === "gate" ? "⛔" : f.kind === "script" ? "📢" : "•"}</span>
              <span className="builder-label">{f.label || "(untitled)"}{f.showIf && f.showIf.rules.length > 0 && <span className="badge stage" style={{ marginLeft: 6, fontSize: 9 }}>conditional</span>}</span>
              <span className="builder-tools" onClick={(e) => e.stopPropagation()}>
                <button className="btn ghost sm" onClick={() => move(i, -1)}>↑</button>
                <button className="btn ghost sm" onClick={() => move(i, 1)}>↓</button>
                <button className="btn ghost sm" onClick={() => remove(i)}>✕</button>
              </span>
            </div>
          ))}
        </div>

        <div className="builder-inspect">
          <div className="section-title">Add field</div>
          <div className="builder-kinds">{KINDS.map((k) => <button key={k.kind} className="chip" onClick={() => addField(k.kind)}>{k.label}</button>)}</div>

          {selField && (
            <div className="card" style={{ padding: 14, marginTop: 14 }}>
              <div className="row"><div className="section-title" style={{ margin: 0 }}>Edit field</div><span className="spacer" /><button className="btn ghost sm" onClick={() => saveQuestion(selField)}>★ Save to library</button></div>
              <label className="fld-label">Label</label>
              <input value={selField.label} onChange={(e) => update(sel!, { label: e.target.value })} />

              {selField.kind === "script" && (<><label className="fld-label">Script (verbatim)</label><textarea rows={3} value={selField.script ?? ""} onChange={(e) => update(sel!, { script: e.target.value })} /></>)}
              {(selField.kind === "select" || selField.kind === "multiselect") && (<><label className="fld-label">Options (one per line)</label><textarea rows={4} value={(selField.options ?? []).join("\n")} onChange={(e) => update(sel!, { options: e.target.value.split("\n").filter(Boolean) })} /></>)}
              {selField.kind === "gate" && (<><label className="fld-label">Gate type</label><select value={selField.gateType ?? "dq"} onChange={(e) => update(sel!, { gateType: e.target.value as any })}><option value="dq">DQ</option><option value="safety">Safety</option><option value="supervisor">Supervisor</option><option value="end_intake">End intake</option></select></>)}
              {selField.kind === "facility_lookup" && (<><label className="fld-label">Paired city/state field id</label><input value={selField.locField ?? ""} onChange={(e) => update(sel!, { locField: e.target.value })} placeholder="e.g. facility1_loc" /></>)}
              {selField.kind !== "section" && selField.kind !== "script" && (<>
                <label className="fld-label">Scope</label>
                <select value={selField.scope} onChange={(e) => update(sel!, { scope: e.target.value as any })}><option value="lead">Once per claimant</option><option value="property">Repeats per property/item</option></select>
                <label className="fld-row"><input type="checkbox" checked={!!selField.vital} onChange={(e) => update(sel!, { vital: e.target.checked })} /> Vital field</label>
                <label className="fld-label">Agent note (not read aloud)</label>
                <input value={selField.agentNote ?? ""} onChange={(e) => update(sel!, { agentNote: e.target.value })} />
              </>)}

              {/* CONDITIONAL LOGIC — easy builder */}
              <ConditionEditor field={selField} earlier={earlierAnswerFields} onChange={(showIf) => update(sel!, { showIf })} />

              <div className="fld-label" style={{ color: "var(--ink-faint)" }}>id: <code>{selField.id}</code></div>
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

// Easy conditional editor: "Only show this if [match] of these are true" + add rules.
function ConditionEditor({ field, earlier, onChange }: { field: Field; earlier: Field[]; onChange: (s?: ShowIf) => void }) {
  const si = field.showIf;
  const rules = si?.rules ?? [];
  function setRules(next: Condition[]) { onChange(next.length ? { match: si?.match ?? "all", rules: next } : undefined); }
  function setMatch(m: "all" | "any") { onChange({ match: m, rules }); }

  if (earlier.length === 0) return <div className="cond-note muted">Add answerable questions above this one to make it conditional.</div>;

  return (
    <div className="cond-box">
      <div className="fld-label">Only show this field if</div>
      {rules.length === 0 && <button className="btn ghost sm" onClick={() => setRules([{ fieldId: earlier[0].id, op: "is", value: "" }])}>+ Add a condition</button>}
      {rules.length > 0 && (
        <>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <select className="sm" style={{ width: "auto" }} value={si?.match ?? "all"} onChange={(e) => setMatch(e.target.value as any)}>
              <option value="all">ALL of these (AND)</option>
              <option value="any">ANY of these (OR)</option>
            </select>
            <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>are true:</span>
          </div>
          {rules.map((r, i) => {
            const target = earlier.find((f) => f.id === r.fieldId);
            const opts = target?.options ?? (target?.kind === "bool" ? ["true", "false"] : []);
            return (
              <div key={i} className="cond-rule">
                <select className="sm" value={r.fieldId} onChange={(e) => { const n = [...rules]; n[i] = { ...r, fieldId: e.target.value }; setRules(n); }}>
                  {earlier.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <select className="sm" value={r.op} onChange={(e) => { const n = [...rules]; n[i] = { ...r, op: e.target.value as any }; setRules(n); }}>
                  <option value="is">is</option><option value="is_not">is not</option>
                  <option value="any_of">is any of</option><option value="not_blank">is answered</option><option value="is_blank">is blank</option>
                </select>
                {(r.op === "is" || r.op === "is_not") && (
                  opts.length ? <select className="sm" value={r.value ?? ""} onChange={(e) => { const n = [...rules]; n[i] = { ...r, value: e.target.value }; setRules(n); }}><option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  : <input className="sm" placeholder="value" value={r.value ?? ""} onChange={(e) => { const n = [...rules]; n[i] = { ...r, value: e.target.value }; setRules(n); }} />
                )}
                <button className="btn ghost sm" onClick={() => setRules(rules.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            );
          })}
          <button className="btn ghost sm" onClick={() => setRules([...rules, { fieldId: earlier[0].id, op: "is", value: "" }])}>+ Add condition</button>
        </>
      )}
    </div>
  );
}

function FormPreview({ fields }: { fields: Field[] }) {
  const [vals, setVals] = useState<Record<string, any>>({});
  return (
    <div>
      {fields.map((f) => {
        if (!fieldVisible(f, vals)) return null;
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
