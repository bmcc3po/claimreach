"use client";
import { useState, useEffect, useRef } from "react";
import { fieldVisible, contactFieldsForType } from "@/lib/questionnaire";
import FieldRenderer from "./FieldRenderer";
import PhoneInput, { formatUsPhone } from "./PhoneInput";

// Contact Info tab — caller information + emergency contact. These fields are
// the single source of truth (stored on the lead). Any inline-in-intake copy
// reads/writes the same data, so they stay in sync (most recent write wins).
export default function ContactInfo({ lead, claimType, editMode = true, onRequestEdit }: { lead: any; claimType?: string; editMode?: boolean; onRequestEdit?: () => void }) {
  const allFields = contactFieldsForType(claimType ?? "motel_trafficking");

  // Conditions the field definitions do not carry yet. Keyed by field id.
  const HIDE_UNLESS: Record<string, (v: Record<string, any>) => boolean> = {
    ip_dod:            (v) => String(v.ip_deceased ?? "").toLowerCase() === "yes",
    caller_relation_ip:(v) => String(v.caller_is_self ?? "").toLowerCase() !== "yes",
    pnc_relation:      (v) => String(v.caller_is_self ?? "").toLowerCase() !== "yes",
    caller_first:      (v) => String(v.caller_is_self ?? "").toLowerCase() !== "yes",
    caller_last:       (v) => String(v.caller_is_self ?? "").toLowerCase() !== "yes",
    caller_phone:      (v) => String(v.caller_is_self ?? "").toLowerCase() !== "yes",
    caller_email:      (v) => String(v.caller_is_self ?? "").toLowerCase() !== "yes",
    caller_ssn:        (v) => String(v.caller_is_self ?? "").toLowerCase() !== "yes",
    caller_type:       (v) => String(v.caller_is_self ?? "").toLowerCase() !== "yes",
  };
  const [f, setF] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const fld of allFields) if (fld.kind !== "section" && fld.kind !== "script") init[fld.id] = lead[fld.id] ?? "";
    return init;
  });
  const [ssnRevealed, setSsnRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState("");
  const [feeds, setFeeds] = useState<Record<string, string>>({});
  useEffect(() => {
    const cid = lead.campaign_id;
    if (!cid) return;
    (async () => {
      try { const d = await (await fetch(`/api/retainer-autofill-map?campaign_id=${cid}`)).json(); setFeeds(d.feeds ?? {}); } catch {}
    })();
  }, [lead.campaign_id]);
  // Map standard contact tokens to the real contact form field ids so the purple
  // highlight lands on the right box. (Token namespace != form field ids.)
  const CONTACT_TOKEN_TO_FIELDS: Record<string, string[]> = {
    "contact.first_name": ["ip_first", "caller_first"],
    "contact.last_name": ["ip_last", "caller_last"],
    "contact.full_name": ["ip_first", "ip_last"],
    "contact.phone": ["caller_phone", "ip_phone"],
    "contact.email": ["caller_email"],
    "contact.dob": ["ip_dob", "caller_dob"],
    "contact.address": ["mail_addr1"],
  };
  function feedFor(fieldId: string): string | undefined {
    // Direct: retainer mapped this exact field id (rare for contact) or its token.
    if (feeds[fieldId]) return feeds[fieldId];
    if (feeds[`contact.${fieldId}`]) return feeds[`contact.${fieldId}`];
    // Indirect: a standard contact token maps to this form field.
    for (const [tok, ids] of Object.entries(CONTACT_TOKEN_TO_FIELDS)) {
      if (ids.includes(fieldId) && feeds[tok]) return feeds[tok];
    }
    return undefined;
  }

  // New structured contact fields (names split + preferences + emergency permission).
  const [x, setX] = useState<Record<string, any>>({
    first_name: lead.first_name ?? "", last_name: lead.last_name ?? "",
    phone: lead.phone ?? "", email: lead.email ?? "",
    dob: lead.dob ?? "", mail_addr1: lead.mail_addr1 ?? "", mail_addr2: lead.mail_addr2 ?? "",
    mail_city: lead.mail_city ?? "", mail_state: lead.mail_state ?? "", mail_zip: lead.mail_zip ?? "",
    preferred_language: lead.preferred_language ?? "", preferred_time: lead.preferred_time ?? "",
    preferred_contact_method: lead.preferred_contact_method ?? "", client_time_zone: lead.client_time_zone ?? "",
    ec_name: lead.ec_name ?? "", ec_relationship: lead.ec_relationship ?? "", ec_phone: lead.ec_phone ?? "",
    ec_email: lead.ec_email ?? "", ec_mail: lead.ec_mail ?? "", ec_permission_to_discuss: lead.ec_permission_to_discuss ?? false,
  });
  function setx(k: string, v: any) { setX((s) => ({ ...s, [k]: v })); }

  // Autosave a second after the last edit — no manual Save needed.
  const firstRun = useRef(true);
  const tmr = useRef<any>(null);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (tmr.current) clearTimeout(tmr.current);
    tmr.current = setTimeout(() => { save(); }, 1000);
    return () => { if (tmr.current) clearTimeout(tmr.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, x]);

  function set(k: string, v: any) { setF((s) => ({ ...s, [k]: v })); }

  async function save() {
    setSaving(true); setSaveErr("");
    try {
      const r = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "save", lead_id: lead.id, lead: { ...f, ...x } }),
      });
      const d = await r.json().catch(() => ({}));
      // This used to swallow every error and then print "Saved" anyway, so a
      // failed write looked identical to a successful one. Never again: if it
      // did not save, the screen says so.
      if (!r.ok) { setSaveErr(d.error || "Could not save. Nothing was written."); setSaving(false); return; }
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setSaveErr("Could not reach the server. Nothing was saved.");
    }
    setSaving(false);
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
          return <FieldRenderer key={fld.id} field={fld} value={f[fld.id]} onChange={(v) => set(fld.id, v)} feeds={feedFor(fld.id)} />;
        })}
      </div>
    );
    bucket = [];
  };

  // Recomputed on every keystroke, so answering "deceased: yes" reveals the
  // date of death immediately rather than on a reload.
  const merged: Record<string, any> = { ...lead, ...f, ...x };
  const fields = allFields.filter((fld) => {
    const rule = HIDE_UNLESS[fld.id];
    if (rule && !rule(merged)) return false;
    return fieldVisible(fld as any, merged);
  });

  fields.forEach((fld, i) => {
    if (fld.kind === "section") { flush(`s${i}`); blocks.push(<div className="section-title" key={fld.id} style={{ marginTop: 18 }}>{fld.label}</div>); }
    else if (fld.kind === "script") { flush(`s${i}`); blocks.push(<FieldRenderer key={fld.id} field={fld} value={null} onChange={() => {}} />); }
    else if (SHORT.has(fld.kind)) bucket.push(fld);
    else { flush(`s${i}`); blocks.push(<FieldRenderer key={fld.id} field={fld} value={f[fld.id]} onChange={(v) => set(fld.id, v)} />); }
  });
  flush("end");

  // ---- READ-ONLY VIEW MODE (default) ----
  if (!editMode) {
    const fullName = [x.first_name, x.last_name].filter(Boolean).join(" ") || lead.claimant_name || "";
    const addr = [x.mail_addr1, [x.mail_city, x.mail_state].filter(Boolean).join(", "), x.mail_zip].filter(Boolean).join(" · ");
    const V = ({ label, value }: { label: string; value: any }) => (
      <div className="ro-field">
        <span className="ro-label">{label}</span>
        <span className={`ro-value ${!value && value !== 0 ? "empty" : ""}`}>{value || "Not collected"}</span>
      </div>
    );
    return (
      <div className="ro-wrap">
        <div className="ro-namecard">
          <div className="ro-name">{fullName || "Unnamed client"}</div>
          <div className="ro-sub">{lead.phone ? formatUsPhone(lead.phone) : "no phone"}{lead.email ? ` · ${lead.email}` : ""}</div>
        </div>

        <div className="ro-section">Mailing Address</div>
        <div className="ro-grid">
          <V label="Address" value={addr} />
          <V label="Date of birth" value={x.dob} />
        </div>

        <div className="ro-section">Contact Preferences</div>
        <div className="ro-grid">
          <V label="Preferred language" value={x.preferred_language} />
          <V label="Preferred time" value={x.preferred_time} />
          <V label="Preferred method" value={x.preferred_contact_method} />
          <V label="Time zone" value={x.client_time_zone} />
        </div>

        <div className="ro-section">Emergency Contact</div>
        <div className="ro-grid">
          <V label="Name" value={x.ec_name} />
          <V label="Relationship" value={x.ec_relationship} />
          <V label="Phone" value={x.ec_phone ? formatUsPhone(x.ec_phone) : ""} />
          <V label="Email" value={x.ec_email} />
        </div>
        <div className="ro-grid">
          <V label="Permission to discuss" value={x.ec_permission_to_discuss ? "Yes" : "No"} />
        </div>

        <button className="edit-cta" onClick={onRequestEdit}>✎ Edit contact info</button>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">Client Name</div>
      <div className="grid2">
        <div className="field"><label style={{ fontSize: 13 }}>First name</label><input value={x.first_name} onChange={(e) => setx("first_name", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Last name</label><input value={x.last_name} onChange={(e) => setx("last_name", e.target.value)} /></div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Full name (auto): <strong>{[x.first_name, x.last_name].filter(Boolean).join(" ") || "—"}</strong></div>

      <div className="section-title" style={{ marginTop: 16 }}>Phone & Email</div>
      <div className="grid2">
        <div className="field">
          <label style={{ fontSize: 13 }}>Cell phone (US)</label>
          <PhoneInput value={x.phone} onChange={(e164) => setx("phone", e164)} />
        </div>
        <div className="field"><label style={{ fontSize: 13 }}>Email</label><input type="email" value={x.email} onChange={(e) => setx("email", e.target.value)} placeholder="name@email.com" /></div>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>US numbers only. Type the 10 digits, the +1 and formatting are added automatically so every file matches.</div>

      <div className="section-title" style={{ marginTop: 16 }}>Mailing Address</div>
      <div className="field"><label style={{ fontSize: 13 }}>Address</label><input value={x.mail_addr1} onChange={(e) => setx("mail_addr1", e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label style={{ fontSize: 13 }}>City</label><input value={x.mail_city} onChange={(e) => setx("mail_city", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>State</label><input value={x.mail_state} onChange={(e) => setx("mail_state", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>ZIP</label><input value={x.mail_zip} onChange={(e) => setx("mail_zip", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Date of birth</label><input type="date" value={x.dob ?? ""} onChange={(e) => setx("dob", e.target.value)} /></div>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>Contact Preferences</div>
      <div className="grid2">
        <div className="field"><label style={{ fontSize: 13 }}>Preferred language</label><input value={x.preferred_language} onChange={(e) => setx("preferred_language", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Preferred time</label><input value={x.preferred_time} onChange={(e) => setx("preferred_time", e.target.value)} placeholder="e.g. mornings, after 5pm" /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Preferred contact method</label><input value={x.preferred_contact_method} onChange={(e) => setx("preferred_contact_method", e.target.value)} placeholder="Phone / Text / Email" /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Client time zone</label><input value={x.client_time_zone} onChange={(e) => setx("client_time_zone", e.target.value)} placeholder="e.g. PT, ET" /></div>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>Emergency Contact</div>
      <div className="grid2">
        <div className="field"><label style={{ fontSize: 13 }}>Name</label><input value={x.ec_name} onChange={(e) => setx("ec_name", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Relationship to client</label><input value={x.ec_relationship} onChange={(e) => setx("ec_relationship", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Phone</label><PhoneInput value={x.ec_phone} onChange={(e164) => setx("ec_phone", e164)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Email</label><input value={x.ec_email} onChange={(e) => setx("ec_email", e.target.value)} /></div>
      </div>
      <div className="field"><label style={{ fontSize: 13 }}>Mailing address</label><input value={x.ec_mail} onChange={(e) => setx("ec_mail", e.target.value)} /></div>
      <label className="fld-row"><input type="checkbox" checked={!!x.ec_permission_to_discuss} onChange={(e) => setx("ec_permission_to_discuss", e.target.checked)} /> Permission to discuss the case with this contact</label>

      {blocks.length > 0 && <div className="section-title" style={{ marginTop: 18 }}>Additional Contact Fields</div>}
      {blocks}
      <div className="seg-nav">
        <div className="spacer" />
        {savedAt && !saveErr && <span className="muted">Saved {savedAt}</span>}
        {saveErr
          ? <span style={{ color: "#b91c1c", fontWeight: 700, fontSize: 12.5, maxWidth: 520, lineHeight: 1.4 }}>{saveErr}</span>
          : <span className="muted" style={{ fontSize: 12 }}>{saving ? "Saving…" : "Changes save automatically."}</span>}
      </div>
    </div>
  );
}
