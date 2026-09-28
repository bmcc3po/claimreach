"use client";
// The live call screen. CallEngine holds the call (ported from the approved
// canvas); this wrapper owns the network: autosave, e-sign, texting, dispo.
// Rule from AGENTS.md: never show saved after a failed write. A failed
// autosave shows "Not saved. Retrying." in the header until it lands.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CallView from "./CallView";
import DeskPanel, { type DeskTab, type PreviewInfo, type PhoneRow } from "./DeskPanel";
import { WsHelper } from "./IntakeWorkspace";
import { popOutDialer } from "./JustCallDialer";
import { stateCodeOf } from "@/lib/mva-call/state";
import { CallEngine, doiOf, type CallApi, type CallProps } from "@/lib/mva-call/engine";
import { callbackAt } from "@/lib/mva-call/dispo";

export interface ConsoleInit {
  leadId: string;
  callId: string | null;
  startedAt: number;
  /** Open the text sheet on arrival (from a text on the home screen). */
  openText?: boolean;
  /** This campaign has an agreement packet the preview can draw. */
  canPreview?: boolean;
  /** Firm lines for a 3-way (routing rules with a transfer number). */
  threeWay?: { label: string; number: string }[];
  props: Omit<CallProps, "startedAt" | "now">;
}

async function post(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new Error(d?.error || (r.status >= 500
    ? `The server did not answer (${r.status}). Nothing went out. Try again in a moment.`
    : `That did not go through (${r.status}).`));
  return d;
}

function todayMDY(): string {
  const t = new Date();
  return `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}/${t.getFullYear()}`;
}

