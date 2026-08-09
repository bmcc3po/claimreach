"use client";
import { useMemo, useRef, useState } from "react";
import { fieldVisible, segmentsForType, segmentsFrom, INTAKE, type Field } from "@/lib/questionnaire";
import PropertyLookup from "@/components/PropertyLookup";
import Typeahead from "@/components/Typeahead";
import { dbRowToFormValues, dbRowToResolved } from "@/lib/claim-properties";
import { buildPropertyPhase, nextTierOnG6More, ABBREV_PROPERTY_IDS, type PropTier } from "@/lib/motel-properties";

// ============================================================================
// GUIDED INTAKE
//
// One question on the screen at a time, bold, in the agent's face, telling them
// exactly what to do next. Ported from the TMT console prototype so every case
// type runs the same surface instead of a section list the agent can wander
// around in. The compliance rule is "ask every question in order and verbatim";
// a sidebar full of jump links is an invitation to do the opposite.
//
// Three step shapes:
//   single    one question, one screen (all criteria questions)
//   group     fields sharing a `group` render together (address, insurance)
//   property  the hotel/property loop: manage the list, then walk each one
// ============================================================================

type PropRow = { values: Record<string, any>; resolved?: any };

type Step =
  | { kind: "single"; field: Field; section: string }
  | { kind: "group"; name: string; fields: Field[]; section: string }
  | { kind: "propmanage"; section: string }
  | { kind: "propfield"; field: Field; index: number; section: string }
  // Motel property spine (gated loop): choose a property, then question it.
  | { kind: "propchooser"; index: number; tier: PropTier; section: string }
  | { kind: "propgate"; gateId: "g6_more" | "g6_more_name" | "nong6_more"; label: string; section: string };

