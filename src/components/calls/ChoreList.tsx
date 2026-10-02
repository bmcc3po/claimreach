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
import IntakeQuestion, { AgreementRecipient } from "./IntakeQuestion";
import PlaceField from "./PlaceField";
import { OPEN_LINE, OPEN_TONE, openGreeting, openLine, OPEN_CUE, MONEY, SEND_LINE, STAY, walkThrough, NO_DEAD_AIR, SIGNED, closeLines, CLOSE_CUE } from "./scripts";
import { DobField, SsnField } from "./SsnDob";
import { SsnRefusal } from "./SsnRefusal";
import AgreementChoice from "./AgreementChoice";
import SignedInlineReview from "./SignedInlineReview";
import SignatureWaiting from "./SignatureWaiting";
import ContractActions from "./ContractActions";
import PassengerAgreement from "./PassengerAgreement";

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

function Say({ label, line, cue, small }: { label: string; line: string; cue?: string; small?: boolean }) {
  return (
    <div className="ch-say ch-wide">
      <div className="ch-say-k">{label}</div>
      <div className={`ch-say-t${small ? " ch-say-sm" : ""}`}>{line}</div>
      {!!cue && <div className="ch-note">{cue}</div>}
    </div>
  );
}

function IdentityFields({ v }: { v: any }) {
  return (<>
    {v.sendReady && <div className="ch-note ch-wide">DOB and SSN are optional before sending. Enter them now or after the client signs.</div>}
    <div className="ch-q">
      <div className="ch-q-h"><span className="ch-q-l">Date of birth</span></div>
      <DobField cls="ch" value={v.f.dob.value ?? ""} onChange={(t: string) => v.f.dob.set({ target: { value: t } })} />
    </div>
    <div className="ch-q">
      <div className="ch-q-h"><span className="ch-q-l">Social Security number</span></div>
      <SsnField cls="ch" value={v.f.ssn.value ?? ""} requireFull={!!v.ssnRequireFull} storedMode={v.f.ssnMode.value ?? null} onMode={(m: string) => v.f.ssnMode.set({ target: { value: m } })} onChange={(t: string) => v.f.ssn.set({ target: { value: t } })} savedMode={v.identitySavedMode} saveStatus={v.identityStatus} saveError={v.identitySaveError} onRetry={v.identityRetry} />
      <SsnRefusal v={v} />
    </div>
  </>);
}

