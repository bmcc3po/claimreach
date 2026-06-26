"use client";
import { useState, useMemo } from "react";
import { INTAKE, getSegments } from "@/lib/questionnaire";
import FieldRenderer from "./FieldRenderer";
import PropertyLookup, { type ResolvedProperty } from "./PropertyLookup";
import CalendlyEmbed from "./CalendlyEmbed";

const PROP_FIELDS = INTAKE.filter((f) => f.scope === "property");

interface PropertyState { _key: string; resolved?: ResolvedProperty; values: Record<string, any>; }

export default function ClaimIntake({
  claimId, firmId, initialAnswers, initialProperties, claimantName, claimantEmail,
}: {
  claimId: string; firmId: string;
  initialAnswers: Record<string, any>; initialProperties: any[];
  claimantName?: string; claimantEmail?: string;
}) {
  const segments = useMemo(() => getSegments(), []);
  const steps = useMemo(
    () => [...segments.map((s) => ({ id: s.id, title: s.title })), { id: "schedule", title: "Schedule" }],
    [segments]
  );

  const [step, setStep] = useState(0);
  const [viewAll, setViewAll] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers || {});
  const [props, setProps] = useState<PropertyState[]>(
    (initialProperties || []).map((p, i) => ({
      _key: `p${i}`, values: p,
      resolved: p.place_id ? { place_id: p.place_id, name: p.name_as_recalled, address: p.address, lat: p.lat, lng: p.lng } : undefined,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isProps = (id: string) => id === "s_properties";
  const isSchedule = (id: string) => id === "schedule";
  const curStep = steps[step];
  const curSegment = segments.find((s) => s.id === curStep.id);

  function setVal(id: string, v: any) { setAnswers((s) => ({ ...s, [id]: v })); }
  function addProperty() { setProps((s) => [...s, { _key: `p${Date.now()}`, values: {} }]); }
  function removeProperty(k: string) { setProps((s) => s.filter((p) => p._key !== k)); }
  function setPropVal(k: string, id: string, v: any) {
    setProps((s) => s.map((p) => (p._key === k ? { ...p, values: { ...p.values, [id]: v } } : p)));
  }
  function resolveProp(k: string, r: ResolvedProperty) {
    setProps((s) => s.map((p) => p._key === k ? {
      ...p, resolved: r,
      values: { ...p.values, place_id: r.place_id, name_as_recalled: r.name, address: r.address,
        lat: r.lat, lng: r.lng, current_brand: r.current_brand,
        remembered_brand: p.values.remembered_brand ?? "Motel 6", landmarks: r.landmarks ?? p.values.landmarks ?? "" },
    } : p));
  }

  function segAnswered(segId: string): boolean {
    if (isProps(segId)) return props.length > 0;
    if (isSchedule(segId)) return false;
    const seg = segments.find((s) => s.id === segId);
    if (!seg) return false;
    return seg.fields.some((f) => {
      const v = answers[f.id];
      return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
    });
  }

  async function save(advance = false) {
    setSaving(true); setErr(null);
    try {
      const properties = [];
      for (const p of props) {
        let canonical_id: string | undefined;
        if (p.resolved?.place_id) {
          const r = await fetch("/api/canonical", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ place_id: p.resolved.place_id, name: p.resolved.name, address: p.resolved.address,
              lat: p.resolved.lat, lng: p.resolved.lng, current_brand: p.resolved.current_brand, firm_id: firmId }),
          });
          const d = await r.json();
          if (r.ok) canonical_id = d.id;
        }
        properties.push({ ...cleanProp(p.values), canonical_id });
      }
      const r = await fetch("/api/claim-intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_id: claimId, firm_id: firmId, answers: cleanAnswers(answers), properties }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "save failed");
      setSavedAt(new Date().toLocaleTimeString());
      if (advance && step < steps.length - 1) setStep(step + 1);
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
    <div className="intake-shell">
      <nav className="steprail">
        {steps.map((s, i) => (
          <button key={s.id}
            className={`${i === step ? "active" : ""} ${segAnswered(s.id) ? "done" : ""}`}
            onClick={() => setStep(i)}>
            <span className="stepnum">{segAnswered(s.id) ? "✓" : i + 1}</span>
            {cleanTitle(s.title)}
          </button>
        ))}
      </nav>

      <div>
        <div className="seg-head">
          <h2>{viewAll ? "Full intake" : cleanTitle(curStep.title)}</h2>
          {!viewAll && <span className="seg-count">Step {step + 1} of {steps.length}</span>}
          <div className="spacer" />
          <button className="btn ghost" onClick={() => setViewAll(!viewAll)}>
            {viewAll ? "Stepped view" : "View entire intake"}
          </button>
        </div>

        {viewAll ? (
          <div>
            {segments.map((seg) => (
              <div key={seg.id} style={{ marginBottom: 28 }}>
                <div className="section-title">{cleanTitle(seg.title)}</div>
                {seg.id === "s_properties" ? (
                  <>
                    {props.map((p, idx) => (
                      <PropertyCard key={p._key} index={idx} state={p}
                        onResolve={(r) => resolveProp(p._key, r)}
                        onChange={(id, v) => setPropVal(p._key, id, v)}
                        onRemove={() => removeProperty(p._key)} />
                    ))}
                    <button className="btn secondary" onClick={addProperty}>+ Add another property</button>
                  </>
                ) : (
                  seg.fields.map((f) => {
                    if (f.kind === "script" || f.kind === "gate") {
                      return <FieldRenderer key={f.id} field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} />;
                    }
                    const ans = answers[f.id] !== undefined && answers[f.id] !== null && answers[f.id] !== "";
                    return (
                      <div key={f.id} className={`qcard ${ans ? "answered" : ""} ${f.vital ? "vital-q" : ""}`}>
                        <FieldRenderer field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} />
                      </div>
                    );
                  })
                )}
              </div>
            ))}
            <div className="section-title">Schedule</div>
            <CalendlyEmbed name={claimantName} email={claimantEmail} />
            <div className="seg-nav">
              <div className="spacer" />
              {savedAt && <span className="muted">Saved {savedAt}</span>}
              {err && <span style={{ color: "var(--danger)" }}>{err}</span>}
              <button className="btn" disabled={saving} onClick={() => save(false)}>{saving ? "Saving…" : "Save claim"}</button>
            </div>
          </div>
        ) : isSchedule(curStep.id) ? (
          <>
            <p className="seg-sub">Book the case manager call with the claimant before you wrap up.</p>
            <CalendlyEmbed name={claimantName} email={claimantEmail} />
          </>
        ) : isProps(curStep.id) ? (
          <>
            <p className="seg-sub">Add one property per hotel/motel the claimant can identify.</p>
            {props.map((p, idx) => (
              <PropertyCard key={p._key} index={idx} state={p}
                onResolve={(r) => resolveProp(p._key, r)}
                onChange={(id, v) => setPropVal(p._key, id, v)}
                onRemove={() => removeProperty(p._key)} />
            ))}
            <button className="btn secondary" onClick={addProperty}>+ Add another property</button>
          </>
        ) : (
          <>
            {curSegment?.fields.map((f) => {
              if (f.kind === "script" || f.kind === "gate") {
                return <FieldRenderer key={f.id} field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} />;
              }
              const answered = answers[f.id] !== undefined && answers[f.id] !== null && answers[f.id] !== "";
              return (
                <div key={f.id} className={`qcard ${answered ? "answered" : ""} ${f.vital ? "vital-q" : ""}`}>
                  <FieldRenderer field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} />
                </div>
              );
            })}
          </>
        )}

        {!viewAll && (
        <div className="seg-nav">
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
          <div className="spacer" />
          {savedAt && <span className="muted">Saved {savedAt}</span>}
          {err && <span style={{ color: "var(--danger)" }}>{err}</span>}
          <button className="btn ghost" disabled={saving} onClick={() => save(false)}>{saving ? "Saving…" : "Save"}</button>
          {step < steps.length - 1
            ? <button className="btn" disabled={saving} onClick={() => save(true)}>Save &amp; next →</button>
            : <button className="btn" disabled={saving} onClick={() => save(false)}>Finish</button>}
        </div>
        )}
      </div>
    </div>
  );
}

