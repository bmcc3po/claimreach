"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { IngestResult, PlaybookHitId, TurnFile, TurnRole, WhyKey } from "@/lib/turn/types";
import { loadSeedFile, personByRole, primaryCarrier } from "@/lib/turn/seed";
import { classifyWhy } from "@/lib/turn/classify";
import { answerAsk, assignTask, landFile, queueLorResend, trySendSms } from "@/lib/turn/land";
import { TurnChrome, CallBar } from "./TurnChrome";
import { AdjusterScreen, IngestScreen, KeepScreen, PaintScreen, ScreamScreen, WhyScreen } from "./TurnScreens";

type View = "why" | "scream" | "adjuster" | "paint" | "ingest" | "keep";

const STORE = "claimturn.v2.";

function readStore(id: string): TurnFile | null {
  try {
    const raw = localStorage.getItem(STORE + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.id !== id) return null;
    return parsed as TurnFile;
  } catch {
    return null;
  }
}

function writeStore(file: TurnFile) {
  try { localStorage.setItem(STORE + file.id, JSON.stringify(file)); } catch { /* demo */ }
}

function roleForWhy(why: WhyKey | null): TurnRole {
  if (why === "adjuster" || why === "records") return "paralegal";
  return "attorney";
}

function viewForWhy(why: WhyKey): View {
  if (why === "client_phone") return "scream";
  if (why === "adjuster") return "adjuster";
  return "paint";
}

export default function TurnFileApp({ fileId }: { fileId: string }) {
  const router = useRouter();
  const seed = useMemo(() => loadSeedFile(fileId), [fileId]);
  const [file, setFile] = useState<TurnFile | null>(seed);
  const [why, setWhy] = useState<WhyKey | null>(null);
  const [view, setView] = useState<View>("why");
  const [role, setRole] = useState<TurnRole>("attorney");
  const [text, setText] = useState("");
  const [result, setResult] = useState<IngestResult | null>(null);
  const [armed, setArmed] = useState<PlaybookHitId[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [smsNote, setSmsNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(42);

  useEffect(() => {
    if (!seed) return;
    const saved = readStore(fileId);
    if (saved) {
      setFile(saved);
      if (saved.landed) setView("keep");
    }
  }, [fileId, seed]);

  useEffect(() => {
    if (view !== "scream") return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [view]);

  if (!seed || !file) {
    return (
      <div className="turn">
        <TurnChrome role="attorney" />
        <div className="turn-wrap">
          <h1 className="turn-h1">No file</h1>
          <p className="turn-sub">This demo only seeds Samuel Ortiz.</p>
          <button type="button" className="turn-btn" onClick={() => router.push("/turn")}>Back to desk</button>
        </div>
      </div>
    );
  }

  const live = file;

  function persist(next: TurnFile) {
    setFile(next);
    writeStore(next);
  }

  function reset() {
    localStorage.removeItem(STORE + fileId);
    setFile(seed);
    setWhy(null);
    setView("why");
    setText("");
    setResult(null);
    setArmed([]);
    setErr(null);
    setSmsNote(null);
    setRole("attorney");
  }

  function pickWhy(w: WhyKey) {
    setWhy(w);
    setRole(roleForWhy(w));
    setView(viewForWhy(w));
  }

  async function runIngest(fromText?: string, whyHint?: WhyKey | null) {
    const body = (fromText ?? text).trim();
    const hinted = whyHint ?? why;
    if (!body && !hinted) {
      setErr("Type it or pick why.");
      return;
    }
    const classified = classifyWhy(body, hinted);
    setWhy(classified);
    setRole(roleForWhy(classified));
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/turn/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: live.id, why: classified, text: body, file: live }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Ingest failed."); return; }
      setResult(d as IngestResult);
      setArmed([]);
      setView("ingest");
    } catch {
      setErr("Ingest failed.");
    } finally {
      setBusy(false);
    }
  }

  function land() {
    if (!result) { setErr("Ingest first. Nothing lands until then."); return; }
    const next = landFile({ file: live, note: result.note, patch: result.patch, armedHits: armed });
    persist(next);
    setView("keep");
  }

  const client = personByRole(file, "client");
  const adjuster = personByRole(file, "adjuster");
  const carrier = primaryCarrier(file);
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="turn">
      <TurnChrome
        role={role}
        onRole={setRole}
        onReset={reset}
        rightNote={view === "keep" ? `KEEP · Ortiz ${file.fileNo} · after ingest` : undefined}
      />
      {view === "scream" && (
        <CallBar
          tone="red"
          title={`CLIENT ON THE LINE · ${clock}`}
          detail={`${client ? `${client.firstName} ${client.lastName}` : "Client"} · ${client?.phone || ""} · bolt-on · JustCall matched this file`}
          stayLabel="Save and stay"
          endLabel="End call"
          onStay={() => { void runIngest(text, why || "client_phone"); }}
          onEnd={() => { void runIngest(text, why || "client_phone"); }}
        />
      )}
      {view === "adjuster" && (
        <CallBar
          tone="orange"
          title="ON A CALL · 11:42"
          detail={`${carrier?.name} · ${adjuster ? `${adjuster.firstName} ${adjuster.lastName}` : "Adjuster"} · ${adjuster?.phone || ""} · claim ${carrier?.claimNo || ""}`}
          stayLabel="Save note"
          endLabel="End call"
          onStay={() => void runIngest(text, why || "adjuster")}
          onEnd={() => void runIngest(text, why || "adjuster")}
        />
      )}
      {view === "ingest" && (
        <CallBar
          tone="orange"
          title={`ON A CALL · ${why === "client_phone" ? clock : "11:42"}`}
          detail={why === "adjuster"
            ? `${carrier?.name} · ${adjuster ? `${adjuster.firstName} ${adjuster.lastName}` : ""} · claim ${carrier?.claimNo} · Ortiz ${file.fileNo}`
            : `${client ? `${client.firstName} ${client.lastName}` : ""} · ${file.fileNo}`}
          stayLabel="Ingest"
          endLabel="Land on file"
          onStay={() => void runIngest()}
          onEnd={land}
        />
      )}

      {view === "why" && (
        <WhyScreen
          file={file}
          why={why}
          text={text}
          busy={busy}
          err={err}
          onWhy={pickWhy}
          onText={setText}
          onTell={() => { void runIngest(text, why); }}
        />
      )}
      {view === "scream" && (
        <ScreamScreen file={file} note={text} busy={busy} onNote={setText} onIngest={() => void runIngest(text, why || "client_phone")} />
      )}
      {view === "adjuster" && (
        <AdjusterScreen file={file} note={text} busy={busy} onNote={setText} onIngest={() => void runIngest(text, why || "adjuster")} />
      )}
      {view === "paint" && why && (
        <PaintScreen file={file} why={why} busy={busy} onIngest={() => void runIngest(text, why)} onBack={() => setView("why")} />
      )}
      {view === "ingest" && (
        <IngestScreen
          file={file}
          text={text}
          onText={setText}
          result={result}
          armed={armed}
          busy={busy}
          err={err}
          onIngest={() => void runIngest()}
          onToggle={(id) => setArmed((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])}
          onLand={land}
        />
      )}
      {view === "keep" && (
        <KeepScreen
          file={file}
          smsNote={smsNote}
          onAsk={(k, v) => persist(answerAsk(live, k, v))}
          onAssign={(id) => persist(assignTask(live, id))}
          onQueueLor={() => persist(queueLorResend(live))}
          onSendSms={() => {
            const out = trySendSms(live);
            persist(out.file);
            setSmsNote(out.reason);
          }}
        />
      )}
    </div>
  );
}
