"use client";
import type { Field } from "@/lib/questionnaire";

export default function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  if (field.kind === "section") {
    return <div className="section-title">{field.label}</div>;
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
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{field.label}</div>
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
      {field.label}
      {field.vital && <span className="vital">vital</span>}
    </label>
  );

  switch (field.kind) {
    case "text":
    case "monthyear":
      return (
        <div className="field">{label}{note}
          <input type="text" value={value ?? ""}
            placeholder={field.kind === "monthyear" ? "MM/YYYY" : ""}
            onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "date":
      return (
        <div className="field">{label}{note}
          <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "phone":
      return (
        <div className="field">{label}{note}
          <input type="tel" value={value ?? ""} placeholder="(###) ###-####" onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "email":
      return (
        <div className="field">{label}{note}
          <input type="email" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "longtext":
      return (
        <div className="field">{label}{note}
          <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "int":
      return (
        <div className="field">{label}{note}
          <input type="number" value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
        </div>
      );
    case "bool":
      return (
        <div className="field">{label}{note}
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
        <div className="field">{label}{note}
          <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    case "multiselect": {
      const arr: string[] = Array.isArray(value) ? value : [];
      const toggle = (o: string) =>
        onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
      return (
        <div className="field">{label}{note}
          <div>
            {field.options?.map((o) => (
              <label className="choice" key={o}>
                <input type="checkbox" checked={arr.includes(o)} onChange={() => toggle(o)} /> {o}
              </label>
            ))}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
