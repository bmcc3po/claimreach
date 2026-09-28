"use client";
// ============================================================================
// Conversation and Quick Capture (Brett's renderings, Sep 27): one question at
// a time, in call order. Conversation keeps what was just said in view above
// the question; Quick Capture puts the key facts on top and big one-tap
// answers under the question. Both read the call engine's fullIntake().one:
// the same questions, answers and controls as Full Intake, so switching views
// lands on the same question with every answer in place.
// ============================================================================
import { useEffect, useRef } from "react";
import WhereField from "./WhereField";
import { OPEN_LINE } from "./scripts";
import DuoIcon from "./DuoIcon";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
function Ico({ id, size = 18 }: { id: string; size?: number }) {
  const p = { ...P, width: size, height: size, viewBox: "0 0 24 24" };
  if (!["chev", "back", "check"].includes(id)) return <DuoIcon name={id} size={size + 2} />;
  switch (id) {
    case "calendar": return <svg {...p}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
    case "question": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" /><path d="M12 16.8h.01" /></svg>;
    case "yes": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.3 12.3l2.5 2.5 5-5.3" /></svg>;
    case "no": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" /></svg>;
    case "incident": return <svg {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
    case "injury": return <svg {...p}><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" /></svg>;
    case "treatment": return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></svg>;
    case "insurance": return <svg {...p}><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" /></svg>;
    case "vehicle": return <svg {...p}><path d="M5 16V11l2-5h10l2 5v5" /><path d="M3 16h18v2H3z" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" /></svg>;
    case "person": return <svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" /></svg>;
    case "note": return <svg {...p}><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h4" /></svg>;
    case "chev": return <svg {...p} strokeWidth={2.4}><path d="M9 6l6 6-6 6" /></svg>;
    case "back": return <svg {...p} strokeWidth={2.4}><path d="M15 6l-6 6 6 6" /></svg>;
    case "help": return <svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>;
    case "check": return <svg {...p} strokeWidth={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
    default: return null;
  }
}

/** A picture for each answer, so the list scans at a glance. */
function iconFor(q: any, label: string): string {
  const t = String(label || "").toLowerCase();
  if (/^(not sure|not clear|maybe)/.test(t)) return "question";
  if (q.isDate || /^(today|yesterday|same day|earlier)$/.test(t) || /^(mon|tue|wed|thu|fri|sat|sun) \d+$/.test(t)) return "calendar";
  if (t === "yes" || t === "came out") return "yes";
  if (t === "no" || t === "no insurance") return "no";
  if (["driver", "passenger", "pedestrian", "caller", "just them", "just her"].includes(t)) return "person";
  if (t === "other driver" || t === "hit and run") return "vehicle";
  return q.sec || "incident";
}

function Option({ o, q, big }: { o: any; q: any; big: boolean }) {
  return (
    <button type="button" className={`oq-opt${o.on ? " oq-on" : ""}${big ? " oq-big" : ""}`} aria-pressed={!!o.on} onClick={o.pick}>
      {!big && <span className="oq-ico"><Ico id={iconFor(q, o.label)} /></span>}
      <span className="oq-opt-t">
        <span className="oq-opt-l">{o.label}</span>
        {!!o.sub && <span className="oq-opt-s">{o.sub}</span>}
      </span>
      <span className="oq-opt-r">{o.on ? <span className="oq-tick"><Ico id="check" size={14} /></span> : <Ico id="chev" size={16} />}</span>
    </button>
  );
}

function Answers({ q, v, big }: { q: any; v: any; big: boolean }) {
  const c = q.c;
  if (c.kind === "where") return <div className="oq-field"><WhereField value={c.where.value} agreement={v.agreement} onChange={c.where.set} onDone={c.where.done} /></div>;
  if (c.kind === "people") {
    return (<>
      <div className="oq-opts">
        <Option o={{ label: c.justMe.label, on: c.justMe.on, pick: c.justMe.pick }} q={q} big={big} />
        <button type="button" className={`oq-opt oq-add${big ? " oq-big" : ""}`} onClick={c.add}>
          {!big && <span className="oq-ico"><Ico id="person" /></span>}
          <span className="oq-opt-t"><span className="oq-opt-l">Add a passenger</span></span>
          <span className="oq-opt-r"><Ico id="chev" size={16} /></span>
        </button>
      </div>
      {c.people.map((p: any, i: number) => (
        <div key={i} className="oq-person">
          <div className="oq-addrow">
            <input className="fi-in" placeholder="Passenger's name" aria-label="Passenger's name" value={p.name ?? ""} onChange={p.setName} />
            <button type="button" className="oq-small" onClick={p.remove}>Remove</button>
          </div>
          <div className="oq-pills">{p.ages.map((a: any, j: number) => <button key={j} type="button" className={`oq-pill${/ on/.test(a.cls) ? " oq-on" : ""}`} onClick={a.pick}>{a.label}</button>)}</div>
          <div className="oq-pills">{p.hurts.map((a: any, j: number) => <button key={j} type="button" className={`oq-pill${/ on/.test(a.cls) ? " oq-on" : ""}`} onClick={a.pick}>{a.label === "Yes" ? "Hurt" : "Not hurt"}</button>)}</div>
        </div>
      ))}
    </>);
  }
  const grid = c.kind === "crashdate";
  return (<>
    <div className={`oq-opts${grid ? " oq-grid" : ""}`}>
      {(c.opts || []).map((o: any, i: number) => <Option key={i} o={o} q={q} big={big && !grid} />)}
    </div>
    {!!c.note && <textarea className="fi-in fi-area" rows={3} placeholder={c.note.ph} aria-label={c.note.label} value={c.note.value ?? ""} onChange={c.note.set} />}
    {!!c.other && <input className="fi-in" placeholder={c.other.ph} aria-label={c.other.ph} value={c.other.value} onChange={c.other.set} />}
    {(c.kind === "visit" || (c.kind === "crashdate" && c.date.show)) && (
      <label className="oq-date"><Ico id="calendar" /><span>Or pick the date</span>
        <input className="fi-in" type="date" min={c.date.min || undefined} max={c.date.max || undefined} value={c.date.value ?? ""} onChange={c.date.set} />
      </label>
    )}
    {!!c.date?.why && <div className="oq-cue oq-bad">{c.date.why}</div>}
    {!!c.cue && <div className="oq-cue oq-bad">{c.cue}</div>}
  </>);
}

/** Under the caller's name: where the agent is, the lights, the view. */
export function OneTop({ v }: { v: any }) {
  const fi = v.fi, one = fi.one, quick = v.oneKind === "quick";
  return (
    <div className="oq-top">
      {quick && (
        <div className="oq-facts">
          {one.facts.map((f: any) => (
            <button key={f.id} type="button" className="oq-fact" onClick={f.go}>
              <span className="oq-fact-i"><Ico id={f.id === "where" ? "incident" : f.id === "when" ? "calendar" : "insurance"} size={17} /></span>
              <span className="oq-fact-t"><span className="oq-fact-k">{f.label}</span><span className={`oq-fact-v${f.value ? "" : " oq-empty"}`}>{f.value || "Not yet"}</span></span>
            </button>
          ))}
        </div>
      )}
      <div className="oq-row">
        <span className="oq-count">{one.q ? `Question ${one.n} of ${one.total}` : "Every question asked"}</span>
        {!v.ws && (!quick || fi.lights.bad) && <button type="button" className={`fi-lights${fi.lights.bad ? " fi-lights-bad" : ""}`} onClick={fi.lights.toggle} aria-expanded={fi.lights.open}>
          {fi.lights.bad ? `Problem: ${fi.lights.text}` : `Lights ${fi.lights.text}`}
        </button>}
        <span className="oq-sp" />
        {quick && !fi.lights.bad && <span className="oq-pct">{fi.progress.pct}%</span>}
        <button type="button" className="fi-view" onClick={v.toggleModeMenu} aria-expanded={!!v.modeMenuOpen} aria-label="Change view">
          {fi.viewLabel}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      {quick && <div className="fi-bar-track oq-track" aria-hidden="true"><i style={{ width: `${fi.progress.pct}%` }} /></div>}
      {fi.lights.open && !v.ws && (
        <div className="fi-pop" role="dialog" aria-label="Qualifiers">
          {fi.lights.rows.map((r: any, i: number) => <div key={i} className={`fi-pop-row fi-l-${r.state || "none"}`}><i />{r.label}</div>)}
          <button type="button" className="fi-pop-x" onClick={fi.lights.toggle}>Close</button>
        </div>
      )}
    </div>
  );
}

export function OneBody({ v }: { v: any }) {
  const fi = v.fi, one = fi.one, q = one.q, quick = v.oneKind === "quick";
  const note = useRef<HTMLTextAreaElement | null>(null);
  const top = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (one.note.open) note.current?.focus(); }, [one.note.open]);
  // A new question starts at the top of the screen.
  useEffect(() => { top.current?.closest(".cc-main")?.scrollTo({ top: 0 }); }, [q?.id]);
  return (<>
    <div ref={top} />
    {!quick && (
      <div className="oq-before">
        {one.before ? (<>
          <div className="oq-before-k">Last answer</div>
          {!!one.before.ask && <div className="oq-before-t">{one.before.ask}</div>}
          <div className="oq-before-v"><b>{one.before.label}:</b> {one.before.value}</div>
        </>) : (<>
          <div className="oq-before-k">{OPEN_LINE.label}</div>
          <div className="oq-before-t oq-before-open">{OPEN_LINE.line}</div>
          <div className="oq-before-v">{OPEN_LINE.cue}</div>
        </>)}
      </div>
    )}

    {q ? (<>
      <div className="oq-card">
        <div className="oq-card-k">{quick ? q.secLabel : `Question ${one.n} of ${one.total}, ${q.secLabel}`}</div>
        <div className="oq-card-q">{q.ask || q.label}</div>
        {!!q.cue && <div className="oq-card-s">{q.cue}</div>}
      </div>
      {!!q.gap && (
        <div className={`oq-gap oq-gap-${String(q.gap.cls).replace(/.*gaprow ?/, "") || "none"}`}>
          <b>30-day check: {q.gap.value}</b>{!!q.gap.sub && <span>{q.gap.sub}</span>}
        </div>
      )}
      <Answers q={q} v={v} big={quick} />
      {q.rep && (
        <div className="oq-rep">
          <div className="oq-cue">{v.rep.head}. Do not go looking for it. The PNC has to be the one who says they&apos;re unhappy.</div>
          <div className="oq-pills">{(v.rep.unhappy || []).map((c: any, i: number) => <button key={i} type="button" className={`oq-pill${/ on/.test(c.cls) ? " oq-on" : ""}`} onClick={c.pick}>{c.label}</button>)}</div>
          {v.rep.isUnhappy && <div className="oq-pills">{(v.rep.kind || []).map((c: any, i: number) => <button key={i} type="button" className={`oq-pill${/ on/.test(c.cls) ? " oq-on" : ""}`} onClick={c.pick}>{c.label}</button>)}</div>}
          {v.rep.fender && <div className="oq-cue">The firm charges these back. Close it warm and let it go.</div>}
        </div>
      )}
      {q.needDone && <button type="button" className="oq-done" disabled={!q.answered} onClick={q.done}>Done</button>}
    </>) : (
      <div className="oq-card oq-card-done">
        <div className="oq-card-q">Every question is answered.</div>
      </div>
    )}

    {one.note.open ? (
      <div className="oq-note">
        <textarea ref={note} className="fi-in fi-area" rows={2} placeholder="Jot it down now, sort it out later" value={fi.quick.draft.value} onChange={fi.quick.draft.set}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fi.quick.save(); one.note.toggle(); } }} />
        <div className="oq-note-b">
          <button type="button" className="oq-small" onClick={one.note.toggle}>Cancel</button>
          <button type="button" className="fi-save" onClick={() => { fi.quick.save(); one.note.toggle(); }}>Save note</button>
        </div>
      </div>
    ) : (
      <button type="button" className="oq-addnote" onClick={one.note.toggle}>
        <span className="oq-ico oq-ico-grey"><Ico id="note" /></span><span>Add a note</span><Ico id="chev" size={16} />
      </button>
    )}
  </>);
}

/** Previous, Help, Skip. When every question is asked, the way on. */
export function OneBar({ v }: { v: any }) {
  const one = v.fi.one;
  return (<>
    <button type="button" className="oq-nav" disabled={!one.prev} onClick={one.prev || undefined}><Ico id="back" size={17} />Previous</button>
    <button type="button" className="fi-tool oq-help" onClick={v.openSheet}><Ico id="help" size={19} />Help</button>
    {one.q
      ? <button type="button" className="oq-nav oq-skip" onClick={one.skip}>Skip<Ico id="chev" size={17} /></button>
      : <button type="button" className="fi-next oq-finish" onClick={v.fi.finish.go}>{v.fi.finish.label}</button>}
  </>);
}
