"use client";
import { useEffect, useState } from "react";
import {
  factsFormFromLead, propertyLine, type LorFactsForm,
} from "@/lib/m6-lor";

export type LorFactsShow = { dates?: boolean; gender?: boolean; property?: boolean };

function anyShown(show: LorFactsShow) {
  return !!(show.dates || show.gender || show.property);
}

export function lorFactsShowFromMissing(missing: string[] | undefined): LorFactsShow {
  const m = missing ?? [];
  return {
    dates: m.some((x) => x.includes("incident dates")),
    gender: m.some((x) => x.includes("gender")),
    property: m.some((x) => x === "property"),
  };
}

export function lorFactsShowFromLead(lead: any): LorFactsShow {
  const form = factsFormFromLead(lead);
  return {
    dates: true,
    gender: !form.gender,
    property: !propertyLine({
      propertyName: form.property_name,
      propertyStreet: form.property_street,
      propertyCity: form.property_city,
      propertyState: form.property_state,
      propertyZip: form.property_zip,
    }),
  };
}

export default function LorFacts({
  leadId, facts, show, hint, saveLabel, onSaved,
}: {
  leadId: string;
  facts: Partial<LorFactsForm> | null | undefined;
  show: LorFactsShow;
  hint?: string;
  saveLabel?: string;
  onSaved?: (preview: any) => void;
}) {
  const [form, setForm] = useState<LorFactsForm>(() => ({
    ...factsFormFromLead(null),
    ...facts,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setForm({ ...factsFormFromLead(null), ...facts });
  }, [facts?.gender, facts?.incident_start, facts?.incident_end, facts?.property_name, facts?.property_street, facts?.property_city, facts?.property_state, facts?.property_zip]);

  if (!anyShown(show)) return null;

  function set(key: keyof LorFactsForm, value: string) {
    setForm((s) => ({ ...s, [key]: value }));
    setErr("");
  }

  async function save() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/m6/lor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, facts: form }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { setErr(d.error || "That did not save. Try again."); return; }
      onSaved?.(d);
    } catch {
      setErr("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m6-lor-facts">
      {hint && <p className="m6-hint">{hint}</p>}
      {err && <p className="m6-error">{err}</p>}
      {show.dates && (
        <div className="m6-lor-grid">
          <label className="m6-field">
            <span>Stay start</span>
            <input type="date" value={form.incident_start} onChange={(e) => set("incident_start", e.target.value)} />
          </label>
          <label className="m6-field">
            <span>Stay end</span>
            <input type="date" value={form.incident_end} onChange={(e) => set("incident_end", e.target.value)} />
          </label>
          {show.gender && (
            <label className="m6-field">
              <span>Gender</span>
              <select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Not set</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          )}
        </div>
      )}
      {!show.dates && show.gender && (
        <label className="m6-field">
          <span>Gender</span>
          <select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">Not set</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      )}
      {show.property && (
        <>
          <label className="m6-field">
            <span>Property name</span>
            <input value={form.property_name} onChange={(e) => set("property_name", e.target.value)} placeholder="Motel 6" />
          </label>
          <label className="m6-field">
            <span>Street</span>
            <input value={form.property_street} onChange={(e) => set("property_street", e.target.value)} />
          </label>
          <div className="m6-lor-grid">
            <label className="m6-field">
              <span>City</span>
              <input value={form.property_city} onChange={(e) => set("property_city", e.target.value)} />
            </label>
            <label className="m6-field">
              <span>State</span>
              <input value={form.property_state} onChange={(e) => set("property_state", e.target.value.toUpperCase())} maxLength={2} placeholder="NV" />
            </label>
            <label className="m6-field">
              <span>ZIP</span>
              <input value={form.property_zip} onChange={(e) => set("property_zip", e.target.value)} inputMode="numeric" />
            </label>
          </div>
        </>
      )}
      <button type="button" className="m6-btn" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving" : (saveLabel || "Update letter")}
      </button>
    </div>
  );
}
