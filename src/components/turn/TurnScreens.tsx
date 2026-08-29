"use client";

import type { ReactNode } from "react";
import type { IngestResult, PlaybookHitId, TurnFile, WhyKey } from "@/lib/turn/types";
import { WHY_CHIPS } from "@/lib/turn/types";
import { clientName, personByRole, primaryCarrier, providerByKind } from "@/lib/turn/seed";
import { lastHumanLabel, limitsLabel, lorLabel, recordsLabel, storedFacts } from "@/lib/turn/fields";
import { pulledBrief, screamSayLine, whyYelling, whyYouAreHere } from "@/lib/turn/brief";
import { MISSING } from "@/lib/turn/types";
import { BOLTON_BUTTON, SHELL_MARK } from "@/lib/turn/shell";
import { FileShell, ShellLegend } from "./TurnShell";

function Facts({ file }: { file: TurnFile }) {
  const f = storedFacts(file);
  return (
    <div className="turn-facts">
      <div className="turn-fact"><div className="k">MMI</div><div className="v">{f.mmi}</div></div>
      <div className="turn-fact"><div className="k">Last treat</div><div className="v">{f.lastTreat}</div></div>
      <div className="turn-fact"><div className="k">Next</div><div className="v">{f.nextTreat}</div></div>
      <div className="turn-fact"><div className="k">Left to do</div><div className="v">{f.leftToDo}</div></div>
    </div>
  );
}

