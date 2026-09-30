"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fieldVisible, contactFieldsForType, US_STATES } from "@/lib/questionnaire";
import FieldRenderer from "./FieldRenderer";
import PhoneInput, { formatUsPhone } from "./PhoneInput";
import { useFieldAutosave } from "./useFieldAutosave";
import { inferMailTimeZone, timeZoneLabel } from "@/lib/mail-time-zone";

// The structured contact columns this tab always shows (names split,
// preferences, emergency contact), next to the form's own contact fields.
const CORE_KEYS = [
  "first_name", "last_name", "phone", "email", "dob", "mail_addr1", "mail_addr2", "mail_city", "mail_state", "mail_zip",
  "preferred_language", "preferred_time", "preferred_contact_method", "client_time_zone",
  "ec_name", "ec_relationship", "ec_phone", "ec_email", "ec_mail", "ec_permission_to_discuss",
];

// Contact Info tab — caller information + emergency contact. These fields are
// the single source of truth (stored on the lead). Any inline-in-intake copy
// reads/writes the same data, so they stay in sync (most recent write wins).
type ContactInfoProps = {
  lead: any; claimType?: string; editMode?: boolean; onRequestEdit?: () => void;
  points?: { id: string; kind: string; value: string; label?: string | null; status: string }[];
  /** Reports successfully saved values so the parent's live copy stays fresh. */
  onSaved?: (patch: Record<string, any>) => void;
};

export default function ContactInfo(props: ContactInfoProps) {
  // Pending autosaves belong to the original lead even if a parent reuses this
  // mounted component for another file. Its cleanup flushes with the old ID.
  return <ContactInfoRecord key={props.lead.id} {...props} />;
}