export default function GuidedIntake({
  claimId, firmId, leadId, claimType, customFields,
  initialAnswers = {}, initialProperties = [], claimantName, onExit,
}: {
  claimId: string; firmId: string; leadId?: string; claimType?: string;
  customFields?: Field[] | null;
  initialAnswers?: Record<string, any>;
  initialProperties?: PropRow[];
  claimantName?: string;
  onExit?: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers);
  // Hydrate flat claim_properties rows from the DB into the {values, resolved}
  // shape this runner uses. Without this, reopening a file in guided mode showed
  // blank property fields and a save wrote them back empty (row.values was
  // undefined). ClaimIntake already adapts the same rows; now both agree.
  const [props, setProps] = useState<PropRow[]>(
    (initialProperties ?? []).map((p: any) =>
      p && typeof p === "object" && p.values && !p.claim_id
        ? p // already in runner shape (defensive)
        : { values: dbRowToFormValues(p), resolved: dbRowToResolved(p) }
    )
  );
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const segments = useMemo(() => {
    const base = customFields && customFields.length ? segmentsFrom(customFields) : segmentsForType(claimType ?? "mva");
    const hasProps = base.some((sg: any) => (sg.fields as Field[]).some((f) => f.scope === "property" || f.kind === "property_lookup"));
    if (hasProps) return base;

    // The stored form has no property questions. If the built-in definition for
    // this case type does, splice that section in rather than silently skipping
    // the whole property loop, which is the entire point of a Motel 6 intake.
    const builtIn = segmentsForType(claimType ?? "mva");
    const propSegs = builtIn.filter((sg: any) =>
      (sg.fields as Field[]).some((f) => f.scope === "property" || f.kind === "property_lookup"));
    if (!propSegs.length) return base;

    const out = [...base];
    const at = Math.min(out.length, Math.max(1, out.findIndex((sg: any) => /control|coercion/i.test(sg.title || ""))));
    out.splice(at < 1 ? out.length : at, 0, ...propSegs);
    return out;
  }, [customFields, claimType]);
  const allFields: Field[] = useMemo(() => segments.flatMap((s: any) => s.fields as Field[]), [segments]);

  // A motel/trafficking file runs the gated PROPERTY SPINE. Detect it by the case
  // type OR by the presence of the identify gate / property fields, so even a
  // flattened custom form still gets the spine instead of silently skipping it.
  const isMotel = useMemo(() => {
    const t = (claimType ?? "").toLowerCase();
    if (/motel|traffick|hotel/.test(t)) return true;
    return allFields.some((f) => f.id === "g_can_identify" || f.id === "property_lookup" || f.id === "s_properties");
  }, [claimType, allFields]);

  // The FULL property battery: the form's property fields if it carries them, else
  // the built-in motel set (so a flattened form still asks the whole thing).
  const propFields: Field[] = useMemo(() => {
    const fromForm = allFields.filter((f) => f.scope === "property" && f.kind !== "property_lookup");
    if (fromForm.length) return fromForm;
    return (INTAKE as Field[]).filter((f) => f.scope === "property" && f.kind !== "property_lookup");
  }, [allFields]);
  const propFieldById = useMemo(() => {
    const m: Record<string, Field> = {};
    for (const f of propFields) m[f.id] = f;
    return m;
  }, [propFields]);

  const truthyYes = (v: any) => v === true || v === "yes" || v === "Yes";
  const propLabel = (row: number, tier: PropTier) => {
    const name = props[row]?.resolved?.name || props[row]?.values?.name_as_recalled;
    const base = name || `Property ${row + 1}`;
    return tier === "nong6" ? `${base} · non-Motel-6` : String(base);
  };

  // Rebuilt after every answer so conditional questions appear and vanish live.
  const steps: Step[] = useMemo(() => {
    const out: Step[] = [];
    let section = "";
    const seenGroups = new Set<string>();

    // ---- MOTEL: gated property spine injected right after the identify gate ----
    if (isMotel) {
      const tiers: PropTier[] = props.map((p) => (p.values?.tier as PropTier) || "g6");
      const phase = truthyYes(answers["g_can_identify"])
        ? buildPropertyPhase(tiers, propFields.map((f) => f.id), ABBREV_PROPERTY_IDS,
            { g6_done: !!answers.__p_g6_done, nong6_done: !!answers.__p_nong6_done })
        : [];
      const phaseSteps: Step[] = [];
      for (const it of phase) {
        if (it.t === "chooser") phaseSteps.push({ kind: "propchooser", index: it.row, tier: it.tier, section: propLabel(it.row, it.tier) });
        else if (it.t === "field") { const fld = propFieldById[it.fieldId]; if (fld) phaseSteps.push({ kind: "propfield", field: fld, index: it.row, section: propLabel(it.row, tiers[it.row] || "g6") }); }
        else phaseSteps.push({ kind: "propgate", gateId: it.id, label: it.label, section: "Properties" });
      }

      for (const seg of segments as any[]) {
        section = seg.title || section;
        for (const f of seg.fields as Field[]) {
          if (f.kind === "section") continue;
          if (f.scope === "property" || f.kind === "property_lookup") continue; // handled by the phase
          if (f.kind === "script") { out.push({ kind: "single", field: f, section }); }
          else if (!fieldVisible(f as any, answers)) { /* hidden */ }
          else if (f.group) {
            if (!seenGroups.has(f.group)) {
              seenGroups.add(f.group);
              const members = (allFields as Field[]).filter((x) => x.group === f.group && fieldVisible(x as any, answers));
              out.push({ kind: "group", name: f.group, fields: members, section });
            }
          } else { out.push({ kind: "single", field: f, section }); }
          // The whole property spine fires immediately after "can you identify…".
          if (f.id === "g_can_identify" && phaseSteps.length) out.push(...phaseSteps);
        }
      }
      return out;
    }

    // ---- non-motel: the generic add-all-then-walk property manager ----
    let propEmitted = false;
    for (const seg of segments as any[]) {
      section = seg.title || section;
      for (const f of seg.fields as Field[]) {
        if (f.kind === "section") continue;
        const isProp = f.scope === "property" || f.kind === "property_lookup";
        if (isProp) {
          if (!propEmitted) { out.push({ kind: "propmanage", section }); propEmitted = true; }
          if (f.kind === "property_lookup") continue;   // handled inside the manager
          for (let i = 0; i < props.length; i++) out.push({ kind: "propfield", field: f, index: i, section });
          continue;
        }
        if (f.kind === "script") { out.push({ kind: "single", field: f, section }); continue; }
        if (!fieldVisible(f as any, answers)) continue;
        if (f.group) {
          if (seenGroups.has(f.group)) continue;
          seenGroups.add(f.group);
          const members = (allFields as Field[]).filter((x) => x.group === f.group && fieldVisible(x as any, answers));
          out.push({ kind: "group", name: f.group, fields: members, section });
          continue;
        }
        out.push({ kind: "single", field: f, section });
      }
    }
    return out;
  }, [segments, allFields, answers, props, isMotel, propFields, propFieldById]);

  const total = steps.length;
  const step = steps[Math.min(idx, Math.max(0, total - 1))];

  const remaining = useMemo(() => {
    const blank = (v: any) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    let n = 0;
    for (const s of steps) {
      if (s.kind === "single" && s.field.kind !== "script" && blank(answers[s.field.id])) n++;
      // Count each field in a capture block, not the block, so this number means
      // the same thing as the one on the review screen.
      if (s.kind === "group") n += s.fields.filter((f) => blank(answers[f.id])).length;
      if (s.kind === "propfield" && blank(props[s.index]?.values?.[s.field.id])) n++;
      if (s.kind === "propchooser" && !props[s.index]?.resolved && blank(props[s.index]?.values?.name_as_recalled)) n++;
      if (s.kind === "propgate") n++;
    }
    return n;
  }, [steps, answers, props]);

  const saveTimer = useRef<any>(null);
  function persist(nextAnswers = answers, nextProps = props) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void doSave(nextAnswers, nextProps, false); }, 800);
  }

  async function doSave(a = answers, p = props, loud = true) {
    if (loud) setSaving(true);
    setErr(null);
    try {
      const properties: any[] = [];
      for (const row of p) {
        let canonical_id: string | undefined;
        if (row.resolved?.place_id) {
          try {
            const r = await fetch("/api/canonical", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ place_id: row.resolved.place_id, name: row.resolved.name, address: row.resolved.address,
                lat: row.resolved.lat, lng: row.resolved.lng, current_brand: row.resolved.current_brand, firm_id: firmId }),
            });
            const t = await r.text(); const d = t ? JSON.parse(t) : {};
            if (r.ok) canonical_id = d.id;
          } catch { /* best effort: never block the save on the canonical lookup */ }
        }
        properties.push({ ...row.values, canonical_id: canonical_id ?? row.values?.canonical_id });
      }
      const r = await fetch("/api/claim-intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_id: claimId, firm_id: firmId, answers: a, properties }),
      });
      const t = await r.text(); const d = t ? JSON.parse(t) : {};
      if (!r.ok) throw new Error(d.error || "save failed");
    } catch (e: any) { setErr(e?.message || "save failed"); }
    if (loud) setSaving(false);
  }

  function setAnswer(id: string, v: any) {
    const next = { ...answers, [id]: v };
    // Confirming they can identify a hotel opens the first Motel 6 property slot,
    // so the property spine begins the moment they say yes.
    if (id === "g_can_identify" && truthyYes(v) && props.length === 0) {
      const np: PropRow[] = [{ values: { tier: "g6" } }];
      setProps(np); setAnswers(next); persist(next, np); return;
    }
    setAnswers(next); persist(next, props);
  }
  function setPropVal(i: number, id: string, v: any) {
    const next = props.map((p, n) => (n === i ? { ...p, values: { ...p.values, [id]: v } } : p));
    setProps(next); persist(answers, next);
  }
  // The between-property gates. "Yes" adds the next property (full G6 until the
  // cap of 4, then name-only; abbreviated for non-G6). "No" closes that phase.
  // Neither advances the index: the recomputed step at this position becomes the
  // next chooser (yes) or the next decision/field (no).
  function answerGate(gateId: "g6_more" | "g6_more_name" | "nong6_more", yes: boolean) {
    if (gateId === "nong6_more") {
      if (yes) { const n: PropRow[] = [...props, { values: { tier: "nong6" } }]; setProps(n); persist(answers, n); }
      else { const a = { ...answers, __p_nong6_done: true }; setAnswers(a); persist(a, props); }
    } else {
      if (yes) {
        const tier = nextTierOnG6More(props.map((p) => (p.values?.tier as PropTier) || "g6"));
        const n: PropRow[] = [...props, { values: { tier } }]; setProps(n); persist(answers, n);
      } else { const a = { ...answers, __p_g6_done: true }; setAnswers(a); persist(a, props); }
    }
    setDraft(null);
  }

  function advance() {
    setDraft(null);
    if (idx + 1 >= total) { void doSave(); setFinished(true); return; }
    setIdx(idx + 1);
  }
  function back() { setDraft(null); setIdx(Math.max(0, idx - 1)); }

  if (finished) {
    return (
      <div className="gx"><style>{CSS}</style>
        <div className="gx-card">
          <div className="gx-crumb">Done</div>
          <div className="gx-q">Intake complete</div>
          <p className="gx-note">Every answer is saved to the file{claimantName ? ` for ${claimantName}` : ""}.</p>
          <div className="gx-row">
            <button className="gx-btn" onClick={() => { setFinished(false); setIdx(0); }}>Review from the top</button>
            {onExit && <button className="gx-btn p" onClick={onExit}>Back to the file</button>}
          </div>
        </div>
      </div>
    );
  }

  if (!step) {
    return <div className="gx"><style>{CSS}</style><div className="gx-card"><p className="gx-note">This form has no questions yet.</p></div></div>;
  }

  return (
    <div className="gx">
      <style>{CSS}</style>

      <div className="gx-prog"><div className="gx-fill" style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>
      <div className="gx-meta">
        <span>{step.section}</span>
        <span>{remaining > 0 ? `${remaining} question${remaining === 1 ? "" : "s"} left` : "All answered"}</span>
      </div>

      {err && <div className="gx-err">{err}</div>}

      <div className="gx-card">
        {step.kind === "single" && (
          <QuestionCard
            field={step.field}
            value={answers[step.field.id]}
            draft={draft} setDraft={setDraft}
            onAnswer={(v: any) => { setAnswer(step.field.id, v); setTimeout(advance, 0); }}
            onSkipScript={advance}
          />
        )}

        {step.kind === "group" && (
          <>
            <div className="gx-crumb">{step.section}</div>
            <div className="gx-q">{step.name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</div>
            <div className="gx-note">Capture these together, then keep moving.</div>
            <div className="gx-grid">
              {step.fields.map((f) => (
                <label key={f.id} className="gx-gf">
                  <span>{f.label}{f.vital && <em>vital</em>}</span>
                  {f.ref
                    ? <Typeahead source={f.ref} value={answers[f.id] ?? ""} onChange={(v: string) => setAnswer(f.id, v)} />
                    : <input className="gx-in" value={answers[f.id] ?? ""} onChange={(e) => setAnswer(f.id, e.target.value)} />}
                </label>
              ))}
            </div>
            <div className="gx-row"><button className="gx-btn p wide" onClick={advance}>Next</button></div>
          </>
        )}

        {step.kind === "propmanage" && (
          <>
            <div className="gx-crumb">{step.section}</div>
            <div className="gx-q">Which properties are we talking about?</div>
            <div className="gx-say"><div className="gx-cap">Say</div><div className="gx-txt">"Let's go through each place one at a time. What was the first one?"</div></div>
            <div className="gx-note">Search and pick the real property. The right one now saves the firm from naming the wrong defendant later.</div>

            {props.map((p, i) => (
              <div key={i} className="gx-prop">
                <div className="gx-prop-h">
                  <b>{p.resolved?.name || p.values?.name_as_recalled || `Property ${i + 1}`}</b>
                  <button className="gx-x" onClick={() => { const n = props.filter((_, x) => x !== i); setProps(n); persist(answers, n); }}>Remove</button>
                </div>
                {p.resolved?.address && <div className="gx-prop-a">{p.resolved.address}</div>}
                <input className="gx-in" placeholder="How the caller described it"
                  value={p.values?.name_as_recalled ?? ""}
                  onChange={(e) => setPropVal(i, "name_as_recalled", e.target.value)} />
              </div>
            ))}

            <div className="gx-lookup">
              <PropertyLookup onResolved={(r: any) => {
                const n = [...props, { values: { name_as_recalled: r.name }, resolved: r }];
                setProps(n); persist(answers, n);
              }} />
            </div>

            <div className="gx-row">
              <button className="gx-btn" onClick={() => { const n = [...props, { values: {} }]; setProps(n); persist(answers, n); }}>Add one manually</button>
              <button className="gx-btn p" disabled={props.length === 0} onClick={advance}>
                {props.length === 0 ? "Add a property to continue" : `Next · ${props.length} propert${props.length === 1 ? "y" : "ies"}`}
              </button>
            </div>
          </>
        )}

        {step.kind === "propfield" && (
          <>
            <div className="gx-crumb">
              {step.section} · {props[step.index]?.resolved?.name || props[step.index]?.values?.name_as_recalled || `Property ${step.index + 1}`}
            </div>
            <QuestionCard
              field={step.field}
              value={props[step.index]?.values?.[step.field.id]}
              draft={draft} setDraft={setDraft}
              hideCrumb
              onAnswer={(v: any) => { setPropVal(step.index, step.field.id, v); setTimeout(advance, 0); }}
              onSkipScript={advance}
            />
          </>
        )}

        {step.kind === "propchooser" && (
          <>
            <div className="gx-crumb">{step.section}</div>
            <div className="gx-q">
              {step.tier === "nong6" ? "Which motel was this? (not a Motel 6 / Studio 6)"
                : step.tier === "g6_name" ? "Which other Motel 6 / Studio 6? Just the name and location."
                : "Which Motel 6 or Studio 6 property was this?"}
              <span className="gx-vital">Vital</span>
            </div>
            <div className="gx-say"><div className="gx-cap">Say</div><div className="gx-txt">"Let's pin down this exact location — what was it, and roughly where?"</div></div>
            <div className="gx-note">Pick the real property so the firm names the right defendant. Use the cross-streets and landmarks they recall.</div>
            {(props[step.index]?.resolved?.name || props[step.index]?.values?.name_as_recalled) && (
              <div className="gx-prop">
                <div className="gx-prop-h"><b>{props[step.index]?.resolved?.name || props[step.index]?.values?.name_as_recalled}</b></div>
                {props[step.index]?.resolved?.address && <div className="gx-prop-a">{props[step.index]?.resolved?.address}</div>}
              </div>
            )}
            <div className="gx-lookup">
              <PropertyLookup onResolved={(r: any) => {
                const next = props.map((p, n) => n === step.index
                  ? { ...p, resolved: r, values: { ...p.values, name_as_recalled: p.values?.name_as_recalled || r.name } }
                  : p);
                setProps(next); persist(answers, next);
              }} />
            </div>
            <input className="gx-in" placeholder="Or type the name as the caller recalls it"
              value={props[step.index]?.values?.name_as_recalled ?? ""}
              onChange={(e) => setPropVal(step.index, "name_as_recalled", e.target.value)} />
            <div className="gx-row">
              <button className="gx-btn p wide"
                disabled={!(props[step.index]?.resolved || String(props[step.index]?.values?.name_as_recalled ?? "").trim())}
                onClick={advance}>Continue</button>
            </div>
          </>
        )}

        {step.kind === "propgate" && (
          <>
            <div className="gx-crumb">Properties</div>
            <div className="gx-q">{step.label}</div>
            <div className="gx-opts">
              <button className="gx-opt" onClick={() => answerGate(step.gateId, true)}><span className="gx-k" /><span className="gx-lab">Yes</span></button>
              <button className="gx-opt" onClick={() => answerGate(step.gateId, false)}><span className="gx-k" /><span className="gx-lab">No</span></button>
            </div>
          </>
        )}
      </div>

      <div className="gx-foot">
        <button className="gx-btn" disabled={idx === 0} onClick={back}>← Back</button>
        <div className="gx-sp" />
        <button className="gx-btn" disabled={saving} onClick={() => void doSave()}>{saving ? "Saving…" : "Save and finish later"}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- question
function QuestionCard({ field, value, draft, setDraft, onAnswer, onSkipScript, hideCrumb }: any) {
  const f: Field = field;
  const isChoice = f.kind === "select" || f.kind === "bool" || f.kind === "gate";
  const isBool = f.kind === "bool" || f.kind === "gate";
  const opts = isBool
    ? [{ value: true, label: "Yes" }, { value: false, label: "No" }]
    : (f.choices ?? (f.options ?? []).map((o: string) => ({ value: o, label: o })));
  const textish = ["text", "longtext", "int", "date", "phone", "email", "monthyear"].includes(f.kind);
  const cur = draft ?? value ?? (f.kind === "multiselect" ? [] : "");

  if (f.kind === "script") {
    return (
      <>
        <div className="gx-q">Read this before you go on</div>
        <div className="gx-say"><div className="gx-cap">Say</div><div className="gx-txt">"{f.script}"</div></div>
        {f.agentNote && <div className="gx-note">{f.agentNote}</div>}
        <div className="gx-row"><button className="gx-btn p wide" onClick={onSkipScript}>Read it, continue</button></div>
      </>
    );
  }

  return (
    <>
      <div className="gx-q">{f.label}{f.vital && <span className="gx-vital">Vital</span>}</div>
      {f.script && <div className="gx-say"><div className="gx-cap">Say</div><div className="gx-txt">"{f.script}"</div></div>}
      {f.agentNote && <div className="gx-note">{f.agentNote}</div>}

      {isChoice && (
        <>
          <div className="gx-opts">
            {opts.map((o: any) => (
              <button key={String(o.value)} className={`gx-opt ${value === o.value ? "sel" : ""}`} onClick={() => onAnswer(o.value)}>
                <span className="gx-k" /><span className="gx-lab">{o.label}</span>
              </button>
            ))}
          </div>
          {value !== undefined && value !== null && value !== "" && (
            <div className="gx-row">
              <button className="gx-btn wide" onClick={onSkipScript}>Answered · next →</button>
            </div>
          )}
        </>
      )}

      {f.kind === "multiselect" && (
        <>
          <div className="gx-opts">
            {opts.map((o: any) => {
              const sel: string[] = Array.isArray(cur) ? cur : [];
              const on = sel.includes(o.value);
              return (
                <button key={o.value} className={`gx-opt ${on ? "sel" : ""}`}
                  onClick={() => setDraft(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])}>
                  <span className="gx-k" /><span className="gx-lab">{o.label}</span>
                </button>
              );
            })}
          </div>
          <div className="gx-row">
            <button className="gx-btn p wide" disabled={!Array.isArray(cur) || cur.length === 0} onClick={() => onAnswer(cur)}>Next</button>
            {Array.isArray(value) && value.length > 0 && draft === null && (
              <button className="gx-btn" onClick={onSkipScript}>Leave as is →</button>
            )}
          </div>
        </>
      )}

      {textish && f.ref && (
        <>
          <Typeahead source={f.ref} autoFocus value={String(cur)} onChange={(v: string) => setDraft(v)} />
          <div className="gx-row">
            <button className="gx-btn p wide" disabled={!String(cur).trim()} onClick={() => onAnswer(cur)}>Next</button>
            {value && draft === null && <button className="gx-btn" onClick={onSkipScript}>Leave as is →</button>}
          </div>
        </>
      )}

      {textish && !f.ref && (
        <>
          {f.kind === "longtext"
            ? <textarea className="gx-in area" autoFocus value={cur} onChange={(e) => setDraft(e.target.value)} />
            : <input className="gx-in" autoFocus type={f.kind === "date" ? "date" : f.kind === "int" ? "number" : "text"} value={cur} onChange={(e) => setDraft(e.target.value)} />}
          <div className="gx-row">
            <button className="gx-btn p wide" disabled={!String(cur).trim()} onClick={() => onAnswer(cur)}>Next</button>
            {value && draft === null && <button className="gx-btn" onClick={onSkipScript}>Leave as is →</button>}
          </div>
        </>
      )}
    </>
  );
}

const CSS = `
.gx { max-width:760px; margin:0 auto; padding:2px 0 8px; }
.gx-prog { height:4px; background:var(--line); border-radius:99px; overflow:hidden; }
.gx-fill { height:100%; background:#1d4ed8; transition:width .18s; }
.gx-meta { display:flex; justify-content:space-between; font-size:11.5px; font-weight:800; letter-spacing:.06em;
  text-transform:uppercase; color:var(--ink-faint); margin:10px 2px 12px; }
.gx-err { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:10px 14px; border-radius:10px;
  font-size:13.5px; font-weight:600; margin-bottom:12px; }

.gx-card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:24px 26px; }
.gx-crumb { font-size:12px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:#1e40af; margin-bottom:6px; }
.gx-q { font-size:20px; font-weight:800; margin:6px 0 16px; line-height:1.35; letter-spacing:-.01em; }
.gx-vital { margin-left:9px; font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
  background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:3px 8px; border-radius:999px; vertical-align:middle; }

.gx-say { border-left:4px solid #0f1a2a; background:#f6f8fb; padding:10px 14px; border-radius:0 8px 8px 0; margin:0 0 14px; }
.gx-cap { font-size:11px; font-weight:800; letter-spacing:.6px; text-transform:uppercase; color:var(--ink-faint); }
.gx-txt { font-size:16px; margin-top:4px; line-height:1.5; color:#0d1420; font-weight:600; }
.gx-note { font-size:13px; color:var(--ink-soft); font-style:italic; margin:8px 0 0; line-height:1.5; }

.gx-opts { display:flex; flex-direction:column; gap:10px; margin-top:16px; }
.gx-opt { display:flex; align-items:center; gap:12px; width:100%; text-align:left; background:var(--surface);
  border:1.5px solid var(--line); border-radius:10px; padding:14px 16px; font-size:15.5px; cursor:pointer;
  transition:border-color .1s, background .1s; color:var(--ink); }
.gx-opt:hover { border-color:#1d4ed8; background:#f5f9ff; }
.gx-opt.sel { border-color:#1d4ed8; background:#eef5ff; }
.gx-k { width:22px; height:22px; border-radius:6px; border:1.5px solid #c3ccd6; flex:0 0 auto; }
.gx-opt.sel .gx-k { background:#1d4ed8; border-color:#1d4ed8; }
.gx-lab { font-weight:600; }

.gx-in { width:100%; font-family:inherit; font-size:15px; padding:11px 12px; border:1.5px solid var(--line);
  border-radius:8px; background:var(--surface-2); color:var(--ink); margin-top:14px; }
.gx-in.area { min-height:110px; resize:vertical; line-height:1.55; }
.gx-in:focus { outline:none; border-color:#1d4ed8; }

.gx-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:14px; }
@media (max-width:640px){ .gx-grid{ grid-template-columns:1fr; } }
.gx-gf { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:700; color:var(--ink-soft); }
.gx-gf em { color:#b91c1c; font-style:normal; font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; margin-left:6px; }
.gx-gf .gx-in { margin-top:0; }

.gx-prop { border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-top:10px; background:var(--surface-2); }
.gx-prop-h { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:14.5px; }
.gx-prop-a { font-size:12.5px; color:var(--ink-faint); margin-top:2px; }
.gx-x { background:none; border:0; color:#b91c1c; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
.gx-lookup { margin-top:14px; }

.gx-row { display:flex; gap:10px; margin-top:20px; flex-wrap:wrap; }
.gx-btn { border:1px solid var(--line); background:var(--surface); border-radius:9px; padding:12px 20px;
  font-size:14.5px; font-weight:700; cursor:pointer; color:var(--ink); font-family:inherit; }
.gx-btn.p { background:#0f1a2a; color:#fff; border-color:#0f1a2a; }
.gx-btn.wide { flex:1; }
.gx-btn:disabled { opacity:.4; cursor:not-allowed; }
.gx-foot { display:flex; align-items:center; gap:10px; margin-top:14px; }
.gx-sp { flex:1; }
`;
