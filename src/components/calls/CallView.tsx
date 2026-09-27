"use client";
// Generated from the approved Design-canvas prototype (Main.dc.html) by
// port/convert.py, then checked in. The prototype is the source of truth for
// layout; `v` comes from CallEngine.renderVals() so markup and logic stay 1:1.
import { Fragment } from "react";
import PlaceField from "./PlaceField";
import WhereField from "./WhereField";
import { FiProgress, FiBody, FiBar } from "./FullIntake";
import { WsLeft, WsSummary } from "./IntakeWorkspace";
import { OneTop, OneBody, OneBar } from "./OneQuestion";
import ChoreList from "./ChoreList";
import { MONEY, SEND_LINE, STAY, walkThrough, NO_DEAD_AIR, SIGNED, closeLines, CLOSE_CUE } from "./scripts";

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

// The 30-day check, worked out from the crash date and her visits. A row in
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

export default function CallView({ v }: { v: any }) {
  // Simple Chorelist: one numbered form, nothing hidden, no other chrome.
  if (v.choreView) return (
<div className="cc-app ch-mode">
<ChoreList v={v} />
<Dispo v={v} />
</div>
  );
  // Full Intake on an iPad or a computer: caller on the left, the section in
  // the middle, what's missing and what's next on the right.
  // Conversation and Quick Capture share Full Intake's look and its iPad and desktop layouts.
  const onePage = v.fullView || v.oneQ;
  const ws = onePage && v.ws ? ` ws ws-${v.ws}` : "";
  return (
<div className={`cc-app${onePage ? " fi-mode" : ""}${v.oneQ ? ` oq-mode oq-${v.oneKind}` : ""}${ws}`}>
{!!ws && <WsLeft v={v} />}
{!!ws && v.ws === "ipad" && <aside className="ws-right" aria-label="Summary"><WsSummary v={v} /></aside>}
<div className="cc-top">
<div className="cc-nav">
<div className="cc-nav-l"><a className="cc-navback" href="/app" aria-label="All calls"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></a><button className="cc-mode" onClick={v.toggleModeMenu} aria-label="Change view" aria-expanded={!!v.modeMenuOpen}>{v.modeLabel}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button></div>
<div className="cc-who"><span className="cc-caller">{v.callerName}</span><span className={cx(v.clockCls)}>{v.clockText}</span>{!!v.saveBad && <span className="cc-savebad" role="status">{v.saveError}</span>}</div>
<div className="cc-nav-r"><button className="cc-circ cc-txt" onClick={v.openText} aria-label={v.textBadge ? `${v.textUnread} new texts from ${v.callerFirst}` : `Text ${v.callerFirst}`}>{!!v.textBadge && <span className="cc-badge">{v.textUnread}</span>}<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.58 2 11c0 2.4 1.32 4.55 3.4 6.02L4.6 21l4.33-2.3c.99.2 2.02.3 3.07.3 5.52 0 10-3.58 10-8s-4.48-8-10-8z"></path></svg></button><button className="cc-circ cc-end" onClick={v.openDispo} aria-label="Call ended"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a.99.99 0 0 1 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85a1 1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"></path></svg></button></div>
</div>
{!!(v.modeMenuOpen) && (<>
<div className="cc-menu" role="menu">
{(v.modes || []).map((m: any, i1: number) => (<Fragment key={i1}><button className={cx(m.cls)} role="menuitemradio" aria-checked={!!m.on} onClick={m.go}><span>{m.label}</span>{!!(m.on) && (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></>)}</button></Fragment>))}
<a className="cc-menu-b" role="menuitem" href={`/app/${v.leadId}/print`}>Print or email the case</a>
<a className="cc-menu-b" role="menuitem" href="/app">All calls</a>
</div>
</>)}
{!!(v.fullView) && <FiProgress v={v} />}
{!!(v.oneQ) && <OneTop v={v} />}
{!!(v.guided) && (<>
<div className="cc-gates">
{(v.gates || []).map((g: any, i2: number) => (<Fragment key={i2}>
<button className={cx(g.cls)} onClick={g.go} aria-label={g.aria}>{g.label}</button>
</Fragment>))}
</div>
</>)}
{!!(v.free) && (<>
<div className="cc-gates">
{(v.gates || []).map((g: any, i3: number) => (<Fragment key={i3}>
<a className={cx(g.cls)} href={g.href} aria-label={g.aria}>{g.label}</a>
</Fragment>))}
</div>
</>)}
</div>
{!!(v.guided) && (<>
<nav className="cc-tabs" aria-label="Call steps">
{(v.tabs || []).map((t: any, i4: number) => (<Fragment key={i4}>
<button className={cx(t.cls)} onClick={t.go}>{t.label}</button>
</Fragment>))}
</nav>
</>)}
{!!(v.free) && (<>
<nav className="cc-tabs" aria-label="Jump to a section">
{(v.jumps || []).map((t: any, i5: number) => (<Fragment key={i5}>
<a className={cx(t.cls)} href={t.href}>{t.label}</a>
</Fragment>))}
</nav>
</>)}
<main className={`cc-main${v.fullView ? " fi-main" : ""}${v.oneQ ? " fi-main oq-main" : ""}`}>
{!!(v.fullView) && <FiBody v={v} />}
{!!(v.oneQ) && <OneBody v={v} />}
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
<div className="cc-tone">Say it with empathy, warmth, and concern</div>
<div className="cc-say-line cc-sm">Hi, is this {v.callerFirst}?</div>
<div className="cc-say-line" style={{marginTop: "10px"}}>{v.callerFirst}, this is {v.agentFirst} with the {v.firmSpoken} Intake Center. I'm reaching out about the car accident information we just received. Tell me what happened.</div>
<div className="cc-cue">The last four words are the whole open. You do not ask if now is a good time.</div>
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
<div className="cc-cue">Let her run. Tap what you hear.</div>
</div>
{!!(v.hasLead) && (<>
<button className={`cc-leadline${v.leadOpen ? " cc-on" : ""}`} onClick={v.toggleLead} aria-expanded={!!v.leadOpen} aria-label="What the marketer sent">
<span className="cc-leadline-k">From the lead</span>
<span className="cc-leadline-t">{(v.leadTags || []).map((t: any) => t.label).join(", ") || v.leadFrom}</span>
<Chev open={!!v.leadOpen} />
</button>
{!!(v.leadOpen) && (<div className="cc-leadmore">
{!!(v.leadSaid) && <div className="cc-lead-said">{v.leadSaid}</div>}
{!!(v.leadFrom) && <div className="cc-cue" style={{marginTop: 0}}>{v.leadFrom}. What she told the marketer, so confirm it with her.</div>}
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
{!!(r.ask) && <div className="cc-ask"><span className="cc-ask-k">If she didn't say it, ask</span><span className="cc-ask-l">{r.ask}</span></div>}
{!!(r.isCity) && <WhereField value={v.storyWhere.value} agreement={v.agreement} onChange={v.storyWhere.set} onDone={v.storyWhere.done} />}
{!!(r.isWhen) && (<>
<div className="cc-chips cc-seg">{(v.storyWhen.chips || []).map((c: any, i: number) => (<button key={i} className={cx(c.cls)} onClick={c.pick}>{c.label}</button>))}</div>
{!!(v.storyWhen.pickDate) && <input className="cc-field" type="date" max={v.storyWhen.date.max} aria-label="Date of the wreck" value={v.storyWhen.date.value ?? ""} onChange={v.storyWhen.date.set} />}
</>)}
{!!(r.isSeat) && (<>
<div className="cc-chips cc-seg">{(v.storySeat || []).map((c: any, i: number) => (<button key={i} className={cx(c.cls)} onClick={c.pick}>{c.label}</button>))}</div>
{!!(v.seatOther) && <input className="cc-field" type="text" placeholder="Explain" aria-label="Explain her role in the crash" value={v.f.seatOther.value ?? ""} onChange={v.f.seatOther.set} />}
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
<button onClick={v.openRamble}>She won't stop talking</button>
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
{!!(r.q.isDate) && <DateBox q={r.q} />}
{!!(r.q.multi) && <button className="cc-btn cc-soft cc-rowbtn" onClick={r.q.next}>{r.q.nextLabel}</button>}
{!!(r.q.cue) && <div className="cc-cue" style={{marginTop: 0}}>{r.q.cue}</div>}
{!!(r.key === "pain" && v.sayingFine) && (<div className="cc-reb">
<div className="cc-reb-k">She's downplaying. Do not move past it.</div>
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
<div className="cc-cue">Do not go looking for it. She has to be the one who says she's unhappy.</div>
<div className="cc-chips cc-list">{(v.rep.unhappy || []).map((c: any, i18: number) => (<Fragment key={i18}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.rep.isUnhappy) && (<>
<div className="cc-lab" style={{marginTop: "10px"}}>WHAT DOES IT SOUND LIKE</div>
<div className="cc-chips cc-list">{(v.rep.kind || []).map((c: any, i19: number) => (<Fragment key={i19}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.rep.fender) && (<><div className="cc-cue">The firm charges these back. Close it warm and let it go.</div></>)}
{!!(v.rep.good) && (<>
<div className="cc-say-line cc-sm" style={{marginTop: "10px"}}>I'm sorry to hear that, that's frustrating.</div>
<div className="cc-say-line cc-sm" style={{marginTop: "6px"}}>I'm not going to tell you to leave your attorney, that's not my call and it's not my place. What I can tell you is you're allowed to choose who represents you, and that doesn't change today or tomorrow.</div>
<div className="cc-cue">Then keep going and sign her. Never say her attorney is bad, never tell her to fire anybody, never say she'd do better with us. Write down what she said, in her words.</div>
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
<div className="cc-cue">Do not go looking for it. She has to be the one who says she's unhappy.</div>
<div className="cc-chips cc-list">{(v.rep.unhappy || []).map((c: any, i21: number) => (<Fragment key={i21}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.rep.isUnhappy) && (<>
<div className="cc-lab" style={{marginTop: "10px"}}>WHAT DOES IT SOUND LIKE</div>
<div className="cc-chips cc-list">{(v.rep.kind || []).map((c: any, i22: number) => (<Fragment key={i22}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(v.rep.fender) && (<><div className="cc-cue">The firm charges these back. Close it warm and let it go.</div></>)}
{!!(v.rep.good) && (<>
<div className="cc-say-line cc-sm" style={{marginTop: "10px"}}>I'm sorry to hear that, that's frustrating.</div>
<div className="cc-say-line cc-sm" style={{marginTop: "6px"}}>I'm not going to tell you to leave your attorney, that's not my call and it's not my place. What I can tell you is you're allowed to choose who represents you, and that doesn't change today or tomorrow.</div>
<div className="cc-cue">Then keep going and sign her. Never say her attorney is bad, never tell her to fire anybody, never say she'd do better with us. Write down what she said, in her words.</div>
</>)}
</>)}
</div>
</>)}
{(v.bodyAll || []).map((x: any, i23: number) => (<Fragment key={i23}>
<div className={cx(x.cls)}>
<div className="cc-item-l">{x.line}</div>
<div className={cx(x.chipsCls)}>{(x.chips || []).map((c: any, i24: number) => (<Fragment key={i24}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(x.isDate) && <DateBox q={x} />}
</div>
{!!(x.key === "seen" && v.gapCard.show) && <GapCard g={v.gapCard} alone />}
</Fragment>))}
{!!(v.sayingFineFree) && (<>
<div className="cc-reb">
<div className="cc-reb-k">She's downplaying. Do not move past it.</div>
<div className="cc-reb-t">{v.soreness}</div>
</div>
</>)}
</>)}

{!!(v.showCar) && (<>
{!!(v.free) && (<><div id="fs-car" className="cc-sec-h">Car</div></>)}
<div className="cc-say">
<div className="cc-say-label">Say</div>
<div className="cc-say-line">Who else was in the car with you?</div>
<div className="cc-cue">Do not skip this. Ever. Every passenger is their own file and their own agreement.</div>
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
<div className="cc-chips cc-seg">{(p.ages || []).map((c: any, i27: number) => (<Fragment key={i27}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-line">Okay, and how's [he/she] doing? Any soreness, any trouble sleeping, anything like that?</div>
<div className="cc-chips cc-seg">{(p.hurts || []).map((c: any, i28: number) => (<Fragment key={i28}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
{!!(p.ownFile) && (<><span className="cc-tag">Own file and own agreement after {v.callerFirst} signs</span></>)}
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
<span className="cc-card-h">Only if she insists on the split</span>
<div className="cc-cue" style={{marginTop: "0"}}>Tell her straight, it's in the agreement she's about to read. Then reask.</div>
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
<div className="cc-lab">DATE OF THE WRECK</div>
<div className="cc-chips cc-seg">{(v.storyWhen.chips || []).map((c: any, i: number) => (<button key={i} className={cx(c.cls)} onClick={c.pick}>{c.label}</button>))}</div>
{!!(v.storyWhen.pickDate) && <input className="cc-field" style={{marginTop: "8px"}} type="date" max={v.storyWhen.date.max} aria-label="Date of the wreck" value={v.storyWhen.date.value ?? ""} onChange={v.storyWhen.date.set} />}
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
<div>
<div className="cc-lab">SEND BY</div>
<div className="cc-chips cc-seg">{(v.via || []).map((c: any, i31: number) => (<Fragment key={i31}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
<div className="cc-cue">{v.viaNote}</div>
{!!v.viaText && (<>
{!!(v.textTo || []).length && (<>
<div className="cc-lab" style={{marginTop: "12px"}}>TEXT IT TO</div>
<div className="cc-chips cc-seg">{(v.textTo || []).map((c: any, i: number) => (<Fragment key={i}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div>
</>)}
{!!v.textToOther && <input className="cc-field" style={{marginTop: "8px"}} type="tel" inputMode="tel" placeholder={v.herPhoneOk ? "Number to text it to" : "Her cell"} aria-label="Number to text the agreement to" value={v.f.phone.value ?? ""} onChange={v.f.phone.set} />}
{!!v.textToOther && !!v.herPhoneOk && <div className="cc-cue">If someone else is signing, put their name in Signer.</div>}
</>)}
{!!v.viaEmail && <input className="cc-field" style={{marginTop: "8px"}} type="email" inputMode="email" autoComplete="off" placeholder="Her email" aria-label="Her email" value={v.f.email.value ?? ""} onChange={v.f.email.set} />}
</div>
{!!v.previewHref && <a className="cc-preview" href={v.previewHref} target="_blank" rel="noopener" onClick={v.onPreview}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></svg>Preview the agreement before you send it</a>}
{!!v.hasSendError && <div className="cc-stop"><div className="cc-cue cc-red" style={{marginTop: "0"}}>{v.sendError}</div></div>}
{!!(v.sendWarn) && (<><div className="cc-stop"><div className="cc-cue cc-red" style={{marginTop: "0"}}>{v.sendWarnText}</div></div></>)}
</>)}
{!!(v.sendLive) && (<>
<div className="cc-steps">{(v.sendSteps || []).map((st: any, i32: number) => (<Fragment key={i32}><div className={cx(st.cls)}>{st.label}</div></Fragment>))}</div>
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
<div className="cc-say" style={{border: "2px solid #D9982A", background: "#FDF5E6"}}>
<div className="cc-say-label">{SIGNED.label}</div>
<div className="cc-say-line">{SIGNED.line}</div>
<div className="cc-cue">{SIGNED.cue}</div>
</div>
</>)}
</>)}
</>)}

{!!(v.showFile) && (<>
{!!(v.free) && (<><div id="fs-file" className="cc-sec-h">File, after she signs</div></>)}
{!!(v.guided) && (<><div className="cc-chips cc-seg">{(v.fileTabs || []).map((c: any, i33: number) => (<Fragment key={i33}><button className={cx(c.cls)} onClick={c.pick}>{c.label}</button></Fragment>))}</div></>)}
{!!(v.fsAgreement) && (<>
<div className="cc-card">
<span className="cc-card-h">Finish the agreement</span>
<div className="cc-cue" style={{marginTop: "0"}}>These print on the HIPAA pages as the patient's. For a child, it's the child's.</div>
<div><div className="cc-lab">DATE OF BIRTH</div><input className="cc-field" type="text" inputMode="numeric" placeholder="MM/DD/YYYY" aria-label="Date of birth" value={v.f.dob.value ?? ""} onChange={v.f.dob.set} /></div>
<div><div className="cc-lab">SSN</div><input className="cc-field" type="text" inputMode="numeric" placeholder="Last 4 or all 9" aria-label="Social Security number" value={v.f.ssn.value ?? ""} onChange={v.f.ssn.set} /></div>
{!!(v.agreementOpen) && (<>
<button className="cc-btn cc-full" disabled={!!v.agreementLocked} onClick={v.completeAgreement}>{v.completeLabel}</button>
<button className="cc-btn cc-soft" onClick={v.leaveForQa}>Leave it for QA in the morning</button>
</>)}
{!!v.hasFileError && <div className="cc-cue cc-red">{v.fileError}</div>}
{!!(v.agreementClosed) && (<><span className="cc-tag">{v.agreementNote}</span></>)}
</div>
</>)}
{!!(v.fsInfo) && (<>
<div className="cc-card">
<span className="cc-card-h">Her info</span>
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
<div><div className="cc-lab">OTHER DRIVER'S INSURANCE</div>
<select className="cc-field" aria-label="Other driver's insurance carrier" value={v.f.carrier.value ?? ""} onChange={v.f.carrier.set}>{(v.carriers || []).map((o: any, i35: number) => (<Fragment key={i35}><option value={o ?? ""}>{o}</option></Fragment>))}</select></div>
<div><div className="cc-lab">POLICE REPORT NUMBER</div><input className="cc-field" type="text" aria-label="Police report number" value={v.f.report.value ?? ""} onChange={v.f.report.set} /></div>
<div><div className="cc-lab">VEHICLE</div>
<div style={{display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px"}}>
<select className="cc-field" aria-label="Vehicle year" value={v.f.vYear.value ?? ""} onChange={v.f.vYear.set}>{(v.years || []).map((o: any, i36: number) => (<Fragment key={i36}><option value={o ?? ""}>{o}</option></Fragment>))}</select>
<input className="cc-field" type="text" placeholder="Make" aria-label="Vehicle make" value={v.f.vMake.value ?? ""} onChange={v.f.vMake.set} />
<input className="cc-field" type="text" placeholder="Model" aria-label="Vehicle model" value={v.f.vModel.value ?? ""} onChange={v.f.vModel.set} />
</div></div>
<div className="cc-done-row" style={{cursor: "default"}}><span className="cc-done-k">Missed work</span><span className="cc-done-v">{v.missedWork}</span></div>
</div>
</>)}
{!!(v.fsPax) && (<>
{(v.paxSend || []).map((p: any, i37: number) => (<Fragment key={i37}>
<div className="cc-card">
<span className="cc-card-h">{p.title}</span>
<div className="cc-cue" style={{marginTop: "0"}}>{p.note}</div>
{!!(p.ready) && (<><button className="cc-btn cc-full" onClick={p.send}>{p.button}</button></>)}
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

</main>
<div className={`cc-bar${v.fullView ? " fi-bar" : ""}${v.oneQ ? " fi-bar oq-bar" : ""}`}>
{v.fullView ? <FiBar v={v} /> : v.oneQ ? <OneBar v={v} /> : (<>
<button className="cc-btn cc-ghost" onClick={v.openSheet}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path></svg>Help</button>
{!!(v.nudge) && (<div className="cc-nudge" role="alert">{v.nudge}</div>)}
<button className={`cc-btn cc-go${v.next.muted ? " cc-muted" : ""}`} disabled={!!v.next.disabled} onClick={v.next.go}>{v.next.label}</button>
</>)}
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
<div className="cc-cue" style={{margin: "0 4px 6px"}}>From {v.textFrom} through JustCall. It lands in the same thread in the JustCall app, and every text saves to her file.</div>
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
{(v.texts || []).map((m: any, i44: number) => (<Fragment key={i44}><div className={cx(m.cls)}><div>{m.body}</div>{!!(m.hasStatus) && (<><div className="cc-bub-s">{m.status}</div></>)}</div></Fragment>))}
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
<button className="cc-dsp-back" onClick={v.dispo.back}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>Call</button>
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
{!!(v.dispo.isSigned) && (<>
<div className="cc-sec-h">Email the case to</div>
<div className="cc-grp">
{(v.dispo.notify || []).map((n: any, i48: number) => (<Fragment key={i48}><button className={cx(n.cls)} role="checkbox" aria-checked={!!n.on} onClick={n.toggle}><span className="cc-d-who"><span>{n.who}</span><span className="cc-d-how">{n.how}</span></span>{!!(n.on) && (<><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#16324F"></circle><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path></svg></>)}</button></Fragment>))}
</div>
<div className="cc-d-add"><input className="cc-field" type="email" inputMode="email" placeholder="Add an email" aria-label="Add an email" value={v.dispo.add.value ?? ""} onChange={v.dispo.add.set} /><button className="cc-btn cc-soft" style={{width: "auto", padding: "0 18px"}} onClick={v.dispo.addGo}>Add</button></div>
<div className="cc-cue" style={{margin: "0 4px"}}>Sends the case summary with a link to the signed file.</div>
</>)}
{!!(v.dispo.isDnc) && (<>
<div className="cc-stop"><div className="cc-card-h">Her number comes off every list</div><div className="cc-cue">No more calls or texts from any campaign.</div></div>
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
</div>
<div className="cc-grp">
{(v.dispo.summary || []).map((r: any, i49: number) => (<Fragment key={i49}><div className="cc-done-row" style={{cursor: "default"}}><span className="cc-done-k">{r.k}</span><span className="cc-done-v">{r.v}</span></div></Fragment>))}
</div>
</>)}
{!!v.dispo.hasError && <div className="cc-stop"><div className="cc-cue cc-red" style={{marginTop: "0"}}>{v.dispo.error}</div></div>}
</div>
<div className="cc-bar">
{!!(v.dispo.editing) && (<><button className="cc-btn cc-go" disabled={!!v.dispo.cantSave} onClick={v.dispo.save}>{v.dispo.saveLabel}</button></>)}
{!!(v.dispo.saved) && (<><button className="cc-btn cc-soft" style={{flex: "1"}} onClick={v.dispo.edit}>Edit</button><button className="cc-btn cc-go" onClick={v.dispo.nextCall}>Next call</button></>)}
</div>
</div>
</>)}
  </>);
}
