"use client";
// ============================================================================
// Simple Chorelist: the whole call as one numbered paper form. If someone can
// fill out a paper form, they can use this without training.
//
// Rules (Brett, Sep 27): no tabs, no clickable progress, no accordions or
// collapsed sections, no hidden menus, no hover, no swipe, no floating panels,
// no popups, no chevrons, no icon-only buttons, no three-dot menus. Status is
// a word, never only a color. The only buttons are plain words.
//
// Same questions, answers and rules as every other view: each control here is
// wired to the call engine (fullIntake), so switching views changes nothing.
// Phone: one long form. iPad: two fields across. Computer: three.
// ============================================================================
import { useEffect, useRef } from "react";
import WhereField from "./WhereField";
import PlaceField from "./PlaceField";
import { OPEN_LINE, OPEN_TONE, openGreeting, openLine, OPEN_CUE, MONEY, SEND_LINE, STAY, walkThrough, NO_DEAD_AIR, SIGNED, closeLines, CLOSE_CUE } from "./scripts";
import { DobField, SsnField } from "./SsnDob";

const isOn = (cls: string) => / on(\s|$)/.test(" " + String(cls || "") + " ");

/** One answer choice, drawn as a box you tick. */
function Opt({ label, sub, on, pick }: { label: string; sub?: string; on: boolean; pick: () => void }) {
  return (
    <button type="button" className={`ch-opt${on ? " ch-on" : ""}`} aria-pressed={on} onClick={pick}>
      <span className="ch-box" aria-hidden="true">
        {on && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      </span>
      <span className="ch-opt-t">{label}{!!sub && <small>{sub}</small>}</span>
    </button>
  );
}

function Opts({ opts }: { opts: { label: string; sub?: string; on: boolean; pick: () => void }[] }) {
  return <div className="ch-opts">{opts.map((o, i) => <Opt key={i} {...o} />)}</div>;
}

/** Engine chips that carry "chip on" classes (Send, passengers). */
const fromCls = (list: any[]) => (list || []).map((c: any) => ({ label: c.label, on: isOn(c.cls), pick: c.pick }));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="ch-field"><span className="ch-field-l">{label}</span>{children}</label>;
}

function Control({ c, v }: { c: any; v: any }) {
  switch (c.kind) {
    case "chips":
    case "multi":
      return (<>
        <Opts opts={c.opts} />
        {!!c.other && <Field label="Explain"><input className="ch-in" value={c.other.value} onChange={c.other.set} /></Field>}
        {!!c.cue && <div className="ch-note">{c.cue}</div>}
      </>);
    case "visit":
      return (<>
        <Opts opts={c.opts} />
        <Field label="Or write the date">
          <input className="ch-in ch-date" type="date" min={c.date.min || undefined} max={c.date.max || undefined} value={c.date.value ?? ""} onChange={c.date.set} />
        </Field>
        {!!c.date.why && <div className="ch-note ch-note-bad">{c.date.why}</div>}
      </>);
    case "crashdate": {
      // Every choice shows. Writing a date is the same as picking Earlier and the date.
      const earlier = c.opts.find((o: any) => o.label === "Earlier");
      const days = c.opts.filter((o: any) => o.label !== "Earlier");
      return (<>
        <Opts opts={days} />
        <Field label="Or write the date">
          <input className="ch-in ch-date" type="date" max={c.date.max} value={c.date.value ?? ""}
            onChange={(e) => { if (earlier) earlier.pick(); c.date.set(e); }} />
        </Field>
      </>);
    }
    case "where":
      return <WhereField value={c.where.value} agreement={v.agreement} onChange={c.where.set} onDone={c.where.done} />;
    case "text":
      return <input className="ch-in" aria-label={c.field.ph} placeholder={c.field.ph} value={c.field.value ?? ""} onChange={c.field.set} />;
    case "notes":
      return <textarea className="ch-in ch-area" rows={5} aria-label="Notes" placeholder={c.field.ph} value={c.field.value ?? ""} onChange={c.field.set} />;
    case "providers":
      return (<>
        {c.items.length > 0 && (
          <ul className="ch-list">
            {c.items.map((it: any, i: number) => (
              <li key={i}><span>{it.label}</span><button type="button" className="ch-btn ch-line ch-sm" onClick={it.remove}>Remove</button></li>
            ))}
          </ul>
        )}
        <div className="ch-addrow">
          <input className="ch-in" aria-label={c.draft.ph} placeholder={c.draft.ph} value={c.draft.value} onChange={c.draft.set}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); c.add(); } }} />
          <button type="button" className="ch-btn ch-line" onClick={c.add}>Add</button>
        </div>
      </>);
    case "carrier":
      return (<>
        <Field label="Type the company name">
          <input className="ch-in" value={c.query.value} onChange={c.query.set} />
        </Field>
        <Opts opts={c.opts} />
      </>);
    case "people":
      return (<>
        <div className="ch-opts">
          <Opt label={c.justMe.label} on={c.justMe.on} pick={c.justMe.pick} />
          <button type="button" className="ch-btn ch-line" onClick={c.add}>Add a passenger</button>
        </div>
        {c.people.map((p: any, i: number) => (
          <div key={i} className="ch-person">
            <div className="ch-person-h">Passenger {i + 1}</div>
            <div className="ch-addrow">
              <input className="ch-in" aria-label="Passenger's name" placeholder="Passenger's name" value={p.name ?? ""} onChange={p.setName} />
              <button type="button" className="ch-btn ch-line" onClick={p.remove}>Remove</button>
            </div>
            <Opts opts={fromCls(p.ages)} />
            <Opts opts={p.hurts.map((a: any) => ({ label: a.label === "Yes" ? "Hurt" : "Not hurt", on: isOn(a.cls), pick: a.pick }))} />
          </div>
        ))}
      </>);
    case "car":
      return (
        <div className="ch-car">
          <Field label="Year">
            <select className="ch-in" value={c.year.value} onChange={c.year.set}>{c.year.options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
          </Field>
          <Field label="Make"><input className="ch-in" value={c.make.value} onChange={c.make.set} /></Field>
          <Field label="Model"><input className="ch-in" value={c.model.value} onChange={c.model.set} /></Field>
        </div>
      );
    default:
      return null;
  }
}

