"use client";
// Generated from the approved Design-canvas prototype (Main.dc.html) by
// port/convert.py, then checked in. The prototype is the source of truth for
// layout; `v` comes from CallEngine.renderVals() so markup and logic stay 1:1.
import { Fragment } from "react";
import PlaceField from "./PlaceField";
import WhereField from "./WhereField";
import { FiBody } from "./FullIntake";
import { WsLeft, WsHelper, IxTop, IxFoot } from "./IntakeWorkspace";
import ChoreList from "./ChoreList";
import StepByStep from "./StepByStep";
import FormView from "./FormView";
import { GuidedIntake } from "./OneQuestion";
import IntakeQuestion, { AgreementRecipient, QuestionControl } from "./IntakeQuestion";
import { DobField, SsnField } from "./SsnDob";
import { SsnRefusal } from "./SsnRefusal";
import FinalHandoff from "./FinalHandoff";
import AgreementChoice from "./AgreementChoice";
import SignedInlineReview from "./SignedInlineReview";
import SignatureWaiting from "./SignatureWaiting";
import { OPEN_TONE, openGreeting, openLine, OPEN_CUE, MONEY, SEND_LINE, STAY, walkThrough, NO_DEAD_AIR, SIGNED, closeLines, CLOSE_CUE } from "./scripts";

export function cx(cls: string | null | undefined): string {
  return String(cls || "").split(/\s+/).filter(Boolean).map((t) => "cc-" + t).join(" ");
}

