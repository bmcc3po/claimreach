"use client";
// The case file stays beside the desktop intake and opens through Case tools
// on smaller screens. Every layout uses the same contact and document controls.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import LawRulerSyncSummary from "@/components/LawRulerSyncSummary";
import OwnerFirmDownload from "./OwnerFirmDownload";
import PropertyTreatmentHelp from "./PropertyTreatmentHelp";
import { matchingCoachingTopics } from "@/lib/property-treatment-coaching";
import { SIGNED_QA_RETURN_STATUS } from "@/lib/statuses";
import { REBS, REB_GROUPS, LINES } from "@/lib/mva-call/engine";
import JustCallDialer, { popOutDialer, type JustCallDialerHandle, type DialerState } from "./JustCallDialer";
import { SOL, stateCodeOf, injuryDeadline, STATE_TZ } from "@/lib/mva-call/state";

export type DeskTab = "summary" | "know" | "texts" | "phone" | "retainer" | "file" | "tools";
export interface PhoneRow { label: string; number: string; pretty: string; kind: "caller" | "threeway" }
interface FileNoteDraft { body: string; scope: string; saving: boolean; error: string }
const EMPTY_FILE_NOTE_DRAFT: FileNoteDraft = { body: "", scope: "call", saving: false, error: "" };

export interface PreviewInfo {
  href: string | null;
  checks: { label: string; value: string; ok: boolean; later?: boolean; spot?: string }[];
}

const PHASE_LABEL: Record<string, string> = { open: "Open", story: "Story", body: "Injury", car: "Car", money: "Money", send: "Send", file: "File", close: "Close" };

