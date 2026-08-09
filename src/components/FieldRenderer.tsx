"use client";
import type { Field } from "@/lib/questionnaire";
import FacilityLookup from "./FacilityLookup";
import CityStateLookup from "./CityStateLookup";
import IncidentLocation from "./IncidentLocation";
import AddressLookup from "./AddressLookup";

// ============================================================================
// FIELD RENDERER
//
// Renders a stored Field. This is the data-driven twin of the console's
// GuidedStep, and it has to match it feature for feature, because the console
// questions are moving out of code and into intake_forms. Anything GuidedStep
// can do that this cannot is content that silently disappears on the way.
//
// Three things were missing and are fixed here.
//
// 1. CHOICE VALUES. select/multiselect rendered `field.options` (plain display
//    strings) and stored the LABEL as the answer. The engine matches on VALUES:
//    "under_10k", not "Under $10,000". A form-driven MVA would therefore have
//    stored labels the routing math could never match, and files would have
//    mis-dispositioned with nothing indicating why. `choices` now wins wherever
//    it exists; `options` remains the fallback for older forms that only carry
//    display strings.
//
// 2. PER-OPTION AGENT NOTES. `choices[].note` carries coaching attached to one
//    answer ("Not sure is not a no. Keep going", "Flags for secondary review").
//    It was parsed into the type and then never rendered.
//
// 3. GOOGLE LOOKUPS. `lookup: "city"` and `lookup: "agency"` had no renderer
//    outside the console, so the address matching and the police-department
//    inference existed only on the console path.
// ============================================================================

