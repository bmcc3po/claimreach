"use client";
// The right half of the call screen on a desktop (1180px and wider). The call
// itself stays on the left, same screen as the phone. This side holds what an
// agent wants open while the PNC talks: the CarCure playbook with Ask CaseCure,
// the JustCall thread with texting, the agreement preview, and the lead.
// On a phone this panel is not rendered at all; those live in sheets.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REBS, REB_GROUPS, LINES } from "@/lib/mva-call/engine";
import JustCallDialer, { popOutDialer, type JustCallDialerHandle, type DialerState } from "./JustCallDialer";
import { SOL, stateCodeOf, injuryDeadline, STATE_TZ } from "@/lib/mva-call/state";
import { splitUsAddress, joinUsAddress, mailColumnsFrom } from "@/lib/us-address";

export type DeskTab = "summary" | "know" | "texts" | "phone" | "retainer" | "file" | "tools";
export interface PhoneRow { label: string; number: string; pretty: string; kind: "caller" | "threeway" }

export interface PreviewInfo {
  href: string | null;
  checks: { label: string; value: string; ok: boolean; later?: boolean; spot?: string }[];
}

const PHASE_LABEL: Record<string, string> = { open: "Open", story: "Story", body: "Injury", car: "Car", money: "Money", send: "Send", file: "File", close: "Close" };

export default function DeskPanel({ v, tab, setTab, phase, fill, lead, preview, focusLines, phones, leadId, story, summary, onDialState }: {
  v: any;
  /** The JustCall dialer in the Phone tab: on a call, ringing, ready. */
  onDialState?: (s: DialerState) => void;
  /** The Full Intake workspace: next best action, what's missing, the live summary. */
  summary?: ReactNode;
  tab: DeskTab;
  setTab: (t: DeskTab) => void;
  phase: string;
  fill: (t: string) => string;
  lead: { from: string; said: string; tags: string[]; name?: string; phone?: string; email?: string } | null;
  preview: PreviewInfo;
  focusLines: { key: string; n: number } | null;
  phones: PhoneRow[];
  leadId: string;
  story: { city: string; crash: Date | null };
}) {
  // The dialer stays loaded once opened, so switching tabs never drops a call.
  const [phoneOn, setPhoneOn] = useState(false);
  const [dialState, setDialState] = useState<DialerState>("loading");
  const dialer = useRef<JustCallDialerHandle | null>(null);
  useEffect(() => { if (tab === "phone") setPhoneOn(true); }, [tab]);
  const tabs: [DeskTab, string][] = [...(summary ? [["summary", "Helper"] as [DeskTab, string]] : []), ["know", "Scripts"], ["texts", "Texts"], ["phone", "Phone"], ["retainer", "Agreement"], ["file", "File"], ["tools", "Tools"]];
  return (
    <aside className={`cc-side${summary ? " ws-side" : ""}`} aria-label="Summary, CarCure, texts, agreement and lead">
      <div className="cc-side-top">
        <div className="cc-htabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`cc-htab${tab === k ? " cc-on" : ""}`} onClick={() => setTab(k)}>
              {label}{k === "texts" && v.textUnread > 0 && tab !== "texts" ? <span className="cc-side-dot">{v.textUnread}</span> : null}
              {k === "phone" && (dialState === "on-call" || dialState === "ringing") && tab !== "phone" ? <span className="cc-side-live" aria-label="On a call" /> : null}
            </button>
          ))}
        </div>
      </div>
      {tab === "summary" && !!summary && <div className="cc-side-b ws-side-b">{summary}</div>}
      {tab === "know" && <Knowledge v={v} phase={phase} fill={fill} focusLines={focusLines} />}
      {tab === "texts" && <Texts v={v} />}
      {tab === "retainer" && <Retainer v={v} preview={preview} />}
      {tab === "file" && <FileTab leadId={leadId} lead={lead} />}
      {tab === "tools" && <Tools v={v} story={story} />}
      {phoneOn && (
        <div className="cc-side-b cc-side-phone" hidden={tab !== "phone"}>
          <div className="cc-grp">
            {phones.map((p) => (
              <div key={p.kind + p.number} className="cc-chk">
                <span className="cc-chk-k">{p.label}</span>
                <span className="cc-chk-v">{p.pretty}</span>
                <span className="cc-phone-acts">
                  {p.kind === "caller"
                    ? <button className="cc-chip cc-sm cc-go-chip" onClick={() => dialer.current?.dial(p.number)}>Call</button>
                    : <button className="cc-chip cc-sm" onClick={() => { try { navigator.clipboard.writeText(p.number); } catch { /* copy by hand */ } }}>Copy</button>}
                </span>
              </div>
            ))}
            {!phones.some((p) => p.kind === "threeway") && <div className="cc-chk"><span className="cc-chk-k">3-way</span><span className="cc-cue" style={{ marginTop: 0 }}>No firm line is set for this campaign yet.</span></div>}
          </div>
          <div className="cc-cue" style={{ margin: "0 4px" }}>
            {dialState === "on-call" ? "On a call. To bring someone in, tap add call in the dialer and paste their number."
              : dialState === "ringing" ? "Ringing."
              : dialState === "ready" ? "Calls go out from the JustCall line, record, and land on this file."
              : "Sign in to JustCall inside the box below. You only do it once on this computer."}
          </div>
          <JustCallDialer ref={dialer} onState={(st) => { setDialState(st); onDialState?.(st); }} />
          <div className="cc-ret-bar">
            <button className="cc-chip cc-sm" onClick={() => popOutDialer(phones.find((p) => p.kind === "caller")?.number)}>Pop out</button>
            <span className="cc-cue" style={{ marginTop: 0 }}>Leaving this page ends a call in this box. Pop it out for a long call or a 3-way.</span>
          </div>
        </div>
      )}
    </aside>
  );
}

