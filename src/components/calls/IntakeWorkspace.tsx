"use client";
// ============================================================================
// One frame for every view (Brett, Sep 27: "it needs consistency, clarity, and
// persistent reminders and helpers for the agent").
//
// Phone and iPad upright: the same header, the same progress bar with the view
// switch under it, and the same bottom bar (Help, Note, the one next step) in
// Guided, Collapsible and All questions.
//
// iPad sideways and computer: three columns in every view.
//   left    the caller: who, the call controls, the lead, the six
//           qualifiers, quick notes
//   middle  progress and the view switch pinned on top, then the view
//   right   the helper, always open: what to say now, reminders, what is
//           still missing, rebuttals for this part, Ask CaseCure
//
// Nothing here holds an answer. Every tap goes to the call engine, so
// switching views, turning the iPad or resizing lands in the same place.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { REBS } from "@/lib/mva-call/engine";
import { OPEN_TONE, openGreeting, openLine, OPEN_CUE, OPEN_LINE, MONEY, SEND_LINE, STAY, SIGNED, closeLines, CLOSE_CUE } from "./scripts";

const LIGHT_WORD: Record<string, string> = { ok: "Good", bad: "Problem", flag: "Check", none: "Not yet" };

/** Which rebuttals fit the part of the intake the agent is in. */
const PHASES_FOR: Record<string, string[]> = {
  incident: ["open", "story"], injury: ["body"], treatment: ["body"], insurance: ["body"], vehicle: ["send"], notes: ["send"], retainer: ["send", "money"],
};

/** The view the agent is looking at, in one word. */
export function viewOf(v: any): "guided" | "full" | "chore" {
  return v.choreView ? "chore" : v.view === "full" ? "full" : "guided";
}

function ViewIcon({ k }: { k: string }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (k === "guided") return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" /></svg>;
  if (k === "full") return <svg {...p}><rect x="4" y="4" width="16" height="5" rx="1.6" /><rect x="4" y="11" width="16" height="9" rx="1.6" /><path d="M8 14.5h8" /></svg>;
  return <svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>;
}

function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
}