const WIDE = new Set(["people", "notes"]);

function Question({ q, v }: { q: any; v: any }) {
  return (
    <div id={`ch-q-${q.id}`} className={`ch-q${WIDE.has(q.c.kind) || q.rep ? " ch-wide" : ""}`}>
      <div className="ch-q-h">
        <span className="ch-q-l">{q.label}{q.optional && <span className="ch-q-opt"> (optional)</span>}</span>
        {q.tone === "bad" && <span className="ch-flag">PROBLEM</span>}
      </div>
      {!!q.ask && <div className="ch-ask">If she didn&apos;t say it, ask: <b>{q.ask}</b></div>}
      <Control c={q.c} v={v} />
      {q.rep && (
        <div className="ch-rep">
          <div className="ch-note">{v.rep.head}. Do not go looking for it. She has to be the one who says she&apos;s unhappy.</div>
          <Opts opts={fromCls(v.rep.unhappy)} />
          {v.rep.isUnhappy && <Opts opts={fromCls(v.rep.kind)} />}
          {v.rep.fender && <div className="ch-note">The firm charges these back. Close it warm and let it go.</div>}
        </div>
      )}
    </div>
  );
}

function Say({ label, line, cue, small }: { label: string; line: string; cue?: string; small?: boolean }) {
  return (
    <div className="ch-say ch-wide">
      <div className="ch-say-k">{label}</div>
      <div className={`ch-say-t${small ? " ch-say-sm" : ""}`}>{line}</div>
      {!!cue && <div className="ch-note">{cue}</div>}
    </div>
  );
}