export default function FieldRenderer({
  field,
  value,
  onChange,
  onSetField,
  qNum,
  feeds,
  answers,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  onSetField?: (id: string, v: any) => void;
  qNum?: number;
  feeds?: string;
  /** Sibling answers, so context-aware lookups can read what was already captured. */
  answers?: Record<string, any>;
}) {
  const numTag = qNum ? <span className="qn-inline">Q{qNum}</span> : null;
  if (field.kind === "section") {
    return <div className="section-title">{field.label}</div>;
  }
  if (field.kind === "facility_lookup") {
    return (
      <FacilityLookup
        value={value}
        onPick={(name, loc) => {
          onChange(name);
          if (field.locField && onSetField) onSetField(field.locField, loc);
        }}
      />
    );
  }
  if (field.kind === "script") {
    return (
      <div className="script">
        <span className="tag">Read verbatim</span>
        {field.script}
      </div>
    );
  }

  const note = field.agentNote ? (
    <div className="agent-note">
      <span className="tag">Agent:</span>
      {field.agentNote}
    </div>
  ) : null;

  if (field.kind === "gate") {
    return (
      <div className="gate">
        <span className="tag">
          {field.gateType === "end_intake" ? "Stop gate" :
           field.gateType === "supervisor" ? "Supervisor gate" :
           field.gateType === "dq" ? "DQ gate" : "Safety gate"}
        </span>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{numTag}{field.label}</div>
        {field.agentNote && <div className="muted" style={{ marginBottom: 8 }}>{field.agentNote}</div>}
        <div className="row">
          <label className="choice">
            <input type="radio" name={field.id} checked={value === true}
              onChange={() => onChange(true)} /> Yes
          </label>
          <label className="choice">
            <input type="radio" name={field.id} checked={value === false}
              onChange={() => onChange(false)} /> No
          </label>
        </div>
      </div>
    );
  }

  const label = (
    <label>
      {numTag}{field.label}
      {field.vital && <span className="vital">vital</span>}
      {feeds && <span className="feeds-tag" title={`Autofills into the retainer: ${feeds}`}>feeds retainer: {feeds}</span>}
    </label>
  );

  // The verbatim script, when a field carries one alongside its input. The
  // console shows this above the answer; without it the agent loses the exact
  // approved wording and starts improvising, which is the compliance risk the
  // scripts exist to remove.
  const spoken = field.script ? (
    <div className="script" style={{ marginBottom: 8 }}>
      <span className="tag">Read verbatim</span>
      {field.script}
    </div>
  ) : null;

  // Stored value/label pairs win over display-only strings. Older forms that
  // carry only `options` keep working, storing the display string as before.
  const picks: { value: string; label: string; note?: string }[] =
    field.choices?.length
      ? field.choices
      : (field.options ?? []).map((o) => ({ value: o, label: o }));

  const body = (() => {
  switch (field.kind) {
    case "text":
    case "monthyear": {
      if (field.lookup === "city") {
        return (
          <div className="field">{label}{spoken}{note}
            <CityStateLookup
              value={String(value ?? "")}
              onChange={onChange}
              incidentDate={answers?.date ?? answers?.incident_date}
            />
          </div>
        );
      }
      if (field.lookup === "agency") {
        return (
          <div className="field">{label}{spoken}{note}
            <IncidentLocation
              value={String(value ?? "")}
              near={answers?.incident_city_state}
              onResolved={(r) => onChange(r.agency || r.formatted || "")}
            />
            <input type="text" style={{ marginTop: 10 }}
              placeholder="...or just type the department"
              value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
          </div>
        );
      }
      // A text field flagged multiline is a paragraph box: Enter adds a line.
      if (field.multiline) {
        return (
          <div className="field">{label}{spoken}{note}
            <textarea rows={6} value={value ?? ""} placeholder={field.placeholder}
              onChange={(e) => onChange(e.target.value)} />
          </div>
        );
      }
      return (
        <div className="field">{label}{spoken}{note}
          <input type="text" value={value ?? ""}
            placeholder={field.placeholder ?? (field.kind === "monthyear" ? "MM/YYYY" : "")}
            onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    }
    case "date":
      return (
        <div className="field">{label}{spoken}{note}
          <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    // A real address, not three loose text boxes the agent has to spell the same
    // way twice. Picking a match fills street, city, state and zip together, so
    // the parts cannot disagree with each other.
    case "address":
      return (
        <div className="field">{label}{spoken}{note}
          <AddressLookup
            value={String(value ?? "")}
            near={answers?.incident_city_state}
            onText={(a1) => onChange(a1)}
            onPick={(a) => {
              // Some addresses have sibling city/state/zip fields on the form
              // (mail_addr1 -> mail_city, mail_state, mail_zip). Others are a
              // single line with nowhere to put the parts. Deriving the sibling
              // names from the field id looked clever and produced things like
              // "ec_addresscity", so the pairs are stated instead of guessed.
              const SIBLINGS: Record<string, { city: string; state: string; zip: string }> = {
                mail_addr1: { city: "mail_city", state: "mail_state", zip: "mail_zip" },
              };
              const sib = SIBLINGS[field.id];
              if (sib && onSetField) {
                onChange(a.addr1);
                if (a.city) onSetField(sib.city, a.city);
                if (a.state) onSetField(sib.state, a.state);
                if (a.zip) onSetField(sib.zip, a.zip);
              } else {
                // Nowhere to split it, so keep the whole address in one field
                // rather than silently dropping the city and zip.
                onChange([a.addr1, a.city, a.state, a.zip].filter(Boolean).join(", "));
              }
            }}
          />
        </div>
      );
    // Masked. An SSN typed into a plain text box ends up in exports, logs and
    // screenshots in the clear, and it is the one field on the form where that
    // actually matters.
    case "ssn": {
      const digits = String(value ?? "").replace(/\D/g, "").slice(0, 9);
      const shown = digits.length > 5 ? `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}`
                  : digits.length > 3 ? `${digits.slice(0,3)}-${digits.slice(3)}`
                  : digits;
      return (
        <div className="field">{label}{spoken}{note}
          <input type="text" inputMode="numeric" autoComplete="off" placeholder="###-##-####"
            value={shown}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))} />
          {digits.length > 0 && digits.length < 9 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{9 - digits.length} digits to go</div>
          )}
        </div>
      );
    }
    case "time":
      return (
        <div className="field">{label}{spoken}{note}
          <input type="time" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "phone":
      return (
        <div className="field">{label}{spoken}{note}
          <input type="tel" value={value ?? ""} placeholder="(###) ###-####" onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "email":
      return (
        <div className="field">{label}{spoken}{note}
          <input type="email" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "longtext":
      return (
        <div className="field">{label}{spoken}{note}
          <textarea rows={6} value={value ?? ""} placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "int":
      return (
        <div className="field">{label}{spoken}{note}
          <input type="number" value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
        </div>
      );
    case "bool":
      return (
        <div className="field">{label}{spoken}{note}
          <div className="row">
            <label className="choice">
              <input type="radio" name={field.id} checked={value === true}
                onChange={() => onChange(true)} /> Yes
            </label>
            <label className="choice">
              <input type="radio" name={field.id} checked={value === false}
                onChange={() => onChange(false)} /> No
            </label>
          </div>
        </div>
      );
    case "select":
      return (
        <div className="field">{label}{spoken}{note}
          <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
            <option value="">Select</option>
            {picks.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {picks.filter((o) => o.note && o.value === value).map((o) => (
            <div className="agent-note" key={o.value}>
              <span className="tag">Agent:</span>{o.note}
            </div>
          ))}
        </div>
      );
    case "multiselect": {
      const arr: string[] = Array.isArray(value) ? value : [];
      const toggle = (v: string) =>
        onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return (
        <div className="field">{label}{spoken}{note}
          <div>
            {picks.map((o) => (
              <label className="choice" key={o.value}>
                <input type="checkbox" checked={arr.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}
                {o.note && arr.includes(o.value) && <span className="muted" style={{ marginLeft: 8 }}>{o.note}</span>}
              </label>
            ))}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
  })();
  if (feeds && body) return <div className="feeds-wrap">{body}</div>;
  return body;
}
