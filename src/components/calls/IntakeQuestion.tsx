"use client";

// The engine resolves the question once. These four presentations share every
// label, option, branch and callback; only wrappers and control appearance vary.
import PassengerAgreement from "./PassengerAgreement";
import WhereField from "./WhereField";
import StoryAssist from "./StoryAssist";

export type IntakePresentation = "guided" | "full" | "chore" | "form";
export const choicesFromClasses = (items: any[]) => (items || []).map((o: any) => ({ ...o, on: /(?:^|\s)on(?:\s|$)/.test(o.cls || "") }));

export function IntakeChoices({ opts, presentation = "full", multi = false }: { opts: any[]; presentation?: IntakePresentation; multi?: boolean }) {
  if (presentation === "form") return <div className="sf-chips sf-radios">{(opts || []).map((o, i) => (
    <label key={i} className={`sf-radio${o.on ? " sf-on" : ""}`}><input type={multi ? "checkbox" : "radio"} checked={!!o.on} onChange={() => {}} onClick={o.pick} /><span>{o.label}{!!o.sub && <small> {o.sub}</small>}</span></label>
  ))}</div>;
  const ch = presentation === "chore";
  return <div className={ch ? "ch-opts" : "fi-chips"}>{(opts || []).map((o, i) => (
    <button key={i} type="button" className={ch ? `ch-opt${o.on ? " ch-on" : ""}` : `fi-chip${o.on ? " fi-on" : ""}`} aria-pressed={!!o.on} onClick={o.pick}>
      {ch && <span className="ch-box" aria-hidden="true">{o.on ? "✓" : ""}</span>}<span>{o.label}{!!o.sub && <small>{o.sub}</small>}</span>
    </button>
  ))}</div>;
}

