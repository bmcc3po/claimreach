"use client";
// ============================================================================
// Simple form (Brett, Sep 28): the print layout as a working view. One flat
// page, every question a plain row — label on the left, answer on the right —
// zero chrome, for agents who don't want the fancy views. Same engine, same
// answers, same controls; the frame around it (caller rail, helper, bottom
// bar) is the shared IntakeWorkspace, so tools stay one click away.
// ============================================================================
import { useEffect } from "react";
import IntakeQuestion, { QuestionControl, AgreementRecipient } from "./IntakeQuestion";
import { OPEN_TONE, openGreeting, openLine, OPEN_CUE, OPEN_LINE, MONEY, SEND_LINE, STAY, SIGNED, walkThrough, NO_DEAD_AIR, closeLines, CLOSE_CUE } from "./scripts";
import PlaceField from "./PlaceField";
import { DobField, SsnField } from "./SsnDob";
import { SsnRefusal } from "./SsnRefusal";
import AgreementChoice from "./AgreementChoice";
import SignedInlineReview from "./SignedInlineReview";
import SignatureWaiting from "./SignatureWaiting";
import ContractActions from "./ContractActions";
import PassengerAgreement from "./PassengerAgreement";

// Plain radio buttons (checkboxes for a pick-several question), like the
// firm report: no pills (Brett, Sep 28).
function Chips({ opts, multi }: { opts: any[]; multi?: boolean }) {
  return (
    <div className="sf-chips sf-radios">
      {(opts || []).map((o: any, i: number) => (
        <label key={i} className={`sf-radio${o.on ? " sf-on" : ""}`}>
          <input type={multi ? "checkbox" : "radio"} checked={!!o.on} onChange={() => {}} onClick={o.pick} />
          <span>{o.label}{!!o.sub && <small> {o.sub}</small>}</span>
        </label>
      ))}
    </div>
  );
}

function IdentityRows({ v }: { v: any }) {
  return (<>
    {v.sendReady && <div className="sf-row"><span className="sf-l">Identity details</span><div className="sf-c sf-mini">DOB and SSN are optional before sending. Enter them now or after the client signs.</div></div>}
    <div className={`sf-row${!v.sendReady && !v.f.dob.value ? " sf-need" : ""}`}><label className="sf-l">Date of birth</label><div className="sf-c"><DobField cls="ch" value={v.f.dob.value ?? ""} onChange={(t: string) => v.f.dob.set({ target: { value: t } })} /></div></div>
    <div className="sf-row"><label className="sf-l">Social Security number</label><div className="sf-c"><SsnField cls="ch" value={v.f.ssn.value ?? ""} requireFull={!!v.ssnRequireFull} storedMode={v.f.ssnMode.value ?? null} onMode={(m: string) => v.f.ssnMode.set({ target: { value: m } })} onChange={(t: string) => v.f.ssn.set({ target: { value: t } })} savedMode={v.identitySavedMode} saveStatus={v.identityStatus} saveError={v.identitySaveError} onRetry={v.identityRetry} /><SsnRefusal v={v} /></div></div>
  </>);
}

/** The retainer block, form-plain: signer, injured, how it sends, send. */
function SendBlock({ v, where }: { v: any; where: any }) {
  return (
    <div className="sf-rows">
      <div className={`sf-row${v.agreementKnown ? "" : " sf-need"}`}><label className="sf-l">Agreement</label><div className="sf-c">
        <b>{v.agreement}</b>
        {!v.agreementKnown && where && (<>
          <div className="sf-mini">The agreement follows the state where the wreck happened, not the home address</div>
          <QuestionControl c={where.c} v={v} presentation="form" />
        </>)}
      </div></div>
      <div className="sf-row"><label className="sf-l">Signer&apos;s full name</label><div className="sf-c"><input className="sf-in" aria-label="Signer's full name" value={v.f.client.value ?? ""} onChange={v.f.client.set} /></div></div>
      <div className="sf-row"><label className="sf-l">Injured person</label><div className="sf-c">
        <Chips opts={(v.injuredWho || []).map((c: any) => ({ label: c.label, on: / on/.test(c.cls), pick: c.pick }))} />
        {v.injuredOther && <input className="sf-in" aria-label="Injured person's full name" placeholder="Injured person's full name" value={v.f.injured.value ?? ""} onChange={v.f.injured.set} />}
      </div></div>
      <div className="sf-row"><div className="sf-l" aria-hidden="true"></div><div className="sf-c"><AgreementChoice v={v} /></div></div>
      <div className="sf-row"><label className="sf-l">Send it by</label><div className="sf-c">
        <Chips opts={(v.via || []).map((c: any) => ({ label: c.label, on: / on/.test(c.cls), pick: c.pick }))} />
        <AgreementRecipient v={v} presentation="form" />
      </div></div>
      <IdentityRows v={v} />
      <div className="sf-row sf-send"><label className="sf-l" aria-hidden="true"></label><div className="sf-c">
        {!!v.previewHref && <a className="sf-link" href={v.previewHref} target="_blank" rel="noopener">Preview the agreement</a>}
        {v.hasSendError && <div className="sf-bad">{v.sendError}</div>}
        {v.sendWarn && <div className="sf-bad">{v.sendWarnText}</div>}
        {v.sendReady
          ? <button type="button" className="sf-btn sf-go" disabled={!!v.sendNext.disabled} onClick={v.sendNext.go}>Send the agreement</button>
          : <div className="sf-steps">{(v.sendSteps || []).map((st: any, i: number) => <span key={i} className={/done/.test(st.cls) ? "sf-st sf-st-on" : "sf-st"}>{st.label}<small>{/done/.test(st.cls) ? "Done" : "Not yet"}</small></span>)}</div>}
      </div></div>
    </div>
  );
}