function ContactInfoRecord({ lead, claimType, editMode = true, onRequestEdit, points = [], onSaved }: ContactInfoProps) {
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
  // One value per column. The form's contact fields and the structured
  // fields below name some of the same columns (mailing address, emergency
  // contact phone). They share this one value instead of two copies where
  // the second overwrote the first on every save.
  const fromLead = (): Record<string, any> => {
    const init: Record<string, any> = {};
    for (const fld of allFields) if (fld.kind !== "section" && fld.kind !== "script") init[fld.id] = lead[fld.id] ?? "";
    for (const k of CORE_KEYS) init[k] = lead[k] ?? (k === "ec_permission_to_discuss" ? false : "");
    return init;
  };
  // The record's values as this tab last saw them in its props.
  const seen = useRef<Record<string, any> | null>(null);
  const acknowledgedName = useRef<Record<string, any>>({});
  // Autosave a second after the last edit, no manual Save needed. Only the
  // fields a person changed are sent, with their values when the save goes
  // out. A failed write keeps them unsaved and says so. Switching tabs sends
  // what is pending instead of dropping it (Astra audits, Sep 27, round 7b).
  const { values: vals, status, error: saveErr, savedAt, edit, incoming } = useFieldAutosave(fromLead, {
    delay: 1000,
    send: async (patch) => {
      let r: Response;
      try {
        r = await fetch("/api/leads", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "save", lead_id: lead.id, lead: patch }),
        });
      } catch {
        throw new Error("Could not reach the server. Nothing was saved.");
      }
      const d = await r.json().catch(() => ({}));
      // This used to swallow every error and then print "Saved" anyway, so a
      // failed write looked identical to a successful one. Never again: if it
      // did not save, the screen says so.
      if (!r.ok || d.error) throw new Error(d.error || "Could not save. Nothing was written.");
      acknowledgedName.current = {
        ...(d.contact?.claimant_name ? { claimant_name: d.contact.claimant_name } : {}),
        ...(d.contact?.client_time_zone ? { client_time_zone: d.contact.client_time_zone } : {}),
      };
    },
    onSaved: (patch) => {
      // This save coming back through the parent's copy is not a refresh.
      if (seen.current) for (const k of Object.keys(patch)) seen.current[k] = patch[k];
      onSaved?.({ ...patch, ...acknowledgedName.current });
    },
  });
  function set(k: string, v: any) { edit({ [k]: v }); }
  // A refreshed record fills every CLEAN field whose value on the record
  // changed. Unsaved typing stays on screen and its pending save still goes
  // out (Astra round 7b: a refresh used to cancel the save and drop it).
  useEffect(() => {
    const now = fromLead();
    const before = seen.current;
    seen.current = now;
    if (!before) return; // the first render started from these same values
    const changed: Record<string, any> = {};
    for (const k of Object.keys(now)) if (JSON.stringify(now[k]) !== JSON.stringify(before[k])) changed[k] = now[k];
    if (Object.keys(changed).length) incoming(changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, claimType]);
  const [ssnRevealed, setSsnRevealed] = useState<Record<string, boolean>>({});
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
                  <input type={ssnRevealed[fld.id] ? "text" : "password"} value={vals[fld.id] ?? ""} onChange={(e) => set(fld.id, e.target.value)} style={{ flex: 1 }} />
                  {!ssnRevealed[fld.id] && <button className="btn ghost" onClick={() => revealSsn(fld.id)}>Reveal</button>}
                </div>
              </div>
            );
          }
          return <FieldRenderer key={fld.id} field={fld} value={vals[fld.id]} onChange={(v) => set(fld.id, v)} feeds={feedFor(fld.id)} />;
        })}
      </div>
    );
    bucket = [];
  };

  // Recomputed on every keystroke, so answering "deceased: yes" reveals the
  // date of death immediately rather than on a reload.
  const merged: Record<string, any> = { ...lead, ...vals };
  const fields = allFields.filter((fld) => {
    // MVA uses the canonical contact block above and the shared call spine.
    // Historical generic-form aliases stay on the record, not as a second
    // editable first/last/address form that disagrees with the call.
    if (claimType === "mva") return false;
    const rule = HIDE_UNLESS[fld.id];
    if (rule && !rule(merged)) return false;
    return fieldVisible(fld as any, merged);
  });

  fields.forEach((fld, i) => {
    if (fld.kind === "section") { flush(`s${i}`); blocks.push(<div className="section-title" key={fld.id} style={{ marginTop: 18 }}>{fld.label}</div>); }
    else if (fld.kind === "script") { flush(`s${i}`); blocks.push(<FieldRenderer key={fld.id} field={fld} value={null} onChange={() => {}} />); }
    else if (SHORT.has(fld.kind)) bucket.push(fld);
    else { flush(`s${i}`); blocks.push(<FieldRenderer key={fld.id} field={fld} value={vals[fld.id]} onChange={(v) => set(fld.id, v)} />); }
  });
  flush("end");

  // ---- READ-ONLY VIEW MODE (default) ----
  if (!editMode) {
    const fullName = [vals.first_name, vals.last_name].filter(Boolean).join(" ") || lead.claimant_name || "";
    const addr = [vals.mail_addr1, [vals.mail_city, vals.mail_state].filter(Boolean).join(", "), vals.mail_zip].filter(Boolean).join(" · ");
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
          <div className="ro-sub">Contact details for this file</div>
        </div>

        <div className="ro-section">Mailing Address</div>
        <div className="ro-grid">
          <V label="Address" value={addr} />
          <V label="Date of birth" value={vals.dob} />
        </div>

        <div className="ro-section">Contact Preferences</div>
        <div className="ro-grid">
          <V label="Cell phone" value={vals.phone ? formatUsPhone(vals.phone) : ""} />
          <V label="Email" value={vals.email} />
          <V label="Preferred language" value={vals.preferred_language} />
          <V label="Preferred time" value={vals.preferred_time} />
          <V label="Preferred method" value={vals.preferred_contact_method} />
          <V label="Time zone" value={vals.client_time_zone
            ? timeZoneLabel(vals.client_time_zone)
            : (() => { const inferred = inferMailTimeZone(vals.mail_state, vals.mail_zip); return inferred ? `${timeZoneLabel(inferred)} (from mailing address)` : ""; })()} />
        </div>

        <div className="ro-section">Emergency Contact</div>
        <div className="ro-grid">
          <V label="Name" value={vals.ec_name} />
          <V label="Relationship" value={vals.ec_relationship} />
          <V label="Phone" value={vals.ec_phone ? formatUsPhone(vals.ec_phone) : ""} />
          <V label="Email" value={vals.ec_email} />
        </div>
        <div className="ro-grid">
          <V label="Permission to discuss" value={vals.ec_permission_to_discuss ? "Yes" : "No"} />
        </div>

        {points.length > 0 && <ContactPointsList points={points} />}
        {onRequestEdit && <button className="edit-cta" onClick={onRequestEdit}>✎ Edit contact info</button>}
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">Client Name</div>
      <div className="grid2">
        <div className="field"><label htmlFor="contact-first-name" style={{ fontSize: 13 }}>First name</label><input id="contact-first-name" value={vals.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
        <div className="field"><label htmlFor="contact-last-name" style={{ fontSize: 13 }}>Last name</label><input id="contact-last-name" value={vals.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Full name (auto): <strong>{[vals.first_name, vals.last_name].filter(Boolean).join(" ") || "—"}</strong></div>

      <div className="section-title" style={{ marginTop: 16 }}>Phone & Email</div>
      <div className="grid2">
        <div className="field">
          <label style={{ fontSize: 13 }}>Cell phone (US)</label>
          <PhoneInput value={vals.phone} onChange={(e164) => set("phone", e164)} />
        </div>
        <div className="field"><label style={{ fontSize: 13 }}>Email</label><input type="email" value={vals.email} onChange={(e) => set("email", e.target.value)} placeholder="name@email.com" /></div>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>US numbers only. Type the 10 digits, the +1 and formatting are added automatically so every file matches.</div>

      <div className="section-title" style={{ marginTop: 16 }}>Mailing Address</div>
      <div className="field"><label style={{ fontSize: 13 }}>Address</label><input value={vals.mail_addr1} onChange={(e) => set("mail_addr1", e.target.value)} /></div>
      <div className="grid2">
        <div className="field"><label style={{ fontSize: 13 }}>City</label><input value={vals.mail_city} onChange={(e) => set("mail_city", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>State</label><PickOrKeep value={vals.mail_state} onChange={(v) => set("mail_state", v)} options={US_STATES} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>ZIP</label><input value={vals.mail_zip} onChange={(e) => set("mail_zip", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Date of birth</label><input type="date" value={vals.dob ?? ""} onChange={(e) => set("dob", e.target.value)} /></div>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>Contact Preferences</div>
      <div className="grid2">
        <div className="field"><label style={{ fontSize: 13 }}>Preferred language</label><PickOrKeep value={vals.preferred_language} onChange={(v) => set("preferred_language", v)} options={["English", "Spanish", "Other"]} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Preferred time</label><PickOrKeep value={vals.preferred_time} onChange={(v) => set("preferred_time", v)} options={["Morning", "Afternoon", "Evening", "Any time"]} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Preferred contact method</label><PickOrKeep value={vals.preferred_contact_method} onChange={(v) => set("preferred_contact_method", v)} options={["Phone", "Text", "Email"]} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Client time zone</label>
          <select value={vals.client_time_zone || ""} onChange={(e) => set("client_time_zone", e.target.value)}>
            <option value="">Confirm time zone</option>
            {vals.client_time_zone && !["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"].includes(vals.client_time_zone) && <option value={vals.client_time_zone}>{vals.client_time_zone}</option>}
            {["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"].map((zone) => <option key={zone} value={zone}>{timeZoneLabel(zone)}</option>)}
          </select>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>Emergency Contact</div>
      <div className="grid2">
        <div className="field"><label style={{ fontSize: 13 }}>Name</label><input value={vals.ec_name} onChange={(e) => set("ec_name", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Relationship to client</label><input value={vals.ec_relationship} onChange={(e) => set("ec_relationship", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Phone</label><PhoneInput value={vals.ec_phone} onChange={(e164) => set("ec_phone", e164)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Email</label><input value={vals.ec_email} onChange={(e) => set("ec_email", e.target.value)} /></div>
      </div>
      <div className="field"><label style={{ fontSize: 13 }}>Mailing address</label><input value={vals.ec_mail} onChange={(e) => set("ec_mail", e.target.value)} /></div>
      <label className="fld-row"><input type="checkbox" checked={!!vals.ec_permission_to_discuss} onChange={(e) => set("ec_permission_to_discuss", e.target.checked)} /> Permission to discuss the case with this contact</label>

      {points.length > 0 && <ContactPointsList points={points} />}
      {blocks.length > 0 && <div className="section-title" style={{ marginTop: 18 }}>Additional Contact Fields</div>}
      {blocks}
      {claimType === "mva" && allFields.some((f) => !CORE_KEYS.includes(f.id) && lead[f.id] != null && lead[f.id] !== "") && <details className="case-emergency"><summary>Historical contact-form values</summary><p className="muted">Earlier form entries are retained here. Use the fields above for this client's current contact details.</p>{allFields.filter((f) => !CORE_KEYS.includes(f.id) && !["section", "script"].includes(f.kind) && lead[f.id] != null && lead[f.id] !== "").map((f) => <div className="ro-field" key={f.id}><span className="ro-label">{f.label}</span><span className="ro-value">{f.id.includes("ssn") ? "Protected identifier on file" : String(lead[f.id])}</span></div>)}</details>}
      <div className="seg-nav">
        <div className="spacer" />
        {/* "Saved" only when nothing is waiting to save and the last write landed. */}
        {status === "saved" && savedAt != null && <span className="muted">Saved {new Date(savedAt).toLocaleTimeString()}</span>}
        {saveErr
          ? <span style={{ color: "#b91c1c", fontWeight: 700, fontSize: 12.5, maxWidth: 520, lineHeight: 1.4 }}>{saveErr}</span>
          : <span className="muted" style={{ fontSize: 12 }}>{status === "saving" ? "Saving…" : "Changes save automatically."}</span>}
      </div>
    </div>
  );
}

// A dropdown that never loses data: whatever is already stored shows as a
// choice even when it is not on the list (old free-typed values keep working),
// and picking writes the clean option. Dropdowns over free text, everywhere.
function PickOrKeep({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const v = String(value ?? "");
  return (
    <select value={v} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {v && !options.includes(v) && <option value={v}>{v}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ContactPointsList({ points }: { points: { id: string; kind: string; value: string; label?: string | null; status: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function putBack(id: string) {
    if (!confirm("Put this back on the desk?")) return;
    setBusy(id); setErr("");
    try {
      const r = await fetch("/api/m6/contact-point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "good" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { setErr(d.error || "That did not save. Try again."); return; }
      router.refresh();
    } catch {
      setErr("That did not save. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="section-title" style={{ marginTop: 18 }}>Contact points on this file</div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Same rows the Motel 6 desk uses. Not a second list.</p>
      {err && <p style={{ color: "#b91c1c", fontWeight: 700, fontSize: 12.5 }}>{err}</p>}
      <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
        {points.map((p) => (
          <li key={p.id} className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
            {p.label || p.kind}: {/phone|mobile|landline|sms/i.test(p.kind) ? formatUsPhone(p.value) : p.value}
            {p.status && p.status !== "live" && p.status !== "good" ? ` · ${p.status}` : ""}
            {(p.status === "opted_out" || p.status === "dead") && (
              <>
                {" "}
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!!busy}
                  onClick={() => void putBack(p.id)}
                  style={{ fontSize: 12, padding: "2px 8px" }}
                >
                  {busy === p.id ? "Putting back" : "Put back"}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

