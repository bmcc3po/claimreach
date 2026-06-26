"use client";
import { useState } from "react";

// Full contact info for the person/file. Includes PII (DOB, SSN) with the
// SSN reveal logged to audit, contact permissions, and two emergency contacts.
export default function ContactInfo({ lead }: { lead: any }) {
  const [f, setF] = useState<Record<string, any>>({
    dob: lead.dob ?? "", ssn_last4: lead.ssn_last4 ?? "",
    perm_call: lead.perm_call ?? true, perm_text: lead.perm_text ?? true, perm_email: lead.perm_email ?? true,
    ec1_name: lead.ec1_name ?? "", ec1_phone: lead.ec1_phone ?? "", ec1_email: lead.ec1_email ?? "",
    ec1_relation: lead.ec1_relation ?? "", ec1_perm_speak: lead.ec1_perm_speak ?? false, ec1_divulge: lead.ec1_divulge ?? false,
    ec2_name: lead.ec2_name ?? "", ec2_phone: lead.ec2_phone ?? "", ec2_email: lead.ec2_email ?? "",
    ec2_relation: lead.ec2_relation ?? "", ec2_perm_speak: lead.ec2_perm_speak ?? false, ec2_divulge: lead.ec2_divulge ?? false,
  });
  const [ssnRevealed, setSsnRevealed] = useState(false);
  const [ssnFull, setSsnFull] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function set(k: string, v: any) { setF((s) => ({ ...s, [k]: v })); }

  async function save() {
    setSaving(true);
    await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", lead_id: lead.id, lead: f }),
    }).catch(() => {});
    setSaving(false); setSavedAt(new Date().toLocaleTimeString());
  }

  async function revealSsn() {
    // Reveal is logged to the audit trail (who + when).
    const r = await fetch("/api/ssn-reveal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id }),
    });
    const d = await r.json();
    if (r.ok) { setSsnFull(d.ssn ?? "(not on file)"); setSsnRevealed(true); }
  }

  return (
    <div>
      <div className="section-title">Claimant (PNC)</div>
      <div className="grid2">
        <div className="field"><label>Full name</label><div className="readonly">{lead.claimant_name ?? "—"}</div></div>
        <div className="field"><label>Phone</label><div className="readonly">{lead.phone ?? "—"}</div></div>
        <div className="field"><label>Email</label><div className="readonly">{lead.email ?? "—"}</div></div>
        <div className="field"><label>Date of birth</label>
          <input type="date" value={f.dob} onChange={(e) => set("dob", e.target.value)} /></div>
        <div className="field"><label>SSN</label>
          <div className="row" style={{ gap: 8 }}>
            <div className="readonly" style={{ flex: 1, fontFamily: "var(--mono)" }}>
              {ssnRevealed ? ssnFull : (f.ssn_last4 ? `•••-••-${f.ssn_last4}` : "—")}
            </div>
            {!ssnRevealed && <button className="btn ghost" onClick={revealSsn}>Reveal</button>}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Reveals are logged to the Activity Log.</span>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 20 }}>Contact permissions</div>
      <div className="perm-row">
        <label className="perm"><input type="checkbox" checked={f.perm_call} onChange={(e) => set("perm_call", e.target.checked)} /> Permission to call</label>
        <label className="perm"><input type="checkbox" checked={f.perm_text} onChange={(e) => set("perm_text", e.target.checked)} /> Permission to text</label>
        <label className="perm"><input type="checkbox" checked={f.perm_email} onChange={(e) => set("perm_email", e.target.checked)} /> Permission to email</label>
      </div>

      <EmergencyContact n={1} f={f} set={set} />
      <EmergencyContact n={2} f={f} set={set} />

      <div className="seg-nav">
        <div className="spacer" />
        {savedAt && <span className="muted">Saved {savedAt}</span>}
        <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save contact info"}</button>
      </div>
    </div>
  );
}

function EmergencyContact({ n, f, set }: { n: number; f: any; set: (k: string, v: any) => void }) {
  const p = `ec${n}_`;
  return (
    <div className="card" style={{ marginTop: 16, borderLeft: "4px solid var(--accent)" }}>
      <div className="section-title">Emergency contact {n}</div>
      <div className="grid2">
        <div className="field"><label>Name</label><input value={f[p + "name"]} onChange={(e) => set(p + "name", e.target.value)} /></div>
        <div className="field"><label>Relationship</label><input value={f[p + "relation"]} onChange={(e) => set(p + "relation", e.target.value)} /></div>
        <div className="field"><label>Phone</label><input value={f[p + "phone"]} onChange={(e) => set(p + "phone", e.target.value)} /></div>
        <div className="field"><label>Email</label><input value={f[p + "email"]} onChange={(e) => set(p + "email", e.target.value)} /></div>
      </div>
      <div className="perm-row">
        <label className="perm"><input type="checkbox" checked={f[p + "perm_speak"]} onChange={(e) => set(p + "perm_speak", e.target.checked)} /> OK to speak with this contact</label>
        <label className="perm"><input type="checkbox" checked={f[p + "divulge"]} onChange={(e) => set(p + "divulge", e.target.checked)} /> OK to divulge case detail</label>
      </div>
    </div>
  );
}