function Chev({ open }: { open: boolean }) {
  return <svg className={`cc-chev${open ? " cc-up" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>;
}

// A visit date: the quick picks sit above, this takes any other day.
function DateBox({ q }: { q: any }) {
  return (<>
    <label className="cc-datebox"><span>Or pick the date</span>
      <input className="cc-field" type="date" min={q.date.min || undefined} max={q.date.max || undefined} aria-label="Visit date" value={q.date.value ?? ""} onChange={q.date.set} />
    </label>
    {!!q.dateWhy && <div className="cc-cue cc-red" style={{ marginTop: 0 }}>{q.dateWhy}</div>}
  </>);
}

// The 30-day check, worked out from the crash date and the PNC's visits. A row in
// the list: the short answer on the right, the why under it.
function GapCard({ g, alone }: { g: any; alone?: boolean }) {
  const row = (
    <div className={cx(g.cls)} role="status">
      <div className="cc-frow-h"><span className="cc-frow-k">30-day check</span><span className="cc-frow-v">{g.value}</span></div>
      {!!g.sub && <div className="cc-frow-sub">{g.sub}</div>}
    </div>
  );
  return alone ? <div className="cc-flist">{row}</div> : row;
}

function IdentityFields({ v }: { v: any }) {
  return (<>
    {v.sendReady && <div className="cc-cue">DOB and SSN are optional before sending. Enter them now or after the client signs.</div>}
    <div><div className="cc-lab">DATE OF BIRTH</div><DobField value={v.f.dob.value ?? ""} onChange={(t: string) => v.f.dob.set({ target: { value: t } })} /></div>
    <div><div className="cc-lab">SSN</div><SsnField value={v.f.ssn.value ?? ""} requireFull={!!v.ssnRequireFull} storedMode={v.f.ssnMode.value ?? null} onMode={(m: string) => v.f.ssnMode.set({ target: { value: m } })} onChange={(t: string) => v.f.ssn.set({ target: { value: t } })} savedMode={v.identitySavedMode} saveStatus={v.identityStatus} saveError={v.identitySaveError} onRetry={v.identityRetry} /><SsnRefusal v={v} /></div>
  </>);
}

export default function CallView({ v }: { v: any }) {
  // One frame for Guided, Collapsible and All questions (IntakeWorkspace.tsx):
  // the same header, progress bar, view switch, call strip and bottom bar.
  // Only the intake content changes with the view.
  const wide = !!v.ws;
  const view = v.stepView ? "steps" : v.formView ? "form" : v.choreView ? "chore" : v.fullView ? "full" : "guided";
  const cls = ["cc-app", "ix", `ix-${view}`, `ix-v-${v.view}`, wide ? `ws ws-${v.ws}` : "ix-narrow", v.choreView || v.stepView ? "ch-mode" : "", v.formView ? "sf-mode" : "", v.fullView ? "fi-mode" : ""].filter(Boolean).join(" ");
  return (
<div className={cls}>
{wide && <WsLeft v={v} />}
<IxTop v={v} />
<main className={`cc-main ix-main${v.fullView ? " fi-main" : ""}${v.choreView || v.stepView ? " ch-main" : ""}`}>
{!!v.sendHoldNotice && <div className="cc-stop" role="status"><strong>{v.sendHoldNotice.startsWith("Send outcome unconfirmed") ? "Send outcome unconfirmed" : "Signing actions paused"}</strong><p>{v.sendHoldNotice}</p>{(v.reconcileActions || []).map((action: any) => <button type="button" key={action.label} className="cc-btn" disabled={!!v.reconcileBusy} onClick={action.go}>{v.reconcileBusy ? "Checking" : action.label}</button>)}{!!v.reconcileMessage && <p>{v.reconcileMessage}</p>}</div>}
{!!v.nameReview && <div className="cc-stop" role="status"><p>{v.nameReview}</p>{v.canUseRecordName && <button type="button" className="cc-btn" onClick={v.useRecordName}>{v.canReplace ? "Use corrected PNC name" : "Use PNC name"}</button>}{v.canReplace && <button type="button" className="cc-btn" onClick={() => v.jumpTo("send")}>Review corrected agreement below</button>}</div>}
{!!v.emergencyNotice && <div className="cc-stop" role="status"><p>{v.emergencyNotice}</p>{v.prepareResign && <button type="button" className="cc-btn" onClick={v.prepareResign}>Prepare DocuSeal re-sign</button>}</div>}
{!!(v.choreView) && <ChoreList v={v} />}
{!!v.stepView && <StepByStep v={v} />}
{!!(v.formView) && <FormView v={v} />}
{!!(v.fullView) && <FiBody v={v} />}
{!!v.guidedQuestions && <GuidedIntake v={v} />}
{!v.choreView && !v.formView && !v.stepView && (<>
{!!(v.bare) && (<>
{(v.bareRows || []).map((r: any, i6: number) => (<Fragment key={i6}>
{!!(r.isGroup) && (<><div id={r.id} className="cc-q-g">{r.label}</div></>)}
{!!(r.isChips) && (<><div className="cc-q-r"><div className={cx(r.lcls)}>{r.label}</div><div className={cx(r.chipsCls)}>{(r.chips || []).map((c: any, i7: number) => (<Fragment key={i7}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div></div></>)}
{!!(r.isInput) && (<><div className="cc-q-r"><div className={cx(r.lcls)}>{r.label}</div><input className="cc-field" type={r.type} inputMode={r.mode} placeholder={r.ph} aria-label={r.label} value={r.value ?? ""} onChange={r.set} /></div></>)}
{!!(r.isSelect) && (<><div className="cc-q-r"><div className="cc-q-l">{r.label}</div><select className="cc-field" aria-label={r.label} value={r.value ?? ""} onChange={r.set}>{(r.options || []).map((o: any, i8: number) => (<Fragment key={i8}><option value={o ?? ""}>{o}</option></Fragment>))}</select></div></>)}
{!!(r.isInfo) && (<><div className="cc-q-i"><span>{r.label}</span><b>{r.value}</b></div></>)}
{!!(r.isGap) && <GapCard g={r.g} alone />}
{!!(r.isSteps) && (<><div className="cc-steps">{(r.steps || []).map((st: any, i9: number) => (<Fragment key={i9}><div className={cx(st.cls)}>{st.label}</div></Fragment>))}</div></>)}
{!!(r.isButton) && (<><button className="cc-btn cc-full" disabled={!!r.disabled} onClick={r.go}>{r.label}</button></>)}
{!!(r.isPerson) && (<>
<div className="cc-q-p">
<div style={{display: "flex", gap: "8px", alignItems: "center"}}><input className="cc-field" type="text" placeholder="Name" aria-label="Passenger name" value={r.p.name ?? ""} onChange={r.p.setName} /><button className="cc-x" onClick={r.p.remove} aria-label="Remove passenger">Remove</button></div>
<div className="cc-chips cc-seg">{(r.p.ages || []).map((c: any, i10: number) => (<Fragment key={i10}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-chips cc-seg">{(r.p.hurts || []).map((c: any, i11: number) => (<Fragment key={i11}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
</div>
</>)}
</Fragment>))}
</>)}

{!!(v.showOpen) && (<>
{!!(v.free) && (<><div id="fs-open" className="cc-sec-h">Open</div></>)}
<div className="cc-say">
<div className="cc-tone">{OPEN_TONE}</div>
<div className="cc-say-line cc-sm">{openGreeting(v.callerFirst)}</div>
<div className="cc-say-line" style={{marginTop: "10px"}}>{openLine(v.callerFirst, v.agentFirst, v.firmSpoken)}</div>
<div className="cc-cue">{OPEN_CUE}</div>
</div>
<div>
<div className="cc-lab">IF SHE ASKS FIRST</div>
<div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
{(v.openers || []).map((o: any, i12: number) => (<Fragment key={i12}>
<button className={cx(o.cls)} onClick={o.toggle}><span>{o.title}</span><span className="cc-rb-tag">{o.hint}</span></button>
{!!(o.open) && (<>
<div className="cc-reb"><div className="cc-reb-t">{o.text}</div></div>
</>)}
</Fragment>))}
</div>
</div>
</>)}

{!!(v.showStory) && (<>
{!!(v.free) && (<><div id="fs-story" className="cc-sec-h">Story</div></>)}
<div className="cc-say">
<div className="cc-say-label">Say, then stop talking</div>
<div className="cc-say-line">Tell me what happened.</div>
<div className="cc-cue">Let the PNC run. Tap what you hear.</div>
</div>
{!!(v.hasLead) && (<>
<button className={`cc-leadline${v.leadOpen ? " cc-on" : ""}`} onClick={v.toggleLead} aria-expanded={!!v.leadOpen} aria-label="What the marketer sent">
<span className="cc-leadline-k">From the lead</span>
<span className="cc-leadline-t">{(v.leadTags || []).map((t: any) => t.label).join(", ") || v.leadFrom}</span>
<Chev open={!!v.leadOpen} />
</button>
{!!(v.leadOpen) && (<div className="cc-leadmore">
{!!(v.leadSaid) && <div className="cc-lead-said">{v.leadSaid}</div>}
{!!(v.leadFrom) && <div className="cc-cue" style={{marginTop: 0}}>{v.leadFrom}. What the PNC told the marketer, so confirm it with them.</div>}
</div>)}
</>)}
<div className="cc-flist" role="list" aria-label="The crash">
{(v.storyRows || []).map((r: any) => (<div key={r.key} className={cx(r.cls)} role="listitem">
<button className="cc-frow-h" onClick={r.toggle} aria-expanded={!!r.open}>
<span className="cc-frow-k">{r.label}</span>
<span className="cc-frow-v">{r.value}</span>
<Chev open={!!r.open} />
</button>
{!!(r.sub) && <div className="cc-frow-sub">{r.sub}</div>}
{!!(r.open) && (<div className="cc-frow-b">
{!!(r.ask) && <div className="cc-ask"><span className="cc-ask-k">If the PNC didn't say it, ask</span><span className="cc-ask-l">{r.ask}</span></div>}
{!!(r.isCity) && <WhereField value={v.storyWhere.value} agreement={v.agreement} onChange={v.storyWhere.set} onDone={v.storyWhere.done} />}
{!!(r.isWhen) && (<>
<div className="cc-chips cc-seg">{(v.storyWhen.chips || []).map((c: any, i: number) => (<button key={i} className={cx(c.cls)} onClick={c.pick}>{c.label}</button>))}</div>
{!!(v.storyWhen.pickDate) && <input className="cc-field" type="date" max={v.storyWhen.date.max} aria-label="Date of the wreck" value={v.storyWhen.date.value ?? ""} onChange={v.storyWhen.date.set} />}
</>)}
{!!(r.isSeat) && (<>
<div className="cc-chips cc-seg">{(v.storySeat || []).map((c: any, i: number) => (<button key={i} className={cx(c.cls)} onClick={c.pick}>{c.label}</button>))}</div>
{!!(v.seatOther) && <input className="cc-field" type="text" placeholder="Explain" aria-label="Explain the PNC's role in the crash" value={v.f.seatOther.value ?? ""} onChange={v.f.seatOther.set} />}
</>)}
{!!(r.isFault) && (<>
<div className="cc-chips cc-seg">{(v.storyFault || []).map((c: any, i: number) => (<button key={i} className={cx(c.cls)} onClick={c.pick}>{c.label}</button>))}</div>
{!!(v.faultCaller) && <div className="cc-cue cc-red" style={{marginTop: 0}}>Do not go hunting.</div>}
</>)}
{!!(r.isPolice) && <div className="cc-chips cc-seg">{(v.storyPolice || []).map((c: any, i: number) => (<button key={i} className={cx(c.cls)} onClick={c.pick}>{c.label}</button>))}</div>}
</div>)}
</div>))}
</div>
{!!(v.solHas) && (<><div className={cx(v.solCls)} style={{marginTop: "-8px"}}>{v.solText}</div></>)}
{!!(v.solClose) && (<><div className="cc-cue cc-red" style={{marginTop: "-14px"}}>Inside 90 days. Get a supervisor before you sign or decline.</div></>)}
<div>
<div className="cc-lab">NOTES</div>
<textarea className="cc-area" rows={2} placeholder="Tap the mic on your keyboard and say it" aria-label="Short outline of the story" value={v.f.text.value ?? ""} onChange={v.f.text.set}></textarea>
</div>
<div className="cc-quiet">
<span>Lines</span>
<button onClick={v.openCommon}>Common ground</button>
<button onClick={v.openRamble}>The PNC won't stop talking</button>
</div>
</>)}

{!!(v.showBodyGuided) && (<>
<div className="cc-flist" role="list" aria-label="Body">
{(v.bodyRows || []).map((r: any) => (<Fragment key={r.key}>
<div className={cx(r.cls)} role="listitem">
<button className="cc-frow-h" onClick={r.open} aria-expanded={!!r.now}>
<span className="cc-frow-k">{r.label}</span>
<span className="cc-frow-v">{r.value}</span>
<Chev open={!!r.now} />
</button>
{!!(r.now && r.q) && (<div className="cc-frow-b">
<div className="cc-qline">{r.q.line}</div>
<div className={cx(r.q.chipsCls)}>{(r.q.chips || []).map((c: any, i: number) => (<button key={i} className={cx(c.cls)} onClick={c.pick}>{c.label}</button>))}</div>
{!!(r.q.note) && (<div className="cc-qnote">
<div className="cc-lab">{r.q.note.label}</div>
<textarea className="cc-area" rows={3} placeholder={r.q.note.ph} aria-label={r.q.note.label} value={r.q.note.value ?? ""} onChange={r.q.note.set} />
</div>)}
{!!(r.q.isDate) && <DateBox q={r.q} />}
{!!(r.q.multi) && <button className="cc-btn cc-soft cc-rowbtn" onClick={r.q.next}>{r.q.nextLabel}</button>}
{!!(r.q.cue) && <div className="cc-cue" style={{marginTop: 0}}>{r.q.cue}</div>}
{!!(r.key === "pain" && v.sayingFine) && (<div className="cc-reb">
<div className="cc-reb-k">The PNC is downplaying. Do not move past it.</div>
<div className="cc-reb-t">{v.soreness}</div>
</div>)}
</div>)}
</div>
{!!(r.key === "seen" && v.gapCard.show) && <GapCard g={v.gapCard} />}
</Fragment>))}
</div>
{!!(v.repYes) && (<>
<div className={cx(v.rep.cls)}>
<div className="cc-say-label">{v.rep.head}</div>
{!!(v.rep.plain) && (<><div className="cc-say-line">Okay, good, then you're in good hands. Let me get out of your hair.</div></>)}
<div className="cc-cue">Do not go looking for it. The PNC has to be the one who says they're unhappy.</div>
<div className="cc-chips cc-list">{(v.rep.unhappy || []).map((c: any, i18: number) => (<Fragment key={i18}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.rep.isUnhappy) && (<>
<div className="cc-lab" style={{marginTop: "10px"}}>WHAT DOES IT SOUND LIKE</div>
<div className="cc-chips cc-list">{(v.rep.kind || []).map((c: any, i19: number) => (<Fragment key={i19}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.rep.fender) && (<><div className="cc-cue">The firm charges these back. Close it warm and let it go.</div></>)}
{!!(v.rep.good) && (<>
<div className="cc-say-line cc-sm" style={{marginTop: "10px"}}>I'm sorry to hear that, that's frustrating.</div>
<div className="cc-say-line cc-sm" style={{marginTop: "6px"}}>I'm not going to tell you to leave your attorney, that's not my call and it's not my place. What I can tell you is you're allowed to choose who represents you, and that doesn't change today or tomorrow.</div>
<div className="cc-cue">Then keep going and sign the PNC. Never say their attorney is bad, never tell them to fire anybody, never say they'd do better with us. Write down what they said, in their words.</div>
</>)}
</>)}
</div>
</>)}
</>)}

{!!(v.showBodyFree) && (<>
<div id="fs-body" className="cc-sec-h">Body</div>
{!!(v.repYes) && (<>
<div className={cx(v.rep.cls)}>
<div className="cc-say-label">{v.rep.head}</div>
{!!(v.rep.plain) && (<><div className="cc-say-line">Okay, good, then you're in good hands. Let me get out of your hair.</div></>)}
<div className="cc-cue">Do not go looking for it. The PNC has to be the one who says they're unhappy.</div>
<div className="cc-chips cc-list">{(v.rep.unhappy || []).map((c: any, i21: number) => (<Fragment key={i21}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.rep.isUnhappy) && (<>
<div className="cc-lab" style={{marginTop: "10px"}}>WHAT DOES IT SOUND LIKE</div>
<div className="cc-chips cc-list">{(v.rep.kind || []).map((c: any, i22: number) => (<Fragment key={i22}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.rep.fender) && (<><div className="cc-cue">The firm charges these back. Close it warm and let it go.</div></>)}
{!!(v.rep.good) && (<>
<div className="cc-say-line cc-sm" style={{marginTop: "10px"}}>I'm sorry to hear that, that's frustrating.</div>
<div className="cc-say-line cc-sm" style={{marginTop: "6px"}}>I'm not going to tell you to leave your attorney, that's not my call and it's not my place. What I can tell you is you're allowed to choose who represents you, and that doesn't change today or tomorrow.</div>
<div className="cc-cue">Then keep going and sign the PNC. Never say their attorney is bad, never tell them to fire anybody, never say they'd do better with us. Write down what they said, in their words.</div>
</>)}
</>)}
</div>
</>)}
{(v.bodyAll || []).map((x: any, i23: number) => (<Fragment key={i23}>
<div className={cx(x.cls)}>
<div className="cc-item-l">{x.line}</div>
<div className={cx(x.chipsCls)}>{(x.chips || []).map((c: any, i24: number) => (<Fragment key={i24}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(x.note) && (<div className="cc-qnote">
<div className="cc-lab">{x.note.label}</div>
<textarea className="cc-area" rows={3} placeholder={x.note.ph} aria-label={x.note.label} value={x.note.value ?? ""} onChange={x.note.set} />
</div>)}
{!!(x.isDate) && <DateBox q={x} />}
</div>
{!!(x.key === "seen" && v.gapCard.show) && <GapCard g={v.gapCard} alone />}
</Fragment>))}
{!!(v.sayingFineFree) && (<>
<div className="cc-reb">
<div className="cc-reb-k">The PNC is downplaying. Do not move past it.</div>
<div className="cc-reb-t">{v.soreness}</div>
</div>
</>)}
</>)}

{!!(v.showCar) && (<>
{!!(v.free) && (<><div id="fs-car" className="cc-sec-h">Car</div></>)}
<div className="cc-say">
<div className="cc-say-label">Say</div>
<div className="cc-say-line">Who else was in the car with you?</div>
<div className="cc-cue">Ask when possible. If there was a passenger, add them to their own file and agreement.</div>
</div>
<div className="cc-chips cc-list">
<button className={cx(v.justMeCls)} onClick={v.justMe}>Just me</button>
<button className="cc-chip cc-add" onClick={v.addPerson}>Add a passenger</button>
</div>
{(v.people || []).map((p: any, i25: number) => (<Fragment key={i25}>
<div className="cc-card">
<div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}><span className="cc-card-h">{p.title}</span><button className="cc-x" onClick={p.remove} aria-label="Remove passenger">Remove</button></div>
<input className="cc-field" type="text" placeholder="First name" aria-label="Passenger first name" value={p.name ?? ""} onChange={p.setName} />
<div className="cc-chips cc-list">{(p.rels || []).map((c: any, i26: number) => (<Fragment key={i26}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-lab" style={{marginTop: "8px"}}>AGE</div>
<div className="cc-chips cc-seg">{(p.ages || []).map((c: any, i27: number) => (<Fragment key={i27}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-line">Okay, and how are they doing? Any soreness, any trouble sleeping, anything like that?</div>
<div className="cc-lab">HURT</div>
<div className="cc-chips cc-seg">{(p.hurts || []).map((c: any, i28: number) => (<Fragment key={i28}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(p.ownFile) && (<>
<span className="cc-tag">Own file and own agreement after {v.callerFirst} signs</span>
{!p.minor && (<>
<div className="cc-lab" style={{marginTop: "8px"}}>{p.first.toUpperCase()}&apos;S OWN CELL</div>
<input className="cc-field" type="tel" inputMode="tel" placeholder="Their agreement texts to THEIR phone" aria-label={`${p.first}'s cell`} value={p.cell.value ?? ""} onChange={p.cell.set} />
</>)}
<div className="cc-lab" style={{marginTop: "8px"}}>WANTS REPRESENTATION</div>
<div className="cc-chips cc-seg">{(p.wantsReps || []).map((c: any, i28b: number) => (<Fragment key={i28b}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-lab" style={{marginTop: "8px"}}>WILLING TO TREAT</div>
<div className="cc-chips cc-seg">{(p.willings || []).map((c: any, i28c: number) => (<Fragment key={i28c}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-lab" style={{marginTop: "8px"}}>HOME ADDRESS</div>
<div className="cc-chips cc-seg">{(p.sameAddrs || []).map((c: any, i28d: number) => (<Fragment key={i28d}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-cue" style={{marginTop: "4px"}}>Their file opens prefilled from this call: same wreck, same day, linked to this file both ways.</div>
</>)}
</div>
</Fragment>))}
</>)}

{!!(v.showMoney) && (<>
{!!(v.free) && (<><div id="fs-money" className="cc-sec-h">How we work</div></>)}
<div className="cc-say">
<div className="cc-say-label">{MONEY.label}</div>
<div className="cc-say-line">{MONEY.line}</div>
<div className="cc-cue">{MONEY.cue}</div>
</div>
{!!v.showFees && (<>
<div className="cc-card">
<span className="cc-card-h">Only if the PNC insists on the split</span>
<div className="cc-cue" style={{marginTop: "0"}}>Tell them straight, it's in the agreement they're about to read. Then reask.</div>
{(v.fees || []).map((fe: any, i29: number) => (<Fragment key={i29}><div className="cc-done-row" style={{cursor: "default", padding: "0"}}><span className="cc-done-k">{fe.k}</span><span className="cc-done-v">{fe.v}</span></div></Fragment>))}
<div className="cc-cue" style={{marginTop: "0"}}>{v.feeNote}</div>
</div>
</>)}

</>)}

{!!(v.showSend) && (<>
{!!(v.free) && (<><div id="fs-send" className="cc-sec-h">Send</div></>)}
{!!(v.sendReady) && (<>
<div className="cc-say">
<div className="cc-say-label">Say</div>
<div className="cc-say-line cc-sm">{SEND_LINE}</div>
</div>
<div className="cc-agr"><span>Attorney</span><b>{v.firmSpoken}</b></div>
<div className="cc-agr"><span>Agreement</span><b>{v.agreement}</b></div>
{!!(v.needState) && (<div>
<div className="cc-lab">WHERE WAS THE WRECK</div>
<WhereField value={v.f.city.value ?? ""} agreement={v.agreement} onChange={(t: string) => v.f.city.set({ target: { value: t } })} />
</div>)}
{!!(v.needDoi) && (<div>
<div className="cc-lab">When</div>
<QuestionControl c={v.fi.sections.flatMap((s: any) => s.questions).find((q: any) => q.id === 'when').c} v={v} presentation="guided" />
<div className="cc-cue">It prints on the agreement.</div>
</div>)}
<div>
<div className="cc-lab">SIGNER</div>
<input className="cc-field" type="text" aria-label="Signer full name" value={v.f.client.value ?? ""} onChange={v.f.client.set} />
</div>
<div>
<div className="cc-lab">INJURED PERSON</div>
<div className="cc-chips cc-seg">{(v.injuredWho || []).map((c: any, i30: number) => (<Fragment key={i30}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.injuredOther) && (<><input className="cc-field" style={{marginTop: "8px"}} type="text" placeholder="Injured person's full name" aria-label="Injured person's full name" value={v.f.injured.value ?? ""} onChange={v.f.injured.set} /></>)}
</div>
<AgreementChoice v={v} />
<div>
<div className="cc-lab">SEND BY</div>
<div className="cc-chips cc-seg">{(v.via || []).map((c: any, i31: number) => (<Fragment key={i31}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-cue">{v.viaNote}</div>
<AgreementRecipient v={v} presentation="guided" />
</div>
{!(v.showFile && v.fsAgreement) && <div className="cc-card"><span className="cc-card-h">Identity details</span><IdentityFields v={v} /></div>}
{!!v.previewHref && <a className="cc-preview" href={v.previewHref} target="_blank" rel="noopener" onClick={v.onPreview}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></svg>Preview the agreement before you send it</a>}
{!!v.hasSendError && <div className="cc-stop"><div className="cc-cue cc-red" style={{marginTop: "0"}}>{v.sendError}</div></div>}
{!!(v.sendWarn) && (<><div className="cc-stop"><div className="cc-cue cc-red" style={{marginTop: "0"}}>{v.sendWarnText}</div></div></>)}
</>)}
{!!(v.sendLive) && (<>
{!!v.currentAgreement && <div className="cc-agreement-current"><span>Contract already sent</span><strong>{v.currentAgreement.label}</strong></div>}
<div className="cc-steps">{(v.sendSteps || []).map((st: any, i32: number) => (<Fragment key={i32}><div className={cx(st.cls)}>{st.label}</div></Fragment>))}</div>
<SignatureWaiting v={v} />
{v.canReplace && !v.signed && <details className="cc-card"><summary className="cc-card-h">Correct this agreement</summary><p className="cc-cue">The original stays in history. If the client signed it, the supervisor must review it before firm delivery.</p><AgreementChoice v={v} />{!!v.previewHref && <a className="cc-preview" href={v.previewHref} target="_blank" rel="noopener noreferrer">Preview corrected agreement</a>}<button type="button" className="cc-btn cc-full" disabled={!v.previewHref || v.contractChoice?.needReason} onClick={v.replaceAgreement}>Report error and send corrected agreement</button></details>}
{!!(v.notSigned) && (<>
<div className="cc-say">
<div className="cc-say-label">{STAY.label}</div>
<div className="cc-say-line cc-sm">{STAY.line}</div>
</div>
<div className="cc-card">
<div className="cc-lab" style={{marginBottom: "0"}}>WALK HER THROUGH IT</div>
{walkThrough(v.firmSpoken).map((t, i) => <div key={i} className="cc-line">{t}</div>)}
</div>
<div className="cc-card">
<div className="cc-lab" style={{marginBottom: "0"}}>NO DEAD AIR</div>
{NO_DEAD_AIR.map((t, i) => <div key={i} className="cc-line">{t}</div>)}
</div>
</>)}
{!!(v.signed) && (<>
<div className="cc-say cc-say-win">
<div className="cc-say-label">{SIGNED.label}</div>
<div className="cc-say-line">{SIGNED.line}</div>
<div className="cc-cue">{SIGNED.cue}</div>
</div>
<SignedInlineReview v={v} />
</>)}
</>)}
</>)}

{!!(v.showFile) && (<>
{v.signed && !v.showSend && !v.choreView && !v.formView && !v.stepView && <>
<div className="cc-say cc-say-win"><div className="cc-say-label">{SIGNED.label}</div><div className="cc-say-line">{SIGNED.line}</div><div className="cc-cue">{SIGNED.cue}</div></div>
<SignedInlineReview v={v} />
</>}
{!!(v.free) && (<><div id="fs-file" className="cc-sec-h">File and agreement details</div></>)}
{!!(v.guided) && (<>
<div className="cc-fsteps" role="tablist" aria-label="Finish the file">
{(v.fileTabs || []).map((c: any, i33: number) => (<Fragment key={i33}>
<button role="tab" aria-selected={!!c.on} className={cx(c.cls)} onClick={c.pick}><i>{c.done ? "\u2713" : c.n}</i><span>{c.label}</span></button>
</Fragment>))}
</div>
<div className="cc-cue" style={{marginTop: "-4px"}}>Work through each step. Tap one to open it.</div>
</>)}
{!!(v.fsAgreement) && (<>
<div className="cc-card">
<span className="cc-card-h">Finish the agreement</span>
<div className="cc-cue" style={{marginTop: "0"}}>These print on the HIPAA pages as the patient's. For a child, it's the child's.</div>
<IdentityFields v={v} />
{!!(v.agreementOpen) && (<>
<button className="cc-btn cc-full" disabled={!!v.agreementLocked} onClick={v.completeAgreement}>{v.completeLabel}</button>
<button className="cc-btn cc-soft" onClick={v.leaveForQa}>Finish later</button>
</>)}
{!!v.hasFileError && <div className="cc-cue cc-red">{v.fileError}</div>}
{!!(v.agreementClosed) && (<><span className="cc-tag">{v.agreementNote}</span></>)}
{!!(v.agreementParked) && (<><button className="cc-btn cc-soft" onClick={v.reopenAgreement}>Reopen and finish it now</button></>)}
</div>
</>)}
{!!(v.fsInfo) && (<>
<div className="cc-card">
<span className="cc-card-h">PNC info</span>
<div><div className="cc-lab">HOME ADDRESS</div><PlaceField kind="address" label="Home address" placeholder="Start typing, pick the match" value={v.f.addr.value ?? ""} onChange={(t: string) => v.f.addr.set({ target: { value: t } })} /><div className="cc-cue">Paste works here.</div></div>
<div><div className="cc-lab">DRIVER'S LICENSE</div><input className="cc-field" type="text" aria-label="Driver's license number" value={v.f.dl.value ?? ""} onChange={v.f.dl.set} /></div>
<div><div className="cc-lab">EMERGENCY CONTACT</div>
<div style={{display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px"}}><input className="cc-field" type="text" placeholder="Name" aria-label="Emergency contact name" value={v.f.ecName.value ?? ""} onChange={v.f.ecName.set} /><input className="cc-field" type="tel" placeholder="Phone" aria-label="Emergency contact phone" value={v.f.ecPhone.value ?? ""} onChange={v.f.ecPhone.set} /></div>
<div className="cc-chips cc-list" style={{marginTop: "8px"}}>{(v.ecRel || []).map((c: any, i34: number) => (<Fragment key={i34}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
</div>
</div>
</>)}
{!!(v.fsCrash) && (<>
<div className="cc-card">
<span className="cc-card-h">The crash</span>
{['carrier', 'report', 'car'].map((id) => {
  const q = v.fi.sections.flatMap((s: any) => s.questions).find((q: any) => q.id === id);
  return q ? <IntakeQuestion key={id} q={q} v={v} presentation="guided" /> : null;
})}
<div className="cc-done-row" style={{cursor: "default"}}><span className="cc-done-k">Missed work</span><span className="cc-done-v">{v.missedWork}</span></div>
</div>
</>)}
{!!(v.fsPax) && (<>
{(v.paxSend || []).map((p: any, i37: number) => (<Fragment key={i37}>
<div className="cc-card">
<span className="cc-card-h">{p.title}</span>
<div className="cc-cue" style={{marginTop: "0"}}>{p.note}</div>
{!!(p.needCell && p.ready) && (<>
<input className="cc-field" type="tel" inputMode="tel" placeholder="Their own cell (the agreement texts there)" aria-label="Passenger's own cell" value={p.cell.value ?? ""} onChange={p.cell.set} />
<div className="cc-cue cc-red" style={{marginTop: "4px"}}>Add their own cell first. It never texts to the caller&apos;s phone.</div>
</>)}
{!!(p.needEmail && p.ready) && (<>
<input className="cc-field" type="email" inputMode="email" autoComplete="off" placeholder="Their own email (the agreement goes there)" aria-label="Passenger's own email" value={p.email.value ?? ""} onChange={p.email.set} />
<div className="cc-cue cc-red" style={{marginTop: "4px"}}>Add their own email first. It never goes to the caller&apos;s email.</div>
</>)}
{!!(p.shared && p.ready) && (
<label className="cc-cue" style={{display: "flex", gap: 8, alignItems: "center", marginTop: "6px"}}>
<input type="checkbox" checked={!!p.shareOk} onChange={p.confirmShare} />
That&apos;s the caller&apos;s own {v.viaEmail ? "email" : "number"}. The passenger confirmed they share it.
</label>)}
{!!(p.ready) && (<><button className={cx("cc-btn cc-full" + (p.needCell ? " cc-soft" : ""))} onClick={p.send}>{p.button}</button></>)}
{!!(p.live) && (<><div className="cc-steps">{(p.steps || []).map((st: any, i38: number) => (<Fragment key={i38}><div className={cx(st.cls)}>{st.label}</div></Fragment>))}</div></>)}
</div>
</Fragment>))}
</>)}
</>)}

{!!(v.showClose) && (<>
{!!(v.free) && (<><div id="fs-close" className="cc-sec-h">Close</div></>)}
<div className="cc-say">
<div className="cc-say-label">Say, then hang up</div>
{closeLines(v.callerFirst, v.firmSpoken).map((t, i) => <div key={i} className="cc-say-line cc-sm" style={i ? {marginTop: "8px"} : undefined}>{t}</div>)}
<div className="cc-cue">{CLOSE_CUE}</div>
</div>
<div className="cc-card">
{(v.summary || []).map((r: any, i39: number) => (<Fragment key={i39}>
<div className="cc-done-row" style={{cursor: "default"}}><span className="cc-done-k">{r.k}</span><span className="cc-done-v">{r.v}</span></div>
</Fragment>))}
</div>
</>)}

</>)}
</main>
<div className="cc-bar ix-foot">
<IxFoot v={v} />
</div>

{!!(v.sheetOpen) && (<>
<div className="cc-scrim">
<div className="cc-sheet" role="dialog" aria-label="Help">
<div className="cc-grab"></div>
<div className="cc-sheet-h">
<div className="cc-htabs" role="tablist">{(v.helpTabs || []).map((t: any, i40: number) => (<Fragment key={i40}><button className={cx(t.cls)} onClick={t.go}>{t.label}</button></Fragment>))}</div>
<button className="cc-x" onClick={v.closeSheet} aria-label="Close help">Close</button>
</div>
<div className="cc-sheet-b">

{!!(v.isNowTab) && <WsHelper v={v} inSheet />}

{!!(v.isAsk) && (<>
<div className="cc-cue" style={{marginTop: "0"}}>Describe the wreck in plain words. CaseCure tells you what to ask next and whether it looks like it qualifies.</div>
<textarea className="cc-area" rows={3} placeholder="What happened, in plain words" aria-label="Describe the wreck" value={v.askField.value ?? ""} onChange={v.askField.set}></textarea>
<button className="cc-btn cc-full" disabled={!!v.askBusy} onClick={v.doAsk}>{v.askBusy ? "Asking" : "Ask CaseCure"}</button>
{!!(v.askAnswer) && (<><div className="cc-ask-a">{v.askAnswer}</div></>)}
{!!(v.askError) && (<><div className="cc-cue cc-red">{v.askError}</div></>)}
</>)}

{!!(v.isRebTab) && (<>
{!!(v.rebPicked) && (<>
<div className="cc-reb">
<div className="cc-reb-k">{v.picked.title}</div>
{!!(v.picked.hasNote) && (<><div className="cc-cue cc-red">{v.picked.note}</div></>)}
<div className="cc-reb-t" style={{fontSize: "17px"}}>{v.picked.text}</div>
</div>
<button className="cc-back" onClick={v.closeSheet}><div className="cc-back-k">Back to</div><div className="cc-back-l">{v.backLine}</div></button>
<button className="cc-btn cc-soft" onClick={v.clearPick}>All rebuttals</button>
</>)}
{!!(v.rebList) && (<>
{(v.rebs || []).map((r: any, i41: number) => (<Fragment key={i41}>
{!!(r.isHead) && (<><div className={cx(r.cls)}>{r.label}</div></>)}
{!!(r.isItem) && (<><button className={cx(r.cls)} onClick={r.pick}><span>{r.title}</span><span className={cx(r.tagCls)}>{r.tag}</span></button></>)}
</Fragment>))}
</>)}
</>)}

{!!(v.isLines) && (<>
{(v.lines || []).map((l: any, i42: number) => (<Fragment key={i42}>
<div className={cx(l.hcls)}>{l.head}</div>
<div className="cc-ln-note">{l.note}</div>
<div className="cc-ln-box">{(l.items || []).map((it: any, i43: number) => (<Fragment key={i43}><div className={cx(it.cls)}>{!!(it.showK) && (<><div className="cc-ln-k">{it.k}</div></>)}<div className="cc-ln-t">{it.t}</div></div></Fragment>))}</div>
</Fragment>))}
</>)}
</div>
</div>
</div>
</>)}

{!!(v.textOpen) && (<>
<div className="cc-scrim">
<div className="cc-sheet" role="dialog" aria-label={`Text ${v.callerFirst}`}>
<div className="cc-grab"></div>
<div className="cc-sheet-h"><span className="cc-card-h">Text {v.callerFirst}</span><button className="cc-x" onClick={v.closeText} aria-label="Close texting">Close</button></div>
<div className="cc-sheet-b" style={{gap: "8px"}}>
<div className="cc-cue" style={{margin: "0 4px 6px"}}>From {v.textFrom} through JustCall. It lands in the same thread in the JustCall app, and every text saves to the file.</div>
{!!(v.phoneRows && v.phoneRows.length) && (<>
<div className="cc-sec-h" style={{paddingTop: "4px"}}>Call</div>
<div className="cc-grp">
{(v.phoneRows || []).map((p: any, ip: number) => (<div key={ip} className="cc-callrow cc-phonerow">
<div className="cc-callrow-t"><span>{p.label}</span><span className="cc-done-k">{p.pretty}</span></div>
<div className="cc-chips cc-list" style={{marginTop: "8px"}}>
{p.kind === "caller" && <button className="cc-chip cc-go" onClick={() => v.callOut(p.number)}>Call in JustCall</button>}
<button className="cc-chip" onClick={() => v.copyNum(p.number)}>Copy number</button>
</div>
</div>))}
</div>
<div className="cc-cue" style={{margin: "0 4px"}}>Always call from JustCall so it comes from the firm's line and records. For a 3-way, tap add call in JustCall and paste the firm's number.</div>
</>)}
{!!v.hasCalls && (<>
<div className="cc-sec-h" style={{paddingTop: "4px"}}>Calls</div>
<div className="cc-grp">
{(v.callsList || []).map((c: any, ic: number) => (<div key={ic} className="cc-callrow">
<div className="cc-callrow-t"><span>{c.what}</span><span className="cc-done-k">{c.when}</span></div>
{!!c.agent && <div className="cc-cue" style={{marginTop: "0"}}>{c.agent}</div>}
{!!c.hasRec && <audio controls preload="none" src={c.rec} style={{width: "100%", marginTop: "6px"}} />}
{!!c.hasSummary && <div className="cc-cue">{c.summary}</div>}
</div>))}
</div>
<div className="cc-sec-h" style={{paddingTop: "14px"}}>Texts</div>
</>)}
{!!(v.textEmpty) && (<><div className="cc-cue" style={{textAlign: "center", margin: "28px 0"}}>No texts with {v.callerFirst} yet.</div></>)}
{(v.texts || []).map((m: any, i44: number) => (<Fragment key={i44}><div className={cx(m.cls)}><div>{m.body}</div>{(m.when || m.hasStatus) && (<><div className="cc-bub-s">{[m.when, m.status].filter(Boolean).join(" · ")}</div></>)}</div></Fragment>))}
{!!(v.canResend) && (<><div className="cc-chips cc-list" style={{marginTop: "8px"}}><button className="cc-chip cc-go" onClick={v.resendLink}>Resend the agreement link</button></div></>)}
{!!v.hasTextError && <div className="cc-stop"><div className="cc-cue cc-red" style={{marginTop: "0"}}>{v.textError}</div></div>}
</div>
<div className="cc-compose">
<textarea className="cc-area" rows={1} placeholder="Text message" aria-label="Text message" value={v.textDraft.value ?? ""} onChange={v.textDraft.set}></textarea>
<button className="cc-send" disabled={!!v.textCantSend} onClick={v.sendText} aria-label="Send text"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"></path></svg></button>
</div>
</div>
</div>
</>)}

<Dispo v={v} />
</div>

  );
}

// How the call ended. A full screen of its own, the same from every view.
function Dispo({ v }: { v: any }) {
  return (<>
{!!(v.dispoOpen) && (<>
<div className="cc-dsp" role="dialog" aria-label="Dispo">
<div className="cc-dsp-n">
<button className="cc-dsp-back" onClick={v.dispo.back}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>{v.dispo.saved ? "Review intake" : "Back to intake"}</button>
<span className="cc-caller">Dispo</span>
<span></span>
</div>
<div className="cc-dsp-b">
{!!(v.dispo.editing) && (<>
<div className="cc-sec-h cc-first">How the call ended</div>
<div className="cc-grp" role="radiogroup" aria-label="How the call ended">
{(v.dispo.opts || []).map((o: any, i45: number) => (<Fragment key={i45}><button className={cx(o.cls)} role="radio" aria-checked={!!o.on} onClick={o.pick}><span>{o.label}</span>{!!(o.showCheck) && (<><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#16324F"></circle><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path></svg></>)}{!!(o.showChange) && (<><span className="cc-d-change">Change<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></span></>)}</button></Fragment>))}
</div>
{!!(v.dispo.hasWhy) && (<>
<div className="cc-sec-h">{v.dispo.whyHead}</div>
{!!(v.dispo.fromCall) && (<><div className="cc-cue" style={{margin: "0 4px"}}>Checked from the lights. Untap anything that's wrong.</div></>)}
<div className="cc-grp" role="group" aria-label={v.dispo.whyHead}>{(v.dispo.why || []).map((c: any, i46: number) => (<Fragment key={i46}><button className={cx(c.cls)} role="checkbox" aria-checked={!!c.on} onClick={c.pick}><span>{c.label}</span>{!!(c.on) && (<><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#16324F"></circle><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path></svg></>)}</button></Fragment>))}</div>
</>)}
{!!(v.dispo.hasWhen) && (<>
<div className="cc-sec-h">{v.dispo.whenHead}</div>
<div className="cc-grp" role="radiogroup" aria-label={v.dispo.whenHead}>{(v.dispo.when || []).map((c: any, i47: number) => (<Fragment key={i47}><button className={cx(c.cls)} role="radio" aria-checked={!!c.on} onClick={c.pick}><span>{c.label}</span>{!!(c.on) && (<><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#16324F"></circle><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path></svg></>)}</button></Fragment>))}</div>
{!!(v.dispo.pickTime) && (<><input className="cc-field" type="datetime-local" aria-label="Call back at" value={v.dispo.at.value ?? ""} onChange={v.dispo.at.set} /></>)}
</>)}
{!!(v.dispo.isSigned) && <div className="cc-stop"><strong>After saving this call:</strong> Review your file below and use the single final send. Saving the disposition does not email the packet.</div>}
{!!(v.dispo.isDnc) && (<>
<div className="cc-stop"><div className="cc-card-h">The number comes off every list</div><div className="cc-cue">No more calls or texts from any campaign.</div></div>
</>)}
{!!(v.dispo.hasPick) && (<>
<div className="cc-sec-h">Note</div>
<textarea className="cc-area" rows={2} placeholder="Optional" aria-label="Dispo note" value={v.dispo.note.value ?? ""} onChange={v.dispo.note.set}></textarea>
</>)}
</>)}
{!!(v.dispo.saved) && (<>
<div className="cc-card" style={{alignItems: "center", textAlign: "center", gap: "8px", padding: "24px 16px"}}>
<div className="cc-d-ok"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></div>
<div className="cc-card-h">Dispo saved</div>
<div className="cc-cue" style={{margin: "0"}}>{v.dispo.savedNote}</div>
{v.dispo.isSigned && <button type="button" className="cc-btn cc-go" onClick={v.reviewIntake}>Review intake answers</button>}
</div>
<div className="cc-grp">
{(v.dispo.summary || []).map((r: any, i49: number) => (<Fragment key={i49}><div className="cc-done-row" style={{cursor: "default"}}><span className="cc-done-k">{r.k}</span><span className="cc-done-v">{r.v}</span></div></Fragment>))}
</div>
{v.dispo.isSigned && <FinalHandoff leadId={v.leadId} claimId={v.claimId} missing={(v.fi.missing || []).map((item: any) => ({ label: item.label, go: () => { v.reviewIntake(); item.go(); } }))} onNext={v.dispo.nextCall} />}
</>)}
{!!v.dispo.hasError && <div className="cc-stop"><div className="cc-cue cc-red" style={{marginTop: "0"}}>{v.dispo.error}</div></div>}
</div>
<div className="cc-bar">
{!!(v.dispo.editing) && (<><button className="cc-btn cc-go" disabled={!!v.dispo.cantSave} onClick={v.dispo.save}>{v.dispo.saveLabel}</button></>)}
{!!(v.dispo.saved) && (<><button className="cc-btn cc-soft" style={{flex: "1"}} onClick={v.dispo.edit}>Edit disposition</button>{v.dispo.isSigned ? <button className="cc-btn cc-soft" style={{flex: "1"}} onClick={v.reviewIntake}>Review intake</button> : <a className="cc-btn cc-soft" style={{flex: "1", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none"}} href={`/leads/${v.leadId}?classic=1`}>Open the file</a>}{!v.dispo.isSigned && <button className="cc-btn cc-go" onClick={v.dispo.nextCall}>Next call</button>}</>)}
</div>
</div>
</>)}
  </>);
}