/** After the send: where the agreement is, then the File (DOB, SSN, complete
 *  it, home address, license, emergency contact), each passenger's own
 *  agreement, and Finish. Plain rows like the rest of the form; nothing is
 *  hidden behind a view switch (Astra round 6, Brett Sep 28). */
function FileBlock({ v, finish }: { v: any; finish: any }) {
  const row = (label: string, body: any, need = false, key = label) => (
    <div key={key} className={`sf-row${need ? " sf-need" : ""}`}><label className="sf-l">{label}</label><div className="sf-c">{body}</div></div>
  );
  const chips = (list: any[]) => <Chips opts={(list || []).map((c: any) => ({ label: c.label, on: / on/.test(c.cls), pick: c.pick }))} />;
  return (<>
    {v.sendLive && (
      <div className="sf-rows" style={{ marginBottom: 12 }}>
        {row("Agreement status", (<>
          <div className="sf-steps">{(v.sendSteps || []).map((st: any, i: number) => {
            const done = /done/.test(st.cls);
            return <span key={i} className={done ? "sf-st sf-st-on" : "sf-st"}>{st.label}<small>{done ? "Done" : "Not yet"}</small></span>;
          })}</div>
          {v.hasSendError && <div className="sf-bad">{v.sendError}</div>}
          <div className="sf-addrow" style={{ marginTop: 8 }}>
          </div>
        </>))}
      </div>
    )}
    <div className="sf-rows">
      {!v.sendReady && <IdentityRows v={v} />}
      {row("Finish the agreement", (<>
        {v.agreementOpen && (
          <div className="sf-addrow">
            <button type="button" className="sf-btn" disabled={!!v.agreementLocked} onClick={v.completeAgreement}>{v.completeLabel}</button>
            <button type="button" className="sf-btn sf-line" onClick={v.leaveForQa}>Finish later</button>
          </div>
        )}
        {v.agreementClosed && <div>{v.agreementNote}</div>}
        {v.agreementParked && <button type="button" className="sf-btn sf-line" style={{ marginTop: 6 }} onClick={v.reopenAgreement}>Reopen and finish it now</button>}
        {v.hasFileError && <div className="sf-bad">{v.fileError}</div>}
      </>))}
      {!v.clientContact && row("Home address", <PlaceField kind="address" label="Home address" placeholder="Start typing, pick the match" value={v.f.addr.value ?? ""} onChange={(t: string) => v.f.addr.set({ target: { value: t } })} />, !v.f.addr.value)}
      {row("Driver's license", <input className="sf-in" aria-label="Driver's license number" value={v.f.dl.value ?? ""} onChange={v.f.dl.set} />)}
      {row("Emergency contact", (<>
        <div className="sf-addrow">
          <input className="sf-in" placeholder="Name" aria-label="Emergency contact name" value={v.f.ecName.value ?? ""} onChange={v.f.ecName.set} />
          <input className="sf-in" type="tel" inputMode="tel" placeholder="Phone" aria-label="Emergency contact phone" value={v.f.ecPhone.value ?? ""} onChange={v.f.ecPhone.set} />
        </div>
        <div style={{ marginTop: 6 }}>{chips(v.ecRel)}</div>
      </>))}
      {(v.paxSend || []).map((p: any) => <PassengerAgreement key={p.id} p={p} v={v} />)}
    </div>
    {finish && (
      <div className="sf-rows" style={{ marginTop: 12 }}>
        <div className="sf-row sf-send"><label className="sf-l">{v.saveBad ? <span className="sf-bad">{v.saveError}</span> : (v.saveText || "Saves as you go")}</label><div className="sf-c">
          <button type="button" className="sf-btn sf-go" disabled={!!finish.disabled} onClick={finish.go}>{finish.label || "Finish the call"}</button>
          {finish.ask && <div className="sf-bad" role="alert"><strong>{finish.askText}</strong><ul>{(finish.missing || []).map((item: any) => <li key={item.label}><button type="button" className="ch-missing-link" onClick={item.go}>{item.label} →</button></li>)}</ul></div>}
        </div></div>
      </div>
    )}
  </>);
}

