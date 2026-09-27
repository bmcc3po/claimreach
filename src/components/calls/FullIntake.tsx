"use client";
// ============================================================================
// Full Intake: the whole intake on one page, so the agent follows the caller
// instead of the caller following the software. Bookmarks jump down the same
// page (they are not tabs). Each section shows what's captured and opens in
// place. Nothing here holds an answer: every tap goes to the call engine, the
// same one Guided and Q&A read, so switching views never changes a thing.
// ============================================================================
import { useEffect, useRef } from "react";
import WhereField from "./WhereField";
import { OPEN_LINE } from "./scripts";

function Icon({ id }: { id: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (id) {
    case "incident": return <svg {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
    case "injury": return <svg {...p}><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" /></svg>;
    case "treatment": return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></svg>;
    case "insurance": return <svg {...p}><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" /></svg>;
    case "vehicle": return <svg {...p}><path d="M5 16V11l2-5h10l2 5v5" /><path d="M3 16h18v2H3z" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" /></svg>;
    case "notes": return <svg {...p}><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h4" /></svg>;
    default: return null;
  }
}

function Chev({ open }: { open?: boolean }) {
  return <svg className={`fi-chev${open ? " fi-up" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
}

/** Complete, partly done, untouched, or left behind with blanks. Red only for a real problem. */
function Status({ status, count, bad }: { status: string; count: string; bad: boolean }) {
  if (bad) return <span className="fi-st fi-st-bad" aria-label="Needs attention">!</span>;
  if (status === "done") return <span className="fi-st fi-st-done" aria-label="Complete"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>;
  return (
    <span className={`fi-st-wrap fi-${status}`} aria-label={status === "missing" ? "Missing answers" : status === "partial" ? "Partly done" : "Not started"}>
      {!!count && status !== "empty" && <span className="fi-count">{count}</span>}
      <span className="fi-st fi-st-ring" />
    </span>
  );
}

function Chips({ opts }: { opts: any[] }) {
  return (
    <div className="fi-chips">
      {opts.map((o, i) => (
        <button key={i} type="button" className={`fi-chip${o.on ? " fi-on" : ""}`} aria-pressed={!!o.on} onClick={o.pick}>
          <span>{o.label}</span>{!!o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

function Control({ c, v }: { c: any; v: any }) {
  switch (c.kind) {
    case "chips":
    case "multi":
      return (<>
        <Chips opts={c.opts} />
        {!!c.other && <input className="fi-in" placeholder={c.other.ph} aria-label={c.other.ph} value={c.other.value} onChange={c.other.set} />}
        {!!c.cue && <div className="fi-cue fi-cue-bad">{c.cue}</div>}
      </>);
    case "visit":
      return (<>
        <Chips opts={c.opts} />
        <label className="fi-date"><span>Or the date</span>
          <input className="fi-in" type="date" min={c.date.min || undefined} max={c.date.max || undefined} value={c.date.value ?? ""} onChange={c.date.set} />
        </label>
        {!!c.date.why && <div className="fi-cue fi-cue-bad">{c.date.why}</div>}
      </>);
    case "crashdate":
      return (<>
        <Chips opts={c.opts} />
        {!!c.date.show && <input className="fi-in fi-in-date" type="date" max={c.date.max} aria-label="Date of the wreck" value={c.date.value ?? ""} onChange={c.date.set} />}
      </>);
    case "where":
      return <WhereField value={c.where.value} agreement={v.agreement} onChange={c.where.set} onDone={c.where.done} />;
    case "text":
      return <input className="fi-in" placeholder={c.field.ph} aria-label={c.field.ph} value={c.field.value ?? ""} onChange={c.field.set} />;
    case "notes":
      return <textarea className="fi-in fi-area" rows={4} placeholder={c.field.ph} aria-label="Notes" value={c.field.value ?? ""} onChange={c.field.set} />;
    case "providers":
      return (<>
        {c.items.length > 0 && (
          <div className="fi-chips">
            {c.items.map((it: any, i: number) => (
              <span key={i} className="fi-tag">{it.label}<button type="button" aria-label={`Remove ${it.label}`} onClick={it.remove}>×</button></span>
            ))}
          </div>
        )}
        <div className="fi-addrow">
          <input className="fi-in" placeholder={c.draft.ph} aria-label={c.draft.ph} value={c.draft.value} onChange={c.draft.set}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); c.add(); } }} />
          <button type="button" className="fi-add" onClick={c.add}>Add</button>
        </div>
      </>);
    case "carrier":
      return (<>
        <input className="fi-in" placeholder={c.query.ph} aria-label="Search insurance companies" value={c.query.value} onChange={c.query.set} />
        <Chips opts={c.opts} />
      </>);
    case "people":
      return (<>
        <div className="fi-chips">
          <button type="button" className={`fi-chip${c.justMe.on ? " fi-on" : ""}`} onClick={c.justMe.pick}>{c.justMe.label}</button>
          <button type="button" className="fi-chip fi-chip-add" onClick={c.add}>+ Add a passenger</button>
        </div>
        {c.people.map((p: any, i: number) => (
          <div key={i} className="fi-person">
            <div className="fi-addrow">
              <input className="fi-in" placeholder="Passenger's name" aria-label="Passenger's name" value={p.name ?? ""} onChange={p.setName} />
              <button type="button" className="fi-add fi-remove" onClick={p.remove}>Remove</button>
            </div>
            <Chips opts={p.ages.map((a: any) => ({ label: a.label, on: / on/.test(a.cls), pick: a.pick }))} />
            <Chips opts={p.hurts.map((a: any) => ({ label: a.label === "Yes" ? "Hurt" : "Not hurt", on: / on/.test(a.cls), pick: a.pick }))} />
          </div>
        ))}
      </>);
    case "car":
      return (
        <div className="fi-car">
          <select className="fi-in" aria-label="Vehicle year" value={c.year.value} onChange={c.year.set}>{c.year.options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
          <input className="fi-in" placeholder="Make" aria-label="Vehicle make" value={c.make.value} onChange={c.make.set} />
          <input className="fi-in" placeholder="Model" aria-label="Vehicle model" value={c.model.value} onChange={c.model.set} />
        </div>
      );
    default:
      return null;
  }
}

function Question({ q, v }: { q: any; v: any }) {
  if (!q.editing) {
    return (
      <button type="button" id={`fi-q-${q.id}`} className={`fi-q fi-q-row${q.flash ? " fi-flash" : ""}`} onClick={q.edit}>
        <span className="fi-q-k">{q.label}</span>
        <span className={`fi-q-v${q.tone ? " fi-tone-" + q.tone : ""}`}>{q.value}</span>
        <Chev />
      </button>
    );
  }
  return (
    <div id={`fi-q-${q.id}`} className={`fi-q fi-q-edit${q.flash ? " fi-flash" : ""}`}>
      <div className="fi-q-h">
        <span className="fi-q-k">{q.label}{q.optional && <em> Optional</em>}</span>
        {q.answered && <button type="button" className="fi-q-done" onClick={q.edit}>Done</button>}
      </div>
      {q.showAsk && <div className="fi-ask">{q.ask}</div>}
      <Control c={q.c} v={v} />
      {q.rep && (
        <div className="fi-rep">
          <div className="fi-cue">{v.rep.head}. Do not go looking for it. She has to be the one who says she's unhappy.</div>
          <Chips opts={(v.rep.unhappy || []).map((c: any) => ({ label: c.label, on: / on/.test(c.cls), pick: c.pick }))} />
          {v.rep.isUnhappy && <Chips opts={(v.rep.kind || []).map((c: any) => ({ label: c.label, on: / on/.test(c.cls), pick: c.pick }))} />}
          {v.rep.fender && <div className="fi-cue">The firm charges these back. Close it warm and let it go.</div>}
        </div>
      )}
    </div>
  );
}

/** The progress line under the caller's name: how much is captured, the lights, and the view. */
export function FiProgress({ v }: { v: any }) {
  const fi = v.fi;
  return (
    <div className="fi-prog">
      {!!v.ws && <div className="fi-prog-h">Intake progress</div>}
      <div className="fi-bar-track" aria-hidden="true"><i style={{ width: `${fi.progress.pct}%` }} /></div>
      <div className="fi-prog-row">
        <span className="fi-prog-t">{fi.progress.text} captured</span>
        {!v.ws && <button type="button" className={`fi-lights${fi.lights.bad ? " fi-lights-bad" : ""}`} onClick={fi.lights.toggle} aria-expanded={fi.lights.open}>
          {fi.lights.bad ? `Problem: ${fi.lights.text}` : `Lights ${fi.lights.text}`}
        </button>}
        {!!v.ws && <span className="fi-prog-sp" />}
        <button type="button" className="fi-view" onClick={v.toggleModeMenu} aria-expanded={!!v.modeMenuOpen} aria-label="Change view">
          {fi.viewLabel}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      {fi.lights.open && !v.ws && (
        <div className="fi-pop" role="dialog" aria-label="Qualifiers">
          {fi.lights.rows.map((r: any, i: number) => (
            <div key={i} className={`fi-pop-row fi-l-${r.state || "none"}`}><i />{r.label}</div>
          ))}
          <button type="button" className="fi-pop-x" onClick={fi.lights.toggle}>Close</button>
        </div>
      )}
    </div>
  );
}

/** The page itself: bookmarks, the open line, the lead, and every section. */
export function FiBody({ v }: { v: any }) {
  const fi = v.fi;
  const first = useRef(true);
  // A bookmark, "Next", or switching into this view moves the page to the spot.
  useEffect(() => {
    const target = fi.target ? document.getElementById(`fi-q-${fi.target}`) : null;
    const sec = fi.openSec ? document.getElementById(`fi-sec-${fi.openSec}`) : null;
    const el = target || sec;
    if (!el) return;
    if (first.current && !target && fi.openSec === "incident") { first.current = false; return; }
    first.current = false;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: target ? "center" : "start" }));
  }, [fi.jump]); // eslint-disable-line react-hooks/exhaustive-deps
  // Turning the iPad or resizing the window changes the layout, not the spot.
  const layout = useRef(v.ws || "phone");
  useEffect(() => {
    const now = v.ws || "phone";
    if (layout.current === now) return;
    layout.current = now;
    const el = document.getElementById(`fi-sec-${fi.openSec}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, [v.ws]); // eslint-disable-line react-hooks/exhaustive-deps

  return (<>
    <nav className="fi-marks" aria-label="Jump to a section">
      {fi.bookmarks.map((b: any) => (
        <button key={b.id} type="button" className={`fi-mark${b.on ? " fi-on" : ""} fi-mark-${b.status}`} onClick={b.go}>
          <span className="fi-mark-i"><Icon id={b.id} /></span>
          <span>{b.label}</span>
        </button>
      ))}
    </nav>

    <div className="fi-open">
      <div className="fi-open-k">{OPEN_LINE.label}</div>
      <div className="fi-open-t">{OPEN_LINE.line}</div>
      <div className="fi-open-s">{OPEN_LINE.cue}</div>
    </div>

    {!!fi.lead && !v.ws && (
      <button type="button" className={`fi-lead${fi.lead.open ? " fi-on" : ""}`} onClick={fi.lead.toggle} aria-expanded={!!fi.lead.open}>
        <span className="fi-lead-k">From the lead</span>
        <span className="fi-lead-t">{fi.lead.open ? fi.lead.said || fi.lead.tags : fi.lead.tags}</span>
      </button>
    )}

    {fi.sections.map((s: any) => (
      <section key={s.id} id={`fi-sec-${s.id}`} className={`fi-sec${s.open ? " fi-open-sec" : ""}`}>
        <button type="button" className="fi-sec-h" onClick={s.toggle} aria-expanded={s.open}>
          <span className="fi-ico"><Icon id={s.id} /></span>
          <span className="fi-sec-t">
            <span className="fi-sec-l">{s.label}</span>
            <span className={`fi-sum${s.status === "empty" ? " fi-sum-empty" : ""}`}>{s.summary}</span>
          </span>
          <Status status={s.status} count={s.count} bad={s.bad} />
          <Chev open={s.open} />
        </button>
        {s.open && (
          <div className="fi-sec-b">
            {!!s.gap && (
              <div className={`fi-gap fi-gap-${s.gap.cls.replace(/.*gaprow ?/, "") || "none"}`}>
                <div className="fi-gap-h"><span>30-day check</span><b>{s.gap.value}</b></div>
                {!!s.gap.sub && <div className="fi-gap-s">{s.gap.sub}</div>}
              </div>
            )}
            {s.questions.map((q: any) => <Question key={q.id} q={q} v={v} />)}
          </div>
        )}
      </section>
    ))}
    <div className="fi-end" />
  </>);
}

/** Help, a quick note, and the one next step. */
export function FiBar({ v }: { v: any }) {
  const fi = v.fi;
  const note = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (fi.quick.open) note.current?.focus(); }, [fi.quick.open]);
  if (v.ws) return (fi.next
    ? <button type="button" className="fi-next" onClick={fi.next.go}>{fi.next.label}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
    : <button type="button" className="cc-btn cc-go fi-finish" onClick={fi.finish.go}>{fi.finish.label}</button>);
  return (<>
    {fi.quick.open && (
      <div className="fi-note" role="dialog" aria-label="Quick note">
        <textarea ref={note} className="fi-in fi-area" rows={2} placeholder="Jot it down now, sort it out later" value={fi.quick.draft.value} onChange={fi.quick.draft.set}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fi.quick.save(); } }} />
        <div className="fi-note-b">
          <button type="button" className="fi-tool" onClick={fi.quick.toggle}>Cancel</button>
          <button type="button" className="fi-save" onClick={fi.quick.save}>Save note</button>
        </div>
      </div>
    )}
    <button type="button" className="fi-tool" onClick={v.openSheet}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>Help
    </button>
    <button type="button" className="fi-tool" onClick={fi.quick.toggle} aria-expanded={fi.quick.open}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>Note
    </button>
    {fi.next
      ? <button type="button" className="fi-next" onClick={fi.next.go}>{fi.next.label}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
      : <button type="button" className="cc-btn cc-go fi-finish" onClick={fi.finish.go}>{fi.finish.label}</button>}
  </>);
}