export function WhyScreen(props: {
  file: TurnFile;
  why: WhyKey | null;
  text: string;
  onWhy: (w: WhyKey) => void;
  onText: (v: string) => void;
  onTell: () => void;
}) {
  const f = storedFacts(props.file);
  const name = clientName(props.file);
  const carrier = primaryCarrier(props.file);
  return (
    <div className="turn-wrap">
      <h1 className="turn-h1">{name}</h1>
      <p className="turn-sub">{props.file.fileNo} · {props.file.caseType} · {props.file.phase}</p>
      <div className="turn-pills">
        <span className="turn-pill"><strong>DOI</strong> {f.doi}</span>
        <span className="turn-pill"><strong>SOL</strong> {f.sol}</span>
        <span className="turn-pill"><strong>{carrier?.name || "Carrier"}</strong> {carrier?.claimNo || MISSING}</span>
        <span className="turn-pill"><strong>Last human</strong> {lastHumanLabel(props.file)}</span>
      </div>
      <div className="turn-card">
        <p className="turn-kicker">Concierge</p>
        <h2 className="turn-q">Why are you in this file?</h2>
        <p className="turn-hint">Pick one. The screen paints itself. You do not have to click around.</p>
        <div className="turn-chips">
          {WHY_CHIPS.map((c) => (
            <button key={c.key} type="button" className={`turn-chip ${props.why === c.key ? "on" : ""}`} onClick={() => props.onWhy(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="turn-tell">
          <input
            value={props.text}
            onChange={(e) => props.onText(e.target.value)}
            placeholder="he's screaming about the check and nobody calling"
            onKeyDown={(e) => e.key === "Enter" && props.onTell()}
          />
          <button type="button" className="turn-btn" onClick={props.onTell}>Tell me</button>
        </div>
        <p className="turn-foot">Bolt-on · JustCall already knows it&apos;s the client if the call is live. You only type when you opened the file yourself.</p>
        <Facts file={props.file} />
        <p className="turn-foot">Or skip. The full file is still under this. Concierge is a door, not a wall. {SHELL_MARK}.</p>
      </div>
      <ShellLegend />
      <FileShell file={props.file} />
    </div>
  );
}

export function ScreamScreen(props: {
  file: TurnFile;
  note: string;
  onNote: (v: string) => void;
  onIngest: () => void;
}) {
  const yell = whyYelling(props.file);
  const brief = `${pulledBrief(props.file)} ${screamSayLine(props.file)}`;
  const f = storedFacts(props.file);
  return (
    <div>
      <div style={{ padding: "16px 22px 8px" }}>
        <p className="turn-kicker">Why you&apos;re here</p>
        <p style={{ margin: "0 0 10px", fontWeight: 700 }}>{whyYouAreHere("client_phone", props.file)}</p>
        <p className="turn-kicker">Concierge · pulled, not invented</p>
        <p style={{ margin: "0 0 12px", maxWidth: 1100 }}>{brief}</p>
        <div className="turn-pills">
          <span className="turn-pill teal">MMI no</span>
          <span className="turn-pill teal">Treat {f.lastTreat}</span>
          <span className="turn-pill teal">Next {f.nextTreat}</span>
          <span className="turn-pill teal">Left {f.leftToDo}</span>
          <span className="turn-pill teal">Records {props.file.recordsIn}/{props.file.recordsTotal}</span>
          <span className="turn-pill teal">Money PD check {f.pdCheck}</span>
        </div>
        <h1 className="turn-h1" style={{ fontSize: 28 }}>{clientName(props.file)} <span className="turn-sub" style={{ fontSize: 16 }}>{props.file.fileNo} · {props.file.caseType} · {props.file.phase} · {f.carrier} {f.claimNo}</span></h1>
      </div>
      <div className="turn-wrap" style={{ paddingTop: 0 }}>
        <div className="turn-cols">
          <div className="turn-card">
            <p className="turn-kicker">Why he&apos;s yelling</p>
            <h2 className="turn-yell">{yell.headline}</h2>
            <p className="turn-hint">{yell.body}</p>
            <div className="turn-row"><span className="k">KEEP ladder</span><span>{f.keep}</span></div>
            <div className="turn-row"><span className="k">MMI</span><span>{f.mmi}</span></div>
            <div className="turn-row"><span className="k">Left to treat</span><span>{f.leftToDo}</span></div>
            <div className="turn-row"><span className="k">Limits</span><span>{f.limits}</span></div>
          </div>
          <div className="turn-card">
            <p className="turn-kicker">Last we did</p>
            <div className="turn-tl">
              {props.file.timeline.map((t) => (
                <div key={t.id} className="turn-tl-item">
                  <div className="when">{shortWhen(t.on)} · {t.label}</div>
                  <div>{t.text}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="turn-card">
            <p className="turn-kicker">Note this call</p>
            <textarea className="turn-area" value={props.note} onChange={(e) => props.onNote(e.target.value)} placeholder="Client angry, 19 days no human..." />
            <button type="button" className="turn-btn" style={{ marginTop: 12 }} onClick={props.onIngest}>Ingest this note</button>
            <p className="turn-foot">Haiku maps the note to rows. Nothing lands until you stay or end.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortWhen(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(dt);
}

export function AdjusterScreen(props: {
  file: TurnFile;
  note: string;
  onNote: (v: string) => void;
  onIngest: () => void;
}) {
  const f = storedFacts(props.file);
  const carrier = primaryCarrier(props.file);
  const insured = personByRole(props.file, "insured");
  return (
    <div className="turn-wrap">
      <h1 className="turn-h1">{clientName(props.file)}</h1>
      <p className="turn-sub">{props.file.fileNo} · {props.file.caseType} · {props.file.phase}</p>
      <div className="turn-pills">
        <span className="turn-pill"><strong>DOI</strong> {f.doi}</span>
        <span className="turn-pill"><strong>SOL</strong> {f.sol}</span>
        <span className="turn-pill"><strong>Insured</strong> {insured ? `${insured.firstName} ${insured.lastName}` : MISSING}</span>
        <span className="turn-pill"><strong>LOR</strong> {lorLabel(props.file)}</span>
        <span className="turn-pill"><strong>Records</strong> {recordsLabel(props.file)}</span>
      </div>
      <div className="turn-cols">
        <div className="turn-card">
          <p className="turn-kicker">Need to know · she will ask</p>
          <div className="turn-q" style={{ fontSize: 32 }}>{carrier?.claimNo || MISSING}</div>
          <p className="turn-hint">Claim number — read it slowly</p>
          <div className="turn-row"><span className="k">Carrier</span><span>{f.carrier}</span></div>
          <div className="turn-row"><span className="k">Insured</span><span>{f.insured}</span></div>
          <div className="turn-row"><span className="k">DOI</span><span>{f.doi}</span></div>
          <div className="turn-row"><span className="k">Limits</span><span>{limitsLabel(props.file)}</span></div>
          <div className="turn-row"><span className="k">Injuries</span><span>{f.injuries}</span></div>
          <div className="turn-row"><span className="k">Last offer</span><span>{f.lastOffer}</span></div>
        </div>
        <div className="turn-card">
          <p className="turn-kicker">We said / they said</p>
          <div className="turn-tl">
            {props.file.timeline.map((t) => (
              <div key={t.id} className="turn-tl-item">
                <div className="when">{shortWhen(t.on)} · {t.label}</div>
                <div>{t.text}</div>
              </div>
            ))}
            <div className="turn-tl-item">
              <div className="when">Today</div>
              <div>This call</div>
            </div>
          </div>
        </div>
        <div className="turn-card">
          <p className="turn-kicker">Type while you talk</p>
          <textarea className="turn-area" value={props.note} onChange={(e) => props.onNote(e.target.value)} placeholder="Dana says claim is open..." />
          <div className="turn-chips" style={{ marginTop: 12 }}>
            <button type="button" className="turn-chip on" onClick={() => props.onNote(props.note ? props.note : "Asked for limits again.")}>Asked for limits</button>
            <button type="button" className="turn-chip on" onClick={() => props.onNote((props.note + " They missing LOR.").trim())}>They missing LOR</button>
            <button type="button" className="turn-chip on" onClick={() => props.onNote((props.note + " Callback Mon.").trim())}>Callback Mon</button>
          </div>
          <button type="button" className="turn-btn" onClick={props.onIngest}>Ingest</button>
          <p className="turn-foot">Saves as Call · Adjuster · Maya. Can queue a LOR resend from here. Does not mail.</p>
        </div>
      </div>
    </div>
  );
}

export function PaintScreen(props: { file: TurnFile; why: WhyKey; onIngest: () => void; onBack: () => void }) {
  const f = storedFacts(props.file);
  const title = WHY_CHIPS.find((w) => w.key === props.why)?.label || "File";
  const chiro = providerByKind(props.file, "chiro");
  return (
    <div className="turn-wrap">
      <h1 className="turn-h1">{clientName(props.file)}</h1>
      <p className="turn-sub">{title}. Pulled from rows. Empty says {MISSING}.</p>
      <div className="turn-card">
        {props.why === "mmi" && (
          <>
            <p className="turn-kicker">MMI</p>
            <h2 className="turn-q">{f.mmi}</h2>
            <p>Last treat: {f.lastTreat}. Next: {f.nextTreat}. Left: {f.leftToDo}.</p>
          </>
        )}
        {props.why === "left_to_treat" && (
          <>
            <p className="turn-kicker">Left to treat</p>
            <h2 className="turn-q">{f.leftToDo}</h2>
            <p>Valley Chiro last visit: {chiro?.lastVisit || MISSING}. Agent will not invent a visit.</p>
          </>
        )}
        {props.why === "records" && (
          <>
            <p className="turn-kicker">Records</p>
            <h2 className="turn-q">{f.records}</h2>
            <p>Limits: {f.limits}. LOR: {f.lor}. Records are document pointers on the shell. ChartSwap is a hospital toll, not this path.</p>
          </>
        )}
        {props.why === "clerk" && (
          <>
            <p className="turn-kicker">Clerk / court</p>
            <h2 className="turn-q">No court dates on the file.</h2>
            <p>SOL {f.sol}. Phase {props.file.phase}.</p>
          </>
        )}
        {props.why === "looking" && (
          <>
            <p className="turn-kicker">Looking</p>
            <p>{pulledBrief(props.file)}</p>
            <Facts file={props.file} />
            <FileShell file={props.file} />
          </>
        )}
        <div className="turn-chips" style={{ marginTop: 16 }}>
          <button type="button" className="turn-btn" onClick={props.onIngest}>Dump English</button>
          <button type="button" className="turn-chip" onClick={props.onBack}>Back to why</button>
        </div>
      </div>
    </div>
  );
}

export function IngestScreen(props: {
  file: TurnFile;
  text: string;
  onText: (v: string) => void;
  result: IngestResult | null;
  armed: PlaybookHitId[];
  busy: boolean;
  err: string | null;
  onIngest: () => void;
  onToggle: (id: PlaybookHitId) => void;
  onLand: () => void;
}) {
  return (
    <div className="turn-wrap">
      <h1 className="turn-h1">{clientName(props.file)}</h1>
      <p className="turn-sub">Dump it in English. Agent writes the note, diffs the file, hits the playbook. You do not spend 30 minutes.</p>
      <div className="turn-cols two">
        <div className="turn-card">
          <p className="turn-kicker">What you typed</p>
          <textarea className="turn-area" value={props.text} onChange={(e) => props.onText(e.target.value)} />
          <p className="turn-foot">Plain language. Typos fine. Do not write &apos;pursuant to.&apos; That is the agent&apos;s job.</p>
          <button type="button" className="turn-btn" style={{ marginTop: 12 }} disabled={props.busy} onClick={props.onIngest}>
            {props.busy ? "Reading…" : `${BOLTON_BUTTON.haiku} · extract`}
          </button>
          {props.err && <p className="turn-foot" style={{ color: "#c2302a" }}>{props.err}</p>}
        </div>
        <div className="turn-card">
          <p className="turn-kicker">File note · ready to land</p>
          {props.result ? (
            <>
              <p className="turn-muted">{props.result.noteMeta} · {props.result.source === "haiku" ? BOLTON_BUTTON.haiku : `${SHELL_MARK} parser`}</p>
              <p>{props.result.note}</p>
            </>
          ) : (
            <p className="turn-hint">Nothing drafted yet. Tap Ingest.</p>
          )}
        </div>
        <div className="turn-card">
          <p className="turn-kicker">Compared to the file</p>
          {props.result?.diff.map((d) => (
            <div key={d.field} className={`turn-row ${d.changed ? "turn-hi" : ""}`}>
              <span className="k">{d.field}</span>
              <span>{d.before}{d.changed ? ` → ${d.after}` : d.after !== "unchanged" ? ` · ${d.after}` : ""}</span>
            </div>
          )) || <p className="turn-hint">Diff appears after ingest.</p>}
        </div>
        <div className="turn-card">
          <p className="turn-kicker">Playbook hits · you tap, it sends</p>
          {props.result?.hits.length ? props.result.hits.map((h) => (
            <div key={h.id} className="turn-row">
              <span>{h.playbook} · {h.label}</span>
              <button
                type="button"
                className={`turn-chip ${props.armed.includes(h.id) ? "on" : ""}`}
                onClick={() => props.onToggle(h.id)}
              >{h.button}</button>
            </div>
          )) : <p className="turn-hint">No hits until ingest.</p>}
          <p className="turn-foot">Tap to arm. Nothing mails or texts. Land writes the file.</p>
        </div>
      </div>
      {props.result && (
        <div className="turn-card" style={{ marginTop: 14 }}>
          <p className="turn-kicker">Writes when you land · nothing invents a provider or MMI</p>
          <div className="turn-writes">
            {props.result.writes.map((w) => (
              <div key={w.key} className="row"><span className="k">{w.key}</span><span>{w.value}</span></div>
            ))}
          </div>
          <button type="button" className="turn-btn" style={{ marginTop: 16 }} onClick={props.onLand}>Land on file</button>
        </div>
      )}
    </div>
  );
}

export function KeepScreen(props: {
  file: TurnFile;
  smsNote: string | null;
  onAsk: (key: "chiro" | "contact" | "pd_check", value: string) => void;
  onAssign: (id: string) => void;
  onQueueLor: () => void;
  onSendSms: () => void;
}) {
  const f = storedFacts(props.file);
  const chiro = providerByKind(props.file, "chiro");
  return (
    <div>
      <div className="turn-banner ok">
        Not MMI. Last treat {f.lastTreat}. Chiro (Valley) last visit {chiro?.lastVisit || "not on file"}. {props.file.nextTreatKind} {f.nextTreat}. Miles from MMI. Agent will not invent a visit. It asks, then it drafts the text, then a human taps send.
      </div>
      <div className="turn-wrap">
        <h1 className="turn-h1">{clientName(props.file)}</h1>
        <p className="turn-sub">{props.file.phase} · {f.carrier} {f.claimNo} · treating · KEEP {props.file.keep.status}{props.file.landed ? " reset today" : ""}</p>
        {props.file.notes[0] && (
          <div className="turn-card" style={{ marginBottom: 14 }}>
            <p className="turn-kicker">File note</p>
            <p>{props.file.notes[0].body}</p>
          </div>
        )}
        <div className="turn-cols">
          <div className="turn-card">
            <p className="turn-kicker">Asks you · missing for the playbook</p>
            <div className="turn-ask">
              <p><span className="n">1 · Chiro</span> Valley Chiro is on the file. Last visit date is blank. Still going?</p>
              <div className="turn-chips">
                <AskChip on={props.file.asks.chiro === "yes_2x"} onClick={() => props.onAsk("chiro", "yes_2x")}>Yes, 2x/week</AskChip>
                <AskChip on={props.file.asks.chiro === "dropped"} onClick={() => props.onAsk("chiro", "dropped")}>Dropped off</AskChip>
                <AskChip on={props.file.asks.chiro === "unknown"} onClick={() => props.onAsk("chiro", "unknown")}>Don&apos;t know · ask him</AskChip>
              </div>
            </div>
            <div className="turn-ask">
              <p><span className="n">2 · Contact</span> He said voice only. KEEP wants a chiro-return text. Which?</p>
              <div className="turn-chips">
                <AskChip on={props.file.asks.contact === "call_then_text"} onClick={() => props.onAsk("contact", "call_then_text")}>Call, then text if he says ok</AskChip>
                <AskChip on={props.file.asks.contact === "text_anyway"} onClick={() => props.onAsk("contact", "text_anyway")}>Text anyway</AskChip>
                <AskChip on={props.file.asks.contact === "voice_only"} onClick={() => props.onAsk("contact", "voice_only")}>Voice only, no text</AskChip>
              </div>
            </div>
            <div className="turn-ask">
              <p><span className="n">3 · PD check</span> Still not in. Tell him Maya has it, or wait until she actually has a status?</p>
              <div className="turn-chips">
                <AskChip on={props.file.asks.pd_check === "wait"} onClick={() => props.onAsk("pd_check", "wait")}>Wait for Maya</AskChip>
                <AskChip on={props.file.asks.pd_check === "promise"} onClick={() => props.onAsk("pd_check", "promise")}>Promise a time only</AskChip>
              </div>
            </div>
          </div>
          <div className="turn-card">
            <p className="turn-kicker">Marching orders · named, dated</p>
            {props.file.tasks.map((t) => (
              <div key={t.id} className="turn-ask">
                <p><b>{t.owner}</b></p>
                <p>{t.title}</p>
                <p className="turn-muted">{t.dueLabel}</p>
                {t.playbook === "NOTICE" ? (
                  <button type="button" className="turn-btn ghost" onClick={props.onQueueLor}>{t.status === "queued" ? "Queued" : BOLTON_BUTTON.postgrid}</button>
                ) : (
                  <button type="button" className="turn-btn ghost" onClick={() => props.onAssign(t.id)}>{t.status === "assigned" || t.status === "set" || t.status === "queued" ? t.status[0].toUpperCase() + t.status.slice(1) : "Assign"}</button>
                )}
              </div>
            ))}
            {!props.file.tasks.length && <p className="turn-hint">No orders until a note lands.</p>}
          </div>
          <div className="turn-card">
            <p className="turn-kicker">Schedule and the text · draft only</p>
            <div className="turn-tl">
              {props.file.nextTreatOn && (
                <div className="turn-tl-item">
                  <div className="when">Already on file</div>
                  <div>Thu Sep 4 · 9:20 · MRI · Desert Radiology</div>
                </div>
              )}
              {props.file.tasks.filter((t) => t.id === "task-maya-call").map((t) => (
                <div key={t.id} className="turn-tl-item">
                  <div className="when">New · Maya</div>
                  <div>Sun Aug 30 · 12:00 · voice callback · PD + chiro</div>
                </div>
              ))}
              {props.file.asks.chiro === "yes_2x" && (
                <div className="turn-tl-item">
                  <div className="when">New · client</div>
                  <div>This week · return Valley Chiro · 2x/week until MRI</div>
                </div>
              )}
            </div>
            {props.file.draftSms && (
              <div style={{ marginTop: 16 }}>
                <div className="turn-draft">{props.file.draftSms.blockedReason || "Draft. Not sent."}</div>
                <textarea className="turn-area" readOnly value={props.file.draftSms.body} />
                <div className="turn-chips" style={{ marginTop: 10 }}>
                  <button type="button" className="turn-chip">Edit</button>
                  <button
                    type="button"
                    className="turn-btn"
                    disabled={!props.file.draftSms.sendEnabled}
                    onClick={props.onSendSms}
                  >{BOLTON_BUTTON.justcall} · after he okays</button>
                </div>
                {props.smsNote && <p className="turn-foot">{props.smsNote}</p>}
                <p className="turn-foot">Playbook: treating + gap + not MMI → return-to-provider text. Same SELECT every time. Haiku only filled the names and dates from the rows.</p>
              </div>
            )}
          </div>
        </div>
        <FileShell file={props.file} />
      </div>
    </div>
  );
}

function AskChip(props: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`turn-chip ${props.on ? "on" : ""}`} onClick={props.onClick}>{props.children}</button>;
}
