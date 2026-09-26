"use client";
// The live call screen. CallEngine holds the call (ported from the approved
// canvas); this wrapper owns the network: autosave, e-sign, texting, dispo.
// Rule from AGENTS.md: never show saved after a failed write. A failed
// autosave shows "Not saved. Retrying." in the header until it lands.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CallView from "./CallView";
import { CallEngine, type CallApi, type CallProps } from "@/lib/mva-call/engine";
import { callbackAt } from "@/lib/mva-call/dispo";

export interface ConsoleInit {
  leadId: string;
  callId: string | null;
  startedAt: number;
  props: Omit<CallProps, "startedAt" | "now">;
}

async function post(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new Error(d?.error || `That did not go through (${r.status}).`);
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
          via: s.send.via, phone: s.send.phone, email: s.send.email, city: s.story.city, today: todayMDY(),
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
          via: s.send.via, phone: s.send.phone, email: s.send.email, city: s.story.city, today: todayMDY(),
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
      home() { router.push("/calls"); },
      ask() { e().setState({ askOut: true }); },
    };
    eng.current = new CallEngine({ ...init.props, startedAt: init.startedAt }, api);
    lastSaved.current = JSON.stringify(eng.current.persistable());
  }
  const engine = eng.current;
  engine.onChange = () => bump((x) => x + 1);
  engine.props.now = now;

  async function loadComms() {
    try {
      const r = await fetch(`/api/calls/comms?lead_id=${encodeURIComponent(init.leadId)}`);
      const d = await r.json();
      if (!r.ok || d.error) return;
      const cur = engine.state.text;
      const serverBodies = new Set((d.texts || []).filter((m: any) => m.from === "us").map((m: any) => m.body));
      const pending = cur.thread.filter((m: any) => (m.status === "Sending" || m.status === "Sent") && !serverBodies.has(m.body));
      engine.setState({ text: { ...cur, thread: (d.texts || []).concat(pending) }, calls: d.calls || [] });
    } catch { /* the sheet keeps what it had; the next poll tries again */ }
  }

  async function save(snap: string): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true;
    try {
      const d = await post("/api/calls/save", { lead_id: init.leadId, call_id: callId.current, answers: JSON.parse(snap), mode: engine.state.bare ? "bare" : engine.state.free ? "free" : "guided" });
      callId.current = d.call_id || callId.current;
      lastSaved.current = snap;
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
  useEffect(() => { void loadComms(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    if (!s.text.open) return;
    void loadComms();
    const t = setInterval(() => { void loadComms(); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.text.open]);

  const v = engine.renderVals();
  return <CallView v={{ ...v, leadId: init.leadId }} />;
}