/** Section 7: send the agreement, walk her through it, finish it. */
function Retainer({ v }: { v: any }) {
  if (v.sendReady) {
    return (<>
      <Say label={MONEY.label} line={MONEY.line} cue={MONEY.cue} small />
      <Say label="Say" line={SEND_LINE} small />
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Agreement</span></div>
        <div className="ch-static">{v.agreement}</div>
      </div>
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Signer&apos;s full name</span></div>
        <input className="ch-in" aria-label="Signer full name" value={v.f.client.value ?? ""} onChange={v.f.client.set} />
      </div>
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Injured person</span></div>
        <Opts opts={fromCls(v.injuredWho)} />
        {v.injuredOther && <Field label="Injured person's full name"><input className="ch-in" value={v.f.injured.value ?? ""} onChange={v.f.injured.set} /></Field>}
      </div>
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Send it by</span></div>
        <Opts opts={fromCls(v.via)} />
        <div className="ch-note">{v.viaNote}</div>
      </div>
      {v.viaText && (
        <div className="ch-q">
          <div className="ch-q-h"><span className="ch-q-l">Text it to</span></div>
          {(v.textTo || []).length > 0 && <Opts opts={fromCls(v.textTo)} />}
          {v.textToOther && <Field label={v.herPhoneOk ? "Number to text it to" : "Her cell"}><input className="ch-in" type="tel" inputMode="tel" value={v.f.phone.value ?? ""} onChange={v.f.phone.set} /></Field>}
        </div>
      )}
      {v.viaEmail && (
        <div className="ch-q">
          <div className="ch-q-h"><span className="ch-q-l">Her email</span></div>
          <input className="ch-in" type="email" inputMode="email" autoComplete="off" aria-label="Her email" value={v.f.email.value ?? ""} onChange={v.f.email.set} />
        </div>
      )}
      <div className="ch-wide ch-sendbox">
        {!!v.previewHref && <a className="ch-link" href={v.previewHref} target="_blank" rel="noopener">Preview the agreement before you send it</a>}
        {v.hasSendError && <div className="ch-note ch-note-bad">{v.sendError}</div>}
        {v.sendWarn && <div className="ch-note ch-note-bad">{v.sendWarnText}</div>}
        <button type="button" className="ch-btn ch-send" disabled={!!v.sendNext.disabled} onClick={v.sendNext.go}>Send the agreement</button>
      </div>
    </>);
  }
  const stepWord = (cls: string) => (/done/.test(cls) ? "Done" : "Not yet");
  return (<>
    <div className="ch-q ch-wide">
      <div className="ch-q-h"><span className="ch-q-l">The agreement</span></div>
      <ul className="ch-steps">
        {(v.sendSteps || []).map((st: any, i: number) => <li key={i}><span>{st.label}</span><b>{stepWord(st.cls)}</b></li>)}
      </ul>
      {v.hasSendError && <div className="ch-note ch-note-bad">{v.sendError}</div>}
    </div>
    {v.notSigned && (<>
      <Say label={STAY.label} line={STAY.line} small />
      <div className="ch-say ch-say-2 ch-wide">
        <div className="ch-say-k">Walk her through it</div>
        {walkThrough(v.firmSpoken).map((t, i) => <div key={i} className="ch-say-t ch-say-sm">{t}</div>)}
      </div>
      <div className="ch-say ch-say-2 ch-wide">
        <div className="ch-say-k">No dead air</div>
        {NO_DEAD_AIR.map((t, i) => <div key={i} className="ch-say-t ch-say-sm">{t}</div>)}
      </div>
      {v.canResend && <div className="ch-wide"><button type="button" className="ch-btn ch-line" onClick={v.resendLink}>Send the link again</button></div>}
    </>)}
    {v.signed && (<>
      <Say label={SIGNED.label} line={SIGNED.line} cue={SIGNED.cue} />
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Date of birth</span></div>
        <DobField cls="ch" value={v.f.dob.value ?? ""} onChange={(t: string) => v.f.dob.set({ target: { value: t } })} />
      </div>
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Social Security number</span></div>
        <SsnField cls="ch" value={v.f.ssn.value ?? ""} requireFull={!!v.ssnRequireFull} onChange={(t: string) => v.f.ssn.set({ target: { value: t } })} />
      </div>
      <div className="ch-q ch-wide">
        {v.agreementOpen && (
          <div className="ch-row">
            <button type="button" className="ch-btn" disabled={!!v.agreementLocked} onClick={v.completeAgreement}>Complete the agreement</button>
            <button type="button" className="ch-btn ch-line" onClick={v.leaveForQa}>Leave it for QA in the morning</button>
          </div>
        )}
        {v.agreementClosed && <div className="ch-note">{v.agreementNote}</div>}
        {v.agreementParked && <button type="button" className="ch-btn ch-line" onClick={v.reopenAgreement}>Reopen and finish it now</button>}
        {v.hasFileError && <div className="ch-note ch-note-bad">{v.fileError}</div>}
      </div>
      <div className="ch-q ch-wide">
        <div className="ch-q-h"><span className="ch-q-l">Home address</span></div>
        <PlaceField kind="address" label="Home address" placeholder="Start typing, pick the match" value={v.f.addr.value ?? ""} onChange={(t: string) => v.f.addr.set({ target: { value: t } })} />
      </div>
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Driver&apos;s license</span></div>
        <input className="ch-in" aria-label="Driver's license number" value={v.f.dl.value ?? ""} onChange={v.f.dl.set} />
      </div>
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Emergency contact</span></div>
        <Field label="Name"><input className="ch-in" value={v.f.ecName.value ?? ""} onChange={v.f.ecName.set} /></Field>
        <Field label="Phone"><input className="ch-in" type="tel" value={v.f.ecPhone.value ?? ""} onChange={v.f.ecPhone.set} /></Field>
        <Opts opts={fromCls(v.ecRel)} />
      </div>
      {(v.paxSend || []).map((p: any, i: number) => (
        <div key={i} className="ch-q ch-wide">
          <div className="ch-q-h"><span className="ch-q-l">{p.title}</span></div>
          <div className="ch-note">{p.note}</div>
          {p.ready && <button type="button" className="ch-btn" onClick={p.send}>{p.button}</button>}
          {p.live && <ul className="ch-steps">{(p.steps || []).map((st: any, j: number) => <li key={j}><span>{st.label}</span><b>{stepWord(st.cls)}</b></li>)}</ul>}
        </div>
      ))}
      <div className="ch-say ch-say-2 ch-wide">
        <div className="ch-say-k">Before you hang up, say</div>
        {closeLines(v.callerFirst, v.firmSpoken).map((t, i) => <div key={i} className="ch-say-t ch-say-sm">{t}</div>)}
        <div className="ch-note">{CLOSE_CUE}</div>
      </div>
    </>)}
  </>);
}