export function QuestionControl({ c, v, presentation = "full", review = false }: { c: any; v: any; presentation?: IntakePresentation; review?: boolean }) {
  const p = presentation === "form" ? "sf" : presentation === "chore" ? "ch" : "fi";
  const input = `${p}-in`, area = `${input} ${p}-area`;
  const choices = (opts: any[], multi = false) => <IntakeChoices opts={opts} multi={multi} presentation={presentation} />;
  const field = (label: string, content: React.ReactNode) => <div className="iq-field"><div className="iq-field-label">{label}</div>{content}</div>;
  switch (c?.kind) {
    case "chips":
    case "multi": return <>
      {choices(c.opts, c.kind === "multi")}
      {!!c.note && field(c.note.label, <textarea className={area} rows={3} placeholder={c.note.ph} aria-label={c.note.label} value={c.note.value ?? ""} onChange={c.note.set} />)}
      {!!c.other && <input className={input} placeholder={c.other.ph} aria-label={c.other.ph} value={c.other.value ?? ""} onChange={c.other.set} />}
      {!review && !!c.cue && <div className="iq-cue iq-warning">{c.cue}</div>}
    </>;
    case "visit": return <>
      {choices(c.opts)}
      {field("Or the date", <input className={input} type="date" aria-label="Visit date" min={c.date.min || undefined} max={c.date.max || undefined} value={c.date.value ?? ""} onChange={c.date.set} />)}
      {!review && !!c.date.why && <div className="iq-cue iq-warning">{c.date.why}</div>}
    </>;
    case "crashdate": return <>
      {choices(c.opts)}
      {!!c.date.show && <input className={input} type="date" max={c.date.max} aria-label="Date of the wreck" value={c.date.value ?? ""} onChange={c.date.set} />}
    </>;
    case "where": return <WhereField value={c.where.value} agreement={v.agreement} onChange={c.where.set} onDone={c.where.done} />;
    case "text": return <><input className={input} placeholder={c.field.ph} aria-label={c.field.ph} value={c.field.value ?? ""} onChange={c.field.set} />{c.unavailable && choices([c.unavailable])}</>;
    case "notes": return <><textarea className={area} rows={7} placeholder={review ? "No story notes captured" : c.field.ph} aria-label="Accident story notes" value={c.field.value ?? ""} onChange={c.field.set} /><StoryAssist helper={v.storyAssist} notes={c.field.value ?? ""} /></>;
    case "providers": return <>
      {!!c.items.length && <div className="fi-chips">{c.items.map((it: any, i: number) => <span key={i} className="fi-tag">{it.label}<button type="button" aria-label={`Remove ${it.label}`} onClick={it.remove}>×</button></span>)}</div>}
      <div className="fi-addrow"><input className={input} placeholder={c.draft.ph} aria-label={c.draft.ph} value={c.draft.value} onChange={c.draft.set} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); c.add(); } }} /><button type="button" className="fi-add" onClick={c.add}>Add</button></div>
      {c.unavailable && choices([c.unavailable])}
    </>;
    case "carrier": return <>
      {!review && <p className="iq-cue">Get insurance information from either side. Collect what they have.</p>}
      {field("Other driver's insurance", <><input className={input} placeholder={c.query.ph} aria-label="Search insurance companies" value={c.query.value} onChange={c.query.set} />{choices(c.opts)}</>)}
      {c.own && field("Client's insurance company, if available", <input className={input} aria-label="Client's insurance company" value={c.own.value} onChange={c.own.set} />)}
      {c.details && field("Policy / claim number and other insurance details, if available", <textarea className={area} rows={3} aria-label="Policy, claim number and insurance details" value={c.details.value} onChange={c.details.set} />)}
      {c.unavailable && choices([c.unavailable])}
    </>;
    case "people": return <>
      {!review && <p className="iq-cue">Every passenger is their own file if they want representation. Capture their details here while you are on the phone.</p>}
      {choices([c.justMe, ...(c.others ? [c.others] : [])])}<button type="button" className="fi-add" onClick={c.add}>+ Add a passenger</button>
      {(c.people || []).map((person: any, i: number) => <div key={person.id || i} className={`${p}-person iq-person`}>
        <div className="fi-addrow"><input className={input} placeholder="Passenger's name" aria-label="Passenger's name" value={person.name ?? ""} onChange={person.setName} /><button type="button" className="fi-add" onClick={person.remove}>Remove</button></div>
        {field("Relationship", choices(choicesFromClasses(person.rels)))}
        {field("Age", choices(choicesFromClasses(person.ages)))}
        {field("Hurt", choices(choicesFromClasses(person.hurts)))}
        {person.ownFile && <>
          {field("Wants representation", choices(choicesFromClasses(person.wantsReps)))}
          {person.wantsRep === "Yes" && <div className="iq-passenger-next">
            {!review && <strong>Collect these while they are on the phone. Their agreement and file are separate.</strong>}
            {field("Date of birth (if available)", <input className={input} type="date" aria-label={`${person.first}'s date of birth`} value={person.dob.value ?? ""} onChange={person.dob.set} />)}
            {!person.minor ? <>
              {field("Their own cell", <input className={input} type="tel" inputMode="tel" aria-label={`${person.first}'s cell`} value={person.cell.value ?? ""} onChange={person.cell.set} />)}
              {field("Their own email", <input className={input} type="email" inputMode="email" aria-label={`${person.first}'s email`} value={person.email.value ?? ""} onChange={person.email.set} />)}
            </> : !review && <div className="iq-cue">The parent or guardian signs. The child goes on the HIPAA pages.</div>}
            {field("Willing to treat", choices(choicesFromClasses(person.willings)))}
            {field("Home address", choices(choicesFromClasses(person.sameAddrs)))}
            {!review ? <PassengerAgreement p={v.paxSend?.find((item: any) => item.id === person.id)} v={v} capture={false} /> : v.passengerLinks?.[person.id] && <a className="iq-passenger-link" href={`/app/${v.passengerLinks[person.id]}`} target="_blank" rel="noopener noreferrer">Open {person.first}'s file ↗</a>}
          </div>}
          {person.wantsRep === "No" && !review && <div className="iq-cue iq-warning">They declined representation. Do not send an agreement.</div>}
        </>}
      </div>)}
    </>;
    case "car": return <div className="fi-car">
      <select className={input} aria-label="Vehicle year" value={c.year.value} onChange={c.year.set}>{c.year.options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
      <input className={input} placeholder="Make" aria-label="Vehicle make" value={c.make.value ?? ""} onChange={c.make.set} />
      <input className={input} placeholder="Model" aria-label="Vehicle model" value={c.model.value ?? ""} onChange={c.model.set} />
    </div>;
    default: return null;
  }
}