function PropertyCard({ index, state, onResolve, onChange, onRemove }: {
  index: number; state: PropertyState;
  onResolve: (r: ResolvedProperty) => void;
  onChange: (id: string, v: any) => void; onRemove: () => void;
}) {
  return (
    <div className="card" style={{ borderLeft: "4px solid var(--accent)" }}>
      <div className="row">
        <strong>Property {index + 1}</strong>
        {state.resolved && <span className="badge stage">{state.resolved.name}</span>}
        <div className="spacer" />
        <button className="btn ghost" onClick={onRemove}>Remove</button>
      </div>
      {!state.resolved && <PropertyLookup onResolved={onResolve} />}
      {state.resolved && PROP_FIELDS.filter((f) => f.kind !== "property_lookup").map((f) => (
        <FieldRenderer key={f.id} field={f} value={state.values[f.id]} onChange={(v) => onChange(f.id, v)} />
      ))}
    </div>
  );
}

function cleanTitle(t: string) { return t.replace(/\s*\(.*?\)\s*/g, "").trim(); }

const SYNTH = new Set(INTAKE.filter((f) => ["section", "script", "gate"].includes(f.kind)).map((f) => f.id));
function cleanAnswers(o: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(o)) if (!SYNTH.has(k)) out[k] = o[k];
  return out;
}
function cleanProp(o: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(o)) if (!SYNTH.has(k) && k !== "name") out[k] = o[k];
  return out;
}