export default function ChoreList({ v }: { v: any }) {
  const fi = v.fi;
  const ch = fi.chore;
  const first = useRef(true);

  // Next, a section jump, or arriving from another view puts that spot at the top.
  useEffect(() => {
    const target = fi.target ? document.getElementById(`ch-q-${fi.target}`) : null;
    const el = target || document.getElementById(`ch-sec-${fi.openSec}`);
    const arriving = first.current;
    first.current = false;
    if (!el || (arriving && !target && fi.openSec === "incident")) return;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: arriving ? "auto" : "smooth", block: target ? "center" : "start" }));
  }, [fi.jump]); // eslint-disable-line react-hooks/exhaustive-deps

  const secQs = (id: string) => (fi.sections.find((s: any) => s.id === id) || { questions: [] }).questions;
  const gap = fi.sections.find((s: any) => s.id === "treatment")?.gap;

  return (
    <div className="ch-page">
      {ch.rows.map((r: any) => (
        <section key={r.id} id={`ch-sec-${r.id}`} className={`ch-sec ch-st-${r.status}`} onPointerDownCapture={r.enter} onFocusCapture={r.enter}>
          <div className="ch-sec-h">
            <span className="ch-n" aria-hidden="true">{r.n}</span>
            <h2 className="ch-sec-t">{r.label}</h2>
            <span className="ch-st">{STATUS_WORD[r.status] || r.statusText}</span>
          </div>

          {r.id === "incident" && (<>
            <div className="ch-say ch-say-open">
              <div className="ch-say-k">{OPEN_TONE}</div>
              <div className="ch-say-t ch-say-sm">{openGreeting(v.callerFirst)}</div>
              <div className="ch-say-t">{openLine(v.callerFirst, v.agentFirst, v.firmSpoken)}</div>
              <div className="ch-note">{OPEN_CUE} Then stop talking. {OPEN_LINE.cue}</div>
            </div>
            {!!fi.lead && !!fi.lead.tags && <div className="ch-lead"><b>From the lead</b> {fi.lead.tags}</div>}
          </>)}

          <div className="ch-grid">
            {r.id === "treatment" && !!gap && (
              <div className={`ch-q ch-wide ch-gap ch-gap-${String(gap.cls || "").replace(/.*gaprow ?/, "") || "none"}`}>
                <div className="ch-q-h"><span className="ch-q-l">30-day check</span><span className="ch-gap-v">{gap.value}</span></div>
                {!!gap.sub && <div className="ch-note">{gap.sub}</div>}
              </div>
            )}
            {r.id === "retainer" ? <Retainer v={v} /> : secQs(r.id).map((q: any) => <Question key={q.id} q={q} v={v} />)}
          </div>

          <div className="ch-actions">
            {r.status === "now" && <span className={`ch-saved${v.saveBad ? " ch-note-bad" : ""}`} role="status">{v.saveBad ? v.saveError : v.saveText || "Saves as you go"}</span>}
            {r.next
              ? <button type="button" className="ch-next" onClick={r.next}>Next section: {r.nextLabel}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              : <button type="button" className="ch-btn ch-finish" onClick={ch.finish.go}>Finish intake</button>}
          </div>
          {!r.next && ch.finish.ask && <div className="ch-note ch-note-bad ch-finish-ask" role="alert">{ch.finish.askText}</div>}
        </section>
      ))}
    </div>
  );
}

const STATUS_WORD: Record<string, string> = { done: "Done", now: "Do this now", needs: "Needs an answer", todo: "Not started" };
