"use client";
// ============================================================================
// Full Intake: the whole intake on one page, so the agent follows the caller
// instead of the caller following the software. Bookmarks jump down the same
// page (they are not tabs). Each section shows what's captured and opens in
// place. Nothing here holds an answer: every tap goes to the call engine, the
// same one Guided and Q&A read, so switching views never changes a thing.
// ============================================================================
import { useEffect, useRef } from "react";
import IntakeQuestion from "./IntakeQuestion";
import { OPEN_LINE, OPEN_TONE, openGreeting, openLine, OPEN_CUE } from "./scripts";
import DuoIcon from "./DuoIcon";

function Icon({ id }: { id: string }) {
  return <DuoIcon name={id} size={20} />;
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
      <span className="fi-jump-k">Jump to</span>
      {fi.bookmarks.map((b: any) => (
        <button key={b.id} type="button" className={`fi-mark${b.on ? " fi-on" : ""} fi-mark-${b.status}`} onClick={b.go}>
          <span className="fi-mark-i"><Icon id={b.id} /></span>
          <span>{b.label}</span>
        </button>
      ))}
    </nav>

    <div className="fi-open">
      <div className="fi-open-k">{OPEN_TONE}</div>
      <div className="fi-open-g">{openGreeting(v.callerFirst)}</div>
      <div className="fi-open-t">{openLine(v.callerFirst, v.agentFirst, v.firmSpoken)}</div>
      <div className="fi-open-s">{OPEN_CUE} Then stop talking. {OPEN_LINE.cue}</div>
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
            {s.questions.map((q: any) => <IntakeQuestion key={q.id} q={q} v={v} presentation="full" />)}
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