/** Section 7: send the agreement, walk the PNC through it, finish it. */
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
      <div className="ch-q"><AgreementChoice v={v} /></div>
      <div className="ch-q">
        <div className="ch-q-h"><span className="ch-q-l">Send it by</span></div>
        <Opts opts={fromCls(v.via)} />
        <div className="ch-note">{v.viaNote}</div>
      </div>
      <div className="ch-q"><AgreementRecipient v={v} presentation="chore" /></div>
      <IdentityFields v={v} />
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
    {!!v.currentAgreement && <div className="cc-agreement-current ch-wide"><span>Contract already sent</span><strong>{v.currentAgreement.label}</strong></div>}
    <div className="ch-q ch-wide">
      <div className="ch-q-h"><span className="ch-q-l">The agreement</span></div>
      {v.signed ? <p className="ch-agreement-status">Client signature confirmed.</p> : <ul className="ch-steps">
        {(v.sendSteps || []).map((st: any, i: number) => <li key={i}><span>{st.label}</span><b className={/done/.test(st.cls) ? "ch-step-done" : undefined}>{stepWord(st.cls)}</b></li>)}
      </ul>}
      {v.hasSendError && <div className="ch-note ch-note-bad">{v.sendError}</div>}
    </div>
    <SignatureWaiting v={v} />
    {v.notSigned && (<>
      <Say label={STAY.label} line={STAY.line} small />
      <div className="ch-say ch-say-2 ch-wide">
        <div className="ch-say-k">Walk the PNC through it</div>
        {walkThrough(v.firmSpoken).map((t, i) => <div key={i} className="ch-say-t ch-say-sm">{t}</div>)}
      </div>
      <div className="ch-say ch-say-2 ch-wide">
        <div className="ch-say-k">No dead air</div>
        {NO_DEAD_AIR.map((t, i) => <div key={i} className="ch-say-t ch-say-sm">{t}</div>)}
      </div>
    </>)}
    {v.signed && <><Say label={SIGNED.label} line={SIGNED.line} /><SignedInlineReview v={v} /></>}
    {/* Identity stays editable after sending; completion still uses the
        signature/review lock supplied by the shared engine. */}
    <>
      <IdentityFields v={v} />
      <div className="ch-q ch-wide">
        {v.agreementOpen && (
          <div className="ch-row">
            <button type="button" className="ch-btn" disabled={!!v.agreementLocked} onClick={v.completeAgreement}>{v.completeLabel || "Complete the agreement"}</button>
            <button type="button" className="ch-btn ch-line" onClick={v.leaveForQa}>Finish later</button>
          </div>
        )}
        {v.agreementClosed && <div className="ch-note">{v.agreementNote}</div>}
        {v.agreementParked && <button type="button" className="ch-btn ch-line" onClick={v.reopenAgreement}>Reopen and finish it now</button>}
        {v.hasFileError && <div className="ch-note ch-note-bad">{v.fileError}</div>}
      </div>
      {!v.clientContact && <div className="ch-q ch-wide">
        <div className="ch-q-h"><span className="ch-q-l">Home address</span></div>
        <PlaceField kind="address" label="Home address" placeholder="Start typing, pick the match" value={v.f.addr.value ?? ""} onChange={(t: string) => v.f.addr.set({ target: { value: t } })} />
      </div>}
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
      {(v.paxSend || []).map((p: any) => <PassengerAgreement key={p.id} p={p} v={v} />)}
      {v.signed && (
        <div className="ch-say ch-say-2 ch-wide">
          <div className="ch-say-k">Before you hang up, say</div>
          {closeLines(v.callerFirst, v.firmSpoken).map((t, i) => <div key={i} className="ch-say-t ch-say-sm">{t}</div>)}
          <div className="ch-note">{CLOSE_CUE}</div>
        </div>
      )}
    </>
  </>);
}

export default function ChoreList({ v, sectionActions = true, scrollSections = true }: { v: any; sectionActions?: boolean; scrollSections?: boolean }) {
  const fi = v.fi;
  const ch = fi.chore;
  const first = useRef(true);

  // Next, a section jump, or arriving from another view puts that spot at the top.
  useEffect(() => {
    const arriving = first.current;
    first.current = false;
    // Step by step owns its screen heading. Only a deliberate question jump
    // after arrival should scroll past that heading into the shared controls.
    if (!scrollSections && (arriving || !fi.target)) return;
    const target = fi.target ? document.getElementById(`ch-q-${fi.target}`) : null;
    const el = target || (scrollSections ? document.getElementById(`ch-sec-${fi.openSec}`) : null);
    if (!el || (arriving && !target && fi.openSec === "incident")) return;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: arriving ? "auto" : "smooth", block: target ? "center" : "start" }));
  }, [fi.jump, scrollSections]); // eslint-disable-line react-hooks/exhaustive-deps

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
            {r.id === "retainer" ? <>{v.clientContact}<ContractActions key={v.agreementId || v.agreementStatus} v={v} /><Retainer v={v} /></> : secQs(r.id).map((q: any) => <IntakeQuestion key={q.id} q={q} v={v} presentation="chore" />)}
          </div>

          {sectionActions && <div className="ch-actions">
            {r.status === "now" && <span className={`ch-saved${v.saveBad ? " ch-note-bad" : ""}`} role="status">{v.saveBad ? v.saveError : v.saveText || "Saves as you go"}</span>}
            {r.next
              ? <button type="button" className="ch-next" onClick={r.next}>Next section: {r.nextLabel}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              : <button type="button" className="ch-btn ch-finish" onClick={ch.finish.go}>Finish the call</button>}
          </div>}
          {sectionActions && !r.next && ch.finish.ask && <div className="ch-note ch-note-bad ch-finish-ask" role="alert"><strong>{ch.finish.askText}</strong><ul>{(ch.finish.missing || []).map((item: any) => <li key={item.label}><button type="button" className="ch-missing-link" onClick={item.go}>{item.label} →</button></li>)}</ul></div>}
        </section>
      ))}
    </div>
  );
}

const STATUS_WORD: Record<string, string> = { done: "Done", now: "Do this now", needs: "Needs an answer", todo: "Not started" };
