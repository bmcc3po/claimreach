"use client";
// ============================================================================
// Simple form (Brett, Sep 28): the print layout as a working view. One flat
// page, every question a plain row — label on the left, answer on the right —
// zero chrome, for agents who don't want the fancy views. Same engine, same
// answers, same controls; the frame around it (caller rail, helper, bottom
// bar) is the shared IntakeWorkspace, so tools stay one click away.
// ============================================================================
import { Fragment } from "react";
import WhereField from "./WhereField";

function Chips({ opts }: { opts: any[] }) {
  return (
    <div className="sf-chips">
      {(opts || []).map((o: any, i: number) => (
        <button key={i} type="button" className={`sf-chip${o.on ? " sf-on" : ""}`} aria-pressed={!!o.on} onClick={o.pick}>
          {o.label}{!!o.sub && <small> {o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

function Control({ c, v }: { c: any; v: any }) {
  switch (c?.kind) {
    case "chips":
    case "multi":
      return (<>
        <Chips opts={c.opts} />
        {!!c.note && <textarea className="sf-in sf-area" rows={2} placeholder={c.note.ph} aria-label={c.note.label} value={c.note.value ?? ""} onChange={c.note.set} />}
        {!!c.other && <input className="sf-in" placeholder={c.other.ph} aria-label={c.other.ph} value={c.other.value} onChange={c.other.set} />}
      </>);
    case "visit":
      return (<>
        <Chips opts={c.opts} />
        <input className="sf-in sf-date" type="date" min={c.date.min || undefined} max={c.date.max || undefined} value={c.date.value ?? ""} onChange={c.date.set} aria-label="Date" />
        {!!c.date.why && <div className="sf-bad">{c.date.why}</div>}
      </>);
    case "crashdate":
      return (<>
        <Chips opts={c.opts} />
        {!!c.date.show && <input className="sf-in sf-date" type="date" max={c.date.max} aria-label="Date of the wreck" value={c.date.value ?? ""} onChange={c.date.set} />}
      </>);
    case "where":
      return <WhereField value={c.where.value} agreement={v.agreement} onChange={c.where.set} onDone={c.where.done} />;
    case "text":
      return <input className="sf-in" placeholder={c.field.ph} aria-label={c.field.ph} value={c.field.value ?? ""} onChange={c.field.set} />;
    case "notes":
      return <textarea className="sf-in sf-area" rows={3} aria-label="Notes" placeholder={c.field.ph} value={c.field.value ?? ""} onChange={c.field.set} />;
    case "providers":
      return (<>
        {c.items.length > 0 && (
          <div className="sf-chips">
            {c.items.map((it: any, i: number) => (
              <span key={i} className="sf-tag">{it.label}<button type="button" aria-label={`Remove ${it.label}`} onClick={it.remove}>×</button></span>
            ))}
          </div>
        )}
        <div className="sf-addrow">
          <input className="sf-in" placeholder={c.draft.ph} aria-label={c.draft.ph} value={c.draft.value} onChange={c.draft.set}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); c.add(); } }} />
          <button type="button" className="sf-btn sf-line" onClick={c.add}>Add</button>
        </div>
      </>);
    case "carrier":
      return (<>
        <input className="sf-in" placeholder={c.query.ph} aria-label="Search insurance companies" value={c.query.value} onChange={c.query.set} />
        <Chips opts={c.opts} />
      </>);
    case "people":
      return (<>
        <div className="sf-chips">
          <button type="button" className={`sf-chip${c.justMe.on ? " sf-on" : ""}`} onClick={c.justMe.pick}>{c.justMe.label}</button>
          <button type="button" className="sf-chip" onClick={c.add}>+ Add a passenger</button>
        </div>
        {c.people.map((p: any, i: number) => (
          <div key={i} className="sf-person">
            <div className="sf-addrow">
              <input className="sf-in" placeholder="Passenger's name" aria-label="Passenger's name" value={p.name ?? ""} onChange={p.setName} />
              <button type="button" className="sf-btn sf-line" onClick={p.remove}>Remove</button>
            </div>
            <div className="sf-mini">Age</div><Chips opts={(p.ages || []).map((a: any) => ({ label: a.label, on: / on/.test(a.cls), pick: a.pick }))} />
            <div className="sf-mini">Hurt</div><Chips opts={(p.hurts || []).map((a: any) => ({ label: a.label, on: / on/.test(a.cls), pick: a.pick }))} />
            {p.ownFile && (<>
              {!p.minor && (<><div className="sf-mini">Their own cell</div>
              <input className="sf-in" type="tel" inputMode="tel" aria-label={`${p.first}'s cell`} value={p.cell.value ?? ""} onChange={p.cell.set} /></>)}
              <div className="sf-mini">Wants representation</div><Chips opts={(p.wantsReps || []).map((a: any) => ({ label: a.label, on: / on/.test(a.cls), pick: a.pick }))} />
              <div className="sf-mini">Willing to treat</div><Chips opts={(p.willings || []).map((a: any) => ({ label: a.label, on: / on/.test(a.cls), pick: a.pick }))} />
              <div className="sf-mini">Home address</div><Chips opts={(p.sameAddrs || []).map((a: any) => ({ label: a.label, on: / on/.test(a.cls), pick: a.pick }))} />
            </>)}
          </div>
        ))}
      </>);
    case "car":
      return (
        <div className="sf-addrow">
          <select className="sf-in" aria-label="Year" value={c.year.value ?? ""} onChange={c.year.set}>{(c.year.options || []).map((o: any, i: number) => <option key={i} value={o}>{o}</option>)}</select>
          <input className="sf-in" placeholder="Make" aria-label="Make" value={c.make.value ?? ""} onChange={c.make.set} />
          <input className="sf-in" placeholder="Model" aria-label="Model" value={c.model.value ?? ""} onChange={c.model.set} />
        </div>
      );
    default:
      return null;
  }
}

/** The retainer block, form-plain: signer, injured, how it sends, send. */
function SendBlock({ v }: { v: any }) {
  return (
    <div className="sf-rows">
      <div className="sf-row"><label className="sf-l">Agreement</label><div className="sf-c"><b>{v.agreement}</b></div></div>
      <div className="sf-row"><label className="sf-l">Signer&apos;s full name</label><div className="sf-c"><input className="sf-in" aria-label="Signer's full name" value={v.f.client.value ?? ""} onChange={v.f.client.set} /></div></div>
      <div className="sf-row"><label className="sf-l">Injured person</label><div className="sf-c">
        <Chips opts={(v.injuredWho || []).map((c: any) => ({ label: c.label, on: / on/.test(c.cls), pick: c.pick }))} />
        {v.injuredOther && <input className="sf-in" aria-label="Injured person's full name" placeholder="Injured person's full name" value={v.f.injured.value ?? ""} onChange={v.f.injured.set} />}
      </div></div>
      {!!(v.nv && v.nv.show) && (
        <div className="sf-row"><label className="sf-l">Nevada agreement</label><div className="sf-c">
          <Chips opts={[{ label: "Tiered (standard)", on: v.nv.tiered, pick: v.nv.pickTiered }, { label: "Non-tiered (needs approval)", on: !v.nv.tiered, pick: v.nv.pickFlat }]} />
          {!v.nv.tiered && (<>
            <input className="sf-in" maxLength={300} placeholder='Who approved it, e.g. "Brett approved, friend and family"' aria-label="Non-tiered approval reason" value={v.nv.reason.value ?? ""} onChange={v.nv.reason.set} />
            {v.nv.needReason && <div className="sf-bad">The non-tiered agreement only sends with the approval reason.</div>}
          </>)}
        </div></div>
      )}
      <div className="sf-row"><label className="sf-l">Send it by</label><div className="sf-c">
        <Chips opts={(v.via || []).map((c: any) => ({ label: c.label, on: / on/.test(c.cls), pick: c.pick }))} />
        {v.viaText && <input className="sf-in" type="tel" inputMode="tel" placeholder="Cell to text it to" aria-label="Cell to text it to" value={v.f.phone.value ?? ""} onChange={v.f.phone.set} />}
        {v.viaEmail && <input className="sf-in" type="email" inputMode="email" autoComplete="off" placeholder="PNC's email" aria-label="PNC's email" value={v.f.email.value ?? ""} onChange={v.f.email.set} />}
      </div></div>
      <div className="sf-row sf-send"><label className="sf-l" aria-hidden="true"></label><div className="sf-c">
        {!!v.previewHref && <a className="sf-link" href={v.previewHref} target="_blank" rel="noopener">Preview the agreement</a>}
        {v.hasSendError && <div className="sf-bad">{v.sendError}</div>}
        {v.sendWarn && <div className="sf-bad">{v.sendWarnText}</div>}
        {v.sendReady
          ? <button type="button" className="sf-btn sf-go" disabled={!!v.sendNext.disabled} onClick={v.sendNext.go}>Send the agreement</button>
          : <div className="sf-steps">{(v.sendSteps || []).map((st: any, i: number) => <span key={i} className={/done/.test(st.cls) ? "sf-st sf-st-on" : "sf-st"}>{st.label}</span>)}</div>}
      </div></div>
    </div>
  );
}

export default function FormView({ v }: { v: any }) {
  const fi = v.fi;
  const secQs = (id: string) => (fi.sections.find((s: any) => s.id === id) || { questions: [] }).questions;
  return (
    <div className="sf">
      {(fi.chore?.rows || []).map((r: any) => (
        <section key={r.id} id={`sf-sec-${r.id}`} className="sf-sec" onPointerDownCapture={r.enter} onFocusCapture={r.enter}>
          <h2 className="sf-h">{r.label}</h2>
          {r.id === "retainer" ? <SendBlock v={v} /> : (
            <div className="sf-rows">
              {secQs(r.id).map((q: any) => (
                <div key={q.id} className={`sf-row${q.answered ? "" : " sf-need"}`}>
                  <label className="sf-l">{q.label}{q.optional ? <span className="sf-opt"> (optional)</span> : null}</label>
                  <div className="sf-c"><Control c={q.c} v={v} /></div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
      <Fragment />
    </div>
  );
}
