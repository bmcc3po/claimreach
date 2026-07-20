"use client";
import { useState, useEffect } from "react";
import { INTAKE, type Field } from "@/lib/questionnaire";
import FieldRenderer from "./FieldRenderer";
import PropertyLookup, { type ResolvedProperty } from "./PropertyLookup";

const LEAD_FIELDS = INTAKE.filter((f) => f.scope === "lead");
const PROP_FIELDS = INTAKE.filter((f) => f.scope === "property");

interface PropertyState {
  _key: string;
  resolved?: ResolvedProperty;
  values: Record<string, any>;
}

export default function IntakeForm({
  leadId,
  firmId,
  initialLead,
  initialProperties,
}: {
  leadId: string;
  firmId: string;
  initialLead: Record<string, any>;
  initialProperties: any[];
}) {
  const [lead, setLead] = useState<Record<string, any>>(initialLead || {});
  const [autofillFeeds, setAutofillFeeds] = useState<Record<string, string>>({});
  useEffect(() => {
    const cid = lead.campaign_id || initialLead?.campaign_id;
    if (!cid) return;
    (async () => {
      try { const d = await (await fetch(`/api/retainer-autofill-map?campaign_id=${cid}`)).json(); setAutofillFeeds(d.feeds ?? {}); } catch {}
    })();
  }, [lead.campaign_id]);
  const [props, setProps] = useState<PropertyState[]>(
    (initialProperties || []).map((p, i) => ({
      _key: `p${i}`,
      values: p,
      resolved: p.place_id
        ? { place_id: p.place_id, name: p.name_as_recalled, address: p.address, lat: p.lat, lng: p.lng }
        : undefined,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function setLeadVal(id: string, v: any) {
    setLead((s) => ({ ...s, [id]: v }));
  }

  function addProperty() {
    setProps((s) => [...s, { _key: `p${Date.now()}`, values: {} }]);
  }
  function removeProperty(key: string) {
    setProps((s) => s.filter((p) => p._key !== key));
  }
  function setPropVal(key: string, id: string, v: any) {
    setProps((s) => s.map((p) => (p._key === key ? { ...p, values: { ...p.values, [id]: v } } : p)));
  }
  function resolveProp(key: string, r: ResolvedProperty) {
    setProps((s) =>
      s.map((p) =>
        p._key === key
          ? {
              ...p,
              resolved: r,
              values: {
                ...p.values,
                place_id: r.place_id,
                name_as_recalled: r.name,
                address: r.address,
                lat: r.lat,
                lng: r.lng,
                current_brand: r.current_brand,
                remembered_brand: p.values.remembered_brand ?? "Motel 6",
                landmarks: r.landmarks ?? p.values.landmarks ?? "",
              },
            }
          : p
      )
    );
  }

  async function save() {
    setSaving(true); setErr(null);
    try {
      // Ensure each resolved property is linked to a canonical record.
      const properties = [];
      for (const p of props) {
        let canonical_id: string | undefined;
        if (p.resolved?.place_id) {
          const r = await fetch("/api/canonical", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              place_id: p.resolved.place_id,
              name: p.resolved.name,
              address: p.resolved.address,
              lat: p.resolved.lat,
              lng: p.resolved.lng,
              current_brand: p.resolved.current_brand,
              firm_id: firmId,
            }),
          });
          const d = await r.json();
          if (r.ok) canonical_id = d.id;
        }
        const { name, ...vals } = p.values; // drop synthetic
        properties.push({ ...cleanProp(vals), canonical_id, firm_id: firmId });
      }

      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "save",
          lead_id: leadId,
          lead: { ...cleanLead(lead), firm_id: firmId },
          properties,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "save failed");
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
    <div>
      {LEAD_FIELDS.map((f) => {
        if (f.id === "s_properties") {
          return (
            <div key={f.id}>
              <FieldRenderer field={f} value={null} onChange={() => {}} />
              {props.map((p, idx) => (
                <PropertyCard
                  key={p._key}
                  index={idx}
                  state={p}
                  onResolve={(r) => resolveProp(p._key, r)}
                  onChange={(id, v) => setPropVal(p._key, id, v)}
                  onRemove={() => removeProperty(p._key)}
                />
              ))}
              <button className="btn secondary" onClick={addProperty}>+ Add another property</button>
            </div>
          );
        }
        return (
          <FieldRenderer key={f.id} field={f}
            value={lead[f.id]} onChange={(v) => setLeadVal(f.id, v)} feeds={autofillFeeds[f.id]} />
        );
      })}

      <div className="card" style={{ position: "sticky", bottom: 0 }}>
        <div className="row">
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save intake"}
          </button>
          {savedAt && <span className="muted">Saved {savedAt}</span>}
          {err && <span style={{ color: "var(--danger)" }}>{err}</span>}
        </div>
      </div>
    </div>
  );
}

function PropertyCard({
  index, state, onResolve, onChange, onRemove,
}: {
  index: number;
  state: PropertyState;
  onResolve: (r: ResolvedProperty) => void;
  onChange: (id: string, v: any) => void;
  onRemove: () => void;
}) {
  return (
    <div className="card" style={{ borderLeft: "4px solid var(--brand)" }}>
      <div className="row">
        <strong>Property {index + 1}</strong>
        {state.resolved && <span className="badge stage">{state.resolved.name}</span>}
        {state.resolved && state.resolved.claimant_count! > 0 && (
          <span className="badge count">{state.resolved.claimant_count} prior claimant(s)</span>
        )}
        <div className="spacer" />
        <button className="btn ghost" onClick={onRemove}>Remove</button>
      </div>

      {!state.resolved && <PropertyLookup onResolved={onResolve} />}

      {state.resolved &&
        PROP_FIELDS.filter((f) => f.kind !== "property_lookup").map((f) => {
          // collapse remembered_brand (already captured in lookup) but keep editable
          return (
            <FieldRenderer key={f.id} field={f}
              value={state.values[f.id]} onChange={(v) => onChange(f.id, v)} />
          );
        })}
    </div>
  );
}

// Strip synthetic/section keys before persisting.
const SYNTH = new Set(INTAKE.filter((f) =>
  ["section", "script", "gate"].includes(f.kind)).map((f) => f.id));

function cleanLead(o: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(o)) if (!SYNTH.has(k) && !k.startsWith("g_") && !k.startsWith("s_") && !k.startsWith("script") && !k.startsWith("safe_to_speak")) out[k] = o[k];
  return out;
}
function cleanProp(o: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(o)) if (!SYNTH.has(k)) out[k] = o[k];
  return out;
}