export default function DeskPanel({ v, tab, setTab, phase, fill, lead, preview, focusLines, phones, leadId, claimId, story, summary, caseSummary, onDialState, onCollapse, panelId }: {
  v: any;
  onCollapse?: () => void;
  panelId?: string;
  /** The JustCall dialer in the Phone tab: on a call, ringing, ready. */
  onDialState?: (s: DialerState) => void;
  /** The Full Intake workspace: next best action, what's missing, the live summary. */
  summary?: ReactNode;
  /** The current intake facts, displayed once in the case file. */
  caseSummary?: ReactNode;
  tab: DeskTab;
  setTab: (t: DeskTab) => void;
  phase: string;
  fill: (t: string) => string;
  lead: { from: string; said: string; tags: string[]; name?: string; phone?: string; email?: string } | null;
  preview: PreviewInfo;
  focusLines: { key: string; n: number } | null;
  phones: PhoneRow[];
  leadId: string;
  claimId: string;
  story: { city: string; crash: Date | null };
}) {
  // The dialer stays loaded once opened, so switching tabs never drops a call.
  const [phoneOn, setPhoneOn] = useState(false);
  const [dialState, setDialState] = useState<DialerState>("loading");
  const [moreOpen, setMoreOpen] = useState(false);
  // File contents unmount when another tool opens. Keep unsaved notes above
  // that boundary, scoped to their exact lead and matter while this Desk lives.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, FileNoteDraft>>({});
  const noteKey = `${leadId}:${claimId}`;
  const noteDraft = noteDrafts[noteKey] || EMPTY_FILE_NOTE_DRAFT;
  const updateNoteDraft = (update: (draft: FileNoteDraft) => FileNoteDraft) => setNoteDrafts((drafts) => ({
    ...drafts, [noteKey]: update(drafts[noteKey] || EMPTY_FILE_NOTE_DRAFT),
  }));
  const moreId = useId();
  const moreButton = useRef<HTMLButtonElement | null>(null);
  const dialer = useRef<JustCallDialerHandle | null>(null);
  useEffect(() => { if (tab === "phone") setPhoneOn(true); }, [tab]);
  const primaryTabs: [DeskTab, string][] = [["file", "File"], ["texts", "Texts"], ["phone", "Phone"]];
  const secondaryTabs: [DeskTab, string][] = [["know", "Scripts"], ["tools", "Tools"], ...(summary ? [["summary", "Helper"] as [DeskTab, string]] : [])];
  const activeSecondary = secondaryTabs.find(([key]) => key === tab)?.[1];
  const callActive = dialState === "on-call" || dialState === "ringing";
  const tabButton = ([key, label]: [DeskTab, string]) => (
    <button type="button" key={key} role="tab" aria-selected={tab === key} className={`cc-htab${tab === key ? " cc-on" : ""}`} onClick={() => {
      setTab(key); setMoreOpen(false);
      if (secondaryTabs.some(([secondaryKey]) => secondaryKey === key)) moreButton.current?.focus();
    }}>
      {label}{key === "texts" && v.textUnread > 0 && tab !== "texts" ? <span className="cc-side-dot">{v.textUnread}</span> : null}
      {key === "phone" && callActive ? <span className="cc-side-live" aria-label={dialState === "ringing" ? "Ringing" : "On a call"} /> : null}
    </button>
  );
  return (
    <aside className={`cc-side${summary ? " ws-side" : ""}`} aria-label="Command center">
      <div className="cc-side-top" onKeyDown={(event) => {
        if (event.key === "Escape" && moreOpen) { event.preventDefault(); setMoreOpen(false); moreButton.current?.focus(); }
      }}>
        <div className="cc-file-heading">
          <Icon name="files" size={22} />
          <div className="cc-file-heading-copy"><strong>Command center</strong><span>Calls, texts, tools &amp; delivery</span></div>
          {onCollapse && <button type="button" className="cc-command-collapse" aria-label="Collapse command center" title="Give the intake more space" aria-expanded="true" aria-controls={panelId} onClick={onCollapse}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8 6 6 6-6 6M19 4v16" /></svg>
          </button>}
        </div>
        <div className="cc-desk-nav">
          <div className="cc-htabs cc-primary-tabs" role="tablist" aria-label="Command center sections">
            {primaryTabs.map(tabButton)}
          </div>
          <button ref={moreButton} type="button" className={`cc-desk-more${activeSecondary ? " cc-on" : ""}`} aria-expanded={moreOpen} aria-controls={moreId} onClick={() => setMoreOpen((open) => !open)}>
            <span>{activeSecondary ? `More · ${activeSecondary}` : "More"}</span>
            {callActive && !moreOpen && <span className="cc-side-live" aria-label={dialState === "ringing" ? "Ringing" : "On a call"} />}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={moreOpen ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} /></svg>
          </button>
        </div>
        <div id={moreId} className="cc-htabs cc-secondary-tabs" role="tablist" aria-label="More command center sections" hidden={!moreOpen}>
          {secondaryTabs.map(tabButton)}
        </div>
      </div>
      {tab === "summary" && !!summary && <div className="cc-side-b ws-side-b">{summary}</div>}
      {tab === "know" && <Knowledge v={v} phase={phase} fill={fill} focusLines={focusLines} />}
      {tab === "texts" && <Texts v={v} />}
      {tab === "retainer" && <div className="cc-side-b"><button type="button" className="cc-btn" onClick={v.reviewAgreement}>Open client details and contract in intake</button></div>}
      {tab === "file" && <FileTab key={claimId} leadId={leadId} claimId={claimId} role={v.agentRole} lead={lead} canOpenClassic={v.agentRole === "owner"} canDownloadFirmPacket={["owner", "admin"].includes(v.agentRole)} caseSummary={caseSummary} noteDraft={noteDraft} updateNoteDraft={updateNoteDraft} sendHoldNotice={v.sendHoldNotice || ""} reconcileActions={v.reconcileActions || []} reconcileBusy={!!v.reconcileBusy} reconcileMessage={v.reconcileMessage || ""} onFinishOffice={v.reviewAgreement} beforeQaResubmit={v.beforeQaResubmit} onCorrect={v.reviewAgreement} />}
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
        <J id="kn-property-treatment" label="Property & treatment" />
        <J id="kn-ask" label="Ask CaseCure" cls=" cc-ask-j" />
        {now.length > 0 && <J id="kn-now" label="Right now" cls=" cc-gold" />}
        <span className="cc-kn-navh">Rebuttals</span>
        {REB_GROUPS.map((g: string) => <J key={g} id={slug(g)} label={g} />)}
        <span className="cc-kn-navh">Lines</span>
        {LINES.map((s: any) => <J key={s.head} id={slug("line " + s.head)} label={s.head} cls=" cc-line" />)}
      </nav>
      <div className="cc-kn-body">
        <input className="cc-field cc-kn-search" type="search" placeholder="Search scripts and talking points" aria-label="Search scripts and talking points" value={q} onChange={(e) => setQ(e.target.value)} />
        {matchingCoachingTopics(q).length > 0 && <div id="kn-property-treatment" data-spy="1"><PropertyTreatmentHelp compact query={q} /></div>}
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
        {term && !groups.length && !lineSecs.length && !matchingCoachingTopics(q).length && <div className="cc-cue" style={{ textAlign: "center" }}>Nothing matches. Try Ask CaseCure above.</div>}
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
            <div>{m.body}</div>{(m.when || m.hasStatus) && <div className="cc-bub-s">{[m.when, m.status].filter(Boolean).join(" · ")}</div>}
          </div>
        ))}
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
  return isNaN(t.getTime()) ? "" : t.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
};

