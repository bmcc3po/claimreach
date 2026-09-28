"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fieldVisible, contactFieldsForType, US_STATES } from "@/lib/questionnaire";
import FieldRenderer from "./FieldRenderer";
import PhoneInput, { formatUsPhone } from "./PhoneInput";

// Contact Info tab — caller information + emergency contact. These fields are
// the single source of truth (stored on the lead). Any inline-in-intake copy
// reads/writes the same data, so they stay in sync (most recent write wins).
export default function ContactInfo({ lead, claimType, editMode = true, onRequestEdit, points = [], onSaved }: {
  lead: any; claimType?: string; editMode?: boolean; onRequestEdit?: () => void;
  points?: { id: string; kind: string; value: string; label?: string | null; status: string }[];
  /** Reports successfully saved values so the parent's live copy stays fresh. */
  onSaved?: (patch: Record<string, any>) => void;
}) {
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
  const dirty = useRef<Set<string>>(new Set());
  const seenUpdatedAt = useRef<any>(lead.updated_at);
  const refreshing = useRef(false);
  useEffect(() => {
    if (lead.updated_at === seenUpdatedAt.current) return;
    seenUpdatedAt.current = lead.updated_at;
    refreshing.current = true;
    // A refreshed record updates every CLEAN field; unsaved typing stays.
    setF((s) => {
      const next = { ...s };
      for (const fld of allFields) {
        if (fld.kind === "section" || fld.kind === "script") continue;
        if (!dirty.current.has(fld.id)) next[fld.id] = lead[fld.id] ?? "";
      }
      return next;
    });
    setX((s) => {
      const next: Record<string, any> = { ...s };
      for (const k of Object.keys(s)) {
        if (!dirty.current.has("x:" + k)) next[k] = lead[k] ?? (k === "ec_permission_to_discuss" ? false : "");
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.updated_at]);
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
  function setx(k: string, v: any) { dirty.current.add("x:" + k); setX((s) => ({ ...s, [k]: v })); }

  // Autosave a second after the last edit — no manual Save needed.
  const firstRun = useRef(true);
  const tmr = useRef<any>(null);
  // Switching case tabs within a second of typing used to cancel the debounce
  // and drop the edit (Astra audit, Sep 27). Flush on unmount instead.
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => () => { flushRef.current(); }, []);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (refreshing.current) { refreshing.current = false; return; }
    if (tmr.current) clearTimeout(tmr.current);
    tmr.current = setTimeout(() => { tmr.current = null; save(); }, 1000);
    flushRef.current = () => { if (tmr.current) { clearTimeout(tmr.current); tmr.current = null; void save(); } };
    return () => { if (tmr.current) clearTimeout(tmr.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, x]);

  function set(k: string, v: any) { dirty.current.add(k); setF((s) => ({ ...s, [k]: v })); }

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
      dirty.current.clear();
      onSaved?.({ ...f, ...x });
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

        {points.length > 0 && <ContactPointsList points={points} />}
        {onRequestEdit && <button className="edit-cta" onClick={onRequestEdit}>✎ Edit contact info</button>}
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
        <div className="field"><label style={{ fontSize: 13 }}>State</label><PickOrKeep value={x.mail_state} onChange={(v) => setx("mail_state", v)} options={US_STATES} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>ZIP</label><input value={x.mail_zip} onChange={(e) => setx("mail_zip", e.target.value)} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Date of birth</label><input type="date" value={x.dob ?? ""} onChange={(e) => setx("dob", e.target.value)} /></div>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>Contact Preferences</div>
      <div className="grid2">
        <div className="field"><label style={{ fontSize: 13 }}>Preferred language</label><PickOrKeep value={x.preferred_language} onChange={(v) => setx("preferred_language", v)} options={["English", "Spanish", "Other"]} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Preferred time</label><PickOrKeep value={x.preferred_time} onChange={(v) => setx("preferred_time", v)} options={["Morning", "Afternoon", "Evening", "Any time"]} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Preferred contact method</label><PickOrKeep value={x.preferred_contact_method} onChange={(v) => setx("preferred_contact_method", v)} options={["Phone", "Text", "Email"]} /></div>
        <div className="field"><label style={{ fontSize: 13 }}>Client time zone</label><PickOrKeep value={x.client_time_zone} onChange={(v) => setx("client_time_zone", v)} options={["Eastern", "Central", "Mountain", "Pacific", "Alaska", "Hawaii"]} /></div>
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

      {points.length > 0 && <ContactPointsList points={points} />}
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
