"use client";
// ============================================================================
// Simple form (Brett, Sep 28): the print layout as a working view. One flat
// page, every question a plain row — label on the left, answer on the right —
// zero chrome, for agents who don't want the fancy views. Same engine, same
// answers, same controls; the frame around it (caller rail, helper, bottom
// bar) is the shared IntakeWorkspace, so tools stay one click away.
// ============================================================================
import WhereField from "./WhereField";
import PlaceField from "./PlaceField";
import { DobField, SsnField } from "./SsnDob";

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

function Control({ c, v }: { c: any; v: any }) {
  switch (c?.kind) {
    case "chips":
    case "multi":
      return (<>
        <Chips opts={c.opts} multi={c.kind === "multi"} />
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
          <label className="sf-radio"><input type="checkbox" checked={!!c.justMe.on} onChange={() => {}} onClick={c.justMe.pick} /><span>{c.justMe.label}</span></label>
          <button type="button" className="sf-btn sf-line" onClick={c.add}>+ Add a passenger</button>
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
function SendBlock({ v, where }: { v: any; where: any }) {
  return (
    <div className="sf-rows">
      <div className={`sf-row${v.agreementKnown ? "" : " sf-need"}`}><label className="sf-l">Agreement</label><div className="sf-c">
        <b>{v.agreement}</b>
        {!v.agreementKnown && where && (<>
          <div className="sf-mini">The agreement follows the state where the wreck happened, not the home address</div>
          <Control c={where.c} v={v} />
        </>)}
      </div></div>
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
  const row = (label: string, body: any, need = false) => (
    <div className={`sf-row${need ? " sf-need" : ""}`}><label className="sf-l">{label}</label><div className="sf-c">{body}</div></div>
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
            {v.canResend && <button type="button" className="sf-btn sf-line" onClick={v.resendLink}>Send the link again</button>}
            {v.canVoid && <button type="button" className="sf-btn sf-line" onClick={v.voidAgreement}>{v.voidLabel}</button>}
          </div>
        </>))}
      </div>
    )}
    <div className="sf-rows">
      {row("Date of birth", <DobField cls="ch" value={v.f.dob.value ?? ""} onChange={(t: string) => v.f.dob.set({ target: { value: t } })} />, !v.f.dob.value)}
      {row("Social Security number", <SsnField cls="ch" value={v.f.ssn.value ?? ""} requireFull={!!v.ssnRequireFull} storedMode={v.f.ssnMode.value ?? null} onMode={(m: string) => v.f.ssnMode.set({ target: { value: m } })} onChange={(t: string) => v.f.ssn.set({ target: { value: t } })} />)}
      {row("Finish the agreement", (<>
        {v.agreementOpen && (
          <div className="sf-addrow">
            <button type="button" className="sf-btn" disabled={!!v.agreementLocked} onClick={v.completeAgreement}>{v.completeLabel}</button>
            <button type="button" className="sf-btn sf-line" onClick={v.leaveForQa}>Leave it for QA</button>
          </div>
        )}
        {v.agreementClosed && <div>{v.agreementNote}</div>}
        {v.agreementParked && <button type="button" className="sf-btn sf-line" style={{ marginTop: 6 }} onClick={v.reopenAgreement}>Reopen and finish it now</button>}
        {v.hasFileError && <div className="sf-bad">{v.fileError}</div>}
      </>))}
      {row("Home address", <PlaceField kind="address" label="Home address" placeholder="Start typing, pick the match" value={v.f.addr.value ?? ""} onChange={(t: string) => v.f.addr.set({ target: { value: t } })} />, !v.f.addr.value)}
      {row("Driver's license", <input className="sf-in" aria-label="Driver's license number" value={v.f.dl.value ?? ""} onChange={v.f.dl.set} />)}
      {row("Emergency contact", (<>
        <div className="sf-addrow">
          <input className="sf-in" placeholder="Name" aria-label="Emergency contact name" value={v.f.ecName.value ?? ""} onChange={v.f.ecName.set} />
          <input className="sf-in" type="tel" inputMode="tel" placeholder="Phone" aria-label="Emergency contact phone" value={v.f.ecPhone.value ?? ""} onChange={v.f.ecPhone.set} />
        </div>
        <div style={{ marginTop: 6 }}>{chips(v.ecRel)}</div>
      </>))}
      {v.signed && (v.paxSend || []).map((p: any, i: number) => row(p.title, (<>
        <div>{p.note}</div>
        {p.needCell && p.ready && (<>
          <input className="sf-in" type="tel" inputMode="tel" placeholder="Their own cell" aria-label="Passenger's own cell" value={p.cell.value ?? ""} onChange={p.cell.set} />
          <div className="sf-bad">Add their own cell first. It never texts to the caller&apos;s phone.</div>
        </>)}
        {p.needEmail && p.ready && (<>
          <input className="sf-in" type="email" inputMode="email" autoComplete="off" placeholder="Their own email" aria-label="Passenger's own email" value={p.email.value ?? ""} onChange={p.email.set} />
          <div className="sf-bad">Add their own email first. It never goes to the caller&apos;s email.</div>
        </>)}
        {p.shared && p.ready && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <input type="checkbox" checked={!!p.shareOk} onChange={p.confirmShare} />
            That&apos;s the caller&apos;s own {v.viaEmail ? "email" : "number"}. The passenger confirmed they share it.
          </label>
        )}
        {p.ready && <button type="button" className="sf-btn" style={{ marginTop: 6 }} onClick={p.send}>{p.button}</button>}
        {p.live && <div className="sf-steps" style={{ marginTop: 6 }}>{(p.steps || []).map((st: any, j: number) => <span key={j} className={/done/.test(st.cls) ? "sf-st sf-st-on" : "sf-st"}>{st.label}</span>)}</div>}
      </>)))}
    </div>
    {finish && (
      <div className="sf-rows" style={{ marginTop: 12 }}>
        <div className="sf-row sf-send"><label className="sf-l">{v.saveBad ? <span className="sf-bad">{v.saveError}</span> : (v.saveText || "Saves as you go")}</label><div className="sf-c">
          <button type="button" className="sf-btn sf-go" disabled={!!finish.disabled} onClick={finish.go}>{finish.label || "Finish the call"}</button>
          {finish.ask && <div className="sf-bad" role="alert">{finish.askText}</div>}
        </div></div>
      </div>
    )}
  </>);
}

export default function FormView({ v }: { v: any }) {
  const fi = v.fi;
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
          {r.id === "retainer" ? (<>
            {v.sendReady && <SendBlock v={v} where={where} />}
            <FileBlock v={v} finish={r.next ? null : fi.chore?.finish} />
          </>) : (
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
    </div>
  );
}
