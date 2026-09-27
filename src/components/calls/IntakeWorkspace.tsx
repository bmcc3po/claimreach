"use client";
// ============================================================================
// Full Intake on an iPad in landscape or on a computer: three areas around the
// same page the phone uses. Left is the caller (who, the call, the lead, the
// six qualifiers, quick notes). The middle is the intake itself (FullIntake's
// FiBody, unchanged). Right is what's next, what's missing and the live
// summary. Nothing here holds an answer; every tap goes to the call engine, so
// turning the iPad, resizing the window, or picking the call up on another
// device lands on the same section with the same answers.
// ============================================================================
import { useState } from "react";
import { REBS } from "@/lib/mva-call/engine";

const LIGHT_WORD: Record<string, string> = { ok: "Good", bad: "Problem", flag: "Check", none: "Not yet" };

/** Which rebuttals fit the part of the intake that's open. */
const PHASES_FOR: Record<string, string[]> = {
  incident: ["open", "story"], injury: ["body"], treatment: ["body"], insurance: ["body"], vehicle: ["send"], notes: ["send"],
};

export function WsLeft({ v }: { v: any }) {
  const fi = v.fi;
  const lead = fi.lead;
  const notes = String(v.f?.text?.value || "").split("\n").map((t) => t.trim()).filter(Boolean).reverse().slice(0, 8);
  const desk = v.ws === "desk";
  return (
    <aside className="ws-left" aria-label="Caller">
      <section className="ws-caller">
        <a className="ws-back" href="/app">All calls</a>
        <div className="ws-name">{v.callerName}</div>
        {(!!v.leadNo || !!v.campaignName) && <div className="ws-sub">{[v.leadNo, v.campaignName].filter(Boolean).join(", ")}</div>}
        {!!v.callerPhone && <div className="ws-contact">{v.callerPhone}</div>}
        {!!v.callerEmail && <div className="ws-contact ws-email">{v.callerEmail}</div>}
        <div className="ws-status">
          <span className="ws-live" aria-hidden="true" />
          <span>On the call</span>
          <span className="ws-clock">{v.clockText}</span>
        </div>
        {!!v.saveText && <div className={`ws-save${v.saveBad ? " ws-save-bad" : ""}`} role="status">{v.saveBad ? v.saveError : v.saveText}</div>}
        <div className="ws-ctl">
          {desk && <button type="button" className="ws-btn" onClick={v.openPhone}>Call</button>}
          <button type="button" className="ws-btn" onClick={v.openText}>
            {desk ? "Text" : "Call or text"}
            {!!v.textBadge && <span className="ws-badge">{v.textUnread}</span>}
          </button>
          <button type="button" className="ws-btn ws-end" onClick={v.openDispo}>End call</button>
        </div>
      </section>

      {!!lead && (
        <section className="ws-block">
          <div className="ws-h">Campaign and source</div>
          {!!lead.from && <div className="ws-src">{lead.from}</div>}
          {!!lead.tags && <div className="ws-tags">From the lead: {lead.tags}</div>}
          {!!lead.said && (
            <button type="button" className="ws-link" onClick={lead.toggle} aria-expanded={!!lead.open}>
              {lead.open ? "Hide what she told the marketer" : "What she told the marketer"}
            </button>
          )}
          {!!lead.open && !!lead.said && <div className="ws-said">{lead.said}</div>}
        </section>
      )}

      <section className="ws-block">
        <div className="ws-h">Qualifiers</div>
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

export function WsSummary({ v }: { v: any }) {
  const fi = v.fi;
  const [openReb, setOpenReb] = useState<string | null>(null);
  const bySec: { id: string; label: string; items: any[] }[] = [];
  for (const m of fi.missing || []) {
    let g = bySec.find((x) => x.id === m.sec);
    if (!g) { g = { id: m.sec, label: m.secLabel, items: [] }; bySec.push(g); }
    g.items.push(m);
  }
  const phases = PHASES_FOR[fi.openSec || "incident"] || ["story"];
  const lines = REBS.filter((r: any) => phases.includes(r.phase)).slice(0, 3);
  const fill = (t: string) => String(t || "").replace(/\{FIRM\}/g, v.firmSpoken).replace(/\{NAME\}/g, v.callerFirst || "");
  const secLabel = (id: string) => (fi.sections.find((s: any) => s.id === id) || { label: "" }).label;
  const gap = fi.sections.find((s: any) => s.id === "treatment")?.gap;
  return (
    <div className="ws-sum">
      <section className="ws-next">
        <div className="ws-h">Next best action</div>
        {fi.lights.bad && <div className="ws-problem">Problem: {fi.lights.text}</div>}
        {fi.next ? (<>
          <div className="ws-next-sec">{secLabel(fi.next.sec)}</div>
          <div className="ws-next-q">{fi.next.label.replace(/^Next: /, "")}</div>
          {!!fi.next.ask && <div className="ws-next-ask">{fi.next.ask}</div>}
        </>) : (<>
          <div className="ws-next-q">Everything required is captured.</div>
          <div className="ws-next-ask">{fi.finish.label}</div>
        </>)}
      </section>

      <section className="ws-block">
        <div className="ws-h">Missing information <span className="ws-count">{(fi.missing || []).length}</span></div>
        {bySec.length === 0 && <div className="ws-empty">Nothing required is missing.</div>}
        {bySec.map((g) => (
          <div key={g.id} className="ws-miss">
            <div className="ws-miss-h">{g.label}</div>
            <div className="ws-miss-items">
              {g.items.map((m: any) => <button key={m.id} type="button" className="ws-miss-b" onClick={m.go}>{m.label}</button>)}
            </div>
          </div>
        ))}
      </section>

      <section className="ws-block">
        <div className="ws-h">Live summary</div>
        <div className="ws-rows">
          {fi.sections.map((s: any) => (
            <button key={s.id} type="button" className={`ws-row${s.open ? " ws-on" : ""}`} onClick={fi.bookmarks.find((b: any) => b.id === s.id)?.go}>
              <span className="ws-row-k">{s.label}</span>
              <span className={`ws-row-v${s.status === "empty" ? " ws-row-empty" : ""}`}>{s.summary || "Nothing yet"}</span>
            </button>
          ))}
          {!!gap && (
            <div className={`ws-row ws-gap ws-gap-${String(gap.cls).replace(/.*gaprow ?/, "") || "none"}`}>
              <span className="ws-row-k">30-day check</span>
              <span className="ws-row-v">{gap.value}{gap.sub ? `. ${gap.sub}` : ""}</span>
            </div>
          )}
        </div>
      </section>

      <section className="ws-block">
        <div className="ws-h">Rebuttals</div>
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
        <button type="button" className="ws-link" onClick={v.openSheet}>All rebuttals and lines</button>
      </section>
    </div>
  );
}
