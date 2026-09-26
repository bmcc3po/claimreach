"use client";
// The right half of the call screen on a desktop (1180px and wider). The call
// itself stays on the left, same screen as the phone. This side holds what an
// agent wants open while she talks: the CarCure playbook with Ask CaseCure,
// the JustCall thread with texting, the agreement preview, and the lead.
// On a phone this panel is not rendered at all; those live in sheets.
import { useEffect, useMemo, useRef, useState } from "react";
import { REBS, REB_GROUPS, LINES } from "@/lib/mva-call/engine";

export type DeskTab = "know" | "texts" | "retainer" | "lead";

export interface PreviewInfo {
  href: string | null;
  checks: { label: string; value: string; ok: boolean; later?: boolean }[];
}

const PHASE_LABEL: Record<string, string> = { open: "Open", story: "Story", body: "Injury", car: "Car", money: "Money", send: "Send", file: "File", close: "Close" };

export default function DeskPanel({ v, tab, setTab, phase, fill, lead, preview, focusLines }: {
  v: any;
  tab: DeskTab;
  setTab: (t: DeskTab) => void;
  phase: string;
  fill: (t: string) => string;
  lead: { from: string; said: string; tags: string[]; name?: string; phone?: string; email?: string } | null;
  preview: PreviewInfo;
  focusLines: { key: string; n: number } | null;
}) {
  const tabs: [DeskTab, string][] = [["know", "CarCure"], ["texts", "Texts"], ["retainer", "Retainer"], ["lead", "Lead"]];
  return (
    <aside className="cc-side" aria-label="CarCure, texts, agreement and lead">
      <div className="cc-side-top">
        <div className="cc-htabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`cc-htab${tab === k ? " cc-on" : ""}`} onClick={() => setTab(k)}>
              {label}{k === "texts" && v.textUnread > 0 && tab !== "texts" ? <span className="cc-side-dot">{v.textUnread}</span> : null}
            </button>
          ))}
        </div>
      </div>
      {tab === "know" && <Knowledge v={v} phase={phase} fill={fill} focusLines={focusLines} />}
      {tab === "texts" && <Texts v={v} />}
      {tab === "retainer" && <Retainer v={v} preview={preview} />}
      {tab === "lead" && <Lead lead={lead} />}
    </aside>
  );
}