export function QuestionDetails({ q, v, presentation = "full", review = false }: { q: any; v: any; presentation?: IntakePresentation; review?: boolean }) {
  return <>
    {!review && !!q.ask && <div className="iq-ask">{q.ask}</div>}
    {!review && !!q.cue && <div className="iq-cue">{q.cue}</div>}
    <QuestionControl c={q.c} v={v} presentation={presentation} review={review} />
    {!review && !!q.soreness && <div className="iq-cue iq-warning">{q.soreness}</div>}
    {q.rep && <div className="iq-rep">
      {!review && <div className="iq-cue">{v.rep.head}. Do not go looking for it. The PNC has to be the one who says they&apos;re unhappy.</div>}
      <IntakeChoices opts={choicesFromClasses(v.rep.unhappy)} presentation={presentation} />
      {v.rep.isUnhappy && <IntakeChoices opts={choicesFromClasses(v.rep.kind)} presentation={presentation} />}
      {v.rep.fender && !review && <div className="iq-cue">The firm charges these back. Close it warm and let it go.</div>}
    </div>}
  </>;
}

export default function IntakeQuestion({ q, v, presentation = "full", review = false }: { q: any; v: any; presentation?: IntakePresentation; review?: boolean }) {
  const prefix = presentation === "form" ? "sf" : presentation === "chore" ? "ch" : "fi";
  const collapsed = presentation === "full" && !q.editing;
  const label = <>{q.label}{q.optional && <span className="iq-optional"> (optional)</span>}</>;
  const attrs = { id: `${prefix}-q-${q.id}`, "data-question-id": q.id, "data-question-required": !q.optional, "data-question-tone": q.tone || "", onFocusCapture: q.focus, onPointerDownCapture: q.focus };
  if (collapsed) return <button type="button" {...attrs} className={`fi-q fi-q-row${q.flash ? " fi-flash" : ""}`} onClick={q.edit} aria-expanded={false}><span className="fi-q-k">{label}</span><span className={`fi-q-v${q.tone ? " fi-tone-" + q.tone : ""}`}>{q.value}</span></button>;
  const details = <QuestionDetails q={q} v={v} presentation={presentation} review={review} />;
  if (presentation === "form") return <div {...attrs} className={`sf-row iq-question${!q.answered && !q.optional ? " sf-need" : ""}`}><div className="sf-l">{label}{q.tone === "bad" && <span className="iq-warning">Problem</span>}</div><div className="sf-c">{details}</div></div>;
  return <div {...attrs} className={presentation === "chore" ? `ch-q iq-question${q.c.kind === "people" || q.c.kind === "notes" || q.rep ? " ch-wide" : ""}` : `fi-q fi-q-edit iq-question${q.flash ? " fi-flash" : ""}`}>
    <div className={presentation === "chore" ? "ch-q-h" : "fi-q-h"}><span className={presentation === "chore" ? "ch-q-l" : "fi-q-k"}>{label}</span>{q.tone === "bad" && <span className="iq-warning">Problem</span>}{presentation === "full" && q.answered && <button type="button" className="fi-q-done" onClick={q.edit}>Done</button>}</div>
    {details}
  </div>;
}

/** Recipient intent is shared too: another number must survive record refresh. */
export function AgreementRecipient({ v, presentation = "full" }: { v: any; presentation?: IntakePresentation }) {
  const cls = presentation === "form" ? "sf-in" : presentation === "chore" ? "ch-in" : "fi-in";
  return <div className="iq-recipient">
    {v.viaText && <>
      <div className="iq-field-label">Text it to</div>
      <IntakeChoices opts={choicesFromClasses(v.textTo)} presentation={presentation} />
      {v.textToOther && <input className={cls} type="tel" inputMode="tel" placeholder={v.herPhoneOk ? "Number to text it to" : "PNC's cell"} aria-label={v.herPhoneOk ? "Number to text it to" : "PNC's cell"} value={v.f.phone.value ?? ""} onChange={v.f.phone.set} />}
    </>}
    {v.viaEmail && <><div className="iq-field-label">PNC&apos;s email</div><input className={cls} type="email" inputMode="email" autoComplete="off" aria-label="PNC's email" value={v.f.email.value ?? ""} onChange={v.f.email.set} /></>}
  </div>;
}