// The file: status, agreements, notes, documents and history, without leaving
// the call. Loads when the tab opens.
function FileTab({ leadId, claimId, role, lead, canOpenClassic, canDownloadFirmPacket, caseSummary, noteDraft, updateNoteDraft, sendHoldNotice, reconcileActions, reconcileBusy, reconcileMessage, onCorrect, onFinishOffice, beforeQaResubmit }: { leadId: string; claimId: string; role?: string; lead: { from: string; said: string; tags: string[] } | null; canOpenClassic: boolean; canDownloadFirmPacket: boolean; caseSummary?: ReactNode; noteDraft: FileNoteDraft; updateNoteDraft: (update: (draft: FileNoteDraft) => FileNoteDraft) => void; sendHoldNotice: string; reconcileActions: { label: string; go: () => void }[]; reconcileBusy: boolean; reconcileMessage: string; onCorrect: () => void; onFinishOffice?: () => void; beforeQaResubmit?: () => Promise<boolean> }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const noteInput = useRef<HTMLTextAreaElement | null>(null);
  const { body: note, scope, saving } = noteDraft;
  const [qaBusy, setQaBusy] = useState(false);
  const [qaMessage, setQaMessage] = useState("");
  const qaRequest = useRef<{ review: string; id: string } | null>(null);
  const qaInFlight = useRef(false);
  const load = async () => {
    try {
      const r = await fetch(`/api/calls/file?lead_id=${encodeURIComponent(leadId)}&claim_id=${encodeURIComponent(claimId)}`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "The file did not load.");
      setD(j); setErr("");
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId, claimId]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.leadId === leadId && detail.claimId === claimId) void load();
    };
    window.addEventListener("cr:agreement-reviewed", refresh);
    window.addEventListener("cr:voided", refresh);
    return () => { window.removeEventListener("cr:agreement-reviewed", refresh); window.removeEventListener("cr:voided", refresh); };
  }, [leadId, claimId]); // eslint-disable-line react-hooks/exhaustive-deps
  const addNote = async () => {
    const body = note.trim();
    if (!body || saving) return;
    updateNoteDraft((draft) => ({ ...draft, saving: true, error: "" }));
    try {
      const r = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: claimId, scope, body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "The note did not save.");
      updateNoteDraft((draft) => ({ ...draft, body: draft.body === note && draft.scope === scope ? "" : draft.body, saving: false, error: "" }));
      await load();
    } catch (e: any) { updateNoteDraft((draft) => ({ ...draft, saving: false, error: e.message || "The note did not save." })); }
  };
  const resubmitQa = async () => {
    if (qaInFlight.current || !d?.qa_return?.id || (d?.status?.key !== SIGNED_QA_RETURN_STATUS && !(d?.status?.key === "signed_qa" && d.qa_resubmit_retry))) return;
    qaInFlight.current = true; setQaBusy(true); setQaMessage(""); setErr("");
    try {
      if (!beforeQaResubmit || !(await beforeQaResubmit())) throw new Error("Corrections did not finish saving. Resolve the save error before resubmitting.");
      if (d.qa_resubmit_retry?.qa_review_id === d.qa_return.id) qaRequest.current = { review: d.qa_return.id, id: d.qa_resubmit_retry.request_id };
      const priorRequest = qaRequest.current;
      const request = priorRequest && priorRequest.review === d.qa_return.id ? priorRequest : { review: d.qa_return.id, id: crypto.randomUUID() };
      qaRequest.current = request;
      const r = await fetch("/api/calls/qa/resubmit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: claimId, qa_review_id: d.qa_return.id, request_id: request.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok || j.error) throw new Error(j.error || "The matter was not resubmitted. Retry this action.");
      setD((current: any) => ({ ...current, status: { ...current.status, key: "signed_qa" }, qa_return: null, qa_resubmit_retry: null }));
      setQaMessage("Resubmitted to QA. Your signed agreement and history are preserved.");
      await load();
    } catch (e: any) { setErr(e.message || "The matter was not resubmitted."); }
    finally { qaInFlight.current = false; setQaBusy(false); }
  };
  if (!d) return <div className="cc-side-b">{err ? <div className="cc-cue cc-red">{err}</div> : <div className="cc-cue" style={{ textAlign: "center", marginTop: 24 }}>Loading the file</div>}</div>;
  const L = d.lead || {};
  const activeAgreement = d.agreements.find((a: any) => a.pax == null && !a.voided);
  const replacementHold = d.agreements.some((a: any) => a.pax == null && a.replacement_requested_at && !a.voided);
  const awaitingOfficeSigner = !sendHoldNotice && !!activeAgreement && activeAgreement.status === "signed" && !!activeAgreement.agent_reviewed_at && !replacementHold;
  const row = (k: string, val: any) => (val ? <div className="cc-chk" key={k}><span className="cc-chk-k">{k}</span><span className="cc-chk-v">{val}</span></div> : null);
  const SCOPES: [string, string][] = [["call", "Call"], ["plaintiff", "PNC"], ["case", "Case"], ["file", "File"]];
  return (
    <div className="cc-side-b">
      {err && <div className="cc-cue cc-red" style={{ marginTop: 0 }}>{err}</div>}
      {canDownloadFirmPacket && <OwnerFirmDownload leadId={leadId} claimId={claimId} compact />}
      {!!sendHoldNotice && <div className="cc-stop" role="status"><strong>{sendHoldNotice.startsWith("Send outcome unconfirmed") ? "Send outcome unconfirmed" : "Signing actions paused"}</strong><p>{sendHoldNotice}</p><span className="cc-cue">Existing signed copies and history remain available below. The owner must reconcile the send before another link or office completion.</span>{reconcileActions.map((action) => <button type="button" key={action.label} className="cc-btn" disabled={reconcileBusy} onClick={action.go}>{reconcileBusy ? "Checking" : action.label}</button>)}{!!reconcileMessage && <p>{reconcileMessage}</p>}</div>}
      {qaMessage && <div className="cc-cue" role="status">{qaMessage}</div>}
      {(d.status?.key === SIGNED_QA_RETURN_STATUS || (d.status?.key === "signed_qa" && d.qa_resubmit_retry)) && <div className="cc-card">
        <div className="cc-card-h">{d.qa_resubmit_retry ? "QA resubmission needs a retry" : "Returned by QA"}</div>
        <p className="cc-cue" style={{ whiteSpace: "pre-wrap" }}>{d.qa_return?.note || "QA feedback is unavailable. Refresh this file before resubmitting."}</p>
        <button type="button" className="cc-btn cc-full" disabled={qaBusy || !d.qa_return?.id || !!sendHoldNotice} onClick={resubmitQa}>{qaBusy ? "Saving and resubmitting" : d.qa_resubmit_retry ? "Finish QA resubmission" : "Resubmit to QA"}</button>
      </div>}
      {caseSummary}
      <div className="cc-file-quick-actions">
        <a className="cc-chip cc-sm" href={`/app/${encodeURIComponent(L.lead_no || leadId)}/print?claim=${encodeURIComponent(claimId)}`}>Print or email</a>
        <button type="button" className="cc-chip cc-sm" onClick={() => {
          noteInput.current?.focus({ preventScroll: true });
          noteInput.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}>Add note</button>
      </div>
      {onFinishOffice && <button type="button" className="cc-chip" onClick={onFinishOffice}>Edit client details and contract in intake</button>}
      <LawRulerSyncSummary imported={d.imported} ownerApproved={d.owner_confirmed_delivery} />
      <div className="cc-grp">
        {row("Lead number", L.lead_no)}
        {row("Case", L.campaign)}
        {row("Attorney", L.attorney)}
        {row("Opened", fmtWhen(L.opened))}
        {row("Source", L.source)}
        {L.lawruler && <div className="cc-chk"><span className="cc-chk-k">LawRuler</span><span className="cc-chk-v">{L.lawruler_url ? <a href={L.lawruler_url} target="_blank" rel="noopener">{L.lawruler}</a> : L.lawruler}</span></div>}
      </div>

      <LeadCard lead={lead} />

      <div className="cc-rb-h">Agreements</div>
      {d.agreements.length === 0 ? <div className="cc-cue" style={{ margin: "0 4px" }}>{d.owner_confirmed_delivery ? "Signed agreement confirmed by owner. Original files are under Documents." : "Nothing sent yet."}</div> : (
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
              {a.replacement_requested_at && !a.voided && <div className="cc-cue cc-red" role="status">Supervisor review required since {fmtWhen(a.replacement_requested_at)}. {a.replacement_requested_by || "An agent"} reported: {a.replacement_reason}. The original signed evidence stays on file; firm delivery is held.</div>}
              {a.client_signed_url && <div className="cc-chips cc-list" style={{ marginTop: 8 }}><a className="cc-chip cc-sm" href={a.client_signed_url} target="_blank" rel="noopener noreferrer">{a.status === "voided" ? "Original client-signed preview (voided)" : "View client-signed preview"}</a><span className="cc-cue">{a.status === "voided" ? "Historical signed evidence is preserved." : "Client signed; office signer and final certificate are pending. Inspect this preview before finishing or correcting."}</span>{a.status === "signed" && !a.agent_reviewed_at && !a.replacement_requested_at && <button type="button" className="cc-chip cc-sm" onClick={onFinishOffice}>Review signed copy in intake</button>}{a.agent_reviewed_at && <span className="cc-cue">Reviewed {fmtWhen(a.agent_reviewed_at)} by {a.agent_reviewed_by || "staff"}</span>}{a.status === "signed" && a.agent_reviewed_at && !a.replacement_requested_at && <button type="button" className="cc-chip cc-sm" onClick={onCorrect}>Report error / send corrected agreement</button>}</div>}
            </div>
          ))}
        </div>
      )}

      {awaitingOfficeSigner && onFinishOffice && <div className="cc-card"><div className="cc-card-h">Next: finish the retainer</div><p className="cc-cue">Review recorded. Check DOB and SSN in Retainer, then complete the office step.</p><button type="button" className="cc-btn cc-full" onClick={onFinishOffice}>Continue to office completion</button></div>}
      {/\bMVA\b/i.test(String(L.campaign || "")) && <FirmHandoff leadId={leadId} claimId={claimId}
        awaitingOfficeSigner={awaitingOfficeSigner}
        hasSignedPacket={(() => { const active = d.agreements.find((a: any) => a.pax == null && !a.voided); return !sendHoldNotice && !!active && active.status === "completed" && !!active.agent_reviewed_at && !!active.signed_url && !!active.cert_url && !d.agreements.some((a: any) => a.pax == null && a.replacement_requested_at && !a.voided); })()} />}

      <div className="cc-rb-h">Notes</div>
      <div className="cc-card">
        <div className="cc-chips cc-seg">{SCOPES.map(([k, label]) => <button key={k} className={`cc-chip${scope === k ? " cc-on" : ""}`} onClick={() => updateNoteDraft((draft) => ({ ...draft, scope: k }))}>{label}</button>)}</div>
        <textarea ref={noteInput} className="cc-area" rows={2} placeholder="Add a note to the file" aria-label="Add a note" value={note} onChange={(e) => { const body = e.target.value; updateNoteDraft((draft) => ({ ...draft, body })); }} />
        <button className="cc-btn cc-full" disabled={saving || !note.trim()} onClick={addNote}>{saving ? "Saving" : "Save note"}</button>
        {noteDraft.error && <div className="cc-cue cc-red" role="alert">{noteDraft.error}</div>}
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
                <span className="cc-lrow-main"><span className="cc-lrow-n" style={{ fontSize: 15 }}>{x.name}</span><span className="cc-lrow-s">{[x.scope, x.type, x.by].filter(Boolean).join(", ")}</span></span>
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
      {canOpenClassic && d.classic && <a className="cc-cue" style={{ margin: "4px", textAlign: "center" }} href={`/leads/${encodeURIComponent(L.lead_no || leadId)}?claim=${encodeURIComponent(claimId)}`}>Open full case record</a>}
    </div>
  );
}