function Knowledge({ v, phase, fill, focusLines }: { v: any; phase: string; fill: (t: string) => string; focusLines: { key: string; n: number } | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const linesRef = useRef<HTMLDivElement | null>(null);
  const rambleRef = useRef<HTMLDivElement | null>(null);
  const term = q.trim().toLowerCase();
  const match = (...parts: string[]) => !term || parts.join(" ").toLowerCase().includes(term);

  useEffect(() => {
    if (!focusLines) return;
    setQ("");
    const el = focusLines.key === "ramble" ? rambleRef.current : linesRef.current;
    setTimeout(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }, [focusLines]);

  const now = useMemo(() => REBS.filter((r: any) => r.phase === phase).slice(0, 4), [phase]);
  const groups = REB_GROUPS.map((g: string) => ({ g, items: REBS.filter((r: any) => r.group === g && match(r.title, r.text, r.note || "", g)) })).filter((x: any) => x.items.length);
  const lineSecs = LINES.map((s: any, i: number) => ({ ...s, i, items: s.items.filter((it: any) => match(s.head, it[0], it[1])) })).filter((s: any) => s.items.length);

  const Reb = ({ r }: { r: any }) => (
    <div className={`cc-kn-row${open === r.id ? " cc-on" : ""}`}>
      <button className="cc-kn-q" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
        <span>{r.title}</span>
        {r.phase === "locked" ? <span className="cc-rb-lock">Needs TMP OK</span> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={open === r.id ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}></path></svg>}
      </button>
      {open === r.id && (
        <div className="cc-kn-a">
          {r.note && <div className="cc-cue cc-red" style={{ marginTop: 0 }}>{r.note}</div>}
          <div className="cc-kn-say">{fill(r.text)}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="cc-side-b">
      <div className="cc-card cc-kn-ask">
        <span className="cc-card-h">Ask CaseCure</span>
        <textarea className="cc-area" rows={2} placeholder="What she said, or what happened, in plain words" aria-label="Ask CaseCure" value={v.askField.value ?? ""} onChange={v.askField.set}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) v.doAsk(); }} />
        <button className="cc-btn cc-full" disabled={!!v.askBusy || !String(v.askField.value || "").trim()} onClick={v.doAsk}>{v.askBusy ? "Asking" : "Ask"}</button>
        {!!v.askAnswer && <div className="cc-ask-a">{v.askAnswer}</div>}
        {!!v.askError && <div className="cc-cue cc-red" style={{ marginTop: 0 }}>{v.askError}</div>}
      </div>

      <input className="cc-field cc-kn-search" type="search" placeholder="Search rebuttals and lines" aria-label="Search rebuttals and lines" value={q} onChange={(e) => setQ(e.target.value)} />

      {!term && now.length > 0 && (
        <>
          <div className="cc-rb-h cc-gold">Right now, {PHASE_LABEL[phase] || phase}</div>
          <div className="cc-grp">{now.map((r: any) => <Reb key={r.id} r={r} />)}</div>
        </>
      )}

      {groups.map((x: any) => (
        <div key={x.g}>
          <div className="cc-rb-h">{x.g}</div>
          <div className="cc-grp">{x.items.map((r: any) => <Reb key={r.id} r={r} />)}</div>
        </div>
      ))}

      {lineSecs.map((s: any) => (
        <div key={s.head} ref={s.i === 0 ? linesRef : s.i === 1 ? rambleRef : undefined} style={{ scrollMarginTop: 8 }}>
          <div className="cc-rb-h">{s.head}</div>
          <div className="cc-ln-note">{s.note}</div>
          <div className="cc-ln-box">
            {s.items.map((it: any, i: number) => (
              <div key={i} className={`cc-ln${i === s.items.length - 1 ? " cc-end" : ""}`}>
                {(i === 0 || s.items[i - 1][0] !== it[0]) && <div className="cc-ln-k">{it[0]}</div>}
                <div className="cc-ln-t">{fill(it[1])}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {term && !groups.length && !lineSecs.length && <div className="cc-cue" style={{ textAlign: "center" }}>Nothing matches. Try Ask CaseCure above.</div>}
    </div>
  );
}

function Texts({ v }: { v: any }) {
  const end = useRef<HTMLDivElement | null>(null);
  const count = (v.texts || []).length;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count]);
  return (
    <>
      <div className="cc-side-b cc-side-thread">
        <div className="cc-cue" style={{ margin: "0 4px 6px" }}>From {v.textFrom || "the JustCall line"} through JustCall. Same thread as the JustCall app, and every text saves to her file.</div>
        {!!v.textEmpty && <div className="cc-cue" style={{ textAlign: "center", margin: "28px 0" }}>No texts with {v.callerFirst} yet.</div>}
        {(v.texts || []).map((m: any, i: number) => (
          <div key={i} className={m.cls.split(" ").map((c: string) => "cc-" + c).join(" ")}>
            <div>{m.body}</div>{!!m.hasStatus && <div className="cc-bub-s">{m.status}</div>}
          </div>
        ))}
        {!!v.canResend && <div className="cc-chips cc-list" style={{ marginTop: 8 }}><button className="cc-chip cc-go" onClick={v.resendLink}>Resend the agreement link</button></div>}
        {!!v.hasTextError && <div className="cc-stop"><div className="cc-cue cc-red" style={{ marginTop: 0 }}>{v.textError}</div></div>}
        {!!v.hasCalls && (
          <>
            <div className="cc-sec-h" style={{ paddingTop: 14 }}>Calls</div>
            <div className="cc-grp">
              {(v.callsList || []).map((c: any, i: number) => (
                <div key={i} className="cc-callrow">
                  <div className="cc-callrow-t"><span>{c.what}</span><span className="cc-done-k">{c.when}</span></div>
                  {!!c.agent && <div className="cc-cue" style={{ marginTop: 0 }}>{c.agent}</div>}
                  {!!c.hasRec && <audio controls preload="none" src={c.rec} style={{ width: "100%", marginTop: 6 }} />}
                  {!!c.hasSummary && <div className="cc-cue">{c.summary}</div>}
                </div>
              ))}
            </div>
          </>
        )}
        <div ref={end} />
      </div>
      <div className="cc-side-compose">
        <textarea className="cc-area" rows={2} placeholder={`Text ${v.callerFirst || "her"}`} aria-label={`Text ${v.callerFirst || "her"}`}
          value={v.textDraft.value ?? ""} onChange={v.textDraft.set}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!v.textCantSend) v.sendText(); } }} />
        <button className="cc-btn cc-full" disabled={!!v.textCantSend} onClick={v.sendText}>Send</button>
      </div>
    </>
  );
}

function Retainer({ v, preview }: { v: any; preview: PreviewInfo }) {
  const [src, setSrc] = useState<string | null>(preview.href);
  const stale = !!preview.href && src !== preview.href;
  useEffect(() => { if (!src && preview.href) setSrc(preview.href); }, [preview.href, src]);
  const missing = preview.checks.filter((c) => !c.ok && !c.later).length;
  return (
    <div className="cc-side-b cc-side-ret">
      <div className="cc-grp">
        {preview.checks.map((c) => (
          <div key={c.label} className="cc-chk">
            <span className={`cc-chk-dot${c.ok ? " cc-ok" : c.later ? " cc-later" : " cc-miss"}`} aria-hidden="true" />
            <span className="cc-chk-k">{c.label}</span>
            <span className={`cc-chk-v${c.ok ? "" : c.later ? "" : " cc-red"}`}>{c.value}</span>
          </div>
        ))}
      </div>
      <div className="cc-cue" style={{ margin: "0 4px" }}>
        {missing ? `${missing} thing${missing === 1 ? "" : "s"} still missing before it can go.` : "Yellow on the agreement is what the call filled in. Check the spelling with her before you send."}
      </div>
      {preview.href ? (
        <>
          <div className="cc-ret-bar">
            <button className="cc-chip cc-sm" onClick={() => setSrc(preview.href)}>{stale ? "Update the preview" : "Reload"}</button>
            <a className="cc-chip cc-sm cc-ret-open" href={src || preview.href} target="_blank" rel="noopener">Open full size</a>
            {stale && <span className="cc-cue cc-red" style={{ marginTop: 0 }}>Changed since this preview</span>}
          </div>
          {src && <iframe className="cc-ret-pdf" title="Agreement preview" src={src} />}
        </>
      ) : (
        <div className="cc-cue" style={{ textAlign: "center", marginTop: 20 }}>Add the city and state on Story and the signer's name on Send, and the agreement shows up here.</div>
      )}
      {v.sendLive && <div className="cc-cue" style={{ margin: "0 4px" }}>This agreement is already out. The preview shows what was filled in.</div>}
    </div>
  );
}

function Lead({ lead }: { lead: { from: string; said: string; tags: string[]; name?: string; phone?: string; email?: string } | null }) {
  if (!lead) return <div className="cc-side-b"><div className="cc-cue" style={{ textAlign: "center", marginTop: 24 }}>This file did not come from a marketer. Nothing was sent ahead of the call.</div></div>;
  return (
    <div className="cc-side-b">
      <div className="cc-grp">
        {lead.name && <div className="cc-chk"><span className="cc-chk-k">Name</span><span className="cc-chk-v">{lead.name}</span></div>}
        {lead.phone && <div className="cc-chk"><span className="cc-chk-k">Phone</span><span className="cc-chk-v">{lead.phone}</span></div>}
        {lead.email && <div className="cc-chk"><span className="cc-chk-k">Email</span><span className="cc-chk-v">{lead.email}</span></div>}
        {lead.from && <div className="cc-chk"><span className="cc-chk-k">Came from</span><span className="cc-chk-v">{lead.from}</span></div>}
      </div>
      {lead.tags.length > 0 && (
        <>
          <div className="cc-rb-h">What she told the marketer</div>
          <div className="cc-lead-tags">{lead.tags.map((t) => <span key={t} className="cc-lead-tag">{t}</span>)}</div>
        </>
      )}
      {lead.said && (
        <>
          <div className="cc-rb-h">In her words</div>
          <div className="cc-card"><div className="cc-lead-said" style={{ margin: 0 }}>{lead.said}</div></div>
        </>
      )}
    </div>
  );
}