/** Phone and iPad upright: who, the clock, text and end call. Same in every view. */
export function IxHead({ v }: { v: any }) {
  return (
    <div className="ix-head">
      <a className="ix-back" href="/app" aria-label="All calls">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </a>
      <div className="ix-who">
        <div className="ix-name">{v.callerName}</div>
        <div className="ix-meta">
          {/* A failed save takes the whole line; otherwise the number and a short "Saved". */}
          {v.saveBad ? <span className="ix-save-bad" role="status">{v.saveError}</span> : (<>
            {!!v.callerPhone && <span>{v.callerPhone}</span>}
            {!!v.saveText && <span className="ix-save" role="status" title={v.saveText}>{/^Saved/.test(v.saveText) ? "Saved" : v.saveText}</span>}
          </>)}
        </div>
      </div>
      {v.onCall || v.ringing
        ? <span className="ix-clock ix-live" title="JustCall says you are on a call"><i aria-hidden="true" />{v.onCall ? "On a call" : "Ringing"}</span>
        : !!v.clockText && <span className={`ix-clock${v.clockOver ? " ix-over" : ""}`} title={`Intake time. Goal: ${v.targetText}`} aria-label={`Intake time ${v.clockText}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5" /></svg>{v.clockText}
          </span>}
      <button type="button" className="ix-circ" onClick={v.openText} aria-label={v.textBadge ? `${v.textUnread} new texts from ${v.callerFirst}` : `Text ${v.callerFirst}`}>
        {!!v.textBadge && <span className="ix-badge">{v.textUnread}</span>}
        <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.58 2 11c0 2.4 1.32 4.55 3.4 6.02L4.6 21l4.33-2.3c.99.2 2.02.3 3.07.3 5.52 0 10-3.58 10-8s-4.48-8-10-8z" /></svg>
      </button>
      <button type="button" className="ix-circ ix-end" onClick={v.openDispo} aria-label="End call">
        <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a.99.99 0 0 1 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85a1 1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
      </button>
    </div>
  );
}

/** Progress, the view switch and (Guided) the call steps. The same bar, in the same place, in every view. */
export function IxBar({ v }: { v: any }) {
  const fi = v.fi;
  const wide = !!v.ws;
  const steps = !v.choreView && !v.fullView;
  const lights = fi.lights;
  return (
    <div className="ix-bar">
      <div className="ix-bar-row">
        <div className="ix-prog">
          <div className="ix-prog-row">
            <span className="ix-prog-k">Intake</span>
            <span className="ix-prog-t">{fi.progress.text} captured</span>
            {!wide && (
              <button type="button" className={`ix-lights${lights.bad ? " ix-lights-bad" : ""}`} onClick={lights.toggle} aria-expanded={!!lights.open}>
                <i aria-hidden="true" />{lights.bad ? `Problem: ${lights.text}` : `Qualifiers ${lights.text}`}
              </button>
            )}
            <span className="ix-pct">{fi.progress.pct}%</span>
          </div>
          <div className="ix-track" aria-hidden="true"><i style={{ width: `${fi.progress.pct}%` }} /></div>
        </div>
        <div className="ix-views" role="radiogroup" aria-label="View">
          {(v.modes || []).map((m: any) => (
            <button key={m.key} type="button" role="radio" aria-checked={!!m.on} className={`ix-view${m.on ? " ix-on" : ""}`} onClick={m.go}>
              <ViewIcon k={m.key} /><span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>
      {steps && (
        <nav className="ix-steps" aria-label="Call steps">
          {(v.tabs || []).map((t: any, i: number) => {
            const cls = String(t.cls || "");
            const st = / on/.test(cls) ? " ix-now" : / full/.test(cls) ? " ix-done" : / miss/.test(cls) ? " ix-miss" : "";
            return <button key={i} type="button" className={`ix-step${st}`} onClick={t.go} aria-current={/ on/.test(cls) ? "step" : undefined}><b>{i + 1}</b><span>{t.label}</span></button>;
          })}
        </nav>
      )}
      {!wide && lights.open && (
        <div className="ix-pop" role="dialog" aria-label="Qualifiers">
          {lights.rows.map((r: any, i: number) => (
            <div key={i} className={`ix-pop-row ix-l-${r.state || "none"}`}><i aria-hidden="true" /><span>{r.label}</span><b>{LIGHT_WORD[r.state || "none"]}</b></div>
          ))}
          <button type="button" className="ix-pop-x" onClick={lights.toggle}>Close</button>
        </div>
      )}
    </div>
  );
}

/** The one next step, for whichever view is showing. */
function nextStep(v: any): { label: string; go: () => void; disabled?: boolean; muted?: boolean; finish?: boolean } | null {
  const fi = v.fi;
  if (v.choreView) {
    const ch = fi.chore;
    if (fi.next) return { label: fi.next.label, go: fi.next.go };
    const now = ch?.rows.find((r: any) => r.status === "now" || r.status === "needs" || r.status === "todo");
    if (now) return { label: `Next: ${now.label}`, go: now.go };
    return ch ? { label: "Finish the call", go: ch.finish.go, finish: true } : null;
  }
  if (v.fullView) return fi.next ? { label: fi.next.label, go: fi.next.go } : { label: fi.finish.label, go: fi.finish.go, finish: true };
  return { label: v.next.label, go: v.next.go, disabled: !!v.next.disabled, muted: !!v.next.muted, finish: !!v.next.finish };
}

/** Bottom: Help and Note on a phone, and the one next step in every view. */
export function IxFoot({ v }: { v: any }) {
  const fi = v.fi;
  const wide = !!v.ws;
  const n = nextStep(v);
  const note = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (fi.quick.open) note.current?.focus(); }, [fi.quick.open]);
  const alert = v.nudge;
  return (<>
    {!wide && fi.quick.open && (
      <div className="ix-note" role="dialog" aria-label="Quick note">
        <textarea ref={note} className="fi-in fi-area" rows={2} placeholder="Jot it down now, sort it out later" value={fi.quick.draft.value} onChange={fi.quick.draft.set}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fi.quick.save(); } }} />
        <div className="ix-note-b">
          <button type="button" className="ix-tool" onClick={fi.quick.toggle}>Cancel</button>
          <button type="button" className="ix-save-note" onClick={fi.quick.save}>Save note</button>
        </div>
      </div>
    )}
    {!!alert && <div className="ix-alert" role="alert">{alert}</div>}
    {!wide && (<>
      <button type="button" className="ix-tool" onClick={v.openSheet}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>Help
      </button>
      <button type="button" className="ix-tool" onClick={fi.quick.toggle} aria-expanded={!!fi.quick.open}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>Note
      </button>
    </>)}
    {!!n && (
      <button type="button" className={`ix-next${n.muted ? " ix-muted" : ""}${n.finish ? " ix-finish" : ""}`} disabled={!!n.disabled} onClick={n.go}>
        <span>{n.label}</span><Chevron />
      </button>
    )}
  </>);
}

export function WsLeft({ v }: { v: any }) {
  const fi = v.fi;
  const lead = fi.lead;
  const notes = String(v.f?.text?.value || "").split("\n").map((t) => t.trim()).filter(Boolean).reverse().slice(0, 8);
  const desk = v.ws === "desk";
  return (
    <aside className="ws-left" aria-label="Caller">
      <section className="ws-caller">
        <a className="ws-back" href="/app">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>All calls
        </a>
        <div className="ws-name">{v.callerName}</div>
        {(!!v.leadNo || !!v.campaignName) && <div className="ws-sub">{[v.leadNo, v.campaignName].filter(Boolean).join(", ")}</div>}
        {!!v.callerPhone && <div className="ws-contact">{v.callerPhone}</div>}
        {!!v.callerEmail && <div className="ws-contact ws-email">{v.callerEmail}</div>}
        {(v.onCall || v.ringing) && (
          <div className="ws-status">
            <span className="ws-live" aria-hidden="true" />
            <span>{v.onCall ? "On a call in JustCall" : "Ringing in JustCall"}</span>
          </div>
        )}
        {!!v.clockText && (
          <div className={`ws-pace${v.clockOver ? " ws-pace-over" : ""}`}>
            <span className="ws-pace-k">Intake time</span>
            <span className="ws-clock">{v.clockText}</span>
            {!!v.targetText && <span className="ws-pace-g">Goal: {v.targetText}</span>}
          </div>
        )}
        <div className={`ws-save${v.saveBad ? " ws-save-bad" : ""}`} role="status">{v.saveBad ? v.saveError : v.saveText || "Saves as you go"}</div>
        <div className="ws-ctl">
          <button type="button" className="ws-btn" onClick={desk ? v.openPhone : v.openText}>Call</button>
          <button type="button" className="ws-btn" onClick={v.openText}>
            Text{!!v.textBadge && <span className="ws-badge">{v.textUnread}</span>}
          </button>
          <button type="button" className="ws-btn ws-end" onClick={v.openDispo}>End call</button>
        </div>
        <div className="ws-ctl ws-ctl2">
          {desk && <button type="button" className="ws-btn ws-quiet" onClick={v.openRetainer}>Agreement</button>}
          {desk && <button type="button" className="ws-btn ws-quiet" onClick={v.openFile}>File</button>}
          <a className="ws-btn ws-quiet" href={`/app/${v.leadId}/print`}>Print or email</a>
        </div>
      </section>

      {!!lead && (
        <section className="ws-block">
          <div className="ws-h">Campaign and source</div>
          {!!lead.from && <div className="ws-src">{lead.from}</div>}
          {!!lead.tags && <div className="ws-tags">From the lead: {lead.tags}</div>}
          {!!lead.said && (
            <button type="button" className="ws-link" onClick={lead.toggle} aria-expanded={!!lead.open}>
              {lead.open ? "Hide what the PNC told the marketer" : "What the PNC told the marketer"}
            </button>
          )}
          {!!lead.open && !!lead.said && <div className="ws-said">{lead.said}</div>}
        </section>
      )}

      {!!(v.linked || []).length && (
        <section className="ws-block">
          <div className="ws-h">Same wreck</div>
          {(v.linked || []).map((l: any, i: number) => (
            <a key={i} className="ws-linkfile" href={`/app/${l.lead_no || l.id}`}>
              <b>{l.name}</b>
              <span>{l.lead_no ? `${l.lead_no}, ` : ""}{l.label}</span>
            </a>
          ))}
          <div className="ws-tags">Linked files. Ask how they&apos;re doing.</div>
        </section>
      )}

      <section className="ws-block">
        <div className="ws-h">Qualifiers <span className={`ws-count${fi.lights.bad ? " ws-count-bad" : ""}`}>{fi.lights.bad ? "Problem" : fi.lights.text}</span></div>
        <div className="ws-lights">
          {fi.lights.rows.map((r: any, i: number) => (
            <div key={i} className={`ws-light ws-l-${r.state || "none"}`}>
              <i aria-hidden="true" /><span>{r.label}</span><b>{LIGHT_WORD[r.state || "none"]}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="ws-block ws-notes">
        <div className="ws-h">Quick notes</div>
        <textarea className="fi-in fi-area ws-note-in" rows={2} placeholder="Jot it down now, sort it out later" aria-label="Quick note"
          value={fi.quick.draft.value} onChange={fi.quick.draft.set}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fi.quick.save(); } }} />
        <button type="button" className="ws-btn ws-save-note" onClick={fi.quick.save}>Save note</button>
        {notes.length > 0 && (
          <ul className="ws-note-list">
            {notes.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        )}
      </section>
    </aside>
  );
}

/** What to say right now, for any view at any step. */
function sayNow(v: any): { k: string; lines: string[]; cue?: string } {
  const fi = v.fi;
  const first = v.callerFirst;
  const open = { k: OPEN_TONE, lines: [openGreeting(first), openLine(first, v.agentFirst, v.firmSpoken)], cue: OPEN_CUE };
  if (v.isMoney) return { k: MONEY.label, lines: [MONEY.line], cue: MONEY.cue };
  if (v.isSend && v.sendReady) return { k: "Say", lines: [SEND_LINE] };
  if (v.isSend && v.notSigned) return { k: STAY.label, lines: [STAY.line] };
  if ((v.isSend || v.isFile) && v.signed) return { k: SIGNED.label, lines: [SIGNED.line], cue: SIGNED.cue };
  if (v.isClose) return { k: "Say, then hang up", lines: closeLines(first, v.firmSpoken).slice(0, 2), cue: CLOSE_CUE };
  const onePage = v.fullView || v.choreView;
  if (!onePage && v.isOpen) return open;
  if (!onePage && v.isStory) return v.hasGap
    ? { k: "If the PNC didn't say it, ask", lines: [v.gapNext], cue: OPEN_LINE.cue }
    : { k: OPEN_LINE.label, lines: [OPEN_LINE.line], cue: OPEN_LINE.cue };
  if (!onePage && v.isBody && v.hasQ) return { k: v.q.step ? `Ask, ${v.q.step}` : "Ask", lines: [v.q.line], cue: v.q.cue };
  if (!onePage && v.isCar) return { k: "Say", lines: ["Who else was in the car with you?"], cue: "Do not skip this. Ever. Every passenger is their own file and their own agreement." };
  // Collapsible and All questions: the open first, then the next question still open.
  if (fi.progress.done === 0) return open;
  if (fi.next) return { k: `Ask next, ${fi.next.label.replace(/^Next: /, "")}`, lines: [fi.next.ask || fi.next.label.replace(/^Next: /, "")], cue: fi.next.cue };
  if (v.choreView && v.sendReady) return { k: MONEY.label, lines: [MONEY.line], cue: MONEY.cue };
  return { k: "Every question is answered", lines: ["Tell the PNC how we work, then send the agreement."] };
}

/** Standing reminders for the moment: the rules that keep a file clean. */
function reminders(v: any): { t: string; bad?: boolean }[] {
  const out: { t: string; bad?: boolean }[] = [];
  const fi = v.fi;
  if (fi.lights.bad) out.push({ t: `Red light: ${fi.lights.text}. Check it before you send.`, bad: true });
  if (v.solClose) out.push({ t: "Inside 90 days of the deadline. Get a supervisor before you sign or decline.", bad: true });
  else if (v.solHas && v.solText) out.push({ t: v.solText });
  if (v.gapCard?.show && /bad|warn/.test(String(v.gapCard.cls))) out.push({ t: `30-day check: ${v.gapCard.value}. ${v.gapCard.sub || ""}`.trim(), bad: /bad/.test(String(v.gapCard.cls)) });
  if (v.faultCaller) out.push({ t: "The PNC says they were at fault. Do not go hunting.", bad: true });
  if (v.repYes) out.push({ t: `${v.rep.head}. Do not go looking for it. The PNC has to be the one who says they're unhappy.` });
  if (v.sayingFine || v.sayingFineFree) out.push({ t: "The PNC is downplaying. Do not move past it. Use the soreness line." });
  if (v.sendWarn && (v.isSend || v.choreView)) out.push({ t: v.sendWarnText, bad: true });
  if (v.isMoney || v.isSend) out.push({ t: MONEY.cue });
  return out;
}

/** The helper, always open on the right (and the Now tab of Help on a phone). */
export function WsHelper({ v, inSheet }: { v: any; inSheet?: boolean }) {
  const fi = v.fi;
  const [openReb, setOpenReb] = useState<string | null>(null);
  const now = sayNow(v);
  const rem = reminders(v);
  const onePage = v.fullView || v.choreView;
  const phase = v.isOpen ? "open" : v.isStory ? "story" : v.isBody ? "body" : v.isCar ? "car" : v.isMoney ? "money" : v.isSend ? "send" : "close";
  const phases = onePage ? PHASES_FOR[fi.openSec || "incident"] || ["story"] : [phase];
  const lines = REBS.filter((r: any) => phases.includes(r.phase)).slice(0, 4);
  const fill = (t: string) => String(t || "").replace(/\{FIRM\}/g, v.firmSpoken).replace(/\{NAME\}/g, v.callerFirst || "");
  const bySec: { id: string; label: string; items: any[] }[] = [];
  for (const m of fi.missing || []) {
    let g = bySec.find((x) => x.id === m.sec);
    if (!g) { g = { id: m.sec, label: m.secLabel, items: [] }; bySec.push(g); }
    g.items.push(m);
  }
  const jump = (m: any) => { m.go(); if (inSheet) v.closeSheet(); };
  return (
    <div className={`wh${inSheet ? " wh-sheet" : ""}`}>
      {/* Guided already puts the line to say in the middle; the other views get it here. */}
      {(inSheet || onePage) && <section className="wh-say">
        <div className="wh-k">{now.k}</div>
        {now.lines.map((l, i) => <div key={i} className={`wh-line${i === 0 && now.lines.length > 1 ? " wh-line-sm" : ""}`}>{l}</div>)}
        {!!now.cue && <div className="wh-cue">{now.cue}</div>}
      </section>}

      {rem.length > 0 && (
        <section className="ws-block">
          <div className="ws-h">Reminders</div>
          <ul className="wh-rem">{rem.map((r, i) => <li key={i} className={r.bad ? "wh-bad" : ""}>{r.t}</li>)}</ul>
        </section>
      )}

      <section className="ws-block">
        <div className="ws-h">Still missing <span className="ws-count">{(fi.missing || []).length}</span></div>
        {bySec.length === 0 && <div className="ws-empty">Nothing required is missing.</div>}
        {bySec.map((g) => (
          <div key={g.id} className="ws-miss">
            <div className="ws-miss-h">{g.label}</div>
            <div className="ws-miss-items">
              {g.items.map((m: any) => onePage
                ? <button key={m.id} type="button" className="ws-miss-b" onClick={() => jump(m)}>{m.label}</button>
                : <span key={m.id} className="ws-miss-b ws-miss-t">{m.label}</span>)}
            </div>
          </div>
        ))}
      </section>

      <section className="ws-block">
        <div className="ws-h">If the PNC pushes back</div>
        <div className="ws-rebs">
          {lines.map((r: any) => (
            <div key={r.id} className={`ws-reb${openReb === r.id ? " ws-on" : ""}`}>
              <button type="button" className="ws-reb-q" onClick={() => setOpenReb(openReb === r.id ? null : r.id)} aria-expanded={openReb === r.id}>{r.title}</button>
              {openReb === r.id && (<>
                {!!r.note && <div className="ws-reb-note">{r.note}</div>}
                <div className="ws-reb-t">{fill(r.text)}</div>
              </>)}
            </div>
          ))}
        </div>
        <button type="button" className="ws-link" onClick={inSheet ? v.openRebuttals : v.openScripts || v.openRebuttals}>All rebuttals and lines</button>
      </section>

      {!inSheet && (
        <section className="ws-block">
          <div className="ws-h">Ask CaseCure</div>
          <textarea className="fi-in fi-area wh-ask" rows={2} placeholder="What the PNC said, in plain words" aria-label="Ask CaseCure" value={v.askField.value ?? ""} onChange={v.askField.set}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) v.doAsk(); }} />
          <button type="button" className="ws-btn wh-ask-b" disabled={!!v.askBusy} onClick={v.doAsk}>{v.askBusy ? "Asking" : "Ask"}</button>
          {!!v.askAnswer && <div className="wh-answer">{v.askAnswer}</div>}
          {!!v.askError && <div className="wh-err">{v.askError}</div>}
        </section>
      )}
      {inSheet && <a className="ws-link wh-print" href={`/app/${v.leadId}/print`}>Print or email the case</a>}
    </div>
  );
}