export default function CallConsole({ init }: { init: ConsoleInit }) {
  const router = useRouter();
  const [, bump] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const callId = useRef<string | null>(init.callId);
  const eng = useRef<CallEngine | null>(null);
  const lastSaved = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  // Inbound texts already seen. Anything newer lights the badge.
  const seenInbound = useRef<number | null>(null);
  // Desktop: the call on the left, CarCure, texts, agreement and lead on the right.
  const [isDesk, setIsDesk] = useState(false);
  // iPad in landscape (or a narrower window): wide enough for three areas.
  // A touch screen gets the iPad layout even when it is as wide as a computer.
  const [wide, setWide] = useState(false);
  const [touch, setTouch] = useState(false);
  // When the last autosave landed, for "Saved at 2:14 PM" (never shown after a failed write).
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [deskTab, setDeskTabState] = useState<DeskTab>(init.openText ? "texts" : "know");
  const [focusLines, setFocusLines] = useState<{ key: string; n: number } | null>(null);
  const deskTextsOpen = useRef(false);
  const setDeskTab = (t: DeskTab) => { deskTextsOpen.current = t === "texts"; setDeskTabState(t); if (t === "texts") eng.current?.setState({ textUnread: 0 }); };

  if (!eng.current) {
    const e = (): CallEngine => eng.current!;
    const leadId = init.leadId;
    const api: CallApi = {
      sendAgreement() {
        const s = e().state;
        e().setState({ send: { ...s.send, status: "sending", error: "" } });
        post("/api/calls/esign", {
          lead_id: leadId, call_id: callId.current,
          signer_name: s.send.client, injured_name: s.send.who === "Someone else" ? s.send.injured : s.send.client,
          via: s.send.via, phone: s.send.phone, email: s.send.email, city: s.story.city, today: todayMDY(), doi: doiOf(s.story),
        }).then((d) => {
          e().setState({ send: { ...e().state.send, status: d.status || "sent", error: d.warning || "" } });
        }).catch((err) => {
          e().setState({ send: { ...e().state.send, status: "ready", error: err.message } });
        });
      },
      sendPax(i: number) {
        const s = e().state;
        const p = s.car.people[i] || {};
        const minor = p.age === "Under 18";
        const name = String(p.name || "").trim();
        if (!name) { e().setState({ file: { ...s.file, error: "Add the passenger's name on the Car step first." } }); return; }
        const mark = (v: string) => e().setState({ file: { ...e().state.file, pax: { ...e().state.file.pax, [i]: v } } });
        mark("sending");
        post("/api/calls/esign", {
          lead_id: leadId, call_id: callId.current, pax_index: i,
          signer_name: minor ? s.send.client : name, injured_name: name,
          via: s.send.via, phone: s.send.phone, email: s.send.email, city: s.story.city, today: todayMDY(), doi: doiOf(s.story),
        }).then(() => mark("sent")).catch((err) => {
          const pax = { ...e().state.file.pax }; delete pax[i];
          e().setState({ file: { ...e().state.file, pax, error: err.message } });
        });
      },
      completeAgreement() {
        const f = e().state.file;
        e().setState({ file: { ...f, error: "" } });
        post("/api/calls/esign/complete", { lead_id: leadId, dob: f.dob, ssn: f.ssn })
          .then(() => e().setState({ file: { ...e().state.file, agreement: "done", ssn: "", error: "" } }))
          .catch((err) => e().setState({ file: { ...e().state.file, error: err.message } }));
      },
      resendLink() {
        const t = e().state.text;
        post("/api/calls/esign/resend", { lead_id: leadId })
          .then(() => { e().setState({ text: { ...e().state.text, error: "" } }); loadComms(); })
          .catch((err) => e().setState({ text: { ...t, error: err.message } }));
      },
      sendText(body: string) {
        const t = e().state.text;
        e().setState({ text: { ...t, draft: "", error: "", thread: t.thread.concat([{ from: "us", body, status: "Sending" }]) } });
        post("/api/calls/text", { lead_id: leadId, body })
          .then(() => {
            const cur = e().state.text;
            e().setState({ text: { ...cur, thread: cur.thread.map((m: any) => (m.status === "Sending" && m.body === body ? { ...m, status: "Sent" } : m)) } });
            return loadComms();
          })
          .catch((err) => {
            const cur = e().state.text;
            e().setState({ text: { ...cur, draft: body, error: err.message, thread: cur.thread.filter((m: any) => !(m.status === "Sending" && m.body === body)) } });
          });
      },
      saveDispo() {
        const d = e().state.dispo;
        e().setState({ dispo: { ...d, saving: true, error: "" } });
        const at = callbackAt(d.when, d.at);
        flushSave().then(() => post("/api/calls/dispo", {
          lead_id: leadId, call_id: callId.current, dispo: d.pick, reasons: d.why,
          callback_at: at ? at.toISOString() : null, note: d.note,
          notify: d.pick === "signed" ? d.notify.filter((n: any) => n.on).map((n: any) => n.how) : [],
        })).then((r) => {
          const note = r.email_error ? `Saved. The email did not send: ${r.email_error}` : "";
          e().setState({ saved: true, dispo: { ...e().state.dispo, saving: false, saved: true, error: "", serverNote: note } });
        }).catch((err) => e().setState({ dispo: { ...e().state.dispo, saving: false, error: err.message } }));
      },
      home() { router.push("/app"); },
      ask(text: string) {
        const q = String(text || "").trim();
        if (!q) return;
        e().setState({ askOut: "busy" });
        post("/api/calls/ask", { lead_id: leadId, question: q, city: e().state.story.city })
          .then((d) => e().setState({ askOut: { answer: d.answer } }))
          .catch((err) => e().setState({ askOut: { error: err.message } }));
      },
    };
    eng.current = new CallEngine({ ...init.props, startedAt: init.startedAt }, api);
    lastSaved.current = JSON.stringify(eng.current.persistable());
  }
  const engine = eng.current;
  engine.onChange = () => bump((x) => x + 1);
  engine.props.now = now;

  // Each agent's view (Guided, Full Intake, Q&A) is remembered on their device
  // and used on the next call. Applied after the first paint so the server
  // render and the phone agree.
  const viewKey = `cr-call-view:${init.props.agentName || "me"}`;
  engine.onViewChange = (vw: string) => { try { localStorage.setItem(viewKey, vw); } catch { /* private mode */ } };
  useEffect(() => {
    try {
      const pref = localStorage.getItem(viewKey);
      if (pref && ["guided", "full", "chore"].includes(pref) && pref !== engine.state.view) engine.setView(pref);
    } catch { /* private mode */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Which layout. Full Intake: phone, iPad (three areas) or the desktop
  // workspace (three areas with the tools panel on the right). Simple
  // Chorelist is its own full-width form everywhere, so no panel beside it.
  // Same engine and the same answers in all of them.
  // One frame for every view (Guided, Collapsible, All questions): a computer
  // gets the caller on the left and the tools panel on the right, an iPad
  // sideways gets the caller and the helper, a phone gets one column.
  const v = engine.renderVals();
  const ws: "desk" | "ipad" | null = isDesk && !touch ? "desk" : wide ? "ipad" : null;
  const deskOn = ws === "desk";

  async function loadComms() {
    try {
      const r = await fetch(`/api/calls/comms?lead_id=${encodeURIComponent(init.leadId)}`);
      const d = await r.json();
      if (!r.ok || d.error) return;
      const cur = engine.state.text;
      const serverBodies = new Set((d.texts || []).filter((m: any) => m.from === "us").map((m: any) => m.body));
      const pending = cur.thread.filter((m: any) => (m.status === "Sending" || m.status === "Sent") && !serverBodies.has(m.body));
      const inbound = (d.texts || []).filter((m: any) => m.from === "them").length;
      const looking = cur.open || deskTextsOpen.current;
      if (seenInbound.current === null || looking) seenInbound.current = inbound;
      const unread = Math.max(0, inbound - (seenInbound.current ?? inbound));
      engine.setState({ text: { ...cur, thread: (d.texts || []).concat(pending) }, calls: d.calls || [], textUnread: looking ? 0 : unread });
    } catch { /* the sheet keeps what it had; the next poll tries again */ }
  }

  async function save(snap: string): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true;
    try {
      const d = await post("/api/calls/save", { lead_id: init.leadId, call_id: callId.current, answers: JSON.parse(snap), mode: engine.state.bare ? "bare" : engine.state.free ? "free" : "guided" });
      callId.current = d.call_id || callId.current;
      lastSaved.current = snap;
      setSavedAt(Date.now());
      if (engine.state.net?.saveError) engine.setState({ net: { saveError: "" } });
      return true;
    } catch (err: any) {
      engine.setState({ net: { saveError: "Not saved. Retrying." } });
      console.error("autosave failed", err?.message);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void save(JSON.stringify(engine.persistable())); }, 4000);
      return false;
    } finally {
      saving.current = false;
    }
  }

  async function flushSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snap = JSON.stringify(engine.persistable());
    if (snap !== lastSaved.current || !callId.current) await save(snap);
  }

  // Clock.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Autosave, debounced, on every change to the answers.
  const snapshot = JSON.stringify(engine.persistable());
  useEffect(() => {
    if (snapshot === lastSaved.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(snapshot); }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  // Leaving the page (or the phone locking) still lands the last answers.
  useEffect(() => {
    const flush = () => {
      const snap = JSON.stringify(engine.persistable());
      if (snap === lastSaved.current) return;
      const body = JSON.stringify({ lead_id: init.leadId, call_id: callId.current, answers: JSON.parse(snap) });
      try { navigator.sendBeacon("/api/calls/save", body); } catch { /* the debounced save already tried */ }
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live Sent / Opened / Signed while an agreement is out.
  const s = engine.state;
  const paxKey = JSON.stringify(s.file.pax || {});
  useEffect(() => {
    const waiting = ["sent", "opened"].includes(s.send.status) || Object.values(s.file.pax || {}).some((v: any) => v === "sent" || v === "opened");
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const q = new URLSearchParams({ lead_id: init.leadId, call_id: callId.current || "" });
        const r = await fetch(`/api/calls/esign?${q}`);
        const d = await r.json();
        if (!r.ok || d.error) return;
        const cur = engine.state;
        if (d.status && d.status !== "ready" && d.status !== cur.send.status) engine.setState({ send: { ...cur.send, status: d.status } });
        if (d.complete && cur.file.agreement === "open") engine.setState({ file: { ...engine.state.file, agreement: "done" } });
        if (d.pax && Object.keys(d.pax).length) engine.setState({ file: { ...engine.state.file, pax: { ...engine.state.file.pax, ...d.pax } } });
      } catch { /* next tick */ }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.send.status, paxKey]);

  // Texts: load once, then every 5 seconds while the sheet is open.
  useEffect(() => {
    if (init.openText) engine.setState({ text: { ...engine.state.text, open: true } });
    void loadComms();
    // While the sheet is closed, check every 15 seconds so a text from her lights the badge.
    const t = setInterval(() => { if (!engine.state.text.open) void loadComms(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!s.text.open) return;
    void loadComms();
    const t = setInterval(() => { void loadComms(); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.text.open]);

  // The text sheet opens on the newest text and follows new ones in.
  const threadLen = s.text.thread.length;
  useEffect(() => {
    if (!s.text.open) return;
    const body = document.querySelector(".cc-sheet .cc-compose")?.closest(".cc-sheet")?.querySelector(".cc-sheet-b") as HTMLElement | null;
    if (body) body.scrollTop = body.scrollHeight;
  }, [s.text.open, threadLen]);

  // Desktop or phone. The panel only mounts on a wide screen.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1180px)");
    const mw = window.matchMedia("(min-width: 1000px)");
    const mt = window.matchMedia("(hover: none) and (pointer: coarse)");
    const on = () => { setIsDesk(mq.matches); setWide(mw.matches); setTouch(mt.matches); };
    on();
    [mq, mw, mt].forEach((m) => m.addEventListener("change", on));
    return () => [mq, mw, mt].forEach((m) => m.removeEventListener("change", on));
  }, []);
  useEffect(() => {
    deskTextsOpen.current = deskOn && deskTab === "texts";
    // Arriving from a text on a desktop: the thread opens in the panel, not a sheet.
    if (deskOn && engine.state.text.open) { engine.setState({ text: { ...engine.state.text, open: false } }); setDeskTab("texts"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskOn, deskTab]);
  // Texts tab on screen: check every 5 seconds, same as the open sheet.
  useEffect(() => {
    if (!deskOn || deskTab !== "texts") return;
    void loadComms();
    const t = setInterval(() => { void loadComms(); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskOn, deskTab]);
  // Reaching Send on a desktop brings up the agreement preview.
  const phase = s.phase;
  useEffect(() => {
    if (deskOn && phase === "send" && init.canPreview) setDeskTab("retainer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskOn, phase]);
  // The desktop workspace opens its right side on the summary; leaving it puts CarCure back.
  useEffect(() => {
    if (ws === "desk" && deskTab === "know") setDeskTab("summary");
    if (ws !== "desk" && deskTab === "summary") setDeskTab("know");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);

  const preview = previewInfo(engine.state, init);
  const view: any = { ...v, leadId: init.leadId, previewHref: init.canPreview ? preview.href : null, onPreview: undefined, ws };
  // Autosave, said plainly. "Saving" while a change is on its way; a failed
  // write shows the engine's "Not saved. Retrying." instead, never "Saved".
  const pending = snapshot !== lastSaved.current;
  view.saveText = pending ? "Saving" : savedAt ? `Saved at ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  view.saveNow = () => {
    if (snapshot === lastSaved.current && callId.current && !engine.state.net?.saveError) { setSavedAt(Date.now()); return; }
    void flushSave();
  };
  if (deskOn) {
    view.openPhone = () => setDeskTab("phone");
    view.openText = () => setDeskTab("texts");
    view.openSheet = () => setDeskTab("know");
    view.openCommon = () => { setDeskTab("know"); setFocusLines({ key: "common", n: Date.now() }); };
    view.openRamble = () => { setDeskTab("know"); setFocusLines({ key: "ramble", n: Date.now() }); };
    view.onPreview = (ev: any) => { ev.preventDefault(); setDeskTab("retainer"); };
    view.openRetainer = () => setDeskTab("retainer");
    view.openFile = () => setDeskTab("file");
    view.openScripts = () => setDeskTab("know");
    view.textBadge = false;
  }
  // Slide the divider to give the call or the panel more room. Remembered per
  // computer; double-click puts it back.
  const deskRef = useRef<HTMLDivElement | null>(null);
  const DEFAULT_W = 900;
  // The width is saved under a new name since the call got its own left rail;
  // old saved widths were sized for the phone layout.
  const W_KEY = "cr-desk-call-w2";
  const setCallW = (w: number | null, save = false) => {
    const el = deskRef.current;
    if (!el) return;
    if (w == null) el.style.removeProperty("--call-w");
    else {
      // The panel keeps at least 360px (its column minimum) plus the 10px bar.
      const max = el.getBoundingClientRect().width - 372;
      const px = Math.round(Math.max(460, Math.min(max, w)));
      el.style.setProperty("--call-w", `${px}px`);
      if (save) { try { localStorage.setItem(W_KEY, String(px)); } catch { /* private mode */ } }
      return;
    }
    if (save) { try { localStorage.removeItem(W_KEY); } catch { /* private mode */ } }
  };
  useEffect(() => {
    if (!deskOn || ws) return;
    try { const w = Number(localStorage.getItem(W_KEY)); if (w > 0) setCallW(w); } catch { /* none saved */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskOn, ws]);
  // Wide enough, the call gets a left rail (caller, checks, steps) and the
  // question gets the middle. Narrow, it keeps the phone layout.
  useEffect(() => {
    const el = deskRef.current;
    const app = el?.querySelector(".cc-app") as HTMLElement | null;
    if (!deskOn || ws || !el || !app || typeof ResizeObserver === "undefined") { el?.classList.remove("cc-rail"); return; }
    const ro = new ResizeObserver(() => el.classList.toggle("cc-rail", app.getBoundingClientRect().width >= 760));
    ro.observe(app);
    return () => { ro.disconnect(); el.classList.remove("cc-rail"); };
  }, [deskOn, ws]);
  const startSlide = (ev: React.PointerEvent<HTMLDivElement>) => {
    const el = deskRef.current;
    if (!el) return;
    ev.preventDefault();
    const handle = ev.currentTarget;
    handle.setPointerCapture(ev.pointerId);
    el.classList.add("cc-sliding");
    const left = el.getBoundingClientRect().left;
    let last = 0;
    const move = (e: PointerEvent) => { last = e.clientX - left; setCallW(last); };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      el.classList.remove("cc-sliding");
      if (last) setCallW(last, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };
  const nudgeSlide = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    const cur = deskRef.current?.querySelector(".cc-app")?.getBoundingClientRect().width || DEFAULT_W;
    setCallW(cur + (ev.key === "ArrowRight" ? 32 : -32), true);
  };

  // Numbers for the dialer: her number first, then the firm lines for a 3-way.
  const herPhone = String(engine.state.send.phone || init.props.callerPhone || "").trim();
  const phones: PhoneRow[] = [
    ...(herPhone ? [{ label: v.callerFirst || "Caller", number: herPhone, pretty: prettyPhone(herPhone), kind: "caller" as const }] : []),
    ...(init.threeWay || []).map((t) => ({ label: t.label, number: t.number, pretty: prettyPhone(t.number), kind: "threeway" as const })),
  ];
  // Phone: the JustCall section at the top of the text sheet.
  view.phoneRows = phones;
  view.callOut = (n: string) => popOutDialer(n);
  view.copyNum = (n: string) => { try { navigator.clipboard.writeText(n); } catch { /* copy by hand */ } };

  const lead = init.props.lead ? { ...init.props.lead, name: engine.state.send.client || init.props.callerName, phone: init.props.callerPhone, email: init.props.callerEmail } : null;
  const fill = (t: string) => String(t || "").replace(/\{FIRM\}/g, init.props.firmSpoken).replace(/\{NAME\}/g, v.callerFirst || "");
  return (
    <div ref={deskRef} className={`cc-desk${deskOn ? " cc-desk-on ws-cockpit" : ""}`}>
      <CallView v={view} />
      {deskOn && !ws && (
        <div className="cc-split" role="separator" aria-orientation="vertical" aria-label="Drag to resize the call and the panel" tabIndex={0}
          title="Drag to resize. Double-click to reset."
          onPointerDown={startSlide} onKeyDown={nudgeSlide} onDoubleClick={() => setCallW(null, true)} />
      )}
      {deskOn && (
        <DeskPanel v={v} tab={deskTab} setTab={setDeskTab} phase={phase} fill={fill} lead={lead}
          summary={<WsHelper v={view} />}
          preview={init.canPreview ? preview : { href: null, checks: [{ label: "Agreement", value: "No agreement is set up for this campaign", ok: false }] }}
          focusLines={focusLines} phones={phones} leadId={init.leadId}
          story={{ city: String(engine.state.story.city || ""), crash: engine.crashDate() }} />
      )}
    </div>
  );
}

const AGREEMENT_LABEL: Record<string, string> = { TX: "Texas", FL: "Florida" };
const prettyPhone = (raw: string) => { const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw; };

// What the agreement will say, from the call so far. The same values the Send
// button hands DocuSeal, so the preview cannot disagree with what goes out.
function previewInfo(s: any, init: ConsoleInit): PreviewInfo {
  const signer = String(s.send.client || "").trim();
  const injured = s.send.who === "Someone else" ? String(s.send.injured || "").trim() : signer;
  const city = String(s.story.city || "").trim();
  const code = stateCodeOf(city);
  const today = todayMDY();
  const doi = doiOf(s.story);
  const agreement = code ? (AGREEMENT_LABEL[code] || "All other states (AL/GA)") : "";
  const viaText = s.send.via !== "Email";
  const to = viaText ? String(s.send.phone || "").trim() : String(s.send.email || "").trim();
  const checks: PreviewInfo["checks"] = [
    { label: "Agreement", value: agreement ? `${agreement}${code && !AGREEMENT_LABEL[code] ? `, wreck in ${code}` : ""}` : "Add the city and state on Story", ok: !!agreement },
    { label: "Signer", value: signer || "Add her full name on Send", ok: signer.split(/\s+/).filter(Boolean).length >= 2 },
    { label: "Injured person", value: injured || "Add the injured person's full name", ok: injured.split(/\s+/).filter(Boolean).length >= 2 },
    { label: "Date of the wreck", value: doi || "Add it on Story", ok: !!doi },
    { label: "Signing date", value: today, ok: true },
    { label: viaText ? "Text to" : "Email to", value: to ? (viaText ? prettyPhone(to) : to) : (viaText ? "Add her cell" : "Add her email"), ok: viaText ? to.replace(/\D/g, "").length >= 10 : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) },
    { label: "DOB and SSN", value: "Intake adds these after she signs", ok: false, later: true },
  ];
  if (!code || !signer) return { href: null, checks };
  const q = new URLSearchParams({ lead_id: init.leadId, signer, injured: injured || signer, city, today, doi });
  return { href: `/api/calls/esign/preview?${q}`, checks };
}