function Knowledge({ v, phase, fill, focusLines }: { v: any; phase: string; fill: (t: string) => string; focusLines: { key: string; n: number } | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const linesRef = useRef<HTMLDivElement | null>(null);
  const rambleRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const jump = (id: string) => {
    setQ("");
    setTimeout(() => bodyRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
  };
  const slug = (g: string) => "kn-" + g.toLowerCase().replace(/[^a-z0-9]+/g, "-");
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

  // Which group is on screen, so the index on the left can show where you are:
  // the last section whose top has scrolled up past the top of the panel.
  const [spy, setSpy] = useState("");
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const top = root.getBoundingClientRect().top + 72;
      let cur = "";
      root.querySelectorAll<HTMLElement>("[data-spy]").forEach((el) => { if (el.getBoundingClientRect().top <= top) cur = el.id; });
      setSpy(cur || "kn-ask");
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => { root.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [term, phase]);

  // Groups fold on a click of their heading; a search opens everything.
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => !!term || !folded[id];
  const flip = (id: string) => setFolded((f) => ({ ...f, [id]: !f[id] }));
  const Head = ({ id, label, n, gold }: { id: string; label: string; n: number; gold?: boolean }) => (
    <button className={`cc-rb-h cc-rb-fold${gold ? " cc-gold" : ""}${isOpen(id) ? "" : " cc-shut"}`} onClick={() => flip(id)} aria-expanded={isOpen(id)}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
      <span>{label}</span><span className="cc-rb-n">{n}</span>
    </button>
  );
  const J = ({ id, label, cls = "" }: { id: string; label: string; cls?: string }) => (
    <button className={`cc-kn-jump${cls}${spy === id ? " cc-on" : ""}`} onClick={() => { setFolded((f) => ({ ...f, [id]: false })); jump(id); }}>{label}</button>
  );

  return (
    <div className="cc-side-b cc-kn" ref={bodyRef}>
      {/* Jump straight to a group of rebuttals or lines. Across the top when
          the panel is narrow, down the left side when it is wide. */}
      <nav className="cc-kn-nav" aria-label="Rebuttal groups">
        <J id="kn-ask" label="Ask CaseCure" cls=" cc-ask-j" />
        {now.length > 0 && <J id="kn-now" label="Right now" cls=" cc-gold" />}
        <span className="cc-kn-navh">Rebuttals</span>
        {REB_GROUPS.map((g: string) => <J key={g} id={slug(g)} label={g} />)}
        <span className="cc-kn-navh">Lines</span>
        {LINES.map((s: any) => <J key={s.head} id={slug("line " + s.head)} label={s.head} cls=" cc-line" />)}
      </nav>
      <div className="cc-kn-body">
        <div className="cc-card cc-kn-ask" id="kn-ask" data-spy="1">
          <span className="cc-card-h">Ask CaseCure</span>
          <textarea className="cc-area" rows={2} placeholder="What the PNC said, or what happened, in plain words" aria-label="Ask CaseCure" value={v.askField.value ?? ""} onChange={v.askField.set}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) v.doAsk(); }} />
          <div className="cc-kn-ask-row">
            <span className="cc-cue" style={{ marginTop: 0 }}>Ctrl Enter asks</span>
            <button className="cc-btn cc-full" disabled={!!v.askBusy || !String(v.askField.value || "").trim()} onClick={v.doAsk}>{v.askBusy ? "Asking" : "Ask"}</button>
          </div>
          {!!v.askAnswer && <div className="cc-ask-a">{v.askAnswer}</div>}
          {!!v.askError && <div className="cc-cue cc-red" style={{ marginTop: 0 }}>{v.askError}</div>}
        </div>

        <input className="cc-field cc-kn-search" type="search" placeholder="Search rebuttals and lines" aria-label="Search rebuttals and lines" value={q} onChange={(e) => setQ(e.target.value)} />

        {!term && now.length > 0 && (
          <div id="kn-now" data-spy="1" className="cc-kn-sec">
            <Head id="kn-now" label={`Right now, ${PHASE_LABEL[phase] || phase}`} n={now.length} gold />
            {isOpen("kn-now") && <div className="cc-grp">{now.map((r: any) => <Reb key={r.id} r={r} />)}</div>}
          </div>
        )}

        {groups.map((x: any) => (
          <div key={x.g} id={slug(x.g)} data-spy="1" className="cc-kn-sec">
            <Head id={slug(x.g)} label={x.g} n={x.items.length} />
            {isOpen(slug(x.g)) && <div className="cc-grp">{x.items.map((r: any) => <Reb key={r.id} r={r} />)}</div>}
          </div>
        ))}

        {lineSecs.map((s: any) => {
          const id = slug("line " + s.head);
          return (
            <div key={s.head} id={id} data-spy="1" className="cc-kn-sec" ref={s.i === 0 ? linesRef : s.i === 1 ? rambleRef : undefined}>
              <Head id={id} label={s.head} n={s.items.length} />
              {isOpen(id) && (
                <>
                  <div className="cc-ln-note">{s.note}</div>
                  <div className="cc-ln-box">
                    {s.items.map((it: any, i: number) => (
                      <div key={i} className={`cc-ln${i === s.items.length - 1 ? " cc-end" : ""}`}>
                        {(i === 0 || s.items[i - 1][0] !== it[0]) && <div className="cc-ln-k">{it[0]}</div>}
                        <div className="cc-ln-t">{fill(it[1])}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {term && !groups.length && !lineSecs.length && <div className="cc-cue" style={{ textAlign: "center" }}>Nothing matches. Try Ask CaseCure above.</div>}
      </div>
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
        <div className="cc-cue" style={{ margin: "0 4px 6px" }}>From {v.textFrom || "the JustCall line"} through JustCall. Same thread as the JustCall app, and every text saves to the file.</div>
        {!!v.hasCalls && (
          <>
            <div className="cc-sec-h" style={{ paddingTop: 4 }}>Calls</div>
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
            <div className="cc-sec-h" style={{ paddingTop: 14 }}>Texts</div>
          </>
        )}
        {!!v.textEmpty && <div className="cc-cue" style={{ textAlign: "center", margin: "28px 0" }}>No texts with {v.callerFirst} yet.</div>}
        {(v.texts || []).map((m: any, i: number) => (
          <div key={i} className={m.cls.split(" ").map((c: string) => "cc-" + c).join(" ")}>
            <div>{m.body}</div>{!!m.hasStatus && <div className="cc-bub-s">{m.status}</div>}
          </div>
        ))}
        {!!v.canResend && <div className="cc-chips cc-list" style={{ marginTop: 8 }}><button className="cc-chip cc-go" onClick={v.resendLink}>Resend the agreement link</button></div>}
        {!!v.canVoid && <div className="cc-chips cc-list" style={{ marginTop: 8 }}><button className="cc-chip" onClick={v.voidAgreement}>{v.voidLabel}</button></div>}
        {!!v.hasTextError && <div className="cc-stop"><div className="cc-cue cc-red" style={{ marginTop: 0 }}>{v.textError}</div></div>}
        <div ref={end} />
      </div>
      <div className="cc-side-compose">
        <textarea className="cc-area" rows={2} placeholder={`Text ${v.callerFirst || "the PNC"}`} aria-label={`Text ${v.callerFirst || "the PNC"}`}
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
            {c.ok || c.later || !(c as any).spot ? (
              <span className={`cc-chk-v${c.ok ? "" : c.later ? "" : " cc-red"}`}>{c.value}</span>
            ) : (
              /* A missing item is a link: tap it and land where it gets typed. */
              <button type="button" className="cc-chk-v cc-red cc-chk-go" onClick={() => v.jumpTo((c as any).spot)}>{c.value}</button>
            )}
          </div>
        ))}
      </div>
      <div className="cc-cue" style={{ margin: "0 4px" }}>
        {missing ? `${missing} thing${missing === 1 ? "" : "s"} still missing before it can go.` : "Yellow on the agreement is what the call filled in. Check the spelling with the PNC before you send."}
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

function LeadCard({ lead }: { lead: { from: string; said: string; tags: string[] } | null }) {
  if (!lead || (!lead.from && !lead.said && !lead.tags.length)) return null;
  return (
    <>
      <div className="cc-rb-h">From the lead{lead.from ? `, ${lead.from}` : ""}</div>
      <div className="cc-card">
        {lead.tags.length > 0 && <div className="cc-lead-tags">{lead.tags.map((t) => <span key={t} className="cc-lead-tag">{t}</span>)}</div>}
        {lead.said && <div className="cc-lead-said">{lead.said}</div>}
      </div>
    </>
  );
}

const fmtWhen = (iso?: string | null) => {
  if (!iso) return "";
  const t = new Date(iso);
  return isNaN(t.getTime()) ? "" : t.toLocaleString(undefined, { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" });
};

// The file: status, agreements, notes, documents and history, without leaving
// the call. Loads when the tab opens.
// The traditional contact card (Brett, Sep 28): the record's phone, email
// and mailing address, right on the File tab, editable during the call.
// Saves to the LEAD (the same generic contact save the CRM uses), so a
// callback, a report or a prefill reads exactly what the agent typed here.
function ContactCard({ leadId, initial }: { leadId: string; initial: Record<string, string> }) {
  // A record that came in with the whole address on the street line
  // ("18475 Zurich Ln, Tinley Park, IL 60477") shows split, and is saved
  // split the first time the card sees it (Brett, Sep 28).
  const first = (() => {
    const f = {
      phone: initial.phone || "", email: initial.email || "",
      home_phone: initial.home_phone || "", work_phone: initial.work_phone || "",
      mail_addr1: initial.mail_addr1 || "", mail_city: initial.mail_city || "",
      mail_state: initial.mail_state || "", mail_zip: initial.mail_zip || "",
    };
    const cols = mailColumnsFrom(f, f.mail_addr1);
    return { f: cols ? { ...f, ...cols } : f, tidied: !!cols };
  })();
  const [f, setF] = useState<Record<string, string>>(first.f);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState("");
  const t = useRef<any>(null);
  // What the record holds, so a save sends only the fields that changed and
  // the Activity Log says what really changed.
  const saved = useRef<Record<string, string>>({
    phone: initial.phone || "", email: initial.email || "",
    home_phone: initial.home_phone || "", work_phone: initial.work_phone || "",
    mail_addr1: initial.mail_addr1 || "", mail_city: initial.mail_city || "",
    mail_state: initial.mail_state || "", mail_zip: initial.mail_zip || "",
  });
  const last = useRef<Record<string, string>>({ phone: initial.phone || "", email: initial.email || "" });
  const save = async (data: Record<string, string>) => {
    const diff: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) if (saved.current[k] !== v) diff[k] = v;
    if (!Object.keys(diff).length) { setState("saved"); return; }
    setState("saving"); setMsg("");
    try {
      const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "save", lead_id: leadId, lead: diff }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "The contact did not save.");
      saved.current = { ...saved.current, ...diff };
      setState("saved");
      // The call's own copy follows (the File step's home address, the send).
      try {
        window.dispatchEvent(new CustomEvent("cr:contact", { detail: {
          leadId, addr: joinUsAddress({ street: data.mail_addr1, city: data.mail_city, state: data.mail_state, zip: data.mail_zip }),
          phone: data.phone, email: data.email, prevPhone: last.current.phone, prevEmail: last.current.email,
        } }));
      } catch { /* the console is not on this page */ }
      last.current = { phone: data.phone, email: data.email };
    } catch (e: any) { setState("error"); setMsg(e.message); }
  };
  useEffect(() => { if (first.tidied) void save(first.f); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // The call saved a contact field onto the record (the PNC's email typed on
  // the send step, the home address on the File step): show it here too.
  useEffect(() => {
    const on = (e: any) => {
      const d = e?.detail || {};
      if (d.leadId !== leadId) return;
      const upd: Record<string, string> = {};
      for (const k of ["phone", "email", "mail_addr1", "mail_city", "mail_state", "mail_zip"]) if (typeof d[k] === "string") upd[k] = d[k];
      if (!Object.keys(upd).length) return;
      saved.current = { ...saved.current, ...upd };
      last.current = { phone: saved.current.phone, email: saved.current.email };
      setF((cur) => ({ ...cur, ...upd }));
    };
    window.addEventListener("cr:record", on);
    return () => window.removeEventListener("cr:record", on);
  }, [leadId]);
  const set = (k: string) => (e: any) => {
    const v = e.target.value;
    // Pasting a whole address into the street box fills city, state and ZIP.
    const split = k === "mail_addr1" ? splitUsAddress(v) : null;
    const next = split
      ? { ...f, mail_addr1: split.street, mail_city: split.city, mail_state: split.state, mail_zip: split.zip || f.mail_zip }
      : { ...f, [k]: k === "mail_state" ? v.toUpperCase() : v };
    setF(next);
    setState("dirty");
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => { void save(next); }, 900);
  };
  const addr = joinUsAddress({ street: f.mail_addr1, city: f.mail_city, state: f.mail_state, zip: f.mail_zip });
  const gaps = [!f.phone && "cell", !f.mail_addr1 && "street", !f.mail_city && "city", !f.mail_state && "state", !f.mail_zip && "ZIP"].filter(Boolean) as string[];
  return (
    <div className="cc-card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="cc-card-h">Contact</span>
        <button type="button" className="cc-chip cc-sm" onClick={() => setOpen((v) => !v)}>{open ? "Done" : "Edit"}</button>
      </div>
      {!open && (<>
        <div className="cc-chk"><span className="cc-chk-k">Cell</span><span className="cc-chk-v">{f.phone || "Not on file"}</span></div>
        {!!f.home_phone && <div className="cc-chk"><span className="cc-chk-k">Home phone</span><span className="cc-chk-v">{f.home_phone}</span></div>}
        {!!f.work_phone && <div className="cc-chk"><span className="cc-chk-k">Work phone</span><span className="cc-chk-v">{f.work_phone}</span></div>}
        <div className="cc-chk"><span className="cc-chk-k">Email</span><span className="cc-chk-v">{f.email || "Not on file"}</span></div>
        <div className="cc-chk"><span className="cc-chk-k">Address</span><span className="cc-chk-v">{addr || "Not on file"}</span></div>
        {gaps.length > 0 && <button type="button" className="cc-cue cc-red" style={{ background: "none", border: 0, padding: 0, marginTop: 6, cursor: "pointer", textAlign: "left" }} onClick={() => setOpen(true)}>Missing {gaps.join(", ")}. Tap to add.</button>}
      </>)}
      {open && (<>
        <div className="cc-lab">CELL</div>
        <input className="cc-field" type="tel" inputMode="tel" aria-label="Cell" value={f.phone} onChange={set("phone")} />
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><div className="cc-lab">HOME PHONE</div><input className="cc-field" type="tel" inputMode="tel" aria-label="Home phone" value={f.home_phone} onChange={set("home_phone")} /></div>
          <div style={{ flex: 1, minWidth: 0 }}><div className="cc-lab">WORK PHONE</div><input className="cc-field" type="tel" inputMode="tel" aria-label="Work phone" value={f.work_phone} onChange={set("work_phone")} /></div>
        </div>
        <div className="cc-lab" style={{ marginTop: 8 }}>EMAIL</div>
        <input className="cc-field" type="email" inputMode="email" autoComplete="off" aria-label="Email" value={f.email} onChange={set("email")} />
        <div className="cc-lab" style={{ marginTop: 8 }}>STREET</div>
        <input className="cc-field" type="text" placeholder="Street, or paste the whole address" aria-label="Street address" value={f.mail_addr1} onChange={set("mail_addr1")} />
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input className="cc-field" style={{ flex: 2, minWidth: 0 }} type="text" placeholder="City" aria-label="City" value={f.mail_city} onChange={set("mail_city")} />
          <input className="cc-field" style={{ flex: 1, minWidth: 0 }} type="text" placeholder="ST" maxLength={2} aria-label="State" value={f.mail_state} onChange={set("mail_state")} />
          <input className="cc-field" style={{ flex: 1, minWidth: 0 }} type="text" inputMode="numeric" placeholder="ZIP" maxLength={10} aria-label="ZIP" value={f.mail_zip} onChange={set("mail_zip")} />
        </div>
      </>)}
      {state === "saving" && <div className="cc-cue" style={{ marginTop: 6 }}>Saving</div>}
      {state === "saved" && <div className="cc-cue" style={{ marginTop: 6 }}>Saved to the file.</div>}
      {state === "error" && <div className="cc-cue cc-red" style={{ marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

function FileTab({ leadId, lead }: { leadId: string; lead: { from: string; said: string; tags: string[] } | null }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [scope, setScope] = useState("call");
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try {
      const r = await fetch(`/api/calls/file?lead_id=${encodeURIComponent(leadId)}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "The file did not load.");
      setD(j); setErr("");
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId]);
  const addNote = async () => {
    const body = note.trim();
    if (!body) return;
    setSaving(true);
    try {
      const r = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: d?.claim_id, scope, body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "The note did not save.");
      setNote(""); await load();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };
  // Void one agreement (Brett, Sep 28). The console's send block opens again
  // on the next refresh; the voided row stays in the list, marked.
  const voidOne = async (a: any) => {
    const signed = a.status === "completed" || a.status === "signed";
    const why = window.prompt(signed
      ? "The PNC already signed this one. Why are you voiding it? The signed copy stays in the file history, marked Voided."
      : "Why are you voiding this agreement? (For example: wrong agreement, wrong number.)");
    if (!why || !why.trim()) return;
    try {
      const r = await fetch("/api/calls/esign/void", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id, reason: why.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "The agreement did not void.");
      await load();
      try { window.dispatchEvent(new CustomEvent("cr:voided", { detail: { leadId, pax: a.pax } })); } catch { /* no console on this page */ }
    } catch (e: any) { setErr(e.message); }
  };
  if (!d) return <div className="cc-side-b">{err ? <div className="cc-cue cc-red">{err}</div> : <div className="cc-cue" style={{ textAlign: "center", marginTop: 24 }}>Loading the file</div>}</div>;
  const L = d.lead || {};
  const row = (k: string, val: any) => (val ? <div className="cc-chk" key={k}><span className="cc-chk-k">{k}</span><span className="cc-chk-v">{val}</span></div> : null);
  const SCOPES: [string, string][] = [["call", "Call"], ["plaintiff", "PNC"], ["case", "Case"], ["file", "File"]];
  return (
    <div className="cc-side-b">
      {err && <div className="cc-cue cc-red" style={{ marginTop: 0 }}>{err}</div>}
      <ContactCard leadId={leadId} initial={d.contact || {}} />
      <div className="cc-grp">
        {d.status && <div className="cc-chk"><span className="cc-chk-k">Status</span><span className="cc-chk-v"><span className={`cc-dot cc-${d.status.tone || "info"}`} />{d.status.label}</span></div>}
        {row("Lead number", L.lead_no)}
        {row("Case", L.campaign)}
        {row("Attorney", L.attorney)}
        {row("Opened", fmtWhen(L.opened))}
        {row("Source", L.source)}
        {L.lawruler && <div className="cc-chk"><span className="cc-chk-k">LawRuler</span><span className="cc-chk-v">{L.lawruler_url ? <a href={L.lawruler_url} target="_blank" rel="noopener">{L.lawruler}</a> : L.lawruler}</span></div>}
      </div>

      <LeadCard lead={lead} />

      <div className="cc-rb-h">Agreements</div>
      {d.agreements.length === 0 ? <div className="cc-cue" style={{ margin: "0 4px" }}>Nothing sent yet.</div> : (
        <div className="cc-grp">
          {d.agreements.map((a: any) => (
            <div key={a.id} className="cc-callrow">
              <div className="cc-callrow-t"><span>{a.injured || a.signer}{a.pax != null ? " (passenger)" : ""}{a.name ? `, ${a.name}` : ""}</span><span className="cc-done-k" style={a.status === "voided" ? { color: "#B42318" } : a.status === "completed" || a.status === "signed" ? { color: "#15803D" } : undefined}>{a.status === "completed" ? "Signed" : a.status === "voided" ? "Voided" : a.status}</span></div>
              {a.status === "voided" && <div className="cc-cue" style={{ marginTop: 2 }}>Voided {fmtWhen(a.voided)}{a.void_reason ? `: ${a.void_reason}` : ""}</div>}
              <div className="cc-cue" style={{ marginTop: 2 }}>
                {[a.sent && `Sent ${fmtWhen(a.sent)} by ${String(a.via || "").toLowerCase()}`, a.opened && `opened ${fmtWhen(a.opened)}`, a.signed && `signed ${fmtWhen(a.signed)}`].filter(Boolean).join(", ")}
              </div>
              {(a.signed_url || a.cert_url) && <div className="cc-chips cc-list" style={{ marginTop: 8 }}>
                {a.signed_url && <a className="cc-chip cc-sm" href={a.signed_url} target="_blank" rel="noopener">Signed agreement</a>}
                {a.cert_url && <a className="cc-chip cc-sm" href={a.cert_url} target="_blank" rel="noopener">Audit trail</a>}
              </div>}
              {a.error && a.status !== "voided" && <div className="cc-cue cc-red">{a.error}</div>}
              {a.can_void && <div className="cc-chips cc-list" style={{ marginTop: 8 }}><button type="button" className="cc-chip cc-sm" onClick={() => voidOne(a)}>{a.status === "completed" || a.status === "signed" ? "Void the signed agreement" : "Void"}</button></div>}
            </div>
          ))}
        </div>
      )}

      <div className="cc-rb-h">Notes</div>
      <div className="cc-card">
        <div className="cc-chips cc-seg">{SCOPES.map(([k, label]) => <button key={k} className={`cc-chip${scope === k ? " cc-on" : ""}`} onClick={() => setScope(k)}>{label}</button>)}</div>
        <textarea className="cc-area" rows={2} placeholder="Add a note to the file" aria-label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="cc-btn cc-full" disabled={saving || !note.trim()} onClick={addNote}>{saving ? "Saving" : "Save note"}</button>
      </div>
      {d.notes.length > 0 && (
        <div className="cc-grp">
          {d.notes.slice(0, 20).map((n: any) => (
            <div key={n.id} className="cc-callrow">
              <div className="cc-callrow-t"><span className="cc-cue" style={{ marginTop: 0 }}>{n.author_name}{n.scope ? `, ${n.scope}` : ""}</span><span className="cc-done-k">{fmtWhen(n.created_at)}</span></div>
              <div style={{ fontSize: 15, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{n.body}</div>
            </div>
          ))}
        </div>
      )}

      {d.docs.length > 0 && (
        <>
          <div className="cc-rb-h">Documents</div>
          <div className="cc-grp">
            {d.docs.map((x: any) => (
              <a key={x.id} className="cc-lrow" href={x.url || "#"} target="_blank" rel="noopener">
                <span className="cc-lrow-main"><span className="cc-lrow-n" style={{ fontSize: 15 }}>{x.name}</span><span className="cc-lrow-s">{[x.type, x.by].filter(Boolean).join(", ")}</span></span>
                <span className="cc-lrow-t">{fmtWhen(x.at)}</span>
              </a>
            ))}
          </div>
        </>
      )}

      <div className="cc-rb-h">History</div>
      {d.history.length === 0 ? <div className="cc-cue" style={{ margin: "0 4px" }}>Nothing yet.</div> : (
        <div className="cc-grp">
          {d.history.slice(0, 40).map((h: any) => (
            <div key={h.id} className="cc-chk">
              <span className="cc-chk-k" style={{ width: 110 }}>{fmtWhen(h.created_at)}</span>
              <span style={{ fontSize: 14, lineHeight: 1.35 }}>{h.description}{h.actor_name ? <span className="cc-cue" style={{ display: "inline", marginLeft: 6 }}>{h.actor_name}</span> : null}</span>
            </div>
          ))}
        </div>
      )}
      {d.classic && <a className="cc-cue" style={{ margin: "4px", textAlign: "center" }} href={`/leads/${encodeURIComponent(L.lead_no || leadId)}?classic=1`}>Open the classic file page (status, QA, lock, send to firm)</a>}
    </div>
  );
}

// Quick helpers for mid-call questions: the deadline for any state and date,
// the PNC's local time, which agreement a state gets, and the split when they insist.
function Tools({ v, story }: { v: any; story: { city: string; crash: Date | null } }) {
  const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
  const [st, setSt] = useState<string>(() => stateCodeOf(story.city) || "");
  const [date, setDate] = useState<string>(() => iso(story.crash));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const when = date ? new Date(date + "T12:00:00") : null;
  const dl = injuryDeadline(st || null, when, now);
  const tz = st ? STATE_TZ[st] : null;
  let local = "";
  let hour = -1;
  if (tz) {
    try {
      local = new Date(now).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
      hour = Number(new Date(now).toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }));
    } catch { /* older browser */ }
  }
  const agreement = !st ? "" : st === "TX" ? "Texas" : st === "FL" ? "Florida" : st === "NV" ? "Nevada" : "All other states (AL/GA)";
  return (
    <div className="cc-side-b">
      <div className="cc-rb-h" style={{ paddingTop: 2 }}>Deadline check</div>
      <div className="cc-card">
        <div style={{ display: "flex", gap: 8 }}>
          <select className="cc-field" aria-label="State" value={st} onChange={(e) => setSt(e.target.value)} style={{ flex: 1 }}>
            <option value="">State</option>
            {SOL.map((r) => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
          </select>
          <input className="cc-field" type="date" aria-label="Crash date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
        </div>
        {dl ? (
          <div className={`cc-tool-out${dl.daysLeft < 0 ? " cc-bad" : dl.daysLeft <= 90 ? " cc-warn" : ""}`}>
            {dl.years} year{dl.years === 1 ? "" : "s"} to file. Deadline {dl.deadline.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, {dl.daysLeft < 0 ? "already passed" : `${dl.daysLeft} days left`}.
          </div>
        ) : <div className="cc-cue" style={{ marginTop: 0 }}>Pick the state and the crash date.</div>}
      </div>

      <div className="cc-rb-h">PNC's local time</div>
      <div className="cc-card">
        {local ? (
          <div className={`cc-tool-out${hour >= 0 && (hour < 8 || hour >= 21) ? " cc-warn" : ""}`}>
            {local} in {SOL.find((r) => r[0] === st)?.[1]}{hour >= 0 && (hour < 8 || hour >= 21) ? ". Outside 8 AM to 9 PM there, text instead of calling." : "."}
          </div>
        ) : <div className="cc-cue" style={{ marginTop: 0 }}>Pick the PNC's state above.</div>}
      </div>

      <div className="cc-rb-h">Agreement the PNC gets</div>
      <div className="cc-card"><div className="cc-tool-out">{agreement || "Pick the PNC's state above."}</div></div>

      {v.showFees && (
        <>
          <div className="cc-rb-h">The split, only if the PNC insists</div>
          <div className="cc-grp">
            {(v.fees || []).map((f: any) => <div key={f.k} className="cc-chk"><span className="cc-chk-k" style={{ width: "auto", flex: 1 }}>{f.k}</span><span className="cc-chk-v">{f.v}</span></div>)}
          </div>
        </>
      )}
    </div>
  );
}