function FirmHandoff({ leadId, claimId, hasSignedPacket, awaitingOfficeSigner }: { leadId: string; claimId: string; hasSignedPacket: boolean; awaitingOfficeSigner: boolean }) {
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const q = new URLSearchParams({ lead_id: leadId, claim_id: claimId });
      const response = await fetch(`/api/firm-delivery?${q}`);
      const next = await response.json();
      if (!response.ok || next.error) throw new Error(next.error || "Could not check firm delivery.");
      if (next.claim_id !== claimId) throw new Error("Delivery state belongs to another matter. Refresh the file.");
      setState(next); setError("");
    } catch (e: any) { setState(null); setError(e?.message || "Could not check firm delivery."); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId, claimId]);
  useEffect(() => {
    const onRecovered = (event: Event) => { const detail = (event as CustomEvent).detail || {}; if (detail.leadId === leadId && detail.claimId === claimId) void load(); };
    window.addEventListener("cr:esign-reconciled", onRecovered);
    return () => window.removeEventListener("cr:esign-reconciled", onRecovered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, claimId]);
  const dispatchPending = ["sending", "uncertain"].includes(state?.dispatch?.state);
  const sent = !!state?.confirmed_firm_sent_at;
  const send = async () => {
    const delivery = state?.delivery;
    if (!hasSignedPacket || sent || dispatchPending || !delivery?.to || !delivery?.firm || busy) return;
    const cc = Array.isArray(delivery.cc) && delivery.cc.length ? `\nCC: ${delivery.cc.join(", ")}` : "";
    if (!window.confirm(`Send this matter's signed packet to ${delivery.firm}?\nTo: ${delivery.to}${cc}\n\nReview the signed agreement and audit trail above before sending.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/firm-delivery", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, claim_id: claimId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || result.skipped) throw new Error(result.error || result.skipped || "Firm delivery failed.");
      setMessage(`Sent to ${result.to || delivery.firm}. ${result.warning || ""}`.trim());
      await load();
    } catch (e: any) { setMessage(e?.message || "Firm delivery failed. Check its status before trying again."); await load(); }
    finally { setBusy(false); }
  };
  return <div className="cc-card">
    <div className="cc-card-h">Firm handoff</div>
    {error ? <div className="cc-cue cc-red">{error} Sending is unavailable until the state loads.</div>
      : !state ? <div className="cc-cue">Checking this matter's delivery state…</div>
      : <>
        <div className="cc-cue">{state.delivery?.firm || "Firm not configured"}{state.delivery?.to ? ` · ${state.delivery.to}` : " · recipient missing"}</div>
        {sent ? <div className="cc-cue">Sent to the firm {fmtWhen(state.confirmed_firm_sent_at)}.</div>
          : state.owner_confirmed_delivery ? <div className="cc-cue">Signed — sent to firm. Confirmed by owner; original delivery date unknown.</div>
          : state.prior_owner_only ? <div className="cc-cue cc-red">Earlier delivery reached Brett only. The firm has not received this packet. Finish the handoff in the center after the call.</div>
          : dispatchPending ? <div className="cc-cue cc-red">The last delivery outcome needs owner review. Do not resend.</div>
          : !hasSignedPacket ? <div className="cc-cue">{awaitingOfficeSigner
            ? "The client signed. Check DOB and securely saved SSN in Retainer, then complete the office step. The signed PDF and audit trail must be stored before delivery."
            : "A completed signed agreement and audit trail are required before handoff."}</div>
          : <div className="cc-cue">After the call disposition, review your file and send the complete packet from the final step in the center intake panel.</div>}
      </>}
    {message && <div role="status" className="cc-cue">{message}</div>}
  </div>;
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