export default function FormView({ v }: { v: any }) {
  const fi = v.fi;
  useEffect(() => {
    const target = fi.target ? document.getElementById(`sf-q-${fi.target}`) : null;
    const el = target || document.getElementById(`sf-sec-${fi.openSec}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: target ? "center" : "start" }));
  }, [fi.jump]); // eslint-disable-line react-hooks/exhaustive-deps
  const secQs = (id: string) => (fi.sections.find((s: any) => s.id === id) || { questions: [] }).questions;
  // The crash-place question, wherever its section keeps it, so the send
  // block can ask it when the agreement is still unknown.
  const where = (fi.sections || []).flatMap((x: any) => x.questions || []).find((q: any) => q?.c?.kind === "where") || null;
  const rows = fi.chore?.rows || [];
  return (
    <div className="sf">
      {rows.map((r: any) => (
        <section key={r.id} id={`sf-sec-${r.id}`} className="sf-sec" onPointerDownCapture={r.enter} onFocusCapture={r.enter}>
          <h2 className="sf-h">{r.label}</h2>
          {r.id === "incident" && <div className="iq-script"><div className="iq-field-label">{OPEN_TONE}</div><p>{openGreeting(v.callerFirst)}</p><p>{openLine(v.callerFirst, v.agentFirst, v.firmSpoken)}</p><div className="iq-cue">{OPEN_CUE} Then stop talking. {OPEN_LINE.cue}</div></div>}
          {r.id === "retainer" ? (<>{v.clientContact}<ContractActions key={v.agreementId || v.agreementStatus} v={v} />
            {v.sendReady ? <div className="iq-script"><div className="iq-field-label">{MONEY.label}</div><p>{MONEY.line}</p><div className="iq-cue">{MONEY.cue}</div><p>{SEND_LINE}</p></div> : v.notSigned ? <div className="iq-script"><div className="iq-field-label">{STAY.label}</div><p>{STAY.line}</p>{walkThrough(v.firmSpoken).map((line: string, i: number) => <p key={i}>{line}</p>)}<div className="iq-cue">{NO_DEAD_AIR.map((line: string, i: number) => <p key={i}>{line}</p>)}</div></div> : <div className="iq-script"><div className="iq-field-label">{SIGNED.label}</div><p>{SIGNED.line}</p><div className="iq-cue">{SIGNED.cue}</div></div>}
            {v.signed && <SignedInlineReview v={v} />}
            <SignatureWaiting v={v} />
            {v.sendReady && <SendBlock v={v} where={where} />}
            {!!v.currentAgreement && <div className="cc-agreement-current"><span>Contract already sent</span><strong>{v.currentAgreement.label}</strong></div>}
            <FileBlock v={v} finish={r.next ? null : fi.chore?.finish} />
            {v.signed && <div className="iq-script">{closeLines(v.callerFirst, v.firmSpoken).map((line: string, i: number) => <p key={i}>{line}</p>)}<div className="iq-cue">{CLOSE_CUE}</div></div>}
          </>) : (
            <div className="sf-rows">
              {r.id === "treatment" && !!fi.sections.find((s: any) => s.id === r.id)?.gap && <div className="iq-cue"><b>30-day check: {fi.sections.find((s: any) => s.id === r.id).gap.value}</b> {fi.sections.find((s: any) => s.id === r.id).gap.sub}</div>}
              {secQs(r.id).map((q: any) => (
                <IntakeQuestion key={q.id} q={q} v={v} presentation="form" />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
