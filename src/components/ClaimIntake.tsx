"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { INTAKE, intakeForType, segmentsForType, segmentsFrom, fieldVisible } from "@/lib/questionnaire";
import FieldRenderer from "./FieldRenderer";
import PropertyLookup, { type ResolvedProperty } from "./PropertyLookup";
import CalendlyEmbed from "./CalendlyEmbed";

const PROP_FIELDS = INTAKE.filter((f) => f.scope === "property");

interface PropertyState { _key: string; resolved?: ResolvedProperty; values: Record<string, any>; }

export default function ClaimIntake({
  claimId, firmId, initialAnswers, initialProperties, claimantName, claimantEmail, claimType, leadId, customFields,
}: {
  claimId: string; firmId: string;
  initialAnswers: Record<string, any>; initialProperties: any[];
  claimantName?: string; claimantEmail?: string; claimType?: string; leadId?: string;
  customFields?: import("@/lib/questionnaire").Field[];
}) {
  const segments = useMemo(
    () => customFields && customFields.length ? segmentsFrom(customFields) : segmentsForType(claimType ?? "motel_trafficking"),
    [claimType, customFields]
  );
  const steps = useMemo(
    () => [...segments.map((s) => ({ id: s.id, title: s.title })), { id: "schedule", title: "Schedule" }],
    [segments]
  );

  const [step, setStep] = useState(0);
  const [viewAll, setViewAll] = useState(false);
  const [locked, setLocked] = useState(true);
  const [scheduled, setScheduled] = useState(false);
  const [finishing, setFinishing] = useState(false);
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
  // Global question numbers — every answerable question across the whole intake gets
  // a sequential number so agents can say "read question 5 verbatim".
  const qNum = useMemo(() => {
    const map: Record<string, number> = {};
    let n = 0;
    for (const seg of segments) for (const f of seg.fields) {
      if (!["section", "script", "gate"].includes(f.kind)) { n += 1; map[f.id] = n; }
    }
    return map;
  }, [segments]);
  const curStep = steps[step];
  const curSegment = segments.find((s) => s.id === curStep.id);

  function setVal(id: string, v: any) { setAnswers((s) => ({ ...s, [id]: v })); }

  // Autosave: when unlocked, persist a moment after the last change. No manual
  // Save needed — the pencil unlocks, edits flow, autosave handles the rest.
  const firstRun = useRef(true);
  const saveTimer = useRef<any>(null);
  useEffect(() => {
    if (locked) return;                 // locked = read-only, never autosave
    if (firstRun.current) { firstRun.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { save(false); }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, props, locked]);
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

  function isFilled(v: any) {
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  }

  function segAnswered(segId: string): boolean {
    if (isProps(segId)) return props.length > 0;
    if (isSchedule(segId)) return scheduled;
    const seg = segments.find((s) => s.id === segId);
    if (!seg) return false;
    // Only count real input fields (skip scripts/gates/sections).
    const inputs = seg.fields.filter((f) => !["script", "section", "gate"].includes(f.kind));
    // A section with no inputs (e.g. Closing = statement only) is complete by default.
    if (inputs.length === 0) return true;
    // Complete only when every input field is filled.
    return inputs.every((f) => isFilled(answers[f.id]));
  }

  async function finishWithStatus(status: string) {
    setSaving(true);
    await save(false);
    await fetch("/api/claims", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "status", claim_id: claimId, status }),
    }).catch(() => {});
    setSaving(false);
    setFinishing(false);
    if (typeof window !== "undefined" && leadId) window.location.href = `/leads/${leadId}`;
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
        body: JSON.stringify({ claim_id: claimId, firm_id: firmId, answers: cleanAnswers(answers, claimType), properties }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "save failed");
      setSavedAt(new Date().toLocaleTimeString());
      if (advance && step < steps.length - 1) setStep(step + 1);
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  }

  return (
    <div className={`intake-shell ${locked ? "intake-locked" : ""}`}>
      <div className="intake-lockbar">
        {locked ? (
          <><span className="lock-note">🔒 Read-only. Click edit to make changes.</span><button className="btn gold sm" onClick={() => setLocked(false)}>✏️ Edit answers</button></>
        ) : (
          <><span className="lock-note editing">✏️ Editing, changes save automatically{savedAt ? ` · saved ${savedAt}` : ""}{saving ? " · saving…" : ""}</span><button className="btn ghost sm" onClick={() => setLocked(true)}>🔒 Done</button></>
        )}
      </div>
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
                    if (!fieldVisible(f, answers)) return null;
                    if (f.kind === "script" || f.kind === "gate") {
                      return <FieldRenderer key={f.id} field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} />;
                    }
                    const ans = answers[f.id] !== undefined && answers[f.id] !== null && answers[f.id] !== "";
                    return (
                      <div key={f.id} className={`qcard ${ans ? "answered" : ""} ${f.vital ? "vital-q" : ""}`}>
                        {qNum[f.id] && <span className="qnum">Q{qNum[f.id]}</span>}
                        <FieldRenderer field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} onSetField={(id, v) => setVal(id, v)} />
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
            <div style={{ marginTop: 14 }}>
              <label className="perm">
                <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />
                {" "}Call has been scheduled (or callback arranged)
              </label>
            </div>
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
            {(() => {
              const fields = curSegment?.fields ?? [];
              const SHORT = new Set(["text", "phone", "email", "date", "int", "select"]);
              const out: React.ReactNode[] = [];
              let bucket: typeof fields = [];
              const flush = (key: string) => {
                if (!bucket.length) return;
                out.push(
                  <div className="grid2" key={`g-${key}`}>
                    {bucket.map((f) => {
                      if (!fieldVisible(f, answers)) return null;
                      const answered = answers[f.id] !== undefined && answers[f.id] !== null && answers[f.id] !== "";
                      return (
                        <div key={f.id} className={`qcard ${answered ? "answered" : ""} ${f.vital ? "vital-q" : ""}`}>
                          {qNum[f.id] && <span className="qnum">Q{qNum[f.id]}</span>}
                          <FieldRenderer field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} onSetField={(id, v) => setVal(id, v)} />
                        </div>
                      );
                    })}
                  </div>
                );
                bucket = [];
              };
              fields.forEach((f, i) => {
                if (f.kind === "script" || f.kind === "gate") {
                  flush(`b${i}`);
                  out.push(<FieldRenderer key={f.id} field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} />);
                } else if (SHORT.has(f.kind)) {
                  bucket.push(f);
                } else {
                  flush(`b${i}`);
                  const answered = answers[f.id] !== undefined && answers[f.id] !== null && answers[f.id] !== "";
                  out.push(
                    <div key={f.id} className={`qcard ${answered ? "answered" : ""} ${f.vital ? "vital-q" : ""}`}>
                      <FieldRenderer field={f} value={answers[f.id]} onChange={(v) => setVal(f.id, v)} onSetField={(id, v) => setVal(id, v)} />
                    </div>
                  );
                }
              });
              flush("end");
              return out;
            })()}
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
            : <button className="btn" disabled={saving} onClick={() => setFinishing(true)}>Finish &amp; set status</button>}
        </div>
        )}
      </div>

      {finishing && (
        <div className="modal-back" onClick={() => setFinishing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Set claim status</h3><button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setFinishing(false)}>Cancel</button></div>
            <div className="modal-b">
              <p className="muted" style={{ marginTop: 0 }}>Choose the disposition for this intake.</p>
              <div style={{ display: "grid", gap: 8 }}>
                <button className="btn" disabled={saving} onClick={() => finishWithStatus("qualified")}>✅ Qualified — submit to firm</button>
                <button className="btn secondary" disabled={saving} onClick={() => finishWithStatus("in_progress")}>⏳ Incomplete — callback scheduled</button>
                <button className="btn ghost" disabled={saving} onClick={() => finishWithStatus("dq")}>⛔ Disqualified</button>
              </div>
            </div>
          </div>
        </div>
      )}
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

function synthSet(claimType?: string) {
  return new Set(intakeForType(claimType ?? "motel_trafficking").filter((f) => ["section","script","gate"].includes(f.kind)).map((f) => f.id));
}
function cleanAnswers(o: Record<string, any>, claimType?: string) {
  const SYNTH = synthSet(claimType);
  const out: Record<string, any> = {};
  for (const k of Object.keys(o)) if (!SYNTH.has(k)) out[k] = o[k];
  return out;
}
function cleanProp(o: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(o)) if (k !== "name") out[k] = o[k];
  return out;
}
