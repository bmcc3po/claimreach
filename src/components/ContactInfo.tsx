"use client";
import { useState } from "react";
import { contactFieldsForType } from "@/lib/questionnaire";
import FieldRenderer from "./FieldRenderer";

// Contact Info tab — caller information + emergency contact. These fields are
// the single source of truth (stored on the lead). Any inline-in-intake copy
// reads/writes the same data, so they stay in sync (most recent write wins).
export default function ContactInfo({ lead, claimType }: { lead: any; claimType?: string }) {
  const fields = contactFieldsForType(claimType ?? "motel_trafficking");
  const [f, setF] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const fld of fields) if (fld.kind !== "section" && fld.kind !== "script") init[fld.id] = lead[fld.id] ?? "";
    return init;
  });
  const [ssnRevealed, setSsnRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function set(k: string, v: any) { setF((s) => ({ ...s, [k]: v })); }

  async function save() {
    setSaving(true);
    // Persist only real lead columns that exist; answers fields go to claim later.
    await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", lead_id: lead.id, lead: f }),
    }).catch(() => {});
    setSaving(false); setSavedAt(new Date().toLocaleTimeString());
  }

  async function revealSsn(field: string) {
    const r = await fetch("/api/ssn-reveal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id, field }),
    });
    if (r.ok) setSsnRevealed((s) => ({ ...s, [field]: true }));
  }

  // Group fields by section for layout; short fields render 2-up.
  const SHORT = new Set(["text", "phone", "email", "date", "int", "select"]);
  const blocks: React.ReactNode[] = [];
  let bucket: typeof fields = [];
  const flush = (key: string) => {
    if (!bucket.length) return;
    blocks.push(
      <div className="grid2" key={`g-${key}`}>
        {bucket.map((fld) => {
          const isSsn = fld.id.includes("ssn");
          if (isSsn) {
            return (
              <div className="field" key={fld.id}>
                <label style={{ fontSize: 13 }}>{fld.label}</label>
                <div className="row" style={{ gap: 8 }}>
                  <input type={ssnRevealed[fld.id] ? "text" : "password"} value={f[fld.id] ?? ""} onChange={(e) => set(fld.id, e.target.value)} style={{ flex: 1 }} />
                  {!ssnRevealed[fld.id] && <button className="btn ghost" onClick={() => revealSsn(fld.id)}>Reveal</button>}
                </div>
              </div>
            );
          }
          return <FieldRenderer key={fld.id} field={fld} value={f[fld.id]} onChange={(v) => set(fld.id, v)} />;
        })}
      </div>
    );
    bucket = [];
  };

  fields.forEach((fld, i) => {
    if (fld.kind === "section") { flush(`s${i}`); blocks.push(<div className="section-title" key={fld.id} style={{ marginTop: 18 }}>{fld.label}</div>); }
    else if (fld.kind === "script") { flush(`s${i}`); blocks.push(<FieldRenderer key={fld.id} field={fld} value={null} onChange={() => {}} />); }
    else if (SHORT.has(fld.kind)) bucket.push(fld);
    else { flush(`s${i}`); blocks.push(<FieldRenderer key={fld.id} field={fld} value={f[fld.id]} onChange={(v) => set(fld.id, v)} />); }
  });
  flush("end");

  return (
    <div>
      {blocks}
      <div className="seg-nav">
        <div className="spacer" />
        {savedAt && <span className="muted">Saved {savedAt}</span>}
        <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save contact info"}</button>
      </div>
    </div>
  );
}
