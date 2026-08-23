"use client";
import { fieldVisible, type Field } from "@/lib/questionnaire";

// Read-only twin of IntakeSurface. Same Field ids, no writes. Used on the
// fenced firm file so Case Questions is not a second questionnaire.

function displayValue(field: Field, raw: any): string {
  if (raw == null || raw === "") return "";
  if (field.id.includes("ssn") || field.kind === "ssn") {
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length >= 4) return `•••-••-${digits.slice(-4)}`;
    return "•••-••-••••";
  }
  if (Array.isArray(raw)) {
    return raw.map((v) => labelFor(field, v)).filter(Boolean).join(", ");
  }
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  const s = String(raw);
  if (field.kind === "bool") {
    const low = s.toLowerCase();
    if (low === "yes" || low === "true") return "Yes";
    if (low === "no" || low === "false") return "No";
  }
  return labelFor(field, s);
}

function labelFor(field: Field, value: any): string {
  const v = String(value ?? "");
  const hit = field.choices?.find((c) => c.value === v);
  if (hit) return hit.label;
  return v;
}

export default function IntakeReview({
  fields, answers, properties = [],
}: {
  fields: Field[];
  answers: Record<string, any>;
  properties?: any[];
}) {
  const visible = fields.filter((f) => fieldVisible(f, answers));
  if (!visible.length && !properties.length) {
    return <p className="muted">No intake answers on this file yet.</p>;
  }

  return (
    <div className="ro-wrap">
      {visible.map((f) => {
        if (f.kind === "section") {
          return <div key={f.id} className="ro-section">{f.label}</div>;
        }
        if (f.kind === "gate") {
          const val = displayValue(f, answers[f.id]);
          return (
            <div key={f.id} className="ro-field">
              <span className="ro-label">{f.label}</span>
              <span className={`ro-value ${!val ? "empty" : ""}`}>{val || "Not collected"}</span>
            </div>
          );
        }
        if (f.kind === "property_lookup") return null;
        const val = displayValue(f, answers[f.id]);
        return (
          <div key={f.id} className="ro-field">
            <span className="ro-label">{f.label}</span>
            <span className={`ro-value ${!val ? "empty" : ""}`}>{val || "Not collected"}</span>
          </div>
        );
      })}
      {properties.length > 0 && (
        <>
          <div className="ro-section">Properties</div>
          {properties.map((p, i) => {
            const name = p.name || p.property_name || p.canonical_name || `Property ${i + 1}`;
            const where = [p.street, p.city, p.state, p.zip].filter(Boolean).join(", ");
            return (
              <div key={p.id ?? i} className="ro-field">
                <span className="ro-label">{name}</span>
                <span className={`ro-value ${!where ? "empty" : ""}`}>{where || "Address not collected"}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
